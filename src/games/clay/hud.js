/**
 * Pekkas Lerskulptur — the HUD.
 *
 * Built on the site's shared pb-* pieces (score, toast, help card, mute and
 * info buttons) and styled by this game's own style.css under .lr-ui. The
 * layout answers to the stage's shape: on a wide screen the task card with
 * the live silhouette diff sits on the left of the wheel and the verdict
 * card on the right of the glazed piece; on a phone both become compact
 * cards above and below it.
 */

import { N, H, R_MAX } from './clay.js';

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';

/** n of 3 stars as markup; `cls` lets the verdict card animate them in. */
export function starsHtml(n, cls = '') {
  let s = '';
  for (let i = 0; i < 3; i++) s += `<i class="lr-star${i < n ? ' on' : ''} ${cls}">${STAR}</i>`;
  return s;
}

export function buildHud(root) {
  root.innerHTML = `
    <div class="lr-vignette"></div>
    <div class="lr-hud">
      <div class="lr-top">
        <div class="lr-score-wrap">
          <div class="pb-score" id="lr-score">0</div>
          <div class="pb-hi">REKORD <span id="lr-hi">0</span></div>
        </div>
        <div class="lr-chips" id="lr-chips"></div>
        <div class="lr-timer" id="lr-timer"></div>
      </div>

      <div class="lr-task" id="lr-task">
        <div class="lr-task-head">
          <div class="lr-kicker" id="lr-kicker">UPPDRAG 1/3</div>
          <div class="lr-task-name" id="lr-name"></div>
          <div class="lr-task-brief" id="lr-brief"></div>
        </div>
        <canvas class="lr-diff" id="lr-diff" width="200" height="150"></canvas>
        <div class="lr-legend"><span class="push">tryck in</span><span class="pull">dra ut</span></div>
        <div class="lr-best" id="lr-best"></div>
      </div>

      <div class="lr-meter" id="lr-meter">
        <div class="lr-meter-bar">
          <i id="lr-meter-fill"></i>
          <span class="lr-tick" style="left:60%"></span>
          <span class="lr-tick" style="left:78%"></span>
          <span class="lr-tick" style="left:90%"></span>
        </div>
        <div class="lr-meter-row">
          <span class="lr-meter-label">LIKHET</span>
          <b id="lr-meter-val">0%</b>
          <span class="lr-meter-stars" id="lr-meter-stars">${starsHtml(0)}</span>
        </div>
      </div>

      <div class="lr-phase" id="lr-phase"></div>
      <div class="pb-toast" id="lr-toast"></div>

      <div class="lr-temp" id="lr-temp">
        <span class="lr-temp-label" id="lr-temp-label">Ugnen</span>
        <b id="lr-temp-val">20</b><small>°C</small>
      </div>

      <div class="lr-coach" id="lr-coach"></div>
      <div class="lr-tools" id="lr-tools">
        <button class="lr-tool" id="lr-smooth"><span>GLÄTTA</span><small id="lr-smooth-key">håll</small></button>
        <button class="lr-tool primary" id="lr-done"><span>KLAR — BRÄNN!</span><small id="lr-done-key"></small></button>
      </div>
      <div class="lr-skip" id="lr-skip">Tryck för att snabbspola</div>
    </div>

    <div class="lr-card lr-verdict" id="lr-verdict">
      <div class="lr-kicker" id="lr-v-kicker"></div>
      <h3 id="lr-v-name"></h3>
      <div class="lr-grade"><b id="lr-v-grade">0</b><small>/10</small></div>
      <div class="lr-stars-big" id="lr-v-stars"></div>
      <blockquote id="lr-v-words"></blockquote>
      <div class="lr-lines" id="lr-v-lines"></div>
      <div class="lr-badge" id="lr-v-badge" hidden></div>
      <button class="pb-btn" id="lr-next">Nästa alster</button>
    </div>

    <div class="pb-overlay lr-overlay" id="lr-overlay">
      <div class="pb-panel lr-panel" id="lr-panel"></div>
    </div>

    <button class="pb-info" id="lr-info" aria-label="Så spelar du">?</button>

    <div class="pb-help" id="lr-help" hidden>
      <div class="pb-help-card">
        <h3>Så drejar du</h3>
        <p class="pb-help-sub">Pekkas Lerskulptur</p>
        <ul class="pb-help-list">
          <li><i style="--c:#5eead4"></i><b>Uppdraget</b> Keramikern visar en form — dess silhuett hänger som streckat spöke över drejskivan. Det färgade bandet visar skillnaden: varmt där leran ska tryckas in, kallt där den ska dras ut.</li>
          <li><i style="--c:#d9a05b"></i><b>Forma</b> Dra mot leran för att trycka in, dra utåt för att dra ut — vid precis den höjd du rör. Ryck inte: drar du för hårt slår leran och blir ojämn.</li>
          <li><i style="--c:#f2c14e"></i><b>Glätta</b> Håll GLÄTTA (eller G) så jämnar svampen ut kurvorna och drejränderna.</li>
          <li><i style="--c:#ff7a6b"></i><b>Tiden</b> 75 sekunder per alster. Går tiden ut åker det in i ugnen som det är.</li>
          <li><i style="--c:#8fe3f2"></i><b>Bränn</b> Tryck KLAR när du är nöjd. Ugnen, glasyren, betyg 1–10 och keramikerns dom — sen ställs alstret i fönstret.</li>
          <li><i style="--c:#f6d27a"></i><b>Stjärnor</b> 60 % likhet ger en stjärna, 78 % två och 90 % tre. Sex stjärnor på kvällens tre alster låser upp en sista utmaning.</li>
          <li><i style="--c:#6f9b5a"></i><b>Poängen</b> Likhet i kvadrat × 1 000, plus tidsbonus om likheten når 60 %.</li>
        </ul>
        <p class="pb-help-tip">Snabb och lik vinner: en tidig 90-procentare slår en sen perfektionist.</p>
        <div class="pb-help-keys">Forma: dra på skivan · Glätta: håll G · Bränn: KLAR eller Enter · Kortet: ? eller Esc</div>
        <button class="pb-btn" id="lr-help-close">Tillbaka till ateljén</button>
      </div>
    </div>

    <button class="pb-mute" id="lr-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  return {
    root,
    score: q('#lr-score'), hi: q('#lr-hi'), chips: q('#lr-chips'), timer: q('#lr-timer'),
    task: q('#lr-task'), kicker: q('#lr-kicker'), name: q('#lr-name'), brief: q('#lr-brief'),
    diff: q('#lr-diff'), best: q('#lr-best'),
    meter: q('#lr-meter'), meterFill: q('#lr-meter-fill'), meterVal: q('#lr-meter-val'), meterStars: q('#lr-meter-stars'),
    phase: q('#lr-phase'), toast: q('#lr-toast'),
    temp: q('#lr-temp'), tempVal: q('#lr-temp-val'), tempLabel: q('#lr-temp-label'),
    tools: q('#lr-tools'), smooth: q('#lr-smooth'), done: q('#lr-done'), skip: q('#lr-skip'),
    coach: q('#lr-coach'), smoothKey: q('#lr-smooth-key'), doneKey: q('#lr-done-key'),
    verdict: q('#lr-verdict'), vKicker: q('#lr-v-kicker'), vName: q('#lr-v-name'), vGrade: q('#lr-v-grade'),
    vStars: q('#lr-v-stars'), vWords: q('#lr-v-words'), vLines: q('#lr-v-lines'), vBadge: q('#lr-v-badge'),
    next: q('#lr-next'),
    overlay: q('#lr-overlay'), panel: q('#lr-panel'),
    info: q('#lr-info'), help: q('#lr-help'), helpClose: q('#lr-help-close'), mute: q('#lr-mute')
  };
}

/** Size a canvas for crisp drawing at the device pixel ratio. */
export function fitCanvas(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cv.clientWidth * dpr));
  const h = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return { w, h, dpr };
}

/**
 * Silhouette diff for the task card: the target filled in teal, your wall
 * outlined in cream, and the gap between them painted warm (too much clay)
 * or cool (too little). `r` may be null to draw the target alone.
 */
export function drawDiff(cv, profile, r) {
  const ctx = cv.getContext('2d');
  const { w, h, dpr } = fitCanvas(cv);
  const pad = 4 * dpr;
  const s = Math.min((w / 2 - pad) / R_MAX, (h - pad * 2) / (H + 0.1));
  const cx = w / 2;
  const base = h - pad;
  const X = (rad, side) => cx + side * rad * s;
  const Y = (u) => base - u * H * s;
  ctx.clearRect(0, 0, w, h);

  // Wheel line
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(cx - 0.95 * s, base, 1.9 * s, Math.max(1, dpr));

  // Target body
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) ctx.lineTo(X(profile(i / 40), -1), Y(i / 40));
  for (let i = 40; i >= 0; i--) ctx.lineTo(X(profile(i / 40), 1), Y(i / 40));
  ctx.closePath();
  ctx.fillStyle = 'rgba(94,234,212,0.16)';
  ctx.fill();
  ctx.setLineDash([4 * dpr, 3 * dpr]);
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = 'rgba(94,234,212,0.9)';
  ctx.stroke();
  ctx.setLineDash([]);
  if (!r) return;

  // The gap, row by row
  for (let j = 0; j < N - 1; j++) {
    const u0 = j / (N - 1);
    const u1 = (j + 1) / (N - 1);
    const d = (r[j] + r[j + 1]) / 2 - (profile(u0) + profile(u1)) / 2;
    if (Math.abs(d) < 0.035) continue;
    const a = Math.min(0.75, (Math.abs(d) - 0.035) * 5 + 0.2);
    ctx.fillStyle = d > 0 ? `rgba(255,107,61,${a})` : `rgba(90,200,255,${a})`;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(X(r[j], side), Y(u0));
      ctx.lineTo(X(r[j + 1], side), Y(u1));
      ctx.lineTo(X(profile(u1), side), Y(u1));
      ctx.lineTo(X(profile(u0), side), Y(u0));
      ctx.closePath();
      ctx.fill();
    });
  }

  // Your wall
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = 'rgba(255,236,214,0.95)';
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    for (let j = 0; j < N; j++) ctx.lineTo(X(r[j], side), Y(j / (N - 1)));
    ctx.stroke();
  });
}

/** A small solid silhouette (start screen, summary, chips). */
export function silhouetteSvg(profile, color = '#5eead4', w = 44, h = 40) {
  const s = Math.min((w / 2 - 2) / R_MAX, (h - 4) / H);
  let d = '';
  for (let i = 0; i <= 24; i++) d += `${i ? 'L' : 'M'}${(w / 2 - profile(i / 24) * s).toFixed(1)} ${(h - 2 - (i / 24) * H * s).toFixed(1)}`;
  for (let i = 24; i >= 0; i--) d += `L${(w / 2 + profile(i / 24) * s).toFixed(1)} ${(h - 2 - (i / 24) * H * s).toFixed(1)}`;
  return `<svg class="lr-sil" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}Z" fill="${color}"/></svg>`;
}
