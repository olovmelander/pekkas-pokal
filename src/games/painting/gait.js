/**
 * Pekkas Måleri — feet that stay where they are put.
 *
 * A walk cycle played on a moving root slides: the cycle's stride never
 * quite matches the ground covered, it blends in and out at the ends, and a
 * root that turns on the spot swivels both soles across the lawn. So the
 * people in the garden do not play their legs at all. Each foot is planted
 * in WORLD space and stays there until the body has moved far enough from it
 * (or turned far enough over it) that a person would step; then it swings —
 * heel first off the grass, toes up for the heel strike — to where the body
 * will be by the time it lands, and plants again. Only one foot is ever in
 * the air. Two-bone IK puts the legs on the feet, the hips drop just enough
 * for the legs to reach (which is what makes a walk bob), the pelvis rolls
 * over the standing leg, and the arms swing against the feet.
 *
 * The same few rules give Hägglund's stroll, a turn on the spot by the
 * easel, a painter stepping back to look at the canvas and stepping in
 * again, and someone shifting their weight while they think.
 */
import * as THREE from 'three';

/** Ankle above the sole, hip joint above the ground, leg length: the 1.80 m model. */
const ANKLE = 0.08;
const HIP_Y = 0.905;
const HIP_X = 0.088;
const LEG = 0.825;
/** Toe pad ahead of the ankle, in the foot's frame (1.80 m model). */
const TOE = new THREE.Vector3(0, -0.07, 0.125);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0);

