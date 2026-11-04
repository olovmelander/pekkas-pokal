/**
 * Pekkas Måleri — how the paint goes on.
 *
 * The motifs in artworks.js say WHERE each colour goes. This file decides
 * what a colour looks like once it is on a canvas: brushstrokes that follow
 * the form, linen weave showing through thin paint, ridges of impasto that
 * catch the sun, and fresh oil being glossier than the bare ground.
 *
 * Every painting is two images drawn in lockstep:
 *   colour — what you see;
 *   surface — R is paint height, G is roughness. The easel's material uses it
 *             as both bump map and roughness map, so the strokes are lit by
 *             the garden's sun instead of being painted-on shading.
 * The 2D views (the reference, the verdict, the gallery) have no sun, so
 * renderPainting() lights them on the CPU from the same surface image.
 *
 * STROKE DIRECTION. A painter follows the form: strokes run along a band of
 * sky, round a face, up a cypress. That is computed rather than authored —
 * a distance transform of each region's visible pixels gives, near an edge,
 * the direction of that edge; deeper inside a region the strokes relax to
 * the region's principal axis. Van Gogh's spiral arms therefore get spiral
 * strokes and Munch's sky gets long wavy ones without either motif saying
 * a word about brushwork. Everything is seeded: the same region is laid in
 * the same strokes every time, on every canvas size.
 */

import { paintIdMap } from './artworks.js';

/** The player's canvas in texture pixels. The motifs live in 0..1 and are
    scaled to it, so this only sets resolution, never composition. */
export const ART_W = 700;
export const ART_H = 762;

/** Analysis grid. Fine enough to place strokes inside a pearl, coarse
    enough that a work is analysed in a couple of milliseconds. */
const GW = 150;
const GH = Math.round((GW * ART_H) / ART_W);

const STAMP_W = 200;
const STAMP_H = 40;
const VARIANTS = 4;
/** Each stroke is drawn in one of three values of its colour — broken colour
    is most of what separates paint from a flat fill. */
const SHADES = [0.075, 0, -0.085];

/** Surface encoding: R = height, G = roughness (×255). */
const LINEN_ROUGH = 236;
const PAINT_ROUGH = 92;

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Same colour pushed toward white (k > 0) or black (k < 0), as CSS. */
function shadeCss([r, g, b], k) {
  const f = (v) => {
    const x = k > 0 ? v + (1 - v) * k : v * (1 + k);
    return Math.round(clamp(x, 0, 1) * 255);
  };
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/* --------------------------------------------------------------- stamps */

/*
 * One brushstroke, as alpha: a loaded body with a square-ish start, thirty
 * bristle tracks of uneven load running through it, and a dry, broken tail
 * where the outer bristles give out first. Drawn once at startup in four
 * variants; every stroke on every canvas is one of these, tinted. The
 * bristle tracks are what the bump map turns into grooves.
 */
let stampSet = null;
function stamps() {
  if (stampSet) return stampSet;
  const rnd = seeded(4711);
  stampSet = [];
  for (let v = 0; v < VARIANTS; v++) {
    const c = makeCanvas(STAMP_W, STAMP_H);
    const ctx = c.getContext('2d');
    const bend = (rnd() - 0.5) * 5;
    // The body of paint under the bristles
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(10, 4);
    ctx.quadraticCurveTo(STAMP_W * 0.4, 3 + bend * 0.5, STAMP_W * (0.6 + rnd() * 0.1), 5);
    ctx.lineTo(STAMP_W * (0.6 + rnd() * 0.1), STAMP_H - 5);
    ctx.quadraticCurveTo(STAMP_W * 0.4, STAMP_H - 3 + bend * 0.5, 10, STAMP_H - 4);
    ctx.quadraticCurveTo(2, STAMP_H / 2, 10, 4);
    ctx.fill();
    ctx.lineCap = 'round';
    const n = 26 + v * 3;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const y = 3.5 + k * (STAMP_H - 7) + (rnd() - 0.5) * 1.6;
      const x0 = 5 + rnd() * 9 + Math.abs(k - 0.5) * 8;
      // Outer bristles run dry first, which is what makes the tail ragged
      const edge = Math.abs(k - 0.5) * 2;
      const x1 = STAMP_W - 4 - rnd() * (14 + edge * 70);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.quadraticCurveTo((x0 + x1) / 2, y + bend * (0.6 + rnd() * 0.4), x1, y + bend * 0.3 + (rnd() - 0.5) * 1.5);
      ctx.lineWidth = 0.9 + rnd() * 1.6;
      ctx.strokeStyle = `rgba(255,255,255,${(0.3 + rnd() * 0.7).toFixed(3)})`;
      ctx.stroke();
    }
    // Envelope: loaded at the start, thinning to nothing at the tail, with
    // the long edges softened just enough not to alias
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createLinearGradient(0, 0, STAMP_W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.08, 'rgba(0,0,0,1)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.92)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, STAMP_W, STAMP_H);
    const e = ctx.createLinearGradient(0, 0, 0, STAMP_H);
    e.addColorStop(0, 'rgba(0,0,0,0)');
    e.addColorStop(0.14, 'rgba(0,0,0,1)');
    e.addColorStop(0.86, 'rgba(0,0,0,1)');
    e.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = e;
    ctx.fillRect(0, 0, STAMP_W, STAMP_H);
    stampSet.push(c);
  }
  return stampSet;
}

/** Tinted copies of every stamp: [shade][variant]. Reused between regions. */
function tintInto(sets, rgb) {
  const base = stamps();
  SHADES.forEach((sh, t) => {
    const css = shadeCss(rgb, sh);
    for (let v = 0; v < VARIANTS; v++) {
      const c = sets[t][v];
      const ctx = c.getContext('2d');
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, STAMP_W, STAMP_H);
      ctx.drawImage(base[v], 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, STAMP_W, STAMP_H);
    }
  });
  return sets;
}

