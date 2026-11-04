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

export const A_POSE = 0.7;

/** [name, parent] in creation order — parents always come first. */
export const BONE_DEFS = [
  ['hips', null], ['spine', 'hips'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'],
  ['shoulderL', 'chest'], ['upperArmL', 'shoulderL'], ['forearmL', 'upperArmL'], ['handL', 'forearmL'],
  ['thumbL', 'handL'], ['indexL', 'handL'], ['indexTipL', 'indexL'], ['fingersL', 'handL'], ['fingersTipL', 'fingersL'],
  ['shoulderR', 'chest'], ['upperArmR', 'shoulderR'], ['forearmR', 'upperArmR'], ['handR', 'forearmR'],
  ['thumbR', 'handR'], ['indexR', 'handR'], ['indexTipR', 'indexR'], ['fingersR', 'handR'], ['fingersTipR', 'fingersR'],
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
const FINGER_BONES = ['thumbL', 'indexL', 'indexTipL', 'fingersL', 'fingersTipL',
  'thumbR', 'indexR', 'indexTipR', 'fingersR', 'fingersTipR'];

/** Head centre relative to the head bone, in the 1.80 m model. */
export const HEAD_C = [0, 0.112, 0.02];

/**
 * Joint positions (model space, zero pose) for the 1.80 m model.
 * `w` scales the shoulders, `hw` the hips.
 */
export function jointTable(w = 1, hw = 1) {
  const J = {};
  const set = (n, x, y, z) => { J[n] = new THREE.Vector3(x, y, z); };
  const off = (n, from, x, y, z) => { J[n] = J[from].clone().add(new THREE.Vector3(x, y, z)); };
  set('hips', 0, 0.95, 0);
  set('spine', 0, 1.06, -0.005);
  set('chest', 0, 1.22, -0.012);
  set('neck', 0, 1.462, -0.022);
  set('head', 0, 1.548, -0.01);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    set(`shoulder${S}`, s * 0.028, 1.418, -0.002);
    set(`upperArm${S}`, s * 0.172 * w, 1.425, -0.018);
    off(`forearm${S}`, `upperArm${S}`, 0, -0.288, 0);
    off(`hand${S}`, `forearm${S}`, 0, -0.262, 0.004);
    off(`thumb${S}`, `hand${S}`, -s * 0.009, -0.026, 0.022);
    off(`index${S}`, `hand${S}`, -s * 0.002, -0.094, 0.024);
    off(`indexTip${S}`, `index${S}`, 0, -0.038, 0);
    off(`fingers${S}`, `hand${S}`, -s * 0.002, -0.097, -0.008);
    off(`fingersTip${S}`, `fingers${S}`, 0, -0.04, 0);
    set(`thigh${S}`, s * 0.088 * hw, 0.905, 0);
    off(`shin${S}`, `thigh${S}`, 0, -0.415, 0.004);
    off(`foot${S}`, `shin${S}`, 0, -0.41, -0.014);
  }
  const c = J.head.clone().add(new THREE.Vector3(...HEAD_C));
  const hc = (n, x, y, z) => { J[n] = c.clone().add(new THREE.Vector3(x, y, z)); };
  hc('jaw', 0, -0.032, -0.012);
  hc('lipUpper', 0, -0.075, 0.094);
  hc('mouthL', 0.0235, -0.083, 0.084);
  hc('mouthR', -0.0235, -0.083, 0.084);
  hc('browL', 0.034, 0.031, 0.09);
  hc('browR', -0.034, 0.031, 0.09);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    hc(`eye${S}`, s * 0.0315, 0.002, 0.068);
    hc(`lidUp${S}`, s * 0.0315, 0.002, 0.068);
    hc(`lidLo${S}`, s * 0.0315, 0.002, 0.068);
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
  gripL: 0.3, gripR: 0.3
};

/** Seated on a chair whose seat is SEAT_HEIGHT above the floor. */
export const SEAT_HEIGHT = 0.46;
/** How far behind the root (−Z) the seat's centre is when sitting. */
export const SEAT_BACK = 0.04;
const SIT = {
  hipsPos: v3(0, -0.385, -0.02),
  hips: v3(-0.08, 0, 0), spine: v3(0.06, 0, 0), chest: v3(0.08, 0, 0), neck: v3(0.02, 0, 0), head: v3(-0.06, 0, 0),
  upperArmL: v3(-0.42, 0.18, 0.13), upperArmR: v3(-0.42, -0.18, -0.13),
  forearmL: v3(-0.78, 0.15, 0), forearmR: v3(-0.78, -0.15, 0),
  handL: v3(0.2, 0, -0.45), handR: v3(0.2, 0, 0.45),
  thighL: v3(-1.48, 0.08, 0.05), thighR: v3(-1.48, -0.08, -0.05),
  shinL: v3(1.5, 0, 0), shinR: v3(1.5, 0, 0),
  footL: v3(0.06, 0.08, 0), footR: v3(0.06, -0.08, 0),
  gripL: 0.42, gripR: 0.42
};

const READY = {
  hipsPos: v3(0, -0.085, -0.03),
  hips: v3(-0.12, 0, 0), spine: v3(0.2, 0, 0), chest: v3(0.12, 0, 0), neck: v3(-0.12, 0, 0), head: v3(-0.18, 0, 0),
  shoulderL: v3(0, 0.08, 0), shoulderR: v3(0, -0.08, 0),
  upperArmL: v3(-0.55, 0.2, 0.32), upperArmR: v3(-0.55, -0.2, -0.32),
  forearmL: v3(-1.15, 0.2, 0), forearmR: v3(-1.15, -0.2, 0),
  handL: v3(0.1, 0, -0.15), handR: v3(0.1, 0, 0.15),
  thighL: v3(-0.62, 0.22, 0.2), thighR: v3(-0.62, -0.22, -0.2),
  shinL: v3(0.95, 0, -0.02), shinR: v3(0.95, 0, 0.02),
  footL: v3(-0.22, 0.1, -0.2), footR: v3(-0.22, -0.1, 0.2),
  gripL: 0.55, gripR: 0.55
};

const CHEER = {
  spine: v3(-0.06, 0, 0), chest: v3(-0.08, 0, 0), neck: v3(-0.06, 0, 0), head: v3(-0.2, 0, 0),
  shoulderL: v3(0, 0, 0.22), shoulderR: v3(0, 0, -0.22),
  upperArmL: v3(-0.3, 0.2, 2.55), upperArmR: v3(-0.3, -0.2, -2.55),
  forearmL: v3(-0.35, 0, 0), forearmR: v3(-0.35, 0, 0),
  handL: v3(0, 0, 0), handR: v3(0, 0, 0),
  thighL: STAND.thighL, thighR: STAND.thighR, shinL: STAND.shinL, shinR: STAND.shinR,
  footL: STAND.footL, footR: STAND.footR,
  gripL: 1, gripR: 1
};

const HIPS_ON_HANDS = {
  ...STAND,
  chest: v3(-0.05, 0, 0), head: v3(-0.06, 0, 0),
  upperArmL: v3(0.18, -0.25, 0.62), upperArmR: v3(0.18, 0.25, -0.62),
  forearmL: v3(-1.75, -0.35, 0), forearmR: v3(-1.75, 0.35, 0),
  handL: v3(0.25, -0.3, 0.55), handR: v3(0.25, 0.3, -0.55),
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
  upperArmR: v3(-1.35, -0.2, -0.2), forearmR: v3(-0.12, 0, 0), handR: v3(0.1, 0, 0),
  gripR: 1, pointR: 1
};

function fill(out, src) {
  return copyInto(out || emptyPose(), src);
}

/**
 * The pose library. Every entry is a function `(t, out?) → pose`; `t` is
 * the animation clock (seconds) or the phase for cyclic poses, and `out`
 * lets per-frame callers reuse one object.
 */
export const POSES = {
  /** Standing at ease. */
  stand: (t, out) => fill(out, STAND),
  /** Standing with a little life: weight shift, sway and breathing arms. */
  idle(t = 0, out) {
    const p = fill(out, STAND);
    const s = Math.sin(t * 0.7);
    p.hips[2] += s * 0.025;
    p.hipsPos[0] = s * 0.012;
    p.spine[2] -= s * 0.02;
    p.thighL[2] += s * 0.02;
    p.thighR[2] += s * 0.02;
    p.upperArmL[0] += Math.sin(t * 0.9) * 0.03;
    p.upperArmR[0] += Math.sin(t * 0.9 + 1.3) * 0.03;
    p.head[1] = Math.sin(t * 0.31) * 0.08;
    return p;
  },
  /** Seated, hands on the knees. */
  sit: (t, out) => fill(out, SIT),
  /** Seated with a coffee cup in the right hand (attach the cup to `gripR`). */
  sitCup(t = 0, out) {
    const p = fill(out, SIT);
    p.upperArmR = v3(-0.32, -0.25, -0.18);
    p.forearmR = v3(-1.75 - Math.max(0, Math.sin(t * 0.4)) * 0.25, -0.45, 0);
    p.handR = v3(0.25, 0.1, 0.45);
    p.gripR = 0.85;
    return p;
  },
  /** Seated, both hands holding a fishing rod (attach the rod to `gripR`). */
  sitRod(t = 0, out) {
    const p = fill(out, SIT);
    p.spine[0] = 0.1;
    p.upperArmR = v3(-0.62, -0.32, -0.22);
    p.forearmR = v3(-0.95, -0.35, 0);
    p.handR = v3(0.12, 0.25, 0.55);
    p.upperArmL = v3(-0.7, 0.42, 0.12);
    p.forearmL = v3(-1.05, 0.4, 0);
    p.handL = v3(0.1, -0.2, -0.4);
    p.gripR = 1;
    p.gripL = 0.9;
    p.head[0] = -0.05 + Math.sin(t * 0.5) * 0.03;
    return p;
  },
  /** Arms up in a V, fists clenched. */
  cheer(t = 0, out) {
    const p = fill(out, CHEER);
    const w = Math.sin(t * 9);
    p.upperArmL[2] += w * 0.12;
    p.upperArmR[2] += w * 0.12;
    p.hipsPos[1] = Math.abs(Math.sin(t * 4.5)) * 0.03;
    return p;
  },
  /** Applause, animated by t (seconds). */
  clap(t = 0, out) {
    const p = fill(out, STAND);
    const k = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 2.3);
    p.chest = v3(0.02, 0, 0);
    p.upperArmL = v3(-0.62, -0.5, 0.42 - k * 0.2);
    p.upperArmR = v3(-0.62, 0.5, -0.42 + k * 0.2);
    p.forearmL = v3(-1.35, -0.2 - k * 0.25, 0);
    p.forearmR = v3(-1.35, 0.2 + k * 0.25, 0);
    p.handL = v3(0, -0.2, -0.15);
    p.handR = v3(0, 0.2, 0.15);
    p.gripL = 0.1;
    p.gripR = 0.1;
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
    p.upperArmR = v3(-0.45 - b * 0.1, -0.3, -0.28);
    p.forearmR = v3(-1.15 + b * 0.12, 0.9, 0);
    p.handR = v3(0.2, 0.1, -0.35);
    p.gripR = 0.12;
    p.head = v3(0.02 + b * 0.04, 0.05, -0.04 * b);
    p.chest = v3(-0.02, -0.06, 0);
    return p;
  },
  /** Holding something open in the left hand at chest height (a notebook). */
  holdNotebook(t = 0, out) {
    const p = fill(out, STAND);
    p.upperArmL = v3(-0.3, -0.2, 0.15);
    p.forearmL = v3(-1.55, -0.6, 0);
    p.handL = v3(0.15, 0, 0.35);
    p.upperArmR = v3(-0.3, 0.25, -0.2);
    p.forearmR = v3(-1.5, 0.75, 0);
    p.handR = v3(0, 0, 0.2);
    p.gripL = 0.35;
    p.gripR = 0.85;
    p.head = v3(0.25 + Math.sin(t * 0.8) * 0.03, 0.08, 0);
    return p;
  },
  /**
   * Walk cycle. `phase` advances 2π per full cycle (two steps). The root
   * should move forward WALK_STRIDE × height/1.8 metres per cycle.
   */
  walk(phase = 0, out) {
    const p = fill(out, STAND);
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const swing = 0.42;
    p.thighL = v3(-swing * s, 0.04, 0.02);
    p.thighR = v3(swing * s, -0.04, -0.02);
    // The knee folds while the leg swings through, and stays soft at contact
    const kneeL = 0.12 + Math.max(0, -Math.sin(phase - 0.9)) * 0.95;
    const kneeR = 0.12 + Math.max(0, Math.sin(phase - 0.9)) * 0.95;
    p.shinL = v3(kneeL, 0, 0);
    p.shinR = v3(kneeR, 0, 0);
    p.footL = v3(-0.12 * c + (s > 0 ? -0.1 * s : 0.1 * s), 0.05, 0);
    p.footR = v3(0.12 * c + (s < 0 ? 0.1 * s : -0.1 * s), -0.05, 0);
    p.upperArmL = v3(swing * 0.7 * s + 0.05, 0.1, 0.1);
    p.upperArmR = v3(-swing * 0.7 * s + 0.05, -0.1, -0.1);
    p.forearmL = v3(-0.3 - Math.max(0, -s) * 0.3, 0, 0);
    p.forearmR = v3(-0.3 - Math.max(0, s) * 0.3, 0, 0);
    p.hips = v3(0, -0.12 * s, 0.03 * c);
    p.chest = v3(0.02, 0.16 * s, 0);
    p.head = v3(-0.02, -0.04 * s, 0);
    p.hipsPos = v3(0, -0.018 + Math.abs(c) * 0.018, 0);
    return p;
  }
};
/** Metres the root travels per walk cycle (two steps) at 1.80 m. */
export const WALK_STRIDE = 1.3;

