/**
 * Pekkas Måleri — the forest round the garden.
 *
 * A Norrland skogsbryn is layered, and the layering is what reads as real
 * from across a garden, far more than polygon count:
 *
 *  - GRAN with drooping branch tiers. Each tier is a skirt of arms whose
 *    tips hang lower than the gaps between them, so the silhouette is
 *    ragged and stepped instead of a smooth cone, ending in a thin leader.
 *    Heights, widths, lean and tier counts vary; trees stand in clusters
 *    with clearings between, and old giants rise out of the young ones.
 *  - BJÖRK in front of the spruce and in the garden itself: white stems
 *    with dark bands and a rough foot, and an airy, hanging crown of light
 *    yellow-green clumps.
 *  - UNDERGROWTH where lawn meets forest: young spruce, junipers, leafy
 *    bushes and drifts of mjölkört (fireweed), the magenta of August.
 *  - DEPTH: a second, taller rank further back, its colours pulled toward
 *    the haze, and a low wooded ridge on the horizon almost lost in it.
 *
 * (The technique follows the shooting game's forest edge; it is rebuilt
 * here for a garden, not imported, so each game owns its own scenery.)
 *
 * Everything goes into merged, vertex-coloured buffers with hand-made
 * normals: foliage normals point out from the crown's centre, so a crown
 * lights as one soft volume instead of a pile of facets. Per vertex, `aTip`
 * marks the outer needles and leaves (they catch the light, and glow when
 * they stand between the eye and the sun) and `aSway` how far up its tree
 * the vertex is, for the wind. One material, a handful of draw calls.
 *
 * The wind never sees a raw clock: its phases are wrapped to 0..2π on the
 * CPU (garden.js) and arrive as a uniform.
 */
import * as THREE from 'three';

/** The fog's colour at the horizon: distance is painted toward it. */
export const HAZE = 0xc8d6d6;
const HAZE_C = new THREE.Color(HAZE);
const _c = new THREE.Color();
const _n = new THREE.Vector3();

/* ------------------------------------------------------------ the buffer */

