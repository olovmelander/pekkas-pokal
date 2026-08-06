/**
 * Pekkas Pokal Flipper — a Three.js pinball table.
 *
 * Loaded on demand from the Spel tab. Everything (physics, art, audio) is
 * generated at runtime, so the only download is Three.js itself.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { World, Ball, clamp } from './physics.js';
import { L, buildColliders, createPlayfieldCanvas } from './table.js';
import { buildTable, createMaterials } from './meshes.js';

const BALLS_PER_GAME = 3;
const BALL_SAVE_MS = 9000;
const HIGHSCORE_KEY = 'pp-flipper-highscore';
// Release the plunger inside this band of the meter for a skill shot
const SKILL_ZONE = [0.68, 0.86];

/* --------------------------------------------------------------------- audio */

class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, type = 'triangle', gain = 1, sweep = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, gain = 0.5, freq = 900) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    const env = this.ctx.createGain();
    env.gain.value = gain;
    src.connect(filt).connect(env).connect(this.master);
    src.start(t);
  }

  bumper() { this.tone(520, 0.13, 'square', 0.5, 340); }
  sling() { this.tone(300, 0.09, 'sawtooth', 0.35, 180); }
  flipper() { this.noise(0.05, 0.32, 2400); }
  target() { this.tone(760, 0.1, 'square', 0.4, 240); }
  wall() { this.noise(0.035, 0.12, 1500); }
  jackpot() {
    [0, 90, 180, 300].forEach((d, i) => setTimeout(() => this.tone(523 * (1 + i * 0.26), 0.18, 'triangle', 0.5), d));
  }
  launch() { this.tone(180, 0.22, 'sawtooth', 0.4, 420); }
  drain() { this.tone(220, 0.5, 'sine', 0.4, -150); }
  complete() {
    [0, 70, 140, 210, 320].forEach((d, i) => setTimeout(() => this.tone(392 * 2 ** (i / 6), 0.2, 'square', 0.4), d));
  }
  orbit() { this.tone(340, 0.14, 'sawtooth', 0.3, 500); }
  combo(n) { this.tone(440 * 1.25 ** Math.min(n, 6), 0.12, 'square', 0.45, 180); }
  lock() {
    this.tone(120, 0.3, 'square', 0.55, -40);
    setTimeout(() => this.tone(90, 0.35, 'sine', 0.5, -20), 120);
  }
  multiball() {
    [0, 100, 200, 300, 450, 600].forEach((d, i) =>
      setTimeout(() => this.tone(262 * 2 ** (i / 4), 0.22, i % 2 ? 'square' : 'sawtooth', 0.5), d));
  }
  modeStart() {
    [0, 130, 260].forEach((d, i) => setTimeout(() => this.tone(196 * (i + 2) / 2, 0.24, 'sawtooth', 0.5), d));
  }
  modeWin() {
    [0, 80, 160, 240, 320, 480].forEach((d, i) =>
      setTimeout(() => this.tone(523 * 2 ** (i / 5), 0.18, 'triangle', 0.5), d));
  }
  extraBall() {
    [0, 120, 240, 360].forEach((d, i) => setTimeout(() => this.tone(660 + i * 110, 0.16, 'triangle', 0.5), d));
  }
}

/* ---------------------------------------------------------------------- HUD */

