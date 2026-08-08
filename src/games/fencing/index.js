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
 * A bout goes to 5 touches. Three bouts against the actual 2023 podium —
 * Mikael (brons), Rickard (silver) and Per Vikman (mästaren) — make the
 * tournament. Green lamp and buzzer on your touches, red on theirs,
 * exactly like the scoring apparatus in a real salle.
 */

import * as THREE from 'three';
import { Sfx } from './audio.js';
import { mulberry, glowTexture, buildSalle, buildFencer } from './salle.js';

const HIGHSCORE_KEY = 'pp-fakt-highscore';
const TOUCHES = 5;
const LINE_ANGLE = [0.52, 0.1, -0.34]; // front-arm pitch per line
const LINE_Y = [1.75, 1.35, 0.95]; // world height of each line at the target

const OPPONENTS = [
  {
    name: 'Mikael Hägglund',
    title: 'Bronsfäktaren',
    sock: 0x6f9e6a,
    attackEvery: [2.2, 3.4],
    telegraph: 0.95,
    attackDur: 0.34,
    parryP: 0.28,
    feintP: 0,
    riposteP: 0.25,
    taunt: 'Mikael värmer upp med långsamma, tydliga anfall.'
  },
  {
    name: 'Rickard Nilsson',
    title: 'Silverklingan',
    sock: 0x3e6e9e,
    attackEvery: [1.7, 2.8],
    telegraph: 0.72,
    attackDur: 0.3,
    parryP: 0.48,
    feintP: 0.3,
    riposteP: 0.45,
    taunt: 'Rickard är snabbare — och han börjar finta.'
  },
  {
    name: 'Per Vikman',
    title: 'Mästaren av 2023',
    sock: 0xc9982e,
    attackEvery: [1.3, 2.2],
    telegraph: 0.55,
    attackDur: 0.26,
    parryP: 0.66,
    feintP: 0.45,
    riposteP: 0.65,
    taunt: 'Per Vikman. Regerande mästare. Lycka till.'
  }
];

/* ------------------------------------------------------------------- HUD */

