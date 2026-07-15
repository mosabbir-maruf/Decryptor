// Dispatcher: pick the right extractor from the embed URL host.

import * as vidhide from './vidhide.js';
import * as lulustream from './lulustream.js';
import * as vidara from './vidara.js';
import * as generic from './generic.js';
import * as vixsrc from './vixsrc.js';
import * as nxsha from './nxsha.js';
import * as workers from './workers.js';

const ROUTES = [
  { test: /vidhideplus\.com|callistanise\.com/, mod: vidhide },
  { test: /lulustream\.com|luluvdo\.com/, mod: lulustream },
  { test: /vidara\.to/, mod: vidara },
  { test: /turbovidhls\.com/, mod: generic, label: 'turbo' },
  // TMDB URLs are tried against nxsha (multi-server) first, then vixsrc/PRO
  // Multi as a fallback if nxsha yields nothing.
  { test: /themoviedb\.org/, mod: nxsha, label: 'nxsha' },
  { test: /themoviedb\.org/, mod: vixsrc, label: 'vixsrc' },
  // screenscape public CORS proxies (unwrap and re-proxy through /proxy)
  { test: /workers\.dev/, mod: workers, label: 'screenscape' },
];

export function pickExtractor(embedUrl) {
  try {
    const host = new URL(embedUrl).hostname;
    const route = ROUTES.find((r) => r.test.test(host));
    return route ? route.mod : null;
  } catch {
    return null;
  }
}

// Extract given an embed URL. Returns { m3u8, referer, host, finalUrl }.
// Tries every matching route in order, falling back to the next if one throws
// (so e.g. a TMDB URL uses nxsha, and only falls back to vixsrc on failure).
export async function extract(embedUrl) {
  const routes = ROUTES.filter((r) => r.test.test(new URL(embedUrl).hostname));
  if (!routes.length) {
    throw new Error('No extractor registered for host: ' + embedUrl);
  }
  let lastErr;
  for (const route of routes) {
    try {
      return await route.mod.extract(embedUrl, route.label);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}


