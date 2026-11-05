/**
 * Pekkas Måleri — the garden at Terrassvägen 47.
 *
 * A sunny Saturday afternoon in Örnsköldsvik, 7 August 2021. Easels on the
 * lawn, the hedge and the house behind, bunting between the birches, and
 * beer within reach of every painter — Per Vikman's brief said everyone
 * was expected to get through ten.
 *
 * Lighting follows the same hierarchy as the rest of the games: one warm
 * low sun casting every shadow, a cool sky fill so nothing in shade goes
 * black, and a bounce off the lawn. Outdoors the trap is flatness, so the
 * scene leans hard on that single sun direction and on aerial perspective
 * — the far spruce rank is tinted toward the haze rather than drawn in
 * more detail.
 *
 * A garden that does not move reads as a photograph of a model, so the
 * things that would move on a breezy August afternoon do: the spruces and
 * birch crowns sway, the grass leans, the bunting swings on its line and
 * ripples, swallows loop over the hedge, the clouds drift, and the sun
 * comes through a birch that stands just out of frame as moving dapples
 * on the lawn. All of it is vertex-shader work off one shared clock; none
 * of it costs a draw call.
 *
 * Draw calls are the budget a phone runs out of, so every static group —
 * the house, the trestle, the parasol and chairs, the whole field of other
 * painters' easels — is baked into a single vertex-coloured mesh at build
 * time. The forest, the hedge, the flowers, the grass, the bunting and the
 * birds are instanced. The people themselves come from the shared character
 * system (see cast.js).
 *
 * Real GPUs are less forgiving than the software renderer the game is
 * tested on, so the wind never sees the raw clock: every oscillator's phase
 * is wrapped to 0..2π on the CPU in double precision and handed over as a
 * uniform. A float time of a few thousand seconds has lost the precision a
 * sine needs, and on some GPUs the sway would start to step and shimmer
 * after the tab has been open for an hour.
 */

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
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

const lambert = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

/* ----------------------------------------------------------------- baking */

/** One material for everything baked: colour lives in the vertices. */
let bakedMaterial = null;
function vertexColourMaterial() {
  if (!bakedMaterial || bakedMaterial.userData.disposed) {
    bakedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    bakedMaterial.addEventListener('dispose', () => {
      bakedMaterial.userData.disposed = true;
    });
  }
  return bakedMaterial;
}

/**
 * Merge every mesh under `root` (except the subtrees in `skip`) into one
 * vertex-coloured mesh that replaces them. The originals' colours are read
 * off their Lambert materials, so groups are still authored the readable
 * way — one Mesh per part — and only collapsed once they are assembled.
 */
function bake(root, { skip = [], castShadow = true, receiveShadow = false, grainUv = false } = {}) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  const geos = [];
  const sources = [];
  const walk = (o) => {
    if (skip.includes(o)) return;
    if (o.isMesh && !o.isInstancedMesh) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      const g = o.geometry.clone();
      if (grainUv) grainUvs(g);
      g.applyMatrix4(rel);
      // An already-baked part keeps its vertex colours (tinted by its
      // material), so baked groups can be baked again into a bigger one
      const own = o.material.vertexColors && g.attributes.color;
      const src = own ? g.attributes.color : null;
      const c = o.material.color;
      const cols = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0, v = 0; i < cols.length; i += 3, v++) {
        cols[i] = c.r * (src ? src.getX(v) : 1);
        cols[i + 1] = c.g * (src ? src.getY(v) : 1);
        cols[i + 2] = c.b * (src ? src.getZ(v) : 1);
      }
      Object.keys(g.attributes).forEach((n) => {
        if (n !== 'position' && n !== 'normal' && !(grainUv && n === 'uv')) g.deleteAttribute(n);
      });
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geos.push(g);
      sources.push(o);
    }
    o.children.forEach(walk);
  };
  root.children.forEach(walk);
  if (!geos.length) return null;
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  sources.forEach((o) => {
    o.geometry.dispose();
    // The shared baked material outlives any one group
    if (o.material !== bakedMaterial) o.material.dispose();
  });
  root.children.filter((c) => !skip.includes(c)).forEach((c) => root.remove(c));
  const mesh = new THREE.Mesh(merged, vertexColourMaterial());
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  root.add(mesh);
  return mesh;
}

/**
 * Wood-grain UVs for a part, in metres of its own shape: u runs along the
 * part's longest side, so the grain follows a leg or a rail the way it
 * would in a sawn plank, and v across whichever face the vertex is on.
 */
