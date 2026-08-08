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
 *              tunna for double.
 *
 * Everything is procedural — geometry, caustics, sound. The only thing
 * downloaded is Three.js itself, and only when the game is opened.
 */

import * as THREE from 'three';
import { Sfx } from './audio.js';
import { SPECIES, JUNK, fishAssets, spawnFish, spawnJunk, swim, disposeAssets } from './species.js';
import {
  BOTTOM, causticTexture, sparkTexture, buildSky, buildShore, buildWater, buildBoat,
  buildSeabed, buildShafts, buildSnow, buildBurst, emitBurst, updateBurst, buildLure, buildLine
} from './world.js';

const CASTS_PER_GAME = 3;
const HIGHSCORE_KEY = 'pp-fiske-highscore';

/** Water colour by depth — five stops instead of a straight fade. */
const WATER_STOPS = [
  [0, 0x3ec2c4], [8, 0x1f8f96], [18, 0x136d82],
  [30, 0x0b4667], [44, 0x062a48], [60, 0x02101f]
];

const ZONES = [
  { at: 0, name: 'YTVATTNET' },
  { at: 12, name: 'SIKDJUPET' },
  { at: 24, name: 'GÄDDGRAVEN' },
  { at: 38, name: 'LAXDJUPET' },
  { at: 50, name: 'PEKKADJUPET' }
];

function gradient(stops, d, out) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [d0, c0] = stops[i];
    const [d1, c1] = stops[i + 1];
    if (d <= d1 || i === stops.length - 2) {
      const k = Math.min(1, Math.max(0, (d - d0) / (d1 - d0)));
      return out.set(c0).lerp(new THREE.Color(c1), k);
    }
  }
  return out.set(stops[0][1]);
}

/* ------------------------------------------------------------------- HUD */

