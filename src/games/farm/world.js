import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { countrySurfaces, countrySky } from './materials.js';
import { buildHomestead } from './scenery.js';
import { buildNature, sceneryRandom } from '../shared/scenic.js';

export function buildCountryWorld(scene, lake = false, options = {}) {
  const world = new THREE.Group();
  scene.add(world);
  const surfaces = countrySurfaces();
  const sky = countrySky(scene, lake, options);
  const materials = new Map();
  const terrainHeight = (x, z) => -.035 + Math.min(1, Math.max(0, (Math.abs(x) - 8) / 9)) * (Math.sin(x * .13 + z * .08) * .3 + Math.cos(z * .24) * .13);
  const woodColors = new Set([0xb5a27a, 0xc8b68c, 0x755239, 0x8c372c, 0xb64e37, 0x783027, 0x835034, 0x65402b, 0xb6a179, 0x7c6d50, 0x785e42, 0xbfa27a, 0x9c7560, 0x9e7047, 0x795a35, 0xc7a674, 0x825a37, 0xd8b77c, 0x976b42, 0x705033, 0x8f653e, 0x675238, 0xd4ab6d, 0xae844e, 0xbd945b, 0xaf8252, 0x9b7954, 0xae8a60, 0x97744a, 0xb69a6a, 0x6e553a, 0xc9aa77, 0xa58a5e, 0xa18b5e, 0x9e8051, 0x624a32, 0x8b623e, 0x785235, 0xc7ac76, 0xa98b5a, 0x8d7047, 0xb69a64, 0xd2b57b, 0x9f8051, 0xa58250, 0x6d5d3f, 0xa98b60, 0xbda276, 0x6e634a, 0xa6946a, 0xb9a679]);
  const paintColors = new Set([0x782e26, 0x993b2e, 0xa14030, 0x8e3329, 0x91362c, 0xb34c35, 0x914634, 0xab5440, 0xb35c45, 0x9e4938, 0xa34b39]);
  const material = (color, metalness = 0) => {
    const key = `${color}:${metalness}`;
    if (!materials.has(key)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: metalness ? 0.38 : 0.88, metalness });
      if (woodColors.has(color)) { m.map = surfaces.wood; m.bumpMap = surfaces.wood; m.bumpScale = 0.035; }
      if (paintColors.has(color)) { m.map = surfaces.paint; m.bumpMap = surfaces.paint; m.bumpScale = .025; }
      if ([0xd1aa4c, 0xd7b858, 0xd4ab54, 0xc9a654, 0xd7b663, 0xd1ae58].includes(color)) { m.map = surfaces.straw; m.bumpMap = surfaces.straw; m.bumpScale = 0.06; }
      materials.set(key, m);
    }
    return materials.get(key);
  };
  function mesh(geometry, color, x = 0, y = 0, z = 0, parent = world, metalness = 0) {
    const m = new THREE.Mesh(geometry, material(color, metalness));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const box = (w, h, d, c, x, y, z, p) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z, p);
  const cylinder = (r, h, c, x, y, z, p, rt = r) => mesh(new THREE.CylinderGeometry(rt, r, h, 12), c, x, y, z, p);
  const ground = mesh(new THREE.PlaneGeometry(170, 180, 64, 64), lake ? 0x668361 : 0x7d8b45, 0, -0.035, -28);
  ground.material.map = surfaces.grass; ground.material.bumpMap = surfaces.grass; ground.material.bumpScale = 0.09;
  const terrain = ground.geometry.attributes.position, colors = [];
  for (let i = 0; i < terrain.count; i++) {
    const x = terrain.getX(i), z = -terrain.getY(i) - 28;
    const variation = .83 + Math.sin(x * .21 + Math.cos(z * .14)) * .09 + Math.sin(z * .53 + x * .37) * .055;
    colors.push(variation, variation * (1.01 + Math.sin(z * .17) * .035), variation * .92);
    const verge = Math.min(1, Math.max(0, (Math.abs(x) - 8) / 9));
    terrain.setZ(i, verge * (Math.sin(x * .13 + z * .08) * .3 + Math.cos(z * .24) * .13));
  }
  ground.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  ground.geometry.computeVertexNormals(); ground.material.vertexColors = true;
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  const pathPositions = [], pathUVs = [], pathIndices = [];
  const length = lake ? 42 : 78, width = lake ? 5.2 : 7.2;
  for (let i = 0; i <= 26; i++) {
    const z = 12 - i / 26 * length;
    const edge = Math.sin(i * 1.7) * 0.24 + Math.cos(i * 2.3) * 0.12;
    for (const side of [-1, 1]) { pathPositions.push(side * (width / 2 + edge), 0.01, z); pathUVs.push(side > 0 ? 1 : 0, i / 26); }
    if (i < 26) { const j = i * 2; pathIndices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pathPositions, 3));
  pathGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(pathUVs, 2)); pathGeometry.setIndex(pathIndices); pathGeometry.computeVertexNormals();
  const path = mesh(pathGeometry, lake ? 0xb9ac83 : 0xb09b72);
  path.material.map = surfaces.gravel; path.material.bumpMap = surfaces.gravel; path.material.bumpScale = 0.07; path.castShadow = false;
  // Low wooded hills close the horizon, while atmospheric layers keep the yard readable.
  for (let i = 0; i < 9; i++) {
    const hill = mesh(new THREE.SphereGeometry(1, 32, 16), i % 2 ? 0x8caa97 : 0xa8b5a1, -75 + i * 18, -3.8, -83 - i % 3 * 9);
    hill.scale.set(24, 6 + i % 3 * 1.7, 21); hill.castShadow = false;
  }
  const rand = sceneryRandom(lake ? 2016 : 2015);
  const trees = [], bushes = [], grass = [];
  for (let i = 0; i < 52; i++) {
    const side = i % 2 ? -1 : 1, z = 7 - rand() * 88;
    const x = side * (12 + rand() * 16);
    // Keep the farm facade and the lake's near bank open.
    if ((!lake && x < -8 && z > -17 && z < 0) || (lake && x > 10 && z > -25)) continue;
    trees.push({ x, y: terrainHeight(x, z), z, height: 6 + rand() * 7, type: i % 4 === 0 ? 'birch' : 'spruce', haze: z < -50 ? .2 : .025 });
  }
  for (let i = 0; i < 16; i++) trees.push({ x: -43 + i * 5.5 + rand() * 2, z: -75 - rand() * 18, height: 9 + rand() * 7, type: 'spruce', haze: .4 });
  for (let i = 0; i < 28; i++) {
    const side = i % 2 ? -1 : 1, z = 6 - rand() * 68;
    const x = side * (7.3 + rand() * 4.8);
    bushes.push({ x, y: terrainHeight(x, z), z, radius: .45 + rand() * .8, color: i % 3 ? 0x607645 : 0x859251 });
  }
  for (let i = 0; i < 150; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (width / 2 + .2 + rand() * 8), z = 10 - rand() * 80;
    grass.push({ x, y: terrainHeight(x, z) + .025, z, radius: .4 + rand() * 1.2, height: .16 + rand() * .28, count: 30 });
  }
  const nature = buildNature({ trees, bushes, grass, seed: lake ? 2016 : 2015, reducedMotion: !!options.reducedMotion, sunDirection: options.sunDirection });
  // Two rails and weathered split posts make a real field boundary.
  for (const side of [-1, 1]) for (let i = 0; i < 14; i++) {
    const z = 8 - i * 5, x = side * (5.3 + Math.sin(i * 1.8) * .12);
    const post = cylinder(.085, 1.15, 0xa6946a, x, .54, z); post.rotation.z = Math.sin(i * 3.4) * .035;
    for (const y of [.46, .91]) box(.075, .11, 5.1, 0xb9a679, x, y, z - 2.5);
    for (const y of [.46, .91]) mesh(new THREE.SphereGeometry(.025, 4, 3), 0x686e55, x - side * .09, y, z);
  }
  // Scattered verge stones, not a repeating dotted line along the whole lane.
  for (let i = 0; i < 60; i++) {
    const x = (i % 2 ? -1 : 1) * (width / 2 + .2 + rand() * 1.3), z = 8 - rand() * 70;
    const stone = mesh(new THREE.IcosahedronGeometry(.07 + rand() * .12, 1), i % 2 ? 0x969b80 : 0xb2ae8d, x, .025, z); stone.scale.set(1.4, .45, .85); stone.rotation.y = rand() * 6;
  }
  if (lake) {
    const water = mesh(new THREE.PlaneGeometry(48, 120), 0x628f99, 35, .02, -35);
    water.rotation.x = -Math.PI / 2; water.material = new THREE.MeshStandardMaterial({ color: 0x6096a0, roughness: .29, metalness: .35 }); water.castShadow = false;
    for (let i = 0; i < 40; i++) {
      const z = 9 - i * 1.15, x = 11.1 + Math.sin(i * 2.3) * .65;
      const stone = mesh(new THREE.IcosahedronGeometry(.2 + i % 4 * .07, 1), 0x8e9987, x, .12, z); stone.scale.set(1.3, .6, 1);
      for (let j = 0; j < 3; j++) { const reed = cylinder(.018, .8 + j * .17, 0x7e8d51, x + j * .16, .4 + j * .085, z + j * .13); reed.rotation.z = Math.sin(i + j) * .12; }
    }
  }
  const homestead = buildHomestead({ world, mesh, box, cylinder, material }, lake);
  // Fairy lights curve across the clearing; emissive bulbs do not add draw-call-heavy point lights.
  const points = [];
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffdf9a });
  for (let i = 0; i < 15; i++) {
    const x = -13 + i * 26 / 14;
    const y = 5.8 - Math.sin(i / 14 * Math.PI) * 1.7;
    points.push(new THREE.Vector3(x, y, -12));
    const bulb = mesh(new THREE.SphereGeometry(0.075, 6, 4), 0xffda86, x, y - 0.1, -12);
    bulb.material = bulbMaterial;
  }
  world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x514e3e })));
  // The set is static: merge by material, keeping hundreds of planks, trees,
  // lights and fence pieces to a few dozen draw calls on phone GPUs.
  world.updateMatrixWorld(true);
  const batches = new Map();
  const originals = new Set();
  const keep = [];
  world.traverse((object) => {
    if (object === world) return;
    if (object.isMesh && !object.isInstancedMesh) {
      const key = `${object.material.uuid}:${object.castShadow}`;
      if (!batches.has(key)) batches.set(key, { material: object.material, shadow: object.castShadow, geometries: [] });
      const clone = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      clone.applyMatrix4(object.matrixWorld);
      batches.get(key).geometries.push(clone);
      originals.add(object.geometry);
    } else if (object.isInstancedMesh || object.isLine) keep.push(object);
  });
  world.clear();
  keep.forEach((object) => world.add(object));
  for (const batch of batches.values()) {
    const merged = mergeGeometries(batch.geometries);
    batch.geometries.forEach((geometry) => geometry.dispose());
    const object = new THREE.Mesh(merged, batch.material);
    object.castShadow = batch.shadow;
    object.receiveShadow = true;
    world.add(object);
  }
  originals.forEach((geometry) => geometry.dispose());
  world.add(nature.group);
  const update = (time) => { nature.update(time); sky.update(time); };
  world.userData.update = update;
  return { world, mesh, box, cylinder, material, update, disposeMaterials: () => { materials.forEach((m) => m.dispose()); surfaces.dispose(); homestead.dispose(); } };
}
