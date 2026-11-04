/**
 * Pekkas Fiske — procedural fish.
 *
 * Every species is generated from a spine profile plus a handful of fin
 * blades. Markings — countershading, the perch's bars, the pike's pale
 * beans, the salmon's spots, a gill arc and a lateral line — are painted
 * into the vertex colours while the body is generated, so there is not a
 * single texture in the water.
 *
 * The body is one smooth, indexed surface with analytic normals (the old
 * three rigid links creased at every joint), and it swims in the vertex
 * shader: a travelling wave whose amplitude grows towards the tail — the
 * carangiform stroke real roach, perch and pike use. Each species is ONE
 * InstancedMesh, so the whole lake — the shoal you dodge, the decorative
 * fish around it, the far silhouettes and the schools — costs one draw call
 * per species instead of three per fish.
 */

import * as THREE from 'three';
import { patchWaterFog, fogWithReach } from './world.js';

/* ------------------------------------------------------------- geometry kit */

/** Merge indexed or non-indexed parts into one indexed geometry. */
function mergeParts(parts) {
  let vCount = 0;
  let iCount = 0;
  parts.forEach(({ geometry: g }) => {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  });
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint16Array(iCount);
  let vo = 0;
  let io = 0;
  parts.forEach(({ geometry: g, color }) => {
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const Cc = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      const o = (vo + i) * 3;
      pos[o] = P.getX(i); pos[o + 1] = P.getY(i); pos[o + 2] = P.getZ(i);
      nor[o] = N.getX(i); nor[o + 1] = N.getY(i); nor[o + 2] = N.getZ(i);
      col[o] = Cc ? Cc.getX(i) : color.r;
      col[o + 1] = Cc ? Cc.getY(i) : color.g;
      col[o + 2] = Cc ? Cc.getZ(i) : color.b;
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
      io += g.index.count;
    } else {
      for (let i = 0; i < P.count; i++) idx[io + i] = i + vo;
      io += P.count;
    }
    vo += P.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/**
 * A flat blade from a 2D outline, fanned from the first point and given a
 * little thickness. Every fin in the game is one of these.
 */
function blade(pts, thickness, matrix) {
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
  return g;
}

const M = (x, y, z, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4()
    .makeRotationZ(rz)
    .premultiply(new THREE.Matrix4().makeTranslation(x, y, z))
    .multiply(new THREE.Matrix4().makeScale(sx, sy, sz));

/**
 * The body: an elliptical tube swept along the spine profile, with
 * analytic normals so it shades smooth instead of faceted. For a surface
 * P(x, a) = (x, R·h·cos a, R·w·sin a) the outward normal is
 * (−R′·h·w, w·cos a, h·sin a), where R′ = dR/dx.
 * `paint(u, y, ry, x)` returns the vertex colour.
 */
function bodyGeometry(profile, rings, radial, paint) {
  const { height: h, width: w } = profile;
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const n = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    // Rings crowd towards the nose, where the profile bends hardest
    const u = (i / rings) ** 1.15;
    const x = profile.x(u);
    const R = profile.radius(u);
    const e = 0.01;
    const dR = (profile.radius(u + e) - profile.radius(u - e)) / (profile.x(u + e) - profile.x(u - e));
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const y = Math.cos(a) * R * h;
      const z = Math.sin(a) * R * w;
      pos.push(x, y, z);
      n.set(-dR * h * w, w * Math.cos(a), h * Math.sin(a)).normalize();
      nor.push(n.x, n.y, n.z);
      const c = paint(u, y, R * h, x);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      const c = (i + 1) * radial + k;
      const d = (i + 1) * radial + ((k + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  // Nose and peduncle caps
  const cap = (ring, tipX, nx, flip) => {
    const center = pos.length / 3;
    const c = paint(ring === 0 ? 0 : 1, 0, 1, tipX);
    pos.push(tipX, 0, 0);
    nor.push(nx, 0, 0);
    col.push(c.r, c.g, c.b);
    for (let k = 0; k < radial; k++) {
      const a = ring * radial + k;
      const b = ring * radial + ((k + 1) % radial);
      if (flip) idx.push(center, b, a); else idx.push(center, a, b);
    }
  };
  cap(0, profile.x(0) + 0.04, 1, false);
  cap(rings, profile.x(1) - 0.01, -1, true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
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

/**
 * Countershading — dark back, pale belly — plus a gill arc, a pale
 * lateral line and an optional species marking.
 */
function painter(sp) {
  const back = C(sp.back);
  const belly = C(sp.belly);
  const gill = C(sp.back).multiplyScalar(0.55);
  const gillX = sp.profile.x(sp.snout ? 0.26 : 0.2);
  return (u, y, ry, x) => {
    const k = Math.min(1, Math.max(0, (y / (ry || 1)) * 0.5 + 0.5));
    const s = k * k * (3 - 2 * k);
    const c = belly.clone().lerp(back, s);
    // A bright sheen band just above the midline — where the light catches
    if (k > 0.5 && k < 0.68) c.lerp(C(0xffffff), 0.12);
    if (sp.mark) sp.mark(c, u, y, ry, x);
    if (Math.abs(x - gillX) < 0.025 && k < 0.9) c.lerp(gill, 0.6);
    return c;
  };
}

const bars = (dark) => (c, u, y, ry, x) => {
  const phase = Math.sin(x * 7.5 + 0.6);
  if (phase > 0.45 && y > -ry * 0.25) c.lerp(dark, 0.7 * Math.min(1, (phase - 0.45) / 0.35));
  return c;
};

const beans = (pale) => (c, u, y, ry, x) => {
  const h = Math.sin(x * 11.3) * Math.cos(y * 9.1 + x * 3.7);
  if (h > 0.55) c.lerp(pale, 0.7);
  return c;
};

const specks = (dark) => (c, u, y, ry, x) => {
  const h = Math.sin(x * 17.7 + 1.3) * Math.sin(y * 21.3);
  if (h > 0.62 && y > -ry * 0.1) c.lerp(dark, 0.75);
  return c;
};

const flank = (stripe) => (c, u, y, ry) => {
  if (Math.abs(y) < ry * 0.18) c.lerp(stripe, 0.5);
  return c;
};

/**
 * The catalogue. `min`/`max` are the depths in metres where each species
 * lives, which is what turns "go deeper" into "go for the good stuff".
 * `kg` is the weight range the fångstdagbok reports.
 */
export const SPECIES = [
  {
    id: 'mort',
    name: 'Mört',
    def: 'mörten', // bestämd form, för "största mörten hittills"
    pts: 100,
    min: 1,
    max: 15,
    size: 0.42,
    speed: 2.6,
    kg: [0.12, 0.55],
    blurb: 'Stimfisken i ytvattnet. Röda fenor, silversida — och alltid i sällskap.',
    profile: makeProfile([[0, 0.05], [0.18, 0.34], [0.42, 0.4], [0.75, 0.16], [1, 0.05]],
      { height: 1.35, width: 0.62, nose: 1, tail: -0.72 }),
    back: 0x4d6f96,
    belly: 0xeef4fb,
    fin: 0xd2452f,
    tail: 'fork',
    dorsal: { at: -0.02, h: 0.4, w: 0.34 },
    eye: 0.16,
    iris: 0xd2452f
  },
  {
    id: 'abborre',
    name: 'Abborre',
    def: 'abborren',
    pts: 250,
    min: 4,
    max: 28,
    size: 0.54,
    speed: 3.0,
    kg: [0.2, 1.3],
    blurb: 'Randig rovfisk med taggig ryggfena. Sjöns mest pålitliga napp.',
    profile: makeProfile([[0, 0.06], [0.16, 0.36], [0.38, 0.46], [0.72, 0.15], [1, 0.05]],
      { height: 1.5, width: 0.58, nose: 1, tail: -0.74 }),
    back: 0x33591f,
    belly: 0xf0e6bd,
    mark: bars(C(0x14290c)),
    fin: 0xe06010,
    tail: 'fan',
    dorsal: { at: 0.1, h: 0.46, w: 0.5, spiny: true },
    dorsal2: { at: -0.28, h: 0.26, w: 0.24 },
    eye: 0.17,
    iris: 0xe0a020
  },
  {
    id: 'sik',
    name: 'Sik',
    def: 'siken',
    pts: 400,
    min: 12,
    max: 40,
    size: 0.62,
    speed: 3.4,
    kg: [0.4, 1.9],
    blurb: 'Silverblank och skygg — simmar djupare än man tror. Röks vid bryggan.',
    profile: makeProfile([[0, 0.04], [0.2, 0.28], [0.45, 0.32], [0.78, 0.12], [1, 0.04]],
      { height: 1.25, width: 0.66, nose: 1.05, tail: -0.78 }),
    back: 0x5d7f96,
    belly: 0xf6fafd,
    mark: flank(C(0xc9dced)),
    fin: 0x9fb6c6,
    tail: 'fork',
    dorsal: { at: 0.02, h: 0.32, w: 0.28 },
    adipose: -0.42,
    eye: 0.15,
    iris: 0xc8d4e0
  },
  {
    id: 'gadda',
    name: 'Gädda',
    def: 'gäddan',
    pts: 800,
    min: 18,
    max: 52,
    size: 0.95,
    speed: 3.9,
    kg: [1.5, 9],
    blurb: 'Står blick stilla i gropen och väntar. Bönfläckar och andnäbb.',
    profile: makeProfile([[0, 0.05], [0.12, 0.2], [0.3, 0.29], [0.62, 0.26], [0.86, 0.1], [1, 0.05]],
      { height: 1.1, width: 0.78, nose: 1.35, tail: -0.85 }),
    back: 0x2c4a22,
    belly: 0xdfd79a,
    mark: beans(C(0xbcd07a)),
    fin: 0x6b7f3c,
    tail: 'fork',
    dorsal: { at: -0.52, h: 0.42, w: 0.34 },
    snout: true,
    eye: 0.14,
    iris: 0xd8c040
  },
  {
    id: 'lax',
    name: 'Lax',
    def: 'laxen',
    pts: 1500,
    min: 30,
    max: 57,
    size: 0.85,
    speed: 4.6,
    kg: [2, 11],
    blurb: 'Insjölaxen i det kalla djupvattnet. Snabbast av dem alla.',
    profile: makeProfile([[0, 0.05], [0.16, 0.3], [0.4, 0.38], [0.76, 0.13], [1, 0.045]],
      { height: 1.3, width: 0.68, nose: 1.15, tail: -0.82 }),
    back: 0x3f5f8c,
    belly: 0xf7d8cb,
    mark: specks(C(0x1a2436)),
    fin: 0x6f7f9c,
    tail: 'fork',
    dorsal: { at: 0.0, h: 0.36, w: 0.3 },
    adipose: -0.44,
    eye: 0.16,
    iris: 0xb8c0d0
  },
  {
    id: 'pekka',
    name: 'PEKKAGÄDDAN',
    def: 'Pekkagäddan',
    pts: 5000,
    min: 48,
    max: 59,
    size: 1.6,
    speed: 5.0,
    rare: true,
    kg: [14, 21],
    blurb: 'Guldfärgad, krönt och inte alltid hemma. Ingen har sett henne två gånger samma kväll.',
    profile: makeProfile([[0, 0.05], [0.12, 0.22], [0.3, 0.31], [0.62, 0.28], [0.86, 0.11], [1, 0.05]],
      { height: 1.12, width: 0.8, nose: 1.35, tail: -0.85 }),
    back: 0xd39a1c,
    belly: 0xfff0bd,
    mark: beans(C(0xfff6d8)),
    fin: 0xf2c14e,
    tail: 'fork',
    dorsal: { at: -0.52, h: 0.44, w: 0.36 },
    snout: true,
    crown: true,
    eye: 0.15,
    iris: 0xff6a3d
  }
];

/** Snags: no points, but they end the drop. Risk on the way down. */
export const JUNK = [
  { id: 'stovel', name: 'Gammal stövel', size: 0.62, min: 4, max: 46 },
  { id: 'burk', name: 'Rostig burk', size: 0.42, min: 6, max: 50 },
  { id: 'dack', name: 'Cykeldäck', size: 0.85, min: 12, max: 55 }
];

/* ---------------------------------------------------------------- assembly */

const EYE_DARK = C(0x05080f);

/** Tail tip in the fish's own frame — where the bend wave peaks. */
function tailTip(sp) {
  return sp.profile.x(1) - (sp.tail === 'fork' ? 0.62 : 0.5);
}

function tailBlade(kind) {
  if (kind === 'fork') {
    return [
      blade([[0, 0], [-0.5, 0.52], [-0.62, 0.3], [-0.2, 0.02]], 0.05),
      blade([[0, 0], [-0.2, -0.02], [-0.62, -0.3], [-0.5, -0.52]], 0.05)
    ];
  }
  return [blade([[0, 0.04], [-0.34, 0.42], [-0.5, 0], [-0.34, -0.42], [0, -0.04]], 0.05)];
}

function dorsalBlades(d, baseY) {
  if (!d) return [];
  if (d.spiny) {
    const out = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = d.at - (i / n) * d.w;
      const h = d.h * (1 - Math.abs(i - 1.2) / (n * 1.6));
      out.push(blade([[x, baseY(x) - 0.04], [x - 0.09, baseY(x) + h], [x - 0.15, baseY(x) - 0.04]], 0.04));
    }
    return out;
  }
  const y0 = baseY(d.at) - 0.04;
  return [blade([[d.at, y0], [d.at - d.w * 0.35, y0 + d.h], [d.at - d.w, y0 + d.h * 0.25], [d.at - d.w, y0]], 0.045)];
}

function buildSpecies(sp) {
  const { profile } = sp;
  const paint = painter(sp);
  sp.paint = paint;
  const finC = C(sp.fin);
  // Where the back is, in x — so fins sit on the body instead of floating
  const uOf = (x) => (profile.x(0) - x) / (profile.x(0) - profile.x(1));
  const backY = (x) => profile.radius(uOf(x)) * profile.height;
  const sideZ = (u) => profile.radius(u) * profile.width;

  const parts = [{ geometry: bodyGeometry(profile, 18, 10, paint) }];

  if (sp.snout) {
    // A pike's duck-bill: a flattened wedge grafted onto the nose
    const nx = profile.x(0);
    parts.push({
      geometry: blade([[nx + 0.3, 0.03], [nx + 0.3, -0.05], [nx - 0.18, -0.14], [nx - 0.18, 0.12]], 0.2),
      color: paint(0.05, 0, 0.2, nx)
    });
  }

  dorsalBlades(sp.dorsal, backY).forEach((g) => parts.push({ geometry: g, color: finC }));
  dorsalBlades(sp.dorsal2, backY).forEach((g) => parts.push({ geometry: g, color: finC }));

  // Pectorals and pelvics, one each side, swept back
  [1, -1].forEach((s) => {
    parts.push({
      geometry: blade([[0.25, 0], [0.02, -0.16], [0.06, -0.3], [0.3, -0.1]], 0.035,
        M(0, -0.06, s * sideZ(0.35) * 0.85)),
      color: finC
    });
    const px = profile.x(0.55);
    parts.push({
      geometry: blade([[px, 0], [px - 0.2, -0.16], [px - 0.1, -0.02]], 0.03,
        M(0, -backY(px) * 0.75, s * sideZ(0.55) * 0.5)),
      color: finC
    });
  });

  // Anal fin under the belly
  const ax = profile.x(0.66);
  parts.push({
    geometry: blade([[ax, -backY(ax) + 0.04], [profile.x(0.72), -backY(ax) - 0.24],
      [profile.x(0.8), -backY(profile.x(0.8)) + 0.02]], 0.04),
    color: finC
  });
  if (sp.adipose) {
    const y = backY(sp.adipose) - 0.03;
    parts.push({
      geometry: blade([[sp.adipose, y], [sp.adipose - 0.05, y + 0.13], [sp.adipose - 0.12, y]], 0.035),
      color: finC
    });
  }

  tailBlade(sp.tail).forEach((g) => {
    g.translate(profile.x(1) + 0.02, 0, 0);
    parts.push({ geometry: g, color: finC });
  });

  // Eyes: dark pupil on a coloured iris so they read at any depth
  const eu = sp.snout ? 0.2 : 0.13;
  const ex = profile.x(eu);
  const ey = profile.radius(0.15) * profile.height * 0.32;
  const ez = sideZ(eu);
  [1, -1].forEach((s) => {
    const iris = new THREE.SphereGeometry(sp.eye, 7, 5);
    iris.applyMatrix4(M(ex, ey, s * ez * 0.82));
    parts.push({ geometry: iris, color: C(sp.iris) });
    const pupil = new THREE.SphereGeometry(sp.eye * 0.6, 5, 3);
    pupil.applyMatrix4(M(ex + 0.02, ey, s * ez * 0.96));
    parts.push({ geometry: pupil, color: EYE_DARK });
  });

  if (sp.crown) {
    const top = profile.radius(0.32) * profile.height;
    const crown = new THREE.CylinderGeometry(0.19, 0.15, 0.2, 7, 1, true);
    crown.applyMatrix4(M(0.32, top + 0.08, 0));
    parts.push({ geometry: crown, color: C(0xffe08a) });
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.ConeGeometry(0.055, 0.18, 5);
      const a = (i / 5) * Math.PI * 2;
      spike.applyMatrix4(M(0.32 + Math.cos(a) * 0.16, top + 0.26, Math.sin(a) * 0.16));
      parts.push({ geometry: spike, color: C(0xfff3cf) });
    }
  }

  const geometry = mergeParts(parts);
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.36,
    metalness: 0.18,
    emissive: sp.rare ? 0x8a5c00 : 0x000000,
    emissiveIntensity: sp.rare ? 0.7 : 0
  });
  const nose = profile.x(0) + (sp.snout ? 0.3 : 0.04);
  swimShader(material, nose, nose - tailTip(sp));

  return { sp, geometry, material, nose };
}

/**
 * The swim stroke, in the vertex shader. Per instance, aSwim carries
 * (phase, amplitude, flash, unused). s runs 0 at the nose to 1 at the tail
 * tip; lateral displacement is a wave travelling tailwards whose envelope
 * grows with s², and the normal is bent by the same derivative so the
 * flank highlights slide along the body as it flexes.
 */
function swimShader(material, nose, len) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNose = { value: nose };
    shader.uniforms.uLen = { value: len };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aSwim;
        uniform float uNose, uLen;
        varying float vFlash;`)
      .replace('#include <beginnormal_vertex>', `
        float swS = clamp((uNose - position.x) / uLen, 0.0, 1.15);
        float swEnv = 0.035 + 0.3 * swS * swS;
        float swArg = aSwim.x - swS * 5.2;
        float swOff = aSwim.y * swEnv * sin(swArg) * uLen;
        // d(off)/dx = d(off)/ds · ds/dx, with ds/dx = -1/uLen
        float swDer = -aSwim.y * (0.6 * swS * sin(swArg) - swEnv * 5.2 * cos(swArg));
        vec3 objectNormal = vec3(normal);
        objectNormal.x -= swDer * objectNormal.z;
        objectNormal = normalize(objectNormal);
        vFlash = aSwim.z;`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        transformed.z += swOff;
        transformed.x -= abs(swOff) * 0.12; // keep the length as the tail sweeps`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vFlash;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.93, 0.78) * vFlash;`);
    patchWaterFog(shader);
  };
  material.customProgramCacheKey = () => 'fiske-fish-v2';
}

function buildJunk(j) {
  const parts = [];
  if (j.id === 'stovel') {
    const shaft = new THREE.CylinderGeometry(0.2, 0.24, 0.8, 8);
    shaft.applyMatrix4(M(0, 0.1, 0));
    parts.push({ geometry: shaft, color: C(0x24303a) });
    const foot = new THREE.BoxGeometry(0.62, 0.24, 0.34);
    foot.applyMatrix4(M(0.2, -0.4, 0));
    parts.push({ geometry: foot, color: C(0x1b242c) });
    const sole = new THREE.BoxGeometry(0.66, 0.06, 0.36);
    sole.applyMatrix4(M(0.21, -0.54, 0));
    parts.push({ geometry: sole, color: C(0x8a3b22) });
  } else if (j.id === 'burk') {
    const can = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 10);
    can.applyMatrix4(M(0, 0, 0, Math.PI / 2.4));
    parts.push({ geometry: can, color: C(0x8d7b5a) });
    const label = new THREE.CylinderGeometry(0.205, 0.205, 0.22, 10);
    label.applyMatrix4(M(0, 0, 0, Math.PI / 2.4));
    parts.push({ geometry: label, color: C(0x9b3a2c) });
    const lid = new THREE.CylinderGeometry(0.21, 0.21, 0.05, 10);
    lid.applyMatrix4(M(0.2, 0.14, 0, Math.PI / 2.4));
    parts.push({ geometry: lid, color: C(0xb0a181) });
  } else {
    const tire = new THREE.TorusGeometry(0.42, 0.13, 6, 16);
    parts.push({ geometry: tire, color: C(0x2f3542) });
    const hub = new THREE.TorusGeometry(0.16, 0.04, 4, 10);
    parts.push({ geometry: hub, color: C(0x596273) });
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.CylinderGeometry(0.012, 0.012, 0.26, 3);
      spoke.applyMatrix4(M(Math.cos(i) * 0.29, Math.sin(i) * 0.29, 0, i - Math.PI / 2));
      parts.push({ geometry: spoke, color: C(0x8892a3) });
    }
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.2 });
  material.onBeforeCompile = fogWithReach(1);
  material.customProgramCacheKey = () => 'fiske-junk';
  return { junk: j, geometry: mergeParts(parts), material };
}

/* ------------------------------------------------------------------- shoal */

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

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Every swimmer in the lake, one InstancedMesh per species. A fish is a
 * plain record with a `mesh` proxy (an Object3D that is never added to
 * the scene) — game code moves the proxy exactly as it used to move a
 * real mesh, and sync() copies the proxies into the instance buffers.
 */
export class Shoal {
  constructor(assets, capacity) {
    this.lists = assets.species.map(() => []);
    this.meshes = assets.species.map((asset, i) => {
      const cap = capacity[i];
      const mesh = new THREE.InstancedMesh(asset.geometry, asset.material, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const swimAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      swimAttr.setUsage(THREE.DynamicDrawUsage);
      // The attribute lives on a per-mesh geometry clone that shares the
      // big buffers — each species mesh needs its own aSwim stream.
      mesh.geometry = asset.geometry.clone();
      mesh.geometry.setAttribute('aSwim', swimAttr);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.userData.cap = cap;
      return mesh;
    });
    this.assets = assets;
  }

  /** A new swimmer of species index i, or null when the pool is full. */
  add(i) {
    const list = this.lists[i];
    if (list.length >= this.meshes[i].userData.cap) return null;
    const asset = this.assets.species[i];
    const mesh = new THREE.Object3D();
    mesh.scale.setScalar(asset.sp.size);
    const f = { asset, sp: asset.sp, mesh, visible: true, phase: Math.random() * 6.28, amp: 0.6, flash: 0 };
    list.push(f);
    return f;
  }

  clear() {
    this.lists.forEach((l) => {
      l.length = 0;
    });
  }

  sync() {
    this.meshes.forEach((mesh, i) => {
      const list = this.lists[i];
      const swim = mesh.geometry.attributes.aSwim;
      const arr = swim.array;
      for (let k = 0; k < list.length; k++) {
        const f = list[k];
        if (f.visible) {
          f.mesh.updateMatrix();
          mesh.setMatrixAt(k, f.mesh.matrix);
        } else {
          mesh.setMatrixAt(k, HIDDEN);
        }
        arr[k * 4] = f.phase;
        arr[k * 4 + 1] = f.amp;
        arr[k * 4 + 2] = f.flash;
      }
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      swim.needsUpdate = true;
    });
  }

  dispose() {
    this.meshes.forEach((m) => {
      m.geometry.dispose();
      m.dispose();
    });
  }
}

export function spawnJunk(asset) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(asset.geometry, asset.material));
  root.scale.setScalar(asset.junk.size);
  return root;
}

export function disposeAssets() {
  if (!ASSETS) return;
  ASSETS.species.forEach((a) => {
    a.geometry.dispose();
    a.material.dispose();
  });
  ASSETS.junk.forEach((a) => {
    a.geometry.dispose();
    a.material.dispose();
  });
  ASSETS = null;
}

/* ---------------------------------------------------------- dagbok figures */

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
let svgSeq = 0;

/**
 * The same profile, drawn as a little SVG for the fångstdagbok — side view,
 * countershaded with a gradient, fins in the fin colour. `known` false gives
 * the dark silhouette of a species you have not caught yet.
 */
export function speciesSvg(sp, known = true) {
  const p = sp.profile;
  const top = [];
  const bot = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const x = p.x(u);
    const r = p.radius(u) * p.height;
    top.push(`${x.toFixed(3)},${(-r).toFixed(3)}`);
    bot.unshift(`${x.toFixed(3)},${r.toFixed(3)}`);
  }
  const nose = p.x(0) + (sp.snout ? 0.3 : 0.05);
  const tx = p.x(1);
  const tail = sp.tail === 'fork'
    ? `${tx},0 ${tx - 0.5},-0.52 ${tx - 0.62},-0.3 ${tx - 0.2},0 ${tx - 0.62},0.3 ${tx - 0.5},0.52`
    : `${tx},-0.04 ${tx - 0.34},-0.42 ${tx - 0.5},0 ${tx - 0.34},0.42 ${tx},0.04`;
  const d = sp.dorsal;
  const by = -p.radius((p.x(0) - d.at) / (p.x(0) - p.x(1))) * p.height + 0.04;
  const dorsal = `${d.at},${by} ${d.at - d.w * 0.35},${by - d.h} ${d.at - d.w},${by - d.h * 0.25} ${d.at - d.w},${by}`;
  const id = `fi-g${++svgSeq}`; // unique: the same fish is drawn in several panels
  const back = known ? hex(sp.back) : '#1a3142';
  const belly = known ? hex(sp.belly) : '#2a4a5e';
  const fin = known ? hex(sp.fin) : '#1a3142';
  const ex = p.x(sp.snout ? 0.2 : 0.13);
  const ey = -p.radius(0.15) * p.height * 0.3;
  const minX = tx - 0.7;
  const w = nose - minX + 0.1;
  return `<svg viewBox="${minX.toFixed(2)} -0.75 ${w.toFixed(2)} 1.5" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${back}"/><stop offset="0.62" stop-color="${belly}"/></linearGradient></defs>
    <polygon points="${tail}" fill="${fin}"/>
    <polygon points="${dorsal}" fill="${fin}"/>
    <polygon points="${top.join(' ')} ${bot.join(' ')} ${nose},0" fill="url(#${id})"/>
    ${known ? `<circle cx="${ex}" cy="${ey}" r="${sp.eye * 0.75}" fill="${hex(sp.iris)}"/><circle cx="${ex + 0.015}" cy="${ey}" r="${sp.eye * 0.42}" fill="#05080f"/>` : ''}
    ${sp.crown && known ? `<polygon points="0.16,${-p.radius(0.32) * p.height - 0.02} 0.2,${-p.radius(0.32) * p.height - 0.26} 0.28,${-p.radius(0.32) * p.height - 0.12} 0.34,${-p.radius(0.32) * p.height - 0.3} 0.4,${-p.radius(0.32) * p.height - 0.12} 0.48,${-p.radius(0.32) * p.height - 0.26} 0.5,${-p.radius(0.32) * p.height - 0.02}" fill="#ffd34d"/>` : ''}
  </svg>`;
}
