/**
 * Pekkas Pokal — people: hands. Bone layout, the grip library and the
 * solver that closes the fingers around a held object.
 *
 * Anatomy (per side, S = L | R; every bone body-aligned at zero rotation)
 *   hand → thumb (CMC: the metacarpal, real opposition) → thumbMid (MCP) → thumbTip (IP)
 *   hand → index → indexMid → indexTip         (proximal, middle, distal phalanx)
 *   hand → middle → middleMid → middleTip
 *   hand → palm (the 4th/5th metacarpals: the palm arch) → ring → ringMid → ringTip
 *                                                        → pinky → pinkyMid → pinkyTip
 *   Old names stay as aliases: fingers = middle, fingersTip = middleMid.
 *
 * Hand space (left hand, metres in the 1.80 m model, before the build's hand
 * scale): [d, y, f] = X (dorsal: +X is the back of the LEFT hand, the palm
 * faces −X), Y up the forearm, Z towards the thumb. The right hand is the
 * mirror image (x → −x); its quaternions are mirrored as (x, −y, −z, w).
 *
 * Signs: finger flexion is rotation.z = −flex (left) / +flex (right);
 * rotation.x < 0 spreads a finger towards the thumb. The thumb flexes about
 * its own hinge axis (THUMB.axis), not a body axis.
 *
 * A "hand config" is a Float32Array of HAND_BONES.length quaternions
 * (x, y, z, w) in LEFT-hand space. GRIPS (below) are solved into configs:
 * every finger joint curls until its segment touches the object's surface
 * (signed distance fields), so fingers wrap a handle of any size without
 * sinking into it or floating off it.
 */
import * as THREE from 'three';

/** Finger bones per side, in config order (append the side letter). */
export const HAND_BONES = [
  'thumb', 'thumbMid', 'thumbTip',
  'index', 'indexMid', 'indexTip',
  'middle', 'middleMid', 'middleTip',
  'palm',
  'ring', 'ringMid', 'ringTip',
  'pinky', 'pinkyMid', 'pinkyTip'
];
export const HAND_PARENT = {
  thumb: 'hand', thumbMid: 'thumb', thumbTip: 'thumbMid',
  index: 'hand', indexMid: 'index', indexTip: 'indexMid',
  middle: 'hand', middleMid: 'middle', middleTip: 'middleMid',
  palm: 'hand',
  ring: 'palm', ringMid: 'ring', ringTip: 'ringMid',
  pinky: 'palm', pinkyMid: 'pinky', pinkyTip: 'pinkyMid'
};
/** Legacy bone names → new bones. */
export const HAND_ALIASES = { fingers: 'middle', fingersTip: 'middleMid' };
const NB = HAND_BONES.length;
const BI = Object.fromEntries(HAND_BONES.map((n, i) => [n, i]));

/**
 * Digits (left hand, hand scale 1). mcp: knuckle joint [d, y, f];
 * len: phalanx lengths (the distal one to the tip); r: half widths
 * (thickness is 0.86 of the width); rest: the natural cascade
 * [spread, flexMCP, flexPIP, flexDIP] — the little finger curls most.
 */
export const DIGITS = {
  index: { mcp: [-0.0015, -0.0935, 0.0272], len: [0.0338, 0.0207, 0.0172], r: [0.0093, 0.0084, 0.0076], rest: [-0.05, 0.16, 0.2, 0.1] },
  middle: { mcp: [0.0005, -0.0965, 0.0091], len: [0.0372, 0.0228, 0.0178], r: [0.0096, 0.0087, 0.0078], rest: [-0.005, 0.24, 0.3, 0.14] },
  ring: { mcp: [-0.001, -0.095, -0.0091], len: [0.0352, 0.0217, 0.0172], r: [0.0091, 0.0083, 0.0075], rest: [0.045, 0.32, 0.38, 0.18] },
  pinky: { mcp: [-0.0042, -0.0885, -0.0266], len: [0.0272, 0.0162, 0.0152], r: [0.0082, 0.0075, 0.0068], rest: [0.12, 0.4, 0.46, 0.22] }
};
export const FINGER_NAMES = ['index', 'middle', 'ring', 'pinky'];

/** The palm-arch bone's pivot (between the middle and ring metacarpals). */
export const PALM_PIVOT = [0.0, -0.022, -0.0005];
/** Palm block (for collisions and the mesh): centre and half sizes [d, y, f]. */
export const PALM = { c: [0.0005, -0.051, 0.0008], half: [0.0158, 0.05, 0.0355] };

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const TD = norm3([-0.3, -0.84, 0.45]);
const PD = (() => {
  const v = [-0.55, 0, -0.83];
  const k = v[0] * TD[0] + v[1] * TD[1] + v[2] * TD[2];
  return norm3([v[0] - k * TD[0], v[1] - k * TD[1], v[2] - k * TD[2]]);
})();
const TA = norm3([TD[1] * PD[2] - TD[2] * PD[1], TD[2] * PD[0] - TD[0] * PD[2], TD[0] * PD[1] - TD[1] * PD[0]]);
/**
 * Thumb (left hand). cmc: the carpometacarpal joint; dir: the resting
 * direction of the whole thumb; pad: where its pad faces at rest; axis:
 * the MCP/IP hinge (positive rotation flexes towards the pad).
 */
