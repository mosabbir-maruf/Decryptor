// Unpacks dean-edwards `eval(function(p,a,c,k,e,d){...}('p',a,c,'k'.split('|')...))`
// packed payloads and pulls out .m3u8 URLs. Used for vidhide (callistanise)
// and lulustream (luluvdo).

const CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function toBase(n, b) {
  if (n === 0) return '0';
  let s = '';
  while (n) {
    s = CHARS[n % b] + s;
    n = Math.floor(n / b);
  }
  return s;
}

// Match the standard single-packed form. `s` flag tolerant of newlines.
const PACKED_RE =
  /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/;

export function unpackPacked(html) {
  const m = html.match(PACKED_RE);
  if (!m) return null;

  const payload = m[1].replace(/\\'/g, "'");
  const radix = parseInt(m[2], 10);
  const count = parseInt(m[3], 10);
  const words = m[4].split('|');

  const map = new Map();
  for (let i = 0; i < count; i++) {
    const tok = toBase(i, radix);
    map.set(tok, words[i] && words[i].length ? words[i] : tok);
  }

  return payload.replace(/\b\w+\b/g, (t) => map.get(t) ?? t);
}

export function findM3u8(text) {
  return [
    ...new Set(text.match(/https?:\/\/[^\s"'\\]+\.m3u8[^\s"']*/g) || []),
  ];
}

// Convenience: unpack (if needed) then find m3u8 links.
export function extractM3u8(html) {
  const unpacked = unpackPacked(html);
  return findM3u8(unpacked || html);
}

export default { unpackPacked, findM3u8, extractM3u8 };
