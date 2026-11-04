/**
 * Pekkas Fiske — the shore at midnight sun.
 *
 * Everything above the water that is not the eka: four ranks of land that
 * fade into the haze the further away they stand (fells, forested hills,
 * the far forest, the near forest), a holme with a few spruces, and the
 * headland with the falu-red stuga, its brygga and the flaggstång.
 *
 * The far ranks are SILHOUETTES: each is a curtain whose top edge is a
 * height field — spruce by spruce, birch crown by birch crown — sampled
 * every few decimetres. The same height fields go into a small texture,
 * and the lake's shader ray-casts its reflection against them, rank by
 * rank, so every tree on the far shore is mirrored in the lake where it
 * should be, broken up by the ripples near the boat and crisp far out.
 *
 * Aerial perspective is painted into the vertex colours: the further a
 * rank stands the closer it is to the colour of the sky behind it, its
 * foot sinks into a band of pale mist, and toward the sun every rank
 * warms and lifts — the low sun lights the haze, not the hills.
 *
 * The near headland is real 3D, lit by the scene (one draw for all of it,
 * one for the lit windows). Mist hangs over the water in soft bands, and a
 * few birds work the evening sky. Cost: five draw calls for the lot.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------- helpers */

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise on a seeded lattice. */
function noise1(seed) {
  const r = rng(seed);
  const N = 512;
  const g = new Float32Array(N);
  for (let i = 0; i < N; i++) g[i] = r();
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = g[((i % N) + N) % N];
    const b = g[(((i + 1) % N) + N) % N];
    return a + (b - a) * f * f * (3 - 2 * f);
  };
}

