/**
 * Pekkas Pingis — the opponent across the table, as one of the friends.
 *
 * Henrik, Rickard and Viktor Jones are built with the shared people system
 * (appearanceFor), so each looks the same here as in every other game, and
 * all three wear Anundsjö IF's red — the club whose hall this is — with the
 * trim in the colour of their 2019 medal: bronze, silver, gold.
 *
 * The figure is animated from the same few numbers the old jointed figure
 * read (index.js owns those, and the bot's timing): where he stands, the
 * stroke phase 0 → 2 (0 ready, 0.7 backswing, 1 contact, 1.5 follow-
 * through, 2 ready again) and forehand or backhand. What is new is that
 * the BAT is the thing being animated: a path through the backswing, the
 * actual contact point and the follow-through, with the blade's face set
 * per key (red rubber to the net on the forehand, black on the backhand,
 * closed over for topspin), and the arm is solved to it with two-bone IK.
 * The trunk turns with the stroke, the feet are planted and step when he
 * moves (no ice-skating in the slow-motion replay), his eyes stay on the
 * ball, and his face reacts to the points.
 */

import * as THREE from 'three';
import { createPerson, appearanceFor, POSES, WALK_STRIDE } from '../shared/people.js';

/** Anundsjö IF red, and a trim per podium place. */
const CLUB_RED = 0xa8202c;
const TRIM = {
  'Henrik Lundqvist': 0xb88a5a, // brons
  'Rickard Nilsson': 0xd4d8de, // silver
  'Viktor Jones': 0xe8b84a // guld
};

/**
 * How each of them carries a point. Henrik is the steady one: a nod and a
 * low "kom igen" when he wins one, and he studies and wipes his rubber
 * when he loses one. Rickard plays on emotion: a double fist pump and a
 * shout, a slap on the thigh when it goes the other way. Viktor, the
 * champion, holds up one finger ("en till") and wipes his brow with his
 * wrist when you take one off him.
 */
const STYLE = {
  'Henrik Lundqvist': { point: 'nod', lost: 'wipe', won: 'modest', hype: 0.45 },
  'Rickard Nilsson': { point: 'pump', lost: 'slap', won: 'roar', hype: 1 },
  'Viktor Jones': { point: 'finger', lost: 'brow', won: 'arms', hype: 0.7 },
  default: { point: 'nod', lost: 'brow', won: 'arms', hype: 0.6 }
};

/** Where the bat stands relative to the body (index.js keeps him there). */
export const BAT_OFFSET = { fh: 0.342, bh: -0.114 };

/* Stroke keys. Blade centre in the figure's own frame (metres at 1.80 m,
   +X his left, +Z toward the net), then the blade direction and the
   hitting face's normal. The contact key comes from the ball. */
const KEYS = [0, 0.7, 1, 1.5, 2];
const READY_P = [-0.14, 1.08, 0.4];
// The forehand finishes up by the LEFT temple (a salute), not in front of
// the face — the old key hid his face behind the blade on every drive
const FH_P = [READY_P, [-0.58, 0.94, 0.0], null, [0.3, 1.5, 0.3], READY_P];
const BH_P = [READY_P, [0.12, 1.0, 0.22], null, [-0.42, 1.34, 0.54], READY_P];
const READY_O = [[-0.35, 0.8, 0.45], [0, 0.05, 1]];
const FH_O = [READY_O, [[-0.75, 0.5, -0.25], [0.2, -0.2, 1]], [[-0.8, 0.5, 0.2], [0.05, -0.32, 1]], [[0.25, 0.9, 0.25], [0.75, -0.2, 0.6]], READY_O];
const BH_O = [READY_O, [[0.85, 0.4, 0.2], [0.1, -0.1, 1]], [[0.6, 0.55, 0.45], [-0.1, -0.28, 1]], [[-0.25, 0.75, 0.6], [-0.4, -0.3, 1]], READY_O];
const DEFAULT_CONTACT = { fh: [-0.4, 1.22, 0.55], bh: [0.12, 1.18, 0.52] };

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** A blade orientation from its direction and the hitting face's normal. */
function bladeQuat([dir, face], backhand, out = new THREE.Quaternion()) {
  _y.fromArray(dir).normalize();
  _z.fromArray(face);
  _z.addScaledVector(_y, -_z.dot(_y)).normalize();
  // The forehand hits with the red rubber (the paddle's +z), the backhand
  // with the black one, so the paddle turns its back to the net
  if (backhand) _z.negate();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

const FH_Q = FH_O.map((o) => bladeQuat(o, false));
const BH_Q = BH_O.map((o, i) => bladeQuat(o, i > 0 && i < 4));
const READY_Q = bladeQuat(READY_O, false);
// Applauding: the bat up in front of the chest, its red face to his left hand
const PAT_O = [[0.15, 0.95, 0.2], [0.95, 0.0, 0.3]];

const ease = {
  // wind-up eases in and out; the swing accelerates INTO the ball and
  // decelerates after it — a stroke is fastest at contact, not between keys
  0: (k) => k * k * (3 - 2 * k),
  1: (k) => k ** 1.7,
  2: (k) => 1 - (1 - k) ** 2,
  3: (k) => k * k * (3 - 2 * k)
};

/* The shakehand grip. The handle runs DIAGONALLY across the palm — from
   the heel of the hand up to the root of the index finger — so the blade
   leaves the fist through the V between thumb and index, angled 30° from
   the thumb toward the fingers. The red (forehand) rubber faces the palm
   side (socket +X), as a forehand is a palm-forward stroke; the index
   finger lies straight along the black (backhand) rubber and the thumb
   rests on the red one by the shoulder of the blade. Columns are the
   paddle's axes in the socket's frame (socket: +Z out of the thumb side,
   +Y up the forearm, +X the palm). */
const GRIP_TILT = Math.PI / 6;
const PADDLE_IN_HAND = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, Math.cos(GRIP_TILT), Math.sin(GRIP_TILT)),
    new THREE.Vector3(0, -Math.sin(GRIP_TILT), Math.cos(GRIP_TILT)),
    new THREE.Vector3(1, 0, 0)
  )
);
/* A few millimetres toward the back of the hand, so the black rubber
   rests ON the extended index finger instead of floating beside it */
