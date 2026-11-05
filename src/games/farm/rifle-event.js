import { clamp, riflePoints } from './rules.js';

export function createRifleEvent(ctx) {
  const { THREE, group, box, cylinder, mesh } = ctx;
  const board = new THREE.Group(); group.add(board);
  board.position.set(0, 3.1, -7);
  box(4.8, 4.5, 0.18, 0x785e42, 0, 0, -0.1, board);
  for (const x of [-1.9, 1.9]) cylinder(0.1, 5.4, 0xbfa27a, x, 0.15, -0.16, board);
  for (let i = 0; i < 6; i++) {
    const disc = mesh(new THREE.CircleGeometry(1.6 - i * 0.245, 48), i % 2 ? 0x343c35 : 0xefe5c7, 0, 0, 0.015 + i * 0.004, board);
    disc.castShadow = false;
  }
  const sight = new THREE.Group(); board.add(sight);
  const circle = mesh(new THREE.TorusGeometry(0.17, 0.018, 5, 28), 0xf2bf5c, 0, 0, 0.13, sight);
  circle.material = new THREE.MeshBasicMaterial({ color: 0xffc957 });
  for (const rotation of [0, Math.PI / 2]) {
    const line = box(0.032, 0.5, 0.02, 0xf5c76a, 0, 0, 0.13, sight); line.rotation.z = rotation;
  }
  const gun = new THREE.Group(); group.add(gun); gun.position.set(0.65, 1.25, 5.7);
  const stock = box(0.25, 0.3, 0.88, 0x835034, 0, -0.05, 0.3, gun); stock.rotation.x = -0.12;
  box(0.12, 0.28, 0.15, 0x65402b, 0, -0.25, 0.03, gun);
  box(0.14, 0.13, 0.55, 0x3b4444, 0, 0.1, -0.23, gun);
  const barrel = cylinder(0.035, 1.3, 0x424a48, 0, 0.11, -0.95, gun); barrel.rotation.x = Math.PI / 2;
  const scope = cylinder(0.07, 0.45, 0x37423f, 0, 0.29, -0.28, gun); scope.rotation.x = Math.PI / 2;
  for (const z of [-0.1, -0.4]) box(0.08, 0.18, 0.07, 0x505957, 0, 0.2, z, gun);
  box(1.5, 0.1, 1.1, 0xb6a179, 0.65, 0.9, 6, group);
  for (const x of [0.1, 1.2]) box(0.08, 0.9, 0.75, 0x7c6d50, x, 0.45, 6, group);
  const shotLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffedb5, transparent: true, opacity: 0.65 }));
  group.add(shotLine); shotLine.visible = false;
  let x = 0, y = 0, time = 0, cooldown = 0, shots = 0, score = 0, done = false, pending = false;
  let driftX = 0, driftY = 0;
  const marks = [];
  function down() {
    if (done || pending || cooldown > 0) return;
    shots++;
    const hit = { x: x + driftX, y: y + driftY };
    const distance = Math.hypot(hit.x, hit.y);
    const points = riflePoints(distance);
    score += points;
    const hole = mesh(new THREE.CircleGeometry(0.047, 10), 0x191e1b, hit.x, hit.y, 0.12, board);
    hole.castShadow = false; marks.push(hole);
    const muzzle = new THREE.Vector3(0, 0.11, -1.6); gun.localToWorld(muzzle);
    const target = new THREE.Vector3(hit.x, hit.y, 0.13); board.localToWorld(target);
    const positions = shotLine.geometry.attributes.position;
    positions.setXYZ(0, muzzle.x, muzzle.y, muzzle.z); positions.setXYZ(1, target.x, target.y, target.z); positions.needsUpdate = true;
    shotLine.visible = true;
    cooldown = 0.42;
    y = clamp(y + 0.12, -1.9, 1.9);
    ctx.tone(135, 0.055, 'triangle');
    ctx.toast(points >= 900 ? 'Mitt i prick!' : `${Math.round(points / 100)} ringpoäng`);
    if (shots >= 10) pending = true;
  }
  return {
    down, up() {}, cancel() {},
    aim(nx, ny) { if (!done) { x = clamp(nx, -2.1, 2.1); y = clamp(ny - 3.1, -1.95, 1.95); } },
    step(dt, t, input) {
      if (done) return;
      time += dt; cooldown = Math.max(0, cooldown - dt);
      x = clamp(x + input.direction * dt * 1.65, -2.1, 2.1);
      y = clamp(y + (input.vertical || 0) * dt * 1.65, -1.95, 1.95);
      driftX = Math.sin(time * 2.6) * 0.1;
      driftY = Math.sin(time * 1.8 + 0.5) * 0.08;
      sight.position.set(x + driftX, y + driftY, 0);
      gun.rotation.y = -(x + driftX) * 0.07;
      gun.rotation.x = (y + driftY) * 0.065;
      gun.position.z = 5.7 + Math.max(0, cooldown - 0.22) * 0.45;
      shotLine.visible = cooldown > 0.28;
      ctx.hud(`LUFTGEVÄR · ${shots}/10 SKOTT`, 'Dra siktet på tavlan · pilar/WASD · tryck SKJUT', shots / 10);
      if (pending && cooldown === 0) { done = true; ctx.finish(score / 10, `Tio skott: ${(score / 1000).toFixed(1)} av 10 i genomsnitt. Siktet rör sig med andningen — välj ögonblicket.`); }
    },
    dispose() { circle.material.dispose(); shotLine.material.dispose(); }
  };
}
