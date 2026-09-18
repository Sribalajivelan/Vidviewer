# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

VidViewer is a small Next.js (App Router) app that runs on a laptop and lets any
device on the same LAN browse folders — local disk, a phone over FTP, or a
single direct URL — and play videos / view images in the browser, with
watch-history and resume-playback support. No auth; it's designed for trusted
home networks only.

## Commands

```bash
npm run dev      # dev server with hot reload (webpack, not Turbopack)
npm run build    # production build (webpack, not Turbopack)
npm start        # run the production build
```

There is no test suite and no lint script configured.

- Node.js **22.5+** is required — the app uses the built-in `node:sqlite`
  module (no native build step).
- Both dev and build force `--webpack` (see `package.json` and
  `scripts/run.js`): Turbopack's build-time module tracing chokes on the
  `node:sqlite` built-in, so don't drop `--webpack` when touching these
  scripts.
- `npm run dev`/`npm start` don't invoke `next` directly — they run
  `scripts/run.js`, which spawns the mDNS responder (`scripts/mdns.js`)
  alongside the Next.js server so one `Ctrl+C` stops both and the LAN/mDNS
  URLs get printed on startup.
- Env vars: `PORT` (default 3000), `MEDIA_ROOT` (default source folder, first
  run only), `DB_PATH` (default `data/vidviewer.db`), `MDNS_DISABLED=1`,
  `MDNS_NAME`.
