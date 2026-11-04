/**
 * Pekkas Pokal — people: a crowd that costs a handful of draw calls.
 *
 * One low-detail person is built with EVERY optional head piece (seven hair
 * styles, beard, moustache, glasses, cap, beanie), then posed and baked on
 * the CPU into a few static variants — seated, seated with a cup, two clap
 * frames, arms up, and the same standing. Each variant is one InstancedMesh,
 * so a crowd of any size draws one call per variant in use (typically 2–5).
 *
 * Per instance the shader picks: five colours (skin, hair, top, bottom,
 * accent), which optional pieces show (a bit mask — hidden pieces collapse
 * to zero-area triangles), and a head yaw/pitch that turns everything
 * weighted to the head around the neck. Swapping a member between variants
 * is how clapping and cheering animate; bobbing is the instance matrix.
 *
 *   const crowd = createCrowd({ seats: [{ position, rotationY, pose: 'sit' | 'stand' }], names });
 *   scene.add(crowd.root);
 *   crowd.react('cheer');          // one-shot: 'cheer' | 'clap' | 'ovation' | 'idle'
 *   crowd.setMood('clap');         // what they do between reactions
 *   crowd.lookAt(ball.position);   // heads follow (null: idle glances)
 *   crowd.update(dt, t);
 */
import * as THREE from 'three';
import { POSES, applyPose } from './people-rig.js';
import { REGION, rng } from './people-build.js';
import { appearanceFor, resolveLook } from './people-look.js';
import { buildPersonData, toBindPose, makeSkeleton, crowdAccessories } from './people-assemble.js';

const HAIR_BIT = { crop: 0, sidePart: 0, tousled: 0, sweptBack: 1, curly: 2, long: 3, bun: 4, balding: 5, buzz: 6, bald: -1 };
const CLAP_IN_T = 0.35 / 2.3;

const VARIANTS = {
  sit: [
    ['idle', (t, o) => POSES.sit(t, o)],
    ['cup', (t, o) => POSES.sitCup(0, o)],
    ['clapIn', (t, o) => POSES.sitClap(CLAP_IN_T, o)],
    ['clapOut', (t, o) => POSES.sitClap(0, o)],
    ['cheer', (t, o) => POSES.sitCheer(0, o)]
  ],
  stand: [
    ['idle', (t, o) => POSES.stand(t, o)],
    ['clapIn', (t, o) => POSES.clap(CLAP_IN_T, o)],
    ['clapOut', (t, o) => POSES.clap(0, o)],
    ['cheer', (t, o) => POSES.cheer(0, o)]
  ]
};

/* ------------------------------------------------------------ shader */

