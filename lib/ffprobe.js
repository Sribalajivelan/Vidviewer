const { spawn } = require('child_process');
const { path: ffprobePath } = require('ffprobe-static');

// Lists every stream (video/audio/subtitle) in a media file via ffprobe, with
// enough metadata (language/title tags, default flag) for callers to build
// track pickers. Shared by lib/convert.js (audio track selection) and
// lib/subtitles.js (subtitle track discovery).
function probeStreams(filePath) {
  return new Promise((resolve) => {
    if (!ffprobePath) return resolve([]);
    const proc = spawn(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'stream=index,codec_type,codec_name:stream_tags=language,title:disposition=default',
      '-of', 'json',
      filePath,
    ]);
    let out = '';
    proc.stdout.on('data', (chunk) => { out += chunk; });
    proc.on('error', () => resolve([]));
    proc.on('close', () => {
      try {
        resolve(JSON.parse(out).streams || []);
      } catch {
        resolve([]);
      }
    });
  });
}

module.exports = { probeStreams };
