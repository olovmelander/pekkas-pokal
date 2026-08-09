/**
 * Pekkas Lerskulptur — synthesized studio sound.
 *
 * Two continuous layers carry the feeling: the low hum of the wheel and a
 * wet squelch that only sounds while your hands are actually moving clay.
 * Both are gain-ramped WebAudio nodes, so there is nothing to download and
 * nothing to loop-click.
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
      comp.threshold.value = -16;
      comp.ratio.value = 5;
      this.master.connect(comp).connect(this.ctx.destination);

      /* Wheel hum: a low triangle plus rumbling noise through a lowpass */
      this.wheelGain = this.ctx.createGain();
      this.wheelGain.gain.value = 0;
      const hum = this.ctx.createOscillator();
      hum.type = 'triangle';
      hum.frequency.value = 44;
      const humG = this.ctx.createGain();
      humG.gain.value = 0.5;
      hum.connect(humG).connect(this.wheelGain);
      hum.start();
      const rumble = this._noiseLoop();
      const rumbleLp = this.ctx.createBiquadFilter();
      rumbleLp.type = 'lowpass';
      rumbleLp.frequency.value = 160;
      const rumbleG = this.ctx.createGain();
      rumbleG.gain.value = 0.55;
      rumble.connect(rumbleLp).connect(rumbleG).connect(this.wheelGain);
      this.wheelGain.connect(this.master);

      /* Shaping squelch: banded noise, wobbled by a slow LFO */
      this.clayGain = this.ctx.createGain();
      this.clayGain.gain.value = 0;
      const squelch = this._noiseLoop();
      this.clayBp = this.ctx.createBiquadFilter();
      this.clayBp.type = 'bandpass';
      this.clayBp.frequency.value = 640;
      this.clayBp.Q.value = 1.3;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 240;
      lfo.connect(lfoG).connect(this.clayBp.frequency);
      lfo.start();
      squelch.connect(this.clayBp).connect(this.clayGain).connect(this.master);
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

  /** Wheel speed 0..1 → hum level. */
  setWheel(speed) {
    if (!this.ctx) return;
    const g = this.muted ? 0 : speed * 0.16;
    this.wheelGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.18);
  }

  /** How hard the hands are working the clay, 0..1. */
  setShaping(amount) {
    if (!this.ctx) return;
    const g = this.muted ? 0 : Math.min(1, amount) * 0.34;
    this.clayGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.07);
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
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseHit(dur, gain, freq, delay = 0) {
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
    const env = this.ctx.createGain();
    env.gain.value = gain;
    src.connect(bp).connect(env).connect(this.master);
    src.start(t);
  }

  /** A soft wet slap when a fresh lump lands on the wheel. */
  slap() {
    this.noiseHit(0.16, 0.5, 300);
    this.tone(120, 0.16, 'sine', 0.4, -60);
  }

  /** Ticking seconds when time runs short. */
  tick() {
    this.tone(1100, 0.03, 'square', 0.1);
  }

  smooth() {
    this.noiseHit(0.2, 0.2, 900);
  }

  /** Kiln: crackles scattered over the firing, plus a deep swell. */
  kiln(durS = 2.4) {
    if (!this.ctx || this.muted) return;
    this.tone(60, durS, 'sine', 0.28, 30);
    for (let i = 0; i < 14; i++) {
      this.noiseHit(0.05, 0.2, 1800 + Math.random() * 2400, Math.random() * durS);
    }
  }

  /** The judgement chime climbs with how good the piece was (0..1). */
  verdict(quality) {
    const base = 330 + quality * 200;
    [0, 4, 7, 12].slice(0, 2 + Math.round(quality * 2)).forEach((semi, i) =>
      this.tone(base * 1.0595 ** semi, 0.4, 'triangle', 0.4, 0, i * 0.13));
  }

  fanfare() {
    [0, 4, 7, 12, 16].forEach((semi, i) =>
      this.tone(392 * 1.0595 ** semi, 0.32, 'triangle', 0.42, 0, i * 0.11));
    this.tone(98, 1.2, 'sine', 0.24, 0, 0.45);
  }
}

export default Sfx;