function newTintSets() {
  return SHADES.map(() => Array.from({ length: VARIANTS }, () => makeCanvas(STAMP_W, STAMP_H)));
}

/** The height stamps: the same bristles, raising R and leaving the paint's
    gloss in G. */
let heightStampSet = null;
function heightStamps() {
  if (!heightStampSet) {
    const sets = newTintSets();
    tintInto(sets, [1, PAINT_ROUGH / 255, 0]);
    heightStampSet = sets[1];
  }
  return heightStampSet;
}

/* ---------------------------------------------------------------- linen */

/** Colour weave — the speckle and thread grid that reads as canvas at a
    glance. Also drawn, faintly, over paint: thin paint never hides it. */
let weaveTile = null;
function weave() {
  if (weaveTile) return weaveTile;
  const N = 96;
  const cv = makeCanvas(N, N);
  const c = cv.getContext('2d');
  const rnd = seeded(1337);
  for (let i = 0; i < 3200; i++) {
    c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(48,38,26,0.10)';
    c.fillRect(rnd() * N, rnd() * N, 1.3, 1.3);
  }
  c.strokeStyle = 'rgba(70,56,38,0.05)';
  c.lineWidth = 1;
  for (let i = 0; i < N; i += 3) {
    c.beginPath();
    c.moveTo(i + 0.5, 0);
    c.lineTo(i + 0.5, N);
    c.moveTo(0, i + 0.5);
    c.lineTo(N, i + 0.5);
    c.stroke();
  }
  weaveTile = cv;
  return cv;
}

/** Height weave: real over-under threads, so raking sun picks out the linen. */
let threadTile = null;
function threads() {
  if (threadTile) return threadTile;
  const N = 64;
  const P = 4;
  const cv = makeCanvas(N, N);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const rnd = seeded(99);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const over = (Math.floor(x / P) + Math.floor(y / P)) % 2;
      const u = ((x % P) + 0.5) / P;
      const v = ((y % P) + 0.5) / P;
      const h = over ? Math.sin(Math.PI * v) : Math.sin(Math.PI * u);
      const o = (y * N + x) * 4;
      img.data[o] = 46 + h * 40 + rnd() * 10;
      img.data[o + 1] = LINEN_ROUGH;
      img.data[o + 2] = 0;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  threadTile = cv;
  return cv;
}

