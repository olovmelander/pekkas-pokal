/**
 * Pekkas Fiske — procedural fish.
 *
 * Every species is generated from a spine profile plus a handful of fin
 * blades, merged down to three meshes (one per body joint) so a whole
 * shoal costs almost nothing to draw. Markings — countershading, the
 * perch's bars, the pike's pale beans, the salmon's spots — are painted
 * into the vertex colours while the rings are generated, so there is not
 * a single texture in the water.
 *
 * The three joints form a chain, so the body actually undulates with a
 * travelling wave instead of just flapping a cone at the back.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------- geometry kit */

/** Merge non-indexed pieces into one geometry with position/normal/colour. */
function mergeParts(parts) {
  let total = 0;
  parts.forEach((p) => {
    total += p.geometry.attributes.position.count;
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  parts.forEach((part) => {
    const g = part.geometry;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const C = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      pos[(o + i) * 3] = P.getX(i);
      pos[(o + i) * 3 + 1] = P.getY(i);
      pos[(o + i) * 3 + 2] = P.getZ(i);
      nor[(o + i) * 3] = N ? N.getX(i) : 0;
      nor[(o + i) * 3 + 1] = N ? N.getY(i) : 1;
      nor[(o + i) * 3 + 2] = N ? N.getZ(i) : 0;
      col[(o + i) * 3] = C ? C.getX(i) : part.color.r;
      col[(o + i) * 3 + 1] = C ? C.getY(i) : part.color.g;
      col[(o + i) * 3 + 2] = C ? C.getZ(i) : part.color.b;
    }
    o += P.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/**
 * A flat blade from a 2D outline, fanned from the first point and given a
 * little thickness. Every fin in the game is one of these.
 */
function blade(pts, thickness, color, matrix) {
  const v = [];
  const half = thickness / 2;
  const push = (x, y, z) => v.push(x, y, z);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[0], b = pts[i], c = pts[i + 1];
    push(a[0], a[1], half); push(b[0], b[1], half); push(c[0], c[1], half);
    push(a[0], a[1], -half); push(c[0], c[1], -half); push(b[0], b[1], -half);
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    push(a[0], a[1], half); push(a[0], a[1], -half); push(b[0], b[1], half);
    push(b[0], b[1], half); push(a[0], a[1], -half); push(b[0], b[1], -half);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  if (matrix) g.applyMatrix4(matrix);
  g.computeVertexNormals();
  const n = v.length / 3;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = color.r;
    c[i * 3 + 1] = color.g;
    c[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

const M = (x, y, z, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4()
    .makeRotationZ(rz)
    .premultiply(new THREE.Matrix4().makeTranslation(x, y, z))
    .multiply(new THREE.Matrix4().makeScale(sx, sy, sz));

/**
 * Build a body section between two points of the spine profile.
 * `paint(u, y, r, x)` returns the vertex colour, which is where the
 * countershading and the species markings come from.
 */
function bodySection(profile, uA, uB, rings, radial, paint) {
  const pos = [];
  const col = [];
  const at = (u) => {
    const r = profile.radius(u);
    return { x: profile.x(u), ry: r * profile.height, rz: r * profile.width };
  };
  const ringPt = (u, k) => {
    const a = (k / radial) * Math.PI * 2;
    const s = at(u);
    return [s.x, Math.cos(a) * s.ry, Math.sin(a) * s.rz];
  };
  const put = (u, p) => {
    pos.push(p[0], p[1], p[2]);
    const c = paint(u, p[1], at(u).ry, p[0]);
    col.push(c.r, c.g, c.b);
  };

  for (let i = 0; i < rings; i++) {
    const u0 = uA + ((uB - uA) * i) / rings;
    const u1 = uA + ((uB - uA) * (i + 1)) / rings;
    for (let k = 0; k < radial; k++) {
      const a0 = ringPt(u0, k), a1 = ringPt(u0, k + 1);
      const b0 = ringPt(u1, k), b1 = ringPt(u1, k + 1);
      put(u0, a0); put(u1, b0); put(u0, a1);
      put(u0, a1); put(u1, b0); put(u1, b1);
    }
  }
  // Caps so the nose and the peduncle are closed solids
  [[uA, true], [uB, false]].forEach(([u, front]) => {
    const s = at(u);
    if (s.ry < 0.012) return;
    for (let k = 0; k < radial; k++) {
      const a = ringPt(u, k), b = ringPt(u, k + 1);
      const c = [s.x, 0, 0];
      if (front) {
        put(u, c); put(u, a); put(u, b);
      } else {
        put(u, c); put(u, b); put(u, a);
      }
    }
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ species */

const C = (h) => new THREE.Color(h);

/** Smooth spine profile from control points, plus body proportions. */
function makeProfile(points, opts) {
  const radius = (u) => {
    const t = Math.min(1, Math.max(0, u));
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      if (t >= a[0] && t <= b[0]) {
        const k = (t - a[0]) / (b[0] - a[0] || 1);
        const s = k * k * (3 - 2 * k); // smoothstep keeps the body organic
        return a[1] + (b[1] - a[1]) * s;
      }
    }
    return points[points.length - 1][1];
  };
  return {
    radius,
    height: opts.height,
    width: opts.width,
    x: (u) => opts.nose - u * (opts.nose - opts.tail)
  };
}

/** Countershading: dark back, pale belly, with an optional marking hook. */
function shader(back, belly, mark) {
  return (u, y, ry, x) => {
    const k = Math.min(1, Math.max(0, y / (ry || 1) * 0.5 + 0.5));
    const s = k * k * (3 - 2 * k);
    const c = belly.clone().lerp(back, s);
    return mark ? mark(c, u, y, ry, x) : c;
  };
}

const bars = (dark) => (c, u, y, ry, x) => {
  const phase = Math.sin(x * 7.5 + 0.6);
  if (phase > 0.55 && y > -ry * 0.15) c.lerp(dark, 0.62 * (phase - 0.55) / 0.45);
  return c;
};

const beans = (pale) => (c, u, y, ry, x) => {
  const h = Math.sin(x * 11.3) * Math.cos(y * 9.1 + x * 3.7);
  if (h > 0.62) c.lerp(pale, 0.7);
  return c;
};

const specks = (dark) => (c, u, y, ry, x) => {
  const h = Math.sin(x * 17.7 + 1.3) * Math.sin(y * 21.3);
  if (h > 0.72 && y > 0) c.lerp(dark, 0.75);
  return c;
};

const flank = (stripe) => (c, u, y, ry) => {
  if (Math.abs(y) < ry * 0.28) c.lerp(stripe, 0.45);
  return c;
};

/**
 * The catalogue. `min`/`max` are the depths in metres where each species
 * lives, which is what turns "go deeper" into "go for the good stuff".
 */
export const SPECIES = [
  {
    id: 'mort',
    name: 'Mört',
    pts: 100,
    min: 1,
    max: 15,
    size: 0.42,
    speed: 2.6,
    profile: makeProfile([[0, 0.05], [0.18, 0.34], [0.42, 0.4], [0.75, 0.16], [1, 0.05]],
      { height: 1.35, width: 0.62, nose: 1, tail: -0.72 }),
    paint: shader(C(0x4d6f96), C(0xeef4fb)),
    fin: C(0xd2452f),
    tail: 'fork',
    dorsal: { at: -0.02, h: 0.4, w: 0.34, back: 0.16 },
    eye: 0.16
  },
  {
    id: 'abborre',
    name: 'Abborre',
    pts: 250,
    min: 4,
    max: 28,
    size: 0.54,
    speed: 3.0,
    profile: makeProfile([[0, 0.06], [0.16, 0.36], [0.38, 0.46], [0.72, 0.15], [1, 0.05]],
      { height: 1.5, width: 0.58, nose: 1, tail: -0.74 }),
    paint: shader(C(0x33591f), C(0xf0e6bd), bars(C(0x14290c))),
    fin: C(0xe06010),
    tail: 'fan',
    dorsal: { at: 0.1, h: 0.46, w: 0.5, back: 0.1, spiny: true },
    dorsal2: { at: -0.28, h: 0.26, w: 0.24, back: 0.12 },
    eye: 0.17
  },
  {
    id: 'sik',
    name: 'Sik',
    pts: 400,
    min: 12,
    max: 40,
    size: 0.62,
    speed: 3.4,
    profile: makeProfile([[0, 0.04], [0.2, 0.28], [0.45, 0.32], [0.78, 0.12], [1, 0.04]],
      { height: 1.25, width: 0.66, nose: 1.05, tail: -0.78 }),
    paint: shader(C(0x5d7f96), C(0xf6fafd), flank(C(0xc9dced))),
    fin: C(0x9fb6c6),
    tail: 'fork',
    dorsal: { at: 0.02, h: 0.32, w: 0.28, back: 0.14 },
    adipose: -0.42,
    eye: 0.15
  },
  {
    id: 'gadda',
    name: 'Gädda',
    pts: 800,
    min: 18,
    max: 52,
    size: 0.95,
    speed: 3.9,
    profile: makeProfile([[0, 0.05], [0.12, 0.2], [0.3, 0.29], [0.62, 0.26], [0.86, 0.1], [1, 0.05]],
      { height: 1.1, width: 0.78, nose: 1.35, tail: -0.85 }),
    paint: shader(C(0x2c4a22), C(0xdfd79a), beans(C(0xbcd07a))),
    fin: C(0x6b7f3c),
    tail: 'fork',
    dorsal: { at: -0.52, h: 0.42, w: 0.34, back: 0.1 },
    snout: true,
    eye: 0.14
  },
  {
    id: 'lax',
    name: 'Lax',
    pts: 1500,
    min: 30,
    max: 57,
    size: 0.85,
    speed: 4.6,
    profile: makeProfile([[0, 0.05], [0.16, 0.3], [0.4, 0.38], [0.76, 0.13], [1, 0.045]],
      { height: 1.3, width: 0.68, nose: 1.15, tail: -0.82 }),
    paint: shader(C(0x3f5f8c), C(0xf7d8cb), specks(C(0x1a2436))),
    fin: C(0x6f7f9c),
    tail: 'fork',
    dorsal: { at: 0.0, h: 0.36, w: 0.3, back: 0.13 },
    adipose: -0.44,
    eye: 0.16
  },
  {
    id: 'pekka',
    name: 'PEKKAGÄDDAN',
    pts: 5000,
    min: 48,
    max: 59,
    size: 1.6,
    speed: 5.0,
    rare: true,
    profile: makeProfile([[0, 0.05], [0.12, 0.22], [0.3, 0.31], [0.62, 0.28], [0.86, 0.11], [1, 0.05]],
      { height: 1.12, width: 0.8, nose: 1.35, tail: -0.85 }),
    paint: shader(C(0xd39a1c), C(0xfff0bd), beans(C(0xfff6d8))),
    fin: C(0xf2c14e),
    tail: 'fork',
    dorsal: { at: -0.52, h: 0.44, w: 0.36, back: 0.1 },
    snout: true,
    crown: true,
    eye: 0.15
  }
];

/** Snags: no points, but they end the drop. Risk on the way down. */
export const JUNK = [
  { id: 'stovel', name: 'Gammal stövel', size: 0.62, min: 4, max: 46 },
  { id: 'burk', name: 'Rostig burk', size: 0.42, min: 6, max: 50 },
  { id: 'dack', name: 'Cykeldäck', size: 0.85, min: 12, max: 55 }
];

/* ---------------------------------------------------------------- assembly */

const EYE_DARK = C(0x0a0f1c);
const EYE_WHITE = C(0xf2f6ff);

function tailBlade(kind, fin) {
  const parts = [];
  if (kind === 'fork') {
    parts.push(blade([[0, 0], [-0.5, 0.52], [-0.62, 0.3], [-0.16, 0.02]], 0.05, fin));
    parts.push(blade([[0, 0], [-0.16, -0.02], [-0.62, -0.3], [-0.5, -0.52]], 0.05, fin));
  } else {
    parts.push(blade([[0, 0.04], [-0.34, 0.42], [-0.5, 0], [-0.34, -0.42], [0, -0.04]], 0.05, fin));
  }
  return parts;
}

function dorsalBlade(d, fin) {
  if (!d) return [];
  if (d.spiny) {
    const out = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = d.at - (i / n) * d.w;
      const h = d.h * (1 - Math.abs(i - 1.2) / (n * 1.6));
      out.push(blade([[x, 0], [x - 0.09, h], [x - 0.15, 0]], 0.04, fin));
    }
    return out;
  }
  return [blade([[d.at, 0], [d.at - d.w * 0.35, d.h], [d.at - d.w, d.h * 0.25], [d.at - d.w, 0]], 0.045, fin)];
}

function buildSpecies(sp) {
  const rad = 7;
  const { paint } = sp;
  const finC = sp.fin;

  /* --- Segment A: nose to the first joint, plus head detail and fins --- */
  const headParts = [{ geometry: bodySection(sp.profile, 0, 0.52, 6, rad, paint), color: finC }];

  if (sp.snout) {
    // A pike's duck-bill: a flattened wedge grafted onto the nose
    const nx = sp.profile.x(0);
    headParts.push({
      geometry: blade([[nx + 0.3, 0.04], [nx + 0.3, -0.05], [nx - 0.18, -0.14], [nx - 0.18, 0.13]],
        0.2, paint(0.05, 0, 0.2, nx)),
      color: finC
    });
  }

  dorsalBlade(sp.dorsal, finC).forEach((g) => {
    if (sp.dorsal.at > -0.3) headParts.push({ geometry: g, color: finC });
  });
  dorsalBlade(sp.dorsal2, finC).forEach((g) => headParts.push({ geometry: g, color: finC }));

  // Pectorals, one each side, swept back
  [1, -1].forEach((s) => {
    headParts.push({
      geometry: blade([[0.25, 0], [0.02, -0.16], [0.06, -0.3], [0.3, -0.1]], 0.035, finC,
        M(0, -0.06, s * sp.profile.radius(0.35) * sp.profile.width * 0.85, 0, 1, 1, 1)),
      color: finC
    });
  });

  // Eyes: dark pupil on a pale ring so they read at any depth
  const ex = sp.profile.x(sp.snout ? 0.2 : 0.13);
  const ez = sp.profile.radius(sp.snout ? 0.2 : 0.13) * sp.profile.width;
  [1, -1].forEach((s) => {
    const white = new THREE.SphereGeometry(sp.eye, 6, 4);
    white.applyMatrix4(M(ex, sp.profile.radius(0.15) * sp.profile.height * 0.32, s * ez * 0.85));
    headParts.push({ geometry: white.toNonIndexed(), color: EYE_WHITE });
    const pupil = new THREE.SphereGeometry(sp.eye * 0.55, 6, 4);
    pupil.applyMatrix4(M(ex + 0.02, sp.profile.radius(0.15) * sp.profile.height * 0.32, s * ez * 0.97));
    headParts.push({ geometry: pupil.toNonIndexed(), color: EYE_DARK });
  });

  if (sp.crown) {
    const crown = new THREE.CylinderGeometry(0.19, 0.15, 0.2, 5, 1, true);
    crown.applyMatrix4(M(0.32, sp.profile.radius(0.32) * sp.profile.height + 0.08, 0));
    headParts.push({ geometry: crown.toNonIndexed(), color: C(0xffe9a8) });
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.ConeGeometry(0.055, 0.16, 4);
      const a = (i / 5) * Math.PI * 2;
      spike.applyMatrix4(M(0.32 + Math.cos(a) * 0.16,
        sp.profile.radius(0.32) * sp.profile.height + 0.24, Math.sin(a) * 0.16));
      headParts.push({ geometry: spike.toNonIndexed(), color: C(0xfff3cf) });
    }
  }

  /* --- Segment B: the mid body, hinged at the end of A --- */
  const jointA = sp.profile.x(0.52);
  const midGeo = bodySection(sp.profile, 0.52, 0.78, 4, rad, paint);
  midGeo.translate(-jointA, 0, 0);
  const midParts = [{ geometry: midGeo, color: finC }];
  dorsalBlade(sp.dorsal, finC).forEach((g) => {
    if (sp.dorsal.at <= -0.3) {
      g.translate(-jointA, 0, 0);
      midParts.push({ geometry: g, color: finC });
    }
  });
  // Anal fin under the belly
  midParts.push({
    geometry: blade([[sp.profile.x(0.66) - jointA, 0], [sp.profile.x(0.72) - jointA, -0.26],
      [sp.profile.x(0.78) - jointA, -0.05]], 0.04, finC),
    color: finC
  });
  if (sp.adipose) {
    midParts.push({
      geometry: blade([[sp.adipose - jointA, 0], [sp.adipose - 0.05 - jointA, 0.13],
        [sp.adipose - 0.12 - jointA, 0]], 0.035, finC),
      color: finC
    });
  }

  /* --- Segment C: peduncle plus the caudal fin --- */
  const jointB = sp.profile.x(0.78);
  const tailGeo = bodySection(sp.profile, 0.78, 1, 3, rad, paint);
  tailGeo.translate(-jointB, 0, 0);
  const tailParts = [{ geometry: tailGeo, color: finC }];
  tailBlade(sp.tail, finC).forEach((g) => {
    g.translate(sp.profile.x(1) - jointB, 0, 0);
    tailParts.push({ geometry: g, color: finC });
  });

  return {
    sp,
    joints: [jointA, jointB],
    geos: [mergeParts(headParts), mergeParts(midParts), mergeParts(tailParts)],
    material: new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      emissive: sp.rare ? 0x7a5300 : 0x000000,
      emissiveIntensity: sp.rare ? 0.85 : 0
    })
  };
}

function buildJunk(j) {
  const parts = [];
  const dark = C(0x2f3542);
  if (j.id === 'stovel') {
    const shaft = new THREE.CylinderGeometry(0.2, 0.24, 0.8, 6);
    shaft.applyMatrix4(M(0, 0.1, 0));
    parts.push({ geometry: shaft.toNonIndexed(), color: C(0x24303a) });
    const foot = new THREE.BoxGeometry(0.62, 0.24, 0.34);
    foot.applyMatrix4(M(0.2, -0.4, 0));
    parts.push({ geometry: foot.toNonIndexed(), color: C(0x1b242c) });
  } else if (j.id === 'burk') {
    const can = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8);
    can.applyMatrix4(M(0, 0, 0, Math.PI / 2.4));
    parts.push({ geometry: can.toNonIndexed(), color: C(0x8d7b5a) });
    const lid = new THREE.CylinderGeometry(0.21, 0.21, 0.05, 8);
    lid.applyMatrix4(M(0.2, 0.14, 0, Math.PI / 2.4));
    parts.push({ geometry: lid.toNonIndexed(), color: C(0xb0a181) });
  } else {
    const tire = new THREE.TorusGeometry(0.42, 0.13, 5, 12);
    parts.push({ geometry: tire.toNonIndexed(), color: dark });
    const hub = new THREE.TorusGeometry(0.16, 0.04, 4, 8);
    parts.push({ geometry: hub.toNonIndexed(), color: C(0x596273) });
  }
  return {
    junk: j,
    geometry: mergeParts(parts),
    material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  };
}

/* --------------------------------------------------------------- instances */

let ASSETS = null;

export function fishAssets() {
  if (!ASSETS) {
    ASSETS = {
      species: SPECIES.map(buildSpecies),
      junk: JUNK.map(buildJunk)
    };
  }
  return ASSETS;
}

/** Assemble one swimmer: a three-link chain that can undulate. */
export function spawnFish(asset) {
  const root = new THREE.Group();
  const a = new THREE.Group();
  const b = new THREE.Group();
  const c = new THREE.Group();
  a.add(new THREE.Mesh(asset.geos[0], asset.material));
  b.add(new THREE.Mesh(asset.geos[1], asset.material));
  c.add(new THREE.Mesh(asset.geos[2], asset.material));
  b.position.x = asset.joints[0];
  c.position.x = asset.joints[1] - asset.joints[0];
  b.add(c);
  a.add(b);
  root.add(a);
  root.scale.setScalar(asset.sp.size);
  root.userData.links = [a, b, c];
  return root;
}

export function spawnJunk(asset) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(asset.geometry, asset.material));
  root.scale.setScalar(asset.junk.size);
  root.userData.links = [];
  return root;
}

/** Travelling wave down the body — the reason they look alive. */
export function swim(root, t, speed, amp = 1) {
  const { links } = root.userData;
  if (!links || !links.length) return;
  const w = t * (4 + speed);
  links[0].rotation.y = Math.sin(w) * 0.06 * amp;
  links[1].rotation.y = Math.sin(w - 0.9) * 0.2 * amp;
  links[2].rotation.y = Math.sin(w - 1.8) * 0.42 * amp;
}

export function disposeAssets() {
  if (!ASSETS) return;
  ASSETS.species.forEach((a) => {
    a.geos.forEach((g) => g.dispose());
    a.material.dispose();
  });
  ASSETS.junk.forEach((a) => {
    a.geometry.dispose();
    a.material.dispose();
  });
  ASSETS = null;
}
