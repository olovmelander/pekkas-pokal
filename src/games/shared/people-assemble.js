/**
 * Pekkas Pokal — people: assembling a person's vertex data, skeleton and
 * geometry. Shared by createPerson and the crowd.
 */
import * as THREE from 'three';
import { BONE_DEFS, BONE_INDEX, A_POSE, jointTable, HEAD_SCALE } from './people-rig.js';
import {
  Builder, REGION, buildTorso, buildArm, buildLeg, buildHand, buildShoe, buildCollar, buildTorsoExtras
} from './people-build.js';
import {
  headField, buildHeadSkin, buildEyes, buildBrows, buildEars, buildHair, buildFacialHair, buildGlasses,
  buildHeadwear, beardMask, hatEdge, sweep
} from './people-head.js';
import { buildFactors } from './people-look.js';

/* ------------------------------------------------------------ geometry */

/**
 * Build all vertex data for a look. `opts.crowd` paints recolourable
 * regions white and, with `opts.accessories`, builds every optional piece
 * tagged with an accessory id (the crowd shader shows the chosen ones).
 */
export function buildPersonData(look, detail = 'high', opts = {}) {
  const res = { high: detail !== 'low' };
  const build = buildFactors(look.build);
  const joints = jointTable(build.w, build.w > 1 ? 1.04 : build.w < 1 ? 0.97 : 1);
  const crowd = !!opts.crowd;
  const { outfit } = look;
  const white = new THREE.Color(1, 1, 1);
  const palette = crowd
    ? [white, white, white, white, white]
    : [look.skin, look.hairColor, new THREE.Color(outfit.topColor), new THREE.Color(outfit.bottomColor), new THREE.Color(outfit.accent)];
  const b = new Builder(palette);
  const ctx = { build, outfit, res, joints, look, crowd };
  // Optional per-part triangle trace (opts.trace = [] collects [label, count])
  let last = 0;
  const mark = (label) => {
    if (!opts.trace) return;
    const n = b.triangleCount();
    opts.trace.push([label, n - last, b.n]);
    last = n;
  };
  buildTorso(b, ctx);
  mark('torso');
  for (const s of [1, -1]) {
    buildArm(b, ctx, s);
    mark('arm');
    buildLeg(b, ctx, s);
    mark('leg');
    buildHand(b, ctx, s);
    mark('hand');
    buildShoe(b, ctx, s);
    mark('shoe');
  }
  if (outfit.topDef.collar && outfit.topDef.neck !== 'high') buildCollar(b, ctx, { kind: outfit.topDef.collar });
  buildTorsoExtras(b, ctx, sweep);
  mark('extras');

  // Head space → model space
  const C = joints.headCenter;
  const HS = HEAD_SCALE;
  const toModel = (p) => [p[0] * HS + C.x, p[1] * HS + C.y, p[2] * HS + C.z];
  const toHead = (p) => [(p[0] - C.x) / HS, (p[1] - C.y) / HS, (p[2] - C.z) / HS];
  const field = headField(look.face);
  const hk = look.headwear;
  const edge = hatEdge(hk);
  const hc = {
    field, res, toModel, toHead, face: look.face, look: { ...look, hair: look.hairStyle }, scale: HS, crowd,
    hatEdge: edge,
    hatCovers: (psi, elev) => !!edge && elev * 180 / Math.PI > edge(psi * 180 / Math.PI) - 3,
    hairUnder: look.hairStyle === 'bald' ? 0 : 0.0024,
    lowBrows: crowd,
    // Hats: their own colour when given (the accent slot also dresses aprons and trims)
    hatRegion: !crowd && look.headwearColor ? REGION.FIXED : REGION.ACCENT,
    hatTint: !crowd && look.headwearColor ? [look.headwearColor.r, look.headwearColor.g, look.headwearColor.b] : [1, 1, 1],
    skinTintLid: [0.97, 0.9, 0.87],
    buzzColor: [0, 1, 2].map((i) => {
      const h = [look.hairColor.r, look.hairColor.g, look.hairColor.b][i];
      const s = [look.skin.r, look.skin.g, look.skin.b][i];
      return h * 0.7 + s * 0.3;
    })
  };
  hc.look.hairColor = look.hairColor;
  if (!crowd && look.facialHair) {
    // Stubble: the skin under any facial hair takes on a little of its colour
    const amt = look.facialHair === 'stubble' ? 0.32 : look.facialHair === 'moustache' ? 0.1 : 0.22;
    const ratio = [0, 1, 2].map((i) => {
      const h = [look.hairColor.r, look.hairColor.g, look.hairColor.b][i];
      const s = [look.skin.r, look.skin.g, look.skin.b][i];
      return Math.min(1, (h + 0.02) / (s + 0.02));
    });
    hc.stubble = (p, tint) => {
      const m = beardMask(p) * amt;
      return tint.map((v, i) => v * (1 + (ratio[i] - 1) * m));
    };
  }
  buildHeadSkin(b, hc);
  mark('head');
  buildEyes(b, hc);
  mark('eyes+lids');
  buildBrows(b, hc);
  mark('brows');
  const acc = opts.accessories;
  if (acc) {
    // Crowd variant: every optional head piece, each tagged for the shader
    for (const [id, fn] of acc) {
      b.acc = id;
      fn(b, hc);
    }
    b.acc = -1;
    buildEars(b, hc);
  } else {
    if (look.hairStyle !== 'long') buildEars(b, hc);
    mark('ears');
    buildHair(b, hc);
    mark('hair');
    if (look.facialHair && look.facialHair !== 'stubble') buildFacialHair(b, hc, look.facialHair);
    mark('facialHair');
    if (look.glasses) buildGlasses(b, hc, look.glasses);
    mark('glasses');
    if (hk) buildHeadwear(b, hc, hk);
    mark('headwear');
  }
  return { b, joints, H: hc.H, build };
}

