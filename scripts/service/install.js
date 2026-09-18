// Installs VidViewer as a Windows Service (via node-windows/WinSW) and
// starts it. Run via Install-VidViewerService.ps1, not directly - that
// script handles the Administrator check, dependency install, and build.
const path = require('path');
const { Service } = require('node-windows');
const { PROJECT_ROOT, SERVICE_NAME, buildEnv } = require('./common');

const svc = new Service({
  name: SERVICE_NAME,
  description: 'VidViewer - browses local/FTP/URL media and plays it to any device on your LAN.',
  script: path.join(PROJECT_ROOT, 'scripts', 'run.js'),
  scriptOptions: 'start',
  workingDirectory: PROJECT_ROOT,
  env: buildEnv(),
  // Restart on crash with a backing-off delay, but give up after a few
  // rapid failures in a row instead of restart-looping forever.
  wait: 2,
  grow: 0.5,
  maxRestarts: 5,
  // WinSW's default stop is an immediate kill. `stopparentfirst` makes it
  // send a graceful stop signal first - Node sees this as SIGINT, which
  // scripts/run.js's shutdown handler uses to wait for any in-flight video
  // conversion to finish - and only force-kills after `stoptimeout` if the
  // process still hasn't exited. Kept a bit longer than run.js's own
  // SHUTDOWN_WAIT_MS (10 min default) so that wait has time to finish and
  // exit on its own first.
  stopparentfirst: true,
  stoptimeout: 660,
});

svc.on('invalidinstallation', () => {
  console.error('A previous VidViewer service installation looks broken or incomplete.');
  console.error('Run Uninstall-VidViewerService.ps1 first, then try installing again.');
  process.exit(1);
});

svc.on('alreadyinstalled', () => {
  console.log(`The "${SERVICE_NAME}" service is already installed.`);
  console.log('Run Uninstall-VidViewerService.ps1 first if you want to change its settings.');
  process.exit(0);
});

svc.on('install', () => {
  console.log(`Service "${SERVICE_NAME}" installed. Starting it...`);
  svc.start();
});

svc.on('start', () => {
  console.log(`Service "${SERVICE_NAME}" is running and set to start automatically on boot.`);
  process.exit(0);
});

svc.on('error', (err) => {
  console.error('Service installation error:', err);
  process.exit(1);
});

svc.install();
