/**
 * Pekkas Lerskulptur — the 2026 competition as a Three.js pottery game.
 *
 * The design borrows its loop from the most loved pottery game on mobile
 * (Let's Create! Pottery) and from what actually happened in Barcelona:
 * a keramiker set the task and judged the results. So:
 *
 *   1. The keramikern shows a form — its ghost silhouette hangs over the
 *      wheel.
 *   2. You THROW: the wheel spins, and dragging against the clay pushes
 *      it in or pulls it out at that height, like a palm and a rib tool.
 *      A likeness meter answers the only question that matters — "is
 *      this starting to look like it?"
 *   3. The piece is FIRED in the kiln, glazed, judged in points and in
 *      words, and set on the bench. Three pieces make an evening.
 *
 * The clay is a radial height field wrapped as an indexed lathe mesh and
 * shaded with a generated matcap — the same trick sculpting packages use
 * for their clay preview. Everything is procedural; the only download is
 * Three.js itself.
 */

import * as THREE from 'three';
import { Sfx } from './audio.js';
import { mulberry, clayMatcap, buildStudio, buildWheel } from './studio.js';

const HIGHSCORE_KEY = 'pp-lera-highscore';
const N = 64; // profile samples along the height
const K = 48; // radial segments
const H = 2.05; // clay column height
const R_MIN = 0.14;
const R_MAX = 1.5;
const PIECE_TIME = 75;

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
    glaze: 0xc9982e,
    glazeName: 'honungsglasyr',
    profile: profileOf([[0, 0.62], [0.14, 0.5], [0.35, 0.62], [0.7, 0.95], [1, 1.18]])
  },
  {
    id: 'vas',
    name: 'Vasen',
    brief: 'En klassisk vas — fyllig buk, smal hals, liten läpp.',
    glaze: 0x3e6e9e,
    glazeName: 'koboltglasyr',
    profile: profileOf([[0, 0.58], [0.16, 0.82], [0.38, 1.02], [0.62, 0.62], [0.82, 0.34], [0.93, 0.36], [1, 0.5]])
  },
  {
    id: 'amfora',
    name: 'Amforan',
    brief: 'En amfora som på museet — hög buk, lång smal hals, utsvängd mynning.',
    glaze: 0x6f9e6a,
    glazeName: 'seladonglasyr',
    profile: profileOf([[0, 0.4], [0.1, 0.62], [0.3, 1.08], [0.52, 0.92], [0.74, 0.3], [0.9, 0.26], [1, 0.56]])
  }
];

const VERDICTS = [
  [0.93, 10, 'Perfekte! Den här ställer vi i fönstret.'],
  [0.86, 9, 'Keramikern nickar länge och gillande.'],
  [0.78, 8, 'Fin kurva. Nästan som förlagan.'],
  [0.68, 6, 'Godkänt — in i ugnen med den.'],
  [0.55, 4, 'Hm. Rustik. Vi säger rustik.'],
  [0.4, 3, 'Formen finns där inne någonstans.'],
  [0, 1, 'Picasso var också missförstådd i början.']
];

/**
 * Frame delta, clamped at BOTH ends. Only clamping the top looks harmless
 * until a queued rAF fires with a timestamp older than the one stashed on
 * visibilitychange: dt goes negative, and every `x -= rate * dt` in the
 * loop starts running backwards — fades brighten, scales invert.
 */
function clampDt(ms) {
  return Math.max(0, Math.min(0.05, ms / 1000));
}

/* ------------------------------------------------------------------- HUD */

