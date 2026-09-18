// Answers mDNS (Bonjour/zeroconf) queries for "<name>.local" with this
// machine's LAN IP, so other devices on the network can reach VidViewer by
// a fixed name regardless of the computer's actual hostname. Runs alongside
// the Next.js server (see scripts/run.js) - it's just a DNS responder, not
// a web server itself.
const mdns = require('multicast-dns')();
const { getLanAddresses, getMdnsName } = require('./lanAddress');

const hostname = `${getMdnsName()}.local`;

if (process.env.MDNS_DISABLED === '1') {
  console.log('mDNS advertising disabled (MDNS_DISABLED=1)');
  process.exit(0);
}

mdns.on('query', (query) => {
  const asksForUs = query.questions.some(
    (q) => q.type === 'A' && q.name.toLowerCase() === hostname
  );
  if (!asksForUs) return;

  const [address] = getLanAddresses();
  if (!address) return; // not on a network yet; nothing to answer with

  mdns.respond({
    answers: [{ name: hostname, type: 'A', ttl: 120, data: address }],
  });
});

mdns.on('error', (err) => {
  console.error(`mDNS responder error (${hostname} won't be reachable, but the app still runs fine at its IP address):`, err.message);
});

console.log(`Advertising this machine as ${hostname} via mDNS`);

function shutdown() {
  mdns.destroy(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