export const THUMB = {
  cmc: [-0.0085, -0.0255, 0.0205], dir: TD, pad: PD, axis: TA,
  len: [0.042, 0.031, 0.0262], r: [0.0128, 0.0106, 0.0097]
};

/* ------------------------------------------------------------ configs */

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const AX_TD = new THREE.Vector3(...TD);
const AX_TA = new THREE.Vector3(...TA);
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);

/** Thumb CMC rotation: roll (pronation) about the thumb, palmar abduction, radial abduction. */
function thumbBaseQuat(radAbd, palmAbd, pron, out) {
  out.setFromAxisAngle(AX_X, -radAbd);
  _q2.setFromAxisAngle(AX_Z, -palmAbd);
  out.multiply(_q2);
  _q2.setFromAxisAngle(AX_TD, pron);
  return out.multiply(_q2);
}

/**
 * Joint parameters → config. p = {
 *   index|middle|ring|pinky: [spread, flexMCP, flexPIP, flexDIP],
 *   thumb: [radialAbduction, palmarAbduction, pronation, flexMCP, flexIP],
 *   palm: cup (arch, rad)
 * }
 */
export function configFromParams(p, out = new Float32Array(NB * 4)) {
  const put = (name, q) => {
    const i = BI[name] * 4;
    out[i] = q.x;
    out[i + 1] = q.y;
    out[i + 2] = q.z;
    out[i + 3] = q.w;
  };
  for (const f of FINGER_NAMES) {
    const a = p[f];
    put(f, _q.setFromEuler(_e.set(a[0], 0, -a[1])));
    put(`${f}Mid`, _q.setFromEuler(_e.set(0, 0, -a[2])));
    put(`${f}Tip`, _q.setFromEuler(_e.set(0, 0, -a[3])));
  }
  const t = p.thumb;
  put('thumb', thumbBaseQuat(t[0], t[1], t[2], _q));
  put('thumbMid', _q.setFromAxisAngle(AX_TA, t[3]));
  put('thumbTip', _q.setFromAxisAngle(AX_TA, t[4]));
  const cup = p.palm || 0;
  put('palm', _q.setFromEuler(_e.set(0, cup, -cup * 0.35)));
  return out;
}

/** Per-bone slerp of two configs into `out` (any may alias). */
export function mixConfigs(a, b, k, out) {
  for (let i = 0; i < NB; i++) {
    const o = i * 4;
    _q.set(a[o], a[o + 1], a[o + 2], a[o + 3]);
    _q2.set(b[o], b[o + 1], b[o + 2], b[o + 3]);
    _q.slerp(_q2, k);
    out[o] = _q.x;
    out[o + 1] = _q.y;
    out[o + 2] = _q.z;
    out[o + 3] = _q.w;
  }
  return out;
}

/** Write a config into the bones of one side (mirrored for the right). */
export function writeConfig(bones, side, cfg, blend = 1) {
  const S = side === 'L' ? 'L' : 'R';
  const m = S === 'R' ? -1 : 1;
  for (let i = 0; i < NB; i++) {
    const o = i * 4;
    const b = bones[HAND_BONES[i] + S];
    if (!b) continue;
    _q.set(cfg[o], cfg[o + 1] * m, cfg[o + 2] * m, cfg[o + 3]);
    if (blend >= 1) b.quaternion.copy(_q);
    else b.quaternion.slerp(_q, blend);
  }
}

/** Read one side's finger bones into a config (left-hand space). */
export function readConfig(bones, side, out = new Float32Array(NB * 4)) {
  const S = side === 'L' ? 'L' : 'R';
  const m = S === 'R' ? -1 : 1;
  for (let i = 0; i < NB; i++) {
    const b = bones[HAND_BONES[i] + S];
    const o = i * 4;
    const q = b ? b.quaternion : _q.identity();
    out[o] = q.x;
    out[o + 1] = q.y * m;
    out[o + 2] = q.z * m;
    out[o + 3] = q.w;
  }
  return out;
}

/* ------------------------------------------------------------ solver */

const V = () => new THREE.Vector3();
const _a = V();
const _b = V();
const _c = V();
const _d = V();
const _m3 = new THREE.Matrix3();

/** Signed distance of hand-space point p to a shape (already in hand space). */
function sdf(sh, p) {
  _a.subVectors(p, sh.c);
  if (sh.type === 'sphere') return _a.length() - sh.r;
  // Into the shape's frame
  _a.applyQuaternion(sh.qi);
  if (sh.type === 'cyl') {
    const h = Math.abs(_a.y) - sh.h;
    const rad = Math.hypot(_a.x, _a.z) - sh.r;
    const ox = Math.max(rad, 0);
    const oy = Math.max(h, 0);
    return Math.min(Math.max(rad, h), 0) + Math.hypot(ox, oy);
  }
  if (sh.type === 'box') {
    const qx = Math.abs(_a.x) - sh.half[0] + sh.round;
    const qy = Math.abs(_a.y) - sh.half[1] + sh.round;
    const qz = Math.abs(_a.z) - sh.half[2] + sh.round;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - sh.round;
  }
  if (sh.type === 'torus') {
    // Ring in the shape's XY plane (axis +Z), ring radius R, tube radius r
    const q = Math.hypot(_a.x, _a.y) - sh.R;
    return Math.hypot(q, _a.z) - sh.r;
  }
  return 1;
}

