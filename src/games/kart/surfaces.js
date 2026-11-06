import * as THREE from 'three';
import { createRoute, ROAD_HALF_WIDTH } from './route.js';

/* ------------------------------------------------------------ track layout
 * Pure data shared by the physics, the renderer and the camera. Everything
 * here is derived once from the sourced centreline (route.js); no DOM.
 */

/** Kerbs sit on the road edge: their inner edge overlaps the painted line. */
export const KERB_INNER = 3.3;
export const KERB_OUTER = 4.25;
/** Painted edge line (lane), kept clear of the kerbs. */
export const EDGE_LINE = [3.34, 3.44];
const TABLE_STEP = 0.25;

let layout = null;
/** Lazily builds the kerb table and racing line for the Varggropen route. */
export function trackLayout(route = null) {
  if (layout && !route) return layout;
  const r = route || createRoute();
  const { length } = r;
  // Smoothed curvature at 1 m: the digitised trace is a little noisy.
  const raw = Array.from({ length: Math.ceil(length) }, (_, i) => r.curvature(i));
  const smooth = (values, radius) => values.map((_, i) => {
    let sum = 0;
    for (let j = -radius; j <= radius; j++) sum += values[(i + j + values.length) % values.length];
    return sum / (radius * 2 + 1);
  });
  const k = smooth(raw, 4);
  const n = k.length;
  // Corners: runs of one sign above the threshold, joined across short gaps.
  const corners = [];
  for (let i = 0; i < n; i++) {
    const sign = Math.sign(k[i]);
    if (Math.abs(k[i]) < 0.03) continue;
    const last = corners[corners.length - 1];
    if (last && last.sign === sign && i - last.end <= 9) last.end = i;
    else corners.push({ start: i, end: i, sign, peak: 0, apex: i });
  }
  // A corner that runs over the lap seam is one corner.
  if (corners.length > 1) {
    const first = corners[0], last = corners[corners.length - 1];
    if (first.sign === last.sign && first.start + n - last.end <= 9) { first.start = last.start - n; corners.pop(); }
  }
  for (const corner of corners) {
    for (let i = corner.start; i <= corner.end; i++) {
      const value = Math.abs(k[(i + n) % n]);
      if (value > corner.peak) { corner.peak = value; corner.apex = i; }
    }
  }
  const sharp = corners.filter(c => c.end - c.start >= 6 && c.peak > 0.045);
  // Inside kerb round the apex, outside kerb where the kart runs wide on exit.
  const kerbs = [];
  for (const c of sharp) {
    const span = c.end - c.start;
    const inside = c.sign;
    kerbs.push({ start: c.start + span * 0.18, end: c.end - span * 0.05, side: inside, kind: 'apex', inner: KERB_INNER, outer: KERB_OUTER });
    kerbs.push({ start: c.start + span * 0.55, end: c.end + 9 + span * 0.15, side: -inside, kind: 'exit', inner: KERB_INNER, outer: KERB_OUTER });
    if (c.peak > 0.075) kerbs.push({ start: c.start - 7, end: c.start + span * 0.12, side: -inside, kind: 'entry', inner: KERB_INNER, outer: KERB_OUTER });
  }
  for (const kerb of kerbs) {
    // Whole 1 m pieces, normalised so start lies on [0, length).
    const pieces = Math.max(2, Math.round(kerb.end - kerb.start));
    kerb.end = kerb.start + pieces;
    kerb.pieces = pieces;
    const shift = Math.floor(kerb.start / length) * length;
    kerb.start -= shift; kerb.end -= shift;
  }
  const slots = Math.ceil(length / TABLE_STEP);
  const left = new Uint8Array(slots), right = new Uint8Array(slots);
  for (const kerb of kerbs) {
    const table = kerb.side > 0 ? left : right;
    for (let d = kerb.start; d < kerb.end; d += TABLE_STEP) table[Math.floor(((d % length) + length) % length / TABLE_STEP) % slots] = 1;
  }
  // Racing line: wide on entry, the inside at the apex, wide on exit.
  const sum = new Float32Array(n), weight = new Float32Array(n);
  const ease = x => x * x * (3 - 2 * x);
  for (const c of sharp) {
    const s = c.sign, entry = c.start - 10, exit = c.end + 12, apex = Math.min(Math.max(c.apex, entry + 4), exit - 4);
    for (let i = entry - 16; i <= exit + 16; i++) {
      let value;
      if (i < entry) value = -s * 2.2;
      else if (i < apex) value = -s * 2.2 + (s * 4.6) * ease((i - entry) / (apex - entry));
      else if (i <= exit) value = s * 2.4 - (s * 4.5) * ease((i - apex) / (exit - apex));
      else value = -s * 2.1;
      const w = i < entry ? 1 - (entry - i) / 16 : i > exit ? 1 - (i - exit) / 16 : 1;
      const j = ((i % n) + n) % n;
      sum[j] += value * w; weight[j] += w;
    }
  }
  const lineRaw = Array.from(sum, (v, i) => v / Math.max(1, weight[i]));
  const line = smooth(lineRaw, 4).map(v => THREE.MathUtils.clamp(v, -2.5, 2.5));
  const result = {
    length, corners: sharp.map(c => ({ start: c.start, end: c.end, apex: ((c.apex % n) + n) % n, sign: c.sign, peak: c.peak })),
    kerbs, curvature: k,
    kerbAt(distance, side) {
      const table = side > 0 ? left : right;
      const d = ((distance % length) + length) % length;
      return table[Math.floor(d / TABLE_STEP) % slots] === 1;
    },
    racingLine(distance) {
      const d = ((distance % length) + length) % length, i = Math.floor(d), f = d - i;
      return line[i % n] * (1 - f) + line[(i + 1) % n] * f;
    }
  };
  if (!route) layout = result;
  return result;
}

