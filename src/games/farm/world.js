import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { countrySurfaces, countrySky } from './materials.js';

export function buildCountryWorld(scene, lake = false) {
  const world = new THREE.Group();
  scene.add(world);
  const surfaces = countrySurfaces();
  countrySky(scene, lake);
  const materials = new Map();
  const woodColors = new Set([0xb5a27a, 0xc8b68c, 0x755239, 0x8c372c, 0xb64e37, 0x783027, 0x835034, 0x65402b, 0xb6a179, 0x7c6d50, 0x785e42, 0xbfa27a, 0x9c7560, 0x9e7047, 0x795a35, 0xc7a674, 0x825a37, 0xd8b77c, 0x976b42, 0x705033, 0x8f653e, 0x675238, 0xd4ab6d, 0xae844e, 0xbd945b, 0xaf8252, 0x9b7954, 0xae8a60]);
  const material = (color, metalness = 0) => {
    const key = `${color}:${metalness}`;
    if (!materials.has(key)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: metalness ? 0.38 : 0.88, metalness });
      if (woodColors.has(color)) { m.map = surfaces.wood; m.bumpMap = surfaces.wood; m.bumpScale = 0.035; }
      if ([0xd1aa4c, 0xd7b858, 0xd4ab54].includes(color)) { m.map = surfaces.straw; m.bumpMap = surfaces.straw; m.bumpScale = 0.06; }
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
  const ground = mesh(new THREE.PlaneGeometry(170, 180), lake ? 0x668361 : 0x7d8b45, 0, -0.035, -28);
  ground.material.map = surfaces.grass; ground.material.bumpMap = surfaces.grass; ground.material.bumpScale = 0.09;
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
  const bladeGeometry = new THREE.BufferGeometry();
  bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.04, 0, 0, 0.04, 0, 0, 0, 0.32, 0.03, 0, 0, -0.04, 0, 0, 0.04, 0.03, 0.26, 0], 3));
  bladeGeometry.computeVertexNormals();
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x6d874d, roughness: 1, side: THREE.DoubleSide });
  const grass = new THREE.InstancedMesh(bladeGeometry, grassMat, 1900);
  const blade = new THREE.Object3D();
  for (let i = 0; i < 1900; i++) {
    const side = i % 2 ? -1 : 1;
    blade.position.set(side * (width / 2 + 0.35 + (i * 0.618033 % 1) * 13), 0, 12 - (i * 0.381966 % 1) * 78);
    blade.rotation.y = i * 2.399; blade.scale.setScalar(0.7 + i % 7 * 0.14); blade.updateMatrix(); grass.setMatrixAt(i, blade.matrix);
    grass.setColorAt(i, new THREE.Color().setHSL(0.21 + i % 3 * 0.013, 0.23 + i % 5 * 0.025, 0.27 + i % 6 * 0.025));
  }
  world.add(grass);
  for (let side = -1; side <= 1; side += 2) {
    for (let z = 8; z > -65; z -= 5) {
      cylinder(0.09, 1, 0xb5a27a, side * 5, 0.5, z);
      box(0.05, 0.08, 5.05, 0xc8b68c, side * 5, 0.67, z - 2.5);
    }
  }
  function tree(x, z, size, birch = false) {
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    p.scale.setScalar(size);
    world.add(p);
    cylinder(0.16, 2.5, birch ? 0xe3dcc6 : 0x755239, 0, 1.25, 0, p);
    if (birch) {
      for (let i = 0; i < 4; i++) {
        const leaf = mesh(new THREE.SphereGeometry(1.1, 12, 8), [0x8caa58, 0x628a4a, 0xa0b76b][i % 3], Math.sin(i * 2) * 0.8, 2.8 + i * 0.27, Math.cos(i * 2) * 0.55, p);
        leaf.scale.y = 0.9;
      }
      for (let i = 0; i < 5; i++) box(0.31, 0.08, 0.3, 0x6e6b53, 0, 0.3 + i * 0.43, 0, p);
    } else {
      for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(1.3 - i * 0.25, 2, 11), [0x375945, 0x456949, 0x54784e][i], 0, 1.8 + i * 0.8, 0, p);
    }
  }
  for (let i = 0; i < 42; i++) {
    const side = i % 2 ? 1 : -1;
    tree(side * (13 + (i * 7.13 % 13)), 10 - i * 1.94, 0.9 + (i * 0.47 % 0.9), i % 3 === 0);
  }
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.065, 0), material(lake ? 0xeee8bd : 0xe2b854), 190);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 190; i++) {
    dummy.position.set((i % 2 ? 1 : -1) * (5.4 + (i * 1.618 % 6)), 0.16 + (i % 3) * 0.04, 9 - (i * 7.31 % 70));
    dummy.scale.set(0.8, 1.6, 0.8);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
  }
  world.add(flowers);
  if (!lake) {
    const barn = new THREE.Group();
    barn.position.set(-13, 0, -8);
    world.add(barn);
    box(7.8, 4.8, 9.2, 0x8c372c, 0, 2.4, 0, barn);
    for (let i = -7; i <= 7; i++) box(0.06, 4.7, 0.06, i % 2 ? 0xb64e37 : 0x783027, i * 0.53, 2.4, 4.64, barn);
    for (const x of [-3.8, 3.8]) box(0.22, 4.9, 0.25, 0xe8d6ac, x, 2.45, 4.7, barn);
    box(3.1, 3.1, 0.15, 0x322b23, 0, 1.55, 4.7, barn);
    box(3.4, 0.18, 0.25, 0xe8d6ac, 0, 3.17, 4.8, barn);
    for (const x of [-1.65, 1.65]) box(0.18, 3.2, 0.25, 0xe8d6ac, x, 1.6, 4.8, barn);
    for (const side of [-1, 1]) {
      const roof = box(4.7, 0.2, 10, 0x3e4644, side * 1.93, 5.55, 0, barn);
      roof.rotation.z = -side * 0.44;
    }
    for (let i = 0; i < 7; i++) {
      const bale = box(1.8, 0.95, 1.1, 0xd1aa4c, 8.5 + (i % 3) * 1.9, 0.48 + Math.floor(i / 3) * 0.95, -7, world);
      box(0.08, 0.99, 1.13, 0x896c3c, -0.4, 0, 0, bale);
      box(0.08, 0.99, 1.13, 0x896c3c, 0.4, 0, 0, bale);
    }
    // A wheel, a weather vane and a stack of milk churns give the farm scale.
    const wheel = mesh(new THREE.TorusGeometry(1, 0.13, 8, 24), 0x423e34, -8.9, 1.05, 0.7);
    wheel.rotation.y = 0.22;
    for (let i = 0; i < 8; i++) {
      const spoke = box(0.06, 1.8, 0.07, 0x9f8457, 0, 0, 0, wheel);
      spoke.rotation.z = i * Math.PI / 4;
    }
    for (let i = 0; i < 3; i++) {
      cylinder(0.3, 0.85, 0xa6b1af, -9 + i * 0.7, 0.43, -1.2, world, 0.22);
      cylinder(0.23, 0.12, 0xd0d5cd, -9 + i * 0.7, 0.91, -1.2);
    }
  } else {
    const water = mesh(new THREE.PlaneGeometry(48, 120), 0x628f99, 35, 0.02, -35);
    water.rotation.x = -Math.PI / 2;
    water.material = new THREE.MeshStandardMaterial({ color: 0x6096a0, roughness: 0.29, metalness: 0.35 });
    water.castShadow = false;
    for (let i = 0; i < 26; i++) {
      const z = 9 - i * 1.35, x = 11.3 + Math.sin(i * 2.3) * 0.65;
      const stone = mesh(new THREE.DodecahedronGeometry(0.3 + i % 4 * 0.08), 0x8e9987, x, 0.12, z); stone.scale.y = 0.6;
      for (let j = 0; j < 3; j++) { const reed = cylinder(0.025, 1 + j * 0.18, 0x7e8d51, x + j * 0.16, 0.5 + j * 0.09, z + j * 0.13); reed.rotation.z = Math.sin(i + j) * 0.12; }
    }
    for (let i = 0; i < 15; i++) box(2.7, 0.12, 0.47, i % 2 ? 0x9b7954 : 0xae8a60, 13.3 + i * 0.45, 0.25, 2.5);
    const cottage = new THREE.Group(); cottage.position.set(-11.5, 0, -12); world.add(cottage);
    box(6, 3.4, 6, 0xa24e3e, 0, 1.7, 0, cottage);
    for (const side of [-1, 1]) {
      const roof = box(3.7, 0.22, 6.8, 0x494e46, side * 1.5, 4.02, 0, cottage);
      roof.rotation.z = -side * 0.5;
      box(1.2, 1.3, 0.15, 0xf2e2bb, side * 1.8, 2, 3.08, cottage);
      box(1, 1.1, 0.17, 0x6f9eab, side * 1.8, 2, 3.1, cottage);
      box(0.06, 1.1, 0.19, 0xf2e2bb, side * 1.8, 2, 3.15, cottage);
      box(1, 0.06, 0.19, 0xf2e2bb, side * 1.8, 2, 3.15, cottage);
    }
    box(1.2, 2.1, 0.18, 0x586e60, 0, 1.05, 3.1, cottage);
    cylinder(0.06, 7.6, 0xe9e1c7, -7, 3.8, -10);
    box(1.5, 0.9, 0.025, 0x4986a3, -6.25, 6.9, -10);
    box(0.15, 0.9, 0.03, 0xeecb67, -6.57, 6.9, -9.98);
    box(1.5, 0.15, 0.03, 0xeecb67, -6.25, 6.9, -9.98);
  }
  // Fairy lights curve across the clearing; emissive bulbs do not add draw-call-heavy point lights.
  const points = [];
  for (let i = 0; i < 15; i++) {
    const x = -13 + i * 26 / 14;
    const y = 5.8 - Math.sin(i / 14 * Math.PI) * 1.7;
    points.push(new THREE.Vector3(x, y, -12));
    const bulb = mesh(new THREE.SphereGeometry(0.075, 6, 4), 0xffda86, x, y - 0.1, -12);
    bulb.material = new THREE.MeshBasicMaterial({ color: 0xffdf9a });
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
  return { world, mesh, box, cylinder, material, disposeMaterials: () => { materials.forEach((m) => m.dispose()); surfaces.dispose(); } };
}
