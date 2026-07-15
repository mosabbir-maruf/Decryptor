// Handles screenscape's public CORS proxies (e.g. *.xkxnnxk15.workers.dev)
// that wrap a real CDN URL like:
//   https://<id>.workers.dev/?url=<enc target>&referer=<enc origin>&origin=<enc origin>
// We don't route through their proxy — we unwrap it and re-proxy the raw CDN
// URL through OUR /proxy, forwarding the Referer (e.g. themoviebox.org) that
// the source CDN requires. This makes pasted screenscape stream URLs play in
// the player without depending on their workers.dev instance.
//
// Note: this is the manual path. For full auto-resolution of a server like
// VidStpM from an nxsha watch URL, the signed nxsha.screenscape.me API is
// needed (see MEMORY / screenscape extractor work).

export async function extract(input) {
  const u = new URL(input);
  const target = u.searchParams.get('url');
  const referer = u.searchParams.get('referer') || '';
  const origin = u.searchParams.get('origin') || '';
  if (!target) {
    throw new Error('screenscape proxy URL missing ?url= parameter');
  }
  const headers = {};
  if (origin) headers.origin = origin;
  const isPlaylist = /\.m3u8(\?|$)/i.test(target);
  return {
    m3u8: target,
    referer,
    headers,
    host: 'screenscape',
    finalUrl: input,
    type: isPlaylist ? 'm3u8' : 'mp4',
  };
}