const PADDLE_IN_HAND_POS = new THREE.Vector3(-0.0015, 0.004, 0);
const BLADE_Y = 0.112; // blade centre above the grip (hall.js buildPaddle)
const BLADE_R = 0.098;
/* The shared hold('racket') grip (people.js); the frame above and the
   pose's grip/point fingers are the fallback without it */
const USE_SHARED_GRIP = true;

/* The open, flat palm the rules ask for: palm (hand −X) up, the fingers
   forward and a little in, the thumb out to the side */
const PALM_UP_L = (() => {
  const f = new THREE.Vector3(-0.25, 0.05, 1).normalize(); // fingers (hand −Y)
  const x = new THREE.Vector3(0, -1, 0); // hand +X: the back of the hand, down
  x.addScaledVector(f, -x.dot(f)).normalize();
  const y = f.clone().negate();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
})();

/* The walk-on at the intro card: in from his left, along the barrier, a
   turn to face you, then into his stance */
const WALK_IN = { dist: 1.7, dur: 1.45, turn: 0.35 };

const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export class Foe {
  /**
   * @param {object} opp  an entry of OPPONENTS (name)
   * @param {THREE.Group} paddle  the bat; reused between opponents
   */
  constructor(opp, paddle) {
    this.name = opp.name;
    const trim = TRIM[opp.name] ?? 0xf1efe8;
    this.person = createPerson(appearanceFor(opp.name, {
      // The club kit is a costume; the face, hair, beard and glasses are
      // theirs (appearanceFor), so no headband over the hair either — the
      // hair is half of how you know who is across the table
      outfit: { top: 'jersey', topColor: CLUB_RED, bottom: 'shorts', bottomColor: 0x1b1d24, accent: trim, shoes: 'sneakers', shoeColor: 0xe9e6de }
    }));
    const p = this.person;
    this.root = p.root;
    this.s = p.scale;
    this.paddle = paddle;
    if (USE_SHARED_GRIP && typeof p.hold === 'function') {
      // The shared shakehand grip: the fingers are solved closed around
      // THIS handle and the index laid along THIS blade's back. Our bat
      // follows its conventions (origin at the grip, +Y up the handle into
      // the blade, +Z the red rubber); it is nudged so the blade sits where
      // the grip expects a blade of this radius, and toward the palm by the
      // half of the blade's thickness the grip's thinner one lacks.
      p.hold(paddle, 'R', 'racket', {
        handle: [0.034, 0.0245], blade: BLADE_R, blend: 0,
        offset: { position: [0, 0.05 + BLADE_R * 0.92 - BLADE_Y, 0.0035] }
      });
      const anchor = p.sockets.holdR;
      this.paddleInHand = anchor.quaternion.clone().multiply(paddle.quaternion);
      this.bladeInHand = paddle.position.clone().applyQuaternion(anchor.quaternion).add(anchor.position);
      this.holder = anchor;
    } else {
      const gripPos = PADDLE_IN_HAND_POS.clone().multiplyScalar(this.s);
      p.attach(paddle, 'gripR', { quaternion: PADDLE_IN_HAND, position: gripPos });
      this.paddleInHand = PADDLE_IN_HAND.clone();
      this.bladeInHand = p.sockets.gripR.position.clone().add(gripPos);
      this.holder = p.sockets.gripR;
    }
    // Where the blade centre sits in the hand's frame
    this.bladeInHand.add(new THREE.Vector3(0, BLADE_Y, 0).applyQuaternion(this.paddleInHand));
    this.paddleInHandInv = this.paddleInHand.clone().invert();
    // Every free-hand shape he will use, solved once now (each first solve
    // costs a few ms and is cached), not mid-rally
    if (typeof p.setGrip === 'function') {
      for (const g of ['open', 'fist', 'point', 'relaxed']) p.setGrip('L', g, { blend: 0 });
      p.setGrip('L', null, { blend: 0 });
    }
    this.leftShape = undefined;
    this.style = STYLE[opp.name] ?? STYLE.default;

    this.pose = POSES.ready(0);
    this.pos = new THREE.Vector3();
    this.vx = 0;
    this.fhW = 1; // 1 forehand … 0 backhand, eased
    this.feet = ['L', 'R'].map((side) => ({
      side, plant: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, on: false
    }));
    this.planted = false;
    this.fresh = true;
    this.split = 0;
    this.wasReading = false;
    this.walkT = 99; // seconds into the walk-on (99: not walking)
    this.walkRate = 1;
    this.mode = '';
    this.react = { kind: '', t: 9, dur: 0, power: 0 };
    this.modeT = 0;
    this.expr = '';
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._hq = new THREE.Quaternion();
    this._pole = new THREE.Vector3();
    this._desired = [new THREE.Vector3(), new THREE.Vector3()];
    this._fist = new THREE.Vector3();
  }

  /**
   * A moment to react to: 'point' (his), 'lost', 'smash', 'matchWon',
   * 'matchLost'. `power` (0..1) is how much the point meant — a long rally
   * gets a grin, not a smile, and a bigger celebration.
   */
  cue(kind, power = 0.5) {
    const dur = { point: 1.5, lost: 1.5, smash: 0.7, matchWon: 3.2, matchLost: 3 }[kind] ?? 1;
    // A smash is a face, not a body reaction: never cut a celebration short for it
    if (kind === 'smash' && this.react.t < this.react.dur && this.react.kind !== 'smash') {
      this.react.shout = 0.7;
      return;
    }
    this.react = { kind, t: 0, dur, power, shout: 0 };
  }

  setExpr(name, amount = 1) {
    const key = `${name}:${amount}`;
    if (key === this.expr) return;
    this.expr = key;
    this.person.setExpression(name, amount);
  }

  /**
   * v: { x, z, stroke, fh, ball (Vector3|null), contact (Vector3|null),
   *      mode: 'play'|'intro'|'menu'|'clap', relax (between matches),
   *      look (Vector3|null), focus 0..1,
   *      toss: −1 or 0..1 (his serve toss), tossBall (Vector3, written back) }
   */
  update(dt, t, v) {
    const p = this.person;
    const { bones } = p;
    const r = this.react;
    const st = this.style;
    r.t += dt;
    if (r.shout) r.shout = Math.max(0, r.shout - dt);
    const reacting = r.t < r.dur ? r.kind : '';
    const env = reacting ? smoothstep(0, 0.12, r.t) * (1 - smoothstep(r.dur - 0.35, r.dur, r.t)) : 0;

    /* Where he stands; a sideways speed for the lean and the footwork */
    const jump = this.fresh || Math.abs(v.x - this.pos.x) > 0.8;
    const vx = jump ? 0 : (v.x - this.pos.x) / Math.max(1e-3, dt);
    this.vx += (vx - this.vx) * Math.min(1, dt * 10);
    this.pos.set(v.x, 0, v.z);
    this.root.position.copy(this.pos);
    // The walk-on, while the card comes up. Sent to the table before he has
    // arrived, he hurries the last steps (half a second) instead of
    // jumping onto his mark; leaving for the menu ends it outright.
    if (v.mode === 'intro' && this.mode !== 'intro') {
      this.walkT = 0;
      this.walkRate = 1;
    } else if (v.mode !== 'intro' && this.walkT < WALK_IN.dur) {
      if (v.mode === 'play') this.walkRate = Math.max(this.walkRate, (WALK_IN.dur - this.walkT) / 0.5);
      else this.walkT = 99;
    }
    const { walkT } = this;
    const walking = walkT < WALK_IN.dur;
    if (walking) {
      const k = walkT / WALK_IN.dur;
      const along = 1 - smoothstep(0, 1, k);
      this.root.position.x += along * WALK_IN.dist;
      // Facing the way he walks (world −x), turning to you at the end
      this.root.rotation.y = -Math.PI / 2 * (1 - smoothstep(1 - WALK_IN.turn / WALK_IN.dur, 1, k));
      const speed = (6 * k * (1 - k) * WALK_IN.dist / WALK_IN.dur) * this.walkRate;
      this.walkPhase = (this.walkPhase || 0) + ((dt * speed) / (WALK_STRIDE * this.s)) * Math.PI * 2;
      this.walkT += dt * this.walkRate;
    } else if (this.root.rotation.y !== 0) {
      this.root.rotation.y = 0;
      this.planted = false;
    }
    // A new stance (or a teleport) puts the feet down where the pose has them
    if (jump || this.mode !== v.mode) {
      this.planted = false;
      if (this.mode !== v.mode) this.modeT = 0;
    }
    this.modeT += dt;
    this.mode = v.mode;
    this.fresh = false;

    /* Trunk and legs from the pose library */
    const { pose } = this;
    const won = reacting === 'matchWon';
    const celebrate = v.mode === 'clap' || won;
    const patting = v.mode === 'clap' || reacting === 'matchLost';
    // Between matches (and in the menu) he stands at ease: the shared idle,
    // seeded per person so the three never sway in step
    const idle = v.mode === 'menu' || (v.relax && !reacting);
    if (walking) POSES.walk(this.walkPhase, pose);
    else if (won && st.won !== 'modest') POSES.cheer(t * (st.won === 'roar' ? 1.25 : 0.8), pose);
    else if (idle) POSES.idle(t, pose, p.look.seed);
    else POSES.ready(t, pose);
    const play = (v.mode === 'play' || v.mode === 'intro') && !celebrate && !walking && !idle;
    pose.gripR = 0.95; // without the shared grip: the bat never leaves his hand…
    pose.pointR = 1; // …and the index finger lies straight along its back
    if (v.toss >= 0) pose.gripL = 0.04; // the ball rests on an OPEN palm
    this.leftHand(this.leftShapeFor(v, reacting, won, patting, walking));
    const fhTarget = v.fh > 0 ? 1 : 0;
    this.fhW += (fhTarget - this.fhW) * Math.min(1, dt * 9);
    let reachLean = 0;
    if (won) {
      // Rickard bounces on his toes; Henrik just straightens up, satisfied
      if (st.won === 'roar') pose.hipsPos[1] += Math.abs(Math.sin(r.t * 7)) * 0.05 * env;
      if (st.won === 'modest') pose.spine[0] -= 0.06 * env;
    }
    if (play) {
      // The knees keep a rhythm between shots (the feet are planted, so
      // lowering the hips is what bends them)…
      const moving = Math.min(1, Math.abs(this.vx) / 1.2);
      pose.hipsPos[1] -= Math.abs(Math.sin(t * 4.4)) * (0.012 + moving * 0.012);
      // …and a real split-step the moment you strike: a drop onto the balls
      // of the feet, loaded to push off whichever way the ball comes
      const reading = !!v.contact && v.toss < 0;
      if (reading && !this.wasReading) this.split = 1;
      this.wasReading = reading;
      if (this.split > 0) {
        this.split = Math.max(0, this.split - dt * 3.6);
        pose.hipsPos[1] -= Math.sin(this.split * Math.PI) * 0.045;
        pose.spine[0] += Math.sin(this.split * Math.PI) * 0.06;
      }
      // The trunk turns with the stroke: away on the backswing, through
      // and past the ball on the follow-through
      const yaw = this.strokeYaw(v.stroke);
      pose.hips[1] += yaw * 0.3;
      pose.spine[1] += yaw * 0.3;
      pose.chest[1] += yaw * 0.4;
      // Weight transfer: he sits into the back leg on the backswing (the
      // right one on a forehand) and drives through onto the other as he
      // hits, the knees loading and releasing with it
      const load = this.strokeLoad(v.stroke);
      const side = this.fhW * 2 - 1; // +1 forehand … −1 backhand
      pose.hipsPos[0] += load * side * 0.045;
      pose.hipsPos[1] -= Math.abs(load) * 0.035;
      pose.hips[2] += load * side * 0.06;
      // Lean into the direction of travel (moving to world +x = his left)
      const lean = THREE.MathUtils.clamp(-this.vx * 0.07, -0.14, 0.14);
      pose.spine[2] += lean;
      pose.hips[2] += lean * 0.4;
      // Reaching for a short ball: bend over the table toward it
      if (v.contact && v.stroke > 0.3 && v.stroke < 1.6) {
        const ahead = v.contact.z - this.pos.z;
        reachLean = THREE.MathUtils.clamp((ahead - 0.62) * 0.7, 0, 0.32) * Math.sin(Math.min(1, v.stroke / 1.2) * Math.PI * 0.5);
        pose.spine[0] += reachLean;
        pose.chest[0] += reachLean * 0.4;
        pose.hipsPos[1] -= reachLean * 0.12;
      }
      if (v.mode === 'intro') {
        // A nod to the camera as the card comes up, then a bounce on the toes
        pose.head[0] += Math.sin(smoothstep(0.5, 1.1, this.modeT) * Math.PI) * 0.2;
        pose.hipsPos[1] += Math.abs(Math.sin(this.modeT * 5.2)) * 0.015 * smoothstep(1.2, 1.6, this.modeT);
      }
      this.reactPose(reacting, env, r.t, pose);
    }
    p.setPose(pose, jump ? 1 : 1 - Math.exp(-dt * 18));

    /* Feet: planted, and they step when the body has moved off them (the
       walk-on's feet are the walk cycle's own) */
    this.root.updateMatrixWorld(true);
    if (walking) this.planted = false;
    else {
      bones.footL.getWorldPosition(this._desired[0]);
      bones.footR.getWorldPosition(this._desired[1]);
      this.stepFeet(dt);
    }

    /* The bat, and the free hand */
    if (walking) {
      p.lookAt(v.look || null, smoothstep(0.4, 0.9, walkT / WALK_IN.dur) * 0.9);
    } else if (patting) {
      // Sporting applause: the bat held up, the free hand patting its face
      this.patBat(t, reacting === 'matchLost' ? env : 1);
      p.lookAt(v.look || null, 0.9);
    } else if (won) {
      if (st.won === 'modest') this.freeHand(0.2, 1.62 + Math.sin(r.t * 6) * 0.03, 0.22, env);
      p.lookAt(v.look || null, 0.6);
    } else if (idle) {
      p.lookAt(v.look || null, 0.5);
    } else {
      this.swingArm(v, reachLean);
      let look = v.ball || v.look || null;
      let lookW = v.ball ? 1 : 0.8;
      if (v.toss >= 0) this.tossArm(v);
      else if (reacting === 'point' || reacting === 'lost') {
        const at = this.reactArm(reacting, env, r.t);
        if (at) {
          look = at;
          lookW = 0.85;
        }
      } else if (v.mode === 'play') this.balanceArm(v.stroke);
      p.lookAt(look, lookW);
    }

    /* Face */
    const big = r.power > 0.65;
    if (r.shout > 0) this.setExpr('shout', 0.85);
    else if (reacting === 'point') {
      const shout = st.point === 'pump' && big && r.t < 0.9;
      this.setExpr(shout ? 'shout' : big || st.point === 'finger' ? 'grin' : 'smile', 0.9);
    } else if (reacting === 'lost') this.setExpr('frown', st.lost === 'brow' ? 0.55 : 0.8);
    else if (reacting === 'smash') this.setExpr('shout', 0.9);
    else if (won) this.setExpr(st.won === 'roar' && r.t < 1.6 ? 'shout' : 'grin', 1);
    else if (reacting === 'matchLost' || v.mode === 'clap') this.setExpr('smile', 0.8);
    else if (v.mode === 'intro') this.setExpr(this.modeT > 1.2 ? 'grin' : 'smile', 0.6);
    else if (v.mode === 'play' && v.focus > 0) this.setExpr('focus', Math.round(v.focus * 10) / 10);
    else this.setExpr('neutral', 0);

    p.update(dt, t);
  }

  /** Body language for a point won or lost, layered on the ready pose. */
  reactPose(kind, env, rt, pose) {
    if (!kind || env <= 0) return;
    const st = this.style;
    if (kind === 'point') {
      if (st.point === 'pump') {
        // Two hard pumps, each with a dip of the knees and a crunch forward
        const beat = rt < 0.72 ? Math.abs(Math.sin((rt / 0.36) * Math.PI)) : 0;
        pose.hipsPos[1] -= beat * 0.06 * env;
        pose.spine[0] += beat * 0.16 * env;
        pose.chest[1] -= 0.25 * env;
      } else if (st.point === 'finger') {
        // Chin up, chest open: the champion's swagger
        pose.chest[0] -= 0.08 * env;
        pose.head[0] -= 0.1 * env;
        pose.chest[1] -= 0.18 * env;
      } else {
        // A small satisfied nod
        pose.head[0] += Math.sin(Math.min(1, rt / 0.5) * Math.PI) * 0.22 * env;
        pose.chest[1] -= 0.12 * env;
      }
    } else if (kind === 'lost') {
      if (st.lost === 'slap') {
        // Head thrown back at the ceiling, then a shake
        const back = smoothstep(0, 0.25, rt) * (1 - smoothstep(0.6, 0.9, rt));
        pose.head[0] -= back * 0.45 * env;
        pose.head[1] += Math.sin(rt * 12) * 0.14 * smoothstep(0.7, 0.9, rt) * env;
        pose.chest[0] -= back * 0.1 * env;
      } else if (st.lost === 'wipe') {
        // Shoulders drop; he looks down at his bat (lookAt does the head)
        pose.chest[0] += 0.14 * env;
        pose.spine[0] += 0.06 * env;
      } else {
        // A long breath out, a slight shake of the head
        pose.chest[0] += 0.08 * env;
        pose.head[1] += Math.sin(rt * 9) * 0.1 * smoothstep(0.5, 0.8, rt) * env;
      }
    }
  }

  /**
   * The free (left) hand for a point won or lost. Returns a point to look
   * at when the gesture wants his eyes (the bat he is wiping), else null.
   */
  reactArm(kind, env, rt) {
    const st = this.style;
    const p = this.person;
    const style = kind === 'point' ? st.point : st.lost;
    if (style === 'pump') {
      // "JA!": the fist cocked at the shoulder, yanked down to the hip — twice
      const pull = rt < 0.72 ? Math.abs(Math.sin((rt / 0.36) * Math.PI)) : 0.45;
      this.freeHand(0.25, 1.44 - pull * 0.34, 0.3 - pull * 0.1, env);
    } else if (style === 'finger') {
      // One finger up at shoulder height: "en till"
      const up = smoothstep(0, 0.3, rt);
      this.freeHand(0.3, 1.2 + up * 0.38, 0.28, env, 1);
    } else if (style === 'nod') {
      // A low, contained "kom igen" by the hip
      const k = Math.sin(Math.min(1, rt / 0.45) * Math.PI);
      this.freeHand(0.22, 1.02 + k * 0.12, 0.3, env);
    } else if (style === 'slap') {
      // The free hand comes down flat on the thigh
      const down = smoothstep(0.55, 0.75, rt);
      this.freeHand(0.2, 1.12 - down * 0.26, 0.2 - down * 0.08, env, 0, 0.2);
    } else if (style === 'brow') {
      // The back of the wrist across the forehead
      const k = smoothstep(0.15, 0.9, rt);
      this.freeHand(0.02 + k * 0.14, 1.7 - k * 0.02, 0.16, env, 0, 0.35);
    } else if (style === 'wipe') {
      // He studies the rubber and wipes it with his palm
      const blade = this._wipe || (this._wipe = new THREE.Vector3());
      this.paddle.localToWorld(blade.set(0, BLADE_Y, 0.04));
      const hand = this._v.copy(blade);
      hand.x += Math.sin(rt * 14) * 0.035;
      hand.z += 0.05;
      p.bones.handL.getWorldPosition(this._w);
      this._w.lerp(hand, env * smoothstep(0.1, 0.4, rt));
      p.ikArm('L', this._w, null);
      return blade;
    }
    return null;
  }

  /**
   * The free arm balances the stroke: on a forehand it reaches out toward
   * the ball on the backswing and pulls in to the hip as the bat comes
   * through; on a backhand it stays out to the side, opening the chest.
   */
  balanceArm(stroke) {
    const w = smoothstep(0.1, 0.45, stroke) * (1 - smoothstep(1.55, 1.95, stroke));
    if (w <= 0.001) return;
    const load = this.strokeLoad(stroke);
    const fh = this.fhW;
    const back = Math.max(0, -load);
    const through = Math.max(0, load);
    const x = 0.24 + fh * (back * 0.12 - through * 0.02) + (1 - fh) * 0.14;
    const y = 1.06 + fh * back * 0.12 - through * 0.05;
    const z = 0.3 + fh * (back * 0.16 - through * 0.2) - (1 - fh) * 0.06;
    const p = this.person;
    const { s } = this;
    const hand = this._v.set(x * s, y * s, z * s).add(this.pos);
    p.bones.handL.getWorldPosition(this._w);
    this._w.lerp(hand, w * 0.85);
    p.ikArm('L', this._w, null);
  }

  /** What the free hand is doing: a shape from the shared grip library, or null (the pose). */
  leftShapeFor(v, reacting, won, patting, walking) {
    if (walking) return null;
    if (v.toss >= 0 || patting) return 'open';
    if (won) return this.style.won === 'modest' ? 'fist' : 'open';
    const style = reacting === 'point' ? this.style.point : reacting === 'lost' ? this.style.lost : '';
    if (style === 'pump' || style === 'nod') return 'fist';
    if (style === 'finger') return 'point';
    if (style === 'slap' || style === 'wipe') return 'open';
    if (style === 'brow') return 'relaxed';
    return null;
  }

  leftHand(shape) {
    if (shape === this.leftShape) return;
    this.leftShape = shape;
    if (typeof this.person.setGrip === 'function') this.person.setGrip('L', shape, { blend: 0.12 });
  }

  /** The left hand to a point in his own frame, blended in by `env`. */
  freeHand(x, y, z, env, point = 0, grip = 1) {
    const p = this.person;
    const { s } = this;
    const hand = this._v.set(x * s, y * s, z * s).add(this.pos);
    p.bones.handL.getWorldPosition(this._w);
    this._w.lerp(hand, env);
    p.ikArm('L', this._w, null);
    if (typeof p.setGrip === 'function') return; // the grip library shapes the fingers
    // Fingers after the fact (the pose went in before the IK); the left
    // hand curls about −Z, as in people-rig's fingerRot
    const k = Math.min(1, env * 1.5);
    const curl = (bone, a) => bone.rotation.set(0, 0, -a * k);
    curl(p.bones.indexL, 0.06 + grip * (1 - point) * 1.4);
    curl(p.bones.indexTipL, 0.1 + grip * (1 - point) * 1.6);
    curl(p.bones.fingersL, 0.1 + grip * 1.5);
    curl(p.bones.fingersTipL, 0.14 + grip * 1.7);
  }

  /** Applause the table tennis way: the free hand patting the bat's face. */
  patBat(t, env) {
    const p = this.person;
    const { s } = this;
    const blade = this._fist;
    blade.set(-0.02 * s, 1.24 * s, 0.36 * s).add(this.pos);
    bladeQuat(PAT_O, false, this._q);
    const hq = this._hq.copy(this._q).multiply(this.paddleInHandInv);
    const wrist = this._w.copy(this.bladeInHand).applyQuaternion(hq);
    wrist.subVectors(blade, wrist);
    const pole = this._pole.set(-0.6, -0.6, -0.4).multiplyScalar(s);
    p.bones.chest.updateWorldMatrix(true, false);
    pole.applyMatrix4(p.bones.chest.matrixWorld);
    p.ikArm('R', wrist, pole, hq);
    // The left palm meets the red face in a steady patter
    this.paddle.updateWorldMatrix(true, false);
    const face = this._v.set(0, BLADE_Y, 0.03 + Math.max(0, Math.sin(t * 8.5)) * 0.07);
    this.paddle.localToWorld(face);
    p.bones.handL.getWorldPosition(this._w);
    this._w.lerp(face, env);
    p.ikArm('L', this._w, null);
  }

  strokeYaw(stroke) {
    const fh = [0, -0.55, -0.1, 0.5, 0];
    const bh = [0, 0.42, 0.05, -0.32, 0];
    let i = 0;
    while (i < 3 && stroke > KEYS[i + 1]) i++;
    const k = smoothstep(0, 1, (stroke - KEYS[i]) / (KEYS[i + 1] - KEYS[i]));
    const a = fh[i] + (fh[i + 1] - fh[i]) * k;
    const b = bh[i] + (bh[i + 1] - bh[i]) * k;
    return b + (a - b) * this.fhW;
  }

  /** −1 weight on the back leg (backswing) … +1 driven through (follow-through). */
  strokeLoad(stroke) {
    const w = [0, -1, 0.35, 1, 0];
    let i = 0;
    while (i < 3 && stroke > KEYS[i + 1]) i++;
    const k = smoothstep(0, 1, (stroke - KEYS[i]) / (KEYS[i + 1] - KEYS[i]));
    return w[i] + (w[i + 1] - w[i]) * k;
  }

  /** Blade centre (world) and orientation for a stroke phase. */
  bladeAt(stroke, fh, contact, outP, outQ) {
    const P = fh ? FH_P : BH_P;
    const Q = fh ? FH_Q : BH_Q;
    let i = 0;
    while (i < 3 && stroke > KEYS[i + 1]) i++;
    const k = ease[i](Math.min(1, Math.max(0, (stroke - KEYS[i]) / (KEYS[i + 1] - KEYS[i]))));
    const { s } = this;
    const key = (j, out) => {
      if (j === 2) {
        if (contact) {
          out.copy(contact).sub(this.pos);
          // Keep the contact key inside a shell the arm can reach
          out.x = THREE.MathUtils.clamp(out.x, -1.0, 0.55);
          out.y = THREE.MathUtils.clamp(out.y, 0.72, 1.8);
          out.z = THREE.MathUtils.clamp(out.z, 0.18, 1.05);
          return out;
        }
        return out.fromArray(fh ? DEFAULT_CONTACT.fh : DEFAULT_CONTACT.bh).multiplyScalar(s);
      }
      return out.fromArray(P[j]).multiplyScalar(s);
    };
    key(i, this._v);
    key(i + 1, this._w);
    outP.copy(this._v).lerp(this._w, k).add(this.pos);
    outQ.copy(Q[i]).slerp(Q[i + 1], k);
  }

  swingArm(v, reachLean) {
    const p = this.person;
    const blade = this._fist;
    const q = this._q;
    // Blend forehand and backhand paths so a late switch never snaps
    const tmpP = this._tmpP || (this._tmpP = new THREE.Vector3());
    const tmpQ = this._tmpQ || (this._tmpQ = new THREE.Quaternion());
    this.bladeAt(v.stroke, true, v.contact, blade, q);
    if (this.fhW < 0.999) {
      this.bladeAt(v.stroke, false, v.contact, tmpP, tmpQ);
      blade.lerp(tmpP, 1 - this.fhW);
      q.slerp(tmpQ, 1 - this.fhW);
    }
    if (v.stroke === 0 && v.mode === 'intro') {
      // At the card he holds the bat up, relaxed
      blade.set(-0.2 * this.s, 1.12 * this.s, 0.36 * this.s).add(this.pos);
      q.copy(READY_Q);
    }
    // Hand orientation from the blade's, then the wrist from the blade centre
    const hq = this._hq.copy(q).multiply(this.paddleInHandInv);
    const wrist = this._w.copy(this.bladeInHand).applyQuaternion(hq);
    wrist.subVectors(blade, wrist);
    // Elbow: down and back on the forehand, out to the side on the backhand
    const { s } = this;
    const fh = this.fhW;
    const pole = this._pole.set(-0.55 - 0.15 * (1 - fh), -0.5 + 0.35 * (1 - fh) + reachLean, -0.5 + 0.85 * (1 - fh)).multiplyScalar(s);
    p.bones.chest.updateWorldMatrix(true, false);
    pole.applyMatrix4(p.bones.chest.matrixWorld);
    p.ikArm('R', wrist, pole, hq);
  }

  /**
   * His serve, by the rules: the ball rests still on the flat, open palm,
   * is tossed near-vertically, and is struck as it falls.
   */
  tossArm(v) {
    const p = this.person;
    const { s } = this;
    const k = v.toss;
    // The palm, in front of him and a little to his left of the bat
    const palm = this._v.set(0.02 * s, 0.98 * s, 0.38 * s).add(this.pos);
    // Lift with the ball (k < 0.35), release, follow up a touch, then drop
    const lift = smoothstep(0.05, 0.38, k) * 0.2 - smoothstep(0.5, 0.95, k) * 0.16;
    palm.y += lift;
    p.ikArm('L', palm, null, PALM_UP_L);
    if (!v.tossBall || !v.servePoint) return;
    // Where the ball sits: on the palm's centre, not in the wrist
    p.bones.handL.updateWorldMatrix(true, false);
    const onPalm = this._w.set(-0.036 * s, -0.046 * s, 0.006 * s);
    p.bones.handL.localToWorld(onPalm);
    const rel = this._release || (this._release = new THREE.Vector3());
    const REL = 0.36;
    if (k < REL) {
      v.tossBall.copy(onPalm);
      rel.copy(onPalm);
    } else {
      // Up off the palm and back down onto the serve point
      const u = (k - REL) / (1 - REL);
      v.tossBall.copy(rel).lerp(v.servePoint, smoothstep(0, 1, u));
      v.tossBall.y = THREE.MathUtils.lerp(rel.y, v.servePoint.y, u) + Math.sin(u * Math.PI) * 0.3;
    }
  }

  stepFeet(dt) {
    const p = this.person;
    const lead = THREE.MathUtils.clamp(this.vx * 0.09, -0.12, 0.12);
    if (!this.planted) {
      this.feet.forEach((f, i) => {
        f.plant.copy(this._desired[i]);
        f.on = false;
      });
      this.planted = true;
    }
    const busy = this.feet.some((f) => f.on);
    // Step the foot that has drifted furthest, one at a time
    if (!busy) {
      let worst = -1;
      let far = 0.12;
      this.feet.forEach((f, i) => {
        const d = Math.hypot(f.plant.x - this._desired[i].x, f.plant.z - this._desired[i].z);
        if (d > far) {
          far = d;
          worst = i;
        }
      });
      if (worst >= 0) {
        const f = this.feet[worst];
        f.on = true;
        f.t = 0;
        f.from.copy(f.plant);
        f.to.copy(this._desired[worst]);
        f.to.x += lead;
      }
    }
    this.feet.forEach((f, i) => {
      const target = this._v;
      if (f.on) {
        f.t = Math.min(1, f.t + dt / 0.13);
        const k = smoothstep(0, 1, f.t);
        target.copy(f.from).lerp(f.to, k);
        target.y = this._desired[i].y + Math.sin(f.t * Math.PI) * 0.05;
        if (f.t >= 1) {
          f.on = false;
          f.plant.copy(f.to);
        }
      } else {
        target.set(f.plant.x, this._desired[i].y, f.plant.z);
      }
      p.ikLeg(f.side, target);
    });
  }

  /** Two points along the blade, for the swing trail. */
  bladePoints(a, b) {
    this.paddle.localToWorld(a.set(0, 0.03, 0));
    this.paddle.localToWorld(b.set(0, 0.2, 0));
  }

  dispose() {
    // The bat is the game's, not the person's. If the next opponent already
    // holds it, the person's dispose (which lets go of everything it was
    // handed) would pull it out of HIS hand — so put it back there.
    const holder = this.paddle.parent;
    const ours = holder === this.holder;
    this.person.dispose();
    if (holder && !ours) holder.add(this.paddle);
  }
}
