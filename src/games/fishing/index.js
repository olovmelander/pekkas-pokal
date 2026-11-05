/**
 * Pekkas Fiske — the 2024 competition as a Three.js fishing game.
 *
 * The loop is the one Ridiculous Fishing won an Apple Design Award with,
 * and it works because each phase inverts the last:
 *
 *   1. DROP  — steer PAST the fish. Every one you slip by raises the
 *              multiplier, and the good species only live deep, so the
 *              reward for dodging well is the right to keep dodging.
 *   2. REEL  — the rule flips: now hit everything. The multiplier you
 *              earned on the way down is spent on the way up.
 *   3. TOSS  — the catch is flung over the boat and you tap it into the
 *              tunna for double. The last fish falls in slow motion.
 *
 * Around the loop: an uppdrag per cast (one easy, one medium, one hard),
 * a combo announcer for chains on the way up and in the air, and a
 * fångstdagbok on this device that remembers every species you have
 * landed and the biggest of each.
 *
 * Everything is procedural — geometry, caustics, sound. The only thing
 * downloaded is Three.js itself, and only when the game is opened. There
 * is still no post-processing: ACES tone mapping does the grading, every
 * glow is a sprite, and a phone keeps its frame rate.
 */

import * as THREE from 'three';
import { guardRenderer, RenderWatchdog, gfxNotice, precompile } from '../shared/gfx.js';
import { Sfx } from './audio.js';
import { SPECIES, JUNK, fishAssets, Shoal, spawnJunk, disposeAssets, speciesSvg } from './species.js';
import {
  BOTTOM, causticTexture, noiseTexture, particleAtlas, buildSky, buildWater, buildVolume,
  makeEnvironment, buildBasin, buildKelp, buildSeabed, buildShafts, buildLilies,
  buildLure, buildLine, waveHeight, WATER_FOG, SUN_DIR, SUN_UNDER
} from './world.js';
import { buildShore } from './scenery.js';
import { buildBoat, BARREL, WATERLINE } from './boat.js';
import { createAngler } from './angler.js';
import { Pool, CELL, buildSnow, buildRipples, pointScale, pointCap } from './fx.js';
import { buildHud, replay, renderBook } from './hud.js';
import { loadProgress, saveProgress, logCatch, weighFish, fmtKg, pickMission, MISSION_BONUS } from './progress.js';

/** Fill the whole stage on desktop: the descent frames itself per aspect. */
export const layout = 'full';

const CASTS_PER_GAME = 3;

/**
 * The beat between two casts. The camera lifts to the boat, the round card
 * reports the haul and the uppdrag, and the fisherman physically casts
 * back out — so the next drop starts from a throw you watched instead of a
 * cut. A tap skips the wait.
 */
const BETWEEN_HOLD = 2.3; // round card on screen, seconds
const WIND_UP = 0.55;     // the last part of it: he reaches back for the throw
const CAST_OUT = 0.68;    // lure arcing from the rod tip back to the water

/**
 * The eka lies off to the left of where the lure goes in (x = 0), so the
 * throw carries the lure from behind his shoulder out over the bow — and
 * the line never runs down through the hull.
 */
const BOAT_X = -4.6;

/**
 * The game's own clock wraps once an hour. Every time uniform (waves, swim,
 * caustics, snow) is fed from it, so none of them ever grows to the size
 * where float precision on a GPU turns smooth motion into steps — which
 * performance.now() alone would, on a tab left open for days.
 */
const CLOCK_WRAP = 3600;

/**
 * The water by depth, as three gradients: the colour looking level (also
 * the fog), looking up toward the light, and looking down into the dark.
 * The midnight sun keeps the shallows warm; Pekkadjupet is nearly black.
 */
const MID_STOPS = [
  [0, 0x2fa7ae], [8, 0x1b8590], [18, 0x12667c], [30, 0x0b4565], [44, 0x07304f], [60, 0x051a2e]
];
const UP_STOPS = [
  [0, 0x9fe6d8], [8, 0x63c8c4], [18, 0x3c9cab], [30, 0x22708c], [44, 0x134a6a], [60, 0x0a2442]
];
const DOWN_STOPS = [
  [0, 0x0f5c6a], [8, 0x0a4758], [18, 0x063247], [30, 0x042138], [44, 0x031830], [60, 0x020e1e]
];
const RAY_STOPS = [
  [0, 0xfff0c8], [10, 0xd8f4dc], [24, 0x9fe0dc], [40, 0x6fb8d8], [60, 0x3a6ab0]
];

const ZONES = [
  { at: 0, name: 'YTVATTNET', sub: 'Mört och abborre' },
  { at: 12, name: 'SIKDJUPET', sub: 'Här börjar siken' },
  { at: 24, name: 'GÄDDGRAVEN', sub: 'Gäddorna står still och väntar' },
  { at: 38, name: 'LAXDJUPET', sub: 'Kallt, mörkt — och lax' },
  { at: 50, name: 'PEKKADJUPET', sub: 'Hon är kanske hemma i kväll …' }
];

const REEL_WORDS = ['', '', 'DUBBELNAPP!', 'TRIPPELNAPP!', 'FYRA I RAD!', 'STIMFÅNGST!', 'STIMFÅNGST!', 'HELA STIMMET!'];
const TAP_WORDS = ['', '', 'DUBBEL!', 'TRIPPEL!', 'FYRA RAKA!', 'FEM RAKA!', 'OSLAGBAR!'];

const SCRATCH = new THREE.Color();
function gradient(stops, d, out) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [d0, c0] = stops[i];
    const [d1, c1] = stops[i + 1];
    if (d <= d1 || i === stops.length - 2) {
      const k = Math.min(1, Math.max(0, (d - d0) / (d1 - d0)));
      return out.set(c0).lerp(SCRATCH.set(c1), k);
    }
  }
  return out.set(stops[0][1]);
}

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Frame delta, clamped at BOTH ends. Only clamping the top looks harmless
 * until a queued rAF fires with a timestamp older than the one stashed on
 * visibilitychange: dt goes negative, and every `x -= rate * dt` in the
 * loop starts running backwards — fades brighten, scales invert.
 */
function clampDt(ms) {
  return Math.max(0, Math.min(0.05, ms / 1000));
}

/**
 * Camera framing per aspect. A phone in portrait gets the tall, narrow
 * shaft the game was designed around; a wide screen pulls back a little,
 * narrows the vertical FOV, and lets the camera follow the lure less —
 * the whole 18 m lane fits, and the basin walls frame it at the sides.
 */
function framing(aspect) {
  const w = clamp01((aspect - 0.62) / 0.9);
  const wide = aspect > 1.15;
  // A phone on its side is wider still: the start card takes the left
  // two thirds, so the boat moves out to the right third
  const xwide = clamp01((aspect - 1.7) / 0.45);
  return {
    fov: lerp(64, 50, w),
    dist: lerp(11.5, 13.8, w),
    follow: lerp(0.62, 0.28, w),
    look: lerp(0.88, 0.4, w),
    // Start/end screens, relative to the boat: on a wide screen the panel
    // sits left and the boat right; in portrait the panel docks low and the
    // boat and sun sit above
    idleCam: wide ? [-7.0, 3.4, 14.8] : [-3.6, 3.4, 13.5],
    idleLook: wide ? [lerp(-4.2, -7.6, xwide), 2.3, 0] : [0, -3.4, 0],
    // Between casts: a portrait screen comes in closer so the throw reads
    betweenCam: wide ? [-0.4, 3.4, 15.2] : [-0.2, 2.9, 10.6]
  };
}

/* ------------------------------------------------------------------- game */

