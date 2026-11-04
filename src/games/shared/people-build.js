/**
 * Pekkas Pokal — people: the mesh builder and the body (torso, limbs,
 * hands, shoes, clothing).
 *
 * Everything is generated in the ZERO pose (arms hanging straight down) in
 * a 1.80 m model and scaled afterwards. Body parts are closed surfaces
 * built from rings ("tubes"); parts that meet at a ball joint overlap — the
 * top of each arm is a sphere centred on the shoulder joint, so it turns in
 * place inside the torso's shoulder, and the same for the hips. Inside a
 * part, skin weights blend smoothly across the joint (elbows, knees,
 * wrists, neck), so nothing gaps or seams when it bends.
 *
 * Clothes are not separate shells: a garment is a stretch of rings that is
 * a few millimetres proud of the body and painted in its colour, with a
 * folded lip at every hem. Colour edges are crisp because each boundary is
 * a pair of coincident rings — one in each colour — never a gradient across
 * a strip of triangles. That also means nothing is ever near-coplanar.
 */
import * as THREE from 'three';
import { BONE_INDEX } from './people-rig.js';
import { DIGITS, THUMB, PALM, FINGER_NAMES } from './people-hands.js';

export const REGION = { SKIN: 0, HAIR: 1, TOP: 2, BOTTOM: 3, ACCENT: 4, FIXED: 5 };
export const MAT = { SKIN: 0, CLOTH: 1, GLOSS: 2, LAME: 3 };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function sstep(a, b, x) {
  // Equal edges are a hard step, not 0/0: a NaN here becomes a NaN vertex
  if (a === b) return x < a ? 0 : 1;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export const lerp = (a, b, k) => a + (b - a) * k;
export const gauss = (x, w) => Math.exp(-(x * x) / (w * w));

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap smooth 3D value noise in [-1, 1] (hash lattice + smooth blend). */
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1;
    const dy = (c >> 1) & 1;
    const dz = (c >> 2) & 1;
    const k = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    r += k * hash3(xi + dx, yi + dy, zi + dz);
  }
  return r * 2 - 1;
}

/** Monotone cubic interpolation through keys [[x, ...values], ...]. */
export function profile(keys) {
  const n = keys.length;
  const dims = keys[0].length - 1;
  const xs = keys.map((k) => k[0]);
  const tang = [];
  for (let d = 0; d < dims; d++) {
    const ys = keys.map((k) => k[d + 1]);
    const del = [];
    for (let i = 0; i < n - 1; i++) del.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    const m = [del[0]];
    for (let i = 1; i < n - 1; i++) m.push(del[i - 1] * del[i] <= 0 ? 0 : (del[i - 1] + del[i]) / 2);
    m.push(del[n - 2]);
    for (let i = 0; i < n - 1; i++) {
      if (del[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
      } else {
        const a = m[i] / del[i];
        const b = m[i + 1] / del[i];
        const s = a * a + b * b;
        if (s > 9) {
          const t = 3 / Math.sqrt(s);
          m[i] = t * a * del[i];
          m[i + 1] = t * b * del[i];
        }
      }
    }
    tang.push(m);
  }
  const out = new Array(dims);
  return (x) => {
    let i = 0;
    if (x <= xs[0]) i = 0;
    else if (x >= xs[n - 1]) i = n - 2;
    else while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = clamp((x - xs[i]) / h, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    for (let d = 0; d < dims; d++) {
      const y0 = keys[i][d + 1];
      const y1 = keys[i + 1][d + 1];
      out[d] = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * tang[d][i] +
        (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * tang[d][i + 1];
    }
    return out;
  };
}

/* ------------------------------------------------------------ builder */

// Enough weight slots for every bone (the hands alone have 32)
const NB = Math.max(96, Object.keys(BONE_INDEX).length);

/**
 * Accumulates vertices (position, normal, colour, region, accessory id,
 * skin weights) and triangles per material.
 */
export class Builder {
  constructor(palette) {
    this.pal = palette;
    this.P = [];
    this.N = [];
    this.C = [];
    this.R = [];
    this.A = [];
    this.SI = [];
    this.SW = [];
    this.H = [];
    this.tris = [[], [], [], []];
    this.n = 0;
    this.acc = -1;
    this._w = new Float32Array(NB);
  }

  color(region, tint) {
    const t = tint || [1, 1, 1];
    if (region === REGION.FIXED) return [t[0], t[1], t[2]];
    const c = this.pal[region];
    return [c.r * t[0], c.g * t[1], c.b * t[2]];
  }

  /** weights: [[boneName, w], ...] — normalised, the four largest kept. */
  vertex(p, n, region, tint, weights) {
    const W = this._w;
    W.fill(0);
    let headW = 0;
    for (const [name, w] of weights) {
      if (w <= 0) continue;
      const bi = BONE_INDEX[name];
      W[bi] += w;
      if (name === 'head' || name === 'jaw' || name.startsWith('mouth') || name.startsWith('brow') ||
        name === 'lipUpper' || name.startsWith('eye') || name.startsWith('lid')) headW += w;
    }
    const top = [];
    for (let i = 0; i < NB; i++) {
      if (W[i] <= 1e-4) continue;
      top.push(i);
    }
    top.sort((a, b) => W[b] - W[a]);
    top.length = Math.min(4, top.length);
    let sum = 0;
    for (const i of top) sum += W[i];
    if (sum <= 0) {
      top.length = 0;
      top.push(0);
      W[0] = 1;
      sum = 1;
    }
    for (let k = 0; k < 4; k++) {
      this.SI.push(k < top.length ? top[k] : 0);
      this.SW.push(k < top.length ? W[top[k]] / sum : 0);
    }
    let total = 0;
    for (const [, w] of weights) total += Math.max(0, w);
    this.H.push(total > 0 ? headW / total : 0);
    this.P.push(p[0], p[1], p[2]);
    this.N.push(n[0], n[1], n[2]);
    const c = this.color(region, tint);
    this.C.push(c[0], c[1], c[2]);
    this.R.push(region);
    this.A.push(this.acc);
    return this.n++;
  }

  tri(mat, a, b, c) {
    this.tris[mat].push(a, b, c);
  }

  triangleCount() {
    return this.tris.reduce((s, t) => s + t.length / 3, 0);
  }
}

/**
 * Emit a ring grid. `pts` is a rows×cols array of {p, region, tint, mat};
 * columns wrap when `wrap`. Normals come from `normalFn(p)` when given,
 * otherwise from the triangles. `center` is a point inside the part, used
 * to make every triangle face outward. `poles` lists rows whose points all
 * coincide. `skip(i, j)` drops a quad.
 */
export function emitGrid(b, { pts, rows, cols, wrap = true, normalFn, center, poles = [], weight, skip, flip }) {
  const cw = wrap ? cols : cols - 1;
  const idx = (i, j) => i * cols + (j % cols);
  const nrm = new Float32Array(rows * cols * 3);
  const quads = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cw; j++) {
      if (skip && skip(i, j)) continue;
      quads.push([idx(i, j), idx(i, j + 1), idx(i + 1, j), idx(i + 1, j + 1)]);
    }
  }
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const addFace = (a, bb, c) => {
    A.fromArray(pts[a].p);
    B.fromArray(pts[bb].p);
    C.fromArray(pts[c].p);
    e1.subVectors(C, A);
    e2.subVectors(B, A);
    e1.cross(e2);
    for (const v of [a, bb, c]) {
      nrm[v * 3] += e1.x;
      nrm[v * 3 + 1] += e1.y;
      nrm[v * 3 + 2] += e1.z;
    }
    return e1;
  };
  // Orientation: compare face normals with the supplied normals when there
  // are any, otherwise with the direction away from `center`.
  let orient = 0;
  const ref = new THREE.Vector3();
  const tmp = [0, 0, 0];
  for (const [a, bb, c, d] of quads) {
    const f1 = addFace(a, bb, c);
    if (normalFn) {
      ref.fromArray(normalFn(pts[a].p, pts[a], tmp));
    } else {
      ref.fromArray(pts[a].p).add(B.fromArray(pts[c].p)).add(C.fromArray(pts[bb].p)).multiplyScalar(1 / 3).sub(center);
    }
    orient += Math.sign(f1.dot(ref)) * (normalFn ? 1 : f1.length());
    addFace(bb, d, c);
  }
  let inward = orient < 0;
  if (flip) inward = !inward;
  for (const r of poles) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let j = 0; j < cols; j++) {
      x += nrm[idx(r, j) * 3];
      y += nrm[idx(r, j) * 3 + 1];
      z += nrm[idx(r, j) * 3 + 2];
    }
    for (let j = 0; j < cols; j++) {
      nrm[idx(r, j) * 3] = x;
      nrm[idx(r, j) * 3 + 1] = y;
      nrm[idx(r, j) * 3 + 2] = z;
    }
  }
  const base = [];
  const n = new THREE.Vector3();
  for (let k = 0; k < rows * cols; k++) {
    const q = pts[k];
    if (normalFn) {
      n.fromArray(normalFn(q.p, q, tmp));
    } else {
      n.set(nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2]);
      if (inward) n.negate();
    }
    if (n.lengthSq() < 1e-20) n.set(0, 1, 0);
    n.normalize();
    base.push(b.vertex(q.p, [n.x, n.y, n.z], q.region, q.tint, q.w || weight(q.p, q)));
  }
  for (const [a, bb, c, d] of quads) {
    const m = pts[a].mat;
    const va = base[a];
    const vb = base[bb];
    const vc = base[c];
    const vd = base[d];
    if (inward) {
      b.tri(m, va, vb, vc);
      b.tri(m, vb, vd, vc);
    } else {
      b.tri(m, va, vc, vb);
      b.tri(m, vb, vc, vd);
    }
  }
  return base;
}

/* ------------------------------------------------------------ rings */

/**
 * Rings for a tube made of bands (garments and skin) along its axis.
 * `samples` are the axis positions to use inside bands; `bands` are
 * contiguous [{ from, to, region, mat, off, tint, lip }]. At every band
 * boundary the colours meet on two coincident rings (crisp edge). When one
 * side sits on top (larger offset) it ends in a folded hem: a slight
 * bulge, then a turn-in tucked under, so the edge reads as cloth.
 */
