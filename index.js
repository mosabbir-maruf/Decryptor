import { Hono } from 'hono';
import { extract } from './src/extractors/index.js';
import {
  encodeProxyUrl,
  decodeExtraHeaders,
  isPlaylistTarget,
  isPlaylist,
  rewritePlaylist,
  fetchThrough,
  needsDeprefix,
  stripFakePrefix,
} from './src/proxy.js';

const app = new Hono();
const PORT = process.env.PORT || 3030;

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
    const target = /^\d+$/.test(url.trim())
      ? 'https://www.themoviedb.org/movie/' + url.trim()
      : url;
    const result = await extract(target);
    const proxyBase = new URL(c.req.url).origin;
    const proxyUrl = encodeProxyUrl(result.m3u8, result.referer, proxyBase, result.headers);

    const servers = Array.isArray(result.servers)
      ? result.servers.map((s) => ({
          name: s.name,
          type: s.type,
          quality: s.quality || '',
          proxyUrl: encodeProxyUrl(s.url, s.referer, proxyBase, s.headers),
        }))
      : undefined;

    return c.json({
      url: result.m3u8,
      referer: result.referer,
      type: result.type,
      proxyUrl,
      ...(servers ? { servers } : {}),
    });
  } catch (err) {
    return c.json({ error: String(err.message || err) }, 502);
  }
});

app.get('/proxy', async (c) => {
  const target = c.req.query('url');
  const referer = c.req.query('referer') || '';
  const range = c.req.header('range');
  const extraHeaders = decodeExtraHeaders(c.req.query('headers') || '');

  if (!target) {
    return c.json({ error: 'missing "url" query param' }, 400);
  }

  try {
    const deprefix = needsDeprefix(target);
    const useReferer = referer && !deprefix;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const { res, status, contentType, contentLength, contentRange, acceptRanges } =
      await fetchThrough(target, referer, {
        range: deprefix ? undefined : range,
        useReferer,
        extraHeaders,
        signal: controller.signal,
      });
    clearTimeout(timeout);

    if (isPlaylistTarget(target, contentType)) {
      const text = await res.text();
      if (!isPlaylist(text, contentType)) {
        return new Response(
          'Upstream returned a non-playlist response (block page or error). Try another server.',
          { status: 502, headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' } }
        );
      }
      const proxyBase = new URL(c.req.url).origin;
      const rewritten = rewritePlaylist(text, target, referer, proxyBase);
      return new Response(rewritten, {
        status: 200,
        headers: {
          'content-type': 'application/vnd.apple.mpegurl',
          'cache-control': 'public, max-age=30',
          'access-control-allow-origin': '*',
        },
      });
    }

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

const CACHE_MAX_AGE = {
  '.html': 300,
  '.js': 86400,
  '.css': 86400,
  '.png': 86400,
  '.ico': 86400,
};

app.all('*', async (c) => {
  const env = c.env;
  const path = resolveAssetPath(c.req.path);

  if (env && env.ASSETS) {
    const url = new URL(path, c.req.url);
    return env.ASSETS.fetch(new Request(url, c.req.raw));
  }

  try {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const filePath = join(process.cwd(), 'public', path.replace(/^\//, ''));
    const body = readFileSync(filePath);
    const ext = path.slice(path.lastIndexOf('.'));
    const maxAge = CACHE_MAX_AGE[ext] || 0;
    return new Response(body, {
      headers: {
        'content-type': STATIC_TYPES[ext] || 'application/octet-stream',
        'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
        'access-control-allow-origin': '*',
      },
    });
  } catch {
    return c.json({ error: 'not found' }, 404);
  }
});

export default { fetch: app.fetch };

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { serve } = await import('@hono/node-server');
  serve({ fetch: app.fetch, port: PORT });
  console.log(`Decryptor running on http://localhost:${PORT}`);
}