/* ------------------------------------------------------------ applying */

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

/** Finger rotations for a grip/point amount, per side (+1 = L, −1 = R). */
function fingerRot(name, side, grip, point) {
  const s = side;
  const g = Math.max(0, Math.min(1, grip));
  const idx = g * (1 - point);
  switch (name) {
    case 'fingers': return [0, 0, -s * (0.2 + g * 1.45)];
    case 'fingersTip': return [0, 0, -s * (0.25 + g * 1.65)];
    case 'index': return [0, 0, -s * (0.12 + idx * 1.35)];
    case 'indexTip': return [0, 0, -s * (0.18 + idx * 1.55)];
    case 'thumb': return [0.15 + g * 0.35, s * (0.2 + g * 0.55), -s * (0.15 + g * 0.55)];
    default: return [0, 0, 0];
  }
}

/**
 * Write a pose into the bones. `blend` (0..1) slerps from the current
 * rotations; 1 snaps. `restPos` holds the bind positions (for hipsPos).
 */
export function applyPose(bones, pose, blend, restPos, scale) {
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
  for (const fb of FINGER_BONES) {
    const side = fb.endsWith('L') ? 1 : -1;
    const base = fb.slice(0, -1);
    const grip = side > 0 ? pose.gripL ?? 0.25 : pose.gripR ?? 0.25;
    const point = side > 0 ? pose.pointL ?? 0 : pose.pointR ?? 0;
    const r = fingerRot(base, side, grip, point);
    _q.setFromEuler(_e.set(r[0], r[1], r[2]));
    const b = bones[fb];
    if (k >= 1) b.quaternion.copy(_q);
    else b.quaternion.slerp(_q, k);
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
  frameQuat(_x, _y, _qw);
  setWorldQuat(upper, _qw);
  _y.subVectors(_b, _t).normalize();
  frameQuat(_x, _y, _qw);
  setWorldQuat(lower, _qw);
  setWorldQuat(end, _qh);
  return miss;
}
