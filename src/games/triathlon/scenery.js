import * as THREE from 'three';
import { mergeStaticMeshes } from './mesh-batch.js';
import { addCourseDetails } from './world-details.js';
import { buildLandscape, surfaceMaterial } from './landscape.js';
import { buildScenicSky } from '../shared/scenic.js';

/** Continuous 800 m routes, with the athlete in a fixed, readable frame. */
export function buildCourse(scene) {
  const world = new THREE.Group(); scene.add(world);
  const sunDirection = new THREE.Vector3(-24, 19, -40);
  const sunlight = scene.children.find(object => object.isDirectionalLight);
  if (sunlight) sunlight.position.copy(sunDirection);
  const landscape = buildLandscape(scene, world, sunDirection);
  const sky = buildScenicSky({ radius: 250, horizon: 0xe6ddc3, zenith: 0x789eb8, cloudiness: 0.58, sunDirection, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
  scene.add(sky.mesh);
  const mats = new Map();
  const mat = (color, roughness = .85) => { const key = `${color}-${roughness}`; if (!mats.has(key))mats.set(key, new THREE.MeshStandardMaterial({ color, roughness })); return mats.get(key); };
  const cream = mat(0xeee5c9), red = mat(0x9d4239), wood = mat(0x8d7352), roof = mat(0x3d4542), gold = mat(0xd8ae62, .5);
  const box = new THREE.BoxGeometry(1, 1, 1);
  function mesh(material, x, y, z, sx, sy, sz, parent = world) { const m = new THREE.Mesh(box, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = sy > .18; m.receiveShadow = true; parent.add(m); return m; }
  const asphalt = surfaceMaterial('asphalt'), trail = surfaceMaterial('trail');
  function roadGeometry(width) {
    const p = [], uv = [], idx = [];
    for (let i = 0; i <= 205; i++) { const z = 60 - i * 4; p.push(-width / 2, -.072, z, width / 2, -.072, z); uv.push(-width / 12, z / 9, width / 12, z / 9); if (i < 205) { const n = i * 2; idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); } }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(idx); geometry.computeVertexNormals(); return geometry;
  }
  const road = new THREE.Mesh(roadGeometry(9.5), asphalt); road.receiveShadow = true; world.add(road);
  const shoulder = new THREE.Mesh(roadGeometry(11.3), mat(0x9e9a7e)); shoulder.position.y = -.014; shoulder.receiveShadow = true; world.add(shoulder);
  const stripes = new THREE.Group(); world.add(stripes);
  for (let i = 0; i < 108; i++) for (const side of [-1, 1])mesh(cream, side * 4.2, -.058, 25 - i * 7, .09, .01, 2.6, stripes);
  for (let i = 0; i < 66; i++)mesh(cream, 0, -.057, 25 - i * 12, .08, .01, 2.1, stripes);
  mergeStaticMeshes(stripes);

  // Falu-red cottages carry boards, recessed glazing, window bars and stone foundations.
  function cottage(x, z, turn = 0) {
    const house = new THREE.Group(); house.position.set(x, .24, z); house.rotation.y = turn; world.add(house);
    mesh(mat(0x777b6d), 0, .16, 0, 5, .32, 4, house); mesh(red, 0, 1.55, 0, 4.6, 2.65, 3.6, house);
    for (let i = 0; i < 23; i++)mesh(i % 3 ? mat(0x873a32) : mat(0xa64b3c), -2.2 + i * .2, 1.55, 1.82, .025, 2.5, .055, house);
    const gable = new THREE.BufferGeometry(); gable.setAttribute('position', new THREE.Float32BufferAttribute([-2.3, 2.88, 1.8, 2.3, 2.88, 1.8, 0, 4.05, 1.8], 3));
    gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, .5, 1], 2)); gable.setIndex([0, 1, 2]);
    gable.computeVertexNormals(); house.add(new THREE.Mesh(gable, red));
    for (const side of [-1, 1]) {
      const r = mesh(roof, side * 1.18, 3.45, 0, 2.75, .13, 4.3, house); r.rotation.z = side * -.47;
      const e = mesh(cream, side * 1.2, 3.47, 2.17, 2.76, .13, .13, house); e.rotation.z = side * -.47;
      mesh(cream, side * 2.29, 1.55, 1.84, .14, 2.7, .13, house);
      mesh(cream, side * 1.24, 1.72, 1.86, 1.02, 1.18, .13, house); mesh(mat(0x456978, .24), side * 1.24, 1.72, 1.94, .83, .98, .04, house);
      mesh(cream, side * 1.24, 1.72, 1.97, .055, 1.02, .035, house); mesh(cream, side * 1.24, 1.72, 1.97, .87, .055, .035, house);
      mesh(cream, side * 1.24, 1.14, 2.04, 1.18, .08, .29, house);
    }
    mesh(cream, 0, 1.14, 1.86, .94, 2.06, .14, house); mesh(mat(0x657258), 0, 1.12, 1.95, .75, 1.91, .06, house);
    mesh(mat(0xa48c57), .24, 1.14, 2, .045, .09, .055, house); mesh(mat(0x8c8c7a), 0, .25, 2.18, 1.4, .18, .72, house);
    mesh(mat(0x7b6d5b), .85, 4.0, -.2, .5, 1.2, .55, house); mesh(mat(0x3e4542), .85, 4.62, -.2, .66, .12, .7, house);
    for (let i = 0; i < 8; i++) { const log = mesh(wood, -3.1 + (i % 2) * .27, .2 + Math.floor(i / 2) * .23, 1.1, .24, .22, 1.15, house); log.rotation.z = .07 * (i % 2 ? 1 : -1); }
    mergeStaticMeshes(house); return house;
  }
  for (const [x, z, turn] of [[35, -40, -.2], [43, -147, .2], [32, -264, -.28], [39, -405, .18], [34, -548, -.3], [40, -685, .15]])cottage(x, z, turn);
  // Course flags appear at gatherings, leaving long stretches of natural shoreline.
  const decorations = new THREE.Group(); world.add(decorations);
  for (const station of [-8, -86, -210, -320, -534, -612]) for (let j = 0; j < 3; j++) for (const side of [-1, 1]) {
    const z = station - j * 4;
    mesh(cream, side * 6.3, .72, z, .045, 1.45, .045, decorations);
    const flag = mesh(j % 2 ? red : gold, side * 6.3 + .27, 1.25, z, .52, .3, .025, decorations); flag.rotation.y = side * .18;
  }
  mergeStaticMeshes(decorations);
  const finish = new THREE.Group(); world.add(finish);
  mesh(gold, -4.8, 2.5, 0, .22, 5, .22, finish); mesh(gold, 4.8, 2.5, 0, .22, 5, .22, finish); mesh(red, 0, 4.85, 0, 10, .7, .2, finish);
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 96; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8e8b7'; ctx.font = 'bold 45px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('LOMSJÖN  •  PEKKAS POKAL', 384, 65);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1.15), new THREE.MeshBasicMaterial({ map: texture, transparent: true })); banner.position.set(0, 4.85, .13); finish.add(banner);
  const details = addCourseDetails(world);
  let previous = null;
  return {
    world,
    dispose() { details.dispose(); },
    update(discipline, distance, remaining, time) {
      if (previous !== discipline) { previous = discipline; road.visible = shoulder.visible = decorations.visible = discipline !== 'swim'; stripes.visible = discipline === 'bike'; road.material = discipline === 'run' ? trail : asphalt; }
      world.position.z = distance; landscape.update(discipline, time); sky.update(time); details.update(discipline, time);
      finish.position.z = -(distance + remaining) + 2; finish.visible = remaining < 120;
    }
  };
}