function buildHud(root) {
  root.innerHTML = `
    <div class="fg-vignette"></div>
    <div class="pb-hud">
      <div class="pb-top">
        <div class="pb-score-wrap">
          <div class="pb-score" id="fg-score">0</div>
          <div class="pb-hi">REKORD <span id="fg-hi">0</span></div>
        </div>
        <div class="pb-meta">
          <div class="fg-depth" id="fg-depth">0 m</div>
          <div class="fg-cast" id="fg-cast"></div>
        </div>
      </div>
      <div class="fg-mult" id="fg-mult"></div>
      <div class="fg-zone" id="fg-zone"></div>
      <div class="fg-phase" id="fg-phase"></div>
      <div class="pb-toast" id="fg-toast"></div>
      <div class="fg-pops" id="fg-pops"></div>
    </div>

    <div class="pb-overlay" id="fg-overlay">
      <div class="pb-panel">
        <h2 id="fg-title">Pekkas Fiske</h2>
        <p id="fg-text">Tre kast. Dra med fingret för att styra draget.</p>
        <ul class="fg-steps" id="fg-steps">
          <li><i style="--c:#7fd8e8"></i><b>Ner</b> Väj för fisken — varje fisk du slipper förbi höjer multiplikatorn.</li>
          <li><i style="--c:#f2c14e"></i><b>Upp</b> Nu gäller tvärtom: fånga allt på vägen upp.</li>
          <li><i style="--c:#5eead4"></i><b>I luften</b> Tryck på fångsten så åker den i tunnan — dubbla poäng.</li>
        </ul>
        <div class="pb-scoreline" id="fg-scoreline" hidden></div>
        <div class="fg-catchlist" id="fg-catchlist" hidden></div>
        <button class="pb-btn" id="fg-start">Kasta i!</button>
      </div>
    </div>

    <button class="pb-mute" id="fg-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  return {
    score: q('#fg-score'), hi: q('#fg-hi'), depth: q('#fg-depth'), cast: q('#fg-cast'),
    mult: q('#fg-mult'), zone: q('#fg-zone'), phase: q('#fg-phase'), toast: q('#fg-toast'),
    pops: q('#fg-pops'), overlay: q('#fg-overlay'), title: q('#fg-title'), text: q('#fg-text'),
    steps: q('#fg-steps'), scoreline: q('#fg-scoreline'), catchlist: q('#fg-catchlist'),
    start: q('#fg-start'), mute: q('#fg-mute')
  };
}

/* ------------------------------------------------------------------- game */

export async function createFishing(container) {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui fg-ui';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost);

  const sfx = new Sfx();

  /* ---- Renderer: ACES filmic tone mapping does the heavy lifting on the
     look. No post-processing — a phone keeps its frame rate instead. ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1f8f96, 0.02);
  scene.background = new THREE.Color(0x1f8f96);

  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 900);
  camera.position.set(0, 3.4, 15);

  const hemi = new THREE.HemisphereLight(0xfff0d2, 0x0a2434, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b6, 1.7);
  sun.position.set(-30, 40, -20);
  scene.add(sun);

  /* ---- World ---- */
  const caustics = causticTexture();
  const spark = sparkTexture();

  const sky = buildSky();
  scene.add(sky.dome);
  const shore = buildShore();
  scene.add(shore);

  const water = buildWater(caustics);
  scene.add(water.mesh);

  const boat = buildBoat();
  boat.position.set(0.4, -0.08, 0);
  scene.add(boat);
  scene.add(boat.userData.foam);

  const shafts = buildShafts();
  scene.add(shafts);

  const seabed = buildSeabed();
  scene.add(seabed);

  const snow = buildSnow(spark);
  scene.add(snow);
  const burst = buildBurst(spark);
  scene.add(burst);

  const lure = buildLure();
  scene.add(lure);
  const line = buildLine();
  scene.add(line);

  const assets = fishAssets();
  const speciesByIndex = assets.species;

  /* ---- Shoal ---------------------------------------------------------- */

  const fishes = [];

  function clearFish() {
    fishes.forEach((f) => scene.remove(f.mesh));
    fishes.length = 0;
  }

  function addFish(asset, depth, deco) {
    const mesh = spawnFish(asset);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const z = deco
      ? (Math.random() < 0.5 ? -1 : 1) * (3.5 + Math.random() * 6)
      : (Math.random() - 0.5) * 1.4;
    mesh.position.set(-16 + Math.random() * 32, -depth, z);
    mesh.rotation.y = dir > 0 ? 0 : Math.PI;
    if (deco) mesh.scale.multiplyScalar(0.8 + Math.random() * 0.5);
    scene.add(mesh);
    fishes.push({
      sp: asset.sp,
      mesh,
      dir,
      deco: !!deco,
      speed: asset.sp.speed * (0.8 + Math.random() * 0.5),
      phase: Math.random() * Math.PI * 2,
      bob: 0.2 + Math.random() * 0.5,
      caught: false,
      dodged: false,
      junk: false,
      air: null
    });
  }

  function addJunk(asset) {
    const mesh = spawnJunk(asset);
    const depth = asset.junk.min + Math.random() * (asset.junk.max - asset.junk.min);
    mesh.position.set(-15 + Math.random() * 30, -depth, (Math.random() - 0.5) * 1.2);
    scene.add(mesh);
    fishes.push({
      sp: { name: asset.junk.name, pts: 0, size: asset.junk.size, speed: 0.4 },
      mesh,
      dir: Math.random() < 0.5 ? 1 : -1,
      deco: false,
      speed: 0.5,
      phase: Math.random() * Math.PI * 2,
      bob: 0.3,
      caught: false,
      dodged: false,
      junk: true,
      air: null
    });
  }

  function spawnFishSet() {
    clearFish();
    speciesByIndex.forEach((asset) => {
      const { sp } = asset;
      if (sp.rare) {
        if (Math.random() < 0.4) return; // she is not always home
        addFish(asset, sp.min + Math.random() * (sp.max - sp.min), false);
        return;
      }
      const n = 7;
      for (let i = 0; i < n; i++) {
        addFish(asset, sp.min + Math.random() * (sp.max - sp.min), false);
      }
      for (let i = 0; i < 3; i++) {
        addFish(asset, sp.min + Math.random() * (sp.max - sp.min), true);
      }
    });
    assets.junk.forEach((asset) => {
      addJunk(asset);
      if (Math.random() < 0.6) addJunk(asset);
    });
  }

  /* ---- State ---------------------------------------------------------- */

  const state = {
    phase: 'idle', // idle | drop | reel | toss | between | over
    score: 0,
    castNo: 1,
    depth: 0,
    lureX: 0,
    targetX: 0,
    dropSpeed: 6.5,
    caught: [],
    combo: 0,
    dodges: 0,
    mult: 1,
    tapChain: 0,
    tossLeft: 0,
    zone: -1,
    deepest: 0,
    lastToast: 0,
    timers: []
  };

  let high = 0;
  try {
    high = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
  } catch (e) {
    high = 0;
  }
  const fmt = (n) => Math.round(n).toLocaleString('sv-SE');
  hud.hi.textContent = fmt(high);

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    state.timers.push(id);
    return id;
  };

  /* ---- Juice ---------------------------------------------------------- */

  const shake = { power: 0 };
  let hitStop = 0;
  let fovPunch = 0;

  function kick(power, stopMs = 0, fov = 0) {
    shake.power = Math.max(shake.power, power);
    hitStop = Math.max(hitStop, stopMs / 1000);
    fovPunch = Math.max(fovPunch, fov);
    if (navigator.vibrate) navigator.vibrate(Math.min(40, power * 26));
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
    later(() => el.remove(), 1100);
  }

  function toast(msg, big = false) {
    hud.toast.textContent = msg;
    hud.toast.className = `pb-toast show${big ? ' big' : ''}`;
    clearTimeout(state.lastToast);
    state.lastToast = setTimeout(() => {
      hud.toast.className = 'pb-toast';
    }, big ? 1700 : 1000);
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
  }

  function addScore(n, world, label) {
    state.score += n;
    hud.score.textContent = fmt(state.score);
    hud.score.classList.remove('bump');
    void hud.score.offsetWidth;
    hud.score.classList.add('bump');
    if (world) popScore(label || `+${fmt(n)}`, world);
  }

  function renderCast() {
    hud.cast.textContent = `KAST ${Math.min(state.castNo, CASTS_PER_GAME)}/${CASTS_PER_GAME}`;
  }

  /* ---- Phases --------------------------------------------------------- */

  function startCast() {
    state.phase = 'drop';
    state.depth = 0;
    state.dropSpeed = 6.5;
    state.lureX = 0;
    state.targetX = 0;
    state.caught = [];
    state.combo = 0;
    state.dodges = 0;
    state.mult = 1;
    state.tapChain = 0;
    state.zone = -1;
    spawnFishSet();
    sfx.splash(1.1);
    emitBurst(burst, 1.9, 0.2, 0, 26, 5, 0.7);
    setPhaseLabel('VÄJ FÖR FISKEN — djupare ner simmar det finare');
    later(() => setPhaseLabel(''), 2600);
    renderCast();
    renderMult();
  }

  function onDodge(f) {
    f.dodged = true;
    state.dodges++;
    state.mult = Math.min(10, 1 + state.dodges * 0.5);
    sfx.dodge(state.dodges);
    renderMult();
    if (state.dodges % 4 === 0) popScore(`×${state.mult.toFixed(1)}`, f.mesh.position, 'mult');
  }

  function hookAt(fish, reason) {
    state.phase = 'reel';
    sfx.hook();
    kick(1.1, 70, 5);
    emitBurst(burst, state.lureX, -state.depth, 0, 22, 4.5, 0.5);
    if (fish) catchOne(fish, true);
    if (reason === 'bottom') {
      const bonus = 1500 * state.mult;
      addScore(bonus, lure.position, `BOTTEN +${fmt(bonus)}`);
      state.mult = Math.min(12, state.mult + 2);
      toast('Bottenkänning! Full multiplikator.', true);
      sfx.legend();
    } else if (reason === 'junk') {
      toast(`${fish ? fish.sp.name : 'Skräp'} … inga poäng.`);
      state.mult = 1;
    }
    renderMult();
    setPhaseLabel('VEVA! Nu gäller det att träffa allt');
    later(() => setPhaseLabel(''), 2200);
  }

  function catchOne(f, first) {
    f.caught = true;
    state.combo++;
    state.caught.push(f);
    const pts = Math.round(f.sp.pts * state.mult);
    if (!first) state.mult = Math.min(12, state.mult + 0.25);
    addScore(pts, f.mesh.position, `${f.sp.name} +${fmt(pts)}`);
    sfx.catchFish(state.combo);
    emitBurst(burst, f.mesh.position.x, f.mesh.position.y, f.mesh.position.z, 14, 3.4, 0.6);
    renderMult();
    if (f.sp.rare) {
      sfx.legend();
      toast('PEKKAGÄDDAN ÄR KROKAD!!', true);
      kick(2.6, 120, 9);
      emitBurst(burst, f.mesh.position.x, f.mesh.position.y, f.mesh.position.z, 60, 7, 1.2);
    } else {
      kick(0.5, 0, 0);
    }
  }

  function startToss() {
    state.phase = 'toss';
    hud.zone.classList.remove('show');
    state.tapChain = 0;
    sfx.toss();
    sfx.splash(0.8);
    emitBurst(burst, state.lureX, 0.2, 0, 34, 6, 0.9);
    kick(0.9, 0, 4);
    const n = state.caught.length;
    state.tossLeft = n;
    if (n === 0) {
      setPhaseLabel('Tomt nät den här gången');
      later(endCast, 1100);
      return;
    }
    setPhaseLabel('TRYCK PÅ FISKEN — i tunnan för dubbelt');
    // Cut straight to the above-water framing: watching this from under the
    // surface was the single worst thing about the phase.
    camera.position.set(boat.position.x, 3.6, 15.5);
    lookAt.set(boat.position.x, 2.7, 0.4);
    camera.lookAt(lookAt);
    state.caught.forEach((f, i) => {
      const spread = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      f.air = {
        x: boat.position.x + spread * 1.3,
        y: 0.6,
        z: 1.4,
        vx: spread * 2.3 + (Math.random() - 0.5) * 0.9,
        vy: 11 + Math.random() * 3.2,
        spin: (Math.random() - 0.5) * 8,
        done: false
      };
      f.mesh.visible = true;
      // Bigger in the air than in the water — they have to be thumb-sized
      f.mesh.scale.setScalar(f.sp.size * 1.35);
    });
  }

  function endCast() {
    setPhaseLabel('');
    hud.mult.classList.remove('show');
    if (state.castNo >= CASTS_PER_GAME) {
      gameOver();
      return;
    }
    state.castNo++;
    state.phase = 'between';
    renderCast();
    toast(`Kast ${state.castNo} av ${CASTS_PER_GAME}`, true);
    later(() => {
      if (state.phase === 'between') startCast();
    }, 1500);
  }

  function gameOver() {
    state.phase = 'over';
    const isHigh = state.score > high;
    if (isHigh) {
      high = state.score;
      try {
        localStorage.setItem(HIGHSCORE_KEY, String(Math.round(high)));
      } catch (e) {
        /* private mode */
      }
      hud.hi.textContent = fmt(high);
    }
    sfx.fanfare();
    hud.title.textContent = isHigh ? 'Nytt rekord!' : 'Fisket är slut';
    hud.text.textContent = isHigh
      ? 'Största fångsten hittills på den här enheten. Petri heder!'
      : 'Sen är det kaffe och rökt sik vid bryggan. En tur till?';
    hud.steps.hidden = true;
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng · rekord ${fmt(high)}</small>`;
    hud.catchlist.hidden = false;
    hud.catchlist.innerHTML = `<b>Djupaste kast</b><span>${Math.round(state.deepest)} m</span>`;
    hud.start.textContent = 'Fiska igen';
    hud.overlay.classList.add('show');
  }

  function startGame() {
    sfx.resume();
    state.score = 0;
    state.castNo = 1;
    state.deepest = 0;
    hud.score.textContent = '0';
    hud.scoreline.hidden = true;
    hud.catchlist.hidden = true;
    hud.steps.hidden = false;
    hud.overlay.classList.remove('show');
    startCast();
  }

  /* ---- Input ---------------------------------------------------------- */

  let dragging = false;
  const REACH = 9;

  function pointerToNdc(e) {
    const rect = canvasHost.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    };
  }

  function onPointerDown(e) {
    sfx.resume();
    if (e.target.closest('.pb-overlay, .pb-mute')) return;
    if (state.phase === 'toss') {
      tryTapFish(e);
      return;
    }
    dragging = true;
    state.targetX = pointerToNdc(e).x * REACH;
  }

  function onPointerMove(e) {
    if (!dragging) return;
    state.targetX = pointerToNdc(e).x * REACH;
  }

  function onPointerUp() {
    dragging = false;
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') state.targetX = Math.max(-REACH, state.targetX - 2.4);
    else if (k === 'arrowright' || k === 'd') state.targetX = Math.min(REACH, state.targetX + 2.4);
    else if (k === ' ' && (state.phase === 'idle' || state.phase === 'over' || state.phase === 'between')) {
      e.preventDefault();
      startGame();
    }
  }

  const ndc = new THREE.Vector3();

  function tryTapFish(e) {
    const p = pointerToNdc(e);
    let bestF = null;
    let bestD = 0.17; // a generous thumb in NDC
    state.caught.forEach((f) => {
      if (!f.air || f.air.done) return;
      ndc.copy(f.mesh.position).project(camera);
      const d = Math.hypot(ndc.x - p.x, ndc.y - p.y);
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
    state.tossLeft--;
    addScore(pts, bestF.mesh.position, `+${fmt(pts)}`);
    sfx.tap(state.tapChain);
    emitBurst(burst, bestF.mesh.position.x, bestF.mesh.position.y, bestF.mesh.position.z, 16, 4, 0.5);
    kick(0.5, 0, 2);
    // Arc it into the tunna
    const target = boat.position.x + 1.75;
    bestF.air.vx = (target - bestF.mesh.position.x) * 2.2;
    bestF.air.vy = 7.5;
    if (state.tossLeft <= 0) finishToss();
  }

  function finishToss() {
    const all = state.caught.length > 0 && state.caught.every((f) => f.air && f.air.done === 'hit');
    if (all && state.caught.length > 1) {
      const bonus = Math.round(2000 * state.mult);
      toast(`PERFEKT KAST! +${fmt(bonus)}`, true);
      addScore(bonus);
      sfx.legend();
      kick(1.6, 90, 6);
    }
    later(endCast, 750);
  }

  canvasHost.addEventListener('pointerdown', onPointerDown);
  canvasHost.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  hud.start.addEventListener('click', startGame);
  hud.mute.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    hud.mute.classList.toggle('off', sfx.muted);
  });

  /* ---- Sizing --------------------------------------------------------- */

  let baseFov = 56;

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseFov = camera.aspect < 0.7 ? 64 : 56;
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Loop ----------------------------------------------------------- */

  let raf = 0;
  let last = performance.now();
  let running = true;
  const camGoal = new THREE.Vector3();
  const lookGoal = new THREE.Vector3();
  const lookAt = new THREE.Vector3(0, 1.5, 0);
  const tmpColor = new THREE.Color();
  const rodTip = new THREE.Vector3();
  const snowBox = snow.userData.box;

  function updateFish(dt, t) {
    const focusY = -state.depth;
    fishes.forEach((f) => {
      if (f.caught) return;
      const m = f.mesh;
      if (Math.abs(m.position.y - focusY) > 26) return; // out of sight, skip
      m.position.x += f.dir * f.speed * dt;
      m.position.y += Math.sin(t * 1.6 + f.phase) * f.bob * dt;
      if (f.junk) {
        m.rotation.z = Math.sin(t * 0.7 + f.phase) * 0.25;
        m.rotation.y += dt * 0.3;
      } else {
        swim(m, t + f.phase, f.speed, f.deco ? 0.7 : 1);
      }
      if (f.dir > 0 && m.position.x > 18) m.position.x = -18;
      else if (f.dir < 0 && m.position.x < -18) m.position.x = 18;
    });
  }

  function collide(reeling) {
    const y = -state.depth;
    for (const f of fishes) {
      if (f.caught || f.deco) continue;
      const m = f.mesh;
      const { size } = f.sp;
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
          hookAt(null, 'junk');
          return;
        } else {
          hookAt(f, 'fish');
          return;
        }
      } else if (!reeling && !f.dodged && !f.junk && dy > ry + 0.1 && dy < 3.2 && Math.abs(dx) < 3.4) {
        onDodge(f); // slipped past above us
      }
    }
  }

  function updateLine(dt) {
    const { nodes, segments } = line.userData;
    boat.userData.rod.getWorldPosition(rodTip);
    rodTip.x += 2.6;
    rodTip.y += 1.1;
    nodes[0].copy(rodTip);
    nodes[segments].set(state.lureX, -state.depth + 0.22, 0);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < segments; i++) {
        const prev = nodes[i - 1];
        const next = nodes[i + 1];
        const n = nodes[i];
        n.x += ((prev.x + next.x) * 0.5 - n.x) * Math.min(1, dt * 26);
        n.y += ((prev.y + next.y) * 0.5 - n.y) * Math.min(1, dt * 26);
        n.z += ((prev.z + next.z) * 0.5 - n.z) * Math.min(1, dt * 26);
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
    hud.zone.textContent = ZONES[z].name;
    hud.zone.classList.remove('show');
    void hud.zone.offsetWidth;
    hud.zone.classList.add('show');
    if (z > 0) sfx.zone();
    later(() => hud.zone.classList.remove('show'), 1800);
  }

  function updateCamera(dt) {
    const under = state.depth > 0.6;
    if (state.phase === 'idle' || state.phase === 'over') {
      camGoal.set(-3.2, 3.0, 13.5);
      lookGoal.set(0.6, 1.5, 0);
    } else if (state.phase === 'toss') {
      camGoal.set(boat.position.x, 3.6, 15.5);
      lookGoal.set(boat.position.x, 2.7, 0.4);
    } else if (under) {
      const lead = (state.targetX - state.lureX) * 0.25;
      camGoal.set(state.lureX * 0.55 + lead, -state.depth + 2.6, 11.5);
      lookGoal.set(state.lureX * 0.75, -state.depth + 0.2, 0);
    } else {
      camGoal.set(state.lureX * 0.4, 2.8, 13);
      lookGoal.set(state.lureX * 0.5, 0.6, 0);
    }
    const s = Math.min(1, dt * 3.2);
    camera.position.lerp(camGoal, s);
    lookAt.lerp(lookGoal, Math.min(1, dt * 4.5));

    if (shake.power > 0.001) {
      shake.power = Math.max(0, shake.power - dt * 4.2);
      const a = shake.power * 0.22;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
    }
    camera.lookAt(lookAt);

    if (fovPunch > 0.01) {
      fovPunch = Math.max(0, fovPunch - dt * 26);
      camera.fov = baseFov + fovPunch;
      camera.updateProjectionMatrix();
    } else if (Math.abs(camera.fov - baseFov) > 0.01) {
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
    }
  }

  function updateAtmosphere(dt) {
    const d = Math.max(0, state.depth);
    const k = Math.min(1, d / 52);
    gradient(WATER_STOPS, d, tmpColor);
    const above = state.depth < 0.4 && (state.phase === 'idle' || state.phase === 'over' || state.phase === 'toss');
    scene.background.lerp(above ? tmpColor.set(0x8fb9cf) : tmpColor, Math.min(1, dt * 6));
    scene.fog.color.copy(scene.background);
    scene.fog.density = above ? 0.0009 : 0.013 + k * 0.035;

    // The sky must never bleed through from below the waterline — the dome
    // is hard-gated on the camera, not just faded.
    const eyeAbove = camera.position.y > -0.6;
    sky.uniforms.uOpacity.value +=
      ((eyeAbove ? 1 : 0) - sky.uniforms.uOpacity.value) * Math.min(1, dt * 10);
    sky.dome.visible = eyeAbove && sky.uniforms.uOpacity.value > 0.02;
    shore.visible = sky.dome.visible;

    water.uniforms.uFogColor.value.copy(scene.fog.color);
    water.uniforms.uFogDensity.value = scene.fog.density;
    water.uniforms.uDeepTint.value.copy(scene.background);
    water.uniforms.uCausticStrength.value = 1 - k * 0.55;

    hemi.intensity = 1.15 - k * 0.78;
    sun.intensity = 1.7 - k * 1.45;
    lure.userData.glow.intensity = 0.7 + k * 2.4;

    shafts.material.opacity = Math.max(0, 0.55 - k * 1.5);
    shafts.visible = shafts.material.opacity > 0.01;

    // Marine snow belongs in the water, not in the sky over the boat
    snow.visible = camera.position.y < -1.2;
    snow.material.opacity = 0.22 + k * 0.5;
  }

  function updateSnow() {
    const arr = snow.geometry.attributes.position.array;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const half = snowBox / 2;
    for (let i = 0; i < snow.userData.count; i++) {
      let x = arr[i * 3] - cx;
      let y = arr[i * 3 + 1] - cy;
      if (x > half) x -= snowBox; else if (x < -half) x += snowBox;
      if (y > half) y -= snowBox; else if (y < -half) y += snowBox;
      arr[i * 3] = cx + x;
      arr[i * 3 + 1] = cy + y;
    }
    snow.geometry.attributes.position.needsUpdate = true;
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!running) return;
    const t = now / 1000;

    if (hitStop > 0) {
      hitStop -= dt;
      dt *= 0.12;
    }
    if (state.phase === 'toss') dt *= 0.8; // a touch of slow-mo to aim thumbs

    water.uniforms.uTime.value = t;
    boat.position.y = -0.08 + Math.sin(t * 1.05) * 0.12;
    boat.rotation.z = Math.sin(t * 0.9) * 0.035;
    boat.rotation.x = Math.sin(t * 0.7 + 1.1) * 0.02;
    boat.userData.foam.position.set(boat.position.x, 0.05, 0);
    boat.userData.foam.material.opacity = 0.06 + Math.sin(t * 2.2) * 0.02;

    // The rod loads up while the reel is turning
    const load = state.phase === 'reel' ? 0.55 : state.phase === 'drop' ? 0.2 : 0;
    boat.userData.rod.rotation.z += (0.5 - load - boat.userData.rod.rotation.z) * Math.min(1, dt * 5);
    boat.userData.arms.rotation.z = state.phase === 'reel' ? Math.sin(t * 9) * 0.06 : 0;

    seabed.userData.weeds.forEach((w) => {
      w.rotation.z = Math.sin(t * 0.75 + w.userData.phase) * 0.16;
    });

    updateFish(dt, t);

    if (state.phase === 'drop') {
      state.dropSpeed = Math.min(15.5, state.dropSpeed + dt * 1.7);
      state.depth += state.dropSpeed * dt;
      state.lureX += (state.targetX - state.lureX) * Math.min(1, dt * 6.5);
      state.deepest = Math.max(state.deepest, state.depth);
      sfx.reelTick(state.dropSpeed);
      if (Math.random() < dt * 7) {
        emitBurst(burst, state.lureX, -state.depth, 0, 1, 0.35, 0.25);
      }
      updateZone();
      if (state.depth >= BOTTOM) {
        state.depth = BOTTOM;
        hookAt(null, 'bottom');
      } else {
        collide(false);
      }
    } else if (state.phase === 'reel') {
      state.depth -= 16.5 * dt;
      state.lureX += (state.targetX - state.lureX) * Math.min(1, dt * 7.5);
      sfx.reelTick(18);
      collide(true);
      if (state.depth <= 0) {
        state.depth = 0;
        startToss();
      }
    } else if (state.phase === 'toss') {
      state.caught.forEach((f) => {
        const { air } = f;
        if (!air || air.done === true) return;
        if (air.done === 'hit' && f.mesh.position.y < 1.15 &&
            Math.abs(f.mesh.position.x - (boat.position.x + 1.75)) < 1.1) {
          f.mesh.visible = false;
          air.done = true;
          sfx.plopp();
          return;
        }
        air.vy -= 20 * dt;
        air.x += air.vx * dt;
        air.y += air.vy * dt;
        f.mesh.position.set(air.x, air.y, air.z);
        f.mesh.rotation.z += air.spin * dt;
        f.mesh.rotation.y = 0;
        swim(f.mesh, t * 2.2, 6, 1.4);
        if (air.y < -0.5 && air.done !== 'hit') {
          air.done = true;
          f.mesh.visible = false;
          state.tossLeft--;
          state.tapChain = 0;
          sfx.miss();
          sfx.splash(0.5);
          emitBurst(burst, air.x, 0.1, air.z, 12, 3.4, 0.5);
          if (state.tossLeft <= 0) finishToss();
        }
      });
    }

    /* Lure, line and the string of fish following it */
    const lureY = -state.depth;
    lure.position.set(state.lureX, lureY, 0);
    lure.rotation.z = (state.targetX - state.lureX) * -0.06;
    lure.userData.spinner.rotation.x = t * 12;
    lure.visible = state.phase === 'drop' || state.phase === 'reel';
    line.visible = lure.visible;
    if (lure.visible) updateLine(dt);

    if (state.phase === 'reel' || state.phase === 'drop') {
      // Strung below the lure, nose-up, each one lagging a little more than
      // the last so the whole catch swings like a real stringer.
      state.caught.forEach((f, i) => {
        f.mesh.visible = true;
        const lag = Math.min(1, dt * (6.5 - Math.min(4, i * 0.5)));
        const sway = Math.sin(t * 2.2 + i * 0.8) * 0.28;
        f.mesh.position.x += (state.lureX + sway - f.mesh.position.x) * lag;
        f.mesh.position.y += (lureY - 1.15 - i * 1.35 - f.mesh.position.y) * Math.min(1, dt * 9);
        f.mesh.position.z += (0.35 - f.mesh.position.z) * Math.min(1, dt * 6);
        f.mesh.rotation.z = Math.PI / 2 + Math.sin(t * 4 + i) * 0.2;
        f.mesh.rotation.y = 0.5;
        f.mesh.scale.setScalar(f.sp.size * 0.85);
        swim(f.mesh, t * 1.6 + i, 3, 1.6);
      });
    }

    // Underwater everything drifts up; in the air over the boat it falls.
    updateBurst(burst, dt, state.phase === 'toss' ? -7 : 1.4);
    updateCamera(dt);
    updateAtmosphere(dt);
    updateSnow();
    sfx.setDepth(state.depth, BOTTOM);

    hud.depth.textContent = `${Math.round(state.depth)} m`;
    renderer.render(scene, camera);
  }

  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);

  renderCast();
  hud.overlay.classList.add('show');
  spawnFishSet();

  /* Deterministic hooks for automated tests */
  window.__ppFiske = {
    state,
    scene,
    camera,
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
    tapAll() {
      state.caught.forEach((f) => {
        if (f.air && !f.air.done) {
          f.air.done = 'hit';
          state.tossLeft--;
          addScore(Math.round(f.sp.pts * state.mult));
        }
      });
      if (state.tossLeft <= 0) finishToss();
    },
    fishes,
    info() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        fish: fishes.length
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
    clearTimeout(state.lastToast);
    state.timers.forEach(clearTimeout);
    delete window.__ppFiske;

    clearFish();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    disposeAssets();
    caustics.dispose();
    spark.dispose();
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
