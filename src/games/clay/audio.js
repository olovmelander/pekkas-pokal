/**
 * Pekkas Lerskulptur — synthesized studio sound.
 *
 * Three continuous layers carry the feeling: the hum of the wheel, a wet
 * squelch that only sounds while your hands are actually moving clay, and
 * the kiln's roar while it fires. All are gain-ramped WebAudio nodes, so
 * there is nothing to download and nothing to loop-click. On top: one-shot
 * accents (the slap of a fresh lump, the wire cut, the kiln door, glaze
 * pinging as it cools, star chimes) and, now and then, the swifts that
 * scream over Barcelona's rooftops on summer evenings.
 */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  resume() {
    if (!this.ctx) this._build();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.34;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    this.master.connect(comp).connect(this.ctx.destination);
    this.noiseBuf = this._noiseBuffer(2);
    this._wheelLayer();
    this._clayLayer();
    this._kilnLayer();
  }

  _noiseBuffer(seconds) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noiseLoop() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start();
    return src;
  }

  /* Wheel hum: a low triangle plus rumbling noise through a lowpass */
  _wheelLayer() {
    this.wheelGain = this.ctx.createGain();
    this.wheelGain.gain.value = 0;
    this.hum = this.ctx.createOscillator();
    this.hum.type = 'triangle';
    this.hum.frequency.value = 44;
    const humG = this.ctx.createGain();
    humG.gain.value = 0.5;
    this.hum.connect(humG).connect(this.wheelGain);
    this.hum.start();
    const rumbleLp = this.ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 160;
    const rumbleG = this.ctx.createGain();
    rumbleG.gain.value = 0.55;
    this._noiseLoop().connect(rumbleLp).connect(rumbleG).connect(this.wheelGain);
    this.wheelGain.connect(this.master);
  }

  /* Shaping squelch: banded noise, wobbled by a slow LFO */
  _clayLayer() {
    this.clayGain = this.ctx.createGain();
    this.clayGain.gain.value = 0;
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
    this._noiseLoop().connect(this.clayBp).connect(this.clayGain).connect(this.master);
  }

  /* Kiln roar: low noise with a slow flutter, opening up as it heats */
  _kilnLayer() {
    this.kilnGain = this.ctx.createGain();
    this.kilnGain.gain.value = 0;
    this.kilnLp = this.ctx.createBiquadFilter();
    this.kilnLp.type = 'lowpass';
    this.kilnLp.frequency.value = 220;
    this.kilnLp.Q.value = 0.8;
    const flutter = this.ctx.createOscillator();
    flutter.frequency.value = 7;
    const flutterG = this.ctx.createGain();
    flutterG.gain.value = 60;
    flutter.connect(flutterG).connect(this.kilnLp.frequency);
    flutter.start();
    this._noiseLoop().connect(this.kilnLp).connect(this.kilnGain).connect(this.master);
  }

  /** Wheel speed 0..1 → hum level and pitch. */
  setWheel(speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.wheelGain.gain.setTargetAtTime(this.muted ? 0 : speed * 0.16, t, 0.18);
    this.hum.frequency.setTargetAtTime(30 + speed * 18, t, 0.3);
  }

  /** How hard the hands are working the clay, 0..1 (wobble adds grit). */
  setShaping(amount, wobble = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.clayGain.gain.setTargetAtTime(this.muted ? 0 : Math.min(1, amount) * 0.34, t, 0.07);
    this.clayBp.frequency.setTargetAtTime(640 - wobble * 260, t, 0.1);
  }

  /** Kiln heat 0..1 → roar level and brightness. */
  setKiln(heat) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.kilnGain.gain.setTargetAtTime(this.muted ? 0 : heat * 0.5, t, 0.25);
    this.kilnLp.frequency.setTargetAtTime(160 + heat * 900, t, 0.3);
  }

  silence() {
    this.setWheel(0);
    this.setShaping(0);
    this.setKiln(0);
  }

  tone(freq, dur, type = 'sine', gain = 0.5, opts = {}) {
    if (!this.ctx || this.muted) return;
    const { sweep = 0, delay = 0, pan = 0 } = opts;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + sweep), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = osc.connect(env);
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      out = out.connect(p);
    }
    out.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseHit(dur, gain, freq, opts = {}) {
    if (!this.ctx || this.muted) return;
    const { delay = 0, q = 1, sweepTo = 0, type = 'bandpass' } = opts;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = type;
    bp.frequency.setValueAtTime(freq, t);
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    bp.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(env).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  /** A soft wet slap when a fresh lump lands on the wheel. */
  slap() {
    this.noiseHit(0.18, 0.6, 320, { q: 0.9 });
    this.tone(120, 0.18, 'sine', 0.45, { sweep: -60 });
  }

  /** Thumbs pressing down to open the lump. */
  open() {
    this.noiseHit(0.5, 0.25, 500, { sweepTo: 260, q: 1.6 });
  }

  /** Ticking seconds when time runs short. */
  tick() {
    this.tone(1100, 0.03, 'square', 0.1);
  }

  smooth() {
    this.noiseHit(0.2, 0.2, 900);
  }

  /** A drip of slip landing. */
  plop() {
    this.tone(260 + Math.random() * 140, 0.07, 'sine', 0.06, { sweep: -120 });
  }

  /** The clay going off-centre: a heavy, uneven thump. */
  wobble() {
    this.tone(70, 0.22, 'sine', 0.35, { sweep: -20 });
    this.noiseHit(0.12, 0.18, 220, { q: 2 });
  }

  /** The cutting wire zipping under the foot. */
  wire() {
    this.noiseHit(0.32, 0.35, 1800, { sweepTo: 5200, q: 4 });
  }

  whoosh(delay = 0) {
    this.noiseHit(0.6, 0.18, 400, { sweepTo: 1400, q: 0.7, delay });
  }

  /** The kiln door: a heavy steel clunk. */
  door(delay = 0) {
    this.tone(90, 0.3, 'sine', 0.5, { sweep: -40, delay });
    this.tone(540, 0.14, 'square', 0.06, { delay });
    this.noiseHit(0.15, 0.35, 700, { delay, q: 1.4 });
  }

  /** Crackles over the firing. */
  crackle() {
    this.noiseHit(0.04, 0.22, 1800 + Math.random() * 2600, { q: 3 });
  }

  /** Fresh glaze pinging as it cools — the real sound of a kiln opening. */
  ping(delay = 0) {
    const f = 2600 + Math.random() * 2600;
    this.tone(f, 0.5, 'sine', 0.05 + Math.random() * 0.04, { delay, pan: Math.random() * 1.2 - 0.6 });
  }

  /** One rising chime per earned star. */
  star(i) {
    const base = 660 * 1.0595 ** (i * 4);
    this.tone(base, 0.5, 'triangle', 0.32);
    this.tone(base * 2, 0.35, 'sine', 0.1, { delay: 0.04 });
  }

  /** The judgement chime climbs with how good the piece was (0..1). */
  verdict(quality) {
    const base = 330 + quality * 200;
    [0, 4, 7, 12].slice(0, 2 + Math.round(quality * 2)).forEach((semi, i) =>
      this.tone(base * 1.0595 ** semi, 0.4, 'triangle', 0.4, { delay: i * 0.13 }));
  }

  /** Score counting up. */
  count() {
    this.tone(1500, 0.02, 'square', 0.05);
  }

  fanfare() {
    [0, 4, 7, 12, 16].forEach((semi, i) =>
      this.tone(392 * 1.0595 ** semi, 0.32, 'triangle', 0.42, { delay: i * 0.11 }));
    this.tone(98, 1.2, 'sine', 0.24, { delay: 0.45 });
  }

  /** A screaming swift passing over the rooftops. */
  swift() {
    if (!this.ctx || this.muted) return;
    const pan = Math.random() * 1.6 - 0.8;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const d = i * (0.09 + Math.random() * 0.05);
      this.tone(5200 + Math.random() * 1400, 0.08, 'sine', 0.025, { sweep: -1800, delay: d, pan });
    }
  }
}

export default Sfx;
