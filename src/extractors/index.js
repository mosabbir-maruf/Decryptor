// Dispatcher: pick the right extractor from the embed URL host.

import * as vidhide from './vidhide.js';
import * as lulustream from './lulustream.js';
import * as vidara from './vidara.js';
import * as generic from './generic.js';
import * as vixsrc from './vixsrc.js';

const ROUTES = [
  { test: /vidhideplus\.com|callistanise\.com/, mod: vidhide },
  { test: /lulustream\.com|luluvdo\.com/, mod: lulustream },
  { test: /vidara\.to/, mod: vidara },
  { test: /turbovidhls\.com/, mod: generic, label: 'turbo' },
  { test: /themoviedb\.org/, mod: vixsrc, label: 'vixsrc' },
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
export async function extract(embedUrl) {
  const route = ROUTES.find((r) => r.test.test(new URL(embedUrl).hostname));
  if (!route) {
    throw new Error('No extractor registered for host: ' + embedUrl);
  }
  return route.mod.extract(embedUrl, route.label);
}

export default { extract, pickExtractor };
