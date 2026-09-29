import { PulseSensor } from './pulse.js';
import * as store from './store.js';
import { generatePlayers, makeIntervals, agoText } from './players.js';
import * as sound from './sound.js';

const $ = s => document.querySelector(s);
const show = id => {
  document.querySelectorAll('.screen').forEach(e => e.classList.remove('active'));
  $(id).classList.add('active');
};

const sensor = new PulseSensor();
let signature = null;
let players = [];
let cardPlayer = null;

/* ---------- Replay a beat pattern as a pulsing dot ---------- */
function pulseLoop(el, intervals, { sound: withSound = false } = {}) {
  let phase = 0, last = performance.now(), i = 0;
  let lastBeatAt = 0;
  (function tick(now) {
    if (!el.isConnected) return;
    requestAnimationFrame(tick);
    const dt = (now - last) / 1000; last = now;
    const period = intervals[i % intervals.length] / 1000;
    phase += dt / period;
    if (phase >= 1) {
      phase -= 1;
      i++;
      // Fire the thump once per wrap, throttled to 250 ms minimum.
      if (withSound && now - lastBeatAt > 250) {
        lastBeatAt = now;
        sound.beat(1);
      }
    }
    // Sharp attack, soft decay — feels like a heartbeat.
    const s = 1 + 0.55 * Math.exp(-phase * 7);
    el.style.transform = `scale(${s.toFixed(3)})`;
  })(performance.now());
}

/* ---------- 1. RITUAL ---------- */
const RITUAL_MS = 13000;
const CIRC = 2 * Math.PI * 88;

async function startRitual() {
  const fill = $('#ring-fill');
  const bpmEl = $('#ritual-bpm');
  const hint = $('#ritual-hint');

  // Unlock AudioContext on the first user gesture.
  sound.init();
  sound.resume();

  fill.style.strokeDasharray = CIRC;
  fill.style.strokeDashoffset = CIRC;

  try {
    await sensor.start();
  } catch (e) {
    hint.textContent = 'No camera access';
    return;
  }

  sensor.addEventListener('bpm', e => {
    bpmEl.textContent = e.detail.bpm ? e.detail.bpm : '--';
    if (e.detail.bpm) hint.textContent = 'Hold. Do not let go.';
  });

  const t0 = performance.now();
  const collected = [];

  const timer = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / RITUAL_MS);
    fill.style.strokeDashoffset = CIRC * (1 - p);

    if (sensor.intervals && sensor.intervals.length) {
      collected.push(...sensor.intervals.slice(-3));
    }
    if (p >= 1) {
      clearInterval(timer);
      finishRitual(collected, sensor.bpm);
    }
  }, 120);
}

async function finishRitual(collected, bpm) {
  sensor.stop();

  // Fall back to a synthesised rhythm if the camera didn't yield enough beats.
  const intervals = collected.length >= 8
    ? collected.slice(-24)
    : makeIntervals(bpm || 68, 24, Date.now() & 0xffff);

  signature = {
    number: store.todayNumber(),
    bpm: bpm || Math.round(
      60000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length)
    ),
    intervals,
    signedAt: Date.now(),
    phrase: 'You already signed.'
  };
  await store.save(signature);

  if (navigator.vibrate) navigator.vibrate([40, 60, 120]);

  $('#s-ritual').style.transition = 'opacity .6s';
  $('#s-ritual').style.opacity = '0';
  setTimeout(() => {
    $('#s-ritual').style.opacity = '';
    enterSigned();
  }, 600);
}

/* ---------- 2. SIGNED ---------- */
function enterSigned() {
  show('#s-signed');
  pulseLoop($('#main-dot'), signature.intervals, { sound: true });
  $('#to-list').onclick = openList;
}

