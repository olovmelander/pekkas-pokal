/**
 * Pekkas Fiske — the 2024 competition as a Three.js fishing game.
 *
 * The loop is borrowed from the most loved mobile fishing game there is:
 * steer the lure PAST the fish on the way down (deeper = better fish),
 * hook one and catch everything you can on the way up, then the whole
 * stringer is flung into the air and every fish you TAP lands in the
 * tunna for double points. Three casts per game.
 *
 * Everything is procedural: low-poly fish, a rowing boat on a midnight-sun
 * lake, depth-graded water and synthesized sound. The only download is
 * Three.js itself.
 */

import * as THREE from 'three';

const CASTS_PER_GAME = 3;
const BOTTOM = 60; // metres — Själevadsfjärden runs deep
const HIGHSCORE_KEY = 'pp-fiske-highscore';

/* ---------------------------------------------------------------- species */

const SPECIES = [
  { id: 'mort', name: 'Mört', pts: 10, min: 2, max: 16, size: 0.55, color: 0xb9c4d6, belly: 0xe8edf5, speed: 2.6 },
  { id: 'abborre', name: 'Abborre', pts: 25, min: 5, max: 30, size: 0.7, color: 0x5f8f5a, belly: 0xd8e9c8, speed: 3.1 },
  { id: 'sik', name: 'Sik', pts: 40, min: 14, max: 42, size: 0.8, color: 0x9fb4c8, belly: 0xeef4fa, speed: 3.4 },
  { id: 'gadda', name: 'Gädda', pts: 80, min: 20, max: 52, size: 1.25, color: 0x4a6b3f, belly: 0xcfe0b8, speed: 3.9 },
  { id: 'lax', name: 'Lax', pts: 150, min: 34, max: 58, size: 1.05, color: 0x8a92b8, belly: 0xf3c9b8, speed: 4.6 },
  { id: 'pekka', name: 'PEKKAGÄDDAN', pts: 500, min: 50, max: 59, size: 1.9, color: 0xf2c14e, belly: 0xfff3cf, speed: 5.2, rare: true }
];

/* ------------------------------------------------------------------ audio */

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
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, type = 'sine', gain = 0.5, sweep = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + sweep), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, gain = 0.4, freq = 800) {
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

  splash() { this.noise(0.35, 0.5, 500); this.tone(180, 0.25, 'sine', 0.3, -80); }
  plopp() { this.tone(300, 0.09, 'sine', 0.5, -140); }
  hook() { this.tone(700, 0.09, 'square', 0.4, 300); this.noise(0.08, 0.3, 1800); }
  catchFish(n) { this.tone(420 * 1.12 ** Math.min(n, 10), 0.1, 'triangle', 0.5, 120); }
  reel() { this.tone(1400, 0.025, 'square', 0.12); }
  toss() { this.noise(0.3, 0.4, 700); this.tone(220, 0.3, 'sawtooth', 0.3, 400); }
  tap(n) { this.tone(520 * 1.12 ** Math.min(n, 8), 0.12, 'square', 0.45, 200); }
  miss() { this.tone(200, 0.2, 'sine', 0.3, -90); }
  legend() {
    [0, 110, 220, 330, 480].forEach((d, i) =>
      setTimeout(() => this.tone(392 * 2 ** (i / 4), 0.22, 'triangle', 0.5), d));
  }
  fanfare() {
    [0, 90, 180, 340].forEach((d, i) =>
      setTimeout(() => this.tone(523 * (1 + i * 0.25), 0.2, 'triangle', 0.5), d));
  }
}

/* ------------------------------------------------------------------- HUD */

