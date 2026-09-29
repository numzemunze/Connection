// The signature is persisted in three independent places.
const KEY = 'cl.sig.v1';
const COOKIE = 'cl_sig';
const PHANTOM_KEY = 'cl.phantom.v1';
const PHANTOM_COOKIE = 'cl_phantom';

function cookieSet(name, val, days = 3650) {
  const d = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(val)}; expires=${d}; path=/; SameSite=Lax`;
}
function cookieGet(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('connectlife', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('k');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(k, v) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction('k', 'readwrite');
      tx.objectStore('k').put(v, k);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch (_) {}
}
async function idbGet(k) {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const tx = db.transaction('k', 'readonly');
      const rq = tx.objectStore('k').get(k);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    });
  } catch (_) { return null; }
}

export async function save(sig) {
  const raw = JSON.stringify(sig);
  try { localStorage.setItem(KEY, raw); } catch (_) {}
  cookieSet(COOKIE, raw);
  await idbSet(KEY, sig);
}

export async function load() {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return JSON.parse(v);
  } catch (_) {}
  const c = cookieGet(COOKIE);
  if (c) { try { return JSON.parse(c); } catch (_) {} }
  const i = await idbGet(KEY);
  if (i) return i;
  return null;
}

const EPOCH = Date.UTC(2020, 0, 1);
export const todayNumber = () =>
  Math.floor((Date.now() - EPOCH) / 864e5) + 1;

export const fmt = n => String(n).padStart(4, '0');

/* ---------- Phantom row (once per 24 h) ---------- */

export function getPhantomLast() {
  try {
    const v = localStorage.getItem(PHANTOM_KEY);
    if (v) return parseInt(v, 10) || 0;
  } catch (_) {}
  const c = cookieGet(PHANTOM_COOKIE);
  return c ? parseInt(c, 10) || 0 : 0;
}

export function setPhantomLast(t) {
  try { localStorage.setItem(PHANTOM_KEY, String(t)); } catch (_) {}
  cookieSet(PHANTOM_COOKIE, String(t));
}

export const DAY_MS = 24 * 3600 * 1000;
