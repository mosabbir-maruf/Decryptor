// Shared fetch helpers for extractors. Node 26 has global fetch with automatic
// gzip/deflate/brotli decompression, so we only set sane defaults here.

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export async function fetchText(url, { referer, origin, headers = {} } = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      ...(referer ? { Referer: referer } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...headers,
    },
  });
  const text = await res.text();
  return { res, text, finalUrl: res.url };
}

export function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
