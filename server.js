const express = require('express');
const path = require('path');
const os = require('os');

const { sources, playback } = require('./lib/db');
const local = require('./lib/local');
const ftp = require('./lib/ftp');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// First run: seed a default "Local" source so the app is usable out of the box.
// Override the folder it points at with: MEDIA_ROOT=/some/folder npm start
if (sources.count() === 0) {
  sources.createLocal('Local', path.resolve(process.env.MEDIA_ROOT || os.homedir()));
}

function getSourceOr404(req, res) {
  const id = Number(req.query.sourceId ?? req.body?.sourceId);
  const source = sources.get(id);
  if (!source) {
    res.status(404).json({ error: 'Unknown source' });
    return null;
  }
  return source;
}

app.use(express.static(path.join(__dirname, 'public')));

// ---- Sources -------------------------------------------------------------

app.get('/api/sources', (req, res) => {
  res.json(sources.list());
});

app.post('/api/sources', async (req, res) => {
  const body = req.body || {};
  const name = (body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });

  if (body.type === 'local') {
    if (!body.rootPath) return res.status(400).json({ error: 'Folder path is required' });
    try {
      const created = sources.createLocal(name, path.resolve(body.rootPath));
      return res.status(201).json(created);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (body.type === 'ftp') {
    if (!body.host) return res.status(400).json({ error: 'Host is required' });
    const candidate = {
      host: body.host,
      port: Number(body.port) || 21,
      username: body.username || '',
      password: body.password || '',
      secure: !!body.secure,
      basePath: body.basePath || '/',
    };
    try {
      await ftp.testConnection(candidate);
    } catch (err) {
      return res.status(400).json({ error: 'Could not connect: ' + err.message });
    }
    const created = sources.createFtp({ name, ...candidate });
    return res.status(201).json(created);
  }

  res.status(400).json({ error: 'type must be "local" or "ftp"' });
});

app.delete('/api/sources/:id', (req, res) => {
  sources.remove(Number(req.params.id));
  res.status(204).end();
});

// ---- Browsing & streaming -------------------------------------------------

app.get('/api/list', (req, res) => {
  const source = getSourceOr404(req, res);
  if (!source) return;
  const dir = req.query.dir || '';

  if (source.type === 'local') {
    local.listLocalDir(source, dir, (err, result) => {
      if (err) return res.status(404).json({ error: 'Folder not found' });
      res.json({ sourceId: source.id, dir, ...result });
    });
  } else {
    ftp.listFtpDir(source, dir)
      .then((result) => res.json({ sourceId: source.id, dir, ...result }))
      .catch((err) => res.status(502).json({ error: 'FTP error: ' + err.message }));
  }
});

app.get('/media', (req, res) => {
  const source = getSourceOr404(req, res);
  if (!source) return;
  const filePath = req.query.path || '';

  if (source.type === 'local') {
    local.streamLocalFile(source, filePath, req, res);
  } else {
    ftp.streamFtpFile(source, filePath, req, res);
  }
});

// ---- Playback progress / recently played ----------------------------------

app.get('/api/progress', (req, res) => {
  const source = getSourceOr404(req, res);
  if (!source) return;
  const filePath = req.query.path || '';
  const progress = playback.getProgress(source.id, filePath) || { position: 0, duration: null };
  res.json(progress);
});

app.post('/api/progress', (req, res) => {
  const { sourceId, path: filePath, name, position, duration } = req.body || {};
  const source = sources.get(Number(sourceId));
  if (!source) return res.status(404).json({ error: 'Unknown source' });
  if (!filePath || typeof position !== 'number') {
    return res.status(400).json({ error: 'path and position are required' });
  }
  playback.saveProgress({
    sourceId: source.id,
    filePath,
    fileName: name || filePath,
    position,
    duration: typeof duration === 'number' ? duration : null,
  });
  res.status(204).end();
});

app.get('/api/recent', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json(playback.listRecent(limit));
});

app.delete('/api/recent/:id', (req, res) => {
  playback.remove(Number(req.params.id));
  res.status(204).end();
});

// ---------------------------------------------------------------------------

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
  console.log(`VidViewer running`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const addr of getLanAddresses()) {
    console.log(`  Network: http://${addr}:${PORT}`);
  }
});
