/**
 * Pekkas Pokal — people: a crowd that costs a handful of draw calls.
 *
 * One low-detail person is built with EVERY optional head piece (seven hair
 * styles, beard, moustache, glasses, cap, beanie), then posed and baked on
 * the CPU into a few static variants — seated, seated with a cup, two clap
 * frames, arms up, hands on the head, a polite clap, and the same standing.
 * Each variant is one InstancedMesh, so a crowd of any size draws one call
 * per variant in use (typically 2–5).
 *
 * Some variants carry a MORPH to a second baked pose, blended per instance
 * in the vertex shader: idle/cup → leaning in (elbows on the knees), groan
 * (hands on the head) → slumped forward with the head in the hands, polite
 * → palms together. So leaning, slumping and applauding move smoothly.
 *
 * Per instance the shader picks: five colours (skin, hair, top, bottom,
 * accent), which optional pieces show (a bit mask — hidden pieces collapse
 * to zero-area triangles), a head yaw/pitch that turns everything weighted
 * to the head around the neck, and the morph weight. Swapping a member
 * between variants is how cheering animates; bobbing is the instance matrix.
 *
 *   const crowd = createCrowd({ seats: [{ position, rotationY, pose: 'sit' | 'stand' }], names });
 *   scene.add(crowd.root);
 *   crowd.react(kind, seconds);    // one-shot: 'cheer' | 'clap' | 'polite' | 'groan' | 'ovation' | 'idle'
 *                                  //   groan = hands to the head, then a slump, then back
 *   crowd.setMood(kind);           // between reactions: 'idle' | 'clap' | 'polite' | 'cheer' | 'ovation'
 *   crowd.setLean(amount);         // 0 sit back … 1 leaning right in (−0.3 leans back); eased
 *                                  //   per member, each with their own lag and depth
 *   crowd.lookAt(ball.position);   // heads follow (null: idle glances)
 *   crowd.update(dt, t);
 *   Mesh names are stable: crowd:<sit|stand>:<idle|cup|clapIn|clapOut|cheer|fist|fistL|groan|polite>.
 *   Members holding a cup hold it in the 'cup' grip (people-hands.js).
 */
import * as THREE from 'three';
import { POSES, applyPose, mirrorPose, solveTwoBone } from './people-rig.js';
import { solveGrip, writeConfig } from './people-hands.js';
import { REGION, rng } from './people-build.js';
import { appearanceFor, resolveLook } from './people-look.js';
import { buildPersonData, toBindPose, makeSkeleton, crowdAccessories } from './people-assemble.js';

const HAIR_BIT = { crop: 0, sidePart: 0, tousled: 0, sweptBack: 1, curly: 2, long: 3, bun: 4, balding: 5, buzz: 6, bald: -1 };
const CLAP_IN_T = 0.35 / 2.3;
const sstep01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/* Crowd-only poses: FK bases, finished with arm IK at bake time (see `ik`) */
const SIT_BODY = ['hips', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];
const seated = (p) => {
  const s = POSES.sit(0);
  for (const n of SIT_BODY) p[n] = s[n].slice();
  p.hipsPos = s.hipsPos.slice();
  return p;
};
const lean = (p, k) => {
  p.spine = [0.06 + 0.22 * k, 0, 0];
  p.chest = [0.08 + 0.16 * k, 0, 0];
  p.neck = [0.02 - 0.1 * k, 0, 0];
  p.head = [-0.06 - 0.22 * k, 0, 0];
  return p;
};
const CROWD_POSES = {
  sitLean: () => lean(seated(POSES.stand(0)), 1),
  sitCupLean: () => {
    const p = POSES.sitCup(0);
    p.spine = [0.25, 0, 0];
    p.chest = [0.2, 0, 0];
    p.head = [-0.25, 0, 0];
    return p;
  },
  standLean: () => {
    const p = POSES.stand(0);
    p.hipsPos = [0, -0.02, -0.01];
    p.spine = [0.16, 0, 0];
    p.chest = [0.1, 0, 0];
    p.head = [-0.2, 0, 0];
    for (const S of ['L', 'R']) {
      p[`thigh${S}`] = [-0.2, 0, S === 'L' ? 0.04 : -0.04];
      p[`shin${S}`] = [0.4, 0, 0];
      p[`foot${S}`] = [-0.2, 0, 0];
    }
    return p;
  },
  groan: (sit) => {
    const p = sit ? seated(POSES.stand(0)) : POSES.stand(0);
    p.spine = [-0.05, 0, 0];
    p.chest = [-0.08, 0, 0];
    p.head = [-0.18, 0, 0];
    p.handL = [0, 0, -1.2];
    p.handR = [0, 0, 1.2];
    p.gripL = 0.1;
    p.gripR = 0.1;
    return p;
  },
  slump: (sit) => {
    const p = sit ? seated(POSES.stand(0)) : POSES.stand(0);
    p.spine = [sit ? 0.36 : 0.22, 0, 0];
    p.chest = [sit ? 0.3 : 0.2, 0, 0];
    p.neck = [0.25, 0, 0];
    p.head = [0.25, 0, 0];
    p.shoulderL = [0, 0.1, -0.06];
    p.shoulderR = [0, -0.1, 0.06];
    p.handL = [0, 0, -1.2];
    p.handR = [0, 0, 1.2];
    p.gripL = 0.1;
    p.gripR = 0.1;
    return p;
  },
  polite: (sit, together) => {
    const p = sit ? seated(POSES.stand(0)) : POSES.stand(0);
    if (sit) p.spine = [0.04, 0, 0];
    p.chest = [0.02, 0, 0];
    p.gripL = 0.06;
    p.gripR = 0.06;
    p.politeTogether = together;
    return p;
  }
};

