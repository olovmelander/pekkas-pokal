/**
 * Pekkas Pokal Flipper — a Three.js pinball table.
 *
 * Loaded on demand from the Spel tab. Everything (physics, art, audio) is
 * generated at runtime, so the only download is Three.js itself.
 *
 * Files: physics (2D collision), table (layout + playfield print), meshes
 * (the machine in 3D), room (the arcade around it), dmd (the dot-matrix
 * display), fx (sparks, flashes, trails), audio (synthesised sound), hud (the
 * DOM layer), scores (the topplista) and this one, the game loop and rules.
 */

import * as THREE from 'three';
import { createGameClock } from '../shared/game-clock.js';
import { hasCommandModifier } from '../shared/keyboard.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { guardRenderer, postTarget, addSanitize, RenderWatchdog, gfxNotice, precompile } from '../shared/gfx.js';

import { World, Ball, clamp, closestOnSegment } from './physics.js';
import { drainDisposition } from './ball-lifecycle.js';
import { L, buildColliders, createPlayfieldCanvas } from './table.js';
import { buildTable, createMaterials, machineEnvironment, bakeStatic, ballEnvironment } from './meshes.js';
import { CAB, ROOM, headTop, buildCabinet, buildGlass } from './cabinet.js';
import { createShowcase } from './showcase.js';
import { Dmd, fmtScore } from './dmd.js';
import { Sfx } from './audio.js';
import { createFx } from './fx.js';
import { buildRoom } from './room.js';
import { buildHud, boardHtml, startSheet, nameSheet, overSheet } from './hud.js';
import {
  BOARD_SIZE, loadBoard, saveBoard, qualifies, rankOf, insertScore, shortName, lastName, rememberName
} from './scores.js';

/**
 * Fill the whole stage. Pinball is a portrait game, but on a wide screen the
 * machine stands in its arcade with the HUD either side of it, instead of in
 * a column between black bars.
 */
export const layout = 'full';

/**
 * Point lights are candela and fall off with 1/d². At this table's scale
 * (≈35 units across a 42" playfield) a lamp three units off the wood needs an
 * intensity in the tens before it puts any light down at all — which is why
 * the old rig, with every lamp set to about 1, was lit almost entirely by the
 * environment map and had no pools anywhere on the playfield. Every lamp is
 * expressed as a multiple of this so the numbers stay readable.
 */
const LAMP = 16;

const BALLS_PER_GAME = 3;
const BALL_SAVE_MS = 9000;
// Hidden grace after the save lamp goes out (ms)
const BALL_SAVE_GRACE = 1200;
// Skill shot: three plunger-strength lanes, one lit per ball. Each is as
// wide as the old single band, so it is no harder to hit, and the further
// the lane reaches the more it pays.
const SKILL_BANDS = [
  { lo: 0.22, hi: 0.4, pts: 5000, name: 'LÅG' },
  { lo: 0.45, hi: 0.63, pts: 7500, name: 'MITT' },
  { lo: 0.68, hi: 0.86, pts: 10000, name: 'HÖG' }
];
// Mission select: the ball waits in the castle this long at most, or this
// long after the last change, before the gren on show starts by itself
const SELECT_MAX = 8;
const SELECT_IDLE = 4;
// What one ball's play counts toward the end-of-ball bonus
const freshPerBall = () => ({ bumps: 0, targets: 0, orbits: 0, ramps: 0, trolls: 0, combos: 0, storms: 0, gates: 0 });

// Where the HUD sits in portrait: a row of chips and buttons across the top,
// the plunger meter / nudge button along the bottom. The machine is framed
// into what is left.
const PORTRAIT_INSETS = { l: 4, r: 4, t: 66, b: 80 };
const LANDSCAPE_INSETS = { l: 0, r: 0, t: 10, b: 6 };
// Narrower than this either side and the side panels don't fit: use the
// portrait HUD over a wide canvas instead
const MIN_SIDE = 210;

/* -------------------------------------------------------------------- game */