/** What a point on the course is made of: 'asphalt' | 'kerb' | 'grass'. Pure
 * (the layout is derived from route.js once); lane is metres from the centre
 * line, positive towards the camera-left side. Gravel run-off counts as grass. */
export function surfaceAt(distance, lane) {
  if (!Number.isFinite(distance) || !Number.isFinite(lane)) return 'asphalt';
  const a = Math.abs(lane);
  if (a < KERB_INNER) return 'asphalt';
  if (a <= KERB_OUTER && trackLayout().kerbAt(distance, Math.sign(lane))) return 'kerb';
  return a <= ROAD_HALF_WIDTH ? 'asphalt' : 'grass';
}

/** The rubbered racing line's lane at a distance (metres from the centre). */
export function racingLine(distance) {
  return trackLayout().racingLine(distance);
}

/** Six staggered grid boxes behind the line, pole first: { distance, lane }. */
export const GRID_SLOTS = Array.from({ length: 6 }, (_, i) => ({ distance: -2.2 - i * 3.4, lane: i % 2 ? -1.5 : 1.5 }));

/* ------------------------------------------------------------ materials */

/** Small seamless material tiles; all artwork is generated locally. */
export function surfaceMaterial(kind, anisotropy = 4) {
  const size = 256;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const height = document.createElement('canvas'); height.width = height.height = size;
  const context = canvas.getContext('2d'), heightContext = height.getContext('2d');
  const pixels = context.createImageData(size, size), heights = heightContext.createImageData(size, size);
  const base = kind === 'asphalt' ? [92, 95, 96] : kind === 'gravel' ? [158, 144, 118] : [87, 108, 55];
  for (let i = 0; i < size * size; i++) {
    let hash = Math.imul(i ^ 2012, 0x45d9f3b); hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    const noise = (hash >>> 0) / 4294967296;
    const x = i % size, y = Math.floor(i / size);
    const phase = Math.PI * 2 / size;
    const cloud = kind === 'grass'
      ? (Math.sin((x + y * 2) * phase) * Math.sin((x * 3 - y) * phase) + Math.sin((x * 5 + y * 7) * phase) * 0.4) * 1.5
      : Math.sin(x * Math.PI / 32) * Math.sin(y * Math.PI / 64) * 2;
    // Asphalt: dark binder with pale aggregate stones catching the light.
    const stone = kind === 'asphalt' && noise > 0.93 ? 26 * (noise - 0.93) / 0.07 : 0;
    const grain = (noise - 0.5) * (kind === 'gravel' ? 35 : 17) + cloud + stone;
    pixels.data.set([base[0] + grain, base[1] + grain, base[2] + grain * 0.7, 255], i * 4);
    const h = 110 + noise * (kind === 'asphalt' ? 45 : 115);
    heights.data.set([h, h, h, 255], i * 4);
  }
  context.putImageData(pixels, 0, 0); heightContext.putImageData(heights, 0, 0);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(height);
  for (const texture of [map, bumpMap]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = anisotropy; }
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, map, bumpMap, bumpScale: kind === 'asphalt' ? 0.018 : 0.04,
    roughness: kind === 'asphalt' ? 0.88 : 1, metalness: 0, envMapIntensity: 0.22, vertexColors: true
  });
}