const _iv = new THREE.Vector3();
const _iw = new THREE.Vector3();
const _iq = new THREE.Quaternion();
const _ie = new THREE.Euler();
/** Arm IK at bake time: put each hand (its palm's centre) at a point in a bone's frame. */
function reach(bones, S, frameBone, local, pole, handEuler) {
  const s = S === 'L' ? 1 : -1;
  bones.hips.parent.updateMatrixWorld(true);
  bones[frameBone].localToWorld(_iv.set(local[0] * s, local[1], local[2]));
  bones.chest.localToWorld(_iw.set(pole[0] * s, pole[1], pole[2]));
  let q = null;
  if (handEuler) {
    bones[frameBone].getWorldQuaternion(_iq);
    q = _iq.multiply(new THREE.Quaternion().setFromEuler(_ie.set(handEuler[0], handEuler[1] * s, handEuler[2] * s))).clone();
  }
  // The hand bone sits at the wrist: aim the wrist a palm-length short of the point
  solveTwoBone(bones[`upperArm${S}`], bones[`forearm${S}`], bones[`hand${S}`], _iv, _iw, 1, q);
  bones.hips.parent.updateMatrixWorld(true);
  const off = new THREE.Vector3(0, -0.06, 0).applyQuaternion(bones[`hand${S}`].getWorldQuaternion(new THREE.Quaternion()));
  _iv.sub(off);
  solveTwoBone(bones[`upperArm${S}`], bones[`forearm${S}`], bones[`hand${S}`], _iv, _iw, 1, q);
}
const IK = {
  sitLean: (b) => {
    for (const S of ['L', 'R']) reach(b, S, `thigh${S}`, [-0.03, -0.3, 0.05], [0.4, -0.5, 0.3], [-1.3, 0, 0]);
  },
  standLean: (b) => {
    for (const S of ['L', 'R']) reach(b, S, `thigh${S}`, [0.0, -0.3, 0.07], [0.5, -0.4, -0.2], [-0.2, 0, 0]);
  },
  groan: (b) => {
    for (const S of ['L', 'R']) reach(b, S, 'head', [0.045, 0.2, 0.0], [0.9, 0.3, 0.1], [2.7, 0, -0.3]);
  },
  slump: (b) => {
    for (const S of ['L', 'R']) reach(b, S, 'head', [0.075, 0.1, 0.03], [0.5, -0.6, 0.6], [2.5, 0, -0.6]);
  },
  polite: (b, p) => {
    const gap = p.politeTogether ? 0.012 : 0.07;
    for (const S of ['L', 'R']) reach(b, S, 'chest', [gap, -0.02, 0.33], [0.5, -0.6, -0.4], [-1.25, 0, S === 'L' ? -1.45 : -1.45]);
  }
};

