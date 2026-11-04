/**
 * Pekkas Lerskulptur — keramikern.
 *
 * The studio's ceramicist as a shared people.js character: a linen shirt
 * with rolled sleeves under a slip-streaked apron, a black beret, round
 * glasses and a grey full beard. He is nobody from the thirteen — in
 * Barcelona a real keramiker set the task and judged the results, and that
 * is his job here too:
 *
 *  - when a lump lands he points at it and says what he wants
 *  - while you throw he stands by the kiln with his arms crossed, watching
 *    your hands; a new star earns a nod and a smile, three stars raise his
 *    eyebrows, an off-centre wobble a frown and a shake of the head
 *  - while the piece fires he watches the kiln, hands on hips
 *  - when it comes out he steps up to the banding wheel and leans in, one
 *    hand turning the wheel and a fist under his chin, then gives the
 *    verdict with his whole face: a grin and an arm in the air for 8+, a
 *    nod for decent work, a frown and a slow head shake for a rustic piece
 *    — talking while the card shows his words
 *
 * Posing is the shared pose library plus a few layers of our own,
 * cross-faded with eased weights (so no state change ever snaps), two-bone
 * IK for the hand on the wheel and the fist on the chin, and nods and
 * shakes written on top before people.js adds breathing and look-at.
 */

import * as THREE from 'three';
import { createPerson, POSES, emptyPose, WALK_STRIDE } from '../shared/people.js';

/** The studio is built a touch over life size; he matches its props. */
export const KERAMIKER_HEIGHT = 2.05;

const LOOK = {
  name: 'Keramikern',
  height: KERAMIKER_HEIGHT,
  build: 'average',
  skin: 0xd09a72,
  hair: { style: 'crop', color: 0xa9a49c },
  facialHair: 'fullBeard',
  glasses: 'round',
  glassesColor: 0x1d1b1a,
  eyes: 'brown',
  face: { jaw: 1.03, nose: 1.12, noseLen: 1.08, brow: 1.1, cheek: 1.06, chin: 0.98 },
  outfit: { top: 'apron', topColor: 0xe4dccb, accent: 0x3a5570, bottom: 'trousers', bottomColor: 0x2f3440, shoes: 'leather', shoeColor: 0x3b2618 }
};

/* Upper-body channels a layer may own; legs and hips stay with the base (idle/walk). */
const UPPER = ['spine', 'chest', 'neck', 'head', 'shoulderL', 'upperArmL', 'forearmL', 'handL', 'shoulderR', 'upperArmR', 'forearmR', 'handR'];
const HANDS = ['gripL', 'gripR', 'pointL', 'pointR'];

/** Blend the upper body of `b` into `a` in place by k. */
function mixUpper(a, b, k) {
  if (k <= 1e-4) return;
  for (const n of UPPER) {
    const pa = a[n];
    const pb = b[n];
    pa[0] += (pb[0] - pa[0]) * k;
    pa[1] += (pb[1] - pa[1]) * k;
    pa[2] += (pb[2] - pa[2]) * k;
  }
  for (const h of HANDS) a[h] += ((b[h] ?? (h.startsWith('grip') ? 0.25 : 0)) - a[h]) * k;
}

/** Blend a whole pose (legs included) — for walking. */
function mixAll(a, b, k) {
  if (k <= 1e-4) return;
  for (const n of Object.keys(b)) {
    const pb = b[n];
    const pa = a[n];
    if (Array.isArray(pb) && Array.isArray(pa)) {
      pa[0] += (pb[0] - pa[0]) * k;
      pa[1] += (pb[1] - pa[1]) * k;
      pa[2] += (pb[2] - pa[2]) * k;
    } else if (typeof pb === 'number') a[n] += (pb - a[n]) * k;
  }
}

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0 → 1 → 0 over [a, b] with soft shoulders of width w. */
const window01 = (x, a, b, w = 0.25) => ease((x - a) / w) * ease((b - x) / w);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A soft dark oval under his feet: the room's sun never reaches him, so nothing else grounds him. */
function blobShadow(s) {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x120804,
    alphaMap: tex,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    // A decal a few millimetres over the tiles: pulled forward in depth so it
    // never fights the floor, whatever the depth buffer's precision
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4
  });
  const geo = new THREE.PlaneGeometry(0.95 * s, 0.8 * s);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.006;
  m.renderOrder = 2;
  return { mesh: m, tex };
}