function buildHud(root) {
  root.innerHTML = `
    <div class="fg-vignette"></div>
    <div class="pb-hud">
      <div class="pb-top">
        <div class="pb-score-wrap">
          <div class="pb-score" id="cl-score">0</div>
          <div class="pb-hi">REKORD <span id="cl-hi">0</span></div>
        </div>
        <div class="pb-meta">
          <div class="cl-timer" id="cl-timer"></div>
          <div class="fg-cast" id="cl-round"></div>
        </div>
      </div>
      <div class="cl-task" id="cl-task">
        <canvas id="cl-thumb" width="52" height="66"></canvas>
        <div class="cl-task-name" id="cl-piecename"></div>
      </div>
      <div class="cl-sim" id="cl-sim"><i id="cl-simbar"></i><b id="cl-simval">0%</b></div>
      <div class="fg-phase" id="cl-phase"></div>
      <div class="pb-toast" id="cl-toast"></div>
      <div class="fg-pops" id="cl-pops"></div>
      <div class="cl-tools" id="cl-tools">
        <button class="cl-tool" id="cl-smooth">GLÄTTA</button>
        <button class="cl-tool primary" id="cl-done">KLAR — BRÄNN!</button>
      </div>
    </div>

    <div class="pb-overlay" id="cl-overlay">
      <div class="pb-panel">
        <h2 id="cl-title">Pekkas Lerskulptur</h2>
        <p id="cl-text">Keramikern visar formen — dreja så likt du kan. Dra mot leran för att trycka in, dra utåt för att dra ut.</p>
        <ul class="fg-steps" id="cl-steps">
          <li><i style="--c:#7fd8e8"></i><b>Forma</b> Dra i leran vid rätt höjd — spöket visar målet.</li>
          <li><i style="--c:#f2c14e"></i><b>Glätta</b> Håll GLÄTTA för att jämna ut kurvorna.</li>
          <li><i style="--c:#5eead4"></i><b>Bränn</b> Tryck KLAR när du är nöjd — keramikern dömer likheten.</li>
        </ul>
        <div class="pb-scoreline" id="cl-scoreline" hidden></div>
        <div class="fg-catchlist" id="cl-verdict" hidden></div>
        <button class="pb-btn" id="cl-start">Sätt igång drejskivan</button>
      </div>
    </div>

    <button class="pb-info" id="cl-info" aria-label="Så spelar du">?</button>

    <div class="pb-help" id="cl-help" hidden>
      <div class="pb-help-card">
        <h3>Så drejar du</h3>
        <p class="pb-help-sub">Pekkas Lerskulptur</p>
        <ul class="pb-help-list">
          <li><i style="--c:#7fd8e8"></i><b>Uppdraget</b> Keramikern visar en form — dess silhuett hänger som streckat spöke över drejskivan. Likhetsmätaren visar hur nära du är.</li>
          <li><i style="--c:#d9a05b"></i><b>Forma</b> Dra mot leran för att trycka in, dra utåt för att dra ut — vid precis den höjd du rör.</li>
          <li><i style="--c:#f2c14e"></i><b>Glätta</b> Håll GLÄTTA-knappen så jämnar handflatan ut kurvorna.</li>
          <li><i style="--c:#ff7a6b"></i><b>Tiden</b> 75 sekunder per alster. Går tiden ut åker det in i ugnen som det är.</li>
          <li><i style="--c:#5eead4"></i><b>Bränn</b> Tryck KLAR när du är nöjd. Glasyr, betyg 1–10 och keramikerns dom — sen ställs alstret på bänken.</li>
          <li><i style="--c:#6f9b5a"></i><b>Poängen</b> Likhet i kvadrat × 1 000, plus tidsbonus om likheten når 60 %. Tre alster per kväll.</li>
        </ul>
        <p class="pb-help-tip">Snabb och lik vinner: en tidig 90-procentare slår en sen perfektionist.</p>
        <div class="pb-help-keys">Forma: dra på skivan · Bränn: KLAR eller Enter · Kortet: ? eller Esc</div>
        <button class="pb-btn" id="cl-help-close">Tillbaka till ateljén</button>
      </div>
    </div>

    <button class="pb-mute" id="cl-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  return {
    score: q('#cl-score'), hi: q('#cl-hi'), timer: q('#cl-timer'), round: q('#cl-round'),
    task: q('#cl-task'), thumb: q('#cl-thumb'), piecename: q('#cl-piecename'),
    sim: q('#cl-sim'), simbar: q('#cl-simbar'), simval: q('#cl-simval'),
    phase: q('#cl-phase'), toast: q('#cl-toast'), pops: q('#cl-pops'), tools: q('#cl-tools'),
    smooth: q('#cl-smooth'), done: q('#cl-done'),
    overlay: q('#cl-overlay'), title: q('#cl-title'), text: q('#cl-text'), steps: q('#cl-steps'),
    scoreline: q('#cl-scoreline'), verdict: q('#cl-verdict'), start: q('#cl-start'), mute: q('#cl-mute'),
    info: q('#cl-info'), help: q('#cl-help'), helpClose: q('#cl-help-close')
  };
}

/* ------------------------------------------------------------------- game */

export async function createClay(container) {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui fg-ui';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost);

  const sfx = new Sfx();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1c14);
  scene.fog = new THREE.Fog(0x2a1c14, 9, 20);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
  camera.position.set(0, 2.4, 7.6);

  /* Warm studio light */
  // FILL: cool from above so nothing in shadow goes to pure black
  const hemi = new THREE.HemisphereLight(0xbcd2ee, 0x3a2418, 0.6);
  scene.add(hemi);

  // DOMINANT: the evening sun through the arched window — the only caster,
  // aimed down the same line the visible shaft travels
  const sunlight = new THREE.DirectionalLight(0xffd39a, 2.0);
  sunlight.position.set(-6.5, 6.4, -5.2);
  sunlight.target.position.set(0.6, 0.4, 1.4);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -8;
  sunlight.shadow.camera.right = 8;
  sunlight.shadow.camera.top = 7;
  sunlight.shadow.camera.bottom = -5;
  sunlight.shadow.camera.near = 0.5;
  sunlight.shadow.camera.far = 30;
  sunlight.shadow.bias = -0.0009;
  sunlight.shadow.normalBias = 0.02;
  scene.add(sunlight);
  scene.add(sunlight.target);

  // FILL 2: warm bounce off the terracotta floor, and a front fill so the
  // potter and the wheel are not silhouettes against their own window
  const bounce = new THREE.DirectionalLight(0xd9975a, 0.35);
  bounce.position.set(2, -3, 4);
  scene.add(bounce);
  const front = new THREE.DirectionalLight(0xfff0dc, 0.55);
  front.position.set(1.5, 3.5, 9);
  scene.add(front);
  const kilnLight = new THREE.PointLight(0xff7a20, 0, 9, 2);
  kilnLight.position.set(3.4, 1.4, -2.6);
  scene.add(kilnLight);

  /* Matcaps: raw clay, cream tool, fired glaze (white matcap × tint) */
  const rawMatcap = clayMatcap('#b06a40', '#5c3020', 0.9);
  const firedMatcap = clayMatcap('#d8d4cf', '#5a5650', 0.95);

  /* World */
  const studio = buildStudio(firedMatcap);
  scene.add(studio.group);
  const wheel = buildWheel();
  wheel.group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(wheel.group);

  /* The display bench where finished pieces end up */
  const bench = new THREE.Group();
  const benchTop = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.1, 0.8),
    new THREE.MeshLambertMaterial({ color: 0x6b4526 })
  );
  benchTop.position.y = 0.85;
  benchTop.castShadow = true;
  benchTop.receiveShadow = true;
  bench.add(benchTop);
  [-1.1, 1.1].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.7), benchTop.material);
    leg.position.set(x, 0.42, 0);
    bench.add(leg);
  });
  bench.position.set(-3.1, 0, -0.4);
  bench.rotation.y = 0.5;
  scene.add(bench);

  /* ---- The clay itself -------------------------------------------------- */

  const clayGroup = new THREE.Group();
  clayGroup.position.y = wheel.headY;
  scene.add(clayGroup);

  const clayGeo = new THREE.BufferGeometry();
  {
    const verts = N * K + 2; // rings + top centre + bottom centre
    clayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    const idx = [];
    for (let j = 0; j < N - 1; j++) {
      for (let k = 0; k < K; k++) {
        const a = j * K + k;
        const b = j * K + ((k + 1) % K);
        const c = (j + 1) * K + k;
        const d = (j + 1) * K + ((k + 1) % K);
        idx.push(a, c, b, b, c, d);
      }
    }
    const top = N * K;
    const bottom = N * K + 1;
    for (let k = 0; k < K; k++) {
      idx.push((N - 1) * K + k, top, (N - 1) * K + ((k + 1) % K));
      idx.push(k, (k + 1) % K, bottom);
    }
    clayGeo.setIndex(idx);
  }
  const clayMat = new THREE.MeshMatcapMaterial({ matcap: rawMatcap, color: 0xffffff });
  const clay = new THREE.Mesh(clayGeo, clayMat);
  clayGroup.add(clay);

  // A matcap ignores scene lights, so the pot can never receive or cast a
  // real shadow. This painted contact shadow is what stops it floating.
  const contact = (() => {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const c2 = cv.getContext('2d');
    const rg = c2.createRadialGradient(32, 32, 2, 32, 32, 32);
    rg.addColorStop(0, 'rgba(20,10,4,0.75)');
    rg.addColorStop(0.55, 'rgba(20,10,4,0.32)');
    rg.addColorStop(1, 'rgba(20,10,4,0)');
    c2.fillStyle = rg;
    c2.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    m.renderOrder = 3;
    return m;
  })();
  clayGroup.add(contact);

  const r = new Float32Array(N);
  const startLump = (u) => 0.68 - 0.3 * u ** 1.4;

  function resetLump() {
    for (let j = 0; j < N; j++) r[j] = startLump(j / (N - 1));
  }
  resetLump();

  function updateClayGeometry() {
    const pos = clayGeo.attributes.position;
    const arr = pos.array;
    for (let j = 0; j < N; j++) {
      const y = (j / (N - 1)) * H;
      // Throwing rings + a faint spiral of finger marks
      const rr = Math.max(0.1, r[j]) * (1 + 0.006 * Math.sin(j * 1.9));
      for (let k = 0; k < K; k++) {
        const a = (k / K) * Math.PI * 2;
        const rk = rr * (1 + 0.0045 * Math.sin(a * 3 + j * 0.55));
        const i3 = (j * K + k) * 3;
        arr[i3] = Math.cos(a) * rk;
        arr[i3 + 1] = y;
        arr[i3 + 2] = Math.sin(a) * rk;
      }
    }
    const top = (N * K) * 3;
    arr[top] = 0;
    arr[top + 1] = H - 0.07; // the thrown dimple
    arr[top + 2] = 0;
    arr[top + 3] = 0;
    arr[top + 4] = 0;
    arr[top + 5] = 0;
    pos.needsUpdate = true;
    clayGeo.computeVertexNormals();
  }
  updateClayGeometry();

  /* Ghost silhouette of the target, drawn as dashed hologram lines */
  const ghostMat = new THREE.LineDashedMaterial({
    color: 0x5eead4,
    transparent: true,
    opacity: 0.75,
    dashSize: 0.09,
    gapSize: 0.055,
    depthTest: false
  });
  let ghost = null;

  function buildGhost(profile) {
    if (ghost) {
      clayGroup.remove(ghost);
      ghost.children.forEach((l) => l.geometry.dispose());
    }
    ghost = new THREE.Group();
    [-1, 1].forEach((s) => {
      const pts = [];
      for (let j = 0; j <= 40; j++) {
        const u = j / 40;
        pts.push(new THREE.Vector3(s * profile(u), u * H, 0));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ghostMat);
      line.computeLineDistances();
      line.renderOrder = 40;
      ghost.add(line);
    });
    clayGroup.add(ghost);
  }

  /* Fingertip marker where the hand works the clay */
  const finger = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 8),
    new THREE.MeshMatcapMaterial({ matcap: firedMatcap, color: 0xf2d8b8 })
  );
  finger.visible = false;
  clayGroup.add(finger);

  /* Slip droplets that fly off while shaping */
  const dropCount = 90;
  const dropGeo = new THREE.BufferGeometry();
  const dropPos = new Float32Array(dropCount * 3);
  for (let i = 0; i < dropCount; i++) dropPos[i * 3 + 1] = -99;
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({
    color: 0xb87848,
    size: 0.05,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  }));
  drops.frustumCulled = false;
  scene.add(drops);
  const dropVel = [];
  for (let i = 0; i < dropCount; i++) dropVel.push({ life: 0, vx: 0, vy: 0, vz: 0 });
  let dropNext = 0;

  function emitDrop(x, y, z, speed) {
    const i = dropNext % dropCount;
    dropNext++;
    const d = dropVel[i];
    d.life = 0.5 + Math.random() * 0.4;
    const a = Math.random() * Math.PI * 2;
    d.vx = Math.cos(a) * speed;
    d.vz = Math.sin(a) * speed;
    d.vy = 1.2 + Math.random() * 1.6;
    dropPos[i * 3] = x;
    dropPos[i * 3 + 1] = y;
    dropPos[i * 3 + 2] = z;
  }

  /* Fired pieces standing on the bench */
  const shelfPieces = [];

  /* ---- State ----------------------------------------------------------- */

  const state = {
    phase: 'idle', // idle | throw | fire | judge | over
    round: 1,
    score: 0,
    match: 0,
    bestMatch: 0,
    timeLeft: PIECE_TIME,
    fireT: 0,
    wheelSpeed: 0,
    verdict: null,
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

  function currentPiece() {
    return PIECES[(state.round - 1) % PIECES.length];
  }

  /* Likeness between the thrown profile and the target */
  function computeMatch() {
    const { profile } = currentPiece();
    let err = 0;
    for (let j = 0; j < N; j++) {
      err += Math.abs(r[j] - profile(j / (N - 1)));
    }
    err /= N;
    return Math.max(0, Math.min(1, 1 - err / 0.42));
  }

  function renderMatch() {
    state.match = computeMatch();
    const pct = Math.round(state.match * 100);
    hud.simval.textContent = `${pct}%`;
    hud.simbar.style.width = `${pct}%`;
    hud.sim.classList.toggle('good', state.match >= 0.78);
    hud.sim.classList.toggle('great', state.match >= 0.9);
  }

  function drawThumb() {
    const { profile } = currentPiece();
    const ctx = hud.thumb.getContext('2d');
    const w = hud.thumb.width;
    const h = hud.thumb.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(94, 234, 212, 0.85)';
    ctx.beginPath();
    for (let j = 0; j <= 30; j++) {
      const u = j / 30;
      const x = w / 2 - (profile(u) / R_MAX) * (w / 2 - 2);
      const y = h - 3 - u * (h - 6);
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let j = 30; j >= 0; j--) {
      const u = j / 30;
      const x = w / 2 + (profile(u) / R_MAX) * (w / 2 - 2);
      const y = h - 3 - u * (h - 6);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function renderRound() {
    hud.round.textContent = `ALSTER ${Math.min(state.round, 3)}/3`;
  }

  /* ---- Phases ----------------------------------------------------------- */

  function startPiece() {
    const piece = currentPiece();
    state.phase = 'throw';
    state.timeLeft = PIECE_TIME;
    state.bestMatch = 0;
    resetLump();
    updateClayGeometry();
    clay.visible = true;
    clayMat.color.set(0xffffff);
    buildGhost(piece.profile);
    drawThumb();
    hud.piecename.textContent = piece.name;
    hud.task.classList.add('show');
    hud.sim.classList.add('show');
    hud.tools.classList.add('show');
    renderRound();
    renderMatch();
    sfx.slap();
    setPhaseLabel(piece.brief);
    later(() => setPhaseLabel(''), 3200);
  }

  function verdictFor(match) {
    for (const [minMatch, points, words] of VERDICTS) {
      if (match >= minMatch) return { points, words };
    }
    return { points: 1, words: '' };
  }

  function finishPiece() {
    if (state.phase !== 'throw') return;
    state.phase = 'fire';
    state.fireT = 0;
    renderMatch();
    const timeBonus = state.match >= 0.6 ? Math.round(state.timeLeft * 3) : 0;
    const base = Math.round(state.match ** 2 * 1000);
    state.verdict = {
      ...verdictFor(state.match),
      match: state.match,
      base,
      timeBonus,
      total: base + timeBonus
    };
    hud.task.classList.remove('show');
    hud.sim.classList.remove('show');
    hud.tools.classList.remove('show');
    hud.timer.textContent = '';
    if (ghost) ghost.visible = false;
    finger.visible = false;
    setPhaseLabel('IN I UGNEN');
    sfx.kiln(2.4);
    sfx.setShaping(0);
  }

  function showJudgement() {
    state.phase = 'judge';
    const v = state.verdict;
    state.score += v.total;
    hud.score.textContent = fmt(state.score);
    sfx.verdict(v.match);
    setPhaseLabel('');
    hud.title.textContent = `${currentPiece().name}: ${v.points}/10`;
    hud.text.textContent = v.words;
    hud.steps.hidden = true;
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML =
      `<span>+${fmt(v.total)}</span><small>likhet ${Math.round(v.match * 100)}% · tidsbonus ${fmt(v.timeBonus)}</small>`;
    hud.verdict.hidden = false;
    hud.verdict.innerHTML = `<b>${currentPiece().glazeName}</b><span>${Math.round(v.match * 100)}%</span>`;
    hud.start.textContent = state.round >= 3 ? 'Se resultatet' : 'Nästa alster';
    hud.overlay.classList.add('show');
  }

  function placeOnBench() {
    // Bake the thrown profile into a keepsake on the bench
    const keep = clayGeo.clone();
    const mesh = new THREE.Mesh(keep, new THREE.MeshMatcapMaterial({
      matcap: firedMatcap,
      color: currentPiece().glaze
    }));
    const spot = shelfPieces.length;
    mesh.scale.setScalar(0.3);
    mesh.position.set(-0.8 + spot * 0.8, 0.9, 0);
    bench.add(mesh);
    shelfPieces.push(mesh);
  }

  function nextPiece() {
    placeOnBench();
    hud.overlay.classList.remove('show');
    if (state.round >= 3) {
      gameOver();
      return;
    }
    state.round++;
    startPiece();
  }

  function gameOver() {
    state.phase = 'over';
    clay.visible = false;
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
    sfx.setWheel(0);
    hud.title.textContent = isHigh ? 'Nytt rekord!' : 'Utställningen är klar';
    hud.text.textContent = isHigh
      ? 'Kvällens bästa hand med leran hittills. Bravo!'
      : 'Tre alster på hyllan och lera överallt. En vända till?';
    hud.steps.hidden = true;
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng · rekord ${fmt(high)}</small>`;
    hud.verdict.hidden = true;
    hud.start.textContent = 'Dreja igen';
    hud.overlay.classList.add('show');
  }

  function startGame() {
    sfx.resume();
    state.score = 0;
    state.round = 1;
    hud.score.textContent = '0';
    hud.scoreline.hidden = true;
    hud.verdict.hidden = true;
    hud.steps.hidden = false;
    hud.overlay.classList.remove('show');
    shelfPieces.forEach((m) => {
      bench.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    shelfPieces.length = 0;
    startPiece();
  }

  /* ---- Input ------------------------------------------------------------ */

  const raycaster = new THREE.Raycaster();
  const workPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const planeHit = new THREE.Vector3();
  const pointerNdc = new THREE.Vector2();
  let dragging = false;
  let smoothing = false;
  let helpOpen = false;
  let shapingEnergy = 0;

  function pointerToClay(e) {
    const rect = canvasHost.getBoundingClientRect();
    pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    );
    raycaster.setFromCamera(pointerNdc, camera);
    if (!raycaster.ray.intersectPlane(workPlane, planeHit)) return null;
    return { x: planeHit.x, y: planeHit.y - wheel.headY };
  }

  let brush = null; // {j, targetR, side}

  function onPointerDown(e) {
    sfx.resume();
    if (helpOpen || e.target.closest('.pb-overlay, .pb-mute, .pb-info, .pb-help, .cl-tool')) return;
    if (state.phase !== 'throw') return;
    dragging = true;
    onPointerMove(e);
  }

  function onPointerMove(e) {
    if (!dragging || state.phase !== 'throw') return;
    const p = pointerToClay(e);
    if (!p) return;
    const u = p.y / H;
    if (u < -0.1 || u > 1.15) {
      brush = null;
      return;
    }
    const j = Math.max(0, Math.min(N - 1, Math.round(u * (N - 1))));
    brush = {
      j,
      targetR: Math.max(R_MIN, Math.min(R_MAX, Math.abs(p.x))),
      side: Math.sign(p.x) || 1,
      y: Math.max(0.02, Math.min(H, p.y))
    };
  }

  function onPointerUp() {
    dragging = false;
    brush = null;
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
    } else if (e.key === 'Enter' && state.phase === 'throw') {
      finishPiece();
    }
  }

  /* Strategy card: pauses the wheel while open, like the pinball's */
  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
    if (open) {
      dragging = false;
      smoothing = false;
      brush = null;
      sfx.setShaping(0);
    }
  }

  canvasHost.addEventListener('pointerdown', onPointerDown);
  canvasHost.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  hud.start.addEventListener('click', () => {
    if (state.phase === 'judge') nextPiece();
    else startGame();
  });
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
  hud.mute.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    hud.mute.classList.toggle('off', sfx.muted);
    sfx.setWheel(state.phase === 'throw' ? 1 : 0);
  });

  /* ---- Sizing ----------------------------------------------------------- */

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.7 ? 58 : 48;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Loop ------------------------------------------------------------- */

  let raf = 0;
  let last = performance.now();
  let running = true;
  const camGoal = new THREE.Vector3(0, 2.4, 7.6);
  const lookGoal = new THREE.Vector3(0, 1.5, 0);
  const lookAt = new THREE.Vector3(0, 1.5, 0);
  const rand = mulberry(99);
  let tickSecond = 0;
  let matchThrottle = 0;

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
      }
    }
    if (smoothing) {
      const rate = Math.min(1, dt * 6);
      for (let j = 3; j < N - 1; j++) {
        r[j] += ((r[j - 1] + r[j + 1]) / 2 - r[j]) * rate;
      }
      moved += 0.02;
      if (rand() < dt * 3) sfx.smooth();
    }
    // A whisper of relaxation keeps the profile organic while working
    if (brush) {
      for (let j = 4; j < N - 1; j++) {
        r[j] += ((r[j - 1] + r[j + 1]) / 2 - r[j]) * Math.min(1, dt * 1.2);
      }
    }
    return moved;
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
    shapingEnergy += (Math.min(1, moved * 26) - shapingEnergy) * Math.min(1, dt * 9);
    sfx.setShaping(dragging || smoothing ? 0.15 + shapingEnergy : 0);
    if (moved > 0.0005 || smoothing) {
      updateClayGeometry();
      matchThrottle -= dt;
      if (matchThrottle <= 0) {
        matchThrottle = 0.12;
        const prev = state.match;
        renderMatch();
        if (state.match > state.bestMatch) {
          state.bestMatch = state.match;
          if (state.match >= 0.9 && prev < 0.9) toast('Keramikern höjer ögonbrynen!', true);
          else if (state.match >= 0.78 && prev < 0.78) toast('Nu liknar det något!');
        }
      }
    }

    /* Fingertip marker + slip drops while the hands are on */
    if (brush && dragging) {
      finger.visible = true;
      const fr = r[brush.j] + 0.06;
      finger.position.set(brush.side * fr, brush.y, 0.12);
      if (shapingEnergy > 0.12 && rand() < dt * 30 * shapingEnergy) {
        emitDrop(
          clayGroup.position.x + brush.side * fr,
          wheel.headY + brush.y,
          0.1,
          1.4 + shapingEnergy * 2.4
        );
      }
    } else {
      finger.visible = false;
    }

    // The clay quivers a touch when it is being worked hard
    const quiver = 1 + shapingEnergy * 0.012 * Math.sin(t * 40);
    clay.scale.set(quiver, 1, quiver);
  }

  function updateFire(dt) {
    state.fireT += dt / 2.6;
    state.wheelSpeed += (0 - state.wheelSpeed) * Math.min(1, dt * 3);
    const k = Math.min(1, state.fireT);
    const heat = Math.sin(k * Math.PI);
    kilnLight.intensity = heat * 3.2;
    studio.kilnDoor.color.setRGB(0.16 + heat * 0.9, 0.08 + heat * 0.35, 0.03 + heat * 0.06);
    // White clay → glowing hot → glaze colour
    const glaze = new THREE.Color(currentPiece().glaze);
    if (k < 0.5) clayMat.color.lerpColors(new THREE.Color(0xffffff), new THREE.Color(0xffa668), heat);
    else clayMat.color.lerpColors(new THREE.Color(0xffa668), glaze, (k - 0.5) * 2);
    if (k >= 1) showJudgement();
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = clampDt(now - last);
    last = now;
    if (!running) return;
    const t = now / 1000;

    if (helpOpen) {
      // Strategy card open: the wheel coasts, nothing advances
      state.wheelSpeed += (0 - state.wheelSpeed) * Math.min(1, dt * 2);
    } else if (state.phase === 'throw') updateThrow(dt, t);
    else if (state.phase === 'fire') updateFire(dt);
    else {
      state.wheelSpeed += (0 - state.wheelSpeed) * Math.min(1, dt * 2);
      kilnLight.intensity = Math.max(0, kilnLight.intensity - dt * 2);
    }

    sfx.setWheel(state.wheelSpeed);
    const spin = state.wheelSpeed * 3.1 * dt;
    clay.rotation.y += spin;
    wheel.head.rotation.y += spin;

    /* Judge nods during the verdict */
    const { head } = studio.guy.userData;
    if (state.phase === 'judge' || state.phase === 'fire') {
      studio.guy.rotation.y += (-2.2 - studio.guy.rotation.y) * Math.min(1, dt * 2);
      head.rotation.x = Math.sin(t * 2.4) * 0.1;
    } else {
      studio.guy.rotation.y += (-0.7 - studio.guy.rotation.y) * Math.min(1, dt * 2);
      head.rotation.x += (0 - head.rotation.x) * Math.min(1, dt * 3);
    }

    /* Dust motes drift */
    studio.motes.rotation.y = Math.sin(t * 0.05) * 0.04;
    studio.motes.position.y = Math.sin(t * 0.11) * 0.05;

    /* Slip droplets */
    let dropsAlive = false;
    for (let i = 0; i < dropCount; i++) {
      const d = dropVel[i];
      if (d.life <= 0) continue;
      dropsAlive = true;
      d.life -= dt;
      d.vy -= 7 * dt;
      dropPos[i * 3] += d.vx * dt;
      dropPos[i * 3 + 1] += d.vy * dt;
      dropPos[i * 3 + 2] += d.vz * dt;
      if (dropPos[i * 3 + 1] < 0.6 || d.life <= 0) {
        d.life = 0;
        dropPos[i * 3 + 1] = -99;
      }
    }
    if (dropsAlive) dropGeo.attributes.position.needsUpdate = true;

    /* Camera: wide in the studio, closer over the wheel while working */
    if (state.phase === 'over') {
      // The exhibition: three glazed pieces on the bench
      camGoal.set(-1.5, 1.75, 3.4);
      lookGoal.set(-2.7, 1.05, -0.3);
    } else if (state.phase === 'idle') {
      camGoal.set(Math.sin(t * 0.1) * 0.7, 2.5, 7.8);
      lookGoal.set(0, 1.5, 0);
    } else if (state.phase === 'fire' || state.phase === 'judge') {
      camGoal.set(2.0, 2.2, 6.6);
      lookGoal.set(1.3, 1.35, -1.3);
    } else {
      camGoal.set(0, 2.35, 7.0);
      lookGoal.set(0, 1.55, 0);
    }
    camera.position.lerp(camGoal, Math.min(1, dt * 2.6));
    lookAt.lerp(lookGoal, Math.min(1, dt * 3.4));
    camera.lookAt(lookAt);

    /* Ghost breathes so it reads as a guide, not an object */
    if (ghost && ghost.visible) {
      ghostMat.opacity = 0.55 + Math.sin(t * 2.4) * 0.2;
    }

    renderer.render(scene, camera);
  }

  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);

  renderRound();
  hud.overlay.classList.add('show');

  /* Deterministic hooks for automated tests */
  window.__ppLera = {
    state,
    startGame,
    finishPiece,
    nextPiece,
    profile: r,
    matchTo(k = 0.9) {
      const { profile } = currentPiece();
      for (let j = 0; j < N; j++) {
        r[j] = r[j] + (profile(j / (N - 1)) - r[j]) * k;
      }
      updateClayGeometry();
      renderMatch();
    },
    skipFire() {
      if (state.phase === 'fire') {
        state.fireT = 1;
      }
    },
    computeMatch,
    info() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles
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
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    clearTimeout(state.lastToast);
    state.timers.forEach(clearTimeout);
    delete window.__ppLera;

    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          if (m.matcap) m.matcap.dispose();
          m.dispose();
        });
      }
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (sfx.ctx) sfx.ctx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createClay;
export { PIECES };
