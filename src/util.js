export function base64ToB64url(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBase64(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return b64;
}

export function toB64url(str) {
  const b64 = typeof btoa === 'function'
    ? btoa(str)
    : Buffer.from(str, 'utf8').toString('base64');
  return base64ToB64url(b64);
}

export function fromB64url(str) {
  return typeof atob === 'function'
    ? atob(b64urlToBase64(str))
    : Buffer.from(b64urlToBase64(str), 'base64').toString('utf8');
}
