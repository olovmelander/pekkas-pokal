/**
 * Pekkas Pingis — synthesized hall sound.
 *
 * Table tennis is carried by ONE sound played three ways: the hollow
 * celluloid "pock". Paddle, table and floor each get their own band of
 * it — a rally is a rhythm section, and if the three hits sound the same
 * the game feels dead. On top of that: the net's dull thud, a serve toss,
 * point jingles, and a room full of people — a murmur that swells with a
 * long rally, an "ooh" when it gets silly, applause and whistles when you
 * win a point, a groan when you lose one, and a heartbeat on match point.
 *
 * Every hit takes a `pitch` so the replay can play the rally back slowed
 * down, an octave-ish lower, the way slow motion sounds on television.
 */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bed = null;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.36;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -15;
      comp.ratio.value = 5;
      this.master.connect(comp).connect(this.ctx.destination);
      this.startBed();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.36, this.ctx.currentTime, 0.05);
  }

  noiseBuffer(dur) {
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return buf;
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

  /** Paddle contact: the celluloid pock, sharper the harder the hit. */
  paddle(power = 0.5, pitch = 1) {
    const p = Math.min(1, power);
    this.noiseHit(0.03 / pitch, 0.5 + p * 0.4, (1500 + p * 1400) * pitch, 1.6);
    this.tone((420 + p * 260) * pitch, 0.05 / pitch, 'sine', 0.34 + p * 0.2, -120 * pitch);
  }

  /** Table bounce: same pock an octave down, with the board's thump. */
  bounce(pitch = 1) {
    this.noiseHit(0.035 / pitch, 0.4, 800 * pitch, 1.4);
    this.tone(190 * pitch, 0.07 / pitch, 'sine', 0.26, -60 * pitch);
  }

  /** Floor bounce after a dead ball, quieter each time. */
  floor(gain = 0.3, pitch = 1) {
    this.noiseHit(0.04 / pitch, gain, 480 * pitch, 1.1);
  }

  /** The net: a dull cord thud that kills the rally's rhythm. */
  net(pitch = 1) {
    this.noiseHit(0.09 / pitch, 0.5, 320 * pitch, 0.8);
    this.tone(150 * pitch, 0.16 / pitch, 'triangle', 0.28, -60 * pitch);
  }

  /** Serve toss: a soft upward whisper. */
  toss() {
    this.noiseHit(0.12, 0.14, 2400, 0.7);
  }

  /** Air cut by a fast bat. */
  swish(gain = 0.25, pitch = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.22 / pitch);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(900 * pitch, t);
    bp.frequency.exponentialRampToValueAtTime(3600 * pitch, t + 0.16 / pitch);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.06 / pitch);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.2 / pitch);
    src.connect(bp).connect(env).connect(this.master);
    src.start(t);
  }

  /**
   * A smash: the crack, a chest-deep thump under it and the whoosh of the
   * bat — the one shot in the game allowed to sound violent.
   */
  smash(pitch = 1) {
    this.paddle(1, pitch);
    this.noiseHit(0.05 / pitch, 0.7, 4200 * pitch, 2.2);
    this.tone(95 * pitch, 0.32 / pitch, 'sine', 0.75, -55 * pitch);
    this.swish(0.4, pitch);
  }

  /** Scoreboard flap: a dry little clack. */
  flap(delay = 0) {
    this.noiseHit(0.012, 0.22, 3800, 2.5, delay);
    this.noiseHit(0.015, 0.16, 2100, 2.5, delay + 0.07);
  }

  /** Point to the player. */
  point() {
    this.tone(660, 0.1, 'triangle', 0.4);
    this.tone(880, 0.14, 'triangle', 0.4, 0, 0.09);
  }

  /** Point to the opponent. */
  lost() {
    this.tone(330, 0.12, 'triangle', 0.36);
    this.tone(247, 0.2, 'triangle', 0.32, 0, 0.1);
  }

  /** Rally milestone: a rising arpeggio, one note higher per tier. */
  tier(level) {
    const base = [523, 587, 659, 784, 880];
    for (let i = 0; i <= Math.min(4, level); i++) {
      this.tone(base[i] * 1.5, 0.12, 'triangle', 0.22, 0, i * 0.055);
    }
  }

  /** A medal lands: bright shimmer. */
  medal(level = 1) {
    [1568, 2093, 2637, 3136].slice(0, 2 + level).forEach((f, i) => {
      this.tone(f, 0.5, 'sine', 0.16, 0, i * 0.07);
    });
  }

  /** The intro sting for a new opponent: a low hit and a rising swell. */
  sting() {
    this.tone(60, 0.7, 'sine', 0.6, -20);
    this.noiseHit(0.5, 0.18, 600, 0.6);
    [196, 247, 294].forEach((f) => this.tone(f, 0.9, 'sawtooth', 0.05, f * 0.5, 0.05));
  }

  /** Replay start: a tape-rewind zip. */
  rewind() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc.connect(lp).connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** Match point: a slow heartbeat, lub-dub. */
  heartbeat() {
    this.tone(58, 0.16, 'sine', 0.55, -12);
    this.tone(52, 0.18, 'sine', 0.4, -10, 0.2);
  }

  /* ---- The crowd ------------------------------------------------------ */

  /**
   * The room itself: a looping murmur of filtered noise, always there under
   * the game. `crowdLevel` swells it as a rally gets long and drops it to
   * nothing on match point.
   */
  startBed() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(bp.frequency);
    const g = this.ctx.createGain();
    g.gain.value = 0.02;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.bed = { src, lfo, g };
  }

  crowdLevel(level) {
    if (!this.bed) return;
    this.bed.g.gain.setTargetAtTime(0.012 + level * 0.07, this.ctx.currentTime, 0.4);
  }

  /** Voices: a bank of detuned saws through a vowel filter. */
  voices(f0, f1, dur, gain, vowel = 600, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = vowel;
    lp.Q.value = 1.1;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(env).connect(this.master);
    for (let i = 0; i < 7; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const d = 1 + (Math.random() - 0.5) * 0.12;
      o.frequency.setValueAtTime(f0 * d, t);
      o.frequency.exponentialRampToValueAtTime(f1 * d, t + dur);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** "Oooh" — a long rally has got the room's attention. */
  ooh(power = 1) {
    this.voices(170, 230, 1.1, 0.05 * power, 420);
  }

  /** "Aaah…" — the room feels your lost point. */
  groan() {
    this.voices(240, 150, 0.9, 0.045, 560);
  }

  /** Bygdegård applause: a swell of clapping-band noise, whistles if big. */
  applause(big = false, dur = big ? 1.9 : 1.0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const gate = Math.random() < 0.16 ? 1 : 0.18;
      data[i] = (Math.random() * 2 - 1) * gate * Math.sin(Math.PI * Math.min(1, k * 3)) * (1 - k) ** 0.7;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 0.5;
    const env = this.ctx.createGain();
    env.gain.value = big ? 0.5 : 0.3;
    src.connect(bp).connect(env).connect(this.master);
    src.start(t);
    if (big) {
      this.tone(2600, 0.32, 'sine', 0.06, 900, delay + 0.15);
      this.tone(2900, 0.28, 'sine', 0.05, -700, delay + 0.55);
    }
  }

  /** Point won: the jingle, applause sized to the rally, and a cheer. */
  cheer(power = 0.5) {
    this.applause(power > 0.6, 0.8 + power * 1.2);
    if (power > 0.4) this.voices(260, 340, 0.8, 0.035 * power, 900, 0.05);
  }

  /** Match won: a little fanfare over the applause. */
  fanfare() {
    this.applause(true);
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone(f, 0.22, 'triangle', 0.4, 0, 0.1 + i * 0.11);
    });
  }

  /**
   * Champion: the full fanfare — a brass-ish triad call, a held tonic, and
   * the whole hall on its feet.
   */
  champion() {
    if (!this.ctx || this.muted) return;
    const notes = [
      [523, 0, 0.16], [523, 0.18, 0.16], [523, 0.36, 0.16], [659, 0.54, 0.5],
      [587, 1.08, 0.16], [659, 1.26, 0.16], [784, 1.44, 1.1]
    ];
    notes.forEach(([f, d, len]) => {
      this.tone(f, len, 'sawtooth', 0.12, 0, d);
      this.tone(f * 1.5, len, 'triangle', 0.1, 0, d);
      this.tone(f / 2, len, 'triangle', 0.14, 0, d);
    });
    this.applause(true, 3.2);
    this.voices(250, 360, 2.4, 0.05, 900, 0.3);
    this.applause(true, 2.6, 1.5);
  }
}

export default Sfx;
