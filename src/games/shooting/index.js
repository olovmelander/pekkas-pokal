/**
 * Pekkas Lerduvor — the 2022 competition as a Three.js clay shooting game.
 *
 * The design borrows from the whole lineage — Duck Hunt's point-and-shoot
 * joy, the trap and skeet rule book, and everything game-feel research
 * says about making a shot land:
 *
 *  - Every pull follows the real ritual: call PULL, and the trap answers
 *    after a RANDOM delay (0.2–1.8 s) exactly like Olympic skeet, so the
 *    launch always startles a little.
 *  - Singles give two shells, like real trap. Doubles give one per bird.
 *  - 24 duvor over three series — singles, crossers, then doubles — and
 *    then the 25th: GULDDUVAN, small, fast and worth 500. A full round
 *    of 25, like a real scorecard.
 *  - Swing-through controls: touch, track the bird, RELEASE to fire.
 *    The whole phone is the gun.
 *  - The shot has a time of flight (~0.1 s out to the clay) and carries
 *    the swing with it: follow the bird and release on it, and the pattern
 *    arrives where the bird has got to; stop the gun and it goes behind.
 *    That is swing-through, and every miss shows you where it went.
 *
 * Hits break the clay into actual 3D shards with hit-stop and a streak
 * multiplier; misses cost nothing but the streak. The gang watches from
 * folding chairs — the real 2022 field, see gang.js — in the establishing
 * shot the round opens and closes on, and in a reaction shot after every
 * series. Ludvig won this in real life — his ghost score is the target,
 * and beating it is the gold medal.
 *
 * Real-GPU notes (the game is tested on a forgiving software GPU, played on
 * Direct3D, Metal and phone drivers): every shader is compiled before the
 * first frame for the exact path that will draw it, the scene's light count
 * never changes at runtime (that would recompile everything mid-game), the
 * sky clears to haze rather than black, and a watchdog steps the graphics
 * down — post-processing, then shadows, then the custom shaders — if the
 * picture comes out dark.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { guardRenderer, postTarget, addSanitize, RenderWatchdog, gfxNotice, precompile } from '../shared/gfx.js';
import { Sfx } from './audio.js';
import { HAZE, SUN_DIR, LIGHT_DIR, SUN_COLOR, buildSky, bakeEnvironment, buildHaze, buildHills, buildShafts } from './sky.js';
import { buildGang } from './gang.js';
import { mulberry, glowTexture, starTexture, buildRange, buildClay } from './range.js';
import { buildShotgun } from './gun.js';
import { buildGrass } from './grass.js';
import { Particles, Shards, ShotCloud, buildAmbient } from './fx.js';
import { buildHud, cardHtml, startPanelHtml, endPanelHtml, fmt } from './hud.js';

/** Fill the whole stage: a wide evening vista is this game's hero shot. */
export const layout = 'full';

const HIGHSCORE_KEY = 'pp-skytte-highscore';
const BEST_KEY = 'pp-skytte-best';
const LUDVIG = 3400; // mästarens ghost score
const LUDVIG_NAME = 'Ludvig Ulenius';

/** Medal lines. Gold is defined by Ludvig: beat his 2022 round. */
const MEDALS = [
  { id: 'brons', name: 'Brons', min: 1800 },
  { id: 'silver', name: 'Silver', min: 2800 },
  { id: 'guld', name: 'Guld', min: LUDVIG + 1 }
];

const SERIES = [
  { name: 'Serie 1 — Uppvärmningen', singles: 8, doubles: 0, speed: 0.85, brief: 'Åtta lugna duvor från graven. Hitta svingen.' },
  {
    name: 'Serie 2 — Korsarna', singles: 8, doubles: 0, speed: 1.1, crossers: true, incomers: [2, 6],
    brief: 'Snabbare nu, från sidorna — och två rakt mot dig från tornet. Sving igenom duvan!'
  },
  {
    name: 'Serie 3 — Finalen', singles: 4, doubles: 2, speed: 1.25, crossers: true, incomers: [1],
    brief: 'Fyra singlar, en från tornet, och två dubbléer. Ett skott per duva i dubbléerna.'
  }
];

/* Ballistics, tuned to feel like a 12-bore at 25–45 m */
const SHOT_SPEED = 380; // m/s — pellet average over the first 40 m
const PATTERN = 0.03; // rad — the pattern's killing radius (~1.7°)
const PATTERN_GOLD = 0.021; // tighter for the little golden dove
const CLAY_R = 0.37;
const MAX_SWING = 1.4; // rad/s — clamp on how much lead a flick can carry
const GRAVITY = 9.8;
const WIND = new THREE.Vector3(1.3, 0.05, 0.25); // a westerly breeze, m/s

/** The high tower at the forest edge the incomers are thrown from (range.js builds it). */
const TOWER_TOP = new THREE.Vector3(9, 8.9, -60);

const ORANGE = new THREE.Color(0xff6a1c);
const GOLD = new THREE.Color(0xf2c14e);

/**
 * Frame delta, clamped at BOTH ends. Only clamping the top looks harmless
 * until a queued rAF fires with a timestamp older than the one stashed on
 * visibilitychange: dt goes negative, and every `x -= rate * dt` in the
 * loop starts running backwards — fades brighten, scales invert.
 */
function clampDt(ms) {
  return Math.max(0, Math.min(0.05, ms / 1000));
}

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function medalTier(score) {
  let tier = 0;
  MEDALS.forEach((m, i) => {
    if (score >= m.min) tier = i + 1;
  });
  return tier;
}

function readBest() {
  try {
    const raw = JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
    const legacy = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
    const best = raw && typeof raw === 'object' ? raw : { score: 0, hits: 0, tier: 0 };
    if (legacy > best.score) best.score = legacy;
    return best;
  } catch (e) {
    return { score: 0, hits: 0, tier: 0 };
  }
}

function writeBest(best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
    localStorage.setItem(HIGHSCORE_KEY, String(Math.round(best.score)));
  } catch (e) {
    /* private mode */
  }
}

/* ------------------------------------------------------------------- game */

