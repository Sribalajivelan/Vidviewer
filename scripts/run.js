// Prints the URLs to open, then runs the mDNS responder and the Next.js
// server side by side under one `npm run dev`/`npm start`, so a single
// Ctrl+C stops both. Avoids pulling in a process-runner dependency just
// for this, and avoids an extra shell-chained step that could get in the
// way of Ctrl+C reaching the child processes on some platforms.
const { spawn } = require('child_process');
const path = require('path');
const { getLanAddresses, getMdnsName } = require('./lanAddress');

const nextArgs = process.argv.slice(2); // e.g. ['dev', '--webpack'] or ['start']
const mode = nextArgs[0] || 'start';
const nextBin = require.resolve('next/dist/bin/next');

const port = process.env.PORT || 3000;
console.log(`VidViewer starting (${mode})`);
console.log(`  Local:   http://localhost:${port}`);
for (const addr of getLanAddresses()) {
  console.log(`  Network: http://${addr}:${port}`);
}
if (process.env.MDNS_DISABLED !== '1') {
  console.log(`  Network: http://${getMdnsName()}.local:${port}  (once other devices pick it up)`);
}

const children = [];
let shuttingDown = false;

function spawnChild(label, command, args) {
  const child = spawn(command, args, { stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const other of children) if (other !== child && !other.killed) other.kill();
    process.exitCode = code ?? 0;
  });
  return child;
}

if (process.env.MDNS_DISABLED !== '1') {
  spawnChild('mdns', process.execPath, [path.join(__dirname, 'mdns.js')]);
}
spawnChild('next', process.execPath, [nextBin, ...nextArgs]);

// A stop/restart (Ctrl+C, `Stop-Service`/`Restart-Service`) shouldn't cut off
// an in-flight video conversion: ffmpeg is a grandchild spawned inside the
// Next.js process (lib/convert.js), invisible to the `child.kill()` calls
// below - an abrupt stop can leave it orphaned mid-encode, or break its
// stdout/stderr pipes and leave a truncated .mp4 next to the original file
// (see lib/convert.js - the cleanup-on-failure path only runs when ffmpeg
// exits on its own, not when the whole process tree is killed out from under
// it). So before killing anything, poll our own /api/convert for running
// jobs and wait for them to finish, bounded so a stuck job can't block a
// stop forever. Under the Windows Service, this only has time to work
// because scripts/service/install.js also sets `stopparentfirst`/
// `stoptimeout` - WinSW's default stop is an immediate kill, which would
// make this wait pointless. Keep SHUTDOWN_WAIT_MS and that stoptimeout
// roughly in sync if either changes.
const SHUTDOWN_WAIT_MS = Number(process.env.SHUTDOWN_WAIT_MS) || 10 * 60 * 1000;
const SHUTDOWN_POLL_MS = 3000;

async function waitForConversions() {
  const deadline = Date.now() + SHUTDOWN_WAIT_MS;
  let warned = false;
  while (Date.now() < deadline) {
    let jobs;
    try {
      const res = await fetch(`http://localhost:${port}/api/convert`, { signal: AbortSignal.timeout(2000) });
      jobs = await res.json();
    } catch {
      return; // Server isn't answering - nothing we can check, so don't block on it.
    }
    const running = Array.isArray(jobs) ? jobs.filter((j) => j.status === 'running') : [];
    if (!running.length) return;
    if (!warned) {
      console.log(
        `Waiting for ${running.length} conversion(s) to finish before stopping ` +
        `(up to ${Math.round(SHUTDOWN_WAIT_MS / 1000)}s)...`
      );
      warned = true;
    }
    await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_POLL_MS));
  }
  console.log('Timed out waiting for conversions to finish - stopping anyway.');
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await waitForConversions();
  for (const child of children) if (!child.killed) child.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
