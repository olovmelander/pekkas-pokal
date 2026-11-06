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
 * your hand, garden.js the world, cast.js the people in it (Hägglund and
 * the rest of the field, from the shared character system), hud.js the
 * markup, audio.js the sound. This file is the evening itself: the camera,
 * the flow and the scoring.
 *
 * Real graphics cards are stricter than the software renderer the game is
 * tested on (see ../shared/gfx.js): the renderer is guarded, shaders are
 * compiled asynchronously before the first frame, and a watchdog steps the
 * garden down if the picture ever comes out black.
 */

import * as THREE from 'three';
import { Sfx } from './audio.js';
import { createGameClock } from '../shared/game-clock.js';
import { isEditableTarget } from '../shared/keyboard.js';
import {
  mulberry, buildGarden, animateGarden, buildSky, buildEasel, buildBrush, simplifyGarden
} from './garden.js';
import { buildCast } from './cast.js';
import { guardRenderer, RenderWatchdog, gfxNotice, precompile } from '../shared/gfx.js';
import {
  ARTWORKS, mixPigments, colourDistance, hexToRgb, rgbToCss, paintIdMap,
  mixAdvice, accuracy, MATCH_DE, MAX_DROPS, PIGMENT_WORD
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

const packRgb = (c) => (c ? c.reduce((h, v) => (h << 8) | Math.round(v * 255), 0) : -1);
/** Every region in the colour the master gave it. */
const targetsOf = (w) => w.regions.map((rg) => hexToRgb(rg.color));
/** Pixel height of a canvas `px` wide, at the easel's proportions. */
const tall = (px) => Math.round((px * ART_H) / ART_W);
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
  // Real GPUs are stricter than the test renderer (see shared/gfx.js):
  // shader errors and a lost context get an on-screen notice, ?gfx=safe
  // drops the shadows, the reflections and the people's heavy materials
  const gfx = guardRenderer(renderer, container);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gfx.safe ? 1.5 : lowTier ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral, not ACES: this is a game about getting a colour exactly right,
  // and ACES shifts hue and saturation on the way to the screen. Khronos'
  // neutral curve keeps the canvas reading as the colour you mixed.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = !gfx.safe;
  // r187: PCF with a hardware-compared Vogel disk; radius sets the softness
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // The fog colour has to be the sky's HORIZON colour, not its average, or
  // the far spruces fade into a band that does not exist in the sky behind.
  scene.fog = new THREE.Fog(0xc9d9dd, 30, 78);

  // Nothing ever comes nearer the lens than a metre, so the near plane sits
  // at half a metre: five times the depth precision of 0.1, which is what
  // keeps the canvas, its stretcher and the house's windows from flickering
  // through each other on a GPU with a 16-bit depth buffer.
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 140);

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
  // PMREM renders in half floats; a GPU that cannot render to them would
  // hand back garbage for a reflection, so it is skipped there (and in safe mode)
  if (gfx.floatRT && !gfx.safe) {
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
    roughness: 1, metalness: 0, envMapIntensity: 0.55,
    // The canvas lies on the face of its stretcher: pulled toward the eye in
    // depth-buffer units, so the two can never fight whatever the precision
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4
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
        totalEmissiveRadiance += vec3( 1.0, 0.68, 0.22 ) * pmEdge * ( 0.5 + 0.5 * uPulse );`)
      // Specular antialiasing: once the canvas is smaller on screen than its
      // texture (the wide and verdict shots, small phones) the impasto's
      // ridges are sub-pixel, and glossy paint would sparkle as the camera
      // drifts. Let the gloss spread as the texture minifies.
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        vec2 pmTx = vMapUv * vec2( ${ART_W}.0, ${ART_H}.0 );
        float pmMin = max( length( dFdx( pmTx ) ), length( dFdy( pmTx ) ) );
        roughnessFactor = mix( roughnessFactor, max( roughnessFactor, 0.6 ), clamp( pmMin - 1.0, 0.0, 1.0 ) );`);
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
  const brushState = { on: 0, vis: 0, x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, sound: 0 };

  // The id-map lives offscreen: tapping the canvas reads pixels from it
  // rather than doing point-in-polygon against curved paths.
  const idCv = document.createElement('canvas');
  idCv.width = ART_W;
  idCv.height = ART_H;
  const idCtx = idCv.getContext('2d', { willReadFrequently: true });

  /* ---- The people ------------------------------------------------------ */

  // Mikael Hägglund waits by the trestle; beside your easel, level with the
  // canvas, is where he stands to judge it — never in front of it
  const JUDGE_HOME = { x: 1.75, z: -3.4, ry: -1.1 };
  const JUDGE_SPOT = { x: 1.22, z: -0.5 };
  const cast = buildCast({
    lowTier, safe: gfx.safe, reduced, home: JUDGE_HOME, spot: JUDGE_SPOT, canvasC: CANVAS_C, seed: 2021
  });
  scene.add(cast.group);
  // Soft contact shade on the lawn under every easel and everyone at one
  garden.refs.macro.shade([{ x: 0, z: EASEL_Z, r: 0.85, k: 0.55 }, { x: 0, z: EASEL_Z + 0.9, r: 0.7, k: 0.25 }, ...cast.lawnSpots()]);

  /*
   * A sunny garden is never dark. If the picture comes out (nearly) black on
   * some GPU, step down: first the shadows (the dappled light under the
   * birch is a shadow, and a broken shadow map can put everything in
   * shade), then the garden's own shaders and the reflections.
   */
  const watchdog = new RenderWatchdog(
    renderer,
    [
      () => {
        renderer.shadowMap.enabled = false;
        sun.castShadow = false;
        scene.traverse((o) => {
          if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
        });
      },
      () => {
        simplifyGarden(garden);
        scene.environment = null;
        artMat.needsUpdate = true;
      }
    ],
    { minLitFraction: 0.3, darkThreshold: 24, onStep: () => gfxNotice(container, 'Grafiken förenklades för att fungera på den här enheten.') }
  );

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

  let helpOpen = false;
  let paused = false;
  let modalFocus = null;
  const clock = createGameClock();
  const later = (fn, ms) => clock.schedule(fn, ms / 1000);

  /* ---- Layout & camera -------------------------------------------------- */

  const view = { w: 1, h: 1, lay: layoutFor(1, 1) };
  /** The camera rig: the shot it is on, how far into the move, seconds on it. */
  const rig = { name: 'wide', t: 1, dur: 1, from: null, since: 0, kick: 0, kickAmp: 0 };

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
    if (name === 'judge' || name === 'inspect') {
      // The canvas and Hägglund beside it, in the space the verdict card
      // leaves free: the left of a wide screen, the top of a tall one. While
      // he is still walking over and looking ('inspect') there is no card
      // yet, so the pair has the whole screen.
      let free;
      if (name === 'inspect') free = { x: 0, y: lay.top, w: W, h: H - lay.top - (wide ? 10 : H * 0.1) };
      else if (wide) free = { x: 0, y: lay.top, w: W - lay.card - 28, h: H - lay.top };
      else free = { x: 0, y: lay.top - 10, w: W, h: H * 0.3 - lay.top + 16 };
      const fov = wide ? 36 : 46;
      const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const ppu = Math.min((free.h * 0.86) / 2.35, (free.w * 0.86) / 2.3);
      const d = H / (2 * tan * ppu);
      const tgt = new THREE.Vector3(0.45, 1.15, -0.5);
      const dir = new THREE.Vector3(0.62, 0.22, 2.0).normalize();
      // Once he has arrived, the camera leans in on him, slowly
      const push = reduced || name !== 'judge' ? 0 : 0.08 * (1 - Math.exp(-Math.max(0, rig.since - 2.2) / 5));
      tgt.x += push * 1.6;
      tgt.y += push * 0.9;
      return {
        pos: tgt.clone().addScaledVector(dir, d * (1 - push)), tgt, fov,
        ox: W / 2 - (free.x + free.w / 2), oy: H / 2 - (free.y + free.h / 2)
      };
    }
    // 'wide': the whole garden, drifting slowly round the easel
    const a = 0.46 + (reduced ? 0 : Math.sin(t * 0.07) * 0.2);
    const R = wide ? 6.4 : 8.6;
    const c = new THREE.Vector3(0.2, 1.2, -3.0);
    return {
      pos: new THREE.Vector3(
        c.x + Math.sin(a) * R, 2.35 + (reduced ? 0 : Math.sin(t * 0.11) * 0.15), c.z + Math.cos(a) * R
      ),
      tgt: new THREE.Vector3(-0.1, 1.35, -3.2),
      fov: wide ? 44 : 56,
      ox: wide ? -W * 0.15 : 0,
      oy: wide ? 0 : H * 0.17
    };
  }

  let peekShot = null;
  const cur = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 40, ox: 0, oy: 0 };

  function setShot(name, dur = 1.4) {
    rig.from = { pos: cur.pos.clone(), tgt: cur.tgt.clone(), fov: cur.fov, ox: cur.ox, oy: cur.oy };
    rig.name = name;
    rig.t = 0;
    rig.since = 0;
    rig.dur = reduced ? Math.min(dur, 0.01) : Math.max(0.001, dur);
    if (dur <= 0) rig.t = 1;
  }

  function updateCamera(dt, t) {
    rig.since += dt;
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
      // A colour hit leans the camera in toward the canvas for a beat
      if (rig.kick > 0.001) {
        rig.kick = Math.max(0, rig.kick - dt * 2.4);
        const k = Math.sin(Math.min(1, rig.kick) * Math.PI) * rig.kickAmp;
        camera.position.lerp(cur.tgt, k);
      }
    }
    camera.lookAt(cur.tgt);
    camera.fov = cur.fov;
    camera.setViewOffset(view.w, view.h, cur.ox, cur.oy, view.w, view.h);
    if (peekShot) {
      camera.position.copy(peekShot.pos);
      camera.lookAt(peekShot.tgt);
      camera.fov = peekShot.fov;
      camera.setViewOffset(view.w, view.h, 0, 0, view.w, view.h);
    }
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
    hud.pigments.forEach((button) => {
      const well = palette.wellPos(button.dataset.pigment);
      button.style.left = `${well.x}px`;
      button.style.top = `${well.y}px`;
    });
    sizeRefCanvases();
    if (rig.t >= 1) setShot(rig.name, 0);
    // Resizing clears both canvases. Repaint the frozen pose after a phone
    // rotation without advancing the active clock, strokes or delayed verdict.
    if (paused || helpOpen) {
      palette.update(0);
      updateCamera(0, clock.now);
      renderer.render(scene, camera);
    }
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
    const bh = tall(big);
    [hud.refCv, hud.refSel].forEach((c) => {
      if (c.width !== big) {
        c.width = big;
        c.height = bh;
      }
    });
    const mini = Math.round(60 * dpr);
    const mh = tall(mini);
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
      return `<button class="pm-dot ${cls}" data-i="${i}"${bg} title="${esc(rg.name)}" aria-label="${esc(rg.name)}${p ? ', redan målad' : ''}" aria-pressed="${i === state.selected}" ${p ? 'disabled' : ''}></button>`;
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
    const advice = target ? mixAdvice(drops, target) : null;
    const has = !!advice && total() > 0;
    const acc = has ? accuracy(advice.dE) : 0;
    const match = has && advice.dE < MATCH_DE;
    hud.meterFill.style.width = `${((1 - acc) * 100).toFixed(1)}%`;
    hud.meterMark.style.left = `${(acc * 100).toFixed(1)}%`;
    hud.meter.dataset.zone = !has ? 'none' : match ? 'hot' : acc > 0.62 ? 'warm' : 'cold';
    hud.chip.classList.toggle('match', match);
    hud.apply.classList.toggle('ready', match);
    if (prevDE != null && has) {
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
    hud.pigments.forEach((button) => {
      const pigment = PIGMENTS.find((p) => p.key === button.dataset.pigment);
      // The painted palette already draws its droplet badges; keep a single
      // visible count while the button exposes the same recipe to assistive tools.
      button.textContent = '';
      button.setAttribute('aria-label', `${pigment.name}: ${drops[pigment.key]} droppar. Lägg till en droppe.`);
      button.disabled = state.phase !== 'paint' || drops[pigment.key] >= MAX_DROPS;
    });
    hud.undo.disabled = !history.length;
    hud.wipe.disabled = !total();
    state.advice = advice;
    updateTip();
  }

  /**
   * The hint under the meter. It always says which way the mix is off —
   * too light, too grey, wrong hue — and only after a few seconds stuck on
   * a region does it (and the palette) name the drop to add. Learning to
   * read the direction is the game; being rescued is the safety net.
   */
  function updateTip() {
    const a = state.advice;
    // A first evening ever: the palette points at the next drop almost at
    // once on the first canvas, so nobody stands there not knowing what to tap
    const after = state.firstEvening && state.workNo === 1 ? 1.2 : TIP_AFTER;
    const stuck = state.phase === 'paint' && !!a && !!a.tip && state.regionTime > after;
    palette.setTip(stuck && a.tip !== 'wipe' ? a.tip : null);
    hud.wipe.classList.toggle('nudge', stuck && a.tip === 'wipe');
    let txt;
    if (!a) txt = 'Tryck på en yta i tavlan';
    else if (!total()) txt = stuck ? `Droppa pigment · börja med ${PIGMENT_WORD[a.tip]}` : 'Droppa pigment på paletten';
    else if (!a.tip) txt = a.axis;
    else if (!stuck) txt = a.axis;
    else txt = a.tip === 'wipe' ? `${a.axis} · torka och börja om` : `${a.axis} · mer ${PIGMENT_WORD[a.tip]}`;
    hud.hint.textContent = txt;
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
    if (paused || helpOpen || state.phase !== 'paint') return;
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
    if (paused || helpOpen || state.phase !== 'paint' || !history.length) return;
    const before = currentDE();
    setDrops(history.pop());
    palette.setDrops(drops);
    sfx.scrape();
    renderMix(before);
  }

  function wipe() {
    if (paused || helpOpen || state.phase !== 'paint' || !total()) return;
    history.push({ ...drops });
    setDrops({ r: 0, y: 0, b: 0, w: 0, k: 0 });
    palette.wipe();
    sfx.scrape();
    renderMix();
  }

  /** Tapping a dab on the palette rim mixes that colour up again. */
  function loadDab(dabDrops) {
    if (paused || helpOpen || state.phase !== 'paint') return;
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
    if (paused || helpOpen || state.phase !== 'paint' || state.selected < 0) return;
    if (!total()) {
      toast('Paletten är tom — droppa lite pigment först');
      return;
    }
    const idx = state.selected;
    if (painted[idx]) return;
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
    if (hit) {
      rig.kick = 1;
      rig.kickAmp = Math.min(0.045, 0.018 + 0.006 * state.streak);
    }
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
    refImage = renderPainting(work, targetsOf(work), rw, tall(rw), { museum: true });
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
    // Between evenings Hägglund wanders over to see what the others are doing
    cast.judge.stroll = p === 'idle' || p === 'over';
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
    cast.judge.goHome();
    later(() => {
      // state.hold lets a test (or a slow reader) keep the slip up
      if (state.phase === 'draw' && !state.hold) beginPaint();
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
    if (paused || helpOpen || state.phase !== 'paint') return;
    setPhase('judging');
    live.finish();
    brushState.on = 0;
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
    // While he walks over and looks, the garden holds its breath
    later(() => {
      if (state.phase === 'judging') callout('Hägglund granskar …', 'soft judge');
    }, reduced ? 0 : 1100);

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
    // Banked now, shown when the grade has counted up: skipping the verdict
    // must not cost the bonus (or the record)
    state.score += bonus;
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
    setShot('inspect', 1.7);
    cast.judge.inspect(grade);
    later(() => showReveal(result), reduced ? 400 : 2000);
  }

  function showReveal(r) {
    setPhase('reveal');
    // Room for the card: the camera eases the pair aside
    setShot('judge', 1.1);
    // If he is still on his way over, the verdict waits until he arrives
    cast.judge.verdict();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(clamp(view.lay.wide ? (view.lay.card - 70) / 2 : (view.w - 60) / 2, 120, 280) * dpr);
    const ph = tall(pw);
    hud.rvNo.textContent = `${state.workNo}/${WORKS_PER_GAME}`;
    hud.rvTitle.textContent = r.work.title;
    hud.rvYours.replaceChildren(renderPainting(r.work, r.painted, pw, ph));
    hud.rvOrig.replaceChildren(renderPainting(r.work, targetsOf(r.work), pw, ph, { museum: true }));
    hud.rvOrigCap.textContent = `${r.work.artist}, ${r.work.year}`;
    hud.rvGrade.textContent = '0,0';
    hud.rvGrade.parentElement.classList.remove('landed', 'gold');
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
    hud.rvNextTxt.textContent = state.workNo < WORKS_PER_GAME ? 'Dra nästa lapp' : 'Kvällens resultat';
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
        // The figure lands like a stamp; a 9 or better lands in gold
        hud.rvGrade.parentElement.classList.add('landed');
        hud.rvGrade.parentElement.classList.toggle('gold', r.grade >= 9);
        setScore(state.score);
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
          if (r.grade >= 7.5) {
            sfx.applause(r.grade >= 9);
            // The rest of the field turns round: brushes up, the back row applauds
            cast.hail(r.grade >= 9);
          }
          if (r.grade >= 9) confetti(36);
        }, reduced ? 0 : 200 + r.stars * 260);
      }
    });
  }

  function nextFromReveal() {
    if (state.phase !== 'reveal') return;
    // The bonus was banked when judging began. Skipping the presentation
    // must keep it, without letting its stars or applause spill into a new work.
    clock.clear();
    tweens.length = 0;
    hud.pops.replaceChildren();
    setScore(state.score);
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
    const ph = tall(pw);
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
    hud.score.textContent = fmt(state.score);
    hud.fnSub.textContent = isHigh ? 'poäng · nytt rekord!' : `poäng · rekord ${fmt(high)}`;
    hud.root.classList.toggle('pm-record', isHigh);
    state.returnCard = 'final';
    hud.showCard('final');
    setShot('wide', 2.2);
    cast.judge.goHome();
    sfx.fanfare();
    if (avg >= 8 || isHigh) confetti(60);
  }

  function startGame() {
    clock.clear();
    tweens.length = 0;
    hud.pops.replaceChildren();
    sfx.resume();
    state.firstEvening = !Object.keys(bests).length && !gallery.length;
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
      thumbCache.set(key, renderPainting(w, targetsOf(w), px, tall(px), { museum: true, lit: false }));
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
      c.height = tall(px);
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
    const ph = tall(pw);
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
    hud.zoomImg.replaceChildren(renderPainting(w, g.c.map(unpackRgb), pw, tall(pw)));
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

  /* ---- Input ------------------------------------------------------------ */

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
    if (e.button !== 0 || paused || helpOpen || state.phase !== 'paint') return;
    sfx.resume();
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
    if (paused || helpOpen || e.pointerType !== 'mouse' || state.phase !== 'paint') return;
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
    if (e.button !== 0 || paused || helpOpen || state.phase !== 'paint') return;
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
    if (e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return;
    if (e.key === 'Escape') {
      if (helpOpen) setHelp(false);
      else if (paused) setPaused(false);
      else if (hud.overlay.dataset.card === 'zoom') openGallery();
      else if (hud.overlay.dataset.card === 'gallery') closeGallery();
      else return;
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyP' && !e.repeat) {
      e.preventDefault();
      if (!helpOpen) setPaused(!paused);
      return;
    }
    if (e.key === '?' && !e.repeat) { e.preventDefault(); setHelp(!helpOpen); return; }
    if (e.key === 'Tab') {
      const scope = helpOpen ? hud.help : paused ? hud.pausePanel : hud.root;
      const controls = [...new Set([...scope.querySelectorAll('button:not(:disabled)'), hud.mute, document.querySelector('#game-close')])]
        .filter((el) => el && !el.closest('[inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
      const i = controls.indexOf(document.activeElement);
      if (controls.length) {
        e.preventDefault();
        const next = i < 0 ? (e.shiftKey ? controls.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[next].focus({ preventScroll: true });
      }
      return;
    }
    if (paused || helpOpen || e.repeat) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= PIGMENTS.length) {
      e.preventDefault();
      sfx.resume();
      addDrop(PIGMENTS[n - 1].key);
    } else if (e.key === ' ' || e.key === 'Enter') {
      // Focused buttons keep their native Space/Enter activation.
      if (e.target?.closest('button')) return;
      e.preventDefault();
      sfx.resume();
      if (state.phase === 'paint') applyPaint();
      else if (state.phase === 'draw') beginPaint();
      else if (state.phase === 'reveal') nextFromReveal();
      else if (state.phase === 'idle' && hud.overlay.dataset.card === 'start') startGame();
      else if (state.phase === 'over' && hud.overlay.dataset.card === 'final') startGame();
    } else if (e.key.toLowerCase() === 'w') {
      e.preventDefault(); wipe();
    } else if (e.key.toLowerCase() === 'z' || e.key === 'Backspace') {
      e.preventDefault(); undo();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && state.phase === 'paint') {
      e.preventDefault();
      const j = nextUnpainted(state.selected, e.key === 'ArrowRight' ? 1 : -1);
      if (j >= 0) select(j);
    }
  }

  function closeGallery() {
    if (state.returnCard === 'final') hud.showCard('final');
    else {
      renderStart();
      hud.showCard('start');
    }
  }

  function syncPause() {
    const blocked = helpOpen || paused;
    hud.root.classList.toggle('pm-paused', blocked);
    const modal = helpOpen ? hud.help : paused ? hud.pausePanel : null;
    for (const child of hud.root.children) {
      if (child === hud.help || child === hud.pausePanel || child === hud.mute) continue;
      child.inert = blocked || (!!hud.overlay.dataset.card && (child === hud.panel || child === hud.ref));
    }
    hud.pausePanel.inert = helpOpen;
    sfx.setPaused(blocked);
    if (modal) modal.querySelector('button').focus({ preventScroll: true });
    else {
      const target = modalFocus?.isConnected && !modalFocus.closest('[inert]') ? modalFocus : hud.root;
      target.focus({ preventScroll: true });
    }
  }
  function setHelp(open) {
    if (open && !helpOpen && !paused) modalFocus = document.activeElement;
    helpOpen = open;
    hud.help.hidden = !open;
    syncPause();
  }
  function setPaused(value) {
    if (paused === value) return;
    if (value && !helpOpen) modalFocus = document.activeElement;
    paused = value;
    hud.pausePanel.hidden = !value;
    hud.pause.setAttribute('aria-pressed', String(value));
    syncPause();
  }

  const on = (el, ev, fn, opts) => el.addEventListener(ev, fn, opts);
  on(hud.start, 'click', startGame);
  on(hud.again, 'click', startGame);
  on(hud.rvNext, 'click', nextFromReveal);
  on(hud.overlay, 'click', (e) => {
    // Anywhere on the screen puts the slip away and starts the clock — but
    // not the very click on the button that drew it, still bubbling up here
    if (state.phase === 'draw' && !e.target.closest('button')) beginPaint();
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
    if (!b || paused || helpOpen || state.phase !== 'paint') return;
    const i = Number(b.dataset.i);
    if (!painted[i]) select(i);
  });
  hud.pigments.forEach((button) => {
    // Touch/mouse mixing keeps Space available for painting. Tab users retain
    // the native button activation, including a visible focus ring.
    on(button, 'pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      hud.root.focus({ preventScroll: true });
    });
    on(button, 'click', () => { sfx.resume(); addDrop(button.dataset.pigment); });
  });
  on(hud.pause, 'click', () => setPaused(true));
  on(hud.resume, 'click', () => setPaused(false));
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
    if (!running || paused || helpOpen) return;
    clock.tick(dt);
    const t = clock.now;

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
      b.vis += ((b.on ? 1 : 0) - b.vis) * (1 - Math.exp(-dt * (b.on ? 30 : 9)));
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
    cast.update(dt, t, camera);
    // The hat hops when a slip comes out of it
    hatHop = Math.max(0, hatHop - dt * 1.6);
    const { hat } = garden.refs;
    hat.position.y = hatBaseY + Math.abs(Math.sin(hatHop * Math.PI * 3)) * 0.06 * hatHop;
    hat.rotation.y = Math.sin(t * 0.3) * 0.05 + Math.sin(hatHop * 14) * 0.2 * hatHop;

    updateCamera(dt, t);
    renderer.render(scene, camera);
    watchdog.afterFrame();
  }

  /*
   * Compile every shader before the first frame, asynchronously where the
   * driver can (Windows/D3D11 compiles the people's physical materials
   * slowly; one blocking burst can trip the GPU watchdog and leave a black
   * canvas). The loading card stays up meanwhile. The crowd's reaction
   * poses and the brush are hidden until needed, so they are shown for it.
   */
  updateCamera(0, 0);
  const hidden = [...cast.hidden(), brush.group];
  hidden.forEach((o) => {
    o.visible = true;
  });
  await precompile(renderer, scene, camera);
  hidden.forEach((o) => {
    o.visible = false;
  });
  timer.reset();
  raf = requestAnimationFrame(tick);

  const onBlur = () => {
    if (!['idle', 'over'].includes(state.phase)) setPaused(true);
    sfx.setPaused(true);
  };
  const onFocus = () => sfx.setPaused(document.hidden || paused || helpOpen);
  const onVisibility = () => {
    running = !document.hidden;
    if (document.hidden) onBlur();
    else onFocus();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);

  /* ---- Debug API -------------------------------------------------------- */

  window.__ppMaleri = {
    state,
    scene,
    camera,
    /** True once the camera has arrived at its current shot. */
    settled: () => rig.t >= 1,
    /** Debug camera: look from `pos` at `tgt` (arrays), or null to hand back. */
    peek(pos, tgt, fov = 30) {
      peekShot = pos ? { pos: new THREE.Vector3(...pos), tgt: new THREE.Vector3(...tgt), fov } : null;
    },
    cast,
    judge: () => ({ mode: cast.judge.mode, then: cast.judge.then, pos: cast.judge.person.root.position.toArray() }),
    gfx: () => ({ safe: gfx.safe, level: watchdog.level, lastMean: watchdog.lastMean, shadows: renderer.shadowMap.enabled }),
    rig: () => ({ name: rig.name, t: rig.t, dur: rig.dur }),
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
    /** Client coordinates of a canvas point (0..1), for tap/click tests. */
    screenOf(u, v) {
      const p = canvasPoint(u, v).project(camera);
      const r = canvasHost.getBoundingClientRect();
      return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height };
    },
    /** Client coordinates of a point inside region i's visible area (a
        stroke position, so it is guaranteed to be on the region). */
    regionScreen(i) {
      const { strokes } = analyse(work).regions[i];
      const s = strokes[Math.floor(strokes.length / 2)];
      return this.screenOf(s.x, s.y);
    },
    /** Client coordinates of a pigment on the palette. */
    wellScreen(key) {
      const r = hud.palette.getBoundingClientRect();
      const w = palette.wellPos(key);
      return { x: r.left + w.x, y: r.top + w.y };
    },
    info() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        textures: renderer.info.memory.textures,
        geometries: renderer.info.memory.geometries,
        programs: renderer.info.programs ? renderer.info.programs.length : 0,
        people: cast.stats()
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
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    canvasHost.removeEventListener('pointermove', onPointerMove);
    clock.destroy();
    clearTimeout(state.lastToast);
    clearTimeout(deltaTimer);
    delete window.__ppMaleri;
    watchdog.dispose();
    gfx.dispose();
    // People first: their materials are shared and refcounted, and their
    // props are positioned in the cast group, not parented to the scene's bones
    cast.dispose();

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
