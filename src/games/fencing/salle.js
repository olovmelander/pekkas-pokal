/**
 * Pekkas Fäktning — the Stockholm salle at dusk.
 *
 * Interiors live or die on their lighting, and the rule is HIERARCHY: one
 * dominant source, a couple of fills, a few accents — never everything
 * lit equally. So the room is built around:
 *
 *  - DOMINANT: the low evening sun. The back wall is real geometry with
 *    real window openings and it is the sun's only shadow caster, so the
 *    light that reaches the floor is window-shaped — warm patches across
 *    the piste and long fencer shadows reaching for the camera. The shafts
 *    are fake volumetrics: each is a convex hull of the light's path from
 *    window to floor, and its shader intersects the view ray with that
 *    slab analytically, so the glow is exactly as thick as the air the ray
 *    crosses, with soft edges and dust streaks drifting through.
 *  - FILLS: a cool overhead hemisphere and a front fill from the camera
 *    side, so the fencers are rim-lit by the sun but never silhouettes.
 *  - ACCENTS: brass chandeliers with candle flames and crystal drops, the
 *    scoring apparatus lamps, the trophy.
 *
 * The reflections come from a tiny pre-filtered environment of this same
 * room (warm windows, candle glow, dark panelling), so the lamé, the
 * blades and the waxed parquet all reflect the place they are in.
 *
 * Draw calls are kept low by merging every static prop that shares a
 * material into one vertex-coloured mesh, and by instancing the crowd.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

/* ------------------------------------------------------------- layout */

const WALL_Z = -7;
// The sun comes in slightly from the left, so the windows sit slightly to
// the left too: the middle shaft then lands squarely on the centre of the
// piste, where the blades meet.
const WIN_X = [-6.2, -0.8, 4.6];
const WIN_W = 2.5;
const PILASTERS = [
  WIN_X[0] - 2.7, (WIN_X[0] + WIN_X[1]) / 2, (WIN_X[1] + WIN_X[2]) / 2, WIN_X[2] + 2.7,
  WIN_X[0] - 5.4, WIN_X[2] + 5.4
];
const WIN_Y0 = 2.5; // sill
const WIN_Y1 = 5.3; // spring of the arch
const WIN_R = WIN_W / 2;
/** Direction the sunlight travels: from behind the back wall, down into the room */
export const SUN_DIR = new THREE.Vector3(0.12, -0.5, 1).normalize();

/* ------------------------------------------------------------ textures */

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')];
}

