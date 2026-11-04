/**
 * Pekkas Pokal — people: skeleton, pose library and IK.
 *
 * Frames and signs (read this before posing bones by hand)
 * --------------------------------------------------------
 * The person stands on the origin and faces +Z; +Y is up and +X is the
 * character's LEFT. Every bone's local axes are parallel to the root's when
 * its rotation is zero ("body-aligned"), and zero rotation everywhere is
 * "standing to attention": legs straight, arms hanging straight down at the
 * sides with the palms facing the thighs and the thumbs forward.
 *
 * The bind/rest pose is an A-pose: upperArmL.rotation.z = +A_POSE and
 * upperArmR.rotation.z = -A_POSE, everything else zero.
 *
 * Euler angles (radians, three.js default order 'XYZ'):
 *   spine/chest/neck/head  x+ bend forward (nod down)   y+ turn to own left   z+ lean to own right
 *   upperArm               x- raise forward             zL+ / zR- raise out sideways   y twist
 *   forearm                x- bend the elbow (hand comes forward)
 *   hand                   zL- / zR+ bend the wrist towards the palm, x- tip the fingers forward
 *   thigh                  x- swing the leg forward     zL+ / zR- spread out
 *   shin                   x+ bend the knee
 *   foot                   x- toes up, x+ toes down
 *   shoulder (clavicle)    zL+ / zR- shrug up, y± roll forward/back
 * Hands curl with setPose({ gripL, gripR, pointL, pointR }) rather than by
 * touching the finger bones directly.
 */
import * as THREE from 'three';
import { HAND_BONES, HAND_PARENT, DIGITS, THUMB, PALM_PIVOT, legacyConfig, writeConfig, HAND_BONE_COUNT } from './people-hands.js';

export const A_POSE = 0.7;

/** Finger bones of one side, [name, parent] (see people-hands.js for the anatomy). */
const handDefs = (S) => HAND_BONES.map((n) => [n + S, HAND_PARENT[n] + S]);

/** [name, parent] in creation order — parents always come first. */
export const BONE_DEFS = [
  ['hips', null], ['spine', 'hips'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'],
  ['shoulderL', 'chest'], ['upperArmL', 'shoulderL'], ['forearmL', 'upperArmL'], ['forearmTwistL', 'forearmL'], ['handL', 'forearmL'],
  ...handDefs('L'),
  ['shoulderR', 'chest'], ['upperArmR', 'shoulderR'], ['forearmR', 'upperArmR'], ['forearmTwistR', 'forearmR'], ['handR', 'forearmR'],
  ...handDefs('R'),
  ['thighL', 'hips'], ['shinL', 'thighL'], ['footL', 'shinL'],
  ['thighR', 'hips'], ['shinR', 'thighR'], ['footR', 'shinR'],
  ['jaw', 'head'], ['lipUpper', 'head'], ['mouthL', 'head'], ['mouthR', 'head'],
  ['browL', 'head'], ['browR', 'head'], ['eyeL', 'head'], ['eyeR', 'head'],
  ['lidUpL', 'head'], ['lidUpR', 'head'], ['lidLoL', 'head'], ['lidLoR', 'head']
];
export const BONE_INDEX = Object.fromEntries(BONE_DEFS.map(([n], i) => [n, i]));

/** The bones a pose object may set (the face is driven by expressions). */
export const BODY_BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'forearmL', 'handL', 'shoulderR', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'
];
/** Every bone that moves rigidly with an arm (carried into the A-pose bind). */
export const armChain = (S) => ['upperArm', 'forearm', 'forearmTwist', 'hand', ...HAND_BONES].map((n) => n + S);

/** Head centre relative to the head bone, in the 1.80 m model. */
export const HEAD_C = [0, 0.1, 0.022];
/** The head is sculpted at life size and drawn this much larger (stylised). */
export const HEAD_SCALE = 1.15;

/** Face anchors in head space (metres from the head centre, before HEAD_SCALE). */
export const FACE = {
  eyeX: 0.0352, eyeY: 0.001, eyeZ: 0.0697, eyeR: 0.0168,
  mouthY: -0.0675, mouthHalfW: 0.0228, browY: 0.03
};

/**
 * Joint positions (model space, zero pose) for the 1.80 m model.
 * `w` scales the shoulders, `hw` the hips.
 */
