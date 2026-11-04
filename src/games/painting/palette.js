/**
 * Pekkas Måleri — the palette in your hand.
 *
 * Mixing is the verb of the game, so it gets an object you can feel rather
 * than five buttons and a swatch: a wooden palette with the five pigments
 * squeezed out round the rim, a pool of mixed paint in the middle that
 * grows with every drop, and a dab of every colour you have laid on the
 * canvas left at the edge, the way a real palette fills up during a sitting.
 *
 * A drop does not just recolour the pool. It flies from its pigment, lands,
 * and is stirred in: for a moment the new pigment marbles through the old
 * mix in spiral streaks before the two become one colour. That half second
 * is what makes "yellow into blue makes green" something you watch happen.
 *
 * It is a 2D canvas in the HUD, not a mesh in the scene: it has to be big
 * enough to hit with a thumb on a phone and crisp at any pixel ratio, and
 * a palette held at the bottom of a 3D frame is neither.
 */

import { mixPigments, rgbToCss } from './artworks.js';

/** The pigments, in the order they sit round the rim. */
export const PIGMENTS = [
  { key: 'r', name: 'Krapplack', css: '#c0242c', rgb: [0.753, 0.141, 0.173] },
  { key: 'y', name: 'Kadmiumgul', css: '#e8b419', rgb: [0.91, 0.706, 0.098] },
  { key: 'b', name: 'Ultramarin', css: '#22459b', rgb: [0.133, 0.271, 0.608] },
  { key: 'w', name: 'Titanvit', css: '#f4f2ea', rgb: [0.957, 0.949, 0.918] },
  { key: 'k', name: 'Benswart', css: '#1b1815', rgb: [0.106, 0.094, 0.082] }
];