function fbm(n, x, oct = 4) {
  let a = 0.5;
  let s = 0;
  let t = 0;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    s += n(x * f + o * 17.3) * a;
    t += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / t;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const col = (hex) => new THREE.Color(hex);

/* --------------------------------------------------------- tree shapes */

/**
 * A spruce's half-width at height y: a narrow cone of drooping tiers — each
 * tier widest at its foot — with a thin spire. This outline is what makes a
 * Nordic shore read as spruce at a glance.
 */
function spruceRadius(y, H, W, tiers) {
  if (y < 0 || y > H) return -1;
  const k = (y / H) * tiers;
  const f = k - Math.floor(k);
  const cone = (1 - y / H) ** 0.8;
  return W * cone * (0.58 + 0.42 * (1 - f) ** 1.4) + (y < H * 0.12 ? W * 0.05 : 0);
}

/** Height of a spruce's outline at |dx| from its trunk (0 outside it). */
function spruceHeight(dx, H, W, tiers) {
  if (dx > W) return 0;
  for (let s = 0; s <= 72; s++) {
    const y = H * (1 - s / 72);
    if (spruceRadius(y, H, W, tiers) >= dx) return y;
  }
  return 0;
}

/** A birch: a rounded, slightly lumpy crown on a thin trunk. */
function birchHeight(dx, H, W, lump) {
  const cy = H * 0.66;
  const ry = H * 0.34;
  if (dx > W) return dx < W * 0.07 + 0.08 ? cy : 0;
  const k = dx / W;
  return cy + ry * Math.sqrt(Math.max(0, 1 - k * k)) * (0.9 + 0.1 * lump(dx * 1.7));
}

/* ------------------------------------------------------------ the ranks */

/**
 * One rank of the far shore. Its height field `h` is sampled every `step`
 * metres from x0; `kind` marks birch columns (they are drawn a touch paler
 * and greener), `mistH` how high the haze reaches up its foot.
 */
function makeRank(spec, lite) {
  const step = spec.step * (lite ? 1.6 : 1);
  const n = Math.ceil((spec.x1 - spec.x0) / step) + 1;
  const h = new Float32Array(n);
  const birch = new Uint8Array(n);
  const xs = (i) => spec.x0 + i * step;
  for (let i = 0; i < n; i++) h[i] = spec.ground(xs(i));
  const r = rng(spec.seed);
  if (spec.trees) {
    const lump = noise1(spec.seed + 9);
    // Stands and clearings: a slow noise makes the forest taller in some
    // stretches, lower and thinner in others, so the skyline never reads
    // as a row of identical teeth
    const stand = noise1(spec.seed + 4);
    let x = spec.x0 + r() * 2;
    while (x < spec.x1) {
      const t = spec.trees(x, r);
      const k = fbm(stand, x * 0.035, 3);
      if (t && k < 0.28 && r() < 0.6) t.H *= 0.55; // a clearing: scrub and young trees
      if (t) {
        t.H *= 0.72 + k * 0.62;
        t.W *= 0.85 + k * 0.3;
        const g = spec.ground(x);
        const i0 = Math.max(0, Math.floor((x - t.W - spec.x0) / step));
        const i1 = Math.min(n - 1, Math.ceil((x + t.W - spec.x0) / step));
        const tiers = 6 + Math.round(t.H / 2.4);
        for (let i = i0; i <= i1; i++) {
          const dx = Math.abs(xs(i) - x);
          const y = t.birch ? birchHeight(dx, t.H, t.W, lump) : spruceHeight(dx, t.H, t.W, tiers);
          if (y > 0 && g + y > h[i]) {
            h[i] = g + y;
            birch[i] = t.birch ? 1 : 0;
          }
        }
      }
      x += spec.gap(x, r);
    }
  }
  let hmax = 0;
  for (let i = 0; i < n; i++) hmax = Math.max(hmax, h[i]);
  return { ...spec, step, n, h, birch, hmax: Math.max(1, hmax) };
}

/** Angle (radians) between a point on the shore and the sun, seen from the boat. */
function sunAngle(x, z, sunAz) {
  const dx = x + 6;
  const dz = z - 14;
  const l = Math.hypot(dx, dz) || 1;
  return Math.acos(Math.min(1, Math.max(-1, (dx * sunAz.x + dz * sunAz.y) / l)));
}

/**
 * A rank as a curtain: three vertices a column — foot (in the mist), the
 * top of the mist, and the outline — so the haze can lie low and thick.
 */
function rankGeometry(rank, sunAz, glowC) {
  const { n, h, z, base } = rank;
  const pos = new Float32Array(n * 9);
  const cols = new Float32Array(n * 9);
  const idx = [];
  const top = new THREE.Color();
  const mist = new THREE.Color();
  const mid = new THREE.Color();
  const birchC = col(rank.birchTint || rank.top);
  for (let i = 0; i < n; i++) {
    const x = rank.x0 + i * rank.step;
    const hy = Math.max(h[i], base + 0.05);
    const my = Math.min(hy, base + rank.mistH);
    // A hot core of haze right under the sun and a wide, faint skirt
    const a = sunAngle(x, z, sunAz);
    const g1 = Math.exp(-((a / 0.09) ** 2)) * rank.glow * 0.8;
    const g2 = Math.exp(-((a / 0.42) ** 2)) * rank.glow * 0.22;
    top.set(rank.top);
    if (rank.birch[i]) top.lerp(birchC, 0.35);
    top.lerp(glowC, Math.min(1, g1 + g2));
    mist.set(rank.mist).lerp(glowC, Math.min(1, g1 * 1.2 + g2));
    mid.copy(top).lerp(mist, rank.midMix ?? 0.35);
    const o = i * 9;
    pos[o] = x; pos[o + 1] = base; pos[o + 2] = z;
    pos[o + 3] = x; pos[o + 4] = my; pos[o + 5] = z;
    pos[o + 6] = x; pos[o + 7] = hy; pos[o + 8] = z;
    cols[o] = mist.r; cols[o + 1] = mist.g; cols[o + 2] = mist.b;
    cols[o + 3] = mid.r; cols[o + 4] = mid.g; cols[o + 5] = mid.b;
    cols[o + 6] = top.r; cols[o + 7] = top.g; cols[o + 8] = top.b;
    if (i < n - 1) {
      const a = i * 3;
      const b = (i + 1) * 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setIndex(idx);
  return g;
}

function mergeIndexed(list) {
  let vc = 0;
  let ic = 0;
  list.forEach((g) => {
    vc += g.attributes.position.count;
    ic += g.index.count;
  });
  const pos = new Float32Array(vc * 3);
  const cols = new Float32Array(vc * 3);
  const idx = new Uint32Array(ic);
  let vo = 0;
  let io = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, vo * 3);
    cols.set(g.attributes.color.array, vo * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
    vo += g.attributes.position.count;
    io += src.length;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ------------------------------------------------------- the headland */

/** Paints and collects non-indexed, vertex-coloured triangles. */
class Kit {
  constructor() {
    this.p = [];
    this.c = [];
  }

  add(geo, paint) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position;
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      this.p.push(v.x, v.y, v.z);
      if (typeof paint === 'function') c.copy(paint(v, i));
      else c.set(paint);
      this.c.push(c.r, c.g, c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    return g;
  }
}

const box = (w, h, d, x, y, z, ry = 0, rz = 0, rx = 0) => {
  const b = new THREE.BoxGeometry(w, h, d);
  if (rx) b.rotateX(rx);
  if (rz) b.rotateZ(rz);
  if (ry) b.rotateY(ry);
  b.translate(x, y, z);
  return b;
};

/** The headland's shoreline: land lies behind (more negative z than) it. */
const HL = { x0: 9, x1: 150, cabin: [27, -52], jetty: [22.5, -45] };
function headShore(x) {
  return -41 - Math.sin(x * 0.07) * 4 - Math.max(0, 16 - x) * 1.6 - Math.max(0, x - 60) * 0.12;
}
function headGround(x, z, n) {
  const inland = Math.min(headShore(x) - z, (x - 10) * 1.3);
  if (inland < -2) return -2;
  const rise = smooth(-2, 14, inland);
  return -1.2 + rise * (3.6 + n(x * 0.06 + z * 0.04) * 3.2) + smooth(30, 60, inland) * 2;
}

/**
 * The headland on the right: granite slabs at the water, moss and grass,
 * spruce and birch, the stuga with white corners and a dark roof, the
 * brygga on its posts, the flaggstång with the vimpel, a woodpile.
 * Returns the mesh, the lit windows and its own height field (for the
 * reflection rank).
 */
function buildHeadland(lite) {
  const kit = new Kit();
  const n = noise1(77);
  const r = rng(91);
  const G = (x, z) => headGround(x, z, n);

  /* Ground: a grid that runs out under the water at the shoreline */
  const GX = lite ? 40 : 60;
  const GZ = lite ? 18 : 26;
  const ground = new THREE.PlaneGeometry(HL.x1 - HL.x0, 72, GX, GZ);
  ground.rotateX(-Math.PI / 2);
  ground.translate((HL.x0 + HL.x1) / 2, 0, -78);
  const gp = ground.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, G(gp.getX(i), gp.getZ(i)));
  const granite = col(0x8a7a76);
  const graniteDark = col(0x5c5150);
  const moss = col(0x222a16);
  const grass = col(0x363c1f);
  const heath = col(0x3c2f26);
  const tmp = new THREE.Color();
  kit.add(ground, (v) => {
    const k = n(v.x * 0.31 + v.z * 0.17);
    if (v.y < 0.9) return tmp.copy(graniteDark).lerp(granite, smooth(-0.6, 0.8, v.y) * (0.6 + k * 0.4));
    return tmp.copy(moss).lerp(grass, k).lerp(heath, smooth(0.55, 0.8, n(v.x * 0.11 - v.z * 0.13)) * 0.6);
  });

  /* Granite boulders along the waterline (Höga kusten's red granite) */
  for (let i = 0; i < (lite ? 10 : 16); i++) {
    const x = HL.x0 + 2 + r() * 70;
    const z = headShore(x) - 1 + r() * 3;
    const s = 0.5 + r() * 1.3;
    const rock = new THREE.DodecahedronGeometry(1, 0);
    rock.scale(s * (1 + r() * 0.6), s * (0.45 + r() * 0.3), s);
    rock.rotateY(r() * 3);
    rock.translate(x, Math.max(-0.4, G(x, z)) - s * 0.15, z);
    kit.add(rock, (v) => tmp.copy(granite).lerp(graniteDark, smooth(0.4, -0.3, v.y) * 0.8 + n(v.x * 3 + v.z) * 0.2));
  }

  /* Trees. Height-field entries go into `trees` for the reflection. */
  const trees = [];
  const spruceC = col(0x122419);
  const spruceTip = col(0x24402a);
  const spruce = (x, z, H) => {
    const g = G(x, z) - 0.2;
    const W = H * (0.2 + r() * 0.05);
    const tiers = 5 + Math.round(H / 3);
    for (let k = 0; k < tiers; k++) {
      const y0 = (k / tiers) * H * 0.88 + H * 0.06;
      const hh = (H / tiers) * 1.9;
      const rad = W * (1 - k / tiers) ** 0.9 + 0.15;
      const cone = new THREE.ConeGeometry(rad, hh, 7, 1);
      cone.rotateY(r() * 3);
      cone.translate(x + (r() - 0.5) * 0.2, g + y0 + hh / 2, z);
      kit.add(cone, (v) => tmp.copy(spruceC).lerp(spruceTip, smooth(g + y0, g + y0 + hh, v.y) * 0.45 + r() * 0.08));
    }
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, H * 0.3, 5);
    trunk.translate(x, g + H * 0.15, z);
    kit.add(trunk, 0x3a2a20);
    trees.push({ x, z, g, H, W, birch: false, tiers });
  };
  const birchLeaf = [col(0x3e5424), col(0x4b5c28), col(0x384d22)];
  const bark = col(0xe8e4da);
  const barkDark = col(0x2a2622);
  const birch = (x, z, H) => {
    const g = G(x, z) - 0.2;
    const lean = (r() - 0.5) * 0.12;
    const trunk = new THREE.CylinderGeometry(0.1, 0.17, H * 0.75, 6, 6);
    trunk.rotateZ(lean);
    trunk.translate(x - lean * H * 0.37, g + H * 0.37, z);
    kit.add(trunk, (v) => (Math.sin(v.y * 7.3 + x) > 0.72 || v.y < g + 0.6 ? barkDark : bark));
    const W = H * 0.26;
    const leaf = birchLeaf[Math.floor(r() * 3)];
    for (let k = 0; k < 4; k++) {
      const s = W * (0.55 + r() * 0.35);
      const blob = new THREE.IcosahedronGeometry(1, 0);
      blob.scale(s, s * 1.15, s);
      blob.translate(x - lean * H * 0.8 + (r() - 0.5) * W, g + H * (0.6 + r() * 0.25), z + (r() - 0.5) * W);
      kit.add(blob, () => tmp.copy(leaf).multiplyScalar(0.85 + r() * 0.3));
    }
    trees.push({ x, z, g, H, W: W * 1.4, birch: true });
  };
  // A stand of spruce behind the stuga and along the ridge; birches by the water
  [[33, -60, 15], [37, -63, 18], [21, -63, 13], [44, -58, 12], [49, -66, 19], [55, -61, 14],
    [62, -70, 20], [70, -64, 16], [80, -72, 21], [92, -66, 17], [104, -74, 22], [118, -70, 18], [131, -76, 21]]
    .forEach(([x, z, H]) => spruce(x, z, H * (0.9 + r() * 0.2)));
  [[17.5, -49, 9], [32, -48, 10], [40, -52, 11], [58, -52, 9.5], [75, -57, 12], [86, -58, 10]]
    .forEach(([x, z, H]) => birch(x, z, H * (0.9 + r() * 0.2)));

  /* The stuga: falu red, white corners and trim, a dark roof */
  const [cx, cz] = HL.cabin;
  const cy = G(cx, cz) + 0.1;
  const RED = col(0x8e2a20);
  const WHITE = col(0xece6d8);
  const ROOF = col(0x2b2a2e);
  const W2 = 3.1;
  const D2 = 2.2;
  const WALL = 2.5;
  kit.add(box(W2 * 2 + 0.3, 0.5, D2 * 2 + 0.3, cx, cy - 0.15, cz), 0x5f5856); // stone foundation
  // Walls: vertical board seams drawn as faint darker stripes
  kit.add(box(W2 * 2, WALL, D2 * 2, cx, cy + WALL / 2 + 0.1, cz), (v) => tmp.copy(RED).multiplyScalar(Math.sin(v.x * 9.5 + v.z * 9.5) > 0.86 ? 0.82 : 1));
  // Gable ends: triangles above the side walls
  [-1, 1].forEach((s) => {
    const tri = new THREE.BufferGeometry();
    const yb = cy + WALL + 0.1;
    tri.setAttribute('position', new THREE.Float32BufferAttribute([
      cx + s * W2, yb, cz - D2, cx + s * W2, yb, cz + D2, cx + s * W2, yb + 1.7, cz,
      cx + s * W2, yb, cz + D2, cx + s * W2, yb, cz - D2, cx + s * W2, yb + 1.7, cz
    ], 3));
    kit.add(tri, RED);
  });
  // Corner boards, sills and the barge boards
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
    kit.add(box(0.22, WALL + 0.05, 0.22, cx + sx * (W2 - 0.04), cy + WALL / 2 + 0.1, cz + sz * (D2 - 0.04)), WHITE);
  });
  [-1, 1].forEach((s) => {
    const len = Math.hypot(D2 + 0.4, 1.8);
    const ang = Math.atan2(1.8, D2 + 0.4);
    // Roof planes, 30 cm overhang
    kit.add(box(W2 * 2 + 0.7, 0.12, len, cx, cy + WALL + 0.1 + 0.9 + 0.08, cz + s * (D2 + 0.4) / 2, 0, 0, s * ang), ROOF);
    [-1, 1].forEach((e) => {
      kit.add(box(0.12, 0.22, len, cx + e * (W2 + 0.36), cy + WALL + 0.1 + 0.88, cz + s * (D2 + 0.4) / 2, 0, 0, s * ang), WHITE);
    });
  });
  kit.add(box(0.5, 1.4, 0.5, cx + 1.4, cy + WALL + 1.9, cz - 0.6), 0xd8d2c4); // chimney
  kit.add(box(0.6, 0.12, 0.6, cx + 1.4, cy + WALL + 2.6, cz - 0.6), 0x3a3534);
  // Front: door with a white frame, two windows with white frames (glass is in the glow mesh)
  const fz = cz + D2;
  kit.add(box(1.15, 2.05, 0.12, cx + 1.3, cy + 1.1, fz + 0.04), WHITE);
  kit.add(box(0.9, 1.85, 0.16, cx + 1.3, cy + 1.02, fz + 0.06), 0x4e6a5a);
  [-1.6, -0.2].forEach((wx) => kit.add(box(1.1, 1.1, 0.12, cx + wx, cy + 1.6, fz + 0.04), WHITE));
  kit.add(box(1.6, 0.3, 0.9, cx + 1.3, cy - 0.05, fz + 0.5), 0x7a6248); // step
  // Woodpile against the gable and a bench by the door
  for (let k = 0; k < 5; k++) kit.add(box(0.35, 0.3, 1.8, cx - W2 - 0.4, cy + 0.15 + k * 0.3, cz - 0.4 + (k % 2) * 0.05), k % 2 ? 0x8a6a48 : 0x7a5a3a);
  kit.add(box(1.4, 0.08, 0.4, cx - 0.9, cy + 0.45, fz + 0.5), 0x8a6a48);

  /* The brygga: a deck on posts running out toward the boat */
  const [jx, jz] = HL.jetty;
  const JL = 13;
  const JY = 1.0;
  const jAng = 0.18;
  for (let k = 0; k < 26; k++) {
    const d = (k + 0.5) * (JL / 26);
    kit.add(box(1.8, 0.07, JL / 26 - 0.04, jx - Math.sin(jAng) * d, JY, jz + Math.cos(jAng) * d, -jAng), k % 3 ? 0x8a7056 : 0x7d6550);
  }
  for (let k = 0; k <= 4; k++) {
    const d = k * (JL / 4);
    [-0.82, 0.82].forEach((s) => {
      const px = jx - Math.sin(jAng) * d + Math.cos(jAng) * s;
      const pz = jz + Math.cos(jAng) * d + Math.sin(jAng) * s;
      kit.add(box(0.18, 2.6, 0.18, px, JY - 1.3, pz), 0x3e3026);
    });
  }
  // A mooring post and a little ladder at the end
  const ex = jx - Math.sin(jAng) * JL;
  const ez = jz + Math.cos(jAng) * JL;
  kit.add(box(0.2, 1.0, 0.2, ex + 0.8, JY + 0.45, ez), 0x3e3026);
  [0.3, 0.0, -0.3].forEach((dy) => kit.add(box(0.6, 0.05, 0.05, ex - 0.2, JY + dy - 0.2, ez + 0.1), 0x6a5040));

  /* Flaggstång: white pole and a gilded knob */
  const fx = 37;
  const fzp = -47;
  const fy = G(fx, fzp);
  kit.add(new THREE.CylinderGeometry(0.06, 0.1, 10, 6).translate(fx, fy + 5, fzp), WHITE);
  kit.add(new THREE.SphereGeometry(0.16, 8, 6).translate(fx, fy + 10.1, fzp), 0xd8b04a);

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(kit.geometry(), material);
  mesh.renderOrder = -6;

  /* Lit windows: plain colour so they glow through the evening */
  const glowKit = new Kit();
  [-1.6, -0.2].forEach((wx) => {
    glowKit.add(box(0.86, 0.86, 0.06, cx + wx, cy + 1.6, fz + 0.12), 0xffc670);
  });
  glowKit.add(box(0.7, 0.7, 0.06, cx + W2 + 0.1, cy + 1.6, cz + 0.6, Math.PI / 2), 0xffb85a);
  const glow = new THREE.Mesh(glowKit.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  glow.renderOrder = -6;

  // The vimpel: blue with a long tail, anchored at the top of the pole
  const vimpel = new THREE.Mesh(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.7, 0), new THREE.Vector3(3.6, -0.35, 0),
      new THREE.Vector3(0, -0.7, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(3.6, -0.35, 0)
    ]),
    new THREE.MeshBasicMaterial({ color: 0x2a62b0, side: THREE.DoubleSide, fog: false })
  );
  vimpel.position.set(fx, fy + 9.9, fzp);

  // The reflection rank: the outline seen from the lake, column by column
  const hf = (x) => {
    let h = -2;
    for (let z = -40; z > -100; z -= 4) h = Math.max(h, G(x, z) - (z + 40) * 0.02);
    trees.forEach((t) => {
      const dx = Math.abs(x - t.x);
      const y = t.birch ? birchHeight(dx, t.H, t.W, () => 0.5) : spruceHeight(dx, t.H, t.W * 1.15, t.tiers);
      if (y > 0) h = Math.max(h, t.g + y);
    });
    if (Math.abs(x - cx) < W2 + 0.4) h = Math.max(h, cy + WALL + 0.1 + 1.8 - Math.abs(x - cx) * 0.02);
    if (Math.abs(x - fx) < 0.12) h = Math.max(h, fy + 10);
    return Math.max(0, h);
  };
  return { mesh, glow, vimpel, hf };
}