export function jointTable(w = 1, hw = 1, hs = 1.09) {
  const J = {};
  const set = (n, x, y, z) => { J[n] = new THREE.Vector3(x, y, z); };
  const off = (n, from, x, y, z) => { J[n] = J[from].clone().add(new THREE.Vector3(x, y, z)); };
  set('hips', 0, 0.95, 0);
  set('spine', 0, 1.06, -0.005);
  set('chest', 0, 1.22, -0.012);
  set('neck', 0, 1.47, -0.02);
  set('head', 0, 1.54, -0.008);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    set(`shoulder${S}`, s * 0.028, 1.418, -0.002);
    set(`upperArm${S}`, s * 0.168 * w, 1.41, -0.018);
    off(`forearm${S}`, `upperArm${S}`, 0, -0.288, 0);
    off(`hand${S}`, `forearm${S}`, 0, -0.262, 0.004);
    off(`forearmTwist${S}`, `forearm${S}`, 0, -0.16, 0.002);
    // Hands: the digits of people-hands.js, scaled by the build's hand size
    const hd = (n, from, v, k = 1) => off(n, from, s * v[0] * hs * k, v[1] * hs * k, v[2] * hs * k);
    hd(`thumb${S}`, `hand${S}`, THUMB.cmc);
    hd(`thumbMid${S}`, `thumb${S}`, THUMB.dir, THUMB.len[0]);
    hd(`thumbTip${S}`, `thumbMid${S}`, THUMB.dir, THUMB.len[1]);
    hd(`palm${S}`, `hand${S}`, PALM_PIVOT);
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      const D = DIGITS[f];
      hd(`${f}${S}`, `hand${S}`, D.mcp);
      hd(`${f}Mid${S}`, `${f}${S}`, [0, -D.len[0], 0]);
      hd(`${f}Tip${S}`, `${f}Mid${S}`, [0, -D.len[1], 0]);
    }
    set(`thigh${S}`, s * 0.088 * hw, 0.905, -0.014);
    off(`shin${S}`, `thigh${S}`, 0, -0.415, 0.01);
    off(`foot${S}`, `shin${S}`, 0, -0.41, -0.014);
  }
  const c = J.head.clone().add(new THREE.Vector3(...HEAD_C));
  const hc = (n, x, y, z) => { J[n] = c.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(HEAD_SCALE)); };
  const F = FACE;
  hc('jaw', 0, -0.026, -0.012);
  hc('lipUpper', 0, F.mouthY + 0.007, 0.092);
  hc('mouthL', F.mouthHalfW, F.mouthY, 0.084);
  hc('mouthR', -F.mouthHalfW, F.mouthY, 0.084);
  hc('browL', 0.034, F.browY, 0.09);
  hc('browR', -0.034, F.browY, 0.09);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    hc(`eye${S}`, s * F.eyeX, F.eyeY, F.eyeZ);
    hc(`lidUp${S}`, s * F.eyeX, F.eyeY, F.eyeZ);
    hc(`lidLo${S}`, s * F.eyeX, F.eyeY, F.eyeZ);
  }
  J.headCenter = c;
  return J;
}

/* ------------------------------------------------------------ poses */

const v3 = (x = 0, y = 0, z = 0) => [x, y, z];

/** A full pose object: every body bone at zero, hands relaxed. */
export function emptyPose() {
  const p = {};
  for (const n of BODY_BONES) p[n] = v3();
  p.hipsPos = v3();
  p.gripL = 0.25;
  p.gripR = 0.25;
  p.pointL = 0;
  p.pointR = 0;
  return p;
}

function copyInto(out, src) {
  for (const n of BODY_BONES) {
    const a = src[n] || [0, 0, 0];
    const o = out[n] || (out[n] = [0, 0, 0]);
    o[0] = a[0];
    o[1] = a[1];
    o[2] = a[2];
  }
  const h = src.hipsPos || [0, 0, 0];
  out.hipsPos = [h[0], h[1], h[2]];
  out.gripL = src.gripL ?? 0.25;
  out.gripR = src.gripR ?? 0.25;
  out.pointL = src.pointL ?? 0;
  out.pointR = src.pointR ?? 0;
  return out;
}

/** Linear mix of two pose objects (Euler channels, hips offset, hands). */
export function mixPoses(a, b, k, out = emptyPose()) {
  for (const n of BODY_BONES) {
    const pa = a[n] || [0, 0, 0];
    const pb = b[n] || [0, 0, 0];
    const o = out[n] || (out[n] = [0, 0, 0]);
    for (let i = 0; i < 3; i++) o[i] = pa[i] + (pb[i] - pa[i]) * k;
  }
  const ha = a.hipsPos || [0, 0, 0];
  const hb = b.hipsPos || [0, 0, 0];
  out.hipsPos = [0, 1, 2].map((i) => ha[i] + (hb[i] - ha[i]) * k);
  for (const f of ['gripL', 'gripR', 'pointL', 'pointR']) {
    const fa = a[f] ?? (f.startsWith('grip') ? 0.25 : 0);
    const fb = b[f] ?? (f.startsWith('grip') ? 0.25 : 0);
    out[f] = fa + (fb - fa) * k;
  }
  return out;
}

/** Mirror a pose left↔right (handy for authoring one-sided gestures). */
export function mirrorPose(p, out = emptyPose()) {
  const src = copyInto(emptyPose(), p);
  for (const n of BODY_BONES) {
    const m = n.endsWith('L') ? `${n.slice(0, -1)}R` : n.endsWith('R') ? `${n.slice(0, -1)}L` : n;
    const a = src[m];
    out[n] = [a[0], -a[1], -a[2]];
  }
  out.hipsPos = [-src.hipsPos[0], src.hipsPos[1], src.hipsPos[2]];
  out.gripL = src.gripR;
  out.gripR = src.gripL;
  out.pointL = src.pointR;
  out.pointR = src.pointL;
  return out;
}

const STAND = {
  spine: v3(0.02, 0, 0), chest: v3(-0.02, 0, 0), neck: v3(0.04, 0, 0), head: v3(-0.03, 0, 0),
  shoulderL: v3(0, 0, -0.03), shoulderR: v3(0, 0, 0.03),
  upperArmL: v3(0.04, 0.12, 0.1), upperArmR: v3(0.04, -0.12, -0.1),
  forearmL: v3(-0.22, 0, 0), forearmR: v3(-0.22, 0, 0),
  handL: v3(-0.05, 0, -0.1), handR: v3(-0.05, 0, 0.1),
  thighL: v3(0, 0.06, 0.035), thighR: v3(0, -0.06, -0.035),
  shinL: v3(0.04, 0, 0), shinR: v3(0.04, 0, 0),
  footL: v3(-0.04, 0.1, -0.035), footR: v3(-0.04, -0.1, 0.035),
  gripL: 0.12, gripR: 0.12
};

