import * as THREE from 'three';
import { createArcade } from '../shared/arcade.js';
import { createPerson, appearanceFor, POSES } from '../shared/people.js';
import { buildCountryWorld } from './world.js';
import { createRifleEvent } from './rifle-event.js';
import { createThrowEvent } from './throw-events.js';
import { createWoodEvent } from './wood-events.js';
import { clamp } from './rules.js';
import { bindHoldControl } from './input.js';
import { isNativeControlTarget } from '../shared/keyboard.js';

export const FARM_EVENTS = [
  { kind: 'rifle', title: 'Luftgevärsskytte', verb: 'SKJUT', instructions: 'Tio skott på ringtavlan. Dra siktet med fingret eller musen och tryck SKJUT. Piltangenter eller WASD siktar på dator; mellanslag skjuter. Andningen flyttar siktet lite — välj ditt ögonblick.' },
  { kind: 'stack', title: 'Vedstapling', verb: 'SLÄPP VEDEN', instructions: 'Bygg vedstapeln så högt du kan på 30 sekunder. Tryck när veden ligger mitt över stapeln. Överhäng gör nästa lager smalare. En miss går att hämta igen — ta det lugnt och träffa rent.' },
  { kind: 'boot', title: 'Kasta stövel', verb: 'LADDA KAST', instructions: 'Tre kast — ditt längsta räknas. Välj utkastvinkel med ← →. Håll KAST eller mellanslag för kraft och släpp. En hög båge ser fin ut, men rätt vinkel ger längre kast.' },
  { kind: 'horseshoe', title: 'Kasta hästsko', verb: 'LADDA KAST', instructions: 'Tre hästskor, tre avstånd. Sikta med ← →. Håll KAST eller mellanslag för kraft och släpp. Få hästskon runt pinnen för full poäng; nära räknas också.' },
  { kind: 'hammer', title: 'Spika spik', verb: 'SLÅ!', instructions: 'Slå ner spikarna i plankan så fort du kan. Tryck när kraftmarkören är mitt i det ljusa träffområdet. Rena hammarslag driver spiken djupare. Fem spikar eller 30 sekunder avgör grenen. Klara alla fem inom 12 sekunder för full poäng.' }
];

