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
        </div>
      </div>
      <div class="pb-pokal" id="pb-pokal"></div>
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
  const { canvas: pfCanvas } = createPlayfieldCanvas(participants);
  const pfTexture = new THREE.CanvasTexture(pfCanvas);
  pfTexture.colorSpace = THREE.SRGBColorSpace;
  pfTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const materials = createMaterials(THREE, pfTexture);
  const { group: tableGroup, refs } = buildTable(THREE, mergeGeometries, materials);
  scene.add(tableGroup);

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
  const ball = new Ball(L.ballRadius);

  const state = {
    phase: 'idle', // idle | launch | play | between | over
    score: 0,
    ballNo: 1,
    mult: 1,
    pokal: [false, false, false, false, false],
    banksDone: 0,
    ballSaveUntil: 0,
    stuckFor: 0,
    laneFor: 0,
    nudges: [],
    tilted: false,
    power: 0,
    charging: false,
    lastToast: 0
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
    hud.balls.innerHTML = Array.from({ length: BALLS_PER_GAME }, (_, i) =>
      `<span class="pb-ball-dot ${i < BALLS_PER_GAME - state.ballNo + 1 ? 'on' : ''}"></span>`
    ).join('');
  }

  function renderPokal() {
    hud.pokal.innerHTML = L.targets
      .map((t, i) => `<span class="pb-letter ${state.pokal[i] ? 'lit' : ''}">${t.letter}</span>`)
      .join('');
  }

  function addScore(n) {
    state.score += Math.round(n * state.mult);
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
  function flash(obj, light, strength = 3) {
    if (light) {
      light.intensity = strength;
      flashes.push({ light, t: 0 });
    }
    if (obj) obj.scale.multiplyScalar(1.13);
  }

  /* ---- Gameplay hooks ---- */
  // Declared up front: the hooks below close over it, but they only fire once
  // buildColliders has returned.
  let colliderRefs = null;

  const hooks = {
    onBumper(i, v) {
      if (v < 1) return;
      addScore(120);
      sfx.bumper();
      const b = refs.bumpers[i];
      flash(b.trophy, b.light, 4.2);
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
      if (v < 0.6 || state.pokal[i]) return;
      state.pokal[i] = true;
      colliderRefs.targets[i].enabled = false;
      refs.targets[i].down = true;
      addScore(600);
      sfx.target();
      renderPokal();

      if (state.pokal.every(Boolean)) {
        state.banksDone++;
        state.mult = Math.min(6, state.mult + 1);
        hud.mult.textContent = `×${state.mult}`;
        addScore(6000);
        sfx.complete();
        toast(`P-O-K-A-L KOMPLETT — ×${state.mult}`, true);
        setTimeout(resetBank, 1700);
      } else {
        toast(`${L.targets[i].letter} träffad`);
      }
    },
    onJackpot(v) {
      if (v < 1) return;
      const lit = state.banksDone > 0;
      addScore(lit ? 25000 : 2500);
      sfx.jackpot();
      flash(refs.jackpot.trophy, refs.jackpot.light, 6);
      toast(lit ? 'JACKPOT!' : 'Pokalen träffad', lit);
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

  /* ---- Ball lifecycle ---- */
  function placeInLane() {
    ball.place(L.laneBallX, L.laneBottomY + L.laneWallR + L.ballRadius + 0.06, 0, 0);
    ball.live = true;
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
    ball.vy = 51 + p * 11;
    ball.vx = 0;
    state.phase = 'play';
    state.ballSaveUntil = performance.now() + BALL_SAVE_MS;
    hud.plunger.hidden = true;
    hud.controls.hidden = false;
    sfx.launch();

    if (p >= SKILL_ZONE[0] && p <= SKILL_ZONE[1]) {
      addScore(5000);
      sfx.complete();
      toast('SKILL SHOT +5000', true);
    } else {
      toast('Bollen är i spel');
    }
  }

  function drainBall() {
    if (state.phase !== 'play') return;

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
    ball.live = false;
    state.phase = 'between';

    if (state.ballNo >= BALLS_PER_GAME) {
      setTimeout(gameOver, 900);
      return;
    }
    state.ballNo++;
    state.mult = 1;
    hud.mult.textContent = '×1';
    renderBalls();
    toast(`Boll ${state.ballNo} av ${BALLS_PER_GAME}`, true);
    setTimeout(() => {
      if (state.phase === 'between') placeInLane();
    }, 1100);
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
    hud.score.textContent = '0';
    hud.mult.textContent = '×1';
    hud.scoreline.hidden = true;
    hud.overlay.classList.remove('show');
    resetBank();
    renderBalls();
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

  function doNudge() {
    if (state.phase !== 'play' || state.tilted) return;
    const now = performance.now();
    state.nudges = state.nudges.filter((t) => now - t < 3200);
    state.nudges.push(now);

    if (state.nudges.length > 3) {
      state.tilted = true;
      flipL.pressed = false;
      flipR.pressed = false;
      toast('TILT — flipprarna är döda', true);
      sfx.drain();
      return;
    }
    world.nudgeX = (Math.random() - 0.5) * 70;
    world.nudgeY = 34;
    ball.vx += (Math.random() - 0.5) * 5;
    ball.vy += 2.6;
    setTimeout(() => {
      world.nudgeX = 0;
      world.nudgeY = 0;
    }, 90);
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
      world.step(ball, FIXED);
      acc -= FIXED;

      if (state.phase === 'play' && ball.live) {
        if (ball.y < -1.2 || ball.y > 48 || Math.abs(ball.x) > 13) drainBall();

        // A ball loitering in the shooter lane can never get out on its own
        if (ball.x > L.laneX && ball.y < L.domeY && ball.speed < 4) {
          state.laneFor += FIXED;
          if (state.laneFor > 1.4) {
            ball.vy = 52;
            ball.vx = 0;
            state.laneFor = 0;
            sfx.launch();
          }
        } else {
          state.laneFor = 0;
        }

        // Rescue a ball wedged somewhere with no energy
        if (ball.speed < 0.9) {
          state.stuckFor += FIXED;
          if (state.stuckFor > 3.4) {
            ball.vx += (Math.random() - 0.5) * 10;
            ball.vy += 7;
            state.stuckFor = 0;
          }
        } else {
          state.stuckFor = 0;
        }
      }
    }

    // Ball transform + rolling spin
    refs.ball.position.set(ball.x, L.ballRadius + 0.04, -ball.y);
    if (ball.speed > 0.01) {
      const axis = new THREE.Vector3(-ball.vy, 0, -ball.vx).normalize();
      refs.ball.rotateOnWorldAxis(axis, (ball.speed * dtRaw) / L.ballRadius);
    }
    refs.ball.visible = ball.live;

    // Flippers
    refs.flippers.left.rotation.y = -flipL.angle;
    refs.flippers.right.rotation.y = -flipR.angle;

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
    refs.bumpers.forEach((b, i) => {
      b.trophy.rotation.y = t * 1.4 + i;
      b.group.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dtRaw * 9));
    });

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dtRaw;
      if (f.light) {
        f.light.intensity = Math.max(0, f.light.intensity - dtRaw * 14);
        if (f.light.intensity <= 0.01) flashes.splice(i, 1);
      } else if (f.mat) {
        f.mat.emissiveIntensity = Math.max(f.base, f.mat.emissiveIntensity - dtRaw * 16);
        if (f.mat.emissiveIntensity <= f.base + 0.01) flashes.splice(i, 1);
      }
    }

    // Gentle parallax toward the action
    target.x += (ball.x * 0.1 - target.x) * Math.min(1, dtRaw * 2);
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
  hud.overlay.classList.add('show');

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
