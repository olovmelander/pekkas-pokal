/**
 * Pekkas Lerskulptur — the ceramics studio.
 *
 * A Barcelona taller at golden hour, built procedurally. The lighting is
 * the point, and it follows the same hierarchy as the fencing hall:
 *
 *  - DOMINANT: the low evening sun. The back wall is a real shadow caster
 *    with an arched hole in it, so the sun only gets in THROUGH the window:
 *    the beam lands on the wheel, lays an arch of light on the floor and
 *    rim-lights the wet clay, and the rest of the room sits in warm shade.
 *    A fake volumetric shaft (an extruded window outline with a soft fade)
 *    and dust motes carry the beam through the air.
 *  - FILLS: a procedural environment map (the window, a warm room, a pendant
 *    bulb) for image-based light and reflections, a cool hemisphere and a
 *    front fill so nothing goes dead.
 *  - ACCENTS: the pendant lamp over the wheel, the kiln when it fires.
 *
 * Static props are merged per material with their colours baked into vertex
 * colours, so the whole room is a handful of draw calls.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------------------------------------------------------------- helpers */

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

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Collects geometries with a baked colour and merges them into one mesh.
 * Every built-in geometry is indexed, so they merge without conversion.
 */
class Batch {
  constructor() {
    this.parts = [];
  }

  add(geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    _e.set(r[0], r[1], r[2]);
    _q.setFromEuler(_e);
    _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    geo.applyMatrix4(_m);
    const c = new THREE.Color(color);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(geo);
    return geo;
  }

  /** Like add(), but transforms by an existing matrix (for nested groups). */
  addMatrix(geo, color, matrix) {
    geo.applyMatrix4(matrix);
    return this.add(geo, color);
  }

  mesh(material) {
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((g) => g.dispose());
    this.parts = [];
    return new THREE.Mesh(merged, material);
  }
}

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')];
}

function canvasTex(cv, srgb = true) {
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* --------------------------------------------------------------- textures */

/** Terracotta floor tiles: grout, per-tile tone, wear and old slip stains. */
function tileTexture() {
  const size = 512;
  const [cv, ctx] = canvas(size, size);
  const rand = mulberry(41);
  ctx.fillStyle = '#5b3a28';
  ctx.fillRect(0, 0, size, size);
  const tiles = 4;
  const t = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const v = 0.82 + rand() * 0.3;
      ctx.fillStyle = `rgb(${Math.round(166 * v)},${Math.round(92 * v)},${Math.round(58 * v)})`;
      ctx.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
      const g = ctx.createRadialGradient(
        x * t + t * (0.3 + rand() * 0.4), y * t + t * (0.3 + rand() * 0.4), 4,
        x * t + t / 2, y * t + t / 2, t * 0.8
      );
      g.addColorStop(0, 'rgba(255,214,170,0.14)');
      g.addColorStop(1, 'rgba(50,24,12,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
    }
  }
  // Fine mottling so the tiles are not plastic
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(40,18,8,0.08)' : 'rgba(255,220,180,0.06)';
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 3, 1 + rand() * 3);
  }
  // Dried slip stains — this floor has seen a lot of throwing
  for (let i = 0; i < 9; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 20 + rand() * 40);
    g.addColorStop(0, 'rgba(200,150,110,0.22)');
    g.addColorStop(1, 'rgba(200,150,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = canvasTex(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4.5);
  tex.anisotropy = 8;
  return tex;
}

