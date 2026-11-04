/**
 * Pekkas Fiske — the HUD.
 *
 * Built on the shared pb-/fg- base classes, under its own .fiske-ui root
 * so this game's style.css can restyle it without touching any other
 * game. New pieces use the fi- prefix:
 *
 *   fi-gauge    a depth gauge down the right edge: zone ticks, where each
 *               species lives, the lure, and your deepest point this cast
 *   fi-mission  the cast's uppdrag, which turns gold when done
 *   fi-zone     the zone banner — depth, name and who lives there
 *   fi-announce the combo announcer (DUBBELNAPP!, TRIPPEL! …)
 *   fi-book     the fångstdagbok
 */

const TARGET_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="1" fill="currentColor"/></svg>';
const BOOK_ICON = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 4.5c2.2-1 4.6-1 7 .6 2.4-1.6 4.8-1.6 7-.6V16c-2.2-1-4.6-1-7 .6-2.4-1.6-4.8-1.6-7-.6Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 5.1v11.5" stroke="currentColor" stroke-width="1.6"/></svg>';

export function buildHud(root, zones, species, bottom, touch) {
  // Controls are named for the device in hand: a finger drags and taps,
  // a desktop steers with the mouse or the arrow keys and clicks
  const steerText = touch ? 'Tre kast. Dra med fingret för att styra draget.'
    : 'Tre kast. Styr draget med musen eller ←/→.';
  const tapWord = touch ? 'Tryck' : 'Klicka';
  const ticks = zones.map((z) => `<li style="top:${(z.at / bottom) * 100}%"><span>${z.at} m</span></li>`).join('');
  const bands = species.map((sp) => {
    const top = (sp.min / bottom) * 100;
    const h = ((sp.max - sp.min) / bottom) * 100;
    return `<i style="top:${top}%;height:${h}%;--c:#${sp.fin.toString(16).padStart(6, '0')}" title="${sp.name}"></i>`;
  }).join('');

  root.innerHTML = `
    <div class="fi-vignette"></div>
    <div class="fi-flash" id="fi-flash"></div>
    <div class="pb-hud">
      <div class="pb-top">
        <div class="pb-score-wrap">
          <div class="pb-score" id="fg-score">0</div>
          <div class="pb-hi">REKORD <span id="fg-hi">0</span></div>
        </div>
        <div class="pb-meta">
          <div class="fg-depth" id="fg-depth">0 m</div>
          <div class="fi-casts" id="fi-casts"></div>
        </div>
      </div>
      <div class="fi-mission" id="fi-mission" hidden>${TARGET_ICON}<span id="fi-mission-text"></span><b id="fi-mission-bonus"></b></div>
      <div class="fg-mult" id="fg-mult"></div>
      <div class="fi-gauge" id="fi-gauge" aria-hidden="true">
        <div class="fi-gauge-rail">${bands}<ol>${ticks}</ol>
          <div class="fi-gauge-deep" id="fi-gauge-deep"></div>
          <div class="fi-gauge-lure" id="fi-gauge-lure"></div>
        </div>
      </div>
      <div class="fi-zone" id="fi-zone"><small id="fi-zone-depth"></small><b id="fi-zone-name"></b><span id="fi-zone-sub"></span></div>
      <div class="fg-phase" id="fg-phase"></div>
      <div class="fi-announce" id="fi-announce"><b id="fi-announce-big"></b><span id="fi-announce-sub"></span></div>
      <div class="pb-toast" id="fg-toast"></div>
      <div class="fg-pops" id="fg-pops"></div>
      <div class="fi-hint" id="fi-hint" hidden><span class="fi-hint-hand"></span><span>${touch ? 'Dra åt sidan för att styra draget' : 'Flytta musen eller håll ←/→ för att styra'}</span></div>
      <div class="fi-tunna" id="fi-tunna" hidden>I TUNNAN <b id="fi-tunna-n">0</b></div>
    </div>

    <div class="fg-round" id="fg-round" hidden>
      <div class="fg-round-card">
        <span class="fg-round-kicker" id="fg-round-kicker"></span>
        <b class="fg-round-no" id="fg-round-no"></b>
        <div class="fg-round-haul" id="fg-round-haul"></div>
        <div class="fi-round-mission" id="fi-round-mission"></div>
        <div class="fi-round-next" id="fi-round-next"></div>
      </div>
    </div>

    <div class="pb-overlay" id="fg-overlay">
      <div class="pb-panel fi-panel">
        <span class="fi-kicker" id="fi-kicker">2024 · Midnattssol över sjön</span>
        <h2 id="fg-title">Pekkas Fiske</h2>
        <p id="fg-text">${steerText}</p>
        <ul class="fg-steps" id="fg-steps">
          <li><i style="--c:#7fd8e8"></i><b>Ner</b> Väj för fisken — varje fisk du slipper förbi höjer multiplikatorn.</li>
          <li><i style="--c:#f2c14e"></i><b>Upp</b> Nu gäller tvärtom: fånga allt på vägen upp.</li>
          <li><i style="--c:#5eead4"></i><b>I luften</b> ${tapWord} på fångsten så åker den i tunnan — dubbla poäng.</li>
        </ul>
        <div class="pb-scoreline" id="fg-scoreline" hidden></div>
        <div class="fi-stars" id="fi-stars" hidden></div>
        <div class="fi-haul" id="fi-haul" hidden></div>
        <div class="fg-catchlist" id="fg-catchlist" hidden></div>
        <div class="fi-actions">
          <button class="pb-btn" id="fg-start">Kasta i!</button>
          <button class="fi-btn-ghost" id="fi-book-open">${BOOK_ICON}<span>Fångstdagbok</span><b id="fi-book-count">0/6</b></button>
        </div>
        ${touch ? '' : '<p class="fi-keys"><kbd>Mellanslag</kbd> kastar i · <kbd>←</kbd><kbd>→</kbd> styr · <kbd>?</kbd> regler</p>'}
      </div>
    </div>

    <div class="fi-book" id="fi-book" hidden>
      <div class="fi-book-card" role="dialog" aria-label="Fångstdagbok">
        <h3>Fångstdagbok</h3>
        <p class="fi-book-sub" id="fi-book-sub"></p>
        <ul class="fi-book-list" id="fi-book-list"></ul>
        <div class="fi-book-records" id="fi-book-records"></div>
        <button class="pb-btn" id="fi-book-close">Tillbaka till sjön</button>
      </div>
    </div>

    <button class="pb-info" id="fg-info" aria-label="Så spelar du">?</button>

    <div class="pb-help" id="fg-help" hidden>
      <div class="pb-help-card">
        <h3>Så fiskar du</h3>
        <p class="pb-help-sub">Pekkas Fiske</p>
        <ul class="pb-help-list">
          <li><i style="--c:#7fd8e8"></i><b>Nedåt — väj</b> Slipp förbi fisken: varje fisk du väjer för höjer multiplikatorn, och en riktigt snäv passering ger extra. Nuddar du en fisk krokas den direkt.</li>
          <li><i style="--c:#8b93ad"></i><b>Skräp</b> Stövlar, burkar och cykeldäck bränner kastet och nollar multiplikatorn.</li>
          <li><i style="--c:#f2c14e"></i><b>Uppåt — träffa</b> Nu gäller tvärtom: fånga allt på vägen upp. Fiskar i snabb följd blir dubbelnapp, trippelnapp …</li>
          <li><i style="--c:#5eead4"></i><b>I luften — tryck</b> Tryck på fisken innan den plumsar i: i tunnan för dubbelt. Den sista fisken faller i slow motion. Tar du alla: PERFEKT KAST.</li>
          <li><i style="--c:#ffb86b"></i><b>Uppdrag</b> Varje kast har ett uppdrag — klara det för bonus och en stjärna.</li>
          <li><i style="--c:#6f9b5a"></i><b>Djupet</b> Mört och abborre nära ytan, sik från 12 m, gädda från 18 m, lax från 30 m. Djupmätaren till höger visar var de simmar.</li>
          <li><i style="--c:#ffd166"></i><b>PEKKAGÄDDAN</b> 5 000 poäng, guldkrönt, simmar på 50+ meter. Inte alltid hemma.</li>
        </ul>
        <p class="pb-help-tip">Botten på 60 m utan att nudda något ger bottenkänning: stor bonus och full multiplikator.</p>
        <div class="pb-help-keys">Styr draget: dra med fingret/musen eller ←/→ · Tre kast per omgång</div>
        <button class="pb-btn" id="fg-help-close">Tillbaka till sjön</button>
      </div>
    </div>

    <button class="pb-mute" id="fg-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  return {
    root,
    flash: q('#fi-flash'),
    score: q('#fg-score'), hi: q('#fg-hi'), depth: q('#fg-depth'), casts: q('#fi-casts'),
    mission: q('#fi-mission'), missionText: q('#fi-mission-text'), missionBonus: q('#fi-mission-bonus'),
    mult: q('#fg-mult'),
    gauge: q('#fi-gauge'), gaugeLure: q('#fi-gauge-lure'), gaugeDeep: q('#fi-gauge-deep'),
    zone: q('#fi-zone'), zoneDepth: q('#fi-zone-depth'), zoneName: q('#fi-zone-name'), zoneSub: q('#fi-zone-sub'),
    phase: q('#fg-phase'), toast: q('#fg-toast'), pops: q('#fg-pops'),
    announce: q('#fi-announce'), announceBig: q('#fi-announce-big'), announceSub: q('#fi-announce-sub'),
    hint: q('#fi-hint'),
    tunna: q('#fi-tunna'), tunnaN: q('#fi-tunna-n'),
    round: q('#fg-round'), roundKicker: q('#fg-round-kicker'), roundNo: q('#fg-round-no'),
    roundHaul: q('#fg-round-haul'), roundMission: q('#fi-round-mission'), roundNext: q('#fi-round-next'),
    overlay: q('#fg-overlay'), kicker: q('#fi-kicker'), title: q('#fg-title'), text: q('#fg-text'),
    steps: q('#fg-steps'), scoreline: q('#fg-scoreline'), stars: q('#fi-stars'), haul: q('#fi-haul'),
    catchlist: q('#fg-catchlist'),
    start: q('#fg-start'), bookOpen: q('#fi-book-open'), bookCount: q('#fi-book-count'),
    book: q('#fi-book'), bookSub: q('#fi-book-sub'), bookList: q('#fi-book-list'),
    bookRecords: q('#fi-book-records'), bookClose: q('#fi-book-close'),
    mute: q('#fg-mute'), info: q('#fg-info'), help: q('#fg-help'), helpClose: q('#fg-help-close')
  };
}

/** Restart a CSS animation on an element by toggling a class. */
export function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The fångstdagbok: one row per species, silhouettes for the unknown. */
export function renderBook(hud, progress, species, svg, fmt, fmtKg) {
  const known = species.filter((sp) => progress.log[sp.id]).length;
  const total = species.reduce((n, sp) => n + (progress.log[sp.id] ? progress.log[sp.id].n : 0), 0);
  hud.bookSub.textContent = `${known} av ${species.length} arter · ${fmt(total)} ${total === 1 ? 'fisk' : 'fiskar'} totalt`;
  hud.bookList.innerHTML = species.map((sp) => {
    const e = progress.log[sp.id];
    if (!e) {
      return `<li class="unknown">${svg(sp, false)}<div><b>${sp.rare ? '???' : 'Okänd art'}</b>
        <span>Simmar på ${sp.min}–${sp.max} m${sp.rare ? ' — om hon är hemma' : ''}</span></div></li>`;
    }
    return `<li${sp.rare ? ' class="rare"' : ''}>${svg(sp, true)}<div><b>${esc(sp.name)}</b>
      <span>${esc(sp.blurb)}</span>
      <em>×${fmt(e.n)} · största ${fmtKg(e.best)} · ${fmt(sp.pts)} p</em></div></li>`;
  }).join('');
  const rec = [];
  rec.push(`<span><small>Rekord</small>${fmt(progress.high)}</span>`);
  rec.push(`<span><small>Bästa kast</small>${fmt(progress.bestCast)}</span>`);
  rec.push(`<span><small>Djupast</small>${Math.round(progress.deepest)} m</span>`);
  rec.push(`<span><small>Stjärnor</small>${fmt(progress.stars)}</span>`);
  hud.bookRecords.innerHTML = rec.join('') +
    (progress.pokal ? '<p class="fi-book-find">Fynd: en pokal på sextio meters djup. Ingen vet hur den hamnade där.</p>' : '');
  hud.bookCount.textContent = `${known}/${species.length}`;
}
