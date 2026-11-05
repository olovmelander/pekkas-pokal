import { createArcade } from '../shared/arcade.js';
import { buildStadium } from './world.js';
import {
  BUDGET, ROUNDS, PLAYERS, CLUBS, POSITIONS, DEFAULT_SQUAD, RIVALS, playerById,
  squadCost, canTransfer, difficulty, forecast, scoreSquad, rankStandings, undoTransfer,
  squadForecast, upcomingFixtures, planRival, roundVerdict
} from './rules.js';

export const layout = 'full';
const POS_LABEL = { MV: 'Målvakt', BACK: 'Försvarare', MITT: 'Mittfältare', ANF: 'Anfallare' };
const FIXTURE_LABEL = ['Lätt', 'Jämn', 'Svår'];
const money = (n) => `${n.toFixed(1).replace('.', ',')} M`;
const surname = (name) => name.split(' ').at(-1);
const shirt = (color, number) => `<svg class="fy-shirt" viewBox="0 0 60 60" aria-hidden="true"><path d="M19 8 7 16 1 29 12 34 17 26 17 55 43 55 43 26 48 34 59 29 53 16 41 8 35 12 25 12Z" fill="${color}" stroke="#ffffff66" stroke-width="1.5"/><path d="m25 12 5 6 5-6" fill="none" stroke="#fff1cc" stroke-width="3"/><path d="M19 10v43M41 10v43" stroke="#ffffff15" stroke-width="5"/><text x="30" y="42" fill="#fff4d7" font-size="22" font-family="Georgia" text-anchor="middle">${number}</text></svg>`;

