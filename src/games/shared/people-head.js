/**
 * Pekkas Pokal — people: the head. Skull, face, eyes and lids, brows, a
 * mouth that really opens, ears, hair styles, facial hair, glasses and
 * hats.
 *
 * The head is sculpted as a signed distance field — smooth unions of a
 * dozen ellipsoids (cranium, jaw, cheekbones, chin, brow ridge, nose,
 * lips) minus two eye sockets — and a ring grid is shrink-wrapped onto it.
 * The grid is a "capsule" map: a top cap and a bottom cap of rays from two
 * points on the vertical axis, and between them a band of HORIZONTAL rays,
 * so the eye line and the mouth line are exact grid rows. The mouth row is
 * split between the two lips, which is what lets the jaw open a real hole;
 * a dark mouth bag and two rows of teeth sit behind it. Normals come from
 * the field's gradient, so the face shades smoothly at modest resolution.
 *
 * Everything in this file is in head space: metres relative to the head
 * centre C (between the ears, at eye height), in the 1.80 m model.
 */
import * as THREE from 'three';
import { REGION, MAT, emitGrid, sstep, clamp, gauss, lerp, noise3, addBlob } from './people-build.js';
import { FACE } from './people-rig.js';

/* ------------------------------------------------------------ SDF */

function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx;
  const py = (y - cy) / ry;
  const pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const k1 = Math.sqrt((px * px) / (rx * rx) + (py * py) / (ry * ry) + (pz * pz) / (rz * rz));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
/** Ellipsoid with different radii above/below and in front of/behind its centre. */
function ell2(x, y, z, cx, cy, cz, rx, ryUp, ryDown, rzFront, rzBack) {
  return ell(x, y, z, cx, cy, cz, rx, y > cy ? ryUp : ryDown, z > cz ? rzFront : rzBack);
}
function sph(x, y, z, cx, cy, cz, r) {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) - r;
}
function cap(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
  const pax = x - ax;
  const pay = y - ay;
  const paz = z - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return Math.sqrt((pax - bax * h) ** 2 + (pay - bay * h) ** 2 + (paz - baz * h) ** 2) - lerp(ra, rb, h);
}
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a, b, k) {
  return -smin(-a, -b, k);
}

export { FACE };

/** Build the head field for a person's face parameters. */
export function headField(F) {
  const ex = FACE.eyeX;
  const ey = FACE.eyeY;
  const ez = FACE.eyeZ;
  const { nose } = F;
  const my = FACE.mouthY;
  const nl = 0.006 * (F.noseLen - 1);
  // Extended likeness knobs (all default to 1, jawSq to 0.5)
  const faceL = F.faceL ?? 1;
  const noseW = F.noseW ?? 1;
  const jawSq = F.jawSq ?? 0.5;
  const cb = F.cheekbone ?? 1;
  const cs = 0.075 * (faceL - 1);
  const sdf = (x, y, z) => {
    // Cranium and the block of the face: a broad, round skull over a
    // compact lower face (the toy proportions read friendly at any size)
    const ax = Math.abs(x);
    // The skull: a short occiput that curves down and in towards the neck,
    // and a forehead that slopes back from the brow
    let d = ell2(x, y, z, 0, 0.02, -0.012, 0.0835 * F.headW, 0.097, 0.084, 0.095, 0.087 * F.headL);
    d = smin(d, ell(x, y, z, 0, 0.045, 0.019, 0.064 * F.headW, 0.05, 0.058), 0.03);
    d = smin(d, ell(x, y, z, 0, -0.024 - cs * 0.4, 0.035, 0.067 * F.cheek, 0.07 + cs * 0.4, 0.057), 0.036);
    // The jaw: a clear lower edge rising from the chin to the angle of the
    // jaw below the ear, so the neck reads under it
    const jy = -0.057 - 0.008 * (F.jaw - 1) - cs * 0.7;
    d = smin(d, ell(x, y, z, 0, jy, 0.027, 0.053 * F.jaw ** 1.5, 0.038 * F.jaw, 0.055), 0.024);
    if (jawSq > 0.05) {
      const gk = 0.55 + 0.45 * jawSq;
      d = smin(d, ell(ax, y, z, 0.044 * F.jaw * (1 + 0.05 * jawSq), jy - 0.006, -0.008, 0.013 * gk, 0.014 * gk, 0.018 * gk), 0.014);
    }
    d = smin(d, ell(x, y, z, 0, -0.0815 - cs, 0.064 + 0.004 * (F.chin - 1), 0.0255 * F.chin * (1 + 0.12 * (jawSq - 0.5)), 0.0192, 0.0225 * F.chin), 0.019);
    // Brow ridge: soft, a little stronger over the outer eye
    d = smin(d, ell(x, y, z, 0, 0.0305, 0.07, 0.062, 0.0125 * F.brow, 0.0195), 0.013);
    // Cheekbones and the full, soft pads below them
    d = smin(d, ell(ax, y, z, 0.049 + 0.003 * (cb - 1), -0.011, 0.05 + 0.006 * (cb - 1), 0.025 * cb ** 0.5, 0.015 * cb ** 0.5, 0.023 * cb ** 0.5), 0.016);
    d = smin(d, ell(ax, y, z, 0.036, -0.036, 0.057, 0.0305, 0.0275, 0.027), 0.022);
    // The mouth mound and the lips
    d = smin(d, ell(x, y, z, 0, my + 0.002, 0.069, 0.029, 0.024, 0.024), 0.016);
    // Upper lip with a cupid's bow, fuller lower lip
    d = smin(d, ell(x, y, z, 0, my + 0.0051, 0.0868, 0.0182, 0.0052, 0.0076 * F.lips), 0.0035);
    d = smin(d, ell(ax, y, z, 0.0052, my + 0.0063, 0.0866, 0.0075, 0.0043, 0.0071 * F.lips), 0.003);
    d = smin(d, ell(x, y, z, 0, my - 0.0066, 0.0855, 0.0165, 0.0076 * F.lips, 0.0093 * F.lips), 0.0036);
    // Nose: a soft, short bridge, a round button tip, two small wings
    if (F.sockets !== false) d = smin(d, cap(x, y, z, 0, 0.008, 0.0842, 0, -0.022, 0.1015 + nl, 0.0058, 0.0082 * nose), 0.007);
    else d = smin(d, cap(x, y, z, 0, -0.006, 0.084, 0, -0.022, 0.094, 0.005, 0.0075), 0.008);
    d = smin(d, sph(x, y, z, 0, -0.0272 - 0.004 * (nose - 1), 0.0998 + nl + 0.006 * (nose - 1), 0.0108 * nose ** 1.4 * noseW ** 0.3), 0.0055);
    d = smin(d, sph(ax, y, z, 0.0108 * nose * noseW, -0.0338, 0.0893, 0.0078 * nose * noseW ** 0.5), 0.0055);
    // Eye sockets, just bigger than the lids so the lids frame the eye
    if (F.sockets !== false) {
      d = smax(d, -sph(x, y, z, ex, ey, ez, FACE.eyeR + 0.0019), 0.004);
      d = smax(d, -sph(x, y, z, -ex, ey, ez, FACE.eyeR + 0.0019), 0.004);
    }
    return d;
  };
  const e = 0.0007;
  const normal = (x, y, z, out) => {
    const nx = sdf(x + e, y, z) - sdf(x - e, y, z);
    const ny = sdf(x, y + e, z) - sdf(x, y - e, z);
    const nz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / l;
    out[1] = ny / l;
    out[2] = nz / l;
    return out;
  };
  /**
   * Outermost surface hit along a ray from o: sphere-trace inward from far
   * outside (steps are a fraction of the field value, which only ever
   * underestimates the distance here), then bisect the crossing.
   */
  const project = (ox, oy, oz, dx, dy, dz) => {
    let t = 0.2;
    let prev = t;
    for (let i = 0; i < 200 && t > 0; i++) {
      const v = sdf(ox + dx * t, oy + dy * t, oz + dz * t);
      if (v < 0) {
        let lo = t;
        let hi = prev;
        for (let k = 0; k < 12; k++) {
          const m = (lo + hi) / 2;
          if (sdf(ox + dx * m, oy + dy * m, oz + dz * m) < 0) lo = m;
          else hi = m;
        }
        return (lo + hi) / 2;
      }
      prev = t;
      t -= Math.max(0.0012, v * 0.6);
    }
    return 0.0;
  };
  /** Surface point along a direction from the head centre. */
  const surf = (dx, dy, dz, out) => {
    const l = Math.hypot(dx, dy, dz);
    const t = project(0, 0, 0, dx / l, dy / l, dz / l);
    out[0] = (dx / l) * t;
    out[1] = (dy / l) * t;
    out[2] = (dz / l) * t;
    return out;
  };
  /** Face surface z at (x, y), marching back along −Z. */
  const faceZ = (x, y) => project(x, y, 0, 0, 0, 1);
  return { sdf, normal, project, surf, faceZ };
}

/* ------------------------------------------------------------ face weights */

/**
 * Skin weights for anything on the face (skin, brows, beard, moustache,
 * mouth parts) from one field, so they always move together.
 * `lip` forces the jaw: 1 = lower lip copy, 0 = upper lip copy.
 */
export function faceWeights(p, H, lip) {
  const [x, y, z] = p;
  const ax = Math.abs(x);
  const my = FACE.mouthY;
  const out = [];
  let jaw = Math.max(
    sstep(my + 0.0015, my - 0.0042, y) * (1 - sstep(0.024, 0.05, ax)),
    sstep(-0.074, -0.1, y) * sstep(-0.04, 0.01, z) * (1 - 0.35 * sstep(0.045, 0.075, ax))
  ) * sstep(-0.045, 0.0, z);
  if (lip === 1) jaw = 1;
  if (lip === 0) jaw = 0;
  const cz = H.mouthCornerZ;
  const corner = (sx) => {
    const dx = x - sx * H.mouthHalfW;
    const dy = (y - my) * (y > my ? 0.8 : 1.15);
    const dz = (z - cz) * 0.8;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // From the lip line down the corners' pull ends sooner, so an open mouth
    // drops round (an oval) rather than in a beak-like diamond. Both copies of
    // the lip line get the same weights, so a closed mouth stays sealed.
    const reach = y < my + 0.0008 || (lip !== undefined && y < my + 0.002) ? 0.021 : 0.03;
    return 0.95 * (1 - sstep(0.003, reach, d)) * sstep(0.03, 0.06, z);
  };
  const mL = corner(1);
  const mR = corner(-1);
  const lu = lip === 1 ? 0 : (1 - sstep(0.0, 1.0, Math.hypot(x / 0.022, (y - (my + 0.006)) / 0.009))) * (y > my - 0.0005 ? 1 : 0) * sstep(0.06, 0.08, z);
  const brow = (sx) => {
    const d = Math.hypot((x - sx * 0.034) / 0.03, (y - FACE.browY) / 0.02);
    return (1 - sstep(0.15, 1.0, d)) * sstep(0.004, 0.016, y) * sstep(0.04, 0.07, z);
  };
  const bL = brow(1);
  const bR = brow(-1);
  const neck = sstep(-0.07, -0.115, y) * sstep(0.005, -0.045, z) * (1 - jaw);
  // The mouth corners come first and get the same share on both lips, so a
  // closed mouth stays sealed however the corners move; the rest share what
  // is left.
  const cw = Math.min(0.95, mL + mR);
  const rest = 1 - cw;
  let sum = jaw + lu + bL + bR + neck;
  const k = sum > 1 ? rest / sum : rest;
  sum *= k;
  out.push(['head', rest - sum], ['jaw', jaw * k], ['mouthL', mL], ['mouthR', mR], ['lipUpper', lu * k],
    ['browL', bL * k], ['browR', bR * k], ['neck', neck * k]);
  return out;
}

