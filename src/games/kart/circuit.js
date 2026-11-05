import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCrowd } from '../shared/people.js';
import { buildNature, buildScenicSky, sceneryRandom } from '../shared/scenic.js';
import { createRoute, ROAD_HALF_WIDTH, terrainHeight } from './route.js';
import { surfaceMaterial } from './surfaces.js';

/** Varggropen: measured-length trace, local paddock, gravel and Swedish woodland. */
export function createCircuit(scene, { reducedMotion = false, anisotropy = 4 } = {}) {
  const route = createRoute(), { sample, length, planToWorld } = route;
  const random = sceneryRandom(20120728);
  const root = new THREE.Group(); root.name = 'varggropen-circuit'; scene.add(root);
  const asphalt = surfaceMaterial('asphalt', anisotropy), gravel = surfaceMaterial('gravel', anisotropy), grass = surfaceMaterial('grass', anisotropy);
  const materials = new Map();
  function material(color, metalness = 0) {
    const key = `${color}:${metalness}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: metalness ? 0.54 : 0.83, metalness }));
    return materials.get(key);
  }
  const white = material(0xe1e0cd), rubber = material(0x242925), steel = material(0x7d8985, 0.65);
  const cube = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  function mesh(geometry, mat, at, scale, parent = root) {
    const object = new THREE.Mesh(geometry, mat); object.position.set(...at); object.scale.set(...scale);
    object.castShadow = object.receiveShadow = true; parent.add(object); return object;
  }
  function box(mat, at, scale, parent = root) { return mesh(cube, mat, at, scale, parent); }
  function strip(from, to, lift, mat, start = 0, end = length, tint = null) {
    const positions = [], uv = [], colors = [], indices = [];
    const steps = Math.max(4, Math.ceil((end - start) / 0.65));
    for (let i = 0; i <= steps; i++) {
      const distance = start + (end - start) * i / steps;
      for (const lane of [from, to]) {
        const p = sample(distance, lane).position;
        positions.push(p.x, p.y + lift, p.z); uv.push(p.x / 3, p.z / 3);
        const shade = tint ? tint(distance, lane) : 1;
        colors.push(shade, shade, shade);
      }
      if (i < steps) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const object = new THREE.Mesh(geometry, mat); object.receiveShadow = true; root.add(object); return object;
  }
  // A real terrain surface: broad grades, close grass grain and colour variation.
  const groundGeo = new THREE.PlaneGeometry(500, 400, 125, 100); groundGeo.rotateX(-Math.PI / 2);
  const groundPositions = groundGeo.attributes.position, groundColors = [];
  for (let i = 0; i < groundPositions.count; i++) {
    const x = groundPositions.getX(i), z = groundPositions.getZ(i);
    groundPositions.setY(i, terrainHeight(x, z) - 0.06);
    const shade = 0.83 + Math.sin(x * 0.08) * Math.cos(z * 0.055) * 0.09 + random() * 0.1;
    groundColors.push(shade, shade, shade);
    groundGeo.attributes.uv.setXY(i, x / 3, z / 3);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3)); groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, grass); ground.receiveShadow = true; root.add(ground);
  strip(-4.65, 4.65, 0.012, gravel);
  strip(-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, 0.04, asphalt, 0, length, (d, lane) => {
    const line = Math.sign(route.curvature(d)) * 0.85;
    return 0.92 - Math.exp(-((lane - line) ** 2) / 3) * 0.08;
  });
  // Narrow painted edges and flush serrated kerbs leave the road readable.
  strip(-3.44, -3.34, 0.052, white); strip(3.34, 3.44, 0.052, white);
  const kerbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.07, 0.82), white, 1800);
  const dummy = new THREE.Object3D(); let kerbCount = 0;
  for (let d = 0; d < length; d += 0.82) {
    const k = route.curvature(d);
    if (Math.abs(k) < 0.017) continue;
    for (const side of [-1, 1]) {
      const s = sample(d, side * 3.65); dummy.position.copy(s.position).add(new THREE.Vector3(0, 0.05, 0));
      dummy.rotation.set(s.pitch, s.angle, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      kerbs.setMatrixAt(kerbCount, dummy.matrix); kerbs.setColorAt(kerbCount++, new THREE.Color(Math.floor(d / 1.64) % 2 ? 0xb14b41 : 0xd5d4c2));
    }
  }
  kerbs.count = kerbCount; kerbs.receiveShadow = true; root.add(kerbs);

  // Low tyre banks, like those in the club's May 2013 photographs.
  const tireGeo = new THREE.LatheGeometry([new THREE.Vector2(0.18, -0.12), new THREE.Vector2(0.29, -0.12), new THREE.Vector2(0.34, -0.06), new THREE.Vector2(0.34, 0.06), new THREE.Vector2(0.29, 0.12), new THREE.Vector2(0.18, 0.12)], 12);
  const tires = new THREE.InstancedMesh(tireGeo, rubber, 2200); let tireCount = 0;
  for (let d = 0; d < length; d += 0.7) {
    const k = route.curvature(d);
    if (Math.abs(k) < 0.016) continue;
    const side = -Math.sign(k);
    const s = sample(d, side * 5.1);
    for (let tier = 0; tier < 2; tier++) {
      dummy.position.copy(s.position).add(new THREE.Vector3(0, 0.15 + tier * 0.24, 0)); dummy.rotation.set(0, s.angle, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); tires.setMatrixAt(tireCount++, dummy.matrix);
    }
  }
  tires.count = tireCount; tires.castShadow = tires.receiveShadow = true; root.add(tires);

  // Approximate grid location from the aerial; exact start/finish is unverified.
  const grid = new THREE.Group(); root.add(grid);
  for (let i = 0; i < 12; i++) {
    const s = sample(-3 - Math.floor(i / 2) * 3.8, i % 2 ? -1.55 : 1.55);
    const bay = new THREE.Group(); bay.position.copy(s.position).add(new THREE.Vector3(0, 0.06, 0)); bay.rotation.set(s.pitch, s.angle, 0); grid.add(bay);
    box(white, [0, 0, 1.2], [1.5, 0.015, 0.075], bay);
    for (const x of [-0.75, 0.75]) box(white, [x, 0, 0], [0.075, 0.015, 2.4], bay);
  }
  const finish = sample(0);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 14; i++) {
    const s = sample(row * 0.38, -3.25 + i * 0.5);
    const tile = box((row + i) % 2 ? white : rubber, [s.position.x, s.position.y + 0.06, s.position.z], [0.5, 0.015, 0.38], grid);
    tile.rotation.set(s.pitch, finish.angle, 0);
  }
  mergeStatic(grid, true);

  // Chain-link fence around the real facility's outer edge, not a cartoon wall.
  const fenceTexture = wireTexture();
  const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0x8b9691, map: fenceTexture, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.45 });
  const fences = new THREE.Group(); root.add(fences);
  const outline = [[40, 260], [190, 263], [315, 260], [520, 228], [690, 90], [790, 65], [866, 100], [895, 210], [898, 440], [886, 630], [804, 680], [650, 706], [450, 670], [240, 600], [85, 515], [24, 440]];
  for (let i = 0; i < outline.length; i++) {
    const a = planToWorld(...outline[i]), b = planToWorld(...outline[(i + 1) % outline.length]);
    const delta = b.clone().sub(a), n = Math.ceil(delta.length() / 3.2);
    for (let j = 0; j < n; j++) {
      const p = a.clone().lerp(b, j / n); p.y = terrainHeight(p.x, p.z);
      mesh(cylinder, steel, [p.x, p.y + 0.72, p.z], [0.035, 1.44, 0.035], fences);
    }
    const positions = [a.x, a.y + 0.1, a.z, b.x, b.y + 0.1, b.z, a.x, a.y + 1.3, a.z, b.x, b.y + 1.3, b.z];
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const width = delta.length() / 0.38;
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, width, 0, 0, 3.2, width, 3.2], 2)); geometry.setIndex([0, 1, 2, 2, 1, 3]); geometry.computeVertexNormals();
    const fence = new THREE.Mesh(geometry, fenceMaterial); fences.add(fence);
  }
  mergeStatic(fences);

  // Paddock and the small red timing hut are outside the course, by the grid.
  const hut = new THREE.Group(); hut.position.copy(planToWorld(336, 245)); hut.rotation.y = -0.1; root.add(hut);
  const timber = material(0x7b3e2e), roof = material(0x38433e, 0.22), glass = new THREE.MeshPhysicalMaterial({ color: 0x698b99, roughness: 0.16, metalness: 0.2, clearcoat: 1 });
  box(timber, [0, 1.35, 0], [3.4, 2.7, 2.8], hut);
  for (let x = -1.65; x < 1.7; x += 0.19) box(material(0x613428), [x, 1.35, 1.414], [0.025, 2.65, 0.035], hut);
  for (const side of [-1, 1]) {
    const roofPart = box(roof, [side * 0.85, 3.0, 0], [2.1, 0.12, 3.4], hut); roofPart.rotation.z = -side * 0.36;
    box(white, [side * 1.68, 1.35, 1.43], [0.13, 2.7, 0.09], hut);
    box(white, [side * 0.86, 1.75, 1.44], [1.13, 1.05, 0.1], hut);
    box(glass, [side * 0.86, 1.75, 1.5], [0.92, 0.83, 0.04], hut);
    box(white, [side * 0.86, 1.75, 1.55], [0.04, 0.85, 0.02], hut);
  }
  box(material(0x9a855e), [0, 0.12, 2.05], [4, 0.24, 1.2], hut); mergeStatic(hut);
  const title = sign('VARGGROPEN', 3.7, 0.45); title.position.set(0, 2.55, 1.52); hut.add(title);
  const paddock = new THREE.Group(); paddock.position.copy(planToWorld(65, 268)); root.add(paddock);
  box(material(0x4c5655), [0, -0.025, 0], [22, 0.05, 18], paddock);
  for (let i = 0; i < 3; i++) {
    const x = -7 + i * 6.5;
    for (const side of [-1, 1]) mesh(cylinder, steel, [x + side * 2.2, 1.25, -3], [0.035, 2.5, 0.035], paddock);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(3.3, 0.7, 4), material(i % 2 ? 0x31545d : 0xd2bc86)); canopy.rotation.y = Math.PI / 4; canopy.position.set(x, 2.8, -3); paddock.add(canopy);
    box(material(0x8a7857), [x, 0.83, -2.5], [3.5, 0.15, 1.1], paddock);
    for (const side of [-1, 1]) box(steel, [x + side * 1.4, 0.4, -2.5], [0.08, 0.8, 0.9], paddock);
    box(material(0x7e4730), [x + 2, 0.35, -1.1], [0.4, 0.7, 0.45], paddock);
  }
  mergeStatic(paddock);
  // A working flag mast, trackside distances and a modest, readable meeting sign.
  const flagAt = planToWorld(280, 370);
  mesh(cylinder, steel, [flagAt.x, flagAt.y + 3.5, flagAt.z], [0.04, 7, 0.04]);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9, 10, 3), new THREE.MeshStandardMaterial({ color: 0x346987, side: THREE.DoubleSide, roughness: 0.85 }));
  flag.position.copy(flagAt).add(new THREE.Vector3(0.7, 6.3, 0)); root.add(flag);
  const cross = new THREE.Group(); flag.add(cross);
  box(material(0xe3c765), [0, 0, 0.006], [1.4, 0.13, 0.009], cross); box(material(0xe3c765), [-0.23, 0, 0.007], [0.13, 0.9, 0.009], cross);
  for (const d of [75, 185, 310, 410, 515]) {
    const s = sample(d, -5.7); const marker = sign('BROMS', 0.9, 0.38); marker.position.copy(s.position).add(new THREE.Vector3(0, 0.75, 0)); marker.rotation.y = s.angle + Math.PI; root.add(marker);
    mesh(cylinder, steel, [s.position.x, s.position.y + 0.4, s.position.z], [0.03, 0.8, 0.03]);
  }
  const spectators = [];
  for (let i = 0; i < 18; i++) {
    const p = planToWorld(61 + Math.sin(i * 0.2) * 7, 300 + i * 7);
    spectators.push({ position: p.toArray(), rotationY: Math.PI / 2, pose: 'stand' });
  }
  const crowd = createCrowd({ seats: spectators, seed: 2012, hats: 0.15 }); root.add(crowd.root); crowd.setMood('polite');

  // The older painting game's genuinely branched trees replace all cone forests.
  const trees = [], bushes = [], tufts = [];
  for (let i = 0; i < 550; i++) {
    const x = (random() - 0.5) * 340, z = (random() - 0.5) * 270;
    const outside = Math.abs(x) > 104 || z > 78 || z < -33 - Math.max(0, x + 22) * 0.38;
    if (!outside || route.distanceToRoad(x, z) < 13) continue;
    const near = Math.abs(x) < 135 && Math.abs(z) < 105;
    trees.push({ x, y: terrainHeight(x, z), z, height: near ? 5.5 + random() * 5 : 9 + random() * 8, type: random() < 0.62 ? 'birch' : 'spruce', haze: near ? 0 : 0.13, details: near ? {} : { tiers: 6, arms: 7, clumps: 10 } });
  }
  for (let i = 0; i < 120; i++) {
    const d = random() * length, lane = (i % 2 ? 1 : -1) * (6.5 + random() * 5), s = sample(d, lane);
    if (route.distanceToRoad(s.position.x, s.position.z) < 5.6) continue;
    tufts.push({ x: s.position.x, y: s.position.y, z: s.position.z, radius: 0.7 + random(), height: 0.15 + random() * 0.3, count: 18 });
    if (i % 5 === 0) bushes.push({ x: s.position.x, y: s.position.y, z: s.position.z, radius: 0.65 + random() * 0.5 });
  }
  const nature = buildNature({ trees, bushes, grass: tufts, seed: 2012, reducedMotion, sunDirection: new THREE.Vector3(-40, 55, 30) }); root.add(nature.group);
  const sky = buildScenicSky({ radius: 330, horizon: 0xc9d2c5, zenith: 0x719bb9, cloudiness: 0.32, reducedMotion }); scene.add(sky.mesh);

  const marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.10, 0.58), new THREE.MeshBasicMaterial({ color: 0x1c211f, transparent: true, opacity: 0.3, depthWrite: false }), 200);
  marks.count = 0; marks.frustumCulled = false; root.add(marks); let markIndex = 0;
  return {
    ...route,
    skid(distance, lane) {
      for (const side of [-0.83, 0.83]) {
        const s = sample(distance, lane + side); dummy.position.copy(s.position).add(new THREE.Vector3(0, 0.065, 0)); dummy.rotation.set(-Math.PI / 2 + s.pitch, 0, -s.angle); dummy.scale.setScalar(1); dummy.updateMatrix(); marks.setMatrixAt(markIndex++ % 200, dummy.matrix);
      }
      marks.count = Math.min(markIndex, 200); marks.instanceMatrix.needsUpdate = true;
    },
    reset() { marks.count = markIndex = 0; },
    update(dt, time) {
      nature.update(time); sky.update(time); crowd.update(dt, time);
      if (!reducedMotion) {
        const p = flag.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 4 - time * 3) * (p.getX(i) + 0.7) * 0.08);
        p.needsUpdate = true;
      }
    },
    cheer() { crowd.react('cheer', 2.3); },
    dispose() { crowd.dispose(); }
  };
}

function sign(text, width, height) {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
  const c = canvas.getContext('2d'); c.fillStyle = '#173b32'; c.fillRect(0, 0, 768, 128); c.fillStyle = '#eadcae'; c.font = 'bold 66px Georgia'; c.textAlign = 'center'; c.fillText(text, 384, 88);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.85 }));
}

function wireTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d'); c.strokeStyle = '#d1d9d2'; c.lineWidth = 2;
  for (const offset of [-64, 0, 64]) { c.beginPath(); c.moveTo(offset, 0); c.lineTo(offset + 64, 64); c.stroke(); c.beginPath(); c.moveTo(offset + 64, 0); c.lineTo(offset, 64); c.stroke(); }
  const map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; return map;
}

function mergeStatic(group, recursive = false) {
  if (recursive) for (const child of [...group.children]) if (child.isGroup) mergeStatic(child);
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix(); const geometry = child.geometry.clone().applyMatrix4(child.matrix);
    if (!buckets.has(child.material)) buckets.set(child.material, []);
    buckets.get(child.material).push(geometry); group.remove(child);
  }
  for (const [mat, geometries] of buckets) {
    const item = new THREE.Mesh(mergeGeometries(geometries), mat); item.castShadow = item.receiveShadow = true; group.add(item); geometries.forEach(g => g.dispose());
  }
}
