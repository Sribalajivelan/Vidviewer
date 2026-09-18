# VidViewer

A tiny web app that runs on your laptop and lets you browse a folder,
then play videos and view images from any browser on your local network
(including your laptop itself).

## Run it

```bash
npm install
npm start
```

By default it browses your home directory. To point it at a specific
folder instead (recommended), set `MEDIA_ROOT`:

```bash
MEDIA_ROOT="/path/to/your/media" npm start
```

On start it prints the URLs to open:

```
VidViewer serving folder: /path/to/your/media
  Local:   http://localhost:3000
  Network: http://192.168.1.23:3000
```

- Open the **Local** URL on the laptop itself.
- Open the **Network** URL from any other device on the same Wi-Fi/LAN
  (phone, tablet, another computer) to browse and play the same files.

Use `PORT=8080 npm start` to change the port.

## Using it

- Click a folder to open it, use the breadcrumb at the top to go back.
- Click a video to play it (with seeking support).
- Click an image to view it full-screen; use the on-screen arrows,
  the left/right arrow keys, or swipe-equivalent clicks to move
  between images in the same folder.
- Press `Esc` or the `×` button to close the player.

## Notes

- Only files under the configured folder can be accessed (path
  traversal is blocked), so it's safe to point this at a specific
  media folder rather than your whole home directory.
- Supported video formats: mp4, webm, ogg/ogv, mov, m4v, mkv (actual
  playback support depends on your browser's codec support).
- Supported image formats: jpg, jpeg, png, gif, webp, bmp, svg.
- This app has no authentication — anyone on your local network can
  use it while the server is running. Don't run it on untrusted
  networks (e.g. public Wi-Fi).
