/**
 * Pekkas Fiske — the angler in the eka.
 *
 * Erik Vallgren, who won the real Fisketävling at Själevad in 2024, sits
 * on the forward thwart in a red cap, a fishing jacket and rubber boots —
 * a people.js character, the same Erik as in every other game.
 *
 * He is driven by the rod, not by canned arm poses. Each action (rest,
 * reel, heave, wind-up, throw, cheer …) is a target for the rod — where
 * the right fist is, which way the rod points — and every channel eases
 * there on a spring, so a throw overshoots and settles, and a strike snaps
 * the rod up with real follow-through. Both arms are then solved with
 * two-bone IK: the right fist holds the reel seat, the left hand finds the
 * fore grip, the butt, or the crank knob as it turns. The rod bends in its
 * vertex shader with the load and whips with its own angular speed, and
 * the line leaves the bent tip.
 */

import * as THREE from 'three';
import { createPerson, appearanceFor, POSES, SEAT_BACK } from '../shared/people.js';
import { buildRod, FLOOR_Y, SEAT_X } from './boat.js';

const DEG = Math.PI / 180;

/** A damped spring toward a moving target, sub-stepped so a long frame can't blow it up. */
class Spring {
  constructor(x = 0) {
    this.x = x;
    this.v = 0;
  }

