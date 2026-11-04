/**
 * The dot-matrix display in the backbox.
 *
 * A real 128×32 plasma DMD: the game draws into a byte per dot, and a shader
 * turns each byte into a round amber dot with a dark gap around it. Drawing
 * the dots in the shader rather than into a big canvas keeps the upload to
 * 4 KB per change and keeps the dots crisp at any distance — when a dot gets
 * smaller than a pixel the shader settles on its average glow instead of
 * shimmering.
 *
 * Text uses a hand-drawn 5×7 bitmap font (scaled ×2 and ×3 for headlines):
 * canvas text thresholded to dots never looks like a DMD.
 */

export const DMD_W = 128;
export const DMD_H = 32;
const W = DMD_W;
const H = DMD_H;

/* 5×7 glyphs, one 5-bit row each, bit 4 = leftmost column */
const FONT = {
  A: [14, 17, 17, 17, 31, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  Å: [4, 10, 4, 14, 17, 31, 17], Ä: [10, 0, 14, 17, 31, 17, 17], Ö: [10, 0, 14, 17, 17, 17, 14],
  É: [2, 4, 31, 16, 30, 16, 31], Ü: [10, 0, 17, 17, 17, 17, 14],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], '.': [0, 0, 0, 0, 0, 0, 4],
  ',': [0, 0, 0, 0, 0, 4, 8], ':': [0, 0, 4, 0, 0, 4, 0], '-': [0, 0, 0, 14, 0, 0, 0],
  '+': [0, 4, 4, 31, 4, 4, 0], '/': [0, 1, 2, 4, 8, 16, 0], "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
  '=': [0, 0, 31, 0, 31, 0, 0], '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8],
  '%': [24, 25, 2, 4, 8, 19, 3], '&': [12, 18, 20, 8, 21, 18, 13], '#': [10, 10, 31, 10, 31, 10, 10],
  '×': [0, 17, 10, 4, 10, 17, 0], '·': [0, 0, 0, 4, 0, 0, 0], '●': [0, 14, 31, 31, 31, 14, 0],
  '○': [0, 14, 17, 17, 17, 14, 0], '✓': [0, 1, 1, 2, 20, 8, 0], '→': [0, 4, 2, 31, 2, 4, 0],
  '^': [0, 0, 21, 31, 31, 31, 0]
};
const ALIAS = { '—': '-', '–': '-', '…': '.', '✗': 'X' };
const SPACE = 3;
const THIN = 2; // U+2009 THIN SPACE, the thousands separator

// Width-trimmed glyphs. Digits keep their full cell so scores don't wobble.
const GLYPHS = {};
Object.entries(FONT).forEach(([ch, rows]) => {
  let lo = 5;
  let hi = -1;
  rows.forEach((r) => {
    for (let c = 0; c < 5; c++) {
      if (r & (16 >> c)) {
        lo = Math.min(lo, c);
        hi = Math.max(hi, c);
      }
    }
  });
  const digit = ch >= '0' && ch <= '9';
  GLYPHS[ch] = digit ? { rows, off: 0, w: 5 } : { rows, off: lo, w: Math.max(1, hi - lo + 1) };
});

/** Small pixel-art icons: 'X' lit, '+' half. */
const ICONS = {
  trophy: [
    'XXXXXXXXXXX',
    'X+XXXXXXX+X',
    'X+XXXXXXX+X',
    '+XXXXXXXXX+',
    '.+XXXXXXX+.',
    '..+XXXXX+..',
    '....XXX....',
    '.....X.....',
    '.....X.....',
    '...XXXXX...',
    '..XXXXXXX..',
    '..XXXXXXX..'
  ],
  ball: ['..XXX..', '.XXXXX.', 'XX+XXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..'],
  lock: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'XX.XX', 'XX.XX', 'XXXXX'],
  castle: [
    'X.X.........X.X',
    'XXX...X.X...XXX',
    'XXX...XXX...XXX',
    'XXX.X.XXX.X.XXX',
    'XXXXXXXXXXXXXXX',
    'XXXXXX...XXXXXX',
    'XXXXX.....XXXXX',
    'XXXXX.....XXXXX'
  ]
};

const MARQUEE = "GRENAR · GOKART '12 · FEMKAMP '13 · PINGIS '19 · SKYTTE '22 · FISKE '24 · FINALEN ^";
const MARQUEE_SPEED = 100; // dots per second

