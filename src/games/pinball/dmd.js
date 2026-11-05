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
  kart: [
    '.....XX.......',
    '....XXXX......',
    '..XXXXXXXXXX..',
    '.XXXXXXXXXXXXX',
    'XXXXXXXXXXXXXX',
    '.XX+X....X+XX.',
    '.XXXX....XXXX.',
    '..XX......XX..'
  ],
  fish: [
    '......XXXX.....',
    '....XXXXXXX...X',
    '..XXXXXXXXXX.XX',
    '.X.XXXXXXXXXXX.',
    'XXXXXXXXXXXXXX.',
    '..XXXXXXXXXX.XX',
    '....XXXXXXX...X',
    '......XXXX.....'
  ],
  paddle: [
    '.XXXX.',
    'XXXXXX',
    'XXXXXX',
    'XXXXXX',
    '.XXXX.',
    '..XX..',
    '..XX..',
    '..XX..'
  ],
  clay: ['..XXXXX..', '.X+XXX+X.', 'XXXXXXXXX', '.XXXXXXX.'],
  crown: [
    'X....X....X',
    'XX..XXX..XX',
    'XXX.XXX.XXX',
    'XXXXXXXXXXX',
    'XXXXXXXXXXX',
    '+XXXXXXXXX+'
  ],
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

/*
 * Two reads of the same 128×32 bytes. The dot itself is an exact texelFetch,
 * so each dot is one value however the texture is filtered; the plasma's
 * haze between the dots is a soft bilinear read of the neighbours, which
 * gives the display its glow without involving the bloom pass at all.
 *
 * The peak is held just under the bloom threshold on purpose. A grid of
 * 2–3-pixel dots going into a bloom pass that samples at a third of the
 * resolution aliases: as the camera drifts with the ball, the dots slide in
 * and out of the bloom's samples and the glow crawls. Dots at the threshold
 * edge (where they used to sit) were the worst case — on some GPUs they
 * bloomed, on others not, and in between they flickered.
 */
