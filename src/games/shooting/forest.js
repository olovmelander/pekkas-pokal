/**
 * Pekkas Lerduvor — the forest edge and everything that grows in the field.
 *
 * A Norrland skogsbryn is layered, and that layering is what reads as
 * "real" from 100 m away, far more than polygon count:
 *
 *  - GRAN with drooping branch tiers. Each tier is a skirt of arms whose
 *    tips hang lower than the gaps between them, so the silhouette against
 *    the haze is ragged and stepped instead of a smooth cone, and the tip
 *    is a thin leader. Heights, widths, lean and tier counts all vary.
 *  - BJÖRK in front of the spruce: white stems with dark bands, a dark
 *    rough foot, and an airy, hanging crown of light yellow-green clumps.
 *  - UNDERGROWTH where field meets forest: young spruce, junipers, leafy
 *    sälg/hassel bushes, a rowan with orange berries, and a band of
 *    mjölkört (fireweed), the magenta of every Swedish August verge.
 *  - BOULDERS with soft, lichen-flecked faces instead of dark dice.
 *
 * Everything is built straight into merged, vertex-coloured buffers with
 * hand-made normals: foliage normals point out from the crown's centre
 * (the stylised-foliage trick that makes a clump light like one soft
 * volume instead of a pile of facets). A per-vertex `aTip` marks the outer
 * needles and leaves, and the shared foliage material makes them glow
 * gold when they stand between the eye and the low sun — the backlit rim
 * that a forest edge at golden hour is all about. One material, a handful
 * of draw calls for the whole forest.
 */

import * as THREE from 'three';
import { HAZE, SUN_DIR, SUN_COLOR } from './sky.js';

const _c = new THREE.Color();
const _n = new THREE.Vector3();
const HAZE_C = new THREE.Color(HAZE);

/* ------------------------------------------------------------ the buffer */

/** Collects non-indexed triangles with position, normal, colour and tip. */
export class Growth {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.tip = [];
  }

  /** One vertex: p, n (unit-ish), colour, tip 0…1. */
  v(px, py, pz, nx, ny, nz, c, tip = 0) {
    const l = Math.hypot(nx, ny, nz) || 1;
    this.pos.push(px, py, pz);
    this.nor.push(nx / l, ny / l, nz / l);
    this.col.push(c.r, c.g, c.b);
    this.tip.push(tip);
  }

  get count() {
    return this.pos.length / 3;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aTip', new THREE.Float32BufferAttribute(this.tip, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * The foliage material: Lambert, vertex colours, both sides (the inside of
 * a skirt reads as the dark interior of the tree), plus the backlit rim.
 */
