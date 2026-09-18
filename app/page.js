'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SourceTabs from '../components/SourceTabs';
import AddSourceModal from '../components/AddSourceModal';
import Breadcrumb from '../components/Breadcrumb';
import MediaGrid from '../components/MediaGrid';
import RecentStrip from '../components/RecentStrip';
import Viewer from '../components/Viewer';

const LAST_SOURCE_KEY = 'vidviewer:lastSource';
const SAVE_INTERVAL_MS = 5000;

export default function Page() {
  const [sources, setSources] = useState([]);
  const [currentSourceId, setCurrentSourceId] = useState(null);
  const [currentDir, setCurrentDir] = useState('');
  const [dirData, setDirData] = useState({ folders: [], files: [] });
  const [recentRows, setRecentRows] = useState([]);
  const [viewerState, setViewerState] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadError, setLoadError] = useState('');

  const initializedRef = useRef(false);
  const progressTimerRef = useRef(null);
  const activeVideoRef = useRef(null); // { sourceId, path, name, position, duration }

  const recentByKey = useMemo(
    () => new Map(recentRows.map((r) => [`${r.sourceId}::${r.path}`, r])),
    [recentRows]
  );

  const loadRecent = useCallback(async () => {
    const res = await fetch('/api/recent');
    setRecentRows(await res.json());
  }, []);

  const loadDir = useCallback(async (sourceId, dir) => {
    const res = await fetch(`/api/list?sourceId=${sourceId}&dir=${encodeURIComponent(dir)}`);
    if (!res.ok) {
      setLoadError('Could not open this folder.');
      return;
    }
    const data = await res.json();
    setLoadError('');
    setCurrentDir(data.dir);
    setDirData({ folders: data.folders, files: data.files });
    window.history.replaceState(null, '', `?sourceId=${sourceId}&dir=${encodeURIComponent(data.dir)}`);
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const urlSourceId = Number(params.get('sourceId')) || null;
      const urlDir = params.get('dir') || '';

      const res = await fetch('/api/sources');
      const list = await res.json();
      setSources(list);
      if (!list.length) return;

      const stored = Number(window.localStorage.getItem(LAST_SOURCE_KEY));
      const wanted = urlSourceId || stored;
      const matched = list.some((s) => s.id === wanted);
      const chosen = matched ? wanted : list[0].id;

      setCurrentSourceId(chosen);
      window.localStorage.setItem(LAST_SOURCE_KEY, chosen);
      await loadRecent();
      await loadDir(chosen, matched ? urlDir : '');
    })();
  }, [loadDir, loadRecent]);

  function saveActiveProgress(useBeacon) {
    const info = activeVideoRef.current;
    if (!info || !info.duration) return;
    const payload = JSON.stringify({
      sourceId: info.sourceId,
      path: info.path,
      name: info.name,
      position: info.position,
      duration: info.duration,
    });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/progress', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    }
  }

  useEffect(() => {
    function handleBeforeUnload() {
      saveActiveProgress(true);
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  function selectSource(id) {
    setCurrentSourceId(id);
    window.localStorage.setItem(LAST_SOURCE_KEY, id);
    loadDir(id, '');
  }

  async function removeSource(source) {
    if (!window.confirm(`Remove source "${source.name}"? This also clears its watch history.`)) return;
    await fetch('/api/sources/' + source.id, { method: 'DELETE' });

    const res = await fetch('/api/sources');
    const list = await res.json();
    setSources(list);

    if (!list.length) {
      setCurrentSourceId(null);
      setDirData({ folders: [], files: [] });
    } else if (currentSourceId === source.id) {
      const next = list[0].id;
      setCurrentSourceId(next);
      window.localStorage.setItem(LAST_SOURCE_KEY, next);
      await loadDir(next, '');
    }
    await loadRecent();
  }

  async function handleSourceCreated(newSource) {
    const res = await fetch('/api/sources');
    const list = await res.json();
    setSources(list);
    setModalOpen(false);
    setCurrentSourceId(newSource.id);
    window.localStorage.setItem(LAST_SOURCE_KEY, newSource.id);
    await loadDir(newSource.id, '');
  }

  function openFolder(path) {
    loadDir(currentSourceId, path);
  }

  async function openVideo(file) {
    let resumeAt = 0;
    try {
      const res = await fetch(`/api/progress?sourceId=${currentSourceId}&path=${encodeURIComponent(file.path)}`);
      const progress = await res.json();
      if (progress && progress.position > 5) resumeAt = progress.position;
    } catch {
      // Start from the beginning if progress lookup fails.
    }

    activeVideoRef.current = {
      sourceId: currentSourceId,
      path: file.path,
      name: file.name,
      position: resumeAt,
      duration: null,
    };
    setViewerState({ type: 'video', file, initialTime: resumeAt });

    clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => saveActiveProgress(false), SAVE_INTERVAL_MS);
  }

  function openImage(images, index) {
    setViewerState({ type: 'image', images, index });
  }

  function stepImage(delta) {
    setViewerState((prev) => {
      if (!prev || prev.type !== 'image') return prev;
      const next = (prev.index + delta + prev.images.length) % prev.images.length;
      return { ...prev, index: next };
    });
  }

  function handleVideoTimeUpdate(time, duration) {
    if (activeVideoRef.current) {
      activeVideoRef.current.position = time;
      activeVideoRef.current.duration = duration;
    }
  }

  function handleVideoPause(time, duration) {
    handleVideoTimeUpdate(time, duration);
    saveActiveProgress(false);
  }

  function handleVideoEnded(time, duration) {
    handleVideoTimeUpdate(time, duration);
    saveActiveProgress(false);
  }

  async function closeViewer() {
    const wasVideo = viewerState?.type === 'video';
    if (wasVideo) saveActiveProgress(false);
    clearInterval(progressTimerRef.current);
    activeVideoRef.current = null;
    setViewerState(null);

    if (wasVideo) {
      await loadRecent();
      await loadDir(currentSourceId, currentDir);
    }
  }

  function openRecent(row) {
    setCurrentSourceId(row.sourceId);
    window.localStorage.setItem(LAST_SOURCE_KEY, row.sourceId);
    openVideo({ name: row.name, path: row.path, mime: row.mime });
  }

  return (
    <>
      <header className="topbar">
        <h1>VidViewer</h1>
        <SourceTabs
          sources={sources}
          currentSourceId={currentSourceId}
          onSelect={selectSource}
          onRemove={removeSource}
          onAddClick={() => setModalOpen(true)}
        />
      </header>

      {currentSourceId != null && <Breadcrumb dir={currentDir} onNavigate={openFolder} />}

      <main>
        {!sources.length && (
          <div className="empty">
            No sources yet. Click &quot;+ Source&quot; to add a folder or connect to your phone over FTP.
          </div>
        )}

        {sources.length > 0 && (
          <>
            <RecentStrip rows={recentRows} onOpen={openRecent} />
            {loadError ? (
              <div className="empty">{loadError}</div>
            ) : (
              <MediaGrid
                sourceId={currentSourceId}
                folders={dirData.folders}
                files={dirData.files}
                recentByKey={recentByKey}
                onOpenFolder={openFolder}
                onOpenVideo={openVideo}
                onOpenImage={openImage}
              />
            )}
          </>
        )}
      </main>

      <Viewer
        viewerState={viewerState}
        sourceId={currentSourceId}
        onClose={closeViewer}
        onStepImage={stepImage}
        onVideoTimeUpdate={handleVideoTimeUpdate}
        onVideoPause={handleVideoPause}
        onVideoEnded={handleVideoEnded}
      />

      <AddSourceModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleSourceCreated} />
    </>
  );
}