export function ringsFromBands(samples, bands, { lipW = 0.006, simple = false } = {}) {
  const asc = bands[bands.length - 1].to >= bands[0].from;
  const sg = asc ? 1 : -1;
  const eps = 0.0008;
  const rings = [];
  const mk = (band, t, off, lip = 0) => ({ t, region: band.region, mat: band.mat, off, tint: band.tint, lip });
  const bounds = bands.slice(0, -1).map((bd) => bd.to);
  const nearBound = (s) => bounds.some((t) => Math.abs(s - t) < Math.max(lipW * 1.4, 0.004));
  bands.forEach((band, bi) => {
    const off = band.off || 0;
    const lo = Math.min(band.from, band.to);
    const hi = Math.max(band.from, band.to);
    if (bi === 0) rings.push(mk(band, band.from, off));
    let inside = samples.filter((s) => s > lo + 1e-4 && s < hi - 1e-4 && !nearBound(s));
    if (!asc) inside = inside.reverse();
    for (const s of inside) rings.push(mk(band, s, off));
    const next = bands[bi + 1];
    if (!next) {
      rings.push(mk(band, band.to, off));
      return;
    }
    const t = band.to;
    const nOff = next.off || 0;
    if (!simple && nOff > off + 1e-4 && next.lip !== false) {
      // The next band is on top: it ends here in a hem over this one
      rings.push(mk(band, t - sg * eps, off + 0.001));
      rings.push(mk(next, t - sg * eps, off + 0.001, 1));
      rings.push(mk(next, t, nOff + 0.0022, 2));
      rings.push(mk(next, t + sg * lipW, nOff + 0.0012, 1));
    } else if (!simple && off > nOff + 1e-4 && band.lip !== false) {
      // This band is on top: hem, then tuck under onto the next
      rings.push(mk(band, t - sg * lipW, off + 0.0012, 1));
      rings.push(mk(band, t, off + 0.0022, 2));
      rings.push(mk(band, t + sg * eps, nOff + 0.001, 1));
      rings.push(mk(next, t + sg * eps, nOff + 0.001));
    } else {
      rings.push(mk(band, t, off));
      rings.push(mk(next, t, nOff));
    }
  });
  return rings;
}

/* ------------------------------------------------------------ torso */

function torsoKeys(build) {
  // y, half-width, front depth, back depth, centre z, exponent
  const K = [
    [0.785, 0.02, 0.02, 0.02, -0.012, 2.0],
    [0.80, 0.085, 0.055, 0.06, -0.014, 2.1],
    [0.83, 0.142, 0.084, 0.098, -0.016, 2.3],
    [0.875, 0.177, 0.104, 0.126, -0.016, 2.4],
    [0.93, 0.179, 0.105, 0.115, -0.012, 2.45],
    [0.99, 0.162, 0.098, 0.096, -0.008, 2.45],
    [1.05, 0.150, 0.100, 0.088, 0.0, 2.35],
    [1.12, 0.155, 0.107, 0.089, 0.002, 2.35],
    [1.20, 0.166, 0.118, 0.098, 0.0, 2.45],
    [1.28, 0.174, 0.12, 0.104, -0.004, 2.55],
    [1.34, 0.177, 0.112, 0.106, -0.008, 2.6],
    [1.385, 0.177, 0.096, 0.099, -0.012, 2.6],
    [1.42, 0.176, 0.082, 0.09, -0.016, 2.55],
    [1.443, 0.168, 0.071, 0.081, -0.02, 2.5],
    [1.465, 0.151, 0.064, 0.074, -0.022, 2.4],
    [1.485, 0.117, 0.06, 0.068, -0.022, 2.25],
    [1.505, 0.08, 0.059, 0.063, -0.02, 2.05],
    [1.53, 0.066, 0.058, 0.061, -0.016, 2.0],
    [1.56, 0.062, 0.056, 0.059, -0.01, 2.0],
    [1.595, 0.058, 0.053, 0.056, -0.004, 2.0],
    [1.62, 0.04, 0.038, 0.04, 0.0, 2.0],
    [1.632, 0.004, 0.004, 0.004, 0.0, 2.0]
  ];
  const wb = build.w;
  return K.map(([y, a, f, bk, cz, n]) => {
    const neck = y > 1.49;
    const sw = neck ? build.neck : wb;
    const belly = build.belly * gauss(y - 1.06, 0.09);
    return [y, a * sw, f * (neck ? build.neck : build.d) + belly, bk * (neck ? build.neck : build.d), cz + belly * 0.3, n];
  });
}

/** Neckline height for a garment as a function of θ (θ = 0 is the front). */
function necklineFn(kind) {
  switch (kind) {
    case 'crew': return { y0: 1.49, dip: (th) => 0.042 * Math.pow(Math.max(0, Math.cos(th)), 2.2) };
    case 'vee': return { y0: 1.488, dip: (th) => 0.1 * Math.pow(Math.max(0, Math.cos(th)), 6) + 0.03 * Math.max(0, Math.cos(th)) };
    case 'deepVee': return { y0: 1.485, dip: (th) => 0.16 * Math.pow(Math.max(0, Math.cos(th)), 9) + 0.04 * Math.max(0, Math.cos(th)) };
    case 'high': return { y0: 1.56, dip: (th) => 0.03 * Math.pow(Math.max(0, Math.cos(th)), 2) };
    case 'turtle': return { y0: 1.585, dip: (th) => 0.03 * Math.pow(Math.max(0, Math.cos(th)), 2) };
    case 'collar': return { y0: 1.505, dip: (th) => 0.045 * Math.pow(Math.max(0, Math.cos(th)), 4) + 0.012 };
    default: return null;
  }
}

/**
 * The torso + neck as one tube. `outfit` decides which bands are skin, top
 * and bottom; the neckline is followed exactly by warping ring heights.
 */
