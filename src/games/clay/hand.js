/**
 * Pekkas Lerskulptur — the potter's hand on the clay.
 *
 * A small skinned hand of our own (the shared people are life size, and
 * this hand lives in the wheel's magnified camera-facing plane), built from
 * smooth tubes rather than capsules:
 *
 *  - four fingers with three phalanges each, slightly flattened pads on the
 *    palm side, knuckle and joint bulges, nails; a thumb with a fleshy
 *    thenar pad; a palm that is a rounded, arched box, thicker on the palm
 *    side
 *  - a wrist and a forearm that swells to the muscle below the elbow, into
 *    a rolled linen sleeve
 *  - vertex colours for warm skin (redder knuckles and fingertips, a paler
 *    palm) and the slip coat; a per-vertex "wet" weight makes the slip shine
 *    and a "thin" weight lets a little warm light glow through fingers and
 *    knuckles (a cheap stand-in for subsurface scattering)
 *
 * Two placements, both in the guide group's plane (x outward from the wheel
 * axis on the right-hand side, y up, z toward the camera):
 *
 *  - OUTSIDE (pushing in, and holding the sponge): the hand stands against
 *    the outer wall, palm to the clay, fingers up along the wall's slope,
 *    gently curled so the pads press the wall; the thumb sits toward the
 *    viewer and the forearm comes in from the lower right, toward the camera
 *  - INSIDE (pulling out): the same hand turned over, fingers down inside
 *    the pot with the pads pressing the inner wall outward, the forearm
 *    rising over the rim toward the camera (stretched as far as the rim
 *    asks — it is mostly hidden by the clay anyway)
 *
 * Bind pose ("hand frame"): the wrist on the origin, fingers along +Y, the
 * palm facing −X, the thumb side toward +Z, the forearm hanging along −Y.
 */

import * as THREE from 'three';

/** Real hand metres → the wheel's magnified world. */
const HS = 3.3;

const DIGITS = [
  // name, knuckle [x, y, z], segment lengths, base radius, rest curl per joint
  { mcp: [0.002, 0.095, 0.029], len: [0.044, 0.026, 0.021], r: 0.0094, curl: [0.16, 0.24, 0.16] },
  { mcp: [0.0, 0.099, 0.0095], len: [0.048, 0.029, 0.022], r: 0.0097, curl: [0.12, 0.2, 0.14] },
  { mcp: [0.001, 0.095, -0.0095], len: [0.045, 0.027, 0.021], r: 0.0091, curl: [0.18, 0.27, 0.18] },
  { mcp: [0.004, 0.086, -0.0275], len: [0.035, 0.021, 0.019], r: 0.0081, curl: [0.26, 0.34, 0.22] }
];
const THUMB = { cmc: [-0.011, 0.024, 0.021], dir: [-0.36, 0.8, 0.48], len: [0.044, 0.032, 0.027], r: 0.0125 };
const FOREARM = 0.26;
/** The thumbnail's side: out from the palm and toward the viewer. */
const THUMB_BACK = new THREE.Vector3(0.6, 0, 0.8).normalize();

const SKIN = new THREE.Color(0xdca37e);
const SKIN_RED = new THREE.Color(0xd4836a);
const SKIN_PALM = new THREE.Color(0xe9b598);
const NAIL = new THREE.Color(0xeec6b6);
const SLIP = new THREE.Color(0x8f5432);
const LINEN = new THREE.Color(0xd9ccb2);
const LINEN_SHADE = new THREE.Color(0xc2b293);

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Accumulates skinned, coloured geometry. */
class Builder {
  constructor() {
    this.pos = [];
    this.col = [];
    this.si = [];
    this.sw = [];
    this.skin = []; // aSkin: x = wet, y = thin
    this.idx = [];
  }

  get count() {
    return this.pos.length / 3;
  }

