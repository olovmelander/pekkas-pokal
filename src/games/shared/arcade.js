/** Shared lifecycle and presentation for the 2011–2018 arcade.
 * Games own their rules, scenes and state machines. This shell owns resources,
 * focus, input cleanup, sound and a deliberately lightweight rendering path.
 */
import * as THREE from 'three';
import { guardRenderer } from './gfx.js';
import { arcadeEnvironment } from './arcade-lighting.js';
import { hasCommandModifier, isEditableTarget, isNativeControlTarget, isGameControlTarget } from './keyboard.js';

export function createArcade(container, options = {}) {
  const { id = 'arcade', title = 'Pekkas Pokal', subtitle = '', accent = '#e9bf5c', sky = 0x97b4be, fog = sky, lighting = 'outdoor' } = options;
  const root = document.createElement('div');
  root.className = 'arcade';
  root.tabIndex = -1;
  root.style.setProperty('--arcade-accent', accent);
  root.innerHTML = `<div class="arcade-vignette"></div>
    <div class="arcade-ui">
      <header class="arcade-hud"><span class="arcade-label"></span><strong class="arcade-value"></strong><span class="arcade-detail"></span></header>
      <nav class="arcade-tools" aria-label="Spelinställningar"><button type="button" data-tool="sound" aria-label="Stäng av ljud" aria-pressed="false">Ljud på</button><button type="button" data-tool="pause" aria-label="Pausa spelet" aria-pressed="false">Paus</button></nav>
      <div class="arcade-toast" role="status" aria-live="polite"></div>
      <section class="arcade-overlay"><div class="arcade-panel"><span class="arcade-eyebrow"></span><h2></h2><div class="arcade-body"></div><button type="button" class="arcade-primary"></button><span class="arcade-panel-foot">PEKKAS POKAL · SPELA OM. BLI BÄTTRE.</span></div></section>
      <section class="arcade-pause" hidden><div class="arcade-panel"><span class="arcade-eyebrow">TA ETT ANDETAG</span><h2>Paus</h2><p>Spelet väntar här tills du är redo.</p><button type="button" class="arcade-primary" data-tool="resume">Fortsätt spela</button></div></section>
    </div>`;
  container.append(root);
  const ui = root.querySelector('.arcade-ui');
  const panel = root.querySelector('.arcade-overlay');
  const pausePanel = root.querySelector('.arcade-pause');
  const pauseButton = root.querySelector('[data-tool="pause"]');
  const soundButton = root.querySelector('[data-tool="sound"]');
  const hudLabel = root.querySelector('.arcade-label');
  const hudValue = root.querySelector('.arcade-value');
  const hudDetail = root.querySelector('.arcade-detail');
  const toastElement = root.querySelector('.arcade-toast');
  const keys = new Set();
  const cleanups = [];
  const callbacks = new Set();
  let dead = false;
  let paused = false;
  let frame = 0;
  let previous = performance.now();
  let elapsed = 0;
  let toastUntil = 0;
  let audio = null;
  const voices = new Set();
  let muted = false;
  let onStart = null;
  let resumeFocus = null;
  let slowFrames = 0;
  let qualityReduced = false;
  let renderRequested = true;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const safe = new URLSearchParams(location.search).get('gfx') === 'safe';
  try { muted = localStorage.getItem('pp-arcade-muted') === 'true'; } catch { /* private mode */ }
  const renderer = new THREE.WebGLRenderer({ antialias: !coarse && !safe, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse || safe ? 1.35 : 1.75));
  renderer.shadowMap.enabled = !safe;
  // r187 removed PCFSoftShadowMap (it fell back with a console warning). PCF
  // now filters with hardware comparison; light.shadow.radius sets the spread.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = lighting === 'interior' ? 1.05 : 1.03;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'arcade-canvas';
  renderer.domElement.setAttribute('aria-label', `${title} — spelvärld i 3D`);
  root.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sky);
  if (fog !== false) scene.fog = new THREE.Fog(fog, 35, 145);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 350);
  camera.position.set(0, 9, 16);
  camera.lookAt(0, 0, 0);
  const ambient = new THREE.HemisphereLight(0xc9dcf0, 0x62583b, lighting === 'interior' ? 0.42 : 0.85);
  const sun = new THREE.DirectionalLight(0xffdfb2, lighting === 'interior' ? 2.1 : 2.9);
  sun.position.set(-14, 24, 12);
  sun.castShadow = !safe;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 0.5, far: 110 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  const fill = new THREE.DirectionalLight(0xb8d0f4, lighting === 'interior' ? 0.16 : 0.35);
  fill.position.set(18, 9, -18);
  scene.add(ambient, sun, sun.target, fill);
  let environment = null;
  // A restored WebGL context brings back geometry and image textures, but the
  // pre-filtered environment lives only in a render target: it comes back
  // black and metal, water and lacquer turn dull. Rebake it before the first
  // visible frame after a restore (never while the tab is hidden).
  let environmentRestorePending = false;
  function bakeEnvironment(afterContextLoss = false) {
    try {
      const next = arcadeEnvironment(renderer, lighting === 'interior');
      // After a context loss the old target's GPU objects died with the old
      // context; deleting them again only makes WebGL warn
      if (!afterContextLoss) environment?.dispose();
      environment = next;
      scene.environment = environment.texture;
      scene.environmentIntensity = lighting === 'interior' ? 0.55 : 0.38;
      return true;
    } catch {
      return false;
    }
  }
  if (!safe && !bakeEnvironment()) {
    // Older WebGL devices retain a complete direct-light rendering path.
    ambient.intensity += 0.3;
  }
  const shadowOffset = new THREE.Vector3();
  function setShadowFocus(x, y, z) {
    shadowOffset.copy(sun.position).sub(sun.target.position);
    sun.target.position.set(x, y, z);
    sun.position.copy(sun.target.position).add(shadowOffset);
    sun.target.updateMatrixWorld();
  }
  const profile = guardRenderer(renderer, root);

  function listen(target, event, fn, opts) {
    target.addEventListener(event, fn, opts);
    const remove = () => target.removeEventListener(event, fn, opts);
    cleanups.push(remove);
    return remove;
  }
  function resize() {
    if (dead) return;
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    root.dispatchEvent(new CustomEvent('arcaderesize', { detail: { width, height } }));
    renderRequested = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  resize();

  function wakeAudio() {
    if (muted || paused || dead) return;
    try {
      if (!audio) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (Context) audio = new Context();
      }
      if (audio?.state === 'suspended') audio.resume().catch(() => {});
      if (audio) voices.forEach((voice) => voice.connect());
    } catch { /* Sound is optional. */ }
  }
  function tone(frequency = 440, duration = 0.12, type = 'sine') {
    if (dead || paused || muted) return;
    wakeAudio();
    if (!audio || audio.state !== 'running') return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = ['sine', 'square', 'sawtooth', 'triangle'].includes(type) ? type : 'sine';
    oscillator.frequency.setValueAtTime(Math.max(35, Math.min(12000, frequency)), audio.currentTime);
    gain.gain.setValueAtTime(0, audio.currentTime);
    gain.gain.linearRampToValueAtTime(0.045, audio.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + Math.max(0.025, duration));
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + Math.max(0.03, duration) + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function updateMute() {
    soundButton.textContent = muted ? 'Ljud av' : 'Ljud på';
    soundButton.setAttribute('aria-label', muted ? 'Slå på ljud' : 'Stäng av ljud');
    soundButton.setAttribute('aria-pressed', String(muted));
  }
  /** A continuous, quiet voice for engine/wind feedback. Nodes are created
   * only after a player gesture; the shell owns pause, mute and disposal. */
  function createVoice({ type = 'triangle', frequency = 80, gain = 0 } = {}) {
    let oscillator = null;
    let volume = null;
    let stopped = false;
    let hz = frequency;
    let level = gain;
    const voice = {
      connect() {
        if (!audio || stopped || oscillator) return;
        oscillator = audio.createOscillator();
        volume = audio.createGain();
        oscillator.type = ['sine', 'square', 'sawtooth', 'triangle'].includes(type) ? type : 'triangle';
        oscillator.frequency.value = Math.max(35, Math.min(12000, hz));
        volume.gain.value = Math.max(0, Math.min(0.08, level));
        oscillator.connect(volume);
        volume.connect(audio.destination);
        oscillator.start();
      },
      set(nextFrequency, nextGain) {
        if (stopped || dead) return;
        if (Number.isFinite(nextFrequency)) hz = Math.max(35, Math.min(12000, nextFrequency));
        if (Number.isFinite(nextGain)) level = Math.max(0, Math.min(0.08, nextGain));
        if (!oscillator) return;
        oscillator.frequency.setTargetAtTime(hz, audio.currentTime, 0.06);
        volume.gain.setTargetAtTime(level, audio.currentTime, 0.06);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        voices.delete(voice);
        oscillator?.stop();
        oscillator?.disconnect();
        volume?.disconnect();
      }
    };
    voices.add(voice);
    if (audio && !dead) voice.connect();
    return { set: voice.set, stop: voice.stop };
  }
  function setPaused(value) {
    if (dead || paused === value) return;
    if (value) resumeFocus = document.activeElement;
    paused = value;
    renderRequested = true;
    keys.clear();
    // Games can clear pointer-held controls on the same event as keyboard input.
    root.dispatchEvent(new CustomEvent('arcadepause', { detail: { paused } }));
    pausePanel.hidden = !paused;
    syncModal();
    root.classList.toggle('arcade-is-paused', paused);
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.textContent = paused ? 'Fortsätt' : 'Paus';
    pauseButton.setAttribute('aria-label', paused ? 'Fortsätt spela' : 'Pausa spelet');
    previous = performance.now();
    if (paused) {
      audio?.suspend().catch(() => {});
      pausePanel.querySelector('button').focus({ preventScroll: true });
    } else {
      wakeAudio();
      const target = resumeFocus?.isConnected && !resumeFocus.closest('[inert]') && resumeFocus !== pauseButton && resumeFocus !== soundButton
        ? resumeFocus : root;
      target.focus({ preventScroll: true });
    }
  }
  const gameKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);
  listen(window, 'keydown', (event) => {
    // A local dialog or focused game control has already handled this key.
    if (event.defaultPrevented || hasCommandModifier(event)) return;
    if (event.code === 'Tab') {
      const buttons = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]'), document.querySelector('#game-close')]
        .filter((element) => element && !element.closest('[inert]') && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      const index = buttons.indexOf(document.activeElement);
      if (buttons.length) {
        event.preventDefault();
        const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus({ preventScroll: true });
      }
      return;
    }
    if (isEditableTarget(event.target)) return;
    if (event.code === 'KeyP' && !event.repeat) { event.preventDefault(); setPaused(!paused); return; }
    if (isNativeControlTarget(event.target) && !(isGameControlTarget(event.target) && event.code !== 'Space')) return;
    if (paused || !panel.hidden) return;
    if (gameKeys.has(event.code)) event.preventDefault();
    keys.add(event.code);
  });
  listen(window, 'keyup', (event) => keys.delete(event.code));
  listen(window, 'blur', () => { keys.clear(); if (panel.hidden) setPaused(true); });
  listen(document, 'visibilitychange', () => {
    if (document.hidden && panel.hidden) setPaused(true);
    renderRequested = true;
  });
  listen(renderer.domElement, 'webglcontextrestored', () => {
    // Only an environment that was baked before needs baking again: a
    // deliberate safe mode or a device that failed the bake stays as it was
    if (environment) environmentRestorePending = true;
    renderRequested = true;
  });
  listen(root, 'pointerdown', wakeAudio, { passive: true });
  listen(root, 'contextmenu', (event) => event.preventDefault());
  listen(pauseButton, 'click', () => setPaused(!paused));
  listen(pausePanel.querySelector('button'), 'click', () => setPaused(false));
  listen(soundButton, 'click', (event) => {
    muted = !muted;
    try { localStorage.setItem('pp-arcade-muted', String(muted)); } catch { /* private mode */ }
    updateMute();
    root.dispatchEvent(new CustomEvent('arcademute', { detail: { muted } }));
    if (muted) audio?.suspend().catch(() => {});
    else { wakeAudio(); tone(640, 0.08); }
    // Mouse/touch players can return directly to keyboard steering. Tab and
    // Space users keep native button focus until they choose to leave it.
    if (event.detail > 0 && panel.hidden && !paused) root.focus({ preventScroll: true });
  });
  listen(panel.querySelector('button'), 'click', () => {
    if (paused || dead) return;
    wakeAudio();
    keys.clear();
    const action = onStart;
    hidePanel();
    action?.();
  });
  function showPanel({ eyebrow = subtitle, title: heading = title, body = '', button = 'Spela', onStart: action } = {}) {
    if (dead) return;
    keys.clear();
    panel.querySelector('.arcade-eyebrow').textContent = eyebrow;
    panel.querySelector('h2').textContent = heading;
    panel.querySelector('.arcade-body').innerHTML = body;
    panel.querySelector('button').textContent = button;
    onStart = action;
    panel.hidden = false;
    renderRequested = true;
    root.classList.add('arcade-has-panel');
    panel.setAttribute('aria-label', heading);
    syncModal();
    if (!paused) panel.querySelector('button').focus({ preventScroll: true });
  }
  function syncModal() {
    const modal = paused ? pausePanel : !panel.hidden ? panel : null;
    for (const child of ui.children) {
      child.inert = !!modal && child !== modal && !child.classList.contains('arcade-tools');
    }
  }
  function hidePanel() {
    toastElement.classList.remove('show');
    toastElement.textContent = '';
    toastUntil = elapsed;
    panel.hidden = true;
    renderRequested = true;
    root.classList.remove('arcade-has-panel');
    syncModal();
    root.focus({ preventScroll: true });
  }
  function setHUD(label, value, detail = '') {
    // Avoid replacing text nodes sixty times a second when nothing changed.
    if (hudLabel.textContent !== String(label)) hudLabel.textContent = label;
    if (hudValue.textContent !== String(value)) hudValue.textContent = value;
    if (hudDetail.textContent !== String(detail)) hudDetail.textContent = detail;
  }
  function toast(message) {
    toastElement.textContent = message;
    toastElement.classList.add('show');
    toastUntil = elapsed + 2.7;
  }
  const bestKey = `pp-${id}-best`;
  function loadBest() {
    try { const value = Number(localStorage.getItem(bestKey)); return Number.isFinite(value) ? Math.max(0, value) : 0; } catch { return 0; }
  }
  function saveBest(score) {
    const best = Math.max(loadBest(), Number.isFinite(score) ? score : 0);
    try { localStorage.setItem(bestKey, String(best)); } catch { /* private mode */ }
    return best;
  }
  function tick(now) {
    if (dead) return;
    frame = requestAnimationFrame(tick);
    const raw = Math.max(0, (now - previous) / 1000);
    const dt = Math.min(0.05, raw);
    previous = now;
    if (!paused && !document.hidden) {
      elapsed += dt;
      for (const callback of callbacks) callback(dt, elapsed);
      if (elapsed > toastUntil) toastElement.classList.remove('show');
      // Sustained slow frames lower resolution once; no postprocessing required.
      if (!qualityReduced && !navigator.webdriver && raw > 0.035 && elapsed > 4) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 100) {
        qualityReduced = true;
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = false;
        resize();
      }
    }
    // Keep one fresh frame after pause, resize or context restore, then let
    // the GPU rest. DOM focus and audio controls do not need a new 3D frame.
    if (!paused || renderRequested) {
      if (!document.hidden) {
        if (environmentRestorePending) {
          environmentRestorePending = false;
          bakeEnvironment(true);
        }
        renderer.render(scene, camera);
      }
      renderRequested = false;
    }
  }
  function destroy() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    cleanups.splice(0).forEach((cleanup) => cleanup());
    callbacks.clear();
    keys.clear();
    profile.dispose();
    [...voices].forEach((voice) => voice.stop());
    if (audio && audio.state !== 'closed') audio.close().catch(() => {});
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    scene.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => materials.add(m));
      if (object.isLight) object.shadow?.map?.dispose();
    });
    for (const material of materials) {
      Object.values(material).forEach((value) => { if (value?.isTexture) textures.add(value); });
      if (material.uniforms) Object.values(material.uniforms).forEach((uniform) => { if (uniform.value?.isTexture) textures.add(uniform.value); });
      material.dispose();
    }
    geometries.forEach((geometry) => geometry.dispose());
    textures.forEach((texture) => texture.dispose());
    scene.environment = null;
    environment?.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    root.remove();
  }
  updateMute();
  setHUD(subtitle || title, title, '');
  showPanel({ title, body: '', onStart: hidePanel });
  frame = requestAnimationFrame(tick);
  return {
    THREE, scene, camera, renderer, root, ui, keys, sun, ambient, fill, reducedMotion,
    listen, showPanel, hidePanel, setHUD, toast, tone, createVoice, loadBest, saveBest, destroy, setPaused, setShadowFocus,
    invalidate() { renderRequested = true; },
    onFrame(callback) { callbacks.add(callback); return () => callbacks.delete(callback); },
    get paused() { return paused; },
    get muted() { return muted; },
    /** The shared AudioContext once a player gesture has woken it, else null.
     * Pause and mute suspend it and destroy closes it, so graphs built on it
     * obey both (games still silence their own nodes between races). */
    get audioContext() { return audio && audio.state !== 'closed' ? audio : null; }
  };
}
