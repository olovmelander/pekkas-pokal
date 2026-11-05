import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCrowd } from '../shared/people.js';

/** The playing field is worn turf, not a flat green illustration. All artwork
 * belongs to this stadium and is released by the arcade scene disposer. */
function pitchTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1536;
  const ctx = canvas.getContext('2d');
  let seed = 2011;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const at = (y * canvas.width + x) * 4;
    const mowing = Math.floor(y / 137) % 2 ? 7 : -5;
    const grain = (random() - 0.5) * 22;
    const patch = Math.sin(x * 0.019 + y * 0.006) * Math.cos(y * 0.029) * 4;
    image.data[at] = 52 + mowing + grain + patch;
    image.data[at + 1] = 100 + mowing + grain + patch;
    image.data[at + 2] = 48 + mowing * 0.6 + grain * 0.5;
    image.data[at + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const px = x => (x + 19) / 38 * canvas.width;
  const pz = z => (z + 28) / 56 * canvas.height;
  // Goal mouths and the centre circle wear differently from the wings.
  for (const [x, z, radius] of [[0, 22.5, 3.6], [0, -22.5, 3.6], [0, 0, 2.2]]) {
    const gradient = ctx.createRadialGradient(px(x), pz(z), 0, px(x), pz(z), radius * 30);
    gradient.addColorStop(0, '#b6a36b66'); gradient.addColorStop(0.55, '#a4925b28'); gradient.addColorStop(1, '#a4925b00');
    ctx.fillStyle = gradient; ctx.fillRect(px(x) - 130, pz(z) - 130, 260, 260);
  }
  for (let i = 0; i < 24000; i++) {
    const x = random() * 1024, y = random() * 1536;
    ctx.strokeStyle = i % 3 ? '#b6c47625' : '#192d242e'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 1.5, y - 1.5 - random() * 3.5); ctx.stroke();
  }
  ctx.strokeStyle = '#f4f1dce8'; ctx.fillStyle = '#f4f1dc'; ctx.lineWidth = 2.9;
  const rect = (x, z, w, h) => ctx.strokeRect(px(x), pz(z), w / 38 * 1024, h / 56 * 1536);
  const circle = (x, z, r, start = 0, end = Math.PI * 2) => {
    ctx.beginPath(); ctx.ellipse(px(x), pz(z), r / 38 * 1024, r / 56 * 1536, 0, start, end); ctx.stroke();
  };
  rect(-15, -24, 30, 48);
  ctx.beginPath(); ctx.moveTo(px(-15), pz(0)); ctx.lineTo(px(15), pz(0)); ctx.stroke();
  circle(0, 0, 4.15);
  for (const side of [-1, 1]) {
    rect(-7, side < 0 ? -24 : 17, 14, 7);
    rect(-3.4, side < 0 ? -24 : 21.2, 6.8, 2.8);
    circle(0, side * 19.1, 0.09); circle(0, side * 19.1, 3.1, side < 0 ? 0.75 : Math.PI + 0.75, side < 0 ? Math.PI - 0.75 : Math.PI * 2 - 0.75);
    for (const x of [-15, 15]) {
      const angle = side < 0 ? (x < 0 ? 0 : Math.PI / 2) : (x < 0 ? Math.PI * 1.5 : Math.PI);
      circle(x, side * 24, 0.55, angle, angle + Math.PI / 2);
    }
  }
  circle(0, 0, 0.09);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function concreteTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#a0a9aa'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6500; i++) {
    const x = (i * 131.37) % 256, y = (i * 47.13) % 256;
    ctx.fillStyle = i % 2 ? '#ffffff12' : '#14202a16'; ctx.fillRect(x, y, 1.6, 1);
  }
  ctx.strokeStyle = '#24323d44'; ctx.lineWidth = 2;
  for (const y of [0, 128, 255]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(3, 3); return texture;
}