/** [name, base pose fn, morph target fn?, ik keys] per base. */
const VARIANTS = {
  sit: [
    ['idle', (t, o) => POSES.sit(t, o), () => CROWD_POSES.sitLean(), [null, 'sitLean']],
    ['cup', (t, o) => POSES.sitCup(0, o), () => CROWD_POSES.sitCupLean()],
    ['clapIn', (t, o) => POSES.sitClap(CLAP_IN_T, o)],
    ['clapOut', (t, o) => POSES.sitClap(0, o)],
    ['cheer', (t, o) => POSES.sitCheer(0, o)],
    ['fist', (t, o) => POSES.sitFistPump(0, o)],
    ['fistL', (t, o) => mirrorPose(POSES.sitFistPump(0), o)],
    ['groan', () => CROWD_POSES.groan(true), () => CROWD_POSES.slump(true), ['groan', 'slump']],
    ['polite', () => CROWD_POSES.polite(true, false), () => CROWD_POSES.polite(true, true), ['polite', 'polite']]
  ],
  stand: [
    ['idle', (t, o) => POSES.stand(t, o), () => CROWD_POSES.standLean(), [null, 'standLean']],
    ['clapIn', (t, o) => POSES.clap(CLAP_IN_T, o)],
    ['clapOut', (t, o) => POSES.clap(0, o)],
    ['cheer', (t, o) => POSES.cheer(0, o)],
    ['fist', (t, o) => POSES.fistPump(0, o)],
    ['fistL', (t, o) => mirrorPose(POSES.fistPump(0), o)],
    ['groan', () => CROWD_POSES.groan(false), () => CROWD_POSES.slump(false), ['groan', 'slump']],
    ['polite', () => CROWD_POSES.polite(false, false), () => CROWD_POSES.polite(false, true), ['polite', 'polite']]
  ]
};

/* ------------------------------------------------------------ shader */

const VERT_PARS = /* glsl */`
// WebGL guarantees only 16 vertex attributes: the five colours are packed
// into four (skin.rgb hair.r | hair.gb top.rg | top.b bottom.rgb | accent),
// and aPart carries region, accessory bit and head weight
attribute vec3 aPart;
attribute vec4 iColA;
attribute vec4 iColB;
attribute vec4 iColC;
attribute vec3 iColD;
attribute vec4 iMisc;
attribute vec3 aMorph;
attribute vec3 aMorphN;
uniform vec3 uPivot;
uniform vec3 uPivotD;
mat3 crowdHeadRot() {
  float k = aPart.z;
  float cy = cos(iMisc.x * k);
  float sy = sin(iMisc.x * k);
  float cp = cos(iMisc.y * k);
  float sp = sin(iMisc.y * k);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  return ry * rx;
}
float crowdShown() {
  if (aPart.y < -0.5) return 1.0;
  return mod(floor(iMisc.z / exp2(aPart.y)), 2.0);
}
`;

function patch(shader, withColor) {
  shader.uniforms.uPivot = this.userData.pivot;
  shader.uniforms.uPivotD = this.userData.pivotD;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  objectNormal += aMorphN * iMisc.w;
  if (aPart.z > 0.001) objectNormal = crowdHeadRot() * objectNormal;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed += aMorph * iMisc.w;
  vec3 crowdPivot = uPivot + uPivotD * iMisc.w;
  if (crowdShown() < 0.5) transformed = vec3(0.0);
  else if (aPart.z > 0.001) transformed = crowdPivot + crowdHeadRot() * (transformed - crowdPivot);`);
  if (withColor) {
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
  vec3 crowdTint = vec3(1.0);
  if (aPart.x < 0.5) crowdTint = iColA.xyz;
  else if (aPart.x < 1.5) crowdTint = vec3(iColA.w, iColB.xy);
  else if (aPart.x < 2.5) crowdTint = vec3(iColB.zw, iColC.x);
  else if (aPart.x < 3.5) crowdTint = iColC.yzw;
  else if (aPart.x < 4.5) crowdTint = iColD;
  vColor.rgb *= crowdTint;`);
  }
}

