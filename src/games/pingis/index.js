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
 * Played in OLYMPIA, Anundsjö IF's hall in Bredbyn — the real venue for
 * the 2019 competition, standing there since 1938. A match goes to 7 (win
 * by 2 — kvällens husregel). Three matches against the actual 2019 podium
 * — Henrik (brons), Rickard (silver) and Viktor Jones (mästaren) — make
 * the tournament.
 */

import * as THREE from 'three';
import { Sfx } from './audio.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mulberry, glowTexture, buildHall, buildPlayer, buildPaddle, TABLE } from './hall.js';

const HIGHSCORE_KEY = 'pp-pingis-highscore';
const POINTS_TO_WIN = 7;

const T = TABLE;
const HITZ = T.length / 2 + 0.11; // the hit plane, just off each end
const REACH = 0.58; // generous: quality falls off toward the edge, misses are rare
const GRAV = 9.4;

const OPPONENTS = [
  {
    name: 'Henrik Lundqvist',
    title: 'Bronsracketen',
    shirt: 0x3f7a46,
    hair: 0x6b4a24,
    shorts: 0x23283a,
    speed: 1.5,
    err: 0.34,
    missP: 0.16,
    aggro: 0.15,
    smashP: 0.12,
    serveSpin: 0.3,
    taunt: 'Henrik spelar säkert — långa, lugna bollar.'
  },
  {
    name: 'Rickard Nilsson',
    title: 'Silverloopen',
    shirt: 0x2f5f96,
    hair: 0x2a1c10,
    shorts: 0x1b2130,
    speed: 2.0,
    err: 0.24,
    missP: 0.1,
    aggro: 0.48,
    smashP: 0.32,
    serveSpin: 0.7,
    taunt: 'Rickard loopar — och smashar allt som studsar högt.'
  },
  {
    name: 'Viktor Jones',
    title: 'Mästaren av 2019',
    shirt: 0xa8202c,
    hair: 0x3d2b18,
    shorts: 0x2a1418,
    speed: 2.6,
    err: 0.17,
    missP: 0.06,
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
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120f0a);
  scene.fog = new THREE.Fog(0x151109, 9, 20);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 40);
  camera.position.set(0, 2.5, 3.85);
  const lookAt = new THREE.Vector3(0, 1.02, -1.1);
  camera.lookAt(lookAt);

  /* Lights — hierarchy: hemisphere fill, one casting key, lamp accents */
  scene.add(new THREE.HemisphereLight(0x9aa8c8, 0x241a10, 0.42));

  const key = new THREE.DirectionalLight(0xffe2b0, 1.55);
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
    const lamp = new THREE.PointLight(0xffc98e, 5, 7, 2);
    lamp.position.set(0, 2.9, z);
    scene.add(lamp);
  });

  /* Post: a light bloom so the pendants, the house sign and the ball's
     highlight glow the way a warm hall reads on camera. */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.26, 0.5, 0.93);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // A low fill from the player's side so the opponent's face reads instead
  // of going to silhouette against his own hall.
  const faceFill = new THREE.DirectionalLight(0xffe8d0, 0.5);
  faceFill.position.set(0.5, 2.2, 6);
  scene.add(faceFill);

  /* World */
  const glow = glowTexture();
  const hall = buildHall(glow);
  scene.add(hall.group);

  /* Opponent figure across the table */
  let foe = null;
  const foeRefs = { current: null };
  function spawnFoe(idx) {
    if (foe) scene.remove(foe.group);
    const look = OPPONENTS[idx];
    foe = buildPlayer(look.shirt, { hair: look.hair, shorts: look.shorts });
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

  /* Landing marker: a ring on the player's half showing where the incoming
     ball will first bounce. Every good table tennis game gives you this —
     without it a fast serve is a coin flip rather than a read. */
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.9, 26),
    new THREE.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.scale.setScalar(0.2);
  marker.visible = false;
  marker.renderOrder = 3;
  marker.userData = { t: 0 };
  scene.add(marker);

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
    lastCause: '',
    causes: {},
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

  // `x` is where the bat IS, `aimX` where the finger wants it. Snapping the
  // bat straight onto the finger is what makes a touch game feel cheap; a
  // critically damped follow gives it weight without adding lag you can
  // feel. Fast enough to cover the table, slow enough to have momentum.
  const me = { x: 0, aimX: 0, vx: 0, dragVX: 0, dragVY: 0, swing: 0 };
  const ai = { x: 0, targetX: 0, swing: 0, serveTimer: 0, arriveT: 1, reading: false };

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
  function strike(hitter, from, land, flightT, spin, side, smash = false, fault = false) {
    b.pos.copy(from);
    const netTop = T.height + T.netH;
    // Solve the shot under the gravity the ball will ACTUALLY fly under.
    // The Magnus term adds to gravity under topspin — up to about a
    // quarter more — so a purely ballistic solve lands the ball short and,
    // more often, in the net. Then loft until it clears the tape. The
    // serve is exempt: it is aimed short onto your own half on purpose, so
    // its "net crossing" lies past the landing point and lofting for it
    // balloons the serve into the ceiling.
    const crossesNet = !fault && Math.sign(land.z) !== Math.sign(from.z);
    let ft = flightT;
    let vy = 0;
    let vz = 0;
    for (let i = 0; i < 7; i++) {
      vz = (land.z - from.z) / ft;
      const gEff = GRAV + Math.max(0, spin) * Math.abs(vz) * 0.55;
      vy = (T.height + 0.02 - from.y + 0.5 * gEff * ft * ft) / ft;
      if (!crossesNet) break;
      const tNet = Math.abs(vz) > 1e-4 ? -from.z / vz : 0;
      const yNet = from.y + vy * tNet - 0.5 * gEff * tNet * tNet;
      if (tNet <= 0 || yNet > netTop + 0.06) break;
      ft *= 1.07;
    }
    b.vel.set((land.x - from.x) / ft, vy, vz);
    b.st = spin;
    b.ss = side;
    b.live = true;
    b.lastHitter = hitter;
    b.bounces = 0;
    b.smash = smash;
    state.rallyHits++;
    if (hitter === 'me') {
      aiRead();
      marker.visible = false;
    } else {
      // Show the player where the incoming ball will land on their half —
      // the readability aid every good table tennis game gives you.
      const r = predictStrike(1);
      if (r.bounceX !== null && r.bounceZ > 0) {
        marker.position.set(r.bounceX, T.height + 0.026, r.bounceZ);
        marker.visible = true;
        marker.userData.t = 0;
      } else {
        marker.visible = false;
      }
    }
  }

  /**
   * Fly a copy of the ball forward through the same integrator and report
   * where the receiver on `side` gets to meet it (side −1 = the far half,
   * +1 = the near half), plus where it bounces on the way.
   *
   * Two things this has to get right. First, gravity, drag, the Magnus
   * term and — fatally — the BOUNCE, where topspin kicks the ball forward
   * and sideways. Extrapolating a straight line from the current velocity
   * leaves a bot permanently out of position, which reads as it missing on
   * purpose. Second, the contact happens wherever the ball drops back to
   * bat height after bouncing, not at some fixed plane: that is what a
   * player actually does, and anchoring it to a plane behind the table end
   * made every short ball an unreturnable freak winner.
   */
  const CONTACT_Y = T.height + 0.52;

  function predictStrike(side) {
    const pos = b.pos.clone();
    const vel = b.vel.clone();
    let { st, ss } = b;
    let bounces = 0;
    let bounceX = null;
    let bounceZ = null;
    const h = 1 / 120;
    for (let i = 0; i < 900; i++) {
      const sp = Math.abs(vel.z);
      vel.y -= GRAV * h;
      vel.y -= st * sp * 0.55 * h;
      vel.x += ss * sp * 0.4 * h * Math.sign(-vel.z);
      vel.multiplyScalar(1 - 0.06 * h);
      pos.addScaledVector(vel, h);
      if (vel.y < 0 && pos.y <= T.height + 0.023 &&
          Math.abs(pos.x) < T.width / 2 + 0.02 && Math.abs(pos.z) < T.length / 2 + 0.02) {
        pos.y = T.height + 0.023;
        vel.y = -vel.y * 0.86;
        vel.z *= 1 + st * 0.22;
        vel.x += ss * Math.abs(vel.z) * 0.16 * Math.sign(-vel.z);
        st *= 0.5;
        ss *= 0.55;
        if (Math.sign(pos.z) === side) {
          bounces++;
          if (bounceX === null) {
            bounceX = pos.x;
            bounceZ = pos.z;
          }
        }
      }
      if (pos.y < 0.03) break;
      const onSide = Math.sign(pos.z) === side && Math.abs(pos.z) > 0.15;
      if (bounces >= 1 && onSide && vel.y < 0 && pos.y <= CONTACT_Y) {
        return { x: pos.x, y: pos.y, z: pos.z, t: i * h, bounceX, bounceZ, ok: true };
      }
      // Long ball: met behind the table end instead
      if (side < 0 ? pos.z <= -HITZ : pos.z >= HITZ) {
        return { x: pos.x, y: pos.y, z: pos.z, t: i * h, bounceX, bounceZ, ok: true };
      }
    }
    return { x: pos.x, y: pos.y, z: pos.z, t: 0.6, bounceX, bounceZ, ok: false };
  }

  function scorePoint(mine, why, cause = '?') {
    if (state.phase !== 'rally' && state.phase !== 'serve') return;
    state.lastCause = `${cause}:${mine ? 'me' : 'ai'}:${state.rallyHits}`;
    state.causes[cause] = (state.causes[cause] || 0) + 1;
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
    ai.serveTimer = 0.7 + rand() * 0.6;
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

  /** The opponent reads the shot: where will it reach their side, and when. */
  function aiRead() {
    const r = predictStrike(-1);
    ai.targetX = THREE.MathUtils.clamp(r.x, -1.3, 1.3);
    ai.arriveT = r.t;
    ai.reading = true;
    return r;
  }

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
    // Off-centre contact and sheer violence both push the landing point.
    // Squared, so the middle two-thirds of the bat is forgiving and only
    // the very edge really punishes you.
    const err = (Math.abs(dx) / REACH) ** 2 * 0.55 + Math.max(0, power - 0.75) * 0.85;
    const spread = err * (rand() - 0.5) * 2;

    // Topspin dives: it may be hit faster and still land. Backspin floats.
    const flightT = spin > 0 ? 0.42 - power * 0.11 : 0.52 - power * 0.09;
    const landZ = -THREE.MathUtils.clamp(
      T.length * (0.18 + power * 0.24) + spread * 0.85,
      T.length * 0.05, T.length * 0.6
    );
    const landX = THREE.MathUtils.clamp(
      side * 0.85 + b.pos.x * 0.25 + spread * 0.65,
      -T.width * 0.66, T.width * 0.66
    );
    // A contact right on the edge of the bat is a mishit, not a shot
    if (Math.abs(dx) > REACH * 0.86 && rand() < 0.55) {
      const wild = rand();
      const at = b.pos.clone();
      if (wild < 0.45) {
        strike('me', at, { x: b.pos.x * 0.4, z: T.length * 0.1 }, 0.32, -0.2, 0, false, true);
      } else {
        strike('me', at, { x: (rand() < 0.5 ? -1 : 1) * T.width * 0.72, z: -T.length * 0.66 }, 0.5, -0.2, 0);
      }
      sfx.paddle(0.3);
      me.swing = 1;
      toast('Kantträff!');
      return true;
    }

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
    if (Math.abs(dx) > REACH + 0.1) {
      return false; // genuinely out of reach — a clean winner for the player
    }
    state.aiTouched = true;
    const stretch = Math.abs(dx) / REACH;
    const spread = (rand() - 0.5) * 2 * o.err * (0.6 + stretch * 0.7);

    /* Unforced error.
       Nudging the aim by a random amount does not produce one: the target
       is clamped to keep the ball on the table, so the nudge just gets
       swallowed and the opponent never misses. An error has to be a
       DISCRETE event — net, long, or wide — the way it is when a real
       player mistimes one. Reaching wide makes it likelier. */
    if (rand() < o.missP * (0.45 + stretch)) {
      const kind = rand();
      const from = b.pos.clone();
      if (kind < 0.4) {
        // Into the net: aim it short of the tape, no lofting to save it
        strike('ai', from, { x: b.pos.x * 0.4, z: -T.length * 0.1 }, 0.34, -0.2, 0, false, true);
      } else if (kind < 0.72) {
        // Long: over the far end
        strike('ai', from, { x: b.pos.x * 0.5, z: T.length * 0.72 }, 0.5, -0.3, 0);
      } else {
        // Wide: past the sideline
        strike('ai', from, { x: (rand() < 0.5 ? -1 : 1) * T.width * 0.72, z: T.length * 0.3 }, 0.52, 0.2, 0);
      }
      sfx.paddle(0.4);
      ai.swing = 1;
      return true;
    }

    const high2 = b.pos.y > 1.05 && Math.abs(b.vel.z) < 7;
    const smash = high2 && rand() < o.smashP;
    const loop = rand() < o.aggro;
    const spin = smash ? 0.4 : loop ? 0.5 + rand() * 0.5 : (rand() < 0.3 ? -0.5 : 0.15);
    const flightT = smash ? 0.3 : loop ? 0.42 : 0.54;
    // Aim away from where the bat is now, and keep it on the table: the
    // clamp is what turns "the bot misses a lot" into "the bot plays".
    const away = me.x > 0 ? -1 : 1;
    // Clamped just OUTSIDE the lines: a blunder has to be able to miss,
    // or the rally never ends and the bot is unbeatable rather than good.
    const landX = THREE.MathUtils.clamp(
      away * (0.2 + rand() * 0.45) * (1 + o.aggro) * 0.55 + spread,
      -T.width * 0.58, T.width * 0.58
    );
    const landZ = THREE.MathUtils.clamp(
      T.length * (smash ? 0.4 : 0.22 + rand() * 0.16) + spread * 0.45,
      T.length * 0.08, T.length * 0.56
    );
    strike('ai', b.pos.clone(), { x: landX, z: landZ }, flightT, spin,
      (rand() - 0.5) * o.serveSpin * 0.6, smash);
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
          scorePoint(b.lastHitter === 'me', b.lastHitter === 'me' ? 'DUBBELSTUDS!' : '', 'doublebounce');
        }
      } else {
        // Bounced back on the hitter's own side: their fault
        scorePoint(b.lastHitter !== 'me', '', 'ownside');
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
        if (b.bounces >= 1) scorePoint(b.lastHitter === 'me', '', 'winner');
        else scorePoint(b.lastHitter !== 'me', b.lastHitter === 'me' ? 'UT!' : 'UT — din poäng', 'out');
      }
      if (b.floorBounces > 4) b.live = false;
    }

    /* Strike windows.
       In table tennis you meet the ball AFTER it has bounced on your side,
       as it drops back to bat height — you step in for a short ball rather
       than waiting behind the end of the table. A whiff just lets it sail
       on; the floor rule scores it when it lands. */
    if (state.phase === 'rally' && b.floorBounces === 0 && b.bounces >= 1) {
      const meReceiving = b.lastHitter === 'ai';
      const dropping = b.vel.y < 0 && b.pos.y <= CONTACT_Y;
      if (meReceiving && b.pos.z > 0.15 && dropping) playerHit();
      else if (!meReceiving && b.pos.z < -0.15 && dropping) aiHit();
    }
    /* …and a fallback for the long ball that clears the table entirely */
    if (state.phase === 'rally' && b.floorBounces === 0) {
      if (b.vel.z > 0 && prevZ < HITZ && b.pos.z >= HITZ && b.lastHitter === 'ai') playerHit();
      if (b.vel.z < 0 && prevZ > -HITZ && b.pos.z <= -HITZ && b.lastHitter === 'me') aiHit();
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
    me.aimX = THREE.MathUtils.clamp(pointerX(e) * 1.25, -1.2, 1.2);
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
    me.aimX = THREE.MathUtils.clamp(pointerX(e) * 1.25, -1.2, 1.2);
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
    composer.setSize(w, h);
    bloom.setSize(Math.min(320, w / 2), Math.min(560, h / 2));
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
      if (keys.left) me.aimX = Math.max(-1.2, me.aimX - 3.2 * dt);
      if (keys.right) me.aimX = Math.min(1.2, me.aimX + 3.2 * dt);

      // Critically damped spring toward the finger: settles without
      // overshoot, and carries the bat's own momentum into the shot.
      const stiff = 190;
      const damp = 2 * Math.sqrt(stiff);
      me.vx += ((me.aimX - me.x) * stiff - me.vx * damp) * dt;
      me.x = THREE.MathUtils.clamp(me.x + me.vx * dt, -1.25, 1.25);
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
        if (state.pointT > 0.95 && state.phase === 'point') beginPoint();
      }

      /* AI movement.
         The bot moves toward the point it READ, and — crucially — fast
         enough to arrive before the ball does. A fixed top speed means a
         wide, fast ball is unreturnable no matter how good the opponent
         is supposed to be, which reads as the bot giving up. Instead the
         required speed is derived from the distance and the time left,
         and only capped by the opponent's own limit. */
      const o = opp();
      const incoming = b.live && b.vel.z < 0;
      if (!incoming || !ai.reading) ai.targetX = ai.reading ? ai.targetX : 0;
      const dxA = THREE.MathUtils.clamp(ai.targetX, -1.25, 1.25) - ai.x;
      ai.arriveT = Math.max(0.05, ai.arriveT - dt);
      const need = Math.abs(dxA) / ai.arriveT;
      const speed = incoming ? Math.min(o.speed, Math.max(1.2, need)) : 1.6;
      const maxStep = speed * dt;
      ai.x += THREE.MathUtils.clamp(dxA, -maxStep, maxStep);

      /* Landing marker fades after it has done its job */
      if (marker.visible) {
        marker.userData.t += dt;
        marker.material.opacity = Math.max(0, 0.75 - marker.userData.t * 0.5);
        marker.scale.setScalar(0.2 + Math.sin(marker.userData.t * 7) * 0.022);
        if (marker.material.opacity <= 0) marker.visible = false;
      }

      stepBall(dt);
    }

    /* Meshes */
    myPaddle.position.x = me.x;
    myPaddle.rotation.y = THREE.MathUtils.clamp(me.vx * 0.06, -0.35, 0.35);
    myPaddle.position.y = T.height + 0.18 + Math.sin(t * 2.1) * 0.008;
    myPaddle.rotation.z = THREE.MathUtils.clamp(-me.vx * 0.09 - me.dragVX * 0.06, -0.6, 0.6);
    if (me.swing > 0) {
      me.swing = Math.max(0, me.swing - dt * 5);
      myPaddle.rotation.x = -0.4 - Math.sin(me.swing * Math.PI) * 0.8;
    } else {
      myPaddle.rotation.x = -0.4;
    }

    if (foe) {
      const fr = foeRefs.current;
      const prevX = foe.group.position.x;
      foe.group.position.x += (ai.x - prevX) * Math.min(1, dt * 10);
      const moving = Math.abs(ai.x - prevX);
      const stride = moving > 0.004 ? 1 : 0;

      // Split-step: a table tennis player is never still, they bounce on
      // the balls of their feet between shots. That idle is most of what
      // makes a figure read as alive rather than as a prop.
      const hop = Math.abs(Math.sin(t * 4.4)) * (0.012 + stride * 0.02);
      foe.group.position.y = hop;
      const crouch = 0.1 + hop * 1.6;
      fr.legL.hip.rotation.x = crouch + Math.sin(t * 4.4) * 0.06 * stride;
      fr.legR.hip.rotation.x = crouch - Math.sin(t * 4.4) * 0.06 * stride;
      fr.legL.knee.rotation.x = -0.22 - hop * 2.4;
      fr.legR.knee.rotation.x = -0.22 - hop * 2.4;
      // Lean into the direction of travel
      foe.group.rotation.z = THREE.MathUtils.clamp((ai.x - prevX) * -1.4, -0.16, 0.16);

      // Paddle arm held out to the side so the racket reads in silhouette
      fr.armR.shoulder.rotation.z = -0.42;
      fr.armL.shoulder.rotation.z = 0.34;
      if (ai.swing > 0) {
        ai.swing = Math.max(0, ai.swing - dt * 4.5);
        // Wind up behind, whip through, follow across the body
        const k = 1 - ai.swing; // 0 → 1 across the stroke
        const arc = Math.sin(k * Math.PI);
        fr.armR.shoulder.rotation.x = 0.72 - (k - 0.5) * 1.6;
        fr.armR.elbow.rotation.x = 0.5 + arc * 0.55;
        fr.armR.shoulder.rotation.z = -0.42 - arc * 0.5;
        fr.torso.rotation.y = (k - 0.5) * 0.5;
      } else {
        fr.armR.shoulder.rotation.x = 0.72 + Math.sin(t * 1.7) * 0.07;
        fr.armR.elbow.rotation.x = 0.5;
        fr.torso.rotation.y *= 1 - Math.min(1, dt * 5);
      }
      fr.armL.shoulder.rotation.x = 0.5 + Math.sin(t * 1.7 + 1) * 0.06;
      fr.armL.elbow.rotation.x = 0.5;
      // Eyes on the ball
      fr.head.rotation.y = THREE.MathUtils.clamp((b.pos.x - ai.x) * -0.5, -0.6, 0.6);
      fr.head.rotation.x = THREE.MathUtils.clamp((b.pos.z + HITZ) * 0.06, -0.25, 0.3);
    }

    /* The crowd breathes, and jumps when a point lands */
    hall.refs.crowd.forEach((c) => {
      const d = c.userData;
      const cheer = state.phase === 'point' ? Math.max(0, 1 - state.pointT * 1.6) : 0;
      c.position.y = 0.5 + Math.sin(t * 1.6 + d.phase) * 0.006
        + Math.abs(Math.sin(t * 9 + d.phase)) * cheer * 0.09;
    });

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
      camera.position.y = 2.5 + (rand() - 0.5) * 0.04;
    } else {
      camera.position.y = 2.5;
    }
    if (fovPunch > 0) {
      fovPunch = Math.max(0, fovPunch - dt * 26);
    }
    const baseFov = camera.aspect < 0.62 ? 58 : 50;
    camera.fov = baseFov + fovPunch;
    camera.updateProjectionMatrix();
    lookAt.x = camX * 0.5;
    camera.lookAt(lookAt);

    composer.render();
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
      me.aimX = x;
      me.vx = 0;
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
