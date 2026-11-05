/**
 * Pekkas Fäktning — the fencer: a people.js character in fencing whites
 * (jacket with a lamé vest, knickers, socks in the fencer's colour), with
 * a mask and a foil, posed in code every frame.
 *
 * The rig is driven by a small vector of numbers (the POSE): pelvis
 * position and lean, where each ankle is, where the weapon hand is, the
 * foil's pitch, sweep and bend, the rear arm, the head, how relaxed the
 * fencer stands and whether the mask is on. Everything else is solved:
 * both legs and both arms are two-bone IK chains on the shared skeleton,
 * so the feet stay planted when the body sinks into a lunge, the elbow
 * finds its own place, and the fist is turned so the foil points exactly
 * where the pose says. Because a pose is just numbers it can be sprung
 * (critically damped, so anticipation and follow-through come for free
 * when a target jumps), and it can be recorded and played back — which is
 * how the slow-motion replay works.
 *
 * Fencer space: +x towards the opponent, +y up from the piste, +z towards
 * the camera. Both fencers keep their weapon arm on the camera side — the
 * Nidhogg rule that keeps every blade line readable — so you fence right-
 * handed and your opponents are left-handed (as a good share of elite
 * foilists are). The person is never mirrored: faces, hair partings and
 * the lamé stay true; only which hand holds the foil changes.
 *
 * Hands: the foil sits in the people grip library's French grip (index
 * and thumb pinch the handle behind the bell, the other fingers wrap it
 * as aids) inside a white glove with a gauntlet cuff; the rear hand
 * closes on the mask's padded top while it carries it. Footwork steps
 * one foot at a time and lifts any foot that travels, so nothing slides.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPerson, appearanceFor, HAND_BONES } from '../shared/people.js';

/* ---- Proportions (metres, for a 1.80 m fencer; scaled per person) ------ */

export const ANKLE_H = 0.08; // ankle joint above the sole
export const BLADE = 0.9;
const BLADE_START = 0.075; // from the foil's origin to where the blade leaves the bell
/** The foil's origin sits this far up the handle from the grip centre (the bell clears the fingers). */
const GRIP_OFF = 0.026;
const PELVIS = 0.76; // hips height en garde: knees well bent
const FRONT_FOOT = 0.38;
const BACK_FOOT = -0.36;
const FOOT_Z = 0.045; // feet either side of the piste's centre line
const REACH = 0.6; // shoulder to fist at full extension (elbow just soft)
/** The opponent's target in front of his pelvis (chest surface, en garde). */
export const TARGET_FRONT = 0.13;
/** Line heights on a 1.80 m target en garde, HÖG / MITT / LÅG (above the piste). */
const LINE_BASE = [1.13, 0.97, 0.83];
/* Weapon-hand guard position per line, relative to the shoulder */
const GUARD_HAND = [[0.27, -0.02], [0.31, -0.14], [0.28, -0.28]];
const HAND_Z = -0.07; // the sword hand sits a little inside the shoulder
/** Torso turn en garde: the weapon side leads (radians). */
const TWIST = 0.5;
/** How far the at-ease stance turns towards the camera. */
const EASE_TURN = 1.05;
/**
 * The foil in the fist (hand-bone space): along the forearm, tipped 25°
 * towards the thumb — the French grip. −Y runs from the wrist to the
 * fingers, +Z out of the thumb side.
 */
const GRIP_TILT = (25 * Math.PI) / 180;
const BLADE_L = new THREE.Vector3(0, -Math.cos(GRIP_TILT), Math.sin(GRIP_TILT));
/** In-plane perpendicular towards the thumb (and the elbow): the blade bows this way. */
const BOW_L = new THREE.Vector3(0, Math.sin(GRIP_TILT), Math.cos(GRIP_TILT));
const UP_L = new THREE.Vector3(0, 1, 0);
const COS_YB = -Math.cos(GRIP_TILT); // cos of the angle between hand +Y and the blade
const SIN_YB = Math.sin(GRIP_TILT);

/* ---- Pose channels --------------------------------------------------- */

export const P = {
  px: 0, py: 1, lean: 2,
  ffx: 3, ffy: 4, ffp: 5, // front ankle x/y, foot pitch (toes up +)
  bfx: 6, bfy: 7, bfp: 8, // back ankle
  hx: 9, hy: 10, // weapon fist relative to the shoulder, fencer frame
  fa: 11, fyaw: 12, bend: 13, // foil pitch, inward sweep, blade curvature
  back: 14, nod: 15, // rear arm 0 = classic carriage, 1 = thrown back; head nod
  flash: 16, // lamé hit flash (0..1), recorded with the pose for replays
  relax: 17, // 0 = en garde, 1 = standing at ease, turned to the camera
  cheer: 18, // at ease: −1 dejected … 0 neutral … +1 triumphant
  mask: 19, // 0 = carried in the rear hand, 1 = on the head
  bob: 20 // at ease: a little bounce (metres), for the champion
};
export const POSE_LEN = 21;

/* ---- Small maths ------------------------------------------------------ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) ** 3;
const bell = (k) => Math.sin(clamp(k, 0, 1) * Math.PI);
const lerp = (a, b, k) => a + (b - a) * k;

/** Arc-length chord of a blade bent with curvature k. */
function chord(k) {
  return k < 1e-5 ? BLADE : (2 * Math.sin((k * BLADE) / 2)) / k;
}

/** Curvature that makes a blade of length BLADE span distance d. */
function bendFor(d) {
  if (d >= BLADE) return 0;
  let lo = 0;
  let hi = 5.5;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (chord(mid) > d) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const BODY = [
  'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upperArmL', 'forearmL', 'handL',
  'shoulderR', 'upperArmR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'
];
// Every finger bone of both hands blends between the duel and the at-ease
// stance (the old five-per-hand names are a fallback for an older rig)
const FINGERS = (HAND_BONES && HAND_BONES.length ? HAND_BONES : ['thumb', 'index', 'indexTip', 'fingers', 'fingersTip'])
  .flatMap((n) => [`${n}L`, `${n}R`]);
const BLEND = [...BODY, ...FINGERS];
const swapLR = (n) => (n.endsWith('L') ? `${n.slice(0, -1)}R` : n.endsWith('R') ? `${n.slice(0, -1)}L` : n);

/**
 * A pose object written for a right-handed fencer, mirrored on the fly
 * for the left-handed one (L↔R swapped, y and z rotations negated).
 */
class PoseWriter {
  constructor(mirror) {
    this.mirror = mirror;
    this.pose = { hipsPos: [0, 0, 0], gripL: 0.25, gripR: 0.25, pointL: 0, pointR: 0 };
    for (const n of BODY) this.pose[n] = [0, 0, 0];
  }

  clear() {
    for (const n of BODY) {
      const a = this.pose[n];
      a[0] = 0;
      a[1] = 0;
      a[2] = 0;
    }
    return this;
  }

  set(n, x, y, z) {
    const m = this.mirror;
    const a = this.pose[m ? swapLR(n) : n];
    a[0] = x;
    a[1] = m ? -y : y;
    a[2] = m ? -z : z;
    return this;
  }

  /** Grip of the weapon hand (W) and the rear hand (B). */
  grips(w, b) {
    this.pose[this.mirror ? 'gripL' : 'gripR'] = w;
    this.pose[this.mirror ? 'gripR' : 'gripL'] = b;
    return this;
  }
}

/* ---- Props: mask and foil -------------------------------------------- */

function gridTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#16191e';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(176,184,198,0.62)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 64; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, 64);
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(64, i + 0.5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 6);
  // Mipmapped and anisotropic: a fine mesh at a distance averages to grey
  // instead of crawling with moiré as the head moves.
  tex.anisotropy = 4;
  return tex;
}

/**
 * The foil mask, in head space for a 1.80 m figure (origin at the head's
 * centre, +z forward): a dark steel mesh bowl over the face — semi-see-
 * through, so the face shows behind it in close-ups — a white padded
 * tongue over the crown and the back, a white rim and a lamé bib.
 */
function buildMask(mats) {
  const g = new THREE.Group();
  const add = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const R = [0.125, 0.162, 0.165];
  const C = [0, -0.012, -0.004];
  // The mesh: front 212°, from the crown to below the chin
  const FRONT = 3.7;
  const grille = new THREE.SphereGeometry(1, 28, 16, Math.PI / 2 - FRONT / 2, FRONT, 0, 2.6);
  grille.scale(R[0], R[1], R[2]).translate(C[0], C[1], C[2]);
  add(grille, mats.grille).renderOrder = 2;
  // The back: padded white tongue and strap, starting exactly where the
  // mesh ends (overlapping shells of different tessellation cross each
  // other in a sawtooth); a few millimetres proud, like the padded edge
  const back = new THREE.SphereGeometry(1, 20, 12, Math.PI / 2 + FRONT / 2, Math.PI * 2 - FRONT, 0, 2.05);
  back.scale(R[0] * 1.035, R[1] * 1.025, R[2] * 1.035).translate(C[0], C[1], C[2]);
  add(back, mats.pad);
  // White padded edge along the bottom of the mesh (where the bib is sewn on)
  const edgeT = 2.6; // the grille's lower edge, from the crown
  const er = Math.sin(edgeT);
  const ey = C[1] + Math.cos(edgeT) * R[1];
  const rim = new THREE.TorusGeometry(1, 0.06, 6, 32, FRONT);
  rim.rotateZ(Math.PI / 2 - FRONT / 2).rotateX(Math.PI / 2);
  rim.scale(R[0] * er, 0.16, R[2] * er);
  rim.translate(C[0], ey, C[2]);
  add(rim, mats.pad);
  // The bib: a flared lamé flap under the chin, hanging lower at the front
  const bib = new THREE.CylinderGeometry(1, 1.3, 0.1, 20, 1, true, -1.9, 3.8);
  const pos = bib.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const y = pos.getY(i);
    if (y < 0) pos.setY(i, y - Math.max(0, z) * 0.03);
  }
  bib.scale(R[0] * er * 1.02, 1, R[2] * er * 1.02);
  bib.computeVertexNormals();
  // The bib wears the fencer's lamé, which reads vertex colours: give it
  // the lamé's own grey (without them it would draw black)
  bib.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.count * 3).fill(0.6), 3));
  bib.translate(C[0], ey - 0.05, C[2]);
  const bibMat = mats.pad;
  const bibMesh = add(bib, bibMat);
  return { group: g, bib: bibMesh };
}

