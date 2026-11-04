/**
 * Pekkas Pokal — people: one shared character system for every game.
 *
 * Stylised "soft vinyl toy" people built entirely in code (no assets): one
 * SkinnedMesh per person — 3 draw calls at high detail (skin & hair, cloth,
 * glossy eyes/teeth/glasses/leather; a 4th only for a fencing lamé) and 1 at
 * low detail — on a standard skeleton, with a pose library, two-bone IK,
 * look-at, expressions with a jaw that really opens, blinking lids, eye
 * saccades and breathing, plus an instanced crowd. The same participant
 * looks the same in every game (appearanceFor).
 *
 * Files: people.js (this API) · people-rig.js (skeleton, poses, IK) ·
 * people-build.js (body, clothes) · people-head.js (head, face, hair, hats) ·
 * people-look.js (appearances, outfits) · people-assemble.js (mesh assembly) ·
 * people-crowd.js (crowds).
 *
 * ── Quick start ─────────────────────────────────────────────────────────
 *
 *   import { createPerson, appearanceFor, POSES, createCrowd } from '../shared/people.js';
 *
 *   const judge = createPerson(appearanceFor('Mikael Hägglund'));   // polo neck, round glasses
 *   scene.add(judge.root);
 *   // every frame, in this order:
 *   judge.setPose(POSES.walk(phase), 0.25);  // blend toward the pose (1 = snap)
 *   judge.lookAt(camera.position);           // head/neck/eyes, eased (null releases)
 *   judge.update(dt, t);                     // breathing, blinks, saccades, expression easing
 *
 *   // Game outfits on top of the person's own look (garment colours reset
 *   // when the garment type changes; pass topColor etc. to choose):
 *   const fencer = createPerson(appearanceFor('Per Vikman', {
 *     outfit: { top: 'fencing', bottom: 'knickers', accent: 0xc9982e }   // accent = socks
 *   }));
 *   fencer.setPose(POSES.ready(t));
 *   fencer.ikLeg('L', frontAnkleWorld);                  // knee pole defaults to forward
 *   fencer.ikArm('R', swordHandWorld, elbowPoleWorld, handWorldQuat);
 *   fencer.attach(foil, 'gripR');            // fist socket: +Z runs out of the thumb side
 *   fencer.materials.lame.emissive.set(0x40ff40);        // hit flash (own material)
 *
 * ── createPerson(spec) ──────────────────────────────────────────────────
 *
 *   spec = {
 *     height: 1.80,                 // metres (the whole figure scales; head is drawn ×1.15, ~6.6 heads)
 *     build: 'slim'|'average'|'broad',
 *     skin: 0xe8b08b,               // or SKIN_TONES.fair|light|lightWarm|medium|olive|deep
 *     hair: { style, color },       // HAIR_STYLE_NAMES: bald buzz crop tousled sidePart sweptBack
 *                                   //   curly long bun balding
 *     facialHair: null|'stubble'|'beard'|'fullBeard'|'moustache',
 *     glasses: null|'round'|'rect', glassesColor,
 *     headwear: null|'cap'|'beret'|'beanie'|'headband' | { style, color },
 *     eyes: 'blue'|'grayBlue'|'green'|'hazel'|'brown'|'darkBrown' | [r, g, b] (linear),
 *     face: { jaw, chin, nose, noseLen, brow, cheek, lips, headW, headL, ears } (≈0.9…1.15),
 *     outfit: {
 *       top: 'tshirt'|'polo'|'shirt'|'poloNeck'|'sweater'|'jacket'|'apron'|'jersey'|
 *            'fishingJacket'|'fencing'|'none', topColor,
 *       bottom: 'trousers'|'jeans'|'shorts'|'knickers', bottomColor,
 *       shoes: 'sneakers'|'leather'|'boots', shoeColor,
 *       accent                     // apron, jersey trims, knicker socks (and hats without a colour)
 *     },
 *     detail: 'high'|'low',         // ≈8.5–10k vs ≈0.9–1.2k triangles
 *     ownMaterials: false           // materials are SHARED between people (vertex colours carry
 *                                   //   all colour); true gives this person private ones to tint
 *   }
 *
 *   → person = {
 *     root,        // Group to add to the scene; it stands on its origin, facing +Z
 *     mesh,        // the SkinnedMesh (castShadow/receiveShadow on; generous bounding sphere)
 *     bones,       // by name, see below
 *     sockets,     // gripL, gripR (in the fist; +Z out of the thumb side, +Y up the forearm),
 *                  // headTop (crown), face (in front of the eyes)
 *     height, triangles, materials { skin, cloth, gloss, lame? }, look (resolved spec),
 *     setPose(pose, blend = 1),
 *     ikArm(side 'L'|'R', target, pole?, handWorldQuat?) → metres out of reach (0 = reached)
 *     ikLeg(side, target, pole?, footWorldQuat?)        → idem
 *     lookAt(point|null, weight = 1),
 *     setExpression(name | { smile: .5, focus: .5 }, amount = 1),   // EXPRESSION_NAMES:
 *                  // neutral smile grin shout frown focus surprised
 *     blink(), talk(0..1)  // talk flaps the jaw irregularly until talk(0)
 *     update(dt, t),       // once per frame AFTER posing/IK (also drives lids, eyes, forearm roll)
 *     attach(object, boneOrSocket, { position, rotation, quaternion, scale } | Matrix4),
 *     dispose()            // geometry, skeleton texture, materials (refcounted), detaches attachments
 *   }
 *
 * ── Skeleton ────────────────────────────────────────────────────────────
 *
 *   hips → spine → chest → neck → head
 *   chest → shoulderL/R (clavicle) → upperArmL/R → forearmL/R → handL/R
 *           forearmTwistL/R (driven by update: half the hand's twist, for a clean wrist)
 *           handL/R → thumb, index → indexTip, fingers → fingersTip (driven by grip/point)
 *   hips → thighL/R → shinL/R → footL/R
 *   head → jaw, lipUpper, mouthL/R, browL/R, eyeL/R, lidUpL/R, lidLoL/R (driven by expressions)
 *
 *   Axes: at zero rotation every bone is parallel to the root — X = the person's LEFT,
 *   Y = up, Z = forward — and the pose is "attention, arms straight down". The bind/rest pose
 *   is an A-pose (upperArm z = ±A_POSE). Rotation signs per bone are listed in people-rig.js.
 *   Pose objects: { [bone]: [x, y, z] Euler radians, hipsPos: [x, y, z] metres at 1.80 m,
 *   gripL/gripR: 0 open … 1 fist, pointL/pointR: 0…1 index extended }. Missing bones = zero.
 *
 * ── Pose library (POSES.name(t, out?) → pose; mixPoses, mirrorPose) ────────
 *
 *   stand, idle(t), sit, sitCup(t), sitRod(t), sitClap(t), sitCheer(t), cheer(t), clap(t),
 *   point (right hand; mirrorPose for the left), handsOnHips, armsCrossed, ready(t) (athletic
 *   stance), explain(t) (talking gesture), holdNotebook(t), walk(phase).
 *   Seated: the seat is SEAT_HEIGHT × height/1.8 up, centred SEAT_BACK behind the root.
 *   Walking: move the root WALK_STRIDE × height/1.8 forward per 2π of phase.
 *   Games may also write bone.rotation directly between setPose and update; update()
 *   layers breathing and look-at on top without drifting.
 *
 * ── createCrowd(opts) (see people-crowd.js) ─────────────────────────────
 *
 *   const crowd = createCrowd({ seats: [{ position, rotationY, pose: 'sit'|'stand', cup? }],
 *                               names: PARTICIPANT_NAMES, seed, hats: 0.12, castShadow: true });
 *   scene.add(crowd.root);
 *   crowd.react('cheer' | 'clap' | 'ovation' | 'idle', seconds = 2.2);  // one-shot
 *   crowd.setMood('idle' | 'clap' | 'cheer' | 'ovation');               // between reactions
 *   crowd.lookAt(ball.position | null);  crowd.update(dt, t);  crowd.drawCalls;  crowd.dispose();
 *   Typically 2–5 draw calls for any number of spectators (one per pose variant in use).
 */
