import * as THREE from 'three';
import { createCrowd, createPerson, appearanceFor, POSES } from '../shared/people.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBatch, faceTrack, canvasTexture } from './kit.js';

// Not tone mapped, so a lit lamp stays a saturated signal red (no bloom pass).
const LAMP_OFF = new THREE.Color(0x1e0605), LAMP_ON = new THREE.Color(1, 0.04, 0.02);
const HALO_OFF = new THREE.Color(0, 0, 0), HALO_ON = new THREE.Color(0.55, 0.03, 0.01);
const FLAGS = ['green', 'yellow', 'chequered', 'blue', 'white'];

/** Start/finish staging: gantry with five red lights, a small grandstand
 * with a seated crowd, marshals with flags round the lap, and the finish
 * celebration (chequered flag, confetti, a point for the camera to orbit). */
export function buildStartline(route, root, { layout, clear, phone = false, reducedMotion = false, random = Math.random } = {}) {
  const { sample, length } = route;
  const group = new THREE.Group(); group.name = 'startline'; root.add(group);
  const batch = createBatch();
  const steel = new THREE.MeshStandardMaterial({ color: 0x5d6763, roughness: 0.45, metalness: 0.65, name: 'gantry-steel' });
  const painted = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0, vertexColors: true, name: 'start-painted' });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7650, roughness: 0.85, metalness: 0, name: 'start-wood' });
  const box = new THREE.BoxGeometry(1, 1, 1);

  /* ---------------------------------------------------------- gantry */
  const line = sample(0);
  const gantry = new THREE.Group(); gantry.name = 'gantry';
  gantry.position.copy(line.position); gantry.rotation.y = line.angle; group.add(gantry);
  gantry.updateMatrixWorld(true);
  const local = gantry.matrixWorld;
  const span = 6.25, beam = 4.7;
  for (const side of [-1, 1]) {
    const foot = sample(0, side * span).position.y - line.position.y;
    batch.add(box, steel, [side * span, (foot + beam + 0.55) / 2, 0], [0, 0, 0], [0.26, beam + 0.55 - foot, 0.26], null, local);
    batch.add(box, painted, [side * span, foot + 0.3, 0], [0, 0, 0], [0.5, 0.6, 0.5], 0xb7b2a6, local);
    // Red/white padding round the foot of each post.
    for (let i = 0; i < 3; i++) batch.add(box, painted, [side * span, foot + 0.8 + i * 0.42, 0], [0, 0, 0], [0.42, 0.4, 0.42], i % 2 ? 0xece8dc : 0xc8372b, local);
  }
  // Truss: two chords and diagonals.
  for (const y of [beam, beam + 0.5]) batch.add(box, steel, [0, y, 0], [0, 0, 0], [span * 2 + 0.3, 0.1, 0.1], null, local);
  for (let x = -span; x < span - 0.1; x += 0.6) {
    const a = new THREE.Vector3(x, beam, 0), b = new THREE.Vector3(x + 0.6, beam + 0.5, 0);
    batch.add(box, steel, a.clone().add(b).multiplyScalar(0.5).toArray(), [0, 0, Math.atan2(0.5, 0.6) * (Math.round(x / 0.6) % 2 ? 1 : -1)], [0.78, 0.04, 0.04], null, local);
  }
  // Banner on both faces of the truss.
  const bannerWidth = span * 2 - 0.6, bannerHeight = 0.95;
  const banner = canvasTexture(Math.round(128 * bannerWidth / bannerHeight), 128, (c, w) => {
    c.fillStyle = '#173b32'; c.fillRect(0, 0, w, 128);
    c.fillStyle = '#f2c05c'; c.fillRect(0, 0, w, 8); c.fillRect(0, 120, w, 8);
    c.font = '900 64px "Arial Black", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#f4ecd2'; c.fillText('PEKKAS POKAL · VARGGROPEN', w / 2, 68);
  });
  const bannerMaterial = new THREE.MeshStandardMaterial({ map: banner, roughness: 0.7, name: 'banner' });
  // Two single-sided faces, so the text reads the right way from both directions.
  const faces = [0, Math.PI].map((turn) => {
    const face = new THREE.PlaneGeometry(bannerWidth, bannerHeight);
    face.rotateY(turn); face.translate(0, beam + 0.36, turn ? -0.065 : 0.065);
    return face;
  });
  const bannerMesh = new THREE.Mesh(mergeGeometries(faces), bannerMaterial); faces.forEach(g => g.dispose());
  bannerMesh.castShadow = true; gantry.add(bannerMesh);
  // Light housing, facing the grid, hanging under the truss.
  const rig = { y: beam - 0.62, z: -0.16 };
  batch.add(box, painted, [0, rig.y, rig.z + 0.1], [0, 0, 0], [2.7, 0.92, 0.22], 0x151817, local);
  batch.add(box, steel, [0, rig.y + 0.5, rig.z + 0.1], [0, 0, 0], [0.12, 0.2, 0.12], null, local);
  for (let i = 0; i < 5; i++) for (const row of [-0.2, 0.2]) {
    // A short hood over each lamp.
    batch.add(box, painted, [(i - 2) * 0.5, rig.y + row + 0.17, rig.z - 0.07], [0, 0, 0], [0.38, 0.03, 0.14], 0x0d0f0e, local);
  }
  const lampGeometry = new THREE.CircleGeometry(0.16, 18);
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, name: 'start-lamps' });
  const lamps = new THREE.InstancedMesh(lampGeometry, lampMaterial, 10);
  // A soft additive glow round each lit lamp: no post-processing involved.
  const haloMaterial = new THREE.MeshBasicMaterial({
    map: canvasTexture(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 4, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, name: 'start-halo'
  });
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.85, 0.85), haloMaterial, 10);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 10; i++) {
    const column = i % 5, row = i < 5 ? 0.2 : -0.2;
    // Column 0 is on the drivers' left (the gantry's +x, the +lane side).
    dummy.position.set((2 - column) * 0.5, rig.y + row, rig.z - 0.012); dummy.rotation.set(0, Math.PI, 0); dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix); lamps.setColorAt(i, LAMP_OFF);
    dummy.position.z -= 0.006; dummy.updateMatrix();
    halos.setMatrixAt(i, dummy.matrix); halos.setColorAt(i, HALO_OFF);
  }
  lamps.name = 'start-lights'; lamps.castShadow = false; gantry.add(lamps);
  halos.name = 'start-light-halos'; halos.castShadow = false; halos.renderOrder = 2; gantry.add(halos);
  let shownLit = -1, shownOut = null;
  function setStartLights(lit = 0, out = false) {
    const count = Math.max(0, Math.min(5, Math.floor(Number(lit) || 0)));
    if (count === shownLit && !!out === shownOut) return;
    shownLit = count; shownOut = !!out;
    for (let i = 0; i < 10; i++) {
      const on = !out && i % 5 < count;
      lamps.setColorAt(i, on ? LAMP_ON : LAMP_OFF); halos.setColorAt(i, on ? HALO_ON : HALO_OFF);
    }
    lamps.instanceColor.needsUpdate = true; halos.instanceColor.needsUpdate = true;
    if (out) startFlag('green', 5);
  }

  /* ---------------------------------------------------------- grandstand */
  const standAt = sample(5, 9.6);
  const stand = new THREE.Group(); stand.name = 'grandstand';
  stand.position.copy(standAt.position); stand.rotation.y = faceTrack(standAt, 9.6); group.add(stand);
  stand.updateMatrixWorld(true);
  const standMatrix = stand.matrixWorld;
  const tiers = 4, tierRise = 0.42, tierDepth = 0.85, standLength = 13;
  batch.add(box, painted, [0, -0.2, -tiers * tierDepth / 2 + 0.3], [0, 0, 0], [standLength + 0.6, 0.7, tiers * tierDepth + 1.0], 0x8f8b82, standMatrix);
  for (let t = 0; t < tiers; t++) {
    const z = -t * tierDepth, y = 0.15 + t * tierRise;
    batch.add(box, painted, [0, y / 2, z - tierDepth / 2], [0, 0, 0], [standLength, y, tierDepth], t % 2 ? 0xa39e92 : 0x9a958a, standMatrix);
    batch.add(box, wood, [0, y + 0.43, z - tierDepth * 0.35], [0, 0, 0], [standLength - 0.4, 0.06, 0.34], null, standMatrix);
    for (let x = -standLength / 2 + 0.6; x < standLength / 2; x += 2.1) batch.add(box, steel, [x, y + 0.2, z - tierDepth * 0.35], [0, 0, 0], [0.06, 0.42, 0.28], null, standMatrix);
  }
  // Roof on four columns, sloping to the back.
  const back = -tiers * tierDepth - 0.1, roofHigh = tiers * tierRise + 2.7;
  for (const x of [-standLength / 2 + 0.2, -standLength / 6, standLength / 6, standLength / 2 - 0.2]) {
    batch.add(box, steel, [x, roofHigh / 2, back], [0, 0, 0], [0.14, roofHigh, 0.14], null, standMatrix);
    batch.add(box, steel, [x, (roofHigh - 0.4) / 2 + 0.1, 0.25], [0, 0, 0], [0.1, roofHigh - 0.4, 0.1], null, standMatrix);
  }
  batch.add(box, painted, [0, roofHigh - 0.15, back / 2 + 0.2], [-0.08, 0, 0], [standLength + 0.8, 0.12, -back + 1.4], 0xb8382c, standMatrix);
  batch.add(box, painted, [0, tiers * tierRise * 0.5 + 0.6, back - 0.08], [0, 0, 0], [standLength, tiers * tierRise + 1.2, 0.08], 0x6d5a45, standMatrix);
  // Low railing at the front.
  batch.add(box, steel, [0, 0.95, 0.4], [0, 0, 0], [standLength, 0.05, 0.05], null, standMatrix);
  for (let x = -standLength / 2; x <= standLength / 2 + 0.01; x += 1.3) batch.add(box, steel, [x, 0.5, 0.4], [0, 0, 0], [0.05, 0.9, 0.05], null, standMatrix);

  const seats = [];
  const perRow = phone ? 8 : 17;
  for (let t = 0; t < tiers; t++) {
    for (let i = 0; i < perRow; i++) {
      if (random() < (phone ? 0.12 : 0.18)) continue;
      const x = -standLength / 2 + 0.7 + (standLength - 1.4) * (i + random() * 0.3) / perRow;
      seats.push({ position: [x, 0.15 + t * tierRise - 0.01, -t * tierDepth - tierDepth * 0.42], rotationY: 0, pose: 'sit' });
    }
  }
  // A few standing along the fence by the line.
  for (let i = 0; i < (phone ? 4 : 8); i++) seats.push({ position: [standLength / 2 + 1 + i * 0.75, 0, 0.6 + random() * 0.6], rotationY: -0.3 + random() * 0.4, pose: 'stand' });
  const crowd = createCrowd({ seats, seed: 2012, hats: 0.2 });
  stand.add(crowd.root); crowd.setMood('idle');
  // Under the roof: their shadows would cost a second pass for little gain.
  crowd.root.traverse((object) => { object.castShadow = false; });
  const standInverse = new THREE.Matrix4().copy(standMatrix).invert();
  const lookTarget = new THREE.Vector3();

  /* ---------------------------------------------------------- marshals */
  const flagAtlas = canvasTexture(512, 128, (c) => {
    const cell = 128 * 0.8;
    const colors = ['#2e9a45', '#f2cf2b', null, '#2f6fd0', '#f4f4ee'];
    colors.forEach((col, i) => {
      const x = i * cell;
      if (col) { c.fillStyle = col; c.fillRect(x, 0, cell, 128); return; }
      for (let a = 0; a < 6; a++) for (let b = 0; b < 8; b++) { c.fillStyle = (a + b) % 2 ? '#141414' : '#f6f6f2'; c.fillRect(x + a * cell / 6, b * 16, cell / 6, 16); }
    });
  });
  const flagMaterial = new THREE.MeshStandardMaterial({ map: flagAtlas, side: THREE.DoubleSide, roughness: 0.9, name: 'flags' });
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.5, name: 'flag-pole' });
  const marshalSpots = [{ distance: 1.2, lane: -7.1, start: true }];
  for (const corner of layout.corners) {
    for (const lane of [-corner.sign * 7.2, corner.sign * 7.6]) {
      const d = corner.end + 5, s = sample(d, lane);
      if (clear(s.position.x, s.position.z, d, 8)) { marshalSpots.push({ distance: d, lane }); break; }
    }
  }
  const marshals = marshalSpots.slice(0, phone ? 4 : 7).map((spot, index) => {
    const s = sample(spot.distance, spot.lane), facing = faceTrack(s, spot.lane);
    const post = new THREE.Group(); post.name = `marshal-${index}`;
    post.position.copy(s.position); post.rotation.y = facing; group.add(post);
    post.updateMatrixWorld(true);
    const height = spot.start ? 0.9 : 0.6;
    // Platform, rail and a little sign; merged with the rest of the static set.
    batch.add(box, painted, [0, height / 2 - 0.1, 0], [0, 0, 0], [1.5, height + 0.2, 1.3], 0xf2efe6, post.matrixWorld);
    batch.add(box, painted, [0, height + 0.02, 0], [0, 0, 0], [1.6, 0.06, 1.4], 0x3b4442, post.matrixWorld);
    batch.add(box, painted, [0, height * 0.5, 0.66], [0, 0, 0], [1.3, 0.3, 0.02], 0xe9782f, post.matrixWorld);
    for (const x of [-0.75, 0.75]) batch.add(box, steel, [x, height + 0.5, -0.65], [0, 0, 0], [0.04, 1.0, 0.04], null, post.matrixWorld);
    batch.add(box, steel, [0, height + 1.0, -0.65], [0, 0, 0], [1.54, 0.04, 0.04], null, post.matrixWorld);
    const person = createPerson(appearanceFor(`Funktionär ${index + 1}`, {
      detail: 'low', headwear: { style: 'cap', color: 0xe9782f },
      outfit: { top: 'jacket', topColor: 0xf07a22, bottom: 'trousers', bottomColor: 0x2a3130, shoes: 'boots', shoeColor: 0x2a2622 }
    }));
    person.root.position.set(0.15, height + 0.05, 0.05); post.add(person.root);
    const pole = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.05, 6), poleMaterial); stick.position.y = 0.35; stick.castShadow = true; pole.add(stick);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5, 8, 3), flagMaterial);
    cloth.position.set(0, 0.62, 0.36); cloth.rotation.y = -Math.PI / 2; cloth.castShadow = true; pole.add(cloth);
    person.hold(pole, 'R', 'power', { diameter: 0.025, blend: 0.01 });
    const rest = cloth.geometry.attributes.position.array.slice();
    const marshal = { spot, post, person, pole, cloth, rest, flag: 'yellow', until: 0, phase: index * 1.7, waving: false, pose: POSES.stand(), visible: true };
    setFlagCloth(marshal, spot.start ? 'green' : 'yellow');
    return marshal;
  });
  function setFlagCloth(marshal, kind) {
    const i = Math.max(0, FLAGS.indexOf(kind));
    const { uv } = marshal.cloth.geometry.attributes;
    const u0 = i * 0.2, u1 = u0 + 0.2;
    const grid = 9;
    for (let k = 0; k < uv.count; k++) uv.setX(k, u0 + (u1 - u0) * ((k % grid) / (grid - 1)));
    uv.needsUpdate = true;
    marshal.flag = kind;
  }
  let clock = 0;
  function startFlag(kind, seconds, which = null) {
    for (const marshal of marshals) {
      if (which && !which(marshal)) continue;
      setFlagCloth(marshal, kind);
      marshal.until = clock + seconds;
    }
  }

  /* ---------------------------------------------------------- confetti */
  const confettiCount = reducedMotion ? 60 : phone ? 140 : 320;
  const confettiMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, name: 'confetti' });
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.045), confettiMaterial, confettiCount);
  const palette = [0xf2c05c, 0xc8372b, 0xf4f4ee, 0x2f6fd0, 0x2e9a45, 0xe9782f].map(c => new THREE.Color(c));
  const bits = Array.from({ length: confettiCount }, (_, i) => {
    confetti.setColorAt(i, palette[i % palette.length]);
    return { p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(random() * 6, random() * 6, random() * 6), r: new THREE.Euler(), life: 0 };
  });
  confetti.count = 0; confetti.frustumCulled = false; confetti.name = 'confetti'; group.add(confetti);
  let confettiLive = 0;
  const standWorld = new THREE.Vector3();
  function burstConfetti(amount) {
    const n = Math.min(confettiCount, Math.round(confettiCount * amount));
    for (let i = 0; i < n; i++) {
      const b = bits[i];
      const fromStand = i % 3 !== 0;
      if (fromStand) {
        standWorld.set((random() - 0.5) * standLength, tiers * tierRise + 2.2, -random() * 2.5).applyMatrix4(standMatrix);
        b.p.copy(standWorld);
        b.v.set((random() - 0.5) * 2, 2 + random() * 3, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, stand.rotation.y);
        b.v.addScaledVector(new THREE.Vector3(Math.sin(stand.rotation.y), 0, Math.cos(stand.rotation.y)), 2 + random() * 2.5);
      } else {
        b.p.copy(line.position).addScaledVector(line.right, (random() - 0.5) * 9); b.p.y += beam + 0.6;
        b.v.set((random() - 0.5) * 2.5, 1 + random() * 2.5, (random() - 0.5) * 2.5);
      }
      b.life = 5 + random() * 3;
    }
    confettiLive = Math.max(confettiLive, n);
  }

  /* ---------------------------------------------------------- celebration */
  const celebrationPoint = sample(6, 0).position.clone(); celebrationPoint.y += 0.7;
  let celebrating = 0;
  function celebrate(position = 6) {
    const place = Math.max(1, Math.min(6, Number(position) || 6));
    celebrating = 14;
    startFlag('chequered', 14, m => m.spot.start);
    crowd.react(place <= 3 ? 'ovation' : 'cheer', place <= 3 ? 9 : 4);
    crowd.setMood(place <= 3 ? 'clap' : 'polite');
    burstConfetti(place === 1 ? 1 : place <= 3 ? 0.7 : 0.3);
  }
  function incident(distance) {
    // The nearest post upstream of the incident shows a waved yellow.
    let best = null, gap = Infinity;
    for (const marshal of marshals) {
      if (marshal.spot.start) continue;
      const g = (((distance - marshal.spot.distance) % length) + length) % length;
      if (g < gap && g < 140) { gap = g; best = marshal; }
    }
    if (best && (best.flag !== 'yellow' || best.until < clock)) { setFlagCloth(best, 'yellow'); }
    if (best) best.until = clock + 4;
  }

  batch.build(group, { name: 'startline' });

  const camera = new THREE.Vector3();
  return {
    group, crowd, celebrationPoint, lamps,
    setStartLights, celebrate, incident,
    cheer() { crowd.react('cheer', 2.3); },
    reset() {
      celebrating = 0; confettiLive = 0; confetti.count = 0;
      crowd.setMood('idle');
      startFlag('yellow', 0);
      setFlagCloth(marshals[0], 'green');
      setStartLights(0, false);
    },
    /** Marshals and crowd near `viewer` animate; far ones hold still. */
    update(dt, time, viewer = null, focus = null) {
      clock = time;
      if (viewer) camera.copy(viewer);
      if (focus) { lookTarget.copy(focus).applyMatrix4(standInverse); crowd.lookAt(lookTarget); }
      crowd.update(dt, time);
      celebrating = Math.max(0, celebrating - dt);
      for (const marshal of marshals) {
        const near = !viewer || marshal.post.position.distanceToSquared(camera) < (phone ? 70 * 70 : 95 * 95);
        marshal.post.visible = near;
        if (!near) continue;
        const active = marshal.until > time;
        const { pose } = marshal;
        POSES.stand(time, pose);
        if (active) {
          // A big figure-of-eight wave above the head.
          const w = reducedMotion ? 0.3 : Math.sin(time * 5.2 + marshal.phase);
          pose.upperArmR = [0.15 + 0.15 * w, 0.1, -2.35 - 0.45 * w];
          pose.forearmR = [-0.35 - 0.25 * Math.max(0, w), 0, 0];
          pose.handR = [0, 0, 0.2 * w];
        } else {
          // Flag furled at the side, pointing down and forward.
          pose.upperArmR = [-0.25, 0.05, -0.12];
          pose.forearmR = [-0.6, 0, 0];
          pose.handR = [0.5, 0, 0];
        }
        marshal.person.setPose(pose);
        marshal.person.update(dt, time);
        if (!reducedMotion || active) {
          const p = marshal.cloth.geometry.attributes.position;
          const amp = active ? 0.12 : 0.03, speed = active ? 9 : 3;
          for (let i = 0; i < p.count; i++) {
            const x = marshal.rest[i * 3], along = x + 0.35;
            p.setZ(i, Math.sin(along * 7 - time * speed + marshal.phase) * along * amp);
          }
          p.needsUpdate = true;
        }
      }
      if (confettiLive) {
        let alive = 0;
        const drag = Math.exp(-dt * 1.6);
        for (let i = 0; i < confettiLive; i++) {
          const b = bits[i];
          if (b.life <= 0) continue;
          b.life -= dt;
          b.v.multiplyScalar(drag); b.v.y -= 2.6 * dt;
          b.v.y = Math.max(b.v.y, -1.1);
          b.p.addScaledVector(b.v, dt);
          b.p.x += Math.sin(time * 3 + i) * dt * 0.4;
          if (b.p.y < route.terrainHeight(b.p.x, b.p.z) + 0.05) { b.p.y = route.terrainHeight(b.p.x, b.p.z) + 0.05; b.v.set(0, 0, 0); }
          b.r.set(b.r.x + b.spin.x * dt, b.r.y + b.spin.y * dt, b.r.z + b.spin.z * dt);
          dummy.position.copy(b.p); dummy.rotation.copy(b.r); dummy.scale.setScalar(Math.min(1, b.life)); dummy.updateMatrix();
          confetti.setMatrixAt(alive, dummy.matrix); confetti.setColorAt(alive, palette[i % palette.length]);
          alive++;
        }
        confetti.count = alive;
        confetti.instanceMatrix.needsUpdate = true;
        if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
        if (!alive) confettiLive = 0;
      }
    },
    dispose() {
      crowd.dispose?.();
      for (const marshal of marshals) {
        marshal.person.release('R');
        marshal.person.dispose();
        marshal.pole.traverse(o => o.geometry?.dispose());
      }
      flagMaterial.dispose(); poleMaterial.dispose(); flagAtlas.dispose();
    }
  };
}
