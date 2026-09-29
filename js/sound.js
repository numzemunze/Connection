// All sound for Connection.
// Philosophy: felt, not heard. Nothing should be obviously "a sound effect".
// Everything runs through one master gain so volume is controlled globally.

let ctx = null;
let master = null;
let noiseBuf = null;

/* ---------- Lifecycle ---------- */

export function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);
}

export async function resume() {
  if (ctx && ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (_) {}
  }
}

export function setVolume(v) {
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}

/* ---------- Helpers ---------- */

function noise() {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function noiseSource() {
  const s = ctx.createBufferSource();
  s.buffer = noise();
  s.loop = true;
  return s;
}

/* ---------- Beat ---------- */
// Two components: low sine "thump" (felt) and tiny triangle click (heard).
// Every beat is slightly detuned and offset, so it never feels mechanical.

export function beat(intensity = 1) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const v = Math.max(0, Math.min(1, intensity));

  // Random ±3% detune so the pitch drifts between beats.
  const jitter = 1 + (Math.random() - 0.5) * 0.06;
  const f0 = 80 * jitter;
  const f1 = 40 * jitter;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + 0.08);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.65 * v, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.22);

  const click = ctx.createOscillator();
  const cg = ctx.createGain();
  click.type = 'triangle';
  click.frequency.value = 200 + Math.random() * 40;
  cg.gain.setValueAtTime(0.14 * v, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  click.connect(cg).connect(master);
  click.start(t);
  click.stop(t + 0.05);
}

/* ---------- Dead beat ---------- */
// Two detuned low sines collapsing downward. Sounds wrong on purpose.

export function deadBeat() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;

  [42, 41.2].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(i === 0 ? 0.5 : 0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.7);
  });
}

/* ---------- Drone ---------- */
// Continuous low hum. Fades in over 3 s, out over 1.5 s.
// Two slightly detuned sines create an uneasy beating wobble.

let drone = null;

export function startDrone() {
  if (!ctx || !master || drone) return;
  const t = ctx.currentTime;

  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const o3 = ctx.createOscillator();  // quiet octave for phone speakers
  o1.type = 'sine'; o1.frequency.value = 65;
  o2.type = 'sine'; o2.frequency.value = 65.4;
  o3.type = 'sine'; o3.frequency.value = 130;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 240;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.055, t + 3);

  const g3 = ctx.createGain();
  g3.gain.value = 0.25;

  o1.connect(lp);
  o2.connect(lp);
  o3.connect(g3).connect(lp);
  lp.connect(g).connect(master);

  o1.start(t); o2.start(t); o3.start(t);
  drone = { o1, o2, o3, g };
}

export function stopDrone() {
  if (!drone) return;
  const { o1, o2, o3, g } = drone;
  const t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(0, t + 1.5);
  o1.stop(t + 1.6);
  o2.stop(t + 1.6);
  o3.stop(t + 1.6);
  drone = null;
}

/* ---------- Whisper ---------- */
// Bandpassed noise with a slow LFO on the filter.
// Sounds like breath from another room. Lasts ~1.4 s.

export function whisper(intensity = 0.5) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const v = Math.max(0, Math.min(1, intensity));

  const src = noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1200;
  bp.Q.value = 8;

  // LFO wobbles the bandpass centre — this is what makes it "speak".
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 3.7;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 500;
  lfo.connect(lfoGain).connect(bp.frequency);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.045 * v, t + 0.2);
  g.gain.linearRampToValueAtTime(0, t + 1.4);

  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 1.5);
  lfo.start(t);
  lfo.stop(t + 1.5);
}

/* ---------- Static ---------- */
// Short high-frequency burst. Sounds like a click or a bad contact.

export function static_(intensity = 0.3) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const v = Math.max(0, Math.min(1, intensity));

  const src = noiseSource();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2000;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.07 * v, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

  src.connect(hp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.2);
}

/* ---------- Rumble ---------- */
// Low-passed noise whose cutoff sweeps up then down. ~2.6 s.
// Used when two rhythms "connect" — feels like something opening.

export function rumble() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;

  const src = noiseSource();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(80, t);
  lp.frequency.exponentialRampToValueAtTime(320, t + 0.8);
  lp.frequency.exponentialRampToValueAtTime(60, t + 2.5);
  lp.Q.value = 2;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.14, t + 0.4);
  g.gain.linearRampToValueAtTime(0, t + 2.6);

  src.connect(lp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 2.8);
}
