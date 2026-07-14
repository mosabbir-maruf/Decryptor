import { Hono } from 'hono';
import { extract } from './src/extractors/index.js';
import {
  encodeProxyUrl,
  isPlaylistTarget,
  rewritePlaylist,
  fetchThrough,
  needsDeprefix,
  stripFakePrefix,
} from './src/proxy.js';

const app = new Hono();
const PORT = process.env.PORT || 3030;

// --- Extract: given an embed URL, return the m3u8 + a ready proxy URL. ---
app.post('/api/extract', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const url = body.url;
  if (!url) {
    return c.json({ error: 'missing "url" in request body' }, 400);
  }

  try {
    const result = await extract(url);
    const proxyBase = new URL(c.req.url).origin;
    const proxyUrl = encodeProxyUrl(result.m3u8, result.referer, proxyBase);
    return c.json({ ...result, proxyUrl });
  } catch (err) {
    return c.json({ error: String(err.message || err) }, 502);
  }
});

// --- Proxy: fetch a target playlist/segment with the player's Referer. ---
app.get('/proxy', async (c) => {
  const target = c.req.query('url');
  const referer = c.req.query('referer') || '';
  const range = c.req.header('range');

  if (!target) {
    return c.json({ error: 'missing "url" query param' }, 400);
  }

  try {
    // De-prefix targets must be read whole (to strip the fake header), so we
    // never forward the client's Range for them — fetch the full object.
    const deprefix = needsDeprefix(target);
    const useReferer = referer && !deprefix;
    const { res, status, contentType, contentLength, contentRange, acceptRanges } =
      await fetchThrough(target, referer, { range: deprefix ? undefined : range, useReferer });

    // Playlist: rewrite embedded URLs so the player keeps hitting our proxy.
    // Classified by URL/content-type — no body read, so segments stay streamed.
    if (isPlaylistTarget(target, contentType)) {
      const text = await res.text();
      const proxyBase = new URL(c.req.url).origin;
      const rewritten = rewritePlaylist(text, target, referer, proxyBase);
      return new Response(rewritten, {
        status: 200,
        headers: {
          'content-type': 'application/vnd.apple.mpegurl',
          'cache-control': 'no-store',
          'access-control-allow-origin': '*',
        },
      });
    }

    // De-prefix hosts (e.g. Turbo's Google-Drive segments) hide the real
    // MPEG-TS behind a fake PNG header. Buffer, strip the prefix, serve 200.
    if (deprefix) {
      const clean = stripFakePrefix(new Uint8Array(await res.arrayBuffer()));
      return new Response(clean, {
        status: 200,
        headers: {
          'content-type': 'video/mp2t',
          'content-length': String(clean.byteLength),
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        },
      });
    }

    // Segment / key: stream the origin body straight through (no buffering)
    // so the browser receives bytes as the CDN sends them. When the origin
    // answered a Range request with 206, we MUST echo Content-Range or the
    // browser rejects the body.
    const headers = {
      'content-type': contentType || 'application/octet-stream',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    };
    if (contentLength) headers['content-length'] = contentLength;
    if (contentRange) headers['content-range'] = contentRange;
    if (acceptRanges) headers['accept-ranges'] = acceptRanges;

    const body = res.body ?? new Uint8Array(await res.arrayBuffer());
    return new Response(body, { status, headers });
  } catch (err) {
    return c.json({ error: String(err.message || err) }, 502);
  }
});

app.get('/health', (c) => c.json({ ok: true }));

// --- Static assets (player pages + vendored hls.min.js). ---
// On Cloudflare Workers we serve from the `ASSETS` binding (wrangler.toml).
// Locally (node) we fall back to reading ./public from disk.
const STATIC_TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function resolveAssetPath(p) {
  if (!p || p === '/') return '/player.html';
  let f = p.startsWith('/') ? p.slice(1) : p;
  if (!f.includes('.')) f += '.html';
  return '/' + f;
}

app.all('*', async (c) => {
  const env = c.env;
  const path = resolveAssetPath(c.req.path);

  if (env && env.ASSETS) {
    const url = new URL(path, c.req.url);
    return env.ASSETS.fetch(new Request(url, c.req.raw));
  }

  // Local Node fallback: read from ./public.
  try {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const filePath = join(process.cwd(), 'public', path.replace(/^\//, ''));
    const body = readFileSync(filePath);
    const ext = path.slice(path.lastIndexOf('.'));
    return new Response(body, {
      headers: {
        'content-type': STATIC_TYPES[ext] || 'application/octet-stream',
        'access-control-allow-origin': '*',
      },
    });
  } catch {
    return c.json({ error: 'not found' }, 404);
  }
});

export default { fetch: app.fetch };

// Only start a listening server when run directly under Node (not on Workers).
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { serve } = await import('@hono/node-server');
  serve({ fetch: app.fetch, port: PORT });
  console.log(`Decryptor running on http://localhost:${PORT}`);
}