function fillLinen(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#f6f3e9');
  g.addColorStop(1, '#e5dfcf');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function fillLinenHeight(ctx, W, H) {
  const pat = ctx.createPattern(threads(), 'repeat');
  // Scale the threads with the canvas so a thumbnail does not alias to mush
  const k = clamp(W / ART_W, 0.35, 1);
  pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
}

function overlayWeave(ctx, W, H, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = ctx.createPattern(weave(), 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Stretcher shadow round the edge: the canvas is a physical object. */
function edgeShade(ctx, W, H) {
  const e = ctx.createLinearGradient(0, 0, 0, H);
  e.addColorStop(0, 'rgba(60,46,28,0.16)');
  e.addColorStop(0.12, 'rgba(60,46,28,0)');
  e.addColorStop(0.9, 'rgba(60,46,28,0)');
  e.addColorStop(1, 'rgba(60,46,28,0.13)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, W, H);
}

/** The old-varnish falloff that makes a museum photograph look like one. */
function varnish(ctx, W, H) {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.46, W * 0.2, W * 0.5, H * 0.5, W * 0.82);
  g.addColorStop(0, 'rgba(120,86,40,0)');
  g.addColorStop(1, 'rgba(46,30,12,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/* ------------------------------------------------------------- analysis */

const analyses = new Map();

/**
 * Where every stroke of a work goes. Computed once per work from a small
 * id-map — the same id-map the hit-testing uses, so strokes can only ever
 * land where the region is actually visible.
 */
export function analyse(work) {
  if (analyses.has(work.id)) return analyses.get(work.id);
  const cv = makeCanvas(GW, GH);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  paintIdMap(ctx, work, GW, GH);
  const px = ctx.getImageData(0, 0, GW, GH).data;
  const N = GW * GH;
  const ids = new Uint8Array(N);
  for (let i = 0; i < N; i++) ids[i] = px[i * 4];

  // Distance to the nearest pixel of another region (chamfer 1 / √2). The
  // frame edge is not a boundary: the background should not hug the frame.
  const INF = 1e6;
  const d = new Float32Array(N);
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const p = y * GW + x;
      const id = ids[p];
      const edge = (x > 0 && ids[p - 1] !== id) || (x < GW - 1 && ids[p + 1] !== id)
        || (y > 0 && ids[p - GW] !== id) || (y < GH - 1 && ids[p + GW] !== id);
      d[p] = edge ? 0.5 : INF;
    }
  }
  const R2 = Math.SQRT2;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const p = y * GW + x;
      let v = d[p];
      if (x > 0) v = Math.min(v, d[p - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[p - GW] + 1);
        if (x > 0) v = Math.min(v, d[p - GW - 1] + R2);
        if (x < GW - 1) v = Math.min(v, d[p - GW + 1] + R2);
      }
      d[p] = v;
    }
  }
  for (let y = GH - 1; y >= 0; y--) {
    for (let x = GW - 1; x >= 0; x--) {
      const p = y * GW + x;
      let v = d[p];
      if (x < GW - 1) v = Math.min(v, d[p + 1] + 1);
      if (y < GH - 1) {
        v = Math.min(v, d[p + GW] + 1);
        if (x < GW - 1) v = Math.min(v, d[p + GW + 1] + R2);
        if (x > 0) v = Math.min(v, d[p + GW - 1] + R2);
      }
      d[p] = v;
    }
  }

  // Per-region moments: area, centroid, principal axis
  const R = work.regions.length;
  const stats = Array.from({ length: R }, () => ({ n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, pix: [] }));
  for (let p = 0; p < N; p++) {
    const r = ids[p] - 1;
    if (r < 0 || r >= R) continue;
    const s = stats[r];
    const x = p % GW;
    const y = (p / GW) | 0;
    s.n++;
    s.sx += x;
    s.sy += y;
    s.sxx += x * x;
    s.syy += y * y;
    s.sxy += x * y;
    s.pix.push(p);
  }

  const seed0 = hashString(work.id);
  const regions = stats.map((s, ri) => {
    if (!s.n) return { strokes: [], area: 0, axis: 0, cx: 0.5, cy: 0.5 };
    const mx = s.sx / s.n;
    const my = s.sy / s.n;
    const cxx = s.sxx / s.n - mx * mx;
    const cyy = s.syy / s.n - my * my;
    const cxy = s.sxy / s.n - mx * my;
    const axis = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const ax = Math.cos(axis);
    const ay = Math.sin(axis);
    const area = s.n / N;

    const rnd = seeded(seed0 + ri * 7919);
    // Sizes are fractions of the canvas width: big fields get big brushes
    const L = clamp(0.44 * Math.sqrt(area), 0.03, 0.16);
    const Wd = clamp(L * 0.25, 0.008, 0.036);
    const count = clamp(Math.round((area * (GH / GW)) / (L * Wd) * 1.6), 6, 280);
    const strokes = [];
    for (let k = 0; k < count; k++) {
      const p = s.pix[(rnd() * s.pix.length) | 0];
      const x = p % GW;
      const y = (p / GW) | 0;
      // Edge tangent from the distance field's gradient
      const dl = x > 0 && ids[p - 1] === ri + 1 ? d[p - 1] : d[p];
      const dr = x < GW - 1 && ids[p + 1] === ri + 1 ? d[p + 1] : d[p];
      const du = y > 0 && ids[p - GW] === ri + 1 ? d[p - GW] : d[p];
      const dd = y < GH - 1 && ids[p + GW] === ri + 1 ? d[p + GW] : d[p];
      let tx = -(dd - du);
      let ty = dr - dl;
      const tl = Math.hypot(tx, ty);
      let w = smooth(1.5, 8, d[p]);
      if (tl < 0.25) {
        w = 1;
      } else {
        tx /= tl;
        ty /= tl;
      }
      // Align the axis with the tangent before blending, or they cancel
      const sgn = tx * ax + ty * ay < 0 ? -1 : 1;
      const fx = tx * (1 - w) + ax * sgn * w;
      const fy = ty * (1 - w) + ay * sgn * w;
      const a = Math.atan2(fy, fx) + (rnd() - 0.5) * 0.36;
      strokes.push({
        x: (x + rnd()) / GW,
        y: (y + rnd()) / GH,
        a,
        l: L * (0.7 + rnd() * 0.6),
        w: Wd * (0.75 + rnd() * 0.5),
        v: (rnd() * VARIANTS) | 0,
        t: rnd() < 0.3 ? 0 : rnd() < 0.62 ? 1 : 2,
        o: 0.55 + rnd() * 0.4,
        // Sweep order: across the region along its own axis, loosely
        s: (x - mx) * ax + (y - my) * ay + (rnd() - 0.5) * 6
      });
    }
    strokes.sort((p, q) => p.s - q.s);
    return { strokes, area, axis, cx: mx / GW, cy: my / GH };
  });

  const out = { regions };
  analyses.set(work.id, out);
  return out;
}

/* -------------------------------------------------------------- drawing */

/*
 * Laying one region is described by a "job" — which work, which region, at
 * what size, in what colour — and drawn twice: into the colour image and
 * into the surface image. `from`/`to` pick a slice of the region's strokes,
 * so the live canvas can lay them a few at a time.
 */
const job = (work, an, i, W, H, tints, rgb) => ({ work, an, i, W, H, tints, rgb });

/** A region's paint: a thin wash over the whole field, then the strokes. */
function drawRegionColour(ctx, jb, from, to, wash) {
  const { work, i, W, H, tints, rgb } = jb;
  ctx.save();
  ctx.beginPath();
  work.regions[i].path(ctx, W, H);
  ctx.clip();
  if (wash) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = shadeCss(rgb, 0);
    ctx.fillRect(0, 0, W, H);
  }
  drawStrokes(ctx, jb, [from, to], (s) => tints[s.t][s.v], 1);
  ctx.restore();
}

