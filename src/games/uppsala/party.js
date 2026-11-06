/**
 * Beer pong and flip cup for Pekkas Parkmästare (2014). Both plug into the
 * shared field engine as custom events: the engine owns the HUD shell,
 * panels, input and scoring; each event builds its own table, poses the
 * people it uses and drives its own close camera.
 */
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { POSES } from '../shared/people.js';
import { clamp, chargePower } from '../pentathlon/rules.js';
import {
  PONG, rackCups, pongPower, pongLanding, pongIdealPower, pongAimFor, pongJudge, pongScore,
  FLIP, FLIP_TIMING, flipOutcome, rivalFlipPlan, flipCupScore
} from './party-rules.js';

const RED = '#c4302b', RED_LIP = '#d9473c', WHITE = '#f3eee4';
const TOP = PONG.tableTop, CUP_H = PONG.cupHeight;
const ARC = 0.42;
const decimal = (n) => n.toFixed(1).replace('.', ',');
const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

/* ------------------------------------------------------------ shared kit */

/** One merged party cup (red outside, white inside, rolled lip) plus a liquid disc. */
function cupKit({ THREE, mat }) {
  const { cupRim: rim, cupBase: base } = PONG;
  const paint = (geometry, color) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const c = new THREE.Color(color), n = g.attributes.position.count, data = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { data[i * 3] = c.r; data[i * 3 + 1] = c.g; data[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(data, 3));
    return g;
  };
  const outer = new THREE.CylinderGeometry(rim, base, CUP_H, 28, 1, true).translate(0, CUP_H / 2, 0);
  // The inner wall is the same cone mirrored, with its normals turned inwards.
  const inner = new THREE.CylinderGeometry(rim * 0.955, base * 0.94, CUP_H * 0.97, 28, 1, true)
    .translate(0, CUP_H * 0.515, 0).scale(-1, 1, 1);
  const normals = inner.attributes.normal;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
  const bottom = new THREE.CircleGeometry(base, 28).rotateX(Math.PI / 2);
  const floor = new THREE.CircleGeometry(base * 0.94, 28).rotateX(-Math.PI / 2).translate(0, CUP_H * 0.03, 0);
  const lip = new THREE.TorusGeometry(rim * 0.985, 0.0045, 6, 28).rotateX(Math.PI / 2).translate(0, CUP_H, 0);
  const ridgeR = base + (rim - base) * 0.72 + 0.0008;
  const ridge = new THREE.TorusGeometry(ridgeR, 0.0018, 4, 28).rotateX(Math.PI / 2).translate(0, CUP_H * 0.72, 0);
  const parts = [paint(outer, RED), paint(inner, WHITE), paint(bottom, RED), paint(floor, WHITE), paint(lip, RED_LIP), paint(ridge, RED_LIP)];
  const geometry = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  // Same shader as the low-detail people (vertex colours), so nothing new compiles mid-game.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 });
  material.userData.fieldTransient = true;
  const liquidGeometry = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  return { THREE, geometry, material, liquidGeometry, beer: mat('#c98a2a', 0, 0.2), water: mat('#a9ccd1', 0, 0.12) };
}

function setFill(cup, fill) {
  const { cupRim: rim, cupBase: base } = PONG;
  const f = clamp(fill, 0, 1);
  cup.fill = f;
  cup.surface.visible = f > 0.03;
  const r = base * 0.94 + (rim * 0.955 - base * 0.94) * f - 0.002;
  cup.surface.position.y = CUP_H * (0.03 + 0.97 * f);
  cup.surface.scale.set(r, 1, r);
}

function makeCup(kit, parent, fill, liquid = kit.beer) {
  const { THREE } = kit;
  const group = new THREE.Group();
  const shell = new THREE.Mesh(kit.geometry, kit.material);
  shell.castShadow = true; shell.receiveShadow = true;
  const surface = new THREE.Mesh(kit.liquidGeometry, liquid);
  surface.receiveShadow = true;
  group.add(shell, surface); parent.add(group);
  const cup = { group, surface, fill: 0 };
  setFill(cup, fill);
  return cup;
}

function cooler({ box, world }, x, z, turn = 0) {
  const lid = box(0.57, 0.05, 0.36, '#eef1ec', x, 0.385, z, world);
  const body = box(0.55, 0.36, 0.34, '#2f6f8f', x, 0.18, z, world);
  lid.rotation.y = body.rotation.y = turn;
}

/** Small drops for a splash; each event keeps its own list. */
function splash(kit, world, list, at, color = kit.beer) {
  const { THREE } = kit;
  for (let i = 0; i < 7; i++) {
    const drop = new THREE.Mesh(splash.geometry || (splash.geometry = new THREE.SphereGeometry(1, 6, 4)), color);
    drop.scale.setScalar(0.006 + (i % 3) * 0.002);
    drop.position.copy(at);
    world.add(drop);
    const angle = i * 2.4;
    list.push({ mesh: drop, age: 0, v: new THREE.Vector3(Math.cos(angle) * 0.45, 0.9 + (i % 4) * 0.25, Math.sin(angle) * 0.45) });
  }
}
function stepDrops(world, list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    d.age += dt; d.v.y -= 9.8 * dt;
    d.mesh.position.addScaledVector(d.v, dt);
    if (d.age > 0.55 || d.mesh.position.y < TOP - 0.02) { world.remove(d.mesh); list.splice(i, 1); }
  }
}
function clearDrops(world, list) { list.forEach((d) => world.remove(d.mesh)); list.length = 0; }

