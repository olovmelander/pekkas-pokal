/**
 * The flipper's DOM layer.
 *
 * Two layouts from one tree. In landscape the machine stands in the middle of
 * the room and the HUD takes the space either side of it — progress on the
 * left, the topplista and the start card on the right — so nothing is ever
 * painted over the playfield. In portrait the panels dissolve
 * (`display: contents`) and their parts pin themselves to the edges of the
 * phone around the table instead. The score itself lives on the DMD in the
 * backbox, where a pinball player looks for it.
 */

import { fmtScore } from './dmd.js';
import { BOARD_SHOWN } from './scores.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function buildHud(root, { touch }) {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <div class="pbf-vignette"></div>
    <div class="pb-ui pbf-ui">
      <section class="pbf-left">
        <header class="pbf-brand"><small>Pekkas Pokal</small><strong>Flipper</strong><em>2025</em></header>
        <div class="pbf-status">
          <div class="pbf-balls" id="pbf-balls"></div>
          <div class="pbf-mult" id="pbf-mult"></div>
        </div>
        <div class="pbf-pokal" id="pbf-pokal" aria-label="P-O-K-A-L"></div>
        <div class="pbf-gren-wrap">
          <h4 class="pbf-h">Grenar</h4>
          <ol class="pbf-grenar" id="pbf-grenar"></ol>
        </div>
        <div class="pbf-mode" id="pbf-mode" hidden>
          <div class="pbf-mode-head"><b id="pbf-mode-name"></b><span id="pbf-mode-time"></span></div>
          <p id="pbf-mode-task"></p>
          <div class="pbf-mode-bar"><i id="pbf-mode-bar"></i></div>
        </div>
      </section>

      <div class="pbf-goal" id="pbf-goal"><i></i><span id="pbf-goal-text"></span></div>

      <section class="pbf-right">
        <div class="pbf-sheet" id="pbf-sheet"></div>
        <div class="pbf-board-card">
          <h4 class="pbf-h">Topplista <span>på den här enheten</span></h4>
          <ol class="pbf-board" id="pbf-board"></ol>
        </div>
        <dl class="pbf-keys">
          <div><dt>← →</dt><dd>Flippers (även Shift, A/D)</dd></div>
          <div><dt>Mellanslag</dt><dd>Håll &amp; släpp avfyraren</dd></div>
          <div><dt>N</dt><dd>Nudga bollen mot mitten — inte för ofta</dd></div>
          <div><dt>?</dt><dd>Strategikort</dd></div>
        </dl>
      </section>

      <div class="pbf-bottom">
        <div class="pbf-plunger" id="pbf-plunger" hidden>
          <div class="pbf-plunger-label">${
  touch ? 'Håll fingret på bordet · släpp i det turkosa' : 'Håll mellanslag · släpp i det turkosa'
}</div>
          <div class="pbf-power"><i class="pbf-skill"></i><span id="pbf-power-fill"></span></div>
        </div>
      </div>
      <button class="pbf-nudge" id="pbf-nudge" aria-label="Nudga bordet" hidden>Nudga</button>

      <div class="pbf-pops" id="pbf-pops" aria-hidden="true"></div>
      <div class="pbf-coach" id="pbf-coach" role="status" hidden><span id="pbf-coach-text"></span></div>
      <div class="pbf-zones" id="pbf-zones" aria-hidden="true">
        <div><span>Vänster flipper</span></div>
        <div><span>Höger flipper</span></div>
      </div>

      <button class="pbf-round pbf-info" id="pbf-info" aria-label="Strategikort">?</button>
      <button class="pbf-round pbf-mute" id="pbf-mute" aria-label="Ljud på/av">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pbf-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
        </svg>
      </button>

      <div class="pbf-help" id="pbf-help" hidden>
        <div class="pbf-help-card" role="dialog" aria-label="Strategikort">
          <h3>Strategikort</h3>
          <p class="pbf-help-sub">Pekkas Pokal Flipper</p>
          <ul class="pbf-help-list">
            <li><i style="--c:#f2c14e"></i><b>Ramper</b> Kungsvägen (vänster mynning) och Vallgraven (hårt skott i höger orbit) — kedjar kombos och räknas som varv.</li>
            <li><i style="--c:#7c8cf8"></i><b>Vänster orbit</b> Snurran ger poäng per varv. Lyser pilen: skjut hit, så väntar bollen i borgen medan du väljer gren med flipprarna.</li>
            <li><i style="--c:#f26d8d"></i><b>P-O-K-A-L</b> Fäll alla fem målen så tänds grenstart i vänster orbit.</li>
            <li><i style="--c:#8b93ad"></i><b>Borgen</b> Tre smällar spräcker porten och fäller vindbryggan. Skjut pokalen medan den ligger nere: BORGEN STORMAD (10 000 och mer för varje gång). Två stormningar tänder EXTRA BOLL på Kungsvägen.</li>
            <li><i style="--c:#7c8cf8"></i><b>Multiball</b> Bumprarna laddar låset — lås två bollar i borgen. Varje jackpot är värd 10 000 mer än den förra, två jackpottar tänder SUPER JACKPOT (100 000), och den första tänder ADD-A-BALL på Vallgraven.</li>
            <li><i style="--c:#6f9b5a"></i><b>Trollen</b> Vaktar borgen under grenar och multiball. Slå ner dem — 3 000 styck.</li>
            <li><i style="--c:#3ddc7b"></i><b>Ny boll &amp; kickback</b> Lampan vid avloppet lyser de första sekunderna: dräneras bollen då serveras den om, en gång per boll. Vänster utbana har kickback — tänds om via båda inbanorna.</li>
            <li><i style="--c:#ffb347"></i><b>Lamporna över flipprarna</b> Översta raden är grenarna — fast sken när en är klar, blink när den pågår. Under den: bonus ×, som tänds via båda inbanorna.</li>
            <li><i style="--c:#ffd166"></i><b>Grenar &amp; Finalen</b> Varje gren har eget mål, egen klocka och lyser sina skott i grenens färg. Varje steg ger mer än det förra, och tid kvar på klockan blir tidsbonus. Klara alla fem → Finalen: 60 sekunder multiball där allt räknas ×5.</li>
          </ul>
          <p class="pbf-help-tip">Skill shot: det turkosa fältet flyttar sig för varje boll — lågt 5 000, mitten 7 500, högt 10 000. Skjut sedan vänster orbit inom tre sekunder för SUPER (15 000).</p>
          <div class="pbf-help-keys">Flippers: skärmhalvorna, ←/→ eller Shift · Avfyrare: håll &amp; släpp / mellanslag · Nudge: N (knuffar den lägsta bollen mot mitten) · Fyra nudgar för snabbt ger TILT · Esc stänger kortet</div>
          <button class="pbf-btn" id="pbf-help-close">Tillbaka till spelet</button>
        </div>
      </div>
    </div>`
  );
  const $ = (id) => root.querySelector(`#${id}`);
  return {
    balls: $('pbf-balls'),
    mult: $('pbf-mult'),
    pokal: $('pbf-pokal'),
    grenar: $('pbf-grenar'),
    mode: $('pbf-mode'),
    modeName: $('pbf-mode-name'),
    modeTask: $('pbf-mode-task'),
    modeTime: $('pbf-mode-time'),
    modeBar: $('pbf-mode-bar'),
    goal: $('pbf-goal'),
    goalText: $('pbf-goal-text'),
    sheet: $('pbf-sheet'),
    board: $('pbf-board'),
    plunger: $('pbf-plunger'),
    powerFill: $('pbf-power-fill'),
    skill: root.querySelector('.pbf-skill'),
    nudge: $('pbf-nudge'),
    zones: $('pbf-zones'),
    pops: $('pbf-pops'),
    coach: $('pbf-coach'),
    coachText: $('pbf-coach-text'),
    mute: $('pbf-mute'),
    info: $('pbf-info'),
    help: $('pbf-help'),
    helpClose: $('pbf-help-close')
  };
}