function drawRegionHeight(ctx, jb, from, to, wash) {
  const { work, i, W, H } = jb;
  const hs = heightStamps();
  ctx.save();
  ctx.beginPath();
  work.regions[i].path(ctx, W, H);
  ctx.clip();
  if (wash) {
    // Thin paint: the threads still show through at about a fifth
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = `rgb(112,${PAINT_ROUGH},0)`;
    ctx.fillRect(0, 0, W, H);
  }
  drawStrokes(ctx, jb, [from, to], (s) => hs[s.v], 0.62);
  ctx.restore();
}

function drawStrokes(ctx, jb, [from, to], pick, alphaK) {
  const { W, H } = jb;
  const { strokes } = jb.an.regions[jb.i];
  const end = Math.min(to, strokes.length);
  for (let k = from; k < end; k++) {
    const s = strokes[k];
    const c = Math.cos(s.a);
    const n = Math.sin(s.a);
    const len = s.l * W;
    const wid = s.w * W;
    ctx.setTransform(c, n, -n, c, s.x * W, s.y * H);
    ctx.globalAlpha = s.o * alphaK;
    ctx.drawImage(pick(s), -len / 2, -wid / 2, len, wid);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}

/** Outlines of the drawing (strong where still bare, faint under paint)
    and the work's ink pass. */
function drawInk(ctx, work, [W, H], painted, outlines = true) {
  if (outlines) {
    work.regions.forEach((rg, i) => {
      ctx.beginPath();
      rg.path(ctx, W, H);
      ctx.lineWidth = Math.max(1, W * (painted[i] ? 0.0022 : 0.0038));
      ctx.strokeStyle = painted[i] ? 'rgba(30,24,16,0.16)' : 'rgba(64,52,36,0.55)';
      ctx.stroke();
    });
  }
  if (work.detail) work.detail(ctx, W, H);
}

/**
 * Light a flat painting from its surface image: a low sun from the upper
 * left, the way the garden lights the easel. Diffuse is normalised so a
 * flat patch keeps its exact colour — the lighting only ever adds relief,
 * it never shifts the value the player is being judged on.
 */
function lightPainting(cctx, hctx, W, H, strength = 1) {
  const col = cctx.getImageData(0, 0, W, H);
  const hgt = hctx.getImageData(0, 0, W, H).data;
  const c = col.data;
  const k = 5.2 * (W / ART_W) * strength;
  const lx = -0.48;
  const ly = -0.56;
  const lz = 0.68;
  // Half vector toward a viewer straight in front
  const hl = Math.hypot(lx, ly, lz + 1);
  const hx = lx / hl;
  const hy = ly / hl;
  const hz = (lz + 1) / hl;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const o = (y * W + x) * 4;
      const gx = (hgt[o + 4] - hgt[o - 4]) / 255;
      const gy = (hgt[o + W * 4] - hgt[o - W * 4]) / 255;
      let nx = -gx * k;
      let ny = -gy * k;
      const nl = Math.hypot(nx, ny, 1);
      nx /= nl;
      ny /= nl;
      const nz = 1 / nl;
      const diff = (nx * lx + ny * ly + nz * lz) / lz;
      const gloss = 1 - hgt[o + 1] / 255;
      const sp = Math.max(0, nx * hx + ny * hy + nz * hz);
      const spec = sp ** 40 * gloss * 120;
      const m = 0.8 + 0.2 * diff;
      c[o] = c[o] * m + spec;
      c[o + 1] = c[o + 1] * m + spec;
      c[o + 2] = c[o + 2] * m + spec;
    }
  }
  cctx.putImageData(col, 0, 0);
}

