/**
 * Pekkas Måleri — the people in the garden.
 *
 * Everyone here is a real participant from 7 August 2021, built with the
 * shared character system (../shared/people.js) so they look the same as
 * in every other year's game:
 *
 *  - Mikael Hägglund, the invited culture profile, in his black polo neck. He strolls between the easels with his notebook,
 *    walks over when your time is up, studies the canvas with the pen at
 *    his chin, writes, and turns to deliver the verdict — talking, and with
 *    a face that tells you the grade before the card does.
 *  - The rest of the field at their easels: Per Olsson as the ceramicist
 *    Hans Hedberg in a red beret (the dress code was "high-culture
 *    profile"), Olov Melander, Per Vikman and Henrik Lundqvist (who
 *    arranged it) and Viktor Jones paint for real — the brush hand reaches
 *    the canvas with IK, goes back to the palette to mix, and every so often
 *    they step back and look. Further off, Tobias Lundqvist, Ludvig
 *    Ulenius, Erik Vallgren, Rickard Nilsson and Niklas Norberg stand at
 *    theirs as an instanced crowd: ten painters for the price of a handful
 *    of draw calls.
 *
 * Props are positioned, not parented: each frame a brush is aimed from the
 * fist at the point it is painting, and a palette is laid in the off hand
 * level with the painter's body. That keeps contact exact whatever the IK
 * did to the wrist, and lets all the brushes share one instanced draw and
 * all the palettes another.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPerson, appearanceFor, POSES, mixPoses, createCrowd, WALK_STRIDE } from '../shared/people.js';
import { buildFieldEasels, mulberry } from './garden.js';
import { ARTWORKS } from './artworks.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Field easels are buildEasel(null, 0.78, 0.6) at 0.88 scale (garden.js). */
const EASEL_SCALE = 0.88;
const FIELD_CANVAS = { y: (0.98 + 0.3) * EASEL_SCALE, z: 0.06 * EASEL_SCALE, hw: 0.39 * EASEL_SCALE, hh: 0.3 * EASEL_SCALE };
/** How far a brush sticks out of the fist toward what it paints. */
const BRUSH_OUT = 0.19;
/** Hand bone to the middle of the fist (the people.js grip socket), roughly. */
const FIST = 0.08;

/*
 * The field. `at` is where the painter stands, `face` how far they turn
 * from looking straight at the wide shot's camera (radians), `detail`
 * 'high' for the two the camera sees closest. The easel goes in front and
 * a little to the brush hand's side, canvas toward the painter. Facing the
 * camera put every painter behind their own canvas — four heads floating
 * over four boards — so they turn: about −0.8 shows a three-quarter face
 * with the easel off to one side, about +1.6 a profile with the canvas
 * beyond them. Either way the whole figure and the brush on the canvas show.
 */
const PAINTERS = [
  {
    name: 'Per Olsson', work: 'stjarnenatten', at: [-1.0, -4.75], face: -0.8, detail: 'high',
    // Per came as Hans Hedberg: the red beret, and a ceramicist's apron over
    // a linen shirt. Face, hair and beard stay his own (appearanceFor).
    look: { headwear: { style: 'beret', color: 0xa8202c }, outfit: { top: 'apron', topColor: 0xe4dac6, accent: 0x6b4a2e, bottom: 'trousers', bottomColor: 0x4a4038, shoes: 'leather' } }
  },
  {
    // Olov drew Skriet out of the hat — and won with it
    name: 'Olov Melander', work: 'skriet', at: [0.45, -5.8], face: 1.6, detail: 'high',
    look: { outfit: { top: 'shirt', topColor: 0x2f4f6e, bottom: 'trousers', bottomColor: 0x3a3f4a, shoes: 'leather' } }
  },
  {
    name: 'Per Vikman', work: 'monalisa', at: [-3.6, -7.0], face: -0.9, detail: 'low',
    look: { outfit: { top: 'shirt', topColor: 0x7a2e2a, bottom: 'trousers', bottomColor: 0x5a5348, shoes: 'leather' } }
  },
  {
    name: 'Henrik Lundqvist', work: 'nattvarden', at: [1.8, -8.1], face: 1.5, detail: 'low',
    look: { outfit: { top: 'sweater', topColor: 0x3f6a4a, bottom: 'trousers', bottomColor: 0x4a5a72 } }
  },
  {
    name: 'Viktor Jones', work: 'parlorhange', at: [-1.2, -8.4], face: -0.75, detail: 'low',
    look: { outfit: { top: 'shirt', topColor: 0xe8e0cf, bottom: 'trousers', bottomColor: 0x2a2e38, shoes: 'leather' } }
  }
];

/** Further back: the rest of the 2021 field, as one instanced crowd. */
const BACK_ROW = {
  names: ['Tobias Lundqvist', 'Ludvig Ulenius', 'Erik Vallgren', 'Rickard Nilsson', 'Niklas Norberg'],
  at: [[-6.2, -7.8], [0.3, -8.6], [3.4, -7.4], [-5.6, -5.4], [4.4, -4.6]]
};

/** Hägglund's costume: the culture profile's black polo neck. */
const JUDGE_OUTFIT = { top: 'poloNeck', topColor: 0x1f2026, bottomColor: 0x8f8268, shoes: 'leather' };

/** Where the wide shot's camera stands on average (index.js): the field faces it. */
const AUDIENCE = new THREE.Vector2(3.0, 2.7);

