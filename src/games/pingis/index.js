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
 *
 * Module layout: hall.js builds the room, foe.js the opponent (one of the
 * friends, from the shared people system), fx.js the juice (trails,
 * rings, sparks, confetti), crowd.js the people watching,
 * scoreboard.js the split-flap board, post.js the bloom and grade, hud.js
 * the DOM. This file owns the rules, the ball, the bot and the flow — and
 * the ball/bot code is the measured one: see the README before touching
 * anything between "Ball flight" and "Physics tick".
 */

import * as THREE from 'three';
import { Sfx } from './audio.js';
import {
  mulberry, glowTexture, ballTexture, buildHall, buildPaddle, buildTrophy, TABLE
} from './hall.js';
import { Foe, BAT_OFFSET } from './foe.js';
import { Trail, Swoosh, Rings, Sparks, Confetti, spinColor, spinCss } from './fx.js';
import { buildCrowd } from './crowd.js';
import { Scoreboard } from './scoreboard.js';
import { createPost } from './post.js';
import { guardRenderer, RenderWatchdog, gfxNotice, precompile } from '../shared/gfx.js';
import { buildHud, MEDAL_NAMES } from './hud.js';

/** Fill the whole stage on desktop; the camera reframes per aspect. */
export const layout = 'full';

const HIGHSCORE_KEY = 'pp-pingis-highscore';
const BEST_KEY = 'pp-pingis-best';
const POINTS_TO_WIN = 7;

const T = TABLE;
const HITZ = T.length / 2 + 0.11; // the hit plane, just off each end
const REACH = 0.62; // generous: quality falls off toward the edge, misses are rare
const GRAV = 9.4;
const FOE_Z = -HITZ - 0.55; // where the opponent stands, feet
const PADDLE_Y = T.height + 0.08; // the player's grip height at rest
/* Layer 1 is seen by the camera but not by the floor's mirror: specks of
   dust, sparks and confetti are a pixel or two wide, and in a half-size,
   un-antialiased reflection they only shimmer. */
const NO_MIRROR = 1;

/*
 * The opponents.
 *
 * `place` is how wide they work the corners and it is the knob that
 * actually sets difficulty, because what beats a player is having to
 * COVER ground, not the ball being struck well.
 *
 * `err` is genuine imprecision, and it is deliberately small for everyone
 * — including, especially, the weakest. That is the opposite of what it
 * looks like it should be: the landing point is clamped onto the table, so
 * a big random spread never becomes a miss, it just becomes unpredictable
 * placement, which is HARDER to return. Giving Henrik the largest err made
 * the bronze medallist the most awkward opponent in the tournament. A weak
 * opponent is weak through `missP` (he actually misses), `pace` (his ball
 * is slow) and a small `place` (he hits it back down the middle).
 */

const OPPONENTS = [
  {
    name: 'Henrik Lundqvist',
    title: 'Bronsracketen',
    podium: 'Brons 2019',
    speed: 1.3,
    place: 0.5,
    pace: 1.1,
    err: 0.1,
    missP: 0.22,
    aggro: 0.1,
    smashP: 0.04,
    serveSpin: 0.2,
    taunt: 'Henrik spelar säkert — långa, lugna bollar.'
  },
  {
    name: 'Rickard Nilsson',
    title: 'Silverloopen',
    podium: 'Silver 2019',
    speed: 1.8,
    place: 0.7,
    pace: 1.02,
    err: 0.14,
    missP: 0.17,
    aggro: 0.38,
    smashP: 0.22,
    serveSpin: 0.55,
    taunt: 'Rickard loopar — och smashar allt som studsar högt.'
  },
  {
    name: 'Viktor Jones',
    title: 'Mästaren av 2019',
    podium: 'Guld 2019 · mästaren',
    speed: 2.0,
    place: 0.8,
    pace: 1.0,
    err: 0.18,
    missP: 0.15,
    aggro: 0.55,
    smashP: 0.3,
    serveSpin: 0.9,
    taunt: 'Viktor Jones. Mästaren. Serverna skruvar.'
  }
];

/** Medal for a won match, by margin: 3 balls for silver, 5 for gold. */
function medalFor(my, ai) {
  if (my <= ai) return 0;
  const m = my - ai;
  return m >= 5 ? 3 : m >= 3 ? 2 : 1;
}
const MEDAL_WHY = ['', 'Vunnen match', 'Vunnen med minst 3 bollars marginal', 'Vunnen med minst 5 bollars marginal'];

/** The intro card's scouting report, read straight off the real knobs. */
function scouting(o) {
  const n = (v, a, b) => Math.max(1, Math.min(5, Math.round(1 + ((v - a) / (b - a)) * 4)));
  return [
    ['Fart', n(o.speed, 1.2, 2.0)],
    ['Placering', n(o.place, 0.45, 0.8)],
    ['Smash', n(o.smashP, 0, 0.3)],
    ['Skruv', n(o.serveSpin, 0.15, 0.9)],
    ['Säkerhet', n(0.24 - o.missP, 0, 0.09)]
  ];
}