/* ------------------------------------------------------------ helpers */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A tube swept along a path (open: capped; closed: seam welded). */
export function sweep(b, { path, radius, cols = 6, closed = false, region, tint, mat, weight, flat = 1 }) {
  const n = path.length;
  const T = [];
  for (let i = 0; i < n; i++) {
    const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const c = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T.push(c.clone().sub(a).normalize());
  }
  // Parallel-transported frame
  let N0 = Math.abs(T[0].y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  N0 = N0.sub(T[0].clone().multiplyScalar(N0.dot(T[0]))).normalize();
  const Ns = [N0];
  for (let i = 1; i < n; i++) {
    const prev = Ns[i - 1];
    const nn = prev.clone().sub(T[i].clone().multiplyScalar(prev.dot(T[i]))).normalize();
    Ns.push(nn);
  }
  const pts = [];
  const rows = [];
  const ring = (i, k) => {
    const P = path[i];
    const Nn = Ns[i];
    const B = V(0, 0, 0).crossVectors(T[i], Nn);
    const r = typeof radius === 'function' ? radius(i / (n - 1)) : radius;
    for (let j = 0; j < cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      const p = P.clone().addScaledVector(Nn, Math.cos(a) * r * k).addScaledVector(B, Math.sin(a) * r * k * flat);
      pts.push({ p: [p.x, p.y, p.z], region, tint, mat });
    }
  };
  if (!closed) {
    ring(0, 0);
    rows.push(0);
  }
  for (let i = 0; i < n; i++) ring(i, 1);
  if (closed) ring(0, 1);
  else ring(n - 1, 0);
  const nrows = pts.length / cols;
  // A swept tube is thin: normals point away from each ring's own centre
  return emitTube(b, pts, nrows, cols, closed ? [] : [0, nrows - 1], weight);
}

function emitTube(b, pts, rows, cols, poles, weight) {
  // Normals: from the ring centre outward (robust for thin tubes)
  const out = [];
  for (let i = 0; i < rows; i++) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let j = 0; j < cols; j++) {
      const { p } = pts[i * cols + j];
      cx += p[0];
      cy += p[1];
      cz += p[2];
    }
    cx /= cols;
    cy /= cols;
    cz /= cols;
    out.push([cx, cy, cz]);
  }
  const nf = (p, q) => {
    const c = out[q.row];
    let nx = p[0] - c[0];
    let ny = p[1] - c[1];
    let nz = p[2] - c[2];
    if (nx * nx + ny * ny + nz * nz < 1e-14) {
      const o = out[q.row === 0 ? 1 : q.row - 1];
      nx = c[0] - o[0];
      ny = c[1] - o[1];
      nz = c[2] - o[2];
      if (q.row === 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
    }
    return [nx, ny, nz];
  };
  pts.forEach((q, k) => {
    q.row = Math.floor(k / cols);
  });
  return emitGrid(b, {
    pts, rows, cols, normalFn: nf, center: V(...out[Math.floor(rows / 2)]), poles, weight
  });
}

/* ------------------------------------------------------------ the head */

/** Distribute n columns around the head, denser at the face. */
function headColumns(n, k = 0.55) {
  const out = [];
  for (let j = 0; j < n; j++) {
    const u = j / n;
    out.push(2 * Math.PI * (u - (k * Math.sin(2 * Math.PI * u)) / (2 * Math.PI)));
  }
  return out;
}

/**
 * The skin of the head, with the mouth slit, plus mouth bag and teeth.
 * Returns facts later parts need (mouth corner positions etc.).
 */
export function buildHeadSkin(b, ctx) {
  const { field, res, toModel, face } = ctx;
  const { high } = res;
  const phis = headColumns(high ? 44 : 12, high ? 0.7 : 0.45);
  const cols = phis.length;
  const yTop = 0.035;
  const yBot = -0.096;
  const topA = high ? [0, 19, 38, 56, 73] : [0, 32, 62];
  const my = FACE.mouthY;
  const band = high
    ? [0.035, 0.024, 0.016, 0.01, 0.005, 0.0, -0.006, -0.013, -0.019, -0.025, -0.0305, -0.0345, -0.0378, -0.041, -0.047, -0.054,
      my + 0.0075, my + 0.0035, my, my - 0.0035, my - 0.009, my - 0.017, -0.096]
    : [0.035, 0.008, -0.02, -0.045, -0.068, -0.096];
  const botA = high ? [107, 128, 152, 180] : [135, 180];
  const rowsDef = [
    ...topA.map((a) => ({ kind: 'top', a: (a * Math.PI) / 180 })),
    ...band.map((y) => ({ kind: 'band', y })),
    ...botA.map((a) => ({ kind: 'bot', a: (a * Math.PI) / 180 }))
  ];
  const slitRow = high ? rowsDef.findIndex((r) => r.kind === 'band' && Math.abs(r.y - FACE.mouthY) < 1e-6) : -1;
  const smile = ctx.crowd ? 0 : clamp(ctx.look.smile || 0, 0, 1);
  // Mouth corners land on grid columns
  const mz = field.faceZ(0, FACE.mouthY);
  const halfW = FACE.mouthHalfW * face.mouth;
  const phiC = Math.atan2(halfW, mz - 0.012);
  let cornerJ = 1;
  for (let j = 1; j < cols / 2; j++) {
    if (Math.abs(phis[j] - phiC) < Math.abs(phis[cornerJ] - phiC)) cornerJ = j;
  }
  const inSlit = (j) => {
    const d = Math.min(j, cols - j);
    return d < cornerJ;
  };
  const rows = rowsDef.length;
  const P = [];
  const nrm = [0, 0, 0];
  for (let i = 0; i < rows; i++) {
    const r = rowsDef[i];
    for (let j = 0; j < cols; j++) {
      const ph = phis[j];
      let ox = 0;
      let oy;
      let dx;
      let dy;
      let dz;
      if (r.kind === 'band') {
        oy = r.y;
        dx = Math.sin(ph);
        dy = 0;
        dz = Math.cos(ph);
      } else {
        oy = r.kind === 'top' ? yTop : yBot;
        dx = Math.sin(r.a) * Math.sin(ph);
        dy = Math.cos(r.a);
        dz = Math.sin(r.a) * Math.cos(ph);
      }
      const t = field.project(ox, oy, 0, dx, dy, dz);
      const p = [ox + dx * t, oy + dy * t, dz * t];
      field.normal(p[0], p[1], p[2], nrm);
      let n = nrm.slice();
      if ((r.kind === 'top' && r.a === 0) || (r.kind === 'bot' && r.a >= Math.PI - 1e-6)) n = [0, r.kind === 'top' ? 1 : -1, 0];
      // The lip line: a soft groove along the mouth row
      if (high && Math.abs(i - slitRow) <= 1) {
        const d = Math.min(j, cols - j);
        if (d <= cornerJ) {
          const u = d / cornerJ;
          const depth = (i === slitRow ? 0.0017 : 0.0005) * Math.sqrt(Math.max(0, 1 - u * u)) + (i === slitRow ? 0.0004 : 0);
          p[0] -= n[0] * depth;
          p[1] -= n[1] * depth;
          p[2] -= n[2] * depth;
        }
      }
      // A resting smile (look.smile): the mouth corners turn up and back a
      // touch and the cheeks round above them
      if (high && smile > 0) {
        const cd = Math.hypot(Math.abs(p[0]) - FACE.mouthHalfW * face.mouth, (p[1] - FACE.mouthY) * 1.3);
        const mk = gauss(cd, 0.0085) * sstep(0.05, 0.075, p[2]);
        p[1] += smile * 0.0019 * mk;
        p[2] -= smile * 0.0007 * mk;
        const ck = gauss(Math.hypot(Math.abs(p[0]) - 0.036, p[1] + 0.034), 0.014) * sstep(0.04, 0.07, p[2]);
        p[0] += n[0] * smile * 0.0016 * ck;
        p[1] += n[1] * smile * 0.0016 * ck + smile * 0.0008 * ck;
        p[2] += n[2] * smile * 0.0016 * ck;
      }
      ox = 0;
      P.push({ p, n });
    }
  }
  const H = { mouthHalfW: Math.abs(P[slitRow >= 0 ? slitRow * cols + cornerJ : 0].p[0]) || halfW, mouthCornerZ: mz - 0.008 };
  ctx.H = H;
  const idx = [];
  const skinTint = (p, n) => headTint(p, ctx, n);
  for (let k = 0; k < P.length; k++) {
    const i = Math.floor(k / cols);
    const j = k % cols;
    const q = P[k];
    const pm = toModel(q.p);
    const nm = q.n;
    const slit = i === slitRow && inSlit(j);
    const tint = skinTint(q.p, q.n);
    if (slit) {
      const dark = [tint[0] * 0.55, tint[1] * 0.4, tint[2] * 0.4];
      const up = b.vertex(pm, nm, REGION.SKIN, dark, faceWeights(q.p, H, 0));
      const lo = b.vertex(pm, nm, REGION.SKIN, dark, faceWeights(q.p, H, 1));
      idx.push([up, lo]);
    } else {
      const v = b.vertex(pm, nm, REGION.SKIN, tint, faceWeights(q.p, H, i === slitRow ? 0.5 : undefined));
      idx.push([v, v]);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const j2 = (j + 1) % cols;
      // Quads below the slit row use the lower-lip copies
      const sel = i === slitRow ? 1 : 0;
      const a = idx[i * cols + j][sel];
      const bb = idx[i * cols + j2][sel];
      const c = idx[(i + 1) * cols + j][0];
      const d = idx[(i + 1) * cols + j2][0];
      b.tri(MAT.SKIN, a, c, bb);
      b.tri(MAT.SKIN, bb, c, d);
    }
  }
  if (high) buildMouthInside(b, ctx);
  return H;
}

function headTint(p, ctx, n) {
  const [x, y, z] = p;
  const ax = Math.abs(x);
  let r = 1;
  let g = 1;
  let bl = 1;
  // Warm cheeks, nose and lips; cooler, darker under the jaw
  // A vinyl toy's painted blush: warm, soft-edged apples of the cheeks
  const cheek = gauss(ax - 0.049, 0.016) * gauss(y + 0.029, 0.013) * sstep(0.03, 0.07, z) * ctx.face.blush;
  r += cheek * 0.035;
  g -= cheek * 0.085;
  bl -= cheek * 0.075;
  const nose = gauss(ax, 0.012) * gauss(y + 0.03, 0.014) * sstep(0.088, 0.1, z);
  g -= nose * 0.06;
  bl -= nose * 0.055;
  // A cooler, slightly darker jaw and chin where a beard grows
  const jawCool = (ctx.look.facialHair && !ctx.crowd ? 1 : 0) * sstep(-0.05, -0.075, y) * sstep(0.0, 0.04, z) * 0.04;
  r -= jawCool;
  g -= jawCool * 0.6;
  const my0 = FACE.mouthY;
  const lipX = 1 - sstep(0.016, 0.024, ax);
  const upper = lipX * sstep(my0 + 0.0095, my0 + 0.0065, y) * sstep(my0 - 0.0005, my0 + 0.001, y);
  const lower = lipX * sstep(my0 - 0.0125, my0 - 0.009, y) * sstep(my0 + 0.0005, my0 - 0.001, y);
  const lips = (upper * 1.2 + lower * 0.95) * sstep(0.07, 0.085, z) * ctx.face.lipTone;
  r -= lips * 0.05;
  g -= lips * 0.29;
  bl -= lips * 0.25;
  // The lower lip casts a soft shadow on the chin; a pale roll edges the upper lip
  const lipShadow = lipX * gauss(y - (my0 - 0.0142), 0.0026) * sstep(0.07, 0.085, z) * 0.12;
  const lipRoll = (1 - sstep(0.012, 0.021, ax)) * gauss(y - (my0 + 0.0101), 0.0011) * sstep(0.075, 0.088, z) * 0.035;
  r += lipRoll - lipShadow;
  g += lipRoll - lipShadow * 1.1;
  bl += lipRoll - lipShadow * 1.1;
  // A soft sheen on the middle of the lower lip
  const lipHL = lower * gauss(ax, 0.008) * gauss(y - (my0 - 0.0068), 0.002) * 0.06;
  r += lipHL;
  g += lipHL;
  bl += lipHL;
  // Cheekbones catch light; the cheek below them hollows a touch
  const bone = gauss(ax - 0.05, 0.012) * gauss(y + 0.008, 0.008) * sstep(0.03, 0.06, z);
  const hollow = gauss(ax - 0.048, 0.012) * gauss(y + 0.04, 0.012) * sstep(0.02, 0.05, z);
  r += bone * 0.04 - hollow * 0.03;
  g += bone * 0.04 - hollow * 0.04;
  bl += bone * 0.04 - hollow * 0.04;
  // Under the jaw: skin that faces down sits in shadow, which draws the jawline
  const under = sstep(-0.085, -0.11, y) * (1 - sstep(0.02, 0.06, z)) * 0.12 +
    (n ? sstep(-0.25, -0.75, n[1]) * sstep(-0.03, -0.07, y) * 0.14 : 0);
  const socket = gauss(ax - FACE.eyeX, 0.017) * gauss(y - 0.006, 0.014) * sstep(0.055, 0.075, z) * 0.12;
  // Soft occlusion in the folds: beside the nose, under it, the mouth corners, the lid crease
  const my = FACE.mouthY;
  const wing = gauss(ax - 0.018, 0.006) * gauss(y + 0.034, 0.008) * 0.06;
  const fold = gauss(ax - lerp(0.018, 0.028, clamp((-0.03 - y) / 0.035, 0, 1)), 0.005) * sstep(-0.028, -0.04, y) * sstep(my - 0.006, my + 0.004, y) * 0.07;
  const subnasal = gauss(ax, 0.01) * gauss(y + 0.04, 0.004) * 0.05;
  // Painted nose: lit ridge and tip, shaded flanks, a crease round each wing, dark nostrils
  const noseZone = sstep(0.075, 0.09, z);
  const down = n ? sstep(-0.15, -0.65, n[1]) : 0;
  const ridge = gauss(ax, 0.006) * sstep(0.012, 0.0, y) * sstep(-0.03, -0.018, y) * noseZone;
  const tipHL = gauss(Math.hypot(ax, (y + 0.025) * 0.9), 0.008) * sstep(0.098, 0.106, z);
  const flank = gauss(ax - 0.011, 0.007) * sstep(0.008, -0.004, y) * sstep(-0.03, -0.02, y) * noseZone;
  const wingD = Math.hypot(ax - 0.0112, (y + 0.0335) * 1.1);
  const crease = gauss(wingD - 0.0092, 0.0028) * sstep(-0.042, -0.034, y) * noseZone * (0.3 + 0.7 * down);
  // Nostrils are seen from below: only the downward-facing skin darkens, softly
  const nostril = gauss(ax - 0.007, 0.0045) * gauss(y + 0.039, 0.004) * noseZone * down;
  r += (ridge * 0.05 + tipHL * 0.07);
  g += (ridge * 0.05 + tipHL * 0.06);
  bl += (ridge * 0.04 + tipHL * 0.05);
  // Upper-lid crease just above each eye
  const lidCrease = gauss(ax - FACE.eyeX, 0.013) * gauss(y - (FACE.eyeY + FACE.eyeR + 0.0035), 0.0022) * sstep(0.06, 0.075, z);
  const corners = gauss(ax - FACE.mouthHalfW, 0.004) * gauss(y - my, 0.004) * 0.12;
  const chinFold = gauss(ax, 0.016) * gauss(y - (my - 0.016), 0.004) * 0.06;
  // Philtrum: a soft groove from the nose to the cupid's bow, lit ridges either side
  const philY = sstep(my + 0.009, my + 0.013, y) * sstep(-0.036, -0.041, y) * sstep(0.08, 0.09, z);
  const philG = gauss(ax, 0.0028) * philY * 0.035;
  const philR = gauss(ax - 0.0055, 0.0018) * philY * 0.025;
  r += philR;
  g += philR;
  bl += philR;
  // Age: deeper smile lines and a soft shadow under the eyes
  const age = ctx.look.age || 0;
  const bags = age * gauss(ax - FACE.eyeX, 0.012) * gauss(y - (FACE.eyeY - FACE.eyeR - 0.004), 0.003) * sstep(0.06, 0.08, z) * 0.06;
  const k = 1 - under - socket - wing - fold * (1 + 1.4 * age) - subnasal - corners - chinFold - flank * 0.03 - crease * 0.05 -
    nostril * 0.14 - lidCrease * 0.14 - bags - philG;
  let tint = [r * k, g * k, bl * k];
  if (ctx.stubble) tint = ctx.stubble(p, tint);
  if (ctx.hairShadow) tint = ctx.hairShadow(p, tint);
  if (ctx.look.shaved && !ctx.crowd) tint = scalpShadow(p, tint, ctx);
  // Under and round a full beard the skin takes the beard's colour, so the
  // beard's edge on the cheek is soft rather than cut out
  const fh = ctx.look.facialHair;
  if ((fh === 'beard' || fh === 'fullBeard') && !ctx.crowd) tint = beardShade(p, tint, ctx);
  return tint;
}

