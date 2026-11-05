import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createArcade } from './arcade.js';
import { createPerson, appearanceFor, POSES } from './people.js';
import { buildCountryWorld } from '../farm/world.js';
import { clamp, landing, precisionScore, advanceBalance, kubbHit, medal } from '../farm/rules.js';
import { discPosition, throwIsCaught } from '../lundqvist/rules.js';

/** Reusable country events used by the 2016 arcade interpretation. */
export async function createCountryGames(container, config) {
  const game = await createArcade(container, {
    id: config.id, title: config.title, subtitle: `${config.place} · ${config.year}`,
    accent: config.accent, sky: config.theme === 'lake' ? '#aec9bf' : '#d5b58c', fog: config.theme === 'lake' ? '#aec9bf' : '#d5b58c'
  });
  game.root.classList.add('country-game', `country-${config.id}`);
  const { scene, camera } = game;
  scene.fog = new THREE.Fog(scene.background || 0xc8c7a4, 38, 115);
  const { mesh, box, cylinder, material, disposeMaterials } = buildCountryWorld(scene, config.theme === 'lake');
  const actor = createPerson(appearanceFor(config.champion, {
    detail: 'low', outfit: { top: 'shirt', topColor: config.theme === 'lake' ? 0x8cbaac : 0xc79a57, bottom: 'jeans', bottomColor: 0x405361, shoes: 'boots' }
  }));
  actor.root.rotation.y = Math.PI;
  actor.root.position.set(0, 0, 7);
  scene.add(actor.root);
  const spectators = ['Olov Melander', 'Mikael Hägglund', 'Rickard Nilsson'].map((name, i) => {
    const person = createPerson(appearanceFor(name, { detail: 'low' }));
    person.root.position.set(6.1 + i * 0.95, 0, -3 + (i % 2) * 1.3);
    person.root.rotation.y = -Math.PI / 2;
    scene.add(person.root);
    return person;
  });
  const props = new THREE.Group();
  scene.add(props);
  const disposableProps = new Set();
  const controls = document.createElement('div');
  controls.className = 'country-controls';
  controls.innerHTML = `<div class="country-round"><span class="country-kicker"></span><strong></strong><span class="country-hint"></span></div>
    <div class="country-meter" aria-hidden="true"><span class="country-zone"></span><i></i></div>
    <div class="country-readout" role="status" aria-live="polite"></div>
    <div class="country-actions"><button type="button" data-input="left" aria-label="Styr vänster">←</button><button type="button" data-input="action" class="country-action">LADDA KAST</button><button type="button" data-input="right" aria-label="Styr höger">→</button></div>`;
  game.ui.appendChild(controls);
  controls.hidden = true;
  const kicker = controls.querySelector('.country-kicker');
  const eventTitle = controls.querySelector('strong');
  const hint = controls.querySelector('.country-hint');
  const meter = controls.querySelector('.country-meter');
  const fill = meter.querySelector('i');
  const readout = controls.querySelector('.country-readout');
  const actionButton = controls.querySelector('[data-input="action"]');
  const held = { left: false, right: false, action: false };
  let mode = 'title', eventIndex = 0, clock = 0, aim = 0, power = 0.2, charging = false;
  let attempts = 0, scores = [], eventScores = [], target = { x: 0, z: -7 }, wind = 0;
  let projectile = null, marker = null, targetProp = null, flight = null, between = 0, throwStart = 0;
  let elapsed = 0, raceZ = 7, cargo = 100, playerX = 0, obstacles = [], carry = null;
  let balance = { tilt: 0, velocity: 0, cargo: 100, progress: 0 }, blocks = [], water = null;
  let lastHUD = '', updateCounter = 0;
  let previewDots = null, windFlag = null;
  const previewDummy = new THREE.Object3D();
  const cameraTarget = new THREE.Vector3(), cameraLook = new THREE.Vector3(0, 1, -2), lookTarget = new THREE.Vector3();
  const isThrow = () => ['bale', 'kubb', 'disc'].includes(config.events[eventIndex].kind);
  function clearInput() {
    held.left = held.right = held.action = false;
    charging = false;
    controls.querySelectorAll('button').forEach((b) => b.classList.remove('held'));
  }
  function beginCharge() {
    if (mode !== 'playing' || game.paused || !isThrow() || flight || between > 0) return;
    charging = true;
    throwStart = clock;
    power = 0.08;
  }
  function release() {
    if (mode !== 'playing' || game.paused || !charging) return;
    charging = false;
    const end = landing(aim, power, wind);
    flight = { t: 0, end, duration: 1.05 + power * 0.6, power, wind, caught: throwIsCaught(end, target) };
    projectile.visible = true;
    game.tone(180, 0.1, 'triangle');
    actor.setExpression('focus');
  }
  for (const button of controls.querySelectorAll('[data-input]')) {
    const name = button.dataset.input;
    game.listen(button, 'pointerdown', (e) => {
      e.preventDefault();
      if (mode !== 'playing' || game.paused) return;
      button.setPointerCapture(e.pointerId);
      held[name] = true;
      button.classList.add('held');
      if (name === 'action') beginCharge();
    });
    game.listen(button, 'pointerup', (e) => {
      e.preventDefault();
      held[name] = false;
      button.classList.remove('held');
      if (name === 'action') release();
    });
    game.listen(button, 'pointercancel', () => { held[name] = false; charging = false; button.classList.remove('held'); });
    game.listen(button, 'lostpointercapture', () => { held[name] = false; if (name === 'action') charging = false; button.classList.remove('held'); });
    // Enter activates a focused control without needing pointer events.
    game.listen(button, 'keydown', (e) => {
      if (e.code !== 'Enter') return;
      e.preventDefault();
      if (e.repeat) return;
      held[name] = true;
      if (name === 'action') beginCharge();
    });
    game.listen(button, 'keyup', (e) => {
      if (e.code !== 'Enter') return;
      held[name] = false;
      if (name === 'action') release();
    });
  }
  game.listen(window, 'keydown', (e) => {
    if (mode !== 'playing' || game.paused) return;
    if (['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' && !e.repeat) { held.action = true; beginCharge(); }
  });
  game.listen(window, 'keyup', (e) => {
    if (e.code === 'Space') { held.action = false; release(); }
  });
  game.listen(window, 'blur', clearInput);
  game.listen(game.root, 'arcadepause', clearInput);
  game.listen(document, 'visibilitychange', clearInput);
  function input() {
    return Number(held.right || game.keys.has('ArrowRight') || game.keys.has('KeyD')) - Number(held.left || game.keys.has('ArrowLeft') || game.keys.has('KeyA'));
  }
  function resetProps() {
    props.traverse((node) => {
      if (node.isInstancedMesh) node.dispose();
      if (node.geometry) disposableProps.add(node.geometry);
      if (node.material?.userData?.transient) { node.material.map?.dispose(); node.material.dispose(); }
      // Materials come from the world's cache and live until the whole game is destroyed.
    });
    props.clear();
    for (const geometry of disposableProps) geometry.dispose();
    disposableProps.clear();
  }
  function batchStaticProps() {
    props.updateMatrixWorld(true);
    const inverse = props.matrixWorld.clone().invert();
    const batches = new Map(), originals = new Set();
    props.traverse((object) => {
      if (!object.isMesh) return;
      const key = `${object.material.uuid}:${object.castShadow}`;
      if (!batches.has(key)) batches.set(key, { material: object.material, shadow: object.castShadow, geometries: [] });
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
      batches.get(key).geometries.push(geometry);
      originals.add(object.geometry);
    });
    props.clear();
    for (const batch of batches.values()) {
      const merged = new THREE.Mesh(mergeGeometries(batch.geometries), batch.material);
      merged.castShadow = batch.shadow; merged.receiveShadow = true; props.add(merged);
      batch.geometries.forEach((geometry) => geometry.dispose());
    }
    originals.forEach((geometry) => geometry.dispose());
  }
  function ring(x, z, radius, color = 0xf1cb6f, parent = props) {
    const m = mesh(new THREE.TorusGeometry(radius, 0.045, 6, 56), color, x, 0.08, z, parent);
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  function plaque(text, x, y, z, width = 1.5, parent = props) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
    const c = canvas.getContext('2d'); c.fillStyle = '#234b40'; c.fillRect(0, 0, 512, 160);
    c.strokeStyle = '#dbc582'; c.lineWidth = 4; c.strokeRect(7, 7, 498, 146);
    c.fillStyle = '#f4e3b3'; c.font = 'bold 58px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 84, 470);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide }); material.userData.transient = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 3.2), material); sign.position.set(x, y, z); parent.add(sign); return sign;
  }
  function timberBridge(z) {
    for (let i = 0; i < 6; i++) box(2.3, 0.12, 0.27, i % 2 ? 0xb48d5d : 0xc09a69, 0, 0.45, z - 0.8 + i * 0.3, props);
    for (const x of [-0.85, 0.85]) cylinder(0.1, 0.7, 0x6b573e, x, 0.35, z, props);
  }
  function bale(parent, size = 1) {
    const g = new THREE.Group(); parent.add(g);
    box(1.2 * size, 0.65 * size, 0.65 * size, 0xd7b858, 0, 0, 0, g);
    for (const x of [-0.34, 0.34]) box(0.06 * size, 0.68 * size, 0.68 * size, 0x8c7040, x * size, 0, 0, g);
    for (let i = 0; i < 6; i++) box(1.21 * size, 0.018 * size, 0.66 * size, 0xb39040, 0, (i * 0.1 - 0.25) * size, 0, g);
    return g;
  }
  function basket(parent) {
    const g = new THREE.Group(); parent.add(g);
    cylinder(0.06, 2.25, 0xb2bbb3, 0, 1.13, 0, g);
    cylinder(0.65, 0.12, 0xd6b455, 0, 2.1, 0, g);
    cylinder(0.65, 0.07, 0x919d98, 0, 0.83, 0, g);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      cylinder(0.014, 1.15, 0xc2cbc0, Math.sin(a) * 0.44, 1.46, Math.cos(a) * 0.44, g);
      cylinder(0.025, 0.3, 0x9ea99e, Math.sin(a) * 0.62, 0.99, Math.cos(a) * 0.62, g);
    }
    const rim = mesh(new THREE.TorusGeometry(0.65, 0.035, 6, 24), 0xa5b3a9, 0, 1.13, 0, g);
    rim.rotation.x = Math.PI / 2;
    return g;
  }
  function buildEvent() {
    resetProps();
    previewDots = null; windFlag = null;
    const { kind } = config.events[eventIndex];
    actor.root.position.set(0, 0, 7);
    actor.root.rotation.set(0, Math.PI, 0);
    if (isThrow()) {
      const court = box(7.4, 0.04, 19.5, kind === 'kubb' ? 0x78945e : 0x7e9d68, 0, 0.015, -1.7, props); court.castShadow = false;
      const grass = material(config.theme === 'lake' ? 0x668361 : 0x7d8b45).map.clone();
      grass.repeat.set(2.2, 5.8); grass.needsUpdate = true;
      court.material = new THREE.MeshStandardMaterial({ color: kind === 'kubb' ? 0x8da768 : 0x91ab71, map: grass, bumpMap: grass, bumpScale: 0.025, roughness: 1 });
      court.material.userData.transient = true;
      for (const x of [-3.75, 3.75]) box(0.035, 0.035, 19.5, 0xe2d4ad, x, 0.06, -1.7, props);
      box(7.5, 0.035, 0.07, 0xf2dfac, 0, 0.06, 6.55, props);
      const line = ring(0, 7, 0.55, 0xeed8a3); line.scale.z = 0.7;
      const previewMaterial = new THREE.MeshBasicMaterial({ color: 0xf8e5b0 }); previewMaterial.userData.transient = true;
      previewDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), previewMaterial, 22); props.add(previewDots);
      if (kind === 'bale') projectile = bale(props, 0.8);
      else if (kind === 'disc') projectile = cylinder(0.29, 0.07, 0xecc566, 0, 0, 0, props);
      else projectile = cylinder(0.09, 0.65, 0xd9ba7a, 0, 0, 0, props);
      projectile.visible = false;
      marker = ring(0, -7, 0.45, 0xf7e6ad);
      if (kind === 'kubb') {
        blocks = [
          { x: -2.1, z: -5.8, king: false }, { x: 0, z: -5.8, king: false },
          { x: 2.1, z: -5.8, king: false }, { x: 0, z: -9, king: true }
        ];
        blocks.forEach((b, i) => {
          b.down = false;
          b.mesh = box(b.king ? 0.5 : 0.36, b.king ? 1.25 : 0.85, 0.4, b.king ? 0xd9b758 : 0xe4c493, b.x, b.king ? 0.625 : 0.425, b.z, props);
          if (b.king) for (let i = -1; i <= 1; i++) box(0.12, 0.18, 0.4, 0xd9b758, i * 0.17, 0.71, 0, b.mesh);
          else {
            for (const y of [-0.2, 0.15]) box(0.37, 0.018, 0.41, 0xc49e66, 0, y, 0, b.mesh);
            plaque(String(i + 1), b.x, 0.18, b.z + 0.7, 0.45);
          }
          b.guide = ring(b.x, b.z, b.king ? 0.7 : 0.65, b.king ? 0xbfae66 : 0xe7e1c0);
        });
        for (const x of [-3.2, 3.2]) for (const z of [-10, 6.5]) {
          cylinder(0.045, 0.6, 0xd7b978, x, 0.3, z, props);
          box(0.3, 0.2, 0.02, 0xe8d2a1, x + 0.12, 0.57, z, props);
        }
        plaque('KUBBAR FÖRST · KUNGEN SIST', 0, 1.8, -12, 4.8);
      } else {
        targetProp = new THREE.Group(); props.add(targetProp);
        if (kind === 'disc') {
          basket(targetProp);
          ring(0, 0, 0.85, 0xc1d0a2, targetProp);
          plaque('KORG', 0, 2.5, 0, 0.85, targetProp);
          cylinder(0.04, 2.6, 0xd6c59b, 3.25, 1.3, -4.5, props);
          windFlag = new THREE.Group(); windFlag.position.set(3.25, 2.4, -4.5); props.add(windFlag);
          const flag = mesh(new THREE.PlaneGeometry(0.9, 0.4, 6, 2), 0xd99b6b, 0.46, 0, 0, windFlag);
          flag.material = new THREE.MeshStandardMaterial({ color: 0xdca375, side: THREE.DoubleSide, roughness: 1 }); flag.material.userData.transient = true;
        } else { ring(0, 0, 1.4, 0xeac66a, targetProp); ring(0, 0, 2.6, 0xd6c59b, targetProp); ring(0, 0, 0.3, 0xffe4a0, targetProp); }
      }
      nextTarget();
    } else if (kind === 'race') {
      carry = new THREE.Group(); props.add(carry);
      const tray = box(1.2, 0.42, 1.55, 0x6b8b74, 0, 0.77, -0.5, carry);
      tray.rotation.x = -0.08;
      const wheel = cylinder(0.31, 0.16, 0x373e36, 0, 0.34, -1.2, carry);
      wheel.rotation.z = Math.PI / 2;
      for (const x of [-0.43, 0.43]) box(0.07, 0.07, 2.5, 0xb99b65, x, 0.68, 0, carry);
      const load = bale(carry, 0.75); load.position.set(0, 1.13, -0.48);
      obstacles = [];
      for (let i = 0; i < 10; i++) {
        const x = Math.sin(i * 2.3) * 2.25;
        const z = -1 - i * 5.2;
        const obstacle = mesh(new THREE.DodecahedronGeometry(0.65, 0), 0x7b8070, x, 0.4, z, props);
        obstacle.scale.y = 0.7;
        obstacles.push({ x, z, hit: false, mesh: obstacle });
      }
      for (const x of [-3.6, 3.6]) cylinder(0.08, 3, 0xc8b789, x, 1.5, -55, props);
      box(7.4, 0.48, 0.1, 0xe6c86d, 0, 2.7, -55, props);
    } else {
      carry = new THREE.Group(); props.add(carry);
      if (kind === 'bucket') {
        cylinder(0.53, 0.75, 0xb5c1ba, 0, 0.8, 0, carry, 0.65);
        water = cylinder(0.59, 0.025, 0xf0e9d5, 0, 1.16, 0, carry);
        const handle = mesh(new THREE.TorusGeometry(0.6, 0.035, 6, 24, Math.PI), 0x83948c, 0, 1.15, 0, carry);
        handle.rotation.z = 0;
      } else {
        const log = cylinder(0.48, 15, 0x775b3b, 0, 0.25, -1, props);
        log.rotation.x = Math.PI / 2;
        for (const z of [-8.5, 6.5]) {
          const end = cylinder(0.47, 0.02, 0xb49462, 0, 0.25, z, props);
          end.rotation.x = Math.PI / 2;
          for (const r of [0.16, 0.29, 0.4]) {
            const growth = mesh(new THREE.TorusGeometry(r, 0.015, 5, 30), 0x7d633e, 0, 0.25, z + (z < 0 ? -0.015 : 0.015), props);
            growth.rotation.x = 0;
          }
        }
        const pond = mesh(new THREE.CircleGeometry(7, 64), 0x648b89, 0, 0.025, -1, props);
        pond.rotation.x = -Math.PI / 2; pond.scale.set(0.7, 1.4, 1); pond.castShadow = false;
        for (const z of [7.3, -9.3]) timberBridge(z);
        for (let i = 0; i < 30; i++) {
          const angle = i / 30 * Math.PI * 2, x = Math.sin(angle) * 4.6, z = -1 + Math.cos(angle) * 9.2;
          const rock = mesh(new THREE.IcosahedronGeometry(0.32 + i % 3 * 0.09, 1), i % 2 ? 0x879180 : 0x9a9b87, x, 0.08, z, props); rock.scale.set(1.3, 0.6, 1);
          for (let j = 0; j < 2; j++) {
            const reed = cylinder(0.02, 0.6 + j * 0.25, 0xa1a06a, x + j * 0.12, 0.35, z, props); reed.rotation.z = Math.sin(i) * 0.15;
          }
        }
        for (const r of [1.1, 1.8, 2.5]) {
          const ripple = ring(2.2, 1.1, r, 0x86a5a0); ripple.scale.z = 0.55;
        }
        for (let i = 0; i < 7; i++) box(0.025, 0.018, 14.8, 0x9c7a49, -0.35 + i * 0.115, 0.61 + Math.sin(i / 6 * Math.PI) * 0.11, -1, props);
        plaque('ANDRA SIDAN VÄNTAR', 0, 1.5, -10.5, 3.3);
        // The bridge, pond edge and reeds never move; keep their rich detail cheap on phones.
        batchStaticProps();
      }
    }
  }
  function nextTarget() {
    const { kind } = config.events[eventIndex];
    if (kind === 'kubb') {
      wind = 0;
      target = { x: 0, z: blocks.some((b) => !b.down && !b.king) ? -5.8 : -9 };
      return;
    }
    target = [{ x: -1.5, z: -5 }, { x: 2.1, z: -8.4 }, { x: -0.7, z: -10.4 }][attempts % 3];
    wind = kind === 'disc' ? [-0.65, 1.05, -1.25][attempts % 3] : 0;
    targetProp.position.set(target.x, 0, target.z);
    if (windFlag) windFlag.rotation.y = wind < 0 ? Math.PI : 0;
  }
  function hud() {
    const event = config.events[eventIndex];
    const total = scores.reduce((a, b) => a + b, 0);
    const value = `${total.toLocaleString('sv-SE')} p`;
    const detail = `Gren ${eventIndex + 1}/3 · ${config.place} ${config.year}`;
    if (lastHUD !== value + detail) { game.setHUD(config.title, value, detail); lastHUD = value + detail; }
    kicker.textContent = `GREN ${eventIndex + 1} AV 3`;
    eventTitle.textContent = event.name;
    actionButton.textContent = event.verb;
    if (isThrow()) {
      const predicted = landing(aim, power, wind);
      const targetPower = clamp((7 - target.z - 5) / 15, 0, 1);
      meter.style.setProperty('--zone', `${targetPower * 100}%`);
      meter.classList.remove('balance');
      fill.style.width = `${power * 100}%`;
      marker.position.x = predicted.x;
      marker.position.z = predicted.z;
      marker.visible = !flight;
      hint.textContent = charging ? 'Släpp vid det ljusa fältet · följ kastbågen' : '← → sikta längs kastbågen · håll & släpp';
      readout.textContent = event.kind === 'kubb' ? `${attempts}/6 kast · ${blocks.filter((b) => b.down).length}/4 fällda` : `Kast ${Math.min(attempts + 1, 3)}/3 · ${Math.round(power * 100)} % kraft${wind ? ` · Vind ${wind < 0 ? '←' : '→'} ${Math.abs(wind).toFixed(1)}` : ''}`;
    } else if (event.kind === 'race') {
      meter.classList.remove('balance');
      meter.style.setProperty('--zone', '90%');
      fill.style.width = `${cargo}%`;
      hint.textContent = '← → styr · håll mellanslag för att springa';
      readout.textContent = `${Math.round(cargo)} % hö kvar · ${Math.max(0, Math.ceil(raceZ + 55))} m till mål`;
    } else {
      meter.classList.add('balance');
      meter.style.setProperty('--zone', '50%');
      fill.style.width = '4px';
      fill.style.left = `${clamp(50 + balance.tilt * 37, 0, 100)}%`;
      hint.textContent = held.action ? 'Du stadgar dig · släpp för att gå vidare' : '← → små motrörelser · håll för att stadga';
      readout.textContent = `${Math.round(balance.cargo)} % ${event.kind === 'bucket' ? 'mjölk' : 'balans'} · ${Math.min(100, Math.round(balance.progress / 18 * 100))} % av sträckan · ${Math.ceil(Math.max(0, 50 - elapsed))} s kvar`;
    }
  }
  function startEvent() {
    clearInput();
    mode = 'playing';
    game.hidePanel();
    controls.hidden = false;
    attempts = 0; eventScores = []; aim = 0; power = 0.2; flight = null; between = 0;
    elapsed = 0; raceZ = 7; cargo = 100; playerX = 0;
    balance = { tilt: 0.05, velocity: 0, cargo: 100, progress: 0 };
    fill.style.left = '0';
    buildEvent();
    hud();
    actionButton.focus({ preventScroll: true });
  }
  function eventIntro() {
    mode = 'intro';
    clearInput();
    controls.hidden = true;
    const event = config.events[eventIndex];
    game.showPanel({
      eyebrow: `${config.place.toUpperCase()} · GREN ${eventIndex + 1} AV 3`, title: event.name,
      body: `<p>${event.instructions}</p><p class="country-note">${eventIndex ? `Du har ${scores.reduce((a, b) => a + b, 0).toLocaleString('sv-SE')} poäng. ` : ''}Upp till 1 000 poäng per gren.</p>`,
      button: 'Kör grenen', onStart: startEvent
    });
  }
  function finishEvent(score, summary) {
    if (mode !== 'playing') return;
    mode = 'result';
    clearInput();
    controls.hidden = true;
    score = Math.round(clamp(score, 0, 1000));
    scores.push(score);
    actor.setExpression(score >= 650 ? 'grin' : 'smile');
    game.tone(score >= 650 ? 660 : 330, 0.3, 'triangle');
    const done = eventIndex === config.events.length - 1;
    const total = scores.reduce((a, b) => a + b, 0);
    const previousBest = game.loadBest();
    if (done) game.saveBest(total);
    game.showPanel({
      eyebrow: done ? `${config.place.toUpperCase()} · ${config.year}` : `GREN ${eventIndex + 1} KLAR`,
      title: done ? medal(total) : `${score.toLocaleString('sv-SE')} poäng`,
      body: done ? `<p>${total.toLocaleString('sv-SE')} poäng av 3 000</p><div class="country-results">${scores.map((s, i) => `<span>${config.events[i].name}</span><b>${s}</b>`).join('')}</div><p class="country-note">${total > previousBest ? 'Nytt personbästa!' : `Personbästa: ${Math.max(previousBest, total).toLocaleString('sv-SE')} poäng`} · Tre nya chanser väntar.</p>` : `<p>${summary}</p><p class="country-note">Nästa gren: ${config.events[eventIndex + 1].name}</p>`,
      button: done ? 'Spela igen' : 'Nästa gren',
      onStart: () => {
        if (done) { eventIndex = 0; scores = []; lastHUD = ''; } else eventIndex++;
        eventIntro();
      }
    });
  }
  function landThrow() {
    const { kind } = config.events[eventIndex];
    const { end } = flight;
    flight = null;
    attempts++;
    let gained = 0;
    if (kind === 'kubb') {
      const hit = kubbHit(blocks, end);
      if (hit.prematureKing) {
        blocks[hit.index].mesh.rotation.z = 1.45;
        finishEvent(blocks.filter((b) => b.down && !b.king).length * 200, 'Kungen föll för tidigt. Nästa gång tar vi kubbarna först.');
        return;
      }
      if (hit.index >= 0) {
        const b = blocks[hit.index]; b.down = true; b.mesh.rotation.z = 1.45; b.mesh.position.y = 0.2;
        b.guide.visible = false;
        gained = b.king ? 400 : 200;
        game.toast(b.king ? 'Kungen är din!' : 'Kubb nere!');
        eventScores.push(gained);
      } else game.toast('Förbi! Justera sikte och kraft.');
    } else {
      const distance = Math.hypot(end.x - target.x, end.z - target.z);
      gained = kind === 'disc' && distance < 0.7 ? 1000 : precisionScore(distance, kind === 'disc' ? 4.5 : 4);
      eventScores.push(gained);
      game.toast(distance < 0.7 ? (kind === 'disc' ? 'I korgen!' : 'Mitt i prick!') : `${distance.toFixed(1)} m från mitten · ${gained} p`);
    }
    game.tone(gained > 500 ? 740 : gained > 0 ? 440 : 170, 0.16, 'triangle');
    between = 1.65;
  }
  function updateThrow(dt) {
    if (between > 0) {
      between -= dt;
      if (between <= 0) {
        const { kind } = config.events[eventIndex];
        if (attempts >= (kind === 'kubb' ? 6 : 3) || (kind === 'kubb' && blocks.every((b) => b.down))) {
          const points = eventScores.reduce((a, b) => a + b, 0);
          finishEvent(kind === 'kubb' ? points : points / 3, kind === 'kubb' ? `${blocks.filter((b) => b.down).length} av fyra träfigurer fällda.` : 'Poängen är medelvärdet av dina tre precisionskast.');
          return;
        }
        projectile.visible = false;
        nextTarget();
      }
      return;
    }
    aim = clamp(aim + input() * dt * 0.55, -1, 1);
    if (charging) power = 0.08 + 0.92 * (0.5 - Math.cos((clock - throwStart) * 2.2) * 0.5);
    const { kind } = config.events[eventIndex];
    const predicted = landing(aim, power, wind);
    if (previewDots) {
      previewDots.visible = !flight;
      for (let i = 0; i < 22; i++) {
        const k = (i + 1) / 23;
        const p = kind === 'disc' ? discPosition(predicted, power, wind, k, throwIsCaught(predicted, target)) : { x: predicted.x * k, y: 1 + Math.sin(k * Math.PI) * (2 + power * 2) - k * 0.65, z: 7 + (predicted.z - 7) * k };
        previewDummy.position.set(p.x, p.y, p.z); previewDummy.updateMatrix(); previewDots.setMatrixAt(i, previewDummy.matrix);
      }
      previewDots.instanceMatrix.needsUpdate = true;
    }
    if (windFlag) {
      const flag = windFlag.children[0], vertices = flag.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) vertices.setZ(i, Math.sin(clock * 5 + vertices.getX(i) * 6) * 0.065 * (vertices.getX(i) + 0.5));
      vertices.needsUpdate = true;
    }
    if (flight) {
      flight.t += dt;
      const t = clamp(flight.t / flight.duration, 0, 1);
      if (kind === 'disc') {
        const point = discPosition(flight.end, flight.power, flight.wind, t, flight.caught);
        projectile.position.set(point.x, point.y, point.z);
        projectile.rotation.z = Math.sin(t * Math.PI) * flight.wind * 0.12;
      } else projectile.position.set(flight.end.x * t, 1 + Math.sin(t * Math.PI) * (2 + flight.power * 2) - t * 0.65, 7 + (flight.end.z - 7) * t);
      if (kind === 'disc') projectile.rotation.y += dt * 18;
      else projectile.rotation.x += dt * 5;
      if (t >= 1) {
        landThrow();
      }
    }
    const pose = POSES.stand();
    pose.upperArmR = [-0.4 - (charging ? power * 0.7 : flight ? 1.1 : 0), 0, -0.25];
    pose.forearmR = [-0.5, 0, 0];
    actor.setPose(pose, 0.15);
  }
  function updateRace(dt) {
    const running = held.action || game.keys.has('Space');
    const steer = input();
    playerX = clamp(playerX + steer * dt * (running ? 4.3 : 3.3), -3.3, 3.3);
    const speed = running ? 4.7 : 3.1;
    raceZ -= speed * dt;
    actor.root.position.set(playerX, 0, raceZ + 0.8);
    carry.position.set(playerX, 0, raceZ);
    carry.rotation.z = -steer * (running ? 0.12 : 0.06);
    actor.setPose(POSES.walk(elapsed * (running ? 10 : 7)), 0.3);
    for (const obstacle of obstacles) {
      if (!obstacle.hit && Math.abs(obstacle.z - (raceZ - 1.2)) < 0.8 && Math.abs(obstacle.x - playerX) < 1.05) {
        obstacle.hit = true;
        cargo = Math.max(0, cargo - 15);
        obstacle.mesh.material = new THREE.MeshStandardMaterial({ color: 0xb47d55, roughness: 1 });
        obstacle.mesh.material.userData.transient = true;
        game.toast('Oj! 15 % av höet ramlade av.');
        game.tone(110, 0.12, 'triangle');
      }
    }
    if (raceZ <= -55) finishEvent(cargo * 8 + Math.max(0, 200 - Math.max(0, elapsed - 14) * 18), `Du kom fram på ${elapsed.toFixed(1)} sekunder med ${Math.round(cargo)} % av höet kvar.`);
  }
  function updateBalance(dt) {
    const brace = held.action || game.keys.has('Space');
    balance = advanceBalance(balance, input(), brace, elapsed, dt);
    const { kind } = config.events[eventIndex];
    const z = 6 - balance.progress / 18 * 13;
    actor.root.position.set(balance.tilt * 0.36, kind === 'log' ? 0.7 : 0, z);
    actor.root.rotation.z = -balance.tilt * 0.45;
    const pose = POSES.walk(elapsed * (brace ? 1 : 4));
    pose.upperArmL = [-0.15, 0, kind === 'log' ? 1.3 : 0.3];
    pose.upperArmR = [-0.15, 0, kind === 'log' ? -1.3 : -0.3];
    actor.setPose(pose, 0.2);
    if (kind === 'bucket') {
      carry.position.set(0, 0, z - 0.8);
      carry.rotation.z = -balance.tilt * 0.7;
      water.position.y = 0.45 + balance.cargo / 100 * 0.7;
      water.rotation.z = balance.tilt * 0.7;
    }
    if (balance.cargo <= 0 || elapsed >= 50 || balance.progress >= 18) {
      finishEvent((balance.cargo * 9 + Math.max(0, 100 - Math.max(0, elapsed - 20) * 4)) * Math.min(1, balance.progress / 18), balance.cargo <= 0 ? 'Det blev en vinglig färd. Små motrörelser håller balansen bättre.' : balance.progress < 18 ? `Tiden tog slut efter ${Math.round(balance.progress / 18 * 100)} % av sträckan. Släpp STADGA oftare för att hinna fram.` : `I mål med ${Math.round(balance.cargo)} % ${kind === 'bucket' ? 'mjölk' : 'balans'} kvar på ${elapsed.toFixed(1)} sekunder.`);
    }
  }
  game.onFrame((dt, time) => {
    clock = time;
    const narrow = camera.aspect < 0.85;
    const currentKind = config.events[eventIndex].kind;
    const racing = currentKind === 'race' && (mode === 'playing' || mode === 'result');
    const balancing = currentKind === 'log' && mode === 'playing';
    const followZ = racing ? raceZ : balancing ? Math.min(0, actor.root.position.z + 0.5) : 0;
    const active = mode === 'playing';
    cameraTarget.set(narrow ? (balancing ? 1.6 : 0.8) : 7.8, active ? (balancing ? 7.2 : 9.3) : 11.5, followZ + (active ? (balancing ? 12.5 : 17.2) : 22));
    camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 4));
    const foreground = narrow && active ? (balancing ? 0.5 : 2.2) : balancing ? -1 : -0.5;
    lookTarget.set(container.clientHeight < 500 && !narrow ? 2 : 0, balancing ? 0.8 : 0.65, followZ + (racing ? -7 : foreground));
    cameraLook.lerp(lookTarget, 1 - Math.exp(-dt * 4)); camera.lookAt(cameraLook);
    if (mode === 'playing') {
      elapsed += dt;
      if (isThrow()) updateThrow(dt);
      else if (config.events[eventIndex].kind === 'race') updateRace(dt);
      else updateBalance(dt);
      if (++updateCounter % 3 === 0) hud();
    } else actor.setPose(mode === 'result' ? POSES.cheer(time) : POSES.idle(time), 0.15);
    actor.update(dt, time);
    spectators.forEach((person, i) => {
      person.setPose(mode === 'result' ? POSES.clap(time + i) : POSES.idle(time + i * 3), 0.2);
      person.update(dt, time);
    });
  });
  camera.position.set(10, 12, 22);
  camera.lookAt(0, 1, -2);
  buildEvent();
  game.setHUD(config.title, '0 p', `${config.place} · ${config.year}`);
  game.showPanel({
    eyebrow: `${config.place.toUpperCase()} · ${config.year} · ARKADTOLKNING`, title: config.title,
    body: `<p>${config.description}</p><div class="country-event-list">${config.events.map((e, i) => `<span><b>0${i + 1}</b>${e.name}</span>`).join('')}</div><p class="country-note">Tre grenar. En pokal. ${config.champion} vann det verkliga året; här spelar du en fri tolkning med nya grenar.</p>`,
    button: 'Till första grenen', onStart: eventIntro
  });
  return { destroy() {
    clearInput();
    for (const person of [actor, ...spectators]) { scene.remove(person.root); person.dispose(); }
    game.destroy();
    disposeMaterials();
  } };
}
