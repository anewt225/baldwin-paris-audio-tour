// Offline support. App shell is stale-while-revalidate (so edits reach phones on the next
// visit); narration MP3s are content-hashed, cached on first sight and served with
// HTTP Range support — iOS Safari won't play <audio> from a plain 200 cached response.

const VERSION = 'v2';
const SHELL_CACHE = `shell-${VERSION}`;
const AUDIO_CACHE = 'audio';
const FONT_CACHE = 'fonts';
const SHELL = [
  './', 'index.html', 'app.js', 'styles.css', 'stops.json', 'audio/index.json', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL);
    // Precache all narration (~3.5 MB) so the whole tour works without data.
    const index = await (await fetch('audio/index.json', { cache: 'no-cache' })).json();
    const audio = await caches.open(AUDIO_CACHE);
    const urls = Object.values(index.stops).map(s => `audio/${s.file}`);
    const missing = (await Promise.all(urls.map(async u => (await audio.match(u)) ? null : u))).filter(Boolean);
    await audio.addAll(missing);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('shell-') && k !== SHELL_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.endsWith('.mp3')) return e.respondWith(audioResponse(req));
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) return e.respondWith(staleWhileRevalidate(req, FONT_CACHE));
  if (url.origin === location.origin) return e.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
}

async function audioResponse(req) {
  const cache = await caches.open(AUDIO_CACHE);
  let res = await cache.match(req.url);
  if (!res) {
    try {
      res = await fetch(req.url); // full file, no Range, so it can be cached whole
      if (res.ok) await cache.put(req.url, res.clone());
    } catch { return Response.error(); }
  }
  const range = req.headers.get('range');
  if (!range || !res.ok) return res;

  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  const [, a, b] = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = a === '' ? size - Number(b) : Number(a);
  let end = a !== '' && b !== '' ? Number(b) : size - 1;
  start = Math.max(0, start); end = Math.min(end, size - 1);
  if (Number.isNaN(start) || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}