/**
 * The topplista rows; `hi` is the entry to highlight (the one just set).
 * `live` is the score of a game in progress: it climbs the list as a ghost
 * row, so there is always a name just above you to chase.
 */
export function boardHtml(board, hi = null, live = null) {
  if (!board.length && live === null) {
    return '<li class="pbf-board-empty">Inga rekord än — bli först på maskinen.</li>';
  }
  const rows = board.map((e) => ({ ...e, src: e }));
  if (live !== null) {
    const at = rows.findIndex((e) => live > e.s);
    rows.splice(at < 0 ? rows.length : at, 0, { n: 'Du', s: live, live: true });
  }
  const liveAt = rows.findIndex((e) => e.live);
  const shown = rows.slice(0, BOARD_SHOWN);
  // A ghost below the visible five still shows, as a sixth row
  if (liveAt >= BOARD_SHOWN) shown.push(rows[liveAt]);
  return shown
    .map((e) => {
      const cls = e.live ? 'live' : e.src === hi ? 'hi' : '';
      const rank = rows.indexOf(e) + 1;
      return `<li class="${cls}"><b>${rank}</b><span>${esc(e.n)}</span><em>${fmtScore(e.s)}</em></li>`;
    })
    .join('');
}

export function startSheet({ touch, board }) {
  const how = touch
    ? 'Vänster och höger skärmhalva styr varsin flipper'
    : 'Mellanslag startar · ← → flippar · N nudgar';
  return `
    <h2 class="pbf-port-only">Pekkas Pokal <span>Flipper</span></h2>
    <h2 class="pbf-land-only">Lägg i en krona</h2>
    <ol class="pbf-steps">
      <li><b>1</b><span>${touch ? 'Håll fingret och släpp' : 'Håll och släpp mellanslag'} — skjut ut bollen</span></li>
      <li><b>2</b><span>Fäll P-O-K-A-L, starta en gren i vänster orbit</span></li>
      <li><b>3</b><span>Bumprarna tänder låset — två bollar i borgen ger multiball</span></li>
    </ol>
    <button class="pbf-btn" data-act="start">Starta spelet</button>
    <p class="pbf-sheet-hint">${how}</p>
    <p class="pbf-sheet-hint pbf-rotate-hint">Tips: vänd telefonen till stående — då blir bordet större.</p>
    <ol class="pbf-board pbf-sheet-board">${boardHtml(board)}</ol>`;
}