  vert(p, c, bones, weights, wet = 0, thin = 0) {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    this.si.push(bones[0] || 0, bones[1] || 0, 0, 0);
    this.sw.push(weights[0] ?? 1, weights[1] || 0, 0, 0);
    this.skin.push(wet, thin);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('aSkin', new THREE.Float32BufferAttribute(this.skin, 2));
    // every piece below is wound inward-facing as written; turn them all out
    const idx = this.idx.slice();
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
}

/**
 * A smooth tube along a chain of joints. `prof(s)` → { rx, rz, flat } at
 * s ∈ [0, 1] along the whole chain (rx toward `back`, rz to the side;
 * `flat` squashes the side opposite `back` — the finger pads). Ends can be
 * capped with a rounded tip. Each ring is skinned to the segment's bone,
 * blending into the next one across the joint.
 */
function tube(B, joints, segBones, prof, { back, ringN = 12, perSeg = 6, capEnd = false, capStart = false, color, wetOf, thinOf }) {
  const segLen = [];
  let total = 0;
  for (let k = 0; k < joints.length - 1; k++) {
    const l = joints[k].distanceTo(joints[k + 1]);
    segLen.push(l);
    total += l;
  }
  const rings = [];
  let acc = 0;
  for (let k = 0; k < joints.length - 1; k++) {
    const n = perSeg;
    for (let i = 0; i < n || (k === joints.length - 2 && i === n); i++) {
      const t = i / n;
      rings.push({ k, t, s: (acc + segLen[k] * t) / total });
    }
    acc += segLen[k];
  }
  const d = new THREE.Vector3();
  const u = new THREE.Vector3();
  const w = new THREE.Vector3();
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  const addRing = (center, dir, rx, rz, flat, k, t, s) => {
    u.copy(back).addScaledVector(dir, -back.dot(dir)).normalize();
    w.crossVectors(dir, u).normalize();
    // Skin across the joint: last 25 % of a segment fades into the next bone
    const b0 = segBones[k];
    const b1 = segBones[Math.min(segBones.length - 1, k + 1)];
    const bp = segBones[Math.max(0, k - 1)];
    let bones = [b0, b0];
    let wts = [1, 0];
    if (t > 0.75 && b1 !== b0) {
      const m = smooth(0.75, 1.0, t) * 0.5;
      bones = [b0, b1];
      wts = [1 - m, m];
    } else if (t < 0.25 && bp !== b0) {
      const m = 0.5 - smooth(0.0, 0.25, t) * 0.5;
      bones = [b0, bp];
      wts = [1 - m, m];
    }
    const start = B.count;
    for (let j = 0; j < ringN; j++) {
      const a = (j / ringN) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = ca * rx * (ca < 0 ? flat : 1);
      p.copy(center).addScaledVector(u, x).addScaledVector(w, sa * rz);
      const palmSide = Math.max(0, -ca);
      B.vert(p, color(s, palmSide, ca, sa), bones, wts, wetOf ? wetOf(s, palmSide) : 0, thinOf ? thinOf(s) : 0);
    }
    return start;
  };
  const starts = [];
  const tip = (startC, dir, r0x, r0z, flat, k, sign) => {
    // rounded cap: a few shrinking rings past the end
    const out = [];
    for (let i = 1; i <= 2; i++) {
      const a = (i / 3) * Math.PI * 0.5;
      const kx = Math.cos(a);
      c.copy(startC).addScaledVector(dir, sign * Math.sin(a) * Math.max(r0x, r0z) * 0.9);
      out.push(addRing(c, dir, r0x * kx, r0z * kx, flat, k, sign > 0 ? 1 : 0, sign > 0 ? 1 : 0));
    }
    return out;
  };
  let capS = null;
  for (const R of rings) {
    const a = joints[R.k];
    const b = joints[R.k + 1];
    c.copy(a).lerp(b, R.t);
    // Direction: blend the two segments' directions around the joint
    d.subVectors(b, a).normalize();
    if (R.t === 0 && R.k > 0) d.add(new THREE.Vector3().subVectors(a, joints[R.k - 1]).normalize()).normalize();
    const f = prof(R.s);
    if (capStart && R === rings[0]) capS = tip(c, d, f.rx, f.rz, f.flat, R.k, -1).reverse();
    starts.push(addRing(c, d, f.rx, f.rz, f.flat, R.k, R.t, R.s));
  }
  let capE = null;
  if (capEnd) {
    const last = rings[rings.length - 1];
    const f = prof(1);
    d.subVectors(joints[joints.length - 1], joints[joints.length - 2]).normalize();
    capE = tip(joints[joints.length - 1], d, f.rx, f.rz, f.flat, last.k, 1);
  }
  const all = [...(capS || []), ...starts, ...(capE || [])];
  for (let r = 0; r < all.length - 1; r++) {
    const s0 = all[r];
    const s1 = all[r + 1];
    for (let j = 0; j < ringN; j++) {
      const j1 = (j + 1) % ringN;
      B.idx.push(s0 + j, s1 + j, s0 + j1, s0 + j1, s1 + j, s1 + j1);
    }
  }
  // close the very ends with a fan to their centre
  const fan = (ring, center, rev) => {
    const ci = B.count;
    B.vert(center, color(rev ? 0 : 1, 0, 1, 0), [segBones[rev ? 0 : segBones.length - 1]], [1], 0, 0);
    for (let j = 0; j < ringN; j++) {
      const j1 = (j + 1) % ringN;
      if (rev) B.idx.push(ci, ring + j, ring + j1);
      else B.idx.push(ci, ring + j1, ring + j);
    }
  };
  if (capE) {
    d.subVectors(joints[joints.length - 1], joints[joints.length - 2]).normalize();
    const f = prof(1);
    fan(all[all.length - 1], joints[joints.length - 1].clone().addScaledVector(d, Math.max(f.rx, f.rz) * 0.92), false);
  }
  if (capS) {
    d.subVectors(joints[1], joints[0]).normalize();
    const f = prof(0);
    fan(all[0], joints[0].clone().addScaledVector(d, -Math.max(f.rx, f.rz) * 0.92), true);
  }
  return all;
}

/** A closed lat-long blob mapped onto a rounded box (palm, thenar pad), one bone. */
function blob(B, center, half, bone, color, { power = 4, rot = null, latN = 10, lonN = 16, wet = 0, thin = 0, shape = null } = {}) {
  const start = B.count;
  const p = new THREE.Vector3();
  for (let i = 0; i <= latN; i++) {
    const th = (i / latN) * Math.PI;
    for (let j = 0; j < lonN; j++) {
      const ph = (j / lonN) * Math.PI * 2;
      p.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      const n = (Math.abs(p.x) ** power + Math.abs(p.y) ** power + Math.abs(p.z) ** power) ** (1 / power) || 1;
      p.divideScalar(n);
      if (shape) shape(p);
      p.multiply(half);
      if (rot) p.applyQuaternion(rot);
      p.add(center);
      B.vert(p, color(p), [bone], [1], wet, thin);
    }
  }
  for (let i = 0; i < latN; i++) {
    for (let j = 0; j < lonN; j++) {
      const j1 = (j + 1) % lonN;
      const a = start + i * lonN + j;
      const b = start + i * lonN + j1;
      const c = start + (i + 1) * lonN + j;
      const d = start + (i + 1) * lonN + j1;
      B.idx.push(a, c, b, b, c, d);
    }
  }
}

/** A torus ring around an axis (the rolled sleeve), one bone. */
function ring(B, center, axis, R, r, bone, color, squash = 1) {
  const start = B.count;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  const p = new THREE.Vector3();
  const M = 20;
  const S = 8;
  for (let i = 0; i < M; i++) {
    const a = (i / M) * Math.PI * 2;
    for (let j = 0; j < S; j++) {
      const b = (j / S) * Math.PI * 2;
      const rr = R + Math.cos(b) * r;
      p.set(Math.cos(a) * rr, Math.sin(b) * r * squash, Math.sin(a) * rr).applyQuaternion(q).add(center);
      B.vert(p, color, [bone], [1], 0, 0);
    }
  }
  for (let i = 0; i < M; i++) {
    const i1 = (i + 1) % M;
    for (let j = 0; j < S; j++) {
      const j1 = (j + 1) % S;
      B.idx.push(start + i * S + j, start + i1 * S + j, start + i * S + j1, start + i * S + j1, start + i1 * S + j, start + i1 * S + j1);
    }
  }
}

/** The skin material: physical, sheened, and taught the aSkin attribute. */
function skinMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.56,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0.75, 0.33, 0.24)
  });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSkin;\nvarying vec2 vSkin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = aSkin;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSkin;')
      // wet slip: a glossier film
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= mix( 1.0, 0.42, clamp( vSkin.x, 0.0, 1.0 ) );')
      // thin parts glow a little warm (fake subsurface), never above a soft cap
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3( 0.16, 0.05, 0.025 ) * clamp( vSkin.y, 0.0, 1.0 ) * ( 1.0 - 0.8 * clamp( vSkin.x, 0.0, 1.0 ) );'
      );
  };
  mat.customProgramCacheKey = () => 'lr-potter-skin-1';
  return mat;
}

