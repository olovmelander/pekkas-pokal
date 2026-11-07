/**
 * Pekkas Lerduvor — the Arnäsvall range.
 *
 * A Norrland field in August evening light, procedural top to bottom.
 * The look leans on three things the literature keeps repeating about
 * outdoor scenes:
 *
 *  - AERIAL PERSPECTIVE. Distance is sold by making far things paler,
 *    bluer and less detailed, not by drawing more of them. The fog is the
 *    same muted haze the sky's horizon band fades into (sky.js), the far
 *    rank of spruce is pre-tinted toward it, mist sheets glow over the
 *    forest line and two rows of hills sit almost entirely in the haze.
 *  - GROUNDED LIGHT. One shadow-casting sun with a tight orthographic
 *    frustum around the station. Contact shadows under the trap house,
 *    the boulders and the gang are what stop everything looking like
 *    stickers on a backdrop.
 *  - SCATTER. Grass (see grass.js), plus bushes, boulders, wildflowers
 *    and a fence in the middle distance, so the eye has something to
 *    travel across between the muzzle and the treeline.
 *
 * Draw calls are budgeted like a phone game: every static prop that
 * shares a material is merged into one vertex-coloured mesh, and the
 * swallows are one InstancedMesh flapping in the vertex shader. The gang on
 * the fika chairs lives in gang.js.
 */

import * as THREE from 'three';
import { HAZE } from './sky.js';
import { buildForest } from './forest.js';

export function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the fika table (and Pekkas Pokal on it) stands, at the end of the gang's row. */
export const FIKA_TABLE = [3.25, 2.62];

/* ---------------------------------------------------------------- helpers */

/**
 * Paint a geometry a flat colour, optionally darkened toward its base.
 * Primitives like Dodecahedron/Icosahedron are already non-indexed — only
 * convert the ones that aren't, or r187 warns about every rock.
 */
function paint(geo, color, baseDarken = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const P = g.attributes.position;
  const col = new Float32Array(P.count * 3);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < P.count; i++) {
    minY = Math.min(minY, P.getY(i));
    maxY = Math.max(maxY, P.getY(i));
  }
  const span = Math.max(0.001, maxY - minY);
  const c = new THREE.Color();
  const base = new THREE.Color(color);
  for (let i = 0; i < P.count; i++) {
    const k = (P.getY(i) - minY) / span;
    c.copy(base).multiplyScalar(1 - baseDarken * (1 - k));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Merge painted, non-indexed geometries into one flat-shaded buffer. */
function mergeColored(list) {
  let total = 0;
  list.forEach((g) => {
    total += g.attributes.position.count;
  });
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}

/**
 * Collects primitives (with a transform and a colour) and bakes them into
 * one mesh. `put(geo, color, { at, rot, scale, darken })`.
 */
class Batch {
  constructor() {
    this.parts = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3();
    this.p = new THREE.Vector3();
  }

  put(geo, color, { at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], darken = 0 } = {}) {
    // color === null keeps a geometry's own (non-indexed) vertex colours
    const g = color === null ? geo : paint(geo, color, darken);
    this.q.setFromEuler(this.e.set(rot[0], rot[1], rot[2]));
    this.m.compose(this.p.set(at[0], at[1], at[2]), this.q, this.s.set(scale[0], scale[1], scale[2]));
    g.applyMatrix4(this.m);
    this.parts.push(g);
    return this;
  }

  mesh(material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })) {
    return new THREE.Mesh(mergeColored(this.parts), material);
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);

/* ------------------------------------------------------------- textures */

