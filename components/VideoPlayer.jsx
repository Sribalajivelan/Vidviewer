'use client';

import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

// Resets playback to the very beginning; video.js has no built-in control
// for this (only skip-forward/back and the ended-state replay overlay), so
// it's registered once as a custom control-bar button.
if (!videojs.getComponent('RestartButton')) {
  const ButtonBase = videojs.getComponent('Button');

  class RestartButton extends ButtonBase {
    constructor(player, options) {
      super(player, options);
      this.controlText('Restart from beginning');
      this.addClass('vjs-icon-replay');
      this.addClass('vjs-restart-control');
    }

    handleClick() {
      this.player().currentTime(0);
    }
  }

  videojs.registerComponent('RestartButton', RestartButton);
}

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

export default function VideoPlayer({ src, type, initialTime, tracks, onTimeUpdate, onPause, onEnded, onResumed, onUnsupported }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const callbacksRef = useRef({});
  callbacksRef.current = { onTimeUpdate, onPause, onEnded, onResumed, onUnsupported };

  useEffect(() => {
    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');
    containerRef.current.appendChild(videoElement);

    const player = videojs(videoElement, {
      controls: true,
      autoplay: true,
      preload: 'auto',
      sources: [{ src, type }],
      controlBar: {
        skipButtons: { forward: 10, backward: 10 },
      },
    });
    playerRef.current = player;

    player.getChild('controlBar').addChild('RestartButton', {}, 0);

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
    player.on('error', () => {
      // MEDIA_ERR_SRC_NOT_SUPPORTED: the browser itself can't decode this
      // file (wrong container/codec for this device), not a network hiccup.
      if (player.error()?.code === 4) callbacksRef.current.onUnsupported?.();
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (!player.isDisposed()) player.dispose();
      playerRef.current = null;
    };
    // Intentionally only re-run when the file itself changes; the parent
    // remounts this component (via `key`) for a different file/source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, type]);

  // Subtitle tracks are fetched by the parent after the player mounts (a
  // separate request), so they're added as remote text tracks once they
  // arrive rather than passed in at videojs() creation time. This also
  // un-hides video.js's built-in CC/subtitles control automatically.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed() || !tracks?.length) return;
    for (const track of tracks) {
      player.addRemoteTextTrack(
        { kind: 'subtitles', label: track.label, srclang: track.srclang || '', src: track.src, default: track.default },
        false
      );
    }
  }, [tracks]);

  return (
    <div className="video-player-wrap" data-vjs-player>
      <div ref={containerRef} />
    </div>
  );
}