/* ------------------------------------------------------------------ props */

/** Merge simple parts into one vertex-coloured geometry. */
function coloured(parts) {
  const geos = parts.map(({ geo: g, color, m }) => {
    if (m) g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    Object.keys(g.attributes).forEach((k) => {
      if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    });
    return g;
  });
  const out = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return out;
}

const M4 = (pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) => new THREE.Matrix4().compose(
  new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scl)
);

/** A brush along +Y: the fist at the origin, bristles at +BRUSH_OUT. */
function brushGeometry(tip = 0x2a2018) {
  return coloured([
    { geo: new THREE.CylinderGeometry(0.0055, 0.0075, 0.3, 6), color: 0xb8803a, m: M4([0, BRUSH_OUT - 0.17, 0]) },
    { geo: new THREE.CylinderGeometry(0.0078, 0.0068, 0.04, 6), color: 0xb9b4aa, m: M4([0, BRUSH_OUT - 0.03, 0]) },
    { geo: new THREE.ConeGeometry(0.0085, 0.035, 6), color: tip, m: M4([0, BRUSH_OUT - 0.0, 0], [Math.PI, 0, 0]) }
  ]);
}

/**
 * A palette in the XZ plane: the thumb hole at the origin, the board
 * reaching out along +X, five pigments round the rim and a mix in the middle.
 */
function paletteGeometry() {
  const parts = [{ geo: new THREE.CylinderGeometry(0.15, 0.15, 0.009, 18), color: 0xb98d52, m: M4([0.13, 0, 0.02], [0, 0, 0], [1.15, 1, 0.85]) }];
  [0xc0242c, 0xe8b419, 0x22459b, 0xf4f2ea, 0x24201c].forEach((col, i) => {
    const a = -1.9 + i * 0.62;
    parts.push({
      geo: new THREE.SphereGeometry(0.019, 6, 4), color: col,
      m: M4([0.13 + Math.cos(a) * 0.13, 0.006, 0.02 + Math.sin(a) * 0.1], [0, 0, 0], [1, 0.45, 1])
    });
  });
  parts.push({ geo: new THREE.SphereGeometry(0.04, 7, 4), color: 0x7a6a4a, m: M4([0.15, 0.005, 0.03], [0, 0.6, 0], [1.2, 0.2, 0.8]) });
  return coloured(parts);
}

/** An open notebook in the XZ plane, spine along Z, centred on the origin. */
function notebookGeometry() {
  return coloured([
    { geo: new THREE.BoxGeometry(0.105, 0.008, 0.2), color: 0x6b2e24, m: M4([-0.054, 0, 0], [0, 0, 0.1]) },
    { geo: new THREE.BoxGeometry(0.105, 0.008, 0.2), color: 0x6b2e24, m: M4([0.054, 0, 0], [0, 0, -0.1]) },
    { geo: new THREE.BoxGeometry(0.098, 0.006, 0.19), color: 0xf3eedf, m: M4([-0.051, 0.0065, 0], [0, 0, 0.1]) },
    { geo: new THREE.BoxGeometry(0.098, 0.006, 0.19), color: 0xf3eedf, m: M4([0.051, 0.0065, 0], [0, 0, -0.1]) },
    // A few lines of his handwriting
    ...[0, 1, 2, 3].map((i) => ({ geo: new THREE.BoxGeometry(0.06 - (i % 2) * 0.015, 0.002, 0.004), color: 0x3a3a48, m: M4([0.05, 0.0115, -0.06 + i * 0.03], [0, 0, -0.1]) }))
  ]);
}

/** The judge's pen along +Y: the fist at the origin. */
function penGeometry() {
  return coloured([
    { geo: new THREE.CylinderGeometry(0.0045, 0.0045, 0.13, 6), color: 0x18181a, m: M4([0, 0.02, 0]) },
    { geo: new THREE.ConeGeometry(0.0045, 0.015, 6), color: 0xc9a24a, m: M4([0, 0.092, 0]) }
  ]);
}

/**
 * A painter's canvas so far, as a grid of vertex colours: the motif's
 * regions filled flat in roughly the master's colours (they are amateurs,
 * and a beer or two in), with the last few regions still bare linen.
 */
function workInProgress(work, seed, cols = 16, rows = 18) {
  const cv = document.createElement('canvas');
  cv.width = cols * 4;
  cv.height = rows * 4;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const r = mulberry(seed);
  ctx.fillStyle = '#d8cfba';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const done = Math.ceil(work.regions.length * (0.6 + r() * 0.3));
  work.regions.forEach((rg, i) => {
    if (i >= done) return;
    const c = new THREE.Color(rg.color).offsetHSL((r() - 0.5) * 0.04, (r() - 0.5) * 0.12, (r() - 0.5) * 0.08);
    ctx.fillStyle = `#${c.getHexString()}`;
    ctx.beginPath();
    rg.path(ctx, cv.width, cv.height);
    ctx.fill();
  });
  // Sample the middle of each 4×4 cell
  const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const colors = new Float32Array(cols * rows * 3);
  const c = new THREE.Color();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const k = ((y * 4 + 2) * cv.width + (x * 4 + 2)) * 4;
      c.setRGB(px[k] / 255, px[k + 1] / 255, px[k + 2] / 255, THREE.SRGBColorSpace);
      colors.set([c.r, c.g, c.b], (y * cols + x) * 3);
    }
  }
  return { cols, rows, colors };
}