const VERT_PARS = /* glsl */`
attribute vec2 aPart;
attribute float aHead;
attribute vec3 iSkin;
attribute vec3 iHair;
attribute vec3 iTop;
attribute vec3 iBottom;
attribute vec3 iAccent;
attribute vec4 iMisc;
uniform vec3 uPivot;
mat3 crowdHeadRot() {
  float k = aHead;
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
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  if (aHead > 0.001) objectNormal = crowdHeadRot() * objectNormal;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
  if (crowdShown() < 0.5) transformed = vec3(0.0);
  else if (aHead > 0.001) transformed = uPivot + crowdHeadRot() * (transformed - uPivot);`);
  if (withColor) {
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
  vec3 crowdTint = vec3(1.0);
  if (aPart.x < 0.5) crowdTint = iSkin;
  else if (aPart.x < 1.5) crowdTint = iHair;
  else if (aPart.x < 2.5) crowdTint = iTop;
  else if (aPart.x < 3.5) crowdTint = iBottom;
  else if (aPart.x < 4.5) crowdTint = iAccent;
  vColor.rgb *= crowdTint;`);
  }
}

function crowdMaterials(pivot) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0 });
  mat.userData.pivot = { value: pivot };
  mat.onBeforeCompile = function (s) { patch.call(this, s, true); };
  mat.customProgramCacheKey = () => 'pp-crowd-v1';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.userData.pivot = mat.userData.pivot;
  depth.onBeforeCompile = function (s) { patch.call(this, s, false); };
  depth.customProgramCacheKey = () => 'pp-crowd-depth-v1';
  return { mat, depth };
}

/* ------------------------------------------------------------ baking */

/** Bake the builder's vertices into a posed, static geometry. */
function bakeVariant(b, joints, poseFn, extra) {
  const { bones, list, restPos } = makeSkeleton(joints, 1);
  const root = new THREE.Object3D();
  root.add(bones.hips);
  root.updateMatrixWorld(true);
  const inv = list.map((bone) => bone.matrixWorld.clone().invert());
  applyPose(bones, poseFn(0), 1, restPos, 1);
  // Same forearm roll as a live person
  for (const S of ['L', 'R']) {
    const hq = bones[`hand${S}`].quaternion;
    const len = Math.hypot(hq.y, hq.w) || 1;
    bones[`forearmTwist${S}`].quaternion.set(0, hq.y / len, 0, hq.w / len).slerp(new THREE.Quaternion(), 0.5);
  }
  root.updateMatrixWorld(true);
  const M = list.map((bone, i) => bone.matrixWorld.clone().multiply(inv[i]));
  const n = b.n;
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.C), 3));
  const part = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    part[i * 2] = b.R[i];
    part[i * 2 + 1] = b.A[i];
  }
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 2));
  g.setAttribute('aHead', new THREE.BufferAttribute(new Float32Array(b.H), 1));
  const idx = [];
  for (const list2 of b.tris) for (const v of list2) idx.push(v);
  // Extra props (a cup) rigidly in a bone's frame
  if (extra) extra(g, bones, idx);
  g.setIndex(idx);
  const head = new THREE.Vector3();
  bones.head.getWorldPosition(head);
  return { geometry: g, pivot: head };
}

/** A small cup in the right fist, appended to a baked variant. */
function addCup(g, bones, idx) {
  const cup = new THREE.CylinderGeometry(0.038, 0.032, 0.085, 10, 1, false);
  const sock = new THREE.Object3D();
  sock.position.set(0.024, -0.078, 0.006);
  bones.handR.add(sock);
  sock.updateMatrixWorld(true);
  // The grip's +Z runs up through the fist; the cup's axis is its +Y
  cup.applyMatrix4(sock.matrixWorld.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
  const base = g.attributes.position.count;
  const merge = (name, size, fill) => {
    const a = g.attributes[name];
    const out = new Float32Array((base + cup.attributes.position.count) * size);
    out.set(a.array);
    for (let i = 0; i < cup.attributes.position.count; i++) fill(out, (base + i) * size, i);
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  };
  merge('position', 3, (o, k, i) => { o[k] = cup.attributes.position.getX(i); o[k + 1] = cup.attributes.position.getY(i); o[k + 2] = cup.attributes.position.getZ(i); });
  merge('normal', 3, (o, k, i) => { o[k] = cup.attributes.normal.getX(i); o[k + 1] = cup.attributes.normal.getY(i); o[k + 2] = cup.attributes.normal.getZ(i); });
  merge('color', 3, (o, k) => { o[k] = 0.82; o[k + 1] = 0.8; o[k + 2] = 0.76; });
  merge('aPart', 2, (o, k) => { o[k] = REGION.FIXED; o[k + 1] = -1; });
  merge('aHead', 1, (o, k) => { o[k] = 0; });
  const ci = cup.index.array;
  for (let i = 0; i < ci.length; i++) idx.push(base + ci[i]);
  cup.dispose();
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
    for (const [vname, fn] of VARIANTS[base]) {
      const baked = bakeVariant(b, joints, fn, vname === 'cup' ? addCup : null);
      const { mat, depth } = crowdMaterials(baked.pivot);
      const g = baked.geometry;
      const attrs = {};
      for (const [k, size] of [['iSkin', 3], ['iHair', 3], ['iTop', 3], ['iBottom', 3], ['iAccent', 3], ['iMisc', 4]]) {
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
      yaw: 0, pitch: 0, glance: 0, glanceT: r() * 3, bob: 0, lift: 0,
      variant: 'idle', stand: 0
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

  const mood = { base: 'idle', kind: 'idle', t: 99, dur: 0 };
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
    let base = m.base;
    let lift = 0;
    if (kind === 'clap' && env * m.fan > 0.35) {
      const ph = (t * 2.3 + m.phase / (Math.PI * 2)) % 1;
      v = ph < 0.35 ? 'clapIn' : 'clapOut';
    } else if ((kind === 'cheer' || kind === 'ovation') && env * m.fan > 0.3) {
      v = 'cheer';
      lift = Math.abs(Math.sin(t * 8 + m.phase)) * 0.05 * env * m.fan;
      if (kind === 'ovation') base = 'stand';
    }
    return { base, v, lift };
  }

  const crowd = {
    root, members, meshes,
    /** One-shot reaction: 'cheer' | 'clap' | 'ovation' | 'idle'; lasts `duration` s. */
    react(kind, duration = 2.2) {
      mood.kind = kind;
      mood.t = 0;
      mood.dur = duration;
    },
    /** The resting behaviour between reactions: 'idle' | 'clap' | 'cheer' | 'ovation'. */
    setMood(kind) {
      mood.base = kind || 'idle';
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
        const { base, v, lift } = chooseVariant(m, clock);
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
        if (v === 'cheer') pitch = -0.25;
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
        a.iSkin.setXYZ(slot, ...m.colors[0]);
        a.iHair.setXYZ(slot, ...m.colors[1]);
        a.iTop.setXYZ(slot, ...m.colors[2]);
        a.iBottom.setXYZ(slot, ...m.colors[3]);
        a.iAccent.setXYZ(slot, ...m.colors[4]);
        a.iMisc.setXYZW(slot, m.yaw, m.pitch, m.mask, 0);
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
