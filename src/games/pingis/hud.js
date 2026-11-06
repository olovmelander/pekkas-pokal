/**
 * Pekkas Pingis — the HUD and the cards between matches.
 *
 * Built on the shared pb-/fg- HUD classes, with the game's own pieces (the
 * broadcast-style score bug, the rally counter, the match-point banner, the
 * opponent intro, medals, the replay letterbox) styled in style.css under
 * .pg-ui. Every card is plain DOM painted from data; index.js owns the flow
 * and wires the buttons through their data-action attributes.
 */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('sv-SE');
export const MEDAL_NAMES = ['', 'Brons', 'Silver', 'Guld'];

function medal(level, big = false) {
  return `<span class="pg-medal m-${level}${big ? ' big' : ''}" aria-label="${MEDAL_NAMES[level] || 'Ingen medalj'}"></span>`;
}

export function buildHud(root, { mouse }) {
  const moveHint = mouse ? 'Rör musen — racketen följer pekaren.' : 'Dra med fingret — racketen följer dig längs bordet.';
  const serveHint = mouse ? 'klicka för att serva' : 'dra och släpp';
  // Controls on screen while you play: keys on a desktop, the gesture on a phone
  const keysHint = mouse
    ? '<span><kbd>Mus</kbd> eller <kbd>←</kbd><kbd>→</kbd> flyttar</span>' +
      '<span>dra musen <kbd>↑</kbd><kbd>↓</kbd> i träffen = skruv</span>' +
      '<span><kbd>klick</kbd> / <kbd>mellanslag</kbd> servar</span><span><kbd>?</kbd> hjälp</span>'
    : '<span>Dra = flytta racketen · flicka UPP i träffen = topspin, NED = backspin</span>';
  root.innerHTML = `
    <div class="pb-hud">
      <div class="pb-top">
        <div class="pb-score-wrap">
          <div class="pb-score" id="pg-score">0</div>
          <div class="pb-hi">REKORD <span id="pg-hi">0</span></div>
        </div>
      </div>
      <div class="pg-bug" id="pg-bug">
        <div class="pg-bug-row">
          <span class="pg-dot" id="pg-dot-me"></span>
          <span class="pg-nm">DU</span>
          <span class="pg-pt me" id="pg-my"><b>0</b></span>
          <span class="pg-pt ai" id="pg-ai"><b>0</b></span>
          <span class="pg-nm" id="pg-ainame">—</span>
          <span class="pg-dot" id="pg-dot-ai"></span>
        </div>
        <div class="pg-pips" id="pg-pips"></div>
      </div>
      <div class="pg-mp" id="pg-mp"><b>MATCHBOLL</b><small id="pg-mp-who"></small></div>
      <div class="pg-rally" id="pg-rally"><small>RALLY</small><b id="pg-rally-n">0</b><em id="pg-rally-word"></em></div>
      <div class="fg-zone" id="pg-callout"></div>
      <div class="fg-phase" id="pg-phase"></div>
      <div class="pb-toast" id="pg-toast"></div>
      <div class="fg-pops" id="pg-pops"></div>
      <div class="pg-keys${mouse ? '' : ' touch'}" id="pg-keys">${keysHint}</div>
      <div class="pg-ghost" id="pg-ghost" aria-hidden="true"><i class="pg-ghost-dot"></i><small>dra · släpp med en flick uppåt</small></div>
      <div class="pg-stroke" id="pg-stroke" hidden><span id="pg-stroke-text"></span><i><b id="pg-stroke-fill"></b></i></div>
    </div>

    <div class="pg-replay" id="pg-replay" aria-hidden="true">
      <div class="pg-bar top"></div><div class="pg-bar bot"></div>
      <div class="pg-replay-tag"><i></i>REPRIS</div>
      <div class="pg-replay-skip">${mouse ? 'Klicka' : 'Tryck'} för att hoppa över</div>
    </div>

    <div class="pg-intro" id="pg-intro" aria-live="polite"></div>

    <div class="pb-overlay" id="pg-overlay">
      <div class="pb-panel pg-card" id="pg-panel"></div>
    </div>

    <button class="pb-info" id="pg-info" aria-label="Paus och spelregler" aria-expanded="false" title="Paus och spelregler (P / ?)"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></button>

    <div class="pb-help" id="pg-help" role="dialog" aria-modal="true" aria-label="Paus och spelregler" hidden>
      <div class="pb-help-card">
        <div class="pg-help-body" tabindex="0" role="region" aria-label="Spelregler">
        <h3>Paus · så spelar du pingis</h3>
        <p class="pb-help-sub">Pekkas Pingis · Bredbyn 2019</p>
        <ul class="pb-help-list">
          <li><i style="--c:#7fd8e8"></i><b>Racketen</b> ${mouse ? 'Följer muspekaren' : 'Följer fingret'} (eller ←/→). Möt bollen — träffar du inte är poängen borta.</li>
          <li><i style="--c:#ff8a3d"></i><b>Topspin</b> ${mouse ? 'Dra musen' : 'Flicka'} uppåt i träffögonblicket: hårdare boll som dyker och sparkar framåt i studsen. Spåret lyser orange.</li>
          <li><i style="--c:#8f7bff"></i><b>Backspin</b> ${mouse ? 'Dra musen' : 'Flicka'} nedåt: långsam boll som bromsar i studsen och är svår att smasha. Spåret lyser lila.</li>
          <li><i style="--c:#5eead4"></i><b>Placering</b> Sidledsrörelse styr bollen mot hörnen — bort från motståndarens racket.</li>
          <li><i style="--c:#f26d8d"></i><b>Risken</b> Ju hårdare slag, desto större chans att bollen går i nät eller utanför.</li>
          <li><i style="--c:#ffd166"></i><b>Serven</b> Din serve: ${serveHint}. Bollen måste studsa på din sida först — precis som på riktigt.</li>
          <li><i style="--c:#f2c14e"></i><b>Läs bollen</b> Den gyllene ringen visar var bollen studsar, och spårets färg avslöjar skruven innan den gör det.</li>
        </ul>
        <p class="pb-help-tip">Först till 7, vinn med två bollars marginal. Serven byts varannan boll; från 6–6 byts den varje boll. Långa dueller, smash-avslut och serve-ess ger extra poäng. Vinn med 3 bollars marginal för silver, 5 för guld.</p>
        <div class="pb-help-keys">←/→ flyttar · håll ↑ = topspin, ↓ = backspin · mellanslag servar · P / ? pausar</div>
        </div>
        <button class="pb-btn" data-action="help-close">Tillbaka till bordet</button>
      </div>
    </div>

    <button class="pb-mute" id="pg-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  const el = {
    score: q('#pg-score'), hi: q('#pg-hi'), bug: q('#pg-bug'), my: q('#pg-my'), ai: q('#pg-ai'),
    aiName: q('#pg-ainame'), dotMe: q('#pg-dot-me'), dotAi: q('#pg-dot-ai'), pips: q('#pg-pips'),
    mp: q('#pg-mp'), mpWho: q('#pg-mp-who'), rally: q('#pg-rally'), rallyN: q('#pg-rally-n'),
    rallyWord: q('#pg-rally-word'), keys: q('#pg-keys'), callout: q('#pg-callout'), phase: q('#pg-phase'),
    toast: q('#pg-toast'), pops: q('#pg-pops'), replay: q('#pg-replay'), intro: q('#pg-intro'),
    overlay: q('#pg-overlay'), panel: q('#pg-panel'), help: q('#pg-help'), mute: q('#pg-mute'),
    ghost: q('#pg-ghost')
  };
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };

  /** A split-flap number: the old digit folds away, the new one drops in. */
  function flip(box, value) {
    const v = String(value);
    if (box.dataset.v === v) return;
    box.dataset.v = v;
    const old = box.lastElementChild;
    const b = document.createElement('b');
    b.textContent = v;
    b.className = 'in';
    if (old) {
      old.className = 'out';
      later(() => old.remove(), 420);
    }
    box.appendChild(b);
  }

  let toastTimer = 0;
  const stroke = root.querySelector('#pg-stroke');
  const strokeText = root.querySelector('#pg-stroke-text');
  const strokeFill = root.querySelector('#pg-stroke-fill');
  const api = {
    el,
    fmt,
    serveHint,
    setStroke(spin) {
      stroke.hidden = Math.abs(spin) < 0.2;
      stroke.dataset.spin = spin > 0 ? 'top' : 'back';
      strokeText.textContent = spin > 0 ? '↑ TOPSPIN' : '↓ BACKSPIN';
      strokeFill.style.transform = `scaleX(${Math.min(1, Math.abs(spin))})`;
    },
    setScore(n, bump = true) {
      el.score.textContent = fmt(n);
      if (!bump) return;
      el.score.classList.remove('bump');
      void el.score.offsetWidth;
      el.score.classList.add('bump');
    },
    setHigh(n) {
      el.hi.textContent = fmt(n);
    },
    setPoints(my, ai, name, serveMine) {
      flip(el.my, my);
      flip(el.ai, ai);
      el.aiName.textContent = name;
      el.dotMe.classList.toggle('on', serveMine);
      el.dotAi.classList.toggle('on', !serveMine);
    },
    /** Match pips: one per opponent — medal earned, current, or to come. */
    setPips(matchNo, medals, mode) {
      if (mode === 'single') {
        el.pips.innerHTML = '<span class="pg-pip-label">ENSKILD MATCH</span>';
        return;
      }
      el.pips.innerHTML = `${[0, 1, 2].map((i) => {
        const cls = i < matchNo - 1 ? `won m-${medals[i] || 1}` : i === matchNo - 1 ? 'now' : '';
        return `<i class="${cls}"></i>`;
      }).join('')}<span class="pg-pip-label">MATCH ${matchNo}/3</span>`;
    },
    showKeys(on) {
      el.keys.classList.toggle('show', on);
    },
    /** A ghost finger that shows a first-time touch player the serve. */
    ghost(on) {
      el.ghost.classList.toggle('show', on);
    },
    showBug(on) {
      el.bug.classList.toggle('show', on);
    },
    setRally(n, word, tier) {
      el.rally.classList.toggle('show', n >= 4);
      el.rally.dataset.tier = String(tier);
      if (el.rallyN.textContent !== String(n)) {
        el.rallyN.textContent = String(n);
        el.rallyN.classList.remove('tick');
        void el.rallyN.offsetWidth;
        el.rallyN.classList.add('tick');
      }
      el.rallyWord.textContent = word || '';
    },
    setMatchPoint(kind, who) {
      el.mp.classList.toggle('show', !!kind);
      el.mp.classList.toggle('theirs', kind < 0);
      el.mpWho.textContent = kind ? (kind > 0 ? 'för dig' : `för ${who}`) : '';
    },
    toast(msg, big = false) {
      el.toast.textContent = msg;
      el.toast.className = `pb-toast show${big ? ' big' : ''}`;
      clearTimeout(toastTimer);
      toastTimer = later(() => {
        el.toast.className = 'pb-toast';
      }, big ? 1900 : 1100);
    },
    callout(txt, cls = '') {
      el.callout.textContent = txt;
      el.callout.className = `fg-zone ${cls}`;
      void el.callout.offsetWidth;
      el.callout.classList.add('show');
    },
    phase(txt) {
      el.phase.textContent = txt;
      el.phase.classList.toggle('show', !!txt);
    },
    /** A label that floats up from a point on screen (percent coords). */
    pop(text, x, y, cls = '', color = '') {
      const p = document.createElement('div');
      p.className = `fg-pop ${cls}`;
      p.textContent = text;
      p.style.left = `${x}%`;
      p.style.top = `${y}%`;
      if (color) p.style.setProperty('--pc', color);
      el.pops.appendChild(p);
      later(() => p.remove(), 1200);
    },
    replay(on) {
      el.replay.classList.toggle('show', on);
      root.classList.toggle('pg-replaying', on); // the broadcast HUD steps aside
    },
    hideIntro() {
      el.intro.classList.remove('show');
    },
    /** The opponent walks on: name, 2019 medal, a scouting report. */
    showIntro({ opp, matchNo, mode, stats, medal2019 }) {
      const bars = stats.map(([label, v]) => `
        <div class="pg-stat"><span>${esc(label)}</span><i>${[0, 1, 2, 3, 4].map((k) => `<u class="${k < v ? 'on' : ''}"></u>`).join('')}</i></div>`).join('');
      el.intro.innerHTML = `
        <div class="pg-intro-card">
          <div class="pg-kicker">${mode === 'single' ? 'ENSKILD MATCH' : `MATCH ${matchNo} AV 3`} · ${esc(medal2019)}</div>
          <h3 class="pg-intro-name">${esc(opp.name)}</h3>
          <div class="pg-intro-title">${esc(opp.title)}</div>
          <div class="pg-stats">${bars}</div>
          <p class="pg-quote">${esc(opp.taunt)}</p>
          <button class="pb-btn" data-action="play">Till bordet!</button>
        </div>`;
      el.intro.classList.remove('show');
      void el.intro.offsetWidth;
      el.intro.classList.add('show');
    },
    showPanel(html, cls = '') {
      el.overlay.classList.toggle('pg-low', cls === 'pg-final');
      el.panel.className = `pb-panel pg-card ${cls}`;
      el.panel.innerHTML = html;
      el.overlay.classList.add('show');
    },
    hidePanel() {
      el.overlay.classList.remove('show');
    },
    menu({ opps, best, high, unlocked, mouse: m }) {
      const rungs = opps.map((o, i) => `
        <button class="pg-rung${unlocked[i] ? '' : ' locked'}" data-action="single" data-idx="${i}" ${unlocked[i] ? '' : 'disabled'}>
          ${medal(best.medals[i] || 0)}
          <span class="pg-rung-txt"><b>${esc(o.name)}</b><small>${esc(o.place)}</small></span>
        </button>`).join('');
      api.showPanel(`
        <div class="pg-kicker">OLYMPIA · BREDBYN · 2019</div>
        <h2>Pekkas Pingis</h2>
        <p>Tre matcher mot 2019 års riktiga pall. Först till 7 — med två bollars marginal.</p>
        <div class="pg-ladder">${rungs}</div>
        <ul class="fg-steps">
          <li><i style="--c:#7fd8e8"></i><b>Flytta</b> ${moveHint}</li>
          <li><i style="--c:#ff8a3d"></i><b>Skruva</b> ${m ? 'Dra' : 'Flicka'} UPPÅT i träffen för topspin, NEDÅT för backspin.</li>
          <li><i style="--c:#5eead4"></i><b>Placera</b> Rörelse i sidled styr bollen ut i hörnen.</li>
        </ul>
        <div class="pg-bests">
          <span>Rekord <b>${fmt(high)}</b></span>
          <span>Längsta rally <b>${best.rally || 0}</b></span>
          <span>Titlar <b>${best.titles || 0}</b></span>
        </div>
        <button class="pb-btn" data-action="tour">Starta turneringen</button>
        <div class="pg-hint">Tryck på en motståndare du nått för en enskild match</div>`, 'pg-menu');
    },
    result({ won, my, ai, opp, level, why, stats, score, next, mode }) {
      const statRow = `
        <div class="pg-statrow">
          <div><b>${stats.rally}</b><small>längsta rally</small></div>
          <div><b>${stats.smashes}</b><small>smashar</small></div>
          <div><b>${stats.aces}</b><small>serve-ess</small></div>
        </div>`;
      const first = opp.name.split(' ')[0];
      if (won) {
        api.showPanel(`
          <div class="pg-kicker">${mode === 'single' ? 'ENSKILD MATCH' : 'MATCHEN ÄR DIN'}</div>
          <h2>${my}–${ai} mot ${esc(first)}!</h2>
          <div class="pg-medal-drop">${medal(level, true)}<b>${MEDAL_NAMES[level]}</b><small>${esc(why)}</small></div>
          ${statRow}
          ${mode === 'single' ? '' : `<div class="pb-scoreline"><span>${fmt(score)}</span><small>poäng hittills</small></div>`}
          ${next ? `<p class="pg-next">Nästa: <b>${esc(next.name)}</b> — ${esc(next.title)}</p>
            <button class="pb-btn" data-action="next">Möt ${esc(next.name.split(' ')[0])}!</button>`
    : `<div class="pg-btns"><button class="pb-btn" data-action="again">En gång till</button><button class="pb-btn ghost" data-action="menu">Meny</button></div>`}`, 'pg-result');
      } else {
        api.showPanel(`
          <div class="pg-kicker">${mode === 'single' ? 'ENSKILD MATCH' : 'TURNERINGEN ÄR SLUT'}</div>
          <h2>${esc(first)} vann ${ai}–${my}</h2>
          <p>${esc(why)}</p>
          ${statRow}
          ${mode === 'single' ? '' : `<div class="pb-scoreline"><span>${fmt(score)}</span><small>poäng</small></div>`}
          <div class="pg-btns"><button class="pb-btn" data-action="again">${mode === 'single' ? 'Revansch' : 'Spela igen'}</button><button class="pb-btn ghost" data-action="menu">Meny</button></div>`, 'pg-result');
      }
    },
    final({ medals, opps, score, high, isHigh, rally }) {
      api.showPanel(`
        <div class="pg-kicker">PEKKAS POKAL · BREDBYN 2019</div>
        <h2 class="pg-champ">Mästare av Bredbyn!</h2>
        <p>Du slog hela 2019 års pall. Pokalen — och sista kanelbullen — är din.</p>
        <div class="pg-medalrow">${opps.map((o, i) => `<div>${medal(medals[i] || 1, true)}<small>${esc(o.name.split(' ')[0])}</small></div>`).join('')}</div>
        <div class="pb-scoreline"><span>${fmt(score)}</span><small>${isHigh ? 'nytt rekord!' : `poäng · rekord ${fmt(high)}`}</small></div>
        <div class="pg-bests"><span>Längsta rally <b>${rally}</b></span></div>
        <div class="pg-btns"><button class="pb-btn" data-action="again">Spela igen</button><button class="pb-btn ghost" data-action="menu">Meny</button></div>`, 'pg-final');
    },
    dispose() {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      clearTimeout(toastTimer);
    }
  };
  return api;
}