/** Seated on a chair whose seat is SEAT_HEIGHT above the floor. */
export const SEAT_HEIGHT = 0.46;
/** How far behind the root (−Z) the seat's centre is when sitting. */
export const SEAT_BACK = 0.04;
const SIT = {
  hipsPos: v3(0, -0.385, -0.02),
  hips: v3(-0.08, 0, 0), spine: v3(0.06, 0, 0), chest: v3(0.08, 0, 0), neck: v3(0.02, 0, 0), head: v3(-0.06, 0, 0),
  // Arm angles below were solved with the IK so the hands rest on the knees
  upperArmL: v3(-0.11, -0.62, 0.25), upperArmR: v3(-0.11, 0.62, -0.25),
  forearmL: v3(-1.2, 0, 0), forearmR: v3(-1.2, 0, 0),
  handL: v3(0.9, -0.86, 0.77), handR: v3(0.9, 0.86, -0.77),
  thighL: v3(-1.48, 0.08, 0.05), thighR: v3(-1.48, -0.08, -0.05),
  shinL: v3(1.5, 0, 0), shinR: v3(1.5, 0, 0),
  footL: v3(0.06, 0.08, 0), footR: v3(0.06, -0.08, 0),
  gripL: 0.42, gripR: 0.42
};

const READY = {
  hipsPos: v3(0, -0.085, -0.03),
  hips: v3(-0.12, 0, 0), spine: v3(0.2, 0, 0), chest: v3(0.12, 0, 0), neck: v3(-0.12, 0, 0), head: v3(-0.18, 0, 0),
  shoulderL: v3(0, 0.08, 0), shoulderR: v3(0, -0.08, 0),
  upperArmL: v3(-0.24, -0.54, 0.43), upperArmR: v3(-0.24, 0.54, -0.43),
  forearmL: v3(-1.24, 0, 0), forearmR: v3(-1.24, 0, 0),
  handL: v3(-0.14, -0.32, 0.4), handR: v3(-0.14, 0.32, -0.4),
  thighL: v3(-0.62, 0.22, 0.2), thighR: v3(-0.62, -0.22, -0.2),
  shinL: v3(0.95, 0, -0.02), shinR: v3(0.95, 0, 0.02),
  footL: v3(-0.22, 0.1, -0.2), footR: v3(-0.22, -0.1, 0.2),
  gripL: 0.55, gripR: 0.55
};

const CHEER = {
  spine: v3(-0.06, 0, 0), chest: v3(-0.08, 0, 0), neck: v3(-0.06, 0, 0), head: v3(-0.2, 0, 0),
  shoulderL: v3(0, 0, 0.22), shoulderR: v3(0, 0, -0.22),
  upperArmL: v3(0.1, -0.1, 2.82), upperArmR: v3(0.1, 0.1, -2.82),
  forearmL: v3(-0.05, 0, 0), forearmR: v3(-0.05, 0, 0),
  handL: v3(0, 0, 0), handR: v3(0, 0, 0),
  thighL: STAND.thighL, thighR: STAND.thighR, shinL: STAND.shinL, shinR: STAND.shinR,
  footL: STAND.footL, footR: STAND.footR,
  gripL: 1, gripR: 1
};

const HIPS_ON_HANDS = {
  ...STAND,
  chest: v3(-0.05, 0, 0), head: v3(-0.06, 0, 0),
  upperArmL: v3(1.14, -0.51, 0.73), upperArmR: v3(1.14, 0.51, -0.73),
  forearmL: v3(-1.61, 0, 0), forearmR: v3(-1.61, 0, 0),
  handL: v3(-0.53, 0.3, 0.82), handR: v3(-0.53, -0.3, -0.82),
  thighL: v3(0, 0.1, 0.09), thighR: v3(0, -0.1, -0.09),
  footL: v3(-0.04, 0.16, -0.09), footR: v3(-0.04, -0.16, 0.09),
  gripL: 0.15, gripR: 0.15
};

const ARMS_CROSSED = {
  ...STAND,
  chest: v3(-0.04, 0, 0), head: v3(-0.05, 0, 0),
  upperArmL: v3(-0.32, -0.95, 0.2), upperArmR: v3(-0.4, 0.95, -0.17),
  forearmL: v3(-1.95, 0, 0), forearmR: v3(-1.85, 0, 0),
  handL: v3(0, 0, -0.1), handR: v3(0, 0, 0.1),
  gripL: 0.5, gripR: 0.5
};

const POINT = {
  ...STAND,
  chest: v3(0, -0.22, 0), head: v3(-0.03, 0.15, 0), neck: v3(0.02, 0.05, 0),
  upperArmR: v3(-1.58, 0.9, -0.04), forearmR: v3(-0.03, 0, 0), handR: v3(0.06, -0.22, -0.08),
  gripR: 1, pointR: 1
};

function fill(out, src) {
  return copyInto(out || emptyPose(), src);
}

/* ------------------------------------------------------------ gait */

/** Leg geometry of the 1.80 m model (metres). */
const LEG = { L1: 0.415, L2: 0.41, hipX: 0.088, hipY: -0.045, hipZ: -0.014, ankleY: 0.08, footX: 0.096 };
const HEEL = [0.08, 0.055];
const BALL = [0.08, -0.12];

/** Walk styles: stride (m per cycle), arm swing, foot lift, trunk lean, elbow bend, pelvis turn. */
const WALK_STYLES = {
  stroll: { stride: 1.05, swing: 0.17, lift: 0.045, lean: 0.015, elbow: 0.24, pelvis: 0.05, toe: 0.55 },
  walk: { stride: 1.3, swing: 0.27, lift: 0.06, lean: 0.035, elbow: 0.32, pelvis: 0.07, toe: 0.62 },
  brisk: { stride: 1.6, swing: 0.42, lift: 0.075, lean: 0.07, elbow: 0.85, pelvis: 0.1, toe: 0.7 }
};
/** Metres the root travels per walk cycle (two steps) at 1.80 m, per style. */
export const WALK_STRIDES = { stroll: WALK_STYLES.stroll.stride, walk: WALK_STYLES.walk.stride, brisk: WALK_STYLES.brisk.stride };

