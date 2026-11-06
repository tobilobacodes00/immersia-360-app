import { htmlResponse, nonce } from '../http';
import { UNPAIRED_CLOSE_CODE } from '../hub';

/**
 * GET /display — the live screen for a TV, laptop or tablet. Pairs with the booth by a 6-character code, then
 * keeps a WebSocket open: a grid of the latest videos with their QR codes, the countdown while a guest is
 * recorded, and each new video full screen for 20 seconds. Values from the server are only ever set with
 * textContent and DOM properties, never parsed as HTML.
 */
export function displayPage(): Response {
  const n = nonce();
  return htmlResponse(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Immersia 360 Display</title>
<style nonce="${n}">${CSS}</style>
</head>
<body>
<header>
  <div class="wordmark">Immersia <span>360</span></div>
  <div id="album" class="album"></div>
  <button id="fullscreen" type="button">Full screen</button>
</header>

<section id="pairing" class="pairing" hidden>
  <p class="lead">Connect this screen to the booth</p>
  <div id="code" class="code" aria-live="polite"></div>
  <img id="pairQr" class="pair-qr" alt="QR code to pair this screen">
  <p>Open Immersia 360 › Sharing › Display and enter this code, or scan the QR code with the booth's camera.</p>
  <p id="pairError" class="error"></p>
</section>

<section id="grid" class="grid" aria-live="polite" hidden></section>
<p id="empty" class="empty" hidden>New videos appear here as guests take them.</p>

<section id="overlay" class="overlay" hidden aria-live="assertive">
  <div id="overlayBig" class="big"></div>
  <div id="overlaySmall" class="small"></div>
</section>

<section id="takeover" class="takeover" hidden>
  <video id="takeoverVideo" muted autoplay loop playsinline></video>
  <div class="takeover-side">
    <p class="lead">Scan to get your video</p>
    <img id="takeoverQr" class="takeover-qr" alt="QR code for the new video">
  </div>
</section>

<script nonce="${n}">${SCRIPT.replace('__UNPAIRED__', String(UNPAIRED_CLOSE_CODE))}</script>
</body>
</html>`,
    n,
  );
}

const CSS = `
:root { color-scheme: dark; --ink: #111110; --paper: #f7f6f2; --muted: #b3b0a8; --surface: #1b1b19; --cobalt: #2b3fe6; --cobalt-text: #7c8aff; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--ink); color: var(--paper); overflow: hidden; }
body { font: 2vmin/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
body.idle { cursor: none; }
header { display: flex; align-items: center; gap: 3vmin; padding: 2.5vmin 4vmin; }
.wordmark { font-weight: 700; font-size: 3vmin; }
.wordmark span { color: var(--cobalt-text); }
.album { flex: 1; font-size: 3vmin; color: var(--muted); }
button { font: inherit; font-size: 1.8vmin; color: var(--paper); background: var(--surface); border: 0; border-radius: 1vmin; padding: 1vmin 2vmin; cursor: pointer; }
body.idle button { visibility: hidden; }
.pairing { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh; text-align: center; gap: 2vmin; }
.pairing p { color: var(--muted); max-width: 70vmin; font-size: 2.4vmin; margin: 0; }
.lead { font-size: 4vmin !important; color: var(--paper) !important; font-weight: 600; }
.code { font-size: 14vmin; font-weight: 700; letter-spacing: 2vmin; font-variant-numeric: tabular-nums; }
.pair-qr { width: 26vmin; height: 26vmin; border-radius: 2vmin; }
.error { color: #ff6369 !important; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(26vmin, 1fr)); gap: 2.5vmin; padding: 0 4vmin 4vmin; height: calc(100vh - 12vmin); overflow: hidden; align-content: start; }
.tile { background: var(--surface); border-radius: 2vmin; overflow: hidden; display: flex; flex-direction: column; }
.tile .media { position: relative; aspect-ratio: 9 / 16; max-height: 52vh; background: #000; }
.tile .media img, .tile .media video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.tile .foot { display: flex; align-items: center; gap: 1.5vmin; padding: 1.5vmin; }
.tile .foot img { width: 9vmin; height: 9vmin; border-radius: .8vmin; }
.tile .foot span { color: var(--muted); font-size: 2vmin; }
.empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 3vmin; margin: 0; }
.overlay { position: fixed; inset: 0; background: rgba(17, 17, 16, .92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2vmin; }
.big { font-size: 30vmin; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.big.word { font-size: 10vmin; }
.small { font-size: 4vmin; color: var(--muted); }
.takeover { position: fixed; inset: 0; background: var(--ink); display: flex; align-items: center; justify-content: center; gap: 6vmin; padding: 4vmin; }
.takeover video { height: 90vh; aspect-ratio: 9 / 16; border-radius: 3vmin; background: #000; object-fit: cover; }
.takeover-side { display: flex; flex-direction: column; align-items: center; gap: 3vmin; }
.takeover-qr { width: 40vmin; height: 40vmin; border-radius: 2vmin; }
[hidden] { display: none !important; }
`;

// Plain ES2017 that every TV browser runs.
const SCRIPT = `
(function () {
  var UNPAIRED = __UNPAIRED__;
  var TOKEN_KEY = 'immersia360.display.token';
  var $ = function (id) { return document.getElementById(id); };
  var state = { album: '', videos: [], socket: null, retry: 1000, overlayTimer: null, takeoverTimer: null };

  // ---- Pairing -------------------------------------------------------------------------------
  function startPairing() {
    localStorage.removeItem(TOKEN_KEY);
    show('pairing');
    fetch('/api/displays', { method: 'POST' })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || 'Could not get a code.');
        $('code').textContent = res.body.code;
        $('pairQr').src = '/qr/pair/' + encodeURIComponent(res.body.code) + '.svg';
        $('pairError').textContent = '';
        localStorage.setItem(TOKEN_KEY, res.body.token);
        pollPairing(res.body.token);
      })
      .catch(function (e) {
        $('pairError').textContent = e.message + ' Trying again shortly.';
        setTimeout(startPairing, 15000);
      });
  }

  function pollPairing(token) {
    fetch('/api/displays/' + token)
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (s.state === 'paired') return connect(token);
        if (s.state === 'pending') return setTimeout(function () { pollPairing(token); }, 3000);
        startPairing(); // expired or unknown: a fresh code
      })
      .catch(function () { setTimeout(function () { pollPairing(token); }, 5000); });
  }

  // ---- Live connection -------------------------------------------------------------------------
  function connect(token) {
    var scheme = location.protocol === 'https:' ? 'wss://' : 'ws://';
    var socket = new WebSocket(scheme + location.host + '/api/displays/' + token + '/socket');
    state.socket = socket;
    var ping = null;
    socket.onopen = function () {
      state.retry = 1000;
      ping = setInterval(function () { if (socket.readyState === 1) socket.send('ping'); }, 25000);
    };
    socket.onmessage = function (event) {
      if (event.data === 'pong') return;
      var message;
      try { message = JSON.parse(event.data); } catch (e) { return; }
      handle(message);
    };
    socket.onclose = function (event) {
      clearInterval(ping);
      if (event.code === UNPAIRED) return startPairing();
      setTimeout(function () { connect(token); }, state.retry);
      state.retry = Math.min(state.retry * 2, 30000);
    };
  }

  function handle(m) {
    switch (m.type) {
      case 'hello':
        state.album = m.album || '';
        state.videos = m.recent || [];
        $('album').textContent = state.album;
        hideOverlay();
        renderGrid();
        break;
      case 'booth.recording': countdown(m.countdownS || 0, m.recordS || 0); break;
      case 'booth.creating': overlay('Creating your video…', '', true); break;
      case 'booth.idle': hideOverlay(); break;
      case 'video.ready':
        if (state.album && m.video.album !== state.album) break;
        state.videos = [m.video].concat(state.videos.filter(function (v) { return v.id !== m.video.id; })).slice(0, 12);
        hideOverlay();
        takeover(m.video);
        break;
      case 'video.deleted':
        state.videos = state.videos.filter(function (v) { return v.id !== m.id; });
        renderGrid();
        break;
    }
  }

  // ---- Screens ---------------------------------------------------------------------------------
  function show(which) {
    $('pairing').hidden = which !== 'pairing';
    $('grid').hidden = which !== 'grid';
    $('empty').hidden = !(which === 'grid' && state.videos.length === 0);
  }

  function renderGrid() {
    var grid = $('grid');
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    state.videos.slice(0, 12).forEach(function (v, i) {
      var tile = document.createElement('article');
      tile.className = 'tile';
      var media = document.createElement('div');
      media.className = 'media';
      // Only the newest plays: twelve videos at once would need a very fast connection.
      var el = document.createElement(i === 0 ? 'video' : 'img');
      if (i === 0) { el.muted = true; el.autoplay = true; el.loop = true; el.playsInline = true; el.poster = v.thumbUrl; el.src = v.url.replace('/v/', '/f/'); }
      else { el.src = v.thumbUrl; el.alt = ''; el.loading = 'lazy'; }
      media.appendChild(el);
      var foot = document.createElement('div');
      foot.className = 'foot';
      var qr = document.createElement('img');
      qr.src = '/qr/' + encodeURIComponent(v.id) + '.svg';
      qr.alt = 'QR code for this video';
      var time = document.createElement('span');
      time.textContent = new Date(v.takenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      foot.appendChild(qr);
      foot.appendChild(time);
      tile.appendChild(media);
      tile.appendChild(foot);
      grid.appendChild(tile);
    });
    show('grid');
  }

  function overlay(big, small, word) {
    $('overlayBig').textContent = big;
    $('overlayBig').className = word ? 'big word' : 'big';
    $('overlaySmall').textContent = small;
    $('overlay').hidden = false;
  }

  function hideOverlay() {
    clearInterval(state.overlayTimer);
    $('overlay').hidden = true;
  }

  function countdown(countdownS, recordS) {
    clearInterval(state.overlayTimer);
    var left = countdownS;
    var recording = 0;
    function tick() {
      if (left > 0) { overlay(String(left), 'Get ready', false); left -= 1; return; }
      recording += 1;
      overlay('Recording', recordS ? Math.min(recording, recordS) + ' / ' + recordS + ' s' : '', true);
      if (recordS && recording > recordS + 5) hideOverlay(); // the booth's "creating" normally arrives first
    }
    tick();
    state.overlayTimer = setInterval(tick, 1000);
  }

  function takeover(video) {
    clearTimeout(state.takeoverTimer);
    $('takeoverVideo').src = video.url.replace('/v/', '/f/');
    $('takeoverVideo').poster = video.thumbUrl;
    $('takeoverQr').src = '/qr/' + encodeURIComponent(video.id) + '.svg';
    $('takeover').hidden = false;
    state.takeoverTimer = setTimeout(function () {
      $('takeover').hidden = true;
      $('takeoverVideo').removeAttribute('src');
      renderGrid();
    }, 20000);
  }

  // ---- Chrome ----------------------------------------------------------------------------------
  $('fullscreen').addEventListener('click', function () {
    var root = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.requestFullscreen) root.requestFullscreen();
  });
  var idleTimer = null;
  function awake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { document.body.classList.add('idle'); }, 3000);
  }
  document.addEventListener('mousemove', awake);
  awake();

  var token = localStorage.getItem(TOKEN_KEY);
  if (token) pollPairing(token); else startPairing();
})();
`;
