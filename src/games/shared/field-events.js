import { createArcade } from './arcade.js';
import { createPerson, appearanceFor, POSES } from './people.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildNature, buildScenicSky } from './scenic.js';
import { buildFieldGarden, buildFlowerBorders } from './field-garden.js';
import { clamp, precisionScore, jumpScore, hoopCrossing, medalFor, chargePower, croquetEnd, fieldThrowScore } from '../pentathlon/rules.js';

const EVENTS = {
  rings: { title: 'Ringkast', verb: 'HÅLL & SLÄPP', rule: 'Sikta med pilarna. Håll för kraft, släpp för att kasta. Den prickade bågen visar kastet och den vita markören på mätaren visar lagom längd. En ring runt pinnen ger 100 poäng. Tre försök.' },
  hurdles: { title: 'Häcklopp', verb: 'HOPPA', rule: 'Du springer automatiskt. Hoppa strax före varje häck med mellanslag eller knappen. Sex rena passager ger full pott.' },
  target: { title: 'Prickkast', verb: 'LÅS SIKTET', rule: 'Siktet rör sig över tavlan. Första trycket låser sidled, andra låser höjd och kastar. Sikta mot mitten. Tre försök.' },
  jump: { title: 'Längdhopp', verb: 'HOPPA', rule: 'Ansatsen går automatiskt. Hoppa precis före den vita plankan. Övertramp ger noll. Tre försök, ditt bästa hopp räknas.' },
  balance: { title: 'Balansgång', verb: 'HÅLL BALANSEN', rule: 'Håll vänster eller höger för att hålla markören i mitten. Vinden skiftar. Klarar du hela stocken utan att falla?' },
  boule: { title: 'Boule', verb: 'HÅLL & SLÄPP', rule: 'Sikta med pilarna och håll för kraft. Släpp för att kasta när kraften ligger nära den vita markören. Kom närmare lillen än silverklotet. Tre lägen.' },
  croquet: { title: 'Krocket', verb: 'HÅLL & SLÄPP', rule: 'Sikta med pilarna längs den prickade linjen. Håll för kraft och släpp för att rulla genom den lysande bågen. Tre bågar, högst sex slag. Missar du får du försöka från samma plats.' }
};