/* ------------------------------------------------------------- helpers */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();

const ease = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const smooth01 = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const angleTo = (from, to) => {
  let d = to - from;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};

/** Copy one arm's channels from pose b into pose a. */
function takeArm(a, b, side) {
  for (const n of ['upperArm', 'forearm', 'hand']) {
    const k = n + side;
    a[k][0] = b[k][0];
    a[k][1] = b[k][1];
    a[k][2] = b[k][2];
  }
  a[`grip${side}`] = b[`grip${side}`];
}

/** Aim a prop's +Y from `from` along `dir`, into an instance or a matrix. */
function aimMatrix(from, dir, out) {
  _q.setFromUnitVectors(Y_AXIS, dir);
  return out.compose(from, _q, _s);
}

/* ------------------------------------------------------------- painters */

/**
 * One painter at an easel: paints in short strokes, mixes on the palette,
 * steps back to look, glances at the judge when he passes, and raises the
 * brush when somebody's canvas gets a great verdict.
 */
class Painter {
  constructor(def, detail, rand) {
    const person = createPerson({ ...appearanceFor(def.name, def.look), detail });
    this.person = person;
    this.name = def.name;
    const [x, z] = def.at;
    const face = Math.atan2(AUDIENCE.x - x, AUDIENCE.y - z) + def.face;
    this.face = face;
    person.root.position.set(x, 0, z);
    person.root.rotation.y = face;
    const f = new THREE.Vector3(Math.sin(face), 0, Math.cos(face));
    const right = new THREE.Vector3(-Math.cos(face), 0, Math.sin(face));
    this.fwd = f;
    // The easel: in front and toward the brush hand, canvas turned to them
    const E = new THREE.Vector3(x, 0, z).addScaledVector(f, 0.66).addScaledVector(right, 0.26);
    const ry = Math.atan2(x - E.x, z - E.z);
    this.easel = { x: E.x, z: E.z, ry };
    this.canvasC = new THREE.Vector3(E.x + Math.sin(ry) * FIELD_CANVAS.z, FIELD_CANVAS.y, E.z + Math.cos(ry) * FIELD_CANVAS.z);
    this.canvasU = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry)); // the painter's right
    this.canvasN = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)); // toward the painter
    this.rand = rand;
    this.phase = rand() * 10;
    this.mode = 'look';
    this.modeT = 0;
    this.modeDur = 0.5 + rand() * 2;
    this.stroke = { a: [0, 0], b: [0, 0], t: 1, dur: 0.4 };
    this.ikW = 0;
    this.lean = 0;
    this.back = 0;
    this.salute = 0;
    this.saluteT = 0;
    this.tilt = (rand() - 0.5) * 0.24;
    this.tip = new THREE.Vector3().copy(this.canvasC);
    this.tipGoal = new THREE.Vector3().copy(this.canvasC);
    this.look = new THREE.Vector3().copy(this.canvasC);
    this.lookGoal = new THREE.Vector3();
    this.pose = POSES.stand();
    this.poseB = POSES.stand();
    this.cheerPose = POSES.cheer(0);
    this.restHand = new THREE.Vector3();
    this.shoulder = new THREE.Vector3();
    this.pole = new THREE.Vector3();
    this.grip = new THREE.Vector3();
    this.palettePos = new THREE.Vector3();
    this.paletteTop = new THREE.Vector3();
    this.brushDir = new THREE.Vector3(0, -1, 0);
    this.paletteMatrix = new THREE.Matrix4();
    this.brushMatrix = new THREE.Matrix4();
  }

  /** A point on their canvas, u and v in −1..1, a little proud of it. */
  canvasPoint(u, v, lift, out) {
    return out.copy(this.canvasC)
      .addScaledVector(this.canvasU, u * FIELD_CANVAS.hw)
      .addScaledVector(UP, v * FIELD_CANVAS.hh)
      .addScaledVector(this.canvasN, 0.012 + lift);
  }

  nextStroke() {
    const r = this.rand;
    const s = this.stroke;
    // Mostly a continuation of the last stroke, sometimes somewhere new
    const near = r() < 0.7;
    const u0 = near ? THREE.MathUtils.clamp(s.b[0] + (r() - 0.5) * 0.4, -0.8, 0.8) : (r() - 0.5) * 1.5;
    const v0 = near ? THREE.MathUtils.clamp(s.b[1] + (r() - 0.5) * 0.4, -0.75, 0.75) : (r() - 0.5) * 1.4;
    const a = r() * TAU;
    const len = 0.15 + r() * 0.3;
    s.a = [u0, v0];
    s.b = [THREE.MathUtils.clamp(u0 + Math.cos(a) * len, -0.85, 0.85), THREE.MathUtils.clamp(v0 + Math.sin(a) * len * 0.6, -0.8, 0.8)];
    s.t = 0;
    s.dur = 0.3 + r() * 0.35;
  }

  setMode(mode) {
    const r = this.rand;
    this.mode = mode;
    this.modeT = 0;
    this.modeDur = mode === 'paint' ? 3 + r() * 4 : mode === 'mix' ? 1.3 + r() * 1 : mode === 'salute' ? 2.6 : 1.5 + r() * 1.6;
    if (mode === 'paint') this.nextStroke();
    if (mode === 'look') this.tilt = (r() - 0.5) * 0.3;
  }

  /** Somebody's canvas has just been praised: brush up for a moment. */
  hail(delay) {
    this.saluteDelay = delay;
  }

  update(dt, t, ctx) {
    this.advance(dt);
    const w = this.goals(dt, t, ctx);
    this.ikW = ease(this.ikW, w.ik, w.ik ? 7 : 5, dt);
    this.lean = ease(this.lean, w.lean, 4, dt);
    this.back = ease(this.back, w.back, 3, dt);
    this.salute = ease(this.salute, w.salute, 6, dt);
    this.tip.lerp(this.tipGoal, 1 - Math.exp(-dt * 22));
    this.look.lerp(this.lookGoal, 1 - Math.exp(-dt * 9));
    const p = this.person;
    p.setPose(this.bodyPose(t), 1);
    p.root.updateMatrixWorld(true);
    this.updatePalette();
    if (this.ikW > 0.005) this.brushArm();
    p.lookAt(this.look, 1);
    p.update(dt, t);
    p.root.updateMatrixWorld(true);
    this.updateBrush();
  }

  /** Paint for a while, then mix or step back; a hail interrupts. */
  advance(dt) {
    this.modeT += dt;
    if (this.saluteDelay !== undefined) {
      this.saluteDelay -= dt;
      if (this.saluteDelay <= 0) {
        this.saluteDelay = undefined;
        this.setMode('salute');
      }
    }
    if (this.modeT > this.modeDur) {
      if (this.mode === 'paint') this.setMode(this.rand() < 0.55 ? 'mix' : 'look');
      else this.setMode('paint');
    }
  }

  /** Where the bristles and the eyes go this frame, and the body's weights. */
  goals(dt, t, ctx) {
    const w = { ik: 0, lean: 0, back: 0, salute: 0 };
    if (this.mode === 'paint') {
      const s = this.stroke;
      s.t += dt / s.dur;
      if (s.t >= 1.35) this.nextStroke();
      const k = smooth01(s.t);
      // Between strokes the brush lifts off and travels to the next one
      const lift = s.t > 1 ? Math.sin(((s.t - 1) / 0.35) * Math.PI) * 0.05 : 0;
      this.canvasPoint(s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k, lift, this.tipGoal);
      this.lookGoal.copy(this.tipGoal);
      w.ik = 1;
      w.lean = 1;
    } else if (this.mode === 'mix') {
      // Circles in the middle of the palette
      const a = t * 7 + this.phase;
      this.tipGoal.copy(this.paletteTop).add(_v.set(Math.cos(a) * 0.025, 0.015, Math.sin(a) * 0.02));
      this.lookGoal.copy(this.paletteTop);
      w.ik = 1;
      w.lean = 0.4;
    } else if (this.mode === 'salute') {
      this.lookGoal.copy(ctx.focus);
      w.salute = Math.min(1, Math.sin(Math.min(1, this.modeT / this.modeDur) * Math.PI) * 1.6);
    } else {
      // Stepped back, head on one side, judging their own work
      this.lookGoal.copy(this.canvasC);
      w.back = 1;
    }
    // The judge walking past is more interesting than one's own canvas
    if (ctx.judgeWalking && this.mode !== 'salute') {
      const root = this.person.root.position;
      if (Math.hypot(ctx.judgeHead.x - root.x, ctx.judgeHead.z - root.z) < 2.6) this.lookGoal.copy(ctx.judgeHead);
    }
    return w;
  }

  /** Standing at ease: the off arm holds the palette, the brush arm hangs or rises. */
  bodyPose(t) {
    const pose = POSES.holdNotebook(t * 0.9 + this.phase, this.pose);
    const idle = POSES.idle(t * 0.8 + this.phase, this.poseB);
    for (const n of ['hips', 'spine', 'chest', 'thighL', 'thighR', 'footL', 'footR']) {
      pose[n][0] = idle[n][0];
      pose[n][1] = idle[n][1];
      pose[n][2] = idle[n][2];
    }
    pose.hipsPos[0] = idle.hipsPos[0];
    pose.head[0] = 0.02;
    pose.head[1] = 0;
    takeArm(pose, idle, 'R');
    pose.gripR = 0.9;
    pose.gripL = 0.55;
    if (this.salute > 0.001) {
      const c = this.cheerPose;
      const w = this.salute;
      for (const n of ['upperArmR', 'forearmR', 'handR']) {
        for (let i = 0; i < 3; i++) pose[n][i] += (c[n][i] - pose[n][i]) * w;
      }
      pose.chest[0] -= 0.05 * w;
    }
    pose.spine[0] += 0.09 * this.lean - 0.04 * this.back;
    pose.chest[0] += 0.05 * this.lean;
    pose.hipsPos[2] += 0.02 * this.lean - 0.09 * this.back;
    pose.head[2] = this.tilt * this.back;
    return pose;
  }

  /** The brush arm by IK, blended from wherever the pose left the hand. */
  brushArm() {
    const p = this.person;
    const { bones } = p;
    bones.handR.getWorldPosition(this.restHand);
    bones.upperArmR.getWorldPosition(this.shoulder);
    _v.subVectors(this.tip, this.shoulder).normalize();
    // Wrist target: back from the bristles by the brush and the fist
    _v2.copy(this.tip).addScaledVector(_v, -(BRUSH_OUT + FIST));
    _v2.lerpVectors(this.restHand, _v2, this.ikW);
    // Elbow out to the side, down and back, like anyone holding a brush
    this.pole.set(-0.7, -0.8, -0.35).multiplyScalar(p.scale);
    bones.chest.localToWorld(this.pole);
    p.ikArm('R', _v2, this.pole);
    bones.handR.rotation.set(-0.15 * this.ikW, 0, 0.12 * this.ikW);
  }

  /** The brush: aimed from the fist at what it paints, or resting out past the thumb. */
  updateBrush() {
    const p = this.person;
    p.sockets.gripR.getWorldPosition(this.grip);
    p.bones.handR.getWorldQuaternion(_q);
    const rest = _v.set(0, -0.55, 0.85).applyQuaternion(_q).normalize();
    if (this.salute > 0.3) rest.set(0, 1, 0);
    const aim = _v2.subVectors(this.tip, this.grip).normalize();
    this.brushDir.copy(rest).lerp(aim, this.ikW).normalize();
    aimMatrix(this.grip, this.brushDir, this.brushMatrix);
  }

  /** The palette sits in the off hand, level with the body, tilted a touch. */
  updatePalette() {
    const p = this.person;
    p.sockets.gripL.getWorldPosition(this.palettePos);
    _e.set(0.15, this.face - 0.35, 0.05, 'YXZ');
    _q.setFromEuler(_e);
    this.paletteMatrix.compose(this.palettePos, _q, _s);
    this.paletteTop.set(0.14, 0.01, 0.02).applyMatrix4(this.paletteMatrix);
  }
}

