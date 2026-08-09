/**
 * Pekkas Fiske — synthesized audio.
 *
 * Everything is generated in the browser: no audio files are downloaded.
 * The whole bus runs through a low-pass that closes as the lure sinks, so
 * the world literally gets muffled the deeper you go, plus a slow drone
 * that swells in the dark. That single filter does more for the feeling of
 * depth than any amount of extra sound effects.
 */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.reelAt = 0;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();

      // master -> depth low-pass -> soft limiter -> out
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;

      this.lp = this.ctx.createBiquadFilter();
      this.lp.type = 'lowpass';
      this.lp.frequency.value = 18000;
      this.lp.Q.value = 0.4;

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 22;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.16;

      this.master.connect(this.lp).connect(comp).connect(this.ctx.destination);

      // Ambient drone: two detuned saws swelling with depth
      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0;
      this.droneGain.connect(this.master);
      [55, 55.6, 82.5].forEach((f, i) => {
        const o = this.ctx.createOscillator();
        o.type = i === 2 ? 'sine' : 'sawtooth';
        o.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.value = i === 2 ? 0.35 : 0.2;
        o.connect(g).connect(this.droneGain);
        o.start();
      });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Depth in metres drives the muffling and the drone. */
  setDepth(d, maxDepth) {
    if (!this.ctx) return;
    const k = Math.min(1, Math.max(0, d / maxDepth));
    const t = this.ctx.currentTime;
    // 18 kHz at the surface down to a dull 520 Hz on the bottom
    this.lp.frequency.setTargetAtTime(520 + (1 - k) * 17480, t, 0.25);
    this.droneGain.gain.setTargetAtTime(this.muted ? 0 : k * k * 0.16, t, 0.4);
  }

  tone(freq, dur, type = 'sine', gain = 0.5, sweep = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + sweep), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, gain = 0.4, freq = 800, q = 1, sweepTo = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 1.5;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(freq, t);
    filt.Q.value = q;
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    const env = this.ctx.createGain();
    env.gain.value = gain;
    src.connect(filt).connect(env).connect(this.master);
    src.start(t);
  }

  /** Fat splash: broadband burst sweeping down, plus a body thump. */
  splash(strength = 1) {
    this.noise(0.42 * strength, 0.55 * strength, 1600, 0.7, 260);
    this.tone(190, 0.28, 'sine', 0.34 * strength, -110);
  }

  plopp() {
    this.tone(320, 0.09, 'sine', 0.45, -170);
    this.noise(0.07, 0.16, 1200);
  }

  /** The strike: a taut snap plus line whip. */
  hook() {
    this.tone(760, 0.1, 'square', 0.42, 340);
    this.tone(190, 0.22, 'sine', 0.3, 90);
    this.noise(0.11, 0.34, 2400, 1.4);
  }

  /** Rising chime that climbs with the combo — the engine of the reel phase. */
  catchFish(n) {
    const step = Math.min(n, 12);
    const f = 392 * 1.0595 ** (step * 2);
    this.tone(f, 0.11, 'triangle', 0.42, 90);
    this.tone(f * 2, 0.07, 'sine', 0.16, 60, 0.02);
  }

  /** Ratcheting reel — call every frame, it rate-limits itself. */
  reelTick(speed) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const gap = Math.max(0.022, 0.14 - speed * 0.007);
    if (now - this.reelAt < gap) return;
    this.reelAt = now;
    this.tone(1200 + Math.random() * 500, 0.02, 'square', 0.075);
  }

  dodge(n) {
    this.tone(880 * 1.05 ** Math.min(n, 10), 0.05, 'sine', 0.13, 160);
  }

  junk() {
    this.tone(120, 0.32, 'sawtooth', 0.3, -50);
    this.noise(0.3, 0.3, 420, 0.8);
  }

  toss() {
    this.noise(0.34, 0.42, 900, 0.6, 2600);
    this.tone(220, 0.34, 'sawtooth', 0.26, 520);
  }

  tap(n) {
    const f = 523 * 1.0595 ** (Math.min(n, 10) * 2);
    this.tone(f, 0.1, 'square', 0.36, 180);
    this.tone(f * 1.5, 0.06, 'sine', 0.14, 0, 0.02);
  }

  miss() {
    this.tone(210, 0.22, 'sine', 0.26, -95);
  }

  zone() {
    [0, 130].forEach((d, i) => this.tone(294 * (i ? 1.5 : 1), 0.3, 'sine', 0.22, 0, d / 1000));
  }

  legend() {
    [0, 105, 210, 315, 450, 620].forEach((d, i) =>
      this.tone(392 * 2 ** (i / 4), 0.26, 'triangle', 0.46, 0, d / 1000));
    this.noise(0.8, 0.2, 3200, 0.8, 900);
  }

  fanfare() {
    [0, 1, 2, 4].forEach((s, i) =>
      this.tone(392 * 1.0595 ** (s * 2), 0.26, 'triangle', 0.44, 0, i * 0.11));
    this.tone(196, 0.9, 'sine', 0.24, 0, 0.44);
  }
}

export default Sfx;