/** The foil in its own space: blade along +x from the fist, bowing towards +y. */
function buildFoil(mats) {
  const g = new THREE.Group();
  const bellGeo = new THREE.SphereGeometry(0.06, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.6);
  bellGeo.rotateZ(-Math.PI / 2);
  bellGeo.translate(0.03, 0, 0);
  // The French grip: a slightly curved, tapering handle with the thumb
  // pad inside the bell, and the pommel at the end that rests against the
  // wrist (the pommel is steel: merged into the bell's mesh)
  const gripGeo = new THREE.CylinderGeometry(0.011, 0.015, 0.12, 6, 3);
  gripGeo.rotateZ(Math.PI / 2);
  gripGeo.translate(-0.025, 0, 0);
  const gp = gripGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i) + 0.025;
    gp.setY(i, gp.getY(i) - 0.5 * x * x); // the curve, towards the palm
  }
  gripGeo.computeVertexNormals();
  // The cushion sits inside the bell, against its inner face
  const pad = new THREE.CylinderGeometry(0.05, 0.05, 0.008, 16);
  pad.rotateZ(Math.PI / 2);
  pad.translate(0.056, 0, 0);
  const grip = new THREE.Mesh(mergeGeometries([gripGeo, pad]), mats.grip);
  gripGeo.dispose();
  pad.dispose();
  g.add(grip);
  const pommelGeo = new THREE.SphereGeometry(0.016, 10, 6);
  pommelGeo.scale(1.25, 1, 1);
  pommelGeo.translate(-0.092, -0.0042, 0);
  const bellAll = mergeGeometries([bellGeo.toNonIndexed(), pommelGeo.toNonIndexed()]);
  bellGeo.dispose();
  pommelGeo.dispose();
  const bell = new THREE.Mesh(bellAll, mats.steel);
  bell.castShadow = true;
  g.add(bell);
  // The blade is rebuilt in place whenever its curvature changes
  const segs = 12;
  const bladeGeo = new THREE.CylinderGeometry(0.0032, 0.0062, BLADE, 4, segs, false);
  bladeGeo.rotateZ(-Math.PI / 2);
  bladeGeo.translate(BLADE / 2, 0, 0);
  const rest = Float32Array.from(bladeGeo.attributes.position.array);
  const blade = new THREE.Mesh(bladeGeo, mats.steel);
  blade.position.x = BLADE_START;
  blade.castShadow = true;
  blade.frustumCulled = false;
  g.add(blade);
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), mats.button);
  g.add(button);
  return { group: g, blade, rest, button };
}

/* ---- Fabric: the whites and the lamé read as cloth -------------------- */

/*
 * A small layer on the fencer's own cloth and lamé materials (people
 * createPerson({ ownMaterials: true }), so the referee and the benches are
 * untouched). Everything is computed from the BIND-pose position and normal
 * (the skinned mesh's raw attributes), so seams and folds stick to the
 * cloth as it moves. Safe on real GPUs: every fine detail fades out by its
 * own screen footprint (fwidth), so nothing sub-pixel can crawl or blink;
 * no divisions by ~0, no sine hashes, no reversed smoothstep edges.
 *
 *  - side seams on the jacket and the breeches (where the cloth faces
 *    straight out to the side), the jacket's collar line and the piping
 *    along the top of the lamé: stitched lines a shade darker;
 *  - soft folds as a derivative bump (no tangents needed);
 *  - the lamé only (FAB_LAME): a coarse woven-metal sparkle that is only
 *    there when the camera is close enough to resolve it.
 */
