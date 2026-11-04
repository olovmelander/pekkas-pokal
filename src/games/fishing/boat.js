/**
 * Pekkas Fiske — the eka.
 *
 * An open clinker-built rowing boat, generated from a lines plan: half
 * breadth, sheer and keel as functions of the station along the hull, a
 * rounded-V section, and six lapped strakes a side whose lower edges stand
 * proud of the strake below — so the planking reads in the low sun without
 * a single texture. Inside: frames, floorboards, two thwarts, the stern
 * seat with the tunna on it, oars, and the termos for later.
 *
 * Everything that never moves on its own is ONE vertex-coloured mesh; the
 * tunna is a second (it squashes when a fish lands in it). A third,
 * invisible mesh — the "dry mask" — writes depth across the opening at
 * gunwale height after the boat is drawn, so the lake surface, which the
 * hull sits down in, never shows inside the boat, however the waves run.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------- lines plan */

const X0 = -2.3; // transom
const X1 = 2.75; // stem
const T = 0.03;  // plank thickness

/** Floorboards and thwarts, boat-local. The thwart is SEAT_HEIGHT above the
 *  floor for the 1.88 m angler (0.46 m × 1.88 / 1.8). */
export const FLOOR_Y = 0.16;
export const THWART_Y = FLOOR_Y + 0.48;
/** Where the angler's thwart and the tunna stand, boat-local x. */
export const SEAT_X = 0.3;
export const BARREL = { x: -1.62, y: THWART_Y + 0.34, r: 0.36, h: 0.68 };
/** The water line on the hull, boat-local y (the boat floats at -WATERLINE). */
export const WATERLINE = 0.25;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Half breadth B, sheer S and keel K at station u (0 transom … 1 stem). */
function station(u) {
  const B = u < 0.42
    ? 0.6 + 0.33 * Math.sin((u / 0.42) * Math.PI * 0.5)
    : 0.93 * Math.max(0, Math.cos(((u - 0.42) / 0.58) * Math.PI * 0.5)) ** 0.78;
  const S = u < 0.4 ? 0.8 + 0.07 * (1 - u / 0.4) ** 2 : 0.8 + 0.34 * ((u - 0.4) / 0.6) ** 2.1;
  let K = -0.36;
  if (u < 0.22) K = -0.36 + 0.32 * (1 - u / 0.22) ** 2;
  else if (u > 0.58) K = -0.36 + (1.1 + 0.36) * ((u - 0.58) / 0.42) ** 2.3;
  return { x: X0 + (X1 - X0) * u, B, S, K };
}

/**
 * A point on the outer skin. a is the girth from keel (0) to sheer (1),
 * side ±1. `off` pushes it out along the section normal (negative: in).
 */
function skin(u, a, side, off = 0, out = new THREE.Vector3()) {
  const st = station(u);
  const depth = st.S - st.K;
  const y = st.S - depth * (1 - a ** 1.7);
  const z = st.B * a;
  // Outward normal of the section curve (z(a), y(a)) in the y–z plane
  const tz = st.B;
  const ty = depth * 1.7 * Math.max(a, 1e-3) ** 0.7;
  const len = Math.hypot(tz, ty) || 1;
  const nz = ty / len;
  const ny = -tz / len;
  return out.set(st.x, y + ny * off, side * (z + nz * off));
}

/* ----------------------------------------------------------- mesh building */