const MAX_DABS = 9;
const easeOut = (t) => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** An organic closed blob: a circle with three low harmonics on its radius. */
function blobPath(ctx, x, y, r, phase, wobble = 0.09, squash = 1) {
  const N = 28;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const h = Math.sin(a * 2 + phase) * 0.6 + Math.sin(a * 3 + phase * 1.7) * 0.4 + Math.sin(a * 5 + phase * 0.6) * 0.25;
    const k = 1 + wobble * h;
    const px = x + Math.cos(a) * r * k;
    const py = y + Math.sin(a) * r * k * squash;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/** Wet paint: body, a darker rim where it is thick, a sharp highlight. */
function wetBlob(ctx, x, y, r, css, phase, opts = {}) {
  const { squash = 0.82, shadow = true, gloss = 1 } = opts;
  if (shadow) {
    // A soft contact shadow; a gradient, because ctx.filter blur is slow
    // on phones and missing on older Safari
    const sx = x + r * 0.1;
    const sy = y + r * 0.2;
    const sg = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 1.25);
    sg.addColorStop(0, 'rgba(52,30,10,0.34)');
    sg.addColorStop(1, 'rgba(52,30,10,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * 1.25, r * 1.25 * squash, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  blobPath(ctx, x, y, r, phase, 0.09, squash);
  ctx.fillStyle = css;
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.08);
  g.addColorStop(0, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = g;
  ctx.fill();
  if (gloss > 0) {
    ctx.beginPath();
    ctx.ellipse(x - r * 0.34, y - r * 0.36 * squash, r * 0.28, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.55 * gloss})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + r * 0.32, y + r * 0.3 * squash, r * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.3 * gloss})`;
    ctx.fill();
  }
}

export class Palette {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.board = document.createElement('canvas');
    this.reduced = reducedMotion;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.drops = { r: 0, y: 0, b: 0, w: 0, k: 0 };
    this.colour = mixPigments(this.drops);
    this.shown = this.colour.slice();
    this.poolR = 0;
    this.poolTarget = 0;
    this.dabs = [];
    this.flights = [];
    this.swirls = [];
    this.ripples = [];
    this.press = {};
    this.hoverKey = null;
    this.tipKey = null;
    this.smear = null;
    this.t = 0;
    this.dirty = true;
  }

  /** Lay out for a CSS size. Rebuilds the cached board. */
  resize(cssW, cssH, dpr) {
    const w = Math.max(80, Math.round(cssW));
    const h = Math.max(60, Math.round(cssH));
    this.dpr = Math.min(2, dpr || 1);
    if (w === this.w && h === this.h && this.cv.width === Math.round(w * this.dpr)) return;
    this.w = w;
    this.h = h;
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.board.width = this.cv.width;
    this.board.height = this.cv.height;
    // The board is an ellipse; everything sits on rings inside it
    this.cx = w * 0.5;
    this.cy = h * 0.53;
    this.rx = w * 0.47;
    this.ry = h * 0.44;
    const unit = Math.min(w / 5.6, h * 0.42);
    this.blobR = Math.max(13, Math.min(26, unit * 0.4));
    this.wells = PIGMENTS.map((p, i) => {
      const a = -Math.PI * (0.86 - (i / (PIGMENTS.length - 1)) * 0.72);
      const x = this.cx + Math.cos(a) * this.rx * 0.8;
      const y = this.cy + Math.sin(a) * this.ry * 0.62;
      return { ...p, x, y, phase: i * 1.9 + 0.4 };
    });
    this.poolX = this.cx + this.rx * 0.04;
    this.poolY = this.cy + this.ry * 0.16;
    this.poolMax = Math.min(this.ry * 0.5, this.rx * 0.3);
    this.paintBoard();
    this.poolTarget = this.poolRadius();
    this.poolR = this.poolTarget;
    this.dirty = true;
  }

  paintBoard() {
    const ctx = this.board.getContext('2d');
    const { w, h, cx, cy, rx, ry } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const outline = () => {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    };
    // Drop shadow on whatever is under it
    ctx.save();
    outline();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#a77a43';
    ctx.fill();
    ctx.restore();

    ctx.save();
    outline();
    ctx.clip();
    const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    g.addColorStop(0, '#d2a86c');
    g.addColorStop(0.55, '#bb8d52');
    g.addColorStop(1, '#9c703c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Grain: long, gently bowed lines along the board, a knot or two
    const rnd = seeded(31);
    for (let i = 0; i < 70; i++) {
      const y0 = cy - ry + rnd() * ry * 2;
      const bow = (rnd() - 0.5) * ry * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx - rx, y0);
      ctx.bezierCurveTo(cx - rx * 0.3, y0 + bow, cx + rx * 0.3, y0 - bow, cx + rx, y0 + bow * 0.4);
      ctx.lineWidth = 0.5 + rnd() * 1.3;
      ctx.strokeStyle = rnd() < 0.7 ? `rgba(110,70,30,${0.08 + rnd() * 0.12})` : `rgba(255,230,180,${0.06 + rnd() * 0.08})`;
      ctx.stroke();
    }
    [[0.72, 0.3, 0.06], [0.2, 0.62, 0.04]].forEach(([kx, ky, kr]) => {
      for (let j = 0; j < 4; j++) {
        ctx.beginPath();
        const kw = kr * w * (1 + j * 0.5);
        ctx.ellipse(cx - rx + kx * rx * 2, cy - ry + ky * ry * 2, kw, kw * 0.45 * (1 + j * 0.1), 0.1, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100,62,26,${0.22 - j * 0.04})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
    // Old dried paint from sittings before this one — every real palette has it
    const stains = ['#7b3a2a', '#3d5a7a', '#c9a34a', '#56603a', '#efe6d0', '#8a5a7a'];
    for (let i = 0; i < 9; i++) {
      const sx = cx + (rnd() - 0.5) * rx * 1.6;
      const sy = cy + (rnd() - 0.5) * ry * 1.5;
      blobPath(ctx, sx, sy, 3 + rnd() * 7, rnd() * 6, 0.25, 0.7);
      ctx.globalAlpha = 0.16 + rnd() * 0.14;
      ctx.fillStyle = stains[i % stains.length];
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Varnish sheen across the top
    const v = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.7, 4, cx - rx * 0.2, cy - ry * 0.4, rx * 0.9);
    v.addColorStop(0, 'rgba(255,246,222,0.32)');
    v.addColorStop(1, 'rgba(255,246,222,0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Bevelled edge
    outline();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(70,42,16,0.7)';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy - 1, rx - 3, ry - 3, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,236,196,0.4)';
    ctx.stroke();

    // Thumb hole, at the left end where the thumb actually goes
    const tx = cx - rx * 0.84;
    const ty = cy + ry * 0.32;
    const tr = Math.min(rx * 0.055, ry * 0.15);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(tx, ty, tr * 1.25, tr, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // ...with the painter's thumb through it, so it reads as a thumb hole
    // and not as a sixth, black pigment
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(tx, ty, tr * 1.25, tr, -0.2, 0, Math.PI * 2);
    ctx.clip();
    const sk = ctx.createRadialGradient(tx - tr * 0.4, ty - tr * 0.4, tr * 0.1, tx, ty, tr * 1.4);
    sk.addColorStop(0, '#f2c39a');
    sk.addColorStop(1, '#b97a52');
    ctx.fillStyle = sk;
    ctx.fillRect(tx - tr * 2, ty - tr * 2, tr * 4, tr * 4);
    ctx.beginPath();
    ctx.ellipse(tx + tr * 0.25, ty - tr * 0.15, tr * 0.5, tr * 0.38, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,236,224,0.75)';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(tx, ty, tr * 1.25, tr, -0.2, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(70,42,16,0.75)';
    ctx.stroke();
  }

  poolRadius() {
    const total = this.total();
    if (!total) return 0;
    return this.poolMax * (0.42 + 0.58 * Math.min(1, Math.sqrt(total / 16)));
  }

  total() {
    const d = this.drops;
    return d.r + d.y + d.b + d.w + d.k;
  }

  /** A drop of `key` has gone into the mix (drops already updated). */
  addDrop(key, drops) {
    const well = this.wells.find((wl) => wl.key === key);
    const before = this.colour.slice();
    const was = this.total();
    this.drops = { ...drops };
    this.colour = mixPigments(this.drops);
    this.press[key] = 1;
    if (this.reduced || !well) {
      this.shown = this.colour.slice();
      this.poolTarget = this.poolRadius();
      this.dirty = true;
      return;
    }
    this.flights.push({ well, t: 0, from: before, wasEmpty: was === 0 });
    this.dirty = true;
  }

  /** Drops changed without a pour (undo, loading a dab). */
  setDrops(drops) {
    this.drops = { ...drops };
    this.colour = mixPigments(this.drops);
    this.poolTarget = this.poolRadius();
    this.swirls.push({ t: 0, pig: null, from: this.shown.slice(), dur: 0.35 });
    this.dirty = true;
  }

  /** The palette knife: scrape the pool off. */
  wipe() {
    if (this.total() > 0 && !this.reduced) {
      this.smear = { t: 0, colour: this.shown.slice(), r: this.poolR };
    }
    this.drops = { r: 0, y: 0, b: 0, w: 0, k: 0 };
    this.colour = mixPigments(this.drops);
    this.flights = [];
    this.swirls = [];
    this.poolTarget = 0;
    if (this.reduced) this.poolR = 0;
    this.dirty = true;
  }

  /** Leave a dab of the colour just laid on the canvas at the rim. */
  addDab(rgb, drops) {
    const i = this.dabs.length % MAX_DABS;
    const a = Math.PI * (0.13 + (i / (MAX_DABS - 1)) * 0.74);
    const dab = {
      rgb: rgb.slice(), drops: { ...drops }, t: 0,
      x: this.cx + Math.cos(a) * this.rx * 0.84,
      y: this.cy + Math.sin(a) * this.ry * 0.7,
      phase: i * 2.3
    };
    if (this.dabs.length >= MAX_DABS) this.dabs[i] = dab;
    else this.dabs.push(dab);
    this.dirty = true;
  }

  clearDabs() {
    this.dabs = [];
    this.dirty = true;
  }

  setTip(key) {
    if (key !== this.tipKey) {
      this.tipKey = key;
      this.dirty = true;
    }
  }

  setHover(x, y) {
    const hit = x == null ? null : this.hit(x, y);
    const key = hit && hit.type === 'pigment' ? hit.key : hit && hit.type === 'dab' ? `dab${hit.index}` : null;
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.dirty = true;
    }
    return hit;
  }

  /** What is under a point (CSS px in the canvas). */
  hit(x, y) {
    let best = null;
    let bestD = Infinity;
    const reach = this.blobR * 1.75;
    this.wells.forEach((wl) => {
      const d = Math.hypot(x - wl.x, y - wl.y);
      if (d < reach && d < bestD) {
        best = { type: 'pigment', key: wl.key };
        bestD = d;
      }
    });
    if (best) return best;
    this.dabs.forEach((db, i) => {
      const d = Math.hypot(x - db.x, y - db.y);
      if (d < this.blobR * 1.1 && d < bestD) {
        best = { type: 'dab', index: i, drops: db.drops };
        bestD = d;
      }
    });
    return best;
  }

  /** Where a well sits, for anchoring HUD effects. */
  wellPos(key) {
    const wl = this.wells.find((p) => p.key === key);
    return wl ? { x: wl.x, y: wl.y } : null;
  }

  update(dt) {
    this.t += dt;
    let busy = false;
    const FLY = 0.24;
    this.flights = this.flights.filter((f) => {
      f.t += dt;
      busy = true;
      if (f.t >= FLY) {
        this.swirls.push({ t: 0, pig: f.well.rgb, from: f.wasEmpty ? f.well.rgb : f.from, dur: 0.75 });
        this.ripples.push({ t: 0 });
        this.poolTarget = this.poolRadius();
        return false;
      }
      return true;
    });
    this.swirls = this.swirls.filter((s) => {
      s.t += dt;
      busy = true;
      return s.t < s.dur;
    });
    this.ripples = this.ripples.filter((r) => {
      r.t += dt;
      busy = true;
      return r.t < 0.5;
    });
    Object.keys(this.press).forEach((k) => {
      this.press[k] = Math.max(0, this.press[k] - dt * 5);
      if (this.press[k] > 0) busy = true;
      else delete this.press[k];
    });
    this.dabs.forEach((d) => {
      if (d.t < 1) {
        d.t = Math.min(1, d.t + dt * 3.5);
        busy = true;
      }
    });
    if (this.smear) {
      this.smear.t += dt / 0.38;
      busy = true;
      if (this.smear.t >= 1) this.smear = null;
    }
    if (Math.abs(this.poolR - this.poolTarget) > 0.2) {
      this.poolR = lerp(this.poolR, this.poolTarget, 1 - Math.exp(-dt * 12));
      busy = true;
    } else {
      this.poolR = this.poolTarget;
    }
    // The shown colour settles on the mix once nothing is being stirred
    const last = this.swirls[this.swirls.length - 1];
    if (last) {
      this.shown = mixRgb(last.from, this.colour, easeOut(Math.min(1, last.t / last.dur)));
    } else if (!this.flights.length) {
      this.shown = this.colour.slice();
    }
    if (this.tipKey) busy = true;
    if (busy || this.dirty) {
      this.draw();
      this.dirty = false;
    }
  }

  draw() {
    const { ctx, h } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.drawImage(this.board, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.drawDabs();
    this.drawPool();
    this.drawWells();

    // Dollops in flight: a short arc from the well into the pool
    this.flights.forEach((f) => {
      const k = Math.min(1, f.t / 0.24);
      const x = lerp(f.well.x, this.poolX, k);
      const y = lerp(f.well.y, this.poolY, k) - Math.sin(k * Math.PI) * h * 0.16;
      wetBlob(ctx, x, y, this.blobR * (0.42 - k * 0.1), f.well.css, f.t * 9, { squash: 0.9, shadow: false });
    });
    this.ripples.forEach((r) => {
      const k = r.t / 0.5;
      ctx.beginPath();
      const rr = (this.poolR + 4) * (1 + k * 0.5);
      ctx.ellipse(this.poolX, this.poolY, rr, rr * 0.78, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,248,230,${0.5 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  drawWells() {
    const { ctx } = this;
    this.wells.forEach((wl) => {
      const p = this.press[wl.key] || 0;
      const hover = this.hoverKey === wl.key;
      const r = this.blobR * (1 + (hover ? 0.06 : 0) - p * 0.1);
      if (this.tipKey === wl.key) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
        ctx.beginPath();
        ctx.ellipse(wl.x, wl.y, r * 1.45, r * 1.25, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,226,140,${0.45 + pulse * 0.45})`;
        ctx.lineWidth = 2 + pulse * 1.5;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -this.t * 18;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // A squeezed-out coil: two overlapping lobes, the tube's twist on top
      wetBlob(ctx, wl.x - r * 0.28, wl.y + r * 0.08, r * 0.8, wl.css, wl.phase + 1, { squash: 0.8 - p * 0.15 });
      const top = { squash: 0.82 - p * 0.15, shadow: false };
      wetBlob(ctx, wl.x + r * 0.12, wl.y - r * 0.06, r * 0.86, wl.css, wl.phase, top);
      const n = this.drops[wl.key];
      if (n > 0) {
        const bx = wl.x + r * 0.95;
        const by = wl.y - r * 0.7;
        ctx.beginPath();
        ctx.arc(bx, by, 8.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(24,18,10,0.82)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(242,193,78,0.85)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#ffd98a';
        ctx.font = '700 10px "Schibsted Grotesk", Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), bx, by + 0.5);
      }
    });
  }

  drawPool() {
    const { ctx } = this;
    const R = this.poolR;
    if (this.smear) {
      // The knife drags the pool sideways into a thinning streak
      const k = easeOut(this.smear.t);
      const { r } = this.smear;
      ctx.save();
      ctx.globalAlpha = 1 - this.smear.t;
      ctx.beginPath();
      ctx.ellipse(this.poolX + k * r * 1.6, this.poolY, r * (1 + k * 1.4), r * 0.7 * (1 - k * 0.6), 0, 0, Math.PI * 2);
      ctx.fillStyle = rgbToCss(this.smear.colour);
      ctx.fill();
      ctx.restore();
    }
    if (R < 1) return;
    const css = rgbToCss(this.shown);
    wetBlob(this.ctx, this.poolX, this.poolY, R, css, 2.2, { squash: 0.76, gloss: 0 });

    // Stirring: spiral streaks of the incoming pigment and of the old mix,
    // turning and thinning as they dissolve into the new colour
    const s = this.swirls[this.swirls.length - 1];
    if (s && s.pig) {
      const k = Math.min(1, s.t / s.dur);
      ctx.save();
      blobPath(ctx, this.poolX, this.poolY, R, 2.2, 0.09, 0.76);
      ctx.clip();
      ctx.lineCap = 'round';
      [[s.pig, 0], [s.from, Math.PI], [s.pig, Math.PI * 0.5]].forEach(([rgb, off], j) => {
        ctx.beginPath();
        const turn = k * 5 + off;
        for (let i = 0; i <= 40; i++) {
          const u = i / 40;
          const a = turn + u * Math.PI * 2.6;
          const rr = R * (0.08 + u * 0.86);
          const x = this.poolX + Math.cos(a) * rr;
          const y = this.poolY + Math.sin(a) * rr * 0.76;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.lineWidth = R * (0.22 - j * 0.05) * (1 - k);
        ctx.strokeStyle = rgbToCss(rgb);
        ctx.globalAlpha = (1 - k) * (j === 1 ? 0.55 : 0.85);
        ctx.stroke();
      });
      ctx.restore();
    }
    // Gloss on top of everything in the pool
    ctx.beginPath();
    ctx.ellipse(this.poolX - R * 0.36, this.poolY - R * 0.36, R * 0.32, R * 0.12, -0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fill();
  }

  drawDabs() {
    this.dabs.forEach((d, i) => {
      const r = this.blobR * 0.5 * easeOut(d.t) * (this.hoverKey === `dab${i}` ? 1.15 : 1);
      if (r < 0.5) return;
      wetBlob(this.ctx, d.x, d.y, r, rgbToCss(d.rgb), d.phase, { squash: 0.78, gloss: 0.7 });
    });
  }
}