function canvasTex(cv, srgb = true) {
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Herringbone parquet. Blocks are 4:1, and the tiling is the lattice
 * spanned by (1,1) and (4,−4) block widths with the vertical block one
 * width above the horizontal one — which repeats every 8 widths in both
 * axes, so a 32-width canvas wraps seamlessly. Tone is hashed from the
 * block's lattice position modulo the canvas, so it wraps too.
 */
export function parquetTexture() {
  const size = 1024;
  const W = 32;
  const [cv, ctx] = canvas(size, size);
  ctx.fillStyle = '#3a2412';
  ctx.fillRect(0, 0, size, size);
  const hash = (a, b) => {
    const r = mulberry(((a & 63) * 73856093) ^ ((b & 63) * 19349663));
    r();
    return r;
  };
  const block = (x, y, w, h, r) => {
    const v = 0.72 + r() * 0.5;
    const warm = r() * 0.14;
    const base = [158 * v, (100 - warm * 60) * v, (54 - warm * 40) * v].map(Math.round);
    ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // Grain runs along the block
    const along = w > h;
    for (let i = 0; i < 7; i++) {
      const o = r();
      ctx.strokeStyle = `rgba(${Math.round(70 * v)},${Math.round(42 * v)},${Math.round(20 * v)},${0.18 + r() * 0.3})`;
      ctx.lineWidth = 0.6 + r() * 0.9;
      ctx.beginPath();
      if (along) {
        const yy = y + 2 + o * (h - 4);
        ctx.moveTo(x + 2, yy);
        ctx.bezierCurveTo(x + w * 0.3, yy + (r() - 0.5) * 3, x + w * 0.7, yy + (r() - 0.5) * 3, x + w - 2, yy);
      } else {
        const xx = x + 2 + o * (w - 4);
        ctx.moveTo(xx, y + 2);
        ctx.bezierCurveTo(xx + (r() - 0.5) * 3, y + h * 0.3, xx + (r() - 0.5) * 3, y + h * 0.7, xx, y + h - 2);
      }
      ctx.stroke();
    }
    // Waxed sheen across the middle of each block
    const g = along
      ? ctx.createLinearGradient(x, y, x, y + h)
      : ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, 'rgba(255,225,170,0)');
    g.addColorStop(0.5, `rgba(255,225,170,${0.05 + r() * 0.06})`);
    g.addColorStop(1, 'rgba(255,225,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  };
  const n = size / W;
  for (let i = -n; i < 2 * n; i++) {
    for (let j = -n; j < n; j++) {
      const bx = i + 4 * j;
      const by = i - 4 * j;
      for (const [dx, dy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
        const hx = bx + dx;
        const hy = by + dy;
        if (hx < -4 || hx > n || hy < -4 || hy > n) continue;
        block(hx * W, hy * W, 4 * W, W, hash(bx, by));
        block(hx * W, (hy + 1) * W, W, 4 * W, hash(bx + 101, by + 7));
      }
    }
  }
  const tex = canvasTex(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** The metallic piste: brushed strip with the centre and en-garde lines. */
function pisteTexture() {
  const [cv, ctx] = canvas(1024, 128);
  const w = 1024;
  const h = 128;
  const rand = mulberry(17);
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#6f7886');
  base.addColorStop(0.5, '#a9b2bf');
  base.addColorStop(1, '#6c7583');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 520; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.05})`;
    ctx.fillRect(rand() * w, 0, 1 + rand() * 2, h);
    ctx.fillStyle = `rgba(30,36,48,${0.02 + rand() * 0.05})`;
    ctx.fillRect(rand() * w, 0, 1, h);
  }
  ctx.fillStyle = 'rgba(245,245,240,0.85)';
  ctx.fillRect(w / 2 - 2, 8, 4, h - 16); // centre line
  [-0.068, 0.068].forEach((f) => ctx.fillRect(w / 2 + f * w - 2, 8, 4, h - 16)); // en garde
  // Warning zones: the last two metres before the end lines
  ctx.fillStyle = 'rgba(206,64,52,0.5)';
  [[0.04, 0.14], [0.86, 0.96]].forEach(([a, b]) => ctx.fillRect(a * w, 8, (b - a) * w, h - 16));
  ctx.fillStyle = 'rgba(245,245,240,0.8)';
  [0.04, 0.96].forEach((f) => ctx.fillRect(f * w - 2, 8, 4, h - 16));
  ctx.fillStyle = 'rgba(24,28,38,0.9)';
  ctx.fillRect(0, 0, w, 5);
  ctx.fillRect(0, h - 5, w, 5);
  const tex = canvasTex(cv);
  tex.anisotropy = 8;
  return tex;
}

/**
 * Dusk over Stockholm, one wide panorama that the three windows each see a
 * slice of: the low sun in the left window, Stadshuset's tower and its
 * three crowns in the middle, Riddarholmskyrkan's iron spire to the right,
 * and Riddarfjärden holding the sky's colour below.
 */
function skylineTexture() {
  const w = 1024;
  const h = 560;
  const [cv, ctx] = canvas(w, h);
  const rand = mulberry(5);
  const horizon = h * 0.7;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#1b2a5c');
  sky.addColorStop(0.42, '#4f4a86');
  sky.addColorStop(0.72, '#c4705a');
  sky.addColorStop(0.9, '#f2a15a');
  sky.addColorStop(1, '#ffd08a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  // The sun, low over the water, with a wide glare
  const sx = w * 0.17;
  const sy = horizon - 34;
  const glare = ctx.createRadialGradient(sx, sy, 4, sx, sy, 240);
  glare.addColorStop(0, 'rgba(255,240,200,0.95)');
  glare.addColorStop(0.12, 'rgba(255,190,110,0.55)');
  glare.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = '#fff6dc';
  ctx.beginPath();
  ctx.arc(sx, sy, 15, 0, Math.PI * 2);
  ctx.fill();

  // Thin clouds lit pink from below
  for (let i = 0; i < 9; i++) {
    const cy = 60 + rand() * 220;
    const cx = rand() * w;
    const cw = 120 + rand() * 240;
    const g = ctx.createLinearGradient(0, cy - 6, 0, cy + 6);
    g.addColorStop(0, 'rgba(120,90,140,0)');
    g.addColorStop(0.6, `rgba(255,${150 + Math.round(rand() * 50)},150,${0.18 + rand() * 0.2})`);
    g.addColorStop(1, 'rgba(255,170,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw / 2, 5 + rand() * 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Far shore: Södermalm's ridge with lit windows
  const shore = (y0, amp, col, lit) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    let x = 0;
    while (x <= w) {
      const bh = y0 + rand() * amp;
      ctx.lineTo(x, horizon - bh);
      x += 10 + rand() * 26;
      ctx.lineTo(x, horizon - bh);
    }
    ctx.lineTo(w, horizon);
    ctx.fill();
    for (let i = 0; i < lit; i++) {
      ctx.fillStyle = `rgba(255,${190 + Math.round(rand() * 40)},120,${0.5 + rand() * 0.4})`;
      ctx.fillRect(rand() * w, horizon - y0 * rand() - 4, 2, 2);
    }
  };
  shore(18, 26, '#3c3560', 70);
  shore(8, 14, '#2a2649', 50);

  // Stadshuset: the long hall and the tower with Tre Kronor on top
  const dark = '#141a33';
  ctx.fillStyle = dark;
  const hx0 = w * 0.36;
  const hx1 = w * 0.6;
  ctx.fillRect(hx0, horizon - 62, hx1 - hx0, 62);
  ctx.beginPath(); // pitched copper roofs
  ctx.moveTo(hx0 - 4, horizon - 62);
  ctx.lineTo(hx0 + 30, horizon - 78);
  ctx.lineTo(hx1 - 30, horizon - 78);
  ctx.lineTo(hx1 + 4, horizon - 62);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,205,130,0.8)';
  for (let i = 0; i < 14; i++) ctx.fillRect(hx0 + 10 + i * 16, horizon - 44, 4, 9);
  for (let i = 0; i < 18; i++) ctx.fillRect(hx0 + 8 + i * 12.5, horizon - 22, 3, 6);
  const tx = w * 0.555;
  ctx.fillStyle = dark;
  ctx.fillRect(tx - 17, horizon - 250, 34, 250); // the brick shaft
  ctx.fillRect(tx - 20, horizon - 258, 40, 10); // gallery
  ctx.fillRect(tx - 11, horizon - 298, 22, 42); // lantern
  ctx.beginPath(); // cupola
  ctx.moveTo(tx - 13, horizon - 298);
  ctx.quadraticCurveTo(tx, horizon - 330, tx + 13, horizon - 298);
  ctx.fill();
  ctx.fillRect(tx - 1.5, horizon - 346, 3, 22); // spire
  ctx.fillStyle = 'rgba(255,214,140,0.85)';
  for (let i = 0; i < 4; i++) ctx.fillRect(tx - 8 + i * 5, horizon - 290, 2, 12);
  ctx.fillStyle = '#ffd36a'; // three gilded crowns
  [-7, 0, 7].forEach((dx, i) => {
    const cy = horizon - 350 - (i === 1 ? 7 : 0);
    ctx.beginPath();
    ctx.moveTo(tx + dx - 3.5, cy);
    ctx.lineTo(tx + dx - 3.5, cy - 4);
    ctx.lineTo(tx + dx - 1.7, cy - 2);
    ctx.lineTo(tx + dx, cy - 5);
    ctx.lineTo(tx + dx + 1.7, cy - 2);
    ctx.lineTo(tx + dx + 3.5, cy - 4);
    ctx.lineTo(tx + dx + 3.5, cy);
    ctx.fill();
  });

  // Riddarholmskyrkan's openwork spire
  const rx = w * 0.82;
  ctx.fillStyle = dark;
  ctx.fillRect(rx - 40, horizon - 70, 80, 70);
  ctx.fillRect(rx - 13, horizon - 128, 26, 60);
  ctx.beginPath();
  ctx.moveTo(rx - 13, horizon - 128);
  ctx.lineTo(rx, horizon - 280);
  ctx.lineTo(rx + 13, horizon - 128);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,150,110,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const yy = horizon - 140 - i * 15;
    const half = 12 * (1 - (i * 15 + 12) / 152);
    ctx.beginPath();
    ctx.moveTo(rx - half, yy);
    ctx.lineTo(rx + half, yy - 7);
    ctx.stroke();
  }
  // Gamla stan's roofs between
  ctx.fillStyle = '#1b2140';
  let x = w * 0.62;
  while (x < w * 0.98) {
    const bw = 14 + rand() * 22;
    const bh = 26 + rand() * 30;
    if (Math.abs(x - rx) > 50) {
      ctx.fillRect(x, horizon - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,200,120,0.75)';
      for (let i = 0; i < 3; i++) if (rand() < 0.6) ctx.fillRect(x + 3 + rand() * (bw - 6), horizon - bh + 6 + rand() * (bh - 12), 2, 3);
      ctx.fillStyle = '#1b2140';
    }
    x += bw + 2;
  }
  ctx.fillStyle = dark;
  x = 0;
  while (x < w * 0.34) {
    const bw = 16 + rand() * 30;
    const bh = 18 + rand() * 34;
    ctx.fillRect(x, horizon - bh, bw, bh);
    x += bw + 2;
  }

  // Riddarfjärden: the sky, darker, with the sun's path on the water
  const water = ctx.createLinearGradient(0, horizon, 0, h);
  water.addColorStop(0, '#6a4a6a');
  water.addColorStop(0.3, '#33365e');
  water.addColorStop(1, '#151a36');
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, w, h - horizon);
  for (let i = 0; i < 160; i++) {
    const yy = horizon + 3 + rand() ** 1.6 * (h - horizon - 6);
    const spread = 20 + (yy - horizon) * 0.9;
    const xx = sx + (rand() - 0.5) * spread;
    ctx.fillStyle = `rgba(255,${180 + Math.round(rand() * 60)},120,${0.25 + rand() * 0.5})`;
    ctx.fillRect(xx, yy, 4 + rand() * 14, 1.4);
  }
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255,205,140,${0.12 + rand() * 0.25})`;
    ctx.fillRect(rand() * w, horizon + 2 + rand() * 40, 3 + rand() * 9, 1);
  }
  return canvasTex(cv);
}

/** Back wall: deep green plaster over an oak wainscot, one tile = 10 m × 9.5 m. */
function wallTexture() {
  const w = 512;
  const h = 512;
  const [cv, ctx] = canvas(w, h);
  const rand = mulberry(61);
  const m = h / 9.5; // pixels per metre
  ctx.fillStyle = '#34503f';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.85;
    const g = ctx.createRadialGradient(x, y, 2, x, y, 30 + rand() * 90);
    g.addColorStop(0, rand() < 0.5 ? 'rgba(80,112,90,0.2)' : 'rgba(16,28,22,0.24)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  // Frieze under the cornice
  ctx.fillStyle = '#2a3f32';
  ctx.fillRect(0, 0, w, m * 0.7);
  ctx.fillStyle = 'rgba(190,160,100,0.35)';
  ctx.fillRect(0, m * 0.7, w, 2);
  // Oak wainscot, 1.25 m
  const top = h - m * 1.25;
  ctx.fillStyle = '#3d2716';
  ctx.fillRect(0, top, w, h - top);
  const panels = 8;
  for (let i = 0; i < panels; i++) {
    const px = (i * w) / panels + 5;
    const pw = w / panels - 10;
    const g = ctx.createLinearGradient(px, 0, px + pw, 0);
    g.addColorStop(0, '#4f3420');
    g.addColorStop(0.5, '#5b3d25');
    g.addColorStop(1, '#4a301d');
    ctx.fillStyle = g;
    ctx.fillRect(px, top + 10, pw, h - top - 22);
    ctx.strokeStyle = 'rgba(20,12,6,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 5, top + 15, pw - 10, h - top - 32);
    ctx.strokeStyle = 'rgba(170,120,70,0.25)';
    ctx.beginPath();
    ctx.moveTo(px + 5, top + 15);
    ctx.lineTo(px + pw - 5, top + 15);
    ctx.stroke();
  }
  ctx.fillStyle = '#5b3d24';
  ctx.fillRect(0, top - 4, w, 8);
  ctx.fillStyle = 'rgba(190,140,90,0.35)';
  ctx.fillRect(0, top - 4, w, 2);
  ctx.fillStyle = '#21140b';
  ctx.fillRect(0, h - 8, w, 8);
  const tex = canvasTex(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Club banner: oxblood with a gold border and crossed foils. */
function bannerTexture(text) {
  const [cv, ctx] = canvas(128, 256);
  ctx.fillStyle = '#6e1f2b';
  ctx.fillRect(0, 0, 128, 256);
  ctx.strokeStyle = '#d6a945';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 112, 240);
  ctx.strokeStyle = '#efe6d2';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(30, 60);
  ctx.lineTo(98, 170);
  ctx.moveTo(98, 60);
  ctx.lineTo(30, 170);
  ctx.stroke();
  ctx.fillStyle = '#d6a945';
  [[30, 170], [98, 170]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.font = 'bold 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 64, 222);
  return canvasTex(cv);
}

/** Soft round glow sprite. */
export function glowTexture(size = 64) {
  const [cv, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTex(cv, false);
}

function noiseTexture() {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  const rand = mulberry(99);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
  const tex = new THREE.DataTexture(data, n, n);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------------------------------------------- merged props */

/**
 * Collects primitives with a colour and a transform and merges them into
 * one vertex-coloured mesh: a whole room of panelling, frames, benches
 * and tables costs one draw call per material.
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

  add(geo, color, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let g = geo;
    if (geo.index) {
      g = geo.toNonIndexed();
      geo.dispose();
    }
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    g.applyMatrix4(this.m);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(g);
  }

  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }

  build(material) {
    const geo = mergeGeometries(this.parts);
    this.parts.forEach((g) => g.dispose());
    this.parts = [];
    return new THREE.Mesh(geo, material);
  }
}

/* -------------------------------------------------------- the shafts */

const SHAFT_VERT = `
attribute vec3 aOrigin;
varying vec3 vWorld;
varying vec3 vOrigin;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vOrigin = aOrigin;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// Ray–slab intersection in the beam's own (u across, v up, w along the
// light) coordinates, clipped by the floor. Brightness is the length of
// air the ray crosses inside the beam, with soft edges and dust streaks.
const SHAFT_FRAG = `
uniform mat3 uInv;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform sampler2D uNoise;
varying vec3 vWorld;
varying vec3 vOrigin;
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  vec3 o = uInv * (ro - vOrigin);
  vec3 d = uInv * rd;
  d = sign(d) * max(abs(d), vec3(1e-5));
  vec3 t0 = -o / d;
  vec3 t1 = (vec3(1.0) - o) / d;
  vec3 tn3 = min(t0, t1);
  vec3 tf3 = max(t0, t1);
  float tn = max(max(max(tn3.x, tn3.y), tn3.z), 0.0);
  float tf = min(min(tf3.x, tf3.y), tf3.z);
  if (rd.y < 0.0) tf = min(tf, -ro.y / rd.y);
  float len = tf - tn;
  if (len <= 0.0) discard;
  float acc = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float tt = tn + (float(i) + 0.5) / float(SAMPLES) * len;
    vec3 b = o + d * tt;
    float edge = smoothstep(0.0, 0.2, b.x) * smoothstep(1.0, 0.8, b.x)
               * smoothstep(0.0, 0.16, b.y) * smoothstep(1.0, 0.86, b.y);
    vec3 wp = ro + rd * tt;
    float n = texture2D(uNoise, vec2(b.x * 1.3 + uTime * 0.012, b.z * 0.9 - uTime * 0.02)).r;
    float n2 = texture2D(uNoise, vec2(b.x * 3.1 - uTime * 0.02, b.y * 2.0 + b.z * 2.2)).g;
    // Densest near the window, thinning out towards the floor
    float fade = pow(max(1.0 - b.z, 0.0), 1.6) * smoothstep(0.0, 0.9, wp.y);
    acc += edge * fade * (0.55 + 0.55 * n + 0.25 * n2);
  }
  float glow = acc / float(SAMPLES) * min(len, 4.0);
  gl_FragColor = vec4(uColor * glow * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Hull of the light's path through one window: the opening (as a
 * rectangle) extruded along the sun direction until it meets the floor.
 * Its inner faces are rendered, so the shader runs once per covered pixel
 * whether the camera is outside the shaft or standing in it.
 */
function shaftGeometry(cx, X, Y) {
  const O = new THREE.Vector3(cx - WIN_W / 2, WIN_Y0 + 0.1, WALL_Z + 0.06);
  const H = WIN_Y1 + WIN_R * 0.7 - (WIN_Y0 + 0.1);
  const floorW = (y) => (y - 0.03) / -SUN_DIR.y; // path length to the floor
  const corner = (u, v, onFloor) => {
    const p = O.clone().addScaledVector(X, u * WIN_W).addScaledVector(Y, v * H);
    if (onFloor) p.addScaledVector(SUN_DIR, floorW(p.y));
    return p;
  };
  const V = [];
  for (const u of [0, 1]) {
    V.push(corner(u, 0, false), corner(u, 1, false), corner(u, 1, true), corner(u, 0, true));
  }
  // faces as quads of vertex indices
  const quads = [[0, 1, 5, 4], [3, 2, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [0, 3, 2, 1], [4, 5, 6, 7]];
  const centre = V.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / 8);
  const pos = [];
  const tri = (a, b, c) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const f = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3).sub(centre);
    const list = n.dot(f) >= 0 ? [a, b, c] : [a, c, b];
    list.forEach((p) => pos.push(p.x, p.y, p.z));
  };
  quads.forEach(([a, b, c, d]) => {
    tri(V[a], V[b], V[c]);
    tri(V[a], V[c], V[d]);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const org = [];
  for (let i = 0; i < pos.length / 3; i++) org.push(O.x, O.y, O.z);
  geo.setAttribute('aOrigin', new THREE.Float32BufferAttribute(org, 3));
  return { geo, O, H, len: floorW(O.y + H) };
}

function buildShafts(noise, high) {
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const parts = WIN_X.map((cx) => shaftGeometry(cx, X, Y));
  const { H, len } = parts[0];
  // Beam space → world: columns are the width, the height and the light path
  const B = new THREE.Matrix3().set(
    WIN_W, 0, SUN_DIR.x * len,
    0, H, SUN_DIR.y * len,
    0, 0, SUN_DIR.z * len
  );
  const inv = B.clone().invert();
  const geo = mergeGeometries(parts.map((p) => p.geo));
  parts.forEach((p) => p.geo.dispose());
  const mat = new THREE.ShaderMaterial({
    defines: { SAMPLES: high ? 5 : 3 },
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    uniforms: {
      uInv: { value: inv },
      uColor: { value: new THREE.Color(0xffc48a) },
      uTime: { value: 0 },
      uIntensity: { value: 0.07 },
      uNoise: { value: noise }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  return { mesh, mat, inv, origins: parts.map((p) => p.O) };
}

/* Dust: points that only light up while they are inside a shaft */
const MOTE_VERT = `
attribute vec4 aSeed;
attribute vec3 aOrigin;
uniform float uTime;
uniform float uScale;
uniform mat3 uInv;
varying float vBright;
void main() {
  vec3 p = position;
  float ph = aSeed.w;
  p += vec3(sin(uTime * 0.21 + ph * 6.0), sin(uTime * 0.13 + ph * 9.0) * 0.6, cos(uTime * 0.17 + ph * 4.0)) * aSeed.xyz;
  p.y += mod(uTime * 0.03 * (0.3 + ph), 0.6) - 0.3;
  vec3 b = uInv * (p - aOrigin);
  float inside = smoothstep(0.0, 0.15, b.x) * smoothstep(1.0, 0.85, b.x)
               * smoothstep(0.0, 0.12, b.y) * smoothstep(1.0, 0.88, b.y)
               * step(0.0, b.z) * step(b.z, 1.0) * step(0.05, p.y);
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + ph * 3.0) + ph * 40.0);
  vBright = inside * tw;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uScale * (0.6 + ph) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const MOTE_FRAG = `
uniform vec3 uColor;
varying float vBright;
void main() {
  if (vBright < 0.01) discard;
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c));
  gl_FragColor = vec4(uColor * a * vBright, 1.0);
  #include <colorspace_fragment>
}`;

function buildMotes(shafts, count) {
  const rand = mulberry(23);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  const org = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const len = (WIN_Y1 + WIN_R) / -SUN_DIR.y;
  for (let i = 0; i < count; i++) {
    const wi = Math.floor(rand() * WIN_X.length);
    const O = shafts.origins[wi];
    // Spread through the shaft volume, a little beyond its edges
    p.copy(O)
      .addScaledVector(new THREE.Vector3(1, 0, 0), (rand() * 1.3 - 0.15) * WIN_W)
      .addScaledVector(new THREE.Vector3(0, 1, 0), rand() * 3.6)
      .addScaledVector(SUN_DIR, rand() * len * 0.9);
    pos.set([p.x, Math.max(0.1, p.y), p.z], i * 3);
    seed.set([0.2 + rand() * 0.4, 0.15 + rand() * 0.3, 0.2 + rand() * 0.4, rand()], i * 4);
    org.set([O.x, O.y, O.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aOrigin', new THREE.BufferAttribute(org, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 60 },
      uInv: { value: shafts.inv },
      uColor: { value: new THREE.Color(0xffe0b0).multiplyScalar(1.6) }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  return { points: pts, mat };
}

/* ------------------------------------------------- environment map */

/**
 * A coarse stand-in of the room for reflections: dark panelling, three
 * hot window rectangles behind, candle glow above, a dim front. PMREM
 * blurs it into the irradiance and specular the PBR materials sample.
 */
export function buildEnvScene() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(30, 12, 26),
    new THREE.MeshBasicMaterial({ color: 0x2b2117, side: THREE.BackSide })
  );
  room.position.set(0, 4.5, 2);
  env.add(room);
  const floorM = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 26),
    new THREE.MeshBasicMaterial({ color: 0x3d2614 })
  );
  floorM.rotation.x = -Math.PI / 2;
  floorM.position.set(0, -1.4, 2);
  env.add(floorM);
  const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.6, 3) });
  WIN_X.forEach((x) => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4), hot);
    win.position.set(x, 4.8, -10.9);
    env.add(win);
  });
  const candle = new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 9, 4.5) });
  [-3.6, 3.6].forEach((x) => {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), candle);
    c.position.set(x, 9, -1.5);
    env.add(c);
  });
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.75, 0.6) })
  );
  front.position.set(0, 4, 14.9);
  front.rotation.y = Math.PI;
  env.add(front);
  return env;
}

/* ------------------------------------------------------------- crowd */

const SHIRTS = [0xb8343f, 0x2f5f8f, 0x5d8a58, 0xc9922e, 0x7a4480, 0x3d7d7a, 0xc96a32, 0x6b7280, 0x2e3a59, 0x8f6b3d, 0xa04050, 0x4a6b8a];
const SKINS = [0xe2b08a, 0xd59e78, 0xc58b62, 0xe8bf9c, 0xb87a52];
const HAIRS = [0x2b1d12, 0x4a3220, 0x6b4e2e, 0x8a7a68, 0xc9a464, 0x1a1a1a];

/**
 * Seated spectators as six InstancedMeshes (torso, head, hair, both arms,
 * legs). Each person is a tiny rig evaluated on the CPU — a dozen matrix
 * composes per frame — so they can sway, lean in when an attack is coming,
 * jump up on your touches and put their hands on their heads on theirs.
 */
class Crowd {
  constructor(seats) {
    const rand = mulberry(41);
    // Dimmed: the crowd is backdrop, it must never compete with the blades
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, color: new THREE.Color(0.62, 0.6, 0.58) });
    const legGeo = mergeGeometries([
      new THREE.BoxGeometry(0.34, 0.15, 0.44).translate(0, 0.6, 0.16),
      new THREE.BoxGeometry(0.3, 0.5, 0.13).translate(0, 0.3, 0.36),
      new THREE.BoxGeometry(0.32, 0.08, 0.22).translate(0, 0.04, 0.42)
    ]);
    const n = seats.length;
    const mk = (geo) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      return m;
    };
    this.torso = mk(new THREE.CapsuleGeometry(0.17, 0.3, 3, 10));
    this.head = mk(new THREE.SphereGeometry(0.115, 12, 9));
    this.hair = mk(new THREE.SphereGeometry(0.123, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.1));
    this.armL = mk(new THREE.CapsuleGeometry(0.048, 0.4, 3, 6).translate(0, -0.22, 0));
    this.armR = mk(this.armL.geometry.clone());
    this.legs = mk(legGeo);
    this.meshes = [this.torso, this.head, this.hair, this.armL, this.armR, this.legs];
    this.group = new THREE.Group();
    this.meshes.forEach((m) => this.group.add(m));
    const col = new THREE.Color();
    this.people = seats.map((s, i) => {
      const shirt = SHIRTS[i % SHIRTS.length];
      const skin = SKINS[Math.floor(rand() * SKINS.length)];
      this.torso.setColorAt(i, col.set(shirt));
      this.armL.setColorAt(i, col.set(shirt));
      this.armR.setColorAt(i, col.set(shirt));
      this.head.setColorAt(i, col.set(skin));
      this.hair.setColorAt(i, col.set(HAIRS[Math.floor(rand() * HAIRS.length)]));
      this.legs.setColorAt(i, col.set([0x2f3746, 0x3b3328, 0x23272e, 0x4a4f5a][i % 4]));
      return {
        x: s[0], z: s[1], yaw: s[2], phase: rand() * 6.28, delay: rand() * 0.3,
        mood: 'idle', moodT: 0, lean: 0, lift: 0, armUp: 0, armFwd: 0.5, clap: 0, hands: 0
      };
    });
    this.meshes.forEach((m) => {
      m.instanceColor.needsUpdate = true;
    });
    this.o = new THREE.Object3D();
    this.o.rotation.order = 'YXZ'; // local raise first, then the person's yaw
    this.mood = 'idle';
  }

  /** idle | tense | ooh | cheer | groan | clap | stand */
  react(mood) {
    this.mood = mood;
    this.people.forEach((p) => {
      p.mood = mood;
      p.moodT = -p.delay;
    });
  }

  update(t, dt) {
    const { o } = this;
    const k = Math.min(1, dt * 7);
    this.people.forEach((p, i) => {
      p.moodT += dt;
      const on = p.moodT > 0;
      let lean = Math.sin(t * 0.7 + p.phase) * 0.03;
      let lift = 0;
      let armUp = 0;
      let armFwd = 0.55;
      let hands = 0;
      const m = on ? p.mood : 'idle';
      if (m === 'tense') {
        lean = 0.22;
        armFwd = 0.9;
      } else if (m === 'ooh') {
        lean = -0.12 + 0.1 * Math.sin(p.moodT * 3);
        armFwd = 1.1;
      } else if (m === 'cheer' || m === 'stand') {
        const big = m === 'stand' ? 1.3 : 0.8;
        lift = Math.abs(Math.sin(t * 8 + p.phase)) * 0.1 * big;
        armUp = 2.5;
        armFwd = 0.2;
        lean = -0.08;
      } else if (m === 'groan') {
        hands = 1;
        lean = 0.12;
      } else if (m === 'clap') {
        armFwd = 1.25;
        lean = 0.05;
      }
      if (on && p.moodT > (m === 'stand' ? 99 : m === 'clap' ? 3.2 : 1.8)) p.mood = 'idle';
      p.lean += (lean - p.lean) * k;
      p.lift += (lift - p.lift) * k;
      p.armUp += (armUp - p.armUp) * k;
      p.armFwd += (armFwd - p.armFwd) * k;
      p.hands += (hands - p.hands) * k;
      const clap = m === 'clap' && on ? Math.max(0, Math.sin(t * 15 + p.phase)) * 0.35 : 0;

      const put = (mesh, x, y, z, rx, ry, rz) => {
        o.position.set(x, y, z);
        o.rotation.set(rx, ry, rz);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      };
      // Everything relative to the seat, rotated by the person's yaw
      const cy = Math.cos(p.yaw);
      const sy = Math.sin(p.yaw);
      const at = (lx, ly, lz) => [p.x + lx * cy + lz * sy, ly + p.lift, p.z - lx * sy + lz * cy];
      const torsoY = 0.95;
      const [tx, ty, tz] = at(0, torsoY, 0);
      put(this.torso, tx, ty, tz, p.lean, p.yaw, 0);
      const hz = Math.sin(p.lean) * 0.42;
      const [hx, hy, hzz] = at(0, torsoY + 0.42, hz);
      put(this.head, hx, hy, hzz, p.lean * 0.6, p.yaw, 0);
      put(this.hair, hx, hy + 0.012, hzz - 0.01, p.lean * 0.6 - 0.15, p.yaw, 0);
      put(this.legs, p.x, 0, p.z, 0, p.yaw, 0);
      // Arms: raise sideways for cheers, forward for claps, to the head for groans
      [this.armL, this.armR].forEach((arm, s) => {
        const side = s ? 1 : -1;
        const [ax, ay, az] = at(side * 0.21, torsoY + 0.24, hz * 0.6);
        const fwd = -(p.armFwd + p.hands * 1.9);
        const out = side * (p.armUp + p.hands * 0.55 - clap);
        put(arm, ax, ay, az, fwd, p.yaw, out);
      });
    });
    this.meshes.forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
    });
  }

  dispose() {
    this.meshes.forEach((m) => {
      m.geometry.dispose();
      m.dispose();
    });
    this.meshes[0].material.dispose();
  }
}

/* ----------------------------------------------------------- referee */

/**
 * The referee (domaren) stands across the piste and runs every phrase:
 * arms out for »En garde«, a sweep together for »Kör!«, and a raised arm
 * towards whoever earned the touch.
 */
class Referee {
  constructor() {
    const std = (c, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const suit = std(0x1d2230, 0.62);
    const shirt = std(0xece8df);
    const skin = std(0xd8a47c, 0.6);
    const g = new THREE.Group();
    this.group = g;
    const add = (geo, mat, parent, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    [-0.1, 0.1].forEach((x) => add(new THREE.CylinderGeometry(0.075, 0.06, 0.92, 8), suit, g, x, 0.46, 0));
    [-0.1, 0.1].forEach((x) => add(new THREE.BoxGeometry(0.11, 0.07, 0.26), std(0x111111, 0.4), g, x, 0.035, 0.05));
    const body = new THREE.Group();
    body.position.y = 0.92;
    g.add(body);
    const jacket = add(new THREE.CapsuleGeometry(0.2, 0.42, 4, 12), suit, body, 0, 0.32, 0);
    jacket.scale.z = 0.62;
    add(new THREE.PlaneGeometry(0.12, 0.3), shirt, body, 0, 0.5, 0.128);
    add(new THREE.BoxGeometry(0.035, 0.22, 0.01), std(0x8a2030), body, 0, 0.47, 0.134);
    const head = add(new THREE.SphereGeometry(0.11, 12, 10), skin, body, 0, 0.88, 0.01);
    head.scale.set(0.92, 1.08, 0.98);
    add(new THREE.SphereGeometry(0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), std(0x6d6a66), body, 0, 0.9, -0.005);
    this.arms = [-1, 1].map((side) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.24, 0.66, 0);
      body.add(sh);
      add(new THREE.CapsuleGeometry(0.055, 0.26, 3, 8).translate(0, -0.15, 0), suit, sh, 0, 0, 0);
      const el = new THREE.Group();
      el.position.y = -0.3;
      sh.add(el);
      add(new THREE.CapsuleGeometry(0.048, 0.24, 3, 8).translate(0, -0.13, 0), suit, el, 0, 0, 0);
      add(new THREE.SphereGeometry(0.045, 8, 6), skin, el, 0, -0.3, 0);
      return { sh, el, side, z: 0, x: 0, bend: 0 };
    });
    this.body = body;
    this.signal('idle');
  }

  /** idle | engarde | allez | point (side −1 left / +1 right) | halt */
  signal(kind, side = 0) {
    this.kind = kind;
    this.side = side;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    const k = Math.min(1, dt * 9);
    this.arms.forEach((a) => {
      let z = 0.12 * a.side; // relaxed at the sides
      let x = 0.25;
      let bend = -0.5;
      if (this.kind === 'engarde') {
        z = a.side * 1.45;
        x = 0.15;
        bend = -0.05;
      } else if (this.kind === 'allez') {
        const s = Math.min(1, this.t / 0.22);
        z = a.side * (1.45 - 1.25 * s);
        x = 0.15 + 1.0 * s;
        bend = -0.1;
      } else if (this.kind === 'point' && a.side === this.side) {
        z = a.side * 2.3;
        x = 0.1;
        bend = -0.05;
      } else if (this.kind === 'halt' && a.side === 1) {
        z = 2.9;
        x = 0.2;
        bend = 0;
      }
      a.z += (z - a.z) * k;
      a.x += (x - a.x) * k;
      a.bend += (bend - a.bend) * k;
      a.sh.rotation.set(-a.x, 0, a.z);
      a.el.rotation.x = a.bend;
    });
    this.body.rotation.y = Math.sin(this.t * 0.6) * 0.05 + (this.kind === 'point' ? this.side * 0.25 : 0);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

/* -------------------------------------------------- scoring apparatus */

/**
 * The repeater box above the piste: two big domed lamps — green for you,
 * red for the opponent, as the HUD says — a white off-target lamp each,
 * and a seven-segment score window. The lamps are HDR-bright when lit so
 * bloom takes them, and a point light throws their colour over the
 * referee and the piste.
 */
class ScoreBox {
  constructor() {
    const g = new THREE.Group();
    this.group = g;
    const std = (c, r, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.56, 0.34), std(0x1a1f29, 0.5, 0.3));
    body.castShadow = true;
    g.add(body);
    const chrome = std(0xc9ced8, 0.25, 0.95);
    this.lampMats = [0x2bff74, 0xff3b2c].map((c) => new THREE.MeshStandardMaterial({
      color: 0x0b0c0e, roughness: 0.25, metalness: 0.1, emissive: c, emissiveIntensity: 0.05
    }));
    this.lamps = this.lampMats.map((mat, i) => {
      const x = i ? 0.55 : -0.55;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dome.rotation.x = Math.PI / 2;
      dome.position.set(x, 0.02, 0.17);
      dome.scale.set(1, 0.55, 1);
      g.add(dome);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.022, 6, 24), chrome);
      ring.position.set(x, 0.02, 0.172);
      g.add(ring);
      return dome;
    });
    this.whiteMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, emissive: 0xffffff, emissiveIntensity: 0.03 });
    [-0.18, 0.18].forEach((x) => {
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), this.whiteMat);
      w.position.set(x, -0.18, 0.172);
      g.add(w);
    });
    const [cv, ctx] = canvas(256, 96);
    this.cv = cv;
    this.ctx = ctx;
    this.tex = canvasTex(cv);
    const disp = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.19),
      new THREE.MeshBasicMaterial({ map: this.tex, color: new THREE.Color(1.6, 1.6, 1.6) })
    );
    disp.position.set(0, 0.1, 0.172);
    g.add(disp);
    // Stand
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.6, 8), std(0x262a31, 0.5, 0.6));
    pole.position.y = -1.55;
    pole.castShadow = true;
    g.add(pole);
    this.light = new THREE.PointLight(0x2bff74, 0, 9, 2);
    this.light.position.set(0, -0.2, 0.8);
    g.add(this.light);
    this.on = [0, 0];
    this.setScore(0, 0);
  }

  setScore(a, b) {
    const { ctx } = this;
    ctx.fillStyle = '#07080a';
    ctx.fillRect(0, 0, 256, 96);
    ctx.font = 'bold 72px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,60,40,0.12)';
    ctx.fillText('8', 64, 52);
    ctx.fillText('8', 192, 52);
    ctx.fillStyle = '#ff5a3a';
    ctx.fillText(String(a), 64, 52);
    ctx.fillText(String(b), 192, 52);
    ctx.fillRect(124, 44, 8, 8);
    this.tex.needsUpdate = true;
  }

  /** side 0 = you (green), 1 = opponent (red) */
  flash(side) {
    this.on[side] = 1;
    this.light.color.set(side ? 0xff3b2c : 0x2bff74);
  }

  clear() {
    this.on = [0, 0];
  }

  update(t, dt) {
    let lightI = 0;
    this.lampMats.forEach((m, i) => {
      const on = this.on[i];
      // Lit lamps hum a little, as the real ones do through a camera
      const target = on ? 7 + Math.sin(t * 50) * 0.4 : 0.05;
      m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, dt * (on ? 30 : 8));
      lightI += on ? 4 : 0;
    });
    this.light.intensity += (lightI - this.light.intensity) * Math.min(1, dt * 14);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}

/* ------------------------------------------------------------- build */

/**
 * @param {object} o
 * @param {THREE.Texture} o.glow
 * @param {boolean} o.high  quality tier
 */
export function buildSalle({ glow, high }) {
  const g = new THREE.Group();
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const noise = keep(noiseTexture());

  /* ---- Lights ---- */
  const lights = new THREE.Group();
  g.add(lights);
  const hemi = new THREE.HemisphereLight(0x9cb2d8, 0x3a2414, 0.5);
  lights.add(hemi);
  const key = new THREE.DirectionalLight(0xffc68a, 2.3);
  const keyTarget = new THREE.Vector3(0.6, 0, 0.5);
  key.position.copy(keyTarget).addScaledVector(SUN_DIR, -40);
  key.target.position.copy(keyTarget);
  key.castShadow = true;
  key.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  key.shadow.radius = 3;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  lights.add(key, key.target);
  // Cover the whole room: anything outside the shadow frustum would read
  // as sunlit, and a lit corner behind a wall is the first thing you notice
  fitShadow(key, [
    [-16, 9.6, WALL_Z], [16, 9.6, WALL_Z], [-16, 0, WALL_Z], [16, 0, WALL_Z],
    [-16, 0, 15], [16, 0, 15], [-16, 3, 15], [16, 3, 15]
  ]);
  const front = new THREE.DirectionalLight(0xffe2c4, 0.85);
  front.position.set(1.5, 4.5, 14);
  lights.add(front);
  const rimCool = new THREE.DirectionalLight(0x8fb0ff, 0.35);
  rimCool.position.set(-8, 6, -3);
  lights.add(rimCool);
  const candles = [-3.6, 3.6].map((x) => {
    const l = new THREE.PointLight(0xffaa5c, 11, 13, 2);
    l.position.set(x, 4.4, -1.6);
    lights.add(l);
    return l;
  });

  /* ---- Floor: waxed herringbone, glossy enough to mirror the windows ---- */
  const parquet = keep(parquetTexture());
  parquet.repeat.set(32 / 2.4, 24 / 2.4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 24),
    new THREE.MeshStandardMaterial({
      map: parquet, roughness: 0.52, metalness: 0, bumpMap: parquet, bumpScale: 0.6, envMapIntensity: 0.9
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 3;
  floor.receiveShadow = true;
  g.add(floor);

  /* ---- Piste ---- */
  const piste = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.035, 1.8),
    new THREE.MeshStandardMaterial({ map: keep(pisteTexture()), roughness: 0.42, metalness: 0.55 })
  );
  piste.position.y = 0.0175;
  piste.receiveShadow = true;
  g.add(piste);

  /* ---- Back wall with the window openings cut out ---- */
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-16, 0);
  wallShape.lineTo(16, 0);
  wallShape.lineTo(16, 9.6);
  wallShape.lineTo(-16, 9.6);
  wallShape.lineTo(-16, 0);
  WIN_X.forEach((cx) => {
    const hole = new THREE.Path();
    hole.moveTo(cx - WIN_R, WIN_Y0);
    hole.lineTo(cx + WIN_R, WIN_Y0);
    hole.lineTo(cx + WIN_R, WIN_Y1);
    hole.absarc(cx, WIN_Y1, WIN_R, 0, Math.PI, false);
    hole.lineTo(cx - WIN_R, WIN_Y0);
    wallShape.holes.push(hole);
  });
  const wallTex = keep(wallTexture());
  wallTex.repeat.set(1 / 10, 1 / 9.5);
  wallTex.offset.set(0.5, 0);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.86 });
  const wall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape, 18), wallMat);
  wall.position.z = WALL_Z;
  wall.castShadow = true;
  g.add(wall);
  const sideTex = keep(wallTex.clone());
  sideTex.repeat.set(2.4, 1);
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.86 });
  [-1, 1].forEach((s) => {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(24, 9.6), sideMat);
    side.position.set(s * 16, 4.8, 5);
    side.rotation.y = (-s * Math.PI) / 2;
    g.add(side);
  });
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 24),
    new THREE.MeshStandardMaterial({ color: 0x2a2219, roughness: 0.9 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 9.6, 5);
  g.add(ceiling);

  /* ---- Windows: the panorama, each window its own slice ---- */
  const sky = keep(skylineTexture());
  const paneMat = new THREE.MeshBasicMaterial({ map: sky, color: new THREE.Color(1.55, 1.45, 1.35), fog: false });
  const paneGeos = WIN_X.map((cx, i) => {
    const geo = new THREE.PlaneGeometry(WIN_W + 0.3, WIN_Y1 + WIN_R - WIN_Y0 + 0.3);
    const { uv } = geo.attributes;
    const u0 = [0.02, 0.36, 0.66][i];
    for (let k = 0; k < uv.count; k++) uv.setX(k, u0 + uv.getX(k) * 0.32);
    geo.translate(cx, (WIN_Y0 + WIN_Y1 + WIN_R) / 2, WALL_Z - 0.32);
    return geo;
  });
  const panes = new THREE.Mesh(mergeGeometries(paneGeos), paneMat);
  paneGeos.forEach((p) => p.dispose());
  g.add(panes);

  /* ---- Static props, merged: wood, metal ---- */
  const wood = new Batch();
  const frame = 0x2c2117;
  WIN_X.forEach((cx) => {
    const yMid = (WIN_Y0 + WIN_Y1) / 2;
    // Reveal: the wall's thickness around the opening
    wood.box(0.1, WIN_Y1 - WIN_Y0, 0.34, 0x2a3c30, cx - WIN_R - 0.05, yMid, WALL_Z - 0.17);
    wood.box(0.1, WIN_Y1 - WIN_Y0, 0.34, 0x2a3c30, cx + WIN_R + 0.05, yMid, WALL_Z - 0.17);
    // Frame, mullion and glazing bars
    wood.box(0.09, WIN_Y1 + WIN_R - WIN_Y0, 0.08, frame, cx, (WIN_Y0 + WIN_Y1 + WIN_R) / 2, WALL_Z - 0.26);
    [WIN_Y0 + 0.93, WIN_Y0 + 1.86, WIN_Y1].forEach((y) => wood.box(WIN_W, 0.07, 0.08, frame, cx, y, WALL_Z - 0.26));
    [-WIN_R / 2, WIN_R / 2].forEach((dx) => wood.box(0.045, WIN_Y1 - WIN_Y0, 0.06, frame, cx + dx, yMid, WALL_Z - 0.25));
    wood.add(new THREE.TorusGeometry(WIN_R, 0.07, 6, 24, Math.PI), frame, cx, WIN_Y1, WALL_Z - 0.04);
    wood.add(new THREE.TorusGeometry(WIN_R * 0.55, 0.035, 5, 16, Math.PI), frame, cx, WIN_Y1, WALL_Z - 0.25);
    [-1, 1].forEach((s) => wood.box(0.12, WIN_Y1 - WIN_Y0 + 0.06, 0.1, frame, cx + s * (WIN_R + 0.02), yMid, WALL_Z + 0.02));
    wood.box(WIN_W + 0.5, 0.12, 0.38, 0x4b3220, cx, WIN_Y0 - 0.06, WALL_Z + 0.08); // sill
  });
  // Pilasters between and beside the windows, and the cornice
  PILASTERS.forEach((x, i) => {
    const w = i < 4 ? 0.52 : 0.4;
    wood.box(w, 8.2, 0.2, 0x2f4536, x, 5.15, WALL_Z + 0.1);
    wood.box(w + 0.16, 0.26, 0.32, 0x4b3220, x, 9.0, WALL_Z + 0.14);
    wood.box(w + 0.1, 1.3, 0.26, 0x3d2716, x, 0.65, WALL_Z + 0.12);
  });
  wood.box(32, 0.4, 0.46, 0x3f2a19, 0, 9.4, WALL_Z + 0.2);
  wood.box(32, 0.09, 0.07, 0x5b3d24, 0, 1.25, WALL_Z + 0.04);
  wood.box(32, 0.14, 0.05, 0x21140b, 0, 0.07, WALL_Z + 0.03);
  // Ceiling beams
  for (let x = -14; x <= 14; x += 4) wood.box(0.34, 0.42, 24, 0x2e2318, x, 9.4, 5);
  // Spectator benches, either side of the referee
  [-5.1, 5.1].forEach((x) => {
    wood.box(4.6, 0.09, 0.62, 0x6a4628, x, 0.5, -4.65);
    wood.box(4.6, 0.36, 0.06, 0x5b3b22, x, 0.86, -4.98);
    [-2, 0, 2].forEach((dx) => wood.box(0.12, 0.5, 0.56, 0x3a2716, x + dx, 0.25, -4.65));
  });
  // Trophy table stage left
  const tx = -6.4;
  const tz = -3.4;
  wood.box(1.6, 0.08, 0.9, 0x5b3b22, tx, 0.9, tz);
  wood.box(1.66, 0.5, 0.96, 0x6e1f2b, tx, 0.66, tz);
  [-0.68, 0.68].forEach((dx) => wood.box(0.09, 0.9, 0.8, 0x3a2716, tx + dx, 0.45, tz));
  const woodMesh = wood.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68 }));
  woodMesh.castShadow = true;
  woodMesh.receiveShadow = true;
  g.add(woodMesh);

  const metal = new Batch();
  // Body-wire reels at both ends of the piste
  [-7.4, 7.4].forEach((x) => {
    metal.box(0.42, 0.22, 0.32, 0x30353e, x, 0.11, -1.05);
    metal.add(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 14), 0x8d949f, x, 0.24, -1.05, Math.PI / 2, 0, 0);
  });
  // Chandeliers: stem, two brass rings, eight arms with cups
  const brass = 0xb08a46;
  const chX = [-3.6, 3.6];
  const chY = 4.55;
  const chZ = -1.6;
  chX.forEach((x) => {
    metal.add(new THREE.CylinderGeometry(0.025, 0.025, 9.6 - chY, 6), 0x2f281e, x, (9.6 + chY) / 2, chZ);
    metal.add(new THREE.TorusGeometry(0.55, 0.035, 6, 28), brass, x, chY, chZ, Math.PI / 2, 0, 0);
    metal.add(new THREE.TorusGeometry(0.3, 0.025, 6, 20), brass, x, chY + 0.28, chZ, Math.PI / 2, 0, 0);
    metal.add(new THREE.SphereGeometry(0.11, 12, 8), brass, x, chY - 0.08, chZ);
    metal.add(new THREE.ConeGeometry(0.07, 0.22, 10), brass, x, chY - 0.26, chZ, Math.PI, 0, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      metal.add(new THREE.CylinderGeometry(0.045, 0.03, 0.05, 8), brass, x + Math.cos(a) * 0.55, chY + 0.05, chZ + Math.sin(a) * 0.55);
    }
  });
  const metalMesh = metal.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.85 }));
  metalMesh.castShadow = true;
  g.add(metalMesh);

  // Candles (bright) and crystal drops (sparkle in the env map)
  const candleB = new Batch();
  const crystal = new Batch();
  const flamePos = [];
  chX.forEach((x) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = x + Math.cos(a) * 0.55;
      const cz = chZ + Math.sin(a) * 0.55;
      candleB.add(new THREE.CylinderGeometry(0.022, 0.022, 0.17, 6), 0xfff2dc, cx, chY + 0.16, cz);
      flamePos.push(cx, chY + 0.29, cz);
      const b = (i + 0.5) / 8 * Math.PI * 2;
      crystal.add(new THREE.OctahedronGeometry(0.04, 0), 0xffffff, x + Math.cos(b) * 0.5, chY - 0.12, chZ + Math.sin(b) * 0.5, 0, 0, 0, 0.7, 1.5, 0.7);
      crystal.add(new THREE.OctahedronGeometry(0.028, 0), 0xffffff, x + Math.cos(b) * 0.28, chY + 0.16, chZ + Math.sin(b) * 0.28, 0, 0, 0, 0.7, 1.5, 0.7);
    }
  });
  const candleMesh = candleB.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  g.add(candleMesh);
  const crystalMesh = crystal.build(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.05, metalness: 1, envMapIntensity: 2.2
  }));
  g.add(crystalMesh);
  const flameGeo = new THREE.BufferGeometry();
  flameGeo.setAttribute('position', new THREE.Float32BufferAttribute(flamePos, 3));
  const flameMat = new THREE.PointsMaterial({
    map: glow, color: new THREE.Color(2.6, 1.7, 0.8), size: 0.32, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const flames = new THREE.Points(flameGeo, flameMat);
  g.add(flames);
  const haloMat = new THREE.SpriteMaterial({
    map: glow, color: 0xffb46a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending
  });
  chX.forEach((x) => {
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(2.6);
    halo.position.set(x, chY + 0.2, chZ);
    g.add(halo);
  });
  // The pool each chandelier throws on the floor
  const poolGeo = mergeGeometries(chX.map((x) => new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2).translate(x, 0.04, chZ + 0.6)));
  const pools = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
    map: glow, color: 0xffa860, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  pools.renderOrder = 4;
  g.add(pools);

  /* ---- Banners ---- */
  ['SFK', '2023'].forEach((txt, i) => {
    const b = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 2.2),
      new THREE.MeshStandardMaterial({ map: keep(bannerTexture(txt)), roughness: 0.9 })
    );
    b.position.set(PILASTERS[i ? 3 : 0], 6.0, WALL_Z + 0.22);
    g.add(b);
  });

  /* ---- The trophy: Pekkas Pokal on its table ---- */
  const gold = new THREE.MeshStandardMaterial({ color: 0xf0c050, roughness: 0.18, metalness: 1, envMapIntensity: 1.6 });
  const trophy = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.LatheGeometry([
    [0.001, 0], [0.13, 0], [0.13, 0.03], [0.05, 0.06], [0.035, 0.2], [0.07, 0.24],
    [0.17, 0.34], [0.2, 0.48], [0.21, 0.52], [0.19, 0.52], [0.18, 0.47], [0.001, 0.3]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 20), gold);
  cup.castShadow = true;
  trophy.add(cup);
  [-1, 1].forEach((s) => {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 6, 14, Math.PI * 1.2), gold);
    h.position.set(s * 0.21, 0.4, 0);
    h.rotation.z = s > 0 ? -Math.PI * 0.6 : Math.PI * 0.4;
    trophy.add(h);
  });
  trophy.position.set(tx, 0.94, tz);
  trophy.scale.setScalar(1.15);
  g.add(trophy);
  const trophyGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffd27a, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  trophyGlow.scale.setScalar(1.6);
  trophyGlow.position.set(tx, 1.4, tz);
  g.add(trophyGlow);

  /* ---- Shafts and dust ---- */
  const shafts = buildShafts(noise, high);
  g.add(shafts.mesh);
  const motes = buildMotes(shafts, high ? 700 : 380);
  g.add(motes.points);

  /* ---- People and the apparatus ---- */
  const seats = [];
  [-5.1, 5.1].forEach((bx) => {
    for (let i = 0; i < 6; i++) {
      const x = bx - 2 + i * 0.8;
      seats.push([x, -4.62, Math.atan2(-x * 0.35, 4)]);
    }
  });
  const crowd = new Crowd(seats);
  g.add(crowd.group);

  const referee = new Referee();
  referee.group.position.set(0, 0, -2.7);
  g.add(referee.group);

  const score = new ScoreBox();
  score.group.position.set(0, 3.0, -3.9);
  g.add(score.group);

  return {
    group: g,
    lights: { key, hemi, front, candles },
    crowd,
    referee,
    score,
    trophy,
    trophyPos: new THREE.Vector3(tx, 1.4, tz),
    update(t, dt) {
      shafts.mat.uniforms.uTime.value = t;
      motes.mat.uniforms.uTime.value = t;
      crowd.update(t, dt);
      referee.update(dt);
      score.update(t, dt);
      // Candles breathe; the halo follows
      const f = 1 + Math.sin(t * 9.1) * 0.04 + Math.sin(t * 23.7) * 0.03;
      candles.forEach((l, i) => {
        l.intensity = 11 * (f + (i ? Math.sin(t * 13.3) * 0.03 : 0));
      });
      flameMat.size = 0.32 * f;
      trophy.rotation.y = t * 0.25;
    },
    setMoteScale(px) {
      motes.mat.uniforms.uScale.value = px;
    },
    shaftMat: shafts.mat,
    dispose() {
      crowd.dispose();
      referee.dispose();
      score.dispose();
      disposables.forEach((d) => d.dispose());
    }
  };
}

/**
 * Fit an orthographic shadow camera tightly around a set of world points
 * as seen from the light — every texel of the map lands where shadows
 * can actually fall (the window patches and the fencers).
 */
function fitShadow(light, pts) {
  const cam = light.shadow.camera;
  const m = new THREE.Matrix4().lookAt(light.position, light.target.position, new THREE.Vector3(0, 1, 0));
  const inv = m.clone().invert();
  const v = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  pts.forEach((p) => {
    v.set(p[0], p[1], p[2]).sub(light.position).applyMatrix4(inv);
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
    minZ = Math.min(minZ, -v.z);
    maxZ = Math.max(maxZ, -v.z);
  });
  // lookAt() above orients +z away from the target; the shadow camera
  // looks down −z, so its depth range is the negated z span
  cam.left = minX - 0.5;
  cam.right = maxX + 0.5;
  cam.bottom = minY - 0.5;
  cam.top = maxY + 0.5;
  cam.near = Math.max(0.5, minZ - 2);
  cam.far = maxZ + 2;
  cam.updateProjectionMatrix();
}
