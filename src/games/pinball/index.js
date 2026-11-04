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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { guardRenderer, postTarget, addSanitize, RenderWatchdog, gfxNotice, precompile } from '../shared/gfx.js';

import { World, Ball, clamp } from './physics.js';
import { L, buildColliders, createPlayfieldCanvas } from './table.js';
import {
  CAB, headTop, buildTable, buildCabinet, buildGlass, createMaterials, machineEnvironment
} from './meshes.js';
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
// Release the plunger inside this band of the meter for a skill shot
const SKILL_ZONE = [0.68, 0.86];

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

  // Every game-logic timer goes through here so destroy() can cancel them
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };

  const sfx = new Sfx();

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
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envSource = machineEnvironment(THREE);
  const envRT = pmrem.fromEquirectangular(envSource);
  envSource.dispose();
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

  // Ball mesh pool for multiball, plus parked meshes for locked balls
  const ballMeshes = [refs.ball];
  for (let i = 1; i < 3; i++) {
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
    m.scale.setScalar(L.ballRadius * 4.2);
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
  const cab = buildCabinet(THREE, materials, logo, dmd.material);
  scene.add(cab.group);
  const glass = buildGlass(THREE);
  scene.add(glass);
  const room = buildRoom(THREE, { mergeGeometries, materials });
  scene.add(room.group);
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
  const drawFrame = () => {
    if (usePost) composer.render();
    else renderer.render(scene, camera);
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
    { id: 'gokart', year: 2012, name: 'GOKART', label: 'Gokart', hint: 'Kör 3 varv — orbit eller ramp', goal: 3, time: 35 },
    { id: 'femkamp', year: 2013, name: 'FEMKAMP', label: 'Femkamp', hint: 'Träffa 5 olika skott', goal: 5, time: 60 },
    { id: 'pingis', year: 2019, name: 'PINGIS', label: 'Pingis', hint: '12 bumperträffar', goal: 12, time: 35 },
    { id: 'skytte', year: 2022, name: 'SKYTTE', label: 'Skytte', hint: 'Fäll P→O→K→A→L i ordning', goal: 5, time: 45 },
    { id: 'fiske', year: 2024, name: 'FISKE', label: 'Fiske', hint: '3 napp på pokalen i borgen', goal: 3, time: 40 }
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

    // Castle gate: bashed open with 3 hits, or held open by locks/modes
    gate: { hits: 0, until: 0 },
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
    perBall: { bumps: 0, targets: 0, orbits: 0, ramps: 0, trolls: 0 },
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
    const cur = state.mode ? state.mode.def.id : null;
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

  /** The one thing worth doing next, in words */
  function nextGoal() {
    if (state.phase === 'launch') return 'Släpp avfyraren i det turkosa fältet för skill shot';
    if (state.phase !== 'play') return '';
    if (state.tilted) return 'TILT — flipprarna är döda tills nästa boll';
    const m = state.mode;
    if (m && m.wizard) return 'Finalen: allt räknas ×5 — håll bollarna vid liv';
    if (state.multiball) {
      return state.jackpotLit ? 'Jackpot tänd — skjut pokalen i borgen' : 'Skjut en orbit eller ramp för att tända jackpot';
    }
    if (m) {
      if (m.def.id === 'skytte') return `Skytte: fäll ${L.targets[Math.min(4, m.progress)].letter} härnäst`;
      if (m.def.id === 'fiske') return 'Fiske: porten är öppen — skjut pokalen';
      return `${m.def.label}: ${m.def.hint.toLowerCase()}`;
    }
    if (state.modeStartLit) {
      return MODES.every((x) => state.modeDone.has(x.id)) ? 'Finalen tänd — skjut vänster orbit' : 'Gren tänd — skjut vänster orbit';
    }
    if (state.lockLit) return 'Låset är tänt — skjut in bollen i borgen';
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

  const clock = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  function addScore(n) {
    const wiz = state.mode && state.mode.wizard ? 5 : 1;
    const pts = Math.round(n * state.mult * wiz);
    state.score += pts;
    return pts;
  }

  /* ---- Score pops: the points rise off the thing you hit ---- */
  const view = { w: 1, h: 1, land: false };
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
    if (navigator.vibrate) navigator.vibrate(mag > 1 ? [40, 40, 60] : 25);
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
  function lampShow(kind, color, dur = 1.5) {
    // Reduced motion: lamps may still run up the table, but nothing strobes
    lampFx.kind = reduceMotion && kind === 'strobe' ? 'chase' : kind;
    lampFx.t = 0;
    lampFx.dur = reduceMotion ? Math.min(dur, 0.8) : dur;
    lampFx.color.set(color);
  }

  /* ---- Gameplay hooks ---- */
  // Declared up front: the hooks below close over it, but they only fire once
  // buildColliders has returned.
  let colliderRefs = null;

  /* ---- Combos: chained orbit/jackpot shots inside a rolling window ---- */
  function comboShot() {
    const now = performance.now();
    if (now - state.combo.t < 3500) {
      state.combo.n++;
      const pts = addScore(1000 * 2 ** Math.min(state.combo.n - 1, 4));
      sfx.combo(state.combo.n);
      dmd.combo(state.combo.n, pts);
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
      if (m.progress < m.def.goal && id !== 'pingis') say([m.def.name, `${m.progress}/${m.def.goal}`], { prio: 2 });
    } else if (id === 'femkamp') {
      if (!m.seen.has(kind)) {
        m.seen.add(kind);
        m.progress = m.seen.size;
        if (m.progress < m.def.goal) say(['FEMKAMP', `${m.progress}/5`], { prio: 2 });
      }
    } else {
      return;
    }
    if (m.progress >= m.def.goal) completeMode();
  }

  const GATE_X = (L.castle.gate[0] + L.castle.gate[2]) / 2;
  const GATE_Y = L.castle.gate[1];

  const hooks = {
    onBumper(i, v) {
      if (v < 0.6) return;
      const b = refs.bumpers[i];
      const p = L.bumpers[i];
      award(150, p.x, p.y, 'sm');
      state.perBall.bumps++;
      sfx.bumper();
      flash(b.trophy, b.light, 4.6, b.base);
      b.group.scale.setScalar(1.18);
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
      t.downUntil = performance.now() + 6000;
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
      say(['TROLL NERE!', '+3 000'], { prio: 2 });
    },
    onGate(v, _b) {
      if (v < 1.2) return;
      const now = performance.now();
      if (now - (state.sensorLast.gate || 0) < 350) return;
      state.sensorLast.gate = now;
      state.gate.hits++;
      award(750, GATE_X, GATE_Y);
      sfx.gate();
      jolt(0.5, 0);
      fx.spark(GATE_X, 1, -GATE_Y + 0.4, 0xc9d1ec, 12, 7, 5);
      if (state.gate.hits >= 3) {
        state.gate.hits = 0;
        state.gate.until = now + 9000;
        sfx.gateDown();
        flash(null, refs.castle.lamp, 3.2, 0.6);
        lampShow('chase', 0xf2c14e, 1);
        say(['PORTEN NERE', 'STORMA BORGEN!'], { prio: 2, flash: true, dur: 2 });
      } else {
        say(state.gate.hits === 1 ? ['PORTEN', 'SKAKAR!'] : ['EN SMÄLL', 'TILL!'], { prio: 1, dur: 1.1 });
      }
    },
    onSling(side, v, ball) {
      if (v < 1) return;
      addScore(60);
      sfx.sling();
      // Real sling rubber never throws twice the same way
      if (ball) ball.vx += (Math.random() - 0.5) * 2.5;
      const mesh = side === 'left' ? refs.leftSling : refs.rightSling;
      if (mesh) {
        mesh.material.emissiveIntensity = 4;
        flashes.push({ mat: mesh.material, base: 1.4, t: 0 });
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
          else dmd.pokal(state.pokal, i);
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
          say(allDone ? ['FINALEN TÄND', 'VÄNSTER ORBIT'] : ['P-O-K-A-L!', 'GREN TÄND · V. ORBIT'],
            { prio: 2, flash: true, border: true, dur: 2.2 });
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
        const pts = award(25000, jx, jy, 'big');
        sfx.jackpot();
        dmd.jackpot(pts);
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

      // Lock a ball toward multiball
      if (state.lockLit && !state.multiball && b) {
        lockBall(b);
        return;
      }

      award(2500, jx, jy);
      sfx.jackpot();
      fx.spark(jx, 2, -jy, 0xffd27a, 14, 9, 6);
      comboShot();
      modeEvent('jackpot');
    },
    onSensor(id, _v, b) {
      const now = performance.now();
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
      const op = id === 'leftOrbit' ? [-8.95, 18] : [5.5, 27.2];
      award(1500, op[0], op[1]);
      state.perBall.orbits++;
      sfx.orbit();
      comboShot();
      modeEvent(id);

      if (state.multiball && !state.jackpotLit) {
        state.jackpotLit = true;
        lampShow('chase', 0xf2c14e, 0.9);
        say(['JACKPOT TÄND', 'SKJUT POKALEN!'], { prio: 2, flash: true, dur: 1.8 });
        updateStatus();
        return;
      }

      // Super skill shot: straight around into the left orbit off the plunge
      if (id === 'leftOrbit' && now < state.superUntil) {
        state.superUntil = 0;
        const pts = award(15000, op[0], op[1], 'big');
        sfx.modeWin();
        hitStop(90);
        dmd.skillShot(pts, true);
        lampShow('strobe', 0x5eead4, 1.2);
        return;
      }

      // Mode start
      if (id === 'leftOrbit' && state.modeStartLit && !state.mode && !state.multiball) {
        state.modeStartLit = false;
        startNextMode();
      }
    },
    onWall(v) {
      if (v > 9) sfx.wall(v);
    },
    onFlipper(side, v, b) {
      if (v > 3) sfx.ballHit(v);
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
    state.mode = { def: next, progress: 0, timeLeft: next.time, seen: new Set(), wizard: false };
    if (next.id === 'skytte') resetBank();
    // Fiske needs the trophy, so the trolls stay down for that one
    if (next.id !== 'fiske') later(raiseTrolls, 900);
    sfx.modeStart();
    dmd.modeStart(next.name, next.year, next.hint, next.time);
    lampShow('chase', 0x7c8cf8, 1.8);
    setGI(0x7c8cf8, 1.2 * LAMP);
    renderGrenar();
    updateStatus();
  }

  function completeMode() {
    const m = state.mode;
    if (!m) return;
    state.modeDone.add(m.def.id);
    const pts = addScore(15000);
    sfx.modeWin();
    dmd.modeWin(m.def.name, pts);
    hitStop(110);
    punch(0.8);
    lampShow('strobe', 0xf2c14e, 1.6);
    endMode();

    if (state.modeDone.size >= 2 && !state.extraBallGiven) {
      state.extraBallGiven = true;
      state.extraBalls++;
      renderBalls();
      later(() => {
        sfx.extraBall();
        dmd.extraBall();
      }, 1500);
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
    state.mbSaveUntil = performance.now() + 60000;
    later(raiseTrolls, 1200);
    sfx.multiball();
    say(['FINALEN', 'ALLA BOLLAR · ALLT ×5'], { prio: 3, flash: true, border: true, dur: 3 });
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
    state.mbSaveUntil = performance.now() + 12000;
    sfx.multiball();
    jolt(1.4, 0);
    punch(1.4);
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
  }

  /* ======================= Wireform ramps ======================= */

  /**
   * Lifts a ball out of the 2D world and rides it along the wireform.
   * The mesh follows the 3D curve; on arrival the ball rejoins the
   * simulation at the opposite inlane, Medieval Madness style.
   */
  function captureRamp(side, b) {
    const idx = state.balls.indexOf(b);
    if (idx < 0) return;
    state.balls.splice(idx, 1);
    b.live = false;
    // A hard shot rides the wireform visibly faster than a clean minimum
    const base = side === 'left' ? 22 : 27;
    const dur = clamp(base / Math.max(9, b.speed), 0.9, 2.1);
    state.riders.push({ ball: b, side, t: 0, dur });
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
    comboShot();
    modeEvent(side === 'left' ? 'leftRamp' : 'rightRamp');
    dmd.ramp(side === 'left' ? 'KUNGSVÄGEN' : 'VALLGRAVEN');

    // Like the orbits, a ramp relights the multiball jackpot
    if (state.multiball && !state.jackpotLit) {
      state.jackpotLit = true;
      lampShow('chase', 0xf2c14e, 0.9);
      say(['JACKPOT TÄND', 'SKJUT POKALEN!'], { prio: 2, flash: true, dur: 1.8 });
      updateStatus();
    }
  }

  function releaseRider(r) {
    const ex = L.ramps[r.side].exit;
    r.ball.place(ex.x, ex.y, ex.vx || 0, ex.vy);
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
      say(['TROLLEN', 'VAKNAR!'], { prio: 2, dur: 1.4 });
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
      state.lockLit ||
      (state.multiball && state.jackpotLit) ||
      (state.mode && (state.mode.wizard || state.mode.def.id === 'fiske')) ||
      performance.now() < state.gate.until
    );
  }

  function endMultiball() {
    state.multiball = false;
    state.jackpotLit = false;
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
    later(() => {
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
    state.ballSaveUntil = state.saveUsed ? 0 : performance.now() + BALL_SAVE_MS;
    state.superUntil = performance.now() + 3000;
    hud.plunger.hidden = true;
    hud.nudge.hidden = false;
    sfx.launch();
    // On a phone, show which half of the glass is which flipper until the
    // player has flipped once (or the moment has passed)
    if (touch) {
      hud.zones.classList.add('show');
      later(() => hud.zones.classList.remove('show'), 3500);
    }

    if (p >= SKILL_ZONE[0] && p <= SKILL_ZONE[1]) {
      const pts = addScore(5000);
      sfx.complete();
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

    // A ball riding a wireform still counts as in play
    const inPlay = state.balls.length + state.riders.length;
    if (inPlay >= 1) {
      // Multiball continues — respawn during the grace window
      if (performance.now() < state.mbSaveUntil) {
        say(['BOLL', 'RÄDDAD'], { prio: 1, dur: 1 });
        serveBall(400);
      } else if (inPlay === 1 && state.multiball && !(state.mode && state.mode.wizard)) {
        endMultiball();
      }
      return;
    }

    // Last ball gone
    if (performance.now() < state.ballSaveUntil) {
      state.saveUsed = true;
      state.ballSaveUntil = 0;
      sfx.save();
      dmd.ballSave();
      lampShow('chase', 0x3ddc7b, 1.2);
      placeInLane();
      // Below the skill-shot band: a rescued ball is not a free skill shot
      state.power = 0.6;
      later(() => {
        if (state.phase === 'launch') launchBall();
      }, 550);
      return;
    }

    sfx.drain();
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

    // End-of-ball bonus — counted up row by row on the DMD. A tilted ball
    // forfeits it, as on every real machine.
    const pb = state.perBall;
    const bx = state.bonusX;
    const rows = [];
    if (pb.bumps) rows.push(['BUMPRAR', `${pb.bumps} × 50`]);
    if (pb.targets) rows.push(['MÅL', `${pb.targets} × 300`]);
    if (pb.orbits) rows.push(['ORBITS', `${pb.orbits} × 500`]);
    if (pb.ramps) rows.push(['RAMPER', `${pb.ramps} × 400`]);
    if (pb.trolls) rows.push(['TROLL', `${pb.trolls} × 600`]);
    const bonus = state.tilted
      ? 0
      : (pb.bumps * 50 + pb.targets * 300 + pb.orbits * 500 + pb.ramps * 400 + (pb.trolls || 0) * 600) * bx;
    let wait = 1900;
    if (bonus > 0) {
      const count = (rows.length + (bx > 1 ? 1 : 0) + 1) * 0.5 + 0.9;
      later(() => dmd.bonus(rows, bx, bonus), 700);
      later(() => {
        state.score += bonus;
        sfx.complete();
      }, 700 + count * 1000 - 800);
      wait = Math.max(wait, 700 + count * 1000 + 200);
    }
    state.perBall = { bumps: 0, targets: 0, orbits: 0, ramps: 0, trolls: 0 };
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
    if (pendingScore) return;
    sfx.resume();
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
    state.gate = { hits: 0, until: 0 };
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
    state.perBall = { bumps: 0, targets: 0, orbits: 0, ramps: 0, trolls: 0 };
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
  const flipL = colliderRefs.flippers.left;
  const flipR = colliderRefs.flippers.right;

  function setFlipper(side, pressed) {
    if (state.tilted) return;
    const f = side === 'left' ? flipL : flipR;
    if (f.pressed !== pressed) {
      f.pressed = pressed;
      if (pressed) {
        sfx.flipperUp();
        hud.zones.classList.remove('show');
      } else {
        sfx.flipperDown();
      }
    }
  }

  function refreshFlippers() {
    let left = false;
    let right = false;
    pointers.forEach((side) => {
      if (side === 'left') left = true;
      else if (side === 'right') right = true;
    });
    setFlipper('left', left);
    setFlipper('right', right);
  }

  function onPointerDown(e) {
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
    if (was === 'plunger' && state.phase === 'launch') {
      state.charging = false;
      launchBall();
      return;
    }
    refreshFlippers();
  }

  function onPointerMove(e) {
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
    // Typing a name for the topplista is not playing the game
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (helpOpen) {
      if (k === 'escape' || k === ' ' || k === '?') setHelp(false);
      e.preventDefault();
      return;
    }
    const side = sideOf(e);
    if (side) {
      setFlipper(side, true);
      return;
    }
    if (k === ' ' || k === 'arrowdown' || k === 'enter') {
      if (k === 'enter' && e.target && e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      sfx.resume();
      if (state.phase === 'launch') state.charging = true;
      else if (state.phase === 'idle' || state.phase === 'over') startGame();
    } else if (k === 'n') doNudge();
    else if (k === '?') setHelp(true);
  }

  // Esc closes the strategy card, not the whole game: caught on the way
  // down, before the site's own Esc-closes-the-stage handler sees it
  function onKeyCapture(e) {
    if (helpOpen && e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      setHelp(false);
    }
  }

  function onKeyUp(e) {
    const side = sideOf(e);
    if (side) {
      setFlipper(side, false);
      return;
    }
    const k = e.key.toLowerCase();
    if ((k === ' ' || k === 'arrowdown' || k === 'enter') && state.phase === 'launch' && state.charging) {
      state.charging = false;
      launchBall();
    }
  }

  function doNudge() {
    if (state.phase !== 'play' || state.tilted) return;
    const now = performance.now();
    state.nudges = state.nudges.filter((t) => now - t < 3200);
    state.nudges.push(now);

    if (state.nudges.length > 3) {
      state.tilted = true;
      flipL.pressed = false;
      flipR.pressed = false;
      jolt(2.2, 0);
      dmd.tilt();
      sfx.tilt();
      setGI(0x301010, 0.35 * LAMP);
      return;
    }
    if (state.nudges.length === 3) {
      dmd.warning();
      sfx.warning();
    }
    const dir = Math.random() < 0.5 ? -1 : 1;
    world.nudgeX = dir * 40 + (Math.random() - 0.5) * 22;
    world.nudgeY = 38;
    state.balls.forEach((b) => {
      b.vx += dir * 2.8 + (Math.random() - 0.5) * 3;
      b.vy += 3;
    });
    later(() => {
      world.nudgeX = 0;
      world.nudgeY = 0;
    }, 90);
    jolt(1, dir);
    sfx.wall(30);
  }

  // The tick keeps updating `last` even while paused, so closing the card
  // resumes with a tiny dt — no need to reset the clock here.
  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
    if (open) {
      flipL.pressed = false;
      flipR.pressed = false;
      pointers.clear();
    }
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
  window.addEventListener('pointercancel', onPointerUp);
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
  const top = headTop();
  const corners = [];
  for (const x of [CAB.x0, CAB.x1]) {
    corners.push(new THREE.Vector3(x, 0, CAB.z0));
    corners.push(new THREE.Vector3(x, CAB.railY + 1.3, CAB.z0));
    corners.push(new THREE.Vector3(x, 0, CAB.z1));
    corners.push(new THREE.Vector3(x, top.y, top.z));
  }
  const pv = new THREE.Vector3();

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
      const lit = {
        save: state.phase === 'play' && performance.now() < state.ballSaveUntil,
        leftOrbit: state.modeStartLit || (state.multiball && !state.jackpotLit),
        leftRamp: !!state.mode || state.multiball,
        castle: state.lockLit || (state.multiball && state.jackpotLit) ||
          (state.mode && (state.mode.wizard || state.mode.def.id === 'fiske')),
        rightRamp: !!state.mode || state.multiball,
        trolls: state.trolls.some((tr) => tr.up)
      };
      INSERT_ORDER.forEach((id) => {
        level[id] = lit[id] ? pulse : null;
      });
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
  }

  /* ---- DMD content between callouts ---- */
  const startHint = touch ? 'TRYCK PÅ STARTA' : 'MELLANSLAG';
  dmd.base = (d, t) => {
    if (state.phase === 'idle' || state.phase === 'over') {
      d.attract(t, { board, last: state.lastScore, startHint });
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
    if (state.phase === 'launch') [status, hot] = ['SKILL SHOT?', true];
    else if (state.tilted) [status, hot] = ['TILT', true];
    else if (state.multiball) [status, hot] = [state.jackpotLit ? 'JACKPOT TÄND' : 'TÄND JACKPOT', state.jackpotLit];
    else if (state.lockLit) [status, hot] = ['LÅS TÄNT', true];
    else if (state.modeStartLit) [status, hot] = ['GREN TÄND', true];
    else status = `LÅS ${'●'.repeat(state.locked)}${'○'.repeat(Math.max(0, 2 - state.locked))}`;
    d.play({ score: state.score, ball: state.ballNo, mult: state.mult, mode, status, hot }, t);
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
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const FIXED = 1 / 120;
  let running = true;
  const axis = new THREE.Vector3();
  let boardTick = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const real = Math.max(0, (now - last) / 1000);
    const dtRaw = Math.min(0.05, real);
    last = now;
    if (real > 0) perf.frameMs += (real * 1000 - perf.frameMs) * 0.1;
    if (!running || helpOpen) return;
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
            const saving = performance.now() < state.ballSaveUntil;
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
          if (b.speed < 1.1 && !(b.x > L.laneX && b.y < 4)) {
            b.stuckFor = (b.stuckFor || 0) + FIXED;
            if (b.stuckFor > 2.2) {
              b.searches = (b.searches || 0) + 1;
              const power = 1 + b.searches * 0.7;
              b.vx += clamp((L.centerX - b.x) * 0.9, -7, 7) * power +
                (Math.random() - 0.5) * 5 * power;
              // High up in the habitrail a ball needs a real shove to come
              // back down; low down it only needs a nudge back into play.
              b.vy += (b.y > 20 ? -9 : 6) * power;
              b.stuckFor = 0;
              jolt(0.4 + b.searches * 0.15, 0);
              sfx.wall(20);

              // Still stuck after three searches: put it back in the shooter
              // lane and fire it. No ball lost, no penalty.
              if (b.searches >= 3) {
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
        r.t += dt / r.dur;
        if (r.t >= 1) {
          state.riders.splice(ri, 1);
          releaseRider(r);
        }
      }
    }

    // Trolls: respawn after being knocked down, drive collider + mesh
    {
      const now2 = performance.now();
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
    {
      const open = gateIsOpen();
      colliderRefs.gate.enabled = !open;
      const k = Math.min(1, dtRaw * 6);
      const { bridge } = refs.castle;
      const wantRot = open ? 0.04 : -Math.PI / 2 + 0.12;
      bridge.rotation.x += (wantRot - bridge.rotation.x) * k;
      const port = refs.castle.portcullis;
      const wantY = open ? 3.35 : 1.88;
      port.position.y += (wantY - port.position.y) * k;
      refs.castle.lamp.intensity +=
        ((open ? 1.4 : 0.6) - refs.castle.lamp.intensity) * k;
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
      mesh.position.set(b.x, L.ballRadius + 0.04, -b.y);
      if (b.speed > 0.01) {
        axis.set(-b.vy, 0, -b.vx).normalize();
        mesh.rotateOnWorldAxis(axis, (b.speed * dt) / L.ballRadius);
      }
      fx.trail(meshIdx, mesh.position, b.speed, state.phase === 'play' && !reduceMotion);
      if (!(b.x > L.laneX && b.y < 4)) fastest = Math.max(fastest, b.speed);
      meshIdx++;
    }
    for (const r of state.riders) {
      if (meshIdx >= ballMeshes.length) break;
      const mesh = ballMeshes[meshIdx];
      mesh.visible = true;
      const p = refs.rampCurves[r.side].getPointAt(Math.min(1, r.t));
      mesh.position.set(p.x, p.y + L.ballRadius, p.z);
      const tan = refs.rampCurves[r.side].getTangentAt(Math.min(1, r.t));
      axis.set(tan.z, 0, -tan.x).normalize();
      mesh.rotateOnWorldAxis(axis, (dt * 16) / (2 * Math.PI * L.ballRadius));
      fx.trail(meshIdx, mesh.position, 30, !reduceMotion);
      meshIdx++;
    }
    for (; meshIdx < ballMeshes.length; meshIdx++) {
      ballMeshes[meshIdx].visible = false;
      fx.trail(meshIdx, ballMeshes[meshIdx].position, 0, false);
    }
    sfx.roll(state.phase === 'play' ? fastest : 0, state.riders.length > 0);

    // Contact shadows follow their ball and fade as it climbs a wireform —
    // a shadow that stays hard while the ball is three units in the air is
    // worse than no shadow at all.
    ballShadows.forEach((sh, i) => {
      const mesh = ballMeshes[i];
      sh.visible = mesh.visible;
      if (!mesh.visible) return;
      const lift = Math.max(0, mesh.position.y - L.ballRadius - 0.04);
      sh.position.set(mesh.position.x, 0.03, mesh.position.z);
      sh.scale.setScalar(L.ballRadius * (4.2 + lift * 1.1));
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

    // Plunger pull-back
    if (refs.plunger) {
      const back = state.phase === 'launch' ? state.power * 1.5 : 0;
      refs.plunger.position.z = -L.laneBottomY + 0.6 + back;
    }

    // Drop target animation
    refs.targets.forEach((tg, i) => {
      const want = tg.down ? -1.05 : 0;
      tg.group.position.y += (want - tg.group.position.y) * Math.min(1, dtRaw * 14);
      tg.face.material.emissiveIntensity = tg.down ? 0 : 0.9;
      tg.face.material.color.set(state.pokal[i] ? 0x3a4265 : 0xf26d8d);
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
    dmd.update(dtRaw);
    room.update(t);

    // Gentle parallax toward the action, plus the camera kick
    const lead = state.balls[0];
    if (lead) target.x += (lead.x * 0.1 - target.x) * Math.min(1, dtRaw * 2);
    camera.position.copy(camBase).add(kick.p);
    pv.copy(target).addScaledVector(kick.p, 0.5);
    camera.lookAt(pv);

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
  await precompile(renderer, scene, camera);
  hidden.forEach((o) => {
    o.visible = false;
  });
  last = performance.now();
  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
    if (document.hidden) {
      flipL.pressed = false;
      flipR.pressed = false;
      pointers.clear();
      sfx.roll(0, false);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  renderBalls();
  renderMult();
  renderPokal();
  renderGrenar();
  renderBoard();
  showSheet(startSheet({ touch, board }));

  // Deterministic hooks for automated tests (and curious friends)
  window.__pbFlipper = {
    state,
    scene,
    camera,
    renderer,
    refs,
    dmd,
    /** The physics flippers: `.pressed` shows input arriving, `.angle` the swing */
    flippers: colliderRefs.flippers,
    info() {
      return {
        ...perf,
        dpr,
        orient: root.dataset.orient,
        post: usePost,
        shadows: renderer.shadowMap.enabled,
        lights: lightRig,
        watchdog: watchdog.level,
        near: camera.near
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
    rideRamp(side) {
      if (state.balls[0]) captureRamp(side, state.balls[0]);
    },
    launch(power = 0.5) {
      state.power = power;
      launchBall();
    },
    nudge: doNudge,
    /** Drop every ball straight into the drain */
    drain() {
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
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    canvasHost.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
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
    envRT.dispose();
    pmrem.dispose();
    // Passes own their materials and targets; the composer only its two
    composer.passes.forEach((pass) => pass.dispose());
    composer.dispose();
    if (refs.playfield.material !== materials.playfield) refs.playfield.material.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    sfx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createPinball;
