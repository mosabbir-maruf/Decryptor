# AGENTS.md — Decryptor (HLS Extractor + Proxy)

## What it is
Node.js + Hono backend that turns **embed links** into playable `.m3u8` URLs and
proxies the HLS (playlist + segments) through the server with the correct
`Referer`/`Origin`, defeating the domain/referer-locks that block direct playback.

## Run
- `npm start` (`npm run dev` with `--watch`). Default port `3030` (`PORT` overrides).
- `npm test` — unit tests in `tests/`.

## Deploy (Cloudflare Workers)
- `npm i -D wrangler`, then `npm run deploy` / `npm run dev:cf`.
- `wrangler.toml` serves `public/` as static **Assets** (`binding: ASSETS`);
  `index.js` uses that on Workers, falling back to `./public` on Node. No
  `fs`/`__dirname` at top level → runs on Workers. `hls.min.js` is vendored.

## Routes
- `POST /api/extract` — `{ "url": "<embed>" }` → `{ m3u8, referer, host, finalUrl, proxyUrl }`.
- `GET /proxy?url=<enc target>&referer=<enc origin>` — fetches target with the
  player's origin as `Referer`, rewrites playlists through `/proxy`, streams segments.
- `GET /` `/player` — single hls.js player page (`?url=<embed|m3u8>` auto-play).
- `GET /health`, `/<file>` — static asset.

## Proxy behavior (don't regress)
- **Streams segments** via `res.body` (no buffering).
- **Playlist detection is URL/content-type based** (`isPlaylistTarget`) — never reads the body.
- **Forwards `Content-Range`** on `206` (browsers reject a 206 without it).
- **Drops `Referer`/`Origin`** for `*.googleusercontent.com` / `googleapis.com`.
- **Strips fake PNG prefix** for Turbo: `stripFakePrefix()` finds the first `0x47`
  TS-sync at 188-byte spacing and serves clean `video/mp2t` (Range not forwarded there).

## Layout
- `index.js` — Hono app + Workers/Node bootstrap + static serving.
- `src/unpack.js` — packer unpacker + `.m3u8` finder.
- `src/http.js` — shared fetch helpers (UA, referer).
- `src/proxy.js` — `encodeProxyUrl`, `isPlaylistTarget`, `rewritePlaylist`, `fetchThrough`, `needsDeprefix`, `stripFakePrefix`.
- `src/extractors/` — `index.js` dispatcher + one module per host:
  - `vidhide.js`, `lulustream.js` — wrappers delegating to `generic.js`.
  - `vidara.js` — `POST /api/stream`.
  - `generic.js` — packed-JS extractor for Turbo (SR5).
  - Working hosts: **Vidhide (SR2), Turbo (SR5), Lulustream (SR7), Vidara (SR9)**.

## Conventions
- ESM only, no build step. Deps: `hono` + `@hono/node-server`. No secrets.
- Don't modify other projects from here. Never commit/push unless asked.

## Add/fix an extractor
1. Module under `src/extractors/` → `async extract(embedUrl, label)` → `{ m3u8, referer, host, finalUrl }` (`referer` = CDN origin).
2. Register in `src/extractors/index.js` `ROUTES`.
3. Verify with the live-check pattern in MEMORY.md.
