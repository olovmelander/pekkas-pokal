import * as THREE from 'three';
import { createCrowd, SEAT_HEIGHT, SEAT_BACK } from '../shared/people.js';

/** Local race-meeting details, batched where they repeat around the circuit. */
export function dressCircuit(scene, route) {
  const { sample, length } = route;
  const dummy = new THREE.Object3D();
  const mats = new Map();
  const mat = (color, roughness = 0.85) => {
    const key = `${color}:${roughness}`;
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
    return mats.get(key);
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  function box(color, position, scale, rotation = 0, parent = scene) {
    const mesh = new THREE.Mesh(boxGeo, mat(color));
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.y = rotation;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x8ba7ad) }, bottom: { value: new THREE.Color(0xe8c18b) } },
    vertexShader: 'varying float height; void main(){height=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 bottom;varying float height;void main(){gl_FragColor=vec4(mix(bottom,top,pow(max(0.,height),.55)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
  }));
  scene.add(sky);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe5ae, fog: false }));
  sun.position.set(-105, 47, 95); scene.add(sun);

  // Different near-ground patches keep the large infield from reading as a flat disk.
  const patches = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 9), mat(0xffffff), 90);
  let seed = 1942012;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < 90; i++) {
    const a = random() * Math.PI * 2, r = random() * 26;
    dummy.position.set(Math.sin(a) * r, -0.065, Math.cos(a) * r);
    dummy.rotation.set(-Math.PI / 2, 0, random() * Math.PI);
    dummy.scale.set(1.5 + random() * 5, 0.6 + random() * 2.6, 1); dummy.updateMatrix();
    patches.setMatrixAt(i, dummy.matrix);
    patches.setColorAt(i, new THREE.Color().setHSL(0.21, 0.19 + random() * 0.1, 0.28 + random() * 0.1));
  }
  patches.material = patches.material.clone(); patches.material.transparent = true; patches.material.opacity = 0.3; patches.material.depthWrite = false;
  patches.receiveShadow = true; scene.add(patches);
  // Actual black tyre stacks at the tight bends, separate from the low painted fence.
  const tireGeo = new THREE.TorusGeometry(0.29, 0.13, 5, 10);
  const tires = new THREE.InstancedMesh(tireGeo, mat(0x282f2c), 420);
  let count = 0;
  for (let i = 0; i < 210; i++) {
    const d = i / 210 * length;
    if (Math.abs(route.curvature(d)) < 0.024) continue;
    const s = sample(d, -Math.sign(route.curvature(d)) * 6.45);
    for (let tier = 0; tier < 2; tier++) {
      dummy.position.copy(s.position).setY(0.16 + tier * 0.25);
      dummy.rotation.set(Math.PI / 2, 0, s.angle); dummy.scale.setScalar(1); dummy.updateMatrix();
      tires.setMatrixAt(count++, dummy.matrix);
    }
  }
  tires.count = count; tires.castShadow = true; scene.add(tires);

  // Birch silhouettes break up the pine plantation, with stones and warm long grass below.
  const birchTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.22, 1, 7), mat(0xe4dfc7), 38);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff), 114);
  for (let i = 0; i < 38; i++) {
    const a = random() * Math.PI * 2, radius = 54 + random() * 18;
    const x = Math.sin(a) * radius, z = Math.cos(a) * radius, h = 3.5 + random() * 3.5;
    // Leave the paddock frontage clear.
    const shift = z < -44 && x > -25 && x < 50 ? -18 : 0;
    dummy.position.set(x, h / 2, z + shift); dummy.rotation.set(0, a, 0.035 * Math.sin(i)); dummy.scale.set(1, h, 1); dummy.updateMatrix();
    birchTrunks.setMatrixAt(i, dummy.matrix);
    for (let j = 0; j < 3; j++) {
      dummy.position.set(x + Math.sin(j * 2.1) * 0.7, h * (0.68 + j * 0.14), z + shift + Math.cos(j * 2.1) * 0.7);
      dummy.scale.set(1.7 - j * 0.2, 1.8, 1.5); dummy.updateMatrix(); leaves.setMatrixAt(i * 3 + j, dummy.matrix);
      leaves.setColorAt(i * 3 + j, new THREE.Color().setHSL(0.19 + random() * 0.07, 0.28, 0.32 + random() * 0.15));
    }
  }
  birchTrunks.castShadow = leaves.castShadow = true; scene.add(birchTrunks, leaves);
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat(0x9b9d85), 70);
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 0.65, 3), mat(0xb0a35f), 160);
  for (let i = 0; i < 160; i++) {
    const s = sample(i / 160 * length, (i % 2 ? -1 : 1) * (8.1 + random() * 4));
    dummy.position.copy(s.position).setY(0.2); dummy.rotation.set(0, random() * Math.PI, 0); dummy.scale.setScalar(0.5 + random() * 0.7); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    if (i < 70) { dummy.position.y = 0.08; dummy.scale.set(0.25 + random() * 0.5, 0.2, 0.35); dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix); }
  }
  scene.add(stones, grass);

  // Trackside braking markers communicate an upcoming corner at racing speed.
  for (const d of [53, 104, 157, 211]) {
    const s = sample(d - 11, -8.5);
    const marker = new THREE.Group(); marker.position.copy(s.position); marker.rotation.y = s.angle; scene.add(marker);
    box(0x36453e, [0, 0.7, 0], [0.12, 1.4, 0.12], 0, marker);
    box(0xf0ddac, [0, 1.3, 0], [1.1, 0.75, 0.12], 0, marker);
    for (let n = -1; n <= 1; n++) box(0xb4583f, [n * 0.24, 1.3, 0.07], [0.10, 0.48, 0.02], 0, marker);
  }
  // Wooden bleachers with recognisable, animated spectators from the original games.
  const standAt = sample(24, -12.1);
  const stand = new THREE.Group(); stand.position.copy(standAt.position); stand.rotation.y = standAt.angle; scene.add(stand);
  for (let row = 0; row < 3; row++) {
    box(0x80664a, [-row * 0.85, row * 0.48 + 0.4, 0], [0.9, 0.25, 12], 0, stand);
    for (const z of [-5.4, 5.4]) box(0x47594c, [-row * 0.85, row * 0.24 + 0.2, z], [0.16, row * 0.48 + 0.4, 0.18], 0, stand);
  }
  const seats = [];
  stand.updateMatrixWorld(true);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 8; i++) {
    const p = stand.localToWorld(new THREE.Vector3(-row * 0.85, row * 0.48 + 0.53, -4.8 + i * 1.35));
    seats.push({ position: p.toArray(), rotationY: standAt.angle + Math.PI / 2, pose: 'sit' });
  }
  const crowd = createCrowd({ seats, seed: 2012, hats: 0.2, castShadow: true }); scene.add(crowd.root); crowd.setMood('polite');
  crowd.members.forEach((member, i) => {
    const seat = seats[i];
    member.position.set(seat.position[0] + Math.sin(seat.rotationY) * SEAT_BACK * member.scale, seat.position[1] - SEAT_HEIGHT * member.scale, seat.position[2] + Math.cos(seat.rotationY) * SEAT_BACK * member.scale);
  });
  // Simple service tables, spare wheels, fuel cans and bay markings give the paddock a purpose.
  for (let i = 0; i < 5; i++) {
    const x = 12 + i * 7;
    box(0x826847, [x, 0.9, -50], [2.8, 0.18, 1]);
    for (const side of [-1, 1]) box(0x394b46, [x + side, 0.45, -50], [0.12, 0.9, 0.8]);
    box(i % 2 ? 0xb25c42 : 0x335d63, [x + 1.8, 0.4, -49], [0.45, 0.8, 0.5]);
  }
  const flagGeometry = new THREE.PlaneGeometry(1.2, 0.6, 8, 2);
  const flags = [];
  for (let i = 0; i < 12; i++) {
    const s = sample(i / 12 * length, 9.4);
    box(0xe0d0aa, [s.position.x, 1.7, s.position.z], [0.07, 3.4, 0.07]);
    const flag = new THREE.Mesh(flagGeometry.clone(), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe3b657 : 0x3c6670, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.copy(s.position).add(new THREE.Vector3(0.6, 3.1, 0)); scene.add(flag); flags.push(flag);
  }
  const marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.10, 0.58), new THREE.MeshBasicMaterial({ color: 0x171c1a, transparent: true, opacity: 0.35, depthWrite: false }), 200);
  marks.count = 0; marks.frustumCulled = false; scene.add(marks);
  let markIndex = 0;
  return {
    skid(distance, lane) {
      for (const side of [-0.83, 0.83]) {
        const s = sample(distance, lane + side);
        dummy.position.copy(s.position).setY(0.059); dummy.rotation.set(-Math.PI / 2, 0, -s.angle); dummy.scale.setScalar(1); dummy.updateMatrix();
        marks.setMatrixAt(markIndex++ % 200, dummy.matrix);
      }
      marks.count = Math.min(markIndex, 200); marks.instanceMatrix.needsUpdate = true;
    },
    reset() { marks.count = markIndex = 0; },
    update(dt, time) {
      crowd.update(dt, time);
      flags.forEach((flag, i) => {
        const pos = flag.geometry.attributes.position;
        for (let j = 0; j < pos.count; j++) pos.setZ(j, Math.sin(pos.getX(j) * 5 - time * 3.3 + i) * 0.14 * (pos.getX(j) + 0.6));
        pos.needsUpdate = true;
      });
    },
    cheer() { crowd.react('cheer', 2.3); },
    dispose() { crowd.dispose(); flagGeometry.dispose(); }
  };
}
