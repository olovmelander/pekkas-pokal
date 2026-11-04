/**
 * Pekkas Pokal — delad grafikvakt för alla spel (Three.js r187)
 *
 * Spelen testas i en mjukvaru-GPU (SwiftShader) som räknar i full precision
 * och förlåter mycket. Riktiga grafikkretsar gör inte det: ett NaN i en
 * enda pixel sprids av bloom till hela bilden, ett MSAA-mål i halvflyttal
 * finns inte överallt, en shader som kompilerar här kan fallera där, och ett
 * djupbuffert på 24 bitar kan inte skilja två ytor som ligger millimeter
 * isär. Den här modulen samlar skydden så att varje spel inte behöver
 * uppfinna dem själv:
 *
 *  - gfxProfile()        vad kretsen klarar, plus ?gfx=safe / ?gfx=debug
 *  - postTarget()        ett renderingsmål som fungerar på just den kretsen
 *  - SanitizePass        rensar NaN/Inf och klampar HDR före bloom
 *  - RenderWatchdog      ser efter svarta bilder och stegar ner kvaliteten
 *  - watchShaderErrors() säger till på skärmen om en shader inte kompilerar
 *
 * Inget här är spelspecifikt; spelen säger själva vad "ett steg ner" betyder.
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ------------------------------------------------------------- profil */

function readFlag() {
  try {
    const q = new URLSearchParams(location.search).get('gfx');
    if (q) return q;
    return localStorage.getItem('pp-gfx') || '';
  } catch (e) {
    return '';
  }
}

/**
 * Vad den här kretsen och den här användaren tål.
 * `safe` stänger av efterbehandling, MSAA och tunga effekter;
 * `debug` visar en liten diagnospanel i spelet.
 */
