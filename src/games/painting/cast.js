/**
 * Pekkas Måleri — the people in the garden.
 *
 * Everyone here is a real participant from 7 August 2021, built with the
 * shared character system (../shared/people.js) so they look the same as
 * in every other year's game — faces, hair and beards come from
 * appearanceFor(); only the costumes are the garden's own:
 *
 *  - Mikael Hägglund, the invited culture profile, in a black polo neck. He
 *    strolls between the easels with his notebook, walks over when your
 *    time is up, studies the canvas with the pen at his chin, writes, and
 *    turns to deliver the verdict — talking, and with a face that tells you
 *    the grade before the card does.
 *  - The rest of the field at their easels: Per Olsson as the ceramicist
 *    Hans Hedberg in a red beret (the dress code was "high-culture
 *    profile"), Olov Melander, Per Vikman and Henrik Lundqvist (who
 *    arranged it) and Viktor Jones paint for real, and their canvases fill
 *    in stroke by stroke where the brush goes. Further off, Tobias
 *    Lundqvist, Ludvig Ulenius, Erik Vallgren, Rickard Nilsson and Niklas
 *    Norberg stand at theirs as an instanced crowd.
 *
 * Props are HELD, not positioned: every brush sits in a pinch between thumb
 * and fingers, every palette rides the off forearm with the thumb through
 * its hole, Hägglund's notebook lies open on his palm and his pen is
 * pinched like a pen. They are attached to the hand bones, so wherever a
 * hand goes the prop goes with it, and the arms are solved the other way
 * round: the IK is given the HAND's orientation as well as its position,
 * chosen so that the bristles land on the canvas or the nib on the page.
 *
 * Legs are not animated at all: the feet are planted in the world and step
 * when the body leaves them behind (gait.js), so nobody slides — not
 * Hägglund on his walk, nor a painter stepping back to look at the canvas.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPerson, appearanceFor, POSES, createCrowd } from '../shared/people.js';
import { buildFieldEasels, mulberry, FIELD_W, FIELD_H, FIELD_SCALE } from './garden.js';
import { ARTWORKS } from './artworks.js';
import { renderPainting } from './canvasart.js';
import { Feet } from './gait.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** A field canvas (garden.js buildEasel at FIELD_SCALE): centre height, picture plane, half size. */
const FIELD_CANVAS = {
  y: (0.98 + FIELD_H / 2) * FIELD_SCALE, z: 0.072 * FIELD_SCALE,
  hw: (FIELD_W / 2) * FIELD_SCALE, hh: (FIELD_H / 2) * FIELD_SCALE
};

/*
 * The field. `at` is where the painter stands, `face` how far they turn
 * from looking straight at the wide shot's camera (radians), `detail`
 * 'high' for the two the camera sees closest. The easel goes in front and
 * a little to the brush hand's side, canvas toward the painter. A painter
 * turned to the camera shows a face and the back of a canvas; turned away
 * (|face| ≈ 2.3) they show their back and the picture coming along beside
 * them. The field mixes the two, so the wide shot reads both as people and
 * as paintings in progress — Olov's Skriet among them.
 */
const PAINTERS = [
  {
    name: 'Per Olsson', work: 'stjarnenatten', at: [-1.0, -4.75], face: -0.8, detail: 'high', handle: 0x7a2a22,
    // Per came as Hans Hedberg: the red beret, and a ceramicist's apron over
    // a linen shirt. Face, hair and beard stay his own (appearanceFor).
    look: { headwear: { style: 'beret', color: 0xa8202c }, outfit: { top: 'apron', topColor: 0xe4dac6, accent: 0x6b4a2e, bottom: 'trousers', bottomColor: 0x4a4038, shoes: 'leather' } }
  },
  {
    // Olov drew Skriet out of the hat — and won with it
    name: 'Olov Melander', work: 'skriet', at: [0.55, -5.9], face: 2.25, detail: 'high', handle: 0x1d1d22,
    look: { outfit: { top: 'shirt', topColor: 0x2f4f6e, bottom: 'trousers', bottomColor: 0x3a3f4a, shoes: 'leather' } }
  },
  {
    name: 'Per Vikman', work: 'monalisa', at: [-3.6, -7.0], face: -2.3, detail: 'low', handle: 0xc9a05a,
    look: { outfit: { top: 'shirt', topColor: 0x7a2e2a, bottom: 'trousers', bottomColor: 0x5a5348, shoes: 'leather' } }
  },
  {
    name: 'Henrik Lundqvist', work: 'nattvarden', at: [1.9, -8.1], face: 2.35, detail: 'low', handle: 0x7a2a22,
    look: { outfit: { top: 'sweater', topColor: 0x3f6a4a, bottom: 'trousers', bottomColor: 0x4a5a72 } }
  },
  {
    name: 'Viktor Jones', work: 'parlorhange', at: [-1.3, -8.4], face: -0.75, detail: 'low', handle: 0xc9a05a,
    look: { outfit: { top: 'shirt', topColor: 0xe8e0cf, bottom: 'trousers', bottomColor: 0x2a2e38, shoes: 'leather' } }
  }
];

/** Further back: the rest of the 2021 field, as one instanced crowd. */
const BACK_ROW = {
  names: ['Tobias Lundqvist', 'Ludvig Ulenius', 'Erik Vallgren', 'Rickard Nilsson', 'Niklas Norberg'],
  at: [[-6.2, -7.8], [0.3, -8.8], [3.4, -7.4], [-5.6, -5.4], [4.4, -4.6]]
};

/** Hägglund's costume: the culture profile's black polo neck. */
const JUDGE_OUTFIT = { top: 'poloNeck', topColor: 0x1f2026, bottomColor: 0x8f8268, shoes: 'leather' };

/** Where the wide shot's camera stands on average (index.js): the field faces it. */
const AUDIENCE = new THREE.Vector2(3.0, 2.7);

/* ------------------------------------------------------------------ grips */

/*
 * How each prop sits in a hand. The shared character system's hold()
 * closes the fingers round an object from its grip library — 'pinch' (a
 * brush or pen held like a pencil, +Y toward the tip, the origin where the
 * fingers pinch), 'palette' (the thumb up through the hole, fingers under
 * the board, +Y the paint side, the board along +X) and 'flat' (a notebook
 * by its bottom edge: thumb on top, +Y the pages, the book along +Z). Each
 * prop below is modelled to those conventions.
 *
 * GRIP_FALLBACK is the same frames in the left hand's space (the right
 * mirrors X), used only if hold() is not there: the props still sit in the
 * hands, the fingers just keep the pose's curl.
 */