function buildMouthInside(b, ctx) {
  const { toModel, H } = ctx;
  const my = FACE.mouthY;
  const wf = (p) => {
    const hp = ctx.toHead(p);
    const j = sstep(my + 0.002, my - 0.008, hp[1]);
    return [['head', 1 - j], ['jaw', j]];
  };
  // Bag: dark throat at the top, tongue at the bottom
  addBlob(b, {
    c: toModel([0, my - 0.005, 0.068]), r: [0.0195, 0.0135, 0.016].map((v) => v * ctx.scale), n: [2, 2], cols: 10, rows: 6,
    region: REGION.FIXED, mat: MAT.SKIN,
    tint: (p) => {
      const hp = ctx.toHead(p);
      const k = sstep(my - 0.006, my - 0.014, hp[1]);
      return [lerp(0.13, 0.42, k), lerp(0.04, 0.13, k), lerp(0.04, 0.12, k)];
    },
    weight: wf
  });
  const arch = (cy, cz, rad, hgt, thick, jawW, tint) => {
    const n = 9;
    const loop = [[-thick, hgt / 2], [thick, hgt / 2], [thick * 1.1, 0], [thick, -hgt / 2], [-thick, -hgt / 2], [-thick * 1.1, 0]];
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = lerp(-0.78, 0.78, i / (n - 1));
      const pinch = sstep(0, 0.12, i / (n - 1)) * sstep(1, 0.88, i / (n - 1));
      for (const [ro, dy] of loop) {
        const rr = rad + ro * (0.3 + 0.7 * pinch);
        const hp = [Math.sin(a) * rr, cy + dy * (0.3 + 0.7 * pinch), cz + Math.cos(a) * rr - rad];
        pts.push({ p: toModel(hp), region: REGION.FIXED, tint, mat: MAT.GLOSS });
      }
    }
    emitGrid(b, {
      pts, rows: n, cols: loop.length, center: new THREE.Vector3(...toModel([0, cy, cz - rad])), poles: [],
      weight: () => [['head', 1 - jawW], ['jaw', jawW]]
    });
  };
  arch(my + 0.0002, H.mouthCornerZ + 0.002, 0.0205, 0.0052, 0.0011, 0, [0.9, 0.88, 0.82]);
  arch(my - 0.0072, H.mouthCornerZ - 0.0005, 0.0185, 0.0038, 0.001, 1, [0.8, 0.78, 0.72]);
}

/* ------------------------------------------------------------ eyes */

/** Eyeball with iris and pupil as crisp rings, and its two lids. */
export function buildEyes(b, ctx) {
  const { toModel, res, look } = ctx;
  const R = FACE.eyeR;
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    const c = [s * FACE.eyeX, FACE.eyeY, FACE.eyeZ];
    if (!res.high) {
      // A dark oval sitting proud of the coarse face reads as an eye at any distance
      const fz = ctx.field.faceZ(c[0], c[1]);
      addBlob(b, {
        c: toModel([c[0] - s * 0.0004, c[1] - 0.0006, fz + 0.0014]), r: [0.0058, 0.0068, 0.0028].map((v) => v * ctx.scale), n: [2, 2],
        cols: 6, rows: 3, region: REGION.FIXED, tint: [0.035, 0.028, 0.026], mat: MAT.SKIN, weight: () => [['head', 1]]
      });
      continue;
    }
    // Rings by angle from the front: pupil, iris, limbus, sclera
    const { iris } = look;
    const IR = 0.73; // iris angular radius (rad): a big iris reads warm and alive
    const PR = 0.29;
    const ringsDef = [
      [0, 'p'], [PR * 0.8, 'p'], [PR, 'p'], [PR, 'i0'], [IR * 0.6, 'i1'], [IR * 0.86, 'i2'], [IR, 'l'], [IR, 's0'], [0.98, 's'],
      [1.4, 's2'], [2.2, 's3'], [Math.PI, 's3']
    ];
    const cols = 14;
    const pts = [];
    for (const [a, kind] of ringsDef) {
      for (let j = 0; j < cols; j++) {
        const ph = (j / cols) * Math.PI * 2;
        // Cornea: the front bulges a touch so the highlight rolls
        const bulge = a < IR + 0.1 ? 0.06 * Math.cos(Math.min(1, a / (IR + 0.1)) * Math.PI * 0.5) ** 2 : 0;
        const rr = R * (1 + bulge);
        const lp = [Math.sin(a) * Math.cos(ph) * rr, Math.sin(a) * Math.sin(ph) * rr, Math.cos(a) * rr];
        let tint;
        // Radial fibres: alternate columns a touch lighter and warmer; light
        // falls from above, so the lower iris glows and the top sits in the lid's shade
        const swirl = 1 + 0.14 * Math.sin(ph * 8 + a * 9) * (j % 2 ? 1 : -0.6);
        const lowGlow = 1 + 0.22 * Math.max(0, -Math.sin(ph)) - 0.12 * Math.max(0, Math.sin(ph));
        const warm = (v, k, w) => [v[0] * k * (1 + w), v[1] * k * (1 + w * 0.5), v[2] * k];
        if (kind === 'p') tint = [0.012, 0.01, 0.012];
        else if (kind === 'i0') tint = warm(iris, 1.35 * swirl * lowGlow, 0.25);
        else if (kind === 'i1') tint = warm(iris, 1.12 * swirl * lowGlow, 0.08);
        else if (kind === 'i2') tint = iris.map((v) => v * 0.85 * swirl * lowGlow);
        else if (kind === 'l') tint = iris.map((v) => v * 0.28);
        else if (kind === 's0') tint = [0.8, 0.79, 0.78];
        else if (kind === 's') tint = [0.93, 0.92, 0.9];
        else if (kind === 's2') tint = [0.9, 0.84, 0.81];
        else tint = [0.62, 0.46, 0.43];
        // The upper lid shades the top of the white (the eye only turns a little)
        if (kind[0] === 's' && kind !== 's3') tint = tint.map((v) => v * (1 - 0.17 * Math.max(0, Math.sin(ph)) ** 1.5));
        pts.push({ p: toModel([c[0] + lp[0], c[1] + lp[1], c[2] + lp[2]]), region: REGION.FIXED, tint, mat: MAT.GLOSS, a });
      }
    }
    const nf = (p) => {
      const hp = ctx.toHead(p);
      return [hp[0] - c[0], hp[1] - c[1], hp[2] - c[2]];
    };
    emitGrid(b, {
      pts, rows: ringsDef.length, cols, normalFn: nf, center: new THREE.Vector3(...toModel(c)), poles: [0, ringsDef.length - 1],
      weight: () => [[`eye${S}`, 1]]
    });
    // Crisp painted catch-lights on the cornea: a main one up and to the
    // viewer's left, a small one low on the other side. They stay on the
    // eye (weighted to it), like a toy's printed highlights. Kept below the
    // bloom threshold so they never flare.
    for (const [dir, rad, k] of [[[-0.34, 0.3, 0.89], 0.0021, 1.25], [[0.3, -0.26, 0.92], 0.0009, 1.05]]) {
      const cl = new THREE.Vector3(...dir).normalize().multiplyScalar(R * 1.068);
      const o = toModel([c[0] + cl.x, c[1] + cl.y, c[2] + cl.z]);
      const n = cl.clone().normalize();
      addBlob(b, {
        c: o, r: [rad, rad * 1.1, rad * 0.4].map((v) => v * ctx.scale), n: [2, 2],
        cols: 6, rows: 3, region: REGION.FIXED, tint: [k, k, k * 0.97], mat: MAT.GLOSS, weight: () => [[`eye${S}`, 1]],
        warp: (p) => {
          // Lay the dot flat on the cornea: squash along the eye's surface normal
          const dd = new THREE.Vector3(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
          dd.addScaledVector(n, -dd.dot(n) * 0.6);
          return [o[0] + dd.x, o[1] + dd.y, o[2] + dd.z];
        }
      });
    }
    buildLid(b, ctx, s, c, true);
    buildLid(b, ctx, s, c, false);
  }
}

/** Lid shells, modelled CLOSED (edges meet just below the eye centre). */
export const LID_CLOSED_UP = -0.07;
export const LID_CLOSED_LO = -0.07;

