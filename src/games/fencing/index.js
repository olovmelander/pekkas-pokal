/**
 * Pekkas Fäktning — the 2023 competition as a Three.js fencing game.
 *
 * The duel design triangulates from the two best sources there are:
 *
 *  - Nidhogg, the most loved fencing game ever made: three blade lines
 *    (high / mid / low) where a guard in the SAME line as the incoming
 *    attack parries it automatically. Minimal verbs, maximal tension.
 *  - Real fencing: the parry earns a RIPOSTE window, a FEINT draws the
 *    parry and opens another line, attacking into an attack loses the
 *    touch (right of way), and every phrase starts from the referee's
 *    "En garde — klara — kör!".
 *
 * A bout goes to 5 touches. The tournament is the real 2023 field in a
 * bracket: you fence as one of the five who missed the podium, and the
 * podium waits on your side of the draw in rising difficulty — Mikael
 * (brons) in the quarter-final, Rickard (silver) in the semi and the
 * champion Per Vikman in the final. Green lamp and buzzer on your
 * touches, red on theirs. Medals follow real fencing: both losing
 * semi-finalists get bronze.
 *
 * Feel: every touch freezes the world for a few frames (hit-stop), the
 * camera punches in on the point of contact, the lamé flashes, the box
 * blooms and the crowd reacts. The deciding touch of each bout is
 * replayed in slow motion from recorded poses.
 *
 * People: the fencers, the referee and the spectators are the shared
 * people.js characters, so Mikael, Rickard and Per Vikman look the same
 * here as in every other year's game. Masks come off between bouts —
 * you see who you are up against — and go on after the salute.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { guardRenderer, postTarget, addSanitize, RenderWatchdog, gfxNotice, precompile } from '../shared/gfx.js';
import { Sfx } from './audio.js';
import { Fencer, Animator, P, POSE_LEN } from './fencer.js';
import { mulberry, glowTexture, buildSalle, buildEnvScene } from './salle.js';
import { Sparks, Trail, Flashes, Confetti, starTexture, ringTexture } from './fx.js';
import {
  buildHud, titleScreen, bracketScreen, resultScreen, finalScreen, makeBracket, PICKABLE, ROUNDS
} from './hud.js';

/* The duel is wide: fill the whole stage on desktop */
export const layout = 'full';

const KEY_HIGH = 'pp-fakt-highscore';
const KEY_FENCER = 'pp-fakt-fencer';
const KEY_MEDALS = 'pp-fakt-medals';
const KEY_TUTOR = 'pp-fakt-tutorial';
const TOUCHES = 5;
const HOME = 1.22; // each fencer's en garde position from the centre line
const PISTE_TOP = 0.035; // the fencers stand on the metal piste
const MY_SOCK = 0xd9a531;
const LINE_NAME = ['HÖG', 'MITT', 'LÅG'];
const STRIKES = new Set(['lunge', 'attack', 'feint']);

/*
 * Balance measured in the first version and kept: how often each
 * opponent attacks, how long the telegraph reads, how fast the attack
 * lands, and the odds that they parry, feint-switch and riposte.
 */
const OPPONENTS = [
  {
    name: 'Mikael Hägglund',
    title: 'Bronsfäktaren',
    place: 3,
    sock: 0x5d9a58,
    attackEvery: [2.2, 3.4],
    telegraph: 0.95,
    attackDur: 0.34,
    parryP: 0.28,
    feintP: 0,
    riposteP: 0.25,
    taunt: 'Mikael värmer upp med långsamma, tydliga anfall.',
    style: 'Långsamma, ärliga anfall och sällan någon ripost. Läs linjen, parera, stöt.'
  },
  {
    name: 'Rickard Nilsson',
    title: 'Silverklingan',
    place: 2,
    sock: 0x3e6e9e,
    attackEvery: [1.7, 2.8],
    telegraph: 0.72,
    attackDur: 0.3,
    parryP: 0.48,
    feintP: 0.3,
    riposteP: 0.45,
    taunt: 'Rickard är snabbare — och han börjar finta.',
    style: 'Snabbare, och ibland byter han linje i sista stund. Han parerar varannan rak stöt.'
  },
  {
    name: 'Per Vikman',
    title: 'Mästaren av 2023',
    place: 1,
    sock: 0xc9982e,
    attackEvery: [1.3, 2.2],
    telegraph: 0.55,
    attackDur: 0.26,
    parryP: 0.66,
    feintP: 0.45,
    riposteP: 0.65,
    taunt: 'Per Vikman. Regerande mästare. Lycka till.',
    style: 'Regerande mästare. Kort förvarning, sena linjebyten och riposter som sitter. Finta honom.'
  }
];
OPPONENTS[0].next = OPPONENTS[1].taunt;
OPPONENTS[1].next = OPPONENTS[2].taunt;

const clampDt = (ms) => Math.max(0, Math.min(0.05, ms / 1000));
const lerp = (a, b, k) => a + (b - a) * k;
const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function urlFlag(name) {
  try {
    return new URLSearchParams(location.search).get(name) || '';
  } catch (e) {
    return '';
  }
}

function storedGfx() {
  try {
    return localStorage.getItem('pp-gfx') || '';
  } catch (e) {
    return '';
  }
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* private mode */
  }
}

/* ------------------------------------------------------------------- game */

