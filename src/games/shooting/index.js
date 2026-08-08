/**
 * Pekkas Lerduvor — the 2022 competition as a Three.js clay shooting game.
 *
 * The design borrows from the whole lineage — Duck Hunt's point-and-shoot
 * joy, the trap and skeet rule book, and everything game-feel research
 * says about making a shot land:
 *
 *  - Every pull follows the real ritual: call PULL, and the trap answers
 *    after a RANDOM delay (0.2–1.8 s) exactly like Olympic skeet, so the
 *    launch always startles a little.
 *  - Singles give two shells, like real trap. Doubles give one per bird.
 *  - 24 duvor over three series — singles, crossers, then doubles — and
 *    then the 25th: GULDDUVAN, small, fast and worth 500. A full round
 *    of 25, like a real scorecard.
 *  - Swing-through controls: touch, track the bird, RELEASE to fire.
 *    The whole phone is the gun.
 *
 * Hits break the clay into actual 3D shards with a streak multiplier;
 * misses cost nothing but the streak. The gang watches from folding
 * chairs. Ludvig won this in real life — his ghost score is the target.
 */

import * as THREE from 'three';
import { Sfx } from './audio.js';
import { mulberry, glowTexture, buildSky, buildRange, buildShotgun, buildClay } from './range.js';

const HIGHSCORE_KEY = 'pp-skytte-highscore';
const LUDVIG = 3400; // mästarens ghost score

const SERIES = [
  { name: 'Serie 1 — Uppvärmningen', singles: 8, doubles: 0, speed: 0.85, brief: 'Åtta lugna duvor från graven. Hitta svingen.' },
  { name: 'Serie 2 — Korsarna', singles: 8, doubles: 0, speed: 1.1, crossers: true, brief: 'Snabbare nu, och från sidorna. Sving igenom duvan!' },
  { name: 'Serie 3 — Finalen', singles: 4, doubles: 2, speed: 1.25, crossers: true, brief: 'Fyra singlar och två dubbléer. Ett skott per duva i dubbléerna.' }
];

/* ------------------------------------------------------------------- HUD */