function grainUvs(g) {
  g.computeBoundingBox();
  const size = g.boundingBox.getSize(new THREE.Vector3()).toArray();
  const long = size.indexOf(Math.max(...size));
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  const v = [0, 0, 0];
  const nv = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    v[0] = p.getX(i);
    v[1] = p.getY(i);
    v[2] = p.getZ(i);
    nv[0] = Math.abs(n.getX(i));
    nv[1] = Math.abs(n.getY(i));
    nv[2] = Math.abs(n.getZ(i));
    const d = nv.indexOf(Math.max(...nv));
    const along = d === long ? (long + 1) % 3 : long;
    const across = [0, 1, 2].find((k) => k !== along && k !== d);
    uv[i * 2] = v[along] * 2.2;
    uv[i * 2 + 1] = v[across] * 2.2 + d * 0.31;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Pine: fine wavy grain, pores and the odd knot, as a light multiplier. */
let grainTexture = null;
function woodGrain() {
  if (grainTexture && !grainTexture.userData.disposed) return grainTexture;
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d');
  const r = mulberry(77);
  ctx.fillStyle = '#f2f0ee';
  ctx.fillRect(0, 0, N, N);
  for (let i = 0; i < 64; i++) {
    const y0 = r() * N;
    const ph = r() * 6;
    ctx.strokeStyle = `rgba(92,58,24,${0.06 + r() * 0.14})`;
    ctx.lineWidth = 0.6 + r() * 1.8;
    ctx.beginPath();
    for (let x = -8; x <= N + 8; x += 8) {
      const y = y0 + Math.sin(x * 0.0245 + ph) * 3.2 + Math.sin(x * 0.07 + ph * 2) * 1.1;
      if (x < 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(70,40,14,0.1)';
  for (let i = 0; i < 700; i++) ctx.fillRect(r() * N, r() * N, 2 + r() * 4, 1);
  for (let i = 0; i < 2; i++) {
    const x = r() * N;
    const y = r() * N;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 7);
    g.addColorStop(0, 'rgba(80,46,16,0.55)');
    g.addColorStop(1, 'rgba(80,46,16,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  grainTexture = new THREE.CanvasTexture(cv);
  grainTexture.colorSpace = THREE.SRGBColorSpace;
  grainTexture.wrapS = THREE.RepeatWrapping;
  grainTexture.wrapT = THREE.RepeatWrapping;
  grainTexture.anisotropy = 4;
  grainTexture.addEventListener('dispose', () => {
    grainTexture.userData.disposed = true;
  });
  return grainTexture;
}

/* ------------------------------------------------------------------- wind */

const TAU = Math.PI * 2;
/** Toward the sun (index.js puts it at (−8, 13, 6) aimed at (0, 1, −2)). */
const SUN_DIR = new THREE.Vector3(-8, 12, 8).normalize();

/**
 * An oscillator whose phase is kept on the CPU: `rates` are radians per
 * second, the uniform holds each phase already wrapped to 0..2π.
 */
function phaseUniform(wind, rates) {
  const u = { value: new THREE.Vector3() };
  wind.phases.push({ u, rates });
  return u;
}

/**
 * Sway in the vertex shader. Height inside the object (`base`..`base+span`
 * in its own y) sets how much a vertex moves, the world position sets the
 * phase so neighbouring trees never move in lockstep, and the shared
 * uGust swells and settles every few seconds.
 */
function windify(material, wind, { amp, base = 0, span = 1, freq = 1, instanced = true, key }) {
  const f = (v) => v.toFixed(4);
  const phase = phaseUniform(wind, [1.2 * freq, 2.9 * freq, 0.9 * freq]);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindPh = phase;
    shader.uniforms.uGust = wind.uGust;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uWindPh;\nuniform float uGust;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wOrigin = modelMatrix * ${instanced ? 'instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)' : 'vec4(position, 1.0)'};
        float wH = clamp((position.y - ${f(base)}) / ${f(span)}, 0.0, 1.0);
        float wPh = wOrigin.x * 0.31 + wOrigin.z * 0.17;
        float wS = sin(uWindPh.x + wPh) * 0.65 + sin(uWindPh.y + wPh * 1.9) * 0.35;
        transformed.x += wS * ${f(amp)} * wH * wH * (0.55 + uGust);
        transformed.z += cos(uWindPh.z + wPh) * ${f(amp * 0.35)} * wH * wH;`);
  };
  material.customProgramCacheKey = () => `pm-wind-${key}`;
  material.userData.windy = true;
  return material;
}

/* ----------------------------------------------------------------- shapes */

/**
 * Ambient occlusion in vertex colours: darker toward the bottom of a shape
 * (local y from y0 to y1), with a little variation hashed off position so
 * neighbouring facets never match. A spruce skirt with a dark hem reads as
 * layered boughs; the same cone lit flat reads as a party hat.
 */
function shadeByHeight(geo, y0, y1, lo, hi, vary = 0.06) {
  const p = geo.attributes.position;
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 0.5;
    const v = lo + (hi - lo) * k * k * (3 - 2 * k) + n * vary;
    cols[i * 3] = v;
    cols[i * 3 + 1] = v;
    cols[i * 3 + 2] = v * 0.96;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

/** A round shape pushed in and out into lumps: a bush, a clump of leaves. */
function lumpy(radius, amount, seed) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(radius, 1));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const bump = Math.sin(v.x * 4.1 + seed) * Math.sin(v.y * 3.7 + seed * 1.7) * Math.sin(v.z * 4.6 + seed * 0.6);
    v.multiplyScalar(radius * (1 + amount * bump + amount * 0.4 * Math.sin(v.x * 9 + v.z * 7 + seed)));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A hedge bush: an icosphere pushed into leaf clumps at three scales, flat
 * where it meets the ground, with soft out-from-the-centre normals and
 * vertex colours that are dark inside and underneath and catch the light
 * on the outer leaves.
 */
function hedgeBush(seed, rough = 0.12) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const cols = new Float32Array(p.count * 3);
  const nor = new Float32Array(p.count * 3);
  const r = mulberry(seed * 977 + 13);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const big = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.6 + seed * 0.6);
    const clump = Math.sin(v.x * 8.3 + v.z * 5.1 + seed * 2.1) * Math.sin(v.y * 7.7 - v.z * 6.3 + seed);
    const leaf = r() - 0.5;
    const k = 1 + rough * big + 0.13 * clump + 0.1 * leaf;
    const y = Math.max(-0.62, v.y * k);
    p.setXYZ(i, v.x * k, y, v.z * k);
    // Light lives on the outer leaves; the inside and the underside are dark
    const out = Math.max(0, k - 1) * 4;
    const h = (y + 0.62) / 1.62;
    const c = (0.34 + 0.72 * h * h * (3 - 2 * h)) * (0.92 + out * 0.35 + leaf * 0.12);
    cols.set([c, c * 1.02, c * 0.94], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  // Half the clumps' own shading, half one soft volume (normals out from a
  // point below the centre): leafy up close, a single bush from afar
  g.computeVertexNormals();
  const gn = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ln = Math.hypot(v.x, v.y + 0.35, v.z) || 1;
    const nx = gn.getX(i) * 0.55 + (v.x / ln) * 0.45;
    const ny = gn.getY(i) * 0.55 + ((v.y + 0.35) / ln) * 0.45;
    const nz = gn.getZ(i) * 0.55 + (v.z / ln) * 0.45;
    const l = Math.hypot(nx, ny, nz) || 1;
    nor.set([nx / l, ny / l, nz / l], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

/* --------------------------------------------------------------- textures */

/** Late-summer lawn: mown bands, clover patches, daisies, a few burnt spots. */
export function lawnTexture() {
  const N = 512;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d');
  const rand = mulberry(53);
  ctx.fillStyle = '#5c7a38';
  ctx.fillRect(0, 0, N, N);
  // Mower stripes
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,220,0.06)' : 'rgba(20,40,10,0.07)';
    ctx.fillRect(0, (i * N) / 8, N, N / 8);
  }
  for (let i = 0; i < 900; i++) {
    const x = rand() * N;
    const y = rand() * N;
    const r = 2 + rand() * 9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = rand() < 0.35;
    g.addColorStop(0, warm ? 'rgba(150,150,70,0.22)' : 'rgba(90,130,50,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Individual blades, so the ground does not read as felt when the camera
  // is a metre and a half above it
  for (let i = 0; i < 2200; i++) {
    const x = rand() * N;
    const y = rand() * N;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(126,158,74,0.5)' : 'rgba(48,72,28,0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 3 - rand() * 4);
    ctx.stroke();
  }
  // Daisies and dandelions — a Norrland lawn in August is never pure green
  for (let i = 0; i < 130; i++) {
    const x = rand() * N;
    const y = rand() * N;
    const yellow = rand() < 0.4;
    ctx.fillStyle = yellow ? 'rgba(232,196,72,0.9)' : 'rgba(244,244,232,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 1.4 + rand() * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(13.7, 13.7);
  // Grass is always seen at a grazing angle; without this mipmaps eat it
  tex.anisotropy = 8;
  return tex;
}

/** The lawn's macro map covers this square of the garden (world metres). */
const MACRO = { x0: -28, z0: -32, size: 56, px: 512 };

/**
 * The lawn at garden scale, as a multiplier over the tiled grass: broad
 * mowing lanes, warmer and drier patches where the sun bakes it, lusher
 * clover drifts, a dark band of shade under the hedge, darker ground under
 * the birches, the trestle and the parasol, and a fade back to neutral at
 * the edges. `shade(spots)` adds soft contact shadow under things placed
 * later (the easels, the painters). Neutral is 85 % grey (×1.176 in the
 * shader), so the map can brighten as well as darken.
 */
function lawnMacro() {
  const N = MACRO.px;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d');
  const k = N / MACRO.size;
  const px = (x) => (x - MACRO.x0) * k;
  const pz = (z) => (z - MACRO.z0) * k;
  const blob = (x, z, r, rgba, inner = 0) => {
    const g = ctx.createRadialGradient(px(x), pz(z), r * k * inner, px(x), pz(z), r * k);
    g.addColorStop(0, rgba);
    g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(px(x) - r * k, pz(z) - r * k, r * k * 2, r * k * 2);
  };
  // A touch warmer and less saturated than the tile: August, not April
  ctx.fillStyle = 'rgb(222,217,204)';
  ctx.fillRect(0, 0, N, N);
  const r = mulberry(6061);
  // Mowing lanes run toward the hedge, alternately lighter and darker
  for (let i = 0; i < 12; i++) {
    const x = -14 + i * 2.4;
    const g = ctx.createLinearGradient(0, pz(-9), 0, pz(12));
    const a = i % 2 ? 'rgba(240,242,222,' : 'rgba(188,198,182,';
    g.addColorStop(0, `${a}0.65)`);
    g.addColorStop(0.75, `${a}0.5)`);
    g.addColorStop(1, `${a}0)`);
    ctx.fillStyle = g;
    ctx.fillRect(px(x), pz(-9.2), 2.4 * k, 21 * k);
  }
  // Sun-baked, drier patches, and lusher clover drifts
  for (let i = 0; i < 34; i++) blob(-22 + r() * 44, -20 + r() * 34, 1.2 + r() * 3.4, 'rgba(252,230,160,0.6)');
  for (let i = 0; i < 22; i++) blob(-22 + r() * 44, -20 + r() * 34, 0.8 + r() * 2.2, 'rgba(178,212,170,0.5)');
  // Shade: the hedge's foot, the birches, the trestle, the parasol
  const band = ctx.createLinearGradient(0, pz(-11.2), 0, pz(-7.6));
  band.addColorStop(0, 'rgba(120,132,112,0)');
  band.addColorStop(0.45, 'rgba(120,132,112,0.8)');
  band.addColorStop(1, 'rgba(120,132,112,0)');
  ctx.fillStyle = band;
  ctx.fillRect(px(-15), pz(-11.2), 30 * k, 3.6 * k);
  [[-8.6, -8.4, 2.6], [9.2, -8.8, 2.6], [-7.6, 4.4, 3]].forEach(([x, z, rr]) => blob(x, z, rr, 'rgba(130,140,118,0.75)'));
  blob(-2.55, -3.5, 1.3, 'rgba(120,128,110,0.6)', 0.2);
  blob(5.9, -8.6, 1.7, 'rgba(120,128,110,0.6)', 0.2);
  // The forest's edge: longer, darker grass under the trees
  const edge = ctx.createLinearGradient(0, pz(-26), 0, pz(-17));
  edge.addColorStop(0, 'rgba(110,124,104,0.9)');
  edge.addColorStop(1, 'rgba(110,124,104,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, pz(-32), N, 15 * k);
  const west = ctx.createLinearGradient(px(-27), 0, px(-18), 0);
  west.addColorStop(0, 'rgba(110,124,104,0.9)');
  west.addColorStop(1, 'rgba(110,124,104,0)');
  ctx.fillStyle = west;
  ctx.fillRect(0, 0, px(-18), N);
  // Back to neutral at the map's edge, so the tiled lawn carries on beyond
  const fade = (x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(217,217,217,1)');
    g.addColorStop(1, 'rgba(217,217,217,0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || N, Math.abs(y1 - y0) || N);
  };
  const m = N * 0.08;
  fade(0, 0, m, 0);
  fade(N, 0, N - m, 0);
  fade(0, 0, 0, m);
  fade(0, N, 0, N - m);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return {
    tex,
    /** Soft contact shade under things on the lawn: [{ x, z, r, k }]. */
    shade(spots) {
      spots.forEach(({ x, z, r: rr, k: kk = 0.55 }) => blob(x, z, rr, `rgba(96,104,90,${kk})`, 0.15));
      tex.needsUpdate = true;
    }
  };
}

/**
 * The sky, as a gradient on the inside of a dome.
 *
 * A flat scene.background is one colour everywhere, which is exactly what an
 * outdoor sky never is: the zenith is three stops darker and much bluer than
 * the horizon, and losing that gradient is most of why a procedural garden
 * reads as a diorama. The dome is unlit and unfogged — it IS the distance.
 */
export function buildSky() {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  // The dome's equator is the canvas's middle row: everything below 0.5 is
  // under the horizon and never seen, so the gradient's whole range — deep
  // zenith blue to the warm haze the fog fades into — lives in the top half
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2a62a2');
  g.addColorStop(0.16, '#4a88c0');
  g.addColorStop(0.3, '#78acd4');
  g.addColorStop(0.41, '#a7c9de');
  g.addColorStop(0.47, '#cddcdc');
  g.addColorStop(0.5, '#e4dfcc');
  g.addColorStop(0.53, '#e8dcc0');
  g.addColorStop(1, '#c9cfb4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(58, 20, 14),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  dome.renderOrder = -1;
  return dome;
}

/** One fair-weather cumulus, on a billboard. */
function cloudTexture() {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N / 2;
  const ctx = cv.getContext('2d');
  const rand = mulberry(91);
  for (let i = 0; i < 22; i++) {
    const x = 30 + rand() * (N - 60);
    const y = N * 0.34 - rand() * N * 0.16;
    const r = 16 + rand() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    // The underside of a cumulus is grey-blue, the top is nearly white
    const top = y < N * 0.24;
    g.addColorStop(0, top ? 'rgba(255,255,255,0.95)' : 'rgba(214,224,234,0.85)');
    g.addColorStop(0.55, top ? 'rgba(250,251,253,0.5)' : 'rgba(198,210,224,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // A canvas stores fully transparent pixels as BLACK, and filtering drags
  // that black into the cloud: at a distance, where a low mip is used, it
  // became a grey veil the size of the billboard across the sky. So the
  // invisible pixels get the cloud's own colour, and the pixels go up as
  // data (a canvas upload would premultiply the colour away again). Rows are
  // flipped by hand, so no driver has to flip a data upload.
  const W = cv.width;
  const H = cv.height;
  const src = ctx.getImageData(0, 0, W, H).data;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const o = ((H - 1 - y) * W + x) * 4;
      const a = src[i + 3];
      data[o] = a ? src[i] : 226;
      data[o + 1] = a ? src[i + 1] : 233;
      data[o + 2] = a ? src[i + 2] : 241;
      data[o + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(data, W, H);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The canopy of the birch that stands behind the player's left shoulder,
 * as an alpha cut-out. It is never drawn — it lives on a layer only the
 * sun's shadow camera sees — so all it contributes is dappled light on the
 * lawn. Leaf clusters thin out to the right, which is the canopy's edge.
 */
function canopyTexture() {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d');
  const rand = mulberry(1907);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, N, N);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 460; i++) {
    const x = rand() * N;
    const y = rand() * N;
    // Dense on the left, broken toward the right-hand edge of the crown
    if (rand() > 1.0 - (x / N) * 0.95) continue;
    const r = 2.5 + rand() * 7.5;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sunflecks: the gaps between leaves that make shade read as dappled
  // light rather than as a dark patch on the lawn
  ctx.fillStyle = '#000';
  for (let i = 0; i < 300; i++) {
    const r = 1 + rand() * 2.6;
    ctx.beginPath();
    ctx.ellipse(rand() * N, rand() * N, r, r * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/* -------------------------------------------------------------- the world */

/**
 * One draw call for a crowd of near-identical objects. Colour varies per
 * instance, so the trees keep their individual greens.
 */
function instanced(geo, items, material, shadows = false) {
  const mesh = new THREE.InstancedMesh(geo, material || lambert(0xffffff), items.length);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    p.fromArray(it.pos);
    e.fromArray(it.rot || [0, 0, 0]);
    q.setFromEuler(e);
    s.fromArray(it.scale);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    mesh.setColorAt(i, c.setHex(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadows;
  return mesh;
}

/** A grass blade: a tapering, slightly bent strip, one unit tall. */
function bladeGeometry() {
  const g = new THREE.BufferGeometry();
  const pos = [-0.5, 0, 0, 0.5, 0, 0, -0.32, 0.5, 0.06, 0.32, 0.5, 0.06, 0, 1, 0.16];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Normals straight up: a blade lit as its own thin sliver flickers between
  // black and white; lit like the lawn it is part of, it just adds depth
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  return g;
}

/** A pennant: a triangle hanging point down from the line, subdivided so
    it can ripple. Top edge at y = 0, tip at y = -1. */
function pennantGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 2, 4);
  g.translate(0, -0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, p.getX(i) * (1 + p.getY(i)));
  }
  g.computeVertexNormals();
  return g;
}

/** A swallow, as three triangles. Wings flap in the vertex shader. */
function birdGeometry() {
  const g = new THREE.BufferGeometry();
  const pos = [
    0, 0, 0.2, 0.05, 0, 0.04, -0.05, 0, 0.04, 0, 0, -0.22,
    0.06, 0, 0.06, 0.06, 0, -0.07, 0.5, 0.02, -0.12,
    -0.06, 0, 0.06, -0.06, 0, -0.07, -0.5, 0.02, -0.12,
    0, 0, -0.22, 0.09, 0, -0.34, -0.09, 0, -0.34
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  return g;
}

export function buildGarden({ lowTier = false } = {}) {
  const group = new THREE.Group();
  const rand = mulberry(2021);
  const refs = {};
  const wind = { uGust: { value: 0 }, phases: [] };
  // What a "simpler garden" can do without (see simplifyGarden)
  refs.extras = [];
  refs.windy = [];

  /* Lawn: the tiled grass, under a garden-sized map of where it is lush,
     dry, mown or in shade (see lawnMacro) */
  const macro = lawnMacro();
  const lawnMat = new THREE.MeshLambertMaterial({ map: lawnTexture() });
  lawnMat.onBeforeCompile = (shader) => {
    shader.uniforms.uMacro = { value: macro.tex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMacroUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 lmW = modelMatrix * vec4(position, 1.0);
        vMacroUv = vec2((lmW.x - ${MACRO.x0.toFixed(1)}) / ${MACRO.size.toFixed(1)}, 1.0 - (lmW.z - ${MACRO.z0.toFixed(1)}) / ${MACRO.size.toFixed(1)});`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMacro;\nvarying vec2 vMacroUv;')
      // The macro map is stored at 85 % so it can brighten as well as darken
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= texture2D( uMacro, vMacroUv ).rgb * 1.176;');
  };
  lawnMat.customProgramCacheKey = () => 'pm-lawn';
  const lawn = new THREE.Mesh(
    // Wide enough that the spruces all round stand on grass; the fog has
    // swallowed it long before its edge
    new THREE.PlaneGeometry(160, 160),
    lawnMat
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  refs.macro = macro;
  group.add(lawn);

  /* Clouds, high and far, drifting east */
  {
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0.9
    });
    const spots = [
      [-26, 10, -44, 1.25], [9, 13.5, -46, 1], [30, 8.5, -40, 0.85], [-5, 15.5, -50, 0.7], [-44, 12, -42, 0.9]
    ];
    const clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(24, 12), cloudMat, spots.length);
    clouds.frustumCulled = false;
    refs.clouds = { mesh: clouds, spots };
    group.add(clouds);
  }

  /* The hedge behind the easels — one instanced draw for the whole run */
  {
    const bushes = [];
    for (let x = -14; x <= 14; x += 1.15) {
      const r = 0.8 + rand() * 0.22;
      bushes.push({
        pos: [x + (rand() - 0.5) * 0.25, 0.68, -9.6 + (rand() - 0.5) * 0.4],
        rot: [0, rand() * Math.PI, 0],
        scale: [r, r * 0.92, r],
        color: 0x2b5024 + Math.floor(rand() * 3) * 0x000a04
      });
    }
    const hedgeMat = windify(lambert(0xffffff, { vertexColors: true }), wind, { amp: 0.035, base: 0, span: 1, freq: 0.8, key: 'hedge' });
    // Leafy and dark underneath: clumps of leaves on the silhouette, soft
    // normals so each bush lights as one volume, not a row of green balls
    const hedge = instanced(hedgeBush(3), bushes, hedgeMat, true);
    refs.windy.push(hedge);
    group.add(hedge);
    // Sprigs and clumps standing proud of the clipped surface break the line
    const rh = mulberry(909);
    const sprigs = [];
    bushes.forEach((b) => {
      const [bx, by, bz] = b.pos;
      const r = b.scale[0];
      for (let k = 0; k < (lowTier ? 2 : 4); k++) {
        const a = (rh() - 0.5) * Math.PI * 1.3;
        const up = 0.35 + rh() * 0.55;
        const s2 = 0.16 + rh() * 0.16;
        sprigs.push({
          pos: [bx + Math.sin(a) * r * 0.85 * (1 - up * 0.4), by + up * r * 0.85, bz + Math.cos(a) * r * 0.5 * (1 - up * 0.5)],
          rot: [rh() * 3, rh() * 3, 0],
          scale: [s2, s2 * 0.85, s2],
          color: b.color + 0x040602 * Math.floor(rh() * 3)
        });
      }
    });
    const sprigMat = windify(lambert(0xffffff, { vertexColors: true }), wind, { amp: 0.5, base: -1, span: 2, freq: 0.8, key: 'sprig' });
    const sprigMesh = instanced(hedgeBush(7, 0.2), sprigs, sprigMat);
    refs.windy.push(sprigMesh);
    group.add(sprigMesh);

    // A bed of summer flowers along the foot of the hedge: stems, open
    // five-petal heads turned to the light, lupin spikes, and a band of
    // leaves to stand them in. The heads ride the same wind as their stems
    // (same phase, same oscillators), so a gust bends each flower whole.
    const stems = [];
    const heads = [];
    const cols = [0xc8414f, 0xe8b84e, 0xece6d6, 0x9c5aa6, 0xd8743f, 0x6a84c8, 0xc8414f, 0xece6d6];
    for (let i = 0; i < (lowTier ? 160 : 320); i++) {
      // (Five draws from the shared stream, as before, so nothing after moves)
      const s = 0.045 + rand() * 0.04;
      const x = -13 + rand() * 26;
      const h = 0.12 + rand() * 0.34;
      const z = -8.75 + rand() * 0.4;
      const color = cols[Math.floor(rand() * cols.length)];
      stems.push({ pos: [x, 0, z], scale: [s, h, s], color: 0x3f6a2a });
      heads.push({ pos: [x, h, z], scale: [s * 0.95, s * 0.95, s * 0.95], color });
    }
    const rf = mulberry(8128);
    const spikes = [];
    const lupins = [0x7b5aa8, 0xd77aa8, 0xeee8e0, 0x6a72c0, 0x9a62b8];
    for (let i = 0; i < (lowTier ? 30 : 64); i++) {
      const x = -12.5 + rf() * 25;
      const z = -8.95 + rf() * 0.35;
      const h = 0.3 + rf() * 0.25;
      stems.push({ pos: [x, 0, z], scale: [0.07, h, 0.07], color: 0x3a6428 });
      spikes.push({ pos: [x, h, z], scale: [0.042, 0.045 + rf() * 0.02, 0.042], color: lupins[Math.floor(rf() * lupins.length)] });
    }
    const leaves = [];
    for (let x = -13.2; x <= 13.2; x += 0.42) {
      const r = 0.16 + rf() * 0.1;
      leaves.push({ pos: [x + (rf() - 0.5) * 0.2, r * 0.35, -8.8 + (rf() - 0.5) * 0.3], rot: [0, rf() * 3, 0], scale: [r * 1.4, r * 0.7, r], color: 0x2f5a26 + Math.floor(rf() * 3) * 0x030502 });
    }
    const wcfg = { base: 0, span: 1, freq: 1.4 };
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.08, 1, 4, 1, true);
    stemGeo.translate(0, 0.5, 0);
    const stemMesh = instanced(stemGeo, stems, windify(lambert(0xffffff), wind, { ...wcfg, amp: 0.55, key: 'stem' }));
    // A head: a five-pointed petal disc round a domed centre, built flat
    const petals = new THREE.CircleGeometry(1, 10);
    const pp = petals.attributes.position;
    for (let k = 1; k < pp.count; k++) {
      const f = k % 2 ? 1 : 0.5;
      pp.setXYZ(k, pp.getX(k) * f, pp.getY(k) * f, 0.12 * (1 - f));
    }
    petals.rotateX(-Math.PI / 2);
    const disc = shadeByHeight(petals, -0.1, 0.1, 1, 1, 0.04);
    const eye = new THREE.SphereGeometry(0.32, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    eye.scale(1, 0.55, 1);
    const ec = new Float32Array(eye.attributes.position.count * 3);
    for (let k = 0; k < ec.length; k += 3) ec.set([1, 0.78, 0.3], k);
    eye.setAttribute('color', new THREE.BufferAttribute(ec, 3));
    const headGeo = mergeGeometries([disc.toNonIndexed(), eye.toNonIndexed()].map((g) => {
      g.deleteAttribute('uv');
      return g;
    }));
    headGeo.computeVertexNormals();
    // Turned up and a little toward the lawn, where the light and the eye are
    headGeo.rotateX(0.4);
    // The head swings exactly as its stem's top does (the sway is in each
    // instance's own units, so the amplitude is divided by the size ratio;
    // no instance is rotated, or the sway would point another way)
    const headMat = windify(lambert(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), wind, { ...wcfg, base: -1e3, span: 1e-3, amp: 0.55 / 0.95, key: 'head' });
    const headMesh = instanced(headGeo, heads, headMat);
    // Lupin spikes: a lumpy cone of florets, paler toward the tip
    const spikeGeo = new THREE.ConeGeometry(1, 4, 7, 6);
    spikeGeo.translate(0, 2, 0);
    const sp = spikeGeo.attributes.position;
    for (let k = 0; k < sp.count; k++) {
      const bump = 1 + 0.18 * Math.sin(sp.getY(k) * 9 + Math.atan2(sp.getZ(k), sp.getX(k)) * 3);
      sp.setXYZ(k, sp.getX(k) * bump, sp.getY(k), sp.getZ(k) * bump);
    }
    spikeGeo.computeVertexNormals();
    shadeByHeight(spikeGeo, 0, 4, 0.72, 1.15, 0.05);
    const spikeMesh = instanced(spikeGeo, spikes, windify(lambert(0xffffff, { vertexColors: true }), wind, { ...wcfg, base: -1e3, span: 1e-3, amp: (0.55 * 0.07) / 0.042, key: 'spike' }));
    const leafMesh = instanced(shadeByHeight(lumpy(1, 0.22, 11), -1, 1, 0.55, 1.15), leaves, windify(lambert(0xffffff, { vertexColors: true }), wind, { amp: 0.05, base: 0, span: 1, freq: 1.1, key: 'leaves' }));
    [stemMesh, headMesh, spikeMesh, leafMesh].forEach((m) => {
      m.receiveShadow = true;
      refs.windy.push(m);
      group.add(m);
    });
  }

  /* The house — Terrassvägen 47: falu red with white knots, as it should be */
  {
    const house = new THREE.Group();
    house.position.set(9.5, 0, -22);
    house.rotation.y = -0.22;
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, 3.6, 6.5), lambert(0x8c3126));
    body.position.y = 1.8;
    house.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 2.3, 4), lambert(0x4a4348));
    roof.position.y = 4.72;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.66;
    house.add(roof);
    // White corner boards: the knots that make it a falu-red house
    [-4.98, 4.98].forEach((x) => {
      const knot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 0.16), lambert(0xf2efe6));
      knot.position.set(x, 1.8, 3.2);
      house.add(knot);
    });
    // Windows: dark glass inside a white frame. A white pane on a white
    // frame is what turned these into blank patches the first time round.
    // The layers stand centimetres apart, not millimetres: the house is
    // twenty metres off, where a 16-bit depth buffer (some phones) cannot
    // tell 1 cm from nothing and the glass would flicker through the frame.
    [-3.4, -1.15, 1.15, 3.4].forEach((wx) => {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.45, 0.08), lambert(0xf2efe6));
      fr.position.set(wx, 2.05, 3.26);
      house.add(fr);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 1.22), lambert(0x2a3a44));
      win.position.set(wx, 2.05, 3.34);
      house.add(win);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.04), lambert(0xf2efe6));
      bar.position.set(wx, 2.05, 3.39);
      house.add(bar);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.24, 0.04), lambert(0xf2efe6));
      post.position.set(wx, 2.05, 3.39);
      house.add(post);
    });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 0.1), lambert(0xf2efe6));
    door.position.set(0, 1.1, 3.26);
    house.add(door);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), lambert(0x6d4a2c));
    panel.position.set(0, 1.1, 3.35);
    house.add(panel);
    const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.16, 0.9), lambert(0xb8b0a0));
    step.position.set(0, 0.08, 3.7);
    house.add(step);
    // A stone plinth, white sills, a porch roof on two posts over the door
    // and a plastered chimney: the details that make a box a Norrland house
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(10.24, 0.42, 6.74), lambert(0x8d8a82));
    plinth.position.y = 0.2;
    house.add(plinth);
    [-3.4, -1.15, 1.15, 3.4].forEach((wx) => {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.08, 0.22), lambert(0xf2efe6));
      sill.position.set(wx, 1.29, 3.33);
      house.add(sill);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.1, 0.16), lambert(0xf2efe6));
      head.position.set(wx, 2.83, 3.3);
      house.add(head);
    });
    const porch = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.15), lambert(0x4a4348));
    porch.position.set(0, 2.62, 3.82);
    porch.rotation.x = 0.22;
    house.add(porch);
    [-0.85, 0.85].forEach((px) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), lambert(0xf2efe6));
      post.position.set(px, 1.25, 4.25);
      house.add(post);
    });
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.7, 0.62), lambert(0xe6e1d6));
    chimney.position.set(2.2, 5.2, -0.9);
    house.add(chimney);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.12, 0.76), lambert(0x3a3a3e));
    cap.position.set(2.2, 6.1, -0.9);
    house.add(cap);
    bake(house);
    group.add(house);
  }

  /* The flagpole, flying the long blue-and-yellow vimpel: a Swedish garden
     on a summer Saturday. The pennant streams east with the clouds. */
  {
    const pole = new THREE.Group();
    pole.position.set(1.6, 0, -13.4);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.085, 9, 8), lambert(0xf2efe6));
    shaft.position.y = 4.5;
    pole.add(shaft);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lambert(0xd8b04a));
    knob.position.y = 9.06;
    pole.add(knob);
    bake(pole);
    group.add(pole);
    const L = 4.4;
    const geo = new THREE.PlaneGeometry(L, 0.44, 20, 2);
    geo.translate(L / 2, 0, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = p.getX(i) / L;
      // Tapering toward a forked tail
      const fork = k > 0.86 ? Math.max(0, 1 - Math.abs(p.getY(i)) / 0.22) * (k - 0.86) * 2.2 : 0;
      p.setX(i, p.getX(i) - fork * L * 0.18);
      p.setY(i, p.getY(i) * (1 - 0.72 * k));
    }
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 16;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#1e5aa6';
    c2.fillRect(0, 0, 128, 16);
    c2.fillStyle = '#f2c230';
    c2.fillRect(0, 6, 128, 4);
    c2.fillRect(9, 0, 4, 16);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = lambert(0xffffff, { map: tex, side: THREE.DoubleSide });
    const ph = phaseUniform(wind, [5.2, 2.3, 0]);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uVimPh = ph;
      shader.uniforms.uGust = wind.uGust;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uVimPh;\nuniform float uGust;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float vk = clamp(position.x / ${L.toFixed(2)}, 0.0, 1.0);
          transformed.z += sin(uVimPh.x - position.x * 2.1) * 0.32 * vk * (0.6 + uGust * 0.6);
          transformed.y += sin(uVimPh.y - position.x * 1.3) * 0.12 * vk - vk * vk * (0.9 - uGust * 0.7);`);
    };
    mat.customProgramCacheKey = () => 'pm-vimpel';
    mat.userData.windy = true;
    const vimpel = new THREE.Mesh(geo, mat);
    vimpel.position.set(1.6, 8.75, -13.4);
    vimpel.rotation.y = -0.35;
    refs.windy.push(vimpel);
    group.add(vimpel);
  }

  /* The forest round the garden (forest.js): the spruce edge in clusters
     and clearings, birches in front of it, undergrowth at its foot, a hazed
     rank and a ridge behind, and the garden's own three birches — all in a
     handful of merged meshes sharing one foliage material */
  {
    const forest = buildForest(mulberry(4747), {
      lite: lowTier,
      wind: { phase: phaseUniform(wind, [0.95, 2.4, 0.75]), gust: wind.uGust },
      sunDir: SUN_DIR
    });
    refs.forest = forest;
    group.add(forest.group);

    // The dappled light, from the near birch's canopy
    const canopy = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 9),
      new THREE.MeshBasicMaterial({ alphaMap: canopyTexture(), alphaTest: 0.5, side: THREE.DoubleSide })
    );
    canopy.rotation.x = -Math.PI / 2;
    canopy.position.set(-4.4, 5.6, 1.2);
    canopy.castShadow = true;
    canopy.layers.set(1);
    refs.canopy = canopy;
    refs.extras.push(canopy);
    group.add(canopy);
  }

  /* Bunting on a catenary between the two birches. Pennants floating with
     no line between them is the detail that gives a scene away as fake. */
  {
    const x0 = -8.6;
    const x1 = 9.2;
    const y0 = 5;
    const y1 = 5.4;
    const sag = 1.5;
    const z = -8.6;
    const curveAt = (k) => new THREE.Vector3(
      x0 + k * (x1 - x0),
      y0 + k * (y1 - y0) - Math.sin(k * Math.PI) * sag,
      z
    );
    const line = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(Array.from({ length: 12 }, (_, i) => curveAt(i / 11))),
        24, 0.022, 5, false
      ),
      lambert(0x3b3229)
    );
    group.add(line);
    const flagCols = [0xf2c14e, 0x2e5f9e, 0xd8394d, 0xe9e4d6];
    const flags = [];
    for (let i = 0; i <= 22; i++) {
      const k = (i + 0.5) / 23;
      const p = curveAt(k);
      flags.push({
        pos: [p.x, p.y - 0.01, p.z],
        rot: [0, 0, 0],
        scale: [0.36, 0.44, 1],
        color: flagCols[i % 4]
      });
    }
    // Each pennant swings on the line (its instance matrix, per frame) and
    // ripples along its length (here)
    const flagMat = lambert(0xffffff, { side: THREE.DoubleSide });
    const flagPh = phaseUniform(wind, [7, 0, 0]);
    flagMat.onBeforeCompile = (shader) => {
      shader.uniforms.uFlagPh = flagPh;
      shader.uniforms.uGust = wind.uGust;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uFlagPh;\nuniform float uGust;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fPh = instanceMatrix[3].x * 1.7;
          transformed.z += sin(uFlagPh.x + fPh - position.y * 4.0) * 0.12 * (-position.y) * (0.6 + uGust);`);
    };
    flagMat.customProgramCacheKey = () => 'pm-pennant';
    flagMat.userData.windy = true;
    const bunting = instanced(pennantGeometry(), flags, flagMat);
    refs.windy.push(bunting);
    refs.bunting = { mesh: bunting, flags };
    group.add(bunting);
  }

  /* Grass, standing up out of the lawn where the camera can see it */
  {
    const blades = [];
    const greens = [0x5f7f34, 0x6f8f3c, 0x4f6e2c, 0x7d9a48, 0x587a30];
    const n = lowTier ? 1400 : 3600;
    for (let i = 0; i < n; i++) {
      const x = -7 + rand() * 14;
      const z = -8 + rand() * 9.5;
      const h = 0.08 + rand() * 0.16;
      blades.push({
        pos: [x, 0, z],
        rot: [0, rand() * Math.PI, (rand() - 0.5) * 0.4],
        scale: [0.025 + rand() * 0.02, h, 1],
        color: greens[Math.floor(rand() * greens.length)]
      });
    }
    const grassMat = windify(lambert(0xffffff, { side: THREE.DoubleSide }), wind, { amp: 0.6, base: 0, span: 1, freq: 1.6, key: 'grass' });
    // Double-sided, three flips the normal on the back face — and a blade
    // seen from behind would go dark and flick to light as the camera
    // drifts past edge-on. Every blade is lit like the lawn from both sides.
    const windGrass = grassMat.onBeforeCompile;
    grassMat.onBeforeCompile = (shader) => {
      windGrass(shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n  normal = normalize( vNormal );'
      );
    };
    const grass = instanced(bladeGeometry(), blades, grassMat);
    grass.receiveShadow = true;
    refs.extras.push(grass);
    group.add(grass);

    // Daisies and clover heads in the near lawn
    const heads = [];
    for (let i = 0; i < (lowTier ? 90 : 200); i++) {
      const s = 0.012 + rand() * 0.01;
      heads.push({
        pos: [-7 + rand() * 14, 0.05 + rand() * 0.06, -8 + rand() * 9.5],
        scale: [s, s * 0.45, s],
        color: rand() < 0.65 ? 0xe4e2d6 : rand() < 0.6 ? 0xe0b83c : 0xb87a9c
      });
    }
    const headMesh = instanced(new THREE.IcosahedronGeometry(1, 0), heads);
    headMesh.receiveShadow = true;
    refs.extras.push(headMesh);
    group.add(headMesh);
  }

  /* Pollen and seed fluff drifting through the sunlight: the air itself,
     catching the light against the hedge and the shade */
  {
    const n = lowTier ? 70 : 160;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const rp = mulberry(3301);
    for (let i = 0; i < n; i++) {
      pos.set([-7 + rp() * 13, 0.35 + rp() * 2.6, -8.5 + rp() * 10.5], i * 3);
      seed[i] = rp() * TAU;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const cv = document.createElement('canvas');
    cv.width = 32;
    cv.height = 32;
    const c2 = cv.getContext('2d');
    const gr = c2.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c2.fillStyle = gr;
    c2.fillRect(0, 0, 32, 32);
    const dot = new THREE.CanvasTexture(cv);
    dot.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.PointsMaterial({
      size: 0.03, map: dot, color: 0xfff4d6, transparent: true, opacity: 0.8, depthWrite: false, sizeAttenuation: true
    });
    const ph = phaseUniform(wind, [0.23, 0.31, 0.17]);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPolPh = ph;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSeed;\nuniform vec3 uPolPh;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.x += sin(uPolPh.x + aSeed) * 0.6 + sin(uPolPh.y * 2.0 + aSeed * 1.7) * 0.25;
          transformed.y += sin(uPolPh.z + aSeed * 2.3) * 0.35;
          transformed.z += cos(uPolPh.x + aSeed * 0.7) * 0.5;`)
        // Never a big blob in front of the lens, whatever the distance
        .replace('#include <fog_vertex>', '#include <fog_vertex>\n  gl_PointSize = clamp( gl_PointSize, 1.0, 6.0 );');
    };
    mat.customProgramCacheKey = () => 'pm-pollen';
    const pollen = new THREE.Points(geo, mat);
    pollen.frustumCulled = false;
    refs.extras.push(pollen);
    group.add(pollen);
  }

  /* Swallows, looping over the hedge */
  {
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x2b2d36, side: THREE.DoubleSide });
    const flapPh = phaseUniform(wind, [13, 0, 0]);
    birdMat.onBeforeCompile = (shader) => {
      shader.uniforms.uFlapPh = flapPh;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uFlapPh;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float bPh = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.3;
          float flap = sin(uFlapPh.x + bPh);
          transformed.y += flap * max(0.0, abs(position.x) - 0.06) * 0.9;`);
    };
    birdMat.customProgramCacheKey = () => 'pm-bird';
    const flock = [];
    for (let i = 0; i < 6; i++) {
      flock.push({
        cx: -6 + rand() * 12, cy: 5 + rand() * 4, cz: -10 - rand() * 8,
        rx: 4 + rand() * 5, rz: 2 + rand() * 3, speed: 0.35 + rand() * 0.3,
        phase: rand() * Math.PI * 2, dir: rand() < 0.5 ? -1 : 1, s: 0.75 + rand() * 0.4
      });
    }
    const birds = new THREE.InstancedMesh(birdGeometry(), birdMat, flock.length);
    birds.frustumCulled = false;
    refs.birds = { mesh: birds, flock };
    refs.extras.push(birds);
    group.add(birds);
  }

  /* The trestle with the hat, the beer and the fika */
  {
    const table = new THREE.Group();
    table.position.set(-2.55, 0, -3.5);
    table.rotation.y = 0.5;
    // Planked top, not a slab: a trestle in a Norrland garden is boards
    for (let i = 0; i < 5; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.155), lambert(i % 2 ? 0xc0b394 : 0xb6a888));
      plank.position.set(0, 0.76, -0.34 + i * 0.17);
      table.add(plank);
    }
    [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.76, 6), lambert(0x8d7f66));
      leg.position.set(x, 0.38, z);
      table.add(leg);
    });
    const brace = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.05), lambert(0x8d7f66));
    brace.position.set(0, 0.3, 0);
    table.add(brace);
    // The hat the slips came out of, with the slips showing over the brim
    const hat = new THREE.Group();
    hat.position.set(-0.55, 0.785, 0);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.03, 20), lambert(0x2c2620));
    brim.position.y = 0.015;
    hat.add(brim);
    const crown2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.185, 0.2, 18), lambert(0x2c2620));
    crown2.position.y = 0.125;
    hat.add(crown2);
    const bandH = new THREE.Mesh(new THREE.CylinderGeometry(0.188, 0.188, 0.05, 18), lambert(0x8a2f28));
    bandH.position.y = 0.055;
    hat.add(bandH);
    for (let i = 0; i < 4; i++) {
      const slip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.05), lambert(0xf3eedf));
      slip.position.set((rand() - 0.5) * 0.14, 0.226, (rand() - 0.5) * 0.14);
      slip.rotation.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6);
      hat.add(slip);
    }
    bake(hat);
    refs.hat = hat;
    // Beer. Ten each, said the brief.
    for (let i = 0; i < 5; i++) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8), lambert(0x4a2f14));
      bottle.position.set(0.15 + i * 0.13, 0.9, (rand() - 0.5) * 0.4);
      table.add(bottle);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.07, 7), lambert(0x4a2f14));
      neck.position.set(bottle.position.x, 1.05, bottle.position.z);
      table.add(neck);
    }
    // Fika: a plate of buns
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.015, 16), lambert(0xf2efe6));
    plate.position.set(-0.05, 0.795, 0.2);
    table.add(plate);
    for (let i = 0; i < 4; i++) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), lambert(0xc98a44));
      bun.scale.y = 0.6;
      bun.position.set(-0.05 + Math.cos(i * 1.6) * 0.06, 0.82, 0.2 + Math.sin(i * 1.6) * 0.06);
      table.add(bun);
    }
    bake(table, { skip: [hat], receiveShadow: true });
    table.add(hat);
    group.add(table);
  }

  /* A parasol and two folding chairs, to give the middle distance something
     other than lawn between the easels and the hedge */
  {
    const set = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), lambert(0xb8b0a0));
    pole.position.set(5.9, 1.15, -8.6);
    set.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.62, 8), lambert(0xd8dcd6));
    canopy.position.set(5.9, 2.35, -8.6);
    set.add(canopy);
    // Alternating gores, the way every garden parasol is striped
    for (let i = 0; i < 4; i++) {
      const gore = new THREE.Mesh(
        new THREE.ConeGeometry(1.505, 0.625, 8, 1, false, (i * Math.PI) / 2, Math.PI / 4),
        lambert(0xc4443c)
      );
      gore.position.set(5.9, 2.35, -8.6);
      set.add(gore);
    }
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lambert(0xb8b0a0));
    finial.position.set(5.9, 2.7, -8.6);
    set.add(finial);

    [[5.1, -7.9, 0.7], [6.9, -8.3, -0.4]].forEach(([cx, cz, ry]) => {
      const chair = new THREE.Group();
      chair.position.set(cx, 0, cz);
      chair.rotation.y = ry;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.48), lambert(0x2f5f96));
      seat.position.y = 0.44;
      chair.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), lambert(0x2f5f96));
      back.position.set(0, 0.68, -0.22);
      back.rotation.x = -0.22;
      chair.add(back);
      [[-0.21, -0.2], [0.21, -0.2], [-0.21, 0.2], [0.21, 0.2]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.44, 5), lambert(0xb8b0a0));
        leg.position.set(lx, 0.22, lz);
        chair.add(leg);
      });
      set.add(chair);
    });
    bake(set);
    group.add(set);
  }

  refs.lawn = lawn;
  return { group, refs, wind };
}