- Windows-specific entry points: `Start-VidViewer.ps1` (installs deps, builds,
  opens firewall rule, launches), `Install-VidViewerService.ps1` /
  `Uninstall-VidViewerService.ps1` (registers/removes a Windows Service via
  `node-windows`, logic in `scripts/service/`), `Show-VidViewerStatus.ps1`
  (read-only: LAN IP, listening port, service status, firewall rules,
  network category — the actual diagnostic checks behind "works on this
  laptop, not on my phone").

## Architecture

**Three interchangeable source backends.** A "source" is either `local`
(filesystem), `ftp` (phone/FTP server), or `url` (a single direct
video/image link). Each backend implements the same shape — `list*Dir` /
`stream*File` (+ `testConnection` for ftp/url) — in its own file under `lib/`:

- `lib/local.js` — fs-based; `resolveSafePath()` blocks path traversal by
  requiring the resolved path stay under the source's `rootPath`.
- `lib/ftp.js` — via `basic-ftp`; opens a **fresh FTP connection per
  request** (list or stream), closed in a `finally`/on abort. Seeking relies
  on the FTP server supporting `SIZE`/`REST`.
- `lib/urlSource.js` — treats one URL as a single-file "directory" (`path`
  is always `""`); `streamUrlFile` proxies the upstream response through the
  server (forwarding `Range`) so the browser never talks to the remote host
  directly, and prefers extension-guessed MIME over whatever the upstream
  reports.

All three are dispatched by `source.type` in `app/api/list/route.js` and
`app/api/media/route.js` — adding a fourth backend means adding a case in
both routes plus a new `lib/*.js` module with the same function shape.

**Data model** (`lib/db.js`, `node:sqlite`, sync API): two tables —
`sources` (credentials included; `publicSource()` strips `password` before
anything reaches the client) and `playback` (position/duration per
`source_id` + `file_path`, upserted on save). `playback.saveProgress()`
resets position to 0 if the video was watched past 97% (so "finished"
videos restart rather than resume at the very end). On first run with an
empty `sources` table, a default `local` source is seeded from `MEDIA_ROOT`
(skipped during `next build` via `NEXT_PHASE` check, so build-time page-data
collection doesn't seed the wrong folder). `db.js` resolves `DB_PATH` from
`process.cwd()`, not `__dirname`, because Next.js relocates compiled route
files under `.next/`.

**API routes** (`app/api/*/route.js`, all `runtime: 'nodejs'`,
`dynamic: 'force-dynamic'`):
- `GET/POST /api/sources`, `DELETE /api/sources/[id]` — CRUD; POST validates
  and test-connects `ftp`/`url` sources before persisting.
- `GET /api/list?sourceId&dir` — dispatches to the matching backend's list
  function.
- `GET /api/media?sourceId&path` — dispatches to the matching backend's
  stream function; all three honor a `Range` header for video seeking.
- `GET/POST /api/progress`, `GET/POST/DELETE /api/recent[/[id]]` — playback
  position and the Continue Watching list (`playback.listRecent()` joins
  back to `sources` for name/type/mime).

**Frontend** is a single client component tree rooted at `app/page.js`,
which owns all state (current source/dir, directory listing, Continue
Watching rows, active viewer) and passes it down to `components/*.jsx`;
there's no client-side router/state library. Video position is tracked in a
ref (`activeVideoRef`) and flushed to `/api/progress` on an interval, on
pause/end, and via `sendBeacon` on `beforeunload`. Playback UI is
`components/Viewer.jsx` wrapping `video.js` (`components/VideoPlayer.jsx`)
for video and a custom lightbox for images (arrow-key/on-screen navigation
within the current folder's image list).

**Media classification** (`lib/mediaTypes.js`) is the single source of
truth for supported extensions/MIME types — video: mp4, webm, ogg/ogv, mov,
m4v, mkv; image: jpg, jpeg, png, gif, webp, bmp, svg. Extend support by
editing this file only; both `local.js` and `ftp.js` filter directory
listings through `classify()`.

**In-app video conversion** (`lib/convert.js`, local sources only): when a
device's browser can't play a file's format at all (video.js fires an
`error` with `code === 4`, `MEDIA_ERR_SRC_NOT_SUPPORTED` — see
`components/VideoPlayer.jsx`'s `onUnsupported`), the UI offers to convert it
in place via a bundled `ffmpeg-static`/`ffprobe-static` (no system ffmpeg
install required). `POST /api/convert` starts a background ffmpeg job
re-encoding to H.264/AAC MP4 next to the original file (same name, `.mp4`
extension; a no-op if that file already exists); `GET
/api/convert/[jobId]` is polled for progress. Two non-obvious things here:
- Conversion jobs live in an in-memory `Map`, but it's anchored on
  `globalThis` rather than plain module scope — Next.js dev mode compiles
  `/api/convert` and `/api/convert/[jobId]` as separate module graphs, so a
  plain module-level `Map` would silently be two different, mutually
  invisible Maps and every status poll would 404.
- `next.config.js` lists `ffmpeg-static`/`ffprobe-static` under
  `serverExternalPackages`. Both resolve their bundled binary's path off
  their own `__dirname` at require-time; letting webpack bundle them into a
  vendor chunk breaks that (the path resolves into `.next/.../vendor-chunks`
  instead of `node_modules`), so they must stay unbundled.

**Graceful shutdown waits for in-flight conversions** (`scripts/run.js`):
ffmpeg is a grandchild of `run.js` (spawned inside the Next.js child process
by `lib/convert.js`), invisible to and not killed by `run.js`'s own
`child.kill()` calls - an abrupt stop can orphan it or break its
stdout/stderr pipes mid-encode, leaving a truncated `.mp4` next to the
original (the cleanup-on-failure path in `lib/convert.js` only runs when
ffmpeg exits on its own with a non-zero code, not when the whole process
tree is killed out from under it). So on SIGINT/SIGTERM, `run.js` first
polls its own `GET /api/convert` and waits (bounded by `SHUTDOWN_WAIT_MS`,
default 10 min) for any `running` job to finish before killing children.
This only has teeth under the Windows Service because
`scripts/service/install.js` also sets node-windows/WinSW's
`stopparentfirst`/`stoptimeout` - WinSW's default stop is an immediate
kill, which would make the wait pointless; keep `stoptimeout` a bit longer
than `SHUTDOWN_WAIT_MS` if either changes. Verified directly: a copy of
`run.js` that self-emits `SIGINT` mid-conversion correctly waits, logs,
and exits right after the job completes, with a non-truncated output file
(vs. an external kill, which produces a truncated one). Not independently
verified: that a real `Restart-Service`/`Stop-Service` actually delivers a
catchable signal the same way in this environment - external
`process.kill()`/`Stop-Process`/`taskkill` attempts against this app's
process on Windows all terminated it unconditionally without ever
reaching the handler, so this is worth confirming against the live
service in a low-stakes moment (no conversion actually running) if it's
ever in doubt.

## Security notes relevant to changes here

- Never remove or weaken `resolveSafePath()`'s traversal check in
  `lib/local.js` — it's the only thing preventing a client-supplied `path`
  from escaping a source's root.
- `lib/db.js`'s `publicSource()` is the only thing stripping FTP passwords
  before a source object reaches the client — any new field added to a
  source that shouldn't be public needs to be stripped there too.
- This app intentionally has no authentication; don't add features that
  assume the network is trusted beyond LAN scope (e.g. don't widen
  `url`-source fetches or FTP connects based on unvalidated client input).
