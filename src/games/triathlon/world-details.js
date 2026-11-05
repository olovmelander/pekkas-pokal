import * as THREE from 'three';
import { createCrowd } from '../shared/people.js';

/** Three recognisable settings share one continuous route through Lomsjön. */
export function addCourseDetails(world) {
  const swim = new THREE.Group(), run = new THREE.Group(), bike = new THREE.Group();
  world.add(swim, run, bike);
  const dummy = new THREE.Object3D(), boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  const material = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    return materials.get(color);
  };
  function box(parent, color, x, y, z, w, h, d) {
    const mesh = new THREE.Mesh(boxGeo, material(color)); mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  let seed = 1217;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  // Open water: a buoy course, little bathing platforms, and moored wooden boats.
  const buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), material(0xf5d78e), 160);
  for (let i = 0; i < 160; i++) {
    dummy.position.set(i % 2 ? 5.8 : -5.8, -0.06, -Math.floor(i / 2) * 4);
    dummy.scale.set(1, 0.7, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); buoys.setMatrixAt(i, dummy.matrix);
  }
  swim.add(buoys);
  const boats = [];
  for (const [x, z] of [[-9, -55], [10.5, -155], [-11, -227]]) {
    const boat = new THREE.Group(); boat.position.set(x, 0, z); boat.rotation.y = 0.25; swim.add(boat); boats.push(boat);
    const shape = new THREE.Shape(); shape.moveTo(-0.65, -1.7); shape.lineTo(0.65, -1.7); shape.quadraticCurveTo(1.05, 0.6, 0, 2); shape.quadraticCurveTo(-1.05, 0.6, -0.65, -1.7);
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.33, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.07, bevelSegments: 1, steps: 1 }), material(0x9c6446));
    hull.rotation.x = -Math.PI / 2; hull.position.y = -0.12; boat.add(hull);
    for (const seat of [-0.9, 0.3]) box(boat, 0xd6b47b, 0, 0.27, seat, 1.2, 0.09, 0.27);
    const oar = box(boat, 0x654b33, 0, 0.4, -0.5, 2.4, 0.055, 0.1); oar.rotation.y = 0.4;
  }
  for (const z of [-68, -190]) {
    for (let i = 0; i < 12; i++) box(swim, 0xa68960, 11.7, 0.04, z + i * 0.38, 7.4, 0.13, 0.33);
    for (const dx of [-3, 3]) for (const dz of [0, 4]) box(swim, 0x5b5b42, 11.7 + dx, 0, z + dz, 0.17, 1.4, 0.17);
  }
  // The forest trail has a close birch canopy and a softer, littered verge.
  const count = 160;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.16, 1, 6), material(0xe8e3c9), count);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material(0xffffff), count * 2);
  for (let i = 0; i < count; i++) {
    const x = (i % 2 ? -1 : 1) * (7.7 + random() * 7), z = 15 - random() * 720, h = 4 + random() * 3;
    dummy.position.set(x, h / 2, z); dummy.rotation.set(0, random() * 3, 0.04 * Math.sin(i)); dummy.scale.set(1, h, 1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    for (let j = 0; j < 2; j++) {
      dummy.position.set(x + (j ? 0.5 : -0.5), h * (0.8 + j * 0.16), z); dummy.scale.set(2.1, 1.9, 1.8); dummy.updateMatrix(); leaves.setMatrixAt(i * 2 + j, dummy.matrix);
      leaves.setColorAt(i * 2 + j, new THREE.Color().setHSL(0.23 + random() * 0.04, 0.28, 0.32 + random() * 0.11));
    }
  }
  trunks.castShadow = leaves.castShadow = true; run.add(trunks, leaves);
  const litter = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material(0xc6b17a), 250);
  for (let i = 0; i < 250; i++) {
    dummy.position.set((i % 2 ? -1 : 1) * (4.8 + random() * 2), -0.02, 10 - random() * 710);
    dummy.scale.set(0.06 + random() * 0.15, 0.03, 0.1 + random() * 0.2); dummy.rotation.set(0, random() * 3, 0); dummy.updateMatrix(); litter.setMatrixAt(i, dummy.matrix);
  }
  run.add(litter);
  for (const z of [-42, -125, -230]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 3.5, 10), material(0x73614a)); log.position.set(-7, 0.2, z); log.rotation.x = Math.PI / 2; log.castShadow = true; run.add(log);
    box(run, 0xc0a57c, 7, 1, z, 0.15, 2, 0.15); box(run, 0x315e50, 7, 1.7, z, 1.5, 0.5, 0.1);
  }
  // The final road opens into fenced meadows; repeated parts are instanced.
  const fence = new THREE.InstancedMesh(boxGeo, material(0xbbb798), 450);
  let fi = 0;
  for (let i = 0; i < 75; i++) for (const side of [-1, 1]) {
    const x = side * 7.3, z = 16 - i * 10;
    for (const [px, py, pz, sx, sy, sz] of [[x, 0.6, z, 0.12, 1.2, 0.12], [x, 0.8, z - 5, 0.09, 0.1, 10], [x, 0.4, z - 5, 0.09, 0.1, 10]]) {
      dummy.position.set(px, py, pz); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); fence.setMatrixAt(fi++, dummy.matrix);
    }
  }
  fence.castShadow = true; bike.add(fence);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), material(0xffffff), 500);
  for (let i = 0; i < 500; i++) {
    dummy.position.set((i % 2 ? -1 : 1) * (8.5 + random() * 9), 0.2 + random() * 0.25, 15 - random() * 720); dummy.scale.setScalar(1); dummy.updateMatrix(); flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new THREE.Color(i % 3 ? 0xdbc889 : 0xb59bbc));
  }
  bike.add(flowers);

  // Volunteers at three aid stations are shared, recognisable people, not pins.
  const aid = new THREE.Group(); world.add(aid);
  const seats = [];
  for (const z of [-76, -205, -535]) {
    box(aid, 0xa9885e, 8.7, 0.9, z, 3.1, 0.15, 1.1);
    for (const dx of [-1.2, 1.2]) box(aid, 0x4d6357, 8.7 + dx, 0.45, z, 0.1, 0.9, 0.9);
    for (let i = 0; i < 4; i++) box(aid, 0x83cbbd, 7.8 + i * 0.55, 1.13, z, 0.11, 0.3, 0.11);
    seats.push({ position: [9.3, 0, z - 1], rotationY: -Math.PI / 2, pose: 'stand' });
    seats.push({ position: [-7.4, 0, z - 4], rotationY: Math.PI / 2, pose: 'stand' });
  }
  const crowd = createCrowd({ seats, seed: 2017, hats: 0.35 }); world.add(crowd.root); crowd.setMood('clap');
  return {
    update(discipline, time) {
      swim.visible = discipline === 'swim'; run.visible = discipline === 'run'; bike.visible = discipline === 'bike';
      // Volunteer tables stand on land; swimmers see the shore and boats instead.
      crowd.root.visible = aid.visible = discipline !== 'swim';
      boats.forEach((boat, i) => { boat.position.y = Math.sin(time * 1.3 + i) * 0.04; boat.rotation.z = Math.sin(time + i) * 0.025; });
      buoys.position.y = Math.sin(time * 1.5) * 0.025;
      crowd.update(1 / 60, time);
    },
    dispose() { crowd.dispose(); }
  };
}
