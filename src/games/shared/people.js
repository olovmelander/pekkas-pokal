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
 * people-hands.js (finger bones, grip library, grip solver) ·
 * people-build.js (body, hands, clothes) · people-head.js (head, face, hair, hats) ·
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
 *   judge.lookAt(camera.position);           // eyes lead, head follows, chest helps (null releases)
 *   judge.update(dt, t);                     // breathing, blinks, saccades, secondary motion, face
 *   // …or let the person animate itself: judge.blendTo((t) => POSES.idle(t, undefined, judge.look.seed), 0.6)
 *
 *   // Game outfits on top of the person's own look (garment colours reset
 *   // when the garment type changes; pass topColor etc. to choose):
 *   const fencer = createPerson(appearanceFor('Per Vikman', {
 *     outfit: { top: 'fencing', bottom: 'knickers', accent: 0xc9982e }   // accent = socks
 *   }));
 *   fencer.setPose(POSES.ready(t));
 *   fencer.ikLeg('L', frontAnkleWorld);                  // knee pole defaults to forward
 *   fencer.ikArm('R', swordHandWorld, elbowPoleWorld, handWorldQuat);
 *   fencer.hold(foil, 'R', 'foil');          // French grip: fingers close on the handle
 *   coach.hold(mug, 'L', 'hook');            // fingers through the handle, thumb on top
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
 *     gloves: null | 0xf1efe8 | true | { side: 'R'|'L'|'both', color, cuff: true },
 *                                   // glove colour on a cloth region, no nails, optional gauntlet cuff
 *     detail: 'high'|'low',         // ≈10–12k vs ≈1.0–1.5k triangles
 *     ownMaterials: false           // materials are SHARED between people (vertex colours carry
 *                                   //   all colour); true gives this person private ones to tint
 *   }
 *
 *   → person = {
 *     root,        // Group to add to the scene; it stands on its origin, facing +Z
 *     mesh,        // the SkinnedMesh (castShadow/receiveShadow on; generous bounding sphere)
 *     bones,       // by name, see below
 *     sockets,     // gripL, gripR (in the fist; +Z out of the thumb side, +Y up the forearm),
 *                  // holdL, holdR (the current grip's object frame, see hold()),
 *                  // headTop (crown), face (in front of the eyes)
 *     height, triangles, materials { skin, cloth, gloss, lame? }, look (resolved spec),
 *     setPose(pose, blend = 1),     // also ends a blendTo
 *     blendTo(pose | (t) => pose, seconds = 0.4)   // eased transition driven by update(); a function
 *                  // keeps animating afterwards (until the next setPose); person.blending while easing
 *     ikArm(side 'L'|'R', target, pole?, handWorldQuat?) → metres out of reach (0 = reached)
 *     ikLeg(side, target, pole?, footWorldQuat?)        → idem
 *     lookAt(point|null, weight = 1),
 *     setExpression(name | { smile: .5, focus: .5 }, amount = 1),   // EXPRESSION_NAMES:
 *                  // neutral smile grin shout frown focus surprised
 *     blink(), talk(0..1)  // talk flaps the jaw irregularly until talk(0)
 *     update(dt, t),       // once per frame AFTER posing/IK: breathing, a little personal sway,
 *                          //   secondary motion (chest and head lag the root's acceleration and
 *                          //   turns, then settle), look-at (eyes lead with micro-saccades, the head
 *                          //   follows on a spring, the chest takes a share of big turns, big gaze
 *                          //   shifts blink), talking (phrases, pauses, varied syllables, nods),
 *                          //   lids, eyes, grip transitions, forearm roll
 *     attach(object, boneOrSocket, { position, rotation, quaternion, scale } | Matrix4),
 *     hold(object, side, grip, opts), release(side), setGrip(side, grip, opts), gripOf(side),
 *     holdWith(side, object, opts)   // see "Hands and holding"
 *     dispose()            // geometry, skeleton texture, materials (refcounted); detaches what
 *                          //   is still attached to THIS person (not objects handed on)
 *   }
 *
 * ── Hands and holding (people-hands.js) ─────────────────────────────────
 *
 *   person.hold(object, side = 'R', grip = 'power', opts = {}) → object
 *     Parents `object` to sockets.holdL/holdR and closes every finger joint on its surface
 *     (signed-distance solve, cached per grip + size) over opts.blend seconds (default 0.2).
 *     OBJECT CONVENTION: origin = the grip centre; +Y = the long axis, pointing to the business
 *     end (bat barrel, rod tip, blade, brush tip, the cup's rim); +Z = the way the palm faces.
 *     Sizes are world metres.
 *       'power'    cylinder handle (bat, rod, umbrella): diameter (0.032), length
 *       'racket'   shakehand table tennis: +Y handle→blade, +Z the forehand rubber;
 *                  handle [width, thickness] (0.026, 0.022), blade (radius 0.078)
 *       'foil'     French grip: +Y pommel→blade, +Z the flat under the thumb; handle [w, t]
 *       'pinch'    tripod for a pen or brush, +Y towards the tip: diameter (0.009)
 *       'hook'     through a mug handle: origin = middle of the handle bar, +Y the mug's up,
 *                  +Z towards the mug body: bar (0.008), handle (inner height 0.04)
 *       'cup'      around a cup without a handle: origin on its axis, +Y up: diameter (0.075), height
 *       'flat'     notebook/clipboard/scorecard: origin = the held edge's middle at mid-thickness,
 *                  +Y the top face (thumb side), the board extends along +Z: thickness (0.01)
 *       'palette'  thumb up through the hole: origin = the hole's centre, +Y the paint side, the
 *                  board reaches out along +X (as painting/cast.js builds it): thickness
 *       'ball'     a small ball in the fingertips (ping-pong toss): origin = centre: diameter (0.04)
 *       'relaxed' 'open' 'fist' 'point' 'thumbsUp'   hand shapes, no object needed
 *     opts.offset = { position, rotation | quaternion } nudges the object inside the grip frame.
 *     Calling hold/setGrip again with the same grip and sizes changes nothing (safe every frame).
 *   person.release(side, { detach = true, blend = 0.25 }) → the object; the pose drives the fingers again
 *   person.setGrip(side, grip | null, opts) → sockets.holdX   fingers only (null hands them back)
 *   person.gripOf(side) → grip name | null
 *   person.holdWith(side, object, { at: [x, y, z], roll, grip = 'power', pole, ...opts }) → metres short
 *     Two-handed holds (rod, oar, foil salute): IKs the `side` arm so that hand grips `object` at
 *     `at` (object space; roll turns the hand about the object's +Y). Call every frame after
 *     posing the holding arm and before update().
 *   Without a grip the legacy pose fields still drive the fingers: gripL/gripR (0 open,
 *   0.25 relaxed, 1 fist — its hole is on the gripL/gripR socket) and pointL/pointR.
 *
 * ── Skeleton ────────────────────────────────────────────────────────────
 *
 *   hips → spine → chest → neck → head
 *   chest → shoulderL/R (clavicle) → upperArmL/R → forearmL/R → handL/R
 *           forearmTwistL/R (driven by update: half the hand's twist, for a clean wrist)
 *           handL/R → thumb (CMC) → thumbMid → thumbTip; index → indexMid → indexTip;
 *                     middle → middleMid → middleTip; palm (arch) → ring…, pinky… (…Mid, …Tip)
 *           (driven by grips / gripX / pointX; old names fingers = middle, fingersTip = middleMid)
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
 *   stand, idle(t, out, seed), sit, sitCup(t), sitRod(t), sitClap(t), sitCheer(t), cheer(t), clap(t),
 *   point (right hand; mirrorPose for the left), handsOnHips, armsCrossed, ready(t) (athletic
 *   stance), explain(t) (talking gesture), holdNotebook(t), walk(phase, out, style), stroll(phase),
 *   brisk(phase).
 *   idle: contrapposto weight shifts every 6–10 s (feet planted, free knee soft), sway and an
 *     occasional fidget (look round, shoulder roll, hand rub, onto the toes). Pass the person's
 *     seed (person.look.seed) so a group never moves in unison.
 *   walk: leg IK with heel strike, roll over the foot and toe-off, pelvis turn/tilt/shift, a
 *     vertical bob, counter-rotating shoulders, arm swing with a bent elbow and a steadied head.
 *     style 'stroll' | 'walk' | 'brisk' or 0..1. Move the root WALK_STRIDES[style] × height/1.8
 *     forward per 2π of phase (WALK_STRIDE = WALK_STRIDES.walk) and the planted foot stays put.
 *   Seated: the seat is SEAT_HEIGHT × height/1.8 up, centred SEAT_BACK behind the root.
 *   Games may also write bone.rotation directly between setPose and update; update()
 *   layers breathing and look-at on top without drifting.
 *
 * ── createCrowd(opts) (see people-crowd.js) ─────────────────────────────
 *
 *   const crowd = createCrowd({ seats: [{ position, rotationY, pose: 'sit'|'stand', cup? }],
 *                               names: PARTICIPANT_NAMES, seed, hats: 0.12, castShadow: true });
 *   scene.add(crowd.root);
 *   crowd.react('cheer' | 'clap' | 'polite' | 'groan' | 'ovation' | 'idle', seconds = 2.2);  // one-shot
 *        // groan: hands to the head, then a slump (head in hands), then back; the rest sink back
 *   crowd.setMood('idle' | 'clap' | 'polite' | 'cheer' | 'ovation');               // between reactions
 *   crowd.setLean(amount);   // 0 … 1 leaning in (elbows on knees); −0.3 leans back; eased per member
 *   crowd.lookAt(ball.position | null);  crowd.update(dt, t);  crowd.drawCalls;  crowd.dispose();
 *   Typically 2–5 draw calls for any number of spectators (one per pose variant in use). Each
 *   member has their own delay, lean depth and lag, slump depth and clap rate. Mesh names stay
 *   crowd:<sit|stand>:<idle|cup|clapIn|clapOut|cheer|fist|fistL|groan|polite>; cups are held
 *   in the 'cup' grip.
 */
import * as THREE from 'three';
import {
  BONE_DEFS, A_POSE, POSES, applyPose, solveTwoBone, emptyPose, mixPoses, mirrorPose, SEAT_HEIGHT, SEAT_BACK, WALK_STRIDE,
  WALK_STRIDES, BODY_BONES,
  HEAD_C, HEAD_SCALE, FACE
} from './people-rig.js';
import { REGION, MAT, noise3, rng, sstep } from './people-build.js';
import { LID_CLOSED_UP, LID_CLOSED_LO, HAIR_STYLE_NAMES } from './people-head.js';
import { appearanceFor, resolveLook, PARTICIPANT_NAMES, SKIN_TONES, HAIR_COLORS, EYE_COLORS } from './people-look.js';
import { buildPersonData, toBindPose, toGeometry, makeSkeleton } from './people-assemble.js';
import { createCrowd } from './people-crowd.js';
import {
  solveGrip, legacyConfig, writeConfig, readConfig, mixConfigs, GRIP_NAMES, HAND_BONES, HAND_BONE_COUNT
} from './people-hands.js';

export {
  POSES, mixPoses, mirrorPose, emptyPose, SEAT_HEIGHT, SEAT_BACK, WALK_STRIDE, WALK_STRIDES, BONE_DEFS, A_POSE,
  appearanceFor, PARTICIPANT_NAMES, SKIN_TONES, HAIR_COLORS, EYE_COLORS, HAIR_STYLE_NAMES, createCrowd,
  GRIP_NAMES, HAND_BONES
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
    vertexColors: true, roughness: 0.5, metalness: 0, sheen: 0.25, sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0.7, 0.32, 0.24)
  });
  // Cloth: matte with a velvety rim
  const cloth = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.82, metalness: 0, sheen: 0.4, sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0.38, 0.38, 0.38)
  });
  // Eyes, teeth, glasses, buttons, leather: a wet, glossy coat
  const gloss = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.24, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.035
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
  smile: { mouth: [0.003, 0.0056, -0.0018], jaw: 0, lip: 0, brow: [0.0014, -0.03], lidUp: -0.03, lidLo: 0.16 },
  grin: { mouth: [0.0055, 0.0068, -0.0022], jaw: 0.15, lip: 0.0028, brow: [0.0022, -0.05], lidUp: -0.05, lidLo: 0.24 },
  shout: { mouth: [0.0014, 0.0, 0.0004], jaw: 0.37, lip: 0.0032, brow: [-0.0016, 0.17], lidUp: 0.06, lidLo: 0.06 },
  frown: { mouth: [-0.0008, -0.0044, 0.0], jaw: 0.012, lip: 0, brow: [-0.0026, 0.2], lidUp: -0.09, lidLo: 0.05 },
  focus: { mouth: [-0.0018, -0.0008, 0.0004], jaw: 0, lip: 0, brow: [-0.002, 0.15], lidUp: -0.13, lidLo: 0.12 },
  surprised: { mouth: [-0.0042, 0.0, 0.0012], jaw: 0.26, lip: 0.0012, brow: [0.0058, -0.1], lidUp: 0.15, lidLo: -0.07 }
};
export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS);