export function buildTorso(b, ctx) {
  const { build, outfit, res } = ctx;
  const prof = profile(torsoKeys(build));
  const top = outfit.topDef;
  const bot = outfit.bottomDef;
  const nk = necklineFn(top.neck);
  const yNeck = nk ? nk.y0 : 1.462;
  const ys = res.high
    ? [0.785, 0.795, 0.81, 0.835, 0.865, 0.9, 0.94, 0.99, 1.05, 1.11, 1.17, 1.23, 1.29, 1.335, 1.375, 1.405, 1.43,
      1.45, 1.47, 1.49, 1.51, 1.535, 1.565, 1.595, 1.618, 1.632]
    : [0.785, 0.84, 0.95, 1.1, 1.27, 1.4, 1.47, 1.55, 1.632];
  // Bands from the bottom (crotch) to the top (inside the head)
  const bands = [];
  const { waist } = bot;
  const hemY = top.tucked ? waist : top.hem;
  bands.push({ from: 0.785, to: Math.min(hemY, waist), region: REGION.BOTTOM, mat: bot.mat, off: bot.off, tint: bot.tint });
  if (top.tucked && bot.belt) {
    bands[0].to = waist - 0.03;
    bands.push({ from: waist - 0.03, to: waist, region: REGION.FIXED, mat: MAT.SKIN, off: bot.off + 0.003, tint: [0.12, 0.075, 0.05], lip: false });
  }
  // The top garment, split into its trims and panels
  const topBand = (from, to, extra = {}) => ({ from, to, region: REGION.TOP, mat: top.mat, off: top.off, tint: top.tint, ...extra });
  const marks = [];
  if (top.hemBand) marks.push([hemY, hemY + 0.04, { tint: [0.88, 0.88, 0.88], off: top.off + 0.0012, lip: false }]);
  if (top.lame) marks.push([hemY + 0.035, 1.43, { region: REGION.FIXED, mat: MAT.LAME, tint: [0.6, 0.62, 0.64], off: top.off + 0.0012, lip: false }]);
  if (top.chestStripe) marks.push([1.205, 1.232, { region: REGION.ACCENT, tint: [1, 1, 1], off: top.off, lip: false }]);
  if (top.apron) marks.push([hemY + 0.0005, 1.33, { apron: true }]);
  if (top.trim) marks.push([yNeck - 0.016, yNeck, { region: REGION.ACCENT, tint: [1, 1, 1], off: top.off + 0.0006, lip: false }]);
  // A ribbed band round a crew neck, a shade darker and a little proud
  else if (top.neck === 'crew' && res.high) marks.push([yNeck - 0.0135, yNeck, { tint: [0.86, 0.86, 0.86], off: top.off + 0.0013, lip: false }]);
  if (top.stripes && res.high) {
    // Breton-style bands in the accent colour, each a crisp pair of ring edges
    const n = 5;
    const y0 = hemY + 0.05;
    const step = (1.4 - y0) / n;
    for (let k = 0; k < n; k++) marks.push([y0 + k * step, y0 + k * step + step * 0.36, { region: REGION.ACCENT, tint: [1, 1, 1], off: top.off, lip: false }]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  let cur = hemY;
  for (const [f, t, extra] of marks) {
    if (f > cur + 1e-4) bands.push(topBand(cur, f));
    bands.push(topBand(Math.max(f, cur), t, extra));
    cur = t;
  }
  bands.push(topBand(cur, yNeck));
  bands.push({ from: yNeck, to: 1.632, region: REGION.SKIN, mat: MAT.SKIN, off: 0 });
  const rings = ringsFromBands(ys, bands, { lipW: 0.008, simple: !res.high });
  // Columns: even, plus a duplicated pair at each apron edge (crisp sides)
  const thetas = [];
  const nc = res.high ? 20 : 8;
  const apronA = 1.15;
  for (let j = 0; j < nc; j++) thetas.push({ th: (j / nc) * Math.PI * 2, side: 0 });
  if (top.apron) {
    for (const a of [apronA, Math.PI * 2 - apronA]) {
      thetas.push({ th: a, side: a < Math.PI ? 1 : -1, out: true });
      thetas.push({ th: a, side: a < Math.PI ? 1 : -1, out: false });
    }
    thetas.sort((p, q) => p.th - q.th || (p.side > 0 ? (p.out ? -1 : 1) : (p.out ? 1 : -1)));
  }
  const cols = thetas.length;
  const rows = rings.length;
  const inApron = (t) => (t.out === undefined ? (t.th < apronA || t.th > Math.PI * 2 - apronA) : t.out);
  const pts = [];
  const zoneLo = nk ? yNeck - 0.22 : 0;
  const zoneHi = nk ? Math.min(yNeck + 0.05, 1.6) : 0;
  const warp = (y, th) => {
    if (!nk || y <= zoneLo || y >= zoneHi) return y;
    const yn = yNeck - nk.dip(th);
    if (y <= yNeck) return zoneLo + (y - zoneLo) * (yn - zoneLo) / (yNeck - zoneLo);
    return yn + (y - yNeck) * (zoneHi - yn) / (zoneHi - yNeck);
  };
  const detail = (y, th, clothed) => {
    // Pectorals, shoulder blades, spine groove, seat, belly — softened under cloth
    const k = clothed ? 0.45 : 1;
    const c = Math.cos(th);
    const s = Math.sin(th);
    let d = 0;
    d += 0.007 * gauss(y - 1.275, 0.05) * gauss(Math.abs(s) - 0.5, 0.3) * Math.max(0, c) * build.chest;
    d += 0.006 * gauss(y - 1.33, 0.05) * gauss(Math.abs(s) - 0.55, 0.3) * Math.max(0, -c);
    d -= 0.004 * gauss(y - 1.2, 0.17) * gauss(th - Math.PI, 0.18);
    d -= 0.006 * gauss(y - 0.84, 0.05) * gauss(th - Math.PI, 0.12);
    d -= 0.003 * gauss(y - 1.04, 0.06) * gauss(Math.abs(s) - 1, 0.35);
    return d * k;
  };
  const offAt = (y) => {
    for (const r of rings) if (r.t >= y) return r.off;
    return 0;
  };
  ctx.torsoAt = (y, th, extra = 0) => {
    const [a, bf, bb, cz, n] = prof(y);
    const c = Math.cos(th);
    const s = Math.sin(th);
    const rad = Math.pow(Math.pow(Math.abs(c) / (c >= 0 ? bf : bb), n) + Math.pow(Math.abs(s) / a, n), -1 / n);
    const R = rad + offAt(y) + extra + detail(y, th, true);
    return [s * R, y, cz + c * R];
  };
  for (let i = 0; i < rows; i++) {
    const r = rings[i];
    for (let j = 0; j < cols; j++) {
      const { th } = thetas[j];
      let { region } = r;
      let { mat } = r;
      let rtint = r.tint;
      let roff = r.off;
      if (r.band && r.band.apron && inApron(thetas[j])) {
        region = REGION.ACCENT;
        mat = MAT.CLOTH;
        rtint = [1, 1, 1];
        roff += 0.0042;
      }
      const y = warp(r.t, th);
      const [a, bf, bb, cz, n] = prof(y);
      const c = Math.cos(th);
      const s = Math.sin(th);
      const depth = c >= 0 ? bf : bb;
      // Polar superellipse radius
      const rad = Math.pow(Math.pow(Math.abs(c) / depth, n) + Math.pow(Math.abs(s) / a, n), -1 / n);
      const clothed = region !== REGION.SKIN;
      let off = roff + detail(y, th, clothed);
      if (top.neckRoll && region === REGION.TOP && y > 1.47) off += 0.004 + 0.006 * gauss(y - 1.545, 0.016);
      if (region !== REGION.SKIN && region !== REGION.BOTTOM && !top.tucked && r.t < 1.2) off += 0.006 * sstep(top.hem + 0.12, top.hem, r.t);
      // Cloth folds: a few soft horizontal creases at the waist and armpits
      if (clothed && res.high && r.lip === 0) {
        off += 0.0016 * Math.sin(y * 95 + th * 2) * gauss(y - 1.0, 0.07) * (region === REGION.TOP ? 1 : 0.4);
        off += 0.0012 * Math.sin(y * 140) * gauss(y - 1.36, 0.04) * gauss(Math.abs(s) - 1, 0.3);
      }
      const R = rad + off;
      let tint = rtint;
      if (r.lip === 2) tint = mulTint(rtint, 0.93);
      tint = shadeTorso(tint, y, th, region, outfit);
      pts.push({ p: [s * R, y, cz + c * R], region, tint, mat, y, th });
    }
  }
  const poles = [0, rows - 1];
  emitGrid(b, {
    pts, rows, cols, center: new THREE.Vector3(0, 1.2, 0), poles,
    weight: (p) => torsoWeights(p)
  });
}

function mulTint(t, k) {
  const a = t || [1, 1, 1];
  return [a[0] * k, a[1] * k, a[2] * k];
}

function shadeTorso(tint, y, th, region, outfit) {
  const t = tint ? tint.slice() : [1, 1, 1];
  // Soft occlusion where arms and thighs meet the trunk
  const side = Math.abs(Math.sin(th));
  let ao = 1 - 0.18 * gauss(y - 1.33, 0.06) * gauss(side - 1, 0.25);
  // The crotch faces down into shadow; lift it so it does not read as a hole
  ao *= 1 + 0.25 * sstep(0.85, 0.8, y);
  ao *= 1 - 0.12 * gauss(y - 1.47, 0.03);
  if (region === REGION.SKIN && y > 1.47) ao *= 1 - 0.1 * sstep(1.5, 1.58, y) * Math.max(0, Math.cos(th));
  // Fabric character: linen is slubby, knits a touch heathered
  const fab = outfit.topDef.fabric || (outfit.topDef.rib || outfit.topDef.hemBand ? 'knit' : null);
  if (region === REGION.TOP && fab === 'linen') ao *= 1 + 0.045 * noise3(y * 38, th * 5, 1.7) + 0.02 * noise3(y * 140, th * 22, 3.1);
  if (region === REGION.TOP && fab === 'knit') ao *= 1 + 0.03 * noise3(y * 90, th * 16, 0.4);
  if (region === REGION.TOP && outfit.topDef.stripe) {
    const st = outfit.topDef.stripe(y, th);
    if (st) return st;
  }
  return [t[0] * ao, t[1] * ao, t[2] * ao];
}

function torsoWeights(p) {
  const [x, y] = p;
  const ax = Math.abs(x);
  const out = [];
  const hips = 1 - sstep(0.96, 1.09, y);
  const spine = sstep(0.96, 1.09, y) * (1 - sstep(1.1, 1.25, y));
  let chest = sstep(1.1, 1.25, y) * (1 - sstep(1.45, 1.52, y));
  const neck = sstep(1.45, 1.52, y) * (1 - sstep(1.56, 1.61, y));
  const head = sstep(1.56, 1.61, y);
  const sh = sstep(0.07, 0.15, ax) * sstep(1.3, 1.4, y) * (1 - sstep(1.48, 1.52, y));
  chest *= 1 - sh * 0.85;
  const thigh = sstep(0.95, 0.84, y) * sstep(0.015, 0.09, ax) * 0.5;
  out.push(['hips', hips * (1 - thigh)], ['spine', spine], ['chest', chest], ['neck', neck], ['head', head]);
  if (sh > 0) out.push([x > 0 ? 'shoulderL' : 'shoulderR', sh * 0.85]);
  if (thigh > 0) out.push([x > 0 ? 'thighL' : 'thighR', thigh * hips]);
  return out;
}

/* ------------------------------------------------------------ limbs */

const ARM_KEYS = [
  // d, r, rx factor, rz factor
  [-0.047, 0.003, 1, 1], [-0.043, 0.022, 1, 1], [-0.033, 0.036, 1, 1], [-0.02, 0.045, 1, 1],
  [-0.005, 0.0505, 1, 1], [0.016, 0.0518, 1.02, 1], [0.045, 0.0505, 1.02, 1.0], [0.085, 0.048, 1, 1],
  [0.135, 0.0465, 0.98, 1.04], [0.185, 0.0425, 0.97, 1.03], [0.235, 0.0395, 0.98, 1.0], [0.268, 0.0372, 1, 1],
  [0.288, 0.0368, 1, 1], [0.31, 0.0388, 1.02, 1.02], [0.35, 0.0395, 0.98, 1.04], [0.40, 0.0362, 0.92, 1.08],
  [0.45, 0.0315, 0.84, 1.14], [0.50, 0.0278, 0.76, 1.2], [0.535, 0.026, 0.72, 1.22], [0.552, 0.0248, 0.7, 1.2],
  [0.566, 0.021, 0.7, 1.1], [0.578, 0.011, 0.8, 1.0], [0.583, 0.002, 1, 1]
];

/** Arm tube from the shoulder ball to the wrist, sleeve per outfit. */
export function buildArm(b, ctx, side) {
  const { joints, outfit, res, build } = ctx;
  const S = side > 0 ? 'L' : 'R';
  const J = joints[`upperArm${S}`];
  const keys = ARM_KEYS.map(([d, r, fx, fz]) => [d, r * build.limb, fx, fz]);
  const prof = profile(keys);
  const top = outfit.topDef;
  const sleeveEnd = top.sleeve;
  const ds = res.high
    ? [-0.047, -0.041, -0.031, -0.018, -0.002, 0.02, 0.06, 0.12, 0.19, 0.25, 0.276, 0.3, 0.326, 0.37, 0.43, 0.49,
      0.53, 0.556, 0.574, 0.583]
    : [-0.047, -0.01, 0.15, 0.29, 0.45, 0.583];
  const bands = [];
  if (sleeveEnd > 0) {
    bands.push({ from: -0.047, to: sleeveEnd, region: REGION.TOP, mat: top.mat, off: top.sleeveOff ?? top.off, tint: top.tint });
    if (top.cuff && sleeveEnd > 0.4) {
      bands[0].to = sleeveEnd - 0.045;
      bands.push({ from: sleeveEnd - 0.045, to: sleeveEnd, region: top.cuffRegion ?? REGION.TOP, mat: top.mat, off: (top.sleeveOff ?? top.off) + 0.0015, tint: top.cuffTint || top.tint, lip: false });
    }
    if (top.sleeveBand) {
      const last = bands[bands.length - 1];
      last.to = sleeveEnd - 0.018;
      bands.push({ from: sleeveEnd - 0.018, to: sleeveEnd, region: top.sleeveBand.region, mat: top.mat, off: last.off + 0.0008, tint: top.sleeveBand.tint, lip: false });
    }
    bands.push({ from: sleeveEnd, to: 0.583, region: REGION.SKIN, mat: MAT.SKIN, off: 0 });
  } else {
    bands.push({ from: -0.047, to: 0.583, region: REGION.SKIN, mat: MAT.SKIN, off: 0 });
  }
  const rings = ringsFromBands(ds, bands, { lipW: 0.007, simple: !res.high });
  const cols = res.high ? 10 : 5;
  const pts = [];
  for (const r of rings) {
    const d = r.t;
    const [rr, fx, fz] = prof(d);
    for (let j = 0; j < cols; j++) {
      const th = (j / cols) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th) * side; // + is lateral
      let rad = rr;
      // Biceps, triceps, forearm swell, elbow point
      rad += 0.0035 * gauss(d - 0.15, 0.05) * Math.max(0, c);
      rad += 0.003 * gauss(d - 0.12, 0.05) * Math.max(0, -c);
      rad += 0.0028 * gauss(d - 0.34, 0.04) * Math.max(0, s * 0.7 + c * 0.7);
      rad += 0.0025 * gauss(d - 0.29, 0.012) * Math.max(0, -c);
      const clothed = r.region !== REGION.SKIN;
      let { off } = r;
      if (clothed) {
        // Sleeves hang a little looser below the shoulder and crease at the elbow
        off += 0.004 * sstep(0.02, 0.1, d) * (top.sleeveLoose ?? 1);
        if (res.high && r.lip === 0) off += 0.0018 * Math.sin(d * 230 + th) * gauss(d - 0.29, 0.03) * Math.max(0, c + 0.3);
      }
      const R = rad + off;
      const x = J.x + Math.sin(th) * R * fx;
      const z = J.z + c * R * fz;
      let { tint } = r;
      if (r.lip === 2) tint = mulTint(r.tint, 0.93);
      const ao = 1 - 0.15 * gauss(d - 0.29, 0.02) * Math.max(0, c) - 0.12 * gauss(d + 0.0, 0.05) * Math.max(0, -s);
      tint = mulTint(tint, ao);
      if (r.region === REGION.SKIN) tint = mulTint(tint, 1 + 0.02 * gauss(d - 0.29, 0.02));
      pts.push({ p: [x, J.y - d, z], region: r.region, tint, mat: r.mat, d });
    }
  }
  emitGrid(b, {
    pts, rows: rings.length, cols, center: new THREE.Vector3(J.x, J.y - 0.25, J.z), poles: [0, rings.length - 1],
    weight: (p, q) => {
      const { d } = q;
      const fore = sstep(0.258, 0.322, d);
      const hand = sstep(0.528, 0.572, d);
      // The lower forearm rolls with the twist bone (half the hand's twist)
      const tw = sstep(0.33, 0.53, d);
      return [[`upperArm${S}`, 1 - fore], [`forearm${S}`, fore * (1 - hand) * (1 - tw)],
        [`forearmTwist${S}`, fore * (1 - hand) * tw], [`hand${S}`, fore * hand]];
    }
  });  // A glove's gauntlet cuff over the wrist (outfit.gloves / spec.gloves)
  buildCuff(b, ctx, side, prof, J);
}

const LEG_KEYS = [
  [-0.075, 0.004, 1, 1], [-0.062, 0.033, 1, 1], [-0.04, 0.05, 1, 1], [-0.015, 0.058, 1, 1], [0.02, 0.064, 0.98, 1],
  [0.06, 0.072, 0.97, 1.0], [0.1, 0.0795, 0.96, 1.0], [0.14, 0.079, 0.95, 1.0], [0.21, 0.071, 0.95, 0.99], [0.28, 0.063, 0.95, 0.98],
  [0.34, 0.057, 0.96, 0.98], [0.385, 0.0535, 0.98, 0.98], [0.415, 0.052, 1, 0.98], [0.445, 0.0512, 0.98, 1],
  [0.49, 0.0532, 0.92, 1.04], [0.54, 0.0545, 0.9, 1.08], [0.59, 0.052, 0.9, 1.06], [0.65, 0.046, 0.9, 1.02],
  [0.71, 0.0395, 0.92, 1.0], [0.765, 0.034, 0.95, 1.0], [0.80, 0.031, 1, 1.02], [0.83, 0.031, 1, 1.05],
  [0.852, 0.027, 1, 1.05], [0.866, 0.012, 1, 1], [0.87, 0.002, 1, 1]
];

/** Leg tube from the hip ball to the ankle (inside the shoe). */
export function buildLeg(b, ctx, side) {
  const { joints, outfit, res, build } = ctx;
  const S = side > 0 ? 'L' : 'R';
  const H = joints[`thigh${S}`];
  const prof = profile(LEG_KEYS.map(([d, r, fx, fz]) => [d, r * build.limb * (d < 0.4 ? build.thigh : 1), fx, fz]));
  const bot = outfit.bottomDef;
  const ds = res.high
    ? [-0.075, -0.066, -0.05, -0.028, 0.0, 0.05, 0.13, 0.22, 0.31, 0.37, 0.405, 0.44, 0.49, 0.55, 0.62, 0.7, 0.77, 0.82,
      0.855, 0.87]
    : [-0.075, -0.03, 0.1, 0.4, 0.6, 0.8, 0.87];
  const bands = [];
  const { legEnd } = bot;
  bands.push({ from: -0.075, to: legEnd, region: REGION.BOTTOM, mat: bot.mat, off: bot.off, tint: bot.tint });
  if (bot.sock) {
    // Bare leg between the hem and an ankle or crew sock (sock.from), or a knee sock
    const from = Math.max(legEnd, bot.sock.from ?? legEnd);
    if (from > legEnd + 1e-4) bands.push({ from: legEnd, to: from, region: REGION.SKIN, mat: MAT.SKIN, off: 0 });
    bands.push({ from, to: bot.sock.end, region: bot.sock.region, mat: MAT.CLOTH, off: 0.0015, tint: bot.sock.tint });
    if (bot.sock.end < 0.87) bands.push({ from: bot.sock.end, to: 0.87, region: REGION.SKIN, mat: MAT.SKIN, off: 0 });
  } else if (legEnd < 0.87) {
    bands.push({ from: legEnd, to: 0.87, region: REGION.SKIN, mat: MAT.SKIN, off: 0 });
  }
  if (outfit.shoeDef.boot) {
    // Boots: the shaft covers the lower leg over whatever is there
    const bt = outfit.shoeDef.boot;
    const cut = [];
    for (const band of bands) {
      if (band.to <= bt) cut.push(band);
      else if (band.from < bt) cut.push({ ...band, to: bt });
    }
    cut.push({ from: bt, to: 0.87, region: REGION.FIXED, mat: MAT.SKIN, off: 0.012, tint: outfit.shoeDef.color });
    bands.length = 0;
    bands.push(...cut);
  }
  const rings = ringsFromBands(ds, bands, { lipW: 0.008, simple: !res.high });
  const cols = res.high ? 10 : 5;
  const pts = [];
  for (const r of rings) {
    const d = r.t;
    const [rr, fx, fz] = prof(d);
    for (let j = 0; j < cols; j++) {
      const th = (j / cols) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th) * side;
      let rad = rr;
      rad += 0.005 * gauss(d - 0.13, 0.08) * Math.max(0, c) * build.thigh;
      rad += 0.0075 * gauss(d - 0.54, 0.07) * Math.max(0, -c);
      rad += 0.004 * gauss(d - 0.405, 0.022) * Math.max(0, c) * Math.max(0, c);
      rad -= 0.004 * gauss(d - 0.1, 0.12) * Math.max(0, -s);
      let { off } = r;
      const clothed = r.region === REGION.BOTTOM;
      if (clothed) {
        // Straight-hanging trouser legs: never tighter than the cut allows
        const minR = bot.minR * sstep(bot.minFrom - 0.1, bot.minFrom, d);
        if (minR > 0) off = Math.max(off, minR - rad + r.off * 0.5);
        if (res.high && r.lip === 0) {
          off += 0.0022 * Math.sin(d * 160 + th * 1.5) * sstep(legEnd - 0.12, legEnd - 0.02, d) * bot.break;
          off += 0.0016 * Math.sin(d * 210) * gauss(d - 0.43, 0.035) * Math.max(0, -c + 0.2);
          off += 0.0012 * Math.sin(d * 120 + 1) * gauss(d - 0.03, 0.05) * Math.max(0, c);
        }
      }
      const R = rad + off;
      let { tint } = r;
      if (r.lip === 2) tint = mulTint(r.tint, 0.92);
      const ao = 1 - 0.22 * gauss(d + 0.03, 0.05) * Math.max(0, -s * 0.8 + 0.3) - 0.12 * gauss(d - 0.43, 0.03) * Math.max(0, -c);
      tint = mulTint(tint, ao);
      if (clothed && bot.seam) {
        tint = mulTint(tint, 1 + 0.12 * gauss(Math.sin(th) * side - 1, 0.12));
        // Worn denim: lighter down the front of the thigh and over the knee,
        // darker in the creases behind it and at the crotch
        const fade = 0.12 * gauss(d - 0.18, 0.11) * Math.max(0, c) + 0.1 * gauss(d - 0.43, 0.05) * Math.max(0, c) -
          0.07 * gauss(d - 0.45, 0.04) * Math.max(0, -c) - 0.06 * gauss(d + 0.03, 0.05);
        tint = [tint[0] * (1 + fade * 0.8), tint[1] * (1 + fade * 0.9), tint[2] * (1 + fade)];
      }
      pts.push({ p: [H.x + Math.sin(th) * R * fx, H.y - d, H.z + c * R * fz], region: r.region, tint, mat: r.mat, d });
    }
  }
  emitGrid(b, {
    pts, rows: rings.length, cols, center: new THREE.Vector3(H.x, H.y - 0.4, H.z), poles: [0, rings.length - 1],
    weight: (p, q) => {
      const { d } = q;
      const shin = sstep(0.372, 0.458, d);
      const foot = sstep(0.81, 0.855, d);
      const top = sstep(-0.05, 0.03, d);
      return [['hips', (1 - top) * 0.0], [`thigh${S}`, 1 - shin], [`shin${S}`, shin * (1 - foot)], [`foot${S}`, shin * foot]];
    }
  });
}