const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 hot;
uniform vec3 dim;
uniform float gain;
uniform float haze;
varying vec2 vUv;
void main() {
  vec2 grid = vec2(${W}.0, ${H}.0);
  vec2 cell = vec2(vUv.x, 1.0 - vUv.y) * grid;
  vec2 id = clamp(floor(cell), vec2(0.0), grid - 1.0);
  float v = texelFetch(map, ivec2(id), 0).r;
  vec2 st = cell / grid;
  vec2 o = 0.6 / grid;
  float soft = 0.25 * (texture2D(map, st + vec2(o.x, o.y)).r + texture2D(map, st + vec2(-o.x, o.y)).r +
    texture2D(map, st + vec2(o.x, -o.y)).r + texture2D(map, st - o).r);
  float d = length(fract(cell) - 0.5);
  // Dots per pixel along whichever axis is densest: the head leans back,
  // so the rows are foreshortened more than the columns.
  vec2 fw = fwidth(cell);
  float w = max(max(fw.x, fw.y), 1e-3);
  float dotMask = 1.0 - smoothstep(0.37 - w, 0.37 + w, d);
  // A dot smaller than a pixel would shimmer: settle on its average instead
  dotMask = mix(dotMask, 0.42, clamp((w - 0.3) * 2.5, 0.0, 1.0));
  vec3 col = (dim + hot * gain * v) * dotMask + hot * soft * haze;
  gl_FragColor = vec4(col, 1.0);
  // No-ops inside the composer (OutputPass grades the whole frame), but they
  // keep the display amber rather than raw linear red when the frame is
  // drawn straight to the screen (?gfx=safe, or after the watchdog steps in)
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Dmd {
  /** `calm`: no full-screen strobing (prefers-reduced-motion) */
  constructor(THREE, { calm = false } = {}) {
    this.calm = calm;
    this.data = new Uint8Array(W * H);
    this.last = new Uint8Array(W * H);
    this.texture = new THREE.DataTexture(this.data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    // Linear for the haze read; the dots use texelFetch and ignore it
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.texture },
        // Plasma orange, pulled a little toward the site's gold
        hot: { value: new THREE.Color(0xff8c2e) },
        dim: { value: new THREE.Color(0x1c0d05) },
        // Peak luminance ≈ 0.87, under the bloom threshold (0.96) with margin
        gain: { value: 2.0 },
        haze: { value: 0.14 }
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
    this.attractLap = 0;
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

  line(x0, y0, x1, y1, v = 255) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, v);
  }

  circle(cx, cy, r, v = 255) {
    const n = Math.max(12, Math.round(r * 7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, v);
    }
  }

  /**
   * A one-second picture for each gren, played before its title card:
   * the kart tearing across, the five rings, a rally over the net, a clay
   * shattering in the sights, a fish jumping, the crown for Finalen.
   */
  modeAnim(id, t) {
    const k = Math.min(1, t);
    if (id === 'gokart') {
      // Chequered flags at either end, the kart with speed lines behind
      for (let y = 0; y < 32; y += 4) {
        for (let x = 0; x < 8; x += 4) {
          if (((x + y) / 4) % 2 === 0) {
            this.rect(x, y, 4, 4, 140);
            this.rect(124 - x, y, 4, 4, 140);
          }
        }
      }
      const x = -30 + k * 150;
      this.icon('kart', x, 10, 255, 2);
      for (let i = 0; i < 4; i++) this.line(x - 6 - i * 7, 14 + i * 2, x - 18 - i * 7, 14 + i * 2, 150);
      this.line(0, 29, 127, 29, 90);
    } else if (id === 'femkamp') {
      const n = Math.min(5, Math.floor(k * 6.5));
      const pos = [[44, 11], [64, 11], [84, 11], [54, 19], [74, 19]];
      for (let i = 0; i < n; i++) this.circle(pos[i][0], pos[i][1], 8, i === n - 1 ? 255 : 190);
    } else if (id === 'pingis') {
      this.icon('paddle', 6, 12, 220, 2);
      this.icon('paddle', 110, 12, 220, 2);
      this.line(64, 18, 64, 31, 150);
      this.line(18, 31, 110, 31, 110);
      const ph = (t * 1.6) % 1;
      const dir = Math.floor(t * 1.6) % 2 ? -1 : 1;
      const bx = 64 + dir * (ph * 2 - 1) * 42;
      const by = 28 - Math.sin(ph * Math.PI) * 22;
      this.rect(bx - 1, by - 1, 3, 3, 255);
    } else if (id === 'skytte') {
      const cx = 30 + k * 60;
      const cy = 20 - Math.sin(k * Math.PI) * 12;
      if (k < 0.85) {
        this.icon('clay', cx - 4, cy - 2, 255);
        const hx = 64 + (cx - 64) * Math.min(1, k * 1.4);
        const hy = 16 + (cy - 16) * Math.min(1, k * 1.4);
        this.circle(hx, hy, 7, 200);
        this.line(hx - 11, hy, hx - 4, hy, 200);
        this.line(hx + 4, hy, hx + 11, hy, 200);
        this.line(hx, hy - 9, hx, hy - 4, 200);
        this.line(hx, hy + 4, hx, hy + 9, 200);
      } else {
        const r = (k - 0.85) * 120;
        for (let a = 0; a < 10; a++) {
          const ang = a * 0.63 + 0.3;
          this.rect(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.6, 2, 2, 255);
        }
      }
    } else if (id === 'fiske') {
      for (let x = 0; x < 128; x++) this.px(x, 27 + Math.sin(x * 0.25 + t * 6) * 1.5, 150);
      const fx = 26 + k * 70;
      const fy = 26 - Math.sin(k * Math.PI) * 22;
      this.icon('fish', fx, fy - 4, 255);
      if (k > 0.85) this.sparkle(10, 200);
    } else {
      this.icon('crown', 64 - 11, 4, 255, 2);
      this.burst(t * 0.6, 120);
      this.sparkle(12);
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
    if (this.calm) return;
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

  /** Breaks text into lines that fit the display at scale 1 */
  wrap(str) {
    const out = [];
    let line = '';
    String(str).split(/\s+/).forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && this.measure(next) > W - 4) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) out.push(line);
    return out;
  }

  /**
   * Picks a scale per line — as big as fits the width — then shrinks the
   * biggest until the stack fits the height. Lines too long even at the
   * smallest size are word-wrapped first.
   */
  layout(lines, maxS = 3) {
    const sc = [];
    lines.forEach((l, i) => {
      // A subtitle never outsizes its headline
      let s = i ? Math.min(maxS, sc[0]) : maxS;
      while (s > 1 && this.measure(l, s) > W - 6) s--;
      sc.push(s);
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

  stack(text, { maxS = 3, v = 255, dimRest = false } = {}) {
    const lines = text.flatMap((l) => (this.measure(l) > W - 4 ? this.wrap(l) : [l]));
    const { sc, gap, h } = this.layout(lines, maxS);
    let y = Math.round((H - h) / 2);
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

  modeStart(name, year, task, secs, id = '') {
    const intro = id ? 1.1 : 0;
    this.show((d, t) => {
      if (t < intro) {
        d.modeAnim(id, t / intro);
        return;
      }
      const tt = t - intro;
      if (tt < 1.4) {
        d.text(id === 'finalen' ? 'WIZARD MODE' : `GREN '${String(year).slice(2)}`, 64, 1, { align: 'center', v: 170 });
        d.text(name, 64, 11, { s: d.measure(name, 3) <= 120 ? 3 : 2, align: 'center' });
        if (tt < 0.35 && Math.floor(tt * 14) % 2) d.invert();
        return;
      }
      d.stack([task, `${secs} SEKUNDER`], { maxS: 1 });
      d.border(tt, 140);
    }, 3 + intro, 3);
  }

  modeWin(name, pts, id = '') {
    this.show((d, t) => {
      d.stack([name, 'KLAR!', `+${fmtScore(pts)}`], { maxS: 2 });
      // The gren's own icon hops at either side
      const icon = { gokart: 'kart', fiske: 'fish', pingis: 'paddle', skytte: 'clay' }[id];
      if (icon) {
        const hop = Math.abs(Math.sin(t * 6)) * 6;
        d.icon(icon, 3, 16 - hop, 220);
        d.icon(icon, 125 - ICONS[icon][0].length, 16 - hop, 220);
      }
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
        d.text(letters[i], x0 + i * step, 5, { s: 3, align: 'center', v: on && !blink ? 255 : 55 });
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
      d.icon('lock', 2, 12 - Math.max(0, 0.3 - t) * 20);
      d.icon('lock', 121, 12 - Math.max(0, 0.3 - t) * 20);
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
      d.text(rank === 1 ? 'REKORD!' : `PLATS ${rank}`, 64, 1, { s: 3, align: 'center' });
      d.text(name || 'PÅ TOPPLISTAN', 64, 24, { align: 'center', v: 200 });
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
    // Balls as dots (the one in play lit), leaving the middle for status
    for (let i = 0; i < 3; i++) this.text(i < s.ball ? '●' : '○', 1 + i * 6, y, { v: i === s.ball - 1 ? 230 : 110 });
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
      // One gren's picture per lap of the attract cycle
      (d, tt) => d.modeAnim(['gokart', 'femkamp', 'pingis', 'skytte', 'fiske'][this.attractLap % 5], Math.min(1, tt / 2.4)),
      (d, tt) => d.text(MARQUEE, 128 - tt * MARQUEE_SPEED, 9, { s: 2 }),
      (d, tt) => {
        d.icon('castle', 4, 9 + Math.round(Math.sin(tt * 3)), 255, 2);
        d.text('BORGEN', 42, 3, { s: 2 });
        d.text('STORMA PORTEN', 42, 22, { v: 160 });
        d.sparkle(4, 140);
      }
    ];
    // The marquee page lasts exactly as long as the text takes to cross
    const marquee = (this.measure(MARQUEE, 2) + W) / MARQUEE_SPEED;
    const durs = pages.map((_, i) => (i === pages.length - 2 ? marquee : 3.2));
    const cycle = durs.reduce((a, b) => a + b, 0);
    this.attractLap = Math.floor(t / cycle);
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
