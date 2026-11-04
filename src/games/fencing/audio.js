/**
 * Pekkas Fäktning — synthesized salle sound.
 *
 * The two sounds that carry a fencing game are the blade CLINK of a parry
 * (Nidhogg's designers called it the most satisfying sound in the game)
 * and the harsh electric BUZZER of the scoring box. Both are synthesized,
 * along with footwork, swishes, the appel stamp of a feint, the referee's
 * ready-tones and a crowd that actually reacts: vowel formants over a
 * handful of detuned voices make an »ooh« or a cheer, and applause is a
 * few hundred tiny noise claps scattered through a buffer.
 */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.noiseBuf = null;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.36;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 5;
      this.master.connect(comp).connect(this.ctx.destination);
      // A short synthetic room: everything gets a little of the salle's echo
      this.verb = this.ctx.createConvolver();
      this.verb.buffer = this.impulse(1.3);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.22;
      this.verb.connect(wet).connect(this.master);
      this.startAmbience();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.36, this.ctx.currentTime, 0.03);
  }

  impulse(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
    }
    return buf;
  }

  noise() {
    if (!this.noiseBuf) {
      const n = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  out(node, wet = true) {
    node.connect(this.master);
    if (wet) node.connect(this.verb);
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
    env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    this.out(env);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseHit(dur, gain, freq, q = 1, delay = 0, type = 'bandpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(env);
    this.out(env);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  /** Continuous room tone and a far-off murmur, very low. */
  startAmbience() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.value = 0.035;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.015;
    lfo.connect(lfoG).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    lfo.start();
  }

  /** Blade whoosh on a lunge, and the front foot landing. */
  swish(heavy = 1) {
    this.noiseHit(0.17, 0.42 * heavy, 2400, 0.8);
    this.noiseHit(0.12, 0.2, 4400, 1.2, 0.02);
    this.noiseHit(0.09, 0.32 * heavy, 180, 0.9, 0.2, 'lowpass');
  }

  /** The parry: a bright ring of inharmonic partials, never twice the same. */
  clink(power = 1) {
    const d = 0.94 + Math.random() * 0.12;
    this.tone(2364 * d, 0.32, 'sine', 0.34 * power);
    this.tone(3571 * d, 0.18, 'sine', 0.2 * power, 0, 0.003);
    this.tone(5120 * d, 0.1, 'sine', 0.12 * power, 0, 0.002);
    this.tone(1487 * d, 0.4, 'sine', 0.16 * power);
    this.tone(812 * d, 0.12, 'triangle', 0.1 * power);
    this.noiseHit(0.035, 0.42 * power, 6200, 2);
  }

  /** Blades sliding against each other (a bind, a feint taken). */
  scrape() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 8;
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(6400, t + 0.22);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    src.connect(f).connect(env);
    this.out(env);
    src.start(t, Math.random());
    src.stop(t + 0.3);
  }

  /** The tip landing on the lamé — a dull tock before the box goes off. */
  hit() {
    this.noiseHit(0.05, 0.5, 1100, 1.4);
    this.tone(180, 0.09, 'sine', 0.3, -60);
  }

  /** The scoring box: harsh, electric, unmistakable. */
  buzzer(pitch = 1) {
    this.tone(310 * pitch, 0.5, 'square', 0.3);
    this.tone(313 * pitch, 0.5, 'square', 0.2);
    this.tone(155 * pitch, 0.5, 'sawtooth', 0.16);
  }

  /** Light shuffle of feet on the piste. */
  step() {
    this.noiseHit(0.05, 0.12, 420, 0.7);
  }

  /** The appel: a feint's stamp of the front foot. */
  feint() {
    this.noiseHit(0.08, 0.2, 3000, 1);
    this.noiseHit(0.1, 0.45, 160, 1, 0.08, 'lowpass');
    this.tone(90, 0.1, 'sine', 0.3, -30, 0.08);
  }

  /** Stagger — leather and a grunt of air. */
  stagger() {
    this.noiseHit(0.14, 0.28, 700, 0.8);
    this.tone(140, 0.16, 'sine', 0.2, -50);
  }

  /** En garde … klara … KÖR: three referee tones, last one bright. */
  ready(step) {
    if (step < 2) this.tone(440, 0.12, 'sine', 0.26);
    else {
      this.tone(880, 0.22, 'triangle', 0.38);
      this.tone(1320, 0.16, 'sine', 0.12, 0, 0.01);
    }
  }

  /** A few detuned voices through two vowel formants: the crowd. */
  voices(f1, f2, dur, gain, lo, hi, n = 7, glide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const sum = this.ctx.createGain();
    sum.gain.value = 1 / n;
    for (let i = 0; i < n; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const f = lo + Math.random() * (hi - lo);
      const start = t + Math.random() * 0.12;
      o.frequency.setValueAtTime(f, start);
      if (glide) o.frequency.linearRampToValueAtTime(f * glide, start + dur);
      const vib = this.ctx.createOscillator();
      vib.frequency.value = 4 + Math.random() * 3;
      const vg = this.ctx.createGain();
      vg.gain.value = f * 0.02;
      vib.connect(vg).connect(o.frequency);
      o.connect(sum);
      o.start(start);
      vib.start(start);
      o.stop(start + dur + 0.1);
      vib.stop(start + dur + 0.1);
    }
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    [[f1, 5], [f2, 7]].forEach(([fr, q], k) => {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fr;
      bp.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.value = k ? 0.6 : 1;
      sum.connect(bp).connect(g).connect(env);
    });
    this.out(env);
  }

  /** Spectator murmur that swells briefly — the baseline reaction. */
  crowd(excited = 0.5) {
    this.noiseHit(0.9, 0.08 + excited * 0.1, 500 + excited * 700, 0.7);
  }

  cheer() {
    this.voices(750, 1200, 1.3, 0.5, 190, 360, 9, 1.15);
    this.noiseHit(1.1, 0.12, 2200, 0.6);
    this.applause(1.6, 0.6);
  }

  ooh() {
    this.voices(320, 820, 0.9, 0.42, 160, 280, 8, 0.9);
  }

  groan() {
    this.voices(500, 900, 1.0, 0.38, 150, 240, 8, 0.75);
  }

  /** Hundreds of tiny claps scattered through one buffer. */
  applause(dur = 2.4, level = 1) {
    if (!this.ctx || this.muted) return;
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const claps = Math.floor(dur * 55 * level);
    for (let c = 0; c < claps; c++) {
      const at = Math.floor((Math.random() ** 0.8) * (n - 800));
      const amp = (0.4 + Math.random() * 0.6) * (1 - at / n) ** 0.7;
      const len = 300 + Math.floor(Math.random() * 400);
      for (let i = 0; i < len; i++) d[at + i] += (Math.random() * 2 - 1) * amp * (1 - i / len) ** 4;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2000;
    bp.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.value = 0.32 * level;
    src.connect(bp).connect(g);
    this.out(g);
    src.start();
  }

  /** The replay: a long swell into slow motion. */
  slowmo() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.9);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.35, t + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    src.connect(f).connect(env);
    this.out(env);
    src.start(t);
    src.stop(t + 1.2);
    this.tone(70, 1.0, 'sine', 0.3, -30);
  }

  /** Match point: a low double heartbeat. */
  heartbeat() {
    this.tone(62, 0.16, 'sine', 0.42, -14);
    this.tone(58, 0.18, 'sine', 0.32, -14, 0.2);
  }

  verdictWin() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(392 * 1.0595 ** s, 0.3, 'triangle', 0.36, 0, i * 0.1));
  }

  verdictLose() {
    [7, 3, 0].forEach((s, i) => this.tone(294 * 1.0595 ** s, 0.34, 'triangle', 0.3, 0, i * 0.14));
  }

  /** A brassy medal chord: saws through a lowpass that opens up. */
  brass(notes, dur = 0.9, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.32, t + 0.05);
    env.gain.setTargetAtTime(0.0001, t + dur * 0.7, dur * 0.15);
    lp.connect(env);
    this.out(env);
    notes.forEach((f) => {
      [-4, 4].forEach((cents) => {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur * 1.6);
      });
    });
  }

  /** Champion fanfare: a rising brass call and a held major chord. */
  fanfare() {
    const n = (s) => 196 * 1.0595 ** s;
    this.brass([n(0), n(7)], 0.18, 0);
    this.brass([n(0), n(7)], 0.18, 0.2);
    this.brass([n(4), n(12)], 0.18, 0.4);
    this.brass([n(0), n(4), n(7), n(12)], 1.6, 0.62);
    this.tone(98, 1.8, 'sine', 0.22, 0, 0.62);
    this.applause(3.5, 1.2);
  }

  medal(rank) {
    const n = (s) => 220 * 1.0595 ** s;
    if (rank === 2) this.brass([n(0), n(4), n(7)], 1.1);
    else this.brass([n(0), n(3), n(7)], 1.0);
  }
}

export default Sfx;