export async function createFencing(container) {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);
  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui fen';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost);
  const { el } = hud;

  /* Quality tier: phones get a smaller shadow map and fewer motes; the
     frame-time watchdog below can drop bloom and resolution further. */
  const coarse = matchMedia('(pointer: coarse)').matches;
  const hiQ = !(coarse && Math.min(screen.width, screen.height) < 700);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Frame-time adaptive quality is off under automated tests (stable
  // output); ?perf=adapt forces it on so the path can be exercised there
  let adaptive = !navigator.webdriver || urlFlag('perf') === 'adapt';

  const sfx = new Sfx();
  const rand = mulberry(77);

  // Safe mode (?gfx=safe, or the stored pp-gfx flag) draws straight to the
  // screen without the composer, so it would have no antialiasing at all:
  // ask the canvas for MSAA instead. Everywhere else the composer's own
  // multisampled target does the job and the canvas stays cheap.
  const safeAsked = urlFlag('gfx') === 'safe' || storedGfx() === 'safe';
  const renderer = new THREE.WebGLRenderer({ antialias: safeAsked, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, hiQ ? 2 : 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false; // count the whole frame, not just the last pass
  canvasHost.appendChild(renderer.domElement);
  // Real GPUs are stricter than the test machine's software one (see shared/gfx.js)
  const gfx = guardRenderer(renderer, container);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0b09);
  scene.fog = new THREE.Fog(0x1b140e, 16, 40);

  // Near plane at 20 cm (the camera never comes closer to anything): depth
  // precision goes with near/far, and the props on the walls and the
  // scoring box need every bit of it on a 16-bit depth buffer
  const camera = new THREE.PerspectiveCamera(36, 1, 0.2, 60);

  // Reflections: a pre-filtered stand-in of this very room
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = buildEnvScene();
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.6;
  envScene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  pmrem.dispose();

  /* ---- World ---- */
  let fencerName = load(KEY_FENCER, 'Olov Melander');
  if (!PICKABLE.includes(fencerName)) fencerName = 'Olov Melander';
  // The rest of the 2023 field watches from the benches
  const watchers = () => PICKABLE.filter((n) => n !== fencerName);
  const glow = glowTexture();
  const salle = buildSalle({ glow, high: hiQ, crowdNames: watchers() });
  scene.add(salle.group);

  const me = new Fencer({ name: fencerName, sock: MY_SOCK });
  const foe = new Fencer({ name: OPPONENTS[0].name, sock: OPPONENTS[0].sock, mirror: true });
  me.group.position.set(-HOME, PISTE_TOP, 0);
  foe.group.position.set(HOME, PISTE_TOP, 0);
  scene.add(me.group, foe.group);
  [me, foe].forEach((f) => f.group.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  }));
  /* ---- Body cords: electric foil, wired from each fencer's back to the
     reel at his end of the piste (one line each) ---- */
  const CORD_N = 28;
  const cordMat = new THREE.LineBasicMaterial({ color: 0x1b1c21 });
  const cords = [me, foe].map((f, i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CORD_N * 3), 3));
    const line = new THREE.Line(geo, cordMat);
    line.frustumCulled = false;
    scene.add(line);
    return { f, line, reel: new THREE.Vector3(i ? 7.25 : -7.25, 0.24, -1.05) };
  });
  const cordA = new THREE.Vector3();
  const cordB = new THREE.Vector3();
  const cordC = new THREE.Vector3();
  /** The cord hangs from the back of the jacket to the piste, then runs along it to the reel. */
  function updateCords() {
    cords.forEach(({ f, line, reel }) => {
      const on = f.pose[P.relax] < 0.5;
      line.visible = on;
      if (!on) return;
      const hip = f.person.bones.hips.getWorldPosition(cordA);
      hip.x -= f.mx * 0.11;
      hip.y += 0.12;
      hip.z -= 0.05;
      // Where it meets the piste, behind the fencer; a little slack swing
      const land = cordB.set(hip.x - f.mx * 0.85, PISTE_TOP + 0.006, -0.32);
      const ctrl = cordC.set(hip.x - f.mx * 0.32, hip.y * 0.3, hip.z - 0.12);
      const arr = line.geometry.attributes.position.array;
      for (let i = 0; i < CORD_N; i++) {
        const u = i / (CORD_N - 1);
        let x;
        let y;
        let z;
        if (u < 0.4) {
          const k = u / 0.4;
          const a = (1 - k) * (1 - k);
          const b = 2 * k * (1 - k);
          const c = k * k;
          x = a * hip.x + b * ctrl.x + c * land.x;
          y = a * hip.y + b * ctrl.y + c * land.y;
          z = a * hip.z + b * ctrl.z + c * land.z;
        } else {
          const k = (u - 0.4) / 0.6;
          x = land.x + (reel.x - land.x) * k;
          z = land.z + (reel.z - land.z) * k;
          // Flat on the piste, rising off the floor only into the reel
          y = land.y + Math.max(0, (k - 0.93) / 0.07) * (reel.y - land.y);
        }
        arr[i * 3] = x;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = z;
      }
      line.geometry.attributes.position.needsUpdate = true;
    });
  }

  const animMe = new Animator(me, 0);
  const animAi = new Animator(foe, 1.7);
  me.setFlashColor(0xff4d3c); // your lamé flashes red: their lamp
  foe.setFlashColor(0x3dff86);

  /* ---- Effects ---- */
  const sparks = new Sparks(240);
  scene.add(sparks.mesh);
  const trailMe = new Trail(new THREE.Color(0.5, 0.65, 1.0), 10);
  const trailAi = new Trail(new THREE.Color(1.0, 0.72, 0.5), 10);
  scene.add(trailMe.mesh, trailAi.mesh);
  const star = starTexture();
  const ring = ringTexture();
  const flashes = new Flashes(glow, ring);
  scene.add(flashes.group);
  const confetti = new Confetti(hiQ ? 280 : 160);
  scene.add(confetti.mesh);
  // The glint on the attacking blade, and the marker where it will land
  const glintMat = new THREE.SpriteMaterial({
    map: star, color: 0xfff2d0, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending
  });
  const glint = new THREE.Sprite(glintMat);
  glint.renderOrder = 12;
  scene.add(glint);
  const threatMat = new THREE.SpriteMaterial({
    map: ring, color: 0xff5a46, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending
  });
  const threat = new THREE.Sprite(threatMat);
  threat.renderOrder = 12;
  scene.add(threat);

  /* ---- Post: bloom on the lamps, windows, flames and sparks ---- */
  const rtSize = new THREE.Vector2();
  // A target this GPU can really render to (half float + MSAA only where
  // supported), and a NaN/HDR clamp before bloom so one broken pixel can
  // never smear across the frame
  const composer = new EffectComposer(renderer, postTarget(gfx, { samples: hiQ ? 4 : 0 }));
  composer.addPass(new RenderPass(scene, camera));
  addSanitize(composer);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 1.0);
  composer.addPass(bloom);
  // UnrealBloomPass always draws into half-float targets of its own: skip it
  // where the GPU cannot render to those (the rest of the chain still runs)
  bloom.enabled = gfx.floatRT;
  composer.addPass(new OutputPass());
  let usePost = !gfx.safe;

  /* ---- Black-frame watchdog: step down until the picture lives ---- */
  const watchdog = new RenderWatchdog(
    renderer,
    [
      // 1: draw straight to the screen, no composer
      () => {
        usePost = false;
      },
      // 2: no shadow maps
      () => {
        renderer.shadowMap.enabled = false;
        scene.traverse((o) => {
          if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
        });
      },
      // 3: no reflections, no light volumes, no dust
      () => {
        scene.environment = null;
        salle.setVolumes(false);
        scene.traverse((o) => {
          if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
        });
      }
    ],
    { onStep: () => gfxNotice(container, 'Grafiken förenklades för att fungera på den här enheten.') }
  );

  /* ---- State ---------------------------------------------------------- */

  const state = {
    phase: 'title', // title | bracket | intro | ready | live | touch | replay | result | ceremony | final
    round: 0,
    score: 0,
    myTouches: 0,
    foeTouches: 0,
    phaseT: 0,
    readyStep: 0,
    streak: 0,
    stats: null,
    results: [],
    bracket: null,
    lastTouch: null,
    tutorial: !load(KEY_TUTOR, false),
    coached: {},
    firstAttack: true
  };
  const meS = { line: 1, pose: 'guard', t: 0, lungeLine: 1, isFeint: false, resolved: false };
  const ai = { pose: 'guard', t: 0, line: 1, shownLine: 1, timer: 2.5, willFeint: false, pendingRiposte: false };
  let medals = load(KEY_MEDALS, {});
  let best = load(KEY_HIGH, 0);
  if (typeof best !== 'number') best = parseInt(best, 10) || 0;
  let played = false;
  hud.setBest(best);

  let hitStop = 0;
  let clock = 0; // seconds of simulated time since the game opened
  let camCut = ''; // a hard cut the camera should take this frame
  const shake = { power: 0 };
  let helpOpen = false;
  let gameTime = 0;

  const opp = () => OPPONENTS[state.round];

  /* ---- Replay recording ----------------------------------------------- */
  // Every duel frame: both pose vectors and the lamps. Effects are logged
  // as events with a time, so the replay can fire them again.
  const REC = 360;
  const rec = {
    t: new Float64Array(REC),
    a: new Float32Array(REC * POSE_LEN),
    b: new Float32Array(REC * POSE_LEN),
    n: 0,
    head: 0,
    events: []
  };
  function record() {
    const i = rec.head;
    rec.t[i] = gameTime;
    rec.a.set(me.pose, i * POSE_LEN);
    rec.b.set(foe.pose, i * POSE_LEN);
    rec.head = (i + 1) % REC;
    rec.n = Math.min(REC, rec.n + 1);
  }
  function logEvent(type, pos, extra = {}) {
    rec.events.push({ t: gameTime, type, pos: pos.clone(), ...extra });
    if (rec.events.length > 40) rec.events.shift();
  }

  /* ---- Feedback helpers ---------------------------------------------- */

  const v3 = new THREE.Vector3();
  const v3b = new THREE.Vector3();
  const tipMe = new THREE.Vector3();
  const tipAi = new THREE.Vector3();

  function kick(power, stopMs) {
    if (!reduced) shake.power = Math.max(shake.power, power);
    hitStop = Math.max(hitStop, stopMs / 1000);
    if (coarse && navigator.vibrate) navigator.vibrate(Math.min(40, Math.round(power * 22)));
  }

  function project(world) {
    v3b.copy(world).project(camera);
    return [v3b.x * 0.5 + 0.5, -v3b.y * 0.5 + 0.5, v3b.z];
  }

  function popAt(text, world, cls = '') {
    const [x, y, z] = project(world);
    if (z > 1) return;
    hud.pop(text, x, y, cls);
  }

  function addScore(n, world, label, cls = '') {
    if (!n) return;
    state.score += n;
    hud.setScore(state.score, true);
    if (world) popAt(label || `+${n}`, world, cls);
  }

  function renderBoard() {
    hud.setBoard({
      round: `${ROUNDS[state.round].toUpperCase()} · MATCH ${state.round + 1}/3`,
      me: fencerName,
      foe: opp().name,
      mine: state.myTouches,
      theirs: state.foeTouches,
      to: TOUCHES
    });
    salle.score.setScore(state.myTouches, state.foeTouches);
  }

  function coach(key, html, ms = 3200) {
    if (!state.tutorial || state.coached[key]) return;
    state.coached[key] = true;
    hud.coach(html);
    clearTimeout(state.coachTimer);
    state.coachTimer = hud.later(() => hud.coach(''), ms);
  }

  /* ---- Screens and flow ----------------------------------------------- */

  /** The champion hands Pekkas Pokal back to its table. */
  function putTrophyBack() {
    if (!me.trophy) return;
    me.dropTrophy();
    salle.returnTrophy();
  }

  function showTitle() {
    putTrophyBack();
    state.phase = 'title';
    state.phaseT = 0;
    hud.setMode('title');
    hud.screen(titleScreen({ fencer: fencerName, best, medals, played }));
    // Masks off, at ease: the two of you, waiting for the draw
    foe.setPerson(OPPONENTS[0].name, OPPONENTS[0].sock);
    animMe.play('ease');
    animAi.play('ease');
    me.setBaseExpression('smile');
    foe.setBaseExpression('smile');
    salle.crowd.react('idle');
    salle.referee.signal('idle');
  }

  function startTournament() {
    sfx.resume();
    salle.crowd.setNames(watchers());
    played = true;
    state.score = 0;
    state.round = 0;
    state.results = [];
    state.bracket = makeBracket(fencerName, rand);
    hud.setScore(0);
    showBracket();
  }

  function showBracket() {
    state.phase = 'bracket';
    state.phaseT = 0;
    hud.setMode('bracket');
    // The next opponent steps up, mask in hand: you see who it is
    foe.setPerson(opp().name, opp().sock);
    hud.screen(bracketScreen({
      bracket: state.bracket, round: state.round, results: state.results, opp: opp(), place: opp().place
    }));
    animMe.play('ease');
    animAi.play('ease');
    me.setBaseExpression('neutral');
    foe.setBaseExpression(['smile', 'focus', 'smile'][state.round]);
    foe.express(['smile', 'focus', 'grin'][state.round], 0.7, 1.6);
  }

  function startBout() {
    sfx.resume();
    hud.screen('');
    // The salute is ceremony: the board shows, the controls wait for »En garde«
    hud.setMode('intro');
    state.myTouches = 0;
    state.foeTouches = 0;
    state.streak = 0;
    state.stats = { parries: 0, ripostes: 0, feints: 0, bestStreak: 0 };
    state.lastTouch = null;
    rec.n = 0;
    rec.events.length = 0;
    meS.line = 1;
    hud.setLine(1);
    renderBoard();
    salle.score.clear();
    // Intro: the salute, while the camera comes round from the opponent's mask
    state.phase = 'intro';
    state.phaseT = 0;
    animMe.play('salute', 2.2);
    animAi.play('salute', 2.2);
    [animAi, animMe].forEach((a) => {
      a.ox = 0;
      a.step = null;
    });
    hud.call(opp().name.toUpperCase(), 'name');
    hud.sub(`${ROUNDS[state.round]} · ${opp().title}`);
    me.setBaseExpression('focus');
    foe.setBaseExpression('focus');
    salle.crowd.react('clap');
    sfx.applause(1.6, 0.6);
    camCut = 'intro';
  }

  function startReady() {
    state.phase = 'ready';
    state.phaseT = 0;
    hud.setMode('duel');
    state.readyStep = 0;
    meS.pose = 'guard';
    meS.t = 0;
    meS.resolved = false;
    ai.pose = 'guard';
    ai.t = 0;
    ai.pendingRiposte = false;
    ai.timer = opp().attackEvery[0] + rand() * (opp().attackEvery[1] - opp().attackEvery[0]);
    if (state.tutorial && state.round === 0 && state.firstAttack) ai.timer = 1.4;
    // Back to the en-garde lines for the next phrase, a step at a time
    [animAi, animMe].forEach((a) => {
      if (Math.abs(a.ox) > 0.01) {
        a.step = null;
        a.stepBy(-a.ox, 0.45);
      }
    });
    hud.call('EN GARDE');
    sfx.ready(0);
    salle.referee.signal('engarde');
    salle.crowd.react('idle');
    if (state.myTouches === TOUCHES - 1 || state.foeTouches === TOUCHES - 1) {
      sfx.heartbeat();
      hud.sub(state.myTouches === TOUCHES - 1 && state.foeTouches === TOUCHES - 1 ? 'AVGÖRANDE TUSCH' : 'MATCHTUSCH', 'gold');
    }
  }

  function goLive() {
    state.phase = 'live';
    state.phaseT = 0;
    hud.call('KÖR!', 'go');
    sfx.ready(2);
    salle.referee.signal('allez');
    coach('start', coarse
      ? '<b>Gardera</b> med HÖG · MITT · LÅG, eller svep upp och ned. <b>STÖT</b> anfaller.'
      : '<b>↑ ↓</b> byter gard · <b>mellanslag</b> stöter · <b>F</b> fintar.', 3600);
  }

  /** `via`: how the referee explains it — 'point', 'parry' (riposte) or 'attack' (right of way). */
  function scoreTouch(mine, points, label, at, via = 'point') {
    state.phase = 'touch';
    state.phaseT = 0;
    const hitAt = at || (mine ? foe : me).j.torso.getWorldPosition(new THREE.Vector3()).setY(1.2);
    state.lastTouch = { t: gameTime, mine, at: hitAt.clone() };
    logEvent('touch', hitAt, { mine });
    sfx.hit();
    sfx.buzzer();
    kick(mine ? 1.3 : 1.6, 130);
    salle.score.flash(mine ? 0 : 1);
    // The attacker who had right of way is also the scorer: one side for both arms
    salle.referee.signal(via, mine ? -1 : 1);
    flashes.fire(hitAt, mine ? new THREE.Color(1.2, 2.6, 1.5) : new THREE.Color(2.6, 1.1, 0.8), 0.7, 0.4);
    sparks.burst(hitAt, { n: 26, speed: 3.2, color: new THREE.Color(3, 2.6, 1.8), life: 0.55 });
    (mine ? animAi : animMe).flash = 1;
    (mine ? animAi : animMe).impulse(P.lean, -2.4);
    (mine ? animAi : animMe).impulse(P.nod, -3);
    (mine ? me : foe).express('grin', 1, 1.3);
    (mine ? foe : me).express('frown', 1, 1.3);
    if (mine) {
      state.myTouches++;
      state.streak++;
      state.stats.bestStreak = Math.max(state.stats.bestStreak, state.streak);
      const streakBonus = state.streak >= 2 ? 50 * (state.streak - 1) : 0;
      addScore(points, v3.copy(hitAt).setY(hitAt.y + 0.5), label, label.startsWith('RIPOST') ? 'gold' : '');
      if (streakBonus) {
        hud.combo(`${state.streak} I RAD +${streakBonus}`);
        state.score += streakBonus;
        hud.setScore(state.score, true);
      }
      hud.call('TUSCH!', 'me');
      hud.flash('rgba(61,220,123,0.55)');
      salle.crowd.react('cheer');
      sfx.cheer();
    } else {
      state.foeTouches++;
      state.streak = 0;
      hud.call('TUSCH EMOT', 'them');
      hud.flash('rgba(255,77,60,0.5)');
      salle.crowd.react('groan');
      sfx.groan();
    }
    renderBoard();
  }

  function endTouchPause() {
    salle.score.clear();
    if (state.myTouches >= TOUCHES || state.foeTouches >= TOUCHES) {
      startReplay();
      return;
    }
    startReady();
  }

  /* ---- Replay of the deciding touch ----------------------------------- */

  const replay = { t: 0, t0: 0, t1: 0, at: null, last: 0, angle: 0 };

  function startReplay() {
    const lt = state.lastTouch;
    if (!lt || rec.n < 10) {
      endBout();
      return;
    }
    const oldest = rec.t[(rec.head - rec.n + REC) % REC];
    replay.t0 = Math.max(oldest, lt.t - 1.1);
    replay.t1 = Math.min(gameTime, lt.t + 0.5);
    replay.t = replay.t0;
    replay.last = replay.t0;
    replay.hit = lt.t;
    replay.at = lt.at.clone();
    replay.angle = lt.mine ? -0.28 : 0.28;
    state.phase = 'replay';
    state.phaseT = 0;
    hud.setMode('replay');
    hud.bars(true);
    hud.showReplay(true);
    sfx.slowmo();
    trailMe.reset();
    trailAi.reset();
  }

  /** Pose at time t, interpolated from the ring buffer. */
  function sampleRec(t, arr, out) {
    let lo = -1;
    for (let k = 0; k < rec.n; k++) {
      const i = (rec.head - 1 - k + REC * 2) % REC;
      if (rec.t[i] <= t) {
        lo = i;
        break;
      }
    }
    if (lo < 0) return;
    const hi = (lo + 1) % REC;
    const span = rec.t[hi] - rec.t[lo];
    const k = hi !== rec.head && span > 0 ? Math.min(1, (t - rec.t[lo]) / span) : 0;
    for (let c = 0; c < POSE_LEN; c++) {
      const a = arr[lo * POSE_LEN + c];
      out[c] = a + ((hi !== rec.head ? arr[hi * POSE_LEN + c] : a) - a) * k;
    }
  }

  function updateReplay(dt) {
    // Normal-ish speed into the touch, very slow through it, then ease out
    const d = replay.t - replay.hit;
    const speed = d < -0.3 ? 0.6 : d < 0.12 ? 0.16 : 0.45;
    const prev = replay.t;
    replay.t = Math.min(replay.t1, replay.t + dt * speed);
    sampleRec(replay.t, rec.a, me.pose);
    sampleRec(replay.t, rec.b, foe.pose);
    me.apply(me.pose);
    foe.apply(foe.pose);
    aimHeads();
    me.update(replay.t - prev);
    foe.update(replay.t - prev);
    rec.events.forEach((e) => {
      if (e.t > prev && e.t <= replay.t) {
        if (e.type === 'touch') {
          flashes.fire(e.pos, e.mine ? new THREE.Color(1.2, 2.6, 1.5) : new THREE.Color(2.6, 1.1, 0.8), 0.8, 1.2);
          sparks.burst(e.pos, { n: 30, speed: 1.4, color: new THREE.Color(3, 2.6, 1.8), life: 1.6, gravity: 2 });
          salle.score.flash(e.mine ? 0 : 1);
          sfx.buzzer(0.5);
          sfx.hit();
        } else if (e.type === 'clink') {
          sparks.burst(e.pos, { n: 18, speed: 1.2, color: new THREE.Color(3, 2.4, 1.4), life: 1.2, gravity: 2 });
          flashes.fire(e.pos, new THREE.Color(2.4, 2.2, 1.8), 0.6, 0.8);
          sfx.clink(0.6);
        }
      }
    });
    replay.angle -= dt * 0.09 * Math.sign(replay.angle);
    if (replay.t >= replay.t1) endReplay();
    return replay.t - prev;
  }

  function endReplay() {
    hud.bars(false);
    hud.showReplay(false);
    salle.score.clear();
    endBout();
  }

  /* ---- Bout and tournament end ---------------------------------------- */

  function endBout() {
    const won = state.myTouches >= TOUCHES;
    const o = opp();
    const margin = state.myTouches - state.foeTouches;
    const shutout = won && state.foeTouches === 0;
    const bonus = won ? 500 + margin * 100 + (shutout ? 300 : 0) : 0;
    if (won) addScore(bonus);
    state.results.push({ won, opp: o.name, s: [state.myTouches, state.foeTouches] });
    state.phase = 'result';
    state.phaseT = 0;
    hud.setMode('result');
    animMe.play(won ? 'win' : 'lose', 1);
    animAi.play(won ? 'lose' : 'win', 1);
    me.setBaseExpression(won ? 'grin' : 'frown');
    foe.setBaseExpression(won ? 'frown' : 'smile');
    salle.referee.signal('award', won ? -1 : 1);
    salle.crowd.react(won ? 'clap' : 'groan');
    if (won) {
      sfx.verdictWin();
      sfx.applause(2.4);
    } else sfx.verdictLose();
    if (state.tutorial) {
      state.tutorial = false;
      save(KEY_TUTOR, true);
    }
    hud.screen(resultScreen({
      won, opp: o, mine: state.myTouches, theirs: state.foeTouches, bonus, margin, shutout,
      stats: state.stats, last: state.round >= 2
    }));
  }

  function next() {
    const last = state.results[state.results.length - 1];
    if (last && last.won && state.round < 2) {
      state.round++;
      showBracket();
      return;
    }
    if (last && last.won) {
      startCeremony();
      return;
    }
    showFinal();
  }

  function medalFor() {
    const last = state.results[state.results.length - 1];
    if (last.won) return 1;
    return [0, 3, 2][state.round];
  }

  function startCeremony() {
    state.phase = 'ceremony';
    state.phaseT = 0;
    hud.screen('');
    hud.setMode('ceremony');
    hud.bars(true);
    hud.call('MÄSTARE!', 'gold big');
    hud.sub(`${fencerName} · Stockholm 2023`, 'gold');
    animMe.play('champion', 1);
    animAi.play('lose', 1);
    // Pekkas Pokal comes off its table and goes up in the champion's hand
    me.holdTrophy(salle.lendTrophy());
    me.setBaseExpression('grin');
    foe.setBaseExpression('smile');
    salle.crowd.react('stand');
    salle.referee.signal('award', -1);
    confetti.start(-HOME, 0);
    sfx.fanfare();
    camCut = 'ceremony';
  }

  function showFinal() {
    hud.bars(false);
    confetti.stop();
    const medal = medalFor();
    const isBest = state.score > best;
    if (isBest) {
      best = state.score;
      save(KEY_HIGH, best);
      hud.setBest(best);
    }
    const prev = medals[fencerName] || 0;
    if (medal && (!prev || medal < prev)) {
      medals = { ...medals, [fencerName]: medal };
      save(KEY_MEDALS, medals);
    }
    if (medal && medal > 1) sfx.medal(medal);
    state.phase = 'final';
    state.phaseT = 0;
    hud.setMode('final');
    animMe.play(medal === 1 ? 'champion' : 'ease');
    animAi.play('ease');
    me.setBaseExpression(medal ? 'smile' : 'neutral');
    foe.setBaseExpression('smile');
    salle.crowd.react(medal === 1 ? 'clap' : 'idle');
    hud.screen(finalScreen({
      medal, score: state.score, best, isBest, fencer: fencerName, results: state.results
    }));
  }

  /* ---- Combat resolution (timings as measured in v1) ------------------ */

  function playerLunge(isFeint) {
    if (state.phase !== 'live' || meS.pose === 'lunge' || meS.pose === 'stagger') return;
    meS.pose = isFeint ? 'feint' : 'lunge';
    meS.t = 0;
    meS.resolved = false;
    meS.lungeLine = meS.line;
    meS.isFeint = isFeint;
    hud.press(isFeint ? el.feint : el.lunge);
    if (isFeint) sfx.feint();
    else sfx.swish();
  }

  function resolvePlayerAttack() {
    me.tipWorld(tipMe);
    if (meS.isFeint) {
      // A feint commits to nothing — but a napping opponent may bite
      if ((ai.pose === 'guard' || ai.pose === 'telegraph') && rand() < opp().parryP * 1.15) {
        ai.pose = 'bitten';
        ai.t = 0;
        hud.call('DEN GICK PÅ FINTEN!', 'teal');
        foe.express('surprised', 0.9, 0.8);
        hud.sub('STÖT NU!', 'teal');
        sfx.scrape();
        sfx.clink(0.5);
        sparks.burst(tipMe, { n: 10, speed: 2, color: new THREE.Color(2.6, 2.4, 2), life: 0.35 });
        kick(0.3, 50);
        salle.crowd.react('ooh');
        coach('bitten', '<b>Öppen linje!</b> Stöt direkt — fint-tusch ger 150.');
      }
      return;
    }
    if (ai.pose === 'stagger' || ai.pose === 'bitten' || ai.pose === 'recover') {
      // Open target: riposte after a parry, a bitten feint, or a punished recovery
      const riposte = ai.pose === 'stagger';
      const feintHit = ai.pose === 'bitten';
      if (riposte) state.stats.ripostes++;
      if (feintHit) state.stats.feints++;
      if (riposte) hud.sub('PARAD — RIPOST!', 'gold');
      scoreTouch(true, riposte ? 175 : feintHit ? 150 : 100,
        riposte ? 'RIPOST +175' : feintHit ? 'FINT-TUSCH +150' : '+100', tipMe.clone(), riposte ? 'parry' : 'point');
      return;
    }
    if (ai.pose === 'telegraph' || ai.pose === 'attack') {
      // Attacking into an attack: right of way belongs to them
      sparks.burst(tipMe, { n: 8, speed: 1.6, color: new THREE.Color(2.4, 2, 1.6), life: 0.3 });
      hud.sub('VÄGRÄTT TILL MOTSTÅNDAREN', 'red');
      coach('row', '<b>Rätten till anfall:</b> stöt inte in i deras anfall — parera först.', 3600);
      scoreTouch(false, 0, '', me.j.torso.getWorldPosition(new THREE.Vector3()).setY(1.25), 'attack');
      return;
    }
    // Opponent on guard: they may read it and parry
    if (rand() < opp().parryP) {
      ai.pose = 'parry';
      ai.line = meS.lungeLine;
      ai.t = 0;
      meS.pose = 'stagger';
      meS.t = 0;
      me.express('surprised', 0.8, 0.8);
      clash(tipMe, 0.9);
      sfx.stagger();
      hud.sub('PARERAD', 'red');
      // …and the better ones riposte
      if (rand() < opp().riposteP) ai.pendingRiposte = true;
    } else {
      scoreTouch(true, 100, '+100', tipMe.clone());
    }
  }

  /** Blade on blade: sparks where the steel meets, a ring and a beat of hit-stop. */
  function clash(at, power) {
    sfx.clink(power);
    kick(0.55 * power, 70);
    sparks.burst(at, { n: Math.round(22 * power), speed: 3.4, color: new THREE.Color(3.2, 2.5, 1.5), life: 0.45, width: 0.014 });
    flashes.fire(at, new THREE.Color(2.4, 2.2, 1.8), 0.55, 0.22);
    logEvent('clink', at);
    salle.crowd.react('ooh');
  }

  function resolveAiAttack() {
    foe.tipWorld(tipAi);
    if (meS.pose !== 'lunge' && meS.pose !== 'stagger' && meS.line === ai.line) {
      // Parried! The Nidhogg rule: same line blocks
      ai.pose = 'stagger';
      ai.t = 0;
      meS.pose = 'parry';
      meS.t = 0;
      state.stats.parries++;
      foe.express('surprised', 0.8, 0.9);
      // Sparks where the blades actually meet: a little short of the tip
      me.midWorld(v3).lerp(tipAi, 0.5);
      clash(v3, 1);
      addScore(25, v3.clone().setY(v3.y + 0.3), 'PARAD +25', 'teal');
      hud.call('PARAD!', 'teal');
      hud.sub('RIPOSTERA — STÖT!', 'gold');
      coach('parried', '<b>Nu!</b> Motståndaren vacklar — tryck <b>STÖT</b> för ripost.', 2600);
    } else {
      scoreTouch(false, 0, '', tipAi.clone(), ai.riposting ? 'parry' : 'point');
    }
  }

  /* ---- AI (logic unchanged from v1; telegraph made easier to read) ---- */

  function updateAi(dt) {
    ai.t += dt;
    const o = opp();
    switch (ai.pose) {
      case 'guard': {
        ai.timer -= dt;
        // Drift the guard line around so the player has something to read
        if (rand() < dt * 0.7) ai.line = Math.floor(rand() * 3);
        // Footwork: small advances and retreats, keeping the distance alive
        if (rand() < dt * 0.6 && animAi.stepBy(animAi.ox > 0.05 ? -0.12 : animAi.ox < -0.05 ? 0.12 : (rand() < 0.5 ? -0.1 : 0.1))) {
          sfx.footfall(0.7);
        }
        if (ai.timer <= 0 && state.phase === 'live') {
          ai.pose = 'telegraph';
          ai.t = 0;
          ai.line = Math.floor(rand() * 3);
          ai.shownLine = ai.line;
          ai.willFeint = rand() < o.feintP;
          // The very first attack you ever face is slower and honest
          ai.tele = state.tutorial && state.firstAttack ? o.telegraph * 1.7 : o.telegraph;
          if (state.firstAttack && state.tutorial) ai.willFeint = false;
          state.firstAttack = false;
          foe.express('frown', 0.6, ai.tele);
          sfx.coil();
          salle.crowd.react('tense');
          coach('read', `<b>Anfall i ${LINE_NAME[ai.line]}!</b> Välj samma linje för att parera.`, 2200);
        }
        if (ai.pendingRiposte && meS.pose !== 'stagger') ai.pendingRiposte = false;
        break;
      }
      case 'telegraph': {
        const tele = ai.tele || o.telegraph;
        if (ai.willFeint && ai.t > tele * 0.62 && ai.shownLine === ai.line) {
          // The switch: the real attack moves to another line late
          let other = Math.floor(rand() * 3);
          while (other === ai.line) other = Math.floor(rand() * 3);
          ai.line = other;
          ai.shownLine = other;
          ai.switchT = 0.25;
          sfx.feint();
          hud.sub(`BYTER TILL ${LINE_NAME[other]}!`, 'red');
        }
        if (ai.t >= tele) {
          ai.pose = 'attack';
          ai.t = 0;
          ai.resolved = false;
          ai.riposting = false;
          sfx.swish();
        }
        break;
      }
      case 'attack': {
        if (!ai.resolved && ai.t >= o.attackDur * 0.7) {
          ai.resolved = true;
          if (state.phase === 'live') resolveAiAttack();
        }
        if (ai.t >= o.attackDur + 0.12) {
          ai.pose = 'recover';
          ai.t = 0;
        }
        break;
      }
      case 'recover': {
        if (ai.t >= 0.55) {
          ai.pose = 'guard';
          ai.timer = o.attackEvery[0] + rand() * (o.attackEvery[1] - o.attackEvery[0]);
        }
        break;
      }
      case 'parry': {
        if (ai.pendingRiposte && ai.t >= 0.24 && state.phase === 'live') {
          ai.pendingRiposte = false;
          ai.pose = 'attack';
          ai.t = 0;
          ai.resolved = false;
          ai.riposting = true;
          ai.line = Math.floor(rand() * 3);
          ai.shownLine = ai.line;
          sfx.swish();
          break;
        }
        if (ai.t >= 0.5) {
          ai.pose = 'guard';
          ai.timer = 0.8 + rand() * 1.2;
        }
        break;
      }
      case 'stagger': {
        if (ai.t >= 0.85) {
          ai.pose = 'guard';
          ai.timer = 1.0 + rand() * 1.4;
        }
        break;
      }
      case 'bitten': {
        if (ai.t >= 0.7) {
          ai.pose = 'guard';
          ai.timer = 1.0 + rand() * 1.2;
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * The distance game, played for you: when the opponent steps in you
   * give ground, when he drifts back you follow — a beat late, one foot
   * then the other, like a fencer keeping measure.
   */
  function keepMeasure(dt) {
    if (meS.pose !== 'guard' || animMe.step) return;
    meS.measureT = (meS.measureT || 0) - dt;
    if (meS.measureT > 0) return;
    const want = Math.max(-0.16, Math.min(0.12, -animAi.ox * 0.8));
    const d = want - animMe.ox;
    if (Math.abs(d) > 0.06) {
      if (animMe.stepBy(Math.max(-0.12, Math.min(0.12, d)))) sfx.footfall(1);
      meS.measureT = 0.25 + rand() * 0.3;
    } else if (rand() < dt * 0.35) {
      // A small step of your own now and then: the piste is never still
      if (animMe.stepBy(animMe.ox > 0.02 ? -0.08 : 0.08)) sfx.footfall(0.8);
      meS.measureT = 0.6 + rand() * 0.6;
    }
  }

  function updatePlayer(dt) {
    meS.t += dt;
    keepMeasure(dt);
    if (meS.pose === 'lunge' && meS.t >= 0.24 && !meS.resolved) {
      meS.resolved = true;
      resolvePlayerAttack();
    }
    if (meS.pose === 'lunge' && meS.t >= 0.44) meS.pose = 'guard';
    if (meS.pose === 'feint' && meS.t >= 0.18 && !meS.resolved) {
      meS.resolved = true;
      resolvePlayerAttack();
    }
    if (meS.pose === 'feint' && meS.t >= 0.3) meS.pose = 'guard';
    if (meS.pose === 'stagger' && meS.t >= 0.7) meS.pose = 'guard';
    if (meS.pose === 'parry' && meS.t >= 0.22) meS.pose = 'guard';
  }

  /** Mirror the logic poses onto the animators. */
  function syncAnims() {
    const o = opp();
    const durs = { lunge: 0.44, feint: 0.3, stagger: 0.7, parry: 0.22 };
    animMe.act = meS.pose;
    animMe.t = meS.t;
    animMe.dur = durs[meS.pose] || 0.3;
    animMe.opts = { hitAt: 0.24 };
    animMe.line = meS.pose === 'lunge' || meS.pose === 'feint' ? meS.lungeLine : meS.line;
    const aiDur = {
      telegraph: ai.tele || o.telegraph, attack: o.attackDur + 0.12, recover: 0.55, parry: 0.5, stagger: 0.85, bitten: 0.7
    };
    animAi.act = ai.pose;
    animAi.t = ai.t;
    animAi.dur = aiDur[ai.pose] || 0.3;
    animAi.opts = { hitAt: o.attackDur * 0.7 };
    animAi.line = ai.pose === 'telegraph' ? ai.shownLine : ai.line;
  }

  /* ---- Input ---------------------------------------------------------- */

  function setLine(i) {
    if (state.phase !== 'live' && state.phase !== 'ready' && state.phase !== 'intro') return;
    if (i === meS.line) return;
    meS.line = i;
    hud.setLine(i);
    sfx.step();
  }

  function primary() {
    const btn = el.panel.querySelector('[data-act]');
    if (btn && el.screen.classList.contains('show')) act(btn.dataset.act);
  }

  function act(name) {
    sfx.resume();
    if (name === 'start') startTournament();
    else if (name === 'fight') startBout();
    else if (name === 'next') next();
    else if (name === 'again') showTitle();
  }

  /** Clicked buttons drop focus, so a later Space lunges instead of re-clicking them. */
  function unfocus() {
    document.activeElement?.blur?.();
  }

  function onPanelClick(e) {
    unfocus();
    const chip = e.target.closest('[data-fencer]');
    if (chip) {
      fencerName = chip.dataset.fencer;
      save(KEY_FENCER, fencerName);
      // Dress the one you picked; the others take their places on the benches
      me.setPerson(fencerName, MY_SOCK);
      me.express('smile', 0.8, 1.2);
      salle.crowd.setNames(watchers());
      el.panel.querySelectorAll('[data-fencer]').forEach((c) => c.classList.toggle('on', c === chip));
      sfx.resume();
      sfx.step();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (btn) act(btn.dataset.act);
  }

  function skipReplay() {
    if (state.phase === 'replay' && state.phaseT > 0.3) endReplay();
    else if (state.phase === 'ceremony' && state.phaseT > 1) showFinal();
  }

  function onKeyDown(e) {
    const k = e.key;
    if (k === '?' || (k === 'Escape' && helpOpen)) {
      setHelp(k === '?' ? !helpOpen : false);
      return;
    }
    if (helpOpen || e.repeat) return;
    if (state.phase === 'replay' || state.phase === 'ceremony') {
      skipReplay();
      return;
    }
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (el.screen.classList.contains('show')) primary();
      else if (k === ' ') playerLunge(false);
      return;
    }
    if (k === 'ArrowUp' || k === 'w' || k === 'W') {
      e.preventDefault();
      setLine(Math.max(0, meS.line - 1));
    } else if (k === 'ArrowDown' || k === 's' || k === 'S') {
      e.preventDefault();
      setLine(Math.min(2, meS.line + 1));
    } else if (k === '1' || k === '2' || k === '3') setLine(Number(k) - 1);
    else if (k === 'f' || k === 'F' || k === 'k' || k === 'K') playerLunge(true);
    else if (k === 'j' || k === 'J') playerLunge(false);
  }

  // Vertical swipes anywhere on the piste also move the guard
  let swipe = null;
  function onPointerDown(e) {
    sfx.resume();
    if (state.phase === 'replay' || state.phase === 'ceremony') {
      skipReplay();
      return;
    }
    swipe = { y: e.clientY, line: meS.line };
  }
  function onPointerMove(e) {
    if (!swipe) return;
    const dy = e.clientY - swipe.y;
    if (Math.abs(dy) > 36) {
      setLine(Math.max(0, Math.min(2, meS.line + (dy < 0 ? -1 : 1))));
      swipe.y = e.clientY;
    }
  }
  function onPointerUp() {
    swipe = null;
  }

  function setHelp(open) {
    helpOpen = open;
    el.help.hidden = !open;
  }

  const lineDown = (e) => {
    e.preventDefault();
    sfx.resume();
    setLine(Number(e.currentTarget.dataset.line));
  };
  const lungeDown = (e) => {
    e.preventDefault();
    sfx.resume();
    playerLunge(false);
  };
  const feintDown = (e) => {
    e.preventDefault();
    sfx.resume();
    playerLunge(true);
  };
  const muteClick = () => {
    unfocus();
    sfx.resume();
    sfx.setMuted(!sfx.muted);
    el.mute.classList.toggle('off', sfx.muted);
  };
  const infoClick = () => {
    unfocus();
    setHelp(!helpOpen);
  };
  const helpCloseClick = () => {
    unfocus();
    setHelp(false);
  };

  canvasHost.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  el.panel.addEventListener('click', onPanelClick);
  el.lineBtns.forEach((b) => b.addEventListener('pointerdown', lineDown));
  el.lunge.addEventListener('pointerdown', lungeDown);
  el.feint.addEventListener('pointerdown', feintDown);
  el.mute.addEventListener('click', muteClick);
  el.info.addEventListener('click', infoClick);
  el.helpClose.addEventListener('click', helpCloseClick);
  el.replay.addEventListener('pointerdown', skipReplay);

  /* ---- Camera --------------------------------------------------------- */

  let aspect = 1.6;
  let viewW = 1;
  let viewH = 1;
  // `shift`: where on screen the look point lands (0..1, 0.5 = centre) — an
  // off-axis projection, so a subject can stand beside or above a panel
  // without the camera turning away from it
  const cam = {
    pos: new THREE.Vector3(0, 2.4, 10), look: new THREE.Vector3(0, 2, 0), fov: 36, roll: 0, shift: new THREE.Vector2(0.5, 0.5)
  };
  const goal = {
    pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 36, roll: 0, rate: 3, shift: new THREE.Vector2(0.5, 0.5)
  };

  /**
   * The duel framing by aspect. Landscape is the hero: side-on, a little
   * low, both fencers, the three windows and their shafts, the
   * chandeliers at the top corners. Portrait swings round behind your
   * shoulder so the opponent faces the camera and their blade's line
   * reads vertically — the tall axis is the one a phone has to spare.
   */
  function duelFrame(out) {
    const k = smoothstep(0.62, 1.25, aspect);
    out.pos.set(lerp(-5.0, 0, k), lerp(2.1, 1.4, k), lerp(4.7, 7.1, k));
    out.look.set(lerp(0.02, 0, k), lerp(1.08, 1.62, k), lerp(-0.1, 0, k));
    out.fov = lerp(44, 36, k);
    // Phone landscape is short: come closer, the duel fits the width anyway
    out.pos.z -= smoothstep(1.7, 2.2, aspect) * 0.9;
    out.roll = 0;
  }

  /**
   * The screens around the duel put a panel over the salle; frame the
   * person the screen is about beside it. Portrait: the panel sits at the
   * bottom, the person stands whole in the top half. Landscape: the panel
   * sits on the right, the person on the left third.
   */
  function screenSubject() {
    const ph = state.phase;
    const portrait = aspect < 0.9;
    if (ph === 'bracket') return foe;
    if (ph === 'result') return state.results.length && state.results[state.results.length - 1].won ? me : foe;
    if (ph === 'title' && portrait) return me;
    if (ph === 'final' && !portrait) return me;
    return null;
  }

  function cameraGoal(t) {
    duelFrame(goal);
    goal.rate = 3;
    goal.shift.set(0.5, 0.5);
    const ph = state.phase;
    const subject = screenSubject();
    if (subject) {
      subject.j.torso.getWorldPosition(v3);
      const drift = Math.sin(t * 0.11) * 0.18;
      if (aspect < 0.9) {
        const d = ph === 'title' ? 6.1 : 7.1;
        goal.look.set(v3.x, 0.92, 0);
        goal.pos.set(v3.x + 0.5 + drift, 1.3, d);
        goal.fov = 40;
        goal.shift.set(0.5, ph === 'title' ? 0.27 : 0.24);
      } else {
        // Closer on short landscape phones: the person fills the height
        // (the champion holds the cup up high: frame a little taller)
        const tall = ph === 'final' ? 1 : 0;
        const d = lerp(4.6, 3.9, smoothstep(1.6, 2.1, aspect)) + tall * 0.7;
        goal.look.set(v3.x, 1.02 + tall * 0.3, 0);
        goal.pos.set(v3.x + 0.35 + drift, 1.32, d);
        goal.fov = 34;
        goal.shift.set(lerp(0.3, 0.26, smoothstep(1.6, 2.1, aspect)), 0.5);
      }
      goal.rate = 1.6;
    } else if (ph === 'title' || ph === 'bracket' || ph === 'final' || ph === 'result') {
      // Slow drift, pulled back, the salle as the backdrop for the panels
      goal.pos.x += Math.sin(t * 0.08) * 1.1;
      goal.pos.y += 0.35;
      goal.pos.z += 1.2;
      goal.look.y += 0.35;
      goal.rate = 1.2;
      if (ph === 'title' && aspect >= 0.9) {
        // The title panel is on the left: the two of you, at ease, stand in
        // the right half with the windows and the benches behind
        goal.look.set(0, 1.28, 0);
        goal.pos.set(0.7 + Math.sin(t * 0.08) * 0.7, 1.7, 7.4);
        goal.shift.set(lerp(0.63, 0.78, smoothstep(1.4, 2.1, aspect)), 0.5);
      }
    } else if (ph === 'touch' && state.lastTouch) {
      // Punch in on the point of contact, a slight Dutch angle
      const { at } = state.lastTouch;
      const push = reduced ? 0.25 : 0.5;
      goal.pos.lerp(v3.copy(at).add(v3b.set(0, 0.25, 0).add(goal.pos).sub(at).setLength(2.6)), push);
      goal.look.lerp(at, 0.6);
      goal.fov *= reduced ? 0.95 : 0.84;
      goal.roll = reduced ? 0 : (state.lastTouch.mine ? -0.035 : 0.035);
      goal.rate = state.phaseT < 0.4 ? 9 : 2.5;
    } else if (ph === 'replay') {
      // Low and side-on, close, drifting slowly past the point of contact
      const { at } = replay;
      const a = replay.angle;
      goal.look.set(at.x * 0.3, at.y - 0.12, 0);
      if (aspect < 0.9) {
        // Portrait keeps its over-the-shoulder angle, pushed in and lowered
        goal.pos.lerp(goal.look, 0.3).add(v3.set(a * 1.5, -0.45, 0));
        goal.fov = 42;
      } else {
        goal.pos.set(goal.look.x + Math.sin(a) * 4.3, at.y - 0.25, Math.cos(a) * 4.3);
        goal.fov = 34;
      }
      goal.roll = 0;
      goal.rate = state.phaseT < 0.05 ? 60 : 4;
    } else if (ph === 'ceremony') {
      me.j.torso.getWorldPosition(v3);
      // A slow orbit, low, looking up at the cup held high
      const a = 0.75 + state.phaseT * 0.12;
      goal.look.copy(v3).setY(1.62);
      const d = aspect < 0.9 ? 4.8 : 3.9;
      goal.pos.set(v3.x + Math.sin(a) * d, 1.15, v3.z + Math.cos(a) * d);
      goal.fov = aspect < 0.9 ? 52 : 40;
      goal.rate = 2;
    } else {
      // Live: follow the centre of the action a little; lean in on telegraphs
      const mid = (me.group.position.x + me.pose[P.px] + foe.group.position.x - foe.pose[P.px]) / 2;
      goal.look.x += mid * 0.4;
      goal.pos.x += mid * 0.25;
      if (ai.pose === 'telegraph' && ph === 'live') goal.fov *= 0.97;
      goal.pos.y += Math.sin(t * 0.5) * 0.02;
      if (ph === 'intro') goal.rate = 1.5;
    }
  }

  function updateCamera(dt, t) {
    if (camCut === 'intro') {
      // Start on the opponent's mask, then let the rate carry us out
      foe.j.head.getWorldPosition(v3);
      const portrait = aspect < 0.9;
      cam.pos.set(v3.x - 1.3, v3.y + 0.05, v3.z + (portrait ? 1.9 : 1.5));
      cam.look.copy(v3);
      cam.fov = portrait ? 44 : 30;
      cam.shift.set(0.5, 0.5);
      camCut = '';
    } else if (camCut === 'ceremony') {
      camCut = '';
    }
    cameraGoal(t);
    const k = 1 - Math.exp(-goal.rate * dt);
    cam.pos.lerp(goal.pos, k);
    cam.look.lerp(goal.look, k);
    cam.fov += (goal.fov - cam.fov) * k;
    cam.roll += (goal.roll - cam.roll) * k;
    cam.shift.lerp(goal.shift, k);
    camera.position.copy(cam.pos);
    if (shake.power > 0.001) {
      shake.power = Math.max(0, shake.power - dt * 4);
      const s = shake.power * 0.05;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    camera.lookAt(cam.look);
    camera.rotateZ(cam.roll);
    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    applyShift(cam.shift.x, cam.shift.y);
  }

  function applyShift(cx, cy) {
    const sx = cx - 0.5;
    const sy = cy - 0.5;
    if (Math.abs(sx) > 1e-3 || Math.abs(sy) > 1e-3) {
      const v = camera.view;
      const ox = -sx * viewW;
      const oy = -sy * viewH;
      if (!v || !v.enabled || Math.abs(v.offsetX - ox) > 0.05 || Math.abs(v.offsetY - oy) > 0.05 || v.fullWidth !== viewW || v.fullHeight !== viewH) {
        camera.setViewOffset(viewW, viewH, ox, oy, viewW, viewH);
      }
    } else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  }

  /* ---- Sizing --------------------------------------------------------- */

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    renderer.getDrawingBufferSize(rtSize);
    bloom.setSize(Math.round(rtSize.x / 2), Math.round(rtSize.y / 2));
    aspect = w / h;
    viewW = w;
    viewH = h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    salle.setMoteScale(rtSize.y * 0.05);
    hudHost.dataset.orient = aspect < 0.9 ? 'portrait' : 'landscape';
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Frame-time watchdog: drop bloom, then resolution, then shadows -- */
  const perf = { acc: 0, n: 0, level: 0, slow: 0, age: 0 };
  /** `frameDt`: the real time this frame took (not the simulation's clamped step). */
  function watchPerf(frameDt) {
    perf.age += frameDt;
    // Skip the first seconds: shader compiles and texture uploads stall frames
    if (!adaptive || perf.level >= 3 || perf.age < 4) return;
    perf.acc += frameDt;
    perf.n++;
    if (perf.acc < 2.5) return;
    const avg = perf.acc / perf.n;
    perf.acc = 0;
    perf.n = 0;
    if (avg <= 0.028) {
      perf.slow = 0;
      return;
    }
    // Two slow windows in a row before stepping down: one hitch (a GC, a
    // notification sliding in) does not make a slow device
    perf.slow++;
    if (perf.slow < 2) return;
    perf.slow = 0;
    perf.level++;
    // Only ever down. A step with nothing to give (bloom already off on a
    // GPU without float targets) passes straight on to the next one.
    if (perf.level === 1) {
      if (bloom.enabled) {
        bloom.enabled = false;
        return;
      }
      perf.level = 2;
    }
    if (perf.level === 2 && pixelRatio > 1.01) {
      pixelRatio = Math.max(1, pixelRatio * 0.75);
      renderer.setPixelRatio(pixelRatio);
      resize();
      return;
    }
    perf.level = 3;
    // Half the shadow map: a uniform change, no shader recompiles
    const { key } = salle.lights;
    key.shadow.mapSize.multiplyScalar(0.5);
    if (key.shadow.map) {
      key.shadow.map.dispose();
      key.shadow.map = null;
    }
  }

  /* ---- Loop ----------------------------------------------------------- */

  let raf = 0;
  let last = performance.now();
  let running = true;

  function stepDuel(dt) {
    state.phaseT += dt;
    const ph = state.phase;
    if (ph === 'intro') {
      if (state.phaseT >= 2.25) startReady();
    } else if (ph === 'ready') {
      const step = Math.floor(state.phaseT / 0.7);
      if (step > state.readyStep && step < 3) {
        state.readyStep = step;
        hud.call(['EN GARDE', 'KLARA', 'KÖR!'][step], step === 2 ? 'go' : '');
        sfx.ready(step);
      }
      if (state.phaseT >= 1.5) goLive();
    } else if (ph === 'live') {
      updateAi(dt);
      updatePlayer(dt);
    } else if (ph === 'touch') {
      meS.t += dt;
      ai.t += dt;
      // Hold the tableau a moment, then both come back to guard
      if (state.phaseT > 0.62 && (meS.pose !== 'guard' || ai.pose !== 'guard')) {
        meS.pose = 'guard';
        ai.pose = 'guard';
      }
      if (state.phaseT >= 1.35) endTouchPause();
    }
    if (ph === 'intro') return;
    if (state.phase === 'ready' || state.phase === 'live' || state.phase === 'touch') syncAnims();
  }

  function updateTelegraph(dt, t) {
    const live = state.phase === 'live';
    // Glint on the attacking blade
    if (ai.pose === 'telegraph' && live) {
      const k = ai.t / (ai.tele || opp().telegraph);
      foe.tipWorld(tipAi);
      glint.position.copy(tipAi);
      const flick = ai.switchT > 0 ? 1.5 : 1;
      glintMat.opacity = Math.min(1, (0.35 + Math.sin(k * Math.PI) * 0.55 + Math.sin(t * 22) * 0.1) * flick);
      glint.scale.setScalar((0.5 + k * 0.45) * flick);
      glint.material.rotation = t * 1.5;
      // Where it is going to land, on you
      const covered = meS.line === ai.shownLine;
      me.j.torso.getWorldPosition(v3);
      threat.position.set(v3.x + 0.24, me.lineWorldY(ai.shownLine), v3.z + 0.25);
      threatMat.color.set(covered ? 0x7fe8ff : 0xff5a46);
      threatMat.opacity = 0.55 + Math.sin(t * 18) * 0.25;
      threat.scale.setScalar(0.3 + Math.sin(k * Math.PI) * 0.08);
      hud.setThreat(ai.shownLine, covered);
      if (ai.switchT > 0) ai.switchT -= dt;
    } else {
      glintMat.opacity = Math.max(0, glintMat.opacity - dt * 6);
      threatMat.opacity = Math.max(0, threatMat.opacity - dt * 6);
      hud.setThreat(-1, false);
    }
  }

  /* ---- Where everyone looks ------------------------------------------ */
  const headMe = new THREE.Vector3();
  const headFoe = new THREE.Vector3();
  const floorMe = new THREE.Vector3();
  const floorFoe = new THREE.Vector3();
  const focus = new THREE.Vector3(0, 1.1, 0);

  /** In the bout the fencers watch each other; at ease they find the camera. */
  function aimHeads() {
    const ph = state.phase;
    me.j.head.getWorldPosition(headMe).y += 0.1;
    foe.j.head.getWorldPosition(headFoe).y += 0.1;
    floorMe.set(me.group.position.x + 0.5, 0, 0.9);
    floorFoe.set(foe.group.position.x - 0.5, 0, 0.9);
    let a = headFoe;
    let b = headMe;
    let wa = 1;
    let wb = 1;
    if (ph === 'title' || ph === 'final') {
      a = camera.position;
      b = camera.position;
      wa = 0.7;
      wb = 0.7;
    } else if (ph === 'bracket') {
      b = camera.position;
      wa = 0.6;
    } else if (ph === 'result') {
      const won = state.results.length && state.results[state.results.length - 1].won;
      a = won ? camera.position : floorMe;
      b = won ? floorFoe : camera.position;
      wa = won ? 0.8 : 0.6;
      wb = won ? 0.6 : 0.8;
    } else if (ph === 'ceremony') {
      a = camera.position;
      wa = 0.8;
    }
    me.look = a;
    me.lookWeight = wa;
    foe.look = b;
    foe.lookWeight = wb;
  }

  let frozen = false; // test hook: hold the simulation, keep rendering
  let camOverride = null; // test hook: a fixed camera for close-ups
  let renderBudget = Infinity; // test hook: frames left to draw (slow software GL)

  /** One step of the world. Kept apart from rendering so tests can step it. */
  function simulate(realDt) {
    clock += realDt;
    const t = clock;
    // Hit-stop: the world nearly freezes for a few frames on impact
    let dt = realDt;
    if (hitStop > 0) {
      hitStop -= realDt;
      dt *= 0.04;
    }

    const ph = state.phase;
    const ctxMe = { dist: HOME * 2, oppPx: foe.pose[P.px], lines: foe.lines, front: foe.front };
    const ctxAi = { dist: HOME * 2, oppPx: me.pose[P.px], lines: me.lines, front: me.front };
    let trailDt = dt;

    if (ph === 'replay') {
      state.phaseT += realDt;
      trailDt = updateReplay(realDt);
    } else {
      if (!helpOpen) {
        if (ph === 'intro' || ph === 'ready' || ph === 'live' || ph === 'touch') stepDuel(dt);
        else state.phaseT += dt;
        if (ph === 'ceremony' && state.phaseT > 5.2) showFinal();
      }
      gameTime += dt;
      animMe.update(dt, ctxMe);
      animAi.update(dt, ctxAi);
      me.apply(me.pose);
      foe.apply(foe.pose);
      aimHeads();
      me.update(dt);
      foe.update(dt);
      if (state.phase === 'ready' || state.phase === 'live' || state.phase === 'touch') record();
    }
    updateCords();
    // Trails only for strikes and beats — a salute should not leave a smear
    trailMe.gain = STRIKES.has(animMe.act) ? 1 : 0;
    trailAi.gain = STRIKES.has(animAi.act) ? 1 : 0;
    trailMe.push(me.tipWorld(tipMe), me.midWorld(v3), trailDt);
    trailAi.push(foe.tipWorld(tipAi), foe.midWorld(v3), trailDt);

    updateTelegraph(dt, t);
    const fxDt = ph === 'replay' ? realDt * 0.35 : dt;
    sparks.update(fxDt);
    flashes.update(fxDt);
    confetti.update(dt);
    // Heads in the salle follow the action: the blades, or the touch
    if (ph === 'touch' && state.lastTouch) focus.copy(state.lastTouch.at);
    else if (ph === 'replay') focus.copy(replay.at);
    else focus.copy(tipMe).add(tipAi).multiplyScalar(0.5);
    salle.update(t, ph === 'replay' ? realDt * 0.3 : dt, ph === 'title' || ph === 'final' ? null : focus);

    updateCamera(realDt, t);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const realDt = clampDt(now - last);
    // Capped: one long hitch (a GC, a late compile) must not outvote a whole
    // window of good frames; a hidden tab resets `last` (onVisibility)
    const frameDt = Math.min(0.5, Math.max(0, (now - last) / 1000));
    last = now;
    if (!running) return;
    watchPerf(frameDt);
    if (!frozen) simulate(realDt);
    if (renderBudget <= 0) return;
    renderBudget--;
    if (camOverride) {
      applyShift(0.5, 0.5);
      camera.position.copy(camOverride.pos);
      camera.lookAt(camOverride.look);
      camera.fov = camOverride.fov;
      camera.updateProjectionMatrix();
    }
    renderer.info.reset();
    drawFrame();
    watchdog.afterFrame();
  }

  function drawFrame() {
    if (usePost) composer.render();
    else renderer.render(scene, camera);
  }

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
    if (sfx.ctx) {
      if (document.hidden) sfx.ctx.suspend();
      else sfx.ctx.resume();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  showTitle();
  // Open on the at-ease pose (no springing in from en garde) and pose
  // everyone once before the shaders compile
  animMe.snap({ dist: HOME * 2, oppPx: 0, lines: foe.lines, front: foe.front });
  animAi.snap({ dist: HOME * 2, oppPx: 0, lines: me.lines, front: me.front });
  simulate(1 / 60);

  // Compile every shader before the first frame without locking the GPU
  // (Windows/Direct3D can reset the GPU on one long blocking compile).
  // Hidden things — confetti, flashes, crowd poses not in use — come along.
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  // With the composer in use three draws into a render target (linear, no
  // tone mapping) — compile those program variants, not the screen ones
  await precompile(renderer, scene, camera, usePost ? { target: composer.renderTarget1 } : {});
  hidden.forEach((o) => {
    o.visible = false;
  });
  last = performance.now();
  raf = requestAnimationFrame(tick);

  /* Deterministic hooks for automated tests */
  window.__ppFakt = {
    state,
    me: meS,
    ai,
    startGame() {
      startTournament();
      startBout();
    },
    nextStage() {
      primary();
    },
    setLine,
    playerLunge,
    forceTouch(mine = true) {
      if (state.phase === 'live') scoreTouch(mine, mine ? 100 : 0, '+100');
    },
    aiAttackNow(line = 1) {
      if (state.phase === 'live' && ai.pose === 'guard') {
        ai.pose = 'telegraph';
        ai.tele = opp().telegraph;
        ai.t = ai.tele - 0.01;
        ai.line = line;
        ai.shownLine = line;
        ai.willFeint = false;
      }
    },
    telegraphNow(line = 0) {
      if (state.phase === 'live' && ai.pose === 'guard') ai.timer = 0;
      ai.line = line;
    },
    openAi() {
      ai.pose = 'stagger';
      ai.t = 0;
    },
    goLive() {
      if (state.phase === 'intro') startReady();
      if (state.phase === 'ready') goLive();
    },
    skip() {
      skipReplay();
    },
    /** Run the world forward by `sec` seconds in 60 Hz steps, without rendering. */
    advance(sec) {
      for (let i = 0; i < Math.round(sec * 60); i++) simulate(1 / 60);
    },
    freeze(on = true) {
      frozen = on;
    },
    /** Draw only `n` more frames (Infinity = normal). Lets slow test GPUs catch up. */
    frames(n = Infinity) {
      renderBudget = n;
    },
    view(pos, look, fov = 30) {
      camOverride = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov } : null;
    },
    pickFencer(name) {
      if (!PICKABLE.includes(name)) return;
      fencerName = name;
      me.setPerson(name, MY_SOCK);
      salle.crowd.setNames(watchers());
    },
    info() {
      return {
        phase: state.phase,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        bloom: bloom.enabled,
        post: usePost,
        shadows: renderer.shadowMap.enabled,
        watchdog: watchdog.level,
        pixelRatio,
        people: { me: me.name, foe: foe.name, meTris: me.triangles, foeTris: foe.triangles, crowdCalls: salle.crowd.drawCalls }
      };
    },
    /** Camera and where the fencers' feet and heads land on screen (framing checks). */
    camInfo() {
      const r = (v) => Math.round(v * 100) / 100;
      const sc = (w) => project(w).slice(0, 2).map(r);
      const out = { aspect: r(aspect), pos: camera.position.toArray().map(r), fov: r(camera.fov) };
      [['me', me], ['foe', foe]].forEach(([n, f]) => {
        out[n] = { feet: sc(f.group.localToWorld(new THREE.Vector3(0, 0, 0))), head: sc(f.j.head.getWorldPosition(new THREE.Vector3())) };
      });
      return out;
    },
    /** The animators (footwork, actions) for tests. */
    anims() {
      return { me: animMe, ai: animAi };
    },
    /** Both feet of a fencer: [x, y, pitch] in its own frame (no sliding checks). */
    feet(mine = true) {
      const p = (mine ? me : foe).pose;
      const r = (v) => Math.round(v * 1000) / 1000;
      return { front: [r(p[P.ffx]), r(p[P.ffy]), r(p[P.ffp])], back: [r(p[P.bfx]), r(p[P.bfy]), r(p[P.bfp])], px: r(p[P.px]) };
    },
    /** Make the referee give a signal now (tests). */
    referee(kind, side = 0) {
      salle.referee.signal(kind, side);
    },
    /** Force frame-time adaptation on (tests); returns its state. */
    perf(on = true) {
      adaptive = on;
      return { ...perf, bloom: bloom.enabled, pixelRatio, shadowSize: salle.lights.key.shadow.mapSize.x };
    },
    /** The two fencers (people, masks, foils) for close inspection in tests. */
    fencers() {
      return { me, foe };
    },
    /** Tip of a fencer's blade and the point it aims at (for reach checks). */
    reach(mine = true) {
      const f = mine ? me : foe;
      const o = mine ? foe : me;
      const tip = f.tipWorld(new THREE.Vector3());
      // The opponent's pelvis, then his chest surface towards us
      const pelvis = o.group.position.x + (mine ? -1 : 1) * o.pose[P.px];
      const tx = pelvis + (mine ? -1 : 1) * o.front;
      return { tip: tip.toArray(), targetX: tx, lines: o.lines.map((y) => y + PISTE_TOP), bend: f.pose[P.bend] };
    }
  };

  /* ---- Teardown ------------------------------------------------------- */

  function destroy() {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    hud.dispose();
    if (window.__ppFakt) delete window.__ppFakt;
    gfx.dispose();
    watchdog.dispose();

    putTrophyBack();
    me.dispose();
    foe.dispose();
    sparks.dispose();
    trailMe.dispose();
    trailAi.dispose();
    flashes.dispose();
    confetti.dispose();
    salle.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    [glow, star, ring].forEach((tx) => tx.dispose());
    envRT.dispose();
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    composer.passes.forEach((p) => p.dispose && p.dispose());
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (sfx.ctx) sfx.ctx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createFencing;
export { OPPONENTS };
