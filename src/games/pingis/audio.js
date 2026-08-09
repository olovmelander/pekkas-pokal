/**
 * Pekkas Pingis — synthesized hall sound.
 *
 * Table tennis is carried by ONE sound played three ways: the hollow
 * celluloid "pock". Paddle, table and floor each get their own band of
 * it — a rally is a rhythm section, and if the three hits sound the same
 * the game feels dead. On top of that: the net's dull thud, a serve
 * toss, point jingles and a little bygdegård applause.
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
      this.master.gain.value = 0.36;
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

  /** Paddle contact: the celluloid pock, sharper the harder the hit. */
  paddle(power = 0.5) {
    const p = Math.min(1, power);
    this.noiseHit(0.03, 0.5 + p * 0.4, 1500 + p * 1400, 1.6);
    this.tone(420 + p * 260, 0.05, 'sine', 0.34 + p * 0.2, -120);
  }

  /** Table bounce: same pock an octave down, with the board's thump. */
  bounce() {
    this.noiseHit(0.035, 0.4, 800, 1.4);
    this.tone(190, 0.07, 'sine', 0.26, -60);
  }

  /** Floor bounce after a dead ball, quieter each time. */
  floor(gain = 0.3) {
    this.noiseHit(0.04, gain, 480, 1.1);
  }

  /** The net: a dull cord thud that kills the rally's rhythm. */
  net() {
    this.noiseHit(0.09, 0.5, 320, 0.8);
    this.tone(150, 0.16, 'triangle', 0.28, -60);
  }

  /** Serve toss: a soft upward whisper. */
  toss() {
    this.noiseHit(0.12, 0.14, 2400, 0.7);
  }

  /** A smash: paddle pock plus an air-cutting whoosh. */
  smash() {
    this.paddle(1);
    this.noiseHit(0.14, 0.42, 3000, 0.8, 0.01);
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

  /** Bygdegård applause: a swell of clapping-band noise. */
  applause(big = false) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const dur = big ? 1.7 : 0.9;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      // Claps: bursts of noise gated by a random comb
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
  }

  /** Match won: a little fanfare over the applause. */
  fanfare() {
    this.applause(true);
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone(f, 0.22, 'triangle', 0.4, 0, 0.1 + i * 0.11);
    });
  }
}

export default Sfx;