function sceneSdf(shapes, p) {
  let d = 1;
  for (const sh of shapes) d = Math.min(d, sdf(sh, p));
  return d;
}

/** The palm as a rounded block (fingers must not curl into it). */
function palmShape(hs) {
  return {
    type: 'box', c: new THREE.Vector3(PALM.c[0] * hs - 0.001, PALM.c[1] * hs, PALM.c[2] * hs),
    qi: new THREE.Quaternion(), half: [PALM.half[0] * hs, PALM.half[1] * hs, PALM.half[2] * hs], round: 0.008 * hs
  };
}

/** Forward kinematics of a finger: joints[0..3] and segment frames. */
function fingerFK(name, a, palmQ, hs, out) {
  const D = DIGITS[name];
  const j0 = out.j[0].set(D.mcp[0] * hs, D.mcp[1] * hs, D.mcp[2] * hs);
  const base = out.q[0].identity();
  if (name === 'ring' || name === 'pinky') {
    _b.set(PALM_PIVOT[0] * hs, PALM_PIVOT[1] * hs, PALM_PIVOT[2] * hs);
    j0.sub(_b).applyQuaternion(palmQ).add(_b);
    base.copy(palmQ);
  }
  const q1 = out.q[1].copy(base).multiply(_q.setFromEuler(_e.set(a[0], 0, -a[1])));
  out.j[1].set(0, -D.len[0] * hs, 0).applyQuaternion(q1).add(j0);
  const q2 = out.q[2].copy(q1).multiply(_q.setFromEuler(_e.set(0, 0, -a[2])));
  out.j[2].set(0, -D.len[1] * hs, 0).applyQuaternion(q2).add(out.j[1]);
  const q3 = out.q[3].copy(q2).multiply(_q.setFromEuler(_e.set(0, 0, -a[3])));
  out.j[3].set(0, -D.len[2] * hs, 0).applyQuaternion(q3).add(out.j[2]);
  return out;
}

function thumbFK(t, hs, out) {
  const T = THUMB;
  out.j[0].set(T.cmc[0] * hs, T.cmc[1] * hs, T.cmc[2] * hs);
  const q1 = thumbBaseQuat(t[0], t[1], t[2], out.q[1]);
  out.j[1].copy(AX_TD).multiplyScalar(T.len[0] * hs).applyQuaternion(q1).add(out.j[0]);
  const q2 = out.q[2].copy(q1).multiply(_q.setFromAxisAngle(AX_TA, t[3]));
  out.j[2].copy(AX_TD).multiplyScalar(T.len[1] * hs).applyQuaternion(q2).add(out.j[1]);
  const q3 = out.q[3].copy(q2).multiply(_q.setFromAxisAngle(AX_TA, t[4]));
  out.j[3].copy(AX_TD).multiplyScalar(T.len[2] * hs).applyQuaternion(q3).add(out.j[2]);
  return out;
}

const mkChain = () => ({ j: [V(), V(), V(), V()], q: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()] });
const FK = mkChain();
const FK2 = mkChain();

/** Deepest penetration of segment k (from j[k] to j[k+1]) into the shapes. */
function segPen(shapes, ch, k, r, from = 0.15) {
  let worst = -1;
  for (const f of [from, 0.5, 0.82, 1.0]) {
    _c.lerpVectors(ch.j[k], ch.j[k + 1], f);
    const rr = f >= 1 ? r * 0.82 : r;
    const pen = rr - sceneSdf(shapes, _c);
    if (pen > worst) worst = pen;
  }
  return worst;
}

/** Penetration against the palm block (only the distal segments can reach it). */
function palmPen(palm, ch, k, r) {
  if (k === 0) return -1;
  let worst = -1;
  for (const f of [0.5, 1.0]) {
    _c.lerpVectors(ch.j[k], ch.j[k + 1], f);
    worst = Math.max(worst, r * 0.9 - sdf(palm, _c));
  }
  return worst;
}

/**
 * Curl one finger until each segment rests on the object (or the palm).
 * spec: { start: [spread, f1, f2, f3], rate: [r1, r2, r3], max: [m1, m2, m3] }
 */
