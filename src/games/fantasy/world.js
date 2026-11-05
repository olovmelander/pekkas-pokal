import * as THREE from 'three';
import { createPerson, appearanceFor, POSES } from '../shared/people.js';

export function buildStadium(scene, { reducedMotion = false } = {}) {
  const root = new THREE.Group();
  scene.add(root);
  const mat = (color, roughness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness });
  const grass = [mat(0x286f49), mat(0x327e52)];
  const white = mat(0xf9efcf);
  const concrete = mat(0x232c3c);
  const dark = mat(0x121b2c);
  const gold = mat(0xc8a44f, 0.38);
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d, material, x, y, z) => add(new THREE.BoxGeometry(w, h, d), material, x, y, z);
  box(70, 0.8, 85, dark, 0, -0.65, 0);
  for (let z = -25; z < 25; z += 5) box(32, 0.14, 5, grass[(z + 25) / 5 % 2], 0, 0, z + 2.5);
  const line = (a, b, c, d) => {
    const length = Math.hypot(c - a, d - b);
    const mesh = box(0.1, 0.025, length, white, (a + c) / 2, 0.092, (b + d) / 2);
    mesh.rotation.y = Math.atan2(c - a, d - b);
  };
  for (const z of [-24, 0, 24]) line(-15, z, 15, z);
  for (const x of [-15, 15]) line(x, -24, x, 24);
  const circle = add(new THREE.RingGeometry(4.1, 4.22, 64), white, 0, 0.1, 0);
  circle.rotation.x = -Math.PI / 2;
  for (const side of [-1, 1]) {
    const z = side * 24;
    line(-7, z, -7, z - side * 7);
    line(7, z, 7, z - side * 7);
    line(-7, z - side * 7, 7, z - side * 7);
    line(-3, z, -3, z - side * 2.8);
    line(3, z, 3, z - side * 2.8);
    line(-3, z - side * 2.8, 3, z - side * 2.8);
    box(6.3, 0.14, 0.14, white, 0, 2.55, z);
    for (const x of [-3.1, 3.1]) box(0.14, 2.6, 0.14, white, x, 1.3, z);
    const netMat = new THREE.LineBasicMaterial({ color: 0xb4c2b8, transparent: true, opacity: 0.38 });
    const vertices = [];
    for (let x = -3.1; x <= 3.11; x += 0.4) vertices.push(x, 0, z + side * 1.7, x, 2.55, z + side * 1.7);
    for (let y = 0; y <= 2.6; y += 0.35) vertices.push(-3.1, y, z + side * 1.7, 3.1, y, z + side * 1.7);
    const net = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)), netMat);
    root.add(net);
  }
  const crowdGeo = new THREE.CapsuleGeometry(0.22, 0.34, 2, 5);
  const crowd = new THREE.InstancedMesh(crowdGeo, mat(0xffffff), 520);
  const dummy = new THREE.Object3D();
  const crowdColors = [0xede1bc, 0x252d3e, 0xb7473d, 0x4d7499, 0xd4a955];
  let count = 0;
  for (const side of [-1, 1]) {
    for (let row = 0; row < 5; row++) {
      const x = side * (18.5 + row * 1.65);
      box(2.2, 0.7 + row * 0.95, 57, concrete, x, (0.7 + row * 0.95) / 2, 0);
      for (let i = 0; i < 40; i++) {
        dummy.position.set(x, 1.2 + row * 0.95, -26 + i * 1.35);
        dummy.scale.setScalar(0.85 + Math.sin(i * 13 + row) * 0.12);
        dummy.rotation.set(0, side * Math.PI / 2, 0);
        dummy.updateMatrix();
        crowd.setMatrixAt(count, dummy.matrix);
        crowd.setColorAt(count++, new THREE.Color(crowdColors[(i * 7 + row * 3) % crowdColors.length]));
      }
    }
    box(14, 0.3, 59, dark, side * 25, 8.2, 0);
    box(0.2, 8, 0.2, gold, side * 29, 4, -27);
    box(0.2, 8, 0.2, gold, side * 29, 4, 27);
    for (let row = 0; row < 3; row++) {
      box(32, 1 + row, 2.3, concrete, 0, (1 + row) / 2, side * (29 + row * 1.8));
      for (let i = 0; i < 20; i++) {
        dummy.position.set(-14 + i * 1.45, 1.5 + row, side * (29 + row * 1.8));
        dummy.rotation.set(0, side > 0 ? Math.PI : 0, 0);
        dummy.updateMatrix();
        crowd.setMatrixAt(count, dummy.matrix);
        crowd.setColorAt(count++, new THREE.Color(crowdColors[(i + row * 3) % crowdColors.length]));
      }
    }
  }
  root.add(crowd);
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 1024;
  bannerCanvas.height = 80;
  const ctx = bannerCanvas.getContext('2d');
  ctx.fillStyle = '#101c2b';
  ctx.fillRect(0, 0, 1024, 80);
  ctx.fillStyle = '#e7c877';
  ctx.font = 'bold 31px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('P E K K A S   P O K A L    •    E S T .  2 0 1 1', 512, 51);
  const banner = new THREE.CanvasTexture(bannerCanvas);
  banner.colorSpace = THREE.SRGBColorSpace;
  for (const side of [-1, 1]) {
    const board = add(new THREE.PlaneGeometry(44, 2.1), new THREE.MeshBasicMaterial({ map: banner }), side * 17.7, 1.1, 0);
    board.rotation.y = -side * Math.PI / 2;
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffebbf });
  for (const x of [-24, 24]) {
    for (const z of [-29, 29]) {
      box(0.28, 15, 0.28, concrete, x, 7.5, z);
      const lamps = box(4.6, 1.5, 0.35, dark, x, 15, z);
      lamps.lookAt(0, 0, 0);
      for (let i = 0; i < 4; i++) box(0.75, 0.9, 0.42, lampMat, x - 1.5 + i, 15, z + (z > 0 ? -0.2 : 0.2));
      const light = new THREE.SpotLight(0xdcecff, 180, 75, 0.8, 0.8, 1.3);
      light.position.set(x, 14.5, z);
      light.target.position.set(x * 0.2, 0, z * 0.2);
      root.add(light, light.target);
    }
  }
  const ball = add(new THREE.IcosahedronGeometry(0.35, 1), white, 0, 0.45, 0);
  const ballEdges = new THREE.LineSegments(new THREE.EdgesGeometry(ball.geometry), new THREE.LineBasicMaterial({ color: 0x26323e }));
  ball.add(ballEdges);
  const people = [];
  const positions = [[0, 21], [-4, 11], [6, 3], [-6, 1], [0, -10]];
  for (let i = 0; i < 10; i++) {
    const home = i < 5;
    const person = createPerson(appearanceFor(['Elliot Holt', 'Theo Ward', 'Milo Hart', 'Arlo Cole', 'Max Brook'][i % 5], {
      detail: 'low',
      outfit: { top: 'jersey', topColor: home ? 0xe1b34e : 0x4077b0, bottom: 'shorts', bottomColor: home ? 0x18273a : 0xf3e9d6, shoes: 'sneakers', accent: 0xf5eee0 }
    }));
    const pos = positions[i % 5];
    person.root.position.set(pos[0] * (home ? 1 : -1), 0.12, pos[1] * (home ? 1 : -1));
    person.root.rotation.y = home ? Math.PI : 0;
    root.add(person.root);
    people.push({ person, x: person.root.position.x, z: person.root.position.z, i });
  }
  const marker = add(new THREE.RingGeometry(0.65, 0.85, 48), new THREE.MeshBasicMaterial({ color: 0xffd47b, transparent: true, opacity: 0.9, depthWrite: false }), 0, 0.12, 0);
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  const trailPoints = new Float32Array(45);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPoints, 3));
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xffdf9e, transparent: true, opacity: 0.55 }));
  trail.frustumCulled = false;
  trail.visible = false;
  root.add(trail);
  let highlight = null;
  let highlightTime = 0;
  const setBall = (t) => {
    const source = people[highlight.slot];
    const isSave = !highlight.goals && highlight.saves >= 3;
    const startX = isSave ? -5 : source.x;
    const startZ = isSave ? 10 : source.z;
    const endX = Math.sin(highlight.slot * 2.3) * 2.3;
    const endZ = isSave ? 22 : -24;
    return [startX + (endX - startX) * t, 0.42 + Math.sin(Math.PI * t) * (isSave ? 1.2 : 2.7), startZ + (endZ - startZ) * t];
  };
  return {
    ball,
    highlight(row, slot) {
      highlight = { ...row, slot };
      highlightTime = 0;
      ctx.fillStyle = '#101c2b'; ctx.fillRect(0, 0, 1024, 80);
      ctx.fillStyle = '#ffe2a0'; ctx.font = 'bold 31px Georgia';
      ctx.fillText(`${row.goals ? 'MÅÅÅL!   ' : ''}${row.player.name.toUpperCase()}    +${row.total} POÄNG`, 512, 51);
      banner.needsUpdate = true;
    },
    update(dt, time, live, celebration) {
      if (highlight) highlightTime += dt;
      const highlightActive = highlight && highlightTime < 2.25;
      crowd.position.y = !reducedMotion && celebration > 0 ? Math.abs(Math.sin(time * 7)) * 0.12 : 0;
      people.forEach(({ person, x, z, i }) => {
        const move = live ? 1 : 0.12;
        person.root.position.x = x + Math.sin(time * 0.8 + i * 2) * 3.1 * move;
        person.root.position.z = z + Math.sin(time * 0.53 + i) * 4.2 * move;
        const hero = highlightActive && i === highlight.slot;
        person.setPose(hero && highlightTime > 1.2 && highlight.goals ? POSES.cheer(time) : live ? POSES.walk(time * 6 + i) : POSES.stand(time), 0.2);
        person.setExpression(celebration > 0 ? 'grin' : 'focus', 0.6);
        person.update(dt, time);
      });
      marker.visible = !!highlightActive;
      trail.visible = !!highlightActive && (highlight.goals || highlight.assists || highlight.saves >= 3);
      if (highlightActive) {
        const source = people[highlight.slot].person.root.position;
        marker.position.set(source.x, 0.14, source.z);
        marker.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(highlightTime * 5) * 0.12);
      }
      if (trail.visible) {
        const progress = Math.min(1, highlightTime / 1.4);
        ball.position.set(...setBall(progress));
        for (let i = 0; i < 15; i++) {
          const p = setBall(Math.max(0, progress - (14 - i) * 0.018));
          trailPoints.set(p, i * 3);
        }
        trailGeometry.attributes.position.needsUpdate = true;
      } else ball.position.set(Math.sin(time * 0.75) * 8, 0.45, Math.sin(time * 0.5) * 15);
      ball.rotation.x = time;
      ball.rotation.z = time * 0.7;
    },
    dispose() { people.forEach(({ person }) => person.dispose()); }
  };
}
