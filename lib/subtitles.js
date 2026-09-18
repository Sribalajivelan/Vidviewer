const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { resolveSafePath } = require('./local');
const { probeStreams } = require('./ffprobe');

// Bitmap subtitle codecs (PGS, VobSub/DVD) can't be converted to a WebVTT
// text track - only the text-based ones can.
const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'ass', 'ssa', 'webvtt', 'mov_text']);
const SIDECAR_EXT = new Set(['.srt', '.vtt', '.ass']);

function splitRelPath(relPath) {
  const slash = relPath.lastIndexOf('/');
  const dir = slash === -1 ? '' : relPath.slice(0, slash + 1);
  const base = slash === -1 ? relPath : relPath.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot === -1 ? base : base.slice(0, dot);
  return { dir, stem };
}

// Lists both subtitle streams embedded in the file itself and sidecar
// subtitle files (same base name, e.g. "Movie.en.srt") next to it. Local
// sources only - extracting/parsing subtitles needs direct filesystem and
// ffprobe/ffmpeg access.
async function listTracks(source, relPath) {
  const inputPath = resolveSafePath(source.rootPath, relPath);
  if (!inputPath || !fs.existsSync(inputPath)) return [];

  const tracks = [];

  const streams = await probeStreams(inputPath);
  for (const s of streams) {
    if (s.codec_type !== 'subtitle' || !TEXT_SUBTITLE_CODECS.has(s.codec_name)) continue;
    const language = s.tags?.language && s.tags.language !== 'und' ? s.tags.language : undefined;
    const title = s.tags?.title;
    tracks.push({
      id: `embedded:${s.index}`,
      label: title || language || `Subtitle track ${s.index}`,
      srclang: language,
      default: s.disposition?.default === 1,
    });
  }

  const { dir, stem } = splitRelPath(relPath);
  let entries = [];
  try {
    entries = fs.readdirSync(path.dirname(inputPath));
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!SIDECAR_EXT.has(ext)) continue;
    const entryStem = entry.slice(0, entry.length - ext.length);

    let langTag = null;
    if (entryStem === stem) {
      langTag = null;
    } else if (entryStem.startsWith(`${stem}.`)) {
      langTag = entryStem.slice(stem.length + 1);
    } else {
      continue;
    }

    tracks.push({
      id: `sidecar:${dir}${entry}`,
      label: langTag ? `${langTag} (file)` : entry,
      srclang: langTag || undefined,
      default: false,
    });
  }

  return tracks;
}

function runFfmpegToVtt(inputPath, mapSpec) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg binary not available'));
    const args = ['-v', 'error', '-i', inputPath];
    if (mapSpec) args.push('-map', mapSpec);
    args.push('-c:s', 'webvtt', '-f', 'webvtt', 'pipe:1');

    const proc = spawn(ffmpegPath, args);
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'));
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

// Minimal SRT -> WebVTT conversion: add the required header and swap the
// comma millisecond separator for the period WebVTT expects. Cue numbering
// and blank-line-separated blocks are valid in both formats as-is.
function srtToVtt(srtText) {
  const body = srtText
    .replace(/\r\n/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${body}`;
}

async function getVtt(source, relPath, trackId) {
  const inputPath = resolveSafePath(source.rootPath, relPath);
  if (!inputPath || !fs.existsSync(inputPath)) throw new Error('File not found');

  if (trackId.startsWith('embedded:')) {
    const streamIndex = trackId.slice('embedded:'.length);
    if (!/^\d+$/.test(streamIndex)) throw new Error('Invalid track id');
    return runFfmpegToVtt(inputPath, `0:${streamIndex}`);
  }

  if (trackId.startsWith('sidecar:')) {
    const sidecarRel = trackId.slice('sidecar:'.length);
    const sidecarPath = resolveSafePath(source.rootPath, sidecarRel);
    if (!sidecarPath || !fs.existsSync(sidecarPath)) throw new Error('Subtitle file not found');

    const ext = path.extname(sidecarPath).toLowerCase();
    if (ext === '.vtt') return fs.readFileSync(sidecarPath, 'utf8');
    if (ext === '.srt') return srtToVtt(fs.readFileSync(sidecarPath, 'utf8'));
    if (ext === '.ass') return runFfmpegToVtt(sidecarPath, null);
    throw new Error('Unsupported subtitle file');
  }

  throw new Error('Unknown subtitle track');
}

module.exports = { listTracks, getVtt };
