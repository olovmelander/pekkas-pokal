/** Pekkas Gokart — Varggropen 2012, a three-lap arcade race at golden hour. */
import { createArcade } from '../shared/arcade.js';
import { createCircuit, createKart } from './world.js';
import { createKartCamera } from './camera.js';
import { createEffects } from './effects.js';
import { createKartAudio } from './audio.js';
import { createKartHud } from './hud.js';
import { createKartInput } from './input.js';
import { goldenHour, FOG_COLOR } from './atmosphere.js';
import { LAPS, clamp, newDriver, stepField, markFinish, raceStandings, raceScore, formatTime } from './physics.js';
import { RIVAL_PROFILES, DIFFICULTIES, buildRacingLine, createBrain, rivalInput, catchupFactor } from './ai.js';
import { createGhostRecorder, loadGhost, saveGhost, ghostAt, ghostTimeAt } from './ghost.js';
import { GRID_SLOTS } from './surfaces.js';

export const layout = 'full';
const RIVALS = RIVAL_PROFILES;
const TIME_TRIAL_LAPS = 5;
// Pole first. The careful drivers start ahead, Jonas from row three, you last.
const GRID = GRID_SLOTS?.length >= 6 ? GRID_SLOTS : Array.from({ length: 6 }, (_, i) => ({ distance: -2.2 - i * 3.4, lane: i % 2 ? -1.5 : 1.5 }));
const RIVAL_SLOT = [4, 3, 2, 1, 0];
const PLAYER_SLOT = 5;
const GRID_WAIT = 1.1, LIGHT_GAP = 0.8;
const RIVAL_ASSIST = 1.2;

