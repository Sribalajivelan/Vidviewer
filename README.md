# VidViewer

A tiny web app that runs on your laptop and lets you browse folders —
including folders on your **phone** shared over FTP — then play videos
and view images from any browser on your local network (including your
laptop itself). It remembers what you've watched and picks up video
playback where you left off.

Built with **Next.js** (App Router) and **[video.js](https://videojs.com/)**
for playback.

## Requirements

Node.js **22.5 or newer** (uses the built-in `node:sqlite` module, no
native build tools required).

## Run it

```bash
npm install
npm run build
npm start
```

For development (hot reload):

```bash
npm install
npm run dev
```

On first run it automatically adds a "Local" source pointing at your
home directory. To point that default source at a specific folder
instead, set `MEDIA_ROOT` before the very first run:

```bash
MEDIA_ROOT="/path/to/your/media" npm start
```

(You can also add/remove folders later from the app itself — see below.)

On start it prints the URLs to open:

```
VidViewer starting (start)
  Local:   http://localhost:3000
  Network: http://192.168.1.23:3000
```

- Open the **Local** URL on the laptop itself.
- Open the **Network** URL from any other device on the same Wi-Fi/LAN
  (phone, tablet, another computer) to browse and play the same files.

Use `PORT=8080 npm start` to change the port.

## Using it

- The tabs at the top switch between **sources** — folders on this
  computer, or FTP connections (e.g. your phone). Click **+ Source**
  to add another one.
- Click a folder to open it, use the breadcrumb to go back.
- Click a video to play it (with seeking support); click an image to
  view it full-screen, with on-screen arrows / left-right arrow keys
  to move between images in the same folder.
- Press `Esc` or the `×` button to close the player.

### Adding your phone as a source (FTP)

1. On your phone, install an FTP server app (e.g. "FTP Server" or
   "Primitive FTPd" on Android) and start it — it will show you an
   address like `ftp://192.168.1.42:2221` and a username/password.
2. In VidViewer, click **+ Source** → **FTP (e.g. phone)**, fill in the
   host/IP and port it showed you (skip username/password if it's
   running as anonymous), and click **Connect & add**.
3. Your phone's shared folder now shows up as a browsable source,
   exactly like a local folder — same video/image playback, same
   history and resume support.

Both the phone and the laptop need to be on the same Wi-Fi network.

### Continue watching

Every video you watch has its playback position saved automatically
(persisted in a local SQLite database). A **Continue Watching** strip
appears at the top of the browser showing your recently-played videos
across all sources with a progress bar; clicking one resumes right
where you left off. Videos you've finished (or are within ~3% of the
end) start over from the beginning next time.

## Notes

- Only files under a source's configured root can be accessed (path
  traversal is blocked), so it's safe to point a local source at a
  specific media folder rather than your whole home directory.
- Supported video formats: mp4, webm, ogg/ogv, mov, m4v, mkv (actual
  playback support depends on your browser's codec support).
- Supported image formats: jpg, jpeg, png, gif, webp, bmp, svg.
- Source settings and watch history are stored in a SQLite file at
  `data/vidviewer.db` (override the location with `DB_PATH`). FTP
  passwords are stored there in plain text, so treat that file like a
  credential — it's already excluded from git via `.gitignore`.
- FTP streaming opens a fresh connection per file/seek and relies on
  the phone's FTP server supporting the `SIZE`/`REST` commands for
  seeking; most FTP server apps do.
- This app has no authentication — anyone on your local network can
  use it while the server is running. Don't run it on untrusted
  networks (e.g. public Wi-Fi).

## Project structure

- `app/` — Next.js App Router pages and API route handlers
  (`app/api/*/route.js`) for sources, browsing, media streaming, and
  playback progress.
- `components/` — React UI (source tabs, folder/file grid, the
  video.js-based player, etc.).
- `lib/` — framework-agnostic server logic: SQLite access (`db.js`),
  local filesystem browsing/streaming (`local.js`), FTP
  browsing/streaming (`ftp.js`).

Both `next dev` and `next build` run on webpack (`--webpack`) rather
than Turbopack, since Turbopack's build-time module tracing currently
chokes on the `node:sqlite` built-in.
