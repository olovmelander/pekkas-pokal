/** Pekkas Gokart — Varggropen 2012, a three-lap arcade race at golden hour. */
import * as THREE from 'three';
import { createArcade } from '../shared/arcade.js';
import { createCircuit, createKart } from './world.js';
import { LAPS, clamp, cornerSpeed, trackGap, slipstreamFactor, newDriver, stepDriver, racePosition, raceScore } from './physics.js';

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
    accent: '#f2c05c', sky: 0xd4bc90, fog: 0xd4bc90
  });
  const { scene, camera, ui, keys } = game;
  game.root.classList.add('kart-game');
  scene.fog = new THREE.Fog(0xd4bc90, 75, 210);
  const sun = scene.children.find((object) => object.isDirectionalLight);
  if (sun) {
    sun.position.set(-40, 55, 30);
    Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, far: 180 });
    sun.shadow.camera.updateProjectionMatrix();
  }
  const track = createCircuit(scene);
  const player = newDriver(0, -1.3);
  const kart = createKart(0xe9b748);
  scene.add(kart.root);
  const opponents = RIVALS.map((rival, index) => {
    const model = createKart(rival.color);
    scene.add(model.root);
    return { ...rival, ...newDriver(4.5 + index * 3.4, index % 2 ? -1.5 : 1.5), model };
  });
  const interfaceEl = document.createElement('div');
  interfaceEl.className = 'kart-interface';
  interfaceEl.dataset.state = 'menu';
  interfaceEl.innerHTML = `
    <div class="kart-race-meta"><strong data-position>6<small> / 6</small></strong><span data-lap>VARV 1 / 3</span><span data-time>0:00.0</span></div>
    <svg class="kart-map" viewBox="-59 -52 118 104" role="img" aria-label="Bankarta med din guldfärgade kart och motståndarna"><path></path></svg>
    <div class="kart-countdown" role="status" aria-live="polite"></div>
    <div class="kart-dashboard"><div class="kart-speed"><b>0</b><small>KM/H</small></div><div class="kart-grip"><i></i></div><div class="kart-tip">HÅLL GAS · BROMSA FÖRE KURVAN</div></div>
    <div class="kart-controls">
      <div class="kart-control-group"><button type="button" data-control="left" aria-label="Styr vänster">←<small>A / ←</small></button><button type="button" data-control="right" aria-label="Styr höger">→<small>D / →</small></button></div>
      <div class="kart-control-group"><button type="button" data-control="brake" aria-label="Bromsa"><span>BROMS</span><small>S / ↓ / ␣</small></button><button type="button" data-control="throttle" aria-label="Håll för att gasa"><span>GAS</span><small>W / ↑</small></button></div>
    </div>`;
  ui.appendChild(interfaceEl);
  const find = (selector) => interfaceEl.querySelector(selector);
  const map = find('.kart-map');
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
  const held = new Set();
  const pointerControls = new Map();
  function releasePointer(event) {
    const control = pointerControls.get(event.pointerId);
    if (!control) return;
    pointerControls.delete(event.pointerId);
    if (![...pointerControls.values()].includes(control)) held.delete(control);
    find(`[data-control="${control}"]`).classList.toggle('is-held', held.has(control));
  }
  interfaceEl.querySelectorAll('[data-control]').forEach((button) => {
    game.listen(button, 'pointerdown', (event) => {
      if (!['racing', 'countdown'].includes(state) || game.paused) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      const { control } = button.dataset;
      pointerControls.set(event.pointerId, control);
      held.add(control);
      button.classList.add('is-held');
    });
    game.listen(button, 'pointerup', releasePointer);
    game.listen(button, 'pointercancel', releasePointer);
    game.listen(button, 'lostpointercapture', releasePointer);
    game.listen(button, 'keydown', (event) => {
      if (event.code !== 'Enter' || event.repeat || !['racing', 'countdown'].includes(state) || game.paused) return;
      event.preventDefault();
      held.add(button.dataset.control);
      button.classList.add('is-held');
    });
    const releaseKey = () => {
      if (![...pointerControls.values()].includes(button.dataset.control)) {
        held.delete(button.dataset.control);
        button.classList.remove('is-held');
      }
    };
    game.listen(button, 'keyup', (event) => { if (event.code === 'Enter') releaseKey(); });
    game.listen(button, 'blur', releaseKey);
  });
  function clearControls() {
    held.clear();
    pointerControls.clear();
    interfaceEl.querySelectorAll('.is-held').forEach((button) => button.classList.remove('is-held'));
  }
  game.listen(window, 'blur', clearControls);
  game.listen(game.root, 'arcadepause', clearControls);
  game.listen(document, 'visibilitychange', () => { if (document.hidden) clearControls(); });
  const cameraPosition = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const wishPosition = new THREE.Vector3();
  const wishTarget = new THREE.Vector3();
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

  function start() {
    Object.assign(player, newDriver(0, -1.3));
    opponents.forEach((opponent, i) => Object.assign(opponent, newDriver(4.5 + i * 3.4, i % 2 ? -1.5 : 1.5)));
    state = 'countdown';
    elapsed = 0;
    countdown = 3;
    oldCountdown = -1;
    lap = 1;
    incidents = 0;
    lapStarted = 0;
    bestLap = Infinity;
    previousPosition = 6;
    placeMessageCooldown = 0;
    clearControls();
    interfaceEl.dataset.state = 'racing';
    game.hidePanel();
    game.setHUD('VARV 1 / 3', 'Gör dig redo', 'Guld är din kart. Håll GAS eller ↑ / W.');
  }

  function finish() {
    state = 'result';
    clearControls();
    interfaceEl.dataset.state = 'menu';
    const position = racePosition(player.distance, opponents);
    bestLap = Math.min(bestLap, elapsed - lapStarted);
    finishedScore = raceScore(position, elapsed, incidents);
    const best = game.loadBest();
    game.saveBest(finishedScore);
    const rankings = [...opponents.map((opponent) => ({ name: opponent.full, distance: opponent.distance })),
      { name: 'Du', distance: player.distance }].sort((a, b) => b.distance - a.distance);
    const podium = position === 1 ? 'Varggropens mästare!' : position <= 3 ? 'Du tar en pallplats!' : 'Målflaggan är din!';
    game.tone(position <= 3 ? 740 : 440, 0.24, 'triangle');
    game.showPanel({
      eyebrow: `VARGGROPEN · PLATS ${position} AV 6`, title: podium,
      body: `<p>Tre varv på <strong>${formatTime(elapsed)}</strong> · snabbaste varv ${formatTime(bestLap)}.</p><p><strong>${finishedScore.toLocaleString('sv-SE')} poäng</strong>${finishedScore > best ? ' · Nytt rekord!' : ` · Rekord ${Math.max(best, finishedScore).toLocaleString('sv-SE')}`}</p><p>${rankings.map((racer, index) => `${index + 1}. ${racer.name}`).join('<br>')}</p><p>Bromsa före kurvan, träffa kurvans innerkant och gasa när banan öppnar sig. ${incidents === 0 ? 'Ren körning — inga sammanstötningar!' : `${incidents} sammanstötningar under loppet.`}</p>`,
      button: 'Kör ett nytt race', onStart: start
    });
  }

  function positionModel(model, driver, steering = 0) {
    const s = track.sample(driver.distance, driver.lane);
    model.root.position.copy(s.position).setY(0.08);
    model.root.rotation.y = s.angle + steering * 0.065 - driver.lateral * (driver.skidding ? 0.035 : 0.012);
    model.root.rotation.z = -steering * 0.035;
    model.steering.rotation.z = -steering * 0.3;
    return s;
  }

  function updateCamera(dt, time) {
    const portrait = camera.aspect < 0.85;
    const s = track.sample(player.distance, player.lane * 0.45);
    if (state === 'menu') {
      const a = time * 0.06;
      wishPosition.set(s.position.x - 13 * Math.cos(a), 8.5, s.position.z + 15 * Math.sin(a) - 10);
      wishTarget.copy(s.position).setY(0.6);
    } else {
      wishPosition.copy(s.position).addScaledVector(s.tangent, portrait ? -17 : -12);
      wishPosition.y = portrait ? 13.5 : 8.3;
      wishTarget.copy(track.sample(player.distance + (portrait ? 8 : 11), player.lane * 0.3).position);
      wishTarget.y = 0.45;
    }
    const smoothing = state === 'menu' ? 0.04 : 1 - Math.exp(-dt * 5);
    cameraPosition.lerp(wishPosition, smoothing);
    cameraTarget.lerp(wishTarget, smoothing);
    camera.position.copy(cameraPosition);
    camera.lookAt(cameraTarget);
    camera.fov = portrait ? 55 : 58;
    camera.updateProjectionMatrix();
  }

  const initial = track.sample(0);
  cameraPosition.copy(initial.position).addScaledVector(initial.tangent, -13).setY(9);
  cameraTarget.copy(initial.position);
  positionModel(kart, player);
  opponents.forEach((opponent) => positionModel(opponent.model, opponent));
  updateCamera(1, 0);
  game.setHUD('VARGGROPEN · 2012', 'Pekkas Gokart', 'Tre varv. Fem rivaler. En pokal.');
  game.showPanel({
    eyebrow: '2012 · VARGGROPEN', title: 'Pekkas Gokart',
    body: '<p>Solnedgång, varm asfalt och fem hungriga rivaler. Kör tre varv och utmana Jonas, Erik och Viktor från 2012 års pall.</p><p><strong>Styr ← → / A D. Håll ↑ / W för gas.</strong> Bromsa med ↓ / S / mellanslag före en snäv kurva. På telefon håller du GAS och styr med pilknapparna.</p><p><strong>Linjen vinner loppet.</strong> För hög fart i kurvan tappar grepp. Gå in brett, hitta innerkanten och gasa ut. Bakom en rival minskar luftmotståndet en aning.</p><p>Tre varv med gas, broms och omkörningar. Gräset och däckvallen kostar tid.</p>',
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
      steer = Number(held.has('right') || keys.has('ArrowRight') || keys.has('KeyD')) - Number(held.has('left') || keys.has('ArrowLeft') || keys.has('KeyA'));
      const throttle = held.has('throttle') || keys.has('ArrowUp') || keys.has('KeyW');
      const brake = held.has('brake') || keys.has('ArrowDown') || keys.has('KeyS') || keys.has('Space');
      const slipstream = slipstreamFactor(player, opponents, track.length);
      const events = stepDriver(player, { steer, throttle, brake, slipstream }, track.curvature(player.distance), dt);
      if (events.barrier) {
        incidents++;
        game.toast('Däckvallen! Styr tillbaka mot asfalten.');
        game.tone(100, 0.09, 'sawtooth');
      }
      opponents.forEach((opponent, i) => {
        const turn = track.curvature(opponent.distance);
        const ahead = track.curvature(opponent.distance + 9);
        const target = Math.min(opponent.pace, cornerSpeed(ahead) * (0.92 + (4 - i) * 0.015));
        opponent.speed += (target - opponent.speed) * Math.min(1, dt * (target < opponent.speed ? 3.2 : 1.0));
        const lane = Math.sign(turn) * 1.3 + Math.sin(opponent.distance * 0.043 + i * 2.1) * 0.55;
        opponent.lane += (lane - opponent.lane) * Math.min(1, dt * 1.8);
        opponent.distance += opponent.speed * dt / clamp(1 - turn * opponent.lane, 0.62, 1.4);
        // Side contact costs momentum, but never pins either kart in place.
        const separation = Math.abs(trackGap(player.distance, opponent.distance, track.length));
        if (separation < 1.9 && Math.abs(opponent.lane - player.lane) < 1.35 && player.hit <= 0) {
          incidents++;
          player.speed *= 0.8;
          player.lane += player.lane >= opponent.lane ? 0.7 : -0.7;
          player.hit = 0.65;
          game.tone(140, 0.05, 'triangle');
        }
      });
      const newLap = Math.min(LAPS, Math.floor(player.distance / track.length) + 1);
      if (newLap > lap) {
        bestLap = Math.min(bestLap, elapsed - lapStarted);
        lapStarted = elapsed;
        lap = newLap;
        game.toast(lap === 3 ? 'SISTA VARVET · ge allt!' : 'VARV 2 · hitta flytet!');
        game.tone(880, 0.16, 'triangle');
      }
      const position = racePosition(player.distance, opponents);
      placeMessageCooldown = Math.max(0, placeMessageCooldown - dt);
      if (position < previousPosition && placeMessageCooldown === 0) {
        game.toast(position === 1 ? 'DU TAR LEDNINGEN!' : `OMKÖRNING · plats ${position}`);
        placeMessageCooldown = 2;
      }
      previousPosition = position;
      if (player.distance >= LAPS * track.length) finish();
    }
    positionModel(kart, player, steer);
    opponents.forEach((opponent) => positionModel(opponent.model, opponent));
    updateCamera(dt, time);
    if (hudClock > 0.08) {
      hudClock = 0;
      const position = racePosition(player.distance, opponents);
      find('[data-position]').innerHTML = `${position}<small> / 6</small>`;
      find('[data-lap]').textContent = `VARV ${lap} / ${LAPS}`;
      find('[data-time]').textContent = formatTime(elapsed);
      find('.kart-speed b').textContent = String(Math.round(player.speed * 3.6));
      find('.kart-grip i').style.width = `${player.grip * 100}%`;
      find('.kart-grip').classList.toggle('sliding', player.skidding);
      const upcoming = cornerSpeed(track.curvature(player.distance + 10));
      find('.kart-tip').textContent = player.speed < 1 ? 'HÅLL GAS ELLER ↑ / W FÖR ATT KÖRA' : Math.abs(player.lane) > 4.4 ? 'GRÄS BROMSAR · TILLBAKA TILL ASFALTEN' : player.skidding ? 'GREPPET SLÄPPER · LÄTTA PÅ GASEN' : player.speed > upcoming * 1.12 ? 'BROMSA INFÖR KURVAN' : player.slipstream > 0.2 ? 'I SUGET · VÄLJ LÄGE FÖR OMKÖRNING' : 'BRA GREPP · HITTA DIN LINJE';
      [...opponents, player].forEach((driver, i) => {
        const point = track.sample(driver.distance).position;
        dots[i].setAttribute('cx', String(point.x));
        dots[i].setAttribute('cy', String(point.z));
      });
      if (state === 'racing') game.setHUD('PEKKAS GOKART · 2012', 'Varggropen', Number.isFinite(bestLap) ? `Bästa varv ${formatTime(bestLap)}` : 'Gas · broms · hitta den rena linjen');
    }
  });

  return { destroy() { clearControls(); game.destroy(); } };
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}