/** Warm lime plaster, mottled so the shade has form. */
function plasterTexture() {
  const size = 256;
  const [cv, ctx] = canvas(size, size);
  const rand = mulberry(17);
  ctx.fillStyle = '#dcc09a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 6 + rand() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() < 0.5;
    g.addColorStop(0, light ? 'rgba(255,236,206,0.07)' : 'rgba(120,80,50,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    // draw the blob at all wrapped offsets so the texture tiles
    [-size, 0, size].forEach((ox) => [-size, 0, size].forEach((oy) => {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }));
  }
  const tex = canvasTex(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Barcelona at sunset, seen through the arched window: a warm sky, hazy
 * Sagrada Família spires with their cranes, Torre Glòries, Montjuïc, flat
 * roofs with water tanks and chimneys — and swifts.
 */
function barcelonaTexture() {
  const w = 512;
  const h = 640;
  const [cv, ctx] = canvas(w, h);
  const rand = mulberry(9);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#f3b77a');
  sky.addColorStop(0.42, '#ffcf8f');
  sky.addColorStop(0.66, '#ffb06a');
  sky.addColorStop(1, '#e58450');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // The low sun, a big soft bloom around a hot core
  const sx = w * 0.58;
  const sy = h * 0.6;
  let g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 230);
  g.addColorStop(0, 'rgba(255,250,232,1)');
  g.addColorStop(0.08, 'rgba(255,240,200,0.95)');
  g.addColorStop(0.35, 'rgba(255,214,150,0.35)');
  g.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Thin evening cloud bands
  for (let i = 0; i < 5; i++) {
    const y = h * (0.18 + i * 0.07 + rand() * 0.03);
    g = ctx.createLinearGradient(0, y - 6, 0, y + 6);
    g.addColorStop(0, 'rgba(255,170,130,0)');
    g.addColorStop(0.5, 'rgba(236,140,120,0.35)');
    g.addColorStop(1, 'rgba(255,170,130,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rand() * w * 0.4 - 60, y - 6, w * (0.5 + rand() * 0.6), 12);
  }

  const base = h * 0.74;
  // Montjuïc, far and hazy
  ctx.fillStyle = 'rgba(186,104,92,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, base);
  ctx.quadraticCurveTo(w * 0.16, base - 70, w * 0.36, base - 20);
  ctx.lineTo(w * 0.36, base);
  ctx.fill();

  // Sagrada Família: four bell towers with bulbous tips, plus cranes
  ctx.fillStyle = 'rgba(150,78,72,0.82)';
  [0.2, 0.25, 0.3, 0.35].forEach((fx, i) => {
    const bx = w * fx;
    const th = 210 + (i === 1 || i === 2 ? 40 : 0);
    ctx.beginPath();
    ctx.moveTo(bx - 13, base);
    ctx.lineTo(bx - 8, base - th * 0.75);
    ctx.quadraticCurveTo(bx, base - th * 1.05, bx + 8, base - th * 0.75);
    ctx.lineTo(bx + 13, base);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, base - th * 1.0, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillRect(w * 0.18, base - 90, w * 0.2, 90);
  ctx.strokeStyle = 'rgba(150,78,72,0.8)';
  ctx.lineWidth = 2;
  [[0.15, 300], [0.41, 260]].forEach(([fx, ch]) => {
    const cx = w * fx;
    ctx.beginPath();
    ctx.moveTo(cx, base);
    ctx.lineTo(cx, base - ch);
    ctx.moveTo(cx - 40, base - ch + 8);
    ctx.lineTo(cx + 70, base - ch + 8);
    ctx.stroke();
  });

  // Torre Glòries — the bullet
  ctx.fillStyle = 'rgba(160,86,80,0.8)';
  const gx = w * 0.82;
  ctx.beginPath();
  ctx.moveTo(gx - 20, base);
  ctx.lineTo(gx - 20, base - 120);
  ctx.quadraticCurveTo(gx - 18, base - 182, gx, base - 186);
  ctx.quadraticCurveTo(gx + 18, base - 182, gx + 20, base - 120);
  ctx.lineTo(gx + 20, base);
  ctx.fill();

  // Near rooftops: flat roofs, water tanks, chimneys, a palm
  ctx.fillStyle = '#7a3f2c';
  let x = -10;
  while (x < w) {
    const bw = 40 + rand() * 60;
    const bh = 40 + rand() * 70;
    ctx.fillRect(x, h - (h - base) - bh + 50, bw, h);
    if (rand() < 0.5) ctx.fillRect(x + bw * 0.2, base - bh + 50 - 14, bw * 0.18, 14);
    if (rand() < 0.4) {
      ctx.beginPath();
      ctx.ellipse(x + bw * 0.65, base - bh + 50 - 10, 10, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    x += bw + 2;
  }
  ctx.fillStyle = '#5e2e20';
  ctx.fillRect(0, h - 70, w, 70);
  // Palm
  ctx.strokeStyle = '#4d2519';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w * 0.7, h);
  ctx.quadraticCurveTo(w * 0.72, h - 120, w * 0.69, h - 210);
  ctx.stroke();
  ctx.lineWidth = 5;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.95 + (i / 6) * Math.PI * 0.9;
    ctx.beginPath();
    ctx.moveTo(w * 0.69, h - 210);
    ctx.quadraticCurveTo(
      w * 0.69 + Math.cos(a) * 40, h - 210 + Math.sin(a) * 30 - 10,
      w * 0.69 + Math.cos(a) * 70, h - 210 + Math.sin(a) * 30 + 34
    );
    ctx.stroke();
  }
  // Swifts
  ctx.strokeStyle = 'rgba(60,30,26,0.75)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const bx = w * (0.15 + rand() * 0.7);
    const by = h * (0.12 + rand() * 0.3);
    ctx.beginPath();
    ctx.moveTo(bx - 7, by - 3);
    ctx.quadraticCurveTo(bx - 2, by - 1, bx, by + 1);
    ctx.quadraticCurveTo(bx + 2, by - 1, bx + 7, by - 3);
    ctx.stroke();
  }
  return canvasTex(cv);
}

/** Firebrick for the kiln chamber — also its emissive map when it glows. */
function brickTexture() {
  const [cv, ctx] = canvas(128, 128);
  const rand = mulberry(5);
  ctx.fillStyle = '#6d5a48';
  ctx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    const off = (row % 2) * 16;
    for (let c = -1; c < 4; c++) {
      const v = 0.85 + rand() * 0.2;
      ctx.fillStyle = `rgb(${Math.round(236 * v)},${Math.round(214 * v)},${Math.round(180 * v)})`;
      ctx.fillRect(c * 32 + off + 1, row * 16 + 1, 30, 14);
    }
  }
  const tex = canvasTex(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/**
 * The wheel head's top: machined rings, three bat pins, smears of slip.
 * The blurred twin is the same disc smeared around its centre — what the
 * eye sees when the head spins at throwing speed.
 */
function wheelTopTextures() {
  const s = 256;
  const [cv, ctx] = canvas(s, s);
  const c = s / 2;
  ctx.fillStyle = '#5a5960';
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  for (let r = 8; r < c; r += 5) {
    ctx.strokeStyle = r % 10 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#1c1b20';
  [0, 1, 2].forEach((i) => {
    const a = (i / 3) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * c * 0.78, c + Math.sin(a) * c * 0.78, 7, 0, Math.PI * 2);
    ctx.fill();
  });
  const rand = mulberry(3);
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const r = c * (0.35 + rand() * 0.6);
    ctx.fillStyle = `rgba(${150 + rand() * 30},${90 + rand() * 20},${60},${0.5 + rand() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, 4 + rand() * 12, 3 + rand() * 5, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const sharp = canvasTex(cv);
  const [bcv, bctx] = canvas(s, s);
  bctx.globalAlpha = 1 / 24;
  for (let i = 0; i < 48; i++) {
    bctx.save();
    bctx.translate(c, c);
    bctx.rotate((i / 48) * Math.PI * 2);
    bctx.drawImage(cv, -c, -c);
    bctx.restore();
  }
  return { sharp, blurred: canvasTex(bcv) };
}

/** The kiln controller's red LED readout, redrawn as the temperature climbs. */
function ledDisplay() {
  const [cv, ctx] = canvas(128, 48);
  const tex = canvasTex(cv);
  let last = '';
  const draw = (txt) => {
    if (txt === last) return;
    last = txt;
    ctx.fillStyle = '#120706';
    ctx.fillRect(0, 0, 128, 48);
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,60,30,0.25)';
    ctx.fillText('8888', 120, 26);
    ctx.fillStyle = '#ff4a2a';
    ctx.fillText(txt, 120, 26);
    tex.needsUpdate = true;
  };
  draw('  20');
  return { tex, draw };
}

/** Soft round sprite for points (motes, droplets, embers). */
export function dotTexture() {
  const [cv, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTex(cv);
}

/* ----------------------------------------------------------- environment */

/**
 * The scene PMREM bakes into the environment map: a dim warm room, the
 * sunset window blazing at back-left with the sun in it, the pendant bulb
 * overhead and a faint cool skylight. Wet clay and glossy glaze reflect
 * exactly the light the studio is lit by.
 */
export function buildEnvScene(win) {
  const s = new THREE.Scene();
  const basic = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(17, 9, 15), new THREE.MeshBasicMaterial({ color: 0x2c1d14, side: THREE.BackSide }));
  room.position.set(0, 3.5, 0);
  s.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(17, 15), basic(0x4a2a1a));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.9;
  s.add(floor);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), basic(new THREE.Color(5.0, 3.1, 1.6)));
  pane.position.set(win.x, win.y - 1.4, -7.4);
  s.add(pane);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), basic(new THREE.Color(30, 22, 12)));
  sun.position.set(win.x + 0.2, win.y - 1.7, -7.35);
  s.add(sun);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), basic(new THREE.Color(9, 6, 3.2)));
  bulb.position.set(0.3, 3.6, -0.5);
  s.add(bulb);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), basic(new THREE.Color(0.32, 0.4, 0.55)));
  sky.rotation.x = Math.PI / 2;
  sky.position.set(0, 7.9, 0);
  s.add(sky);
  // The lit room behind the camera, so fronts are not pitch black in reflections
  const front = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), basic(new THREE.Color(0.5, 0.36, 0.25)));
  front.position.set(0, 2.5, 7.4);
  s.add(front);
  return s;
}

export function disposeScene(s) {
  s.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
}

/* ------------------------------------------------------------------ pots */

/** One lathe profile for a shelf pot, in unit height. */
function potProfile(rand, kind) {
  const pts = [];
  if (kind === 'bowl') {
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      pts.push(new THREE.Vector2(0.2 + 0.5 * Math.sin(u * Math.PI * 0.5) ** 0.8, u * 0.45));
    }
    return pts;
  }
  const belly = 0.28 + rand() * 0.3;
  const neck = 0.1 + rand() * 0.16;
  const lip = neck + 0.05 + rand() * 0.14;
  const bellyAt = 0.3 + rand() * 0.25;
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    let r;
    if (u < bellyAt) r = 0.12 + (belly - 0.12) * Math.sin((u / bellyAt) * Math.PI * 0.5);
    else if (u < 0.82) {
      const k = (u - bellyAt) / (0.82 - bellyAt);
      r = belly + (neck - belly) * k * k * (3 - 2 * k);
    } else {
      const k = (u - 0.82) / 0.18;
      r = neck + (lip - neck) * k;
    }
    pts.push(new THREE.Vector2(Math.max(0.06, r), u));
  }
  return pts;
}

const GLAZES = [0x2f5f8e, 0x8e5a3f, 0x6f9a6a, 0xc9952a, 0x8a4a5c, 0xe2d8c6, 0x3e4f86, 0x1f6f6a];

/** Fired pots for one shelf unit, added to a glossy batch. */
function addShelfPots(batch, rand, count, spanX, shelfYs, matrix) {
  for (let i = 0; i < count; i++) {
    const kind = rand() < 0.25 ? 'bowl' : 'pot';
    const h = 0.32 + rand() * 0.3;
    const lathe = new THREE.LatheGeometry(potProfile(rand, kind), 16);
    lathe.scale(h, h, h);
    const y = shelfYs[i % shelfYs.length];
    lathe.translate(-spanX / 2 + (i / (count - 1)) * spanX + (rand() - 0.5) * 0.1, y, (rand() - 0.5) * 0.2);
    const c = new THREE.Color(GLAZES[Math.floor(rand() * GLAZES.length)]);
    c.offsetHSL(0, 0, (rand() - 0.5) * 0.08);
    batch.addMatrix(lathe, c, matrix);
  }
}

/* ------------------------------------------------------------- the studio */

const WIN = { x: -4.2, y: 3.6, half: 1.2, sill: 1.6 }; // spring line y, half width

/** Arched window outline (counter-clockwise), in wall coordinates. */
function windowOutline(seg = 12) {
  const pts = [
    new THREE.Vector2(WIN.x - WIN.half, WIN.sill),
    new THREE.Vector2(WIN.x + WIN.half, WIN.sill)
  ];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    pts.push(new THREE.Vector2(WIN.x + Math.cos(a) * WIN.half, WIN.y + Math.sin(a) * WIN.half));
  }
  return pts;
}

/**
 * The volumetric shaft: the window outline extruded along the sun's
 * direction. A tiny shader fades it in from the glass, out toward the
 * wheel and softly at the edges, with faint streaks for god-rays.
 */
function buildShaft(sunDir, length) {
  const outline = windowOutline(10);
  const n = outline.length;
  const pos = [];
  const uv = [];
  const idx = [];
  const end = sunDir.clone().multiplyScalar(length);
  for (let i = 0; i <= n; i++) {
    const p = outline[i % n];
    const u = i / n;
    pos.push(p.x, p.y, -5.5, p.x + end.x, p.y + end.y, -5.5 + end.z);
    uv.push(u, 0, u, 1);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.72, 0.42) }, uStrength: { value: 0.12 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float along = smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - vUv.y, 1.6);
        float streak = 0.75 + 0.25 * sin(vUv.x * 70.0 + uTime * 0.3) * sin(vUv.x * 23.0 - uTime * 0.17);
        gl_FragColor = vec4(uColor * along * streak * uStrength, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  return mesh;
}

function wallWithWindow(plaster) {
  const shape = new THREE.Shape();
  shape.moveTo(-8.5, 0);
  shape.lineTo(8.5, 0);
  shape.lineTo(8.5, 8);
  shape.lineTo(-8.5, 8);
  shape.lineTo(-8.5, 0);
  const hole = new THREE.Path();
  const outline = windowOutline(20);
  hole.moveTo(outline[0].x, outline[0].y);
  for (let i = 1; i < outline.length; i++) hole.lineTo(outline[i].x, outline[i].y);
  hole.lineTo(outline[0].x, outline[0].y);
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape, 8);
  // ShapeGeometry UVs are in world units; scale them for the plaster tile
  const { uv } = geo.attributes;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3.2, uv.getY(i) / 3.2);
  const wall = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 }));
  wall.position.z = -5.5;
  wall.castShadow = true;
  wall.receiveShadow = true;
  return wall;
}

/** Window reveal, frame, muntins painted on and the deep display sill. */
function addWindowFrame(wood) {
  const fz = -5.47;
  // Arch frame
  const arch = new THREE.TorusGeometry(WIN.half + 0.05, 0.07, 6, 24, Math.PI);
  wood.add(arch, 0x4a2e1c, [WIN.x, WIN.y, fz]);
  [-1, 1].forEach((s) => {
    wood.add(new THREE.BoxGeometry(0.14, WIN.y - WIN.sill, 0.14), 0x4a2e1c, [WIN.x + s * (WIN.half + 0.05), (WIN.y + WIN.sill) / 2, fz]);
  });
  // Mullion and transom — thin, so their shadows are gentle lines
  wood.add(new THREE.BoxGeometry(0.06, WIN.y + WIN.half - WIN.sill, 0.06), 0x3a2417, [WIN.x, (WIN.y + WIN.half + WIN.sill) / 2, fz]);
  wood.add(new THREE.BoxGeometry(WIN.half * 2, 0.06, 0.06), 0x3a2417, [WIN.x, WIN.y, fz]);
  // Deep display sill — the pieces of the evening end up here
  wood.add(new THREE.BoxGeometry(WIN.half * 2 + 0.5, 0.1, 0.62), 0x5c3a22, [WIN.x, WIN.sill - 0.05, -5.2]);
  wood.add(new THREE.BoxGeometry(WIN.half * 2 + 0.3, 0.16, 0.1), 0x4a2e1c, [WIN.x, WIN.sill - 0.16, -4.92]);
}

function addShelfUnit(wood, gloss, x, z, ry, seed) {
  const unit = new THREE.Object3D();
  unit.position.set(x, 0, z);
  unit.rotation.y = ry;
  unit.updateMatrixWorld();
  const m = unit.matrixWorld;
  [0.6, 1.45, 2.3, 3.1].forEach((y) => {
    wood.addMatrix(new THREE.BoxGeometry(3.0, 0.08, 0.7), 0x6b4526, new THREE.Matrix4().makeTranslation(0, y, 0).premultiply(m));
  });
  [-1.45, 1.45].forEach((px) => {
    wood.addMatrix(new THREE.BoxGeometry(0.1, 3.2, 0.66), 0x5a3a20, new THREE.Matrix4().makeTranslation(px, 1.6, 0).premultiply(m));
  });
  addShelfPots(gloss, mulberry(seed), 12, 2.6, [0.64, 1.49, 2.34, 3.14], m);
}

function addKeramikern(props) {
  const guy = new THREE.Group();
  const body = new Batch();
  // Legs, shoes, trousers
  [-0.13, 0.13].forEach((x) => {
    body.add(new THREE.CylinderGeometry(0.1, 0.09, 0.82, 8), 0x2f3440, [x, 0.45, 0]);
    body.add(new THREE.BoxGeometry(0.15, 0.08, 0.28), 0x2a1d16, [x, 0.04, 0.05]);
  });
  // Torso: shirt, then the clay-streaked apron over it
  body.add(new THREE.CylinderGeometry(0.25, 0.23, 0.75, 10), 0xe7dfd0, [0, 1.25, 0]);
  body.add(new THREE.CylinderGeometry(0.262, 0.27, 0.95, 10, 1, true, -1.1, 2.2), 0x3a5570, [0, 1.15, 0]);
  body.add(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe7dfd0, [0, 1.6, 0]);
  body.add(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 8), 0xd9a47c, [0, 1.72, 0]);
  const bodyMesh = body.mesh(props);
  bodyMesh.castShadow = true;
  guy.add(bodyMesh);

  const head = new THREE.Group();
  const hb = new Batch();
  hb.add(new THREE.SphereGeometry(0.2, 14, 10), 0xd9a47c, [0, 0, 0], [0, 0, 0], [1, 1.08, 1]);
  hb.add(new THREE.SphereGeometry(0.045, 8, 6), 0xc98f68, [0, -0.01, 0.2]);
  hb.add(new THREE.SphereGeometry(0.16, 10, 8), 0xb9b4ae, [0, -0.12, 0.07], [0, 0, 0], [1, 0.85, 0.8]);
  hb.add(new THREE.CylinderGeometry(0.24, 0.2, 0.08, 14), 0x22222a, [0.02, 0.17, -0.02], [0.12, 0, -0.18]);
  hb.add(new THREE.SphereGeometry(0.03, 6, 4), 0x22222a, [0.02, 0.23, -0.02]);
  [-0.075, 0.075].forEach((x) => {
    hb.add(new THREE.TorusGeometry(0.045, 0.008, 4, 12), 0x1d1b1a, [x, 0.03, 0.19]);
  });
  const headMesh = hb.mesh(props);
  head.add(headMesh);
  head.position.y = 1.98;
  guy.add(head);

  // Arms pivot at the shoulder so he can gesture
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.3, 1.58, 0);
    const ab = new Batch();
    ab.add(new THREE.CapsuleGeometry(0.065, 0.36, 4, 8), 0xe7dfd0, [0, -0.22, 0]);
    ab.add(new THREE.CapsuleGeometry(0.055, 0.3, 4, 8), 0xd9a47c, [0, -0.6, 0.0]);
    ab.add(new THREE.SphereGeometry(0.07, 8, 6), 0xd9a47c, [0, -0.8, 0]);
    const arm = ab.mesh(props);
    arm.castShadow = true;
    pivot.add(arm);
    pivot.rotation.z = s * 0.08;
    guy.add(pivot);
    return pivot;
  });
  return { guy, head, armL: arms[0], armR: arms[1] };
}

/**
 * The kiln, front-loading, with a hinged door, a firebrick chamber that
 * glows, seams and a spy hole that leak light, a flue for the embers and
 * a controller whose LED counts the temperature up.
 */
function buildKiln(metal) {
  const g = new THREE.Group();
  const steel = new Batch();
  [-0.62, 0.62].forEach((x) => [-0.52, 0.52].forEach((z) => {
    steel.add(new THREE.BoxGeometry(0.07, 0.35, 0.07), 0x2b2a2e, [x, 0.175, z]);
  }));
  steel.add(new THREE.BoxGeometry(0.3, 1.6, 1.4), 0x46454b, [-0.6, 1.15, 0]);
  steel.add(new THREE.BoxGeometry(0.3, 1.6, 1.4), 0x46454b, [0.6, 1.15, 0]);
  steel.add(new THREE.BoxGeometry(0.9, 0.28, 1.4), 0x46454b, [0, 1.81, 0]);
  steel.add(new THREE.BoxGeometry(0.9, 0.27, 1.4), 0x46454b, [0, 0.485, 0]);
  steel.add(new THREE.BoxGeometry(0.9, 1.05, 0.2), 0x46454b, [0, 1.15, -0.6]);
  [0.52, 1.15, 1.78].forEach((y) => {
    steel.add(new THREE.BoxGeometry(1.55, 0.05, 1.45), 0x6a6970, [0, y, 0]);
  });
  // Flue pipe and hood
  steel.add(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 10), 0x3a393e, [0.3, 2.7, -0.3]);
  steel.add(new THREE.CylinderGeometry(0.16, 0.2, 0.14, 10), 0x55545a, [0.3, 2.0, -0.3]);
  // Controller box on the right pillar
  steel.add(new THREE.BoxGeometry(0.3, 0.42, 0.08), 0x1e1d22, [0.6, 1.45, 0.73]);
  const body = steel.mesh(metal);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const brick = brickTexture();
  const chamberMat = new THREE.MeshStandardMaterial({
    map: brick,
    emissiveMap: brick,
    emissive: 0xff6a1e,
    emissiveIntensity: 0.05,
    roughness: 0.95,
    side: THREE.BackSide
  });
  const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 1.2), chamberMat);
  chamber.position.set(0, 1.145, 0.1);
  g.add(chamber);

  // The door, hinged on its left edge
  const hinge = new THREE.Group();
  hinge.position.set(-0.5, 1.15, 0.72);
  const db = new Batch();
  db.add(new THREE.BoxGeometry(1.04, 1.18, 0.13), 0x4f4e55, [0.52, 0, 0]);
  db.add(new THREE.BoxGeometry(0.9, 1.02, 0.03), 0xd8c6a6, [0.52, 0, -0.075]);
  db.add(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 6), 0x9a9aa2, [0.95, 0, 0.12]);
  db.add(new THREE.BoxGeometry(0.04, 0.04, 0.1), 0x9a9aa2, [0.95, 0.13, 0.08]);
  db.add(new THREE.BoxGeometry(0.04, 0.04, 0.1), 0x9a9aa2, [0.95, -0.13, 0.08]);
  const door = db.mesh(metal);
  door.castShadow = true;
  hinge.add(door);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const spy = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), glowMat);
  spy.position.set(0.52, 0.18, 0.068);
  hinge.add(spy);
  g.add(hinge);
  // Seams that leak light around the closed door
  const seams = new Batch();
  seams.add(new THREE.BoxGeometry(1.06, 0.025, 0.02), 0xffffff, [0, 1.75, 0.705]);
  seams.add(new THREE.BoxGeometry(1.06, 0.025, 0.02), 0xffffff, [0, 0.555, 0.705]);
  seams.add(new THREE.BoxGeometry(0.025, 1.2, 0.02), 0xffffff, [0.535, 1.15, 0.705]);
  const seamMesh = seams.mesh(glowMat);
  g.add(seamMesh);

  const led = ledDisplay();
  const ledMat = new THREE.MeshBasicMaterial({ map: led.tex, toneMapped: false });
  const ledPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.083), ledMat);
  ledPlane.position.set(0.6, 1.53, 0.775);
  g.add(ledPlane);

  return { group: g, hinge, chamberMat, glowMat, led, flue: new THREE.Vector3(0.3, 3.45, -0.3) };
}

export function buildStudio() {
  const g = new THREE.Group();
  const props = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 });
  const gloss = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2 });
  const wood = new Batch();
  const steel = new Batch();
  const glossy = new Batch();

  /* Floor */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 18),
    new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.72 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 3.5;
  floor.receiveShadow = true;
  g.add(floor);

  /* Walls — the back one with the window hole is the sun's gate */
  const plaster = plasterTexture();
  g.add(wallWithWindow(plaster));
  const sideMat = new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 });
  [-1, 1].forEach((s) => {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), sideMat);
    side.position.set(s * 8.5, 4, 2.5);
    side.rotation.y = -s * Math.PI / 2;
    side.castShadow = true;
    side.receiveShadow = true;
    g.add(side);
  });
  // A painted skirting band at the bottom of the walls
  wood.add(new THREE.BoxGeometry(17, 0.22, 0.04), 0x6e4a32, [0, 0.11, -5.47]);

  /* Barcelona outside, behind the hole */
  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 5.0),
    new THREE.MeshBasicMaterial({ map: barcelonaTexture(), color: new THREE.Color(1.6, 1.45, 1.3), fog: false })
  );
  outside.position.set(WIN.x + 0.2, 3.3, -6.6);
  g.add(outside);
  addWindowFrame(wood);

  /* Shelves with fired pots, framing the room */
  addShelfUnit(wood, glossy, -7.3, -2.6, 1.1, 7);
  addShelfUnit(wood, glossy, 6.6, -4.4, -0.38, 20);

  /* Tool rack on the back wall: ribs, wire, needle tool, sponges */
  wood.add(new THREE.BoxGeometry(2.0, 0.42, 0.06), 0x6b4526, [1.2, 2.5, -5.44]);
  const TOOLS = [0xd8cfc0, 0x8a6a52, 0x4a5c6e, 0xd9b23a, 0x7a4a3c, 0xb8b3a8];
  for (let i = 0; i < 6; i++) {
    const tx = 0.45 + i * 0.3;
    steel.add(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 5), 0x8a8a90, [tx, 2.6, -5.38], [Math.PI / 2, 0, 0]);
    wood.add(new THREE.BoxGeometry(0.07 + (i % 2) * 0.05, 0.26 + (i % 3) * 0.08, 0.03), TOOLS[i], [tx, 2.42 - (i % 3) * 0.04, -5.36]);
  }

  /* Wedging table with a wrapped lump, left of the wheel */
  wood.add(new THREE.BoxGeometry(1.8, 0.12, 1.0), 0x7a5232, [-4.6, 0.95, -1.9], [0, 0.35, 0]);
  [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]].forEach(([lx, lz]) => {
    const c = Math.cos(0.35);
    const s = Math.sin(0.35);
    wood.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), 0x5a3a20, [-4.6 + lx * c + lz * s, 0.45, -1.9 - lx * s + lz * c]);
  });
  wood.add(new THREE.SphereGeometry(0.32, 12, 8), 0xa45f3a, [-4.4, 1.13, -1.85], [0, 0, 0], [1.2, 0.6, 1]);
  wood.add(new THREE.BoxGeometry(0.5, 0.3, 0.35), 0x6f6a5e, [-5.1, 1.16, -2.0], [0, 0.5, 0]);

  /* Bagged clay against the wall, water bucket by the wheel */
  [[-1.9, 0.18, -4.9, 0.1], [-1.9, 0.5, -4.85, -0.2], [-1.3, 0.18, -5.0, 0.5]].forEach(([bx, by, bz, ry]) => {
    wood.add(new THREE.BoxGeometry(0.7, 0.32, 0.42), 0x6f6a5e, [bx, by, bz], [0, ry, 0]);
  });
  steel.add(new THREE.CylinderGeometry(0.24, 0.19, 0.38, 14, 1, true), 0x5c6670, [-1.75, 0.19, 1.0]);
  steel.add(new THREE.CircleGeometry(0.19, 14), 0x5c6670, [-1.75, 0.005, 1.0], [-Math.PI / 2, 0, 0]);
  glossy.add(new THREE.CircleGeometry(0.22, 14), 0x6e5a40, [-1.75, 0.3, 1.0], [-Math.PI / 2, 0, 0]);

  /* The reveal stand: a stool with a banding wheel, by the kiln */
  const reveal = new THREE.Vector3(2.55, 1.05, -0.75);
  wood.add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 18), 0x7a5232, [reveal.x, 0.92, reveal.z]);
  [0, 1, 2].forEach((i) => {
    const a = (i / 3) * Math.PI * 2;
    wood.add(new THREE.CylinderGeometry(0.035, 0.045, 0.92, 6), 0x5a3a20,
      [reveal.x + Math.cos(a) * 0.28, 0.46, reveal.z + Math.sin(a) * 0.28],
      [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]);
  });
  steel.add(new THREE.CylinderGeometry(0.08, 0.1, 0.06, 10), 0x3a393e, [reveal.x, 0.99, reveal.z]);
  const banding = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.035, 28), metal);
  banding.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(banding.geometry.attributes.position.count * 3).fill(0.5), 3));
  banding.position.set(reveal.x, 1.035, reveal.z);
  banding.castShadow = true;
  g.add(banding);

  /* The kiln */
  const kiln = buildKiln(metal);
  kiln.group.position.set(4.5, 0, -2.6);
  kiln.group.rotation.y = -0.55;
  g.add(kiln.group);

  /* Keramikern beside the reveal stand */
  const judge = addKeramikern(props);
  judge.guy.position.set(3.55, 0, 0.1);
  judge.guy.rotation.y = -0.9;
  g.add(judge.guy);

  /* Pendant lamp over the wheel: enamel shade, warm bulb */
  const lamp = new THREE.Group();
  const shadeBatch = new Batch();
  shadeBatch.add(new THREE.CylinderGeometry(0.08, 0.42, 0.34, 20, 1, true), 0x1f3d34, [0, 0, 0]);
  shadeBatch.add(new THREE.CylinderGeometry(0.008, 0.008, 4.2, 4), 0x111111, [0, 2.25, 0]);
  shadeBatch.add(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10), 0x1a1a1a, [0, 0.19, 0]);
  const shadeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide });
  lamp.add(shadeBatch.mesh(shadeMat));
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 3.0, 1.7) })
  );
  bulb.position.y = -0.1;
  lamp.add(bulb);
  lamp.position.set(0.35, 4.35, -0.7);
  g.add(lamp);

  /* Merge the batches */
  const woodMesh = wood.mesh(props);
  woodMesh.castShadow = true;
  woodMesh.receiveShadow = true;
  g.add(woodMesh);
  const steelMesh = steel.mesh(metal);
  steelMesh.castShadow = true;
  steelMesh.receiveShadow = true;
  g.add(steelMesh);
  const glossMesh = glossy.mesh(gloss);
  glossMesh.castShadow = true;
  g.add(glossMesh);

  /* Sun direction: from the window centre onto the wheel */
  const sunDir = new THREE.Vector3(-WIN.x, -1.35, 5.5).normalize();
  const shaft = buildShaft(sunDir, 6.2);
  g.add(shaft);

  /* Dust motes riding the beam */
  const moteCount = 220;
  const motePos = new Float32Array(moteCount * 3);
  const rand = mulberry(23);
  for (let i = 0; i < moteCount; i++) {
    const t = rand() * 5.8;
    const a = rand() * Math.PI;
    const rr = Math.sqrt(rand());
    const px = WIN.x + (rand() * 2 - 1) * WIN.half * 0.95;
    const py = rand() < 0.75 ? WIN.sill + rand() * (WIN.y - WIN.sill) : WIN.y + Math.sin(a) * WIN.half * rr;
    motePos[i * 3] = px + sunDir.x * t;
    motePos[i * 3 + 1] = py + sunDir.y * t;
    motePos[i * 3 + 2] = -5.5 + sunDir.z * t;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xffe0b0,
    size: 0.035,
    map: dotTexture(),
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  g.add(motes);

  /* Display spots on the window sill, left to right */
  const sill = [-0.93, -0.31, 0.31, 0.93].map((dx) => new THREE.Vector3(WIN.x + dx, WIN.sill, -5.18));

  return {
    group: g,
    sunDir,
    window: WIN,
    shaft,
    motes,
    kiln,
    judge,
    reveal,
    banding,
    sill,
    lampPos: lamp.position.clone().add(new THREE.Vector3(0, -0.12, 0))
  };
}

/* ------------------------------------------------------------- the wheel */

export function buildWheel() {
  const g = new THREE.Group();
  const body = new Batch();
  // Cabinet: a rounded lathe tub, enamel blue-grey like a studio workhorse
  const tub = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    tub.push(new THREE.Vector2(1.0 - 0.14 * u * u, u * 0.5));
  }
  body.add(new THREE.LatheGeometry(tub, 28), 0x4b5866);
  body.add(new THREE.CylinderGeometry(0.86, 0.86, 0.02, 28), 0x3a4652, [0, 0.5, 0]);
  // Splash pan: wide, with a lip
  const pan = [
    new THREE.Vector2(0.45, 0.5), new THREE.Vector2(1.08, 0.52), new THREE.Vector2(1.16, 0.6),
    new THREE.Vector2(1.18, 0.7), new THREE.Vector2(1.13, 0.71), new THREE.Vector2(1.1, 0.62)
  ];
  body.add(new THREE.LatheGeometry(pan, 36), 0x6d7a86);
  body.add(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 12), 0x2c2f35, [0, 0.62, 0]);
  // Foot pedal on its cable
  body.add(new THREE.BoxGeometry(0.34, 0.08, 0.46), 0x2c2f35, [0.95, 0.04, 1.35], [0.12, -0.4, 0]);
  // Double-sided: the lathe paths fold back on themselves (the pan's lip)
  const bodyMesh = body.mesh(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide
  }));
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  g.add(bodyMesh);

  // Slip in the pan: glossy muddy water
  const slip = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 1.12, 36),
    new THREE.MeshStandardMaterial({ color: 0x7d4f33, roughness: 0.12 })
  );
  slip.rotation.x = -Math.PI / 2;
  slip.position.y = 0.58;
  slip.receiveShadow = true;
  g.add(slip);

  // The head — this is the part that visibly spins
  const head = new THREE.Group();
  head.position.y = 0.68;
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.92, 0.95, 0.1, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x5f5e66, roughness: 0.32, metalness: 0.8 })
  );
  rim.castShadow = true;
  head.add(rim);
  const tops = wheelTopTextures();
  const topGeo = new THREE.CircleGeometry(0.92, 40);
  topGeo.rotateX(-Math.PI / 2);
  const topSharp = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: tops.sharp, roughness: 0.4, metalness: 0.6 }));
  topSharp.position.y = 0.05;
  topSharp.receiveShadow = true;
  head.add(topSharp);
  // Motion blur: the smeared twin fades in over the sharp disc with speed
  const blurMat = new THREE.MeshStandardMaterial({
    map: tops.blurred, roughness: 0.4, metalness: 0.6, transparent: true, opacity: 0, depthWrite: false
  });
  const topBlur = new THREE.Mesh(topGeo, blurMat);
  topBlur.position.y = 0.0515;
  topBlur.receiveShadow = true;
  topBlur.renderOrder = 1;
  g.add(head);
  // the blurred disc does not spin — a radially smeared disc looks the same at any angle
  topBlur.position.y = 0.68 + 0.0515;
  g.add(topBlur);

  return { group: g, head, blurMat, sharpTop: topSharp, headY: 0.735 };
}

/* -------------------------------------------------------- hands and tools */

/**
 * A stylised right hand reaching in from the potter's side: palm toward the
 * camera, four fingers stacked and pointing at the clay, thumb under them,
 * forearm trailing out of frame. The fingertips wear a coat of slip. The
 * contact point (fingertip pads) is the local origin; mirror with
 * scale.x = -1 for the left side.
 */
export function buildHand() {
  const b = new Batch();
  const skin = new THREE.Color(0xd8a07a);
  const slip = new THREE.Color(0x9c5a36);
  const fingers = [
    [0.075, 0.25, 0.04],
    [0.025, 0.28, 0.045],
    [-0.025, 0.27, 0.045],
    [-0.072, 0.22, 0.04]
  ];
  fingers.forEach(([y, len, rad], i) => {
    const geo = new THREE.CapsuleGeometry(rad, len, 4, 8);
    geo.rotateZ(Math.PI / 2);
    b.add(geo, skin, [len / 2 + rad + 0.005, y * 1.15, 0.02 - i * 0.012]);
  });
  const thumb = new THREE.CapsuleGeometry(0.045, 0.18, 4, 8);
  thumb.rotateZ(Math.PI / 2 + 0.6);
  b.add(thumb, skin, [0.2, -0.15, 0.05]);
  b.add(new THREE.SphereGeometry(0.16, 12, 10), skin, [0.36, -0.01, 0], [0, 0, 0], [0.75, 1.0, 0.5]);
  // Forearm: from the wrist, down and out toward the potter
  const wrist = new THREE.Vector3(0.44, -0.07, 0.02);
  const elbow = new THREE.Vector3(1.3, -0.72, 0.55);
  const axis = elbow.clone().sub(wrist);
  const fore = new THREE.CapsuleGeometry(0.1, axis.length() - 0.1, 4, 10);
  fore.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize()));
  const mid = wrist.clone().add(elbow).multiplyScalar(0.5);
  b.add(fore, skin, [mid.x, mid.y, mid.z]);
  const mesh = b.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
  // Paint the slip coat onto the fingertips: blend by distance from the tips
  const pos = mesh.geometry.attributes.position;
  const col = mesh.geometry.attributes.color;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, Math.min(1, (0.22 - pos.getX(i)) / 0.16));
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(slip, k * 0.85);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  mesh.castShadow = true;
  return mesh;
}

/** The yellow sponge GLÄTTA works with. */
export function buildSponge() {
  const geo = new THREE.SphereGeometry(0.15, 12, 8);
  geo.scale(0.8, 1.15, 0.9);
  // Lumpy, by a function of position so seam duplicates move together
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 0.97 + 0.04 * Math.sin(x * 41) * Math.sin(y * 37 + 1) * Math.sin(z * 29 + 2);
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xe6c04a, roughness: 1 }));
  m.castShadow = true;
  return m;
}