export default async function createGokart(container) {
  const game = createArcade(container, {
    id: 'kart-2012', title: 'Pekkas Gokart', subtitle: 'VARGGROPEN · 2012',
    accent: '#f2c05c', sky: FOG_COLOR, fog: FOG_COLOR
  });
  const { scene, camera } = game;
  game.root.classList.add('kart-game');
  camera.far = 550;
  // Golden hour: low warm sun, long shadows, warm haze, cool sky fill (atmosphere.js).
  const light = goldenHour(game, { phone: matchMedia('(pointer: coarse)').matches });
  const track = createCircuit(scene, { reducedMotion: game.reducedMotion, anisotropy: Math.min(8, game.renderer.capabilities.getMaxAnisotropy()), camera });
  const player = newDriver(GRID[PLAYER_SLOT].distance, GRID[PLAYER_SLOT].lane);
  const line = buildRacingLine(track);
  let brains = [];
  const kart = createKart(0xe9b748, 6, 'Viktor Jones');
  scene.add(kart.root);
  const opponents = RIVALS.map((rival, index) => {
    const model = createKart(rival.color, index + 1, rival.full);
    scene.add(model.root);
    return { ...rival, ...newDriver(GRID[RIVAL_SLOT[index]].distance, GRID[RIVAL_SLOT[index]].lane, { assist: RIVAL_ASSIST }), model };
  });
  // Time-trial ghost: world's translucent kart when available.
  const ghostKart = createKart(0xe9b748, 6, 'Viktor Jones');
  const canGhost = typeof ghostKart.setGhost === 'function';
  if (canGhost) ghostKart.setGhost(true);
  ghostKart.root.visible = false;
  scene.add(ghostKart.root);
  const ghostDriver = { ...newDriver(0, 0), ghost: true };
  let state = 'menu';
  // Feel (feel.js modules): HUD, controls, particles, sound and the camera views.
  const coarse = matchMedia('(pointer: coarse)').matches;
  const sound = createKartAudio(game, { trackLength: track.length });
  let shake = 0;
  const hud = createKartHud(game, {
    track, rivals: RIVALS,
    onEvent(name, detail = {}) { sound.event(name, detail); if (detail.shake) shake = Math.max(shake, detail.shake); }
  });
  const interfaceEl = hud.el;
  const effects = createEffects(scene, track, { reducedMotion: game.reducedMotion, coarse, overlay: interfaceEl });
  let savedView = 'chase';
  try { savedView = localStorage.getItem('pp-kart-view') === 'nose' ? 'nose' : 'chase'; } catch { /* private mode */ }
  const chase = createKartCamera(camera, track, { reducedMotion: game.reducedMotion, view: savedView });
  hud.setView(chase.view);
  const input = createKartInput(game, interfaceEl, {
    onView() {
      const view = chase.toggleView();
      hud.setView(view);
      try { localStorage.setItem('pp-kart-view', view); } catch { /* private mode */ }
    }
  });
  const clearControls = () => input.clear();
  let elapsed = 0;
  let mode = 'race';
  let difficulty = 'normal';
  let laps = LAPS;
  let lightsLit = 0;
  let lightsOut = false;
  let lightsClock = 0;
  let lightsHold = 1;
  let jumpStart = false;
  let jumpClock = 0;
  let reaction = null;
  let frozen = false;
  let scriptedInput = null;
  let lapTimes = [];
  const recorder = createGhostRecorder();
  // Time trial: the stored best lap, its ghost and the live delta for the HUD.
  const trial = { ghost: null, delta: null, bestLap: Infinity, lastLap: null, newRecord: false };
  let lap = 1;
  let incidents = 0;
  let lapStarted = 0;
  let bestLap = Infinity;
  let previousPosition = 6;
  let placeMessageCooldown = 0;
  let hudClock = 0;
  let finishedScore = 0;
  let lastLap = null;
  let lapDelta = null;
  let skidClock = 0;
  const positionOfPlayer = () => raceStandings([player, ...opponents]).indexOf(player) + 1;

  function placeOnGrid() {
    const solo = mode === 'time';
    Object.assign(player, newDriver(solo ? GRID[0].distance : GRID[PLAYER_SLOT].distance, solo ? 0 : GRID[PLAYER_SLOT].lane));
    opponents.forEach((opponent, i) => {
      const slot = GRID[RIVAL_SLOT[i]];
      Object.assign(opponent, newDriver(slot.distance, slot.lane, { assist: RIVAL_ASSIST }));
      opponent.ghost = solo;
      opponent.model.root.visible = !solo;
    });
    [player, ...opponents].forEach((driver) => { driver.held = true; });
  }

  /** Start panel entry point: mode 'race' | 'time', difficulty 'easy' | 'normal' | 'hard'. */
  function startRace({ mode: nextMode = 'race', difficulty: nextDifficulty = 'normal' } = {}) {
    mode = nextMode === 'time' ? 'time' : 'race';
    difficulty = DIFFICULTIES[nextDifficulty] ? nextDifficulty : 'normal';
    laps = mode === 'time' ? TIME_TRIAL_LAPS : LAPS;
    placeOnGrid();
    const seed = (Date.now() % 100000) + 1;
    brains = RIVALS.map((profile, i) => createBrain(profile, { line, difficulty, seed: seed * 7 + i }));
    state = 'grid';
    lightsLit = 0; lightsOut = false; lightsClock = 0; lightsHold = 0.4 + Math.random();
    jumpStart = false; jumpClock = 0; reaction = null;
    trial.ghost = mode === 'time' ? loadGhost() : null;
    trial.bestLap = trial.ghost?.lapTime ?? Infinity;
    trial.delta = trial.lastLap = null; trial.newRecord = false;
    recorder.start();
    ghostKart.root.visible = false;
    track.setStartLights?.(0, false);
    resetFeel();
    elapsed = 0;
    lap = 1;
    incidents = 0;
    lapStarted = 0;
    lapTimes = [];
    bestLap = Infinity;
    lastLap = lapDelta = null;
    previousPosition = mode === 'time' ? 1 : 6;
    placeMessageCooldown = 0;
    clearControls();
    track.reset();
    interfaceEl.dataset.state = 'racing';
    game.hidePanel();
    game.setHUD(`VARV 1 / ${laps}`, 'Gör dig redo', mode === 'time' ? 'Tidskörning. Vänta tills de röda ljusen slocknar.' : 'Vänta tills de röda ljusen slocknar, gasa sedan.');
  }

  /** Five red lights 0.8 s apart, then out after a random 0.4–1.4 s hold. */
  function updateLights(dt, controls) {
    lightsClock += dt;
    if (state === 'grid') {
      if (lightsClock < GRID_WAIT) return;
      state = 'lights'; lightsClock = 0; lightsLit = 1; track.setStartLights?.(1, false);
    }
    if (lightsLit < 5 && lightsClock >= LIGHT_GAP * lightsLit) { lightsLit++; track.setStartLights?.(lightsLit, false); }
    // Rolling on the throttle before the lights go out is a jump start.
    if (controls.throttle > 0.2) jumpClock += dt;
    if (jumpClock > 0.12) jumpStart = true;
    if (lightsLit === 5 && lightsClock >= LIGHT_GAP * 4 + lightsHold) {
      state = 'racing'; lightsOut = true; elapsed = 0;
      track.setStartLights?.(0, true);
      player.held = false;
      if (jumpStart) {
        player.launchPenalty = 1.4;
        game.toast('Tjuvstart! Hjulen spinner. Vänta tills ljusen slocknar.');
      }
    }
  }

  function completeTrialLap(lapTime, flying) {
    const run = recorder.finish(lapTime, track.length);
    trial.lastLap = lapTime;
    if (!flying || !(lapTime < trial.bestLap)) return;
    trial.bestLap = lapTime;
    trial.ghost = run;
    trial.newRecord = true;
    saveGhost(run);
    game.toast(`Nytt varvrekord · ${formatTime(lapTime)} · spöket kör nu ditt varv`);
  }

  /** One fixed physics frame: lights, inputs, all karts, laps and the ghost. */
  function simulate(dt, controls) {
    if (state === 'grid' || state === 'lights') updateLights(dt, controls);
    if (!['grid', 'lights', 'racing'].includes(state)) return;
    if (state === 'racing') elapsed += dt;
    const solo = mode === 'time';
    const drivers = solo ? [player] : [player, ...opponents];
    if (state === 'racing' && reaction === null && controls.throttle > 0.2) {
      reaction = elapsed;
      if (!jumpStart && reaction < 0.3) game.toast(`Blixtstart! Reaktion ${reaction.toFixed(2).replace('.', ',')} s`);
    }
    const inputs = [{ steer: controls.steer, throttle: controls.throttle, brake: controls.brake }];
    if (!solo) {
      opponents.forEach((opponent, i) => {
        const brain = brains[i];
        opponent.held = state !== 'racing' || elapsed < brain.reaction;
        brain.catchup = catchupFactor(opponent.distance, player.distance, brain.level.catchup);
        inputs.push(rivalInput(opponent, brain, { line, track, drivers, dt, cooldown: opponent.finishTime !== null }));
      });
    }
    const before = drivers.map((driver) => driver.distance);
    const events = stepField(drivers, inputs, track, dt);
    for (const event of events) {
      if (event.type === 'barrier' && event.driver === player && state === 'racing') {
        incidents++;
        game.toast('Däckvallen! Styr tillbaka mot asfalten.');
      }
      if (event.type === 'contact' && (event.a === player || event.b === player)) incidents++;
      if (event.type === 'barrier' && state === 'racing' && event.driver) track.incident?.(event.driver.distance);
    }
    if (state !== 'racing') return;
    drivers.forEach((driver, i) => markFinish(driver, before[i], track.length * laps, elapsed, dt));
    skidClock += dt;
    if (player.skidding && player.speed > 6 && skidClock > 0.06) { track.skid(player.distance, player.lane); skidClock = 0; }
    const previousDistance = before[0];
    const newLap = Math.max(1, Math.min(laps, Math.floor(player.distance / track.length) + 1));
    if (newLap > lap) {
      const crossedAt = elapsed - dt + dt * clamp((lap * track.length - previousDistance) / Math.max(0.001, player.distance - previousDistance), 0, 1);
      lastLap = crossedAt - lapStarted;
      lapTimes.push(lastLap);
      lapDelta = Number.isFinite(bestLap) ? lastLap - bestLap : null;
      if (mode === 'time') completeTrialLap(lastLap, lap > 1);
      bestLap = Math.min(bestLap, lastLap);
      lapStarted = crossedAt;
      lap = newLap;
      recorder.start();
      game.toast(`${lap === laps ? 'SISTA VARVET' : `VARV ${lap}`} · ${formatTime(lastLap)}${lapDelta !== null && lapDelta < 0 ? ' · snabbare!' : ''}`);
      track.cheer();
    }
    const lapTime = elapsed - lapStarted, lapDistance = player.distance - (lap - 1) * track.length;
    if (mode === 'time') {
      recorder.record(lapTime, lapDistance, player.lane, player.heading);
      const reference = lap > 1 && trial.ghost ? ghostTimeAt(trial.ghost, lapDistance) : null;
      trial.delta = Number.isFinite(reference) && lapDistance > 5 ? lapTime - reference : null;
    }
    const position = positionOfPlayer();
    placeMessageCooldown = Math.max(0, placeMessageCooldown - dt);
    if (!solo && position < previousPosition && placeMessageCooldown === 0) {
      game.toast(position === 1 ? 'DU TAR LEDNINGEN!' : `OMKÖRNING · plats ${position}`);
      placeMessageCooldown = 2;
    }
    previousPosition = position;
    if (player.finishTime !== null || (mode === 'time' && lap >= laps && player.distance >= track.length * laps)) finish();
  }

  /** The ghost replays the best flying lap from the second lap on. */
  function updateGhost() {
    const pose = mode === 'time' && state === 'racing' && lap > 1 && trial.ghost ? ghostAt(trial.ghost, elapsed - lapStarted) : null;
    if (!pose || pose.done) { ghostKart.root.visible = false; return null; }
    Object.assign(ghostDriver, { distance: (lap - 1) * track.length + pose.distance, lane: pose.lane, heading: pose.heading });
    ghostKart.root.visible = canGhost;
    if (canGhost) positionModel(ghostKart, ghostDriver);
    return ghostDriver;
  }

  function finish() {
    state = 'result';
    clearControls();
    interfaceEl.dataset.state = 'menu';
    ghostKart.root.visible = false;
    const position = mode === 'time' ? 1 : positionOfPlayer();
    elapsed = player.finishTime ?? elapsed;
    if (lapTimes.length < laps) lapTimes.push(elapsed - lapStarted);
    bestLap = Math.min(bestLap, elapsed - lapStarted);
    track.celebrate?.(position);
    if (mode === 'time') {
      if (lapTimes.length > 1) completeTrialLap(lapTimes[lapTimes.length - 1], true);
      const flying = lapTimes.slice(1), sessionBest = Math.min(...flying);
      game.showPanel({
        eyebrow: 'VARGGROPEN · TIDSKÖRNING', title: trial.newRecord ? 'Nytt varvrekord!' : 'Tidskörningen är klar',
        body: `<p>Bästa flygande varv <strong>${formatTime(sessionBest)}</strong>${Number.isFinite(trial.bestLap) ? ` · rekord ${formatTime(trial.bestLap)}` : ''}.</p><p>${lapTimes.map((time, index) => `Varv ${index + 1}${index === 0 ? ' (stående start)' : ''} · ${formatTime(time)}`).join('<br>')}</p><p>${trial.newRecord ? 'Spöket kör ditt nya rekordvarv nästa gång.' : 'Spöket visar ditt rekordvarv. Bromsa lite tidigare och gasa tidigare ut ur kurvan.'}</p>${hud.setupHTML({ mode, difficulty })}`,
        button: 'Kör igen', onStart: () => startRace(hud.readSetup())
      });
      return;
    }
    finishedScore = raceScore(position, elapsed * 260 / track.length, incidents);
    const best = game.loadBest();
    game.saveBest(finishedScore);
    const rankings = raceStandings([player, ...opponents]);
    const podium = position === 1 ? 'Varggropens mästare!' : position <= 3 ? 'Du tar en pallplats!' : 'Målflaggan är din!';
    const startNote = jumpStart ? ' Tjuvstarten kostade tid.' : Number.isFinite(reaction) && reaction < 0.3 ? ` Blixtstart på ${reaction.toFixed(2).replace('.', ',')} s.` : '';
    game.showPanel({
      eyebrow: `VARGGROPEN · PLATS ${position} AV 6`, title: podium,
      body: `<p>Tre varv på <strong>${formatTime(elapsed)}</strong> · snabbaste varv ${formatTime(bestLap)}.</p><p><strong>${finishedScore.toLocaleString('sv-SE')} poäng</strong>${finishedScore > best ? ' · Nytt rekord!' : ` · Rekord ${Math.max(best, finishedScore).toLocaleString('sv-SE')}`}</p><p>${rankings.map((racer, index) => `${index + 1}. ${racer === player ? '<strong>Du</strong>' : racer.full}${racer.finishTime !== null ? ` · ${formatTime(racer.finishTime)}` : ' · på banan'}`).join('<br>')}</p><p>Bromsa före kurvan, träffa kurvans innerkant och gasa när banan öppnar sig.${startNote} ${incidents === 0 ? 'Ren körning — inga sammanstötningar!' : `${incidents} ${incidents === 1 ? 'sammanstötning' : 'sammanstötningar'} under loppet.`}</p>${hud.setupHTML({ mode, difficulty })}`,
      button: 'Kör ett nytt race', onStart: () => startRace(hud.readSetup())
    });
  }

  /** Yaw comes from the physics heading; the front wheels show the real steering angle. */
  function positionModel(model, driver) {
    const s = track.sample(driver.distance, driver.lane);
    model.root.position.copy(s.position);
    model.root.position.y += 0.04;
    model.root.rotation.order = 'YXZ';
    model.root.rotation.x = s.pitch;
    model.root.rotation.y = s.angle + (driver.heading || 0);
    model.root.rotation.z = s.roll;
    const steer = driver.steerAngle || 0;
    model.steering.rotation.z = -steer * 1.8;
    model.wheels.forEach(wheel => { wheel.rotation.x = driver.distance / 0.31; });
    model.frontPivots.forEach(pivot => { pivot.rotation.y = steer; });
    // The driver leans into the corner and nods under braking (world.js).
    model.setDriverLean?.(Math.max(-1, Math.min(1, (driver.latAccel || 0) / 11)), Math.max(0, Math.min(1, -(driver.longAccel || 0) / 8)));
    return s;
  }

  function updateCamera(dt, time) {
    const focus = chase.update(player, state, dt, time, shake);
    shake = 0;
    light.follow(camera, focus);
  }

  /** Feel, once per frame after physics: camera, particles, sound and HUD.
   * The HUD derives the race moments (lights, laps, impacts, flag) from `info`. */
  function feel(dt, time, info) {
    input.state = info.state;
    updateCamera(dt, time);
    const rivalsOnTrack = info.mode === 'time' ? [] : info.opponents ?? [];
    effects.update(dt, [info.player, ...rivalsOnTrack], camera);
    sound.update(dt, info.player, rivalsOnTrack, info.state);
    const controlsHint = !coarse ? 'HÅLL ↑ / W FÖR ATT KÖRA' : input.autogas ? 'AUTOGAS PÅ · DU STYR OCH BROMSAR' : 'HÅLL GAS FÖR ATT KÖRA';
    hud.update(dt, info, { rpm: sound.rpm, controlsHint });
  }
  function resetFeel() {
    chase.reset(); hud.reset(); effects.reset(); sound.reset(); input.clear();
  }

  positionModel(kart, player);
  opponents.forEach((opponent) => positionModel(opponent.model, opponent));
  updateCamera(1, 0);
  game.setHUD('VARGGROPEN · 2012', 'Pekkas Gokart', 'Tre varv. Fem rivaler. En pokal.');
  game.showPanel({
    eyebrow: '2012 · VARGGROPEN', title: 'Pekkas Gokart',
    body: `<p>Varggropens 665 meter långa bana, varm asfalt och fem hungriga rivaler från 2012 års pall.</p>${hud.setupHTML()}<p><strong>Styr ← → / A D. Håll ↑ / W för gas.</strong> Bromsa med ↓ / S / mellanslag före en snäv kurva. Släpp gasen mitt i kurvan så glider baken ut; motstyr för att fånga den. C byter kameravy.</p><p>På telefon håller du GAS och styr med pilknapparna, eller drar med tummen på vänstra halvan. Slå på AUTOGAS så håller spelet gasen åt dig.</p><p><small>Bansträckningen följer klubbens flygfoto. Exakta höjder och 2012 års markeringar är tolkade.</small></p>`,
    button: 'Till startlinjen',
    onStart: () => startRace(hud.readSetup())
  });

  game.onFrame((dt, time) => {
    hudClock += dt;
    const controls = input.read(dt);
    if (!frozen) simulate(dt, scriptedInput ?? controls);
    track.update(dt, time);
    positionModel(kart, player);
    kart.update(dt, time);
    opponents.forEach((opponent) => { if (opponent.model.root.visible) { positionModel(opponent.model, opponent); opponent.model.update(dt, time); } });
    const ghost = updateGhost();
    if (ghost && canGhost) ghostKart.update(dt, time);
    feel(dt, time, {
      state, mode, difficulty, lap, laps, elapsed, lapStarted, bestLap, lastLap,
      lightsLit, lightsOut, jumpStart, reaction, trial, ghost,
      player, opponents: mode === 'time' ? [] : opponents, position: mode === 'time' ? 1 : positionOfPlayer()
    });
    if (hudClock > 0.5) {
      hudClock = 0;
      if (state === 'racing') game.setHUD('PEKKAS GOKART · 2012', 'Varggropen', Number.isFinite(bestLap) ? `Bästa varv ${formatTime(bestLap)}` : 'Gas · broms · hitta den rena linjen');
    }
  });

  // Test hook for the browser harness: inspect and drive the race without frames.
  const snapshotDriver = (driver) => {
    const keys = ['distance', 'lane', 'heading', 'yawRate', 'steerAngle', 'speed', 'slip', 'wheelspin', 'surface', 'skidding', 'hit', 'grip', 'slipstream', 'finishTime', 'held', 'launchPenalty'];
    return Object.fromEntries(keys.map((key) => [key, driver[key]]).concat(driver.name ? [['name', driver.name]] : []));
  };
  const hook = {
    snapshot: () => ({
      state, mode, difficulty, lap, laps, elapsed, lapStarted, bestLap, lastLap, lightsLit, lightsOut, jumpStart, reaction, incidents,
      position: mode === 'time' ? 1 : positionOfPlayer(),
      trial: { delta: trial.delta, bestLap: trial.bestLap, lastLap: trial.lastLap, newRecord: trial.newRecord, ghost: trial.ghost ? trial.ghost.lapTime : null },
      player: snapshotDriver(player), opponents: opponents.map(snapshotDriver)
    }),
    setInput(next) { scriptedInput = next ? { steer: Number(next.steer) || 0, throttle: Number(next.throttle) || 0, brake: Number(next.brake) || 0 } : null; },
    teleport({ distance = player.distance, lane = 0, heading = 0, speed = 0 } = {}) {
      Object.assign(player, { distance, lane, heading, u: speed, w: 0, yawRate: 0, speed, held: false });
    },
    freeze(on = true) { frozen = !!on; },
    steps(count = 1, dt = 1 / 60) {
      for (let i = 0; i < count; i++) simulate(dt, scriptedInput ?? input.read());
      return hook.snapshot();
    },
    startRace,
    feel: { chase, effects, sound, hud, input }
  };
  window.__ppKart = hook;

  return {
    startRace,
    destroy() {
      if (window.__ppKart === hook) delete window.__ppKart;
      clearControls(); sound.destroy(); effects.dispose(); hud.destroy();
      track.dispose(); kart.dispose(); ghostKart.dispose(); opponents.forEach(opponent => opponent.model.dispose()); game.destroy();
    }
  };
}