function walkStyle(style) {
  if (typeof style === 'string') return WALK_STYLES[style] || WALK_STYLES.walk;
  const k = Math.max(0, Math.min(1, typeof style === 'number' ? style : 0.5));
  const [a, b, m] = k < 0.5 ? [WALK_STYLES.stroll, WALK_STYLES.walk, k * 2] : [WALK_STYLES.walk, WALK_STYLES.brisk, k * 2 - 1];
  const o = {};
  for (const key of Object.keys(a)) o[key] = a[key] + (b[key] - a[key]) * m;
  return o;
}

/** Periodic Catmull-Rom through keys [[u, v], ...] (u in 0..1, first and last equal). */
function loopCurve(keys) {
  const n = keys.length - 1;
  return (u) => {
    const x = u - Math.floor(u);
    let i = 0;
    while (i < n - 1 && keys[i + 1][0] <= x) i++;
    const k = (j) => keys[((j % n) + n) % n];
    const p0 = k(i - 1)[1];
    const p1 = keys[i][1];
    const p2 = keys[i + 1][1];
    const p3 = k(i + 2)[1];
    const t = (x - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
    const t2 = t * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t2 * t);
  };
}
/** Foot pitch to the ground (x+ toes down) over the gait phase of one leg: heel strike at 0. */
const FOOT_PITCH = loopCurve([[0, -0.26], [0.1, 0], [0.4, 0], [0.52, 0.3], [0.62, 0.62], [0.72, 0.3], [0.85, -0.04], [0.95, -0.22], [1, -0.26]]);

const _hq = new THREE.Quaternion();
const _he = new THREE.Euler();
const _hv = new THREE.Vector3();
const _hd = new THREE.Vector3();

/** Hip joint (thigh bone origin) in the root frame for a hips pose. */
function hipJoint(p, side, out) {
  _hq.setFromEuler(_he.set(p.hips[0], p.hips[1], p.hips[2]));
  out.set(side * LEG.hipX, LEG.hipY, LEG.hipZ).applyQuaternion(_hq);
  return out.add(_hv.set(p.hipsPos[0], 0.95 + p.hipsPos[1], p.hipsPos[2]));
}

/**
 * Two-bone leg IK in the sagittal plane, written into the pose: the ankle
 * goes to `ankle` (root frame, metres at 1.80 m) and the foot takes the
 * ground pitch `g` (x+ toes down) and toe-out `toeOut`.
 */
function legTo(p, side, ankle, g, toeOut = 0) {
  const S = side > 0 ? 'L' : 'R';
  const hj = hipJoint(p, side, _hd);
  _hq.setFromEuler(_he.set(p.hips[0], p.hips[1], p.hips[2])).invert();
  const d = hj.sub(ankle).negate().applyQuaternion(_hq);
  const { L1, L2 } = LEG;
  const L = Math.min(Math.max(d.length(), 0.25), L1 + L2 - 1e-4);
  const cosK = Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - L * L) / (2 * L1 * L2)));
  const knee = Math.PI - Math.acos(cosK);
  const alpha = Math.atan2(d.z, -d.y);
  const beta = Math.asin(Math.max(-1, Math.min(1, (L2 * Math.sin(knee)) / L)));
  const thighX = -(alpha + beta);
  p[`thigh${S}`] = [thighX, -p.hips[1] * 0.85 + side * toeOut * 0.5, Math.asin(Math.max(-1, Math.min(1, d.x / L)))];
  p[`shin${S}`] = [knee, 0, 0];
  p[`foot${S}`] = [g - (p.hips[0] + thighX + knee), side * toeOut * 0.5, 0];
}

/** Highest hip-joint height at which a leg still reaches `ankle` with the knee bent `kMin`. */
function reachHeight(p, side, ankle, kMin) {
  const hj = hipJoint(p, side, _hd);
  const { L1, L2 } = LEG;
  const Lmax = Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(kMin));
  const dx = ankle.x - hj.x;
  const dz = ankle.z - hj.z;
  return ankle.y + Math.sqrt(Math.max(0.01, Lmax * Lmax - dx * dx - dz * dz)) - (hj.y - (0.95 + p.hipsPos[1]));
}
const softMin = (a, b, k = 0.006) => -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k));

/** The ankle (root frame) of a leg at gait phase u (0 = heel strike). */
function gaitAnkle(u, st, side, out) {
  const F0 = st.stride * 0.31;
  const TO = st.toe;
  const x = side * LEG.footX;
  const at = (uu) => {
    const g = FOOT_PITCH(uu);
    const c = Math.cos(g);
    const s = Math.sin(g);
    if (uu < 0.1) {
      // Rolling over the heel
      const hz = F0 - HEEL[1] - st.stride * uu;
      return [HEEL[0] * c - HEEL[1] * s, hz + HEEL[0] * s + HEEL[1] * c, g];
    }
    if (uu < 0.4) return [LEG.ankleY, F0 - st.stride * uu, 0];
    // Rolling over the ball of the foot
    const bz = F0 - BALL[1] - st.stride * uu;
    return [BALL[0] * c - BALL[1] * s, bz + BALL[0] * s + BALL[1] * c, g];
  };
  if (u < TO) {
    const [y, z, g] = at(u);
    out.set(x, y, z);
    return g;
  }
  // Swing: from toe-off to the next heel strike, lifted over the ground
  const s = (u - TO) / (1 - TO);
  const [y0, z0] = at(TO);
  const [y1, z1] = at(0);
  const e = s * s * (3 - 2 * s);
  const ez = Math.min(1, e * 1.08 - 0.04 * Math.sin(Math.PI * s));
  out.set(x, y0 + (y1 - y0) * s + st.lift * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.1)), 1.3), z0 + (z1 + st.stride * 1 - z0) * ez - st.stride * 0);
  // z1 is the heel-strike ankle of the NEXT cycle relative to the root at that time: same value
  out.z = z0 + (z1 - z0) * ez;
  return FOOT_PITCH(u);
}