/* ------------------------------------------------------------ hands */

/** Closed superellipsoid grid around `c` with half sizes and exponents. */
function blob(b, { c, r, n = [2, 2], cols, rows, region, tint, mat, weight, warp }) {
  const pts = [];
  for (let i = 0; i <= rows; i++) {
    const v = (i / rows) * Math.PI;
    const sv = Math.sin(v);
    const cv = Math.cos(v);
    for (let j = 0; j < cols; j++) {
      const u = (j / cols) * Math.PI * 2;
      const su = Math.sin(u);
      const cu = Math.cos(u);
      const fe = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), 2 / e);
      let p = [
        c[0] + r[0] * fe(sv, n[0]) * fe(su, n[1]),
        c[1] + r[1] * fe(cv, n[0]),
        c[2] + r[2] * fe(sv, n[0]) * fe(cu, n[1])
      ];
      if (warp) p = warp(p, i / rows, j / cols);
      pts.push({ p, region, tint: typeof tint === 'function' ? tint(p, i / rows, j / cols) : tint, mat });
    }
  }
  return emitGrid(b, { pts, rows: rows + 1, cols, center: new THREE.Vector3(...c), poles: [0, rows], weight });
}

/**
 * Gloves for one side, from look.gloves: a colour (both hands), true
 * (white, both), or { side: 'L'|'R'|'both', color, cuff }. → null | { tint, cuff }
 */
