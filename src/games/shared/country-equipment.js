import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Touchable timber and metal details for the invented 2016 garden sports. */
export function createCountryEquipment({ THREE, mesh, box, cylinder, material }) {
  const maps = [];
  const wood = material(0xb5a27a).map;
  for (const color of [0xb48d5d, 0xc09a69, 0x6b573e, 0xd9ba7a, 0xd9b758, 0xe4c493, 0xc49e66, 0xd7b978, 0xd6c59b, 0x9c7a49]) {
    material(color).map = wood; material(color).bumpMap = wood; material(color).bumpScale = 0.028;
  }
  function timberTexture(end) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const c = canvas.getContext('2d');
    let seed = 2016;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    c.fillStyle = end ? '#d9c59e' : '#9a8669'; c.fillRect(0, 0, 512, 512);
    if (end) {
      for (let i = 0; i < 42; i++) {
        c.strokeStyle = i % 3 ? '#795c3830' : '#f6e7c83c'; c.lineWidth = 0.7 + random() * 1.5;
        c.beginPath(); c.ellipse(246, 264, 4 + i * 6.9, 3 + i * 6.3, 0.09, 0, Math.PI * 2); c.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const a = random() * Math.PI * 2; c.strokeStyle = '#624a3566'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(256 + Math.sin(a) * 250, 256 + Math.cos(a) * 250); c.lineTo(256 + Math.sin(a + 0.07) * 170, 256 + Math.cos(a + 0.07) * 170); c.stroke();
      }
    } else {
      for (let i = 0; i < 90; i++) {
        const x = random() * 512, phase = random() * Math.PI * 2;
        c.strokeStyle = i % 3 ? '#403d3038' : '#e3d4b743'; c.lineWidth = 0.8 + random() * 6;
        c.beginPath(); for (let y = -10; y <= 522; y += 10) { const bx = x + Math.sin(y * 0.025 + phase) * 3 + Math.sin(y * 0.08) * 1.4; if (y === -10) c.moveTo(bx, y); else c.lineTo(bx, y); } c.stroke();
      }
      for (let i = 0; i < 220; i++) { c.fillStyle = i % 2 ? '#b9b89122' : '#3d413227'; c.fillRect(random() * 512, random() * 512, 1 + random() * 9, 2 + random() * 15); }
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; maps.push(map); return map;
  }
  const bark = timberTexture(false), endGrain = timberTexture(true);
  material(0x775b3b).map = bark; material(0x775b3b).bumpMap = bark; material(0x775b3b).bumpScale = 0.045;
  material(0x775b3b).color.set(0xb3a17f);
  material(0xb49462).map = endGrain; material(0xb49462).bumpMap = endGrain; material(0xb49462).bumpScale = 0.012;
  const rippleCanvas = document.createElement('canvas'); rippleCanvas.width = rippleCanvas.height = 256;
  const rippleContext = rippleCanvas.getContext('2d'), pixels = rippleContext.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const index = (y * 256 + x) * 4;
    const wave = 128 + Math.sin(y / 256 * Math.PI * 8 + Math.sin(x / 256 * Math.PI * 4)) * 32 + Math.sin((x + y) / 256 * Math.PI * 12) * 14;
    pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = wave; pixels.data[index + 3] = 255;
  }
  rippleContext.putImageData(pixels, 0, 0);
  const rippleMap = new THREE.CanvasTexture(rippleCanvas); rippleMap.wrapS = rippleMap.wrapT = THREE.RepeatWrapping; rippleMap.repeat.set(3, 5); maps.push(rippleMap);
  const pondWater = material(0x648b89); pondWater.bumpMap = rippleMap; pondWater.bumpScale = 0.045; pondWater.roughness = 0.28; pondWater.metalness = 0.22;
  function batch(group) {
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert(), groups = new Map(), old = [];
    group.traverse((object) => {
      if (!object.isMesh || object.isInstancedMesh) return;
      const key = `${object.material.uuid}:${object.castShadow}`;
      if (!groups.has(key)) groups.set(key, { mat: object.material, shadow: object.castShadow, geometries: [] });
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
      groups.get(key).geometries.push(geometry); old.push(object);
    });
    for (const entry of groups.values()) {
      const merged = new THREE.Mesh(mergeGeometries(entry.geometries), entry.mat); merged.castShadow = entry.shadow; merged.receiveShadow = true;
      group.add(merged); entry.geometries.forEach((geometry) => geometry.dispose());
    }
    old.forEach((object) => { object.removeFromParent(); object.geometry.dispose(); });
  }
  function court(parent) {
    for (const x of [-3.97, 3.97]) {
      box(0.18, 0.12, 19.7, 0xc09a69, x, 0.06, -1.7, parent);
      for (let i = 0; i < 12; i++) {
        box(0.21, 0.06, 0.045, 0x6b573e, x, 0.12, 7.5 - i * 1.7, parent);
        const cap = cylinder(0.032, 0.012, 0x92988a, x, 0.14, 7.5 - i * 1.7, parent); cap.castShadow = false;
      }
    }
    for (const z of [8.17, -11.57]) box(8.1, 0.12, 0.18, 0xc09a69, 0, 0.06, z, parent);
  }
  function kubb(block, king) {
    block.geometry.dispose();
    block.geometry = new RoundedBoxGeometry(king ? 0.5 : 0.36, king ? 1.25 : 0.85, 0.4, 2, 0.025);
    if (king) {
      for (const y of [-0.3, 0.25]) box(0.51, 0.035, 0.41, 0xa48755, 0, y, 0, block);
      const medallion = mesh(new THREE.CircleGeometry(0.1, 16), 0xa48755, 0, 0.05, 0.205, block); medallion.castShadow = false;
    }
  }
  function basket(group) {
    // Alternating small links give the hanging chains a woven silhouette;
    // batching afterward keeps the moving target to a handful of draw calls.
    const links = new THREE.Group(); group.add(links);
    for (let strand = 0; strand < 12; strand++) {
      const angle = strand * Math.PI / 6;
      for (let i = 0; i < 8; i++) {
        const radius = 0.23 + Math.sin(i / 7 * Math.PI / 2) * 0.2;
        const link = mesh(new THREE.TorusGeometry(0.045, 0.011, 5, 8), 0xc5cdc0, Math.sin(angle) * radius, 0.98 + i * 0.14, Math.cos(angle) * radius, links);
        link.rotation.y = angle + (i % 2 ? Math.PI / 2 : 0);
      }
    }
    const band = cylinder(0.655, 0.2, 0xd6b455, 0, 2.05, 0, group);
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const bolt = mesh(new THREE.SphereGeometry(0.025, 6, 4), 0xede3b6, Math.sin(angle) * 0.662, 2.05, Math.cos(angle) * 0.662, group); bolt.castShadow = false;
    }
    band.castShadow = true;
    batch(group);
  }
  function log(parent) {
    // Notches, old iron pegs and stepping boards make the balancing crossing
    // feel built by people while leaving its collision geometry untouched.
    for (const z of [-8.9, 6.9]) {
      for (const x of [-0.75, 0.75]) {
        const peg = cylinder(0.035, 0.045, 0x696c5d, x, 0.53, z, parent); peg.castShadow = false;
      }
      const support = box(1.45, 0.18, 0.65, 0x6b573e, 0, 0.18, z + (z < 0 ? 0.6 : -0.6), parent); support.rotation.z = 0.02;
    }
    for (const side of [-1, 1]) for (let i = 0; i < 11; i++) {
      const patch = mesh(new THREE.IcosahedronGeometry(1, 0), i % 2 ? 0x83946d : 0xa2a079, side * 0.4, 0.42, 5.8 - i * 1.25, parent);
      patch.scale.set(0.06, 0.045, 0.2 + i % 3 * 0.06); patch.rotation.z = side * 0.65;
    }
  }
  return { court, kubb, basket, log, batch, update: (time) => { rippleMap.offset.set(time * 0.008 % 1, time * 0.003 % 1); }, dispose: () => maps.forEach((map) => map.dispose()) };
}
