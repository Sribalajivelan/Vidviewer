const { classify, mimeFor } = require('./mediaTypes');

// Best-effort display name from the URL's path segment, ignoring query
// strings/signing tokens (e.g. seedr/S3-style links).
function nameFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const last = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || url);
    return last;
  } catch {
    return url;
  }
}

// Verifies the URL is reachable before saving it as a source. Tries a
// ranged GET (some hosts reject HEAD) and only reads a byte or two, bounded
// by a timeout so a slow/unresponsive host can't hang the request.
async function testConnection(url) {
  const res = await fetch(url, {
    headers: { Range: 'bytes=0-1' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Server responded with ${res.status}`);
  }
  await res.body?.cancel().catch(() => {});
}

// A "url" source always has exactly one file, at path "". The mime is
// always derived from the real URL, never the (possibly extension-less)
// display name, so the player knows how to handle it.
async function listUrlDir(source) {
  const urlName = nameFromUrl(source.url);
  const name = source.name || urlName;
  const type = source.mediaType || classify(urlName) || 'video';
  const mime = mimeFor(urlName) || (type === 'image' ? 'image/jpeg' : 'video/mp4');
  return { folders: [], files: [{ name, path: '', type, mime }] };
}

// Proxies the remote URL through our server so the browser only ever talks
// to us: forwards Range for seeking and streams the upstream body straight
// through without buffering. `signal` is the browser request's AbortSignal,
// so closing/seeking cancels the upstream fetch too.
async function streamUrlFile(source, rangeHeader, signal) {
  const upstreamHeaders = {};
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

  let upstream;
  try {
    upstream = await fetch(source.url, { headers: upstreamHeaders, signal });
  } catch (err) {
    return new Response('Could not reach URL: ' + err.message, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return new Response('Upstream error: ' + upstream.status, { status: 502 });
  }

  const headers = new Headers();
  for (const key of ['content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  // Prefer our own extension-based guess over whatever the upstream sends:
  // hosts sometimes label a video file as e.g. "audio/webm", which some
  // players refuse to treat as a video source. Fall back to the upstream's
  // header only when the extension is unrecognized.
  const guessed = mimeFor(nameFromUrl(source.url));
  headers.set('content-type', guessed || upstream.headers.get('content-type') || 'application/octet-stream');

  return new Response(upstream.body, { status: upstream.status, headers });
}

module.exports = { nameFromUrl, testConnection, listUrlDir, streamUrlFile };