/* ---------------------------------------------------------------- judge */

/**
 * Mikael Hägglund. Modes: 'home' (idle by the trestle, looking round the
 * field), 'walk' (to a spot, then `then`), 'view' (studying another
 * painter's canvas on a stroll), 'inspect' (your canvas: pen to the chin,
 * then a line in the notebook) and 'verdict' (turned to you, talking).
 */
class Judge {
  constructor(opts) {
    // His own head (appearanceFor), in the black polo neck he judged in
    this.person = createPerson(appearanceFor('Mikael Hägglund', { outfit: JUDGE_OUTFIT }));
    this.home = opts.home;
    this.spot = opts.spot;
    this.canvasC = opts.canvasC;
    this.reduced = opts.reduced;
    const { root } = this.person;
    root.position.set(this.home.x, 0, this.home.z);
    this.ry = this.home.ry;
    root.rotation.y = this.ry;
    this.mode = 'home';
    this.then = 'home';
    this.t = 0;
    this.walk = null;
    this.walkW = 0;
    this.walkPhase = 0;
    this.grade = 5;
    this.stroll = false;
    this.strollSpots = [];
    /** What he looks at from home: only things his head can turn to. */
    this.sights = [];
    this.strollNext = 6;
    this.viewing = null;
    this.glance = 0;
    this.glanceT = 0;
    this.writeW = 0;
    this.chinW = 0;
    this.pose = POSES.stand();
    this.poseB = POSES.stand();
    this.poseC = POSES.stand();
    this.lookPt = new THREE.Vector3();
    this.lookGoal = new THREE.Vector3();
    this.penTip = new THREE.Vector3();
    this.grip = new THREE.Vector3();
    this.handRest = new THREE.Vector3();
    this.handGoal = new THREE.Vector3();
    this.pole = new THREE.Vector3();
    this.bookPos = new THREE.Vector3();
    this.bookMatrix = new THREE.Matrix4();
    this.penMatrix = new THREE.Matrix4();
    this.explainW = 0;
  }

