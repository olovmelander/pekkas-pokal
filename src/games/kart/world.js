import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dressCircuit } from './art.js';

const ROAD_WIDTH = 4.5;

function label(text, color = '#ffe6a8', background = '#14332c') {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#c8a65b';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = color;
  ctx.font = 'bold 58px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 384, 76);
  return new THREE.CanvasTexture(canvas);
}

export function createRoute() {
  const points = [[-36, -26], [0, -39], [35, -28], [43, 3], [28, 30], [-4, 36], [-37, 20], [-39, -5]];
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal', 0.5);
  const length = curve.getLength();
  function sample(distance, lane = 0) {
    const u = ((distance / length) % 1 + 1) % 1;
    const position = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
    position.addScaledVector(right, lane);
    return { position, tangent, right, angle: Math.atan2(tangent.x, tangent.z) };
  }
  function curvature(distance) {
    const a = sample(distance - 0.8).angle;
    const b = sample(distance + 0.8).angle;
    return Math.atan2(Math.sin(b - a), Math.cos(b - a)) / 1.6;
  }
  return { sample, curvature, length, curve };
}

export function createCircuit(scene) {
  const route = createRoute();
  const { sample, length } = route;
  const materials = {};
  function material(color, opts = {}) {
    const key = `${color}-${JSON.stringify(opts)}`;
    if (!materials[key]) materials[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });
    return materials[key];
  }
  function box(w, h, d, color, x, y, z, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), material(0x667841));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  const lawn = document.createElement('canvas'); lawn.width = lawn.height = 128;
  const lawnContext = lawn.getContext('2d'), pixels = lawnContext.createImageData(128, 128);
  for (let i = 0; i < 16384; i++) {
    let noise = Math.imul(i ^ 2012, 0x45d9f3b); noise = Math.imul(noise ^ (noise >>> 16), 0x45d9f3b);
    const variation = ((noise >>> 0) / 4294967296 - 0.5) * 16 + Math.sin((i % 128) * 0.14) * Math.cos(Math.floor(i / 128) * 0.11) * 6;
    pixels.data.set([100 + variation, 117 + variation, 65 + variation * 0.6, 255], i * 4);
  }
  lawnContext.putImageData(pixels, 0, 0);
  const lawnMap = new THREE.CanvasTexture(lawn); lawnMap.colorSpace = THREE.SRGBColorSpace; lawnMap.wrapS = lawnMap.wrapT = THREE.RepeatWrapping; lawnMap.repeat.set(38, 38);
  ground.material.map = lawnMap; ground.material.color.set(0xffffff);
  scene.add(ground);

  function ribbon(halfWidth, y, color) {
    const positions = [];
    const indices = [];
    for (let i = 0; i <= 400; i++) {
      for (const side of [-1, 1]) {
        const point = sample(i / 400 * length, side * halfWidth).position;
        positions.push(point.x, y, point.z);
      }
      if (i < 400) {
        const j = i * 2;
        indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material(color, { side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  ribbon(6.3, 0.005, 0xb8a57b);
  const asphalt = ribbon(ROAD_WIDTH, 0.035, 0x626865);
  const grain = document.createElement('canvas');
  grain.width = grain.height = 128;
  const grainContext = grain.getContext('2d');
  const grainImage = grainContext.createImageData(128, 128);
  for (let i = 0; i < grainImage.data.length; i += 4) {
    const v = 100 + ((Math.imul(i + 7, 112327) >>> 7) % 48);
    grainImage.data[i] = grainImage.data[i + 1] = grainImage.data[i + 2] = v;
    grainImage.data[i + 3] = 255;
  }
  grainContext.putImageData(grainImage, 0, 0);
  const grainTexture = new THREE.CanvasTexture(grain);
  grainTexture.wrapS = grainTexture.wrapT = THREE.RepeatWrapping;
  grainTexture.repeat.set(65, 65);
  grainTexture.colorSpace = THREE.SRGBColorSpace;
  const roadPositions = asphalt.geometry.getAttribute('position');
  const roadUV = [];
  for (let i = 0; i < roadPositions.count; i++) roadUV.push(roadPositions.getX(i) / 80, roadPositions.getZ(i) / 80);
  asphalt.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(roadUV, 2));
  asphalt.material.map = grainTexture;
  const dummy = new THREE.Object3D();
  const curb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.12, length / 150 + 0.05), material(0xffffff), 300);
  const barrier = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.38, length / 115 - 0.05), material(0xffffff), 230);
  for (let i = 0; i < 150; i++) {
    for (let side = 0; side < 2; side++) {
      const s = sample(i / 150 * length, (side ? 1 : -1) * 4.65);
      dummy.position.copy(s.position).setY(0.08);
      dummy.rotation.set(0, s.angle, 0);
      dummy.updateMatrix();
      curb.setMatrixAt(i * 2 + side, dummy.matrix);
      curb.setColorAt(i * 2 + side, new THREE.Color(i % 4 < 2 ? 0xc55f4e : 0xf0e4c6));
    }
  }
  for (let i = 0; i < 115; i++) {
    for (let side = 0; side < 2; side++) {
      const s = sample(i / 115 * length, (side ? 1 : -1) * 6.7);
      dummy.position.copy(s.position).setY(0.19);
      dummy.rotation.set(0, s.angle, 0);
      dummy.updateMatrix();
      barrier.setMatrixAt(i * 2 + side, dummy.matrix);
      barrier.setColorAt(i * 2 + side, new THREE.Color(i % 7 < 4 ? 0x214439 : 0xe3ca8d));
    }
  }
  curb.receiveShadow = true;
  barrier.castShadow = true;
  scene.add(curb, barrier);

  // The start gantry, pit lane and hand-painted local clubhouse.
  const start = sample(0);
  const gantry = new THREE.Group();
  gantry.position.copy(start.position);
  gantry.rotation.y = start.angle;
  scene.add(gantry);
  box(0.28, 7, 0.28, 0x354b44, -6.1, 3.5, 0, gantry);
  box(0.28, 7, 0.28, 0x354b44, 6.1, 3.5, 0, gantry);
  box(12.5, 1.3, 0.45, 0x153b31, 0, 6.1, 0, gantry);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 1.55), new THREE.MeshBasicMaterial({ map: label('VARGGROPEN · 2012'), side: THREE.DoubleSide }));
  sign.position.set(0, 6.1, 0.24);
  gantry.add(sign);
  const rearSign = sign.clone();
  rearSign.position.z = -0.24;
  rearSign.rotation.y = Math.PI;
  gantry.add(rearSign);
  for (let x = -5; x < 5; x++) {
    for (let z = 0; z < 2; z++) box(0.9, 0.018, 0.65, (x + z) % 2 ? 0xede6d1 : 0x222a28, x * 0.9 + 0.45, 0.06, z * 0.65, gantry);
  }
  const clubhouse = new THREE.Group();
  clubhouse.position.set(-12, 0, -56);
  scene.add(clubhouse);
  box(18, 5, 8, 0x964c37, 0, 2.5, 0, clubhouse);
  for (const side of [-1, 1]) {
    const roof = box(19.2, 0.23, 5.2, 0x3d4945, 0, 5.5, side * 2.05, clubhouse);
    roof.rotation.x = side * 0.25;
  }
  for (let x = -8.7; x < 9; x += 0.62) box(0.055, 4.9, 0.05, 0x783f30, x, 2.5, 4.05, clubhouse);
  box(0.7, 2, 0.8, 0x6a6254, -5, 6.4, -1.7, clubhouse);
  for (const x of [-6, -2, 2, 6]) {
    box(2.6, 2.1, 0.1, 0xecd4a1, x, 2.7, 4.05, clubhouse);
    box(0.13, 2.2, 0.15, 0xe4dcca, x, 2.7, 4.12, clubhouse);
  }
  box(20, 0.14, 3.5, 0xd7bc8d, 0, 0.12, 6, clubhouse);
  for (let i = 0; i < 6; i++) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2, 4), material(i % 2 ? 0x244c50 : 0xd6b76d));
    tent.position.set(10 + i * 7, 3.1, -52);
    tent.rotation.y = Math.PI / 4;
    scene.add(tent);
    for (const dx of [-2, 2]) box(0.11, 2.7, 0.11, 0xeee1bc, 10 + i * 7 + dx, 1.35, -50);
  }
  // Large instanced pines make a dense forest without hundreds of draw calls.
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.19, 0.31, 5, 6), material(0x67513a), 150);
  const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(2.1, 7, 7), material(0xffffff), 300);
  let seed = 1252012;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < 150; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 63 + random() * 66;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const scale = 0.7 + random() * 1.1;
    dummy.position.set(x, 2.5 * scale, z);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let j = 0; j < 2; j++) {
      dummy.position.y = (5.2 + j * 2) * scale;
      dummy.scale.setScalar(scale * (1 - j * 0.23));
      dummy.updateMatrix();
      foliage.setMatrixAt(i * 2 + j, dummy.matrix);
      foliage.setColorAt(i * 2 + j, new THREE.Color().setHSL(0.30 + random() * 0.08, 0.22, 0.18 + random() * 0.12));
    }
  }
  trunks.castShadow = true;
  scene.add(trunks, foliage);
  // Soft wooded hills behind the circuit.
  for (let i = 0; i < 10; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), material(i % 2 ? 0x6f8170 : 0x849080));
    const a = i * Math.PI * 2 / 10;
    hill.position.set(Math.cos(a) * 130, 0, Math.sin(a) * 130);
    hill.scale.set(38 + i % 3 * 7, 13 + i % 4 * 4, 31);
    scene.add(hill);
  }
  const art = dressCircuit(scene, route);
  const portalMaterials = new Set();
  gantry.traverse(object => { if (object.material && object.position.y > 4) { object.material = object.material.clone(); portalMaterials.add(object.material); } });
  return {
    ...route, ...art,
    fadePortal(opacity) {
      portalMaterials.forEach(material => { material.opacity = opacity; material.transparent = opacity < 1; material.depthWrite = opacity > 0.9; });
    }
  };
}

