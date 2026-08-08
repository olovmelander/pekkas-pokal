/**
 * Pekkas Lerduvor — synthesized range sound.
 *
 * The two sounds that sell a shotgun sport: the BOOM (a broadband burst
 * with a low chest-thump under it) and the dry clack-clack of the action
 * closing on fresh shells. Around them: the trap's thwock, the clay's
 * brittle shatter, birdsong and a summer-evening wind bed.
 */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.birdAt = 0;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.34;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);

      /* Wind bed: filtered noise, always on, very quiet */
      const wind = this._noiseLoop();
      this.windLp = this.ctx.createBiquadFilter();
      this.windLp.type = 'lowpass';
      this.windLp.frequency.value = 320;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.045;
      wind.connect(this.windLp).connect(this.windGain).connect(this.master);

      /* Slow LFO breathes the wind */
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 0.02;
      lfo.connect(lfoG).connect(this.windGain.gain);
      lfo.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noiseLoop() {
    const n = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  tone(freq, dur, type = 'sine', gain = 0.5, sweep = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseHit(dur, gain, freq, q = 1, delay = 0, type = 'bandpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.value = gain;
    src.connect(f).connect(env).connect(this.master);
    src.start(t);
  }

  /** The shot: crack + body + a rolling echo off the forest edge. */
  boom() {
    this.noiseHit(0.09, 0.9, 3400, 0.5);
    this.noiseHit(0.22, 0.7, 900, 0.6);
    this.tone(70, 0.3, 'sine', 0.5, -30);
    // Echo returning from the tree line
    this.noiseHit(0.35, 0.16, 500, 0.7, 0.24, 'lowpass');
  }

  /** Break open, eject, two fresh shells, snap shut. */
  reload() {
    this.noiseHit(0.04, 0.3, 1800, 2);
    this.noiseHit(0.04, 0.25, 1200, 2, 0.14);
    this.noiseHit(0.05, 0.35, 2400, 2, 0.32);
  }

  /** The trap arm slinging a clay. */
  thwock() {
    this.tone(180, 0.1, 'sine', 0.4, 240);
    this.noiseHit(0.08, 0.4, 700, 1);
  }

  /** Brittle clay shatter. */
  shatter(full = true) {
    this.noiseHit(0.12, full ? 0.7 : 0.4, 2600, 0.8);
    this.noiseHit(0.2, full ? 0.4 : 0.2, 4200, 1.2, 0.02);
    if (full) this.tone(520, 0.08, 'square', 0.14, 300);
  }

  /** Streak chime that climbs. */
  streak(n) {
    const f = 523 * 1.0595 ** (Math.min(n, 12) * 2);
    this.tone(f, 0.12, 'triangle', 0.34, 90);
  }

  miss() {
    this.tone(220, 0.24, 'sine', 0.22, -90);
  }

  /** PULL acknowledgement. */
  pull() {
    this.tone(660, 0.09, 'square', 0.2, 120);
  }

  /** A random bird, called from the loop occasionally. */
  bird() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.birdAt < 2) return;
    this.birdAt = now;
    const base = 2400 + Math.random() * 1600;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      this.tone(base + Math.random() * 500, 0.07, 'sine', 0.06, 500, i * 0.11);
    }
  }

  cheer() {
    this.noiseHit(0.5, 0.2, 900, 0.6);
    [0, 4, 7].forEach((s, i) => this.tone(392 * 1.0595 ** s, 0.2, 'triangle', 0.2, 0, i * 0.06));
  }

  goldFanfare() {
    [0, 4, 7, 12, 16].forEach((s, i) =>
      this.tone(392 * 1.0595 ** s, 0.28, 'triangle', 0.4, 0, i * 0.1));
  }

  fanfare() {
    [0, 4, 7, 12, 16, 19].forEach((s, i) =>
      this.tone(392 * 1.0595 ** s, 0.3, 'triangle', 0.42, 0, i * 0.1));
    this.tone(98, 1.2, 'sine', 0.24, 0, 0.5);
  }
}

export default Sfx;