function curlFinger(name, spec, shapes, palm, palmQ, hs, margin) {
  const D = DIGITS[name];
  const a = spec.start.slice();
  const rate = spec.rate || [1, 1.15, 0.8];
  const max = spec.max || [1.6, 1.85, 1.35];
  const step = 0.025;
  const r = D.r.map((x) => x * hs * 0.9 + margin);
  const hits = (cfg, from) => {
    fingerFK(name, cfg, palmQ, hs, FK);
    for (let k = from; k < 3; k++) {
      if (segPen(shapes, FK, k, r[k], k === 0 ? 0.45 : 0.15) > 0 || palmPen(palm, FK, k, r[k]) > 0) return k;
    }
    return -1;
  };
  // Open up first if the start already intersects
  for (let it = 0; it < 60; it++) {
    const k = hits(a, 0);
    if (k < 0) break;
    for (let j = 0; j <= k; j++) a[j + 1] = Math.max(-0.3, a[j + 1] - step * rate[j]);
  }
  if (spec.fixed) return a;
  let first = 0;
  for (let it = 0; it < 240 && first < 3; it++) {
    const trial = a.slice();
    let moved = false;
    for (let j = first; j < 3; j++) {
      const v = Math.min(max[j], trial[j + 1] + step * rate[j]);
      if (v > trial[j + 1] + 1e-6) moved = true;
      trial[j + 1] = v;
    }
    if (!moved) break;
    const k = hits(trial, first);
    if (k < 0) {
      for (let j = first; j < 3; j++) a[j + 1] = trial[j + 1];
    } else {
      // Segment k touches: the joints that carry it stop, the rest keep curling
      first = k + 1;
    }
  }
  return a;
}

/** Distance between two segments (closest points), for thumb/finger contact. */
function segSeg(p1, q1, p2, q2) {
  const d1 = _a.subVectors(q1, p1);
  const d2 = _b.subVectors(q2, p2);
  const r = _c.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s;
  let t;
  const c = d1.dot(r);
  const b = d1.dot(d2);
  const den = a * e - b * b;
  s = den > 1e-12 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = THREE.MathUtils.clamp(-c / a, 0, 1);
  } else if (t > 1) {
    t = 1;
    s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
  }
  _d.copy(p1).addScaledVector(d1, s).sub(_v.copy(p2).addScaledVector(d2, t));
  return _d.length();
}

/**
 * Thumb: search the CMC angles (and MCP/IP flex) that put the thumb pad on
 * `target` without entering the object, the palm or the fingers.
 */
function solveThumb(spec, shapes, palm, fingers, hs, margin) {
  const T = THUMB;
  const r = T.r.map((x) => x * hs * 0.9 + margin);
  const target = spec.target;
  const pron = spec.pron ?? 0.55;
  const cost = (t) => {
    thumbFK(t, hs, FK2);
    let c = 0;
    for (let k = 0; k < 3; k++) {
      const pen = segPen(shapes, FK2, k, r[k], k === 0 ? 0.55 : 0.1);
      if (pen > 0) c += pen * pen * 4000;
      if (k > 0) {
        const pp = palmPen(palm, FK2, k, r[k]);
        if (pp > 0) c += pp * pp * 4000;
        for (const fc of fingers) {
          for (let s = 0; s < 3; s++) {
            const dd = segSeg(FK2.j[k], FK2.j[k + 1], fc.j[s], fc.j[s + 1]) - (r[k] + fc.r[s]);
            if (dd < 0) c += dd * dd * 4000;
          }
        }
      }
    }
    if (target) {
      // Pad point: the middle of the distal segment, on the pad side
      _c.lerpVectors(FK2.j[2], FK2.j[3], 0.55);
      _d.set(...T.pad).applyQuaternion(FK2.q[3]).multiplyScalar(r[2]);
      _c.add(_d);
      c += _c.distanceToSquared(target) * 30;
    }
    // Prefer the given posture a little (keeps the solution natural)
    const g = spec.guess;
    for (let i = 0; i < 5; i++) c += (t[i] - g[i]) * (t[i] - g[i]) * 0.0004 * (spec.weights ? spec.weights[i] : 1);
    return c;
  };
  let best = spec.guess.slice();
  best[2] = spec.guess[2] ?? pron;
  if (!target && !spec.wrap) return best;
  let bc = cost(best);
  // Coordinate descent with shrinking steps
  let step = 0.24;
  for (let round = 0; round < 7; round++) {
    let improved = true;
    for (let it = 0; it < 8 && improved; it++) {
      improved = false;
      for (const i of [0, 1, 3, 4, 2]) {
        for (const sgn of [1, -1]) {
          const t = best.slice();
          t[i] += sgn * step;
          if (i === 3 || i === 4) t[i] = THREE.MathUtils.clamp(t[i], -0.25, 1.5);
          if (i === 1) t[i] = THREE.MathUtils.clamp(t[i], -0.2, 1.6);
          if (i === 0) t[i] = THREE.MathUtils.clamp(t[i], -0.6, 1.0);
          if (i === 2) t[i] = THREE.MathUtils.clamp(t[i], -0.3, 1.4);
          const c = cost(t);
          if (c < bc) {
            bc = c;
            best = t;
            improved = true;
          }
        }
      }
    }
    step *= 0.5;
  }
  return best;
}

/* ------------------------------------------------------------ grips */

const HAND_SCALE_DEFAULT = 1.09;
const _fq = new THREE.Quaternion();
const _mx = new THREE.Matrix4();
const _xa = V();
const _ya = V();
const _za = V();