const GRIP_FALLBACK = {
  pinch: { at: [-0.034, -0.128, 0.032], y: [-0.55, -0.72, -0.42], z: [0.6, 0, -0.8], curl: 0.62, point: 0.42 },
  palette: { at: [-0.04, -0.09, 0.054], y: [-1, 0.05, 0.12], z: [0, 0.7, 0.7], curl: 0.15, point: 0 },
  flat: { at: [-0.034, -0.118, 0.038], y: [-0.95, 0, -0.3], z: [0.1, -1, 0.15], curl: 0.3, point: 0 }
};
/** How far past the pinch the bristles and the nib reach. */
const BRUSH_REACH = 0.062;
const PEN_REACH = 0.034;

const _ma = new THREE.Matrix4();
const _mb = new THREE.Matrix4();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
function basis(dir, ref, out) {
  _bx.copy(dir).normalize();
  _by.copy(ref).addScaledVector(_bx, -ref.dot(_bx));
  if (_by.lengthSq() < 1e-8) _by.set(_bx.y, -_bx.x, 0.3).addScaledVector(_bx, -_bx.dot(_by));
  _by.normalize();
  _bz.crossVectors(_bx, _by);
  return out.makeBasis(_bx, _by, _bz);
}
/** The rotation taking `aDir` to `bDir`, with `aRef` turned as near `bRef` as it will go. */
function alignQuat(aDir, aRef, bDir, bRef, out) {
  basis(aDir, aRef, _ma);
  basis(bDir, bRef, _mb);
  return out.setFromRotationMatrix(_mb.multiply(_ma.transpose()));
}
const NEG_X = new THREE.Vector3(-1, 0, 0);
const POS_X = new THREE.Vector3(1, 0, 0);
const NEG_Y = new THREE.Vector3(0, -1, 0);

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
    return g.index ? g.toNonIndexed() : g;
  });
  const out = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return out;
}

const M4 = (pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) => new THREE.Matrix4().compose(
  new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scl)
);

/** A brush along +Y, the pinch at the origin: a lacquered handle, a ferrule, a loaded flat. */
function brushGeometry(handle, paint) {
  const tip = new THREE.Color(paint);
  const dark = tip.clone().multiplyScalar(0.55);
  return coloured([
    { geo: new THREE.CylinderGeometry(0.0062, 0.0042, 0.235, 7), color: handle, m: M4([0, -0.1175, 0]) },
    { geo: new THREE.SphereGeometry(0.0043, 6, 4), color: handle, m: M4([0, -0.235, 0]) },
    { geo: new THREE.CylinderGeometry(0.0058, 0.0064, 0.032, 7), color: 0xb9b4aa, m: M4([0, 0.016, 0]) },
    { geo: new THREE.CylinderGeometry(0.0062, 0.0058, 0.018, 7), color: 0x3a2c22, m: M4([0, 0.041, 0], [0, 0, 0], [1, 1, 0.62]) },
    { geo: new THREE.ConeGeometry(0.0062, 0.016, 7), color: dark, m: M4([0, 0.054, 0], [0, 0, 0], [1, 1, 0.62]) },
    { geo: new THREE.ConeGeometry(0.0044, 0.009, 7), color: tip, m: M4([0, 0.0585, 0], [0, 0, 0], [1, 1, 0.62]) }
  ]);
}

/**
 * A palette in the XZ plane, top face up, the thumb hole at the origin and
 * the board reaching out along +X: the five pigments round the far rim,
 * and two or three mixes of the painter's motif in the middle.
 */
function paletteGeometry(mixes, seed) {
  const shape = new THREE.Shape();
  // A kidney: an ellipse with a bite out of the near edge beside the hole
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    // The thumb-side notch, just round the rim from the hole
    const d = Math.atan2(Math.sin(a - Math.PI - 0.8), Math.cos(a - Math.PI - 0.8));
    const r = 1 - 0.3 * Math.exp(-d * d * 7);
    const x = 0.135 + Math.cos(a) * 0.175 * r;
    const y = 0.012 + Math.sin(a) * 0.128 * r;
    if (i) shape.lineTo(x, y);
    else shape.moveTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.019, 0, TAU, true);
  shape.holes.push(hole);
  const board = new THREE.ExtrudeGeometry(shape, { depth: 0.007, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0022, bevelSegments: 1, curveSegments: 10 });
  board.rotateX(-Math.PI / 2);
  // Origin at mid-thickness, as the palette grip expects
  board.translate(0, -0.0035, 0);
  const r = mulberry(seed);
  const parts = [{ geo: board, color: 0xb58a55 }];
  // Pigments round the rim, away from the thumb
  [0xc0242c, 0xe8b419, 0x22459b, 0xf4f2ea, 0x24201c].forEach((col, i) => {
    const a = -1.25 + i * 0.6;
    const s = 0.016 + r() * 0.005;
    parts.push({
      geo: new THREE.SphereGeometry(1, 7, 4), color: col,
      m: M4([0.15 + Math.cos(a) * 0.125, 0.005, 0.012 - Math.sin(a) * 0.095], [0, r() * 3, 0], [s * 1.25, s * 0.42, s])
    });
  });
  mixes.forEach((col, i) => {
    const s = 0.024 + r() * 0.012;
    parts.push({
      geo: new THREE.SphereGeometry(1, 8, 4), color: col,
      m: M4([0.11 + i * 0.045 + r() * 0.02, 0.004, 0.035 - i * 0.03], [0, r() * 3, 0], [s * 1.5, s * 0.16, s])
    });
  });
  return coloured(parts);
}

/**
 * An open notebook, pages up (+Y), the spine along +Z from the bottom edge
 * at the origin — where the 'flat' grip holds it — to the top.
 */
function notebookGeometry() {
  const g = coloured([
    { geo: new THREE.BoxGeometry(0.1, 0.004, 0.17), color: 0x5b2a22, m: M4([-0.05, 0, 0], [0, 0, 0.08]) },
    { geo: new THREE.BoxGeometry(0.1, 0.004, 0.17), color: 0x5b2a22, m: M4([0.05, 0, 0], [0, 0, -0.08]) },
    { geo: new THREE.BoxGeometry(0.094, 0.007, 0.162), color: 0xf3eedf, m: M4([-0.047, 0.0055, 0], [0, 0, 0.08]) },
    { geo: new THREE.BoxGeometry(0.094, 0.007, 0.162), color: 0xf3eedf, m: M4([0.047, 0.0055, 0], [0, 0, -0.08]) },
    // An elastic band, and a few lines of his handwriting on the right page
    { geo: new THREE.BoxGeometry(0.004, 0.0105, 0.166), color: 0x1e1e22, m: M4([0.088, 0.003, 0], [0, 0, -0.08]) },
    ...[0, 1, 2, 3, 4].map((i) => ({ geo: new THREE.BoxGeometry(0.058 - (i % 2) * 0.016, 0.001, 0.0032), color: 0x34344a, m: M4([0.046, 0.0096, -0.055 + i * 0.022], [0, 0, -0.08]) }))
  ]);
  g.translate(0, -0.003, 0.085);
  return g;
}

