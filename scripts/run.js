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

function shutdown() {
  shuttingDown = true;
  for (const child of children) child.kill();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