/* -------------------------------------------------------------- beer pong */

function pongTable(ctx) {
  const { THREE, box, pole, world } = ctx;
  const { tableNear, tableFar, tableHalfWidth: hw } = PONG;
  const length = tableNear - tableFar, cz = (tableNear + tableFar) / 2;
  box(hw * 2, 0.04, length, '#2c5342', 0, TOP - 0.02, cz, world);
  // The painted top is a decal with polygon offset, so it never fights the board.
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 680;
  const g = canvas.getContext('2d');
  g.fillStyle = '#2f5a46'; g.fillRect(0, 0, 256, 680);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${0.015 + (i % 5) * 0.006})`; g.fillRect((i * 97) % 256, (i * 233) % 680, 2, 2); }
  g.strokeStyle = '#f1ead8'; g.lineWidth = 7; g.strokeRect(9, 9, 238, 662);
  g.lineWidth = 3; g.beginPath(); g.moveTo(128, 12); g.lineTo(128, 668); g.stroke();
  g.save(); g.translate(128, 340); g.rotate(-Math.PI / 2);
  g.fillStyle = '#2f5a46'; g.fillRect(-170, -42, 340, 84);
  g.strokeStyle = '#d6ba74'; g.lineWidth = 3; g.strokeRect(-170, -42, 340, 84);
  g.fillStyle = '#f1dfad'; g.font = 'italic 40px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Pekkas Pokal', 0, -6);
  g.font = '15px Georgia'; g.fillText('UPPSALA · 2014', 0, 26);
  g.restore();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, ctx.a.renderer.capabilities.getMaxAnisotropy());
  const paint = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  paint.userData.fieldTransient = true;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, length), paint);
  top.rotation.x = -Math.PI / 2; top.position.set(0, TOP + 0.001, cz); top.receiveShadow = true;
  world.add(top);
  for (const x of [-hw + 0.07, hw - 0.07]) {
    for (const z of [tableNear - 0.12, tableFar + 0.12]) pole(0.02, TOP - 0.04, '#4b524e', x, (TOP - 0.04) / 2, z, world);
    box(0.03, 0.03, length - 0.3, '#4b524e', x, 0.18, cz, world);
  }
}

function createBeerPong(ctx) {
  const { THREE, world, athlete, crew, ui, a } = ctx;
  const kit = cupKit(ctx);
  pongTable(ctx);
  cooler(ctx, 0.95, 6.95, 0.3);
  const cups = rackCups().map((c) => {
    const cup = makeCup(kit, world, 0.7);
    cup.group.position.set(c.x, TOP, c.z);
    return { ...c, cup, gone: -1 };
  });
  // The rinse cup by the thrower's corner, as at every beer pong table.
  makeCup(kit, world, 0.6, kit.water).group.position.set(0.34, TOP, 6.2);
  const pongBall = ctx.ball(PONG.ball, '#f8f5ec', 0, 1.4, 6.6, world);
  const ring = ctx.mesh(new THREE.TorusGeometry(0.05, 0.005, 6, 28), '#fff2bd', 0, PONG.rimHeight + 0.004, 4.3, world);
  ring.rotation.x = Math.PI / 2; ring.castShadow = false;
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.009, 6, 4), ctx.mat('#fff2bd'), 12);
  world.add(dots);
  const dot = new THREE.Object3D();

  // People: the thrower at the near end, Erik Vallgren behind the rack, the rest around the table.
  athlete.root.position.set(-0.22, 0.02, 6.86); athlete.root.rotation.set(0, Math.PI, 0);
  const host = crew.get('Erik Vallgren');
  host?.root.position.set(0.04, 0.02, 3.5); host?.root.rotation.set(0, 0, 0);
  // Out of the camera's way: two at the sides of the table, two behind the rack, two back by the thrower.
  const spots = [[-1.6, 4.55], [1.6, 4.85], [1.25, 3.45], [-1.2, 3.4], [2.05, 6.1], [-2.1, 5.8]];
  const fans = [...crew.values()].filter((p) => p !== host);
  const centre = { x: 0, z: 5.05 };
  fans.forEach((p, i) => {
    const [x, z] = spots[i % spots.length];
    p.root.position.set(x, 0.02, z); p.root.rotation.set(0, facing({ x, z }, centre), 0);
  });

  let time = 0, aim = 0, charge = 0, holding = false, used = 0, sunk = 0, streak = 0;
  let flight = null, readyAt = 0.4, throwT = 9, cheerUntil = -1, hostMood = 0, finishAt = -1, done = false;
  const drops = [];
  const hand = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3();
  const live = () => cups.filter((c) => c.live);
  const nearestTo = (x) => live().reduce((best, c) => (!best || Math.abs(c.x - x) < Math.abs(best.x - x) || (Math.abs(c.x - x) === Math.abs(best.x - x) && c.z > best.z) ? c : best), null);

  function handTarget(power) {
    const x = athlete.root.position.x + 0.2;
    if (throwT < 0.4) {
      const k = ease(clamp(throwT / 0.25, 0, 1));
      return hand.set(lerp(x, x + (flight ? flight.to.x * 0.2 : 0), k), lerp(1.36, 1.55, k), lerp(6.68, 6.42, k));
    }
    // Holding pulls the hand back and up a little, like a real wind-up.
    return hand.set(x, 1.36 + power * 0.05, 6.68 + power * 0.1);
  }

  function throwBall() {
    const power = pongPower(charge);
    const landing = pongLanding(aim, power);
    const judge = pongJudge(landing, cups);
    used++;
    const from = pongBall.position.clone();
    const to = new THREE.Vector3(landing.x, PONG.rimHeight, landing.z);
    flight = { t: 0, duration: 0.72, from, to, judge, phase: 'arc', v: new THREE.Vector3(), life: 0 };
    throwT = 0;
    a.tone(560, 0.05, 'triangle');
  }

  function land() {
    const { judge, to, from, duration } = flight;
    if (judge.result === 'sink') {
      const c = judge.cup;
      c.live = false; c.gone = 0; sunk++; streak++;
      flight.phase = 'drop'; flight.t = 0; flight.cup = c;
      cheerUntil = time + 1.3; hostMood = -1;
      a.tone(sunk === 6 ? 1040 : 780, 0.16, 'sine');
      a.toast(sunk === 6 ? 'Bordet är tomt!' : streak >= 3 ? `${streak} i rad – du brinner!` : streak === 2 ? 'I muggen igen! Varm hand.' : `I muggen! ${6 - sunk} kvar.`);
      return;
    }
    streak = 0; hostMood = 1;
    // The ball keeps the arc's velocity and bounces on.
    flight.v.copy(to).sub(from).divideScalar(duration);
    flight.v.y -= ARC * Math.PI / duration;
    if (judge.result === 'rim') {
      tmp.set(to.x - judge.cup.x, 0, to.z - judge.cup.z).normalize();
      flight.v.set(tmp.x * 0.7, 1.1, tmp.z * 0.7 + 0.25);
      a.tone(1320, 0.04, 'square'); a.toast('Studs på kanten!');
    } else {
      const target = judge.cup;
      const message = !target ? 'Miss.' : judge.result === 'off' && Math.abs(to.x) > PONG.tableHalfWidth ? 'Bredvid bordet – justera siktet.'
        : to.z > target.z + 0.09 ? 'För kort – lite mer kraft.' : to.z < target.z - 0.09 ? 'För långt – lite mindre kraft.' : 'Fel sida – justera siktet.';
      a.tone(300, 0.08, 'triangle'); a.toast(message);
    }
    flight.phase = 'loose'; flight.t = 0;
  }

  function nextBall() {
    flight = null;
    if (sunk === 6 || used >= PONG.balls) { done = true; finishAt = time + 1.1; return; }
    readyAt = time + 0.35;
  }

  return {
    aim: true,
    // Browser checks: read the state and throw with an exact aim and power.
    probe: {
      state: () => ({ sunk, used, done, flying: !!flight, cups: cups.filter((c) => c.live).length }),
      throwAt(index, power) {
        const cup = cups.filter((c) => c.live)[index] || cups.find((c) => c.live);
        if (!cup || flight || done) return false;
        aim = pongAimFor(cup); charge = (power ?? pongIdealPower(cup)) * 1.2 / PONG.chargeRate;
        throwBall(); return true;
      }
    },
    detail: () => `Muggar ${sunk}/6 · Boll ${Math.min(used + (flight || done ? 0 : 1), PONG.balls)}/${PONG.balls}`,
    instruction: () => '← / → sikta · håll och släpp när ringen ligger över en mugg',
    press() {
      if (flight || done || time < readyAt) return false;
      holding = true; charge = 0;
      return true;
    },
    release() {
      if (!holding) return;
      holding = false;
      throwBall();
    },
    cancel() { holding = false; charge = 0; },
    update(dt, t, direction) {
      time += dt; throwT += dt;
      if (!flight && !done) aim = clamp(aim + direction * dt * 2.4, -4.4, 4.4);
      if (holding) charge += dt;
      const power = holding ? pongPower(charge) : 0;
      const target = nearestTo(aim * PONG.aimScale);
      const ideal = target ? pongIdealPower(target) : 0.5;
      ui.marker.style.left = `${ideal * 100}%`;
      ui.fill.style.width = `${power * 100}%`;
      const ready = !flight && !done && time >= readyAt;
      // The thrower and the ball in hand.
      const pose = POSES.idle(t);
      pose.spine[0] += 0.08; pose.gripR = 0.55;
      athlete.setPose(pose);
      handTarget(power);
      athlete.ikArm('R', hand);
      if (target) athlete.lookAt(look.set(target.x, PONG.rimHeight, target.z), 0.85);
      if (!flight) pongBall.position.set(hand.x - 0.01, hand.y + 0.035, hand.z - 0.075);
      pongBall.visible = !done || !!flight;
      // Aim preview: the ring where the ball comes down at this power.
      const preview = pongLanding(aim, holding ? power : ideal);
      ring.position.set(preview.x, PONG.rimHeight + 0.004, preview.z);
      ring.visible = dots.visible = ready;
      if (ready) {
        for (let i = 0; i < 12; i++) {
          const k = 0.3 + i / 11 * 0.7;
          dot.position.set(lerp(pongBall.position.x, preview.x, k), lerp(pongBall.position.y, PONG.rimHeight, k) + Math.sin(k * Math.PI) * ARC, lerp(pongBall.position.z, preview.z, k));
          dot.updateMatrix(); dots.setMatrixAt(i, dot.matrix);
        }
        dots.instanceMatrix.needsUpdate = true;
      }
      const left = `${6 - sunk} ${6 - sunk === 1 ? 'mugg' : 'muggar'} kvar · ${PONG.balls - used} ${PONG.balls - used === 1 ? 'boll' : 'bollar'}`;
      ui.hint.textContent = ready && holding ? `${Math.round(power * 100)} % kraft · släpp när ringen ligger över en mugg` : ready ? `Sikta ← → · ${left}` : left;
      if (flight) {
        flight.t += dt;
        if (flight.phase === 'arc') {
          const k = clamp(flight.t / flight.duration, 0, 1);
          pongBall.position.lerpVectors(flight.from, flight.to, k);
          pongBall.position.y += Math.sin(k * Math.PI) * ARC;
          if (k >= 1) land();
        } else if (flight.phase === 'drop') {
          const c = flight.cup, k = clamp(flight.t / 0.14, 0, 1);
          const surface = TOP + CUP_H * (0.03 + 0.97 * c.cup.fill) + PONG.ball * 0.6;
          pongBall.position.set(lerp(flight.to.x, c.x, k), lerp(PONG.rimHeight, surface, k), lerp(flight.to.z, c.z, k));
          if (k >= 1 && !flight.splashed) { flight.splashed = true; splash(kit, world, drops, tmp.set(c.x, surface, c.z)); }
          if (flight.t > 0.42) { pongBall.visible = false; nextBall(); }
        } else {
          // Loose ball: gravity, a bounce on the board, then the grass.
          const { v } = flight, p = pongBall.position;
          v.y -= 9.8 * dt; p.addScaledVector(v, dt);
          const overTable = Math.abs(p.x) <= PONG.tableHalfWidth && p.z >= PONG.tableFar && p.z <= PONG.tableNear;
          if (overTable && p.y < TOP + PONG.ball && v.y < 0 && p.y > TOP - 0.05) { p.y = TOP + PONG.ball; v.y *= -0.55; v.x *= 0.85; v.z *= 0.85; a.tone(900, 0.02, 'triangle'); }
          if (p.y < PONG.ball && v.y < 0) { p.y = PONG.ball; v.y *= -0.35; v.x *= 0.7; v.z *= 0.7; }
          if (flight.t > 1.05) nextBall();
        }
      }
      // Sunk cups go to Erik.
      for (const c of cups) {
        if (c.gone < 0 || c.gone > 1) continue;
        c.gone += dt / 0.9;
        const k = ease(clamp((c.gone - 0.35) / 0.65, 0, 1));
        c.cup.group.position.set(lerp(c.x, 0.12, k), lerp(TOP, 1.05, k), lerp(c.z, 3.72, k));
        c.cup.group.scale.setScalar(Math.max(0.001, 1 - k * k));
        c.cup.group.visible = c.gone < 1;
      }
      stepDrops(world, drops, dt);
      if (finishAt > 0 && time >= finishAt) { finishAt = -1; ctx.finish(pongScore(sunk, used)); }
    },
    animate(dt, t, state) {
      if (state !== 'play') athlete.setPose(state === 'result' ? POSES.cheer(t) : POSES.idle(t));
      athlete.update(dt, t);
      const cheering = state === 'play' && time < cheerUntil;
      const ballAt = pongBall.visible ? pongBall.position : null;
      if (host) {
        host.setPose(POSES.idle(t, undefined, 3));
        const taking = cups.find((c) => c.gone > 0.3 && c.gone < 1);
        if (taking) host.ikArm('R', tmp.copy(taking.cup.group.position).add(look.set(0, 0.05, 0.08)));
        host.setExpression(hostMood < 0 ? 'frown' : hostMood > 0 ? 'grin' : 'neutral', 0.7);
        host.lookAt(ballAt, 0.7);
        host.update(dt, t);
      }
      fans.forEach((p, i) => {
        p.setPose(state === 'result' || state === 'final' ? POSES.clap(t + i) : cheering ? POSES.cheer(t + i * 0.3) : POSES.idle(t, undefined, i + 4));
        p.lookAt(ballAt, 0.5);
        p.update(dt, t);
      });
    },
    camera(goal, lookAt, { portrait, short }) {
      if (portrait) { goal.set(0.2, 3.0, 8.3); lookAt.set(0, 0.78, 4.6); } else { goal.set(0.4, 2.85, 7.6); lookAt.set(short ? 0.6 : 0, 0.78, 4.55); }
    },
    summary: () => `${sunk} av 6 muggar på ${used} ${used === 1 ? 'boll' : 'bollar'}.${sunk === 6 && used < PONG.balls ? ` ${PONG.balls - used} ${PONG.balls - used === 1 ? 'boll' : 'bollar'} kvar gav bonus.` : ' Hela bordet ger 85 poäng, och varje boll som blir över ger fem till.'}`,
    dispose() { clearDrops(world, drops); }
  };
}

/* --------------------------------------------------------------- flip cup */

function flipTable({ box, pole, world }) {
  box(4.0, 0.04, 0.8, '#e8e2d3', 0, TOP - 0.02, 5.5, world);
  box(4.0, 0.012, 0.03, '#cdc5b2', 0, TOP - 0.046, 5.11, world);
  box(4.0, 0.012, 0.03, '#cdc5b2', 0, TOP - 0.046, 5.89, world);
  for (const x of [-1.8, 1.8]) {
    for (const z of [5.22, 5.78]) pole(0.018, TOP - 0.04, '#5b605c', x, (TOP - 0.04) / 2, z, world);
    box(0.03, 0.03, 0.56, '#5b605c', x, 0.22, 5.5, world);
  }
}

function createFlipCup(ctx) {
  const { THREE, world, athlete, crew, ui, a } = ctx;
  const kit = cupKit(ctx);
  flipTable(ctx);
  cooler(ctx, 2.55, 6.3, -0.4);
  const XS = [-1.5, -0.5, 0.5, 1.5];
  const ours = [athlete, crew.get('Per Vikman'), crew.get('Viktor Jones'), crew.get('Olov Melander')];
  const theirs = [crew.get('Erik Vallgren'), crew.get('Henrik Lundqvist'), crew.get('Rickard Nilsson'), crew.get('Tobias Lundqvist')];
  const makeLane = (person, x, side, i) => {
    const cup = makeCup(kit, world, 0.45);
    const lane = {
      person, x, side, i, cup, phase: 'wait', k: 0, drink: 0, lift: 0, charge: 0, cheer: 0,
      sweet: FLIP.sweet[i], home: 5.5 + side * 0.22, edge: 5.5 + side * 0.35, landing: 5.5 + side * 0.18,
      stand: new THREE.Vector3(x - side * 0.27, 0.02, 5.5 + side * 1.22)
    };
    if (person) { person.root.position.copy(lane.stand); person.root.rotation.set(0, side > 0 ? Math.PI : 0, 0); }
    cup.group.position.set(x, TOP, lane.home);
    return lane;
  };
  const mine = ours.map((p, i) => makeLane(p, XS[i], 1, i));
  const rivals = theirs.map((p, i) => makeLane(p, XS[i], -1, i));
  const lanes = [...mine, ...rivals];
  // Anyone not in a team watches from the end of the table.
  const watchers = [...crew.values()].filter((p) => !ours.includes(p) && !theirs.includes(p));
  watchers.forEach((p, i) => { p.root.position.set(2.6 + i * 0.6, 0.02, 4.9 + i * 0.5); p.root.rotation.set(0, -Math.PI / 2, 0); });

  const plan = rivalFlipPlan(Math.random);
  let race = 'countdown', clock = 0, raceTime = 0, leg = 0, drinking = false, charging = false, charge = 0, misses = 0;
  let playerTime = null, rivalTime = null, won = false, finishAt = -1, camX = XS[0];
  let rivalLeg = 0, queue = null, step = 0, stepT = 0, countdownStep = -1, lastMode = '';
  const drops = [];
  const mouth = new THREE.Vector3(), grip = new THREE.Vector3(), axis = new THREE.Vector3(), look = new THREE.Vector3();

  function queueFor(plan) {
    const q = [{ phase: 'drink', dur: plan.drink }, { phase: 'place', dur: FLIP_TIMING.place }, { phase: 'ready', dur: plan.react }];
    for (const outcome of plan.attempts) {
      q.push({ phase: 'ready', dur: FLIP_TIMING.charge, charging: true });
      q.push({ phase: outcome, dur: FLIP_TIMING[outcome] });
      if (outcome === 'over') q.push({ phase: 'reset', dur: FLIP_TIMING.reset });
    }
    return q;
  }
  function stepRivals(dt) {
    if (rivalLeg >= FLIP.legs) return;
    const lane = rivals[rivalLeg];
    if (!queue) { queue = queueFor(plan.legs[rivalLeg]); step = 0; stepT = 0; }
    stepT += dt;
    while (queue[step] && stepT >= queue[step].dur) { stepT -= queue[step].dur; step++; }
    const s = queue[step];
    if (!s) {
      lane.phase = 'done'; lane.k = 0; lane.cheer = 1.2; rivalLeg++; queue = null;
      if (rivalLeg >= FLIP.legs) {
        rivalTime = raceTime;
        if (playerTime === null) { a.toast('Vallgrens lag är klart!'); a.tone(260, 0.2, 'triangle'); }
      }
      return;
    }
    lane.phase = s.phase; lane.k = clamp(stepT / s.dur, 0, 1);
    if (s.phase === 'drink') { lane.drink = lane.k; lane.lift = Math.min(1, lane.k * 5); setFill(lane.cup, 0.45 * (1 - lane.k)); }
    lane.charge = s.charging ? lane.k * lane.sweet : 0;
  }

  function finishLeg(lane) {
    lane.phase = 'done'; lane.k = 0; lane.cheer = 1.2;
    mine.forEach((m) => { if (m !== lane && m.phase === 'wait') m.cheer = 0.8; });
    leg++;
    a.tone(700 + leg * 60, 0.1, 'sine');
    if (leg < FLIP.legs) { mine[leg].phase = 'drink'; return; }
    playerTime = raceTime;
    won = playerTime < (rivalTime ?? plan.total);
    a.toast(won ? 'Ni vann heatet!' : 'Vallgrens lag var snabbare.');
    finishAt = clock + 1.6;
  }

  /** Where the cup is and how it is turned, from the lane's phase. */
  function placeCup(lane) {
    const { cup, side, k } = lane, g = cup.group;
    let { x } = lane, y = TOP, z = lane.home, theta = 0, tilt = 0;
    const drinkPose = () => {
      const p = lane.person;
      if (p?.sockets?.face) p.sockets.face.getWorldPosition(mouth); else mouth.set(lane.stand.x, 1.55, lane.stand.z - side * 0.15);
      tilt = 0.5 + 1.5 * lane.drink;
      // The rim at the lips, the cup tipped towards the face.
      return {
        x: mouth.x, y: mouth.y - 0.07 - CUP_H * Math.cos(tilt),
        z: mouth.z - side * 0.04 - side * CUP_H * Math.sin(tilt)
      };
    };
    switch (lane.phase) {
      case 'drink': {
        const u = ease(lane.lift), m = drinkPose();
        x = lerp(lane.x, m.x, u); y = lerp(TOP, m.y, u); z = lerp(lane.home, m.z, u); tilt *= u;
        break;
      }
      case 'place': {
        const u = ease(k), m = drinkPose();
        x = lerp(m.x, lane.x, u); y = lerp(m.y, TOP, u); z = lerp(m.z, lane.edge, u); tilt *= 1 - u;
        break;
      }
      case 'ready': z = lane.edge; break;
      case 'flip': {
        theta = Math.PI * ease(k);
        y = TOP + CUP_H * (1 - Math.cos(theta)) / 2 + Math.sin(k * Math.PI) * 0.2;
        z = lerp(lane.edge, lane.landing, k);
        break;
      }
      case 'short': {
        theta = 1.2 * Math.sin(k * Math.PI);
        y = TOP + CUP_H * (1 - Math.cos(theta)) / 2 * 0.6 + Math.sin(k * Math.PI) * 0.06;
        z = lane.edge - side * 0.03 * Math.sin(k * Math.PI);
        break;
      }
      case 'over': {
        theta = 1.5 * Math.PI * ease(k);
        y = TOP + CUP_H * (1 - Math.cos(theta)) / 2 + Math.sin(k * Math.PI) * 0.32;
        z = lerp(lane.edge, lane.edge - side * 0.32, k);
        break;
      }
      case 'reset': {
        const u = ease(k);
        theta = 1.5 * Math.PI * (1 - u);
        y = TOP + CUP_H * (1 - Math.cos(theta)) / 2;
        z = lerp(lane.edge - side * 0.32, lane.edge, u);
        break;
      }
      case 'done': theta = Math.PI; y = TOP + CUP_H; z = lane.landing; break;
      default: break;
    }
    g.position.set(x, y, z);
    // A flip turns the top away from the player; drinking tips it towards the face.
    g.rotation.set(-side * theta + side * tilt, 0, 0);
  }

  function poseLane(lane, dt, t, state) {
    const p = lane.person;
    if (!p) return;
    const active = !['wait', 'done'].includes(lane.phase);
    const standZ = lane.stand.z - lane.side * (active ? 0.45 : 0);
    p.root.position.x = lane.stand.x;
    p.root.position.z += (standZ - p.root.position.z) * (1 - Math.exp(-dt * 7));
    lane.cheer = Math.max(0, lane.cheer - dt);
    let pose;
    const finished = playerTime !== null && (state === 'result' || state === 'final' || finishAt > 0);
    const ourTeam = lane.side > 0;
    if (finished && ourTeam === won) pose = POSES.cheer(t + lane.i * 0.4);
    else if (state === 'result' || state === 'final') pose = POSES.clap(t + lane.i);
    else if (lane.cheer > 0) pose = POSES.cheer(t + lane.i * 0.3);
    else pose = POSES.idle(t, undefined, lane.i + (ourTeam ? 0 : 5));
    if (active) {
      pose.spine[0] += 0.24; pose.chest[0] += 0.08; pose.gripR = 0.7;
      if (lane.phase === 'drink' || lane.phase === 'place') {
        const u = lane.phase === 'drink' ? lane.lift : 1 - lane.k;
        pose.head[0] -= 0.4 * u * lane.drink; pose.neck[0] -= 0.15 * u * lane.drink;
      }
    }
    p.setPose(pose);
    const g = lane.cup.group;
    if (active) {
      if (lane.phase === 'drink' || lane.phase === 'place') {
        // The hand round the cup's middle, on the drinker's side.
        axis.set(0, 1, 0).applyQuaternion(g.quaternion);
        grip.copy(g.position).addScaledVector(axis, CUP_H * 0.5);
        grip.z += lane.side * 0.1; grip.y -= 0.02;
      } else {
        // The fingers under the lip that hangs over the edge, then the flick.
        const flick = lane.phase === 'flip' ? Math.sin(Math.min(1, lane.k / 0.35) * Math.PI) : 0;
        const crouch = lane.phase === 'ready' ? lane.charge * 0.05 : 0;
        grip.set(lane.x + 0.02, TOP + CUP_H - 0.01 - crouch + flick * 0.2, lane.edge + lane.side * 0.12);
      }
      p.ikArm('R', grip);
      p.setExpression('focus', 0.6);
      p.lookAt(look.set(lane.x, TOP + 0.1, lane.edge), 0.8);
    } else {
      p.setExpression(finished && ourTeam === won ? 'grin' : finished ? 'frown' : 'smile', finished ? 0.8 : 0.3);
      const watch = (ourTeam ? mine[Math.min(leg, 3)] : rivals[Math.min(rivalLeg, 3)]);
      p.lookAt(look.set(watch.x, TOP + 0.2, watch.edge), 0.6);
    }
    p.update(dt, t);
  }

  function releaseFlip() {
    if (drinking) { drinking = false; return; }
    if (!charging) return;
    charging = false;
    const lane = mine[leg];
    const outcome = flipOutcome(chargePower(charge), lane.sweet);
    lane.phase = outcome; lane.k = 0; lane.charge = 0;
    if (outcome === 'flip') { a.tone(620, 0.07, 'sine'); return; }
    misses++;
    a.tone(170, 0.12, 'triangle');
    a.toast(outcome === 'short' ? 'För löst – släpp lite senare.' : 'För hårt – släpp lite tidigare.');
  }

  function setMode(mode) {
    if (mode === lastMode) return;
    lastMode = mode;
    ui.meter.classList.toggle('zone', mode === 'flip');
    ui.meter.classList.toggle('plain', mode === 'drink');
    ui.action.textContent = mode === 'drink' ? 'HÅLL · DRICK' : 'HÅLL & SLÄPP · FLIPPA';
  }

  return {
    aim: false,
    probe: {
      state: () => ({ race, leg, phase: mine[leg]?.phase, rivalLeg, raceTime, playerTime, misses, won }),
      drink() { const lane = mine[leg]; if (lane?.phase === 'drink') { lane.drink = 1; lane.lift = 1; } },
      flip(power) {
        const lane = mine[leg];
        if (lane?.phase !== 'ready') return false;
        charging = true; charge = (power ?? lane.sweet) * 1.2;
        releaseFlip(); return true;
      }
    },
    detail: () => `Ni ${leg}/${FLIP.legs} · Vallgren ${rivalLeg}/${FLIP.legs} · ${decimal(raceTime)} s`,
    instruction: () => 'Håll knappen för att dricka, håll och släpp sedan för att flippa',
    press() {
      if (race !== 'race' || playerTime !== null) return false;
      const lane = mine[leg];
      if (lane.phase === 'drink') { drinking = true; return true; }
      if (lane.phase === 'ready') { charging = true; charge = 0; return true; }
      return false;
    },
    release: releaseFlip,
    cancel() { drinking = false; charging = false; charge = 0; },
    update(dt) {
      clock += dt;
      if (race === 'countdown') {
        const n = Math.floor(clock / 0.5);
        if (n !== countdownStep && n < 3) { countdownStep = n; a.tone(n === 2 ? 880 : 440, n === 2 ? 0.22 : 0.1, 'sine'); }
        ui.hint.textContent = ['Klara…', 'Färdiga…', 'GÅ!'][Math.min(2, n)];
        setMode('drink');
        if (clock >= 1.0) { race = 'race'; mine[0].phase = 'drink'; }
        return;
      }
      if (playerTime === null || rivalTime === null) raceTime += dt;
      stepRivals(dt);
      const lane = playerTime === null ? mine[leg] : null;
      if (lane) {
        switch (lane.phase) {
          case 'drink':
            lane.lift = clamp(lane.lift + (drinking ? dt * 5 : -dt * 3), 0, 1);
            if (drinking && lane.lift > 0.6) { lane.drink = Math.min(1, lane.drink + dt / FLIP.drink); setFill(lane.cup, 0.45 * (1 - lane.drink)); }
            if (lane.drink >= 1) { lane.phase = 'place'; lane.k = 0; drinking = false; setFill(lane.cup, 0); }
            break;
          case 'place': lane.k += dt / FLIP_TIMING.place; if (lane.k >= 1) { lane.phase = 'ready'; lane.k = 0; } break;
          case 'ready': if (charging) { charge += dt; lane.charge = chargePower(charge); } break;
          case 'flip': lane.k += dt / FLIP_TIMING.flip; if (lane.k >= 1) finishLeg(lane); break;
          case 'short': lane.k += dt / FLIP_TIMING.short; if (lane.k >= 1) { lane.phase = 'ready'; lane.k = 0; } break;
          case 'over': lane.k += dt / FLIP_TIMING.over; if (lane.k >= 1) { lane.phase = 'reset'; lane.k = 0; } break;
          case 'reset': lane.k += dt / FLIP_TIMING.reset; if (lane.k >= 1) { lane.phase = 'ready'; lane.k = 0; } break;
          default: break;
        }
      }
      // Meter and prompts.
      const now = playerTime === null ? mine[leg] : null;
      if (now?.phase === 'drink' || now?.phase === 'place') {
        setMode('drink');
        ui.fill.style.width = `${now.drink * 100}%`;
        ui.hint.textContent = now.phase === 'place' ? 'Muggen på kanten…' : drinking ? 'Drick ur! Håll kvar…' : 'Håll knappen för att dricka ur muggen';
      } else if (now) {
        setMode('flip');
        ui.marker.style.left = `${now.sweet * 100}%`;
        ui.marker.style.width = `${FLIP.tolerance * 200}%`;
        ui.fill.style.width = `${(charging ? chargePower(charge) : 0) * 100}%`;
        ui.hint.textContent = now.phase !== 'ready' ? 'Ställ upp muggen igen…' : charging ? `${Math.round(chargePower(charge) * 100)} % · släpp i det gröna fältet` : 'Håll och släpp i det gröna fältet för att flippa';
      } else {
        ui.fill.style.width = '0%';
        ui.hint.textContent = won ? 'Ni vann heatet!' : 'Vallgrens lag var snabbare.';
      }
      stepDrops(world, drops, dt);
      if (finishAt > 0 && clock >= finishAt) { finishAt = -1; ctx.finish(flipCupScore(playerTime, won)); }
    },
    animate(dt, t, state) {
      lanes.forEach((lane) => { placeCup(lane); poseLane(lane, dt, t, state); });
      watchers.forEach((p, i) => { p.setPose(state === 'result' ? POSES.clap(t + i) : POSES.idle(t, undefined, i + 9)); p.update(dt, t); });
      const target = playerTime === null && race === 'race' ? mine[leg].x : 0;
      camX += (target - camX) * (1 - Math.exp(-dt * 3));
    },
    camera(goal, lookAt, { portrait, short }) {
      // High enough to look down past the heads of the teammates waiting their turn.
      if (portrait) { goal.set(camX + 0.2, 4.0, 7.9); lookAt.set(camX, 0.72, 5.45); } else { goal.set(camX * 0.6 + 0.3, 4.2, 8.0); lookAt.set(camX * 0.6 + (short ? 0.9 : 0), 0.7, 5.4); }
    },
    summary: () => `Fyra flippar på ${decimal(playerTime ?? raceTime)} s${misses ? ` med ${misses} ${misses === 1 ? 'miss' : 'missar'}` : ' utan en enda miss'}. ${won ? 'Ni slog' : 'Ni förlorade mot'} Vallgrens lag (${decimal(rivalTime ?? plan.total)} s). Tiden ger upp till 90 poäng och vinsten tio till.`,
    dispose() { clearDrops(world, drops); }
  };
}

export const PARTY_EVENTS = {
  beerpong: {
    title: 'Beerpong', verb: 'HÅLL & SLÄPP',
    rule: 'Sex muggar i triangel och tio bollar. Sikta med pilarna, håll för kraft och släpp när den ljusa ringen ligger över en mugg. Studs på kanten räknas inte. Hela bordet ger 85 poäng, och rensar du det tidigt ger varje boll som blir över fem poäng till. Beerpong spelades i Uppsala 2014.',
    create: createBeerPong
  },
  flipcup: {
    title: 'Flipcup', verb: 'HÅLL · DRICK',
    rule: 'Stafett mot Vallgrens lag, och du spelar hela ditt lag. Håll knappen för att dricka ur muggen. Håll sedan och släpp när kraften är i det gröna fältet, så flippar muggen upp och ner. För löst och den faller tillbaka, för hårt och den rullar iväg. Fyra flippar; tiden ger poäng och vinsten tio till. Flipcup spelades i Uppsala 2014.',
    create: createFlipCup
  }
};