/** Per-frame garden motion: gusts, bunting, birds, clouds, the dapples. */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
export function animateGarden(garden, t, still) {
  const { refs, wind } = garden;
  // Phases wrapped here, in double precision (see the header)
  for (const { u, rates } of wind.phases) {
    u.value.set(still ? 0 : (t * rates[0]) % TAU, still ? 0 : (t * rates[1]) % TAU, still ? 0 : (t * rates[2]) % TAU);
  }
  // A gust every few seconds, never on a fixed beat
  wind.uGust.value = still ? 0 : Math.max(0, Math.sin(t * 0.37) * 0.6 + Math.sin(t * 0.83 + 1.3) * 0.4);
  const gust = wind.uGust.value;

  const { mesh: bunting, flags } = refs.bunting;
  flags.forEach((f, i) => {
    const swing = still ? 0 : Math.sin(t * 2.1 + i * 0.73) * (0.18 + gust * 0.3) - gust * 0.25;
    _e.set(swing, Math.sin(t * 1.3 + i) * 0.15 * gust, Math.sin(i * 1.7) * 0.1);
    _q.setFromEuler(_e);
    _m.compose(_p.fromArray(f.pos), _q, _s.fromArray(f.scale));
    bunting.setMatrixAt(i, _m);
  });
  bunting.instanceMatrix.needsUpdate = true;

  const { mesh: birds, flock } = refs.birds;
  flock.forEach((b, i) => {
    const a = b.phase + t * b.speed * b.dir;
    const x = b.cx + Math.cos(a) * b.rx;
    const z = b.cz + Math.sin(a) * b.rz;
    const y = b.cy + Math.sin(a * 2 + i) * 0.7;
    // Heading along the path, banking into the turn
    const dx = -Math.sin(a) * b.rx * b.dir;
    const dz = Math.cos(a) * b.rz * b.dir;
    _e.set(0, Math.atan2(dx, dz), -b.dir * 0.35);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.setScalar(b.s));
    birds.setMatrixAt(i, _m);
  });
  birds.instanceMatrix.needsUpdate = true;

  const { mesh: clouds, spots } = refs.clouds;
  spots.forEach(([x, y, z, s], i) => {
    const drift = ((x + 50 + t * 0.35 * (1 + i * 0.12)) % 100) - 50;
    _m.compose(_p.set(drift, y, z), _q.identity(), _s.set(s, s, 1));
    clouds.setMatrixAt(i, _m);
  });
  clouds.instanceMatrix.needsUpdate = true;

  const { canopy } = refs;
  canopy.position.x = -4.4 + (still ? 0 : Math.sin(t * 0.9) * 0.12 * (0.4 + gust));
  canopy.rotation.z = still ? 0 : Math.sin(t * 0.6 + 0.4) * 0.025 * (0.5 + gust);
}

