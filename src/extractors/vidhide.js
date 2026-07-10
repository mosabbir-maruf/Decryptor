// SR2 vidhide: vidhideplus.com -> 302 -> callistanise.com
// Classic packed JS; unpack -> master.m3u8 on acek-cdn.com. Identical flow to
// the generic packed-JS extractor, so we delegate to it with a 'vidhide' label.

import { extract as extractPacked } from './generic.js';

export const extract = (embedUrl) => extractPacked(embedUrl, 'vidhide');