/**
 * A finished painting as a flat image: the reference, the verdict's two
 * pictures, the gallery. `colours` is one [r,g,b] (0..1) or null per region.
 */
export function renderPainting(work, colours, W, H, opts = {}) {
  const { lit = true, museum = false, outlines = !museum } = opts;
  const an = analyse(work);
  const col = makeCanvas(W, H);
  const cctx = col.getContext('2d', { willReadFrequently: true });
  const hgt = makeCanvas(W, H);
  const hctx = hgt.getContext('2d', { willReadFrequently: true });
  W = col.width;
  H = col.height;
  fillLinen(cctx, W, H);
  fillLinenHeight(hctx, W, H);
  const tints = newTintSets();
  work.regions.forEach((rg, i) => {
    const rgb = colours[i];
    if (!rgb) return;
    tintInto(tints, rgb);
    const n = an.regions[i].strokes.length;
    const jb = job(work, an, i, W, H, tints, rgb);
    drawRegionColour(cctx, jb, 0, n, true);
    drawRegionHeight(hctx, jb, 0, n, true);
  });
  drawInk(cctx, work, [W, H], colours.map((c) => !!c), outlines);
  overlayWeave(cctx, W, H, 0.4);
  if (lit) lightPainting(cctx, hctx, W, H);
  if (museum) varnish(cctx, W, H);
  else edgeShade(cctx, W, H);
  return col;
}