export function gloveFor(look, S) {
  let g = look && look.gloves;
  if (g === undefined || g === null || g === false) return null;
  if (g === true) g = { color: 0xf1efe8 };
  else if (typeof g === 'number' || typeof g === 'string') g = { color: g };
  const side = g.side || 'both';
  if (side !== 'both' && side !== S) return null;
  const c = new THREE.Color(g.color ?? 0xf1efe8);
  return { tint: [c.r, c.g, c.b], cuff: !!g.cuff };
}

/**
 * A gauntlet cuff over the wrist (fencing glove): a flared, open shell
 * a few millimetres off the forearm, with a rolled top edge.
 * `prof(d)` is the arm's radius profile (d metres from the shoulder).
 */
export function buildCuff(b, ctx, side, prof, J) {
  const S = side > 0 ? 'L' : 'R';
  const glove = gloveFor(ctx.look, S);
  if (!glove || !glove.cuff) return;
  const hi = ctx.res.high;
  const cols = hi ? 12 : 6;
  // [d along the arm, gap off the skin]: outer face up to the rolled lip, then the inner face back down
  const rows = hi
    ? [[0.566, 0.0035], [0.545, 0.004], [0.515, 0.0075], [0.485, 0.0125], [0.468, 0.0155], [0.462, 0.0158], [0.465, 0.011], [0.48, 0.0085], [0.52, 0.0035]]
    : [[0.566, 0.0035], [0.5, 0.01], [0.465, 0.0155], [0.475, 0.008], [0.53, 0.0035]];
  const pts = [];
  rows.forEach(([d, gap], i) => {
    const [rr, fx, fz] = prof(d);
    for (let j = 0; j < cols; j++) {
      const th = (j / cols) * Math.PI * 2;
      const R = rr + gap;
      const lip = i >= rows.length - 4 && i <= rows.length - 3;
      const k = lip ? 0.93 : 1;
      pts.push({
        p: [J.x + Math.sin(th) * R * fx, J.y - d, J.z + Math.cos(th) * R * fz], region: REGION.FIXED,
        tint: glove.tint.map((v) => v * k), mat: MAT.CLOTH, d
      });
    }
  });
  emitGrid(b, {
    pts, rows: rows.length, cols, center: new THREE.Vector3(J.x, J.y - 0.4, J.z),
    normalFn: (p, q, out) => {
      const i = Math.floor(pts.indexOf(q) / cols);
      const inner = i >= rows.length - 3;
      const sg = inner ? -1 : 1;
      out[0] = (p[0] - J.x) * sg;
      out[1] = 0;
      out[2] = (p[2] - J.z) * sg;
      return out;
    },
    weight: (p, q) => {
      const h = sstep(0.528, 0.572, q.d) * 0.6;
      return [[`forearmTwist${S}`, 1 - h], [`hand${S}`, h]];
    }
  });
}

/**
 * A digit as a closed tube along `axis` (unit, hand space) from `o`.
 * rings: [[t, widthRadius, thicknessScale]] (t in metres along the axis; the
 * last ring is the tip pole). `side` gives the cross-section's width axis U
 * and dorsal axis V; `shape(t, a)` adds a radial offset (knuckles, pads,
 * creases), `weight(t)` returns the bone weights.
 */
function digitTube(b, { o, axis, U, V, rings, cols, tint, shape, weight, glove = null, pad = 0 }) {
  const pts = [];
  for (const [t, r, th] of rings) {
    for (let j = 0; j < cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Rounded-rectangle-ish section: a superellipse (exponent 2.4)
      const e = 2 / 2.4;
      const cx = Math.sign(ca) * Math.pow(Math.abs(ca), e);
      const sy = Math.sign(sa) * Math.pow(Math.abs(sa), e);
      const extra = r > 0 ? (shape ? shape(t, sa, ca) : 0) + pad : 0;
      const w = r > 0 ? r + extra : 0;
      const h = r > 0 ? r * th + extra : 0;
      const p = [0, 1, 2].map((i) => o[i] + axis[i] * t + U[i] * cx * w + V[i] * sy * h);
      const tn = typeof tint === 'function' ? tint(t, sa) : tint;
      pts.push(glove
        ? { p, region: REGION.FIXED, tint: glove.tint.map((v, k) => v * (0.9 + 0.1 * tn[k])), mat: MAT.CLOTH, t }
        : { p, region: REGION.SKIN, tint: tn, mat: MAT.SKIN, t });
    }
  }
  const mid = rings[Math.floor(rings.length / 2)][0];
  emitGrid(b, {
    pts, rows: rings.length, cols, center: new THREE.Vector3(...o.map((v, i) => v + axis[i] * mid)), poles: [rings.length - 1],
    weight: (p, q) => weight(q.t)
  });
  // The surface at (t, a) between rings, for parts that sit on it (nails)
  return (t, a, lift) => {
    let i = 0;
    while (i < rings.length - 2 && rings[i + 1][0] < t) i++;
    const [ta, ra, ha] = rings[i];
    const [tb, rb, hb] = rings[i + 1];
    const k = THREE.MathUtils.clamp((t - ta) / (tb - ta || 1), 0, 1);
    const r = ra + (rb - ra) * k;
    const th = ha + (hb - ha) * k;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const e = 2 / 2.4;
    const cx = Math.sign(ca) * Math.pow(Math.abs(ca), e);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), e);
    const extra = (shape ? shape(t, sa, ca) : 0) + pad;
    return [0, 1, 2].map((m) => o[m] + axis[m] * t + U[m] * cx * (r + extra + lift) + V[m] * sy * (r * th + extra + lift));
  };
}

/** A fingernail on a digit's surface: a domed plate whose edges tuck under the skin (never coplanar). */
function nail(b, { surf, o, axis, t0, t1, half, bone, hs }) {
  const pts = [];
  const rows = 2;
  const cols = 3;
  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    const t = t0 + (t1 - t0) * v;
    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      const w = half * (1 - 0.18 * v * v);
      const a = Math.PI / 2 + (u - 0.5) * 2 * w;
      const edge = Math.max(Math.abs(u - 0.5) * 2, v < 0.2 ? 1 - v / 0.2 : 0);
      const lift = (0.0005 - 0.0011 * edge * edge) * hs;
      const lunula = v < 0.3 ? 1.05 : 1;
      const free = v > 0.85 ? 1.06 : 1;
      pts.push({ p: surf(t, a, lift), region: REGION.SKIN, tint: [1.08 * lunula * free, 0.93 * lunula * free, 0.91 * lunula * free], mat: MAT.SKIN });
    }
  }
  return emitGrid(b, {
    pts, rows: rows + 1, cols: cols + 1, wrap: false,
    normalFn: (p, q, out) => {
      // Outward from the digit's axis
      const d = [0, 1, 2].map((k) => p[k] - o[k]);
      const al = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
      out[0] = d[0] - axis[0] * al;
      out[1] = d[1] - axis[1] * al;
      out[2] = d[2] - axis[2] * al;
      return out;
    },
    weight: () => [[bone, 1]]
  });
}

/**
 * Hand: a palm with knuckles, tendons and an arch, four fingers of three
 * phalanges with pads, creases and nails, and an opposable thumb with its
 * ball and web (high); a mitten that still curls and a thumb (low). The
 * bones and proportions come from people-hands.js.
 */
