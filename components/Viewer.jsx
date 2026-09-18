'use client';

import { useEffect, useRef, useState } from 'react';
import VideoPlayer from './VideoPlayer';
import { mediaUrl, subtitleTrackUrl, formatTime } from '../lib/mediaUrl';

export default function Viewer({ viewerState, sourceId, sourceType, onClose, onStepImage, onVideoTimeUpdate, onVideoPause, onVideoEnded, onConverted }) {
  const [resumeToast, setResumeToast] = useState('');
  const toastTimer = useRef(null);
  const [convertState, setConvertState] = useState(null); // null | { status: 'offer'|'starting'|'running'|'error', percent?, error?, jobId?, audioTracks?, audioTrackIndex? }
  const [subtitleTracks, setSubtitleTracks] = useState([]);

  useEffect(() => {
    if (!viewerState) return undefined;

    function handleKey(e) {
      if (e.key === 'Escape') onClose();
      if (viewerState.type === 'image') {
        if (e.key === 'ArrowLeft') onStepImage(-1);
        if (e.key === 'ArrowRight') onStepImage(1);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [viewerState, onClose, onStepImage]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // A new video (or the player closing) means any conversion offer/progress
  // from the previous one no longer applies.
  const videoPath = viewerState?.type === 'video' ? viewerState.file.path : null;
  useEffect(() => {
    setConvertState(null);
  }, [videoPath]);

  // Subtitle tracks (embedded + sidecar files) are local-source only, same
  // as in-app conversion - fetched fresh for each video opened.
  useEffect(() => {
    setSubtitleTracks([]);
    if (!videoPath || sourceType !== 'local') return undefined;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/subtitles?sourceId=${sourceId}&path=${encodeURIComponent(videoPath)}`);
        const list = await res.json();
        if (!cancelled && Array.isArray(list)) {
          setSubtitleTracks(list.map((t) => ({ ...t, src: subtitleTrackUrl(sourceId, videoPath, t.id) })));
        }
      } catch {
        // No subtitles available; leave the list empty.
      }
    })();
    return () => { cancelled = true; };
  }, [videoPath, sourceId, sourceType]);

  useEffect(() => {
    if (convertState?.status !== 'running' || !convertState.jobId) return undefined;
    const jobId = convertState.jobId;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/convert/${jobId}`);
        const job = await res.json();
        if (!res.ok || job.status === 'error') {
          setConvertState({ status: 'error', error: job.error || 'Conversion failed' });
          return;
        }
        if (job.status === 'done') {
          setConvertState(null);
          onConverted?.(job.path);
        } else {
          setConvertState((prev) => (prev?.status === 'running' ? { ...prev, percent: job.percent } : prev));
        }
      } catch {
        // Transient fetch hiccup; the next tick will retry.
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [convertState?.status, convertState?.jobId, onConverted]);

  if (!viewerState) return null;

  async function handleUnsupported() {
    if (sourceType !== 'local') return;
    setConvertState({ status: 'offer', audioTracks: [], audioTrackIndex: undefined });
    try {
      const res = await fetch(`/api/convert/tracks?sourceId=${sourceId}&path=${encodeURIComponent(viewerState.file.path)}`);
      const audioTracks = await res.json();
      if (Array.isArray(audioTracks) && audioTracks.length) {
        const defaultTrack = audioTracks.find((t) => t.default) || audioTracks[0];
        setConvertState((prev) =>
          prev?.status === 'offer' ? { ...prev, audioTracks, audioTrackIndex: defaultTrack.index } : prev
        );
      }
    } catch {
      // Fall back to ffmpeg's default audio-stream selection.
    }
  }

  async function startConvert() {
    const audioTrackIndex = convertState?.audioTrackIndex;
    setConvertState({ status: 'starting' });
    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, path: viewerState.file.path, audioTrackIndex }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConvertState({ status: 'error', error: data.error || 'Could not start conversion' });
        return;
      }
      setConvertState({ status: 'running', percent: 0, jobId: data.jobId });
    } catch (err) {
      setConvertState({ status: 'error', error: err.message });
    }
  }

  function handleResumed(time) {
    setResumeToast(`Resumed from ${formatTime(time)}`);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setResumeToast(''), 2500);
  }

  const isVideo = viewerState.type === 'video';
  const currentImage = !isVideo ? viewerState.images[viewerState.index] : null;

  return (
    <section className="viewer">
      <button className="close-btn" title="Back to browser" onClick={onClose}>
        &times;
      </button>

      {isVideo && (
        <VideoPlayer
          key={`${sourceId}:${viewerState.file.path}`}
          src={mediaUrl(sourceId, viewerState.file.path)}
          type={viewerState.file.mime}
          initialTime={viewerState.initialTime}
          tracks={subtitleTracks}
          onTimeUpdate={onVideoTimeUpdate}
          onPause={onVideoPause}
          onEnded={onVideoEnded}
          onResumed={handleResumed}
          onUnsupported={handleUnsupported}
        />
      )}

      {isVideo && convertState && (
        <div className="convert-overlay">
          {convertState.status === 'offer' && (
            <>
              <p>This device can&apos;t play this video&apos;s format.</p>
              {convertState.audioTracks?.length > 0 && (
                <select
                  className="convert-audio-track-select"
                  value={convertState.audioTrackIndex}
                  onChange={(e) =>
                    setConvertState((prev) => ({ ...prev, audioTrackIndex: Number(e.target.value) }))
                  }
                >
                  {convertState.audioTracks.map((t) => (
                    <option key={t.index} value={t.index}>
                      Audio: {t.label}
                    </option>
                  ))}
                </select>
              )}
              <button className="add-source-btn" onClick={startConvert}>Convert to MP4</button>
            </>
          )}
          {(convertState.status === 'starting' || convertState.status === 'running') && (
            <>
              <p>Converting to MP4&hellip;</p>
              <div className="progress-track convert-progress-track">
                <div className="progress-fill" style={{ width: `${convertState.percent || 0}%` }} />
              </div>
              {convertState.status === 'running' && <p className="convert-percent">{convertState.percent}%</p>}
            </>
          )}
          {convertState.status === 'error' && (
            <>
              <p className="form-error">Conversion failed: {convertState.error}</p>
              <button className="add-source-btn" onClick={() => setConvertState(null)}>Dismiss</button>
            </>
          )}
        </div>
      )}

      {!isVideo && (
        <div className="image-wrap">
          <button className="nav-btn nav-prev" title="Previous" onClick={() => onStepImage(-1)}>
            &#10094;
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(sourceId, currentImage.path)} alt={currentImage.name} />
          <button className="nav-btn nav-next" title="Next" onClick={() => onStepImage(1)}>
            &#10095;
          </button>
        </div>
      )}

      {resumeToast && <div className="resume-toast">{resumeToast}</div>}
      <div className="viewer-title">{isVideo ? viewerState.file.name : currentImage.name}</div>
    </section>
  );
}
