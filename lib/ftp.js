const { Client, FileType } = require('basic-ftp');
const posix = require('path').posix;
const { classify, MIME_TYPES } = require('./mediaTypes');

function joinPath(basePath, relPath) {
  const cleaned = (relPath || '').replace(/^\/+/, '');
  return posix.join(basePath || '/', cleaned);
}

async function connect(source) {
  const client = new Client(15000); // 15s timeout
  await client.access({
    host: source.host,
    port: source.port || 21,
    user: source.username || 'anonymous',
    password: source.password || 'anonymous@',
    secure: !!source.secure,
    secureOptions: source.secure ? { rejectUnauthorized: false } : undefined,
  });
  return client;
}

// Verifies that a source's credentials work and the base path is reachable.
async function testConnection(source) {
  const client = await connect(source);
  try {
    await client.list(source.basePath || '/');
  } finally {
    client.close();
  }
}

async function listFtpDir(source, relPath) {
  const fullPath = joinPath(source.basePath, relPath);
  const client = await connect(source);
  try {
    const entries = await client.list(fullPath);
    const folders = [];
    const files = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;

      if (entry.type === FileType.Directory) {
        folders.push({ name: entry.name, path: entryRelPath });
      } else if (entry.type === FileType.File) {
        const type = classify(entry.name);
        if (type) files.push({ name: entry.name, path: entryRelPath, type, size: entry.size });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return { folders, files };
  } finally {
    client.close();
  }
}

async function streamFtpFile(source, relPath, req, res) {
  const fullPath = joinPath(source.basePath, relPath);
  const ext = posix.extname(fullPath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  let client;
  try {
    client = await connect(source);
  } catch (err) {
    return res.status(502).send('Could not connect to FTP source: ' + err.message);
  }

  res.on('close', () => client.close());

  try {
    let size = null;
    try {
      size = await client.size(fullPath);
    } catch {
      // Server doesn't support SIZE; fall back to a plain, non-range stream.
    }

    let start = 0;
    const range = req.headers.range;
    if (range && size != null) {
      const m = /bytes=(\d+)-/.exec(range);
      if (m) start = Math.min(parseInt(m[1], 10), size - 1);
    }

    if (size != null) {
      res.status(start > 0 ? 206 : 200).set({
        'Content-Length': size - start,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
      });
      if (start > 0) res.set('Content-Range', `bytes ${start}-${size - 1}/${size}`);
    } else {
      res.status(200).set({ 'Content-Type': mime });
    }

    await client.downloadTo(res, fullPath, start);
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Streaming failed: ' + err.message);
  } finally {
    client.close();
  }
}

module.exports = { testConnection, listFtpDir, streamFtpFile };