import * as THREE from 'three';
import {
  BONE_DEFS, A_POSE, POSES, applyPose, solveTwoBone, emptyPose, mixPoses, mirrorPose, SEAT_HEIGHT, SEAT_BACK, WALK_STRIDE,
  HEAD_C, HEAD_SCALE, FACE
} from './people-rig.js';
import { REGION, MAT, noise3, rng } from './people-build.js';
import { LID_CLOSED_UP, LID_CLOSED_LO, HAIR_STYLE_NAMES } from './people-head.js';
import { appearanceFor, resolveLook, PARTICIPANT_NAMES, SKIN_TONES, HAIR_COLORS, EYE_COLORS } from './people-look.js';
import { buildPersonData, toBindPose, toGeometry, makeSkeleton } from './people-assemble.js';
import { createCrowd } from './people-crowd.js';

export {
  POSES, mixPoses, mirrorPose, emptyPose, SEAT_HEIGHT, SEAT_BACK, WALK_STRIDE, BONE_DEFS, A_POSE,
  appearanceFor, PARTICIPANT_NAMES, SKIN_TONES, HAIR_COLORS, EYE_COLORS, HAIR_STYLE_NAMES, createCrowd
};

/* ------------------------------------------------------------ materials */

const shared = new Map();

function makeMaterials(detail) {
  if (detail === 'low') {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
    return { skin: m, cloth: m, gloss: m, list: [m, m, m, m] };
  }
  // Skin and hair: a soft warm sheen stands in for subsurface light
  const skin = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.55, metalness: 0, sheen: 0.35, sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0.7, 0.32, 0.24)
  });
  // Cloth: matte with a velvety rim
  const cloth = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.82, metalness: 0, sheen: 0.4, sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0.38, 0.38, 0.38)
  });
  // Eyes, teeth, glasses, buttons, leather: a wet, glossy coat
  const gloss = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12
  });
  return { skin, cloth, gloss, list: [skin, cloth, gloss, null] };
}