/** The judge's pen along +Y, the pinch at the origin, the nib at +PEN_REACH. */
function penGeometry() {
  return coloured([
    { geo: new THREE.CylinderGeometry(0.0046, 0.0046, 0.125, 7), color: 0x18181a, m: M4([0, -0.045, 0]) },
    { geo: new THREE.ConeGeometry(0.0046, 0.017, 7), color: 0xb8954a, m: M4([0, PEN_REACH - 0.0085, 0]) },
    { geo: new THREE.BoxGeometry(0.0016, 0.05, 0.004), color: 0xb8954a, m: M4([0.005, -0.08, 0]) }
  ]);
}

/**
 * A finished canvas of the motif, painted the way an amateur painter with a
 * beer or two inside them would get it: the master's colours, a little off.
 */
function amateurColours(work, r) {
  return work.regions.map((rg) => {
    const c = new THREE.Color(rg.color).offsetHSL((r() - 0.5) * 0.05, (r() - 0.5) * 0.14, (r() - 0.5) * 0.1);
    return [c.r, c.g, c.b].map((v) => Math.min(1, Math.max(0, v)));
  });
}

/**
 * A back-row canvas so far, as a grid of vertex colours: the motif's
 * regions filled flat, the last few still bare linen.
 */
function workInProgress(work, seed, cols = 14, rows = 16) {
  const cv = document.createElement('canvas');
  cv.width = cols * 4;
  cv.height = rows * 4;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const r = mulberry(seed);
  ctx.fillStyle = '#d8cfba';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const done = Math.ceil(work.regions.length * (0.6 + r() * 0.3));
  const cols3 = amateurColours(work, r);
  work.regions.forEach((rg, i) => {
    if (i >= done) return;
    const c = new THREE.Color().fromArray(cols3[i]);
    ctx.fillStyle = `#${c.getHexString()}`;
    ctx.beginPath();
    rg.path(ctx, cv.width, cv.height);
    ctx.fill();
  });
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

/* --------------------------------------------------------- live canvases */

/**
 * The five painters' canvases, live: one texture atlas, one mesh, one draw.
 * Each cell starts with part of the motif laid in, region by region; then
 * every stroke a painter makes on their easel paints the motif in along the
 * bristles' path (a pattern stroke of the finished picture), so from across
 * the garden the canvases visibly come along while you paint yours.
 */
class FieldCanvases {
  constructor(painters, seed, lowTier) {
    const CW = 160;
    const CH = Math.round((CW * FIELD_H) / FIELD_W);
    this.cw = CW;
    this.ch = CH;
    const COLS = 3;
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    this.cv = cv;
    const ctx = cv.getContext('2d');
    this.ctx = ctx;
    ctx.fillStyle = '#ddd4bf';
    ctx.fillRect(0, 0, 512, 512);
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.interval = lowTier ? 0.5 : 0.22;
    this.wait = 0;
    this.dirty = false;
    const r = mulberry(seed ^ 0x51ed);
    this.cells = painters.map((p, i) => {
      const work = ARTWORKS.find((w) => w.id === p.work) || ARTWORKS[0];
      const x0 = 6 + (i % COLS) * (CW + 8);
      const y0 = 6 + Math.floor(i / COLS) * (CH + 8);
      const full = renderPainting(work, amateurColours(work, r), CW, CH, { lit: true });
      // The finished picture is the pattern every stroke paints with
      const pattern = ctx.createPattern(full, 'no-repeat');
      if (pattern.setTransform) pattern.setTransform(new DOMMatrix().translateSelf(x0, y0));
      // Linen, then the regions laid in so far
      ctx.fillStyle = '#d9cfb8';
      ctx.fillRect(x0, y0, CW, CH);
      const done = Math.floor(work.regions.length * (0.3 + r() * 0.3));
      ctx.save();
      ctx.translate(x0, y0);
      work.regions.forEach((rg, k) => {
        if (k >= done) return;
        ctx.save();
        ctx.beginPath();
        rg.path(ctx, CW, CH);
        ctx.clip();
        ctx.drawImage(full, 0, 0);
        ctx.restore();
      });
      // A pencil sketch where nothing is painted yet: faint, but it is there
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#3a3026';
      ctx.lineWidth = 0.8;
      work.regions.forEach((rg, k) => {
        if (k < done) return;
        ctx.beginPath();
        rg.path(ctx, CW, CH);
        ctx.stroke();
      });
      ctx.restore();
      return { x0, y0, pattern, last: null };
    });
    this.tex.needsUpdate = true;
  }

  /** A stroke on painter i's canvas from where the bristles last were to (u, v) in −1..1. */
  stroke(i, u, v, contact) {
    const c = this.cells[i];
    if (!c) return;
    const x = c.x0 + (u * 0.5 + 0.5) * this.cw;
    const y = c.y0 + (0.5 - v * 0.5) * this.ch;
    if (contact && c.last) {
      const { ctx } = this;
      ctx.save();
      ctx.beginPath();
      ctx.rect(c.x0, c.y0, this.cw, this.ch);
      ctx.clip();
      ctx.strokeStyle = c.pattern;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(c.last[0], c.last[1]);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
      this.dirty = true;
    }
    c.last = contact ? [x, y] : null;
  }

  /** Upload at most a few times a second. */
  update(dt) {
    this.wait -= dt;
    if (this.dirty && this.wait <= 0) {
      this.tex.needsUpdate = true;
      this.dirty = false;
      this.wait = this.interval;
    }
  }

  /** UVs for a cell, as [u0, v0, u1, v1] in texture space (v up). */
  uv(i) {
    const c = this.cells[i];
    return [c.x0 / 512, 1 - (c.y0 + this.ch) / 512, (c.x0 + this.cw) / 512, 1 - c.y0 / 512];
  }
}

/* ------------------------------------------------------------- helpers */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

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

/**
 * Put a prop in a hand with the shared grip library (person.hold), or, if
 * that is not available, attach it on a frame of our own. Returns the grip
 * anchor: the prop's frame in the hand bone's space, which is what the arm
 * IK needs to put the hand where the prop has to be.
 */
function holdIn(person, prop, side, grip, opts = {}) {
  if (typeof person.hold === 'function') {
    person.hold(prop, side, grip, { blend: 0, ...opts });
    const a = person.sockets[`hold${side}`];
    if (a) return a;
  }
  const f = GRIP_FALLBACK[grip];
  const m = side === 'R' ? -1 : 1;
  const v = (a) => new THREE.Vector3(a[0] * m, a[1], a[2]);
  const anchor = new THREE.Object3D();
  person.attach(anchor, `hand${side}`, {
    position: v(f.at).multiplyScalar(person.scale),
    quaternion: alignQuat(Y_AXIS, Z_AXIS, v(f.y), v(f.z), new THREE.Quaternion())
  });
  anchor.add(prop);
  anchor.userData.fallback = f;
  return anchor;
}

/**
 * The hand pose that puts a held tool's tip on `tip`, pointing along `dir`,
 * with the palm turned toward `palmWorld`. Writes the wrist into `outPos`
 * and returns the hand's world rotation in `outQ`.
 */
function toolHand(anchor, side, tip, dir, palmWorld, reach, outPos, outQ) {
  const axis = _v3.set(0, 1, 0).applyQuaternion(anchor.quaternion);
  alignQuat(axis, side === 'R' ? POS_X : NEG_X, dir, palmWorld, outQ);
  axis.multiplyScalar(reach).add(anchor.position).applyQuaternion(outQ);
  return outPos.copy(tip).sub(axis);
}

/** The hand pose that puts a held object at `objPos` turned `objQ`. */
function objectHand(anchor, objPos, objQ, outPos, outQ) {
  outQ.copy(objQ).multiply(_q.copy(anchor.quaternion).invert());
  _v3.copy(anchor.position).applyQuaternion(outQ);
  return outPos.copy(objPos).sub(_v3);
}

/** Fingers from the pose, for when the grip library is not there. */
function fallbackFingers(pose, anchor, side) {
  const f = anchor.userData.fallback;
  if (!f) return;
  pose[`grip${side}`] = f.curl;
  pose[`point${side}`] = f.point;
}

/* ------------------------------------------------------------- painters */

/**
 * One painter at an easel. They paint in runs of strokes from the
 * shoulder — the body turning into each one, the brush pressing on and
 * flicking off — go back to the palette to load and mix, and every so often
 * step back from the easel to look, head on one side, sometimes holding the
 * brush up at arm's length to measure. A great verdict on your canvas gets
 * a brush raised to you.
 */
class Painter {
  constructor(def, detail, rand, index) {
    const person = createPerson({ ...appearanceFor(def.name, def.look), detail });
    this.person = person;
    this.index = index;
    this.name = def.name;
    const [x, z] = def.at;
    const face = Math.atan2(AUDIENCE.x - x, AUDIENCE.y - z) + def.face;
    this.face = face;
    this.home = new THREE.Vector3(x, 0, z);
    person.root.position.copy(this.home);
    person.root.rotation.y = face;
    const f = new THREE.Vector3(Math.sin(face), 0, Math.cos(face));
    const right = new THREE.Vector3(-Math.cos(face), 0, Math.sin(face));
    this.fwd = f;
    this.right = right;
    // The easel: in front and toward the brush hand, canvas turned to them
    const E = new THREE.Vector3(x, 0, z).addScaledVector(f, 0.62).addScaledVector(right, 0.2);
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
    this.measure = false;
    this.strokes = 0;
    this.stroke = { a: [0, 0], b: [0, 0], c: [0, 0], from: [0, 0], t: 1, dur: 0.4, gap: 0.25 };
    this.uv = [0, 0];
    this.contact = false;
    this.ikW = 1;
    this.lean = 0;
    this.backW = 0;
    this.salute = 0;
    this.load = 0;
    this.tilt = (rand() - 0.5) * 0.24;
    this.tip = new THREE.Vector3().copy(this.canvasC);
    this.tipGoal = new THREE.Vector3().copy(this.canvasC);
    this.look = new THREE.Vector3().copy(this.canvasC);
    this.lookGoal = new THREE.Vector3();
    this.pose = POSES.stand();
    this.shoulder = new THREE.Vector3();
    this.pole = new THREE.Vector3();
    this.wrist = new THREE.Vector3();
    this.handQ = new THREE.Quaternion();
    this.palQ = new THREE.Quaternion();
    this.palPos = new THREE.Vector3();
    this.paletteTop = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.palm = new THREE.Vector3(0, -1, 0);
    this.dirGoal = new THREE.Vector3(0, 0, -1);
    this.palmGoal = new THREE.Vector3(0, -1, 0);
    this.dt = 1 / 60;
    // The salute: the brush arm's cheer rotations, slerped over the IK
    const cheer = POSES.cheer(0);
    this.cheerQ = ['upperArmR', 'forearmR', 'handR'].map((n) => [n, new THREE.Quaternion().setFromEuler(new THREE.Euler(...cheer[n]))]);
    this.feet = new Feet(person, { width: 0.11, toeOut: 0.14, swing: 0.42, lift: 0.05 });
    this.def = def;
  }

  /** Give the painter their brush and palette (shared material, own colours). */
  equip(mat, work) {
    const p = this.person;
    const r = mulberry(this.index * 97 + 7);
    const cols = work.regions.map((rg) => rg.color);
    const pick = () => cols[Math.floor(r() * cols.length)];
    this.brush = new THREE.Mesh(brushGeometry(this.def.handle, pick()), mat);
    this.palette = new THREE.Mesh(paletteGeometry([pick(), pick(), pick()], this.index + 3), mat);
    this.brush.castShadow = false;
    this.palette.castShadow = true;
    this.palette.receiveShadow = true;
    this.brushGrip = holdIn(p, this.brush, 'R', 'pinch', { diameter: 0.012 });
    this.paletteGrip = holdIn(p, this.palette, 'L', 'palette', { thickness: 0.009 });
    // Where on the palette the mix is, in the palette's own frame
    this.mixLocal = new THREE.Vector3(0.12, 0.012, 0.02);
    return [this.brush, this.palette];
  }

  /** A point on their canvas, u and v in −1..1, `lift` metres off it. */
  canvasPoint(u, v, lift, out) {
    return out.copy(this.canvasC)
      .addScaledVector(this.canvasU, u * FIELD_CANVAS.hw)
      .addScaledVector(UP, v * FIELD_CANVAS.hh)
      .addScaledVector(this.canvasN, lift);
  }

  /** The next stroke: mostly near the last, slanting the way a right hand pulls. */
  nextStroke() {
    const r = this.rand;
    const s = this.stroke;
    const near = r() < 0.7;
    const u0 = near ? THREE.MathUtils.clamp(s.b[0] + (r() - 0.5) * 0.5, -0.82, 0.82) : (r() - 0.5) * 1.6;
    const v0 = near ? THREE.MathUtils.clamp(s.b[1] + (r() - 0.5) * 0.5, -0.8, 0.8) : (r() - 0.5) * 1.5;
    // Down-right diagonals and verticals, now and then a sweep across
    const a = r() < 0.25 ? (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.4 : -0.6 - r() * 1.2;
    const len = 0.2 + r() * 0.32;
    s.a = [u0, v0];
    s.b = [THREE.MathUtils.clamp(u0 + Math.cos(a) * len, -0.9, 0.9), THREE.MathUtils.clamp(v0 + Math.sin(a) * len, -0.88, 0.88)];
    // A belly to the stroke: the arm swings, it does not rule lines
    const bow = (r() - 0.5) * 0.2;
    s.c = [(s.a[0] + s.b[0]) / 2 - (s.b[1] - s.a[1]) * bow, (s.a[1] + s.b[1]) / 2 + (s.b[0] - s.a[0]) * bow];
    s.dur = 0.34 + r() * 0.3;
    s.gap = 0.18 + r() * 0.2;
    s.t = -s.gap / s.dur;
    s.from = [this.uv[0], this.uv[1]];
    this.strokes++;
  }

  setMode(mode) {
    const r = this.rand;
    this.mode = mode;
    this.modeT = 0;
    this.modeDur = mode === 'paint' ? 2.8 + r() * 4 : mode === 'load' ? 1.5 + r() * 1 : mode === 'salute' ? 2.6 : 3.2 + r() * 2.2;
    if (mode === 'paint') {
      this.strokes = 0;
      this.nextStroke();
    }
    if (mode === 'look') {
      this.tilt = (r() - 0.5) * 0.34;
      this.measure = r() < 0.45;
    }
    this.contact = false;
  }

  /** Somebody's canvas has just been praised: brush up for a moment. */
  hail(delay) {
    this.saluteDelay = delay;
  }

  update(dt, t, ctx) {
    this.advance(dt);
    const w = this.goals(dt, t, ctx);
    this.lean = ease(this.lean, w.lean, 4, dt);
    this.load = ease(this.load, w.load, 5, dt);
    this.salute = ease(this.salute, w.salute, 6, dt);
    // Step back from the easel and in again: the root moves, the feet follow
    this.backW = ease(this.backW, w.back, 2.6, dt);
    const p = this.person;
    const { root } = p;
    this.dt = dt;
    root.position.copy(this.home).addScaledVector(this.fwd, -0.42 * smooth01(this.backW * 1.1));
    const k = 1 - Math.exp(-dt * (this.contact ? 30 : 16));
    this.tip.lerp(this.tipGoal, k);
    this.look.lerp(this.lookGoal, 1 - Math.exp(-dt * 9));
    const g = this.feet.plan(dt);
    p.setPose(this.bodyPose(t, g), 1);
    root.updateMatrixWorld(true);
    this.feet.solve();
    this.arms();
    p.lookAt(this.look, 1);
    p.update(dt, t);
    // Breathing moved the shoulders a few millimetres: put the bristles back on the canvas
    this.arms(true);
  }

  /** Paint for a while, then load the brush or step back; a hail interrupts. */
  advance(dt) {
    this.modeT += dt;
    if (this.saluteDelay !== undefined) {
      this.saluteDelay -= dt;
      if (this.saluteDelay <= 0) {
        this.saluteDelay = undefined;
        this.setMode('salute');
      }
    }
    if (this.modeT > this.modeDur && !(this.mode === 'paint' && this.contact)) {
      if (this.mode === 'paint') this.setMode(this.rand() < 0.62 ? 'load' : 'look');
      else this.setMode('paint');
    }
  }

  /** Where the bristles and the eyes go this frame, and the body's weights. */
  goals(dt, t, ctx) {
    const w = { lean: 0, back: 0, salute: 0, load: 0 };
    this.contact = false;
    if (this.mode === 'paint') {
      const s = this.stroke;
      s.t += dt / s.dur;
      if (s.t >= 1 + 0.12) this.nextStroke();
      let u;
      let v;
      let lift;
      if (s.t < 0) {
        // Travelling to the stroke's start, off the canvas
        const k = smooth01(1 + s.t / (s.gap / s.dur));
        u = s.from[0] + (s.a[0] - s.from[0]) * k;
        v = s.from[1] + (s.a[1] - s.from[1]) * k;
        lift = 0.036 + (0.006 - 0.036) * k + 0.025 * Math.sin(k * Math.PI);
      } else {
        // On the canvas: ease in, pull through, flick off at the end
        const k = smooth01(Math.min(1, s.t));
        const ik = 1 - k;
        u = ik * ik * s.a[0] + 2 * ik * k * s.c[0] + k * k * s.b[0];
        v = ik * ik * s.a[1] + 2 * ik * k * s.c[1] + k * k * s.b[1];
        const press = Math.sin(Math.min(1, s.t) * Math.PI);
        lift = s.t > 1 ? (s.t - 1) * 0.3 : 0.004 - press * 0.006;
        this.contact = s.t > 0.04 && s.t < 0.97;
      }
      this.uv[0] = u;
      this.uv[1] = v;
      this.canvasPoint(u, v, lift, this.tipGoal);
      this.lookGoal.copy(this.canvasC).lerp(this.tipGoal, 0.7);
      w.lean = 1;
    } else if (this.mode === 'load') {
      // Down into a pigment, then round and round in the mix
      const k = this.modeT;
      _v.copy(this.mixLocal);
      if (k < 0.45) _v.set(0.2, 0.012, -0.05);
      else _v.add(_v2.set(Math.cos(k * 9 + this.phase) * 0.028, 0, Math.sin(k * 9 + this.phase) * 0.02));
      this.palette.updateWorldMatrix(true, false);
      this.paletteTop.copy(_v).applyMatrix4(this.palette.matrixWorld);
      this.tipGoal.copy(this.paletteTop);
      this.tipGoal.y += 0.004;
      this.lookGoal.copy(this.paletteTop);
      w.load = 1;
      w.lean = 0.3;
    } else if (this.mode === 'salute') {
      this.lookGoal.copy(ctx.focus);
      w.salute = Math.min(1, Math.sin(Math.min(1, this.modeT / this.modeDur) * Math.PI) * 1.6);
    } else {
      // Stepped back, head on one side, judging their own work
      this.lookGoal.copy(this.canvasC);
      w.back = this.modeT < this.modeDur - 0.9 ? 1 : 0;
      const { bones } = this.person;
      bones.upperArmR.getWorldPosition(this.shoulder);
      if (this.measure && this.backW > 0.35) {
        // At arm's length, brush upright, sighting along it at the canvas
        _v.subVectors(this.canvasC, this.shoulder).setY(0).normalize();
        this.tipGoal.copy(this.shoulder).addScaledVector(_v, 0.66).addScaledVector(UP, 0.03);
      } else {
        // Brush hand at rest in front of the chest, bristles up
        this.tipGoal.copy(this.shoulder).addScaledVector(this.fwd, 0.26).addScaledVector(this.right, -0.1).addScaledVector(UP, -0.26);
      }
    }
    // The judge walking past is more interesting than one's own canvas
    if (ctx.judgeWalking && this.mode !== 'salute') {
      const root = this.person.root.position;
      if (Math.hypot(ctx.judgeHead.x - root.x, ctx.judgeHead.z - root.z) < 2.6) this.lookGoal.copy(ctx.judgeHead);
    }
    if (ctx.canvases) ctx.canvases.stroke(this.index, this.uv[0], this.uv[1], this.contact);
    return w;
  }

  /** The body: standing at the easel, leaning into the work, turning into each stroke. */
  bodyPose(t, g) {
    const pose = POSES.stand(t, this.pose);
    const { root } = this.person;
    // Where the bristles are, in the painter's own frame
    _v.subVectors(this.tip, root.position);
    const lat = THREE.MathUtils.clamp(-_v.dot(this.right), -0.6, 0.6);
    const high = THREE.MathUtils.clamp(this.tip.y - 1.15, -0.4, 0.4);
    const l = this.lean;
    pose.spine[0] += 0.05 * l - 0.03 * this.backW;
    pose.chest[0] += 0.04 * l - 0.06 * high * l;
    // Strokes come from the shoulder and the trunk turns into them
    pose.chest[1] += lat * 0.32 * l - 0.12 * this.load;
    pose.spine[1] += lat * 0.12 * l;
    pose.shoulderR[2] -= Math.max(0, high) * 0.35 * l;
    pose.shoulderR[1] -= 0.08 * l;
    pose.hipsPos[2] += 0.025 * l;
    // Gait: hips down to reach, rolled over the standing leg
    pose.hipsPos[1] -= g.drop / this.person.scale;
    pose.hipsPos[0] += g.sway * 0.018;
    pose.hips[2] += g.sway * 0.03;
    pose.head[2] = this.tilt * this.backW;
    pose.head[0] = 0.04;
    fallbackFingers(pose, this.brushGrip, 'R');
    fallbackFingers(pose, this.paletteGrip, 'L');
    pose.chest[0] -= 0.05 * this.salute;
    return pose;
  }

  /**
   * Both arms by IK: the palette on the left forearm, the brush in a pinch.
   * `again` re-solves after update() without easing the hand's turn twice.
   */
  arms(again = false) {
    const p = this.person;
    const { bones } = p;
    const s = p.scale;
    bones.chest.updateWorldMatrix(true, false);
    const { fwd } = this;
    const { right } = this;
    // Palette: forearm level under it at elbow height, the board reaching in
    // across the body; lifted toward the brush when loading
    const ld = this.load;
    this.palPos.set(0.21 - 0.05 * ld, -0.13 + 0.05 * ld, 0.3 + 0.04 * ld).multiplyScalar(s);
    bones.chest.localToWorld(this.palPos);
    _v.copy(UP).addScaledVector(fwd, -0.12).addScaledVector(right, 0.08).normalize();
    _v2.copy(fwd).addScaledVector(right, -0.5 + 0.25 * ld).normalize();
    // Hand frame: palm (−X) up, fingers (−Y) forward and out
    alignQuat(NEG_X, NEG_Y, _v, _v2, this.palQ);
    this.pole.copy(right).multiplyScalar(-0.6).addScaledVector(fwd, -0.3).add(this.palPos);
    this.pole.y -= 0.4;
    p.ikArm('L', this.palPos, this.pole, this.palQ);

    // Brush: which way the bristles point and the palm turns, eased between activities
    bones.upperArmR.getWorldPosition(this.shoulder);
    if (!again) {
      if (this.mode === 'look' && this.backW > 0.35) {
        if (this.measure) {
          _v.subVectors(this.canvasC, this.shoulder).setY(0).normalize();
          this.dirGoal.copy(UP).addScaledVector(_v, 0.12);
          this.palmGoal.copy(_v).negate().addScaledVector(right, -0.3);
        } else {
          this.dirGoal.copy(UP).addScaledVector(fwd, 0.7);
          this.palmGoal.copy(right).negate().addScaledVector(fwd, -0.3);
        }
      } else if (this.mode === 'load') {
        this.dirGoal.copy(UP).multiplyScalar(-1).addScaledVector(fwd, 0.45).addScaledVector(right, -0.3);
        this.palmGoal.copy(fwd).addScaledVector(right, -0.5).addScaledVector(UP, -0.3);
      } else {
        _v.subVectors(this.tip, this.shoulder).normalize();
        this.dirGoal.copy(this.canvasN).multiplyScalar(-0.75).add(_v);
        this.palmGoal.copy(UP).multiplyScalar(-0.55).addScaledVector(right, -0.85);
      }
      const k = 1 - Math.exp(-this.dt * 7);
      this.dir.lerp(this.dirGoal.normalize(), k).normalize();
      this.palm.lerp(this.palmGoal.normalize(), k).normalize();
    }
    toolHand(this.brushGrip, 'R', this.tip, this.dir, this.palm, BRUSH_REACH, this.wrist, this.handQ);
    // Elbow out to the side and down, as anyone holds a brush at an easel
    this.pole.set(-0.8, -0.7, -0.25).multiplyScalar(s);
    bones.chest.localToWorld(this.pole);
    p.ikArm('R', this.wrist, this.pole, this.handQ);
    // A great verdict on your canvas: the brush goes up in salute
    if (this.salute > 0.002) {
      for (const [n, q] of this.cheerQ) bones[n].quaternion.slerp(q, this.salute);
    }
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
    this.feet = new Feet(this.person, { width: 0.1, toeOut: 0.12, swing: 0.36, lift: 0.07 });
    this.mode = 'home';
    this.then = 'home';
    this.t = 0;
    this.walk = null;
    this.walkW = 0;
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
    this.readW = 0;
    this.pose = POSES.stand();
    this.poseC = POSES.stand();
    this.lookPt = new THREE.Vector3();
    this.lookGoal = new THREE.Vector3();
    this.penTip = new THREE.Vector3();
    this.handPos = new THREE.Vector3();
    this.handQ = new THREE.Quaternion();
    this.bookPos = new THREE.Vector3();
    this.bookQ = new THREE.Quaternion();
    this.pole = new THREE.Vector3();
    this.wristL = new THREE.Vector3();
    this.bookN = new THREE.Vector3();
    this.spine = new THREE.Vector3();
    this.penDir = new THREE.Vector3();
    this.penPalm = new THREE.Vector3();
    this.explainW = 0;
  }

  /** The notebook and the pen, in his hands. */
  equip(mat) {
    const p = this.person;
    this.book = new THREE.Mesh(notebookGeometry(), mat);
    this.pen = new THREE.Mesh(penGeometry(), mat);
    this.book.castShadow = true;
    // The book by its bottom edge, thumb on the pages; the pen like a pen
    this.bookGrip = holdIn(p, this.book, 'L', 'flat', { thickness: 0.01 });
    this.penGrip = holdIn(p, this.pen, 'R', 'pinch', { diameter: 0.009 });
    return [this.book, this.pen];
  }

  get walking() {
    return this.mode === 'walk';
  }

  walkTo(x, z, then, speed = 1.12) {
    const p = this.person.root.position;
    const dist = Math.hypot(x - p.x, z - p.z);
    if (dist < 0.03) {
      this.arrive(then);
      return;
    }
    const ramp = Math.min(0.55, dist / speed / 2);
    this.walk = { fx: p.x, fz: p.z, tx: x, tz: z, dist, ramp, dur: dist / speed + ramp, s: 0, go: false, wait: 0 };
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
    this.walkTo(this.spot.x, this.spot.z, 'inspect', 1.25);
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
    const turnRate = this.mode === 'walk' ? (this.walk && !this.walk.go ? 4.5 : 6) : 3.5;
    this.ry += angleTo(this.ry, w.face) * (1 - Math.exp(-dt * turnRate));
    root.rotation.y = this.ry;
    this.walkW = ease(this.walkW, w.walk, 6, dt);
    this.writeW = ease(this.writeW, w.write, 5, dt);
    this.chinW = ease(this.chinW, w.chin, 4, dt);
    this.readW = ease(this.readW, w.read, 4, dt);
    this.explainW = ease(this.explainW, w.explain, 5, dt);
    this.lookPt.lerp(this.lookGoal, 1 - Math.exp(-dt * 8));
    const g = this.feet.plan(dt);
    P.setPose(this.bodyPose(t, g), 1);
    // Nods and head shakes ride on top of the pose (update() keeps them)
    P.bones.head.rotation.x += w.nod;
    P.bones.head.rotation.y += w.shake;
    root.updateMatrixWorld(true);
    this.feet.solve();
    this.hands(t);
    P.lookAt(this.lookPt, 1);
    P.update(dt, t);
    this.hands(t);
  }

  /** What he is doing this frame: facing, and the weights of each gesture. */
  behave(dt, t, ctx) {
    const { root } = this.person;
    const w = { face: this.ry, walk: 0, write: 0, chin: 0, read: 0.6, explain: 0, nod: 0, shake: 0 };
    const towards = (v) => Math.atan2(v.x - root.position.x, v.z - root.position.z);
    if (this.mode === 'walk') {
      // Heading first: stepWalk() may arrive, and arriving ends the walk
      w.face = Math.atan2(this.walk.tx - this.walk.fx, this.walk.tz - this.walk.fz);
      w.walk = this.stepWalk(dt);
      w.read = 0;
    } else if (this.mode === 'inspect') {
      w.face = towards(this.canvasC);
      // His eyes go over the whole canvas, not one spot on it
      this.lookGoal.copy(this.canvasC).add(_v.set(Math.sin(t * 0.9) * 0.38, Math.sin(t * 1.37 + 1) * 0.36, 0));
      const cyc = this.t % 4.4;
      w.chin = cyc < 2.4 ? 1 : 0;
      w.write = cyc >= 2.6 ? 1 : 0;
      w.read = w.write ? 1 : 0.4;
      if (w.write) this.lookGoal.copy(this.penTip);
    } else if (this.mode === 'verdict') {
      this.deliver(dt, ctx, w, towards);
    } else if (this.mode === 'view') {
      const v = this.viewing;
      w.face = towards(v.canvasC);
      this.lookGoal.copy(v.canvasC).add(_v.set(Math.sin(t * 0.8) * 0.2, Math.sin(t * 1.1) * 0.15, 0));
      w.write = this.t % 5 > 3 ? 1 : 0;
      w.read = w.write ? 1 : 0.5;
      w.chin = !w.write && this.t % 5 < 1.6 ? 1 : 0;
      if (w.write) this.lookGoal.copy(this.penTip);
      if (this.t > 5.5) this.walkTo(this.home.x, this.home.z, 'home', 1.05);
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
      w.read = w.write ? 1 : 0.45;
      if (w.write) this.lookGoal.copy(this.penTip);
      if (this.stroll && this.strollSpots.length && this.t > this.strollNext) {
        this.strollNext = 7 + Math.random() * 5;
        this.viewing = this.strollSpots[Math.floor(Math.random() * this.strollSpots.length)];
        this.walkTo(this.viewing.x, this.viewing.z, 'view', 1.0);
      }
    }
    return w;
  }

  /**
   * One frame of walking: turn toward where he is going, then a trapezoid of
   * speed along the line. The feet (gait.js) do the stepping. Returns the
   * walk weight (for the arm swing and the lean).
   */
  stepWalk(dt) {
    const P = this.person;
    const w = this.walk;
    const heading = Math.atan2(w.tx - w.fx, w.tz - w.fz);
    if (!w.go) {
      // A big turn is made on the spot first, a few steps round
      w.wait += dt;
      if (Math.abs(angleTo(this.ry, heading)) < 0.5 || w.wait > 1.2) {
        w.go = true;
        this.t = 0;
      }
      this.lookGoal.set(w.tx, 1.55, w.tz);
      return 0.2;
    }
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
    w.read = 0.2;
    // Eye contact while he speaks; then now and again a look back at the canvas
    if (this.t < talkFor + 0.6 || this.t % 5 < 3) this.lookGoal.copy(cam);
    else this.lookGoal.copy(this.canvasC);
  }

  /** Upper body over the planted feet; the arms come from hands() and the explain gesture. */
  bodyPose(t, g) {
    const p = POSES.stand(t, this.pose);
    const P = this.person;
    const wk = this.walkW;
    // A slight forward lean and a counter-swing of the trunk while walking
    p.spine[0] += 0.04 * wk;
    p.hips[1] += g.twist * 0.12 * wk;
    p.chest[1] -= g.twist * 0.16 * wk;
    p.head[1] += g.twist * 0.05 * wk;
    p.hipsPos[1] -= g.drop / P.scale;
    p.hipsPos[0] += g.sway * 0.02;
    p.hips[2] += g.sway * 0.035;
    p.chest[2] -= g.sway * 0.02;
    // Idle weight: a slow breathing sway of the trunk
    p.spine[2] += Math.sin(t * 0.6) * 0.015 * (1 - wk);
    p.head[0] = 0.02 + 0.12 * this.readW;
    // The pen arm swings against the feet when nothing else wants it
    p.upperArmR[0] = -0.3 * g.swing * wk + 0.04;
    p.forearmR[0] = -0.35 - Math.max(0, g.swing) * 0.25 * wk;
    fallbackFingers(p, this.penGrip, 'R');
    fallbackFingers(p, this.bookGrip, 'L');
    if (this.explainW > 0.001) {
      const ex = POSES.explain(t, this.poseC);
      const k = this.explainW;
      for (const n of ['upperArmR', 'forearmR', 'handR', 'chest']) {
        for (let i = 0; i < 3; i++) p[n][i] += (ex[n][i] - p[n][i]) * k;
      }
    }
    return p;
  }

  /** The notebook hand and the pen hand, by IK, with the props held as they would be. */
  hands(t) {
    const P = this.person;
    const { bones } = P;
    const s = P.scale;
    bones.chest.updateWorldMatrix(true, false);
    const yaw = this.ry;
    const fwd = _v.set(Math.sin(yaw), 0, Math.cos(yaw));
    const left = _v2.set(Math.cos(yaw), 0, -Math.sin(yaw));

    // The notebook, held by its bottom edge: low and flat while he walks,
    // up in front of the chest and tipped toward his eyes to read and write
    const rd = this.readW * (1 - this.walkW * 0.8);
    this.bookPos.set(0.12 - 0.05 * rd, -0.25 + 0.16 * rd, 0.17 + 0.1 * rd).multiplyScalar(s);
    bones.chest.localToWorld(this.bookPos);
    // The book runs up and away from the hand; its pages face his eyes
    const up = this.spine.copy(fwd).multiplyScalar(0.8 - 0.35 * rd).addScaledVector(UP, 0.25 + 0.7 * rd).addScaledVector(left, -0.35).normalize();
    const n = this.bookN.copy(UP).addScaledVector(fwd, -0.6 * rd).addScaledVector(left, -0.15);
    alignQuat(Z_AXIS, Y_AXIS, up, n, this.bookQ);
    objectHand(this.bookGrip, this.bookPos, this.bookQ, this.wristL, _q2);
    this.pole.copy(left).multiplyScalar(0.6).addScaledVector(fwd, -0.3).add(this.wristL);
    this.pole.y -= 0.5;
    P.ikArm('L', this.wristL, this.pole, _q2);

    // The pen: nib on the page, knuckles under the chin, or swinging/explaining (FK)
    const reach = Math.max(this.writeW, this.chinW);
    if (reach <= 0.01) return;
    this.book.updateWorldMatrix(true, false);
    let dir;
    let palm;
    if (this.writeW >= this.chinW) {
      // A line of handwriting across the right-hand page, line after line
      const a = t * 5.5;
      const line = Math.floor((t * 0.4) % 4);
      this.penTip.set(0.022 + ((a * 0.012) % 0.05), 0.0065, 0.12 - line * 0.02 + Math.sin(a * 3) * 0.003).applyMatrix4(this.book.matrixWorld);
      // Into the page, leaning back toward his right hand
      this.book.getWorldQuaternion(_q2);
      dir = this.penDir.copy(NEG_Y).applyQuaternion(_q2).addScaledVector(left, -0.35).addScaledVector(fwd, -0.3).normalize();
      palm = this.penPalm.copy(left).addScaledVector(UP, -0.6);
    } else {
      // Pen to the chin, nib up past the jaw
      P.sockets.face.getWorldPosition(this.penTip);
      this.penTip.addScaledVector(UP, -0.1 * s).addScaledVector(fwd, 0.035);
      dir = this.penDir.copy(UP).addScaledVector(fwd, -0.35).addScaledVector(left, 0.1).normalize();
      palm = this.penPalm.copy(fwd).negate().addScaledVector(left, 0.5);
    }
    toolHand(this.penGrip, 'R', this.penTip, dir, palm, PEN_REACH, this.handPos, this.handQ);
    // Blend from wherever the pose left the hand
    bones.handR.getWorldPosition(_v3);
    bones.handR.getWorldQuaternion(_q);
    this.handPos.lerpVectors(_v3, this.handPos, reach);
    _q.slerp(this.handQ, reach);
    this.pole.copy(left).multiplyScalar(-0.7).addScaledVector(fwd, -0.2).addScaledVector(UP, -0.7).multiplyScalar(s);
    bones.chest.getWorldPosition(_v3);
    this.pole.add(_v3);
    P.ikArm('R', this.handPos, this.pole, _q);
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

  const painters = PAINTERS.map((def, i) => {
    const detail = lowTier || safe ? 'low' : def.detail;
    const p = new Painter(def, detail, rand, i);
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
  const backEasels = seats.map((st, i) => {
    const f = st.rotationY;
    const ex = st.position.x + Math.sin(f) * 0.62 - Math.cos(f) * 0.2;
    const ez = st.position.z + Math.cos(f) * 0.62 + Math.sin(f) * 0.2;
    return { x: ex, z: ez, ry: Math.atan2(st.position.x - ex, st.position.z - ez), art: workInProgress(ARTWORKS[i % ARTWORKS.length], seed + 31 * i) };
  });
  // The painters' own easels are bare boards here: their pictures are live (below)
  const easels = buildFieldEasels([...painters.map((p) => ({ ...p.easel })), ...backEasels]);
  group.add(easels);

  /* Their canvases, filling in as they paint: one atlas, one mesh */
  const canvases = new FieldCanvases(PAINTERS, seed, lowTier);
  const picGeos = painters.map((p, i) => {
    const g = new THREE.PlaneGeometry(FIELD_W * 0.97 * FIELD_SCALE, FIELD_H * 0.96 * FIELD_SCALE);
    const [u0, v0, u1, v1] = canvases.uv(i);
    const { uv } = g.attributes;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(p.easel.x + Math.sin(p.easel.ry) * FIELD_CANVAS.z, FIELD_CANVAS.y, p.easel.z + Math.cos(p.easel.ry) * FIELD_CANVAS.z),
      new THREE.Quaternion().setFromAxisAngle(UP, p.easel.ry), new THREE.Vector3(1, 1, 1)
    ));
    return g;
  });
  const picMat = new THREE.MeshLambertMaterial({ map: canvases.tex });
  const pictures = new THREE.Mesh(mergeGeometries(picGeos), picMat);
  picGeos.forEach((g) => g.dispose());
  pictures.receiveShadow = true;
  pictures.name = 'field-canvases';
  group.add(pictures);

  // From home he watches what is in front of him: your easel, the hat, and
  // the painters within a natural turn of the head
  const sights = [canvasC.clone(), new THREE.Vector3(-2.7, 0.95, -3.5), ...painters.map((p) => p.canvasC)];
  judge.sights = sights.filter((v) => Math.abs(angleTo(home.ry, Math.atan2(v.x - home.x, v.z - home.z))) < 1.1);

  // Stroll spots: behind a painter's shoulder, where he can see the canvas
  judge.strollSpots = painters.slice(0, 2).map((p) => {
    const left = new THREE.Vector3(Math.cos(p.face), 0, -Math.sin(p.face));
    const at = p.home.clone().addScaledVector(left, 0.75).addScaledVector(p.fwd, -0.35);
    return { x: at.x, z: at.z, canvasC: p.canvasC };
  });

  /* Held props: one shared material, each its own small mesh in a hand */
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0 });
  const props = [...judge.equip(propMat)];
  painters.forEach((p) => props.push(...p.equip(propMat, ARTWORKS.find((w) => w.id === p.def.work) || ARTWORKS[0])));
  props.forEach((m) => {
    // Hands move every frame; the bones' bounds are the person's
    m.frustumCulled = false;
  });

  const focus = new THREE.Vector3().copy(canvasC);
  const judgeHead = new THREE.Vector3();
  const ctx = { camera: null, focus, painters, judgeWalking: false, judgeHead, canvases };
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
      painters.forEach((p) => p.update(dt, t, ctx));
      canvases.update(dt);
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
      props.forEach((m) => m.geometry.dispose());
      judge.person.dispose();
      painters.forEach((p) => p.person.dispose());
      crowd.dispose();
      propMat.dispose();
      pictures.geometry.dispose();
      picMat.dispose();
      canvases.tex.dispose();
      easels.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      if (group.parent) group.parent.remove(group);
    }
  };
}
