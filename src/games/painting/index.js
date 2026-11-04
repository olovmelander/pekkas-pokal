/**
 * Pekkas Måleri — the 2021 competition as a Three.js painting game.
 *
 * The real thing, from Olov Melander's winner's story: on 7 August 2021 in
 * the garden at Terrassvägen 47 in Örnsköldsvik, everyone drew a slip from
 * a hat with an artist and a famous painting on it, and had a couple of
 * hours to replicate it on an easel. Mikael Hägglund was brought in as the
 * culture profile to judge, and gave it to Munch's Skriet — Olov's — for
 * "capturing the essence of Munch's masterpiece". Per Vikman and Henrik
 * Lundqvist arranged; the dress code was high-culture profile, and Per
 * Olsson turned up as the ceramicist Hans Hedberg in a red beret.
 *
 * The game keeps the ritual — hat, slip, easel, verdict — and makes the
 * verb the one thing that actually decides whether a copy reads as the
 * original: COLOUR. You mix each colour from red, yellow, blue, white and
 * black on a real subtractive palette, then lay it down. Get the hue and
 * value right and Hägglund is kind. Get them wrong and he is not.
 *
 * Module map: artworks.js holds the motifs and the colour science,
 * canvasart.js turns colours into brushwork, palette.js is the palette in
 * your hand, garden.js the world, hud.js the markup, audio.js the sound.
 * This file is the evening itself: the camera, the flow and the scoring.
 */

import * as THREE from 'three';
import { Sfx } from './audio.js';
import {
  mulberry, buildGarden, animateGarden, buildSky, buildEasel, buildBrush, buildPainter, buildJudge
} from './garden.js';
import {
  ARTWORKS, mixPigments, colourDistance, hexToRgb, rgbToCss, paintIdMap,
  mixAdvice, accuracy, MATCH_DE, MAX_DROPS
} from './artworks.js';
import { ART_W, ART_H, LiveCanvas, renderPainting, analyse } from './canvasart.js';
import { Palette, PIGMENTS } from './palette.js';
import { buildHud, starsHtml, grade1, fmt, esc } from './hud.js';

/** Fill the whole stage on desktop; the HUD lays itself out per aspect. */
export const layout = 'full';

const HIGHSCORE_KEY = 'pp-maleri-highscore';
const BEST_KEY = 'pp-maleri-best';
const GALLERY_KEY = 'pp-maleri-gallery';
const GALLERY_MAX = 24;
const WORKS_PER_GAME = 3;
const ROUND_SECONDS = 95;
/** Seconds stuck on one region before the palette points at a pigment. */
const TIP_AFTER = 5;

/**
 * Mikael Hägglund's verdicts, by grade. He was invited as the culture
 * profile and took the job seriously enough to motivate the winner.
 */
const VERDICTS = [
  { at: 9.0, say: 'Du har fångat essensen. Precis så motiverade jag segraren 2021.' },
  { at: 7.5, say: 'Stark tolkning. Färgerna sitter där de ska.' },
  { at: 6.0, say: 'Godkänt. Lite grumligt i mellantonerna, men jag ser vad du menar.' },
  { at: 4.5, say: 'Jag känner igen motivet. Paletten är en annan historia.' },
  { at: 3.0, say: 'Modigt. Fel, men modigt.' },
  { at: 0, say: 'Det här är inte konst. Det är en olycka i en färghandel.' }
];

/** Stars sit on the same lines as his verdicts: godkänt, stark, essensen. */
const STARS_AT = [6.0, 7.5, 9.0];
const starsFor = (g) => STARS_AT.filter((s) => g >= s).length;

/* Easel geometry, shared by the build and the camera framing. */
const CANVAS_W = 1.12;
const CANVAS_H = 1.22;
const EASEL_Z = -0.55;
const CANVAS_C = new THREE.Vector3(0, 0.98 + CANVAS_H / 2, EASEL_Z + 0.06);
/** What the easel shot keeps in frame: the canvas and its stretcher. */
const FRAME_W = CANVAS_W + 0.12;
const FRAME_H = CANVAS_H + 0.14;

/**
 * Longest step the simulation takes in one frame. The delta is clamped at
 * BOTH ends: a frame timestamp that predates the timer's last reset (shader
 * compilation can block the main thread for seconds) gives a negative delta,
 * and every countdown would run backwards.
 */
const MAX_STEP = 0.1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** localStorage that survives private mode and a full disk. */
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* private mode or full: the evening still counts, it just isn't kept */
    }
  }
};

const packRgb = (c) => (c ? (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255) : -1);
const unpackRgb = (h) => (h >= 0 ? hexToRgb(h) : null);

/**
 * Screen layout per aspect. The numbers are mirrored into CSS variables, so
 * the camera framing and the HUD can never disagree about where the free
 * space for the easel is.
 */
function layoutFor(W, H) {
  const wide = W / H >= 1.08 && W >= 640;
  if (wide) {
    const side = Math.round(clamp(W * 0.19, 180, 290));
    const panel = Math.round(clamp(W * 0.25, 280, 380));
    const top = 64;
    const left = 16 + side + 14;
    const right = 16 + panel + 14;
    return {
      wide, side, panel, top, sheet: 0,
      card: Math.round(clamp(W * 0.44, 400, 620)),
      free: { x: left, y: top, w: W - left - right, h: H - top - 14 }
    };
  }
  const sheet = Math.round(clamp(H * 0.37, 250, 330));
  const top = 58;
  return {
    wide, side: 0, panel: 0, top, sheet,
    card: W,
    free: { x: 6, y: top, w: W - 12, h: H - sheet - top - 8 }
  };
}

/* ------------------------------------------------------------------- game */

