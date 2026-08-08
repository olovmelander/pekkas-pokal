/**
 * Pekkas Pingis — the 2019 competition as a Three.js table tennis game.
 *
 * The design triangulates from the best of the genre:
 *
 *  - Table Tennis Touch, the mobile gold standard: the paddle follows the
 *    finger and the FLICK at the moment of contact is the shot — flick up
 *    for a topspin drive, down for a backspin push, sideways to place it.
 *  - Rockstar's Table Tennis: readability above all, and rallies that
 *    build value the longer they run.
 *  - Eleven VR: the physics are the soul. The ball here flies with drag
 *    and Magnus lift, topspin kicks forward off the bounce, backspin
 *    checks, and the net is a real object with a tape dribble.
 *
 * A match goes to 7 (win by 2 — kvällens husregel i Bredbyn). Three
 * matches against the actual 2019 podium — Henrik (brons), Rickard
 * (silver) and Viktor Jones (mästaren) — make the tournament.
 */

import * as THREE from 'three';
import { Sfx } from './audio.js';
import { mulberry, glowTexture, buildHall, buildPlayer, buildPaddle, TABLE } from './hall.js';

const HIGHSCORE_KEY = 'pp-pingis-highscore';
const POINTS_TO_WIN = 7;

const T = TABLE;
const HITZ = T.length / 2 + 0.11; // the hit plane, just off each end
const REACH = 0.44;
const GRAV = 9.4;

const OPPONENTS = [
  {
    name: 'Henrik Lundqvist',
    title: 'Bronsracketen',
    shirt: 0x4f8a4a,
    speed: 1.5,
    err: 0.3,
    missP: 0.17,
    aggro: 0.15,
    smashP: 0.12,
    serveSpin: 0.3,
    taunt: 'Henrik spelar säkert — långa, lugna bollar.'
  },
  {
    name: 'Rickard Nilsson',
    title: 'Silverloopen',
    shirt: 0x3e6e9e,
    speed: 2.0,
    err: 0.19,
    missP: 0.1,
    aggro: 0.48,
    smashP: 0.32,
    serveSpin: 0.7,
    taunt: 'Rickard loopar — och smashar allt som studsar högt.'
  },
  {
    name: 'Viktor Jones',
    title: 'Mästaren av 2019',
    shirt: 0xc9982e,
    speed: 2.6,
    err: 0.11,
    missP: 0.05,
    aggro: 0.72,
    smashP: 0.55,
    serveSpin: 1,
    taunt: 'Viktor Jones. Mästaren. Serverna skruvar.'
  }
];

