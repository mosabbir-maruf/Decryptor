// SR7 lulustream: lulustream.com -> luluvdo.com
// Same packer as vidhide; m3u8 on tnmr.org (CDN may 403 from datacenter IPs).
// Identical flow to the generic packed-JS extractor, so we delegate to it.

import { extract as extractPacked } from './generic.js';

export const extract = (embedUrl) => extractPacked(embedUrl, 'lulustream');