/** Stubble and soil under the grass — it only shows between blades. */
export function fieldTexture() {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const rand = mulberry(47);
  ctx.fillStyle = '#8f9a4c';
  ctx.fillRect(0, 0, size, size);
  // Broad tonal patches so the ground is never one flat colour
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(
      rand() * size, rand() * size, 4,
      rand() * size, rand() * size, 60 + rand() * 110
    );
    g.addColorStop(0, rand() < 0.5 ? 'rgba(196,172,86,0.34)' : 'rgba(82,100,44,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  for (let i = 0; i < 3200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.strokeStyle = rand() < 0.45
      ? `rgba(${176 + rand() * 50},${148 + rand() * 40},${62 + rand() * 30},0.45)`
      : `rgba(${74 + rand() * 40},${94 + rand() * 40},${34 + rand() * 25},0.5)`;
    ctx.lineWidth = 1 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 2 - rand() * 5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  // Ground seen at a grazing angle is exactly the case mipmaps smear into
  // mush; anisotropy is the one-line fix and costs nothing noticeable.
  tex.anisotropy = 8;
  return tex;
}

export function glowTexture(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/** A four-point star: muzzle-flash petals and the golden dove's glint. */
export function starTexture(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const c = size / 2;
  const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.5);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].forEach((a, i) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const len = i < 2 ? c : c * 0.55;
    const g = ctx.createLinearGradient(-len, 0, len, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${i < 2 ? 0.95 : 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(0, -size * 0.022);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, size * 0.022);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  return new THREE.CanvasTexture(cv);
}

/** The Swedish flag on the farm's pole — blue field, yellow cross. */
function flagTexture() {
  const cv = document.createElement('canvas');
  cv.width = 160;
  cv.height = 100;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1f5fa8';
  ctx.fillRect(0, 0, 160, 100);
  ctx.fillStyle = '#f6c83c';
  ctx.fillRect(50, 0, 20, 100);
  ctx.fillRect(0, 40, 160, 20);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ trees */

/**
 * A continuous jagged skyline of spruce tips standing behind a rank, so
 * the gaps between cones read as more forest instead of as sky. Lit, but
 * only ever seen as a dark silhouette in the haze.
 */
function forestMass(rand, z, height, color, haze) {
  const pos = [];
  const width = 720;
  let x = -width / 2;
  while (x < width / 2) {
    const step = 1.2 + rand() * 2.2;
    const tip = height * (0.75 + rand() * 0.5);
    pos.push(x, -2, 0, x + step, -2, 0, x + step * 0.5, tip, 0);
    x += step * 0.7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const c = new THREE.Color(color).lerp(new THREE.Color(HAZE), haze);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
  mesh.position.z = z;
  mesh.renderOrder = -7;
  return mesh;
}

/* ---------------------------------------------------------------- flowers */

/**
 * A flower head as a little star of petals around a raised eye, coloured
 * per vertex (eye → petal tips), facing up. Low-poly spheres read as
 * pebbles or sugar cubes from standing height; petals read as flowers.
 */
function flowerHead(r, petals, eye, tip) {
  const pos = [];
  const col = [];
  const n = petals * 2;
  const rim = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = i % 2 ? r * 0.42 : r;
    rim.push([Math.cos(a) * rr, i % 2 ? 0.004 : -0.006, Math.sin(a) * rr]);
  }
  const e = new THREE.Color(eye);
  const t = new THREE.Color(tip);
  for (let i = 0; i < n; i++) {
    const p0 = rim[i];
    const p1 = rim[(i + 1) % n];
    // Counter-clockwise seen from above, so the face points up
    pos.push(0, r * 0.22, 0, ...p1, ...p0);
    col.push(e.r, e.g, e.b, t.r, t.g, t.b, t.r, t.g, t.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/* ---------------------------------------------------------------- swallows */

/**
 * Ladusvalor — barn swallows, inseparable from a red barn in August. One
 * InstancedMesh; each wingbeat lives in the vertex shader (wing vertices
 * carry their span in `aWing`), and only the flight paths run in JS.
 */
function buildSwallows(rand, count) {
  const pos = [];
  const wing = [];
  const tri = (a, b, c, wa, wb, wc) => {
    pos.push(...a, ...b, ...c);
    wing.push(wa, wb, wc);
  };
  // Body along -z (nose), swept wings, forked tail. Wings flap about x=0.
  tri([0, 0, -0.16], [-0.035, 0, 0.02], [0.035, 0, 0.02], 0, 0, 0);
  tri([-0.035, 0, 0.02], [0, 0, 0.14], [0.035, 0, 0.02], 0, 0, 0);
  [-1, 1].forEach((s) => {
    tri([s * 0.03, 0, -0.05], [s * 0.42, 0, 0.12], [s * 0.03, 0, 0.05], 0, 1, 0);
    tri([s * 0.02, 0, 0.12], [s * 0.1, 0, 0.32], [0, 0, 0.14], 0, 0, 0);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  geo.computeVertexNormals();
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) phase[i] = rand() * 6.28;
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));

  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.MeshBasicMaterial({ color: 0x1d2128, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        attribute float aWing;
        attribute float aPhase;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        // Flap: fast beats, then a glide — swallows flicker, they don't row
        float beat = sin(uTime * 15.0 + aPhase);
        float glide = smoothstep(-0.2, 0.6, sin(uTime * 0.9 + aPhase * 3.0));
        transformed.y += beat * aWing * 0.22 * glide;
      `);
  };
  mat.customProgramCacheKey = () => 'pp-swallow';
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;

  const birds = [];
  for (let i = 0; i < count; i++) {
    const far = i >= count - 3;
    birds.push({
      cx: (rand() - 0.5) * (far ? 140 : 60),
      cy: far ? 26 + rand() * 14 : 2.5 + rand() * 7,
      cz: far ? -90 - rand() * 40 : -14 - rand() * 46,
      rx: far ? 40 + rand() * 30 : 8 + rand() * 18,
      rz: far ? 12 + rand() * 10 : 5 + rand() * 12,
      w: (far ? 0.08 : 0.32 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1),
      a: rand() * 6.28,
      scale: far ? 2.2 : 0.7 + rand() * 0.25
    });
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  function update(dt, t) {
    uniforms.uTime.value = t;
    birds.forEach((b, i) => {
      b.a += b.w * dt;
      const sx = Math.cos(b.a);
      const sz = Math.sin(b.a);
      p.set(b.cx + sx * b.rx, b.cy + Math.sin(b.a * 2.3) * 1.2, b.cz + sz * b.rz);
      // Nose (local -z) along the loop's tangent; bank into the turn
      const vx = -sz * b.rx * b.w;
      const vz = sx * b.rz * b.w;
      e.set(Math.cos(b.a * 2.3) * 0.25, Math.atan2(-vx, -vz), -Math.sign(b.w) * 0.55);
      q.setFromEuler(e);
      s.setScalar(b.scale);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { mesh, update };
}

/* ----------------------------------------------------------------- range */

export function buildRange(rand, { envMap, lite = false } = {}) {
  const g = new THREE.Group();

  /* ---- Ground ---- */
  const ground = new THREE.Mesh(
    // 40 segments over 300 m means 7.5 m triangles. Seen at the grazing
    // angle you get standing on them, depth interpolation across a
    // triangle that large is so coarse the plane wins the depth test
    // against 30 cm grass blades and swallows the whole near field.
    new THREE.PlaneGeometry(300, 300, 150, 150),
    new THREE.MeshLambertMaterial({ map: fieldTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const gp = ground.geometry.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const y = gp.getY(i);
    const d = Math.hypot(x, y);
    if (d > 26) {
      const roll = Math.sin(x * 0.045) * 1.5 + Math.cos(y * 0.038) * 1.3;
      gp.setZ(i, roll * Math.min(1, (d - 26) / 30));
    }
  }
  ground.geometry.computeVertexNormals();
  g.add(ground);

  /* ---- Props: one merged, shadow-casting mesh ---- */
  const props = new Batch();
  // Worn dirt apron and the shooting mat — where boots killed the grass
  // (1.5 cm up: far enough above the ground plane to never z-fight, even on
  // a 16-bit depth buffer at vista distance)
  props.put(new THREE.CircleGeometry(1.7, 20), 0x9c8757, { at: [0, 0.015, 0], rot: [-Math.PI / 2, 0, 0] });
  // The station's platform: weathered decking, plank by plank
  const plankRand = mulberry(31);
  for (let i = 0; i < 7; i++) {
    const tone = new THREE.Color(0x8a7a5e).offsetHSL(0, (plankRand() - 0.5) * 0.06, (plankRand() - 0.5) * 0.08);
    props.put(box(0.235, 0.06, 1.7), tone, { at: [-0.75 + i * 0.25, 0.03, 0], darken: 0.5 });
  }
  // The gun rest rail in front of the station
  props.put(box(2.5, 0.09, 0.09), 0x6b5136, { at: [0, 0.88, -1.15] });
  [-1.15, 1.15].forEach((x) => props.put(cyl(0.05, 0.06, 0.88, 5), 0x5a422c, { at: [x, 0.44, -1.15] }));
  // Shell crate
  props.put(box(0.42, 0.3, 0.3), 0x7a5a34, { at: [-1.25, 0.15, 0.5], rot: [0, 0.3, 0] });
  props.put(box(0.36, 0.02, 0.24), 0xc23a2a, { at: [-1.25, 0.31, 0.5], rot: [0, 0.3, 0] });
  // A station number post at the front corner of the deck: white plate, black "1"
  props.put(box(0.07, 1.15, 0.07), 0x6b5136, { at: [1.02, 0.575, -0.9] });
  props.put(box(0.26, 0.26, 0.03), 0xf2efe6, { at: [1.02, 1.0, -0.86] });
  props.put(box(0.045, 0.17, 0.012), 0x1c1c1c, { at: [1.02, 1.0, -0.84] });
  props.put(box(0.035, 0.02, 0.012), 0x1c1c1c, { at: [1.0, 1.07, -0.84], rot: [0, 0, 0.7] });
  // Empties on the boards and in the grass — red plastic, brass heads
  const shellRand = mulberry(53);
  for (let i = 0; i < 9; i++) {
    const sx = (shellRand() - 0.5) * 2.2;
    const sz = (shellRand() - 0.3) * 1.6;
    const ry = shellRand() * Math.PI;
    const y = Math.abs(sx) < 0.86 && Math.abs(sz) < 0.85 ? 0.072 : 0.03;
    props.put(cyl(0.0105, 0.0105, 0.065, 6), 0xb8231c, { at: [sx, y, sz], rot: [Math.PI / 2, ry, 0] });
  }
  // A bucket for the empties, by the crate
  props.put(cyl(0.13, 0.1, 0.28, 10), 0x3d6a3a, { at: [-1.25, 0.14, 0.95], darken: 0.3 });
  // The gun rack at the end of the row: two posts, a padded rail, a notched foot
  [-0.5, 0.5].forEach((dx) => props.put(box(0.06, 1.05, 0.06), 0x6b5136, { at: [-2.75 + dx, 0.525, 2.25] }));
  props.put(box(1.12, 0.07, 0.08), 0x4e3a26, { at: [-2.75, 1.02, 2.25] });
  props.put(box(1.12, 0.06, 0.18), 0x5a432c, { at: [-2.75, 0.06, 2.42] });
  // …with two over-unders leaning in it, stocks on the foot, barrels on the rail
  [-0.22, 0.18].forEach((dx, i) => {
    const lean = -0.17 - i * 0.03;
    props.put(box(0.045, 0.36, 0.09), 0x6e3f22, { at: [-2.75 + dx, 0.24, 2.4], rot: [lean, 0, 0] });
    props.put(box(0.03, 0.78, 0.035), 0x1c2026, { at: [-2.75 + dx, 0.77, 2.31], rot: [lean, 0, 0] });
    props.put(box(0.04, 0.16, 0.05), 0xb9bec4, { at: [-2.75 + dx, 0.44, 2.37], rot: [lean, 0, 0] });
  });
  // The trap house: a concrete bunker dug into a grass berm (only its roof
  // lip and the dark launch slot show from the station), a side door, and
  // red-and-white marker poles so the shooter can find it at a glance
  props.put(box(3.6, 1.05, 2.6), 0x9b998f, { at: [0, 0.5, -17.2], darken: 0.35 });
  props.put(box(3.9, 0.13, 2.9), 0xa8a69c, { at: [0, 1.08, -17.2] });
  props.put(box(2.5, 0.24, 0.06), 0x0b0e0b, { at: [0, 0.9, -15.88] });
  props.put(box(2.7, 0.04, 0.12), 0x8a8a82, { at: [0, 1.02, -15.86] });
  const berm = new THREE.Shape();
  berm.moveTo(0, 0);
  berm.lineTo(2.6, 0);
  berm.quadraticCurveTo(1.0, 0.25, 0, 0.78);
  berm.closePath();
  const bermGeo = new THREE.ExtrudeGeometry(berm, { depth: 4.4, bevelEnabled: false, curveSegments: 6 });
  bermGeo.translate(0, 0, -2.2);
  props.put(bermGeo, 0xa9ae5e, { at: [0, -0.02, -15.92], rot: [0, -Math.PI / 2, 0], darken: 0.15 });
  props.put(box(0.04, 0.9, 0.7), 0x6a4a2c, { at: [1.83, 0.45, -17.6] });
  props.put(box(0.03, 0.06, 0.06), 0xb9bec4, { at: [1.86, 0.48, -17.35] });
  [-2.05, 2.05].forEach((x) => {
    for (let k = 0; k < 4; k++) {
      props.put(cyl(0.028, 0.028, 0.4, 6), k % 2 ? 0xf2efe6 : 0xc8312c, { at: [x, 0.2 + k * 0.4, -15.9] });
    }
  });
  // The high tower the incomers are thrown from (index.js TOWER_TOP): four
  // splayed legs with X-braces, a platform with a rail, and the trapper's
  // hut with its open front
  {
    const TX = 9;
    const TZ = -60;
    const WOOD = 0x7d6c58;
    const legH = 8.1;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      props.put(box(0.18, legH + 0.1, 0.18), WOOD, {
        at: [TX + sx * 1.25, legH / 2, TZ + sz * 1.25], rot: [-sz * 0.05, 0, sx * 0.05], darken: 0.25
      });
    });
    for (let k = 0; k < 3; k++) {
      const y = 1.5 + k * 2.3;
      const w = 2.7 - k * 0.2;
      [-1, 1].forEach((d) => {
        props.put(box(0.07, 3.2, 0.07), WOOD, { at: [TX, y + 1, TZ + 1.3 - k * 0.07], rot: [0, 0, d * 0.72] });
        props.put(box(0.07, 3.2, 0.07), WOOD, { at: [TX + 1.3 - k * 0.07, y + 1, TZ], rot: [d * 0.72, 0, 0] });
      });
      props.put(box(w, 0.08, 0.08), WOOD, { at: [TX, y, TZ + 1.3 - k * 0.07] });
    }
    props.put(box(3.0, 0.14, 3.0), 0x6a5a48, { at: [TX, legH, TZ] });
    props.put(box(2.2, 1.7, 1.8), 0x5d6b52, { at: [TX, legH + 0.92, TZ - 0.4], darken: 0.2 });
    props.put(box(2.5, 0.1, 2.3), 0x3a3d40, { at: [TX, legH + 1.84, TZ - 0.4], rot: [0.08, 0, 0] });
    props.put(box(1.5, 0.5, 0.06), 0x111411, { at: [TX, legH + 0.95, TZ + 0.53] });
    props.put(box(3.0, 0.06, 0.06), WOOD, { at: [TX, legH + 0.9, TZ + 1.47] });
    [-1.47, 1.47].forEach((x) => props.put(box(0.06, 0.06, 3.0), WOOD, { at: [TX + x, legH + 0.9, TZ] }));
  }
  // Fika table at the end of the gang's row: thermos, cups and a plate of bullar
  const [tx, tz] = FIKA_TABLE;
  props.put(box(0.9, 0.04, 0.6), 0xd8d2c2, { at: [tx, 0.72, tz] });
  [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]].forEach(([x, z]) => {
    props.put(cyl(0.015, 0.015, 0.72, 4), 0x9aa0a6, { at: [tx + x, 0.36, tz + z] });
  });
  props.put(cyl(0.065, 0.07, 0.32, 10), 0xc8312c, { at: [tx + 0.2, 0.9, tz - 0.1] });
  props.put(cyl(0.05, 0.05, 0.05, 10), 0x2a2a2a, { at: [tx + 0.2, 1.08, tz - 0.1] });
  props.put(cyl(0.11, 0.11, 0.015, 12), 0xf0ede4, { at: [tx - 0.15, 0.75, tz + 0.1] });
  [[-0.2, 0.06], [-0.12, 0.14], [-0.09, 0.04]].forEach(([x, z]) => {
    props.put(new THREE.SphereGeometry(0.04, 6, 4), 0xc08440, { at: [tx + x, 0.78, tz + z], scale: [1, 0.6, 1] });
  });
  // Flagpole by the barn, white with a gilded knob
  props.put(cyl(0.05, 0.085, 10, 8), 0xf2efe6, { at: [-20, 5, -41] });
  props.put(new THREE.SphereGeometry(0.15, 10, 8), 0xe0b040, { at: [-20, 10.12, -41] });
  props.put(cyl(0.3, 0.36, 0.25, 8), 0x8a8780, { at: [-20, 0.1, -41] });
  const propMesh = props.mesh();
  propMesh.castShadow = true;
  propMesh.receiveShadow = true;
  g.add(propMesh);

  /* ---- Scatter: wildflowers (the bushes and boulders grow in forest.js) ---- */
  // Wildflowers of a Norrland August verge, merged flat, near-free:
  // prästkrage and smörblomma as petal stars, rödklöver as a soft ball,
  // blåklocka as a nodding bell.
  const flowers = new Batch();
  const STARS = [[0xf2c230, 0xf7f3e6], [0xf2c230, 0xf7f3e6], [0xe8a820, 0xf0d43a], [0xf7e9a0, 0xe9eef2]];
  // In drifts, the way a verge flowers: a patch of daisies here, clover there
  const flowerAt = (fx, fz, kind) => {
    const h = 0.26 + rand() * 0.22;
    const lean = [(rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5];
    flowers.put(cyl(0.006, 0.01, h, 3), 0x7c9a48, { at: [fx, h / 2, fz] });
    if (kind < 0.6) {
      const [eye, tip] = STARS[Math.floor(rand() * STARS.length)];
      const head = flowerHead(0.06 + rand() * 0.03, kind < 0.4 ? 8 : 5, eye, tip);
      flowers.put(head, null, { at: [fx, h, fz], rot: lean });
    } else if (kind < 0.8) {
      flowers.put(new THREE.IcosahedronGeometry(0.036 + rand() * 0.014, 1), 0xd0588a,
        { at: [fx, h, fz], scale: [1, 1.15, 1], darken: 0.25 });
    } else {
      flowers.put(new THREE.ConeGeometry(0.032, 0.06, 6, 1, true), 0x7a6ad8,
        { at: [fx, h - 0.02, fz], rot: [Math.PI + lean[0], 0, lean[2]], darken: 0.25 });
    }
  };
  for (let i = 0; i < 64; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2.6 + rand() * 22;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const kind = rand();
    const n = 3 + Math.floor(rand() * 6);
    for (let k = 0; k < n; k++) {
      const fx = cx + (rand() - 0.5) * 1.6;
      const fz = cz + (rand() - 0.5) * 1.6;
      if (Math.abs(fx) < 1.4 && Math.abs(fz) < 1.8) continue;
      if (Math.abs(fx) < 2.6 && fz < -13.2 && fz > -19) continue;
      // Not right under the muzzle: up close a flower is a dark stick across the view
      if (fz < 0 && fz > -7 && Math.abs(fx) < 4 + -fz * 0.6) continue;
      flowerAt(fx, fz, rand() < 0.8 ? kind : rand());
    }
  }
  // …and a few more right where the vista's camera looks down past the gang
  for (let i = 0; i < 60; i++) {
    const fx = -3 + rand() * 9;
    const fz = 3.6 + rand() * 5;
    if (fx > 2.6 && fx < 3.9 && fz < 3.1) continue;
    flowerAt(fx, fz, rand());
  }
  const flowerMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  g.add(flowers.mesh(flowerMat));

  /* ---- Fence: posts and two sagging wires ---- */
  const fence = new Batch();
  const postXs = [];
  for (let i = 0; i < 30; i++) {
    const x = -58 + i * 4;
    const z = -30 - Math.sin(i * 0.35) * 3.5;
    postXs.push([x, z]);
    fence.put(cyl(0.07, 0.09, 1.2, 5), 0x6b5136, { at: [x, 0.6, z], rot: [0, 0, (rand() - 0.5) * 0.08], darken: 0.35 });
  }
  const fenceMesh = fence.mesh();
  fenceMesh.castShadow = true;
  g.add(fenceMesh);
  const wirePts = [];
  [0.55, 0.95].forEach((wy) => {
    for (let i = 0; i < postXs.length - 1; i++) {
      const [x0, z0] = postXs[i];
      const [x1, z1] = postXs[i + 1];
      wirePts.push(new THREE.Vector3(x0, wy - Math.sin(i * 1.7) * 0.04 - 0.03, z0));
      wirePts.push(new THREE.Vector3(x1, wy - Math.sin((i + 1) * 1.7) * 0.04 - 0.03, z1));
    }
  });
  g.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(wirePts),
    new THREE.LineBasicMaterial({ color: 0x6a6f6a, transparent: true, opacity: 0.7 })
  ));

  /* ---- The red barn with vita knutar ---- */
  // Falu red board-and-batten on a grey stone plinth, a black roof with an
  // overhang and white fascia, white corner boards, a double loge door with
  // white X-braces, and windows with crossbars. Every layer stands at least
  // 4 cm proud of the one behind it (no coplanar faces for a 16-bit depth
  // buffer to fight over at 60 m).
  const barn = new Batch();
  const FALU = 0x8f2d26;
  const WHITE = 0xf0ede4;
  const barnRand = mulberry(77);
  barn.put(box(9.3, 0.55, 6.3), 0x8a8780, { at: [0, 0.27, 0], darken: 0.35 });
  barn.put(box(9, 4.5, 6), FALU, { at: [0, 2.8, 0], darken: 0.18 });
  // Battens on the long front, a shade apart so the wall has a rhythm
  for (let i = 0; i < 20; i++) {
    const x = -4.28 + i * 0.45;
    if (Math.abs(x) < 1.55) continue; // the door
    const tone = new THREE.Color(FALU).offsetHSL(0, 0, (barnRand() - 0.5) * 0.05);
    barn.put(box(0.07, 4.4, 0.05), tone, { at: [x, 2.8, 3.04], darken: 0.2 });
  }
  // Gable roof: extruded triangle with overhang on every side
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-3.55, 0);
  roofShape.lineTo(3.55, 0);
  roofShape.lineTo(0, 2.75);
  roofShape.closePath();
  const roofGable = new THREE.ExtrudeGeometry(roofShape, { depth: 9.0, bevelEnabled: false });
  roofGable.translate(0, 0, -4.5);
  barn.put(roofGable, FALU, { at: [0, 5.05, 0], rot: [0, Math.PI / 2, 0], darken: 0.1 });
  // The roof planes: two slabs along the slopes, over the gable
  const slope = Math.atan2(2.75, 3.55);
  const slab = Math.hypot(3.55, 2.75) + 0.5;
  [-1, 1].forEach((sd) => {
    barn.put(box(10.0, 0.14, slab), 0x2c2e33, {
      at: [0, 5.05 + 2.75 / 2 + 0.1, sd * (3.55 / 2 + 0.05)], rot: [sd * slope, 0, 0]
    });
    // White fascia along the eave
    barn.put(box(10.0, 0.22, 0.06), WHITE, { at: [0, 4.98, sd * 3.84] });
  });
  barn.put(box(10.1, 0.16, 0.24), 0x24262a, { at: [0, 7.92, 0] });
  // White rake boards along the gable ends
  [-1, 1].forEach((ex) => {
    [-1, 1].forEach((sd) => {
      barn.put(box(0.06, 0.2, slab - 0.2), WHITE, {
        at: [ex * 5.02, 5.05 + 2.75 / 2, sd * (3.55 / 2 - 0.05)], rot: [sd * slope, 0, 0]
      });
    });
  });
  // Corner boards (knutar)
  [-4.55, 4.55].forEach((x) => {
    [3.05, -3.05].forEach((z) => barn.put(box(0.32, 4.5, 0.32), WHITE, { at: [x, 2.8, z] }));
  });
  // The loge door: white frame, red leaves, white X on each leaf
  barn.put(box(3.0, 3.7, 0.1), WHITE, { at: [0, 2.4, 3.06] });
  [-0.68, 0.68].forEach((x) => {
    barn.put(box(1.25, 3.35, 0.1), 0x7a241e, { at: [x, 2.28, 3.12] });
    barn.put(box(0.13, 3.5, 0.04), WHITE, { at: [x, 2.28, 3.2], rot: [0, 0, 0.36] });
    barn.put(box(0.13, 3.5, 0.04), WHITE, { at: [x, 2.28, 3.2], rot: [0, 0, -0.36] });
  });
  // Windows with white frames and crossbars
  [-3.05, 3.05].forEach((x) => {
    barn.put(box(1.1, 0.95, 0.1), WHITE, { at: [x, 3.6, 3.07] });
    barn.put(box(0.86, 0.71, 0.1), 0x1f252c, { at: [x, 3.6, 3.12] });
    barn.put(box(0.06, 0.71, 0.04), WHITE, { at: [x, 3.6, 3.19] });
    barn.put(box(0.86, 0.06, 0.04), WHITE, { at: [x, 3.6, 3.19] });
  });
  // A gable window high on the end wall the vista sees
  barn.put(box(0.1, 0.8, 0.7), WHITE, { at: [4.56, 6.0, 0] });
  barn.put(box(0.1, 0.6, 0.5), 0x1f252c, { at: [4.61, 6.0, 0] });
  const barnMesh = barn.mesh();
  barnMesh.position.set(-31, 0, -49);
  barnMesh.rotation.y = 0.45;
  barnMesh.castShadow = false;
  g.add(barnMesh);

  /* ---- Silage bales, the white "dinosaur eggs" of every Swedish field ---- */
  const bales = new Batch();
  [[-22, -46, 0.2], [-20.6, -46.6, 0.5], [-21.4, -44.9, 1.4], [-24.5, -52, 0.1], [14, -55, 1.1], [15.5, -54.2, 0.3]].forEach(([x, z, r]) => {
    const tone = new THREE.Color(0xe8e6de).offsetHSL(0, 0, (barnRand() - 0.5) * 0.06);
    bales.put(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 14), tone, { at: [x, 0.6, z], rot: [Math.PI / 2, 0, r], darken: 0.3 });
  });
  const baleMesh = bales.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(baleMesh);

  /* ---- Swedish flag, waving in the vertex shader ---- */
  const flagUniforms = { uTime: { value: 0 } };
  const flagMat = new THREE.MeshLambertMaterial({ map: flagTexture(), side: THREE.DoubleSide });
  flagMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = flagUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        // Travelling wave, pinned at the hoist (x = 0) and growing to the fly
        float fly = position.x / 2.2;
        transformed.z += sin(position.x * 2.6 - uTime * 6.0) * 0.22 * fly
                       + sin(position.x * 4.1 - uTime * 9.0 + position.y * 2.0) * 0.06 * fly;
        transformed.y -= fly * fly * 0.12;
      `);
  };
  flagMat.customProgramCacheKey = () => 'pp-flag';
  const flagGeo = new THREE.PlaneGeometry(2.2, 1.4, 14, 4);
  flagGeo.translate(1.1, 0, 0);
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(-19.94, 9.2, -41);
  flag.rotation.y = -0.15;
  g.add(flag);

  /* ---- Forest: the far silhouettes here, every tree in forest.js ---- */
  g.add(forestMass(rand, -170, 15, 0x2c4a3a, 0.66));
  g.add(forestMass(rand, -121, 9, 0x1f3a26, 0.3));
  const forest = buildForest(mulberry(4711), { lite });
  g.add(forest.group);
  // Behind the station: only the reaction shot after a series turns round
  // far enough to see it, but then it needs to be a forest edge, not a void
  g.add(forestMass(rand, 108, 10, 0x22402a, 0.42));

  /* ---- Pekkas Pokal itself, waiting on the fika table ---- */
  const trophyMat = new THREE.MeshStandardMaterial({
    color: 0xf2c14e, metalness: 1, roughness: 0.22, envMap, envMapIntensity: 1.3
  });
  const cupProfile = [
    [0, 0], [0.09, 0], [0.09, 0.03], [0.04, 0.05], [0.025, 0.12], [0.03, 0.16],
    [0.09, 0.2], [0.12, 0.3], [0.125, 0.36], [0.115, 0.37]
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const trophy = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.LatheGeometry(cupProfile, 20), trophyMat);
  cup.castShadow = true;
  trophy.add(cup);
  [-1, 1].forEach((s) => {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI * 1.2), trophyMat);
    handle.position.set(s * 0.12, 0.28, 0);
    handle.rotation.z = s > 0 ? -Math.PI * 0.6 : Math.PI * 0.4;
    trophy.add(handle);
  });
  const plinth = new THREE.Mesh(box(0.2, 0.08, 0.2), new THREE.MeshLambertMaterial({ color: 0x2a1c14 }));
  plinth.position.y = -0.04;
  trophy.add(plinth);
  trophy.position.set(FIKA_TABLE[0] - 0.3, 0.82, FIKA_TABLE[1] - 0.1);
  g.add(trophy);

  /* ---- Swallows over the field ---- */
  const swallows = buildSwallows(rand, 11);
  g.add(swallows.mesh);

  return { group: g, swallows, flagUniforms, forest };
}

/* ----------------------------------------------------------------- clays */

/**
 * A clay: shallow dome on a rim, merged into one mesh. Concentric ribs on
 * the dome are baked into the vertex colours; the material carries the
 * hue (orange or gold) and an emissive floor that keeps it readable when
 * it crosses the dark treeline.
 */
export function buildClay() {
  const dome = new THREE.SphereGeometry(0.36, 20, 7, 0, Math.PI * 2, 0, Math.PI / 2.6);
  dome.scale(1, 0.5, 1);
  const rim = cyl(0.37, 0.33, 0.1, 20);
  rim.translate(0, -0.02, 0);
  const parts = [dome, rim].map((geo, k) => {
    const g = geo.toNonIndexed();
    geo.dispose();
    const P = g.attributes.position;
    const col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const r = Math.hypot(P.getX(i), P.getZ(i));
      let v = k === 1 ? 0.62 : 1;
      if (k === 0 && Math.floor(r * 22) % 2 === 1) v = 0.86;
      col.fill(v, i * 3, i * 3 + 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const geo = mergeColored(parts);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    vertexColors: true, color: 0xff6a1c, emissive: 0x6b2400, flatShading: true
  }));
  mesh.visible = false;
  return mesh;
}
