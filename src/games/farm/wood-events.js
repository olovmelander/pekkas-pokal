import { stackPlacement, nailStrike, woodScore } from './wood-rules.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createWoodEvent(kind, ctx) {
  return kind === 'stack' ? createStack(ctx) : createHammer(ctx);
}

function createStack(ctx) {
  const { THREE, group, box, cylinder, mesh, finish, hud, toast, tone, focus } = ctx;
  const baseY = 0.45;
  box(5.5, 0.25, 3.4, 0x795a35, 0, baseY - 0.12, -2);
  for (const z of [-3.1, -0.9]) box(6, 0.12, 0.22, 0xc7a674, 0, baseY + 0.03, z);
  for (const x of [-2.3, 2.3]) box(0.3, 0.4, 3, 0x4f4931, x, 0.2, -2);
  // A physical metre stick makes height legible before reading any number.
  box(0.13, 12, 0.13, 0xe2ce9b, -3.3, 6, -3.8);
  for (let i = 0; i <= 20; i++) box(i % 2 ? 0.23 : 0.38, 0.045, 0.16, 0x6b573b, -3.12, baseY + i * 0.5, -3.8);
  const source = new THREE.Group(); group.add(source);
  source.position.set(4.4, 0, -3);
  for (let i = 0; i < 5; i++) {
    const log = cylinder(0.26, 2.3, 0x825a37, (i % 2) * 0.42, 0.27 + Math.floor(i / 2) * 0.45, 0, source);
    log.rotation.z = Math.PI / 2;
  }
  function bundle(x, y, width) {
    const g = new THREE.Group(); g.position.set(x, y, -2); group.add(g);
    for (const z of [-0.53, 0.53]) {
      const trunk = cylinder(0.29, 3.8, 0x9e7047, 0, 0, z, g); trunk.rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        const end = cylinder(0.275, 0.025, 0xd8b77c, side * 1.9, 0, z, g); end.rotation.z = Math.PI / 2;
        for (const r of [0.09, 0.18]) {
          const ring = mesh(new THREE.TorusGeometry(r, 0.01, 5, 16), 0x976b42, side * 1.92, 0, z, g); ring.rotation.y = Math.PI / 2;
        }
      }
      for (const yy of [-0.17, 0.12]) box(3.76, 0.027, 0.03, 0x705033, 0, yy, z + 0.24, g);
    }
    // A tall pile keeps four material draws per layer, rather than one per ring.
    const batches = new Map(), originals = [...g.children];
    for (const object of originals) {
      object.updateMatrix();
      const geometry = object.geometry.toNonIndexed().applyMatrix4(object.matrix);
      if (!batches.has(object.material)) batches.set(object.material, []);
      batches.get(object.material).push(geometry);
    }
    for (const [material, geometries] of batches) {
      const merged = new THREE.Mesh(mergeGeometries(geometries), material);
      merged.castShadow = merged.receiveShadow = true; g.add(merged);
      geometries.forEach((geometry) => geometry.dispose());
    }
    originals.forEach((object) => { g.remove(object); object.geometry.dispose(); });
    g.scale.x = width / 3.8;
    return g;
  }
  let elapsed = 0, level = 0, misses = 0, ended = false, dropping = false, breakTime = 0;
  let support = { x: 0, width: 3.8 };
  let active = bundle(-3.6, 2.3, support.width);
  let dropX = 0, fallVelocity = 0;
  const debris = [];
  const guideMaterial = new THREE.MeshBasicMaterial({ color: 0xf3d493, transparent: true, opacity: 0.3, depthWrite: false });
  const landingGuide = new THREE.Mesh(new THREE.BoxGeometry(1, 0.055, 1.55), guideMaterial); group.add(landingGuide);
  function spawn() {
    active = bundle(-3.8, baseY + level * 0.58 + 1.8, support.width);
    dropping = false; breakTime = 0.16;
  }
  function end() {
    if (ended) return;
    ended = true;
    finish(woodScore('stack', level), `${level} vedlager · ${(level * 0.58).toFixed(1)} meter · ${misses} tappade. ${level >= 16 ? 'En vedstapel värdig Billsta!' : 'Lägg mitt över föregående lager för bäst stöd.'}`);
  }
  return {
    step(dt, time) {
      if (ended) return;
      elapsed += dt; breakTime = Math.max(0, breakTime - dt);
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i]; d.vy -= dt * 12; d.root.position.y += d.vy * dt; d.root.position.x += d.vx * dt; d.root.rotation.z += d.vx * dt;
        if (d.root.position.y < -4) { d.root.visible = false; debris.splice(i, 1); }
      }
      if (dropping) {
        fallVelocity += dt * 12; active.position.y -= fallVelocity * dt;
        const landingY = baseY + level * 0.58 + 0.3;
        if (active.position.y <= landingY) {
          const result = stackPlacement(support, { x: dropX, width: support.width });
          if (result.stable) {
            active.position.set(result.x, landingY, -2); active.scale.x = result.width / 3.8;
            support = { x: result.x, width: result.width }; level++;
            tone(result.perfect ? 760 : 430, 0.12, 'triangle');
            toast(result.perfect ? 'Rakt över! Stabilt stöd.' : 'På plats – nästa lager får mindre stöd.');
            focus?.(Math.max(1, level * 0.28));
          } else {
            misses++; debris.push({ root: active, vx: dropX > support.x ? 2.4 : -2.4, vy: 1.3 });
            tone(160, 0.15, 'triangle'); toast('Utanför stödet! Du får en ny vedbit.');
          }
          spawn();
        }
      } else {
        active.position.x = Math.sin(time * (1.4 + level * 0.065)) * 3.4 + support.x * 0.25;
        active.rotation.z = Math.sin(time * 3) * 0.025;
      }
      const aligned = Math.abs(active.position.x - support.x) <= 0.14;
      landingGuide.position.set(support.x, baseY + level * 0.58 + 0.3, -2); landingGuide.scale.x = support.width;
      guideMaterial.color.set(aligned ? 0xa9e4ad : 0xf3d493); guideMaterial.opacity = aligned ? 0.6 : 0.25;
      hud(`${level} lager · ${(level * 0.58).toFixed(1)} m`, `${Math.ceil(Math.max(0, 30 - elapsed))} s · ${!dropping && aligned ? 'MITT ÖVER — SLÄPP!' : 'släpp ovanför den ljusa stödytan'}`, 1 - elapsed / 30);
      if (elapsed >= 30) end();
    },
    down() {
      if (ended || dropping || breakTime > 0) return;
      dropping = true; dropX = active.position.x; fallVelocity = 0; active.rotation.z = 0;
    },
    up() {},
    cancel() {},
    dispose() { guideMaterial.dispose(); }
  };
}