function signTexture(lines, width = 1024, height = 256) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const paint = (rows = lines) => {
    ctx.fillStyle = '#0b1721'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#bd9c56'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, width - 16, height - 16);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    rows.forEach((row, i) => {
      ctx.fillStyle = i ? '#e8e8d7' : '#f3cd79';
      ctx.font = `${i ? '500' : 'bold'} ${rows.length > 1 ? 44 : 58}px ${i ? 'Arial' : 'Georgia'}`;
      ctx.fillText(row, width / 2, height * (i + 1) / (rows.length + 1), width - 45);
    });
    // Close up, the score panel reads as individual light emitters.
    ctx.fillStyle = '#00000024';
    for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
  };
  paint();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, update(rows) { paint(rows); texture.needsUpdate = true; } };
}

/** Detailed tiered stands, netting, staff and lighting stay separate from the
 * match actors. Static architecture is merged per material for phone GPUs. */
export function buildStadiumArt(scene) {
  const root = new THREE.Group(); root.name = 'fantasy-stadium'; scene.add(root);
  const architecture = new THREE.Group(); root.add(architecture);
  const materials = new Map();
  const mat = (color, roughness = 0.8, metalness = 0) => {
    const key = `${color}-${roughness}-${metalness}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
    return materials.get(key);
  };
  const concreteMap = concreteTexture();
  const concrete = mat(0x71808a); concrete.map = concreteMap; concrete.bumpMap = concreteMap; concrete.bumpScale = 0.035;
  const pale = mat(0xd8dace), steel = mat(0x8295a1, 0.36, 0.65), ink = mat(0x172b3c), roof = mat(0x344a5a, 0.5, 0.55);
  const gold = mat(0xc5a661, 0.45, 0.5), brick = mat(0x625758);
  const mesh = (geometry, material, x, y, z, parent = architecture) => {
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.receiveShadow = true; parent.add(m); return m;
  };
  const box = (w, h, d, material, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
  const rod = (from, to, radius = 0.055, material = steel, parent = architecture) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
    const m = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), material, ...a.clone().add(b).multiplyScalar(0.5).toArray(), parent);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m;
  };
  const panel = (text, width, height, x, y, z, rotation = 0) => {
    const art = signTexture(text); const material = new THREE.MeshStandardMaterial({ map: art.texture, emissiveMap: art.texture, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.65 });
    const sign = mesh(new THREE.PlaneGeometry(width, height), material, x, y, z); sign.rotation.y = rotation; return art;
  };
  box(340, 0.5, 340, mat(0x26342e), 0, -0.6, 0);
  // The venue belongs to a place: perimeter paths and lit entrances lead
  // into the stands, with a quieter dark tree belt beyond them.
  const paving = mat(0x494c4b); paving.map = concreteMap;
  for (const side of [-1, 1]) {
    box(5.5, 0.08, 82, paving, side * 33, -0.28, 0);
    box(70, 0.08, 5.5, paving, 0, -0.28, side * 39);
    box(39, 3.2, 0.5, brick, 0, 1.3, side * 36);
    for (const x of [-14, -7, 7, 14]) {
      box(2.4, 2.3, 0.6, ink, x, 0.9, side * 36.2);
      box(2.2, 0.07, 0.7, gold, x, 2.08, side * 36.2);
      for (const dx of [-0.8, 0, 0.8]) box(0.035, 2.2, 0.7, steel, x + dx, 0.9, side * 36.2);
    }
    for (const x of [-23, 23]) {
      const tower = new THREE.Group(); tower.position.set(x, 0, side * 33); tower.rotation.y = Math.sign(x) * side * Math.PI / 6; architecture.add(tower);
      box(5.4, 5.1, 4.2, brick, 0, 2.3, 0, tower);
      box(5.8, 0.25, 4.6, roof, 0, 4.95, 0, tower);
      for (const y of [1.4, 3.4]) for (const dx of [-1.6, 0, 1.6]) {
        box(1.1, 1.2, 0.1, ink, dx, y, 2.15, tower);
        const glass = mat(0xe6be75, 0.4); glass.emissive.set(0xc58d40); glass.emissiveIntensity = 0.3;
        box(0.95, 1.03, 0.12, glass, dx, y, 2.2, tower);
        box(1.1, 0.055, 0.14, steel, dx, y, 2.23, tower);
        box(0.055, 1.2, 0.14, steel, dx, y, 2.23, tower);
      }
    }
  }
  box(39, 0.18, 57, mat(0x4c6450), 0, -0.09, 0);
  const turf = new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 1, color: 0xffffff });
  const field = mesh(new THREE.PlaneGeometry(38, 56), turf, 0, 0.025, 0); field.rotation.x = -Math.PI / 2;
  // Dark drainage channels and a red maintenance strip enclose the turf.
  for (const side of [-1, 1]) {
    box(1.5, 0.04, 58, mat(0x705956), side * 19.5, 0.03, 0);
    box(0.12, 0.035, 55, ink, side * 18.6, 0.045, 0);
    for (let z = -27; z <= 27; z += 0.8) box(0.2, 0.015, 0.045, steel, side * 18.6, 0.07, z);
    box(37, 0.04, 2, mat(0x705956), 0, 0.03, side * 28);
    // Full depth net: back, roof, and both sides sag gently between ropes.
    const net = [], goalZ = side * 24, backZ = goalZ + side * 1.85;
    const segment = (a, b) => net.push(...a, ...b);
    for (let x = -3.1; x <= 3.11; x += 0.25) {
      segment([x, 0.1, backZ], [x, 2.43, backZ]);
      segment([x, 2.55, goalZ], [x, 2.43, backZ]);
    }
    for (let y = 0.1; y <= 2.55; y += 0.25) {
      segment([-3.1, y, backZ], [3.1, y, backZ]);
      for (const x of [-3.1, 3.1]) segment([x, y, goalZ], [x, Math.min(y, 2.43), backZ]);
    }
    for (let d = 0; d < 1.86; d += 0.25) {
      segment([-3.1, 2.55 - d * 0.065, goalZ + side * d], [3.1, 2.55 - d * 0.065, goalZ + side * d]);
      for (const x of [-3.1, 3.1]) segment([x, 0.1, goalZ + side * d], [x, 2.55 - d * 0.065, goalZ + side * d]);
    }
    const ropes = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(net, 3)), new THREE.LineBasicMaterial({ color: 0xc4d5d2, transparent: true, opacity: 0.63 })); root.add(ropes);
    rod([-3.1, 2.6, goalZ], [3.1, 2.6, goalZ], 0.09, pale);
    for (const x of [-3.1, 3.1]) {
      rod([x, 0.05, goalZ], [x, 2.6, goalZ], 0.09, pale);
      rod([x, 0.05, goalZ], [x, 0.05, backZ], 0.055, pale);
      rod([x, 2.6, goalZ], [x, 2.43, backZ], 0.045, steel);
      rod([x, 2.43, backZ], [x, 0.05, backZ], 0.045, steel);
    }
  }
  const seatPoints = [];
  for (const side of [-1, 1]) {
    for (let row = 0; row < 6; row++) {
      const x = side * (21 + row * 1.2), y = 0.75 + row * 0.68;
      box(1.3, y, 58, concrete, x, y / 2, 0);
      box(0.08, 0.045, 58, pale, x - side * 0.48, y + 0.04, 0);
      for (let section = 0; section < 5; section++) for (let chair = 0; chair < 8; chair++) {
        const z = -26 + section * 11 + chair * 0.9;
        seatPoints.push({ position: [x, y + 0.05, z], rotationY: -side * Math.PI / 2, pose: 'sit', row, chair, section });
      }
    }
    // A real roof has fascia, seams, cantilever trusses and a back wall.
    box(8.8, 0.25, 61, roof, side * 25, 8.15, 0);
    box(0.2, 0.6, 61, pale, side * 20.65, 7.9, 0);
    box(0.4, 7.2, 61, brick, side * 29.2, 3.6, 0);
    for (let z = -29; z <= 29; z += 2) box(8.7, 0.07, 0.04, steel, side * 25, 8.32, z);
    for (let z = -27; z <= 28; z += 11) {
      rod([side * 28.9, 0, z], [side * 28.9, 8, z], 0.12, steel);
      rod([side * 28.9, 7.8, z], [side * 20.8, 7.8, z], 0.07, steel);
      rod([side * 28.9, 6.1, z], [side * 20.8, 7.8, z], 0.07, steel);
      for (let row = 0; row < 6; row++) {
        const y = 0.75 + row * 0.68, x = side * (21 + row * 1.2);
        rod([x, y + 0.05, z + 8.1], [x, y + 0.9, z + 8.1], 0.025, gold);
        if (row < 5) rod([x, y + 0.9, z + 8.1], [x + side * 1.2, y + 1.58, z + 8.1], 0.025, gold);
      }
    }
    panel(['PEKKAS POKAL  ·  FANTASY 2011'], 44, 0.8, side * 19.1, 0.75, 0, -side * Math.PI / 2);
    for (let row = 0; row < 4; row++) {
      const z = side * (30 + row * 1.3), y = 0.75 + row * 0.72;
      box(37, y, 1.4, concrete, 0, y / 2, z);
      for (let chair = 0; chair < 32; chair++) {
        if (chair === 10 || chair === 21) continue;
        seatPoints.push({ position: [-16 + chair * 1.02, y + 0.05, z], rotationY: side < 0 ? 0 : Math.PI, pose: 'sit', row, chair, section: 5 });
      }
    }
    box(39, 0.5, 0.35, ink, 0, 4.8, side * 35.5);
    panel([side < 0 ? 'HEMMAKLACKEN' : 'PEKKAS ARENA'], 15, 1, 0, 4.1, side * 35.2, side < 0 ? 0 : Math.PI);
    // Two covered dugouts, seats and a low technical-area boundary.
    const dugout = new THREE.Group(); dugout.position.set(side * 17.3, 0, 5); dugout.rotation.y = -side * Math.PI / 2; architecture.add(dugout);
    box(6.6, 0.12, 1.6, concrete, 0, 0.1, 0, dugout);
    box(6.8, 0.13, 1.8, roof, 0, 2.2, 0, dugout);
    box(6.7, 1.7, 0.07, mat(0x57717b, 0.26, 0.3), 0, 1.2, -0.7, dugout);
    for (let i = 0; i < 6; i++) {
      box(0.65, 0.13, 0.65, ink, -2.65 + i * 1.06, 0.55, -0.03, dugout);
      box(0.65, 0.65, 0.12, ink, -2.65 + i * 1.06, 0.85, -0.35, dugout);
    }
    for (const x of [-3.25, 3.25]) rod([x, 0.1, -0.7], [x, 2.2, -0.7], 0.07, steel, dugout);
  }
  const chairParts = [new THREE.BoxGeometry(0.64, 0.1, 0.54).translate(0, 0.46, 0), new THREE.BoxGeometry(0.64, 0.48, 0.09).translate(0, 0.72, -0.25)];
  const chairs = new THREE.InstancedMesh(mergeGeometries(chairParts), mat(0xffffff, 0.48), seatPoints.length);
  chairParts.forEach(geometry => geometry.dispose());
  const dummy = new THREE.Object3D(), seatColors = [0x566f7c, 0x375465, 0xa78d4c];
  seatPoints.forEach((seat, i) => {
    dummy.position.fromArray(seat.position); dummy.rotation.y = seat.rotationY; dummy.updateMatrix(); chairs.setMatrixAt(i, dummy.matrix);
    chairs.setColorAt(i, new THREE.Color(seatColors[(seat.section + Math.floor(seat.chair / 3)) % 3]));
  });
  chairs.receiveShadow = true; root.add(chairs);
  // Detailed baked people replace capsule dots; sparse gaps reveal the seats.
  const crowd = createCrowd({ seats: seatPoints.filter((_, i) => i % 3 === 0), seed: 2011, castShadow: false,
    palette: { tops: [0xc5a449, 0xd4bd79, 0x243844, 0x3e6377, 0x8e5149, 0xe0d8b7] } }); root.add(crowd.root);
  const scoreboard = panel(['PEKKAS ARENA', 'UNDER STRÅLKASTARNA · 2011'], 12.5, 3.1, 0, 8.2, -35.3);
  box(13.1, 3.7, 0.4, ink, 0, 8.2, -35.6);
  for (const x of [-5.2, 5.2]) rod([x, 0, -35.5], [x, 9, -35.5], 0.18, steel);
  const lamp = new THREE.MeshBasicMaterial({ color: 0xf1f2df });
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d');
  const glow = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, '#ddecffb3'); glow.addColorStop(0.16, '#ddecff66'); glow.addColorStop(0.5, '#ddecff19'); glow.addColorStop(1, '#ddecff00');
  glowContext.fillStyle = glow; glowContext.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas); glowTexture.colorSpace = THREE.SRGBColorSpace;
  const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.42 });
  for (const x of [-25, 25]) for (const z of [-28, 28]) {
    for (const dx of [-0.22, 0.22]) rod([x + dx, 0, z], [x + dx, 16, z], 0.07, steel);
    for (let y = 0.5; y < 15.7; y += 1.1) {
      rod([x - 0.22, y, z], [x + 0.22, y + 0.55, z], 0.025, steel);
      rod([x + 0.22, y + 0.55, z], [x - 0.22, y + 1.1, z], 0.025, steel);
    }
    const bank = new THREE.Group(); bank.position.set(x, 16, z); bank.lookAt(0, 0, 0); architecture.add(bank);
    box(4.9, 1.7, 0.3, ink, 0, 0, 0, bank);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 6; col++) {
      box(0.64, 0.6, 0.07, steel, -2 + col * 0.8, -0.4 + row * 0.8, 0.2, bank);
      box(0.52, 0.46, 0.035, lamp, -2 + col * 0.8, -0.4 + row * 0.8, 0.25, bank);
    }
    const light = new THREE.SpotLight(0xe1ebff, 240, 90, 0.9, 0.85, 1.4);
    light.position.set(x, 15.8, z); light.target.position.set(x * 0.12, 0, z * 0.1); root.add(light, light.target);
    const halo = new THREE.Sprite(glowMaterial); halo.position.set(x, 16, z); halo.scale.set(6.8, 3.8, 1); root.add(halo);
  }
  // Corner flags give a scale cue against the long painted touch lines.
  const flags = [];
  for (const x of [-15, 15]) for (const z of [-24, 24]) {
    rod([x, 0, z], [x, 1.55, z], 0.025, pale);
    const flag = mesh(new THREE.PlaneGeometry(0.6, 0.35, 5, 2), new THREE.MeshStandardMaterial({ color: 0xe1b14d, side: THREE.DoubleSide, roughness: 0.9 }), x + 0.3, 1.35, z, root); flags.push(flag);
  }
  // Merge static pieces in world space; hundreds of fixtures are ~20 draws.
  architecture.updateMatrixWorld(true);
  const batches = new Map();
  architecture.traverse(object => {
    if (!object.isMesh) return;
    if (!batches.has(object.material)) batches.set(object.material, []);
    batches.get(object.material).push(object.geometry.clone().applyMatrix4(object.matrixWorld));
    object.geometry.dispose();
  });
  architecture.clear();
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
    const combined = new THREE.Mesh(geometry, material); combined.receiveShadow = true;
    combined.castShadow = material === roof || material === brick;
    architecture.add(combined);
  }
  crowd.update(0, 0);
  let crowdFrame = 0;
  return {
    root,
    highlight(row) { scoreboard.update([row.goals ? 'MÅÅÅL!' : 'MATCHDAG', `${row.player.name.toUpperCase()}  +${row.total} POÄNG`]); if (row.goals) crowd.react('cheer', 2.3); else crowd.react('polite', 1.5); },
    update(dt, time, reducedMotion) {
      crowdFrame += dt;
      if (crowdFrame >= 0.06) { crowd.update(reducedMotion ? 0 : crowdFrame, reducedMotion ? 0 : time); crowdFrame = 0; }
      if (!reducedMotion) for (const flag of flags) {
        const { position } = flag.geometry.attributes;
        for (let i = 0; i < position.count; i++) position.setZ(i, Math.sin(time * 3.1 + position.getX(i) * 8) * 0.045 * (position.getX(i) + 0.3));
        position.needsUpdate = true;
      }
    },
    dispose() { crowd.dispose(); }
  };
}
