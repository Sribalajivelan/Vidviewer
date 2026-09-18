const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SERVICE_NAME = 'VidViewer';

// Builds the env array node-windows/WinSW bakes into the service definition.
// A Windows Service starts with no interactive session and none of the
// current shell's environment, so anything the app needs (PORT, MEDIA_ROOT,
// MDNS_NAME/MDNS_DISABLED) has to be captured here at install time.
function buildEnv() {
  const passthrough = ['PORT', 'MEDIA_ROOT', 'MDNS_NAME', 'MDNS_DISABLED', 'DB_PATH'];
  return passthrough
    .filter((name) => process.env[name] != null && process.env[name] !== '')
    .map((name) => ({ name, value: process.env[name] }));
}

module.exports = { PROJECT_ROOT, SERVICE_NAME, buildEnv };