/**
 * Frame delta, clamped at BOTH ends. Only clamping the top looks harmless
 * until a queued rAF fires with a timestamp older than the one stashed on
 * visibilitychange: dt goes negative, and every `x -= rate * dt` in the
 * loop starts running backwards.
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
          <div class="pb-score" id="pg-score">0</div>
          <div class="pb-hi">REKORD <span id="pg-hi">0</span></div>
        </div>
        <div class="pb-meta">
          <div class="fk-touches" id="pg-pts"></div>
          <div class="fg-cast" id="pg-match"></div>
        </div>
      </div>
      <div class="fk-opponent" id="pg-opponent"></div>
      <div class="fg-zone" id="pg-callout"></div>
      <div class="fg-phase" id="pg-phase"></div>
      <div class="pb-toast" id="pg-toast"></div>
      <div class="fg-pops" id="pg-pops"></div>
    </div>

    <div class="pb-overlay" id="pg-overlay">
      <div class="pb-panel">
        <h2 id="pg-title">Pekkas Pingis</h2>
        <p id="pg-text">Bygdegården i Bredbyn, 2019. Tre motståndare står mellan dig och pokalen — först till 7 vinner varje match.</p>
        <ul class="fg-steps" id="pg-steps">
          <li><i style="--c:#7fd8e8"></i><b>Flytta</b> Dra med fingret — racketen följer dig längs bordet.</li>
          <li><i style="--c:#f2c14e"></i><b>Skruva</b> Flicka UPPÅT i träffen för topspin-drive, NEDÅT för backspin.</li>
          <li><i style="--c:#5eead4"></i><b>Placera</b> Flicka åt sidan för att styra bollen ut i hörnen.</li>
        </ul>
        <div class="pb-scoreline" id="pg-scoreline" hidden></div>
        <div class="fg-catchlist" id="pg-verdict" hidden></div>
        <button class="pb-btn" id="pg-start">Serva!</button>
      </div>
    </div>

    <button class="pb-info" id="pg-info" aria-label="Så spelar du">?</button>

    <div class="pb-help" id="pg-help" hidden>
      <div class="pb-help-card">
        <h3>Så spelar du pingis</h3>
        <p class="pb-help-sub">Pekkas Pingis · Bredbyn 2019</p>
        <ul class="pb-help-list">
          <li><i style="--c:#7fd8e8"></i><b>Racketen</b> Följer fingret (eller ←/→). Möt bollen — träffar du inte är poängen borta.</li>
          <li><i style="--c:#f2c14e"></i><b>Topspin</b> Flicka uppåt i träffögonblicket: hårdare boll som dyker och sparkar framåt i studsen.</li>
          <li><i style="--c:#a78bfa"></i><b>Backspin</b> Flicka nedåt: långsam boll som bromsar i studsen och är svår att smasha.</li>
          <li><i style="--c:#5eead4"></i><b>Placering</b> Sidledsflick styr bollen mot hörnen — bort från motståndarens racket.</li>
          <li><i style="--c:#f26d8d"></i><b>Risken</b> Ju hårdare flick, desto större chans att bollen går i nät eller utanför.</li>
          <li><i style="--c:#ffd166"></i><b>Serven</b> Din serve: dra och släpp. Bollen måste studsa på din sida först — precis som på riktigt.</li>
        </ul>
        <p class="pb-help-tip">Långa dueller lönar sig: varje slag i rallyt höjer poängen du får när du vinner det. Smash-avslut och serve-ess ger extra.</p>
        <div class="pb-help-keys">←/→ flyttar · håll ↑ = topspin, ↓ = backspin · mellanslag servar</div>
        <button class="pb-btn" id="pg-help-close">Tillbaka till bordet</button>
      </div>
    </div>

    <button class="pb-mute" id="pg-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  return {
    score: q('#pg-score'), hi: q('#pg-hi'), pts: q('#pg-pts'), match: q('#pg-match'),
    opponent: q('#pg-opponent'), callout: q('#pg-callout'), phase: q('#pg-phase'),
    toast: q('#pg-toast'), pops: q('#pg-pops'),
    overlay: q('#pg-overlay'), title: q('#pg-title'), text: q('#pg-text'), steps: q('#pg-steps'),
    scoreline: q('#pg-scoreline'), verdict: q('#pg-verdict'), start: q('#pg-start'),
    info: q('#pg-info'), help: q('#pg-help'), helpClose: q('#pg-help-close'), mute: q('#pg-mute')
  };
}

/* ------------------------------------------------------------------- game */

