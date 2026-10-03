const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { path: ffprobePath } = require('ffprobe-static');
const { resolveSafePath } = require('./local');
const { probeStreams } = require('./ffprobe');

// In-memory only: conversion jobs don't need to survive a server restart,
// and this app has no queue/worker infra to persist them to anyway. Anchored
// on `globalThis` rather than plain module scope because Next.js compiles
// each API route as its own module graph in dev - `/api/convert` and
// `/api/convert/[jobId]` would otherwise each get their own copy of this
// module (and thus their own, mutually invisible, Map).
const jobs = globalThis.__vidviewerConvertJobs || (globalThis.__vidviewerConvertJobs = new Map());
// Finished/failed jobs stick around a full day so the Converting tab has
// something to show ("old ones"); they're still in-memory only, so a server
// restart clears them regardless of this TTL.
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

function scheduleCleanup(jobId) {
  setTimeout(() => jobs.delete(jobId), JOB_TTL_MS).unref();
}

// Mirrors the "dir/name" relative-path convention used throughout lib/local.js
// and lib/ftp.js (always forward-slash, regardless of OS), rather than
// reusing Node's `path` module which would emit backslashes on Windows.
function siblingMp4RelPath(relPath) {
  const slash = relPath.lastIndexOf('/');
  const dir = slash === -1 ? '' : relPath.slice(0, slash + 1);
  const base = slash === -1 ? relPath : relPath.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot === -1 ? base : base.slice(0, dot);
  return `${dir}${stem}.mp4`;
}

function probeDurationSeconds(filePath) {
  return new Promise((resolve) => {
    if (!ffprobePath) return resolve(null);
    const proc = spawn(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    let out = '';
    proc.stdout.on('data', (chunk) => { out += chunk; });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const seconds = parseFloat(out);
      resolve(Number.isFinite(seconds) ? seconds : null);
    });
  });
}

// Lists the audio streams in a file, for a track picker shown before
// conversion starts (ffmpeg's default stream selection just picks one, which
// isn't necessarily the language the user wants for a multi-audio-track
// file). Returns [] for files with only one (or zero) audio streams, since
// there's nothing to pick between.
async function listAudioTracks(source, relPath) {
  const inputPath = resolveSafePath(source.rootPath, relPath);
  if (!inputPath || !fs.existsSync(inputPath)) return [];

  const streams = await probeStreams(inputPath);
  const audioStreams = streams.filter((s) => s.codec_type === 'audio');
  if (audioStreams.length < 2) return [];

  return audioStreams.map((s, i) => {
    const language = s.tags?.language && s.tags.language !== 'und' ? s.tags.language : undefined;
    return {
      index: s.index,
      label: s.tags?.title || language || `Track ${i + 1}`,
      default: s.disposition?.default === 1,
    };
  });
}

// Starts (or reuses, if one's already in flight for the same output) a
// background ffmpeg conversion of a local video to H.264/AAC MP4, written
// next to the original file. `audioTrackIndex`, if given, picks a specific
// audio stream (its ffprobe `index`) to keep instead of ffmpeg's default
// stream selection. Returns a job id to poll via getJob().
async function startConversion(source, relPath, audioTrackIndex) {
  if (!ffmpegPath) throw new Error('ffmpeg binary not available (ffmpeg-static failed to install)');

  const inputPath = resolveSafePath(source.rootPath, relPath);
  if (!inputPath) throw new Error('Invalid path');
  if (!fs.existsSync(inputPath)) throw new Error('File not found');

  const outRelPath = siblingMp4RelPath(relPath);
  const outputPath = path.join(path.dirname(inputPath), path.basename(outRelPath));
  if (outputPath === inputPath) throw new Error('Already an MP4');

  const meta = {
    sourceId: source.id,
    sourceName: source.name,
    inputName: relPath.split('/').pop() || relPath,
    startedAt: Date.now(),
  };

  if (fs.existsSync(outputPath)) {
    const jobId = crypto.randomUUID();
    jobs.set(jobId, { ...meta, status: 'done', percent: 100, relOutputPath: outRelPath });
    scheduleCleanup(jobId);
    return jobId;
  }

  for (const [id, job] of jobs) {
    if (job.relOutputPath === outRelPath && job.status === 'running') return id;
  }

  const jobId = crypto.randomUUID();
  const job = { ...meta, status: 'running', percent: 0, relOutputPath: outRelPath, error: null };
  jobs.set(jobId, job);

  const durationSeconds = await probeDurationSeconds(inputPath);

  const mapArgs = Number.isInteger(audioTrackIndex)
    ? ['-map', '0:v:0', '-map', `0:${audioTrackIndex}`]
    : [];

  runConversion(job, { inputPath, outputPath, mapArgs, durationSeconds }).catch((err) => {
    job.status = 'error';
    job.error = err.message;
    fs.rm(outputPath, { force: true }, () => {});
  }).finally(() => scheduleCleanup(jobId));

  return jobId;
}

