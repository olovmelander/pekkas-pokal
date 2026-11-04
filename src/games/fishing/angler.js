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
  rest: { grip: [0.0, 0.69, 0.32], pitch: 32, yaw: 9, lean: 0.03, twist: 0, hint: [-0.66, 0.64, -0.4], pole: [-0.5, -0.6, -0.9], left: 'fore', w: 6, z: 0.9 },
  drop: { grip: [0.0, 0.7, 0.35], pitch: 18, yaw: 8, lean: 0.12, twist: 0, hint: [-0.66, 0.64, -0.4], pole: [-0.5, -0.6, -0.9], left: 'fore', w: 7, z: 0.9 },
  reel: { grip: [-0.06, 0.74, 0.34], pitch: 24, yaw: 10, lean: 0.1, twist: 0.04, hint: [-0.66, 0.64, -0.4], pole: [-0.5, -0.6, -0.9], left: 'crank', w: 8, z: 0.85 },
  heave: { grip: [-0.1, 1.0, 0.26], pitch: 74, yaw: 8, lean: -0.22, twist: -0.06, hint: [-0.75, 0.1, -0.65], pole: [-0.6, -0.5, -0.6], left: 'butt', w: 16, z: 0.55 },
  watch: { grip: [-0.08, 0.86, 0.3], pitch: 50, yaw: 12, lean: -0.08, twist: 0, hint: [-0.72, 0.4, -0.55], pole: [-0.55, -0.6, -0.7], left: 'butt', w: 7, z: 0.85 },
  // The back cast: shoulders turn to his right, the rod goes back over
  // the right shoulder to one o'clock and the weight shifts back…
  windup: { grip: [-0.22, 1.2, 0.06], pitch: 118, yaw: 18, lean: -0.18, twist: -0.3, hint: [-0.45, -0.75, 0.45], pole: [-0.6, -0.4, 0.6], left: 'butt', w: 9, z: 0.8 },
  // …then the forward stroke: everything unwinds toward the bow, the rod
  // stops at ten o'clock and follows the lure down
  throw: { grip: [-0.06, 0.86, 0.56], pitch: 6, yaw: 8, lean: 0.26, twist: 0.12, hint: [-0.6, 0.55, -0.55], pole: [-0.5, -0.6, -0.6], left: 'butt', w: 24, z: 0.42 },
  cheer: { grip: [-0.26, 1.58, 0.2], pitch: 80, yaw: 18, lean: -0.1, twist: -0.05, hint: [-0.35, -0.9, -0.2], pole: [-0.9, -0.3, 0.1], left: 'fist', w: 10, z: 0.6 }
};
const LEFT_MODES = ['fore', 'butt', 'crank', 'fist', 'cap'];
/** Along the rod from the reel seat (rod-local z) — see buildRod: the grip
 *  centre sits on the reel foot, the fore cork above it, the butt cork below. */
