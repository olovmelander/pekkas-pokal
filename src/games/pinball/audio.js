/**
 * Synthesised sound for the flipper. Nothing is downloaded: every hit is
 * built from oscillators and one buffer of white noise.
 *
 * A pinball's sound is mostly mechanical — solenoids, rubber, steel on
 * wood — so the recipes lean on short filtered noise bursts and pitch-dropping
 * thumps rather than musical tones. The music is saved for payoffs.
 */

const MASTER = 0.42;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
  }

  /** Browsers only allow audio after a gesture, so the graph is built lazily. */
  resume() {
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    // A compressor on the bus: a multiball bumper storm is a pile-up of
    // transients, and without one it clips.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.muted || this.paused ? 0 : MASTER;
    this.master.connect(comp);

    // The room. A short generated impulse response puts the machine in an
    // arcade instead of inside the player's head; only payoffs send much to it.
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(1.4, 2.8);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.9;
    this.wet.connect(verb);
    verb.connect(this.master);

    // One second of white noise, played from a random offset by every hit
    const n = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    // The rolling ball: looped noise through a lowpass whose cutoff and level
    // follow the ball's speed. It is the sound you only notice when it stops,
    // and it is most of what gives the ball weight.
    const roll = ctx.createBufferSource();
    roll.buffer = this.noiseBuf;
    roll.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 300;
    this.rollFilter.Q.value = 0.8;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    roll.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    roll.start();
    this.rollSrc = roll;
  }

  impulse(sec, decay) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  setMuted(m) {
    this.muted = m;
    this.updateMaster();
  }

  setPaused(paused) { this.paused = paused; this.updateMaster(); }

  updateMaster() {
    if (this.master) this.master.gain.setTargetAtTime(this.muted || this.paused ? 0 : MASTER, this.ctx.currentTime, 0.03);
  }

  live() {
    return !!this.ctx && this.ctx.state === 'running' && !this.muted && !this.paused;
  }

  /** Routes a voice to the dry bus and, optionally, the room. */
  /**
   * Places the next sound on the playfield: `sfx.at(x).bumper()` pans the
   * whole recipe by the table x it happened at (−10 … 9), so a sling on the
   * left is heard on the left. It lasts for the synchronous recipe only.
   */
  at(x) {
    this.pan = Math.max(-0.75, Math.min(0.75, ((x || 0) + 0.6) / 11));
    if (!this.panReset) {
      this.panReset = true;
      queueMicrotask(() => {
        this.pan = 0;
        this.panReset = false;
      });
    }
    return this;
  }

  out(node, wet) {
    let dry = node;
    if (this.pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = this.pan;
      node.connect(p);
      dry = p;
    }
    dry.connect(this.master);
    if (wet > 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.wet);
    }
  }

  tone(freq, dur, { type = 'triangle', gain = 0.4, sweep = 0, at = 0, wet = 0.25, attack = 0.005 } = {}) {
    if (!this.live()) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(25, freq + sweep), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    this.out(env, wet);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise(dur, { gain = 0.4, freq = 1000, q = 1, type = 'bandpass', at = 0, wet = 0.15, to = 0 } = {}) {
    if (!this.live()) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(env);
    this.out(env, wet);
    src.start(t, Math.random() * 0.8, dur + 0.05);
  }

  /** A pitch-dropping sine: the body of every solenoid and rubber hit */
  thump(f0, f1, dur, gain, at = 0) {
    this.tone(f0, dur, { type: 'sine', gain, sweep: f1 - f0, at, wet: 0.08, attack: 0.002 });
  }

  arp(notes, step, opts) {
    notes.forEach((f, i) => this.tone(f, opts.dur || 0.2, { ...opts, at: (opts.at || 0) + i * step }));
  }

  /* ---- Mechanics ---- */
  flipperUp() {
    this.noise(0.05, { gain: 0.42, freq: 1500, type: 'lowpass', wet: 0.05 });
    this.thump(140, 52, 0.1, 0.55);
    this.tone(2700, 0.012, { type: 'square', gain: 0.05, wet: 0 });
  }

  flipperDown() {
    this.noise(0.035, { gain: 0.14, freq: 650, type: 'lowpass', wet: 0.03 });
    this.thump(95, 60, 0.05, 0.16);
  }

  /** Steel on a flipper rubber — loudness follows the impact */
  ballHit(v) {
    const k = clamp01((v - 4) / 30);
    this.noise(0.03, { gain: 0.08 + k * 0.22, freq: 1200 + k * 900, q: 0.9, wet: 0.05 });
  }

  wall(v) {
    const k = clamp01((v - 8) / 30);
    this.noise(0.03, { gain: 0.06 + k * 0.2, freq: 850 + k * 900, wet: 0.08 });
    if (k > 0.5) this.thump(200, 120, 0.05, 0.12 * k);
  }

  /** A coil pulse with nothing much to hit: ball search, a soft clack */
  coil(k = 1) {
    this.thump(150, 70, 0.08, 0.4 * k);
    this.noise(0.03, { gain: 0.25 * k, freq: 1800, q: 1.1, wet: 0.05 });
  }

  /** The ramp's entry flap slapping as a ball rolls over it onto the wire */
  flap() {
    this.noise(0.025, { gain: 0.3, freq: 2400, q: 1.6, wet: 0.08 });
    this.tone(880, 0.05, { type: 'square', gain: 0.05, sweep: -300, wet: 0.05, at: 0.012 });
  }

  /** The cabinet shoved on its legs: a deep wooden knock and the bob ringing */
  nudge() {
    this.thump(70, 38, 0.22, 0.75);
    this.noise(0.08, { gain: 0.32, freq: 220, type: 'lowpass', wet: 0.25 });
    this.tone(2100, 0.25, { type: 'sine', gain: 0.025, wet: 0.2, at: 0.03 });
  }

  bumper() {
    // The solenoid's body, the ring's steel clack, and the lit-cap ding
    this.noise(0.012, { gain: 0.5, freq: 4200, q: 0.9, wet: 0.04 });
    this.thump(175, 68, 0.15, 0.7);
    this.noise(0.06, { gain: 0.42, freq: 1300, q: 1.2, wet: 0.15 });
    this.tone(1046, 0.18, { type: 'square', gain: 0.045, wet: 0.35 });
    this.tone(1568, 0.12, { type: 'square', gain: 0.03, wet: 0.35 });
  }

  sling() {
    // The arm's sharp snap on the rubber first, then the body below
    this.noise(0.018, { gain: 0.42, freq: 3000, q: 1.3, wet: 0.04 });
    this.thump(240, 105, 0.08, 0.5);
    this.noise(0.05, { gain: 0.3, freq: 760, wet: 0.1 });
  }

  target() {
    this.noise(0.03, { gain: 0.4, freq: 2600, q: 0.8, wet: 0.12 });
    this.tone(620, 0.09, { type: 'square', gain: 0.14, sweep: -300, wet: 0.1 });
  }

  launch() {
    this.noise(0.14, { gain: 0.32, freq: 420, q: 0.7, wet: 0.15 });
    this.tone(92, 0.26, { type: 'sawtooth', gain: 0.26, sweep: 170, wet: 0.15 });
  }

  /** The knocker: a solenoid hitting the cabinet wall. The sound of a free game. */
  knocker() {
    this.thump(82, 36, 0.34, 0.95);
    this.noise(0.09, { gain: 0.6, freq: 260, type: 'lowpass', wet: 0.5 });
  }

  drain() {
    this.tone(220, 0.75, { type: 'sawtooth', gain: 0.18, sweep: -150, wet: 0.4 });
    this.tone(330, 0.55, { type: 'triangle', gain: 0.16, sweep: -210, at: 0.12, wet: 0.4 });
  }

  outlane() {
    this.tone(330, 0.32, { type: 'sine', gain: 0.32, sweep: -180, wet: 0.3 });
  }

  gate() {
    this.noise(0.09, { gain: 0.45, freq: 340, wet: 0.2 });
    this.tone(95, 0.22, { type: 'square', gain: 0.3, sweep: -30, wet: 0.2 });
  }

  gateDown() {
    this.noise(0.25, { gain: 0.5, freq: 240, wet: 0.4 });
    this.arp([147, 294, 441], 0.11, { type: 'square', gain: 0.3, dur: 0.22, wet: 0.4 });
  }

  spinner(n) {
    // A rattle of ticks that thins out as the blade slows — the best sound
    // on any playfield
    let at = 0;
    for (let i = 0; i < Math.min(n, 14); i++) {
      this.tone(1500 - i * 50, 0.03, { type: 'square', gain: 0.16, at, wet: 0.1 });
      at += 0.036 + i * 0.008;
    }
  }

  orbit() {
    this.tone(340, 0.16, { type: 'sawtooth', gain: 0.24, sweep: 520, wet: 0.3 });
  }

  ramp() {
    this.tone(240, 0.36, { type: 'sawtooth', gain: 0.28, sweep: 640, wet: 0.3 });
    this.tone(660, 0.2, { type: 'triangle', gain: 0.3, sweep: 220, at: 0.18, wet: 0.4 });
  }

  /** The castle guards rise: a short call on a guard's horn */
  trollUp() {
    this.tone(196, 0.16, { type: 'square', gain: 0.2, wet: 0.4 });
    this.tone(294, 0.34, { type: 'square', gain: 0.22, sweep: 6, at: 0.15, wet: 0.45 });
    this.thump(110, 60, 0.3, 0.35);
  }

  /** A guard knocked down: a clang off the helm and a thud */
  trollHit() {
    this.noise(0.12, { gain: 0.5, freq: 420, wet: 0.2 });
    this.thump(190, 70, 0.26, 0.6);
    this.tone(1180, 0.22, { type: 'triangle', gain: 0.16, sweep: -240, wet: 0.35 });
  }

  lock() {
    this.thump(120, 60, 0.32, 0.6);
    this.tone(90, 0.36, { type: 'square', gain: 0.24, sweep: -20, at: 0.12, wet: 0.4 });
  }

  /* ---- Payoffs ---- */
  combo(n) {
    this.tone(440 * 1.25 ** Math.min(n, 6), 0.13, { type: 'square', gain: 0.24, sweep: 180, wet: 0.35 });
  }

  complete() {
    this.arp([392, 440, 494, 523, 587], 0.07, { type: 'square', gain: 0.2, dur: 0.18, wet: 0.4 });
  }

  jackpot() {
    this.knocker();
    this.arp([523, 659, 784, 1047, 1319], 0.08, { type: 'square', gain: 0.2, dur: 0.24, wet: 0.5, at: 0.05 });
    this.noise(0.7, { gain: 0.1, freq: 6000, q: 0.5, at: 0.1, wet: 0.7 });
  }

  multiball() {
    this.arp([262, 311, 370, 440, 523, 622], 0.1, { type: 'sawtooth', gain: 0.22, dur: 0.24, wet: 0.5 });
    this.arp([523, 659, 784], 0.12, { type: 'square', gain: 0.18, dur: 0.4, wet: 0.6, at: 0.62 });
  }

  modeStart() {
    this.arp([196, 294, 392], 0.13, { type: 'sawtooth', gain: 0.26, dur: 0.26, wet: 0.45 });
  }

  modeWin() {
    this.arp([523, 600, 690, 794, 912, 1047], 0.08, { type: 'triangle', gain: 0.3, dur: 0.2, wet: 0.5 });
  }

  extraBall() {
    this.knocker();
    this.arp([660, 770, 880, 990], 0.12, { type: 'triangle', gain: 0.3, dur: 0.18, wet: 0.5, at: 0.1 });
  }

  save() {
    this.noise(0.4, { gain: 0.3, freq: 300, to: 3200, q: 1.4, wet: 0.5 });
    this.arp([784, 1047], 0.1, { type: 'triangle', gain: 0.26, dur: 0.3, wet: 0.6, at: 0.25 });
  }

  /** Time slows: a deep breath in */
  /** A flasher firing: the relay's click and the bulb's dull thwack */
  flasher(k = 1) {
    this.noise(0.02, { gain: 0.2 * k, freq: 3800, q: 1.4, wet: 0.05 });
    this.thump(120, 60, 0.07, 0.22 * k);
  }

  slowmo() {
    this.tone(70, 0.7, { type: 'sine', gain: 0.4, sweep: -38, wet: 0.6, attack: 0.04 });
    this.noise(0.6, { gain: 0.16, freq: 1800, to: 240, q: 0.8, wet: 0.6 });
  }

  warning() {
    this.tone(104, 0.22, { type: 'sawtooth', gain: 0.22, wet: 0.2 });
    this.tone(104, 0.22, { type: 'sawtooth', gain: 0.22, wet: 0.2, at: 0.3 });
  }

  tilt() {
    this.tone(98, 0.9, { type: 'sawtooth', gain: 0.28, wet: 0.3 });
    this.tone(104, 0.9, { type: 'square', gain: 0.14, wet: 0.3 });
  }

  start() {
    this.arp([392, 523, 659, 784], 0.09, { type: 'square', gain: 0.2, dur: 0.16, wet: 0.45 });
  }

  gameOver() {
    this.arp([523, 466, 392, 311, 262], 0.16, { type: 'triangle', gain: 0.26, dur: 0.32, wet: 0.6 });
  }

  /* ---- Game layer: castle, rules and per-gren music (pin-play) ---- */

  /** A ram on the castle door: a heavy wooden boom, more splinter each hit */
  castleHit(n = 1) {
    const k = clamp01(n / 3);
    this.thump(120 - n * 12, 38, 0.32, 0.85);
    this.noise(0.16, { gain: 0.42, freq: 520 - n * 60, q: 0.9, wet: 0.35 });
    // The splintering crack, sharper as the door weakens
    this.noise(0.06 + k * 0.08, { gain: 0.18 + k * 0.22, freq: 2400 + n * 500, q: 2.5, at: 0.02, wet: 0.2 });
    // The portcullis chain rattling in its slot
    for (let i = 0; i < 4; i++) this.tone(1900 + i * 160, 0.025, { type: 'square', gain: 0.035, at: 0.05 + i * 0.045, wet: 0.2 });
  }

  /** The third hit: the door gives way and the bridge falls */
  gateCrash() {
    this.thump(90, 30, 0.6, 1);
    this.noise(0.9, { gain: 0.55, freq: 1800, to: 160, q: 0.7, type: 'lowpass', wet: 0.6 });
    for (let i = 0; i < 7; i++) this.noise(0.04, { gain: 0.16, freq: 1500 + i * 420, q: 3, at: 0.08 + i * 0.07, wet: 0.3 });
    this.arp([147, 220, 294], 0.14, { type: 'sawtooth', gain: 0.2, dur: 0.3, wet: 0.5, at: 0.3 });
  }

  /** The drawbridge landing flat on the forecourt */
  bridgeSlam() {
    this.thump(70, 28, 0.42, 0.9);
    this.noise(0.3, { gain: 0.32, freq: 260, type: 'lowpass', wet: 0.5 });
  }

  /** The winch hauling the repaired door back up: a ratchet of clicks */
  winch() {
    for (let i = 0; i < 10; i++) {
      this.tone(620 + (i % 2) * 90, 0.03, { type: 'square', gain: 0.07, at: i * 0.075, wet: 0.25 });
      this.noise(0.02, { gain: 0.08, freq: 3200, q: 2, at: i * 0.075, wet: 0.1 });
    }
    this.thump(110, 60, 0.18, 0.4, 0.78);
  }

  /** Storming the castle: a herald's fanfare over the courtyard */
  castleStorm() {
    this.knocker();
    this.arp([392, 523, 659, 784], 0.11, { type: 'sawtooth', gain: 0.2, dur: 0.22, wet: 0.5, at: 0.06 });
    this.arp([784, 988, 1175], 0.16, { type: 'square', gain: 0.16, dur: 0.5, wet: 0.7, at: 0.55 });
    this.noise(1.1, { gain: 0.12, freq: 900, to: 2400, q: 0.6, at: 0.3, wet: 0.8 });
  }

  superJackpot() {
    this.jackpot();
    this.arp([523, 659, 784, 1047, 1319, 1568, 2093], 0.07, { type: 'sawtooth', gain: 0.16, dur: 0.26, wet: 0.6, at: 0.5 });
    this.thump(60, 30, 0.8, 0.9, 0.5);
  }

  addBall() {
    this.arp([330, 440, 554, 659, 880], 0.07, { type: 'triangle', gain: 0.28, dur: 0.2, wet: 0.5 });
    this.launch();
  }

  /** Mission select: a tick per change, a chord on the pick */
  selectTick() {
    this.tone(880, 0.05, { type: 'square', gain: 0.12, wet: 0.2 });
  }

  selectOpen() {
    this.arp([294, 392, 494], 0.08, { type: 'triangle', gain: 0.24, dur: 0.22, wet: 0.5 });
  }

  /**
   * Each gren opens with its own motif, so the ear knows which one started:
   * an engine rev for Gokart, a brass call for Femkamp, a rally of ticks
   * for Pingis, a shot and its echo for Skytte, a splash for Fiske, and a
   * full fanfare for Finalen.
   */
  modeStinger(id) {
    if (id === 'gokart') {
      this.tone(70, 0.7, { type: 'sawtooth', gain: 0.22, sweep: 260, wet: 0.2 });
      this.tone(105, 0.5, { type: 'square', gain: 0.1, sweep: 300, at: 0.15, wet: 0.2 });
      this.arp([392, 494, 587, 784], 0.09, { type: 'square', gain: 0.16, dur: 0.16, wet: 0.4, at: 0.55 });
    } else if (id === 'femkamp') {
      this.arp([392, 523, 659, 523, 784], 0.12, { type: 'sawtooth', gain: 0.2, dur: 0.22, wet: 0.5 });
    } else if (id === 'pingis') {
      for (let i = 0; i < 6; i++) this.tone(i % 2 ? 1320 : 990, 0.04, { type: 'triangle', gain: 0.24, at: i * (0.16 - i * 0.012), wet: 0.3 });
      this.arp([659, 784, 988], 0.08, { type: 'triangle', gain: 0.2, dur: 0.2, wet: 0.4, at: 0.75 });
    } else if (id === 'skytte') {
      this.noise(0.18, { gain: 0.6, freq: 900, to: 200, q: 0.8, type: 'lowpass', wet: 0.9 });
      this.thump(160, 40, 0.2, 0.7);
      this.arp([220, 277, 330], 0.14, { type: 'square', gain: 0.18, dur: 0.3, wet: 0.5, at: 0.4 });
    } else if (id === 'fiske') {
      this.tone(300, 0.22, { type: 'sine', gain: 0.32, sweep: -200, wet: 0.5 });
      this.noise(0.35, { gain: 0.22, freq: 1400, to: 400, q: 1.2, at: 0.05, wet: 0.6 });
      this.arp([440, 554, 659, 880], 0.1, { type: 'triangle', gain: 0.22, dur: 0.24, wet: 0.5, at: 0.35 });
    } else {
      this.arp([262, 330, 392, 523], 0.12, { type: 'sawtooth', gain: 0.2, dur: 0.3, wet: 0.6 });
      this.arp([523, 659, 784, 1047], 0.12, { type: 'square', gain: 0.18, dur: 0.5, wet: 0.7, at: 0.5 });
      this.thump(65, 32, 0.7, 0.8, 0.5);
    }
  }

  /** A gren's progress: a short rising blip whose pitch climbs with it */
  modeTick(frac) {
    const f = 440 * 2 ** (clamp01(frac) * 1.2);
    this.tone(f, 0.1, { type: 'square', gain: 0.14, sweep: f * 0.25, wet: 0.35 });
    this.tone(f * 1.5, 0.12, { type: 'triangle', gain: 0.1, at: 0.06, wet: 0.4 });
  }

  /**
   * Called every frame with the fastest ball on the wood and whether a ball
   * is riding a wireform (a brighter, rattling roll).
   */
  roll(speed, onWire, wireSpeed = 0) {
    if (!this.ctx || !this.rollGain) return;
    const t = this.ctx.currentTime;
    // On a wireform the bright rattle follows the RIDER's pace, which
    // slows on the climb and picks up on the way down
    const sp = onWire ? Math.max(speed, wireSpeed) : speed;
    const k = clamp01(sp / 55);
    const g = this.muted ? 0 : (onWire ? 0.14 : 0.17) * Math.sqrt(k);
    this.rollGain.gain.setTargetAtTime(g, t, 0.06);
    this.rollFilter.frequency.setTargetAtTime(onWire ? 1900 + k * 2600 : 170 + k * 560, t, 0.06);
    this.rollFilter.Q.setTargetAtTime(onWire ? 2.2 + k * 2 : 0.8, t, 0.08);
  }

  close() {
    if (!this.ctx) return;
    try {
      this.rollSrc.stop();
    } catch (e) {
      /* already stopped */
    }
    this.ctx.close();
  }
}