/* ---------------------------------------------------------- live canvas */

/**
 * The canvas on the player's easel. Layers:
 *   paint   — linen and laid paint; only changes when a region is painted
 *   ink     — the drawing, redrawn when a region changes from bare to painted
 *   art     — paint + ink + weave, the colour texture
 *   surface — height + roughness, the bump/roughness texture
 *   select  — half-resolution mask of the selected (R) and hovered (G)
 *             region; the material's shader pulses and outlines it, so the
 *             pulsing selection costs a uniform per frame, not a 2 MB upload.
 *
 * Painting a region is animated: the strokes go down a few at a time onto a
 * scratch layer clipped to the region, with every LATER region already
 * painted cut back out of it (regions are drawn back to front, so a region
 * painted out of order must slip underneath its neighbours, not over them).
 */
export class LiveCanvas {
  constructor(W = ART_W, H = ART_H) {
    this.W = W;
    this.H = H;
    this.art = makeCanvas(W, H);
    this.artCtx = this.art.getContext('2d');
    this.paint = makeCanvas(W, H);
    this.paintCtx = this.paint.getContext('2d');
    this.ink = makeCanvas(W, H);
    this.inkCtx = this.ink.getContext('2d');
    this.surface = makeCanvas(W, H);
    this.surfCtx = this.surface.getContext('2d');
    // Animation scratch: the layer before the stroke started, and the stroke
    this.snapPaint = makeCanvas(W, H);
    this.snapSurf = makeCanvas(W, H);
    this.tmpPaint = makeCanvas(W, H);
    this.tmpSurf = makeCanvas(W, H);
    this.select = makeCanvas(W / 2, H / 2);
    this.selCtx = this.select.getContext('2d');
    this.selScratch = makeCanvas(W / 2, H / 2);
    this.tints = newTintSets();
    this.anim = null;
    this.work = null;
    this.painted = [];
  }

  /** A fresh canvas for a work, with whatever is already in `painted`. */
  load(work, painted) {
    this.work = work;
    this.painted = painted;
    this.an = analyse(work);
    this.anim = null;
    const { W, H } = this;
    fillLinen(this.paintCtx, W, H);
    fillLinenHeight(this.surfCtx, W, H);
    painted.forEach((rgb, i) => {
      if (!rgb) return;
      tintInto(this.tints, rgb);
      const n = this.an.regions[i].strokes.length;
      const jb = job(work, this.an, i, W, H, this.tints, rgb);
      drawRegionColour(this.paintCtx, jb, 0, n, true);
      drawRegionHeight(this.surfCtx, jb, 0, n, true);
    });
    this.redrawInk();
    this.composite();
    this.setSelection(-1, -1);
  }

  redrawInk() {
    this.inkCtx.clearRect(0, 0, this.W, this.H);
    drawInk(this.inkCtx, this.work, [this.W, this.H], this.painted);
  }

  composite() {
    const { artCtx: c, W, H } = this;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.drawImage(this.paint, 0, 0);
    c.drawImage(this.ink, 0, 0);
    overlayWeave(c, W, H, 0.4);
    edgeShade(c, W, H);
  }