const GRIP_Z = 0.065;
const FORE_Y = 0.25 - GRIP_Z;
const BUTT_Y = -0.15 - GRIP_Z;
/** Where a gull might be wheeling — somewhere to look while he waits. */
const SKY_POINT = new THREE.Vector3(30, 16, -60);

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

  /*
   * The rod in his right fist, through the shared grip API. The holder is
   * the grip's frame — origin in the middle of the fist, +Y up the rod to
   * the tip, +Z the way the palm faces — and the palm faces the reel: the
   * fist sits on top of the reel seat with the reel's stem between the
   * middle and ring fingers, the way a spinning rod is held. The left hand
   * cranks (a right-handed angler's spinning reel has its handle on the
   * left), or takes the fore grip, or the butt for a cast.
   */
  const rod = buildRod();
  const holder = new THREE.Group();
  holder.name = 'fiske-rod-grip';
  rod.mesh.rotation.x = -Math.PI / 2; // rod +Z (tip) → holder +Y, rod −Y (reel) → holder +Z
  rod.mesh.position.y = -GRIP_Z;      // the reel seat's middle is the grip centre
  holder.add(rod.mesh);
  person.hold(holder, 'R', 'power', { diameter: 0.034, blend: 0 });
  const anchorR = person.sockets.holdR;
  const sockL = person.sockets.gripL;
  // The crank knob as a frame of its own (it spins freely on its axle, so
  // the hand on it does not spin with the arm): +Y out along the axle,
  // +Z toward the rod tip — the hand comes to it from behind
  const knob = new THREE.Object3D();
  knob.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)
  ));
  rod.mesh.add(knob);
  let leftGrip = null;
  /** Shape the left hand for what it holds (only when that changes). */
  function shapeLeft(mode) {
    const want = mode === 'crank' ? 'knob' : mode === 'fist' ? 'fist' : mode === 'cap' ? 'relaxed' : 'rod';
    if (want === leftGrip) return;
    leftGrip = want;
    if (want === 'knob') person.setGrip('L', 'power', { diameter: 0.018, blend: 0.15 });
    else if (want === 'rod') person.setGrip('L', 'power', { diameter: 0.034, blend: 0.18 });
    else person.setGrip('L', want, { blend: 0.2 });
  }
  // Every grip the left hand will use is solved once now, behind the
  // loading card (each first solve costs a few ms, then it is cached)
  ['crank', 'fist', 'cap', 'fore'].forEach(shapeLeft);

  /* Springs for every channel, starting at rest */
  const sp = {};
  const start = ACT.rest;
  ['gx', 'gy', 'gz'].forEach((k, i) => { sp[k] = new Spring(start.grip[i]); });
  ['px', 'py', 'pz'].forEach((k, i) => { sp[k] = new Spring(start.pole[i]); });
  sp.pitch = new Spring(start.pitch * DEG);
  sp.yaw = new Spring(start.yaw * DEG);
  sp.lean = new Spring(0);
  sp.twist = new Spring(0);
  sp.bend = new Spring(0);
  LEFT_MODES.forEach((m) => { sp[m] = new Spring(m === 'fore' ? 1 : 0); });

  /* Scratch */
  const base = POSES.sitRod(0);
  const v = new THREE.Vector3();
  const D = new THREE.Vector3();
  const P = new THREE.Vector3();
  const X = new THREE.Vector3();
  const grip = new THREE.Vector3();
  const wrist = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const tgtL = new THREE.Vector3();
  const zL = new THREE.Vector3();
  const yL = new THREE.Vector3();
  const qR = new THREE.Quaternion();
  const qL = new THREE.Quaternion();
  const qM = new THREE.Quaternion();
  const qTmp = new THREE.Quaternion();
  const qRoll = new THREE.Quaternion();
  const qObj = new THREE.Quaternion();
  const Yaxis = new THREE.Vector3(0, 1, 0);
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
  /**
   * The hand frame that puts a grip's object frame at (point, quat): the
   * same sum the people API's holdWith does, kept here so several targets
   * can be blended before one IK solve.
   */
  function handFor(anchor, point, quat, outP, outQ) {
    outQ.copy(quat).multiply(qTmp.copy(anchor.quaternion).invert());
    outP.copy(anchor.position).applyQuaternion(outQ);
    outP.subVectors(point, outP);
  }
  /** Blend accumulator for the left hand. */
  const acc = { w: 0 };
  const hP = new THREE.Vector3();
  const hQ = new THREE.Quaternion();
  function addLeft(w, p, q) {
    if (w <= 1e-3) return;
    acc.w += w;
    tgtL.addScaledVector(p, w);
    if (acc.w === w) qL.copy(q);
    else qL.slerp(q, w / acc.w);
  }

  /* Idle life while he waits: a jig, a few turns of the crank, a glance */
  const idle = { t: 3 + Math.random() * 3, kind: null, left: 0 };
  /* One-shot reactions: an expression held for a while, maybe a rod kick */
  const react = { expr: null, amount: 1, left: 0, pump: 0 };
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
      case 'big': // a new species, a record, the Pekkagädda: a fist pump
        Object.assign(react, { expr: 'grin', amount: 1, left: 2.4, pump: 1.1 });
        break;
      case 'perfect':
        Object.assign(react, { expr: { grin: 0.7, shout: 0.6 }, amount: 1, left: 2.2, pump: 1.3 });
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
    let capOn = false;

    // Waiting: now and then do something, so the menu has a living angler
    if (ctx.idle) {
      idle.t -= dt;
      if (idle.t <= 0 && !idle.kind) {
        const r = Math.random();
        idle.kind = r < 0.26 ? 'jig' : r < 0.48 ? 'crank' : r < 0.66 ? 'glance' : r < 0.84 ? 'cap' : 'sky';
        idle.left = { jig: 1.1, crank: 1.8, glance: 1.7, cap: 1.5, sky: 2.4 }[idle.kind];
      }
      if (idle.kind) {
        idle.left -= dt;
        if (idle.kind === 'jig') jig = Math.max(0, Math.sin((1.1 - idle.left) * 11)) * 0.2;
        else if (idle.kind === 'crank') crank = 1.1;
        else if (idle.kind === 'cap') {
          // Left hand up to the brim: a nod to the camera
          capOn = idle.left > 0.35;
          if (ctx.camera) look = ctx.camera;
          expr = 'smile';
        } else if (idle.kind === 'sky') {
          look = SKY_POINT;
        } else if (ctx.camera) {
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
    if (react.pump > 0) react.pump -= dt;

    /* Ease every channel toward the action */
    const { w, z } = action;
    sp.gx.step(action.grip[0], dt, w, z);
    sp.gy.step(action.grip[1], dt, w, z);
    sp.gz.step(action.grip[2], dt, w, z);
    sp.px.step(action.pole[0], dt, w * 0.8, 1);
    sp.py.step(action.pole[1], dt, w * 0.8, 1);
    sp.pz.step(action.pole[2], dt, w * 0.8, 1);
    const pumping = ctx.action === 'cheer' ? Math.sin(t * 7.5) * 14 * DEG : 0;
    const pitch = sp.pitch.step(action.pitch * DEG + jig + pumping, dt, w, z);
    const yaw = sp.yaw.step(action.yaw * DEG, dt, w, z);
    const lean = sp.lean.step(action.lean + (crank ? Math.sin(crankAngle) * 0.025 : 0), dt, w * 0.7, 0.8);
    const twist = sp.twist.step(action.twist || 0, dt, w * 0.75, 0.75);
    const leftMode = react.pump > 0 ? 'fist' : crank ? 'crank' : capOn ? 'cap' : action.left;
    LEFT_MODES.forEach((m) => sp[m].step(m === leftMode ? 1 : 0, dt, 11, 1));
    // The tip lags the swing: a fast forward stroke (pitch falling) leaves
    // it trailing up and back, then it whips through when the rod stops
    const bend = sp.bend.step(-(ctx.load || 0) * 0.42 - sp.pitch.v * 0.05, dt, 15, 0.32);

    crankSpeed += (crank - crankSpeed) * Math.min(1, dt * 8);
    crankAngle = (crankAngle + crankSpeed * Math.PI * 2 * dt) % (Math.PI * 2);

    /* Body: the seated rod pose, leaning with the action */
    POSES.sitRod(t, base);
    base.spine[0] += lean * 0.55;
    base.chest[0] += lean * 0.45;
    base.spine[1] += twist * 0.4;
    base.chest[1] += twist * 0.6;
    base.head[1] -= twist * 0.5; // the eyes stay on the target
    if (ctx.action === 'cheer') base.hipsPos[1] += Math.abs(Math.sin(t * 7.5)) * 0.025;
    base.gripL = 0.9 - sp.crank.x * 0.25;
    person.setPose(base);
    root.updateWorldMatrix(true, false);

    /* Right arm: put the rod's grip where the action wants it. D runs up
       the rod; the palm faces P, straight down to the reel — the reel
       hangs under the rod in every pose, cocked back over his shoulder too */
    const cp = Math.cos(pitch);
    const spp = Math.sin(pitch);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    dirW(-sy * cp, spp, cy * cp, D);
    dirW(-sy * spp, -cp, cy * spp, P);
    X.crossVectors(D, P).normalize();
    m4.makeBasis(X, D, P);
    qM.setFromRotationMatrix(m4);
    grip.set(sp.gx.x * K, sp.gy.x * K, sp.gz.x * K);
    root.localToWorld(grip);
    handFor(anchorR, grip, qM, wrist, qR);
    person.bones.upperArmR.getWorldPosition(pole);
    pole.add(dirW(sp.px.x, sp.py.x, sp.pz.x, v).multiplyScalar(s));
    person.ikArm('R', wrist, pole, qR);

    /* The rod as it now sits, and the crank knob on it */
    rod.bend.value.set(0, bend);
    rod.tip.position.set(0, bend, rod.length);
    rod.crank.rotation.x = -crankAngle;
    knob.position.set(rod.knobLocal.x, rod.knobLocal.y + Math.sin(crankAngle) * rod.crankR, rod.knobLocal.z + Math.cos(crankAngle) * rod.crankR);
    holder.updateWorldMatrix(true, true);
    holder.getWorldQuaternion(qM);

    /* Left hand: a blend of the fore grip, the butt, the crank knob, a fist
       in the air and a touch to the cap. On the rod it closes round it with
       the grip API's own hand frame, so no finger floats off the cork. */
    const wf = sp.fore.x;
    const wb = sp.butt.x;
    const wc = sp.crank.x;
    const wfi = sp.fist.x;
    const wcap = sp.cap.x;
    let lead = 'fore';
    let best = wf;
    [['butt', wb], ['crank', wc], ['fist', wfi], ['cap', wcap]].forEach(([m, w]) => {
      if (w > best) {
        best = w;
        lead = m;
      }
    });
    shapeLeft(lead);
    const anchorL = person.sockets.holdL || sockL;
    acc.w = 0;
    tgtL.set(0, 0, 0);
    if (wf > 1e-3) {
      // Under the fore grip, palm up, carrying the rod
      holder.localToWorld(v.set(0, FORE_Y, 0));
      qObj.copy(qM).multiply(qRoll.setFromAxisAngle(Yaxis, Math.PI * 0.85));
      handFor(anchorL, v, qObj, hP, hQ);
      addLeft(wf, hP, hQ);
    }
    if (wb > 1e-3) {
      // Round the butt cork for the cast and the heave
      holder.localToWorld(v.set(0, BUTT_Y, 0));
      qObj.copy(qM).multiply(qRoll.setFromAxisAngle(Yaxis, 0.35));
      handFor(anchorL, v, qObj, hP, hQ);
      addLeft(wb, hP, hQ);
    }
    if (wc > 1e-3) {
      // On the knob, which turns about the reel's side axle
      knob.getWorldPosition(v);
      knob.getWorldQuaternion(qObj);
      handFor(anchorL, v, qObj, hP, hQ);
      addLeft(wc, hP, hQ);
    }
    if (wfi > 1e-3) {
      const pumpY = react.pump > 0 ? Math.abs(Math.sin(t * 9)) * 0.12 - 0.08 : 0;
      v.set(0.26 * K, (1.52 + pumpY) * K, 0.36 * K);
      root.localToWorld(v);
      dirW(-1, 0, 0.25, zL);
      dirW(0.15, -1, -0.1, yL);
      basisQ(zL.normalize(), yL, hQ);
      hP.copy(sockL.position).applyQuaternion(hQ);
      hP.subVectors(v, hP);
      addLeft(wfi, hP, hQ);
    }
    if (wcap > 1e-3) {
      // Fingers to the cap's brim, palm down
      person.bones.head.getWorldPosition(v);
      v.addScaledVector(dirW(0.02, 0.1, 0.16, lookV), s);
      dirW(-1, 0.1, 0.2, zL);
      dirW(0.35, -0.75, -0.3, yL);
      basisQ(zL.normalize(), yL, hQ);
      hP.copy(sockL.position).applyQuaternion(hQ);
      hP.subVectors(v, hP);
      addLeft(wcap, hP, hQ);
    }
    if (acc.w > 1e-3) {
      tgtL.multiplyScalar(1 / acc.w);
      person.bones.upperArmL.getWorldPosition(pole);
      pole.add(dirW(0.5 + wfi * 0.4 + wcap * 0.5, -0.6 + wfi * 0.4 + wcap * 0.1, -0.9 + wfi * 0.9 + wcap * 0.6, v).multiplyScalar(s));
      person.ikArm('L', tgtL, pole, qL);
    }

    /* Face and gaze */
    if (look) person.lookAt(lookV.copy(look), 0.9);
    else person.lookAt(null);
    person.setExpression(expr, react.left > 0 ? react.amount : 1);
    person.update(dt, t);

  }

  return {
    person,
    rod,
    knob,
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