/* -------------------------------------------------------------- mist */

/**
 * Soft bands of mist: one along the foot of the near forest and a few
 * lying low over the open water. The noise field scrolls slowly through
 * them, so they drift and thin out instead of hanging as flat cards.
 */
function buildMist(noise, sunAz, timeU, lite) {
  const pos = [];
  const uv = [];
  const seed = [];
  const idx = [];
  const r = rng(55);
  const band = (x, y0, z, w, h, a) => {
    const b = pos.length / 3;
    pos.push(x - w / 2, y0, z, x + w / 2, y0, z, x + w / 2, y0 + h, z, x - w / 2, y0 + h, z);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const sd = r() * 10;
    for (let k = 0; k < 4; k++) seed.push(sd, a, w / 40);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  band(0, -0.6, -117, 640, 4.2, 0.42); // along the near forest
  band(-50, -0.6, -84, 70, 2.6, 0.35); // round the holme
  band(10, -0.6, -172, 900, 6, 0.4);   // the far shore
  const wisps = lite ? 4 : 7;
  for (let i = 0; i < wisps; i++) {
    band(-60 + r() * 120, -0.8, -26 - i * 11 - r() * 6, 30 + r() * 40, 2.2 + r() * 1.2, 0.2 + r() * 0.14);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(seed), 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: noise },
      uTime: timeU,
      uSunAz: { value: sunAz },
      uCool: { value: col(0xd9c2c4) },
      uWarm: { value: col(0xffd2a0) }
    },
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: `
      attribute vec3 aSeed;
      varying vec2 vUv;
      varying vec3 vSeed;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      uniform sampler2D uNoise;
      uniform float uTime;
      uniform vec2 uSunAz;
      uniform vec3 uCool, uWarm;
      varying vec2 vUv;
      varying vec3 vSeed;
      varying vec3 vWorld;
      void main() {
        float t = uTime;
        // Thick near the water, thinning upward; soft at both ends
        float v = vUv.y;
        float prof = smoothstep(0.0, 0.12, v) * (1.0 - smoothstep(0.25, 1.0, v));
        float ends = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
        vec2 q = vec2(vUv.x * vSeed.z * 3.0 + vSeed.x + t * 0.004, v * 0.35 + vSeed.x * 0.37);
        float n = texture2D(uNoise, q).r * 0.65 + texture2D(uNoise, q * 2.3 - vec2(t * 0.006, 0.0)).g * 0.35;
        float a = prof * ends * smoothstep(0.3, 0.75, n) * vSeed.y;
        if (a < 0.003) discard;
        // Lit from behind: the mist toward the sun glows warm
        vec3 d = vWorld - vec3(-6.0, 2.0, 14.0);
        float l = max(length(d.xz), 1.0);
        float toward = max(0.0, dot(d.xz / l, uSunAz));
        vec3 c = mix(uCool, uWarm, pow(toward, 6.0));
        c += uWarm * pow(toward, 40.0) * 0.5;
        gl_FragColor = vec4(c, a * 0.8);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 6; // after the lake: the mist lies over it
  mesh.frustumCulled = false;
  return mesh;
}

/* ------------------------------------------------------------- birds */

/**
 * Three gulls wheeling over the headland and a skein of seven far off,
 * crossing the sky. One small mesh rewritten each frame: two-part wings
 * that beat or glide, dark against the bright sky.
 */
function buildBirds() {
  const N = 10;
  const TRI = 5; // per bird: body + two wings of two parts
  const pos = new Float32Array(N * TRI * 9);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a2632, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -7;
  const birds = [];
  for (let i = 0; i < 3; i++) {
    birds.push({ kind: 'gull', cx: 30 + i * 6, cy: 16 + i * 3, cz: -64 - i * 5, rad: 14 + i * 5, sp: 0.16 + i * 0.03, ph: i * 2.1, span: 1.5 });
  }
  for (let i = 0; i < 7; i++) {
    const row = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    birds.push({ kind: 'far', ox: -row * 3.2, oy: row * 0.2 * side, oz: side * row * 2.4, ph: i * 0.7, span: 2.2 });
  }
  const v = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let o = 0;
  const put = (p) => {
    pos[o++] = p.x;
    pos[o++] = p.y;
    pos[o++] = p.z;
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  function update(t) {
    o = 0;
    // The skein crosses the whole sky in about three minutes, then again
    const skX = -260 + ((t * 2.6) % 520);
    birds.forEach((bd) => {
      let flap;
      if (bd.kind === 'gull') {
        const ang = t * bd.sp + bd.ph;
        v.set(bd.cx + Math.cos(ang) * bd.rad, bd.cy + Math.sin(ang * 2.3) * 1.5, bd.cz + Math.sin(ang) * bd.rad * 0.5);
        fwd.set(-Math.sin(ang), 0, Math.cos(ang) * 0.5).normalize();
        // Gulls mostly glide, with a few lazy beats now and then
        const beat = Math.sin(t * 0.7 + bd.ph * 3) > 0.4;
        flap = beat ? Math.sin(t * 7 + bd.ph) * 0.9 : 0.12;
      } else {
        v.set(skX + bd.ox, 34 + bd.oy + Math.sin(t * 0.3) * 1.5, -205 + bd.oz);
        fwd.set(1, 0, 0);
        flap = Math.sin(t * 5.5 + bd.ph) * 0.8;
      }
      side.crossVectors(up, fwd).normalize();
      const s = bd.span;
      const lift = flap * 0.45 * s;
      // body
      a.copy(v).addScaledVector(fwd, 0.35 * s);
      b.copy(v).addScaledVector(fwd, -0.3 * s).addScaledVector(side, 0.06 * s);
      c.copy(v).addScaledVector(fwd, -0.3 * s).addScaledVector(side, -0.06 * s);
      put(a); put(b); put(c);
      [1, -1].forEach((sd) => {
        const elbowY = lift * 0.55;
        const tipY = lift - (bd.kind === 'gull' ? 0.08 * s : 0);
        // inner wing
        a.copy(v).addScaledVector(fwd, 0.12 * s);
        b.copy(v).addScaledVector(fwd, -0.1 * s);
        c.copy(v).addScaledVector(side, sd * 0.45 * s).addScaledVector(fwd, 0.02 * s);
        c.y += elbowY;
        put(a); put(b); put(c);
        // outer wing, swept back
        a.copy(c);
        b.copy(v).addScaledVector(side, sd * 0.42 * s).addScaledVector(fwd, -0.12 * s);
        b.y += elbowY;
        c.copy(v).addScaledVector(side, sd * 0.95 * s).addScaledVector(fwd, -0.22 * s);
        c.y += tipY;
        put(a); put(b); put(c);
      });
    });
    geo.attributes.position.needsUpdate = true;
  }
  update(0);
  geo.computeBoundingSphere();
  return { mesh, update };
}

/* ------------------------------------------------------------ assembly */

/**
 * The whole shore. `sunDir` is the sky's sun (for the warm haze), `noise`
 * the shared noise texture (mist), `timeU` the game's wrapped clock.
 * Returns a Group; userData holds the vimpel, the birds' update and the
 * reflection data the lake needs: { texture, layers }.
 */
export function buildShore({ sunDir, noise, timeU, lite = false }) {
  const g = new THREE.Group();
  const sunAz = new THREE.Vector2(sunDir.x, sunDir.z).normalize();
  const glowC = col(0xffc68e);
  const fellN = noise1(5);
  const hillN = noise1(11);
  const landN = noise1(17);

  // The sun's bearing at each rank, so the fells dip into a saddle where
  // it hangs and the sun sits just clear of the ridge
  const sunX = (z) => -6 + (sunAz.x / -sunAz.y) * (14 - z);

  const specs = [
    {
      name: 'fells', z: -335, x0: -760, x1: 760, step: 2.2, base: 0, seed: 3, mistH: 22, midMix: 0.5, glow: 1,
      top: 0x7d82ac, mist: 0xe9bfae,
      ground: (x) => {
        const sx = sunX(-335);
        const saddle = 1 - 0.55 * Math.exp(-(((x - sx) / 70) ** 2));
        const peaks = fbm(fellN, x * 0.006, 5);
        return (12 + 46 * smooth(0.28, 0.8, peaks) ** 1.3) * saddle;
      }
    },
    {
      name: 'hills', z: -258, x0: -600, x1: 600, step: 0.9, base: 0, seed: 13, mistH: 9, midMix: 0.45, glow: 0.85,
      top: 0x4f5a80, mist: 0xd8aa9c,
      ground: (x) => 4 + 17 * smooth(0.25, 0.85, fbm(hillN, x * 0.011 + 3, 4)),
      trees: (x, r) => (r() < 0.8 ? { H: 2.2 + r() * 1.8, W: 0.9 + r() * 0.6 } : null),
      gap: (x, r) => 1.2 + r() * 1.6
    },
    {
      name: 'far forest', z: -178, x0: -440, x1: 440, step: 0.32, base: 0, seed: 23, mistH: 4, midMix: 0.18, glow: 0.7,
      top: 0x2a3550, mist: 0xc99c92, birchTint: 0x48604e,
      ground: (x) => 1.2 + 4.5 * smooth(0.3, 0.9, fbm(landN, x * 0.02 + 7, 3)),
      trees: (x, r) => {
        const birch = r() < 0.2;
        return birch ? { birch, H: 7.5 + r() * 3, W: 2.6 + r() * 1.2 } : { H: 9 + r() * 3.5, W: 2.1 + r() * 0.8 };
      },
      gap: (x, r) => 1.6 + r() * 2.4
    },
    {
      name: 'near forest', z: -121, x0: -320, x1: 320, step: 0.2, base: -0.5, seed: 31, mistH: 2.6, midMix: 0.06, glow: 0.4,
      top: 0x131c26, mist: 0xae8a86, birchTint: 0x3a5440,
      ground: (x) => 0.5 + 2.2 * smooth(0.3, 0.9, fbm(landN, x * 0.03 + 21, 3)),
      trees: (x, r) => {
        if (x > 8 && x < 150 && r() < 0.6) return null; // the headland stands in front here
        const birch = r() < 0.24;
        return birch ? { birch, H: 10 + r() * 3.5, W: 3.2 + r() * 1.4 } : { H: 11.5 + r() * 4.5, W: 2.5 + r() * 0.9 };
      },
      gap: (x, r) => 1.7 + r() * 2.6
    },
    {
      name: 'holme', z: -86, x0: -76, x1: -26, step: 0.15, base: -0.7, seed: 41, mistH: 1.4, midMix: 0.05, glow: 0.3,
      top: 0x0f171c, mist: 0x9a8280,
      ground: (x) => {
        const k = 1 - ((x + 51) / 24) ** 2;
        return k > 0 ? -0.6 + 2.6 * Math.sqrt(k) + Math.sin(x * 1.3) * 0.15 : -0.7;
      },
      trees: (x, r) => (Math.abs(x + 51) < 15 && r() < 0.85 ? { H: 6 + r() * 6 * (1 - Math.abs(x + 51) / 18), W: 1.7 + r() * 0.7 } : null),
      gap: (x, r) => 1.2 + r() * 2.2
    }
  ];
  const ranks = specs.map((s) => makeRank(s, lite));
  const silhouettes = new THREE.Mesh(
    mergeIndexed(ranks.map((rk) => rankGeometry(rk, sunAz, glowC))),
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })
  );
  silhouettes.renderOrder = -8;
  silhouettes.frustumCulled = false;
  g.add(silhouettes);

  // The land behind the near shore, so no lake shows between the ranks
  const land = new THREE.Mesh(new THREE.PlaneGeometry(1600, 300), new THREE.MeshBasicMaterial({ color: 0x1a1d26, fog: false }));
  land.rotation.x = -Math.PI / 2;
  land.position.set(0, 0.06, -268);
  land.renderOrder = -8;
  g.add(land);

  const head = buildHeadland(lite);
  g.add(head.mesh, head.glow, head.vimpel);

  const mist = buildMist(noise, sunAz, timeU, lite);
  g.add(mist);
  const birds = buildBirds();
  g.add(birds.mesh);

  /* The reflection ranks for the lake: nearest first. Each row of the
     texture is one rank's outline, normalised by its tallest point. */
  const W = 2048;
  const reflect = [
    { name: 'headland', z: -54, x0: HL.x0, x1: HL.x1, h: head.hf, top: 0x141a14, mist: 0x8c7068 },
    ...ranks.slice().reverse().map((rk) => ({
      name: rk.name,
      z: rk.z,
      x0: rk.x0,
      x1: rk.x1,
      h: (x) => {
        const f = (x - rk.x0) / rk.step;
        const i = Math.max(0, Math.min(rk.n - 2, Math.floor(f)));
        const k = Math.min(1, Math.max(0, f - i));
        return rk.h[i] + (rk.h[i + 1] - rk.h[i]) * k;
      },
      top: rk.top,
      mist: rk.mist
    }))
  ];
  const data = new Uint8Array(W * 8 * 4);
  const layers = reflect.map((L, row) => {
    const hs = new Float32Array(W);
    let hmax = 1;
    for (let i = 0; i < W; i++) {
      hs[i] = Math.max(0, L.h(L.x0 + ((i + 0.5) / W) * (L.x1 - L.x0)));
      hmax = Math.max(hmax, hs[i]);
    }
    for (let i = 0; i < W; i++) {
      const o = (row * W + i) * 4;
      data[o] = Math.round((hs[i] / hmax) * 255);
      data[o + 3] = 255;
    }
    // Reflections of backlit land are darker than the land itself
    const top = col(L.top).multiplyScalar(0.7);
    const mistC = col(L.mist).multiplyScalar(0.62);
    return { z: L.z, x0: L.x0, x1: L.x1, hmax, top, mist: mistC };
  });
  const texture = new THREE.DataTexture(data, W, 8, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  g.userData = {
    vimpel: head.vimpel,
    birds,
    reflect: { texture, layers, sunAz },
    dispose() {
      texture.dispose();
    }
  };
  return g;
}
