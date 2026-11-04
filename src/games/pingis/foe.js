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
import { createPerson, appearanceFor, POSES } from '../shared/people.js';

/** Anundsjö IF red, and a trim per podium place. */
const CLUB_RED = 0xa8202c;
const TRIM = {
  'Henrik Lundqvist': 0xb88a5a, // brons
  'Rickard Nilsson': 0xd4d8de, // silver
  'Viktor Jones': 0xe8b84a // guld
};

/** Where the bat stands relative to the body (index.js keeps him there). */
export const BAT_OFFSET = { fh: 0.342, bh: -0.114 };

/* Stroke keys. Blade centre in the figure's own frame (metres at 1.80 m,
   +X his left, +Z toward the net), then the blade direction and the
   hitting face's normal. The contact key comes from the ball. */
const KEYS = [0, 0.7, 1, 1.5, 2];
const READY_P = [-0.14, 1.08, 0.4];
const FH_P = [READY_P, [-0.58, 0.94, 0.0], null, [0.08, 1.58, 0.34], READY_P];
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

const ease = {
  // wind-up eases in and out; the swing accelerates INTO the ball and
  // decelerates after it — a stroke is fastest at contact, not between keys
  0: (k) => k * k * (3 - 2 * k),
  1: (k) => k ** 1.7,
  2: (k) => 1 - (1 - k) ** 2,
  3: (k) => k * k * (3 - 2 * k)
};

/* The paddle in the fist: its handle across the palm, the blade out of the
   thumb side (socket +Z) and the red rubber on the palm side (socket +X).
   Columns are the paddle's axes in the socket's frame. */