export function makeCourseItem(kind) {
  const group = new THREE.Group();
  const make = (geo, color, x, y, z) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }));
    mesh.position.set(x, y, z); mesh.castShadow = true; group.add(mesh); return mesh;
  };
  if (kind === 'gate') {
    const buoy = new THREE.ConeGeometry(0.3, 0.65, 16);
    make(buoy, 0xf0b85b, -0.85, 0.23, 0); make(buoy, 0xf0b85b, 0.85, 0.23, 0);
    const hoop = make(new THREE.TorusGeometry(0.7, 0.045, 7, 32), 0xffdb75, 0, 0.65, 0);
    hoop.material.emissive.set(0xb76521); hoop.material.emissiveIntensity = 0.3;
  } else if (kind === 'drink') {
    make(new THREE.CylinderGeometry(0.15, 0.14, 0.45, 14), 0x7cd6c6, 0, 0.9, 0);
    make(new THREE.CylinderGeometry(0.08, 0.09, 0.08, 10), 0xf8efd5, 0, 1.16, 0);
    const ring = make(new THREE.TorusGeometry(0.43, 0.025, 6, 22), 0xd9f6c0, 0, 0.9, 0);
    ring.material.emissive.set(0x92ba62);
  } else {
    make(new THREE.ConeGeometry(0.35, 0.85, 10), 0xdf7850, -0.4, 0.38, 0);
    make(new THREE.ConeGeometry(0.35, 0.85, 10), 0xdf7850, 0.4, 0.38, 0);
    make(new THREE.BoxGeometry(1.25, 0.2, 0.15), 0xf0e4bd, 0, 0.64, 0);
  }
  return group;
}
