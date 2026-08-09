/**
 * Pekkas Måleri — the 2021 competition as a Three.js painting game.
 *
 * The real thing, from Olov Melander's winner's story: on 7 August 2021 in
 * the garden at Terrassvägen 47 in Örnsköldsvik, everyone drew a slip from
 * a hat with an artist and a famous painting on it, and had a couple of
 * hours to replicate it on an easel. Mikael Hägglund was brought in as the
 * culture profile to judge, and gave it to Munch's Skriet — Olov's — for
 * "capturing the essence of Munch's masterpiece". Per Vikman and Henrik
 * Lundqvist arranged; the dress code was high-culture profile, and Per
 * Olsson turned up as the ceramicist Hans Hedberg in a red beret.
 *
 * The game keeps the ritual — hat, slip, easel, verdict — and makes the
 * verb the one thing that actually decides whether a copy reads as the
 * original: COLOUR. You mix each colour from red, yellow, blue, white and
 * black on a real subtractive palette, then lay it down. Get the hue and
 * value right and Hägglund is kind. Get them wrong and he is not.
 */

import * as THREE from 'three';
import { Sfx } from './audio.js';
import { mulberry, buildGarden, buildEasel, buildPainter, buildPalette } from './garden.js';
import {
  ARTWORKS, mixPigments, colourDistance, hexToRgb, rgbToCss,
  paintReference, paintPlayer, paintIdMap
} from './artworks.js';

const HIGHSCORE_KEY = 'pp-maleri-highscore';
const WORKS_PER_GAME = 3;
const ROUND_SECONDS = 75;

/** The pigments on the palette, in the order they sit around the rim. */
const PIGMENTS = [
  { key: 'r', name: 'Krapplack', css: '#c0242c' },
  { key: 'y', name: 'Kadmiumgul', css: '#e8b419' },
  { key: 'b', name: 'Ultramarin', css: '#22459b' },
  { key: 'w', name: 'Titanvit', css: '#f4f2ea' },
  { key: 'k', name: 'Benswart', css: '#1b1815' }
];

/**
 * Mikael Hägglund's verdicts, by grade. He was invited as the culture
 * profile and took the job seriously enough to motivate the winner.
 */
const VERDICTS = [
  { at: 9.0, say: 'Du har fångat essensen. Precis så motiverade jag segraren 2021.' },
  { at: 7.5, say: 'Stark tolkning. Färgerna sitter där de ska.' },
  { at: 6.0, say: 'Godkänt. Lite grumligt i mellantonerna, men jag ser vad du menar.' },
  { at: 4.5, say: 'Jag känner igen motivet. Paletten är en annan historia.' },
  { at: 3.0, say: 'Modigt. Fel, men modigt.' },
  { at: 0, say: 'Det här är inte konst. Det är en olycka i en färghandel.' }
];

/**
 * Frame delta, clamped at BOTH ends. Only clamping the top looks harmless
 * until a queued rAF fires with a timestamp older than the one stashed on
 * visibilitychange: dt goes negative and every countdown runs backwards.
 */
function clampDt(ms) {
  return Math.max(0, Math.min(0.05, ms / 1000));
}

/* ------------------------------------------------------------------- HUD */

