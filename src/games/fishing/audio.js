/**
 * Pekkas Fiske — synthesized audio.
 *
 * Everything is generated in the browser: no audio files are downloaded.
 * The whole bus runs through a low-pass that closes as the lure sinks, so
 * the world literally gets muffled the deeper you go, plus a slow drone
 * that swells in the dark. That single filter does more for the feeling of
 * depth than any amount of extra sound effects.
 *
 * Two looping noise beds sit under it: lapping water at the surface and a
 * deep rumble below, cross-faded by depth — and now and then, while you sit
 * in the boat, a storlom calls across the lake.
 */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.reelAt = 0;
    this.bubbleAt = 0;
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

      // A short feedback echo for the loon and the big stingers — the lake
      // is wide and the far shore answers
      this.echo = this.ctx.createDelay(1);
      this.echo.delayTime.value = 0.32;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.32;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.5;
      this.echo.connect(fb).connect(this.echo);
      this.echo.connect(wet).connect(this.master);

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

      // Noise beds: lapping at the surface, rumble in the deep
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) {
        b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; // brown-ish
        d[i] = b * 6;
      }
      const bed = (type, freq, q, swell) => {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const f = this.ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = this.ctx.createGain();
        g.gain.value = 0;
        let node = src.connect(f);
        if (swell) {
          // The lapping comes and goes, like small waves against a hull
          const m = this.ctx.createGain();
          m.gain.value = 0.6;
          const lfo = this.ctx.createOscillator();
          lfo.frequency.value = 0.42;
          const amt = this.ctx.createGain();
          amt.gain.value = 0.4;
          lfo.connect(amt).connect(m.gain);
          lfo.start();
          node = node.connect(m);
        }
        node.connect(g).connect(this.master);
        src.start();
        return g;
      };
      this.lapGain = bed('bandpass', 620, 0.6, true);
      this.rumbleGain = bed('lowpass', 140, 0.7, false);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Depth in metres drives the muffling, the drone and the noise beds. */
  setDepth(d, maxDepth, aboveWater) {
    if (!this.ctx) return;
    const k = Math.min(1, Math.max(0, d / maxDepth));
    const t = this.ctx.currentTime;
    // 18 kHz at the surface down to a dull 520 Hz on the bottom
    this.lp.frequency.setTargetAtTime(520 + (1 - k) * 17480, t, 0.25);
    const on = this.muted ? 0 : 1;
    this.droneGain.gain.setTargetAtTime(on * k * k * 0.16, t, 0.4);
    this.lapGain.gain.setTargetAtTime(on * (aboveWater ? 0.09 : 0), t, 0.5);
    this.rumbleGain.gain.setTargetAtTime(on * (aboveWater ? 0 : 0.05 + k * 0.12), t, 0.5);
  }

  tone(freq, dur, type = 'sine', gain = 0.5, sweep = 0, delay = 0, echo = false) {
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
    if (echo) env.connect(this.echo);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, gain = 0.4, freq = 800, q = 1, sweepTo = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
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

  /** A fish landing in the tunna: wet slap on wood. */
  tunna(n) {
    this.tone(150 + Math.min(n, 8) * 12, 0.12, 'triangle', 0.4, -60);
    this.noise(0.1, 0.3, 900, 1.2, 400);
    this.tone(620, 0.05, 'sine', 0.12, -200, 0.03);
  }

  /** The strike: a taut snap plus line whip. */
  hook() {
    this.tone(760, 0.1, 'square', 0.42, 340);
    this.tone(190, 0.22, 'sine', 0.3, 90);
    this.noise(0.11, 0.34, 2400, 1.4);
    this.noise(0.22, 0.18, 3800, 2, 1200, 0.04); // the line singing
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

  /** Soft bubble blips while the lure sinks — rate-limited like the reel. */
  bubble() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.bubbleAt < 0.16 + Math.random() * 0.2) return;
    this.bubbleAt = now;
    this.tone(500 + Math.random() * 500, 0.06, 'sine', 0.05, 700);
  }

  dodge(n) {
    this.tone(880 * 1.05 ** Math.min(n, 10), 0.05, 'sine', 0.13, 160);
  }

  /** A close shave: a short airy whoosh on top of the dodge blip. */
  nearMiss() {
    this.noise(0.16, 0.22, 1400, 1.2, 4200);
    this.tone(1320, 0.08, 'sine', 0.12, 380, 0.02);
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

  /** Zone stinger: each zone lower than the last, with a sub-bass boom. */
  zone(i = 1) {
    const base = 294 * 0.89 ** i;
    [0, 130].forEach((d, k) => this.tone(base * (k ? 1.5 : 1), 0.34, 'sine', 0.22, 0, d / 1000, true));
    if (i > 0) this.tone(70 - i * 6, 0.6, 'sine', 0.3, -20);
  }

  /** Combo announcer: a bright stab that climbs with the level. */
  announce(level = 1) {
    const root = 392 * 1.0595 ** Math.min(level * 2, 12);
    [1, 1.26, 1.5].forEach((m, i) => this.tone(root * m, 0.18, 'triangle', 0.22, 0, i * 0.035));
    this.noise(0.14, 0.12, 5200, 1.5, 2400);
  }

  /** Uppdrag klart: a little rising fanfare with a sparkle on top. */
  mission() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(523 * 1.0595 ** s, 0.2, 'triangle', 0.3, 0, i * 0.075, true));
    this.noise(0.5, 0.1, 6000, 1, 3000, 0.25);
  }

  legend() {
    [0, 105, 210, 315, 450, 620].forEach((d, i) =>
      this.tone(392 * 2 ** (i / 4), 0.26, 'triangle', 0.46, 0, d / 1000, true));
    this.noise(0.8, 0.2, 3200, 0.8, 900);
  }

  /** Slow motion in the air: a low swell that bends down, then back. */
  slowmo() {
    this.tone(180, 0.7, 'sine', 0.2, -90);
    this.noise(0.7, 0.12, 500, 0.8, 180);
  }

  /** Storlom: the long wail across a Swedish lake at midnight. */
  loon() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    const vib = this.ctx.createOscillator();
    const vibAmt = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.linearRampToValueAtTime(780, t + 0.5);
    osc.frequency.linearRampToValueAtTime(740, t + 1.3);
    osc.frequency.linearRampToValueAtTime(600, t + 1.9);
    vib.frequency.value = 5.5;
    vibAmt.gain.value = 9;
    vib.connect(vibAmt).connect(osc.frequency);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.07, t + 0.25);
    env.gain.setValueAtTime(0.07, t + 1.4);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    osc.connect(env).connect(this.master);
    env.connect(this.echo);
    osc.start(t);
    vib.start(t);
    osc.stop(t + 2.2);
    vib.stop(t + 2.2);
  }

  fanfare() {
    [0, 1, 2, 4].forEach((s, i) =>
      this.tone(392 * 1.0595 ** (s * 2), 0.26, 'triangle', 0.44, 0, i * 0.11, true));
    this.tone(196, 0.9, 'sine', 0.24, 0, 0.44);
  }
}

export default Sfx;