export async function createPingis(container) {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui fg-ui';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost);

  const sfx = new Sfx();
  const rand = mulberry(2019);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120f0a);
  scene.fog = new THREE.Fog(0x151109, 9, 20);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 40);
  camera.position.set(0, 2.3, 3.8);
  const lookAt = new THREE.Vector3(0, 0.72, -0.9);
  camera.lookAt(lookAt);

  /* Lights — hierarchy: hemisphere fill, one casting key, lamp accents */
  scene.add(new THREE.HemisphereLight(0x9aa8c8, 0x241a10, 0.5));

  const key = new THREE.DirectionalLight(0xffe2b0, 1.9);
  key.position.set(1.6, 5.4, 2.4);
  key.target.position.set(0, 0.7, -0.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3.4;
  key.shadow.camera.right = 3.4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 14;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.015;
  scene.add(key, key.target);

  // The pendants: warm pools over the table. At this scale (metres, lamps
  // ~1.9 m up) candela in single digits already reads — no LAMP multiplier.
  [-1.05, 0, 1.05].forEach((z) => {
    const lamp = new THREE.PointLight(0xffc98e, 7.5, 8, 2);
    lamp.position.set(0, 2.9, z);
    scene.add(lamp);
  });

  /* World */
  const glow = glowTexture();
  const hall = buildHall(glow);
  scene.add(hall.group);

  /* Opponent figure across the table */
  let foe = null;
  const foeRefs = { current: null };
  function spawnFoe(idx) {
    if (foe) scene.remove(foe.group);
    foe = buildPlayer(OPPONENTS[idx].shirt);
    foe.group.position.set(0, 0, -HITZ - 0.55);
    foe.group.rotation.y = Math.PI;
    foe.group.scale.setScalar(1.3); // human-tall against the 76 cm table
    foe.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    scene.add(foe.group);
    foeRefs.current = foe.refs;
  }
  spawnFoe(0);

  /* The player's paddle, floating at the bottom of the frame */
  const myPaddle = buildPaddle();
  myPaddle.position.set(0, T.height + 0.18, HITZ);
  myPaddle.rotation.x = -0.4;
  myPaddle.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  scene.add(myPaddle);

  /* The ball, its contact shadow and its trail */
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.023, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff8ee, roughness: 0.35, metalness: 0, emissive: 0x554a33, emissiveIntensity: 0.35 })
  );
  ball.castShadow = true;
  scene.add(ball);

  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glow, color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false
    })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 2;
  scene.add(blob);

  const TRAIL_N = 10;
  const trail = [];
  for (let i = 0; i < TRAIL_N; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xffe8c0, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    s.scale.setScalar(0.05);
    scene.add(s);
    trail.push(s);
  }
  let trailIdx = 0;

  /* ---- State ----------------------------------------------------------- */

  const state = {
    phase: 'idle', // idle | serve | rally | point | matchend | over
    matchNo: 1,
    score: 0,
    myPts: 0,
    aiPts: 0,
    serves: 0, // total points played, for serve alternation
    rallyHits: 0,
    aiTouched: false,
    pointT: 0,
    serveT: 0,
    lastToast: 0
  };

  const b = {
    pos: new THREE.Vector3(0, 1, HITZ),
    vel: new THREE.Vector3(),
    st: 0, // topspin (+) / backspin (−), relative to direction of travel
    ss: 0, // sidespin
    live: false,
    lastHitter: null, // 'me' | 'ai'
    bounces: 0, // bounces on the receiver's side since the last hit
    serving: false, // the serve is allowed (expected) to bounce own side
    floorBounces: 0,
    smash: false
  };

  const me = { x: 0, dragVX: 0, dragVY: 0, swing: 0 };
  const ai = { x: 0, targetX: 0, swing: 0, serveTimer: 0 };

  let high = 0;
  try {
    high = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
  } catch (e) {
    high = 0;
  }
  const fmt = (n) => Math.round(n).toLocaleString('sv-SE');
  hud.hi.textContent = fmt(high);

  const opp = () => OPPONENTS[state.matchNo - 1];
  const myServe = () => Math.floor(state.serves / 2) % 2 === 0;

  let fovPunch = 0;
  let shakeT = 0;

  /* ---- HUD helpers ----------------------------------------------------- */

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

  function callout(txt) {
    hud.callout.textContent = txt;
    hud.callout.classList.remove('show');
    void hud.callout.offsetWidth;
    hud.callout.classList.add('show');
  }

  const projected = new THREE.Vector3();
  function popScore(text, world) {
    projected.copy(world).project(camera);
    if (projected.z > 1) return;
    const el = document.createElement('div');
    el.className = 'fg-pop';
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

  function renderPts() {
    const serveMark = myServe() ? ['●', ''] : ['', '●'];
    hud.pts.innerHTML =
      `<span><b>${state.myPts}</b> DU ${serveMark[0]}</span>` +
      `<span><i>${state.aiPts}</i> ${opp().name.split(' ')[0].toUpperCase()} ${serveMark[1]}</span>`;
    hud.match.textContent = `MATCH ${state.matchNo}/3`;
    paintScoreboard();
  }

  function paintScoreboard() {
    const { ctx, canvas, tex } = hall.refs.scoreboard;
    ctx.fillStyle = '#171b14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(242,193,78,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(235,240,250,0.75)';
    ctx.font = '700 17px Inter, sans-serif';
    ctx.fillText('PEKKAS POKAL · PINGIS 2019', canvas.width / 2, 30);
    ctx.font = '700 52px "Space Grotesk", Inter, sans-serif';
    ctx.fillStyle = '#f2c14e';
    ctx.fillText(`${state.myPts}  –  ${state.aiPts}`, canvas.width / 2, 84);
    ctx.font = '700 15px Inter, sans-serif';
    ctx.fillStyle = 'rgba(235,240,250,0.55)';
    ctx.fillText(`DU mot ${opp().name.toUpperCase()}`, canvas.width / 2, 112);
    tex.needsUpdate = true;
  }

  /* ---- Ball flight ------------------------------------------------------ */

  function resetBallForServe() {
    b.live = false;
    b.vel.set(0, 0, 0);
    b.st = 0;
    b.ss = 0;
    b.bounces = 0;
    b.floorBounces = 0;
    b.smash = false;
    if (myServe()) {
      b.pos.set(me.x, T.height + 0.32, HITZ - 0.05);
    } else {
      b.pos.set(ai.x, T.height + 0.32, -HITZ + 0.05);
    }
  }

  /**
   * The shot solver every hit goes through: pick a landing point and a
   * flight time, and the velocity follows. Guessable, tunable, and the
   * Magnus term then bends it just enough to feel alive.
   */
  function strike(hitter, from, land, flightT, spin, side, smash = false) {
    b.pos.copy(from);
    b.vel.set(
      (land.x - from.x) / flightT,
      (T.height + 0.02 - from.y + 0.5 * GRAV * flightT * flightT) / flightT,
      (land.z - from.z) / flightT
    );
    b.st = spin;
    b.ss = side;
    b.live = true;
    b.lastHitter = hitter;
    b.bounces = 0;
    b.smash = smash;
    state.rallyHits++;
  }

  function scorePoint(mine, why) {
    if (state.phase !== 'rally' && state.phase !== 'serve') return;
    state.phase = 'point';
    state.pointT = 0;
    b.live = false;
    state.serves++;
    if (mine) {
      state.myPts++;
      const ace = !state.aiTouched && b.lastHitter === 'me' && state.rallyHits <= 1;
      let pts = 100 + Math.max(0, state.rallyHits - 1) * 40;
      let label = `+${fmt(pts)}`;
      if (b.smash) {
        pts += 150;
        label = `SMASH +${fmt(pts)}`;
      }
      if (ace) {
        pts += 250;
        label = `ESS! +${fmt(pts)}`;
      }
      addScore(pts, ball.position, label);
      sfx.point();
      callout(why || 'DIN POÄNG');
    } else {
      state.aiPts++;
      sfx.lost();
      callout(why || `POÄNG ${opp().name.split(' ')[0].toUpperCase()}`);
    }
    renderPts();

    const lead = Math.max(state.myPts, state.aiPts);
    const diff = Math.abs(state.myPts - state.aiPts);
    if (lead >= POINTS_TO_WIN && diff >= 2) {
      setTimeout(() => endMatch(state.myPts > state.aiPts), 900);
    }
  }

  function endMatch(won) {
    if (state.phase === 'matchend' || state.phase === 'over') return;
    state.phase = 'matchend';
    if (won) {
      const bonus = 1000 * state.matchNo + (POINTS_TO_WIN - state.aiPts) * 100;
      addScore(bonus, null);
      sfx.fanfare();
      if (state.matchNo >= 3) {
        addScore(3000, null);
        gameOver(true);
        return;
      }
      hud.title.textContent = `${state.myPts}–${state.aiPts} mot ${opp().name.split(' ')[0]}!`;
      state.matchNo++;
      hud.text.textContent = `+${fmt(bonus)} poäng. Nästa: ${opp().name} — ${opp().title}. ${opp().taunt}`;
      spawnFoe(state.matchNo - 1);
      hud.start.textContent = `Möt ${opp().name.split(' ')[0]}!`;
    } else {
      sfx.applause();
      gameOver(false);
      return;
    }
    state.myPts = 0;
    state.aiPts = 0;
    state.serves = 0;
    renderPts();
    hud.steps.hidden = true;
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng hittills</small>`;
    hud.verdict.hidden = true;
    hud.overlay.classList.add('show');
  }

  function gameOver(champion) {
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
    hud.title.textContent = champion
      ? 'MÄSTARE AV BREDBYN!'
      : `${opp().name.split(' ')[0]} vann matchen`;
    hud.text.textContent = champion
      ? 'Du slog hela 2019 års pall. Pokalen — och sista kanelbullen — är din.'
      : isHigh
        ? 'Nytt rekord ändå! Fika, sen tar vi en match till?'
        : 'Turneringen är slut. En match till? Kaffet är fortfarande varmt.';
    hud.steps.hidden = true;
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng · rekord ${fmt(high)}</small>`;
    hud.verdict.hidden = false;
    hud.verdict.innerHTML = champion
      ? '<b>🏆 Alla tre matcher vunna</b><span>precis som Viktor 2019</span>'
      : `<b>Föll i match ${state.matchNo}</b><span>mot ${opp().name}</span>`;
    hud.start.textContent = 'Spela igen';
    hud.overlay.classList.add('show');
  }

  /* ---- Serving ---------------------------------------------------------- */

  function beginPoint() {
    state.phase = 'serve';
    state.rallyHits = 0;
    state.aiTouched = false;
    state.serveT = 0;
    ai.serveTimer = 1 + rand() * 0.8;
    resetBallForServe();
    renderPts();
    setPhaseLabel(myServe() ? 'DIN SERVE — dra och släpp' : `${opp().name.split(' ')[0]} servar…`);
  }

  function playerServe() {
    if (state.phase !== 'serve' || !myServe()) return;
    sfx.toss();
    const power = Math.min(1, 0.4 + Math.hypot(me.dragVX, me.dragVY) * 0.16);
    const spin = THREE.MathUtils.clamp(-me.dragVY * 0.34, -0.9, 0.9);
    const side = THREE.MathUtils.clamp(me.dragVX * 0.2, -0.8, 0.8);
    // A real serve bounces the server's side first: land it short of the net
    strike('me', new THREE.Vector3(me.x, T.height + 0.34, HITZ - 0.05),
      { x: me.x * 0.6 + side * 0.2, z: T.length * 0.24 },
      0.34 - power * 0.06, spin * 0.7, side, false);
    b.serving = true;
    state.phase = 'rally';
    setPhaseLabel('');
    sfx.paddle(power);
    me.swing = 1;
  }

  function aiServe() {
    const o = opp();
    sfx.toss();
    const side = (rand() - 0.5) * 1.4 * o.serveSpin;
    const spin = (rand() < 0.55 ? 1 : -0.7) * (0.3 + rand() * 0.5) * o.serveSpin;
    strike('ai', new THREE.Vector3(ai.x, T.height + 0.34, -HITZ + 0.05),
      { x: (rand() - 0.5) * 1.1, z: -T.length * 0.24 },
      0.36, spin, side, false);
    b.serving = true;
    state.phase = 'rally';
    setPhaseLabel('');
    sfx.paddle(0.5);
    ai.swing = 1;
  }

  /* ---- Hitting ---------------------------------------------------------- */

  function playerHit() {
    const dx = b.pos.x - me.x;
    if (Math.abs(dx) > REACH || b.pos.y < 0.45 || b.pos.y > 1.9) {
      return false; // whiffed — the ball sails past
    }
    const flickY = -me.dragVY; // finger up = positive = topspin
    const flickX = me.dragVX;
    const power = THREE.MathUtils.clamp(0.42 + Math.abs(flickY) * 0.12 + Math.abs(flickX) * 0.05, 0.42, 1);
    const spin = THREE.MathUtils.clamp(flickY * 0.3, -1, 1);
    const side = THREE.MathUtils.clamp(flickX * 0.16, -1, 1);

    // Risk: off-centre contact and violence both push the landing point
    const err = (Math.abs(dx) / REACH) ** 2 * 0.5 + Math.max(0, power - 0.75) * 0.9;
    const spread = err * (rand() - 0.5) * 2;

    // Topspin dives: it may be hit faster and still land. Backspin floats.
    const flightT = spin > 0 ? 0.5 - power * 0.13 : 0.62 - power * 0.1;
    const landZ = -(T.length * (0.18 + power * 0.26) + spread * 0.9);
    const landX = THREE.MathUtils.clamp(
      side * 0.85 + b.pos.x * 0.25 + spread * 0.6,
      -T.width * 0.7, T.width * 0.7
    );
    const smash = b.pos.y > 1.1 && power > 0.8 && spin >= 0;
    strike('me', b.pos.clone(), { x: landX, z: landZ }, smash ? flightT * 0.72 : flightT,
      spin, side, smash);
    if (smash) {
      sfx.smash();
      fovPunch = 5;
    } else {
      sfx.paddle(power);
    }
    me.swing = 1;
    return true;
  }

  function aiHit() {
    const o = opp();
    const dx = b.pos.x - ai.x;
    if (Math.abs(dx) > REACH + 0.06) {
      return false; // out of reach — clean winner for the player
    }
    state.aiTouched = true;
    // Unforced errors: the roll shrinks as the AI gets better
    const blunder = rand() < o.missP;
    const spread = (rand() - 0.5) * 2 * o.err + (blunder ? (rand() < 0.5 ? -0.9 : 0.9) : 0);

    const high2 = b.pos.y > 1.08 && Math.abs(b.vel.z) < 6.5;
    const smash = high2 && rand() < o.smashP;
    const loop = rand() < o.aggro;
    const spin = smash ? 0.4 : loop ? 0.5 + rand() * 0.5 : (rand() < 0.3 ? -0.5 : 0.15);
    const flightT = smash ? 0.34 : loop ? 0.48 : 0.62;
    // Aim away from the player's paddle, more so the better they are
    const away = me.x > 0 ? -1 : 1;
    const landX = THREE.MathUtils.clamp(
      away * (0.2 + rand() * 0.45) * (1 + o.aggro) * 0.55 + spread,
      -T.width * 0.62, T.width * 0.62
    );
    const landZ = T.length * (smash ? 0.42 : 0.24 + rand() * 0.16) + spread * 0.5;
    strike('ai', b.pos.clone(), { x: landX, z: landZ }, flightT, spin,
      (rand() - 0.5) * o.serveSpin, smash);
    if (smash) {
      sfx.smash();
      shakeT = 0.3;
    } else {
      sfx.paddle(loop ? 0.75 : 0.45);
    }
    ai.swing = 1;
    return true;
  }

  /* ---- Physics tick ----------------------------------------------------- */

  function stepBall(dt) {
    if (!b.live) return;

    // Drag and Magnus. Topspin (st>0) pulls the ball down mid-flight and
    // kicks it forward off the bounce; backspin floats and checks.
    const sp = Math.abs(b.vel.z);
    b.vel.y -= GRAV * dt;
    b.vel.y -= b.st * sp * 0.55 * dt;
    b.vel.x += b.ss * sp * 0.4 * dt * Math.sign(-b.vel.z);
    b.vel.multiplyScalar(1 - 0.06 * dt);
    b.pos.addScaledVector(b.vel, dt);

    /* Net */
    const prevZ = b.pos.z - b.vel.z * dt;
    if (prevZ * b.pos.z <= 0 && Math.abs(b.pos.x) < T.width / 2 + 0.16) {
      const netTop = T.height + T.netH;
      if (b.pos.y < netTop) {
        if (b.pos.y > netTop - 0.03) {
          // Tape dribble: the ball crawls over
          b.vel.z *= 0.4;
          b.vel.y = Math.max(b.vel.y, 0.4);
          sfx.net();
        } else {
          b.pos.z = prevZ > 0 ? 0.02 : -0.02;
          b.vel.z *= -0.16;
          b.vel.x *= 0.5;
          b.st = 0;
          b.ss = 0;
          sfx.net();
        }
      }
    }

    /* Table bounce */
    if (b.vel.y < 0 && b.pos.y <= T.height + 0.023 &&
        Math.abs(b.pos.x) < T.width / 2 + 0.02 && Math.abs(b.pos.z) < T.length / 2 + 0.02) {
      b.pos.y = T.height + 0.023;
      b.vel.y = -b.vel.y * 0.86;
      // Spin acts in the bounce: topspin kicks the ball onward, backspin checks
      b.vel.z *= 1 + b.st * 0.22;
      b.vel.x += b.ss * Math.abs(b.vel.z) * 0.16 * Math.sign(-b.vel.z);
      b.st *= 0.5;
      b.ss *= 0.55;
      sfx.bounce();

      const onAiSide = b.pos.z < 0;
      const receiverSide = b.lastHitter === 'me' ? onAiSide : !onAiSide;
      if (b.serving && !receiverSide) {
        // The serve's own-side bounce — legal, once
        b.serving = false;
      } else if (receiverSide) {
        b.bounces++;
        if (b.bounces >= 2) {
          scorePoint(b.lastHitter === 'me', b.lastHitter === 'me' ? 'DUBBELSTUDS!' : '');
        }
      } else {
        // Bounced back on the hitter's own side: their fault
        scorePoint(b.lastHitter !== 'me');
      }
    }

    /* Floor */
    if (b.pos.y < 0.03 && b.vel.y < 0) {
      b.pos.y = 0.03;
      b.vel.y = -b.vel.y * 0.5;
      b.vel.x *= 0.8;
      b.vel.z *= 0.8;
      b.floorBounces++;
      sfx.floor(0.3 / b.floorBounces);
      if (b.floorBounces === 1) {
        // Rally over: table bounce first = winner, no table bounce = fault
        if (b.bounces >= 1) scorePoint(b.lastHitter === 'me');
        else scorePoint(b.lastHitter !== 'me', b.lastHitter === 'me' ? 'UT!' : 'UT — din poäng');
      }
      if (b.floorBounces > 4) b.live = false;
    }

    /* Hit planes. A whiff just lets the ball sail past — the floor rule
       scores it when it lands. */
    if (b.vel.z > 0 && prevZ < HITZ && b.pos.z >= HITZ && state.phase === 'rally' && b.floorBounces === 0) {
      playerHit();
    }
    if (b.vel.z < 0 && prevZ > -HITZ && b.pos.z <= -HITZ && state.phase === 'rally' && b.floorBounces === 0) {
      aiHit();
    }
  }

  /* ---- Input ------------------------------------------------------------ */

  let dragging = false;
  let helpOpen = false;
  let lastPX = 0;
  let lastPY = 0;
  let lastPT = 0;
  const keys = { left: false, right: false, up: false, down: false };

  function pointerX(e) {
    const rect = canvasHost.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * 2 - 1;
  }

  function onPointerDown(e) {
    sfx.resume();
    if (helpOpen || e.target.closest('.pb-overlay, .pb-mute, .pb-info, .pb-help')) return;
    dragging = true;
    lastPX = e.clientX;
    lastPY = e.clientY;
    lastPT = performance.now();
    me.x = THREE.MathUtils.clamp(pointerX(e) * 1.2, -1.15, 1.15);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(8, now - lastPT) / 1000;
    // Flick velocity in "screen heights per second", smoothed
    const rect = canvasHost.getBoundingClientRect();
    const vx = (e.clientX - lastPX) / rect.width / dt;
    const vy = (e.clientY - lastPY) / rect.height / dt;
    me.dragVX = me.dragVX * 0.6 + vx * 0.4;
    me.dragVY = me.dragVY * 0.6 + vy * 0.4;
    lastPX = e.clientX;
    lastPY = e.clientY;
    lastPT = now;
    me.x = THREE.MathUtils.clamp(pointerX(e) * 1.2, -1.15, 1.15);
  }

  function onPointerUp() {
    if (dragging && state.phase === 'serve' && myServe()) playerServe();
    dragging = false;
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
    else if (e.key === 'ArrowUp' || e.key === 'w') keys.up = true;
    else if (e.key === 'ArrowDown' || e.key === 's') keys.down = true;
    else if (e.key === ' ') {
      e.preventDefault();
      sfx.resume();
      if (state.phase === 'serve' && myServe()) {
        me.dragVY = keys.up ? -3 : keys.down ? 3 : -1;
        me.dragVX = 0;
        playerServe();
      } else if (state.phase === 'idle' || state.phase === 'matchend' || state.phase === 'over') {
        startGame();
      }
    } else if (e.key === '?' || (e.key === 'Escape' && helpOpen)) {
      setHelp(!helpOpen);
    }
  }

  function onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
    else if (e.key === 'ArrowUp' || e.key === 'w') keys.up = false;
    else if (e.key === 'ArrowDown' || e.key === 's') keys.down = false;
  }

  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
  }

  /* ---- Flow ------------------------------------------------------------- */

  function startGame() {
    sfx.resume();
    if (state.phase === 'matchend') {
      hud.overlay.classList.remove('show');
      state.phase = 'idle';
      hud.opponent.textContent = `${opp().name} · ${opp().title}`;
      toast(opp().taunt, true);
      setTimeout(beginPoint, 700);
      return;
    }
    state.matchNo = 1;
    state.score = 0;
    state.myPts = 0;
    state.aiPts = 0;
    state.serves = 0;
    hud.score.textContent = '0';
    spawnFoe(0);
    hud.overlay.classList.remove('show');
    hud.steps.hidden = false;
    hud.scoreline.hidden = true;
    hud.verdict.hidden = true;
    hud.opponent.textContent = `${opp().name} · ${opp().title}`;
    toast(opp().taunt, true);
    renderPts();
    setTimeout(beginPoint, 700);
  }

  hud.start.addEventListener('click', startGame);
  hud.info.addEventListener('click', () => setHelp(true));
  hud.helpClose.addEventListener('click', () => setHelp(false));
  hud.mute.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    hud.mute.classList.toggle('off', sfx.muted);
  });
  canvasHost.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  /* ---- Resize ----------------------------------------------------------- */

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens need a wider lens to keep the whole table in frame
    camera.fov = camera.aspect < 0.62 ? 58 : 50;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Loop ------------------------------------------------------------- */

  let raf = 0;
  let last = performance.now();
  let running = true;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = clampDt(now - last);
    last = now;
    if (!running) return;
    const t = now / 1000;

    if (!helpOpen) {
      /* Keyboard paddle */
      if (keys.left) me.x = Math.max(-1.15, me.x - 2.6 * dt);
      if (keys.right) me.x = Math.min(1.15, me.x + 2.6 * dt);
      if (!dragging) {
        // Keyboard spin: held arrows stand in for the flick
        me.dragVY = keys.up ? -2.6 : keys.down ? 2.6 : me.dragVY * (1 - 6 * dt);
        if (!keys.up && !keys.down) me.dragVX *= 1 - 6 * dt;
      } else {
        // Flick velocity decays so an old gesture does not spin a later shot
        me.dragVX *= 1 - 2.4 * dt;
        me.dragVY *= 1 - 2.4 * dt;
      }

      /* Serve timing */
      if (state.phase === 'serve') {
        state.serveT += dt;
        if (!myServe()) {
          ai.serveTimer -= dt;
          if (ai.serveTimer <= 0) aiServe();
        } else if (b.live === false) {
          // The waiting ball hovers over the paddle
          b.pos.x += (me.x - b.pos.x) * Math.min(1, dt * 14);
          b.pos.y = T.height + 0.32 + Math.sin(t * 3) * 0.012;
        }
      }

      if (state.phase === 'point') {
        state.pointT += dt;
        if (state.pointT > 1.15 && state.phase === 'point') beginPoint();
      }

      /* AI movement: chase the ball when it is coming, drift home when not */
      const o = opp();
      const incoming = b.live && b.vel.z < 0;
      ai.targetX = incoming
        ? b.pos.x + b.vel.x * Math.max(0, (-HITZ - b.pos.z) / Math.max(0.1, -b.vel.z)) * 0.85
        : 0;
      ai.targetX = THREE.MathUtils.clamp(ai.targetX, -1.15, 1.15);
      const dxA = ai.targetX - ai.x;
      const maxStep = o.speed * dt;
      ai.x += THREE.MathUtils.clamp(dxA, -maxStep, maxStep);

      stepBall(dt);
    }

    /* Meshes */
    myPaddle.position.x = me.x;
    myPaddle.position.y = T.height + 0.18 + Math.sin(t * 2.1) * 0.008;
    myPaddle.rotation.z = THREE.MathUtils.clamp(-me.dragVX * 0.12, -0.5, 0.5);
    if (me.swing > 0) {
      me.swing = Math.max(0, me.swing - dt * 5);
      myPaddle.rotation.x = -0.4 - Math.sin(me.swing * Math.PI) * 0.8;
    } else {
      myPaddle.rotation.x = -0.4;
    }

    if (foe) {
      foe.group.position.x += (ai.x - foe.group.position.x) * Math.min(1, dt * 10);
      foe.group.position.y = Math.abs(ai.x - foe.group.position.x) > 0.02
        ? Math.abs(Math.sin(t * 9)) * 0.02
        : 0;
      const fr = foeRefs.current;
      // Paddle arm out to the side so the racket reads in silhouette
      fr.armR.rotation.z = -0.72;
      if (ai.swing > 0) {
        ai.swing = Math.max(0, ai.swing - dt * 4.5);
        fr.armR.rotation.x = -0.7 - Math.sin(ai.swing * Math.PI) * 1.3;
      } else {
        // Ready position: paddle up over the table, not hanging by the hip
        fr.armR.rotation.x = -0.7 + Math.sin(t * 1.7) * 0.08;
      }
      fr.armL.rotation.x = Math.sin(t * 1.7 + 1) * 0.05;
      fr.head.rotation.y = THREE.MathUtils.clamp((b.pos.x - ai.x) * 0.4, -0.5, 0.5);
    }

    /* Ball visuals */
    ball.position.copy(b.pos);
    const overTable = Math.abs(b.pos.x) < T.width / 2 && Math.abs(b.pos.z) < T.length / 2;
    const ground = overTable ? T.height + 0.024 : 0.012;
    blob.position.set(b.pos.x, ground, b.pos.z);
    const lift = Math.max(0, b.pos.y - ground);
    blob.scale.setScalar(0.09 + lift * 0.18);
    blob.material.opacity = Math.max(0, 0.42 - lift * 0.3);
    blob.visible = state.phase === 'rally' || state.phase === 'serve' || state.phase === 'point';

    const speed = b.vel.length();
    if (b.live && speed > 7.5) {
      const s = trail[trailIdx++ % TRAIL_N];
      s.position.copy(b.pos);
      s.material.opacity = 0.5;
      s.scale.setScalar(0.05 + (speed - 7.5) * 0.004);
    }
    trail.forEach((s) => {
      s.material.opacity = Math.max(0, s.material.opacity - dt * 2.2);
    });

    /* Camera: parallax toward the ball, punch on smashes */
    const camX = THREE.MathUtils.clamp(b.live ? b.pos.x * 0.16 : me.x * 0.1, -0.34, 0.34);
    camera.position.x += (camX - camera.position.x) * Math.min(1, dt * 3);
    if (shakeT > 0) {
      shakeT -= dt;
      camera.position.y = 2.3 + (rand() - 0.5) * 0.04;
    } else {
      camera.position.y = 2.3;
    }
    if (fovPunch > 0) {
      fovPunch = Math.max(0, fovPunch - dt * 26);
    }
    const baseFov = camera.aspect < 0.62 ? 58 : 50;
    camera.fov = baseFov + fovPunch;
    camera.updateProjectionMatrix();
    lookAt.x = camX * 0.5;
    camera.lookAt(lookAt);

    renderer.render(scene, camera);
  }

  renderPts();
  hud.overlay.classList.add('show');
  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);

  /* ---- Debug API -------------------------------------------------------- */

  window.__ppPingis = {
    state,
    ball: b,
    me,
    ai,
    startGame,
    beginPoint,
    playerServe,
    setPaddle(x) {
      me.x = x;
    },
    forcePoint(mine = true) {
      if (state.phase === 'serve' || state.phase === 'rally') {
        b.lastHitter = mine ? 'me' : 'ai';
        b.bounces = 1;
        scorePoint(mine);
      }
    },
    winMatch() {
      // Test helper: skip the rally race entirely and settle the match
      if (state.phase === 'matchend' || state.phase === 'over') return;
      state.myPts = POINTS_TO_WIN;
      state.aiPts = 0;
      b.live = false;
      renderPts();
      endMatch(true);
    },
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
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    clearTimeout(state.lastToast);
    delete window.__ppPingis;

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

export default createPingis;
export { OPPONENTS };
