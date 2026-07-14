// HLS proxy core. Fetches a target (playlist or segment) with the player's own
// origin as Referer, rewrites relative URLs in playlists to point back at this
// proxy, and streams segment bodies through unchanged.

import { UA } from './http.js';

export function encodeProxyUrl(target, referer, proxyBase) {
  const u = new URL('/proxy', proxyBase);
  u.searchParams.set('url', target);
  if (referer) u.searchParams.set('referer', referer);
  return u.toString();
}

function isM3u8ContentType(contentType) {
  return !!contentType && /mpegurl/i.test(contentType);
}

// Body-based playlist detection (used when the bytes are already in hand).
export function isPlaylist(text, contentType) {
  if (isM3u8ContentType(contentType)) return true;
  return /^#EXTM3U/i.test(text.slice(0, 1024).trim());
}

// URL/header-based playlist detection — cheap, reads no body. Used on the proxy
// hot path so segments are never buffered just to be classified.
export function isPlaylistTarget(target, contentType) {
  if (isM3u8ContentType(contentType)) return true;
  try {
    return /\.m3u8$/i.test(new URL(target).pathname);
  } catch {
    return false;
  }
}

// Rewrite every URL in a playlist (variant playlists, segments, subtitles,
// keys) to go back through our proxy.
export function rewritePlaylist(playlistText, baseUrl, referer, proxyBase) {
  const base = new URL('.', baseUrl); // directory of the playlist
  return playlistText
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Tag lines that embed a URI attribute (key / map / media) need their
      // URI rewritten even though they start with '#'.
      if (/^#EXT-X-(MAP|KEY|MEDIA):/i.test(trimmed)) {
        return line.replace(/(URI=")([^"]+)(")/g, (_m, pre, uri, post) => {
          const abs = resolve(uri, base);
          return pre + encodeProxyUrl(abs, referer, proxyBase) + post;
        });
      }

      // Other comment tags: leave untouched.
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

// Hosts that reject/ignore a foreign Referer (e.g. Google's Drive CDN serves
// some Turbo segments from lh3.googleusercontent.com). For these we drop the
// Referer/Origin entirely so the request looks like a direct client fetch.
const REFERERLESS_HOSTS = [/\.googleusercontent\.com$/i, /googleapis\.com$/i];

function shouldDropReferer(target) {
  try {
    const host = new URL(target).hostname;
    return REFERERLESS_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

// Some CDNs (e.g. Turbo's Google-Drive segments) disguise .ts segments by
// prepending a fake file header (a real 500x500 PNG + padding, ~941 bytes)
// before the actual MPEG-TS stream. Players choke because the file starts with
// the PNG magic instead of the TS sync byte (0x47). These are the same hosts we
// already drop the Referer for, so we buffer + de-prefix them.
export function needsDeprefix(target) {
  return shouldDropReferer(target);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]; // \x89PNG

// If `buf` starts with a fake PNG header, return the slice starting at the first
// valid MPEG-TS packet boundary (0x47 repeating every 188 bytes). Otherwise the
// buffer is returned unchanged.
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

// Fetch the target and return { body, contentType, status, headers }.
export async function fetchThrough(target, referer, { range, origin, useReferer } = {}) {
  if (useReferer === undefined) {
    useReferer = referer && !shouldDropReferer(target);
  }
  const headers = {
    'User-Agent': UA,
    Accept: '*/*',
    ...(useReferer ? { Referer: referer, Origin: referer } : {}),
    ...(origin ? { Origin: origin } : {}),
    ...(range ? { Range: range } : {}),
  };

  const res = await fetch(target, { redirect: 'follow', headers });

  // We do NOT buffer the body here: callers stream `res.body` through for
  // segments (low latency) or read `.text()` for playlists (to rewrite them).
  return {
    res,
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    contentLength: res.headers.get('content-length') || '',
    contentRange: res.headers.get('content-range') || '',
    acceptRanges: res.headers.get('accept-ranges') || '',
  };
}