export async function createFishing(container) {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui fg-ui fiske-ui';
  container.appendChild(hudHost);
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const hud = buildHud(hudHost, ZONES, SPECIES, BOTTOM, !!coarse);
  // A simple quality tier: touch or small screens get fewer particles,
  // less kelp and a lower pixel-ratio ceiling. Adaptive resolution below
  // steps the ratio down further if frames still run long.
  const LITE = !!coarse || Math.min(window.innerWidth, window.innerHeight) < 560;
  hudHost.classList.toggle('fi-touch', !!coarse);

  const sfx = new Sfx();

  /* ---- Renderer: ACES filmic tone mapping does the heavy lifting on the
     look. No post-processing — a phone keeps its frame rate instead. ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  canvasHost.appendChild(renderer.domElement);
  // Real GPUs are stricter than the test machine's (see shared/gfx.js):
  // shader errors and a lost context get a notice, ?gfx=safe drops the
  // heavy water effects from the start
  const gfx = guardRenderer(renderer, container);
  const maxRatio = Math.min(window.devicePixelRatio || 1, LITE || gfx.safe ? 1.5 : 2);
  let ratio = maxRatio;
  renderer.setPixelRatio(ratio);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1f8f96, 0.02);
  scene.background = new THREE.Color(0x1f8f96);
  // The pre-filtered environment is rendered into half-float targets; a GPU
  // that cannot render to those would hand back black. Without it the
  // hemisphere light carries the fish a little harder instead.
  const envRT = gfx.floatRT ? makeEnvironment(renderer) : null;
  scene.environment = envRT ? envRT.texture : null;
  const envBoost = envRT ? 0 : 0.35;

  // Near plane at 0.4 m: nothing ever comes closer than ~6 m, and every
  // step out buys depth precision (some GPUs only give 16 bits)
  const camera = new THREE.PerspectiveCamera(56, 1, 0.4, 900);
  camera.position.set(-3.2, 3.0, 13.5);

  /*
   * Lighting follows the midnight sun. The key light comes FROM the sun in
   * the sky — low, behind the scene and a little right — so it rims Erik,
   * the eka and the headland in warm gold instead of lighting them from a
   * direction where there is no sun. A soft, cool fill from the camera's
   * side (the bright northern sky behind the viewer) keeps faces and the
   * hull readable, and the hemisphere adds sky above and lake below.
   * Under the water the key turns to the refracted sun, high overhead.
   * The light count never changes (no shader recompiles mid-game): the
   * fill only fades.
   */
  const hemi = new THREE.HemisphereLight(0xe4dcec, 0x0a2434, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc68c, 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb4c4ec, 0.85);
  fill.position.set(-14, 22, 50);
  scene.add(fill);

  /* ---- World ---- */
  const caustics = causticTexture();
  const noise = noiseTexture();
  const atlas = particleAtlas();
  // Both are sampled at grazing angles across a lake that reaches the
  // horizon: anisotropic filtering keeps the far ripples from shimmering
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  caustics.anisotropy = aniso;
  noise.anisotropy = aniso;
  const timeU = { value: 0 };

  const sky = buildSky(noise);
  scene.add(sky.dome);
  const shore = buildShore({ sunDir: SUN_DIR, noise, timeU, lite: LITE });
  scene.add(shore);
  const water = buildWater(caustics, noise, shore.userData.reflect);
  scene.add(water.mesh);
  const volume = buildVolume(noise);
  scene.add(volume.mesh);
  const lilies = buildLilies();
  scene.add(lilies);

  const boat = buildBoat();
  boat.position.set(BOAT_X, -WATERLINE, 0);
  scene.add(boat);
  scene.add(boat.userData.foam, boat.userData.bobber);
  const angler = createAngler(boat);

  const basin = buildBasin();
  scene.add(basin);
  const kelp = buildKelp(LITE ? 80 : 130, timeU);
  scene.add(kelp);
  const seabed = buildSeabed(boat.userData.hull);
  scene.add(seabed);
  const shafts = buildShafts(noise, LITE ? 16 : 22);
  scene.add(shafts.mesh);

  const lure = buildLure();
  scene.add(lure);
  const line = buildLine();
  scene.add(line);

  /* ---- Particles ---- */
  const scaleU = { value: 600 };
  const capU = { value: pointCap(renderer, ratio) };
  const glow = new Pool(LITE ? 170 : 260, atlas, THREE.AdditiveBlending, scaleU, capU);
  const bubbles = new Pool(LITE ? 110 : 170, atlas, THREE.AdditiveBlending, scaleU, capU);
  const spray = new Pool(LITE ? 150 : 220, atlas, THREE.NormalBlending, scaleU, capU);
  bubbles.ceiling = -0.05; // they pop at the surface instead of rising on into the air
  const snow = buildSnow(atlas, scaleU, capU, LITE ? 280 : 520);
  const ripples = buildRipples(timeU);
  scene.add(glow.points, bubbles.points, spray.points, snow.points, ripples.mesh);

  /* ---- Graphics fallbacks -------------------------------------------
     The lake is a handful of custom shaders (surface, sky, the water
     volume and its rays, snow) plus patches on the stock materials (fog by
     view direction, the fish's stroke, kelp sway, the rod's bend). If a
     GPU turns the picture black anyway, the watchdog steps down: first the
     custom backdrop goes (a plain water surface; the fog colour carries the
     look), then every patch and the environment map — stock three.js all
     the way. ?gfx=safe starts at the first step. */
  let heavy = true;
  const plainWater = new THREE.MeshLambertMaterial({ color: 0x2e6f7a, transparent: true, opacity: 0.86, side: THREE.DoubleSide });
  const { material: fancyWater } = water.mesh;
  function dropHeavyEffects() {
    heavy = false;
    water.mesh.material = plainWater;
    [sky.dome, volume.mesh, shafts.mesh, snow.points].forEach((o) => {
      o.visible = false;
    });
  }
  function dropShaderPatches() {
    scene.environment = null;
    scene.traverse((o) => {
      if (!o.material) return;
      [].concat(o.material).forEach((m) => {
        if (m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) return;
        m.onBeforeCompile = THREE.Material.prototype.onBeforeCompile;
        m.customProgramCacheKey = THREE.Material.prototype.customProgramCacheKey;
        m.needsUpdate = true;
      });
    });
  }
  if (gfx.safe) dropHeavyEffects();
  // The start screen is bright sky and water: a frame that is under 12 %
  // lit is broken, not moody (the darkest water, at 60 m, still clears it)
  const watchdog = new RenderWatchdog(
    renderer,
    gfx.safe ? [dropShaderPatches] : [dropHeavyEffects, dropShaderPatches],
    {
      minLitFraction: 0.12,
      darkThreshold: 10,
      onStep: () => gfxNotice(container, 'Grafiken förenklades för att fungera på den här enheten.')
    }
  );

  /* ---- Shoal ---------------------------------------------------------- */

  const assets = fishAssets(LITE);
  const DECO = LITE ? 3 : 5;
  const shoal = new Shoal(assets, [42, 24, 26, 16, 16, 2]);
  shoal.objects.forEach((m) => scene.add(m));

  const fishes = [];
  const schools = [];

  function clearFish() {
    fishes.forEach((f) => {
      if (f.junk) scene.remove(f.mesh);
    });
    fishes.length = 0;
    schools.length = 0;
    shoal.clear();
  }

  function newFish(si, kind) {
    const f = shoal.add(si);
    if (!f) return null;
    // Gameplay fish vary only a little in size, so the hitboxes average
    // out to exactly what the balance was tuned on; scenery varies more.
    const k = kind === 'game' ? 0.88 + Math.random() * 0.26 : 0.75 + Math.random() * 0.55;
    Object.assign(f, {
      kind,
      deco: kind !== 'game',
      junk: false,
      k,
      size: f.sp.size * k,
      kg: weighFish(f.sp, k),
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: f.sp.speed * (0.8 + Math.random() * 0.5),
      boost: 1,
      burst: Math.random() < 0.5,
      cycle: Math.random() * 1.5,
      bob: 0.2 + Math.random() * 0.5,
      wph: Math.random() * Math.PI * 2,
      caught: false,
      dodged: false,
      air: null
    });
    f.mesh.scale.setScalar(f.size);
    fishes.push(f);
    return f;
  }

  function addFish(si, depth, kind) {
    const f = newFish(si, kind);
    if (!f) return;
    let z = (Math.random() - 0.5) * 1.4;
    if (kind === 'deco') z = Math.random() < 0.4 ? 2.5 + Math.random() * 1.5 : -3.5 - Math.random() * 6;
    else if (kind === 'far') {
      z = -11 - Math.random() * 6;
      f.speed *= 0.6;
      f.mesh.scale.multiplyScalar(1.3);
    }
    f.mesh.position.set(-16 + Math.random() * 32, -depth, z);
    f.mesh.rotation.y = f.dir > 0 ? 0 : Math.PI;
  }

  /**
   * A school: members hold loose offsets around a centre that cruises and
   * now and then turns as one, each fish weaving on its own phase.
   */
  function addSchool(si, n, depth, z) {
    const sc = {
      x: -20 + Math.random() * 40,
      y: -depth,
      z,
      heading: Math.random() < 0.5 ? 0 : Math.PI,
      target: 0,
      speed: 1.3 + Math.random() * 0.9,
      turnIn: 6 + Math.random() * 8,
      members: []
    };
    sc.target = sc.heading;
    for (let i = 0; i < n; i++) {
      const f = newFish(si, 'school');
      if (!f) break;
      f.off = {
        x: (Math.random() - 0.5) * 3.6,
        y: (Math.random() - 0.5) * 1.5,
        z: (Math.random() - 0.5) * 2.6,
        ph: Math.random() * Math.PI * 2
      };
      sc.members.push(f);
    }
    schools.push(sc);
  }

  function addJunk(asset) {
    const mesh = spawnJunk(asset);
    const depth = asset.junk.min + Math.random() * (asset.junk.max - asset.junk.min);
    mesh.position.set(-15 + Math.random() * 30, -depth, (Math.random() - 0.5) * 1.2);
    scene.add(mesh);
    fishes.push({
      sp: { name: asset.junk.name, pts: 0, size: asset.junk.size, speed: 0.4 },
      mesh,
      size: asset.junk.size,
      dir: Math.random() < 0.5 ? 1 : -1,
      deco: false,
      kind: 'junk',
      speed: 0.5,
      wph: Math.random() * Math.PI * 2,
      bob: 0.3,
      caught: false,
      dodged: false,
      junk: true,
      air: null
    });
  }

  function spawnFishSet() {
    clearFish();
    assets.species.forEach((asset, si) => {
      const { sp } = asset;
      const depth = () => sp.min + Math.random() * (sp.max - sp.min);
      if (sp.rare) {
        if (Math.random() < 0.4) return; // she is not always home
        addFish(si, depth(), 'game');
        return;
      }
      for (let i = 0; i < 7; i++) addFish(si, depth(), 'game');
      for (let i = 0; i < DECO; i++) addFish(si, depth(), 'deco');
      for (let i = 0; i < 2; i++) addFish(si, depth(), 'far');
    });
    addSchool(0, LITE ? 9 : 13, 3 + Math.random() * 5, -6 - Math.random() * 3);
    addSchool(0, LITE ? 7 : 11, 9 + Math.random() * 4, -9 - Math.random() * 3);
    addSchool(1, 6, 10 + Math.random() * 8, -7 - Math.random() * 3);
    addSchool(2, LITE ? 6 : 9, 20 + Math.random() * 12, -9 - Math.random() * 3);
    assets.junk.forEach((asset) => {
      addJunk(asset);
      if (Math.random() < 0.6) addJunk(asset);
    });
  }

  const setVisible = (f, v) => {
    if (f.junk) f.mesh.visible = v;
    else f.visible = v;
  };

  /* ---- State ---------------------------------------------------------- */

  const state = {
    phase: 'idle', // idle | drop | reel | toss | between | over
    score: 0,
    castNo: 1,
    depth: 0,
    lureX: 0,
    targetX: 0,
    dropSpeed: 6.5,
    dropT: 0,
    caught: [],
    combo: 0,
    dodges: 0,
    mult: 1,
    tapChain: 0,
    reelChain: 0,
    lastCatchT: -9,
    tossLeft: 0,
    tossDone: false,
    tunnaN: 0,
    slow: 1,
    slowOn: false,
    zone: -1,
    deepest: 0,
    castScore: 0,
    betweenT: 0,
    castOut: null,
    lastToast: 0,
    mission: null,
    missionDone: false,
    missionsUsed: [],
    nextMission: null,
    stars: 0,
    rec: null,
    session: {},
    steered: false,
    cheer: 0,
    clock: 0,
    tossT: 0,
    timers: []
  };

  const progress = loadProgress();
  const newcomer = Object.keys(progress.log).length === 0;
  const fmt = (n) => Math.round(n).toLocaleString('sv-SE');
  hud.hi.textContent = fmt(progress.high);

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    state.timers.push(id);
    return id;
  };

  /* Camera scratch vectors — declared up here because startToss() cuts the
     camera directly and runs before the loop section. */
  const camGoal = new THREE.Vector3();
  const lookGoal = new THREE.Vector3();
  // …and the angler's: where he looks, where the float is, the tunna's rim
  const anglerLook = new THREE.Vector3();
  const bobberPos = new THREE.Vector3();
  const barrelPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3(0, 1.5, 0);
  let frame = framing(1);

  /* ---- Juice ---------------------------------------------------------- */

  const shake = { power: 0 };
  let hitStop = 0;
  let fovPunch = 0;

  function kick(power, stopMs = 0, fov = 0) {
    hitStop = Math.max(hitStop, stopMs / 1000);
    if (reduceMotion) return; // no shake, no zoom punch
    shake.power = Math.max(shake.power, power);
    fovPunch = Math.max(fovPunch, fov);
    if (navigator.vibrate) navigator.vibrate(Math.min(40, power * 26));
  }

  function flash(color = 'rgba(190, 240, 255, 0.5)') {
    if (reduceMotion) return;
    hud.flash.style.setProperty('--fc', color);
    replay(hud.flash, 'show');
  }

  const projected = new THREE.Vector3();

  /** Floating score number anchored to a world position. */
  function popScore(text, world, cls = '') {
    projected.copy(world).project(camera);
    if (projected.z > 1) return;
    const el = document.createElement('div');
    el.className = `fg-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${(projected.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * 100}%`;
    hud.pops.appendChild(el);
    later(() => el.remove(), 1200);
  }

  function toast(msg, big = false) {
    hud.toast.textContent = msg;
    hud.toast.className = `pb-toast show${big ? ' big' : ''}`;
    clearTimeout(state.lastToast);
    state.lastToast = setTimeout(() => {
      hud.toast.className = 'pb-toast';
    }, big ? 1900 : 1200);
  }

  /** The combo announcer: one big word, a small line under it. */
  function announce(big, sub = '', tone = '') {
    hud.announceBig.textContent = big;
    hud.announceSub.textContent = sub;
    hud.announce.className = `fi-announce ${tone}`;
    replay(hud.announce, 'show');
  }

  function setPhaseLabel(txt) {
    hud.phase.textContent = txt;
    hud.phase.classList.toggle('show', !!txt);
  }

  function renderMult() {
    const show = state.mult > 1 && (state.phase === 'drop' || state.phase === 'reel');
    hud.mult.textContent = `×${state.mult.toFixed(1).replace(/\.0$/, '')}`;
    hud.mult.classList.toggle('show', show);
    hud.mult.classList.toggle('hot', state.mult >= 4);
    if (state.rec) state.rec.peakMult = Math.max(state.rec.peakMult, state.mult);
  }

  function bumpMult() {
    replay(hud.mult, 'pulse');
  }

  function addScore(n, world, label, cls) {
    state.score += n;
    state.castScore += n;
    hud.score.textContent = fmt(state.score);
    replay(hud.score, 'bump');
    if (world) popScore(label || `+${fmt(n)}`, world, cls);
  }

  function renderCasts() {
    let html = '';
    for (let i = 1; i <= CASTS_PER_GAME; i++) {
      const cls = i < state.castNo ? 'done' : i === state.castNo ? 'now' : '';
      html += `<i class="${cls}"></i>`;
    }
    hud.casts.innerHTML = `<span>KAST ${Math.min(state.castNo, CASTS_PER_GAME)}/${CASTS_PER_GAME}</span>${html}`;
  }

  function renderMission() {
    const m = state.mission;
    hud.mission.hidden = !m || state.phase === 'idle' || state.phase === 'over';
    if (!m) return;
    hud.missionText.textContent = m.text;
    hud.missionBonus.textContent = state.missionDone ? 'KLART' : `+${fmt(MISSION_BONUS[m.tier])}`;
    hud.mission.classList.toggle('done', state.missionDone);
  }

  /** Tested after every event that could complete the uppdrag. */
  function checkMission() {
    const m = state.mission;
    if (!m || state.missionDone || !state.rec || !m.test(state.rec)) return;
    state.missionDone = true;
    state.stars++;
    progress.stars++;
    const bonus = MISSION_BONUS[m.tier];
    addScore(bonus);
    announce('UPPDRAG KLART!', `${m.text} · +${fmt(bonus)}`, 'gold');
    sfx.mission();
    flash('rgba(255, 214, 120, 0.4)');
    renderMission();
    replay(hud.mission, 'win');
  }

  /* ---- Phases --------------------------------------------------------- */

  function startCast() {
    state.phase = 'drop';
    state.depth = 0;
    state.dropSpeed = 6.5;
    state.dropT = 0;
    state.lureX = 0;
    state.targetX = 0;
    state.caught = [];
    state.combo = 0;
    state.dodges = 0;
    state.mult = 1;
    state.tapChain = 0;
    state.reelChain = 0;
    state.zone = -1;
    state.castScore = 0;
    state.betweenT = 0;
    state.castOut = null;
    state.tunnaN = 0;
    state.mission = state.nextMission;
    state.missionDone = false;
    if (state.mission) state.missionsUsed.push(state.mission.id);
    state.rec = { dodges: 0, near: 0, chain: 0, deepest: 0, haul: 0, tapped: 0, perfect: false, peakMult: 1, bottom: false, species: {} };
    spawnFishSet();
    sfx.splash(1.1);
    ripples.spawn(0, 0, 2.6, 0.8, 1.3);
    spray.burst(0, 0.2, 0, 26, 5, { cell: CELL.DROP, color: 0xe6f6ff, grav: -16, size: 0.14, life: 0.8, drag: 0.4, lift: 0.6 });
    for (let i = 0; i < 26; i++) {
      bubbles.emit({
        x: (Math.random() - 0.5) * 0.8, y: -0.4 - Math.random() * 1.2, z: (Math.random() - 0.5) * 0.6,
        vy: 1 + Math.random() * 2, life: 1 + Math.random(), size: 0.1 + Math.random() * 0.16,
        cell: CELL.BUBBLE, color: 0xdff8ff, wob: 0.6
      });
    }
    setPhaseLabel('VÄJ FÖR FISKEN — djupare ner simmar det finare');
    later(() => setPhaseLabel(''), 2600);
    renderCasts();
    renderMult();
    renderMission();
  }

  function onDodge(f, dx, rx) {
    f.dodged = true;
    state.dodges++;
    state.rec.dodges = state.dodges;
    state.mult = Math.min(10, 1 + state.dodges * 0.5);
    sfx.dodge(state.dodges);
    // A close shave pays extra — the reason to thread a gap rather than
    // swing wide around everything
    if (Math.abs(dx) < rx + 0.6) {
      state.mult = Math.min(10, state.mult + 0.25);
      state.rec.near++;
      sfx.nearMiss();
      popScore('SNÄVT!', f.mesh.position, 'near');
      glow.burst(state.lureX, -state.depth, 0.3, 10, 3, { color: 0x9ff3ff, size: 0.18, life: 0.45 });
      // Time catches its breath for a moment as the fish slides past
      kick(0.18, 55, 1.2);
    } else {
      if (state.dodges % 4 === 0) popScore(`×${state.mult.toFixed(1)}`, f.mesh.position, 'mult');
      // A small wake of light where it slipped by
      glow.burst(f.mesh.position.x * 0.5 + state.lureX * 0.5, -state.depth + 0.6, 0.2, 5, 1.6, { color: 0x8fe3f2, size: 0.12, life: 0.35 });
    }
    renderMult();
    bumpMult();
    checkMission();
  }

  function hookAt(fish, reason) {
    state.phase = 'reel';
    hud.hint.hidden = true;
    sfx.hook();
    kick(1.1, 70, 5);
    flash();
    glow.burst(state.lureX, -state.depth, 0, 22, 4.5, { color: 0xffe9b8, size: 0.22 });
    for (let i = 0; i < 18; i++) {
      bubbles.emit({
        x: state.lureX + (Math.random() - 0.5) * 0.6, y: -state.depth + (Math.random() - 0.5) * 0.6, z: (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 2.5, life: 1 + Math.random(), size: 0.08 + Math.random() * 0.14,
        cell: CELL.BUBBLE, color: 0xdff8ff, wob: 0.5, drag: 1.2
      });
    }
    if (fish) catchOne(fish, true);
    angler.trigger(reason === 'junk' ? 'junk' : reason === 'bottom' ? 'big' : 'strike');
    boatRock(0.08, -0.32, -0.12); // the strike snatches the bow down
    if (reason === 'bottom') {
      const bonus = 1500 * state.mult;
      addScore(bonus, lure.position, `BOTTEN +${fmt(bonus)}`, 'gold');
      state.mult = Math.min(12, state.mult + 2);
      state.rec.bottom = true;
      announce('BOTTENKÄNNING!', 'Full multiplikator', 'gold');
      sfx.legend();
      if (!progress.pokal) {
        progress.pokal = true;
        later(() => toast('… och där nere ligger en pokal?!', true), 1300);
      }
      checkMission();
    } else if (reason === 'junk') {
      toast(`${fish ? fish.sp.name : 'Skräp'} … inga poäng.`);
      state.mult = 1;
    } else if (fish) {
      announce('KROKAD!', fish.sp.name);
    }
    renderMult();
    setPhaseLabel('VEVA! Nu gäller det att träffa allt');
    later(() => setPhaseLabel(''), 2200);
  }

  function catchOne(f, first) {
    f.caught = true;
    f.flash = 1;
    state.combo++;
    state.caught.push(f);
    // Catches in quick succession chain: each link pays 10 % more
    const quick = state.clock - state.lastCatchT < 0.9;
    state.reelChain = quick ? state.reelChain + 1 : 1;
    state.lastCatchT = state.clock;
    state.rec.chain = Math.max(state.rec.chain, state.reelChain);
    const chainK = 1 + (state.reelChain - 1) * 0.1;
    const pts = Math.round(f.sp.pts * state.mult * chainK);
    if (!first) state.mult = Math.min(12, state.mult + 0.25);
    addScore(pts, f.mesh.position, `${f.sp.name} +${fmt(pts)}`);
    sfx.catchFish(state.combo);
    const fin = new THREE.Color(f.sp.fin);
    glow.burst(f.mesh.position.x, f.mesh.position.y, f.mesh.position.z, 14, 3.4, { color: fin, size: 0.22, life: 0.6 });
    glow.emit({ x: f.mesh.position.x, y: f.mesh.position.y, z: f.mesh.position.z + 0.4, size: 2.2 * f.size, size1: 0, life: 0.3, cell: CELL.GLINT, color: 0xfff4dc });
    renderMult();
    if (state.reelChain >= 2) {
      announce(REEL_WORDS[Math.min(state.reelChain, REEL_WORDS.length - 1)], `+${Math.round((chainK - 1) * 100)} %`);
      sfx.announce(state.reelChain);
    }

    const { rec } = state;
    rec.haul = state.caught.length;
    rec.species[f.sp.id] = (rec.species[f.sp.id] || 0) + 1;
    const s = state.session[f.sp.id] || { n: 0, best: 0 };
    s.n++;
    s.best = Math.max(s.best, f.kg);
    state.session[f.sp.id] = s;
    const logged = logCatch(progress, f.sp, f.kg);

    if (f.sp.rare || logged.first) angler.trigger('big');
    if (f.sp.rare) {
      sfx.legend();
      announce('PEKKAGÄDDAN!', `${fmtKg(f.kg)} — krönt och gyllene`, 'gold');
      kick(2.6, 120, 9);
      flash('rgba(255, 210, 110, 0.55)');
      glow.burst(f.mesh.position.x, f.mesh.position.y, f.mesh.position.z, 60, 7, { color: 0xffd36a, size: 0.3, life: 1.2, spread: 1.2 });
    } else {
      kick(0.5, 0, 0);
      if (logged.first) {
        later(() => announce('NY ART!', `${f.sp.name} i fångstdagboken`, 'gold'), state.reelChain >= 2 ? 650 : 0);
        sfx.announce(4);
      } else if (logged.record) {
        toast(`Största ${f.sp.def} hittills: ${fmtKg(f.kg)}`);
      }
    }
    checkMission();
  }

  function startToss() {
    state.phase = 'toss';
    state.tossDone = false;
    hud.zone.classList.remove('show');
    hud.mult.classList.remove('show');
    state.tapChain = 0;
    state.tunnaN = 0;
    state.slow = 1;
    state.slowOn = false;
    state.tossT = 0;
    sfx.toss();
    sfx.splash(0.9);
    const bx = boat.position.x;
    // The catch erupts out of the lake: a column of spray and rings
    for (let i = 0; i < (LITE ? 50 : 80); i++) {
      spray.emit({
        x: bx + (Math.random() - 0.5) * 1.6, y: 0.2, z: 1.4 + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 5, vy: 5 + Math.random() * 8, vz: (Math.random() - 0.3) * 2.5,
        grav: -20, drag: 0.3, life: 0.9 + Math.random() * 0.7, size: 0.1 + Math.random() * 0.22,
        cell: CELL.DROP, color: 0xe8f6ff, alpha: 0.95
      });
    }
    glow.burst(bx, 0.6, 1.4, 30, 6, { color: 0xfff1d6, size: 0.24, life: 0.8 });
    ripples.spawn(bx, 1.4, 3.6, 0.85, 1.7);
    ripples.spawn(bx, 1.4, 2.0, 0.6, 1.0);
    kick(0.9, 0, 4);
    const n = state.caught.length;
    state.tossLeft = n;
    angler.trigger(n ? 'erupt' : 'miss');
    if (n) boatRock(0.22, -0.22, -0.3);
    if (n === 0) {
      setPhaseLabel('Tomt nät den här gången');
      later(endCast, 1100);
      return;
    }
    setPhaseLabel(`${coarse ? 'TRYCK' : 'KLICKA'} PÅ FISKEN — i tunnan för dubbelt`);
    hud.tunna.hidden = false;
    hud.tunnaN.textContent = '0';
    // Cut straight to the above-water framing: watching this from under the
    // surface was the single worst thing about the phase.
    camera.position.set(bx, 3.6, 15.5);
    lookAt.set(bx, 2.7, 0.4);
    camera.lookAt(lookAt);
    state.caught.forEach((f, i) => {
      const spread = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      f.air = {
        x: bx + spread * 1.3,
        y: 0.6,
        z: 1.4,
        vx: spread * 2.3 + (Math.random() - 0.5) * 0.9,
        vy: 11 + Math.random() * 3.2,
        spin: (Math.random() - 0.5) * 8,
        glint: Math.random() * 0.4,
        done: false
      };
      setVisible(f, true);
      // Bigger in the air than in the water — they have to be thumb-sized
      f.mesh.scale.setScalar(f.sp.size * 1.35);
      f.mesh.rotation.set(0, 0, 0);
    });
  }

  /** The scorecard that carries the gap between two casts. */
  function showRoundCard(finished, haul, pts, mission, done) {
    hud.roundKicker.textContent = `Kast ${finished} klart`;
    hud.roundNo.textContent = `KAST ${state.castNo} AV ${CASTS_PER_GAME}`;
    hud.roundHaul.innerHTML =
      `<span><b>${haul}</b> ${haul === 1 ? 'fisk' : 'fiskar'}</span>` +
      `<span><b>+${fmt(pts)}</b> poäng</span>` +
      `<span><b>${fmt(state.score)}</b> totalt</span>`;
    hud.roundMission.className = `fi-round-mission ${done ? 'ok' : 'miss'}`;
    hud.roundMission.textContent = mission ? `${done ? '★ Uppdrag klart' : '☆ Uppdraget missat'}: ${mission.text}` : '';
    hud.roundNext.innerHTML = state.nextMission
      ? `<small>Nästa uppdrag</small>${state.nextMission.text} <b>+${fmt(MISSION_BONUS[state.nextMission.tier])}</b>`
      : '';
    hud.round.hidden = false;
    void hud.round.offsetWidth;
    hud.round.classList.add('show');
  }

  function hideRoundCard() {
    hud.round.classList.remove('show');
    hud.round.hidden = true;
  }

  /** A tap skips the card — but not the wind-up: the throw is the payoff. */
  function skipCard() {
    if (state.phase !== 'between' || state.castOut) return;
    state.betweenT = Math.max(state.betweenT, BETWEEN_HOLD - WIND_UP);
    hideRoundCard();
  }

  function endCast() {
    if (state.phase !== 'toss') return;
    setPhaseLabel('');
    hud.mult.classList.remove('show');
    hud.tunna.hidden = true;
    state.slowOn = false;
    hudHost.classList.remove('fi-slow');
    progress.bestCast = Math.max(progress.bestCast, state.castScore);
    // Anything still arcing toward the tunna is in it by now
    state.caught.forEach((f) => setVisible(f, false));
    if (state.castNo >= CASTS_PER_GAME) {
      gameOver();
      return;
    }
    const finished = state.castNo;
    const haul = state.caught.length;
    const pts = state.castScore;
    state.castNo++;
    state.phase = 'between';
    state.betweenT = 0;
    state.castOut = null;
    state.nextMission = pickMission(state.castNo, state.missionsUsed, false);
    renderCasts();
    renderMission();
    showRoundCard(finished, haul, pts, state.mission, state.missionDone);
    sfx.zone(0);
    // From here the tick drives it: camera to the boat, card up, then the
    // fisherman winds up and throws the lure back out. See BETWEEN_HOLD.
  }

  function gameOver() {
    state.phase = 'over';
    hud.mission.hidden = true;
    const isHigh = state.score > progress.high;
    progress.high = Math.max(progress.high, state.score);
    progress.deepest = Math.max(progress.deepest, state.deepest);
    progress.evenings++;
    saveProgress(progress);
    hud.hi.textContent = fmt(progress.high);
    sfx.fanfare();
    state.cheer = isHigh || state.stars === 3 ? 3 : 0;
    if (isHigh) angler.trigger('big');
    hud.kicker.textContent = `Kvällens fiske · ${state.stars} av 3 uppdrag`;
    hud.title.textContent = isHigh ? 'Nytt rekord!' : 'Fisket är slut';
    hud.text.textContent = isHigh
      ? 'Största fångsten hittills på den här enheten. Petri heder!'
      : 'Sen är det kaffe och rökt sik vid bryggan. En tur till?';
    hud.steps.hidden = true;
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng · rekord ${fmt(progress.high)}</small>`;
    hud.stars.hidden = false;
    hud.stars.innerHTML = [0, 1, 2].map((i) => `<i class="${i < state.stars ? 'on' : ''}" style="--d:${i * 0.12}s">★</i>`).join('');
    const caughtIds = SPECIES.filter((sp) => state.session[sp.id]);
    hud.haul.hidden = caughtIds.length === 0;
    hud.haul.innerHTML = caughtIds.map((sp) => {
      const s = state.session[sp.id];
      return `<span>${speciesSvg(sp, true)}<b>${s.n}× ${sp.name}</b><small>${fmtKg(s.best)}</small></span>`;
    }).join('');
    hud.catchlist.hidden = false;
    hud.catchlist.innerHTML = `<b>Djupaste kast</b><span>${Math.round(state.deepest)} m</span>`;
    hud.start.textContent = 'Fiska igen';
    renderBook(hud, progress, SPECIES, speciesSvg, fmt, fmtKg);
    hud.overlay.classList.add('show');
    hudHost.classList.add('fi-menu', 'fi-over');
  }

  function startGame() {
    sfx.resume();
    state.score = 0;
    state.castNo = 1;
    state.deepest = 0;
    state.stars = 0;
    state.session = {};
    state.missionsUsed = [];
    state.nextMission = pickMission(1, [], newcomer && progress.evenings === 0);
    state.steered = false;
    state.cheer = 0;
    hud.score.textContent = '0';
    hud.scoreline.hidden = true;
    hud.catchlist.hidden = true;
    hud.stars.hidden = true;
    hud.haul.hidden = true;
    hud.steps.hidden = false;
    hud.overlay.classList.remove('show');
    hudHost.classList.remove('fi-menu', 'fi-over');
    setBook(false);
    hideRoundCard();
    startCast();
  }

  /* ---- Input ---------------------------------------------------------- */

  let dragging = false;
  let helpOpen = false;
  let bookOpen = false;
  const REACH = 9;
  const keys = { left: false, right: false };

  function pointerToNdc(e) {
    const rect = canvasHost.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    };
  }

  const steering = () => state.phase === 'drop' || state.phase === 'reel';

  function steerTo(e) {
    state.targetX = Math.max(-REACH, Math.min(REACH, pointerToNdc(e).x * REACH));
    if (state.phase === 'drop' && Math.abs(state.targetX) > 0.6) state.steered = true;
  }

  function onPointerDown(e) {
    sfx.resume();
    if (helpOpen || bookOpen || e.target.closest('.pb-overlay, .pb-mute, .pb-info, .pb-help, .fi-book')) return;
    if (state.phase === 'toss') {
      tryTapFish(e);
      return;
    }
    if (state.phase === 'between' && !state.castOut) {
      skipCard();
      return;
    }
    dragging = true;
    steerTo(e);
  }

  function onPointerMove(e) {
    // A mouse steers by hovering — on a desktop that is the natural
    // gesture; a finger has to be down
    if (dragging || (e.pointerType === 'mouse' && steering())) steerTo(e);
  }

  function onPointerUp() {
    dragging = false;
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === '?' || (k === 'escape' && (helpOpen || bookOpen))) {
      if (bookOpen) setBook(false);
      else setHelp(k === '?' ? !helpOpen : false);
      return;
    }
    if (helpOpen || bookOpen) return;
    if (k === 'arrowleft' || k === 'a') {
      if (!e.repeat) state.targetX = Math.max(-REACH, state.targetX - 1.4);
      keys.left = true;
      state.steered = true;
    } else if (k === 'arrowright' || k === 'd') {
      if (!e.repeat) state.targetX = Math.min(REACH, state.targetX + 1.4);
      keys.right = true;
      state.steered = true;
    } else if (k === ' ' || k === 'enter') {
      if (state.phase === 'idle' || state.phase === 'over') {
        e.preventDefault();
        startGame();
      } else if (state.phase === 'between' && !state.castOut) {
        e.preventDefault();
        skipCard();
      }
    }
  }

  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') keys.left = false;
    if (k === 'arrowright' || k === 'd') keys.right = false;
  }

  const ndc = new THREE.Vector3();

  function tryTapFish(e) {
    const p = pointerToNdc(e);
    let bestF = null;
    let bestD = 0.17; // a generous thumb in NDC
    state.caught.forEach((f) => {
      if (!f.air || f.air.done) return;
      ndc.copy(f.mesh.position).project(camera);
      // On a wide screen an NDC unit across is more pixels than one down —
      // scale x so the thumb radius stays round on a monitor
      const d = Math.hypot((ndc.x - p.x) * Math.max(1, camera.aspect), ndc.y - p.y);
      if (d < bestD) {
        bestD = d;
        bestF = f;
      }
    });
    if (!bestF) {
      state.tapChain = 0;
      return;
    }
    state.tapChain++;
    const chainBonus = 1 + (state.tapChain - 1) * 0.25;
    const pts = Math.round(bestF.sp.pts * state.mult * chainBonus);
    bestF.air.done = 'hit';
    bestF.flash = 1;
    state.tossLeft--;
    state.rec.tapped++;
    const pos = bestF.mesh.position;
    addScore(pts, pos, `+${fmt(pts)}`, state.tapChain >= 2 ? 'chain' : '');
    sfx.tap(state.tapChain);
    glow.burst(pos.x, pos.y, pos.z, 18, 4.5, { color: new THREE.Color(bestF.sp.fin).lerp(SCRATCH.set(0xffffff), 0.4), size: 0.24, grav: -5 });
    glow.emit({ x: pos.x, y: pos.y, z: pos.z + 0.5, size: 3.2, size1: 0, life: 0.32, cell: CELL.GLINT, color: 0xfff6dc });
    spray.burst(pos.x, pos.y, pos.z, 12, 4, { cell: CELL.DROP, color: 0xe8f6ff, grav: -16, size: 0.12, life: 0.7, drag: 0.4 });
    kick(0.5, 45, 2);
    if (state.tapChain >= 2) {
      announce(TAP_WORDS[Math.min(state.tapChain, TAP_WORDS.length - 1)], `kedja ×${chainBonus.toFixed(2).replace(/0$/, '')}`);
      sfx.announce(state.tapChain + 1);
    }
    // Arc it into the tunna: launch at 7.5 m/s up and solve the flight time
    // to the barrel's rim, so the horizontal speed lands it dead centre
    // (y = y0 + 7.5t − 10t²)
    const rim = barrelTop(barrelPos).y;
    const T = (7.5 + Math.sqrt(56.25 + 40 * Math.max(0, pos.y - rim))) / 20;
    bestF.air.vx = (barrelPos.x - pos.x) / T;
    bestF.air.vz = (barrelPos.z - pos.z) / T;
    bestF.air.vy = 7.5;
    bestF.air.spin *= 2.2;
    checkMission();
    if (state.tossLeft <= 0) finishToss();
  }

  function finishToss() {
    if (state.tossDone) return; // a tap and a splash can land on the same frame
    state.tossDone = true;
    const all = state.caught.length > 0 && state.caught.every((f) => f.air && f.air.done === 'hit');
    if (all) state.rec.perfect = true;
    if (all && state.caught.length > 1) {
      angler.trigger('perfect');
      const bonus = Math.round(2000 * state.mult);
      later(() => {
        announce('PERFEKT KAST!', `+${fmt(bonus)}`, 'gold');
        addScore(bonus);
      }, 260);
      sfx.legend();
      kick(1.6, 90, 6);
      state.cheer = 2;
    }
    checkMission();
    later(endCast, 1000);
  }

  /* Strategy card and fångstdagbok: both pause the game while open */
  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
    if (open) dragging = false;
  }

  function setBook(open) {
    bookOpen = open;
    if (open) renderBook(hud, progress, SPECIES, speciesSvg, fmt, fmtKg);
    hud.book.hidden = !open;
    if (open) dragging = false;
  }

  canvasHost.addEventListener('pointerdown', onPointerDown);
  canvasHost.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  hud.start.addEventListener('click', startGame);
  hud.bookOpen.addEventListener('click', () => {
    sfx.resume();
    setBook(true);
  });
  hud.bookClose.addEventListener('click', () => setBook(false));
  hud.info.addEventListener('click', () => setHelp(!helpOpen));
  hud.helpClose.addEventListener('click', () => setHelp(false));
  hud.mute.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    hud.mute.classList.toggle('off', sfx.muted);
  });

  /* ---- Sizing --------------------------------------------------------- */

  let baseFov = 56;

  function updatePointScale() {
    scaleU.value = pointScale(renderer, camera);
  }

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    frame = framing(camera.aspect);
    baseFov = frame.fov;
    camera.fov = baseFov + fovPunch;
    camera.updateProjectionMatrix();
    updatePointScale();
    capU.value = pointCap(renderer, ratio);
    hudHost.classList.toggle('fi-wide', camera.aspect > 1.15);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Loop ----------------------------------------------------------- */

  let raf = 0;
  let last = performance.now();
  let running = true;
  let clockT = 0;          // the game's own time, see CLOCK_WRAP
  let eyeUnder = false;    // last frame: was the camera under the surface?
  let anglerAct = 'rest';  // for the test hook
  let lureGlow = 0.7;
  const boatMotion = { y: 0, vy: 0, p: 0, vp: 0, r: 0, vr: 0 };
  const tmpColor = new THREE.Color();
  const tmpColor2 = new THREE.Color();
  const rodTip = new THREE.Vector3();
  const TAU = Math.PI * 2;

  /**
   * Burst-and-glide: fish alternate a few quick tail beats with a coast,
   * so the shoal never moves like a conveyor belt. The average speed is
   * the species' tuned speed — dodging is exactly as hard as before.
   */
  function swimStep(f, dt) {
    f.cycle -= dt;
    if (f.cycle <= 0) {
      f.burst = !f.burst;
      f.cycle = f.burst ? 0.5 + Math.random() * 0.7 : 0.6 + Math.random() * 1.1;
    }
    f.boost += ((f.burst ? 1.2 : 0.82) - f.boost) * Math.min(1, dt * 3);
    f.amp += ((f.burst ? 0.62 : 0.24) - f.amp) * Math.min(1, dt * 4);
    f.phase += dt * TAU * (f.burst ? 3.1 : 1.5) * (0.7 + f.sp.speed * 0.1);
  }

  function updateFish(dt, t) {
    const focusY = camera.position.y;
    fishes.forEach((f) => {
      if (f.caught) return;
      const m = f.mesh;
      if (f.kind !== 'far' && Math.abs(m.position.y - focusY) > 28) return; // out of sight, skip
      if (f.junk) {
        m.position.x += f.dir * f.speed * dt;
        m.position.y += Math.sin(t * 1.6 + f.wph) * f.bob * dt;
        m.rotation.z = Math.sin(t * 0.7 + f.wph) * 0.25;
        m.rotation.y += dt * 0.3;
        if (f.dir > 0 && m.position.x > 18) m.position.x = -18;
        else if (f.dir < 0 && m.position.x < -18) m.position.x = 18;
        return;
      }
      if (f.flash > 0) f.flash = Math.max(0, f.flash - dt * 5);
      if (f.kind === 'school') return; // moved with its school below
      swimStep(f, dt);
      m.position.x += f.dir * f.speed * f.boost * dt;
      const bobV = Math.sin(t * 1.6 + f.wph) * f.bob;
      m.position.y += bobV * dt;
      // Pitch with the bob, a little roll into the stroke
      m.rotation.z = bobV * 0.18 * f.dir;
      m.rotation.x = Math.sin(f.phase) * 0.05;
      const lim = f.kind === 'far' ? 32 : f.kind === 'deco' ? 18 + Math.max(0, -m.position.z) * 0.8 : 18;
      if (f.dir > 0 && m.position.x > lim) m.position.x = -lim;
      else if (f.dir < 0 && m.position.x < -lim) m.position.x = lim;
    });
    schools.forEach((sc) => {
      if (Math.abs(sc.y - focusY) > 30) return;
      sc.turnIn -= dt;
      if (sc.turnIn <= 0) {
        sc.target += Math.PI;
        sc.turnIn = 7 + Math.random() * 9;
      }
      sc.heading += (sc.target - sc.heading) * Math.min(1, dt * 0.9);
      sc.x += Math.cos(sc.heading) * sc.speed * dt;
      sc.z = Math.max(-13, Math.min(-4, sc.z - Math.sin(sc.heading) * sc.speed * 0.4 * dt));
      if (sc.x > 34) sc.x = -34;
      else if (sc.x < -34) sc.x = 34;
      sc.members.forEach((f) => {
        const o = f.off;
        const m = f.mesh;
        m.position.set(
          sc.x + o.x + Math.sin(t * 0.9 + o.ph) * 0.5,
          sc.y + o.y + Math.sin(t * 0.7 + o.ph * 1.3) * 0.3,
          sc.z + o.z + Math.cos(t * 0.8 + o.ph) * 0.4
        );
        m.rotation.set(0, sc.heading + Math.cos(t * 0.9 + o.ph) * 0.18, Math.sin(t * 0.7 + o.ph) * 0.06);
        f.amp = 0.45;
        f.phase += dt * TAU * (2.2 + Math.sin(o.ph) * 0.4);
      });
    });
  }

  function collide(reeling) {
    const y = -state.depth;
    for (const f of fishes) {
      if (f.caught || f.deco) continue;
      const m = f.mesh;
      const { size } = f;
      const dx = m.position.x - state.lureX;
      const dy = m.position.y - y;
      const dz = m.position.z;
      const rx = (reeling ? 1.15 : 0.95) * size + 0.32;
      const ry = (reeling ? 0.85 : 0.62) * size + 0.3;
      if (Math.abs(dx) < rx && Math.abs(dy) < ry && Math.abs(dz) < 1.0) {
        if (reeling) {
          if (f.junk) continue;
          catchOne(f, false);
        } else if (f.junk) {
          f.caught = true;
          f.mesh.visible = false;
          sfx.junk();
          kick(0.8, 50, 0);
          flash('rgba(120, 110, 100, 0.45)');
          announce('SKRÄP!', f.sp.name, 'bad');
          spray.burst(m.position.x, m.position.y, 0, 14, 2.5, { cell: CELL.DOT, color: 0x6a6a5a, grav: -1, size: 0.18, life: 0.9 });
          hookAt(null, 'junk');
          return;
        } else {
          hookAt(f, 'fish');
          return;
        }
      } else if (!reeling && !f.dodged && !f.junk && dy > ry + 0.1 && dy < 3.2 && Math.abs(dx) < 3.4) {
        onDodge(f, dx, rx); // slipped past above us
      }
    }
  }

  /**
   * The line from the rod tip to (lx, ly, lz). Each node relaxes toward its
   * neighbours' midpoint, so the line lags and swings; `sag` pulls every
   * node down a little, which settles into a gentle catenary-like belly.
   */
  function updateLine(dt, lx, ly, lz, sag = 0) {
    const { nodes, segments } = line.userData;
    nodes[0].copy(rodTip);
    nodes[segments].set(lx, ly, lz);
    if (!line.userData.live) {
      // Just shown: start straight instead of whipping in from old positions
      for (let i = 1; i < segments; i++) nodes[i].lerpVectors(nodes[0], nodes[segments], i / segments);
      line.userData.live = true;
    }
    const k = Math.min(1, dt * 26);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < segments; i++) {
        const prev = nodes[i - 1];
        const next = nodes[i + 1];
        const n = nodes[i];
        n.x += ((prev.x + next.x) * 0.5 - n.x) * k;
        n.y += ((prev.y + next.y) * 0.5 - sag - n.y) * k;
        n.z += ((prev.z + next.z) * 0.5 - n.z) * k;
      }
    }
    const arr = line.geometry.attributes.position.array;
    for (let i = 0; i <= segments; i++) {
      arr[i * 3] = nodes[i].x;
      arr[i * 3 + 1] = nodes[i].y;
      arr[i * 3 + 2] = nodes[i].z;
    }
    line.geometry.attributes.position.needsUpdate = true;
  }

  function updateZone() {
    let z = 0;
    for (let i = 0; i < ZONES.length; i++) if (state.depth >= ZONES[i].at) z = i;
    if (z === state.zone) return;
    state.zone = z;
    hud.zoneDepth.textContent = `${ZONES[z].at} m`;
    hud.zoneName.textContent = ZONES[z].name;
    hud.zoneSub.textContent = ZONES[z].sub;
    replay(hud.zone, 'show');
    if (z > 0) {
      sfx.zone(z);
      // Crossing into a new zone: a ring of light where the lure breaks
      // through, like sinking through the thermocline
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        glow.emit({
          x: state.lureX + Math.cos(a) * 0.4, y: -state.depth, z: Math.sin(a) * 0.4,
          vx: Math.cos(a) * 4, vz: Math.sin(a) * 2, drag: 2.5, life: 0.7, size: 0.2, color: 0x9ff3ee
        });
      }
    }
    later(() => hud.zone.classList.remove('show'), 2200);
  }

  let camOverride = null; // test hook: { pos, look } pins the camera

  function updateCamera(dt, rdt) {
    if (camOverride) {
      camera.position.fromArray(camOverride.pos);
      camera.lookAt(lookAt.fromArray(camOverride.look));
      return;
    }
    const surfaceAbove = state.phase === 'idle' || state.phase === 'over';
    if (surfaceAbove) {
      camGoal.fromArray(frame.idleCam);
      lookGoal.fromArray(frame.idleLook);
      camGoal.x += boat.position.x;
      lookGoal.x += boat.position.x;
    } else if (state.phase === 'toss') {
      camGoal.set(boat.position.x, 3.6, 15.5);
      lookGoal.set(boat.position.x, 2.7, 0.4);
      // Slow motion leans in on the last fish
      const lastF = state.slowOn ? state.caught.find((f) => f.air && !f.air.done) : null;
      if (lastF) lookGoal.lerp(lastF.mesh.position, 0.35);
    } else if (state.phase === 'between') {
      // Lift off the water and put the boat in frame — the round card reads
      // over a wide shot, and the throw that follows needs the rod visible.
      camGoal.fromArray(frame.betweenCam);
      camGoal.x += boat.position.x;
      const at = state.castOut ? (boat.position.x + state.castOut.x) * 0.5 : boat.position.x + 0.9;
      lookGoal.set(at, state.castOut ? 1.4 : 1.9, 0);
    } else {
      // Descending, the lure rides in the upper third so you see what is
      // coming; reeling up, the lower third. The lead scales with speed so
      // the camera's lag never drags the lure to the edge.
      const lead = (state.targetX - state.lureX) * 0.25;
      const down = state.phase === 'drop';
      const yCam = down ? 1.2 : 2.8;
      const yLook = down ? -3.0 - state.dropSpeed * 0.12 : 2.2;
      camGoal.set(state.lureX * frame.follow + lead, -state.depth + yCam, frame.dist);
      lookGoal.set(state.lureX * frame.look, -state.depth + yLook, 0);
    }
    const sx = Math.min(1, rdt * 3.2);
    const sy = Math.min(1, rdt * ((state.phase === 'drop' || state.phase === 'reel') ? 9 : 3.2));
    camera.position.x += (camGoal.x - camera.position.x) * sx;
    camera.position.y += (camGoal.y - camera.position.y) * sy;
    camera.position.z += (camGoal.z - camera.position.z) * sx;
    lookAt.x += (lookGoal.x - lookAt.x) * Math.min(1, rdt * 4.5);
    lookAt.y += (lookGoal.y - lookAt.y) * Math.min(1, rdt * (sy > sx ? 9 : 4.5));
    lookAt.z += (lookGoal.z - lookAt.z) * Math.min(1, rdt * 4.5);

    if (shake.power > 0.001) {
      shake.power = Math.max(0, shake.power - dt * 4.2);
      const a = shake.power * 0.22;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
    }
    camera.lookAt(lookAt);

    const slowZoom = state.slowOn ? -5 : 0;
    const want = baseFov + fovPunch + slowZoom * (1 - state.slow) / 0.68;
    if (fovPunch > 0.01) fovPunch = Math.max(0, fovPunch - dt * 26);
    if (Math.abs(camera.fov - want) > 0.01) {
      camera.fov += (want - camera.fov) * Math.min(1, rdt * 12);
      camera.updateProjectionMatrix();
      updatePointScale();
    }
  }

  function updateAtmosphere(t) {
    const d = Math.max(0, state.depth);
    const k = Math.min(1, d / 52);
    // The eye decides: is the camera under the actual wave at its spot?
    const under = camera.position.y < waveHeight(camera.position.x, camera.position.z, t) - 0.05;
    // How far below the surface the CAMERA is drives the grading, so the
    // look follows what you see, not where the lure is
    const eyeD = under ? Math.max(0, -camera.position.y) : 0;
    const ke = Math.min(1, eyeD / 52);

    if (under) {
      gradient(MID_STOPS, eyeD, scene.fog.color);
      gradient(UP_STOPS, eyeD, WATER_FOG.uFogUp.value);
      gradient(DOWN_STOPS, eyeD, WATER_FOG.uFogDown.value);
      scene.fog.density = 0.017 + ke * 0.034;
    } else {
      scene.fog.color.set(0xa9bccb);
      WATER_FOG.uFogUp.value.copy(scene.fog.color);
      WATER_FOG.uFogDown.value.copy(scene.fog.color);
      scene.fog.density = 0.0009;
    }
    scene.background.copy(scene.fog.color);

    eyeUnder = under;
    sky.dome.visible = !under && heavy;
    shore.visible = !under;
    volume.mesh.visible = under && heavy;
    basin.visible = under;
    kelp.visible = under;
    seabed.visible = under && eyeD > 30;
    snow.points.visible = under && heavy;
    // Nobody can see the angler from down there (the surface hides him)
    angler.person.root.visible = !under;

    // The volume is a direction lookup: keep it centred on the eye, or its
    // gradient drifts off the fog's as the camera sinks
    volume.mesh.position.copy(camera.position);
    WATER_FOG.uFogMid.value.copy(scene.fog.color);
    gradient(RAY_STOPS, eyeD, volume.uniforms.uRay.value);
    volume.uniforms.uRayStr.value = 0.55 - ke * 0.42;

    water.uniforms.uFogColor.value.copy(scene.fog.color);
    water.uniforms.uFogDensity.value = scene.fog.density;
    water.uniforms.uDeepTint.value.copy(under ? WATER_FOG.uFogDown.value : tmpColor.set(0x0b4658));
    water.uniforms.uCausticStrength.value = 1 - k * 0.55;

    hemi.intensity = (under ? 1.15 : 1.05) + envBoost - ke * 0.78;
    sun.intensity = under ? 1.7 - ke * 1.45 : 2.4;
    sun.position.copy(under ? SUN_UNDER : SUN_DIR).multiplyScalar(60);
    sun.color.set(under ? 0xffe3b6 : 0xffc68c);
    fill.intensity = under ? 0 : 0.85;
    if (under) {
      hemi.color.copy(gradient(UP_STOPS, eyeD, tmpColor)).lerp(tmpColor2.set(0xffffff), 0.5);
      hemi.groundColor.copy(WATER_FOG.uFogDown.value);
    } else {
      hemi.color.set(0xe4dcec);
      hemi.groundColor.set(0x22404c);
    }
    scene.environmentIntensity = under ? 0.9 - ke * 0.6 : 1;
    renderer.toneMappingExposure = 1.12 + ke * 0.12;
    lureGlow = 0.7 + k * 2.4;

    // The shafts follow the descent, so there is always something raking
    // through the water instead of an empty void below 20 m — they just
    // get dimmer and bluer the deeper you go. +16 keeps their bright top
    // edge above the frame; they belong under the surface only.
    shafts.mesh.position.y = -eyeD * 0.82 + 16;
    shafts.uniforms.uStrength.value = Math.max(0, 0.34 - ke * 0.26);
    gradient(RAY_STOPS, eyeD, shafts.uniforms.uColor.value);
    shafts.mesh.visible = heavy && under && shafts.uniforms.uStrength.value > 0.01;

    // Marine snow: green-gold in the lit shallows, cold blue in the deep
    snow.uniforms.uCam.value.copy(camera.position);
    snow.uniforms.uColor.value.set(0xd8f0d0).lerp(tmpColor.set(0x9fc8ff), ke);
    snow.uniforms.uOpacity.value = 0.32 + ke * 0.5;
  }

  /** The air phase: physics, glints, the tunna, and slow-mo for the last fish. */
  function updateToss(dt) {
    const top = barrelTop(barrelPos);
    let pending = null;
    let pendingN = 0;
    state.caught.forEach((f) => {
      const { air } = f;
      if (!air || air.done === true) return;
      if (air.done === 'hit' && f.mesh.position.y < top.y - 0.15 && Math.abs(f.mesh.position.x - top.x) < 1.1) {
        setVisible(f, false);
        air.done = true;
        state.tunnaN++;
        hud.tunnaN.textContent = String(state.tunnaN);
        replay(hud.tunna, 'bump');
        sfx.tunna(state.tunnaN);
        boat.userData.barrel.userData.squash = 1;
        angler.trigger('tunna');
        boatRock(-0.06, 0.14, -0.06); // a wet fish lands at the stern
        spray.burst(top.x, top.y + 0.2, top.z, 12, 3, { cell: CELL.DROP, color: 0xdff2ff, grav: -14, size: 0.1, life: 0.6, lift: 0.8 });
        return;
      }
      if (!air.done) {
        pending = f;
        pendingN++;
      }
      air.vy -= 20 * dt;
      air.x += air.vx * dt;
      air.y += air.vy * dt;
      air.z += (air.vz || 0) * dt;
      f.mesh.position.set(air.x, air.y, air.z);
      f.mesh.rotation.z += air.spin * dt;
      f.mesh.rotation.y = 0;
      f.amp = 0.9;
      f.phase += dt * TAU * 3.6;
      if (f.flash > 0) f.flash = Math.max(0, f.flash - dt * 4);
      // Water streaming off it, and the low sun catching its flank
      if (Math.random() < dt * 9) {
        spray.emit({
          x: air.x + (Math.random() - 0.5) * 0.4, y: air.y, z: air.z,
          vx: air.vx * 0.2, vy: air.vy * 0.2, grav: -18, life: 0.6, size: 0.06 + Math.random() * 0.08,
          cell: CELL.DROP, color: 0xdff4ff, alpha: 0.8
        });
      }
      air.glint -= dt;
      if (air.glint <= 0) {
        air.glint = 0.25 + Math.random() * 0.55;
        glow.emit({
          x: air.x + (Math.random() - 0.5) * f.sp.size, y: air.y + (Math.random() - 0.3) * f.sp.size * 0.5, z: air.z + 0.4,
          size: 1.1 + Math.random() * 0.9, size1: 0, life: 0.28, cell: CELL.GLINT, color: 0xfff1d0
        });
      }
      if (air.y < -1 && air.done === 'hit') {
        air.done = true; // missed the rim somehow — let it go quietly
        setVisible(f, false);
      } else if (air.y < -0.5 && air.done !== 'hit') {
        air.done = true;
        setVisible(f, false);
        state.tossLeft--;
        state.tapChain = 0;
        sfx.miss();
        sfx.splash(0.5);
        popScore('PLASK', f.mesh.position.clone().setY(0.4), 'miss');
        angler.trigger('miss');
        spray.burst(air.x, 0.1, air.z, 22, 4, { cell: CELL.DROP, color: 0xe8f6ff, grav: -16, size: 0.13, life: 0.9, lift: 1.2, drag: 0.3 });
        ripples.spawn(air.x, air.z, 2.4, 0.7, 1.3);
        if (state.tossLeft <= 0) finishToss();
      }
    });
    // The last fish in the air falls in slow motion
    const wantSlow = pendingN === 1 && pending && pending.air.vy < 1.5 && pending.air.y > 0.8;
    if (wantSlow && !state.slowOn) {
      state.slowOn = true;
      sfx.slowmo();
      hudHost.classList.add('fi-slow');
      setPhaseLabel('SISTA FISKEN!');
    } else if (!wantSlow && state.slowOn) {
      state.slowOn = false;
      hudHost.classList.remove('fi-slow');
    }
  }

  /* What the angler does, as a function of the game. Reused every frame. */
  const anglerCtx = { action: 'rest', crank: 0, load: 0, look: null, expr: null, idle: false, camera: null };
  const FACE = {
    easy: { smile: 0.35 },
    happy: { smile: 0.7 },
    proud: { grin: 0.6 },
    keen: { focus: 0.55 },
    hard: { focus: 1 },
    cheer: { grin: 0.85, shout: 0.35 }
  };
  /** The tunna's rim, in the world (the boat rocks, so it moves). */
  function barrelTop(out) {
    boat.userData.barrel.getWorldPosition(out);
    out.y += BARREL.h / 2;
    return out;
  }

  function anglerContext() {
    const c = anglerCtx;
    const p = state.phase;
    c.idle = false;
    c.crank = 0;
    c.load = 0.08;
    c.camera = camera.position;
    c.look = anglerLook;
    c.expr = FACE.easy;
    if (state.cheer > 0) {
      // A perfect cast or a record: he pumps the rod in the air
      c.action = 'cheer';
      c.look = camera.position;
      c.expr = FACE.cheer;
    } else if (p === 'drop' || p === 'reel') {
      c.action = p;
      anglerLook.set(state.lureX, 0, 0);
      if (p === 'reel') {
        c.crank = 2.6;
        c.load = Math.min(0.95, 0.5 + state.caught.length * 0.07);
        c.expr = FACE.hard;
      } else {
        c.load = 0.18;
        c.expr = FACE.keen;
      }
    } else if (p === 'toss') {
      // The catch erupts: heave the rod up, then follow the fish in the air
      const heave = state.tossT < 0.45;
      c.action = heave ? 'heave' : 'watch';
      c.load = heave ? 0.75 : 0.1;
      const f = state.caught.find((x) => x.air && !x.air.done);
      if (f) anglerLook.copy(f.mesh.position);
      else barrelTop(anglerLook);
      c.expr = FACE.happy;
    } else if (p === 'between') {
      anglerLook.set(0, 0.2, 0);
      if (state.castOut) {
        c.action = 'throw';
        anglerLook.set(state.castOut.x, state.castOut.y, state.castOut.z);
        c.expr = FACE.keen;
      } else if (state.betweenT > BETWEEN_HOLD - WIND_UP) {
        c.action = 'windup';
        c.expr = FACE.keen;
      } else {
        // Reel in the slack while the card is up, with a look to the camera
        c.action = 'rest';
        c.crank = state.betweenT < BETWEEN_HOLD - WIND_UP - 0.35 ? 1.6 : 0;
        if (state.betweenT < 0.9) c.look = camera.position;
        c.expr = FACE.happy;
      }
    } else {
      // Waiting in the menu, or done for the evening: watch the float
      c.action = 'rest';
      c.idle = true;
      c.look = bobberPos;
      c.expr = p === 'over' && progress.high === state.score && state.score > 0 ? FACE.proud : FACE.easy;
    }
    return c;
  }

  function updateBoat(dt, t) {
    // Ride the swell: the hull is a mass on the lake's own waves — it is
    // pulled toward the wave height and slope under it but carries its own
    // momentum, so it lags a beat behind the swell and rocks on when Erik
    // throws his weight about (boatRock). The dry mask keeps the lake out.
    const bx = boat.position.x;
    const h = waveHeight(bx, 0, t);
    const slopeX = (waveHeight(bx + 1.4, 0, t) - waveHeight(bx - 1.4, 0, t)) / 2.8;
    const slopeZ = (waveHeight(bx, 0.8, t) - waveHeight(bx, -0.8, t)) / 1.6;
    const hull = boatMotion;
    const n = Math.max(1, Math.ceil(dt / 0.012));
    const hdt = dt / n;
    for (let i = 0; i < n; i++) {
      hull.vy += ((h * 0.85 - hull.y) * 30 - hull.vy * 5.5) * hdt;
      hull.vp += ((Math.atan(slopeX) * 0.75 - hull.p) * 26 - hull.vp * 4.2) * hdt;
      hull.vr += ((-Math.atan(slopeZ) * 0.7 - hull.r) * 22 - hull.vr * 3.2) * hdt;
      hull.y += hull.vy * hdt;
      hull.p += hull.vp * hdt;
      hull.r += hull.vr * hdt;
    }
    boat.position.y = -WATERLINE + hull.y;
    boat.rotation.z = hull.p;
    boat.rotation.x = hull.r;
    const { foam, barrel, bobber } = boat.userData;
    foam.position.set(bx, h + 0.05, 0);
    foam.material.opacity = 0.06 + Math.sin(t * 2.2) * 0.02;
    const sq = barrel.userData.squash || 0;
    if (sq > 0) barrel.userData.squash = Math.max(0, sq - dt * 3.5);
    const wob = Math.sin((1 - sq) * 14) * sq;
    barrel.scale.set(1 + wob * 0.12, 1 - wob * 0.16, 1 + wob * 0.12);

    // The float, out past the bow, riding the same waves
    const fx = bx + 3.55;
    const fz = 0.55;
    bobberPos.set(fx, waveHeight(fx, fz, t) - 0.01, fz);
    bobber.position.copy(bobberPos);
    bobber.rotation.set(Math.sin(t * 1.7) * 0.12, 0, Math.sin(t * 1.3 + 1) * 0.14);

    if (state.cheer > 0) state.cheer = Math.max(0, state.cheer - dt);
    // Out of sight under the surface: no need to pose him
    if (!eyeUnder) {
      angler.update(dt, t, anglerContext());
      anglerAct = anglerCtx.action;
    }
  }

  /** Erik shifting his weight: roll (to his side), pitch (bow down) and heave impulses. */
  function boatRock(roll, pitch = 0, heave = 0) {
    boatMotion.vr += roll;
    boatMotion.vp += pitch;
    boatMotion.vy += heave;
  }

  /** The lure on a short line under the tip while the card is up: a pendulum. */
  const dangle = new THREE.Vector3();
  const danglePrev = new THREE.Vector3();
  const dangleTmp = new THREE.Vector3();
  let dangling = false;
  function updateDangle(dt) {
    if (!dangling) {
      dangle.copy(rodTip).y -= 0.5;
      danglePrev.copy(dangle);
      dangling = true;
    }
    // Verlet: carry the velocity, add gravity, then keep it on 0.5 m of line
    dangleTmp.copy(dangle);
    dangle.x += (dangle.x - danglePrev.x) * 0.985;
    dangle.y += (dangle.y - danglePrev.y) * 0.985 - 9.8 * dt * dt;
    dangle.z += (dangle.z - danglePrev.z) * 0.985;
    danglePrev.copy(dangleTmp);
    const d = dangleTmp.subVectors(dangle, rodTip);
    const len = d.length();
    if (len > 0.5) dangle.copy(rodTip).addScaledVector(d, 0.5 / len);
  }

  /* Adaptive resolution: if frames keep running long, step the pixel
     ratio down a notch (never up again this session — no oscillation). */
  let perfAcc = 0;
  let perfN = 0;
  function adapt(rawMs) {
    perfAcc += rawMs;
    perfN++;
    if (perfN < 120) return;
    const avg = perfAcc / perfN;
    perfAcc = 0;
    perfN = 0;
    if (avg > 26 && ratio > 1) {
      ratio = Math.max(1, ratio - 0.25);
      renderer.setPixelRatio(ratio);
      resize();
    }
  }

  let loonIn = 6;
  let frozen = null; // test hook: null = live, else the fixed dt per frame (0 = stopped)
  let vakIn = 2.5;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const rawMs = now - last;
    let dt = clampDt(rawMs);
    last = now;
    if (!running) return;
    adapt(rawMs);
    // Test hook: time can be frozen (or stepped by a fixed amount) so a
    // close-up can be taken mid-motion — the frame still renders
    if (frozen !== null) dt = frozen;
    const rdt = dt; // real time, for the camera and UI
    clockT = (clockT + rdt) % CLOCK_WRAP;
    const t = clockT;
    state.clock += dt;

    if (hitStop > 0) {
      hitStop -= dt;
      dt *= 0.12;
    }
    if (state.phase === 'toss') {
      state.slow += ((state.slowOn ? 0.32 : 0.8) - state.slow) * Math.min(1, rdt * 7);
      dt *= state.slow; // a touch of slow-mo to aim thumbs, a lot for the last fish
    }

    timeU.value = t;
    water.uniforms.uTime.value = t;
    sky.uniforms.uTime.value = t;
    volume.uniforms.uTime.value = t;
    shafts.uniforms.uTime.value = t;
    snow.uniforms.uTime.value = t;
    if (shore.visible) {
      shore.userData.vimpel.rotation.y = Math.sin(t * 2.3) * 0.3 + Math.sin(t * 5.1) * 0.08;
      shore.userData.birds.update(t);
    }
    seabed.userData.pokal.material.emissiveIntensity = 0.85 + Math.sin(t * 2.1) * 0.3;
    lilies.userData.update(t);

    updateBoat(dt, t);
    updateFish(dt, t);

    if (helpOpen || bookOpen) {
      // Card open: hold the game still but keep the lake alive
    } else if (state.phase === 'drop') {
      state.dropT += dt;
      state.dropSpeed = Math.min(15.5, state.dropSpeed + dt * 1.7);
      state.depth += state.dropSpeed * dt;
      if (keys.left) state.targetX = Math.max(-REACH, state.targetX - 13 * dt);
      if (keys.right) state.targetX = Math.min(REACH, state.targetX + 13 * dt);
      state.lureX += (state.targetX - state.lureX) * Math.min(1, dt * 6.5);
      state.deepest = Math.max(state.deepest, state.depth);
      state.rec.deepest = Math.max(state.rec.deepest, state.depth);
      sfx.reelTick(state.dropSpeed);
      // The lure trails a stream of bubbles
      if (state.depth > 1 && Math.random() < dt * (LITE ? 16 : 26)) {
        bubbles.emit({
          x: state.lureX + (Math.random() - 0.5) * 0.25, y: -state.depth + 0.25, z: (Math.random() - 0.5) * 0.2,
          vy: 0.8 + Math.random() * 1.6, life: 1.4 + Math.random(), size: 0.05 + Math.random() * 0.12,
          size1: 0.1 + Math.random() * 0.1, cell: CELL.BUBBLE, color: 0xdff8ff, wob: 0.35, alpha: 0.9
        });
        sfx.bubble();
      }
      // Learn by doing: if a new player has not steered after a moment,
      // show the gesture right where it is needed
      hud.hint.hidden = !(state.castNo === 1 && !state.steered && state.dropT > 1.1);
      updateZone();
      checkMission();
      if (state.depth >= BOTTOM) {
        state.depth = BOTTOM;
        hookAt(null, 'bottom');
      } else {
        collide(false);
      }
    } else if (state.phase === 'reel') {
      state.depth -= 16.5 * dt;
      if (keys.left) state.targetX = Math.max(-REACH, state.targetX - 13 * dt);
      if (keys.right) state.targetX = Math.min(REACH, state.targetX + 13 * dt);
      state.lureX += (state.targetX - state.lureX) * Math.min(1, dt * 7.5);
      sfx.reelTick(18);
      if (Math.random() < dt * 8) {
        bubbles.emit({
          x: state.lureX + (Math.random() - 0.5) * 0.6, y: -state.depth - 0.4, z: (Math.random() - 0.5) * 0.4,
          vy: 0.4 + Math.random(), life: 1, size: 0.06 + Math.random() * 0.08, cell: CELL.BUBBLE, color: 0xdff8ff, wob: 0.3
        });
      }
      collide(true);
      if (state.depth <= 0) {
        state.depth = 0;
        startToss();
      }
    } else if (state.phase === 'toss') {
      state.tossT += dt;
      updateToss(dt);
    } else if (state.phase === 'between') {
      state.betweenT += dt;
      if (state.betweenT >= BETWEEN_HOLD) {
        if (!state.castOut) {
          hideRoundCard();
          sfx.toss();
          // The lure leaves from where it swung to behind his shoulder
          const p0 = dangling ? dangle : rodTip;
          state.castOut = { x: p0.x, y: p0.y, z: p0.z, x0: p0.x, y0: p0.y, z0: p0.z };
          boatRock(0.1, -0.16, -0.05); // his weight goes into the throw
        }
        const c = state.castOut;
        const k = Math.min(1, (state.betweenT - BETWEEN_HOLD) / CAST_OUT);
        // Constant horizontal speed with a sine arc on top — the shape a
        // thrown lure actually traces — out over the bow to where it goes in
        c.x = c.x0 * (1 - k);
        c.y = c.y0 + (0.2 - c.y0) * k + Math.sin(Math.PI * k) * 2.3;
        c.z = c.z0 * (1 - k);
        if (k >= 1) {
          state.castOut = null;
          startCast();
        }
      }
    } else if (state.phase === 'idle' || state.phase === 'over') {
      // Sitting in the boat: now and then a storlom calls across the lake
      loonIn -= dt;
      if (loonIn <= 0) {
        loonIn = 14 + Math.random() * 16;
        sfx.loon();
      }
      // …and a fish rises somewhere out on the flat water: a plop and a
      // ring spreading through the reflections — the lake is alive
      vakIn -= dt;
      if (vakIn <= 0 && !eyeUnder) {
        vakIn = 4 + Math.random() * 8;
        const x = boat.position.x - 16 + Math.random() * 36;
        const z = -5 - Math.random() * 28;
        ripples.spawn(x, z, 1.4 + Math.random() * 0.8, 0.5, 2.0);
        later(() => ripples.spawn(x, z, 0.9, 0.35, 1.5), 380);
        spray.burst(x, 0.12, z, 7, 1.6, { cell: CELL.DROP, color: 0xe8f6ff, grav: -12, size: 0.07, life: 0.55, lift: 1.3, drag: 0.4 });
      }
    }

    /* Lure, line and the string of fish following it. Between casts the
       lure hangs under the rod tip; waiting in the menu, a float bobs out
       past the bow on the end of the line. */
    angler.tip(rodTip);
    const hanging = state.phase === 'between' && !state.castOut;
    if (hanging) updateDangle(dt);
    else dangling = false;
    let { lureX } = state;
    let lureY = -state.depth;
    let lureZ = 0;
    if (state.castOut) {
      ({ x: lureX, y: lureY, z: lureZ } = state.castOut);
    } else if (hanging) {
      ({ x: lureX, y: lureY, z: lureZ } = dangle);
      lureY -= 0.22;
    }
    lure.position.set(lureX, lureY, lureZ);
    // Underwater the lure is drawn big enough to steer by; in his hands, on
    // a short line under the rod tip, it is the size of a real spinner
    const lureK = hanging || state.castOut ? 0.5 : 1;
    lure.scale.setScalar(lure.scale.x + (lureK - lure.scale.x) * Math.min(1, dt * 7));
    lure.rotation.z = state.castOut ? t * 9 : hanging ? (dangle.x - rodTip.x) * 1.2 : (state.targetX - state.lureX) * -0.06;
    lure.userData.spinner.rotation.x = t * 12;
    const lureOn = state.phase === 'drop' || state.phase === 'reel' || !!state.castOut || hanging;
    const floatOn = (state.phase === 'idle' || state.phase === 'over') && !eyeUnder;
    lure.userData.show(lureOn, lureGlow);
    boat.userData.bobber.visible = floatOn;
    line.visible = lureOn || floatOn;
    if (!line.visible) line.userData.live = false;
    else if (lureOn) updateLine(dt, lureX, lureY + 0.22, lureZ);
    else updateLine(dt, bobberPos.x, bobberPos.y + 0.2, bobberPos.z, 0.004);

    if (state.phase === 'reel' || state.phase === 'drop') {
      // The catch hangs off the barb itself, not off the lure's centre: the
      // hook sits at (-0.28, -0.16) in the lure's own frame.
      const hookX = lureX - 0.28;
      let snoutY = lureY - 0.16;
      state.caught.forEach((f, i) => {
        const s = f.sp.size * 0.85;
        const nose = f.sp.profile.x(0) * s; // snout ahead of the mesh origin
        const back = 1.05 * s;              // tail fin behind it
        setVisible(f, true);
        f.mesh.scale.setScalar(s);
        if (f.flash > 0) f.flash = Math.max(0, f.flash - dt * 4);
        if (i === 0) {
          // Fish number one is *on* the hook. It is placed by its mouth, not
          // by its origin: pivoting a thrashing fish around its centre swings
          // the snout clean off the barb, which is exactly what looked wrong.
          const wz = Math.PI / 2 + Math.sin(t * 9.5) * 0.26 + Math.sin(t * 3.7) * 0.1;
          const wy = 0.3 + Math.sin(t * 6.1) * 0.55;
          f.mesh.rotation.set(0, wy, wz);
          const cz = Math.cos(wz);
          const goalX = hookX - nose * cz * Math.cos(wy);
          const goalY = snoutY - nose * Math.sin(wz);
          const goalZ = nose * cz * Math.sin(wy);
          const snap = Math.min(1, dt * 20);
          f.mesh.position.x += (goalX - f.mesh.position.x) * snap;
          f.mesh.position.y += (goalY - f.mesh.position.y) * snap;
          f.mesh.position.z += (goalZ - f.mesh.position.z) * snap;
          f.amp = 1.0; // fighting the line
          f.phase += dt * TAU * 4.2;
        } else {
          // Everything after it is strung below on the stringer, each one
          // lagging a little more so the whole chain swings.
          const lag = Math.min(1, dt * (7 - Math.min(4, i * 0.5)));
          const sway = Math.sin(t * 2.2 + i * 0.8) * 0.26;
          f.mesh.position.x += (hookX + sway - f.mesh.position.x) * lag;
          f.mesh.position.y += (snoutY - nose - f.mesh.position.y) * Math.min(1, dt * 9);
          f.mesh.position.z += (0.35 - f.mesh.position.z) * Math.min(1, dt * 6);
          f.mesh.rotation.set(0, 0.5, Math.PI / 2 + Math.sin(t * 4 + i) * 0.2);
          f.amp = 0.6;
          f.phase += dt * TAU * (2 + (i % 3) * 0.3);
        }
        snoutY -= nose + back + 0.24; // where the next snout hangs
      });
    }

    // Underwater the glow drifts up; in the air over the boat it falls.
    glow.gravity = state.phase === 'toss' ? -7 : 1.4;
    glow.update(dt, t);
    bubbles.update(dt, t);
    spray.update(dt, t);
    ripples.update(dt);
    shoal.sync();
    updateCamera(dt, rdt);
    updateAtmosphere(t);
    sfx.setDepth(state.depth, BOTTOM, !(camera.position.y < -0.3));

    hud.depth.textContent = `${Math.round(state.depth)} m`;
    const gaugeOn = state.phase === 'drop' || state.phase === 'reel';
    hud.gauge.classList.toggle('show', gaugeOn);
    if (gaugeOn) {
      hud.gaugeLure.style.top = `${(state.depth / BOTTOM) * 100}%`;
      hud.gaugeDeep.style.height = `${(state.rec.deepest / BOTTOM) * 100}%`;
    }
    hudHost.style.setProperty('--deep', (Math.max(0, -camera.position.y) / BOTTOM).toFixed(3));
    renderer.render(scene, camera);
    watchdog.afterFrame();
  }

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);

  renderCasts();
  renderBook(hud, progress, SPECIES, speciesSvg, fmt, fmtKg);
  if (progress.high > 0) {
    hud.catchlist.hidden = false;
    hud.catchlist.innerHTML = `<b>Rekord</b><span>${fmt(progress.high)}</span>`;
  }
  hud.overlay.classList.add('show');
  hudHost.classList.add('fi-menu');
  spawnFishSet();
  shoal.sync();

  /*
   * Compile every program now, behind the site's loading card, and without
   * blocking: on Windows, Chrome and Edge translate WebGL to Direct3D 11,
   * whose compiler is slow on heavy materials, and one big synchronous
   * burst can trip the GPU watchdog and leave a black canvas for good.
   * Everything hidden at the start — the underwater world, the lure, the
   * angler's heavier variants — is shown for the call, so nothing compiles
   * mid-dive.
   */
  updateAtmosphere(0);
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  if (!heavy) [sky.dome, volume.mesh, shafts.mesh, snow.points].forEach((o) => { o.visible = false; });
  await precompile(renderer, scene, camera);
  hidden.forEach((o) => {
    o.visible = false;
  });
  updateAtmosphere(0);
  last = performance.now();
  raf = requestAnimationFrame(tick);

  /* Deterministic hooks for automated tests */
  window.__ppFiske = {
    state,
    scene,
    camera,
    renderer,
    progress,
    startGame,
    forceHook() {
      if (state.phase === 'drop') hookAt(null, 'fish');
    },
    forceCatch(n = 3) {
      fishes
        .filter((f) => !f.caught && !f.deco && !f.junk)
        .slice(0, n)
        .forEach((f) => catchOne(f, false));
    },
    toSurface() {
      state.depth = 0.01;
    },
    toBottom() {
      state.depth = BOTTOM - 0.5;
    },
    /** Tap every airborne fish into the tunna, leaving `keep` in the air. */
    tapAll(keep = 0) {
      let left = state.caught.filter((f) => f.air && !f.air.done).length;
      state.caught.forEach((f) => {
        if (f.air && !f.air.done && left-- > keep) {
          f.air.done = 'hit';
          state.tossLeft--;
          state.rec.tapped++;
          addScore(Math.round(f.sp.pts * state.mult));
        }
      });
      if (state.tossLeft <= 0) finishToss();
    },
    /** Snap the camera to where it is heading — for screenshots. */
    settle() {
      for (let i = 0; i < 40; i++) updateCamera(0.05, 0.05);
    },
    skipBetween() {
      skipCard();
    },
    /**
     * Freeze the game clock (dt = 0 every frame), or step it by a fixed dt
     * per frame; freeze(false) goes live again. Rendering carries on.
     */
    freeze(on = true, step = 0) {
      frozen = on ? step : null;
    },
    /** Metres between the left hand's grip and the crank knob (≈0 when it holds it). */
    crankGap() {
      const hold = angler.person.sockets.holdL;
      if (!hold) return null;
      const a = hold.getWorldPosition(new THREE.Vector3());
      const b = angler.knob.getWorldPosition(new THREE.Vector3());
      return { gap: a.distanceTo(b), ...angler.dbg };
    },
    /** Pin the camera (world position and look-at point, arrays); null releases. */
    pinCamera(pos, look) {
      camOverride = pos ? { pos, look } : null;
    },
    openBook(open = true) {
      setBook(open);
    },
    fishes,
    /** Distance from the barb to the hooked fish's snout, in world units. */
    hookGap() {
      const f = state.caught[0];
      if (!f || !f.visible) return null;
      f.mesh.updateMatrixWorld();
      lure.updateMatrixWorld();
      const snout = f.mesh.localToWorld(new THREE.Vector3(f.sp.profile.x(0), 0, 0));
      const barb = lure.localToWorld(new THREE.Vector3(-0.28, -0.16, 0));
      return snout.distanceTo(barb);
    },
    roundCardVisible() {
      return !hud.round.hidden && hud.round.classList.contains('show');
    },
    angler,
    boat,
    /** What the angler is doing, and where his rod tip is. */
    anglerState() {
      const tip = angler.tip(new THREE.Vector3());
      return { action: anglerAct, visible: angler.person.root.visible, tip: tip.toArray() };
    },
    /** The graphics guard: heavy effects on? which step has the watchdog reached? */
    gfx() {
      return { heavy, level: watchdog.level, safe: gfx.safe, floatRT: gfx.floatRT };
    },
    info() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        fish: fishes.length,
        pixelRatio: ratio
      };
    }
  };

  /* ---- Teardown ------------------------------------------------------- */
  function destroy() {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    canvasHost.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    clearTimeout(state.lastToast);
    state.timers.forEach(clearTimeout);
    delete window.__ppFiske;

    gfx.dispose();
    watchdog.dispose();
    angler.dispose(); // before the traverse below: people share materials
    clearFish();
    shoal.dispose();
    [glow, bubbles, spray].forEach((p) => p.dispose());
    ripples.dispose();
    plainWater.dispose();
    fancyWater.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
      if (o.isInstancedMesh) o.dispose();
    });
    disposeAssets();
    shore.userData.dispose();
    caustics.dispose();
    noise.dispose();
    atlas.dispose();
    if (envRT) envRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (sfx.ctx) sfx.ctx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createFishing;

/* Species and junk tables are exported for the tests and the README. */
export { SPECIES, JUNK };