export function buildHand(b, ctx, side) {
  const { joints, res, build } = ctx;
  const S = side > 0 ? 'L' : 'R';
  const W = joints[`hand${S}`];
  const s = side;
  const hs = build.hand ?? 1.09;
  // Hand space [d, y, f] → model
  const H = (d, y, f) => [W.x + s * d * hs, W.y + y * hs, W.z + f * hs];
  const Hv = (d, y, f) => [s * d, y, f];
  const tintSkin = [1.0, 0.96, 0.94];
  const palmTint = [1.02, 0.95, 0.94];
  const fingerBone = (f, k) => `${f}${['', 'Mid', 'Tip'][k]}${S}`;
  const baseBone = (f) => (f === 'ring' || f === 'pinky' ? `palm${S}` : `hand${S}`);
  // Gloved hands: the glove's colour on a cloth region, a touch fuller, no nails
  const glove = gloveFor(ctx.look, S);
  const gpad = glove ? 0.0009 * hs : 0;
  const REG = glove ? REGION.FIXED : REGION.SKIN;
  const MT = glove ? MAT.CLOTH : MAT.SKIN;
  const gt = (t) => (glove ? glove.tint.map((v, k) => v * (0.9 + 0.1 * t[k])) : t);

  if (!res.high) {
    // Low detail: palm and fingers as one mitten that curls with the middle finger, and a thumb
    const M = DIGITS.middle;
    const fl = M.len[0] + M.len[1] + M.len[2];
    blob(b, {
      c: H(0.0, -0.06, 0.001), r: [0.0155 * hs, 0.066 * hs, 0.037 * hs], n: [2.4, 2.6],
      cols: 5, rows: 3, region: REG, mat: MT, tint: gt(palmTint),
      weight: (p) => {
        const dy = (W.y - p[1]) / hs;
        const f = sstep(0.004, 0.02, dy);
        const g1 = sstep(0.085, 0.1, dy);
        return [[`forearm${S}`, 1 - f], [`hand${S}`, f * (1 - g1)], [`middle${S}`, f * g1]];
      }
    });
    digitTube(b, {
      o: H(0, M.mcp[1] + 0.008, 0.0005), axis: [0, -1, 0], U: [0, 0, 1], V: Hv(1, 0, 0), cols: 4, tint: tintSkin, glove,
      rings: [[0, 0.033 * hs, 0.4], [(0.008 + M.len[0]) * hs, 0.034 * hs, 0.38], [(0.008 + fl * 0.85) * hs, 0.03 * hs, 0.36], [(0.008 + fl) * hs, 0, 0]],
      weight: (t) => {
        const u = t / hs - 0.008;
        const k1 = sstep(-0.004, 0.004, u);
        const k2 = sstep(M.len[0] - 0.006, M.len[0] + 0.006, u);
        return [[`hand${S}`, 1 - k1], [`middle${S}`, k1 * (1 - k2)], [`middleMid${S}`, k1 * k2]];
      }
    });
    const T = THUMB;
    const tl = T.len[0] + T.len[1] + T.len[2];
    digitTube(b, {
      o: H(...T.cmc), axis: Hv(...T.dir), U: Hv(...T.axis), V: Hv(...T.pad).map((v) => -v), cols: 4, tint: tintSkin, glove,
      rings: [[0.006 * hs, 0.012 * hs, 0.85], [T.len[0] * hs, 0.011 * hs, 0.85], [tl * hs, 0, 0]],
      weight: (t) => {
        const u = t / hs;
        const k1 = sstep(0.004, 0.016, u);
        const k2 = sstep(T.len[0] - 0.006, T.len[0] + 0.006, u);
        return [[`hand${S}`, 1 - k1], [`thumb${S}`, k1 * (1 - k2)], [`thumbMid${S}`, k1 * k2]];
      }
    });
    return;
  }

  /* Palm: a rounded block that tapers to the wrist, follows the knuckle
     arc, with knuckle heads and tendons on the back and soft pads inside */
  const knuckles = FINGER_NAMES.map((f) => DIGITS[f].mcp);
  const arcY = (f) => {
    // The distal edge follows the knuckles (index lowest, little finger highest)
    const ks = knuckles;
    if (f >= ks[0][2]) return ks[0][1];
    for (let i = 0; i < 3; i++) {
      if (f >= ks[i + 1][2]) {
        const k = (f - ks[i + 1][2]) / (ks[i][2] - ks[i + 1][2]);
        return ks[i + 1][1] + (ks[i][1] - ks[i + 1][1]) * k;
      }
    }
    return ks[3][1];
  };
  const PC = PALM.c;
  const PH = PALM.half;
  blob(b, {
    c: H(PC[0], PC[1], PC[2]), r: [PH[0] * hs + gpad, PH[1] * hs + gpad, PH[2] * hs + gpad], n: [3.4, 2.7],
    cols: 10, rows: 7, region: REG, mat: MT,
    warp: (p, v) => {
      // Back to hand space
      let d = (p[0] - W.x) * s / hs;
      let y = (p[1] - W.y) / hs;
      let f = (p[2] - W.z) / hs;
      const dc = d - PC[0];
      const fc = f - PC[2];
      // Taper towards the wrist (narrower and thinner)
      const wk = sstep(0.42, 0.0, v);
      f = PC[2] + fc * (1 - 0.24 * wk);
      d = PC[0] + dc * (1 - 0.12 * wk);
      // Distal edge along the knuckle arc
      const end = sstep(0.55, 1.0, v);
      y += end * (arcY(f) - 0.0015 - (PC[1] - PH[1]));
      // Transverse arch: the back is domed, the palm hollow in the middle
      const fn = THREE.MathUtils.clamp(fc / PH[2], -1, 1);
      if (dc > 0) d += 0.0022 * (1 - fn * fn) - 0.001;
      else {
        d += 0.0016 * fn * fn - 0.0012 * gauss(y + 0.06, 0.02) * (1 - fn * fn);
        // Hypothenar pad (little finger side, near the wrist) and the pads under the knuckles
        d -= 0.0026 * gauss(y + 0.045, 0.022) * sstep(-0.005, -0.03, fc);
        d -= 0.0013 * gauss(y - arcY(f) - 0.006, 0.006);
      }
      if (dc > 0) {
        // Knuckle heads and the tendons that fan out to them from the wrist
        for (const k of knuckles) {
          d += 0.0024 * gauss(f - k[2], 0.0058) * gauss(y - k[1] - 0.003, 0.0075);
          const tf = k[2] * sstep(-0.01, k[1] + 0.01, y) * 0.8;
          d += 0.0006 * gauss(f - tf, 0.0028) * sstep(-0.015, -0.04, y) * sstep(k[1] - 0.004, k[1] + 0.02, y);
        }
      }
      return H(d, y, f);
    },
    tint: (p) => {
      const d = (p[0] - W.x) * s / hs;
      const y = (p[1] - W.y) / hs;
      if (d < PC[0] - 0.004) return gt(palmTint);
      let k = 1;
      for (const kn of knuckles) k -= 0.05 * gauss((p[2] - W.z) / hs - kn[2], 0.006) * gauss(y - kn[1], 0.008);
      return gt([tintSkin[0] * k, tintSkin[1] * k, tintSkin[2] * k]);
    },
    weight: (p) => {
      const d = (p[0] - W.x) * s / hs;
      const dy = (W.y - p[1]) / hs;
      const f = (p[2] - W.z) / hs;
      const fw = sstep(0.004, 0.02, dy);
      // Ulnar side rides on the palm-arch bone
      const arch = sstep(-0.004, -0.022, f) * sstep(0.02, 0.06, dy);
      const out = [[`forearm${S}`, 1 - fw], [`hand${S}`, fw * (1 - arch)], [`palm${S}`, fw * arch]];
      // The skin over and under the knuckles follows the fingers a little
      const near = sstep(-arcY(f) - 0.012, -arcY(f) + 0.002, dy) * (d < 0 ? 0.32 : 0.2);
      if (near > 0) {
        let best = 'index';
        let bd = 1;
        for (const nme of FINGER_NAMES) {
          const dd = Math.abs(f - DIGITS[nme].mcp[2]);
          if (dd < bd) {
            bd = dd;
            best = nme;
          }
        }
        for (const o of out) o[1] *= 1 - near;
        out.push([`${best}${S}`, fw * near]);
      }
      return out;
    }
  });

  /* Fingers */
  for (const f of FINGER_NAMES) {
    const D = DIGITS[f];
    const [l0, l1, l2] = D.len;
    const [r0, r1, r2] = D.r;
    const j1 = l0;
    const j2 = l0 + l1;
    const L = l0 + l1 + l2;
    const o = H(D.mcp[0], D.mcp[1], D.mcp[2]);
    const rings = [
      [-0.011, r0 * 0.86, 0.8], [0.001, r0 * 1.0, 0.86], [l0 * 0.52, r0 * 0.95, 0.86],
      [j1 - 0.0015, r1 * 1.04, 0.86], [j1 + 0.0035, r1 * 1.0, 0.86], [j1 + l1 * 0.55, r1 * 0.96, 0.86],
      [j2 - 0.001, r2 * 1.04, 0.86], [j2 + l2 * 0.42, r2 * 1.0, 0.83],
      [j2 + l2 * 0.8, r2 * 0.88, 0.8], [L - 0.0014, r2 * 0.45, 0.8], [L, 0, 0]
    ].map(([t, r, th]) => [t * hs, r * hs, th]);
    const shape = (tt, sa) => {
      const t = tt / hs;
      let x = 0;
      if (sa > 0) {
        // Knuckles on the back
        const k = sa * sa;
        x += k * (0.0016 * gauss(t, 0.005) + 0.0011 * gauss(t - j1, 0.0035) + 0.0006 * gauss(t - j2, 0.0026));
      } else {
        const k = sa * sa;
        // Pads between the joints, the fingertip's the fullest; creases at the joints
        x += k * (0.0007 * gauss(t - l0 * 0.55, l0 * 0.28) + 0.0006 * gauss(t - j1 - l1 * 0.5, l1 * 0.28) +
          0.0011 * gauss(t - j2 - l2 * 0.55, l2 * 0.3));
        x -= k * (0.0006 * gauss(t - j1, 0.0016) + 0.0005 * gauss(t - j2, 0.0014));
      }
      return x * hs;
    };
    const tint = (tt, sa) => {
      const t = tt / hs;
      if (sa < -0.3) return t > j2 + l2 * 0.4 ? [1.04, 0.93, 0.92] : palmTint;
      const kn = sa > 0.3 ? 1 - 0.05 * (gauss(t - j1, 0.004) + gauss(t - j2, 0.003)) : 1;
      return [tintSkin[0] * kn, tintSkin[1] * kn, tintSkin[2] * kn];
    };
    const base = baseBone(f);
    const surf = digitTube(b, {
      o, axis: [0, -1, 0], U: [0, 0, 1], V: Hv(1, 0, 0), rings, cols: 6, tint, shape, glove, pad: gpad,
      weight: (tt) => {
        const t = tt / hs;
        const k1 = sstep(-0.006, 0.003, t);
        const k2 = sstep(j1 - 0.003, j1 + 0.003, t);
        const k3 = sstep(j2 - 0.0025, j2 + 0.0025, t);
        return [[base, 1 - k1], [fingerBone(f, 0), k1 * (1 - k2)], [fingerBone(f, 1), k2 * (1 - k3)], [fingerBone(f, 2), k3]];
      }
    });
    if (!glove) nail(b, { surf, o, axis: [0, -1, 0], t0: (j2 + l2 * 0.3) * hs, t1: (j2 + l2 * 0.88) * hs, half: 0.8, bone: fingerBone(f, 2), hs });
  }

  /* Thumb: metacarpal, proximal and distal phalanx along its own axis */
  {
    const T = THUMB;
    const [l0, l1, l2] = T.len;
    const [r0, r1, r2] = T.r;
    const j1 = l0;
    const j2 = l0 + l1;
    const L = l0 + l1 + l2;
    const o = H(...T.cmc);
    const axis = Hv(...T.dir);
    const U = Hv(...T.axis);
    const V = Hv(...T.pad).map((v) => -v);
    const rings = [
      [-0.008, r0 * 0.8, 0.8], [0.005, r0 * 1.0, 0.86], [l0 * 0.58, r0 * 0.95, 0.84], [j1 - 0.002, r1 * 1.08, 0.84],
      [j1 + 0.005, r1 * 1.0, 0.82], [j1 + l1 * 0.55, r1 * 0.95, 0.82], [j2 - 0.001, r2 * 1.05, 0.8],
      [j2 + l2 * 0.42, r2 * 1.02, 0.78], [j2 + l2 * 0.8, r2 * 0.88, 0.76],
      [L - 0.0014, r2 * 0.45, 0.76], [L, 0, 0]
    ].map(([t, r, th]) => [t * hs, r * hs, th]);
    const surf = digitTube(b, {
      o, axis, U, V, rings, cols: 6, glove, pad: gpad,
      tint: (tt, sa) => (sa < -0.3 ? (tt / hs > j2 + l2 * 0.4 ? [1.04, 0.93, 0.92] : palmTint) : tintSkin),
      shape: (tt, sa) => {
        const t = tt / hs;
        const k = sa * sa;
        if (sa > 0) return k * (0.0012 * gauss(t - j1, 0.004) + 0.0007 * gauss(t - j2, 0.003)) * hs;
        return k * (0.0012 * gauss(t - j2 - l2 * 0.55, l2 * 0.3) + 0.0006 * gauss(t - j1 - l1 * 0.5, l1 * 0.3) -
          0.0006 * gauss(t - j2, 0.0016)) * hs;
      },
      weight: (tt) => {
        const t = tt / hs;
        const k1 = sstep(0.0, 0.012, t);
        const k2 = sstep(j1 - 0.004, j1 + 0.004, t);
        const k3 = sstep(j2 - 0.003, j2 + 0.003, t);
        return [[`hand${S}`, 1 - k1], [`thumb${S}`, k1 * (1 - k2)], [`thumbMid${S}`, k2 * (1 - k3)], [`thumbTip${S}`, k3]];
      }
    });
    if (!glove) nail(b, { surf, o, axis, t0: (j2 + l2 * 0.3) * hs, t1: (j2 + l2 * 0.88) * hs, half: 0.84, bone: `thumbTip${S}`, hs });
    // The ball of the thumb over the metacarpal, stretching as the thumb moves
    const ax = new THREE.Vector3(...T.dir);
    const cmc = new THREE.Vector3(...T.cmc);
    const bz = new THREE.Vector3(0, 0, 1).addScaledVector(ax, -ax.z).normalize();
    const bx = new THREE.Vector3().crossVectors(ax, bz).negate();
    const ballC = cmc.clone().addScaledVector(ax, 0.019).addScaledVector(new THREE.Vector3(...T.pad), 0.0035).add(new THREE.Vector3(0.003, 0, -0.008));
    blob(b, {
      c: H(ballC.x, ballC.y, ballC.z), r: [0.0148 * hs, 0.0285 * hs, 0.0168 * hs], n: [2, 2], cols: 6, rows: 4,
      region: REG, mat: MT, tint: gt(palmTint),
      warp: (p) => {
        // Lay the ball's long axis along the metacarpal
        const q = [(p[0] - W.x) * s / hs - ballC.x, (p[1] - W.y) / hs - ballC.y, (p[2] - W.z) / hs - ballC.z];
        const w = ballC.clone().addScaledVector(bx, q[0]).addScaledVector(ax, -q[1]).addScaledVector(bz, q[2]);
        return H(w.x, w.y, w.z);
      },
      weight: (p) => {
        const q = new THREE.Vector3((p[0] - W.x) * s / hs, (p[1] - W.y) / hs, (p[2] - W.z) / hs).sub(cmc);
        const along = q.dot(ax);
        // Towards the palm's middle it stays with the hand; along the metacarpal it follows the thumb
        const inner = sstep(0.004, -0.012, q.z);
        const k = sstep(-0.004, 0.03, along) * (1 - 0.6 * inner) * 0.85;
        return [[`hand${S}`, 1 - k], [`thumb${S}`, k]];
      }
    });
    // The web between thumb and index: thin, tapering, stretched between the two
    const mcpT = cmc.clone().addScaledVector(ax, l0 * 0.92);
    const idx = new THREE.Vector3(DIGITS.index.mcp[0] - 0.003, DIGITS.index.mcp[1] + 0.012, DIGITS.index.mcp[2] + 0.004);
    const webC = mcpT.clone().lerp(idx, 0.5);
    const webDir = idx.clone().sub(mcpT);
    const webLen = webDir.length();
    webDir.normalize();
    blob(b, {
      c: H(webC.x, webC.y, webC.z), r: [0.0052 * hs, 0.0085 * hs, (webLen * 0.5 + 0.004) * hs], n: [2, 2], cols: 6, rows: 3,
      region: REG, mat: MT, tint: gt(tintSkin),
      warp: (p) => {
        // Turn the blob's z axis onto the thumb→index line, thinning towards the free edge
        const q = new THREE.Vector3((p[0] - W.x) * s / hs - webC.x, (p[1] - W.y) / hs - webC.y, (p[2] - W.z) / hs - webC.z);
        const zA = webDir;
        const yA = new THREE.Vector3(0, 1, 0).addScaledVector(zA, -zA.y).normalize();
        const xA = new THREE.Vector3().crossVectors(yA, zA);
        const taper = 1 - 0.45 * sstep(0, -0.008, q.y);
        const w = webC.clone().addScaledVector(xA, q.x * taper).addScaledVector(yA, q.y).addScaledVector(zA, q.z);
        return H(w.x, w.y, w.z);
      },
      weight: (p) => {
        const q = new THREE.Vector3((p[0] - W.x) * s / hs, (p[1] - W.y) / hs, (p[2] - W.z) / hs).sub(mcpT);
        const k = THREE.MathUtils.clamp(q.dot(webDir) / webLen, 0, 1);
        const kt = sstep(0.85, 0.1, k);
        return [[`hand${S}`, 1 - kt], [`thumb${S}`, kt]];
      }
    });
  }
}

