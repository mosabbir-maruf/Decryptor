// PRO Multi extractor. Takes a themoviedb.org URL and extracts the HLS stream
// via the vixsrc.to API:
//   /api/movie/:tmdbId → { src: "/embed/:id?token=..." }
//   /api/tv/:tmdbId/:season/:episode → { src: "/embed/:id?token=..." }
// The embed page carries window.masterPlaylist = { url, params: { token, expires } }.
// Final m3u8: {url}?token={token}&expires={expires}&h=1

import { fetchText } from '../http.js';

const VIXSRC_ORIGIN = 'https://vixsrc.to';

export async function extract(embedUrl) {
  const u = new URL(embedUrl);
  const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (!parts[0] || (parts[0] !== 'movie' && parts[0] !== 'tv')) {
    throw new Error('vixsrc: TMDB URL missing movie or tv: ' + embedUrl);
  }

  const type = parts[0];
  const tmdbId = (parts[1] || '').split('-')[0];

  let season, episode;
  if (type === 'tv') {
    const sIdx = parts.indexOf('season');
    season = sIdx >= 0 && parts[sIdx + 1] ? parts[sIdx + 1] : '1';
    const eIdx = parts.indexOf('episode');
    episode = eIdx >= 0 && parts[eIdx + 1] ? parts[eIdx + 1] : '1';
  }

  const apiUrl = type === 'movie'
    ? `${VIXSRC_ORIGIN}/api/movie/${tmdbId}`
    : `${VIXSRC_ORIGIN}/api/tv/${tmdbId}/${season}/${episode}`;

  const { text: apiText } = await fetchText(apiUrl, { referer: VIXSRC_ORIGIN });

  let embedSrc;
  try {
    embedSrc = JSON.parse(apiText).src;
  } catch {
    throw new Error('vixsrc: /api did not return valid JSON with "src"');
  }

  const { text: embedHtml } = await fetchText(VIXSRC_ORIGIN + embedSrc, {
    referer: VIXSRC_ORIGIN,
    headers: { Accept: 'text/html' },
  });

  // Extract the masterPlaylist object in one regex, then pull all three
  // fields from the smaller block text in a single pass.
  const block = embedHtml.match(/window\.masterPlaylist\s*=\s*(\{[\s\S]*?\});/)?.[1];
  if (!block) throw new Error('vixsrc: masterPlaylist block not found');

  const playlistUrl = block.match(/url\s*:\s*["']([^"']+)/)?.[1];
  const token = block.match(/["']token["']\s*:\s*["']([^"']+)/)?.[1];
  const expires = block.match(/["']expires["']\s*:\s*["']([^"']+)/)?.[1];

  if (!playlistUrl || !token || !expires) {
    throw new Error('vixsrc: incomplete masterPlaylist data');
  }

  const m3u8 = `${playlistUrl}${playlistUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}&expires=${encodeURIComponent(expires)}&h=1`;

  return { m3u8, referer: VIXSRC_ORIGIN, host: 'vixsrc', finalUrl: VIXSRC_ORIGIN + embedSrc };
}
