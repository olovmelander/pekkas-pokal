/**
 * Pekkas Pingis — OLYMPIA in Bredbyn, where the 2019 competition was held.
 *
 * The real Olympia is Anundsjö IF's hall: raised in 1938, about a thousand
 * square metres, and the place the village has danced, played football and
 * skied out of ever since. Its dance floor was replaced in the six-million
 * renovation, so the boards here are laid new and lacquered over a room
 * that is anything but. Anundsjö IF play in red, which is why the curtain,
 * the house sign, the court barriers and the pennants are all the same red.
 *
 * Interiors live or die on lighting HIERARCHY — one dominant source, a
 * fill, a few accents — so the room is built around the pendants over the
 * table: they are why the table glows and the corners fall away into warm
 * darkness. Everything is procedural: every texture is painted to canvas,
 * the lamps get shader-faked volumetric cones with dust drifting in them,
 * and the new lacquer reflects the room (a real mirror pass on desktop, a
 * painted streak per lamp on phones).
 *
 * Framing: a phone sees only ±2.6 m of the stage wall, so everything the
 * portrait shot needs — scoreboard, house sign, pennant, the front row on
 * the stage lip — lives inside that band. A 16:10 monitor sees the whole
 * gable plus the far third of both side walls, so the proscenium, the
 * gathered curtains, the wall seating, the fika table and the wall bars
 * are placed where only the wide lens finds them.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

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
const standard = (color, roughness = 0.7, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...opts });

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')];
}

function srgbTexture(cv, repeat) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

/* --------------------------------------------------------------- textures */

