// Heartbeat via Web Audio.
// Two components: a low sine "thump" (felt) and a tiny triangle click (heard).
// The master gain is deliberately low — this should be felt, not heard.

let ctx = null;
let master = null;

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

// intensity 0..1 scales the thump. Default is a calm resting beat.
export function beat(intensity = 1) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const v = Math.max(0, Math.min(1, intensity));

  // Low body: 80 Hz → 40 Hz, quick attack, exponential tail.
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.65 * v, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.22);

  // High transient: a faint click that makes the thump feel "placed".
  const click = ctx.createOscillator();
  const cg = ctx.createGain();
  click.type = 'triangle';
  click.frequency.value = 220;
  cg.gain.setValueAtTime(0.14 * v, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  click.connect(cg).connect(master);
  click.start(t);
  click.stop(t + 0.05);
}

export function setVolume(v) {
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}
