import { createArcade } from '../shared/arcade.js';
import { buildCourse, makeCourseItem } from './scenery.js';
import { createAthlete } from './athlete.js';
import { STAGES, clamp, paceStep, raceProgress, scoreRace, formatTime } from './rules.js';

export const layout = 'full';

const GUIDANCE = {
  swim: { hint: 'Styr genom guldringarna. Släpp tempot för att hämta andan.' },
  run: {
    hint: 'Ta gröna flaskor och väj för bommar. Spara energi till cyklingen!',
    title: 'Dags för löparskorna.',
    body: 'Upp ur sjön och ut på skogsstigen. Flaskorna fyller på energi. Väj för orange bommar och släpp tempoknappen för återhämtning.',
    button: 'Ut på löpslingan'
  },
  bike: {
    hint: 'Ligg bakom en cyklist för lä. Spara kraft till slutspurten!',
    title: 'På med hjälmen.',
    body: 'Sista grenen är cykling. Ligg i lä bakom en motståndare för att spara energi, ta gröna flaskor och spurta mot mållinjen.',
    button: 'Ut på cykelbanan'
  }
};

export default async function createTriathlon(container) {
  const game = await createArcade(container, {
    id: 'triathlon', title: 'Pekkas Triathlon', subtitle: 'LOMSJÖN · 2017', accent: '#82cfc2', sky: 0xabc7bc, fog: 0xabc7bc
  });
  const { scene, camera, ui, root } = game;
  root.classList.add('triathlon-game');
  camera.fov = 52; camera.near = 0.1; camera.far = 270; camera.updateProjectionMatrix();
  scene.fog = new game.THREE.Fog(0xabc7bc, 60, 215);
  const course = buildCourse(scene);
  const athlete = createAthlete(scene, 'Viktor Jones', 0xd9ad4d, true);
  const rivals = [
    { name: 'Per Vikman', color: 0xc25856, duration: 91, lane: -2.4 },
    { name: 'Mikael Hägglund', color: 0x68a3bc, duration: 98, lane: 2.2 },
    { name: 'Tobias Lundqvist', color: 0x839b5a, duration: 106, lane: 0 }
  ].map((r, i) => ({ ...r, athlete: createAthlete(scene, r.name, r.color), progress: 0, phase: i * 1.8 }));

  const dashboard = document.createElement('div'); dashboard.className = 'tri-dashboard';
  dashboard.innerHTML = `<div class="tri-stages">${STAGES.map((leg, i) => `<span class="tri-stage">0${i + 1} ${leg.verb}</span>`).join('')}</div>
    <div class="tri-progress" role="progressbar" aria-label="Hela loppet" aria-valuemin="0" aria-valuemax="100"><i></i></div>
    <div class="tri-energy-title"><span>ENERGI</span><span class="tri-energy-value">100 %</span></div><div class="tri-energy"><i></i></div><p class="tri-help"></p>`;
  ui.appendChild(dashboard);
  const controls = document.createElement('div'); controls.className = 'tri-controls';
  controls.innerHTML = `<div class="tri-direction"><button class="tri-control" data-control="left" aria-label="Styr åt vänster">←</button><button class="tri-control" data-control="right" aria-label="Styr åt höger">→</button></div><button class="tri-control tri-surge" data-control="surge">ÖKA TEMPOT<small>HÅLL · MELLANSLAG</small></button>`;
  ui.appendChild(controls);
  const callout = document.createElement('div'); callout.className = 'tri-callout'; ui.appendChild(callout);
  const energyValue = dashboard.querySelector('.tri-energy-value'), energyBar = dashboard.querySelector('.tri-energy i');
  const energyTrack = dashboard.querySelector('.tri-energy'), progressBar = dashboard.querySelector('.tri-progress i');
  const progressTrack = dashboard.querySelector('.tri-progress'), help = dashboard.querySelector('.tri-help');
  const stageLabels = [...dashboard.querySelectorAll('.tri-stage')];
  const held = new Set();
  const pointerActions = new Map();
  let state = 'intro', stage = 0, distance = 0, elapsed = 0, stageStart = 0, x = 0, stamina = 100;
  let exhausted = false, slow = 0, gates = 0, drinks = 0, hits = 0, drafting = false, displayClock = 0, best = game.loadBest() || 0;
  let splits = [], items = [], started = false;

  function clearInput() {
    held.clear(); pointerActions.clear();
    controls.querySelectorAll('.held').forEach(button => button.classList.remove('held'));
  }
  const codeAction = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'surge', ArrowUp: 'surge', KeyW: 'surge' };
  game.listen(window, 'keydown', event => {
    const action = codeAction[event.code];
    if (!action || state !== 'race' || game.paused) return;
    event.preventDefault(); held.add(action);
  });
  game.listen(window, 'keyup', event => { const action = codeAction[event.code]; if (action) held.delete(action); });
  game.listen(window, 'blur', clearInput);
  game.listen(document, 'visibilitychange', clearInput);
  game.listen(root, 'arcadepause', clearInput);
  controls.querySelectorAll('button').forEach(button => {
    game.listen(button, 'pointerdown', event => {
      if (state !== 'race' || game.paused) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      pointerActions.set(event.pointerId, button.dataset.control); button.classList.add('held');
    });
    const release = event => { pointerActions.delete(event.pointerId); button.classList.remove('held'); };
    game.listen(button, 'pointerup', release); game.listen(button, 'pointercancel', release); game.listen(button, 'lostpointercapture', release);
  });
  const pressed = action => held.has(action) || [...pointerActions.values()].includes(action);

  function removeItems() {
    items.forEach(item => {
      scene.remove(item.mesh);
      item.mesh.traverse(object => { if (object.geometry) object.geometry.dispose(); if (object.material) object.material.dispose(); });
    });
    items = [];
  }

  function buildItems() {
    removeItems();
    const length = STAGES[stage].distance;
    const discipline = STAGES[stage].id;
    const spacing = discipline === 'bike' ? 50 : 27;
    for (let at = 30, i = 0; at < length - 17; at += spacing, i++) {
      const lane = [-2.5, 0, 2.5, 0, -2.5, 2.5][i % 6];
      const kind = discipline === 'swim' ? 'gate' : i % 3 === 1 ? 'obstacle' : 'drink';
      const mesh = makeCourseItem(kind); scene.add(mesh);
      items.push({ kind, at, x: lane, mesh, resolved: false });
      if (discipline === 'bike' && i % 3 !== 1) {
        const blocker = makeCourseItem('obstacle'); scene.add(blocker);
        items.push({ kind: 'obstacle', at: at + 14, x: lane === 0 ? 2.5 : 0, mesh: blocker, resolved: false });
      }
    }
    help.textContent = GUIDANCE[discipline].hint;
    stageLabels.forEach((label, i) => { label.classList.toggle('active', i === stage); label.classList.toggle('done', i < stage); });
  }

  function start() {
    clearInput(); stage = 0; distance = elapsed = stageStart = x = 0; stamina = 100; exhausted = false;
    slow = gates = drinks = hits = 0; splits = []; drafting = false; started = true; state = 'race';
    rivals.forEach(r => { r.progress = 0; });
    controls.hidden = dashboard.hidden = false; buildItems(); game.hidePanel();
    game.setHUD(STAGES[0].name, '0:00.0', '1 / 4 · 260 m kvar');
    game.tone(392, 0.16, 'triangle'); game.toast('Starten går! Hitta din rytm.');
  }

  function finishStage() {
    splits.push(elapsed - stageStart); clearInput();
    if (stage === STAGES.length - 1) {
      state = 'result'; controls.hidden = true; callout.classList.remove('on');
      const score = scoreRace({ seconds: elapsed, gates, drinks, hits });
      const place = 1 + rivals.filter(r => r.progress >= 1).length;
      const newBest = score > best; best = Math.max(best, score); game.saveBest(score);
      game.showPanel({
        eyebrow: `LOMSJÖN · ${place === 1 ? 'GULD' : place === 2 ? 'SILVER' : place === 3 ? 'BRONS' : 'I MÅL'}`,
        title: place === 1 ? 'Sjöns mästare!' : 'Hela vägen i mål!',
        body: `<p>Du blev <strong>${place}:a</strong> på <strong>${formatTime(elapsed)}</strong>. ${newBest ? 'Nytt personbästa!' : `Rekord: ${Number(best).toLocaleString('sv-SE')} poäng.`}</p>
          <div class="tri-splits">${splits.map((time, i) => `<div><small>${STAGES[i].name}</small><strong>${formatTime(time)}</strong></div>`).join('')}</div>
          <p><strong>${score.toLocaleString('sv-SE')} poäng</strong> · ${gates} simringar · ${drinks} flaskor · ${hits} hinder</p>
          <p>${hits > 2 ? 'Nästa försök: läs banan långt fram och byt spår innan hindren.' : 'Nästa försök: spara energi i cyklisternas lä och spurta sista biten.'}</p>`,
        button: 'Kör loppet igen', onStart: start
      });
      game.tone(784, 0.4, 'triangle');
      return;
    }
    state = 'transition'; controls.hidden = true; callout.classList.remove('on');
    const next = stage + 1;
    const guide = GUIDANCE[STAGES[next].id];
    game.showPanel({
      eyebrow: `T${next} · VÄXLINGSOMRÅDET`,
      title: guide.title,
      body: `<p>${STAGES[stage].name.toLowerCase()} avklarad på <strong>${formatTime(splits[stage])}</strong>. Du har ${Math.round(stamina)} % energi kvar.</p><p>${guide.body}</p><p>← → eller A / D styr. Håll mellanrum eller ÖKA TEMPOT för fart.</p>`,
      button: guide.button,
      onStart() {
        stage = next; distance = 0; stageStart = elapsed; slow = 0; state = 'race';
        stamina = Math.min(100, stamina + 12); exhausted = stamina < 25 && exhausted;
        controls.hidden = false; buildItems(); game.hidePanel(); clearInput(); game.tone(523, 0.16, 'triangle');
      }
    });
  }

  function updateItems(time) {
    for (const item of items) {
      const rel = item.at - distance;
      item.mesh.position.set(item.x, 0, -rel + 1);
      item.mesh.visible = !item.resolved && rel > -4 && rel < 110;
      if (item.kind === 'drink') { item.mesh.rotation.y = time; item.mesh.position.y = Math.sin(time * 3 + item.at) * 0.08; }
      if (item.resolved || rel > 0) continue;
      item.resolved = true;
      if (Math.abs(x - item.x) < (item.kind === 'gate' ? 0.8 : 0.85)) {
        if (item.kind === 'gate') {
          gates++; stamina = Math.min(100, stamina + 9); game.toast('Ren linje! +140'); game.tone(660, 0.08, 'sine');
        } else if (item.kind === 'drink') {
          drinks++; stamina = Math.min(100, stamina + 26); game.toast('Påfyllning! +26 energi'); game.tone(880, 0.1, 'sine');
        } else {
          hits++; slow = 1.3; stamina = Math.max(0, stamina - 10); game.toast('Oj! Väj för de orange bommarna.'); game.tone(120, 0.18, 'triangle');
        }
      } else if (item.kind === 'gate') game.toast('Missad ring — sikta mellan bojarna.');
    }
  }

  function updateRivals(dt, time) {
    const progress = raceProgress(stage, distance);
    drafting = false;
    for (const r of rivals) {
      r.progress = Math.min(1, elapsed / r.duration);
      const delta = (r.progress - progress) * STAGES[stage].distance * 3;
      r.athlete.root.position.set(r.lane + Math.sin(time * 0.17 + r.phase) * 0.3, 0, 1 - delta);
      r.athlete.root.visible = delta > -12 && delta < 100;
      if (STAGES[stage].id === 'bike' && delta > 2 && delta < 19 && Math.abs(x - r.athlete.root.position.x) < 1.05) drafting = true;
      if (r.athlete.root.visible) r.athlete.update(STAGES[stage].id, dt, time + r.phase, false);
    }
  }

  game.onFrame((dt, time) => {
    const discipline = STAGES[stage].id;
    if (state === 'race') {
      elapsed += dt; slow = Math.max(0, slow - dt);
      const direction = Number(pressed('right')) - Number(pressed('left'));
      const current = discipline === 'swim' ? Math.sin(elapsed * 0.65) * 0.21 : 0;
      x = clamp(x + (direction * (discipline === 'bike' ? 5.8 : 4.8) + current) * dt, -3.85, 3.85);
      updateRivals(dt, time);
      const pace = paceStep({ stamina, exhausted, stage, surge: pressed('surge'), drafting, slow }, dt);
      ({ stamina, exhausted } = pace); distance += pace.speed * dt;
      athlete.update(discipline, dt, time, pace.pushing);
      athlete.root.position.x += (x - athlete.root.position.x) * Math.min(1, dt * 13);
      athlete.root.rotation.z = direction * (discipline === 'swim' ? -0.06 : -0.1);
      updateItems(time);
      callout.classList.toggle('on', drafting || exhausted || (stage === STAGES.length - 1 && STAGES[stage].distance - distance < 100));
      callout.textContent = exhausted ? 'HÄMTA ANDAN · SLÄPP TEMPOT' : drafting ? 'I LÄ · SPARAR ENERGI' : 'MÅLET NÄRMAR SIG · SLUTSPURT!';
      if (distance >= STAGES[stage].distance) { ({ distance } = STAGES[stage]); finishStage(); }
    } else if (state === 'intro') {
      athlete.update('swim', dt, time, false);
      rivals.forEach((r, i) => { r.athlete.root.position.set(r.lane, 0, -5 - i * 3); r.athlete.update('swim', dt, time + r.phase, false); });
    }
    const targetX = athlete.root.position.x * 0.35;
    const portrait = camera.aspect < 0.8;
    camera.position.set(targetX + (started ? 0 : 2), portrait ? 6.6 : 5.7, portrait ? 12.5 : 10.5);
    camera.lookAt(targetX, discipline === 'swim' ? 0.2 : 0.9, portrait ? -8 : -10);
    course.update(discipline, distance, STAGES[stage].distance - distance, time);
    displayClock += dt;
    if (displayClock > 0.1) {
      displayClock = 0;
      const place = 1 + rivals.filter(r => r.progress > raceProgress(stage, distance)).length;
      game.setHUD(STAGES[stage].name, formatTime(elapsed), `${place} / 4 · ${Math.max(0, Math.ceil(STAGES[stage].distance - distance))} m kvar`);
      energyValue.textContent = `${Math.round(stamina)} %`; energyBar.style.width = `${stamina}%`; energyTrack.classList.toggle('low', stamina < 25);
      const progress = Math.round(raceProgress(stage, distance) * 100);
      progressBar.style.width = `${progress}%`; progressTrack.setAttribute('aria-valuenow', String(progress));
    }
  });

  controls.hidden = true;
  help.textContent = 'Tre grenar. En energireserv. Hitta din rytm.';
  game.showPanel({
    eyebrow: 'LOMSJÖN · 2017 · ETT LOPP, TRE GRENAR', title: 'Pekkas Triathlon',
    body: `<p>Simma över sjön, spring genom skogen och cykla mot pokalen som <strong>Viktor Jones</strong>.</p><p><strong>← → / A D</strong> styr. Håll <strong>mellanslag</strong> eller <strong>ÖKA TEMPOT</strong> för fart. Släpp för att återhämta energi. Mobilen har samma kontroller på skärmen.</p><p>Guldringar, gröna energiflaskor och cyklisternas lä hjälper dig förbi Per, Mikael och Tobias. Väj för orange hinder.</p><p><small>2017 års ordning: simning, löpning, cykling. En kort arkadtolkning med tillåten drafting. ${best ? `Rekord: ${Number(best).toLocaleString('sv-SE')} poäng.` : 'Hela loppet tar cirka två minuter.'}</small></p>`,
    button: 'Till startlinjen', onStart: start
  });

  return {
    destroy() {
      clearInput(); removeItems(); athlete.dispose(); rivals.forEach(r => r.athlete.dispose()); game.destroy();
    }
  };
}