function buildLid(b, ctx, s, c, upper) {
  const { toModel } = ctx;
  const S = s > 0 ? 'L' : 'R';
  const R = FACE.eyeR;
  // The upper lid is a thick, soft fold with a dark lash line along its
  // edge (it frames the eye from any distance); the lower lid is thinner
  const eyeOpen = Math.min(1.04, ctx.face.eyeOpen ?? 1);
  const eyeTilt = ctx.face.eyeTilt ?? 0;
  const rOut = R + (upper ? 0.0021 : 0.0011);
  const rIn = R + 0.0003;
  const cols = 10;
  const azMax = 1.32;
  // Rows from the lid edge into the head: [elevation offset from edge, radius, tint key]
  const edgeE = upper ? LID_CLOSED_UP : LID_CLOSED_LO;
  const dir = upper ? 1 : -1;
  const rowsDef = upper
    ? [[0, rIn, 'lash'], [0.016, rOut + 0.0005, 'lash'], [0.085, rOut + 0.0003, 'liner'], [0.16, rOut, 'rim'], [0.38, rOut, 'lid'],
      [0.95, rOut, 'lid'], [1.75, rOut * 0.98, 'lid']]
    : [[0, rIn, 'lash'], [0.014, (rIn + rOut) / 2 + 0.0003, 'lash'], [0.06, rOut, 'rim'], [0.35, rOut, 'lid'],
      [0.95, rOut, 'lid'], [1.75, rOut * 0.98, 'lid']];
  const skin = ctx.skinTintLid;
  const pts = [];
  for (const [de, rr0, key] of rowsDef) {
    for (let j = 0; j < cols; j++) {
      const az = lerp(-azMax, azMax, j / (cols - 1));
      const outer = sstep(0.2, 1.1, az * s);
      // Almond: the upper edge dips towards the corners, the lower one rises
      // Per-person eye shape: a heavier (lower) upper lid narrows the eye;
      // tilt lifts or drops the outer corners
      const shape = (upper ? -0.9 : 0.35) * (1 - eyeOpen) + eyeTilt * az * s;
      const e = edgeE + dir * de - dir * (upper ? 0.085 : 0.06) * az * az + shape;
      // The lash line thickens and flicks out a little at the outer corner
      const rr = rr0 + (upper && key !== 'lid' ? 0.0007 * outer : 0);
      const lp = [Math.sin(az) * Math.cos(e) * rr, Math.sin(e) * rr, Math.cos(az) * Math.cos(e) * rr];
      let tint = skin;
      if (key === 'lash') tint = upper ? [0.045, 0.032, 0.03] : [skin[0] * 0.84, skin[1] * 0.74, skin[2] * 0.72];
      else if (key === 'liner') tint = [0.075 + 0.03 * (1 - outer), 0.055 + 0.02 * (1 - outer), 0.05 + 0.018 * (1 - outer)];
      else if (key === 'rim') tint = upper ? [skin[0] * 0.9, skin[1] * 0.8, skin[2] * 0.78] : [skin[0] * 0.95, skin[1] * 0.9, skin[2] * 0.88];
      const fade = upper ? 1 - 0.1 * gauss(de - 0.3, 0.2) : 1;
      pts.push({
        p: toModel([c[0] + lp[0], c[1] + lp[1], c[2] + lp[2]]),
        region: (key === 'lash' || key === 'liner') && upper ? REGION.FIXED : REGION.SKIN,
        tint: (key === 'lash' || key === 'liner') && upper ? tint : tint.map((v) => v * fade),
        mat: MAT.SKIN
      });
    }
  }
  const bone = upper ? `lidUp${S}` : `lidLo${S}`;
  emitGrid(b, {
    pts, rows: rowsDef.length, cols, wrap: false, center: new THREE.Vector3(...toModel(c)),
    weight: () => [[bone, 1]]
  });
}

/* ------------------------------------------------------------ brows, ears */

export function buildBrows(b, ctx) {
  const { field, toModel, res, look } = ctx;
  if (!res.high) {
    if (!ctx.lowBrows) return;
    for (const s of [1, -1]) {
      const bx = s * (FACE.eyeX + 0.002);
      const by = FACE.browY + 0.001;
      const z = field.faceZ(bx, by);
      addBlob(b, {
        c: toModel([bx, by, z - 0.0005]), r: [0.0175, 0.0044, 0.0042].map((v) => v * ctx.scale), n: [2, 2], cols: 4, rows: 2,
        region: REGION.HAIR, tint: [0.62, 0.62, 0.62], mat: MAT.SKIN, weight: (p) => faceWeights(ctx.toHead(p), ctx.H),
        warp: (p) => {
          // A gentle arch, dropping at the outer end
          const hp = ctx.toHead(p);
          const u = (hp[0] - bx) * s / 0.0175;
          hp[1] += 0.003 * (1 - u * u) - 0.0015 * Math.max(0, u);
          return toModel(hp);
        }
      });
    }
    // A small mouth and the tip of a nose: enough for a face to read at a distance
    const mz = field.faceZ(0, FACE.mouthY);
    addBlob(b, {
      c: toModel([0, FACE.mouthY - 0.001, mz - 0.0008]), r: [0.0135, 0.0032, 0.0034].map((v) => v * ctx.scale), n: [2, 2], cols: 6, rows: 2,
      region: REGION.FIXED, tint: [0.42, 0.17, 0.14], mat: MAT.SKIN, weight: (p) => faceWeights(ctx.toHead(p), ctx.H),
      warp: (p) => {
        const hp = ctx.toHead(p);
        const u = hp[0] / 0.0135;
        hp[1] += 0.0024 * u * u;
        return toModel(hp);
      }
    });
    const nz = field.faceZ(0, -0.03);
    addBlob(b, {
      c: toModel([0, -0.031, nz - 0.004]), r: [0.0095, 0.0075, 0.0075].map((v) => v * ctx.scale), n: [2, 2], cols: 5, rows: 3,
      region: REGION.SKIN, tint: (p) => (ctx.toHead(p)[1] < -0.034 ? [0.78, 0.66, 0.62] : [1.04, 0.97, 0.95]), mat: MAT.SKIN,
      weight: () => [['head', 1]]
    });
    return;
  }
  const thick = look.browThick;
  const n = 7;
  const nrm = [0, 0, 0];
  for (const s of [1, -1]) {
    const path = [];
    const rad = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = s * lerp(FACE.eyeX - 0.021, FACE.eyeX + 0.0235, u);
      // Arch (+ arched, − straight) and tilt (+ inner ends lower: a stern, level brow)
      const y = FACE.browY - 0.004 + 0.009 * Math.sin(Math.min(1, u * 1.25) * Math.PI * 0.62) - 0.008 * u * u +
        look.browArch * Math.sin(u * Math.PI) * 0.0055 + (look.face.browTilt ?? 0) * (u - 0.45) * 0.008;
      const z = field.faceZ(x, y);
      field.normal(x, y, z, nrm);
      const off = 0.0004;
      path.push(new THREE.Vector3(...toModel([x + nrm[0] * off, y + nrm[1] * off, z + nrm[2] * off])));
      rad.push(lerp(0.003, 0.0015, u) * thick * (u < 0.12 ? 0.75 + u * 2 : 1));
    }
    sweep(b, {
      path, radius: (u) => rad[Math.round(u * (n - 1))] * ctx.scale, cols: 5, region: REGION.HAIR, tint: look.browTint,
      mat: MAT.SKIN, weight: (p) => faceWeights(ctx.toHead(p), ctx.H), flat: 0.55
    });
  }
}

export function buildEars(b, ctx) {
  const { toModel, res, face } = ctx;
  const es = face.ears;
  // Skin-matched and a touch warmer: light through a thin ear reads red
  const warm = [1.05, 0.9, 0.86];
  for (const s of [1, -1]) {
    const c = [s * 0.0775, -0.012, -0.012];
    const rot = new THREE.Euler(0.2, s * -0.3, s * -0.04);
    const m = new THREE.Matrix4().makeRotationFromEuler(rot);
    const tmp = new THREE.Vector3();
    // Ear space → model space (x out of the head, y up, z forward)
    const place = (x, y, z) => {
      tmp.set(x, y, z).applyMatrix4(m);
      return toModel([c[0] + tmp.x, c[1] + tmp.y, c[2] + tmp.z]);
    };
    const w = () => [['head', 1]];
    // The shell: wide at the top, narrowing to the lobe, with the bowl of the
    // concha hollowed out of its outer face and shaded
    addBlob(b, {
      c: [0, 0, 0], r: [0.0092 * es, 0.0292 * es, 0.0168 * es], n: [2.1, 2.3], cols: res.high ? 9 : 4, rows: res.high ? 5 : 2,
      region: REGION.SKIN, mat: MAT.SKIN,
      tint: (p) => {
        if (!res.high) return warm;
        const q = ctx.toHead(p);
        // Distance from the concha's centre in ear space (approximate: the ear is small)
        const lx = (q[0] - c[0]) * s;
        const ly = q[1] - c[1] + 0.003;
        const lz = q[2] - c[2] - 0.002;
        const bowl = lx > 0.0015 ? gauss(Math.hypot(ly / 0.017, lz / 0.0095), 0.75) : 0;
        const k = 1 - 0.24 * bowl;
        return [warm[0] * k, warm[1] * (k - 0.04 * bowl), warm[2] * (k - 0.05 * bowl)];
      },
      warp: (p) => {
        let [x] = p;
        const [, y] = p;
        let [, , z] = p;
        // Narrower towards the lobe
        z *= 0.78 + 0.22 * sstep(-0.024, 0.006, y);
        const rr = Math.hypot(y / (0.029 * es), z / (0.0165 * es));
        if (x * s > 0) x -= s * 0.0052 * es * Math.max(0, 1 - rr * rr) ** 1.3;
        return place(x, y, z);
      },
      weight: w
    });
    if (!res.high) continue;
    // Helix: the rolled rim, from where it leaves the head over the top and
    // down the back to the lobe, thinning as it goes
    const helix = [
      [0.002, 0.012, 0.0125], [0.0035, 0.024, 0.0085], [0.0045, 0.0295, 0.0015], [0.0048, 0.028, -0.0075],
      [0.0048, 0.019, -0.0145], [0.0045, 0.006, -0.0165], [0.004, -0.008, -0.0135], [0.0035, -0.018, -0.0085]
    ].map(([x, y, z]) => new THREE.Vector3(...place(s * x * es, y * es, z * es)));
    sweep(b, {
      path: helix, radius: (u) => lerp(0.0021, 0.0026, Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5)) * (1 - 0.3 * sstep(0.7, 1, u)) * es * ctx.scale,
      cols: 4, region: REGION.SKIN, tint: [warm[0] * 1.01, warm[1] * 0.99, warm[2] * 0.98], mat: MAT.SKIN, weight: w
    });
    // Antihelix: a soft ridge inside the rim
    const anti = [[0.0032, 0.019, 0.004], [0.0036, 0.017, -0.0055], [0.0034, 0.006, -0.009], [0.003, -0.006, -0.0075]]
      .map(([x, y, z]) => new THREE.Vector3(...place(s * x * es, y * es, z * es)));
    sweep(b, { path: anti, radius: 0.0014 * es * ctx.scale, cols: 4, region: REGION.SKIN, tint: warm, mat: MAT.SKIN, weight: w, flat: 0.6 });
    // The lobe, fleshy and a little redder, and the tragus in front of the bowl
    addBlob(b, {
      c: place(s * 0.0012 * es, -0.0225 * es, -0.0015 * es), r: [0.0042 * es, 0.0072 * es, 0.0062 * es].map((v) => v * ctx.scale),
      cols: 6, rows: 3, region: REGION.SKIN, tint: [warm[0] * 1.02, warm[1] * 0.95, warm[2] * 0.93], mat: MAT.SKIN, weight: w
    });
    addBlob(b, {
      c: place(s * 0.0022 * es, -0.004 * es, 0.0118 * es), r: [0.0026 * es, 0.0038 * es, 0.0028 * es].map((v) => v * ctx.scale),
      cols: 5, rows: 3, region: REGION.SKIN, tint: warm, mat: MAT.SKIN, weight: w
    });
  }
}

/* ------------------------------------------------------------ hair */

