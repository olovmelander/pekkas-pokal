/** Pekkas Gokart — Varggropen 2012, a three-lap arcade race at golden hour. */
import * as THREE from 'three';
import { createArcade } from '../shared/arcade.js';
import { hasCommandModifier } from '../shared/keyboard.js';
import { createCircuit, createKart } from './world.js';
import { createKartCamera } from './camera.js';
import { LAPS, TRACK_HALF_WIDTH, steeringFromButtons, clamp, cornerSpeed, slipstreamFactor, newDriver, stepDriver, stepRival, resolveContact, markFinish, raceStandings, raceScore, formatTime, engineFeedback } from './physics.js';

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
    accent: '#f2c05c', sky: 0xbacbc9, fog: 0xbacbc9
  });
  const { scene, camera, ui, keys } = game;
  game.root.classList.add('kart-game');
  camera.far = 550;
  scene.fog = new THREE.Fog(0xbacbc9, 105, 285);
  const sun = scene.children.find((object) => object.isDirectionalLight);
  if (sun) {
    sun.position.set(-40, 55, 30);
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, far: 180 });
    sun.shadow.camera.updateProjectionMatrix();
  }
  const track = createCircuit(scene, { reducedMotion: game.reducedMotion, anisotropy: Math.min(8, game.renderer.capabilities.getMaxAnisotropy()) });
  const player = newDriver(-19, -1.3);
  const kart = createKart(0xe9b748, 6, 'Viktor Jones');
  const engine = game.createVoice({ type: 'sawtooth', frequency: 55, gain: 0 });
  const tires = game.createVoice({ type: 'triangle', frequency: 185, gain: 0 });
  scene.add(kart.root);
  const opponents = RIVALS.map((rival, index) => {
    const model = createKart(rival.color, index + 1, rival.full);
    scene.add(model.root);
    return { ...rival, ...newDriver(-14.5 + index * 3.4, index % 2 ? -1.5 : 1.5), model };
  });
  const interfaceEl = document.createElement('div');
  interfaceEl.className = 'kart-interface';
  interfaceEl.dataset.state = 'menu';
  interfaceEl.innerHTML = `
    <div class="kart-race-meta"><strong data-position>6<small> / 6</small></strong><span data-lap>VARV 1 / 3</span><span data-time>0:00.0</span><span data-gap>STARTFÄLT</span></div>
    <svg class="kart-map" viewBox="-59 -52 118 104" role="img" aria-label="Bankarta med din guldfärgade kart och motståndarna"><path></path></svg>
    <div class="kart-countdown" role="status" aria-live="polite"></div>
    <div class="kart-dashboard"><div class="kart-speed"><b>0</b><small>KM/H</small></div><div class="kart-grip" role="meter" aria-label="Däckgrepp" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i></i></div><div class="kart-tip">HÅLL GAS · BROMSA FÖRE KURVAN</div></div>
    <div class="kart-controls">
      <div class="kart-control-group"><button type="button" data-control="left" aria-label="Styr vänster">←<small>A / ←</small></button><button type="button" data-control="right" aria-label="Styr höger">→<small>D / →</small></button></div>
      <div class="kart-control-group"><button type="button" data-control="brake" aria-label="Bromsa"><span>BROMS</span><small>S / ↓ / ␣</small></button><button type="button" data-control="throttle" aria-label="Håll för att gasa"><span>GAS</span><small>W / ↑</small></button></div>
    </div>`;
  ui.appendChild(interfaceEl);
  const find = (selector) => interfaceEl.querySelector(selector);
  const map = find('.kart-map');
  const { bounds } = track;
  map.setAttribute('viewBox', `${bounds.min.x - 8} ${bounds.min.z - 8} ${bounds.max.x - bounds.min.x + 16} ${bounds.max.z - bounds.min.z + 16}`);
  map.querySelector('path').setAttribute('d', `${Array.from({ length: 101 }, (_, i) => {
    const point = track.sample(i / 100 * track.length).position;
    return `${i ? 'L' : 'M'}${point.x.toFixed(1)},${point.z.toFixed(1)}`;
  }).join(' ')} Z`);
  const dots = [...opponents, { color: 0xffdc75 }].map((driver) => {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', driver === opponents[0] ? 3.5 : 3.2);
    dot.setAttribute('fill', `#${driver.color.toString(16).padStart(6, '0')}`);
    map.appendChild(dot);
    return dot;
  });
  dots[dots.length - 1].setAttribute('r', '4.5');
  let state = 'menu';
  const held = new Map();
  const pointerControls = new Map();
  const pressed = control => [...held.values(), ...pointerControls.values()].includes(control);
  const refreshButton = control => find(`[data-control="${control}"]`).classList.toggle('is-held', pressed(control));
  function releasePointer(event) {
    const control = pointerControls.get(event.pointerId);
    if (!control) return;
    pointerControls.delete(event.pointerId);
    refreshButton(control);
  }
  interfaceEl.querySelectorAll('[data-control]').forEach((button) => {
    game.listen(button, 'pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!['racing', 'countdown'].includes(state) || game.paused) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      const { control } = button.dataset;
      pointerControls.set(event.pointerId, control);
      refreshButton(control);
    });
    game.listen(button, 'pointerup', releasePointer);
    game.listen(button, 'pointercancel', releasePointer);
    game.listen(button, 'lostpointercapture', releasePointer);
    game.listen(button, 'keydown', (event) => {
      if (hasCommandModifier(event)) return;
      // Native UI is ignored by the shared keyboard listener; these are actual driving controls.
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(event.code)) {
        if (['racing', 'countdown'].includes(state) && !game.paused) { event.preventDefault(); keys.add(event.code); }
        return;
      }
      if (!['Enter', 'Space'].includes(event.code) || event.repeat || !['racing', 'countdown'].includes(state) || game.paused) return;
      event.preventDefault();
      held.set(event.code, button.dataset.control);
      refreshButton(button.dataset.control);
    });
    game.listen(button, 'keyup', event => {
      if (!['Enter', 'Space'].includes(event.code)) return;
      event.preventDefault(); held.delete(event.code); refreshButton(button.dataset.control);
    });
    game.listen(button, 'blur', () => {
      for (const [code, control] of held) if (control === button.dataset.control) held.delete(code);
      refreshButton(button.dataset.control);
    });
  });
  function clearControls() {
    held.clear();
    pointerControls.clear();
    interfaceEl.querySelectorAll('.is-held').forEach((button) => button.classList.remove('is-held'));
  }
  game.listen(window, 'blur', clearControls);
  game.listen(game.root, 'arcadepause', clearControls);
  game.listen(document, 'visibilitychange', () => { if (document.hidden) clearControls(); });
  const chase = createKartCamera(camera, track, { reducedMotion: game.reducedMotion });
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
    chase.reset();
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
    const focus = chase.update(player, state, dt, time);
    game.setShadowFocus(focus.x, focus.y, focus.z);
  }

  positionModel(kart, player);
  opponents.forEach((opponent) => positionModel(opponent.model, opponent));
  updateCamera(1, 0);
  game.setHUD('VARGGROPEN · 2012', 'Pekkas Gokart', 'Tre varv. Fem rivaler. En pokal.');
  game.showPanel({
    eyebrow: '2012 · VARGGROPEN', title: 'Pekkas Gokart',
    body: '<p>Varggropens 665 meter långa bana, varm asfalt och fem hungriga rivaler. Kör tre varv och utmana Jonas, Erik och Viktor från 2012 års pall.</p><p><strong>Styr ← → / A D. Håll ↑ / W för gas.</strong> Bromsa med ↓ / S / mellanslag före en snäv kurva. På telefon håller du GAS och styr med pilknapparna.</p><p><strong>Linjen vinner loppet.</strong> För hög fart i kurvan tappar grepp. Gå in brett, hitta innerkanten och gasa ut. Bakom en rival minskar luftmotståndet en aning.</p><p>Tre varv med gas, broms och omkörningar. Gräset och däckvallen kostar tid.</p><p><small>Bansträckningen följer klubbens flygfoto. Exakta höjder och 2012 års markeringar är tolkade.</small></p>',
    button: 'Till startlinjen', onStart: start
  });

  game.onFrame((dt, time) => {
    hudClock += dt;
    if (state === 'countdown') {
      countdown -= dt;
      const digit = Math.ceil(countdown);
      if (digit !== oldCountdown) {
        find('.kart-countdown').textContent = digit > 0 ? String(digit) : 'KÖR!';
        oldCountdown = digit;
        game.tone(digit > 0 ? 330 : 660, 0.12, 'triangle');
      }
      if (countdown <= 0) state = 'racing';
    }
    let steer = 0;
    if (state === 'racing') {
      elapsed += dt;
      if (elapsed > 0.75) find('.kart-countdown').textContent = '';
      steer = steeringFromButtons(pressed('left') || keys.has('ArrowLeft') || keys.has('KeyA'), pressed('right') || keys.has('ArrowRight') || keys.has('KeyD'));
      const throttle = pressed('throttle') || keys.has('ArrowUp') || keys.has('KeyW');
      const brake = pressed('brake') || keys.has('ArrowDown') || keys.has('KeyS') || keys.has('Space');
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
    const sound = engineFeedback(player.speed, {
      active: state === 'racing', throttle: pressed('throttle') || keys.has('ArrowUp') || keys.has('KeyW'),
      brake: pressed('brake') || keys.has('ArrowDown') || keys.has('KeyS') || keys.has('Space')
    });
    engine.set(sound.frequency, sound.gain);
    tires.set(170 + player.speed * 8, state === 'racing' && player.skidding ? 0.009 : 0);
    track.update(dt, time);
    positionModel(kart, player, steer);
    kart.update(dt, time);
    opponents.forEach((opponent) => { positionModel(opponent.model, opponent); opponent.model.update(dt, time); });
    updateCamera(dt, time);
    if (hudClock > 0.08) {
      hudClock = 0;
      const position = positionOfPlayer();
      find('[data-position]').innerHTML = `${position}<small> / 6</small>`;
      find('[data-lap]').textContent = `VARV ${lap} / ${LAPS}`;
      find('[data-time]').textContent = formatTime(elapsed);
      const ahead = raceStandings([player, ...opponents])[position - 2];
      find('[data-gap]').textContent = ahead ? `${ahead.full.split(' ')[0]} · ${Math.max(0, ahead.distance - player.distance).toFixed(0)} M FRAMFÖR` : 'DU LEDER';
      find('.kart-speed b').textContent = String(Math.round(player.speed * 3.6));
      find('.kart-grip i').style.width = `${player.grip * 100}%`;
      find('.kart-grip').setAttribute('aria-valuenow', String(Math.round(player.grip * 100)));
      find('.kart-grip').classList.toggle('sliding', player.skidding);
      const upcoming = cornerSpeed(track.curvature(player.distance + 10));
      find('.kart-tip').textContent = player.speed < 1 ? 'HÅLL GAS ELLER ↑ / W FÖR ATT KÖRA' : Math.abs(player.lane) > TRACK_HALF_WIDTH ? 'GRÄS BROMSAR · TILLBAKA TILL ASFALTEN' : player.skidding ? 'GREPPET SLÄPPER · LÄTTA PÅ GASEN' : player.speed > upcoming * 1.12 ? 'BROMSA INFÖR KURVAN' : player.slipstream > 0.2 ? 'I SUGET · VÄLJ LÄGE FÖR OMKÖRNING' : 'BRA GREPP · HITTA DIN LINJE';
      [...opponents, player].forEach((driver, i) => {
        const point = track.sample(driver.distance).position;
        dots[i].setAttribute('cx', String(point.x));
        dots[i].setAttribute('cy', String(point.z));
      });
      if (state === 'racing') game.setHUD('PEKKAS GOKART · 2012', 'Varggropen', Number.isFinite(bestLap) ? `Bästa varv ${formatTime(bestLap)}` : 'Gas · broms · hitta den rena linjen');
    }
  });

  return { destroy() { clearControls(); engine.stop(); tires.stop(); track.dispose(); kart.dispose(); opponents.forEach(opponent => opponent.model.dispose()); game.destroy(); } };
}