const _al = new THREE.Vector3();
const _ar = new THREE.Vector3();

/**
 * A walk with heel strike, roll over the foot and toe-off (leg IK, so the
 * planted foot stays put while the root moves WALK_STRIDES[style] ×
 * height/1.8 per 2π of phase), pelvis turn, tilt and side shift, a
 * vertical bob from the legs, counter-rotating shoulders, arms swinging
 * with a bent elbow and a steadied head. style: 'stroll' | 'walk' |
 * 'brisk' or 0..1 (stroll → brisk).
 */
function walkCycle(phase, out, style) {
  const st = walkStyle(style);
  const p = fill(out, STAND);
  const ph = phase;
  const c = Math.cos(ph);
  const s = Math.sin(ph);
  // Pelvis: turns with the leading leg, drops on the swing side, shifts over the stance foot
  p.hips = v3(0.02 + st.lean * 0.3, -st.pelvis * c, 0.038 * s);
  p.hipsPos = v3(0.016 * s, 0, 0);
  const uL = ph / (Math.PI * 2);
  const uR = uL + 0.5;
  const fl = (u) => u - Math.floor(u);
  const gL = gaitAnkle(fl(uL), st, 1, _al);
  const gR = gaitAnkle(fl(uR), st, -1, _ar);
  // Hip height: as high as the stance legs allow (soft knees), never above standing
  const stanceL = fl(uL) < st.toe;
  const stanceR = fl(uR) < st.toe;
  let H = 0.905 - 0.012 - st.lean * 0.1;
  if (stanceL) H = softMin(H, reachHeight(p, 1, _al, 0.1));
  if (stanceR) H = softMin(H, reachHeight(p, -1, _ar, 0.1));
  p.hipsPos[1] = H - 0.905 + 0.004;
  legTo(p, 1, _al, gL, 0.05);
  legTo(p, -1, _ar, gR, 0.05);
  // Trunk: counter-rotates against the pelvis, leans with speed, stays upright over the tilt
  const twist = (st.pelvis + 0.06) * c;
  p.spine = v3(0.02 + st.lean * 0.6, twist * 0.4, -p.hips[2] * 0.7);
  p.chest = v3(-0.02 + st.lean * 0.4, twist * 0.6, -p.hips[2] * 0.25);
  // Head: steadied in the world (cancel the chest's turn and tilt, keep the eyes level)
  const chestYaw = p.hips[1] + p.spine[1] + p.chest[1];
  const roll = p.hips[2] + p.spine[2] + p.chest[2];
  p.neck = v3(0.04 - st.lean * 0.5, -chestYaw * 0.4, -roll * 0.4);
  p.head = v3(-0.03 - st.lean * 0.5 + 0.01 * Math.cos(2 * ph), -chestYaw * 0.6, -roll * 0.6);
  // Arms: counter-swing, lagging the legs a little; the elbow bends as the arm comes forward
  const lag = 0.28;
  const aL = Math.cos(ph - lag);
  const sw = st.swing;
  p.upperArmL = v3(0.04 + sw * aL, 0.12, 0.1 + 0.03 * st.elbow);
  p.upperArmR = v3(0.04 - sw * aL, -0.12, -0.1 - 0.03 * st.elbow);
  p.forearmL = v3(-(st.elbow + 0.28 * (1 - aL) * 0.5 + 0.06), 0, 0);
  p.forearmR = v3(-(st.elbow + 0.28 * (1 + aL) * 0.5 + 0.06), 0, 0);
  p.handL = v3(-0.05 + 0.06 * Math.sin(ph - lag - 0.6), 0, -0.1);
  p.handR = v3(-0.05 - 0.06 * Math.sin(ph - lag - 0.6), 0, 0.1);
  p.shoulderL = v3(0, -0.05 * aL * sw * 3, -0.03);
  p.shoulderR = v3(0, -0.05 * aL * sw * 3, 0.03);
  p.gripL = 0.2;
  p.gripR = 0.2;
  return p;
}

/* ------------------------------------------------------------ idle */