const LID_UP_REST = 0.5 - LID_CLOSED_UP;
const LID_LO_REST = 0.6 + LID_CLOSED_LO;

/* ------------------------------------------------------------ the person */

let personCount = 0;
const IDENTITY_Q = new THREE.Quaternion();
const NO_HANDS = { L: true, R: true };
const SIZE_KEYS = ['diameter', 'length', 'blade', 'bar', 'handle', 'thickness', 'height'];
const easeInOut = (x) => x * x * (3 - 2 * x);

/** Grip options in world metres → model metres (÷ person scale). */
function modelOpts(opts, s) {
  const o = {};
  for (const k of SIZE_KEYS) {
    const v = opts[k];
    if (v === undefined) continue;
    o[k] = Array.isArray(v) ? v.map((x) => x / s) : v / s;
  }
  return o;
}

/** Is `o` still somewhere under `root`? */
function isUnder(o, root) {
  for (let p = o.parent; p; p = p.parent) if (p === root) return true;
  return false;
}

export function createPerson(specIn = {}) {
  const look = resolveLook(specIn);
  // Gloves ride along on the look (people-build reads look.gloves)
  look.gloves = specIn.gloves ?? specIn.outfit?.gloves ?? null;
  const detail = specIn.detail === 'low' ? 'low' : 'high';
  const s = look.height / 1.8;
  const { b, joints, H, build } = buildPersonData(look, detail);
  const handScale = build.hand ?? 1.09;
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
    breathPhase: r() * 6.28,
    // Eye → head → chest look-at: springs for the head and chest shares
    headYaw: 0, headYawV: 0, headPitch: 0, headPitchV: 0, chestYaw: 0, chestYawV: 0, chestPitch: 0, chestPitchV: 0,
    gazeBlinkT: 0, microT: 0, micro: [0, 0],
    // Secondary motion: the upper body lags the root's acceleration
    rootPrev: null, rootVel: new THREE.Vector3(), rootAcc: new THREE.Vector3(), rootYaw: 0, rootYawV: 0,
    secX: 0, secXV: 0, secZ: 0, secZV: 0, secY: 0, secYV: 0,
    // A little life of one's own (desynchronises groups on the same pose)
    alive: [r() * 6.28, r() * 6.28, r() * 6.28, 0.8 + r() * 0.5],
    // Talking rhythm
    talkSeed: Math.floor(r() * 1e6), talkPhase: 0, talkNod: 0,
    // blendTo
    blendPose: null, blendT: 0, blendDur: 0, blendFrom: null, blendHips: new THREE.Vector3()
  };
  for (const n of Object.keys(EXPRESSIONS)) state.expr[n] = n === 'neutral' ? 1 : 0;
  const attached = new Set();
  /* Hands: a grip override per side (hold / setGrip) and eased transitions */
  const mkHand = (S) => ({
    S, grip: null, opts: null, solved: null, object: null, anchor: null, key: '',
    from: new Float32Array(HAND_BONE_COUNT * 4), cfg: new Float32Array(HAND_BONE_COUNT * 4),
    k: 1, dur: 0.2
  });
  const hands = { L: mkHand('L'), R: mkHand('R') };
  let posedSinceUpdate = false;
  let lastPose = null;
  const sideOf = (side) => (side === 'L' || side === 1 || side === 'left' ? 'L' : 'R');
  const startHandBlend = (h, dur) => {
    readConfig(bones, h.S, h.from);
    h.k = dur > 0 ? 0 : 1;
    h.dur = dur;
  };
  /** Write one side's fingers: the override (or the pose's legacy grip), through any transition. */
  const writeHand = (h, pose, blend) => {
    let target;
    if (h.solved) target = h.solved.config;
    else target = legacyConfig(pose ? pose[`grip${h.S}`] ?? 0.25 : 0.25, pose ? pose[`point${h.S}`] ?? 0 : 0, h.cfg);
    if (h.k < 1) {
      mixConfigs(h.from, target, easeInOut(h.k), h.cfg);
      writeConfig(bones, h.S, h.cfg, 1);
    } else writeConfig(bones, h.S, target, blend);
  };
  const anchorFor = (h) => {
    if (!h.anchor) {
      h.anchor = new THREE.Object3D();
      h.anchor.name = `hold${h.S}`;
      bones[`hand${h.S}`].add(h.anchor);
      sockets[`hold${h.S}`] = h.anchor;
    }
    const sv = h.solved;
    const m = h.S === 'R' ? -1 : 1;
    if (sv && sv.pos) {
      h.anchor.position.set(sv.pos.x * s * m, sv.pos.y * s, sv.pos.z * s);
      h.anchor.quaternion.set(sv.quat.x, sv.quat.y * m, sv.quat.z * m, sv.quat.w);
    } else {
      h.anchor.position.copy(sockets[`grip${h.S}`].position);
      h.anchor.quaternion.identity();
    }
    return h.anchor;
  };
  const setOverride = (h, grip, opts = {}) => {
    const name = grip && GRIP_NAMES.includes(grip) ? grip : grip ? 'relaxed' : null;
    // Calling again with the same grip and sizes (e.g. every frame) changes nothing
    const key = name ? `${name}|${JSON.stringify(modelOpts(opts, s))}` : '';
    if (key === h.key) return;
    h.key = key;
    startHandBlend(h, opts.blend ?? 0.2);
    h.grip = name;
    h.opts = opts;
    h.solved = name ? solveGrip(name, modelOpts(opts, s), handScale) : null;
    if (name) anchorFor(h);
    if (!posedSinceUpdate || h.k >= 1) writeHand(h, lastPose, 1);
  };
  const tmpHQ = new THREE.Quaternion();
  const tmpHQ2 = new THREE.Quaternion();
  const tmpHV = new THREE.Vector3();
  const tmpHV2 = new THREE.Vector3();
  const tmpAcc = new THREE.Vector3();
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
      // Blend from last frame's pose, not from it plus last frame's look-at and
      // breathing: those layers would otherwise feed back into the base every
      // frame and grow by 1/blend (a head turned 140° at 60+ fps).
      if (blend < 1) {
        for (const L of layered) if (L.bone.quaternion.equals(L.written)) L.bone.quaternion.copy(L.base);
      }
      state.blendPose = null;
      applyPose(bones, pose, blend, restPos, s, NO_HANDS);
      writeHand(hands.L, pose, blend);
      writeHand(hands.R, pose, blend);
      lastPose = pose;
      posedSinceUpdate = true;
    },

    /**
     * Ease from the current posture into `pose` over `seconds` (smoothstep),
     * driven by update() — no setPose calls needed meanwhile. `pose` may be
     * a pose object or a function (t) → pose (e.g. (t) => POSES.idle(t, o, seed)),
     * which keeps animating after the blend. The next setPose() takes over.
     */
    blendTo(pose, seconds = 0.4) {
      if (!state.blendFrom) state.blendFrom = BODY_BONES.map(() => new THREE.Quaternion());
      BODY_BONES.forEach((n, i) => state.blendFrom[i].copy(bones[n].quaternion));
      // Start from the base pose, not from last frame's look-at/breathing layers
      for (const L of layered) {
        if (L.bone.quaternion.equals(L.written)) state.blendFrom[BODY_BONES.indexOf(L.bone.name)]?.copy(L.base);
      }
      state.blendHips.copy(bones.hips.position);
      state.blendPose = pose;
      state.blendT = 0;
      state.blendDur = Math.max(1e-3, seconds);
      for (const S of ['L', 'R']) if (!hands[S].solved) startHandBlend(hands[S], seconds);
    },

    /** True while blendTo is still easing. */
    get blending() {
      return !!state.blendPose && state.blendT < state.blendDur;
    },

    /**
     * Hold `object` in a hand with a grip from the grip library (see the
     * header for the object conventions). The fingers close around it over
     * opts.blend seconds. Returns the object.
     */
    hold(object, side = 'R', grip = 'power', opts = {}) {
      const h = hands[sideOf(side)];
      if (h.object && h.object !== object && isUnder(h.object, root)) h.object.parent.remove(h.object);
      setOverride(h, grip, opts);
      const anchor = anchorFor(h);
      if (object) {
        anchor.add(object);
        object.position.set(0, 0, 0);
        object.quaternion.identity();
        const off = opts.offset;
        if (off) {
          if (off.position) object.position.fromArray(off.position.toArray ? off.position.toArray() : off.position);
          if (off.quaternion) object.quaternion.copy(off.quaternion);
          else if (off.rotation) object.rotation.fromArray(off.rotation.toArray ? off.rotation.toArray() : off.rotation);
        }
        if (opts.scale !== undefined) object.scale.setScalar(opts.scale);
        attached.add(object);
      }
      h.object = object || null;
      return object;
    },

    /** Let go: detaches the held object (if still ours) and returns it; the pose drives the fingers again. */
    release(side = 'R', { detach = true, blend = 0.25 } = {}) {
      const h = hands[sideOf(side)];
      const o = h.object;
      if (o && detach && isUnder(o, root)) o.parent.remove(o);
      if (o) attached.delete(o);
      h.object = null;
      setOverride(h, null, { blend });
      return o;
    },

    /**
     * Fingers only: shape a hand with a grip (null hands it back to the
     * pose's gripX/pointX). Returns the grip anchor (sockets.holdL/R), the
     * frame an object would sit in.
     */
    setGrip(side, grip, opts = {}) {
      const h = hands[sideOf(side)];
      if (!grip) {
        setOverride(h, null, opts);
        return null;
      }
      setOverride(h, grip, opts);
      return anchorFor(h);
    },

    /** The grip a hand is in (null = driven by the pose). */
    gripOf(side) {
      return hands[sideOf(side)].grip;
    },

    /**
     * Two-handed holds: reach the `side` hand to a point on an object the
     * other hand holds and close it there. at: [x, y, z] in the object's
     * space (default on its long axis, 0.25 m below the origin), roll:
     * turn of the hand about the object's +Y, grip/opts as hold(), pole:
     * world elbow pole. Call every frame after posing the other arm.
     * Returns metres out of reach.
     */
    holdWith(side, object, { at = [0, -0.25, 0], roll = 0, grip = 'power', pole, ...opts } = {}) {
      const S = sideOf(side);
      const h = hands[S];
      setOverride(h, grip, opts);
      const anchor = anchorFor(h);
      object.updateWorldMatrix(true, false);
      tmpHV.fromArray(at).applyMatrix4(object.matrixWorld);
      object.getWorldQuaternion(tmpHQ);
      if (roll) tmpHQ.multiply(tmpHQ2.setFromAxisAngle(tmpHV2.set(0, 1, 0), roll));
      // hand = point × anchor⁻¹
      tmpHQ.multiply(tmpHQ2.copy(anchor.quaternion).invert());
      tmpHV2.copy(anchor.position).applyQuaternion(tmpHQ);
      tmpHV.sub(tmpHV2);
      return person.ikArm(S, tmpHV, pole, tmpHQ);
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

      /* blendTo: ease into the target pose (only when the game did not pose this frame) */
      if (state.blendPose && !posedSinceUpdate) {
        const pose = typeof state.blendPose === 'function' ? state.blendPose(state.t) : state.blendPose;
        state.blendT += d;
        const e = easeInOut(Math.min(1, state.blendT / state.blendDur));
        applyPose(bones, pose, 1, restPos, s, NO_HANDS);
        if (e < 1) {
          BODY_BONES.forEach((n, i) => bones[n].quaternion.slerpQuaternions(state.blendFrom[i], bones[n].quaternion, e));
          bones.hips.position.lerpVectors(state.blendHips, bones.hips.position, e);
        }
        writeHand(hands.L, pose, 1);
        writeHand(hands.R, pose, 1);
        lastPose = pose;
        if (e >= 1 && typeof state.blendPose !== 'function') state.blendPose = null;
      }

      /* Layered body motion: restore last frame's base unless the game re-posed */
      for (const L of layered) {
        if (L.bone.quaternion.equals(L.written)) L.bone.quaternion.copy(L.base);
        else L.base.copy(L.bone.quaternion);
      }
      const br = Math.sin(state.t * Math.PI * 2 * state.breathRate + state.breathPhase);
      const breathe = (bone, x, z, y = 0) => {
        tmpQ.setFromEuler(tmpE.set(x, y, z));
        bone.quaternion.multiply(tmpQ);
      };
      breathe(bones.spine, -0.006 * br, 0);
      breathe(bones.chest, -0.012 * br, 0);
      breathe(bones.shoulderL, 0, 0.012 * br);
      breathe(bones.shoulderR, 0, -0.012 * br);
      // A little personal sway, so people on the same pose never move in unison
      const al = state.alive;
      const at = state.t * al[3];
      breathe(bones.spine, 0, 0.007 * Math.sin(at * 0.53 + al[0]), 0.006 * Math.sin(at * 0.31 + al[1]));
      breathe(bones.neck, 0.005 * Math.sin(at * 0.71 + al[2]), 0.004 * Math.sin(at * 0.43 + al[0]));

      /* Secondary motion: the chest and head lag the root's acceleration, then settle */
      if (d > 1e-4) {
        root.getWorldPosition(tmpV);
        root.getWorldQuaternion(tmpQ2);
        const yawNow = Math.atan2(2 * (tmpQ2.w * tmpQ2.y + tmpQ2.x * tmpQ2.z), 1 - 2 * (tmpQ2.y * tmpQ2.y + tmpQ2.x * tmpQ2.x));
        if (!state.rootPrev || state.rootPrev.distanceTo(tmpV) > 1.5) {
          state.rootPrev = (state.rootPrev || new THREE.Vector3()).copy(tmpV);
          state.rootVel.set(0, 0, 0);
          state.rootAcc.set(0, 0, 0);
          state.rootYaw = yawNow;
          state.rootYawV = 0;
        }
        tmpV2.subVectors(tmpV, state.rootPrev).divideScalar(d);
        state.rootPrev.copy(tmpV);
        const acc = tmpAcc.copy(tmpV2).sub(state.rootVel).divideScalar(d);
        state.rootVel.copy(tmpV2);
        state.rootAcc.lerp(acc.clampLength(0, 30), k(14));
        let dy = yawNow - state.rootYaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        state.rootYaw = yawNow;
        const yawV = THREE.MathUtils.clamp(dy / d, -8, 8);
        const yawA = (yawV - state.rootYawV) / d;
        state.rootYawV = yawV;
        // Into the person's frame: +z forward, +x their left
        const la = acc.copy(state.rootAcc).applyQuaternion(tmpQ2.invert());
        const spring = (x, v, target, w0, z) => {
          const a = w0 * w0 * (target - x) - 2 * z * w0 * v;
          const nv = v + a * d;
          return [x + nv * d, nv];
        };
        const tx = THREE.MathUtils.clamp(-la.z * 0.011, -0.09, 0.09);
        const tz = THREE.MathUtils.clamp(la.x * 0.009, -0.07, 0.07);
        const ty = THREE.MathUtils.clamp(-yawA * 0.0035, -0.12, 0.12);
        [state.secX, state.secXV] = spring(state.secX, state.secXV, tx, 9, 0.55);
        [state.secZ, state.secZV] = spring(state.secZ, state.secZV, tz, 9, 0.55);
        [state.secY, state.secYV] = spring(state.secY, state.secYV, ty, 8, 0.6);
        if (Math.abs(state.secX) + Math.abs(state.secZ) + Math.abs(state.secY) > 1e-5) {
          breathe(bones.chest, state.secX, state.secZ, state.secY * 0.5);
          breathe(bones.head, -state.secX * 0.4 + state.secXV * 0.004, -state.secZ * 0.4, state.secY);
        }
      }

      /* Look-at: the eyes lead, the head follows on a spring, the chest helps on big turns */
      state.lookW += (state.lookWTarget - state.lookW) * k(4);
      let yawT = 0;
      let pitchT = 0;
      if (state.look && state.lookW > 1e-3) {
        bones.chest.updateWorldMatrix(true, false);
        tmpV.set(0, 0.11 * s, 0.05 * s).applyMatrix4(bones.head.matrixWorld);
        tmpV2.copy(state.look).sub(tmpV);
        bones.chest.getWorldQuaternion(tmpQ2);
        tmpV2.applyQuaternion(tmpQ2.invert());
        yawT = THREE.MathUtils.clamp(Math.atan2(tmpV2.x, Math.max(1e-4, tmpV2.z) + Math.max(0, -tmpV2.z) * 0.2), -1.6, 1.6);
        pitchT = THREE.MathUtils.clamp(-Math.atan2(tmpV2.y, Math.hypot(tmpV2.x, tmpV2.z)), -0.6, 0.75);
      }
      const w = state.lookW;
      // The chest takes a share of big turns, the head the rest
      const chestYawT = THREE.MathUtils.clamp(Math.sign(yawT) * Math.max(0, Math.abs(yawT) - 0.55) * 0.55, -0.4, 0.4);
      const chestPitchT = pitchT * 0.12;
      const crit = (x, v, target, w0) => {
        // Critically damped spring, exact step
        const y = x - target;
        const e = Math.exp(-w0 * d);
        const tmp = (v + w0 * y) * d;
        return [target + (y + tmp) * e, (v - w0 * tmp) * e];
      };
      const prevHead = state.headYaw;
      const headTarget = yawT - chestYawT;
      if (Math.abs(headTarget - prevHead) > 0.6 && state.gazeBlinkT <= 0 && w > 0.5) {
        // Big gaze shifts come with a blink
        person.blink();
        state.gazeBlinkT = 1.2;
      }
      state.gazeBlinkT -= d;
      [state.headYaw, state.headYawV] = crit(state.headYaw, state.headYawV, headTarget, 9);
      [state.headPitch, state.headPitchV] = crit(state.headPitch, state.headPitchV, pitchT - chestPitchT, 9);
      [state.chestYaw, state.chestYawV] = crit(state.chestYaw, state.chestYawV, chestYawT, 4.5);
      [state.chestPitch, state.chestPitchV] = crit(state.chestPitch, state.chestPitchV, chestPitchT, 4.5);
      state.lookYaw = state.headYaw + state.chestYaw;
      state.lookPitch = state.headPitch + state.chestPitch;
      if (Math.abs(state.chestYaw * w) + Math.abs(state.chestPitch * w) > 1e-5) {
        tmpQ.setFromEuler(tmpE.set(state.chestPitch * w * 0.6, state.chestYaw * w * 0.65, 0, 'YXZ'));
        bones.chest.quaternion.premultiply(tmpQ);
        tmpQ.setFromEuler(tmpE.set(state.chestPitch * w * 0.4, state.chestYaw * w * 0.35, 0, 'YXZ'));
        bones.spine.quaternion.premultiply(tmpQ);
      }
      if (Math.abs(state.headYaw * w) + Math.abs(state.headPitch * w) > 1e-5) {
        tmpQ.setFromEuler(tmpE.set(state.headPitch * w * 0.4, state.headYaw * w * 0.4, 0, 'YXZ'));
        bones.neck.quaternion.premultiply(tmpQ);
        tmpQ.setFromEuler(tmpE.set(state.headPitch * w * 0.6, state.headYaw * w * 0.6, 0, 'YXZ'));
        bones.head.quaternion.premultiply(tmpQ);
      }
      // Talking: the head nods on stressed syllables
      if (state.talkNod > 1e-4) breathe(bones.head, state.talkNod * 0.035, 0);
      for (const L of layered) L.written.copy(L.bone.quaternion);
      // Hands: advance grip transitions (and write them if nobody posed this frame)
      for (const S of ['L', 'R']) {
        const h = hands[S];
        if (h.k < 1) h.k = Math.min(1, h.k + d / Math.max(1e-3, h.dur));
        if (!posedSinceUpdate && (h.solved || h.k < 1)) writeHand(h, lastPose, 1);
      }
      posedSinceUpdate = false;
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
      // Talking: phrases and pauses, syllables of varying rate and size,
      // wide and round vowels, a brow lift and a nod on the stressed ones
      state.talkV += (state.talk - state.talkV) * k(8);
      state.talkNod *= 1 - k(6);
      if (state.talkV > 1e-3) {
        const ts = state.t;
        const sd = state.talkSeed % 977;
        const phrase = sstep(-0.45, -0.2, noise3(ts * 0.42, sd, 0.3));
        const rate = 4.1 + 1.3 * noise3(ts * 0.6, sd, 2.1);
        state.talkPhase += d * rate * Math.PI * 2;
        const syl = Math.floor(state.talkPhase / (Math.PI * 2));
        const hs = ((Math.imul(syl + sd * 131, 2654435761) >>> 0) % 1000) / 1000;
        const amp = 0.35 + 0.65 * hs;
        const open = Math.pow(Math.max(0, Math.sin(state.talkPhase)), 1.4);
        const kTalk = state.talkV * phrase;
        f.jaw += kTalk * (0.025 + 0.15 * amp * open);
        const vowel = noise3(ts * 2.3, sd, 4.4);
        f.mouth[0] += kTalk * 0.0018 * vowel - kTalk * 0.0008 * open;
        f.mouth[2] += kTalk * 0.0012 * Math.max(0, -vowel);
        f.lip += kTalk * 0.0009 * open;
        if (hs > 0.82 && open > 0.6) {
          f.brow[0] += kTalk * 0.0016 * open;
          state.talkNod = Math.max(state.talkNod, kTalk * 0.6 * open);
        }
      }
      const setFace = (name, dx, dy, dz) => {
        const rp = restPos[name];
        bones[name].position.set(rp.x + dx * s, rp.y + dy * s, rp.z + dz * s);
      };
      // A hint of a smile at rest reads friendlier than a dead-straight mouth.
      // When the jaw opens the corners drop with it, so the mouth opens round, not V-shaped.
      const jawK = Math.max(0, f.jaw);
      const cy = f.mouth[1] + 0.0009 * (1 - Math.min(1, jawK * 5)) - jawK * 0.034;
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
      const fixating = state.look && state.lookW > 0.5;
      if (state.saccT > state.nextSacc) {
        // Free gaze wanders; a fixation only trembles (micro-saccades)
        state.saccT = 0;
        state.nextSacc = fixating ? 0.25 + r() * 0.6 : 0.35 + r() * 2.2;
        const amp = fixating ? 0.18 : 1;
        state.sacc[0] = (r() - 0.5) * 0.16 * amp;
        state.sacc[1] = (r() - 0.5) * 0.09 * amp;
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
      // Only what is still ours: an object handed on to someone else stays with them
      for (const o of attached) if (o.parent && isUnder(o, root)) o.parent.remove(o);
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
