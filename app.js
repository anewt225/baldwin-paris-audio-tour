// Baldwin's Saint-Germain — audio walking tour.
// Data: stops.json (the script) + audio/index.json (built by scripts/build_audio.py).

const $ = id => document.getElementById(id);
const [tour, audioIndex] = await Promise.all([
  fetch('stops.json').then(r => r.json()),
  fetch('audio/index.json').then(r => r.json()),
]);
const STOPS = tour.stops;
const MAIN = STOPS.filter(s => !s.bonus);
const clip = s => audioIndex.stops[s.id];
const audioUrl = s => `audio/${clip(s).file}`;

const audio = new Audio();
audio.preload = 'metadata';
let cur = 0;

// ---------- small helpers ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const visited = new Set(store.get('baldwin.visited', [0]));
const enc = encodeURIComponent;
const fmt = t => { t = Math.max(0, Math.floor(t || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const label = (s, i) => s.bonus ? '★' : String(i + 1);

// ---------- route link ----------
$('routeLink').href = `https://www.google.com/maps/dir/?api=1&origin=${enc(MAIN[0].addr)}`
  + `&destination=${enc(MAIN.at(-1).addr)}&waypoints=${enc(MAIN.slice(1, -1).map(s => s.addr).join('|'))}&travelmode=walking`;

// ---------- rendering ----------
function renderDots() {
  $('dots').innerHTML = STOPS.map((s, i) =>
    `<button class="dot ${i === cur ? 'on' : visited.has(i) ? 'done' : ''} ${i === nearest?.i ? 'near-me' : ''}" data-i="${i}"
      aria-label="${s.bonus ? 'Bonus stop' : `Stop ${i + 1}`}: ${s.title}" ${i === cur ? 'aria-current="step"' : ''}>${label(s, i)}</button>`).join('');
}
$('dots').onclick = e => { const b = e.target.closest('.dot'); if (b) go(+b.dataset.i); };

function render() {
  const s = STOPS[cur], nxt = STOPS[cur + 1];
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${enc(s.title + ', ' + s.addr)}`;
  const dirUrl = nxt && `https://www.google.com/maps/dir/?api=1&origin=${enc(s.addr)}&destination=${enc(nxt.addr)}&travelmode=${nxt.bonus ? 'transit' : 'walking'}`;
  $('stop').innerHTML = `
    <article class="card">
      <div class="num">${s.bonus ? '★ Optional bonus stop' : `Stop ${cur + 1} of ${MAIN.length}`}</div>
      <h2>${s.title}</h2>
      <div class="sub">${s.sub}</div>
      <div class="addr"><span>📍 ${s.addr}</span><a class="btn" href="${mapUrl}" target="_blank" rel="noopener">Map</a></div>
      <div class="text">${s.text.map((p, i) => `<p data-p="${i}">${p}</p>`).join('')}</div>
      <div class="walk"><b>Next:</b> ${s.walk}
        ${dirUrl ? `<div style="margin-top:10px"><a class="btn" href="${dirUrl}" target="_blank" rel="noopener">${nxt.bonus ? '🚇 Directions' : '🚶 Walking directions'} to ${nxt.title}</a></div>` : ''}
      </div>
    </article>`;
  $('nowT').textContent = `${label(s, cur)}. ${s.title}`;
  $('prev').disabled = cur === 0;
  $('next').disabled = cur === STOPS.length - 1;
  renderDots();
  renderNear();
  progress();
}

$('stop').onclick = e => {
  const p = e.target.closest('.text p');
  if (!p) return;
  audio.currentTime = clip(STOPS[cur]).starts[+p.dataset.p];
  audio.play();
};

function load(i) {
  cur = i;
  visited.add(i);
  store.set('baldwin.visited', [...visited]);
  history.replaceState(null, '', `#${i + 1}`);
  audio.src = audioUrl(STOPS[i]);
  audio.playbackRate = audio.defaultPlaybackRate = +$('rate').value;
  render();
  setMediaSession();
}

function go(i, { autoplay = false } = {}) {
  if (i < 0 || i >= STOPS.length || i === cur && audio.src) return;
  audio.pause();
  load(i);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (autoplay) audio.play();
}

// ---------- playback ----------
function highlight() {
  const starts = clip(STOPS[cur]).starts;
  let idx = -1;
  if (!audio.paused || audio.currentTime > 0) idx = starts.findLastIndex(t => audio.currentTime >= t - 0.05);
  if (audio.ended) idx = -1;
  document.querySelectorAll('.text p').forEach(p => p.classList.toggle('speaking', +p.dataset.p === idx));
}

function progress() {
  const dur = audio.duration || clip(STOPS[cur]).duration;
  const pct = dur ? (audio.currentTime / dur) * 100 : 0;
  $('fill').style.width = `${pct}%`;
  $('knob').style.left = `${pct}%`;
  $('bar').setAttribute('aria-valuenow', Math.round(pct));
  $('nowS').textContent = `${fmt(audio.currentTime)} / ${fmt(dur)} · ${STOPS[cur].sub}`;
  highlight();
}

function updateBtn() {
  const playing = !audio.paused && !audio.ended;
  $('play').textContent = playing ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

audio.addEventListener('timeupdate', progress);
audio.addEventListener('loadedmetadata', progress);
audio.addEventListener('seeked', progress);
audio.addEventListener('play', updateBtn);
audio.addEventListener('pause', updateBtn);
audio.addEventListener('ended', () => { updateBtn(); progress(); });
audio.addEventListener('error', () => { $('nowS').textContent = 'Audio unavailable — the text is all here to read along.'; });

$('play').onclick = () => (audio.paused ? audio.play() : audio.pause());
$('prev').onclick = () => go(cur - 1);
$('next').onclick = () => go(cur + 1);
$('rate').onchange = () => { audio.playbackRate = audio.defaultPlaybackRate = +$('rate').value; };

// seek bar: tap or drag
function seekFrom(e) {
  const r = $('bar').querySelector('.track').getBoundingClientRect();
  const dur = audio.duration || clip(STOPS[cur]).duration;
  audio.currentTime = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * dur;
}
$('bar').addEventListener('pointerdown', e => {
  $('bar').setPointerCapture(e.pointerId);
  seekFrom(e);
  const move = ev => seekFrom(ev);
  $('bar').addEventListener('pointermove', move);
  $('bar').addEventListener('pointerup', () => $('bar').removeEventListener('pointermove', move), { once: true });
});
$('bar').addEventListener('keydown', e => {
  const d = { ArrowLeft: -10, ArrowRight: 10 }[e.key];
  if (d) { audio.currentTime += d; e.preventDefault(); }
});

// ---------- lock screen / headphone controls ----------
function setMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const s = STOPS[cur];
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `${label(s, cur)}. ${s.title}`,
    artist: s.sub,
    album: tour.title,
    artwork: [192, 512].map(n => ({ src: new URL(`icons/icon-${n}.png`, location.href).href, sizes: `${n}x${n}`, type: 'image/png' })),
  });
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch {} };
  set('play', () => audio.play());
  set('pause', () => audio.pause());
  set('previoustrack', () => go(cur - 1, { autoplay: true }));
  set('nexttrack', () => go(cur + 1, { autoplay: true }));
  set('seekbackward', d => { audio.currentTime -= d.seekOffset || 10; });
  set('seekforward', d => { audio.currentTime += d.seekOffset || 10; });
  set('seekto', d => { audio.currentTime = d.seekTime; });
}