  get walking() {
    return this.mode === 'walk';
  }

  walkTo(x, z, then, speed = 1.3) {
    const p = this.person.root.position;
    const dist = Math.hypot(x - p.x, z - p.z);
    if (dist < 0.03) {
      this.arrive(then);
      return;
    }
    const ramp = Math.min(0.45, dist / speed / 2);
    this.walk = { fx: p.x, fz: p.z, tx: x, tz: z, dist, ramp, dur: dist / speed + ramp, s: 0 };
    this.mode = 'walk';
    this.then = then;
    this.t = 0;
    this.person.setExpression(null);
    this.person.talk(0);
  }

  arrive(then) {
    this.mode = then;
    this.t = 0;
    this.walk = null;
    if (then === 'inspect') this.person.setExpression('focus', 0.7);
    if (then === 'verdict') this.startVerdict();
    if (then === 'view') this.person.setExpression('focus', 0.45);
    if (then === 'home') this.person.setExpression(null);
  }

  goHome() {
    const p = this.person.root.position;
    if (Math.hypot(p.x - this.home.x, p.z - this.home.z) > 0.05) this.walkTo(this.home.x, this.home.z, 'home');
    else if (this.mode !== 'home') this.arrive('home');
  }

  /** Your time is up: over to the easel. */
  inspect(grade) {
    this.grade = grade;
    this.walkTo(this.spot.x, this.spot.z, 'inspect', 1.45);
  }

  /** The card is up: deliver it (after arriving, if still on the way). */
  verdict() {
    if (this.mode === 'walk') this.then = 'verdict';
    else this.arrive('verdict');
  }

  startVerdict() {
    const g = this.grade;
    const p = this.person;
    // He has made his mind up before he opens his mouth, and it shows
    if (g >= 9) p.setExpression({ grin: 0.85, surprised: 0.15 });
    else if (g >= 7.5) p.setExpression('smile', 0.85);
    else if (g >= 6) p.setExpression({ smile: 0.4, focus: 0.2 });
    else if (g >= 4.5) p.setExpression({ focus: 0.5, frown: 0.25 });
    else if (g >= 3) p.setExpression('frown', 0.7);
    else p.setExpression({ surprised: 0.6, frown: 0.4 });
    p.talk(1);
  }

