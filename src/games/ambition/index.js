import { createArcade } from '../shared/arcade.js';
import { hasCommandModifier } from '../shared/keyboard.js';
import { buildRoom } from './room.js';
import { SYMBOLS, SUIT_NAMES, rankLabel, cardName, makeDeck, shuffle, sortHand, cardPoints,
  legalCards, winningPlay, scoreDeal, chooseCard, passingCards, passHands, positionAdvice, previewCard } from './rules.js';

export const layout = 'full';
const NAMES = ['Du', 'Niklas', 'Erik', 'Mikael'];
const FULL_NAMES = ['Du', 'Niklas Norberg', 'Erik Vallgren', 'Mikael Hägglund'];
const ROUNDS = 3;

export default async function createAmbition(container) {
  const app = createArcade(container, {
    id: 'ambition', title: 'Pekkas Ambition', subtitle: 'Kungsholmen · 2018',
    accent: '#d7b772', sky: '#172b35', fog: false, lighting: 'interior'
  });
  app.root.classList.add('ambition-game');
  app.camera.position.set(0, 5.8, 8.2);
  app.camera.lookAt(0, 1.2, -0.8);
  app.sun.position.set(-3.5, 6.5, 3.2);
  app.sun.color.set('#ffddb0');
  app.sun.intensity = 1.35;
  app.ambient.intensity = .34;
  app.setShadowFocus(0, 1, -1);
  Object.assign(app.sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
  app.sun.shadow.camera.updateProjectionMatrix();
  const room = buildRoom(app.scene, { reducedMotion: app.reducedMotion });
  const shell = document.createElement('div');
  shell.className = 'amb-shell';
  shell.hidden = true;
  app.ui.appendChild(shell);
  const state = {
    phase: 'intro', round: 1, trickNumber: 0, hands: [], selected: new Set(),
    scores: [0, 0, 0, 0], captured: [0, 0, 0, 0], tricks: [0, 0, 0, 0],
    plays: [], turn: 0, leader: 0, ledSuit: 'diamonds', wait: 0,
    winning: -1, help: false, gains: [], best: app.loadBest() || 0,
    pending: null, history: []
  };
  const cardMarkup = (card, { button = false, disabled = false, selected = false, small = false } = {}) => {
    const red = ['diamonds', 'hearts'].includes(card.suit);
    const tag = button ? 'button' : 'div';
    return `<${tag} class="amb-card${red ? ' red' : ''}${selected ? ' selected' : ''}${small ? ' small' : ''}" ${button ? `type="button" data-card="${card.id}" aria-label="${cardName(card)}, ${cardPoints(card)} poäng${selected ? (state.phase === 'pass' ? ', valt för byte' : ', förhandsvisat') : ''}" ${disabled ? 'disabled' : ''} aria-pressed="${selected}"` : `aria-label="${cardName(card)}"`}>
      <span class="amb-corner">${rankLabel(card.rank)}<i>${SYMBOLS[card.suit]}</i></span>
      <span class="amb-pip" aria-hidden="true">${SYMBOLS[card.suit]}</span>
      <span class="amb-corner bottom" aria-hidden="true">${rankLabel(card.rank)}<i>${SYMBOLS[card.suit]}</i></span>
      ${cardPoints(card) ? `<span class="amb-card-value">${cardPoints(card)} p</span>` : ''}
    </${tag}>`;
  };

  function statusText() {
    if (state.phase === 'pass') return `Välj tre kort att skicka ${['åt vänster', 'åt höger', 'tvärs över'][state.round - 1]}.`;
    if (state.phase === 'kickoff') return 'Första sticket är blint. Välj ruter om du har.';
    if (state.phase === 'collect') {
      const p = state.plays.reduce((sum, play) => sum + cardPoints(play.card), state.trickNumber === 0 ? 3 : 0);
      return `${NAMES[state.winning]} tar sticket · ${p} givpoäng`;
    }
    if (state.phase === 'round' || state.phase === 'end') return state.phase === 'end' ? 'Kvällen är avgjord' : 'Givens poäng räknas';
    if (state.turn === 0) return state.plays.length ? `Din tur · följ ${SUIT_NAMES[state.ledSuit]} om du kan` : 'Du spelar ut · välj valfri färg';
    return `${NAMES[state.turn]} funderar…`;
  }

  function tableMarkup() {
    if (state.phase === 'round' || state.phase === 'end') {
      const max = Math.max(...state.scores);
      const won = state.scores[0] === max;
      const tied = state.scores.filter((score) => score === max).length > 1;
      return `<section class="amb-summary">
        <span class="amb-eyebrow">${state.phase === 'end' ? 'TRE GIVAR · EN POKAL' : `GIV ${state.round} AV ${ROUNDS}`}</span>
        <h2>${state.phase === 'end' ? (won ? (tied ? 'Delad seger!' : 'Pokalen är din!') : `${NAMES[state.scores.indexOf(max)]} vinner kvällen`) : (state.gains[0] ? `Du får ${state.gains[0]} poäng` : 'Lite för mycket ambition?')}</h2>
        <div class="amb-results">${NAMES.map((name, i) => `<div class="${i === 0 ? 'you' : ''}"><span>${name}</span><span>${state.captured[i]} tagna</span><strong>+${state.gains[i]}</strong><b>${state.scores[i]} totalt</b></div>`).join('')}</div>
        <div class="amb-journey" aria-label="Dina givar">${state.history.map((points, i) => `<span><small>GIV ${i + 1}</small><b>+${points}</b></span>`).join('')}</div>
        <p>${state.phase === 'end' ? `Ditt rekord: ${state.best} poäng. Spela igen med en ny hand.` : resultReason(0)}</p>
        <button type="button" class="amb-primary" data-action="${state.phase === 'end' ? 'restart' : 'next'}">${state.phase === 'end' ? 'En kväll till' : 'Nästa giv'} <span aria-hidden="true">→</span></button>
      </section>`;
    }
    if (state.phase === 'pass') {
      return `<div class="amb-pass-note"><span class="amb-emblem" aria-hidden="true">♠</span><h2>Lagom är en konst.</h2><p>Samla poäng — men låt någon annan ta flest.<br>Klöverkungen är värd hela <b>13 poäng</b>.</p><div class="amb-pass-counter">${state.selected.size} <span>/ 3 valda kort</span></div></div>`;
    }
    const pot = state.plays.reduce((sum, play) => sum + cardPoints(play.card), state.trickNumber === 0 ? 3 : 0);
    return `<div class="amb-table-play"><div class="amb-pot"><span>${state.phase === 'kickoff' ? 'DOLT RUTERSTICK' : state.ledSuit ? `${SYMBOLS[state.ledSuit]} ${SUIT_NAMES[state.ledSuit].toUpperCase()} SPELAS` : 'VÄLJ FÄRG'}</span><strong>${state.phase === 'kickoff' ? '? + 3' : pot} <small>poäng i sticket</small></strong></div><div class="amb-trick" aria-label="Bordets kort">${NAMES.map((name, player) => {
      const play = state.plays.find((item) => item.player === player);
      const blind = state.phase === 'kickoff' && player !== 0;
      return `<div class="amb-trick-seat${state.phase === 'collect' && state.winning === player ? ' winner' : ''}"><span>${name}</span>${blind ? '<div class="amb-card amb-back" aria-label="Dolt kort"><span>PP</span></div>' : play ? cardMarkup(play.card) : '<div class="amb-card-slot" aria-hidden="true">♧</div>'}</div>`;
    }).join('')}</div>${state.phase === 'collect' ? `<button class="amb-collect" data-action="collect" type="button">${NAMES[state.winning]} tar sticket · fortsätt →</button>` : ''}</div>`;
  }

  function resultReason(player) {
    if (state.captured.some((points) => points >= 51)) return 'Slam! Den som tog minst 51 givpoäng får 40 matchpoäng. Alla andra får 0.';
    if (state.tricks[player] === 0) return 'Noll stick! En ensam nolla ger 20 matchpoäng; två nollor ger 10 var.';
    if (state.captured[player] === Math.max(...state.captured)) return 'Flest givpoäng ger 0 matchpoäng. Försök lämna ett dyrt stick till en rival nästa gång.';
    if (state.captured[player] < 10) return 'Under 10 givpoäng ger 0 matchpoäng. Våga vinna några värdefulla stick nästa gång.';
    return 'Minst 10 givpoäng, men inte flest. Alla dina tagna poäng blir matchpoäng!';
  }

  function render() {
    const focused = document.activeElement;
    const focusId = focused?.dataset?.card;
    const focusAction = shell.contains(focused) ? focused?.dataset?.action : null;
    const hadHandFocus = !!focusId;
    const hadFocus = shell.contains(focused);
    const active = ['play', 'kickoff', 'pass'].includes(state.phase);
    const legal = active ? new Set(legalCards(state.hands[0], state.phase === 'pass' ? null : state.ledSuit).map((card) => card.id)) : new Set();
    const yourTurn = state.phase === 'kickoff' || state.phase === 'play' && state.turn === 0;
    const advice = positionAdvice(state.captured, state.tricks);
    const candidate = state.hands[0]?.find((card) => card.id === state.pending);
    const preview = candidate && yourTurn ? previewCard(candidate, state.plays, state.ledSuit, state.captured, state.tricks, state.phase === 'kickoff') : null;
    const shownAdvice = preview?.known && preview.winning ? preview.advice : advice;
    const decision = preview ? `${state.phase === 'kickoff' ? 'Kortet spelas dolt.' : preview.winning ? (preview.known ? `Du tar sticket: ${preview.pot} poäng.` : `Leder just nu: ${preview.pot} synliga poäng.`) : 'Det här kortet ligger under just nu.'} ${preview.winning && !preview.known ? 'Fler kort kan ändra utfallet.' : ''}` : yourTurn ? 'Välj ett kort för att förhandsvisa. Bekräfta sedan ditt drag.' : advice.detail;
    app.setHUD('MATCHPOÄNG', state.scores[0], `Giv ${state.round}/${ROUNDS} · Stick ${Math.min(13, state.trickNumber + 1)}/13`);
    shell.classList.toggle('amb-your-turn', yourTurn);
    shell.classList.toggle('amb-result', state.phase === 'round' || state.phase === 'end');
    shell.innerHTML = `<div class="amb-scoreboard">${NAMES.map((name, player) => `<div class="amb-player${player === 0 ? ' you' : ''}${state.phase === 'play' && state.turn === player ? ' thinking' : ''}" title="${FULL_NAMES[player]}"><span>${name}</span><strong>${state.captured[player]} <small>givpoäng</small></strong><i>${state.tricks[player]} stick · ${state.scores[player]} totalt</i></div>`).join('')}</div>
      <div class="amb-center">${tableMarkup()}</div>
      <div class="amb-bottom">
        <div class="amb-status"><span role="status" aria-live="polite" tabindex="-1">${statusText()}</span><button type="button" class="amb-help-button" data-action="help" aria-expanded="${state.help}">Regler</button></div>
        ${state.phase === 'round' || state.phase === 'end' ? '' : `<div class="amb-hand" aria-label="Din hand">${state.hands[0].map((card) => cardMarkup(card, { button: true, small: true, selected: state.selected.has(card.id) || state.pending === card.id, disabled: state.phase === 'pass' ? false : !legal.has(card.id) || !yourTurn })).join('')}</div>`}
        ${state.phase === 'pass' ? `<div class="amb-pass-actions"><button type="button" class="amb-secondary" data-action="suggest">Föreslå byte</button><button type="button" class="amb-primary" data-action="pass" ${state.selected.size !== 3 ? 'disabled' : ''}>Byt ${state.selected.size}/3 kort →</button></div>` : ''}
        ${['play', 'kickoff', 'collect'].includes(state.phase) ? `<div class="amb-decision"><div class="amb-position ${shownAdvice.tone}"><strong>${shownAdvice.title}</strong><span>${decision}</span></div>${yourTurn ? `<button class="amb-primary amb-play-card" data-action="play" type="button" ${candidate ? '' : 'disabled'}>${candidate ? `Spela ${SYMBOLS[candidate.suit]} ${rankLabel(candidate.rank)}` : 'Välj kort'} →</button>` : ''}</div>` : ''}
        <div class="amb-footnote">${state.phase === 'pass' ? 'Kortens lilla siffra visar poängvärdet. Klicka eller tryck för att välja.' : 'Tvåan slår E, K, D och Kn i samma färg. Ingen trumf.'}</div>
      </div>
      <section class="amb-rulebook" ${state.help ? '' : 'hidden'} role="dialog" aria-modal="true" aria-label="Så spelar du Ambition">
        <button type="button" class="amb-rule-close" data-action="help" aria-label="Stäng regler">×</button><span class="amb-eyebrow">PEKKAS KORTSALONG</span><h2>Ha lagom ambition.</h2>
        <p>En kort arkadmatch på <b>tre givar</b>, inspirerad av Mike Churchs Ambition. 2018 års husregler är inte dokumenterade.</p>
        <ol><li>Byt tre kort. Första sticket spelas dolt i <b>ruter</b> och ger 3 bonuspoäng.</li><li>Följ färg om du kan. Högsta kortet vinner. <b>Tvåan vinner</b> om E, K, D eller Kn i samma färg ligger på bordet.</li><li>Poängkort: hjärter/ruter 7–10 = 1, Kn–E = 3. Spader 7–10 = 3, Kn–E = 5. Klöverkung = 13. Övriga = 0.</li><li>Ta minst 10 poäng, men <b>inte flest</b>: du får dina tagna poäng. Flest (även delat) eller under 10 ger 0.</li><li><b>Slam:</b> minst 51 tagna ger 40 poäng, övriga 0. <b>Noll stick:</b> 20 poäng om du är ensam, annars 10 var.</li></ol>
        <p>Alla givpoäng är synliga. Välj ett kort för att granska det, och tryck sedan Spela. Använd mus, touch eller piltangenter i handen och Enter. Prognosen visar bara öppna kort. Spelet väntar medan du läser.</p>
        <button type="button" class="amb-primary" data-action="help">Jag är med</button>
      </section>`;
    for (const child of shell.children) child.inert = state.help && !child.classList.contains('amb-rulebook');
    if (focusId) {
      const next = shell.querySelector(`[data-card="${focusId}"]:not(:disabled)`) || (hadHandFocus && yourTurn ? shell.querySelector('.amb-hand button:not(:disabled)') : null);
      next?.focus({ preventScroll: true });
    } else if (focusAction) shell.querySelector(`[data-action="${focusAction}"]:not(:disabled)`)?.focus({ preventScroll: true });
    if (hadFocus && document.activeElement === document.body) {
      const fallback = yourTurn ? shell.querySelector('.amb-hand button:not(:disabled)') : shell.querySelector('.amb-status [role="status"]');
      fallback?.focus({ preventScroll: true });
    }
  }

  function deal() {
    const cards = shuffle(makeDeck());
    state.hands = Array.from({ length: 4 }, (_, player) => sortHand(cards.slice(player * 13, player * 13 + 13)));
    Object.assign(state, { phase: 'pass', trickNumber: 0, captured: [0, 0, 0, 0], tricks: [0, 0, 0, 0], plays: [], turn: 0, leader: 0, ledSuit: 'diamonds', wait: 0, winning: -1, help: false, pending: null });
    state.selected.clear();
    render();
  }

  function start() {
    state.round = 1;
    state.scores = [0, 0, 0, 0];
    state.history = [];
    shell.hidden = false;
    app.hidePanel();
    deal();
  }

  function pass() {
    if (state.selected.size !== 3) return;
    const selections = state.hands.map((hand, player) => player === 0 ? hand.filter((card) => state.selected.has(card.id)) : passingCards(hand));
    state.hands = passHands(state.hands, selections, [1, 3, 2][state.round - 1]);
    state.selected.clear();
    state.phase = 'kickoff';
    // Rivals commit before the human reveals a card. They cannot react to it.
    state.plays = [1, 2, 3].map((player) => {
      const card = chooseCard(state.hands[player], [], 'diamonds', state.captured, state.tricks, player, true);
      state.hands[player] = state.hands[player].filter((c) => c.id !== card.id);
      return { card, player };
    });
    app.tone(350, 0.08, 'triangle');
    render();
  }

  function play(card, player) {
    if (!legalCards(state.hands[player], state.ledSuit).some((c) => c.id === card.id)) return;
    state.hands[player] = state.hands[player].filter((c) => c.id !== card.id);
    state.pending = null;
    if (state.phase === 'kickoff') {
      state.plays.unshift({ player, card });
    } else {
      if (!state.plays.length) state.ledSuit = card.suit;
      state.plays.push({ player, card });
    }
    app.tone(210 + player * 40, 0.045, 'triangle');
    if (state.plays.length === 4) {
      const winner = winningPlay(state.plays, state.ledSuit);
      state.winning = winner.player;
      const points = state.plays.reduce((sum, item) => sum + cardPoints(item.card), state.trickNumber === 0 ? 3 : 0);
      state.captured[winner.player] += points;
      state.tricks[winner.player]++;
      state.phase = 'collect';
      state.wait = 2.8;
      room.react(winner.player, points);
      if (winner.card.rank === 2 && state.plays.some((item) => item.card.suit === state.ledSuit && item.card.rank >= 11)) app.toast('Tvåan tar tronen!');
      if (winner.player === 0) app.tone(520, 0.13, 'sine');
    } else {
      state.turn = (player + 1) % 4;
      state.wait = 0.65;
    }
    render();
  }

  function collect() {
    state.trickNumber++;
    if (state.trickNumber === 13) {
      state.gains = scoreDeal(state.captured, state.tricks);
      state.history.push(state.gains[0]);
      state.scores = state.scores.map((score, i) => score + state.gains[i]);
      state.phase = state.round === ROUNDS ? 'end' : 'round';
      if (state.phase === 'end') {
        state.best = Math.max(state.best, state.scores[0]);
        app.saveBest(state.scores[0]);
        app.tone(660, 0.35, 'sine');
      }
    } else {
      state.phase = 'play';
      state.turn = state.winning;
      state.leader = state.winning;
      state.plays = [];
      state.ledSuit = null;
      state.wait = 0.7;
    }
    render();
    if (state.phase === 'round' || state.phase === 'end') shell.querySelector('.amb-summary button')?.focus({ preventScroll: true });
  }

  app.listen(shell, 'click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled || app.paused) return;
    const { action } = button.dataset;
    if (action === 'help') {
      state.help = !state.help;
      render();
      shell.querySelector(state.help ? '.amb-rule-close' : '.amb-help-button')?.focus({ preventScroll: true });
      return;
    }
    if (state.help) return;
    if (action === 'collect' && state.phase === 'collect') return collect();
    if (action === 'play' && (state.phase === 'kickoff' || state.phase === 'play' && state.turn === 0)) {
      const candidate = state.hands[0].find((card) => card.id === state.pending);
      if (candidate) play(candidate, 0);
      return;
    }
    if (action === 'restart') return start();
    if (action === 'next' && state.phase === 'round') {
      state.round++;
      return deal();
    }
    if (state.phase === 'pass') {
      if (action === 'pass') return pass();
      if (action === 'suggest') state.selected = new Set(passingCards(state.hands[0]).map((card) => card.id));
      if (button.dataset.card) {
        const id = button.dataset.card;
        if (state.selected.has(id)) state.selected.delete(id);
        else if (state.selected.size < 3) state.selected.add(id);
        else app.toast('Tre kort är redan valda. Avmarkera ett först.');
      }
      render();
      return;
    }
    if (button.dataset.card && (state.phase === 'kickoff' || state.phase === 'play' && state.turn === 0)) {
      const card = state.hands[0].find((c) => c.id === button.dataset.card);
      if (card) { state.pending = card.id; render(); app.tone(290, 0.035, 'triangle'); }
    }
  });

  app.listen(shell, 'keydown', (event) => {
    if (hasCommandModifier(event)) return;
    if (app.paused) return;
    if (state.help) {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); state.help = false; render();
        shell.querySelector('.amb-help-button')?.focus({ preventScroll: true });
      } else if (event.key === 'Tab') {
        // The local rulebook owns focus; the arcade shell must not cycle it again.
        event.preventDefault(); event.stopPropagation();
        const buttons = [...shell.querySelectorAll('.amb-rulebook button')];
        const index = buttons.indexOf(document.activeElement);
        const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
      }
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...shell.querySelectorAll('.amb-hand button:not(:disabled)')];
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
  });

  function frameRoom() {
    const portrait = app.camera.aspect < 0.85;
    app.camera.position.set(0, portrait ? 8.2 : 5.8, portrait ? 9.7 : 8.2);
    app.camera.lookAt(0, portrait ? 1.5 : 1.2, portrait ? -0.5 : -0.8);
    app.camera.fov = portrait ? 49 : 45;
    app.camera.updateProjectionMatrix();
  }
  app.listen(app.root, 'arcaderesize', frameRoom);
  frameRoom();
  app.onFrame((dt, t) => {
    room.update(dt, t);
    if (state.help || state.phase === 'intro') return;
    state.wait = Math.max(0, state.wait - dt);
    if (state.wait > 0) return;
    if (state.phase === 'collect') collect();
    else if (state.phase === 'play' && state.turn !== 0) {
      const card = chooseCard(state.hands[state.turn], state.plays, state.ledSuit, state.captured, state.tricks, state.turn);
      play(card, state.turn);
    }
  });
  app.showPanel({
    eyebrow: 'KUNGSHOLMEN · 2018 · KORTSALONGEN', title: 'Pekkas Ambition',
    body: 'Våga vinna — men vinn inte för mycket. Byt tre kort, läs rivalerna och samla lagom många poäng. Tre givar mot Niklas, Erik och Mikael. En kort arkadtolkning av Mike Churchs Ambition; årets husregler är okända.',
    button: 'Slå dig ner vid bordet', onStart: start
  });
  return { destroy() { room.dispose(); app.destroy(); } };
}
