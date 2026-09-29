// Heart rate sensor via camera.
// Sample a tiny frame, average (R - G) as a blood-volume proxy,
// remove the DC component, then find peaks in the last few seconds.

const W = 32, H = 32;
const FPS_MS = 33;              // ~30 fps
const WINDOW_MS = 12000;        // keep 12 s of raw samples
const MIN_AMP = 0.5;            // threshold: is a finger actually present
const MIN_IV = 300;             // 200 bpm upper bound
const MAX_IV = 2000;            // 30 bpm lower bound

export class PulseSensor extends EventTarget {
  constructor() {
    super();
    this.video = document.getElementById('cam');
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.samples = [];
    this.peaks = [];
    this.intervals = [];
    this.running = false;
    this.bpm = 0;
    this.quality = 0;
    this._last = 0;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 320 }, height: { ideal: 240 }
      },
      audio: false
    });
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();

    // Turn on torch if supported (Android/Chrome). iOS Safari has no torch API.
    try {
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.torch) await track.applyConstraints({ advanced: [{ torch: true }] });
    } catch (_) {}

    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
  }

  _loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this._loop);

    const now = performance.now();
    if (now - this._last < FPS_MS) return;
    this._last = now;
    if (this.video.readyState < 2) return;

    this.ctx.drawImage(this.video, 0, 0, W, H);
    const d = this.ctx.getImageData(0, 0, W, H).data;
    let sr = 0, sg = 0;
    for (let i = 0; i < d.length; i += 4) { sr += d[i]; sg += d[i + 1]; }
    const n = d.length / 4;
    this._push(now, (sr - sg) / n);
  };

  _push(t, v) {
    this.samples.push({ t, v });
    const cut = t - WINDOW_MS;
    while (this.samples.length && this.samples[0].t < cut) this.samples.shift();
    if (this.samples.length < 90) return;

    // Rolling mean over ~1.2 s → removes DC drift.
    const win = this.samples.slice(-36);
    const mean = win.reduce((a, p) => a + p.v, 0) / win.length;
    const det = this.samples.map(p => ({ t: p.t, v: p.v - mean }));

    // Analyse the last ~4 s only.
    const seg = det.slice(-120);
    let max = -Infinity, min = Infinity;
    for (const p of seg) { if (p.v > max) max = p.v; if (p.v < min) min = p.v; }
    const amp = max - min;
    this.quality = amp;

    if (amp < MIN_AMP) { this._setBpm(0); return; }

    // Peaks above 55% of the amplitude, local max over ±2 samples.
    const thr = min + amp * 0.55;
    const peaks = [];
    for (let i = 2; i < seg.length - 2; i++) {
      const p = seg[i];
      if (p.v > thr &&
          p.v > seg[i-1].v && p.v > seg[i+1].v &&
          p.v > seg[i-2].v && p.v > seg[i+2].v) {
        if (!peaks.length || p.t - peaks[peaks.length-1] > MIN_IV) peaks.push(p);
      }
    }

    this.peaks = peaks;
    if (peaks.length < 3) { this._setBpm(0); return; }

    // Intervals between peaks, filtered to plausible range.
    const iv = [];
    for (let i = 1; i < peaks.length; i++) {
      const d = peaks[i].t - peaks[i-1].t;
      if (d >= MIN_IV && d <= MAX_IV) iv.push(d);
    }
    if (iv.length < 2) { this._setBpm(0); return; }

    // Median is more robust than mean against missed/extra beats.
    iv.sort((a, b) => a - b);
    const med = iv[Math.floor(iv.length / 2)];
    this.intervals = iv;
    this._setBpm(Math.round(60000 / med));
  }

  _setBpm(v) {
    if (v === this.bpm) return;
    this.bpm = v;
    this.dispatchEvent(new CustomEvent('bpm', { detail: { bpm: v, quality: this.quality } }));
  }
}