/** Frame from a long axis (+Y) and an approximate +Z; returns a quaternion. */
function frameYZ(y, zHint, out = new THREE.Quaternion()) {
  _ya.copy(y).normalize();
  _za.copy(zHint).addScaledVector(_ya, -zHint.dot(_ya)).normalize();
  _xa.crossVectors(_ya, _za);
  _mx.makeBasis(_xa, _ya, _za);
  return out.setFromRotationMatrix(_mx);
}

/** The palm's surface (−X side, left hand) at hand scale hs. */
const palmSurface = (hs) => (PALM.c[0] - PALM.half[0]) * hs;
const PALM_N = new THREE.Vector3(-1, 0, 0);
const n = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

/**
 * The grip library. Each entry: (o, hs) → {
 *   pos, quat:  the object's frame in left-hand space (model metres),
 *   shapes:     collision shapes in OBJECT space,
 *   fingers:    per finger { start, rate?, max?, fixed? },
 *   thumb:      { guess: [radAbd, palmAbd, pron, mcp, ip], target?: object-space point | fn(fk) }
 *   palm:       arch (rad)
 * }  `o` are the caller's options in model metres (already ÷ person scale).
 * Object conventions are documented in people.js (hold()).
 */
export const GRIPS = {
  relaxed: () => ({
    fixed: true,
    params: {
      index: DIGITS.index.rest, middle: DIGITS.middle.rest, ring: DIGITS.ring.rest, pinky: DIGITS.pinky.rest,
      thumb: [0.08, 0.32, 0.25, 0.14, 0.12], palm: 0.05
    }
  }),
  open: () => ({
    fixed: true,
    params: {
      index: [-0.13, 0.03, 0.04, 0.02], middle: [-0.02, 0.04, 0.05, 0.02], ring: [0.09, 0.05, 0.06, 0.03], pinky: [0.24, 0.06, 0.07, 0.03],
      thumb: [0.42, 0.12, 0.1, 0.05, 0.02], palm: -0.02
    }
  }),
  /** A clenched fist; the hole sits on the legacy gripL/gripR socket. */
  fist: (o, hs) => {
    const R = o.diameter ? o.diameter / 2 : 0.0062;
    const ax = n(0, -Math.sin(0.32), Math.cos(0.32));
    return {
      pos: new THREE.Vector3(Math.min(-0.024, palmSurface(hs) - R - 0.0004), -0.078 - (hs - 1) * 0.05, 0.006),
      quat: frameYZ(ax, PALM_N),
      shapes: [{ type: 'cyl', r: R, h: 0.06 }],
      fingers: wrapAll([0, 0.9, 1.1, 0.7], 0.12),
      thumb: { guess: [-0.05, 0.75, 0.75, 0.45, 0.55], target: overIndex(0.55, 0.75) },
      palm: 0.16
    };
  },
  /** Cylinder wrap: bat, rod or umbrella handle. o.diameter (default 32 mm). */
  power: (o, hs) => {
    const R = (o.diameter || 0.032) / 2;
    const ax = n(0, -Math.sin(0.3), Math.cos(0.3));
    return {
      pos: new THREE.Vector3(palmSurface(hs) - R - 0.0008, DIGITS.middle.mcp[1] * hs + R + 0.0075 * hs, 0.004 * hs),
      quat: frameYZ(ax, PALM_N),
      shapes: [{ type: 'cyl', r: R, h: Math.max(0.08, o.length ? o.length / 2 : 0.15) }],
      fingers: wrapAll([0, 0.35, 0.3, 0.15], 0.06),
      thumb: { guess: [-0.1, 0.8, 0.8, 0.35, 0.35], target: overIndex(0.5, 0.65 + R * 6) },
      palm: 0.12
    };
  },
  /**
   * Shakehand table-tennis grip. Object +Y runs up the handle into the
   * blade, +Z is the forehand rubber's normal (the palm side).
   * o.handle = [width, thickness] (default 26 × 22 mm), o.blade = radius.
   */
  racket: (o, hs) => {
    const hw = (o.handle?.[0] || 0.026) / 2;
    const ht = (o.handle?.[1] || 0.022) / 2;
    const br = o.blade || 0.078;
    const ax = n(0, -Math.sin(0.62), Math.cos(0.62));
    const zh = new THREE.Vector3(-0.72, 0.0, -0.69);
    return {
      pos: new THREE.Vector3(palmSurface(hs) - ht - 0.003, DIGITS.middle.mcp[1] * hs + hw + 0.006, -0.002),
      quat: frameYZ(ax, zh),
      shapes: [
        { type: 'box', pos: [0, -0.01, 0], half: [hw, 0.05, ht], round: 0.005 },
        { type: 'cyl', pos: [0, 0.05 + br * 0.92, 0], rot: [Math.PI / 2, 0, 0], r: br, h: 0.0035 }
      ],
      fingers: {
        index: { start: [-0.16, 0.42, 0.18, 0.06], rate: [0.6, 0.35, 0.2], max: [0.9, 0.5, 0.3] },
        middle: { start: [0.0, 0.5, 0.5, 0.25] },
        ring: { start: [0.05, 0.5, 0.5, 0.25] },
        pinky: { start: [0.12, 0.5, 0.5, 0.25] }
      },
      thumb: { guess: [0.05, 0.55, 0.45, 0.2, 0.12], target: [0, 0.052, ht + 0.0035 + 0.0085] },
      palm: 0.1
    };
  },
  /**
   * French foil grip. Object +Y runs from the pommel through the guard to
   * the blade (along the forearm, tipped towards the thumb); +Z is the
   * flat the thumb presses (up when the palm faces up). o.handle =
   * [width, thickness] (default 16 × 12 mm).
   */
  foil: (o, hs) => {
    const hw = (o.handle?.[0] || 0.016) / 2;
    const ht = (o.handle?.[1] || 0.012) / 2;
    const tilt = (25 * Math.PI) / 180;
    const ax = n(0, -Math.cos(tilt), Math.sin(tilt));
    return {
      pos: new THREE.Vector3(palmSurface(hs) - hw - 0.0035, -0.088 * hs, 0.022 * hs),
      quat: frameYZ(ax, new THREE.Vector3(0.0, 0.25, 1)),
      shapes: [
        { type: 'box', pos: [0, -0.02, 0], half: [hw, 0.075, ht], round: 0.004 },
        { type: 'cyl', pos: [0, 0.062, 0], r: 0.045, h: 0.012 }
      ],
      fingers: {
        index: { start: [-0.1, 0.55, 0.9, 0.35], rate: [0.6, 1.2, 0.7] },
        middle: { start: [0.0, 0.5, 0.75, 0.4] },
        ring: { start: [0.05, 0.6, 0.8, 0.4] },
        pinky: { start: [0.12, 0.7, 0.9, 0.45] }
      },
      thumb: { guess: [0.1, 0.55, 0.5, 0.1, 0.05], target: [0, 0.03, ht + 0.0105] },
      palm: 0.08
    };
  },
  /** Tripod grip for a pen or brush. Object +Y runs towards the tip. o.diameter (default 9 mm). */
  pinch: (o, hs) => {
    const R = (o.diameter || 0.009) / 2;
    const ax = n(-0.55, -0.72, -0.42);
    return {
      pos: new THREE.Vector3(-0.034 * hs, -0.128 * hs, 0.032 * hs),
      quat: frameYZ(ax, new THREE.Vector3(0.6, 0, -0.8)),
      shapes: [{ type: 'cyl', r: R, h: 0.15 }],
      fingers: {
        index: { start: [-0.08, 0.45, 0.55, 0.15], rate: [0.6, 1, 0.5] },
        middle: { start: [0.02, 0.55, 0.85, 0.3], rate: [0.7, 1, 0.5] },
        ring: { start: [0.06, 0.95, 1.2, 0.55], fixed: true },
        pinky: { start: [0.14, 1.05, 1.25, 0.6], fixed: true }
      },
      thumb: { guess: [0.05, 0.6, 0.55, 0.25, 0.2], target: [0.0, 0.004, -0.013] },
      palm: 0.1
    };
  },
  /**
   * Fingers through a mug handle, the thumb on top of it. Object origin:
   * the middle of the handle's grip bar; +Y the mug's up; +Z towards the
   * mug body. o.handle = inner height of the loop (default 40 mm).
   */
  hook: (o, hs) => {
    const bar = (o.bar || 0.008) / 2;
    const loop = (o.handle || 0.04) / 2;
    return {
      pos: new THREE.Vector3(palmSurface(hs) - 0.022 * hs, -0.122 * hs, 0.006 * hs),
      quat: frameYZ(n(0, -0.12, 1), PALM_N),
      shapes: [
        { type: 'cyl', r: bar, h: loop + bar },
        { type: 'cyl', pos: [0, 0, 0.012 + loop + 0.04], r: 0.04, h: 0.05 }
      ],
      fingers: {
        index: { start: [-0.04, 0.4, 0.5, 0.3] },
        middle: { start: [0.0, 0.45, 0.6, 0.3] },
        ring: { start: [0.06, 0.8, 1.1, 0.6] },
        pinky: { start: [0.14, 0.9, 1.2, 0.6] }
      },
      thumb: { guess: [0.1, 0.55, 0.5, 0.2, 0.15], target: [0, loop + bar + 0.004, -0.002] },
      palm: 0.08
    };
  },
  /** Around a cup without a handle. Object +Y is the cup's up, origin on its axis. o.diameter (75 mm). */
  cup: (o, hs) => {
    const R = (o.diameter || 0.075) / 2;
    return {
      pos: new THREE.Vector3(palmSurface(hs) - R - 0.001, -0.075 * hs, 0.0),
      quat: frameYZ(n(0, -0.15, 1), PALM_N),
      shapes: [{ type: 'cyl', r: R, h: (o.height || 0.09) / 2 }],
      fingers: wrapAll([0, 0.15, 0.25, 0.12], 0.1),
      thumb: { guess: [0.35, 0.5, 0.4, 0.1, 0.05], target: null, wrap: true },
      palm: 0.15
    };
  },
  /**
   * A notebook, clipboard or scorecard: thumb on top, fingers under.
   * Object origin: the held edge's middle at mid-thickness; +Y the top
   * face's normal (thumb side); the board extends along +Z.
   * o.thickness (default 10 mm).
   */
  flat: (o, hs) => {
    const ht = (o.thickness || 0.01) / 2;
    return {
      pos: new THREE.Vector3(-0.034 * hs, -0.118 * hs, 0.038 * hs),
      quat: frameYZ(n(-0.95, 0.0, -0.3), n(0.1, -1, 0.15)),
      shapes: [{ type: 'box', pos: [0, 0, 0.12], half: [0.12, ht, 0.12], round: 0.002 }],
      fingers: {
        index: { start: [-0.1, 0.3, 0.1, 0.05], rate: [1, 0.6, 0.4] },
        middle: { start: [-0.02, 0.3, 0.1, 0.05], rate: [1, 0.6, 0.4] },
        ring: { start: [0.06, 0.3, 0.12, 0.06], rate: [1, 0.6, 0.4] },
        pinky: { start: [0.15, 0.32, 0.15, 0.08], rate: [1, 0.6, 0.4] }
      },
      thumb: { guess: [0.25, 0.4, 0.3, 0.05, 0.05], target: [0, ht + 0.009, 0.012] },
      palm: 0.04
    };
  },
  /**
   * A painter's palette: thumb up through the hole, fingers under the
   * board, the board resting along the forearm. Object origin: the thumb
   * hole's centre at mid-thickness; +Y the paint side; the board extends
   * along +X (cast.js convention). o.thickness (default 9 mm).
   */
  palette: (o, hs) => {
    const ht = (o.thickness || 0.009) / 2;
    return {
      pos: new THREE.Vector3(-0.04 * hs, -0.09 * hs, 0.054 * hs),
      quat: frameYZ(n(-1, 0.05, 0.12), n(0, 0.7, 0.7)),
      shapes: [{ type: 'box', pos: [0.13, 0, 0.02], half: [0.15, ht, 0.12], round: 0.003, hole: 0.02 }],
      fingers: {
        index: { start: [-0.06, 0.5, 0.35, 0.15], rate: [1, 0.8, 0.5] },
        middle: { start: [0.0, 0.5, 0.35, 0.15], rate: [1, 0.8, 0.5] },
        ring: { start: [0.06, 0.55, 0.4, 0.2], rate: [1, 0.8, 0.5] },
        pinky: { start: [0.14, 0.6, 0.45, 0.2], rate: [1, 0.8, 0.5] }
      },
      thumb: { guess: [0.25, 0.25, 0.2, 0.1, 0.1], target: null },
      palm: 0.06
    };
  },
  /** A small ball (ping-pong toss) in the fingertips. Origin = ball centre. o.diameter (40 mm). */
  ball: (o, hs) => {
    const R = (o.diameter || 0.04) / 2;
    return {
      pos: new THREE.Vector3(-0.03 * hs - R, -0.142 * hs, 0.032 * hs),
      quat: new THREE.Quaternion(),
      shapes: [{ type: 'sphere', r: R }],
      fingers: {
        index: { start: [-0.05, 0.4, 0.3, 0.15] },
        middle: { start: [0.0, 0.42, 0.3, 0.15] },
        ring: { start: [0.06, 0.6, 0.6, 0.3], rate: [1, 1, 0.8] },
        pinky: { start: [0.14, 0.75, 0.8, 0.4], rate: [1, 1, 0.8] }
      },
      thumb: { guess: [0.1, 0.65, 0.6, 0.15, 0.15], target: [0.0, R * 0.4, -R - 0.009] },
      palm: 0.1
    };
  },
  /** Index finger extended, the others in a fist, the thumb over the middle finger. */
  point: (o, hs) => {
    const f = GRIPS.fist(o, hs);
    f.fingers.index = { start: [-0.02, 0.06, 0.05, 0.02], fixed: true };
    f.thumb = { guess: [-0.05, 0.8, 0.8, 0.4, 0.5], target: overFinger('middle', 0.5, 0.7) };
    return f;
  },
  /** Thumbs up: a fist with the thumb straight up out of the top. */
  thumbsUp: (o, hs) => {
    const f = GRIPS.fist(o, hs);
    f.thumb = { guess: [0.55, -0.1, 0.0, -0.05, -0.1], target: null };
    return f;
  }
};
export const GRIP_NAMES = Object.keys(GRIPS);