function buildHud(root) {
  root.innerHTML = `
    <div class="fg-vignette"></div>
    <div class="pb-hud">
      <div class="pb-top">
        <div class="pb-score-wrap">
          <div class="pb-score" id="fk-score">0</div>
          <div class="pb-hi">REKORD <span id="fk-hi">0</span></div>
        </div>
        <div class="pb-meta">
          <div class="fk-touches" id="fk-touches"></div>
          <div class="fg-cast" id="fk-bout"></div>
        </div>
      </div>
      <div class="fk-opponent" id="fk-opponent"></div>
      <div class="fk-lines" id="fk-lines">
        <button class="fk-line" data-line="0">HÖG</button>
        <button class="fk-line" data-line="1">MITT</button>
        <button class="fk-line" data-line="2">LÅG</button>
      </div>
      <div class="fg-zone" id="fk-callout"></div>
      <div class="fg-phase" id="fk-phase"></div>
      <div class="pb-toast" id="fk-toast"></div>
      <div class="fg-pops" id="fk-pops"></div>
      <div class="cl-tools show" id="fk-tools" hidden>
        <button class="cl-tool" id="fk-feint">FINT</button>
        <button class="cl-tool primary" id="fk-lunge">STÖT!</button>
      </div>
    </div>

    <div class="pb-overlay" id="fk-overlay">
      <div class="pb-panel">
        <h2 id="fk-title">Pekkas Fäktning</h2>
        <p id="fk-text">Stockholm 2023. Tre motståndare står mellan dig och pokalen — först till fem tusch vinner varje match.</p>
        <ul class="fg-steps" id="fk-steps">
          <li><i style="--c:#7fd8e8"></i><b>Gardera</b> Tryck HÖG, MITT eller LÅG — samma linje som anfallet parerar det automatiskt.</li>
          <li><i style="--c:#f2c14e"></i><b>Ripostera</b> Efter en parad vacklar motståndaren — STÖT direkt!</li>
          <li><i style="--c:#5eead4"></i><b>Finta</b> FINT lockar fram paraden, sen är en annan linje öppen.</li>
        </ul>
        <div class="pb-scoreline" id="fk-scoreline" hidden></div>
        <div class="fg-catchlist" id="fk-verdict" hidden></div>
        <button class="pb-btn" id="fk-start">En garde!</button>
      </div>
    </div>

    <button class="pb-info" id="fk-info" aria-label="Så spelar du">?</button>

    <div class="pb-help" id="fk-help" hidden>
      <div class="pb-help-card">
        <h3>Så fäktas du</h3>
        <p class="pb-help-sub">Pekkas Fäktning</p>
        <ul class="pb-help-list">
          <li><i style="--c:#7fd8e8"></i><b>Tre linjer</b> HÖG, MITT och LÅG. Din gard i samma linje som motståndarens anfall parerar det automatiskt — som i Nidhogg.</li>
          <li><i style="--c:#f2c14e"></i><b>Parad → Ripost</b> En parad får motståndaren att vackla. STÖT i det läget är nästan alltid tusch — och ger extra poäng.</li>
          <li><i style="--c:#5eead4"></i><b>Finten</b> FINT är ett anfall som inte menas. Går motståndaren på den binds klingan — stöt i öppen linje!</li>
          <li><i style="--c:#ff7a6b"></i><b>Rätten till anfall</b> Att stöta rakt in i ett påbörjat anfall slutar illa — den som började har vägrätt. Parera först.</li>
          <li><i style="--c:#d9a05b"></i><b>Läs glimten</b> Klingan blänker i den linje anfallet kommer i. De bättre fäktarna byter linje i sista stund.</li>
          <li><i style="--c:#6f9b5a"></i><b>Turneringen</b> Först till 5 tusch per match. Mikael, Rickard och mästaren Per Vikman — i den ordningen.</li>
        </ul>
        <p class="pb-help-tip">Poäng: tusch 100 · ripost 175 · fint-tusch 150 · parad 25 · matchvinst 500 + 100 per tusch i marginal.</p>
        <div class="pb-help-keys">Gard: knapparna eller ↑/↓ · Stöt: STÖT eller mellanslag · Fint: FINT eller F · Kortet: ? eller Esc</div>
        <button class="pb-btn" id="fk-help-close">Tillbaka till pisten</button>
      </div>
    </div>

    <button class="pb-mute" id="fk-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  return {
    score: q('#fk-score'), hi: q('#fk-hi'), touches: q('#fk-touches'), bout: q('#fk-bout'),
    opponent: q('#fk-opponent'), lines: q('#fk-lines'),
    lineBtns: Array.from(root.querySelectorAll('.fk-line')),
    callout: q('#fk-callout'), phase: q('#fk-phase'), toast: q('#fk-toast'), pops: q('#fk-pops'),
    tools: q('#fk-tools'), feint: q('#fk-feint'), lunge: q('#fk-lunge'),
    overlay: q('#fk-overlay'), title: q('#fk-title'), text: q('#fk-text'), steps: q('#fk-steps'),
    scoreline: q('#fk-scoreline'), verdict: q('#fk-verdict'), start: q('#fk-start'),
    info: q('#fk-info'), help: q('#fk-help'), helpClose: q('#fk-help-close'), mute: q('#fk-mute')
  };
}

/* ------------------------------------------------------------------- game */

export async function createFencing(container) {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui fg-ui';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost);

  const sfx = new Sfx();
  const rand = mulberry(77);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171d16);
  scene.fog = new THREE.Fog(0x171d16, 12, 26);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
  camera.position.set(0, 2.4, 8.6);

  const hemi = new THREE.HemisphereLight(0xffe9c8, 0x1c2418, 0.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffdfae, 1.35);
  key.position.set(-4, 8, 6);
  scene.add(key);
  const cool = new THREE.DirectionalLight(0x8fa8d8, 0.5);
  cool.position.set(6, 5, -4);
  scene.add(cool);

  /* World */
  const glow = glowTexture();
  const salle = buildSalle(glow);
  scene.add(salle.group);

  const player = buildFencer(0xf4f2ea, 0xc9982e);
  player.position.set(-1.9, 0, 0);
  scene.add(player);
  const foe = buildFencer(0xf4f2ea, 0x6f9e6a);
  foe.position.set(1.9, 0, 0);
  foe.rotation.y = Math.PI;
  scene.add(foe);

  /* Blade glint sprite shows which line the AI attack is coming in */
  const glintMat = new THREE.SpriteMaterial({
    map: glow,
    color: 0xfff2c8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const glint = new THREE.Sprite(glintMat);
  glint.scale.setScalar(0.8);
  scene.add(glint);

  /* Spark burst for parries and touches */
  const sparkCount = 120;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount; i++) sparkPos[i * 3 + 1] = -99;
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    map: glow,
    color: 0xffe9b8,
    size: 0.14,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = [];
  for (let i = 0; i < sparkCount; i++) sparkVel.push({ life: 0, vx: 0, vy: 0, vz: 0 });
  let sparkNext = 0;

  function burst(x, y, z, n, speed) {
    for (let i = 0; i < n; i++) {
      const idx = sparkNext % sparkCount;
      sparkNext++;
      const s = sparkVel[idx];
      s.life = 0.3 + rand() * 0.4;
      const a = rand() * Math.PI * 2;
      const e = rand() * Math.PI - Math.PI / 2;
      s.vx = Math.cos(a) * Math.cos(e) * speed;
      s.vy = Math.sin(e) * speed + 1.2;
      s.vz = Math.sin(a) * Math.cos(e) * speed * 0.5;
      sparkPos[idx * 3] = x;
      sparkPos[idx * 3 + 1] = y;
      sparkPos[idx * 3 + 2] = z;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  /* ---- State ----------------------------------------------------------- */

  const state = {
    phase: 'idle', // idle | ready | live | touchpause | boutend | over
    boutNo: 1,
    score: 0,
    myTouches: 0,
    foeTouches: 0,
    readyStep: 0,
    readyT: 0,
    pauseT: 0,
    celebration: 0
  };

  const me = { line: 1, pose: 'guard', t: 0, lungeLine: 1, isFeint: false };
  const ai = { pose: 'guard', t: 0, line: 1, shownLine: 1, timer: 2.5, willFeint: false, willParry: false };

  let high = 0;
  try {
    high = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
  } catch (e) {
    high = 0;
  }
  const fmt = (n) => Math.round(n).toLocaleString('sv-SE');
  hud.hi.textContent = fmt(high);

  let hitStop = 0;
  const shake = { power: 0 };
  let helpOpen = false;

  function opp() {
    return OPPONENTS[state.boutNo - 1];
  }

  function kick(power, stopMs) {
    shake.power = Math.max(shake.power, power);
    hitStop = Math.max(hitStop, stopMs / 1000);
    if (navigator.vibrate) navigator.vibrate(Math.min(40, power * 24));
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

  function renderTouches() {
    const mine = '●'.repeat(state.myTouches) + '○'.repeat(TOUCHES - state.myTouches);
    const theirs = '●'.repeat(state.foeTouches) + '○'.repeat(TOUCHES - state.foeTouches);
    hud.touches.innerHTML = `<b>${mine}</b><i>${theirs}</i>`;
  }

  function renderBout() {
    hud.bout.textContent = `MATCH ${Math.min(state.boutNo, 3)}/3`;
  }

  function renderLine() {
    hud.lineBtns.forEach((b, i) => b.classList.toggle('on', i === me.line));
  }

  function showOpponent() {
    hud.opponent.innerHTML = `<b>${opp().name}</b><span>${opp().title}</span>`;
    hud.opponent.classList.add('show');
  }

  /* ---- Flow ------------------------------------------------------------ */

  function startReady() {
    state.phase = 'ready';
    state.readyStep = 0;
    state.readyT = 0;
    me.pose = 'guard';
    me.t = 0;
    ai.pose = 'guard';
    ai.t = 0;
    ai.timer = opp().attackEvery[0] + rand() * (opp().attackEvery[1] - opp().attackEvery[0]);
    glintMat.opacity = 0;
    callout('EN GARDE');
    sfx.ready(0);
  }

  function goLive() {
    state.phase = 'live';
    callout('KÖR!');
    sfx.ready(2);
  }

  function scoreTouch(mineIs, points, label) {
    state.phase = 'touchpause';
    state.pauseT = 0;
    sfx.buzzer();
    sfx.crowd(mineIs ? 0.8 : 0.4);
    kick(mineIs ? 1.4 : 1.8, 110);
    if (mineIs) {
      state.myTouches++;
      salle.lampL.color.set(0x3ddc7b);
      addScore(points, foe.position.clone().add(new THREE.Vector3(0, 1.6, 0)), label);
      callout('TUSCH!');
    } else {
      state.foeTouches++;
      salle.lampR.color.set(0xff4d3c);
      callout('TUSCH EMOT');
    }
    renderTouches();
    state.celebration = mineIs ? 1 : 0;
  }

  function endTouchPause() {
    salle.lampL.color.set(0x1c3324);
    salle.lampR.color.set(0x33201c);
    if (state.myTouches >= TOUCHES || state.foeTouches >= TOUCHES) {
      endBout();
      return;
    }
    startReady();
  }

  function endBout() {
    const won = state.myTouches >= TOUCHES;
    state.phase = 'boutend';
    hud.tools.hidden = true;
    hud.lines.classList.remove('show');
    hud.opponent.classList.remove('show');
    if (won) {
      const margin = state.myTouches - state.foeTouches;
      const bonus = 500 + margin * 100;
      addScore(bonus);
      sfx.verdictWin();
      hud.title.textContent = `Du slog ${opp().name}!`;
      hud.text.textContent = state.boutNo >= 3
        ? 'Mästaren är besegrad — pokalen är din. Salut!'
        : `${TOUCHES}–${state.foeTouches}. ${OPPONENTS[state.boutNo].taunt}`;
      hud.scoreline.hidden = false;
      hud.scoreline.innerHTML = `<span>+${fmt(bonus)}</span><small>matchvinst · marginal ${margin}</small>`;
      hud.start.textContent = state.boutNo >= 3 ? 'Se resultatet' : 'Nästa match';
    } else {
      sfx.verdictLose();
      hud.title.textContent = `${opp().name} vann matchen`;
      hud.text.textContent = `${state.myTouches}–${TOUCHES}. Turneringen är över — men poängen räknas.`;
      hud.scoreline.hidden = true;
      hud.start.textContent = 'Se resultatet';
    }
    hud.steps.hidden = true;
    hud.verdict.hidden = true;
    hud.overlay.classList.add('show');
    state.wonBout = won;
  }

  function nextStage() {
    if (state.phase === 'boutend' && state.wonBout && state.boutNo < 3) {
      state.boutNo++;
      startBout();
      return;
    }
    if (state.phase === 'boutend') {
      gameOver();
      return;
    }
    startGame();
  }

  function startBout() {
    state.myTouches = 0;
    state.foeTouches = 0;
    hud.overlay.classList.remove('show');
    hud.tools.hidden = false;
    hud.lines.classList.add('show');
    renderTouches();
    renderBout();
    renderLine();
    showOpponent();
    // New socks for the new opponent
    foe.traverse((o) => {
      if (o.material && o.material.color && o.geometry &&
          o.geometry.type === 'CylinderGeometry' && o.position.y === -0.72) {
        o.material = o.material.clone();
        o.material.color.set(opp().sock);
      }
    });
    toast(opp().taunt, true);
    startReady();
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
    if (state.wonBout && state.boutNo >= 3) sfx.fanfare();
    hud.title.textContent = isHigh ? 'Nytt rekord!' : state.wonBout && state.boutNo >= 3 ? 'Pokalen är din!' : 'Turneringen är slut';
    hud.text.textContent = isHigh
      ? 'Salens bästa klinga hittills. Salut!'
      : 'Masken av, handskarna i väskan. En match till?';
    hud.steps.hidden = true;
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng · rekord ${fmt(high)}</small>`;
    hud.start.textContent = 'Fäktas igen';
    hud.overlay.classList.add('show');
  }

  function startGame() {
    sfx.resume();
    state.score = 0;
    state.boutNo = 1;
    hud.score.textContent = '0';
    hud.scoreline.hidden = true;
    hud.steps.hidden = false;
    startBout();
  }

  /* ---- Combat resolution ----------------------------------------------- */

  function tipOf(fencer) {
    const v = new THREE.Vector3();
    fencer.userData.foilTip.getWorldPosition(v);
    return v;
  }

  function playerLunge(isFeint) {
    if (state.phase !== 'live' || me.pose === 'lunge' || me.pose === 'stagger') return;
    me.pose = isFeint ? 'feint' : 'lunge';
    me.t = 0;
    me.lungeLine = me.line;
    me.isFeint = isFeint;
    if (isFeint) sfx.feint();
    else sfx.swish();
  }

  function resolvePlayerAttack() {
    const tip = tipOf(player);
    if (me.isFeint) {
      // A feint commits to nothing — but a napping AI may bite
      if ((ai.pose === 'guard' || ai.pose === 'telegraph') && rand() < opp().parryP * 1.15) {
        ai.pose = 'bitten';
        ai.t = 0;
        glintMat.opacity = 0;
        callout('DEN GICK PÅ FINTEN!');
        sfx.clink();
        burst(tip.x, tip.y, tip.z, 8, 2.2);
      }
      return;
    }
    if (ai.pose === 'stagger' || ai.pose === 'bitten' || ai.pose === 'recover') {
      // Open target: riposte after a parry, punished recovery, or a bitten feint
      const riposte = ai.pose === 'stagger';
      const feintHit = ai.pose === 'bitten';
      burst(tip.x, tip.y, tip.z, 22, 3.4);
      scoreTouch(true, riposte ? 175 : feintHit ? 150 : 100,
        riposte ? 'RIPOST +175' : feintHit ? 'FINT-TUSCH +150' : '+100');
      return;
    }
    if (ai.pose === 'telegraph' || ai.pose === 'attack') {
      // Attacking into an attack: right of way belongs to them
      burst(tip.x, tip.y, tip.z, 10, 2);
      scoreTouch(false, 0);
      return;
    }
    // AI on guard: it may read and parry
    if (rand() < opp().parryP) {
      ai.pose = 'parry';
      ai.line = me.lungeLine;
      ai.t = 0;
      me.pose = 'stagger';
      me.t = 0;
      sfx.clink();
      sfx.stagger();
      kick(0.7, 50);
      burst(tip.x, tip.y, tip.z, 14, 3);
      // …and the better ones riposte
      if (rand() < opp().riposteP) {
        ai.pendingRiposte = true;
      }
    } else {
      burst(tip.x, tip.y, tip.z, 22, 3.4);
      scoreTouch(true, 100, '+100');
    }
  }

  function resolveAiAttack() {
    const tip = tipOf(foe);
    if (me.pose !== 'lunge' && me.pose !== 'stagger' && me.line === ai.line) {
      // Parried! The Nidhogg rule: same line blocks
      ai.pose = 'stagger';
      ai.t = 0;
      sfx.clink();
      kick(0.6, 60);
      addScore(25, tip, 'PARAD +25');
      callout('PARAD — RIPOSTERA!');
      burst(tip.x, tip.y, tip.z, 16, 3.2);
    } else {
      burst(tip.x, tip.y, tip.z, 18, 3);
      scoreTouch(false, 0);
    }
  }

  /* ---- AI -------------------------------------------------------------- */

  function updateAi(dt) {
    ai.t += dt;
    const o = opp();
    switch (ai.pose) {
      case 'guard': {
        ai.timer -= dt;
        // Drift the guard line around so the player has something to read
        if (rand() < dt * 0.7) ai.line = Math.floor(rand() * 3);
        if (ai.timer <= 0 && state.phase === 'live') {
          ai.pose = 'telegraph';
          ai.t = 0;
          ai.line = Math.floor(rand() * 3);
          ai.shownLine = ai.line;
          ai.willFeint = rand() < o.feintP;
        }
        if (ai.pendingRiposte && me.pose !== 'stagger') ai.pendingRiposte = false;
        break;
      }
      case 'telegraph': {
        if (ai.willFeint && ai.t > o.telegraph * 0.62 && ai.shownLine === ai.line) {
          // The switch: real attack moves to another line late
          let other = Math.floor(rand() * 3);
          while (other === ai.line) other = Math.floor(rand() * 3);
          ai.line = other;
          ai.shownLine = other;
          sfx.feint();
        }
        if (ai.t >= o.telegraph) {
          ai.pose = 'attack';
          ai.t = 0;
          ai.resolved = false;
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
          ai.line = Math.floor(rand() * 3);
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

  /* ---- Posing ---------------------------------------------------------- */

  const easeOut = (k) => 1 - (1 - k) ** 3;

  function poseFencer(fencer, who, t) {
    const u = fencer.userData;
    const facing = who === me ? 1 : -1;
    const baseX = who === me ? -1.9 : 1.9;
    const bounce = Math.sin(t * 3.2 + (who === me ? 0 : 2.1)) * 0.02;

    let lean = 0;
    let advance = 0;
    let armAngle = LINE_ANGLE[who.line ?? 1];
    let armReach = 0;

    const { pose } = who;
    const pt = who.t;

    if (pose === 'lunge' || pose === 'attack') {
      const k = easeOut(Math.min(1, pt / (who === me ? 0.24 : opp().attackDur)));
      advance = k * 1.35;
      lean = -k * 0.3;
      armAngle = LINE_ANGLE[who === me ? who.lungeLine : who.line];
      armReach = k * 0.34;
    } else if (pose === 'feint') {
      const k = Math.sin(Math.min(1, pt / 0.18) * Math.PI);
      advance = k * 0.4;
      armReach = k * 0.2;
      armAngle = LINE_ANGLE[who === me ? who.lungeLine : who.line];
    } else if (pose === 'recover') {
      const k = 1 - Math.min(1, pt / 0.5);
      advance = k * 0.5;
      lean = -k * 0.1;
    } else if (pose === 'stagger') {
      const k = Math.sin(Math.min(1, pt / 0.85) * Math.PI);
      advance = -k * 0.42;
      lean = k * 0.34;
      armAngle += k * 0.7;
    } else if (pose === 'parry') {
      const k = Math.sin(Math.min(1, pt / 0.3) * Math.PI);
      armAngle = LINE_ANGLE[who.line] + k * 0.25;
      advance = -k * 0.1;
    } else if (pose === 'bitten') {
      const k = Math.sin(Math.min(1, pt / 0.7) * Math.PI);
      armAngle = LINE_ANGLE[who.line] - k * 0.5;
      lean = k * 0.12;
    } else if (pose === 'telegraph') {
      const k = Math.min(1, pt / opp().telegraph);
      advance = k * 0.14;
      armAngle = LINE_ANGLE[who.shownLine ?? who.line] + Math.sin(k * Math.PI) * 0.12;
    }

    fencer.position.x = baseX + advance * facing;
    fencer.position.y = bounce * (pose === 'guard' ? 1 : 0.3);
    u.torso.rotation.z = (lean - 0.08) * facing;
    u.armF.rotation.z = armAngle * facing * (who === me ? 1 : 1);
    u.armF.position.x = 0.12 + armReach;
    u.headG.rotation.z = -lean * 0.4 * facing;

    // Legs mirror the lunge
    u.legF.rotation.z = (-0.35 - advance * 0.35) * facing;
    u.legB.rotation.z = (0.42 + advance * 0.28) * facing;
  }

  /* ---- Input ----------------------------------------------------------- */

  function setLine(i) {
    if (state.phase !== 'live' && state.phase !== 'ready') return;
    me.line = i;
    renderLine();
    sfx.step();
  }

  function onPointerDown(e) {
    sfx.resume();
    if (helpOpen || e.target.closest('.pb-overlay, .pb-mute, .pb-info, .pb-help, .cl-tool, .fk-line')) return;
    // Tapping the left screen edge thirds also sets the guard
    const rect = canvasHost.getBoundingClientRect();
    const fy = (e.clientY - rect.top) / rect.height;
    setLine(fy < 0.38 ? 0 : fy < 0.66 ? 1 : 2);
  }

  function onKeyDown(e) {
    const k = e.key;
    if (k === '?' || (k === 'Escape' && helpOpen)) {
      setHelp(k === '?' ? !helpOpen : false);
      return;
    }
    if (helpOpen) return;
    if (k === 'ArrowUp') setLine(Math.max(0, me.line - 1));
    else if (k === 'ArrowDown') setLine(Math.min(2, me.line + 1));
    else if (k === '1' || k === '2' || k === '3') setLine(Number(k) - 1);
    else if (k === ' ') {
      e.preventDefault();
      if (state.phase === 'idle' || state.phase === 'over') startGame();
      else playerLunge(false);
    } else if (k.toLowerCase() === 'f') playerLunge(true);
  }

  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
  }

  canvasHost.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);
  hud.start.addEventListener('click', nextStage);
  hud.lunge.addEventListener('click', () => playerLunge(false));
  hud.feint.addEventListener('click', () => playerLunge(true));
  hud.lineBtns.forEach((b) => b.addEventListener('click', () => setLine(Number(b.dataset.line))));
  hud.info.addEventListener('click', () => setHelp(!helpOpen));
  hud.helpClose.addEventListener('click', () => setHelp(false));
  hud.mute.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    hud.mute.classList.toggle('off', sfx.muted);
  });

  /* ---- Sizing ---------------------------------------------------------- */

  let baseFov = 46;
  let camDist = 8.2;

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const portrait = camera.aspect < 0.7;
    baseFov = portrait ? 58 : 46;
    // In portrait the horizontal field is what frames the duel — back off
    camDist = portrait ? 12.5 : 8.2;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Loop ------------------------------------------------------------ */

  let raf = 0;
  let last = performance.now();
  let running = true;
  const camGoal = new THREE.Vector3(0, 2.4, 8.6);
  const lookAt = new THREE.Vector3(0, 1.4, 0);
  const lookGoal = new THREE.Vector3(0, 1.4, 0);

  function tick(now) {
    raf = requestAnimationFrame(tick);
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!running) return;
    const t = now / 1000;

    if (hitStop > 0) {
      hitStop -= dt;
      dt *= 0.1;
    }

    if (!helpOpen) {
      if (state.phase === 'ready') {
        state.readyT += dt;
        const steps = ['EN GARDE', 'KLARA', 'KÖR!'];
        const stepAt = Math.floor(state.readyT / 0.7);
        if (stepAt > state.readyStep && stepAt < steps.length) {
          state.readyStep = stepAt;
          callout(steps[stepAt]);
          sfx.ready(stepAt);
        }
        if (state.readyT >= 2.1 - 0.7) {
          if (state.readyT >= 1.5) goLive();
        }
      } else if (state.phase === 'live') {
        updateAi(dt);
        // Player pose progression
        me.t += dt;
        if (me.pose === 'lunge' && me.t >= 0.24 && !me.resolved) {
          me.resolved = true;
          resolvePlayerAttack();
        }
        if (me.pose === 'lunge' && me.t >= 0.44) {
          me.pose = 'guard';
          me.resolved = false;
        }
        if (me.pose === 'feint' && me.t >= 0.18 && !me.resolved) {
          me.resolved = true;
          resolvePlayerAttack();
        }
        if (me.pose === 'feint' && me.t >= 0.3) {
          me.pose = 'guard';
          me.resolved = false;
        }
        if (me.pose === 'stagger' && me.t >= 0.7) {
          me.pose = 'guard';
        }
      } else if (state.phase === 'touchpause') {
        state.pauseT += dt;
        me.t += dt;
        ai.t += dt;
        if (state.pauseT >= 1.35) endTouchPause();
      }
    }

    /* Telegraph glint follows the AI blade */
    if (ai.pose === 'telegraph' && state.phase === 'live') {
      const k = ai.t / opp().telegraph;
      glintMat.opacity = 0.25 + Math.sin(k * Math.PI) * 0.55 + Math.sin(t * 22) * 0.1;
      glint.position.set(foe.position.x - 1.1, LINE_Y[ai.shownLine], 0.25);
      glint.scale.setScalar(0.5 + k * 0.5);
    } else {
      glintMat.opacity = Math.max(0, glintMat.opacity - dt * 6);
    }

    poseFencer(player, me, t);
    poseFencer(foe, ai, t);

    /* Crowd: idle sway, arms up while celebrating */
    salle.crowd.forEach((p, i) => {
      const cheer = state.celebration > 0 && state.phase === 'touchpause';
      const { arms } = p.userData;
      const target = cheer ? -2.2 : 2.4;
      arms.children[0].rotation.z += (-target - arms.children[0].rotation.z) * Math.min(1, dt * 8);
      arms.children[1].rotation.z += (target - arms.children[1].rotation.z) * Math.min(1, dt * 8);
      p.position.y = cheer ? Math.abs(Math.sin(t * 8 + i)) * 0.12 : 0;
      p.rotation.z = Math.sin(t * 1.1 + p.userData.phase) * 0.03;
    });

    /* Sparks */
    let alive = false;
    for (let i = 0; i < sparkCount; i++) {
      const s = sparkVel[i];
      if (s.life <= 0) continue;
      alive = true;
      s.life -= dt;
      s.vy -= 6 * dt;
      sparkPos[i * 3] += s.vx * dt;
      sparkPos[i * 3 + 1] += s.vy * dt;
      sparkPos[i * 3 + 2] += s.vz * dt;
      if (s.life <= 0) sparkPos[i * 3 + 1] = -99;
    }
    if (alive) sparkGeo.attributes.position.needsUpdate = true;

    /* Camera */
    if (state.phase === 'idle' || state.phase === 'over' || state.phase === 'boutend') {
      camGoal.set(Math.sin(t * 0.09) * 1.2, 2.6, camDist * 1.15);
      lookGoal.set(0, 1.8, 0);
    } else if (state.phase === 'touchpause') {
      camGoal.set((player.position.x + foe.position.x) / 2, 1.75, camDist * 0.82);
      lookGoal.set((player.position.x + foe.position.x) / 2, 1.45, 0);
    } else {
      camGoal.set((player.position.x + foe.position.x) / 2 * 0.6, 2.1, camDist);
      lookGoal.set(0, 1.65, 0);
    }
    camera.position.lerp(camGoal, Math.min(1, dt * 3));
    lookAt.lerp(lookGoal, Math.min(1, dt * 4));
    if (shake.power > 0.001) {
      shake.power = Math.max(0, shake.power - dt * 4);
      camera.position.x += (rand() - 0.5) * shake.power * 0.2;
      camera.position.y += (rand() - 0.5) * shake.power * 0.2;
    }
    camera.lookAt(lookAt);

    renderer.render(scene, camera);
  }

  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);

  renderTouches();
  renderBout();
  renderLine();
  hud.overlay.classList.add('show');

  /* Deterministic hooks for automated tests */
  window.__ppFakt = {
    state,
    me,
    ai,
    startGame,
    nextStage,
    setLine,
    playerLunge,
    forceTouch(mine = true) {
      if (state.phase === 'live') scoreTouch(mine, mine ? 100 : 0, '+100');
    },
    aiAttackNow(line = 1) {
      if (state.phase === 'live' && ai.pose === 'guard') {
        ai.pose = 'telegraph';
        ai.t = opp().telegraph - 0.01;
        ai.line = line;
        ai.shownLine = line;
        ai.willFeint = false;
      }
    },
    openAi() {
      ai.pose = 'stagger';
      ai.t = 0;
    },
    goLive() {
      if (state.phase === 'ready') goLive();
    },
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
    window.removeEventListener('keydown', onKeyDown);
    clearTimeout(state.lastToast);
    delete window.__ppFakt;

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

export default createFencing;
export { OPPONENTS };
