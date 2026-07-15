import { UA } from './http.js';
import { toB64url, fromB64url } from './util.js';

const EXTRA_HEADER_ALLOWLIST = new Set([
  'accept',
  'accept-language',
  'origin',
  'user-agent',
  'referer',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
]);

export function encodeExtraHeaders(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (EXTRA_HEADER_ALLOWLIST.has(k.toLowerCase()) && typeof v === 'string') {
      clean[k.toLowerCase()] = v;
    }
  }
  if (!Object.keys(clean).length) return null;
  return toB64url(JSON.stringify(clean));
}

export function decodeExtraHeaders(token) {
  if (!token) return {};
  try {
    const obj = JSON.parse(fromB64url(token));
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (EXTRA_HEADER_ALLOWLIST.has(k.toLowerCase()) && typeof v === 'string') {
        clean[k.toLowerCase()] = v;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function encodeProxyUrl(target, referer, proxyBase, extra) {
  const u = new URL('/proxy', proxyBase);
  u.searchParams.set('url', target);
  if (referer) u.searchParams.set('referer', referer);
  const h = encodeExtraHeaders(extra);
  if (h) u.searchParams.set('headers', h);
  return u.toString();
}

function isM3u8ContentType(contentType) {
  return !!contentType && /mpegurl/i.test(contentType);
}

export function isPlaylist(text, contentType) {
  if (isM3u8ContentType(contentType)) return true;
  return /^#EXTM3U/i.test(text.slice(0, 1024).trim());
}

export function isPlaylistTarget(target, contentType) {
  if (isM3u8ContentType(contentType)) return true;
  try {
    return /\.m3u8$/i.test(new URL(target).pathname);
  } catch {
    return false;
  }
}

export function rewritePlaylist(playlistText, baseUrl, referer, proxyBase) {
  const base = new URL('.', baseUrl);
  return playlistText
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (/^#EXT-X-(MAP|KEY|MEDIA):/i.test(trimmed)) {
        return line.replace(/(URI=")([^"]+)(")/g, (_m, pre, uri, post) => {
          const abs = resolve(uri, base);
          return pre + encodeProxyUrl(abs, referer, proxyBase) + post;
        });
      }
      if (trimmed.startsWith('#')) return line;
      const abs = resolve(trimmed, base);
      return encodeProxyUrl(abs, referer, proxyBase);
    })
    .join('\n');
}

function resolve(target, base) {
  try {
    return new URL(target, base).toString();
  } catch {
    return target;
  }
}

const REFERERLESS_HOSTS = [/\.googleusercontent\.com$/i, /googleapis\.com$/i];

function shouldDropReferer(target) {
  try {
    const host = new URL(target).hostname;
    return REFERERLESS_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

export function needsDeprefix(target) {
  return shouldDropReferer(target);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

export function stripFakePrefix(buf) {
  if (buf.length < 4) return buf;
  const looksPng = PNG_MAGIC.every((b, i) => buf[i] === b);
  if (!looksPng) return buf;
  const limit = Math.min(buf.length - 376, 8192);
  for (let start = 0; start < limit; start++) {
    if (
      buf[start] === 0x47 &&
      buf[start + 188] === 0x47 &&
      buf[start + 376] === 0x47
    ) {
      return buf.subarray(start);
    }
  }
  return buf;
}

export async function fetchThrough(target, referer, { range, origin, useReferer, extraHeaders, signal } = {}) {
  if (useReferer === undefined) {
    useReferer = referer && !shouldDropReferer(target);
  }
  const headers = {
    'User-Agent': UA,
    Accept: '*/*',
    ...(useReferer ? { Referer: referer, Origin: referer } : {}),
    ...(origin ? { Origin: origin } : {}),
    ...(extraHeaders || {}),
    ...(range ? { Range: range } : {}),
  };

  const res = await fetch(target, { redirect: 'follow', headers, signal });

  return {
    res,
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    contentLength: res.headers.get('content-length') || '',
    contentRange: res.headers.get('content-range') || '',
    acceptRanges: res.headers.get('accept-ranges') || '',
  };
}