export async function createPainting(container) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const box0 = container.getBoundingClientRect();
  // Phones and small screens get a lighter garden and a smaller shadow map
  const lowTier = coarse || Math.min(box0.width, box0.height) < 520;

  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas pm-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui pm-ui';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost);
  hudHost.dataset.phase = 'idle';

  const sfx = new Sfx();
  // The hat is shuffled differently every evening
  const rand = mulberry((Date.now() ^ 0x2021) & 0x7fffffff);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowTier ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral, not ACES: this is a game about getting a colour exactly right,
  // and ACES shifts hue and saturation on the way to the screen. Khronos'
  // neutral curve keeps the canvas reading as the colour you mixed.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  // r187: PCF with a hardware-compared Vogel disk; radius sets the softness
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // The fog colour has to be the sky's HORIZON colour, not its average, or
  // the far spruces fade into a band that does not exist in the sky behind.
  scene.fog = new THREE.Fog(0xc9d9dd, 30, 78);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 140);

  scene.add(buildSky());

  /* Lights: one warm low sun casting everything, a cool sky fill, a bounce */
  scene.add(new THREE.HemisphereLight(0xc6dcf4, 0x5a6a34, 0.95));

  const sun = new THREE.DirectionalLight(0xfff0cf, 2.25);
  sun.position.set(-8, 13, 6);
  sun.target.position.set(0, 1, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowTier ? 1024 : 2048, lowTier ? 1024 : 2048);
  sun.shadow.camera.left = -11;
  sun.shadow.camera.right = 11;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -7;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 32;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  // Layer 1 holds the birch canopy that only exists as dappled shade
  sun.shadow.camera.layers.enable(1);
  scene.add(sun, sun.target);

  const bounce = new THREE.DirectionalLight(0x9cb060, 0.32);
  bounce.position.set(2, -3, 4);
  scene.add(bounce);

  // A cool back light so the spruces and the painters keep an edge against
  // the sky instead of silhouetting into one flat mass
  const rim = new THREE.DirectionalLight(0xbcd2e8, 0.55);
  rim.position.set(5, 5, -12);
  scene.add(rim);

  /*
   * Reflections for the one physically based surface in the garden, the
   * wet paint: a tiny scene of the same sky over a lawn-coloured ground,
   * prefiltered once. Fresh oil picks up the sky; bare linen does not.
   */
  let envRT = null;
  {
    const envScene = new THREE.Scene();
    const sky = buildSky();
    envScene.add(sky);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(50, 16),
      new THREE.MeshBasicMaterial({ color: 0x4d6a2c })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    envScene.add(ground);
    const pmrem = new THREE.PMREMGenerator(renderer);
    envRT = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    envScene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    scene.environment = envRT.texture;
  }

  /* World */
  const garden = buildGarden({ lowTier });
  scene.add(garden.group);

  /* ---- The player's canvas ------------------------------------------- */

  const live = new LiveCanvas(ART_W, ART_H);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const artTex = new THREE.CanvasTexture(live.art);
  artTex.colorSpace = THREE.SRGBColorSpace;
  artTex.anisotropy = maxAniso;
  const surfTex = new THREE.CanvasTexture(live.surface);
  surfTex.colorSpace = THREE.NoColorSpace;
  surfTex.anisotropy = maxAniso;
  const selTex = new THREE.CanvasTexture(live.select);
  selTex.colorSpace = THREE.NoColorSpace;
  selTex.generateMipmaps = false;
  selTex.minFilter = THREE.LinearFilter;

  /*
   * The canvas is the only PBR material in the scene. The surface image is
   * both its bump map (R, paint height) and roughness map (G), so impasto
   * catches the low sun and fresh paint is glossier than bare linen.
   * The selection is drawn by the shader from a half-resolution mask: a
   * warm tint inside the region and a glowing outline found by comparing
   * each texel with its neighbours — no per-frame canvas redraw, no upload.
   */
  const selUniforms = { uPulse: { value: 0 } };
  const artMat = new THREE.MeshStandardMaterial({
    map: artTex, bumpMap: surfTex, bumpScale: 1.6, roughnessMap: surfTex,
    roughness: 1, metalness: 0, envMapIntensity: 0.55
  });
  artMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSelMap = { value: selTex };
    shader.uniforms.uSelTexel = { value: new THREE.Vector2(2 / ART_W, 2 / ART_H) };
    shader.uniforms.uPulse = selUniforms.uPulse;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uSelMap;\nuniform vec2 uSelTexel;\nuniform float uPulse;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec4 pmSel = texture2D( uSelMap, vMapUv );
        vec2 pmT = uSelTexel * 1.6;
        float pmAvg = 0.25 * ( texture2D( uSelMap, vMapUv + vec2( pmT.x, 0.0 ) ).r + texture2D( uSelMap, vMapUv - vec2( pmT.x, 0.0 ) ).r
          + texture2D( uSelMap, vMapUv + vec2( 0.0, pmT.y ) ).r + texture2D( uSelMap, vMapUv - vec2( 0.0, pmT.y ) ).r );
        float pmEdge = clamp( abs( pmSel.r - pmAvg ) * 5.0, 0.0, 1.0 );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.84, 0.48 ), pmSel.r * ( 0.12 + 0.14 * uPulse ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.97, 0.9 ), pmSel.g * 0.16 );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3( 1.0, 0.68, 0.22 ) * pmEdge * ( 0.5 + 0.5 * uPulse );`);
  };
  artMat.customProgramCacheKey = () => 'pm-art';

  const easel = buildEasel(artMat, CANVAS_W, CANVAS_H);
  easel.position.set(0, 0, EASEL_Z);
  scene.add(easel);
  const artMesh = easel.userData.canvas;

  const brush = buildBrush();
  easel.add(brush.group);
  // Handle out toward the right hand and the viewer, bristles on the canvas
  const brushDir = new THREE.Vector3(0.42, -0.5, 0.76).normalize();
  brush.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), brushDir);
  const brushState = { on: 0, x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, sound: 0 };

  // The id-map lives offscreen: tapping the canvas reads pixels from it
  // rather than doing point-in-polygon against curved paths.
  const idCv = document.createElement('canvas');
  idCv.width = ART_W;
  idCv.height = ART_H;
  const idCtx = idCv.getContext('2d', { willReadFrequently: true });

  /* ---- The rest of the field ------------------------------------------ */

  /*
   * The rest of the field, staged so they actually land inside the frame.
   * Depth is what buys you width: at z −5 the frame is nine metres across.
   */
  const FIELD = [
    { name: 'Per Olsson', shirt: 0x6b4a2e, beret: true, x: -3.4, z: -4.6, ry: 0.42, side: -1 },
    { name: 'Viktor Jones', shirt: 0x2f5f96, x: 3.3, z: -4.8, ry: -0.38, side: 1 },
    // Depth alone does not separate two figures: a painter at x −3 and z −4.6
    // and one at x −4.9 and z −7.4 land on the SAME screen column and read as
    // one pile. The far pair is pulled back toward the centre instead.
    { name: 'Per Vikman', shirt: 0xa8202c, x: -3.0, z: -7.4, ry: 0.58, side: -1, hair: 0x4a3520 },
    { name: 'Henrik Lundqvist', shirt: 0x3f7a46, x: 3.1, z: -7.8, ry: -0.52, side: 1, hair: 0x2a1c10 }
  ];
  const painters = FIELD.map((p) => {
    const fig = buildPainter(p.shirt, { beret: p.beret, hair: p.hair });
    // Their canvases face away from us, so the painter stands BEYOND the
    // easel looking back toward the camera — in front of it, everyone is
    // painting the back of their own canvas. The lateral offset is what
    // keeps them from being four heads floating over four boards.
    const fx = Math.sin(p.ry);
    const fz = Math.cos(p.ry);
    fig.group.position.set(
      p.x - fx * 0.72 + fz * p.side * 0.44,
      0,
      p.z - fz * 0.72 - fx * p.side * 0.44
    );
    fig.group.rotation.y = p.ry - p.side * 0.5;
    scene.add(fig.group);
    const theirEasel = buildEasel(null, 0.78, 0.6);
    theirEasel.position.set(p.x, 0, p.z);
    theirEasel.rotation.y = p.ry + Math.PI;
    theirEasel.scale.setScalar(0.88);
    scene.add(theirEasel);
    return { ...p, fig, phase: rand() * 6 };
  });

  /* Mikael Hägglund, strolling between the easels until he is needed */
  const judge = buildJudge();
  const JUDGE_HOME = { x: 2.15, z: -2.7, ry: -0.7 };
  const JUDGE_SPOT = { x: 0.98, z: -0.2 };
  judge.group.position.set(JUDGE_HOME.x, 0, JUDGE_HOME.z);
  judge.group.rotation.y = JUDGE_HOME.ry;
  scene.add(judge.group);
  const judgeState = { mode: 'home', t: 0, fromX: JUDGE_HOME.x, fromZ: JUDGE_HOME.z, toX: JUDGE_HOME.x, toZ: JUDGE_HOME.z, ry: JUDGE_HOME.ry, mood: 0 };

  /* ---- Palette ---------------------------------------------------------- */

  const palette = new Palette(hud.palette, { reducedMotion: reduced });

  /* ---- State ----------------------------------------------------------- */

  const state = {
    phase: 'idle', // idle | draw | paint | judging | reveal | over
    workNo: 1,
    score: 0,
    timeLeft: ROUND_SECONDS,
    selected: -1,
    hover: -1,
    streak: 0,
    bestStreak: 0,
    hits: 0,
    regionTime: 0,
    lastSecond: -1,
    results: [],
    lastToast: 0,
    timers: [],
    matchedNow: false,
    returnCard: 'start'
  };

  let drops = { r: 0, y: 0, b: 0, w: 0, k: 0 };
  let history = [];
  let mixed = mixPigments(drops);
  let work = ARTWORKS[0];
  let painted = [];
  let paintedDE = [];
  let bag = [];
  let refImage = null;
  /** Little timed animations (the grade counting up) run off the frame loop. */
  const tweens = [];
  let hatHop = 0;

  let high = Number(store.get(HIGHSCORE_KEY, 0)) || 0;
  let bests = store.get(BEST_KEY, {}) || {};
  let gallery = store.get(GALLERY_KEY, []);
  if (!Array.isArray(gallery)) gallery = [];
  hud.hi.textContent = fmt(high);

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    state.timers.push(id);
    return id;
  };

  /* ---- Layout & camera -------------------------------------------------- */

  const view = { w: 1, h: 1, lay: layoutFor(1, 1) };

  /** A camera shot: where it stands, what it looks at, lens, lens shift. */
  function shotParams(name, t = 0) {
    const { w: W, h: H, lay } = view;
    const { wide } = lay;
    if (name === 'easel') {
      const r = lay.free;
      const fov = wide ? 32 : 44;
      const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const ppu = Math.min((r.h * 0.95) / FRAME_H, (r.w * 0.95) / FRAME_W);
      const d = H / (2 * tan * ppu);
      const pitch = 0.075;
      return {
        pos: new THREE.Vector3(CANVAS_C.x, CANVAS_C.y + Math.sin(pitch) * d, CANVAS_C.z + Math.cos(pitch) * d),
        tgt: CANVAS_C.clone(), fov,
        ox: W / 2 - (r.x + r.w / 2), oy: H / 2 - (r.y + r.h / 2)
      };
    }
    if (name === 'judge') {
      // The canvas and Hägglund beside it, in the space the verdict card
      // leaves free: the left of a wide screen, the top of a tall one
      const free = wide
        ? { x: 0, y: lay.top, w: W - lay.card - 28, h: H - lay.top }
        : { x: 0, y: lay.top, w: W, h: H * 0.34 };
      const fov = wide ? 36 : 46;
      const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const ppu = Math.min((free.h * 0.9) / 2.3, (free.w * 0.9) / 2.1);
      const d = H / (2 * tan * ppu);
      const tgt = new THREE.Vector3(0.3, 1.32, -0.35);
      const dir = new THREE.Vector3(1.05, 0.28, 2.0).normalize();
      return {
        pos: tgt.clone().addScaledVector(dir, d), tgt, fov,
        ox: W / 2 - (free.x + free.w / 2), oy: H / 2 - (free.y + free.h / 2)
      };
    }
    // 'wide': the whole garden, drifting slowly round the easel
    const a = 0.46 + (reduced ? 0 : Math.sin(t * 0.07) * 0.2);
    const R = wide ? 6.4 : 8.6;
    const c = new THREE.Vector3(0.2, 1.2, -3.0);
    return {
      pos: new THREE.Vector3(c.x + Math.sin(a) * R, 2.35 + (reduced ? 0 : Math.sin(t * 0.11) * 0.15), c.z + Math.cos(a) * R),
      tgt: new THREE.Vector3(-0.1, 1.35, -3.2),
      fov: wide ? 44 : 56,
      ox: wide ? -W * 0.15 : 0,
      oy: wide ? 0 : H * 0.17
    };
  }

  const rig = { name: 'wide', t: 1, dur: 1, from: null };
  const cur = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 40, ox: 0, oy: 0 };

  function setShot(name, dur = 1.4) {
    rig.from = { pos: cur.pos.clone(), tgt: cur.tgt.clone(), fov: cur.fov, ox: cur.ox, oy: cur.oy };
    rig.name = name;
    rig.t = 0;
    rig.dur = reduced ? Math.min(dur, 0.01) : Math.max(0.001, dur);
    if (dur <= 0) rig.t = 1;
  }

  function updateCamera(dt, t) {
    const to = shotParams(rig.name, t);
    if (rig.t < 1 && rig.from) {
      rig.t = Math.min(1, rig.t + dt / rig.dur);
      const k = easeInOut(rig.t);
      cur.pos.lerpVectors(rig.from.pos, to.pos, k);
      // A shallow arc between shots, so a cut becomes a move
      if (!reduced) cur.pos.y += Math.sin(k * Math.PI) * 0.35;
      cur.tgt.lerpVectors(rig.from.tgt, to.tgt, k);
      cur.fov = rig.from.fov + (to.fov - rig.from.fov) * k;
      cur.ox = rig.from.ox + (to.ox - rig.from.ox) * k;
      cur.oy = rig.from.oy + (to.oy - rig.from.oy) * k;
    } else {
      cur.pos.copy(to.pos);
      cur.tgt.copy(to.tgt);
      cur.fov = to.fov;
      cur.ox = to.ox;
      cur.oy = to.oy;
    }
    camera.position.copy(cur.pos);
    // The easel shot breathes very slightly; a locked-off camera reads as a UI
    if (!reduced && rig.name === 'easel') {
      camera.position.x += Math.sin(t * 0.5) * 0.006;
      camera.position.y += Math.sin(t * 0.37) * 0.004;
    }
    camera.lookAt(cur.tgt);
    camera.fov = cur.fov;
    camera.setViewOffset(view.w, view.h, cur.ox, cur.oy, view.w, view.h);
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    view.w = w;
    view.h = h;
    view.lay = layoutFor(w, h);
    const L = view.lay;
    hudHost.classList.toggle('pm-wide', L.wide);
    hudHost.classList.toggle('pm-tall', !L.wide);
    const s = hudHost.style;
    s.setProperty('--pm-side', `${L.side}px`);
    s.setProperty('--pm-panel', `${L.panel}px`);
    s.setProperty('--pm-sheet', `${L.sheet}px`);
    s.setProperty('--pm-card', `${L.card}px`);
    s.setProperty('--pm-fx', `${L.free.x + L.free.w / 2}px`);
    s.setProperty('--pm-fy', `${L.free.y + L.free.h / 2}px`);
    s.setProperty('--pm-fh', `${L.free.h}px`);
    const pr = hud.palette.getBoundingClientRect();
    palette.resize(pr.width, pr.height, window.devicePixelRatio || 1);
    sizeRefCanvases();
    if (rig.t >= 1) setShot(rig.name, 0);
  }

  /* ---- HUD helpers ----------------------------------------------------- */

  function toast(msg, ms = 1500) {
    hud.toast.textContent = msg;
    hud.toast.classList.add('show');
    clearTimeout(state.lastToast);
    state.lastToast = setTimeout(() => hud.toast.classList.remove('show'), ms);
  }

  function callout(txt, cls = '') {
    hud.callout.textContent = txt;
    hud.callout.className = 'pm-callout';
    void hud.callout.offsetWidth;
    hud.callout.className = `pm-callout show ${cls}`;
  }

  const projected = new THREE.Vector3();
  function popAt(text, world, cls = '') {
    projected.copy(world).project(camera);
    if (projected.z > 1) return;
    const el = document.createElement('div');
    el.className = `pm-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${(projected.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * 100}%`;
    hud.pops.appendChild(el);
    later(() => el.remove(), 1300);
  }

  function setScore(n) {
    state.score = n;
    hud.score.textContent = fmt(n);
    hud.score.classList.remove('bump');
    void hud.score.offsetWidth;
    hud.score.classList.add('bump');
  }

  /** Canvas 0..1 coordinates → a point on the easel in world space. */
  const canvasPoint = (u, v, out = new THREE.Vector3()) => {
    out.set((u - 0.5) * CANVAS_W, (0.5 - v) * CANVAS_H, 0.01);
    return artMesh.localToWorld(out);
  };

  function renderStreak() {
    const s = state.streak;
    hud.streak.classList.toggle('show', s >= 2);
    if (s >= 2) hud.streak.innerHTML = `SVIT ×${s} <em>poäng ×${(1 + 0.25 * Math.min(s - 1, 6)).toFixed(2).replace('.', ',')}</em>`;
  }

  function renderClock() {
    const s = Math.max(0, Math.ceil(state.timeLeft));
    hud.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const frac = clamp(state.timeLeft / ROUND_SECONDS, 0, 1);
    const C = 2 * Math.PI * 19;
    hud.clockArc.style.strokeDasharray = `${(C * frac).toFixed(1)} ${C.toFixed(1)}`;
    hud.clock.classList.toggle('low', s <= 15);
  }

  /* ---- Reference --------------------------------------------------------- */

  function sizeRefCanvases() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const big = Math.round(clamp(view.lay.side || 240, 160, 300) * dpr);
    const bh = Math.round((big * ART_H) / ART_W);
    [hud.refCv, hud.refSel].forEach((c) => {
      if (c.width !== big) {
        c.width = big;
        c.height = bh;
      }
    });
    const mini = Math.round(60 * dpr);
    const mh = Math.round((mini * ART_H) / ART_W);
    [hud.miniCv, hud.miniSel].forEach((c) => {
      if (c.width !== mini) {
        c.width = mini;
        c.height = mh;
      }
    });
    if (refImage) drawRefImages();
  }

  function drawRefImages() {
    [hud.refCv, hud.miniCv].forEach((c) => {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(refImage, 0, 0, c.width, c.height);
    });
    drawRefSelection();
  }

  /** On the reference, the selected region glows and everything else dims. */
  const selScratch = document.createElement('canvas');
  function drawRefSelection() {
    [hud.refSel, hud.miniSel].forEach((c) => {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      const i = state.selected;
      if (i < 0 || state.phase !== 'paint') return;
      const w = c.width;
      const h = c.height;
      selScratch.width = w;
      selScratch.height = h;
      const s = selScratch.getContext('2d');
      s.fillStyle = '#fff';
      s.beginPath();
      work.regions[i].path(s, w, h);
      s.fill();
      s.globalCompositeOperation = 'destination-out';
      for (let j = i + 1; j < work.regions.length; j++) {
        s.beginPath();
        work.regions[j].path(s, w, h);
        s.fill();
      }
      s.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(8,6,4,0.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(selScratch, 0, 0);
      // The halo: the mask's own shadow, with the mask cut back out of it
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.shadowColor = 'rgba(255,205,96,1)';
      ctx.shadowBlur = Math.max(3, w * 0.025);
      ctx.drawImage(selScratch, 0, 0);
      ctx.restore();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(selScratch, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  function renderDots() {
    hud.dots.innerHTML = work.regions.map((rg, i) => {
      const p = painted[i];
      const cls = p ? (paintedDE[i] < MATCH_DE ? 'hit' : 'done') : i === state.selected ? 'sel' : '';
      const bg = p ? ` style="--c:${rgbToCss(p)}"` : '';
      return `<button class="pm-dot ${cls}" data-i="${i}"${bg} title="${esc(rg.name)}" aria-label="${esc(rg.name)}"></button>`;
    }).join('');
    const done = painted.filter(Boolean).length;
    hud.count.textContent = `${done}/${work.regions.length}`;
  }

  /* ---- Mixing HUD -------------------------------------------------------- */

  const total = () => drops.r + drops.y + drops.b + drops.w + drops.k;

  let deltaTimer = 0;
  function renderMix(prevDE = null) {
    const sel = state.selected;
    const target = sel >= 0 ? hexToRgb(work.regions[sel].color) : null;
    hud.target.style.background = target ? rgbToCss(target) : 'transparent';
    hud.mixed.style.background = total() ? rgbToCss(mixed) : 'transparent';
    hud.mixed.classList.toggle('empty', !total());
    hud.region.textContent = sel >= 0 ? work.regions[sel].name : 'Välj en yta i tavlan';
    let acc = 0;
    let advice = null;
    if (target && total()) {
      advice = mixAdvice(drops, target);
      acc = accuracy(advice.dE);
    }
    const match = !!advice && advice.dE < MATCH_DE;
    hud.meterFill.style.width = `${((1 - acc) * 100).toFixed(1)}%`;
    hud.meterMark.style.left = `${(acc * 100).toFixed(1)}%`;
    hud.meter.dataset.zone = !advice ? 'none' : match ? 'hot' : acc > 0.62 ? 'warm' : 'cold';
    hud.chip.classList.toggle('match', match);
    hud.apply.classList.toggle('ready', match);
    hud.hint.textContent = !target
      ? 'Tryck på en yta i tavlan'
      : advice ? advice.say : 'Droppa pigment på paletten';
    if (prevDE != null && advice) {
      const d = prevDE - advice.dE;
      if (Math.abs(d) > 0.35 && !match) {
        hud.delta.textContent = d > 0 ? '▲ varmare' : '▼ kallare';
        hud.delta.className = `pm-delta show ${d > 0 ? 'warm' : 'cold'}`;
        clearTimeout(deltaTimer);
        deltaTimer = setTimeout(() => {
          hud.delta.className = 'pm-delta';
        }, 1100);
        if (d > 0) sfx.warmer();
        else sfx.colder();
      }
    }
    state.advice = advice;
    updateTip();
  }

  /** After a while stuck on one region, the palette points at a drop. */
  function updateTip() {
    const a = state.advice;
    const show = state.phase === 'paint' && a && a.tip && state.regionTime > TIP_AFTER;
    palette.setTip(show && a.tip !== 'wipe' ? a.tip : null);
    hud.wipe.classList.toggle('nudge', !!(show && a.tip === 'wipe'));
  }

  function currentDE() {
    if (state.selected < 0 || !total()) return null;
    return colourDistance(mixed, hexToRgb(work.regions[state.selected].color));
  }

  function setDrops(next) {
    drops = { ...next };
    mixed = mixPigments(drops);
  }

  function addDrop(key) {
    if (state.phase !== 'paint') return;
    const pi = PIGMENTS.findIndex((p) => p.key === key);
    if (drops[key] >= MAX_DROPS) {
      sfx.bump();
      toast(`Paletten tar inte mer ${PIGMENTS[pi].name.toLowerCase()} — torka eller ångra`);
      return;
    }
    const before = currentDE();
    history.push({ ...drops });
    if (history.length > 60) history.shift();
    setDrops({ ...drops, [key]: drops[key] + 1 });
    palette.addDrop(key, drops);
    sfx.drop(pi);
    sfx.swirl();
    const after = currentDE();
    if (after != null && after < MATCH_DE && !(before != null && before < MATCH_DE)) {
      sfx.match();
      hud.chip.classList.remove('ping');
      void hud.chip.offsetWidth;
      hud.chip.classList.add('ping');
    }
    renderMix(before);
  }

  function undo() {
    if (state.phase !== 'paint' || !history.length) return;
    const before = currentDE();
    setDrops(history.pop());
    palette.setDrops(drops);
    sfx.scrape();
    renderMix(before);
  }

  function wipe() {
    if (state.phase !== 'paint' || !total()) return;
    history.push({ ...drops });
    setDrops({ r: 0, y: 0, b: 0, w: 0, k: 0 });
    palette.wipe();
    sfx.scrape();
    renderMix();
  }

  /** Tapping a dab on the palette rim mixes that colour up again. */
  function loadDab(dabDrops) {
    if (state.phase !== 'paint') return;
    const before = currentDE();
    history.push({ ...drops });
    setDrops(dabDrops);
    palette.setDrops(drops);
    sfx.swirl();
    renderMix(before);
  }

  /* ---- Selecting -------------------------------------------------------- */

  function select(i) {
    if (i === state.selected) return;
    state.selected = i;
    state.regionTime = 0;
    live.setSelection(i, state.hover);
    selTex.needsUpdate = true;
    drawRefSelection();
    renderDots();
    renderMix();
  }

  function nextUnpainted(from, dir = 1) {
    const n = work.regions.length;
    for (let k = 1; k <= n; k++) {
      const j = (((from + dir * k) % n) + n) % n;
      if (!painted[j]) return j;
    }
    return -1;
  }

  /**
   * Which region is under a canvas point. The id-map is antialiased like
   * any canvas fill, so a pixel right on a boundary can hold a blend of two
   * ids — which is a THIRD, wrong id. A 3×3 vote settles it.
   */
  function regionAt(u, v) {
    const x = clamp(Math.floor(u * ART_W), 1, ART_W - 2);
    const y = clamp(Math.floor(v * ART_H), 1, ART_H - 2);
    const d = idCtx.getImageData(x - 1, y - 1, 3, 3).data;
    const votes = new Map();
    for (let k = 0; k < 36; k += 4) votes.set(d[k], (votes.get(d[k]) || 0) + 1);
    const centre = d[16];
    let best = centre;
    if ((votes.get(centre) || 0) < 3) {
      let n = 0;
      votes.forEach((c, id) => {
        if (c > n) {
          n = c;
          best = id;
        }
      });
    }
    return best > 0 && best <= work.regions.length ? best - 1 : -1;
  }

  /* ---- Painting --------------------------------------------------------- */

  function applyPaint() {
    if (state.phase !== 'paint' || state.selected < 0) return;
    if (!total()) {
      toast('Paletten är tom — droppa lite pigment först');
      return;
    }
    const idx = state.selected;
    const target = hexToRgb(work.regions[idx].color);
    const d = colourDistance(mixed, target);
    const acc = accuracy(d);
    const hit = d < MATCH_DE;
    painted[idx] = mixed.slice();
    paintedDE[idx] = d;

    // A streak is consecutive regions nailed on their one and only coat
    if (hit) {
      state.streak++;
      state.hits++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
    } else {
      state.streak = 0;
    }
    const mult = hit ? 1 + 0.25 * Math.min(state.streak - 1, 6) : 1;
    // ΔE under about 6 is a colour nobody would call wrong; past 55 it is
    // simply a different colour, so that is where the points run out.
    const pts = Math.round((120 + acc * acc * 680) * mult);
    setScore(state.score + pts);
    const an = analyse(work).regions[idx];
    const at = canvasPoint(an.cx, an.cy);
    popAt(`+${fmt(pts)}`, at, hit ? 'hit' : acc < 0.6 ? 'miss' : '');
    if (hit && state.streak >= 2) {
      callout(`SVIT ×${state.streak}`, 'streak');
      sfx.streak(state.streak);
    } else if (hit) {
      callout('PRICKFÄRG!', 'hit');
    }
    renderStreak();

    live.begin(idx, mixed, reduced ? 0.01 : 0.62);
    brushState.on = 1;
    brushState.x = an.cx;
    brushState.y = an.cy;
    brush.tipMat.color.setRGB(mixed[0], mixed[1], mixed[2], THREE.SRGBColorSpace);
    sfx.stroke(acc);
    palette.addDab(mixed, drops);

    const next = nextUnpainted(idx, 1);
    state.selected = -1;
    if (next >= 0) select(next);
    else {
      live.setSelection(-1, -1);
      selTex.needsUpdate = true;
      renderDots();
      renderMix();
      later(() => finishWork('done'), reduced ? 200 : 900);
    }
  }

  /* ---- Flow ------------------------------------------------------------- */

  function loadWork(w) {
    work = w;
    painted = work.regions.map(() => null);
    paintedDE = work.regions.map(() => Infinity);
    state.selected = -1;
    state.hover = -1;
    paintIdMap(idCtx, work, ART_W, ART_H);
    live.load(work, painted);
    artTex.needsUpdate = true;
    surfTex.needsUpdate = true;
    selTex.needsUpdate = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rw = Math.round(300 * dpr);
    refImage = renderPainting(work, work.regions.map((rg) => hexToRgb(rg.color)), rw, Math.round((rw * ART_H) / ART_W), { museum: true });
    drawRefImages();
    hud.refTitle.textContent = work.title;
    hud.refArtist.textContent = `${work.artist}, ${work.year}`;
    hud.work.textContent = `VERK ${state.workNo}/${WORKS_PER_GAME}`;
    palette.clearDabs();
    renderDots();
  }

  function setPhase(p) {
    state.phase = p;
    hudHost.dataset.phase = p;
  }

  function drawSlip() {
    setPhase('draw');
    sfx.slip();
    hatHop = 1;
    const w = bag.pop();
    loadWork(w);
    state.timeLeft = ROUND_SECONDS;
    renderClock();
    const b = bests[w.id];
    hud.slipArtist.textContent = w.artist;
    hud.slipTitle.textContent = w.title;
    hud.slipNote.textContent = `${w.year} · ${w.note}`;
    hud.slipBest.innerHTML = b
      ? `Ditt bästa ${starsHtml(b.s, 'sm')} <b>${grade1(b.g)}</b>`
      : 'Första gången du drar den här lappen';
    hud.showCard('slip');
    setShot('easel', 2.1);
    judgeGoHome();
    later(() => {
      if (state.phase === 'draw') beginPaint();
    }, 3400);
  }

  function beginPaint() {
    if (state.phase !== 'draw') return;
    hud.showCard(null);
    setPhase('paint');
    state.timeLeft = ROUND_SECONDS;
    state.streak = 0;
    state.bestStreak = 0;
    state.hits = 0;
    state.lastSecond = -1;
    history = [];
    setDrops({ r: 0, y: 0, b: 0, w: 0, k: 0 });
    palette.wipe();
    renderStreak();
    renderClock();
    state.selected = -1;
    select(0);
    callout('BLANDA FÄRGEN', 'soft');
  }

  function finishWork(reason) {
    if (state.phase !== 'paint') return;
    setPhase('judging');
    live.finish();
    artTex.needsUpdate = true;
    surfTex.needsUpdate = true;
    live.setSelection(-1, -1);
    selTex.needsUpdate = true;
    palette.setTip(null);
    if (reason === 'time') {
      sfx.bell();
      callout('PENSLARNA NER!', 'big');
    } else {
      sfx.gavel();
      callout('KLART!', 'big');
    }

    // The verdict: colour accuracy over every region, with bare canvas
    // counted as the miss it is.
    let sum = 0;
    work.regions.forEach((rg, i) => {
      if (painted[i]) sum += accuracy(paintedDE[i]);
    });
    const quality = sum / work.regions.length;
    const grade = Math.max(1, Math.min(10, Math.round(quality * 10.4 * 10) / 10));
    const stars = starsFor(grade);
    const verdict = VERDICTS.find((v) => grade >= v.at) || VERDICTS[VERDICTS.length - 1];
    const bonus = Math.round(grade * 220 + Math.max(0, state.timeLeft) * 6);
    const prev = bests[work.id];
    const pb = !prev || grade > prev.g;
    if (pb) {
      bests = { ...bests, [work.id]: { g: grade, s: Math.max(stars, prev ? prev.s : 0) } };
      store.set(BEST_KEY, bests);
    }
    const result = {
      work, grade, stars, verdict, bonus, pb, first: !prev,
      painted: painted.slice(), de: paintedDE.slice(),
      hits: state.hits, bestStreak: state.bestStreak, timeLeft: Math.max(0, state.timeLeft)
    };
    state.results.push(result);
    // Every finished painting goes on the wall at home
    gallery.unshift({
      id: work.id, c: painted.map(packRgb), g: grade, s: stars,
      d: new Date().toISOString().slice(0, 10)
    });
    gallery = gallery.slice(0, GALLERY_MAX);
    store.set(GALLERY_KEY, gallery);

    // Hägglund walks over while the camera turns to watch him
    setShot('judge', 1.7);
    judgeWalk(JUDGE_SPOT.x, JUDGE_SPOT.z, 'inspect');
    judgeState.mood = grade >= 7.5 ? 1 : grade < 4.5 ? -1 : 0;
    later(() => showReveal(result), reduced ? 400 : 2000);
  }

  function showReveal(r) {
    setPhase('reveal');
    judgeState.mode = 'verdict';
    judgeState.t = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(clamp(view.lay.wide ? (view.lay.card - 70) / 2 : (view.w - 60) / 2, 120, 280) * dpr);
    const ph = Math.round((pw * ART_H) / ART_W);
    hud.rvNo.textContent = `${state.workNo}/${WORKS_PER_GAME}`;
    hud.rvTitle.textContent = r.work.title;
    hud.rvYours.replaceChildren(renderPainting(r.work, r.painted, pw, ph));
    hud.rvOrig.replaceChildren(renderPainting(r.work, r.work.regions.map((rg) => hexToRgb(rg.color)), pw, ph, { museum: true }));
    hud.rvOrigCap.textContent = `${r.work.artist}, ${r.work.year}`;
    hud.rvGrade.textContent = '0,0';
    hud.rvStars.innerHTML = starsHtml(0, 'big');
    hud.rvPb.hidden = true;
    hud.rvQuote.textContent = `”${r.verdict.say}”`;
    hud.rvQuote.parentElement.classList.remove('show');
    hud.rvChips.innerHTML = r.work.regions.map((rg, i) => {
      const p = r.painted[i];
      const cls = !p ? 'bare' : r.de[i] < MATCH_DE ? 'hit' : accuracy(r.de[i]) > 0.62 ? 'near' : 'miss';
      const mine = p ? rgbToCss(p) : 'transparent';
      return `<i class="${cls}" style="--t:${rgbToCss(hexToRgb(rg.color))};--y:${mine}" title="${esc(rg.name)}${p ? ` · ΔE ${r.de[i].toFixed(1)}` : ' · bar duk'}"></i>`;
    }).join('');
    const tl = Math.ceil(r.timeLeft);
    hud.rvStats.innerHTML = `
      <span><b>${r.hits}</b>/${r.work.regions.length} prickade</span>
      <span>Bästa svit <b>×${r.bestStreak}</b></span>
      <span>Tid kvar <b>${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}</b></span>
      <span class="pm-bonus">+${fmt(r.bonus)} poäng</span>`;
    hud.rvNext.textContent = state.workNo < WORKS_PER_GAME ? 'Dra nästa lapp' : 'Kvällens resultat';
    hud.showCard('reveal');

    // The grade counts up, then the stars land one at a time
    const count = reduced ? 0.01 : 1.1;
    tweens.push({
      t: 0, dur: count, last: -1,
      step(k) {
        const g = r.grade * (1 - (1 - k) ** 2);
        hud.rvGrade.textContent = grade1(g);
        const tick = Math.floor(g * 2);
        if (tick !== this.last) {
          this.last = tick;
          sfx.tick(0.8 + g / 12);
        }
      },
      done() {
        hud.rvGrade.textContent = grade1(r.grade);
        setScore(state.score + r.bonus);
        for (let i = 0; i < r.stars; i++) {
          later(() => {
            hud.rvStars.innerHTML = starsHtml(i + 1, 'big');
            sfx.star(i);
          }, reduced ? 0 : 160 + i * 260);
        }
        later(() => {
          hud.rvQuote.parentElement.classList.add('show');
          if (r.pb) {
            hud.rvPb.hidden = false;
            hud.rvPb.textContent = r.first ? 'Första gången!' : 'Personbästa!';
          }
          if (r.grade >= 7.5) sfx.applause(r.grade >= 9);
          if (r.grade >= 9) confetti(36);
        }, reduced ? 0 : 200 + r.stars * 260);
      }
    });
  }

  function nextFromReveal() {
    if (state.phase !== 'reveal') return;
    if (state.workNo < WORKS_PER_GAME) {
      state.workNo++;
      drawSlip();
    } else {
      showFinal();
    }
  }

  function showFinal() {
    setPhase('over');
    const res = state.results;
    const avg = res.reduce((a, r) => a + r.grade, 0) / res.length;
    const best = res.reduce((a, r) => (r.grade > a.grade ? r : a), res[0]);
    const isHigh = state.score > high;
    if (isHigh) {
      high = state.score;
      store.set(HIGHSCORE_KEY, Math.round(high));
      hud.hi.textContent = fmt(high);
    }
    hud.fnTitle.textContent = avg >= 8 ? 'Pokalen är din!' : avg >= 6 ? 'Hedersamt genomfört' : 'Hägglund är inte imponerad';
    hud.fnText.textContent = avg >= 8
      ? `Snittbetyg ${grade1(avg)}. Bäst: ${best.work.title}. Precis som Olov Melander 2021 — du fångade essensen.`
      : `Snittbetyg ${grade1(avg)}. Bäst: ${best.work.title}. Olov tog hem 2021 med Skriet. Ta en öl och försök igen.`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(clamp(view.lay.wide ? 190 : (view.w - 70) / 3, 90, 220) * dpr);
    const ph = Math.round((pw * ART_H) / ART_W);
    hud.fnWall.replaceChildren(...res.map((r) => {
      const fig = document.createElement('figure');
      const gilt = document.createElement('div');
      gilt.className = 'pm-gilt';
      gilt.appendChild(renderPainting(r.work, r.painted, pw, ph));
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<b>${esc(r.work.title)}</b>${starsHtml(r.stars, 'sm')}<span>${grade1(r.grade)}</span>`;
      fig.append(gilt, cap);
      return fig;
    }));
    hud.fnScore.textContent = fmt(state.score);
    hud.fnSub.textContent = isHigh ? 'poäng · nytt rekord!' : `poäng · rekord ${fmt(high)}`;
    hud.root.classList.toggle('pm-record', isHigh);
    state.returnCard = 'final';
    hud.showCard('final');
    setShot('wide', 2.2);
    judgeGoHome();
    sfx.fanfare();
    if (avg >= 8 || isHigh) confetti(60);
  }

  function startGame() {
    sfx.resume();
    state.score = 0;
    state.workNo = 1;
    state.results = [];
    hud.score.textContent = '0';
    hud.root.classList.remove('pm-record');
    // A fresh hat: Skriet is always in it, because it is the one that won
    bag = ARTWORKS.filter((w) => w.id !== 'skriet')
      .map((w) => [rand(), w]).sort((a, b) => a[0] - b[0]).map(([, w]) => w)
      .slice(0, WORKS_PER_GAME - 1)
      .concat(ARTWORKS.find((w) => w.id === 'skriet'));
    // Skriet comes out of the hat at a random point in the evening
    const at = Math.floor(rand() * WORKS_PER_GAME);
    const sk = bag.pop();
    bag.splice(at, 0, sk);
    drawSlip();
  }

  /* ---- Start screen & gallery ------------------------------------------- */

  const thumbCache = new Map();
  function originalThumb(w, px) {
    const key = `${w.id}:${px}`;
    if (!thumbCache.has(key)) {
      thumbCache.set(key, renderPainting(w, w.regions.map((rg) => hexToRgb(rg.color)), px, Math.round((px * ART_H) / ART_W), { museum: true, lit: false }));
    }
    return thumbCache.get(key);
  }

  function renderStart() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(46 * dpr);
    hud.bests.replaceChildren(...ARTWORKS.map((w) => {
      const b = bests[w.id];
      const el = document.createElement('div');
      el.className = `pm-best${b ? '' : ' none'}`;
      const img = document.createElement('div');
      img.className = 'pm-best-img';
      const c = document.createElement('canvas');
      c.width = px;
      c.height = Math.round((px * ART_H) / ART_W);
      c.getContext('2d').drawImage(originalThumb(w, px), 0, 0);
      img.appendChild(c);
      const t = document.createElement('div');
      t.className = 'pm-best-txt';
      t.innerHTML = `<b>${esc(w.title)}</b>${b ? `${starsHtml(b.s, 'sm')}<span>${grade1(b.g)}</span>` : '<span>ej målad</span>'}`;
      el.append(img, t);
      return el;
    }));
    hud.galleryN.textContent = gallery.length ? `(${gallery.length})` : '';
    hud.openGallery.disabled = !gallery.length;
  }

  function openGallery() {
    if (!gallery.length) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round((view.lay.wide ? 150 : (view.w - 64) / 2) * dpr);
    const ph = Math.round((pw * ART_H) / ART_W);
    const items = gallery.map((g, idx) => {
      const w = ARTWORKS.find((a) => a.id === g.id);
      if (!w) return null;
      const fig = document.createElement('figure');
      fig.className = 'pm-gal';
      fig.innerHTML = `<button class="pm-gilt" data-idx="${idx}" aria-label="Visa ${esc(w.title)} större"></button>
        <figcaption><b>${esc(w.title)}</b>${starsHtml(g.s, 'sm')}<span>${grade1(g.g)} · ${esc(g.d)}</span></figcaption>`;
      return { fig, w, g };
    }).filter(Boolean);
    hud.galleryGrid.replaceChildren(...items.map((it) => it.fig));
    hud.showCard('gallery');
    // Paint them one per tick so opening the gallery never stalls a frame
    items.forEach((it, i) => {
      later(() => {
        const btn = it.fig.querySelector('.pm-gilt');
        if (btn) btn.appendChild(renderPainting(it.w, it.g.c.map(unpackRgb), pw, ph));
      }, 30 + i * 24);
    });
  }

  function zoomGallery(idx) {
    const g = gallery[idx];
    const w = g && ARTWORKS.find((a) => a.id === g.id);
    if (!w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(clamp(Math.min(view.w - 48, (view.h - 200) * (ART_W / ART_H)), 200, 520) * dpr);
    hud.zoomImg.replaceChildren(renderPainting(w, g.c.map(unpackRgb), pw, Math.round((pw * ART_H) / ART_W)));
    hud.zoomCap.innerHTML = `<b>${esc(w.title)}</b> efter ${esc(w.artist)} ${starsHtml(g.s, 'sm')} <span>${grade1(g.g)} · ${esc(g.d)}</span>`;
    hud.showCard('zoom');
  }

  /* ---- Celebration ------------------------------------------------------ */

  function confetti(n) {
    if (reduced) return;
    const cols = ['#f2c14e', '#2e5f9e', '#d8394d', '#e9e4d6', '#5eead4'];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = 'pm-confetti';
      el.style.left = `${Math.random() * 100}%`;
      el.style.background = cols[i % cols.length];
      el.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
      el.style.setProperty('--r', `${(Math.random() - 0.5) * 900}deg`);
      el.style.animationDelay = `${Math.random() * 0.6}s`;
      el.style.animationDuration = `${2.2 + Math.random() * 1.4}s`;
      hud.pops.appendChild(el);
      later(() => el.remove(), 4400);
    }
  }

  /* ---- The judge -------------------------------------------------------- */

  function judgeWalk(x, z, then) {
    const p = judge.group.position;
    judgeState.mode = 'walk';
    judgeState.t = 0;
    judgeState.fromX = p.x;
    judgeState.fromZ = p.z;
    judgeState.toX = x;
    judgeState.toZ = z;
    judgeState.then = then;
  }

  function judgeGoHome() {
    const p = judge.group.position;
    if (Math.hypot(p.x - JUDGE_HOME.x, p.z - JUDGE_HOME.z) > 0.05) judgeWalk(JUDGE_HOME.x, JUDGE_HOME.z, 'home');
  }

  const turnTo = (cur0, target, k) => {
    let d = target - cur0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return cur0 + d * k;
  };

  function animateJudge(dt, t) {
    const js = judgeState;
    const g = judge.group;
    const { head, armR } = judge.refs;
    js.t += dt;
    let face = js.ry;
    head.rotation.set(0, 0, 0);
    armR.rotation.set(0, 0, 0);
    g.position.y = 0;
    if (js.mode === 'walk') {
      const dist = Math.hypot(js.toX - js.fromX, js.toZ - js.fromZ);
      const dur = Math.max(0.6, dist / 1.3);
      const k = Math.min(1, js.t / dur);
      const e = easeInOut(k);
      g.position.x = js.fromX + (js.toX - js.fromX) * e;
      g.position.z = js.fromZ + (js.toZ - js.fromZ) * e;
      g.position.y = Math.abs(Math.sin(js.t * 9)) * 0.025 * Math.sin(k * Math.PI);
      face = Math.atan2(js.toX - js.fromX, js.toZ - js.fromZ);
      if (k >= 1) {
        js.mode = js.then;
        js.t = 0;
      }
    } else if (js.mode === 'inspect') {
      // Looking at the canvas, head on one side, pen to the chin
      face = Math.atan2(CANVAS_C.x - g.position.x, CANVAS_C.z - g.position.z);
      head.rotation.z = Math.sin(t * 0.8) * 0.12 + 0.1;
      head.rotation.x = 0.12;
      armR.rotation.x = -1.9;
      armR.rotation.z = 0.35;
    } else if (js.mode === 'verdict') {
      // Turns to deliver it: nods if he liked it, shakes his head if not
      face = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z) * 0.7
        + Math.atan2(CANVAS_C.x - g.position.x, CANVAS_C.z - g.position.z) * 0.3;
      const k = Math.min(1, js.t / 2.4);
      const fade = Math.sin(k * Math.PI);
      if (js.mood > 0) {
        head.rotation.x = Math.sin(js.t * 7) * 0.16 * fade;
        armR.rotation.x = -0.9 * fade;
      } else if (js.mood < 0) {
        head.rotation.y = Math.sin(js.t * 8) * 0.32 * fade;
      } else {
        head.rotation.z = 0.18 * fade;
        armR.rotation.x = -0.5 * fade;
      }
    } else {
      face = JUDGE_HOME.ry;
      head.rotation.y = reduced ? 0 : Math.sin(t * 0.35) * 0.5;
    }
    js.ry = turnTo(js.ry, face, 1 - Math.exp(-dt * 6));
    g.rotation.y = js.ry;
  }

  /* ---- Input ------------------------------------------------------------ */

  let helpOpen = false;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function canvasUv(e) {
    const rect = canvasHost.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(artMesh, false)[0];
    return hit ? { u: hit.uv.x, v: 1 - hit.uv.y } : null;
  }

  function onPointerDown(e) {
    sfx.resume();
    if (helpOpen || state.phase !== 'paint') return;
    const uv = canvasUv(e);
    if (!uv) return;
    const id = regionAt(uv.u, uv.v);
    if (id < 0) return;
    if (painted[id]) {
      toast(`${work.regions[id].name} är redan målad`, 1000);
      return;
    }
    select(id);
  }

  function onPointerMove(e) {
    if (e.pointerType !== 'mouse' || state.phase !== 'paint') return;
    const uv = canvasUv(e);
    const id = uv ? regionAt(uv.u, uv.v) : -1;
    const h = id >= 0 && !painted[id] ? id : -1;
    canvasHost.style.cursor = h >= 0 ? 'pointer' : '';
    if (h !== state.hover) {
      state.hover = h;
      live.setSelection(state.selected, h);
      selTex.needsUpdate = true;
    }
  }

  function paletteXY(e) {
    const r = hud.palette.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function onPaletteDown(e) {
    sfx.resume();
    e.preventDefault();
    const hit = palette.hit(...paletteXY(e));
    if (!hit) return;
    if (hit.type === 'pigment') addDrop(hit.key);
    else if (hit.type === 'dab') loadDab(hit.drops);
  }

  function onPaletteMove(e) {
    if (e.pointerType !== 'mouse') return;
    const hit = palette.setHover(...paletteXY(e));
    hud.palette.style.cursor = hit ? 'pointer' : '';
  }

  function onPaletteLeave() {
    palette.setHover(null, null);
  }

  function onKeyDown(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= PIGMENTS.length) {
      sfx.resume();
      addDrop(PIGMENTS[n - 1].key);
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (e.target && e.target.tagName === 'BUTTON' && e.key === 'Enter') return;
      e.preventDefault();
      sfx.resume();
      if (state.phase === 'paint') applyPaint();
      else if (state.phase === 'draw') beginPaint();
      else if (state.phase === 'reveal') nextFromReveal();
      else if (state.phase === 'idle' && hud.overlay.dataset.card === 'start') startGame();
      else if (state.phase === 'over' && hud.overlay.dataset.card === 'final') startGame();
    } else if (e.key === 'w' || e.key === 'W') {
      wipe();
    } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
      undo();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && state.phase === 'paint') {
      const j = nextUnpainted(state.selected, e.key === 'ArrowRight' ? 1 : -1);
      if (j >= 0) select(j);
    } else if (e.key === '?') {
      setHelp(!helpOpen);
    } else if (e.key === 'Escape') {
      if (helpOpen) setHelp(false);
      else if (hud.overlay.dataset.card === 'zoom') openGallery();
      else if (hud.overlay.dataset.card === 'gallery') closeGallery();
    }
  }

  function closeGallery() {
    if (state.returnCard === 'final') hud.showCard('final');
    else {
      renderStart();
      hud.showCard('start');
    }
  }

  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
  }

  const on = (el, ev, fn, opts) => el.addEventListener(ev, fn, opts);
  on(hud.start, 'click', startGame);
  on(hud.again, 'click', startGame);
  on(hud.rvNext, 'click', nextFromReveal);
  on(hud.overlay, 'click', (e) => {
    if (state.phase === 'draw' && e.target.closest('.pm-slip')) beginPaint();
    const g = e.target.closest('.pm-gallery .pm-gilt');
    if (g) zoomGallery(Number(g.dataset.idx));
  });
  on(hud.openGallery, 'click', () => {
    state.returnCard = 'start';
    openGallery();
  });
  on(hud.fnGallery, 'click', () => {
    state.returnCard = 'final';
    openGallery();
  });
  on(hud.galleryBack, 'click', closeGallery);
  on(hud.zoomClose, 'click', openGallery);
  on(hud.apply, 'click', applyPaint);
  on(hud.wipe, 'click', wipe);
  on(hud.undo, 'click', undo);
  on(hud.mini, 'click', () => hud.root.classList.toggle('pm-ref-open'));
  on(hud.ref, 'click', () => hud.root.classList.remove('pm-ref-open'));
  on(hud.dots, 'click', (e) => {
    const b = e.target.closest('.pm-dot');
    if (!b || state.phase !== 'paint') return;
    const i = Number(b.dataset.i);
    if (!painted[i]) select(i);
  });
  on(hud.info, 'click', () => setHelp(true));
  on(hud.helpClose, 'click', () => setHelp(false));
  on(hud.mute, 'click', () => {
    sfx.resume();
    sfx.setMuted(!sfx.muted);
    hud.mute.classList.toggle('off', sfx.muted);
  });
  on(hud.palette, 'pointerdown', onPaletteDown);
  on(hud.palette, 'pointermove', onPaletteMove);
  on(hud.palette, 'pointerleave', onPaletteLeave);
  on(canvasHost, 'pointerdown', onPointerDown);
  on(canvasHost, 'pointermove', onPointerMove);
  window.addEventListener('keydown', onKeyDown);

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  ro.observe(hud.palette);
  resize();

  /* ---- Loop ------------------------------------------------------------- */

  const hatBaseY = garden.refs.hat.position.y;

  loadWork(ARTWORKS[0]);
  renderStart();
  hud.showCard('start');
  setShot('wide', 0);
  renderClock();
  renderMix();

  let raf = 0;
  let running = true;
  const timer = new THREE.Timer();
  timer.connect(document);
  const brushPos = new THREE.Vector3();

  function tick() {
    raf = requestAnimationFrame(tick);
    // No rAF timestamp: update() reads performance.now(), the same clock the
    // timer was started on, so the first delta cannot come out negative
    timer.update();
    const dt = Math.min(Math.max(timer.getDelta(), 0), MAX_STEP);
    if (!running) return;
    const t = timer.getElapsed();

    if (!helpOpen && state.phase === 'paint') {
      state.timeLeft -= dt;
      state.regionTime += dt;
      const s = Math.ceil(state.timeLeft);
      if (s !== state.lastSecond) {
        state.lastSecond = s;
        renderClock();
        if (s <= 10 && s > 0) sfx.clock(s <= 5);
        updateTip();
      }
      if (state.timeLeft <= 0) finishWork('time');
    }

    // Paint going on: textures re-upload only while strokes are landing
    const stroke = live.step(dt);
    if (stroke) {
      artTex.needsUpdate = true;
      surfTex.needsUpdate = true;
      brushState.tx = stroke.x;
      brushState.ty = stroke.y;
      brushState.sound -= dt;
      if (brushState.sound <= 0 && !stroke.done) {
        sfx.bristle();
        brushState.sound = 0.11;
      }
      if (stroke.done) brushState.on = 0;
    }
    // The brush follows the strokes, and slides off when the region is laid
    {
      const b = brushState;
      const k = 1 - Math.exp(-dt * 26);
      b.x += (b.tx - b.x) * k;
      b.y += (b.ty - b.y) * k;
      b.vis = (b.vis || 0) + ((b.on ? 1 : 0) - (b.vis || 0)) * (1 - Math.exp(-dt * (b.on ? 30 : 9)));
      brush.group.visible = b.vis > 0.02;
      if (brush.group.visible) {
        brushPos.set((b.x - 0.5) * CANVAS_W, CANVAS_C.y + (0.5 - b.y) * CANVAS_H, 0.066);
        brushPos.addScaledVector(brushDir, (1 - b.vis) * 0.5 + Math.abs(Math.sin(t * 22)) * 0.006);
        brush.group.position.copy(brushPos);
      }
    }

    palette.update(dt);
    selUniforms.uPulse.value = 0.5 + 0.5 * Math.sin(t * 4.2);

    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) {
        tweens.splice(i, 1);
        tw.done();
      }
    }

    // The garden keeps working whatever the player is doing
    animateGarden(garden, t, reduced);
    painters.forEach((p, i) => {
      const swing = Math.sin(t * (1.1 + i * 0.18) + p.phase);
      p.fig.refs.armR.rotation.x = 0.62 + swing * 0.34;
      p.fig.refs.armR.rotation.z = -0.16 + Math.cos(t * 0.8 + p.phase) * 0.12;
      p.fig.refs.head.rotation.y = Math.sin(t * 0.5 + p.phase) * 0.22;
      p.fig.group.position.y = Math.abs(Math.sin(t * 0.9 + p.phase)) * 0.006;
    });
    animateJudge(dt, t);
    // The hat hops when a slip comes out of it
    hatHop = Math.max(0, hatHop - dt * 1.6);
    const { hat } = garden.refs;
    hat.position.y = hatBaseY + Math.abs(Math.sin(hatHop * Math.PI * 3)) * 0.06 * hatHop;
    hat.rotation.y = Math.sin(t * 0.3) * 0.05 + Math.sin(hatHop * 14) * 0.2 * hatHop;

    updateCamera(dt, t);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
  };
  document.addEventListener('visibilitychange', onVisibility);

  /* ---- Debug API -------------------------------------------------------- */

  window.__ppMaleri = {
    state,
    scene,
    camera,
    drops: () => drops,
    startGame,
    beginPaint,
    finishWork,
    nextFromReveal,
    work: () => work,
    works: () => ARTWORKS,
    painted: () => painted,
    /**
     * Every region has to survive into the id-map. Regions are drawn back to
     * front and later ones paint over earlier ones, so a shape that ends up
     * completely covered can be seen on the canvas but never tapped — and
     * because the auto-advance jumps to the next unpainted region, one buried
     * region strands the player on a field they cannot reach.
     */
    idCoverage() {
      const missing = [];
      ARTWORKS.forEach((w) => {
        paintIdMap(idCtx, w, ART_W, ART_H);
        const px = idCtx.getImageData(0, 0, ART_W, ART_H).data;
        const seen = new Set();
        for (let i = 0; i < px.length; i += 4) seen.add(px[i]);
        w.regions.forEach((rg, i) => {
          if (!seen.has(i + 1)) missing.push(`${w.id}:${rg.name}`);
        });
      });
      paintIdMap(idCtx, work, ART_W, ART_H);
      return { missing };
    },
    mixed: () => mixed,
    addDrop,
    wipe,
    undo,
    applyPaint,
    select,
    regionAt,
    /** Load a recipe straight onto the palette. */
    setDrops(d) {
      setDrops({ r: 0, y: 0, b: 0, w: 0, k: 0, ...d });
      palette.setDrops(drops);
      renderMix();
    },
    /** Paint every region with the exact target colour — a perfect copy. */
    paintPerfect() {
      work.regions.forEach((rg, i) => {
        painted[i] = hexToRgb(rg.color);
        paintedDE[i] = 0;
      });
      state.selected = -1;
      live.load(work, painted);
      artTex.needsUpdate = true;
      surfTex.needsUpdate = true;
      renderDots();
    },
    /** Paint the first n regions in their target colour, skipping animation. */
    paintSome(n) {
      for (let i = 0; i < Math.min(n, work.regions.length); i++) {
        painted[i] = hexToRgb(work.regions[i].color);
        paintedDE[i] = 0;
      }
      live.load(work, painted);
      artTex.needsUpdate = true;
      surfTex.needsUpdate = true;
      const j = nextUnpainted(-1, 1);
      state.selected = -1;
      if (j >= 0) select(j);
      renderDots();
    },
    openGallery,
    info() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        textures: renderer.info.memory.textures,
        geometries: renderer.info.memory.geometries
      };
    }
  };

  /* ---- Teardown --------------------------------------------------------- */

  function destroy() {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    timer.dispose();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('keydown', onKeyDown);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    canvasHost.removeEventListener('pointermove', onPointerMove);
    state.timers.forEach(clearTimeout);
    clearTimeout(state.lastToast);
    clearTimeout(deltaTimer);
    delete window.__ppMaleri;

    const textures = new Set([artTex, surfTex, selTex]);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          ['map', 'alphaMap', 'bumpMap', 'roughnessMap'].forEach((k) => {
            if (m[k]) textures.add(m[k]);
          });
          m.dispose();
        });
      }
    });
    textures.forEach((tx) => tx.dispose());
    scene.environment = null;
    if (envRT) envRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    sfx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createPainting;
export { ARTWORKS };