/* ------------------------------------------------------------ shoes */

/** A shoe as a tube along +Z; the sole edge is a crisp column pair. */
export function buildShoe(b, ctx, side) {
  const { joints, outfit, res } = ctx;
  const S = side > 0 ? 'L' : 'R';
  const A = joints[`foot${S}`];
  const def = outfit.shoeDef;
  const keys = profile([
    // z (from the ankle), half width, height, toe spring
    [-0.074, 0.008, 0.032, 0], [-0.07, 0.03, 0.07, 0], [-0.058, 0.04, 0.094, 0], [-0.035, 0.044, 0.104, 0],
    [0.0, 0.046, 0.1, 0], [0.04, 0.048, 0.088 * def.height, 0], [0.09, 0.051, 0.07 * def.height, 0.001],
    [0.13, 0.052, 0.06 * def.height, 0.003], [0.165, 0.049, 0.055 * def.height, 0.006],
    // A round, soft toe box closing to a point (no pinched tip)
    [0.188, 0.043, 0.05, 0.009], [0.201, 0.033, 0.045, 0.0105], [0.209, 0.02, 0.039, 0.0115], [0.2135, 0.003, 0.032, 0.012]
  ]);
  const zs = res.high
    ? [-0.074, -0.068, -0.054, -0.03, 0.01, 0.06, 0.11, 0.15, 0.178, 0.195, 0.205, 0.211, 0.2135]
    : [-0.074, -0.04, 0.08, 0.19, 0.2135];
  const soleA = 0.32;
  const nUp = res.high ? 8 : 3;
  const nSole = res.high ? 3 : 1;
  const e = 2.6;
  const section = (hw, h) => {
    const up = [];
    for (let k = 0; k <= nUp; k++) {
      const a = -soleA + (k / nUp) * (Math.PI + 2 * soleA);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e) * hw * (1 + 0.06 * Math.max(0, -sa) / Math.sin(soleA));
      const y = sa >= 0 ? 0.016 + (h - 0.016) * Math.pow(sa, 2 / e) : 0.016 + sa * 0.03;
      up.push({ x, y, sole: false, top: sa });
    }
    const first = up[0];
    const last = up[up.length - 1];
    const sole = [{ x: last.x, y: last.y, sole: true }];
    for (let k = 1; k < nSole; k++) {
      const u = k / nSole;
      sole.push({ x: lerp(last.x, first.x, u) * (1 - 0.15 * Math.sin(u * Math.PI)), y: 0.0, sole: true });
    }
    sole.push({ x: first.x, y: first.y, sole: true });
    return up.concat(sole);
  };
  const scaleZ = def.length / 0.286;
  const pts = [];
  let cols = 0;
  for (const z0 of zs) {
    const [hw, h, toeUp] = keys(z0);
    const sec = section(hw * def.width, h);
    cols = sec.length;
    const z = z0 * scaleZ;
    for (const q of sec) {
      const y = q.y + toeUp;
      const x = A.x + q.x + side * 0.08 * (z - 0.02);
      let tint = def.tint(z0, q, y);
      if (!q.sole) tint = mulTint(tint, 1 - 0.12 * gauss(y - 0.016, 0.006));
      pts.push({ p: [x, y, A.z + z], region: REGION.FIXED, tint, mat: q.sole ? MAT.SKIN : def.mat });
    }
  }
  emitGrid(b, {
    pts, rows: zs.length, cols, center: new THREE.Vector3(A.x, 0.04, A.z + 0.06), poles: [0, zs.length - 1],
    weight: (p) => {
      const up = sstep(0.085, 0.115, p[1]) * 0.35;
      return [[`foot${S}`, 1 - up], [`shin${S}`, up]];
    }
  });
}

/* ------------------------------------------------------------ extras */

/** Small closed blob for buttons, pockets, cups etc. */
export function addBlob(b, opts) {
  return blob(b, opts);
}

/**
 * A shirt collar: a closed band sitting on the neckline, its cross-section
 * a folded-over loop, spindled shut at the two collar points in front.
 * `kind` 'fold' (polo/shirt) or 'stand' (jackets).
 */
