/**
 * Pekkas Måleri — the HUD and the salon cards.
 *
 * Markup only: index.js owns the state and fills these in. Everything is
 * under .pm-ui and styled in style.css, so the game does not lean on the
 * shared pb-/fg- classes beyond the ones every game shares (the help card,
 * the ? and mute buttons, the canvas host).
 *
 * Two layouts from one tree. On a wide screen the reference hangs to the
 * left of the easel and the palette stands to its right, the way you would
 * set up in a garden; on a phone the palette is a sheet at the bottom with
 * the reference as a thumbnail in it, and the easel gets the whole top.
 */

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Swedish decimal comma: 8,7. */
export const grade1 = (g) => g.toFixed(1).replace('.', ',');

export const fmt = (n) => Math.round(n).toLocaleString('sv-SE');

export function starsHtml(n, cls = '') {
  return `<span class="pm-stars ${cls}" aria-label="${n} av 3 stjärnor">${[0, 1, 2]
    .map((i) => `<i class="${i < n ? 'on' : ''}" style="--i:${i}">★</i>`).join('')}</span>`;
}

export function buildHud(root) {
  root.innerHTML = `
    <div class="pm-vignette"></div>

    <header class="pm-top">
      <div class="pm-scorebox">
        <div class="pm-score" id="pm-score">0</div>
        <div class="pm-hi">REKORD <span id="pm-hi">0</span></div>
        <div class="pm-streak" id="pm-streak"></div>
      </div>
      <div class="pm-clockbox">
        <div class="pm-clock" id="pm-clock">
          <svg viewBox="0 0 44 44" aria-hidden="true"><circle class="pm-clock-track" cx="22" cy="22" r="19"/><circle class="pm-clock-arc" id="pm-clock-arc" cx="22" cy="22" r="19"/></svg>
          <span id="pm-time">1:35</span>
        </div>
        <div class="pm-work" id="pm-work"></div>
      </div>
    </header>

    <aside class="pm-ref" id="pm-ref">
      <div class="pm-ref-kicker">FÖRLAGA</div>
      <div class="pm-ref-frame"><canvas id="pm-ref-cv"></canvas><canvas class="pm-ref-sel" id="pm-ref-sel"></canvas></div>
      <div class="pm-ref-label"><b id="pm-ref-title"></b><span id="pm-ref-artist"></span></div>
      <div class="pm-dots" id="pm-dots"></div>
    </aside>

    <section class="pm-panel" id="pm-panel">
      <div class="pm-mixrow">
        <button class="pm-ref-mini" id="pm-ref-mini" aria-label="Visa förlagan större">
          <canvas id="pm-mini-cv"></canvas><canvas class="pm-ref-sel" id="pm-mini-sel"></canvas>
        </button>
        <div class="pm-chip" id="pm-chip">
          <i class="pm-chip-target" id="pm-target"></i><i class="pm-chip-mix" id="pm-mixed"></i>
          <span class="pm-chip-l">MÅL</span><span class="pm-chip-r">DIN</span>
        </div>
        <div class="pm-mixinfo">
          <div class="pm-region"><b id="pm-region">Välj en yta</b><span id="pm-count"></span></div>
          <div class="pm-meter" id="pm-meter">
            <div class="pm-meter-zone"></div>
            <i class="pm-meter-fill" id="pm-meter-fill"></i>
            <i class="pm-meter-mark" id="pm-meter-mark"></i>
          </div>
          <div class="pm-hint"><span id="pm-hint">Tryck på pigmenten för att blanda</span><em class="pm-delta" id="pm-delta"></em></div>
        </div>
      </div>
      <div class="pm-palette-wrap">
        <canvas class="pm-palette" id="pm-palette" aria-label="Paletten: tryck på ett pigment för att lägga i en droppe"></canvas>
        <div class="pm-keys" aria-hidden="true">1 Krapplack · 2 Kadmiumgul · 3 Ultramarin · 4 Titanvit · 5 Benswart</div>
      </div>
      <div class="pm-actions">
        <button class="pm-btn pm-btn-ghost pm-undo" id="pm-undo" aria-label="Ångra senaste droppen" title="Ångra (Z)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
        </button>
        <button class="pm-btn pm-btn-ghost" id="pm-wipe" title="Torka paletten (W)">TORKA</button>
        <button class="pm-btn pm-btn-paint" id="pm-apply" title="Måla ytan (mellanslag)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8l-3-3Z"/><path d="M9 11.8c-2.2-.2-4.6 1.2-4.9 4.4-.2 1.9-1.2 3-3.1 3.8 4.2 1.2 8.9-.1 10.9-3.2"/></svg>
          <span>MÅLA</span>
        </button>
      </div>
    </section>

    <div class="pm-callout" id="pm-callout"></div>
    <div class="pm-toast" id="pm-toast"></div>
    <div class="pm-pops" id="pm-pops"></div>

    <div class="pm-overlay" id="pm-overlay">
      <div class="pm-card pm-start" data-card="start">
        <div class="pm-kicker">Terrassvägen 47 · Örnsköldsvik · 7 augusti 2021</div>
        <h2 class="pm-title">Pekkas Måleri</h2>
        <p class="pm-lede">Dra en lapp ur hatten, måla av mästerverket vid staffliet i trädgården — och låt kulturprofilen Mikael Hägglund döma.</p>
        <ol class="pm-steps">
          <li><b>Välj yta</b><span>Tryck på ett fält i tavlan. Målfärgen visas bredvid din.</span></li>
          <li><b>Blanda</b><span>Droppa pigment på paletten. Rött, gult och blått blandas som riktig färg — vitt ljusar, svart mörkar.</span></li>
          <li><b>Måla</b><span>Varmare eller kallare? Följ mätaren. Pricka färgen i rad för svit-bonus.</span></li>
        </ol>
        <div class="pm-bests" id="pm-bests"></div>
        <div class="pm-cta">
          <button class="pm-btn pm-btn-gold" id="pm-start">Dra en lapp ur hatten</button>
          <button class="pm-btn pm-btn-ghost" id="pm-open-gallery">Galleriet <span id="pm-gallery-n"></span></button>
        </div>
      </div>

      <div class="pm-card pm-slip" data-card="slip">
        <div class="pm-slip-paper">
          <div class="pm-slip-from">Ur hatten</div>
          <div class="pm-slip-artist" id="pm-slip-artist"></div>
          <div class="pm-slip-title" id="pm-slip-title"></div>
          <div class="pm-slip-note" id="pm-slip-note"></div>
          <div class="pm-slip-best" id="pm-slip-best"></div>
        </div>
        <div class="pm-slip-go">Tryck för att börja måla</div>
      </div>

      <div class="pm-card pm-reveal" data-card="reveal">
        <div class="pm-kicker">Mikael Hägglunds dom · verk <span id="pm-rv-no"></span></div>
        <h2 class="pm-title pm-rv-title" id="pm-rv-title"></h2>
        <div class="pm-diptych">
          <figure><div class="pm-gilt" id="pm-rv-yours"></div><figcaption>Din tolkning</figcaption></figure>
          <figure><div class="pm-gilt" id="pm-rv-orig"></div><figcaption id="pm-rv-orig-cap"></figcaption></figure>
        </div>
        <div class="pm-grade-row">
          <div class="pm-grade"><b id="pm-rv-grade">0,0</b><small>/10</small></div>
          <div id="pm-rv-stars"></div>
          <div class="pm-pb" id="pm-rv-pb" hidden>Personbästa!</div>
        </div>
        <blockquote class="pm-quote"><p id="pm-rv-quote"></p><cite>— Mikael Hägglund</cite></blockquote>
        <div class="pm-swatches" id="pm-rv-chips"></div>
        <div class="pm-stats" id="pm-rv-stats"></div>
        <button class="pm-btn pm-btn-gold" id="pm-rv-next">Dra nästa lapp</button>
      </div>

      <div class="pm-card pm-final" data-card="final">
        <div class="pm-kicker">Kvällens utställning · Terrassvägen 47</div>
        <h2 class="pm-title" id="pm-fn-title"></h2>
        <p class="pm-lede" id="pm-fn-text"></p>
        <div class="pm-wall" id="pm-fn-wall"></div>
        <div class="pm-total"><b id="pm-fn-score">0</b><small id="pm-fn-sub"></small></div>
        <div class="pm-cta">
          <button class="pm-btn pm-btn-gold" id="pm-again">Måla igen</button>
          <button class="pm-btn pm-btn-ghost" id="pm-fn-gallery">Galleriet</button>
        </div>
      </div>

      <div class="pm-card pm-gallery" data-card="gallery">
        <div class="pm-kicker">Sparat på den här enheten</div>
        <h2 class="pm-title">Ditt galleri</h2>
        <div class="pm-gallery-grid" id="pm-gallery-grid"></div>
        <div class="pm-cta"><button class="pm-btn pm-btn-ghost" id="pm-gallery-back">Tillbaka</button></div>
      </div>

      <div class="pm-card pm-zoom" data-card="zoom">
        <div class="pm-gilt" id="pm-zoom-img"></div>
        <div class="pm-zoom-cap" id="pm-zoom-cap"></div>
        <div class="pm-cta"><button class="pm-btn pm-btn-ghost" id="pm-zoom-close">Stäng</button></div>
      </div>
    </div>

    <button class="pb-info pm-info" id="pm-info" aria-label="Så spelar du">?</button>

    <div class="pb-help" id="pm-help" hidden>
      <div class="pb-help-card">
        <h3>Så målar du</h3>
        <p class="pb-help-sub">Pekkas Måleri · Terrassvägen 47, 2021</p>
        <ul class="pb-help-list">
          <li><i style="--c:#7fd8e8"></i><b>Ytorna</b> Tavlan är uppdelad i färgfält. Tryck på ett fält för att välja det — målfärgen syns till vänster i färgcirkeln, din blandning till höger.</li>
          <li><i style="--c:#f2c14e"></i><b>Paletten</b> Fem pigment. Rött + gult = orange, gult + blått = grönt, rött + blått = lila — subtraktivt, som riktig färg. Vitt ljusar, svart mörkar. Tryck på en klick du redan målat med för att blanda om den.</li>
          <li><i style="--c:#5eead4"></i><b>Mätaren</b> Varmare eller kallare för varje droppe, och vad som är fel: för ljus, för grå, fel kulör. Står du still länge pekar paletten ut nästa droppe.</li>
          <li><i style="--c:#a78bfa"></i><b>Torka och ångra</b> TORKA skrapar paletten ren. Pilen tar bort senaste droppen.</li>
          <li><i style="--c:#f26d8d"></i><b>Svit</b> Pricka färgen (grön mätare) flera ytor i rad så växer multiplikatorn. Varje yta målas bara en gång.</li>
          <li><i style="--c:#ffd166"></i><b>Domen</b> 95 sekunder per verk, tre verk per kväll. Mikael Hägglund sätter betyg 1–10 och upp till tre stjärnor. Ditt bästa per verk och dina målningar sparas på enheten.</li>
        </ul>
        <p class="pb-help-tip">Skriet av Munch ligger alltid i hatten — det var verket som faktiskt vann 2021, Olov Melanders tolkning.</p>
        <div class="pb-help-keys">1–5 pigment · mellanslag målar · W torkar · Z ångrar · ←/→ byter yta</div>
        <button class="pb-btn" id="pm-help-close">Tillbaka till staffliet</button>
      </div>
    </div>

    <button class="pb-mute" id="pm-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  const hud = {
    root,
    score: q('#pm-score'), hi: q('#pm-hi'), streak: q('#pm-streak'),
    clock: q('#pm-clock'), clockArc: q('#pm-clock-arc'), time: q('#pm-time'), work: q('#pm-work'),
    ref: q('#pm-ref'), refCv: q('#pm-ref-cv'), refSel: q('#pm-ref-sel'),
    refTitle: q('#pm-ref-title'), refArtist: q('#pm-ref-artist'), dots: q('#pm-dots'),
    panel: q('#pm-panel'), mini: q('#pm-ref-mini'), miniCv: q('#pm-mini-cv'), miniSel: q('#pm-mini-sel'),
    chip: q('#pm-chip'), target: q('#pm-target'), mixed: q('#pm-mixed'),
    region: q('#pm-region'), count: q('#pm-count'),
    meter: q('#pm-meter'), meterFill: q('#pm-meter-fill'), meterMark: q('#pm-meter-mark'),
    hint: q('#pm-hint'), delta: q('#pm-delta'),
    palette: q('#pm-palette'),
    undo: q('#pm-undo'), wipe: q('#pm-wipe'), apply: q('#pm-apply'),
    callout: q('#pm-callout'), toast: q('#pm-toast'), pops: q('#pm-pops'),
    overlay: q('#pm-overlay'),
    bests: q('#pm-bests'), start: q('#pm-start'), openGallery: q('#pm-open-gallery'), galleryN: q('#pm-gallery-n'),
    slipArtist: q('#pm-slip-artist'), slipTitle: q('#pm-slip-title'), slipNote: q('#pm-slip-note'), slipBest: q('#pm-slip-best'),
    rvNo: q('#pm-rv-no'), rvTitle: q('#pm-rv-title'), rvYours: q('#pm-rv-yours'), rvOrig: q('#pm-rv-orig'),
    rvOrigCap: q('#pm-rv-orig-cap'), rvGrade: q('#pm-rv-grade'), rvStars: q('#pm-rv-stars'), rvPb: q('#pm-rv-pb'),
    rvQuote: q('#pm-rv-quote'), rvChips: q('#pm-rv-chips'), rvStats: q('#pm-rv-stats'), rvNext: q('#pm-rv-next'),
    fnTitle: q('#pm-fn-title'), fnText: q('#pm-fn-text'), fnWall: q('#pm-fn-wall'), fnScore: q('#pm-fn-score'),
    fnSub: q('#pm-fn-sub'), again: q('#pm-again'), fnGallery: q('#pm-fn-gallery'),
    galleryGrid: q('#pm-gallery-grid'), galleryBack: q('#pm-gallery-back'),
    zoomImg: q('#pm-zoom-img'), zoomCap: q('#pm-zoom-cap'), zoomClose: q('#pm-zoom-close'),
    info: q('#pm-info'), help: q('#pm-help'), helpClose: q('#pm-help-close'), mute: q('#pm-mute')
  };

  /** Show one salon card (or none). */
  hud.showCard = (name) => {
    root.querySelectorAll('.pm-card').forEach((c) => c.classList.toggle('show', c.dataset.card === name));
    hud.overlay.classList.toggle('show', !!name);
    hud.overlay.dataset.card = name || '';
    if (name) {
      const card = root.querySelector(`.pm-card[data-card="${name}"]`);
      if (card) card.scrollTop = 0;
    }
  };
  return hud;
}