/**
 * His black beret, our own rather than the shared hat (we want it big and
 * soft, pulled down to one side the way a Catalan ceramicist wears it):
 * a felt pancake turned on a lathe, with the little stalk on top.
 */
function buildBeret(s) {
  const k = 1.15 * s; // the head is drawn 1.15× life size
  const prof = [
    [0.082, -0.05], [0.088, -0.047], [0.104, -0.036], [0.122, -0.02], [0.132, -0.006], [0.134, 0.006], [0.126, 0.019],
    [0.106, 0.031], [0.072, 0.04], [0.032, 0.044], [0.0, 0.045]
  ].map(([r, y]) => new THREE.Vector2(r * k, y * k));
  const geo = new THREE.LatheGeometry(prof, 28);
  const stalk = new THREE.CylinderGeometry(0.006 * k, 0.008 * k, 0.018 * k, 6);
  stalk.translate(0, 0.05 * k, 0);
  const felt = new THREE.MeshStandardMaterial({ color: 0x1d1d24, roughness: 0.92 });
  const beret = new THREE.Mesh(geo, felt);
  const nub = new THREE.Mesh(stalk, felt);
  beret.add(nub);
  beret.castShadow = true;
  return beret;
}

/**
 * Slip on the apron: the potter wipes his hands on it all evening. Painted
 * into this person's own vertex colours (the materials stay shared): wherever
 * the apron's blue sits at hand height in front, it is smudged with clay.
 */