const RALLY_TIERS = [
  { at: 6, word: 'Fin duell!' },
  { at: 10, word: 'Maratonrally!' },
  { at: 15, word: 'Episkt!' },
  { at: 20, word: 'Legendariskt!' }
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

const smooth = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * The play camera for an aspect ratio. A phone in portrait needs a wide
 * lens close behind the bat to keep the whole table across the frame; a
 * monitor gets a longer lens from a touch further back, so the table stays
 * the subject while the hall — stage, curtain, crowd, the wall seating —
 * fills the sides instead of the table being dwarfed in the middle.
 */
function framing(aspect, out, height = 900) {
  const k = smooth(0.56, 1.6, aspect);
  // A phone on its side has ~390 px of height and the HUD takes the top
  // fifth of it: a slightly longer lens buys the table some size back
  const short = smooth(560, 400, height) * k;
  out.fov = THREE.MathUtils.lerp(58, 38, k) - short * 4;
  out.pos.set(0, THREE.MathUtils.lerp(2.5, 2.3, k), THREE.MathUtils.lerp(3.85, 4.3, k));
  out.look.set(0, THREE.MathUtils.lerp(1.02, 1.0, k), THREE.MathUtils.lerp(-1.1, -1.25, k));
  return out;
}

/* ------------------------------------------------------------------- game */

export async function createPingis(container) {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const lowTier = coarse || Math.min(window.innerWidth, window.innerHeight) < 560;
  // window.__ppPingisQuality lets a test force a tier; nothing else sets it
  const tier = window.__ppPingisQuality || (lowTier ? 'low' : 'high');
  const low = tier !== 'high';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const vrand = Math.random; // visuals only — the rules have their own seeded rng

  // Canvas textures bake their lettering once, so give the site's display
  // face a moment to arrive before the signs and the board are painted.
  try {
    if (document.fonts && !document.fonts.check('700 64px "Schibsted Grotesk"')) {
      await Promise.race([
        document.fonts.load('700 64px "Schibsted Grotesk"'),
        new Promise((resolve) => setTimeout(resolve, 600))
      ]);
    }
  } catch (e) {
    /* offline or blocked: the fallback face will do */
  }

  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui fg-ui pg-ui';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost, { mouse: !coarse });

  const sfx = new Sfx();
  const rand = mulberry(2019);

  // No MSAA on the canvas: the scene renders into the composer's own
  // multisampled target and the canvas only ever receives the final pass.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const maxPR = low ? 1.75 : 2;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, maxPR);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvasHost.appendChild(renderer.domElement);
  // Riktiga grafikkretsar är strängare än testmiljöns (se shared/gfx.js)
  const gfx = guardRenderer(renderer, container);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120f0a);
  scene.fog = new THREE.Fog(0x151109, 10, 24);

  // Near plane at 10 cm, not 5: nothing ever comes closer to the lens, and
  // it doubles the depth precision everywhere else — the floor glows and
  // the signs on their boards sit centimetres apart several metres away.
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 40);
  camera.layers.enable(NO_MIRROR);
  // The input camera: the play framing without parallax or shake, so the
  // cursor-to-bat mapping never drifts while the view breathes.
  const aimCam = new THREE.PerspectiveCamera(50, 1, 0.1, 40);
  const base = { fov: 50, pos: new THREE.Vector3(), look: new THREE.Vector3() };

  /* Lights — hierarchy: hemisphere fill, one casting key, lamp accents */
  // A warm evening fill: the sky term is the lamplit ceiling and walls of a
  // timber hall, not a blue sky, and the bounce off the floor is honey
  const HEMI = 0.44;
  const hemi = new THREE.HemisphereLight(0xdcc4a2, 0x3c2916, HEMI);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffe2b0, 1.55);
  key.position.set(1.6, 5.4, 2.4);
  key.target.position.set(0, 0.7, -0.4);
  key.castShadow = true;
  key.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  key.shadow.camera.left = -3.4;
  key.shadow.camera.right = 3.4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 14;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.015;
  // r187's PCF: hardware compare + a 5-tap Vogel disk this many texels wide
  key.shadow.radius = 3;
  scene.add(key, key.target);

  // The pendants: warm pools over the table. At this scale (metres, lamps
  // ~1.9 m up) candela in single digits already reads — no LAMP multiplier.
  const pendants = [-1.05, 0, 1.05].map((z) => {
    const lamp = new THREE.PointLight(0xffc98e, 5, 7, 2);
    lamp.position.set(0, 2.9, z);
    scene.add(lamp);
    return lamp;
  });

  // A low fill from the player's side so the opponent's face reads instead
  // of going to silhouette against his own hall.
  // Off to the left, so faces are modelled — the key comes high from the
  // right, this fills the shadow side softly, the rim (below) draws the edge
  const faceFill = new THREE.DirectionalLight(0xffe2c4, 0.5);
  faceFill.position.set(-2.8, 2.3, 5.2);
  scene.add(faceFill);

  // A back light from the stage lip, high over his shoulders: it rims the
  // opponent's head, shoulders and bat arm in warm light so he stands out
  // from the people behind him — the broadcast look. A cone, not a sun,
  // so the floor and the table do not wash out. On every tier: on a phone
  // the opponent is the one big figure in the frame.
  const rim = new THREE.SpotLight(0xffc48a, 16, 9, 0.5, 0.7, 2);
  rim.position.set(0.3, 3.5, -4.5);
  rim.target.position.set(0, 1.2, -2.1);
  scene.add(rim, rim.target);
  // The wall sconces really light the people sitting under them (the wide
  // desktop lens is the one that sees the wall seating)
  if (!low) {
    [[-4.05, -1.7], [4.05, -1.45]].forEach(([x, z]) => {
      const sconce = new THREE.PointLight(0xffb878, 3.2, 5, 2);
      sconce.position.set(x, 2.45, z);
      scene.add(sconce);
    });
  }

  /* World */
  const glow = glowTexture();
  const hall = buildHall(glow, { tier, pixelRatio, profile: gfx });
  scene.add(hall.group);
  hall.refs.dust.layers.set(NO_MIRROR);
  if (hall.refs.reflector) hall.refs.reflector.getReflectionCamera(camera).layers.disable(NO_MIRROR);

  /* Shaders are compiled before anything is drawn, off the main thread
     where the driver can (see shared/gfx.js) — the cube capture below would
     otherwise compile the whole hall in one blocking burst. Compiled with a
     render target bound: every pass here (the composer's scene pass, the
     mirror, the cube capture) renders into one, and a program compiled
     against the canvas is a different, tone-mapped variant. */
  const compileTarget = new THREE.WebGLRenderTarget(1, 1);
  await precompile(renderer, scene, camera, { target: compileTarget });
  compileTarget.dispose();

  /* The hall reflects itself: one cube capture from over the table, so the
     lacquer, the ball and the cups shine with THIS room, not a studio. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (hall.refs.reflector) hall.refs.reflector.visible = false;
  const envRT = pmrem.fromScene(scene, 0.04, 0.1, 30, { position: new THREE.Vector3(0, 1.4, 0.6) });
  if (hall.refs.reflector) hall.refs.reflector.visible = true;
  pmrem.dispose();
  const envTex = envRT.texture;
  const useEnv = (root) => root.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    mats.forEach((m) => {
      if (!m.isMeshStandardMaterial || m.envMap) return;
      m.envMap = envTex;
      m.envMapIntensity = m.metalness > 0.5 ? 1.2 : 0.45;
    });
  });
  useEnv(scene);
  hall.refs.floorMat.envMapIntensity = low ? 0.9 : 0.3;
  hall.refs.tableTopMat.envMapIntensity = 0.7;

  /* The opponent across the table: one of the friends, holding the bat
     that stays with the game while the people change */
  let foe = null;
  const foePaddle = buildPaddle();
  foePaddle.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  useEnv(foePaddle);
  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach((m) => {
        Object.values(m).forEach((v) => {
          if (v && v.isTexture && v !== envTex && v !== glow) v.dispose();
        });
        if (m.uniforms) {
          Object.values(m.uniforms).forEach((u) => {
            if (u.value && u.value.isTexture && u.value !== envTex && u.value !== glow) u.value.dispose();
          });
        }
        m.dispose();
      });
    });
  }
  function spawnFoe(idx) {
    // The new one first, the old one after: people share their materials,
    // so the shaders stay compiled across the swap instead of being thrown
    // away and rebuilt (a hitch on a GPU that compiles slowly)
    const old = foe;
    foe = new Foe(OPPONENTS[idx], foePaddle);
    foe.root.position.set(0, 0, FOE_Z);
    useEnv(foe.root);
    scene.add(foe.root);
    foe.idx = idx;
    if (old) old.dispose();
  }
  spawnFoe(0);

  /* The player's paddle, floating at the bottom of the frame */
  const myPaddle = buildPaddle({ mark: 'PEKKAS' });
  myPaddle.position.set(0, PADDLE_Y, HITZ);
  myPaddle.rotation.x = -0.4;
  myPaddle.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  useEnv(myPaddle);
  scene.add(myPaddle);
  const { rubber } = myPaddle.userData;

  /* The ball, its halo, contact shadow and trail */
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.023, 24, 16),
    new THREE.MeshStandardMaterial({
      map: ballTexture(), roughness: 0.32, metalness: 0,
      emissive: 0x554a33, emissiveIntensity: 0.4, envMap: envTex, envMapIntensity: 0.6
    })
  );
  ball.castShadow = true;
  scene.add(ball);
  // A faint halo so the ball reads against the cream wall and the lamps
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xfff1d6, transparent: true, opacity: 0.32, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false
  }));
  halo.scale.setScalar(0.1);
  scene.add(halo);

  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 2;
  scene.add(blob);

  /* Landing marker: a ring on the player's half showing where the incoming
     ball will first bounce. Every good table tennis game gives you this —
     without it a fast serve is a coin flip rather than a read. It wears the
     spin colour, so it also tells you WHAT is coming. */
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.9, 32),
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

  const trail = new Trail();
  const swooshMe = new Swoosh();
  const swooshFoe = new Swoosh();
  const rings = new Rings(14);
  const sparks = new Sparks(glow);
  const confetti = new Confetti(low ? 200 : 360);
  scene.add(trail.mesh, swooshMe.mesh, swooshFoe.mesh, rings.mesh, sparks.points, confetti.mesh);
  sparks.points.layers.set(NO_MIRROR);
  confetti.mesh.layers.set(NO_MIRROR);

  // Phones skip the crowd's shadows: a dozen figures in the shadow pass
  // buys nothing at that size
  const crowd = buildCrowd(hall.refs.seats, { castShadow: !low });
  useEnv(crowd.group);
  scene.add(crowd.group);
  const board = new Scoreboard(hall.refs.scoreboard);

  /* The big cup, kept under the table until somebody beats Viktor */
  const trophy = buildTrophy(0xf2c14e, 1.25, envTex);
  trophy.visible = false;
  scene.add(trophy);
  const trophyShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.7, 3, 24, 1, true),
    hall.refs.lampMats[0].mat.clone()
  );
  trophyShaft.material.uniforms.uIntensity.value = 0;
  trophyShaft.position.set(0, T.height + 1.5, 0.45);
  trophyShaft.renderOrder = 4;
  trophyShaft.visible = false;
  scene.add(trophyShaft);

  const post = createPost(renderer, scene, camera, { samples: low ? 0 : 4, bloomRes: low ? 0.35 : 0.5, profile: gfx });
  let usePost = !gfx.safe;
  // Svart bild på någon krets: rita förbi efterbehandlingen, sedan utan skuggor
  const watchdog = new RenderWatchdog(
    renderer,
    [
      () => {
        usePost = false;
      },
      () => {
        renderer.shadowMap.enabled = false;
        scene.traverse((o) => {
          if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
        });
      },
      () => {
        // Last resort: the floor's mirror (a second render of the room)
        if (hall.refs.reflector) hall.refs.reflector.visible = false;
      }
    ],
    { onStep: () => gfxNotice(container, 'Grafiken förenklades för att fungera på den här enheten.') }
  );
  const drawFrame = () => {
    if (usePost) post.render();
    else renderer.render(scene, camera);
  };

  /* ---- State ----------------------------------------------------------- */

  const state = {
    phase: 'menu', // menu | intro | idle | serve | rally | point | replay | matchend | celebrate | over
    mode: 'tour', // tour (the three matches) | single (one opponent)
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
    decided: false, // the match is over once this point's dust settles
    replayWanted: false,
    medals: [0, 0, 0], // this run
    stats: { rally: 0, smashes: 0, aces: 0 },
    rallyTier: 0,
    champion: false
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
  const me = { x: 0, aimX: 0, vx: 0, dragVX: 0, dragVY: 0, swing: 0, swingSpin: 0 };
  const ai = { x: 0, targetX: 0, swing: 0, serveTimer: 0, arriveT: 1, reading: false };

  let high = 0;
  try {
    high = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
  } catch (e) {
    high = 0;
  }
  let best = { medals: [0, 0, 0], rally: 0, titles: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
    if (raw && Array.isArray(raw.medals)) best = { ...best, ...raw };
  } catch (e) {
    /* corrupt or blocked storage: start fresh */
  }
  const saveBest = () => {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch (e) {
      /* private mode */
    }
  };
  hud.setHigh(high);

  const opp = () => OPPONENTS[state.matchNo - 1];
  const first = (o = opp()) => o.name.split(' ')[0];
  const myServe = () => Math.floor(state.serves / 2) % 2 === 0;

  let fovPunch = 0;
  let shakeT = 0;
  let hitStop = 0;
  let simT = 0; // simulation clock (stops for hit-stop, help and replays)
  let pointSimT = 0; // simT when the last point was decided (replay anchor)
  let touchHints = coarse ? 3 : Infinity; // a finger gets the hint for its first points
  let ghostServes = 0; // serves a finger has played itself
  let ghostSeen = false; // …two of them, and the ghost finger has done its job
  /* Balance runs play thousands of matches headless. The whole loop is
     dt-driven, so the only thing standing between a match and running in
     milliseconds is the frame we never look at. */
  let renderOn = true;

  /* Flow timers run on the simulation clock, not setTimeout: they pause
     with the help card and the hidden tab, and a headless balance run on a
     virtual clock gets them in the right order for free. */
  const timers = [];
  const after = (sec, fn) => timers.push({ t: sec, fn });
  function runTimers(dt) {
    const due = [];
    for (let i = timers.length - 1; i >= 0; i--) {
      timers[i].t -= dt;
      if (timers[i].t <= 0) due.push(timers.splice(i, 1)[0].fn);
    }
    due.reverse().forEach((fn) => fn());
  }

  /* Sound events are recorded with the sim clock so a replay can play the
     rally back slowed down. */
  const events = [];
  function snd(kind, a) {
    if (kind === 'paddle') sfx.paddle(a);
    else if (kind === 'bounce') sfx.bounce();
    else if (kind === 'net') sfx.net();
    else if (kind === 'floor') sfx.floor(a);
    else if (kind === 'smash') sfx.smash();
    if (renderOn) {
      events.push({ t: simT, kind, a });
      if (events.length > 80) events.shift();
    }
  }

  /* ---- HUD helpers ----------------------------------------------------- */

  const projected = new THREE.Vector3();
  function screenPct(world) {
    projected.copy(world).project(camera);
    if (projected.z > 1) return null;
    return [(projected.x * 0.5 + 0.5) * 100, (-projected.y * 0.5 + 0.5) * 100];
  }

  function popScore(text, world, cls = '', color = '') {
    if (!renderOn) return;
    const p = screenPct(world);
    if (p) hud.pop(text, p[0], p[1], cls, color);
  }

  function addScore(n, world, label) {
    state.score += n;
    hud.setScore(state.score);
    if (world) popScore(label || `+${hud.fmt(n)}`, world);
  }

  function renderPts() {
    const mp = matchPointFor();
    hud.setPoints(state.myPts, state.aiPts, first().toUpperCase(), myServe());
    hud.setPips(state.matchNo, state.medals, state.mode);
    const flipped = board.set(state.myPts, state.aiPts, first().toUpperCase(), state.matchNo, myServe(), mp);
    if (flipped && renderOn) sfx.flap(0.05);
  }

  /** +1 if the player is a point from the match, −1 if the opponent is. */
  function matchPointFor() {
    const lead = Math.max(state.myPts, state.aiPts);
    const diff = Math.abs(state.myPts - state.aiPts);
    if (lead < POINTS_TO_WIN - 1 || diff === 0) return 0;
    if (lead >= POINTS_TO_WIN && diff >= 2) return 0; // already decided
    return state.myPts > state.aiPts ? 1 : -1;
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
        spinColor(spin, side, marker.material.color);
      } else {
        marker.visible = false;
      }
    }
    onStrike(hitter, from, spin, side, smash);
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
    let smashWin = false;
    if (mine) {
      state.myPts++;
      const ace = !state.aiTouched && b.lastHitter === 'me' && state.rallyHits <= 1;
      let pts = 100 + Math.max(0, state.rallyHits - 1) * 40;
      let label = `+${hud.fmt(pts)}`;
      if (b.smash) {
        pts += 150;
        label = `SMASH +${hud.fmt(pts)}`;
        smashWin = true;
      }
      if (ace) {
        pts += 250;
        label = `ESS! +${hud.fmt(pts)}`;
        state.stats.aces++;
      }
      addScore(pts, ball.position, label);
      sfx.point();
      callout(why || (smashWin ? 'SMASH!' : ace ? 'SERVE-ESS!' : 'DIN POÄNG'), smashWin || ace ? 'gold' : 'win');
    } else {
      state.aiPts++;
      sfx.lost();
      callout(why || `POÄNG ${first().toUpperCase()}`, 'lose');
    }
    renderPts();
    afterPoint(mine, smashWin);

    const lead = Math.max(state.myPts, state.aiPts);
    const diff = Math.abs(state.myPts - state.aiPts);
    if (lead >= POINTS_TO_WIN && diff >= 2) {
      state.decided = true;
      // A replay of the match-winning rally plays first, then the card
      if (!state.replayWanted) after(0.9, () => endMatch(state.myPts > state.aiPts));
    }
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
    hud.phase(myServe() ? `DIN SERVE — ${hud.serveHint}` : `${first()} servar…`);
    onBeginPoint();
    // A finger's first serves get a ghost finger showing the gesture
    if (renderOn) hud.ghost(coarse && myServe() && touchHints >= 0 && !ghostSeen);
  }

  function playerServe() {
    if (state.phase !== 'serve' || !myServe()) return;
    if (renderOn) hud.ghost(false);
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
    hud.phase('');
    snd('paddle', power);
    me.swing = 1;
    me.swingSpin = spin;
  }

  function aiServe() {
    const o = opp();
    sfx.toss();
    const side = (rand() - 0.5) * 1.4 * o.serveSpin;
    const spin = (rand() < 0.55 ? 1 : -0.7) * (0.3 + rand() * 0.5) * o.serveSpin;
    strike('ai', new THREE.Vector3(ai.x, T.height + 0.34, -HITZ + 0.05),
      { x: (rand() - 0.5) * 1.1 * o.place, z: -T.length * 0.24 },
      0.36 * o.pace, spin, side, false);
    b.serving = true;
    state.phase = 'rally';
    hud.phase('');
    snd('paddle', 0.5);
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
    if (Math.abs(dx) > REACH * 0.92 && rand() < 0.35) {
      const wild = rand();
      const at = b.pos.clone();
      if (wild < 0.45) {
        strike('me', at, { x: b.pos.x * 0.4, z: T.length * 0.1 }, 0.32, -0.2, 0, false, true);
      } else {
        strike('me', at, { x: (rand() < 0.5 ? -1 : 1) * T.width * 0.72, z: -T.length * 0.66 }, 0.5, -0.2, 0);
      }
      snd('paddle', 0.3);
      me.swing = 1;
      me.swingSpin = 0;
      hud.toast('Kantträff!');
      return true;
    }

    const smash = b.pos.y > 1.1 && power > 0.8 && spin >= 0;
    strike('me', b.pos.clone(), { x: landX, z: landZ }, smash ? flightT * 0.72 : flightT,
      spin, side, smash);
    if (smash) {
      snd('smash');
      fovPunch = 5;
    } else {
      snd('paddle', power);
    }
    me.swing = 1;
    me.swingSpin = spin;
    onPlayerShot(spin, side, power, smash);
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
      snd('paddle', 0.4);
      ai.swing = 1;
      return true;
    }

    const high2 = b.pos.y > 1.05 && Math.abs(b.vel.z) < 7;
    const smash = high2 && rand() < o.smashP;
    const loop = rand() < o.aggro;
    const spin = smash ? 0.4 : loop ? 0.5 + rand() * 0.5 : (rand() < 0.3 ? -0.5 : 0.15);
    const flightT = (smash ? 0.3 : loop ? 0.42 : 0.54) * o.pace;
    /* Aim away from where the bat is now — but not EVERY time. Wrong-footing
       the player on all twelve shots of a rally is not what a rally looks
       like, and it is the single biggest reason a returnable opponent still
       feels unplayable. Only the sharper ones do it consistently. */
    const wrongFoot = rand() < 0.45 + o.aggro * 0.5;
    const away = (me.x > 0 ? -1 : 1) * (wrongFoot ? 1 : -1);
    // Clamped just OUTSIDE the lines: a blunder has to be able to miss,
    // or the rally never ends and the bot is unbeatable rather than good.
    const landX = THREE.MathUtils.clamp(
      away * (0.2 + rand() * 0.45) * (1 + o.aggro) * 0.55 * o.place + spread,
      -T.width * 0.58, T.width * 0.58
    );
    const landZ = THREE.MathUtils.clamp(
      T.length * (smash ? 0.4 : 0.22 + rand() * 0.16) + spread * 0.45,
      T.length * 0.08, T.length * 0.56
    );
    strike('ai', b.pos.clone(), { x: landX, z: landZ }, flightT, spin,
      (rand() - 0.5) * o.serveSpin * 0.6, smash);
    if (smash) {
      snd('smash');
      shakeT = 0.3;
      onSmash(false);
    } else {
      snd('paddle', loop ? 0.75 : 0.45);
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
          snd('net');
          netHit(b.pos.x, 0.5);
        } else {
          b.pos.z = prevZ > 0 ? 0.02 : -0.02;
          b.vel.z *= -0.16;
          b.vel.x *= 0.5;
          b.st = 0;
          b.ss = 0;
          snd('net');
          netHit(b.pos.x, 1);
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
      snd('bounce');
      onBounce(b.pos, true);

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
      snd('floor', 0.3 / b.floorBounces);
      if (b.floorBounces === 1) {
        onBounce(b.pos, false);
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

  /* ---- Feedback hooks (visual and audio only — never touch the rules) -- */

  const tmpC = new THREE.Color();
  const hitGlowC = new THREE.Color();
  let hitGlow = 0;
  const tmpV = new THREE.Vector3();
  const flatQ = new THREE.Quaternion();
  const net = { x: 0, amp: 0, t: 0 };
  /* After a point the ball is no longer the rules' business, but it should
     not freeze in mid-air either: a visual-only copy carries on bouncing. */
  const dead = { on: false, pos: new THREE.Vector3(), vel: new THREE.Vector3() };

  function netHit(x, strength) {
    if (!renderOn) return;
    net.x = x;
    net.amp = 0.03 * strength;
    net.t = 0;
  }

  function onStrike(hitter, from, spin, side, smash) {
    if (!renderOn) return;
    spinColor(spin, side, tmpC);
    sparks.burst(from, tmpC, smash ? 30 : 10, smash ? 2.6 : 1.5, vrand);
    rings.spawn(from, tmpC, smash ? 0.4 : 0.16, 0.32, flatQ.copy(camera.quaternion));
    (hitter === 'me' ? swooshMe : swooshFoe).fire(tmpC, smash ? 0.2 : 0.14);
    if (smash && hitter === 'me') state.stats.smashes++;
    rallyTick();
  }

  function onBounce(p, onTable) {
    if (!renderOn) return;
    spinColor(b.st * 2, b.ss * 1.8, tmpC);
    if (onTable) {
      const speed = b.vel.length();
      const size = 0.14 + speed * 0.012 + (b.smash ? 0.18 : 0);
      rings.spawn(tmpV.set(p.x, T.height + 0.028, p.z), tmpC, size, b.smash ? 0.6 : 0.45);
      if (b.smash) sparks.burst(p, tmpC, 16, 1.4, vrand);
    } else {
      rings.spawn(tmpV.set(p.x, 0.012, p.z), tmpC.multiplyScalar(0.5), 0.2, 0.5);
    }
  }

  function onPlayerShot(spin, side, power, smash) {
    if (!renderOn) return;
    // Say what you just played: the spin, in its colour, by the bat
    const word = smash ? 'SMASH' : spin > 0.25 ? 'TOPSPIN' : spin < -0.25 ? 'BACKSPIN' : 'PLATT';
    const arrow = side > 0.22 ? ' →' : side < -0.22 ? ' ←' : '';
    const strength = Math.abs(spin) > 0.7 ? '+' : '';
    popScore(`${word}${strength}${arrow}`, tmpV.set(me.x, PADDLE_Y + 0.25, HITZ), 'pg-spinpop', spinCss(spin, side));
    if (power > 0.82 && !smash) {
      sfx.swish(0.18);
      fovPunch = Math.max(fovPunch, 1.6); // a drive you can feel in the lens
    }
    // The rubber flares in the spin colour at contact, then cools
    spinColor(spin, side, hitGlowC);
    hitGlow = smash ? 1.4 : 0.6 + power * 0.5;
    if (smash) onSmash(true);
  }

  /** Hit-stop, flash and the camera kick: the smash has to LAND. */
  function onSmash(mine) {
    if (!renderOn) return;
    hitStop = 0.085;
    post.u.uFlash.value = reduceMotion ? 0.05 : 0.16;
    post.u.uFringe.value = reduceMotion ? 0 : 0.006;
    if (mine) {
      crowd.react('ooh', 0.8);
      sfx.ooh(0.8);
    } else if (foe) {
      foe.cue('smash');
    }
  }

  function rallyTick() {
    const n = state.rallyHits;
    let tierIdx = 0;
    RALLY_TIERS.forEach((tr, i) => {
      if (n >= tr.at) tierIdx = i + 1;
    });
    if (tierIdx > state.rallyTier) {
      state.rallyTier = tierIdx;
      const tr = RALLY_TIERS[tierIdx - 1];
      hud.toast(tr.word, tierIdx >= 2);
      sfx.tier(tierIdx);
      sfx.ooh(0.6 + tierIdx * 0.2);
      crowd.react('ooh', 0.8 + tierIdx * 0.2);
    }
    hud.setRally(n, tierIdx ? RALLY_TIERS[tierIdx - 1].word : '', tierIdx);
    if (coarse && n >= 4) hud.showKeys(false); // the counter takes that corner
  }

  function onBeginPoint() {
    state.rallyTier = 0;
    dead.on = false;
    if (!renderOn) return;
    hud.showKeys(touchHints-- > 0);
    trail.clear();
    hud.setRally(0, '', 0);
    const mp = matchPointFor();
    setDrama(mp);
    hud.setMatchPoint(mp, first());
    if (mp) sfx.heartbeat();
  }

  function afterPoint(mine, smashWin) {
    const rally = state.rallyHits;
    state.stats.rally = Math.max(state.stats.rally, rally);
    if (rally > (best.rally || 0)) {
      best.rally = rally;
      saveBest();
    }
    // Replays are for the picture; a headless balance run never waits for one
    state.replayWanted = renderOn && mine && (rally >= 6 || (smashWin && rally >= 3));
    if (!renderOn) return;
    pointSimT = simT;
    dead.on = true;
    dead.pos.copy(b.pos);
    dead.vel.copy(b.vel);
    marker.visible = false;
    hud.setMatchPoint(0);
    setDrama(0);
    const power = Math.min(1, 0.3 + rally / 14);
    if (mine) {
      crowd.react('cheer', power);
      sfx.cheer(power);
    } else {
      // A long rally earns him applause too — it is a friendly hall
      crowd.react(rally >= 8 ? 'applause' : 'groan', power);
      if (rally >= 4) sfx.groan();
    }
    if (foe) foe.cue(mine ? 'lost' : 'point', power);
  }

  /* Match-point drama: the hall dims around the table, the grade leans
     gold (your match point) or red (theirs), the crowd goes quiet. */
  const drama = { v: 0, target: 0, mine: true };
  function setDrama(mp) {
    drama.target = mp ? 1 : 0;
    if (mp) drama.mine = mp > 0;
  }

  /* ---- Flow ------------------------------------------------------------- */

  let camMode = 'menu';
  let camCut = false;
  let celebT = 0;
  let singleIdx = 0;

  function clearRun() {
    timers.length = 0;
    state.decided = false;
    state.replayWanted = false;
    state.champion = false;
    dead.on = false;
    trail.clear();
    swooshMe.clear();
    swooshFoe.clear();
    confetti.stop();
    trophy.visible = false;
    trophyShaft.visible = false;
    crowd.react('idle');
    setDrama(0);
    hud.setMatchPoint(0);
    hud.setRally(0, '', 0);
    hud.phase('');
    hud.hidePanel();
    hud.hideIntro();
    hud.replay(false);
    hud.showKeys(false);
    hud.ghost(false);
  }

  function showMenu() {
    clearRun();
    state.phase = 'menu';
    hudHost.classList.add('pg-inmenu');
    camMode = 'menu';
    hud.showBug(false);
    canvasHost.classList.remove('pg-playing');
    const unlocked = [true, (best.medals[0] || 0) > 0, (best.medals[1] || 0) > 0];
    hud.menu({
      opps: OPPONENTS.map((o) => ({ name: o.name, place: o.podium })),
      best, high, unlocked, mouse: !coarse
    });
  }

  function startTournament() {
    sfx.resume();
    clearRun();
    hudHost.classList.remove('pg-inmenu');
    state.mode = 'tour';
    state.matchNo = 1;
    state.score = 0;
    state.medals = [0, 0, 0];
    state.stats = { rally: 0, smashes: 0, aces: 0 };
    hud.setScore(0, false);
    showIntro();
  }

  function startSingle(idx) {
    sfx.resume();
    clearRun();
    hudHost.classList.remove('pg-inmenu');
    singleIdx = idx;
    state.mode = 'single';
    state.matchNo = idx + 1;
    state.medals = [0, 0, 0];
    state.stats = { rally: 0, smashes: 0, aces: 0 };
    showIntro();
  }

  /** Kept for the test hook and Space: continue after a won match, or start. */
  function startGame() {
    sfx.resume();
    if (state.phase === 'matchend') {
      clearRun();
      state.stats = { rally: 0, smashes: 0, aces: 0 };
      showIntro();
      return;
    }
    startTournament();
  }

  function again() {
    if (state.mode === 'single') startSingle(singleIdx);
    else startTournament();
  }

  /** The opponent walks on: camera close on him, the scouting card. */
  function showIntro() {
    state.phase = 'intro';
    state.myPts = 0;
    state.aiPts = 0;
    state.serves = 0;
    if (!foe || foe.idx !== state.matchNo - 1) spawnFoe(state.matchNo - 1);
    renderPts();
    if (!renderOn) {
      beginMatch();
      return;
    }
    hud.showBug(false);
    camMode = 'intro';
    canvasHost.classList.remove('pg-playing');
    sfx.sting();
    hud.showIntro({
      opp: opp(), matchNo: state.matchNo, mode: state.mode,
      stats: scouting(opp()), medal2019: opp().podium.toUpperCase()
    });
  }

  function beginMatch() {
    if (state.phase !== 'intro') return;
    hud.hideIntro();
    state.phase = 'idle';
    state.myPts = 0;
    state.aiPts = 0;
    state.serves = 0;
    state.decided = false;
    camMode = 'play';
    hud.showBug(true);
    hud.showKeys(touchHints > 0);
    canvasHost.classList.add('pg-playing');
    renderPts();
    if (renderOn) hud.toast(`${first()} — ${opp().title}`, true);
    after(0.9, beginPoint);
  }

  function endMatch(won) {
    if (state.phase === 'matchend' || state.phase === 'over' || state.phase === 'celebrate') return;
    const o = opp();
    const my = state.myPts;
    const them = state.aiPts;
    setDrama(0);
    hud.setMatchPoint(0);
    hud.phase('');
    hud.setRally(0, '', 0);
    hud.showKeys(false);
    canvasHost.classList.remove('pg-playing');
    if (won) {
      const level = medalFor(my, them);
      const idx = state.matchNo - 1;
      state.medals[idx] = level;
      if (level > (best.medals[idx] || 0)) {
        best.medals[idx] = level;
        saveBest();
      }
      if (renderOn) {
        crowd.react('cheer', 1);
        if (foe) foe.cue('matchLost');
        setTimeoutSafe(() => sfx.medal(level), 650);
      }
      if (state.mode === 'single') {
        state.phase = 'over';
        sfx.fanfare();
        hud.result({ won, my, ai: them, opp: o, level, why: MEDAL_WHY[level], stats: state.stats, score: state.score, mode: 'single' });
        return;
      }
      const bonus = 1000 * state.matchNo + (POINTS_TO_WIN - state.aiPts) * 100;
      addScore(bonus, null);
      sfx.fanfare();
      if (state.matchNo >= 3) {
        addScore(3000, null);
        champion();
        return;
      }
      state.matchNo++;
      state.phase = 'matchend';
      hud.result({
        won, my, ai: them, opp: o, level, why: MEDAL_WHY[level], stats: state.stats,
        score: state.score, next: opp(), mode: 'tour'
      });
    } else {
      sfx.applause();
      if (renderOn && foe) foe.cue('matchWon');
      if (state.mode === 'single') {
        state.phase = 'over';
        hud.result({ won, my, ai: them, opp: o, level: 0, why: `${o.title} tog den här gången.`, stats: state.stats, score: state.score, mode: 'single' });
        return;
      }
      gameOver(false, my, them);
    }
  }

  /* Viktor is beaten: confetti from the ceiling, the hall on its feet, the
     cup rising out of the table under its own light, and a slow orbit. */
  function champion() {
    state.phase = 'celebrate';
    state.champion = true;
    if (!renderOn) {
      gameOver(true);
      return;
    }
    camMode = 'celebrate';
    celebT = 0;
    hud.showBug(false);
    confetti.launch(vrand, 0, -0.6);
    crowd.react('celebrate');
    sfx.champion();
    hud.callout('MÄSTARE!', 'gold big');
    trophy.visible = true;
    trophyShaft.visible = true;
    after(4.2, () => gameOver(true));
  }

  function gameOver(isChamp, my = 0, them = 0) {
    state.phase = 'over';
    const isHigh = state.score > high;
    if (isHigh) {
      high = state.score;
      try {
        localStorage.setItem(HIGHSCORE_KEY, String(Math.round(high)));
      } catch (e) {
        /* private mode */
      }
      hud.setHigh(high);
    }
    if (isChamp) {
      best.titles = (best.titles || 0) + 1;
      saveBest();
      hud.final({ medals: state.medals, opps: OPPONENTS, score: state.score, high, isHigh, rally: state.stats.rally });
      return;
    }
    hud.result({
      won: false, my, ai: them, opp: opp(), level: 0,
      why: isHigh ? `Föll i match ${state.matchNo} — men nytt rekord! Fika, sen en match till?`
        : `Föll i match ${state.matchNo}. Kaffet är fortfarande varmt — en match till?`,
      stats: state.stats, score: state.score, mode: 'tour'
    });
  }

  // The one real-time delay: a sound that should land with the medal's
  // drop animation. Tracked so destroy() can cancel it.
  const realTimers = new Set();
  function setTimeoutSafe(fn, ms) {
    const id = setTimeout(() => {
      realTimers.delete(id);
      fn();
    }, ms);
    realTimers.add(id);
  }

  function callout(txt, cls) {
    if (renderOn) hud.callout(txt, cls);
  }

  /* ---- Replay ----------------------------------------------------------- */

  /* Every rendered frame of play is recorded (ball, bats, the opponent's
     stroke) into a short ring buffer. When a long rally ends in your
     favour, the last second and a half plays back at 40 % from a low side
     camera — the angle that shows what the spin actually did. */
  const REC_MAX = 260;
  const rec = [];
  const replay = { t: 0, end: 0, start: 0, ev: 0 };

  function startReplay() {
    if (rec.length < 20) {
      endReplay();
      return;
    }
    state.phase = 'replay';
    replay.end = Math.min(rec[rec.length - 1].t, pointSimT + 0.5);
    replay.start = Math.max(rec[0].t, pointSimT - 1.7);
    replay.t = replay.start;
    replay.ev = events.findIndex((e) => e.t >= replay.start);
    camMode = 'replay';
    camCut = true; // a broadcast replay CUTS to its camera, it does not pan there
    trail.clear();
    hud.replay(true);
    hud.phase('');
    sfx.rewind();
  }

  function endReplay() {
    if (state.phase !== 'replay' && state.phase !== 'point') return;
    hud.replay(false);
    state.replayWanted = false;
    state.phase = 'point';
    camMode = 'play';
    camCut = true;
    trail.clear();
    if (state.decided) endMatch(state.myPts > state.aiPts);
    else beginPoint();
  }

  function stepReplay(dt) {
    const prev = replay.t;
    replay.t += dt * 0.4;
    // Play the rally's own sounds back, slowed
    while (replay.ev >= 0 && replay.ev < events.length && events[replay.ev].t <= replay.t) {
      const e = events[replay.ev++];
      if (e.t < prev) continue;
      if (e.kind === 'paddle') sfx.paddle(e.a, 0.6);
      else if (e.kind === 'bounce') sfx.bounce(0.6);
      else if (e.kind === 'net') sfx.net(0.6);
      else if (e.kind === 'floor') sfx.floor(e.a, 0.6);
      else if (e.kind === 'smash') sfx.smash(0.6);
    }
    if (replay.t >= replay.end) endReplay();
  }

  /* ---- Input ------------------------------------------------------------ */

  let dragging = false;
  let helpOpen = false;
  let lastPX = 0;
  let lastPY = 0;
  let lastPT = 0;
  let mouseT = -1e9; // last time the mouse moved over the hall
  const keys = { left: false, right: false, up: false, down: false };
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();

  /**
   * Where along the bat's line the pointer is, in table metres. The mouse
   * maps 1:1 — the bat sits under the cursor, which is what makes a mouse
   * feel direct. A finger maps with gain: it covers the bat it is steering,
   * and a phone's width is all the travel it has.
   */
  function aimFrom(e) {
    const rect = canvasHost.getBoundingClientRect();
    const ndc = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pa.set(-1, PADDLE_Y + 0.1, HITZ).project(aimCam);
    pb.set(1, PADDLE_Y + 0.1, HITZ).project(aimCam);
    const x = -1 + (2 * (ndc - pa.x)) / Math.max(1e-4, pb.x - pa.x);
    const gain = e.pointerType === 'mouse' ? 1 : 1.5;
    return THREE.MathUtils.clamp(x * gain, -1.2, 1.2);
  }

  const blocked = (e) => helpOpen || e.target.closest?.('button, .pb-overlay.show, .pb-help, .pg-intro.show .pg-intro-card');

  function onPointerDown(e) {
    sfx.resume();
    if (blocked(e)) return;
    if (state.phase === 'replay') {
      endReplay();
      return;
    }
    if (state.phase === 'intro') {
      beginMatch();
      return;
    }
    dragging = true;
    hud.ghost(false);
    lastPX = e.clientX;
    lastPY = e.clientY;
    lastPT = e.timeStamp || performance.now();
    me.aimX = aimFrom(e);
  }

  function onPointerMove(e) {
    const mouse = e.pointerType === 'mouse';
    if (mouse) {
      if (!container.contains(e.target) || blocked(e)) return;
      mouseT = performance.now();
    } else if (!dragging) {
      return;
    }
    // The event's own timestamp, not the handler's clock: on a busy phone
    // handlers run late and bunched, which would read a flick as a crawl
    const now = e.timeStamp || performance.now();
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
    me.aimX = aimFrom(e);
  }

  function onPointerUp() {
    if (dragging && state.phase === 'serve' && myServe()) {
      // Two serves of its own, and a finger no longer needs the ghost
      if (++ghostServes >= 2) ghostSeen = true;
      playerServe();
    }
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
      if (helpOpen) return;
      if (state.phase === 'serve' && myServe()) {
        me.dragVY = keys.up ? -3 : keys.down ? 3 : -1;
        me.dragVX = 0;
        playerServe();
      } else if (state.phase === 'replay') {
        endReplay();
      } else if (state.phase === 'intro') {
        beginMatch();
      } else if (state.phase === 'menu') {
        startTournament();
      } else if (state.phase === 'matchend') {
        startGame();
      } else if (state.phase === 'over') {
        again();
      }
    } else if (e.key === '?' || (e.key === 'Escape' && helpOpen)) {
      // Escape closes the help card here; the site closes the game on it
      // otherwise, so a consumed Escape must not reach the site's handler
      if (e.key === 'Escape') e.stopPropagation();
      setHelp(!helpOpen);
    } else if (e.key === 'Escape' && state.phase === 'replay') {
      e.stopPropagation();
      endReplay();
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
    hud.el.help.hidden = !open;
  }

  function onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      sfx.resume();
      const act = btn.dataset.action;
      if (act === 'tour') startTournament();
      else if (act === 'single') startSingle(Number(btn.dataset.idx));
      else if (act === 'play') beginMatch();
      else if (act === 'next') startGame();
      else if (act === 'again') again();
      else if (act === 'menu') showMenu();
      else if (act === 'help-close') setHelp(false);
      return;
    }
    if (e.target === hud.el.help) setHelp(false); // tap beside the card closes it
    else if (e.target.closest('#pg-info')) setHelp(true);
    else if (e.target.closest('#pg-mute')) {
      sfx.setMuted(!sfx.muted);
      hud.el.mute.classList.toggle('off', sfx.muted);
    }
  }

  hudHost.addEventListener('click', onClick);
  canvasHost.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown, true); // capture: ahead of the site's Escape
  window.addEventListener('keyup', onKeyUp);

  /* ---- Resize ----------------------------------------------------------- */

  let viewW = 1;
  let viewH = 1;
  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    viewW = Math.max(1, Math.floor(rect.width));
    viewH = Math.max(1, Math.floor(rect.height));
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(viewW, viewH, false);
    post.setSize(viewW, viewH);
    camera.aspect = viewW / viewH;
    framing(camera.aspect, base, viewH);
    aimCam.aspect = camera.aspect;
    aimCam.fov = base.fov;
    aimCam.position.copy(base.pos);
    aimCam.lookAt(base.look);
    aimCam.updateProjectionMatrix();
    aimCam.updateMatrixWorld();
    if (hall.refs.reflector) {
      hall.refs.reflector.getRenderTarget().setSize(
        Math.round(viewW * pixelRatio * 0.5), Math.round(viewH * pixelRatio * 0.5));
    }
    hall.refs.dust.material.uniforms.uPR.value = pixelRatio * (viewH / 900 + 0.4);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Loop ------------------------------------------------------------- */

  let raf = 0;
  let last = performance.now();
  let running = true;
  let frozen = false; // test hook: hold the last frame (screenshots under software GL)
  let frameT = 0; // the picture's clock: keeps running through hit-stop
  let perfAcc = 0;
  let perfN = 0;
  let perfCool = 4;

  /** One step of the rules, exactly as the balance runs measured it. */
  function simStep(dt, tNow) {
    runTimers(dt);
    simT += dt;

    /* Keyboard paddle */
    if (keys.left) me.aimX = Math.max(-1.2, me.aimX - 3.2 * dt);
    if (keys.right) me.aimX = Math.min(1.2, me.aimX + 3.2 * dt);

    // Critically damped spring toward the finger: settles without
    // overshoot, and carries the bat's own momentum into the shot.
    const stiff = 190;
    const damp = 2 * Math.sqrt(stiff);
    me.vx += ((me.aimX - me.x) * stiff - me.vx * damp) * dt;
    me.x = THREE.MathUtils.clamp(me.x + me.vx * dt, -1.25, 1.25);
    // A mouse hovering over the hall steers like a finger held down
    const tracking = dragging || performance.now() - mouseT < 400;
    if (!tracking) {
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
        b.pos.y = T.height + 0.32 + Math.sin(tNow * 3) * 0.012;
      }
    }

    if (state.phase === 'point') {
      state.pointT += dt;
      if (state.pointT > 0.95 && state.phase === 'point') {
        if (state.replayWanted) startReplay();
        else if (!state.decided) beginPoint();
      }
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

    stepBall(dt);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const rawDt = clampDt(now - last);
    last = now;
    if (!running || frozen) return;
    frameT += rawDt;

    // Hit-stop freezes the rules for a beat, never the picture
    let dt = rawDt;
    if (hitStop > 0) {
      hitStop -= rawDt;
      dt = 0;
    }
    if (!helpOpen) {
      if (state.phase === 'replay') stepReplay(rawDt);
      else simStep(dt, now / 1000);
    }
    if (!renderOn) return;
    renderFrame(rawDt, frameT);
    adapt(rawDt);
  }

  /* Adaptive resolution: if the frame time stays high, step the pixel
     ratio down (never up again — oscillating resolution is worse). */
  function adapt(dt) {
    perfCool -= dt;
    perfAcc += dt;
    perfN++;
    if (perfN < 90) return;
    const avg = perfAcc / perfN;
    perfAcc = 0;
    perfN = 0;
    if (perfCool > 0 || document.hidden) return;
    if (avg > 1 / 40 && pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      perfCool = 3;
      resize();
    }
  }

  /* ---- The picture ------------------------------------------------------- */

  // The view: everything a frame needs, built from the live state or read
  // back from the replay buffer.
  const view = {
    t: 0, bx: 0, by: 1, bz: HITZ, bvis: false, st: 0, ss: 0, vz: 0, live: false, smash: false,
    meX: 0, meVx: 0, meDVX: 0, meDVY: 0, meSwing: 0, meSpin: 0, aiX: 0, foeX: 0, foeZ: FOE_Z, stroke: 0, fh: 1,
    hc: false, cx: 0, cy: 0, cz: 0, toss: -1, mpX: 0, mpY: PADDLE_Y, mpZ: HITZ, mpReach: 0
  };
  const foeAnim = { x: 0, z: FOE_Z, fh: 1, stroke: 0, read: -1, swing: 0, hc: false, c: new THREE.Vector3() };
  /* Your bat goes to MEET the ball. The rules hit it wherever it drops to
     bat height, which can be a metre in front of a bat parked at the end
     of the table — so for the picture the bat reads where the ball will be
     met (the same pure prediction the bot reads with) and rises and
     reaches there over the last third of a second, then follows through
     and settles back. Sideways it only leans toward the ball: x stays the
     bat you are steering, so a ball out of reach is visibly missed. */
  const meAnim = { read: -1, c: new THREE.Vector3(), tHit: 0, swing: 0, follow: 0 };

  function liveView(dt) {
    const src = dead.on ? dead.pos : b.pos;
    view.t = simT;
    view.bx = src.x;
    view.by = src.y;
    view.bz = src.z;
    view.bvis = ['serve', 'rally', 'point'].includes(state.phase);
    view.st = b.st;
    view.ss = b.ss;
    view.vz = dead.on ? dead.vel.z : b.vel.z;
    view.live = b.live || dead.on;
    view.smash = b.smash;
    view.meX = me.x;
    view.meVx = me.vx;
    view.meDVX = me.dragVX;
    view.meDVY = me.dragVY;
    if (me.swing > 0) me.swing = Math.max(0, me.swing - dt * 5);
    view.meSwing = me.swing;
    view.meSpin = me.swingSpin;
    const toMe = b.live && b.vel.z > 0 && b.lastHitter === 'ai' && state.phase === 'rally';
    if (toMe && meAnim.read !== state.rallyHits) {
      meAnim.read = state.rallyHits;
      const r = predictStrike(1);
      meAnim.c.set(r.x, r.y, r.z);
      meAnim.tHit = simT + r.t;
    }
    let reach = 0;
    if (toMe && meAnim.read === state.rallyHits) reach = 1 - smooth(0.03, 0.32, meAnim.tHit - simT);
    if (me.swing > meAnim.swing + 0.5) {
      // Contact (or your serve): the ball is exactly where the bat met it
      meAnim.c.copy(b.pos);
      meAnim.follow = 1;
    }
    meAnim.swing = me.swing;
    meAnim.follow = Math.max(0, meAnim.follow - dt * 2.4);
    reach = Math.max(reach, smooth(0, 0.55, meAnim.follow));
    const leanX = THREE.MathUtils.clamp(meAnim.c.x - me.x, -0.36, 0.36) * 0.6;
    view.mpReach = reach;
    view.mpX = me.x + leanX * reach;
    view.mpY = THREE.MathUtils.lerp(PADDLE_Y, THREE.MathUtils.clamp(meAnim.c.y - 0.1, PADDLE_Y, 1.5), reach);
    view.mpZ = THREE.MathUtils.lerp(HITZ, THREE.MathUtils.clamp(meAnim.c.z + 0.06, 0.25, HITZ), reach);
    view.aiX = ai.x;
    // The opponent's stroke: wind up as the ball arrives, follow through
    // after contact. Forehand unless it is coming well to his backhand.
    const incoming = b.live && b.vel.z < 0 && ai.reading;
    if (incoming) foeAnim.fh = ai.targetX > 0.35 ? -1 : 1;
    // Where he will meet it: the bot's own read, repeated for the picture
    // (predictStrike only reads the ball, so the rules never notice)
    if (incoming && foeAnim.read !== state.rallyHits) {
      foeAnim.read = state.rallyHits;
      const r = predictStrike(-1);
      foeAnim.c.set(r.x, r.y, r.z);
      foeAnim.hc = true;
    }
    // Contact: the ball is exactly where the bat met it this frame
    if (ai.swing > foeAnim.swing + 0.5) {
      foeAnim.c.copy(b.pos);
      foeAnim.hc = true;
    }
    let toss = -1;
    if (state.phase === 'serve' && !myServe() && !b.live) {
      // His serve: the ball sits in his palm, goes up, and the bat winds up
      // under it as it falls to the serve point
      toss = THREE.MathUtils.clamp(1 - ai.serveTimer / 0.5, 0, 1);
      foeAnim.fh = 1;
      foeAnim.stroke = smooth(0.35, 1, toss) * 0.99;
      foeAnim.c.set(ai.x, T.height + 0.34, -HITZ + 0.05);
      foeAnim.hc = true;
    } else if (ai.swing > 0) {
      // After contact: follow-through, 1 → 2 (2 is the ready pose again)
      ai.swing = Math.max(0, ai.swing - dt * 4.5);
      foeAnim.stroke = ai.swing > 0 ? 2 - ai.swing : 0;
    } else if (incoming && ai.arriveT < 0.26) {
      // Wind-up, 0 → 1 as the ball arrives
      foeAnim.stroke = Math.min(0.99, 1 - ai.arriveT / 0.26);
    } else {
      foeAnim.stroke = Math.max(0, Math.min(foeAnim.stroke, 0.99) - dt * 3);
    }
    foeAnim.swing = ai.swing;
    if (!incoming && ai.swing <= 0 && toss < 0 && foeAnim.stroke <= 0) foeAnim.hc = false;
    view.stroke = foeAnim.stroke;
    view.fh = foeAnim.fh;
    view.toss = toss;
    view.hc = foeAnim.hc;
    view.cx = foeAnim.c.x;
    view.cy = foeAnim.c.y;
    view.cz = foeAnim.c.z;
    // Stand so the BAT, not the belly button, is where the bot is: a
    // forehand reaches out to his right (world −x), a backhand is played
    // in front of the body. A short ball brings him in to the table end.
    const off = foeAnim.fh > 0 ? BAT_OFFSET.fh : BAT_OFFSET.bh;
    foeAnim.x += (ai.x + off - foeAnim.x) * Math.min(1, dt * 10);
    const stepIn = foeAnim.hc && foeAnim.stroke > 0 && foeAnim.stroke < 1.6 && toss < 0
      ? THREE.MathUtils.clamp(foeAnim.c.z - 0.62, FOE_Z, -1.66) : FOE_Z;
    foeAnim.z += (stepIn - foeAnim.z) * Math.min(1, dt * 5);
    view.foeX = foeAnim.x;
    view.foeZ = foeAnim.z;
    return view;
  }

  function record(v) {
    if (!['serve', 'rally', 'point'].includes(state.phase)) return;
    let r;
    if (rec.length >= REC_MAX) r = rec.shift();
    else r = {};
    Object.assign(r, v);
    rec.push(r);
  }

  const rv = { ...view };
  function replayView() {
    let i = rec.findIndex((r) => r.t >= replay.t);
    if (i <= 0) i = Math.max(1, i < 0 ? rec.length - 1 : 1);
    const a = rec[i - 1];
    const c = rec[i];
    const k = THREE.MathUtils.clamp((replay.t - a.t) / Math.max(1e-5, c.t - a.t), 0, 1);
    Object.assign(rv, c);
    ['bx', 'by', 'bz', 'meX', 'meVx', 'aiX', 'foeX', 'foeZ', 'stroke', 'meSwing', 'mpX', 'mpY', 'mpZ', 'mpReach'].forEach((f) => {
      rv[f] = a[f] + (c[f] - a[f]) * k;
    });
    if (Math.abs(c.stroke - a.stroke) > 0.8) rv.stroke = c.stroke;
    return rv;
  }

  const camPos = new THREE.Vector3(0, 2.5, 3.85);
  const camLook = new THREE.Vector3(0, 1.02, -1.1);
  let camFov = 50;
  const tPos = new THREE.Vector3();
  const tLook = new THREE.Vector3();
  const bladeA = new THREE.Vector3();
  const bladeB = new THREE.Vector3();
  const ballW = new THREE.Vector3();

  /* The opponent, from the view: where he stands, the stroke, the ball he
     is watching, and what the moment asks of his face */
  const foeView = {
    x: 0, z: FOE_Z, stroke: 0, fh: 1, ball: null, contact: null, mode: 'menu', relax: false, look: null, focus: 0,
    toss: -1, tossBall: new THREE.Vector3(), servePoint: new THREE.Vector3()
  };
  const contactW = new THREE.Vector3();
  const lookW = new THREE.Vector3();
  function poseOpponent(v, t, dt) {
    if (!foe) return;
    const fv = foeView;
    const ph = state.phase;
    fv.mode = ph === 'menu' ? 'menu'
      : ph === 'intro' ? 'intro'
        : ph === 'celebrate' || (ph === 'over' && state.champion) ? 'clap' : 'play';
    // The match is over and the card is up: he stands at ease
    fv.relax = ph === 'matchend' || (ph === 'over' && !state.champion);
    fv.x = v.foeX;
    fv.z = v.foeZ;
    fv.stroke = v.stroke;
    fv.fh = v.fh;
    fv.ball = v.bvis ? ballW.set(v.bx, v.by, v.bz) : null;
    fv.contact = v.hc ? contactW.set(v.cx, v.cy, v.cz) : null;
    fv.toss = v.toss;
    if (v.toss >= 0) {
      fv.servePoint.set(v.cx, v.cy, v.cz);
      fv.ball = fv.tossBall;
    }
    // Between points he looks at you (the bat); at the card, into the lens
    fv.look = fv.mode === 'intro' || fv.mode === 'clap' ? lookW.copy(camera.position)
      : fv.mode === 'menu' ? null : lookW.set(v.meX, PADDLE_Y + 0.25, HITZ);
    fv.focus = fv.mode === 'play' && v.live ? 0.5 + drama.v * 0.4 : 0;
    foe.update(dt, t, fv);
    if (v.toss >= 0) {
      // The ball is in his hand, not where the rules parked it
      v.bx = fv.tossBall.x;
      v.by = fv.tossBall.y;
      v.bz = fv.tossBall.z;
    }
    // The swing trail rides the blade
    foe.bladePoints(bladeA, bladeB);
    swooshFoe.sample(bladeA, bladeB, dt);
  }

  function updateCamera(v, t, dt) {
    let rate = 3;
    let { fov } = base;
    if (camMode === 'play') {
      const camX = THREE.MathUtils.clamp(v.live ? v.bx * 0.16 : v.meX * 0.1, -0.34, 0.34);
      tPos.copy(base.pos);
      tPos.x = camX;
      tLook.copy(base.look);
      tLook.x = camX * 0.5;
    } else if (camMode === 'menu') {
      tPos.set(Math.sin(t * 0.07) * 1.6, 2.15 + Math.sin(t * 0.05) * 0.12, base.pos.z - 0.6);
      tLook.set(Math.sin(t * 0.05) * 0.4, 1.3, -3.2);
      fov = base.fov + 3;
      rate = 1.2;
    } else if (camMode === 'intro') {
      // Close on the opponent; on a wide screen he stands right of centre
      // so the card can take the left, on a phone he stands above it
      const wide = camera.aspect > 1.05;
      const fx = foe ? foe.root.position.x : 0;
      tPos.set(fx + (wide ? 0.45 : 0.2), wide ? 1.85 : 1.75, wide ? 1.35 : 1.0);
      tLook.set(fx - (wide ? 0.62 : 0), wide ? 1.48 : 1.22, -2.1);
      fov = wide ? 32 : 48;
      rate = 2.2;
    } else if (camMode === 'replay') {
      if (camera.aspect < 0.8) {
        // A tall frame has no width for a side angle: from high over your
        // right shoulder, down the length of the table to him, drifting
        // with the ball
        tPos.set(0.85 + v.bx * 0.15, 2.05, 2.55);
        tLook.set(v.bx * 0.35, 0.9, -0.85 + v.bz * 0.15);
        fov = 56;
      } else {
        // The broadcast three-quarter: low from your right-hand corner,
        // looking up the table at him — the ball's curve and his stroke in
        // one frame — creeping in as the rally plays out
        const k = THREE.MathUtils.clamp((replay.t - replay.start) / Math.max(0.1, replay.end - replay.start), 0, 1);
        tPos.set(2.75 - k * 0.25, 1.42 - k * 0.06, 2.25 + THREE.MathUtils.clamp(v.bz * 0.18, -0.35, 0.35) - k * 0.2);
        tLook.set(v.bx * 0.3, 0.96, -0.55 + v.bz * 0.28);
        fov = 41;
      }
      rate = 4;
    } else if (camMode === 'celebrate') {
      celebT += dt;
      const a = celebT * 0.28;
      const r = camera.aspect < 0.8 ? 3.4 : 2.9;
      // Once the card is up it sits low, so the cup rides above it
      const carded = state.phase === 'over';
      tPos.set(Math.sin(a) * r, (carded ? 2.05 : 1.75) + Math.sin(celebT * 0.4) * 0.15, 0.45 + Math.cos(a) * r);
      tLook.set(0, T.height + (carded ? 0.02 : 0.55), 0.45);
      fov = camera.aspect < 0.8 ? 56 : 44;
      rate = celebT < 1.5 ? 1.5 : 3;
    }
    const k = camCut ? 1 : 1 - Math.exp(-dt * rate);
    if (camCut) camFov = fov;
    camCut = false;
    camPos.lerp(tPos, k);
    camLook.lerp(tLook, k);
    camFov += (fov - camFov) * k;
    camera.position.copy(camPos);
    if (shakeT > 0) {
      shakeT -= dt;
      if (!reduceMotion) {
        camera.position.x += (vrand() - 0.5) * 0.03;
        camera.position.y += (vrand() - 0.5) * 0.04;
      }
    }
    if (fovPunch > 0) fovPunch = Math.max(0, fovPunch - dt * 26);
    camera.fov = camFov + (reduceMotion ? 0 : fovPunch);
    camera.updateProjectionMatrix();
    camera.lookAt(camLook);
  }

  function renderFrame(dt, t) {
    const replaying = state.phase === 'replay';
    const v = replaying ? replayView() : liveView(dt);
    if (!replaying) record(v);

    /* The dead ball carries on bouncing for the picture */
    if (dead.on && !replaying) {
      dead.vel.y -= GRAV * dt;
      dead.vel.multiplyScalar(1 - 0.3 * dt);
      dead.pos.addScaledVector(dead.vel, dt);
      const onTable = Math.abs(dead.pos.x) < T.width / 2 && Math.abs(dead.pos.z) < T.length / 2;
      const floorY = onTable && dead.pos.y > T.height - 0.05 ? T.height + 0.023 : 0.023;
      if (dead.pos.y < floorY && dead.vel.y < 0) {
        dead.pos.y = floorY;
        dead.vel.y *= -0.55;
        dead.vel.x *= 0.85;
        dead.vel.z *= 0.85;
      }
    }

    /* My paddle. Its face pre-tilts with the gesture — closed for topspin,
       open for backspin — and the rubber glows the spin colour, so you can
       SEE what you would play if the ball arrived now. */
    const preSpin = THREE.MathUtils.clamp(-v.meDVY * 0.3, -1, 1);
    const preSide = THREE.MathUtils.clamp(v.meDVX * 0.16, -1, 1);
    // A bat with no player behind it only belongs in the player's own view
    myPaddle.visible = camMode === 'play' || camMode === 'replay';
    const lean = v.mpX - v.meX;
    myPaddle.position.x = v.mpX;
    myPaddle.position.z = v.mpZ;
    myPaddle.rotation.y = THREE.MathUtils.clamp(v.meVx * 0.06 - lean * 0.5, -0.45, 0.45);
    myPaddle.rotation.z = THREE.MathUtils.clamp(-v.meVx * 0.09 - v.meDVX * 0.06 - lean * 1.2, -0.7, 0.7);
    const sw = Math.sin(v.meSwing * Math.PI);
    const dir = v.meSpin < -0.25 ? -1 : 1;
    const idle = Math.sin(t * 2.1) * 0.008 * (1 - v.mpReach);
    myPaddle.position.y = v.mpY + idle + sw * 0.07 * dir;
    // Squared up to the ball as it arrives (the face turns to the net)
    myPaddle.rotation.x = -0.4 + v.mpReach * 0.22 - preSpin * 0.22 - sw * 0.8 * dir;
    const flick = Math.min(1, Math.hypot(preSpin, preSide) * 1.3);
    spinColor(preSpin, preSide, rubber.emissive);
    rubber.emissiveIntensity = flick * 0.55;
    if (hitGlow > 0.01) {
      hitGlow *= Math.exp(-dt * (replaying ? 3 : 7));
      rubber.emissive.lerp(hitGlowC, Math.min(1, hitGlow));
      rubber.emissiveIntensity = Math.max(rubber.emissiveIntensity, hitGlow * 0.6);
    }
    myPaddle.localToWorld(bladeA.set(0, 0.03, 0));
    myPaddle.localToWorld(bladeB.set(0, 0.21, 0));
    swooshMe.sample(bladeA, bladeB, dt);

    poseOpponent(v, t, dt);

    /* Ball, spin made visible: the print turns with the spin */
    ball.visible = v.bvis;
    halo.visible = v.bvis;
    ball.position.set(v.bx, v.by, v.bz);
    halo.position.copy(ball.position);
    const dirZ = Math.sign(v.vz) || 1;
    ball.rotation.x += v.st * 55 * dt * dirZ * (replaying ? 0.4 : 1);
    ball.rotation.y += v.ss * 40 * dt;
    const overTable = Math.abs(v.bx) < T.width / 2 && Math.abs(v.bz) < T.length / 2;
    const ground = overTable && v.by > T.height - 0.05 ? T.height + 0.024 : 0.012;
    blob.position.set(v.bx, ground, v.bz);
    const lift = Math.max(0, v.by - ground);
    blob.scale.setScalar(0.09 + lift * 0.18);
    blob.material.opacity = Math.max(0, 0.42 - lift * 0.3);
    blob.visible = v.bvis;
    if (v.bvis && v.live) {
      spinColor(v.st, v.ss, tmpC);
      trail.push(ball.position, tmpC, v.smash ? 1.6 : 1);
    }
    trail.update(dt * (replaying ? 0.4 : 1), camera.position);

    /* Landing marker fades after it has done its job */
    if (marker.visible) {
      marker.userData.t += dt;
      marker.material.opacity = Math.max(0, 0.8 - marker.userData.t * 0.5);
      marker.scale.setScalar(0.2 + Math.sin(marker.userData.t * 7) * 0.022);
      if (marker.material.opacity <= 0) marker.visible = false;
    }

    /* Net shiver after a net ball */
    if (net.amp > 0) {
      net.t += dt;
      const amp = net.amp * Math.exp(-net.t * 5);
      const pos = hall.refs.net.geometry.attributes.position;
      const baseArr = hall.refs.netBase;
      for (let i = 0; i < pos.count; i++) {
        const x = baseArr[i * 3];
        const yk = (baseArr[i * 3 + 1] / T.netH + 0.5); // 0 at the table, 1 at the tape
        pos.setZ(i, Math.sin(net.t * 38) * amp * Math.exp(-(((x - net.x) / 0.35) ** 2)) * (0.3 + yk));
      }
      pos.needsUpdate = true;
      if (amp < 0.0005) net.amp = 0;
    }

    rings.update(dt);
    sparks.update(dt);

    /* Crowd: excitement from the rally, silence for match point */
    const excite = state.phase === 'rally' || state.phase === 'point' ? smooth(3, 14, state.rallyHits) : 0;
    crowd.update(t, dt, v.bvis ? ballW.set(v.bx, v.by, v.bz) : null, { excite, hush: drama.v });
    sfx.crowdLevel(state.phase === 'celebrate' ? 1 : Math.max(0, excite * 0.8 + 0.15 - drama.v * 0.15));
    board.update(dt);

    /* Match-point drama */
    drama.v += (drama.target - drama.v) * Math.min(1, dt * 2.5);
    hemi.intensity = HEMI * (1 - 0.5 * drama.v);
    key.intensity = 1.55 * (1 + 0.28 * drama.v);
    pendants[2].intensity = 5 * (1 - 0.55 * drama.v);
    hall.refs.lampMats.forEach((l, i) => {
      l.mat.uniforms.uIntensity.value = l.base * (i < 2 ? 1 + 0.9 * drama.v : 1 - 0.7 * drama.v);
    });
    // Wrapped: the motes drift on a float clock, and a clock that runs for
    // hours loses the precision their slow drift needs on mediump GPUs
    hall.refs.dust.material.uniforms.uTime.value = t % 2048;
    hall.refs.dust.material.uniforms.uIntensity.value = 1 + drama.v * 0.8;
    post.u.uVignette.value = 0.3 + drama.v * 0.6 + (replaying ? 0.25 : 0);
    if (drama.mine) post.u.uTint.value.setRGB(1.1, 1.0, 0.82);
    else post.u.uTint.value.setRGB(1.12, 0.86, 0.84);
    post.u.uTintAmt.value = drama.v * 0.45;
    post.u.uFlash.value *= Math.exp(-dt * 14);
    post.u.uFringe.value *= Math.exp(-dt * 10);
    post.bloom.strength = 0.34 + excite * 0.12 + (state.phase === 'celebrate' ? 0.15 : 0);

    /* The cup rises for the champion */
    if (trophy.visible) {
      const rise = smooth(0.3, 2.0, celebT);
      trophy.position.set(0, T.height - 0.75 + rise * 0.83, 0.45);
      trophy.rotation.y = t * 0.6;
      trophyShaft.material.uniforms.uIntensity.value = 0.12 * rise;
      if (rise > 0.5 && vrand() < dt * 14) {
        tmpV.set((vrand() - 0.5) * 0.4, T.height + 0.2 + vrand() * 0.5, 0.45 + (vrand() - 0.5) * 0.4);
        sparks.burst(tmpV, tmpC.setHex(0xffd166), 3, 0.6, vrand);
      }
    }
    const overTop = (x, z) => Math.abs(x) < T.width / 2 && Math.abs(z) < T.length / 2;
    confetti.update(dt, t, (x, z) => (overTop(x, z) ? T.height + 0.003 : 0.004));

    updateCamera(v, t, dt);
    hall.updateReflections(camera.position);
    drawFrame();
    watchdog.afterFrame();
  }

  // Everything is in the scene now (the cup, the crowd's poses and the
  // markers included — compile visits hidden objects too): compile it all
  // for the target the first frame will actually render into
  await precompile(renderer, scene, camera, { target: usePost ? post.composer.renderTarget1 : null });

  showMenu();
  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
    if (sfx.ctx) {
      if (document.hidden) sfx.ctx.suspend();
      else sfx.ctx.resume();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  /* ---- Debug API -------------------------------------------------------- */

  window.__ppPingis = {
    state,
    ball: b,
    me,
    ai,
    scene,
    camera,
    foe: () => foe,
    startGame,
    startTournament,
    startSingle,
    beginMatch,
    beginPoint,
    playerServe,
    showMenu,
    setPaddle(x) {
      me.x = x;
      me.aimX = x;
      me.vx = 0;
    },
    /** Framing check: where a world point lands on screen, in pixels. */
    project(x, y, z) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      return [Math.round((p.x * 0.5 + 0.5) * viewW), Math.round((-p.y * 0.5 + 0.5) * viewH)];
    },
    camState() {
      return { pos: camera.position.toArray().map((v) => +v.toFixed(2)), fov: +camera.fov.toFixed(1), mode: camMode };
    },
    /** Screenshot helper: hold everything on the current frame. */
    freeze(on) {
      frozen = on;
    },
    /** Balance harness: play out matches without paying for the picture. */
    setRender(on) {
      renderOn = on;
    },
    forcePoint(mine = true) {
      if (state.phase === 'serve' || state.phase === 'rally') {
        b.lastHitter = mine ? 'me' : 'ai';
        b.bounces = 1;
        scorePoint(mine);
      }
    },
    /** Test helper: set the score mid-match (e.g. to see match point). */
    setPoints(my, them) {
      state.myPts = my;
      state.aiPts = them;
      renderPts();
    },
    winMatch() {
      // Test helper: skip the rally race entirely and settle the match
      if (state.phase === 'matchend' || state.phase === 'over') return;
      if (state.phase === 'intro') beginMatch();
      state.myPts = POINTS_TO_WIN;
      state.aiPts = 0;
      b.live = false;
      renderPts();
      endMatch(true);
    },
    info() {
      renderer.info.autoReset = false;
      renderer.info.reset();
      drawFrame();
      const r = { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio, tier };
      renderer.info.autoReset = true;
      return r;
    }
  };

  /* ---- Teardown --------------------------------------------------------- */

  function destroy() {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    hudHost.removeEventListener('click', onClick);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp);
    realTimers.forEach((id) => clearTimeout(id));
    timers.length = 0;
    hud.dispose();
    delete window.__ppPingis;
    gfx.dispose();
    watchdog.dispose();

    // People first: they hold shared, reference-counted materials that the
    // generic sweep below must not dispose out from under them
    if (foe) foe.dispose();
    foe = null;
    crowd.dispose();
    disposeTree(foePaddle);
    disposeTree(scene);
    glow.dispose();
    envRT.dispose();
    board.dispose();
    if (hall.refs.reflector) hall.refs.reflector.dispose();
    post.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (sfx.ctx) sfx.ctx.close();
    canvasHost.classList.remove('pg-playing');
    container.innerHTML = '';
  }

  return { destroy };
}

export default createPingis;
export { OPPONENTS, MEDAL_NAMES };
