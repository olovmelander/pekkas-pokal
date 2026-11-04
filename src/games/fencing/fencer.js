/**
 * Pekkas Fäktning — the fencer: an articulated low-poly figure, posed in
 * code every frame.
 *
 * The rig is driven by a small vector of numbers (the POSE): pelvis
 * position and lean, where each ankle is, where the weapon hand is, the
 * foil's pitch, yaw and bend, the rear arm and the head. Everything else
 * is solved: legs and the weapon arm are two-bone IK chains, so the feet
 * stay planted when the body sinks into a lunge, and the arm bends
 * naturally when the hand comes back. Because a pose is just numbers it
 * can be sprung (critically damped, so anticipation and follow-through
 * come for free when a target jumps), and it can be recorded and played
 * back — which is how the slow-motion replay works.
 *
 * Fencer-local space: +x towards the opponent, +y up, +z towards the
 * camera. The opponent is the same figure mirrored with scale.x = -1, so
 * both weapon arms are on the camera side — the Nidhogg mirror, and the
 * reason every blade line stays readable.
 */

import * as THREE from 'three';

/* ---- Proportions (metres) ------------------------------------------- */

const THIGH = 0.47;
const SHIN = 0.46;
export const ANKLE_H = 0.08;
const UPPER = 0.29;
const FORE = 0.27;
export const BLADE = 0.9;
const BLADE_START = 0.075; // from the fist to where the blade leaves the bell
const TORSO_Y = 0.03; // torso pivot above the pelvis
const SHOULDER_F = [0.1, 0.5, 0.08];
const SHOULDER_B = [-0.1, 0.49, -0.05];
const HIP_F = [0.07, -0.04, 0.06];
const HIP_B = [-0.07, -0.04, -0.05];

/* ---- Pose channels --------------------------------------------------- */

export const P = {
  px: 0, py: 1, lean: 2,
  ffx: 3, ffy: 4, ffp: 5, // front ankle x/y, foot pitch
  bfx: 6, bfy: 7, bfp: 8, // back ankle
  hx: 9, hy: 10, // weapon hand relative to the shoulder, fencer frame
  fa: 11, fyaw: 12, bend: 13, // foil pitch, sideways sweep, blade curvature
  back: 14, nod: 15, // rear arm 0 = classic curl, 1 = thrown back; head nod
  flash: 16 // lamé hit flash (0..1), recorded with the pose for replays
};
export const POSE_LEN = 17;

/* Line heights (world y) on the opponent's target, HÖG / MITT / LÅG */
export const LINE_Y = [1.42, 1.18, 0.96];
/* Weapon-hand guard position per line, relative to the shoulder */
const GUARD_HAND = [[0.25, 0.0], [0.3, -0.11], [0.27, -0.25]];

/* ---- Small maths ------------------------------------------------------ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) ** 3;
const bell = (k) => Math.sin(clamp(k, 0, 1) * Math.PI);

/**
 * Two-bone IK in a plane. Segments hang along -y at rotation 0, so a
 * segment with rotation θ points along (sin θ, -cos θ). `bend` picks the
 * side the middle joint goes: +1 knee forward, -1 elbow down.
 */
function ik2(out, hx, hy, tx, ty, l1, l2, bend) {
  let dx = tx - hx;
  let dy = ty - hy;
  let d = Math.hypot(dx, dy);
  const max = (l1 + l2) * 0.9995;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  d = Math.max(d, Math.abs(l1 - l2) + 1e-4);
  const base = Math.atan2(dx, -dy);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const a1 = base + bend * a;
  const kx = hx + l1 * Math.sin(a1);
  const ky = hy - l1 * Math.cos(a1);
  const a2 = Math.atan2(hx + dx - kx, -(hy + dy - ky));
  out[0] = a1;
  out[1] = a2 - a1;
  return out;
}

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

/* ---- Geometry helpers ------------------------------------------------- */