/** Asphalt with a rubbered racing line, repair patches, cracks and seams, all
 * drawn in track space from the `aTrack` attribute (distance, lane, line
 * lane). Thin features fade out with their screen footprint, so nothing
 * shimmers in the distance. */
export function asphaltMaterial(anisotropy = 4) {
  const material = surfaceMaterial('asphalt', anisotropy);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aTrack;\nvarying vec3 vTrack;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrack = aTrack;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTrack;
float tHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float tNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + 1.0), f.x), f.y); }
// 1 on a line of half-width w (in track metres), anti-aliased by the pixel footprint.
float tLine(float distanceToLine, float w, float footprint) {
  float edge = max(footprint, 0.002);
  return (1.0 - smoothstep(w, w + edge, abs(distanceToLine))) * clamp(w * 2.0 / edge, 0.0, 1.0);
}
float tRubber = 0.0;
float tSeal = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float d = vTrack.x, lane = vTrack.y, lineLane = vTrack.z;
  vec2 p = vec2(lane, d);
  float footprint = length(fwidth(p));
  // Rubber laid down along the racing line, heavier in the braking zones.
  float off = lane - lineLane;
  tRubber = exp(-off * off / 1.15) * (0.75 + 0.25 * tNoise(vec2(lane * 2.0, d * 0.35)));
  float wide = lane - lineLane * 0.55;
  tRubber += exp(-wide * wide / 3.5) * 0.18;
  // Broad wear and the darker binder of patched areas.
  float wear = tNoise(vec2(lane * 0.45, d * 0.07)) * 0.6 + tNoise(vec2(lane * 1.3, d * 0.31)) * 0.4;
  float shade = 0.94 + (wear - 0.5) * 0.14;
  // Repair patches: a few rectangles in a 2.4 m x 9 m cell grid.
  vec2 cell = vec2(floor(lane / 2.4 + 8.0), floor(d / 9.0));
  float h = tHash(cell + 17.0);
  if (h < 0.16) {
    vec2 f = vec2(fract(lane / 2.4 + 8.0) * 2.4, fract(d / 9.0) * 9.0);
    vec2 lo = vec2(0.2 + tHash(cell + 3.1) * 0.6, 0.8 + tHash(cell + 5.7) * 3.0);
    vec2 hi = lo + vec2(0.8 + tHash(cell + 9.3) * 0.9, 1.6 + tHash(cell + 1.9) * 3.5);
    vec2 inside = step(lo, f) * step(f, hi);
    float patch = inside.x * inside.y;
    shade = mix(shade, h < 0.08 ? 0.78 : 1.07, patch);
    vec2 toEdge = min(abs(f - lo), abs(f - hi));
    float border = max(tLine(toEdge.x, 0.025, footprint) * step(lo.y, f.y) * step(f.y, hi.y),
                       tLine(toEdge.y, 0.025, footprint) * step(lo.x, f.x) * step(f.x, hi.x));
    tSeal = max(tSeal, border);
  }
  // Hairline cracks where the surface has worked loose.
  float crackZone = smoothstep(0.55, 0.75, tNoise(vec2(lane * 0.3 + 40.0, d * 0.05)));
  float crackField = tNoise(vec2(lane * 1.7, d * 0.55)) + tNoise(vec2(lane * 4.1, d * 1.3)) * 0.35;
  float crack = tLine(crackField - 0.68, 0.012, length(fwidth(vec2(crackField)))) * crackZone;
  // Construction seams: a longitudinal joint and a transverse joint every 37 m.
  float seam = max(tLine(lane - 1.15, 0.018, footprint), tLine((fract(d / 37.0 + 0.5) - 0.5) * 37.0, 0.02, footprint) * step(abs(lane), 3.3));
  tSeal = max(tSeal, seam * 0.8);
  // Edges stay paler: dust from the gravel and no rubber.
  float edge = smoothstep(2.6, 3.4, abs(lane));
  shade *= 1.0 - tRubber * 0.36;
  shade = mix(shade, shade * 1.08, edge);
  shade *= 1.0 - crack * 0.5;
  shade = mix(shade, 0.42, tSeal * 0.75);
  diffuseColor.rgb *= shade;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - tRubber * 0.2 - tSeal * 0.3, 0.35, 1.0);`);
  };
  material.customProgramCacheKey = () => 'kart-asphalt-v1';
  return material;
}

/** Road paint and decals: lifted 8 mm and pulled forward in depth. */
export function paintMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
}
