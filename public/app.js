const sourceTabsEl = document.getElementById('sourceTabs');
const addSourceBtn = document.getElementById('addSourceBtn');
const entriesEl = document.getElementById('entries');
const breadcrumbEl = document.getElementById('breadcrumb');
const recentSection = document.getElementById('recentSection');
const recentStrip = document.getElementById('recentStrip');

const viewerEl = document.getElementById('viewer');
const videoPlayer = document.getElementById('videoPlayer');
const imageWrap = document.getElementById('imageWrap');
const imagePlayer = document.getElementById('imagePlayer');
const viewerTitle = document.getElementById('viewerTitle');
const resumeToast = document.getElementById('resumeToast');
const closeViewerBtn = document.getElementById('closeViewer');
const prevImageBtn = document.getElementById('prevImage');
const nextImageBtn = document.getElementById('nextImage');

const modal = document.getElementById('addSourceModal');
const closeModalBtn = document.getElementById('closeModal');
const localForm = document.getElementById('localForm');
const ftpForm = document.getElementById('ftpForm');

let allSources = [];
let currentSourceId = null;
let currentDir = '';
let recentByKey = new Map(); // `${sourceId}::${path}` -> recent row
let currentImages = [];
let currentImageIndex = -1;
let currentVideoFile = null;
let progressTimer = null;

function mediaUrl(sourceId, relPath) {
  return `/media?sourceId=${sourceId}&path=${encodeURIComponent(relPath)}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---- Sources ---------------------------------------------------------------

async function loadSources({ selectId } = {}) {
  const res = await fetch('/api/sources');
  allSources = await res.json();
  renderSourceTabs();

  if (!allSources.length) {
    currentSourceId = null;
    entriesEl.innerHTML = '<div class="empty">No sources yet. Click "+ Source" to add a folder or connect to your phone over FTP.</div>';
    breadcrumbEl.innerHTML = '';
    recentSection.classList.add('hidden');
    return;
  }

  const wanted = selectId || currentSourceId || Number(localStorage.getItem('vidviewer:lastSource'));
  currentSourceId = allSources.some((s) => s.id === wanted) ? wanted : allSources[0].id;
  if (selectId) currentDir = '';
  localStorage.setItem('vidviewer:lastSource', currentSourceId);
  renderSourceTabs();
  await loadRecent();
  await loadDir(currentDir);
}

function renderSourceTabs() {
  sourceTabsEl.innerHTML = '';
  for (const source of allSources) {
    const tab = document.createElement('div');
    tab.className = 'source-tab' + (source.id === currentSourceId ? ' active' : '');
    tab.innerHTML = `<span>${source.type === 'ftp' ? '\u{1F4F1}' : '\u{1F4C1}'} ${escapeHtml(source.name)}</span><span class="remove" title="Remove source">&times;</span>`;
    tab.querySelector('span:first-child').onclick = () => {
      currentSourceId = source.id;
      localStorage.setItem('vidviewer:lastSource', currentSourceId);
      renderSourceTabs();
      loadDir('');
    };
    tab.querySelector('.remove').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove source "${source.name}"? This also clears its watch history.`)) return;
      await fetch('/api/sources/' + source.id, { method: 'DELETE' });
      if (currentSourceId === source.id) currentSourceId = null;
      loadSources();
    };
    sourceTabsEl.appendChild(tab);
  }
}

// ---- Add source modal --------------------------------------------------

addSourceBtn.onclick = () => modal.classList.remove('hidden');
closeModalBtn.onclick = () => modal.classList.add('hidden');
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    localForm.classList.toggle('hidden', btn.dataset.type !== 'local');
    ftpForm.classList.toggle('hidden', btn.dataset.type !== 'ftp');
  };
});

localForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('localError');
  errorEl.textContent = '';
  const data = new FormData(localForm);
  const res = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'local', name: data.get('name'), rootPath: data.get('rootPath') }),
  });
  const body = await res.json();
  if (!res.ok) { errorEl.textContent = body.error || 'Failed to add source'; return; }
  localForm.reset();
  modal.classList.add('hidden');
  loadSources({ selectId: body.id });
});

ftpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('ftpError');
  errorEl.textContent = 'Connecting…';
  const data = new FormData(ftpForm);
  const res = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'ftp',
      name: data.get('name'),
      host: data.get('host'),
      port: data.get('port'),
      username: data.get('username'),
      password: data.get('password'),
      secure: data.get('secure') === 'on',
      basePath: data.get('basePath') || '/',
    }),
  });
  const body = await res.json();
  if (!res.ok) { errorEl.textContent = body.error || 'Failed to add source'; return; }
  errorEl.textContent = '';
  ftpForm.reset();
  modal.classList.add('hidden');
  loadSources({ selectId: body.id });
});

// ---- Browsing ---------------------------------------------------------

async function loadDir(dir) {
  currentDir = dir;
  const res = await fetch(`/api/list?sourceId=${currentSourceId}&dir=${encodeURIComponent(dir)}`);
  if (!res.ok) {
    entriesEl.innerHTML = '<div class="empty">Could not open this folder.</div>';
    return;
  }
  const data = await res.json();
  renderBreadcrumb(data.dir);
  renderEntries(data);
  history.replaceState(null, '', `?sourceId=${currentSourceId}&dir=${encodeURIComponent(data.dir)}`);
}

function renderBreadcrumb(dir) {
  breadcrumbEl.innerHTML = '';
  const homeLink = document.createElement('a');
  homeLink.textContent = 'Home';
  homeLink.onclick = () => loadDir('');
  breadcrumbEl.appendChild(homeLink);

  if (!dir) return;
  const parts = dir.split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc = acc ? acc + '/' + part : part;
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = ' / ';
    breadcrumbEl.appendChild(sep);

    const link = document.createElement('a');
    link.textContent = part;
    const target = acc;
    link.onclick = () => loadDir(target);
    breadcrumbEl.appendChild(link);
  }
}

function renderEntries(data) {
  entriesEl.innerHTML = '';

  if (!data.folders.length && !data.files.length) {
    entriesEl.innerHTML = '<div class="empty">No folders, videos, or images here.</div>';
    return;
  }

  for (const folder of data.folders) {
    const el = document.createElement('div');
    el.className = 'entry';
    el.innerHTML = `<div class="icon">&#128193;</div><div class="name">${escapeHtml(folder.name)}</div>`;
    el.onclick = () => loadDir(folder.path);
    entriesEl.appendChild(el);
  }

  const imageFiles = data.files.filter((f) => f.type === 'image');

  for (const file of data.files) {
    const el = document.createElement('div');
    el.className = 'entry';

    if (file.type === 'video') {
      const progress = recentByKey.get(`${currentSourceId}::${file.path}`);
      const bar = progress && progress.duration
        ? `<div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, (progress.position / progress.duration) * 100)}%"></div></div>`
        : '';
      el.innerHTML = `<div class="icon">&#127916;</div>${bar}<div class="name">${escapeHtml(file.name)}</div>`;
      el.onclick = () => openVideo(file);
    } else {
      el.innerHTML = `<img class="thumb" loading="lazy" src="${mediaUrl(currentSourceId, file.path)}"><div class="name">${escapeHtml(file.name)}</div>`;
      el.onclick = () => openImage(imageFiles, imageFiles.findIndex((f) => f.path === file.path));
    }

    entriesEl.appendChild(el);
  }
}

// ---- Recently played / continue watching -------------------------------

async function loadRecent() {
  const res = await fetch('/api/recent');
  const rows = await res.json();
  recentByKey = new Map(rows.map((r) => [`${r.sourceId}::${r.path}`, r]));

  recentStrip.innerHTML = '';
  if (!rows.length) {
    recentSection.classList.add('hidden');
    return;
  }
  recentSection.classList.remove('hidden');

  for (const row of rows) {
    const card = document.createElement('div');
    card.className = 'recent-card';
    const pct = row.duration ? Math.min(100, (row.position / row.duration) * 100) : 0;
    card.innerHTML = `
      <div class="icon">&#127916;</div>
      <div class="name">${escapeHtml(row.name)}</div>
      <div class="source-name">${escapeHtml(row.sourceName)} · ${formatTime(row.position)}${row.duration ? ' / ' + formatTime(row.duration) : ''}</div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    `;
    card.onclick = () => {
      currentSourceId = row.sourceId;
      localStorage.setItem('vidviewer:lastSource', currentSourceId);
      renderSourceTabs();
      openVideo({ name: row.name, path: row.path });
    };
    recentStrip.appendChild(card);
  }
}