// ---------- "where am I?" ----------
let watchId = null, nearest = null, lastPos = null;

function haversine(a, b) {
  const R = 6371e3, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const dist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

function renderNear(msg) {
  const el = $('near');
  if (watchId === null) { el.className = 'near'; return; }
  el.className = 'near show';
  if (msg) { el.textContent = msg; return; }
  if (!nearest) { el.textContent = 'Finding your location…'; return; }
  const s = STOPS[nearest.i], here = nearest.d < 60;
  el.classList.toggle('here', here);
  el.innerHTML = `<span>${here ? `You're at <b>${s.title}</b>` : `Nearest stop: <b>${s.title}</b> · ${dist(nearest.d)}`}</span>`
    + (nearest.i !== cur ? `<button class="btn" type="button" data-go="${nearest.i}">Go to stop ${label(s, nearest.i)}</button>` : '');
}
$('near').onclick = e => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); };

$('locate').onclick = () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null; nearest = null;
    $('locate').classList.remove('on'); $('locate').setAttribute('aria-pressed', 'false');
    renderDots(); renderNear();
    return;
  }
  if (!('geolocation' in navigator)) { $('near').className = 'near show'; $('near').textContent = 'Location isn’t available in this browser.'; return; }
  $('locate').classList.add('on'); $('locate').setAttribute('aria-pressed', 'true');
  watchId = navigator.geolocation.watchPosition(pos => {
    lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    nearest = STOPS.map((s, i) => ({ i, d: haversine(lastPos, s) })).sort((a, b) => a.d - b.d)[0];
    renderDots(); renderNear();
  }, err => {
    renderNear(err.code === err.PERMISSION_DENIED ? 'Location permission was declined — tap a stop number instead.' : 'Couldn’t get your location right now.');
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  renderNear();
};

// ---------- offline ----------
async function offlineStatus() {
  if (!('caches' in window)) return;
  const urls = STOPS.map(audioUrl);
  const have = await Promise.all(urls.map(u => caches.match(new URL(u, location.href).href)));
  const n = have.filter(Boolean).length;
  $('offline').textContent = n === urls.length ? '✓ Saved for offline — works without data.' : n ? `Saving for offline… ${n}/${urls.length}` : '';
  if (n < urls.length) setTimeout(offlineStatus, 1500);
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(offlineStatus).catch(() => {});
}

// ---------- start ----------
const fromHash = parseInt(location.hash.slice(1), 10) - 1;
load(fromHash >= 0 && fromHash < STOPS.length ? fromHash : 0);
updateBtn();
