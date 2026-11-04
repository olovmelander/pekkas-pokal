/**
 * Pekkas Lerduvor — HUD markup and the start/end panels.
 *
 * Built on the shared pb-/fg-/sk- classes from game-hud.css; everything
 * new is scoped under `.sk-ui` in this game's style.css. The panels are
 * re-rendered as HTML strings (start, end), so the buttons inside them
 * are wired by delegation on the overlay rather than by reference.
 */

const fmt = (n) => Math.round(n).toLocaleString('sv-SE');

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';

export function buildHud(root, { ludvig }) {
  root.innerHTML = `
    <div class="sk-grade"></div>
    <div class="sk-flash" id="sk-flash"></div>
    <div class="pb-hud sk-hud" id="sk-hud">
      <div class="pb-top">
        <div class="pb-score-wrap">
          <div class="pb-score" id="sk-score">0</div>
          <div class="sk-ghost" id="sk-ghost">
            <div class="sk-ghost-bar"><i id="sk-ghost-fill"></i><b id="sk-ghost-mark"></b></div>
            <span id="sk-ghost-text">LUDVIG ${fmt(ludvig)}</span>
          </div>
        </div>
        <div class="pb-meta">
          <div class="sk-serie" id="sk-serie"></div>
          <div class="sk-streak" id="sk-streak"></div>
        </div>
      </div>
      <div class="sk-card" id="sk-card"></div>
      <div class="sk-shells" id="sk-shells"><i></i><i></i></div>
      <svg class="sk-lead" id="sk-lead" aria-hidden="true">
        <line id="sk-lead-line"></line>
        <circle class="ring" id="sk-lead-ring" r="10"></circle>
        <g id="sk-lead-dots"></g>
        <circle class="clay" id="sk-lead-clay" r="8"></circle>
      </svg>
      <div class="sk-lead-label" id="sk-lead-label"></div>
      <div class="sk-edge left" id="sk-edge-l"></div>
      <div class="sk-edge right" id="sk-edge-r"></div>
      <div class="sk-cross" id="sk-cross"><i></i></div>
      <div class="fg-zone sk-callout" id="sk-callout"></div>
      <div class="fg-phase" id="sk-phase"></div>
      <div class="sk-hint" id="sk-hint"></div>
      <div class="pb-toast" id="sk-toast"></div>
      <div class="fg-pops" id="sk-pops"></div>
      <div class="sk-seriecard" id="sk-seriecard"></div>
      <button class="sk-pull" id="sk-pull" aria-label="Pull — släpp duvan"><span>PULL!</span><small id="sk-pull-key">mellanslag</small></button>
    </div>

    <div class="pb-overlay sk-overlay" id="sk-overlay">
      <div class="pb-panel sk-panel" id="sk-panel"></div>
    </div>

    <button class="pb-info" id="sk-info" aria-label="Så spelar du">?</button>

    <div class="pb-help" id="sk-help" hidden>
      <div class="pb-help-card">
        <h3>Så skjuter du</h3>
        <p class="pb-help-sub">Pekkas Lerduvor</p>
        <ul class="pb-help-list">
          <li><i style="--c:#f2c14e"></i><b>PULL!</b> Tryck PULL, mellanslag — eller sätt bara fingret på skärmen. Duvan släpps efter en slumpad fördröjning på upp till ett par sekunder, precis som i olympisk skeet. Var redo.</li>
          <li><i style="--c:#7fd8e8"></i><b>Svinga igenom</b> Håll fingret nere och följ duvan. Släpp när kornet ligger på — hagelsvärmen går dit du pekar. På dator: sikta med musen, klicka för skott.</li>
          <li><i style="--c:#5eead4"></i><b>Håll svingen</b> Haglen tar en tiondels sekund ut till duvan, och under tiden flyger den vidare. Stannar du svingen när du skjuter hamnar svärmen bakom. Följer du med i duvans fart tar svingen med sig svärmen.</li>
          <li><i style="--c:#ff7a6b"></i><b>Bom?</b> Efter en bom visar banan var svärmen gick och var duvan var — BAKOM, FÖRE, ÖVER eller UNDER, och hur mycket.</li>
          <li><i style="--c:#d9a05b"></i><b>Serierna</b> Rakt från graven, sen korsare från sidorna, sen finalen med dubbléer. Två patroner per singel, en per duva i dubbléerna.</li>
          <li><i style="--c:#ffd166"></i><b>GULDDUVAN</b> Den 25:e. Liten, snabb, guld — 500 poäng, en enda patron.</li>
        </ul>
        <p class="pb-help-tip">Poäng: kross 100 + 25 per streak · dubblé-par +200 · felfri serie +500 · guldduvan 500. Medaljer: brons 1 800, silver 2 800, guld när du slår Ludvigs ${fmt(ludvig)}.</p>
        <div class="pb-help-keys">Sikta: dra / mus · Skjut: släpp / klick · PULL: knappen, tryck eller mellanslag · Kortet: ? eller Esc</div>
        <button class="pb-btn" id="sk-help-close">Tillbaka till banan</button>
      </div>
    </div>

    <button class="pb-mute" id="sk-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  return {
    hud: q('#sk-hud'), flash: q('#sk-flash'),
    score: q('#sk-score'), ghost: q('#sk-ghost'), ghostFill: q('#sk-ghost-fill'),
    ghostMark: q('#sk-ghost-mark'), ghostText: q('#sk-ghost-text'),
    streak: q('#sk-streak'), serie: q('#sk-serie'),
    card: q('#sk-card'), shells: q('#sk-shells'), cross: q('#sk-cross'),
    lead: q('#sk-lead'), leadLine: q('#sk-lead-line'), leadRing: q('#sk-lead-ring'),
    leadDots: q('#sk-lead-dots'), leadClay: q('#sk-lead-clay'), leadLabel: q('#sk-lead-label'),
    edgeL: q('#sk-edge-l'), edgeR: q('#sk-edge-r'),
    callout: q('#sk-callout'), phase: q('#sk-phase'), hint: q('#sk-hint'),
    toast: q('#sk-toast'), pops: q('#sk-pops'), serieCard: q('#sk-seriecard'),
    pull: q('#sk-pull'), pullKey: q('#sk-pull-key'),
    overlay: q('#sk-overlay'), panel: q('#sk-panel'),
    info: q('#sk-info'), help: q('#sk-help'), helpClose: q('#sk-help-close'), mute: q('#sk-mute')
  };
}

/**
 * The 25-card: one row per series (8 birds each — the doubles' two birds
 * get a box each, drawn as joined pairs) and the golden dove's own box.
 */
export function cardHtml(card, gold, { current = -1, singles = [8, 8, 4], labels = false, noGold = false } = {}) {
  let html = '';
  card.forEach((row, si) => {
    html += `<div class="sk-row${si === current ? ' now' : ''}">`;
    if (labels) html += `<b>S${si + 1}</b>`;
    row.forEach((v, bi) => {
      const state = v === true ? 'hit' : v === false ? 'miss' : '';
      const dbl = bi >= singles[si] ? ` dbl${(bi - singles[si]) % 2 ? ' b' : ' a'}` : '';
      html += `<i class="${state}${dbl}"></i>`;
    });
    html += '</div>';
  });
  if (noGold) return html;
  const gs = gold === true ? 'hit' : gold === false ? 'miss' : '';
  html += `<div class="sk-row gold${current === 3 ? ' now' : ''}">${labels ? '<b>★</b>' : ''}<i class="${gs}"></i></div>`;
  return html;
}

export function startPanelHtml({ best, ludvig, medals, touch }) {
  const chips = medals.map((m) => `<span class="sk-chip ${m.id}"><i></i>${m.id === 'guld'
    ? `Guld: slå Ludvigs ${fmt(ludvig)}` : `${m.name} ${fmt(m.min)}`}</span>`).join('');
  const bestLine = best && best.score > 0
    ? `<div class="sk-best">Ditt rekord <b>${fmt(best.score)}</b> · ${best.hits}/25 duvor</div>` : '';
  return `
    <div class="sk-kicker">Arnäsvall · augusti 2022</div>
    <h2>Pekkas Lerduvor</h2>
    <p>Tre serier, 24 duvor — och till sist guldduvan. En hel runda om 25, med Ludvigs guldrunda som spöke att slå.</p>
    <ul class="fg-steps">
      <li><i style="--c:#f2c14e"></i><b>Pull!</b> ${touch ? 'Tryck PULL eller sätt fingret på skärmen' : 'Klicka, tryck PULL eller mellanslag'} — duvan kommer efter en slumpad paus.</li>
      <li><i style="--c:#7fd8e8"></i><b>Sving</b> ${touch ? 'Håll fingret nere och följ duvan' : 'Följ duvan med musen'} — svärmen går dit kornet pekar.</li>
      <li><i style="--c:#5eead4"></i><b>${touch ? 'Släpp = skott' : 'Klick = skott'}</b> Håll svingen igång när du skjuter — duvan hinner flytta sig medan haglen flyger.</li>
    </ul>
    <div class="sk-goals">${chips}</div>
    ${bestLine}
    <button class="pb-btn" data-act="start">Ladda och klart!</button>
  `;
}

export function endPanelHtml(r) {
  const tierName = ['Ingen medalj', 'Brons', 'Silver', 'Guld'][r.tier];
  const stars = [1, 2, 3].map((i) => `<i class="${i <= r.tier ? 'on' : ''}" style="--d:${0.5 + i * 0.18}s">${STAR}</i>`).join('');
  const rows = [
    ['Krossar', `${r.hits} / 25`, r.base],
    ['Streakbonus', `längsta ${r.bestStreak} i rad`, r.bonus],
    ['Dubbléer', r.pairs ? `${r.pairs} hela par` : '—', r.pairs * 200],
    ['Felfria serier', r.clean ? `${r.clean} st` : '—', r.clean * 500],
    ['Guldduvan', r.gold ? 'KROSS' : 'flög vidare', r.goldPts]
  ].map(([k, sub, v], i) => `<div style="--i:${i}"><dt>${k}<small>${sub}</small></dt><dd>${v ? `+${fmt(v)}` : '0'}</dd></div>`).join('');
  const diff = r.score - r.ludvig;
  const vs = diff > 0
    ? `<em class="up">+${fmt(diff)}</em> — du slog honom`
    : diff === 0 ? '<em>exakt lika</em>' : `<em class="down">${fmt(diff)}</em> — fattades ${fmt(-diff)}`;
  const recordLine = r.isRecord
    ? '<div class="sk-best new">Nytt rekord!</div>'
    : `<div class="sk-best">Ditt rekord <b>${fmt(r.record)}</b></div>`;
  // Two halves: stacked on a phone, side by side on a short landscape screen
  return `
    <div class="sk-end-a">
      <div class="sk-kicker">Rundan är slut · ${r.hits}/25 duvor</div>
      <div class="sk-medal tier-${r.tier}"><span>${tierName}</span></div>
      <div class="sk-stars">${stars}</div>
      <h2>${r.title}</h2>
      <div class="sk-total"><span id="sk-total">0</span><small>poäng</small></div>
      <div class="sk-vs">Ludvig 2022 <b>${fmt(r.ludvig)}</b> · ${vs}</div>
      ${recordLine}
    </div>
    <div class="sk-end-b">
      <div class="sk-endcard">${cardHtml(r.card, r.goldHit, { labels: true })}</div>
      <dl class="sk-break">${rows}</dl>
      <button class="pb-btn" data-act="start">Ny runda</button>
    </div>
  `;
}

export { fmt };