  update(dt, t, ctx) {
    this.t += dt;
    const P = this.person;
    const { root } = P;
    const w = this.behave(dt, t, ctx);
    this.ry += angleTo(this.ry, w.face) * (1 - Math.exp(-dt * (this.mode === 'walk' ? 7 : 4.5)));
    root.rotation.y = this.ry;
    this.walkW = ease(this.walkW, w.walk, 10, dt);
    this.writeW = ease(this.writeW, w.write, 5, dt);
    this.chinW = ease(this.chinW, w.chin, 4, dt);
    this.explainW = ease(this.explainW, w.explain, 5, dt);
    this.lookPt.lerp(this.lookGoal, 1 - Math.exp(-dt * 8));
    P.setPose(this.bodyPose(t), 1);
    // Nods and head shakes ride on top of the pose (update() keeps them)
    P.bones.head.rotation.x += w.nod;
    P.bones.head.rotation.y += w.shake;
    root.updateMatrixWorld(true);
    this.updateBook();
    this.penHand(t);
    P.lookAt(this.lookPt, 1);
    P.update(dt, t);
    root.updateMatrixWorld(true);
    this.updatePen();
  }

  /** What he is doing this frame: facing, and the weights of each gesture. */
  behave(dt, t, ctx) {
    const { root } = this.person;
    const w = { face: this.ry, walk: 0, write: 0, chin: 0, explain: 0, nod: 0, shake: 0 };
    const towards = (v) => Math.atan2(v.x - root.position.x, v.z - root.position.z);
    if (this.mode === 'walk') {
      // Heading first: stepWalk() may arrive, and arriving ends the walk
      w.face = Math.atan2(this.walk.tx - this.walk.fx, this.walk.tz - this.walk.fz);
      w.walk = this.stepWalk(dt);
    } else if (this.mode === 'inspect') {
      w.face = towards(this.canvasC);
      // His eyes go over the whole canvas, not one spot on it
      this.lookGoal.copy(this.canvasC).add(_v.set(Math.sin(t * 0.9) * 0.38, Math.sin(t * 1.37 + 1) * 0.36, 0));
      const cyc = this.t % 4.4;
      w.chin = cyc < 2.4 ? 1 : 0;
      w.write = cyc >= 2.6 ? 1 : 0;
    } else if (this.mode === 'verdict') {
      this.deliver(dt, ctx, w, towards);
    } else if (this.mode === 'view') {
      const v = this.viewing;
      w.face = towards(v.canvasC);
      this.lookGoal.copy(v.canvasC).add(_v.set(Math.sin(t * 0.8) * 0.2, Math.sin(t * 1.1) * 0.15, 0));
      w.write = this.t % 5 > 3 ? 1 : 0;
      if (this.t > 5.5) this.walkTo(this.home.x, this.home.z, 'home');
    } else {
      // Home: looking round the field, now and then a note
      w.face = this.home.ry;
      this.glanceT -= dt;
      if (this.glanceT <= 0 && this.sights.length) {
        this.glanceT = 2.2 + Math.random() * 2.8;
        this.glance = (this.glance + 1 + Math.floor(Math.random() * (this.sights.length - 1))) % this.sights.length;
      }
      if (this.sights.length) this.lookGoal.copy(this.sights[this.glance]);
      w.write = this.t % 9 > 6.5 ? 1 : 0;
      if (this.stroll && this.strollSpots.length && this.t > this.strollNext) {
        this.strollNext = 7 + Math.random() * 5;
        this.viewing = this.strollSpots[Math.floor(Math.random() * this.strollSpots.length)];
        this.walkTo(this.viewing.x, this.viewing.z, 'view', 1.1);
      }
    }
    return w;
  }

  /** One frame of walking: trapezoid speed, legs driven by distance. Returns the walk weight. */
  stepWalk(dt) {
    const P = this.person;
    const w = this.walk;
    const T = this.t;
    const { dur, ramp, dist } = w;
    const v = dist / (dur - ramp);
    let s;
    if (T < ramp) s = (v * T * T) / (2 * ramp);
    else if (T < dur - ramp) s = v * (T - ramp / 2);
    else s = dist - (v * Math.max(0, dur - T) ** 2) / (2 * ramp);
    s = Math.min(dist, s);
    const ds = s - w.s;
    w.s = s;
    const k = s / dist;
    P.root.position.x = w.fx + (w.tx - w.fx) * k;
    P.root.position.z = w.fz + (w.tz - w.fz) * k;
    // The feet keep pace with the ground: one stride cycle per WALK_STRIDE
    this.walkPhase += (ds / (WALK_STRIDE * P.scale)) * TAU;
    // Where he is going, at eye height
    this.lookGoal.set(w.tx, 1.55, w.tz).addScaledVector(_v.set(w.tx - w.fx, 0, w.tz - w.fz).normalize(), 2);
    if (T >= dur) this.arrive(this.then);
    return Math.min(1, ds / Math.max(dt, 1e-4) / 0.9);
  }

