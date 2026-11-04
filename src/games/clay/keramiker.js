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

/**
 * @param {object} o
 * @param {THREE.Vector3} o.home      where he stands while you throw
 * @param {THREE.Vector3} o.judge     behind the banding wheel
 * @param {THREE.Vector3} o.wheel     the wheel head centre (what he watches)
 * @param {THREE.Vector3} o.banding   banding wheel top centre
 * @param {number} o.bandingRadius
 * @param {THREE.Vector3} o.kilnDoor  the kiln door (what he watches while it fires)
 */
export function createKeramiker({ home, judge, wheel, banding, bandingRadius, kilnDoor }) {
  const person = createPerson(LOOK);
  smearApron(person);
  const { root, bones, sockets } = person;
  const s = person.scale;
  const blob = blobShadow(s);
  root.add(blob.mesh);
  const beret = buildBeret(s);
  person.attach(beret, 'headTop', { position: [-0.006 * s, -0.028 * s, -0.004 * s], rotation: [-0.16, 0, -0.3] });
  root.position.copy(home);
  root.rotation.y = Math.atan2(wheel.x - home.x, wheel.z - home.z);

  /* Pose buffers, reused every frame */
  const base = emptyPose();
  const walkP = emptyPose();
  const L = {
    crossed: emptyPose(),
    hips: emptyPose(),
    point: emptyPose(),
    explain: emptyPose(),
    armUp: emptyPose(),
    cheer: emptyPose(),
    clap: emptyPose(),
    lean: emptyPose(),
    thumb: emptyPose(),
    shrug: emptyPose()
  };
  const w = { crossed: 0, hips: 0, point: 0, explain: 0, armUp: 0, cheer: 0, clap: 0, lean: 0, thumb: 0, shrug: 0 };
  const goalW = { ...w };

  const st = {
    walkW: 0,
    phase: 0,
    rim: 0, // IK weights
    chin: 0,
    lookW: 0,
    expr: '',
    talking: -1,
    cue: null, // { kind, t0, value }
    verdict: null, // { t0, grade }
    poseSwap: 0, // throw: arms crossed ↔ hands on hips
    glance: 0
  };

  const goal = new THREE.Vector3();
  const faceAt = new THREE.Vector3();
  const lookPt = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const rimPt = new THREE.Vector3();
  const chinPt = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const handQ = new THREE.Quaternion();
  const eThumb = new THREE.Euler();
  const ikPos = new THREE.Vector3();
  const ikQ = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const mBasis = new THREE.Matrix4();
  const ax = new THREE.Vector3();
  const ay = new THREE.Vector3();
  const az = new THREE.Vector3();

  /** World quaternion for a bone whose local X and Y should point along x and y (orthonormalised). */
  function basisQuat(x, y, out) {
    ay.copy(y).normalize();
    ax.copy(x).addScaledVector(ay, -x.dot(ay)).normalize();
    az.crossVectors(ax, ay);
    mBasis.makeBasis(ax, ay, az);
    return out.setFromRotationMatrix(mBasis);
  }

  function setExpr(key, spec) {
    if (st.expr === key) return;
    st.expr = key;
    person.setExpression(spec);
  }

  function setTalk(on) {
    const v = on ? 0.85 : 0;
    if (st.talking === v) return;
    st.talking = v;
    person.talk(v);
  }

  /**
   * Weighted IK: move the hand from where the pose put it toward `target`
   * and turn it toward `goalQ` by the same eased weight, so an IK layer
   * fades in and out without ever snapping the wrist.
   */
  function reachFor(side, target, goalQ, polePt, weight) {
    const k = ease(weight);
    const hand = bones[side === 'L' ? 'handL' : 'handR'];
    hand.getWorldPosition(ikPos).lerp(target, k);
    hand.getWorldQuaternion(ikQ).slerp(goalQ, k);
    person.ikArm(side, ikPos, polePt, ikQ);
  }

  /* -------------------------------------------------------------- cues */

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

  /* ------------------------------------------------------------ update */

  st.now = 0;

  /**
   * @param {object} ctx
   *   phase: idle | intro | throw | fire | judge | over
   *   fireT: seconds into the firing (fire phase)
   *   opened: the kiln door has opened (piece on its way to the banding wheel)
   *   attention: what he watches while you throw (the hand, or the clay)
   *   piece: the fired piece (judge), camera: the viewer
   *   heat: kiln glow 0..1
   */
  function update(dt, t, ctx) {
    st.now = t;
    const { phase } = ctx;
    const k = (rate) => 1 - Math.exp(-rate * dt);
    for (const n of Object.keys(goalW)) goalW[n] = 0;

    const atJudge = phase === 'judge' || (phase === 'fire' && ctx.opened);
    goal.copy(atJudge ? judge : home);

    /* Where he faces when standing, and what he looks at */
    let lookTarget = null;
    const lookWeight = 1;
    let exprKey = 'neutral';
    let exprSpec = 'neutral';
    let talk = false;
    let nod = 0;
    let shake = 0;
    let tilt = 0;
    let lean = 0;
    const cueAge = st.cue ? t - st.cue.t0 : 99;

    if (phase === 'idle' || phase === 'over') {
      // Waiting for you: half turned to the viewer, a friendly look
      faceAt.copy(wheel).lerp(ctx.camera, 0.55);
      goalW.hips = 1;
      lookTarget = ctx.camera;
      exprKey = 'warm';
      exprSpec = { smile: 0.45 };
      if (phase === 'over') {
        // The evening is over: applause, then a proud look at the window
        const age = t - (st.overT ?? (st.overT = t));
        goalW.clap = age < 3.2 ? 1 : 0;
        goalW.hips = age < 3.2 ? 0 : 1;
        exprSpec = { smile: 0.8 };
        exprKey = 'proud';
      } else st.overT = undefined;
    } else if (phase === 'intro' || phase === 'throw') {
      st.overT = undefined;
      faceAt.copy(wheel);
      lookTarget = ctx.attention;
      // Arms crossed, now and then hands on hips — a man who has seen a lot of clay
      st.poseSwap += dt;
      const swap = Math.floor(st.poseSwap / 9) % 2 === 1;
      goalW.crossed = swap ? 0 : 1;
      goalW.hips = swap ? 1 : 0;
      exprKey = 'watch';
      exprSpec = { focus: 0.35 };
      if (st.cue && st.cue.kind === 'intro' && cueAge < 2.1) {
        // "This one": points at the lump and says what he wants
        goalW.point = window01(cueAge, 0.1, 1.9, 0.3);
        goalW.crossed = 0;
        goalW.hips = 0;
        talk = cueAge > 0.2 && cueAge < 1.7;
        lookTarget = cueAge < 0.9 ? ctx.camera : ctx.attention;
        exprKey = 'tell';
        exprSpec = { smile: 0.35 };
      } else if (st.cue && st.cue.kind === 'star' && cueAge < 2.2) {
        // A nod to the potter — and at three stars, raised eyebrows first
        const three = st.cue.value >= 3;
        lookTarget = cueAge < 1.4 ? ctx.camera : ctx.attention;
        nod = window01(cueAge, three ? 0.6 : 0.05, three ? 1.8 : 1.2, 0.15) * Math.sin(cueAge * 13) * 0.12;
        if (three && cueAge < 0.75) {
          exprKey = 'wow';
          exprSpec = { surprised: 0.85 };
        } else {
          exprKey = three ? 'grin' : 'smile';
          exprSpec = three ? { grin: 0.8 } : { smile: 0.75 };
        }
      } else if (st.cue && st.cue.kind === 'wobble' && cueAge < 1.8) {
        shake = window01(cueAge, 0.05, 1.5, 0.2) * Math.sin(cueAge * 9) * 0.16;
        exprKey = 'frown';
        exprSpec = { frown: 0.8 };
      }
    } else if (phase === 'fire' && !ctx.opened) {
      // Watching the kiln: hands on hips, eyes narrowing as it glows
      faceAt.copy(kilnDoor);
      lookTarget = kilnDoor;
      goalW.hips = 1;
      exprKey = ctx.heat > 0.3 ? 'kiln' : 'watch';
      exprSpec = ctx.heat > 0.3 ? { focus: 0.7 } : { focus: 0.35 };
    } else {
      // At (or on the way to) the banding wheel
      faceAt.copy(banding);
      lookTarget = ctx.piece || banding;
      const arrived = root.position.distanceTo(judge) < 0.12;
      const v = phase === 'judge' && st.verdict ? st.verdict : null;
      if (!v) {
        // Leaning in over the piece, turning the wheel, fist under the chin
        goalW.lean = arrived ? 1 : 0;
        lean = arrived ? 1 : 0;
        exprKey = 'judge';
        exprSpec = { focus: 0.75 };
      } else {
        const age = t - v.t0;
        const g = v.grade;
        lookTarget = age < 3.4 || Math.floor(age / 3) % 2 === 0 ? ctx.camera : ctx.piece || banding;
        talk = age > 0.45 && age < 2.9;
        if (g >= 10) {
          exprKey = age < 0.6 ? 'wow' : 'grin';
          exprSpec = age < 0.6 ? { surprised: 1 } : { grin: 1 };
          goalW.cheer = window01(age, 0.45, 3.0, 0.3);
          goalW.hips = age > 2.8 ? 1 : 0;
          talk = age > 1.2 && age < 3.0;
        } else if (g >= 8) {
          exprKey = 'grin';
          exprSpec = { grin: 0.85 };
          goalW.armUp = window01(age, 0.3, 2.7, 0.3);
          goalW.hips = age > 2.5 ? 1 : 0;
          nod = window01(age, 2.6, 3.8, 0.2) * Math.sin(age * 11) * 0.1;
        } else if (g >= 6) {
          // Approved: a nod and a thumbs up
          exprKey = 'smile';
          exprSpec = { smile: 0.75 };
          nod = window01(age, 0.2, 1.4, 0.2) * Math.sin(age * 12) * 0.11;
          goalW.thumb = window01(age, 0.35, 2.7, 0.3);
          goalW.hips = age > 2.5 ? 1 : 0;
        } else if (g >= 4) {
          // "Hm. Rustik." — a shrug, palms up, head on one side
          exprKey = 'hm';
          exprSpec = { focus: 0.4, smile: 0.2 };
          tilt = window01(age, 0.1, 2.8, 0.4) * 0.14;
          goalW.shrug = window01(age, 0.35, 2.4, 0.3);
          goalW.crossed = age > 2.3 ? 1 : 0;
        } else {
          exprKey = 'frown';
          exprSpec = { frown: 0.85 };
          shake = window01(age, 0.25, 1.9, 0.25) * Math.sin(age * 7.5) * 0.17;
          goalW.crossed = 1;
          talk = age > 0.9 && age < 2.6;
        }
      }
    }

    /* Walk to the goal, or turn on the spot to face what matters */
    tmp.subVectors(goal, root.position);
    tmp.y = 0;
    const dist = tmp.length();
    let walkGoal = 0;
    if (dist > 0.03) {
      const heading = Math.atan2(tmp.x, tmp.z);
      const err = wrapAngle(heading - root.rotation.y);
      root.rotation.y += err * k(7);
      // Turn first, then walk; ease out as he arrives
      const speed = Math.abs(err) > 1.1 ? 0 : Math.min(1.15, 0.3 + dist * 1.6) * (1 - Math.abs(err) / 1.6);
      const step = Math.min(dist, speed * dt);
      root.position.addScaledVector(tmp.normalize(), step);
      st.phase += (step / (WALK_STRIDE * s)) * Math.PI * 2;
      walkGoal = 1;
    } else {
      root.position.x = goal.x;
      root.position.z = goal.z;
      const heading = Math.atan2(faceAt.x - root.position.x, faceAt.z - root.position.z);
      const err = wrapAngle(heading - root.rotation.y);
      const turn = err * k(3.5);
      root.rotation.y += turn;
      // A big turn on the spot gets a couple of small steps
      if (Math.abs(err) > 0.35) {
        walkGoal = 0.35;
        st.phase += Math.abs(turn) * 2.2;
      }
    }
    st.walkW += (walkGoal - st.walkW) * k(walkGoal > st.walkW ? 8 : 5);

    /* Layers */
    for (const n of Object.keys(w)) w[n] += (goalW[n] - w[n]) * k(goalW[n] > w[n] ? 5.5 : 4);
    POSES.idle(t, base);
    if (st.walkW > 1e-3) mixAll(base, POSES.walk(st.phase, walkP), st.walkW);
    if (w.crossed > 1e-3) mixUpper(base, POSES.armsCrossed(t, L.crossed), w.crossed);
    if (w.hips > 1e-3) mixUpper(base, POSES.handsOnHips(t, L.hips), w.hips);
    if (w.point > 1e-3) mixUpper(base, POSES.point(t, L.point), w.point);
    if (w.explain > 1e-3) mixUpper(base, POSES.explain(t, L.explain), w.explain);
    if (w.clap > 1e-3) mixUpper(base, POSES.clap(t, L.clap), w.clap);
    if (w.cheer > 1e-3) mixUpper(base, POSES.cheer(t, L.cheer), w.cheer);
    if (w.armUp > 1e-3) {
      // One arm up, fist clenched, pumping — the left hand stays on the hip
      const p = POSES.handsOnHips(t, L.armUp);
      const pump = Math.sin(t * 7) * 0.12;
      p.shoulderR = [0, 0, -0.24];
      p.upperArmR = [0.1, 0.18, -2.65 + pump * 0.4];
      p.forearmR = [-0.42 - pump, 0, 0];
      p.handR = [0, 0, 0];
      p.gripR = 1;
      p.chest = [-0.06, 0.06, 0.06];
      p.head = [-0.12, 0, 0];
      mixUpper(base, p, w.armUp);
    }
    if (w.thumb > 1e-3) {
      // Forearm out, fist forward — the thumb goes up after setPose below
      const p = POSES.handsOnHips(t, L.thumb);
      p.upperArmR = [-0.5, 0.3, -0.2];
      p.forearmR = [-1.3, 0, 0];
      p.handR = [0.1, 0, 0];
      p.gripR = 1;
      p.chest = [-0.03, -0.08, 0];
      mixUpper(base, p, w.thumb);
    }
    if (w.shrug > 1e-3) {
      const p = POSES.stand(t, L.shrug);
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
      mixUpper(base, p, w.shrug);
    }
    if (w.lean > 1e-3) {
      // Leaning in: a bend in the spine, the arms left to the IK below
      const p = L.lean;
      POSES.stand(t, p);
      p.spine = [0.12, 0, 0];
      p.chest = [0.1, 0.08, 0];
      p.neck = [0.04, 0, 0];
      p.upperArmL = [-0.5, -0.2, 0.25];
      p.forearmL = [-0.9, 0, 0];
      p.upperArmR = [-0.4, 0.3, -0.3];
      p.forearmR = [-2.0, 0, 0];
      p.gripR = 0.9;
      p.gripL = 0.2;
      mixUpper(base, p, w.lean);
    }
    person.setPose(base, 1);

    /* IK: a hand on the banding wheel and a fist under the chin while he weighs it up */
    st.rim += ((lean ? 1 : 0) - st.rim) * k(5);
    st.chin += ((lean ? 1 : 0) - st.chin) * k(3.5);
    const pointW = ctx.attention ? w.point : 0;
    if (st.rim > 0.004 || st.chin > 0.004 || pointW > 0.004) root.updateMatrixWorld(true);
    if (st.rim > 0.004) {
      // The rim point on his left, riding round with the wheel and back
      const left = tmp2.set(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y));
      const toMe = tmp.subVectors(root.position, banding).setY(0).normalize();
      const a = Math.atan2(toMe.x + left.x * 0.9, toMe.z + left.z * 0.9) + Math.sin(t * 1.3) * 0.18;
      rimPt.set(banding.x + Math.sin(a) * bandingRadius * 0.92, banding.y + 0.05 * s, banding.z + Math.cos(a) * bandingRadius * 0.92);
      // Palm down, fingers toward the wheel's centre
      const fingers = tmp2.subVectors(banding, rimPt).setY(-0.25).normalize();
      basisQuat(ax.set(0, 1, 0), fingers.negate(), handQ);
      bones.chest.localToWorld(pole.set(0.6 * s, -0.4 * s, -0.5 * s));
      reachFor('L', rimPt, handQ, pole, st.rim);
    }
    if (st.chin > 0.004) {
      // Knuckles under the chin, elbow down and forward
      sockets.face.localToWorld(chinPt.set(0, -0.19 * s, -0.02 * s));
      bones.head.getWorldQuaternion(qa);
      const up = tmp2.set(0.15, -1, 0.35).applyQuaternion(qa); // hand → elbow
      basisQuat(ax.set(0.2, 0.25, -1).applyQuaternion(qa), up, handQ);
      bones.chest.localToWorld(pole.set(-0.25 * s, -0.7 * s, 0.6 * s));
      reachFor('R', chinPt, handQ, pole, st.chin);
    }
    if (pointW > 0.004) {
      // Point AT the lump: the posed arm is re-aimed along the line to it,
      // fingers along the line, thumb up
      bones.upperArmR.getWorldPosition(tmp2);
      const reach = tmp.subVectors(ctx.attention, tmp2).normalize();
      chinPt.copy(tmp2).addScaledVector(reach, 0.6 * s);
      basisQuat(ax.set(0, 1, 0).cross(reach), az.copy(reach).negate(), handQ);
      bones.chest.localToWorld(pole.set(-0.5 * s, -0.6 * s, -0.3 * s));
      reachFor('R', chinPt, handQ, pole, pointW);
    }

    /* The thumb of the thumbs up: straight out of the fist's top */
    if (w.thumb > 0.01) {
      qa.setFromEuler(eThumb.set(-1.45, 0.1, 0.2));
      bones.thumbR.quaternion.slerp(qa, ease(w.thumb));
    }

    /* Nods, shakes, tilts on top (people.update keeps them and adds look-at) */
    if (nod) bones.head.rotation.x += nod;
    if (shake) {
      bones.head.rotation.y += shake;
      bones.neck.rotation.y += shake * 0.4;
    }
    if (tilt) bones.head.rotation.z += tilt;

    if (lookTarget) {
      lookPt.copy(lookTarget);
      person.lookAt(lookPt, lookWeight);
    } else person.lookAt(null);
    setExpr(exprKey, exprSpec);
    setTalk(talk);
    person.update(dt, t);
  }

  return {
    root,
    person,
    cue,
    update,
    /** Snap to the home spot (a new evening). */
    reset() {
      root.position.copy(home);
      root.rotation.y = Math.atan2(wheel.x - home.x, wheel.z - home.z);
      st.cue = null;
      st.verdict = null;
      st.walkW = 0;
    },
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