function buildHud(root) {
  root.innerHTML = `
    <div class="fg-vignette"></div>
    <div class="pb-hud">
      <div class="pb-top">
        <div class="pb-score-wrap">
          <div class="pb-score" id="ml-score">0</div>
          <div class="pb-hi">REKORD <span id="ml-hi">0</span></div>
        </div>
        <div class="pb-meta">
          <div class="fg-depth" id="ml-time">1:15</div>
          <div class="fg-cast" id="ml-work"></div>
        </div>
      </div>
      <div class="fk-opponent" id="ml-title"></div>
      <div class="ml-ref" id="ml-ref" hidden><span>FÖRLAGA</span></div>
      <div class="fg-zone" id="ml-callout"></div>
      <div class="fg-phase" id="ml-phase"></div>
      <div class="pb-toast" id="ml-toast"></div>
      <div class="fg-pops" id="ml-pops"></div>

      <div class="ml-mix" id="ml-mix" hidden>
        <div class="ml-region" id="ml-region">Välj en yta</div>
        <div class="ml-swatches">
          <div class="ml-swatch"><i id="ml-target"></i><span>MÅL</span></div>
          <div class="ml-swatch"><i id="ml-mixed"></i><span>DIN</span></div>
        </div>
        <div class="ml-meter"><i id="ml-meter-fill"></i></div>
      </div>

      <div class="ml-pigments" id="ml-pigments" hidden></div>

      <div class="cl-tools show" id="ml-tools" hidden>
        <button class="cl-tool" id="ml-wipe">TORKA</button>
        <button class="cl-tool primary" id="ml-apply">MÅLA</button>
      </div>
    </div>

    <div class="pb-overlay" id="ml-overlay">
      <div class="pb-panel">
        <h2 id="ml-otitle">Pekkas Måleri</h2>
        <p id="ml-otext">Trädgården på Terrassvägen 47, 7 augusti 2021. Dra en lapp ur hatten, måla av mästerverket — och låt Mikael Hägglund döma.</p>
        <ul class="fg-steps" id="ml-steps">
          <li><i style="--c:#7fd8e8"></i><b>Välj yta</b> Tryck på en yta i tavlan. Målfärgen visas.</li>
          <li><i style="--c:#f2c14e"></i><b>Blanda</b> Tryck på pigmenten. Rött, gult och blått blandas som riktig färg — vitt ljusar upp, svart mörkar ner.</li>
          <li><i style="--c:#5eead4"></i><b>Måla</b> När mätaren är grön: tryck MÅLA. Ju närmare färgen, desto mer poäng.</li>
        </ul>
        <div class="pb-scoreline" id="ml-scoreline" hidden></div>
        <div class="fg-catchlist" id="ml-verdict" hidden></div>
        <button class="pb-btn" id="ml-start">Dra en lapp ur hatten</button>
      </div>
    </div>

    <button class="pb-info" id="ml-info" aria-label="Så spelar du">?</button>

    <div class="pb-help" id="ml-help" hidden>
      <div class="pb-help-card">
        <h3>Så målar du</h3>
        <p class="pb-help-sub">Pekkas Måleri · Terrassvägen 47, 2021</p>
        <ul class="pb-help-list">
          <li><i style="--c:#7fd8e8"></i><b>Ytorna</b> Tavlan är uppdelad i färgfält. Tryck på ett fält för att välja det — målfärgen dyker upp i rutan MÅL.</li>
          <li><i style="--c:#f2c14e"></i><b>Paletten</b> Fem pigment. Rött + gult = orange, gult + blått = grönt, rött + blått = lila — subtraktivt, som riktig färg. Vitt ljusar, svart mörkar.</li>
          <li><i style="--c:#5eead4"></i><b>Mätaren</b> Visar hur nära din blandning ligger målet. Grönt = träff.</li>
          <li><i style="--c:#a78bfa"></i><b>TORKA</b> Torkar paletten ren så du kan börja om på en ny färg.</li>
          <li><i style="--c:#f26d8d"></i><b>Tiden</b> 75 sekunder per verk. Ytor du inte hinner måla står kvar som bar duk och drar ner betyget.</li>
          <li><i style="--c:#ffd166"></i><b>Domen</b> Mikael Hägglund sätter betyg 1–10 på varje verk, precis som 2021.</li>
        </ul>
        <p class="pb-help-tip">Tre verk per kväll. Skriet av Munch är verket som faktiskt vann 2021 — Olov Melanders tolkning.</p>
        <div class="pb-help-keys">1–5 väljer pigment · mellanslag målar · W torkar paletten</div>
        <button class="pb-btn" id="ml-help-close">Tillbaka till staffliet</button>
      </div>
    </div>

    <button class="pb-mute" id="ml-mute" aria-label="Ljud på/av">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5Z"/><path class="pb-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>
      </svg>
    </button>
  `;
  const q = (s) => root.querySelector(s);
  return {
    score: q('#ml-score'), hi: q('#ml-hi'), time: q('#ml-time'), work: q('#ml-work'),
    title: q('#ml-title'), ref: q('#ml-ref'), callout: q('#ml-callout'), phase: q('#ml-phase'),
    toast: q('#ml-toast'), pops: q('#ml-pops'),
    mix: q('#ml-mix'), pigments: q('#ml-pigments'),
    target: q('#ml-target'), mixed: q('#ml-mixed'),
    meterFill: q('#ml-meter-fill'), region: q('#ml-region'),
    tools: q('#ml-tools'), wipe: q('#ml-wipe'), apply: q('#ml-apply'),
    overlay: q('#ml-overlay'), otitle: q('#ml-otitle'), otext: q('#ml-otext'),
    steps: q('#ml-steps'), scoreline: q('#ml-scoreline'), verdict: q('#ml-verdict'),
    start: q('#ml-start'), info: q('#ml-info'), help: q('#ml-help'),
    helpClose: q('#ml-help-close'), mute: q('#ml-mute')
  };
}