function createHammer(ctx) {
  const { THREE, group, box, cylinder, mesh, finish, hud, toast, tone } = ctx;
  box(6.8, 0.35, 2.9, 0x8f653e, 0, 1.25, -2);
  for (const x of [-2.7, 2.7]) for (const z of [-3, -1]) box(0.3, 1.2, 0.3, 0x675238, x, 0.6, z);
  const plank = box(6, 0.27, 1.2, 0xd4ab6d, 0, 1.55, -1.7);
  for (let i = 0; i < 11; i++) box(5.8, 0.007, 0.015, i % 2 ? 0xae844e : 0xbd945b, 0, 0.142, -0.5 + i * 0.1, plank);
  // Iron nail heads are deliberately oversized so strike depth reads on a phone.
  const nails = Array.from({ length: 5 }, (_, i) => {
    const nail = new THREE.Group(); nail.position.set(-2.4 + i * 1.2, 1.7, -1.7); group.add(nail);
    cylinder(0.055, 0.95, 0xaeb7b3, 0, 0.43, 0, nail);
    cylinder(0.19, 0.08, 0xe2e5d9, 0, 0.93, 0, nail);
    box(0.21, 0.006, 0.025, 0x81918e, 0, 0.974, 0, nail);
    return nail;
  });
  const mallet = new THREE.Group(); group.add(mallet);
  cylinder(0.065, 1.6, 0xaf8252, 0, 0.8, 0, mallet);
  box(0.78, 0.36, 0.38, 0x596360, 0, 1.65, 0, mallet);
  box(0.18, 0.39, 0.41, 0xb8beba, -0.36, 1.65, 0, mallet);
  box(0.075, 0.5, 0.22, 0xd3bc8b, 0, 0.45, 0.001, mallet);
  const ring = mesh(new THREE.TorusGeometry(0.4, 0.045, 8, 36), 0xefcf70, -2.4, 1.74, -1.7);
  ring.rotation.x = -Math.PI / 2;
  const chips = new THREE.Group(); group.add(chips);
  const particles = [];
  for (let i = 0; i < 12; i++) {
    const particle = box(0.04, 0.07, 0.025, i % 2 ? 0xe4c48b : 0xbc9156, 0, -3, 0, chips);
    particles.push({ mesh: particle, vx: 0, vy: 0, vz: 0, life: 0 });
  }
  let elapsed = 0, completed = 0, depth = 0, phase = 0, ended = false, strikeAt = -1, strikePhase = 0, applied = true;
  let cooldown = 0, attempts = 0, perfects = 0, struckIndex = 0;
  function end() {
    if (ended) return;
    ended = true;
    finish(woodScore('hammer', completed, 30 - elapsed), `${completed}/5 spikar · ${attempts} slag · ${perfects} fullträffar. ${completed === 5 ? `Klart på ${elapsed.toFixed(1)} sekunder!` : 'Träffa nära mätarens mitt för att slå djupare.'}`);
  }
  function hit() {
    const result = nailStrike(strikePhase, depth); ({ depth } = result);
    if (result.gain) {
      nails[completed].position.y = 1.7 - depth * 0.9;
      tone(result.perfect ? 620 : 380, 0.055, 'triangle');
      if (result.perfect) { perfects++; toast('Fullträff!'); }
      particles.forEach((p, i) => {
        p.mesh.position.set(nails[completed].position.x, 1.7, -1.7);
        p.vx = Math.sin(i * 2.3) * 1.8; p.vy = 1.1 + i % 3 * 0.4; p.vz = Math.cos(i * 2.3) * 1.4; p.life = 0.65;
      });
      if (depth >= 1) { completed++; depth = 0; toast(`Spik ${completed}/5 sitter!`); cooldown = 0.25; }
    } else { tone(140, 0.08, 'triangle'); toast('Snedträff – sikta på mitten av mätaren.'); }
    if (completed >= 5) end();
  }
  return {
    step(dt, time) {
      if (ended) return;
      elapsed += dt; cooldown = Math.max(0, cooldown - dt);
      phase = (Math.sin(time * 4.8) + 1) / 2;
      const nail = nails[strikeAt >= 0 ? struckIndex : Math.min(completed, 4)];
      ring.position.x = nail.position.x;
      ring.scale.setScalar(0.85 + Math.sin(time * 5) * 0.08);
      if (strikeAt >= 0) {
        const progress = (elapsed - strikeAt) / 0.32;
        // The head descends onto the selected nail before the strike is scored.
        const swing = Math.sin(Math.min(1, progress) * Math.PI);
        const angle = 0.15 + (1 - swing) * 0.6;
        mallet.rotation.z = angle;
        mallet.position.set(nail.position.x + Math.sin(angle) * 1.65, nail.position.y + 0.93 + (1 - swing) * 1.2 - Math.cos(angle) * 1.65, -1.7);
        if (!applied && progress >= 0.5) { applied = true; hit(); }
        if (progress >= 1) strikeAt = -1;
      } else {
        mallet.rotation.z = 0.75;
        mallet.position.set(nail.position.x + Math.sin(0.75) * 1.65, nail.position.y + 2.13 - Math.cos(0.75) * 1.65, -1.7);
      }
      particles.forEach((p) => {
        if (p.life <= 0) { p.mesh.visible = false; return; }
        p.life -= dt; p.mesh.visible = true; p.vy -= dt * 6;
        p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      });
      hud(`${completed}/5 spikar · ${Math.round(depth * 100)}%`, `${Math.ceil(Math.max(0, 30 - elapsed))} s · slå när mätaren är i mitten`, phase);
      if (elapsed >= 30) end();
    },
    down() {
      if (ended || strikeAt >= 0 || cooldown > 0) return;
      attempts++; strikeAt = elapsed; strikePhase = phase; applied = false; struckIndex = completed;
    },
    up() {},
    cancel() {}
  };
}