export function nameSheet({ score, rank, names, remembered }) {
  const ordered = remembered && names.includes(remembered)
    ? [remembered, ...names.filter((n) => n !== remembered)]
    : names;
  const chips = [...ordered, 'Gäst']
    .map((n) => `<button class="pbf-name${n === remembered ? ' last' : ''}" data-name="${esc(n)}">${esc(n)}</button>`)
    .join('');
  return `
    <h2>${rank === 1 ? 'Nytt rekord!' : `Plats ${rank} på topplistan`}</h2>
    <div class="pbf-final">${fmtScore(score)}</div>
    <p>Vem spelade? Ett tryck sparar.</p>
    <div class="pbf-names">${chips}</div>
    <form class="pbf-own" data-act="own">
      <input type="text" maxlength="12" autocomplete="off" placeholder="…eller skriv ett namn" aria-label="Namn" />
      <button type="submit">Spara</button>
    </form>`;
}

export function overSheet({ score, rank, onBoard, need, board, hi }) {
  const title = onBoard && rank === 1 ? 'Nytt rekord!' : 'Spelet slut';
  const line = onBoard
    ? `Plats ${rank} på topplistan`
    : need
      ? `${fmtScore(need - score + 1)} poäng från topplistan`
      : 'Bollarna är slut — en gång till?';
  return `
    <h2>${title}</h2>
    <div class="pbf-final">${fmtScore(score)}</div>
    <p class="pbf-final-sub">${line}</p>
    <button class="pbf-btn" data-act="start">Spela igen</button>
    <ol class="pbf-board pbf-sheet-board">${boardHtml(board, hi)}</ol>`;
}
