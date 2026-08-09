/**
 * Pekkas Måleri — synthesized garden sound.
 *
 * A painting game has almost no percussive events of its own, so the
 * sounds have to be invented rather than recorded: the wet slap of a
 * loaded brush on canvas, the click of a pigment tube, and the little
 * rising chime when a mix lands on the colour you were after. Under it
 * all, an August garden — birds and a wind bed.
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
      this.ambient();
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

  /** A garden in August: a wind bed with birds over it. */
  ambient() {
    if (!this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * 4);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      // Brown noise reads as wind in leaves; white noise reads as static
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995;
      d[i] = last;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.value = 1.5;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    this.wind = src;

    const bird = () => {
      if (!this.ctx || this.muted) return;
      const f = 2200 + Math.random() * 1800;
      const n2 = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n2; i++) {
        this.tone(f * (1 + i * 0.06), 0.06, 'sine', 0.05, 500, i * 0.09);
      }
    };
    this.birdTimer = setInterval(() => {
      if (Math.random() < 0.55) bird();
    }, 2600);
  }

  /** Pigment squeezed out of the tube. */
  drop(kind = 0) {
    this.noiseHit(0.05, 0.3, 700 + kind * 180, 2.4);
    this.tone(180 + kind * 30, 0.05, 'sine', 0.16, -50);
  }

  /** A loaded brush laid on the canvas: wet, soft, a little draggy. */
  stroke(quality = 0.5) {
    this.noiseHit(0.16, 0.34, 900 + quality * 700, 0.9);
    this.noiseHit(0.1, 0.2, 2200, 1.4, 0.03);
    this.tone(120 + quality * 90, 0.11, 'triangle', 0.2, 40);
  }

  /** The mix has landed on the target. */
  match() {
    this.tone(880, 0.09, 'triangle', 0.3);
    this.tone(1320, 0.12, 'triangle', 0.26, 0, 0.07);
  }

  /** Wiping the palette clean. */
  scrape() {
    this.noiseHit(0.22, 0.26, 1500, 0.7);
  }

  /** The slip comes out of the hat. */
  slip() {
    this.noiseHit(0.2, 0.3, 3200, 0.8);
    this.tone(520, 0.14, 'triangle', 0.22, 260);
  }

  /** Mikael Hägglund clears his throat before delivering the verdict. */
  gavel() {
    this.noiseHit(0.08, 0.5, 260, 1.6);
    this.tone(150, 0.16, 'triangle', 0.3, -50);
  }

  /** Polite garden applause. */
  applause(big = false) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const dur = big ? 1.8 : 1;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const gate = Math.random() < 0.15 ? 1 : 0.16;
      d[i] = (Math.random() * 2 - 1) * gate * Math.sin(Math.PI * Math.min(1, k * 3)) * (1 - k) ** 0.7;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.value = big ? 0.5 : 0.3;
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
  }

  fanfare() {
    this.applause(true);
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone(f, 0.24, 'triangle', 0.38, 0, 0.1 + i * 0.12);
    });
  }

  close() {
    clearInterval(this.birdTimer);
    if (this.ctx) this.ctx.close();
  }
}

export default Sfx;