/** A tapered limb hanging from its joint along -y: lathe of a profile. */
function limb(len, r0, r1, bulge = 0, seg = 8) {
  const pts = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const r = r0 + (r1 - r0) * k + bulge * Math.sin(k * Math.PI) * (1 - k * 0.4);
    pts.push(new THREE.Vector2(Math.max(0.004, r * (i === 0 || i === n ? 0.82 : 1)), -k * len));
  }
  // Round the ends by pulling the first and last ring onto the axis
  pts.unshift(new THREE.Vector2(0.001, 0.012));
  pts.push(new THREE.Vector2(0.001, -len - 0.012));
  return new THREE.LatheGeometry(pts, seg);
}

function gridTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0c0e12';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(150,158,172,0.55)';
  ctx.lineWidth = 1;
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
  tex.repeat.set(5, 4);
  return tex;
}

/* ---- The fencer ------------------------------------------------------- */

export class Fencer {
  /**
   * @param {object} o
   * @param {number} o.sock    sock colour (identifies the fencer)
   * @param {boolean} o.mirror true for the fencer on the right
   */
  constructor({ sock, mirror = false }) {
    this.group = new THREE.Group();
    if (mirror) this.group.scale.x = -1;
    this.pose = new Float32Array(POSE_LEN);
    this._ik = [0, 0];
    this._bend = -1;
    this.tipLocal = new THREE.Vector3();
    this.midLocal = new THREE.Vector3();
    this._build(sock);
  }

  _build(sockColor) {
    const std = (color, roughness, metalness = 0, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    const m = {
      jacket: std(0xf3f1ea, 0.62),
      knickers: std(0xe9e6dd, 0.66),
      lame: std(0xc4cad3, 0.3, 0.88, { emissive: 0x000000 }),
      sock: std(sockColor, 0.78),
      shoe: std(0x1f2329, 0.45),
      grille: std(0x9aa2ae, 0.42, 0.75, { map: gridTexture() }),
      shell: std(0xe9e7e0, 0.5),
      skin: std(0xd9a47e, 0.6),
      glove: std(0xeeeae0, 0.5),
      steel: std(0xdfe4ec, 0.2, 0.96),
      grip: std(0x2a2422, 0.7),
      button: new THREE.MeshBasicMaterial({ color: 0xfff0c8 })
    };
    this.mats = m;
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    const joint = (parent, x = 0, y = 0, z = 0) => {
      const j = new THREE.Group();
      j.position.set(x, y, z);
      parent.add(j);
      return j;
    };

    /* Pelvis — only ever translated; the legs solve from it */
    const pelvis = joint(this.group);
    const seat = mesh(new THREE.SphereGeometry(0.16, 12, 8), m.knickers, pelvis, 0, -0.02, 0);
    seat.scale.set(0.95, 0.78, 0.88);

    /* Legs: hip → thigh → knee → shin → ankle → foot */
    const leg = (hip, back) => {
      const h = joint(pelvis, ...hip);
      const thigh = joint(h);
      mesh(limb(THIGH + 0.05, 0.085, 0.064, 0.012), m.knickers, thigh);
      const knee = joint(thigh, 0, -THIGH, 0);
      const shin = joint(knee);
      mesh(limb(SHIN, 0.058, 0.04, 0.012, 7), m.sock, shin);
      const ankle = joint(shin, 0, -SHIN, 0);
      const footRot = joint(ankle);
      if (back) footRot.rotation.y = -1.25; // rear foot turned out, toes to the camera
      const shoe = mesh(new THREE.CapsuleGeometry(0.048, 0.17, 3, 8), m.shoe, footRot, 0.06, -ANKLE_H + 0.035, 0);
      shoe.rotation.z = Math.PI / 2;
      shoe.scale.set(0.62, 1, 0.82);
      return { thigh, shin, ankle };
    };
    this.legF = leg(HIP_F, false);
    this.legB = leg(HIP_B, true);

    /* Torso — leans about the pelvis */
    const torso = joint(pelvis, 0, TORSO_Y, 0);
    const jacketGeo = new THREE.LatheGeometry([
      [0.001, -0.06], [0.15, -0.05], [0.158, 0.06], [0.165, 0.2], [0.18, 0.34],
      [0.178, 0.44], [0.15, 0.53], [0.08, 0.6], [0.001, 0.61]
    ].map(([r, y]) => new THREE.Vector2(r, y)), 12);
    const chest = mesh(jacketGeo, m.jacket, torso);
    chest.scale.set(1, 1, 0.72);
    // The lamé: a conductive vest over the trunk — the valid target in foil
    const lameGeo = new THREE.LatheGeometry([
      [0.001, -0.05], [0.157, -0.04], [0.165, 0.06], [0.172, 0.2], [0.187, 0.34],
      [0.184, 0.44], [0.12, 0.52], [0.001, 0.525]
    ].map(([r, y]) => new THREE.Vector2(r, y)), 12);
    const lame = mesh(lameGeo, m.lame, torso);
    lame.scale.set(1, 1, 0.74);
    this.lame = lame;

    /* Head: grille, white back shell and bib */
    const neck = joint(torso, 0.03, 0.6, 0);
    const head = joint(neck);
    const grille = mesh(new THREE.SphereGeometry(0.12, 14, 10), m.grille, head, 0.02, 0.1, 0);
    grille.scale.set(1.02, 1.22, 1.0);
    const shell = mesh(new THREE.SphereGeometry(0.128, 12, 10, -Math.PI / 2, Math.PI), m.shell, head, 0.0, 0.1, 0);
    shell.scale.set(1.0, 1.2, 1.02);
    const bib = mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.1, 12, 1, true), m.shell, head, 0.03, -0.02, 0);
    bib.rotation.z = -0.35;
    bib.scale.z = 0.86;
    this.head = head;