  /** Cut every later, already-painted region out of a scratch layer. */
  cutLater(ctx, i) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    for (let j = i + 1; j < this.painted.length; j++) {
      if (!this.painted[j] || (this.anim && j === this.anim.i)) continue;
      ctx.beginPath();
      this.work.regions[j].path(ctx, this.W, this.H);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Start laying region i in colour rgb. Call step() each frame. */
  begin(i, rgb, duration = 0.62) {
    if (this.anim) this.finish();
    const { W, H } = this;
    tintInto(this.tints, rgb);
    this.snapPaint.getContext('2d').drawImage(this.paint, 0, 0);
    this.snapSurf.getContext('2d').drawImage(this.surface, 0, 0);
    const tp = this.tmpPaint.getContext('2d');
    const ts = this.tmpSurf.getContext('2d');
    tp.clearRect(0, 0, W, H);
    ts.clearRect(0, 0, W, H);
    this.anim = { i, rgb, k: 0, t: 0, duration, n: this.an.regions[i].strokes.length, washed: false };
  }

  /**
   * Advance the stroke animation. Returns null when idle, otherwise where
   * the brush is (0..1 canvas coordinates) and whether it just finished.
   */
  step(dt) {
    const a = this.anim;
    if (!a) return null;
    const { W, H, work, an } = this;
    a.t += dt;
    const p = Math.min(1, a.t / a.duration);
    // Ease in: the first touch is quick, the last strokes are the slow ones
    const target = Math.ceil(a.n * (1 - (1 - p) ** 1.6));
    const tp = this.tmpPaint.getContext('2d');
    const ts = this.tmpSurf.getContext('2d');
    const jb = job(work, an, a.i, W, H, this.tints, a.rgb);
    if (!a.washed) {
      drawRegionColour(tp, jb, 0, 0, true);
      drawRegionHeight(ts, jb, 0, 0, true);
      a.washed = true;
    }
    if (target > a.k) {
      drawRegionColour(tp, jb, a.k, target, false);
      drawRegionHeight(ts, jb, a.k, target, false);
    }
    const last = an.regions[a.i].strokes[Math.max(0, Math.min(a.n - 1, target - 1))];
    a.k = target;
    this.cutLater(tp, a.i);
    this.cutLater(ts, a.i);
    this.paintCtx.drawImage(this.snapPaint, 0, 0);
    this.paintCtx.drawImage(this.tmpPaint, 0, 0);
    this.surfCtx.drawImage(this.snapSurf, 0, 0);
    this.surfCtx.drawImage(this.tmpSurf, 0, 0);
    const done = p >= 1;
    if (done) {
      this.anim = null;
      this.redrawInk();
    }
    this.composite();
    return { x: last ? last.x : 0.5, y: last ? last.y : 0.5, done, progress: p };
  }

  /** Jump an animation in progress to its end. */
  finish() {
    while (this.anim) this.step(1);
  }

  /** Selected region in R, hovered in G — visible pixels only. */
  setSelection(sel, hover) {
    const ctx = this.selCtx;
    const w = this.select.width;
    const h = this.select.height;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!this.work) return;
    const s = this.selScratch.getContext('2d');
    [[sel, '#ff0000'], [hover !== sel ? hover : -1, '#00ff00']].forEach(([i, css]) => {
      if (i < 0 || i >= this.work.regions.length) return;
      s.globalCompositeOperation = 'source-over';
      s.clearRect(0, 0, w, h);
      s.fillStyle = '#fff';
      s.beginPath();
      this.work.regions[i].path(s, w, h);
      s.fill();
      // Later regions sit on top of this one: only what shows can glow
      s.globalCompositeOperation = 'destination-out';
      for (let j = i + 1; j < this.work.regions.length; j++) {
        s.beginPath();
        this.work.regions[j].path(s, w, h);
        s.fill();
      }
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = css;
      s.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.selScratch, 0, 0);
    });
    ctx.globalCompositeOperation = 'source-over';
  }
}