export function foliageMaterial() {
  const uniforms = {
    uSunDir: { value: SUN_DIR.clone() },
    uSunColor: { value: new THREE.Color(SUN_COLOR) }
  };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform vec3 uSunDir;
        attribute float aTip;
        varying float vRim;
      `)
      .replace('#include <fog_vertex>', `
        #include <fog_vertex>
        // Light through the needles: how squarely this point stands between
        // the eye and the sun. Only the outer tips transmit.
        vec3 fWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec3 fView = fWorld - cameraPosition;
        float fLen = max(length(fView), 1e-3);
        float fBack = max(dot(fView / fLen, uSunDir), 0.0);
        vRim = fBack * fBack * fBack * fBack * aTip;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform vec3 uSunColor;
        varying float vRim;
      `)
      .replace('#include <opaque_fragment>', `
        // (a fixed sap-green term keeps the glow alive, not brown, on dark needles)
        outgoingLight += (diffuseColor.rgb * 1.8 + vec3(0.09, 0.11, 0.015)) * uSunColor * vRim;
        #include <opaque_fragment>
      `);
  };
  mat.customProgramCacheKey = () => 'pp-foliage';
  return mat;
}

/* ------------------------------------------------------------ the trees */

/**
 * A Norway spruce. `o`: { tiers, arms, width, tint (Color), haze 0…1,
 * trunk: bool, tipLight 0…1 }. Built into `G` at world (x, y0, z).
 */
export function addSpruce(G, rand, x, y0, z, h, o) {
  const { tiers, arms, tint } = o;
  const w = h * (o.width || 0.16 + rand() * 0.06);
  const haze = o.haze || 0;
  const lean = (rand() - 0.5) * 0.05 * h;
  const leanZ = (rand() - 0.5) * 0.03 * h;
  const bare = h * (0.07 + rand() * 0.05);
  const cy = y0 + h * 0.45;
  const col = (k, light) => {
    _c.copy(tint).multiplyScalar(k);
    if (light) _c.lerp(o.tipColor || tint, light);
    return _c.lerp(HAZE_C, haze);
  };
  const cIn = new THREE.Color();
  const cTip = new THREE.Color();
  const cTop = new THREE.Color();

  if (o.trunk) {
    // A thin dark stem, only seen between the lowest tiers
    const tr = Math.max(0.06, h * 0.013);
    const sides = 4;
    const tc = new THREE.Color(0x3b2e24).lerp(HAZE_C, haze);
    for (let s = 0; s < sides; s++) {
      const a0 = (s / sides) * Math.PI * 2;
      const a1 = ((s + 1) / sides) * Math.PI * 2;
      const x0 = Math.cos(a0) * tr;
      const z0 = Math.sin(a0) * tr;
      const x1 = Math.cos(a1) * tr;
      const z1 = Math.sin(a1) * tr;
      const yt = y0 + h * 0.55;
      const lx = lean * 0.55;
      const lz = leanZ * 0.55;
      G.v(x + x0, y0, z + z0, x0, 0, z0, tc);
      G.v(x + x1 + lx * 0.4, yt, z + z1 + lz * 0.4, x1, 0, z1, tc);
      G.v(x + x1, y0, z + z1, x1, 0, z1, tc);
      G.v(x + x0, y0, z + z0, x0, 0, z0, tc);
      G.v(x + x0 + lx * 0.4, yt, z + z0 + lz * 0.4, x0, 0, z0, tc);
      G.v(x + x1 + lx * 0.4, yt, z + z1 + lz * 0.4, x1, 0, z1, tc);
    }
  }

  for (let i = 0; i < tiers; i++) {
    const f0 = i / tiers;
    const f1 = (i + 1) / tiers;
    // Tiers bunch up toward the top, like real whorls
    const yTop = y0 + bare + (h - bare) * (1 - (1 - f1) ** 1.12);
    const top = i === tiers - 1;
    const r = (w * (1 - f0) ** 0.95 + h * 0.01) * (0.82 + rand() * 0.34);
    const th = ((h - bare) / tiers) * (top ? 1.6 : 1.75 + rand() * 0.45);
    const ax = x + lean * f1;
    const az = z + leanZ * f1;
    const ay = top ? y0 + h : yTop;
    const k = arms - (top ? 1 : 0);
    const rot = rand() * Math.PI * 2;
    const shade = 0.5 + 0.5 * f1; // the bottom of the crown sits in its own shade
    cIn.copy(col(shade * 0.5, 0));
    cTop.copy(col(shade * 0.75, 0));
    const ring = [];
    for (let j = 0; j < k * 2; j++) {
      const tipArm = j % 2 === 0;
      const a = rot + (j / (k * 2)) * Math.PI * 2 + (rand() - 0.5) * 0.35;
      const rr = tipArm ? r * (0.85 + rand() * 0.35) : r * (0.42 + rand() * 0.12);
      // Arm tips droop below the gaps; the leader's ring is tight
      const droop = tipArm ? th * (1.0 + rand() * 0.25) : th * (0.55 + rand() * 0.1);
      ring.push({
        x: ax + Math.cos(a) * rr,
        y: ay - droop,
        z: az + Math.sin(a) * rr,
        nx: Math.cos(a),
        nz: Math.sin(a),
        tip: tipArm
      });
    }
    // Arm tips catch the most light (and new growth is a fresher green);
    // whorls differ a little, the way a real tree is patchy
    const patch = 0.9 + rand() * 0.2;
    cTip.copy(col(shade * (0.95 + rand() * 0.12) * patch, o.tipLight || 0));
    const vtx = (v, c, tip) => {
      _n.set(v.x - x, (v.y - cy) * 0.6 + r * 0.5, v.z - z);
      G.v(v.x, v.y, v.z, _n.x, _n.y, _n.z, c, tip);
    };
    if (o.elbow && !top) {
      // Two-segment arms: out near level from the stem, then hanging at
      // the tip — the drooping Norway spruce profile, readable at 60–90 m
      const cMid = new THREE.Color().copy(cIn).lerp(cTip, 0.55);
      const el = ring.map((v) => ({
        x: ax + (v.x - ax) * 0.55,
        y: ay - (ay - v.y) * (v.tip ? 0.22 : 0.35),
        z: az + (v.z - az) * 0.55
      }));
      for (let j = 0; j < ring.length; j++) {
        const j1 = (j + 1) % ring.length;
        const p = ring[j];
        const q = ring[j1];
        const ep = el[j];
        const eq = el[j1];
        G.v(ax, ay, az, (p.nx + q.nx) * 0.2, 1.4, (p.nz + q.nz) * 0.2, cTop, 0);
        vtx(eq, cMid, 0.4);
        vtx(ep, cMid, 0.4);
        vtx(ep, cMid, 0.4);
        vtx(eq, cMid, 0.4);
        vtx(q, q.tip ? cTip : cIn, q.tip ? 1 : 0.25);
        vtx(ep, cMid, 0.4);
        vtx(q, q.tip ? cTip : cIn, q.tip ? 1 : 0.25);
        vtx(p, p.tip ? cTip : cIn, p.tip ? 1 : 0.25);
      }
    } else {
      for (let j = 0; j < ring.length; j++) {
        const p = ring[j];
        const q = ring[(j + 1) % ring.length];
        // Apex → q → p winds counter-clockwise seen from outside and above
        G.v(ax, ay, az, (p.nx + q.nx) * 0.2, 1.4, (p.nz + q.nz) * 0.2, cTop, 0);
        vtx(q, q.tip ? cTip : cIn, q.tip ? 1 : 0.25);
        vtx(p, p.tip ? cTip : cIn, p.tip ? 1 : 0.25);
      }
    }
  }
  if (o.trunk && o.twigs) {
    // Dead lower branches below the crown: grey, thin, angled down — the
    // tell of a spruce grown in a stand
    const grey = new THREE.Color(0x6b6158).lerp(HAZE_C, haze);
    for (let k = 0; k < o.twigs; k++) {
      const a = rand() * Math.PI * 2;
      const y = y0 + bare * (0.25 + rand() * 0.7);
      const len = h * (0.05 + rand() * 0.05);
      const ex = x + Math.cos(a) * len;
      const ez = z + Math.sin(a) * len;
      const ey = y - len * 0.45;
      const t = Math.max(0.025, h * 0.003);
      G.v(x - Math.sin(a) * t, y, z + Math.cos(a) * t, Math.cos(a), 0.3, Math.sin(a), grey);
      G.v(x + Math.sin(a) * t, y, z - Math.cos(a) * t, Math.cos(a), 0.3, Math.sin(a), grey);
      G.v(ex, ey, ez, Math.cos(a), 0.3, Math.sin(a), grey);
    }
  }
}

/**
 * A birch: a white stem with dark lenticel bands and a dark rough foot,
 * a few rising limbs and a light, hanging crown of clumps.
 */
export function addBirch(G, rand, x, y0, z, h, o = {}) {
  const haze = o.haze || 0;
  const bendX = (rand() - 0.5) * 0.08 * h;
  const bendZ = (rand() - 0.5) * 0.05 * h;
  const segs = 7;
  const r0 = Math.max(0.09, h * 0.02);
  const sides = 5;
  const white = new THREE.Color(0xeeeae0).lerp(HAZE_C, haze);
  const dark = new THREE.Color(0x2c2826).lerp(HAZE_C, haze);
  const foot = new THREE.Color(0x4a4440).lerp(HAZE_C, haze);
  const stemTop = 0.82;
  const at = (f) => [x + bendX * Math.sin(f * 2.4), y0 + h * stemTop * f, z + bendZ * f * f];
  for (let s = 0; s < segs; s++) {
    const f0 = s / segs;
    const f1 = (s + 1) / segs;
    const [x0, yA, z0] = at(f0);
    const [x1, yB, z1] = at(f1);
    const ra = r0 * (1 - f0 * 0.75);
    const rb = r0 * (1 - f1 * 0.75);
    let c;
    if (s === 0) c = foot;
    else if (rand() < 0.3) c = _c.copy(white).lerp(dark, 0.55 + rand() * 0.3);
    else c = _c.copy(white).multiplyScalar(0.9 + rand() * 0.1);
    const cc = c.clone();
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      G.v(x0 + c0 * ra, yA, z0 + s0 * ra, c0, 0, s0, cc);
      G.v(x1 + c1 * rb, yB, z1 + s1 * rb, c1, 0, s1, cc);
      G.v(x0 + c1 * ra, yA, z0 + s1 * ra, c1, 0, s1, cc);
      G.v(x0 + c0 * ra, yA, z0 + s0 * ra, c0, 0, s0, cc);
      G.v(x1 + c0 * rb, yB, z1 + s0 * rb, c0, 0, s0, cc);
      G.v(x1 + c1 * rb, yB, z1 + s1 * rb, c1, 0, s1, cc);
    }
  }
  // Crown: hanging clumps around the upper stem, biggest in the middle
  const leaf = new THREE.Color(o.leaf || 0x9cba52);
  const n = o.clumps || 7;
  const crownC = new THREE.Vector3(...at(0.78));
  const cw = h * (0.17 + rand() * 0.05);
  for (let k = 0; k < n; k++) {
    const f = 0.42 + (k / n) * 0.58;
    const [sx, sy, sz] = at(Math.min(1, f));
    const a = rand() * Math.PI * 2;
    const out = cw * (0.45 + rand() * 0.6) * Math.sin(Math.PI * Math.min(0.95, f * 0.95));
    const rr = cw * (0.22 + rand() * 0.14) * (1 - Math.abs(f - 0.7) * 0.6) * (o.clumpScale || 1);
    const tint = leaf.clone().offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.12);
    addClump(G, rand, sx + Math.cos(a) * out, sy - rr * 0.15, sz + Math.sin(a) * out, rr, {
      tint, haze, centre: crownC, squash: 1.5, droop: 0.5, shade: 0.4, tipK: 0.4, lift: 0.9, detail: o.detail
    });
  }
}

/**
 * A soft clump of leaves: a jittered icosphere whose normals point out
 * from `centre` (the whole crown/bush), dark underneath, light and
 * translucent at the outer surface.
 */
export function addClump(G, rand, x, y, z, r, o) {
  const geo = new THREE.IcosahedronGeometry(1, o.detail === undefined ? 1 : o.detail);
  const P = geo.attributes.position;
  const centre = o.centre || new THREE.Vector3(x, y, z);
  const haze = o.haze || 0;
  const squash = o.squash || 1;
  const droop = o.droop || 0;
  const shadeK = o.shade === undefined ? 0.42 : o.shade;
  // Jitter per unique direction so shared corners stay welded
  const jit = new Map();
  const key = (a, b, c) => `${Math.round(a * 100)},${Math.round(b * 100)},${Math.round(c * 100)}`;
  for (let i = 0; i < P.count; i += 3) {
    const vs = [];
    for (let t = 0; t < 3; t++) {
      const ux = P.getX(i + t);
      const uy = P.getY(i + t);
      const uz = P.getZ(i + t);
      const kk = key(ux, uy, uz);
      if (!jit.has(kk)) jit.set(kk, 0.78 + rand() * 0.42);
      const j = jit.get(kk);
      const px = x + ux * r * j;
      // Hanging foliage: the lower half sags, the top is rounder
      const py = y + uy * r * j * (uy < 0 ? 1 + droop : 1 / squash) * squash * 0.8;
      const pz = z + uz * r * j;
      vs.push([px, py, pz, uy, j]);
    }
    for (const [px, py, pz, uy, j] of vs) {
      _n.set(px - centre.x, (py - centre.y) * 0.9 + r * (o.lift || 0.4), pz - centre.z);
      const k = (1 - shadeK) + shadeK * (uy * 0.5 + 0.5);
      _c.copy(o.tint).multiplyScalar(k * (0.9 + (j - 0.78) * 0.5)).lerp(HAZE_C, haze);
      G.v(px, py, pz, _n.x, _n.y, _n.z, _c, Math.min(1, Math.max(0, j - 0.85) * 3) * (o.tipK || 1) * (0.4 + 0.6 * Math.max(0, uy + 0.3)));
    }
  }
  geo.dispose();
}

/** A lichen-flecked boulder, half sunk, with soft faces. */
export function addBoulder(G, rand, x, z, s, o = {}) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const P = geo.attributes.position;
  const base = new THREE.Color(o.color || 0x8b8a83);
  const lichen = new THREE.Color(0xa9a46a);
  const moss = new THREE.Color(0x56663a);
  const jit = new Map();
  const key = (a, b, c) => `${Math.round(a * 100)},${Math.round(b * 100)},${Math.round(c * 100)}`;
  const sx = s * (0.9 + rand() * 0.5);
  const sy = s * (0.5 + rand() * 0.3);
  const sz = s * (0.8 + rand() * 0.4);
  const rot = rand() * Math.PI;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const lift = sy * 0.35;
  for (let i = 0; i < P.count; i++) {
    const ux = P.getX(i);
    const uy = P.getY(i);
    const uz = P.getZ(i);
    const kk = key(ux, uy, uz);
    if (!jit.has(kk)) jit.set(kk, [0.8 + rand() * 0.3, rand()]);
    const [j, fleck] = jit.get(kk);
    // Flattened underneath, so it sits IN the ground
    const yy = uy < -0.2 ? -0.2 + (uy + 0.2) * 0.3 : uy;
    const lx = ux * sx * j;
    const lz = uz * sz * j;
    const px = x + lx * cr - lz * sr;
    const pz = z + lx * sr + lz * cr;
    const py = yy * sy * j + lift;
    _c.copy(base).multiplyScalar(0.72 + 0.4 * (uy * 0.5 + 0.5));
    if (fleck > 0.72 && uy > -0.1) _c.lerp(lichen, 0.45);
    else if (fleck < 0.18 && uy > 0.3) _c.lerp(moss, 0.5);
    else if (uy < -0.05) _c.lerp(moss, 0.25);
    const nx = ux * cr - uz * sr;
    const nz = ux * sr + uz * cr;
    G.v(px, py, pz, nx, uy + 0.25, nz, _c, 0);
  }
  geo.dispose();
}

/** Mjölkört: a pink spike on a green stalk (two crossed fins, a few tris). */
export function addFireweed(G, rand, x, y0, z, h, haze = 0) {
  const pink = new THREE.Color(0xd04a8c).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.1).lerp(HAZE_C, haze);
  const stem = new THREE.Color(0x5b7134).lerp(HAZE_C, haze);
  const bud = new THREE.Color(0x8a4a6a).lerp(HAZE_C, haze);
  const w = h * 0.07;
  const a = rand() * Math.PI;
  for (let f = 0; f < 2; f++) {
    const ang = a + f * Math.PI * 0.5;
    const dx = Math.cos(ang) * w;
    const dz = Math.sin(ang) * w;
    const nx = -Math.sin(ang);
    const nz = Math.cos(ang);
    const yS = y0 + h * 0.5;
    const yT = y0 + h;
    // Stalk with leaves
    G.v(x - dx * 0.5, y0, z - dz * 0.5, nx, 0.6, nz, stem);
    G.v(x + dx * 0.5, y0, z + dz * 0.5, nx, 0.6, nz, stem);
    G.v(x, yS, z, nx, 0.6, nz, stem);
    // Flower spike: widest at the bottom of the bloom, a dark bud tip
    G.v(x - dx, yS, z - dz, nx, 0.5, nz, pink, 0.8);
    G.v(x + dx, yS, z + dz, nx, 0.5, nz, pink, 0.8);
    G.v(x, yT, z, nx, 0.5, nz, bud, 1);
  }
}

/* -------------------------------------------------------- the forest edge */

/**
 * The whole forest: the far rank (low detail, hazed), the main edge with
 * birches in front and undergrowth along the field, the same in miniature
 * behind the station for the reaction shot, and the lone trees and
 * bushes out in the field. `lite` (phones) trims tiers and counts.
 * Returns { group, material, triangles }.
 */
export function buildForest(rand, { lite = false } = {}) {
  const group = new THREE.Group();
  group.name = 'forest';
  const material = foliageMaterial();
  const meshes = [];
  const emit = (G, renderOrder = 0, shadow = false) => {
    if (!G.count) return null;
    const m = new THREE.Mesh(G.geometry(), material);
    m.renderOrder = renderOrder;
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    meshes.push(m);
    return m;
  };
  const SPRUCE = new THREE.Color(0x1d3a25);
  const SPRUCE_TIP = new THREE.Color(0x5f7d3a);
  const q = lite ? 0.62 : 1;

  /* Far rank: big, simple and almost in the haze */
  const far = new Growth();
  {
    const n = Math.round(120 * q);
    for (let i = 0; i < n; i++) {
      const x = -260 + (i / n) * 520 + (rand() - 0.5) * 5;
      const zz = -150 + (rand() - 0.5) * 22;
      const h = 9 + rand() * 13;
      const tint = SPRUCE.clone().offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.06);
      addSpruce(far, rand, x, -1.5, zz, h * 1.25, { tiers: lite ? 5 : 6, arms: 5, tint, haze: 0.55 + rand() * 0.08, trunk: false });
    }
  }
  emit(far, -6);

  /* The main edge: clusters and gaps, tall old spruce among younger */
  const edge = new Growth();
  const under = new Growth();
  const placeEdge = (zBase, x0, x1, step, haze, side) => {
    let x = x0;
    while (x < x1) {
      // Groups of trees with clearings in between
      const cluster = 3 + Math.floor(rand() * 6);
      for (let c = 0; c < cluster && x < x1; c++) {
        const zz = zBase + side * (rand() * 14) + (rand() - 0.5) * 4;
        const old = rand() < 0.22;
        const h = old ? 17 + rand() * 7 : 8 + rand() * 9;
        const tint = SPRUCE.clone().offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.08);
        const tiers = lite ? 6 : Math.round(8 + h * 0.18);
        addSpruce(edge, rand, x, -0.6, zz, h, {
          tiers, arms: lite ? 5 : 7, tint, tipColor: SPRUCE_TIP, tipLight: 0.35, haze: haze + rand() * 0.05, trunk: !lite,
          elbow: !lite && old, twigs: lite ? 0 : 4
        });
        x += step * (0.5 + rand() * 0.8);
      }
      x += step * (0.6 + rand() * 2.2);
    }
  };
  placeEdge(-104, -230, 230, lite ? 5.2 : 3.4, 0.03, -1);

  /* Birches in front of the spruce, in loose groups */
  const birchAt = (bx, bz, haze, sz = 1) => {
    const h = (7 + rand() * 6) * sz;
    // 95 m out a 20-face clump reads the same as an 80-face one
    addBirch(edge, rand, bx, -0.3, bz, h, { haze, clumps: lite ? 9 : 20 + Math.floor(rand() * 6), clumpScale: lite ? 0.9 : 0.78, detail: 0 });
  };
  for (let i = 0; i < (lite ? 12 : 22); i++) {
    const gx = -150 + rand() * 300;
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) birchAt(gx + (rand() - 0.5) * 7, -94 - rand() * 6, 0.1, 1 + rand() * 0.2);
  }

  /* Undergrowth along the edge: saplings, junipers, bushes, fireweed */
  const BUSHES = [0x4d6b32, 0x5b7a36, 0x3f5e2e, 0x6b8340];
  for (let i = 0; i < (lite ? 70 : 140); i++) {
    const ux = -180 + rand() * 360;
    const uz = -90 - rand() * 8;
    const r = rand();
    if (r < 0.32) {
      const h = 1.6 + rand() * 3;
      addSpruce(under, rand, ux, -0.1, uz, h, {
        tiers: lite ? 4 : 6, arms: 6, tint: SPRUCE.clone().offsetHSL(0, 0, 0.03), tipColor: SPRUCE_TIP, tipLight: 0.5, haze: 0.08, trunk: false
      });
    } else if (r < 0.45) {
      // Juniper: a dark, narrow column
      const h = 1.4 + rand() * 1.8;
      addSpruce(under, rand, ux, -0.05, uz, h, {
        tiers: 5, arms: 5, width: 0.16, tint: new THREE.Color(0x2e4636), tipColor: new THREE.Color(0x4f6a55), tipLight: 0.4, haze: 0.08
      });
    } else {
      const tint = new THREE.Color(BUSHES[Math.floor(rand() * BUSHES.length)]).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08);
      const bw = 0.8 + rand() * 1.4;
      const centre = new THREE.Vector3(ux, bw * 0.6, uz);
      const parts = lite ? 2 : 3 + Math.floor(rand() * 2);
      for (let k = 0; k < parts; k++) {
        addClump(under, rand, ux + (rand() - 0.5) * bw * 1.2, bw * (0.45 + rand() * 0.35), uz + (rand() - 0.5) * bw * 0.6,
          bw * (0.55 + rand() * 0.3), { tint, haze: 0.08, centre, squash: 0.9, detail: 0 });
      }
    }
  }
  for (let i = 0; i < (lite ? 120 : 320); i++) {
    // Fireweed in drifts, not evenly sprinkled
    const fx = -120 + rand() * 240;
    const n = 3 + Math.floor(rand() * 6);
    for (let k = 0; k < n; k++) {
      addFireweed(under, rand, fx + (rand() - 0.5) * 3, -0.05, -86 - rand() * 7, 0.9 + rand() * 0.6, 0.06);
    }
    i += n - 1;
  }
  emit(edge, -5);
  emit(under, -4);

  /* Behind the station: only the reaction shot looks this way */
  const back = new Growth();
  {
    let x = -160;
    while (x < 160) {
      const zz = 92 + rand() * 14;
      const h = 8 + rand() * 12;
      const tint = SPRUCE.clone().offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.08);
      addSpruce(back, rand, x, -1, zz, h, { tiers: lite ? 5 : 8, arms: 6, tint, tipColor: SPRUCE_TIP, tipLight: 0.3, haze: 0.1, trunk: false });
      x += (lite ? 7 : 4.6) * (0.5 + rand());
    }
    [[-26, 52], [-19, 60], [-31, 66], [22, 58], [30, 49], [37, 63], [8, 74]].forEach(([bx, bz]) => {
      addBirch(back, rand, bx, -0.3, bz, 7 + rand() * 4, { haze: 0.06, clumps: lite ? 8 : 13, detail: lite ? 0 : 1 });
    });
  }
  emit(back, -5);

  /* Out in the field: lone trees and bushes, the middle distance */
  const field = new Growth();
  // A big old birch pair by the barn, a spruce group on the right
  [[-41, -58, 1.35], [-37, -61, 1.1], [24, -60, 1.2], [29, -66, 1], [55, -64, 1.15]].forEach(([bx, bz, s]) => {
    addBirch(field, rand, bx, -0.2, bz, (9 + rand() * 3) * s, { haze: 0.04, clumps: lite ? 12 : 30, clumpScale: lite ? 0.85 : 0.72 });
  });
  [[36, -74, 12], [40, -78, 15], [33, -80, 9], [-58, -76, 13], [-62, -72, 10], [70, -86, 14]].forEach(([sx, sz, h]) => {
    addSpruce(field, rand, sx, -0.3, sz, h, {
      tiers: lite ? 7 : 12, arms: lite ? 6 : 8, tint: SPRUCE.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.05),
      tipColor: SPRUCE_TIP, tipLight: 0.35, haze: 0.06, trunk: true, elbow: true, twigs: lite ? 3 : 7
    });
  });
  // A rowan (rönn) with its August berries, near the fence
  {
    const rx = 18;
    const rz = -34;
    addBirch(field, rand, rx, -0.1, rz, 5.5, { leaf: 0x587a32, clumps: lite ? 7 : 12 });
    const berry = new THREE.Color(0xe0521c);
    for (let k = 0; k < (lite ? 8 : 16); k++) {
      const a = rand() * Math.PI * 2;
      const rr = 0.6 + rand() * 1.1;
      addClump(field, rand, rx + Math.cos(a) * rr, 3.3 + rand() * 1.5, rz + Math.sin(a) * rr, 0.075, { tint: berry, detail: 0, shade: 0.3 });
    }
  }
  emit(field, -3);

  /* Bushes and boulders near enough to be in the shadow map */
  const near = new Growth();
  const NEAR_BUSH = [0x46662e, 0x557535, 0x3b5a2a];
  for (let i = 0; i < (lite ? 12 : 20); i++) {
    const a = rand() * Math.PI * 2;
    const r = 13 + rand() * 30;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r - 8;
    if (bz > -4 && Math.abs(bx) < 9) continue; // keep the vista's foreground open
    if (Math.abs(bx) < 4 && bz < -12 && bz > -22) continue; // and the trap house
    if (Math.abs(bx) < 10 && bz > -1 && bz < 16) continue; // and the reaction shot's frame
    const tint = new THREE.Color(NEAR_BUSH[i % NEAR_BUSH.length]).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08);
    const bw = 0.6 + rand() * 0.8;
    const centre = new THREE.Vector3(bx, bw * 0.5, bz);
    const parts = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < parts; k++) {
      addClump(near, rand, bx + (rand() - 0.5) * bw * 1.4, bw * (0.45 + rand() * 0.3), bz + (rand() - 0.5) * bw,
        bw * (0.5 + rand() * 0.3), { tint, centre, squash: 0.85, detail: 1 });
    }
    // Fireweed and a stone or two grow with the bush
    for (let k = 0; k < 4; k++) addFireweed(near, rand, bx + (rand() - 0.5) * 2.4, 0, bz + 0.6 + rand() * 1.2, 0.7 + rand() * 0.5);
  }
  for (let i = 0; i < (lite ? 10 : 16); i++) {
    const a = rand() * Math.PI * 2;
    const r = 9 + rand() * 34;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 6;
    if (Math.abs(x) < 3 && z < -13 && z > -21) continue;
    if (Math.abs(x) < 10 && z > -1 && z < 16) continue;
    addBoulder(near, rand, x, z, 0.3 + rand() * 0.8);
  }
  emit(near, 0, true);

  let triangles = 0;
  meshes.forEach((m) => {
    triangles += m.geometry.attributes.position.count / 3;
  });
  return { group, material, triangles };
}