function acquireMaterials(detail, own) {
  if (own) return makeMaterials(detail);
  let e = shared.get(detail);
  if (!e) {
    e = { mats: makeMaterials(detail), refs: 0 };
    shared.set(detail, e);
  }
  e.refs++;
  return e.mats;
}

function releaseMaterials(detail, own, mats) {
  const dispose = (m) => {
    const seen = new Set();
    for (const x of m.list) {
      if (x && !seen.has(x)) {
        seen.add(x);
        x.dispose();
      }
    }
  };
  if (own) {
    dispose(mats);
    return;
  }
  const e = shared.get(detail);
  if (!e) return;
  e.refs--;
  if (e.refs <= 0) {
    dispose(e.mats);
    shared.delete(detail);
  }
}

/* ------------------------------------------------------------ expressions */

/**
 * Face rig targets. mouth: corner offset [out, up, forward] (m), jaw: open
 * (rad), lip: upper-lip raise (m), brow: [raise (m), tilt (rad, + = inner
 * ends down)], lidUp: extra opening (rad), lidLo: lower-lid raise (rad).
 */
export const EXPRESSIONS = {
  neutral: {},
  smile: { mouth: [0.003, 0.0056, -0.0018], jaw: 0.02, lip: 0.0003, brow: [0.0014, -0.03], lidUp: -0.03, lidLo: 0.16 },
  grin: { mouth: [0.0055, 0.0068, -0.0022], jaw: 0.15, lip: 0.0028, brow: [0.0022, -0.05], lidUp: -0.05, lidLo: 0.24 },
  shout: { mouth: [0.0008, 0.0, 0.0004], jaw: 0.34, lip: 0.0032, brow: [-0.0016, 0.17], lidUp: 0.06, lidLo: 0.06 },
  frown: { mouth: [-0.0008, -0.0044, 0.0], jaw: 0.012, lip: 0, brow: [-0.0026, 0.2], lidUp: -0.09, lidLo: 0.05 },
  focus: { mouth: [-0.0018, -0.0008, 0.0004], jaw: 0, lip: 0, brow: [-0.002, 0.15], lidUp: -0.13, lidLo: 0.12 },
  surprised: { mouth: [-0.0042, 0.0, 0.0012], jaw: 0.26, lip: 0.0012, brow: [0.0058, -0.1], lidUp: 0.15, lidLo: -0.07 }
};
export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS);

const LID_UP_REST = 0.42 - LID_CLOSED_UP;
const LID_LO_REST = 0.56 + LID_CLOSED_LO;