export default async function createFantasy(container) {
  const arcade = await createArcade(container, {
    id: 'fantasy', title: 'Pekkas Fantasy', subtitle: '2011 · Där allt började',
    accent: '#d8b560', sky: 0x16223b, fog: 0x273247
  });
  arcade.root.classList.add('fy-game');
  const { camera, scene } = arcade;
  arcade.sun.intensity = 1.65;
  arcade.ambient.intensity = 1.7;
  const world = buildStadium(scene, { reducedMotion: arcade.reducedMotion });
  camera.fov = 46;
  camera.near = 0.1;
  camera.far = 240;
  camera.updateProjectionMatrix();
  const app = document.createElement('div');
  app.className = 'fy-app';
  app.hidden = true;
  arcade.ui.appendChild(app);
  let phase = 'intro';
  let seed = 1;
  let round = 0;
  let squad = DEFAULT_SQUAD.slice();
  let baseline = null;
  let captain = 'brook';
  let selected = 4;
  let total = 0;
  let rivals = [];
  let tripleUsed = false;
  let tripleActive = false;
  let match = null;
  let matchTime = 0;
  let revealed = 0;
  let celebration = 0;
  let history = [];
  let managerView = 'team';
  let expectedMatch = 0;
  let captainBonus = 0;

  function hud() {
    arcade.setHUD('FANTASY', `${total} p`, `Omgång ${round + 1} / ${ROUNDS} · Rekord ${arcade.loadBest()} p`);
  }
  function standings() {
    return rankStandings([{ name: 'Du', points: total, you: true }, ...rivals]);
  }
  function leagueHtml() {
    return `<ol class="fy-league">${standings().map((r) => `<li class="${r.you ? 'fy-you' : ''}"><span>${r.place}</span><strong>${r.name}</strong><b>${r.points} <small>p</small></b></li>`).join('')}</ol>`;
  }
  function lineupHtml() {
    return squad.map((id, i) => {
      const p = playerById(id);
      return `<div class="fy-player fy-player-${i}${selected === i ? ' is-selected' : ''}">
        <button class="fy-select" data-action="slot" data-slot="${i}" aria-label="Välj ${p.name}, ${POS_LABEL[p.position]}" aria-pressed="${selected === i}">
          ${shirt(CLUBS[p.club].color, i + 1)}<strong>${surname(p.name)}</strong><span>${forecast(p, round, seed).toFixed(1).replace('.', ',')} p · ${FIXTURE_LABEL[difficulty(p.club, round, seed) - 1].toLowerCase()} match</span>
        </button>
        <button class="fy-captain${captain === id ? ' is-captain' : ''}" data-action="captain" data-id="${id}" aria-label="Gör ${p.name} till kapten" aria-pressed="${captain === id}">${captain === id ? '★ KAPTEN' : 'VÄLJ KAPTEN'}</button>
      </div>`;
    }).join('');
  }
  function marketHtml() {
    const current = playerById(squad[selected]);
    const options = PLAYERS.filter((p) => p.position === POSITIONS[selected]);
    const present = forecast(current, round, seed);
    return `<div class="fy-market-heading"><div><span class="fy-eyebrow">TRANSFERMARKNAD</span><h3>${POS_LABEL[current.position]}</h3></div><span class="fy-number">${selected + 1} / 5</span></div>
      <div class="fy-role-picker" aria-label="Välj lagplats">${squad.map((id, i) => `<button type="button" data-action="slot" data-slot="${i}" aria-pressed="${selected === i}" class="${selected === i ? 'active' : ''}">${POSITIONS[i]}<small>${surname(playerById(id).name)}</small></button>`).join('')}</div>
      <p class="fy-hint">${round === 0 ? 'Bygg ditt lag. Du kan byta fritt före premiären.' : 'Ett spelarbyte per omgång. Bytet låses först vid avspark.'}</p>
      <div class="fy-market-list">${options.map((p) => {
    const owned = squad.includes(p.id);
    const active = squad[selected] === p.id;
    const enabled = !active && canTransfer(squad, selected, p.id, baseline);
    const cost = squadCost(squad) - current.price + p.price;
    let reason = `${forecast(p, round, seed).toFixed(1).replace('.', ',')} p prognos`;
    if (!active && owned) reason = 'Redan i ditt lag';
    else if (cost > BUDGET) reason = 'Över budget';
    else if (!active && !enabled) reason = 'Ångra det andra bytet först';
    const delta = forecast(p, round, seed) - present;
    const fixtures = upcomingFixtures(p, round, seed);
    return `<button class="fy-market-player${active ? ' is-active' : ''}" data-action="buy" data-id="${p.id}" ${enabled ? '' : 'disabled'}>
          <span class="fy-kit-dot" style="--kit:${CLUBS[p.club].color}">${CLUBS[p.club].short}</span>
          <span class="fy-market-name"><strong>${p.name}</strong><span>${reason}</span><span class="fy-fixture-path" aria-label="Kommande matcher">${fixtures.map((f) => `<i class="fy-fixture fy-fixture-${f.difficulty}" title="Omgång ${f.round + 1}: ${FIXTURE_LABEL[f.difficulty - 1]}, ${f.expected.toFixed(1)} poäng i prognos">${f.round + 1} · ${FIXTURE_LABEL[f.difficulty - 1]}</i>`).join('')}</span>${enabled ? `<em class="fy-delta ${delta >= 0 ? 'positive' : ''}">${delta >= 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')} p mot ${surname(current.name)}</em>` : ''}</span>
          <span class="fy-market-price">${money(p.price)}<small>${active ? 'I LAGET' : enabled ? 'VÄLJ +' : '—'}</small></span>
        </button>`;
  }).join('')}</div>
      ${baseline && squad.some((id, i) => id !== baseline[i]) ? '<button class="fy-text-button" data-action="undo">Ångra spelarbytet</button>' : ''}
      <details class="fy-rules"><summary>Så fungerar poängen</summary><p>Alla spelar 90 minuter: 2 p. Mål: MV 10, back 6, mittfält 5, anfall 4. Assist: 3 p. Nollan: MV/back 4, mittfält 1. Var tredje räddning: 1 p. MV/back tappar 1 p per två insläppta mål. Kaptenen ger dubbelt. Prognoser är förväntningar, inga garantier.</p><p>Rivalerna får samma spelarresultat som du. De planerar ett byte och kapten med samma öppna prognoser. Fristående arkadtolkning med påhittade spelare och simulerade matcher.</p></details>`;
  }
  function renderManager() {
    const focused = document.activeElement;
    const restore = app.contains(focused) && focused.dataset.action ? { ...focused.dataset } : null;
    phase = 'manage';
    app.hidden = false;
    app.classList.remove('is-match');
    app.dataset.view = managerView;
    const predicted = squadForecast(squad, captain, round, seed, tripleActive);
    const captainPlayer = playerById(captain);
    const captainExpected = forecast(captainPlayer, round, seed) * (tripleActive ? 3 : 2);
    app.innerHTML = `<nav class="fy-mobile-tabs" aria-label="Lagets vyer"><button type="button" data-action="view-team" aria-pressed="${managerView === 'team'}">Startfemman</button><button type="button" data-action="view-market" aria-pressed="${managerView === 'market'}">Marknad & liga</button></nav><section class="fy-management" aria-label="Ditt fantasylag">
      <div class="fy-team-header"><div><span class="fy-eyebrow">DIN STARTFEMMA</span><h2>Bygg ett mästarlag.</h2></div><div class="fy-budget"><strong>${money(BUDGET - squadCost(squad))}</strong><span>kvar av ${BUDGET} M</span></div></div>
      <div class="fy-scout-strip"><div><span>LAGETS PROGNOS</span><strong>${predicted.toFixed(1).replace('.', ',')} <small>p</small></strong></div><p><b>${surname(captainPlayer.name)} ×${tripleActive ? 3 : 2}</b><span>${captainExpected.toFixed(1).replace('.', ',')} p som kapten · ${FIXTURE_LABEL[difficulty(captainPlayer.club, round, seed) - 1].toLowerCase()} match</span></p></div>
      <div class="fy-formation"><div class="fy-field-lines" aria-hidden="true"></div>${lineupHtml()}</div>
      <div class="fy-matchday"><div><span class="fy-eyebrow">OMGÅNG ${round + 1} AV ${ROUNDS}</span><p>${round === 0 ? 'Hitta fynden. Välj kaptenen. Jaga pokalen.' : 'Läs spelschemat. Välj nästa matchvinnare.'}</p></div>
        <button class="fy-chip${tripleActive ? ' is-active' : ''}" data-action="chip" aria-pressed="${tripleActive}" ${tripleUsed ? 'disabled' : ''}>${tripleUsed ? '3× Använd' : tripleActive ? '3× Aktiv!' : '3× Kapten'}<small>en gång per säsong</small></button>
      </div>
      <button class="fy-kickoff" data-action="kickoff">${round === 0 ? 'Spela premiären' : 'Spela nästa omgång'} <span>→</span></button>
      <p class="fy-caption">Prognoser hjälper dig välja. Resultaten kan överraska.</p>
    </section><aside class="fy-sidebar"><section class="fy-market">${marketHtml()}</section><section class="fy-table"><span class="fy-eyebrow">MINILIGAN · 2011</span>${leagueHtml()}</section></aside>`;
    hud();
    if (restore) {
      const previous = [...app.querySelectorAll('button[data-action]')].find((button) =>
        button.dataset.action === restore.action && button.dataset.id === restore.id && button.dataset.slot === restore.slot && button.getClientRects().length);
      const fallback = [...app.querySelectorAll(`button[data-slot="${selected}"]`)].find((button) => button.getClientRects().length);
      const next = previous && !previous.disabled ? previous : fallback;
      next?.focus({ preventScroll: true });
    }
  }
  function startSeason() {
    seed = Math.floor(Math.random() * 1000000);
    round = 0;
    squad = DEFAULT_SQUAD.slice();
    baseline = null;
    captain = 'brook';
    selected = 4;
    total = 0;
    rivals = RIVALS.map((r) => ({ ...r, points: 0 }));
    tripleUsed = false;
    tripleActive = false;
    match = null;
    history = [];
    captainBonus = 0;
    managerView = 'team';
    arcade.hidePanel();
    renderManager();
  }
  function startMatch() {
    if (phase !== 'manage' || arcade.paused) return;
    match = scoreSquad(squad, captain, round, seed, tripleActive);
    expectedMatch = squadForecast(squad, captain, round, seed, tripleActive);
    rivals = rivals.map((rival) => planRival(rival, round, seed));
    if (tripleActive) tripleUsed = true;
    matchTime = 0;
    revealed = 0;
    phase = 'match';
    app.classList.add('is-match');
    app.innerHTML = `<section class="fy-broadcast"><div class="fy-live-label"><i></i> MATCHDAG ${round + 1}</div><div class="fy-matchclock">00′</div><h2>Nu avgörs det.</h2><p>Prognos ${expectedMatch.toFixed(1).replace('.', ',')} p · ${surname(playerById(captain).name)} är kapten.</p><div class="fy-season-track" aria-label="Säsongens fem omgångar">${Array.from({ length: ROUNDS }, (_, i) => `<span class="${i === round ? 'current' : i < round ? 'done' : ''}">${i < round ? history[i] : i + 1}<small>${i < round ? 'poäng' : 'omgång'}</small></span>`).join('')}</div></section>
      <aside class="fy-live-panel"><span class="fy-eyebrow">DINA SPELARES MATCHER</span><div class="fy-live-score">0 <small>poäng</small></div>
      <div class="fy-match-feed" aria-live="polite"></div><button class="fy-secondary" data-action="skip">Visa alla resultat →</button></aside>`;
    arcade.tone(640, 0.16, 'sine');
  }
  function rowSummary(row) {
    const bits = [];
    if (row.goals) bits.push(`${row.goals} mål`);
    if (row.assists) bits.push(`${row.assists} assist`);
    if (row.conceded === 0 && row.player.position !== 'ANF') bits.push('Hållen nolla');
    if (row.saves) bits.push(`${row.saves} räddningar`);
    if (row.conceded >= 2 && ['MV', 'BACK'].includes(row.player.position)) bits.push(`${row.conceded} insläppta`);
    if (!bits.length) bits.push('90 minuter spelade');
    return bits.join(' · ');
  }
  function revealRow() {
    if (revealed >= match.rows.length) return;
    const row = match.rows[revealed++];
    world.highlight(row, revealed - 1);
    const feed = app.querySelector('.fy-match-feed');
    feed.insertAdjacentHTML('beforeend', `<div class="fy-feed-row"><div><strong>${row.player.name}${row.multiplier > 1 ? ` <span>×${row.multiplier}</span>` : ''}</strong><small>${rowSummary(row)}</small></div><b>+${row.total}</b></div>`);
    app.querySelector('.fy-live-score').innerHTML = `${match.rows.slice(0, revealed).reduce((n, r) => n + r.total, 0)} <small>poäng</small>`;
    if (row.goals || row.total >= 8) {
      celebration = 1.8;
      arcade.tone(440 + revealed * 60, 0.18, 'sine');
      arcade.toast(row.goals ? `${surname(row.player.name)} gör mål!` : `${surname(row.player.name)} levererar!`);
    }
  }
  function finishMatch() {
    if (phase !== 'match') return;
    while (revealed < match.rows.length) revealRow();
    phase = 'review';
    total += match.points;
    history.push(match.points);
    rivals.forEach((r) => { r.points += scoreSquad(r.squad, r.captain, round, seed, r.triple).points; });
    captainBonus += match.rows.find((row) => row.player.id === captain).points * (tripleActive ? 2 : 1);
    arcade.saveBest(total);
    hud();
    const ranking = standings();
    const rank = ranking.find((r) => r.you).place;
    const sharedLead = rank === 1 && ranking.filter((r) => r.place === 1).length > 1;
    app.querySelector('.fy-matchclock').textContent = '90′';
    app.querySelector('.fy-broadcast h2').textContent = rank === 1 ? (sharedLead ? 'Delad ledning.' : 'Du leder ligan.') : `${rank}:a i miniligan.`;
    app.querySelector('.fy-broadcast p').textContent = `${total} poäng totalt · ${round === ROUNDS - 1 ? 'Säsongen är färdig.' : 'Nästa omgång väntar.'}`;
    const verdict = roundVerdict(match.points, expectedMatch);
    const review = document.createElement('div');
    review.className = `fy-round-verdict ${verdict.tone}`;
    review.innerHTML = `<strong>${verdict.title}</strong><span>${match.points} p mot prognos ${expectedMatch.toFixed(1).replace('.', ',')} p</span><p>${verdict.detail}</p>`;
    app.querySelector('.fy-live-panel').insertBefore(review, app.querySelector('.fy-live-panel .fy-secondary'));
    const action = app.querySelector('[data-action="skip"]');
    action.dataset.action = round === ROUNDS - 1 ? 'final' : 'next';
    action.className = 'fy-kickoff';
    action.textContent = round === ROUNDS - 1 ? 'Se säsongens resultat →' : 'Till nästa omgång →';
    const table = document.createElement('section');
    table.className = 'fy-match-table';
    table.innerHTML = leagueHtml();
    app.querySelector('.fy-broadcast').appendChild(table);
    action.focus({ preventScroll: true });
  }
  function seasonResult() {
    phase = 'over';
    app.hidden = true;
    const ranking = standings();
    const { place } = ranking.find((r) => r.you);
    const coWinners = ranking.filter((r) => r.place === 1 && !r.you).map((r) => r.name);
    const sharedWin = place === 1 && coWinners.length > 0;
    arcade.showPanel({
      eyebrow: 'FANTASYSÄSONGEN · 2011',
      title: place === 1 ? (sharedWin ? 'Delad seger!' : 'Pokalen är din!') : 'Nästa säsong blir din.',
      body: `<p>${place === 1 ? (sharedWin ? `Du delar förstaplatsen med ${coWinners.join(' och ')}.` : 'Du slog 2011 års rivaler i miniligan.') : `Du slutar på plats ${place} i miniligan.`}</p><div class="fy-final-points">${total}<small>fantasypoäng</small></div>${leagueHtml()}<p class="fy-final-rounds">Omgångarna: ${history.join(' · ')} p</p><p>Dina kaptensval gav <b>${captainBonus} extra poäng</b>. Bästa omgång: <b>${Math.max(...history)} p</b>.</p><p>Rekord på den här enheten: ${arcade.loadBest()} p</p>`,
      button: 'Bygg ett nytt mästarlag', onStart: startSeason
    });
  }
  arcade.listen(app, 'click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled || arcade.paused) return;
    const { action, id } = button.dataset;
    if (phase === 'manage') {
      if (action === 'view-team' || action === 'view-market') { managerView = action === 'view-team' ? 'team' : 'market'; renderManager(); app.scrollTop = 0; }
      if (action === 'slot') { selected = Number(button.dataset.slot); managerView = 'market'; renderManager(); app.scrollTop = 0; }
      if (action === 'captain') { captain = id; renderManager(); arcade.toast(`${surname(playerById(id).name)} bär bindeln.`); }
      if (action === 'buy' && canTransfer(squad, selected, id, baseline)) {
        const previous = playerById(squad[selected]);
        if (captain === squad[selected]) captain = id;
        squad[selected] = id;
        renderManager();
        arcade.tone(540, 0.07, 'sine');
        arcade.toast(`${surname(playerById(id).name)} in · ${surname(previous.name)} ut.`);
      }
      if (action === 'undo' && baseline) {
        ({ squad, captain } = undoTransfer(squad, captain, baseline));
        renderManager();
        arcade.toast('Spelarbytet är ångrat.');
      }
      if (action === 'chip' && !tripleUsed) {
        tripleActive = !tripleActive;
        renderManager();
        arcade.toast(tripleActive ? 'Trippelkapten vald. Kortet används vid avspark.' : 'Kaptenskortet sparas till senare.');
      }
      if (action === 'kickoff') startMatch();
    } else if (phase === 'match' && action === 'skip') finishMatch();
    else if (phase === 'review' && action === 'next') {
      round++;
      baseline = squad.slice();
      tripleActive = false;
      managerView = 'team';
      renderManager();
    } else if (phase === 'review' && action === 'final') seasonResult();
  });
  arcade.listen(window, 'keydown', (event) => {
    if (arcade.paused || phase !== 'manage' || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if (/^[1-5]$/.test(event.key)) { selected = Number(event.key) - 1; renderManager(); }
    if (event.code === 'KeyC') { captain = squad[selected]; renderManager(); }
  });
  arcade.onFrame((dt, time) => {
    celebration = Math.max(0, celebration - dt);
    world.update(dt, time, phase === 'match', celebration);
    const aspect = Math.max(0.4, camera.aspect);
    const scale = aspect < 0.8 ? 1.35 : 1;
    const live = phase === 'match' || phase === 'review';
    const desired = new arcade.THREE.Vector3(
      (live ? 14 : 29 + (arcade.reducedMotion ? 0 : Math.sin(time * 0.07) * 3)) * scale,
      (live ? 28 : 42) * scale,
      (live ? 32 : 44) * scale
    );
    camera.position.lerp(desired, 1 - Math.exp(-dt * 2));
    camera.lookAt(0, live ? 0 : 1, 0);
    if (phase === 'match') {
      matchTime += dt;
      const clock = app.querySelector('.fy-matchclock');
      if (clock) clock.textContent = `${Math.min(90, Math.floor(matchTime / 13.6 * 90)).toString().padStart(2, '0')}′`;
      if (revealed < match.rows.length && matchTime >= 1.6 + revealed * 2.35) revealRow();
      if (matchTime >= 13.6) finishMatch();
    }
  });
  camera.position.set(29, 42, 44);
  camera.lookAt(0, 1, 0);
  arcade.setHUD('FANTASY', '2011', 'Fem spelare. Fem omgångar. En pokal.');
  arcade.showPanel({
    eyebrow: '2011 · DÄR ALLT BÖRJADE',
    title: 'Pekkas Fantasy',
    body: '<p>Bygg ditt drömlag under strålkastarna.</p><p><b>1.</b> Välj fem spelare inom 36 miljoner.<br><b>2.</b> Läs matchsvårigheten och välj kapten för dubbla poäng.<br><b>3.</b> Spela fem omgångar. Gör ett byte mellan varje.</p><p>Spara ditt <b>3× kaptenskort</b> till rätt läge. Slå Rickard, Viktor och Mikael och ta pokalen.</p><p class="fy-disclaimer">En FPL-inspirerad arkadtolkning med fiktiva fotbollsspelare och simulerade matcher.</p>',
    button: 'Ta över laget', onStart: startSeason
  });
  return { destroy() { world.dispose(); arcade.destroy(); } };
}
