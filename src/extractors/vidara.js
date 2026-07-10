// SR9 vidara: vidara.to. The embed page POSTs to /api/stream with
// { filecode, device } and the JSON response carries `streaming_url`
// (the .m3u8). We emulate that POST here.

import { fetchText, originOf } from '../http.js';

export async function extract(embedUrl) {
  const embedOrigin = originOf(embedUrl) || 'https://vidara.to';

  const idMatch = embedUrl.match(/\/e\/([A-Za-z0-9]+)/);
  if (!idMatch) {
    throw new Error('vidara: could not parse filecode from ' + embedUrl);
  }
  const filecode = idMatch[1];

  const apiUrl = `${embedOrigin}/api/stream`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Referer: embedOrigin + '/',
      Origin: embedOrigin,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ filecode, device: 'desktop' }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('vidara: /api/stream did not return JSON (HTTP ' + res.status + ')');
  }

  const m3u8 = json.streaming_url || json.file;
  if (!m3u8) {
    throw new Error('vidara: no streaming_url in /api/stream response');
  }

  return { m3u8, referer: originOf(m3u8) || embedOrigin, host: 'vidara', finalUrl: embedOrigin };
}
