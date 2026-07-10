# Decryptor

Node.js + Hono backend that turns **embed links** into playable
`.m3u8` URLs and proxies the HLS (playlist + segments) through the server with
the correct `Referer`/`Origin`. This defeats the domain/referer-locks that stop
those streams playing directly in a browser.

## Run

```bash
npm install
npm start          # or: npm run dev (with --watch). Default port 3030 (PORT overrides)
```

Open the player at http://localhost:3030/ (supports `?url=<embed|m3u8>` auto-play).

## Deploy (Cloudflare Workers)

```bash
npm i -D wrangler
npm run deploy     # or: npm run dev:cf
```

`wrangler.toml` serves `public/` as static **Assets** (`binding: ASSETS`);
`index.js` serves them via that binding on Workers, falling back to `./public`
on disk under Node. No `fs`/`__dirname` at module top level → runs on Workers.

## Routes

- `POST /api/extract` — body `{ "url": "<embed>" }` → `{ m3u8, referer, host, finalUrl, proxyUrl }`.
- `GET /proxy?url=<enc target>&referer=<enc origin>` — fetches target with the
  player's origin as `Referer`, rewrites playlists back through `/proxy`, streams
  segments through. **Required** for most hosts.
- `GET /` `/player` — single hls.js player page (supports `?url=<embed|m3u8>` auto-play).
- `GET /health` — health check. `/<file>` — static asset (e.g. `/hls.min.js`).

## Supported hosts

| SR  | Host                | Local | Cloudflare |
|-----|---------------------|-------|------------|
| SR2 | Vidhide             | ✅    | ❌ (403)    |
| SR5 | Turbo               | ✅    | ✅         |
| SR7 | Lulustream          | ✅    | ✅         |
| SR9 | Vidara              | ✅    | ✅         |

Vidhide works locally but is blocked on Cloudflare (its CDN rejects CF egress
IPs). For all four on CF, deploy on a VPS/residential IP.

Sample test embed URLs for these hosts are in [`samples.md`](./samples.md).

## Proxy behavior

- Streams segments via `res.body` (no buffering) for low latency.
- Playlist detection is URL/content-type based and never reads the body.
- Forwards `Content-Range` when the origin answers `206`.
- Drops `Referer`/`Origin` for `*.googleusercontent.com` / `googleapis.com`.
- Strips a fake PNG prefix for those (Turbo) hosts: they prepend a real PNG
  before the MPEG-TS; `stripFakePrefix()` finds the first TS sync byte and
  serves clean `video/mp2t`.

## File structure

```
decrypt/
├── index.js                  # Hono app + Workers/Node server bootstrap + static serving
├── wrangler.toml             # Cloudflare Workers config (ASSETS binding → public/)
├── package.json
├── package-lock.json
├── samples.md                # Sample embed links (live-check notes)
├── public/
│   ├── player.html           # hls.js player page (served at / and /player)
│   └── hls.min.js            # Vendored hls.js (no external CDN)
├── src/
│   ├── http.js               # Shared fetch helpers (UA, referer)
│   ├── unpack.js             # Dean-edwards packer unpacker + .m3u8 finder
│   ├── proxy.js              # Proxy core (rewrite, fetchThrough, stripFakePrefix)
│   └── extractors/
│       ├── index.js          # Dispatcher (host → extractor)
│       ├── vidhide.js        # SR2 — wraps generic.js
│       ├── lulustream.js     # SR7 — wraps generic.js
│       ├── vidara.js         # SR9 — POST /api/stream
│       └── generic.js        # Packed-JS extractor for Turbo (SR5)
└── tests/
    └── unit.test.js          # Unit tests (npm test)
```

## Layout

- `index.js` — Hono app + Workers/Node server bootstrap + static serving.
- `src/unpack.js` — dean-edwards packer unpacker + `.m3u8` finder.
- `src/http.js` — shared fetch helpers (UA, referer).
- `src/proxy.js` — proxy core: `encodeProxyUrl`, `isPlaylistTarget`,
  `rewritePlaylist`, `fetchThrough`, `needsDeprefix`, `stripFakePrefix`.
- `src/extractors/` — one module per host + `index.js` dispatcher.
  - `vidhide.js`, `lulustream.js` — thin wrappers delegating to `generic.js`.
  - `vidara.js` — `POST /api/stream`.
  - `generic.js` — packed-JS extractor for Turbo.

## Conventions

- ESM only, no build step. Deps: `hono` + `@hono/node-server`. No secrets.
- Don't modify other projects from here.
- Never commit/push unless asked.

## Test

```bash
npm test
```
