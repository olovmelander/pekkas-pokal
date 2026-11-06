/** Pekkas Gokart HUD: a calm race readout, DOM start lights, live lap delta,
 * a compact leaderboard, a speedometer with an rpm arc, a grip meter, a
 * wrong-way warning, a final-lap banner and the mode/difficulty choice for
 * the start panel. `update(dt, info)` also reports race moments (light on,
 * lights out, laps, impacts, the flag) through `onEvent`, so sound and camera
 * shake follow the race without the race loop calling them.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const SETUP_KEY = 'pp-kart-setup';
const DRIVING = new Set(['grid', 'lights', 'countdown', 'racing']);
const MODES = [['race', 'Lopp', '3 varv mot fem rivaler'], ['time', 'Tidskörning', 'Ensam på banan mot ditt bästa varv']];
const LEVELS = [['easy', 'Lätt'], ['normal', 'Normal'], ['hard', 'Svår']];
const BUCKET = 5;

/** Tenths are truncated, preventing a false 0:60.0 at the minute boundary. */
export function clockText(seconds) {
  const tenths = Math.floor(Math.max(0, finite(seconds)) * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}
export function deltaText(seconds) {
  const value = Math.round(finite(seconds) * 100) / 100;
  return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2).replace('.', ',')}`;
}

function loadSetup() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETUP_KEY) || '{}');
    return {
      mode: MODES.some(([value]) => value === saved.mode) ? saved.mode : 'race',
      difficulty: LEVELS.some(([value]) => value === saved.difficulty) ? saved.difficulty : 'normal'
    };
  } catch { return { mode: 'race', difficulty: 'normal' }; }
}

const MARKUP = `
  <div class="kart-steer-zone" aria-hidden="true"></div>
  <div class="kart-steer-knob" aria-hidden="true"><i></i></div>
  <div class="kart-race-meta">
    <div class="kart-place"><strong data-position>6</strong><small data-field>/ 6</small></div>
    <div class="kart-race-lines"><span data-lap>VARV 1 / 3</span><span data-time>0:00.0</span><span class="kart-delta" data-delta hidden></span></div>
  </div>
  <div class="kart-side">
    <svg class="kart-map" role="img" aria-label="Bankarta med din guldfärgade kart och motståndarna"><path></path></svg>
    <ol class="kart-board" aria-label="Ställning"></ol>
  </div>
  <button type="button" class="kart-view" data-toggle="view" aria-label="Byt kameravy (C)" title="Byt kameravy (C)"><span>VY</span><small>C</small></button>
  <div class="kart-signal" role="status" aria-live="polite">
    <div class="kart-lights" hidden><span class="kart-lights-label">Startljus</span><i></i><i></i><i></i><i></i><i></i></div>
    <div class="kart-flash" hidden></div>
    <div class="kart-banner" hidden></div>
  </div>
  <div class="kart-dashboard">
    <div class="kart-gauge">
      <svg viewBox="0 0 120 78" aria-hidden="true">
        <path class="kart-gauge-track" d="M14.9 74.4 A48 48 0 1 1 105.1 74.4" pathLength="100"></path>
        <path class="kart-gauge-red" d="M14.9 74.4 A48 48 0 1 1 105.1 74.4" pathLength="100"></path>
        <path class="kart-gauge-rpm" d="M14.9 74.4 A48 48 0 1 1 105.1 74.4" pathLength="100"></path>
      </svg>
      <div class="kart-speed"><b>0</b><small>KM/H</small></div>
    </div>
    <div class="kart-grip" role="meter" aria-label="Däckgrepp" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i></i><span>GREPP</span></div>
    <div class="kart-tip">HÅLL GAS · BROMSA FÖRE KURVAN</div>
  </div>
  <div class="kart-controls" data-game-controls>
    <div class="kart-control-group"><button type="button" data-control="left" aria-label="Styr vänster">←<small>A / ←</small></button><button type="button" data-control="right" aria-label="Styr höger">→<small>D / →</small></button></div>
    <div class="kart-control-group"><button type="button" data-control="brake" aria-label="Bromsa"><span>BROMS</span><small>S / ↓ / ␣</small></button><button type="button" data-control="throttle" aria-label="Håll för att gasa"><span>GAS</span><small>W / ↑</small></button></div>
  </div>
  <button type="button" class="kart-autogas" data-toggle="autogas" aria-pressed="false" aria-label="Autogas: håller gasen åt dig">AUTOGAS <b>AV</b></button>`;

export function createKartHud(game, { track, rivals = [], onEvent = () => {} } = {}) {
  const el = document.createElement('div');
  el.className = 'kart-interface';
  el.dataset.state = 'menu';
  el.innerHTML = MARKUP;
  game.ui.appendChild(el);
  const find = (selector) => el.querySelector(selector);
  const fields = {
    position: find('[data-position]'), field: find('[data-field]'), lap: find('[data-lap]'), time: find('[data-time]'), delta: find('[data-delta]'),
    board: find('.kart-board'), lights: find('.kart-lights'), lamps: [...el.querySelectorAll('.kart-lights i')], flash: find('.kart-flash'), banner: find('.kart-banner'),
    speed: find('.kart-speed b'), rpm: find('.kart-gauge-rpm'), grip: find('.kart-grip'), gripBar: find('.kart-grip i'), gripLabel: find('.kart-grip span'),
    tip: find('.kart-tip'), view: find('.kart-view')
  };
  // Track map.
  const map = find('.kart-map');
  const { bounds } = track;
  map.setAttribute('viewBox', `${bounds.min.x - 8} ${bounds.min.z - 8} ${bounds.max.x - bounds.min.x + 16} ${bounds.max.z - bounds.min.z + 16}`);
  map.querySelector('path').setAttribute('d', `${Array.from({ length: 101 }, (_, i) => {
    const point = track.sample(i / 100 * track.length).position;
    return `${i ? 'L' : 'M'}${point.x.toFixed(1)},${point.z.toFixed(1)}`;
  }).join(' ')} Z`);
  const dot = (color, radius, className = '') => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color);
    if (className) circle.setAttribute('class', className);
    map.appendChild(circle);
    return circle;
  };
  const rivalDots = rivals.map((rival) => dot(rival.color, 3.2));
  const ghostDot = dot('#f4f1e6', 3.4, 'kart-map-ghost');
  const playerDot = dot('#ffdc75', 4.5, 'kart-map-you');

  // Memory between frames.
  let hudClock = 1, dashClock = 1;
  let previous = { state: 'menu', lap: 1, lightsLit: 0, lightsOut: false, jumpStart: false, hit: 0 };
  let flashUntil = 0, bannerUntil = 0, bannerText = '', wrongClock = 0, wrongWay = false, clock = 0;
  let lastDistance = null;
  let lapTimes = [];
  // Live lap delta against the best lap: the lap time at every 5 m of the lap.
  const buckets = Math.ceil(track.length / BUCKET) + 1;
  let current = new Float32Array(buckets).fill(NaN), reference = null, referenceTime = Infinity, liveDelta = null, lastBucket = -1, lapStartSeen = 0;

  function flash(text, kind = 'go', seconds = 1.1) {
    fields.flash.textContent = text;
    fields.flash.dataset.kind = kind;
    fields.flash.hidden = false;
    flashUntil = clock + seconds;
  }
  function banner(text, seconds = 2.6) {
    bannerText = text;
    bannerUntil = clock + seconds;
  }

  function standingsOf(player, opponents) {
    return [player, ...opponents].sort((a, b) => {
      if (a.finishTime != null && b.finishTime != null) return a.finishTime - b.finishTime;
      if (a.finishTime != null) return -1;
      if (b.finishTime != null) return 1;
      return b.distance - a.distance;
    });
  }

  function trackLapDelta(info, player) {
    const lap = finite(info.lap, 1);
    if (lap !== previous.lap) {
      // The lap that just ended becomes the reference if it was the quickest.
      const lapTime = finite(info.lastLap, finite(info.lapStarted) - lapStartSeen);
      if (lapTime > 0 && lapTime < referenceTime) { reference = current; referenceTime = lapTime; }
      current = new Float32Array(buckets).fill(NaN);
      lastBucket = -1;
    }
    lapStartSeen = finite(info.lapStarted);
    const offset = finite(player.distance) - (lap - 1) * track.length;
    const bucket = Math.floor(clamp(offset, 0, track.length) / BUCKET);
    if (bucket !== lastBucket && bucket >= 0 && bucket < buckets) {
      lastBucket = bucket;
      const lapTime = finite(info.elapsed) - finite(info.lapStarted);
      if (Number.isNaN(current[bucket])) current[bucket] = lapTime;
      liveDelta = reference && Number.isFinite(reference[bucket]) && bucket > 1 ? lapTime - reference[bucket] : liveDelta;
    }
  }

  function events(info, player) {
    const { state } = info;
    if (state === 'lights' && finite(info.lightsLit) > previous.lightsLit) onEvent('light', { lit: info.lightsLit });
    const out = !!info.lightsOut || (previous.state === 'lights' && state === 'racing');
    if (out && !previous.lightsOut && DRIVING.has(state)) {
      onEvent('go');
      flash(info.jumpStart ? 'TJUVSTART!' : 'KÖR!', info.jumpStart ? 'jump' : 'go', info.jumpStart ? 1.6 : 1.1);
    }
    if (info.jumpStart && !previous.jumpStart) onEvent('jump');
    if (state === 'racing' && finite(info.lap, 1) > previous.lap) {
      if (Number.isFinite(info.lastLap) && info.lastLap > 0) lapTimes.push(info.lastLap);
      const last = finite(info.lap) >= finite(info.laps, 3);
      onEvent(last ? 'final' : 'lap', { lap: info.lap });
      if (last) banner('SISTA VARVET');
    }
    if (state === 'result' && previous.state !== 'result') onEvent('finish', { position: info.position });
    const hit = finite(player.hit);
    if (DRIVING.has(state) && hit > previous.hit + 0.3) {
      const wall = !!player.wallContact || hit >= 0.75;
      onEvent(wall ? 'impact' : 'bump', { strength: clamp(finite(player.speed) / 12 + 0.3, 0.3, 1.3), shake: wall ? 0.85 : 0.4 });
    }
    previous = { state, lap: finite(info.lap, 1), lightsLit: finite(info.lightsLit), lightsOut: out, jumpStart: !!info.jumpStart, hit };
  }

  function wrongWayCheck(info, player, dt) {
    if (info.state !== 'racing' || player.finishTime != null) { wrongClock = 0; wrongWay = false; lastDistance = null; return; }
    const heading = Number.isFinite(player.heading) ? player.heading : null;
    const back = heading !== null ? Math.cos(heading) < -0.25 : lastDistance !== null && player.distance < lastDistance - 0.02;
    const forward = heading !== null ? Math.cos(heading) > 0.2 : lastDistance !== null && player.distance > lastDistance + 0.02;
    lastDistance = player.distance;
    if (back && finite(player.speed) > 1.2) wrongClock += dt;
    else if (forward || finite(player.speed) < 0.5) wrongClock = Math.max(0, wrongClock - dt * 3);
    const now = wrongClock > 1;
    if (now && !wrongWay) onEvent('wrong');
    wrongWay = now ? true : wrongClock <= 0.05 ? false : wrongWay;
  }

  function signal(info) {
    const showLights = info.state === 'grid' || info.state === 'lights' || (info.state === 'racing' && clock < flashUntil && previous.lightsOut && finite(info.elapsed) < 1.2);
    fields.lights.hidden = !showLights;
    if (showLights) {
      const lit = info.lightsOut || info.state === 'racing' ? 0 : clamp(Math.round(finite(info.lightsLit)), 0, 5);
      fields.lamps.forEach((lamp, i) => lamp.classList.toggle('on', i < lit));
      fields.lights.dataset.out = String(!!info.lightsOut || info.state === 'racing');
    }
    if (!fields.flash.hidden && clock > flashUntil) fields.flash.hidden = true;
    const text = wrongWay ? 'FEL HÅLL · VÄND OM' : clock < bannerUntil ? bannerText : '';
    if (fields.banner.textContent !== text) fields.banner.textContent = text;
    fields.banner.hidden = !text;
    fields.banner.dataset.kind = wrongWay ? 'warn' : 'info';
  }

  function board(info, player, opponents, standings) {
    const time = info.mode === 'time';
    let html = '';
    if (time) {
      // Time trial: the ghost gap, the best lap and the latest lap times.
      const trial = info.trial || {};
      const best = Math.min(finite(trial.bestLap, Infinity), finite(info.bestLap, Infinity), ...lapTimes);
      const ghostTime = typeof trial.ghost === 'number' ? trial.ghost : trial.ghost?.lapTime;
      if (Number.isFinite(trial.delta)) {
        html += `<li data-near class="is-ghost"><span>Spöket</span><em class="kart-gap" data-sign="${trial.delta <= 0 ? 'ahead' : 'behind'}">${deltaText(trial.delta)}</em></li>`;
      } else {
        html += `<li data-near class="is-ghost"><span>Spöket</span><em>${Number.isFinite(ghostTime) ? clockText(ghostTime) : 'kör ett varv'}</em></li>`;
      }
      html += `<li data-near class="is-best"><span>Bästa</span><em>${Number.isFinite(best) ? clockText(best) : '–'}</em></li>`;
      const shown = lapTimes.slice(-3);
      shown.forEach((time, i) => {
        const number = lapTimes.length - shown.length + i + 1;
        html += `<li${i === shown.length - 1 ? ' data-near' : ''}${time === best ? ' class="is-you"' : ''}><span>Varv ${number}</span><em>${clockText(time)}</em></li>`;
      });
    } else {
      const you = standings.indexOf(player);
      const pace = Math.max(6, finite(player.speed));
      standings.forEach((driver, i) => {
        const near = Math.abs(i - you) <= 1 || (you === 0 && i === 2) || (you === standings.length - 1 && i === standings.length - 3);
        const gap = driver === player ? 'DU' : driver.finishTime != null ? 'MÅL' : (Math.abs(finite(driver.distance) - finite(player.distance)) / pace).toFixed(1).replace('.', ',');
        const name = driver === player ? 'Du' : driver.name ?? driver.full ?? 'Rival';
        html += `<li${near ? ' data-near' : ''}${driver === player ? ' class="is-you"' : ''}><b>${i + 1}</b><span>${name}</span><em>${gap}</em></li>`;
      });
    }
    if (fields.board.innerHTML !== html) fields.board.innerHTML = html;
    fields.board.hidden = !html;
  }

  function tip(info, player, controlsHint) {
    if (info.state === 'grid' || info.state === 'lights') return 'VÄNTA TILLS LJUSEN SLOCKNAR';
    const speed = finite(player.speed);
    if (speed < 1) return controlsHint;
    if (wrongWay) return 'VÄND OCH KÖR ÅT ANDRA HÅLLET';
    if (player.surface === 'grass') return 'GRÄS BROMSAR · TILLBAKA TILL ASFALTEN';
    if (finite(player.wheelspin) > 0.45) return 'HJULSPINN · MJUKARE PÅ GASEN';
    if (finite(player.slip) > 0.35) return 'BAKEN SLÄPPER · MOTSTYR MJUKT';
    const upcoming = Math.min(18.6, Math.sqrt(11.4 / Math.max(0.001, Math.abs(finite(track.curvature(finite(player.distance) + 12))))));
    if (speed > upcoming * 1.12) return 'BROMSA INFÖR KURVAN';
    if (finite(player.slipstream) > 0.2) return 'I SUGET · VÄLJ LÄGE FÖR OMKÖRNING';
    if (player.surface === 'kerb') return 'KANTSTENEN SKAKAR · HÅLL LINJEN';
    return 'BRA GREPP · HITTA DIN LINJE';
  }

  function dashboard(player, rpm) {
    const speed = Math.round(Math.max(0, finite(player.speed)) * 3.6);
    if (fields.speed.textContent !== String(speed)) fields.speed.textContent = String(speed);
    const fill = clamp((finite(rpm, 1400) - 1000) / 3000, 0, 1);
    fields.rpm.style.strokeDashoffset = (100 - fill * 100).toFixed(1);
    fields.rpm.classList.toggle('is-high', fill > 0.88);
    const grip = clamp(finite(player.grip, 1), 0, 1);
    fields.gripBar.style.width = `${(grip * 100).toFixed(0)}%`;
    fields.grip.setAttribute('aria-valuenow', String(Math.round(grip * 100)));
    const sliding = finite(player.slip) > 0.25 || !!player.skidding;
    const grass = player.surface === 'grass';
    fields.grip.dataset.mode = grass ? 'grass' : sliding ? 'slide' : 'grip';
    const label = grass ? 'GRÄS' : sliding ? 'GLIDER' : 'GREPP';
    if (fields.gripLabel.textContent !== label) fields.gripLabel.textContent = label;
  }

  return {
    el,
    flash,
    banner,
    setView(view) {
      fields.view.dataset.view = view;
      fields.view.querySelector('span').textContent = view === 'nose' ? 'NÄRA' : 'BAKOM';
      fields.view.setAttribute('aria-label', `Kameravy: ${view === 'nose' ? 'nära, framför föraren' : 'bakom karten'}. Byt med C.`);
    },
    /** Start-panel markup for mode and difficulty, pre-filled with the last choice. */
    setupHTML(selected = loadSetup()) {
      const radios = (name, options, value) => options.map(([key, label, note]) => `<label><input type="radio" name="${name}" value="${key}"${key === value ? ' checked' : ''}><span>${label}${note ? `<small>${note}</small>` : ''}</span></label>`).join('');
      return `<div class="kart-setup"><fieldset class="kart-setup-mode"><legend>Läge</legend>${radios('kart-mode', MODES, selected.mode)}</fieldset><fieldset class="kart-setup-level"><legend>Svårighet</legend>${radios('kart-level', LEVELS, selected.difficulty)}</fieldset></div>`;
    },
    /** Reads (and remembers) the choice from the open panel. */
    readSetup() {
      const fallback = loadSetup();
      const mode = game.root.querySelector('input[name="kart-mode"]:checked')?.value ?? fallback.mode;
      const difficulty = game.root.querySelector('input[name="kart-level"]:checked')?.value ?? fallback.difficulty;
      const setup = { mode: MODES.some(([value]) => value === mode) ? mode : 'race', difficulty: LEVELS.some(([value]) => value === difficulty) ? difficulty : 'normal' };
      try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch { /* private mode */ }
      return setup;
    },
    reset() {
      previous = { state: 'grid', lap: 1, lightsLit: 0, lightsOut: false, jumpStart: false, hit: 0 };
      current = new Float32Array(buckets).fill(NaN); reference = null; referenceTime = Infinity; liveDelta = null; lastBucket = -1; lapStartSeen = 0;
      wrongClock = 0; wrongWay = false; bannerUntil = 0; flashUntil = 0; fields.flash.hidden = true; lastDistance = null; lapTimes = [];
    },
    update(dt, info, { rpm = 1400, controlsHint = 'HÅLL GAS ELLER ↑ / W FÖR ATT KÖRA' } = {}) {
      const step = clamp(finite(dt), 0, 0.1);
      clock += step;
      const { player } = info;
      const opponents = info.mode === 'time' ? [] : info.opponents ?? [];
      const driving = DRIVING.has(info.state);
      el.dataset.state = driving ? 'racing' : 'menu';
      el.dataset.mode = info.mode === 'time' ? 'time' : 'race';
      game.root.classList.toggle('kart-driving', driving);
      if (info.state === 'racing') trackLapDelta(info, player);
      events(info, player);
      wrongWayCheck(info, player, step);
      signal(info);
      dashClock += step;
      if (dashClock > 1 / 30) { dashClock = 0; dashboard(player, rpm); }
      hudClock += step;
      if (hudClock < 0.1) return;
      hudClock = 0;
      const standings = info.mode === 'time' ? [] : standingsOf(player, opponents);
      const position = finite(info.position, standings.indexOf(player) + 1);
      const laps = finite(info.laps, 3);
      if (info.mode === 'time') {
        fields.position.textContent = clockText(finite(info.elapsed) - finite(info.lapStarted));
        fields.field.textContent = 'VARVTID';
        fields.time.textContent = `TOTALT ${clockText(info.elapsed)}`;
      } else {
        fields.position.textContent = String(position || 1);
        fields.field.textContent = `/ ${standings.length}`;
        fields.time.textContent = clockText(info.elapsed);
      }
      fields.lap.textContent = `VARV ${clamp(finite(info.lap, 1), 1, laps)} / ${laps}`;
      const delta = info.mode === 'time' && Number.isFinite(info.trial?.delta) ? info.trial.delta : liveDelta;
      const showDelta = info.state === 'racing' && Number.isFinite(delta) && finite(info.lap, 1) > 1;
      fields.delta.hidden = !showDelta;
      if (showDelta) {
        fields.delta.textContent = deltaText(delta);
        fields.delta.dataset.sign = delta <= 0 ? 'ahead' : 'behind';
      }
      board(info, player, opponents, standings);
      const text = tip(info, player, controlsHint);
      if (fields.tip.textContent !== text) fields.tip.textContent = text;
      // Map dots.
      const place = (circle, driver) => {
        const point = track.sample(finite(driver.distance)).position;
        circle.setAttribute('cx', point.x.toFixed(1));
        circle.setAttribute('cy', point.z.toFixed(1));
      };
      rivalDots.forEach((circle, i) => {
        const driver = opponents[i];
        circle.style.display = driver ? '' : 'none';
        if (driver) place(circle, driver);
      });
      ghostDot.style.display = info.ghost ? '' : 'none';
      if (info.ghost) place(ghostDot, info.ghost);
      place(playerDot, player);
    },
    destroy() { game.root.classList.remove('kart-driving'); el.remove(); }
  };
}
