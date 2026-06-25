# Bungee Web Player

A **standalone** browser time-stretch player — change **tempo** and **pitch**
independently. Pure static site (HTML + one ES module + a vendored engine), with
**no build step** and **no dependency on the iOS app**, so it deploys to any
static host or web server.

## What it does

- **Tempo** 0.5×–2× — speed without changing pitch
- **Pitch** ±12 semitones — pitch without changing speed
- Transport: play/pause, ±10s, seek
- Load audio via: **file picker**, **drag & drop**, **URL**, or a built-in **demo tone**

The browser has no native pitch-preserving time-stretch (Web Audio `playbackRate`
is varispeed), so audio runs through **[SoundTouchJS](https://github.com/cutterbl/SoundTouchJS)**
(vendored at `vendor/soundtouch.js`, works offline). The engine is isolated in
`app.js`, so you can swap in the **Bungee Pro Web SDK** later without UI changes.

## Files

```
web-player/
├── index.html          # UI
├── app.js              # player logic (ES module)
├── vendor/
│   └── soundtouch.js   # time-stretch engine (vendored)
├── package.json        # optional run scripts
└── nginx.conf.sample   # sample server block
```

## Run locally

It must be served over HTTP (ES modules don't load from `file://`):

```bash
# Python (no install)
python3 -m http.server 8077

# or Node
npx serve -l 8077 .
# or: npm start
```

Then open http://localhost:8077

## Deploy to a server

It's just static files — pick whichever fits:

- **Static hosts** (Netlify / Vercel / Cloudflare Pages / GitHub Pages): drag the
  folder in, or point the project at this repo. No build command; publish dir = `.`
- **nginx / Apache**: copy the folder to your web root (e.g. `/var/www/web-player`)
  and serve it statically. See `nginx.conf.sample`.
- **Any object storage + CDN** (S3 + CloudFront, etc.): upload the files; set
  `index.html` as the index document.

### Deployment notes
- Serve `.js` with a JavaScript MIME type (all the hosts above do by default) —
  required for ES modules.
- HTTP is fine for testing; use **HTTPS in production**. `AudioContext` works on
  plain HTTP, but HTTPS is best practice and required if you later add mic input.
- **"Load from URL"** needs the audio host to send permissive **CORS** headers,
  otherwise the browser blocks the fetch.

## Not supported on the web

**Apple Music** — DRM library tracks can't be decoded to PCM in a browser
(MusicKit JS only plays through Apple's own player). The button explains this.
Use a file, drag & drop, URL, or the demo tone instead.
