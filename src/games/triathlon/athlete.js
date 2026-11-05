import * as THREE from 'three';
import { mergeStaticMeshes } from './mesh-batch.js';
import { createPerson, appearanceFor, POSES } from '../shared/people.js';

function buildBike(color) {
  const root = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x202c31, roughness: 0.8 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xc9d4cc, metalness: 0.7, roughness: 0.25 });
  function rod(a, b, radius, material) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const item = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 7), material);
    item.position.copy(start).add(end).multiplyScalar(0.5);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    item.castShadow = true; root.add(item); return item;
  }
  const wheels = [];
  for (const z of [-0.75, 0.75]) {
    const wheel = new THREE.Group(); wheel.position.set(0, 0.42, z); root.add(wheel); wheels.push(wheel);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.036, 7, 28), rubber); tire.rotation.y = Math.PI / 2; wheel.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.012, 5, 28), alloy); rim.rotation.y = Math.PI / 2; wheel.add(rim);
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.73, 4), alloy);
      spoke.rotation.x = i * Math.PI / 8; wheel.add(spoke);
    }
  }
  const crank = [0, 0.42, -0.05], seat = [0, 1, -0.25], rear = [0, 0.42, -0.75], head = [0, 1, 0.55];
  [[crank, seat], [seat, rear], [rear, crank], [seat, head], [head, crank], [head, [0, 0.42, 0.75]]].forEach(([a, b]) => rod(a, b, 0.025, frame));
  rod(seat, [0, 1.1, -0.27], 0.024, alloy);
  rod([-0.12, 1.1, -0.28], [0.12, 1.1, -0.28], 0.055, rubber);
  rod(head, [0, 1.12, 0.6], 0.022, alloy);
  rod([-0.29, 1.12, 0.6], [0.29, 1.12, 0.6], 0.024, rubber);
  mergeStaticMeshes(root);
  wheels.forEach(mergeStaticMeshes);
  return { root, wheels };
}

export function createAthlete(scene, name, color, player = false) {
  const root = new THREE.Group(); scene.add(root);
  const person = createPerson(appearanceFor(name, {
    detail: player ? 'high' : 'low',
    headwear: { style: 'headband', color },
    outfit: { top: 'jersey', topColor: color, bottom: 'shorts', bottomColor: 0x253239, shoes: 'sneakers', shoeColor: 0xf2e8cf, accent: 0xeee5cb }
  }));
  root.add(person.root);
  const bike = buildBike(color); root.add(bike.root);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
  helmet.scale.set(1, 0.65, 1.15); helmet.position.set(0, 0.2, 0);
  person.bones.head.add(helmet);
  // A soft contact ring doubles as an unmistakable player marker.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 28), new THREE.MeshBasicMaterial({ color: player ? 0xf9d576 : color, transparent: true, opacity: player ? 0.7 : 0.3, side: THREE.DoubleSide }));
  marker.rotation.x = -Math.PI / 2; marker.position.y = 0.025; root.add(marker);
  const wake = new THREE.Group(); root.add(wake);
  const ripples = Array.from({ length: 5 }, () => {
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.465, 26), new THREE.MeshBasicMaterial({ color: 0xd5f5e7, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    ripple.rotation.x = -Math.PI / 2; wake.add(ripple); return ripple;
  });
  return {
    root,
    update(discipline, dt, time, effort) {
      const phase = time * (effort ? 12 : 8);
      helmet.visible = bike.root.visible = discipline === 'bike';
      wake.visible = discipline === 'swim';
      marker.visible = discipline !== 'swim';
      if (discipline === 'swim') {
        person.root.rotation.set(Math.PI / 2, 0, Math.PI); person.root.position.set(0, 0.05, 0.8);
        person.setPose({
          hips: [0, 0.08 * Math.sin(phase), 0], chest: [0, 0.11 * Math.sin(phase), 0], head: [-0.12, 0.08, 0],
          upperArmL: [-phase % (Math.PI * 2), 0, 0.12], upperArmR: [-(phase + Math.PI) % (Math.PI * 2), 0, -0.12],
          forearmL: [-0.15 - Math.max(0, Math.sin(phase)) * 1.1, 0, 0], forearmR: [-0.15 - Math.max(0, -Math.sin(phase)) * 1.1, 0, 0],
          thighL: [0.12 * Math.sin(phase * 2), 0, 0], thighR: [-0.12 * Math.sin(phase * 2), 0, 0],
          shinL: [0.12, 0, 0], shinR: [0.12, 0, 0]
        });
        ripples.forEach((ripple, i) => {
          const age = (time * 0.9 + i / 5) % 1;
          ripple.position.set(0, 0.025, 0.2 + age * 2.8);
          ripple.scale.set(0.7 + age, 1 + age * 0.8, 1);
          ripple.material.opacity = (1 - age) * 0.45;
        });
      } else if (discipline === 'bike') {
        bike.root.rotation.y = Math.PI; person.root.rotation.set(0, Math.PI, 0); person.root.position.set(0, 0.37, 0.2);
        person.setPose({
          hips: [0.12, 0, 0], spine: [0.35, 0, 0], chest: [0.18, 0, 0], head: [-0.3, 0, 0],
          upperArmL: [-0.85, 0, 0.08], upperArmR: [-0.85, 0, -0.08],
          forearmL: [-0.42, 0, 0], forearmR: [-0.42, 0, 0],
          thighL: [-0.85 + Math.sin(phase) * 0.5, 0, 0], thighR: [-0.85 - Math.sin(phase) * 0.5, 0, 0],
          shinL: [1.1 - Math.sin(phase) * 0.5, 0, 0], shinR: [1.1 + Math.sin(phase) * 0.5, 0, 0]
        });
        bike.wheels.forEach(wheel => { wheel.rotation.x = phase * 2; });
      } else {
        person.root.rotation.set(0, Math.PI, 0); person.root.position.set(0, Math.abs(Math.sin(phase)) * 0.09, 0);
        const pose = POSES.brisk(phase);
        pose.spine = [0.12, 0, 0]; pose.forearmL = [-1.4, 0, 0]; pose.forearmR = [-1.4, 0, 0];
        pose.upperArmL = [Math.sin(phase) * 0.6, 0, 0.08]; pose.upperArmR = [-Math.sin(phase) * 0.6, 0, -0.08];
        person.setPose(pose);
      }
      person.update(dt, time);
    },
    dispose() { person.dispose(); }
  };
}
