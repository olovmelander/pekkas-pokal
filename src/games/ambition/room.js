import * as THREE from 'three';
import { createPerson, appearanceFor, POSES } from '../shared/people.js';

/** A candlelit card room; all surfaces and props are generated locally. */
export function buildRoom(scene, { reducedMotion = false } = {}) {
  const root = new THREE.Group();
  scene.add(root);
  const material = (color, roughness = 0.65, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const wood = material(0x492a20, 0.42);
  const darkWood = material(0x241813, 0.5);
  const gold = material(0xc3984f, 0.28, 0.72);
  const green = material(0x124b43, 0.94);
  const cream = material(0xe8d9b9, 0.5);
  const wax = material(0xe9bf78, 0.55);
  const glass = new THREE.MeshStandardMaterial({ color: 0x729fb1, transparent: true, opacity: 0.3, roughness: 0.15 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd18c });
  function mesh(geo, mat, x, y, z) {
    const object = new THREE.Mesh(geo, mat);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    root.add(object);
    return object;
  }
  const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const cylinder = (r, h, mat, x, y, z) => mesh(new THREE.CylinderGeometry(r, r, h, 40), mat, x, y, z);

  box(18, 0.2, 18, wood, 0, -0.12, 0);
  const longSeams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, 0.012, 18), darkWood, 17);
  const shortSeams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.68, 0.013, 0.013), darkWood, 153);
  const seamMatrix = new THREE.Matrix4();
  let shortIndex = 0;
  for (let i = -8; i <= 8; i++) {
    longSeams.setMatrixAt(i + 8, seamMatrix.makeTranslation(i * 0.68, 0, 0));
    for (let j = -4; j <= 4; j++) {
      shortSeams.setMatrixAt(shortIndex++, seamMatrix.makeTranslation(i * 0.68, 0, j * 2.2 + (i % 2) * 1.1));
    }
  }
  root.add(longSeams, shortSeams);
  box(18, 7, 0.2, material(0x213c42), 0, 3.4, -5.8);
  box(18, 1.4, 0.25, darkWood, 0, 0.7, -5.62);
  box(18, 0.07, 0.35, gold, 0, 1.42, -5.55);
  for (let x = -8; x < 9; x += 1.2) box(0.04, 1.3, 0.04, gold, x, 0.7, -5.46);

  // Evening sky and the silhouettes of Stockholm beyond tall mullioned windows.
  const sky = new THREE.MeshBasicMaterial({ color: 0x304867 });
  const skyline = new THREE.MeshBasicMaterial({ color: 0x172a3b });
  for (const x of [-4, 0, 4]) {
    box(2.8, 3.7, 0.07, gold, x, 3.7, -5.45);
    box(2.65, 3.55, 0.08, sky, x, 3.7, -5.39);
    for (let n = 0; n < 7; n++) {
      const h = 0.3 + ((n * 7 + 3) % 9) * 0.11;
      box(0.36, h, 0.05, skyline, x - 1.12 + n * 0.37, 2.05 + h / 2, -5.32);
      if (n % 2) box(0.06, 0.08, 0.06, glow, x - 1.12 + n * 0.37, 2.15 + h / 3, -5.26);
    }
    box(0.055, 3.55, 0.13, gold, x, 3.7, -5.22);
    box(2.65, 0.055, 0.13, gold, x, 3.8, -5.22);
    const curtain = material(0x662e32, 0.9);
    for (const side of [-1, 1]) {
      for (let n = 0; n < 4; n++) cylinder(0.11, 4.4, curtain, x + side * (1.42 + n * 0.12), 3.35, -5.16);
    }
  }
  const tabletop = cylinder(2.35, 0.23, darkWood, 0, 1.03, 0);
  tabletop.scale.z = 0.76;
  const inlay = cylinder(2.26, 0.03, gold, 0, 1.165, 0);
  inlay.scale.z = 0.76;
  const felt = cylinder(2.2, 0.035, green, 0, 1.19, 0);
  felt.scale.z = 0.76;
  const weave = document.createElement('canvas');
  weave.width = weave.height = 128;
  const weaveContext = weave.getContext('2d');
  weaveContext.fillStyle = '#f2f0df';
  weaveContext.fillRect(0, 0, 128, 128);
  weaveContext.strokeStyle = '#b9c9bd';
  weaveContext.lineWidth = 0.4;
  for (let i = 0; i < 128; i += 3) {
    weaveContext.beginPath(); weaveContext.moveTo(i, 0); weaveContext.lineTo(i, 128); weaveContext.stroke();
    weaveContext.beginPath(); weaveContext.moveTo(0, i); weaveContext.lineTo(128, i); weaveContext.stroke();
  }
  const weaveTexture = new THREE.CanvasTexture(weave);
  weaveTexture.wrapS = weaveTexture.wrapT = THREE.RepeatWrapping;
  weaveTexture.repeat.set(5, 5);
  weaveTexture.colorSpace = THREE.SRGBColorSpace;
  green.map = weaveTexture;
  for (const x of [-1.45, 1.45]) {
    for (const z of [-0.8, 0.8]) cylinder(0.1, 0.9, wood, x, 0.45, z);
  }
  const ring = mesh(new THREE.TorusGeometry(1.42, 0.008, 6, 90), gold, 0, 1.216, 0);
  ring.rotation.x = Math.PI / 2;
  ring.scale.y = 0.72;
  // Brass reading lamp, candles, a deck, coffee cups and score chips.
  cylinder(0.24, 0.035, gold, -1.72, 1.23, -0.6);
  cylinder(0.035, 0.7, gold, -1.72, 1.58, -0.6);
  const shade = mesh(new THREE.ConeGeometry(0.42, 0.38, 36, 1, true), material(0x346453), -1.72, 1.94, -0.6);
  shade.material.side = THREE.DoubleSide;
  const lamp = new THREE.PointLight(0xffd79b, 9, 6, 2);
  lamp.position.set(-1.72, 1.75, -0.6);
  root.add(lamp);
  const flames = [];
  for (const [x, z] of [[1.65, -0.65], [-1.4, 0.76]]) {
    cylinder(0.13, 0.04, gold, x, 1.25, z);
    cylinder(0.045, 0.22, gold, x, 1.38, z);
    cylinder(0.075, 0.32, wax, x, 1.62, z);
    const flame = mesh(new THREE.SphereGeometry(0.04, 10, 10), glow, x, 1.82, z);
    flame.scale.y = 2;
    flames.push(flame);
  }
  for (const [x, z] of [[1.53, 0.7], [-0.6, -1.2], [0.8, -1.05]]) {
    cylinder(0.14, 0.016, cream, x, 1.24, z);
    cylinder(0.086, 0.14, cream, x, 1.31, z);
    cylinder(0.074, 0.003, darkWood, x, 1.382, z);
    const handle = mesh(new THREE.TorusGeometry(0.055, 0.015, 7, 18), cream, x + 0.1, 1.32, z);
    handle.rotation.y = Math.PI / 2;
  }
  for (let i = 0; i < 5; i++) box(0.19, 0.012, 0.28, cream, -0.93, 1.24 + i * 0.013, -0.62);
  box(0.18, 0.005, 0.27, material(0x782a36), -0.93, 1.31, -0.62);
  for (let n = 0; n < 28; n++) {
    const angle = n * 2.399;
    const radius = 0.1 + (n % 5) * 0.03;
    cylinder(0.046, 0.018, n % 3 ? cream : gold, 0.88 + Math.sin(angle) * radius, 1.25 + Math.floor(n / 5) * 0.019, -0.65 + Math.cos(angle) * radius);
  }
  cylinder(0.07, 0.27, glass, 1.12, 1.37, -1.12);
  const pendant = new THREE.PointLight(0xffbb72, 35, 14, 2);
  pendant.position.set(0, 4, 0);
  root.add(pendant);
  const people = [];
  const cardBack = material(0x214d46, 0.48);
  [['Niklas Norberg', -2.75, 0, Math.PI / 2], ['Erik Vallgren', 0, -2.25, 0], ['Mikael Hägglund', 2.75, 0, -Math.PI / 2]].forEach(([name, x, z, angle]) => {
    const chair = box(0.63, 0.12, 0.62, wood, x, 0.51, z);
    chair.rotation.y = angle;
    const back = box(0.63, 0.8, 0.09, wood, x - Math.sin(angle) * 0.28, 0.95, z - Math.cos(angle) * 0.28);
    back.rotation.y = angle;
    const person = createPerson(appearanceFor(name, { detail: matchMedia('(pointer: coarse)').matches ? 'low' : 'high', outfit: { top: 'shirt', bottom: 'trousers' } }));
    person.root.position.set(x, 0.06, z);
    person.root.rotation.y = angle;
    person.setPose(POSES.sit());
    person.setExpression('focus', 0.4);
    root.add(person.root);
    people.push(person);
    const hand = new THREE.Group();
    hand.position.set(x * 0.61, 1.245, z * 0.59);
    hand.rotation.y = angle;
    root.add(hand);
    for (let c = 0; c < 5; c++) {
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.008, 0.27), cream);
      paper.position.set((c - 2) * 0.075, c * 0.008, Math.abs(c - 2) * 0.012);
      paper.rotation.y = (c - 2) * -0.15;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.158, 0.003, 0.246), cardBack);
      back.position.y = 0.006;
      const stamp = new THREE.Mesh(new THREE.RingGeometry(0.033, 0.036, 16), gold);
      stamp.rotation.x = -Math.PI / 2;
      stamp.position.y = 0.009;
      paper.add(back, stamp);
      hand.add(paper);
    }
  });
  const prizeCoins = Array.from({ length: 10 }, (_, i) => {
    const coin = cylinder(0.06, 0.02, gold, 0, 1.3, 0);
    coin.visible = false;
    return { coin, delay: i * 0.06 };
  });
  let reaction = 0;
  let winner = 0;
  let rewardCount = 0;
  return {
    react(player, points) {
      winner = player;
      reaction = 1.8;
      rewardCount = Math.min(10, Math.max(1, points));
      people.forEach((person, i) => person.setExpression(i + 1 === player ? 'grin' : 'focus', 0.7));
    },
    update(dt, t) {
      reaction = Math.max(0, reaction - dt);
      flames.forEach((flame, i) => { flame.scale.y = 1.8 + Math.sin(t * 6.1 + i * 3) * 0.2; });
      people.forEach((person, i) => {
        person.setPose(!reducedMotion && reaction > 0.8 && i + 1 === winner ? POSES.sitClap(t) : POSES.sit(t), 0.16);
        person.update(dt, t);
      });
      const destinations = [[0, 1.25], [-1.7, 0], [0, -1.2], [1.7, 0]];
      prizeCoins.forEach(({ coin, delay }, i) => {
        const progress = Math.max(0, Math.min(1, (1.8 - reaction - delay) / 0.85));
        coin.visible = !reducedMotion && reaction > 0 && progress < 1 && i < rewardCount;
        const [x, z] = destinations[winner];
        coin.position.set(x * progress + Math.sin(i * 2.4) * 0.12, 1.25 + Math.sin(progress * Math.PI) * 0.55, z * progress);
        coin.rotation.z = progress * Math.PI * 2;
      });
    },
    dispose() {
      people.forEach((person) => person.dispose());
    }
  };
}