export async function createShooting(container) {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas sk-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui fg-ui sk-ui';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost, { ludvig: LUDVIG });

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  // Quality tier: phones and small screens skip bloom and get a smaller
  // shadow map; the meadow itself stays the same one draw call everywhere.
  const lowTier = touch || Math.min(window.innerWidth, window.innerHeight) < 560;
  const quality = { bloom: !lowTier, dprCap: lowTier ? 1.75 : 2, dpr: 1 };
  // Automated runs (screenshots, tests) get a fixed quality so the result
  // is deterministic; real players get adaptive resolution.
  const adaptive = !navigator.webdriver;
  hud.pullKey.textContent = touch ? 'eller tryck på fältet' : 'mellanslag';

  const sfx = new Sfx();
  const rand = mulberry(2022);
  const fxRand = mulberry(99);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  quality.dpr = Math.min(window.devicePixelRatio || 1, quality.dprCap);
  renderer.setPixelRatio(quality.dpr);
  // Whatever fails to draw, the frame behind it is evening haze, not black
  renderer.setClearColor(HAZE, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = true;
  // r187: PCFSoftShadowMap is gone; PCF now does hardware comparison over
  // a 5-tap Vogel disk whose spread is light.shadow.radius (in texels).
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Count every pass of a frame (bloom included), not just the last one.
  // Safe with skinned people: r187 advances info.render.frame (which gates
  // skeleton updates) in render() itself, not in reset().
  renderer.info.autoReset = false;
  canvasHost.appendChild(renderer.domElement);
  // Riktiga grafikkretsar är strängare än testmiljöns: rätt sorts mål för
  // efterbehandlingen, notis om en shader inte kompilerar, ?gfx=safe
  const gfx = guardRenderer(renderer, container);
  // Bloom wants a half-float target; on 8 bits the linear HDR image would
  // band in the dark sky, so without float targets there is no composer.
  if (gfx.safe || !gfx.floatRT) quality.bloom = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HAZE, 50, 300);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 420);
  camera.position.set(0, 1.7, 0);
  scene.add(camera);

  /* ---- Shader compilation ------------------------------------------------ */

  /**
   * A program depends on WHERE it draws: into the composer's target (linear
   * light, no tone mapping) or straight to the screen (ACES + sRGB) — two
   * different programs per material. precompile() alone would warm the
   * screen variant, and with bloom on every material would then still
   * compile in one blocking burst on the first frame: exactly what trips
   * the GPU watchdog on Windows. So each path is compiled for its target.
   * (compileAsync compiles synchronously up front and only then waits, so
   * the render target can be restored straight after the call.)
   */
  let compileRT = null;
  let busy = false; // a background compile for a step-down is running
  let alive = true;
  async function compileFor(root, toTarget) {
    if (toTarget) {
      compileRT = compileRT || new THREE.WebGLRenderTarget(1, 1);
      renderer.setRenderTarget(compileRT);
    } else {
      renderer.setRenderTarget(null);
    }
    const job = precompile(renderer, root, camera);
    renderer.setRenderTarget(null);
    await job;
  }

  /* Lighting hierarchy: one warm low sun (the only shadow caster), a sky
     hemisphere, and a cool fill from behind the shooter — the scene is
     backlit, so without it every face toward the camera would go dead. */
  const hemi = new THREE.HemisphereLight(0xbfd3ec, 0x5d6431, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd1a0, 2.5);
  sun.target.position.set(0, 0, -8);
  sun.position.copy(sun.target.position).addScaledVector(LIGHT_DIR, 80);
  sun.castShadow = true;
  // A tight orthographic frustum around the station is what keeps a single
  // map crisp — a wide one would smear every contact shadow away.
  sun.shadow.mapSize.setScalar(lowTier ? 1024 : 2048);
  // Depth range just around what the frustum covers (the light sits 80 m
  // out): an orthographic map spreads its precision evenly, so a 170 m range
  // made the bias 13 cm and lifted every contact shadow off the ground. The
  // light never moves, so there is no shadow swimming to snap away.
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 30, far: 125 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xa4bde2, 0.42);
  fill.position.set(30, 14, 26);
  scene.add(fill);

  /* ---- World ---------------------------------------------------------- */

  const glow = glowTexture();
  const star = starTexture();
  const sky = buildSky();
  scene.add(sky.dome);
  // The env bake draws the sky into a float target — compile that variant
  // in the background first instead of in one blocking burst inside PMREM
  await compileFor(sky.dome, true);
  const envRT = bakeEnvironment(renderer, sky);
  const envMap = envRT ? envRT.texture : null;
  const haze = buildHaze();
  scene.add(haze.group);
  scene.add(buildHills());
  const range = buildRange(mulberry(2022), { envMap, lite: lowTier });
  scene.add(range.group);
  const shafts = buildShafts(mulberry(606));
  scene.add(shafts.mesh);
  const grass = buildGrass(mulberry(8123), { sunDir: SUN_DIR, sunColor: SUN_COLOR });
  scene.add(grass.mesh);

  const gun = buildShotgun({ envMap, glow, star });
  gun.group.scale.setScalar(0.55);
  camera.add(gun.group);
  let flashK = 0;

  // The gang on the fika chairs (and Henrik with the score sheet)
  const gang = buildGang({ rand: mulberry(1975) });
  scene.add(gang.group);
  const stationEye = new THREE.Vector3(0, 1.6, 0);

  // No bake (no float targets): mirror-metal would render black without
  // something to reflect, so the gun and the trophy turn satin instead
  if (!envMap) {
    scene.traverse((o) => {
      [].concat(o.material || []).forEach((m) => {
        if (m.isMeshStandardMaterial && m.metalness > 0.5) {
          m.metalness = 0.45;
          m.roughness = Math.max(m.roughness, 0.45);
        }
      });
    });
  }

  /* Clay pool: at most two airborne (the double) */
  const clays = [buildClay(), buildClay()].map((mesh) => {
    scene.add(mesh);
    return {
      mesh, active: false, vel: new THREE.Vector3(), spin: 0, gold: false,
      box: -1, seen: false, offT: 0, shotAt: false
    };
  });
  // The golden dove's glint: a star that rides on it so it reads at 40 m
  const glintMat = new THREE.SpriteMaterial({
    map: star, color: 0xffe7a0, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
  const glint = new THREE.Sprite(glintMat);
  glint.scale.setScalar(1.6);
  scene.add(glint);

  const fogInfo = { color: scene.fog.color, near: scene.fog.near, far: scene.fog.far };
  const soft = new Particles(420, { fog: fogInfo });
  const bright = new Particles(260, { additive: true, fog: fogInfo });
  scene.add(soft.mesh, bright.mesh);
  const shards = new Shards(44);
  scene.add(shards.mesh);
  const shot = new ShotCloud(72);
  scene.add(shot.lines);
  const ambient = buildAmbient(mulberry(5), { sunDir: SUN_DIR, sunColor: SUN_COLOR });
  scene.add(ambient.points);

  /* ---- Post: bloom on the sun, the flash and the gold --------------- */

  let composer = null;
  let bloom = null;
  function buildComposer() {
    composer = new EffectComposer(renderer, postTarget(gfx, { samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    addSanitize(composer);
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 1.25);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  function disposeComposer() {
    if (!composer) return;
    composer.passes.forEach((p) => {
      if (p.dispose) p.dispose();
    });
    composer.dispose();
    composer = null;
    bloom = null;
  }
  if (quality.bloom) buildComposer();

  /**
   * Step-downs compile what they will need in the background first and
   * switch only when it is ready, so dropping bloom or shadows never stalls
   * the game for a blocking compile. Never re-enabled once dropped.
   */
  async function dropComposer() {
    if (!composer || busy) return;
    busy = true;
    await compileFor(scene, false);
    busy = false;
    if (alive) disposeComposer();
  }

  async function dropShadows() {
    if (!renderer.shadowMap.enabled || busy) return;
    busy = true;
    // Shadow-less variants, compiled while the shadowed ones keep drawing
    renderer.shadowMap.enabled = false;
    const job = compileFor(scene, !!composer);
    renderer.shadowMap.enabled = true;
    await job;
    busy = false;
    if (!alive) return;
    renderer.shadowMap.enabled = false;
    scene.traverse((o) => {
      [].concat(o.material || []).forEach((m) => {
        m.needsUpdate = true;
      });
    });
  }

  /** Last resort: the plainest sky and no custom-shader layers or reflections. */
  function plainShaders() {
    sky.dome.material = sky.plain;
    haze.group.visible = false;
    ambient.points.visible = false;
    shafts.mesh.visible = false;
    scene.traverse((o) => {
      [].concat(o.material || []).forEach((m) => {
        if (m.envMap) {
          m.envMap = null;
          m.metalness = Math.min(m.metalness, 0.45);
          m.needsUpdate = true;
        }
      });
    });
  }

  // Blir bilden svart eller mörk på någon krets trappas grafiken ner i
  // stället för att spelet blir ospelbart: först efterbehandlingen, sedan
  // skuggorna, sist de egna shaderna. The scene is a bright evening, so the
  // bar is higher than "black": under a third of the sampled pixels above a
  // dim grey means something in the chain broke (normal frames sit at 70 %+).
  let lastCheck = null;
  class Watchdog extends RenderWatchdog {
    afterFrame() {
      if (!busy) super.afterFrame(); // re-check only once a step has landed
    }

    judge(stats) {
      lastCheck = stats;
      super.judge(stats);
    }
  }
  const watchdog = new Watchdog(renderer, [dropComposer, dropShadows, plainShaders], {
    darkThreshold: 40,
    minLitFraction: 0.3,
    onStep: () => gfxNotice(container, 'Grafiken förenklades för att fungera på den här enheten.')
  });

  /* ---- State ----------------------------------------------------------- */

  const state = {
    phase: 'intro', // intro | armed | delay | flight | between | over
    serieNo: 1,
    throwNo: 0, // index of the throw within the series
    score: 0,
    streak: 0,
    bestStreak: 0,
    shells: 2,
    delayT: 0,
    resolveT: 0,
    isDouble: false,
    isGold: false,
    card: SERIES.map(() => new Array(8).fill(null)),
    gold: null,
    thrown: 0, // birds resolved so far — Ludvig's pace runs on this
    passedLudvig: false,
    stats: { hits: 0, base: 0, bonus: 0, pairs: 0, clean: 0, goldPts: 0 },
    hintsShown: {},
    missKinds: {},
    firstPull: true
  };

  let best = readBest();
  let helpOpen = false;
  let hitStopT = 0;
  let slowT = 0;
  let timeScale = 1;
  let shakeP = 0;
  let recoil = 0;
  let kick = 0;
  let kickV = 0;
  let camBlend = 0; // 0 = establishing shot, 1 = at the gun
  let camTarget = 0;
  let camSpeed = 0.6;
  // The reaction shot after a series: 0 = at the gun, 1 = on the gang
  const reaction = { k: 0, target: 0 };
  let raise = 0; // how far the gun is up (0 lowered/hidden … 1 shouldered)
  let countUp = null;
  const pending = []; // shots in flight: { t, records, shotDir, gold }
  const timers = new Set();
  const aim = { x: 0, y: 0.12 }; // NDC
  const finger = { x: 0, y: 0, touch: false }; // NDC of the finger under a touch aim
  const swingLog = []; // { t, dir } — the last ~150 ms of aim directions
  let tracking = false;
  const lead = { t: 0, center: new THREE.Vector3(), clay: new THREE.Vector3(), dots: [], radius: 0 };
  const follow = { yaw: 0, pitch: 0 };
  const flare = { t: 0, pos: new THREE.Vector3() };
  const perf = { ema: 16, slowFor: 0, age: 0 };
  const clock = { shader: 0, game: 0 }; // shader time, kept small (see wrap)

  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const ndcV = new THREE.Vector2();
  const view = { w: 1, h: 1, aspect: 1 };

  /* ---- Small helpers --------------------------------------------------- */

  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function serie() {
    return SERIES[state.serieNo - 1];
  }

  function toast(msg, big = false) {
    hud.toast.textContent = msg;
    hud.toast.className = `pb-toast show${big ? ' big' : ''}`;
    clearTimeout(state.toastId);
    state.toastId = later(() => {
      hud.toast.className = 'pb-toast';
    }, big ? 1700 : 1100);
  }

  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function callout(txt, cls = '') {
    hud.callout.textContent = txt;
    hud.callout.className = `fg-zone sk-callout ${cls}`;
    retrigger(hud.callout, 'show');
  }

  function setPhase(txt, ms = 2800) {
    hud.phase.textContent = txt;
    hud.phase.classList.toggle('show', !!txt);
    clearTimeout(state.phaseId);
    if (txt) {
      state.phaseId = later(() => hud.phase.classList.remove('show'), ms);
    }
  }

  function hint(key, txt) {
    if (state.hintsShown[key]) return;
    state.hintsShown[key] = true;
    hud.hint.textContent = txt;
    retrigger(hud.hint, 'show');
    clearTimeout(state.hintId);
    state.hintId = later(() => hud.hint.classList.remove('show'), 4200);
  }

  function flashScreen(cls) {
    if (reduceMotion) return;
    hud.flash.className = `sk-flash ${cls}`;
    retrigger(hud.flash, 'go');
  }

  function screenOf(world) {
    projected.copy(world).project(camera);
    return {
      x: (projected.x * 0.5 + 0.5) * view.w,
      y: (-projected.y * 0.5 + 0.5) * view.h,
      z: projected.z
    };
  }

  function popScore(text, world, cls = '') {
    const s = screenOf(world);
    if (s.z > 1) return;
    const el = document.createElement('div');
    el.className = `fg-pop sk-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${Math.min(view.w - 70, Math.max(70, s.x))}px`;
    el.style.top = `${Math.min(view.h - 40, Math.max(90, s.y - 16))}px`;
    hud.pops.appendChild(el);
    later(() => el.remove(), 1300);
  }

  /* ---- HUD rendering ---------------------------------------------------- */

  function renderScore() {
    hud.score.textContent = fmt(state.score);
    retrigger(hud.score, 'bump');
    renderGhost();
  }

  /** Your score against Ludvig's pace: his 3 400 spread over 25 birds. */
  function renderGhost() {
    const pace = (state.thrown / 25) * LUDVIG;
    hud.ghostFill.style.width = `${Math.min(100, (state.score / LUDVIG) * 100)}%`;
    hud.ghostMark.style.left = `${Math.min(100, (pace / LUDVIG) * 100)}%`;
    hud.ghost.classList.toggle('ahead', state.score >= pace && state.thrown > 0);
    hud.ghost.classList.toggle('passed', state.passedLudvig);
    hud.ghostText.textContent = state.passedLudvig ? 'FÖRBI LUDVIG!' : `LUDVIG ${fmt(LUDVIG)}`;
  }

  function renderStreak() {
    hud.streak.textContent = state.streak >= 2 ? `×${state.streak}` : '';
    hud.streak.classList.toggle('hot', state.streak >= 5);
    if (state.streak >= 2) retrigger(hud.streak, 'bump');
  }

  function renderSerie() {
    hud.serie.textContent = state.isGold ? 'GULDDUVAN' : `SERIE ${Math.min(state.serieNo, 3)}/3`;
  }

  function renderCard() {
    hud.card.innerHTML = cardHtml(state.card, state.gold, { current: state.isGold ? 3 : state.serieNo - 1 });
  }

  function renderShells() {
    const dots = hud.shells.querySelectorAll('i');
    dots[1].style.display = state.isGold ? 'none' : '';
    dots.forEach((d, i) => d.classList.toggle('spent', i >= state.shells));
  }

  function renderPull() {
    hud.pull.classList.toggle('ready', state.phase === 'armed');
    hud.pull.classList.toggle('wait', state.phase === 'delay');
    hud.pull.disabled = state.phase !== 'armed';
  }

  function showStartPanel() {
    hud.panel.innerHTML = startPanelHtml({ best, ludvig: LUDVIG, medals: MEDALS, touch });
    hud.panel.className = 'pb-panel sk-panel start';
    hud.overlay.classList.add('show');
  }

  /* ---- Aim -------------------------------------------------------------- */

  /** World-space direction of the aim ray through the current camera. */
  function aimDir(out) {
    raycaster.setFromCamera(ndcV.set(aim.x, aim.y), camera);
    return out.copy(raycaster.ray.direction);
  }

  function resetSwing() {
    swingLog.length = 0;
  }

  /**
   * Angular velocity of the swing (axis × rad/s), from the aim direction
   * ~70 ms ago to now. Measured on the aim, not the finger, so it is the
   * gun's swing whatever the screen size.
   */
  function swingVelocity(now, out) {
    out.set(0, 0, 0);
    if (swingLog.length < 2) return out;
    const head = swingLog[swingLog.length - 1];
    let old = null;
    for (let i = swingLog.length - 2; i >= 0; i--) {
      if (head.t - swingLog[i].t >= 0.07) {
        old = swingLog[i];
        break;
      }
      old = swingLog[i];
    }
    const dt = head.t - old.t;
    if (dt < 0.025 || now - head.t > 0.1) return out;
    const ang = old.dir.angleTo(head.dir);
    if (ang < 1e-5) return out;
    out.crossVectors(old.dir, head.dir).normalize().multiplyScalar(Math.min(MAX_SWING, ang / dt));
    return out;
  }

  /* ---- Flow ------------------------------------------------------------ */

  function startGame() {
    sfx.resume();
    // Nothing from the last round may fire into this one
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    hud.pops.innerHTML = '';
    hideLead();
    Object.assign(state, {
      phase: 'between', serieNo: 1, throwNo: 0, score: 0, streak: 0, bestStreak: 0,
      isGold: false, isDouble: false, gold: null, thrown: 0, passedLudvig: false,
      card: SERIES.map(() => new Array(8).fill(null)),
      stats: { hits: 0, base: 0, bonus: 0, pairs: 0, clean: 0, goldPts: 0 },
      hintsShown: {}, missKinds: {}
    });
    clays.forEach((c) => {
      c.active = false;
      c.mesh.visible = false;
    });
    pending.length = 0;
    countUp = null;
    hud.score.textContent = '0';
    renderGhost();
    renderStreak();
    hud.overlay.classList.remove('show');
    // Into the gun: the camera flies from the vista to the shoulder
    camTarget = 1;
    camSpeed = 0.62;
    later(startSerie, 1500);
  }

  function startSerie() {
    state.throwNo = 0;
    state.isGold = false;
    renderSerie();
    renderCard();
    callout(`SERIE ${state.serieNo}`);
    setPhase(serie().brief, 3200);
    armPull();
  }

  function armPull() {
    state.phase = 'armed';
    // Break the gun, eject, two fresh shells, snap shut
    later(() => sfx.reload(), 80);
    state.shells = state.isGold ? 1 : 2;
    renderShells();
    renderPull();
    if (state.firstPull) hint('pull', touch ? 'Tryck PULL — eller tryck på fältet och håll kvar fingret' : 'Klicka eller tryck mellanslag för PULL');
  }

  function callPull() {
    if (state.phase !== 'armed' || helpOpen) return;
    state.phase = 'delay';
    state.delayT = 0.2 + rand() * 1.6; // the Olympic skeet random delay
    sfx.pull();
    renderPull();
  }

  /** Visible half-width (m) of the FIRST-PERSON frame at a given depth. */
  function halfWidthAt(depth) {
    return Math.tan(THREE.MathUtils.degToRad(fpFov() / 2)) * view.aspect * depth;
  }

  function launchOne(clay, side, box) {
    const s = serie();
    clay.active = true;
    clay.gold = state.isGold;
    clay.box = box;
    clay.seen = false;
    clay.offT = 0;
    clay.shotAt = false;
    clay.incomer = false;
    const m = clay.mesh;
    m.visible = true;
    m.scale.setScalar(state.isGold ? 0.62 : 1);
    m.rotation.set(0, 0, 0);
    m.material.color.copy(state.isGold ? GOLD : ORANGE);
    m.material.emissive.set(state.isGold ? 0x5a3c00 : 0x6b2400);

    // A first-timer's first three birds come a little gentler while they find the swing
    const rookie = !best.score && state.serieNo === 1 && state.throwNo < 3 ? 0.82 : 1;
    const speed = s.speed * rookie * (state.isGold ? 1.5 : 1) * (0.92 + rand() * 0.16);
    if (side === 0 && !state.isGold && s.incomers && s.incomers.includes(state.throwNo)) {
      // Incomer from the tower: aimed to pass a few metres up and to one
      // side of the station, so it grows out of the treeline toward you
      // and climbs out of the top of the frame if you let it.
      clay.incomer = true;
      m.position.copy(TOWER_TOP);
      // Fast and flat enough to stay in the frame until it is close
      const T = 2.2 / speed;
      tmpV.set((rand() - 0.5) * 7, 4 + rand() * 1.5, 6);
      clay.vel.set((tmpV.x - m.position.x) / T, (tmpV.y - m.position.y) / T + 0.5 * GRAVITY * T, (tmpV.z - m.position.z) / T);
      for (let i = 0; i < 6; i++) {
        soft.spawn({
          pos: m.position, vel: tmpV2.set((rand() - 0.5) * 2, rand(), 1 + rand() * 2),
          life: 1 + rand(), size: 0.4, size1: 1.4, color: new THREE.Color(0x9a8a70), alpha: 0.25, drag: 1.6, wind: 0.6
        });
      }
    } else if (s.crossers && (side !== 0 || rand() < 0.6)) {
      // Crosser from the field edge. Launch it from just outside the
      // frame and scale its pace to the frame, so a phone in portrait
      // sees the same crossing a desktop does — not a clay that lands
      // before it ever comes into view.
      const dir = side !== 0 ? side : rand() < 0.5 ? -1 : 1;
      const depth = 30 + rand() * 12;
      const halfW = halfWidthAt(depth);
      m.position.set(-dir * (halfW + 1.5), 2 + rand() * 3, -depth);
      clay.vel.set(dir * halfW * (0.42 + rand() * 0.14) * speed, (7.5 + rand() * 2.5) * speed, -2 * speed);
    } else {
      // Away and rising, straight from the trap house
      const k = Math.min(1, Math.max(0.45, halfWidthAt(30) / 22));
      m.position.set(0, 1.1, -16.3);
      clay.vel.set((rand() - 0.5) * 9 * speed * k, (9 + rand() * 3) * speed, (-11 - rand() * 4) * speed);
      // Dust kicked out of the trap house slot
      for (let i = 0; i < 8; i++) {
        soft.spawn({
          pos: tmpV.set((rand() - 0.5) * 1.6, 0.8, -15.6),
          vel: tmpV2.set((rand() - 0.5) * 1.5, 0.4 + rand(), 1 + rand()),
          life: 1.2 + rand(), size: 0.4, size1: 1.3, color: new THREE.Color(0x7d6a4c),
          alpha: 0.28, drag: 1.6, wind: 0.6
        });
      }
    }
    clay.spin = 5 + rand() * 4;
  }

  function launch() {
    const s = serie();
    state.isDouble = !state.isGold && state.throwNo >= s.singles;
    state.phase = 'flight';
    state.resolveT = 0;
    renderPull();
    sfx.thwock();
    const box = state.isDouble ? s.singles + (state.throwNo - s.singles) * 2 : state.throwNo;
    launchOne(clays[0], state.isDouble ? -1 : 0, box);
    if (state.isDouble) launchOne(clays[1], 1, box + 1);
    else clays[1].active = false;
    if (state.firstPull) {
      state.firstPull = false;
      hint('aim', touch ? 'Följ duvan med siktet ovanför fingret — släpp för att skjuta' : 'Följ duvan med musen — klicka för att skjuta');
    } else if (clays[0].incomer) {
      hint('incomer', 'Från tornet! Den kommer rakt mot dig — skjut innan den drar förbi över huvudet.');
    }
  }

  function airborne() {
    return clays.filter((c) => c.active);
  }

  function markBox(clay, hit) {
    if (clay.gold) state.gold = hit;
    else state.card[state.serieNo - 1][clay.box] = hit;
    renderCard();
  }

  /** Scoring for one broken bird — shared by real hits and the test sim. */
  function scoreBird(gold) {
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.stats.hits++;
    const base = gold ? 500 : 100;
    const bonus = Math.min(12, state.streak - 1) * 25;
    state.stats.base += gold ? 0 : base;
    state.stats.bonus += bonus;
    if (gold) state.stats.goldPts = base;
    state.score += base + bonus;
    return base + bonus;
  }

  function checkLudvig() {
    if (state.passedLudvig || state.score <= LUDVIG) return;
    state.passedLudvig = true;
    later(() => {
      toast('Förbi Ludvigs 3 400!', true);
      sfx.ludvig();
    }, 450);
  }

  /**
   * A broken bird. `q` is where in the pattern it was (0 = dead centre,
   * 1 = the fringe): a centre hit turns a clay to a puff of smoke, a
   * fringe hit only chips it into a few big pieces. Same points either way.
   */
  function smash(clay, q = 0.5) {
    clay.active = false;
    const m = clay.mesh;
    m.visible = false;
    const at = m.position.clone();
    const pts = scoreBird(clay.gold);
    markBox(clay, true);
    renderScore();
    renderStreak();
    const word = q < 0.32 ? 'RÖKBOLL' : 'KROSS';
    if (q < 0.32 && !clay.gold) state.stats.smoke = (state.stats.smoke || 0) + 1;
    popScore(clay.gold ? `GULDDUVAN +${fmt(pts)}` : `${word} +${fmt(pts)}`, at, clay.gold ? 'gold' : q < 0.32 ? 'smoke' : '');
    sfx.shatter(clay.gold);
    sfx.streak(state.streak);
    // Hit-stop: a few frames of near-freeze sell the impact more than any
    // particle count. Longer for the gold.
    hitStopT = Math.max(hitStopT, clay.gold ? 0.12 : 0.065);
    shakeP = Math.max(shakeP, clay.gold ? 1.2 : 0.55);
    if (navigator.vibrate) navigator.vibrate(clay.gold ? 60 : 25);
    breakFx(clay, at, q);
    if (clay.gold) {
      flashScreen('gold');
      callout('GULDDUVAN!', 'gold');
      gang.react('gold', 4);
      later(() => sfx.cheer(1.4), 250);
    }

    if (state.streak > 0 && state.streak % 5 === 0) {
      later(() => {
        callout(`${state.streak} I RAD!`, 'streak');
        sfx.milestone(state.streak);
        gang.react('clap', 2.4);
        flashScreen('streak');
      }, 260);
    }

    if (state.isDouble && airborne().length === 0) {
      const row = state.card[state.serieNo - 1];
      const a = clay.box - ((clay.box - serie().singles) % 2);
      if (row[a] === true && row[a + 1] === true) {
        state.score += 200;
        state.stats.pairs++;
        renderScore();
        later(() => popScore('DUBBLÉ +200', at, 'pair'), 380);
        later(() => sfx.cheer(0.7), 300);
      }
    }
    checkLudvig();
  }

  /** Dust, chips, the 3D shards and a hot core — the money shot. */
  function breakFx(clay, at, q = 0.5) {
    const color = clay.gold ? GOLD : ORANGE;
    const smoke = !clay.gold && q < 0.32;
    const chip = !clay.gold && q > 0.72;
    if (chip) {
      // A fringe hit: two or three big pieces carry on along the line
      shards.burst(at, clay.vel, color, 3, fxRand, 0.45, 2.1, 0.85);
      shards.burst(at, clay.vel, color, 7, fxRand, 0.8);
    } else {
      shards.burst(at, clay.vel, color, clay.gold ? 18 : smoke ? 9 : 15, fxRand, clay.gold ? 1.3 : smoke ? 1.2 : 1, smoke ? 0.6 : 1);
    }
    // The cloud a clay leaves: a dense orange core that billows and drifts
    const dust = clay.gold ? new THREE.Color(0xd08a1c) : new THREE.Color(0xe0682a);
    const puffs = smoke ? 52 : chip ? 16 : 34;
    for (let i = 0; i < puffs; i++) {
      const a = fxRand() * Math.PI * 2;
      const e = (fxRand() - 0.35) * 1.4;
      const sp = 1 + fxRand() * 5;
      soft.spawn({
        pos: at,
        vel: tmpV.set(Math.cos(a) * sp, e * sp * 0.7, Math.sin(a) * sp).addScaledVector(clay.vel, 0.3),
        life: 1.4 + fxRand() * 1.6, size: 0.6, size1: (2.4 + fxRand() * 2.2) * (smoke ? 1.35 : 1),
        color: dust.clone().offsetHSL((fxRand() - 0.5) * 0.03, -0.05, (fxRand() - 0.6) * 0.2),
        alpha: 0.78, drag: 2.2, grav: -0.12, wind: 1
      });
    }
    // Black pitch dust from the underside, and grit that falls
    for (let i = 0; i < 12; i++) {
      soft.spawn({
        pos: at,
        vel: tmpV.set(fxRand() - 0.5, fxRand() - 0.6, fxRand() - 0.5).multiplyScalar(5).addScaledVector(clay.vel, 0.3),
        life: 1 + fxRand(), size: 0.4, size1: 1.6, color: new THREE.Color(0x3a2a20), alpha: 0.5, drag: 2, wind: 1
      });
    }
    for (let i = 0; i < 30; i++) {
      soft.spawn({
        pos: at,
        vel: tmpV.set(fxRand() - 0.5, fxRand() * 0.8, fxRand() - 0.5).multiplyScalar(16).addScaledVector(clay.vel, 0.5),
        life: 0.9 + fxRand() * 0.7, size: 0.14, size1: 0.1, color: new THREE.Color(0x4a2814),
        alpha: 0.95, drag: 1.1, grav: 9.8
      });
    }
    // The hot core — a bloom-bright pop for a frame or two
    bright.spawn({ pos: at, life: 0.14, size: 1.8, size1: 3.4, color: new THREE.Color(2.2, 1.3, 0.6), alpha: 1 });
    if (clay.gold) {
      flare.t = 1;
      flare.pos.copy(at);
      for (let i = 0; i < 80; i++) {
        bright.spawn({
          pos: at,
          vel: tmpV.set(fxRand() - 0.5, fxRand() - 0.2, fxRand() - 0.5).normalize().multiplyScalar(2 + fxRand() * 10),
          life: 1.8 + fxRand() * 1.8, size: 0.3, size1: 0.1,
          color: new THREE.Color(2.4, 1.7, 0.6), alpha: 1, drag: 1.3, grav: 1.4, wind: 0.6
        });
      }
    }
  }

  function escape(clay) {
    clay.active = false;
    clay.mesh.visible = false;
    markBox(clay, false);
    if (clay.gold) toast('Guldduvan flög vidare …');
    else if (!clay.shotAt) toast('Den kom undan');
    if (state.streak >= 2) later(() => toast('Streaken bruten'), 600);
    state.streak = 0;
    renderStreak();
  }

  /** A shot that broke nothing: reset the streak and teach the lead. */
  function missShot(rec) {
    sfx.miss();
    // Inside about twice the pattern's reach: tell them it was close
    if (rec && rec.ang < rec.r * 1.9) {
      sfx.nearMiss();
      popScore('NÄRA!', rec.at, 'near');
    }
    if (state.streak >= 2) toast('Bom — streaken bruten');
    state.streak = 0;
    renderStreak();
    if (rec) showLead(rec);
  }

  function endSeries() {
    const row = state.card[state.serieNo - 1];
    const hits = row.filter((v) => v === true).length;
    const clean = hits === row.length;
    if (clean) {
      state.score += 500;
      state.stats.clean++;
      renderScore();
      checkLudvig();
      sfx.cheer(1);
    }
    reactToSeries(hits, row.length);
    hud.serieCard.innerHTML = `
      <small>Serie ${state.serieNo} klar</small>
      <b>${hits} <span>av ${row.length}</span></b>
      ${cardHtml([row], null, { singles: [serie().singles], noGold: true })}
      ${clean ? '<em>Felfri serie +500</em>' : `<em class="dim">${hits >= 6 ? 'Fint skjutet' : 'Nästa serie, ny chans'}</em>`}`;
    retrigger(hud.serieCard, 'show');
    later(() => hud.serieCard.classList.remove('show'), 2400);
  }

  /**
   * The reaction shot: between series the camera turns round to the gang,
   * who answer the series — a cheer for a clean one, applause for a good
   * one, Ludvig's folded arms for a poor one. Skipped with reduced motion.
   */
  function reactToSeries(hits, of) {
    if (hits === of) gang.react('cheer', 2.8, { [LUDVIG_NAME]: 'clap' });
    else if (hits >= of - 2) gang.react('clap', 2.6);
    else if (hits >= of / 2) gang.react('clap', 2.2, { [LUDVIG_NAME]: 'idle', 'Henrik Lundqvist': 'idle' });
    else gang.react('idle', 2.6, { [LUDVIG_NAME]: 'crossed' });
    if (reduceMotion) return;
    later(() => {
      reaction.target = 1;
    }, 250);
    later(() => {
      reaction.target = 0;
    }, 2350);
  }

  function resolveThrow() {
    // Called when no clays remain airborne (all smashed or escaped)
    state.thrown += state.isDouble ? 2 : 1;
    renderGhost();
    if (state.isGold) {
      gameOver();
      return;
    }
    state.throwNo++;
    const s = serie();
    if (state.throwNo >= s.singles + s.doubles) {
      state.phase = 'between';
      renderPull();
      endSeries();
      // A little longer than the reaction shot (0.25 s in, 2.1 s out)
      const gap = reduceMotion ? 2700 : 3300;
      if (state.serieNo >= 3) {
        later(startGold, gap);
      } else {
        later(() => {
          state.serieNo++;
          startSerie();
        }, gap);
      }
      return;
    }
    armPull();
  }

  function startGold() {
    state.isGold = true;
    renderSerie();
    renderCard();
    callout('GULDDUVAN', 'gold');
    setPhase('Liten, snabb, 500 poäng. En enda patron.', 3200);
    sfx.goldFanfare();
    later(armPull, 900);
  }

  /* ---- Shooting -------------------------------------------------------- */

  const swingTmp = new THREE.Vector3();
  const swingAxis = new THREE.Vector3();

  function predictClay(clay, t, out) {
    out.copy(clay.mesh.position).addScaledVector(clay.vel, t);
    out.y -= 0.5 * GRAVITY * t * t;
    return out;
  }

  function fire() {
    if (state.phase !== 'flight' || state.shells <= 0 || helpOpen) return;
    state.shells--;
    renderShells();
    sfx.boom();
    recoil = 1;
    kickV += reduceMotion ? 0.12 : 0.6;
    shakeP = Math.max(shakeP, 0.35);
    gun.flashMat.opacity = 1;
    gun.starMat.opacity = 1;
    gun.starMat.rotation = rand() * Math.PI;
    flashK = 1;
    if (navigator.vibrate) navigator.vibrate(18);

    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = aimDir(new THREE.Vector3());
    const swing = swingVelocity(performance.now() / 1000, swingTmp);
    const rate = swing.length();
    if (rate > 0) swingAxis.copy(swing).divideScalar(rate);

    // Evaluate every airborne clay at the moment the pattern reaches it
    const records = airborne().map((clay) => {
      clay.shotAt = true;
      const at = new THREE.Vector3();
      let tof = clay.mesh.position.distanceTo(origin) / SHOT_SPEED;
      for (let k = 0; k < 2; k++) tof = predictClay(clay, tof, at).distanceTo(origin) / SHOT_SPEED;
      const shotDir = dir.clone();
      if (rate > 0) shotDir.applyAxisAngle(swingAxis, rate * tof);
      const dist = at.distanceTo(origin);
      const ang = shotDir.angleTo(tmpV.copy(at).sub(origin));
      const r = (clay.gold ? PATTERN_GOLD : PATTERN) + Math.atan((CLAY_R * clay.mesh.scale.x) / dist);
      return { clay, at, tof, shotDir, dist, ang, r, origin, hit: ang < r };
    });
    const nearest = records.slice().sort((a, b) => a.ang / a.r - b.ang / b.r)[0];
    const shotDir = nearest ? nearest.shotDir : dir;
    const tof = nearest ? nearest.tof : 0.09;
    const muzzle = gun.muzzle.getWorldPosition(new THREE.Vector3());
    shot.fire(muzzle, shotDir, PATTERN * 0.55, nearest ? nearest.dist : 40, fxRand);
    pending.push({ t: tof, records });

    // Smoke from the muzzle, drifting off on the breeze
    for (let i = 0; i < 9; i++) {
      soft.spawn({
        pos: muzzle,
        vel: tmpV.copy(shotDir).multiplyScalar(2 + fxRand() * 5).add(tmpV2.set(fxRand() - 0.5, fxRand() * 0.6, fxRand() - 0.5)),
        life: 1.4 + fxRand() * 1.4, size: 0.12, size1: 0.9 + fxRand() * 0.8,
        color: new THREE.Color(0xd9d4ca), alpha: 0.18, drag: 2.6, grav: -0.25, wind: 1
      });
    }

    // The golden dove gets bullet time: the world slows while the shot flies
    if (records.some((r) => r.clay.gold)) {
      slowT = 1.25;
      sfx.slowmo();
      flashScreen('slow');
    }
  }

  /** Shots land once their time of flight has elapsed (in game time). */
  function resolveShots(dt) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      p.t -= dt;
      if (p.t > 0) continue;
      pending.splice(i, 1);
      const live = p.records.filter((r) => r.clay.active);
      const hits = live.filter((r) => r.hit);
      if (hits.length) {
        hits.forEach((r) => smash(r.clay, r.ang / r.r));
      } else if (live.length) {
        missShot(live.slice().sort((a, b) => a.ang / a.r - b.ang / b.r)[0]);
      }
      // (a shot into an empty sky, or after the bird already broke, costs nothing)
    }
  }

  /* ---- Lead feedback ---------------------------------------------------- */

  /**
   * Where the pattern went vs where the bird was when it got there, drawn
   * in the HUD at the bird's range: a dashed ring of pellet dots, the
   * ghost of the clay, a line between, and a word a coach would use.
   */
  function showLead(rec) {
    lead.center.copy(rec.origin).addScaledVector(rec.shotDir, rec.dist);
    lead.clay.copy(rec.at);
    lead.radius = Math.tan(rec.clay.gold ? PATTERN_GOLD : PATTERN) * rec.dist;
    lead.t = 1.9;
    const side = new THREE.Vector3().crossVectors(rec.shotDir, THREE.Object3D.DEFAULT_UP).normalize();
    const up = new THREE.Vector3().crossVectors(side, rec.shotDir).normalize();
    lead.dots = [];
    let svg = '';
    for (let i = 0; i < 26; i++) {
      const r = Math.min(1.25, Math.sqrt(-2 * Math.log(Math.max(1e-6, fxRand()))) * 0.5) * lead.radius;
      const a = fxRand() * Math.PI * 2;
      lead.dots.push(lead.center.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r));
      svg += '<circle r="1.8"></circle>';
    }
    hud.leadDots.innerHTML = svg;

    // Classify against the bird's own direction of travel ON SCREEN
    const sc = screenOf(rec.at);
    const sp = screenOf(lead.center);
    const vel = predictClay(rec.clay, rec.tof + 0.15, tmpV2);
    const sv = screenOf(vel);
    let vx = sv.x - sc.x;
    let vy = sv.y - sc.y;
    const vl = Math.hypot(vx, vy) || 1;
    vx /= vl;
    vy /= vl;
    const dx = sp.x - sc.x;
    const dy = sp.y - sc.y;
    const along = dx * vx + dy * vy;
    const across = Math.abs(-dx * vy + dy * vx);
    let kind;
    if (Math.abs(along) >= across) kind = along < 0 ? 'BAKOM' : 'FÖRE';
    else kind = dy < 0 ? 'ÖVER' : 'UNDER';
    const miss = Math.max(0, lead.center.distanceTo(rec.at) - lead.radius * 0.5);
    const meters = miss.toLocaleString('sv-SE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    hud.leadLabel.innerHTML = `<b>${kind}</b> ${meters} m`;
    hud.lead.classList.add('show');
    hud.leadLabel.classList.add('show');
    updateLead();

    state.missKinds[kind] = (state.missKinds[kind] || 0) + 1;
    if (state.missKinds[kind] >= 2) {
      const tips = {
        BAKOM: 'Bakom igen — duvan hinner flytta sig medan haglen flyger. Håll svingen igång när du skjuter.',
        FÖRE: 'Lite för långt före — lugnare sving, släpp när kornet ligger på duvan.',
        ÖVER: 'Över — duvan faller när den tappar fart. Sikta på den, inte på banan den hade.',
        UNDER: 'Under — en stigande duva drar ifrån uppåt. Följ med i stigningen.'
      };
      hint(`lead-${kind}`, tips[kind]);
    }
  }

  function updateLead() {
    if (lead.t <= 0) return;
    const c = screenOf(lead.center);
    const k = screenOf(lead.clay);
    const edge = screenOf(tmpV.copy(lead.center).addScaledVector(camera.up, lead.radius));
    const r = Math.max(6, Math.hypot(edge.x - c.x, edge.y - c.y));
    hud.leadRing.setAttribute('cx', c.x);
    hud.leadRing.setAttribute('cy', c.y);
    hud.leadRing.setAttribute('r', r);
    hud.leadClay.setAttribute('cx', k.x);
    hud.leadClay.setAttribute('cy', k.y);
    hud.leadClay.setAttribute('r', Math.max(5, r * 0.32));
    hud.leadLine.setAttribute('x1', c.x);
    hud.leadLine.setAttribute('y1', c.y);
    hud.leadLine.setAttribute('x2', k.x);
    hud.leadLine.setAttribute('y2', k.y);
    const dots = hud.leadDots.children;
    lead.dots.forEach((d, i) => {
      const s = screenOf(d);
      dots[i].setAttribute('cx', s.x);
      dots[i].setAttribute('cy', s.y);
    });
    hud.leadLabel.style.left = `${Math.min(view.w - 80, Math.max(80, k.x))}px`;
    hud.leadLabel.style.top = `${Math.max(70, Math.min(k.y, c.y) - r - 26)}px`;
  }

  function hideLead() {
    lead.t = 0;
    hud.lead.classList.remove('show');
    hud.leadLabel.classList.remove('show');
  }

  /* ---- Input ----------------------------------------------------------- */

  function pointerNdc(e) {
    const rect = canvasHost.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    };
  }

  const UI = '.pb-overlay, .pb-mute, .pb-info, .pb-help, .sk-pull';

  /**
   * On a touch screen the sight rides a thumb's width ABOVE the finger, so
   * the finger never covers the bird it is tracking (the classic mistake
   * of phone shooters: aim under the fingertip and you shoot blind). The
   * offset eases off near the top edge so the whole sky stays reachable.
   */
  function touchOffset(fingerY) {
    const px = Math.min(92, view.h * 0.12);
    // fingerY is NDC (+1 = top). Within the top band, shrink the lift.
    const topRoom = ((1 - fingerY) / 2) * view.h;
    return (Math.min(px, Math.max(0, topRoom - 8)) * 2) / view.h;
  }

  function setAimFrom(e, p) {
    aim.x = p.x;
    aim.y = p.y;
    if (e.pointerType !== 'mouse') {
      aim.y = Math.min(0.99, p.y + touchOffset(p.y));
      finger.x = p.x;
      finger.y = p.y;
    }
  }

  function onPointerDown(e) {
    sfx.resume();
    if (helpOpen || e.target.closest(UI) || camBlend < 0.9) return;
    const p = pointerNdc(e);
    // A touch teleports the aim; its jump must not count as swing speed
    if (e.pointerType !== 'mouse' || Math.hypot(p.x - aim.x, p.y - aim.y) > 0.05) resetSwing();
    finger.touch = e.pointerType !== 'mouse';
    setAimFrom(e, p);
    tracking = true;
    // Tap-to-pull: press, keep the finger down, track, release to fire —
    // the whole call-and-shoot in one gesture.
    if (state.phase === 'armed') callPull();
  }

  function onPointerMove(e) {
    if (!tracking && e.pointerType !== 'mouse') return;
    setAimFrom(e, pointerNdc(e));
  }

  function onPointerUp(e) {
    if (!tracking) return;
    tracking = false;
    if (e.target.closest && e.target.closest(UI)) return;
    fire();
  }

  function onPointerCancel() {
    tracking = false;
  }

  // Esc closes the help card, not the whole game: caught on the way down,
  // before the site's own Esc-closes-the-stage handler sees it
  function onKeyCapture(e) {
    if (helpOpen && e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      setHelp(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === '?') {
      setHelp(!helpOpen);
      return;
    }
    if (helpOpen) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (hud.overlay.classList.contains('show') && (state.phase === 'intro' || state.phase === 'over')) {
        // First press during the count-up just lands the total; the next one restarts
        if (countUp && !countUp.done) countUp.t = countUp.dur;
        else startGame();
      } else if (state.phase === 'armed') {
        callPull();
      }
    }
  }

  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
    if (open) tracking = false;
  }

  function onOverlayClick(e) {
    const btn = e.target.closest('[data-act="start"]');
    if (btn) startGame();
  }

  function onMute() {
    sfx.muted = !sfx.muted;
    hud.mute.classList.toggle('off', sfx.muted);
  }

  function onInfo() {
    setHelp(!helpOpen);
  }

  function onHelpClose() {
    setHelp(false);
  }

  canvasHost.addEventListener('pointerdown', onPointerDown);
  canvasHost.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('keydown', onKeyCapture, true);
  window.addEventListener('keydown', onKeyDown);
  hud.overlay.addEventListener('click', onOverlayClick);
  hud.pull.addEventListener('click', callPull);
  hud.info.addEventListener('click', onInfo);
  hud.helpClose.addEventListener('click', onHelpClose);
  hud.mute.addEventListener('click', onMute);

  /* ---- Game over ------------------------------------------------------- */

  function gameOver() {
    state.phase = 'over';
    renderPull();
    const tier = medalTier(state.score);
    const isRecord = state.score > best.score;
    if (isRecord || tier > best.tier || state.stats.hits > best.hits) {
      best = {
        score: Math.max(best.score, state.score),
        hits: Math.max(best.hits || 0, state.stats.hits),
        tier: Math.max(best.tier || 0, tier)
      };
      writeBest(best);
    }
    const beat = state.score > LUDVIG;
    const titles = [
      'Rundan är slut',
      'Brons på Arnäsvall',
      'Silver — nära nu!',
      'Guld — du slog mästaren!'
    ];
    let title = titles[tier];
    if (state.stats.hits === 25) title = '25 rakt. Perfekt runda!';
    const result = {
      tier, title, score: state.score, record: best.score, isRecord,
      hits: state.stats.hits, base: state.stats.base, bonus: state.stats.bonus,
      pairs: state.stats.pairs, clean: state.stats.clean,
      gold: state.gold === true, goldPts: state.stats.goldPts, goldHit: state.gold,
      bestStreak: state.bestStreak, card: state.card, ludvig: LUDVIG, smoke: state.stats.smoke || 0
    };
    // Let the last shards fall, then pull back out to the gang
    later(() => {
      camTarget = 0;
      camSpeed = 0.45;
      // Beat him and Ludvig applauds the new champion while the rest go
      // wild; fall short and he leans back with his arms folded
      if (beat) gang.react('cheer', 7, { [LUDVIG_NAME]: 'clap' });
      else if (tier >= 1) gang.react(tier >= 2 ? 'cheer' : 'clap', 5, { [LUDVIG_NAME]: 'crossed' });
      else gang.react('idle', 6, { [LUDVIG_NAME]: 'crossed', 'Henrik Lundqvist': 'clap' });
      if (tier >= 1) later(() => sfx.cheer(tier >= 3 ? 1.6 : 1), 600);
    }, 1300);
    later(() => {
      hud.panel.innerHTML = endPanelHtml(result);
      hud.panel.className = `pb-panel sk-panel end tier-${tier}`;
      hud.overlay.classList.add('show');
      countUp = { el: hud.panel.querySelector('#sk-total'), from: 0, to: state.score, t: 0, dur: 1.3, done: false };
      sfx.fanfare(tier);
    }, 2500);
  }

  /* ---- Sizing ---------------------------------------------------------- */

  /**
   * First-person FOV per aspect. Aim for a ~72° horizontal view (a wide
   * landscape vista on desktop), but never squeeze the vertical below 46°
   * on ultra-wide or stretch it past 70° on a tall phone.
   */
  function fpFov() {
    const h = THREE.MathUtils.degToRad(72);
    const v = 2 * Math.atan(Math.tan(h / 2) / view.aspect);
    return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(v), 46, 70);
  }

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    view.w = Math.max(1, Math.floor(rect.width));
    view.h = Math.max(1, Math.floor(rect.height));
    view.aspect = view.w / view.h;
    renderer.setPixelRatio(quality.dpr);
    renderer.setSize(view.w, view.h, false);
    if (composer) {
      composer.setPixelRatio(quality.dpr);
      composer.setSize(view.w, view.h);
    }
    hud.lead.setAttribute('viewBox', `0 0 ${view.w} ${view.h}`);
    camera.aspect = view.aspect;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Camera rig ------------------------------------------------------ */

  const vista = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 50, ox: 0, oy: 0 };
  const fp = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 50 };
  const reactPose = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 40 };
  const GANG_CENTRE = new THREE.Vector3(0.5, 0.98, 2.65);
  const REACT_DIR = new THREE.Vector3(-0.08, 0.2, -1).normalize();
  const lookM = new THREE.Matrix4();
  const lookAt = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const applied = { fov: 0, ox: -1, oy: -1, w: 0, h: 0 };
  let debugCam = null;

  /**
   * The establishing shot: behind the gang, up and to the right — the whole
   * row on their fika chairs, Henrik and the trophy at the end, the
   * station, the trap house, the barn and the low sun in one frame. On
   * desktop the panel sits right, so the scene is shifted left
   * with a view offset; on a phone the panel is a bottom sheet, so the
   * horizon is lifted into the top of the frame instead.
   */
  function vistaPose(t) {
    const portrait = view.aspect < 0.9;
    const drift = reduceMotion ? 0 : 1;
    if (portrait) {
      // Narrow frame: look toward the sun so barn, flag and sun share the
      // top of the screen, with the gang's heads along the sheet's edge
      vista.pos.set(2.6 + Math.sin(t * 0.07) * 0.3 * drift, 2.5, 10.5 + Math.cos(t * 0.05) * 0.3 * drift);
      lookAt.set(-9, 1.2, -30);
      vista.fov = 60;
      vista.ox = 0;
      vista.oy = view.h * 0.3;
    } else {
      vista.pos.set(2.0 + Math.sin(t * 0.07) * 0.4 * drift, 2.65 + Math.sin(t * 0.11) * 0.05 * drift,
        9.8 + Math.cos(t * 0.05) * 0.25 * drift);
      lookAt.set(-5.5, 1.15, -30);
      vista.fov = 44;
      vista.ox = Math.min(view.w * 0.16, 240);
      vista.oy = 0;
    }
    lookM.lookAt(vista.pos, lookAt, THREE.Object3D.DEFAULT_UP);
    vista.q.setFromRotationMatrix(lookM);
  }

  function fpPose(t, dt) {
    // The head follows the gun a little — a few degrees toward the aim —
    // so swinging feels like swinging, not like moving a cursor.
    const k = reduceMotion ? 0 : 1;
    const ky = Math.min(1, dt * 3);
    follow.yaw += (-aim.x * 0.045 * k - follow.yaw) * ky;
    follow.pitch += (aim.y * 0.022 * k - follow.pitch) * ky;
    // Recoil kick: a damped spring on pitch
    kickV += (-kick * 90 - kickV * 14) * dt;
    kick += kickV * dt;
    euler.set(0.035 + follow.pitch + kick * 0.05, follow.yaw, Math.sin(t * 0.4) * 0.004);
    fp.q.setFromEuler(euler);
    fp.pos.set(0, 1.7 + Math.sin(t * 1.1) * 0.01, 0);
    fp.fov = fpFov();
  }

  /**
   * The reaction shot: from out on the field, looking back over the
   * station at the gang, far enough that the whole row fits the frame's
   * width on any aspect (a phone in portrait stands further back).
   */
  function reactionPose(t) {
    const portrait = view.aspect < 0.9;
    reactPose.fov = portrait ? 52 : 38;
    const halfH = Math.tan(THREE.MathUtils.degToRad(reactPose.fov / 2)) * view.aspect;
    const dist = THREE.MathUtils.clamp(2.9 / halfH, 3.8, 8.5);
    reactPose.pos.copy(GANG_CENTRE).addScaledVector(REACT_DIR, dist);
    reactPose.pos.x += Math.sin(t * 0.3) * 0.06;
    lookM.lookAt(reactPose.pos, GANG_CENTRE, THREE.Object3D.DEFAULT_UP);
    reactPose.q.setFromRotationMatrix(lookM);
  }

  function applyCamera(t, dt) {
    vistaPose(t);
    fpPose(t, dt);
    if (camBlend !== camTarget) {
      const step = dt * camSpeed;
      camBlend = camTarget > camBlend ? Math.min(camTarget, camBlend + step) : Math.max(camTarget, camBlend - step);
    }
    if (reaction.k !== reaction.target) {
      const step = dt * 1.6;
      reaction.k = reaction.target > reaction.k ? Math.min(1, reaction.k + step) : Math.max(0, reaction.k - step);
    }
    const e = ease(camBlend);
    camera.position.lerpVectors(vista.pos, fp.pos, e);
    // Arc over the gang's heads on the way in and out
    camera.position.y += Math.sin(Math.PI * e) * 1.3;
    camera.quaternion.slerpQuaternions(vista.q, fp.q, e);
    let fov = vista.fov + (fp.fov - vista.fov) * e;
    const r = ease(reaction.k);
    if (r > 0) {
      reactionPose(t);
      camera.position.lerp(reactPose.pos, r);
      // A little lift mid-turn, so the swing reads as a move, not a spin
      camera.position.y += Math.sin(Math.PI * r) * 0.5;
      camera.quaternion.slerp(reactPose.q, r);
      fov += (reactPose.fov - fov) * r;
    }
    // The gun comes up as the camera settles at the shoulder and goes down
    // for the reaction shot
    raise = smooth(0.55, 1, camBlend) * (1 - smooth(0, 0.45, reaction.k));
    // Near plane: close enough for the gun only while it is up; otherwise
    // pushed out, which buys the depth buffer precision for the far field
    const near = raise > 0.01 ? 0.1 : 0.3;
    if (camera.near !== near) {
      camera.near = near;
      applied.fov = -1;
    }
    if (shakeP > 0.001 && !reduceMotion) {
      camera.position.x += (rand() - 0.5) * shakeP * 0.03;
      camera.position.y += (rand() - 0.5) * shakeP * 0.03;
    }
    if (debugCam) {
      // Test hook only: a fixed close-up camera
      camera.position.fromArray(debugCam.pos);
      lookM.lookAt(camera.position, lookAt.fromArray(debugCam.look), THREE.Object3D.DEFAULT_UP);
      camera.quaternion.setFromRotationMatrix(lookM);
      ({ fov } = debugCam);
    }
    const ox = Math.round(vista.ox * (1 - e) * 4) / 4;
    const oy = Math.round(vista.oy * (1 - e) * 4) / 4;
    if (fov !== applied.fov || ox !== applied.ox || oy !== applied.oy || view.w !== applied.w || view.h !== applied.h) {
      Object.assign(applied, { fov, ox, oy, w: view.w, h: view.h });
      camera.fov = fov;
      if (ox > 0 || oy > 0) camera.setViewOffset(view.w, view.h, ox, oy, view.w, view.h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    // The gun, the aim ray and the HUD projections all read this frame's pose
    camera.updateMatrixWorld();
  }

  /* ---- Loop ------------------------------------------------------------ */

  let raf = 0;
  let last = performance.now();
  let running = true;
  const gunTarget = new THREE.Vector3();
  const gunBase = new THREE.Vector3();
  const pointScale = () => (renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));

  function updateTimeScale(realDt) {
    let target = 1;
    if (slowT > 0) {
      slowT -= realDt;
      target = 0.2;
    }
    if (helpOpen) target = 0;
    timeScale += (target - timeScale) * Math.min(1, realDt * (target < timeScale ? 16 : 2.4));
    if (hitStopT > 0) {
      hitStopT -= realDt;
      return 0.04;
    }
    return timeScale;
  }

  function updateClays(dt, t) {
    let anyActive = false;
    clays.forEach((clay) => {
      if (!clay.active) return;
      anyActive = true;
      const m = clay.mesh;
      clay.vel.y -= GRAVITY * dt;
      m.position.addScaledVector(clay.vel, dt);
      m.rotation.y += clay.spin * dt;
      m.rotation.z = Math.sin(t * 2) * 0.2;
      // Off the side of a narrow frame for good: let it go, don't make
      // the player wait for a bird they can no longer see
      const s = screenOf(m.position);
      const inFrame = s.z < 1 && s.x > -20 && s.x < view.w + 20 && s.y > -20 && s.y < view.h + 20;
      if (inFrame) {
        clay.seen = true;
        clay.offT = 0;
      } else if (clay.seen) {
        clay.offT += dt;
      }
      if (m.position.y < 0.2 || m.position.z < -140 || m.position.z > 1.5 || clay.offT > 0.6) {
        escape(clay);
        sfx.miss();
      }
    });
    if (!anyActive && pending.length === 0) {
      state.resolveT += dt;
      if (state.resolveT > 0.55) {
        state.resolveT = 0;
        resolveThrow();
      }
    } else {
      state.resolveT = 0;
    }
  }

  function updateGun(realDt) {
    recoil = Math.max(0, recoil - realDt * 5.5);
    gun.flashMat.opacity = Math.max(0, gun.flashMat.opacity - realDt * 16);
    gun.starMat.opacity = Math.max(0, gun.starMat.opacity - realDt * 22);
    flashK = Math.max(0, flashK - realDt * 10);
    gun.setFlash(flashK);
    gun.starSprite.scale.setScalar(0.7 + (1 - gun.starMat.opacity) * 0.6);
    // Placement tracks the frame so the gun sits in the same corner on any aspect
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    gun.group.visible = raise > 0.01;
    // A tall phone frame has a wide vertical view that shrinks the gun to a
    // toothpick in the corner; grow it back about halfway
    gun.group.scale.setScalar(THREE.MathUtils.clamp(0.55 * Math.sqrt(tanV / 0.43), 0.52, 0.7));
    const portrait = view.aspect < 1;
    gunBase.set(0.66 * tanV * view.aspect * (portrait ? 0.62 : 0.6), -0.66 * tanV * (portrait ? 0.86 : 0.98), -0.66);
    gunBase.y -= (1 - raise) * 0.45;
    gun.group.position.copy(gunBase);
    gun.group.position.z += recoil * 0.08;
    // Barrels converge on the aim point 30 m out
    tmpV.set(aim.x, aim.y, 0.5).unproject(camera).sub(camera.position).normalize();
    gunTarget.copy(camera.position).addScaledVector(tmpV, 30);
    gun.group.lookAt(gunTarget);
    gun.group.rotateY(Math.PI); // barrels run along -z; lookAt aims +z
    gun.group.rotateX(-recoil * 0.16); // muzzle flips up
  }

  function updateHud(realDt) {
    const live = camBlend > 0.97 && state.phase !== 'intro' && state.phase !== 'over';
    hud.hud.classList.toggle('live', live);
    hud.hud.classList.toggle('reaction', reaction.k > 0.05);
    canvasHost.classList.toggle('aiming', live && !touch && reaction.k < 0.05);
    hud.cross.style.left = `${(aim.x * 0.5 + 0.5) * 100}%`;
    hud.cross.style.top = `${(-aim.y * 0.5 + 0.5) * 100}%`;
    hud.cross.classList.toggle('show', live && reaction.k < 0.05 && (state.phase === 'flight' || state.phase === 'delay' || !touch));
    hud.cross.classList.toggle('hold', tracking);
    const showFinger = live && tracking && finger.touch && reaction.k < 0.05;
    hud.finger.classList.toggle('show', showFinger);
    if (showFinger) {
      hud.finger.style.left = `${(finger.x * 0.5 + 0.5) * 100}%`;
      hud.finger.style.top = `${(-finger.y * 0.5 + 0.5) * 100}%`;
      hud.finger.style.setProperty('--lift', `${Math.max(0, (aim.y - finger.y) * 0.5 * view.h)}px`);
    }
    // Arrows at the frame edge for a clay that's coming but not yet in view
    let left = null;
    let right = null;
    clays.forEach((c) => {
      if (!c.active || c.seen) return;
      const s = screenOf(c.mesh.position);
      if (s.x < 0) left = s.y;
      else if (s.x > view.w) right = s.y;
    });
    hud.edgeL.classList.toggle('show', live && left !== null);
    hud.edgeR.classList.toggle('show', live && right !== null);
    if (left !== null) hud.edgeL.style.top = `${Math.min(view.h - 60, Math.max(80, left))}px`;
    if (right !== null) hud.edgeR.style.top = `${Math.min(view.h - 60, Math.max(80, right))}px`;
    if (lead.t > 0) {
      lead.t -= realDt;
      if (lead.t <= 0) hideLead();
      else updateLead();
    }
    if (countUp && !countUp.done && countUp.el) {
      countUp.t += realDt;
      const k = Math.min(1, countUp.t / countUp.dur);
      countUp.el.textContent = fmt(countUp.from + (countUp.to - countUp.from) * (1 - (1 - k) ** 3));
      if (k >= 1) countUp.done = true;
    }
  }

  /**
   * The gang is behind the camera for the whole round, so at the gun they
   * are hidden outright — no skinning, no shadow-map draws — and only
   * animate while a shot can see them.
   */
  function updateGang(dt, t) {
    const seen = camBlend < 0.999 || reaction.k > 0.001;
    gang.group.visible = seen;
    if (!seen) return;
    // On the camera's flights they watch the shooter's station; in the
    // reaction shot they look straight at the shooter who turned round to
    // them (the camera); in the vista they get on with their fika
    if (reaction.k > 0.001) gang.lookAt(camera.position);
    else gang.lookAt(camBlend > 0.02 && camBlend < 0.999 ? stationEye : null);
    gang.update(dt, t);
  }

  function updateGlint(t, dt) {
    const g = clays.find((c) => c.active && c.gold);
    if (flare.t > 0) {
      // The golden dove's break: a star that blooms out and fades (in slow motion)
      flare.t = Math.max(0, flare.t - dt * 1.4);
      glint.position.copy(flare.pos);
      glint.scale.setScalar(2 + (1 - flare.t) * 9);
      glintMat.opacity = flare.t;
      glintMat.rotation = t * 0.5;
      return;
    }
    glint.scale.setScalar(1.6);
    glintMat.opacity = g ? 0.75 + Math.sin(t * 22) * 0.25 : 0;
    if (g) {
      glint.position.copy(g.mesh.position);
      glintMat.rotation = t * 1.5;
    }
  }

  /**
   * Adaptive resolution: if frames run long for a while, shed bloom, then
   * pixels — one way only, never back up, so it cannot oscillate. The first
   * seconds (shadow maps and passes compiling) and step-downs in flight
   * don't count.
   */
  function adapt(realDt) {
    if (!adaptive || busy) return;
    perf.age += realDt;
    if (perf.age < 4) return;
    perf.ema += (realDt * 1000 - perf.ema) * 0.05;
    if (perf.ema > 30) perf.slowFor += realDt;
    else perf.slowFor = Math.max(0, perf.slowFor - realDt);
    if (perf.slowFor < 2.5) return;
    perf.slowFor = 0;
    if (composer) {
      dropComposer();
    } else if (quality.dpr > 1) {
      quality.dpr = Math.max(1, quality.dpr - 0.25);
      resize();
    }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const realDt = clampDt(now - last);
    last = now;
    if (!running) return;
    const t = now / 1000;
    const dt = realDt * updateTimeScale(realDt);

    if (state.phase === 'delay' && !helpOpen) {
      state.delayT -= dt;
      if (state.delayT <= 0) launch();
    } else if (state.phase === 'flight') {
      resolveShots(dt);
      updateClays(dt, t);
    }

    // Swing log in real time: the player's hand doesn't slow down in bullet time
    const dir = aimDir(new THREE.Vector3());
    swingLog.push({ t, dir });
    while (swingLog.length > 2 && t - swingLog[0].t > 0.2) swingLog.shift();

    applyCamera(t, realDt);
    shakeP = Math.max(0, shakeP - realDt * 3.5);

    // Shader clocks wrap hourly: a float time in the hundreds of thousands
    // (a tab left open for days) turns sin() and noise into blocky steps on
    // GPUs with less precision. One small jump an hour is the price.
    clock.shader = (clock.shader + realDt) % 3600;
    clock.game = (clock.game + dt) % 3600;
    grass.uniforms.uTime.value = clock.game;
    sky.uniforms.uTime.value = clock.shader;
    haze.uniforms.uTime.value = clock.shader;
    shafts.uniforms.uTime.value = clock.shader;
    range.flagUniforms.uTime.value = clock.game;
    ambient.uniforms.uTime.value = clock.game;
    range.swallows.update(dt, clock.game);
    sky.dome.position.copy(camera.position);

    shards.update(dt);
    soft.update(dt, WIND);
    bright.update(dt, WIND);
    shot.update(dt, SHOT_SPEED);
    ambient.uniforms.uScale.value = pointScale();

    updateGun(realDt);
    updateGlint(t, dt);
    updateGang(realDt, t);
    updateHud(realDt);
    if (rand() < realDt * 0.15) sfx.bird();

    renderer.info.reset();
    if (composer) composer.render(realDt);
    else renderer.render(scene, camera);
    watchdog.afterFrame();
    adapt(realDt);
  }

  // Kompilera alla shaders innan första bilden, utan att låsa GPU:n —
  // annars kompileras himlen, ängen, folket och geväret i ett block vid
  // första render-anropet, vilket kan återställa grafiken på Windows
  // (Direct3D). Compiled for the path that will draw them (see compileFor).
  await compileFor(scene, !!composer);
  last = performance.now();
  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);

  showStartPanel();
  renderSerie();
  renderGhost();

  /**
   * Test support: play every still-empty box of the 24 through the real
   * scoring (streaks, clean series, doubles), deciding hit or miss with
   * `decide()`; `forceMiss` lists [series, box] pairs that must miss.
   */
  function simulateSeries(decide, forceMiss = []) {
    for (let si = state.serieNo - 1; si < 3; si++) {
      state.serieNo = si + 1;
      const row = state.card[si];
      for (let bi = 0; bi < row.length; bi++) {
        if (row[bi] !== null) continue;
        const hit = !forceMiss.some(([s, b]) => s === si && b === bi) && decide();
        row[bi] = hit;
        if (hit) scoreBird(false);
        else state.streak = 0;
      }
      if (row.every((v) => v === true)) {
        state.score += 500;
        state.stats.clean++;
      }
      if (si === 2) {
        [4, 6].forEach((b) => {
          if (row[b] && row[b + 1]) {
            state.score += 200;
            state.stats.pairs++;
          }
        });
      }
    }
    state.thrown = 24;
  }

  /* Deterministic hooks for automated tests */
  window.__ppSkytte = {
    state,
    startGame,
    callPull,
    fire,
    aimAt(x, y) {
      aim.x = x;
      aim.y = y;
      resetSwing();
    },
    launchNow() {
      if (state.phase === 'delay') state.delayT = 0;
    },
    /** Aim at the first airborne clay as it is now, optionally offset (NDC). */
    aimAtClay(dx = 0, dy = 0) {
      const c = airborne()[0];
      if (!c) return false;
      projected.copy(c.mesh.position).project(camera);
      aim.x = projected.x + dx;
      aim.y = projected.y + dy;
      resetSwing();
      return true;
    },
    /** Aim where the clay WILL be when a still-held shot arrives. */
    aimAtClayLead() {
      const c = airborne()[0];
      if (!c) return false;
      const tof = c.mesh.position.distanceTo(camera.position) / SHOT_SPEED;
      projected.copy(predictClay(c, tof, tmpV)).project(camera);
      aim.x = projected.x;
      aim.y = projected.y;
      resetSwing();
      return true;
    },
    /** Page coordinates (CSS px) of the first clay — or of its lead point — for input-driven tests. */
    clayPoint(withLead = true) {
      const c = airborne()[0];
      if (!c) return null;
      const tof = withLead ? c.mesh.position.distanceTo(camera.position) / SHOT_SPEED : 0;
      projected.copy(predictClay(c, tof, tmpV)).project(camera);
      const rect = canvasHost.getBoundingClientRect();
      return {
        x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height
      };
    },
    smashFirst() {
      const c = airborne()[0];
      if (c) smash(c);
    },
    escapeAll() {
      airborne().forEach((c) => escape(c));
    },
    /** Skip the camera's flight from the vista to the gun. */
    skipIntro() {
      camBlend = camTarget;
    },
    /** Jump straight to the golden dove with a plausible card. */
    skipToGold() {
      simulateSeries(() => true, [[1, 3]]);
      state.phase = 'between';
      camTarget = 1;
      camBlend = 1;
      hud.overlay.classList.remove('show');
      renderScore();
      checkLudvig();
      startGold();
    },
    /** Fill in the rest of the round at a hit rate and show the end screen. */
    finishRound(rate = 0.8) {
      const sim = mulberry(7);
      simulateSeries(() => sim() < rate);
      state.isGold = true;
      state.gold = sim() < rate;
      if (state.gold) scoreBird(true);
      else state.streak = 0;
      state.thrown = 25;
      camBlend = 1;
      camTarget = 1;
      hud.overlay.classList.remove('show');
      renderScore();
      gameOver();
    },
    clays,
    shafts,
    /** Test hook: { pos: [x,y,z], look: [x,y,z], fov } pins the camera; null releases it. */
    setDebugCam(c) {
      debugCam = c;
    },
    /** Show the between-series reaction shot for a given result (hits of 8); `hold` keeps it up. */
    reactionShot(hits = 8, hold = false) {
      reactToSeries(hits, 8);
      if (hold) {
        reaction.target = 1;
        reaction.k = 1;
        timers.forEach((id) => clearTimeout(id));
        timers.clear();
      }
    },
    gang,
    info() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        bloom: !!composer,
        shadows: renderer.shadowMap.enabled,
        dpr: quality.dpr,
        camBlend,
        reaction: reaction.k,
        gangVisible: gang.group.visible,
        watchdog: { level: watchdog.level, last: lastCheck },
        programs: renderer.info.programs ? renderer.info.programs.length : 0,
        frames: watchdog.frame,
        phase: state.phase
      };
    }
  };

  /* ---- Teardown -------------------------------------------------------- */

  function destroy() {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('visibilitychange', onVisibility);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    canvasHost.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('keydown', onKeyCapture, true);
    window.removeEventListener('keydown', onKeyDown);
    hud.overlay.removeEventListener('click', onOverlayClick);
    hud.pull.removeEventListener('click', callPull);
    hud.info.removeEventListener('click', onInfo);
    hud.helpClose.removeEventListener('click', onHelpClose);
    hud.mute.removeEventListener('click', onMute);
    delete window.__ppSkytte;
    alive = false;
    gfx.dispose();
    watchdog.dispose();
    // People first: their materials are shared and reference-counted
    gang.dispose();

    const textures = new Set([glow, star, ...gun.textures]);
    if (envMap) textures.add(envMap);
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m));
    });
    materials.forEach((m) => {
      Object.values(m).forEach((v) => {
        if (v && v.isTexture) textures.add(v);
      });
      m.dispose();
    });
    geometries.forEach((g) => g.dispose());
    textures.forEach((tx) => tx.dispose());
    if (envRT) envRT.dispose();
    if (compileRT) compileRT.dispose();
    sky.plain.dispose();
    sky.material.dispose();
    disposeComposer();
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (sfx.ctx) sfx.ctx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createShooting;
export { SERIES };