const DEG = Math.PI / 180;
const hash01 = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Periodic Catmull-Rom through [ψ°, value] keys (ψ symmetric about 0). */
function periodic(keys) {
  const full = [];
  for (const [p, v] of keys) {
    full.push([p, v]);
    if (p > 0 && p < 180) full.push([-p, v]);
  }
  full.sort((a, b) => a[0] - b[0]);
  if (full[0][0] !== -180) full.unshift([-180, full[full.length - 1][1]]);
  return (psiDeg) => {
    const p = ((psiDeg + 180) % 360 + 360) % 360 - 180;
    const n = full.length;
    let i = 0;
    while (i < n - 1 && p > full[i + 1][0]) i++;
    const p0 = full[(i - 1 + n) % n];
    const p1 = full[i];
    const p2 = full[(i + 1) % n];
    const p3 = full[(i + 2) % n];
    const span = (p2[0] - p1[0] + 360) % 360 || 360;
    const t = clamp((p - p1[0]) / span, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
  };
}

const HAIRLINE = periodic([
  [0, 40.5], [22, 41.5], [40, 38.5], [55, 28], [65, 15], [72, 2], [78, -3], [84, 2], [92, 14], [101, 17.5], [113, 8],
  [125, -14], [145, -35], [180, -43]
]);
const HAIRLINE_HIGH = periodic([
  [0, 50], [20, 53], [36, 58], [50, 40], [62, 14], [72, -3], [78, -8], [83, -2], [90, 15], [101, 20], [113, 10],
  [125, -14], [145, -35], [180, -43]
]);
export { HAIRLINE, HAIRLINE_HIGH };

function beardShade(p, tint, ctx) {
  const L = ctx.look;
  if (!ctx.beardRatio) {
    ctx.beardRatio = [0, 1, 2].map((i) => {
      const h = [L.hairColor.r, L.hairColor.g, L.hairColor.b][i];
      const sk = [L.skin.r, L.skin.g, L.skin.b][i];
      return Math.min(1.1, (h + 0.03) / (sk + 0.03));
    });
  }
  const m = beardMask(p) * 0.3;
  return tint.map((v, i) => v * (1 + (ctx.beardRatio[i] - 1) * m));
}

/** A shaved head: a faint shadow of stubble wherever the hair would grow. */
function scalpShadow(p, tint, ctx) {
  const L = ctx.look;
  if (!ctx.scalpRatio) {
    ctx.scalpRatio = [0, 1, 2].map((i) => {
      const h = [L.hairColor.r, L.hairColor.g, L.hairColor.b][i];
      const sk = [L.skin.r, L.skin.g, L.skin.b][i];
      return Math.min(1.1, (h + 0.03) / (sk + 0.03));
    });
  }
  const len = Math.hypot(p[0], p[1], p[2]) || 1;
  const psi = Math.atan2(p[0], p[2]) / DEG;
  const elev = Math.asin(clamp(p[1] / len, -1, 1)) / DEG;
  const hl = HAIRLINE(psi);
  const m = sstep(hl - 3, hl + 4, elev) * (0.2 + 0.06 * noise3(p[0] * 90, p[1] * 90, p[2] * 90));
  return tint.map((v, i) => v * (1 + (ctx.scalpRatio[i] - 1) * m));
}

function dirFrom(psi, elev) {
  return [Math.sin(psi) * Math.cos(elev), Math.sin(elev), Math.cos(psi) * Math.cos(elev)];
}
function slerpDir(a, b, t) {
  const d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  const w = Math.acos(d);
  if (w < 1e-4) return a.slice();
  const s = Math.sin(w);
  const ka = Math.sin((1 - t) * w) / s;
  const kb = Math.sin(t * w) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

/** Hair styles: shape knobs read by buildHair. */
export const HAIR_STYLES = {
  bald: null,
  buzz: { h: 0.0022, side: 0.0019, ramp: 0.05, crown: [0, 0.9, -0.43], groove: 0.0002, buzz: true },
  crop: { h: 0.0098, side: 0.0047, ramp: 0.075, crown: [0, 0.9, -0.43], groove: 0.0015, front: 0.0045 },
  tousled: { h: 0.0138, side: 0.0068, ramp: 0.08, crown: [0.1, 0.92, -0.38], groove: 0.0012, noise: 0.0035, fringe: 0.006, front: 0.003 },
  sidePart: { h: 0.0152, side: 0.0066, ramp: 0.055, crown: [0.3, 0.9, -0.3], groove: 0.0018, part: 34, front: 0.0068 },
  sweptBack: { h: 0.0142, side: 0.0064, ramp: 0.06, crown: [0, 0.85, -0.52], groove: 0.0042, grooveTint: 0.5, cols: 40, combed: true, quiff: 0.0095, front: 0.0068 },
  curly: { h: 0.02, side: 0.0145, ramp: 0.07, crown: [0, 0.9, -0.43], groove: 0, curls: 0.0055, front: 0.004 },
  long: { h: 0.0105, side: 0.0115, ramp: 0.05, crown: [0, 0.82, -0.57], groove: 0.0012, long: true, front: 0.003, part: 0 },
  bun: { h: 0.0068, side: 0.0052, ramp: 0.05, crown: [0, 0.82, -0.57], groove: 0.0016, bun: true },
  balding: { h: 0.0048, side: 0.0045, ramp: 0.08, crown: [0, 0.9, -0.43], groove: 0.0006, balding: true },
  // Short, a little unruly on top
  messy: { h: 0.0135, side: 0.005, ramp: 0.05, fringeLocks: 3.5, lockDepth: 6, crown: [0.05, 0.92, -0.38], groove: 0.002, noise: 0.0042, clumps: 0.0048, front: 0.0045, tufts: 3.2, jag: 3.4 },
  // Medium length, wavy, tucked behind the ears and over the collar at the back
  wavy: {
    h: 0.0165, side: 0.0105, ramp: 0.045, crown: [0.12, 0.85, -0.5], groove: 0.002, noise: 0.003, clumps: 0.004, front: 0.006,
    part: 24, waves: 0.0035, lower: 9, lowerBack: 15, fringe: 0.0035, lockDepth: 8, fringeLocks: 3
  },
  // A neat short cut with the temples receding
  receding: { h: 0.0086, side: 0.0042, ramp: 0.065, crown: [0, 0.9, -0.43], groove: 0.0014, front: 0.0028, recede: 9 }
};
export const HAIR_STYLE_NAMES = Object.keys(HAIR_STYLES);

/** Elevation of a hat's lower edge, by azimuth, or null for no hat. */
export function hatEdge(kind) {
  switch (kind) {
    case 'cap': return periodic([[0, 36], [50, 26], [90, 13], [130, 6], [180, 4]]);
    case 'beanie': return periodic([[0, 30], [50, 20], [90, 8], [130, 0], [180, -6]]);
    case 'beret': return periodic([[0, 33], [50, 29], [90, 22], [130, 16], [180, 13]]);
    case 'headband': return periodic([[0, 47], [90, 38], [180, 30]]);
    default: return null;
  }
}

/** The hair shell for a style. */
export function buildHair(b, ctx) {
  const { look, res, field, toModel } = ctx;
  const st = HAIR_STYLES[look.hair];
  if (look.shades === 'up' && !ctx.crowd && !ctx.hatEdge) buildShadesUp(b, ctx);
  if (!st) return;
  const { high } = res;
  const hat = ctx.hatEdge;
  const hatCover = ctx.hatCovers;
  const line = st.balding ? HAIRLINE_HIGH : HAIRLINE;
  const { crown } = st;
  const cl = Math.hypot(...crown);
  const C = [crown[0] / cl, crown[1] / cl, crown[2] / cl];
  const cols = high ? (st.cols ?? (st.curls ? 34 : 28)) : 10;
  const tRows = high ? (st.curls ? [0, 0.025, 0.06, 0.11, 0.18, 0.27, 0.38, 0.5, 0.63, 0.77, 0.9, 1] : [0, 0.03, 0.075, 0.14, 0.23, 0.35, 0.5, 0.67, 0.84, 1]) : [0, 0.14, 0.45, 1];
  const nrm = [0, 0, 0];
  const sp = [0, 0, 0];
  const pts = [];
  const wrap = !st.balding;
  const psiRange = st.balding ? [62, 298] : [0, 360];
  for (const t of tRows) {
    for (let j = 0; j < cols; j++) {
      const u = wrap ? j / cols : j / (cols - 1);
      // Columns crowd towards the face, where the hairline is seen
      const psiDeg = wrap ? (headColumns(cols, high ? 0.5 : 0)[j] / DEG + 360) % 360 : lerp(psiRange[0], psiRange[1], u);
      const psi = psiDeg * DEG;
      // A broken hairline: a little jitter everywhere, tufts at the fringe and nape
      const fr = Math.max(0, Math.cos(psi));
      const nape = Math.max(0, -Math.cos(psi));
      const jit = high ? (hash01(j * 7 + 3) - 0.5) * (st.jag ?? 1.6) : 0;
      const tk = hash01(j * 13 + 5);
      const tuft = high ? (tk > 0.4 ? 0.45 + tk * 0.75 : 0) * ((st.tufts ?? 1.8) * fr * fr + 2.2 * nape * nape) : 0;
      let lineDeg = hairlineAt(st, line, psiDeg);
      // Locks: round the back and over the ears every other column hangs a
      // little lower, so the hair ends in points rather than a cut line
      if (high && !st.balding && !st.buzz) {
        const ff = Math.abs(((psiDeg + 540) % 360) - 180);
        const depth = (st.lockDepth ?? 5) * sstep(92, 125, ff) + (st.fringeLocks ?? 0) * sstep(40, 10, ff);
        if (j % 2) lineDeg -= depth * (0.75 + 0.5 * hash01(j * 11 + 4));
      }
      const elev = (lineDeg + jit - tuft) * DEG;
      let tt = t;
      let bandMax = 1;
      if (st.balding) {
        // A horseshoe: only the lower band of the hair survives
        const back = Math.cos(psi);
        bandMax = clamp(0.45 - back * 0.25, 0.08, 0.7) * sstep(0, 0.12, Math.min(u, 1 - u));
        tt = t * bandMax;
      }
      const dh = dirFrom(psi, elev);
      const d = slerpDir(dh, C, Math.pow(tt, 0.85));
      field.surf(d[0], d[1], d[2], sp);
      field.normal(sp[0], sp[1], sp[2], nrm);
      // Thickness: full on top, thinner at the sides, tucked in at the edge
      const top = clamp(d[1] * 1.4, 0, 1);
      let h = lerp(st.side, st.h, top);
      const frontK = Math.max(0, Math.cos(psi)) ** 1.5 * sstep(0.02, 0.22, tt) * sstep(0.75, 0.3, tt);
      h += (st.front || 0) * frontK;
      // Sides and nape are kept short
      h *= 1 - 0.35 * sstep(0.5, 0.9, Math.abs(Math.sin(psi))) * sstep(0.35, 0.0, tt);
      let partK = 0;
      if (st.part !== undefined && st.part !== 0) {
        // A clean parting: a groove (and a line of scalp) with the hair swept over from it
        const dp = (psiDeg - st.part) * DEG;
        partK = gauss(dp, 0.11) * sstep(0.85, 0.45, tt) * sstep(0.0, 0.08, tt);
        h -= 0.0055 * partK;
        h += 0.0042 * sstep(st.part * DEG, (st.part - 90) * DEG, psi) * sstep(0.95, 0.4, tt);
      }
      if (st.noise) h += st.noise * noise3(d[0] * 9 + 3, d[1] * 9, d[2] * 9);
      // Clumps that lift off the scalp and break the outline
      if (high) {
        h += (st.clumps ?? 0.0032) * Math.max(0, noise3(d[0] * 6 + 11, d[1] * 6, d[2] * 6) * 1.6 - 0.25) * sstep(0.05, 0.3, tt);
        h += 0.0012 * noise3(d[0] * 16 + 3, d[1] * 16, d[2] * 16) * sstep(0.1, 0.4, tt);
      }
      if (st.waves && high) {
        // Broad S-waves that run from the parting down to the ends
        const w = Math.sin(tt * 14 + noise3(psi * 3, 1.3, 0.4) * 2.5 + psi * 2);
        h += st.waves * (0.6 * w + 0.4 * noise3(d[0] * 14, d[1] * 14, d[2] * 14)) * sstep(0.04, 0.2, tt);
      }
      if (st.curls && high) {
        const n1 = noise3(d[0] * 26, d[1] * 26, d[2] * 26);
        const n2 = noise3(d[0] * 52 + 7, d[1] * 52, d[2] * 52);
        h += st.curls * (Math.abs(n1) * 1.1 + Math.abs(n2) * 0.5 - 0.45);
      }
      let gv = 0;
      if (st.groove && high) {
        const cmb = st.combed ? 0.7 : 0.3;
        const g = noise3(psi * 4.5, tt * 2.5, 1.7) * (1 - cmb) + Math.sin(psi * cols * 0.5 + noise3(psi * 2, tt * 3, 4) * 2) * cmb;
        gv = g * sstep(0.02, 0.15, tt) * sstep(1, 0.75, tt);
        h += st.groove * gv;
      }
      // Not a ball: a little flatter over the crown, fuller at the upper
      // corners of the head, so the outline squares off like a real cut
      if (!st.curls) {
        h *= 1 - 0.16 * sstep(0.78, 1, tt);
        const elD = Math.asin(clamp(d[1], -1, 1)) / DEG;
        h += st.h * 0.28 * gauss((elD - 46) / 15, 1) * Math.abs(Math.sin(psi)) ** 1.5 * sstep(0.1, 0.4, tt);
      }
      // Edge ramp (and the far edge for the horseshoe)
      let edge = sstep(0, st.ramp, tt);
      if (st.balding) edge *= sstep(bandMax, bandMax * 0.55, tt) * sstep(0, 0.1, Math.min(u, 1 - u));
      h = h * edge - 0.0012 * (1 - edge);
      // Low detail: lift clear of the coarse skull's facets
      if (!high) h += 0.005 * edge;
      // Under a hat the hair is pressed flat. A headband only presses a
      // band: the hair above it puffs out over the top.
      let covered = 0;
      if (hat) {
        const el = Math.asin(clamp(d[1], -1, 1));
        if (look.headwear === 'headband') {
          const de = el / DEG - hat(psiDeg);
          covered = sstep(-5, -2, de) * sstep(14, 10, de);
        } else {
          covered = hatCover(psi, el) ? 1 : 0;
          // Well inside the hat: these quads can be dropped altogether
          if (covered && el / DEG > hat(psiDeg) + 6) covered = 1.5;
        }
        if (covered > 0) h = lerp(h, Math.min(h, 0.0022), Math.min(1, covered));
      }
      const p = [sp[0] + nrm[0] * h, sp[1] + nrm[1] * h, sp[2] + nrm[2] * h];
      if (covered > 0.5) {
        // nothing sticks out from under the hat
      } else if (st.quiff && high) {
        const q = st.quiff * Math.max(0, Math.cos(psi)) ** 3 * sstep(0.0, 0.08, tt) * sstep(0.45, 0.1, tt);
        p[1] += q;
        p[2] += q * 0.3;
      }
      if (st.fringe && covered < 0.5) {
        const f = st.fringe * Math.max(0, Math.cos(psi)) ** 2 * sstep(0.25, 0.04, tt) * sstep(0, 0.03, tt);
        p[2] += f * 0.6;
        p[1] -= f;
      }
      // Colour: darker at the roots and in the grooves, lighter on top
      // Strand clumps: darker in the grooves, a sheen of lighter hair on top
      const strand = noise3(psi * 11, tt * 3, 2.3) * 0.6 + noise3(d[0] * 45, d[1] * 45, d[2] * 45) * 0.4;
      // A stylised sheen band across the top of the head, broken by the strands
      const elevD = Math.asin(clamp(d[1], -1, 1)) / DEG;
      const sheen = high ? gauss(elevD - 60, 11) * (0.55 + 0.45 * strand) * sstep(0.1, 0.4, tt) : 0;
      // Combing grooves read as darker lines between lighter strands
      const shade = (0.6 + 0.4 * edge) * (0.9 + 0.2 * top) * (1 + 0.2 * strand) * (1 + 0.2 * sheen) * (1 - 0.3 * partK) * (1 + (st.grooveTint ?? 0.12) * gv);
      const region = st.buzz && !ctx.crowd ? REGION.FIXED : REGION.HAIR;
      const base = st.buzz && !ctx.crowd ? ctx.buzzColor : [1, 1, 1];
      pts.push({ p: toModel(p), region, tint: base.map((v) => v * shade), mat: MAT.SKIN, cov: covered });
    }
  }
  emitGrid(b, {
    pts, rows: tRows.length, cols, wrap, center: new THREE.Vector3(...toModel([0, 0, 0])),
    poles: st.balding ? [] : [tRows.length - 1], weight: () => [['head', 1]],
    // Hair hidden under a hat (all four corners pressed flat under it) is not drawn
    skip: hat && look.headwear !== 'headband' && high ? (i, j) => {
      const c2 = wrap ? (j + 1) % cols : j + 1;
      return [pts[i * cols + j], pts[i * cols + c2], pts[(i + 1) * cols + j], pts[(i + 1) * cols + c2]].every((q) => q && q.cov > 1.2);
    } : undefined
  });
  // Long hair, or medium hair that covers the nape and curls over the collar
  if ((st.long || st.medium) && !(hat && look.headwear !== 'headband' && st.medium)) buildLongHair(b, ctx, st);
  if (high && !ctx.crowd) buildSideburns(b, ctx, st, line);
  // A bun is let out under a headband; under a hat it is tucked away
  if (st.bun && (!hat || look.headwear === 'headband')) buildBun(b, ctx);
}

/** Hairline elevation (degrees) for a style at azimuth ψ (degrees, 0 = front). */
function hairlineAt(st, line, psiDeg) {
  const fromFront = Math.abs(((psiDeg + 540) % 360) - 180);
  let e = line(psiDeg);
  // Receding temples; longer styles grow lower over the ears and the nape
  if (st.recede) e += st.recede * gauss((fromFront - 46) / 20, 1);
  if (st.lower) e -= st.lower * sstep(55, 100, fromFront);
  if (st.lowerBack) e -= st.lowerBack * sstep(110, 170, fromFront);
  return e;
}

/**
 * A lock lying on the scalp: a flattened, tapering tube that follows the
 * surface from `e0` down to `e1` (degrees) at azimuth ψ, starting `h0` proud
 * of the skin (inside the hair shell) and ending close to it.
 */
function scalpLock(b, ctx, { psi, e0, e1, w, h0, h1 = 0.0012, drift = 0, tint, flat = 0.45, n = 5, cols = 4 }) {
  const { field, toModel } = ctx;
  const sp = [0, 0, 0];
  const nrm = [0, 0, 0];
  const P = [];
  const N = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const d = dirFrom((psi + drift * u * u) * DEG, lerp(e0, e1, u) * DEG);
    field.surf(d[0], d[1], d[2], sp);
    field.normal(sp[0], sp[1], sp[2], nrm);
    const h = lerp(h0, h1, Math.pow(u, 0.7));
    P.push(new THREE.Vector3(sp[0] + nrm[0] * h, sp[1] + nrm[1] * h, sp[2] + nrm[2] * h));
    N.push(new THREE.Vector3(...nrm));
  }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const T = P[Math.min(n - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize();
    const S = new THREE.Vector3().crossVectors(N[i], T).normalize();
    const r = w * (i === n - 1 ? 0 : Math.pow(1 - u, 0.75)) + (i === n - 1 ? 0 : 0.0003);
    for (let j = 0; j < cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      const q = P[i].clone().addScaledVector(S, Math.cos(a) * r).addScaledVector(N[i], Math.sin(a) * r * flat);
      pts.push({ p: toModel([q.x, q.y, q.z]), region: REGION.HAIR, tint, mat: MAT.SKIN });
    }
  }
  const mid = P[Math.floor(n / 2)].clone().addScaledVector(N[Math.floor(n / 2)], -0.006);
  emitGrid(b, { pts, rows: n, cols, center: new THREE.Vector3(...toModel([mid.x, mid.y, mid.z])), poles: [n - 1], weight: () => [['head', 1]] });
}

/** Sideburns in front of the ears (short styles; beards already cover them). */
function buildSideburns(b, ctx, st, line) {
  const L = ctx.look;
  if (st.long || st.balding || L.facialHair === 'beard' || L.facialHair === 'fullBeard') return;
  for (const s of [1, -1]) {
    const psi = s * 83;
    const e = hairlineAt(st, line, psi);
    scalpLock(b, ctx, {
      psi, e0: e + 6, e1: (st.sideburn ?? -13), w: 0.0072, h0: Math.max(0.003, st.side * 0.7), h1: 0.0013, flat: 0.32,
      tint: [0.8, 0.8, 0.8], n: 5, cols: 4
    });
  }
}

function buildLongHair(b, ctx, st) {
  const { field, toModel, res } = ctx;
  // A thick curtain from behind the ears around the back, down to the shoulders
  const n = res.high ? 18 : 7;
  const loop = res.high
    ? [[0, 0.0], [0.25, 0.0], [0.6, 0.0], [1.0, 0.0], [1.0, 1], [0.6, 1], [0.25, 1], [0, 1]]
    : [[0, 0], [1, 0], [1, 1], [0, 1]];
  const sp = [0, 0, 0];
  const nrm = [0, 0, 0];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const psiDeg = st.medium ? lerp(104, 256, u) : lerp(92, 268, u);
    const psi = psiDeg * DEG;
    const pinch = sstep(0, 0.08, u) * sstep(1, 0.92, u);
    for (const [v, layer] of loop) {
      // v: 0 at the top (inside the hair shell) → 1 at the tips
      const elev = lerp(0.35, st.medium ? -0.2 : -0.3, Math.min(1, v * 1.6));
      const d = dirFrom(psi, elev);
      field.surf(d[0], d[1], d[2], sp);
      field.normal(sp[0], sp[1], sp[2], nrm);
      const hang = sstep(0.45, 1.0, v);
      // Locks: the curtain ripples into a few soft clumps towards the ends
      const lock = res.high ? Math.sin(u * Math.PI * 9 + 0.6) * sstep(0.35, 0.9, v) : 0;
      const thick = (layer ? 0.0 : 0.009) * pinch * (1 - 0.5 * hang) + 0.003 + 0.0025 * Math.max(0, lock) * (layer ? 0.3 : 1);
      // Medium hair sits flush with the shell above it and thins out at its sides
      const out = st.medium ? st.side * 0.78 + thick * 0.55 * pinch : st.side * 0.55 + thick;
      let x = sp[0] + nrm[0] * out;
      let z = sp[2] + nrm[2] * out;
      let y = sp[1] + nrm[1] * out;
      if (v > 0.6) {
        // Below the skull the hair falls straight, flaring over the shoulders
        const k = (v - 0.6) / 0.4;
        // Uneven ends, longer at the back
        y -= k * ((st.medium ? 0.028 : 0.12) + 0.012 * Math.cos(psi - Math.PI) + (res.high ? 0.008 * lock : 0));
        const flare = 1 + k * (st.medium ? 0.07 : 0.12);
        x *= flare;
        z = z * flare - k * 0.012;
      }
      const tipFade = v > 0.95 ? 0.7 : 1;
      const tone = 0.92 * tipFade * (1 + 0.08 * lock) * (layer ? 0.82 : 1);
      pts.push({ p: toModel([x, y, z]), region: REGION.HAIR, tint: [tone, tone, tone], mat: MAT.SKIN, v, y });
    }
  }
  emitGrid(b, {
    pts, rows: n, cols: loop.length, center: new THREE.Vector3(...toModel([0, -0.05, -0.02])),
    weight: (p, q) => {
      const k = sstep(-0.06, -0.19, q.y);
      return [['head', 1 - k], ['neck', k * 0.5], ['chest', k * 0.5]];
    }
  });
}

function buildBun(b, ctx) {
  const { field, toModel, res } = ctx;
  const sp = [0, 0, 0];
  const nrm = [0, 0, 0];
  const d = [0, 0.62, -0.78];
  field.surf(d[0], d[1], d[2], sp);
  field.normal(sp[0], sp[1], sp[2], nrm);
  const c = [sp[0] + nrm[0] * 0.022, sp[1] + nrm[1] * 0.022, sp[2] + nrm[2] * 0.022];
  addBlob(b, {
    c: toModel(c), r: [0.03, 0.026, 0.027].map((v) => v * ctx.scale), n: [2, 2], cols: res.high ? 10 : 6, rows: res.high ? 7 : 4,
    region: REGION.HAIR, mat: MAT.SKIN,
    tint: (p, v, u) => {
      const k = 0.85 + 0.15 * Math.sin(u * Math.PI * 10 + v * 6);
      return [k, k, k];
    },
    weight: () => [['head', 1]]
  });
}

/* ------------------------------------------------------------ facial hair */

/** Mask (0..1) of the beard area in head space; used for stubble. */
export function beardMask(p) {
  const [x, y, z] = p;
  const ax = Math.abs(x);
  if (z < -0.035) return 0;
  const my = FACE.mouthY;
  // Cheek line: from the sideburn down towards the mouth corners
  const cheekY = lerp(my + 0.008, -0.004, sstep(0.025, 0.07, ax));
  let m = sstep(cheekY + 0.006, cheekY - 0.01, y);
  // Keep the lips clear
  const lip = gauss(ax / 0.024, 1) * gauss((y - my) / 0.0085, 1);
  m *= 1 - lip;
  // Moustache area under the nose
  const mo = (1 - sstep(0.018, 0.028, ax)) * sstep(my + 0.004, my + 0.009, y) * sstep(-0.034, -0.04, y);
  m = Math.max(m, mo);
  // Fade out under the jaw towards the neck
  m *= sstep(-0.135, -0.11, y) * sstep(-0.035, -0.01, z);
  return clamp(m, 0, 1);
}

/** Beard and/or moustache shells. kind: 'beard' | 'fullBeard' | 'moustache'. */
export function buildFacialHair(b, ctx, kind) {
  const { field, toModel, res } = ctx;
  const { high } = res;
  const sp = [0, 0, 0];
  const nrm = [0, 0, 0];
  const my = FACE.mouthY;
  if (kind === 'beard' || kind === 'fullBeard') {
    const full = kind === 'fullBeard';
    const O = [0, -0.045, 0];
    const cols = high ? 20 : 9;
    const rows = high ? [0, 0.08, 0.22, 0.4, 0.6, 0.78, 0.91, 1] : [0, 0.35, 0.7, 1];
    const pts = [];
    // Elevations (from O) of the neck line and of the cheek/lip line
    const loE = periodic([[0, -74], [30, -68], [60, -54], [90, -36], [110, -22]]);
    // The upper edge: under the lower lip, up round the mouth corners to meet
    // the moustache, then high over the cheeks to the sideburns
    const hiE = periodic([[0, -23], [12, -21], [20, -14], [28, -4], [38, 7], [50, 13], [65, 16], [80, 18], [100, 19.5], [110, 21]]);
    for (const t of rows) {
      for (let j = 0; j < cols; j++) {
        const u = j / (cols - 1);
        const psiDeg = lerp(-104, 104, u);
        const psi = psiDeg * DEG;
        const e = lerp(loE(psiDeg), hiE(psiDeg), t) * DEG;
        const d = dirFrom(psi, e);
        const tt = field.project(O[0], O[1], O[2], d[0], d[1], d[2]);
        sp[0] = O[0] + d[0] * tt;
        sp[1] = O[1] + d[1] * tt;
        sp[2] = O[2] + d[2] * tt;
        field.normal(sp[0], sp[1], sp[2], nrm);
        const chin = Math.max(0, Math.cos(psi)) ** 2;
        let h = (full ? 0.0075 : 0.004) + (full ? 0.006 : 0.0012) * chin * sstep(0.7, 0.1, t);
        // A long beard is fuller all over, so the hanging part grows out of it
        if (full && ctx.look.beardLong) h += 0.0035 + 0.004 * chin * sstep(0.6, 0.0, t);
        // A long, soft taper over the cheeks; a firmer edge along the neck
        const edge = sstep(0, 0.3, t) * sstep(1, 0.6, t) * sstep(0, 0.12, u) * sstep(1, 0.88, u);
        // Texture only inside the beard, so its outline stays clean
        if (high) h += (full ? 0.0016 : 0.0006) * noise3(sp[0] * 120, sp[1] * 120, sp[2] * 120) * edge * edge;
        // Low detail: stand well clear of the coarse face so the beard reads solid, not patchy
        h = h * edge - 0.0016 * (1 - edge) + (high ? 0 : 0.0058 * edge + 0.0012);
        const p = [sp[0] + nrm[0] * h, sp[1] + nrm[1] * h, sp[2] + nrm[2] * h];
        if (full) p[1] -= 0.007 * chin * sstep(0.6, 0.1, t) * edge;
        const shade = (0.74 + 0.26 * edge) * (1 + 0.12 * noise3(p[0] * 220, p[1] * 220, p[2] * 220));
        pts.push({ p: toModel(p), region: REGION.HAIR, tint: [shade, shade, shade], mat: MAT.SKIN, hp: p });
      }
    }
    emitGrid(b, {
      pts, rows: rows.length, cols, wrap: false, center: new THREE.Vector3(...toModel([0, -0.04, 0.0])),
      weight: (p, q) => faceWeights(q.hp, ctx.H)
    });
    if (full && ctx.look.beardLong) buildLongBeard(b, ctx);
  }
  // Moustache (on its own, or joining the beard)
  const O2 = [0, my, 0.0];
  const cols = high ? 11 : 4;
  const rows = high ? [0, 0.2, 0.5, 0.8, 1] : [0, 1];
  const pts = [];
  const big = kind === 'moustache' ? 1.12 : ctx.look.beardLong ? 1.14 : kind === 'fullBeard' ? 1.05 : 1;
  for (const t of rows) {
    for (let j = 0; j < cols; j++) {
      const u = j / (cols - 1);
      const psiDeg = lerp(-23, 23, u) * big;
      const psi = psiDeg * DEG;
      const ends = Math.abs(u - 0.5) * 2;
      const eLo = 3 - 15 * ends ** 2.2;
      const eHi = 12 - 3 * ends;
      const e = lerp(eLo, eHi, t) * DEG;
      const d = dirFrom(psi, e);
      const tt = field.project(O2[0], O2[1], O2[2], d[0], d[1], d[2]);
      sp[0] = O2[0] + d[0] * tt;
      sp[1] = O2[1] + d[1] * tt;
      sp[2] = O2[2] + d[2] * tt;
      field.normal(sp[0], sp[1], sp[2], nrm);
      let h = 0.004 * big * (1 - 0.45 * ends);
      const edge = sstep(0, 0.3, t) * sstep(1, 0.65, t) * sstep(0, 0.12, u) * sstep(1, 0.88, u);
      h = h * edge - 0.001 * (1 - edge);
      const p = [sp[0] + nrm[0] * h, sp[1] + nrm[1] * h, sp[2] + nrm[2] * h];
      p[1] -= 0.0012 * edge * sstep(0.6, 0.0, t);
      const shade = (0.76 + 0.24 * edge) * (1 + 0.1 * noise3(p[0] * 260, p[1] * 260, p[2] * 260));
      pts.push({ p: toModel(p), region: REGION.HAIR, tint: [shade, shade, shade], mat: MAT.SKIN, hp: p });
    }
  }
  emitGrid(b, {
    pts, rows: rows.length, cols, wrap: false, center: new THREE.Vector3(...toModel([0, my + 0.01, 0.0])),
    weight: (p, q) => faceWeights(q.hp, ctx.H, 0)
  });
}

/**
 * The hanging part of a long beard: a tapered, slightly flattened tube from
 * inside the chin down over the chest. The top rides the jaw; lower down it
 * hands over to the neck and chest so it rests on the shirt when the head
 * turns.
 */
function buildLongBeard(b, ctx) {
  const { toModel, res } = ctx;
  const { high } = res;
  const rowsT = high ? [0, 0.07, 0.16, 0.27, 0.39, 0.51, 0.63, 0.74, 0.84, 0.92, 0.97, 1] : [0, 0.35, 0.7, 1];
  const cols = high ? 20 : 6;
  const pts = [];
  for (const t of rowsT) {
    for (let j = 0; j < cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Each column is a lock: its own length, so the point is ragged, not cut
      const lock = high ? hash01(j * 3 + 7) : 0.5;
      const tl = Math.min(1, t * (1 + 0.1 * (lock - 0.5) * sstep(0.6, 1, t)));
      const y = lerp(-0.066, -0.268, tl) - (high ? 0.03 * (lock - 0.5) * sstep(0.7, 1, t) : 0);
      // Starts wide and deep round the jaw inside the beard shell, bows out
      // over the chest and closes to a rounded point
      const zc = lerp(0.034, 0.093, sstep(0, 0.65, tl)) + 0.008 * Math.sin(tl * Math.PI) - 0.006 * sstep(0.85, 1, tl);
      const round = Math.sqrt(Math.max(0, 1 - sstep(0.8, 1, t) ** 2 * 0.95));
      // Stays full well down the chest, then rounds off to a point: a spade, not a plank
      const wHalf = 0.072 * (1 - 0.74 * Math.pow(tl, 1.9)) * (1 + 0.1 * Math.sin(tl * Math.PI)) * round;
      const dHalf = 0.056 * (1 - 0.68 * Math.pow(tl, 1.6)) * round;
      // Strand clumps: ridges and furrows running down the beard, stronger in front
      // Big locks twisting a little as they fall, small strands on top of them
      const ridge = high ? Math.sin(a * 6 + tl * 3.2 + noise3(a * 1.7, tl * 3, 3.1) * 1.8) : 0;
      const fine = high ? (j % 2 ? 1 : -1) * (0.6 + 0.4 * noise3(a * 3, tl * 7, 5.3)) : 0;
      const clump = (0.0085 * ridge + 0.002 * fine) * sstep(0.04, 0.25, t) * (0.55 + 0.45 * Math.max(0, ca)) + (high ? 0.0028 * noise3(a * 5, tl * 9, 1.3) : 0);
      const front = ca > 0 ? 1 : 0.72;
      const x = sa * (wHalf + clump);
      const z = zc + ca * (dHalf + clump * 0.6) * front;
      // Copper-brown with lighter, sun-caught locks on the front, deeper in
      // the furrows and underneath
      const hl = Math.max(0, ridge) * Math.max(0, ca) * 0.36 + Math.max(0, fine) * 0.1 + (lock - 0.5) * 0.14;
      const shade = (0.62 + 0.2 * Math.max(0, ca)) * (1 + hl) * (1 - 0.18 * Math.max(0, -ridge)) * (1 - 0.07 * Math.max(0, -fine)) * (t > 0.95 ? 0.88 : 1);
      pts.push({ p: toModel([x, y, z]), region: REGION.HAIR, tint: [shade * 1.04, shade, shade * 0.95], mat: MAT.SKIN, t });
    }
  }
  emitGrid(b, {
    pts, rows: rowsT.length, cols, center: new THREE.Vector3(...toModel([0, -0.16, 0.06])), poles: [rowsT.length - 1],
    weight: (p, q) => {
      const k = sstep(0.12, 0.55, q.t);
      const c = sstep(0.4, 0.95, q.t);
      return [['jaw', (1 - k) * 0.7], ['head', (1 - k) * 0.3], ['neck', k * (1 - c)], ['chest', k * c]];
    }
  });
}

/* ------------------------------------------------------------ glasses */

export function buildGlasses(b, ctx, kind, opts = {}) {
  const { field, res, look } = ctx;
  const { high } = res;
  const sun = kind === 'sun';
  const frame = sun && !opts.tint ? look.glassesTint : opts.tint || look.glassesTint;
  // Pushed up onto the head: the whole pair turns back about the ear axis
  // and lifts clear of the hair
  const up = opts.up || 0;
  let lift = opts.lift || 0;
  const cu = Math.cos(up);
  const su = Math.sin(up);
  const xf = (p) => {
    if (!up) return p;
    const y = p[1] * cu + p[2] * su;
    const z = -p[1] * su + p[2] * cu;
    const l = Math.hypot(p[0], y, z) || 1;
    const k = (l + lift) / l;
    return [p[0] * k, y * k, z * k];
  };
  const toModel = (p) => ctx.toModel(xf(p));
  const zEye = FACE.eyeZ + FACE.eyeR;
  let zFront = 0;
  for (const x of [0.015, 0.03, 0.045]) zFront = Math.max(zFront, field.faceZ(x, 0.0));
  zFront = Math.max(zFront + 0.006, zEye + 0.011);
  const cy = FACE.eyeY + (sun ? 0.002 : 0.001);
  if (up) {
    // Lift the pair clear of the scalp along its new direction, plus the hair
    const rg = Math.hypot(cy, zFront);
    const dy = cy * cu + zFront * su;
    const dz = -cy * su + zFront * cu;
    const sp2 = [0, 0, 0];
    field.surf(0, dy, dz, sp2);
    lift = Math.hypot(...sp2) - rg + (opts.clear || 0);
  }
  const round = kind === 'round';
  // Frames grow with the eyes they frame
  const ek = Math.sqrt(FACE.eyeR / 0.0146);
  const hw = (round ? 0.0185 : sun ? 0.0255 : 0.0245) * ek;
  const hh = (round ? 0.0185 : sun ? 0.0175 : 0.0165) * ek;
  const rr = round ? 0.0016 : sun ? 0.0027 : 0.0019;
  const n = high ? 14 : 7;
  const w = () => [['head', 1]];
  const rimPt = (cx, a, shrink = 1) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const e = round ? 2 : 4.2;
    let x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e) * hw * shrink;
    const y = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e) * hh * shrink;
    // Wayfarers: wider across the brow, the outer top corner swept up
    if (sun) x *= 1 + 0.1 * (y / hh);
    const lift2 = sun ? 0.003 * sstep(0, 1, (x * Math.sign(cx)) / hw) * sstep(0, 1, y / hh) : 0;
    const X = cx + x;
    const Y = cy + y + lift2;
    // Lenses wrap gently with the face
    return [X, Y, zFront - Math.abs(X) * 0.12];
  };
  const rim = (s) => {
    const cx = s * (FACE.eyeX + (round ? 0 : 0.0006));
    const path = [];
    for (let i = 0; i < n; i++) path.push(new THREE.Vector3(...toModel(rimPt(cx, (i / n) * Math.PI * 2))));
    const thick = sun ? (u) => rr * (1 + 0.45 * Math.max(0, Math.sin(u * Math.PI * 2))) : rr;
    sweep(b, {
      path, radius: typeof thick === 'function' ? (u) => thick(u) * ctx.scale : rr * ctx.scale, cols: high ? 5 : 3, closed: true,
      region: REGION.FIXED, tint: frame, mat: MAT.GLOSS, weight: w
    });
    if (sun) {
      // Dark lens: a fan from the lens centre out to just inside the rim
      const pts = [];
      const nl = high ? 12 : 6;
      const c0 = rimPt(cx, 0, 0);
      // A painted reflection: smoky at the bottom, a cool sky gradient and one
      // soft diagonal streak across the top (the clearcoat adds the live glint)
      const lensTint = (q, k) => {
        const ny = (q[1] - cy) / hh;
        const nx = (q[0] - cx) / hw;
        const streak = gauss(nx + ny * 0.8 - 0.25, 0.22) * sstep(-0.4, 0.4, ny);
        const sky = sstep(-0.6, 1, ny) * k;
        return [0.03 + 0.03 * sky + 0.05 * streak, 0.035 + 0.04 * sky + 0.055 * streak, 0.045 + 0.06 * sky + 0.06 * streak];
      };
      const rings = high ? [0, 0.5, 0.93] : [0, 0.93];
      for (const k of rings) {
        for (let i = 0; i < nl; i++) {
          const q = k === 0 ? [c0[0], c0[1], c0[2] + 0.0006] : rimPt(cx, (i / nl) * Math.PI * 2, k);
          if (k > 0) q[2] += 0.0006 * (1 - k * k);
          pts.push({ p: toModel(q), region: REGION.FIXED, tint: lensTint(q, k === 0 ? 0.5 : 1), mat: MAT.GLOSS });
        }
      }
      emitGrid(b, {
        pts, rows: rings.length, cols: nl, center: new THREE.Vector3(...toModel([c0[0], c0[1], c0[2] - 0.06])), poles: [0], weight: w
      });
    }
    return cx;
  };
  const cxL = rim(1);
  rim(-1);
  // At low detail the rims alone read as glasses
  if (!high) return;
  // Bridge
  const bridge = [];
  const nb = high ? 6 : 3;
  for (let i = 0; i <= nb; i++) {
    const u = i / nb;
    const x = lerp(-(Math.abs(cxL) - hw * (round ? 0.92 : 1)), Math.abs(cxL) - hw * (round ? 0.92 : 1), u);
    const y = cy + (round ? 0.006 : sun ? 0.0095 : 0.008) + 0.003 * Math.sin(u * Math.PI);
    bridge.push(new THREE.Vector3(...toModel([x, y, zFront - Math.abs(x) * 0.12 + 0.0005])));
  }
  sweep(b, { path: bridge, radius: rr * (sun ? 1 : 0.85) * ctx.scale, cols: high ? 5 : 3, region: REGION.FIXED, tint: frame, mat: MAT.GLOSS, weight: w });
  // Temples: hug the side of the head back to the ears (or over the hair)
  for (const s of [1, -1]) {
    const path = [];
    const x0 = s * (Math.abs(cxL) + hw * (sun ? 1.08 : 1));
    const steps = high ? 7 : 3;
    const yHinge = cy + (sun ? 0.009 : 0.006);
    if (up) {
      // Pushed up: the arms run straight back over the hair from the hinges
      const h0 = xf([Math.abs(x0), yHinge, zFront - Math.abs(x0) * 0.12]);
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const z = lerp(h0[2], h0[2] - 0.085, u);
        const y = h0[1] - 0.016 * u * u;
        let x = Math.abs(h0[0]) * (1 - 0.1 * u);
        for (let k = 0; k < 40; k++) {
          if (field.sdf(x, y, z) > 0.002 + (opts.clear || 0)) break;
          x += 0.0012;
        }
        if (i === 0) x = Math.abs(h0[0]);
        path.push(new THREE.Vector3(...ctx.toModel([s * x, y, z])));
      }
      sweep(b, { path, radius: rr * 0.75 * ctx.scale, cols: high ? 4 : 3, region: REGION.FIXED, tint: frame, mat: MAT.GLOSS, weight: w, flat: 0.7 });
      continue;
    }
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      // Back along the side of the head, over the root of the ear, then a
      // short hook down behind it
      const z = lerp(zFront - Math.abs(x0) * 0.12, up ? -0.002 : -0.021, u);
      const hook = up ? 0 : sstep(0.72, 1, u);
      const y = up ? yHinge + 0.004 * u : lerp(yHinge, 0.0205, sstep(0, 0.7, u)) - 0.017 * hook;
      // Find the head's side at this (y, z) and sit just outside it
      let x = Math.abs(x0);
      for (let k = 0; k < 40; k++) {
        const q = xf([x, y, z]);
        if (field.sdf(q[0], q[1], q[2]) > 0.0035 + lift) break;
        x += 0.0015;
      }
      if (i === 0) x = Math.abs(x0);
      // Tuck in between the skull and the ear for the hook
      if (!up && hook > 0) x = lerp(x, Math.min(x, 0.0805), hook);
      path.push(new THREE.Vector3(...toModel([s * x, y, z])));
    }
    sweep(b, { path, radius: rr * (sun ? 0.75 : 0.8) * ctx.scale, cols: high ? 4 : 3, region: REGION.FIXED, tint: frame, mat: MAT.GLOSS, weight: w, flat: 0.7 });
  }
}

