import { clamp, bootTrajectory, bootRange, horseshoePoints } from './rules.js';

export function createThrowEvent(kind, ctx) {
  const { THREE, group, mesh, box, cylinder } = ctx;
  const boot = kind === 'boot';
  const projectile = new THREE.Group(); group.add(projectile);
  if (boot) {
    // The long toe faces the camera, so the rubber boot reads even on a phone.
    const shaft = cylinder(0.205, 0.91, 0x425e43, 0, 0.41, -0.19, projectile, 0.275); shaft.scale.z = 0.82;
    const foot = mesh(new THREE.SphereGeometry(0.32, 18, 12), 0x49694c, 0, -0.035, 0.34, projectile);
    foot.scale.set(0.86, 0.61, 2.0);
    // A dark welt, rounded toe sole and separate heel make a visible L-shaped profile.
    box(0.57, 0.12, 1.04, 0x28352b, 0, -0.2, 0.17, projectile);
    const soleToe = cylinder(0.285, 0.12, 0x28352b, 0, -0.2, 0.69, projectile); soleToe.scale.z = 1.12;
    box(0.5, 0.18, 0.38, 0x202c25, 0, -0.22, -0.19, projectile);
    for (let z = 0.04; z <= 0.8; z += 0.19) box(0.59, 0.025, 0.04, 0x536348, 0, -0.19, z, projectile);
    const cuff = cylinder(0.285, 0.065, 0xd0b36c, 0, 0.885, -0.19, projectile); cuff.scale.z = 0.82;
    const hole = cylinder(0.235, 0.008, 0x202d27, 0, 0.922, -0.19, projectile); hole.scale.z = 0.82; hole.castShadow = false;
    box(0.1, 0.2, 0.055, 0xd0b36c, 0, 0.91, -0.43, projectile);
    box(0.02, 0.68, 0.035, 0x71856a, 0.225, 0.43, -0.13, projectile);
    for (let z = 0; z >= -40; z -= 5) {
      box(7, 0.025, 0.07, 0xd2c79f, 0, 0.04, z, group);
      cylinder(0.045, 0.55, 0xead4a1, 3.7, 0.27, z, group);
      box(0.45, 0.35, 0.035, z % 10 ? 0x749c7a : 0xd6b766, 3.91, 0.7, z, group);
    }
  } else {
    const u = mesh(new THREE.TorusGeometry(0.42, 0.095, 8, 32, Math.PI * 1.55), 0x919d9c, 0, 0, 0, projectile);
    u.rotation.x = -Math.PI / 2; u.rotation.z = Math.PI * 0.22;
    for (const x of [-0.34, 0.34]) box(0.16, 0.18, 0.2, 0xaab1a6, x, 0.03, 0.24, projectile);
  }
  const stake = new THREE.Group(); group.add(stake);
  if (!boot) {
    cylinder(0.075, 1.2, 0x9c7560, 0, 0.6, 0, stake);
    cylinder(0.14, 0.1, 0xe3c584, 0, 1.2, 0, stake);
    const ring = mesh(new THREE.TorusGeometry(0.65, 0.035, 6, 36), 0xf4d37d, 0, 0.06, 0, stake); ring.rotation.x = Math.PI / 2;
    const sand = cylinder(1.65, 0.05, 0xc5b583, 0, 0.025, 0, stake); sand.castShadow = false;
  }
  const marker = mesh(new THREE.TorusGeometry(0.28, 0.027, 5, 24), 0xffedbd, 0, 0.05, -6, group); marker.rotation.x = Math.PI / 2;
  const arcGeometry = new THREE.BufferGeometry(); arcGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(19 * 3), 3));
  const arcMaterial = new THREE.LineDashedMaterial({ color: 0xe7dbaa, transparent: true, opacity: 0.45, dashSize: 0.3, gapSize: 0.2 });
  const arc = new THREE.Line(arcGeometry, arcMaterial); arc.frustumCulled = false; group.add(arc); arc.visible = boot;
  let angle = 42, aim = 0, charge = 0, power = 0.1, holding = false, phase = 'aim', flight = null;
  let attempt = 0, wait = 0, score = 0, best = 0, target = { x: -1.4, z: -5.5 }, done = false;
  const maximum = bootRange(1, 44);
  function reset() {
    projectile.position.set(0, 1.4, 6); projectile.rotation.set(0, 0, 0);
    target = [{ x: -1.4, z: -5.5 }, { x: 1.7, z: -7.2 }, { x: -0.5, z: -9.4 }][attempt % 3];
    stake.position.set(target.x, 0, target.z);
    phase = 'aim'; charge = 0; power = 0.1; holding = false;
    ctx.track(0); ctx.focus(1);
  }
  reset();
  return {
    down() { if (phase === 'aim' && !done) { holding = true; charge = 0; } },
    up() {
      if (!holding || phase !== 'aim' || done) return;
      holding = false; phase = 'flight';
      flight = { t: 0, power, angle, x: aim * 4.5, z: 6 - (5 + power * 15) };
      ctx.tone(210, 0.1, 'triangle');
    },
    cancel() { holding = false; },
    dispose() { arcMaterial.dispose(); },
    step(dt, time, input) {
      if (done) return;
      if (phase === 'aim') {
        if (boot) angle = clamp(angle + input.direction * dt * 26, 20, 70);
        else aim = clamp(aim + input.direction * dt * 0.55, -1, 1);
        if (holding) { charge += dt; power = 0.08 + 0.92 * (0.5 - Math.cos(charge * 2.2) * 0.5); }
        marker.visible = !boot;
        marker.position.set(aim * 4.5, 0.06, 6 - (5 + power * 15));
        projectile.rotation.z = boot ? (angle - 45) * 0.012 : 0;
        if (boot) {
          arc.visible = true;
          const duration = bootRange(power, angle) / ((8 + power * 12) * Math.cos(angle * Math.PI / 180));
          const positions = arcGeometry.attributes.position;
          for (let i = 0; i <= 18; i++) { const p = bootTrajectory(power, angle, duration * i / 18); positions.setXYZ(i, 0, Math.max(0.22, p.height), 6 - p.distance); }
          positions.needsUpdate = true; arc.computeLineDistances();
        }
      } else if (phase === 'flight') {
        flight.t += dt; marker.visible = false; arc.visible = false;
        if (boot) {
          const pos = bootTrajectory(flight.power, flight.angle, flight.t);
          projectile.position.set(0, Math.max(0.22, pos.height), 6 - pos.distance);
          projectile.rotation.x -= dt * 7;
          projectile.rotation.z = Math.sin(flight.t * 3) * 0.16;
          ctx.track(Math.min(0, projectile.position.z + 5)); ctx.focus(Math.min(5, Math.max(1, pos.height * 0.3)));
          if (pos.height <= 0.22) {
            const distance = bootRange(flight.power, flight.angle);
            projectile.position.set(0, 0.22, 6 - distance);
            best = Math.max(best, distance);
            ctx.toast(`${distance.toFixed(2)} meter!${distance >= best ? ' Ditt längsta.' : ''}`);
            phase = 'rest'; wait = 1.6; attempt++; ctx.tone(180, 0.12, 'triangle');
          }
        } else {
          const t = clamp(flight.t / 1.45, 0, 1);
          projectile.position.set(flight.x * t, 1.4 + Math.sin(t * Math.PI) * 3 - t * 1.25, 6 + (flight.z - 6) * t);
          projectile.rotation.y += dt * 8;
          if (t >= 1) {
            const distance = Math.hypot(flight.x - target.x, flight.z - target.z);
            const points = horseshoePoints(distance); score += points;
            ctx.toast(distance <= 0.42 ? 'Ringer! Hästskon runt pinnen!' : `${distance.toFixed(2)} m från pinnen · ${points} p`);
            if (distance <= 0.42) { projectile.position.set(target.x, 0.12, target.z); projectile.rotation.set(0, 0, 0); }
            phase = 'rest'; wait = 1.55; attempt++; ctx.tone(points >= 800 ? 700 : 300, 0.15, 'triangle');
          }
        }
      } else if (phase === 'rest') {
        wait -= dt;
        if (wait <= 0) {
          if (attempt >= 3) {
            done = true;
            ctx.finish(boot ? clamp(best / maximum, 0, 1) * 1000 : score / 3, boot ? `Längsta stövelkastet: ${best.toFixed(2)} meter. Ditt bästa av tre kast räknas.` : 'Tre hästskor kastade. Ringer ger full poäng; avståndet till pinnen avgör övriga kast.');
          } else reset();
        }
      }
      ctx.hud(`${boot ? 'STÖVELKAST' : 'HÄSTSKOKAST'} · KAST ${Math.min(3, attempt + 1)}/3`, boot ? `${Math.round(angle)}° utkast · ${Math.round(power * 100)} % kraft · bästa ${best.toFixed(1)} m` : `${Math.round(power * 100)} % kraft · ← → sikta · håll och släpp`, power);
    }
  };
}
