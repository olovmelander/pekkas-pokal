/**
 * Pekkas Fäktning — the HUD and the screens around the duel.
 *
 * Everything here is DOM over the canvas, styled by ./style.css under the
 * `.fen` root. The shared pb-* classes are only used for the controls
 * every game has in the same place (help card, ?- and mute buttons), so
 * the site stays consistent; the rest is this game's own.
 */

/* The 2023 tournament: who stood where (competition-data.csv) */
export const FIELD = [
  { name: 'Per Vikman', place: 1 },
  { name: 'Rickard Nilsson', place: 2 },
  { name: 'Mikael Hägglund', place: 3 },
  { name: 'Tobias Lundqvist', place: 4 },
  { name: 'Olov Melander', place: 7 },
  { name: 'Niklas Norberg', place: 8 },
  { name: 'Per Olsson', place: 9 },
  { name: 'Viktor Jones', place: 10 }
];
/** You can fence as anyone who was there and did not make the podium */
export const PICKABLE = FIELD.filter((f) => f.place > 3).map((f) => f.name);

export const MEDALS = ['', 'guld', 'silver', 'brons'];
const MEDAL_LABEL = { 1: 'Guld', 2: 'Silver', 3: 'Brons' };
export const ROUNDS = ['Kvartsfinal', 'Semifinal', 'Final'];

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const short = (name) => {
  const [first, ...rest] = name.split(' ');
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};
export const fmt = (n) => Math.round(n).toLocaleString('sv-SE');

const KEY = (k) => `<kbd>${k}</kbd>`;

class Hud {
  constructor(root, el) {
    this.root = root;
    this.el = el;
    this.timers = new Set();
  }