function buildHud(root) {
  root.innerHTML = `
    <div class="pb-hud">
      <div class="pb-top">
        <div class="pb-score-wrap">
          <div class="pb-score" id="pb-score">0</div>
          <div class="pb-hi">REKORD <span id="pb-hi">0</span></div>
        </div>
        <div class="pb-meta">
          <div class="pb-mult" id="pb-mult">×1</div>
          <div class="pb-balls" id="pb-balls"></div>
          <div class="pb-substatus" id="pb-substatus"></div>
        </div>
      </div>
      <div class="pb-pokal" id="pb-pokal"></div>
      <div class="pb-grenar" id="pb-grenar"></div>
      <div class="pb-mode" id="pb-mode" hidden>
        <span class="pb-mode-name" id="pb-mode-name"></span>
        <span class="pb-mode-task" id="pb-mode-task"></span>
        <span class="pb-mode-time" id="pb-mode-time"></span>
      </div>
      <div class="pb-toast" id="pb-toast"></div>
    </div>

    <div class="pb-overlay" id="pb-overlay">
      <div class="pb-panel">
        <h2 id="pb-title">Pekkas Pokal Flipper</h2>
        <p id="pb-text">Tryck och håll för att spänna avfyraren. Vänster och höger sida av skärmen styr varsin flipper.</p>
        <div class="pb-scoreline" id="pb-scoreline" hidden></div>
        <button class="pb-btn" id="pb-start">Starta spelet</button>
      </div>
    </div>

    <div class="pb-controls" id="pb-controls" hidden>
      <button class="pb-nudge" id="pb-nudge" aria-label="Nudga bordet">NUDGA</button>
    </div>

    <div class="pb-plunger" id="pb-plunger" hidden>
      <div class="pb-plunger-label">Håll för kraft — släpp för att skjuta</div>
      <div class="pb-power"><i class="pb-skill"></i><span id="pb-power-fill"></span></div>
    </div>

    <button class="pb-mute" id="pb-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  return {
    score: root.querySelector('#pb-score'),
    hi: root.querySelector('#pb-hi'),
    mult: root.querySelector('#pb-mult'),
    balls: root.querySelector('#pb-balls'),
    pokal: root.querySelector('#pb-pokal'),
    grenar: root.querySelector('#pb-grenar'),
    mode: root.querySelector('#pb-mode'),
    modeName: root.querySelector('#pb-mode-name'),
    modeTask: root.querySelector('#pb-mode-task'),
    modeTime: root.querySelector('#pb-mode-time'),
    substatus: root.querySelector('#pb-substatus'),
    toast: root.querySelector('#pb-toast'),
    overlay: root.querySelector('#pb-overlay'),
    title: root.querySelector('#pb-title'),
    text: root.querySelector('#pb-text'),
    scoreline: root.querySelector('#pb-scoreline'),
    start: root.querySelector('#pb-start'),
    controls: root.querySelector('#pb-controls'),
    nudge: root.querySelector('#pb-nudge'),
    plunger: root.querySelector('#pb-plunger'),
    powerFill: root.querySelector('#pb-power-fill'),
    mute: root.querySelector('#pb-mute')
  };
}

/* -------------------------------------------------------------------- game */

export async function createPinball(container, opts = {}) {
  const participants = opts.participants || [];
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost);

  const sfx = new Sfx();

  /* ---- Renderer ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const maxDpr = window.innerWidth < 700 ? 2 : 1.8;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.Fog(0x05070f, 52, 96);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 220);

  /* ---- Environment reflections ---- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.06);
  scene.environment = envRT.texture;
  // RoomEnvironment is a bright studio; at full strength it washes the table out
  scene.environmentIntensity = 0.3;

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
  const lockMeshes = L.lockSlots.map((s) => {
    const m = refs.ball.clone();
    m.position.set(s.x, L.ballRadius + 0.04, -s.y);
    m.visible = false;
    tableGroup.add(m);
    return m;
  });

  // Bumper ring materials are cloned so each bumper can show its own
  // charged state on the way to lighting the lock.
  refs.bumpers.forEach((b) => {
    b.ring.material = b.ring.material.clone();
  });

  /* ---- Lights ---- */
  scene.add(new THREE.AmbientLight(0x9fb0ff, 0.16));

  const key = new THREE.DirectionalLight(0xfff3e0, 1.1);
  key.position.set(9, 30, -6);
  key.target.position.set(0, 0, -20);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 6;
  key.shadow.camera.far = 70;
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.bias = -0.0016;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x7c8cf8, 0.5);
  rim.position.set(-12, 12, -46);
  scene.add(rim);

  const warm = new THREE.PointLight(0xf2c14e, 0.8, 30, 2);
  warm.position.set(L.centerX, 9, -10);
  scene.add(warm);

  /* ---- Post-processing ---- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.6, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---- Physics ---- */
  const world = new World({ gravity: 27, damping: 0.2, maxSpeed: 64 });

  /**
   * Grenar — the mode ladder, named after the group's real competitions.
   * Complete P-O-K-A-L to light mode start at the LEFT ORBIT. Complete all
   * five and the left orbit starts FINALEN, the wizard mode.
   */
  const MODES = [
    { id: 'gokart', year: 2012, name: 'GOKART', hint: 'Kör 3 varv i orbit', goal: 3, time: 35 },
    { id: 'femkamp', year: 2013, name: 'FEMKAMP', hint: 'Träffa alla 5 olika skott', goal: 5, time: 60 },
    { id: 'pingis', year: 2019, name: 'PINGIS', hint: '12 bumperträffar', goal: 12, time: 35 },
    { id: 'skytte', year: 2022, name: 'SKYTTE', hint: 'Fäll P→O→K→A→L i ordning', goal: 5, time: 45 },
    { id: 'fiske', year: 2024, name: 'FISKE', hint: '3 napp på pokalen', goal: 3, time: 35 }
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
    lastToast: 0,

    // Locks & multiball
    bumperHits: [0, 0, 0],
    bumperLit: [false, false, false],
    lockLit: false,
    locked: 0,
    multiball: false,
    jackpotLit: false,
    mbSaveUntil: 0,

    // Grenar (modes)
    modeDone: new Set(),
    mode: null, // { def, progress, timeLeft, seen:Set, wizard }
    modeStartLit: false,
    finalenDone: 0,

    // Combos, bonus, extra balls
    combo: { n: 0, t: 0 },
    bonusX: 1,
    inlanes: { left: false, right: false },
    perBall: { bumps: 0, targets: 0, orbits: 0 },
    extraBalls: 0,
    extraBallGiven: false,
    superUntil: 0,
    sensorLast: {}
  };

  let high = 0;
  try {
    high = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
  } catch (e) {
    high = 0;
  }
  hud.hi.textContent = high.toLocaleString('sv-SE');

  /* ---- HUD helpers ---- */
  const fmt = (n) => n.toLocaleString('sv-SE');

  function renderBalls() {
    const left = BALLS_PER_GAME - state.ballNo + 1;
    hud.balls.innerHTML =
      Array.from({ length: BALLS_PER_GAME }, (_, i) =>
        `<span class="pb-ball-dot ${i < left ? 'on' : ''}"></span>`
      ).join('') +
      Array.from({ length: state.extraBalls }, () =>
        '<span class="pb-ball-dot on extra"></span>'
      ).join('');
  }

  function renderPokal() {
    hud.pokal.innerHTML = L.targets
      .map((t, i) => `<span class="pb-letter ${state.pokal[i] ? 'lit' : ''}">${t.letter}</span>`)
      .join('');
  }

  function renderGrenar() {
    const chips = MODES.map(
      (m) =>
        `<span class="pb-gren ${state.modeDone.has(m.id) ? 'won' : ''} ${
          state.mode && state.mode.def.id === m.id ? 'active' : ''
        }">'${String(m.year).slice(2)}</span>`
    );
    chips.push(
      `<span class="pb-gren crown ${state.finalenDone ? 'won' : ''} ${
        state.mode && state.mode.def.id === 'finalen' ? 'active' : ''
      }">👑</span>`
    );
    hud.grenar.innerHTML = chips.join('');
  }

  function updateStatus() {
    if (state.mode && state.mode.wizard) {
      hud.substatus.textContent = 'ALLT ×5';
    } else if (state.multiball) {
      hud.substatus.textContent = state.jackpotLit ? 'JACKPOT TÄND' : 'ORBIT LADDAR JACKPOT';
    } else {
      const locks = '●'.repeat(state.locked) + '○'.repeat(Math.max(0, 2 - state.locked));
      const bits = [`LÅS ${locks}`];
      if (state.bonusX > 1) bits.push(`BONUS ×${state.bonusX}`);
      if (state.modeStartLit) bits.push('GREN: V. ORBIT');
      hud.substatus.textContent = bits.join(' · ');
    }
  }

  function addScore(n) {
    const wiz = state.mode && state.mode.wizard ? 5 : 1;
    state.score += Math.round(n * state.mult * wiz);
    hud.score.textContent = fmt(state.score);
  }

  function toast(msg, big = false) {
    hud.toast.textContent = msg;
    hud.toast.className = `pb-toast show${big ? ' big' : ''}`;
    clearTimeout(state.lastToast);
    state.lastToast = setTimeout(() => {
      hud.toast.className = 'pb-toast';
    }, big ? 1800 : 1100);
  }

  /* ---- Effects ---- */
  const flashes = [];
  function flash(obj, light, strength = 3, base = 0) {
    if (light) {
      light.intensity = strength;
      flashes.push({ light, base, t: 0 });
    }
    if (obj) obj.scale.multiplyScalar(1.13);
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
      const pts = 1000 * 2 ** Math.min(state.combo.n - 1, 4);
      addScore(pts);
      sfx.combo(state.combo.n);
      toast(`KOMBO ×${state.combo.n} +${fmt(pts)}`, state.combo.n >= 3);
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
    if (
      (id === 'gokart' && (kind === 'leftOrbit' || kind === 'rightOrbit')) ||
      (id === 'pingis' && kind === 'bumper') ||
      (id === 'fiske' && kind === 'jackpot')
    ) {
      m.progress++;
    } else if (id === 'femkamp') {
      const bucket = kind === 'leftOrbit' || kind === 'rightOrbit' ? kind : kind;
      if (!m.seen.has(bucket)) {
        m.seen.add(bucket);
        m.progress = m.seen.size;
        toast(`FEMKAMP ${m.progress}/5`);
      }
    } else {
      return;
    }
    if (m.progress >= m.def.goal) completeMode();
  }

  const hooks = {
    onBumper(i, v) {
      if (v < 1) return;
      const b = refs.bumpers[i];
      addScore(b.isTrophy ? 400 : 120);
      state.perBall.bumps++;
      sfx.bumper();
      flash(b.trophy, b.light, b.isTrophy ? 6 : 4.2, b.base);

      // Charge the bumpers toward lighting the lock
      if (!state.multiball && state.locked < 2 && !(state.mode && state.mode.wizard)) {
        state.bumperHits[i]++;
        if (state.bumperHits[i] >= 4 && !state.bumperLit[i]) {
          state.bumperLit[i] = true;
          refs.bumpers[i].ring.material.emissiveIntensity = 2.6;
          toast('Bumper laddad!');
        }
        if (state.bumperLit.every(Boolean) && !state.lockLit) {
          state.lockLit = true;
          sfx.modeStart();
          toast('LÅS TÄNT — SKJUT POKALEN!', true);
          updateStatus();
        }
      }
      modeEvent('bumper');
    },
    onSling(side, v) {
      if (v < 1) return;
      addScore(60);
      sfx.sling();
      const mesh = side === 'left' ? refs.leftSling : refs.rightSling;
      if (mesh) {
        mesh.material.emissiveIntensity = 4;
        flashes.push({ mat: mesh.material, base: 1.4, t: 0 });
      }
    },
    onTarget(i, v) {
      if (v < 0.6) return;

      // SKYTTE mode: the bank must fall in exact P→O→K→A→L order
      if (state.mode && state.mode.def.id === 'skytte') {
        if (state.pokal[i]) return;
        if (i === state.mode.progress) {
          state.pokal[i] = true;
          colliderRefs.targets[i].enabled = false;
          refs.targets[i].down = true;
          state.mode.progress++;
          state.perBall.targets++;
          addScore(1200);
          sfx.target();
          renderPokal();
          if (state.mode.progress >= 5) completeMode();
          else toast(`${L.targets[i].letter} ✓ — nästa: ${L.targets[state.mode.progress].letter}`);
        } else {
          toast(`Fel ordning — sikta på ${L.targets[state.mode.progress].letter}`);
          sfx.wall();
        }
        return;
      }

      if (state.pokal[i]) return;
      state.pokal[i] = true;
      colliderRefs.targets[i].enabled = false;
      refs.targets[i].down = true;
      addScore(600);
      state.perBall.targets++;
      sfx.target();
      renderPokal();
      modeEvent('target');

      if (state.pokal.every(Boolean)) {
        state.banksDone++;
        state.mult = Math.min(6, state.mult + 1);
        hud.mult.textContent = `×${state.mult}`;
        addScore(6000);
        sfx.complete();
        if (!state.mode) {
          state.modeStartLit = true;
          const allDone = MODES.every((m) => state.modeDone.has(m.id));
          toast(allDone ? 'FINALEN TÄND — VÄNSTER ORBIT!' : `P-O-K-A-L — GREN TÄND I VÄNSTER ORBIT`, true);
        } else {
          toast(`P-O-K-A-L KOMPLETT — ×${state.mult}`, true);
        }
        updateStatus();
        setTimeout(() => {
          if (!(state.mode && state.mode.def.id === 'skytte')) resetBank();
        }, 1700);
      } else {
        toast(`${L.targets[i].letter} träffad`);
      }
    },
    onJackpot(v, b) {
      if (v < 1) return;
      flash(refs.jackpot.trophy, refs.jackpot.light, 5, 0.85);

      // Multiball jackpot
      if (state.multiball && state.jackpotLit) {
        state.jackpotLit = false;
        addScore(25000);
        sfx.jackpot();
        toast('JACKPOT +25 000!', true);
        updateStatus();
        return;
      }

      // A running mode owns the trophy: FISKE needs these hits, so the
      // lock waits until the mode is over.
      if (state.mode && !state.mode.wizard) {
        addScore(2500);
        sfx.jackpot();
        comboShot();
        modeEvent('jackpot');
        return;
      }

      // Lock a ball toward multiball
      if (state.lockLit && !state.multiball && b) {
        lockBall(b);
        return;
      }

      addScore(2500);
      sfx.jackpot();
      comboShot();
      modeEvent('jackpot');
    },
    onSensor(id, _v, _b) {
      const now = performance.now();
      if (now - (state.sensorLast[id] || 0) < 700) return;
      state.sensorLast[id] = now;
      if (state.phase !== 'play') return;

      if (id === 'inlaneLeft' || id === 'inlaneRight') {
        const side = id === 'inlaneLeft' ? 'left' : 'right';
        if (!state.inlanes[side]) {
          state.inlanes[side] = true;
          sfx.target();
          if (state.inlanes.left && state.inlanes.right) {
            state.inlanes.left = false;
            state.inlanes.right = false;
            state.bonusX = Math.min(6, state.bonusX + 1);
            toast(`BONUS ×${state.bonusX}`, state.bonusX >= 3);
            updateStatus();
          }
        }
        return;
      }

      // Orbits
      addScore(1500);
      state.perBall.orbits++;
      sfx.orbit();
      comboShot();
      modeEvent(id);

      if (state.multiball && !state.jackpotLit) {
        state.jackpotLit = true;
        toast('JACKPOT TÄND — SKJUT POKALEN!', true);
        updateStatus();
        return;
      }

      // Super skill shot: straight around into the left orbit off the plunge
      if (id === 'leftOrbit' && now < state.superUntil) {
        state.superUntil = 0;
        addScore(15000);
        sfx.modeWin();
        toast('SUPER SKILL SHOT +15 000!', true);
        return;
      }

      // Mode start
      if (id === 'leftOrbit' && state.modeStartLit && !state.mode && !state.multiball) {
        state.modeStartLit = false;
        startNextMode();
      }
    },
    onWall(v) {
      if (v > 9) sfx.wall();
    },
    onFlipper(side, v) {
      if (v > 3) sfx.flipper();
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
    sfx.modeStart();
    toast(`${next.name} ${next.year} — ${next.hint}!`, true);
    warm.color.set(0x7c8cf8);
    hud.mode.hidden = false;
    renderGrenar();
    updateStatus();
  }

  function completeMode() {
    const m = state.mode;
    if (!m) return;
    state.modeDone.add(m.def.id);
    addScore(15000);
    sfx.modeWin();
    toast(`${m.def.name} KLAR! +15 000`, true);
    endMode();

    if (state.modeDone.size >= 2 && !state.extraBallGiven) {
      state.extraBallGiven = true;
      state.extraBalls++;
      renderBalls();
      setTimeout(() => {
        sfx.extraBall();
        toast('EXTRA BOLL!', true);
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
      toast('FINALEN ÖVER — grenarna är nollställda!', true);
      endMode();
      if (state.balls.length > 1) state.mbSaveUntil = 0;
      return;
    }
    sfx.drain();
    toast(`Tiden ute — ${m.def.name} missad`, true);
    endMode();
  }

  function endMode() {
    const wasSkytte = state.mode && state.mode.def.id === 'skytte';
    state.mode = null;
    hud.mode.hidden = true;
    warm.color.set(0xf2c14e);
    if (wasSkytte) resetBank();
    renderGrenar();
    updateStatus();
  }

  function startFinalen() {
    state.mode = {
      def: { id: 'finalen', name: 'FINALEN', hint: 'Allt räknas ×5', goal: 0, time: 60 },
      progress: 0,
      timeLeft: 60,
      seen: new Set(),
      wizard: true
    };
    state.multiball = true;
    state.jackpotLit = true;
    state.mbSaveUntil = performance.now() + 60000;
    sfx.multiball();
    toast('FINALEN — ALLA BOLLAR, ALLT ×5!', true);
    warm.color.set(0xffe08a);
    warm.intensity = 1.6;
    bloom.strength = 0.8;
    hud.mode.hidden = false;
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
    updateStatus();

    if (state.locked >= 2) {
      toast('BOLL 2 LÅST…', true);
      setTimeout(startMultiball, 900);
    } else {
      toast(`BOLL LÅST ${state.locked}/2`, true);
      serveBall(700);
    }
  }

  function startMultiball() {
    state.multiball = true;
    state.jackpotLit = true;
    state.mbSaveUntil = performance.now() + 12000;
    sfx.multiball();
    startShake(1.4, 0);
    toast('MULTIBALL!', true);
    bloom.strength = 0.72;

    // Release the locked balls into play
    L.lockSlots.forEach((slot, i) => {
      lockMeshes[i].visible = false;
      const nb = new Ball(L.ballRadius);
      nb.place(slot.x, slot.y, 7 + i * 2, -5);
      nb.live = true;
      state.balls.push(nb);
    });
    state.locked = 0;
    updateStatus();
  }

  function endMultiball() {
    state.multiball = false;
    state.jackpotLit = false;
    bloom.strength = 0.5;
    warm.intensity = 0.8;
    toast('Multiball slut');
    updateStatus();
  }

  /**
   * Puts a fresh ball in the shooter lane and auto-plunges it shortly after —
   * used for lock replacements, multiball serves and Finalen.
   */
  function serveBall(delay = 600) {
    setTimeout(() => {
      if (state.phase !== 'play') return;
      const nb = new Ball(L.ballRadius);
      nb.place(L.laneBallX, L.laneBottomY + L.laneWallR + L.ballRadius + 0.06, 0, 0);
      nb.live = true;
      state.balls.push(nb);
      setTimeout(() => {
        if (nb.live && nb.x > L.laneX) nb.vy = 52 + Math.random() * 8;
      }, 500);
    }, delay);
  }

  /* ---- Ball lifecycle ---- */
  function placeInLane() {
    const nb = new Ball(L.ballRadius);
    nb.place(L.laneBallX, L.laneBottomY + L.laneWallR + L.ballRadius + 0.06, 0, 0);
    nb.live = true;
    state.balls = [nb];
    state.phase = 'launch';
    state.power = 0;
    state.charging = false;
    hud.plunger.hidden = false;
    hud.controls.hidden = true;
    hud.powerFill.style.width = '0%';
  }

  function launchBall() {
    // Looping the habitrail costs ~48 u/s of climb, so every launch clears it.
    // The meter is a timing skill shot instead of a power that can strand you.
    const p = clamp(state.power, 0, 1);
    const b = state.balls[0];
    if (!b) return;
    b.vy = 51 + p * 11;
    b.vx = 0;
    state.phase = 'play';
    state.ballSaveUntil = performance.now() + BALL_SAVE_MS;
    state.superUntil = performance.now() + 3000;
    hud.plunger.hidden = true;
    hud.controls.hidden = false;
    sfx.launch();

    if (p >= SKILL_ZONE[0] && p <= SKILL_ZONE[1]) {
      addScore(5000);
      sfx.complete();
      toast('SKILL SHOT +5000 — orbit för SUPER!', true);
    } else {
      toast('Bollen är i spel');
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

    if (state.balls.length >= 1) {
      // Multiball continues — respawn during the grace window
      if (performance.now() < state.mbSaveUntil) {
        toast('Boll räddad!');
        serveBall(400);
      } else if (state.balls.length === 1 && state.multiball && !(state.mode && state.mode.wizard)) {
        endMultiball();
      }
      return;
    }

    // Last ball gone
    if (performance.now() < state.ballSaveUntil) {
      sfx.launch();
      toast('BOLLRÄDDNING', true);
      placeInLane();
      state.power = 0.72;
      setTimeout(() => {
        if (state.phase === 'launch') launchBall();
      }, 550);
      return;
    }

    sfx.drain();
    state.phase = 'between';
    if (state.multiball) endMultiball();
    if (state.mode) {
      if (state.mode.wizard) failMode();
      else {
        toast(`${state.mode.def.name} avbruten`);
        endMode();
      }
    }

    // End-of-ball bonus
    const pb = state.perBall;
    const bonus = (pb.bumps * 50 + pb.targets * 300 + pb.orbits * 500) * state.bonusX;
    if (bonus > 0) {
      setTimeout(() => {
        state.score += bonus;
        hud.score.textContent = fmt(state.score);
        sfx.complete();
        toast(`BONUS +${fmt(bonus)}${state.bonusX > 1 ? ` (×${state.bonusX})` : ''}`, true);
      }, 700);
    }
    state.perBall = { bumps: 0, targets: 0, orbits: 0 };
    state.bonusX = 1;
    state.inlanes = { left: false, right: false };
    state.combo = { n: 0, t: 0 };

    if (state.extraBalls > 0) {
      state.extraBalls--;
      renderBalls();
      setTimeout(() => {
        sfx.extraBall();
        toast('EXTRA BOLL — samma boll igen!', true);
        if (state.phase === 'between') placeInLane();
      }, 1900);
      return;
    }

    if (state.ballNo >= BALLS_PER_GAME) {
      setTimeout(gameOver, 2100);
      return;
    }
    state.ballNo++;
    state.mult = 1;
    hud.mult.textContent = '×1';
    renderBalls();
    setTimeout(() => {
      toast(`Boll ${state.ballNo} av ${BALLS_PER_GAME}`, true);
      if (state.phase === 'between') placeInLane();
    }, 1900);
  }

  function gameOver() {
    state.phase = 'over';
    hud.controls.hidden = true;
    hud.plunger.hidden = true;
    const isHigh = state.score > high;
    if (isHigh) {
      high = state.score;
      try {
        localStorage.setItem(HIGHSCORE_KEY, String(high));
      } catch (e) {
        /* private mode */
      }
      hud.hi.textContent = fmt(high);
    }
    hud.title.textContent = isHigh ? 'Nytt rekord!' : 'Spelet slut';
    hud.text.textContent = isHigh
      ? 'Bäst hittills på den här enheten. Snyggt spelat.'
      : 'Bollarna är slut. En gång till?';
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng · rekord ${fmt(high)}</small>`;
    hud.start.textContent = 'Spela igen';
    hud.overlay.classList.add('show');
  }

  function startGame() {
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
    state.modeDone = new Set();
    state.mode = null;
    state.modeStartLit = false;
    state.finalenDone = 0;
    state.combo = { n: 0, t: 0 };
    state.bonusX = 1;
    state.inlanes = { left: false, right: false };
    state.perBall = { bumps: 0, targets: 0, orbits: 0 };
    state.extraBalls = 0;
    state.extraBallGiven = false;
    state.superUntil = 0;
    lockMeshes.forEach((m) => (m.visible = false));
    refs.bumpers.forEach((bm) => {
      bm.ring.material.emissiveIntensity = 0.95;
    });
    bloom.strength = 0.5;
    warm.color.set(0xf2c14e);
    warm.intensity = 0.8;
    hud.mode.hidden = true;
    hud.score.textContent = '0';
    hud.mult.textContent = '×1';
    hud.scoreline.hidden = true;
    hud.overlay.classList.remove('show');
    resetBank();
    renderBalls();
    renderGrenar();
    updateStatus();
    placeInLane();
  }

  /* ---- Input ---- */
  const pointers = new Map();
  const flipL = colliderRefs.flippers.left;
  const flipR = colliderRefs.flippers.right;

  function setFlipper(side, pressed) {
    if (state.tilted) return;
    const f = side === 'left' ? flipL : flipR;
    if (f.pressed !== pressed) {
      f.pressed = pressed;
      if (pressed) sfx.flipper();
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
    if (e.target.closest('.pb-overlay, .pb-mute, .pb-nudge')) return;
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

  function onKeyDown(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a' || k === 'z') setFlipper('left', true);
    else if (k === 'arrowright' || k === 'd' || k === 'm') setFlipper('right', true);
    else if (k === ' ') {
      e.preventDefault();
      sfx.resume();
      if (state.phase === 'launch') state.charging = true;
      else if (state.phase === 'idle' || state.phase === 'over') startGame();
    } else if (k === 'n') doNudge();
  }

  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a' || k === 'z') setFlipper('left', false);
    else if (k === 'arrowright' || k === 'd' || k === 'm') setFlipper('right', false);
    else if (k === ' ' && state.phase === 'launch' && state.charging) {
      state.charging = false;
      launchBall();
    }
  }

  /* ---- Shake: physical jolt of the 3D table plus a screen shake ---- */
  const shake = { t: 99, dur: 0, mag: 0, dirX: 0 };

  function startShake(mag, dirX) {
    shake.t = 0;
    shake.dur = 0.42;
    shake.mag = mag;
    shake.dirX = dirX;
    // CSS shake on the whole stage (canvas + HUD); restart if mid-animation
    container.classList.remove('pb-shake');
    void container.offsetWidth;
    container.classList.add('pb-shake');
    if (navigator.vibrate) navigator.vibrate(mag > 1 ? [40, 40, 60] : 25);
  }

  function updateShake(dt) {
    if (shake.t >= shake.dur) {
      tableGroup.position.set(0, 0, 0);
      tableGroup.rotation.z = 0;
      return;
    }
    shake.t += dt;
    const damp = Math.max(0, 1 - shake.t / shake.dur) ** 1.6;
    tableGroup.position.x =
      (Math.sin(shake.t * 56) * 0.24 + shake.dirX * 0.3) * damp * shake.mag;
    tableGroup.position.z = Math.sin(shake.t * 47 + 1.7) * 0.16 * damp * shake.mag;
    tableGroup.rotation.z = Math.sin(shake.t * 50) * 0.008 * damp * shake.mag;
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
      startShake(2.2, 0);
      toast('TILT — flipprarna är döda', true);
      sfx.drain();
      return;
    }
    const dir = Math.random() < 0.5 ? -1 : 1;
    world.nudgeX = dir * 35 + (Math.random() - 0.5) * 20;
    world.nudgeY = 34;
    state.balls.forEach((b) => {
      b.vx += dir * 2.5 + (Math.random() - 0.5) * 3;
      b.vy += 2.6;
    });
    setTimeout(() => {
      world.nudgeX = 0;
      world.nudgeY = 0;
    }, 90);
    startShake(1, dir);
    sfx.wall();
    toast('Nudge');
  }

  canvasHost.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  canvasHost.addEventListener('pointermove', onPointerMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  hud.start.addEventListener('click', startGame);
  hud.nudge.addEventListener('click', doNudge);
  hud.mute.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    hud.mute.classList.toggle('off', sfx.muted);
  });

  /* ---- Camera fit ---- */
  const target = new THREE.Vector3(0, 0, -19);
  const pitch = 67 * (Math.PI / 180);
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  const corners = [];
  for (const x of [-L.outerX - 0.35, L.outerX + 0.35]) {
    for (const z of [0.5, -41.5]) {
      corners.push(new THREE.Vector3(x, 0, z));
      corners.push(new THREE.Vector3(x, 2, z));
    }
  }

  function fitCamera() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    camera.aspect = w / h;
    // Wider lens on narrow screens so the table still fills the view
    camera.fov = camera.aspect < 0.62 ? 50 : 42;

    let dist = 52;
    for (let iter = 0; iter < 6; iter++) {
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      let maxRatio = 0;
      corners.forEach((c) => {
        const p = c.clone().project(camera);
        maxRatio = Math.max(maxRatio, Math.abs(p.x) / 0.995, Math.abs(p.y) / 0.995);
      });
      if (maxRatio < 1.001 && maxRatio > 0.985) break;
      dist *= maxRatio > 0 ? maxRatio : 1;
      dist = clamp(dist, 20, 160);
    }
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(Math.min(320, w / 2), Math.min(560, h / 2));
    fitCamera();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Loop ---- */
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const FIXED = 1 / 120;
  let running = true;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dtRaw = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!running) return;

    // Plunger charge
    if (state.phase === 'launch' && state.charging) {
      state.power = Math.min(1, state.power + dtRaw * 1.15);
      hud.powerFill.style.width = `${state.power * 100}%`;
    }

    acc += dtRaw;
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

          // A ball loitering in the shooter lane can never get out on its own
          if (b.x > L.laneX && b.y < L.domeY && b.speed < 4) {
            b.laneFor = (b.laneFor || 0) + FIXED;
            if (b.laneFor > 1.4) {
              b.vy = 52;
              b.vx = 0;
              b.laneFor = 0;
              sfx.launch();
            }
          } else {
            b.laneFor = 0;
          }

          // Rescue a ball wedged somewhere with no energy
          if (b.speed < 0.9) {
            b.stuckFor = (b.stuckFor || 0) + FIXED;
            if (b.stuckFor > 3.4) {
              b.vx += (Math.random() - 0.5) * 10;
              b.vy += 7;
              b.stuckFor = 0;
            }
          } else {
            b.stuckFor = 0;
          }
        }

        // Mode clock
        if (state.mode) {
          state.mode.timeLeft -= FIXED;
          if (state.mode.timeLeft <= 0) failMode();
        }
      }
    }

    // Mode HUD
    if (state.mode) {
      const m = state.mode;
      hud.modeName.textContent = m.def.name;
      hud.modeTask.textContent = m.wizard
        ? m.def.hint
        : `${m.progress}/${m.def.goal} — ${m.def.hint}`;
      const secs = Math.max(0, Math.ceil(m.timeLeft));
      hud.modeTime.textContent = `0:${String(secs).padStart(2, '0')}`;
      hud.modeTime.classList.toggle('urgent', secs <= 10);
    }

    // Ball transforms + rolling spin (mesh pool)
    for (let i = 0; i < ballMeshes.length; i++) {
      const mesh = ballMeshes[i];
      const b = state.balls[i];
      if (b && b.live) {
        mesh.visible = true;
        mesh.position.set(b.x, L.ballRadius + 0.04, -b.y);
        if (b.speed > 0.01) {
          const axis = new THREE.Vector3(-b.vy, 0, -b.vx).normalize();
          mesh.rotateOnWorldAxis(axis, (b.speed * dtRaw) / L.ballRadius);
        }
      } else {
        mesh.visible = false;
      }
    }

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
    refs.targets.forEach((t, i) => {
      const want = t.down ? -1.05 : 0;
      t.group.position.y += (want - t.group.position.y) * Math.min(1, dtRaw * 14);
      t.face.material.emissiveIntensity = t.down ? 0 : 0.9;
      t.face.material.color.set(state.pokal[i] ? 0x3a4265 : 0xf26d8d);
    });

    // Idle shimmer + flash decay
    const t = now / 1000;
    refs.jackpot.trophy.rotation.y = t * 0.9;
    refs.jackpot.halo.scale.setScalar(1 + Math.sin(t * 2.4) * 0.06);
    refs.bumpers.forEach((b) => {
      if (b.isTrophy) b.trophy.rotation.y = t * 1.1;
      b.group.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dtRaw * 9));
    });

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dtRaw;
      if (f.light) {
        f.light.intensity = Math.max(f.base || 0, f.light.intensity - dtRaw * 14);
        if (f.light.intensity <= (f.base || 0) + 0.01) flashes.splice(i, 1);
      } else if (f.mat) {
        f.mat.emissiveIntensity = Math.max(f.base, f.mat.emissiveIntensity - dtRaw * 16);
        if (f.mat.emissiveIntensity <= f.base + 0.01) flashes.splice(i, 1);
      }
    }

    // Gentle parallax toward the action
    const lead = state.balls[0];
    if (lead) {
      target.x += (lead.x * 0.1 - target.x) * Math.min(1, dtRaw * 2);
    }
    camera.lookAt(target);

    composer.render();
  }

  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
    if (document.hidden) {
      flipL.pressed = false;
      flipR.pressed = false;
      pointers.clear();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  renderBalls();
  renderPokal();
  renderGrenar();
  updateStatus();
  hud.overlay.classList.add('show');

  // Deterministic hooks for automated tests (and curious friends)
  window.__pbFlipper = {
    state,
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
    }
  };

  /* ---- Teardown ---- */
  function destroy() {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    canvasHost.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    clearTimeout(state.lastToast);
    container.classList.remove('pb-shake');
    delete window.__pbFlipper;

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
    pfTexture.dispose();
    envRT.texture.dispose();
    pmrem.dispose();
    composer.dispose?.();
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (sfx.ctx) sfx.ctx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createPinball;
