import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPerson, appearanceFor, POSES } from '../shared/people.js';
export { createRoute } from './route.js';
export { createCircuit } from './circuit.js';

export function createKart(color, number = 1, name = 'Viktor Jones') {
  const root = new THREE.Group();
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(32, 32, 10, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(0,0,0,.55)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 64, 64);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false
  }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.015;
  root.add(contact);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x18201e, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x969d99, roughness: 0.36, metalness: 0.7 });
  function part(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  }
  part(roundedBox(1.32, 0.18, 2.2, 0.06), dark, 0, 0.37, 0);
  part(roundedBox(1.7, 0.25, 0.44, 0.07), paint, 0, 0.38, 1.08);
  part(new THREE.BoxGeometry(1.68, 0.23, 0.4), dark, 0, 0.33, -1.15);
  part(roundedBox(0.76, 0.12, 0.65, 0.04), dark, 0, 0.5, -0.35);
  part(roundedBox(0.76, 0.58, 0.12, 0.04), dark, 0, 0.79, -0.63).rotation.x = -0.1;
  part(new THREE.BoxGeometry(0.38, 0.52, 0.65), metal, 0.7, 0.61, -0.58);
  // Welded frame, moulded side pods and exposed rear axle read as a real rental kart.
  function rod(a, b, radius, material = metal) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), vector = to.clone().sub(from);
    const item = part(new THREE.CylinderGeometry(radius, radius, vector.length(), 8), material, 0, 0, 0);
    item.position.copy(from).add(to).multiplyScalar(0.5);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize()); return item;
  }
  for (const side of [-1, 1]) {
    rod([side * 0.7, 0.31, -0.95], [side * 0.7, 0.31, 1.13], 0.065, dark);
    const pod = part(new THREE.CapsuleGeometry(0.19, 0.72, 3, 8), paint, side * 0.64, 0.43, -0.05); pod.rotation.x = Math.PI / 2;
    part(new THREE.BoxGeometry(0.16, 0.08, 0.24), metal, side * 0.22, 0.43, 0.78);
  }
  rod([-1.0, 0.3, -0.8], [1.0, 0.3, -0.8], 0.055);
  for (let i = 0; i < 5; i++) part(new THREE.BoxGeometry(0.44, 0.032, 0.57), metal, 0.72, 0.55 + i * 0.07, -0.57);
  rod([0.9, 0.52, -0.7], [0.9, 0.52, -1.28], 0.09, dark);
  const numberCanvas = document.createElement('canvas'); numberCanvas.width = 128; numberCanvas.height = 96;
  const numberContext = numberCanvas.getContext('2d'); numberContext.fillStyle = '#f3df9c'; numberContext.fillRect(0, 0, 128, 96);
  numberContext.fillStyle = '#1e2e2b'; numberContext.font = 'bold 70px sans-serif'; numberContext.textAlign = 'center'; numberContext.fillText(String(number), 64, 73);
  const plate = part(new THREE.PlaneGeometry(0.48, 0.36), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(numberCanvas) }), 0, 0.51, 1.311);
  plate.rotation.x = -0.12;
  const wheels = [], frontPivots = [];
  for (const x of [-0.88, 0.88]) for (const z of [-0.78, 0.75]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.31, z); root.add(pivot);
    const wheel = new THREE.Group(); pivot.add(wheel); wheels.push(wheel);
    if (z > 0) frontPivots.push(pivot);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.31, 18), dark); tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 10), metal); hub.rotation.z = Math.PI / 2; wheel.add(hub);
    const hubStripe = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.045, 0.25), dark); wheel.add(hubStripe);
    for (const edge of [-0.12, 0.12]) {
      const shoulder = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.04, 5, 18), dark); shoulder.rotation.y = Math.PI / 2; shoulder.position.x = edge; wheel.add(shoulder);
    }
  }
  // The same articulated people as the original games, seated in racing suits.
  const person = createPerson(appearanceFor(name, {
    detail: number === 6 ? 'high' : 'low', height: 1.72, hair: { style: 'buzz', color: 0x30291f }, headwear: null,
    outfit: { top: 'jersey', topColor: color, bottom: 'trousers', bottomColor: 0x25322c, shoes: 'sneakers', shoeColor: 0x242c29, accent: 0xe4dfcf },
    gloves: 0x202927
  }));
  root.add(person.root); person.root.position.set(0, 0.18, -0.35);
  const pose = POSES.sit();
  pose.thighL = [-1.43, 0.08, 0.04]; pose.thighR = [-1.43, -0.08, -0.04];
  pose.shinL = pose.shinR = [0.28, 0, 0]; pose.spine = [0.05, 0, 0]; pose.chest = [0.12, 0, 0];
  pose.upperArmL = [-0.75, 0, 0.1]; pose.upperArmR = [-0.75, 0, -0.1];
  pose.forearmL = pose.forearmR = [-0.8, 0, 0]; pose.gripL = pose.gripR = 0.8;
  person.setPose(pose); root.updateMatrixWorld(true);
  person.ikArm('L', new THREE.Vector3(0.2, 0.99, 0.38), new THREE.Vector3(0.48, 1, -0.12));
  person.ikArm('R', new THREE.Vector3(-0.2, 0.99, 0.38), new THREE.Vector3(-0.48, 1, -0.12));
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 16), paint); helmet.position.set(0, 0.115, 0); helmet.scale.set(1, 1.06, 1.1); helmet.castShadow = true;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.237, 18, 10, 0, Math.PI, 0.85, 0.7), new THREE.MeshPhysicalMaterial({ color: 0x162d34, roughness: 0.1, metalness: 0.55, clearcoat: 1 }));
  visor.scale.z = 1.12; visor.position.copy(helmet.position); person.bones.head.add(helmet, visor);
  const steering = part(new THREE.TorusGeometry(0.26, 0.035, 8, 24), dark, 0, 0.99, 0.4); steering.rotation.x = -0.45;
  rod([0, 0.46, 0.38], [0, 0.96, 0.4], 0.025);
  // Static painted, rubber and metal pieces each become one draw call.
  mergeParts(root, new Set([contact, plate, steering]));
  wheels.forEach(wheel => mergeParts(wheel));
  return {
    root, wheels, frontPivots, steering, color,
    update(dt, time) { person.update(dt, time); },
    dispose() {
      // people removes its root before the scene traversal; clean our attachments.
      helmet.geometry.dispose(); visor.geometry.dispose(); visor.material.dispose();
      person.dispose();
    }
  };
}


function mergeParts(parent, exclude = new Set()) {
  const batches = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || exclude.has(child)) continue;
    child.updateMatrix();
    let geometry = child.geometry.clone().applyMatrix4(child.matrix);
    if (geometry.index) { const source = geometry; geometry = geometry.toNonIndexed(); source.dispose(); }
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material).push(geometry);
    parent.remove(child); child.geometry.dispose();
  }
  for (const [material, geometries] of batches) {
    const merged = new THREE.Mesh(mergeGeometries(geometries), material);
    merged.castShadow = merged.receiveShadow = true; parent.add(merged);
    geometries.forEach(geometry => geometry.dispose());
  }
}


function roundedBox(w, h, d, r) {
  const shape = new THREE.Shape(), x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.35, bevelSegments: 2, curveSegments: 4, steps: 1 });
  geometry.translate(0, 0, -d / 2 + r);
  return geometry;
}