function wrapAll(start, spreadStep) {
  return {
    index: { start: [start[0] - spreadStep * 0.6, start[1], start[2], start[3]] },
    middle: { start: [start[0], start[1], start[2], start[3]] },
    ring: { start: [start[0] + spreadStep * 0.5, start[1], start[2], start[3]] },
    pinky: { start: [start[0] + spreadStep * 1.2, start[1], start[2], start[3]] }
  };
}
/** Thumb target: on the back of the index's middle phalanx (classic fist). */
function overIndex(along, out) {
  return overFinger('index', along, out);
}
function overFinger(name, along, out) {
  return (fk, hs) => {
    const c = fk[name];
    // A point on the dorsal-outer side of the middle phalanx
    const p = new THREE.Vector3().lerpVectors(c.j[1], c.j[2], along);
    const dorsal = new THREE.Vector3(1, 0, 0).applyQuaternion(c.q[2]);
    return p.addScaledVector(dorsal, -DIGITS[name].r[1] * hs * out).addScaledVector(new THREE.Vector3(0, 0, 1), 0.004 * hs);
  };
}

/* ------------------------------------------------------------ solving */

const cache = new Map();

function toHandShapes(def) {
  const out = [];
  for (const s of def.shapes || []) {
    const sh = { ...s };
    const lp = new THREE.Vector3(...(s.pos || [0, 0, 0]));
    const lq = s.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...s.rot)) : new THREE.Quaternion();
    sh.c = lp.applyQuaternion(def.quat).add(def.pos);
    const q = def.quat.clone().multiply(lq);
    sh.qi = q.clone().invert();
    out.push(sh);
  }
  return out;
}