/**
 * Build the hand. Returns { group, mesh, bones, pose(o) }; the group is
 * what the game places (its origin is the contact point after pose()).
 */
export function buildPotterHand() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z).multiplyScalar(HS);
  const group = new THREE.Group();
  const bones = [];
  const bone = (name, parent, at) => {
    const b = new THREE.Bone();
    b.name = name;
    if (parent) {
      const pw = parent.userData.bind;
      b.position.copy(at).sub(pw);
      parent.add(b);
    } else {
      b.position.copy(at);
    }
    b.userData.bind = at.clone();
    bones.push(b);
    return bones.length - 1;
  };
  const iHand = bone('hand', null, new THREE.Vector3());
  const handBone = bones[iHand];
  const iArm = bone('forearm', handBone, new THREE.Vector3());

  const B = new Builder();
  const fingerBones = [];
  const nailTmp = new THREE.Vector3();
  DIGITS.forEach((D, fi) => {
    const mcp = V(...D.mcp);
    const pts = [mcp];
    D.len.forEach((l) => pts.push(pts[pts.length - 1].clone().add(new THREE.Vector3(0, l * HS, 0))));
    const b0 = bone(`f${fi}a`, handBone, pts[0]);
    const b1 = bone(`f${fi}b`, bones[b0], pts[1]);
    const b2 = bone(`f${fi}c`, bones[b1], pts[2]);
    fingerBones.push([b0, b1, b2]);
    const start = pts[0].clone().add(new THREE.Vector3(0, -0.012 * HS, 0)); // root inside the palm
    const r0 = D.r * HS;
    const total = D.len.reduce((a, b) => a + b, 0) + 0.012;
    const j1 = (0.012 + D.len[0]) / total;
    const j2 = (0.012 + D.len[0] + D.len[1]) / total;
    tube(B, [start, ...pts], [b0, b0, b1, b2], (s) => {
      // joint bulges at the knuckles, a slim waist between, a full fingertip pad
      const bulge = 0.06 * Math.exp(-(((s - j1) / 0.05) ** 2)) + 0.05 * Math.exp(-(((s - j2) / 0.05) ** 2));
      const taper = 1 - 0.16 * s;
      const pad = 0.06 * Math.exp(-(((s - 0.9) / 0.07) ** 2));
      const k = (taper + bulge + pad) * r0;
      return { rx: k * 0.95, rz: k * (1.14 + pad), flat: 0.74 };
    }, {
      back: new THREE.Vector3(1, 0, 0),
      ringN: 10,
      perSeg: 5,
      capEnd: true,
      color: (s, palmSide, ca) => {
        const c = SKIN.clone();
        // redder over the knuckles and toward the tip, paler on the palm side
        const knuck = Math.max(0, ca) * (Math.exp(-(((s - j1) / 0.06) ** 2)) + Math.exp(-(((s - j2) / 0.06) ** 2)));
        c.lerp(SKIN_RED, Math.min(0.6, knuck * 0.7 + smooth(0.75, 1, s) * 0.35));
        c.lerp(SKIN_PALM, palmSide * 0.4);
        // the slip coat: everything past the middle joint, the pads most
        const slip = smooth(0.2, 0.62, s) * (0.7 + 0.3 * palmSide) * (0.85 + 0.15 * Math.sin(s * 40 + fi * 2));
        return c.lerp(SLIP, Math.min(0.9, slip));
      },
      wetOf: (s, palmSide) => smooth(0.2, 0.62, s) * (0.75 + 0.25 * palmSide),
      thinOf: (s) => 0.55 + 0.45 * smooth(0.6, 1, s)
    });
    // the nail, on the back of the last joint
    const tipBase = pts[2];
    const tipEnd = pts[3];
    nailTmp.copy(tipBase).lerp(tipEnd, 0.62);
    blob(B, nailTmp.clone().add(new THREE.Vector3(r0 * 0.68, 0, 0)), new THREE.Vector3(r0 * 0.22, r0 * 1.0, r0 * 0.72), b2,
      () => NAIL.clone().lerp(SLIP, 0.35), { power: 2.4, latN: 5, lonN: 8, wet: 0.6, thin: 0.6 });
  });

  // Thumb: from inside the thenar pad, up and toward the viewer
  const tdir = new THREE.Vector3(...THUMB.dir).normalize();
  const tc = V(...THUMB.cmc);
  const tp = [tc];
  THUMB.len.forEach((l, i) => {
    // the thumb's own curl: each joint bends toward the palm (−X)
    const d = tdir.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), i * 0.12);
    tp.push(tp[tp.length - 1].clone().addScaledVector(d, l * HS));
  });
  const t0 = bone('t0', handBone, tp[0]);
  const t1 = bone('t1', bones[t0], tp[1]);
  const t2 = bone('t2', bones[t1], tp[2]);
  const thumbBones = [t0, t1, t2];
  tube(B, tp, [t0, t1, t2], (s) => {
    const k = (1.25 - 0.45 * s + 0.07 * Math.exp(-(((s - 0.45) / 0.06) ** 2))) * THUMB.r * HS * 0.85;
    return { rx: k * 0.9, rz: k, flat: 0.78 };
  }, {
    back: THUMB_BACK,
    ringN: 10,
    perSeg: 5,
    capEnd: true,
    color: (s, palmSide) => SKIN.clone().lerp(SKIN_RED, smooth(0.7, 1, s) * 0.3).lerp(SLIP, Math.min(0.75, smooth(0.45, 0.85, s) * (0.6 + 0.4 * palmSide))),
    wetOf: (s) => smooth(0.45, 0.85, s) * 0.8,
    thinOf: (s) => 0.4 + 0.5 * s
  });
  const tn = tp[2].clone().lerp(tp[3], 0.6);
  const tnOut = THUMB_BACK.clone().addScaledVector(tdir, -THUMB_BACK.dot(tdir)).normalize();
  blob(B, tn.addScaledVector(tnOut, THUMB.r * HS * 0.55), new THREE.Vector3(0.012 * HS * 0.6, 0.012 * HS * 0.9, 0.012 * HS * 0.3), t2,
    () => NAIL.clone().lerp(SLIP, 0.3), {
      power: 2.4, latN: 5, lonN: 8, wet: 0.5, thin: 0.5,
      rot: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), tnOut, tdir))
    });

  // Palm: an arched, rounded box — fuller on the palm side, the knuckle row on top
  blob(B, V(0.001, 0.05, 0.0), V(0.0145, 0.056, 0.042), iHand, (p) => {
    const c = SKIN.clone();
    const palm = smooth(0, -0.012 * HS, p.x);
    c.lerp(SKIN_PALM, palm * 0.5);
    // slip smears up the palm side and across the knuckles
    return c.lerp(SLIP, Math.min(0.6, palm * smooth(0.04 * HS, 0.1 * HS, p.y) * 0.8 + 0.25 * smooth(0.08 * HS, 0.1 * HS, p.y)));
  }, {
    power: 2.7,
    latN: 12,
    lonN: 18,
    thin: 0.25,
    shape: (p) => {
      // palm side fuller at the thenar/hypothenar (low), the back flatter; an arch across
      if (p.x < 0) p.x *= 1.25 - 0.3 * Math.max(0, p.y);
      else p.x *= 0.85;
      p.x += -0.18 * p.z * p.z;
    }
  });
  // Thenar pad: the thumb's fleshy root on the palm
  blob(B, V(-0.008, 0.032, 0.02), V(0.012, 0.03, 0.018), iHand, () => SKIN.clone().lerp(SKIN_PALM, 0.35), {
    power: 2.2, latN: 8, lonN: 12, thin: 0.2, rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0.2))
  });

  // Forearm: wrist (flatter) → muscle → toward the elbow, then the rolled sleeve
  const fa = [new THREE.Vector3(0, 0.012 * HS, 0), new THREE.Vector3(0, -FOREARM * 0.5 * HS, 0), new THREE.Vector3(0, -FOREARM * HS, 0)];
  tube(B, fa, [iHand, iArm], (s) => {
    const wrist = 1 - smooth(0.0, 0.12, s);
    const muscle = smooth(0.1, 0.75, s);
    const rx = (0.0185 + 0.018 * muscle) * HS * (1 - 0.06 * wrist);
    const rz = (0.028 + 0.013 * muscle) * HS;
    return { rx, rz, flat: 1 };
  }, {
    back: new THREE.Vector3(1, 0, 0),
    ringN: 14,
    perSeg: 6,
    color: (s, palmSide) => SKIN.clone().lerp(SKIN_PALM, palmSide * 0.3).lerp(SLIP, Math.max(0, 0.35 - s * 1.4)),
    wetOf: (s) => Math.max(0, 0.4 - s * 1.6),
    thinOf: () => 0.1
  });
  // bind the forearm tube wholly to the arm bone below the wrist crease
  const { sw, si } = B;
  const startArm = B.count - 14 * (6 * 2 + 1);
  for (let v = startArm; v < B.count; v++) {
    const y = B.pos[v * 3 + 1];
    const k = smooth(-0.02 * HS, 0.012 * HS, y); // 1 at the wrist (hand), 0 down the arm
    si[v * 4] = iArm;
    si[v * 4 + 1] = iHand;
    sw[v * 4] = 1 - k;
    sw[v * 4 + 1] = k;
  }
  const axis = new THREE.Vector3(0, 1, 0);
  ring(B, V(0, -FOREARM * 0.72, 0), axis, 0.046 * HS, 0.012 * HS, iArm, LINEN, 1.25);
  ring(B, V(0, -FOREARM * 0.8, 0), axis, 0.049 * HS, 0.011 * HS, iArm, LINEN_SHADE, 1.1);
  const sl = [V(0, -FOREARM * 0.79, 0), V(0, -FOREARM * 1.02, 0), V(0.03, -FOREARM * 1.08, 0.14), V(0.1, -FOREARM * 1.3, 0.9)];
  tube(B, sl, [iArm, iArm, iArm], (s) => ({ rx: (0.048 + 0.01 * s) * HS, rz: (0.05 + 0.01 * s) * HS, flat: 1 }), {
    back: new THREE.Vector3(1, 0, 0),
    ringN: 14,
    perSeg: 3,
    capEnd: true,
    color: (s, palmSide, ca, sa) => LINEN.clone().lerp(LINEN_SHADE, 0.3 + 0.3 * Math.sin(sa * 3 + s * 9)),
    thinOf: () => 0
  });

  const geo = B.geometry();
  const mesh = new THREE.SkinnedMesh(geo, skinMaterial());
  mesh.add(handBone);
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.frustumCulled = false;

  /* -------------------------------------------------------------- posing */
  const qa = new THREE.Quaternion();
  const qLean = new THREE.Quaternion();
  const qInv = new THREE.Quaternion();
  const vz = new THREE.Vector3(0, 0, 1);
  const tmp = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const m4 = new THREE.Matrix4();
  const mc = new THREE.Matrix4();
  const ax = new THREE.Vector3();
  const ay = new THREE.Vector3();
  const az = new THREE.Vector3();
  const thumbAxis = new THREE.Vector3().crossVectors(THUMB_BACK, tdir).normalize();
  // the middle finger's middle pad, in its middle phalanx's frame: the contact point
  const md = DIGITS[1];
  const PAD = new THREE.Vector3(-md.r * HS * 0.86, md.len[1] * HS * 0.5, 0);
  const padChain = [iHand, fingerBones[1][0], fingerBones[1][1]];

  /**
   * Pose and place the hand.
   * o.inside  false: on the outer wall (palm toward the axis); true: inside the pot, palm out
   * o.slope   dr/dy of the wall at the contact (its tangent tilts the hand)
   * o.curv    the wall's profile curvature there (a convex wall < 0 curls the fingers in)
   * o.press   0..1 how hard: deeper curl, the hand leans into the wall
   * o.grip    0..1 extra curl (holding the sponge)
   * o.lift    metres the forearm must rise to clear the rim (inside only)
   * o.t       clock, for a living micro-motion
   */
  function pose(o) {
    const press = o.press || 0;
    const grip = o.grip || 0;
    const t = o.t || 0;
    // Fingers: each its own rest curl, deeper under pressure, a little life,
    // and bent to the wall's own curve so the pads stay on it
    DIGITS.forEach((D, fi) => {
      const wob = Math.sin(t * 1.7 + fi * 1.9) * 0.025;
      fingerBones[fi].forEach((bi, j) => {
        const c = D.curl[j] * (1 + 0.8 * press) + grip * [0.35, 0.55, 0.45][j] - (o.curv || 0) * D.len[j] * HS + wob;
        bones[bi].quaternion.setFromAxisAngle(vz, Math.max(-0.25, Math.min(1.5, c)));
      });
    });
    // Thumb: opposes a touch more when pressing or gripping
    thumbBones.forEach((bi, j) => {
      const c = [0.04, 0.1, 0.16][j] + (press * 0.15 + grip * 0.35) * (j + 1) * 0.5;
      bones[bi].quaternion.setFromAxisAngle(thumbAxis, c);
    });
    // Place: hand +Y along the wall's tangent, the back of the hand away from
    // the wall — outside: fingers up, palm toward the axis; inside: fingers
    // down, palm out against the inner wall. Both keep the thumb toward the viewer.
    const slope = o.slope || 0;
    if (o.inside) {
      ay.set(-slope, -1, 0).normalize();
      ax.set(-1, slope, 0).normalize();
    } else {
      ay.set(slope, 1, 0).normalize();
      ax.set(1, -slope, 0).normalize();
    }
    az.crossVectors(ax, ay);
    m4.makeBasis(ax, ay, az);
    // ...leaning into the wall as it presses
    qLean.setFromAxisAngle(vz, press * 0.07);
    qa.setFromRotationMatrix(m4).multiply(qLean);
    handBone.position.set(0, 0, 0);
    handBone.quaternion.copy(qa);
    // the contact pad on the origin (after the curl)
    mc.identity();
    for (const bi of padChain) {
      bones[bi].updateMatrix();
      mc.multiply(bones[bi].matrix);
    }
    tmp.copy(PAD).applyMatrix4(mc);
    handBone.position.copy(tmp).negate();
    // Forearm: out of the frame toward the viewer — from the lower right
    // outside, up over the rim inside (stretched as far as the rim asks)
    const dir = o.inside ? tmp.set(-0.2, 0.88, 0.44) : tmp.set(0.56, -0.48, 0.68);
    qInv.copy(qa).invert();
    dir.normalize().applyQuaternion(qInv);
    bones[iArm].quaternion.setFromUnitVectors(down, dir);
    const stretch = o.inside ? Math.max(1, Math.min(2.6, 1 + (o.lift || 0) / (FOREARM * HS))) : 1;
    bones[iArm].scale.set(1, stretch, 1);
  }

  pose({});
  return { group, mesh, pose, dispose: () => { geo.dispose(); mesh.material.dispose(); mesh.skeleton.dispose(); } };
}