const PADDLE_IN_HAND = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
);
const PADDLE_IN_HAND_INV = PADDLE_IN_HAND.clone().invert();
const BLADE_Y = 0.112; // blade centre above the grip (hall.js buildPaddle)

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
      outfit: { top: 'jersey', topColor: CLUB_RED, bottom: 'shorts', bottomColor: 0x1b1d24, accent: trim, shoes: 'sneakers', shoeColor: 0xe9e6de },
      headwear: { style: 'headband', color: 0xf3efe6 }
    }));
    const p = this.person;
    this.root = p.root;
    this.s = p.scale;
    this.paddle = paddle;
    p.attach(paddle, 'gripR', { quaternion: PADDLE_IN_HAND });
    // Where the blade centre sits in the hand's frame
    this.bladeInHand = p.sockets.gripR.position.clone().add(new THREE.Vector3(0, BLADE_Y, 0).applyQuaternion(PADDLE_IN_HAND));

    this.pose = POSES.ready(0);
    this.pos = new THREE.Vector3();
    this.vx = 0;
    this.fhW = 1; // 1 forehand … 0 backhand, eased
    this.feet = ['L', 'R'].map((side) => ({
      side, plant: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, on: false
    }));
    this.planted = false;
    this.fresh = true;
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
   * gets a grin, not a smile.
   */
  cue(kind, power = 0.5) {
    const dur = { point: 1.3, lost: 1.2, smash: 0.7, matchWon: 3, matchLost: 2.5 }[kind] ?? 1;
    this.react = { kind, t: 0, dur, power };
  }

  setExpr(name, amount = 1) {
    const key = `${name}:${amount}`;
    if (key === this.expr) return;
    this.expr = key;
    this.person.setExpression(name, amount);
  }

  /**
   * v: { x, z, stroke, fh, ball (Vector3|null), contact (Vector3|null),
   *      mode: 'play'|'intro'|'menu'|'clap', look (Vector3|null), focus 0..1,
   *      toss: −1 or 0..1 (his serve toss), tossBall (Vector3, written back) }
   */
  update(dt, t, v) {
    const p = this.person;
    const { bones } = p;
    const r = this.react;
    r.t += dt;
    const reacting = r.t < r.dur ? r.kind : '';
    const env = reacting ? smoothstep(0, 0.12, r.t) * (1 - smoothstep(r.dur - 0.35, r.dur, r.t)) : 0;

    /* Where he stands; a sideways speed for the lean and the footwork */
    const jump = this.fresh || Math.abs(v.x - this.pos.x) > 0.8;
    const vx = jump ? 0 : (v.x - this.pos.x) / Math.max(1e-3, dt);
    this.vx += (vx - this.vx) * Math.min(1, dt * 10);
    this.pos.set(v.x, 0, v.z);
    this.root.position.copy(this.pos);
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
    const celebrate = v.mode === 'clap' || reacting === 'matchWon';
    if (v.mode === 'clap') POSES.clap(t, pose);
    else if (reacting === 'matchWon') POSES.cheer(t, pose);
    else if (v.mode === 'menu') POSES.idle(t, pose);
    else POSES.ready(t, pose);
    const play = v.mode === 'play' || v.mode === 'intro';
    pose.gripR = 0.95; // the bat never leaves his hand
    if (reacting === 'point') pose.gripL = 1;
    const fhTarget = v.fh > 0 ? 1 : 0;
    this.fhW += (fhTarget - this.fhW) * Math.min(1, dt * 9);
    let reachLean = 0;
    if (play && !celebrate) {
      // Split-step: the knees keep a rhythm between shots (the feet are
      // planted, so lowering the hips is what bends them)
      const moving = Math.min(1, Math.abs(this.vx) / 1.2);
      pose.hipsPos[1] -= Math.abs(Math.sin(t * 4.4)) * (0.012 + moving * 0.012);
      // The trunk turns with the stroke: away on the backswing, through
      // and past the ball on the follow-through
      const yaw = this.strokeYaw(v.stroke);
      pose.hips[1] += yaw * 0.3;
      pose.spine[1] += yaw * 0.3;
      pose.chest[1] += yaw * 0.4;
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
        // A nod to the camera as the card comes up
        pose.head[0] += Math.sin(smoothstep(0.5, 1.1, this.modeT) * Math.PI) * 0.2;
      }
      if (reacting === 'lost') {
        // Shoulders drop, a shake of the head
        pose.chest[0] += 0.12 * env;
        pose.head[1] += Math.sin(r.t * 13) * 0.16 * env;
      }
    }
    p.setPose(pose, jump ? 1 : 1 - Math.exp(-dt * 18));

    /* Feet: planted, and they step when the body has moved off them */
    this.root.updateMatrixWorld(true);
    bones.footL.getWorldPosition(this._desired[0]);
    bones.footR.getWorldPosition(this._desired[1]);
    this.stepFeet(dt);

    /* The bat */
    if (v.mode === 'clap') {
      // Applauding the new champion: the left hand pats the bat face
      p.lookAt(v.look || null, 1);
    } else if (celebrate) {
      p.lookAt(v.look || null, 0.6);
    } else if (v.mode === 'menu') {
      p.lookAt(v.look || null, 0.5);
    } else {
      this.swingArm(v, reachLean);
      if (v.toss >= 0) this.tossArm(v);
      else if (reacting === 'point') this.fistPump(env, r.t);
      p.lookAt(v.ball || v.look || null, v.ball ? 1 : 0.8);
    }

    /* Face */
    if (reacting === 'point') this.setExpr(r.power > 0.65 ? 'grin' : 'smile', 0.9);
    else if (reacting === 'lost') this.setExpr('frown', 0.8);
    else if (reacting === 'smash') this.setExpr('shout', 0.9);
    else if (reacting === 'matchWon') this.setExpr('grin', 1);
    else if (reacting === 'matchLost' || v.mode === 'clap') this.setExpr('smile', 0.8);
    else if (v.mode === 'intro') this.setExpr('smile', 0.55);
    else if (v.mode === 'play' && v.focus > 0) this.setExpr('focus', Math.round(v.focus * 10) / 10);
    else this.setExpr('neutral', 0);

    p.update(dt, t);
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
    const hq = this._hq.copy(q).multiply(PADDLE_IN_HAND_INV);
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

  /** His serve: the ball sits in the left palm, is tossed, and falls to the bat. */
  tossArm(v) {
    const p = this.person;
    const { s } = this;
    const k = v.toss;
    // The palm, in front of him and a little to his right
    const palm = this._v.set(-0.12 * s, 1.0 * s, 0.42 * s).add(this.pos);
    const lift = k < 0.3 ? 0 : smoothstep(0.3, 0.55, k) * (1 - smoothstep(0.75, 1, k));
    const hand = this._w.copy(palm);
    hand.y += smoothstep(0, 0.3, k) * 0.16 + lift * 0.12;
    p.ikArm('L', hand, null);
    // The ball: in the palm, then up and down onto the serve point
    if (v.tossBall && v.servePoint) {
      if (k <= 0) v.tossBall.copy(palm).y += 0.05;
      else {
        const u = smoothstep(0, 1, k);
        v.tossBall.copy(palm).lerp(v.servePoint, u);
        v.tossBall.y += 0.05 * (1 - u) + Math.sin(Math.min(1, k * 1.05) * Math.PI) * 0.34;
      }
    }
  }

  /** A quick "kom igen" with the free hand. */
  fistPump(env, rt) {
    const p = this.person;
    const { s } = this;
    const pump = Math.sin(Math.min(1, rt / 0.5) * Math.PI) * 0.12;
    const hand = this._v.set(0.22 * s, (1.3 + pump) * s, 0.28 * s).add(this.pos);
    p.bones.handL.getWorldPosition(this._w);
    this._w.lerp(hand, env);
    p.ikArm('L', this._w, null);
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
    const ours = holder === this.person.sockets.gripR;
    this.person.dispose();
    if (holder && !ours) holder.add(this.paddle);
  }
}
