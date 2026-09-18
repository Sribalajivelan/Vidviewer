const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();

const PORT = process.env.PORT || 3000;
// Folder that is allowed to be browsed. Defaults to the user's home directory.
// Override with: MEDIA_ROOT=/some/folder npm start
const ROOT_DIR = path.resolve(process.env.MEDIA_ROOT || os.homedir());

const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v', '.mkv']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

// Resolve a client-supplied relative path against ROOT_DIR, refusing to
// leave ROOT_DIR (blocks path traversal such as `../../etc/passwd`).
function resolveSafePath(relativePath) {
  const cleaned = (relativePath || '').replace(/^[/\\]+/, '');
  const resolved = path.resolve(ROOT_DIR, cleaned);
  const rootWithSep = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : ROOT_DIR + path.sep;
  if (resolved !== ROOT_DIR && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return resolved;
}

app.use(express.static(path.join(__dirname, 'public')));

// List folders and media files inside a directory under ROOT_DIR.
app.get('/api/list', (req, res) => {
  const requested = req.query.dir || '';
  const dirPath = resolveSafePath(requested);
  if (!dirPath) return res.status(400).json({ error: 'Invalid path' });

  fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(404).json({ error: 'Folder not found' });

    const folders = [];
    const files = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryRelPath = path.join(requested, entry.name);

      if (entry.isDirectory()) {
        folders.push({ name: entry.name, path: entryRelPath });
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXT.has(ext)) {
          files.push({ name: entry.name, path: entryRelPath, type: 'video' });
        } else if (IMAGE_EXT.has(ext)) {
          files.push({ name: entry.name, path: entryRelPath, type: 'image' });
        }
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      dir: requested,
      parent: requested ? path.dirname(requested) : null,
      folders,
      files,
    });
  });
});

// Stream a video or image file, with HTTP Range support for video seeking.
app.get('/media', (req, res) => {
  const filePath = resolveSafePath(req.query.path);
  if (!filePath) return res.status(400).send('Invalid path');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return res.status(404).send('Not found');

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10) || 0;
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;

      if (start >= stat.size || end >= stat.size || start > end) {
        res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
        return;
      }

      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': mime,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.set({
        'Content-Length': stat.size,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VidViewer serving folder: ${ROOT_DIR}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const addr of getLanAddresses()) {
    console.log(`  Network: http://${addr}:${PORT}`);
  }
});