/* ---------------------------------------------------------------- easels */

/**
 * An easel with a canvas on it. With an `artMaterial` the canvas front is a
 * separate plane carrying it (index.js paints it and raycasts against it);
 * without one the whole easel, blank canvas and all, bakes into one mesh.
 */
export function buildEasel(artMaterial, w = 1.5, h = 1.15) {
  const g = new THREE.Group();
  const wood = 0xb8905a;
  // The player's easel is seen up close for the whole evening: its wood is
  // its own mesh with a grain texture. Far off in the field, colour is enough.
  const woodG = artMaterial ? new THREE.Group() : g;
  if (artMaterial) g.add(woodG);

  // Three legs, all BEHIND the canvas plane. An A-frame carries the canvas
  // on a tray at its front; legs crossing in front of the picture is the
  // one thing an easel never does. The mast is sized off the canvas —
  // a fixed length leaves a small canvas perched on stilts.
  const legLen = 1.05 + h * 0.6;
  [[-0.4 - w * 0.06, -0.06, 0.13], [0.4 + w * 0.06, -0.06, -0.13], [0, -0.62, 0]].forEach(([x, z, tilt]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.037, legLen, 6), lambert(wood));
    leg.position.set(x, legLen / 2 - 0.02, z);
    leg.rotation.z = tilt;
    leg.rotation.x = z < -0.3 ? -0.3 : 0.05;
    woodG.add(leg);
  });
  // Tray the canvas rests on, with the brushes, a rag and the tubes on it
  const tray = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.05, 0.14), lambert(wood));
  tray.position.set(0, 0.95, -0.02);
  woodG.add(tray);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.045, 0.028), lambert(wood));
  lip.position.set(0, 0.99, 0.045);
  woodG.add(lip);
  if (artMaterial) {
    [[-0.3, 0.14], [-0.21, -0.1], [0.34, 0.05]].forEach(([bx, rot], i) => {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.26, 5), lambert(0xc9a05a));
      shaft.rotation.set(Math.PI / 2, 0, Math.PI / 2 + rot);
      shaft.position.set(bx, 0.995, -0.01);
      g.add(shaft);
      const ferrule = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.055, 5), lambert(i ? 0x2a2018 : 0x8a2f28));
      ferrule.rotation.set(Math.PI / 2, 0, -Math.PI / 2 + rot);
      ferrule.position.set(bx + 0.15, 0.995, -0.01 + rot * 0.14);
      g.add(ferrule);
    });
    const rag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.11), lambert(0xd8d0bc));
    rag.position.set(0.13, 0.99, 0.0);
    rag.rotation.y = 0.4;
    g.add(rag);
    // The five tubes, squeezed flat at the back, caps toward us
    [0xc0242c, 0xe8b419, 0x22459b, 0xf4f2ea, 0x1b1815].forEach((col, i) => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 7), lambert(0xd9d6cf));
      tube.rotation.set(Math.PI / 2 - 0.1, 0, 0.3 - i * 0.12);
      tube.position.set(-0.52 + i * 0.045, 0.99, -0.03);
      g.add(tube);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.04, 7), lambert(col));
      band.rotation.copy(tube.rotation);
      band.position.copy(tube.position);
      g.add(band);
    });
  }

  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.09, h + 0.09, 0.05), lambert(0xc4a878));
  frame.position.set(0, 0.98 + h / 2, 0.01);
  woodG.add(frame);

  // A box, not a plane: the canvas is a stretched object with a visible
  // edge, and a zero-thickness quad at this distance reads as a decal.
  const stretched = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), lambert(artMaterial ? 0xe8e2d2 : 0xd8cfba));
  stretched.position.set(0, 0.98 + h / 2, 0.045);
  g.add(stretched);

  if (artMaterial) {
    bake(g, { skip: [woodG] });
    const wm = bake(woodG, { grainUv: true, receiveShadow: true });
    wm.material = new THREE.MeshStandardMaterial({ vertexColors: true, map: woodGrain(), roughness: 0.68, metalness: 0 });
  } else bake(g, { receiveShadow: true });

  let canvas = null;
  if (artMaterial) {
    // 2.5 mm proud of the stretcher's face (plus a polygon offset on the
    // material): half a millimetre was invisible to a 24-bit depth buffer
    // and a flicker on a 16-bit one
    canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMaterial);
    canvas.position.set(0, 0.98 + h / 2, 0.0625);
    g.add(canvas);
  }
  g.userData = { canvas };
  return g;
}

