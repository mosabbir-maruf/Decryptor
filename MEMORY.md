# MEMORY.md — Decryptor runtime findings

## Live check pattern (verify an extractor)
```
POST /api/extract { "url": "<embed>" }  -> { m3u8, referer, proxyUrl }
GET  <proxyUrl>                          -> master playlist (200, #EXTM3U)
GET  <first variant line from master>    -> variant playlist (200)
GET  <first .ts line from variant>       -> segment (200, bytes>0)
```
All four 200 with real bytes = host fully working through the proxy.

## Host status (supported)
| SR  | Host               | Local | Cloudflare | Notes |
|-----|--------------------|-------|------------|-------|
| SR2 | vidhideplus (Vidhide) | ✅ | ❌ 403 | packer→acek-cdn.com. CF egress blocked by acek-cdn. |
| SR5 | turbovidhls (Turbo)   | ✅ | ✅ | segments on `lh3.googleusercontent.com` w/ fake PNG prefix (stripped). |
| SR7 | lulustream            | ✅ | ✅ | packer→cdn-tnmr.org, slow CDN (~2-4s/seg). |
| SR9 | vidara                | ✅ | ✅ | `POST /api/stream`. Token short-lived→extract+play in one shot. |

**Working locally:** Vidhide, Turbo, Lulustream, Vidara (4).
**Working on Cloudflare:** Turbo, Lulustream, Vidara (3) — Vidhide is
CF-blocked (403). For all 4 on CF, deploy on a VPS/residential IP.

Sample test embed URLs: see `samples.md`.

## Proxy behavior (root-cause resolved)
- **Content-Range forwarding** — browsers/hls.js reject a 206 without `Content-Range`.
- **Streaming** — segments stream via `res.body` (no full-buffer). Playlist
  detection is URL/content-type based, never reads the body. hls.js buffer tuned.
- **Fake-PNG de-prefix** — Turbo segments are a real PNG + MPEG-TS.
  `stripFakePrefix()` slices the PNG off and serves clean `video/mp2t`.

## Unsupported hosts
Filemoon, Streamwish, Vidstream, Strmup, Seekstream are **not supported**
(need headless-browser extraction, or are dead/parked domains).
