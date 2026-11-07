import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPerson, appearanceFor, POSES } from '../shared/people.js';
export { createRoute } from './route.js';
export { createCircuit } from './circuit.js';

const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/** Rivals further than this from the camera swap to a one-draw-call proxy. */
export const KART_LOD_DISTANCE = COARSE ? 30 : 46;
const WHEELS = [[0.88, -0.78, 0.34], [-0.88, -0.78, 0.34], [0.88, 0.75, 0.28], [-0.88, 0.75, 0.28]];
const WHEEL_RADIUS = 0.31;
// Grip points on the steering rim (wheel-local), the driver's left hand at +x.
const GRIP = { L: new THREE.Vector3(0.2, 0, 0), R: new THREE.Vector3(-0.2, 0, 0) };

/** A rental kart (nose cone, side pods, full rear bumper, number panels,
 * moulded seat, engine and exhaust) with its driver: helmet in the driver's
 * colour, hands on the rim through the steering, body leaning into corners
 * and nodding under braking. Far away it becomes a single-mesh proxy. */
export function createKart(color, number = 1, name = 'Viktor Jones') {
  const root = new THREE.Group(); root.name = `kart-${number}`;
  const tint = new THREE.Color(color);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), new THREE.MeshBasicMaterial({
    map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = 0.012; contact.renderOrder = 1;
  root.add(contact);
  const lod = new THREE.LOD(); root.add(lod);
  const detail = new THREE.Group(); detail.name = 'kart-detail';
  const proxy = buildProxy(tint);
  lod.addLevel(detail, 0, 0.08);
  lod.addLevel(proxy, KART_LOD_DISTANCE, 0.08);

  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.08, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.75 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1b2120, roughness: 0.62, metalness: 0.02 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa3aaa6, roughness: 0.32, metalness: 0.8 });
  const parts = [];
  function part(geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true; detail.add(mesh); parts.push(mesh);
    return mesh;
  }
  function rod(a, b, radius, material = metal, sides = 8) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), vector = to.clone().sub(from);
    const item = part(new THREE.CylinderGeometry(radius, radius, vector.length(), sides), material, 0, 0, 0);
    item.position.copy(from).add(to).multiplyScalar(0.5);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
    return item;
  }
  // Chassis: floor pan, side rails and the axles.
  part(roundedBox(0.98, 0.05, 1.86, 0.02), plastic, 0, 0.27, 0.06);
  for (const side of [-1, 1]) rod([side * 0.5, 0.3, -0.98], [side * 0.47, 0.3, 1.02], 0.028, plastic);
  rod([-1.0, WHEEL_RADIUS, -0.78], [1.0, WHEEL_RADIUS, -0.78], 0.025);
  rod([-0.74, WHEEL_RADIUS, 0.75], [0.74, WHEEL_RADIUS, 0.75], 0.03, plastic);
  // Nose cone with a moulded front bumper.
  part(sideProfile([[0.93, 0.22], [1.36, 0.22], [1.47, 0.27], [1.47, 0.36], [1.37, 0.44], [1.07, 0.48], [0.93, 0.47]], 1.06, 0.035), paint, 0, 0, 0);
  part(roundedBox(1.22, 0.08, 0.1, 0.035), plastic, 0, 0.27, 1.45);
  // Front number panel, leaning back towards the driver.
  part(roundedBox(0.5, 0.34, 0.035, 0.015), paint, 0, 0.64, 0.98, -0.42);
  // Side pods, the rental kind that cover the gap between the wheels.
  for (const side of [-1, 1]) {
    part(roundedBox(0.36, 0.24, 0.98, 0.08), paint, side * 0.74, 0.37, -0.02);
    part(roundedBox(0.32, 0.05, 0.86, 0.02), plastic, side * 0.74, 0.24, -0.02);
  }
  // Full rear bumper wrapping the rear wheels.
  part(roundedBox(2.08, 0.13, 0.22, 0.06), paint, 0, 0.38, -1.24);
  part(roundedBox(2.0, 0.07, 0.2, 0.03), plastic, 0, 0.27, -1.23);
  for (const side of [-1, 1]) {
    part(roundedBox(0.15, 0.16, 0.5, 0.06), paint, side * 1.06, 0.36, -1.0);
    rod([side * 0.55, 0.33, -1.12], [side * 0.55, 0.33, -0.9], 0.02);
  }
  // Moulded seat shell.
  part(sideProfile([[-0.08, 0.58], [-0.14, 0.46], [-0.52, 0.36], [-0.72, 0.42], [-0.8, 0.86], [-0.72, 0.88], [-0.64, 0.6], [-0.54, 0.52], [-0.13, 0.6]], 0.4, 0.035), plastic, 0, 0, 0);
  // Engine on the driver's right: block, finned barrel, air box, chain guard.
  const ex = -0.64;
  part(roundedBox(0.3, 0.3, 0.4, 0.04), metal, ex, 0.47, -0.58);
  for (let i = 0; i < 6; i++) part(new THREE.BoxGeometry(0.34, 0.022, 0.3), metal, ex, 0.65 + i * 0.045, -0.6, 0, 0, -0.2);
  part(roundedBox(0.26, 0.22, 0.2, 0.05), plastic, ex + 0.02, 0.62, -0.3);
  part(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), plastic, ex - 0.17, 0.5, -0.6, 0, 0, Math.PI / 2);
  part(roundedBox(0.06, 0.18, 0.42, 0.02), plastic, -0.48, 0.36, -0.78);
  // Exhaust: header into a silencer behind the seat, with a short tailpipe.
  rod([ex + 0.05, 0.72, -0.76], [ex + 0.12, 0.6, -0.93], 0.026);
  part(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 14), metal, -0.4, 0.56, -0.96, 0, 0, Math.PI / 2);
  for (const x of [-0.57, -0.23]) part(new THREE.CylinderGeometry(0.073, 0.073, 0.025, 14), plastic, x, 0.56, -0.96, 0, 0, Math.PI / 2);
  rod([-0.23, 0.55, -0.96], [-0.15, 0.53, -1.05], 0.02);
  // Fuel filler and steering column.
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), plastic, 0.0, 0.5, 0.58);
  rod([0, 0.3, 0.76], [0, 0.97, 0.43], 0.02);
  // Number panels on the nose panel and both pods; one texture, one draw call.
  const numbers = new THREE.MeshStandardMaterial({ map: numberTexture(number, tint), roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const plates = [];
  const front = new THREE.PlaneGeometry(0.4, 0.27); front.rotateX(-0.42); front.translate(0, 0.645, 0.999 + 0.012);
  plates.push(front);
  for (const side of [-1, 1]) {
    const plate = new THREE.PlaneGeometry(0.42, 0.18); plate.rotateY(side * Math.PI / 2); plate.translate(side * 0.955, 0.385, -0.02);
    plates.push(plate);
  }
  const nose = new THREE.PlaneGeometry(0.3, 0.2); nose.rotateX(-Math.PI / 2 + 0.13); nose.translate(0, 0.508, 1.2);
  plates.push(nose);
  const plateMesh = new THREE.Mesh(mergeGeometries(plates), numbers); plates.forEach(g => g.dispose());
  detail.add(plateMesh);

  // Wheels: transform carriers for index.js, drawn by two instanced meshes.
  const wheels = [], frontPivots = [], pivots = [];
  for (const [x, z] of WHEELS) {
    const pivot = new THREE.Group(); pivot.position.set(x, WHEEL_RADIUS, z); detail.add(pivot);
    const wheel = new THREE.Group(); pivot.add(wheel); wheels.push(wheel); pivots.push(pivot);
    if (z > 0) frontPivots.push(pivot);
  }
  const rubber = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0 });
  const tyreMesh = new THREE.InstancedMesh(tyreGeometry(), rubber, 4);
  const rimMesh = new THREE.InstancedMesh(rimGeometry(), metal, 4);
  for (const mesh of [tyreMesh, rimMesh]) { mesh.castShadow = true; mesh.receiveShadow = true; detail.add(mesh); }
  const wheelMatrix = new THREE.Matrix4(), widthMatrix = new THREE.Matrix4();
  function syncWheels() {
    for (let i = 0; i < 4; i++) {
      pivots[i].updateMatrix(); wheels[i].updateMatrix();
      wheelMatrix.multiplyMatrices(pivots[i].matrix, wheels[i].matrix);
      widthMatrix.makeScale(WHEELS[i][2] / 0.3, 1, 1);
      wheelMatrix.multiply(widthMatrix);
      tyreMesh.setMatrixAt(i, wheelMatrix); rimMesh.setMatrixAt(i, wheelMatrix);
    }
    tyreMesh.instanceMatrix.needsUpdate = rimMesh.instanceMatrix.needsUpdate = true;
  }
  syncWheels();
  tyreMesh.computeBoundingSphere(); rimMesh.computeBoundingSphere();
  tyreMesh.boundingSphere.radius += 0.2; rimMesh.boundingSphere.radius += 0.2;

  // Steering wheel: rim with grips, three spokes and a hub.
  const steering = new THREE.Group(); steering.position.set(0, 0.99, 0.4); steering.rotation.x = -0.45; detail.add(steering);
  const wheelParts = [new THREE.TorusGeometry(0.2, 0.022, 8, 28)];
  for (const side of [-1, 1]) { const grip = new THREE.TorusGeometry(0.2, 0.03, 8, 8, 0.9); grip.rotateZ(side > 0 ? -0.45 : Math.PI - 0.45); wheelParts.push(grip); }
  for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    const spoke = new THREE.BoxGeometry(0.03, 0.19, 0.012); spoke.translate(0, -0.1, 0); spoke.rotateZ(angle + Math.PI); wheelParts.push(spoke);
  }
  wheelParts.push(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 12).rotateX(Math.PI / 2));
  const steeringMesh = new THREE.Mesh(mergeGeometries(wheelParts.map(g => (g.index ? g.toNonIndexed() : g)).map(g => { g.deleteAttribute('uv'); return g; })), plastic);
  wheelParts.forEach(g => g.dispose());
  steeringMesh.castShadow = true; steering.add(steeringMesh);

  // The same articulated people as the original games, seated in racing suits.
  const person = createPerson(appearanceFor(name, {
    detail: number === 6 ? 'high' : 'low', height: 1.72, hair: { style: 'buzz', color: 0x30291f }, headwear: null,
    outfit: { top: 'jersey', topColor: color, bottom: 'trousers', bottomColor: 0x25322c, shoes: 'sneakers', shoeColor: 0x242c29, accent: 0xe4dfcf },
    gloves: 0x202927
  }));
  detail.add(person.root); person.root.position.set(0, 0.18, -0.35);
  const pose = POSES.sit();
  pose.thighL = [-1.43, 0.08, 0.04]; pose.thighR = [-1.43, -0.08, -0.04];
  pose.shinL = pose.shinR = [0.28, 0, 0]; pose.spine = [0.05, 0, 0]; pose.chest = [0.12, 0, 0];
  pose.upperArmL = [-0.75, 0, 0.1]; pose.upperArmR = [-0.75, 0, -0.1];
  pose.forearmL = pose.forearmR = [-0.8, 0, 0]; pose.gripL = pose.gripR = 0.8;
  person.setPose(pose); root.updateMatrixWorld(true);
  const helmet = new THREE.Mesh(helmetGeometry(tint), new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.25, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 }));
  helmet.position.set(0, 0.115, 0); helmet.castShadow = true; person.bones.head.add(helmet);
  mergeParts(detail, new Set([plateMesh, tyreMesh, rimMesh]));

  // Driver motion: hands on the rim, lean into the corner, nod under braking.
  const handTarget = new THREE.Vector3(), pole = new THREE.Vector3(), lookPoint = new THREE.Vector3();
  const previous = new THREE.Vector3(), current = new THREE.Vector3();
  let previousYaw = null, previousSpeed = 0, lean = 0, nod = 0, manualLean = 0, manualNod = 0, manualFor = 0, ghost = false;
  const ghostMaterial = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, emissive: 0x2a4258, roughness: 0.4, metalness: 0, transparent: true, opacity: 0.36, depthWrite: true });
  const originals = new Map();
  function drive(dt, time) {
    const step = Math.min(Math.max(dt, 0), 0.1);
    root.getWorldPosition(current);
    const yaw = root.rotation.y;
    let autoLean = 0, autoNod = 0;
    if (previousYaw !== null && step > 1e-4) {
      const moved = current.distanceTo(previous);
      if (moved < 4) {
        const speed = moved / step;
        const yawRate = Math.atan2(Math.sin(yaw - previousYaw), Math.cos(yaw - previousYaw)) / step;
        // Positive yaw turns towards the kart's left (+x): lean that way.
        autoLean = THREE.MathUtils.clamp(speed * yawRate / 9, -1, 1);
        autoNod = THREE.MathUtils.clamp((previousSpeed - speed) / step / 9, 0, 1);
        previousSpeed += (speed - previousSpeed) * Math.min(1, step * 8);
      }
    }
    previous.copy(current); previousYaw = yaw;
    manualFor = Math.max(0, manualFor - step);
    const wishLean = manualFor > 0 ? manualLean : autoLean, wishNod = manualFor > 0 ? manualNod : autoNod;
    lean += (wishLean - lean) * Math.min(1, step * 6);
    nod += (wishNod - nod) * Math.min(1, step * (wishNod > nod ? 10 : 4));
    if (!detail.visible) return;
    // A positive z turn tips an upright bone towards -x, so lean is negated.
    pose.spine = [0.05 + nod * 0.12, 0, -lean * 0.13];
    pose.chest = [0.12 + nod * 0.1, 0, -lean * 0.1];
    pose.neck = [nod * -0.05, 0, lean * 0.08];
    pose.head = [-0.04 - nod * 0.1, 0, lean * 0.1];
    person.setPose(pose);
    detail.updateWorldMatrix(true, true);
    lookPoint.set(lean * 2.2, 1.0, 9).applyMatrix4(root.matrixWorld);
    person.lookAt(lookPoint, 0.8);
    person.update(dt, time);
    steering.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      handTarget.copy(GRIP[side]).applyMatrix4(steering.matrixWorld);
      pole.set(side === 'L' ? 0.55 : -0.55, 0.65, 0.05).applyMatrix4(root.matrixWorld);
      person.ikArm(side, handTarget, pole);
    }
    syncWheels();
  }
  return {
    root, wheels, frontPivots, steering, color, lod,
    update(dt, time) { drive(dt, time); },
    /** Lean the driver: x in -1..1 (positive = towards the kart's left, the
     * +lane side), nod in 0..1 forward (braking). Overrides the automatic,
     * motion-derived lean for a quarter second. */
    setDriverLean(x = 0, forward = 0) {
      manualLean = THREE.MathUtils.clamp(Number(x) || 0, -1, 1);
      manualNod = THREE.MathUtils.clamp(Number(forward) || 0, 0, 1);
      manualFor = 0.25;
    },
    /** A translucent, non-shadowing ghost (time trial). */
    setGhost(on = true) {
      if (ghost === !!on) return;
      ghost = !!on;
      root.traverse((object) => {
        if (!object.isMesh) return;
        if (ghost) {
          originals.set(object, { material: object.material, cast: object.castShadow, receive: object.receiveShadow });
          object.material = ghostMaterial; object.castShadow = object.receiveShadow = false;
        } else if (originals.has(object)) {
          const o = originals.get(object);
          object.material = o.material; object.castShadow = o.cast; object.receiveShadow = o.receive;
        }
      });
      contact.visible = !ghost;
      if (!ghost) originals.clear();
    },
    get ghost() { return ghost; },
    dispose() {
      if (ghost) this.setGhost(false);
      helmet.geometry.dispose(); helmet.material.dispose(); ghostMaterial.dispose();
      person.dispose();
    }
  };
}