// ---- Video / image viewer -----------------------------------------------

async function openVideo(file) {
  currentVideoFile = file;
  imageWrap.classList.add('hidden');
  imagePlayer.src = '';
  videoPlayer.classList.remove('hidden');
  viewerTitle.textContent = file.name;
  resumeToast.classList.add('hidden');
  viewerEl.classList.remove('hidden');

  videoPlayer.src = mediaUrl(currentSourceId, file.path);

  let resumeAt = 0;
  try {
    const res = await fetch(`/api/progress?sourceId=${currentSourceId}&path=${encodeURIComponent(file.path)}`);
    const progress = await res.json();
    if (progress && progress.position > 5) resumeAt = progress.position;
  } catch {
    // Ignore; just start from the beginning.
  }

  videoPlayer.onloadedmetadata = () => {
    if (resumeAt > 0 && resumeAt < videoPlayer.duration - 3) {
      videoPlayer.currentTime = resumeAt;
      resumeToast.textContent = `Resumed from ${formatTime(resumeAt)}`;
      resumeToast.classList.remove('hidden');
      setTimeout(() => resumeToast.classList.add('hidden'), 2500);
    }
    videoPlayer.play().catch(() => {});
  };

  clearInterval(progressTimer);
  progressTimer = setInterval(saveVideoProgress, 5000);
  videoPlayer.onpause = saveVideoProgress;
  videoPlayer.onended = saveVideoProgress;
}

function saveVideoProgress(useBeacon) {
  if (!currentVideoFile || !videoPlayer.duration) return;
  const payload = JSON.stringify({
    sourceId: currentSourceId,
    path: currentVideoFile.path,
    name: currentVideoFile.name,
    position: videoPlayer.currentTime,
    duration: videoPlayer.duration,
  });

  if (useBeacon === true && navigator.sendBeacon) {
    navigator.sendBeacon('/api/progress', new Blob([payload], { type: 'application/json' }));
  } else {
    fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
  }
}

function openImage(images, index) {
  currentImages = images;
  currentImageIndex = index;
  videoPlayer.classList.add('hidden');
  videoPlayer.pause();
  videoPlayer.src = '';
  imageWrap.classList.remove('hidden');
  showCurrentImage();
  viewerEl.classList.remove('hidden');
}

function showCurrentImage() {
  const file = currentImages[currentImageIndex];
  if (!file) return;
  imagePlayer.src = mediaUrl(currentSourceId, file.path);
  viewerTitle.textContent = file.name;
}

function stepImage(delta) {
  if (!currentImages.length) return;
  currentImageIndex = (currentImageIndex + delta + currentImages.length) % currentImages.length;
  showCurrentImage();
}

async function closeViewer() {
  const hadVideo = !!currentVideoFile;
  if (hadVideo) saveVideoProgress();
  clearInterval(progressTimer);
  currentVideoFile = null;
  viewerEl.classList.add('hidden');
  videoPlayer.pause();
  videoPlayer.src = '';
  imagePlayer.src = '';
  currentImages = [];
  currentImageIndex = -1;

  if (hadVideo) {
    await loadRecent();
    await loadDir(currentDir);
  }
}

closeViewerBtn.onclick = closeViewer;
prevImageBtn.onclick = () => stepImage(-1);
nextImageBtn.onclick = () => stepImage(1);

document.addEventListener('keydown', (e) => {
  if (viewerEl.classList.contains('hidden')) return;
  if (e.key === 'Escape') closeViewer();
  if (!imageWrap.classList.contains('hidden')) {
    if (e.key === 'ArrowLeft') stepImage(-1);
    if (e.key === 'ArrowRight') stepImage(1);
  }
});

window.addEventListener('beforeunload', () => {
  if (currentVideoFile) saveVideoProgress(true);
});

// ---- Init ---------------------------------------------------------------

const initialParams = new URLSearchParams(location.search);
currentSourceId = Number(initialParams.get('sourceId')) || null;
currentDir = initialParams.get('dir') || '';
loadSources({ selectId: currentSourceId });