/** Collects non-indexed triangles with per-vertex normals and colours. */
class Builder {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
  }

  /** Add a geometry, painted with a colour or a fn(position, normal) → Color. */
  add(geo, paint) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const col = new THREE.Color();
    const v = new THREE.Vector3();
    const nv = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      nv.fromBufferAttribute(N, i);
      this.p.push(v.x, v.y, v.z);
      this.n.push(nv.x, nv.y, nv.z);
      if (typeof paint === 'function') col.copy(paint(v, nv, i));
      else col.set(paint);
      this.c.push(col.r, col.g, col.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** A grid surface from f(i/ni, j/nj) → Vector3, smooth normals within it. */
function grid(ni, nj, f, flip = false) {
  const pos = [];
  const v = new THREE.Vector3();
  for (let j = 0; j <= nj; j++) {
    for (let i = 0; i <= ni; i++) {
      f(i / ni, j / nj, v);
      pos.push(v.x, v.y, v.z);
    }
  }
  const idx = [];
  for (let j = 0; j < nj; j++) {
    for (let i = 0; i < ni; i++) {
      const a = j * (ni + 1) + i;
      const b = a + ni + 1;
      if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b);
      else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A box from its centre, size and a yaw about y. */
function box(w, h, d, x, y, z, ry = 0, rz = 0) {
  const b = new THREE.BoxGeometry(w, h, d);
  if (rz) b.rotateZ(rz);
  if (ry) b.rotateY(ry);
  b.translate(x, y, z);
  return b;
}

const C = (hex) => new THREE.Color(hex);
const TAR = C(0x221c19);
const BOOT = C(0x7a2a24);
const WHITE_A = C(0xe7e1d2);
const WHITE_B = C(0xd8d1c0);
const GREEN = C(0x2c5a47);
const VARNISH = C(0xb57a40);
const WOOD_IN = C(0x8d6a45);
const WOOD_DARK = C(0x5b4330);
const IRON = C(0x2f3238);

/* ------------------------------------------------------------------ boat */

export function buildBoat() {
  const group = new THREE.Group();
  const hull = new Builder();
  const STRAKES = 6;
  const NU = 34;
  const tmp = new THREE.Color();

  /* Outer skin: six lapped strakes a side. Each strake's lower edge stands
     out by the lap, so its edge catches the light like real clinker. */
  for (const side of [1, -1]) {
    for (let k = 0; k < STRAKES; k++) {
      const a0 = k / STRAKES;
      const a1 = (k + 1) / STRAKES;
      const g = grid(NU, 4, (fu, fj, v) => {
        const a = a0 + (a1 - a0) * fj;
        const lap = (1 - fj) * 0.011 * (k > 0 ? 1 : 0.3);
        skin(fu, a, side, lap, v);
      }, side > 0);
      const sheer = k === STRAKES - 1;
      hull.add(g, (p) => {
        if (p.y < WATERLINE - 0.04) return TAR;
        if (p.y < WATERLINE + 0.04) return BOOT;
        if (sheer) return GREEN;
        return k % 2 ? WHITE_A : WHITE_B;
      });
    }
    /* Inner skin, a plank thickness in, with darker bilge toward the keel */
    const inner = grid(NU, 10, (fu, fj, v) => skin(fu, fj, side, -T, v), side < 0);
    hull.add(inner, (p) => tmp.copy(WOOD_DARK).lerp(WOOD_IN, smooth(-0.2, 0.55, p.y)));
    /* Gunwale cap and rubbing strake along the sheer */
    const rail = grid(NU, 3, (fu, fj, v) => {
      // 0: outside below the top, 1: outer top edge, 2: inner top edge, 3: inside
      const st = station(fu);
      const o = [0.026, 0.026, -T - 0.012, -T - 0.012][Math.round(fj * 3)];
      const dy = [-0.07, 0.022, 0.022, -0.05][Math.round(fj * 3)];
      skin(fu, 1, side, o, v);
      v.y = st.S + dy;
    }, side > 0);
    hull.add(rail, VARNISH);
  }

  /* Keel and stem: one strip along the centreline */
  const keel = grid(NU, 2, (fu, fj, v) => {
    const st = station(fu);
    const w = 0.035 * (fj * 2 - 1);
    v.set(st.x, st.K - 0.045 * (1 - Math.abs(fj * 2 - 1)) + 0.005, w);
  }, true);
  hull.add(keel, TAR);

  /* Transom: outer face, inner face, and a varnished cap on top */
  const s0 = station(0);
  const transom = (inset, faceOut) => {
    const pos = [];
    const top = new THREE.Vector3(X0 + inset, s0.S, 0);
    for (const side of [1, -1]) {
      for (let i = 0; i < 16; i++) {
        const a = skin(0, i / 16, side, -inset);
        const b = skin(0, (i + 1) / 16, side, -inset);
        a.x = b.x = X0 + inset;
        const tri = side * (faceOut ? 1 : -1) > 0 ? [top, a, b] : [top, b, a];
        tri.forEach((p) => pos.push(p.x, p.y, p.z));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  hull.add(transom(0, true), (p) => (p.y < WATERLINE - 0.04 ? TAR : p.y > s0.S - 0.12 ? GREEN : WHITE_A));
  hull.add(transom(T + 0.004, false), WOOD_IN);
  hull.add(box(0.06, 0.04, s0.B * 2 + 0.05, X0 + 0.01, s0.S + 0.01, 0), VARNISH);

  /* Frames: thin ribs following the inside of the planking */
  for (let r = 0; r < 9; r++) {
    const u = 0.09 + r * 0.095;
    for (const side of [1, -1]) {
      const rib = grid(1, 8, (fi, fj, v) => {
        const uu = u + (fi - 0.5) * 0.008;
        skin(uu, 0.08 + fj * 0.88, side, -T - 0.016, v);
      }, side < 0);
      hull.add(rib, WOOD_DARK);
    }
  }

  /* Floorboards: three planks, a little gap between them */
  [-0.24, 0, 0.24].forEach((z, i) => {
    hull.add(box(3.25 - Math.abs(z) * 1.6, 0.035, 0.2, -0.12, FLOOR_Y - 0.018, z), i === 1 ? WOOD_IN : C(0x7d5d3c));
  });

  /* Thwarts, the stern seat and its knees */
  const thwart = (x, width) => {
    const u = (x - X0) / (X1 - X0);
    const st = station(u);
    const depth = st.S - st.K;
    const a = (1 - (st.S - THWART_Y) / depth) ** (1 / 1.7);
    const half = st.B * a - T - 0.008;
    hull.add(box(width, 0.045, half * 2, x, THWART_Y - 0.023, 0), VARNISH);
    // A stringer under each end, so the seat is visibly carried
    [1, -1].forEach((s) => hull.add(box(width * 0.7, 0.05, 0.05, x, THWART_Y - 0.07, s * (half - 0.04)), WOOD_DARK));
  };
  thwart(SEAT_X, 0.24);
  thwart(-0.62, 0.22);
  thwart(BARREL.x, 0.62);

  /* Oarlocks on the gunwale, by the aft thwart */
  [1, -1].forEach((s) => {
    const st = station((-0.62 - X0) / (X1 - X0));
    hull.add(box(0.05, 0.1, 0.012, -0.62 - 0.035, st.S + 0.08, s * (st.B + 0.012)), IRON);
    hull.add(box(0.05, 0.1, 0.012, -0.62 + 0.035, st.S + 0.08, s * (st.B + 0.012)), IRON);
  });

  /* Two oars shipped along the far side, blades aft */
  [-0.5, -0.36].forEach((z, i) => {
    const shaft = new THREE.CylinderGeometry(0.024, 0.03, 2.9, 6);
    shaft.rotateZ(Math.PI / 2 + 0.035 * (i ? 1 : -1));
    shaft.translate(-0.05, THWART_Y + 0.03 + i * 0.05, z);
    hull.add(shaft, C(0xc09056));
    hull.add(box(0.62, 0.02, 0.15, -1.42, THWART_Y + 0.03 + i * 0.05, z, 0, 0.035 * (i ? 1 : -1)), C(0xb78450));
  });

  /* Termos and kopp on the aft thwart — kaffe vid bryggan sen */
  const thermos = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10);
  thermos.translate(-0.62, THWART_Y + 0.15, 0.3);
  hull.add(thermos, C(0xb23a48));
  const lid = new THREE.CylinderGeometry(0.065, 0.06, 0.07, 10);
  lid.translate(-0.62, THWART_Y + 0.335, 0.3);
  hull.add(lid, C(0xe8e2d4));
  /* A tackle box on the floor, lid ajar */
  hull.add(box(0.36, 0.14, 0.22, -1.05, FLOOR_Y + 0.07, -0.18, 0.2), C(0x3d6b4f));
  hull.add(box(0.37, 0.03, 0.23, -1.05, FLOOR_Y + 0.16, -0.17, 0.2, 0.12), C(0x4f8562));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0 });
  const boatMesh = new THREE.Mesh(hull.geometry(), material);
  group.add(boatMesh);

  /* The dry mask: depth only, across the opening just under the rail, drawn
     after the boat and everything in it (renderOrder 1 in the opaque pass)
     and before the water (renderOrder 2). The lake inside the hull fails
     the depth test; the interior was drawn first, so it stays. */
  const maskGeo = grid(NU, 1, (fu, fj, v) => {
    const u = 0.004 + fu * 0.99;
    const st = station(u);
    v.set(st.x, st.S - 0.015, (fj * 2 - 1) * Math.max(0, st.B - T - 0.012));
  });
  const mask = new THREE.Mesh(maskGeo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  mask.renderOrder = 1;
  group.add(mask);

  /* The tunna — the target every tapped fish flies into */
  const barrel = new THREE.Group();
  const bb = new Builder();
  const staves = new THREE.CylinderGeometry(BARREL.r, BARREL.r * 0.9, BARREL.h, 18, 2, true);
  // Bulge the middle a little, like a real barrel
  const sp = staves.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const k = 1 + 0.07 * (1 - (sp.getY(i) / (BARREL.h / 2)) ** 2);
    sp.setX(i, sp.getX(i) * k);
    sp.setZ(i, sp.getZ(i) * k);
  }
  staves.computeVertexNormals();
  const staveCol = [C(0x8f5d32), C(0x7f5129), C(0x9a6638)];
  // Non-indexed, the cylinder runs two triangles per stave per row: colour by stave
  bb.add(staves, (p, n, i) => staveCol[(Math.floor(i / 6) % 18) % 3]);
  const inside = new THREE.CylinderGeometry(BARREL.r - 0.02, BARREL.r * 0.9 - 0.02, BARREL.h, 18, 1, true);
  inside.scale(-1, 1, 1); // mirrored: the faces now look inward…
  inside.computeVertexNormals(); // …and so do the normals
  bb.add(inside, C(0x4a2f18));
  [-0.22, 0.22].forEach((y) => {
    const t = (y + BARREL.h / 2) / BARREL.h;
    const rAt = (BARREL.r * 0.9 + BARREL.r * 0.1 * t) * (1 + 0.07 * (1 - (y / (BARREL.h / 2)) ** 2));
    const hoop = new THREE.TorusGeometry(rAt + 0.006, 0.016, 4, 22);
    hoop.rotateX(Math.PI / 2);
    hoop.translate(0, y, 0);
    bb.add(hoop, IRON);
  });
  const water = new THREE.CircleGeometry(BARREL.r - 0.02, 18);
  water.rotateX(-Math.PI / 2);
  water.translate(0, BARREL.h / 2 - 0.1, 0);
  bb.add(water, C(0x1f4f5a));
  const barrelMesh = new THREE.Mesh(bb.geometry(), material);
  barrel.add(barrelMesh);
  barrel.position.set(BARREL.x, BARREL.y, 0);
  group.add(barrel);

  /* Foam ring where the hull meets the water */
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(2.55, 3.15, 32),
    new THREE.MeshBasicMaterial({
      color: 0xdff5f2,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.scale.z = 0.5;

  /* The float on the line while he waits (menu and end screen) */
  const fb = new Builder();
  const ball = new THREE.SphereGeometry(0.075, 12, 8);
  fb.add(ball, (p) => (p.y > 0 ? C(0xd8302a) : C(0xf4f0e6)));
  const stick = new THREE.CylinderGeometry(0.009, 0.009, 0.16, 5);
  stick.translate(0, 0.13, 0);
  fb.add(stick, (p) => (p.y > 0.18 ? C(0xffd34a) : C(0xd8302a)));
  const bobber = new THREE.Mesh(fb.geometry(), material);

  group.userData = { barrel, foam, bobber, material, mask };
  return group;
}

/* ------------------------------------------------------------------- rod */

export const ROD_LEN = 2.45;

/**
 * Spinnspö: a tapered blank with cork grips, a reel seat, a spinning reel
 * hanging under it and five guides. Its local +Z runs up the rod from the
 * fist (the people.js grip socket's thumb side), +Y is the top of the rod.
 * The bend is done in the vertex shader — offset grows with (z / L)² —
 * and mirrored on the CPU for the tip, so the line leaves the real tip.
 * The crank is its own small mesh so it can turn.
 */
export function buildRod() {
  const b = new Builder();
  const L = ROD_LEN;
  const blank = new THREE.CylinderGeometry(0.0055, 0.0145, L - 0.1, 6, 18);
  blank.rotateX(Math.PI / 2);
  blank.translate(0, 0, (L - 0.1) / 2 + 0.1);
  const guides = [0.62, 1.05, 1.45, 1.82, 2.16];
  b.add(blank, (p) => (guides.some((g) => Math.abs(p.z - g) < 0.025) ? C(0xc9982e) : C(0x1c2a24)));
  const cork = (z0, z1, r) => {
    const g = new THREE.CylinderGeometry(r, r * 1.06, z1 - z0, 10, 1);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, (z0 + z1) / 2);
    b.add(g, C(0xc19a68));
  };
  cork(-0.27, -0.01, 0.019);
  cork(0.14, 0.36, 0.017);
  const seat = new THREE.CylinderGeometry(0.016, 0.016, 0.15, 10);
  seat.rotateX(Math.PI / 2);
  seat.translate(0, 0, 0.065);
  b.add(seat, C(0x3a3e46));
  const butt = new THREE.SphereGeometry(0.021, 8, 6);
  butt.translate(0, 0, -0.275);
  b.add(butt, C(0x2a2c30));
  guides.forEach((z, i) => {
    const r = 0.017 - i * 0.0026;
    const ring = new THREE.TorusGeometry(r, 0.0025, 4, 10);
    ring.translate(0, -0.016 - r, z);
    b.add(ring, C(0xb8bec8));
    b.add(box(0.004, 0.016 + r, 0.004, 0, -0.008 - r * 0.5, z), C(0xb8bec8));
  });
  const tipTop = new THREE.TorusGeometry(0.004, 0.0018, 4, 8);
  tipTop.translate(0, 0, L);
  b.add(tipTop, C(0xb8bec8));
  /* The reel: a foot from the seat, the body, and a spool along the rod */
  b.add(box(0.012, 0.05, 0.03, 0, -0.04, 0.07), C(0x2d3138));
  const body = new THREE.SphereGeometry(0.03, 10, 8);
  body.scale(0.85, 0.95, 1.1);
  body.translate(0, -0.08, 0.07);
  b.add(body, C(0x3a4250));
  const spool = new THREE.CylinderGeometry(0.03, 0.026, 0.045, 12);
  spool.rotateX(Math.PI / 2);
  spool.translate(0, -0.08, 0.125);
  b.add(spool, (p) => (p.z > 0.13 ? C(0xd6dbe3) : C(0x9aa3b2)));
  const bail = new THREE.TorusGeometry(0.034, 0.003, 4, 12, Math.PI);
  bail.rotateY(Math.PI / 2);
  bail.translate(0, -0.08, 0.142);
  b.add(bail, C(0xd6dbe3));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25 });
  const bend = { value: new THREE.Vector2() };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBend = bend;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec2 uBend;`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float rodK = clamp(position.z / ${L.toFixed(3)}, 0.0, 1.0);
        transformed.xy += uBend * rodK * rodK;`);
  };
  material.customProgramCacheKey = () => 'fiske-rod';
  const mesh = new THREE.Mesh(b.geometry(), material);

  /* Crank: an arm and a knob, turning about the reel's side axle (+X) */
  const cb = new Builder();
  cb.add(box(0.012, 0.006, 0.058, 0.026, 0, 0.026), C(0x9aa3b2));
  const knob = new THREE.CylinderGeometry(0.008, 0.008, 0.026, 8);
  knob.rotateZ(Math.PI / 2);
  knob.translate(0.042, 0, 0.052);
  cb.add(knob, C(0x20232a));
  const crank = new THREE.Mesh(cb.geometry(), material);
  crank.position.set(0.024, -0.08, 0.07);
  mesh.add(crank);

  const tip = new THREE.Object3D();
  tip.position.set(0, 0, L);
  mesh.add(tip);
  return { mesh, crank, tip, bend, material, length: L, knobLocal: new THREE.Vector3(0.066, -0.08, 0.07), crankR: 0.052 };
}
