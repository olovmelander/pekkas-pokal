/**
 * Pekkas Fäktning — synthesized salle sound.
 *
 * The two sounds that carry a fencing game are the blade CLINK of a parry
 * (Nidhogg's designers called it the most satisfying sound in the game)
 * and the harsh electric BUZZER of the scoring box. Both are synthesized,
 * along with footwork, swishes and the referee's ready-tones.
 */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.34;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -15;
      comp.ratio.value = 5;
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
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

  noiseHit(dur, gain, freq, q = 1, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.value = gain;
    src.connect(bp).connect(env).connect(this.master);
    src.start(t);
  }

  /** Blade whoosh on a lunge. */
  swish() {
    this.noiseHit(0.16, 0.4, 2600, 0.8);
    this.noiseHit(0.12, 0.2, 4200, 1.2, 0.02);
  }

  /** The parry: bright metallic ring with two inharmonic partials. */
  clink() {
    this.tone(2364, 0.16, 'sine', 0.4);
    this.tone(3571, 0.1, 'sine', 0.22, 0, 0.004);
    this.tone(1487, 0.24, 'sine', 0.18);
    this.noiseHit(0.03, 0.35, 5200, 2);
  }

  /** The scoring box: harsh, electric, unmistakable. */
  buzzer() {
    this.tone(310, 0.42, 'square', 0.34);
    this.tone(313, 0.42, 'square', 0.22);
    this.tone(155, 0.42, 'sawtooth', 0.18);
  }

  /** Light shuffle of feet on the piste. */
  step() {
    this.noiseHit(0.05, 0.12, 420, 0.7);
  }

  /** A short jab that commits to nothing. */
  feint() {
    this.noiseHit(0.08, 0.24, 3000, 1);
  }

  /** Stagger — leather and a grunt of air. */
  stagger() {
    this.noiseHit(0.14, 0.28, 700, 0.8);
    this.tone(140, 0.16, 'sine', 0.2, -50);
  }

  /** En garde … klara … KÖR: three referee tones, last one bright. */
  ready(step) {
    if (step < 2) this.tone(440, 0.12, 'sine', 0.28);
    else this.tone(880, 0.2, 'triangle', 0.4);
  }

  /** Spectator murmur that swells briefly after a touch. */
  crowd(excited = 0.5) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const dur = 0.9;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const env = Math.sin((i / n) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500 + excited * 700;
    const g = this.ctx.createGain();
    g.gain.value = 0.1 + excited * 0.14;
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
  }

  verdictWin() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(392 * 1.0595 ** s, 0.3, 'triangle', 0.4, 0, i * 0.1));
  }

  verdictLose() {
    [7, 3, 0].forEach((s, i) => this.tone(294 * 1.0595 ** s, 0.34, 'triangle', 0.32, 0, i * 0.14));
  }

  fanfare() {
    [0, 4, 7, 12, 16, 19].forEach((s, i) =>
      this.tone(392 * 1.0595 ** s, 0.3, 'triangle', 0.42, 0, i * 0.1));
    this.tone(98, 1.3, 'sine', 0.24, 0, 0.5);
  }
}

export default Sfx;