export async function createFarmTournament(container) {
  const game = createArcade(container, { id: 'farm', title: 'Pekkas Bondespel', subtitle: 'Billsta · 2015', accent: '#efc370', sky: '#c6d6d6', fog: '#c0d1ca' });
  game.root.classList.add('farm-tournament');
  const { scene, camera } = game;
  game.sun.position.set(-12, 24, 10); game.sun.intensity = 3;
  game.ambient.intensity = .92;
  game.renderer.toneMappingExposure = 1.15;
  scene.fog = new THREE.Fog('#c0d1ca', 40, 115);
  const world = buildCountryWorld(scene, false, { reducedMotion: game.reducedMotion, sunDirection: game.sun.position });
  const props = new THREE.Group(); scene.add(props);
  const person = createPerson(appearanceFor('Per Vikman', { detail: 'low', outfit: { top: 'shirt', topColor: 0xc79a57, bottom: 'jeans', bottomColor: 0x405361, shoes: 'boots' } }));
  person.root.position.set(-2, 0, 6); person.root.rotation.y = Math.PI; scene.add(person.root);
  const spectators = ['Olov Melander', 'Mikael Hägglund', 'Rickard Nilsson'].map((name, i) => {
    const p = createPerson(appearanceFor(name, { detail: 'low' }));
    p.root.position.set(6 + i * 0.85, 0, -4 + (i % 2) * 1.4); p.root.rotation.y = -Math.PI / 2; scene.add(p.root); return p;
  });
  const controls = document.createElement('div'); controls.className = 'country-controls farm-controls'; controls.hidden = true;
  controls.dataset.gameControls = '';
  controls.innerHTML = '<div class="country-round"><span class="country-kicker"></span><strong></strong><span class="country-hint"></span></div><div class="country-meter"><span class="country-zone"></span><i></i></div><div class="country-readout" role="status" aria-live="polite"></div><div class="farm-vertical" hidden><button type="button" data-input="up" aria-label="Sikta uppåt">↑</button><button type="button" data-input="down" aria-label="Sikta nedåt">↓</button></div><div class="country-actions"><button type="button" data-input="left" aria-label="Vänster">←</button><button type="button" data-input="action" class="country-action farm-action">SKJUT</button><button type="button" data-input="right" aria-label="Höger">→</button></div>';
  game.ui.appendChild(controls);
  const progress = document.createElement('div'); progress.className = 'farm-progress'; progress.setAttribute('aria-label', 'Kvällens fem grenar'); game.ui.appendChild(progress);
  const hint = controls.querySelector('.country-hint'), readout = controls.querySelector('.country-readout'), fill = controls.querySelector('.country-meter i');
  const meter = controls.querySelector('.country-meter'), action = controls.querySelector('[data-input="action"]');
  const held = { left: false, right: false, up: false, down: false, action: false };
  const controlBindings = [];
  let actionControl;
  let mode = 'intro', index = 0, event = null, scores = [], elapsed = 0, focusHeight = 1, trackZ = 0, dragging = false;
  const total = () => scores.reduce((sum, score) => sum + score, 0);
  const clearInput = () => {
    controlBindings.forEach((control) => control.cancel());
    Object.keys(held).forEach((key) => { held[key] = false; });
    controls.querySelectorAll('button').forEach((b) => b.classList.remove('held'));
    dragging = false; event?.cancel?.();
  };
  const ctx = {
    THREE, group: props, material: world.material,
    mesh: (geometry, color, x = 0, y = 0, z = 0, parent = props) => world.mesh(geometry, color, x, y, z, parent),
    box: (w, h, d, color, x = 0, y = 0, z = 0, parent = props) => world.box(w, h, d, color, x, y, z, parent),
    cylinder: (r, h, color, x = 0, y = 0, z = 0, parent = props, rt = r) => world.cylinder(r, h, color, x, y, z, parent, rt),
    finish: finishEvent, toast: game.toast, tone: game.tone,
    focus: (height) => { focusHeight = clamp(height, 1, 10); },
    track: (z) => { trackZ = z; },
    hud(label, detail, value = 0) {
      if (mode !== 'playing') return;
      readout.textContent = label; hint.textContent = detail;
      fill.style.width = `${clamp(value, 0, 1) * 100}%`;
      meter.classList.toggle('farm-perfect', FARM_EVENTS[index].kind === 'hammer' && Math.abs(value - 0.5) < 0.06 || FARM_EVENTS[index].kind === 'boot' && value > 0.94);
      game.setHUD('BONDESPELEN', `${total().toLocaleString('sv-SE')} p`, `Gren ${index + 1}/5 · ${FARM_EVENTS[index].title}`);
    }
  };
  function disposeEvent() {
    event?.dispose?.();
    props.traverse((node) => node.geometry?.dispose());
    props.clear(); event = null;
  }
  function buildEvent() {
    disposeEvent(); focusHeight = 1; trackZ = 0;
    const entry = FARM_EVENTS[index];
    event = entry.kind === 'rifle' ? createRifleEvent(ctx) : ['stack', 'hammer'].includes(entry.kind) ? createWoodEvent(entry.kind, ctx) : createThrowEvent(entry.kind, ctx);
    progress.innerHTML = FARM_EVENTS.map((item, i) => `<span class="${i < index ? 'done' : i === index ? 'current' : ''}" title="${item.title}">${i < index ? '✓' : i + 1}</span>`).join('');
    controls.querySelector('.country-kicker').textContent = `GREN ${index + 1} AV 5`;
    controls.querySelector('strong').textContent = entry.title;
    action.textContent = entry.verb;
    controls.querySelector('.farm-vertical').hidden = entry.kind !== 'rifle';
    for (const b of controls.querySelectorAll('[data-input="left"], [data-input="right"]')) b.hidden = ['stack', 'hammer'].includes(entry.kind);
    controls.querySelector('.country-actions').classList.toggle('farm-single', ['stack', 'hammer'].includes(entry.kind));
    meter.style.setProperty('--zone', entry.kind === 'hammer' ? '50%' : '95%');
    meter.classList.toggle('farm-no-zone', ['rifle', 'stack', 'horseshoe'].includes(entry.kind));
    fill.style.width = '0%';
    person.root.position.set(entry.kind === 'rifle' ? -1 : -2.2, 0, 6);
  }
  function startEvent() {
    clearInput(); buildEvent(); elapsed = 0; mode = 'playing'; game.hidePanel(); controls.hidden = false;
    action.focus({ preventScroll: true });
  }
  function briefing() {
    mode = 'briefing'; clearInput(); controls.hidden = true;
    const entry = FARM_EVENTS[index];
    game.showPanel({ eyebrow: `BILLSTA · GREN ${index + 1} AV 5`, title: entry.title, body: `<p>${entry.instructions}</p><p class="country-note">Upp till 1 000 poäng i grenen. ${index ? `Du har ${total().toLocaleString('sv-SE')} poäng.` : 'Grenarna är från den verkliga tävlingen; spelreglerna är anpassade för arkaden.'}</p>`, button: 'Kör grenen', onStart: startEvent });
  }
  function finishEvent(score, summary) {
    if (mode !== 'playing') return;
    mode = 'result'; clearInput(); controls.hidden = true;
    const points = Math.round(clamp(Number.isFinite(score) ? score : 0, 0, 1000));
    scores.push(points); person.setExpression('grin'); game.tone(points >= 700 ? 720 : 420, 0.2, 'triangle');
    game.setHUD('BONDESPELEN', `${total().toLocaleString('sv-SE')} p`, `Gren ${index + 1}/5 klar`);
    const done = index === FARM_EVENTS.length - 1;
    const best = game.loadBest();
    if (done) game.saveBest(total());
    const medal = total() >= 4000 ? 'Guld i Billsta!' : total() >= 2750 ? 'Silver i Billsta!' : total() >= 1500 ? 'Brons i Billsta!' : 'En kväll att minnas';
    game.showPanel({
      eyebrow: done ? 'BILLSTA · BONDESPELEN 2015' : `${FARM_EVENTS[index].title.toUpperCase()} KLAR`,
      title: done ? medal : `${points.toLocaleString('sv-SE')} poäng`,
      body: done ? `<p>${total().toLocaleString('sv-SE')} av 5 000 poäng</p><p class="country-note">${summary}</p><div class="country-results">${scores.map((s, i) => `<span>${FARM_EVENTS[i].title}</span><b>${s}</b>`).join('')}</div><p class="country-note">${total() > best ? 'Nytt personbästa!' : `Personbästa: ${Math.max(total(), best).toLocaleString('sv-SE')} poäng`}</p>` : `<p>${summary}</p><p class="country-note">Nästa gren: ${FARM_EVENTS[index + 1].title}</p>`,
      button: done ? 'Spela igen' : 'Nästa gren',
      onStart: () => { if (done) { scores = []; index = 0; } else index++; briefing(); }
    });
  }
  function down() { if (mode === 'playing' && !game.paused) { held.action = true; event?.down(); } }
  function up() { const wasHeld = held.action; held.action = false; if (wasHeld && mode === 'playing' && !game.paused) event?.up(); }
  for (const button of controls.querySelectorAll('[data-input]')) {
    const name = button.dataset.input;
    const control = bindHoldControl(game.listen, button, {
      canStart: () => mode === 'playing' && !game.paused,
      onDown: () => { if (name === 'action') down(); else held[name] = true; },
      onUp: () => { if (name === 'action') up(); else held[name] = false; },
      onCancel: () => { held[name] = false; if (name === 'action') event?.cancel?.(); }
    });
    controlBindings.push(control);
    if (name === 'action') actionControl = control;
  }
  game.listen(window, 'keydown', (e) => {
    if (mode !== 'playing' || game.paused || e.code !== 'Space' || isNativeControlTarget(e.target)) return;
    e.preventDefault();
    if (!e.repeat) actionControl.press('global:Space');
  });
  game.listen(window, 'keyup', (e) => {
    if (e.code === 'Space') actionControl.release('global:Space');
  });
  game.listen(game.root, 'arcadepause', clearInput); game.listen(window, 'blur', clearInput);
  game.listen(document, 'visibilitychange', clearInput);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), hit = new THREE.Vector3();
  const targetPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 7);
  function aimAt(e) {
    if (mode !== 'playing' || game.paused || FARM_EVENTS[index].kind !== 'rifle') return;
    const rect = game.renderer.domElement.getBoundingClientRect();
    pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(targetPlane, hit)) event.aim?.(hit.x, hit.y);
  }
  game.listen(game.renderer.domElement, 'pointerdown', (e) => { if (FARM_EVENTS[index].kind !== 'rifle') return; e.preventDefault(); dragging = true; game.renderer.domElement.setPointerCapture(e.pointerId); aimAt(e); });
  game.listen(game.renderer.domElement, 'pointermove', (e) => { if (dragging || e.pointerType === 'mouse') aimAt(e); });
  game.listen(game.renderer.domElement, 'pointerup', () => { dragging = false; });
  game.listen(game.renderer.domElement, 'pointercancel', clearInput);
  game.onFrame((dt, time) => {
    world.update(time);
    if (mode === 'playing') {
      elapsed += dt;
      const direction = Number(held.right || game.keys.has('ArrowRight') || game.keys.has('KeyD')) - Number(held.left || game.keys.has('ArrowLeft') || game.keys.has('KeyA'));
      const vertical = Number(held.up || game.keys.has('ArrowUp') || game.keys.has('KeyW')) - Number(held.down || game.keys.has('ArrowDown') || game.keys.has('KeyS'));
      event.step(dt, elapsed, { direction, vertical, held: held.action || game.keys.has('Space') });
    }
    const narrow = camera.aspect < 0.85;
    const { kind } = FARM_EVENTS[index];
    const framing = kind === 'rifle' ? (narrow ? [0.25, 7, 12.5, 2.1, -5, 43] : [4, 6.5, 12, 2, -5, 40])
      : kind === 'hammer' ? (narrow ? [0.1, 9, 16, 1.8, -2, 45] : [5.5, 6.8, 10, 1.7, -2, 38])
        : kind === 'stack' ? (narrow ? [0.15, 10 + focusHeight, 18, focusHeight + 1, -2, 44] : [7, 7 + focusHeight, 15, focusHeight + 1, -2, 42])
          : kind === 'horseshoe' ? (narrow ? [0.2, 11, 16, 0.8, -3, 45] : [6.5, 9, 16, 0.8, -3, 40])
            : (narrow ? [0.2, 11 + focusHeight * 0.45, 21, focusHeight, -3, 47] : [8.5, 9 + focusHeight * 0.45, 20, focusHeight, -3, 43]);
    const target = new THREE.Vector3(framing[0], framing[1], trackZ + framing[2]);
    camera.position.lerp(target, 1 - Math.exp(-dt * 4));
    camera.fov += (framing[5] - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
    camera.lookAt(0, framing[3], trackZ + framing[4]);
    person.setPose(mode === 'result' ? POSES.cheer(time) : POSES.idle(time), 0.2); person.update(dt, time);
    spectators.forEach((p, i) => { p.setPose(mode === 'result' ? POSES.clap(time + i) : POSES.idle(time + i), 0.2); p.update(dt, time); });
  });
  camera.position.set(8.5, 12, 21); camera.lookAt(0, 1, -3); buildEvent();
  game.setHUD('BONDESPELEN', '2015', 'Fem riktiga grenar · Billsta');
  game.showPanel({ eyebrow: 'BILLSTA · BONDESPELEN 2015', title: 'Pekkas Bondespel', body: `<p>Fem grenar från den verkliga tävlingen. En gyllene kväll på gården.</p><div class="country-event-list">${FARM_EVENTS.map((entry, i) => `<span><b>0${i + 1}</b>${entry.title}</span>`).join('')}</div><p class="country-note">Per Vikman vann 2015. Nu är det din tur. Grenlistan är bekräftad; fysik och poäng är anpassade för arkaden.</p>`, button: 'Till första grenen', onStart: briefing });
  return { destroy() { clearInput(); event?.dispose?.(); [person, ...spectators].forEach((p) => p.dispose()); game.destroy(); world.disposeMaterials(); } };
}