const wrap = (a) => {
  let d = a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const smooth = (k) => k * k * (3 - 2 * k);

export class Feet {
  /**
   * `width`: each foot's distance from the centre line (m at 1.80 m),
   * `toeOut`: how far the feet turn out (rad), `swing`: seconds in the air.
   */
  constructor(person, { width = 0.1, toeOut = 0.1, swing = 0.38, lift = 0.075 } = {}) {
    this.person = person;
    const s = person.scale;
    this.s = s;
    this.width = width * s;
    this.toeOut = toeOut;
    this.swingDur = swing;
    this.lift = lift * s;
    this.vel = new THREE.Vector3();
    this.lastRoot = new THREE.Vector3();
    this.drop = 0;
    this.still = 0;
    this.next = 'L';
    this.out = { drop: 0, sway: 0, swing: 0, twist: 0 };
    this.feet = ['L', 'R'].map((S) => ({
      S,
      side: S === 'L' ? 1 : -1,
      pos: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      from: new THREE.Vector3(),
      fromYaw: 0,
      fromPitch: 0,
      t: -1,
      ankle: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      pole: new THREE.Vector3()
    }));
    this.reset();
  }

  get yaw() {
    return this.person.root.rotation.y;
  }

  /** Where a foot would stand if the person stood square right now. */
  ideal(f, out) {
    const r = this.person.root;
    const yaw = this.yaw;
    return out.set(f.side * this.width, 0, 0.01 * this.s).applyAxisAngle(Y, yaw).add(r.position).setY(0);
  }

  /** Both feet planted square under the body (after a teleport). */
  reset() {
    const r = this.person.root;
    this.lastRoot.copy(r.position);
    this.vel.set(0, 0, 0);
    for (const f of this.feet) {
      this.ideal(f, f.pos);
      f.yaw = this.yaw + f.side * this.toeOut;
      f.pitch = 0;
      f.t = -1;
    }
  }

  /** True while a foot is in the air. */
  get stepping() {
    return this.feet.some((f) => f.t >= 0);
  }

  /**
   * Advance the feet for this frame. Call after the root has been moved and
   * turned, BEFORE setPose. Returns { drop, sway, swing, twist } for the pose:
   * how far the hips sink (m), roll toward the standing leg (−1..1), and how
   * the arms and the pelvis swing with the feet (−1..1, + = left foot ahead).
   */
  plan(dt) {
    const d = Math.min(Math.max(dt, 1e-4), 0.1);
    const r = this.person.root;
    const s = this.s;
    // Smoothed ground velocity: the lead a swinging foot aims ahead by
    _v.subVectors(r.position, this.lastRoot).divideScalar(d).setY(0);
    this.lastRoot.copy(r.position);
    this.vel.lerp(_v, 1 - Math.exp(-d * 10));
    const speed = this.vel.length();
    this.still = speed < 0.05 ? this.still + d : 0;
    const yaw = this.yaw;
    const lead = 0.3;

    // In the air: chase where the body will be when the foot lands
    let flying = null;
    for (const f of this.feet) {
      if (f.t < 0) continue;
      flying = f;
      f.t += d / this.swingDur;
      const k = Math.min(1, f.t);
      this.ideal(f, _v).addScaledVector(this.vel, lead * Math.max(0, 1 - k * 0.6));
      const e = smooth(k);
      f.pos.lerpVectors(f.from, _v, e);
      const len = f.from.distanceTo(_v);
      f.pos.y = Math.sin(k * Math.PI) * this.lift * Math.min(1, 0.35 + len / (0.35 * s));
      f.yaw = f.fromYaw + wrap(yaw + f.side * this.toeOut - f.fromYaw) * e;
      // Heel comes off first, the toes lift for the heel strike
      f.pitch = k < 0.5 ? f.fromPitch * (1 - k * 2) + (-0.15) * k * 2 : -0.15 - 0.15 * Math.sin((k - 0.5) * Math.PI);
      if (f.t >= 1) {
        f.t = -1;
        f.pos.y = 0;
        flying = null;
      }
    }

    // On the ground: a foot steps when the body has left it behind or turned over it
    if (!flying) {
      let pick = null;
      let worst = 0;
      const thresh = 0.09 * s + speed * lead * 1.05;
      for (const f of this.feet) {
        this.ideal(f, _v);
        const dist = Math.hypot(f.pos.x - _v.x, f.pos.z - _v.z);
        const turn = Math.abs(wrap(yaw + f.side * this.toeOut - f.yaw));
        const err = Math.max(dist / thresh, turn / 0.45);
        // Standing again: a small settling step squares the feet up
        const settle = this.still > 0.3 && (dist > 0.045 * s || turn > 0.2);
        const score = settle ? Math.max(err, 1.01) : err;
        // The other foot gets priority on a tie, so steps alternate
        const bias = f.S === this.next ? 0.02 : 0;
        if (score + bias > 1 && score + bias > worst) {
          worst = score + bias;
          pick = f;
        }
      }
      if (pick) {
        pick.t = 0;
        pick.from.copy(pick.pos).setY(0);
        pick.fromYaw = pick.yaw;
        pick.fromPitch = pick.pitch;
        this.next = pick.S === 'L' ? 'R' : 'L';
      }
    }

    // Standing feet: flat, or rolling onto the toes as the body passes over
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    let behindMax = 0;
    const out = this.out;
    out.swing = 0;
    for (const f of this.feet) {
      // How far ahead of the hips this foot is
      const ahead = (f.pos.x - r.position.x) * fwdX + (f.pos.z - r.position.z) * fwdZ;
      out.swing += f.side * ahead;
      if (f.t >= 0) continue;
      const heel = speed > 0.3 ? Math.min(0.42, Math.max(0, (-ahead - 0.14 * s) * 2.2)) : 0;
      f.pitch += (heel - f.pitch) * (1 - Math.exp(-d * (heel > f.pitch ? 12 : 22)));
      behindMax = Math.max(behindMax, -ahead);
    }
    out.swing = THREE.MathUtils.clamp(out.swing / (0.55 * s), -1, 1);
    out.twist = out.swing;

    // Hips low enough for both legs to reach their feet
    let need = 0;
    for (const f of this.feet) {
      this.ankleOf(f);
      _v2.set(f.side * HIP_X * s, 0, 0).applyAxisAngle(Y, yaw).add(r.position);
      const h = Math.hypot(f.ankle.x - _v2.x, f.ankle.z - _v2.z);
      const reach = LEG * s * 0.975;
      const top = f.ankle.y + Math.sqrt(Math.max(0, reach * reach - h * h));
      need = Math.max(need, HIP_Y * s - top);
    }
    this.drop = need > this.drop ? need : this.drop + (need - this.drop) * (1 - Math.exp(-d * 9));
    out.drop = Math.max(0, this.drop);
    // The pelvis rolls over whichever leg carries the weight
    const L = this.feet[0];
    const R = this.feet[1];
    const sway = L.t >= 0 ? -1 : R.t >= 0 ? 1 : 0;
    out.sway += (sway * Math.min(1, speed * 1.5 + 0.35) - out.sway) * (1 - Math.exp(-d * 6));
    return out;
  }

  /** Ankle target and sole orientation for a foot, from its contact point. */
  ankleOf(f) {
    const s = this.s;
    _e.set(f.pitch, f.yaw, 0, 'YXZ');
    f.quat.setFromEuler(_e);
    if (f.pitch > 0 && f.t < 0) {
      // Rolling onto the toes: the toe pad stays put, the ankle rises round it
      _q2.setFromEuler(_e.set(0, f.yaw, 0, 'YXZ'));
      const toe = _v.copy(TOE).multiplyScalar(s).applyQuaternion(_q2).add(f.pos);
      toe.y = 0;
      f.ankle.copy(TOE).multiplyScalar(-s).applyQuaternion(f.quat).add(toe);
      f.ankle.y += ANKLE * s - TOE.y * -s * 0 + 0;
      // TOE.y is the drop from ankle to sole: keep the sole's toe on the grass
      f.ankle.y = toe.y + _v2.copy(TOE).multiplyScalar(-s).applyQuaternion(f.quat).y;
    } else {
      f.ankle.copy(f.pos);
      f.ankle.y = f.pos.y + ANKLE * s;
    }
    return f.ankle;
  }

  /** Legs onto the feet. Call after setPose and root.updateMatrixWorld. */
  solve() {
    const p = this.person;
    const s = this.s;
    const yaw = this.yaw;
    for (const f of this.feet) {
      this.ankleOf(f);
      // Knee toward where the foot points, a little out
      _q.setFromAxisAngle(Y, f.yaw);
      f.pole.set(f.side * 0.12 * s, 0.45 * s, 1.0 * s).applyQuaternion(_q).add(f.ankle);
      f.pole.y = Math.max(f.pole.y, 0.5 * s);
      p.ikLeg(f.S, f.ankle, f.pole, f.quat);
    }
    return yaw;
  }
}