/* ---------- 3. LIST ---------- */
function openList() {
  players = generatePlayers(signature.number, 15);
  const list = $('#list');
  list.innerHTML = '';

  const me = document.createElement('div');
  me.className = 'row me';
  me.innerHTML = `
    <span class="r-dot"></span>
    <span class="r-num">You · ${store.fmt(signature.number)}</span>
    <span class="r-bpm">${signature.bpm} · now</span>`;
  list.appendChild(me);

  for (const p of players) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span class="r-dot ${p.status === 'dead' ? 'dead' : ''}"></span>
      <span class="r-num">${store.fmt(p.number)}</span>
      <span class="r-bpm">${p.status === 'dead' ? '—' : p.bpm} · ${agoText(p.seenAgo)}</span>`;
    row.onclick = () => openCard(p);
    list.appendChild(row);
  }

  // Phantom row, at most once per 24 h.
  const now = Date.now();
  if (now - store.getPhantomLast() > store.DAY_MS) {
    store.setPhantomLast(now);
    const delay = 1500 + Math.random() * 2500;
    setTimeout(() => spawnPhantom(list), delay);
  }

  show('#s-list');
}

/* ---------- Phantom row ---------- */
function spawnPhantom(list) {
  if (!document.body.contains(list)) return;
  const row = document.createElement('div');
  row.className = 'row phantom';
  row.innerHTML = `
    <span class="r-dot dead"></span>
    <span class="r-num">— —</span>
    <span class="r-bpm">— · just now</span>`;
  row.onclick = () => openPhantomCard();
  list.appendChild(row);
  setTimeout(() => row.remove(), 1000);
}

function openPhantomCard() {
  cardPlayer = null;
  $('#card-num').textContent = '— —';

  const dot = $('#card-dot');
  dot.classList.add('flat');
  dot.style.transform = '';

  $('#card-body').innerHTML = `
    <div><div class="k">STATUS</div><div class="v">dead</div></div>
    <div><div class="k">RHYTHM</div><div class="v">0</div></div>
    <div><div class="k">LAST BEAT</div><div class="v">just now</div></div>
    <div class="phrase">"You are next."</div>`;

  show('#s-card');
}

/* ---------- 4. CARD ---------- */
function openCard(p) {
  cardPlayer = p;
  $('#card-num').textContent = store.fmt(p.number);

  const dot = $('#card-dot');
  dot.classList.toggle('flat', p.status === 'dead');
  dot.style.transform = '';

  const body = $('#card-body');
  body.innerHTML = `
    <div><div class="k">STATUS</div><div class="v">${p.status === 'dead' ? 'dead' : 'alive'}</div></div>
    <div><div class="k">RHYTHM</div><div class="v">${p.status === 'dead' ? '0' : p.bpm}</div></div>
    <div><div class="k">LAST BEAT</div><div class="v">${agoText(p.seenAgo)}</div></div>
    <div class="phrase">"${p.phrase}"</div>
  `;

  if (p.status === 'alive') {
    pulseLoop(dot, makeIntervals(p.bpm, 20, p.number), { sound: true });
    dot.addEventListener('pointerdown', onConnect);
    dot.addEventListener('pointerup', onDisconnect);
    dot.addEventListener('pointercancel', onDisconnect);
  }

  show('#s-card');
}

let connectTimer = null;
function onConnect() {
  if (!cardPlayer || cardPlayer.status !== 'alive') return;
  const dot = $('#card-dot');
  // Echo: the other dot drifts in with a 400 ms delay.
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (dot.isConnected) {
      pulseLoop(dot, makeIntervals(cardPlayer.bpm, 20, cardPlayer.number + 7),
                { sound: true });
    }
  }, 400);
}
function onDisconnect() {
  clearTimeout(connectTimer);
}

/* ---------- BOOT ---------- */
(async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  const saved = await store.load();
  if (saved) {
    signature = saved;
    enterSigned();
  } else {
    show('#s-ritual');
    $('#ritual-hint').textContent = 'Place your finger on the camera';
    document.body.addEventListener('pointerdown', function once() {
      document.body.removeEventListener('pointerdown', once);
      startRitual();
    });
  }

  $('#back-1').onclick = () => show('#s-signed');
  $('#back-2').onclick = () => { onDisconnect(); show('#s-list'); };
})();