export const fmtScore = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 hot;
uniform vec3 dim;
uniform float gain;
varying vec2 vUv;
void main() {
  vec2 grid = vec2(${W}.0, ${H}.0);
  vec2 cell = vec2(vUv.x, 1.0 - vUv.y) * grid;
  vec2 id = floor(cell);
  float v = texture2D(map, (id + 0.5) / grid).r;
  float d = length(fract(cell) - 0.5);
  float w = max(fwidth(cell.x), 1e-4);
  float dotMask = 1.0 - smoothstep(0.37 - w, 0.37 + w, d);
  // A dot smaller than a pixel would shimmer: settle on its average instead
  dotMask = mix(dotMask, 0.42, clamp((w - 0.3) * 2.5, 0.0, 1.0));
  vec3 col = (dim + hot * gain * v) * dotMask + hot * v * 0.07;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Dmd {
  constructor(THREE) {
    this.data = new Uint8Array(W * H);
    this.last = new Uint8Array(W * H);
    this.texture = new THREE.DataTexture(this.data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.texture },
        // Plasma orange, pulled a little toward the site's gold
        hot: { value: new THREE.Color(0xff8c2e) },
        dim: { value: new THREE.Color(0x1c0d05) },
        gain: { value: 2.3 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: false
    });
    this.cur = null;
    this.queue = [];
    this.base = null; // (dmd, t) => void: what shows between callouts
    this.clock = 0;
    this.acc = 1;
  }

  /* ------------------------------------------------------------ drawing */

  clear() {
    this.data.fill(0);
  }

  px(x, y, v = 255) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (v > this.data[i]) this.data[i] = v;
  }

  rect(x, y, w, h, v = 255) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, v);
  }

  frame(x, y, w, h, v = 255) {
    for (let i = 0; i < w; i++) {
      this.px(x + i, y, v);
      this.px(x + i, y + h - 1, v);
    }
    for (let j = 0; j < h; j++) {
      this.px(x, y + j, v);
      this.px(x + w - 1, y + j, v);
    }
  }

  glyphOf(ch) {
    return GLYPHS[ALIAS[ch] || ch] || GLYPHS['?'];
  }

  measure(str, s = 1) {
    let w = 0;
    for (const ch of String(str).toUpperCase()) {
      if (ch === ' ') w += SPACE * s;
      else if (ch === '\u2009') w += THIN * s;
      else w += (this.glyphOf(ch).w + 1) * s;
    }
    return Math.max(0, w - s);
  }

  /** Draws text; returns its width. align: 'left' | 'center' | 'right' */
  text(str, x, y, { s = 1, align = 'left', v = 255 } = {}) {
    const txt = String(str).toUpperCase();
    const w = this.measure(txt, s);
    let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    for (const ch of txt) {
      if (ch === ' ') {
        cx += SPACE * s;
        continue;
      }
      if (ch === '\u2009') {
        cx += THIN * s;
        continue;
      }
      const g = this.glyphOf(ch);
      for (let r = 0; r < 7; r++) {
        const row = g.rows[r];
        for (let c = 0; c < g.w; c++) {
          if (row & (16 >> (c + g.off))) this.rect(cx + c * s, y + r * s, s, s, v);
        }
      }
      cx += (g.w + 1) * s;
    }
    return w;
  }

  icon(name, x, y, v = 255, s = 1) {
    ICONS[name].forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = row[i];
        if (c === 'X' || c === '+') this.rect(x + i * s, y + j * s, s, s, c === 'X' ? v : v >> 1);
      }
    });
  }

  invert() {
    for (let i = 0; i < this.data.length; i++) this.data[i] = 255 - this.data[i];
  }

  /** Lamps chasing round the edge of the display */
  border(t, v = 200, speed = 40) {
    const per = 2 * (W + H) - 4;
    const shift = Math.floor(t * speed);
    for (let p = 0; p < per; p++) {
      if ((p + shift) % 6 >= 3) continue;
      let x;
      let y;
      if (p < W) [x, y] = [p, 0];
      else if (p < W + H - 1) [x, y] = [W - 1, p - W + 1];
      else if (p < 2 * W + H - 2) [x, y] = [W - 1 - (p - W - H + 2), H - 1];
      else [x, y] = [0, H - 1 - (p - 2 * W - H + 3)];
      this.px(x, y, v);
    }
  }

  sparkle(n, v = 255) {
    for (let i = 0; i < n; i++) this.px(Math.random() * W, Math.random() * H, v * (0.4 + Math.random() * 0.6));
  }

  /** Lines bursting out of the centre */
  burst(t, v = 160) {
    const r0 = t * 90;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      for (let r = r0; r < r0 + 10; r++) this.px(64 + Math.cos(ang) * r * 1.6, 16 + Math.sin(ang) * r * 0.55, v);
    }
  }

  /**
   * Picks a scale per line — as big as fits the width — then shrinks the
   * biggest until the stack fits the height.
   */
  layout(lines, maxS = 3) {
    const sc = lines.map((l) => {
      let s = maxS;
      while (s > 1 && this.measure(l, s) > W - 4) s--;
      return s;
    });
    const gap = lines.length > 3 ? 1 : 3;
    const height = () => sc.reduce((a, s) => a + 7 * s, 0) + (lines.length - 1) * gap;
    while (height() > H) {
      const i = sc.indexOf(Math.max(...sc));
      if (sc[i] === 1) break;
      sc[i]--;
    }
    return { sc, gap, h: height() };
  }

  stack(lines, { maxS = 3, v = 255, dimRest = false, yOff = 0 } = {}) {
    const { sc, gap, h } = this.layout(lines, maxS);
    let y = Math.round((H - h) / 2) + yOff;
    lines.forEach((l, i) => {
      this.text(l, 64, y, { s: sc[i], align: 'center', v: dimRest && i > 0 ? 170 : v });
      y += 7 * sc[i] + gap;
    });
  }

  /* -------------------------------------------------------- scheduling */

  /**
   * Queue a callout. Higher priority interrupts; equal big ones wait their
   * turn so a jackpot is never swallowed by the ramp that set it up.
   */
  show(draw, dur = 1.5, prio = 1) {
    const s = { draw, dur, prio, t: 0 };
    const { cur } = this;
    if (!cur || prio > cur.prio || (prio === cur.prio && (prio < 2 || cur.t > cur.dur * 0.6))) {
      if (cur && cur.prio >= 2 && cur.t < cur.dur * 0.5) this.enqueue(cur);
      this.cur = s;
    } else if (prio >= 2) {
      this.enqueue(s);
    }
  }

  enqueue(s) {
    const i = this.queue.findIndex((q) => q.prio < s.prio);
    if (i < 0) this.queue.push(s);
    else this.queue.splice(i, 0, s);
    if (this.queue.length > 4) this.queue.pop();
  }

  reset() {
    this.cur = null;
    this.queue = [];
  }

  /** Advances the display; redraws at 30 fps and uploads only on change. */
  update(dt) {
    this.clock += dt;
    if (this.cur) {
      this.cur.t += dt;
      if (this.cur.t >= this.cur.dur) this.cur = this.queue.shift() || null;
    }
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    this.data.fill(0);
    if (this.cur) {
      this.cur.draw(this, this.cur.t);
      // Every callout opens with a quick wipe out from the centre
      if (this.cur.t < 0.12) {
        const half = 64 * (this.cur.t / 0.12);
        for (let x = 0; x < W; x++) {
          if (Math.abs(x + 0.5 - 64) > half) for (let y = 0; y < H; y++) this.data[y * W + x] = 0;
        }
      }
    } else if (this.base) {
      this.base(this, this.clock);
    }
    let same = true;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] !== this.last[i]) {
        same = false;
        break;
      }
    }
    if (!same) {
      this.last.set(this.data);
      this.texture.needsUpdate = true;
    }
  }

  /* ------------------------------------------------------------- scenes */

  say(lines, { dur = 1.5, prio = 1, flash = false, border = false, maxS = 3 } = {}) {
    const ls = Array.isArray(lines) ? lines : [lines];
    this.show((d, t) => {
      d.stack(ls, { maxS, dimRest: ls.length > 1 });
      if (border) d.border(t);
      if (flash && t < 0.45 && Math.floor(t * 14) % 2) d.invert();
    }, dur, prio);
  }

  jackpot(pts) {
    this.show((d, t) => {
      if (t < 0.4) {
        d.text('JACKPOT', 64, 5, { s: 3, align: 'center' });
        if (Math.floor(t * 16) % 2) d.invert();
        return;
      }
      d.text('JACKPOT', 64, 1, { s: 3, align: 'center' });
      const k = Math.min(1, (t - 0.4) / 0.7);
      d.text(fmtScore(Math.round((pts * k) / 10) * 10), 64, 24, { align: 'center' });
      d.sparkle(14);
      d.border(t, 120, 60);
    }, 2.6, 3);
  }

  multiball() {
    this.show((d, t) => {
      if (t < 0.5) {
        const x = 128 - (t / 0.5) * 64;
        d.text('MULTIBALL', x, 9, { s: 2, align: 'center' });
        return;
      }
      if (t < 1.3) {
        d.burst(t - 0.5);
        d.text('MULTIBALL', 64, 9, { s: 2, align: 'center' });
        if (Math.floor(t * 12) % 2) d.invert();
        return;
      }
      d.text('MULTIBALL', 64, 2, { s: 2, align: 'center' });
      d.text('SKJUT POKALEN!', 64, 22, { align: 'center', v: 200 });
      d.border(t);
    }, 3, 3);
  }

  modeStart(name, year, task, secs) {
    this.show((d, t) => {
      if (t < 1.4) {
        d.text(`GREN '${String(year).slice(2)}`, 64, 1, { align: 'center', v: 170 });
        d.text(name, 64, 11, { s: name.length > 7 ? 2 : 3, align: 'center' });
        if (t < 0.35 && Math.floor(t * 14) % 2) d.invert();
        return;
      }
      d.stack([task.toUpperCase(), `${secs} SEKUNDER`], { maxS: 1, dimRest: true });
      d.border(t, 140);
    }, 3, 3);
  }

  modeWin(name, pts) {
    this.show((d, t) => {
      d.stack([name, 'KLAR!', `+${fmtScore(pts)}`], { maxS: 2 });
      d.sparkle(10);
      d.border(t, 200, 70);
      if (t < 0.4 && Math.floor(t * 14) % 2) d.invert();
    }, 2.6, 3);
  }

  ballSave() {
    this.show((d, t) => {
      const bounce = Math.abs(Math.sin(t * 7)) * 9 * Math.max(0, 1 - t / 2);
      d.icon('ball', 8, 21 - bounce);
      d.icon('ball', 113, 21 - bounce);
      d.stack(['BOLL', 'RÄDDAD!'], { maxS: 2 });
    }, 2, 3);
  }

  skillShot(pts, superShot = false) {
    this.show((d, t) => {
      if (superShot) d.text('SUPER', 64, 0, { align: 'center', v: 200 });
      d.text('SKILL SHOT', 64, superShot ? 9 : 4, { s: 2, align: 'center' });
      d.text(`+${fmtScore(pts)}`, 64, 24, { align: 'center' });
      d.sparkle(superShot ? 20 : 8);
      if (t < 0.45 && Math.floor(t * 14) % 2) d.invert();
    }, 2.2, 3);
  }

  combo(n, pts) {
    this.show((d, t) => {
      d.text(`KOMBO ×${n}`, 64, 3, { s: 2, align: 'center' });
      d.text(`+${fmtScore(pts)}`, 64, 22, { align: 'center', v: 200 });
      if (n >= 3) d.border(t, 160, 80);
    }, 1.1, n >= 3 ? 2 : 1);
  }

  /** The P-O-K-A-L bank with the dropped letters lit */
  pokal(lit, hit) {
    this.show((d, t) => {
      const letters = 'POKAL';
      const step = 22;
      const x0 = 64 - step * 2;
      for (let i = 0; i < 5; i++) {
        const on = lit[i];
        const blink = i === hit && t < 0.6 && Math.floor(t * 10) % 2;
        if (on && !blink) d.rect(x0 + i * step - 9, 3, 19, 25, 70);
        d.text(letters[i], x0 + i * step, 5, { s: 3, align: 'center', v: on ? 255 : 60 });
      }
    }, 1.1, 1);
  }

  spinner(n) {
    this.show((d, t) => {
      d.text('SNURRAN', 64, 2, { s: 2, align: 'center' });
      d.text(`${n} VARV`, 64, 22, { align: 'center', v: 200 });
      // The blade itself, spinning down at either end of the line
      const a = n * 2.2 * (1 - Math.exp(-t * 2.5));
      [14, 113].forEach((cx) => {
        for (let r = -5; r <= 5; r++) d.px(cx + Math.cos(a * 6) * r, 25 + Math.sin(a * 6) * r * 0.5, 200);
      });
    }, 1.1, 1);
  }

  ramp(name) {
    this.show((d, t) => {
      d.text(name, 64, 4, { s: 2, align: 'center' });
      // Chevrons racing across underneath
      for (let k = 0; k < 6; k++) {
        const x = ((t * 140 + k * 22) % 140) - 6;
        d.text('>', x, 23, { v: 180 });
      }
    }, 1.3, 1);
  }

  lock(n) {
    this.show((d, t) => {
      d.icon('lock', 10, 12 - Math.max(0, 0.3 - t) * 20);
      d.icon('lock', 113, 12 - Math.max(0, 0.3 - t) * 20);
      d.stack([n >= 2 ? 'BOLL 2 LÅST' : 'BOLL LÅST', n >= 2 ? 'MULTIBALL!' : `${n}/2 I BORGEN`], { maxS: 2 });
    }, 2, 3);
  }

  extraBall(again = false) {
    this.show((d, t) => {
      d.stack(['EXTRA BOLL', again ? 'SKJUT IGEN!' : 'TÄND!'], { maxS: 2 });
      d.border(t, 220, 80);
      if (t < 0.5 && Math.floor(t * 14) % 2) d.invert();
    }, 2.2, 3);
  }

  warning() {
    this.show((d, t) => {
      d.stack(['VARNING', 'LUGNT NU!'], { maxS: 2 });
      if (Math.floor(t * 8) % 2) d.invert();
    }, 1.4, 3);
  }

  tilt() {
    this.show((d, t) => {
      d.text('TILT', 64, 5, { s: 3, align: 'center' });
      if (Math.floor(t * 4) % 2) d.invert();
    }, 3, 4);
  }

  /** End-of-ball bonus: the classic count, row by row */
  bonus(rows, mult, total) {
    const step = 0.5;
    const pages = rows.length + (mult > 1 ? 1 : 0) + 1;
    this.show((d, t) => {
      const i = Math.floor(t / step);
      if (i < rows.length) {
        const [label, value] = rows[i];
        d.text('BONUS', 64, 1, { align: 'center', v: 150 });
        d.text(label, 64, 10, { s: label.length > 10 ? 1 : 2, align: 'center' });
        d.text(value, 64, 25, { align: 'center', v: 200 });
      } else if (mult > 1 && i === rows.length) {
        d.text('BONUS', 64, 1, { align: 'center', v: 150 });
        d.text(`×${mult}`, 64, 10, { s: 3, align: 'center' });
      } else {
        d.text('TOTAL BONUS', 64, 1, { align: 'center', v: 170 });
        d.text(fmtScore(total), 64, 12, { s: 2, align: 'center' });
        d.border(t, 140);
      }
    }, pages * step + 0.9, 3);
  }

  gameOver(score) {
    this.show((d, t) => {
      if (t < 1.6) {
        d.text('SPELET', 64, 1, { s: 2, align: 'center' });
        d.text('SLUT', 64, 17, { s: 2, align: 'center' });
        return;
      }
      d.text('SLUTPOÄNG', 64, 1, { align: 'center', v: 170 });
      d.text(fmtScore(score), 64, 12, { s: 2, align: 'center' });
    }, 4, 4);
  }

  highScore(rank, name) {
    this.show((d, t) => {
      d.text(rank === 1 ? 'NYTT REKORD!' : `PLATS ${rank}`, 64, 2, { s: 2, align: 'center' });
      d.text(name ? name : 'PÅ TOPPLISTAN', 64, 22, { align: 'center', v: 200 });
      d.sparkle(rank === 1 ? 22 : 10);
      d.border(t, 200, 70);
    }, 3, 4);
  }

  /* ------------------------------------------------------ base screens */

  /**
   * The in-game screen: score big, a status line underneath. `s` is a plain
   * snapshot from the game so this file knows nothing about the rules.
   */
  play(s, t) {
    const txt = fmtScore(s.score);
    const big = this.measure(txt, 2) <= W - 4;
    this.text(txt, 64, big ? 3 : 8, { s: big ? 2 : 1, align: 'center' });
    const y = 24;
    const blink = Math.floor(t * 2.5) % 2 === 0;
    if (s.mode) {
      this.text(s.mode.label, 1, y, { v: 210 });
      this.text(s.mode.time, 127, y, { align: 'right', v: s.mode.secs <= 10 && !blink ? 90 : 255 });
      // Time left as a bar along the bottom edge
      const len = Math.round(128 * s.mode.frac);
      for (let x = 0; x < len; x++) this.px(x, 31, 120);
      return;
    }
    this.text(`BOLL ${s.ball}`, 1, y, { v: 150 });
    if (s.mult > 1) this.text(`×${s.mult}`, 127, y, { align: 'right', v: 210 });
    if (s.status) this.text(s.status, 66, y, { align: 'center', v: s.hot && !blink ? 90 : 230 });
  }

  /** Attract mode pages, cycled while nobody is playing */
  attract(t, data) {
    const pages = [
      (d, tt) => {
        d.icon('trophy', 6, 10);
        d.icon('trophy', 111, 10);
        d.text('PEKKAS', 64, 1, { s: 2, align: 'center' });
        d.text('POKAL', 64, 17, { s: 2, align: 'center' });
        d.border(tt, 130, 30);
      },
      (d) => {
        d.text('FLIPPER', 64, 2, { s: 2, align: 'center' });
        d.text('PEKKAS POKAL 2025', 64, 23, { align: 'center', v: 180 });
      },
      (d, tt) => {
        d.text('STARTA', 64, 2, { s: 2, align: 'center', v: Math.floor(tt * 3) % 2 ? 255 : 110 });
        d.text(data.startHint, 64, 23, { align: 'center', v: 190 });
      },
      ...this.boardPages(data.board),
      ...(data.last ? [(d) => {
        d.text('SENASTE SPEL', 64, 1, { align: 'center', v: 160 });
        d.text(fmtScore(data.last), 64, 12, { s: 2, align: 'center' });
      }] : []),
      (d, tt) => d.text(MARQUEE, 128 - tt * MARQUEE_SPEED, 9, { s: 2 }),
      (d, tt) => {
        d.icon('castle', 56, 2 + Math.round(Math.sin(tt * 3)));
        d.text('BORGEN VÄNTAR', 64, 15, { align: 'center' });
        d.text('STORMA PORTEN', 64, 24, { align: 'center', v: 150 });
        d.sparkle(4, 140);
      }
    ];
    // The marquee page lasts exactly as long as the text takes to cross
    const marquee = (this.measure(MARQUEE, 2) + W) / MARQUEE_SPEED;
    const durs = pages.map((_, i) => (i === pages.length - 2 ? marquee : 3.2));
    const cycle = durs.reduce((a, b) => a + b, 0);
    let tt = t % cycle;
    let i = 0;
    while (tt > durs[i]) {
      tt -= durs[i];
      i++;
    }
    pages[i](this, tt);
    if (tt < 0.12) {
      const half = 64 * (tt / 0.12);
      for (let x = 0; x < W; x++) {
        if (Math.abs(x + 0.5 - 64) > half) for (let y = 0; y < H; y++) this.data[y * W + x] = 0;
      }
    }
  }

  boardPages(board) {
    if (!board.length) {
      return [(d) => {
        d.text('TOPPLISTA', 64, 1, { align: 'center', v: 170 });
        d.text('INGA REKORD', 64, 11, { align: 'center' });
        d.text('BLI FÖRST!', 64, 21, { align: 'center', v: 200 });
      }];
    }
    const rows = board.slice(0, 5);
    const page = (from) => (d) => {
      d.text(from === 0 ? 'TOPPLISTA' : 'TOPPLISTA FORTS.', 64, 0, { align: 'center', v: 150 });
      rows.slice(from, from + 3).forEach((e, k) => {
        const y = 9 + k * 8;
        d.text(`${from + k + 1}`, 2, y, { v: 170 });
        d.text(e.n.slice(0, 11), 12, y);
        d.text(fmtScore(e.s), 126, y, { align: 'right' });
      });
    };
    return rows.length > 3 ? [page(0), page(3)] : [page(0)];
  }

  dispose() {
    this.texture.dispose();
    this.material.dispose();
  }
}