export async function createFieldGames(container, config) {
  const a = await createArcade(container, {
    id: config.id, title: config.title, subtitle: `${config.location} · ${config.year}`,
    accent: config.accent, sky: config.theme === 'park' ? '#a7b8aa' : '#b4c9be', fog: '#bec7aa'
  });
  const { THREE, scene, camera } = a;
  a.root.classList.add('field-game');
  const materials = new Map();
  const mat = (color, metalness = 0, roughness = 0.8) => {
    const key = `${color}-${metalness}-${roughness}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, metalness, roughness }));
    return materials.get(key);
  };
  let textureSeed = 1047 + config.year;
  const random = () => {
    textureSeed = (Math.imul(textureSeed, 1664525) + 1013904223) >>> 0;
    return textureSeed / 4294967296;
  };
  function surfaceTexture(type) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = type === 'wood' ? '#e1d1b7' : '#e4e8d8'; ctx.fillRect(0, 0, 512, 512);
    if (type === 'grass') {
      for (let i = 0; i < 36; i++) {
        const patch = ctx.createRadialGradient(random() * 512, random() * 512, 8, random() * 512, random() * 512, 180);
        patch.addColorStop(0, i % 2 ? '#81946933' : '#f1e0ad33'); patch.addColorStop(1, '#ffffff00');
        ctx.fillStyle = patch; ctx.fillRect(0, 0, 512, 512);
      }
    }
    for (let i = 0; i < 7500; i++) {
      const x = random() * 512, y = random() * 512, shade = Math.round(140 + random() * 105);
      ctx.strokeStyle = `rgba(${shade},${shade},${Math.max(0, shade - 12)},0.27)`;
      ctx.fillStyle = ctx.strokeStyle;
      if (type === 'gravel') {
        ctx.beginPath(); ctx.ellipse(x, y, 0.7 + random() * 2.1, 0.7 + random() * 1.1, random() * 3, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + (type === 'wood' ? random() * 70 : random() * 4 - 2), y + (type === 'wood' ? random() * 1.2 : 2 + random() * 8));
        ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(type === 'grass' ? 10 : type === 'gravel' ? 4 : 1, type === 'grass' ? 10 : type === 'gravel' ? 8 : 1);
    texture.anisotropy = Math.min(4, a.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }
  const grassTexture = surfaceTexture('grass'), gravelTexture = surfaceTexture('gravel');
  const woodTexture = surfaceTexture('wood');
  ['#83976a', '#a5a879', '#7b9562'].forEach((color) => { mat(color).map = grassTexture; });
  ['#b5ae8a', '#c1b08c', '#d7bc7f'].forEach((color) => { mat(color).map = gravelTexture; });
  ['#8b6a49', '#a38050', '#d5c39c', '#a77745'].forEach((color) => { mat(color).map = woodTexture; });
  const sky = buildScenicSky({ horizon: '#eadbc1', zenith: '#91afbb', cloudiness: 0.36, reducedMotion: a.reducedMotion, sunDirection: a.sun?.position });
  scene.add(sky.mesh);
  const world = new THREE.Group();
  const eventWorld = new THREE.Group();
  scene.add(world, eventWorld);
  function mesh(geometry, color, x, y, z, parent = world, metal = 0) {
    const m = new THREE.Mesh(geometry, mat(color, metal));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  }
  const box = (w, h, d, color, x, y, z, parent = world) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent);
  const ball = (r, color, x, y, z, parent = world, metal = 0) => mesh(new THREE.SphereGeometry(r, 18, 12), color, x, y, z, parent, metal);
  const pole = (r, h, color, x, y, z, parent = world) => mesh(new THREE.CylinderGeometry(r, r, h, 10), color, x, y, z, parent);
  function label(text, x, y, z, width = 5, parent = world) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#203b31'; ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = '#d6ba74'; ctx.lineWidth = 6; ctx.strokeRect(16, 16, 992, 224);
    ctx.fillStyle = '#f1dfad'; ctx.font = 'italic 66px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 130, 930);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, side: THREE.DoubleSide }));
    sign.material.userData.fieldTransient = true;
    sign.position.set(x, y, z); parent.add(sign); return sign;
  }
  const groundGeometry = new THREE.PlaneGeometry(180, 180, 48, 48);
  const groundVertices = groundGeometry.attributes.position;
  for (let v = 0; v < groundVertices.count; v++) {
    const x = groundVertices.getX(v), z = groundVertices.getY(v);
    const outside = Math.min(1, Math.max(0, Math.abs(x) - 8) / 14 + Math.max(0, z - 22) / 20);
    groundVertices.setZ(v, outside * (1.4 + Math.sin(x * 0.12 + z * 0.09) * 1.2));
  }
  groundGeometry.computeVertexNormals();
  const lawn = mesh(groundGeometry, '#83976a', 0, -0.035, -4); lawn.rotation.x = -Math.PI / 2; lawn.castShadow = false;
  for (const x of [-5.2, 5.2]) box(1.6, 0.035, 34, '#b5ae8a', x, 0, -4);
  for (let i = 0; i < 14; i++) {
    const hill = ball(8 + random() * 5, i % 2 ? '#81987c' : '#94a588', -65 + i * 10, 1.6, -55 - (i % 3) * 6);
    hill.scale.set(1.8, 0.3, 1.3); hill.castShadow = false;
  }
  for (const x of [-7.5, 7.5]) {
    for (let z = 12; z >= -24; z -= 4) {
      pole(0.07, 1.1, '#d7d1a6', x, 0.55, z);
      box(0.06, 0.1, 4.1, '#c7c6a0', x, 0.65, z - 2);

    }
  }
  // A restrained skyline identifies the setting without pretending to reproduce the historic venue.
  if (config.theme === 'park') {
    box(7, 4.6, 3, '#aa8274', 0, 2.3, -31);
    for (const x of [-2.8, 2.8]) {
      box(1.6, 7, 1.6, '#a2786c', x, 3.5, -30.5);
      mesh(new THREE.ConeGeometry(1.4, 5, 4), '#486f6b', x, 9.5, -30.5).rotation.y = Math.PI / 4;
      for (let y = 2.4; y < 6; y += 1.4) box(0.45, 0.8, 0.05, '#524e49', x, y, -29.66);
    }
    for (const x of [-12, 12]) {
      box(5.8, 4, 4, '#dbc59f', x, 2, -28);
      mesh(new THREE.ConeGeometry(4.4, 2, 4), '#685f58', x, 5, -28).rotation.y = Math.PI / 4;
      for (let i = 0; i < 4; i++) box(0.6, 1.1, 0.05, '#7e9796', x - 1.8 + i * 1.2, 2.4, -25.97);
    }
  } else {
    box(7, 3.2, 5, '#9f5142', -10, 1.6, -25);
    for (let x = -13.4; x < -6.5; x += 0.25) box(0.045, 3.15, 0.06, '#b46a50', x, 1.6, -22.46);
    for (const x of [-13.4, -6.6]) box(0.16, 3.35, 0.12, '#f0dfb8', x, 1.65, -22.4);
    box(0.5, 1.2, 0.55, '#735a4d', -11.2, 5.6, -25.7);
    const roof = mesh(new THREE.ConeGeometry(5.2, 2.6, 4), '#4e5552', -10, 4.35, -25); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.82;
    for (const x of [-12, -8]) {
      box(1.2, 1.3, 0.12, '#f1dfb4', x, 1.8, -22.45);
      box(0.9, 1, 0.15, '#809b9b', x, 1.8, -22.35);
      box(0.06, 1.1, 0.18, '#eee4c7', x, 1.8, -22.25);
    }
    for (let i = 0; i < 7; i++) {
      const h = mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.2, 16), '#c1a763', 10 + i % 3, 0.65, -20 - Math.floor(i / 3) * 1.2); h.rotation.z = Math.PI / 2;
    }
  }
  // Human-scale rest spots frame the competition lawn rather than a featureless lane.
  for (const side of [-1, 1]) {
    const x = side * 6.3, z = side < 0 ? 2.5 : -10;
    for (let i = 0; i < 4; i++) box(0.17, 0.08, 2.3, '#aa8556', x - 0.3 + i * 0.2, 0.58, z);
    for (const dz of [-0.8, 0.8]) {
      box(0.7, 0.53, 0.08, '#45554b', x, 0.27, z + dz);
      box(0.07, 1.05, 0.08, '#45554b', x + side * 0.4, 0.53, z + dz);
    }
    for (const y of [0.9, 1.12]) box(0.08, 0.15, 2.3, '#aa8556', x + side * 0.4, y, z);
    const pot = mesh(new THREE.CylinderGeometry(0.5, 0.37, 0.7, 16), '#ae7456', x, 0.35, z - 1.9);
    for (let i = 0; i < 8; i++) ball(0.16, i % 2 ? '#d3a7a4' : '#e9dcb1', Math.sin(i * 2.4) * 0.3, 0.75 + (i % 3) * 0.1, Math.cos(i * 2.4) * 0.3, pot);
  }
  // Bunting, brass trophy, picnic table and hand-lettered event sign.
  for (const x of [-7, 7]) pole(0.08, 5, '#d5c39c', x, 2.5, -19);
  const cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-7, 4.8, -19), new THREE.Vector3(0, 4.35, -19), new THREE.Vector3(7, 4.8, -19)]), new THREE.LineBasicMaterial({ color: '#f0d8a3' })); world.add(cord);
  for (let i = 0; i < 15; i++) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.32, 0, 0, 0.32, 0, 0, 0, -0.65, 0], 3)); geometry.computeVertexNormals();
    const flag = mesh(geometry, ['#cf795c', '#e5c475', '#638f87'][i % 3], -6.7 + i * 0.95, 4.35 + Math.abs(7 - i) * 0.06, -19); flag.material.side = THREE.DoubleSide;
  }
  label(`${config.location} · ${config.year}`, 0, 3.35, -19, 7);
  box(3.7, 0.18, 1.5, '#8b6a49', 5.6, 1, -8);
  for (const x of [4.1, 7.1]) box(0.14, 1, 1.2, '#6f6749', x, 0.5, -8);
  mesh(new THREE.CylinderGeometry(0.42, 0.15, 0.6, 24), '#d9b462', 5.6, 1.5, -8, world, 0.75);
  pole(0.06, 0.3, '#c5a15a', 5.6, 1.15, -8); pole(0.25, 0.08, '#c5a15a', 5.6, 1.05, -8);
  for (const side of [-1, 1]) { const handle = mesh(new THREE.TorusGeometry(0.22, 0.045, 8, 18), '#d9b462', 5.6 + side * 0.36, 1.55, -8, world, 0.75); handle.scale.y = 1.2; }
  const garden = buildFieldGarden({ THREE, world, mesh, box, pole, ball, mat, random, theme: config.theme });
  // The park has hundreds of small shapes, but a phone should draw only a few
  // material batches. Bake static transforms once; keep gameplay meshes separate.
  world.updateMatrixWorld(true);
  const batches = new Map();
  const originals = [];
  world.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const key = `${object.material.uuid}:${Object.keys(geometry.attributes).sort().join(',')}:${object.castShadow}`;
    if (!batches.has(key)) batches.set(key, { geometries: [], material: object.material, castShadow: object.castShadow });
    batches.get(key).geometries.push(geometry); originals.push(object);
  });
  for (const batch of batches.values()) {
    const combined = new THREE.Mesh(mergeGeometries(batch.geometries), batch.material);
    combined.castShadow = batch.castShadow; combined.receiveShadow = true;
    world.add(combined); batch.geometries.forEach((geometry) => geometry.dispose());
  }
  originals.forEach((object) => { object.removeFromParent(); object.geometry.dispose(); });
  const trees = [], bushes = [], grasses = [];
  const terrainHeight = (x, z) => {
    const localZ = -z - 4;
    const outside = Math.min(1, Math.max(0, Math.abs(x) - 8) / 14 + Math.max(0, localZ - 22) / 20);
    return outside * (1.4 + Math.sin(x * 0.12 + localZ * 0.09) * 1.2) - 0.035;
  };
  for (let i = 0; i < 30; i++) {
    const side = i % 2 ? -1 : 1, x = side * (13 + random() * 7), z = 12 - Math.floor(i / 2) * 4.2 + random() * 2;
    trees.push({ x, y: terrainHeight(x, z), z, height: 7 + random() * 4.5, type: i % 4 ? 'birch' : 'spruce', haze: z < -30 ? 0.1 : 0 });
  }
  for (let i = 0; i < 17; i++) {
    const x = -35 + i * 4.5, z = -53 - random() * 8;
    trees.push({ x, y: terrainHeight(x, z), z, height: 10 + random() * 6, type: 'spruce', haze: 0.28 });
  }
  for (const side of [-1, 1]) for (let i = 0; i < 20; i++) {
    const x = side * (8.9 + random() * 1.4), z = 11 - i * 1.8;
    bushes.push({ x, y: terrainHeight(x, z), z, radius: 0.6 + random() * 0.45, color: config.theme === 'park' ? '#496f47' : '#69834e' });
    grasses.push({ x: side * (6.1 + random() * 0.2), z, radius: 0.32, height: 0.22, count: 22 });
    grasses.push({ x: side * (10.2 + random() * 2), y: terrainHeight(side * 11, z), z, radius: 1.2, height: 0.42, count: 35 });
  }
  const nature = buildNature({ trees, bushes, grass: grasses, seed: config.year, reducedMotion: a.reducedMotion, sunDirection: a.sun?.position });
  const flowers = buildFlowerBorders(THREE, { seed: config.year, park: config.theme === 'park' });
  scene.add(nature.group, flowers.group);
  const people = [];
  const athlete = createPerson(appearanceFor('Mikael Hägglund', { detail: 'low', outfit: { top: 'jersey', topColor: 0xd8b35f, bottom: 'shorts', bottomColor: 0x35555b } }));
  athlete.root.rotation.y = Math.PI; scene.add(athlete.root); people.push(athlete);
  ['Erik Vallgren', 'Per Vikman', 'Viktor Jones', 'Henrik Lundqvist'].forEach((name, i) => {
    const p = createPerson(appearanceFor(name, { detail: 'low', outfit: { top: 'polo', bottom: 'shorts' } }));
    p.root.position.set(i % 2 ? -6.2 : 6.2, 0.03, -1 - Math.floor(i / 2) * 4); p.root.rotation.y = i % 2 ? 0.8 : -0.8;
    scene.add(p.root); people.push(p);
  });
  const rail = document.createElement('div'); rail.className = 'field-progress'; rail.setAttribute('aria-label', 'Grenar'); a.ui.appendChild(rail);
  const stamp = document.createElement('div'); stamp.className = 'field-stamp'; stamp.textContent = `${config.location} · Sommarspelen`; a.ui.appendChild(stamp);
  const controls = document.createElement('div'); controls.className = 'field-console'; controls.hidden = true;
  controls.innerHTML = '<div class="field-label"></div><div class="field-hint"></div><div class="field-meter"><i></i><b></b></div><div class="field-buttons"><button type="button" class="field-left" aria-label="Sikta eller balansera vänster">←</button><button type="button" class="field-action">HÅLL & SLÄPP</button><button type="button" class="field-right" aria-label="Sikta eller balansera höger">→</button></div>';
  a.ui.appendChild(controls);
  const el = (s) => controls.querySelector(s);
  const hint = el('.field-hint'), title = el('.field-label'), meter = el('.field-meter'), fill = el('.field-meter i'), marker = el('.field-meter b');
  const action = el('.field-action'), left = el('.field-left'), right = el('.field-right');
  let eventIndex = 0, state = 'menu', kind = config.events[0], total = 0, results = [];
  let time = 0, attempt = 0, points = [], aim = 0, charge = 0, holding = false, wind = 0;
  let shot = null, readyAt = 0, target = { x: 0, z: -4 }, runnerZ = 7, jumpAt = -1, jumpData = null;
  let hurdles = [], cleared = 0, balance = 0, balancePoints = 0, falls = 0, stumble = 0;
  let targetAxis = 0, targetX = 0, targetY = 0, croquetHoops = [], hoopIndex = 0, strokes = 0;
  let projectile, ringTarget, aimMarker, targetBoard, targetReticle, opponentBall, eventSign, aimDots, croquetClub;
  const previewPose = new THREE.Object3D();
  let lastWidth = 0, lastHeight = 0;
  const buttons = { left: false, right: false };
  const clamp01 = (v) => clamp(v, 0, 1);
  const effectBits = [];
  function confetti(position) {
    for (let i = 0; i < 16; i++) {
      const b = box(0.05, 0.07, 0.025, ['#f7d37e', '#f3eee0', '#8db9a0'][i % 3], position.x, 0.6, position.z, eventWorld);
      effectBits.push({ mesh: b, age: 0, vx: Math.sin(i * 2.4) * 2, vy: 2 + (i % 4) * 0.6, vz: Math.cos(i * 2.4) * 2 });
    }
  }
  function updateRail() {
    rail.innerHTML = config.events.map((_, i) => `<span class="${i < eventIndex ? 'done' : i === eventIndex ? 'current' : ''}">${i < eventIndex ? '✓' : i + 1}</span>`).join('');
  }
  function disposeEvent() {
    eventWorld.traverse((obj) => {
      if (obj.isInstancedMesh) obj.dispose();
      obj.geometry?.dispose();
      if (obj.material?.userData?.fieldTransient) { obj.material.map?.dispose(); obj.material.dispose(); }
    });
    eventWorld.clear(); effectBits.length = 0;
  }
  function setupEvent() {
    disposeEvent();
    kind = config.events[eventIndex]; title.textContent = EVENTS[kind].title;
    attempt = 0; points = []; aim = 0; charge = 0; holding = false; shot = null; time = 0; readyAt = 0;
    runnerZ = 7; jumpAt = -1; jumpData = null; cleared = 0; balance = 0; balancePoints = 0; falls = 0; stumble = 0;
    targetAxis = 0; targetX = 0; targetY = 0; strokes = 0; hoopIndex = 0;
    target = { x: 0, z: -4 }; wind = 0.35;
    athlete.root.position.set(0, 0.02, 7); athlete.root.rotation.set(0, Math.PI, 0);
    projectile = null; ringTarget = null; targetBoard = null; targetReticle = null; opponentBall = null; aimMarker = null; aimDots = null; croquetClub = null;
    eventSign = label(EVENTS[kind].title, -5.8, 1.5, -13, 2.7, eventWorld);
    pole(0.06, 1.6, '#715c3c', -5.8, 0.8, -13, eventWorld);
    action.textContent = EVENTS[kind].verb;
    left.hidden = right.hidden = ['hurdles', 'target', 'jump'].includes(kind);
    action.disabled = kind === 'balance';
    meter.hidden = ['hurdles', 'target', 'jump'].includes(kind); meter.classList.toggle('balance', kind === 'balance');
    fill.style.left = '0'; fill.style.width = '0%'; marker.style.left = '66.67%';
    if (['rings', 'boule', 'croquet'].includes(kind)) {
      box(7, 0.03, 20, kind === 'boule' ? '#c1b08c' : '#7b9562', 0, 0.04, -2, eventWorld);
      for (const x of [-3.65, 3.65]) box(0.13, kind === 'boule' ? 0.22 : 0.045, 20, kind === 'boule' ? '#a38050' : '#cbd0ab', x, 0.1, -2, eventWorld);
      for (const z of [-12, 8]) box(7.4, kind === 'boule' ? 0.22 : 0.045, 0.13, kind === 'boule' ? '#a38050' : '#cbd0ab', 0, 0.1, z, eventWorld);
      const line = mesh(new THREE.TorusGeometry(0.58, 0.025, 6, 40), '#f6e3b1', 0, 0.08, 7, eventWorld); line.rotation.x = Math.PI / 2;
      aimDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), mat('#fff2bd'), 18); eventWorld.add(aimDots);
      if (kind === 'rings') {
        projectile = mesh(new THREE.TorusGeometry(0.46, 0.07, 10, 32), '#e5b84d', 0, 1.1, 6.3, eventWorld, 0.35);
        projectile.rotation.x = Math.PI / 2;
        ringTarget = new THREE.Group(); eventWorld.add(ringTarget);
        pole(0.075, 1.1, '#e7d19a', 0, 0.55, 0, ringTarget);
        pole(0.08, 0.18, '#cd7f59', 0, 1.02, 0, ringTarget);
        pole(0.32, 0.1, '#a77745', 0, 0.05, 0, ringTarget);
        const ring = mesh(new THREE.TorusGeometry(0.9, 0.025, 6, 40), '#ead9ab', 0, 0.04, 0, ringTarget); ring.rotation.x = Math.PI / 2;
      } else {
        projectile = ball(0.23, kind === 'boule' ? '#d5b765' : '#ce704e', 0, 0.24, 7, eventWorld, kind === 'boule' ? 0.65 : 0);
        if (kind === 'boule') {
          ringTarget = new THREE.Group(); eventWorld.add(ringTarget);
          ball(0.13, '#e7cd64', 0, 0.13, 0, ringTarget);
          opponentBall = ball(0.23, '#ced3cd', 0.9, 0.23, -4, eventWorld, 0.8);
        } else {
          croquetHoops = [{ x: -1.8, z: 2 }, { x: 1.7, z: -3 }, { x: -0.5, z: -8 }].map((h, i) => {
            const g = new THREE.Group(); g.position.set(h.x, 0, h.z); eventWorld.add(g);
            for (const x of [-0.8, 0.8]) pole(0.045, 1.1, '#f0e4c5', x, 0.55, 0, g);
            box(1.65, 0.09, 0.09, '#f0e4c5', 0, 1.1, 0, g);
            const glow = mesh(new THREE.TorusGeometry(1.1, 0.025, 6, 40), '#f8cf72', 0, 0.04, 0, g); glow.rotation.x = Math.PI / 2;
            label(String(i + 1), 0, 1.6, 0, 0.5, g);
            return { ...h, group: g, glow };
          });
          croquetClub = new THREE.Group(); eventWorld.add(croquetClub);
          box(0.7, 0.25, 0.25, '#80583b', 0, 0.2, 0, croquetClub);
          pole(0.035, 1.6, '#bb965f', 0, 0.9, 0, croquetClub);
          croquetClub.position.set(0.4, 0, 7.55);
        }
      }
      aimMarker = mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 30), '#faf2bd', 0, 0.06, -4, eventWorld); aimMarker.rotation.x = Math.PI / 2;
    }
    if (kind === 'target') {
      targetBoard = new THREE.Group(); targetBoard.position.set(0, 2.8, -5); eventWorld.add(targetBoard);
      for (let i = 0; i < 5; i++) {
        const disc = mesh(new THREE.CylinderGeometry(2 - i * 0.38, 2 - i * 0.38, 0.08, 64), ['#efdfb7', '#4c777e', '#d16e53', '#efc86e', '#f5e4b6'][i], 0, 0, i * 0.06, targetBoard);
        disc.rotation.x = Math.PI / 2;
      }
      for (const x of [-1, 1]) pole(0.1, 3.1, '#826b46', x, 1.55, -5.15, eventWorld);
      box(4.6, 4.6, 0.18, '#8b6a49', 0, 2.8, -5.35, eventWorld);
      for (const x of [-2.15, 2.15]) box(0.11, 4.4, 0.1, '#dbbf85', x, 2.8, -5.22, eventWorld);
      targetReticle = mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 24), '#ffffff', 0, 0, 0.4, targetBoard);
      projectile = ball(0.14, '#dcae56', 0, 1, 7, eventWorld);
    }
    if (kind === 'hurdles' || kind === 'jump') {
      box(3.2, 0.05, 31, '#af765e', 0, 0.04, -6, eventWorld);
      for (const x of [-1.4, 1.4]) box(0.045, 0.02, 31, '#ecd8ab', x, 0.075, -6, eventWorld);
      if (kind === 'hurdles') {
        hurdles = [3, -0.7, -4.4, -8.1, -11.8, -15.5].map((z) => {
          const g = new THREE.Group(); g.position.z = z; eventWorld.add(g);
          for (const x of [-1.1, 1.1]) pole(0.045, 0.75, '#ece5ca', x, 0.4, 0, g);
          box(2.4, 0.15, 0.14, '#ede5c7', 0, 0.8, 0, g);
          for (const x of [-0.8, 0, 0.8]) box(0.32, 0.16, 0.15, '#b85f4b', x, 0.8, 0, g);
          return { z, group: g, passed: false };
        });
        box(3, 0.03, 0.3, '#f4e5c4', 0, 0.1, -18, eventWorld);
      } else {
        box(3, 0.04, 0.32, '#f8e7c5', 0, 0.1, -3, eventWorld);
        box(4, 0.03, 10, '#d7bc7f', 0, 0.09, -9, eventWorld);
        for (const x of [-2.1, 2.1]) box(0.14, 0.16, 10.3, '#a38050', x, 0.12, -9, eventWorld);
        for (let i = 0; i < 22; i++) box(3.8, 0.012, 0.018, '#bba36e', 0, 0.115, -4.3 - i * 0.42, eventWorld);
        for (let i = 1; i <= 7; i++) { box(0.3, 0.04, 0.04, '#8c784e', 2.1, 0.14, -3 - i, eventWorld); }
      }
    }
    if (kind === 'balance') {
      box(0.72, 0.5, 21, '#a38050', 0, 0.55, -2, eventWorld);
      for (const z of [8, -12.5]) box(2.4, 0.22, 1.7, '#8b6a49', 0, 0.18, z, eventWorld);
      for (const x of [-1.7, 1.7]) for (let z = 7; z >= -12; z -= 3) {
        const reed = pole(0.018, 0.5, '#a5a067', x + Math.sin(z) * 0.2, 0.25, z, eventWorld); reed.rotation.z = Math.sin(z) * 0.2;
      }
      for (let z = 7; z >= -12; z -= 3) { box(1.3, 0.4, 0.35, '#746a43', 0, 0.2, z, eventWorld); }
      athlete.root.position.y = 0.8;
    }
    updateTargets(); updateRail(); updateHUD();
  }
  function updateTargets() {
    if (ringTarget) ringTarget.position.set(target.x, 0.06, target.z);
    if (opponentBall) opponentBall.position.set(target.x + 0.9, 0.23, target.z + 0.2);
    if (kind === 'croquet') {
      target = croquetHoops[Math.min(hoopIndex, 2)];
      croquetHoops.forEach((h, i) => { h.glow.visible = i === hoopIndex; });
    }
  }
  function updateHUD() {
    const detail = kind === 'croquet' ? `Bågar ${hoopIndex}/3 · Slag ${strokes}/6` : ['hurdles', 'balance'].includes(kind) ? `${EVENTS[kind].title} · ${eventIndex + 1}/${config.events.length}` : `Försök ${Math.min(attempt + 1, 3)}/3 · Gren ${eventIndex + 1}/${config.events.length}`;
    a.setHUD('POÄNG', total, detail);
  }
  function intro() {
    state = 'menu'; controls.hidden = true; setupEvent();
    a.showPanel({ eyebrow: `${config.year} · ${config.location} · Arkadtolkning`, title: config.title,
      body: `${config.events.length} grenar, en pokal. ${config.events.map((k) => EVENTS[k].title).join(' · ')}. Korta rundor med precision, rytm och balans. Delgrenarna är nygjorda för arkaden; den historiska grenlistan är inte dokumenterad. Rekord: ${a.loadBest() || 0} poäng.`,
      button: 'TILL FÖRSTA GRENEN', onStart: showEvent });
  }
  function showEvent() {
    setupEvent(); state = 'briefing'; controls.hidden = true;
    a.showPanel({ eyebrow: `Gren ${eventIndex + 1} av ${config.events.length}`, title: EVENTS[kind].title,
      body: EVENTS[kind].rule, button: 'JAG ÄR REDO', onStart: () => {
        a.hidePanel(); state = 'play'; time = 0; controls.hidden = false; hint.textContent = instruction();
        (kind === 'balance' ? left : action).focus({ preventScroll: true });
      } });
  }
  function instruction() {
    if (kind === 'balance') return '← / → eller håll knapparna · håll markören i mitten';
    if (kind === 'hurdles') return 'Mellanslag / tryck HOPPA strax före häcken';
    if (kind === 'jump') return 'Mellanslag / HOPPA precis före den vita plankan';
    if (kind === 'target') return targetAxis ? 'Sidled låst. Tryck igen när siktet är i mitten.' : 'Tryck / mellanslag för att låsa sidled först';
    if (kind === 'croquet') return '← / → sikta · håll mellanslag eller knappen, släpp för slag';
    return '← / → sikta · håll & släpp mellanslag eller knappen';
  }
  function finishEvent(score) {
    state = 'result'; holding = false; controls.hidden = true;
    const earned = clamp(Math.round(score), 0, 100); total += earned; results.push(earned); updateHUD();
    a.tone(earned >= 70 ? 880 : 440, 0.25, 'sine');
    const last = eventIndex === config.events.length - 1;
    a.showPanel({ eyebrow: `${earned >= 80 ? 'En mästarinsats' : earned >= 50 ? 'Snyggt jobbat' : 'Nästa försök sitter'} · ${earned}/100 poäng`,
      title: `${EVENTS[kind].title} klar`, body: `<div class="field-result-number">${earned}<small>av 100 poäng</small></div><p>${points.length ? `Försöken: ${points.join(' · ')} poäng. ` : ''}${kind === 'balance' ? `${falls} fall. Små korrigeringar hjälper dig att hålla mitten.` : kind === 'jump' ? 'Ditt bästa av tre hopp räknas. Avståndet mäts från plankan.' : kind === 'croquet' ? `${hoopIndex} av 3 bågar på ${strokes} slag.` : `Totalt ${total} poäng i tävlingen.`}</p>`,
      button: last ? 'VISA RESULTAT' : 'NÄSTA GREN', onStart: () => { if (last) finishCup(); else { eventIndex++; showEvent(); } } });
  }
  function finishCup() {
    const previous = a.loadBest() || 0; a.saveBest(total); state = 'final';
    const medal = medalFor(total, config.events.length);
    a.showPanel({ eyebrow: `${config.location} · ${config.year} · ${total > previous ? 'Nytt personbästa!' : 'Ditt resultat'}`, title: `${medal} i ${config.location}`,
      body: `<div class="field-result-number">${total}<small>av ${config.events.length * 100} poäng</small></div><div class="field-scorecard">${config.events.map((e, i) => `<span>${EVENTS[e].title}</span><b>${results[i]}<small>/100</small></b>`).join('')}</div><p>Guld: 80 poäng i snitt · Silver: 55 · Brons: 30.</p>`,
      button: 'SPELA IGEN', onStart: () => { eventIndex = 0; total = 0; results = []; showEvent(); } });
  }
  function startAction() {
    if (state !== 'play' || a.paused || shot || time < readyAt) return;
    if (kind === 'hurdles') { if (jumpAt < 0 || time - jumpAt > 0.9) { jumpAt = time; a.tone(330, 0.08, 'sine'); } return; }
    if (kind === 'jump') { if (jumpAt < 0) launchJump(); return; }
    if (kind === 'target') {
      if (!targetAxis) { targetAxis = 1; a.tone(520, 0.06, 'sine'); hint.textContent = instruction(); } else {
        const p = precisionScore(Math.hypot(targetX, targetY), 2.5);
        shot = { t: 0, duration: 0.8, from: new THREE.Vector3(0, 1.2, 7), to: new THREE.Vector3(targetX, 2.8 + targetY, -4.6), score: p };
        a.tone(220, 0.1, 'triangle');
      }
      return;
    }
    if (kind !== 'balance') { holding = true; charge = 0; action.classList.add('held'); }
  }
  function releaseAction() {
    action.classList.remove('held');
    if (!holding) return;
    holding = false;
    if (state !== 'play' || a.paused) return;
    const power = chargePower(charge);
    const start = kind === 'croquet' ? projectile.position.clone() : new THREE.Vector3(0, kind === 'rings' ? 1.2 : 0.9, 7);
    const destination = kind === 'croquet' ? croquetEnd(start, aim, power) : { x: aim + wind, z: start.z - (3 + power * 12) };
    const end = new THREE.Vector3(destination.x, kind === 'rings' ? 0.15 : 0.24, destination.z);
    const distance = Math.hypot(end.x - target.x, end.z - target.z);
    const p = fieldThrowScore(kind, distance);
    shot = { t: 0, duration: kind === 'croquet' ? 1.7 : 1.2, from: start, to: end, score: p };
    a.tone(240, 0.12, 'triangle');
    if (kind === 'croquet') { strokes++; shot.pass = hoopCrossing(start, end, target); updateHUD(); }
  }
  function launchJump() {
    jumpData = jumpScore(runnerZ); jumpAt = time;
    if (jumpData.foul) a.toast('Övertramp! Nästa försök.');
    else a.tone(440, 0.12, 'triangle');
  }
  function completeAttempt(score, message = '') {
    points.push(score); attempt++; updateHUD();
    a.toast(message || (score >= 85 ? `Mitt i prick! +${score}` : `+${score} poäng`));
    if (score >= 70) { confetti(target); a.tone(780, 0.16, 'sine'); } else a.tone(300, 0.12, 'triangle');
    if (attempt >= 3) { finishEvent(kind === 'jump' ? Math.max(...points) : points.reduce((sum, n) => sum + n, 0) / 3); return; }
    readyAt = time + 1.1; target = { x: attempt % 2 ? -1.8 : 1.6, z: -4 - attempt * 0.4 };
    wind = attempt % 2 ? -0.45 : 0.55; targetAxis = 0; aim = 0; charge = 0; jumpAt = -1; runnerZ = 7; jumpData = null;
    if (projectile) projectile.position.set(0, kind === 'rings' ? 1.2 : 0.24, 7);
    updateTargets(); hint.textContent = instruction();
  }
  function cancelInput() { if (holding) charge = 0; holding = false; buttons.left = buttons.right = false; action.classList.remove('held'); }
  const keyDown = (e) => {
    if (e.code === 'Space' && state === 'play') {
      e.preventDefault();
      if (!e.repeat && !e.target.closest?.('.field-buttons')) startAction();
    }
  };
  a.listen(window, 'keydown', keyDown);
  a.listen(window, 'keyup', (e) => { if (e.code === 'Space') releaseAction(); });
  a.listen(window, 'blur', cancelInput);
  a.listen(a.root, 'arcadepause', cancelInput);
  a.listen(document, 'visibilitychange', () => { if (document.hidden) cancelInput(); });
  a.listen(action, 'pointerdown', (e) => { e.preventDefault(); action.setPointerCapture(e.pointerId); startAction(); });
  a.listen(action, 'pointerup', (e) => { e.preventDefault(); releaseAction(); });
  a.listen(action, 'pointercancel', cancelInput);
  a.listen(action, 'lostpointercapture', () => { if (holding) cancelInput(); });
  // Enter and Space activate a focused button without synthetic pointer events.
  a.listen(action, 'keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) startAction(); } });
  a.listen(action, 'keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); releaseAction(); } });
  [[left, 'left'], [right, 'right']].forEach(([button, side]) => {
    a.listen(button, 'pointerdown', (e) => { e.preventDefault(); button.setPointerCapture(e.pointerId); buttons[side] = true; });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((event) => a.listen(button, event, () => { buttons[side] = false; }));
    a.listen(button, 'keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); buttons[side] = true; } });
    a.listen(button, 'keyup', () => { buttons[side] = false; });
  });
  const cameraGoal = new THREE.Vector3();
  const lookGoal = new THREE.Vector3();
  const cameraLook = new THREE.Vector3(0, 0, -4);
  function updateCamera(dt = 1) {
    const w = container.clientWidth || 800, h = container.clientHeight || 600;
    const portrait = w / h < 0.85;
    if (w !== lastWidth || h !== lastHeight) {
      lastWidth = w; lastHeight = h;
      camera.fov = portrait ? 53 : 43;
      camera.updateProjectionMatrix();
    }
    const racing = kind === 'hurdles' || kind === 'jump' || kind === 'balance';
    const follow = state === 'play' && racing ? Math.min(0, athlete.root.position.z) : state === 'play' && kind === 'croquet' ? ((shot ? shot.from.z : projectile.position.z) + target.z) / 2 - 0.4 : 0;
    if (state === 'play') {
      const targeting = kind === 'target';
      cameraGoal.set(portrait ? (targeting ? 1.1 : 1.4) : 6.5, targeting ? 7.4 : racing ? 9.5 : 10.5, (targeting ? 13.5 : racing ? 15 : 17.5) + follow);
      lookGoal.set(h < 500 && !portrait ? 2.2 : 0, targeting ? 2.1 : 0.7, follow + (targeting ? -3.5 : racing ? -1 : 0.4));
    } else {
      cameraGoal.set(portrait ? 4 : 10, portrait ? 24 : 19, portrait ? 28 : 24);
      lookGoal.set(0, 0, -4);
    }
    const blend = a.reducedMotion ? 1 : 1 - Math.exp(-dt * 4);
    camera.position.lerp(cameraGoal, blend);
    cameraLook.lerp(lookGoal, blend);
    camera.lookAt(cameraLook);
  }
  a.onFrame((dt, t) => {
    nature.update(t); sky.update(t); if (!a.reducedMotion) flowers.update(t);
    updateCamera(dt);
    eventSign?.lookAt(camera.position.x, 1.5, camera.position.z);
    for (let i = 1; i < people.length; i++) {
      people[i].setPose(state === 'result' || state === 'final' ? POSES.clap(t + i) : POSES.idle(t, undefined, i));
      people[i].update(dt, t);
    }
    for (let i = effectBits.length - 1; i >= 0; i--) {
      const b = effectBits[i]; b.age += dt; b.vy -= dt * 5;
      b.mesh.position.x += b.vx * dt; b.mesh.position.y += b.vy * dt; b.mesh.position.z += b.vz * dt; b.mesh.rotation.x += dt * 4;
      if (b.age > 1.4) { eventWorld.remove(b.mesh); b.mesh.geometry.dispose(); effectBits.splice(i, 1); }
    }
    if (state !== 'play') { athlete.setPose(state === 'result' ? POSES.cheer(t) : POSES.idle(t)); athlete.update(dt, t); return; }
    time += dt;
    const direction = (a.keys.has('ArrowRight') || a.keys.has('KeyD') || buttons.right ? 1 : 0) - (a.keys.has('ArrowLeft') || a.keys.has('KeyA') || buttons.left ? 1 : 0);
    if (holding) charge += dt;
    aim = clamp(aim + direction * dt * 3.5, -4.4, 4.4);
    if (!meter.classList.contains('balance')) { fill.style.width = `${chargePower(charge) * 100}%`; }
    if (['rings', 'boule', 'croquet'].includes(kind)) {
      if (kind === 'croquet') {
        const from = shot ? shot.from : projectile.position;
        athlete.root.position.set(from.x + 0.6, 0.05, from.z + 0.8);
        croquetClub.position.set(from.x + 0.2, 0, from.z + 0.5);
        croquetClub.rotation.x = shot ? Math.sin(Math.min(1, shot.t / 0.35) * Math.PI) * -0.4 : holding ? -0.18 : 0;
      }
      if (aimMarker) {
        const start = kind === 'croquet' ? projectile.position : { x: 0, z: 7 };
        const idealPower = kind === 'croquet' ? clamp01((Math.hypot(target.x - start.x, target.z - start.z) + 0.7 - 2) / 7) : clamp01((start.z - target.z - 3) / 12);
        const previewPower = holding ? chargePower(charge) : idealPower;
        const end = kind === 'croquet' ? croquetEnd(start, aim, previewPower) : { x: aim + wind, z: start.z - (3 + previewPower * 12) };
        aimMarker.position.set(end.x, 0.075, end.z);
        aimMarker.visible = !shot;
        marker.style.left = `${idealPower * 100}%`;
        aimDots.visible = !shot && time >= readyAt;
        for (let i = 0; i < 18; i++) {
          const k = (i + 1) / 19;
          previewPose.position.set(start.x + (end.x - start.x) * k, kind === 'croquet' ? 0.1 : (kind === 'rings' ? 1.2 : 0.9) * (1 - k) + 0.2 * k + Math.sin(k * Math.PI) * 3.3, start.z + (end.z - start.z) * k);
          previewPose.updateMatrix(); aimDots.setMatrixAt(i, previewPose.matrix);
        }
        aimDots.instanceMatrix.needsUpdate = true;
      }
      if (!shot && time >= readyAt) {
        hint.textContent = holding ? `${Math.round(chargePower(charge) * 100)} % kraft · släpp vid den vita markören` : kind === 'croquet' ? `Båge ${hoopIndex + 1}/3 · ${6 - strokes} slag kvar · följ den prickade linjen` : `Sikta ← → · ${kind === 'rings' ? `vind ${wind > 0 ? '→' : '←'}` : 'närmast lillen ger bonus'} · håll & släpp`;
      }
    }
    if (kind === 'target' && !shot) {
      if (!targetAxis) targetX = Math.sin(time * (1.65 + attempt * 0.2)) * 2.2;
      targetY = Math.sin(time * (2.1 + attempt * 0.2) + 0.8) * 1.8;
      targetReticle.position.set(targetX, targetY, 0.42);
    }
    if (shot) {
      shot.t += dt; const k = clamp01(shot.t / shot.duration);
      projectile.position.lerpVectors(shot.from, shot.to, k);
      if (kind !== 'croquet') projectile.position.y += Math.sin(k * Math.PI) * (kind === 'target' ? 0.5 : 3.3);
      projectile.rotation.y += dt * 5;
      if (k >= 1) {
        const result = shot; shot = null;
        if (kind === 'croquet') {
          if (result.pass) {
            hoopIndex++; confetti(result.to); a.toast('Genom bågen!'); a.tone(780, 0.16, 'sine');
            // Each succeeding hoop starts from the preceding hoop so all six strokes are useful.
            projectile.position.set(target.x, 0.24, target.z - 0.8);
          } else { projectile.position.copy(result.from); a.toast('Utanför bågen – justera siktet.'); }
          if (hoopIndex >= 3 || strokes >= 6) finishEvent(hoopIndex * 30 + (hoopIndex === 3 ? (6 - strokes) * 10 / 3 : 0));
          else { aim = 0; charge = 0; readyAt = time + 0.65; updateTargets(); updateHUD(); }
        } else {
          const distance = Math.hypot(result.to.x - target.x, result.to.z - target.z);
          completeAttempt(result.score, kind === 'boule' ? `${distance.toFixed(2)} m till lillen · ${distance < 0.92 ? 'närmast!' : 'silverklotet är närmare'} · ${result.score} p` : kind === 'rings' && distance <= 0.45 ? 'Runt pinnen! 100 poäng' : '');
        }
      }
    }
    if (kind === 'hurdles') {
      const previousZ = runnerZ; runnerZ -= dt * (stumble > 0 ? 1.3 : 2.55); stumble = Math.max(0, stumble - dt);
      const phase = jumpAt >= 0 ? (time - jumpAt) / 0.9 : 2;
      const height = phase < 1 ? Math.sin(phase * Math.PI) * 1.35 : 0;
      athlete.root.position.set(0, height + 0.05, runnerZ);
      for (const h of hurdles) if (!h.passed && previousZ >= h.z && runnerZ < h.z) {
        h.passed = true;
        if (height > 0.65) { cleared++; a.tone(600 + cleared * 50, 0.08, 'sine'); a.toast(`Rent! ${cleared}/6`); } else { h.group.rotation.x = -1.15; stumble = 0.7; a.tone(130, 0.15, 'triangle'); a.toast('Riven häck – hoppa lite tidigare.'); }
      }
      const next = hurdles.find((h) => !h.passed);
      hint.textContent = next ? `${runnerZ - next.z < 1.65 ? 'HOPPA NU!' : 'Nästa häck'} · ${Math.max(0, runnerZ - next.z).toFixed(1)} m · ${cleared}/6 rena` : 'Sista metrarna – mot mål!';
      athlete.setPose(POSES.brisk(t * 11));
      if (runnerZ <= -18) finishEvent(cleared / 6 * 100);
    } else if (kind === 'jump') {
      if (time >= readyAt && jumpAt < 0) {
        runnerZ -= dt * 2.8;
        if (runnerZ < -3.02) launchJump();
        hint.textContent = runnerZ < -1.5 ? 'PLANKAN! Hoppa nu – innan övertramp.' : `${Math.max(0, runnerZ + 3).toFixed(1)} m till plankan · vänta in hoppet`;
        athlete.setPose(POSES.brisk(t * 11));
      }
      if (jumpAt >= 0) {
        const phase = clamp01((time - jumpAt) / 1.4);
        athlete.root.position.set(0, Math.sin(phase * Math.PI) * (jumpData.foul ? 0.4 : 2.1), runnerZ - phase * jumpData.travel);
        athlete.setPose(POSES.ready(t));
        if (phase >= 1) { const score = jumpData.points; completeAttempt(score, jumpData.foul ? 'Övertramp – nästa chans väntar' : `${jumpData.distance.toFixed(2)} meter · ${score} poäng`); }
      } else athlete.root.position.set(0, 0.05, runnerZ);
    } else if (kind === 'balance') {
      const gust = (Math.sin(time * 1.7) * 0.34 + Math.sin(time * 0.6 + 1) * 0.22) * Math.min(1, 0.45 + time / 10);
      balance += (gust + balance * 0.4 + direction * 1.25) * dt;
      if (Math.abs(balance) > 1) { falls++; balance = Math.sign(balance) * 0.45; stumble = 0.8; a.toast('Oj! Upp på stocken igen.'); a.tone(170, 0.1, 'triangle'); }
      stumble = Math.max(0, stumble - dt);
      if (!stumble) balancePoints += dt * clamp01(1 - Math.abs(balance) * 0.6);
      fill.style.left = `${clamp01((balance + 1) / 2) * 100}%`;
      athlete.root.position.set(balance * 0.28, stumble ? 0.2 : 0.8, 7 - Math.min(1, time / 18) * 19);
      athlete.root.rotation.z = -balance * 0.35;
      const pose = POSES.brisk(t * 3); pose.upperArmL = [0, 0, 1.35]; pose.upperArmR = [0, 0, -1.35]; athlete.setPose(pose);
      hint.textContent = `${Math.ceil(Math.max(0, 18 - time))} s kvar · ${falls} fall · vind ${gust > 0 ? '→' : '←'}`;
      if (time >= 18) finishEvent(balancePoints / 18 * 100);
    } else {
      athlete.setPose(holding ? POSES.ready(t) : POSES.idle(t));
    }
    athlete.update(dt, t);
  });
  updateCamera(); intro();
  return { destroy() {
    cancelInput(); people.forEach((p) => { scene.remove(p.root); p.dispose(); }); a.destroy();
    garden.dispose();
    materials.forEach((material) => material.dispose());
    [grassTexture, gravelTexture, woodTexture].forEach((texture) => texture.dispose());
  } };
}
