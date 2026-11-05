import * as THREE from 'three';

const ROAD_WIDTH = 4.5;
const PALETTE = [0xf2c05c, 0xf16b54, 0x57a6c2, 0x78a96a, 0xbb8bdd, 0xe8e3ce];

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
  const { sample, curvature, length, curve } = route;
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
  const barrier = new THREE.InstancedMesh(new THREE.BoxGeometry(0.65, 0.68, length / 115 - 0.05), material(0xffffff), 230);
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
      dummy.position.copy(s.position).setY(0.32);
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
  box(19.2, 0.45, 9.2, 0x3d4945, 0, 5.2, 0, clubhouse);
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
  // Warm festival pennants.
  for (let i = 0; i < 15; i++) {
    const s = sample(i / 15 * length, 8.8);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.4, 5), material(0xe2d4aa));
    pole.position.copy(s.position).setY(1.7);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), material(i % 2 ? 0xe8b652 : 0x436876, { side: THREE.DoubleSide }));
    flag.position.copy(s.position).setY(3.05);
    flag.position.x += 0.6;
    flag.rotation.y = 0.3;
    scene.add(pole, flag);
  }
  // A few spectators: instanced bodies and heads, bright clothing read at speed.
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.23, 0.6, 2, 5), material(0xffffff), 36);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.20, 6, 5), material(0xdab58e), 36);
  for (let i = 0; i < 36; i++) {
    const s = sample((i / 36 * 0.32 + 0.02) * length, -8.2 - (i % 3) * 0.7);
    dummy.position.copy(s.position).setY(0.85);
    dummy.scale.set(1, 1 + (i % 4) * 0.08, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, new THREE.Color(PALETTE[i % PALETTE.length]));
    dummy.position.y = 1.52;
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  }
  scene.add(bodies, heads);
  return { sample, curvature, length, curve };
}

export function createKart(color) {
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
  const wheels = [];
  for (const x of [-0.88, 0.88]) {
    for (const z of [-0.78, 0.75]) {
      const wheel = part(new THREE.CylinderGeometry(0.31, 0.31, 0.3, 12), dark, x, 0.31, z);
      wheel.rotation.z = Math.PI / 2;
      wheels.push(wheel);
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
  return { root, wheels, steering, color };
}