/** Non-indexed triangles with position, normal, colour, tip and sway. */
export class Growth {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.tip = [];
    this.sway = [];
    this.base = 0;
    this.height = 1;
    this.swayK = 1;
  }

  /** The tree being built: the wind bends it from `base`, over `height`. */
  tree(base, height, k = 1) {
    this.base = base;
    this.height = Math.max(0.5, height);
    this.swayK = k;
  }

  /** One vertex: p, n (any length), colour, tip 0…1. */
  v(px, py, pz, nx, ny, nz, c, tip = 0) {
    const l = Math.hypot(nx, ny, nz) || 1;
    const f = Math.min(1, Math.max(0, (py - this.base) / this.height));
    this.pos.push(px, py, pz);
    this.nor.push(nx / l, ny / l, nz / l);
    this.col.push(c.r, c.g, c.b);
    this.tip.push(tip);
    this.sway.push(f * f * this.swayK);
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
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * The foliage material: Lambert, vertex colours, both sides (the inside of
 * a skirt reads as the dark interior of the tree), the wind, a cool sky
 * sheen on the outer tips and a warm glow where they are backlit.
 * `wind` = { phase: { value: Vector3 } (wrapped), gust: { value } }.
 */
export function foliageMaterial(wind, sunDir) {
  const uniforms = {
    uSunDir: { value: sunDir.clone().normalize() },
    uSunColor: { value: new THREE.Color(0xfff0cf) },
    uFolPh: wind.phase,
    uGust: wind.gust
  };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uFolPh;
        uniform float uGust;
        attribute float aTip;
        attribute float aSway;
        varying float vRim;
        varying float vTip;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // The crown leans with the gusts and the tips flutter; the phase
        // comes from where the vertex stands, so no two trees move as one
        float fPh = position.x * 0.27 + position.z * 0.19;
        float fS = sin(uFolPh.x + fPh) * 0.7 + sin(uFolPh.y + fPh * 2.3) * 0.3;
        transformed.x += fS * aSway * (0.16 + 0.22 * uGust);
        transformed.z += cos(uFolPh.z + fPh) * aSway * 0.07;
        transformed.y += sin(uFolPh.y * 2.0 + fPh * 3.0) * aTip * aSway * 0.025;`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec3 fWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec3 fView = fWorld - cameraPosition;
        float fLen = max(length(fView), 1e-3);
        float fBack = max(dot(fView / fLen, uSunDir), 0.0);
        vRim = fBack * fBack * fBack * fBack * aTip;
        vTip = aTip;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSunColor;
        varying float vRim;
        varying float vTip;`)
      .replace('#include <opaque_fragment>', `
        // Light through the needles where the sun is behind them, and a
        // little cool sky on every outer tip
        outgoingLight += (diffuseColor.rgb * 1.8 + vec3(0.09, 0.11, 0.015)) * uSunColor * vRim;
        outgoingLight += vec3(0.012, 0.018, 0.024) * vTip;
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'pm-foliage';
  mat.userData.windy = true;
  return mat;
}

/* ------------------------------------------------------------ the trees */

/**
 * A Norway spruce. `o`: { tiers, arms, width, tint (Color), tipColor,
 * tipLight 0…1, haze 0…1, trunk, elbow, twigs }. Built into `G` at (x, y0, z).
 */
export function addSpruce(G, rand, x, y0, z, h, o) {
  const { tiers, arms, tint } = o;
  const w = h * (o.width || 0.16 + rand() * 0.06);
  const haze = o.haze || 0;
  const lean = (rand() - 0.5) * 0.05 * h;
  const leanZ = (rand() - 0.5) * 0.03 * h;
  const bare = h * (0.07 + rand() * 0.05);
  const cy = y0 + h * 0.45;
  G.tree(y0, h, o.sway === undefined ? 1 : o.sway);
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
    const tr = Math.max(0.05, h * 0.013);
    const tc = new THREE.Color(0x3b2e24).lerp(HAZE_C, haze);
    for (let s = 0; s < 4; s++) {
      const a0 = (s / 4) * Math.PI * 2;
      const a1 = ((s + 1) / 4) * Math.PI * 2;
      const x0 = Math.cos(a0) * tr;
      const z0 = Math.sin(a0) * tr;
      const x1 = Math.cos(a1) * tr;
      const z1 = Math.sin(a1) * tr;
      const yt = y0 + h * 0.55;
      const lx = lean * 0.22;
      const lz = leanZ * 0.22;
      G.v(x + x0, y0, z + z0, x0, 0, z0, tc);
      G.v(x + x1 + lx, yt, z + z1 + lz, x1, 0, z1, tc);
      G.v(x + x1, y0, z + z1, x1, 0, z1, tc);
      G.v(x + x0, y0, z + z0, x0, 0, z0, tc);
      G.v(x + x0 + lx, yt, z + z0 + lz, x0, 0, z0, tc);
      G.v(x + x1 + lx, yt, z + z1 + lz, x1, 0, z1, tc);
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
    // The bottom of the crown sits in its own shade
    const shade = 0.5 + 0.5 * f1;
    cIn.copy(col(shade * 0.5, 0));
    cTop.copy(col(shade * 0.75, 0));
    const ring = [];
    for (let j = 0; j < k * 2; j++) {
      const tipArm = j % 2 === 0;
      const a = rot + (j / (k * 2)) * Math.PI * 2 + (rand() - 0.5) * 0.35;
      const rr = tipArm ? r * (0.85 + rand() * 0.35) : r * (0.42 + rand() * 0.12);
      // Arm tips droop below the gaps
      const droop = tipArm ? th * (1.0 + rand() * 0.25) : th * (0.55 + rand() * 0.1);
      ring.push({ x: ax + Math.cos(a) * rr, y: ay - droop, z: az + Math.sin(a) * rr, nx: Math.cos(a), nz: Math.sin(a), tip: tipArm });
    }
    const patch = 0.9 + rand() * 0.2;
    cTip.copy(col(shade * (0.95 + rand() * 0.12) * patch, o.tipLight || 0));
    const vtx = (v, c, tip) => {
      _n.set(v.x - x, (v.y - cy) * 0.6 + r * 0.5, v.z - z);
      G.v(v.x, v.y, v.z, _n.x, _n.y, _n.z, c, tip);
    };
    if (o.elbow && !top) {
      // Two-segment arms: out near level from the stem, then hanging at the tip
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
        G.v(ax, ay, az, (p.nx + q.nx) * 0.2, 1.4, (p.nz + q.nz) * 0.2, cTop, 0);
        vtx(el[j1], cMid, 0.4);
        vtx(el[j], cMid, 0.4);
        vtx(el[j], cMid, 0.4);
        vtx(el[j1], cMid, 0.4);
        vtx(q, q.tip ? cTip : cIn, q.tip ? 1 : 0.25);
        vtx(el[j], cMid, 0.4);
        vtx(q, q.tip ? cTip : cIn, q.tip ? 1 : 0.25);
        vtx(p, p.tip ? cTip : cIn, p.tip ? 1 : 0.25);
      }
    } else {
      for (let j = 0; j < ring.length; j++) {
        const p = ring[j];
        const q = ring[(j + 1) % ring.length];
        G.v(ax, ay, az, (p.nx + q.nx) * 0.2, 1.4, (p.nz + q.nz) * 0.2, cTop, 0);
        vtx(q, q.tip ? cTip : cIn, q.tip ? 1 : 0.25);
        vtx(p, p.tip ? cTip : cIn, p.tip ? 1 : 0.25);
      }
    }
  }
  if (o.trunk && o.twigs) {
    // Dead lower branches below the crown: grey, thin, angled down
    const grey = new THREE.Color(0x6b6158).lerp(HAZE_C, haze);
    for (let k = 0; k < o.twigs; k++) {
      const a = rand() * Math.PI * 2;
      const y = y0 + bare * (0.25 + rand() * 0.7);
      const len = h * (0.05 + rand() * 0.05);
      const t = Math.max(0.02, h * 0.003);
      G.v(x - Math.sin(a) * t, y, z + Math.cos(a) * t, Math.cos(a), 0.3, Math.sin(a), grey);
      G.v(x + Math.sin(a) * t, y, z - Math.cos(a) * t, Math.cos(a), 0.3, Math.sin(a), grey);
      G.v(x + Math.cos(a) * len, y - len * 0.45, z + Math.sin(a) * len, Math.cos(a), 0.3, Math.sin(a), grey);
    }
  }
}

/**
 * A soft clump of leaves: a jittered icosphere whose normals point out
 * from `centre` (the whole crown or bush), dark underneath, light and
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
      const py = y + uy * r * j * (uy < 0 ? 1 + droop : 1 / squash) * squash * 0.8;
      vs.push([x + ux * r * j, py, z + uz * r * j, uy, j]);
    }
    for (const [px, py, pz, uy, j] of vs) {
      _n.set(px - centre.x, (py - centre.y) * 0.9 + r * (o.lift || 0.4), pz - centre.z);
      const k = 1 - shadeK + shadeK * (uy * 0.5 + 0.5);
      _c.copy(o.tint).multiplyScalar(k * (0.9 + (j - 0.78) * 0.5)).lerp(HAZE_C, haze);
      G.v(px, py, pz, _n.x, _n.y, _n.z, _c, Math.min(1, Math.max(0, j - 0.85) * 3) * (o.tipK || 1) * (0.4 + 0.6 * Math.max(0, uy + 0.3)));
    }
  }
  geo.dispose();
}

/**
 * A birch: a white stem with dark lenticel bands and a dark rough foot,
 * and a light, hanging crown of clumps. `o.top` is how far up the stem the
 * crown starts to spread (lower for a garden birch grown in the open).
 */
export function addBirch(G, rand, x, y0, z, h, o = {}) {
  const haze = o.haze || 0;
  const bend = o.bend === undefined ? 1 : o.bend;
  const bendX = (rand() - 0.5) * 0.08 * h * bend;
  const bendZ = (rand() - 0.5) * 0.05 * h * bend;
  const segs = 7;
  const r0 = o.radius || Math.max(0.09, h * 0.02);
  const sides = o.sides || 5;
  const white = new THREE.Color(0xeeeae0).lerp(HAZE_C, haze);
  const dark = new THREE.Color(0x2c2826).lerp(HAZE_C, haze);
  const foot = new THREE.Color(0x4a4440).lerp(HAZE_C, haze);
  const stemTop = 0.82;
  G.tree(y0, h, o.sway === undefined ? 1.2 : o.sway);
  const at = (f) => [x + bendX * Math.sin(f * 2.4), y0 + h * stemTop * f, z + bendZ * f * f];
  const cc = new THREE.Color();
  for (let s = 0; s < segs; s++) {
    const f0 = s / segs;
    const f1 = (s + 1) / segs;
    const [x0, yA, z0] = at(f0);
    const [x1, yB, z1] = at(f1);
    const ra = r0 * (1 - f0 * 0.75);
    const rb = r0 * (1 - f1 * 0.75);
    if (s === 0) cc.copy(foot);
    else if (rand() < 0.3) cc.copy(white).lerp(dark, 0.55 + rand() * 0.3);
    else cc.copy(white).multiplyScalar(0.9 + rand() * 0.1);
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
  // Crown: hanging clumps round the upper stem, biggest in the middle
  const leaf = new THREE.Color(o.leaf || 0x9cba52);
  const n = o.clumps || 7;
  const crownC = new THREE.Vector3(...at(0.78));
  const cw = h * (o.spread || 0.17 + rand() * 0.05);
  const lo = o.top === undefined ? 0.42 : o.top;
  for (let k = 0; k < n; k++) {
    const f = lo + (k / n) * (1 - lo);
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

/** Mjölkört: a pink spike on a green stalk (two crossed fins, a few tris). */
export function addFireweed(G, rand, x, y0, z, h, haze = 0) {
  const pink = new THREE.Color(0xd04a8c).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.1).lerp(HAZE_C, haze);
  const stem = new THREE.Color(0x5b7134).lerp(HAZE_C, haze);
  const bud = new THREE.Color(0x8a4a6a).lerp(HAZE_C, haze);
  const w = h * 0.07;
  const a = rand() * Math.PI;
  G.tree(y0, h, 0.4);
  for (let f = 0; f < 2; f++) {
    const ang = a + f * Math.PI * 0.5;
    const dx = Math.cos(ang) * w;
    const dz = Math.sin(ang) * w;
    const nx = -Math.sin(ang);
    const nz = Math.cos(ang);
    const yS = y0 + h * 0.5;
    const yT = y0 + h;
    G.v(x - dx * 0.5, y0, z - dz * 0.5, nx, 0.6, nz, stem);
    G.v(x + dx * 0.5, y0, z + dz * 0.5, nx, 0.6, nz, stem);
    G.v(x, yS, z, nx, 0.6, nz, stem);
    G.v(x - dx, yS, z - dz, nx, 0.5, nz, pink, 0.8);
    G.v(x + dx, yS, z + dz, nx, 0.5, nz, pink, 0.8);
    G.v(x, yT, z, nx, 0.5, nz, bud, 1);
  }
}

/** A low wooded ridge on the horizon: a ragged strip, nearly all haze. */
function addRidge(G, rand, x0, x1, z, y0, hMin, hMax, haze, tint) {
  const steps = Math.round((x1 - x0) / 3);
  const c = new THREE.Color(tint).lerp(HAZE_C, haze);
  const cTop = new THREE.Color(tint).multiplyScalar(1.15).lerp(HAZE_C, haze);
  G.tree(-1e3, 1, 0);
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    // A rolling crest with tree-top teeth on it
    const crest = hMin + (hMax - hMin) * (0.5 + 0.5 * Math.sin(i * 0.21 + 1.3) * Math.sin(i * 0.067));
    const y = y0 + crest + (rand() - 0.3) * 1.4;
    const zz = z + Math.sin(i * 0.13) * 3;
    const cur = { x, y, z: zz };
    if (prev) {
      G.v(prev.x, y0, prev.z, 0, 0.3, 1, c);
      G.v(cur.x, y0, cur.z, 0, 0.3, 1, c);
      G.v(cur.x, cur.y, cur.z, 0, 0.6, 1, cTop);
      G.v(prev.x, y0, prev.z, 0, 0.3, 1, c);
      G.v(cur.x, cur.y, cur.z, 0, 0.6, 1, cTop);
      G.v(prev.x, prev.y, prev.z, 0, 0.6, 1, cTop);
    }
    prev = cur;
  }
}

/* -------------------------------------------------------- the forest edge */

/**
 * The forest round the garden at Terrassvägen 47: the edge behind the
 * hedge and the house, wrapping round to the west where the judging shot
 * and the phones look; birches in front of it and undergrowth at its foot;
 * a taller hazed rank behind; a ridge on the horizon; and the garden's own
 * three birches (two carry the bunting). `lite` (phones) trims counts.
 * Returns { group, material, meshes, near, triangles }.
 */
export function buildForest(rand, { lite = false, wind, sunDir } = {}) {
  const group = new THREE.Group();
  group.name = 'forest';
  const material = foliageMaterial(wind, sunDir);
  const meshes = [];
  const emit = (G, shadow = false) => {
    if (!G.count) return null;
    const m = new THREE.Mesh(G.geometry(), material);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    meshes.push(m);
    return m;
  };
  const SPRUCE = new THREE.Color(0x1f3d24);
  const SPRUCE_TIP = new THREE.Color(0x63823c);
  const q = lite ? 0.6 : 1;
  const sprTint = (dl = 0) => SPRUCE.clone().offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.08 + dl);
  // Keep clear of the house (and the path to it) and the flagpole
  const clearOf = (x, z) => !(x > 3.5 && x < 16 && z > -27.5) && !(Math.abs(x - 1.6) < 1.6 && Math.abs(z + 13.4) < 1.6);

  /* The ridge and the far rank: big, simple and almost in the haze */
  const far = new Growth();
  addRidge(far, rand, -110, 110, -74, -1, 5, 13, 0.72, 0x2c4a36);
  {
    const n = Math.round(70 * q);
    for (let i = 0; i < n; i++) {
      const x = -80 + (i / n) * 160 + (rand() - 0.5) * 3;
      const zz = -44 - rand() * 12;
      const h = 11 + rand() * 11;
      addSpruce(far, rand, x, -0.5, zz, h, { tiers: lite ? 5 : 6, arms: 5, tint: sprTint(), haze: 0.42 + rand() * 0.1, sway: 0.5 });
    }
    // The west side, behind the wrap
    for (let i = 0; i < Math.round(26 * q); i++) {
      addSpruce(far, rand, -44 - rand() * 12, -0.5, -40 + i * 2.6 + rand() * 2, 11 + rand() * 9, {
        tiers: lite ? 5 : 6, arms: 5, tint: sprTint(), haze: 0.42 + rand() * 0.1, sway: 0.5
      });
    }
  }
  emit(far);

  /* The edge: clusters and clearings, old giants among young trees */
  const edge = new Growth();
  const placeRow = (pos, count, haze) => {
    // `pos(t, jitter)` → [x, z] along the row, t 0..1
    let t = 0;
    while (t < 1) {
      const cluster = 3 + Math.floor(rand() * 5);
      for (let c = 0; c < cluster && t < 1; c++) {
        const [x, z] = pos(t, rand());
        if (clearOf(x, z)) {
          const old = rand() < 0.2;
          const h = old ? 15 + rand() * 6 : 6.5 + rand() * 8;
          addSpruce(edge, rand, x, -0.3, z, h, {
            tiers: lite ? 6 : Math.round(8 + h * 0.2), arms: lite ? 5 : 7, tint: sprTint(), tipColor: SPRUCE_TIP,
            tipLight: 0.35, haze: haze + rand() * 0.05, trunk: !lite, elbow: !lite && (old || rand() < 0.3), twigs: lite ? 0 : 3
          });
        }
        t += (1 / count) * (0.5 + rand() * 0.8);
      }
      // A clearing
      t += (1 / count) * (0.5 + rand() * 2);
    }
  };
  // North, behind the hedge and the house; then round to the west
  placeRow((t, j) => [-34 + t * 76, -24.5 - j * 5.5], Math.round(34 * q), 0.12);
  placeRow((t, j) => [-25 - j * 5, -22 + t * 38], Math.round(18 * q), 0.1);
  // A second line among and behind them, a little hazier
  placeRow((t, j) => [-40 + t * 84, -31 - j * 5], Math.round(30 * q), 0.22);

  /* Birches in front of the spruce, in loose groups */
  for (let i = 0; i < (lite ? 7 : 13); i++) {
    const gx = -28 + rand() * 56;
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const bx = gx + (rand() - 0.5) * 4;
      const bz = -21 - rand() * 3;
      if (!clearOf(bx, bz)) continue;
      addBirch(edge, rand, bx, -0.2, bz, 6 + rand() * 4.5, { haze: 0.08, clumps: lite ? 8 : 14, detail: 0, clumpScale: 0.8, leaf: 0x8cab4c });
    }
  }
  for (let i = 0; i < (lite ? 3 : 6); i++) {
    addBirch(edge, rand, -21 - rand() * 2.5, -0.2, -15 + rand() * 26, 6 + rand() * 4, { haze: 0.06, clumps: lite ? 8 : 14, detail: 0, clumpScale: 0.8, leaf: 0x8cab4c });
  }
  emit(edge);

  /* Undergrowth along the edge: saplings, junipers, bushes, fireweed */
  const under = new Growth();
  const BUSHES = [0x4d6b32, 0x5b7a36, 0x3f5e2e, 0x6b8340];
  const footAt = (r) => (r < 0.72 ? [-30 + rand() * 62, -19.5 - rand() * 3.5] : [-19.5 - rand() * 3, -18 + rand() * 30]);
  for (let i = 0; i < (lite ? 45 : 95); i++) {
    const [ux, uz] = footAt(rand());
    if (!clearOf(ux, uz)) continue;
    const r = rand();
    if (r < 0.3) {
      addSpruce(under, rand, ux, -0.1, uz, 1.4 + rand() * 2.6, {
        tiers: lite ? 4 : 6, arms: 6, tint: sprTint(0.03), tipColor: SPRUCE_TIP, tipLight: 0.5, haze: 0.06
      });
    } else if (r < 0.42) {
      // Juniper: a dark, narrow column
      addSpruce(under, rand, ux, -0.05, uz, 1.2 + rand() * 1.6, {
        tiers: 5, arms: 5, width: 0.16, tint: new THREE.Color(0x2e4636), tipColor: new THREE.Color(0x4f6a55), tipLight: 0.4, haze: 0.06
      });
    } else {
      const tint = new THREE.Color(BUSHES[Math.floor(rand() * BUSHES.length)]).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08);
      const bw = 0.7 + rand() * 1.2;
      const centre = new THREE.Vector3(ux, bw * 0.6, uz);
      under.tree(0, bw * 1.4, 0.5);
      for (let k = 0; k < (lite ? 2 : 3); k++) {
        addClump(under, rand, ux + (rand() - 0.5) * bw * 1.2, bw * (0.45 + rand() * 0.35), uz + (rand() - 0.5) * bw * 0.6,
          bw * (0.55 + rand() * 0.3), { tint, haze: 0.06, centre, squash: 0.9, detail: 0 });
      }
    }
  }
  for (let i = 0; i < (lite ? 16 : 34); i++) {
    // Fireweed in drifts
    const [fx, fz] = footAt(rand() * 0.8);
    if (!clearOf(fx, fz)) continue;
    const n = 3 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) addFireweed(under, rand, fx + (rand() - 0.5) * 2.4, -0.05, fz + (rand() - 0.5) * 1.2, 0.8 + rand() * 0.5, 0.04);
  }
  emit(under);

  /* The garden's own birches: two carry the bunting, one stands behind the
     player's shoulder, its crown out of frame but its shade on the lawn */
  const near = new Growth();
  [[-8.6, -8.4, 7.2], [9.2, -8.8, 7.6], [-7.6, 4.4, 7.8]].forEach(([bx, bz, h]) => {
    addBirch(near, rand, bx, 0, bz, h, {
      clumps: lite ? 22 : 44, detail: 1, radius: 0.15, sides: 7, top: 0.46, spread: 0.24, clumpScale: 0.86, leaf: 0x86a648,
      // Nearly straight, so the bunting's line meets the stem where it should
      bend: 0.15
    });
  });
  const nearMesh = emit(near, true);

  let triangles = 0;
  meshes.forEach((m) => {
    triangles += m.geometry.attributes.position.count / 3;
  });
  return { group, material, meshes, near: nearMesh, triangles };
}
