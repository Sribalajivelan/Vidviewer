'use client';

import { useEffect, useRef, useState } from 'react';
import VideoPlayer from './VideoPlayer';
import { mediaUrl, formatTime } from '../lib/mediaUrl';

export default function Viewer({ viewerState, sourceId, onClose, onStepImage, onVideoTimeUpdate, onVideoPause, onVideoEnded }) {
  const [resumeToast, setResumeToast] = useState('');
  const toastTimer = useRef(null);

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

  if (!viewerState) return null;

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
          onTimeUpdate={onVideoTimeUpdate}
          onPause={onVideoPause}
          onEnded={onVideoEnded}
          onResumed={handleResumed}
        />
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