export function buildCollar(b, ctx, { kind }) {
  const { outfit, res } = ctx;
  const top = outfit.topDef;
  const nk = necklineFn(top.neck);
  const n = res.high ? 16 : 7;
  const gap = kind === 'stand' ? 0.16 : 0.32;
  // Cross-section loop (out from the neckline, up): inner stand, fold, outer leaf
  const loop = kind === 'stand'
    ? [[-0.002, 0.0], [-0.002, 0.03], [0.002, 0.034], [0.0055, 0.03], [0.0055, 0.0]]
    : [[-0.002, -0.002], [-0.002, 0.024], [0.002, 0.029], [0.0075, 0.022], [0.019, 0.002], [0.016, -0.004]];
  const cols = loop.length;
  const pts = [];
  const C = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const th = gap + u * (Math.PI * 2 - 2 * gap);
    const front = Math.pow(Math.max(0, Math.cos(th)), 3);
    const pinch = sstep(0, 0.05, u) * sstep(1, 0.95, u);
    // Sit on the neckline itself; lean the band out along the surface
    const y0 = nk ? nk.y0 - nk.dip(th) : 1.49;
    const base = ctx.torsoAt(y0, th, 0.0005);
    C.set(0, y0, -0.016);
    const out = new THREE.Vector3(base[0], 0, base[2] - C.z).normalize();
    for (let k = 0; k < cols; k++) {
      const [ro, dy] = loop[k];
      const leaf = kind === 'stand' ? 0 : front * sstep(0.006, 0.019, ro) * 0.02;
      const rr = ro * pinch;
      const lean = dy * (kind === 'stand' ? -0.25 : -0.45);
      pts.push({
        p: [base[0] + out.x * (rr + lean), base[1] + dy * (0.35 + 0.65 * pinch) - leaf, base[2] + out.z * (rr + lean)],
        region: top.collarRegion ?? REGION.TOP,
        tint: mulTint(top.collarTint || top.tint, ro > 0.001 ? 1 : 0.8),
        mat: top.mat
      });
    }
  }
  // Rows run along the collar, columns round the cross-section loop
  emitGrid(b, {
    pts, rows: n, cols, center: new THREE.Vector3(0, 1.5, -0.016), poles: [],
    weight: (p) => {
      const k = sstep(1.46, 1.53, p[1]);
      return [['chest', 1 - k * 0.6], ['neck', k * 0.6]];
    }
  });
}

/** A small blob lying on the torso surface at (y, θ), oriented to it. */
function surfaceBlob(b, ctx, { y, th, r, lift = 0, region, tint, mat, weight, n = [2, 2], cols = 6, rows = 3 }) {
  const p0 = ctx.torsoAt(y, th, lift);
  const p1 = ctx.torsoAt(y, th + 0.01, lift);
  const p2 = ctx.torsoAt(y + 0.01, th, lift);
  const T = new THREE.Vector3().subVectors(new THREE.Vector3(...p1), new THREE.Vector3(...p0)).normalize();
  const U = new THREE.Vector3().subVectors(new THREE.Vector3(...p2), new THREE.Vector3(...p0)).normalize();
  const N = new THREE.Vector3().crossVectors(T, U).normalize();
  if (N.dot(new THREE.Vector3(p0[0], 0, p0[2] + 0.01)) < 0) N.negate();
  const O = new THREE.Vector3(...p0);
  const tmp = new THREE.Vector3();
  return blob(b, {
    c: [0, 0, 0], r, n, cols, rows, region, tint, mat, weight,
    warp: (p) => {
      tmp.copy(O).addScaledVector(T, p[0]).addScaledVector(U, p[1]).addScaledVector(N, p[2]);
      return [tmp.x, tmp.y, tmp.z];
    }
  });
}

/** Buttons, zips, pockets, buckles, the apron's straps and skirt. */
export function buildTorsoExtras(b, ctx, sweepFn) {
  const { outfit, res } = ctx;
  const top = outfit.topDef;
  const bot = outfit.bottomDef;
  const { high } = res;
  const tw = (p) => torsoWeights(p);
  if (high && top.buttons) {
    const ys = top.buttons === 2 ? [1.425, 1.385] : Array.from({ length: top.buttons }, (_, i) => 1.4 - i * 0.075);
    for (const y of ys) {
      surfaceBlob(b, ctx, { y, th: 0, r: [0.0042, 0.0042, 0.0016], lift: 0.0002, region: REGION.TOP, tint: [0.78, 0.78, 0.78], mat: MAT.GLOSS, weight: tw, cols: 5, rows: 2 });
    }
  }
  if (top.placket && high) {
    // Button stand: a flat strip down the front, a shade darker at its edges
    const nk = necklineFn(top.neck);
    const yTop = (nk ? nk.y0 - nk.dip(0) : 1.45) - 0.004;
    const yBot = top.buttons === 2 ? 1.36 : top.tucked ? bot.waist + 0.004 : top.hem + 0.01;
    const path = [];
    for (let k = 0; k <= 10; k++) path.push(new THREE.Vector3(...ctx.torsoAt(lerp(yTop, yBot, k / 10), 0, 0.0009)));
    sweepFn(b, { path, radius: 0.0105, cols: 4, region: REGION.TOP, tint: [0.93, 0.93, 0.93], mat: top.mat, weight: tw, flat: 0.12 });
  }
  if (ctx.look && ctx.look.shades === 'shirt' && !ctx.crowd) {
    // Sunglasses hooked into the neckline by one arm
    const nk = necklineFn(top.neck);
    const yN = (nk ? nk.y0 - nk.dip(0) : 1.46) - 0.006;
    const dark = [0.035, 0.035, 0.04];
    for (const s of [1, -1]) {
      surfaceBlob(b, ctx, {
        y: yN - 0.026 - s * 0.002, th: s * 0.2, r: [0.0135, 0.0098, 0.0022], n: [3.2, 3.2], lift: 0.0036, region: REGION.FIXED,
        tint: dark, mat: MAT.GLOSS, weight: tw, cols: high ? 8 : 5, rows: high ? 4 : 2
      });
    }
    if (high) {
      surfaceBlob(b, ctx, { y: yN - 0.02, th: 0, r: [0.006, 0.0022, 0.002], lift: 0.004, region: REGION.FIXED, tint: dark, mat: MAT.GLOSS, weight: tw, cols: 5, rows: 2 });
      const arm = [];
      for (let k = 0; k <= 4; k++) arm.push(new THREE.Vector3(...ctx.torsoAt(lerp(yN - 0.018, yN + 0.004, k / 4), lerp(-0.34, -0.2, k / 4), 0.0045 - k * 0.0012)));
      sweepFn(b, { path: arm, radius: 0.0016, cols: 3, region: REGION.FIXED, tint: dark, mat: MAT.GLOSS, weight: tw, flat: 0.6 });
    }
  }
  if (top.zip) {
    const path = [];
    const yTop = top.neck === 'high' ? 1.53 : 1.47;
    for (let k = 0; k <= 12; k++) {
      const y = lerp(top.hem + 0.008, yTop, k / 12);
      path.push(new THREE.Vector3(...ctx.torsoAt(y, 0, 0.0015)));
    }
    sweepFn(b, { path, radius: 0.0026, cols: 4, region: REGION.FIXED, tint: [0.3, 0.3, 0.32], mat: MAT.GLOSS, weight: tw, flat: 0.5 });
  }
  if (top.pockets) {
    for (const s of [1, -1]) {
      surfaceBlob(b, ctx, { y: top.hem + 0.075, th: s * 0.8, r: [0.05, 0.035, 0.007], n: [3, 3], lift: -0.002, region: REGION.TOP, tint: [0.9, 0.9, 0.9], mat: MAT.CLOTH, weight: tw, cols: high ? 8 : 5, rows: high ? 4 : 3 });
      if (top.flaps) {
        surfaceBlob(b, ctx, { y: top.hem + 0.105, th: s * 0.8, r: [0.053, 0.012, 0.008], n: [3, 3], lift: 0.0, region: REGION.TOP, tint: [0.8, 0.8, 0.8], mat: MAT.CLOTH, weight: tw, cols: high ? 8 : 5, rows: 3 });
      }
      if (top.flaps && high) {
        surfaceBlob(b, ctx, { y: 1.28, th: s * 0.55, r: [0.04, 0.03, 0.006], n: [3, 3], lift: -0.002, region: REGION.TOP, tint: [0.9, 0.9, 0.9], mat: MAT.CLOTH, weight: tw, cols: 6, rows: 3 });
      }
    }
  }
  if (top.tucked && bot.belt && high) {
    surfaceBlob(b, ctx, { y: bot.waist - 0.015, th: 0, r: [0.017, 0.013, 0.0035], n: [4, 4], lift: 0.0035, region: REGION.FIXED, tint: [0.5, 0.38, 0.16], mat: MAT.GLOSS, weight: tw, cols: 8, rows: 4 });
  }
  if (top.apron) {
    // Neck strap from the bib's top corners round the back of the neck
    const path = [];
    for (let k = 0; k <= 14; k++) {
      const u = k / 14;
      const th = lerp(0.62, Math.PI * 2 - 0.62, u);
      const y = lerp(1.33, 1.49, Math.sin(u * Math.PI) ** 0.5);
      const p = ctx.torsoAt(Math.min(y, 1.47), th, 0.004);
      if (y > 1.47) {
        const c = Math.cos(th);
        const s = Math.sin(th);
        p[0] = s * 0.066;
        p[2] = -0.02 + c * 0.064;
        p[1] = y;
      }
      path.push(new THREE.Vector3(...p));
    }
    sweepFn(b, { path, radius: 0.006, cols: high ? 5 : 4, region: REGION.ACCENT, tint: [0.92, 0.92, 0.92], mat: MAT.CLOTH, weight: tw, flat: 0.35 });
    // Waist ties round the back
    const tie = [];
    for (let k = 0; k <= 12; k++) {
      const th = lerp(1.15, Math.PI * 2 - 1.15, k / 12);
      tie.push(new THREE.Vector3(...ctx.torsoAt(0.99, th, 0.003)));
    }
    sweepFn(b, { path: tie, radius: 0.007, cols: 4, region: REGION.ACCENT, tint: [0.92, 0.92, 0.92], mat: MAT.CLOTH, weight: tw, flat: 0.3 });
    // The skirt: a stiff slab in front of the thighs, skinned to follow them
    const front = ctx.torsoAt(0.92, 0, 0)[2];
    blob(b, {
      c: [0, 0.7, front + 0.004], r: [0.185, 0.235, 0.006], n: [4, 4], cols: high ? 12 : 6, rows: high ? 7 : 4,
      region: REGION.ACCENT, tint: (p) => [1, 1, 1].map((v) => v * (0.9 + 0.1 * sstep(0.45, 0.9, p[1]))), mat: MAT.CLOTH,
      warp: (p) => {
        const x = p[0];
        const y = p[1];
        const k = sstep(0.92, 0.5, y);
        const z = p[2] - (x / 0.185) ** 2 * (0.03 + 0.02 * (1 - k)) - k * 0.012 + (high ? 0.0025 * Math.sin(x * 60) * k : 0);
        return [x * (1 + 0.06 * k), y, z];
      },
      weight: (p) => {
        const k = sstep(0.93, 0.68, p[1]);
        const l = sstep(-0.07, 0.07, p[0]);
        return [['hips', 1 - k], ['thighL', k * l], ['thighR', k * (1 - l)]];
      }
    });
  }
}