/* ------------------------------------------------------------------- game */

export async function createPainting(container) {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pb-canvas';
  container.appendChild(canvasHost);

  const hudHost = document.createElement('div');
  hudHost.className = 'pb-ui fg-ui';
  container.appendChild(hudHost);
  const hud = buildHud(hudHost);

  const sfx = new Sfx();
  const rand = mulberry(870);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9dc0d8);
  scene.fog = new THREE.Fog(0xa8c6da, 22, 62);

  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 90);
  camera.position.set(0, 1.95, 2.32);
  const lookAt = new THREE.Vector3(0, 1.42, -0.55);
  camera.lookAt(lookAt);

  /* Lights: one warm low sun casting everything, a cool sky fill, a bounce */
  scene.add(new THREE.HemisphereLight(0xbcd8f2, 0x4a5a30, 0.85));

  const sun = new THREE.DirectionalLight(0xfff0cf, 2.2);
  sun.position.set(-7, 9, 6);
  sun.target.position.set(0, 1, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -6;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const bounce = new THREE.DirectionalLight(0x9cb060, 0.32);
  bounce.position.set(2, -3, 4);
  scene.add(bounce);

  /* World */
  const garden = buildGarden();
  scene.add(garden.group);

  /* The player's canvas, as a texture on the easel */
  const CW = 700;
  const CH = 762;
  const artCv = document.createElement('canvas');
  artCv.width = CW;
  artCv.height = CH;
  const artCtx = artCv.getContext('2d');
  const artTex = new THREE.CanvasTexture(artCv);
  artTex.colorSpace = THREE.SRGBColorSpace;
  artTex.anisotropy = 8;
  const easel = buildEasel(new THREE.MeshLambertMaterial({ map: artTex }), 1.12, 1.22);
  easel.position.set(0, 0, -0.55);
  scene.add(easel);
  const artMesh = easel.userData.canvas;

  // The id-map lives offscreen: tapping the canvas reads a pixel from it
  // rather than doing point-in-polygon against curved paths.
  const idCv = document.createElement('canvas');
  idCv.width = CW;
  idCv.height = CH;
  const idCtx = idCv.getContext('2d', { willReadFrequently: true });

  /* The reference, pinned in the HUD like the phone everyone painted from */
  const refCv = document.createElement('canvas');
  refCv.width = 280;
  refCv.height = 305;
  refCv.className = 'ml-ref-canvas';
  const refCtx = refCv.getContext('2d');
  hud.ref.appendChild(refCv);

  /* The palette in the player's hands */
  const palCv = document.createElement('canvas');
  palCv.width = 640;
  palCv.height = 344;
  const palCtx = palCv.getContext('2d');
  const palTex = new THREE.CanvasTexture(palCv);
  palTex.colorSpace = THREE.SRGBColorSpace;
  const palette = buildPalette(new THREE.MeshBasicMaterial({ map: palTex, transparent: true }));
  palette.position.set(-0.72, 0.99, 0.86);
  palette.rotation.set(-0.9, 0.45, 0.14);
  palette.scale.setScalar(0.46);
  scene.add(palette);

  /* The others, at their own easels down the lawn */
  const FIELD = [
    { name: 'Per Olsson', shirt: 0x6b4a2e, beret: true, x: -3.15, z: -0.35, ry: 0.5 },
    { name: 'Viktor Jones', shirt: 0x2f5f96, x: 2.9, z: -0.5, ry: -0.42 },
    { name: 'Per Vikman', shirt: 0xa8202c, x: -4.9, z: -1.5, ry: 0.66, hair: 0x4a3520 },
    { name: 'Henrik Lundqvist', shirt: 0x3f7a46, x: 4.7, z: -1.6, ry: -0.6, hair: 0x2a1c10 }
  ];
  const painters = FIELD.map((p) => {
    const fig = buildPainter(p.shirt, { beret: p.beret, hair: p.hair });
    fig.group.position.set(p.x, 0, p.z + 0.75);
    fig.group.rotation.y = p.ry + Math.PI;
    fig.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    scene.add(fig.group);
    const theirEasel = buildEasel(new THREE.MeshLambertMaterial({ color: 0xefece3 }), 0.85, 0.66);
    theirEasel.position.set(p.x, 0, p.z);
    theirEasel.rotation.y = p.ry + Math.PI;
    theirEasel.scale.setScalar(0.9);
    scene.add(theirEasel);
    return { ...p, fig, phase: rand() * 6 };
  });

  /* ---- State ----------------------------------------------------------- */

  const state = {
    phase: 'idle', // idle | draw | paint | judging | between | over
    workNo: 1,
    score: 0,
    timeLeft: ROUND_SECONDS,
    selected: -1,
    grades: [],
    lastToast: 0,
    timers: []
  };

  const drops = { r: 0, y: 0, b: 0, w: 0, k: 0 };
  let mixed = mixPigments(drops);
  let work = ARTWORKS[0];
  let painted = [];
  let bag = [];

  let high = 0;
  try {
    high = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
  } catch (e) {
    high = 0;
  }
  const fmt = (n) => Math.round(n).toLocaleString('sv-SE');
  hud.hi.textContent = fmt(high);

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    state.timers.push(id);
    return id;
  };

  /* ---- HUD helpers ----------------------------------------------------- */

  function toast(msg, big = false) {
    hud.toast.textContent = msg;
    hud.toast.className = `pb-toast show${big ? ' big' : ''}`;
    clearTimeout(state.lastToast);
    state.lastToast = setTimeout(() => {
      hud.toast.className = 'pb-toast';
    }, big ? 2200 : 1200);
  }

  function setPhaseLabel(txt) {
    hud.phase.textContent = txt;
    hud.phase.classList.toggle('show', !!txt);
  }

  function callout(txt) {
    hud.callout.textContent = txt;
    hud.callout.classList.remove('show');
    void hud.callout.offsetWidth;
    hud.callout.classList.add('show');
  }

  const projected = new THREE.Vector3();
  function popScore(text, world) {
    projected.copy(world).project(camera);
    if (projected.z > 1) return;
    const el = document.createElement('div');
    el.className = 'fg-pop';
    el.textContent = text;
    el.style.left = `${(projected.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * 100}%`;
    hud.pops.appendChild(el);
    later(() => el.remove(), 1100);
  }

  function addScore(n, world, label) {
    state.score += n;
    hud.score.textContent = fmt(state.score);
    hud.score.classList.remove('bump');
    void hud.score.offsetWidth;
    hud.score.classList.add('bump');
    if (world) popScore(label || `+${fmt(n)}`, world);
  }

  /* ---- Palette rendering ----------------------------------------------- */

  // Where each pigment well sits on the palette texture, in pixels
  const WELLS = PIGMENTS.map((p, i) => {
    const a = -0.95 + (i / (PIGMENTS.length - 1)) * 1.9;
    return { ...p, x: 320 + Math.sin(a) * 232, y: 118 - Math.cos(a) * 62 };
  });
  const WELL_R = 34;

  function paintPalette() {
    const W = palCv.width;
    const H = palCv.height;
    palCtx.clearRect(0, 0, W, H);

    // The board: a kidney shape with a thumb hole
    palCtx.save();
    palCtx.beginPath();
    palCtx.ellipse(W / 2, H * 0.52, W * 0.47, H * 0.42, 0, 0, Math.PI * 2);
    palCtx.closePath();
    const woodGrad = palCtx.createLinearGradient(0, 0, 0, H);
    woodGrad.addColorStop(0, '#c9a068');
    woodGrad.addColorStop(1, '#a37c47');
    palCtx.fillStyle = woodGrad;
    palCtx.fill();
    palCtx.strokeStyle = 'rgba(70,46,20,0.55)';
    palCtx.lineWidth = 5;
    palCtx.stroke();
    // Thumb hole
    palCtx.globalCompositeOperation = 'destination-out';
    palCtx.beginPath();
    palCtx.ellipse(W * 0.17, H * 0.72, 30, 22, -0.3, 0, Math.PI * 2);
    palCtx.fill();
    palCtx.globalCompositeOperation = 'source-over';
    palCtx.restore();

    // Pigment wells
    WELLS.forEach((wl, i) => {
      palCtx.beginPath();
      palCtx.arc(wl.x, wl.y, WELL_R, 0, Math.PI * 2);
      palCtx.fillStyle = wl.css;
      palCtx.fill();
      palCtx.lineWidth = 3;
      palCtx.strokeStyle = 'rgba(40,26,10,0.5)';
      palCtx.stroke();
      // A dab of highlight so it reads as wet paint
      palCtx.beginPath();
      palCtx.ellipse(wl.x - 10, wl.y - 12, 11, 7, -0.5, 0, Math.PI * 2);
      palCtx.fillStyle = 'rgba(255,255,255,0.28)';
      palCtx.fill();
      palCtx.fillStyle = 'rgba(30,20,8,0.75)';
      palCtx.font = '700 15px Inter, sans-serif';
      palCtx.textAlign = 'center';
      palCtx.fillText(String(i + 1), wl.x, wl.y + WELL_R + 17);
    });

    // The pool of mixed paint in the middle of the board
    const total = drops.r + drops.y + drops.b + drops.w + drops.k;
    if (total > 0) {
      const r = Math.min(66, 22 + total * 4);
      palCtx.save();
      palCtx.beginPath();
      palCtx.ellipse(W * 0.53, H * 0.68, r * 1.25, r * 0.8, 0.15, 0, Math.PI * 2);
      palCtx.closePath();
      palCtx.fillStyle = rgbToCss(mixed);
      palCtx.fill();
      palCtx.strokeStyle = 'rgba(0,0,0,0.22)';
      palCtx.lineWidth = 3;
      palCtx.stroke();
      palCtx.beginPath();
      palCtx.ellipse(W * 0.53 - r * 0.5, H * 0.68 - r * 0.3, r * 0.3, r * 0.16, -0.4, 0, Math.PI * 2);
      palCtx.fillStyle = 'rgba(255,255,255,0.2)';
      palCtx.fill();
      palCtx.restore();
    }
    palTex.needsUpdate = true;
  }

  function renderMixHud() {
    hud.target.style.background = state.selected >= 0
      ? rgbToCss(hexToRgb(work.regions[state.selected].color))
      : 'transparent';
    hud.mixed.style.background = rgbToCss(mixed);
    let pct = 0;
    if (state.selected >= 0) {
      const d = colourDistance(mixed, hexToRgb(work.regions[state.selected].color));
      pct = Math.max(0, 1 - d / 55);
    }
    hud.meterFill.style.width = `${(pct * 100).toFixed(0)}%`;
    hud.meterFill.style.background = pct > 0.86 ? '#3ddc7b' : pct > 0.6 ? '#f2c14e' : '#f26d8d';
    hud.region.textContent = state.selected >= 0
      ? work.regions[state.selected].name
      : 'Välj en yta i tavlan';
  }

  /* ---- Canvas rendering ------------------------------------------------ */

  let artT = 0;
  function repaint() {
    paintPlayer(artCtx, work, CW, CH, painted, state.selected, artT);
    artTex.needsUpdate = true;
  }

  function loadWork(w) {
    work = w;
    painted = work.regions.map(() => null);
    state.selected = -1;
    paintReference(refCtx, work, refCv.width, refCv.height);
    paintIdMap(idCtx, work, CW, CH);
    repaint();
    hud.work.textContent = `VERK ${state.workNo}/${WORKS_PER_GAME}`;
    hud.title.textContent = `${work.title} · ${work.artist}`;
  }

  /* ---- Mixing ---------------------------------------------------------- */

  function addDrop(key) {
    if (state.phase !== 'paint') return;
    drops[key] = Math.min(12, drops[key] + 1);
    mixed = mixPigments(drops);
    const before = state.matchedNow;
    sfx.drop(PIGMENTS.findIndex((p) => p.key === key));
    if (state.selected >= 0) {
      const d = colourDistance(mixed, hexToRgb(work.regions[state.selected].color));
      state.matchedNow = d < 8;
      if (state.matchedNow && !before) sfx.match();
    }
    paintPalette();
    renderPigments();
    renderMixHud();
  }

  function wipe() {
    if (state.phase !== 'paint') return;
    PIGMENTS.forEach((p) => {
      drops[p.key] = 0;
    });
    mixed = mixPigments(drops);
    state.matchedNow = false;
    sfx.scrape();
    paintPalette();
    renderPigments();
    renderMixHud();
  }

  function applyPaint() {
    if (state.phase !== 'paint' || state.selected < 0) return;
    const total = drops.r + drops.y + drops.b + drops.w + drops.k;
    if (total <= 0) {
      toast('Paletten är tom — blanda något först.');
      return;
    }
    const idx = state.selected;
    const target = hexToRgb(work.regions[idx].color);
    const d = colourDistance(mixed, target);
    painted[idx] = mixed.slice();
    // ΔE under about 6 is a colour nobody would call wrong; past 55 it is
    // simply a different colour, so that is where the points run out.
    const acc = Math.max(0, 1 - d / 55);
    const pts = Math.round(120 + acc * acc * 680);
    addScore(pts, artMesh.position, acc > 0.9 ? `TRÄFF +${fmt(pts)}` : `+${fmt(pts)}`);
    sfx.stroke(acc);
    if (acc > 0.9) callout('PRICKFÄRG!');

    // Move on to the next unpainted region so the player keeps flowing
    const next = painted.findIndex((p) => p === null);
    state.selected = next;
    state.matchedNow = false;
    repaint();
    renderMixHud();
    if (next < 0) later(finishWork, 500);
  }

  /* ---- Flow ------------------------------------------------------------ */

  function drawSlip() {
    state.phase = 'draw';
    sfx.slip();
    const w = bag.pop();
    loadWork(w);
    hud.mix.hidden = true;
    hud.pigments.hidden = true;
    hud.tools.hidden = true;
    hud.ref.hidden = true;
    callout(`${w.title.toUpperCase()}`);
    toast(`${w.artist}, ${w.year}. ${w.note}`, true);
    setPhaseLabel('LAPPEN UR HATTEN');
    later(() => {
      if (state.phase === 'draw') beginPaint();
    }, 2100);
  }

  function beginPaint() {
    state.phase = 'paint';
    state.timeLeft = ROUND_SECONDS;
    state.selected = 0;
    wipe();
    hud.mix.hidden = false;
    hud.pigments.hidden = false;
    hud.tools.hidden = false;
    hud.ref.hidden = false;
    setPhaseLabel('BLANDA FÄRGEN — TRYCK PÅ EN YTA');
    later(() => setPhaseLabel(''), 2600);
    repaint();
    renderMixHud();
  }

  function finishWork() {
    if (state.phase !== 'paint') return;
    state.phase = 'judging';
    hud.mix.hidden = true;
    hud.pigments.hidden = true;
    hud.tools.hidden = true;
    hud.ref.hidden = true;
    sfx.gavel();

    // The verdict: colour accuracy over every region, with bare canvas
    // counted as the miss it is.
    let sum = 0;
    work.regions.forEach((rg, i) => {
      if (!painted[i]) return;
      const d = colourDistance(painted[i], hexToRgb(rg.color));
      sum += Math.max(0, 1 - d / 55);
    });
    const quality = sum / work.regions.length;
    const grade = Math.max(1, Math.min(10, Math.round(quality * 10.4 * 10) / 10));
    state.grades.push({ title: work.title, grade });
    const verdict = VERDICTS.find((v) => grade >= v.at) || VERDICTS[VERDICTS.length - 1];
    const bonus = Math.round(grade * 220 + state.timeLeft * 6);
    addScore(bonus, null);

    setPhaseLabel('');
    hud.otitle.textContent = `${work.title} — ${grade.toFixed(1)}/10`;
    hud.otext.textContent = `Mikael Hägglund: ”${verdict.say}” +${fmt(bonus)} poäng.`;
    hud.steps.hidden = true;
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng totalt</small>`;
    hud.verdict.hidden = false;
    hud.verdict.innerHTML = state.grades
      .map((g) => `<b>${g.title}</b><span>${g.grade.toFixed(1)}/10</span>`)
      .join('');

    if (grade >= 7.5) sfx.applause(grade >= 9);

    if (state.workNo >= WORKS_PER_GAME) {
      later(gameOver, 900);
      return;
    }
    state.workNo++;
    state.phase = 'between';
    hud.start.textContent = 'Dra nästa lapp';
    later(() => hud.overlay.classList.add('show'), 700);
  }

  function gameOver() {
    state.phase = 'over';
    const isHigh = state.score > high;
    if (isHigh) {
      high = state.score;
      try {
        localStorage.setItem(HIGHSCORE_KEY, String(Math.round(high)));
      } catch (e) {
        /* private mode */
      }
      hud.hi.textContent = fmt(high);
    }
    const best = state.grades.reduce((a, g) => (g.grade > a.grade ? g : a), state.grades[0]);
    const avg = state.grades.reduce((a, g) => a + g.grade, 0) / state.grades.length;
    sfx.fanfare();
    hud.otitle.textContent = avg >= 8
      ? 'Pokalen är din!'
      : avg >= 6
        ? 'Hedersamt genomfört'
        : 'Hägglund är inte imponerad';
    hud.otext.textContent = avg >= 8
      ? `Snittbetyg ${avg.toFixed(1)}. Bäst: ${best.title}. Precis som Olov Melander 2021 — du fångade essensen.`
      : `Snittbetyg ${avg.toFixed(1)}. Bäst: ${best.title}. Olov tog hem 2021 med Skriet. Ta en öl och försök igen.`;
    hud.steps.hidden = true;
    hud.scoreline.hidden = false;
    hud.scoreline.innerHTML = `<span>${fmt(state.score)}</span><small>poäng · rekord ${fmt(high)}</small>`;
    hud.verdict.hidden = false;
    hud.verdict.innerHTML = state.grades
      .map((g) => `<b>${g.title}</b><span>${g.grade.toFixed(1)}/10</span>`)
      .join('');
    hud.start.textContent = 'Måla igen';
    hud.overlay.classList.add('show');
  }

  function startGame() {
    sfx.resume();
    hud.overlay.classList.remove('show');
    if (state.phase === 'between') {
      drawSlip();
      return;
    }
    state.score = 0;
    state.workNo = 1;
    state.grades = [];
    hud.score.textContent = '0';
    hud.steps.hidden = false;
    hud.scoreline.hidden = true;
    hud.verdict.hidden = true;
    // A fresh hat: Skriet is always in it, because it is the one that won
    bag = ARTWORKS.filter((w) => w.id !== 'skriet')
      .sort(() => rand() - 0.5)
      .slice(0, WORKS_PER_GAME - 1)
      .concat(ARTWORKS.find((w) => w.id === 'skriet'));
    drawSlip();
  }

  /* ---- Input ------------------------------------------------------------ */

  let helpOpen = false;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function onPointerDown(e) {
    sfx.resume();
    if (helpOpen || e.target.closest('.pb-overlay, .pb-mute, .pb-info, .pb-help, .cl-tools, .ml-pigments')) return;
    if (state.phase !== 'paint') return;
    const rect = canvasHost.getBoundingClientRect();
    ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    );
    ray.setFromCamera(ndc, camera);

    const artHit = ray.intersectObject(artMesh, false)[0];
    if (artHit) {
      // Read the id-map rather than testing the curves: one pixel lookup,
      // and it can never disagree with what was drawn.
      const px = Math.floor(artHit.uv.x * CW);
      const py = Math.floor((1 - artHit.uv.y) * CH);
      const id = idCtx.getImageData(px, py, 1, 1).data[0];
      if (id > 0 && !painted[id - 1]) {
        state.selected = id - 1;
        state.matchedNow = false;
        repaint();
        renderMixHud();
      }
    }
  }

  function onKeyDown(e) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= PIGMENTS.length) {
      sfx.resume();
      addDrop(PIGMENTS[n - 1].key);
    } else if (e.key === ' ') {
      e.preventDefault();
      sfx.resume();
      if (state.phase === 'paint') applyPaint();
      else if (state.phase === 'idle' || state.phase === 'between' || state.phase === 'over') startGame();
    } else if (e.key === 'w' || e.key === 'W') {
      wipe();
    } else if (e.key === '?' || (e.key === 'Escape' && helpOpen)) {
      setHelp(!helpOpen);
    }
  }

  function setHelp(open) {
    helpOpen = open;
    hud.help.hidden = !open;
  }

  /* The pigment row. Each button shows how many drops are in the mix, so
     you can see what you built the colour out of and undo it in your head. */
  PIGMENTS.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'ml-pigment';
    b.style.setProperty('--c', p.css);
    b.innerHTML = `<i></i><b>${p.name}</b><em id="ml-drop-${p.key}">0</em>`;
    b.title = `${p.name} — tangent ${i + 1}`;
    b.addEventListener('click', () => {
      sfx.resume();
      addDrop(p.key);
    });
    hud.pigments.appendChild(b);
  });

  function renderPigments() {
    PIGMENTS.forEach((p) => {
      const el = hud.pigments.querySelector(`#ml-drop-${p.key}`);
      if (el) el.textContent = String(drops[p.key]);
    });
  }

  hud.start.addEventListener('click', startGame);
  hud.apply.addEventListener('click', applyPaint);
  hud.wipe.addEventListener('click', wipe);
  hud.info.addEventListener('click', () => setHelp(true));
  hud.helpClose.addEventListener('click', () => setHelp(false));
  hud.mute.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    hud.mute.classList.toggle('off', sfx.muted);
  });
  canvasHost.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);

  /* ---- Resize ----------------------------------------------------------- */

  function resize() {
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // A portrait phone needs a wider lens to hold the easel and the palette
    camera.fov = camera.aspect < 0.62 ? 56 : 44;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);
  resize();

  /* ---- Loop ------------------------------------------------------------- */

  loadWork(ARTWORKS[0]);
  paintPalette();
  renderPigments();
  renderMixHud();
  hud.overlay.classList.add('show');

  let raf = 0;
  let last = performance.now();
  let running = true;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = clampDt(now - last);
    last = now;
    if (!running) return;
    const t = now / 1000;
    artT = t;

    if (!helpOpen && state.phase === 'paint') {
      state.timeLeft -= dt;
      const s = Math.max(0, Math.ceil(state.timeLeft));
      hud.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      hud.time.style.color = s <= 15 ? '#f26d8d' : '';
      if (state.timeLeft <= 0) finishWork();
      if (state.selected >= 0) repaint();
    }

    // The garden keeps working whatever the player is doing
    painters.forEach((p, i) => {
      const swing = Math.sin(t * (1.1 + i * 0.18) + p.phase);
      p.fig.refs.armR.rotation.x = 0.62 + swing * 0.34;
      p.fig.refs.armR.rotation.z = -0.16 + Math.cos(t * 0.8 + p.phase) * 0.12;
      p.fig.refs.head.rotation.y = Math.sin(t * 0.5 + p.phase) * 0.22;
      p.fig.group.position.y = Math.abs(Math.sin(t * 0.9 + p.phase)) * 0.006;
    });
    garden.refs.hat.rotation.y = Math.sin(t * 0.3) * 0.05;

    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    running = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);

  /* ---- Debug API -------------------------------------------------------- */

  window.__ppMaleri = {
    state,
    scene,
    camera,
    drops,
    startGame,
    beginPaint,
    finishWork,
    work: () => work,
    painted: () => painted,
    mixed: () => mixed,
    addDrop,
    wipe,
    applyPaint,
    select(i) {
      state.selected = i;
      renderMixHud();
      repaint();
    },
    /** Paint every region with the exact target colour — a perfect copy. */
    paintPerfect() {
      work.regions.forEach((rg, i) => {
        painted[i] = hexToRgb(rg.color);
      });
      state.selected = -1;
      repaint();
    },
    info() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles
      };
    }
  };

  /* ---- Teardown --------------------------------------------------------- */

  function destroy() {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvasHost.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('keydown', onKeyDown);
    state.timers.forEach(clearTimeout);
    clearTimeout(state.lastToast);
    delete window.__ppMaleri;

    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    sfx.close();
    container.innerHTML = '';
  }

  return { destroy };
}

export default createPainting;
export { ARTWORKS };
