const os = require('os');

const mode = process.argv[2] || 'start';
const port = process.env.PORT || 3000;

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
    }
  }
  return addresses;
}

console.log(`VidViewer starting (${mode})`);
console.log(`  Local:   http://localhost:${port}`);
for (const addr of getLanAddresses()) {
  console.log(`  Network: http://${addr}:${port}`);
}