export function createKart(color, number = 1) {
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
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x18201e, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x969d99, roughness: 0.36, metalness: 0.7 });
  function part(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  }
  part(new THREE.BoxGeometry(1.32, 0.22, 2.3), paint, 0, 0.37, 0);
  part(new THREE.BoxGeometry(1.7, 0.25, 0.44), paint, 0, 0.34, 1.08);
  part(new THREE.BoxGeometry(1.68, 0.23, 0.4), dark, 0, 0.33, -1.15);
  part(new THREE.BoxGeometry(0.8, 0.55, 0.65), dark, 0, 0.7, -0.4);
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
    rod([side * 0.28, 0.76, -0.05], [side * 0.22, 0.53, 0.48], 0.115, dark);
    part(new THREE.BoxGeometry(0.19, 0.12, 0.34), dark, side * 0.22, 0.49, 0.66);
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
  // The driver is a helmeted racing silhouette, seated with both hands on the wheel.
  part(new THREE.CapsuleGeometry(0.29, 0.3, 3, 8), paint, 0, 0.93, -0.3).rotation.x = 0.3;
  part(new THREE.SphereGeometry(0.33, 16, 12), paint, 0, 1.52, -0.24);
  const visor = part(new THREE.SphereGeometry(0.337, 12, 8, 0, Math.PI * 2, 0.85, 0.7), dark, 0, 1.52, -0.24);
  visor.scale.z = 1.02;
  const steering = part(new THREE.TorusGeometry(0.26, 0.045, 6, 16), dark, 0, 0.99, 0.4);
  steering.rotation.x = -0.45;
  for (const x of [-0.24, 0.24]) {
    const arm = part(new THREE.CapsuleGeometry(0.09, 0.4, 2, 6), paint, x, 1.01, 0.13);
    arm.rotation.x = Math.PI / 2.7;
  }
  // Static painted, rubber and metal pieces each become one draw call.
  mergeParts(root, new Set([contact, plate, steering]));
  wheels.forEach(wheel => mergeParts(wheel));
  return { root, wheels, frontPivots, steering, color };
}


function mergeParts(parent, exclude = new Set()) {
  const batches = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || exclude.has(child)) continue;
    child.updateMatrix();
    const geometry = child.geometry.clone().applyMatrix4(child.matrix);
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