  /** The verdict: turned mostly to you, talking, nodding or shaking his head. */
  deliver(dt, ctx, w, towards) {
    const cam = ctx.camera.position;
    w.face = towards(cam) * 0.7 + towards(this.canvasC) * 0.3;
    const talkFor = 2.8;
    if (this.t > talkFor && this.t - dt <= talkFor) this.person.talk(0);
    const fade = Math.sin(Math.min(1, this.t / 2.6) * Math.PI);
    if (!this.reduced && this.grade >= 7.5) w.nod = Math.sin(this.t * 7) * 0.13 * fade;
    else if (!this.reduced && this.grade < 4.5) w.shake = Math.sin(this.t * 8) * 0.3 * fade;
    w.explain = this.t < talkFor + 0.4 ? 1 : 0;
    // Eye contact while he speaks; then now and again a look back at the canvas
    if (this.t < talkFor + 0.6 || this.t % 5 < 3) this.lookGoal.copy(cam);
    else this.lookGoal.copy(this.canvasC);
  }

  /** Notebook in the left hand whatever else he is doing; gestures and walking on top. */
  bodyPose(t) {
    const stand = POSES.holdNotebook(t, this.pose);
    // The book up at the chest, where he can read it
    stand.upperArmL[0] = -0.32;
    stand.upperArmL[1] = -0.62;
    stand.upperArmL[2] = 0.24;
    stand.forearmL[0] = -1.72;
    const idle = POSES.idle(t * 0.7, this.poseB);
    for (const n of ['hips', 'spine', 'thighL', 'thighR', 'footL', 'footR']) {
      stand[n][0] = idle[n][0];
      stand[n][1] = idle[n][1];
      stand[n][2] = idle[n][2];
    }
    stand.hipsPos[0] = idle.hipsPos[0];
    stand.head[0] = 0.02;
    takeArm(stand, idle, 'R');
    stand.gripR = 0.85;
    if (this.explainW > 0.001) {
      const ex = POSES.explain(t, this.poseC);
      const k = this.explainW;
      for (const n of ['upperArmR', 'forearmR', 'handR', 'chest']) {
        for (let i = 0; i < 3; i++) stand[n][i] += (ex[n][i] - stand[n][i]) * k;
      }
      stand.gripR += (ex.gripR - stand.gripR) * k;
    }
    if (this.walkW <= 0.001) return stand;
    const wk = POSES.walk(this.walkPhase, this.poseC);
    takeArm(wk, stand, 'L');
    return mixPoses(stand, wk, this.walkW, this.poseB);
  }

  /** The pen hand by IK: knuckles under the chin, or writing in the book. */
  penHand(t) {
    const reach = Math.max(this.writeW, this.chinW);
    if (reach <= 0.005) return;
    const P = this.person;
    const { bones } = P;
    bones.handR.getWorldPosition(this.handRest);
    const goal = this.handGoal;
    if (this.chinW >= this.writeW) {
      P.sockets.face.getWorldPosition(goal);
      goal.y -= 0.13 * P.scale;
      goal.x += Math.sin(this.ry) * 0.03;
      goal.z += Math.cos(this.ry) * 0.03;
    } else {
      // A line of handwriting across the right-hand page
      const a = t * 5.5;
      this.penTip.set(0.03 + ((a * 0.012) % 0.05), 0.012, -0.05 + Math.sin(a * 3) * 0.006).applyMatrix4(this.bookMatrix);
      bones.upperArmR.getWorldPosition(goal);
      _v.subVectors(this.penTip, goal).normalize();
      goal.copy(this.penTip).addScaledVector(_v, -0.12);
    }
    this.handRest.lerp(goal, reach);
    this.pole.set(-0.6, -0.9, 0.2).multiplyScalar(P.scale);
    bones.chest.localToWorld(this.pole);
    P.ikArm('R', this.handRest, this.pole);
    bones.handR.rotation.set(-0.3 * reach, 0, 0);
  }

  /** Pen: aimed at the page while writing, otherwise out of the fist. */
  updatePen() {
    const P = this.person;
    P.sockets.gripR.getWorldPosition(this.grip);
    P.bones.handR.getWorldQuaternion(_q);
    const dir = _v.set(0, -0.4, 0.9).applyQuaternion(_q).normalize();
    if (this.writeW > 0.01) dir.lerp(_v2.subVectors(this.penTip, this.grip).normalize(), this.writeW).normalize();
    aimMatrix(this.grip, dir, this.penMatrix);
  }

  /** The notebook lies open in the left hand, tipped up toward his eyes. */
  updateBook() {
    const P = this.person;
    P.sockets.gripL.getWorldPosition(this.bookPos);
    _e.set(-0.8, this.ry + 0.25, 0, 'YXZ');
    _q.setFromEuler(_e);
    this.bookPos.addScaledVector(_v.set(0.06, 0.01, 0.02).applyQuaternion(_q), 1);
    this.bookMatrix.compose(this.bookPos, _q, _s);
  }
}

/* ----------------------------------------------------------------- cast */

/**
 * Build everyone. `lowTier` (phones) draws the painters at low detail;
 * the judge, who gets close-ups, is always high detail.
 */