export async function createPinball(container, opts = {}) {
  const participants = opts.participants || [];
  const names = [...new Set(participants.map(shortName).filter(Boolean))];
  const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  const reduceMotion = mq('(prefers-reduced-motion: reduce)');
  const touch = mq('(pointer: coarse)');
  // Phones and small tablets get a smaller shadow map
  const small = touch || Math.min(window.innerWidth, window.innerHeight) < 600;

  const root = document.createElement('div');
  root.className = 'pbf';
  root.dataset.orient = 'port';
  container.appendChild(root);
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  root.appendChild(canvasHost);
  const hud = buildHud(root, { touch });
  const plungerHint = hud.plungerLabel.textContent;

  // Timers and deadlines share active play time: help, tab switches and
  // lost focus cannot consume a skill shot, serve a ball or end a round.
  const gameClock = createGameClock();
  let running = true;
  const later = (fn, ms) => gameClock.schedule(fn, ms / 1000);

  const sfx = new Sfx();

  /**
   * Haptics on phones: a tick per flip, a thud per bumper, patterns for the
   * big moments. The mute button silences these too — it is the "be quiet"
   * switch, and a phone buzzing in a meeting is not quiet.
   */
  const canBuzz = touch && typeof navigator.vibrate === 'function';
  const buzz = (pattern) => {
    if (!canBuzz || sfx.muted) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      /* some browsers throw outside a gesture */
    }
  };

  /* ---- Renderer ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // The renderer is fragment-bound (clearcoat playfield, GI lamps, glass
  // glare), and fragment cost scales with the SQUARE of this. Phones run at
  // device ratios of 3 and up, so 1.75 is already a downsample. A landscape
  // stage is far bigger than the old portrait column, so desktop starts a
  // little lower and the frame-time watchdog below trims further if needed.
  const dprMax = Math.min(window.devicePixelRatio || 1, touch ? 1.75 : 1.6);
  let dpr = dprMax;
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  // r187 removed PCFSoftShadowMap. PCF now filters with hardware comparison
  // and a Vogel disk whose spread is light.shadow.radius, set on the key.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  canvasHost.appendChild(renderer.domElement);
  // Real GPUs are stricter than the test machine's software one: a render
  // target they can actually draw into, an on-screen notice if a shader
  // fails, ?gfx=safe for no post-processing (see shared/gfx.js)
  const gfx = guardRenderer(renderer, container);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050c);
  scene.fog = new THREE.Fog(0x03050c, 58, 118);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 260);

  /* ---- Environment reflections ---- */
  // A purpose-built arcade room rather than three's studio RoomEnvironment.
  // A studio box lights every metal surface evenly, which is exactly why the
  // rails used to read as grey plastic: chrome needs something bright AND
  // something dark to reflect before it looks like metal at all.
  let pmrem = new THREE.PMREMGenerator(renderer);
  // Both rooms are painted on a 2D canvas, then prefiltered into a render
  // target. A lost WebGL context takes the targets with it (see
  // restoreEnvironments), so bake() is kept for painting them again.
  const bake = (paint) => {
    const source = paint(THREE);
    try {
      return pmrem.fromEquirectangular(source);
    } finally {
      source.dispose();
    }
  };
  let envRT = bake(machineEnvironment);
  let environmentRestorePending = false;
  scene.environment = envRT.texture;
  scene.environmentIntensity = 1;

  /* ---- Table ---- */
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (e) {
      /* fonts are cosmetic */
    }
  }
  const logo = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = new URL('logo-pekkas-pokal.png', document.baseURI).toString();
  });
  const { canvas: pfCanvas } = createPlayfieldCanvas(participants, logo);
  const pfTexture = new THREE.CanvasTexture(pfCanvas);
  pfTexture.colorSpace = THREE.SRGBColorSpace;
  pfTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const materials = createMaterials(THREE, pfTexture);
  const { group: tableGroup, refs } = buildTable(THREE, mergeGeometries, materials);
  scene.add(tableGroup);
  // Phone tier: small movers stop casting into the shadow map — each caster
  // is one more draw call every frame, and at phone size these shadows are a
  // pixel or two. The ball, flippers, castle and plastics keep theirs.
  if (small) {
    refs.targets.forEach((t) => {
      t.face.castShadow = false;
    });
    refs.bumpers.forEach((b) => {
      b.group.children[0].castShadow = false; // the skirt (the cap still casts)
    });
    refs.jackpot.trophy.children.slice(1).forEach((h) => {
      h.castShadow = false; // the handles
    });
    refs.trolls.forEach((tr) => {
      tr.group.children[0].castShadow = false;
    });
    refs.spinner.blade.castShadow = false;
  }

  // The ball mirrors a room made for it (see ballEnvironment)
  let ballEnvRT = bake(ballEnvironment);
  materials.ball.envMap = ballEnvRT.texture;

  // Ball mesh pool for multiball, plus parked meshes for locked balls
  // Four: a two-ball multiball plus add-a-ball, with one more on a wireform
  const ballMeshes = [refs.ball];
  for (let i = 1; i < 4; i++) {
    const m = refs.ball.clone();
    m.visible = false;
    tableGroup.add(m);
    ballMeshes.push(m);
  }
  // One contact shadow per pooled ball, parented to the table so it inherits
  // the shake. Kept just above the wood and drawn after it, with a polygon
  // offset so it stays above the wood in any depth buffer.
  const ballShadows = ballMeshes.map(() => {
    const m = new THREE.Mesh(
      refs.contactGeometry,
      new THREE.MeshBasicMaterial({
        map: refs.contactTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4
      })
    );
    m.scale.setScalar(L.ballRadius * 3.3);
    m.visible = false;
    m.renderOrder = 1;
    tableGroup.add(m);
    return m;
  });

  const lockMeshes = L.lockSlots.map((s) => {
    const m = refs.ball.clone();
    m.position.set(s.x, L.ballRadius + 0.04, -s.y);
    m.visible = false;
    tableGroup.add(m);
    return m;
  });

  // Bumper ring materials are cloned so each bumper can show its own
  // charged state on the way to lighting the lock. Sling faces likewise,
  // since the shared glow material now also colours the castle flags.
  refs.bumpers.forEach((b) => {
    b.ring.material = b.ring.material.clone();
  });
  [refs.leftSling, refs.rightSling].forEach((m) => {
    m.material = m.material.clone();
  });
  Object.values(refs.rampArches).forEach((m) => {
    m.material = m.material.clone();
  });

  /* ---- Cabinet with its DMD, the glass, and the room around it ---- */
  const dmd = new Dmd(THREE, { calm: reduceMotion });
  // Phones get the cabinet art at half resolution: it is off-frame in play
  const cab = buildCabinet(THREE, materials, logo, dmd.material, { lite: small });
  bakeStatic(THREE, mergeGeometries, cab.group);
  scene.add(cab.group);
  const glass = buildGlass(THREE);
  scene.add(glass);
  const glassSheet = glass.userData.sheet;
  const room = buildRoom(THREE, { mergeGeometries, materials });
  scene.add(room.group);
  // Attract-mode camera round the machine (wide screens only, see fitCamera)
  const showcase = createShowcase(THREE, { CAB, ROOM, reduceMotion });
  let showcaseOk = false;
  let overSince = 0;
  const fx = createFx(THREE, tableGroup, { ballRadius: L.ballRadius });

  /* ---- Lights ----
     A real machine has one lighting hierarchy and it is worth copying: a
     handful of always-on GI lamps tucked under the plastics around the
     PERIMETER and inside the pop nest, the backbox throwing light down the
     table, and flashers on top for events. */
  // The room's broad top light. A hemisphere rather than a flat ambient: the
  // playfield faces up and takes the sky term, while undersides and the
  // cabinet interior take the darker ground term, so the table gets vertical
  // shape for free. Doing this here instead of in the environment map keeps
  // the clearcoat reflecting discrete fixtures rather than a grey sheet.
  scene.add(new THREE.HemisphereLight(0xcbd9ff, 0x151a30, 1.05));

  const key = new THREE.DirectionalLight(0xfff3e0, 1.55);
  key.position.set(9, 30, -6);
  key.target.position.set(0, 0, -20);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(small ? 1024 : 2048);
  key.shadow.camera.near = 6;
  key.shadow.camera.far = 70;
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.bias = -0.0016;
  // The Vogel disk compares taps up to `radius` texels from the centre
  // against one depth, so a receiver that slopes away from the light (the
  // wall faces, the castle) needs more than the depth bias alone or it
  // breaks into acne stripes — worst on GPUs with coarser depth.
  key.shadow.normalBias = 0.035;
  // Vogel-disk spread in texels (r187 PCF): soft edges without the old
  // PCFSoft cost. Scaled with the map so the penumbra stays the same size.
  key.shadow.radius = small ? 2.5 : 4;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x7c8cf8, 0.55);
  rim.position.set(-12, 12, -46);
  scene.add(rim);

  // GI lamps: low, short range, out at the edges where the real ones hide
  // under the plastics. Short range is the point — it is the falloff between
  // them that gives the playfield its pools and its shape. Warm at the
  // perimeter, neutral down the middle: all-amber GI turns a blue playfield
  // brown, and modern GI mixes white with warm accents.
  const GI_WARM = 0xffe0bc;
  const GI_COOL = 0xdfe9ff;
  // Kept deliberately short. Every point light is a per-fragment loop over
  // the whole table, and this is a phone-first game.
  const GI = [
    [-6.8, 7.5, GI_COOL], [4.4, 7.5, GI_COOL], // either side of the flippers
    [-1.2, 13.5, GI_WARM], // over the hero logo, below the target banks
    [-8.4, 17.5, GI_COOL], [5.4, 17.0, GI_COOL], // beside the target banks
    [-1.2, 24.0, GI_WARM], // inside the pop bumper nest
    [-1.2, 30.5, GI_WARM], // up under the castle plastics
    [7.8, 20.0, GI_COOL] // the shooter lane, or the ball vanishes in it
  ];
  const GI_INTENSITY = 1.85 * LAMP;
  const giLamps = GI.map(([x, y, color]) => {
    const lamp = new THREE.PointLight(color, GI_INTENSITY, 24, 2);
    lamp.position.set(x, 3.4, -y);
    lamp.userData.home = new THREE.Color(color);
    scene.add(lamp);
    return lamp;
  });

  /**
   * Turn the general illumination over. A real machine recolours its whole GI
   * string when a mode starts, and because these lamps sit at the perimeter
   * the change sweeps in from the edges instead of switching a single pool.
   * The lamp driver applies it every frame, so shows can flicker over it.
   */
  const gi = { color: null, intensity: GI_INTENSITY };
  function setGI(color = null, intensity = GI_INTENSITY) {
    gi.color = color === null ? null : new THREE.Color(color);
    gi.intensity = intensity;
  }

  /* ---- Post-processing ---- */
  // Our own target: the composer's default is half-float without MSAA, which
  // some GPUs cannot render into at all (a black screen) and which leaves the
  // thin wireforms and rails crawling as the camera drifts with the ball.
  // postTarget() picks a format and sample count this GPU really supports.
  const composer = new EffectComposer(renderer, postTarget(gfx, { samples: small ? 2 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  // NaN/Inf → black and HDR clamped before bloom. Clamped low here: twenty
  // point lights on near-mirror chrome and a 0.09-rough ball make specular
  // glints of several hundred, and a one-pixel glint that a third-resolution
  // bloom pass catches on one frame and misses on the next is exactly a
  // flickering firefly. ACES maps everything above ~6 to white anyway, so the
  // clamp costs the picture nothing and takes the energy out of the blinking.
  addSanitize(composer);
  const sanitize = composer.passes.find((p) => p.uniforms && p.uniforms.uMax);
  if (sanitize) sanitize.uniforms.uMax.value = 6;
  // Higher threshold than before: bloom should be the lamps, the DMD and the
  // backglass blooming, not every lit gold surface bleeding into its neighbour.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.5, 0.96);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // UnrealBloomPass draws into half-float targets of its own, so without a
  // renderable float format the whole chain is skipped rather than half-run.
  let usePost = !gfx.safe && gfx.floatRT;
  let needsRedraw = true;
  const drawFrame = () => {
    if (environmentRestorePending && !document.hidden) {
      environmentRestorePending = false;
      restoreEnvironments();
    }
    if (usePost) composer.render();
    else renderer.render(scene, camera);
    needsRedraw = false;
  };

  /* ---- Physics ---- */
  // Real machines pitch the playfield at 6.5°. At this table's scale
  // (≈35 units ≈ a 42" playfield) that is g·sin(6.5°) ≈ 36.5 units/s² —
  // noticeably livelier than a shallow slope, so the ball actually runs off
  // a raised flipper instead of dawdling. Damping stays low: a waxed
  // playfield barely slows a rolling ball.
  const world = new World({ gravity: 36.5, damping: 0.1, maxSpeed: 80 });

  /**
   * Grenar — the mode ladder, named after the group's real competitions.
   * Complete P-O-K-A-L to light mode start at the LEFT ORBIT. Complete all
   * five and the left orbit starts FINALEN, the wizard mode.
   */
  const MODES = [
    // `gi`: each gren recolours the whole GI string, so a glance at the
    // table says which one is running
    { id: 'gokart', step: 2000, year: 2012, name: 'GOKART', label: 'Gokart', hint: 'Kör 3 varv — orbit eller ramp', goal: 3, time: 35, gi: 0xff8a4a },
    { id: 'femkamp', step: 1500, year: 2013, name: 'FEMKAMP', label: 'Femkamp', hint: 'Träffa 5 olika skott', goal: 5, time: 60, gi: 0xffd27a },
    { id: 'pingis', step: 300, year: 2019, name: 'PINGIS', label: 'Pingis', hint: '12 bumperträffar', goal: 12, time: 35, gi: 0x9fe6ff },
    { id: 'skytte', step: 1000, year: 2022, name: 'SKYTTE', label: 'Skytte', hint: 'Fäll P→O→K→A→L i ordning', goal: 5, time: 45, gi: 0xff6a86 },
    { id: 'fiske', step: 3000, year: 2024, name: 'FISKE', label: 'Fiske', hint: '3 napp på pokalen i borgen', goal: 3, time: 40, gi: 0x5eead4 }
  ];

  const state = {
    phase: 'idle', // idle | launch | play | between | over
    score: 0,
    ballNo: 1,
    mult: 1,
    balls: [], // live Ball objects (multiball-capable)
    pokal: [false, false, false, false, false],
    banksDone: 0,
    ballSaveUntil: 0,
    nudges: [],
    tilted: false,
    power: 0,
    charging: false,
    lastScore: 0,

    // Locks & multiball
    bumperHits: [0, 0, 0],
    bumperLit: [false, false, false],
    lockLit: false,
    locked: 0,
    multiball: false,
    jackpotLit: false,
    mbSaveUntil: 0,
    pendingServes: 0,

    // Castle gate: bashed open with 3 hits, or held open by locks/modes
    gate: { hits: 0, until: 0, bashed: false },
    // Storming: the ball reaching the trophy through a bashed-in gate.
    // Two storms light the extra ball on the Kungsvägen (once a game).
    castle: { storms: 0, ebLit: false, ebGiven: false },
    // Multiball jackpots: each one is worth more, two light the super
    // jackpot, the first lights add-a-ball on the Vallgraven
    jackpots: 0,
    superLit: false,
    addBallLit: false,
    addBallUsed: false,
    // The lit skill-shot lane for this ball (index into SKILL_BANDS)
    skill: 2,
    // Mission select: { ball, t, idle, choice, list, saveLeft } while the
    // ball waits in the castle for the player to pick a gren
    held: null,
    // Trolls: up while a gren runs, knocked down for a spell when hit
    trolls: [{ up: false, downUntil: 0 }, { up: false, downUntil: 0 }],
    spins: 0,
    // Balls riding a wireform ramp, outside the 2D simulation
    riders: [],

    // Grenar (modes)
    modeDone: new Set(),
    mode: null, // { def, progress, timeLeft, seen:Set, wizard }
    modeStartLit: false,
    finalenDone: 0,

    // Combos, bonus, extra balls
    combo: { n: 0, t: 0 },
    bonusX: 1,
    inlanes: { left: false, right: false },
    perBall: freshPerBall(),
    extraBalls: 0,
    extraBallGiven: false,
    superUntil: 0,
    // Left-outlane kickback: lit at the start of every ball, relit by
    // completing both inlanes
    kickback: true,
    // Ball save is once per ball: the relaunch does not re-arm it
    saveUsed: false,
    sensorLast: {}
  };

  let board = loadBoard();
  // A score waiting for a name on the topplista
  let pendingScore = 0;

  /* ---- HUD ---- */
  function renderBalls() {
    const left = BALLS_PER_GAME - state.ballNo + 1;
    const dots = Array.from({ length: BALLS_PER_GAME }, (_, i) => `<span class="pbf-dot ${i < left ? 'on' : ''}"></span>`);
    const extra = Array.from({ length: state.extraBalls }, () => '<span class="pbf-dot on extra"></span>');
    hud.balls.innerHTML = `${dots.join('')}${extra.join('')}<em>Boll ${Math.min(state.ballNo, BALLS_PER_GAME)} av ${BALLS_PER_GAME}</em>`;
  }

  function renderMult() {
    const bits = [];
    if (state.mult > 1) bits.push(`<b>×${state.mult}</b><span>poäng</span>`);
    if (state.bonusX > 1) bits.push(`<b>×${state.bonusX}</b><span>bonus</span>`);
    hud.mult.innerHTML = bits.join('');
  }

  function renderPokal() {
    hud.pokal.innerHTML = L.targets
      .map((t, i) => `<span class="${state.pokal[i] ? 'lit' : ''}">${t.letter}</span>`)
      .join('');
  }

  function renderGrenar() {
    const cur = state.mode ? state.mode.def.id : state.held ? state.held.list[state.held.choice].id : null;
    const next = MODES.find((m) => !state.modeDone.has(m.id));
    const rows = MODES.map((m) => {
      const cls = state.modeDone.has(m.id) ? 'won' : cur === m.id ? 'active' : !cur && next === m ? 'next' : '';
      return `<li class="${cls}"><b>'${String(m.year).slice(2)}</b><span>${m.label}</span></li>`;
    });
    const crown = cur === 'finalen' ? 'active' : state.finalenDone ? 'won' : !next ? 'next' : '';
    rows.push(`<li class="crown ${crown}"><b>👑</b><span>Finalen</span></li>`);
    hud.grenar.innerHTML = rows.join('');
  }

  // The entry just saved stays highlighted until the next game starts
  let boardHi = null;
  let boardLive = '';
  function renderBoard() {
    const playing = state.phase === 'launch' || state.phase === 'play' || state.phase === 'between';
    const html = boardHtml(board, boardHi, playing ? state.score : null);
    if (html !== boardLive) {
      boardLive = html;
      hud.board.innerHTML = html;
    }
  }

  // Kept for the rules code below: the status now lives on the DMD and the
  // goal line, which read state every frame.
  function updateStatus() {
    renderMult();
  }

  const view = { w: 1, h: 1, land: false };
  const clock = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  /** The one thing worth doing next, in words */
  function nextGoal() {
    if (state.phase === 'launch') return 'Släpp avfyraren i det turkosa fältet för skill shot';
    if (state.phase !== 'play') return '';
    if (state.tilted) return 'TILT — flipprarna är döda tills nästa boll';
    if (state.held) {
      return touch ? 'Välj gren: tryck vänster eller höger' : 'Välj gren: ← → byter · mellanslag startar';
    }
    const m = state.mode;
    if (m && m.wizard) return 'Finalen: allt räknas ×5 — håll bollarna vid liv';
    if (state.multiball) {
      if (state.jackpotLit) return state.superLit ? 'SUPER JACKPOT tänd — skjut pokalen i borgen' : 'Jackpot tänd — skjut pokalen i borgen';
      if (state.addBallLit) return 'Add-a-ball tänd — skjut höger ramp (Vallgraven)';
      return state.superLit ? 'Tänd SUPER JACKPOT: skjut en orbit eller ramp' : 'Skjut en orbit eller ramp för att tända jackpot';
    }
    if (m) {
      // Progress and the clock in the line itself: in portrait this pill is
      // the only place the gren's objective is spelled out
      if (view.land) {
        // The mode card beside the table already shows progress and clock
        if (m.def.id === 'skytte') return `Fäll ${L.targets[Math.min(4, m.progress)].letter} härnäst`;
        if (m.def.id === 'fiske') return 'Porten är öppen — skjut pokalen i borgen';
        return m.def.hint;
      }
      const left = clock(Math.max(0, Math.ceil(m.timeLeft)));
      const head = `${m.def.label} ${m.progress}/${m.def.goal}`;
      if (m.def.id === 'skytte') return `${head} · fäll ${L.targets[Math.min(4, m.progress)].letter} härnäst · ${left}`;
      if (m.def.id === 'fiske') return `${head} · skjut pokalen i borgen · ${left}`;
      return `${head} · ${m.def.hint.toLowerCase()} · ${left}`;
    }
    if (state.modeStartLit) {
      return MODES.every((x) => state.modeDone.has(x.id))
        ? 'Finalen tänd — skjut in i borgen eller vänster orbit'
        : 'Gren tänd — skjut in i borgen (eller vänster orbit)';
    }
    if (state.lockLit) return 'Låset är tänt — skjut in bollen i borgen';
    if (state.gate.bashed && gateIsOpen()) return 'Porten är nere — skjut pokalen i borgen och storma den!';
    if (state.castle.ebLit) return 'Extra boll tänd — skjut vänster ramp (Kungsvägen)';
    if (state.gate.hits > 0) return `Porten ${state.gate.hits}/3 — slå in den med ${3 - state.gate.hits} smäll till`;
    const left = state.pokal.filter((x) => !x).length;
    const charged = state.bumperLit.filter(Boolean).length;
    return `Fäll P-O-K-A-L (${left} kvar) · bumprarna laddar låset (${charged}/3)`;
  }

  let goalShown = null;
  function renderGoal() {
    const g = nextGoal();
    if (g === goalShown) return;
    goalShown = g;
    hud.goalText.textContent = g;
    hud.goal.classList.toggle('on', !!g);
  }

  function addScore(n) {
    const wiz = state.mode && state.mode.wizard ? 5 : 1;
    const pts = Math.round(n * state.mult * wiz);
    state.score += pts;
    return pts;
  }

  /* ---- Score pops: the points rise off the thing you hit ---- */
  const popEls = Array.from({ length: 8 }, () => {
    const el = document.createElement('span');
    el.className = 'pbf-pop';
    hud.pops.appendChild(el);
    return el;
  });
  let popNext = 0;
  const popV = new THREE.Vector3();
  function pop(text, x, y, cls = '') {
    popV.set(x, 1.8, -y);
    tableGroup.localToWorld(popV);
    popV.project(camera);
    const el = popEls[popNext];
    popNext = (popNext + 1) % popEls.length;
    el.textContent = text;
    el.className = 'pbf-pop';
    el.style.left = `${((popV.x + 1) / 2) * view.w}px`;
    el.style.top = `${((1 - popV.y) / 2) * view.h}px`;
    void el.offsetWidth;
    el.className = `pbf-pop go ${cls}`;
  }
  /** Score and show it where it happened */
  function award(n, x, y, cls = '') {
    const pts = addScore(n);
    pop(`+${fmtScore(pts)}`, x, y, cls);
    return pts;
  }

  const say = (lines, o) => dmd.say(lines, o);

  /**
   * Onboarding: a speech bubble pinned to the shot it talks about, for the
   * first few games on a device. Each tip shows once per game, one at a
   * time, and follows its target as the camera drifts.
   */
  const COACH_GAMES = 3;
  let gamesPlayed = 0;
  try {
    gamesPlayed = Number(localStorage.getItem('pbf-games')) || 0;
  } catch (e) {
    gamesPlayed = 0;
  }
  const coachState = { seen: new Set(), x: 0, y: 0, h: 0, until: 0, on: false };
  function coach(key, text, x, y, h = 1.2, ms = 3800) {
    if (gamesPlayed > COACH_GAMES || coachState.seen.has(key)) return;
    coachState.seen.add(key);
    Object.assign(coachState, { x, y, h, until: (gameClock.now * 1000) + ms, on: true });
    hud.coachText.textContent = text;
    hud.coach.hidden = false;
    hud.coach.classList.remove('go');
    void hud.coach.offsetWidth;
    hud.coach.classList.add('go');
  }
  function hideCoach() {
    coachState.on = false;
    hud.coach.hidden = true;
  }
  const coachV = new THREE.Vector3();
  function updateCoach(now) {
    if (!coachState.on) return;
    if (now > coachState.until || state.phase !== 'play') {
      hideCoach();
      return;
    }
    coachV.set(coachState.x, coachState.h, -coachState.y);
    tableGroup.localToWorld(coachV);
    coachV.project(camera);
    hud.coach.style.left = `${((coachV.x + 1) / 2) * view.w}px`;
    hud.coach.style.top = `${((1 - coachV.y) / 2) * view.h}px`;
  }

  /* ---- Effects ---- */
  const flashes = [];
  function flash(obj, light, strength = 3, base = 0) {
    if (light) {
      // `strength` and `base` are both in LAMP units, so a flasher restores
      // to the resting brightness the lamp was built with.
      light.intensity = strength * LAMP;
      // Decay proportional to the peak: a bright flasher and a dim one fade
      // over the same fifth of a second.
      flashes.push({ light, base: base * LAMP, t: 0, rate: strength * LAMP * 5 });
    }
    // Pop the mesh to a fixed size over its resting scale — never
    // cumulative, or bumpers balloon.
    if (obj) {
      if (obj.userData.baseScale === undefined) obj.userData.baseScale = obj.scale.x;
      obj.scale.setScalar(obj.userData.baseScale * 1.13);
      flashes.push({ obj, t: 0 });
    }
  }

  /* ---- Time: hit-stop and slow motion ----
     A big hit freezes the ball for a few frames so the eye registers it, and
     a saved ball drains in slow motion so the save reads as a rescue rather
     than a teleport. Only the simulation slows; lights and the DMD run on. */
  const time = { scale: 1, hold: 0, stop: 0 };
  function hitStop(ms) {
    time.stop = Math.max(time.stop, ms / 1000);
  }
  function slowMo(scale, hold) {
    time.scale = scale;
    time.hold = hold;
  }

  /* ---- Camera kick + table jolt ---- */
  const kick = { p: new THREE.Vector3(), v: new THREE.Vector3() };
  const shake = { t: 99, dur: 0, mag: 0, dirX: 0 };
  function jolt(mag, dirX = 0) {
    buzz(mag > 1 ? [40, 40, 60] : 25);
    if (reduceMotion) return;
    shake.t = 0;
    shake.dur = 0.42;
    shake.mag = mag;
    shake.dirX = dirX;
    kick.v.x += dirX * 9 * mag + (Math.random() - 0.5) * 4 * mag;
    kick.v.z += 5 * mag;
  }
  /** A downward punch of the camera for payoffs */
  function punch(mag) {
    if (!reduceMotion) kick.v.y -= 14 * mag;
  }

  function updateShake(dt) {
    // Spring the camera back to rest
    kick.v.addScaledVector(kick.p, -260 * dt).multiplyScalar(Math.max(0, 1 - 15 * dt));
    kick.p.addScaledVector(kick.v, dt);
    if (shake.t >= shake.dur) {
      tableGroup.position.set(0, 0, 0);
      tableGroup.rotation.z = 0;
      return;
    }
    shake.t += dt;
    const damp = Math.max(0, 1 - shake.t / shake.dur) ** 1.6;
    tableGroup.position.x = (Math.sin(shake.t * 56) * 0.24 + shake.dirX * 0.3) * damp * shake.mag;
    tableGroup.position.z = Math.sin(shake.t * 47 + 1.7) * 0.16 * damp * shake.mag;
    tableGroup.rotation.z = Math.sin(shake.t * 50) * 0.008 * damp * shake.mag;
  }

  /* ---- Lamp shows ---- */
  // Inserts from the drain upward, for chases
  const INSERT_ORDER = ['save', 'leftRamp', 'rightRamp', 'leftOrbit', 'castle', 'trolls'];
  const lampFx = { kind: '', t: 0, dur: 0, color: new THREE.Color() };
  let attractFlash = -1;
  function lampShow(kind, color, dur = 1.5) {
    // Reduced motion: lamps may still run up the table, but nothing strobes
    lampFx.kind = reduceMotion && kind === 'strobe' ? 'chase' : kind;
    lampFx.t = 0;
    lampFx.dur = reduceMotion ? Math.min(dur, 0.8) : dur;
    lampFx.color.set(color);
  }

  /**
   * Flasher punch: the domes on the wall tops fire, and the GI lamp beside
   * each takes the hit as a burst of coloured light (driveLamps applies it,
   * so no light is ever added or removed mid-game).
   */
  const FLASHER_GI = { left: 3, right: 7 };
  function fireFlasher(which = 'both', strength = 1) {
    if (state.phase === 'play' && strength >= 0.8) sfx.flasher(Math.min(1, strength));
    refs.flashers.forEach((f) => {
      if (which === 'both' || which === f.id) {
        f.t = 0;
        f.k = reduceMotion ? Math.min(strength, 0.6) : strength;
      }
    });
  }

  /* ---- Gameplay hooks ---- */
  // Declared up front: the hooks below close over it, but they only fire once
  // buildColliders has returned.
  let colliderRefs = null;

  /* ---- Combos: chained orbit/jackpot shots inside a rolling window ---- */
  function comboShot() {
    const now = (gameClock.now * 1000);
    if (now - state.combo.t < 3500) {
      state.combo.n++;
      state.perBall.combos++;
      const pts = addScore(1000 * 2 ** Math.min(state.combo.n - 1, 4));
      sfx.combo(state.combo.n);
      dmd.combo(state.combo.n, pts);
      const lead = state.balls[0];
      if (lead) pop(`KOMBO ×${state.combo.n}`, lead.x, lead.y + 1.4, 'combo');
      if (state.combo.n >= 3) fireFlasher(state.combo.n % 2 ? 'left' : 'right', 0.8);
    } else {
      state.combo.n = 1;
    }
    state.combo.t = now;
  }

  /* ---- Mode progress from any scoring event ---- */
  function modeEvent(kind) {
    const m = state.mode;
    if (!m || m.wizard) return;
    const { id } = m.def;
    const isLap =
      kind === 'leftOrbit' || kind === 'rightOrbit' || kind === 'leftRamp' || kind === 'rightRamp';
    if (
      (id === 'gokart' && isLap) ||
      (id === 'pingis' && kind === 'bumper') ||
      (id === 'fiske' && kind === 'jackpot')
    ) {
      m.progress++;
    } else if (id === 'femkamp') {
      if (m.seen.has(kind)) return;
      m.seen.add(kind);
      m.progress = m.seen.size;
    } else {
      return;
    }
    if (m.progress < m.def.goal) modeStep(m);
    else completeMode();
  }

  /**
   * One step of a gren: every step pays more than the one before, plays a
   * rising tick and shows the gren's own little progress scene.
   */
  function modeStep(m) {
    const { id } = m.def;
    sfx.modeTick(m.progress / m.def.goal);
    const pts = addScore((m.def.step || 1000) * m.progress);
    const lead = state.balls[0];
    if (lead) pop(`+${fmtScore(pts)}`, lead.x, lead.y + 1.2, 'sm');
    // Pingis counts every bumper, so only every third gets the scene
    if (id !== 'pingis' || m.progress % 3 === 0) dmd.modeProgress(id, m.progress, m.def.goal, `+${fmtScore(pts)}`);
  }

  const GATE_X = (L.castle.gate[0] + L.castle.gate[2]) / 2;
  const GATE_Y = L.castle.gate[1];
  // Where the shots are, read from the layout so tips and score pops follow
  // any change to the lanes: the middle of a sensor line, nudged up a little
  const spotOf = (line, up = 0) => [(line[0] + line[2]) / 2, (line[1] + line[3]) / 2 + up];
  const ORBIT_L = spotOf(L.sensors.leftOrbit);
  const ORBIT_R = spotOf(L.sensors.rightOrbit);
  const RAMP_L = spotOf(L.ramps.left.capture, -0.9);

  /* ======================= Borgen (the castle) ======================= */

  /**
   * The door's motion: `ang` 0 standing … π/2 flat on the forecourt, a
   * spring `wob` for the shudder of a hit, `rattle` for the portcullis.
   */
  const gateAnim = { ang: 0, vel: 0, wob: 0, wobV: 0, rattle: 0, glow: 0, winching: false, wasOpen: false };
  // The tower windows: candle-lit at rest, flaring on every hit, burning
  // orange while the gate is down (the castle is under siege)
  const WIN_BASE = new THREE.Color(0xffb35c);
  const WIN_HOT = new THREE.Color(0xfff0c0);
  const WIN_SIEGE = new THREE.Color(0xff6a2a);
  const winCol = new THREE.Color();

  /** Every hit on the door lands with weight: shake, splinters, flash, sound */
  function castleImpact(n, v) {
    sfx.castleHit(n);
    buzz(n >= 2 ? [30, 30, 50] : 30);
    jolt(0.55 + n * 0.15, 0);
    punch(0.25 + n * 0.1);
    hitStop(35 + n * 15);
    // The door shudders back on its hinges, the portcullis rattles
    gateAnim.wobV -= 2.2 + Math.min(40, v) * 0.05;
    gateAnim.rattle = 0.09;
    gateAnim.glow = Math.min(1, 0.55 + n * 0.15);
    fireFlasher(n % 2 ? 'left' : 'right', 0.5 + n * 0.15);
    flash(null, refs.castle.lamp, 1.6 + n * 0.6, 0.6);
    // Splinters off the planks, grit off the stone, a puff of dust
    fx.spark(GATE_X, 1.1, -GATE_Y + 0.5, 0xc08a4a, 10 + n * 5, 7 + n, 5);
    fx.spark(GATE_X, 1.6, -GATE_Y + 0.3, 0x9aa0ad, 6 + n * 3, 6, 6);
    fx.flash(GATE_X, 1.0, -GATE_Y + 0.6, 0xb59a72, 3 + n, 0.3);
  }

  /** The third hit: the door gives way and falls as a drawbridge */
  function breakGate() {
    const now = (gameClock.now * 1000);
    state.gate.hits = 0;
    state.gate.bashed = true;
    // Twelve seconds to get the ball through (it used to be nine)
    state.gate.until = now + 12000;
    sfx.gateCrash();
    dmd.gateFalls();
    gateAnim.glow = 1;
    fireFlasher('both', 1.1);
    flash(null, refs.castle.lamp, 3.4, 0.6);
    lampShow('chase', 0xff9a3c, 1.2);
    jolt(1.1, 0);
    punch(0.8);
    hitStop(80);
    fx.spark(GATE_X, 1.4, -GATE_Y + 0.4, 0xc08a4a, 30, 11, 8);
    fx.spark(GATE_X, 2.2, -GATE_Y, 0xffd27a, 16, 9, 9);
    later(() => {
      if (state.gate.bashed && gateIsOpen()) coach('storm', 'Porten är nere — skjut pokalen i borgen!', L.jackpot.x, L.jackpot.y, 2.8);
    }, 1400);
  }

  /**
   * The ball reached the trophy through the broken gate: the castle is
   * stormed. Each storm pays more; the second lights the extra ball.
   */
  function stormCastle() {
    const c = state.castle;
    c.storms++;
    state.perBall.storms++;
    const pts = award(Math.min(30000, 10000 + 5000 * (c.storms - 1)), L.jackpot.x, L.jackpot.y, 'big');
    sfx.castleStorm();
    dmd.castleStorm(c.storms, pts);
    gateAnim.glow = 1;
    fireFlasher('both', 1.3);
    buzz([30, 40, 30, 40, 90]);
    lampShow('strobe', 0xff9a3c, 1.4);
    hitStop(100);
    punch(1);
    fx.flash(L.jackpot.x, 2, -L.jackpot.y, 0xffd27a, 10, 0.45);
    fx.spark(L.jackpot.x, 2, -L.jackpot.y, 0xff9a3c, 30, 12, 9);
    // Let the ball roll out, then the castle hauls its door back up
    state.gate.until = (gameClock.now * 1000) + 1600;
    comboShot();
    if (c.storms >= 2 && !c.ebGiven && !c.ebLit) {
      c.ebLit = true;
      later(() => {
        say(['EXTRA BOLL TÄND', 'SKJUT KUNGSVÄGEN'], { prio: 2, flash: true, border: true, dur: 2.2 });
        coach('eb', 'Extra boll! Skjut vänster ramp', RAMP_L[0], RAMP_L[1]);
      }, 2900);
    }
  }

  function giveExtraBall() {
    state.extraBalls++;
    renderBalls();
    sfx.extraBall();
    dmd.extraBall();
    fireFlasher('both', 1);
    lampShow('chase', 0xff7a59, 1.2);
    buzz([40, 40, 80]);
  }

  /** Add-a-ball: one more ball into a running multiball, once per multiball */
  function addABall() {
    state.addBallLit = false;
    state.addBallUsed = true;
    state.mbSaveUntil = Math.max(state.mbSaveUntil, (gameClock.now * 1000) + 6000);
    sfx.addBall();
    dmd.addBall();
    fireFlasher('right', 1.1);
    lampShow('chase', 0x5eead4, 1.2);
    serveBall(350);
  }

  const hooks = {
    onBumper(i, v, ball, fired) {
      // Only a coil firing scores: a ball still touching the skirt while
      // the coil recharges is not another hit
      if (fired === false || v < 0.6) return;
      const b = refs.bumpers[i];
      const p = L.bumpers[i];
      award(150, p.x, p.y, 'sm');
      state.perBall.bumps++;
      sfx.at(p.x).bumper();
      buzz(12);
      flash(b.trophy, b.light, 4.6, b.base);
      // The ring yanks down and the skirt dips toward the ball (tick)
      b.fire = 1;
      if (ball) {
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const dl = Math.hypot(dx, dy) || 1;
        b.tiltX = (-dy / dl) * 0.09;
        b.tiltZ = (-dx / dl) * 0.09;
      }
      fx.flash(p.x, 1.3, -p.y, 0xffd27a, 5.5, 0.2);
      fx.spark(p.x, 0.9, -p.y, 0xffc35a, 7, 9, 3);

      // Charge the bumpers toward lighting the lock
      if (!state.multiball && state.locked < 2 && !(state.mode && state.mode.wizard)) {
        state.bumperHits[i]++;
        if (state.bumperHits[i] >= 4 && !state.bumperLit[i]) {
          state.bumperLit[i] = true;
          refs.bumpers[i].ring.material.emissiveIntensity = 2.6;
          say(['BUMPER LADDAD', `${state.bumperLit.filter(Boolean).length}/3`], { prio: 1, dur: 1 });
        }
        if (state.bumperLit.every(Boolean) && !state.lockLit) {
          state.lockLit = true;
          sfx.modeStart();
          lampShow('chase', 0x7c8cf8, 1.2);
          say(['LÅS TÄNT', 'PORTEN ÖPPNAS'], { prio: 2, flash: true, border: true, dur: 2 });
          coach('lock', 'Låset tänt — skjut in bollen i borgen', GATE_X, GATE_Y - 0.6);
          updateStatus();
        }
      }
      modeEvent('bumper');
    },
    onTroll(i, v) {
      if (v < 1) return;
      const t = state.trolls[i];
      if (!t.up) return;
      t.up = false;
      t.downUntil = (gameClock.now * 1000) + 6000;
      const p = L.trolls[i];
      award(3000, p.x, p.y);
      state.perBall.trolls = (state.perBall.trolls || 0) + 1;
      sfx.trollHit();
      jolt(0.5, 0);
      hitStop(55);
      fx.flash(p.x, 1.2, -p.y, 0x9be37a, 5, 0.26);
      fx.spark(p.x, 1.2, -p.y, 0x9be37a, 16, 10, 6);
      comboShot();
      modeEvent('troll');
      say(['KNEKT NERE!', '+3 000'], { prio: 2 });
    },
    onGate(v, _b) {
      if (v < 1.2) return;
      const now = (gameClock.now * 1000);
      if (now - (state.sensorLast.gate || 0) < 350) return;
      state.sensorLast.gate = now;
      if (gateIsOpen()) return;
      state.gate.hits = Math.min(3, state.gate.hits + 1);
      state.perBall.gates++;
      const n = state.gate.hits;
      award(500 + 500 * n, GATE_X, GATE_Y);
      castleImpact(n, v);
      if (n >= 3) breakGate();
      else dmd.castleHit(n, 3);
    },
    onSling(side, v, ball, fired) {
      // The kicker only counts when it fires (the scatter is in physics.js)
      if (fired === false || v < 1) return;
      addScore(60);
      sfx.at(side === 'left' ? -4.7 : 2.3).sling();
      buzz(9);
      const mesh = side === 'left' ? refs.leftSling : refs.rightSling;
      if (mesh) {
        mesh.material.emissiveIntensity = 4;
        flashes.push({ mat: mesh.material, base: 1.4, t: 0 });
        // The arm punches the rubber out along the face (tick springs it back)
        mesh.userData.fire = 1;
      }
      if (ball) {
        fx.flash(ball.x, 0.9, -ball.y, 0x8f9cff, 3.2, 0.16);
        fx.spark(ball.x, 0.7, -ball.y, 0xa9b4ff, 5, 7, 2);
      }
    },
    onTarget(i, v) {
      if (v < 0.6) return;
      const tp = L.targets[i];

      // SKYTTE mode: the bank must fall in exact P→O→K→A→L order
      if (state.mode && state.mode.def.id === 'skytte') {
        if (state.pokal[i]) return;
        if (i === state.mode.progress) {
          state.pokal[i] = true;
          colliderRefs.targets[i].enabled = false;
          refs.targets[i].down = true;
          state.mode.progress++;
          state.perBall.targets++;
          award(1200, tp.x, tp.y);
          sfx.target();
          fx.spark(tp.x, 0.8, -tp.y, 0xf26d8d, 10, 7, 4);
          renderPokal();
          if (state.mode.progress >= 5) completeMode();
          else modeStep(state.mode);
        } else {
          say(['FEL ORDNING', `SIKTA PÅ ${L.targets[state.mode.progress].letter}`], { prio: 2, dur: 1.2 });
          sfx.wall(20);
        }
        return;
      }

      if (state.pokal[i]) return;
      state.pokal[i] = true;
      colliderRefs.targets[i].enabled = false;
      refs.targets[i].down = true;
      award(600, tp.x, tp.y);
      state.perBall.targets++;
      sfx.target();
      fx.spark(tp.x, 0.8, -tp.y, 0xf26d8d, 10, 7, 4);
      renderPokal();
      modeEvent('target');

      if (state.pokal.every(Boolean)) {
        state.banksDone++;
        state.mult = Math.min(6, state.mult + 1);
        addScore(6000);
        sfx.complete();
        lampShow('strobe', 0xf26d8d, 1);
        if (!state.mode) {
          state.modeStartLit = true;
          const allDone = MODES.every((m) => state.modeDone.has(m.id));
          say(allDone ? ['FINALEN TÄND', 'SKJUT IN I BORGEN'] : ['P-O-K-A-L!', 'GREN TÄND · BORGEN'],
            { prio: 2, flash: true, border: true, dur: 2.2 });
          later(() => {
            if (state.modeStartLit) coach('orbit', 'Porten öppnas — skjut in i borgen och välj gren!', GATE_X, GATE_Y - 0.6);
          }, 900);
        } else {
          say(['P-O-K-A-L!', `POÄNG ×${state.mult}`], { prio: 2, flash: true, dur: 2 });
        }
        updateStatus();
        later(() => {
          if (!(state.mode && state.mode.def.id === 'skytte')) resetBank();
        }, 1700);
      } else {
        dmd.pokal(state.pokal, i);
      }
    },
    onJackpot(v, b) {
      if (v < 1) return;
      flash(refs.jackpot.trophy, refs.jackpot.light, 5, 0.85);
      const jx = L.jackpot.x;
      const jy = L.jackpot.y;

      // Multiball jackpot
      if (state.multiball && state.jackpotLit) {
        state.jackpotLit = false;
        if (state.superLit) {
          state.superLit = false;
          state.jackpots = 0;
          const sp = award(100000, jx, jy, 'big');
          sfx.superJackpot();
          dmd.superJackpot(sp);
          fireFlasher('both', 1.5);
          buzz([40, 40, 40, 40, 160]);
          hitStop(130);
          punch(1.4);
          jolt(1, 0);
          // Earned slow motion: the one payoff big enough for it
          slowMo(0.5, 0.25);
          lampShow('strobe', 0xffd166, 2.2);
          fx.flash(jx, 2, -jy, 0xffe08a, 14, 0.6);
          fx.spark(jx, 2, -jy, 0xffd27a, 48, 15, 11);
          updateStatus();
          return;
        }
        state.jackpots++;
        // Each jackpot in the same multiball is worth 10 000 more
        const pts = award(25000 + 10000 * (state.jackpots - 1), jx, jy, 'big');
        sfx.jackpot();
        dmd.jackpot(pts);
        if (state.jackpots === 1 && !state.addBallUsed && !(state.mode && state.mode.wizard)) {
          state.addBallLit = true;
          later(() => {
            if (state.addBallLit) say(['ADD-A-BALL TÄND', 'SKJUT VALLGRAVEN'], { prio: 2, border: true, dur: 1.8 });
          }, 2700);
        }
        if (state.jackpots >= 2) {
          state.superLit = true;
          later(() => {
            if (state.superLit) say(['SUPER JACKPOT', 'TÄND MED ORBIT ELLER RAMP'], { prio: 2, flash: true, dur: 2 });
          }, 2700);
        }
        fireFlasher('both', 1.3);
        buzz([30, 40, 30, 40, 90]);
        hitStop(90);
        punch(1);
        lampShow('strobe', 0xf2c14e, 1.6);
        fx.flash(jx, 2, -jy, 0xffe08a, 11, 0.45);
        fx.spark(jx, 2, -jy, 0xffd27a, 36, 13, 9);
        updateStatus();
        return;
      }

      // A running mode owns the trophy: FISKE needs these hits, so the
      // lock waits until the mode is over.
      if (state.mode && !state.mode.wizard) {
        award(2500, jx, jy);
        sfx.jackpot();
        fx.spark(jx, 2, -jy, 0xffd27a, 14, 9, 6);
        comboShot();
        modeEvent('jackpot');
        return;
      }

      // A lit gren start: the castle takes the ball in for mission select.
      // (The left orbit starts one too, but from the flippers it is the
      // hardest shot on the table; the castle is makeable from both.)
      if (state.modeStartLit && !state.multiball && b) {
        state.modeStartLit = false;
        award(2500, jx, jy);
        beginSelect(b);
        return;
      }

      // Lock a ball toward multiball
      if (state.lockLit && !state.multiball && b) {
        lockBall(b);
        return;
      }

      // In through the broken gate: the castle is stormed
      if (state.gate.bashed && (gameClock.now * 1000) < state.gate.until) {
        stormCastle();
        return;
      }

      award(2500, jx, jy);
      sfx.jackpot();
      fx.spark(jx, 2, -jy, 0xffd27a, 14, 9, 6);
      comboShot();
      modeEvent('jackpot');
    },
    onSensor(id, _v, b) {
      const now = (gameClock.now * 1000);
      if (now - (state.sensorLast[id] || 0) < 700) return;
      state.sensorLast[id] = now;
      if (state.phase !== 'play') return;

      // Wireform ramps: a fast, climbing ball is captured and carried across
      if (id === 'leftRamp' || id === 'rightRamp') {
        const side = id === 'leftRamp' ? 'left' : 'right';
        if (b && b.live && b.vy > L.ramps[side].minVy) captureRamp(side, b);
        return;
      }

      // Spinner: rides in the left orbit and pays per revolution
      if (id === 'spinner') {
        if (!b) return;
        const spins = clamp(Math.round(b.speed * 0.5), 2, 14);
        state.spins += spins;
        const per = state.mode && state.mode.wizard ? 400 : 200;
        award(spins * per, L.spinner.x, L.spinner.y, 'sm');
        sfx.spinner(spins);
        if (refs.spinner) refs.spinner.spin = spins * 1.9;
        dmd.spinner(spins);
        modeEvent('spinner');
        return;
      }

      // Outlanes: the ball is on its way out past the flipper — unless the
      // left kickback is lit, which fires it straight back up the lane
      if (id === 'outLeft' || id === 'outRight') {
        if (!b || b.vy >= 0) return;
        if (id === 'outLeft' && state.kickback) {
          state.kickback = false;
          b.vy = 38;
          b.vx = 0.4;
          award(1000, -8.1, 9.2);
          sfx.launch();
          jolt(0.6, -1);
          fx.flash(-8.1, 0.8, -9.2, 0xf2c14e, 5, 0.3);
          say('KICKBACK!', { prio: 2, flash: true, dur: 1.4 });
          updateStatus();
          return;
        }
        addScore(500);
        sfx.outlane();
        say(['UTBANAN', 'NEJ NEJ NEJ'], { prio: 1, dur: 1.3 });
        return;
      }

      if (id === 'inlaneLeft' || id === 'inlaneRight') {
        const side = id === 'inlaneLeft' ? 'left' : 'right';
        if (!state.inlanes[side]) {
          state.inlanes[side] = true;
          sfx.target();
          if (state.inlanes.left && state.inlanes.right) {
            state.inlanes.left = false;
            state.inlanes.right = false;
            state.bonusX = Math.min(6, state.bonusX + 1);
            const relit = !state.kickback;
            state.kickback = true;
            say(relit ? [`BONUS ×${state.bonusX}`, 'KICKBACK TÄND'] : [`BONUS ×${state.bonusX}`],
              { prio: state.bonusX >= 3 ? 2 : 1, dur: 1.5 });
            updateStatus();
          }
        }
        return;
      }

      // Orbits
      const op = id === 'leftOrbit' ? ORBIT_L : ORBIT_R;
      award(1500, op[0], op[1]);
      state.perBall.orbits++;
      sfx.orbit();
      comboShot();
      modeEvent(id);

      if (state.multiball && !state.jackpotLit) {
        relightJackpot();
        return;
      }

      // Super skill shot: straight around into the left orbit off the plunge
      if (id === 'leftOrbit' && now < state.superUntil) {
        state.superUntil = 0;
        const pts = award(15000, op[0], op[1], 'big');
        sfx.modeWin();
        hitStop(90);
        fireFlasher('both', 1.1);
        dmd.skillShot(pts, true);
        lampShow('strobe', 0x5eead4, 1.2);
        return;
      }

      // Mode start: with more than one gren left, the ball goes into the
      // castle and the player picks which one
      if (id === 'leftOrbit' && state.modeStartLit && !state.mode && !state.multiball) {
        state.modeStartLit = false;
        beginSelect(b);
      }
    },
    onWall(v) {
      if (v > 9) sfx.wall(v);
    },
    onFlipper(side, v, b) {
      if (v > 3) sfx.at(b ? b.x : 0).ballHit(v);
      // A hard flip throws a spark off the rubber where it met the ball
      if (v > 22 && b) fx.spark(b.x, 0.6, -b.y, 0xfff1cf, 4, 5, 2);
    }
  };

  colliderRefs = buildColliders(world, hooks);

  function resetBank() {
    state.pokal = [false, false, false, false, false];
    colliderRefs.targets.forEach((c) => {
      c.enabled = true;
    });
    refs.targets.forEach((t) => {
      t.down = false;
    });
    renderPokal();
  }

  /* ======================= Grenar (modes) ======================= */

  function startNextMode() {
    const next = MODES.find((m) => !state.modeDone.has(m.id));
    if (!next) {
      startFinalen();
      return;
    }
    startMode(next);
  }

  /* ---- Mission select: the ball waits in the castle while you choose ---- */
  function beginSelect(b) {
    const list = MODES.filter((m) => !state.modeDone.has(m.id));
    if (list.length < 2 || !b) {
      startNextMode();
      return;
    }
    const idx = state.balls.indexOf(b);
    if (idx >= 0) state.balls.splice(idx, 1);
    b.live = false;
    // Ball save pauses while the ball is parked
    const saveLeft = Math.max(0, state.ballSaveUntil - (gameClock.now * 1000));
    state.ballSaveUntil = 0;
    state.held = { ball: b, t: 0, idle: 0, choice: 0, list, saveLeft };
    dmd.reset();
    sfx.selectOpen();
    fireFlasher('both', 0.7);
    lampShow('chase', list[0].gi, 1);
    setGI(list[0].gi, 1.1 * LAMP);
    renderGrenar();
    coach('select', touch ? 'Tryck vänster eller höger för att välja gren' : '← → väljer gren · mellanslag startar',
      L.jackpot.x, L.jackpot.y, 2.8, 4200);
  }

  function cycleSelect(dir) {
    const h = state.held;
    if (!h) return;
    h.choice = (h.choice + dir + h.list.length) % h.list.length;
    h.idle = 0;
    sfx.selectTick();
    setGI(h.list[h.choice].gi, 1.1 * LAMP);
    renderGrenar();
  }

  /** Starts the gren on show and sends the ball out over the drawbridge */
  function endSelect() {
    const h = state.held;
    if (!h) return;
    state.held = null;
    const b = h.ball;
    b.place(GATE_X, GATE_Y - 1.5, (Math.random() < 0.5 ? -1 : 1) * 2.5, -8);
    b.live = true;
    b.stuckFor = 0;
    b.searches = 0;
    state.balls.push(b);
    if (h.saveLeft > 0) state.ballSaveUntil = (gameClock.now * 1000) + h.saveLeft;
    fx.flash(GATE_X, 1, -(GATE_Y - 1.5), 0xffe08a, 6, 0.4);
    sfx.launch();
    startMode(h.list[h.choice]);
  }

  function startMode(next) {
    state.mode = { def: next, progress: 0, timeLeft: next.time, seen: new Set(), wizard: false };
    if (next.id === 'skytte') resetBank();
    // Fiske needs the trophy, so the trolls stay down for that one
    if (next.id !== 'fiske') later(raiseTrolls, 900);
    sfx.modeStinger(next.id);
    fireFlasher('both', 1);
    buzz([20, 30, 40]);
    dmd.modeStart(next.name, next.year, next.hint, next.time, next.id);
    lampShow('chase', next.gi, 1.8);
    setGI(next.gi, 1.25 * LAMP);
    renderGrenar();
    updateStatus();
    const spot = {
      gokart: [ORBIT_L[0], ORBIT_L[1] - 0.8, 'Orbit eller ramp = ett varv'],
      femkamp: [L.centerX, 16.4, 'Fem olika skott — vad som helst'],
      pingis: [-2.4, 24.4, 'Bumprarna! Tolv träffar'],
      skytte: [L.targets[0].x, L.targets[0].y, 'Börja med P, sen O, K, A, L'],
      fiske: [L.jackpot.x, L.jackpot.y, 'Porten är öppen — skjut pokalen']
    }[next.id];
    if (spot) later(() => coach(`mode-${next.id}`, spot[2], spot[0], spot[1], next.id === 'fiske' ? 2.8 : 1.2), 4300);
  }

  function completeMode() {
    const m = state.mode;
    if (!m) return;
    state.modeDone.add(m.def.id);
    const pts = addScore(15000);
    // Time left on the clock pays out too: a quick finish is worth more
    const tb = addScore(Math.ceil(Math.max(0, m.timeLeft)) * 250);
    sfx.modeWin();
    dmd.modeWin(m.def.name, pts, m.def.id, tb);
    fireFlasher('both', 1.2);
    buzz([30, 30, 30, 30, 70]);
    hitStop(110);
    punch(0.8);
    lampShow('strobe', 0xf2c14e, 1.6);
    endMode();

    if (state.modeDone.size >= 2 && !state.extraBallGiven) {
      state.extraBallGiven = true;
      later(giveExtraBall, 1500);
    }
    // The road to Finalen, and once all five are won Finalen lights at
    // once — no extra bank to clear first
    dmd.ladder(MODES.map((x) => ({ label: `'${String(x.year).slice(2)}`, done: state.modeDone.has(x.id) })),
      MODES.indexOf(m.def));
    if (MODES.every((x) => state.modeDone.has(x.id)) && !state.multiball) {
      state.modeStartLit = true;
      later(() => coach('finalen', 'Finalen tänd — skjut in i borgen!', GATE_X, GATE_Y - 0.6), 3200);
    }
  }

  function failMode() {
    const m = state.mode;
    if (!m) return;
    if (m.wizard) {
      // Finalen simply ends — it cannot be failed
      state.finalenDone++;
      state.modeDone.clear();
      sfx.modeWin();
      say(['FINALEN ÖVER', 'GRENARNA NOLLSTÄLLDA'], { prio: 3, border: true, dur: 2.4 });
      endMode();
      if (state.balls.length > 1) state.mbSaveUntil = 0;
      return;
    }
    sfx.drain();
    say(['TIDEN UTE', `${m.def.name} MISSAD`], { prio: 2, dur: 2 });
    endMode();
  }

  function endMode() {
    const wasSkytte = state.mode && state.mode.def.id === 'skytte';
    state.mode = null;
    lowerTrolls();
    setGI();
    if (wasSkytte) resetBank();
    renderGrenar();
    updateStatus();
  }

  function startFinalen() {
    state.mode = {
      def: { id: 'finalen', name: 'FINALEN', label: 'Finalen', hint: 'Allt räknas ×5', goal: 0, time: 60 },
      progress: 0,
      timeLeft: 60,
      seen: new Set(),
      wizard: true
    };
    state.multiball = true;
    state.jackpotLit = true;
    state.jackpots = 0;
    state.superLit = false;
    state.addBallLit = false;
    state.mbSaveUntil = (gameClock.now * 1000) + 60000;
    later(raiseTrolls, 1200);
    sfx.modeStinger('finalen');
    fireFlasher('both', 1.4);
    buzz([40, 40, 40, 40, 120]);
    dmd.modeStart('FINALEN', 2025, 'ALLA BOLLAR · ALLT ×5', 60, 'finalen');
    lampShow('strobe', 0xffe08a, 2.4);
    setGI(0xffe08a, 1.7 * LAMP);
    bloom.strength = 0.6;
    punch(1.2);
    renderGrenar();
    updateStatus();
    serveBall(300);
    serveBall(1100);
  }

  /* ==================== Locks & multiball ==================== */

  function lockBall(b) {
    b.live = false;
    const idx = state.balls.indexOf(b);
    if (idx >= 0) state.balls.splice(idx, 1);
    lockMeshes[state.locked].visible = true;
    state.locked++;
    state.lockLit = false;
    state.bumperHits = [0, 0, 0];
    state.bumperLit = [false, false, false];
    refs.bumpers.forEach((bm) => {
      bm.ring.material.emissiveIntensity = 0.95;
    });
    sfx.lock();
    fireFlasher('left', 1);
    buzz([25, 40, 25]);
    dmd.lock(state.locked);
    fx.flash(L.jackpot.x, 1.5, -L.jackpot.y, 0x7c8cf8, 7, 0.4);
    updateStatus();

    if (state.locked >= 2) {
      later(startMultiball, 900);
    } else {
      serveBall(700);
    }
  }

  function startMultiball() {
    state.multiball = true;
    state.jackpotLit = true;
    state.jackpots = 0;
    state.superLit = false;
    state.addBallLit = false;
    state.addBallUsed = false;
    state.mbSaveUntil = (gameClock.now * 1000) + 12000;
    sfx.multiball();
    jolt(1.4, 0);
    punch(1.4);
    fireFlasher('both', 1.4);
    slowMo(0.45, 0.25);
    dmd.multiball();
    lampShow('chase', 0xf2c14e, 2.6);
    bloom.strength = 0.54;

    // The locked balls burst out through the castle gate into the forecourt.
    // They spawn just below the gate mouth: the courtyard itself is too
    // cramped to release into without clipping the towers or the trophy.
    [
      { x: -1.9, y: 27.0, vx: -4 },
      { x: 0.2, y: 27.0, vx: 4 }
    ].forEach((spot, i) => {
      lockMeshes[i].visible = false;
      const nb = new Ball(L.ballRadius);
      nb.place(spot.x, spot.y, spot.vx, -9);
      nb.live = true;
      state.balls.push(nb);
      fx.flash(spot.x, 1, -spot.y, 0xffe08a, 6, 0.4);
    });
    state.locked = 0;
    updateStatus();
    later(() => coach('jackpot', 'Träffa pokalen i borgen: JACKPOT', L.jackpot.x, L.jackpot.y, 2.8), 1600);
  }

  /* ======================= Wireform ramps ======================= */

  /**
   * Lifts a ball out of the 2D world and rides it along the wireform.
   * The mesh follows the 3D curve; on arrival the ball rejoins the
   * simulation at the opposite inlane, the classic crossed-ramp layout.
   */
  function captureRamp(side, b) {
    const idx = state.balls.indexOf(b);
    if (idx < 0) return;
    state.balls.splice(idx, 1);
    b.live = false;
    // A hard shot rides the wireform visibly faster than a clean minimum
    const base = side === 'left' ? 22 : 27;
    const dur = clamp(base / Math.max(9, b.speed), 0.9, 2.1);
    state.riders.push({
      ball: b, side, t: 0, dur,
      v: clamp(b.speed * 0.9, 26, 40),
      len: refs.rampCurves[side].getLength()
    });
    const flap = refs.rampFlaps && refs.rampFlaps[side];
    if (flap) flap.userData.fire = 1;
    sfx.at(b.x).flap();
    buzz([6, 26, 6]);
    const arch = refs.rampArches && refs.rampArches[side];
    if (arch) {
      arch.material.emissiveIntensity = 3.2;
      flashes.push({ mat: arch.material, base: 0.95, t: 0 });
    }
    const p0 = L.ramps[side].path[0];
    fx.flash(p0[0], 0.8, -p0[1], 0xffd27a, 4.5, 0.3);

    award(3000, p0[0], p0[1]);
    state.perBall.ramps++;
    sfx.ramp();
    fireFlasher(side, 0.55);
    comboShot();
    modeEvent(side === 'left' ? 'leftRamp' : 'rightRamp');
    dmd.ramp(side === 'left' ? 'KUNGSVÄGEN' : 'VALLGRAVEN');

    // Kungsvägen collects a lit extra ball; Vallgraven a lit add-a-ball
    if (side === 'left' && state.castle.ebLit) {
      state.castle.ebLit = false;
      state.castle.ebGiven = true;
      later(giveExtraBall, 500);
    }
    if (side === 'right' && state.addBallLit && state.multiball) addABall();

    // Like the orbits, a ramp relights the multiball jackpot
    if (state.multiball && !state.jackpotLit) relightJackpot();
  }

  function relightJackpot() {
    state.jackpotLit = true;
    lampShow('chase', state.superLit ? 0xffd166 : 0xf2c14e, 0.9);
    say(state.superLit ? ['SUPER JACKPOT', 'TÄND · SKJUT POKALEN!'] : ['JACKPOT TÄND', 'SKJUT POKALEN!'],
      { prio: 2, flash: true, dur: 1.8 });
    updateStatus();
  }

  function releaseRider(r) {
    const ex = L.ramps[r.side].exit;
    // A ball that came down the wire fast leaves it a little faster
    const k = clamp((r.v || 30) / 30, 0.85, 1.15);
    r.ball.place(ex.x, ex.y, (ex.vx || 0) * k, ex.vy * k);
    r.ball.live = true;
    state.balls.push(r.ball);
  }

  /* =========================== Trolls =========================== */

  /**
   * Trolls guard the castle while a gren runs: they pop up, block the
   * corridor and have to be bashed back down. Knocked-down trolls rise
   * again after a spell as long as the mode lasts.
   */
  function raiseTrolls() {
    let any = false;
    state.trolls.forEach((t) => {
      if (!t.up) {
        t.up = true;
        t.downUntil = 0;
        any = true;
      }
    });
    if (any && state.phase === 'play') {
      sfx.trollUp();
      say(['KNEKTARNA', 'PÅ VAKT!'], { prio: 2, dur: 1.4 });
    }
  }

  function lowerTrolls() {
    state.trolls.forEach((t) => {
      t.up = false;
      t.downUntil = 0;
    });
  }

  /* ======================== Castle gate ========================= */

  /**
   * The gate is open while something inside the castle is wanted: a lit
   * lock, a lit multiball jackpot, FISKE or FINALEN — or for a while after
   * being bashed down with three hits.
   */
  function gateIsOpen() {
    return (
      !!state.held ||
      // A lit gren start opens the castle: the ball goes in to pick one
      (state.modeStartLit && !state.mode && !state.multiball) ||
      state.lockLit ||
      (state.multiball && state.jackpotLit) ||
      (state.mode && (state.mode.wizard || state.mode.def.id === 'fiske')) ||
      (gameClock.now * 1000) < state.gate.until
    );
  }

  function endMultiball() {
    state.multiball = false;
    state.jackpotLit = false;
    state.superLit = false;
    state.addBallLit = false;
    state.jackpots = 0;
    bloom.strength = 0.38;
    setGI();
    say(['MULTIBALL', 'SLUT'], { prio: 1 });
    updateStatus();
  }

  /**
   * Puts a fresh ball in the shooter lane and auto-plunges it shortly after —
   * used for lock replacements, multiball serves and Finalen.
   */
  function serveBall(delay = 600) {
    state.pendingServes++;
    later(() => {
      state.pendingServes--;
      if (state.phase !== 'play') return;
      const nb = new Ball(L.ballRadius);
      nb.place(L.laneBallX, L.laneBottomY + L.laneWallR + L.ballRadius + 0.06, 0, 0);
      nb.live = true;
      state.balls.push(nb);
      later(() => {
        if (nb.live && nb.x > L.laneX) {
          nb.vy = 58 + Math.random() * 8;
          sfx.launch();
        }
      }, 500);
    }, delay);
  }

  /* ---- Ball lifecycle ---- */
  function placeInLane() {
    const nb = new Ball(L.ballRadius);
    nb.place(L.laneBallX, L.laneBottomY + L.laneWallR + L.ballRadius + 0.06, 0, 0);
    nb.live = true;
    state.balls = [nb];
    state.kickback = true;
    // A tilt kills the flippers for the ball it happened on, not the game
    state.tilted = false;
    state.nudges = [];
    state.phase = 'launch';
    state.power = 0;
    state.charging = false;
    hud.plunger.hidden = false;
    hud.nudge.hidden = true;
    hud.powerFill.style.width = '0%';
    hud.plungerLabel.textContent = plungerHint;
    hud.plunger.dataset.ready = 'false';
    state.held = null;
    // A different skill-shot lane lights for every ball
    state.skill = (state.skill + 1 + Math.floor(Math.random() * 2)) % SKILL_BANDS.length;
    const band = SKILL_BANDS[state.skill];
    if (hud.skill) {
      hud.skill.style.left = `${band.lo * 100}%`;
      hud.skill.style.width = `${(band.hi - band.lo) * 100}%`;
      hud.skill.dataset.name = band.name;
    }
    fx.clear();
  }

  function launchBall() {
    // Looping the habitrail at 6.5° pitch costs ~53 u/s of climb, so every
    // launch clears it. The meter is a timing skill shot instead of a power
    // that can strand you.
    const p = clamp(state.power, 0, 1);
    const b = state.balls[0];
    if (!b) return;
    b.vy = 57 + p * 11;
    b.vx = 0;
    state.phase = 'play';
    state.ballSaveUntil = state.saveUsed ? 0 : (gameClock.now * 1000) + BALL_SAVE_MS;
    state.superUntil = (gameClock.now * 1000) + 3000;
    hud.plunger.hidden = true;
    hud.nudge.hidden = false;
    sfx.launch();
    // On a phone, show which half of the glass is which flipper until the
    // player has flipped once (or the moment has passed)
    if (touch) {
      hud.zones.classList.add('show');
      later(() => hud.zones.classList.remove('show'), 3500);
    }
    if (state.ballNo === 1 && !state.saveUsed) {
      later(() => coach('bank', 'Fäll alla fem P-O-K-A-L-mål', L.targets[1].x, L.targets[1].y), touch ? 3800 : 1600);
    }

    buzz(14 + Math.round(p * 16));
    const band = SKILL_BANDS[state.skill];
    if (p >= band.lo && p <= band.hi) {
      const pts = addScore(band.pts);
      sfx.complete();
      fireFlasher('right', 0.9);
      pop('SKILL SHOT!', 4.4, 26, 'big');
      dmd.skillShot(pts);
      lampShow('chase', 0x5eead4, 1);
    }
  }

  /**
   * One ball left play. In multiball the others carry on; the last ball
   * triggers save / extra ball / end-of-ball bonus.
   */
  function drainOne(b) {
    const idx = state.balls.indexOf(b);
    if (idx >= 0) state.balls.splice(idx, 1);
    b.live = false;

    const disposition = drainDisposition(state, gameClock.now * 1000, BALL_SAVE_GRACE);
    if (disposition === 'replace') {
      say(['BOLL', 'RÄDDAD'], { prio: 1, dur: 1 });
      serveBall(400);
      return;
    }
    if (disposition === 'continue' || disposition === 'end-multiball') {
      if (disposition === 'end-multiball') endMultiball();
      return;
    }

    // The same grace applies to the last single ball; tilt forfeits the save.
    if (disposition === 'save') {
      state.saveUsed = true;
      state.ballSaveUntil = 0;
      sfx.save();
      dmd.ballSave();
      fireFlasher('both', 0.7);
      buzz([20, 30, 20, 30, 50]);
      pop('BOLL RÄDDAD!', L.centerX, 5.2, 'save');
      lampShow('chase', 0x3ddc7b, 1.2);
      placeInLane();
      // Between the skill-shot lanes: a rescued ball is not a free skill shot
      state.power = 0.42;
      later(() => {
        if (state.phase === 'launch') launchBall();
      }, 550);
      return;
    }

    sfx.drain();
    buzz([70, 50, 140]);
    state.phase = 'between';
    hud.nudge.hidden = true;
    lowerTrolls();
    if (state.multiball) endMultiball();
    if (state.mode) {
      if (state.mode.wizard) failMode();
      else {
        say([state.mode.def.name, 'AVBRUTEN'], { prio: 1 });
        endMode();
      }
    }

    // The GI sags as the ball goes, the way a real machine's string dips on
    // a drain, then comes back for the next ball. (This is also what hands
    // the lights back after a TILT, which used to leave them red.)
    setGI(0x5a3040, 0.45 * LAMP);
    later(() => {
      if (state.phase === 'between' || state.phase === 'launch') setGI();
    }, 1500);

    // End-of-ball bonus — counted up row by row on the DMD. A tilted ball
    // forfeits it, as on every real machine.
    const pb = state.perBall;
    const bx = state.bonusX;
    // [label, count, value each]: the DMD counts each row up into the total
    const rows = [
      ['BUMPRAR', pb.bumps, 50],
      ['MÅL', pb.targets, 300],
      ['ORBITS', pb.orbits, 500],
      ['RAMPER', pb.ramps, 400],
      ['KNEKTAR', pb.trolls, 600],
      ['PORTSLAG', pb.gates, 250],
      ['KOMBOS', pb.combos, 750],
      ['BORGEN STORMAD', pb.storms, 5000]
    ].filter((r) => r[1] > 0);
    const bonus = state.tilted ? 0 : rows.reduce((a, r) => a + r[1] * r[2], 0) * bx;
    let wait = 1900;
    if (bonus > 0) {
      const count = (rows.length + (bx > 1 ? 1 : 0) + 1) * 0.6 + 0.9;
      later(() => dmd.bonus(rows, bx, bonus), 700);
      later(() => {
        state.score += bonus;
        sfx.complete();
      }, 700 + count * 1000 - 800);
      wait = Math.max(wait, 700 + count * 1000 + 200);
    }
    state.perBall = freshPerBall();
    state.bonusX = 1;
    state.inlanes = { left: false, right: false };
    state.combo = { n: 0, t: 0 };
    renderMult();

    if (state.extraBalls > 0) {
      state.extraBalls--;
      state.saveUsed = false;
      renderBalls();
      later(() => {
        sfx.extraBall();
        dmd.extraBall(true);
        if (state.phase === 'between') placeInLane();
      }, wait);
      return;
    }

    if (state.ballNo >= BALLS_PER_GAME) {
      later(gameOver, wait + 200);
      return;
    }
    state.ballNo++;
    state.saveUsed = false;
    state.mult = 1;
    renderMult();
    renderBalls();
    later(() => {
      say([`BOLL ${state.ballNo}`, `AV ${BALLS_PER_GAME}`], { prio: 2, dur: 1.4 });
      if (state.phase === 'between') placeInLane();
    }, wait);
  }

  /* ---- Start, game over, topplista ---- */
  function showSheet(html) {
    hud.sheet.innerHTML = html;
    root.classList.add('sheet-open');
  }

  function hideSheet() {
    root.classList.remove('sheet-open');
  }

  function gameOver() {
    state.phase = 'over';
    state.lastScore = state.score;
    hud.nudge.hidden = true;
    hud.plunger.hidden = true;
    sfx.gameOver();
    dmd.gameOver(state.score);
    setGI();
    const onBoard = qualifies(board, state.score);
    if (onBoard) {
      pendingScore = state.score;
      showSheet(nameSheet({
        score: state.score,
        rank: rankOf(board, state.score),
        names,
        remembered: lastName()
      }));
      const first = hud.sheet.querySelector('.pbf-name');
      if (first && !touch) first.focus({ preventScroll: true });
    } else {
      const need = board.length >= BOARD_SIZE ? board[board.length - 1].s : 0;
      showSheet(overSheet({ score: state.score, rank: 0, onBoard: false, need, board }));
    }
  }

  function saveName(raw) {
    const name = String(raw || '').trim().slice(0, 12) || 'Gäst';
    if (!pendingScore) return;
    const res = insertScore(board, name, pendingScore);
    ({ board } = res);
    saveBoard(board);
    if (name !== 'Gäst') rememberName(name);
    const rank = board.indexOf(res.entry) + 1;
    dmd.highScore(rank, name);
    if (rank === 1) sfx.knocker();
    else sfx.complete();
    showSheet(overSheet({ score: pendingScore, rank, onBoard: true, board, hi: res.entry }));
    boardHi = res.entry;
    renderBoard();
    pendingScore = 0;
  }

  function startGame() {
    gameClock.clear();
    cancelControls();
    if (pendingScore) return;
    sfx.resume();
    gamesPlayed++;
    try {
      localStorage.setItem('pbf-games', String(gamesPlayed));
    } catch (e) {
      /* private mode: tips every game */
    }
    coachState.seen.clear();
    hideCoach();
    state.score = 0;
    state.ballNo = 1;
    state.mult = 1;
    state.banksDone = 0;
    state.tilted = false;
    state.nudges = [];
    state.bumperHits = [0, 0, 0];
    state.bumperLit = [false, false, false];
    state.lockLit = false;
    state.locked = 0;
    state.multiball = false;
    state.jackpotLit = false;
    state.mbSaveUntil = 0;
    state.pendingServes = 0;
    state.gate = { hits: 0, until: 0, bashed: false };
    state.castle = { storms: 0, ebLit: false, ebGiven: false };
    state.jackpots = 0;
    state.superLit = false;
    state.addBallLit = false;
    state.addBallUsed = false;
    state.held = null;
    state.riders = [];
    state.trolls = [{ up: false, downUntil: 0 }, { up: false, downUntil: 0 }];
    state.spins = 0;
    state.modeDone = new Set();
    state.mode = null;
    state.modeStartLit = false;
    state.finalenDone = 0;
    state.combo = { n: 0, t: 0 };
    state.bonusX = 1;
    state.inlanes = { left: false, right: false };
    state.perBall = freshPerBall();
    state.extraBalls = 0;
    state.extraBallGiven = false;
    state.superUntil = 0;
    state.kickback = true;
    state.saveUsed = false;
    lockMeshes.forEach((m) => (m.visible = false));
    // Hand the lamps back from attract mode
    refs.bumpers.forEach((bm) => {
      bm.ring.material.emissiveIntensity = 0.95;
      bm.light.intensity = bm.base * LAMP;
    });
    [refs.leftSling, refs.rightSling].forEach((m) => (m.material.emissiveIntensity = 1.4));
    Object.values(refs.rampArches).forEach((m) => (m.material.emissiveIntensity = 0.95));
    bloom.strength = 0.38;
    setGI();
    hideSheet();
    dmd.reset();
    say(['BOLL 1', 'LYCKA TILL!'], { prio: 2, dur: 1.4 });
    sfx.start();
    lampShow('wave', 0xf2c14e, 1);
    resetBank();
    renderBalls();
    renderMult();
    renderGrenar();
    boardHi = null;
    placeInLane();
    renderBoard();
  }

  /* ---- Input ---- */
  let helpOpen = false;
  const pointers = new Map();
  const heldKeys = new Map();
  const plungerKeys = new Set();
  const flipL = colliderRefs.flippers.left;
  const flipR = colliderRefs.flippers.right;

  function setFlipper(side, pressed) {
    if (state.tilted) return;
    const f = side === 'left' ? flipL : flipR;
    if (f.pressed !== pressed) {
      f.pressed = pressed;
      // Mission select: the flipper buttons step through the grenar
      if (pressed && state.held) cycleSelect(side === 'left' ? -1 : 1);
      // The half of the glass under the thumb answers, like a lit button
      if (touch) hud.zones.children[side === 'left' ? 0 : 1].classList.toggle('press', pressed);
      if (pressed) {
        // A flip is never held back by a hit-stop or a slow-motion beat:
        // the bat answers at full speed on the very next physics step
        time.stop = 0;
        if (time.scale < 1) {
          time.hold = 0;
          time.scale = 1;
        }
        sfx.at(side === 'left' ? -4 : 1.6).flipperUp();
        buzz(7);
        hud.zones.classList.remove('show');
      } else {
        sfx.at(side === 'left' ? -4 : 1.6).flipperDown();
      }
    }
  }

  function refreshFlippers() {
    let left = false;
    let right = false;
    [...pointers.values(), ...heldKeys.values()].forEach((side) => {
      if (side === 'left') left = true;
      else if (side === 'right') right = true;
    });
    setFlipper('left', left);
    setFlipper('right', right);
  }

  function onPointerDown(e) {
    if (helpOpen || !running || (e.pointerType === 'mouse' && e.button !== 0)) return;
    sfx.resume();
    canvasHost.setPointerCapture?.(e.pointerId);

    if (state.phase === 'launch') {
      state.charging = true;
      pointers.set(e.pointerId, 'plunger');
      return;
    }
    if (state.phase !== 'play') return;

    const rect = canvasHost.getBoundingClientRect();
    const side = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
    pointers.set(e.pointerId, side);
    refreshFlippers();
  }

  function onPointerUp(e) {
    const was = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (was === 'plunger' && state.phase === 'launch' && ![...pointers.values()].includes('plunger') && !plungerKeys.size) {
      state.charging = false;
      launchBall();
      return;
    }
    refreshFlippers();
  }

  function onPointerMove(e) {
    if (helpOpen || !running) return;
    if (state.phase !== 'play' || !pointers.has(e.pointerId)) return;
    // Let a finger slide across the middle to swap flippers
    const rect = canvasHost.getBoundingClientRect();
    const side = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
    if (pointers.get(e.pointerId) !== side) {
      pointers.set(e.pointerId, side);
      refreshFlippers();
    }
  }

  const LEFT_KEYS = new Set(['arrowleft', 'a', 'z']);
  const RIGHT_KEYS = new Set(['arrowright', 'd', 'm']);
  // Shift is the flipper button on every PC pinball since the nineties
  const sideOf = (e) => {
    const k = e.key.toLowerCase();
    if (LEFT_KEYS.has(k) || e.code === 'ShiftLeft') return 'left';
    if (RIGHT_KEYS.has(k) || e.code === 'ShiftRight') return 'right';
    return null;
  };

  function onKeyDown(e) {
    if (hasCommandModifier(e)) return;
    // Typing a name for the topplista is not playing the game
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (helpOpen) {
      if (k === 'escape' || k === ' ' || k === '?' || k === 'p') setHelp(false);
      e.preventDefault();
      return;
    }
    if (!running) return;
    if (k === 'p') { setHelp(true); return; }
    const side = sideOf(e);
    if (side) {
      e.preventDefault();
      heldKeys.set(e.code || k, side);
      refreshFlippers();
      return;
    }
    if (k === ' ' || k === 'arrowdown' || k === 'enter') {
      if (k === 'enter' && e.target && e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      sfx.resume();
      if (state.held && state.phase === 'play') endSelect();
      else if (state.phase === 'launch') {
        plungerKeys.add(e.code || k);
        state.charging = true;
      } else if (state.phase === 'idle' || state.phase === 'over') startGame();
    } else if (k === 'n') doNudge();
    else if (k === '?') setHelp(true);
  }

  // Esc closes the strategy card, not the whole game: caught on the way
  // down, before the site's own Esc-closes-the-stage handler sees it
  function onKeyCapture(e) {
    if (hasCommandModifier(e)) return;
    if (helpOpen && e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      setHelp(false);
    }
  }

  function onKeyUp(e) {
    const side = sideOf(e);
    if (side) {
      heldKeys.delete(e.code || e.key.toLowerCase());
      refreshFlippers();
      return;
    }
    const k = e.key.toLowerCase();
    const wasCharging = plungerKeys.delete(e.code || k);
    if ((k === ' ' || k === 'arrowdown' || k === 'enter') && state.phase === 'launch' && state.charging && wasCharging && !plungerKeys.size && ![...pointers.values()].includes('plunger')) {
      state.charging = false;
      launchBall();
    }
  }

  /**
   * Ball search: a real machine pulses its coils one by one to shake a lost
   * ball free. Every pop and sling fires in turn (lit and heard, so the
   * player sees the machine working); one the ball is resting against
   * actually throws it, and only when nothing is in reach does the cabinet
   * give a gentle, escalating shove.
   */
  function ballSearch(b, n) {
    let freed = false;
    L.bumpers.forEach((p, i) => {
      later(() => {
        const rb = refs.bumpers[i];
        if (rb) {
          rb.fire = 1;
          flash(null, rb.light, 2.4, rb.base);
        }
        sfx.at(p.x).coil(0.55);
      }, i * 110);
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const d = Math.hypot(dx, dy);
      if (!freed && d < L.bumperR + L.ballRadius + 0.5 && d > 1e-3) {
        b.vx += (dx / d) * 16;
        b.vy += (dy / d) * 16;
        freed = true;
      }
    });
    [[L.leftSlingPts, refs.leftSling], [L.rightSlingPts, refs.rightSling]].forEach(([P, mesh], k) => {
      later(() => {
        if (mesh) mesh.userData.fire = 1;
        sfx.at(P.T[0]).coil(0.4);
      }, 330 + k * 110);
      const [qx, qy] = closestOnSegment(b.x, b.y, P.T[0], P.T[1], P.BI[0], P.BI[1]);
      const dx = b.x - qx;
      const dy = b.y - qy;
      const d = Math.hypot(dx, dy);
      if (!freed && d < 0.28 + L.ballRadius + 0.45 && d > 1e-3) {
        b.vx += (dx / d) * 14;
        b.vy += (dy / d) * 14;
        freed = true;
      }
    });
    if (!freed) {
      const power = 0.6 + n * 0.5;
      b.vx += clamp((L.centerX - b.x) * 0.6, -5, 5) * power + (Math.random() - 0.5) * 3 * power;
      // High up a ball needs a shove to come back down; low down a nudge
      b.vy += (b.y > 20 ? -6 : 4) * power;
      jolt(0.3 + n * 0.12, 0);
    }
  }

  function doNudge() {
    if (helpOpen || !running || state.phase !== 'play' || state.tilted) return;
    const now = (gameClock.now * 1000);
    // A cabinet can't be shoved again while it is still rocking back
    if (now - (state.lastNudge || 0) < 320) return;
    state.lastNudge = now;
    state.nudges = state.nudges.filter((t) => now - t < 3200);
    state.nudges.push(now);
    // Tilt bob: every shove swings the plumb bob, which settles again with
    // a ~1.4 s half-life. Quick shoves add up; shoves a second or more apart
    // only ever earn warnings.
    const settle = (now - (state.bobAt || now)) / 1000;
    state.bob = (state.bob || 0) * 0.5 ** (settle / 1.4) + 1;
    state.bobAt = now;
    const bobStage = state.bob > 3 ? 3 : state.bob > 2.2 ? 2 : state.bob > 1.5 ? 1 : 0;

    if (bobStage >= 3) {
      state.tilted = true;
      flipL.pressed = false;
      flipR.pressed = false;
      jolt(2.2, 0);
      buzz(260);
      dmd.tilt();
      sfx.tilt();
      setGI(0x301010, 0.35 * LAMP);
      return;
    }
    // The warning escalates: a word of caution, then the real warning, then TILT
    if (bobStage === 1) {
      say(['FÖRSIKTIGT'], { prio: 1, dur: 0.8 });
    } else if (bobStage === 2) {
      dmd.warning();
      sfx.warning();
      fireFlasher('both', 0.5);
    }
    // The shove goes the way that helps: the lowest ball (the one in
    // danger) is pushed back toward the middle, away from its outlane. It
    // used to be a coin toss, which made the button feel like a lottery.
    let low = null;
    state.balls.forEach((b) => {
      if (b.live && (!low || b.y < low.y)) low = b;
    });
    const off = low ? L.centerX - low.x : 0;
    const dir = Math.abs(off) > 0.4 ? Math.sign(off) : Math.random() < 0.5 ? -1 : 1;
    // A real shove: the cabinet moves under the ball (an instant velocity
    // change) and springs back over a few hundredths of a second, in
    // simulation time (physics.js World.nudge)
    world.nudge(state.balls, dir * (4.4 + Math.random() * 1.2), 4.2 + Math.random() * 0.8, 0.09);
    buzz(30);
    jolt(1, dir);
    sfx.nudge();
  }

  // The tick keeps updating `last` even while paused, so closing the card
  // resumes with a tiny dt — no need to reset the clock here.
  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
    sfx.setPaused(open);
    if (open) cancelControls();
  }

  function cancelControls() {
    pointers.clear();
    heldKeys.clear();
    plungerKeys.clear();
    flipL.pressed = false;
    flipR.pressed = false;
    state.charging = false;
    state.power = 0;
    hud.powerFill.style.width = '0%';
    hud.plungerLabel.textContent = plungerHint;
    hud.plunger.dataset.ready = 'false';
    [...hud.zones.children].forEach((zone) => zone.classList.remove('press'));
  }

  function onPointerCancel(e) {
    const was = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (was === 'plunger' && ![...pointers.values()].includes('plunger') && !plungerKeys.size) {
      state.charging = false;
      state.power = 0;
      hud.powerFill.style.width = '0%';
      hud.plungerLabel.textContent = plungerHint;
      hud.plunger.dataset.ready = 'false';
    }
    refreshFlippers();
  }

  function onBlur() {
    cancelControls();
    sfx.roll(0, false);
    if (state.phase !== 'idle' && state.phase !== 'over') setHelp(true);
  }

  function onSheetClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    sfx.resume();
    if (btn.dataset.act === 'start') startGame();
    else if (btn.dataset.name) saveName(btn.dataset.name);
  }

  function onSheetSubmit(e) {
    e.preventDefault();
    const input = e.target.querySelector('input');
    if (input && input.value.trim()) saveName(input.value);
  }

  canvasHost.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('blur', onBlur);
  canvasHost.addEventListener('pointermove', onPointerMove);
  window.addEventListener('keydown', onKeyCapture, true);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  hud.sheet.addEventListener('click', onSheetClick);
  hud.sheet.addEventListener('submit', onSheetSubmit);
  hud.info.addEventListener('click', () => setHelp(!helpOpen));
  hud.helpClose.addEventListener('click', () => setHelp(false));
  hud.nudge.addEventListener('click', doNudge);
  hud.mute.addEventListener('click', () => {
    sfx.setMuted(!sfx.muted);
    hud.mute.classList.toggle('off', sfx.muted);
  });

  /* ---- Camera framing ---- */
  const target = new THREE.Vector3(0, 0, -19);
  const camBase = new THREE.Vector3();
  const pitch = 67 * (Math.PI / 180);
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  // Frame the machine, not just the playfield: the side armour and the front
  // of the lockdown bar are the composition's border, and the backbox has to
  // clear the top of the frame or it reads as a bug rather than a head.
  // On a short landscape screen (a phone on its side) the whole translite
  // would cost the playfield a sixth of its size: frame to the speaker
  // panel and the lower part of the translite there, and let its top run
  // off the screen.
  const cornerSet = (top) => {
    const out = [];
    for (const x of [CAB.x0, CAB.x1]) {
      out.push(new THREE.Vector3(x, 0, CAB.z0));
      out.push(new THREE.Vector3(x, CAB.railY + 1.3, CAB.z0));
      out.push(new THREE.Vector3(x, 0, CAB.z1));
      out.push(new THREE.Vector3(x, top.y, top.z));
    }
    return out;
  };
  const cornersFull = cornerSet(headTop());
  const cornersShort = cornerSet(headTop(5 + (CAB.backH - 5) * 0.4));
  let corners = cornersFull;
  const pv = new THREE.Vector3();
  // The play camera's framing, kept for the showcase to fly back into
  const playView = {};

  /** The machine's bounding box on screen, in pixels, for the current camera */
  function projectBox(W, H) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    corners.forEach((c) => {
      pv.copy(c).project(camera);
      const x = ((pv.x + 1) / 2) * W;
      const y = ((1 - pv.y) / 2) * H;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    });
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  /**
   * Fits the machine into the screen minus the HUD insets. The distance sets
   * the size; a view offset then slides the image so the machine sits in the
   * middle of the free space, without changing the perspective.
   */
  function frameInto(W, H, ins) {
    corners = W > H && H < 520 ? cornersShort : cornersFull;
    const RW = Math.max(40, W - ins.l - ins.r);
    const RH = Math.max(40, H - ins.t - ins.b);
    camera.aspect = W / H;
    // Wider lens on narrow screens so the table still fills the view
    camera.fov = RW / RH < 0.62 ? 50 : 42;
    camera.clearViewOffset();
    let dist = 60;
    let box = null;
    for (let i = 0; i < 8; i++) {
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      box = projectBox(W, H);
      const s = Math.max(box.w / (RW * 0.99), box.h / (RH * 0.99));
      if (Math.abs(s - 1) < 0.003) break;
      dist = clamp(dist * s, 16, 220);
    }
    // Nothing comes nearer the camera than the lockdown bar at ~0.8 × the
    // framing distance, so the near plane can sit far out. Depth precision
    // goes with near/distance: at the old 0.5 a 16-bit depth buffer could
    // not tell the wood from anything a quarter of a unit above it.
    camera.near = clamp(dist * 0.35, 0.5, 40);
    camera.far = dist + 200;
    // The fog that sinks the room goes with the framing too (58–118 at the
    // usual ~62). As fixed distances, a short window — where the camera has
    // to stand further back to fit the machine between the HUD bars — put
    // the whole table past the fog and rendered it black.
    scene.fog.near = dist * 0.93;
    scene.fog.far = dist * 1.9;
    const dx = ins.l + RW / 2 - box.cx;
    const dy = ins.t + RH / 2 - box.cy;
    camera.setViewOffset(W, H, -dx, -dy, W, H);
    camBase.copy(camera.position);
    Object.assign(playView, {
      W, H, fov: camera.fov, near: camera.near, far: camera.far,
      fogNear: scene.fog.near, fogFar: scene.fog.far, offX: dx, offY: dy
    });
    return { l: box.x0 + dx, r: W - box.x1 - dx, t: box.y0 + dy, b: H - box.y1 - dy };
  }

  function fitCamera() {
    const W = view.w;
    const H = view.h;
    target.x = 0;
    let land = W / H > 1.02;
    let fit = frameInto(W, H, land ? LANDSCAPE_INSETS : PORTRAIT_INSETS);
    if (land && Math.min(fit.l, fit.r) < MIN_SIDE) {
      land = false;
      fit = frameInto(W, H, PORTRAIT_INSETS);
    }
    view.land = land;
    root.dataset.orient = land ? 'land' : 'port';
    const side = Math.min(fit.l, fit.r);
    root.style.setProperty('--side-w', `${Math.round(clamp(side - 44, 170, 380))}px`);
    root.style.setProperty('--cab-t', `${Math.round(fit.t)}px`);
    root.style.setProperty('--cab-b', `${Math.round(fit.b)}px`);
    // Showcase on wide screens only: the column between the side panels,
    // widened a little into their margins. Portrait keeps the play framing.
    showcaseOk = W / H > 1.02;
    showcase.setPlay({ ...playView });
    if (!showcaseOk) {
      // Turned to portrait mid-tour: the play framing above is final
      showcase.cut(0);
      camera.up.set(0, 1, 0);
    } else {
      const grow = 0.15;
      const l = fit.l * (1 - grow);
      const r = fit.r * (1 - grow);
      const ins = land ? LANDSCAPE_INSETS : PORTRAIT_INSETS;
      showcase.fit(W, H, { x: l, y: ins.t + 6, w: Math.max(80, W - l - r), h: Math.max(80, H - ins.t - ins.b - 12) }, { ...playView });
    }
  }

  function resize() {
    const rect = root.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    view.w = w;
    view.h = h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    // Bloom resolution is the most expensive knob in the whole renderer — five
    // mip levels, two blur passes each, every frame. Sized by the longer edge
    // so its blur stays round on a wide screen.
    const k = Math.min(0.5, 460 / Math.max(w, h));
    bloom.setSize(Math.round(w * k), Math.round(h * k));
    fitCamera();
    needsRedraw = true;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  /* ---- Lamps ---- */
  const giTmp = new THREE.Color();
  const ATTRACT_GI = [new THREE.Color(0xffd08a), new THREE.Color(0x8aa0ff), new THREE.Color(0xff8ad8)];
  const vOne = new THREE.Vector3(1, 1, 1);

  /**
   * Every lamp on the table, every frame: gameplay inserts (lit when that
   * shot is worth taking, pulsing when hot), attract-mode patterns while
   * nobody plays, and lamp shows over both for big moments.
   */
  function driveLamps(now, dt) {
    const t = now / 1000;
    const attract = state.phase === 'idle' || state.phase === 'over';
    const pulse = 0.55 + Math.sin(now / 150) * 0.45;
    const level = {};

    if (attract) {
      // Three patterns, four seconds each: sweep, alternate, breathe
      const pat = Math.floor(t / 4) % 3;
      INSERT_ORDER.forEach((id, i) => {
        if (pat === 0) {
          const head = Math.floor(t * 9) % (INSERT_ORDER.length + 3);
          level[id] = i === head ? 1 : i === head - 1 ? 0.35 : null;
        } else if (pat === 1) {
          level[id] = (i + Math.floor(t * 3)) % 2 ? 1 : null;
        } else {
          level[id] = 0.5 + 0.5 * Math.sin(t * 3 - i * 0.9);
        }
      });
    } else {
      const saveLeft = state.ballSaveUntil - (gameClock.now * 1000);
      // An arrow is lit only when that shot counts for something right now:
      // a gren lights the shots IT scores, not every ramp on the table
      const mid = state.mode && !state.mode.wizard ? state.mode.def.id : '';
      const laps = mid === 'gokart' || mid === 'femkamp';
      const relight = state.multiball && !state.jackpotLit;
      // Femkamp lights only the shots it has not had yet
      const fem = mid === 'femkamp' ? state.mode.seen : null;
      const want = (kind) => (fem ? !fem.has(kind) : laps);
      const storm = state.gate.bashed && gateIsOpen();
      const lit = {
        save: state.phase === 'play' && saveLeft > 0,
        leftOrbit: state.modeStartLit || relight || want('leftOrbit'),
        leftRamp: relight || want('leftRamp') || state.castle.ebLit || (state.mode && state.mode.wizard),
        castle: state.lockLit || (state.multiball && state.jackpotLit) || mid === 'fiske' || storm || state.modeStartLit ||
          (fem && !fem.has('jackpot')) || (state.mode && state.mode.wizard),
        rightRamp: relight || want('rightRamp') || (state.addBallLit && state.multiball) ||
          (state.mode && state.mode.wizard),
        trolls: state.trolls.some((tr) => tr.up)
      };
      // While a gren runs, the arrows it lights take its colour
      const tintC = state.mode && !state.mode.wizard ? state.mode.def.gi : null;
      INSERT_ORDER.forEach((id) => {
        const ins = refs.inserts[id];
        if (!ins.home) ins.home = ins.mat.emissive.getHex();
        const c = tintC && lit[id] && id !== 'save' ? tintC : ins.home;
        if (ins.tint !== c) {
          ins.tint = c;
          ins.mat.emissive.setHex(c);
          ins.mat.color.setHex(c);
          ins.light.color.setHex(c);
          ins.pool.material.color.setHex(c);
        }
      });
      // Pingis is played on the bumpers: their rings pulse while it runs
      refs.bumpers.forEach((bm, i) => {
        bm.ring.material.emissiveIntensity = mid === 'pingis'
          ? 1.1 + 1.9 * (0.5 + 0.5 * Math.sin(now / 110 + i * 2.1))
          : state.bumperLit[i] ? 2.6 : 0.95;
      });
      INSERT_ORDER.forEach((id) => {
        level[id] = lit[id] ? pulse : null;
      });
      // The last two seconds of ball save hurry, as on a real machine
      if (lit.save && saveLeft < 2000) level.save = Math.floor(now / 90) % 2 ? 1 : null;
      // An extra ball in hand: the same lamp burns steady (SHOOT AGAIN)
      else if (!lit.save && state.extraBalls > 0 && state.phase !== 'over') level.save = 0.75 + 0.25 * Math.sin(now / 420);
    }

    // Lamp show on top
    let strobeOn = false;
    if (lampFx.t < lampFx.dur) {
      lampFx.t += dt;
      const n = INSERT_ORDER.length;
      if (lampFx.kind === 'strobe') {
        strobeOn = Math.floor(lampFx.t * 12) % 2 === 0;
        INSERT_ORDER.forEach((id) => (level[id] = strobeOn ? 1 : null));
      } else {
        // chase / wave: a bright head running up the table
        const speed = lampFx.kind === 'wave' ? 9 : 16;
        const head = Math.floor(lampFx.t * speed) % (n + 2);
        INSERT_ORDER.forEach((id, i) => {
          if (i === head || i === head - 1) level[id] = 1;
        });
        strobeOn = Math.floor(lampFx.t * 8) % 2 === 0;
      }
    }

    const k = Math.min(1, dt * 12);
    INSERT_ORDER.forEach((id) => {
      const ins = refs.inserts[id];
      const lv = level[id];
      const want = lv == null ? 0.12 : 0.9 + lv * 1.5;
      ins.mat.emissiveIntensity += (want - ins.mat.emissiveIntensity) * k;
      const wantL = (lv == null ? 0 : 0.5 + lv * 0.5) * LAMP;
      ins.light.intensity += (wantL - ins.light.intensity) * k;
      // The frosted diffuser: bleeds the lamp onto the wood around the
      // insert so a lit shot glows rather than switching on like an LCD.
      ins.pool.material.opacity = Math.min(0.85, ins.light.intensity * 0.62);
    });

    driveMatrix(now, attract, strobeOn);

    // General illumination
    if (attract) {
      const ph = (t * 0.12) % 3;
      const a = ATTRACT_GI[Math.floor(ph)];
      const b = ATTRACT_GI[(Math.floor(ph) + 1) % 3];
      giTmp.copy(a).lerp(b, ph % 1);
      const inten = 1.35 * LAMP * (0.88 + 0.12 * Math.sin(t * 2.2));
      giLamps.forEach((lamp, i) => {
        lamp.color.copy(giTmp).lerp(lamp.userData.home, 0.35);
        lamp.intensity = inten * (0.8 + 0.2 * Math.sin(t * 3 + i));
      });
      // Bumpers take turns, slings answer each other, ramp arches breathe
      refs.bumpers.forEach((b2, i) => {
        b2.light.intensity = (Math.floor(t * 2.5) % 3 === i ? 2.4 : 0.15) * LAMP;
      });
      [refs.leftSling, refs.rightSling].forEach((m, i) => {
        m.material.emissiveIntensity = Math.floor(t * 1.5) % 2 === i ? 2.6 : 1;
      });
      Object.values(refs.rampArches).forEach((m, i) => {
        m.material.emissiveIntensity = 1.2 + Math.sin(t * 2.4 + i * Math.PI) * 0.9;
      });
    } else {
      const flick = !reduceMotion && lampFx.t < lampFx.dur && lampFx.kind !== 'wave';
      giLamps.forEach((lamp) => {
        const base = gi.color || lamp.userData.home;
        if (flick && strobeOn) {
          lamp.color.copy(lampFx.color);
          lamp.intensity = gi.intensity * 1.2;
        } else {
          lamp.color.copy(base);
          lamp.intensity = gi.intensity * (flick ? 0.75 : 1);
        }
      });
    }

    // Attract: the flashers answer each other every few seconds
    if (attract && Math.floor(t / 3.1) !== attractFlash) {
      attractFlash = Math.floor(t / 3.1);
      fireFlasher(attractFlash % 2 ? 'left' : 'right', 0.7);
    }
    // Flashers, and the punch they put into the GI lamp beside them
    refs.flashers.forEach((f) => {
      f.t += dt;
      const e = f.t < 0.6 ? Math.exp(-f.t * 8) * (f.k || 1) : 0;
      const show = strobeOn && lampFx.kind === 'strobe' && lampFx.t < lampFx.dur ? 0.6 : 0;
      const hit = Math.max(e, show);
      f.mat.emissiveIntensity = 0.16 + hit * 3.4;
      const lamp = giLamps[FLASHER_GI[f.id]];
      if (lamp && hit > 0.01) {
        lamp.color.lerp(f.color, Math.min(1, hit * 1.4));
        lamp.intensity += hit * 6 * LAMP;
      }
    });

    // The plastics glow with the GI string under them, and the bulbs show it
    const g0 = giLamps[0];
    refs.plastics.emissive.copy(g0.color);
    refs.plastics.emissiveIntensity = clamp(0.5 * (g0.intensity / GI_INTENSITY), 0.06, 0.8);
    materials.bulb.color.copy(g0.color).multiplyScalar(clamp(0.55 + 0.4 * (g0.intensity / GI_INTENSITY), 0.2, 0.92));
  }

  /**
   * The lamp matrix: grenar row, P-O-K-A-L letters, locks, bonus ×,
   * kickback and inlanes. Solid when collected, blinking when it is the shot
   * to make, running patterns in attract.
   */
  function driveMatrix(now, attract, strobeOn) {
    const lm = refs.lamps;
    const t = now / 1000;
    const fast = Math.floor(now / 120) % 2 === 0 ? 1 : 0.12;
    const slow = Math.floor(now / 320) % 2 === 0 ? 1 : 0.1;
    if (attract) {
      const pat = Math.floor(t / 4) % 3;
      lm.defs.forEach((d, i) => {
        let v;
        if (pat === 0) v = Math.max(0, Math.sin(t * 5 - d.y * 0.55)) ** 2;
        else if (pat === 1) v = (i + Math.floor(t * 7)) % 5 === 0 ? 1 : 0.04;
        else v = Math.max(0, Math.sin(t * 4 + d.x * 0.8)) ** 2;
        lm.set(d.id, v);
      });
    } else {
      const next = MODES.find((m) => !state.modeDone.has(m.id));
      MODES.forEach((m, i) => {
        let v = 0;
        if (state.modeDone.has(m.id)) v = 1;
        else if (state.mode && state.mode.def.id === m.id) v = fast;
        else if (!state.mode && next === m) v = state.modeStartLit ? slow : 0.22;
        lm.set(`gren${i}`, v);
      });
      const wiz = state.mode && state.mode.wizard;
      lm.set('gren5', wiz ? fast : state.finalenDone ? 1 : !next && state.modeStartLit ? slow : 0);
      const skytte = state.mode && state.mode.def.id === 'skytte';
      L.targets.forEach((_, i) => {
        lm.set(`pokal${i}`, state.pokal[i] ? 1 : skytte && i === state.mode.progress ? fast : 0);
      });
      for (let i = 0; i < 2; i++) {
        lm.set(`lock${i}`, state.locked > i || state.multiball ? 1 : state.lockLit && i === state.locked ? fast : 0);
      }
      [2, 3, 4, 5, 6].forEach((n) => lm.set(`bx${n}`, state.bonusX >= n ? 1 : 0));
      lm.set('kickback', state.kickback ? 1 : 0);
      lm.set('super', state.superLit ? (state.jackpotLit ? fast : slow) : 0);
      lm.set('addBall', state.addBallLit && state.multiball ? fast : 0);
      lm.set('eb', state.castle.ebLit ? fast : 0);
      const bashedOpen = state.gate.bashed && gateIsOpen();
      for (let i = 0; i < 3; i++) lm.set(`gate${i}`, bashedOpen ? slow : state.gate.hits > i ? 1 : 0.06);
      lm.set('inL', state.inlanes.left ? 1 : 0);
      lm.set('inR', state.inlanes.right ? 1 : 0);
    }
    // Lamp shows run over the matrix too
    if (lampFx.t < lampFx.dur) {
      if (lampFx.kind === 'strobe') {
        lm.defs.forEach((d) => lm.set(d.id, strobeOn ? 1 : 0, lampFx.color));
      } else {
        const head = (lampFx.t * (lampFx.kind === 'wave' ? 26 : 40)) % 34 - 2;
        lm.defs.forEach((d) => {
          if (Math.abs(d.y - head) < 1.6) lm.set(d.id, 1, lampFx.color);
        });
      }
    }
  }

  /* ---- DMD content between callouts ---- */
  const startHint = touch ? 'TRYCK PÅ STARTA' : 'MELLANSLAG';
  // The DMD score counts up to the real one instead of jumping, so a big
  // award reads as a payout rather than a typo
  let scoreShown = 0;
  function rollScore(dt) {
    const diff = state.score - scoreShown;
    if (diff <= 0) scoreShown = state.score;
    else scoreShown += Math.max(10, Math.ceil((diff * Math.min(1, dt * 7)) / 10) * 10);
    if (scoreShown > state.score) scoreShown = state.score;
  }
  dmd.base = (d, t) => {
    if (state.phase === 'idle' || state.phase === 'over') {
      d.attract(t, { board, last: state.lastScore, startHint });
      return;
    }
    if (state.held) {
      const h = state.held;
      const def = h.list[h.choice];
      d.select({
        name: def.name,
        year: def.year,
        task: def.hint,
        idx: h.choice,
        n: h.list.length,
        frac: clamp(1 - Math.max(h.t / SELECT_MAX, h.idle / SELECT_IDLE), 0, 1)
      }, t);
      return;
    }
    const m = state.mode;
    let mode = null;
    if (m) {
      const secs = Math.max(0, Math.ceil(m.timeLeft));
      mode = {
        label: m.wizard ? 'FINALEN ×5' : `${m.def.name} ${m.progress}/${m.def.goal}`,
        time: clock(secs),
        secs,
        frac: clamp(m.timeLeft / m.def.time, 0, 1)
      };
    }
    let status = '';
    let hot = false;
    // The status line names the shot to make, not just the state
    if (state.phase === 'launch') [status, hot] = [`SKILL: ${SKILL_BANDS[state.skill].name}`, true];
    else if (state.tilted) [status, hot] = ['TILT', true];
    else if (state.multiball) {
      if (state.jackpotLit) [status, hot] = [state.superLit ? 'SUPER → BORGEN' : 'JACKPOT → BORGEN', true];
      else if (state.addBallLit) [status, hot] = ['+1 BOLL → V.GRAV', true];
      else status = state.superLit ? 'TÄND SUPER' : 'TÄND JACKPOT';
    } else if (state.lockLit) [status, hot] = ['LÅS → BORGEN', true];
    else if (state.gate.bashed && gateIsOpen()) [status, hot] = ['STORMA BORGEN!', true];
    else if (state.modeStartLit) [status, hot] = ['GREN → BORGEN', true];
    else if (state.castle.ebLit) [status, hot] = ['EB → K.VÄGEN', true];
    else if (state.gate.hits > 0) status = `PORTEN ${state.gate.hits}/3`;
    else if (state.extraBalls > 0) status = 'EXTRA BOLL';
    else status = `LÅS ${'●'.repeat(state.locked)}${'○'.repeat(Math.max(0, 2 - state.locked))}`;
    d.play({ score: scoreShown, ball: state.ballNo, mult: state.mult, mode, status, hot }, t);
  };

  /* ---- Graphics watchdogs ---- */
  /**
   * The table lit with the fewest, cheapest shaders: insert and bumper lamps
   * out of the lighting loop (their glow pools and emissive stay), and the
   * clearcoat playfield on a standard material. The last resort if the frame
   * is still black after the other steps — e.g. a GPU whose uniform limit the
   * twenty-light clearcoat shader overruns, which fails to link and leaves
   * the playfield invisible.
   */
  let lightRig = 'full';
  function simplifyShading() {
    lightRig = 'simple';
    Object.values(refs.inserts).forEach((ins) => (ins.light.visible = false));
    refs.bumpers.forEach((b) => (b.light.visible = false));
    const plain = new THREE.MeshStandardMaterial({
      map: pfTexture,
      roughness: 0.42,
      metalness: 0,
      envMapIntensity: 0.6
    });
    refs.playfield.material = plain;
  }
  function dropShadows() {
    renderer.shadowMap.enabled = false;
    scene.traverse((o) => {
      if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
    });
  }
  // A black frame on some GPU: step down instead of leaving the game
  // unplayable — past the post-processing, then without shadows, then the
  // simple light rig. Nothing in a working frame of this table is dark enough
  // to trip it: the lit playfield alone is a quarter of the screen.
  const watchdog = new RenderWatchdog(renderer, [
    () => {
      usePost = false;
    },
    dropShadows,
    simplifyShading
  ], {
    minLitFraction: 0.06,
    onStep: () => gfxNotice(container, 'Grafiken förenklades för att fungera på den här enheten.')
  });

  /* ---- Loop ---- */
  renderer.info.autoReset = false;
  const perf = { drawCalls: 0, triangles: 0, frameMs: 16 };
  // Frame-time watchdog: if the device can't hold ~45 fps, trim the pixel
  // ratio a step at a time; at the floor, drop bloom for good. It only ever
  // steps down — a quality setting that comes back when the frame rate
  // recovers is one that toggles forever, and every toggle reallocates the
  // render targets. A step needs two slow windows in a row, so one hitch
  // (a GC, a tab switch) never costs resolution. (Skipped under automation,
  // where software GL would trim it to nothing.)
  const DPR_FLOOR = Math.max(0.75, dprMax * 0.55);
  const watch = { acc: 0, frames: 0, slow: 0, on: !navigator.webdriver };
  function adapt(real) {
    if (!watch.on || real <= 0 || real >= 0.25) return;
    watch.acc += real;
    watch.frames++;
    if (watch.acc < 2.5) return;
    const avg = watch.acc / watch.frames;
    watch.acc = 0;
    watch.frames = 0;
    watch.slow = avg > 1 / 45 ? watch.slow + 1 : 0;
    if (watch.slow < 2) return;
    watch.slow = 0;
    if (dpr > DPR_FLOOR + 0.01) {
      dpr = Math.max(DPR_FLOOR, dpr - 0.2);
      renderer.setPixelRatio(dpr);
      composer.setPixelRatio(dpr);
      resize();
    } else if (usePost && avg > 1 / 36) {
      usePost = false;
    } else {
      watch.on = false; // nothing cheaper left to give
    }
  }
  let peek = null;
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const FIXED = 1 / 120;
  const axis = new THREE.Vector3();
  let boardTick = 0;

  function tick(realNow) {
    raf = requestAnimationFrame(tick);
    const real = Math.max(0, (realNow - last) / 1000);
    const dtRaw = Math.min(0.05, real);
    last = realNow;
    if (real > 0) perf.frameMs += (real * 1000 - perf.frameMs) * 0.1;
    if (!running) return;
    if (helpOpen) {
      // Resize clears the render targets. Repaint the frozen table after a
      // rotation without advancing coils, ball physics or scheduled events.
      if (needsRedraw) drawFrame();
      return;
    }
    gameClock.tick(dtRaw);
    const now = gameClock.now * 1000;
    if (root.dataset.phase !== state.phase) root.dataset.phase = state.phase;

    // rAF timestamps can predate `last` (clamped above) or arrive seconds
    // late after a shader compile; neither says anything about steady-state
    // frame time, so the watchdog ignores them.
    adapt(real);

    // Time scale: hit-stop freezes, slow motion eases back to full speed
    let ts = 1;
    if (time.stop > 0) {
      time.stop -= dtRaw;
      ts = 0;
    } else if (time.hold > 0) {
      time.hold -= dtRaw;
      ts = time.scale;
    } else {
      time.scale += (1 - time.scale) * Math.min(1, dtRaw * 3.2);
      ts = time.scale;
    }
    const dt = dtRaw * ts;

    // Plunger charge
    if (state.phase === 'launch' && state.charging) {
      state.power = Math.min(1, state.power + dtRaw * 1.15);
      hud.powerFill.style.width = `${state.power * 100}%`;
      const band = SKILL_BANDS[state.skill];
      const ready = state.power >= band.lo && state.power <= band.hi;
      hud.plunger.dataset.ready = String(ready);
      hud.plungerLabel.textContent = ready ? `SLÄPP NU · ${fmtScore(band.pts)} POÄNG` : state.power > band.hi ? 'SLÄPP FÖR ATT SPELA' : plungerHint;
    }

    acc += dt;
    let guard = 0;
    while (acc >= FIXED && guard++ < 8) {
      world.step(state.balls, FIXED);
      acc -= FIXED;

      if (state.phase === 'play') {
        for (let bi = state.balls.length - 1; bi >= 0; bi--) {
          const b = state.balls[bi];
          if (!b.live) continue;

          if (b.y < -1.2 || b.y > 48 || Math.abs(b.x) > 13) {
            drainOne(b);
            continue;
          }

          // Past the flippers and falling: the ball is gone. If the save
          // lamp is lit (or it is the last ball of the game), let the moment
          // play out in slow motion.
          if (!b.doomed && b.y < 4.4 && b.vy < -2 && b.x < L.laneX &&
            state.balls.length === 1 && state.riders.length === 0) {
            b.doomed = true;
            const saving = (gameClock.now * 1000) < state.ballSaveUntil;
            const final = !saving && state.ballNo >= BALLS_PER_GAME && state.extraBalls === 0;
            if (saving || final) {
              slowMo(saving ? 0.28 : 0.4, 0.4);
              sfx.slowmo();
            }
          } else if (b.doomed && b.y > 6) {
            b.doomed = false;
          }

          // A ball loitering in the shooter lane can never get out on its own
          if (b.x > L.laneX && b.y < L.domeY && b.speed < 4) {
            b.laneFor = (b.laneFor || 0) + FIXED;
            if (b.laneFor > 1.4) {
              b.vy = 58;
              b.vx = 0;
              b.laneFor = 0;
              sfx.launch();
            }
          } else {
            b.laneFor = 0;
          }

          // Ball search. A real machine shakes its coils to free a lost
          // ball and, if that fails, simply serves a new one. Escalating the
          // shove and then re-serving guarantees no ball is ever stranded,
          // whatever corner of the geometry it found.
          // A ball held on a raised flipper is a cradle, not a lost ball
          const cradled = (flipL.pressed || flipR.pressed) && b.y < 11.5;
          if (b.speed < 1.1 && !cradled && !(b.x > L.laneX && b.y < 4)) {
            b.stuckFor = (b.stuckFor || 0) + FIXED;
            if (b.stuckFor > 3) {
              b.searches = (b.searches || 0) + 1;
              b.stuckFor = 0;
              ballSearch(b, b.searches);
              // Still stuck after three searches: put it back in the shooter
              // lane and fire it. No ball lost, no penalty.
              if (b.searches >= 4) {
                b.searches = 0;
                b.place(L.laneBallX, L.laneBottomY + L.laneWallR + L.ballRadius + 0.06, 0, 0);
                b.laneFor = 1.3;
                say(['BOLLEN', 'LETAS UPP...'], { prio: 1 });
              }
            }
          } else {
            b.stuckFor = 0;
            b.searches = 0;
          }
        }

        // Mode clock
        if (state.mode) {
          state.mode.timeLeft -= FIXED;
          if (state.mode.timeLeft <= 0) failMode();
        }
      }
    }

    // Riders travel their wireform, then rejoin the simulation
    if (state.phase === 'play') {
      for (let ri = state.riders.length - 1; ri >= 0; ri--) {
        const r = state.riders[ri];
        // The wire costs speed on the climb and gives it back on the way
        // down: the ball's pace (and its rolling sound) follows the bends
        const tan = refs.rampCurves[r.side].getTangentAt(Math.min(1, r.t));
        r.v = clamp(r.v - (tan.y * 30 - tan.z * 12) * dt, 16, 42);
        r.t += (r.v * dt) / r.len;
        if (r.t >= 1) {
          state.riders.splice(ri, 1);
          releaseRider(r);
        }
      }
    }

    // Trolls: respawn after being knocked down, drive collider + mesh
    {
      const now2 = (gameClock.now * 1000);
      const modeRunning = !!state.mode || state.multiball;
      state.trolls.forEach((t, i) => {
        if (!modeRunning) t.up = false;
        else if (!t.up && t.downUntil && now2 > t.downUntil) {
          t.up = true;
          t.downUntil = 0;
          sfx.trollUp();
        }
        colliderRefs.trolls[i].enabled = t.up;
        const mesh = refs.trolls[i];
        const wantY = t.up ? 0 : -2.2;
        mesh.group.visible = mesh.group.position.y > -2.1 || t.up;
        mesh.group.position.y += (wantY - mesh.group.position.y) * Math.min(1, dtRaw * 7);
      });
    }

    driveLamps(now, dtRaw);
    refs.lamps.update(dtRaw);

    // Spinner blade keeps turning and slows down, like real spinner inertia
    if (refs.spinner) {
      const sp = refs.spinner;
      if (sp.spin > 0) {
        sp.blade.rotation.x += sp.spin * dt * 6;
        sp.spin = Math.max(0, sp.spin - dt * 3.2);
      }
    }

    // Castle gate: the collider blocks only while the gate is closed, and the
    // drawbridge/portcullis animate toward the current state.
    // The door FALLS (it accelerates and bounces once on the forecourt) and
    // is winched back up slowly. The collider follows the door, not the
    // rules: it keeps stopping the ball until the door is most of the way
    // down, and blocks again once it is most of the way back up.
    {
      const open = gateIsOpen();
      const ga = gateAnim;
      const DOWN = Math.PI / 2 - 0.05;
      const playing = state.phase === 'play';
      if (open) {
        ga.winching = false;
        if (ga.ang < DOWN || ga.vel < 0) {
          ga.vel += 26 * dtRaw;
          ga.ang += ga.vel * dtRaw;
          if (ga.ang >= DOWN) {
            ga.ang = DOWN;
            if (ga.vel > 3) {
              if (playing) {
                sfx.bridgeSlam();
                jolt(0.3, 0);
                fx.spark(GATE_X, 0.3, -(GATE_Y - 1.9), 0xb59a72, 12, 6, 3);
              }
              ga.vel = -ga.vel * 0.2;
            } else {
              ga.vel = 0;
            }
          }
        }
      } else {
        ga.vel = 0;
        if (ga.ang > 0) {
          if (!ga.winching && playing) sfx.winch();
          ga.winching = true;
          ga.ang = Math.max(0, ga.ang - 1.7 * dtRaw);
        }
      }
      // A bashed gate that closes again has been repaired
      if (ga.wasOpen && !open && state.gate.bashed) {
        state.gate.bashed = false;
        state.gate.hits = 0;
        if (playing) say(['PORTEN', 'LAGAD'], { prio: 1, dur: 1 });
      }
      ga.wasOpen = open;
      // The shudder of a hit, sprung back to rest
      ga.wobV += (-ga.wob * 300 - ga.wobV * 13) * dtRaw;
      ga.wob += ga.wobV * dtRaw;
      ga.rattle = Math.max(0, ga.rattle - dtRaw * 0.3);
      const { bridge, door } = refs.castle;
      bridge.rotation.x = ga.ang + ga.wob * (1 - ga.ang / DOWN);
      colliderRefs.gate.enabled = open ? ga.ang < 0.55 : ga.ang < 1.0;
      // Crack frames: whole, cracked, splintered; smashed once bashed in.
      // The repaired door shows whole as it comes back up.
      const frame = state.gate.bashed && ga.ang > 0.8 ? 3 : Math.min(2, state.gate.hits);
      if (door && door.frame !== frame) {
        door.frame = frame;
        door.tex.offset.x = frame * 0.25;
      }
      // The portcullis lifts once the door is down and drops ahead of it
      const port = refs.castle.portcullis;
      const k = Math.min(1, dtRaw * 6);
      const wantY = ga.ang > 1.0 ? 3.35 : 1.88;
      port.position.y += (wantY - port.position.y) * k;
      if (ga.rattle > 0) port.position.y += Math.sin(now * 0.09) * ga.rattle;
      refs.castle.lamp.intensity +=
        ((open ? 1.4 : 0.6) - refs.castle.lamp.intensity) * k;
      ga.glow = Math.max(0, ga.glow - dtRaw * 1.6);
      const siege = state.gate.bashed && open ? 0.5 + 0.5 * Math.sin(now / 140) : 0;
      const flick = reduceMotion ? 1 : 0.92 + 0.08 * Math.sin(now / 97) * Math.sin(now / 53);
      winCol.copy(WIN_BASE).lerp(WIN_SIEGE, siege * 0.6).lerp(WIN_HOT, ga.glow).multiplyScalar(flick);
      materials.window.color.copy(winCol);
    }

    // Mission select: runs out on its own if the player does not choose
    if (state.held && state.phase === 'play') {
      state.held.t += dtRaw;
      state.held.idle += dtRaw;
      if (state.held.t > SELECT_MAX || state.held.idle > SELECT_IDLE) endSelect();
    }

    // The nudge button warms up with each recent nudge: the tilt bob made visible
    {
      const nowN = (gameClock.now * 1000);
      // Read off the same settling tilt bob doNudge uses, as a forecast:
      // amber when a nudge now would draw a warning, red when it would TILT.
      // The colour cools as the cabinet settles.
      const bob = (state.bob || 0) * 0.5 ** (Math.max(0, nowN - (state.bobAt || nowN)) / 1400);
      const heat = state.phase === 'play' && !state.tilted ? (bob + 1 > 3 ? 3 : bob + 1 > 2.2 ? 2 : 0) : 0;
      if (hud.nudge.dataset.heat !== String(heat)) hud.nudge.dataset.heat = String(heat);
    }

    // Mode card (landscape)
    if (state.mode) {
      const m = state.mode;
      const secs = Math.max(0, Math.ceil(m.timeLeft));
      hud.mode.hidden = false;
      hud.modeName.textContent = m.wizard ? 'Finalen' : `${m.def.label} '${String(m.def.year).slice(2)}`;
      hud.modeTask.textContent = m.wizard ? 'Allt räknas ×5' : `${m.progress}/${m.def.goal} · ${m.def.hint}`;
      hud.modeTime.textContent = clock(secs);
      hud.modeTime.classList.toggle('urgent', secs <= 10);
      hud.modeBar.style.transform = `scaleX(${clamp(m.timeLeft / m.def.time, 0, 1)})`;
    } else if (!hud.mode.hidden) {
      hud.mode.hidden = true;
    }
    renderGoal();
    updateCoach((gameClock.now * 1000));
    boardTick += dtRaw;
    if (view.land && boardTick > 0.4) {
      boardTick = 0;
      renderBoard();
    }

    // Ball transforms + rolling spin (mesh pool). Balls riding a wireform are
    // drawn at their 3D curve position instead of on the playfield plane.
    let meshIdx = 0;
    let fastest = 0;
    for (const b of state.balls) {
      if (!b.live || meshIdx >= ballMeshes.length) continue;
      const mesh = ballMeshes[meshIdx];
      mesh.visible = true;
      // Rolling over the fallen drawbridge, the ball rides on its planks
      const onBridge = gateAnim.ang > 1.2 && Math.abs(b.x - GATE_X) < 1.35 && b.y > GATE_Y - 2.1 && b.y < GATE_Y;
      mesh.position.set(b.x, L.ballRadius + 0.04 + (onBridge ? 0.15 : 0), -b.y);
      if (b.speed > 0.01) {
        axis.set(-b.vy, 0, -b.vx).normalize();
        mesh.rotateOnWorldAxis(axis, (b.speed * dt) / L.ballRadius);
      }
      fx.trail(meshIdx, mesh.position, b.speed, state.phase === 'play' && !reduceMotion);
      if (!(b.x > L.laneX && b.y < 4)) fastest = Math.max(fastest, b.speed);
      meshIdx++;
    }
    let wireSpeed = 0;
    for (const r of state.riders) {
      if (meshIdx >= ballMeshes.length) break;
      const mesh = ballMeshes[meshIdx];
      mesh.visible = true;
      const p = refs.rampCurves[r.side].getPointAt(Math.min(1, r.t));
      mesh.position.set(p.x, p.y + L.ballRadius, p.z);
      const tan = refs.rampCurves[r.side].getTangentAt(Math.min(1, r.t));
      axis.set(tan.z, 0, -tan.x).normalize();
      mesh.rotateOnWorldAxis(axis, ((r.v || 16) * dt) / L.ballRadius);
      fx.trail(meshIdx, mesh.position, 30, !reduceMotion);
      wireSpeed = Math.max(wireSpeed, r.v || 0);
      meshIdx++;
    }
    if (state.held && meshIdx < ballMeshes.length) {
      // Waiting in the courtyard for the player's choice, bobbing
      const mesh = ballMeshes[meshIdx];
      const slot = L.lockSlots[1];
      mesh.visible = true;
      mesh.position.set(slot.x, L.ballRadius + 0.04 + Math.abs(Math.sin(now / 170)) * 0.3, -slot.y);
      fx.trail(meshIdx, mesh.position, 0, false);
      meshIdx++;
    }
    for (; meshIdx < ballMeshes.length; meshIdx++) {
      ballMeshes[meshIdx].visible = false;
      fx.trail(meshIdx, ballMeshes[meshIdx].position, 0, false);
    }
    sfx.roll(state.phase === 'play' ? fastest : 0, state.riders.length > 0, wireSpeed);

    // Contact shadows follow their ball and fade as it climbs a wireform —
    // a shadow that stays hard while the ball is three units in the air is
    // worse than no shadow at all.
    ballShadows.forEach((sh, i) => {
      const mesh = ballMeshes[i];
      sh.visible = mesh.visible;
      if (!mesh.visible) return;
      const lift = Math.max(0, mesh.position.y - L.ballRadius - 0.04);
      // Nudged a touch away from the key light (up and to the right)
      sh.position.set(mesh.position.x - 0.08 - lift * 0.3, 0.03, mesh.position.z + 0.06 + lift * 0.2);
      sh.scale.setScalar(L.ballRadius * (3.3 + lift * 1.3));
      sh.material.opacity = Math.max(0, 1 - lift * 0.42);
    });

    // Flippers
    // rotation.y = +angle, NOT -angle: the playfield→world mapping (y → −z)
    // is a reflection, and a positive Y-rotation already sweeps +x toward −z,
    // which is exactly playfield-counterclockwise. Negating the angle mirrors
    // the visual flipper against the physics one — it looks like it swings
    // down while the real (invisible) flipper swings up.
    refs.flippers.left.rotation.y = flipL.angle;
    refs.flippers.right.rotation.y = flipR.angle;

    updateShake(dtRaw);

    // The cabinet's plunger rod follows the launch power, like the one inside
    if (cab.refs.plungerRod) {
      const rod = cab.refs.plungerRod;
      rod.position.z = rod.userData.home + (state.phase === 'launch' ? state.power * 1.5 : 0);
    }

    // Plunger pull-back
    if (refs.plunger) {
      const back = state.phase === 'launch' ? state.power * 1.5 : 0;
      refs.plunger.position.z = -L.laneBottomY + 0.6 + back;
      // From the lane wall to the front of the knob (rod centre + 1.5 − 0.42)
      if (refs.spring) refs.spring.scale.z = Math.max(0.2, refs.plunger.position.z + 1.08 - refs.spring.position.z);
    }

    // Drop target animation
    // A drop target falls straight into its slot in a blink and rises back
    // a little slower; once it is all the way down it is not drawn at all
    const nextSkytte = state.mode && state.mode.def.id === 'skytte' ? state.mode.progress : -1;
    refs.targets.forEach((tg, i) => {
      const want = tg.down ? -1.26 : 0;
      const rate = tg.down ? 30 : 12;
      tg.group.position.y += (want - tg.group.position.y) * Math.min(1, dtRaw * rate);
      tg.group.visible = !tg.down || tg.group.position.y > -1.2;
      const hot = i === nextSkytte && !tg.down;
      tg.mat.emissiveIntensity = tg.down ? 0 : hot ? 0.3 + (Math.floor(now / 140) % 2) * 0.6 : 0.3;
    });

    // Idle shimmer + flash decay
    const t = now / 1000;
    refs.jackpot.trophy.rotation.y = t * 0.9;
    refs.jackpot.halo.scale.setScalar(1 + Math.sin(t * 2.4) * 0.06);
    refs.bumpers.forEach((b, i) => {
      if (b.isTrophy) b.trophy.rotation.y = t * 1.1;
      if (b.bead) {
        const hot = state.bumperLit && state.bumperLit[i];
        b.bead.scale.setScalar(hot ? 1.15 + Math.sin(t * 7 + i) * 0.12 : 1);
        b.trophy.material.emissiveIntensity = hot ? 1.5 : 0.5;
      }
      b.group.scale.lerp(vOne, Math.min(1, dtRaw * 9));
      // Mechanics: the ring is yanked down and springs back, the skirt dips
      // toward where the ball struck
      if (b.skirt && b.fire > 0) {
        b.fire = Math.max(0, b.fire - dtRaw * 9);
        b.ring.position.y = b.ringY - 0.34 * Math.min(1, b.fire * 1.6);
        b.skirt.rotation.x = b.tiltX * b.fire;
        b.skirt.rotation.z = b.tiltZ * b.fire;
      }
    });
    [refs.leftSling, refs.rightSling].forEach((m) => {
      if (!m || !(m.userData.fire > 0)) return;
      m.userData.fire = Math.max(0, m.userData.fire - dtRaw * 10);
      if (m.userData.kick) m.position.copy(m.userData.kick).multiplyScalar(0.2 * Math.min(1, m.userData.fire * 1.5));
    });
    Object.values(refs.rampFlaps || {}).forEach((fl) => {
      if (!(fl.userData.fire > 0)) return;
      fl.userData.fire = Math.max(0, fl.userData.fire - dtRaw * 3.5);
      fl.rotation.x = fl.userData.restX - 0.45 * Math.sin(Math.PI * fl.userData.fire);
    });

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dtRaw;
      if (f.light) {
        f.light.intensity = Math.max(f.base || 0, f.light.intensity - dtRaw * (f.rate || 14));
        if (f.light.intensity <= (f.base || 0) + 0.01) flashes.splice(i, 1);
      } else if (f.mat) {
        f.mat.emissiveIntensity = Math.max(f.base, f.mat.emissiveIntensity - dtRaw * 16);
        if (f.mat.emissiveIntensity <= f.base + 0.01) flashes.splice(i, 1);
      } else if (f.obj) {
        const home = f.obj.userData.baseScale;
        const sc = f.obj.scale.x + (home - f.obj.scale.x) * Math.min(1, dtRaw * 10);
        f.obj.scale.setScalar(sc);
        if (Math.abs(sc - home) < 0.004) {
          f.obj.scale.setScalar(home);
          flashes.splice(i, 1);
        }
      }
    }

    fx.update(dt > 0 ? dtRaw : 0);
    rollScore(dtRaw);
    dmd.update(dtRaw);
    room.update(t);

    // Gentle parallax toward the action, plus the camera kick
    const lead = state.balls[0];
    if (lead) target.x += (lead.x * 0.1 - target.x) * Math.min(1, dtRaw * 2);
    camera.position.copy(camBase).add(kick.p);
    pv.copy(target).addScaledVector(kick.p, 0.5);
    camera.lookAt(pv);
    // Attract showcase: before Start (or a while after a game ends), on a
    // wide screen, the camera tours the cabinet; Start flies it back in
    if (state.phase !== 'over') overSince = now;
    const wantShow = showcaseOk && !peek && (state.phase === 'idle' || (state.phase === 'over' && now - overSince > 9000));
    showcase.apply(camera, scene.fog, pv, dtRaw, wantShow);
    const sk = showcase.k;
    // The glass sheet only shows at a low angle; on phones it is a full-table
    // blend for nothing while playing, so it is drawn only in the showcase
    glassSheet.visible = !small || sk > 0 || !!peek;
    if (small) room.decor.forEach((o) => (o.visible = sk > 0 || !!peek));
    room.fill.intensity = 0.1 + 1.25 * (peek ? 1 : sk);
    // The coin door's lights sit under the portrait HUD's bottom row: dim
    // while playing, full in the showcase
    cab.refs.doorLit.color.setScalar(0.42 + 0.7 * (peek ? 1 : sk));
    if (peek) {
      // Test hook: a close-up camera (window.__pbFlipper.peek)
      camera.position.copy(peek.from);
      camera.lookAt(peek.to);
    }

    drawFrame();
    watchdog.afterFrame();
    // The composer's output pass is the last thing drawn, so reading
    // renderer.info afterwards reports one fullscreen quad. Snapshot the
    // whole frame instead, for the perf checks.
    perf.drawCalls = renderer.info.render.calls;
    perf.triangles = renderer.info.render.triangles;
    renderer.info.reset();
  }

  // Compile every shader before the first frame, without locking the GPU.
  // On Windows, Chrome and Edge translate WebGL to Direct3D 11, whose
  // compiler is slow on a clearcoat material looping over twenty lights;
  // compiled in one blocking burst at the first render, that can trip the
  // GPU process's watchdog and leave a permanently black canvas. Hidden
  // things (the trolls, the multiball balls, the flash sprites, the trails)
  // are shown for the compile so their first appearance mid-game doesn't
  // stall a frame either.
  ballMeshes.forEach((m, i) => fx.trail(i, m.position, 0, false));
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  // Compiled against the target the frame is really drawn into: three bakes
  // tone mapping and output colour space into each program, and both differ
  // between the screen and the composer's buffer. Compiled for the screen,
  // every material would compile a second time — in one blocking burst — at
  // the first composed frame.
  await precompile(renderer, scene, camera, { target: usePost ? composer.renderTarget1 : null });
  hidden.forEach((o) => {
    o.visible = false;
  });
  last = performance.now();
  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
    if (document.hidden) onBlur();
  };
  document.addEventListener('visibilitychange', onVisibility);

  /*
   * A restored WebGL context brings back geometry and image textures, but
   * both prefiltered rooms lived only in render targets and come back black:
   * the chrome, the lacquered wood and the ball go dull. drawFrame() bakes
   * them again before the first visible frame (never in a hidden tab), and
   * only where they are still in use. The generator and the old targets died
   * with the old context; deleting them again would only make WebGL warn, so
   * they are dropped, not disposed.
   */
  function restoreEnvironments() {
    let table = null;
    let ball = null;
    pmrem = new THREE.PMREMGenerator(renderer);
    try {
      table = bake(machineEnvironment);
      ball = bake(ballEnvironment);
    } catch {
      renderer.setRenderTarget(null);
      gfxNotice(container, 'Grafiken förenklades för att fungera på den här enheten.');
    }
    if (envRT && scene.environment === envRT.texture) scene.environment = table ? table.texture : null;
    if (ballEnvRT && materials.ball.envMap === ballEnvRT.texture) materials.ball.envMap = ball ? ball.texture : null;
    envRT = table;
    ballEnvRT = ball;
  }
  const onContextRestored = () => {
    if (envRT || ballEnvRT) environmentRestorePending = true;
    needsRedraw = true;
  };
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

  renderBalls();
  renderMult();
  renderPokal();
  renderGrenar();
  renderBoard();
  showSheet(startSheet({ touch, board }));

  // Deterministic hooks for automated tests (and curious friends)
  window.__pbFlipper = {
    state,
    clock: gameClock,
    scene,
    camera,
    renderer,
    refs,
    dmd,
    /** The physics flippers: `.pressed` shows input arriving, `.angle` the swing */
    flippers: colliderRefs.flippers,
    /** The physics world (gravity, nudge, colliders) for the feel rig */
    world,
    info() {
      return {
        ...perf,
        dpr,
        orient: root.dataset.orient,
        post: usePost,
        shadows: renderer.shadowMap.enabled,
        lights: lightRig,
        watchdog: watchdog.level,
        near: camera.near,
        showcase: Math.round(showcase.k * 100) / 100
      };
    },
    startGame,
    startNextMode,
    startMultiball,
    startFinalen,
    completeBank() {
      L.targets.forEach((t, i) => hooks.onTarget(i, 2));
    },
    lightLock() {
      state.bumperLit = [true, true, true];
      state.lockLit = true;
      updateStatus();
    },
    hitJackpot() {
      hooks.onJackpot(3, state.balls[0]);
    },
    hitSensor(id) {
      state.sensorLast[id] = 0;
      hooks.onSensor(id, 3, state.balls[0]);
    },
    hitBumper(i) {
      hooks.onBumper(i, 3);
    },
    hitTarget(i) {
      hooks.onTarget(i, 3);
    },
    raiseTrolls,
    lowerTrolls,
    hitTroll(i) {
      hooks.onTroll(i, 3);
    },
    hitGate() {
      state.sensorLast.gate = 0;
      hooks.onGate(3, state.balls[0]);
    },
    /** Mission select: step the choice (-1/1), or start the gren on show */
    selectStep: cycleSelect,
    selectStart: endSelect,
    gateAnim,
    rideRamp(side) {
      if (state.balls[0]) captureRamp(side, state.balls[0]);
    },
    launch(power = 0.5) {
      state.power = power;
      launchBall();
    },
    nudge: doNudge,
    /** Close-up camera for screenshots: peek([x,y,z], [tx,ty,tz]) in world units; peek() restores */
    peek(from, to) {
      if (!from) {
        peek = null;
        camera.near = clamp(camBase.distanceTo(target) * 0.35, 0.5, 40);
        resize();
        return;
      }
      showcase.cut(0);
      peek = { from: new THREE.Vector3(...from), to: new THREE.Vector3(...to) };
      camera.up.set(0, 1, 0);
      camera.clearViewOffset();
      camera.near = 0.5;
      camera.updateProjectionMatrix();
      scene.fog.near = 200;
      scene.fog.far = 400;
    },
    /** Showcase camera now, at orbit time t (for screenshots) */
    showcaseAt(t = 9) {
      showcase.cut(1, t);
    },
    /** Fire the flasher domes (for screenshots) */
    flasher: fireFlasher,
    /** Show an onboarding bubble now (for screenshots) */
    coach,
    /** Drop every ball straight into the drain */
    drain() {
      if (state.held) endSelect();
      state.riders.splice(0).forEach((r) => {
        r.ball.live = true;
        state.balls.push(r.ball);
      });
      state.balls.forEach((b) => b.place(L.centerX, 2, 0, -30));
    },
    saveName,
    board: () => board.slice(),
    gateIsOpen
  };

  /* ---- Teardown ---- */
  function destroy() {
    cancelAnimationFrame(raf);
    running = false;
    gameClock.destroy();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    canvasHost.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('keydown', onKeyCapture, true);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    if (window.__pbFlipper && window.__pbFlipper.state === state) delete window.__pbFlipper;
    // Before the context is lost on purpose below, or the guard's listener
    // would put a "graphics lost" notice on the next game's stage
    watchdog.dispose();
    gfx.dispose();

    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          Object.values(m).forEach((v) => {
            if (v && v.isTexture) v.dispose();
          });
          m.dispose();
        });
      }
    });
    Object.values(materials).forEach((m) => m.dispose());
    pfTexture.dispose();
    dmd.dispose();
    fx.dispose();
    room.dispose();
    envRT?.dispose();
    ballEnvRT?.dispose();
    pmrem.dispose();
    // Passes own their materials and targets; the composer only its two
    composer.passes.forEach((pass) => pass.dispose());
    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    sfx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createPinball;