  step(target, dt, w, z) {
    const n = Math.max(1, Math.ceil(dt / 0.012));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (w * w * (target - this.x) - 2 * z * w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

/**
 * Rod targets in the angler's own frame (X his left, Y up, Z forward;
 * metres from the floor under the seat). grip: the right fist. pitch/yaw:
 * the rod's elevation and swing to his right (degrees). hint: which way
 * the right forearm runs from the fist (it sets the wrist). pole: where the
 * right elbow goes, from the shoulder. left: what the left hand holds.
 * w/z: the spring that carries him there.
 */
const ACT = {
  rest: { grip: [0.0, 0.69, 0.32], pitch: 32, yaw: 9, lean: 0.03, hint: [-0.66, 0.64, -0.4], pole: [-0.5, -0.6, -0.9], left: 'fore', w: 6, z: 0.9 },
  drop: { grip: [0.0, 0.7, 0.35], pitch: 18, yaw: 8, lean: 0.12, hint: [-0.66, 0.64, -0.4], pole: [-0.5, -0.6, -0.9], left: 'fore', w: 7, z: 0.9 },
  reel: { grip: [-0.06, 0.74, 0.34], pitch: 24, yaw: 10, lean: 0.1, hint: [-0.66, 0.64, -0.4], pole: [-0.5, -0.6, -0.9], left: 'crank', w: 8, z: 0.85 },
  heave: { grip: [-0.1, 1.0, 0.26], pitch: 74, yaw: 8, lean: -0.22, hint: [-0.75, 0.1, -0.65], pole: [-0.6, -0.5, -0.6], left: 'butt', w: 16, z: 0.55 },
  watch: { grip: [-0.08, 0.86, 0.3], pitch: 50, yaw: 12, lean: -0.08, hint: [-0.72, 0.4, -0.55], pole: [-0.55, -0.6, -0.7], left: 'butt', w: 7, z: 0.85 },
  windup: { grip: [-0.2, 1.2, 0.08], pitch: 120, yaw: 16, lean: -0.16, hint: [-0.45, -0.75, 0.45], pole: [-0.6, -0.4, 0.6], left: 'butt', w: 9, z: 0.8 },
  throw: { grip: [-0.08, 0.86, 0.54], pitch: 6, yaw: 10, lean: 0.24, hint: [-0.6, 0.55, -0.55], pole: [-0.5, -0.6, -0.6], left: 'butt', w: 24, z: 0.42 },
  cheer: { grip: [-0.26, 1.58, 0.2], pitch: 80, yaw: 18, lean: -0.1, hint: [-0.35, -0.9, -0.2], pole: [-0.9, -0.3, 0.1], left: 'fist', w: 10, z: 0.6 }
};
const LEFT_MODES = ['fore', 'butt', 'crank', 'fist'];

export function createAngler(boat) {
  const person = createPerson(appearanceFor('Erik Vallgren', {
    headwear: { style: 'cap', color: 0xb23a48 },
    outfit: { top: 'fishingJacket', topColor: 0xe0ab3a, bottom: 'trousers', bottomColor: 0x2c4a72, shoes: 'boots', shoeColor: 0x27342c }
  }));
  const s = person.scale;
  const K = s / 1.044; // the targets below were authored for Erik's 1.88 m
  const { root } = person;
  // Seated on the forward thwart, facing the bow (+X); the seat is SEAT_BACK behind the root
  root.position.set(SEAT_X + SEAT_BACK * s, FLOOR_Y, 0);
  root.rotation.y = Math.PI / 2;
  boat.add(root);

  const rod = buildRod();
  person.attach(rod.mesh, 'gripR');
  const sockR = person.sockets.gripR;
  const sockL = person.sockets.gripL;

  /* Springs for every channel, starting at rest */
  const sp = {};
  const start = ACT.rest;
  ['gx', 'gy', 'gz'].forEach((k, i) => { sp[k] = new Spring(start.grip[i]); });
  ['hx', 'hy', 'hz'].forEach((k, i) => { sp[k] = new Spring(start.hint[i]); });
  ['px', 'py', 'pz'].forEach((k, i) => { sp[k] = new Spring(start.pole[i]); });
  sp.pitch = new Spring(start.pitch * DEG);
  sp.yaw = new Spring(start.yaw * DEG);
  sp.lean = new Spring(0);
  sp.bend = new Spring(0);
  LEFT_MODES.forEach((m) => { sp[m] = new Spring(m === 'fore' ? 1 : 0); });

  /* Scratch */
  const base = POSES.sitRod(0);
  const v = new THREE.Vector3();
  const D = new THREE.Vector3();
  const Yh = new THREE.Vector3();
  const X = new THREE.Vector3();
  const up = new THREE.Vector3();
  const grip = new THREE.Vector3();
  const wrist = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const tgtL = new THREE.Vector3();
  const zL = new THREE.Vector3();
  const yL = new THREE.Vector3();
  const rx = new THREE.Vector3();
  const ry = new THREE.Vector3();
  const qR = new THREE.Quaternion();
  const qL = new THREE.Quaternion();
  const qTmp = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const lookV = new THREE.Vector3();

  /** A direction in the angler's frame → world (no translation). */
  const dirW = (x, y, z, out) => out.set(x, y, z).transformDirection(root.matrixWorld);
  /** Orthonormal hand basis: thumb side +Z along `zv`, forearm +Y toward `yv`. */
  function basisQ(zv, yv, out) {
    yv.addScaledVector(zv, -yv.dot(zv));
    if (yv.lengthSq() < 1e-6) yv.set(0, 1, 0).addScaledVector(zv, -zv.y);
    yv.normalize();
    X.crossVectors(yv, zv).normalize();
    m4.makeBasis(X, yv, zv);
    return out.setFromRotationMatrix(m4);
  }

  /* Idle life while he waits: a jig, a few turns of the crank, a glance */
  const idle = { t: 3 + Math.random() * 3, kind: null, left: 0 };
  /* One-shot reactions: an expression held for a while, maybe a rod kick */
  const react = { expr: null, amount: 1, left: 0 };
  let crankAngle = 0;
  let crankSpeed = 0;

  function trigger(kind) {
    switch (kind) {
      case 'strike': // the fish takes: set the hook with a snap of the rod
        sp.pitch.v += 3.2;
        sp.bend.v -= 1.2;
        Object.assign(react, { expr: 'surprised', amount: 1, left: 0.55 });
        break;
      case 'junk':
        Object.assign(react, { expr: 'frown', amount: 1, left: 1.6 });
        break;
      case 'big':
        Object.assign(react, { expr: 'grin', amount: 1, left: 2.4 });
        break;
      case 'perfect':
        Object.assign(react, { expr: { grin: 0.7, shout: 0.6 }, amount: 1, left: 2.2 });
        break;
      case 'miss':
        Object.assign(react, { expr: 'frown', amount: 0.8, left: 0.9 });
        break;
      case 'tunna':
        if (!react.left) Object.assign(react, { expr: 'smile', amount: 1, left: 0.7 });
        sp.lean.v -= 0.4;
        break;
      case 'erupt':
        Object.assign(react, { expr: 'surprised', amount: 0.9, left: 0.7 });
        break;
      default:
    }
  }

  /**
   * Once per frame, after the boat has moved. ctx:
   *   action  a key of ACT        crank  turns per second (0 = hands off)
   *   load    0…1, the bend       look   world point, or null
   *   expr    base expression     idle   true while waiting in the menu
   *   camera  world position (for a glance)
   */
  function update(dt, t, ctx) {
    const action = ACT[ctx.action] || ACT.rest;
    let crank = ctx.crank || 0;
    let look = ctx.look || null;
    let expr = ctx.expr || 'neutral';
    let jig = 0;

    // Waiting: now and then do something, so the menu has a living angler
    if (ctx.idle) {
      idle.t -= dt;
      if (idle.t <= 0 && !idle.kind) {
        const r = Math.random();
        idle.kind = r < 0.35 ? 'jig' : r < 0.7 ? 'crank' : 'glance';
        idle.left = idle.kind === 'jig' ? 1.1 : idle.kind === 'crank' ? 1.8 : 1.7;
      }
      if (idle.kind) {
        idle.left -= dt;
        if (idle.kind === 'jig') jig = Math.max(0, Math.sin((1.1 - idle.left) * 11)) * 0.2;
        else if (idle.kind === 'crank') crank = 1.1;
        else if (ctx.camera) {
          look = ctx.camera;
          expr = 'smile';
        }
        if (idle.left <= 0) {
          idle.kind = null;
          idle.t = 3.5 + Math.random() * 5;
        }
      }
    } else {
      idle.kind = null;
    }
    if (react.left > 0) {
      react.left -= dt;
      ({ expr } = react);
    }

    /* Ease every channel toward the action */
    const { w, z } = action;
    sp.gx.step(action.grip[0], dt, w, z);
    sp.gy.step(action.grip[1], dt, w, z);
    sp.gz.step(action.grip[2], dt, w, z);
    sp.hx.step(action.hint[0], dt, w * 0.8, 1);
    sp.hy.step(action.hint[1], dt, w * 0.8, 1);
    sp.hz.step(action.hint[2], dt, w * 0.8, 1);
    sp.px.step(action.pole[0], dt, w * 0.8, 1);
    sp.py.step(action.pole[1], dt, w * 0.8, 1);
    sp.pz.step(action.pole[2], dt, w * 0.8, 1);
    const pumping = ctx.action === 'cheer' ? Math.sin(t * 7.5) * 14 * DEG : 0;
    const pitch = sp.pitch.step(action.pitch * DEG + jig + pumping, dt, w, z);
    const yaw = sp.yaw.step(action.yaw * DEG, dt, w, z);
    const lean = sp.lean.step(action.lean + (crank ? Math.sin(crankAngle) * 0.025 : 0), dt, w * 0.7, 0.8);
    const leftMode = crank ? 'crank' : action.left;
    LEFT_MODES.forEach((m) => sp[m].step(m === leftMode ? 1 : 0, dt, 11, 1));
    // The tip lags the swing: pitching down fast flexes it up, and back
    const bend = sp.bend.step(-(ctx.load || 0) * 0.42 + sp.pitch.v * 0.05, dt, 15, 0.32);

    crankSpeed += (crank - crankSpeed) * Math.min(1, dt * 8);
    crankAngle = (crankAngle + crankSpeed * Math.PI * 2 * dt) % (Math.PI * 2);

    /* Body: the seated rod pose, leaning with the action */
    POSES.sitRod(t, base);
    base.spine[0] += lean * 0.55;
    base.chest[0] += lean * 0.45;
    if (ctx.action === 'cheer') base.hipsPos[1] += Math.abs(Math.sin(t * 7.5)) * 0.025;
    base.gripL = 0.9 - sp.crank.x * 0.25;
    person.setPose(base);
    root.updateWorldMatrix(true, false);

    /* Right arm: put the fist where the rod wants it */
    const cp = Math.cos(pitch);
    dirW(-Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp, D);
    grip.set(sp.gx.x * K, sp.gy.x * K, sp.gz.x * K);
    root.localToWorld(grip);
    dirW(sp.hx.x, sp.hy.x, sp.hz.x, Yh);
    basisQ(D, Yh, qR);
    wrist.copy(sockR.position).applyQuaternion(qR);
    wrist.subVectors(grip, wrist);
    person.bones.upperArmR.getWorldPosition(pole);
    pole.add(dirW(sp.px.x, sp.py.x, sp.pz.x, v).multiplyScalar(s));
    person.ikArm('R', wrist, pole, qR);

    /* The rod as it now sits: reel down, crank on his left */
    sockR.getWorldPosition(grip);
    up.set(0, 1, 0).addScaledVector(D, -D.y);
    if (up.lengthSq() < 1e-4) dirW(0, 0, -1, up);
    up.normalize();
    rx.crossVectors(up, D).normalize();

    /* Left hand: blend of fore grip, butt, crank knob and a fist in the air */
    const wf = sp.fore.x;
    const wb = sp.butt.x;
    const wc = sp.crank.x;
    const wfi = sp.fist.x;
    const wsum = Math.max(1e-3, wf + wb + wc + wfi);
    tgtL.set(0, 0, 0);
    zL.set(0, 0, 0);
    yL.set(0, 0, 0);
    if (wf > 1e-3) {
      tgtL.addScaledVector(v.copy(grip).addScaledVector(D, 0.2), wf);
      zL.addScaledVector(D, wf);
      yL.addScaledVector(dirW(0.6, 0.5, -0.62, v), wf);
    }
    if (wb > 1e-3) {
      tgtL.addScaledVector(v.copy(grip).addScaledVector(D, -0.19), wb);
      zL.addScaledVector(D, wb);
      yL.addScaledVector(dirW(0.55, -0.35, -0.75, v), wb);
    }
    if (wc > 1e-3) {
      // The knob, turning about the reel's side axle
      const kx = rod.knobLocal.x;
      const ky = rod.knobLocal.y + Math.sin(crankAngle) * rod.crankR;
      const kz = rod.knobLocal.z + Math.cos(crankAngle) * rod.crankR;
      v.copy(grip).addScaledVector(rx, kx + 0.02).addScaledVector(up, ky).addScaledVector(D, kz);
      tgtL.addScaledVector(v, wc);
      zL.addScaledVector(rx, wc);
      yL.addScaledVector(dirW(0.45, -0.3, -0.85, v), wc);
    }
    if (wfi > 1e-3) {
      v.set(0.26 * K, 1.52 * K, 0.36 * K);
      root.localToWorld(v);
      tgtL.addScaledVector(v, wfi);
      zL.addScaledVector(dirW(-1, 0, 0.25, v), wfi);
      yL.addScaledVector(dirW(0.15, -1, -0.1, v), wfi);
    }
    tgtL.multiplyScalar(1 / wsum);
    zL.normalize();
    basisQ(zL, yL, qL);
    wrist.copy(sockL.position).applyQuaternion(qL);
    wrist.subVectors(tgtL, wrist);
    person.bones.upperArmL.getWorldPosition(pole);
    pole.add(dirW(0.5 + wfi * 0.4, -0.6 + wfi * 0.4, -0.9 + wfi * 0.9, v).multiplyScalar(s));
    person.ikArm('L', wrist, pole, qL);

    /* Face and gaze */
    if (look) person.lookAt(lookV.copy(look), 0.9);
    else person.lookAt(null);
    person.setExpression(expr, react.left > 0 ? react.amount : 1);
    person.update(dt, t);

    /* Roll the rod about its own axis so the reel always hangs under it,
       bend it, and turn the crank */
    sockR.getWorldQuaternion(qTmp).invert();
    ry.set(0, -1, 0).addScaledVector(D, D.y).applyQuaternion(qTmp);
    rod.mesh.rotation.z = Math.atan2(ry.x, -ry.y);
    rod.bend.value.set(0, bend);
    rod.tip.position.set(0, bend, rod.length);
    rod.crank.rotation.x = -crankAngle;
  }

  return {
    person,
    rod,
    update,
    trigger,
    /** World position of the rod tip (where the line leaves). */
    tip(out) {
      rod.tip.updateWorldMatrix(true, false);
      return rod.tip.getWorldPosition(out);
    },
    dispose() {
      rod.mesh.geometry.dispose();
      rod.crank.geometry.dispose();
      rod.material.dispose();
      person.dispose();
    }
  };
}