function smearApron(person) {
  const geo = person.mesh.geometry;
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const apron = new THREE.Color(LOOK.outfit.accent);
  const clay = new THREE.Color(0x8e5434);
  const c = new THREE.Color();
  const s = person.scale;
  // Blobs in the 1.80 m model's space: two hand wipes at the hips, a drip lower down
  const blobs = [
    [0.1, 0.92, 0.16, 0.07], [-0.12, 0.88, 0.16, 0.06], [0.04, 0.78, 0.17, 0.045], [-0.05, 1.02, 0.15, 0.04], [0.13, 0.7, 0.16, 0.035]
  ];
  for (let i = 0; i < pos.count; i++) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    if (Math.abs(c.r - apron.r) + Math.abs(c.g - apron.g) + Math.abs(c.b - apron.b) > 0.06) continue;
    const x = pos.getX(i) / s;
    const y = pos.getY(i) / s;
    const z = pos.getZ(i) / s;
    let k = 0;
    for (const [bx, by, bz, r] of blobs) {
      const d = Math.hypot(x - bx, (y - by) * 0.7, Math.max(0, bz - z) * 0.5);
      k = Math.max(k, 1 - d / r);
    }
    // A little streaky grain so the smudges are not discs
    k *= 0.75 + 0.25 * Math.sin(x * 140 + y * 37) * Math.sin(y * 90 - x * 23);
    if (k <= 0) continue;
    c.lerp(clay, Math.min(0.85, k * 1.4));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

/* ------------------------------------------------------- our own poses */

/** One arm up, fist clenched and pumping; the other hand stays on the hip. */
function armUp(t, out) {
  const p = POSES.handsOnHips(t, out);
  const pump = Math.sin(t * 7) * 0.12;
  p.shoulderR = [0, 0, -0.24];
  p.upperArmR = [0.1, 0.18, -2.65 + pump * 0.4];
  p.forearmR = [-0.42 - pump, 0, 0];
  p.handR = [0, 0, 0];
  p.gripR = 1;
  p.chest = [-0.06, 0.06, 0.06];
  p.head = [-0.12, 0, 0];
  return p;
}

/** Forearm out, fist forward; the thumb goes up with the hand library's 'thumbsUp' grip. */
function thumbsUp(t, out) {
  const p = POSES.handsOnHips(t, out);
  p.upperArmR = [-0.5, 0.3, -0.2];
  p.forearmR = [-1.3, 0, 0];
  p.handR = [0.1, 0, 0];
  p.gripR = 1;
  p.chest = [-0.03, -0.08, 0];
  return p;
}

/** Shoulders up, forearms out, palms to the ceiling. */
function shrug(t, out) {
  const p = POSES.stand(t, out);
  p.shoulderL = [0, 0, 0.3];
  p.shoulderR = [0, 0, -0.3];
  p.upperArmL = [0.05, -0.3, 0.26];
  p.upperArmR = [0.05, 0.3, -0.26];
  p.forearmL = [-1.6, 0, 0];
  p.forearmR = [-1.6, 0, 0];
  p.handL = [0, 1.45, -0.2];
  p.handR = [0, -1.45, 0.2];
  p.gripL = 0.05;
  p.gripR = 0.05;
  p.chest = [-0.04, 0, 0];
  return p;
}

/** Leaning in over the banding wheel; the hands are placed by IK. */
function leanIn(t, out) {
  const p = POSES.stand(t, out);
  p.spine = [0.12, 0, 0];
  p.chest = [0.1, 0.08, 0];
  p.neck = [0.04, 0, 0];
  p.upperArmL = [-0.5, -0.2, 0.25];
  p.forearmL = [-0.9, 0, 0];
  p.upperArmR = [-0.4, 0.3, -0.3];
  p.forearmR = [-2.0, 0, 0];
  p.gripR = 0.9;
  p.gripL = 0.2;
  return p;
}

/** Upper-body layers in blend order: [weight name, pose function]. */
const LAYERS = [
  ['crossed', POSES.armsCrossed], ['hips', POSES.handsOnHips], ['point', POSES.point], ['clap', POSES.clap],
  ['cheer', POSES.cheer], ['armUp', armUp], ['thumb', thumbsUp], ['shrug', shrug], ['lean', leanIn], ['explain', POSES.explain]
];

/**
 * @param {object} o
 * @param {THREE.Vector3} o.home      where he stands while you throw
 * @param {THREE.Vector3} o.judge     behind the banding wheel
 * @param {THREE.Vector3} o.wheel     the wheel head centre (what he faces while you throw)
 * @param {THREE.Vector3} o.banding   banding wheel top centre
 * @param {number} o.bandingRadius
 * @param {THREE.Vector3} o.kilnDoor  the kiln door (what he watches while it fires)
 * @param {THREE.Vector3} [o.kilnSpot]   where he tends the kiln (beside its door)
 * @param {THREE.Object3D} [o.kilnHinge] the door's hinge group, which the game swings
 * @param {THREE.Vector3} [o.kilnHandle] the door handle, in the hinge's space
 * @param {THREE.Vector3} [o.kilnBack]   where he steps back to, clear of the door and the piece's flight
 * @param {THREE.Vector3} [o.greet]      where he welcomes you on the start screen (by the wheel)
 */
export function createKeramiker({
  home, judge, wheel, banding, bandingRadius, kilnDoor, kilnSpot = null, kilnHinge = null, kilnHandle = null, kilnBack = null, greet = null
}) {
  const person = createPerson(LOOK);
  smearApron(person);
  const { root, bones, sockets } = person;
  const s = person.scale;
  const blob = blobShadow(s);
  root.add(blob.mesh);
  const beret = buildBeret(s);
  person.attach(beret, 'headTop', { position: [-0.006 * s, -0.028 * s, -0.004 * s], rotation: [-0.16, 0, -0.3] });
  root.position.copy(greet || home);
  root.rotation.y = greet ? 0 : Math.atan2(wheel.x - home.x, wheel.z - home.z);

  /* Pose buffers and layer weights, reused every frame */
  const base = emptyPose();
  const walkP = emptyPose();
  const buf = {};
  const w = {};
  const goalW = {};
  for (const [name] of LAYERS) {
    buf[name] = emptyPose();
    w[name] = 0;
    goalW[name] = 0;
  }

  const st = {
    now: 0,
    walkW: 0,
    phase: 0, // walk cycle
    rim: 0, // IK weights: hand on the banding wheel, fist on the chin, hand on the kiln door
    door: 0,
    doorGrip: false,
    doorAnchor: null,
    thumbGrip: false,
    backing: false,
    chin: 0,
    expr: '',
    talking: -1,
    cue: null, // { kind, t0, value }
    verdict: null, // { t0, grade }
    poseSwap: 0, // while you throw: arms crossed ↔ hands on hips
    overT: -1
  };
  /** What this frame asks for, filled by the plan* functions below. */
  const plan = { look: null, exprKey: '', expr: null, talk: false, nod: 0, shake: 0, tilt: 0, lean: false, door: 0 };

  const goal = new THREE.Vector3();
  const faceAt = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const target = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const handQ = new THREE.Quaternion();
  const ikPos = new THREE.Vector3();
  const ikQ = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const mBasis = new THREE.Matrix4();
  const ax = new THREE.Vector3();
  const ay = new THREE.Vector3();
  const az = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const doorLook = new THREE.Vector3();
  const handlePos = new THREE.Vector3();
  const handleQ = new THREE.Quaternion();
  const v2 = new THREE.Vector3();

  /** World quaternion for a bone whose local X and Y should point along x and y (orthonormalised). */
  function basisQuat(x, y, out) {
    ay.copy(y).normalize();
    ax.copy(x).addScaledVector(ay, -x.dot(ay)).normalize();
    az.crossVectors(ax, ay);
    mBasis.makeBasis(ax, ay, az);
    return out.setFromRotationMatrix(mBasis);
  }

  /**
   * Weighted IK: move the hand from where the pose put it toward `goalPos`
   * and turn it toward `goalQ` by the same eased weight, so an IK layer
   * fades in and out without ever snapping the wrist.
   */
  function reachFor(side, goalPos, goalQ, polePt, weight) {
    const k = ease(weight);
    const hand = bones[side === 'L' ? 'handL' : 'handR'];
    hand.getWorldPosition(ikPos).lerp(goalPos, k);
    hand.getWorldQuaternion(ikQ).slerp(goalQ, k);
    person.ikArm(side, ikPos, polePt, ikQ);
  }

  function express(key, spec) {
    plan.exprKey = key;
    plan.expr = spec;
  }

  /* -------------------------------------------------------------- cues */

  /** intro · star (n) · wobble · door · verdict (grade) */
  function cue(kind, value) {
    if (kind === 'verdict') {
      st.verdict = { t0: st.now, grade: value };
      return;
    }
    // A wobble never interrupts a celebration
    if (kind === 'wobble' && st.cue && st.cue.kind === 'star' && st.now - st.cue.t0 < 1.6) return;
    st.cue = { kind, t0: st.now, value };
    if (kind === 'door') person.blink();
  }

  /* ------------------------------------------------- what each moment asks */

  /** Start screen and the evening's exhibition: half turned to the viewer. */
  function planWaiting(t, ctx) {
    faceAt.copy(wheel).lerp(ctx.camera, 0.55);
    plan.look = ctx.camera;
    goalW.hips = 1;
    express('warm', { smile: 0.45 });
    if (ctx.phase !== 'over') {
      st.overT = -1;
      // Now and then he tells you about tonight's work, hands talking
      const cyc = t % 10;
      if (cyc > 6.5) {
        goalW.explain = window01(cyc, 6.5, 10, 0.5);
        goalW.hips = 1 - goalW.explain;
        plan.talk = cyc > 6.9 && cyc < 9.3;
        express('tell', { smile: 0.55 });
      }
      return;
    }
    // The evening is over: applause, then hands on hips, proud
    if (st.overT < 0) st.overT = t;
    const clapping = t - st.overT < 3.2;
    goalW.clap = clapping ? 1 : 0;
    goalW.hips = clapping ? 0 : 1;
    express('proud', { smile: 0.8 });
  }

  /** While you throw: arms crossed, watching your hands, reacting to cues. */
  function planThrow(dt, t, ctx) {
    faceAt.copy(wheel);
    plan.look = ctx.attention;
    // Now and then hands on hips instead — a man who has seen a lot of clay
    st.poseSwap += dt;
    const swap = Math.floor(st.poseSwap / 9) % 2 === 1;
    goalW.crossed = swap ? 0 : 1;
    goalW.hips = swap ? 1 : 0;
    express('watch', { focus: 0.35 });
    const c = st.cue;
    // Coming over from the start screen: the "this one" waits till he is at his place
    if (c && c.kind === 'intro' && root.position.distanceTo(goal) > 0.3) c.t0 = t;
    const age = c ? t - c.t0 : 99;
    if (c && c.kind === 'intro' && age < 2.1) {
      // "This one": points at the lump and says what he wants
      goalW.point = window01(age, 0.1, 1.9, 0.3);
      goalW.crossed = 0;
      goalW.hips = 0;
      plan.talk = age > 0.2 && age < 1.7;
      plan.look = age < 0.9 ? ctx.camera : ctx.attention;
      express('tell', { smile: 0.35 });
    } else if (c && c.kind === 'star' && age < 2.2) {
      // A nod to the potter — and at three stars, raised eyebrows first
      const three = c.value >= 3;
      plan.look = age < 1.4 ? ctx.camera : ctx.attention;
      plan.nod = window01(age, three ? 0.6 : 0.05, three ? 1.8 : 1.2, 0.15) * Math.sin(age * 13) * 0.12;
      if (three && age < 0.75) express('wow', { surprised: 0.85 });
      else if (three) express('grin', { grin: 0.8 });
      else express('smile', { smile: 0.75 });
    } else if (c && c.kind === 'wobble' && age < 1.8) {
      plan.shake = window01(age, 0.05, 1.5, 0.2) * Math.sin(age * 9) * 0.16;
      express('frown', { frown: 0.8 });
    }
  }

  /** The kiln fires: hands on hips, eyes narrowing as it glows. */
  function planKiln(ctx) {
    faceAt.copy(kilnDoor);
    plan.look = kilnDoor;
    goalW.hips = 1;
    // He shuts the door himself, hand on the handle as it swings home, and
    // pulls it open again when the firing is done
    if (kilnHinge && ctx.fireT !== undefined && root.position.distanceTo(goal) < 0.2) {
      const ft = ctx.fireT;
      plan.door = Math.max(window01(ft, 1.0, 1.8, 0.22), window01(ft, 3.5, 4.12, 0.18));
      if (plan.door > 0.5) plan.look = doorLook.copy(kilnHandle).applyMatrix4(kilnHinge.matrixWorld);
    }
    if (ctx.heat > 0.3) express('kiln', { focus: 0.7 });
    else express('watch', { focus: 0.35 });
  }

  /** At the banding wheel: weigh it up, then the verdict with his whole face. */
  function planJudge(t, ctx) {
    faceAt.copy(banding);
    plan.look = ctx.piece || banding;
    const v = ctx.phase === 'judge' ? st.verdict : null;
    if (!v) {
      // Leaning in over the piece, turning the wheel, fist under the chin
      const arrived = root.position.distanceTo(judge) < 0.12;
      goalW.lean = arrived ? 1 : 0;
      plan.lean = arrived;
      express('judge', { focus: 0.75 });
      return;
    }
    const age = t - v.t0;
    const g = v.grade;
    // He tells you (looking at you), then glances back at the piece now and then
    plan.look = age < 3.4 || Math.floor(age / 3) % 2 === 0 ? ctx.camera : ctx.piece || banding;
    plan.talk = age > 0.45 && age < 2.9;
    if (g >= 10) {
      // Speechless for a moment, then both arms up
      express(age < 0.6 ? 'wow' : 'grin', age < 0.6 ? { surprised: 1 } : { grin: 1 });
      goalW.cheer = window01(age, 0.45, 3.0, 0.3);
      goalW.hips = age > 2.8 ? 1 : 0;
      plan.talk = age > 1.2 && age < 3.0;
    } else if (g >= 8) {
      // A grin and an arm in the air
      express('grin', { grin: 0.85 });
      goalW.armUp = window01(age, 0.3, 2.7, 0.3);
      goalW.hips = age > 2.5 ? 1 : 0;
      plan.nod = window01(age, 2.6, 3.8, 0.2) * Math.sin(age * 11) * 0.1;
    } else if (g >= 6) {
      // Approved: a nod and a thumbs up
      express('smile', { smile: 0.75 });
      plan.nod = window01(age, 0.2, 1.4, 0.2) * Math.sin(age * 12) * 0.11;
      goalW.thumb = window01(age, 0.35, 2.7, 0.3);
      goalW.hips = age > 2.5 ? 1 : 0;
    } else if (g >= 4) {
      // "Hm. Rustik." — a shrug, palms up, head on one side
      express('hm', { focus: 0.4, smile: 0.2 });
      plan.tilt = window01(age, 0.1, 2.8, 0.4) * 0.14;
      goalW.shrug = window01(age, 0.35, 2.4, 0.3);
      goalW.crossed = age > 2.3 ? 1 : 0;
    } else {
      // A frown, arms folded, a slow shake of the head
      express('frown', { frown: 0.85 });
      plan.shake = window01(age, 0.25, 1.9, 0.25) * Math.sin(age * 7.5) * 0.17;
      goalW.crossed = 1;
      plan.talk = age > 0.9 && age < 2.6;
    }
  }

  /* ---------------------------------------------------------- the body */

  /** Walk to the goal (turning first, easing out), or turn on the spot to face what matters. */
  function locomotion(dt) {
    const k = (rate) => 1 - Math.exp(-rate * dt);
    tmp.subVectors(goal, root.position).setY(0);
    const dist = tmp.length();
    let walkGoal = 0;
    const backErr = dist > 0.03 ? wrapAngle(Math.atan2(-tmp.x, -tmp.z) - root.rotation.y) : 0;
    if (dist > 0.03 && st.backing && Math.abs(backErr) < 0.9) {
      // A short step BACK (out of the way of the kiln door and the hot
      // piece): no turning round, still facing what he faces, legs in reverse
      root.rotation.y += backErr * k(4);
      const step = Math.min(dist, Math.min(0.85, 0.35 + dist * 1.4) * dt);
      root.position.addScaledVector(tmp.normalize(), step);
      st.phase -= (step / (WALK_STRIDE * s)) * Math.PI * 2;
      walkGoal = 0.8;
    } else if (dist > 0.03) {
      const err = wrapAngle(Math.atan2(tmp.x, tmp.z) - root.rotation.y);
      root.rotation.y += err * k(7);
      const speed = Math.abs(err) > 1.1 ? 0 : Math.min(1.15, 0.3 + dist * 1.6) * (1 - Math.abs(err) / 1.6);
      const step = Math.min(dist, speed * dt);
      root.position.addScaledVector(tmp.normalize(), step);
      st.phase += (step / (WALK_STRIDE * s)) * Math.PI * 2;
      walkGoal = 1;
    } else {
      root.position.x = goal.x;
      root.position.z = goal.z;
      const err = wrapAngle(Math.atan2(faceAt.x - root.position.x, faceAt.z - root.position.z) - root.rotation.y);
      const turn = err * k(3.5);
      root.rotation.y += turn;
      // A big turn on the spot gets a couple of small steps
      if (Math.abs(err) > 0.35) {
        walkGoal = 0.35;
        st.phase += Math.abs(turn) * 2.2;
      }
    }
    st.walkW += (walkGoal - st.walkW) * k(walkGoal > st.walkW ? 8 : 5);
  }

  /** Idle or walking legs, then every upper-body layer by its eased weight. */
  function pose(dt, t) {
    for (const [name] of LAYERS) {
      const g = goalW[name];
      w[name] += (g - w[name]) * (1 - Math.exp(-(g > w[name] ? 5.5 : 4) * dt));
    }
    POSES.idle(t, base);
    if (st.walkW > 1e-3) mixAll(base, POSES.walk(st.phase, walkP), st.walkW);
    // Walking, he lets his arms swing: the resting layers give way to the stride
    const free = 1 - 0.8 * st.walkW;
    for (const [name, fn] of LAYERS) {
      const wk = name === 'hips' || name === 'crossed' ? w[name] * free : w[name];
      if (wk > 1e-3) mixUpper(base, fn(t, buf[name]), wk);
    }
    // A hand on the kiln door closes round its handle
    if (st.door > 1e-3 && !st.doorGrip) base.gripL += (0.92 - base.gripL) * ease(st.door);
    person.setPose(base, 1);
  }

  /** IK on top of the pose: the hand on the wheel, the fist on the chin, the pointing arm. */
  function hands(dt, t, ctx) {
    const k = (rate) => 1 - Math.exp(-rate * dt);
    st.rim += ((plan.lean ? 1 : 0) - st.rim) * k(5);
    st.chin += ((plan.lean ? 1 : 0) - st.chin) * k(3.5);
    const pointW = ctx.attention ? w.point : 0;
    const foldW = w.crossed * (1 - 0.8 * st.walkW);
    st.door += (plan.door - st.door) * k(plan.door > st.door ? 7 : 5);
    if (st.rim < 0.004 && st.chin < 0.004 && pointW < 0.004 && foldW < 0.004 && st.door < 0.004) return;
    root.updateMatrixWorld(true);
    if (foldW > 0.004) {
      // Arms folded the way people fold them — not an X at the wrists: the
      // left forearm lies over the right, its hand resting on the right upper
      // arm; the right hand is tucked in under the left arm against the ribs.
      // Both forearms clear the apron by a couple of centimetres.
      bones.chest.getWorldQuaternion(qa);
      const C = (x, y, z, out) => bones.chest.localToWorld(out.set(x * s, y * s, z * s));
      C(-0.05, 0.0, 0.29, target);
      basisQuat(v1.set(0, 0.6, 0.8).applyQuaternion(qa), v2.set(0.85, 0.45, 0.25).applyQuaternion(qa), handQ);
      C(0.6, -0.2, 0.35, pole);
      reachFor('L', target, handQ, pole, foldW);
      C(0.06, -0.065, 0.21, target);
      basisQuat(v1.set(0, 0, -1).applyQuaternion(qa), v2.set(-0.9, 0, 0.3).applyQuaternion(qa), handQ);
      C(-0.6, -0.25, 0.3, pole);
      reachFor('R', target, handQ, pole, foldW);
    }
    // The kiln door's bar: the shared grip library closes the fingers round it
    // (people.js setGrip 'power'); the arm reaches by our own eased weight
    const wantGrip = st.door > 0.15;
    if (wantGrip !== st.doorGrip) {
      st.doorGrip = wantGrip;
      st.doorAnchor = person.setGrip('L', wantGrip ? 'power' : null, { diameter: 0.05, blend: 0.18 });
    }
    if (st.door > 0.004) {
      // The bar's frame: +Y up its length, +Z the way the palm faces — square
      // to the reach, to his right (a left hand, thumb up)
      kilnHinge.updateMatrixWorld(true);
      handlePos.copy(kilnHandle).applyMatrix4(kilnHinge.matrixWorld);
      bones.upperArmL.getWorldPosition(tmp2);
      const reachDir = tmp2.subVectors(handlePos, tmp2).setY(0).normalize();
      az.crossVectors(reachDir, ay.set(0, 1, 0)).normalize();
      ax.crossVectors(ay, az);
      mBasis.makeBasis(ax, ay, az);
      handleQ.setFromRotationMatrix(mBasis);
      const anchor = st.doorAnchor;
      if (anchor) {
        // hand = bar × anchor⁻¹ (the same sum holdWith does, but weighted)
        handQ.copy(handleQ).multiply(qa.copy(anchor.quaternion).invert());
        target.copy(handlePos).sub(tmp.copy(anchor.position).applyQuaternion(handQ));
      } else {
        basisQuat(v1.set(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y)), reachDir.negate(), handQ);
        target.copy(handlePos);
      }
      bones.chest.localToWorld(pole.set(0.6 * s, -0.5 * s, -0.25 * s));
      reachFor('L', target, handQ, pole, st.door);
    }
    if (st.rim > 0.004) {
      // The rim point on his left, riding round with the wheel and back
      const left = tmp2.set(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y));
      const toMe = tmp.subVectors(root.position, banding).setY(0).normalize();
      const a = Math.atan2(toMe.x + left.x * 0.9, toMe.z + left.z * 0.9) + Math.sin(t * 1.3) * 0.18;
      target.set(banding.x + Math.sin(a) * bandingRadius * 0.92, banding.y + 0.05 * s, banding.z + Math.cos(a) * bandingRadius * 0.92);
      // Palm down, fingers toward the wheel's centre
      const fingers = tmp2.subVectors(banding, target).setY(-0.25).normalize();
      basisQuat(ax.set(0, 1, 0), fingers.negate(), handQ);
      bones.chest.localToWorld(pole.set(0.6 * s, -0.4 * s, -0.5 * s));
      reachFor('L', target, handQ, pole, st.rim);
    }
    if (st.chin > 0.004) {
      // Knuckles under the chin, elbow down and forward
      sockets.face.localToWorld(target.set(0, -0.19 * s, -0.02 * s));
      bones.head.getWorldQuaternion(qa);
      const toElbow = tmp2.set(0.15, -1, 0.35).applyQuaternion(qa);
      basisQuat(ax.set(0.2, 0.25, -1).applyQuaternion(qa), toElbow, handQ);
      bones.chest.localToWorld(pole.set(-0.25 * s, -0.7 * s, 0.6 * s));
      reachFor('R', target, handQ, pole, st.chin);
    }
    if (pointW > 0.004) {
      // Point AT the lump: the posed arm re-aimed along the line to it,
      // fingers along the line, thumb up
      bones.upperArmR.getWorldPosition(tmp2);
      const reach = tmp.subVectors(ctx.attention, tmp2).normalize();
      target.copy(tmp2).addScaledVector(reach, 0.6 * s);
      basisQuat(ax.set(0, 1, 0).cross(reach), az.copy(reach).negate(), handQ);
      bones.chest.localToWorld(pole.set(-0.5 * s, -0.6 * s, -0.3 * s));
      reachFor('R', target, handQ, pole, pointW);
    }
  }

  /* ------------------------------------------------------------ update */

  /**
   * @param {object} ctx
   *   phase: idle | intro | throw | fire | judge | over
   *   opened: the kiln door has opened (the piece is on its way to the banding wheel)
   *   attention: what he watches while you throw (your hand, or the clay)
   *   piece: the fired piece while it is judged · camera: the viewer · heat: kiln glow 0..1
   */
  function update(dt, tWall, ctx) {
    // His own clock runs on frame time, so a fast-forwarded firing (or a
    // slow test machine) plays every gesture at the speed of the game
    st.now += dt;
    const t = st.now;
    const { phase } = ctx;
    for (const [name] of LAYERS) goalW[name] = 0;
    plan.look = null;
    plan.talk = false;
    plan.nod = 0;
    plan.shake = 0;
    plan.tilt = 0;
    plan.lean = false;
    plan.door = 0;

    const atJudge = phase === 'judge' || (phase === 'fire' && ctx.opened);
    // The door swings open and the hot piece comes out past his spot: he
    // steps back first, then goes round to the banding wheel
    st.backing = phase === 'fire' && !!kilnBack && !!ctx.doorOpening && root.position.distanceTo(kilnBack) > 0.05 &&
      (!ctx.opened || st.backing);
    if (st.backing) goal.copy(kilnBack);
    else if (atJudge) goal.copy(judge);
    else if (phase === 'fire' && kilnSpot) goal.copy(kilnSpot);
    else if (phase === 'idle' && greet) goal.copy(greet);
    else goal.copy(home);
    if (phase === 'idle' || phase === 'over') planWaiting(t, ctx);
    else if (phase === 'intro' || phase === 'throw') planThrow(dt, t, ctx);
    else if (!atJudge) planKiln(ctx);
    else planJudge(t, ctx);

    locomotion(dt);
    pose(dt, t);
    hands(dt, t, ctx);
    // The thumbs-up: the shared hand library's own shape, eased in and out
    const wantThumb = w.thumb > 0.35 && !st.doorGrip;
    if (wantThumb !== st.thumbGrip) {
      st.thumbGrip = wantThumb;
      person.setGrip('R', wantThumb ? 'thumbsUp' : null, { blend: 0.22 });
    }
    // Nods, shakes and tilts on top (people.update keeps them and adds look-at)
    if (plan.nod) bones.head.rotation.x += plan.nod;
    if (plan.shake) {
      bones.head.rotation.y += plan.shake;
      bones.neck.rotation.y += plan.shake * 0.4;
    }
    if (plan.tilt) bones.head.rotation.z += plan.tilt;
    person.lookAt(plan.look);
    if (st.expr !== plan.exprKey) {
      st.expr = plan.exprKey;
      person.setExpression(plan.expr);
    }
    const talk = plan.talk ? 0.85 : 0;
    if (st.talking !== talk) {
      st.talking = talk;
      person.talk(talk);
    }
    person.update(dt, tWall);
  }

  return {
    root,
    person,
    cue,
    update,
    /** A new piece: forget the last verdict. */
    clearVerdict() {
      st.verdict = null;
    },
    dispose() {
      beret.geometry.dispose();
      beret.children[0].geometry.dispose();
      beret.material.dispose();
      root.remove(blob.mesh);
      blob.mesh.geometry.dispose();
      blob.mesh.material.dispose();
      blob.tex.dispose();
      person.dispose();
    }
  };
}