export function gfxProfile(renderer) {
  const flag = readFlag();
  const gl = renderer.getContext();
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  // Halvflyttalsmål kräver EXT_color_buffer_float (WebGL2) eller
  // EXT_color_buffer_half_float för att vara renderbara — utan dem blir
  // efterbehandlingen svart på vissa kretsar.
  const floatRT = !!(isWebGL2 && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')));
  const maxSamples = isWebGL2 ? gl.getParameter(gl.MAX_SAMPLES) || 0 : 0;
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch (e) {
    gpu = '';
  }
  return {
    safe: flag === 'safe',
    debug: flag === 'debug',
    isWebGL2,
    floatRT,
    maxSamples,
    coarse,
    gpu: String(gpu || 'okänd grafikkrets')
  };
}

/**
 * Ett renderingsmål för efterbehandlingen som kretsen faktiskt kan rita i:
 * halvflyttal när det stöds (för HDR och bloom), annars 8 bitar; MSAA bara
 * när både flyttalsmål och flera samplingar finns.
 */
export function postTarget(profile, { samples = 4 } = {}) {
  const type = profile.floatRT ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const s = profile.safe || !profile.floatRT ? 0 : Math.min(samples, profile.maxSamples);
  return new THREE.WebGLRenderTarget(1, 1, { type, samples: s });
}

/* ------------------------------------------------------------- NaN-skydd */

/**
 * Rensar bilden innan bloom ser den: NaN och Inf blir svart, och HDR klampas
 * under halvflyttalens tak så att oskärpepassen aldrig räknar på oändligt.
 * En enda trasig pixel kan annars färga hela skärmen svart.
 */
export const SanitizeShader = {
  name: 'SanitizeShader',
  uniforms: { tDiffuse: { value: null }, uMax: { value: 48.0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uMax;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      bvec4 bad = bvec4(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b), isnan(c.a) || isinf(c.a));
      if (any(bad)) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = clamp(c, vec4(0.0), vec4(uMax));
    }`
};

export function sanitizePass() {
  return new ShaderPass(SanitizeShader);
}

/**
 * Lägg in rensningen direkt efter RenderPass i en befintlig EffectComposer.
 */
export function addSanitize(composer) {
  const i = composer.passes.findIndex((p) => p.isRenderPass);
  composer.insertPass(sanitizePass(), i >= 0 ? i + 1 : 0);
}

/* ------------------------------------------------------------- vakten */

/**
 * Tittar på den färdiga bilden några gånger i början. Är den svart (eller
 * nästan svart överallt) körs nästa nedtrappningssteg som spelet gett, och
 * vakten tittar igen.
 *
 * Läsningen är asynkron: fem rader av den visade bilden kopieras direkt
 * efter renderingen (samma bildruta, så ritbufferten är giltig utan
 * preserveDrawingBuffer) till en pixelbuffert på GPU:n, och svaret hämtas
 * först när ett staket säger att kopian är klar. Ingen synkron readPixels,
 * alltså ingen GPU-stopp och inga varningar om det.
 *
 *   const dog = new RenderWatchdog(renderer, [
 *     () => { usePost = false; },                       // steg 1
 *     () => { renderer.shadowMap.enabled = false; ... } // steg 2
 *   ], { onStep: (n, why) => toast(...) });
 *   // i loopen, efter sista render-anropet:
 *   dog.afterFrame();
 */
export class RenderWatchdog {
  /**
   * @param {object} o
   * @param {number} o.darkThreshold  ljus (0–255) under vilket en pixel räknas som mörk
   * @param {number} o.minLitFraction  andel upplysta pixlar under vilken bilden räknas
   *   som trasig. Standard 0,02 fångar en svart bild; spel med ljusa scener kan
   *   sätta högre för att även fånga "nästan svart" (allt hamnat i skugga).
   */
  constructor(renderer, steps = [], { onStep = null, checkFrames = [24, 90, 240], darkThreshold = 12, minLitFraction = 0.02 } = {}) {
    this.renderer = renderer;
    this.steps = steps;
    this.onStep = onStep;
    this.level = 0;
    this.frame = 0;
    this.checks = checkFrames.slice();
    this.darkThreshold = darkThreshold;
    this.minLitFraction = minLitFraction;
    this.pending = null; // { fence, pbo, bytes, w, rows }
    this.lastMean = null;
  }

  /** Lägg en asynkron kopia av fem bildrader på kö. */
  request() {
    const r = this.renderer;
    const gl = r.getContext();
    if (!gl.fenceSync) return; // WebGL1 saknar staket — då avstår vi hellre
    r.setRenderTarget(null);
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const rows = [0.15, 0.32, 0.5, 0.68, 0.85].map((f) => Math.min(h - 1, Math.floor(f * h)));
    const bytes = w * 4 * rows.length;
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
    rows.forEach((y, i) => gl.readPixels(0, y, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, i * w * 4));
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    this.pending = { fence, pbo, bytes, w, rows: rows.length };
  }

  /** Hämta en klar kopia; null om GPU:n inte är färdig än. */
  collect() {
    const gl = this.renderer.getContext();
    const p = this.pending;
    const status = gl.clientWaitSync(p.fence, 0, 0);
    if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) return null;
    const data = new Uint8Array(p.bytes);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, p.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, data);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.deleteSync(p.fence);
    gl.deleteBuffer(p.pbo);
    this.pending = null;
    let sum = 0;
    let lit = 0;
    let n = 0;
    // Var fjärde pixel räcker gott för att se om bilden lever
    for (let i = 0; i < data.length; i += 16) {
      const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += l;
      if (l > this.darkThreshold) lit++;
      n++;
    }
    return { mean: sum / Math.max(1, n), litFraction: lit / Math.max(1, n) };
  }

  afterFrame() {
    this.frame++;
    try {
      if (this.pending) {
        const s = this.collect();
        if (s) this.judge(s);
        return;
      }
      if (!this.checks.length || this.frame < this.checks[0]) return;
      this.checks.shift();
      this.request();
    } catch (e) {
      this.pending = null; // en vakt får aldrig själv krascha spelet
    }
  }

  judge(s) {
    this.lastMean = s.mean;
    // Svart (eller nästan): för få upplysta pixlar. Ingen av spelens scener
    // är så mörk på riktigt, så något i kedjan har gått sönder.
    if (s.litFraction >= this.minLitFraction || this.level >= this.steps.length) return;
    const step = this.steps[this.level];
    this.level++;
    try {
      step();
    } catch (e) {
      console.error('Grafikvakten: nedtrappning misslyckades', e);
    }
    console.warn(`Grafikvakten: svart bild (medel ${s.mean.toFixed(1)}) — förenklade grafiken, steg ${this.level}`);
    if (this.onStep) this.onStep(this.level, s);
    // titta igen strax efter nedtrappningen
    this.checks.unshift(this.frame + 20);
  }

  dispose() {
    if (!this.pending) return;
    const gl = this.renderer.getContext();
    gl.deleteSync(this.pending.fence);
    gl.deleteBuffer(this.pending.pbo);
    this.pending = null;
  }
}

/* ------------------------------------------------------------- kompilering */

/**
 * Kompilera scenens shaders innan första bilden — utan att låsa GPU:n.
 *
 * På Windows översätter Chrome och Edge WebGL till Direct3D 11, vars
 * shaderkompilator är långsam för tunga material. Kompileras allt i ett
 * enda block (renderer.compile, eller tyst vid första render-anropet) kan
 * GPU-processens vakthund slå till och återställa grafiken — kvar blir en
 * svart duk. compileAsync lämnar arbetet åt drivrutinens bakgrundstrådar
 * (KHR_parallel_shader_compile) och väntar utan att blockera; spelets
 * laddkort ligger kvar så länge. Taket gör att ett laddkort aldrig fastnar.
 *
 * Dolda objekt kompileras inte av three — gör dem synliga runt anropet om
 * de ska med (t.ex. glasyrmallar som visas senare).
 *
 * VIKTIGT för spel med efterbehandling: ett material blir ett annat
 * shaderprogram när det ritar in i ett renderingsmål (linjärt, utan
 * tonmappning) än när det ritar direkt till skärmen. Skicka därför med
 * kompositörens mål — `{ target: composer.renderTarget1 }` — annars värms
 * skärmvarianterna och de riktiga kompileras ändå i ett block vid första
 * bilden.
 */
export async function precompile(renderer, scene, camera, { timeout = 20000, target = null } = {}) {
  // compile() bestämmer programvarianten utifrån det aktuella målet, och
  // compileAsync anropar compile() synkront innan den börjar vänta — så det
  // räcker att målet är satt runt själva anropet.
  const prev = renderer.getRenderTarget();
  const parallel = !!renderer.compileAsync && renderer.extensions.has('KHR_parallel_shader_compile');
  let pending = null;
  if (target) renderer.setRenderTarget(target);
  try {
    // Utan parallell kompilering finns inget att vinna på att vänta
    // asynkront (och three varnar om tillägget saknas) — kompilera direkt.
    if (parallel) pending = renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (e) {
    pending = null; // då kompileras det vid första bilden i stället
  } finally {
    if (target) renderer.setRenderTarget(prev);
  }
  if (!pending) return;
  let timer = 0;
  try {
    await Promise.race([
      pending,
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeout);
      })
    ]);
  } catch (e) {
    /* då kompileras det vid första bilden i stället */
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------- shaderfel */

/**
 * Säg till om en shader inte kompilerar på användarens krets — annars
 * försvinner objektet tyst och spelet ser bara "mörkt" ut. Meddelandet
 * namnger kretsen så att felet går att rapportera.
 */
export function watchShaderErrors(renderer, notify) {
  const prev = renderer.debug.onShaderError;
  let told = false;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const log = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)]
      .filter(Boolean)
      .join('\n')
      .slice(0, 600);
    console.error(`Shaderfel på den här grafikkretsen:\n${log}`);
    if (!told && notify) {
      told = true;
      notify(log);
    }
    if (typeof prev === 'function') prev(gl, program, vs, fs);
  };
}

/* ------------------------------------------------------------- notis */

/**
 * En liten notis i spelets hörn — för nedtrappning, shaderfel och
 * förlorad WebGL-kontext. Ingen spelspecifik HUD behövs.
 */
export function gfxNotice(host, text, { timeout = 7000 } = {}) {
  if (!host) return;
  let el = host.querySelector('.gfx-notice');
  if (!el) {
    el = document.createElement('div');
    el.className = 'gfx-notice';
    el.setAttribute('role', 'status');
    host.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  if (timeout) el._t = setTimeout(() => el.classList.remove('show'), timeout);
}

/**
 * Allt ovan i ett anrop för spel som vill ha standardbeteendet: profil,
 * shaderfelsnotis, kontextförlust och (om ?gfx=debug) en diagnosrad.
 * Returnerar profilen.
 */
export function guardRenderer(renderer, host) {
  const profile = gfxProfile(renderer);
  watchShaderErrors(renderer, () =>
    gfxNotice(host, `En effekt kunde inte ritas på den här grafikkretsen (${profile.gpu}). Prova ?gfx=safe i adressen.`, { timeout: 12000 })
  );
  const canvas = renderer.domElement;
  const onLost = (e) => {
    e.preventDefault();
    gfxNotice(host, 'Grafiken tappades av webbläsaren — stäng och öppna spelet igen.', { timeout: 0 });
  };
  canvas.addEventListener('webglcontextlost', onLost);
  if (profile.debug) {
    gfxNotice(host, `GPU: ${profile.gpu} · WebGL2: ${profile.isWebGL2} · flyttalsmål: ${profile.floatRT} · MSAA ≤ ${profile.maxSamples}`, { timeout: 0 });
  }
  profile.dispose = () => canvas.removeEventListener('webglcontextlost', onLost);
  return profile;
}
