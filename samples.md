# Sample Embed Links

Test embed URLs for the live hosts this backend supports. Paste any into the
player at `/?url=<embed>` or call `POST /api/extract {"url":"<embed>"}`.

## Nxsha (primary — multi-server)

Paste a TMDB movie/TV URL **or just the numeric TMDB id**. Returns a server
switcher (nitro, lolly, streamfx, multibill, 4k-bk, castvid, …).

| Example | Input |
|---------|-------|
| Movie (id) | `533535` |
| Movie (URL) | `https://www.themoviedb.org/movie/1108427` |
| TV (URL) | `https://www.themoviedb.org/tv/1399/season/1/episode/1` |

The player's **Media**/**Season**/**Episode** controls let you switch between
Movie/TV and pick episodes before loading.

## Screenscape workers.dev (manual)

Paste a `*.workers.dev/?url=...&referer=...` stream URL directly for servers
that are exclusive to screenscape (VidStpM, VidNestFun, etc.).

```
https://<id>.workers.dev/?url=https://cdn.example.com/stream.m3u8&referer=https://themoviebox.org
```

## Legacy embeds (single-source)

| Host | Name | Embed URL | Status |
|------|------|-----------|--------|
| vidhideplus.com | Vidhide (SR2) | `https://vidhideplus.com/v/jehmieb1epa5` | ✅ local only (403 on CF) |
| turbovidhls.com | Turbo (SR5) | `https://turbovidhls.com/t/6a4a46e35d313` | ✅ local + CF |
| lulustream.com | Lulustream (SR7) | `https://lulustream.com/e/75n0j12zgsl3` | ✅ local + CF |
| vidara.to | Vidara (SR9) | `https://vidara.to/e/QWE1VSu9mQH0` | ✅ local + CF |

## `/api/extract` response examples

**Multi-server** (nxsha):
```json
{
  "url": "https://.../master.m3u8",
  "referer": "https://web.nxsha.app/",
  "type": "m3u8",
  "proxyUrl": "http://localhost:3030/proxy?url=...",
  "servers": [
    { "name": "Nitro", "type": "m3u8", "quality": "", "proxyUrl": "..." }
  ]
}
```

**Single-source** (legacy embed):
```json
{
  "url": "https://.../master.m3u8",
  "referer": "https://cdn.example.com",
  "type": "m3u8",
  "proxyUrl": "http://localhost:3030/proxy?url=..."
}
```

## Notes

- Nxsha is the primary path — it aggregates 14+ servers per TMDB title.
  Workers.dev-wrapped sources (StremFx, Lolly) need `Referer=web.nxsha.app`
  sent to the wrapper (handled automatically).
- Blocked server-side (Cloudflare WAF, nginx IP block, expired signatures):
  **Prvibd** (`proxy.itsnitrox.tech`), **Topflix** (`luminairemotion.online`),
  **4k-Hub** (`hubcloud.cx`), **Gbru** (`shegu.net`), **HindiSk**.
  These only play in the original browser context.
- Screenscape-exclusive servers (VidStpM etc.) require a manual paste of the
  `workers.dev` stream URL; the full auto path is blocked by Cloudflare.
