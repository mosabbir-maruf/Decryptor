import CryptoJS from 'crypto-js';
import { UA } from './../http.js';
import { base64ToB64url, b64urlToBase64 } from './../util.js';

const API_BASE = 'https://web.nxsha.app';
const KEY = 'S8x!Jk4ZP1uG8$my';

function encodeData(obj) {
  const payload = {
    ...obj,
    _req_ts: Date.now(),
    _req_salt: Math.random().toString(36).slice(2, 12),
  };
  return base64ToB64url(
    CryptoJS.AES.encrypt(JSON.stringify(payload), KEY).toString()
  );
}

function decodeData(str) {
  if (!str) return null;
  const text = CryptoJS.AES
    .decrypt(b64urlToBase64(str), KEY)
    .toString(CryptoJS.enc.Utf8);
  if (!text) return null;
  try {
    const obj = JSON.parse(text);
    delete obj._req_ts;
    delete obj._req_salt;
    return obj;
  } catch {
    return null;
  }
}

function parseInput(input) {
  const raw = String(input || '').trim();
  let tmdbId = null;
  let type = 'movie';
  let season = '1';
  let episode = '1';

  const numMatch = raw.match(/^(\d+)$/);
  if (numMatch) {
    tmdbId = numMatch[1];
  } else {
    let u;
    try {
      u = new URL(raw);
    } catch {
      throw new Error('Unrecognized nxsha/TMDB input: ' + raw);
    }
    const host = u.hostname;
    const path = u.pathname;
    if (host.includes('themoviedb.org')) {
      const m = path.match(/\/(movie|tv)\/(\d+)(?:\/season\/(\d+)\/episode\/(\d+))?/);
      if (!m) throw new Error('Could not parse TMDB URL: ' + raw);
      type = m[1];
      tmdbId = m[2];
      if (m[3]) season = m[3];
      if (m[4]) episode = m[4];
    } else {
      throw new Error('Unsupported host for nxsha extractor: ' + host);
    }
  }

  if (!tmdbId) throw new Error('No TMDB id found in input');
  return { tmdbId, type, season, episode };
}

async function apiGet(path, query, signal) {
  const url = `${API_BASE}${path}?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    signal,
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      Referer: API_BASE + '/',
    },
  });
  if (!res.ok) throw new Error(`nxsha API ${path} -> HTTP ${res.status}`);
  const json = await res.json();
  return decodeData(json._hash);
}

function pickSource(sources) {
  if (!Array.isArray(sources)) return null;
  const m3u8 = sources.find((s) => s.type === 'm3u8' && !s.isEmbed);
  if (m3u8) return { source: m3u8, kind: 'm3u8' };
  const mp4 = sources.find((s) => s.type === 'mp4' && !s.isEmbed);
  if (mp4) return { source: mp4, kind: 'mp4' };
  return null;
}

function buildProxyParts(chosen) {
  const headers = chosen.source.headers || {};
  const referer = headers.Referer || '';
  const extra = {};
  for (const [k, v] of Object.entries(headers)) {
    extra[k.toLowerCase()] = v;
  }
  return { referer, extra };
}

async function pool(items, limit, worker) {
  const results = [];
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

export async function extract(embedUrl, _label) {
  const { tmdbId, type, season, episode } = parseInput(embedUrl);

  const serversRes = await apiGet(
    '/api/servers',
    encodeData({ tmdbId, type, imdb_id: '', season, episode, method: 'stream' })
  );
  const servers = Array.isArray(serversRes?.servers) ? serversRes.servers : [];
  if (!servers.length) throw new Error('nxsha returned no servers');

  const withSources = await pool(servers, 8, async (server) => {
    try {
      const srcRes = await apiGet(
        '/api/sources',
        encodeData({
          provider: server.scraper || server.id,
          tmdbId,
          imdb_id: '',
          type,
          season,
          episode,
          method: 'stream',
        }),
        AbortSignal.timeout(12000)
      );
      const chosen = pickSource(srcRes?.sources);
      if (!chosen) return null;
      const { referer, extra } = buildProxyParts(chosen);
      const isWorker = /workers\.dev/i.test(chosen.source.url);
      const proxyReferer = isWorker ? 'https://web.nxsha.app/' : referer;
      const proxyExtra = isWorker ? { ...extra, origin: 'https://web.nxsha.app/' } : extra;
      return {
        name: server.name || server.scraper,
        type: chosen.kind,
        url: chosen.source.url,
        referer: proxyReferer,
        headers: proxyExtra,
        quality: chosen.source.quality || chosen.source.label || '',
      };
    } catch {
      return null;
    }
  });

  const playable = withSources.filter(Boolean);
  if (!playable.length) {
    throw new Error('nxsha: no playable sources found across servers');
  }

  const top = playable[0];
  return {
    m3u8: top.url,
    referer: top.referer,
    headers: top.headers,
    host: 'nxsha',
    finalUrl: embedUrl,
    type: top.type,
    servers: playable,
  };
}
