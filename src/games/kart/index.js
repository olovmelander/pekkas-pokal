/** Pekkas Gokart — Varggropen 2012, a three-lap arcade race at golden hour. */
import { createArcade } from '../shared/arcade.js';
import { createCircuit, createKart } from './world.js';
import { createKartCamera } from './camera.js';
import { createEffects } from './effects.js';
import { createKartAudio } from './audio.js';
import { createKartHud } from './hud.js';
import { createKartInput } from './input.js';
import { goldenHour, FOG_COLOR } from './atmosphere.js';
import { LAPS, clamp, slipstreamFactor, newDriver, stepDriver, stepRival, resolveContact, markFinish, raceStandings, raceScore, formatTime } from './physics.js';

export const layout = 'full';
const RIVALS = [
  { name: 'Jonas', full: 'Jonas Eriksson', color: 0xe66b52, pace: 16.15 },
  { name: 'Erik', full: 'Erik Vallgren', color: 0x6caac5, pace: 15.75 },
  { name: 'Viktor', full: 'Viktor Jones', color: 0x9fae66, pace: 15.3 },
  { name: 'Per', full: 'Per Vikman', color: 0xbb8ad8, pace: 14.85 },
  { name: 'Rickard', full: 'Rickard Nilsson', color: 0xece3c7, pace: 14.45 }
];

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
  const player = newDriver(-19, -1.3);
  const kart = createKart(0xe9b748, 6, 'Viktor Jones');
  scene.add(kart.root);
  const opponents = RIVALS.map((rival, index) => {
    const model = createKart(rival.color, index + 1, rival.full);
    scene.add(model.root);
    return { ...rival, ...newDriver(-14.5 + index * 3.4, index % 2 ? -1.5 : 1.5), model };
  });
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
  let countdown = 3;
  let oldCountdown = -1;
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

  function start() {
    Object.assign(player, newDriver(-19, -1.3));
    opponents.forEach((opponent, i) => Object.assign(opponent, newDriver(-14.5 + i * 3.4, i % 2 ? -1.5 : 1.5)));
    state = 'countdown';
    resetFeel();
    elapsed = 0;
    countdown = 3;
    oldCountdown = -1;
    lap = 1;
    incidents = 0;
    lapStarted = 0;
    bestLap = Infinity;
    lastLap = lapDelta = null;
    previousPosition = 6;
    placeMessageCooldown = 0;
    clearControls();
    track.reset();
    interfaceEl.dataset.state = 'racing';
    game.hidePanel();
    game.setHUD('VARV 1 / 3', 'Gör dig redo', 'Guld är din kart. Håll GAS eller ↑ / W.');
  }

  function finish() {
    state = 'result';
    clearControls();
    interfaceEl.dataset.state = 'menu';
    const position = positionOfPlayer();
    elapsed = player.finishTime ?? elapsed;
    bestLap = Math.min(bestLap, elapsed - lapStarted);
    finishedScore = raceScore(position, elapsed * 260 / track.length, incidents);
    const best = game.loadBest();
    game.saveBest(finishedScore);
    const rankings = raceStandings([player, ...opponents]);
    const podium = position === 1 ? 'Varggropens mästare!' : position <= 3 ? 'Du tar en pallplats!' : 'Målflaggan är din!';
    game.tone(position <= 3 ? 740 : 440, 0.24, 'triangle');
    game.showPanel({
      eyebrow: `VARGGROPEN · PLATS ${position} AV 6`, title: podium,
      body: `<p>Tre varv på <strong>${formatTime(elapsed)}</strong> · snabbaste varv ${formatTime(bestLap)}.</p><p><strong>${finishedScore.toLocaleString('sv-SE')} poäng</strong>${finishedScore > best ? ' · Nytt rekord!' : ` · Rekord ${Math.max(best, finishedScore).toLocaleString('sv-SE')}`}</p><p>${rankings.map((racer, index) => `${index + 1}. ${racer === player ? '<strong>Du</strong>' : racer.full}${racer.finishTime !== null ? ` · ${formatTime(racer.finishTime)}` : ' · på banan'}`).join('<br>')}</p><p>Bromsa före kurvan, träffa kurvans innerkant och gasa när banan öppnar sig. ${incidents === 0 ? 'Ren körning — inga sammanstötningar!' : `${incidents} ${incidents === 1 ? 'sammanstötning' : 'sammanstötningar'} under loppet.`}</p>`,
      button: 'Kör ett nytt race', onStart: start
    });
  }

  function positionModel(model, driver, steering = 0) {
    const s = track.sample(driver.distance, driver.lane);
    model.root.position.copy(s.position);
    model.root.position.y += 0.04;
    model.root.rotation.order = 'YXZ';
    model.root.rotation.x = s.pitch;
    model.root.rotation.y = s.angle + steering * 0.065 - driver.lateral * (driver.skidding ? 0.035 : 0.012);
    model.root.rotation.z = s.roll - steering * 0.035;
    model.steering.rotation.z = -steering * 0.3;
    model.wheels.forEach(wheel => { wheel.rotation.x = driver.distance / 0.31; });
    model.frontPivots.forEach(pivot => { pivot.rotation.y = steering * 0.23 + driver.lateral * 0.018; });
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
    // eslint-disable-next-line no-undef
    onStart: () => (typeof startRace === 'function' ? startRace(hud.readSetup()) : start())
  });

  game.onFrame((dt, time) => {
    hudClock += dt;
    if (state === 'countdown') {
      countdown -= dt;
      const digit = Math.ceil(countdown);
      if (digit !== oldCountdown) {
        oldCountdown = digit;
        game.tone(digit > 0 ? 330 : 660, 0.12, 'triangle');
      }
      if (countdown <= 0) state = 'racing';
    }
    let steer = 0;
    if (state === 'racing') {
      elapsed += dt;
      const controls = input.read();
      ({ steer } = controls);
      const throttle = controls.throttle > 0;
      const brake = controls.brake > 0;
      const slipstream = slipstreamFactor(player, opponents, track.length);
      skidClock += dt;
      if (player.skidding && player.speed > 6 && skidClock > 0.06) { track.skid(player.distance, player.lane); skidClock = 0; }
      const previousDistance = player.distance;
      const events = stepDriver(player, { steer, throttle, brake, slipstream }, track.curvature(player.distance), dt);
      if (events.barrier) {
        incidents++;
        game.toast('Däckvallen! Styr tillbaka mot asfalten.');
        game.tone(100, 0.09, 'sawtooth');
      }
      const drivers = [player, ...opponents];
      opponents.forEach((opponent, i) => {
        const previous = opponent.distance;
        if (opponent.finishTime === null) stepRival(opponent, i, drivers, track, dt);
        else opponent.distance += opponent.speed * dt * 0.6;
        markFinish(opponent, previous, track.length * LAPS, elapsed, dt);
      });
      for (let a = 0; a < drivers.length; a++) for (let b = a + 1; b < drivers.length; b++) {
        if (drivers[a].finishTime !== null || drivers[b].finishTime !== null) continue;
        if (resolveContact(drivers[a], drivers[b], track.length) && a === 0) {
          incidents++;
          game.tone(140, 0.05, 'triangle');
        }
      }
      markFinish(player, previousDistance, track.length * LAPS, elapsed, dt);
      const newLap = Math.max(1, Math.min(LAPS, Math.floor(player.distance / track.length) + 1));
      if (newLap > lap) {
        const crossedAt = elapsed - dt + dt * clamp((lap * track.length - previousDistance) / Math.max(0.001, player.distance - previousDistance), 0, 1);
        lastLap = crossedAt - lapStarted;
        lapDelta = Number.isFinite(bestLap) ? lastLap - bestLap : null;
        bestLap = Math.min(bestLap, lastLap);
        lapStarted = crossedAt;
        lap = newLap;
        game.toast(`${lap === 3 ? 'SISTA VARVET' : 'VARV 2'} · ${formatTime(lastLap)}${lapDelta !== null && lapDelta < 0 ? ' · snabbare!' : ''}`);
        track.cheer();
        game.tone(880, 0.16, 'triangle');
      }
      const position = positionOfPlayer();
      placeMessageCooldown = Math.max(0, placeMessageCooldown - dt);
      if (position < previousPosition && placeMessageCooldown === 0) {
        game.toast(position === 1 ? 'DU TAR LEDNINGEN!' : `OMKÖRNING · plats ${position}`);
        placeMessageCooldown = 2;
      }
      previousPosition = position;
      if (player.finishTime !== null) finish();
    }
    track.update(dt, time);
    positionModel(kart, player, steer);
    kart.update(dt, time);
    opponents.forEach((opponent) => { positionModel(opponent.model, opponent); opponent.model.update(dt, time); });
    feel(dt, time, {
      state, mode: 'race', lap, laps: LAPS, elapsed, lapStarted, bestLap, lastLap,
      lightsLit: 0, lightsOut: state === 'racing', jumpStart: false, player, opponents, position: positionOfPlayer()
    });
    if (hudClock > 0.5) {
      hudClock = 0;
      if (state === 'racing') game.setHUD('PEKKAS GOKART · 2012', 'Varggropen', Number.isFinite(bestLap) ? `Bästa varv ${formatTime(bestLap)}` : 'Gas · broms · hitta den rena linjen');
    }
  });

  return {
    destroy() {
      clearControls(); sound.destroy(); effects.dispose(); hud.destroy();
      track.dispose(); kart.dispose(); opponents.forEach(opponent => opponent.model.dispose()); game.destroy();
    }
  };
}