function buildHud(root) {
  root.innerHTML = `
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
      <div class="fg-phase" id="fg-phase"></div>
      <div class="pb-toast" id="fg-toast"></div>
    </div>

    <div class="pb-overlay" id="fg-overlay">
      <div class="pb-panel">
        <h2 id="fg-title">Pekkas Fiske</h2>
        <p id="fg-text">Styr draget genom att dra med fingret. Väj för fisken på väg ner — kroka djupt, fånga allt på väg upp och tryck på fisken i luften!</p>
        <div class="pb-scoreline" id="fg-scoreline" hidden></div>
        <button class="pb-btn" id="fg-start">Kasta i!</button>
      </div>
    </div>

    <button class="pb-mute" id="fg-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  return {
    score: root.querySelector('#fg-score'),
    hi: root.querySelector('#fg-hi'),
    depth: root.querySelector('#fg-depth'),
    cast: root.querySelector('#fg-cast'),
    phase: root.querySelector('#fg-phase'),
    toast: root.querySelector('#fg-toast'),
    overlay: root.querySelector('#fg-overlay'),
    title: root.querySelector('#fg-title'),
    text: root.querySelector('#fg-text'),
    scoreline: root.querySelector('#fg-scoreline'),
    start: root.querySelector('#fg-start'),
    mute: root.querySelector('#fg-mute')
  };
}

/* ------------------------------------------------------------------ world */

function buildFishMesh(sp) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: sp.color, flatShading: true });
  const bellyMat = new THREE.MeshLambertMaterial({ color: sp.belly, flatShading: true });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 5), bodyMat);
  body.scale.set(1.7, 0.62, 0.5);
  g.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 7, 5), bellyMat);
  belly.scale.set(1.5, 0.5, 0.42);
  belly.position.y = -0.1;
  g.add(belly);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 4), bodyMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -1.0;
  tail.scale.z = 0.4;
  g.add(tail);

  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 4), bodyMat);
  fin.position.set(0.1, 0.4, 0);
  fin.scale.z = 0.4;
  g.add(fin);

  const eyeGeo = new THREE.SphereGeometry(0.07, 6, 4);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x10152a });
  [0.26, -0.26].forEach((z) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.62, 0.08, z * 0.5);
    g.add(eye);
  });

  if (sp.rare) {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.34, 5),
      new THREE.MeshLambertMaterial({ color: 0xffe08a, emissive: 0xf2c14e, emissiveIntensity: 0.7 })
    );
    crown.position.set(0.45, 0.55, 0);
    g.add(crown);
  }

  g.scale.setScalar(sp.size);
  g.userData.tail = tail;
  return g;
}

function buildBoat() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b, flatShading: true });
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.9, 4.4, 6, 1), hullMat);
  hull.rotation.z = Math.PI / 2;
  hull.scale.y = 0.55;
  hull.scale.z = 0.62;
  g.add(hull);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 6, 12), hullMat);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.2, 0.62, 1);
  rim.position.y = 0.72;
  g.add(rim);

  // Fisherman: cap, head, body
  const guy = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.45, 0.9, 6),
    new THREE.MeshLambertMaterial({ color: 0xf2c14e, flatShading: true })
  );
  body.position.y = 1.15;
  guy.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a, flatShading: true })
  );
  head.position.y = 1.85;
  guy.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.3, 0.16, 7),
    new THREE.MeshLambertMaterial({ color: 0xb23a48, flatShading: true })
  );
  cap.position.y = 2.02;
  guy.add(cap);
  // Fishing rod
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.05, 2.6, 5),
    new THREE.MeshLambertMaterial({ color: 0x3a2b1a })
  );
  rod.position.set(1.1, 1.9, 0);
  rod.rotation.z = -0.7;
  guy.add(rod);
  guy.position.x = -0.3;
  g.add(guy);

  return g;
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

  /* ---- Renderer: no post-processing — depth fog and flat shading carry
     the look, and phones keep their frame rate ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const SKY = new THREE.Color(0xffd9a0); // midnight sun
  const SURF = new THREE.Color(0x1d6b74);
  const DEEP = new THREE.Color(0x041020);
  scene.background = SKY.clone();
  scene.fog = new THREE.FogExp2(0x1d6b74, 0.028);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
  camera.position.set(0, 4, 16);

  /* ---- Lights ---- */
  const hemi = new THREE.HemisphereLight(0xfff2d0, 0x0a2030, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 1.4);
  sun.position.set(-14, 20, 8);
  scene.add(sun);

  /* ---- Sky: sun disc + shoreline silhouette ---- */
  const skyGroup = new THREE.Group();
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffedc0, fog: false })
  );
  sunDisc.position.set(-10, 9.5, -30);
  skyGroup.add(sunDisc);
  const shoreMat = new THREE.MeshBasicMaterial({ color: 0x27333e, fog: false });
  for (let i = 0; i < 26; i++) {
    const h = 1.6 + Math.random() * 2.6;
    const tree = new THREE.Mesh(new THREE.ConeGeometry(0.8, h, 5), shoreMat);
    tree.position.set(-32 + i * 2.6 + Math.random(), 1.4 + h / 2, -28 - Math.random() * 4);
    skyGroup.add(tree);
  }
  scene.add(skyGroup);

  /* ---- Water surface: CPU-displaced low-poly sheet, visible from below ---- */
  const surfGeo = new THREE.PlaneGeometry(90, 44, 36, 14);
  surfGeo.rotateX(-Math.PI / 2);
  const surfMat = new THREE.MeshLambertMaterial({
    color: 0x2a8b96,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide
  });
  const surface = new THREE.Mesh(surfGeo, surfMat);
  surface.position.y = 0;
  scene.add(surface);
  const surfPos = surfGeo.attributes.position;
  const surfBase = surfPos.array.slice();

  /* ---- Boat ---- */
  const boat = buildBoat();
  boat.position.set(0.5, 0.35, 0);
  scene.add(boat);

  /* ---- Light shafts near the surface ---- */
  const shafts = [];
  const shaftMat = new THREE.MeshBasicMaterial({
    color: 0xbfe8d8,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  for (let i = 0; i < 6; i++) {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.4 + Math.random(), 16), shaftMat);
    shaft.position.set(-10 + i * 4 + Math.random() * 2, -8, -3 - Math.random() * 3);
    shaft.rotation.z = -0.22 + Math.random() * 0.1;
    scene.add(shaft);
    shafts.push(shaft);
  }

  /* ---- Seabed ---- */
  const bedGroup = new THREE.Group();
  bedGroup.position.y = -BOTTOM - 1.2;
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 30, 24, 8),
    new THREE.MeshLambertMaterial({ color: 0x2b3140, flatShading: true })
  );
  bed.rotation.x = -Math.PI / 2;
  const bp = bed.geometry.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setZ(i, Math.random() * 1.4);
  bed.geometry.computeVertexNormals();
  bedGroup.add(bed);
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x3d4558, flatShading: true });
  for (let i = 0; i < 10; i++) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.9, 0), stoneMat);
    stone.position.set(-18 + Math.random() * 36, 0.4, -4 + Math.random() * 6);
    bedGroup.add(stone);
  }
  const weedMat = new THREE.MeshLambertMaterial({ color: 0x1f5c48, flatShading: true });
  const weeds = [];
  for (let i = 0; i < 14; i++) {
    const weed = new THREE.Mesh(new THREE.ConeGeometry(0.16, 2.2 + Math.random() * 1.8, 4), weedMat);
    weed.position.set(-16 + Math.random() * 32, 1.2, -3 + Math.random() * 5);
    bedGroup.add(weed);
    weeds.push(weed);
  }
  scene.add(bedGroup);

  /* ---- Bubbles / drifting particles ---- */
  const bubbleCount = 90;
  const bubbleGeo = new THREE.BufferGeometry();
  const bubblePos = new Float32Array(bubbleCount * 3);
  for (let i = 0; i < bubbleCount; i++) {
    bubblePos[i * 3] = -14 + Math.random() * 28;
    bubblePos[i * 3 + 1] = -Math.random() * BOTTOM;
    bubblePos[i * 3 + 2] = -4 + Math.random() * 6;
  }
  bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
  const bubbles = new THREE.Points(
    bubbleGeo,
    new THREE.PointsMaterial({ color: 0x9fd8d0, size: 0.12, transparent: true, opacity: 0.5 })
  );
  scene.add(bubbles);

  /* ---- Lure + line ---- */
  const lure = new THREE.Group();
  const sinker = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xd23b4e, flatShading: true })
  );
  lure.add(sinker);
  const hookMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.045, 6, 10, Math.PI * 1.4),
    new THREE.MeshLambertMaterial({ color: 0xdfe6ff })
  );
  hookMesh.position.y = -0.34;
  hookMesh.rotation.z = Math.PI * 0.8;
  lure.add(hookMesh);
  const glow = new THREE.PointLight(0xffd9a0, 0.7, 7, 2);
  lure.add(glow);
  scene.add(lure);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3()
  ]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xdde6f2, transparent: true, opacity: 0.6 }));
  scene.add(line);

  /* ---- Fish pool ---- */
  const fishes = [];
  function spawnFishSet() {
    fishes.forEach((f) => scene.remove(f.mesh));
    fishes.length = 0;
    SPECIES.forEach((sp) => {
      const count = sp.rare ? 1 : 9;
      for (let i = 0; i < count; i++) {
        if (sp.rare && Math.random() < 0.35) continue; // she is not always home
        const mesh = buildFishMesh(sp);
        const depth = sp.min + Math.random() * (sp.max - sp.min);
        const dir = Math.random() < 0.5 ? 1 : -1;
        mesh.position.set(-14 + Math.random() * 28, -depth, -1.5 + Math.random() * 3);
        mesh.scale.x *= dir > 0 ? 1 : -1;
        scene.add(mesh);
        fishes.push({
          sp,
          mesh,
          dir,
          speed: sp.speed * (0.8 + Math.random() * 0.5),
          phase: Math.random() * Math.PI * 2,
          caught: false,
          air: null
        });
      }
    });
  }

  /* ------------------------------------------------------------- state */

  const state = {
    phase: 'idle', // idle | drop | reel | toss | between | over
    score: 0,
    castNo: 1,
    depth: 0,
    lureX: 0,
    targetX: 0,
    dropSpeed: 6,
    caught: [],
    combo: 0,
    tossLeft: 0,
    best: 0,
    lastToast: 0
  };

  let high = 0;
  try {
    high = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
  } catch (e) {
    high = 0;
  }
  hud.hi.textContent = high.toLocaleString('sv-SE');

  const fmt = (n) => n.toLocaleString('sv-SE');

  function toast(msg, big = false) {
    hud.toast.textContent = msg;
    hud.toast.className = `pb-toast show${big ? ' big' : ''}`;
    clearTimeout(state.lastToast);
    state.lastToast = setTimeout(() => {
      hud.toast.className = 'pb-toast';
    }, big ? 1700 : 1000);
  }

  function addScore(n) {
    state.score += n;
    hud.score.textContent = fmt(state.score);
  }

  function setPhaseLabel(txt) {
    hud.phase.textContent = txt;
    hud.phase.classList.toggle('show', !!txt);
  }

  function renderCast() {
    hud.cast.textContent = `KAST ${Math.min(state.castNo, CASTS_PER_GAME)}/${CASTS_PER_GAME}`;
  }

  /* ------------------------------------------------------- phase control */

  function startCast() {
    state.phase = 'drop';
    state.depth = 0;
    state.dropSpeed = 6;
    state.lureX = 0;
    state.targetX = 0;
    state.caught = [];
    state.combo = 0;
    spawnFishSet();
    sfx.splash();
    setPhaseLabel('VÄJ FÖR FISKEN — djupare ner finns finare fångst');
    setTimeout(() => setPhaseLabel(''), 2600);
    renderCast();
  }

  function hookAt(fish) {
    // Hooked (or bottomed): the reel turns and now every fish counts
    state.phase = 'reel';
    sfx.hook();
    if (fish) catchOne(fish);
    setPhaseLabel('VEVA! Fånga allt på vägen upp!');
    setTimeout(() => setPhaseLabel(''), 2200);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function catchOne(f) {
    f.caught = true;
    state.combo++;
    state.caught.push(f);
    addScore(f.sp.pts);
    sfx.catchFish(state.combo);
    if (f.sp.rare) {
      sfx.legend();
      toast('PEKKAGÄDDAN ÄR KROKAD!! +500', true);
    } else {
      toast(`${f.sp.name} +${f.sp.pts}`);
    }
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function startToss() {
    state.phase = 'toss';
    sfx.toss();
    setPhaseLabel('TRYCK PÅ FISKEN — i tunnan för dubbelt!');
    state.tossLeft = state.caught.length;
    const n = state.caught.length;
    state.caught.forEach((f, i) => {
      const spread = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      f.air = {
        x: boat.position.x + spread * 1.5,
        y: 1.2,
        vx: spread * 4.2 + (Math.random() - 0.5) * 1.5,
        vy: 13 + Math.random() * 4,
        done: false
      };
      f.mesh.visible = true;
      f.mesh.scale.setScalar(f.sp.size * 0.85);
    });
    if (n === 0) setTimeout(endCast, 900);
  }

  function endCast() {
    setPhaseLabel('');
    if (state.castNo >= CASTS_PER_GAME) {
      gameOver();
      return;
    }
    state.castNo++;
    state.phase = 'between';
    renderCast();
    toast(`Kast ${state.castNo} av ${CASTS_PER_GAME}`, true);
    setTimeout(() => {
      if (state.phase === 'between') startCast();
    }, 1400);
  }

  function gameOver() {
    state.phase = 'over';
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
    sfx.fanfare();
    hud.title.textContent = isHigh ? 'Nytt rekord!' : 'Fisket är slut';
    hud.text.textContent = isHigh
      ? 'Största fångsten hittills på den här enheten. Petri heder!'
      : 'Tre kast, sen är det kaffe och rökt sik. En tur till?';
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng · rekord ${fmt(high)}</small>`;
    hud.start.textContent = 'Fiska igen';
    hud.overlay.classList.add('show');
  }

  function startGame() {
    sfx.resume();
    state.score = 0;
    state.castNo = 1;
    hud.score.textContent = '0';
    hud.scoreline.hidden = true;
    hud.overlay.classList.remove('show');
    startCast();
  }

  /* -------------------------------------------------------------- input */

  let dragging = false;

  function pointerToX(e) {
    const rect = canvasHost.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * 2 - 1;
  }

  function onPointerDown(e) {
    sfx.resume();
    if (e.target.closest('.pb-overlay, .pb-mute')) return;

    if (state.phase === 'toss') {
      tryTapFish(e);
      return;
    }
    dragging = true;
    state.targetX = pointerToX(e) * 9;
  }

  function onPointerMove(e) {
    if (!dragging) return;
    state.targetX = pointerToX(e) * 9;
  }

  function onPointerUp() {
    dragging = false;
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') state.targetX = Math.max(-9, state.targetX - 2.4);
    else if (k === 'arrowright' || k === 'd') state.targetX = Math.min(9, state.targetX + 2.4);
    else if (k === ' ' && (state.phase === 'idle' || state.phase === 'over')) {
      e.preventDefault();
      startGame();
    }
  }

  /* Tap detection in the toss phase: closest airborne fish in screen space */
  const ndc = new THREE.Vector3();

  function tryTapFish(e) {
    const rect = canvasHost.getBoundingClientRect();
    const tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ty = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    let bestF = null;
    let bestD = 0.16; // generous thumb radius in NDC
    state.caught.forEach((f) => {
      if (!f.air || f.air.done) return;
      ndc.copy(f.mesh.position).project(camera);
      const d = Math.hypot(ndc.x - tx, ndc.y - ty);
      if (d < bestD) {
        bestD = d;
        bestF = f;
      }
    });
    if (bestF) {
      bestF.air.done = 'hit';
      state.tossLeft--;
      addScore(bestF.sp.pts); // doubles the fish
      sfx.tap(state.caught.length - state.tossLeft);
      toast(`${bestF.sp.name} i tunnan! +${bestF.sp.pts}`);
      // fly to the barrel
      bestF.air.vx = (boat.position.x + 2.6 - bestF.mesh.position.x) * 3;
      bestF.air.vy = 7;
      if (navigator.vibrate) navigator.vibrate(12);
      if (state.tossLeft <= 0) setTimeout(endCast, 700);
    }
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

  /* -------------------------------------------------------------- sizing */

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.7 ? 62 : 55;
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---------------------------------------------------------------- loop */

  let raf = 0;
  let last = performance.now();
  let running = true;
  const camTarget = new THREE.Vector3(0, 2, 0);
  const tmpColor = new THREE.Color();

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!running) return;
    const t = now / 1000;

    /* Surface waves */
    for (let i = 0; i < surfPos.count; i++) {
      const x = surfBase[i * 3];
      const z = surfBase[i * 3 + 2];
      surfPos.setY(i, Math.sin(x * 0.5 + t * 1.3) * 0.22 + Math.cos(z * 0.7 + t * 0.9) * 0.18);
    }
    surfPos.needsUpdate = true;
    surface.geometry.computeVertexNormals();

    boat.position.y = 0.35 + Math.sin(t * 1.1) * 0.12;
    boat.rotation.z = Math.sin(t * 0.9) * 0.03;

    weeds.forEach((w, i) => {
      w.rotation.x = Math.sin(t * 0.8 + i) * 0.12;
    });
    shafts.forEach((s, i) => {
      s.material.opacity = 0.06 + Math.sin(t * 0.5 + i * 1.7) * 0.045;
    });

    /* Fish swim */
    fishes.forEach((f) => {
      if (f.caught) return;
      f.mesh.position.x += f.dir * f.speed * dt;
      f.mesh.position.y += Math.sin(t * 2 + f.phase) * 0.15 * dt;
      f.userDataWiggle = Math.sin(t * 8 + f.phase) * 0.3;
      f.mesh.userData.tail.rotation.y = f.userDataWiggle;
      if (f.dir > 0 && f.mesh.position.x > 16) {
        f.mesh.position.x = -16;
      } else if (f.dir < 0 && f.mesh.position.x < -16) {
        f.mesh.position.x = 16;
      }
    });

    /* Phases */
    if (state.phase === 'drop') {
      state.dropSpeed = Math.min(15, state.dropSpeed + dt * 1.6);
      state.depth += state.dropSpeed * dt;
      state.lureX += (state.targetX - state.lureX) * Math.min(1, dt * 6);
      sfx.reel();

      if (state.depth >= BOTTOM) {
        state.depth = BOTTOM;
        toast('Botten! Nu vevar vi.', true);
        hookAt(null);
      } else {
        // Touching a fish on the way down hooks it
        for (const f of fishes) {
          if (f.caught) continue;
          const dx = f.mesh.position.x - state.lureX;
          const dy = f.mesh.position.y + state.depth;
          if (Math.abs(dx) < 0.9 * f.sp.size + 0.3 && Math.abs(dy) < 0.7 * f.sp.size + 0.3) {
            hookAt(f);
            break;
          }
        }
      }
    } else if (state.phase === 'reel') {
      state.depth -= 16 * dt;
      state.lureX += (state.targetX - state.lureX) * Math.min(1, dt * 7);

      for (const f of fishes) {
        if (f.caught) continue;
        const dx = f.mesh.position.x - state.lureX;
        const dy = f.mesh.position.y + state.depth;
        if (Math.abs(dx) < 1.1 * f.sp.size + 0.35 && Math.abs(dy) < 0.9 * f.sp.size + 0.35) {
          catchOne(f);
        }
      }

      if (state.depth <= 0) {
        state.depth = 0;
        startToss();
      }
    } else if (state.phase === 'toss') {
      state.caught.forEach((f) => {
        if (!f.air) return;
        if (f.air.done === 'hit' && f.mesh.position.y < 1.0) {
          f.mesh.visible = false;
          f.air = { done: true };
          return;
        }
        if (f.air.done === true) return;
        f.air.vy -= 20 * dt;
        f.air.x += f.air.vx * dt;
        f.air.y += f.air.vy * dt;
        f.mesh.position.set(f.air.x, f.air.y, 1.5);
        f.mesh.rotation.z += dt * 7;
        if (f.air.y < -0.4 && f.air.done !== 'hit') {
          // splashed back — lost the bonus
          f.air.done = true;
          f.mesh.visible = false;
          state.tossLeft--;
          sfx.miss();
          if (state.tossLeft <= 0) setTimeout(endCast, 600);
        }
      });
    }

    /* Lure follows */
    const lureY = -state.depth;
    lure.position.set(state.lureX, lureY, 0);
    lure.rotation.z = (state.targetX - state.lureX) * -0.08;
    lure.visible = state.phase === 'drop' || state.phase === 'reel';
    line.visible = lure.visible;
    if (lure.visible) {
      const pts = line.geometry.attributes.position.array;
      pts[0] = boat.position.x + 1.6;
      pts[1] = boat.position.y + 1.4;
      pts[2] = 0;
      pts[3] = state.lureX;
      pts[4] = lureY + 0.3;
      pts[5] = 0;
      line.geometry.attributes.position.needsUpdate = true;
    }

    /* Caught fish trail behind the lure during the reel */
    if (state.phase === 'reel' || state.phase === 'drop') {
      state.caught.forEach((f, i) => {
        f.mesh.visible = true;
        f.mesh.position.x += (state.lureX - f.mesh.position.x) * Math.min(1, dt * 8);
        f.mesh.position.y = lureY - 0.9 - i * 0.75;
        f.mesh.position.z = 0.2;
        f.mesh.rotation.z = Math.PI / 2 + Math.sin(t * 6 + i) * 0.2;
      });
    }

    /* Camera + atmosphere by depth */
    const focus = state.phase === 'toss' ? 4 : Math.max(2 - state.depth, -state.depth + 3.5);
    camTarget.set(state.lureX * 0.45, state.phase === 'idle' || state.phase === 'over' ? 2 : focus, 0);
    camera.position.x += (camTarget.x - camera.position.x) * Math.min(1, dt * 3);
    camera.position.y += (camTarget.y + 1.5 - camera.position.y) * Math.min(1, dt * 4);
    camera.lookAt(camTarget.x, camTarget.y, 0);

    const k = Math.min(1, state.depth / 45);
    if (state.depth > 1) {
      tmpColor.copy(SURF).lerp(DEEP, k);
    } else {
      tmpColor.copy(SKY);
    }
    scene.background.lerp(tmpColor, Math.min(1, dt * 3));
    scene.fog.color.copy(scene.background);
    scene.fog.density = 0.016 + k * 0.03;
    hemi.intensity = 1.0 - k * 0.62;
    sun.intensity = 1.4 - k * 1.0;

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
    startGame,
    forceHook() {
      if (state.phase === 'drop') hookAt(null);
    },
    forceCatch(n = 3) {
      fishes
        .filter((f) => !f.caught)
        .slice(0, n)
        .forEach((f) => catchOne(f));
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
          addScore(f.sp.pts);
        }
      });
      if (state.tossLeft <= 0) setTimeout(endCast, 100);
    },
    fishes
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
    window.removeEventListener('keydown', onKeyDown);
    clearTimeout(state.lastToast);
    delete window.__ppFiske;

    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (sfx.ctx) sfx.ctx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createFishing;