/**
 * The brush in the player's hand. Only on screen while a region is being
 * laid in: it follows the strokes across the canvas, loaded with the mix.
 * Its origin is the bristle tip, so placing it is placing the paint.
 */
export function buildBrush() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.011, 0.3, 8), lambert(0x7a2a22));
  handle.position.y = 0.225;
  body.add(handle);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.0095, 0.05, 8), lambert(0xb9b4aa));
  ferrule.position.y = 0.055;
  body.add(ferrule);
  bake(body, { castShadow: false });
  g.add(body);
  const tipMat = lambert(0x888888);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0105, 0.04, 8), tipMat);
  tip.rotation.x = Math.PI;
  tip.position.y = 0.012;
  tip.scale.z = 0.55;
  g.add(tip);
  g.visible = false;
  return { group: g, tipMat };
}

/* ------------------------------------------------------------ the field */

/**
 * Every other painter's easel — their picture so far on the front, a beer
 * on the grass beside it — baked into ONE mesh. Ten easels as ten draw
 * calls is a phone's whole budget for the background; as one they are free.
 * `list` holds { x, z, ry, art } per easel: ry is the way the canvas faces,
 * art an optional { cols, rows, colors } grid of linear RGB, one per vertex
 * of a subdivided quad — at this distance a 16×18 grid of soft colour
 * reads as paint, and it costs no texture.
 */
