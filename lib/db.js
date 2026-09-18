const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { PHASE_PRODUCTION_BUILD } = require('next/constants');

// Resolved from the process's working directory (the project root when run
// via `next dev`/`next start`), not __dirname: Next.js relocates compiled
// route/module files under .next/, so __dirname would point there instead.
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'vidviewer.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
// Next.js can spin up several worker processes that each import this module
// (e.g. during `next build`'s page-data collection); without a busy timeout
// they'd fail immediately on any lock contention instead of just waiting.
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('local', 'ftp', 'url')),
    name TEXT NOT NULL,
    root_path TEXT,
    host TEXT,
    port INTEGER,
    username TEXT,
    password TEXT,
    secure INTEGER NOT NULL DEFAULT 0,
    base_path TEXT NOT NULL DEFAULT '/',
    url TEXT,
    media_type TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    position_seconds REAL NOT NULL DEFAULT 0,
    duration_seconds REAL,
    last_played_at TEXT NOT NULL,
    UNIQUE(source_id, file_path)
  );
`);

// Migrate databases created before the "url" source type existed.
for (const stmt of ['ALTER TABLE sources ADD COLUMN url TEXT', 'ALTER TABLE sources ADD COLUMN media_type TEXT']) {
  try {
    db.exec(stmt);
  } catch {
    // Column already exists.
  }
}

function rowToSource(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    rootPath: row.root_path,
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    secure: !!row.secure,
    basePath: row.base_path,
    url: row.url,
    mediaType: row.media_type,
  };
}

function publicSource(source) {
  if (!source) return null;
  const { password, ...rest } = source;
  return rest;
}

const sources = {
  list() {
    const rows = db.prepare('SELECT * FROM sources ORDER BY id').all();
    return rows.map((r) => publicSource(rowToSource(r)));
  },

  // Includes credentials; for internal server-side use only.
  get(id) {
    const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
    return rowToSource(row);
  },

  count() {
    return db.prepare('SELECT COUNT(*) AS c FROM sources').get().c;
  },

  createLocal(name, rootPath) {
    const stmt = db.prepare(
      `INSERT INTO sources (type, name, root_path) VALUES ('local', ?, ?)`
    );
    const info = stmt.run(name, rootPath);
    return publicSource(sources.get(Number(info.lastInsertRowid)));
  },

  createFtp({ name, host, port, username, password, secure, basePath }) {
    const stmt = db.prepare(
      `INSERT INTO sources (type, name, host, port, username, password, secure, base_path)
       VALUES ('ftp', ?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      name,
      host,
      port || 21,
      username || '',
      password || '',
      secure ? 1 : 0,
      basePath || '/'
    );
    return publicSource(sources.get(Number(info.lastInsertRowid)));
  },

  createUrl({ name, url, mediaType }) {
    const stmt = db.prepare(
      `INSERT INTO sources (type, name, url, media_type) VALUES ('url', ?, ?, ?)`
    );
    const info = stmt.run(name, url, mediaType);
    return publicSource(sources.get(Number(info.lastInsertRowid)));
  },

  remove(id) {
    db.prepare('DELETE FROM sources WHERE id = ?').run(id);
  },
};

const playback = {
  getProgress(sourceId, filePath) {
    return db
      .prepare(
        'SELECT position_seconds AS position, duration_seconds AS duration FROM playback WHERE source_id = ? AND file_path = ?'
      )
      .get(sourceId, filePath);
  },

  saveProgress({ sourceId, filePath, fileName, position, duration }) {
    // Treat anything essentially finished as "start over" next time.
    let pos = position;
    if (duration && pos > duration * 0.97) pos = 0;

    db.prepare(
      `INSERT INTO playback (source_id, file_path, file_name, position_seconds, duration_seconds, last_played_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(source_id, file_path) DO UPDATE SET
         file_name = excluded.file_name,
         position_seconds = excluded.position_seconds,
         duration_seconds = excluded.duration_seconds,
         last_played_at = excluded.last_played_at`
    ).run(sourceId, filePath, fileName, pos, duration || null);
  },

  listRecent(limit = 20) {
    return db
      .prepare(
        `SELECT p.id AS id, p.source_id AS sourceId, s.name AS sourceName,
                p.file_path AS path, p.file_name AS name,
                p.position_seconds AS position, p.duration_seconds AS duration,
                p.last_played_at AS lastPlayedAt
         FROM playback p
         JOIN sources s ON s.id = p.source_id
         WHERE p.position_seconds > 0
         ORDER BY p.last_played_at DESC
         LIMIT ?`
      )
      .all(limit);
  },

  remove(id) {
    db.prepare('DELETE FROM playback WHERE id = ?').run(id);
  },
};

// First run: seed a default "Local" source so the app is usable out of the
// box. Override the folder it points at with: MEDIA_ROOT=/some/folder
//
// Skipped during `next build`: it imports this module too (for page-data
// collection), which would otherwise seed the source at build time using
// whatever MEDIA_ROOT (or lack of one) happened to be set then, baking in
// the wrong folder before the real `next start`/MEDIA_ROOT ever runs.
if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD && sources.count() === 0) {
  sources.createLocal('Local', path.resolve(process.env.MEDIA_ROOT || os.homedir()));
}

module.exports = { db, sources, playback };
