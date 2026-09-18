// Stops and removes the VidViewer Windows Service. Run via
// Uninstall-VidViewerService.ps1, not directly.
const path = require('path');
const { Service } = require('node-windows');
const { PROJECT_ROOT, SERVICE_NAME } = require('./common');

const svc = new Service({
  name: SERVICE_NAME,
  script: path.join(PROJECT_ROOT, 'scripts', 'run.js'),
});

svc.on('alreadyuninstalled', () => {
  console.log(`The "${SERVICE_NAME}" service is not installed.`);
  process.exit(0);
});

svc.on('uninstall', () => {
  console.log(`Service "${SERVICE_NAME}" uninstalled.`);
  process.exit(0);
});

svc.on('error', (err) => {
  console.error('Service removal error:', err);
  process.exit(1);
});

svc.uninstall();
