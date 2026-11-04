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

export const REGION = { SKIN: 0, HAIR: 1, TOP: 2, BOTTOM: 3, ACCENT: 4, FIXED: 5 };
export const MAT = { SKIN: 0, CLOTH: 1, GLOSS: 2, LAME: 3 };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function sstep(a, b, x) {
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

const NB = 64;

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
      quads.push([idx(i, j), idx(i, j + 1), idx(i + 1, j), idx(i + 1, j + 1), i, j]);
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
  for (const [a, bb, c, d, i, j] of quads) {
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
    void i;
    void j;
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
    [1.443, 0.163, 0.07, 0.08, -0.02, 2.45],
    [1.465, 0.136, 0.063, 0.073, -0.022, 2.35],
    [1.485, 0.103, 0.06, 0.067, -0.022, 2.2],
    [1.505, 0.077, 0.059, 0.063, -0.02, 2.05],
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
  const waist = bot.waist;
  const hemY = top.tucked ? waist : top.hem;
  bands.push({ from: 0.785, to: Math.min(hemY, waist), region: REGION.BOTTOM, mat: bot.mat, off: bot.off, tint: bot.tint });
  if (top.tucked && bot.belt) {
    bands[0].to = waist - 0.03;
    bands.push({ from: waist - 0.03, to: waist, region: REGION.FIXED, mat: MAT.SKIN, off: bot.off + 0.003, tint: [0.12, 0.075, 0.05], lip: false });
  }
  // The top garment, split into its trims and panels
  const topBand = (from, to, extra = {}) => ({ from, to, region: REGION.TOP, mat: top.mat, off: top.off, tint: top.tint, ...extra });
  const cuts = [hemY];
  const marks = [];
  if (top.hemBand) marks.push([hemY, hemY + 0.04, { tint: [0.88, 0.88, 0.88], off: top.off + 0.0012, lip: false }]);
  if (top.lame) marks.push([hemY + 0.035, 1.43, { region: REGION.FIXED, mat: MAT.LAME, tint: [0.6, 0.62, 0.64], off: top.off + 0.0012, lip: false }]);
  if (top.chestStripe) marks.push([1.205, 1.232, { region: REGION.ACCENT, tint: [1, 1, 1], off: top.off, lip: false }]);
  if (top.apron) marks.push([hemY + 0.0005, 1.33, { apron: true }]);
  if (top.trim) marks.push([yNeck - 0.016, yNeck, { region: REGION.ACCENT, tint: [1, 1, 1], off: top.off + 0.0006, lip: false }]);
  marks.sort((a, b) => a[0] - b[0]);
  let cur = hemY;
  for (const [f, t, extra] of marks) {
    if (f > cur + 1e-4) bands.push(topBand(cur, f));
    bands.push(topBand(Math.max(f, cur), t, extra));
    cur = t;
  }
  void cuts;
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
      const th = thetas[j].th;
      let region = r.region;
      let mat = r.mat;
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
      if (region !== REGION.SKIN && region !== REGION.BOTTOM && !top.tucked && r.t < 1.2) off += 0.009 * sstep(top.hem + 0.12, top.hem, r.t);
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
  ao *= 1 - 0.08 * gauss(y - 0.79, 0.025);
  ao *= 1 - 0.12 * gauss(y - 1.47, 0.03);
  if (region === REGION.SKIN && y > 1.47) ao *= 1 - 0.1 * sstep(1.5, 1.58, y) * Math.max(0, Math.cos(th));
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
  [-0.047, 0.003, 1, 1], [-0.043, 0.02, 1, 1], [-0.034, 0.034, 1, 1], [-0.021, 0.044, 1, 1],
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
      let off = r.off;
      if (clothed) {
        // Sleeves hang a little looser below the shoulder and crease at the elbow
        off += 0.004 * sstep(0.02, 0.1, d) * (top.sleeveLoose ?? 1);
        if (res.high && r.lip === 0) off += 0.0018 * Math.sin(d * 230 + th) * gauss(d - 0.29, 0.03) * Math.max(0, c + 0.3);
      }
      const R = rad + off;
      const x = J.x + Math.sin(th) * R * fx;
      const z = J.z + c * R * fz;
      let tint = r.tint;
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
      const d = q.d;
      const fore = sstep(0.258, 0.322, d);
      const hand = sstep(0.528, 0.572, d);
      // The lower forearm rolls with the twist bone (half the hand's twist)
      const tw = sstep(0.33, 0.53, d);
      return [[`upperArm${S}`, 1 - fore], [`forearm${S}`, fore * (1 - hand) * (1 - tw)],
        [`forearmTwist${S}`, fore * (1 - hand) * tw], [`hand${S}`, fore * hand]];
    }
  });
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
  const legEnd = bot.legEnd;
  bands.push({ from: -0.075, to: legEnd, region: REGION.BOTTOM, mat: bot.mat, off: bot.off, tint: bot.tint });
  if (bot.sock) {
    bands.push({ from: legEnd, to: bot.sock.end, region: bot.sock.region, mat: MAT.CLOTH, off: 0.0015, tint: bot.sock.tint });
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
      let off = r.off;
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
      let tint = r.tint;
      if (r.lip === 2) tint = mulTint(r.tint, 0.92);
      const ao = 1 - 0.22 * gauss(d + 0.03, 0.05) * Math.max(0, -s * 0.8 + 0.3) - 0.12 * gauss(d - 0.43, 0.03) * Math.max(0, -c);
      tint = mulTint(tint, ao);
      if (clothed && bot.seam) tint = mulTint(tint, 1 + 0.12 * gauss(Math.sin(th) * side - 1, 0.12));
      pts.push({ p: [H.x + Math.sin(th) * R * fx, H.y - d, H.z + c * R * fz], region: r.region, tint, mat: r.mat, d });
    }
  }
  emitGrid(b, {
    pts, rows: rings.length, cols, center: new THREE.Vector3(H.x, H.y - 0.4, H.z), poles: [0, rings.length - 1],
    weight: (p, q) => {
      const d = q.d;
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

/** A finger/thumb: a rounded tube from `start` along `dir`. */
function digit(b, { start, dir, len, r, cols, region, tint, mat, weight, knuckle = 0.4, rings: nr }) {
  const D = new THREE.Vector3(...dir).normalize();
  const up = Math.abs(D.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const U = new THREE.Vector3().crossVectors(D, up).normalize();
  const V = new THREE.Vector3().crossVectors(U, D).normalize();
  const S = new THREE.Vector3(...start);
  const prof = nr === 'low'
    ? [[-0.1, 0.85], [0.5, 0.95], [1.0, 0.0]]
    : [[-0.12, 0.85], [0.0, 1.04], [knuckle, 1.0], [0.82, 0.93], [0.93, 0.8], [0.985, 0.45], [1.0, 0.0]];
  const pts = [];
  for (const [t, k] of prof) {
    const capT = t >= 1 ? len * 1.0 : t * len;
    for (let j = 0; j < cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      const rr = r * k;
      const p = S.clone().addScaledVector(D, capT).addScaledVector(U, Math.cos(a) * rr).addScaledVector(V, Math.sin(a) * rr * 0.88);
      pts.push({ p: [p.x, p.y, p.z], region, tint, mat, t: capT / len });
    }
  }
  return emitGrid(b, {
    pts, rows: prof.length, cols, center: S.clone().addScaledVector(D, len * 0.5), poles: [prof.length - 1],
    weight
  });
}

/** Hand with four fingers and a thumb (high) or a mitten (low). */
export function buildHand(b, ctx, side) {
  const { joints, res, build } = ctx;
  const S = side > 0 ? 'L' : 'R';
  const W = joints[`hand${S}`];
  const s = side;
  const hs = build.hand;
  const skin = REGION.SKIN;
  const tintPalm = [1.0, 0.97, 0.95];
  const T = joints[`thumb${S}`];
  if (!res.high) {
    // Low detail: palm and fingers in one mitten, plus a thumb
    blob(b, {
      c: [W.x, W.y - 0.085 * hs, W.z + 0.002], r: [0.015 * hs, 0.085 * hs, 0.042 * hs], n: [2.6, 2.6],
      cols: 5, rows: 3, region: skin, mat: MAT.SKIN, tint: tintPalm,
      weight: (p) => {
        const dy = W.y - p[1];
        const f = sstep(0.004, 0.02, dy);
        const g = sstep(0.08 * hs, 0.12 * hs, dy);
        return [[`forearm${S}`, 1 - f], [`hand${S}`, f * (1 - g)], [`fingers${S}`, f * g]];
      }
    });
  } else {
    // Palm, slightly paler on the inside
    blob(b, {
      c: [W.x + s * 0.001, W.y - 0.05 * hs, W.z + 0.001], r: [0.0158 * hs, 0.054 * hs, 0.0435 * hs], n: [3.2, 3.4],
      cols: 12, rows: 6, region: skin, mat: MAT.SKIN,
      warp: (p, v) => {
        // Taper to the wrist at the top, flare to the knuckles at the bottom
        const k = 1 - 0.22 * sstep(0.45, 0.0, v);
        return [W.x + (p[0] - W.x) * (0.85 + 0.15 * k), p[1], W.z + (p[2] - W.z) * k];
      },
      tint: (p) => ((p[0] - W.x) * s > 0.004 ? [1.0, 0.98, 0.97] : tintPalm),
      weight: (p) => {
        const dy = W.y - p[1];
        const f = sstep(0.004, 0.02, dy);
        const g = sstep(0.075 * hs, 0.092 * hs, dy) * 0.35;
        const out = [[`forearm${S}`, 1 - f], [`hand${S}`, f * (1 - g)]];
        if (g > 0) out.push([p[2] > W.z + 0.016 ? `index${S}` : `fingers${S}`, f * g]);
        return out;
      }
    });
    const fingers = [
      // z offset, knuckle drop, length, radius, bone
      [0.0275, 0.0, 0.066, 0.0108, 'index'],
      [0.0092, 0.003, 0.071, 0.0112, 'fingers'],
      [-0.0095, 0.002, 0.067, 0.0107, 'fingers'],
      [-0.0272, -0.006, 0.055, 0.0096, 'fingers']
    ];
    for (const [z, drop, len, r, bone] of fingers) {
      const ky = W.y - (0.094 + drop) * hs;
      const startY = W.y - (0.08 + drop) * hs;
      const kneeD = 0.04 * hs;
      digit(b, {
        start: [W.x - s * 0.002, startY, W.z + z * hs], dir: [-s * 0.04, -1, z * 0.06], len: len * hs + (startY - ky),
        r: r * hs, cols: 5, region: skin, mat: MAT.SKIN, tint: [1.0, 0.95, 0.93], knuckle: 0.42,
        weight: (p) => {
          const dy = ky - p[1];
          const f1 = sstep(-0.006, 0.006, dy);
          const f2 = sstep(kneeD - 0.005, kneeD + 0.005, dy);
          return [[`hand${S}`, 1 - f1], [`${bone}${S}`, f1 * (1 - f2)], [`${bone}Tip${S}`, f1 * f2]];
        }
      });
    }
    // The ball of the thumb
    blob(b, {
      c: [T.x + s * 0.003, T.y - 0.016 * hs, T.z - 0.006], r: [0.0125 * hs, 0.026 * hs, 0.013 * hs], n: [2, 2],
      cols: 6, rows: 4, region: skin, mat: MAT.SKIN, tint: tintPalm,
      weight: () => [[`hand${S}`, 0.6], [`thumb${S}`, 0.4]]
    });
  }
  digit(b, {
    start: [T.x, T.y - 0.006, T.z], dir: [-s * 0.3, -0.85, 0.42], len: 0.058 * hs, r: 0.0118 * hs,
    cols: res.high ? 5 : 4, region: skin, mat: MAT.SKIN, tint: [1.0, 0.95, 0.93], knuckle: 0.45, rings: res.high ? null : 'low',
    weight: (p) => {
      const d = Math.hypot(p[0] - T.x, p[1] - T.y, p[2] - T.z);
      const f = sstep(0.004, 0.016, d);
      return [[`hand${S}`, 1 - f], [`thumb${S}`, f]];
    }
  });
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
    [0.13, 0.052, 0.06 * def.height, 0.003], [0.165, 0.048, 0.054 * def.height, 0.006],
    [0.19, 0.038, 0.047, 0.009], [0.205, 0.024, 0.038, 0.011], [0.212, 0.006, 0.03, 0.012]
  ]);
  const zs = res.high
    ? [-0.074, -0.068, -0.054, -0.03, 0.01, 0.06, 0.11, 0.155, 0.188, 0.206, 0.212]
    : [-0.074, -0.04, 0.08, 0.19, 0.212];
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
  const n = res.high ? 22 : 9;
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
  const high = res.high;
  const tw = (p) => torsoWeights(p);
  if (high && top.buttons) {
    const ys = top.buttons === 2 ? [1.425, 1.385] : Array.from({ length: top.buttons }, (_, i) => 1.4 - i * 0.075);
    for (const y of ys) {
      surfaceBlob(b, ctx, { y, th: 0, r: [0.0042, 0.0042, 0.0016], lift: 0.0002, region: REGION.TOP, tint: [0.78, 0.78, 0.78], mat: MAT.GLOSS, weight: tw, cols: 6, rows: 3 });
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
      c: [0, 0.7, front + 0.004], r: [0.185, 0.235, 0.006], n: [4, 4], cols: high ? 14 : 6, rows: high ? 10 : 4,
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