export function buildCast({ lowTier = false, safe = false, reduced = false, home, spot, canvasC, seed = 2021 }) {
  const group = new THREE.Group();
  group.name = 'cast';
  const rand = mulberry(seed);

  const judge = new Judge({ home, spot, canvasC, reduced });
  group.add(judge.person.root);

  const painters = PAINTERS.map((def) => {
    const detail = lowTier || safe ? 'low' : def.detail;
    const p = new Painter(def, detail, rand);
    group.add(p.person.root);
    return p;
  });

  /* The back row: standing at their easels, one instanced draw */
  const seats = BACK_ROW.at.map(([x, z], i) => {
    const face = Math.atan2(AUDIENCE.x - x, AUDIENCE.y - z) + (i % 2 ? 1.6 : -0.9);
    return { position: new THREE.Vector3(x, 0, z), rotationY: face, pose: 'stand' };
  });
  const crowd = createCrowd({ seats, names: BACK_ROW.names, seed, castShadow: true, hats: 0 });
  group.add(crowd.root);
  const backEasels = seats.map((s, i) => {
    const f = s.rotationY;
    const ex = s.position.x + Math.sin(f) * 0.66 - Math.cos(f) * 0.24;
    const ez = s.position.z + Math.cos(f) * 0.66 + Math.sin(f) * 0.24;
    return { x: ex, z: ez, ry: Math.atan2(s.position.x - ex, s.position.z - ez), art: workInProgress(ARTWORKS[i % ARTWORKS.length], seed + 31 * i) };
  });
  const easels = buildFieldEasels([
    ...painters.map((p, i) => ({ ...p.easel, art: workInProgress(ARTWORKS.find((w) => w.id === PAINTERS[i].work) || ARTWORKS[0], seed + i) })),
    ...backEasels
  ]);
  group.add(easels);

  // From home he watches what is in front of him: your easel, the hat, and
  // the painters within a natural turn of the head
  const sights = [canvasC.clone(), new THREE.Vector3(-2.7, 0.95, -3.5), ...painters.map((p) => p.canvasC)];
  judge.sights = sights.filter((v) => Math.abs(angleTo(home.ry, Math.atan2(v.x - home.x, v.z - home.z))) < 1.1);

  // Stroll spots: beside a painter, over the shoulder that has no easel
  judge.strollSpots = painters.slice(0, 2).map((p) => {
    const left = new THREE.Vector3(Math.cos(p.face), 0, -Math.sin(p.face));
    const at = p.person.root.position.clone().addScaledVector(left, 0.8).addScaledVector(p.fwd, -0.15);
    return { x: at.x, z: at.z, canvasC: p.canvasC };
  });

  /* Props: every brush one draw, every palette another */
  const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const brushes = new THREE.InstancedMesh(brushGeometry(), propMat, painters.length);
  const palettes = new THREE.InstancedMesh(paletteGeometry(), propMat, painters.length);
  for (const m of [brushes, palettes]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Instances move every frame: bounds from build time would cull wrongly
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = true;
    group.add(m);
  }
  palettes.castShadow = true;
  const book = new THREE.Mesh(notebookGeometry(), propMat);
  const pen = new THREE.Mesh(penGeometry(), propMat);
  for (const m of [book, pen]) {
    m.matrixAutoUpdate = false;
    m.frustumCulled = false;
    m.castShadow = m === book;
    group.add(m);
  }

  const focus = new THREE.Vector3().copy(canvasC);
  const judgeHead = new THREE.Vector3();
  const ctx = { camera: null, focus, painters, judgeWalking: false, judgeHead };
  let crowdLook = 0;

  return {
    group,
    judge,
    painters,
    crowd,
    /** The field reacts to a verdict on your canvas: brushes up, applause at the back. */
    hail(great) {
      painters.forEach((p, i) => {
        if (great || i % 2 === 0) p.hail(0.15 + rand() * 0.5);
      });
      crowd.lookAt(canvasC);
      crowdLook = 4;
      crowd.react(great ? 'cheer' : 'clap', great ? 2.6 : 2.2);
    },
    update(dt, t, camera) {
      ctx.camera = camera;
      ctx.judgeWalking = judge.walking;
      judge.person.bones.head.getWorldPosition(judgeHead);
      judge.update(dt, t, ctx);
      book.matrix.copy(judge.bookMatrix);
      pen.matrix.copy(judge.penMatrix);
      painters.forEach((p, i) => {
        p.update(dt, t, ctx);
        brushes.setMatrixAt(i, p.brushMatrix);
        palettes.setMatrixAt(i, p.paletteMatrix);
      });
      brushes.instanceMatrix.needsUpdate = true;
      palettes.instanceMatrix.needsUpdate = true;
      // A verdict draws the back row's eyes for a moment, then they go back to glancing round
      if (crowdLook > 0) {
        crowdLook -= dt;
        if (crowdLook <= 0) crowd.lookAt(null);
      }
      crowd.update(dt, t);
    },
    /** People, draw calls and triangles, for the test hook. */
    stats() {
      return {
        people: 1 + painters.length + crowd.members.length,
        high: [judge, ...painters].filter((x) => x.person.detail === 'high').length,
        triangles: [judge, ...painters].reduce((a, x) => a + x.person.triangles, 0)
      };
    },
    /** Everything the precompile pass must see once (crowd variants start hidden). */
    hidden() {
      return crowd.meshes.map((e) => e.mesh).filter((m) => !m.visible);
    },
    dispose() {
      judge.person.dispose();
      painters.forEach((p) => p.person.dispose());
      crowd.dispose();
      [brushes, palettes, book, pen].forEach((m) => {
        m.geometry.dispose();
        if (m.dispose && m.isInstancedMesh) m.dispose();
      });
      propMat.dispose();
      easels.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      if (group.parent) group.parent.remove(group);
    }
  };
}
