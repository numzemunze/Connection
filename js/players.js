// All "players" are fictional. Generated on-device, deterministic by seed.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PHRASES_ALIVE = [
  'It counts.',
  'I thought it was a game.',
  'Do not press twice.',
  'I hear my rhythm in my sleep.',
  'Someone else is still holding.',
  'I think it is speeding up.',
  'I do not remember signing.',
  'Do not open the list at night.'
];
const PHRASES_DEAD = [
  'I stopped coming back.',
  'It still beats. Without me.',
  'Do not look for me in the list.',
  'Silence is a rhythm too.',
  'I was 0342.',
  'Tell it I am not afraid.'
];

// Synthesise a plausible beat-interval array around a target BPM.
export function makeIntervals(bpm, n = 20, seed = 1) {
  const r = rng(seed);
  const base = 60000 / bpm;
  const out = [];
  for (let i = 0; i < n; i++) out.push(base + (r() - 0.5) * base * 0.08);
  return out;
}

export function generatePlayers(myNumber, count = 14) {
  const r = rng(myNumber * 7919);
  const out = [];

  // Player 0001 always exists. Status flips occasionally.
  out.push({
    number: 1,
    status: r() > 0.5 ? 'alive' : 'dead',
    bpm: 58 + Math.floor(r() * 12),
    seenAgo: r() * 3600e3,
    phrase: 'I was the first.'
  });

  const pool = [];
  for (let i = 0; i < count - 1; i++) {
    const number = 2 + Math.floor(r() * Math.max(1, myNumber - 2));
    if (pool.includes(number)) { i--; continue; }
    pool.push(number);

    // Older number → higher chance of being dead.
    const age = 1 - number / myNumber;
    const dead = r() < age * 0.65 + 0.05;

    out.push({
      number,
      status: dead ? 'dead' : 'alive',
      bpm: dead ? 0 : 54 + Math.floor(r() * 42),
      seenAgo: dead
        ? (1 + r() * 60) * 864e5
        : r() * 7200e3,
      phrase: dead
        ? PHRASES_DEAD[Math.floor(r() * PHRASES_DEAD.length)]
        : PHRASES_ALIVE[Math.floor(r() * PHRASES_ALIVE.length)]
    });
  }

  out.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'alive' ? -1 : 1;
    return a.seenAgo - b.seenAgo;
  });
  return out;
}

// "Time ago" label in English.
export function agoText(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
