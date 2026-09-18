const entriesEl = document.getElementById('entries');
const breadcrumbEl = document.getElementById('breadcrumb');
const viewerEl = document.getElementById('viewer');
const videoPlayer = document.getElementById('videoPlayer');
const imageWrap = document.getElementById('imageWrap');
const imagePlayer = document.getElementById('imagePlayer');
const viewerTitle = document.getElementById('viewerTitle');
const closeViewerBtn = document.getElementById('closeViewer');
const prevImageBtn = document.getElementById('prevImage');
const nextImageBtn = document.getElementById('nextImage');

let currentImages = [];
let currentImageIndex = -1;

function mediaUrl(relPath) {
  return '/media?path=' + encodeURIComponent(relPath);
}

async function loadDir(dir) {
  const res = await fetch('/api/list?dir=' + encodeURIComponent(dir));
  if (!res.ok) {
    entriesEl.innerHTML = '<div class="empty">Could not open this folder.</div>';
    return;
  }
  const data = await res.json();
  renderBreadcrumb(data.dir);
  renderEntries(data);
  history.replaceState(null, '', '?dir=' + encodeURIComponent(data.dir));
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
      el.innerHTML = `<div class="icon">&#127916;</div><div class="name">${escapeHtml(file.name)}</div>`;
      el.onclick = () => openVideo(file);
    } else {
      el.innerHTML = `<img class="thumb" loading="lazy" src="${mediaUrl(file.path)}"><div class="name">${escapeHtml(file.name)}</div>`;
      el.onclick = () => openImage(imageFiles, imageFiles.findIndex((f) => f.path === file.path));
    }

    entriesEl.appendChild(el);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openVideo(file) {
  imageWrap.classList.add('hidden');
  imagePlayer.src = '';
  videoPlayer.classList.remove('hidden');
  videoPlayer.src = mediaUrl(file.path);
  viewerTitle.textContent = file.name;
  viewerEl.classList.remove('hidden');
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
  imagePlayer.src = mediaUrl(file.path);
  viewerTitle.textContent = file.name;
}

function stepImage(delta) {
  if (!currentImages.length) return;
  currentImageIndex = (currentImageIndex + delta + currentImages.length) % currentImages.length;
  showCurrentImage();
}

function closeViewer() {
  viewerEl.classList.add('hidden');
  videoPlayer.pause();
  videoPlayer.src = '';
  imagePlayer.src = '';
  currentImages = [];
  currentImageIndex = -1;
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

const initialDir = new URLSearchParams(location.search).get('dir') || '';
loadDir(initialDir);