function buildHud(root) {
  root.innerHTML = `
    <div class="fg-vignette"></div>
    <div class="pb-hud">
      <div class="pb-top">
        <div class="pb-score-wrap">
          <div class="pb-score" id="sk-score">0</div>
          <div class="pb-hi">REKORD <span id="sk-hi">0</span></div>
        </div>
        <div class="pb-meta">
          <div class="sk-streak" id="sk-streak"></div>
          <div class="fg-cast" id="sk-serie"></div>
        </div>
      </div>
      <div class="sk-card" id="sk-card"></div>
      <div class="sk-shells" id="sk-shells"><i></i><i></i></div>
      <div class="sk-cross" id="sk-cross"><i></i></div>
      <div class="fg-zone" id="sk-callout"></div>
      <div class="fg-phase" id="sk-phase"></div>
      <div class="pb-toast" id="sk-toast"></div>
      <div class="fg-pops" id="sk-pops"></div>
      <div class="cl-tools show" id="sk-tools" hidden>
        <button class="cl-tool primary" id="sk-pull">PULL!</button>
      </div>
    </div>

    <div class="pb-overlay" id="sk-overlay">
      <div class="pb-panel">
        <h2 id="sk-title">Pekkas Lerduvor</h2>
        <p id="sk-text">Arnäsvall 2022. Tre serier, 24 duvor — och till sist guldduvan. En hel runda om 25.</p>
        <ul class="fg-steps" id="sk-steps">
          <li><i style="--c:#f2c14e"></i><b>Pull!</b> Tryck PULL — duvan kommer efter en slumpad paus, som i olympisk skeet.</li>
          <li><i style="--c:#7fd8e8"></i><b>Sving</b> Håll fingret på skärmen och följ duvan — hagelsvärmen sitter där du pekar.</li>
          <li><i style="--c:#5eead4"></i><b>Släpp = skott</b> Släpp för att skjuta. Två patroner per singel, en per duva i dubbléer.</li>
        </ul>
        <div class="pb-scoreline" id="sk-scoreline" hidden></div>
        <div class="fg-catchlist" id="sk-verdict" hidden></div>
        <button class="pb-btn" id="sk-start">Ladda och klart!</button>
      </div>
    </div>

    <button class="pb-info" id="sk-info" aria-label="Så spelar du">?</button>

    <div class="pb-help" id="sk-help" hidden>
      <div class="pb-help-card">
        <h3>Så skjuter du</h3>
        <p class="pb-help-sub">Pekkas Lerduvor</p>
        <ul class="pb-help-list">
          <li><i style="--c:#f2c14e"></i><b>PULL!</b> Duvan släpps efter en slumpad fördröjning på upp till ett par sekunder — precis som i olympisk skeet. Var redo.</li>
          <li><i style="--c:#7fd8e8"></i><b>Svinga igenom</b> Håll fingret nere och följ duvan. Släpp när kornet ligger på — hagelsvärmen träffar där du pekar. På dator: sikta med musen, klicka för skott.</li>
          <li><i style="--c:#5eead4"></i><b>Två patroner</b> Singlar ger två skott — bom på första? Andra chansen finns. Dubbléer: två duvor i luften, ett skott var.</li>
          <li><i style="--c:#ff7a6b"></i><b>Streaken</b> Varje kross i rad höjer bonusen. En bom nollar den.</li>
          <li><i style="--c:#d9a05b"></i><b>Serierna</b> Uppvärmning rakt från graven, sen korsare från sidorna, sen finalen med dubbléer. 24 duvor totalt.</li>
          <li><i style="--c:#ffd166"></i><b>GULDDUVAN</b> Den 25:e. Liten, snabb, guld — 500 poäng, en enda patron.</li>
        </ul>
        <p class="pb-help-tip">Poäng: kross 100 + 25 per streak · dubblé-par +200 · felfri serie +500 · guldduvan 500. Ludvig sköt ${'3 400'.replace(' ', ' ')} — slå det.</p>
        <div class="pb-help-keys">Sikta: dra · Skjut: släpp / klick · PULL: knappen eller mellanslag · Kortet: ? eller Esc</div>
        <button class="pb-btn" id="sk-help-close">Tillbaka till banan</button>
      </div>
    </div>

    <button class="pb-mute" id="sk-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  return {
    score: q('#sk-score'), hi: q('#sk-hi'), streak: q('#sk-streak'), serie: q('#sk-serie'),
    card: q('#sk-card'), shells: q('#sk-shells'), cross: q('#sk-cross'),
    callout: q('#sk-callout'), phase: q('#sk-phase'), toast: q('#sk-toast'), pops: q('#sk-pops'),
    tools: q('#sk-tools'), pull: q('#sk-pull'),
    overlay: q('#sk-overlay'), title: q('#sk-title'), text: q('#sk-text'), steps: q('#sk-steps'),
    scoreline: q('#sk-scoreline'), verdict: q('#sk-verdict'), start: q('#sk-start'),
    info: q('#sk-info'), help: q('#sk-help'), helpClose: q('#sk-help-close'), mute: q('#sk-mute')
  };
}

/* ------------------------------------------------------------------- game */

export async function createShooting(container) {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui fg-ui';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost);

  const sfx = new Sfx();
  const rand = mulberry(2022);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd8c9a0, 60, 220);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
  camera.position.set(0, 1.7, 0);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xfff2d6, 0x3a4a2c, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2ae, 1.5);
  sun.position.set(-40, 26, -70);
  scene.add(sun);

  /* World */
  const glow = glowTexture();
  const sky = buildSky();
  scene.add(sky.dome);
  const range = buildRange();
  scene.add(range.group);

  const gun = buildShotgun(glow);
  gun.group.scale.setScalar(0.62);
  gun.group.position.set(0.17, -0.31, -0.62);
  camera.add(gun.group);

  /* Clay pool: at most two airborne (the double) */
  const clays = [buildClay(), buildClay()].map((mesh) => {
    scene.add(mesh);
    mesh.visible = false;
    return { mesh, active: false, vel: new THREE.Vector3(), spin: 0, gold: false, shardT: 0, shardVel: [] };
  });

  /* Dust puff on a break */
  const puffMat = new THREE.SpriteMaterial({
    map: glow,
    color: 0xff9a50,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const puff = new THREE.Sprite(puffMat);
  scene.add(puff);

  /* ---- State ----------------------------------------------------------- */

  const state = {
    phase: 'idle', // idle | armed | delay | flight | over
    serieNo: 1,
    duvaNo: 0, // index within the series
    score: 0,
    streak: 0,
    shells: 2,
    delayT: 0,
    resolveT: 0,
    serieHits: 0,
    isDouble: false,
    isGold: false,
    card: [], // per series: array of true/false
    goldDone: false,
    lastToast: 0
  };

  let high = 0;
  try {
    high = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
  } catch (e) {
    high = 0;
  }
  const fmt = (n) => Math.round(n).toLocaleString('sv-SE');
  hud.hi.textContent = fmt(high);

  let helpOpen = false;
  let hitStop = 0;
  const shake = { power: 0 };
  let recoil = 0;

  const aim = { x: 0, y: 0.25 }; // NDC
  let tracking = false;

  function serie() {
    return SERIES[state.serieNo - 1];
  }

  function kick(power, stopMs) {
    shake.power = Math.max(shake.power, power);
    hitStop = Math.max(hitStop, stopMs / 1000);
    if (navigator.vibrate) navigator.vibrate(Math.min(40, power * 22));
  }

  function toast(msg, big = false) {
    hud.toast.textContent = msg;
    hud.toast.className = `pb-toast show${big ? ' big' : ''}`;
    clearTimeout(state.lastToast);
    state.lastToast = setTimeout(() => {
      hud.toast.className = 'pb-toast';
    }, big ? 1600 : 1000);
  }

  function callout(txt) {
    hud.callout.textContent = txt;
    hud.callout.classList.remove('show');
    void hud.callout.offsetWidth;
    hud.callout.classList.add('show');
  }

  const projected = new THREE.Vector3();

  function popScore(text, world, cls = '') {
    projected.copy(world).project(camera);
    if (projected.z > 1) return;
    const el = document.createElement('div');
    el.className = `fg-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${(projected.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * 100}%`;
    hud.pops.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function addScore(n, world, label) {
    state.score += n;
    hud.score.textContent = fmt(state.score);
    hud.score.classList.remove('bump');
    void hud.score.offsetWidth;
    hud.score.classList.add('bump');
    if (world) popScore(label || `+${fmt(n)}`, world);
  }

  function renderStreak() {
    hud.streak.textContent = state.streak >= 2 ? `×${state.streak}` : '';
    hud.streak.classList.toggle('hot', state.streak >= 5);
  }

  function renderSerie() {
    hud.serie.textContent = state.isGold ? 'GULDDUVAN' : `SERIE ${Math.min(state.serieNo, 3)}/3`;
  }

  function renderCard() {
    let html = '';
    state.card.forEach((row, si) => {
      html += `<div class="sk-row${si === state.serieNo - 1 && !state.isGold ? ' now' : ''}">`;
      row.forEach((v) => {
        html += `<i class="${v === true ? 'hit' : v === false ? 'miss' : ''}"></i>`;
      });
      html += '</div>';
    });
    hud.card.innerHTML = html;
  }

  function renderShells() {
    const dots = hud.shells.querySelectorAll('i');
    dots.forEach((d, i) => d.classList.toggle('spent', i >= state.shells));
  }

  /* ---- Flow ------------------------------------------------------------ */

  function totalDuvorIn(s) {
    return s.singles + s.doubles;
  }

  function startGame() {
    sfx.resume();
    state.score = 0;
    state.serieNo = 1;
    state.duvaNo = 0;
    state.streak = 0;
    state.goldDone = false;
    state.isGold = false;
    state.card = SERIES.map((s) => new Array(totalDuvorIn(s)).fill(null));
    hud.score.textContent = '0';
    hud.scoreline.hidden = true;
    hud.verdict.hidden = true;
    hud.steps.hidden = false;
    hud.overlay.classList.remove('show');
    hud.tools.hidden = false;
    hud.card.classList.add('show');
    startSerie();
  }

  function startSerie() {
    state.duvaNo = 0;
    state.serieHits = 0;
    renderSerie();
    renderCard();
    setPhase(serie().brief);
    armPull();
  }

  function setPhase(txt) {
    hud.phase.textContent = txt;
    hud.phase.classList.toggle('show', !!txt);
    if (txt) setTimeout(() => hud.phase.classList.remove('show'), 2800);
  }

  function armPull() {
    state.phase = 'armed';
    hud.pull.disabled = false;
  }

  function callPull() {
    if (state.phase !== 'armed' || helpOpen) return;
    state.phase = 'delay';
    hud.pull.disabled = true;
    state.delayT = 0.2 + rand() * 1.6; // the Olympic skeet random delay
    sfx.pull();
  }

  function launch() {
    const s = serie();
    state.isDouble = !state.isGold && state.duvaNo >= s.singles;
    state.shells = state.isGold ? 1 : 2;
    renderShells();
    state.phase = 'flight';
    sfx.thwock();

    const launchOne = (clay, side) => {
      clay.active = true;
      clay.gold = state.isGold;
      const m = clay.mesh;
      m.visible = true;
      m.scale.setScalar(state.isGold ? 0.62 : 1);
      m.children.forEach((c) => {
        if (c.material && c.material.color && !c.userData.shard) {
          c.material.color.set(state.isGold ? 0xf2c14e : 0xff6a1c);
          c.material.emissive.set(state.isGold ? 0x4a3200 : 0x511a00);
        }
      });
      clay.mesh.userData.shards.forEach((sh) => {
        sh.visible = false;
      });
      clay.shardT = 0;

      const speed = s.speed * (state.isGold ? 1.5 : 1) * (0.92 + rand() * 0.16);
      if (s.crossers && (side !== 0 || rand() < 0.6)) {
        // Crosser from the field edge
        const dir = side !== 0 ? side : rand() < 0.5 ? -1 : 1;
        m.position.set(-dir * 26, 2 + rand() * 3, -30 - rand() * 12);
        clay.vel.set(dir * (10 + rand() * 4) * speed, (7.5 + rand() * 2.5) * speed, -2 * speed);
      } else {
        // Away and rising, straight from the trap house
        m.position.set(0, 1.1, -16.5);
        clay.vel.set((rand() - 0.5) * 9 * speed, (9 + rand() * 3) * speed, (-11 - rand() * 4) * speed);
      }
      clay.spin = 5 + rand() * 4;
    };

    launchOne(clays[0], state.isDouble ? -1 : 0);
    if (state.isDouble) launchOne(clays[1], 1);
    else clays[1].active = false;
  }

  function airborne() {
    return clays.filter((c) => c.active);
  }

  function resolveDuva() {
    // Called when no clays remain airborne (all smashed or escaped)
    const s = serie();
    if (state.isGold) {
      state.goldDone = true;
      gameOver();
      return;
    }
    state.duvaNo++;
    renderCard();
    if (state.duvaNo >= totalDuvorIn(s)) {
      if (state.serieHits === totalDuvorIn(s) + s.doubles) {
        // (doubles count two birds — a clean card is handled below instead)
      }
      const clean = state.card[state.serieNo - 1].every((v) => v === true);
      if (clean) {
        addScore(500);
        toast('FELFRI SERIE! +500', true);
        sfx.cheer();
      }
      if (state.serieNo >= 3) {
        startGold();
        return;
      }
      state.serieNo++;
      startSerie();
      return;
    }
    armPull();
  }

  function startGold() {
    state.isGold = true;
    renderSerie();
    setPhase('GULDDUVAN — liten, snabb, 500 poäng. En patron.');
    callout('GULDDUVAN');
    sfx.goldFanfare();
    armPull();
  }

  function markCard(hit) {
    const row = state.card[state.serieNo - 1];
    if (!state.isGold && row && state.duvaNo < row.length) {
      // For doubles the duva is marked hit only if BOTH birds broke;
      // we mark optimistically on first break and clear on any escape.
      if (row[state.duvaNo] === null) row[state.duvaNo] = hit;
      else if (hit === false) row[state.duvaNo] = false;
      else row[state.duvaNo] = row[state.duvaNo] && hit;
    }
    renderCard();
  }

  function smash(clay, world) {
    clay.active = false;
    state.streak++;
    state.serieHits++;
    const base = clay.gold ? 500 : 100;
    const bonus = Math.min(12, state.streak - 1) * 25;
    addScore(base + bonus, world, clay.gold ? 'GULDDUVAN +500' : `KROSS +${fmt(base + bonus)}`);
    sfx.shatter(true);
    sfx.streak(state.streak);
    renderStreak();
    kick(clay.gold ? 1.8 : 1.0, clay.gold ? 110 : 60);
    markCard(true);

    /* The break: hide the dome, fling the shards */
    const m = clay.mesh;
    m.children.forEach((c) => {
      if (!m.userData.shards.includes(c)) c.visible = false;
    });
    clay.shardT = 0.9;
    clay.shardVel = m.userData.shards.map(() => new THREE.Vector3(
      (rand() - 0.5) * 7, 2 + rand() * 5, (rand() - 0.5) * 7
    ));
    m.userData.shards.forEach((sh) => {
      sh.visible = true;
      sh.position.set(0, 0, 0);
      sh.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    });
    puff.position.copy(world);
    puffMat.opacity = 0.85;
    puff.scale.setScalar(1.2);

    if (state.isDouble && airborne().length === 0) {
      const bothHit = state.card[state.serieNo - 1][state.duvaNo] === true;
      if (bothHit) {
        addScore(200, world, 'DUBBLÉ +200');
        sfx.cheer();
      }
    }
  }

  function escape(clay) {
    clay.active = false;
    clay.mesh.visible = false;
    markCard(false);
    state.streak = 0;
    renderStreak();
  }

  function missShot() {
    sfx.miss();
    if (state.streak >= 2) toast('Bom — streaken bruten');
    state.streak = 0;
    renderStreak();
  }

  /* ---- Shooting -------------------------------------------------------- */

  function fire() {
    if (state.phase !== 'flight' || state.shells <= 0 || helpOpen) return;
    state.shells--;
    renderShells();
    sfx.boom();
    recoil = 1;
    kick(0.7, 0);
    gun.flashMat.opacity = 1;
    gun.smokeMat.opacity = 0.5;
    gun.smoke.scale.setScalar(0.25);

    // Screen-space pattern test against every airborne clay
    let hitAny = false;
    airborne().forEach((clay) => {
      projected.copy(clay.mesh.position).project(camera);
      const dist = Math.hypot(projected.x - aim.x, (projected.y - aim.y) * 1.4);
      const radius = 0.085 + (clay.gold ? -0.012 : 0.015);
      if (projected.z < 1 && dist < radius) {
        hitAny = true;
        smash(clay, clay.mesh.position.clone());
      }
    });
    if (!hitAny) missShot();

    if (state.shells <= 0) {
      // Any birds still flying will escape on their own; nothing to do here
    } else {
      setTimeout(() => sfx.reload(), 260);
    }
  }

  /* ---- Input ----------------------------------------------------------- */

  function pointerNdc(e) {
    const rect = canvasHost.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    };
  }

  function onPointerDown(e) {
    sfx.resume();
    if (helpOpen || e.target.closest('.pb-overlay, .pb-mute, .pb-info, .pb-help, .cl-tool')) return;
    const p = pointerNdc(e);
    aim.x = p.x;
    aim.y = p.y;
    tracking = true;
  }

  function onPointerMove(e) {
    if (!tracking && e.pointerType !== 'mouse') return;
    const p = pointerNdc(e);
    aim.x = p.x;
    aim.y = p.y;
  }

  function onPointerUp(e) {
    if (!tracking) return;
    tracking = false;
    if (e.target.closest('.pb-overlay, .pb-mute, .pb-info, .pb-help, .cl-tool')) return;
    fire();
  }

  function onKeyDown(e) {
    if (e.key === '?' || (e.key === 'Escape' && helpOpen)) {
      setHelp(e.key === '?' ? !helpOpen : false);
      return;
    }
    if (helpOpen) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (state.phase === 'idle' || state.phase === 'over') startGame();
      else if (state.phase === 'armed') callPull();
    }
  }

  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
    if (open) tracking = false;
  }

  canvasHost.addEventListener('pointerdown', onPointerDown);
  canvasHost.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  hud.start.addEventListener('click', startGame);
  hud.pull.addEventListener('click', callPull);
  hud.info.addEventListener('click', () => setHelp(!helpOpen));
  hud.helpClose.addEventListener('click', () => setHelp(false));
  hud.mute.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    hud.mute.classList.toggle('off', sfx.muted);
  });

  /* ---- Game over ------------------------------------------------------- */

  function gameOver() {
    state.phase = 'over';
    hud.tools.hidden = true;
    hud.card.classList.remove('show');
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
    const hits = state.card.flat().filter((v) => v === true).length + (state.goldDone && state.streak > 0 ? 1 : 0);
    sfx.fanfare();
    const beatLudvig = state.score > LUDVIG;
    hud.title.textContent = isHigh ? 'Nytt rekord!' : beatLudvig ? 'Du slog mästaren!' : 'Rundan är slut';
    hud.text.textContent = beatLudvig
      ? 'Bättre än Ludvigs guldrunda från 2022. Kaffet smakar segrare.'
      : `Ludvig sköt ${fmt(LUDVIG)} när det begav sig. Revansch?`;
    hud.steps.hidden = true;
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng · rekord ${fmt(high)}</small>`;
    hud.verdict.hidden = false;
    hud.verdict.innerHTML = `<b>Träffade duvor</b><span>${hits} av 25</span>`;
    hud.start.textContent = 'Ny runda';
    hud.overlay.classList.add('show');
  }

  /* ---- Sizing ---------------------------------------------------------- */

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.7 ? 66 : 58;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Loop ------------------------------------------------------------ */

  let raf = 0;
  let last = performance.now();
  let running = true;
  const gunTarget = new THREE.Vector3();

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

    if (!helpOpen) {
      if (state.phase === 'delay') {
        state.delayT -= dt;
        if (state.delayT <= 0) launch();
      } else if (state.phase === 'flight') {
        let anyActive = false;
        clays.forEach((clay) => {
          if (!clay.active) return;
          anyActive = true;
          const m = clay.mesh;
          clay.vel.y -= 9.8 * dt;
          m.position.addScaledVector(clay.vel, dt);
          m.rotation.y += clay.spin * dt;
          m.rotation.z = Math.sin(t * 2) * 0.2;
          if (m.position.y < 0.2 || Math.abs(m.position.x) > 60 || m.position.z < -120) {
            if (state.streak >= 2) toast('Den kom undan');
            escape(clay);
            sfx.miss();
          }
        });
        if (!anyActive) {
          state.resolveT += dt;
          if (state.resolveT > 0.5) {
            state.resolveT = 0;
            resolveDuva();
          }
        } else {
          state.resolveT = 0;
        }
      }
    }

    /* Shards tumble on after a break */
    clays.forEach((clay) => {
      if (clay.shardT <= 0) return;
      clay.shardT -= dt;
      const m = clay.mesh;
      m.userData.shards.forEach((sh, i) => {
        if (!sh.visible) return;
        const v = clay.shardVel[i];
        v.y -= 12 * dt;
        sh.position.addScaledVector(v, dt);
        sh.rotation.x += dt * 9;
        sh.rotation.z += dt * 7;
      });
      if (clay.shardT <= 0) m.visible = false;
    });

    puffMat.opacity = Math.max(0, puffMat.opacity - dt * 2.2);
    puff.scale.addScalar(dt * 6);

    /* Gun follows the aim; recoil pushes it back into the shoulder */
    recoil = Math.max(0, recoil - dt * 6);
    gun.flashMat.opacity = Math.max(0, gun.flashMat.opacity - dt * 14);
    gun.smokeMat.opacity = Math.max(0, gun.smokeMat.opacity - dt * 1.4);
    gun.smoke.scale.addScalar(dt * 0.8);
    gun.smoke.position.y = 0.05 + (0.5 - gun.smokeMat.opacity) * 0.3;
    gunTarget.set(aim.x * 0.9, aim.y * 0.7 - 0.28, -1.6);
    gun.group.position.z = -0.62 + recoil * 0.07;
    gun.group.lookAt(camera.localToWorld(gunTarget.clone()));
    gun.group.rotateY(Math.PI); // barrels run along -z; lookAt aims +z

    /* Crosshair HUD element follows the aim */
    hud.cross.style.left = `${(aim.x * 0.5 + 0.5) * 100}%`;
    hud.cross.style.top = `${(-aim.y * 0.5 + 0.5) * 100}%`;
    hud.cross.classList.toggle('show', state.phase === 'flight' || state.phase === 'delay');

    /* Camera sway + shake; a breath of life while waiting */
    camera.rotation.z = Math.sin(t * 0.4) * 0.004;
    camera.position.y = 1.7 + Math.sin(t * 1.1) * 0.012;
    if (shake.power > 0.001) {
      shake.power = Math.max(0, shake.power - dt * 4);
      camera.position.x = (rand() - 0.5) * shake.power * 0.06;
      camera.position.y += (rand() - 0.5) * shake.power * 0.06;
    } else {
      camera.position.x = 0;
    }

    /* Crowd + birds */
    range.crowd.forEach((p) => {
      const cheer = state.streak >= 3 || (hitStop > 0 && state.phase === 'flight');
      const { arms } = p.userData;
      const target = cheer ? -2.2 : 2.4;
      arms.children[0].rotation.z += (-target - arms.children[0].rotation.z) * Math.min(1, dt * 6);
      arms.children[1].rotation.z += (target - arms.children[1].rotation.z) * Math.min(1, dt * 6);
      p.rotation.z = Math.sin(t * 1.2 + p.userData.phase) * 0.02;
    });
    range.birds.forEach((b) => {
      b.position.x += b.userData.speed * dt;
      if (b.position.x > 90) b.position.x = -90;
      b.children[0].rotation.z = Math.sin(t * 7 + b.userData.phase) * 0.5;
      b.children[1].rotation.z = -Math.sin(t * 7 + b.userData.phase) * 0.5;
    });
    if (rand() < dt * 0.12) sfx.bird();

    renderer.render(scene, camera);
  }

  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);

  hud.overlay.classList.add('show');
  renderSerie();

  /* Deterministic hooks for automated tests */
  window.__ppSkytte = {
    state,
    startGame,
    callPull,
    fire,
    aimAt(x, y) {
      aim.x = x;
      aim.y = y;
    },
    launchNow() {
      if (state.phase === 'delay') {
        state.delayT = 0;
      }
    },
    aimAtClay() {
      const c = airborne()[0];
      if (!c) return false;
      projected.copy(c.mesh.position).project(camera);
      aim.x = projected.x;
      aim.y = projected.y;
      return true;
    },
    smashFirst() {
      const c = airborne()[0];
      if (c) smash(c, c.mesh.position.clone());
    },
    escapeAll() {
      airborne().forEach((c) => escape(c));
    },
    clays,
    info() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles
      };
    }
  };

  /* ---- Teardown -------------------------------------------------------- */

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
    delete window.__ppSkytte;

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
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (sfx.ctx) sfx.ctx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createShooting;
export { SERIES };
