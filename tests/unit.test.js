import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unpackPacked, findM3u8, extractM3u8 } from '../src/unpack.js';
import { encodeProxyUrl, rewritePlaylist, isPlaylist } from '../src/proxy.js';

const CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const toBase = (n, b) => {
  if (n === 0) return '0';
  let s = '';
  while (n) { s = CHARS[n % b] + s; n = Math.floor(n / b); }
  return s;
};

// Minimal dean-edwards-style packer to create a test vector.
function pack(input) {
  const words = [...new Set(input.match(/\w+/g) || [])];
  const dict = new Map(words.map((w, i) => [w, i]));
  const radix = 62;
  const payload = input.replace(/\b\w+\b/g, (m) => toBase(dict.get(m), radix));
  return (
    `eval(function(p,a,c,k,e,d){return p}('${payload.replace(/'/g, "\\'")}',` +
    `${radix},${words.length},'${words.join('|')}'.split('|'),0,{}))`
  );
}

test('unpack reversed a packed payload and finds m3u8', () => {
  const html =
    'var src="https://acek-cdn.com/abc123/master.m3u8"; player.load(src);';
  const packed = pack(html);
  const unpacked = unpackPacked(packed);
  assert.ok(unpacked && unpacked.includes('master.m3u8'));
  const links = findM3u8(unpacked);
  assert.equal(links[0], 'https://acek-cdn.com/abc123/master.m3u8');
});

test('extractM3u8 falls back to raw html when not packed', () => {
  const html = 'x=https://cdn.test/v/1/index.m3u8';
  assert.deepEqual(extractM3u8(html), ['https://cdn.test/v/1/index.m3u8']);
});

test('rewritePlaylist rewrites relative + absolute urls through proxy', () => {
  const playlist = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=800000',
    '720p/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=400000',
    'https://other.host/360p/index.m3u8',
    '#EXT-X-KEY:METHOD=AES-128,URI="key.key"',
  ].join('\n');

  const out = rewritePlaylist(
    playlist,
    'https://cdn.test/v/master.m3u8',
    'https://cdn.test',
    'https://proxy.local'
  );

  assert.match(out, /https:\/\/proxy\.local\/proxy\?url=https%3A%2F%2Fcdn\.test%2Fv%2F720p%2Findex\.m3u8/);
  assert.match(out, /https:\/\/proxy\.local\/proxy\?url=https%3A%2F%2Fother\.host%2F360p%2Findex\.m3u8/);
  assert.match(out, /https:\/\/proxy\.local\/proxy\?url=https%3A%2F%2Fcdn\.test%2Fv%2Fkey\.key/);
});

test('isPlaylist detects by content-type and by body', () => {
  assert.equal(isPlaylist('', 'application/vnd.apple.mpegurl'), true);
  assert.equal(isPlaylist('#EXTM3U\n#EXTINF:4,\nseg.ts', ''), true);
  assert.equal(isPlaylist('not a playlist', 'text/plain'), false);
});

test('encodeProxyUrl encodes target and referer', () => {
  const u = encodeProxyUrl('https://a.com/x.m3u8', 'https://a.com', 'https://p.local');
  assert.ok(u.startsWith('https://p.local/proxy?'));
  assert.ok(u.includes('url=' + encodeURIComponent('https://a.com/x.m3u8')));
  assert.ok(u.includes('referer=' + encodeURIComponent('https://a.com')));
});
