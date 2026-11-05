import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildCountryWorld(scene, lake = false) {
  const world = new THREE.Group();
  scene.add(world);
  const materials = new Map();
  const material = (color, metalness = 0) => {
    const key = `${color}:${metalness}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: metalness ? 0.38 : 0.88, metalness }));
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
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  const path = box(8, 0.025, 78, lake ? 0xb0a379 : 0xaa8b59, 0, 0, -24);
  path.castShadow = false;
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
        const leaf = mesh(new THREE.IcosahedronGeometry(1.1, 1), [0x8caa58, 0x628a4a, 0xa0b76b][i % 3], Math.sin(i * 2) * 0.8, 2.8 + i * 0.27, Math.cos(i * 2) * 0.55, p);
        leaf.scale.y = 0.9;
      }
      for (let i = 0; i < 5; i++) box(0.31, 0.08, 0.3, 0x6e6b53, 0, 0.3 + i * 0.43, 0, p);
    } else {
      for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(1.3 - i * 0.25, 2, 7), [0x375945, 0x456949, 0x54784e][i], 0, 1.8 + i * 0.8, 0, p);
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
  return { world, mesh, box, cylinder, material, disposeMaterials: () => materials.forEach((m) => m.dispose()) };
}
