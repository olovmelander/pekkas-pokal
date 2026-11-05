/**
 * Pekkas Lerskulptur — the 2026 competition as a Three.js pottery game.
 *
 * The design borrows its loop from the most loved pottery game on mobile
 * (Let's Create! Pottery) and from what actually happened in Barcelona:
 * a keramiker set the task and judged the results. So:
 *
 *   1. The keramikern shows a form — its ghost silhouette hangs over the
 *      wheel, and a coloured band shows the live difference to your wall.
 *   2. You THROW: the wheel spins, and dragging against the clay pushes
 *      it in or pulls it out at that height, like a palm and a rib tool.
 *      Yank too hard and the clay goes off-centre. A likeness meter with
 *      star marks answers the only question that matters — "is this
 *      starting to look like it?"
 *   3. The piece is cut off the wheel and FIRED: the kiln door slams, the
 *      controller climbs to 1 240 °C, embers pour from the flue — and the
 *      piece comes out glowing, cools into its glaze and is judged in
 *      points, stars and words. It ends up in the window. Three pieces make
 *      an evening; six stars earn a fourth — the Pokal itself, in gold.
 *
 * Rendering: a PBR studio lit by the evening sun THROUGH its window (the
 * wall is a real shadow caster), a procedural environment map, wet clay as
 * a physical material with per-band wetness and throwing rings, glossy PBR
 * glazes, bloom and a heat-haze pass while the kiln fires. Everything is
 * procedural; the only download is Three.js itself.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { guardRenderer, postTarget, addSanitize, RenderWatchdog, gfxNotice, precompile } from '../shared/gfx.js';
import { Sfx } from './audio.js';
import { N, H, R_MIN, R_MAX, WALL, ClayBody, ringMaps, glazeMaps, clayMaterial, glazeMaterial } from './clay.js';
import { mulberry, buildStudio, buildWheel, buildSponge, buildEnvScene, disposeScene } from './studio.js';
import { buildPotterHand } from './hand.js';
import { buildFx, HeatHazeShader } from './fx.js';
import { buildGuide } from './guide.js';
import { buildHud, drawDiff, silhouetteSvg, starsHtml } from './hud.js';
import { createKeramiker } from './keramiker.js';

export const layout = 'full';

const HIGHSCORE_KEY = 'pp-lera-highscore';
const BEST_KEY = 'pp-lera-best';
const PIECE_TIME = 75;
const STAR_AT = [0.6, 0.78, 0.9];
const BONUS_STARS = 6;

/* ------------------------------------------------------------- the tasks */

function profileOf(points) {
  // Smoothstep-interpolated radius over u in [0,1]
  return (u) => {
    const t = Math.min(1, Math.max(0, u));
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (t >= a[0] && t <= b[0]) {
        const k = (t - a[0]) / (b[0] - a[0] || 1);
        const s = k * k * (3 - 2 * k);
        return a[1] + (b[1] - a[1]) * s;
      }
    }
    return points[points.length - 1][1];
  };
}

const PIECES = [
  {
    id: 'skal',
    name: 'Skålen',
    brief: 'En öppen skål — bred mun, mjuk buk, stadig fot.',
    glaze: { color: 0xd89a2c, rim: 0x6e3414, metal: false, tex: 'speckle' },
    css: '#d4952f',
    glazeName: 'honungsglasyr',
    profile: profileOf([[0, 0.62], [0.14, 0.5], [0.35, 0.62], [0.7, 0.95], [1, 1.18]])
  },
  {
    id: 'vas',
    name: 'Vasen',
    brief: 'En klassisk vas — fyllig buk, smal hals, liten läpp.',
    glaze: { color: 0x163f8e, rim: 0x8a6a52, metal: false, tex: 'mottle' },
    css: '#3d6fc0',
    glazeName: 'koboltglasyr',
    profile: profileOf([[0, 0.58], [0.16, 0.82], [0.38, 1.02], [0.62, 0.62], [0.82, 0.34], [0.93, 0.36], [1, 0.5]])
  },
  {
    id: 'amfora',
    name: 'Amforan',
    brief: 'En amfora som på museet — hög buk, lång smal hals, utsvängd mynning.',
    glaze: { color: 0x86b496, rim: 0xd9e4cf, metal: false, tex: 'crackle' },
    css: '#8fc4a0',
    glazeName: 'seladonglasyr',
    profile: profileOf([[0, 0.4], [0.1, 0.62], [0.3, 1.08], [0.52, 0.92], [0.74, 0.3], [0.9, 0.26], [1, 0.56]])
  }
];

/** Earned with six stars: Pekkas Pokal itself, thrown and lustred in gold. */
const BONUS = {
  id: 'pokal',
  name: 'Pokalen',
  brief: 'Pekkas Pokal i lera — bred fot, smal stjälk, en bägare som öppnar sig.',
  glaze: { color: 0xe0ac3c, rim: 0xf6d98a, metal: true },
  css: '#f2c14e',
  glazeName: 'guldlyster',
  profile: profileOf([[0, 0.7], [0.1, 0.56], [0.24, 0.26], [0.42, 0.26], [0.62, 0.66], [0.84, 1.02], [1, 1.16]])
};

const VERDICTS = [
  [0.93, 10, 'Perfekte! Den här ställer vi i fönstret.'],
  [0.86, 9, 'Keramikern nickar länge och gillande.'],
  [0.78, 8, 'Fin kurva. Nästan som förlagan.'],
  [0.68, 6, 'Godkänt — in i ugnen med den.'],
  [0.55, 4, 'Hm. Rustik. Vi säger rustik.'],
  [0.4, 3, 'Formen finns där inne någonstans.'],
  [0, 1, 'Picasso var också missförstådd i början.']
];

const TITLES = [
  [11, 'Keramikerns favorit', 'Pokalen i guld och tre alster i fönstret. Barcelona har en ny mästare.'],
  [9, 'Mästardrejare', 'Keramikern tar fram kameran. Sånt händer inte varje kväll.'],
  [7, 'Drejare', 'Händerna har förstått leran. Formen följer med.'],
  [5, 'Gesäll', 'Stadiga alster med några rustika undantag.'],
  [3, 'Lärling', 'Det börjar likna något. En vända till?'],
  [0, 'Lerkladdare', 'Tre alster i fönstret och lera överallt. En vända till?']
];

/* The piece shrinks into the kiln (clay shrinks when fired — a little less than this) */
const KILN_SCALE = 0.36;
const REVEAL_SCALE = 0.3;

/* The reveal camera's approach to the banding wheel (keramikern stands on its far side) */
const DIR_REVEAL = new THREE.Vector3(-0.42, 0.2, 1);

/* Firing timeline, seconds from KLAR */
const FIRE = { lift: 0.35, fly: 1.25, close: 1.65, heat: 3.95, open: 4.35, slide: 5.05, cool: 6.55 };

/**
 * Frame delta, clamped at BOTH ends. Only clamping the top looks harmless
 * until a queued rAF fires with a timestamp older than the one stashed on
 * visibilitychange: dt goes negative, and every `x -= rate * dt` in the
 * loop starts running backwards — fades brighten, scales invert.
 */
function clampDt(ms) {
  return Math.max(0, Math.min(0.05, ms / 1000));
}

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function starsFor(match) {
  return STAR_AT.filter((s) => match >= s).length;
}

function verdictFor(match) {
  for (const [minMatch, points, words] of VERDICTS) {
    if (match >= minMatch) return { grade: points, words };
  }
  return { grade: 1, words: '' };
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch (e) {
    /* private mode */
  }
}

/**
 * Fit a directional light's shadow camera tightly around a box. Anything
 * outside the shadow frustum counts as SUNLIT — and in this studio the sun
 * may only ever get in through the window — so the frustum must hold the
 * whole room, walls and floor, whatever the sun's angle.
 */
function fitShadowCamera(light, box) {
  const cam = light.shadow.camera;
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  // Same placement three uses when it renders the shadow map
  cam.position.setFromMatrixPosition(light.matrixWorld);
  cam.lookAt(new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld));
  cam.updateMatrixWorld();
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const p = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    p.applyMatrix4(cam.matrixWorldInverse);
    lo.min(p);
    hi.max(p);
  }
  cam.left = lo.x;
  cam.right = hi.x;
  cam.bottom = lo.y;
  cam.top = hi.y;
  cam.near = Math.max(0.1, -hi.z - 0.5);
  cam.far = -lo.z + 0.5;
  cam.updateProjectionMatrix();
}

/** Dispose every texture a material holds, including shader uniforms. */
function disposeMaterial(m) {
  Object.values(m).forEach((v) => {
    if (v && v.isTexture) v.dispose();
  });
  if (m.uniforms) {
    Object.values(m.uniforms).forEach((u) => {
      if (u.value && u.value.isTexture) u.value.dispose();
    });
  }
  m.dispose();
}

/* ------------------------------------------------------------------- game */

