// Generic extractor for packed-JS hosts whose m3u8 lives inside the page HTML
// (decode, not API emulation). Currently used for turbo.
// Fetches the embed with the source-site Referer, unpacks the packer, grabs
// the first .m3u8. Falls back to scanning the raw HTML if no packer is present.

import { unpackPacked, findM3u8 } from '../unpack.js';
import { fetchText, originOf } from '../http.js';

const EMBED_REFERER = 'https://www.rtally.shop/';

export async function extract(embedUrl, hostLabel = 'generic') {
  const { res, text, finalUrl } = await fetchText(embedUrl, {
    referer: EMBED_REFERER,
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });

  const unpacked = unpackPacked(text);
  let links = findM3u8(unpacked || text);

  // Some hosts keep the m3u8 in a JSON blob rather than packed JS.
  if (!links.length) {
    const m = text.match(/"file"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
    if (m) links = [m[1]];
  }

  if (!links.length) {
    throw new Error(`${hostLabel}: no m3u8 found (HTTP ${res.status})`);
  }

  const m3u8 = links[0];
  const referer = originOf(m3u8) || originOf(finalUrl) || EMBED_REFERER;
  return { m3u8, referer, host: hostLabel, finalUrl };
}