// GPU encoders are tried in this order; the first one that passes a test
// encode on this machine is used, otherwise (or if a real encode with it
// fails) conversion falls back to CPU libx264.
const VIDEO_ENCODER_ARGS = {
  h264_nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0'],
  h264_qsv: ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '23'],
  h264_amf: ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '23', '-qp_p', '23'],
  libx264: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'],
};
const HARDWARE_ENCODERS = ['h264_nvenc', 'h264_qsv', 'h264_amf'];

// A bundled ffmpeg lists every GPU encoder it was compiled with, whether or
// not this machine has the matching GPU/driver - the only reliable check is
// to actually encode a few frames.
function testEncoder(name) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-v', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=10:d=0.5',
      '-frames:v', '5', '-c:v', name, '-f', 'null', '-',
    ]);
    const timer = setTimeout(() => { proc.kill(); resolve(false); }, 15000);
    proc.on('error', () => { clearTimeout(timer); resolve(false); });
    proc.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

// Resolves to the name of the first working GPU encoder, or null. Detected
// once per server process; the promise is anchored on `globalThis` for the
// same dev-mode reason as `jobs` above.
function getHardwareEncoder() {
  if (!globalThis.__vidviewerHardwareEncoder) {
    globalThis.__vidviewerHardwareEncoder = (async () => {
      for (const name of HARDWARE_ENCODERS) {
        if (await testEncoder(name)) {
          console.log(`[convert] using GPU encoder ${name}`);
          return name;
        }
      }
      console.log('[convert] no working GPU encoder found, using CPU (libx264)');
      return null;
    })();
  }
  return globalThis.__vidviewerHardwareEncoder;
}

function runFfmpeg(job, { inputPath, outputPath, mapArgs, durationSeconds, encoder }) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-y', '-i', inputPath,
      ...mapArgs,
      ...VIDEO_ENCODER_ARGS[encoder],
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      '-progress', 'pipe:1', '-nostats',
      outputPath,
    ]);

    let stderrTail = '';
    proc.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });

    let stdoutBuffer = '';
    proc.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key === 'out_time_ms' && durationSeconds) {
          const seconds = Number(value) / 1_000_000;
          // Cap below 100 until the process actually exits 0: ffmpeg's last
          // progress tick can arrive slightly before the file is finalized.
          job.percent = Math.max(0, Math.min(99, Math.round((seconds / durationSeconds) * 100)));
        }
      }
    });

    proc.on('error', (err) => resolve({ ok: false, spawnFailed: true, error: err.message }));
    proc.on('close', (code) => {
      if (code === 0) return resolve({ ok: true });
      resolve({
        ok: false,
        error: stderrTail.trim().split('\n').slice(-3).join(' ') || `ffmpeg exited with code ${code}`,
      });
    });
  });
}

async function runConversion(job, params) {
  const hardwareEncoder = await getHardwareEncoder();
  const attempts = hardwareEncoder ? [hardwareEncoder, 'libx264'] : ['libx264'];

  let result;
  for (const encoder of attempts) {
    job.percent = 0;
    result = await runFfmpeg(job, { ...params, encoder });
    if (result.ok || result.spawnFailed) break;
    fs.rmSync(params.outputPath, { force: true });
    if (encoder !== 'libx264') {
      console.warn(`[convert] ${encoder} failed (${result.error}); retrying with CPU encoder`);
    }
  }

  if (result.ok) {
    job.status = 'done';
    job.percent = 100;
  } else {
    job.status = 'error';
    job.error = result.error;
  }
}

function getJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return {
    status: job.status,
    percent: job.percent,
    path: job.status === 'done' ? job.relOutputPath : undefined,
    error: job.error || undefined,
  };
}

// All known jobs (running, done, or errored - see JOB_TTL_MS), newest first,
// for the Converting tab.
function listJobs() {
  return Array.from(jobs.entries())
    .map(([id, job]) => ({
      id,
      status: job.status,
      percent: job.percent,
      sourceId: job.sourceId,
      sourceName: job.sourceName,
      name: job.inputName,
      path: job.status === 'done' ? job.relOutputPath : undefined,
      error: job.error || undefined,
      startedAt: job.startedAt,
    }))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

module.exports = { startConversion, listAudioTracks, getJob, listJobs };
