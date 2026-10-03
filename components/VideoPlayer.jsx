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

// Volume above 100%: the media element's own volume caps at 1.0, so extra
// loudness has to come from a Web Audio gain stage. This button only shows
// and requests the level; the audio graph lives in VideoPlayer's effect.
const BOOST_LEVELS = [1, 1.5, 2];
const BOOST_STORAGE_KEY = 'vidviewer:volumeBoost';

if (!videojs.getComponent('BoostButton')) {
  const ButtonBase = videojs.getComponent('Button');

  class BoostButton extends ButtonBase {
    constructor(player, options) {
      super(player, options);
      this.addClass('vjs-boost-control');
      this.label = document.createElement('span');
      this.label.className = 'vjs-boost-label';
      this.el().appendChild(this.label);
      this.setLevel(1);
    }

    setLevel(level) {
      this.label.textContent = `${level}x`;
      this.controlText(`Volume boost ${level}x (click to change)`);
      this.toggleClass('vjs-boost-active', level > 1);
    }

    handleClick() {
      this.player().trigger('boostcycle');
    }
  }

  videojs.registerComponent('BoostButton', BoostButton);
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

    const controlBar = player.getChild('controlBar');
    controlBar.addChild('RestartButton', {}, 0);
    const volumeIndex = controlBar.children().findIndex((c) => c.name() === 'VolumePanel');
    const boostButton = controlBar.addChild('BoostButton', {}, volumeIndex + 1);

    // The Web Audio graph is only built once a boost above 1x is actually
    // requested: routing an element through it makes it silent whenever the
    // AudioContext is suspended, so untouched videos keep plain playback.
    let audioCtx = null;
    let gainNode = null;
    let boostLevel = 1;

    const setBoost = (level) => {
      if (level > 1 && !audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const mediaEl = player.el().querySelector('video');
        if (!AudioContextClass || !mediaEl) return;
        audioCtx = new AudioContextClass();
        gainNode = audioCtx.createGain();
        // Gain past 1x would clip hard on loud passages; a limiter keeps
        // peaks from turning into harsh distortion. The 0 dB threshold is
        // deliberate: any lower and the compressor's automatic makeup gain
        // makes the output louder than the displayed boost level.
        const limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.value = 0;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.1;
        audioCtx.createMediaElementSource(mediaEl).connect(gainNode);
        gainNode.connect(limiter);
        limiter.connect(audioCtx.destination);
      }
      if (gainNode) {
        gainNode.gain.value = level;
        audioCtx.resume?.();
      }
      boostLevel = level;
      boostButton.setLevel(level);
      try {
        window.localStorage.setItem(BOOST_STORAGE_KEY, String(level));
      } catch {
        // Storage unavailable; the boost just won't be remembered.
      }
    };

    const cycleBoost = () => {
      const next = BOOST_LEVELS[(BOOST_LEVELS.indexOf(boostLevel) + 1) % BOOST_LEVELS.length];
      setBoost(next);
    };
    player.on('boostcycle', cycleBoost);
    player.on('play', () => audioCtx?.state === 'suspended' && audioCtx.resume());

    player.ready(() => {
      try {
        const saved = Number(window.localStorage.getItem(BOOST_STORAGE_KEY));
        if (BOOST_LEVELS.includes(saved) && saved > 1) setBoost(saved);
      } catch {
        // Storage unavailable; start at 1x.
      }
    });

    player.on('loadedmetadata', () => {
      sizeToViewport(player);
      if (initialTime > 0 && initialTime < player.duration() - 3) {
        player.currentTime(initialTime);
        callbacksRef.current.onResumed?.(initialTime);
      }
    });

    const handleResize = () => sizeToViewport(player);
    window.addEventListener('resize', handleResize);

    // video.js's own hotkeys only work while the player element has focus,
    // which it rarely does here, so shortcuts are handled at the document
    // level instead. Handled keys are also swallowed on keyup so a focused
    // control-bar button doesn't additionally "click" itself on Space.
    const SHORTCUT_KEYS = new Set([' ', 'k', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'm', 'f', 'b']);
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey || !SHORTCUT_KEYS.has(e.key)) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      e.stopPropagation();

      switch (e.key) {
        case ' ':
        case 'k':
          if (player.paused()) player.play(); else player.pause();
          break;
        case 'ArrowLeft':
          player.currentTime(Math.max(0, player.currentTime() - 10));
          break;
        case 'ArrowRight':
          player.currentTime(Math.min(player.duration() || Infinity, player.currentTime() + 10));
          break;
        case 'ArrowUp':
          player.muted(false);
          player.volume(Math.min(1, player.volume() + 0.1));
          break;
        case 'ArrowDown':
          player.volume(Math.max(0, player.volume() - 0.1));
          break;
        case 'm':
          player.muted(!player.muted());
          break;
        case 'f':
          if (player.isFullscreen()) player.exitFullscreen(); else player.requestFullscreen();
          break;
        case 'b':
          cycleBoost();
          break;
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === ' ' && !(e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) e.preventDefault();
    };
    // Capture phase: video.js's focused buttons/sliders stop keydown from
    // bubbling, and would otherwise either swallow the key or double-handle it.
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);

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
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
      audioCtx?.close();
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
