import { createArcade } from '../shared/arcade.js';
import { hasCommandModifier } from '../shared/keyboard.js';
import { buildCourse, makeCourseItem } from './scenery.js';
import { createAthlete } from './athlete.js';
import { frameTriathlon } from './camera.js';
import { RIVALS, rivalLane } from './rivals.js';
import { STAGES, clamp, advancePace, passageLane, finishPlace, raceProgress, scoreRace, formatTime, rivalAtTime, canDraft } from './rules.js';

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
  game.setShadowFocus(0, 0, -12);
  const athlete = createAthlete(scene, 'Viktor Jones', 0xd9ad4d, true);
  const rivals = RIVALS.map((r, i) => ({
    ...r, athlete: createAthlete(scene, r.name, r.color), progress: 0, phase: i * 1.8
  }));

  const dashboard = document.createElement('div'); dashboard.className = 'tri-dashboard';
  dashboard.innerHTML = `<div class="tri-stages">${STAGES.map((leg, i) => `<span class="tri-stage">0${i + 1} ${leg.verb}</span>`).join('')}</div>
    <div class="tri-progress" role="progressbar" aria-label="Hela loppet" aria-valuemin="0" aria-valuemax="100"><i></i></div>
    <div class="tri-energy-title"><span>ENERGI</span><span class="tri-energy-value">100 %</span></div><div class="tri-energy" role="meter" aria-label="Energi" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i></i></div><p class="tri-help"></p>`;
  ui.appendChild(dashboard);
  const controls = document.createElement('div'); controls.className = 'tri-controls';
  controls.innerHTML = `<div class="tri-direction"><button class="tri-control" data-control="left" aria-label="Styr åt vänster">←</button><button class="tri-control" data-control="right" aria-label="Styr åt höger">→</button></div><button class="tri-control tri-surge" data-control="surge">ÖKA TEMPOT<small>HÅLL · MELLANSLAG</small></button>`;
  ui.appendChild(controls);
  const callout = document.createElement('div'); callout.className = 'tri-callout'; ui.appendChild(callout);
  const energyValue = dashboard.querySelector('.tri-energy-value'), energyBar = dashboard.querySelector('.tri-energy i');
  const energyTrack = dashboard.querySelector('.tri-energy'), progressBar = dashboard.querySelector('.tri-progress i');
  const progressTrack = dashboard.querySelector('.tri-progress'), help = dashboard.querySelector('.tri-help');
  const stageLabels = [...dashboard.querySelectorAll('.tri-stage')];
  const held = new Map();
  const ambience = game.createVoice({ type: 'sine', frequency: 110, gain: 0 });
  const pointerActions = new Map();
  let state = 'intro', stage = 0, distance = 0, elapsed = 0, stageStart = 0, x = 0, stamina = 100;
  let exhausted = false, slow = 0, gates = 0, drinks = 0, hits = 0, drafting = false, displayClock = 0, best = game.loadBest() || 0;
  let splits = [], items = [], started = false;
  let combo = 0, bestCombo = 0, previousPlace = 1, feedbackCooldown = 0;
  let { speed } = STAGES[0];
  let lateralSpeed = 0;

  function clearInput() {
    held.clear(); pointerActions.clear();
    controls.querySelectorAll('.held').forEach(button => button.classList.remove('held'));
  }
  const codeAction = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'surge', ArrowUp: 'surge', KeyW: 'surge' };
  game.listen(window, 'blur', clearInput);
  game.listen(document, 'visibilitychange', clearInput);
  game.listen(root, 'arcadepause', clearInput);
  controls.querySelectorAll('button').forEach(button => {
    game.listen(button, 'pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (state !== 'race' || game.paused) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      pointerActions.set(event.pointerId, button.dataset.control); button.classList.add('held');
    });
    const release = event => {
      pointerActions.delete(event.pointerId);
      button.classList.toggle('held', [...pointerActions.values()].includes(button.dataset.control) || [...held.values()].includes(button.dataset.control));
    };
    game.listen(button, 'keydown', event => {
      if (hasCommandModifier(event)) return;
      if (event.code !== 'Space' && codeAction[event.code]) {
        if (state === 'race' && !game.paused) { event.preventDefault(); game.keys.add(event.code); }
        return;
      }
      if (!['Enter', 'Space'].includes(event.code) || event.repeat || state !== 'race' || game.paused) return;
      event.preventDefault(); held.set(event.code, button.dataset.control); button.classList.add('held');
    });
    const refresh = () => button.classList.toggle('held', [...pointerActions.values(), ...held.values()].includes(button.dataset.control));
    game.listen(button, 'keyup', event => { if (['Enter', 'Space'].includes(event.code)) { event.preventDefault(); held.delete(event.code); refresh(); } });
    game.listen(button, 'blur', () => { for (const [code, action] of held) if (action === button.dataset.control) held.delete(code); refresh(); });
    game.listen(button, 'pointerup', release); game.listen(button, 'pointercancel', release); game.listen(button, 'lostpointercapture', release);
  });
  const pressed = action => [...held.values()].includes(action) || [...pointerActions.values()].includes(action) || Object.entries(codeAction).some(([code, value]) => value === action && game.keys.has(code));

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
    controls.querySelector('.tri-surge').firstChild.textContent = discipline === 'swim' ? 'KRAFTIGA TAG' : discipline === 'run' ? 'ÖKA STEGET' : 'TRAMPA HÅRDARE';
    stageLabels.forEach((label, i) => { label.classList.toggle('active', i === stage); label.classList.toggle('done', i < stage); });
  }

  function start() {
    clearInput(); stage = 0; distance = elapsed = stageStart = x = 0; stamina = 100; exhausted = false;
    slow = gates = drinks = hits = combo = bestCombo = lateralSpeed = 0; ({ speed } = STAGES[0]); previousPlace = 1; feedbackCooldown = 0; splits = []; drafting = false; started = true; state = 'race';
    athlete.reset();
    rivals.forEach(r => { r.athlete.reset(); Object.assign(r, rivalAtTime(0, r.duration, r.strengths)); });
    controls.hidden = dashboard.hidden = false; buildItems(); game.hidePanel();
    game.setHUD(STAGES[0].name, '0:00.0', '1 / 4 · 260 m kvar');
    game.tone(392, 0.16, 'triangle'); game.toast('Starten går! Hitta din rytm.');
  }

  function finishStage() {
    splits.push(elapsed - stageStart); clearInput();
    if (stage === STAGES.length - 1) {
      state = 'result'; controls.hidden = true; callout.classList.remove('on');
      const score = scoreRace({ seconds: elapsed, gates, drinks, hits });
      const place = finishPlace(elapsed, rivals);
      const newBest = score > best; best = Math.max(best, score); game.saveBest(score);
      game.showPanel({
        eyebrow: `LOMSJÖN · ${place === 1 ? 'GULD' : place === 2 ? 'SILVER' : place === 3 ? 'BRONS' : 'I MÅL'}`,
        title: place === 1 ? 'Sjöns mästare!' : 'Hela vägen i mål!',
        body: `<p>Du blev <strong>${place}:a</strong> på <strong>${formatTime(elapsed)}</strong>. ${newBest ? 'Nytt personbästa!' : `Rekord: ${Number(best).toLocaleString('sv-SE')} poäng.`}</p>
          <div class="tri-splits">${splits.map((time, i) => `<div><small>${STAGES[i].name}</small><strong>${formatTime(time)}</strong></div>`).join('')}</div>
          <p><strong>${score.toLocaleString('sv-SE')} poäng</strong> · ${gates} simringar · ${drinks} flaskor · ${hits} hinder · längsta rena svit ${bestCombo}</p>
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
      body: `<p>${STAGES[stage].name.toLowerCase()} avklarad på <strong>${formatTime(splits[stage])}</strong>. Du har ${Math.round(stamina)} % energi kvar.</p><p>${guide.body}</p><p>← → eller A / D styr. Håll mellanslag eller tempoknappen för fart.</p>`,
      button: guide.button,
      onStart() {
        stage = next; distance = 0; stageStart = elapsed; slow = lateralSpeed = 0; ({ speed } = STAGES[stage]); state = 'race';
        stamina = Math.min(100, stamina + 12); exhausted = stamina < 25 && exhausted;
        controls.hidden = false; buildItems(); game.hidePanel(); clearInput(); game.tone(523, 0.16, 'triangle');
      }
    });
  }

  function updateItems(time, previousDistance, previousX) {
    for (const item of items) {
      const rel = item.at - distance;
      item.mesh.position.set(item.x, 0, -rel);
      item.mesh.visible = !item.resolved && rel > -4 && rel < 110;
      if (item.kind === 'drink') { item.mesh.rotation.y = time; item.mesh.position.y = Math.sin(time * 3 + item.at) * 0.08; }
      if (item.resolved) continue;
      const crossingX = passageLane(previousDistance, distance, previousX, x, item.at);
      if (crossingX === null) continue;
      item.resolved = true;
      if (Math.abs(crossingX - item.x) < (item.kind === 'gate' ? 0.8 : 0.85)) {
        if (item.kind === 'gate') {
          gates++; combo++; bestCombo = Math.max(bestCombo, combo); stamina = Math.min(100, stamina + 9); game.toast(combo >= 3 ? `${combo} RENA RINGAR I RAD · +9 ENERGI` : 'Ren linje! +9 energi · +140'); game.tone(660, 0.08, 'sine');
        } else if (item.kind === 'drink') {
          drinks++; stamina = Math.min(100, stamina + 26); game.toast('Påfyllning! +26 energi'); game.tone(880, 0.1, 'sine');
        } else {
          hits++; combo = 0; slow = 1.3; stamina = Math.max(0, stamina - 10); game.toast('Oj! Väj för de orange bommarna.'); game.tone(120, 0.18, 'triangle');
        }
      } else if (item.kind === 'gate') { combo = 0; game.toast('Missad ring — sikta mellan bojarna.'); }
    }
  }

  function updateRivals(dt, time) {
    drafting = false;
    for (const r of rivals) {
      Object.assign(r, rivalAtTime(elapsed, r.duration, r.strengths));
      const delta = r.distance - distance;
      const visualLane = rivalLane(r, time);
      r.athlete.root.position.set(visualLane, 0, -delta);
      r.athlete.root.visible = r.stage === stage && !r.finished && delta > -12 && delta < 100;
      if (canDraft(stage, distance, x, { ...r, lane: visualLane })) drafting = true;
      if (r.athlete.root.visible) r.athlete.update(STAGES[r.stage].id, dt, time + r.phase, false, r.speed);
    }
  }

  game.onFrame((dt, time) => {
    const discipline = STAGES[stage].id;
    if (state === 'race') {
      const previousDistance = distance, previousX = x;
      drafting = rivals.some(r => canDraft(stage, distance, x, { ...r, lane: rivalLane(r, time) }));
      const direction = Number(pressed('right')) - Number(pressed('left'));
      const current = discipline === 'swim' ? Math.sin(elapsed * 0.65) * 0.21 : 0;
      const lateralTarget = direction * (discipline === 'bike' ? 5.8 : 4.8);
      lateralSpeed += (lateralTarget - lateralSpeed) * (1 - Math.exp(-dt * 13));
      const pace = advancePace({ stamina, exhausted, stage, surge: pressed('surge'), drafting, slow, speed }, dt, STAGES[stage].distance - distance);
      ({ stamina, exhausted, speed } = pace);
      x = clamp(x + (lateralSpeed + current) * pace.time, -3.85, 3.85);
      distance += pace.distance; elapsed += pace.time;
      slow = Math.max(0, slow - pace.time); feedbackCooldown = Math.max(0, feedbackCooldown - pace.time);
      updateRivals(pace.time, time);
      athlete.update(discipline, pace.time, time, pace.pushing, speed);
      athlete.root.position.x = x;
      athlete.root.rotation.z = lateralSpeed * (discipline === 'swim' ? -0.014 : -0.022);
      controls.querySelector('.tri-surge').classList.toggle('pushing', pace.pushing);
      updateItems(time, previousDistance, previousX);
      const place = 1 + rivals.filter(r => r.progress > raceProgress(stage, distance)).length;
      if (place < previousPlace && feedbackCooldown === 0) { game.toast(place === 1 ? 'DU TAR LEDNINGEN!' : `FÖRBI! · PLATS ${place}`); game.tone(587, 0.1, 'triangle'); feedbackCooldown = 2; }
      previousPlace = place;
      callout.classList.toggle('on', drafting || exhausted || (stage === STAGES.length - 1 && STAGES[stage].distance - distance < 100));
      callout.textContent = exhausted ? 'HÄMTA ANDAN · SLÄPP TEMPOT' : drafting ? 'I LÄ · SPARAR ENERGI' : 'MÅLET NÄRMAR SIG · SLUTSPURT!';
      if (distance >= STAGES[stage].distance) { ({ distance } = STAGES[stage]); finishStage(); }
    } else if (state === 'intro') {
      athlete.update('swim', dt, time, false);
      rivals.forEach((r, i) => { r.athlete.root.position.set(r.lane, 0, -5 - i * 3); r.athlete.update('swim', dt, time + r.phase, false); });
    }
    ambience.set(48 + speed * 3, state === 'race' && discipline === 'bike' ? 0.004 : 0);
    frameTriathlon(camera, { x: athlete.root.position.x, started, discipline });
    course.update(discipline, distance, STAGES[stage].distance - distance, time);
    displayClock += dt;
    if (displayClock > 0.1) {
      displayClock = 0;
      const place = 1 + rivals.filter(r => r.progress > raceProgress(stage, distance)).length;
      game.setHUD(STAGES[stage].name, formatTime(elapsed), `${place} / 4 · ${Math.max(0, Math.ceil(STAGES[stage].distance - distance))} m kvar`);
      energyValue.textContent = `${Math.round(stamina)} %`; energyBar.style.width = `${stamina}%`; energyTrack.classList.toggle('low', stamina < 25); energyTrack.setAttribute('aria-valuenow', String(Math.round(stamina)));
      const progress = Math.round(raceProgress(stage, distance) * 100);
      progressBar.style.width = `${progress}%`; progressTrack.setAttribute('aria-valuenow', String(progress));
    }
  });

  controls.hidden = true;
  help.textContent = 'Tre grenar. En energireserv. Hitta din rytm.';
  game.showPanel({
    eyebrow: 'LOMSJÖN · 2017 · ETT LOPP, TRE GRENAR', title: 'Pekkas Triathlon',
    body: `<p>Simma över sjön, spring genom skogen och cykla mot pokalen som <strong>Viktor Jones</strong>.</p><p><strong>← → / A D</strong> styr. Håll <strong>mellanslag</strong> eller <strong>tempoknappen</strong> för fart. Släpp för att återhämta energi. Mobilen har samma kontroller på skärmen.</p><p>Guldringar, gröna energiflaskor och cyklisternas lä hjälper dig förbi Per, Mikael och Tobias. Väj för orange hinder.</p><p><small>2017 års ordning: simning, löpning, cykling. En kort arkadtolkning med tillåten drafting. ${best ? `Rekord: ${Number(best).toLocaleString('sv-SE')} poäng.` : 'Hela loppet tar cirka två minuter.'}</small></p>`,
    button: 'Till startlinjen', onStart: start
  });

  return {
    destroy() {
      clearInput(); ambience.stop(); removeItems(); course.dispose(); athlete.dispose(); rivals.forEach(r => r.athlete.dispose()); game.destroy();
    }
  };
}