  later(fn, ms) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  /** Re-trigger a CSS animation class on an element. */
  pulse(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  setMode(mode) {
    // title | bracket | duel | replay | result | final
    this.root.dataset.mode = mode;
  }

  setScore(n, bump = false) {
    this.el.score.textContent = fmt(n);
    if (bump) this.pulse(this.el.score, 'bump');
  }

  setBest(n) {
    this.el.best.textContent = fmt(n);
  }

  setBoard({ round, me, foe, mine, theirs, to }) {
    const { el } = this;
    el.round.textContent = round;
    el.meName.textContent = short(me);
    el.foeName.textContent = short(foe);
    const pips = (n, cls) => Array.from({ length: to }, (_, i) => `<i class="${i < n ? cls : ''}"></i>`).join('');
    el.mePips.innerHTML = pips(mine, 'on');
    el.foePips.innerHTML = pips(theirs, 'on');
    if (el.meN.textContent !== String(mine)) this.pulse(el.meN, 'bump');
    if (el.foeN.textContent !== String(theirs)) this.pulse(el.foeN, 'bump');
    el.meN.textContent = mine;
    el.foeN.textContent = theirs;
    el.board.classList.toggle('matchpoint', mine === to - 1 || theirs === to - 1);
  }

  /** Big referee call in the middle of the screen. */
  call(text, tone = '') {
    const { call } = this.el;
    call.textContent = text;
    call.className = `fen-call ${tone}`;
    this.pulse(call, 'show');
  }

  sub(text, tone = '') {
    const { sub } = this.el;
    sub.textContent = text;
    sub.className = `fen-sub ${tone}`;
    this.pulse(sub, 'show');
  }

  combo(text) {
    const { combo } = this.el;
    combo.textContent = text;
    this.pulse(combo, 'show');
  }

  flash(color) {
    const { flash } = this.el;
    flash.style.setProperty('--c', color);
    this.pulse(flash, 'show');
  }

  pop(text, x, y, cls = '') {
    const p = document.createElement('div');
    p.className = `fen-pop ${cls}`;
    p.textContent = text;
    p.style.left = `${x * 100}%`;
    p.style.top = `${y * 100}%`;
    this.el.pops.appendChild(p);
    this.later(() => p.remove(), 1300);
  }

  coach(html) {
    const { coach } = this.el;
    if (!html) {
      coach.hidden = true;
      return;
    }
    coach.innerHTML = html;
    coach.hidden = false;
    this.pulse(coach, 'show');
  }

  setLine(line) {
    this.el.lineBtns.forEach((b, i) => b.classList.toggle('on', i === line));
  }

  /** Mark the line an attack is coming in; covered = your guard is already there. */
  setThreat(line, covered) {
    this.el.lineBtns.forEach((b, i) => {
      b.classList.toggle('threat', i === line && !covered);
      b.classList.toggle('covered', i === line && covered);
    });
  }

  press(btn) {
    this.pulse(btn, 'hit');
  }

  bars(on) {
    this.el.bars.classList.toggle('on', on);
  }

  showReplay(on) {
    this.el.replay.hidden = !on;
  }

  screen(html) {
    const { screen, panel } = this.el;
    if (!html) {
      screen.classList.remove('show');
      return;
    }
    panel.innerHTML = html;
    screen.classList.add('show');
    panel.scrollTop = 0;
  }

  dispose() {
    this.timers.forEach((id) => clearTimeout(id));
    this.timers.clear();
  }
}

export function buildHud(root) {
  root.innerHTML = `
    <div class="fen-vignette"></div>
    <div class="fen-flash" id="fen-flash"></div>
    <div class="fen-bars" id="fen-bars"><i></i><i></i></div>

    <div class="fen-top">
      <div class="fen-score-wrap">
        <div class="fen-score" id="fen-score">0</div>
        <div class="fen-best">REKORD <span id="fen-best">0</span></div>
      </div>
    </div>

    <div class="fen-board" id="fen-board">
      <div class="fen-round" id="fen-round">KVARTSFINAL</div>
      <div class="fen-board-row">
        <div class="fen-side me">
          <span class="fen-name" id="fen-me-name">Du</span>
          <span class="fen-pips" id="fen-me-pips"></span>
        </div>
        <div class="fen-digits"><b id="fen-me-n">0</b><i>:</i><b id="fen-foe-n">0</b></div>
        <div class="fen-side foe">
          <span class="fen-name" id="fen-foe-name">Mikael</span>
          <span class="fen-pips" id="fen-foe-pips"></span>
        </div>
      </div>
    </div>

    <div class="fen-call" id="fen-call"></div>
    <div class="fen-sub" id="fen-sub"></div>
    <div class="fen-combo" id="fen-combo"></div>
    <div class="fen-pops" id="fen-pops"></div>
    <div class="fen-coach" id="fen-coach" hidden></div>

    <div class="fen-replay" id="fen-replay" hidden>
      <span class="fen-rec"></span> REPRIS <small>· tryck för att hoppa över</small>
    </div>

    <div class="fen-pad fen-pad-l" id="fen-lines">
      <button class="fen-line" data-line="0" aria-label="Hög linje">HÖG ${KEY('↑')}</button>
      <button class="fen-line on" data-line="1" aria-label="Mittlinje">MITT</button>
      <button class="fen-line" data-line="2" aria-label="Låg linje">LÅG ${KEY('↓')}</button>
    </div>
    <div class="fen-pad fen-pad-r" id="fen-attack">
      <button class="fen-btn fen-feint" id="fen-feint" aria-label="Fint">FINT ${KEY('F')}</button>
      <button class="fen-btn fen-lunge" id="fen-lunge" aria-label="Stöt">STÖT ${KEY('Space')}</button>
    </div>
    <div class="fen-keys" id="fen-keys">${KEY('↑')}${KEY('↓')} gard &nbsp;·&nbsp; ${KEY('Mellanslag')} stöt &nbsp;·&nbsp; ${KEY('F')} fint &nbsp;·&nbsp; ${KEY('?')} regler</div>

    <div class="fen-screen" id="fen-screen"><div class="fen-panel" id="fen-panel"></div></div>

    <button class="pb-info" id="fen-info" aria-label="Så spelar du">?</button>
    <button class="pb-mute" id="fen-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>

    <div class="pb-help" id="fen-help" hidden>
      <div class="pb-help-card">
        <h3>Så fäktas du</h3>
        <p class="pb-help-sub">Pekkas Fäktning · Stockholm 2023</p>
        <ul class="pb-help-list">
          <li><i style="--c:#7fd8e8"></i><b>Tre linjer</b> HÖG, MITT och LÅG. Din gard i samma linje som motståndarens anfall parerar det automatiskt — som i Nidhogg.</li>
          <li><i style="--c:#ff7a6b"></i><b>Läs anfallet</b> Klingan blänker och linjeknappen lyser rött i den linje anfallet kommer i. De bättre fäktarna byter linje i sista stund.</li>
          <li><i style="--c:#f2c14e"></i><b>Parad → Ripost</b> En parad får motståndaren att vackla. STÖT i det läget är nästan alltid tusch — och ger extra poäng.</li>
          <li><i style="--c:#5eead4"></i><b>Finten</b> FINT är ett anfall som inte menas. Går motståndaren på den binds klingan — stöt i öppen linje!</li>
          <li><i style="--c:#c9a7ff"></i><b>Rätten till anfall</b> Att stöta rakt in i ett påbörjat anfall slutar illa — den som började har vägrätt. Parera först.</li>
          <li><i style="--c:#d9a05b"></i><b>Turneringen</b> Först till 5 tusch per match. Kvartsfinal mot Mikael, semifinal mot Rickard, final mot mästaren Per Vikman.</li>
        </ul>
        <p class="pb-help-tip">Poäng: tusch 100 · ripost 175 · fint-tusch 150 · parad 25 · +50 per tusch i rad · matchvinst 500 + 100 per tusch i marginal · vit match (5–0) +300.</p>
        <div class="pb-help-keys">Gard: ↑/↓ eller 1–3 · Stöt: mellanslag · Fint: F · Kortet: ? eller Esc</div>
        <button class="pb-btn" id="fen-help-close">Tillbaka till pisten</button>
      </div>
    </div>
  `;
  const q = (s) => root.querySelector(s);
  const el = {
    flash: q('#fen-flash'), bars: q('#fen-bars'),
    score: q('#fen-score'), best: q('#fen-best'),
    board: q('#fen-board'), round: q('#fen-round'),
    meName: q('#fen-me-name'), foeName: q('#fen-foe-name'),
    mePips: q('#fen-me-pips'), foePips: q('#fen-foe-pips'),
    meN: q('#fen-me-n'), foeN: q('#fen-foe-n'),
    call: q('#fen-call'), sub: q('#fen-sub'), combo: q('#fen-combo'),
    pops: q('#fen-pops'), coach: q('#fen-coach'), replay: q('#fen-replay'),
    lines: q('#fen-lines'), lineBtns: Array.from(root.querySelectorAll('.fen-line')),
    attack: q('#fen-attack'), feint: q('#fen-feint'), lunge: q('#fen-lunge'), keys: q('#fen-keys'),
    screen: q('#fen-screen'), panel: q('#fen-panel'),
    info: q('#fen-info'), mute: q('#fen-mute'), help: q('#fen-help'), helpClose: q('#fen-help-close')
  };
  return new Hud(root, el);
}

/* ------------------------------------------------------------ screens */

const medalSvg = (rank, size = 26) => {
  if (!rank) return '';
  const c = { 1: ['#ffe28a', '#d99a2b'], 2: ['#f1f4fa', '#9aa3b5'], 3: ['#f0b98a', '#a8642f'] }[rank];
  return `<svg class="fen-medal-ico" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">
    <path d="M10 2h5l3 9h-5zM22 2h-5l-3 9h5z" fill="#3e6e9e"/>
    <circle cx="16" cy="20" r="9.5" fill="${c[1]}"/>
    <circle cx="16" cy="20" r="7.5" fill="${c[0]}"/>
    <text x="16" y="24" text-anchor="middle" font-size="10" font-weight="700" fill="${c[1]}" font-family="Space Grotesk, sans-serif">${rank}</text>
  </svg>`;
};

export function titleScreen({ fencer, best, medals, played }) {
  const chips = PICKABLE.map((name) => {
    const m = medals[name] || 0;
    return `<button class="fen-chip${name === fencer ? ' on' : ''}" data-fencer="${esc(name)}">
      <span>${esc(short(name))}</span>${medalSvg(m, 18)}
    </button>`;
  }).join('');
  return `
    <div class="fen-kicker">Stockholm · 19 augusti 2023</div>
    <h2 class="fen-h">Pekkas Fäktning</h2>
    <p class="fen-lead">En fäktsal i skymning. Tre matcher mot den riktiga 2023-pallen — Mikael, Rickard och mästaren Per Vikman. Först till fem tusch.</p>
    <div class="fen-pick">
      <div class="fen-label">Vem fäktas du som?</div>
      <div class="fen-chips">${chips}</div>
    </div>
    <ul class="fen-steps">
      <li><i style="--c:#7fd8e8"></i><b>Gardera</b> Välj HÖG, MITT eller LÅG — samma linje som anfallet parerar.</li>
      <li><i style="--c:#f2c14e"></i><b>Ripostera</b> Efter en parad vacklar motståndaren — STÖT direkt!</li>
      <li><i style="--c:#5eead4"></i><b>Finta</b> FINT lockar fram paraden, sen är en annan linje öppen.</li>
    </ul>
    <button class="pb-btn fen-go" data-act="start">${played ? 'Till turneringen' : 'En garde!'}</button>
    <div class="fen-foot">${best ? `Rekord ${fmt(best)} poäng` : 'Inget rekord än — salen väntar'}<span class="fen-desk"> · ${KEY('Mellanslag')} startar</span></div>
  `;
}

/**
 * The eight of 2023 in a bracket. You take the place of the fencer you
 * chose; Mikael, Rickard and Per Vikman wait on your side of the draw,
 * the other four fill the remaining quarter-finals.
 */
export function makeBracket(fencer, rand) {
  const others = FIELD.filter((f) => f.place > 3 && f.name !== fencer).sort((a, b) => a.place - b.place);
  const [a, b, c, d] = others;
  const lose = () => 1 + Math.floor(rand() * 3);
  return {
    qf: [
      { p: [fencer, 'Mikael Hägglund'], you: 0 },
      { p: ['Rickard Nilsson', d.name], s: [5, lose()], w: 0 },
      { p: [a.name, b.name], s: [5, lose()], w: 0 },
      { p: [c.name, 'Per Vikman'], s: [lose(), 5], w: 1 }
    ],
    sf: [
      { p: [fencer, 'Rickard Nilsson'], you: 1 },
      { p: [a.name, 'Per Vikman'], s: [lose() + 1, 5], w: 1 }
    ],
    f: [{ p: [fencer, 'Per Vikman'], you: 2 }]
  };
}

export function bracketScreen({ bracket, round, results, opp, place }) {
  const match = (m) => {
    const yours = m.you !== undefined;
    const res = yours ? results[m.you] : null;
    const cur = yours && m.you === round;
    const pending = yours && !res && !cur;
    const score = (i) => {
      if (res) return res.s[i];
      if (m.s) return m.s[i];
      return '';
    };
    const won = (i) => (res ? (res.won ? i === 0 : i === 1) : m.w === i);
    const rows = m.p.map((n, i) => `
      <div class="fen-bm-row${won(i) ? ' w' : ''}${yours && i === 0 ? ' you' : ''}">
        <span>${esc(short(n))}</span><b>${score(i)}</b>
      </div>`).join('');
    return `<div class="fen-bm${cur ? ' cur' : ''}${pending ? ' pending' : ''}">${rows}</div>`;
  };
  const col = (title, list) => `<div class="fen-bcol"><div class="fen-bhead">${title}</div><div class="fen-bms">${list.map(match).join('')}</div></div>`;
  return `
    <div class="fen-kicker">${ROUNDS[round]} · match ${round + 1} av 3</div>
    <div class="fen-bracket">
      ${col('Kvartsfinal', bracket.qf)}
      ${col('Semifinal', bracket.sf)}
      ${col('Final', bracket.f)}
    </div>
    <div class="fen-opp">
      <div class="fen-opp-badge">${medalSvg(place, 34)}</div>
      <div class="fen-opp-text">
        <b>${esc(opp.name)}</b>
        <span>${esc(opp.title)} · ${place}:a 2023</span>
        <p>${esc(opp.style)}</p>
      </div>
    </div>
    <button class="pb-btn fen-go" data-act="fight">En garde mot ${esc(opp.name.split(' ')[0])}!</button>
    <div class="fen-foot fen-desk">${KEY('Mellanslag')} för att börja</div>
  `;
}

export function resultScreen({ won, opp, mine, theirs, bonus, margin, shutout, stats, last }) {
  const lines = [
    ['Parader', stats.parries],
    ['Ripostar', stats.ripostes],
    ['Fint-tusch', stats.feints],
    ['Längsta svit', stats.bestStreak]
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  return `
    <div class="fen-kicker">${won ? 'Matchen är din' : 'Matchen förlorad'}</div>
    <h2 class="fen-h">${won ? `Du slog ${esc(opp.name)}!` : `${esc(opp.name)} vann`}</h2>
    <div class="fen-big-score"><b class="${won ? 'w' : ''}">${mine}</b><i>–</i><b class="${won ? '' : 'l'}">${theirs}</b></div>
    ${won ? `<div class="fen-bonus">+${fmt(bonus)} <small>matchvinst · marginal ${margin}${shutout ? ' · vit match +300' : ''}</small></div>` : ''}
    <div class="fen-stats">${lines}</div>
    <p class="fen-lead">${won ? (last ? 'Mästaren är besegrad. Salut!' : esc(opp.next)) : 'Turneringen är över för den här gången — men poängen räknas.'}</p>
    <button class="pb-btn fen-go" data-act="next">${won && !last ? 'Till nästa match' : 'Se resultatet'}</button>
  `;
}

export function finalScreen({ medal, score, best, isBest, fencer, results }) {
  const head = {
    1: ['Pokalen är din!', 'Guld i Stockholm. Per Vikman tar av sig masken och skakar hand — salen reser sig.'],
    2: ['Silver!', 'En final mot den regerande mästaren. Så nära.'],
    3: ['Brons!', 'Som i riktig fäktning delar semifinalförlorarna på bronset.'],
    0: ['Utslagen i kvartsfinalen', 'Masken av, handskarna i väskan. En turnering till?']
  }[medal];
  const recap = results.map((r, i) => `
    <div class="${r.won ? 'w' : 'l'}"><span>${ROUNDS[i]}</span><em>${esc(short(r.opp))}</em><b>${r.s[0]}–${r.s[1]}</b></div>
  `).join('');
  return `
    <div class="fen-medal-big${medal ? ` m${medal}` : ''}">${medal ? medalSvg(medal, 96) : '<span>🤺</span>'}</div>
    <div class="fen-kicker">${esc(fencer)} · ${medal ? MEDAL_LABEL[medal] : 'Ingen medalj'}</div>
    <h2 class="fen-h">${head[0]}</h2>
    <p class="fen-lead">${head[1]}</p>
    <div class="fen-recap">${recap}</div>
    <div class="fen-total"><b>${fmt(score)}</b><small>${isBest ? 'nytt rekord!' : `poäng · rekord ${fmt(best)}`}</small></div>
    <button class="pb-btn fen-go" data-act="again">Fäktas igen</button>
  `;
}