export async function createClay(container) {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui lr-ui';
  hudHost.dataset.phase = 'idle'; // before the first frame, so CSS starts in the right state
  container.appendChild(hudHost);
  const hud = buildHud(hudHost);

  const sfx = new Sfx();
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  // Controls are taught where they are used: key hints for mouse users,
  // a finger hint for touch
  if (!coarsePointer) {
    hud.smoothKey.textContent = 'håll G';
    hud.doneKey.textContent = 'Enter';
    hud.skip.textContent = 'Klicka eller mellanslag för att snabbspola';
  }
  const COACH = coarsePointer
    ? 'Dra fingret mot leran — inåt trycker, utåt drar. Håll GLÄTTA för att jämna.'
    : 'Dra med musen mot leran — inåt trycker, utåt drar · håll G glättar · Enter bränner';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /*
   * Quality tier: phones get a lighter pixel ratio, no MSAA, smaller
   * shadows. A low memory figure alone is no reason to drop MSAA — Chrome
   * reports 4 GB on plenty of ordinary laptops — so it only trims the pixel
   * ratio; the frame-time guard further down does the rest if needed.
   */
  const smallScreen = Math.min(window.screen?.width || 1e4, window.screen?.height || 1e4) < 820;
  const mem = navigator.deviceMemory || 8;
  const lowTier = (coarsePointer && smallScreen) || mem <= 2;
  const maxRatio = lowTier || mem <= 4 ? 1.5 : 2;

  // ?gfx=safe renders straight to the canvas (see shared/gfx.js); that path
  // has no composer MSAA, so the canvas gets its own antialiasing instead
  const safeFlag = (() => {
    try {
      return (new URLSearchParams(location.search).get('gfx') || localStorage.getItem('pp-gfx')) === 'safe';
    } catch (e) {
      return false;
    }
  })();
  const renderer = new THREE.WebGLRenderer({ antialias: safeFlag, powerPreference: 'high-performance' });
  let baseRatio = Math.min(window.devicePixelRatio || 1, maxRatio);
  renderer.setPixelRatio(baseRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvasHost.appendChild(renderer.domElement);
  // Riktiga grafikkretsar är strängare än testmiljöns (se shared/gfx.js)
  const gfx = guardRenderer(renderer, container);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x160e09);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  camera.position.set(0, 2.6, 8);
  // Stage shape, kept by resize(); the camera frames everything from it
  const view = { aspect: 1, portrait: false, tan: Math.tan(THREE.MathUtils.degToRad(19)) };
  // Free screen region (fractions: x0, x1, y0 from the top, y1) beside the summary card
  const summaryFree = new THREE.Vector4(0, 0.6, 0, 1);
  // ...and the one the verdict card leaves (on a phone held upright: above it)
  const verdictFree = new THREE.Vector4(0, 1, 0.1, 0.5);
  let verdictBelow = true;

  /* ---- World ------------------------------------------------------------ */

  const studio = buildStudio();
  scene.add(studio.group);
  const wheel = buildWheel();
  scene.add(wheel.group);

  /*
   * Environment: the studio's own light, baked once through PMREM. PMREM
   * renders into half-float targets; a GPU that cannot draw into those
   * would bake a black map, so it goes without one and gets a stronger
   * sky fill instead (below).
   */
  let envRT = null;
  if (gfx.floatRT) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = buildEnvScene(studio.window);
    envRT = pmrem.fromScene(envScene, 0.035);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.6;
    disposeScene(envScene);
    pmrem.dispose();
  }

  /* ---- Lights: one dominant, a couple of fills, accents ---------------- */

  // DOMINANT: the evening sun, entering only through the window
  const sun = new THREE.DirectionalLight(0xffbf80, 6.0);
  const sunTarget = new THREE.Vector3(0, 1.2, 0);
  sun.position.copy(sunTarget).addScaledVector(studio.sunDir, -24);
  sun.target.position.copy(sunTarget);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowTier ? 1024 : 2048, lowTier ? 1024 : 2048);
  fitShadowCamera(sun, studio.room);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // FILLS: cool sky from above, warm front fill from the potter's side
  const hemi = new THREE.HemisphereLight(0xa8b8d8, 0x5a3622, envRT ? 0.38 : 0.85);
  scene.add(hemi);
  const front = new THREE.DirectionalLight(0xffe6c8, 0.7);
  front.position.set(3, 4, 9);
  scene.add(front);

  // ACCENTS: the pendant over the wheel, and a roaming light for the kiln,
  // the reveal and the window display
  const pendant = new THREE.PointLight(0xffc684, 5.5, 9, 2);
  pendant.position.copy(studio.lampPos);
  scene.add(pendant);
  const accent = new THREE.PointLight(0xff7a20, 0, 7, 2);
  scene.add(accent);

  /* ---- The clay ---------------------------------------------------------- */

  const maps = ringMaps();
  const glazeTex = glazeMaps(maps);
  const body = new ClayBody();
  const clayMat = clayMaterial(maps, lowTier);

  const clayGroup = new THREE.Group(); // moves (wheel → kiln)
  clayGroup.position.y = wheel.headY;
  scene.add(clayGroup);
  const tilt = new THREE.Group(); // off-centre wobble
  clayGroup.add(tilt);
  const clay = new THREE.Mesh(body.geometry, clayMat);
  clay.castShadow = true;
  clay.receiveShadow = true;
  tilt.add(clay);

  // Contact occlusion where the foot meets the wheel head: real shadows do
  // the rest, but nothing else darkens that crease
  const contact = (() => {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const c2 = cv.getContext('2d');
    const rg = c2.createRadialGradient(32, 32, 12, 32, 32, 32);
    rg.addColorStop(0, 'rgba(20,10,4,0.7)');
    rg.addColorStop(1, 'rgba(20,10,4,0)');
    c2.fillStyle = rg;
    c2.fillRect(0, 0, 64, 64);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.003;
    m.renderOrder = 3;
    return m;
  })();
  clayGroup.add(contact);

  const r = new Float32Array(N);
  const startLump = (u) => 0.68 - 0.3 * u ** 1.4;
  function resetLump() {
    for (let j = 0; j < N; j++) r[j] = startLump(j / (N - 1));
    body.ring.fill(0.7);
    body.wet.fill(0.85);
  }
  resetLump();
  body.update(r);

  /* The guide plane (ghost, diff, chevrons) and the hands live facing the camera */
  const guide = buildGuide();
  guide.group.position.y = wheel.headY;
  scene.add(guide.group);
  clayGroup.add(guide.ring);
  const potter = buildPotterHand();
  const hand = potter.group;
  hand.visible = false;
  guide.group.add(hand);
  const sponge = buildSponge();
  sponge.visible = false;
  guide.group.add(sponge);
  // The guide draws without depth test, over everything; the hand and the
  // sponge are IN FRONT of it, so they join the transparent pass (fully
  // opaque, still depth-tested against the clay) and draw after it
  [potter.mesh, sponge].forEach((m) => {
    m.material.transparent = true;
    m.renderOrder = 40;
  });

  /* ---- Keramikern -------------------------------------------------------- */

  // He waits by the kiln while you throw, and judges from the far side of
  // the banding wheel, facing the reveal camera — stepped a little to its
  // left so a wide piece does not hide him, and clear of the piece's flight
  // from the kiln, which lands from the right
  const behind = new THREE.Vector3(-DIR_REVEAL.x, 0, -DIR_REVEAL.z).normalize();
  const camLeft = new THREE.Vector3(behind.z, 0, -behind.x);
  studio.group.updateMatrixWorld(true);
  const keramiker = createKeramiker({
    home: new THREE.Vector3(2.8, 0, -2.25),
    judge: studio.reveal.clone().setY(0).addScaledVector(behind, 0.8).addScaledVector(camLeft, 0.32),
    wheel: new THREE.Vector3(0, wheel.headY + 1, 0),
    banding: studio.reveal.clone().setY(studio.banding.position.y + 0.02),
    bandingRadius: 0.36,
    kilnDoor: studio.kiln.group.localToWorld(new THREE.Vector3(0, 1.2, 0.8)),
    // Beside the door on its free (left) side, clear of its swing, within reach of the handle
    kilnSpot: studio.kiln.group.localToWorld(new THREE.Vector3(-0.7, 0, 1.1)).setY(0),
    kilnHinge: studio.kiln.hinge,
    kilnHandle: studio.kiln.handle,
    kilnBack: studio.kiln.group.localToWorld(new THREE.Vector3(-1.25, 0, 0.95)).setY(0),
    // On the start screen he waits by the wheel, right of the lump, to welcome you
    greet: new THREE.Vector3(1.45, 0, -1.55)
  });
  scene.add(keramiker.root);
  const attention = new THREE.Vector3();
  const pieceMid = new THREE.Vector3();

  const fx = buildFx(scene);
  const seedRand = mulberry(71);
  function seedSplats() {
    fx.splats.reset((s) => {
      for (let i = 0; i < 46; i++) {
        const a = seedRand() * Math.PI * 2;
        const rad = 1.25 + seedRand() * 2.8;
        s.add(Math.cos(a) * rad, 0.004, Math.sin(a) * rad, 0.08 + seedRand() * 0.22, 0.8 + seedRand() * 0.35);
      }
    });
  }
  seedSplats();

  /* ---- Post: bloom for the window, bulbs and kiln; haze while firing ---- */

  const composer = new EffectComposer(renderer, postTarget(gfx, { samples: lowTier ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  addSanitize(composer);
  const haze = new ShaderPass(HeatHazeShader);
  haze.enabled = false;
  composer.addPass(haze);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.55, 0.88);
  composer.addPass(bloom);
  // UnrealBloomPass always draws into half-float targets of its own: skip it
  // where the GPU cannot render to those (the rest of the chain still runs)
  bloom.enabled = gfx.floatRT;
  composer.addPass(new OutputPass());
  // ?gfx=safe, eller vakten nedan: rita direkt utan efterbehandling
  let usePost = !gfx.safe;

  // Ateljén är aldrig mörk på riktigt — fyllnadsljusen bär rummet även om
  // solen skulle försvinna. Blir bilden ändå (nästan) svart på en krets
  // trappas grafiken ner: först förbi efterbehandlingen, sedan bort med
  // skuggorna. Utan skuggor lyser solen genom väggen, så den dämpas och
  // strålen genom fönstret släcks (den hör ihop med skuggan).
  const watchdog = new RenderWatchdog(
    renderer,
    [
      () => {
        usePost = false;
      },
      () => {
        renderer.shadowMap.enabled = false;
        sun.intensity *= 0.35;
        studio.shaft.visible = false;
        scene.traverse((o) => {
          if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
        });
      }
    ],
    // Ateljén är ljus till största delen; under en fjärdedel upplyst = fel
    { minLitFraction: 0.25, darkThreshold: 24, onStep: () => gfxNotice(container, 'Grafiken förenklades för att fungera på den här enheten.') }
  );

  /* ---- State ----------------------------------------------------------- */

  // Input state (the handlers are wired further down)
  let dragging = false;
  let smoothing = false;
  let keySmooth = false;
  let helpOpen = false;
  let shapingEnergy = 0;
  let hover = null;
  let brush = null; // {j, targetR, side, y}

  const state = {
    phase: 'idle', // idle | intro | throw | fire | judge | over
    slot: 0, // index into the evening's pieces
    pieces: PIECES.slice(),
    results: [],
    score: 0,
    shownScore: 0,
    match: 0,
    bestMatch: 0,
    stars: 0,
    timeLeft: PIECE_TIME,
    t: 0,
    wheelSpeed: 0,
    spin: 0,
    wobble: 0,
    wobbleWarned: false,
    coached: 0, // seconds of shaping so far; the hint goes once you have the feel
    fast: false,
    heat: 0,
    lastToast: 0,
    timers: []
  };

  let high = 0;
  try {
    high = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
  } catch (e) {
    high = 0;
  }
  const bests = readJson(BEST_KEY, {});
  const fmt = (n) => Math.round(n).toLocaleString('sv-SE');
  hud.hi.textContent = fmt(high);

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    state.timers.push(id);
    return id;
  };

  function toast(msg, big = false) {
    hud.toast.textContent = msg;
    hud.toast.className = `pb-toast show${big ? ' big' : ''}`;
    clearTimeout(state.lastToast);
    state.lastToast = setTimeout(() => {
      hud.toast.className = 'pb-toast';
    }, big ? 1800 : 1200);
  }

  function setPhaseLabel(txt) {
    hud.phase.textContent = txt;
    hud.phase.classList.toggle('show', !!txt);
  }

  const piece = () => state.pieces[state.slot];
  let ghostFlash = 0; // the target's ghost flares when a star is earned

  /* Fired pieces: the one in the kiln / on the stand, and the gallery */
  let fired = null; // { mesh, def }
  const gallery = [];

  /* ---- HUD rendering ------------------------------------------------------ */

  function renderChips() {
    const list = PIECES.concat([BONUS]);
    hud.chips.innerHTML = list.map((p, i) => {
      const res = state.results[i];
      const isBonus = p === BONUS;
      const unlocked = state.pieces.length > 3;
      const cls = [
        'lr-chip',
        i === state.slot && (state.phase === 'throw' || state.phase === 'intro' || state.phase === 'fire') ? 'now' : '',
        res ? 'done' : '',
        isBonus ? 'bonus' : '',
        isBonus && !unlocked ? 'locked' : ''
      ].join(' ');
      const label = isBonus && !unlocked ? `${BONUS_STARS}★` : p.name.replace(/(en|n)$/, '');
      return `<span class="${cls}" title="${p.name}">${silhouetteSvg(p.profile, res ? p.css : 'currentColor', 18, 16)}<b>${label}</b>${res ? `<em>${starsHtml(res.stars)}</em>` : ''}</span>`;
    }).join('');
  }

  function renderMatch() {
    state.match = computeMatch();
    const pct = Math.round(state.match * 100);
    hud.meterVal.textContent = `${pct}%`;
    hud.meterFill.style.width = `${pct}%`;
    const stars = starsFor(state.match);
    hud.meter.dataset.stars = String(stars);
    if (stars !== state.stars) {
      hud.meterStars.innerHTML = starsHtml(stars);
      if (stars > state.stars && state.phase === 'throw') {
        sfx.star(stars - 1);
        hud.meterStars.classList.remove('pop');
        void hud.meterStars.offsetWidth;
        hud.meterStars.classList.add('pop');
        if (stars === 3) toast('Keramikern höjer ögonbrynen!', true);
        else if (stars === 2) toast('Nu liknar det något!');
        keramiker.cue('star', stars);
        ghostFlash = reduceMotion ? 0.3 : 1;
      }
      state.stars = stars;
    }
    drawDiff(hud.diff, piece().profile, r);
  }

  /** Likeness between the thrown profile and the target. */
  function computeMatch() {
    const { profile } = piece();
    let err = 0;
    for (let j = 0; j < N; j++) err += Math.abs(r[j] - profile(j / (N - 1)));
    err /= N;
    return Math.max(0, Math.min(1, 1 - err / 0.42));
  }

  function renderTask() {
    const p = piece();
    const bonus = p === BONUS;
    hud.kicker.textContent = bonus ? 'BONUS · KERAMIKERNS UTMANING' : `UPPDRAG ${state.slot + 1}/3`;
    hud.name.textContent = p.name;
    hud.brief.textContent = p.brief;
    const b = bests[p.id];
    hud.best.innerHTML = b
      ? `Ditt bästa <b>${Math.round(b.match * 100)} %</b> <span class="lr-mini-stars">${starsHtml(b.stars)}</span>`
      : 'Ditt bästa <b>—</b>';
    hud.task.classList.toggle('bonus', bonus);
  }

  /* ---- Overlay panels ---------------------------------------------------- */

  function piecePreview(p, locked) {
    const b = bests[p.id];
    const best = locked
      ? `<small>${BONUS_STARS} stjärnor låser upp</small>`
      : b
        ? `<small>${Math.round(b.match * 100)} % ${starsHtml(b.stars)}</small>`
        : '<small>ej drejad</small>';
    return `<li class="${locked ? 'locked' : ''}${p === BONUS ? ' bonus' : ''}">${silhouetteSvg(p.profile, locked ? 'rgba(255,255,255,0.14)' : p.css, 46, 40)}<b>${p.name}</b>${best}</li>`;
  }

  function showStart() {
    hud.panel.innerHTML = `
      <div class="lr-kicker">Barcelona · ateljén i skymningen</div>
      <h2>Pekkas Lerskulptur</h2>
      <p>Keramikern visar formen — dreja så likt du kan. Dra mot leran för att trycka in, dra utåt för att dra ut.</p>
      <ul class="lr-preview">${PIECES.map((p) => piecePreview(p, false)).join('')}${piecePreview(BONUS, !bests.pokal)}</ul>
      <ul class="fg-steps">
        <li><i style="--c:#5eead4"></i><b>Forma</b> Dra i leran vid rätt höjd. Bandet visar var: varmt — tryck in, kallt — dra ut.</li>
        <li><i style="--c:#f2c14e"></i><b>Glätta</b> Håll GLÄTTA för att jämna ut kurvorna och ränderna.</li>
        <li><i style="--c:#ff9a5c"></i><b>Bränn</b> Tryck KLAR — ugnen, glasyren och keramikerns dom.</li>
      </ul>
      <button class="pb-btn" data-act="start">Sätt igång drejskivan</button>`;
    hud.overlay.classList.remove('summary');
    hud.overlay.classList.add('show');
  }

  function showSummary(isHigh) {
    const totalStars = state.results.reduce((s, x) => s + x.stars, 0);
    const [, title, words] = TITLES.find(([min]) => totalStars >= min);
    const rows = state.results.map((res) => `
      <li>
        ${silhouetteSvg(res.def.profile, res.def.css, 40, 34)}
        <div class="lr-sum-name"><b>${res.def.name}</b><small>${res.def.glazeName} · ${Math.round(res.match * 100)} %</small></div>
        <span class="lr-mini-stars">${starsHtml(res.stars)}</span>
        <em>${res.grade}/10</em>
        <strong>+${fmt(res.total)}</strong>
        ${res.newBest ? '<i class="lr-pb">PB</i>' : ''}
      </li>`).join('');
    hud.panel.innerHTML = `
      <div class="lr-kicker">Kvällens utställning · ${totalStars} ★</div>
      <h2>${isHigh ? 'Nytt rekord!' : title}</h2>
      <p>${isHigh ? `${title}. ${words}` : words}</p>
      <ul class="lr-summary">${rows}</ul>
      <div class="pb-scoreline"><span>${fmt(state.score)}</span><small>poäng · rekord ${fmt(high)}</small></div>
      <button class="pb-btn" data-act="start">Dreja igen</button>`;
    hud.overlay.classList.add('summary', 'show');
    // Frame the window display in whatever part of the screen the card leaves
    const host = canvasHost.getBoundingClientRect();
    const card = hud.panel.getBoundingClientRect();
    if (view.portrait) {
      const y1 = Math.max(0.15, (card.top - host.top) / host.height);
      summaryFree.set(0, 1, 0, y1);
    } else {
      const x1 = Math.max(0.3, (card.left - host.left - 12) / host.width);
      summaryFree.set(0, x1, 0, 1);
    }
  }

  /* ---- Phases ----------------------------------------------------------- */

  function setThrowHud(on) {
    if (!on) hud.coach.classList.remove('show');
    hud.task.classList.toggle('show', on);
    hud.meter.classList.toggle('show', on);
    hud.tools.classList.toggle('show', on);
    if (!on) hud.timer.textContent = '';
  }

  function startPiece() {
    const p = piece();
    state.phase = 'intro';
    state.t = 0;
    state.timeLeft = PIECE_TIME;
    state.bestMatch = 0;
    state.stars = 0;
    state.wobble = 0;
    state.wobbleWarned = false;
    hud.meterStars.innerHTML = starsHtml(0);
    resetLump();
    body.open = 0;
    body.update(r);
    clayGroup.visible = true;
    clayGroup.position.set(0, wheel.headY + 1.6, 0);
    clayGroup.scale.setScalar(1);
    contact.visible = true;
    studio.kiln.led.draw('  20');
    guide.setTarget(p.profile);
    guide.updateDiff(r, 0);
    renderTask();
    renderChips();
    renderMatch();
    setThrowHud(true);
    hud.verdict.classList.remove('show');
    setPhaseLabel(p === BONUS ? 'BONUS: POKALEN I GULD' : p.brief);
    later(() => setPhaseLabel(''), 3400);
    hud.coach.textContent = COACH;
    hud.coach.classList.toggle('show', state.coached < 1.2);
    // Keramikern points at the new lump and says what he wants
    keramiker.clearVerdict();
    keramiker.cue('intro');
  }

  function finishPiece() {
    if (state.phase !== 'throw' && state.phase !== 'intro') return;
    const p = piece();
    renderMatch();
    const { match } = state;
    const timeBonus = match >= 0.6 ? Math.max(0, Math.round(state.timeLeft * 3)) : 0;
    const base = Math.round(match ** 2 * 1000);
    const stars = starsFor(match);
    const prev = bests[p.id];
    const newBest = !prev || match > prev.match + 0.001;
    if (newBest) {
      bests[p.id] = { match, stars };
      writeJson(BEST_KEY, bests);
    }
    state.results[state.slot] = {
      def: p, match, stars, base, timeBonus, total: base + timeBonus, newBest, ...verdictFor(match)
    };
    state.phase = 'fire';
    state.t = 0;
    state.fast = false;
    setThrowHud(false);
    guide.group.visible = false;
    hand.visible = false;
    sponge.visible = false;
    dragging = false;
    brush = null;
    smoothing = false;
    keySmooth = false;
    contact.visible = false;
    sfx.setShaping(0);
    sfx.wire();
    sfx.whoosh(FIRE.lift);
    setPhaseLabel('');
    renderChips();
    hud.skip.classList.add('show');

    // The fired twin, waiting in the kiln
    body.open = 1;
    const geo = body.firedGeometry(r, p.glaze);
    const mat = glazeMaterial(maps, p.glaze.metal, glazeTex[p.glaze.tex] || null);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    fired = { mesh, def: p };
  }

  function showVerdict() {
    state.phase = 'judge';
    hud.skip.classList.remove('show');
    const res = state.results[state.slot];
    const p = res.def;
    state.score += res.total;
    sfx.verdict(res.match);
    hud.vKicker.textContent = `${p === BONUS ? 'Bonus' : `Alster ${state.slot + 1}/3`} · ${p.glazeName}`;
    hud.vName.textContent = p.name;
    hud.vGrade.textContent = String(res.grade);
    hud.vStars.innerHTML = starsHtml(0);
    hud.vWords.textContent = `”${res.words}”`;
    hud.vLines.innerHTML = `
      <div><span>Likhet ${Math.round(res.match * 100)} %</span><b>${fmt(res.base)}</b></div>
      <div><span>Tidsbonus</span><b>+${fmt(res.timeBonus)}</b></div>
      <div class="sum"><span>Totalt</span><b>+${fmt(res.total)}</b></div>`;
    hud.vBadge.hidden = !res.newBest;
    hud.vBadge.textContent = 'Personbästa!';
    const totalStars = state.results.reduce((s, x) => s + x.stars, 0);
    let nextLabel = 'Nästa alster';
    if (state.slot === 2 && state.pieces.length === 3 && totalStars >= BONUS_STARS) {
      nextLabel = 'Keramikern har en utmaning till…';
    } else if (state.slot >= state.pieces.length - 1) nextLabel = 'Se kvällens utställning';
    hud.next.textContent = nextLabel;
    hud.verdict.classList.remove('grade-hi', 'grade-mid', 'grade-lo');
    hud.verdict.classList.add(res.grade >= 9 ? 'grade-hi' : res.grade <= 3 ? 'grade-lo' : 'grade-mid');
    hud.verdict.classList.add('show');
    measureVerdict();
    // Stars land one at a time
    const stars = hud.vStars.querySelectorAll('.lr-star');
    for (let i = 0; i < res.stars; i++) {
      later(() => {
        stars[i].classList.add('on', 'pop');
        sfx.star(i);
        // Fresh glaze winks with every star the piece earns
        for (let g = 0; g <= i; g++) emitGlint();
      }, 420 + i * 340);
    }
    if (res.grade >= 9) later(() => sfx.fanfare(), 420 + res.stars * 340);
    keramiker.cue('verdict', res.grade);
    renderChips();
  }

  /** Where on screen the judging scene has room: above the card (portrait), beside it (wide). */
  function measureVerdict() {
    const host = canvasHost.getBoundingClientRect();
    if (!host.height) return;
    const card = hud.verdict.getBoundingClientRect();
    const chips = hud.chips.getBoundingClientRect();
    // A card across the bottom (phones upright, squarish windows) leaves the
    // space above it; a card on the left (wide screens) the space beside it
    verdictBelow = card.width > host.width * 0.6;
    if (verdictBelow) {
      const y0 = clamp01((chips.bottom - host.top + 6) / host.height);
      const y1 = Math.max(y0 + 0.25, (card.top - host.top - 8) / host.height);
      verdictFree.set(0, 1, Math.min(0.2, y0), Math.min(1, y1));
    } else {
      const x0 = Math.min(0.5, Math.max(0, (card.right - host.left + 12) / host.width));
      verdictFree.set(x0, 1, 0.06, 1);
    }
  }

  /** From the verdict: the piece goes to the window, the next lump lands. */
  function nextPiece() {
    if (state.phase !== 'judge') return;
    hud.verdict.classList.remove('show');
    if (fired) {
      gallery.push({ mesh: fired.mesh, from: fired.mesh.position.clone(), to: studio.sill[gallery.length], t: 0, s0: fired.mesh.scale.x });
      // On a phone the small pieces on the sill skip the shadow pass: four of
      // them doubled the evening's last frame (~14k triangles each)
      if (lowTier) fired.mesh.castShadow = false;
      fired = null;
      sfx.whoosh();
    }
    const totalStars = state.results.reduce((s, x) => s + x.stars, 0);
    if (state.slot === 2 && state.pieces.length === 3 && totalStars >= BONUS_STARS) {
      state.pieces.push(BONUS);
      toast('Keramikern ler: en pokal till!', true);
    }
    if (state.slot >= state.pieces.length - 1) {
      endEvening();
      return;
    }
    state.slot++;
    startPiece();
  }

  function endEvening() {
    state.phase = 'over';
    state.t = 0;
    clayGroup.visible = false;
    renderChips();
    const isHigh = state.score > high;
    if (isHigh) {
      high = state.score;
      writeJson(HIGHSCORE_KEY, String(Math.round(high)));
      hud.hi.textContent = fmt(high);
    }
    sfx.silence();
    later(() => {
      sfx.fanfare();
      showSummary(isHigh);
    }, 1300);
  }

  function clearGallery() {
    gallery.forEach((g) => {
      scene.remove(g.mesh);
      g.mesh.geometry.dispose();
      g.mesh.material.dispose();
    });
    gallery.length = 0;
    if (fired) {
      scene.remove(fired.mesh);
      fired.mesh.geometry.dispose();
      fired.mesh.material.dispose();
      fired = null;
    }
  }

  function startGame() {
    sfx.resume();
    state.timers.forEach(clearTimeout);
    state.timers.length = 0;
    clearGallery();
    seedSplats();
    fx.clear();
    state.score = 0;
    state.shownScore = 0;
    state.slot = 0;
    state.pieces = PIECES.slice();
    state.results = [];
    hud.score.textContent = '0';
    hud.overlay.classList.remove('show');
    startPiece();
  }

  /* ---- Input ------------------------------------------------------------ */

  const raycaster = new THREE.Raycaster();
  const workPlane = new THREE.Plane();
  const planeHit = new THREE.Vector3();
  const planeRight = new THREE.Vector3();
  const pointerNdc = new THREE.Vector2();

  /** Pointer → (signed radius, height) in the camera-facing plane through the axis. */
  function pointerToClay(e) {
    const rect = canvasHost.getBoundingClientRect();
    pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const n = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
    workPlane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(0, 0, 0));
    if (!raycaster.ray.intersectPlane(workPlane, planeHit)) return null;
    planeRight.set(n.z, 0, -n.x);
    return { x: planeHit.dot(planeRight), y: planeHit.y - wheel.headY };
  }

  function brushFrom(p) {
    const u = p.y / H;
    if (u < -0.1 || u > 1.15) return null;
    const j = Math.max(0, Math.min(N - 1, Math.round(u * (N - 1))));
    return {
      j,
      targetR: Math.max(R_MIN, Math.min(R_MAX, Math.abs(p.x))),
      side: Math.sign(p.x) || 1,
      y: Math.max(0.02, Math.min(H, p.y))
    };
  }

  function onPointerDown(e) {
    sfx.resume();
    if (helpOpen) return;
    if (state.phase === 'fire') {
      state.fast = true;
      return;
    }
    if (state.phase !== 'throw') return;
    dragging = true;
    onPointerMove(e);
  }

  function onPointerMove(e) {
    if (state.phase !== 'throw') return;
    const p = pointerToClay(e);
    if (!p) return;
    if (!dragging) {
      hover = e.pointerType === 'mouse' ? brushFrom(p) : null;
      return;
    }
    brush = brushFrom(p);
  }

  function onPointerUp() {
    dragging = false;
    brush = null;
  }

  function onPointerLeave() {
    hover = null;
  }

  function onKeyDown(e) {
    if (e.key === '?' || (e.key === 'Escape' && helpOpen)) {
      setHelp(e.key === '?' ? !helpOpen : false);
      return;
    }
    if (helpOpen) return;
    if (e.key === ' ' && (state.phase === 'idle' || state.phase === 'over')) {
      e.preventDefault();
      startGame();
    } else if (e.key === 'Enter') {
      if (state.phase === 'throw') finishPiece();
      else if (state.phase === 'judge') nextPiece();
    } else if ((e.key === 'g' || e.key === 'G') && state.phase === 'throw') {
      keySmooth = true;
    } else if (e.key === ' ' && state.phase === 'fire') {
      e.preventDefault();
      state.fast = true;
    }
  }

  function onKeyUp(e) {
    if (e.key === 'g' || e.key === 'G') keySmooth = false;
  }

  /* Strategy card: pauses the wheel while open */
  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
    if (open) {
      dragging = false;
      smoothing = false;
      keySmooth = false;
      brush = null;
      sfx.setShaping(0);
    }
  }

  canvasHost.addEventListener('pointerdown', onPointerDown);
  canvasHost.addEventListener('pointermove', onPointerMove);
  canvasHost.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  hud.panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="start"]')) startGame();
  });
  hud.next.addEventListener('click', nextPiece);
  hud.done.addEventListener('click', finishPiece);
  hud.info.addEventListener('click', () => setHelp(!helpOpen));
  hud.helpClose.addEventListener('click', () => setHelp(false));
  const smoothOn = (e) => {
    e.preventDefault();
    smoothing = true;
  };
  const smoothOff = () => {
    smoothing = false;
  };
  hud.smooth.addEventListener('pointerdown', smoothOn);
  hud.smooth.addEventListener('pointerup', smoothOff);
  hud.smooth.addEventListener('pointerleave', smoothOff);
  hud.smooth.addEventListener('pointercancel', smoothOff);
  hud.mute.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    hud.mute.classList.toggle('off', sfx.muted);
    if (sfx.muted) sfx.silence();
  });

  /* ---- Camera framing per aspect ---------------------------------------- */

  const camGoal = new THREE.Vector3();
  const lookGoal = new THREE.Vector3();
  const lookAt = new THREE.Vector3(0, 1.6, 0);
  const tmpV = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const idleDir = new THREE.Vector3();

  /**
   * Place the camera so a box of half-size (hw, hh) around `look` fills
   * the given fraction of the view, approaching from direction `dir`.
   * `shift` slides the subject across the frame in screen units (−1..1) to
   * make room for side or bottom cards.
   */
  function frame(look, dir, hw, hh, fill, shift = [0, 0]) {
    const dV = hh / (view.tan * fill);
    const dH = hw / (view.tan * view.aspect * fill);
    const d = Math.max(dV, dH);
    tmpV.copy(dir).normalize();
    camGoal.copy(look).addScaledVector(tmpV, d);
    // Shift: move the look point opposite to where the subject should sit
    camRight.set(tmpV.z, 0, -tmpV.x).normalize();
    lookGoal.copy(look).addScaledVector(camRight, -shift[0] * d * view.tan * view.aspect);
    lookGoal.y -= shift[1] * d * view.tan;
  }

  /**
   * frame() into part of the screen: f = (x0, x1, y0 from the top, y1) as
   * fractions. The box fills that region and is centred in it.
   */
  function frameIn(look, dir, hw, hh, fill, f) {
    const wX = Math.max(0.3, f.y - f.x);
    const wY = Math.max(0.15, f.w - f.z);
    frame(look, dir, hw / wX, hh / wY, fill, [f.x + f.y - 1, 1 - (f.z + f.w)]);
  }

  const DIR_THROW = new THREE.Vector3(0, 0.2, 1);
  const DIR_KILN = new THREE.Vector3(-0.35, 0.5, 1); // a little from above, so the glowing seam reads
  const DIR_SHOW = new THREE.Vector3(0.05, 0.12, 1);
  const REVEAL_LOOK = new THREE.Vector3();
  const SHOW_LOOK = new THREE.Vector3(studio.window.x, 1.95, -5.2);
  const IDLE_LOOK = new THREE.Vector3(-0.7, 2.0, -1.8);
  const THROW_LOOK = new THREE.Vector3(0, 1.78, 0);
  const kilnLook = new THREE.Vector3();
  const kilnMouth = new THREE.Vector3();
  const kilnFlue = new THREE.Vector3();
  studio.group.updateMatrixWorld(true);
  studio.kiln.group.localToWorld(kilnLook.set(0, 1.75, 0.4));
  const kilnLookP = studio.kiln.group.localToWorld(new THREE.Vector3(-0.38, 1.7, 0.55));
  studio.kiln.group.localToWorld(kilnMouth.set(0, 0.63, 0.05));
  studio.kiln.group.localToWorld(kilnFlue.copy(studio.kiln.flue));
  const kilnFront = new THREE.Vector3();
  studio.kiln.group.localToWorld(kilnFront.set(0, 2.2, 1.3));
  const kilnOpen = new THREE.Vector3();
  studio.kiln.group.localToWorld(kilnOpen.set(-0.2, 1.15, 1.0));
  const kilnSeam = new THREE.Vector3();
  studio.kiln.group.localToWorld(kilnSeam.set(0, 1.76, 0.78));

  // Test hook: a fixed camera for close-ups (window.__ppLera.debugCam)
  let camOverride = null;

  function updateCamera(t, dt) {
    if (camOverride) {
      camera.position.copy(camOverride.pos);
      camera.lookAt(camOverride.look);
      return;
    }
    const P = view.portrait;
    const ph = state.phase;
    if (ph === 'idle') {
      idleDir.set(Math.sin(t * 0.12) * 0.12 - 0.1, 0.18, 1);
      frame(IDLE_LOOK, idleDir, P ? 2.4 : 5.6, 2.8, 0.9, P ? [0, 0.3] : [0.24, 0]);
    } else if (ph === 'intro' || ph === 'throw' || (ph === 'fire' && state.t < FIRE.lift)) {
      frame(THROW_LOOK, DIR_THROW, 1.72, 1.3, P ? 0.94 : 0.6, P ? [0, 0.04] : [0.04, 0]);
    } else if (ph === 'fire' && state.t < FIRE.open) {
      // On a phone held upright, a little to the left: keramikern tends the door from there
      frame(P ? kilnLookP : kilnLook, DIR_KILN, P ? 1.32 : 2.2, 1.9, P ? 0.92 : 0.85);
    } else if (ph === 'fire' || ph === 'judge') {
      REVEAL_LOOK.copy(studio.reveal);
      REVEAL_LOOK.x += 0.15;
      REVEAL_LOOK.y += 0.45;
      if (ph === 'judge' && verdictBelow) {
        // Above the verdict card: the piece AND keramikern, beret and all
        REVEAL_LOOK.y += 0.17;
        frameIn(REVEAL_LOOK, DIR_REVEAL, 0.66, 0.68, 0.94, verdictFree);
      } else if (ph === 'judge') {
        // Beside the card, centred between the piece and keramikern (he stands
        // on its left), so the card never covers him on a narrower window
        REVEAL_LOOK.x -= 0.25;
        REVEAL_LOOK.y += 0.06;
        frameIn(REVEAL_LOOK, DIR_REVEAL, 0.86, 0.8, 0.9, verdictFree);
      } else {
        frame(REVEAL_LOOK, DIR_REVEAL, P ? 0.75 : 1.3, 0.7, P ? 0.9 : 0.75, [0, P ? 0.1 : 0]);
      }
    } else if (ph === 'over') {
      // The sill (half-width ~1.3 with its pieces, plus margin) fills the free region
      frameIn(SHOW_LOOK, DIR_SHOW, 1.5, 0.42, 0.92, summaryFree);
    }
    const k = 1 - Math.exp(-dt * (ph === 'fire' ? 2.4 : 2.0));
    camera.position.lerp(camGoal, k);
    lookAt.lerp(lookGoal, 1 - Math.exp(-dt * 3.2));
    camera.lookAt(lookAt);
    // A little firing rumble (never with reduced motion)
    if (!reduceMotion && ph === 'fire' && state.heat > 0.5) {
      const s = (state.heat - 0.5) * 0.012;
      camera.position.x += Math.sin(t * 61) * s;
      camera.position.y += Math.sin(t * 47 + 1) * s;
    }
    if (!reduceMotion && state.wobble > 0.25 && ph === 'throw') {
      camera.position.x += Math.sin(t * 38) * state.wobble * 0.008;
    }
  }

  /* ---- Sizing ----------------------------------------------------------- */

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    // Phones: bloom from a quarter-size source (it is a soft glow anyway)
    if (lowTier) bloom.setSize(Math.round((w * pr) / 2), Math.round((h * pr) / 2));
    view.aspect = w / h;
    view.portrait = view.aspect < 0.85;
    camera.fov = view.portrait ? 50 : view.aspect < 1.3 ? 42 : 36;
    camera.aspect = view.aspect;
    camera.updateProjectionMatrix();
    view.tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    fx.setScale((h * pr) / (2 * view.tan));
    hudHost.classList.toggle('lr-wide', view.aspect >= 1.15);
    hudHost.classList.toggle('lr-tall', view.portrait);
    if (state.phase === 'throw' || state.phase === 'intro') renderMatch();
    if (state.phase === 'judge') measureVerdict();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Simulation --------------------------------------------------------- */

  const rand = mulberry(99);
  let tickSecond = 0;
  let matchThrottle = 0;
  let wobbleBeat = 0;
  let plopGap = 0;
  let swiftIn = 6;
  const handPos = new THREE.Vector3();
  const work = new THREE.Vector3();

  function applyBrush(dt) {
    let moved = 0;
    if (brush) {
      const sigma = 3.4;
      const rate = Math.min(1, dt * 7.5);
      for (let j = 3; j < N; j++) {
        const w = Math.exp(-((j - brush.j) ** 2) / (2 * sigma * sigma));
        if (w < 0.01) continue;
        const before = r[j];
        r[j] += (brush.targetR - r[j]) * w * rate;
        r[j] = Math.max(R_MIN, Math.min(R_MAX, r[j]));
        moved += Math.abs(r[j] - before);
        // Fingers leave crisp, wet rings where they work
        body.ring[j] += (1.15 - body.ring[j]) * Math.min(1, w * dt * 3);
        body.wet[j] += (1 - body.wet[j]) * Math.min(1, w * dt * 2.5);
      }
      // ...and a fresh film of slip right where the fingers ride: the band
      // they have just passed over shines wettest
      for (let j = Math.max(0, brush.j - 2); j <= Math.min(N - 1, brush.j + 2); j++) {
        body.wet[j] += (1 - body.wet[j]) * Math.min(1, dt * 7);
      }
      // Yanking far from the wall throws the clay off-centre
      const pressure = Math.abs(brush.targetR - r[brush.j]);
      if (pressure > 0.5) state.wobble = Math.min(1, state.wobble + (pressure - 0.5) * dt * 2.4);
    }
    if (smoothing || keySmooth) {
      const rate = Math.min(1, dt * 6);
      for (let j = 3; j < N - 1; j++) {
        r[j] += ((r[j - 1] + r[j + 1]) / 2 - r[j]) * rate;
      }
      // The sponge melts the rings and wets the whole wall
      for (let j = 0; j < N; j++) {
        body.ring[j] += (0.22 - body.ring[j]) * Math.min(1, dt * 1.4);
        body.wet[j] += (1 - body.wet[j]) * Math.min(1, dt * 1.2);
      }
      state.wobble = Math.max(0, state.wobble - dt * 0.9);
      moved += 0.02;
      if (rand() < dt * 3) sfx.smooth();
    }
    // A whisper of relaxation keeps the profile organic while working
    if (brush) {
      for (let j = 4; j < N - 1; j++) {
        r[j] += ((r[j - 1] + r[j + 1]) / 2 - r[j]) * Math.min(1, dt * 1.2);
      }
    }
    // Off-centre clay gets lumpy toward the top until it settles
    if (state.wobble > 0.3) {
      for (let j = 20; j < N; j++) {
        if (rand() < dt * 6) {
          r[j] = Math.max(R_MIN, Math.min(R_MAX, r[j] + (rand() - 0.5) * state.wobble * 0.02 * (j / N)));
        }
      }
      moved += 0.001;
    }
    // Clay slowly dries between touches
    for (let j = 0; j < N; j++) body.wet[j] = Math.max(0.3, body.wet[j] - dt * 0.012);
    return moved;
  }

  /*
   * The clay gives under the hand. The simulation's profile r is the
   * clay's settled shape; what is drawn adds the live deformation at the
   * fingers: pressing in, a dent at the pads and the displaced clay rising
   * as a ridge just above them (a little below too); pulling out from
   * inside, a bulge travelling up with the fingertips. It eases in and out
   * and rides along with the hand.
   */
  const rShow = new Float32Array(N);
  const touch = { k: 0, j: 0, sign: 1, amp: 0 };
  function shownProfile(dt) {
    const b = brush && dragging ? brush : null;
    const goal = b ? 1 : 0;
    touch.k += (goal - touch.k) * Math.min(1, dt * (goal ? 10 : 5));
    if (b) {
      touch.j += (b.j - touch.j) * Math.min(1, dt * 16);
      touch.sign = b.targetR < r[b.j] ? 1 : -1;
      touch.amp = 0.016 + Math.min(0.03, Math.abs(b.targetR - r[b.j]) * 0.08);
    }
    if (touch.k < 0.003) return r;
    const a = touch.amp * touch.k;
    for (let j = 0; j < N; j++) {
      const d = j - touch.j;
      let off;
      if (touch.sign > 0) {
        // pressed in: dent under the pads, the ridge pushed up ahead of them
        off = -a * Math.exp(-(d * d) / 3) + a * 0.75 * Math.exp(-((d - 3.2) ** 2) / 2.2) + a * 0.25 * Math.exp(-((d + 3) ** 2) / 2.5);
      } else {
        // pushed out from inside: a bulge, the wall above drawn a touch thinner
        off = a * Math.exp(-(d * d) / 3.5) - a * 0.3 * Math.exp(-((d - 3.5) ** 2) / 3);
      }
      rShow[j] = Math.max(R_MIN, r[j] + off * (j > 2 ? 1 : 0));
    }
    return rShow;
  }

  function updateIntro(dt) {
    state.t += dt;
    const { t } = state;
    state.wheelSpeed += (1 - state.wheelSpeed) * Math.min(1, dt * 1.5);
    // Drop, squash, open
    if (t < 0.42) {
      const k = t / 0.42;
      clayGroup.position.y = wheel.headY + 1.6 * (1 - k * k);
      clayGroup.scale.set(1, 1, 1);
    } else {
      if (clayGroup.position.y !== wheel.headY) {
        clayGroup.position.y = wheel.headY;
        sfx.slap();
        for (let i = 0; i < 14; i++) {
          const a = rand() * Math.PI * 2;
          fx.drops.emit(Math.cos(a) * 0.6, wheel.headY + 0.05, Math.sin(a) * 0.6, Math.cos(a) * 1.6, 1.2 + rand(), Math.sin(a) * 1.6, 0.7, 0.05 + rand() * 0.04);
        }
      }
      const k = (t - 0.42) / 0.4;
      const squash = k < 1 ? Math.exp(-k * 4) * Math.cos(k * 9) * 0.16 : 0;
      clayGroup.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
    }
    if (t > 0.85) {
      if (body.open === 0) sfx.open();
      body.open = smooth(0.85, 1.35, t);
      body.update(r);
    }
    if (t >= 1.4) {
      body.open = 1;
      body.update(r);
      clayGroup.scale.setScalar(1);
      state.phase = 'throw';
    }
  }

  function updateThrow(dt, t) {
    state.wheelSpeed += (1 - state.wheelSpeed) * Math.min(1, dt * 2);
    state.timeLeft -= dt;
    const secs = Math.max(0, Math.ceil(state.timeLeft));
    hud.timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    hud.timer.classList.toggle('low', secs <= 10);
    if (secs <= 10 && secs !== tickSecond) {
      tickSecond = secs;
      sfx.tick();
    }
    if (state.timeLeft <= 0) {
      toast('Ugnen väntar inte!', true);
      finishPiece();
      return;
    }

    const moved = applyBrush(dt);
    const working = dragging && brush;
    if (working && state.coached < 1.2) {
      state.coached += dt;
      if (state.coached >= 1.2) hud.coach.classList.remove('show');
    }
    shapingEnergy += (Math.min(1, moved * 26) - shapingEnergy) * Math.min(1, dt * 9);
    sfx.setShaping(working || smoothing || keySmooth ? 0.15 + shapingEnergy : 0, state.wobble);
    // Rings and wetness change continuously, so the mesh is rebuilt every
    // frame — from the profile as the hand deforms it right now
    body.update(shownProfile(dt));
    matchThrottle -= dt;
    if (matchThrottle <= 0 && (moved > 0.0005 || smoothing || keySmooth)) {
      matchThrottle = 0.12;
      renderMatch();
      if (state.match > state.bestMatch) state.bestMatch = state.match;
    }
    guide.updateDiff(r, 1);

    // Off-centre wobble: precessing tilt, thumps, a warning
    state.wobble = Math.max(0, state.wobble - dt * 0.35);
    const wob = state.wobble;
    tilt.rotation.x = Math.sin(state.spin) * wob * 0.05;
    tilt.rotation.z = Math.cos(state.spin) * wob * 0.05;
    wobbleBeat -= dt;
    if (wob > 0.3 && wobbleBeat <= 0) {
      wobbleBeat = 0.42;
      sfx.wobble();
    }
    if (wob > 0.45 && !state.wobbleWarned) {
      state.wobbleWarned = true;
      toast('Lugnt! Leran slår — glätta och ta det varsamt.');
      keramiker.cue('wobble');
    }

    updateHands(dt, t);
    const show = !dragging && !(smoothing || keySmooth);
    guide.updateHints(r, t, show);
  }

  /** The wall's slope dr/dy and profile curvature at row j (for the hand to follow it). */
  function wallShape(j) {
    const h = H / (N - 1);
    const j0 = Math.max(0, j - 2);
    const j1 = Math.min(N - 1, j + 2);
    const slope = (r[j1] - r[j0]) / ((j1 - j0) * h || 1);
    const k0 = Math.max(0, j - 3);
    const k1 = Math.min(N - 1, j + 3);
    const curv = (r[k1] + r[k0] - 2 * r[j]) / ((3 * h) ** 2);
    return { slope: Math.max(-2, Math.min(2, slope)), curv: Math.max(-3, Math.min(3, curv)) };
  }

  /** The wall as drawn this frame (the hand's live dent included). */
  const shownR = (j) => (touch.k >= 0.003 ? rShow[j] : r[j]);
  /** Inner radius of the wall at row j (as clay.js builds it). */
  const innerR = (j) => shownR(j) - Math.min(WALL, r[N - 1] * 0.7);

  /**
   * Put the hand at a point (in the guide plane) and pose it. It eases to
   * its mark (and grows in the first moment it appears) so it never pops.
   */
  function placeHand(pos, side, o, dt) {
    if (!hand.visible) {
      hand.position.copy(pos);
      hand.visible = true;
      hand.userData.k = 0;
    }
    hand.position.lerp(pos, Math.min(1, dt * 22));
    hand.userData.k = Math.min(1, (hand.userData.k || 0) + dt * 8);
    const s = 0.86 + 0.14 * hand.userData.k;
    hand.scale.set(side * s, s, s);
    if (o.inside) o.reach = reachOf(side, s);
    potter.pose(o);
  }

  /** Inside the pot the elbow goes over its mouth, a little toward the viewer (in the hand group's space). */
  const reachV = new THREE.Vector3();
  function reachOf(side, s) {
    return reachV.set((0 - hand.position.x) / (side * s), (H + 0.4 - hand.position.y) / s, (0.2 - hand.position.z) / s);
  }

  /** Where the inside hand sits: on the inner wall, behind the axis plane, so its arm crosses the mouth. */
  const INSIDE_Z = -0.25;
  const insideX = (j) => Math.sqrt(Math.max(0.0004, innerR(j) ** 2 - INSIDE_Z * INSIDE_Z)) - 0.03;

  /** Hand at the contact point, sponge while smoothing, slip thrown off. */
  function updateHands(dt, t) {
    const b = brush && dragging ? brush : null;
    const ref = b || hover;
    if (ref) {
      const wall = r[ref.j];
      guide.setRing(true, ref.y, wall, ref.targetR < wall ? 1 : -1, dt);
    } else {
      guide.setRing(false, 0, 0, 0, dt);
    }
    if (b) {
      const wall = r[b.j];
      const shake = state.wobble * 0.03 * Math.sin(t * 40);
      const pull = b.targetR > wall;
      const press = Math.min(1, Math.abs(b.targetR - wall) * 3);
      const ws = wallShape(b.j);
      if (pull) {
        // Pulling out works from INSIDE the pot: fingers down the inner
        // wall, pads pressing outward, the forearm over the rim
        handPos.set(b.side * insideX(b.j) + shake, b.y, INSIDE_Z);
        placeHand(handPos, b.side, { inside: true, slope: ws.slope, curv: -ws.curv, press, t }, dt);
      } else {
        // Pushing in: palm and finger pads on the outer wall
        handPos.set(b.side * (shownR(b.j) + 0.01) + shake, b.y, 0.06);
        placeHand(handPos, b.side, { inside: false, slope: ws.slope, curv: ws.curv, press, t }, dt);
      }
      // Slip flies off the spinning wall, tangent to the rotation — always a
      // few at full speed, more the harder the clay is worked
      const rate = (shapingEnergy > 0.12 ? 34 * shapingEnergy : 0) + (state.wheelSpeed > 0.8 ? 5 : 0);
      if (rand() < dt * rate) {
        guide.group.localToWorld(work.set(b.side * wall, b.y, 0));
        const w = 3.1 * state.wheelSpeed;
        const vx = work.z * w * 0.45 + work.x * 0.9;
        const vz = -work.x * w * 0.45 + work.z * 0.9;
        fx.drops.emit(work.x, work.y, work.z, vx + (rand() - 0.5), 1.4 + rand() * 1.8, vz + (rand() - 0.5), 1.4, 0.035 + rand() * 0.05);
      }
    }
    const sm = smoothing || keySmooth;
    sponge.visible = sm;
    if (sm) {
      const u = 0.55 + Math.sin(t * 3.2) * 0.38;
      const j = Math.round(u * (N - 1));
      // Squeezed a little against the wall as it rides up and down
      const squeeze = 0.86 + Math.sin(t * 9) * 0.05;
      sponge.position.set(r[j] + 0.1 * squeeze, u * H, 0.1);
      sponge.scale.set(squeeze, 1, 1);
      // ...and held there by the hand, fingers closed round its back
      if (!b) {
        const ws = wallShape(j);
        handPos.set(r[j] + 0.19 * squeeze, u * H - 0.05, 0.05);
        placeHand(handPos, 1, { inside: false, slope: ws.slope, curv: ws.curv, press: 0.3, grip: 1, t }, dt);
      }
    } else if (!b && state.coached < 1.2 && state.phase === 'throw' && guide.worst.d > 0.11) {
      // First time at the wheel: until you have worked the clay for a moment,
      // a hand shows the move at the spot that needs it most — in to push,
      // out (from inside) to pull — and lifts away between goes
      const { j } = guide.worst;
      const cyc = (t * 0.7) % 1;
      const reach = Math.sin(Math.min(1, cyc / 0.7) * Math.PI);
      const pull = guide.worst.sign < 0;
      const ws = wallShape(j);
      const y = (j / (N - 1)) * H;
      if (pull) handPos.set(insideX(j) - 0.02 + reach * 0.018, y, INSIDE_Z);
      else handPos.set(r[j] + 0.01 + (1 - reach) * 0.35, y, 0.06);
      hand.position.copy(handPos);
      const s = pull ? 1 : 0.6 + 0.4 * reach;
      hand.scale.set(s, s, s);
      potter.pose({ inside: pull, slope: ws.slope, curv: pull ? -ws.curv : ws.curv, press: reach * 0.6, t, reach: pull ? reachOf(1, s) : null });
      hand.visible = pull || reach > 0.05;
    } else if (!b) {
      hand.visible = false;
    }
  }

  /** Slip droplets land as splats on the floor or vanish into the pan. */
  function landDrop(x, y, z) {
    const rr = Math.hypot(x, z);
    if (rr < 1.12 && y < 0.6) {
      if (plopGap <= 0) {
        sfx.plop();
        plopGap = 0.12;
      }
      return true;
    }
    if (y <= 0.004) {
      fx.splats.add(x, 0.004, z, 0.05 + Math.random() * 0.09, 0.9 + Math.random() * 0.25);
      return true;
    }
    return false;
  }

  const heatCol = new THREE.Color();
  function setHeat(h) {
    state.heat = h;
    const { kiln } = studio;
    kiln.chamberMat.emissiveIntensity = 0.06 + h * 3.2;
    // Cherry red → orange → the yellow of 1 240 °C, never a flat white
    heatCol.setRGB(1.0, 0.24 + h * 0.34, 0.04 + h * 0.1).multiplyScalar(h * (0.5 + h * 1.6));
    kiln.glowMat.color.copy(heatCol);
    sfx.setKiln(h);
  }

  /** Door shut: the raw piece becomes the fired one inside the kiln. */
  function swapToFired() {
    if (!clayGroup.visible) return;
    clayGroup.visible = false;
    fired.mesh.visible = true;
    fired.mesh.position.copy(kilnMouth);
    fired.mesh.scale.setScalar(KILN_SCALE);
    fired.mesh.material.emissiveIntensity = 1.4;
  }

  function updateFire(dt, t) {
    const speed = state.fast ? 3.5 : 1;
    const prevT = state.t;
    state.t += dt * speed;
    const ft = state.t;
    const crossed = (mark) => prevT < mark && ft >= mark;
    state.wheelSpeed += (0 - state.wheelSpeed) * Math.min(1, dt * 2.5);
    const { hinge } = studio.kiln;
    const OPEN = 1.95; // right-hinged: positive swings it out toward the camera's right

    if (ft < FIRE.lift) {
      clayGroup.position.y = wheel.headY + ease(ft / FIRE.lift) * 0.3;
      hinge.rotation.y = OPEN * ease(ft / FIRE.lift);
      setHeat(0.08);
    } else if (ft < FIRE.fly) {
      const k = ease((ft - FIRE.lift) / (FIRE.fly - FIRE.lift));
      clayGroup.position.set(0, wheel.headY + 0.3, 0).lerp(kilnMouth, k);
      clayGroup.position.y += Math.sin(Math.PI * k) * 1.1;
      clayGroup.scale.setScalar(1 - (1 - KILN_SCALE) * k);
      hinge.rotation.y = OPEN;
      tilt.rotation.set(0, 0, 0);
    } else if (ft < FIRE.close) {
      clayGroup.position.copy(kilnMouth);
      hinge.rotation.y = OPEN * (1 - ease((ft - FIRE.fly) / (FIRE.close - FIRE.fly)));
      if (crossed(FIRE.close - 0.08)) {
        sfx.door();
        keramiker.cue('door');
      }
    } else if (ft < FIRE.heat) {
      swapToFired();
      hinge.rotation.y = 0;
      const k = (ft - FIRE.close) / (FIRE.heat - FIRE.close);
      const h = smooth(0, 0.75, k);
      setHeat(h);
      const temp = Math.round(20 + 1220 * smooth(0, 0.92, k));
      hud.tempVal.textContent = fmt(temp);
      hud.temp.classList.add('show');
      hud.temp.style.setProperty('--heat', h.toFixed(2));
      studio.kiln.led.draw(String(temp).padStart(4, ' '));
      if (rand() < dt * 14 * h) sfx.crackle();
      // Embers pour out of the flue and spit from the door's top seam
      if (rand() < dt * 40 * h) {
        const src = rand() < 0.5 ? kilnFlue : kilnSeam;
        fx.embers.emit(src.x + (rand() - 0.5) * 0.4, src.y, src.z, (rand() - 0.5) * 0.6, 0.8 + rand() * 1.2, (rand() - 0.5) * 0.6, 1.4 + rand(), 0.04 + rand() * 0.05);
      }
    } else if (ft < FIRE.open) {
      if (crossed(FIRE.heat)) {
        sfx.door(0.05);
        hud.temp.classList.remove('show');
      }
      const k = ease((ft - FIRE.heat) / (FIRE.open - FIRE.heat));
      hinge.rotation.y = OPEN * k;
      setHeat(1 - 0.35 * k);
    } else if (ft < FIRE.slide) {
      swapToFired();
      hinge.rotation.y = OPEN;
      const k = ease((ft - FIRE.open) / (FIRE.slide - FIRE.open));
      fired.mesh.position.lerpVectors(kilnMouth, studio.reveal, k);
      fired.mesh.position.y += Math.sin(Math.PI * k) * 0.35;
      fired.mesh.scale.setScalar(KILN_SCALE + (REVEAL_SCALE - KILN_SCALE) * k);
      fired.mesh.rotation.y += dt * 2;
      setHeat(0.65 - 0.3 * k);
    } else {
      // Cooling on the banding wheel: glow fades, glaze pings, steam, glints
      const k = (ft - FIRE.slide) / (FIRE.cool - FIRE.slide);
      swapToFired();
      hinge.rotation.y = OPEN;
      hud.temp.classList.remove('show');
      fired.mesh.position.copy(studio.reveal);
      fired.mesh.material.emissiveIntensity = 1.4 * Math.exp(-k * 4.5);
      setHeat(0.35 * (1 - k));
      if (rand() < dt * 7) sfx.ping();
      if (rand() < dt * 14 * (1 - k) ** 2) {
        const a = rand() * Math.PI * 2;
        fx.steam.emit(studio.reveal.x + Math.cos(a) * 0.2, studio.reveal.y + 0.3 + rand() * 0.5, studio.reveal.z + Math.sin(a) * 0.2, 0, 0.3, 0, 1.3, 0.17);
      }
      if (k > 0.35 && rand() < dt * 9) emitGlint();
      if (ft >= FIRE.cool) {
        fired.mesh.material.emissiveIntensity = 0;
        setHeat(0);
        showVerdict();
      }
    }

    // Kiln glow light: at the door while firing, a flash when it opens
    const flash = ft > FIRE.heat && ft < FIRE.heat + 0.5 ? Math.sin(((ft - FIRE.heat) / 0.5) * Math.PI) * (reduceMotion ? 0.6 : 2.2) : 0;
    // Closed, the glow leaks round the door; open, it pours out of the chamber
    accent.position.copy(ft < FIRE.heat ? kilnFront : kilnOpen);
    accent.color.setRGB(1, 0.45 + state.heat * 0.2, 0.15);
    accent.intensity = state.heat * (ft < FIRE.heat ? 4.5 : 3.5) + flash * 1.4;
    haze.enabled = state.heat > 0.15;
    if (haze.enabled) {
      tmpV.copy(kilnFlue).add(kilnLook).multiplyScalar(0.5).project(camera);
      haze.uniforms.uCenter.value.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5);
      haze.uniforms.uRadius.value.set(0.16 / Math.max(0.6, view.aspect), 0.32);
      haze.uniforms.uStrength.value = state.heat;
      haze.uniforms.uTime.value = t % 600;
    }
    bloom.strength = 0.3 + state.heat * 0.4 + flash * 0.12;
  }

  function emitGlint() {
    if (!fired) return;
    const m = fired.mesh;
    const j = 6 + Math.floor(rand() * (N - 8));
    const a = (rand() - 0.5) * 1.6;
    const camDir = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
    const rad = r[j] * m.scale.x;
    fx.glints.emit(
      m.position.x + Math.sin(camDir + a) * rad,
      m.position.y + (j / (N - 1)) * H * m.scale.y,
      m.position.z + Math.cos(camDir + a) * rad,
      0, 0, 0, 0.6, 0.09 + rand() * 0.06
    );
  }

  /**
   * Outside the firing, the roaming accent becomes a soft warm display
   * light: on the banding wheel while the piece is judged, on the window
   * sill for the evening's exhibition.
   */
  const ACCENT_JUDGE = new THREE.Vector3();
  const ACCENT_SHOW = new THREE.Vector3(studio.window.x + 0.3, 2.9, -3.7);
  ACCENT_JUDGE.copy(studio.reveal).add(new THREE.Vector3(-0.8, 1.3, 1.2));
  function updateAccent(dt) {
    let goal = 0;
    if (state.phase === 'judge') {
      accent.position.copy(ACCENT_JUDGE);
      goal = 3.2;
    } else if (state.phase === 'over') {
      accent.position.copy(ACCENT_SHOW);
      goal = 5;
    }
    if (goal) accent.color.lerp(heatCol.setRGB(1, 0.86, 0.7), Math.min(1, dt * 3));
    accent.intensity += (goal - accent.intensity) * Math.min(1, dt * 3);
  }

  /**
   * Keramikern (keramiker.js) gets the moment each frame: what he should be
   * watching while you throw — your hand on the clay, or the clay itself —
   * the fired piece while he judges, and where the viewer is.
   */
  function updateKeramiker(dt, t) {
    const ph = state.phase;
    if (ph === 'throw' || ph === 'intro') {
      const b = brush && dragging ? brush : hover;
      if (b) guide.group.localToWorld(attention.set(b.side * r[b.j], b.y, 0));
      else attention.set(0, wheel.headY + H * 0.55, 0);
    }
    if (fired) {
      pieceMid.copy(fired.mesh.position);
      pieceMid.y += H * fired.mesh.scale.y * 0.5;
    }
    // Fast-forwarded firing: he hurries too, so he still meets the piece at the banding wheel
    keramiker.update(ph === 'fire' && state.fast ? dt * 2.5 : dt, t, {
      phase: ph,
      opened: ph === 'fire' && state.t >= FIRE.open,
      fireT: ph === 'fire' ? state.t : undefined,
      doorOpening: ph === 'fire' && state.t >= FIRE.heat + 0.1,
      attention,
      piece: fired ? pieceMid : null,
      camera: camera.position,
      heat: state.heat
    });
  }

  /** Pieces gliding to the window sill. */
  function updateGallery(dt) {
    gallery.forEach((g) => {
      if (g.t >= 1) return;
      g.t = Math.min(1, g.t + dt / 1.2);
      const k = ease(g.t);
      g.mesh.position.lerpVectors(g.from, g.to, k);
      g.mesh.position.y += Math.sin(Math.PI * k) * 1.0;
      g.mesh.scale.setScalar(g.s0 + (0.24 - g.s0) * k);
      g.mesh.rotation.y += dt * (1 - k) * 3;
    });
  }

  /* ---- Loop ------------------------------------------------------------- */

  let raf = 0;
  let last = performance.now();
  let running = true;
  let timeScale = 1; // tests on software GL fast-forward with this
  renderer.info.autoReset = false; // count the whole composer frame, not its last pass

  /*
   * Frame-time guard: when the GPU cannot keep up (a weak laptop, a busy
   * phone), trade resolution for smoothness — at most twice, and never back
   * up again, so the picture cannot pump between sharp and soft.
   */
  const perf = { auto: true, skip: 2500, sum: 0, n: 0, drops: 0 };
  function guardFrameTime(ms) {
    if (!perf.auto || perf.drops >= 2 || ms > 250) return; // > 250 ms: a stall or a tab switch, not load
    if (perf.skip > 0) {
      perf.skip -= ms; // first seconds: shader compiles and warm-up
      return;
    }
    perf.sum += ms;
    perf.n++;
    if (perf.sum < 3000) return;
    const avg = perf.sum / perf.n;
    perf.sum = 0;
    perf.n = 0;
    if (avg < 30) return;
    perf.drops++;
    baseRatio = Math.max(0.7, baseRatio * 0.78);
    renderer.setPixelRatio(baseRatio);
    resize();
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const raw = now - last;
    const dt = clampDt(raw) * timeScale;
    last = now;
    if (!running) return;
    guardFrameTime(raw);
    renderer.info.reset();
    if (hudHost.dataset.phase !== state.phase) hudHost.dataset.phase = state.phase;
    const t = now / 1000;
    // Shader clocks are wrapped: a page left open for hours would otherwise
    // feed sin()/fract() numbers too big for the GPU's float precision
    const tw = t % 600;
    plopGap -= dt;

    if (helpOpen) {
      state.wheelSpeed += (0 - state.wheelSpeed) * Math.min(1, dt * 2);
    } else if (state.phase === 'intro') updateIntro(dt);
    else if (state.phase === 'throw') updateThrow(dt, t);
    else if (state.phase === 'fire') updateFire(dt, t);
    else {
      state.wheelSpeed += (0 - state.wheelSpeed) * Math.min(1, dt * 2);
      if (state.heat > 0) setHeat(Math.max(0, state.heat - dt));
      haze.enabled = false;
      bloom.strength += (0.3 - bloom.strength) * Math.min(1, dt * 2);
    }
    if (state.phase !== 'fire') updateAccent(dt);
    if (state.phase !== 'throw') {
      guide.setRing(false, 0, 0, 0, dt);
      if (state.phase !== 'intro') guide.updateHints(r, t, false);
    }
    guide.group.visible = state.phase === 'throw' || state.phase === 'intro';

    // Spin: clay, wheel head, motion blur fading in with speed
    sfx.setWheel(state.wheelSpeed);
    const omega = state.wheelSpeed * 9.5;
    state.spin += omega * dt;
    clay.rotation.y = state.spin;
    wheel.head.rotation.y = state.spin;
    wheel.blurMat.opacity = smooth(0.15, 0.7, state.wheelSpeed);
    contact.scale.setScalar(r[0] * 2.4);

    // The guide plane turns to face the camera
    guide.group.rotation.y = Math.atan2(camera.position.x, camera.position.z);
    // A new star makes the ghost flare for a moment: "yes, that's the shape"
    ghostFlash = Math.max(0, ghostFlash - dt * 1.8);
    guide.setGhostTime(tw, state.phase === 'intro' ? smooth(0.5, 1.4, state.t) : 0.9 + ghostFlash * 0.9);

    // The finished piece turns on the banding wheel while it is judged
    if (fired && (state.phase === 'judge' || (state.phase === 'fire' && state.t > FIRE.slide))) {
      fired.mesh.rotation.y += dt * 0.6;
      studio.banding.rotation.y += dt * 0.6;
    }
    updateGallery(dt);

    updateKeramiker(dt, t);

    // Score counts up
    if (state.shownScore !== state.score) {
      state.shownScore += (state.score - state.shownScore) * Math.min(1, dt * 5);
      if (Math.abs(state.score - state.shownScore) < 1) state.shownScore = state.score;
      hud.score.textContent = fmt(state.shownScore);
    }

    // Particles
    fx.drops.update(dt, landDrop);
    fx.embers.update(dt);
    fx.steam.update(dt);
    fx.glints.update(dt);

    // Ambience: the sun shaft shimmers, motes drift, swifts pass over
    studio.shaft.material.uniforms.uTime.value = tw;
    studio.motes.position.y = Math.sin(t * 0.11) * 0.05;
    studio.motes.position.x = Math.sin(t * 0.07) * 0.06;
    swiftIn -= dt;
    if (swiftIn <= 0) {
      swiftIn = 7 + rand() * 12;
      if (state.phase !== 'fire') sfx.swift();
    }

    updateCamera(t, dt);
    if (usePost) composer.render();
    else renderer.render(scene, camera);
    watchdog.afterFrame();
  }

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
    if (!running) sfx.silence();
  };
  document.addEventListener('visibilitychange', onVisibility);

  renderChips();
  showStart();
  // Start with the camera already on its idle mark
  updateCamera(0, 10);

  /*
   * Compile every program now, behind the site's loading screen. Hidden
   * things (the hand, the sponge, the guide, particles, both glaze kinds)
   * would otherwise each compile on first use — a visible hitch in the
   * middle of a drag or the kiln reveal. The two glaze templates stay
   * alive so their programs stay cached for the fired pieces.
   */
  const glazeTemplates = [glazeMaterial(maps, false), glazeMaterial(maps, true)].map((m) => {
    const mesh = new THREE.Mesh(body.geometry, m);
    mesh.position.y = -50;
    scene.add(mesh);
    return mesh;
  });
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  // Asynkront: ett synkront block av tunga material (glasyrerna, leran)
  // kunde få Direct3D-kompilatorn på Windows att trigga GPU-vakthunden och
  // lämna en svart duk. Laddkortet ligger kvar medan det kompilerar.
  // The composer draws the scene into its own (linear, untonemapped) target,
  // which needs different program variants from the screen — warm those
  // The glaze patterns are uploaded now too, not when the first piece comes out
  glazeTex.list.forEach((tx) => renderer.initTexture(tx));
  await precompile(renderer, scene, camera, { target: usePost ? composer.renderTarget1 : null });
  hidden.forEach((o) => {
    o.visible = false;
  });
  glazeTemplates.forEach((m) => {
    m.visible = false;
  });
  last = performance.now();
  raf = requestAnimationFrame(tick);

  /* Deterministic hooks for automated tests */
  window.__ppLera = {
    state,
    startGame,
    finishPiece,
    nextPiece,
    profile: r,
    matchTo(k = 0.9) {
      const { profile } = piece();
      for (let j = 0; j < N; j++) r[j] = r[j] + (profile(j / (N - 1)) - r[j]) * k;
      body.update(r);
      renderMatch();
      guide.updateDiff(r, 1);
    },
    skipFire() {
      if (state.phase === 'fire') state.t = Math.max(state.t, FIRE.cool - 0.01);
    },
    setTimeScale(k = 1) {
      timeScale = Math.max(0.1, Math.min(8, k));
    },
    /** Software-GL test runs render functional passes at a reduced ratio (and turn the frame-time guard off). */
    setPixelRatio(pr) {
      perf.auto = false;
      renderer.setPixelRatio(pr);
      resize();
    },
    unlockBonus() {
      if (state.pieces.length === 3) state.pieces.push(BONUS);
    },
    /** Client coordinates of the clay wall at height u on side ±1. */
    screenOf(u, side = 1) {
      const j = Math.round(clamp01(u) * (N - 1));
      guide.group.updateMatrixWorld(true);
      guide.group.localToWorld(work.set(side * r[j], u * H, 0)).project(camera);
      const rect = canvasHost.getBoundingClientRect();
      return { x: rect.left + (work.x * 0.5 + 0.5) * rect.width, y: rect.top + (-work.y * 0.5 + 0.5) * rect.height };
    },
    computeMatch,
    /** Freeze the camera at pos looking at look (arrays); null releases it. */
    debugCam(pos, look) {
      camOverride = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) } : null;
    },
    /** Live three.js handles for test scripts (screenshots from other angles). */
    three: { scene, camera, sun, renderer, keramiker: keramiker.root },
    info() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        lowTier: !!lowTier,
        pixelRatio: renderer.getPixelRatio(),
        post: usePost,
        shadows: renderer.shadowMap.enabled,
        watchdog: watchdog.level
      };
    }
  };

  /* ---- Teardown --------------------------------------------------------- */

  function destroy() {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    canvasHost.removeEventListener('pointermove', onPointerMove);
    canvasHost.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    clearTimeout(state.lastToast);
    state.timers.forEach(clearTimeout);
    delete window.__ppLera;
    gfx.dispose();
    watchdog.dispose();

    guide.dispose();
    fx.dispose();
    keramiker.dispose();
    potter.mesh.skeleton.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(disposeMaterial);
    });
    body.dispose();
    maps.normal.dispose();
    maps.albedo.dispose();
    glazeTex.list.forEach((tx) => tx.dispose());
    if (envRT) envRT.dispose();
    composer.passes.forEach((pass) => pass.dispose?.());
    composer.dispose(); // frigör även renderingsmålen
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (sfx.ctx) sfx.ctx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createClay;
export { PIECES };