/** Rigidly carry arm-chain vertices into the A-pose bind. */
export function toBindPose(b, joints) {
  const { P } = b;
  const { N } = b;
  const chain = (S) => ['upperArm', 'forearm', 'forearmTwist', 'hand', 'thumb', 'index', 'indexTip', 'fingers', 'fingersTip'].map((n) => BONE_INDEX[n + S]);
  const armL = new Set(chain('L'));
  const armR = new Set(chain('R'));
  const rot = (side) => {
    const J = joints[side > 0 ? 'upperArmL' : 'upperArmR'];
    const m = new THREE.Matrix4().makeTranslation(J.x, J.y, J.z)
      .multiply(new THREE.Matrix4().makeRotationZ(side * A_POSE))
      .multiply(new THREE.Matrix4().makeTranslation(-J.x, -J.y, -J.z));
    return { m, n: new THREE.Matrix3().setFromMatrix4(m) };
  };
  const L = rot(1);
  const R = rot(-1);
  const v = new THREE.Vector3();
  for (let i = 0; i < b.n; i++) {
    const bi = b.SI[i * 4];
    const T = armL.has(bi) ? L : armR.has(bi) ? R : null;
    if (!T) continue;
    v.fromArray(P, i * 3).applyMatrix4(T.m).toArray(P, i * 3);
    v.fromArray(N, i * 3).applyMatrix3(T.n).toArray(N, i * 3);
  }
}

/** Pack builder data into a BufferGeometry with one group per material. */
export function toGeometry(b, scale, { skin = true } = {}) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(b.P.length);
  for (let i = 0; i < pos.length; i++) pos[i] = b.P[i] * scale;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.N), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.C), 3));
  if (skin) {
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(b.SI), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(b.SW), 4));
  }
  const idx = [];
  const groups = [];
  b.tris.forEach((list, m) => {
    if (!list.length) return;
    groups.push([idx.length, list.length, m]);
    for (const v of list) idx.push(v);
  });
  g.setIndex(b.n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  for (const [start, count, m] of groups) g.addGroup(start, count, m);
  return g;
}

/**
 * The skeleton: bones at their zero-pose joint positions (scaled), upper
 * arms rotated into the A-pose bind. Returns { bones, list, restPos }.
 */
export function makeSkeleton(joints, s) {
  const bones = {};
  const list = [];
  const restPos = {};
  for (const [name, parent] of BONE_DEFS) {
    const bone = new THREE.Bone();
    bone.name = name;
    const J = joints[name];
    const PJ = parent ? joints[parent] : new THREE.Vector3();
    bone.position.copy(J).sub(PJ).multiplyScalar(s);
    restPos[name] = bone.position.clone();
    if (parent) bones[parent].add(bone);
    bones[name] = bone;
    list.push(bone);
  }
  bones.upperArmL.rotation.z = A_POSE;
  bones.upperArmR.rotation.z = -A_POSE;
  return { bones, list, restPos };
}

/** Accessory pieces for crowd variants: [id, builder] pairs. */
export function crowdAccessories() {
  const hair = (style) => (b, hc) => buildHair(b, { ...hc, look: { ...hc.look, hair: style } });
  return [
    [0, hair('crop')], [1, hair('sweptBack')], [2, hair('curly')], [3, hair('long')], [4, hair('bun')],
    [5, hair('balding')], [6, hair('buzz')],
    [7, (b, hc) => buildFacialHair(b, hc, 'beard')],
    [8, (b, hc) => buildFacialHair(b, hc, 'moustache')],
    [9, (b, hc) => buildGlasses(b, hc, 'round')],
    [10, (b, hc) => buildHeadwear(b, { ...hc, hairUnder: 0.003 }, 'cap')],
    [11, (b, hc) => buildHeadwear(b, { ...hc, hairUnder: 0.003 }, 'beanie')]
  ];
}

