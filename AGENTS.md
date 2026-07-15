# AGENTS.md — Decryptor (HLS Extractor + Proxy)

## What it is
Node.js + Hono backend that turns **TMDB URLs** (movie/TV) and **embed links**
into playable `.m3u8`/mp4 streams and proxies through the server with the
required `Referer`/`Origin`, defeating domain/referer locks.

Primary use-case: **nxsha** aggregator — paste a TMDB URL or numeric id, get a
multi-server list (nitro/lolly/streamfx/multibill/…) with ready `/proxy` URLs.

## Run
- `npm start` (`npm run dev` with `--watch`). Default port `3030` (`PORT` overrides).
- `npm test` — unit tests in `tests/`.

## Deploy (Cloudflare Workers)
- `npm i -D wrangler`, then `npm run deploy` / `npm run dev:cf`.
- `wrangler.toml` serves `public/` as static **Assets** (`binding: ASSETS`);
  `index.js` uses that on Workers, falling back to `./public` on Node. No
  `fs`/`__dirname` at top level → runs on Workers. `hls.min.js` is vendored.
- Workers plan has a **30s CPU time limit** — the 60s proxy timeout in
  `index.js` applies to Node only; on Workers the platform will enforce 30s.

## Routes
- `POST /api/extract` — `{ "url": "<tmdb|embed|numeric-id>" }` →
  `{ url, referer, type, proxyUrl, servers? }`. For TMDB/numeric input nxsha
  returns a `servers[]` list with `{ name, type, quality, proxyUrl }` each.
  Legacy embeds (vidhide/turbo/lulustream/vidara) return `url`+`proxyUrl`
  without servers.
- `GET /proxy?url=<enc target>&referer=<enc origin>&headers=<enc>` — fetches
  target with the player's origin as `Referer`, rewrites playlists through
  `/proxy`, streams segments. `headers` carries an allowlisted set of extra
  headers (origin, accept-language, user-agent, …) for sources that need them.
- `GET /` `/player` — single hls.js player page (`?url=<embed|m3u8|tmdb>` auto-play).
- `GET /health`, `/<file>` — static asset (cached: `.html` 5min, `.js`/`.css` 1d).

## Proxy behavior (don't regress)
- **Streams segments** via `res.body` (no buffering).
- **Playlist detection is URL/content-type based** (`isPlaylistTarget`) —
  never reads the body. Body is only read for confirmed playlists (to rewrite
  URLs) and for Google-Drive de-prefix segments.
- **Playlist caching**: returned with `cache-control: public, max-age=30` for
  short-term reuse.
- **Forwards `Content-Range`** on `206` (browsers reject a 206 without it).
- **60s timeout**: each `/proxy` request is aborted after 60s (prevents hanging
  on dead upstreams). On Workers the platform enforces 30s.
- **Drops `Referer`/`Origin`** for `*.googleusercontent.com` / `googleapis.com`.
- **Strips fake PNG prefix** for Turbo: `stripFakePrefix()` finds the first
  `0x47` TS-sync at 188-byte spacing and serves clean `video/mp2t` (Range not
  forwarded there).
- **Forwarded extra headers**: `/proxy?headers=<enc>` carries an allowlisted set
  (`origin`/`accept-language`/`user-agent`/`accept`/`referer`/`sec-fetch-*`) so
  sources that need a specific Origin or UA play. Names are filtered to block
  `Host`/`Content-Length`/etc. injection.

## Layout
- `index.js` — Hono app + Workers/Node bootstrap + static serving.
- `src/util.js` — shared base64url helpers (`toB64url`/`fromB64url`,
  `base64ToB64url`/`b64urlToBase64`).
- `src/unpack.js` — packer unpacker + `.m3u8` finder (legacy).
- `src/http.js` — shared fetch helpers (UA, `fetchText`, `originOf`).
- `src/proxy.js` — `encodeProxyUrl`, `isPlaylistTarget`, `isPlaylist`,
  `rewritePlaylist`, `fetchThrough` (accepts `signal`), `needsDeprefix`,
  `stripFakePrefix`.
- `src/extractors/` — `index.js` dispatcher + one module per host:
  - `nxsha.js` — **primary extractor** for TMDB URLs / numeric ids. Aggregator:
    calls `web.nxsha.app/api/servers` + `/api/sources` (CryptoJS AES,
    key `S8x!Jk4ZP1uG8$my`). Returns a `servers[]` list with playable sources
    (nitro/lolly/streamfx/multibill/…), each already resolved with the correct
    `referer`+`headers` needed. Pooled 8-at-a-time with 12s per-source timeout
    (`AbortSignal.timeout`).
  - `workers.js` — screenscape `*.workers.dev` unwrapper (manual paste path
    for VidStpM etc.).
  - `vixsrc.js` — PRO Multi fallback for TMDB URLs (used only if nxsha fails).
  - `vidhide.js`, `lulustream.js` — wrappers delegating to `generic.js`.
  - `vidara.js` — `POST /api/stream`.
  - `generic.js` — packed-JS extractor for Turbo (SR5), used by vidhide/lulu.
  - Working hosts: **Nxsha** (primary — 14+ servers per TMDB title),
    **Vidhide** (legacy), **Turbo** (legacy), **Lulustream** (legacy),
    **Vidara** (legacy), **Screenscape workers.dev** (manual path).

## Conventions
- ESM only, no build step. Deps: `hono` + `@hono/node-server` + `crypto-js`.
  No secrets in code.
- Don't modify other projects from here. Never commit/push unless asked.

## Add/fix an extractor
1. Module under `src/extractors/` → `async extract(embedUrl, label)` →
   `{ m3u8, referer, host, finalUrl }` for single-source,
   or `{ m3u8, referer, headers, host, finalUrl, type, servers[] }` for
   multi-server (nxsha pattern). `servers[]` entries: `{ name, type, url,
   referer, headers, quality }`.
2. Register in `src/extractors/index.js` `ROUTES`.
3. Verify with live-check pattern in MEMORY.md.

## `/api/extract` response shapes
**Single-source** (legacy embeds):
```json
{ "url": "<m3u8>", "referer": "...", "type": "m3u8", "proxyUrl": "..." }
```

**Multi-server** (nxsha):
```json
{ "url": "...", "referer": "...", "type": "m3u8", "proxyUrl": "...",
  "servers": [
    { "name": "Nitro", "type": "m3u8", "quality": "720p", "proxyUrl": "..." },
    ...
  ] }
```
