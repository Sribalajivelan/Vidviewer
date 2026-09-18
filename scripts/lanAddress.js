const os = require('os');

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

function getMdnsName() {
  return (process.env.MDNS_NAME || 'vidviewer').toLowerCase();
}

module.exports = { getLanAddresses, getMdnsName };