/* ------------------------------------------------------------ the person */

let personCount = 0;
const IDENTITY_Q = new THREE.Quaternion();

export function createPerson(specIn = {}) {
  const look = resolveLook(specIn);
  const detail = specIn.detail === 'low' ? 'low' : 'high';
  const s = look.height / 1.8;
  const { b, joints, H } = buildPersonData(look, detail);
  toBindPose(b, joints);
  const geometry = toGeometry(b, s);
  const triangles = b.triangleCount();

  /* Skeleton (zero-pose joint positions, A-pose rotations on the upper arms) */
  const { bones, list, restPos } = makeSkeleton(joints, s);

  const own = !!specIn.ownMaterials;
  const mats = acquireMaterials(detail, own);
  const materials = { skin: mats.skin, cloth: mats.cloth, gloss: mats.gloss };
  const matList = mats.list.slice();
  let lame = null;
  if (b.tris[MAT.LAME].length) {
    lame = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.32, emissive: 0x000000 });
    matList[MAT.LAME] = lame;
    materials.lame = lame;
  }
  if (detail === 'low') matList[MAT.LAME] = lame || mats.skin;
  const mesh = new THREE.SkinnedMesh(geometry, matList.map((m) => m || mats.skin));
  mesh.name = `person:${look.name || personCount}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const root = new THREE.Group();
  root.name = `person-root:${look.name || personCount}`;
  root.add(mesh);
  mesh.add(bones.hips);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  mesh.bind(skeleton);
  // Generous bounds: poses (sitting, cheering, IK reaches) stay inside
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9 * s, 0), 1.35 * s);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2 * s, -0.4 * s, -1.2 * s), new THREE.Vector3(1.2 * s, 2.4 * s, 1.2 * s));
  personCount++;

  /* Sockets */
  const sockets = {};
  const socket = (name, parent, pos, rot) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(pos[0] * s, pos[1] * s, pos[2] * s);
    if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
    bones[parent].add(o);
    sockets[name] = o;
  };
  socket('gripL', 'handL', [-0.024, -0.078, 0.006]);
  socket('gripR', 'handR', [0.024, -0.078, 0.006]);
  const hc = HEAD_C;
  socket('headTop', 'head', [hc[0], hc[1] + 0.112 * HEAD_SCALE, hc[2] - 0.01]);
  socket('face', 'head', [hc[0], hc[1], hc[2] + 0.1 * HEAD_SCALE]);

  /* Runtime state */
  const r = rng(look.seed ^ 0x5bd1e995);
  const state = {
    t: 0,
    blinkT: 0,
    nextBlink: 1 + r() * 3,
    blinkDur: 0.16,
    doubleBlink: false,
    sacc: [0, 0],
    saccT: 0,
    nextSacc: 0.5 + r() * 1.5,
    eye: [0, 0],
    look: null,
    lookW: 0,
    lookWTarget: 0,
    lookYaw: 0,
    lookPitch: 0,
    exprTarget: { neutral: 1 },
    expr: {},
    talk: 0,
    talkV: 0,
    breathRate: 0.22 + r() * 0.06,
    breathPhase: r() * 6.28
  };
  for (const n of Object.keys(EXPRESSIONS)) state.expr[n] = n === 'neutral' ? 1 : 0;
  const attached = new Set();
  const layered = ['spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR'].map((n) => ({
    bone: bones[n], base: new THREE.Quaternion(), written: new THREE.Quaternion(0, 0, 0, 0)
  }));
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpQ2 = new THREE.Quaternion();

  const person = {
    root, mesh, bones, sockets, height: look.height, look, materials, skeleton, triangles,
    detail, scale: s, H,

    setPose(pose, blend = 1) {
      applyPose(bones, pose, blend, restPos, s);
    },

    ikArm(side, target, pole, handWorldQuat) {
      const S = side === 'L' || side === 1 ? 'L' : 'R';
      let pl = pole;
      if (!pl) {
        // Default: elbow down, back and a little out
        bones.chest.updateWorldMatrix(true, false);
        pl = tmpV2.set(S === 'L' ? 0.5 : -0.5, -0.6, -0.9).multiplyScalar(s).applyMatrix4(bones.chest.matrixWorld);
      }
      return solveTwoBone(bones[`upperArm${S}`], bones[`forearm${S}`], bones[`hand${S}`], target, pl, 1, handWorldQuat);
    },

    ikLeg(side, target, pole, footWorldQuat) {
      const S = side === 'L' || side === 1 ? 'L' : 'R';
      let pl = pole;
      if (!pl) {
        bones.hips.updateWorldMatrix(true, false);
        pl = tmpV2.set(S === 'L' ? 0.1 : -0.1, -0.4, 1.0).multiplyScalar(s).applyMatrix4(bones.hips.matrixWorld);
      }
      return solveTwoBone(bones[`thigh${S}`], bones[`shin${S}`], bones[`foot${S}`], target, pl, -1, footWorldQuat);
    },

    lookAt(point, weight = 1) {
      if (!point) {
        state.lookWTarget = 0;
        return;
      }
      state.look = (state.look || new THREE.Vector3()).copy(point);
      state.lookWTarget = THREE.MathUtils.clamp(weight, 0, 1);
    },

    setExpression(name, amount = 1) {
      const t = {};
      if (typeof name === 'string') {
        if (EXPRESSIONS[name] && name !== 'neutral') t[name] = THREE.MathUtils.clamp(amount, 0, 1);
      } else if (name) {
        for (const [k, v] of Object.entries(name)) if (EXPRESSIONS[k] && k !== 'neutral') t[k] = v;
      }
      state.exprTarget = t;
    },

    blink() {
      if (state.blinkT <= 0) state.blinkT = 1e-4;
    },

    talk(amount = 1) {
      state.talk = THREE.MathUtils.clamp(amount, 0, 1);
    },

    attach(object, name, offset) {
      const parent = sockets[name] || bones[name];
      if (!parent) throw new Error(`people: no bone or socket "${name}"`);
      parent.add(object);
      if (offset) {
        if (offset.isMatrix4) offset.decompose(object.position, object.quaternion, object.scale);
        else {
          if (offset.position) object.position.fromArray(offset.position.toArray ? offset.position.toArray() : offset.position);
          if (offset.quaternion) object.quaternion.copy(offset.quaternion);
          else if (offset.rotation) object.rotation.fromArray(offset.rotation.toArray ? offset.rotation.toArray() : offset.rotation);
          if (offset.scale !== undefined) {
            if (typeof offset.scale === 'number') object.scale.setScalar(offset.scale);
            else object.scale.fromArray(offset.scale.toArray ? offset.scale.toArray() : offset.scale);
          }
        }
      }
      attached.add(object);
      return object;
    },

    update(dt = 1 / 60, t) {
      const d = Math.min(Math.max(dt, 0), 0.1);
      state.t = t ?? state.t + d;
      const k = (rate) => 1 - Math.exp(-rate * d);

      /* Layered body motion: restore last frame's base unless the game re-posed */
      for (const L of layered) {
        if (L.bone.quaternion.equals(L.written)) L.bone.quaternion.copy(L.base);
        else L.base.copy(L.bone.quaternion);
      }
      const br = Math.sin(state.t * Math.PI * 2 * state.breathRate + state.breathPhase);
      const breathe = (bone, x, z) => {
        tmpQ.setFromEuler(tmpE.set(x, 0, z));
        bone.quaternion.multiply(tmpQ);
      };
      breathe(bones.spine, -0.006 * br, 0);
      breathe(bones.chest, -0.012 * br, 0);
      breathe(bones.shoulderL, 0, 0.012 * br);
      breathe(bones.shoulderR, 0, -0.012 * br);

      /* Look-at: neck 40 %, head 60 %, eased */
      state.lookW += (state.lookWTarget - state.lookW) * k(4);
      if (state.look && state.lookW > 1e-3) {
        bones.chest.updateWorldMatrix(true, false);
        bones.head.getWorldPosition(tmpV);
        tmpV.set(0, 0.11 * s, 0.05 * s).applyMatrix4(bones.head.matrixWorld);
        tmpV2.copy(state.look).sub(tmpV);
        bones.chest.getWorldQuaternion(tmpQ2);
        tmpV2.applyQuaternion(tmpQ2.invert());
        const yaw = THREE.MathUtils.clamp(Math.atan2(tmpV2.x, Math.max(1e-4, tmpV2.z) + Math.max(0, -tmpV2.z) * 0.2), -1.25, 1.25);
        const pitch = THREE.MathUtils.clamp(-Math.atan2(tmpV2.y, Math.hypot(tmpV2.x, tmpV2.z)), -0.6, 0.75);
        state.lookYaw += (yaw - state.lookYaw) * k(7);
        state.lookPitch += (pitch - state.lookPitch) * k(7);
      } else {
        state.lookYaw += (0 - state.lookYaw) * k(3);
        state.lookPitch += (0 - state.lookPitch) * k(3);
      }
      const w = state.lookW;
      if (Math.abs(state.lookYaw * w) + Math.abs(state.lookPitch * w) > 1e-5) {
        tmpQ.setFromEuler(tmpE.set(state.lookPitch * w * 0.4, state.lookYaw * w * 0.4, 0, 'YXZ'));
        bones.neck.quaternion.premultiply(tmpQ);
        tmpQ.setFromEuler(tmpE.set(state.lookPitch * w * 0.6, state.lookYaw * w * 0.6, 0, 'YXZ'));
        bones.head.quaternion.premultiply(tmpQ);
      }
      for (const L of layered) L.written.copy(L.bone.quaternion);
      // Forearm roll: the twist bone takes half the hand's twist about the forearm
      for (const S of ['L', 'R']) {
        const hq = bones[`hand${S}`].quaternion;
        const tw = bones[`forearmTwist${S}`].quaternion;
        const len = Math.hypot(hq.y, hq.w);
        if (len < 1e-6) tw.identity();
        else tw.set(0, hq.y / len, 0, hq.w / len).slerp(IDENTITY_Q, 0.5);
      }

      if (detail === 'low') return;

      /* Expressions */
      const ek = k(11);
      for (const n of Object.keys(state.expr)) {
        const target = n === 'neutral' ? 0 : state.exprTarget[n] || 0;
        state.expr[n] += (target - state.expr[n]) * ek;
      }
      const f = { mouth: [0, 0, 0], jaw: 0, lip: 0, brow: [0, 0], lidUp: 0, lidLo: 0 };
      for (const [n, wv] of Object.entries(state.expr)) {
        if (wv < 1e-4) continue;
        const e = EXPRESSIONS[n];
        if (e.mouth) for (let i = 0; i < 3; i++) f.mouth[i] += e.mouth[i] * wv;
        f.jaw += (e.jaw || 0) * wv;
        f.lip += (e.lip || 0) * wv;
        if (e.brow) {
          f.brow[0] += e.brow[0] * wv;
          f.brow[1] += e.brow[1] * wv;
        }
        f.lidUp += (e.lidUp || 0) * wv;
        f.lidLo += (e.lidLo || 0) * wv;
      }
      // Talking: a loose, irregular jaw
      state.talkV += (state.talk - state.talkV) * k(8);
      if (state.talkV > 1e-3) {
        const n1 = Math.max(0, noise3(state.t * 7.5, 1.3, 0.7) * 0.5 + 0.5);
        f.jaw += state.talkV * (0.04 + 0.14 * n1 * n1);
        f.mouth[0] -= state.talkV * 0.001 * n1;
      }
      const setFace = (name, dx, dy, dz) => {
        const rp = restPos[name];
        bones[name].position.set(rp.x + dx * s, rp.y + dy * s, rp.z + dz * s);
      };
      // A hint of a smile at rest reads friendlier than a dead-straight mouth.
      // When the jaw opens the corners drop with it, so the mouth opens round, not V-shaped.
      const jawK = Math.max(0, f.jaw);
      const cy = f.mouth[1] + 0.0009 * (1 - Math.min(1, jawK * 5)) - jawK * 0.03;
      const cx = f.mouth[0] - jawK * 0.003;
      setFace('mouthL', cx, cy, f.mouth[2] - jawK * 0.004);
      setFace('mouthR', -cx, cy, f.mouth[2] - jawK * 0.004);
      setFace('lipUpper', 0, f.lip, 0);
      bones.jaw.rotation.set(Math.max(0, f.jaw), 0, 0);
      setFace('browL', 0, f.brow[0], 0);
      setFace('browR', 0, f.brow[0], 0);
      bones.browL.rotation.z = f.brow[1];
      bones.browR.rotation.z = -f.brow[1];

      /* Eyes: look target (or ahead) plus saccades */
      state.saccT += d;
      if (state.saccT > state.nextSacc) {
        state.saccT = 0;
        state.nextSacc = 0.35 + r() * 2.2;
        state.sacc[0] = (r() - 0.5) * 0.16;
        state.sacc[1] = (r() - 0.5) * 0.09;
      }
      let ey = 0;
      let ep = 0;
      if (state.look && state.lookW > 0.05) {
        bones.head.updateWorldMatrix(true, false);
        tmpV.set(0, 0, 0).applyMatrix4(bones.eyeL.matrixWorld);
        tmpV.set(0, 0, 0);
        bones.eyeL.localToWorld(tmpV);
        bones.eyeR.localToWorld(tmpV2.set(0, 0, 0));
        tmpV.add(tmpV2).multiplyScalar(0.5);
        tmpV2.copy(state.look).sub(tmpV);
        bones.head.getWorldQuaternion(tmpQ2);
        tmpV2.applyQuaternion(tmpQ2.invert());
        ey = Math.atan2(tmpV2.x, Math.max(1e-3, tmpV2.z)) * state.lookW;
        ep = -Math.atan2(tmpV2.y, Math.hypot(tmpV2.x, tmpV2.z)) * state.lookW;
      }
      ey = THREE.MathUtils.clamp(ey + state.sacc[0], -0.42, 0.42);
      ep = THREE.MathUtils.clamp(ep + state.sacc[1], -0.3, 0.35);
      const ek2 = k(30);
      state.eye[0] += (ey - state.eye[0]) * ek2;
      state.eye[1] += (ep - state.eye[1]) * ek2;
      bones.eyeL.rotation.set(state.eye[1], state.eye[0], 0, 'YXZ');
      bones.eyeR.rotation.set(state.eye[1], state.eye[0], 0, 'YXZ');

      /* Blinks */
      if (state.blinkT <= 0) {
        state.nextBlink -= d;
        if (state.nextBlink <= 0) {
          state.blinkT = 1e-4;
          state.doubleBlink = r() < 0.15;
          state.nextBlink = 1.8 + r() * 4;
        }
      }
      let blink = 0;
      if (state.blinkT > 0) {
        state.blinkT += d / state.blinkDur;
        const bt = state.blinkT;
        blink = bt < 0.4 ? bt / 0.4 : bt < 0.5 ? 1 : Math.max(0, 1 - (bt - 0.5) / 0.5);
        if (bt >= 1) {
          state.blinkT = state.doubleBlink ? 1e-4 : 0;
          state.doubleBlink = false;
        }
      }
      // Lids: rest opening, expression, follow the gaze, then the blink
      const pitch = state.eye[1];
      let upEdge = LID_CLOSED_UP + LID_UP_REST + f.lidUp - pitch * 0.75;
      let loEdge = LID_CLOSED_LO - LID_LO_REST + f.lidLo - pitch * 0.35;
      if (upEdge < loEdge) upEdge = loEdge;
      const meet = loEdge + (upEdge - loEdge) * 0.22;
      upEdge += (meet - upEdge) * blink;
      loEdge += (meet - loEdge) * blink;
      const upRot = -(upEdge - LID_CLOSED_UP);
      const loRot = -(loEdge - LID_CLOSED_LO);
      bones.lidUpL.rotation.set(upRot, state.eye[0] * 0.15, 0);
      bones.lidUpR.rotation.set(upRot, state.eye[0] * 0.15, 0);
      bones.lidLoL.rotation.set(loRot, state.eye[0] * 0.1, 0);
      bones.lidLoR.rotation.set(loRot, state.eye[0] * 0.1, 0);
    },

    dispose() {
      for (const o of attached) if (o.parent) o.parent.remove(o);
      attached.clear();
      if (root.parent) root.parent.remove(root);
      geometry.dispose();
      skeleton.dispose();
      if (lame) lame.dispose();
      releaseMaterials(detail, own, mats);
    }
  };
  person.setPose(POSES.stand());
  person.update(0, 0);
  return person;
}

export { REGION, MAT, FACE };