const FAB_VERT_PARS = /* glsl */ `
varying vec3 vFabP;
varying vec3 vFabN;`;
const FAB_VERT = /* glsl */ `
vFabP = position;
vFabN = normal;`;
const FAB_FRAG_PARS = /* glsl */ `
varying vec3 vFabP;
varying vec3 vFabN;
uniform float uFabScale;
uniform vec3 uFabShL;
uniform vec3 uFabShR;
uniform vec3 uFabAxL;
uniform vec3 uFabAxR;
float fabHash(vec2 c) {
  vec3 p3 = fract(vec3(c.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// A line of width L at distance d, antialiased by its footprint f
float fabLine(float d, float L) {
  float f = max(fwidth(d), 1e-5);
  return clamp(0.5 + (L * 0.5 - d) / f, 0.0, 1.0) * min(1.0, L / f);
}
// A seam ring round an arm, just below the shoulder joint (sh: the joint,
// ax: down the arm, both in the bind pose)
float fabArmRing(vec3 p, vec3 sh, vec3 ax) {
  vec3 q = p - sh;
  float t = dot(q, ax);
  float r = length(q - ax * t);
  return fabLine(abs(t - 0.04), 0.003) * step(r, 0.085) * step(-0.02, t);
}
vec3 fabPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 dx = dFdx(surfPos);
  vec3 dy = dFdy(surfPos);
  if (dot(dx, dx) < 1e-20 || dot(dy, dy) < 1e-20) return surfNorm;
  vec3 sx = normalize(dx);
  vec3 sy = normalize(dy);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  vec3 n = abs(det) * surfNorm - grad;
  float l = length(n);
  return l > 1e-6 ? n / l : surfNorm;
}`;
const FAB_COLOR = /* glsl */ `
vec3 fabP = vFabP / max(uFabScale, 0.1);
vec3 fabN = vFabN;
// Around the body: arc length (u) and height (v), in metres
float fabU = atan(fabP.x, fabP.z - 0.02 + 1e-4) * 0.15;
float fabV = fabP.y;
float fabOut = step(0.0, fabP.x * fabN.x);
// Side seams: where the cloth turns from facing front to facing back
// (the horizontal normal's front/back component crosses zero)
float fabPhi = abs(atan(fabN.z, abs(fabN.x) + 1e-5));
float fabTorso = step(0.93, fabP.y) * step(fabP.y, 1.31) * step(abs(fabP.x), 0.2);
float fabLeg = step(0.47, fabP.y) * step(fabP.y, 0.88) * step(abs(fabP.x), 0.22);
float fabSeam = fabLine(fabPhi * (fabP.y > 0.9 ? 0.15 : 0.07), 0.0035) * max(fabTorso, fabLeg) * fabOut;
// The sleeves set into the body, and the zip down the back
fabSeam = max(fabSeam, max(fabArmRing(fabP, uFabShL, uFabAxL), fabArmRing(fabP, uFabShR, uFabAxR)));
float fabBack = step(fabN.z, 0.0) * step(0.95, fabP.y) * step(fabP.y, 1.5) * step(abs(fabP.x), 0.12);
fabSeam = max(fabSeam, fabLine(abs(atan(fabN.x, -fabN.z + 1e-5)) * 0.15, 0.004) * fabBack);
// The collar line and the piping along the top of the lamé
float fabNeck = step(abs(fabP.x), 0.12) * step(1.47, fabP.y);
fabSeam = max(fabSeam, fabLine(abs(fabP.y - 1.522), 0.003) * fabNeck);
fabSeam = max(fabSeam, fabLine(abs(fabP.y - 1.441), 0.004) * step(abs(fabP.x), 0.19));
#ifdef FAB_LAME
  // Woven metal: cells of a few millimetres, each catching the light a
  // little differently; gone as soon as a cell is smaller than a pixel
  vec2 fabCellC = vec2(fabU, fabV) * 560.0;
  float fabFade = 1.0 - smoothstep(0.3, 0.9, max(fwidth(fabCellC.x), fwidth(fabCellC.y)));
  float fabR = fabHash(floor(fabCellC));
  float fabGlint = step(0.9, fabR) * fabFade;
  diffuseColor.rgb *= 1.0 + (fabR - 0.5) * 0.1 * fabFade;
  diffuseColor.rgb *= 1.0 - 0.22 * fabSeam;
  float fabCollar = 0.0;
#else
  float fabGlint = 0.0;
  // The lamé's stand-up collar round the neck (the jacket's own collar
  // under it): woven-metal grey, on the cloth mesh
  float fabCollar = smoothstep(1.45, 1.462, fabP.y) * (1.0 - smoothstep(0.1, 0.118, abs(fabP.x)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.35, 0.37), fabCollar);
  fabSeam = max(fabSeam, fabLine(abs(fabP.y - 1.456), 0.004) * step(abs(fabP.x), 0.11));
  diffuseColor.rgb *= 1.0 - 0.2 * fabSeam;
#endif`;
const FAB_ROUGH = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.66, fabCollar);
roughnessFactor = clamp(roughnessFactor + 0.12 * fabSeam - 0.14 * fabGlint, 0.32, 1.0);`;
const FAB_METAL = /* glsl */ `
metalnessFactor = mix(metalnessFactor, 0.44, fabCollar);`;
const FAB_NORMAL = /* glsl */ `
{
  // Soft folds: shallow, irregular ridges, deeper round the waist
  float fabWaist = 1.0 - 0.55 * smoothstep(1.0, 1.4, fabV);
  #ifdef FAB_LAME
    float fabA = 0.0026 * fabWaist;
  #else
    float fabA = 0.0011 * fabWaist;
  #endif
  float fabH = fabA * (sin(fabV * 47.0 + 1.7 * sin(fabU * 19.0)) + 0.55 * sin(fabU * 33.0 - fabV * 11.0));
  #ifdef FAB_LAME
    // Metal thread creases finer than cotton: a second, smaller set
    fabH += 0.0009 * sin(fabV * 131.0 + 2.3 * sin(fabU * 57.0 + fabV * 9.0));
  #endif
  normal = fabPerturb(-vViewPosition, normal, vec2(dFdx(fabH), dFdy(fabH)), faceDirection);
}`;

function fabricCompile(shader) {
  const u = this.userData;
  shader.uniforms.uFabScale = u.fabScale;
  shader.uniforms.uFabShL = u.fabShL;
  shader.uniforms.uFabShR = u.fabShR;
  shader.uniforms.uFabAxL = u.fabAxL;
  shader.uniforms.uFabAxR = u.fabAxR;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>${FAB_VERT_PARS}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>${FAB_VERT}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>${FAB_FRAG_PARS}`)
    .replace('#include <color_fragment>', `#include <color_fragment>${FAB_COLOR}`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>${FAB_ROUGH}`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>${FAB_METAL}`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${FAB_NORMAL}`);
}

const _bindM = new THREE.Matrix4();

/** Where a bone sits in the bind pose (÷ scale) and which way it hangs. */
function bindBone(person, name, pos, dir) {
  const skel = person.mesh.skeleton;
  const b = person.bones[name];
  const i = skel && b ? skel.bones.indexOf(b) : -1;
  if (i < 0) return;
  _bindM.copy(skel.boneInverses[i]).invert();
  pos.setFromMatrixPosition(_bindM).multiplyScalar(1 / person.scale);
  dir.set(0, -1, 0).transformDirection(_bindM);
}

/** Turn one of the fencer's own materials into fabric (cloth or lamé). */
function makeFabric(mat, person, lame) {
  if (!mat) return;
  const u = mat.userData;
  if (!u.fabScale) {
    u.fabScale = { value: 1 };
    // Defaults far away: no ring until the bind pose is read
    u.fabShL = { value: new THREE.Vector3(0, -9, 0) };
    u.fabShR = { value: new THREE.Vector3(0, -9, 0) };
    u.fabAxL = { value: new THREE.Vector3(0, -1, 0) };
    u.fabAxR = { value: new THREE.Vector3(0, -1, 0) };
  }
  u.fabScale.value = person.scale;
  bindBone(person, 'upperArmL', u.fabShL.value, u.fabAxL.value);
  bindBone(person, 'upperArmR', u.fabShR.value, u.fabAxR.value);
  if (mat.onBeforeCompile === fabricCompile) return;
  mat.onBeforeCompile = fabricCompile;
  if (lame) mat.defines = { ...(mat.defines || {}), FAB_LAME: '' };
  mat.needsUpdate = true;
}

/* ---- The fencer ------------------------------------------------------- */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _wc = new THREE.Vector3();
const FWD_L = new THREE.Vector3(0, 0, 1);

/** Rotation taking local unit vector a→A and (the part of) b→B. */
function frameQuat(a, A, b, B, out) {
  // Orthonormal bases on both sides, then R = W · Lᵀ
  const la = _v.copy(a).normalize();
  const lb = _v2.copy(b).addScaledVector(la, -b.dot(la)).normalize();
  const lc = _v3.crossVectors(la, lb);
  _m.makeBasis(la, lb, lc);
  const wa = _w.copy(A).normalize();
  const wb = _s.copy(B).addScaledVector(wa, -B.dot(wa));
  if (wb.lengthSq() < 1e-10) wb.set(wa.y, -wa.x, 0).add(_v3.set(0, wa.z, -wa.y)); // any perpendicular
  wb.normalize();
  const wc = _wc.crossVectors(wa, wb);
  _m2.makeBasis(wa, wb, wc);
  _m.transpose();
  _m2.multiply(_m);
  return out.setFromRotationMatrix(_m2);
}

export class Fencer {
  /**
   * @param {object} o
   * @param {string} o.name    who fences (appearanceFor)
   * @param {number} o.sock    sock colour (identifies the fencer)
   * @param {boolean} o.mirror true for the fencer on the right (left-handed)
   */
  constructor({ name, sock, mirror = false }) {
    this.mirror = mirror;
    this.mx = mirror ? -1 : 1; // fencer x → world x
    this.hand = mirror ? 'L' : 'R';
    this.rear = mirror ? 'R' : 'L';
    this.group = new THREE.Group();
    this.pose = new Float32Array(POSE_LEN);
    this.writer = new PoseWriter(mirror);
    this.flashColor = new THREE.Color(0xffffff);
    this.tipLocal = new THREE.Vector3();
    this.midLocal = new THREE.Vector3();
    this._bend = -1;
    this.look = null; // world point the head turns to (null: straight ahead)
    this.lookWeight = 1;
    this.expr = { base: 'neutral', name: 'neutral', amount: 0, t: 0 };
    this.qa = BLEND.map(() => new THREE.Quaternion());
    this.qb = BLEND.map(() => new THREE.Quaternion());
    this.ha = new THREE.Vector3();
    this.hb = new THREE.Vector3();
    // Scratch vectors for the per-frame solve (no garbage every frame)
    this.pool = Array.from({ length: 48 }, () => new THREE.Vector3());
    this.qpool = Array.from({ length: 8 }, () => new THREE.Quaternion());
    this.pi = 0;
    this.qi = 0;

    this.mats = {
      grille: new THREE.MeshStandardMaterial({
        color: 0x9aa2ae, map: gridTexture(), roughness: 0.42, metalness: 0.7, transparent: true, opacity: 0.84
      }),
      pad: new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.7 }),
      // Satin steel: a polished mirror only shows the dark panelling and
      // reads black up close; a little roughness keeps the bell silver
      steel: new THREE.MeshStandardMaterial({ color: 0xdfe4ec, roughness: 0.38, metalness: 0.88 }),
      grip: new THREE.MeshStandardMaterial({ color: 0x2a2422, roughness: 0.7 }),
      // The point's button: a warm pin of light that bloom can catch
      button: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 1.0) })
    };
    const mask = buildMask(this.mats);
    this.mask = mask.group;
    this.bib = mask.bib;
    this.group.add(this.mask);
    const foil = buildFoil(this.mats);
    this.foil = foil.group;
    this.blade = foil.blade;
    this.bladeRest = foil.rest;
    this.button = foil.button;
    // Foil space → fist space: +x along the blade, +y the way it bows
    this.foilQ = frameQuat(new THREE.Vector3(1, 0, 0), BLADE_L, new THREE.Vector3(0, 1, 0), BOW_L, new THREE.Quaternion());
    this.foilBaseQ = new THREE.Quaternion();
    // The weapon arm's last targets, re-solved after person.update()
    this.wGrip = new THREE.Vector3();
    this.wDir = new THREE.Vector3(1, 0, 0);
    this.wPole = new THREE.Vector3();
    this.wValid = false;
    this.clock = 0;
    this.foilHolder = new THREE.Group();
    this.foilHolder.add(this.foil);
    this.bladeL = new THREE.Vector3().copy(BLADE_L);
    this.cosYB = COS_YB;
    this.sinYB = SIN_YB;
    this.gripOff = 0;
    this.person = null;
    this.setPerson(name, sock);
    this._setBend(0);
  }

  /** Dress someone else in the whites (the opponent changes per round). */
  setPerson(name, sock) {
    if (this.person && this.name === name && this.sock === sock) return;
    this.name = name;
    this.sock = sock;
    // The new person first, then the old one goes: the shared materials and
    // their shader programs stay alive, so nothing recompiles mid-game
    // Faces, hair and glasses are the person's own (appearanceFor); the kit
    // is the salle's: whites, lamé, socks in their colour, and the white
    // glove with its gauntlet cuff on the weapon hand only
    // (off-white whites and creamy breeches, never paper white: under the
    // evening sun pure white clips flat and reads as plastic)
    const p = createPerson({
      ...appearanceFor(name, {
        outfit: {
          top: 'fencing', topColor: 0xeeebe3, bottom: 'knickers', bottomColor: 0xe9dfca, accent: sock, shoes: 'sneakers', shoeColor: 0xe9e7e2
        },
        gloves: { side: this.hand, color: 0xf1efe8, cuff: true }
      }),
      ownMaterials: true
    });
    if (this.person) this.person.dispose();
    this.person = p;
    this.s = p.scale;
    this.group.add(p.root);
    this.rearGrip = '';
    this._grip();
    // A new person between bouts: their grips are solved here, on the
    // bracket screen, never mid-phrase
    this.warmGrips();
    makeFabric(p.materials.cloth, p, false);
    const { lame } = p.materials;
    if (lame) {
      // Lamé is woven metal thread, not plate: mid-grey silver with a soft
      // sheen, the room only faintly mirrored in it
      lame.roughness = 0.66;
      lame.metalness = 0.44;
      lame.envMapIntensity = 0.36;
      lame.color.setRGB(0.9, 0.91, 0.93);
      makeFabric(lame, p, true);
      lame.emissive.copy(this.flashColor);
      lame.emissiveIntensity = 0;
      this.bib.material = lame;
    } else this.bib.material = this.mats.pad;
    this.lines = LINE_BASE.map((y) => y * this.s);
    this.front = TARGET_FRONT * this.s;
    // Head centre in head-bone space, from the face socket (in front of the eyes)
    const f = p.sockets.face.position;
    this.headC = new THREE.Vector3(f.x, f.y, f.z - 0.115 * this.s);
    this._measure();
    this.apply(this.pose);
    this.update(0, 0);
  }

  /**
   * The foil in the French grip. With the people grip library the fingers
   * really close on the handle: the index and thumb pinch it just behind
   * the bell, the last three fingers wrap it, the pommel lies against the
   * wrist. (Without it, the foil sits in the fist socket.)
   */
  _grip() {
    const p = this.person;
    const H = this.hand;
    if (typeof p.hold === 'function') {
      // Grip frame: +Y pommel → blade, +Z the flat under the thumb (the way the blade bows)
      this.foilBaseQ.setFromRotationMatrix(_m.makeBasis(_v.set(0, 1, 0), _v2.set(0, 0, 1), _v3.set(1, 0, 0)));
      this.foil.quaternion.copy(this.foilBaseQ);
      this.foil.position.set(0, GRIP_OFF, 0);
      this.foilHolder.position.set(0, 0, 0);
      p.hold(this.foilHolder, H, 'foil', { handle: [0.016, 0.012], blend: 0 });
      const anchor = p.sockets[`hold${H}`];
      this.gripSock = anchor;
      this.bladeL.set(0, 1, 0).applyQuaternion(anchor.quaternion).normalize();
      this.gripOff = GRIP_OFF;
    } else {
      this.foilBaseQ.copy(this.foilQ);
      this.foil.quaternion.copy(this.foilQ);
      this.foil.position.set(0, 0, 0);
      p.attach(this.foilHolder, `grip${H}`);
      this.gripSock = p.sockets[`grip${H}`];
      this.bladeL.copy(BLADE_L);
      this.gripOff = 0;
    }
    // Hand +Y (up the forearm) = cos · blade + sin · (the perpendicular towards the elbow)
    this.cosYB = this.bladeL.y;
    this.sinYB = Math.sqrt(Math.max(0, 1 - this.cosYB * this.cosYB));
  }

  /**
   * The weapon shoulder relative to the hips en garde (lean 0), measured on
   * this person's skeleton once — the Animator aims from it analytically.
   */
  _measure() {
    const p = this.person;
    p.root.rotation.y = (this.mx * Math.PI) / 2;
    this._torso(0, 0);
    p.bones.hips.position.set(0, PELVIS * this.s, 0);
    this.group.updateMatrixWorld(true);
    const hips = this._toFencer(p.bones.hips.getWorldPosition(new THREE.Vector3()), new THREE.Vector3());
    const sh = this._toFencer(p.bones[`upperArm${this.hand}`].getWorldPosition(new THREE.Vector3()), new THREE.Vector3());
    this.sh = sh.sub(hips);
  }

  /** Weapon shoulder in the fencer frame for a pose (hips height py, lean). */
  shoulderAt(p) {
    const l = p[P.lean];
    const c = Math.cos(l);
    const s = Math.sin(l);
    return [p[P.px] + this.sh.x * c + this.sh.y * s, p[P.py] - this.sh.x * s + this.sh.y * c];
  }

  _toFencer(w, out) {
    const g = this.group.position;
    return out.set((w.x - g.x) * this.mx, w.y - g.y, w.z - g.z);
  }

  _toWorld(x, y, z, out) {
    const g = this.group.position;
    return out.set(g.x + this.mx * x, g.y + y, g.z + z);
  }

  _dir(x, y, z, out) {
    return out.set(this.mx * x, y, z);
  }

  /** The torso en garde: pelvis turned so the weapon side leads, lean and nod on top. */
  _torso(lean, nod, rearGrip = 0.32) {
    const w = this.writer.clear();
    w.set('hips', lean, TWIST, 0)
      .set('spine', 0.05, 0.1, 0.02)
      .set('chest', 0.01, 0.14, -0.02)
      // The head is turned to the opponent by look-at; only a hint here
      .set('neck', -0.04, -0.03, 0)
      .set('head', nod - 0.04, -0.05, 0)
      .set('shoulderR', 0, 0.06, -0.03)
      .set('shoulderL', 0, -0.04, 0.04)
      .grips(1, rearGrip);
    this.person.setPose(w.pose, 1);
  }

  V() {
    const v = this.pool[this.pi];
    this.pi = (this.pi + 1) % this.pool.length;
    return v;
  }

  Q() {
    const q = this.qpool[this.qi];
    this.qi = (this.qi + 1) % this.qpool.length;
    return q;
  }

  /** Place every joint from a pose vector. */
  apply(p) {
    const { person } = this;
    this.pi = 0;
    this.qi = 0;
    const { root } = person;
    const relax = clamp(p[P.relax], 0, 1);
    const duelYaw = (this.mx * Math.PI) / 2;
    const easeYaw = this.mx * (Math.PI / 2 - EASE_TURN);
    const b = person.bones;
    if (relax < 0.999) {
      root.rotation.y = duelYaw;
      this._duel(p);
      if (relax > 0.001) this._capture(this.qa, this.ha);
    }
    if (relax > 0.001) {
      root.rotation.y = easeYaw;
      this._ease(p);
      if (relax < 0.999) {
        this._capture(this.qb, this.hb);
        const k = smooth(relax);
        BLEND.forEach((n, i) => b[n] && b[n].quaternion.slerpQuaternions(this.qa[i], this.qb[i], k));
        b.hips.position.lerpVectors(this.ha, this.hb, k);
        root.rotation.y = lerp(duelYaw, easeYaw, k);
      }
    }
    // Only a pure stance can be re-solved after update(): a blend between
    // the two is a slerp of both solves
    this.wValid = relax < 0.001 || relax > 0.999;
    this._setBend(p[P.bend] * (1 - relax));
    const { lame } = person.materials;
    // The touch lights the lamé up — bright enough to read, not so bright
    // that bloom swallows the whole fencer
    if (lame) lame.emissiveIntensity = p[P.flash] * 1.2;
  }

  _capture(qs, hp) {
    const b = this.person.bones;
    BLEND.forEach((n, i) => b[n] && qs[i].copy(b[n].quaternion));
    hp.copy(b.hips.position);
  }

  /** En garde, lunging, parrying …: everything from the pose vector. */
  _duel(p) {
    const { person } = this;
    const b = person.bones;
    const { s } = this;
    const m = clamp(p[P.mask], 0, 1);
    this._torso(p[P.lean], p[P.nod], lerp(0.85, 0.32, smooth(m)));
    b.hips.position.set(0, p[P.py], p[P.px]);
    this.group.updateMatrixWorld(true);

    /* Legs: the front foot points at the opponent, the rear one turned out */
    const lift = (pitch) => {
      // Keep the heel (or the toes) out of the piste when the foot pitches
      const c = Math.cos(pitch);
      const sn = Math.sin(pitch);
      const heel = -0.08 * c - 0.06 * sn;
      const toe = -0.08 * c + 0.2 * sn;
      return Math.max(0, -Math.min(heel, toe) * s - ANKLE_H * s);
    };
    const footQ = (toe, pitch, out) => {
      const c = Math.cos(pitch);
      const sn = Math.sin(pitch);
      const fwd = this._dir(toe[0] * c, sn, toe[2] * c, this.V());
      const up = this._dir(-toe[0] * sn, c, -toe[2] * sn, this.V());
      return frameQuat(FWD_L, fwd, UP_L, up, out);
    };
    const ff = this._toWorld(p[P.ffx], p[P.ffy] + lift(p[P.ffp]), FOOT_Z * s, this.V());
    const fPole = this._toWorld(p[P.ffx] + 0.5 * s, p[P.ffy] + 0.6 * s, 0.08 * s, this.V());
    person.ikLeg(this.hand, ff, fPole, footQ([1, 0, 0.04], p[P.ffp], _q));
    const toe = [0.28, 0, -0.96];
    const bf = this._toWorld(p[P.bfx], p[P.bfy] + lift(p[P.bfp]), -FOOT_Z * s, this.V());
    const bPole = this._toWorld(p[P.bfx] + 0.35 * s, p[P.bfy] + 0.55 * s, -0.75 * s, this.V());
    person.ikLeg(this.rear, bf, bPole, footQ(toe, p[P.bfp], _q));

    /* Weapon arm: the fist where the pose says, the foil along fa / fyaw */
    const [sx, sy] = this.shoulderAt(p);
    const grip = this._toWorld(sx + p[P.hx], sy + p[P.hy], this.sh.z + HAND_Z * s, this.V());
    const fa = p[P.fa];
    const yaw = p[P.fyaw];
    const dir = this._dir(Math.cos(fa) * Math.cos(yaw), Math.sin(fa), -Math.cos(fa) * Math.sin(yaw), this.V());
    const pole = this._toWorld(sx + 0.18 * s, sy - 0.7 * s, this.sh.z + 0.02 * s, this.V());
    this._weapon(grip, dir, pole);

    /* Rear arm: carriage ↔ thrown back, or carrying / donning the mask */
    const rs = this._toFencer(b[`upperArm${this.rear}`].getWorldPosition(this.V()), this.V());
    const back = clamp(p[P.back], -0.35, 1);
    const carriage = [-0.3, 0.25, -0.1];
    const thrown = [-0.58, -0.04, -0.07];
    const held = [0.04, -0.54, 0.05];
    const duelT = [0, 1, 2].map((i) => lerp(carriage[i], thrown[i], back));
    const ms = smooth(m);
    const target = [0, 1, 2].map((i) => rs.getComponent(i) + lerp(held[i], duelT[i], ms) * s);
    // Donning: the hand rises to the face with the mask on the way
    const pull = Math.sin(Math.PI * m) ** 0.8;
    if (pull > 1e-3) {
      const hc = this._toFencer(b.head.localToWorld(_v.copy(this.headC)), this.V());
      const face = [hc.x + 0.2 * s, hc.y - 0.16 * s, hc.z - 0.02 * s];
      for (let i = 0; i < 3; i++) target[i] = lerp(target[i], face[i], pull * 0.85);
    }
    const rw = this._toWorld(target[0], target[1], target[2], this.V());
    const rPole = this._toWorld(rs.x - 0.5 * s, rs.y - 0.35 * s - (1 - ms) * 0.3 * s, rs.z - 0.3 * s, this.V());
    // Hand: floppy and forward in the carriage, palm up when thrown back,
    // fingers down carrying the mask, palm to the face when donning
    const fing = [0, 1, 2].map((i) => lerp([0.02, -1, 0.05][i], lerp([0.62, 0.42, -0.08][i], [-1, -0.15, 0][i], clamp(back, 0, 1)), ms));
    const palm = [0, 1, 2].map((i) => lerp([0, 0, 1][i], lerp([0.4, -0.85, 0.2][i], [0, 1, 0][i], clamp(back, 0, 1)), ms));
    if (pull > 1e-3) {
      for (let i = 0; i < 3; i++) {
        fing[i] = lerp(fing[i], [0.25, 0.9, 0][i], pull);
        palm[i] = lerp(palm[i], [-1, 0, 0][i], pull);
      }
    }
    this._rearHand(rw, rPole, fing, palm);
  }

  /** Standing at ease, turned to the camera: foil down, mask in the rear hand. */
  _ease(p) {
    const { person } = this;
    const b = person.bones;
    const { s } = this;
    const ch = clamp(p[P.cheer], -1, 1);
    const up = Math.max(0, ch);
    const down = Math.max(0, -ch);
    // Never a statue at ease: a slow, personal sway through the spine and
    // shoulders (the legs stay put, so the feet never slide)
    const ph = this.clock + ((this.person.look.seed || 0) % 97);
    const sway = Math.sin(ph * 0.83) * 0.022 + Math.sin(ph * 0.31) * 0.014;
    const turn = Math.sin(ph * 0.47) * 0.05;
    const w = this.writer.clear();
    w.set('hips', 0.0, 0.08, 0.02)
      .set('spine', 0.02 + down * 0.16, turn * 0.4, -0.01 + sway)
      .set('chest', -0.02 - up * 0.08 + down * 0.1, -0.06 + turn * 0.6, -sway * 0.5)
      .set('neck', 0.04 + down * 0.12, 0, 0)
      .set('head', -0.03 + down * 0.28 - up * 0.12, 0.0, 0)
      .set('shoulderL', 0, 0, -0.03 - down * 0.05)
      .set('shoulderR', 0, 0, 0.03 + down * 0.05)
      .set('thighL', 0, 0.06, 0.05)
      .set('thighR', -0.06, -0.12, -0.04)
      .set('shinL', 0.04, 0, 0)
      .set('shinR', 0.1, 0, 0)
      .set('footL', -0.04, 0.12, -0.05)
      .set('footR', 0.02, -0.24, 0.04)
      .grips(1, 0.85);
    person.setPose(w.pose, 1);
    b.hips.position.set(0, (0.95 - 0.006) * s + p[P.bob], 0.01 * s);
    this.group.updateMatrixWorld(true);
    // Targets in the person's own frame (right-handed; x mirrors for the lefty)
    const mx = this.mirror ? -1 : 1;
    const local = (x, y, z, out) => out.set(x * mx * s, y * s, z * s).applyMatrix4(person.root.matrixWorld);
    const ldir = (x, y, z, out) => out.set(x * mx, y, z).transformDirection(person.root.matrixWorld);
    const gx = lerp(lerp(-0.25, -0.2, down), -0.2, up);
    const gy = lerp(lerp(0.84, 0.79, down), 2.02, up);
    const gz = lerp(lerp(0.13, 0.06, down), 0.1, up);
    const grip = local(gx, gy, gz, this.V());
    const dir = ldir(lerp(lerp(-0.22, -0.08, down), -0.25, up), lerp(lerp(-0.72, -0.98, down), 1, up), lerp(lerp(0.62, 0.22, down), 0.12, up), this.V());
    const pole = local(lerp(-0.7, -1.2, up), lerp(0.9, 1.7, up), lerp(-0.6, -0.1, up), this.V());
    this._weapon(grip, dir, pole);
    // The rear hand carries the mask by the side — or lifts the cup high
    const cup = this.trophy ? up : 0;
    const rw = local(lerp(0.24, 0.3, cup), lerp(0.84, 2.0, cup), lerp(0.03, 0.14, cup), this.V());
    const rPole = local(lerp(0.6, 0.9, cup), lerp(1.1, 1.5, cup), lerp(-0.7, -0.25, cup), this.V());
    const fing = ldir(0.04, lerp(-1, 1, cup), lerp(0.06, 0.12, cup), this.V());
    const palm = ldir(-1, 0, 0.1, this.V());
    // ldir already mirrors x; hand on the person's own left/right is handled in _rearHand
    this._rearHandW(rw, rPole, fing, palm);
  }

  /**
   * Weapon hand: blade direction is exact; the fist is rolled about the
   * blade so the wrist lines up with the forearm (two passes: the elbow
   * from a first solve tells where the forearm comes from).
   */
  _weapon(grip, dir, pole) {
    const { person } = this;
    if (grip !== this.wGrip) {
      this.wGrip.copy(grip);
      this.wDir.copy(dir);
      this.wPole.copy(pole);
    }
    const b = person.bones;
    const sock = this.gripSock.position;
    const bladeW = this.V().copy(dir).normalize();
    const q = this.Q();
    const wrist = this.V();
    const solve = (towardElbow) => {
      // u: perpendicular to the blade, towards the elbow and up (never degenerate)
      const u = this.V();
      const add = (v, k) => u.addScaledVector(_v.copy(v).addScaledVector(bladeW, -v.dot(bladeW)), k);
      if (towardElbow) add(towardElbow, 1);
      add(_v2.set(0, 1, 0), 0.35);
      add(this._dir(-1, 0, 0, _v3), 0.08);
      if (u.lengthSq() < 1e-8) u.set(0, 0, 1).addScaledVector(bladeW, -bladeW.z);
      u.normalize();
      const yW = this.V().copy(bladeW).multiplyScalar(this.cosYB).addScaledVector(u, this.sinYB);
      frameQuat(this.bladeL, bladeW, UP_L, yW, q);
      wrist.copy(sock).applyQuaternion(q).negate().add(grip);
      this.short = person.ikArm(this.hand, wrist, pole, q);
    };
    solve(null);
    const elbow = b[`forearm${this.hand}`].getWorldPosition(this.V());
    const hand = b[`hand${this.hand}`].getWorldPosition(this.V());
    solve(elbow.sub(hand));
    this._rollBow(q);
  }

  /**
   * Turn the foil about its own blade so the bend always bows upwards in
   * the blade's vertical plane, whatever the wrist's roll: a round blade
   * shows no difference, and the point lands exactly where the Animator's
   * contact() aimed it.
   */
  _rollBow(handQ) {
    const base = this.foilBaseQ;
    const hq = this.Q().copy(handQ).multiply(this.gripSock.quaternion);
    const bladeH = this.V().set(1, 0, 0).applyQuaternion(base);
    const bowH = this.V().set(0, 1, 0).applyQuaternion(base);
    const bladeW = this.V().copy(bladeH).applyQuaternion(hq);
    const want = this.V().set(0, 1, 0).addScaledVector(bladeW, -bladeW.y);
    if (want.lengthSq() < 1e-6) {
      this.foil.quaternion.copy(base);
      return;
    }
    want.normalize().applyQuaternion(this.Q().copy(hq).invert());
    const ang = Math.atan2(this.V().crossVectors(bowH, want).dot(bladeH), bowH.dot(want));
    this.foil.quaternion.setFromAxisAngle(bladeH, ang).multiply(base);
  }

  /** Rear hand IK from fencer-frame finger/palm directions. */
  _rearHand(target, pole, fing, palm) {
    const f = this._dir(fing[0], fing[1], fing[2], this.V());
    const pl = this._dir(palm[0], palm[1], palm[2], this.V());
    this._rearHandW(target, pole, f, pl);
  }

  _rearHandW(target, pole, fingW, palmW) {
    // Fingers run along the hand's −Y, the palm faces +X (right) or −X (left)
    const palmL = new THREE.Vector3(this.rear === 'R' ? 1 : -1, 0, 0);
    frameQuat(new THREE.Vector3(0, -1, 0), fingW, palmL, palmW, _q2);
    this.person.ikArm(this.rear, target, pole, _q2);
  }

  /** Bend the blade into a circular arc of curvature k (towards +y). */
  _setBend(k) {
    if (Math.abs(k - this._bend) < 2e-3) return;
    this._bend = k;
    const pos = this.blade.geometry.attributes.position;
    const rest = this.bladeRest;
    const arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) {
      const sv = rest[i];
      const y = rest[i + 1];
      if (k < 1e-4) {
        arr[i] = sv;
        arr[i + 1] = y;
      } else {
        const a = sv * k;
        arr[i] = Math.sin(a) / k - y * Math.sin(a);
        arr[i + 1] = (1 - Math.cos(a)) / k + y * Math.cos(a);
      }
      arr[i + 2] = rest[i + 2];
    }
    pos.needsUpdate = true;
    this.blade.geometry.computeVertexNormals();
    // Tip and a mid-blade point, in foil space, for trails and sparks
    const tipPt = (sv, out) => {
      if (k < 1e-4) out.set(BLADE_START + sv, 0, 0);
      else out.set(BLADE_START + Math.sin(sv * k) / k, (1 - Math.cos(sv * k)) / k, 0);
    };
    tipPt(BLADE, this.tipLocal);
    tipPt(BLADE * 0.62, this.midLocal);
    this.button.position.copy(this.tipLocal);
  }

  /**
   * After apply(): look-at, breathing, blinks and expressions, then the
   * mask follows the head (worn) or the rear hand (carried).
   */
  update(dt, t) {
    const { person } = this;
    this.clock = (this.clock + dt) % 600;
    const e = this.expr;
    if (e.t > 0) {
      e.t -= dt;
      if (e.t <= 0) person.setExpression(e.base, 0.6);
    }
    person.lookAt(this.look, this.lookWeight);
    person.update(dt, t);
    // update() breathes the spine and turns the chest with the look-at,
    // which carries the whole arm with it: solve the weapon arm once more
    // on top, so the point stays exactly where the pose aimed it
    if (this.wValid) {
      const up = person.bones[`upperArm${this.hand}`];
      up.parent.updateWorldMatrix(true, false);
      this._weapon(this.wGrip, this.wDir, this.wPole);
    }
    this._placeMask();
    this.group.updateMatrixWorld(true);
  }

  /**
   * Solve every grip this fencer will use once, while the game loads: the
   * first solve of a grip and size costs a few milliseconds, then it is
   * cached (the foil's French grip is solved in setPerson already).
   */
  warmGrips() {
    const p = this.person;
    if (typeof p.setGrip !== 'function') return;
    p.setGrip(this.rear, 'power', { diameter: 0.03, blend: 0 });
    p.setGrip(this.rear, 'fist', { diameter: 0.04, blend: 0 });
    p.setGrip(this.rear, null, { blend: 0 });
    this.rearGrip = '';
  }

  /**
   * The rear hand's fingers: closed on the mask's padded top while it is
   * carried or going on, a loose fist round the cup's stem, and handed
   * back to the pose (the relaxed carriage) once the mask is on.
   */
  _rearFingers(carrying) {
    const p = this.person;
    if (typeof p.setGrip !== 'function') return;
    const want = this.trophy ? 'cup' : carrying ? 'mask' : 'pose';
    if (want === this.rearGrip) return;
    this.rearGrip = want;
    if (want === 'mask') p.setGrip(this.rear, 'power', { diameter: 0.03, blend: 0.18 });
    else if (want === 'cup') p.setGrip(this.rear, 'fist', { diameter: 0.04, blend: 0.2 });
    else p.setGrip(this.rear, null, { blend: 0.25 });
  }

  _placeMask() {
    const { person } = this;
    const { s } = this;
    const m = clamp(this.pose[P.mask], 0, 1);
    const k = smooth(clamp((m - 0.22) / 0.4, 0, 1));
    this._rearFingers(k < 0.999);
    const { head } = person.bones;
    head.updateWorldMatrix(true, false);
    // Worn: centred on the head
    const pw = head.localToWorld(_v.copy(this.headC));
    head.getWorldQuaternion(_q);
    let pos = pw;
    if (this.trophy) {
      // Put down on the piste beside him, grille up, while he lifts the cup
      person.root.getWorldQuaternion(_q2);
      const out = this.rear === 'L' ? 1 : -1;
      pos = _v3.set(out * 0.32 * s, 0.13 * s, 0.22 * s).applyQuaternion(_q2).add(person.root.getWorldPosition(_v2));
      pos.y = this.group.position.y + 0.13 * s;
      _q.copy(_q2).multiply(_q3.setFromAxisAngle(_v2.set(1, 0, 0), -Math.PI / 2));
      this.mask.position.copy(this.group.worldToLocal(pos));
      this.mask.quaternion.copy(_q);
      this.mask.scale.setScalar(s);
      return;
    }
    if (k < 1) {
      // Carried: hanging upright from the rear fist by the strap, grille
      // facing the way the fencer faces — upright whatever the wrist does,
      // so on its way to the face it never tumbles
      const sock = person.sockets[`grip${this.rear}`];
      sock.updateWorldMatrix(true, false);
      person.root.getWorldQuaternion(_q2);
      const out = this.rear === 'L' ? 1 : -1;
      const ph = sock.getWorldPosition(_v2).add(_v3.set(out * 0.05 * s, -0.16 * s, 0.03 * s).applyQuaternion(_q2));
      pos = _v3.copy(ph).lerp(pw, k);
      _q.slerpQuaternions(_q2, _q, k);
      // Chin first: on its way the mask's crown leans out in front of the
      // face, then rolls back over the forehead into place
      const roll = Math.sin(Math.PI * k);
      if (roll > 1e-3) {
        _q.multiply(_q2.setFromAxisAngle(_v2.set(1, 0, 0), 0.75 * roll));
        pos.add(_v2.set(0, 0, 0.05 * s * roll).applyQuaternion(_q));
      }
    }
    this.mask.position.copy(this.group.worldToLocal(pos));
    this.mask.quaternion.copy(_q);
    this.mask.scale.setScalar(s);
  }

  /**
   * The champion lifts the cup in the rear hand (held by its stem, raised
   * high); the mask is put down on the piste beside him meanwhile.
   */
  holdTrophy(obj) {
    this.trophy = obj;
    this.person.attach(obj, `grip${this.rear}`, { position: [0, 0.12 * this.s, 0.01 * this.s], rotation: [Math.PI, 0, 0], scale: 0.82 * this.s });
  }

  /** Lets go of the cup (the caller puts it back where it belongs). */
  dropTrophy() {
    const o = this.trophy;
    this.trophy = null;
    return o;
  }

  /** A held expression that relaxes back to the base one. */
  express(name, amount = 1, hold = 1.2) {
    this.expr.t = hold;
    this.person.setExpression(name, amount);
  }

  /** The resting expression (focus in the bout, neutral at ease). */
  setBaseExpression(name) {
    if (this.expr.base === name) return;
    this.expr.base = name;
    if (this.expr.t <= 0) this.person.setExpression(name, 0.6);
  }

  /** World position of the blade tip (after apply + update). */
  tipWorld(out) {
    return out.copy(this.tipLocal).applyMatrix4(this.foil.matrixWorld);
  }

  midWorld(out) {
    return out.copy(this.midLocal).applyMatrix4(this.foil.matrixWorld);
  }

  /** Bones the game frames the camera on. */
  get j() {
    return { torso: this.person.bones.chest, head: this.person.bones.head };
  }

  /** World height of one of this fencer's target lines. */
  lineWorldY(i) {
    return this.group.position.y + this.lines[i];
  }

  setFlashColor(color) {
    this.flashColor.set(color);
    if (this.person.materials.lame) this.person.materials.lame.emissive.copy(this.flashColor);
  }

  get triangles() {
    return this.person.triangles;
  }

  dispose() {
    this.person.dispose();
    for (const o of [this.mask, this.foil]) {
      o.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
      });
    }
    Object.values(this.mats).forEach((mat) => {
      if (mat.map) mat.map.dispose();
      mat.dispose();
    });
  }
}

/* ---- Animation: actions → target pose → springs ---------------------- */

/**
 * Critically damped spring per channel. Stable at any dt, never
 * overshoots on its own — overshoot is authored into the targets where
 * it is wanted (anticipation dips, the blade's recoil after a parry).
 */
function springStep(x, v, target, w, dt) {
  const f = 1 + 2 * dt * w;
  const oo = w * w;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const inv = 1 / (f + hhoo);
  const nx = (f * x + dt * v + hhoo * target) * inv;
  const nv = (v + hoo * (target - x)) * inv;
  return [nx, nv];
}

/**
 * The actions. Each writes a target pose for its moment `k` (0…1 through
 * the action) and returns the spring rate: fast for strikes, slow for
 * recoveries and ceremony.
 */
const ACTIONS = {
  lunge(a, out, ctx) {
    const hitAt = a.opts.hitAt || a.dur;
    a.lungePose(out, ctx, a.t / hitAt, a.t >= hitAt * 0.92, a.line);
    return 46;
  },

  feint(a, out, ctx, k) {
    // Half an extension and an appel — the stamp of the front foot
    a.guardPose(out, ctx);
    const { s } = a.f;
    const b = bell(k);
    const g = GUARD_HAND[a.line];
    out[P.hx] = (g[0] + 0.16 * b) * s;
    out[P.hy] = (g[1] + 0.03 * b) * s;
    out[P.px] += 0.06 * b * s;
    out[P.ffx] += 0.1 * b * s;
    out[P.ffy] = (ANKLE_H + 0.07 * bell(k * 1.6)) * s;
    out[P.lean] += 0.06 * b;
    return 40;
  },

  parry(a, out, ctx, k) {
    // The beat, in the line it closes: a short sharp wrist action out
    // and back, the hand moving only a few centimetres.
    //  HÖG  sixte: point up, the hand lifts and turns out
    //  MITT quarte: the blade sweeps across the body, point at the eyes
    //  LÅG  octave: a half circle down, point towards the knee
    a.guardPose(out, ctx);
    const { s } = a.f;
    const b = bell(clamp(k * 1.6, 0, 1));
    const set = [
      { fa: 0.42, yaw: 0.36, hy: 0.05, hx: 0.03 },
      { fa: 0.26, yaw: 0.58, hy: 0.02, hx: 0.02 },
      { fa: -0.72, yaw: 0.3, hy: -0.06, hx: 0.04 }
    ][a.line];
    out[P.fa] += set.fa * b;
    out[P.fyaw] = 0.04 + set.yaw * b;
    out[P.hx] += set.hx * b * s;
    out[P.hy] += set.hy * b * s;
    // The body stays still: only the rear arm answers the beat
    out[P.back] = 0.12 * b;
    return 44;
  },

  stagger(a, out, ctx, k) {
    // Blade knocked aside, a stumbling step back, then composure
    a.guardPose(out, ctx);
    const { s } = a.f;
    const b = bell(k);
    const early = bell(clamp(k * 2.2, 0, 1));
    out[P.fa] += 0.95 * early + 0.2 * b;
    out[P.fyaw] = 0.04 - 0.5 * early;
    out[P.hx] -= 0.1 * b * s;
    out[P.hy] += 0.14 * early * s;
    out[P.lean] -= 0.16 * b;
    out[P.px] -= 0.12 * b * s;
    out[P.bfx] -= 0.12 * bell(clamp(k * 1.4, 0, 1)) * s;
    out[P.bfy] = (ANKLE_H + 0.05 * bell(clamp(k * 2.5, 0, 1))) * s;
    out[P.back] = 0.5 * b;
    out[P.nod] = -0.12 * b;
    return 22;
  },

  bitten(a, out, ctx, k) {
    // Went for the feint: the parry swings into empty air
    a.guardPose(out, ctx);
    const { s } = a.f;
    const b = bell(clamp(k * 1.3, 0, 1));
    out[P.fa] -= 0.75 * b;
    out[P.fyaw] = 0.04 + 0.55 * b;
    out[P.hy] -= 0.1 * b * s;
    out[P.hx] -= 0.05 * b * s;
    out[P.lean] -= 0.05 * b;
    return 30;
  },

  recover(a, out, ctx, k) {
    // Pulling back out of the lunge — open for a moment
    const r = 1 - smooth(clamp(k, 0, 1));
    a.lungePose(out, ctx, 0.85 * r, false, a.line, r);
    return 13;
  },

  telegraph(a, out, ctx, k) {
    // The coil: sit back, sink, draw the hand back and aim the point
    a.guardPose(out, ctx);
    const { s } = a.f;
    const c = smooth(clamp(k * 1.8, 0, 1));
    out[P.py] -= 0.09 * c * s;
    out[P.px] -= 0.09 * c * s;
    out[P.lean] += 0.06 * c;
    out[P.hx] -= 0.12 * c * s;
    out[P.hy] += [0.08, 0.02, -0.06][a.line] * c * s;
    out[P.fa] = a.aim(out, ctx, a.line).a + 0.02 * Math.sin(a.t * 40) * c;
    out[P.back] = -0.15 * c;
    return 24;
  },

  /**
   * The end of a bout, as the rules want it: mask off, a salute to the
   * opponent, and only then the joy or the disappointment.
   */
  win(a, out, ctx) {
    a.guardPose(out, ctx);
    const big = a.act === 'champion' ? 1 : 0.7;
    // The champion's moment comes after the bout's salute: no second one
    const t = a.act === 'champion' ? 9 : a.t;
    if (t < 1.55) return a.boutSalute(out, t);
    const r = smooth(clamp((t - 1.55) * 2, 0, 1));
    out[P.relax] = r;
    out[P.mask] = 0;
    out[P.cheer] = big * r;
    out[P.bob] = Math.abs(Math.sin(a.t * 6.5)) * (a.act === 'champion' ? 0.05 : 0.012) * a.f.s * r;
    return 9;
  },

  lose(a, out, ctx) {
    a.guardPose(out, ctx);
    if (a.t < 1.55) return a.boutSalute(out, a.t);
    const r = smooth(clamp((a.t - 1.55) * 1.5, 0, 1));
    out[P.relax] = r;
    out[P.mask] = 0;
    out[P.cheer] = -r;
    return 7;
  },

  salute(a, out, ctx, k) {
    // The salute as it is done on a real piste: standing tall on the
    // en-garde line, heels together, mask in the rear hand. The bell comes
    // up to the chin with the blade vertical, then the arm sweeps down and
    // out towards the opponent. The mask goes on chin first, and only then
    // the front foot steps out into en garde.
    a.guardPose(out, ctx);
    const { s } = a.f;
    const up = smooth(clamp(k / 0.28, 0, 1)) * (1 - smooth(clamp((k - 0.4) / 0.14, 0, 1)));
    const down = smooth(clamp((k - 0.4) / 0.14, 0, 1)) * (1 - smooth(clamp((k - 0.66) / 0.14, 0, 1)));
    const stand = 1 - smooth(clamp((k - 0.8) / 0.16, 0, 1));
    out[P.hx] += (0.14 * s - out[P.hx]) * up + (0.44 * s - out[P.hx]) * down;
    out[P.hy] += (0.0 - out[P.hy]) * up + (-0.26 * s - out[P.hy]) * down;
    out[P.fa] += (Math.PI / 2 - out[P.fa]) * up + (-0.62 - out[P.fa]) * down;
    out[P.fyaw] += 0.12 * up;
    // Upright over the back foot, the front heel at its instep (a right
    // angle); coming en garde, only the front foot steps out
    out[P.py] = lerp(out[P.py], 0.9 * s, stand);
    out[P.lean] = lerp(out[P.lean], -0.02, stand);
    out[P.ffx] = lerp(out[P.ffx], out[P.bfx] + 0.13 * s, stand);
    out[P.px] = lerp(out[P.px], out[P.bfx] + 0.07 * s, stand);
    out[P.nod] += 0.08 * up - 0.05 * down;
    out[P.mask] = k < 0.6 ? 0 : 1;
    return 12;
  },

  /** At ease (title, bracket, final): standing, mask carried. */
  ease(a, out, ctx) {
    a.guardPose(out, ctx);
    out[P.relax] = 1;
    out[P.mask] = 0;
    return 7;
  },

  guard(a, out, ctx) {
    a.guardPose(out, ctx);
    return 16;
  }
};
ACTIONS.attack = ACTIONS.lunge;
ACTIONS.champion = ACTIONS.win;

/**
 * Drives one fencer. `act` is what the body is doing (guard, lunge,
 * parry, stagger …), `t` how long it has been doing it. Each frame the
 * action writes a target pose, and the springs carry the real pose to it.
 */
export class Animator {
  constructor(fencer, seed = 0) {
    this.f = fencer;
    this.target = new Float32Array(POSE_LEN);
    this.vel = new Float32Array(POSE_LEN);
    this.act = 'guard';
    this.t = 0;
    this.dur = 0.3;
    this.opts = {};
    this.line = 1;
    this.phase = seed;
    this.ox = 0; // footwork offset along the piste (the pelvis)
    this.oxF = 0; // … and of each foot: a step moves one foot, then the other
    this.oxB = 0;
    this.step = null; // { from, to, t, dur }
    this.flash = 0;
    this.hold = -1; // target line while the point is in contact
    const ctx = { dist: 2.44, oppPx: 0, lines: LINE_BASE, front: TARGET_FRONT };
    this.guardPose(this.f.pose, ctx);
    this.f.pose[P.mask] = 1;
    this.target.set(this.f.pose);
  }

  play(act, dur = 0.3, opts = {}) {
    this.act = act;
    this.t = 0;
    this.dur = dur;
    this.opts = opts;
  }

  /** Jump straight to the current action's pose (no springs), e.g. on open. */
  snap(ctx) {
    (ACTIONS[this.act] || ACTIONS.guard)(this, this.target, ctx, 1);
    this.f.pose.set(this.target);
    this.vel.fill(0);
  }

  /**
   * Small advance (+) or retreat (−) step. Real footwork: on the advance
   * the front foot goes first — toes up, heel lands — and the back foot
   * follows; on the retreat the back foot leads. Never both at once, and
   * never a slide.
   */
  stepBy(dx, dur = 0.34) {
    if (this.step) return false;
    this.step = { from: this.ox, to: this.ox + dx, t: 0, dur };
    return true;
  }

  /** Physical jolt: push a channel's velocity (hit reactions). */
  impulse(ch, v) {
    this.vel[ch] += v;
  }

  /** Angle from the weapon fist to the opponent's target in `line`. */
  aim(out, ctx, line) {
    const [sx, sy] = this.f.shoulderAt(out);
    const handX = sx + out[P.hx];
    const handY = sy + out[P.hy];
    const tx = ctx.dist - ctx.oppPx - ctx.front;
    const ty = ctx.lines[line];
    return { a: Math.atan2(ty - handY, tx - handX), handX, handY, tx, ty, sx, sy };
  }

  guardPose(out, ctx, line = this.line) {
    const { s } = this.f;
    const ph = this.phase;
    const bob = Math.sin(ph * 2 * Math.PI * 1.25);
    out[P.px] = this.ox + Math.sin(ph * 2.6) * 0.012 * s;
    out[P.py] = (PELVIS + bob * 0.014) * s;
    out[P.lean] = 0.05 + bob * 0.008;
    out[P.ffx] = this.oxF + FRONT_FOOT * s;
    out[P.ffy] = ANKLE_H * s;
    out[P.ffp] = 0;
    out[P.bfx] = this.oxB + BACK_FOOT * s;
    out[P.bfy] = ANKLE_H * s;
    out[P.bfp] = 0;
    // The hand drifts between lines rather than snapping
    const g = GUARD_HAND[line];
    out[P.hx] = (g[0] + Math.sin(ph * 2.3) * 0.008) * s;
    out[P.hy] = (g[1] + Math.cos(ph * 1.9) * 0.008) * s;
    out[P.fa] = this.aim(out, ctx, line).a + [0.1, 0.05, -0.02][line];
    out[P.fyaw] = 0.04;
    out[P.bend] = 0;
    out[P.back] = 0;
    out[P.nod] = 0.06;
    out[P.flash] = this.flash;
    out[P.relax] = 0;
    out[P.cheer] = 0;
    out[P.mask] = 1;
    out[P.bob] = 0;
  }

  /**
   * After the last touch: straighten up, the mask comes off (the rear hand
   * lifts it from the face), then the blade comes up to the chin and
   * sweeps down towards the opponent. `t` in seconds.
   */
  boutSalute(out, t) {
    const { s } = this.f;
    const stand = smooth(clamp(t / 0.4, 0, 1));
    out[P.py] = lerp(out[P.py], 0.9 * s, stand);
    out[P.lean] = lerp(out[P.lean], -0.02, stand);
    out[P.ffx] = lerp(out[P.ffx], out[P.bfx] + 0.13 * s, stand);
    out[P.px] = lerp(out[P.px], out[P.bfx] + 0.07 * s, stand);
    out[P.mask] = t < 0.1 ? 1 : 0;
    // Blade down by the side while the mask comes off, then the salute
    const rest = stand * (1 - smooth(clamp((t - 0.62) / 0.16, 0, 1)));
    out[P.hx] += (0.16 * s - out[P.hx]) * rest;
    out[P.hy] += (-0.42 * s - out[P.hy]) * rest;
    out[P.fa] += (-1.0 - out[P.fa]) * rest;
    const up = smooth(clamp((t - 0.62) / 0.22, 0, 1)) * (1 - smooth(clamp((t - 1.02) / 0.16, 0, 1)));
    const down = smooth(clamp((t - 1.02) / 0.16, 0, 1));
    out[P.hx] += (0.14 * s - out[P.hx]) * up + (0.44 * s - out[P.hx]) * down;
    out[P.hy] += (0.0 - out[P.hy]) * up + (-0.26 * s - out[P.hy]) * down;
    out[P.fa] += (Math.PI / 2 - out[P.fa]) * up + (-0.62 - out[P.fa]) * down;
    out[P.nod] += 0.08 * up - 0.05 * down;
    out[P.back] = 0;
    return 12;
  }

  /** The lunge (player) and the attack (AI) share one shape. */
  lungePose(out, ctx, k, hold, line, depth = 1) {
    this.guardPose(out, ctx, line);
    const { s } = this.f;
    const e = easeOut(clamp(k, 0, 1));
    const arm = easeOut(clamp(k * 1.45, 0, 1)); // the arm leads the foot: right of way
    // How far the body has to travel for the point to land. The rear foot
    // slides up a little (a step-lunge), which is what lets the back leg
    // stay on the floor at full stretch.
    const need = clamp(ctx.dist - ctx.oppPx - ctx.front - 1.76 * s - this.ox, 0.15 * s, 0.8 * s) * depth;
    out[P.px] += need * e;
    out[P.py] = (PELVIS - 0.16 * e * depth) * s;
    out[P.lean] = 0.05 + 0.24 * e;
    out[P.ffx] += (need + 0.1 * s) * e;
    out[P.bfx] += need * 0.22 * smooth(clamp(k * 1.3, 0, 1));
    const flight = clamp(k * 1.25, 0, 1);
    out[P.ffy] = (ANKLE_H + 0.12 * bell(flight) * depth) * s;
    out[P.ffp] = 0.45 * bell(flight * 0.9) - (k > 0.75 ? 0.1 * bell((k - 0.75) * 4) : 0);
    out[P.back] = e;
    out[P.nod] = -0.05;
    // Extend at the target line
    const [sx, sy] = this.f.shoulderAt(out);
    const tx = ctx.dist - ctx.oppPx - ctx.front;
    const dirX = tx - sx;
    const dirY = ctx.lines[line] - sy;
    const len = Math.hypot(dirX, dirY);
    const reach = REACH * s;
    const g = GUARD_HAND[line];
    out[P.hx] = g[0] * s + ((dirX / len) * reach - g[0] * s) * arm;
    out[P.hy] = g[1] * s + ((dirY / len) * reach - g[1] * s) * arm;
    out[P.fa] = this.aim(out, ctx, line).a;
    // On contact the blade bows instead of passing through the target
    if (hold) {
      this.contact(out, ctx, line);
      this.hold = line;
    }
  }

  /**
   * Bow the blade so its point lands exactly on the target line: the
   * curvature that makes the blade span the distance from the bell to the
   * target, and the pitch that puts the chord on it.
   */
  contact(p, ctx, line) {
    const a2 = this.aim(p, ctx, line);
    const st = BLADE_START + this.f.gripOff;
    // The blade leaves the bell along its START tangent (fa), not along
    // the line to the target: solve the two together (converges in a few
    // rounds — the bell is only ten centimetres out from the grip)
    let fa = a2.a;
    let kb = 0;
    for (let i = 0; i < 4; i++) {
      const bx = a2.handX + Math.cos(fa) * st;
      const by = a2.handY + Math.sin(fa) * st;
      kb = bendFor(Math.hypot(a2.tx - bx, a2.ty - by));
      fa = Math.atan2(a2.ty - by, a2.tx - bx) - (kb * BLADE) / 2;
    }
    p[P.bend] = kb;
    p[P.fa] = fa;
  }

  /** Writes this frame's target pose and springs the real pose to it. */
  update(dt, ctx) {
    this.phase += dt;
    this.t += dt;
    const out = this.target;
    const { act } = this;
    const k = this.dur > 0 ? this.t / this.dur : 1;
    this.hold = -1;

    let leadK = 0;
    let trailK = 0;
    let fwd = true;
    if (this.step) {
      const st = this.step;
      st.t += dt;
      const sk = clamp(st.t / st.dur, 0, 1);
      fwd = st.to > st.from;
      const d = st.to - st.from;
      // The pelvis glides through the whole step; the lead foot travels in
      // the first 60 %, the trailing foot in the last 60 %
      leadK = clamp(sk / 0.6, 0, 1);
      trailK = clamp((sk - 0.4) / 0.6, 0, 1);
      this.ox = st.from + d * smooth(sk);
      const lead = st.from + d * smooth(leadK);
      const trail = st.from + d * smooth(trailK);
      this.oxF = fwd ? lead : trail;
      this.oxB = fwd ? trail : lead;
      if (sk >= 1) {
        this.step = null;
        this.oxF = this.ox;
        this.oxB = this.ox;
      }
    } else {
      this.oxF = this.ox;
      this.oxB = this.ox;
    }

    const w = (ACTIONS[act] || ACTIONS.guard)(this, out, ctx, k);
    const { s } = this.f;

    // Footwork: the moving foot clears the piste in a low arc; the front
    // foot leads with the toes up so the heel lands first
    if (this.step) {
      const lift = bell(leadK) * 0.045 * s;
      const follow = bell(trailK) * 0.035 * s;
      out[fwd ? P.ffy : P.bfy] += lift;
      out[fwd ? P.bfy : P.ffy] += follow;
      if (fwd) out[P.ffp] += 0.3 * bell(leadK * 0.9);
      else out[P.ffp] += 0.18 * bell(trailK);
    }

    // No foot ever slides: one that still has ground to cover lifts while
    // it travels and lands as it arrives (recovering from a lunge, a
    // stagger, the step back after a touch). The planted back foot of a
    // lunge is the exception — it stays flat on the piste.
    if (out[P.relax] < 0.5) {
      const lunging = act === 'lunge' || act === 'attack';
      const travel = (x, y, pch, front) => {
        const d = Math.abs(out[x] - this.f.pose[x]);
        const up = clamp((d - 0.025 * s) * 0.55, 0, 0.065 * s);
        if (up <= 0) return;
        out[y] = Math.max(out[y], ANKLE_H * s + up);
        if (front) out[pch] = Math.max(out[pch], up * 3);
      };
      travel(P.ffx, P.ffy, P.ffp, true);
      if (!lunging) travel(P.bfx, P.bfy, P.bfp, false);
    }

    // Spring the real pose to the target
    const p = this.f.pose;
    const v = this.vel;
    for (let i = 0; i < POSE_LEN; i++) {
      // Hit flash is driven directly; bend snaps so the blade never wobbles through the target
      if (i === P.flash || i === P.bend || i === P.bob) {
        p[i] = out[i];
        continue;
      }
      // The mask goes on and comes off at a steady hand's pace
      if (i === P.mask) {
        const d = out[i] - p[i];
        p[i] += clamp(d, -dt * 1.9, dt * 1.9);
        continue;
      }
      // Feet move slower than the hands — weight transfers last; the
      // whole body settles into (or out of) the at-ease stance slowly
      const wi = i === P.ffx || i === P.bfx ? w * 0.85
        : i === P.fa || i === P.hy ? w * 1.15
          : i === P.relax || i === P.cheer ? Math.min(w, 9) : w;
      const r = springStep(p[i], v[i], out[i], wi, dt);
      p[i] = r[0];
      v[i] = r[1];
    }
    // In contact: bow the blade for where the body really is, not where
    // the springs are taking it — the point lands on the lamé on the very
    // frame the touch freezes
    if (this.hold >= 0) {
      this.contact(p, ctx, this.hold);
      v[P.fa] = 0;
    }
    // Feet never sink into the floor, even when a spring overshoots
    p[P.ffy] = Math.max(ANKLE_H * this.f.s, p[P.ffy]);
    p[P.bfy] = Math.max(ANKLE_H * this.f.s, p[P.bfy]);
    p[P.relax] = clamp(p[P.relax], 0, 1);
    this.flash = Math.max(0, this.flash - dt * 1.6);
  }
}
