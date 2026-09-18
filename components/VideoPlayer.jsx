'use client';

import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

// Sizes the player to fit the viewport while preserving the video's own
// aspect ratio (video.js's default, non-fluid skin needs an explicit size
// because its tech element is absolutely positioned inside it).
function sizeToViewport(player) {
  const vw = player.videoWidth();
  const vh = player.videoHeight();
  if (!vw || !vh) return;

  const maxWidth = window.innerWidth * 0.95;
  const maxHeight = window.innerHeight * 0.8;
  const scale = Math.min(maxWidth / vw, maxHeight / vh, 1.5);

  player.width(Math.round(vw * scale));
  player.height(Math.round(vh * scale));
}

export default function VideoPlayer({ src, type, initialTime, onTimeUpdate, onPause, onEnded, onResumed }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const callbacksRef = useRef({});
  callbacksRef.current = { onTimeUpdate, onPause, onEnded, onResumed };

  useEffect(() => {
    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');
    containerRef.current.appendChild(videoElement);

    const player = videojs(videoElement, {
      controls: true,
      autoplay: true,
      preload: 'auto',
      sources: [{ src, type }],
    });
    playerRef.current = player;

    player.on('loadedmetadata', () => {
      sizeToViewport(player);
      if (initialTime > 0 && initialTime < player.duration() - 3) {
        player.currentTime(initialTime);
        callbacksRef.current.onResumed?.(initialTime);
      }
    });

    const handleResize = () => sizeToViewport(player);
    window.addEventListener('resize', handleResize);

    player.on('timeupdate', () => callbacksRef.current.onTimeUpdate?.(player.currentTime(), player.duration()));
    player.on('pause', () => callbacksRef.current.onPause?.(player.currentTime(), player.duration()));
    player.on('ended', () => callbacksRef.current.onEnded?.(player.duration(), player.duration()));

    return () => {
      window.removeEventListener('resize', handleResize);
      if (!player.isDisposed()) player.dispose();
      playerRef.current = null;
    };
    // Intentionally only re-run when the file itself changes; the parent
    // remounts this component (via `key`) for a different file/source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, type]);

  return (
    <div className="video-player-wrap" data-vjs-player>
      <div ref={containerRef} />
    </div>
  );
}