function crowdMaterials(pivot, pivotD) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0 });
  mat.userData.pivot = { value: pivot };
  mat.userData.pivotD = { value: pivotD };
  mat.onBeforeCompile = function (s) { patch.call(this, s, true); };
  mat.customProgramCacheKey = () => 'pp-crowd-v2';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.userData.pivot = mat.userData.pivot;
  depth.userData.pivotD = mat.userData.pivotD;
  depth.onBeforeCompile = function (s) { patch.call(this, s, false); };
  depth.customProgramCacheKey = () => 'pp-crowd-depth-v2';
  return { mat, depth };
}

/* ------------------------------------------------------------ baking */

/** The cup crowd members hold: a handleless cup in the 'cup' grip. */
const CUP = { radiusTop: 0.038, radiusBottom: 0.032, height: 0.085 };
let cupGrip = null;
const getCupGrip = () => cupGrip || (cupGrip = solveGrip('cup', { diameter: CUP.radiusTop + CUP.radiusBottom, height: CUP.height }, 1.09));

/** Pose a fresh skeleton (arm IK, a cup grip) and skin the builder's vertices into it. */
function bakePose(b, joints, pose, ikKey, cup) {
  const { bones, list, restPos } = makeSkeleton(joints, 1);
  const root = new THREE.Object3D();
  root.add(bones.hips);
  root.updateMatrixWorld(true);
  const inv = list.map((bone) => bone.matrixWorld.clone().invert());
  applyPose(bones, pose, 1, restPos, 1);
  root.updateMatrixWorld(true);
  if (ikKey && IK[ikKey]) IK[ikKey](bones, pose);
  if (cup) writeConfig(bones, 'R', getCupGrip().config);
  // Same forearm roll as a live person
  for (const S of ['L', 'R']) {
    const hq = bones[`hand${S}`].quaternion;
    const len = Math.hypot(hq.y, hq.w) || 1;
    bones[`forearmTwist${S}`].quaternion.set(0, hq.y / len, 0, hq.w / len).slerp(new THREE.Quaternion(), 0.5);
  }
  root.updateMatrixWorld(true);
  const M = list.map((bone, i) => bone.matrixWorld.clone().multiply(inv[i]));
  const { n } = b;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const acc = new THREE.Vector3();
  const nacc = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  for (let i = 0; i < n; i++) {
    acc.set(0, 0, 0);
    nacc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = b.SW[i * 4 + k];
      if (w <= 0) continue;
      const m = M[b.SI[i * 4 + k]];
      acc.addScaledVector(q.fromArray(b.P, i * 3).applyMatrix4(m), w);
      nacc.addScaledVector(p.fromArray(b.N, i * 3).applyMatrix3(nm.setFromMatrix4(m)), w);
    }
    acc.toArray(pos, i * 3);
    nacc.normalize().toArray(nor, i * 3);
  }
  const head = new THREE.Vector3();
  bones.head.getWorldPosition(head);
  return { pos, nor, pivot: head, bones };
}

/** The cup's vertices in the right hand's grip frame. */
function cupVerts(bones) {
  const cup = new THREE.CylinderGeometry(CUP.radiusTop, CUP.radiusBottom, CUP.height, 10, 1, false);
  const g = getCupGrip();
  const sock = new THREE.Object3D();
  // Right hand: the left-hand grip frame mirrored
  sock.position.set(-g.pos.x, g.pos.y, g.pos.z);
  sock.quaternion.set(g.quat.x, -g.quat.y, -g.quat.z, g.quat.w);
  bones.handR.add(sock);
  sock.updateMatrixWorld(true);
  cup.applyMatrix4(sock.matrixWorld);
  bones.handR.remove(sock);
  return cup;
}

/**
 * Bake a variant: pose A, and when given, pose B as a per-vertex morph
 * (aMorph/aMorphN) the shader blends by the instance's weight.
 */