export const FIELD_W = 0.6;
export const FIELD_H = 0.65;
export const FIELD_SCALE = 0.88;
export function buildFieldEasels(list) {
  const field = new THREE.Group();
  // Portrait, like the motifs: a Mona Lisa squeezed into a landscape board
  // read as somebody painting a different picture
  const W = FIELD_W;
  const H = FIELD_H;
  list.forEach(({ x, z, ry, art }, i) => {
    const e = buildEasel(null, W, H);
    if (art) {
      const g = new THREE.PlaneGeometry(W * 0.97, H * 0.96, art.cols - 1, art.rows - 1);
      g.setAttribute('color', new THREE.BufferAttribute(art.colors, 3));
      const pic = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
      // A centimetre proud of the board: the field is eight metres off and
      // a 16-bit depth buffer cannot separate less there
      pic.position.set(0, 0.98 + H / 2, 0.072);
      e.add(pic);
    }
    e.position.set(x, 0, z);
    e.rotation.y = ry;
    e.scale.setScalar(FIELD_SCALE);
    field.add(e);
    // Per Vikman's brief: ten beers each. One is open at every easel.
    const side = i % 2 ? 1 : -1;
    const bx = x + Math.cos(ry) * 0.5 * side - Math.sin(ry) * 0.2;
    const bz = z - Math.sin(ry) * 0.5 * side - Math.cos(ry) * 0.2;
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.037, 0.2, 8), lambert(0x4a2f14));
    bottle.position.set(bx, 0.1, bz);
    field.add(bottle);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.07, 7), lambert(0x4a2f14));
    neck.position.set(bx, 0.235, bz);
    field.add(neck);
  });
  const mesh = bake(field);
  if (mesh) mesh.receiveShadow = true;
  return field;
}

/* ------------------------------------------------------------ fallback */

/**
 * The watchdog's second step (index.js): if the picture is still black once
 * the shadows are gone, the garden sheds everything a GPU could choke on —
 * the grass, the dappled light, the flowers in the lawn and the birds go,
 * and every wind shader is swapped for a plain material.
 */
export function simplifyGarden(garden) {
  const { refs } = garden;
  refs.extras.forEach((o) => {
    o.visible = false;
  });
  refs.windy.forEach((mesh) => {
    const m = mesh.material;
    const plain = new THREE.MeshLambertMaterial({
      color: m.color, map: m.map, vertexColors: m.vertexColors, side: m.side
    });
    mesh.material = plain;
    m.dispose();
  });
  refs.windy.length = 0;
}
