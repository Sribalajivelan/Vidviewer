const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { promisify } = require('util');
const { classify, MIME_TYPES } = require('./mediaTypes');

const stat = promisify(fs.stat);

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

// Streams a local file as a Web `Response`, honoring a Range header for
// video seeking. `rangeHeader` is the raw `Range` request header, if any.
async function streamLocalFile(source, relPath, rangeHeader) {
  const filePath = resolveSafePath(source.rootPath, relPath);
  if (!filePath) return new Response('Invalid path', { status: 400 });

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!fileStat.isFile()) return new Response('Not found', { status: 404 });

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10) || 0;
    const end = endStr ? parseInt(endStr, 10) : fileStat.size - 1;

    if (start >= fileStat.size || end >= fileStat.size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileStat.size}` },
      });
    }

    const body = Readable.toWeb(fs.createReadStream(filePath, { start, end }));
    return new Response(body, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': mime,
      },
    });
  }

  const body = Readable.toWeb(fs.createReadStream(filePath));
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Length': String(fileStat.size),
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    },
  });
}

module.exports = { resolveSafePath, listLocalDir, streamLocalFile };