function bakeVariant(b, joints, poseA, poseB, ikKeys, withCup) {
  const A = bakePose(b, joints, poseA, ikKeys?.[0], withCup);
  const B = poseB ? bakePose(b, joints, poseB, ikKeys?.[1], withCup) : null;
  const { n } = b;
  let total = n;
  let cupA = null;
  let cupB = null;
  if (withCup) {
    cupA = cupVerts(A.bones);
    if (B) cupB = cupVerts(B.bones);
    total += cupA.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const part = new Float32Array(total * 2);
  const head = new Float32Array(total);
  const part3 = new Float32Array(total * 3);
  const morph = new Float32Array(total * 3);
  const morphN = new Float32Array(total * 3);
  pos.set(A.pos);
  nor.set(A.nor);
  col.set(b.C);
  for (let i = 0; i < n; i++) {
    part[i * 2] = b.R[i];
    part[i * 2 + 1] = b.A[i];
    head[i] = b.H[i];
  }
  if (B) {
    for (let i = 0; i < n * 3; i++) {
      morph[i] = B.pos[i] - A.pos[i];
      morphN[i] = B.nor[i] - A.nor[i];
    }
  }
  const idx = [];
  for (const list2 of b.tris) for (const v of list2) idx.push(v);
  if (cupA) {
    const ca = cupA.attributes;
    for (let i = 0; i < ca.position.count; i++) {
      const o = (n + i) * 3;
      for (let k = 0; k < 3; k++) {
        pos[o + k] = ca.position.array[i * 3 + k];
        nor[o + k] = ca.normal.array[i * 3 + k];
        col[o + k] = [0.82, 0.8, 0.76][k];
        if (cupB) {
          morph[o + k] = cupB.attributes.position.array[i * 3 + k] - pos[o + k];
          morphN[o + k] = cupB.attributes.normal.array[i * 3 + k] - nor[o + k];
        }
      }
      part[(n + i) * 2] = REGION.FIXED;
      part[(n + i) * 2 + 1] = -1;
    }
    for (const v of cupA.index.array) idx.push(n + v);
    cupA.dispose();
    if (cupB) cupB.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (let i = 0; i < total; i++) part3[i * 3 + 2] = head[i];
  for (let i = 0; i < total; i++) {
    part3[i * 3] = part[i * 2];
    part3[i * 3 + 1] = part[i * 2 + 1];
  }
  g.setAttribute('aPart', new THREE.BufferAttribute(part3, 3));
  g.setAttribute('aMorph', new THREE.BufferAttribute(morph, 3));
  g.setAttribute('aMorphN', new THREE.BufferAttribute(morphN, 3));
  g.setIndex(idx);
  const pivotD = B ? B.pivot.clone().sub(A.pivot) : new THREE.Vector3();
  return { geometry: g, pivot: A.pivot, pivotD };
}

/* ------------------------------------------------------------ crowd */

function maskFor(look) {
  let m = 0;
  const hatted = look.headwear === 'cap' || look.headwear === 'beanie';
  let hb = HAIR_BIT[look.hairStyle] ?? 0;
  if (hatted && hb > 0 && hb !== 5) hb = 0;
  if (hb >= 0) m |= 1 << hb;
  if (look.facialHair === 'beard' || look.facialHair === 'fullBeard') m |= 1 << 7;
  if (look.facialHair === 'moustache') m |= 1 << 8;
  if (look.glasses) m |= 1 << 9;
  if (look.headwear === 'cap') m |= 1 << 10;
  if (look.headwear === 'beanie') m |= 1 << 11;
  return m;
}

/**
 * opts: {
 *   seats: [{ position: Vector3|[x,y,z], rotationY, pose: 'sit'|'stand', cup?: bool }],
 *   count?: limit, names?: participant names to scatter through the crowd,
 *   seed?: number, hats?: 0..1 chance of a cap/beanie on anonymous members,
 *   castShadow?: true, palette?: { tops: [hex…], bottoms: [hex…] }
 * }
 */
export function createCrowd(opts = {}) {
  const seats = (opts.seats || []).slice(0, opts.count ?? Infinity);
  const n = seats.length;
  const seed = opts.seed ?? 1938;
  const r = rng(seed);
  const root = new THREE.Group();
  root.name = 'crowd';

  /* Who sits where: named participants scattered, everyone else hashed */
  const order = seats.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const names = opts.names || [];
  const tops = opts.palette?.tops || [0x8c3a3a, 0x36506e, 0x4d6b42, 0x7a5a2c, 0x5a3c62, 0x2f5f5c, 0x8a6a3a, 0xa8202c, 0xc9a24a, 0x3d4a66, 0xe0d6c4, 0x6e7f8c, 0x2b2f38];
  const bottoms = opts.palette?.bottoms || [0x2b3140, 0x4a3e30, 0x1d2230, 0x3c4a62, 0x5a5348, 0x2e3a2e];
  const hats = opts.hats ?? 0.12;
  const looks = new Array(n);
  order.forEach((seatIdx, k) => {
    let spec;
    if (k < names.length) spec = appearanceFor(names[k]);
    else {
      spec = appearanceFor(`åskådare ${seed}-${seatIdx}`);
      spec.outfit = { ...spec.outfit, topColor: tops[Math.floor(r() * tops.length)], bottomColor: bottoms[Math.floor(r() * bottoms.length)] };
      if (r() < hats) spec.headwear = { style: r() < 0.6 ? 'cap' : 'beanie', color: tops[Math.floor(r() * tops.length)] };
    }
    looks[seatIdx] = resolveLook(spec);
  });

  /* Bake the variants for the poses in use */
  const baseLook = resolveLook({ name: 'crowd', hair: { style: 'bald' }, build: 'average', outfit: { top: 'tshirt', bottom: 'trousers', shoes: 'leather', shoeColor: 0x2e2620 } });
  const { b, joints } = buildPersonData(baseLook, 'low', { crowd: true, accessories: crowdAccessories() });
  toBindPose(b, joints);
  const bases = [...new Set(seats.map((s) => (s.pose === 'stand' ? 'stand' : 'sit')))];
  if (bases.includes('sit') && !bases.includes('stand')) bases.push('stand'); // for ovations
  const variants = {};
  const meshes = [];
  for (const base of bases) {
    variants[base] = {};
    for (const [vname, fn, morphFn, ikKeys] of VARIANTS[base]) {
      const baked = bakeVariant(b, joints, fn(0), morphFn ? morphFn() : null, ikKeys, vname === 'cup');
      const { mat, depth } = crowdMaterials(baked.pivot, baked.pivotD);
      const g = baked.geometry;
      const attrs = {};
      for (const [k, size] of [['iColA', 4], ['iColB', 4], ['iColC', 4], ['iColD', 3], ['iMisc', 4]]) {
        const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * size), size);
        a.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute(k, a);
        attrs[k] = a;
      }
      const mesh = new THREE.InstancedMesh(g, mat, Math.max(1, n));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.customDepthMaterial = depth;
      mesh.castShadow = opts.castShadow !== false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      mesh.name = `crowd:${base}:${vname}`;
      root.add(mesh);
      const entry = { mesh, attrs, mat, depth, count: 0 };
      variants[base][vname] = entry;
      meshes.push(entry);
    }
  }

  /* Members */
  const members = seats.map((seat, i) => {
    const look = looks[i];
    const pos = seat.position.isVector3 ? seat.position.clone() : new THREE.Vector3(...(seat.position || [0, 0, 0]));
    const base = seat.pose === 'stand' ? 'stand' : 'sit';
    const bf = look.build === 'broad' ? [1.07, 1.06] : look.build === 'slim' ? [0.94, 0.94] : [1, 1];
    const c = (col) => [col.r, col.g, col.b];
    const acc = look.headwearColor || new THREE.Color(look.outfit.accent);
    return {
      index: i, name: look.name, seat, base, position: pos, rotationY: seat.rotationY || 0,
      scale: look.height / 1.8, build: bf,
      colors: [c(look.skin), c(look.hairColor), c(new THREE.Color(look.outfit.topColor)), c(new THREE.Color(look.outfit.bottomColor)), c(acc)],
      mask: maskFor(look),
      cup: seat.cup ?? (base === 'sit' && r() < 0.22),
      phase: r() * Math.PI * 2,
      delay: r() * 0.3,
      fan: 0.55 + r() * 0.6,
      // Personal variation: how far and how quickly they lean, how hard they slump, their clap rate
      leanK: 0.6 + r() * 0.65, leanRate: 2.2 + r() * 4, lean: 0,
      groanK: 0.25 + r() * 0.75, politeRate: 2.4 + r() * 1.1, morph: 0,
      yaw: 0, pitch: 0, glance: 0, glanceT: r() * 3, bob: 0, lift: 0,
      variant: 'idle', stand: 0, cheerStyle: r() < 0.5 ? 0 : r() < 0.5 ? 1 : 2
    };
  });

  /* Bounds: every seat plus a margin, so instancing never culls wrongly */
  const box = new THREE.Box3();
  for (const m of members) box.expandByPoint(m.position);
  box.expandByScalar(2.2);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  for (const e of meshes) {
    e.mesh.boundingSphere = sphere.clone();
    e.mesh.geometry.boundingSphere = sphere.clone();
  }

  const mood = { base: 'idle', kind: 'idle', t: 99, dur: 0, lean: 0 };
  const look = { target: null };
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();
  const P = new THREE.Vector3();
  const L = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let clock = 0;

  function chooseVariant(m, t) {
    const lt = mood.t - m.delay;
    const active = mood.kind !== 'idle' && lt >= 0 && lt < mood.dur;
    const kind = active ? mood.kind : mood.base;
    const env = active ? Math.min(1, lt / 0.15) * Math.min(1, (mood.dur - lt) / 0.4) : kind === 'idle' ? 0 : 1;
    let v = m.cup && m.base === 'sit' ? 'cup' : 'idle';
    let { base } = m;
    let lift = 0;
    let w = m.lean;
    if (kind === 'clap' && env * m.fan > 0.35) {
      const ph = (t * 2.3 + m.phase / (Math.PI * 2)) % 1;
      v = ph < 0.35 ? 'clapIn' : 'clapOut';
      w = 0;
    } else if (kind === 'polite' && env * m.fan > 0.25) {
      // Small, quick claps in front of the chest, each at their own rate
      v = 'polite';
      w = 0.5 - 0.5 * Math.cos((t * m.politeRate + m.phase / (Math.PI * 2)) * Math.PI * 2);
    } else if (kind === 'groan' && active && m.fan > 0.6) {
      // Hands to the head at once, then the slump, then back as it ends
      const lg = lt - m.delay;
      v = 'groan';
      w = m.groanK * sstep01((lg - 0.45) / 0.9) * Math.min(1, Math.max(0, (mood.dur - lt) / 0.6));
      if (mood.dur - lt < 0.15) v = m.cup && m.base === 'sit' ? 'cup' : 'idle';
    } else if (kind === 'groan' && active) {
      // The rest sink back a little
      w = Math.min(w, -0.2 * env);
    } else if ((kind === 'cheer' || kind === 'ovation') && env * m.fan > 0.3) {
      // Everyone cheers their own way: arms up in a V, or a fist punched up
      v = m.cheerStyle === 0 ? 'cheer' : m.cheerStyle === 1 ? 'fist' : 'fistL';
      lift = Math.abs(Math.sin(t * 8 + m.phase)) * 0.05 * env * m.fan;
      if (kind === 'ovation') base = 'stand';
      w = 0;
    }
    return { base, v, lift, w };
  }

  const crowd = {
    root, members, meshes,
    /**
     * One-shot reaction, `duration` s: 'cheer' | 'clap' | 'polite' (small claps) |
     * 'groan' (hands to the head, a slump, back) | 'ovation' (on their feet) | 'idle'.
     */
    react(kind, duration = 2.2) {
      mood.kind = kind;
      mood.t = 0;
      mood.dur = duration;
    },
    /** The resting behaviour between reactions: 'idle' | 'clap' | 'polite' | 'cheer' | 'ovation'. */
    setMood(kind) {
      mood.base = kind || 'idle';
    },
    /**
     * Lean in: 0 sitting back … 1 elbows on the knees (−0.3 leans back). Each
     * member eases there with their own lag and depth.
     */
    setLean(amount = 0) {
      mood.lean = THREE.MathUtils.clamp(Number(amount) || 0, -0.3, 1);
    },
    get lean() {
      return mood.lean;
    },
    /** Heads follow a world point (null: occasional idle glances). */
    lookAt(point) {
      look.target = point ? (look.target || new THREE.Vector3()).copy(point) : null;
    },
    get drawCalls() {
      return meshes.filter((e) => e.mesh.visible).length;
    },
    update(dt = 1 / 60, t) {
      const d = Math.min(Math.max(dt, 0), 0.1);
      clock = t ?? clock + d;
      mood.t += d;
      for (const e of meshes) e.count = 0;
      const k = 1 - Math.exp(-d * 6);
      for (const m of members) {
        const lt = THREE.MathUtils.clamp(mood.lean * m.leanK, -0.35, 1.1);
        m.lean += (lt - m.lean) * (1 - Math.exp(-d * m.leanRate));
        const { base, v, lift, w } = chooseVariant(m, clock);
        m.morph += (w - m.morph) * (v === 'polite' ? 1 : Math.min(1, d * 12));
        m.variant = v;
        m.lift += (lift - m.lift) * Math.min(1, d * 18);
        // Head: towards the target in the member's own frame, or idle glances
        let yaw = 0;
        let pitch = 0;
        if (look.target) {
          L.copy(look.target).sub(m.position);
          L.applyAxisAngle(UP, -m.rotationY);
          yaw = THREE.MathUtils.clamp(Math.atan2(L.x, Math.max(0.05, L.z)), -1.0, 1.0);
          pitch = THREE.MathUtils.clamp(-Math.atan2(L.y - 1.2 * m.scale, Math.hypot(L.x, L.z)), -0.4, 0.45);
        } else {
          m.glanceT -= d;
          if (m.glanceT < 0) {
            m.glanceT = 1.5 + Math.random() * 3.5;
            m.glance = (Math.random() - 0.5) * 1.2;
          }
          yaw = m.glance;
          pitch = 0.05 * Math.sin(clock * 0.7 + m.phase);
        }
        if (v === 'cheer' || v === 'fist' || v === 'fistL') pitch = -0.22;
        // Hands on the head: the head stays put between them
        if (v === 'groan') {
          yaw = 0;
          pitch = 0;
        }
        m.yaw += (yaw - m.yaw) * k;
        m.pitch += (pitch - m.pitch) * k;
        // Matrix: seat, facing, size; standing up from a chair steps forward
        const e = variants[base][v] || variants[base].idle;
        const slot = e.count++;
        const fwd = base === 'stand' && m.base === 'sit' ? 0.16 : 0;
        P.set(Math.sin(m.rotationY) * fwd, m.lift + 0.004 * Math.sin(clock * 1.7 + m.phase), Math.cos(m.rotationY) * fwd).add(m.position);
        Q.setFromAxisAngle(UP, m.rotationY);
        S.set(m.scale * m.build[0], m.scale, m.scale * m.build[1]);
        M.compose(P, Q, S);
        e.mesh.setMatrixAt(slot, M);
        const a = e.attrs;
        const [cs, ch, ct, cb, ca] = m.colors;
        a.iColA.setXYZW(slot, cs[0], cs[1], cs[2], ch[0]);
        a.iColB.setXYZW(slot, ch[1], ch[2], ct[0], ct[1]);
        a.iColC.setXYZW(slot, ct[2], cb[0], cb[1], cb[2]);
        a.iColD.setXYZ(slot, ca[0], ca[1], ca[2]);
        a.iMisc.setXYZW(slot, m.yaw, m.pitch, m.mask, v === 'idle' || v === 'cup' || v === 'groan' || v === 'polite' ? m.morph : 0);
      }
      for (const e of meshes) {
        e.mesh.count = e.count;
        e.mesh.visible = e.count > 0;
        if (!e.count) continue;
        e.mesh.instanceMatrix.needsUpdate = true;
        for (const a of Object.values(e.attrs)) a.needsUpdate = true;
      }
    },
    dispose() {
      if (root.parent) root.parent.remove(root);
      for (const e of meshes) {
        e.mesh.geometry.dispose();
        e.mat.dispose();
        e.depth.dispose();
        e.mesh.dispose();
      }
    }
  };
  crowd.update(0, 0);
  return crowd;
}
