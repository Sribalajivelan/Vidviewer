export function mediaUrl(sourceId, relPath) {
  return `/api/media?sourceId=${sourceId}&path=${encodeURIComponent(relPath)}`;
}

export function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