/* ------------------------------------------------------------ pieces */

function blobTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d'), g = c.createRadialGradient(32, 32, 8, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function numberTexture(number, tint) {
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 128;
  const c = canvas.getContext('2d');
  c.fillStyle = '#f4efdc'; c.fillRect(0, 0, 192, 128);
  c.fillStyle = `#${tint.getHexString()}`; c.fillRect(0, 0, 192, 14); c.fillRect(0, 114, 192, 14);
  c.fillStyle = '#18201e'; c.font = '900 92px "Arial Black", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(number), 96, 70);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return map;
}

/** A side profile [(z, y)…] extruded across the kart's width, rounded edges. */
function sideProfile(points, width, bevel) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate((width - bevel * 2) / 2, 0, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** Tyre around the local x axis: rounded shoulders, a bead and a pale
 * lettering ring on both sidewalls (vertex colours). Width 0.3 at scale 1. */
function tyreGeometry() {
  const w = 0.15, r = WHEEL_RADIUS;
  const profile = [[0.165, -w + 0.01], [0.2, -w], [0.26, -w - 0.004], [0.293, -w + 0.012], [r, -w + 0.04], [r + 0.002, 0], [r, w - 0.04], [0.293, w - 0.012], [0.26, w + 0.004], [0.2, w], [0.165, w - 0.01]];
  const geometry = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 22).toNonIndexed();
  geometry.rotateZ(Math.PI / 2);
  const p = geometry.attributes.position, colors = [];
  const dark = new THREE.Color(0x1d2120), ring = new THREE.Color(0x8f948f), bead = new THREE.Color(0x2c3230);
  for (let i = 0; i < p.count; i++) {
    const radius = Math.hypot(p.getY(i), p.getZ(i));
    const c = radius > 0.235 && radius < 0.262 && Math.abs(p.getX(i)) > w - 0.01 ? ring : radius < 0.2 ? bead : dark;
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Rim dish, hub and three lug nuts (so the spin reads), around local x. */
function rimGeometry() {
  const pieces = [];
  const dish = new THREE.LatheGeometry([[0.0, -0.13], [0.17, -0.13], [0.17, 0.13], [0.0, 0.13]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
  dish.rotateZ(Math.PI / 2); pieces.push(dish);
  for (const side of [-1, 1]) {
    const hub = new THREE.CylinderGeometry(0.055, 0.065, 0.04, 10); hub.rotateZ(Math.PI / 2); hub.translate(side * 0.145, 0, 0); pieces.push(hub);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const nut = new THREE.BoxGeometry(0.025, 0.028, 0.028); nut.translate(side * 0.14, Math.cos(a) * 0.1, Math.sin(a) * 0.1); pieces.push(nut);
    }
  }
  const geometry = mergeGeometries(pieces.map(g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }));
  pieces.forEach(g => g.dispose());
  return geometry;
}

/** Full-face helmet: the driver's colour, a white centre stripe with dark
 * pinstripes, a dark lower rim and a smoked visor, all one mesh. */
function helmetGeometry(tint) {
  const shell = new THREE.SphereGeometry(0.23, 26, 18);
  shell.scale(1, 1.06, 1.1);
  // Centred on +z (phi = pi/2 faces forward in SphereGeometry).
  const visor = new THREE.SphereGeometry(0.236, 22, 8, Math.PI * 0.14, Math.PI * 0.72, 1.12, 0.62);
  visor.scale(1, 1.06, 1.12);
  const colorize = (geometry, pick) => {
    const p = geometry.attributes.position, colors = [];
    for (let i = 0; i < p.count; i++) { const c = pick(p.getX(i), p.getY(i), p.getZ(i)); colors.push(c.r, c.g, c.b); }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  };
  const white = new THREE.Color(0xf3f1ea), dark = new THREE.Color(0x15191a), accent = tint.clone().lerp(new THREE.Color(0xffffff), 0.15);
  colorize(shell, (x, y, z) => {
    const ax = Math.abs(x);
    if (y < -0.14) return dark;
    if (y > -0.04 && z < 0.2 && ax < 0.032) return white;
    if (y > -0.04 && z < 0.2 && ax < 0.046) return dark;
    // A swoosh along each side in white.
    if (ax > 0.17 && Math.abs(y + z * 0.35 + 0.02) < 0.025) return white;
    return accent;
  });
  colorize(visor, () => new THREE.Color(0x101a1f));
  const geometry = mergeGeometries([shell, visor]);
  shell.dispose(); visor.dispose();
  return geometry;
}

/** One draw call for a distant kart: body, pods, wheels and a driver. */
function buildProxy(tint) {
  const pieces = [];
  const add = (geometry, color, x, y, z, rz = 0) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z); g.deleteAttribute('uv');
    const c = new THREE.Color(color), colors = [];
    for (let i = 0; i < g.attributes.position.count; i++) colors.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    pieces.push(g);
  };
  add(new THREE.BoxGeometry(1.0, 0.1, 2.3), 0x1b2120, 0, 0.3, 0);
  add(new THREE.BoxGeometry(1.06, 0.24, 0.5), tint, 0, 0.36, 1.2);
  add(new THREE.BoxGeometry(2.1, 0.2, 0.24), 0x1b2120, 0, 0.34, -1.24);
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.36, 0.24, 0.98), tint, side * 0.74, 0.37, -0.02);
  for (const [x, z, w] of WHEELS) add(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, w, 10), 0x1d2120, x, WHEEL_RADIUS, z, Math.PI / 2);
  add(new THREE.BoxGeometry(0.46, 0.5, 0.3), tint, 0, 0.85, -0.45);
  add(new THREE.BoxGeometry(0.5, 0.12, 0.6), 0x25322c, 0, 0.55, 0.05);
  add(new THREE.SphereGeometry(0.17, 10, 8), tint, 0, 1.27, -0.36);
  add(new THREE.BoxGeometry(0.2, 0.08, 0.04), 0x101a1f, 0, 1.27, -0.2);
  const mesh = new THREE.Mesh(mergeGeometries(pieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }));
  pieces.forEach(g => g.dispose());
  mesh.name = 'kart-proxy'; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function mergeParts(parent, exclude = new Set()) {
  const batches = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || child.isInstancedMesh || exclude.has(child)) continue;
    child.updateMatrix();
    let geometry = child.geometry.clone().applyMatrix4(child.matrix);
    if (geometry.index) { const source = geometry; geometry = geometry.toNonIndexed(); source.dispose(); }
    if (geometry.attributes.uv) geometry.deleteAttribute('uv');
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
