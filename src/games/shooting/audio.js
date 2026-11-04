/**
 * Pekkas Lerduvor — synthesized range sound.
 *
 * The two sounds that sell a shotgun sport: the BOOM (a broadband crack
 * with a low chest-thump under it) and the dry clack-clack of the action
 * closing on fresh shells. A shot outdoors is mostly its tail, so the
 * report goes through a synthesized convolution "field" — a long, dark,
 * diffuse decay — plus a discrete slap-back off the spruce edge ~100 m
 * away (0.6 s round trip) that rolls on down the forest line.
 *
 * Around them: the trap's thwock and the clay's whoosh, the brittle
 * crack and tinkle of a break, the gang's hurrah, swallows twittering and
 * a summer-evening wind bed. All noise comes from one shared buffer.
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
      const { ctx } = this;
      this.master = ctx.createGain();
      this.master.gain.value = 0.36;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      this.master.connect(comp).connect(ctx.destination);

      // One shared noise buffer — every hit reads a random window of it
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      /* The field: a dark, diffuse 2.6 s tail for the report */
      this.verb = ctx.createConvolver();
      this.verb.buffer = this._impulse(2.6);
      this.verbIn = ctx.createGain();
      this.verbIn.gain.value = 0.55;
      this.verbIn.connect(this.verb).connect(this.master);

      /* Wind bed: filtered noise, always on, very quiet, breathing */
      const wind = ctx.createBufferSource();
      wind.buffer = this.noise;
      wind.loop = true;
      const windLp = ctx.createBiquadFilter();
      windLp.type = 'lowpass';
      windLp.frequency.value = 340;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0.045;
      wind.connect(windLp).connect(this.windGain).connect(this.master);
      wind.start();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.02;
      lfo.connect(lfoG).connect(this.windGain.gain);
      lfo.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Stereo impulse: exponentially decaying noise that darkens as it dies. */
  _impulse(seconds) {
    const { ctx } = this;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        // One-pole lowpass whose cutoff falls over the tail
        const a = 0.55 - 0.5 * k;
        lp += a * ((Math.random() * 2 - 1) - lp);
        // Early reflection cluster from the treeline at ~0.6 s
        const echo = Math.exp(-((k * seconds - 0.6) ** 2) / 0.004) * 1.6;
        d[i] = lp * (Math.exp(-k * 4.2) + echo * Math.exp(-k * 2));
      }
    }
    return buf;
  }

  _out(send = 0) {
    const g = this.ctx.createGain();
    g.connect(this.master);
    if (send > 0) {
      const s = this.ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.verbIn);
    }
    return g;
  }

  tone(freq, dur, type = 'sine', gain = 0.5, sweep = 0, delay = 0, send = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this._out(send);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseHit(dur, gain, freq, q = 1, delay = 0, type = 'bandpass', send = 0, sweepTo = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const env = this._out(send);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(env);
    src.start(t, Math.random() * Math.max(0, 1.9 - dur), dur + 0.05);
  }

  /** The shot: crack + body + chest thump, into the field reverb. */
  boom() {
    this.noiseHit(0.07, 1.0, 3800, 0.4, 0, 'bandpass', 0.6);
    this.noiseHit(0.26, 0.8, 1100, 0.5, 0, 'lowpass', 0.9, 260);
    this.tone(92, 0.34, 'sine', 0.6, -52);
    // Slap-back off the spruce edge, then the roll down the forest line
    this.noiseHit(0.32, 0.12, 700, 0.6, 0.6, 'lowpass', 0.3, 240);
    this.noiseHit(0.5, 0.06, 420, 0.6, 1.05, 'lowpass', 0.2, 180);
  }

  /** Break open, eject, two fresh shells, snap shut. */
  reload() {
    this.noiseHit(0.035, 0.32, 1900, 2.5);
    this.tone(1400, 0.03, 'square', 0.05, -300, 0.01);
    this.noiseHit(0.05, 0.18, 900, 2, 0.13);
    this.noiseHit(0.05, 0.16, 820, 2, 0.21);
    this.noiseHit(0.045, 0.4, 2600, 3, 0.36);
    this.tone(260, 0.05, 'triangle', 0.12, -60, 0.36);
  }

  /** The trap arm slinging a clay, and the whoosh of it leaving. */
  thwock() {
    this.tone(150, 0.12, 'sine', 0.45, 200);
    this.noiseHit(0.07, 0.4, 600, 1);
    this.noiseHit(0.45, 0.16, 2400, 0.8, 0.03, 'bandpass', 0, 500);
  }

  /** Brittle clay crack and the patter of chips — muffled by 35 m of air. */
  shatter(gold = false) {
    this.noiseHit(0.1, 0.75, 2400, 0.7);
    this.noiseHit(0.22, 0.38, 4800, 1.4, 0.015, 'bandpass', 0.25);
    for (let i = 0; i < 5; i++) {
      this.tone(2600 + Math.random() * 2600, 0.04, 'sine', 0.07, -400, 0.03 + Math.random() * 0.14);
    }
    if (gold) {
      [0, 7, 12, 16, 19, 24].forEach((s, i) =>
        this.tone(784 * 1.0595 ** s, 0.9, 'sine', 0.13, 0, 0.05 + i * 0.05, 0.6));
    }
  }

  /** Streak chime that climbs. */
  streak(n) {
    const f = 523 * 1.0595 ** (Math.min(n, 12) * 2);
    this.tone(f, 0.14, 'triangle', 0.3, 90, 0.04);
  }

  /** Every fifth in a row: a little brass flourish. */
  milestone(n) {
    const root = n >= 15 ? 466 : n >= 10 ? 415 : 392;
    [0, 4, 7, 12].forEach((s, i) => {
      this.tone(root * 1.0595 ** s, 0.22, 'sawtooth', 0.09, 0, i * 0.075, 0.3);
      this.tone(root * 1.0595 ** s, 0.22, 'triangle', 0.18, 0, i * 0.075);
    });
    this.tone(root * 2, 0.6, 'triangle', 0.2, 0, 0.3, 0.4);
  }

  miss() {
    this.tone(220, 0.24, 'sine', 0.18, -90);
  }

  /** So close: the pattern's fringe hissing past the clay. */
  nearMiss() {
    this.noiseHit(0.16, 0.22, 5200, 2.2, 0.02, 'bandpass', 0.25, 2200);
    this.tone(660, 0.12, 'sine', 0.06, -180, 0.05);
  }

  /** The shooter's call — a short barked vowel, then the trap's click. */
  pull() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.24);
    const env = this._out(0.25);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.32, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    [[420, 6], [880, 8]].forEach(([f, q]) => {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      osc.connect(bp).connect(env);
    });
    osc.start(t);
    osc.stop(t + 0.3);
    this.noiseHit(0.02, 0.2, 1200, 1);
  }

  /** Swallows twittering — called from the loop now and then. */
  bird() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.birdAt < 2) return;
    this.birdAt = now;
    const base = 2600 + Math.random() * 1600;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      this.tone(base + Math.random() * 700, 0.05, 'sine', 0.045, 700 * (Math.random() < 0.5 ? 1 : -0.4), i * 0.07);
    }
  }

  /** The gang: a ragged hurrah and some applause. */
  cheer(power = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    for (let v = 0; v < 4; v++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const f0 = 150 + Math.random() * 120;
      const d = 0.05 + Math.random() * 0.1;
      osc.frequency.setValueAtTime(f0, t + d);
      osc.frequency.linearRampToValueAtTime(f0 * 1.25, t + d + 0.25);
      osc.frequency.linearRampToValueAtTime(f0 * 0.9, t + d + 0.7);
      const env = this._out(0.4);
      env.gain.setValueAtTime(0.0001, t + d);
      env.gain.exponentialRampToValueAtTime(0.05 * power, t + d + 0.08);
      env.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.8);
      [[760, 5], [1250, 7]].forEach(([f, q]) => {
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = q;
        osc.connect(bp).connect(env);
      });
      osc.start(t + d);
      osc.stop(t + d + 0.85);
    }
    const claps = Math.round(8 + 10 * power);
    for (let i = 0; i < claps; i++) {
      this.noiseHit(0.03, 0.12, 1400 + Math.random() * 900, 1.4, 0.1 + Math.random() * 1.1, 'bandpass', 0.2);
    }
  }

  /** Before the golden dove: a rising, shimmering call. */
  goldFanfare() {
    [0, 4, 7, 12, 16].forEach((s, i) =>
      this.tone(392 * 1.0595 ** s, 0.32, 'triangle', 0.32, 0, i * 0.1, 0.3));
    this.tone(1568, 1.2, 'sine', 0.06, 0, 0.5, 0.6);
  }

  /** Slow motion: the air thickens — a falling whoosh and a heartbeat. */
  slowmo() {
    this.noiseHit(0.9, 0.18, 2000, 0.6, 0, 'lowpass', 0.4, 180);
    this.tone(58, 0.3, 'sine', 0.5, -14, 0.05);
    this.tone(58, 0.3, 'sine', 0.4, -14, 0.42);
  }

  /** Passing Ludvig's 3 400 mid-round. */
  ludvig() {
    [0, 7, 12].forEach((s, i) => this.tone(523 * 1.0595 ** s, 0.3, 'triangle', 0.26, 0, i * 0.09, 0.3));
  }

  /** End of round, sized to the medal: 0 none … 3 guld. */
  fanfare(tier = 0) {
    const steps = tier >= 3 ? [0, 4, 7, 12, 16, 19, 24] : tier >= 1 ? [0, 4, 7, 12, 16] : [0, 4, 7];
    steps.forEach((s, i) => {
      this.tone(392 * 1.0595 ** s, 0.32, 'triangle', 0.36, 0, i * 0.1, 0.35);
      if (tier >= 2) this.tone(392 * 1.0595 ** s, 0.32, 'sawtooth', 0.06, 0, i * 0.1);
    });
    this.tone(98, 1.3, 'sine', 0.22, 0, steps.length * 0.1);
  }
}

export default Sfx;
