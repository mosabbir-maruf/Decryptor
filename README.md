# Decryptor

Node.js + Hono backend that turns **TMDB URLs** (movie/TV) and **embed links**
into playable `.m3u8`/mp4 streams and proxies through the server with the
required `Referer`/`Origin`, defeating domain/referer locks.

Primary use-case: **nxsha** aggregator — paste a TMDB URL or numeric id, get a
multi-server list (nitro/lolly/streamfx/multibill/…) with ready `/proxy` URLs.

## Run

```bash
npm install
npm start          # or: npm run dev (--watch). Default port 3030 (PORT overrides)
```

Open the player at http://localhost:3030/ (`?url=<tmdb|m3u8|numeric-id>` auto-play).

## Deploy (Cloudflare Workers)

```bash
npm i -D wrangler
npm run deploy     # or: npm run dev:cf
```

`wrangler.toml` serves `public/` as static **Assets** (`binding: ASSETS`).
Workers plan has a **30s CPU time limit** — 60s proxy timeout applies to Node
only; Workers enforces 30s.

## Deploy (Docker)

A production `Dockerfile` (multi-stage, non-root `node` user, healthcheck,
`npm ci --omit=dev`) is included. Build and run:

```bash
docker build -t decryptor .
docker run -d --name decryptor -p 3030:3030 decryptor
```

Or with Compose (respects a `PORT` env var, auto-restarts, healthchecked):

```bash
PORT=3030 docker compose up -d --build
```

## Routes

- `POST /api/extract` — `{ "url": "<tmdb|embed|numeric-id>" }` →
  `{ url, referer, type, proxyUrl, servers? }`. For TMDB/numeric input nxsha
  returns a `servers[]` list with `{ name, type, quality, proxyUrl }` each.
- `GET /proxy?url=<enc target>&referer=<enc origin>&headers=<enc>` — fetches
  target with the player's origin as `Referer`, rewrites playlists back through
  `/proxy`, streams segments. `headers` carries an allowlisted set of extra
  headers (origin, accept-language, user-agent, …).
- `GET /` `/player` — hls.js player page (`?url=<embed|m3u8|tmdb>` auto-play).
- `GET /health` — health check. `/<file>` — static asset (cached: `.html` 5min,
  `.js`/`.css` 1d).

## Supported hosts

| Type | Source | Input | Status |
|------|--------|-------|--------|
| Primary | **Nxsha** (multi-server) | TMDB URL or numeric id | ✅ returns 14+ servers (nitro, lolly, streamfx, multibill, …) |
| Manual | **Screenscape workers.dev** | `*.workers.dev/?url=...` stream URL | ✅ unwraps and re-proxies |
| Fallback | **PRO Multi** (vixsrc) | TMDB URL | ✅ single-source fallback if nxsha fails |
| Legacy | **Vidhide** (SR2) | Embed URL | ✅ local only (CF 403) |
| Legacy | **Turbo** (SR5) | Embed URL | ✅ local + CF |
| Legacy | **Lulustream** (SR7) | Embed URL | ✅ local + CF |
| Legacy | **Vidara** (SR9) | Embed URL | ✅ local + CF |

Nxsha is the primary path: paste any TMDB movie/TV URL (or just the numeric id)
and get a server switcher. Legacy embed hosts (vidhide, turbo, lulustream,
vidara) still work if you paste their embed URLs directly.

Sample test embeddings are in [`samples.md`](./samples.md).

## Proxy behavior

- **Streams segments** via `res.body` (no buffering) for low latency.
- **Playlist detection** is URL/content-type based (`isPlaylistTarget`); body
  is only read for confirmed playlists (to rewrite URLs) and for de-prefix.
- **60s timeout**: each `/proxy` request is aborted after 60s (prevents hanging
  on dead upstreams). On Workers the platform enforces 30s.
- **Forwards `Content-Range`** on `206` (browsers reject a 206 without it).
- **Drops `Referer`/`Origin`** for `*.googleusercontent.com` / `googleapis.com`.
- **Strips fake PNG prefix** for Turbo: `stripFakePrefix()` finds the first
  `0x47` TS-sync at 188-byte spacing and serves clean `video/mp2t`.
- **Extra headers**: `/proxy?headers=<enc>` forwards an allowlisted set
  (`origin`/`accept-language`/`user-agent`/`accept`/`referer`/`sec-fetch-*`).
  Blocked: `Host`/`Content-Length`/`Connection`.
- **Playlist caching**: `cache-control: public, max-age=30`. Static assets:
  `.html` 5min, `.js`/`.css` 1d.

## File structure

```
decrypt/
├── index.js                  # Hono app + Workers/Node bootstrap + static serving
├── wrangler.toml             # Cloudflare Workers config (ASSETS binding → public/)
├── package.json
├── Dockerfile
├── docker-compose.yml
├── AGENTS.md                 # Agent instructions
├── MEMORY.md                 # Runtime findings
├── samples.md                # Sample embed links
├── public/
│   ├── player.html           # hls.js player page (served at / and /player)
│   └── hls.min.js            # Vendored hls.js (no external CDN)
├── src/
│   ├── util.js               # Shared base64url helpers
│   ├── http.js               # UA, fetchText, originOf
│   ├── proxy.js              # Proxy core (encodeProxyUrl, fetchThrough, rewritePlaylist, …)
│   ├── unpack.js             # Dean-edwards packer unpacker + .m3u8 finder (legacy)
│   └── extractors/
│       ├── index.js          # Dispatcher (host → extractor)
│       ├── nxsha.js          # Primary: TMDB URL/numeric id → multi-server list
│       ├── workers.js        # Screenscape *.workers.dev unwrapper
│       ├── vixsrc.js         # PRO Multi fallback
│       ├── vidhide.js        # SR2 — wraps generic.js
│       ├── lulustream.js     # SR7 — wraps generic.js
│       ├── vidara.js         # SR9 — POST /api/stream
│       └── generic.js        # Packed-JS extractor (Turbo SR5)
└── tests/
    └── unit.test.js          # Unit tests (npm test)
```

## Conventions

- ESM only, no build step. Deps: `hono` + `@hono/node-server` + `crypto-js`.
  No secrets in code.
- Don't modify other projects from here. Never commit/push unless asked.

## Test

```bash
npm test
```