/** Lacquered pine planks, laid along z, with gaps and per-plank tone. */
export function plankTexture() {
  const size = 512;
  const [cv, ctx] = canvas(size, size);
  const rand = mulberry(41);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(0, 0, size, size);
  const pw = size / 8;
  for (let p = 0; p < 8; p++) {
    const v = 0.8 + rand() * 0.36;
    ctx.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(110 * v)},${Math.round(66 * v)})`;
    ctx.fillRect(p * pw + 1, 0, pw - 2, size);
    // Grain lines running the length of the plank
    ctx.strokeStyle = `rgba(${Math.round(92 * v)},${Math.round(62 * v)},${Math.round(34 * v)},0.5)`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const x = p * pw + 3 + rand() * (pw - 6);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= size; y += 32) ctx.lineTo(x + (rand() - 0.5) * 3, y);
      ctx.stroke();
    }
    // Board joints
    let y = rand() * 180;
    while (y < size) {
      ctx.fillStyle = 'rgba(36,22,10,0.55)';
      ctx.fillRect(p * pw + 1, y, pw - 2, 2);
      y += 150 + rand() * 200;
    }
    if (rand() < 0.6) {
      const kx = p * pw + pw * (0.3 + rand() * 0.4);
      const ky = rand() * size;
      const kr = 3 + rand() * 4;
      const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
      g.addColorStop(0, 'rgba(52,34,16,0.9)');
      g.addColorStop(1, 'rgba(52,34,16,0)');
      ctx.fillStyle = g;
      ctx.fillRect(kx - kr, ky - kr, kr * 2, kr * 2);
    }
  }
  const tex = srgbTexture(cv, [5, 7]);
  // A floor is always seen at a grazing angle; without this mipmaps eat it
  tex.anisotropy = 8;
  return tex;
}

/** The table top from above: competition blue, white lines, wear. */
export function tableTexture() {
  const w = 512;
  const h = 1024;
  const [cv, ctx] = canvas(w, h);
  const rand = mulberry(19);
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#1d5f9e');
  base.addColorStop(0.5, '#175288');
  base.addColorStop(1, '#1d5f9e');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 14 + rand() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.012 + rand() * 0.022; // a lived-in table, not a stained one
    g.addColorStop(0, rand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(6,24,44,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.strokeStyle = '#f3f6fb';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w / 2, 8);
  ctx.lineTo(w / 2, h - 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(235,240,250,0.05)';
  for (let i = 0; i < 90; i++) {
    const y = rand() < 0.5 ? h * (0.08 + rand() * 0.3) : h * (0.62 + rand() * 0.3);
    ctx.beginPath();
    ctx.ellipse(rand() * w, y, 3 + rand() * 5, 2 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = srgbTexture(cv);
  tex.anisotropy = 8;
  return tex;
}

/** Blue dusk with a moon and spruce silhouettes for the windows. */
export function duskTexture() {
  const w = 256;
  const h = 256;
  const [cv, ctx] = canvas(w, h);
  const rand = mulberry(23);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0d1a3a');
  sky.addColorStop(0.55, '#1b3260');
  sky.addColorStop(0.8, '#3a5480');
  sky.addColorStop(1, '#141f36');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const mg = ctx.createRadialGradient(w * 0.68, h * 0.24, 2, w * 0.68, h * 0.24, 34);
  mg.addColorStop(0, 'rgba(255,248,225,1)');
  mg.addColorStop(0.18, 'rgba(255,248,225,0.9)');
  mg.addColorStop(0.3, 'rgba(230,236,255,0.22)');
  mg.addColorStop(1, 'rgba(230,236,255,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.2 + rand() * 0.6;
    ctx.fillRect(rand() * w, rand() * h * 0.6, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0a1220';
  for (let x = -6; x < w + 6; x += 10) {
    const th = 26 + rand() * 26;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 5, h - th);
    ctx.lineTo(x + 10, h);
    ctx.closePath();
    ctx.fill();
  }
  return srgbTexture(cv);
}

/** Soft round falloff, reused for glows, pools and the contact shadow. */
export function glowTexture(size = 64) {
  const [cv, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/** Painted tongue-and-groove boards: the wall panelling and the stage front. */
function boardTexture(base, { boards = 8, seed = 3, groove = 0.32, repeat = [1, 1], horizontal = false } = {}) {
  const size = 256;
  const [cv, ctx] = canvas(size, size);
  const rand = mulberry(seed);
  const col = new THREE.Color(base);
  const bw = size / boards;
  for (let i = 0; i < boards; i++) {
    const v = 0.9 + rand() * 0.16;
    ctx.fillStyle = `rgb(${Math.round(col.r * 255 * v)},${Math.round(col.g * 255 * v)},${Math.round(col.b * 255 * v)})`;
    if (horizontal) ctx.fillRect(0, i * bw, size, bw);
    else ctx.fillRect(i * bw, 0, bw, size);
    ctx.fillStyle = `rgba(0,0,0,${groove})`;
    if (horizontal) ctx.fillRect(0, i * bw, size, 2);
    else ctx.fillRect(i * bw, 0, 2, size);
    ctx.fillStyle = 'rgba(255,240,210,0.08)';
    if (horizontal) ctx.fillRect(0, i * bw + 2, size, 1);
    else ctx.fillRect(i * bw + 2, 0, 1, size);
  }
  return srgbTexture(cv, repeat);
}

/** Velvet: vertical light-and-shadow bands that line up with the folds. */
function velvetTexture(folds) {
  const w = 512;
  const [cv, ctx] = canvas(w, 8);
  for (let x = 0; x < w; x++) {
    const s = Math.sin((x / w) * folds * Math.PI * 2);
    const l = 0.62 + s * 0.3 + Math.sin((x / w) * folds * 5.3) * 0.04;
    ctx.fillStyle = `rgb(${Math.round(170 * l)},${Math.round(34 * l)},${Math.round(44 * l)})`;
    ctx.fillRect(x, 0, 1, 8);
  }
  return srgbTexture(cv);
}

/**
 * The house sign over the stage.
 *
 * Olympia has been the name over that door since 1938, so the sign is set
 * the way a hall sign of that vintage is: one word, wide-tracked, in the
 * club's red, on a board with a gold rule. Everything on it is true of the
 * real place — the name, the village, the parish, the year.
 */
export function olympiaSignTexture() {
  const w = 1024;
  const h = 320;
  const [cv, ctx] = canvas(w, h);
  const board = ctx.createLinearGradient(0, 0, 0, h);
  board.addColorStop(0, '#2a1418');
  board.addColorStop(0.5, '#3d1a20');
  board.addColorStop(1, '#261216');
  ctx.fillStyle = board;
  ctx.fillRect(0, 0, w, h);
  const back = ctx.createRadialGradient(w / 2, h * 0.46, 20, w / 2, h * 0.46, w * 0.5);
  back.addColorStop(0, 'rgba(255,196,120,0.34)');
  back.addColorStop(1, 'rgba(255,196,120,0)');
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(226,178,86,0.85)';
  ctx.lineWidth = 5;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, w - 56, h - 56);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '26px';
  ctx.font = '700 132px "Schibsted Grotesk", "Space Grotesk", Inter, sans-serif';
  ctx.shadowColor = 'rgba(255,120,110,0.75)';
  ctx.shadowBlur = 44;
  ctx.fillStyle = '#f5e9d8';
  ctx.fillText('OLYMPIA', w / 2 + 13, h * 0.44);
  ctx.shadowBlur = 0;
  ctx.letterSpacing = '11px';
  ctx.font = '700 34px Inter, sans-serif';
  ctx.fillStyle = 'rgba(232,186,110,0.92)';
  ctx.fillText('BREDBYN · ANUNDSJÖ', w / 2 + 6, h * 0.73);
  ctx.letterSpacing = '7px';
  ctx.font = '700 22px Inter, sans-serif';
  ctx.fillStyle = 'rgba(226,200,170,0.6)';
  ctx.fillText('SEDAN 1938', w / 2 + 4, h * 0.88);
  ctx.letterSpacing = '0px';
  return srgbTexture(cv);
}

/** Anundsjö-red pennant cloth for the wall banner. */
export function pennantTexture(label) {
  const w = 256;
  const h = 128;
  const [cv, ctx] = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#a8202c');
  g.addColorStop(1, '#79161f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(240,208,140,0.8)';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f6ead6';
  ctx.letterSpacing = '4px';
  // Fit the label to the cloth. At a fixed 40px "ANUNDSJÖ IF" is wider than
  // the canvas, so the last letters were sliced off inside the texture —
  // which looks exactly like the pennant being clipped by the frame.
  let size = 44;
  do {
    ctx.font = `700 ${size}px "Schibsted Grotesk", "Space Grotesk", Inter, sans-serif`;
    size -= 2;
  } while (size > 12 && ctx.measureText(label).width > w - 40);
  ctx.fillText(label, w / 2 + 2, h / 2);
  ctx.letterSpacing = '0px';
  return srgbTexture(cv);
}

/** Court barrier cloth: club red, the event's name in white. */
function barrierTexture(label, sub) {
  const w = 512;
  const h = 192;
  const [cv, ctx] = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#8e1a25');
  g.addColorStop(1, '#5e1018');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(242,193,78,0.9)';
  ctx.fillRect(0, 0, w, 7);
  ctx.fillRect(0, h - 7, w, 7);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f6ead6';
  ctx.letterSpacing = '8px';
  let size = 64;
  do {
    ctx.font = `700 ${size}px "Schibsted Grotesk", "Space Grotesk", Inter, sans-serif`;
    size -= 2;
  } while (size > 20 && ctx.measureText(label).width > w - 70);
  ctx.fillText(label, w / 2 + 4, h * 0.44);
  ctx.letterSpacing = '6px';
  ctx.font = '700 24px Inter, sans-serif';
  ctx.fillStyle = 'rgba(242,193,78,0.9)';
  ctx.fillText(sub, w / 2 + 3, h * 0.77);
  ctx.letterSpacing = '0px';
  const tex = srgbTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

/** The ball's print: a seam and two small stars, so spin can be SEEN. */
export function ballTexture() {
  const [cv, ctx] = canvas(128, 64);
  ctx.fillStyle = '#fbf6ec';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = 'rgba(150,140,120,0.5)';
  ctx.fillRect(0, 31, 128, 2);
  ctx.fillStyle = '#f08a24';
  ctx.font = '700 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 32, 20);
  ctx.fillText('★', 96, 44);
  return srgbTexture(cv);
}

/** Pimpled rubber with a small maker's mark near the handle. */
function rubberTexture(hex, mark) {
  const s = 256;
  const [cv, ctx] = canvas(s, s);
  const rand = mulberry(hex & 0xffff);
  ctx.fillStyle = hex === 0xc22b35 ? '#c22b35' : '#1d2026';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(rand() * s, rand() * s, 2, 2);
  }
  if (mark) {
    // The cylinder cap maps canvas +x to "down the blade" once the blade is
    // stood up, so the mark is set a quarter-turn round, near the handle
    ctx.save();
    ctx.translate(s * 0.8, s / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(255,236,200,0.75)';
    ctx.font = '700 22px "Schibsted Grotesk", "Space Grotesk", Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '3px';
    ctx.fillText(mark, 0, 0);
    ctx.restore();
  }
  return srgbTexture(cv);
}

/* -------------------------------------------------------- shared shaders */

/**
 * Fake volumetric cone. A light shaft is densest where the eye looks
 * through the most of it — straight through the middle — so the alpha is
 * the facing ratio, faded down the cone's height. Additive, no depth write.
 */
function coneMaterial(color, intensity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity }
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vH;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vH = uv.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vV;
      varying float vH;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float a = pow(facing, 2.2) * (0.25 + 0.75 * vH * vH) * smoothstep(0.0, 0.25, vH);
        gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
}

/**
 * Dust in the lamp light. Every mote lives in the vertex shader — seeded
 * once, drifted by time — so the CPU pays nothing per frame. A mote only
 * shows while it is inside its cone, which is the whole trick: dust is
 * everywhere in a hall, you only ever see it where the light is.
 */
function dustPoints(lamps, count, pixelRatio) {
  const rand = mulberry(77);
  const apex = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const l = lamps[i % lamps.length];
    apex[i * 3] = l.x;
    apex[i * 3 + 1] = l.y;
    apex[i * 3 + 2] = l.z;
    seed.set([rand(), rand(), rand(), rand()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(apex, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 6);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPR: { value: pixelRatio },
      uIntensity: { value: 1 },
      uColor: { value: new THREE.Color(1, 0.86, 0.62) }
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uPR;
      varying float vA;
      void main() {
        float h = fract(aSeed.x - uTime * (0.006 + aSeed.w * 0.01));
        float y = position.y - 0.12 - h * 2.0;
        float coneR = 0.08 + h * 0.56;
        float ang = aSeed.y * 6.2832 + uTime * 0.05 * (aSeed.z - 0.5);
        float r = sqrt(aSeed.z) * coneR * 1.2;
        vec3 p = vec3(position.x + cos(ang) * r, y, position.z + sin(ang) * r);
        p.x += sin(uTime * 0.35 + aSeed.w * 40.0) * 0.035;
        p.z += cos(uTime * 0.29 + aSeed.x * 40.0) * 0.035;
        float inside = 1.0 - smoothstep(0.7, 1.05, r / (coneR * 1.2) * 1.2);
        float tw = 0.55 + 0.45 * sin(uTime * (1.2 + aSeed.y * 2.0) + aSeed.x * 30.0);
        vA = inside * tw * smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.85, 1.0, h));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // Clamped both ways: a mote that drifts up to the lens must not
        // become a screen-sized blob (or a negative size behind it)
        gl_PointSize = min((2.0 + aSeed.w * 3.0) * uPR * (2.2 / max(0.3, -mv.z)), 16.0 * uPR);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = 1.0 - smoothstep(0.1, 0.5, length(c));
        gl_FragColor = vec4(uColor, d * vA * 0.55 * uIntensity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return pts;
}

/**
 * The lacquer's mirror. Reflector renders the room from below the floor
 * into a half-resolution target; this shader lays it over the planks
 * additively, broken up by the board texture and stronger at grazing
 * angles — new lacquer reflects the lamps, it is not a mirror.
 */
const FloorReflectShader = {
  name: 'PingisFloorReflect',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    tPlanks: { value: null },
    uStrength: { value: 0.8 }
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec2 vPlank;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vPlank = uv * vec2(5.0, 7.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform sampler2D tPlanks;
    uniform float uStrength;
    varying vec4 vUv;
    varying vec2 vPlank;
    varying vec3 vWorld;
    void main() {
      vec2 uv = vUv.xy / max(vUv.w, 1e-4);
      vec3 plank = texture2D(tPlanks, vPlank).rgb;
      float lum = dot(plank, vec3(0.3, 0.5, 0.2));
      // Blurred, and mostly along the view: lacquer on wood smears a
      // light into a streak, it is not glass. The blur is also what keeps
      // the half-resolution, un-antialiased mirror image from crawling
      // when the camera drifts — a single bright texel never decides a
      // pixel on its own.
      vec2 o = vec2(0.003, 0.0045);
      vec3 c = texture2D(tDiffuse, uv).rgb * 0.2;
      c += texture2D(tDiffuse, uv + vec2(o.x, 0.0)).rgb * 0.12;
      c += texture2D(tDiffuse, uv - vec2(o.x, 0.0)).rgb * 0.12;
      c += texture2D(tDiffuse, uv + vec2(0.0, o.y)).rgb * 0.14;
      c += texture2D(tDiffuse, uv - vec2(0.0, o.y)).rgb * 0.14;
      c += texture2D(tDiffuse, uv + vec2(0.0, o.y * 2.4)).rgb * 0.1;
      c += texture2D(tDiffuse, uv - vec2(0.0, o.y * 2.4)).rgb * 0.1;
      c += texture2D(tDiffuse, uv + vec2(0.0, o.y * 4.2)).rgb * 0.04;
      c += texture2D(tDiffuse, uv - vec2(0.0, o.y * 4.2)).rgb * 0.04;
      // Roll off the highlights: a mirrored bulb glows on the boards, it
      // does not feed the bloom a flickering firefly
      float peak = max(max(c.r, c.g), max(c.b, 1e-4));
      c *= min(1.0, 1.1 / peak);
      vec3 v = normalize(cameraPosition - vWorld);
      float fres = 0.3 + 0.7 * pow(1.0 - clamp(v.y, 0.0, 1.0), 2.5);
      gl_FragColor = vec4(c * color * uStrength * fres * (0.45 + lum * 1.4), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};

/* -------------------------------------------------------- merging helper */

/**
 * Bake static props into one mesh per material. The room is a few hundred
 * little boxes; a phone GPU runs out of draw calls long before it runs out
 * of triangles, and the floor mirror renders the room twice. `shallow`
 * merges only a group's own meshes — how each joint of a figure is baked
 * without welding the joints below it.
 */
function mergeStatic(root, shallow = false) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  const m = new THREE.Matrix4();
  const visit = (o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep || Array.isArray(o.material)) return;
    if (o.matrixWorld.determinant() < 0) return; // mirrored: baking would flip its winding
    const g = o.geometry;
    // Transparent glows merge too — additive light has no draw order to
    // keep — but only with others of the same material and render order.
    const key = [
      o.material.uuid,
      g.index ? 'i' : 'n',
      Object.keys(g.attributes).sort().join(','),
      o.castShadow ? 'c' : '',
      o.receiveShadow ? 'r' : '',
      o.renderOrder
    ].join('|');
    if (!buckets.has(key)) {
      buckets.set(key, {
        material: o.material, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, geos: []
      });
    }
    m.multiplyMatrices(inv, o.matrixWorld);
    const gg = g.clone();
    gg.clearGroups();
    gg.applyMatrix4(m);
    buckets.get(key).geos.push(gg);
    victims.push(o);
  };
  if (shallow) root.children.slice().forEach(visit);
  else root.traverse(visit);
  const usedGeos = new Set();
  victims.forEach((o) => {
    o.removeFromParent();
    usedGeos.add(o.geometry);
  });
  usedGeos.forEach((g) => g.dispose());
  buckets.forEach((b) => {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.renderOrder = b.order;
    root.add(mesh);
  });
}

/* -------------------------------------------------------------- the hall */

export const TABLE = {
  length: 2.74,
  width: 1.525,
  height: 0.76,
  netH: 0.1525
};

export const HALL = { W: 9, D: 14, H: 4.2, STAGE_Z: -4.8, STAGE_H: 0.5 };

/**
 * Builds the room. Returns the scene group, the bits index.js animates
 * (lamps, net, scoreboard, reflections) and the seat list for the crowd.
 */
export function buildHall(glow, { tier = 'high', pixelRatio = 1, profile = null } = {}) {
  const group = new THREE.Group();
  const statics = new THREE.Group(); // merged at the end
  group.add(statics);
  const rand = mulberry(7);
  const refs = { lampMats: [], poolMats: [], textures: [] };
  const { W: HALL_W, D: HALL_D, H: HALL_H, STAGE_Z, STAGE_H } = HALL;
  const BACK = -HALL_D / 2;
  const add = (mesh, x, y, z, parent = statics) => {
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  /* Floor: the new dance floor, lacquered */
  const planks = plankTexture();
  const floorMat = standard(0xffffff, 0.46, { map: planks });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, HALL_D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.keep = true;
  group.add(floor);
  refs.floorMat = floorMat;

  // The mirror renders the room again into a half-float target: only where
  // the GPU can render to one (EXT_color_buffer_float) and not in ?gfx=safe
  const mirror = tier === 'high' && (!profile || (profile.floatRT && !profile.safe));
  if (mirror) {
    const reflector = new Reflector(new THREE.PlaneGeometry(HALL_W, HALL_D), {
      textureWidth: 512,
      textureHeight: 512,
      clipBias: 0.003,
      multisample: 0,
      color: 0xfff2dc,
      shader: FloorReflectShader
    });
    reflector.material.uniforms.tPlanks.value = planks;
    reflector.material.transparent = true;
    reflector.material.blending = THREE.AdditiveBlending;
    reflector.material.depthWrite = false;
    // Två millimeter över golvet räcker inte på alla djupbuffertar —
    // spegeln skimrade i fläckar. Förskjut den mot kameran i stället.
    reflector.material.polygonOffset = true;
    reflector.material.polygonOffsetFactor = -4;
    reflector.material.polygonOffsetUnits = -4;
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = 0.002;
    reflector.renderOrder = 0;
    group.add(reflector);
    refs.reflector = reflector;
  }

  /* Phones get the cheap version of the lacquer: a stretched glow on the
     floor where each pendant's mirror image would be — the reflection a
     glance actually registers — moved with the camera every frame. */
  const fakes = [];
  if (!mirror) {
    const streakMat = new THREE.MeshBasicMaterial({
      map: glow, color: 0xffd9a0, transparent: true, opacity: 0.32,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    });
    [[0, 3.24, -1.05], [0, 3.24, 0], [-3, 3.24, -3.2], [3, 3.24, -3.2]].forEach(([x, y, z]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), streakMat);
      m.rotation.order = 'YXZ';
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1;
      group.add(m);
      fakes.push({ m, src: new THREE.Vector3(x, y, z) });
    });
  }
  const toFloor = new THREE.Vector3();
  const updateReflections = (cam) => {
    fakes.forEach(({ m, src }) => {
      // Where the line from the eye to the lamp's mirror image meets the floor
      const t = cam.y / (cam.y + src.y);
      toFloor.set(src.x - cam.x, 0, src.z - cam.z).multiplyScalar(t);
      m.position.set(cam.x + toFloor.x, 0.004, cam.z + toFloor.z);
      m.rotation.y = Math.atan2(toFloor.x, toFloor.z);
      m.scale.set(0.28, 1.1, 1);
    });
  };

  /* Walls: tongue-and-groove above a dark wainscot and a rail */
  const wallTex = boardTexture(0x9c8c6c, { boards: 10, seed: 5, groove: 0.22, repeat: [9, 1] });
  const wallMat = lambert(0xffffff, { map: wallTex });
  const wainTex = boardTexture(0x5f4a30, { boards: 6, seed: 9, groove: 0.4, repeat: [12, 1] });
  const wainMat = lambert(0xffffff, { map: wainTex });
  const railMat = lambert(0x4a3820);
  [
    { w: HALL_D, x: -HALL_W / 2, z: 0, ry: Math.PI / 2 },
    { w: HALL_D, x: HALL_W / 2, z: 0, ry: -Math.PI / 2 },
    { w: HALL_W, x: 0, z: HALL_D / 2, ry: Math.PI }
  ].forEach((def) => {
    const upperGeo = new THREE.PlaneGeometry(def.w, HALL_H - 1.1);
    const upper = add(new THREE.Mesh(upperGeo, wallMat), def.x, 1.1 + (HALL_H - 1.1) / 2, def.z);
    upper.rotation.y = def.ry;
    const wain = add(new THREE.Mesh(new THREE.PlaneGeometry(def.w, 1.1), wainMat), def.x, 0.55, def.z);
    wain.rotation.y = def.ry;
    const rail = add(new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.06, 0.05), railMat), def.x, 1.12, def.z);
    rail.rotation.y = def.ry;
    rail.translateZ(0.03);
  });
  // The gable behind the stage: plain paint, the sign and the board hang on it
  add(new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, HALL_H), wallMat), 0, HALL_H / 2, BACK);

  /* Ceiling with exposed beams */
  const ceil = add(new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, HALL_D), lambert(0x5a4b36)), 0, HALL_H, 0);
  ceil.rotation.x = Math.PI / 2;
  const beamMat = lambert(0x3e2f1b);
  for (let z = BACK + 1.6; z < HALL_D / 2; z += 2.4) {
    add(new THREE.Mesh(new THREE.BoxGeometry(HALL_W, 0.22, 0.16), beamMat), 0, HALL_H - 0.11, z);
  }

  /* Windows on the side walls: blue dusk outside */
  const dusk = duskTexture();
  // A centimetre in front of its frame: depth-offset so it wins on every GPU
  const paneMat = new THREE.MeshBasicMaterial({ map: dusk, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const frameMat = lambert(0xe8e2d4);
  const radMat = lambert(0xd8d2c4);
  const addWindow = (side, z) => {
    const x = side * (HALL_W / 2 - 0.02);
    const ry = -side * Math.PI / 2;
    const g = new THREE.Group();
    g.position.set(x, 2.1, z);
    g.rotation.y = ry;
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), paneMat));
    // The frame box sits BEHIND the pane: its front face has to stay
    // behind z = 0, or it paints over the glass (it did, for years)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.64, 0.07), frameMat);
    frame.position.z = -0.045;
    g.add(frame);
    [[1.24, 0.04], [0.04, 1.64]].forEach(([mw, mh]) => {
      const mull = new THREE.Mesh(new THREE.BoxGeometry(mw, mh, 0.03), frameMat);
      mull.position.z = 0.02;
      g.add(mull);
    });
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.04, 0.16), frameMat);
    sill.position.set(0, -0.84, 0.06);
    g.add(sill);
    // A ribbed radiator under the sill — the bygdegård detail
    for (let i = 0; i < 9; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.08), radMat);
      fin.position.set(-0.36 + i * 0.09, -1.45, 0.08);
      g.add(fin);
    }
    statics.add(g);
  };
  addWindow(-1, -2.9);
  addWindow(-1, -0.4);
  addWindow(-1, 2.1);
  addWindow(1, -2.2);
  addWindow(1, 0.3);

  /* Wall sconces between the windows: warm accents the bloom picks up */
  const sconceGlow = new THREE.MeshBasicMaterial({
    map: glow, color: 0xffb070, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const sconceCup = lambert(0xd9c9a0, { side: THREE.DoubleSide });
  const sconceBulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.4), toneMapped: false });
  [[-1, -4.2], [-1, -1.65], [1, -3.1], [1, -1.0]].forEach(([side, z]) => {
    const x = side * (HALL_W / 2 - 0.08);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.14, 10, 1, true), sconceCup), x, 2.55, z);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), sconceBulb), x, 2.58, z);
    const halo = add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), sconceGlow), x - side * 0.03, 2.62, z);
    halo.rotation.y = -side * Math.PI / 2;
    halo.renderOrder = 3;
  });

  /* Pendant lamps over the table — the hall's dominant light, drawn */
  refs.lampApex = [];
  const shadeMat = standard(0x1d5a43, 0.38, { side: THREE.DoubleSide, metalness: 0.3 });
  const cordMat = lambert(0x1a1611);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.3, 2.2), toneMapped: false });
  const pendant = (x, z, { fixture = true, cone = true, pool = true, coneI = 1 } = {}) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    if (fixture) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, HALL_H - 3.4, 5), cordMat);
      cord.position.y = HALL_H - (HALL_H - 3.4) / 2;
      g.add(cord);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.17, 20, 1, true), shadeMat);
      shade.position.y = 3.32;
      g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), bulbMat);
      bulb.position.y = 3.24;
      g.add(bulb);
    }
    if (cone) {
      const mat = coneMaterial(0xffe2b0, 0.11 * coneI);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.62, 2.1, 28, 1, true), mat);
      c.position.y = 2.15;
      c.renderOrder = 4;
      g.add(c);
      refs.lampMats.push({ mat, base: 0.11 * coneI });
      refs.lampApex.push(new THREE.Vector3(x, 3.22, z));
    }
    if (pool) {
      const pm = new THREE.MeshBasicMaterial({
        map: glow, color: 0xffdf9e, transparent: true, opacity: 0.05,
        depthWrite: false, blending: THREE.AdditiveBlending,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
      });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), pm);
      p.rotation.x = -Math.PI / 2;
      p.position.y = 0.012;
      p.renderOrder = 1;
      g.add(p);
      refs.poolMats.push({ mat: pm, base: 0.05 });
    }
    statics.add(g);
  };
  // The nearest pendant hangs over the player's head, out of frame: its
  // fixture would float as a pale ellipse over the HUD and its cone would
  // wash the whole frame, so it keeps only its pool of light.
  pendant(0, -1.05);
  pendant(0, 0);
  pendant(0, 1.05, { fixture: false, cone: false });
  // A second row over the wall seating, seen only through the wide lens
  pendant(-3, -3.2, { pool: false, coneI: 0.6 });
  pendant(3, -3.2, { pool: false, coneI: 0.6 });

  refs.dust = dustPoints(refs.lampApex.slice(0, 2).concat(refs.lampApex.slice(0, 2), refs.lampApex.slice(2)),
    tier === 'high' ? 420 : 180, pixelRatio);
  group.add(refs.dust);

  /* ---- The table ------------------------------------------------------- */
  const T = TABLE;
  const table = new THREE.Group();
  const edgeCv = canvas(64, 16);
  edgeCv[1].fillStyle = '#123c66';
  edgeCv[1].fillRect(0, 0, 64, 16);
  edgeCv[1].fillStyle = '#f3f6fb';
  edgeCv[1].fillRect(0, 0, 64, 5);
  const edgeMat = standard(0xffffff, 0.45, { map: srgbTexture(edgeCv[0]) });
  // Competition lacquer: a clear coat over the blue, so the pendants and
  // the room lie IN the table as soft reflections. Broad on purpose (a
  // tight coat would turn each lamp into a tiny, blinking glint).
  const topMat = tier === 'high'
    ? new THREE.MeshPhysicalMaterial({
      map: tableTexture(), roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.2
    })
    : standard(0xffffff, 0.34, { map: tableTexture() });
  refs.tableTopMat = topMat;
  // The slab in the edge paint, the playing surface as its own plane: one
  // material per mesh, so the slab bakes in with the rest of the table.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(T.width, 0.045, T.length), edgeMat);
  slab.position.y = T.height - 0.0225;
  slab.castShadow = true;
  table.add(slab);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(T.width, T.length), topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = T.height + 0.0004;
  // 0,4 mm över kantfärgen: på ett 16-bitars djupbuffert kan de två ytorna
  // inte skiljas åt och bordet flimrade blått/vitt. Djupförskjutningen gör
  // att spelytan alltid vinner, oavsett krets.
  topMat.polygonOffset = true;
  topMat.polygonOffsetFactor = -2;
  topMat.polygonOffsetUnits = -2;
  top.receiveShadow = true;
  table.add(top);

  const legMat = standard(0x20252d, 0.5, { metalness: 0.5 });
  const wheelMat = lambert(0x111318);
  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sz) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, T.height - 0.05, 0.06), legMat);
      leg.position.set(sx * (T.width / 2 - 0.18), (T.height - 0.05) / 2, sz * (T.length / 2 - 0.3));
      leg.castShadow = true;
      table.add(leg);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * (T.width / 2 - 0.18), 0.045, sz * (T.length / 2 - 0.3));
      table.add(wheel);
    });
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, T.length - 0.7), legMat);
    brace.position.set(sx * (T.width / 2 - 0.18), 0.32, 0);
    table.add(brace);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, T.length - 0.2), legMat);
    apron.position.set(sx * (T.width / 2 - 0.08), T.height - 0.085, 0);
    table.add(apron);
  });

  /* Net: posts, a tape with the event's name, and a real mesh in canvas.
     Painted at twice the size it is ever seen, with soft lines, so the
     mipmaps always have something to average: a mesh drawn one texel wide
     at screen size crawls and moirés whenever the camera drifts. */
  const [netCv, nctx] = canvas(1024, 128);
  nctx.fillStyle = 'rgba(20,26,36,0.5)';
  nctx.fillRect(0, 0, 1024, 128);
  nctx.strokeStyle = 'rgba(225,232,245,0.42)';
  nctx.lineWidth = 3;
  for (let x = 0; x <= 1024; x += 20) {
    nctx.beginPath(); nctx.moveTo(x, 0); nctx.lineTo(x, 128); nctx.stroke();
  }
  for (let y = 0; y <= 128; y += 20) {
    nctx.beginPath(); nctx.moveTo(0, y); nctx.lineTo(1024, y); nctx.stroke();
  }
  nctx.fillStyle = '#f3f6fb';
  nctx.fillRect(0, 0, 1024, 22);
  nctx.fillStyle = '#1d4f86';
  nctx.font = '700 18px Inter, sans-serif';
  nctx.textAlign = 'center';
  nctx.textBaseline = 'middle';
  nctx.letterSpacing = '6px';
  nctx.fillText('PEKKAS POKAL · 2019', 512, 12);
  const netTex = new THREE.CanvasTexture(netCv);
  netTex.colorSpace = THREE.SRGBColorSpace;
  netTex.anisotropy = 8;
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(T.width + 0.3, T.netH, 24, 1),
    new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide })
  );
  net.position.y = T.height + T.netH / 2;
  net.renderOrder = 2;
  net.userData.keep = true; // its vertices shiver after a net ball
  table.add(net);
  refs.net = net;
  refs.netBase = Float32Array.from(net.geometry.attributes.position.array);
  [-1, 1].forEach((s) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, T.netH + 0.05, 8), legMat);
    post.position.set(s * (T.width / 2 + 0.15), T.height + (T.netH + 0.05) / 2 - 0.02, 0);
    table.add(post);
  });
  statics.add(table);

  /* ---- Court barriers: the red surround a competition puts up --------- */
  const barMats = [
    standard(0xffffff, 0.75, { map: barrierTexture('PEKKAS POKAL', 'BREDBYN 2019') }),
    standard(0xffffff, 0.75, { map: barrierTexture('ANUNDSJÖ IF', 'OLYMPIA · SEDAN 1938') })
  ];
  const footMat = lambert(0x1a1416);
  const barrier = (x, z, ry, k) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.6, 0.03), barMats[k % 2]);
    panel.position.y = 0.36;
    panel.receiveShadow = true;
    g.add(panel);
    [-0.6, 0.6].forEach((fx) => {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.34), footMat);
      foot.position.set(fx, 0.03, 0);
      g.add(foot);
    });
    statics.add(g);
  };
  for (let i = 0; i < 4; i++) barrier(-2.1 + i * 1.4, -3.55, 0, i);
  for (let i = 0; i < 3; i++) {
    barrier(-2.95, -2.8 + i * 1.4, Math.PI / 2, i + 1);
    barrier(2.95, -2.8 + i * 1.4, -Math.PI / 2, i);
  }

  /* ---- The stage, framed as a proscenium -------------------------------- */
  const stageTex = boardTexture(0x4a3622, { boards: 14, seed: 13, groove: 0.45, repeat: [4, 1] });
  const stageFront = lambert(0xffffff, { map: stageTex });
  const stageTop = standard(0x5a4128, 0.6);
  const stage = add(new THREE.Mesh(new THREE.BoxGeometry(HALL_W, STAGE_H, -STAGE_Z + BACK),
    [stageFront, stageFront, stageTop, stageFront, stageFront, stageFront]), 0, STAGE_H / 2, (STAGE_Z + BACK) / 2);
  stage.receiveShadow = true;
  stage.userData.keep = true;
  group.add(stage);
  // Two steps up on the right
  [0, 1].forEach((i) => {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.17 * (i + 1), 0.3), stageTop);
    add(step, 3.7, 0.085 * (i + 1), STAGE_Z + 0.45 - i * 0.3);
  });

  const velvetMat = (folds) => standard(0xffffff, 0.86, { map: velvetTexture(folds) });
  const pleat = (w, h, folds, amp) => {
    const geo = new THREE.PlaneGeometry(w, h, Math.max(24, folds * 6), 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) + w / 2) / w;
      p.setZ(i, Math.sin(u * folds * Math.PI * 2) * amp);
    }
    geo.computeVertexNormals();
    return geo;
  };
  // The back curtain (bakridå), closed, hanging under the sign. At full
  // height it would stand IN FRONT of the house sign and swallow it — the
  // sign sits further back on the wall, so this has to stop below it.
  {
    const c = new THREE.Mesh(pleat(HALL_W - 1.6, 1.5, 22, 0.07), velvetMat(22));
    c.position.set(0, STAGE_H + 0.75, BACK + 0.32);
    statics.add(c);
  }
  // Proscenium: side walls and a header, a gold bead round the opening
  const proMat = lambert(0x7d6c52);
  const OPEN = 3.15; // half-width of the opening
  const OPEN_TOP = 3.3;
  [-1, 1].forEach((s) => {
    const w = HALL_W / 2 - OPEN;
    const side = new THREE.Mesh(new THREE.BoxGeometry(w, HALL_H - STAGE_H, 0.3), proMat);
    add(side, s * (OPEN + w / 2), STAGE_H + (HALL_H - STAGE_H) / 2, STAGE_Z - 0.2);
  });
  const header = new THREE.Mesh(new THREE.BoxGeometry(OPEN * 2, HALL_H - OPEN_TOP, 0.3), proMat);
  add(header, 0, OPEN_TOP + (HALL_H - OPEN_TOP) / 2, STAGE_Z - 0.2);
  const goldMat = standard(0xc9963a, 0.35, { metalness: 0.8 });
  [-1, 1].forEach((s) => {
    const bead = new THREE.Mesh(new THREE.BoxGeometry(0.06, OPEN_TOP - STAGE_H, 0.06), goldMat);
    add(bead, s * OPEN, (OPEN_TOP + STAGE_H) / 2, STAGE_Z - 0.04);
  });
  add(new THREE.Mesh(new THREE.BoxGeometry(OPEN * 2 + 0.06, 0.06, 0.06), goldMat), 0, OPEN_TOP, STAGE_Z - 0.04);
  // The main curtain (ridå), drawn and gathered at each side
  [-1, 1].forEach((s) => {
    const geo = pleat(0.95, OPEN_TOP - STAGE_H, 6, 0.06);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // Gather toward the outer edge around the tie-back
      const y = p.getY(i) / (OPEN_TOP - STAGE_H) + 0.5; // 0 bottom … 1 top
      const pinch = 1 - 0.55 * Math.exp(-(((y - 0.42) / 0.16) ** 2));
      p.setX(i, (p.getX(i) + 0.475) * pinch - 0.475);
    }
    geo.computeVertexNormals();
    const c = new THREE.Mesh(geo, velvetMat(6));
    c.position.set(s * (OPEN - 0.42), (OPEN_TOP + STAGE_H) / 2, STAGE_Z - 0.5);
    c.scale.x = -s;
    statics.add(c);
  });
  // The valance (kappa) across the top of the opening, with a gold fringe
  {
    const v = new THREE.Mesh(pleat(OPEN * 2 - 0.1, 0.34, 34, 0.035), velvetMat(34));
    v.position.set(0, OPEN_TOP - 0.17, STAGE_Z - 0.34);
    statics.add(v);
    add(new THREE.Mesh(new THREE.BoxGeometry(OPEN * 2 - 0.1, 0.035, 0.05), goldMat), 0, OPEN_TOP - 0.35, STAGE_Z - 0.3);
  }
  // Stage lights on the header bar
  const canMat = lambert(0x15171c);
  const spotGlow = new THREE.MeshBasicMaterial({
    map: glow, color: 0xffd9a0, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  [-2.4, -0.8, 0.8, 2.4].forEach((x) => {
    const canGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.2, 10);
    const can = add(new THREE.Mesh(canGeo, canMat), x, OPEN_TOP - 0.5, STAGE_Z - 0.55);
    can.rotation.x = -0.6;
    const halo = add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), spotGlow), x, OPEN_TOP - 0.56, STAGE_Z - 0.44);
    halo.renderOrder = 3;
  });
  // A warm wash down onto the stage from those lights
  const stageWash = new THREE.PointLight(0xffc58a, 2.2, 6, 2);
  stageWash.position.set(0, OPEN_TOP - 0.6, STAGE_Z - 0.4);
  group.add(stageWash);

  /* The house sign over the back curtain — Olympia has carried that name
     since 1938, and the gable above the stage is where a hall puts it. */
  {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.69),
      new THREE.MeshBasicMaterial({
        map: olympiaSignTexture(), color: 0xdddddd, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      })
    );
    sign.position.set(0, 2.42, BACK + 0.2);
    sign.userData.keep = true;
    group.add(sign);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.89, 0.1), lambert(0x2a1f14)), 0, 2.42, BACK + 0.13);
    const wash = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 1.7),
      new THREE.MeshBasicMaterial({
        map: glow, color: 0xff9a72, transparent: true, opacity: 0.07,
        depthWrite: false, blending: THREE.AdditiveBlending
      })
    );
    wash.position.set(0, 2.34, BACK + 0.32);
    wash.renderOrder = 3;
    group.add(wash);
    const signLamp = new THREE.PointLight(0xff9c6a, 1.4, 5, 2);
    signLamp.position.set(0, 2.1, BACK + 0.9);
    group.add(signLamp);
  }

  /* Anundsjö IF's pennant, hung to the right of the house sign.
     Measured, not guessed: on a phone the back wall shows only ±2.6 units
     either side of centre, so the wall gets exactly three things —
     scoreboard, sign, pennant — laid out inside that. */
  {
    const pen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.04, 0.52),
      new THREE.MeshBasicMaterial({ map: pennantTexture('ANUNDSJÖ IF'), color: 0xcccccc })
    );
    pen.position.set(1.97, 2.42, BACK + 0.22);
    pen.userData.keep = true;
    group.add(pen);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.05, 0.05), lambert(0x2a1f14)), 1.97, 2.72, BACK + 0.24);
  }

  /* Scoreboard on the back wall — scoreboard.js paints the flaps */
  {
    add(new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.64, 0.08), lambert(0x15120e)), -1.97, 2.42, BACK + 0.2);
    // A centimetre proud of its box, so depth-offset (see the table top)
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.54), new THREE.MeshBasicMaterial({
      color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }));
    board.position.set(-1.97, 2.42, BACK + 0.25);
    group.add(board);
    refs.scoreboard = board;
  }

  /* Prize table on stage right: the cups for the night, under a spot */
  {
    const g = new THREE.Group();
    g.position.set(2.55, STAGE_H, -5.95);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 0.55), standard(0xefe9dc, 0.9));
    cloth.position.y = 0.36;
    g.add(cloth);
    const runner = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.2, 0.59), standard(0xa8202c, 0.8));
    runner.position.y = 0.6;
    g.add(runner);
    [[-0.32, 0x9c6a3a, 0.7], [0.32, 0xb8bcc4, 0.82], [0, 0xf2c14e, 1.05]].forEach(([x, col, s]) => {
      const cup = buildTrophy(col, s * 0.42);
      cup.position.set(x, 0.72, 0);
      g.add(cup);
    });
    statics.add(g);
  }

  /* An upright piano on stage left — every bygdegård stage has one */
  {
    const g = new THREE.Group();
    g.position.set(-2.55, STAGE_H, -6.0);
    const pianoMat = standard(0x1c120d, 0.4);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.15, 0.55), pianoMat);
    body.position.y = 0.575;
    g.add(body);
    const keys = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 0.22), standard(0xf1ece0, 0.4));
    keys.position.set(0, 0.72, 0.36);
    g.add(keys);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.3), pianoMat);
    lid.position.set(0, 0.76, 0.4);
    g.add(lid);
    statics.add(g);
  }

  /* Pekkas bunting strung across the room: one instanced draw */
  {
    const flagGeo = new THREE.BufferGeometry();
    flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.075, 0, 0, 0.075, 0, 0, 0, -0.2, 0], 3));
    flagGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const strings = [
      [-4.4, 3.75, -3.9, 4.4, 3.75, -3.9],
      [-4.4, 3.8, -1.6, 4.4, 3.8, -1.6],
      [-4.4, 3.7, -5.2, -1.2, 3.85, -0.4],
      [4.4, 3.7, -5.2, 1.2, 3.85, -0.4]
    ];
    const per = 22;
    const flags = new THREE.InstancedMesh(flagGeo, lambert(0xffffff, { side: THREE.DoubleSide }), strings.length * per);
    const cols = [new THREE.Color(0xf2c14e), new THREE.Color(0x2e5f9e), new THREE.Color(0xd8394d)];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const segs = [];
    let n = 0;
    strings.forEach(([x0, y0, z0, x1, y1, z1]) => {
      const pts = [];
      for (let i = 0; i <= per; i++) {
        const k = i / per;
        p.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 0.3, z0 + (z1 - z0) * k);
        pts.push(p.clone());
        if (i === per) break;
        e.set((rand() - 0.5) * 0.3, Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2, (rand() - 0.5) * 0.15);
        q.setFromEuler(e);
        m.compose(p, q, s);
        flags.setMatrixAt(n, m);
        flags.setColorAt(n, cols[n % 3]);
        n++;
      }
      for (let i = 1; i < pts.length; i++) segs.push(pts[i - 1], pts[i]);
    });
    group.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(segs),
      new THREE.LineBasicMaterial({ color: 0x2a2018 })
    ));
    flags.count = n;
    group.add(flags);
  }

  /* Fika table under the left window: thermos and kanelbullar */
  {
    const fika = new THREE.Group();
    fika.position.set(-3.95, 0, -3.2);
    fika.rotation.y = Math.PI / 2;
    const ftop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.7), standard(0xe8e2d4, 0.8));
    ftop.position.y = 0.72;
    fika.add(ftop);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.22, 0.72), standard(0xa8202c, 0.85));
    cloth.position.y = 0.62;
    fika.add(cloth);
    [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.7, 6), lambert(0x8a8478));
      leg.position.set(x, 0.35, z);
      fika.add(leg);
    });
    const thermos = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.08, 0.26, 12),
      standard(0xb8422e, 0.4, { metalness: 0.3 })
    );
    thermos.position.set(-0.4, 0.88, 0);
    fika.add(thermos);
    const bulleMat = standard(0xc9903e, 0.75);
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 6), bulleMat);
      b.scale.y = 0.5;
      b.position.set(0.05 + (i % 4) * 0.12, 0.765, -0.1 + Math.floor(i / 4) * 0.14);
      fika.add(b);
    }
    [-0.15, 0.55].forEach((x) => {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 10), standard(0xf4f1ea, 0.4));
      cup.position.set(x, 0.79, 0.18);
      fika.add(cup);
    });
    statics.add(fika);
  }

  /* Wall bars (ribbstolar) on the right wall — the hall is a gym too */
  {
    const g = new THREE.Group();
    g.position.set(HALL_W / 2 - 0.12, 0, -3.95);
    const woodMat = lambert(0xc8a06a);
    [-0.45, 0.45].forEach((z) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.06), woodMat);
      rail.position.set(0, 1.3, z);
      g.add(rail);
    });
    for (let i = 0; i < 16; i++) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), woodMat);
      rung.rotation.x = Math.PI / 2;
      rung.position.set(-0.01, 0.2 + i * 0.15, 0);
      g.add(rung);
    }
    statics.add(g);
  }

  /* Wall clock on the proscenium — every bygdegård has one, and it dates
     the room */
  {
    const cz = STAGE_Z - 0.03;
    const decal = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    add(new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), lambert(0xf0ece0, decal)), 3.82, 2.55, cz);
    add(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 20), lambert(0x2a1f14)), 3.82, 2.55, cz);
    [[0.16, -0.5], [0.1, 1.9]].forEach(([len, ang]) => {
      const geo = new THREE.BoxGeometry(0.012, len, 0.01);
      geo.translate(0, len / 2, 0);
      const hand = add(new THREE.Mesh(geo, lambert(0x22262e, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })), 3.82, 2.55, cz + 0.01);
      hand.rotation.z = ang;
    });
  }

  /* Seats along the walls: folding chairs, the crowd fills most of them */
  refs.seats = [];
  const chairMat = lambert(0x7a4a26);
  const chairLeg = lambert(0x2b2b2e);
  const chair = (x, z, ry) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), chairMat);
    seat.position.y = 0.45;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.035), chairMat);
    back.position.set(0, 0.7, -0.2);
    g.add(back);
    [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.45, 0.025), chairLeg);
      leg.position.set(lx, 0.225, lz);
      g.add(leg);
    });
    statics.add(g);
  };
  // Only as far forward as the wide lens sees them well: a spectator right
  // beside the camera is a blurred giant at the edge of the frame. A seat
  // is the centre of the seat's top (crowd.js puts each figure on it).
  for (let i = 0; i < 4; i++) {
    const z = -2.25 + i * 0.62;
    chair(-3.55, z, Math.PI / 2 - 0.2);
    if (i !== 2) refs.seats.push({ x: -3.55, y: 0.45, z, ry: Math.PI / 2 - 0.2, pose: 'sit' });
  }
  for (let i = 0; i < 4; i++) {
    const z = -2.5 + i * 0.62;
    chair(3.55, z, -Math.PI / 2 + 0.2);
    if (i !== 1) refs.seats.push({ x: 3.55, y: 0.45, z, ry: -Math.PI / 2 + 0.2, pose: 'sit' });
  }
  // On the front lip of the stage, legs dangling over the edge, facing the
  // table. Staggered a little in depth: a row of identical heads at one z
  // reads as a fence, not as people.
  for (let i = 0; i < 9; i++) {
    if (i === 4) continue; // a gap behind the opponent's head
    const x = -2.72 + i * 0.68 + (rand() - 0.5) * 0.1;
    refs.seats.push({ x, y: STAGE_H, z: STAGE_Z - 0.13 - rand() * 0.05, ry: (rand() - 0.5) * 0.3, pose: 'sit' });
  }
  // A standing row at the back of the stage
  [-2.2, -1.5, -0.6, 0.55, 1.35, 1.95].forEach((x) => {
    refs.seats.push({ x, y: STAGE_H, z: -5.55 - rand() * 0.25, ry: (rand() - 0.5) * 0.4, pose: 'stand' });
  });
  // The wide lens also finds the far corners of the floor: a few more on
  // their feet there, by the fika table and the wall bars, turned to the
  // table. A phone never sees them, so it never draws them either.
  if (tier === 'high') {
    [[-3.3, -3.95], [-3.8, -4.45], [3.45, -3.25], [3.3, -4.3]].forEach(([x, z]) => {
      refs.seats.push({ x, y: 0, z, ry: Math.atan2(-x, -1 - z) + (rand() - 0.5) * 0.3, pose: 'stand' });
    });
  }

  mergeStatic(statics);
  return { group, refs, updateReflections };
}

/* -------------------------------------------------------------- trophies */

/**
 * A cup on a plinth, turned on a lathe. `scale` 1 is the big Pekkas Pokal
 * that comes out when the tournament is won.
 */
export function buildTrophy(color = 0xf2c14e, scale = 1, envMap = null) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color, metalness: 1, roughness: 0.24, envMap, envMapIntensity: 1.4
  });
  const prof = [
    [0.0, 0.0], [0.11, 0.0], [0.11, 0.02], [0.07, 0.04], [0.035, 0.07], [0.028, 0.16],
    [0.05, 0.19], [0.03, 0.21], [0.06, 0.24], [0.14, 0.31], [0.165, 0.42], [0.17, 0.5],
    [0.16, 0.5], [0.155, 0.43], [0.0, 0.33]
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), metal);
  cup.castShadow = true;
  g.add(cup);
  [-1, 1].forEach((s) => {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.012, 6, 14, Math.PI * 1.2), metal);
    h.position.set(s * 0.17, 0.4, 0);
    h.rotation.z = s > 0 ? -Math.PI * 0.6 : Math.PI * 0.4;
    g.add(h);
  });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), standard(0x1c120d, 0.45));
  plinth.position.y = -0.04;
  g.add(plinth);
  g.scale.setScalar(scale);
  g.userData.metal = metal;
  return g;
}

/**
 * A paddle: red rubber one side, black the other, a layered blade edge and
 * a flared handle. `opts.mark` prints a maker's name on the red rubber.
 */
export function buildPaddle(opts = {}) {
  const g = new THREE.Group();
  // The group's origin is the GRIP — the point the fist closes around —
  // with the blade reaching out along +y beyond it. Building it around the
  // blade's centre instead is what had the opponent clutching the rubber
  // with the handle swinging free below his hand.
  const wood = standard(0xb08a54, 0.6);
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.085, 3, 8), wood);
  handle.scale.z = 0.72;
  handle.position.y = -0.048;
  g.add(handle);
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.024, 10), standard(0x7a5a33, 0.55));
  butt.scale.z = 0.7;
  butt.position.y = -0.104;
  g.add(butt);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.022), wood);
  neck.position.y = 0.018;
  g.add(neck);

  const red = standard(0xffffff, 0.55, { map: rubberTexture(0xc22b35, opts.mark) });
  const black = standard(0xffffff, 0.6, { map: rubberTexture(0x1d2026) });
  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.098, 0.098, 0.014, 32),
    [standard(0xe8dcc8, 0.6), red, black]
  );
  blade.rotation.x = Math.PI / 2; // flat faces look along ±z
  blade.scale.x = 0.955; // a real blade is a touch taller than it is wide
  blade.position.y = 0.112; // clear of the hand, as a blade sits
  blade.castShadow = true;
  g.add(blade);
  mergeStatic(g, true);
  g.userData.rubber = red;
  return g;
}