/**
 * Solve a grip into a config plus the object's frame (left-hand space,
 * model metres). Cached per grip, options (rounded) and hand scale.
 * `opts` sizes are in model metres (world ÷ person scale).
 */
export function solveGrip(name, opts = {}, hs = HAND_SCALE_DEFAULT) {
  const def0 = GRIPS[name] ? name : 'relaxed';
  const key = `${def0}|${hs.toFixed(3)}|${JSON.stringify(opts, (k, v) => (typeof v === 'number' ? Math.round(v * 2000) / 2000 : v))}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = GRIPS[def0](opts, hs);
  let params;
  if (def.fixed) params = def.params;
  else {
    const shapes = toHandShapes(def);
    const palm = palmShape(hs);
    const palmQ = new THREE.Quaternion().setFromEuler(_e.set(0, def.palm || 0, -(def.palm || 0) * 0.35));
    const margin = 0.0006;
    params = { palm: def.palm || 0 };
    const fk = {};
    const fingerChains = [];
    for (const f of FINGER_NAMES) {
      const spec = def.fingers[f];
      params[f] = curlFinger(f, spec, shapes, palm, palmQ, hs, margin);
      const ch = mkChain();
      fingerFK(f, params[f], palmQ, hs, ch);
      ch.r = DIGITS[f].r.map((x) => x * hs * 0.9);
      fk[f] = ch;
      fingerChains.push(ch);
    }
    const ts = { ...def.thumb };
    if (typeof ts.target === 'function') ts.target = ts.target(fk, hs);
    else if (Array.isArray(ts.target)) ts.target = new THREE.Vector3(...ts.target).applyQuaternion(def.quat).add(def.pos);
    params.thumb = solveThumb(ts, shapes, palm, fingerChains, hs, margin);
  }
  const res = {
    name: def0,
    config: configFromParams(params),
    params,
    pos: def.pos ? def.pos.clone() : null,
    quat: def.quat ? def.quat.clone() : null
  };
  cache.set(key, res);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return res;
}

/* ------------------------------------------------------------ legacy */

let legacy = null;
/** The four legacy shapes (open, relaxed, fist, point) used by pose.gripX/pointX. */
export function legacyShapes() {
  if (!legacy) {
    legacy = {
      open: solveGrip('open').config,
      relaxed: solveGrip('relaxed').config,
      fist: solveGrip('fist').config,
      point: solveGrip('point').config,
      tmp: new Float32Array(NB * 4),
      tmp2: new Float32Array(NB * 4)
    };
  }
  return legacy;
}

/** Config for a legacy grip amount (0 open, 0.25 relaxed, 1 fist) and point amount. */
export function legacyConfig(grip, point, out) {
  const L = legacyShapes();
  const g = Math.max(0, Math.min(1, grip));
  if (g <= 0.25) mixConfigs(L.open, L.relaxed, g / 0.25, out);
  else mixConfigs(L.relaxed, L.fist, (g - 0.25) / 0.75, out);
  const p = Math.max(0, Math.min(1, point));
  if (p > 1e-3) {
    // Point: only the index and the thumb change, by `point` (and how closed the fist is)
    mixConfigs(out, L.point, 1, L.tmp);
    const k = p;
    for (const nme of ['index', 'indexMid', 'indexTip', 'thumb', 'thumbMid', 'thumbTip']) {
      const i = BI[nme] * 4;
      _q.set(out[i], out[i + 1], out[i + 2], out[i + 3]);
      _q2.set(L.tmp[i], L.tmp[i + 1], L.tmp[i + 2], L.tmp[i + 3]);
      const kk = nme.startsWith('thumb') ? k * Math.min(1, g * 1.4) : k;
      _q.slerp(_q2, kk);
      out[i] = _q.x;
      out[i + 1] = _q.y;
      out[i + 2] = _q.z;
      out[i + 3] = _q.w;
    }
  }
  return out;
}

export { HAND_SCALE_DEFAULT, NB as HAND_BONE_COUNT, thumbFK, fingerFK, mkChain };
