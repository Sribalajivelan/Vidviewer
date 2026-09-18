const fs = require('fs');
const path = require('path');
const { classify, MIME_TYPES } = require('./mediaTypes');

// Resolve a client-supplied relative path against a source's root_path,
// refusing to leave it (blocks path traversal such as `../../etc/passwd`).
function resolveSafePath(rootDir, relativePath) {
  const cleaned = (relativePath || '').replace(/^[/\\]+/, '');
  const resolved = path.resolve(rootDir, cleaned);
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  if (resolved !== rootDir && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

function listLocalDir(source, relPath, callback) {
  const dirPath = resolveSafePath(source.rootPath, relPath);
  if (!dirPath) return callback(new Error('Invalid path'));

  fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
    if (err) return callback(err);

    const folders = [];
    const files = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        folders.push({ name: entry.name, path: entryRelPath });
      } else if (entry.isFile()) {
        const type = classify(entry.name);
        if (type) files.push({ name: entry.name, path: entryRelPath, type });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    callback(null, { folders, files });
  });
}

function streamLocalFile(source, relPath, req, res) {
  const filePath = resolveSafePath(source.rootPath, relPath);
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
}

module.exports = { resolveSafePath, listLocalDir, streamLocalFile };
