# MEMORY.md — Decryptor runtime findings

## Live check pattern
```
POST /api/extract { "url": "<tmdb|embed>" }  -> { url, referer, proxyUrl, servers? }
GET  <proxyUrl>                                -> master playlist (200, #EXTM3U body)
                                               or mp4/mkv segment (206, video bytes)
```

## Nxsha status (primary)
**API**: `web.nxsha.app` — `/api/servers` + `/api/sources`. CryptoJS AES,
key `S8x!Jk4ZP1uG8$my`. Pooled 8-at-a-time, 12s per-source timeout.

**Input**: TMDB URL (`themoviedb.org/movie|tv/{id}/season/{s}/episode/{e}`)
or bare numeric id (movie only). Player builds TV URLs from Media/Season/Episode
controls.

**Response**: `servers[]` — each entry has `{ name, type, quality, proxyUrl }`.
Type is `m3u8` or `mp4`. The player switches between servers via the dropdown.

**Server status for GoT s1e1 / Moana**:
| Status | Servers | Notes |
|--------|---------|-------|
| ✅ Play via proxy | **Nitro**, **MbBlast**, **Multi-bill**, **Lolly**, **CastVid**, **Ophm**, **VidPi**, **River**, **4k-bk**, **StremFx** | Workers.dev sources (StremFx/Lolly) need Referer/Origin=`web.nxsha.app/` — nxsha.js handles this. |
| ❌ Blocked server-side | **Prvibd** (proxy.itsnitrox.tech — Cloudflare WAF/TLS fingerprint), **Topflix** (luminairemotion.online — nginx 403 to server IP, master only; segment host auroriaconsulting.cyou is reachable but unusable without master), **4k-Hub** (hubcloud.cx — dead placeholder) |
| ❌ Expired signatures | **Gbru** (shegu.net — `t=` expired, site regenerates client-side), **HindiSk** (valhallastream — same) |

Cloudflare-WAF-protected hosts (itsnitrox.tech) and nginx-IP-blocked hosts
(luminairemotion.online) are browser-only — Node/TLS fingerprint won't pass.
No server-side fix without a headless browser.

## Workers.dev (screenscape) manual path
`src/extractors/workers.js` — paste a `*.workers.dev/?url=...&referer=...` stream
URL from screenscape. Our extractor unwraps the real CDN URL and re-proxies
through `/proxy` with `Referer: themoviebox.org`. Verified `206 video/mp4` for
manually-pasted VidStpM links.

The full auto path (VidStpM etc. via `nxsha.screenscape.me`) is blocked:
bootstrap `POST /api/{routeTok}` → Cloudflare 403 (TLS fingerprint). The
`x-api-token` is server-generated randomly and can't be computed from known
secrets. `ex` value: `K6o2H6-HjcoLvK9s_UgpYN53hh5WAJKceUmxCWNxrDbSO-kxngeLxb0Iw7ecup0J`
(bootstrap client secret, not useful without the token).

## Proxy behavior notes
- **60s timeout** on `/proxy` upstream fetch (`AbortController`). On Workers
  the platform enforces 30s CPU limit instead.
- **Playlist caching**: `cache-control: public, max-age=30` for rewritten
  playlists. Segments are `no-store`.
- **Static assets cached**: `.html` 5min, `.js`/`.css` 1d.
- **`isPlaylist` body check**: after fetching, if the URL looked like a playlist
  (`.m3u8` path or `mpegurl` content-type), the body is checked for `#EXTM3U`.
  HTML block pages (Cloudflare, etc.) trigger a 502 "non-playlist response".
  Note: `.txt`-style playlists (some Multi-bill/Topflix variants) are NOT
  detected by URL pattern — they pass through as segments if the CDN blocks.
- **All source headers forwarded**: nxsha.js now passes through ALL headers from
  the source for each server (not just a hardcoded subset). The proxy's
  allowlist (`EXTRA_HEADER_ALLOWLIST` in `proxy.js`) filters to safe headers
  only: `accept`, `accept-language`, `origin`, `user-agent`, `referer`,
  `sec-fetch-dest`, `sec-fetch-mode`, `sec-fetch-site`. Blocked: `Host`,
  `Content-Length`, `Connection`, etc.

## Response format (prod level)
**/api/extract** (multi-server):
```json
{ "url": "<stream-url>", "referer": "<cdn-origin>", "type": "m3u8|mp4",
  "proxyUrl": "<our-proxy-url>",
  "servers": [
    { "name": "Nitro", "type": "m3u8", "quality": "720p",
      "proxyUrl": "<our-proxy-url>" }
  ] }
```

Removed unnecessary fields: `host`, `finalUrl`, `title`, `headers` (top-level);
`scraper`, `url`, `referer`, `headers` (server entries). The player only needs
`proxyUrl`, `type`, `name`, `quality`.

## File layout
```
index.js              — Hono app, routes, static serving
src/
  util.js             — shared base64url helpers
  http.js             — UA, fetchText, originOf
  proxy.js            — encodeProxyUrl, isPlaylist, rewritePlaylist, fetchThrough, stripFakePrefix
  unpack.js           — dean-edwards unpacker (legacy)
  extractors/
    index.js          — dispatcher (ROUTES)
    nxsha.js          — primary: TMDB → multi-server list
    workers.js        — screenscape *.workers.dev unwrapper
    vixsrc.js         — PRO Multi fallback (TMDB)
    vidhide.js        — SR2 → generic.js
    lulustream.js     — SR7 → generic.js
    vidara.js         — SR9 POST /api/stream
    generic.js        — packed-JS extractor (Turbo SR5)
```

## Dead / browser-only servers (2026‑07)
| Server | URL pattern | Block reason |
|--------|-------------|--------------|
| Prvibd | `proxy.itsnitrox.tech/evir/...` | Cloudflare WAF — TLS/JA3 fingerprint |
| Topflix | `ssu5.luminairemotion.online/...` | nginx 403 to server IP (master only) |
| 4k-Hub | `hubcloud.cx/drive/admin` | Dead placeholder |
| Gbru | `hls.shegu.net/....m3u8?t=...` | `t=` signatures expire, site regenerates client-side |
| HindiSk | `proxy.valhallastream.dpdns.org/...?t=...` | Same expiring signature pattern |
| VidStpM / screenscape-exclusive | `nxsha.screenscape.me` | Cloudflare 403 to `/api/{routeTok}` bootstrap |

All browser-only: server-side Node fetch cannot pass Cloudflare WAF or
client-side signing. Would need a headless browser (Playwright) for these.