/** Sunglasses pushed up onto the hair (spec.shades === 'up'). */
export function buildShadesUp(b, ctx) {
  const st = HAIR_STYLES[ctx.look.hair];
  const hairH = st ? st.h + (st.front || 0) * 0.5 : 0;
  buildGlasses(b, ctx, 'sun', { up: 1.0, clear: ctx.hairUnder + hairH * 0.85 + 0.003, tint: [0.03, 0.03, 0.035] });
}

/* ------------------------------------------------------------ headwear */

export function buildHeadwear(b, ctx, kind) {
  const { field, toModel, res } = ctx;
  const { high } = res;
  const edgeFn = hatEdge(kind);
  const sp = [0, 0, 0];
  const nrm = [0, 0, 0];
  const w = () => [['head', 1]];
  const color = ctx.hatRegion ?? REGION.ACCENT;
  const ht = ctx.hatTint || [1, 1, 1];
  const tk = (k) => [ht[0] * k, ht[1] * k, ht[2] * k];
  if (kind === 'beret') {
    // A beret is worn, not balanced: a snug band low across the forehead
    // and round the back, then a soft flat crown that overhangs to one side
    const cols = high ? 30 : 12;
    const tRows = high ? [0, 0.04, 0.12, 0.24, 0.38, 0.52, 0.66, 0.8, 0.92, 1] : [0, 0.2, 0.55, 1];
    const crown = [0.22, 1, -0.06];
    const cl = Math.hypot(...crown);
    const C = crown.map((v) => v / cl);
    field.surf(0, 1, 0, sp);
    const topY = sp[1] + ctx.hairUnder + 0.007;
    const pts = [];
    for (const t of tRows) {
      for (let j = 0; j < cols; j++) {
        const psiDeg = (j / cols) * 360;
        const psi = psiDeg * DEG;
        const e = edgeFn(psiDeg) * DEG;
        const d = slerpDir(dirFrom(psi, e), C, Math.pow(t, 0.85));
        field.surf(d[0], d[1], d[2], sp);
        field.normal(sp[0], sp[1], sp[2], nrm);
        // Snug band, then the pouf: it swells out just above the band into a
        // wide, flat crown that overhangs most on the side it slouches to
        const side = 1 + 0.4 * Math.max(0, Math.sin(psi)) + 0.12 * Math.max(0, -Math.cos(psi));
        const grow = sstep(0.03, 0.22, t);
        let off = ctx.hairUnder + 0.0035 + (t > 0 && t < 0.05 ? 0.0015 : 0) + 0.03 * side * grow * (1 - 0.65 * sstep(0.6, 1, t));
        if (high && t > 0.1) off += 0.0012 * noise3(d[0] * 9, d[1] * 9, d[2] * 9);
        const p = [sp[0] + nrm[0] * off, sp[1] + nrm[1] * off, sp[2] + nrm[2] * off];
        const nh = Math.hypot(nrm[0], nrm[2]) || 1;
        const push = 0.016 * side * sstep(0.04, 0.3, t) * (1 - sstep(0.62, 0.95, t));
        p[0] += (nrm[0] / nh) * push;
        p[2] += (nrm[2] / nh) * push;
        // A flat, slightly domed crown, tipped down towards the slouch
        const ty = topY + 0.004 * sstep(0.7, 1, t);
        if (p[1] > ty) p[1] = ty + (p[1] - ty) * 0.1;
        p[1] -= 0.075 * (p[0] - 0.01) * grow;
        // The band hugs the head; the rest is cloth, so it shades softly
        const k = t === 0 ? 0.62 : t < 0.05 ? 0.78 : 0.9 + 0.1 * sstep(0.3, 0.9, t);
        pts.push({ p: toModel(p), region: color, tint: tk(k), mat: MAT.CLOTH });
      }
    }
    emitGrid(b, { pts, rows: tRows.length, cols, center: new THREE.Vector3(...toModel([0.01, 0.06, -0.01])), poles: [tRows.length - 1], weight: w });
    // The little stalk on top
    field.surf(C[0], C[1], C[2], sp);
    addBlob(b, {
      c: toModel([sp[0] * 0.6, topY + 0.0045, sp[2] * 0.6]), r: [0.0035, 0.0055, 0.0035].map((v) => v * ctx.scale),
      cols: 5, rows: 3, region: color, tint: tk(0.85), mat: MAT.CLOTH, weight: w
    });
    return;
  }
  if (kind === 'headband') {
    const n = high ? 30 : 12;
    const loop = [[0, -0.018], [0.0045, -0.016], [0.006, 0], [0.0045, 0.016], [0, 0.018], [-0.003, 0]];
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const psiDeg = (i / n) * 360;
      const psi = psiDeg * DEG;
      const e0 = edgeFn(psiDeg) * DEG;
      for (const [o, de] of loop) {
        const d = dirFrom(psi, e0 + de / 0.1);
        field.surf(d[0], d[1], d[2], sp);
        field.normal(sp[0], sp[1], sp[2], nrm);
        const off = ctx.hairUnder + 0.0025 + o;
        pts.push({ p: toModel([sp[0] + nrm[0] * off, sp[1] + nrm[1] * off, sp[2] + nrm[2] * off]), region: color, tint: tk(1), mat: MAT.CLOTH });
      }
    }
    emitGrid(b, { pts, rows: n + 1, cols: loop.length, center: new THREE.Vector3(...toModel([0, 0.03, 0])), weight: w });
    return;
  }
  // Dome hats: cap and beanie
  const beanie = kind === 'beanie';
  const cols = high ? 26 : 10;
  const tRows = high ? [0, 0.015, 0.05, 0.12, 0.22, 0.34, 0.48, 0.63, 0.78, 0.9, 1] : [0, 0.08, 0.5, 1];
  const crown = [0, 1, -0.12];
  const pts = [];
  const cuffT = beanie ? 0.2 : 0;
  for (const t of tRows) {
    for (let j = 0; j < cols; j++) {
      const psiDeg = (j / cols) * 360;
      const psi = psiDeg * DEG;
      const e = edgeFn(psiDeg) * DEG;
      const d = slerpDir(dirFrom(psi, e), crown.map((v) => v / Math.hypot(...crown)), Math.pow(t, 0.9));
      field.surf(d[0], d[1], d[2], sp);
      field.normal(sp[0], sp[1], sp[2], nrm);
      let off = ctx.hairUnder + (t === 0 ? -0.0008 : 0.0055);
      if (beanie) {
        off += 0.002 + (t > 0 && t <= cuffT ? 0.004 : 0) + 0.006 * t * t;
        if (high && t > cuffT) off += 0.0007 * Math.sin(psi * cols * 0.5);
      } else {
        off += 0.009 * t * t + 0.003 * Math.sin(Math.min(1, t * 1.4) * Math.PI) * Math.max(0, Math.cos(psi));
      }
      const p = [sp[0] + nrm[0] * off, sp[1] + nrm[1] * off, sp[2] + nrm[2] * off];
      let k = 1;
      if (beanie && t > 0 && t <= cuffT) k = 0.9;
      if (!beanie && high) k = 1 - 0.08 * Math.abs(Math.sin(psi * 3));
      pts.push({ p: toModel(p), region: color, tint: tk(k), mat: MAT.CLOTH });
    }
  }
  emitGrid(b, { pts, rows: tRows.length, cols, center: new THREE.Vector3(...toModel([0, 0.02, 0])), poles: [tRows.length - 1], weight: w });
  if (beanie) return;
  // Cap: brim and button
  const n = high ? 13 : 6;
  const loop = [[0, 0.0015], [0.6, 0.002], [1, 0.0012], [1.02, -0.0012], [0.6, -0.002], [0, -0.0015]];
  const bpts = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const psiDeg = lerp(-62, 62, u);
    const psi = psiDeg * DEG;
    const e = edgeFn(psiDeg) * DEG;
    const d = dirFrom(psi, e);
    field.surf(d[0], d[1], d[2], sp);
    field.normal(sp[0], sp[1], sp[2], nrm);
    const base = [sp[0] + nrm[0] * (ctx.hairUnder + 0.004), sp[1] + nrm[1] * (ctx.hairUnder + 0.004), sp[2] + nrm[2] * (ctx.hairUnder + 0.004)];
    const pinch = sstep(0, 0.1, u) * sstep(1, 0.9, u);
    const len = 0.068 * Math.cos(psi * 0.75) * (0.25 + 0.75 * pinch);
    for (const [v, th] of loop) {
      const reach = v * len;
      const curve = -0.012 * (1 - Math.cos(psi * 1.2)) * v;
      const p = [
        base[0] + Math.sin(psi) * reach * 0.6,
        base[1] - 0.1 * reach + curve + th * (0.4 + 0.6 * pinch) - 0.004,
        base[2] + Math.cos(psi) * reach
      ];
      bpts.push({ p: toModel(p), region: color, tint: tk(th < 0 ? 0.72 : 0.95), mat: MAT.CLOTH });
    }
  }
  emitGrid(b, { pts: bpts, rows: n, cols: loop.length, center: new THREE.Vector3(...toModel([0, 0.03, 0.12])), weight: w });
  field.surf(crown[0], crown[1], crown[2], sp);
  addBlob(b, {
    c: toModel([sp[0], sp[1] + ctx.hairUnder + 0.0145, sp[2]]), r: [0.007, 0.004, 0.007].map((v) => v * ctx.scale),
    cols: 6, rows: 3, region: color, tint: tk(0.85), mat: MAT.CLOTH, weight: w
  });
}