    /* Weapon arm: shoulder → upper → elbow → fore → wrist → foil */
    const shF = joint(torso, ...SHOULDER_F);
    const upF = joint(shF);
    mesh(limb(UPPER, 0.062, 0.05, 0.008), m.jacket, upF);
    const elF = joint(upF, 0, -UPPER, 0);
    const foF = joint(elF);
    mesh(limb(FORE, 0.05, 0.043, 0.006, 7), m.jacket, foF);
    // Gauntlet cuff over the end of the sleeve
    mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 10), m.glove, foF, 0, -FORE + 0.06, 0);
    const wrist = joint(foF, 0, -FORE, 0);
    const fist = mesh(new THREE.SphereGeometry(0.046, 10, 8), m.glove, wrist, 0.012, 0, 0);
    fist.scale.set(1.15, 1, 0.95);

    const foil = joint(wrist);
    const bellGeo = new THREE.SphereGeometry(0.06, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.6);
    bellGeo.rotateZ(-Math.PI / 2);
    mesh(bellGeo, m.steel, foil, 0.03, 0, 0);
    const gripGeo = new THREE.CylinderGeometry(0.013, 0.016, 0.12, 6);
    gripGeo.rotateZ(Math.PI / 2);
    mesh(gripGeo, m.grip, foil, -0.02, 0, 0);
    // The blade is rebuilt in place whenever its curvature changes
    const segs = 12;
    const bladeGeo = new THREE.CylinderGeometry(0.0032, 0.0062, BLADE, 4, segs, false);
    bladeGeo.rotateZ(-Math.PI / 2);
    bladeGeo.translate(BLADE / 2, 0, 0);
    this.bladeRest = Float32Array.from(bladeGeo.attributes.position.array);
    const blade = mesh(bladeGeo, m.steel, foil, BLADE_START, 0, 0);
    blade.frustumCulled = false;
    this.blade = blade;
    const button = mesh(new THREE.SphereGeometry(0.009, 6, 4), m.button, foil);
    button.castShadow = false;
    this.button = button;

    /* Rear arm, curled up behind in the classic carriage */
    const shB = joint(torso, ...SHOULDER_B);
    const upB = joint(shB);
    mesh(limb(UPPER, 0.058, 0.048, 0.008), m.jacket, upB);
    const elB = joint(upB, 0, -UPPER, 0);
    const foB = joint(elB);
    mesh(limb(FORE - 0.02, 0.046, 0.037, 0.005, 7), m.jacket, foB);
    mesh(new THREE.SphereGeometry(0.04, 8, 6), m.skin, foB, 0, -FORE + 0.01, 0);

    this.j = { pelvis, torso, neck, head, upF, foF, wrist, foil, upB, foB };
  }

  /** Bend the blade into a circular arc of curvature k (towards +y). */
  _setBend(k) {
    if (Math.abs(k - this._bend) < 2e-3) return;
    this._bend = k;
    const pos = this.blade.geometry.attributes.position;
    const rest = this.bladeRest;
    const arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) {
      const s = rest[i];
      const y = rest[i + 1];
      if (k < 1e-4) {
        arr[i] = s;
        arr[i + 1] = y;
      } else {
        const a = s * k;
        arr[i] = Math.sin(a) / k - y * Math.sin(a);
        arr[i + 1] = (1 - Math.cos(a)) / k + y * Math.cos(a);
      }
      arr[i + 2] = rest[i + 2];
    }
    pos.needsUpdate = true;
    this.blade.geometry.computeVertexNormals();
    // Tip and a mid-blade point, in foil space, for trails and sparks
    const tipPt = (s, out) => {
      if (k < 1e-4) out.set(BLADE_START + s, 0, 0);
      else out.set(BLADE_START + Math.sin(s * k) / k, (1 - Math.cos(s * k)) / k, 0);
    };
    tipPt(BLADE, this.tipLocal);
    tipPt(BLADE * 0.45, this.midLocal);
    this.button.position.copy(this.tipLocal);
  }

  /** Place every joint from a pose vector. */
  apply(p) {
    const { j } = this;
    const lean = p[P.lean];
    j.pelvis.position.set(p[P.px], p[P.py], 0);
    j.torso.rotation.z = -lean;

    // Legs: solve in pelvis space (the pelvis is never rotated)
    const leg = (L, hip, ax, ay, pitch) => {
      const r = ik2(this._ik, hip[0], hip[1], ax - p[P.px], ay - p[P.py], THIGH, SHIN, 1);
      L.thigh.rotation.z = r[0];
      L.shin.rotation.z = r[1];
      L.ankle.rotation.z = -(r[0] + r[1]) + pitch;
    };
    leg(this.legF, HIP_F, p[P.ffx], p[P.ffy], p[P.ffp]);
    leg(this.legB, HIP_B, p[P.bfx], p[P.bfy], p[P.bfp]);

    // Weapon arm: hand target is given relative to the shoulder in the
    // fencer frame; rotate it into the leaning torso frame first
    const c = Math.cos(lean);
    const s = Math.sin(lean);
    const tx = p[P.hx] * c - p[P.hy] * s;
    const ty = p[P.hx] * s + p[P.hy] * c;
    const a = ik2(this._ik, 0, 0, tx, ty, UPPER, FORE, -1);
    j.upF.rotation.z = a[0];
    j.foF.rotation.z = a[1];
    j.wrist.rotation.z = p[P.fa] + lean - a[0] - a[1];
    j.foil.rotation.y = p[P.fyaw];
    this._setBend(p[P.bend]);

    // Rear arm: blend between the raised carriage and thrown-back lunge
    const b = p[P.back];
    j.upB.rotation.z = -2.05 + b * 0.95;
    j.foB.rotation.z = -1.45 + b * 1.35;

    j.head.rotation.z = -p[P.nod];
    j.neck.rotation.z = lean * 0.35;

    const f = p[P.flash];
    this.mats.lame.emissiveIntensity = f * 1.6;
  }

  /** World position of the blade tip (after apply + matrix update). */
  tipWorld(out) {
    return out.copy(this.tipLocal).applyMatrix4(this.j.foil.matrixWorld);
  }

  midWorld(out) {
    return out.copy(this.midLocal).applyMatrix4(this.j.foil.matrixWorld);
  }

  setSock(color) {
    this.mats.sock.color.set(color);
  }

  setFlashColor(color) {
    this.mats.lame.emissive.set(color);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
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
    this.lineFrom = 1;
    this.phase = seed;
    this.ox = 0; // footwork offset along the piste
    this.step = null; // { from, to, t, dur }
    this.flash = 0;
    this.speed = 18;
    this.guardPose(this.f.pose, { dist: 2.6, oppPx: 0 });
    this.target.set(this.f.pose);
  }

  play(act, dur = 0.3, opts = {}) {
    this.act = act;
    this.t = 0;
    this.dur = dur;
    this.opts = opts;
  }

  /** Small advance (+) or retreat (−) step, front foot leads on advance. */
  stepBy(dx, dur = 0.3) {
    if (this.step) return;
    this.step = { from: this.ox, to: this.ox + dx, t: 0, dur };
  }

  /** Physical jolt: push a channel's velocity (hit reactions). */
  impulse(ch, v) {
    this.vel[ch] += v;
  }

  /** Shoulder position in the fencer frame for a pose vector. */
  static shoulder(out) {
    const l = out[P.lean];
    const sy = SHOULDER_F[1] + TORSO_Y;
    return [
      out[P.px] + SHOULDER_F[0] * Math.cos(l) + sy * Math.sin(l),
      out[P.py] - SHOULDER_F[0] * Math.sin(l) + sy * Math.cos(l)
    ];
  }

  /** Angle from the weapon hand to the opponent's target in `line`. */
  aim(out, ctx, line) {
    const [sx, sy] = Animator.shoulder(out);
    const handX = sx + out[P.hx];
    const handY = sy + out[P.hy];
    const tx = ctx.dist - ctx.oppPx - 0.17;
    return { a: Math.atan2(LINE_Y[line] - handY, tx - handX), handX, handY, tx, sx, sy };
  }

  guardPose(out, ctx, line = this.line) {
    const ph = this.phase;
    const bob = Math.sin(ph * 2 * Math.PI * 1.25);
    out[P.px] = this.ox + Math.sin(ph * 2.6) * 0.012;
    out[P.py] = 0.86 + bob * 0.016;
    out[P.lean] = 0.05 + bob * 0.008;
    out[P.ffx] = this.ox + 0.44;
    out[P.ffy] = ANKLE_H;
    out[P.ffp] = 0;
    out[P.bfx] = this.ox - 0.4;
    out[P.bfy] = ANKLE_H;
    out[P.bfp] = 0;
    // The hand drifts between lines rather than snapping
    const g = GUARD_HAND[line];
    out[P.hx] = g[0] + Math.sin(ph * 2.3) * 0.008;
    out[P.hy] = g[1] + Math.cos(ph * 1.9) * 0.008;
    out[P.fa] = this.aim(out, ctx, line).a + [0.1, 0.05, -0.02][line];
    out[P.fyaw] = 0.04;
    out[P.bend] = 0;
    out[P.back] = 0;
    out[P.nod] = 0.06;
    out[P.flash] = this.flash;
  }

  /** The lunge (player) and the attack (AI) share one shape. */
  lungePose(out, ctx, k, hold, line, depth = 1) {
    this.guardPose(out, ctx, line);
    const e = easeOut(clamp(k, 0, 1));
    const arm = easeOut(clamp(k * 1.45, 0, 1)); // the arm leads the foot: right of way
    // How far the body has to travel for the point to land. The rear foot
    // slides up a little (a step-lunge), which is what lets the back leg
    // stay on the floor at full stretch.
    const need = clamp(ctx.dist - ctx.oppPx - 1.95, 0.15, 0.66) * depth;
    out[P.px] += need * e;
    out[P.py] = 0.86 - 0.18 * e * depth;
    out[P.lean] = 0.05 + 0.24 * e;
    out[P.ffx] += (need + 0.1) * e;
    out[P.bfx] += need * 0.4 * smooth(clamp(k * 1.3, 0, 1));
    const flight = clamp(k * 1.25, 0, 1);
    out[P.ffy] = ANKLE_H + 0.13 * bell(flight) * depth;
    out[P.ffp] = 0.45 * bell(flight * 0.9) - (k > 0.75 ? 0.1 * bell((k - 0.75) * 4) : 0);
    out[P.back] = e;
    out[P.nod] = -0.05;
    // Extend at the target line
    const [sx, sy] = Animator.shoulder(out);
    const tx = ctx.dist - ctx.oppPx - 0.17;
    const dirX = tx - sx;
    const dirY = LINE_Y[line] - sy;
    const len = Math.hypot(dirX, dirY);
    const reach = 0.555;
    const g = GUARD_HAND[line];
    out[P.hx] = g[0] + ((dirX / len) * reach - g[0]) * arm;
    out[P.hy] = g[1] + ((dirY / len) * reach - g[1]) * arm;
    const a2 = this.aim(out, ctx, line);
    out[P.fa] = a2.a;
    // On contact the blade bows instead of passing through the target
    if (hold) {
      const bx = a2.handX + Math.cos(a2.a) * BLADE_START;
      const by = a2.handY + Math.sin(a2.a) * BLADE_START;
      const d = Math.hypot(a2.tx - bx, LINE_Y[line] - by);
      const kb = bendFor(d);
      out[P.bend] = kb;
      out[P.fa] = a2.a - (kb * BLADE) / 2;
    }
  }

  /** Writes this frame's target pose and springs the real pose to it. */
  update(dt, ctx) {
    this.phase += dt;
    this.t += dt;
    const out = this.target;
    const { act } = this;
    const k = this.dur > 0 ? this.t / this.dur : 1;
    let w = 18;

    if (this.step) {
      const st = this.step;
      st.t += dt;
      const sk = clamp(st.t / st.dur, 0, 1);
      this.ox = st.from + (st.to - st.from) * smooth(sk);
      if (sk >= 1) this.step = null;
    }

    switch (act) {
      case 'lunge':
      case 'attack': {
        const hitAt = this.opts.hitAt || this.dur;
        this.lungePose(out, ctx, this.t / hitAt, this.t >= hitAt * 0.92 && !this.opts.parried, this.line);
        w = 46;
        break;
      }
      case 'feint': {
        // Half an extension and an appel — the stamp of the front foot
        this.guardPose(out, ctx);
        const b = bell(k);
        const g = GUARD_HAND[this.line];
        out[P.hx] = g[0] + 0.16 * b;
        out[P.hy] = g[1] + 0.03 * b;
        out[P.px] += 0.06 * b;
        out[P.ffx] += 0.1 * b;
        out[P.ffy] = ANKLE_H + 0.07 * bell(k * 1.6);
        out[P.lean] += 0.06 * b;
        w = 40;
        break;
      }
      case 'parry': {
        // The beat: a short sharp sweep into the line, then back
        this.guardPose(out, ctx);
        const b = bell(clamp(k * 1.6, 0, 1));
        out[P.fa] += 0.38 * b * (this.line === 2 ? -1 : 1);
        out[P.fyaw] = 0.04 + 0.42 * b;
        out[P.hx] += 0.04 * b;
        w = 44;
        break;
      }
      case 'stagger': {
        // Blade knocked aside, a stumbling step back, then composure
        this.guardPose(out, ctx);
        const b = bell(k);
        const early = bell(clamp(k * 2.2, 0, 1));
        out[P.fa] += 0.95 * early + 0.2 * b;
        out[P.fyaw] = 0.04 - 0.5 * early;
        out[P.hx] -= 0.1 * b;
        out[P.hy] += 0.14 * early;
        out[P.lean] -= 0.16 * b;
        out[P.px] -= 0.12 * b;
        out[P.bfx] -= 0.12 * bell(clamp(k * 1.4, 0, 1));
        out[P.bfy] = ANKLE_H + 0.05 * bell(clamp(k * 2.5, 0, 1));
        out[P.back] = 0.5 * b;
        out[P.nod] = -0.12 * b;
        w = 22;
        break;
      }
      case 'bitten': {
        // Went for the feint: the parry swings into empty air
        this.guardPose(out, ctx);
        const b = bell(clamp(k * 1.3, 0, 1));
        out[P.fa] -= 0.75 * b;
        out[P.fyaw] = 0.04 + 0.55 * b;
        out[P.hy] -= 0.1 * b;
        out[P.hx] -= 0.05 * b;
        out[P.lean] -= 0.05 * b;
        w = 30;
        break;
      }
      case 'recover': {
        // Pulling back out of the lunge — open for a moment
        const r = 1 - smooth(clamp(k, 0, 1));
        this.lungePose(out, ctx, 0.85 * r, false, this.line, r);
        w = 13;
        break;
      }
      case 'telegraph': {
        // The coil: sit back, sink, draw the hand back and aim the point
        this.guardPose(out, ctx);
        const c = smooth(clamp(k * 1.8, 0, 1));
        out[P.py] -= 0.06 * c;
        out[P.px] -= 0.05 * c;
        out[P.lean] += 0.04 * c;
        out[P.hx] -= 0.07 * c;
        out[P.fa] = this.aim(out, ctx, this.line).a + 0.02 * Math.sin(this.t * 40) * c;
        out[P.back] = -0.15 * c;
        w = 24;
        break;
      }
      case 'salute': {
        // Blade to the mask, sweep down towards the opponent, en garde
        this.guardPose(out, ctx);
        const up = smooth(clamp(k / 0.4, 0, 1)) * (1 - smooth(clamp((k - 0.55) / 0.2, 0, 1)));
        const down = smooth(clamp((k - 0.55) / 0.2, 0, 1)) * (1 - smooth(clamp((k - 0.85) / 0.15, 0, 1)));
        out[P.hx] += (0.08 - out[P.hx]) * up + (0.42 - out[P.hx]) * down;
        out[P.hy] += (0.0 - out[P.hy]) * up + (-0.18 - out[P.hy]) * down;
        out[P.fa] += (Math.PI / 2 - out[P.fa]) * up + (-0.55 - out[P.fa]) * down;
        out[P.fyaw] += 0.1 * up;
        out[P.py] += 0.08 * (up + down);
        out[P.nod] += 0.1 * up;
        w = 12;
        break;
      }
      case 'win':
      case 'champion': {
        this.guardPose(out, ctx);
        const big = act === 'champion' ? 1 : 0.6;
        const r = smooth(clamp(k * 2, 0, 1));
        out[P.py] = 0.94 + Math.abs(Math.sin(this.t * 7)) * 0.05 * big * r;
        out[P.hx] += (0.12 - out[P.hx]) * r;
        out[P.hy] += (0.42 * big - out[P.hy]) * r;
        out[P.fa] += (1.25 - out[P.fa]) * r;
        out[P.back] = -0.25 * r;
        out[P.lean] = -0.04 * r;
        out[P.nod] = -0.18 * r;
        w = 10;
        break;
      }
      case 'lose': {
        this.guardPose(out, ctx);
        const r = smooth(clamp(k * 1.5, 0, 1));
        out[P.py] = 0.86 + 0.08 * r;
        out[P.hx] += (0.18 - out[P.hx]) * r;
        out[P.hy] += (-0.38 - out[P.hy]) * r;
        out[P.fa] += (-1.05 - out[P.fa]) * r;
        out[P.nod] = 0.06 + 0.32 * r;
        out[P.lean] = 0.1 * r;
        out[P.back] = 0.6 * r;
        w = 7;
        break;
      }
      default: {
        this.guardPose(out, ctx);
        w = 16;
      }
    }

    // Footwork: the moving foot lifts in a small arc, the other follows
    if (this.step) {
      const st = this.step;
      const sk = clamp(st.t / st.dur, 0, 1);
      const fwd = st.to > st.from;
      const lead = bell(clamp(sk * 1.6, 0, 1)) * 0.05;
      const trail = bell(clamp(sk * 1.6 - 0.6, 0, 1)) * 0.04;
      out[fwd ? P.ffy : P.bfy] += lead;
      out[fwd ? P.bfy : P.ffy] += trail;
    }

    // Spring the real pose to the target
    const p = this.f.pose;
    const v = this.vel;
    for (let i = 0; i < POSE_LEN; i++) {
      // Hit flash is driven directly; bend snaps so the blade never wobbles through the target
      if (i === P.flash || i === P.bend) {
        p[i] = out[i];
        continue;
      }
      // Feet move slower than the hands — weight transfers last
      const wi = i === P.ffx || i === P.bfx ? w * 0.85 : i === P.fa || i === P.hy ? w * 1.15 : w;
      const r = springStep(p[i], v[i], out[i], wi, dt);
      p[i] = r[0];
      v[i] = r[1];
    }
    // Feet never sink into the floor, even when a spring overshoots
    p[P.ffy] = Math.max(ANKLE_H, p[P.ffy]);
    p[P.bfy] = Math.max(ANKLE_H, p[P.bfy]);
    this.flash = Math.max(0, this.flash - dt * 1.6);
  }
}