const hash1 = (a, b) => {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const bump = (x, w) => (x <= 0 || x >= w ? 0 : Math.sin((x / w) * Math.PI) ** 2);

/**
 * Standing idle, seeded per person: contrapposto weight shifts every few
 * seconds (feet planted, the free knee soft), sway, breathing arms and an
 * occasional fidget (a look round, a shoulder roll, a hand rub, rising
 * onto the toes). Pass person.look.seed so a group never moves in unison.
 */
function idleCycle(t, out, seed = 0) {
  const p = fill(out, STAND);
  const sd = seed | 0;
  const r0 = hash1(sd, 1);
  const seg = 6 + r0 * 4;
  const tt = t + hash1(sd, 2) * 37;
  const k = Math.floor(tt / seg);
  const local = tt - k * seg;
  const side = (i) => (hash1(sd, i * 7 + 3) < 0.5 ? -1 : 1) * (0.65 + 0.35 * hash1(sd, i * 7 + 4));
  const shiftT = 1.5 + 0.6 * hash1(sd, k * 7 + 5);
  const m = smooth01(local / shiftT);
  const w = side(k - 1) + (side(k) - side(k - 1)) * m;
  const lift = side(k) * side(k - 1) < 0 ? Math.sin(Math.PI * Math.min(1, local / shiftT)) : 0;
  // Pelvis over the stance leg, its hip up; trunk and shoulders counter it, head level
  const sway = Math.sin(tt * 0.6 + r0 * 6) * 0.004;
  p.hips = v3(0.01, 0.05 * w, 0.045 * w);
  p.hipsPos = v3(0.03 * w + sway, 0, 0.004 * Math.sin(tt * 0.37));
  p.spine = v3(0.02, -0.02 * w, -0.035 * w + sway * 2);
  p.chest = v3(-0.02 + 0.006 * Math.sin(tt * 1.3), -0.035 * w, -0.025 * w);
  const roll = p.hips[2] + p.spine[2] + p.chest[2];
  const yaw = p.hips[1] + p.spine[1] + p.chest[1];
  p.neck = v3(0.04, -yaw * 0.4, -roll * 0.4);
  p.head = v3(-0.03, -yaw * 0.6 + Math.sin(tt * 0.29 + r0 * 3) * 0.06, -roll * 0.6);
  // Feet: the stance foot under the hip, the free foot a little forward and out, heel soft
  const wl = Math.max(0, w);
  const wr = Math.max(0, -w);
  const fL = _al.set(LEG.footX + 0.018 * wr, LEG.ankleY + 0.012 * wr + (w > 0 ? 0 : 0.02 * lift), 0.012 + 0.07 * wr);
  const fR = _ar.set(-LEG.footX - 0.018 * wl, LEG.ankleY + 0.012 * wl + (w < 0 ? 0 : 0.02 * lift), 0.012 + 0.07 * wl);
  let H = 0.905 - 0.004;
  H = softMin(H, reachHeight(p, 1, fL, 0.05 + 0.25 * wr), 0.004);
  H = softMin(H, reachHeight(p, -1, fR, 0.05 + 0.25 * wl), 0.004);
  p.hipsPos[1] = H - 0.905 + 0.002;
  legTo(p, 1, fL, 0.12 * wr, 0.08 + 0.06 * wr);
  legTo(p, -1, fR, 0.12 * wl, 0.08 + 0.06 * wl);
  // Arms hang and breathe; the free-leg side swings a touch forward
  p.upperArmL[0] += Math.sin(tt * 0.9) * 0.025 - 0.04 * wr;
  p.upperArmR[0] += Math.sin(tt * 0.9 + 1.3) * 0.025 - 0.04 * wl;
  // An occasional fidget, its kind and moment picked per segment
  const kind = Math.floor(hash1(sd, k * 7 + 6) * 6);
  const at = shiftT + 0.5 + hash1(sd, k * 7 + 8) * Math.max(0.2, seg - shiftT - 2.6);
  const f = bump(local - at, 2.0);
  if (f > 0) {
    if (kind === 0) {
      // Look round
      p.head[1] += 0.45 * f * (hash1(sd, k) < 0.5 ? -1 : 1);
      p.neck[1] += 0.15 * f * (hash1(sd, k) < 0.5 ? -1 : 1);
    } else if (kind === 1) {
      // Shoulder roll
      p.shoulderL[2] += 0.12 * f;
      p.shoulderR[2] -= 0.12 * f;
      p.chest[0] -= 0.05 * f;
      p.head[0] -= 0.05 * f;
    } else if (kind === 2) {
      // Rub the hands in front
      p.upperArmL = v3(-0.2 * f + 0.04, 0.12 - 0.5 * f, 0.1 + 0.15 * f);
      p.upperArmR = v3(-0.2 * f + 0.04, -0.12 + 0.5 * f, -0.1 - 0.15 * f);
      p.forearmL = v3(-0.22 - 1.1 * f, 0, 0);
      p.forearmR = v3(-0.22 - 1.1 * f, 0, 0);
      p.handL = v3(-0.05, 0.3 * f, -0.1 + 0.3 * f + 0.08 * Math.sin(t * 9) * f);
      p.handR = v3(-0.05, -0.3 * f, 0.1 - 0.3 * f - 0.08 * Math.sin(t * 9) * f);
    } else if (kind === 3) {
      // Up onto the toes and down
      p.hipsPos[1] += 0.025 * f;
      for (const S of ['L', 'R']) p[`foot${S}`][0] += 0.3 * f;
      p.head[0] -= 0.04 * f;
    }
  }
  return p;
}


/**
 * The pose library. Every entry is a function `(t, out?) → pose`; `t` is
 * the animation clock (seconds) or the phase for cyclic poses, and `out`
 * lets per-frame callers reuse one object.
 */
export const POSES = {
  /** Standing at ease. */
  stand: (t, out) => fill(out, STAND),
  /** Standing idle: seeded contrapposto weight shifts, sway, fidgets (pass person.look.seed). */
  idle: (t = 0, out, seed = 0) => idleCycle(t, out, seed),
  /** Seated, hands on the knees. */
  sit: (t, out) => fill(out, SIT),
  /** Seated with a coffee cup in the right hand (attach the cup to `gripR`). */
  sitCup(t = 0, out) {
    const p = fill(out, SIT);
    const sip = Math.max(0, Math.sin(t * 0.4)) ** 4;
    p.upperArmR = v3(-0.68 - sip * 0.25, 0.49, -0.74 + sip * 0.2);
    p.forearmR = v3(-2.04 - sip * 0.25, 0, 0);
    p.handR = v3(1.36, -0.85, 1.09);
    p.head[0] -= sip * 0.15;
    p.gripR = 0.85;
    return p;
  },
  /** Seated, both hands holding a fishing rod (attach the rod to `gripR`). */
  sitRod(t = 0, out) {
    const p = fill(out, SIT);
    p.spine[0] = 0.1;
    p.upperArmR = v3(-0.21, 0.71, -0.3);
    p.forearmR = v3(-1.06, 0, 0);
    p.handR = v3(0.74, -0.76, 0.74);
    p.upperArmL = v3(-1.4, -0.65, -0.29);
    p.forearmL = v3(-0.03, 0, 0);
    p.handL = v3(0.77, 0.67, -0.97);
    p.gripR = 1;
    p.gripL = 0.9;
    p.head[0] = -0.05 + Math.sin(t * 0.5) * 0.03;
    return p;
  },
  /** Arms up in a V, fists clenched. */
  cheer(t = 0, out) {
    const p = fill(out, CHEER);
    const w = Math.sin(t * 9);
    p.upperArmL[2] -= Math.abs(w) * 0.1;
    p.upperArmR[2] += Math.abs(w) * 0.1;
    p.hipsPos[1] = Math.abs(Math.sin(t * 4.5)) * 0.03;
    return p;
  },
  /** Applause, animated by t (seconds). */
  clap(t = 0, out) {
    const p = fill(out, STAND);
    // Solved with the IK: palms meet in front of the chest at k = 1
    const ph = (t * 2.3) % 1;
    const k = ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI * 0.5) : Math.cos(((ph - 0.35) / 0.65) * Math.PI * 0.5);
    const mix = (a, b) => a + (b - a) * k;
    p.chest = v3(0.02, 0, 0);
    p.upperArmL = v3(mix(0.02, -0.21), mix(-0.46, -0.75), mix(0.58, 0.3));
    p.upperArmR = v3(mix(0.02, -0.21), mix(0.46, 0.75), mix(-0.58, -0.3));
    p.forearmL = v3(mix(-1.68, -1.43), 0, 0);
    p.forearmR = v3(mix(-1.68, -1.43), 0, 0);
    p.handL = v3(mix(-0.47, -0.41), mix(0.18, 0.01), mix(0.48, 0.78));
    p.handR = v3(mix(-0.47, -0.41), mix(-0.18, -0.01), mix(-0.48, -0.78));
    p.gripL = 0.08;
    p.gripR = 0.08;
    return p;
  },
  /** Seated applause. */
  sitClap(t = 0, out) {
    const p = POSES.clap(t, out);
    const s = SIT;
    for (const n of ['hips', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR']) p[n] = s[n].slice();
    p.hipsPos = s.hipsPos.slice();
    p.spine = v3(0.04, 0, 0);
    return p;
  },
  /** One fist punched up (right), the other pumping at the chest. */
  fistPump(t = 0, out) {
    const p = fill(out, CHEER);
    const w = Math.max(0, Math.sin(t * 7));
    p.upperArmR = v3(0.12, 0.2, -2.9 + w * 0.15);
    p.forearmR = v3(-0.08 - w * 0.25, 0, 0);
    p.upperArmL = v3(-0.55 - w * 0.2, -0.45, 0.35);
    p.forearmL = v3(-2.0, 0, 0);
    p.handL = v3(0, 0, -0.2);
    p.shoulderL = v3(0, 0, 0.05);
    p.chest = v3(-0.04, 0.1, 0.04);
    return p;
  },
  /** Seated fist pump. */
  sitFistPump(t = 0, out) {
    const p = POSES.fistPump(t, out);
    for (const n of ['hips', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR']) p[n] = SIT[n].slice();
    p.hipsPos = SIT.hipsPos.slice();
    return p;
  },
  /** Seated, arms up. */
  sitCheer(t = 0, out) {
    const p = POSES.cheer(t, out);
    for (const n of ['hips', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR']) p[n] = SIT[n].slice();
    p.hipsPos = SIT.hipsPos.slice();
    p.hipsPos[1] += Math.abs(Math.sin(t * 4.5)) * 0.02;
    return p;
  },
  /** Pointing ahead with the right index finger (mirrorPose for the left). */
  point: (t, out) => fill(out, POINT),
  handsOnHips: (t, out) => fill(out, HIPS_ON_HANDS),
  armsCrossed: (t, out) => fill(out, ARMS_CROSSED),
  /** Athletic ready stance: knees bent, weight forward, hands up. */
  ready(t = 0, out) {
    const p = fill(out, READY);
    const b = Math.sin(t * 5.2);
    p.hipsPos[1] += b * 0.008;
    p.shinL[0] += b * 0.03;
    p.shinR[0] += b * 0.03;
    return p;
  },
  /** Explaining: right hand out, palm up, beating with the words. */
  explain(t = 0, out) {
    const p = fill(out, STAND);
    const b = Math.sin(t * 3.1) * 0.5 + Math.sin(t * 5.3) * 0.2;
    p.upperArmR = v3(-0.04 - b * 0.12, 0.42, -0.45);
    p.forearmR = v3(-1.15 + b * 0.15, 0, 0);
    p.handR = v3(-1.62, -0.78, -1.52);
    p.gripR = 0.12;
    p.head = v3(0.02 + b * 0.04, 0.05, -0.04 * b);
    p.chest = v3(-0.02, -0.06, 0);
    return p;
  },
  /** Holding something open in the left hand at chest height (a notebook). */
  holdNotebook(t = 0, out) {
    const p = fill(out, STAND);
    p.upperArmL = v3(0.05, -0.68, 0.3);
    p.forearmL = v3(-1.36, 0, 0);
    p.handL = v3(-0.8, 0.9, 0.67);
    p.upperArmR = v3(-0.19, 0.46, -0.41);
    p.forearmR = v3(-1.34, 0, 0);
    p.handR = v3(1.27, 0.07, 1.36);
    p.gripL = 0.35;
    p.gripR = 0.85;
    p.head = v3(0.25 + Math.sin(t * 0.8) * 0.03, 0.08, 0);
    return p;
  },
  /**
   * Walk cycle. `phase` advances 2π per full cycle (two steps). The root
   * should move WALK_STRIDES[style] × height/1.8 metres per cycle
   * (WALK_STRIDE for the default 'walk'). style: 'stroll' | 'walk' | 'brisk' | 0..1.
   */
  walk: (phase = 0, out, style = 'walk') => walkCycle(phase, out, style),
  /** A slow, relaxed walk (WALK_STRIDES.stroll per cycle). */
  stroll: (phase = 0, out) => walkCycle(phase, out, 'stroll'),
  /** A brisk, purposeful walk (WALK_STRIDES.brisk per cycle). */
  brisk: (phase = 0, out) => walkCycle(phase, out, 'brisk')
};
/** Metres the root travels per walk cycle (two steps) at 1.80 m. */
export const WALK_STRIDE = 1.3;

/* ------------------------------------------------------------ applying */

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

/**
 * Write a pose into the bones. `blend` (0..1) slerps from the current
 * rotations; 1 snaps. `restPos` holds the bind positions (for hipsPos).
 */
const _cfg = new Float32Array(HAND_BONE_COUNT * 4);

export function applyPose(bones, pose, blend, restPos, scale, skipHands) {
  const k = blend === undefined ? 1 : blend;
  for (const n of BODY_BONES) {
    const r = pose[n];
    const b = bones[n];
    if (!b) continue;
    if (r) _e.set(r[0], r[1], r[2]);
    else _e.set(0, 0, 0);
    _q.setFromEuler(_e);
    if (k >= 1) b.quaternion.copy(_q);
    else b.quaternion.slerp(_q, k);
  }
  const h = pose.hipsPos || [0, 0, 0];
  const rp = restPos.hips;
  const tx = rp.x + h[0] * scale;
  const ty = rp.y + h[1] * scale;
  const tz = rp.z + h[2] * scale;
  const hp = bones.hips.position;
  if (k >= 1) hp.set(tx, ty, tz);
  else hp.set(hp.x + (tx - hp.x) * k, hp.y + (ty - hp.y) * k, hp.z + (tz - hp.z) * k);
  // Fingers: the legacy grip/point amounts become a hand config (people-hands.js).
  // `skipHands` = { L, R }: sides whose fingers a grip override drives instead.
  for (const S of ['L', 'R']) {
    if (skipHands && skipHands[S]) continue;
    const grip = S === 'L' ? pose.gripL ?? 0.25 : pose.gripR ?? 0.25;
    const point = S === 'L' ? pose.pointL ?? 0 : pose.pointR ?? 0;
    writeConfig(bones, S, legacyConfig(grip, point, _cfg), k);
  }
}

/* ------------------------------------------------------------ IK */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qh = new THREE.Quaternion();

function frameQuat(xAxis, yAxis, out) {
  _z.crossVectors(xAxis, yAxis).normalize();
  _m.makeBasis(xAxis, yAxis, _z);
  return out.setFromRotationMatrix(_m);
}

const _lx = new THREE.Vector3();
const _ly = new THREE.Vector3();
const _ql = new THREE.Quaternion();
/**
 * World rotation for a bone whose child sits at `childLocal` (in the bone's
 * own frame), so that the child lands along −yWorld with the hinge (local
 * +X, kept perpendicular to the child direction) on xWorld.
 */
function boneQuat(xWorld, yWorld, childLocal, out) {
  frameQuat(xWorld, yWorld, out);
  _ly.copy(childLocal).normalize().negate();
  _lx.set(1, 0, 0).addScaledVector(_ly, -_ly.x).normalize();
  frameQuat(_lx, _ly, _ql);
  return out.multiply(_ql.invert());
}

function setWorldQuat(bone, worldQ) {
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(worldQ));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone IK. `upper`/`lower`/`end` are bones (end = hand or foot); the
 * chain hangs along local −Y and hinges about local +X. `sign` is +1 for
 * arms (the elbow points at the pole, the hand comes forward), −1 for legs.
 * The end bone keeps its world orientation unless `endWorldQ` is given.
 * Returns how far the target was out of reach (0 = reached).
 */
export function solveTwoBone(upper, lower, end, target, pole, sign, endWorldQ) {
  upper.parent.updateWorldMatrix(true, false);
  upper.updateMatrixWorld(true);
  if (!endWorldQ) end.getWorldQuaternion(_qh);
  else _qh.copy(endWorldQ);
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b);
  const l2 = _b.distanceTo(_c);
  _d.subVectors(target, _a);
  let dist = _d.length();
  const reach = l1 + l2;
  const miss = Math.max(0, dist - reach);
  dist = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-4, 1e-4), reach * 0.9999);
  if (_d.lengthSq() < 1e-10) _d.set(0, -1, 0);
  _d.normalize();
  // Bend direction: the pole's component perpendicular to the reach line
  _p.subVectors(pole, _a);
  _p.addScaledVector(_d, -_p.dot(_d));
  if (_p.lengthSq() < 1e-8) {
    // Pole on the line: fall back to the upper bone's current local +Z/−Z
    _p.set(0, 0, sign > 0 ? -1 : 1).applyQuaternion(upper.getWorldQuaternion(_qw));
    _p.addScaledVector(_d, -_p.dot(_d));
    if (_p.lengthSq() < 1e-8) _p.set(1, 0, 0);
  }
  _p.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // Elbow/knee position
  _b.copy(_a).addScaledVector(_d, l1 * cosA).addScaledVector(_p, l1 * sinA);
  _t.copy(_a).addScaledVector(_d, dist);
  // Hinge axis, shared by both bones
  _x.crossVectors(_d, _p).multiplyScalar(sign).normalize();
  _y.subVectors(_a, _b).normalize();
  boneQuat(_x, _y, lower.position, _qw);
  setWorldQuat(upper, _qw);
  _y.subVectors(_b, _t).normalize();
  boneQuat(_x, _y, end.position, _qw);
  setWorldQuat(lower, _qw);
  setWorldQuat(end, _qh);
  return miss;
}
