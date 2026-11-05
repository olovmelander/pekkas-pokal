/**
 * The cabinet, the backbox and the playfield glass: the machine round the
 * playfield, built the way a modern machine is.
 *
 * A trapezoid body on four legs (the playfield climbs 6.5° toward the back
 * because the body is taller there, not because the legs differ), printed
 * side art, side armour, a lockdown bar with an action button, a coin door
 * and plunger on the front, and a backbox with depth: lit translite on top,
 * speaker panel with the DMD and two grilles below it.
 *
 * The playfield stays level in world space — physics, camera and lamps all
 * assume it — so it is the ROOM that is pitched: the floor, the legs and the
 * bottom of the body lie in a frame tilted by the slope (see `roomPoint`).
 * Relative to the floor the machine then leans exactly as a real one does.
 *
 * Everything static is drawn with a handful of shared materials so the
 * static batcher (bakeStatic) folds the whole machine into a few draw calls:
 * paint, printed art (sides, front, blades and backbox sides share one
 * atlas), chrome, powder-coat, and the lit face (translite, speaker panel,
 * buttons and the price plate share another).
 */

import { L } from './table.js';

/**
 * Where the cabinet sits around the playfield. index.js frames the camera on
 * x0…x1 / z0…z1, so those stay the playfield's own box: the wider body and
 * the backbox's outer edges may run off a portrait screen, the playfield may
 * not.
 */
export const CAB = {
  x0: -L.flareX - 1.15,
  x1: L.outerX + 1.15,
  z0: 2.1, // front edge, on the player's side of the apron
  z1: -(L.domeY + L.domeOuterR + 1.2),
  glassY: 6.4, // the glass clears the tallest ramp and the castle roofs
  railY: 4.7, // top of the cabinet sides (the armour sits on it)
  backH: 14, // the backbox face, from the playfield up its tilt
  headTilt: 0.44, // leans away from the player, so the DMD faces the camera
  // The DMD window in the head, in head-face units from its bottom centre.
  // Big on purpose: on a phone the head is ~250 px wide, and the display
  // has to stay legible at that size.
  dmd: { w: 15.6, h: 3.9, y: 2.5 },
  // Body: ≈ 0.7 m wide (1 unit ≈ 2.5 cm), its top edge level with the
  // playfield's frame, its bottom parallel to the floor
  hw: 13.6,
  topY: 5.0,
  frontZ: 2.75,
  slope: (6.5 * Math.PI) / 180,
  legH: 20, // floor to the underside of the body, at right angles to the floor
  frontH: 39, // floor to the top of the front (lockdown bar sits on it)
  bodyL: 55, // front to back along the floor
  armourTop: 6.9 // the side armour and lockdown bar stand above the glass
};
CAB.cx = (CAB.x0 + CAB.x1) / 2;

const COS = Math.cos(CAB.slope);
const SIN = Math.sin(CAB.slope);
const TAN = Math.tan(CAB.slope);

/**
 * The floor frame: world position of the point `rh` above the floor and `rd`
 * along it (forward positive), measured from under the front of the body.
 * Its origin is chosen so the front's top edge lands at (topY, frontZ).
 */
export const ROOM = {
  origin: { y: CAB.topY - CAB.frontH * COS, z: CAB.frontZ + CAB.frontH * SIN },
  slope: CAB.slope
};
export function roomPoint(rh, rd) {
  return {
    y: ROOM.origin.y + rh * COS + rd * SIN,
    z: ROOM.origin.z - rh * SIN + rd * COS
  };
}

/** World-space top edge of the backbox face, for framing the camera */
export function headTop() {
  return {
    y: CAB.backH * Math.cos(CAB.headTilt),
    z: CAB.z1 + 0.4 - CAB.backH * Math.sin(CAB.headTilt)
  };
}

/** Head-face local (y up the face, z out of it) → world (y, z) */
function headPoint(yl, zl) {
  const c = Math.cos(CAB.headTilt);
  const s = Math.sin(CAB.headTilt);
  return { y: yl * c + zl * s, z: CAB.z1 + 0.4 - yl * s + zl * c };
}

/** The back face of the body (and of the backbox, flush above it) at height y */
const backZ = (y) => roomPoint(0, -CAB.bodyL).z + (roomPoint(0, -CAB.bodyL).y - y) * TAN;

/* ------------------------------------------------------------- helpers */

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')];
}

/** Insets a simple polygon by d (counter-clockwise points move inward) */
function insetPolygon(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sgn = area > 0 ? 1 : -1;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    // Inward normal of a CCW polygon is the left normal
    const nx = (-dy / len) * sgn;
    const ny = (dx / len) * sgn;
    return { px: a[0] + nx * d, py: a[1] + ny * d, dx, dy };
  });
  return lines.map((l1, i) => {
    const l0 = lines[(i + n - 1) % n];
    const den = l0.dx * l1.dy - l0.dy * l1.dx;
    if (Math.abs(den) < 1e-9) return [l1.px, l1.py];
    const t = ((l1.px - l0.px) * l1.dy - (l1.py - l0.py) * l1.dx) / den;
    return [l0.px + l0.dx * t, l0.py + l0.dy * t];
  });
}

/** Keeps only the given draw groups of a geometry (non-indexed copy) */
function keepGroups(THREE, geo, keep) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
  const ranges = [];
  groups.forEach((g, gi) => {
    if (keep.includes(g.materialIndex ?? gi)) ranges.push(g);
  });
  const out = new THREE.BufferGeometry();
  ['position', 'normal', 'uv'].forEach((name) => {
    const a = src.attributes[name];
    if (!a) return;
    const parts = [];
    ranges.forEach((r) => {
      const end = Math.min(a.count, r.start + r.count);
      parts.push(a.array.slice(r.start * a.itemSize, end * a.itemSize));
    });
    const len = parts.reduce((s, p) => s + p.length, 0);
    const arr = new Float32Array(len);
    let o = 0;
    parts.forEach((p) => {
      arr.set(p, o);
      o += p.length;
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  });
  if (src !== geo) src.dispose();
  geo.dispose();
  return out;
}

/**
 * A prism with rounded edges from a side profile drawn in world (z, y),
 * extruded across x from xa to xb. Caps are dropped (`caps: false`) where a
 * printed panel takes their place, so nothing is ever drawn twice in the
 * same plane.
 */
function profilePrism(THREE, prof, xa, xb, { bevel = 0.3, caps = true } = {}) {
  const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(-z, y)));
  const depth = Math.max(0.05, xb - xa - bevel * 2);
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 4
  });
  if (!caps) geo = keepGroups(THREE, geo, [1]);
  // Shape (s, t, depth) → world (x = depth, y = t, z = −s)
  geo.rotateY(Math.PI / 2);
  geo.translate(xa + bevel, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

/** A flat printed panel filling a profile at x, facing ±x, UVs from fn(z, y) */
function profilePanel(THREE, prof, x, facing, uvOf) {
  const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(-z, y)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateY(Math.PI / 2); // normal +z → +x
  if (facing < 0) {
    geo.rotateY(Math.PI);
    // Rotating flipped z too: put it back so the profile is unchanged
    geo.scale(1, 1, -1);
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    const nrm = geo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -1, 0, 0);
  }
  geo.translate(x, 0, 0);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const [u, v] = uvOf(p.getZ(i), p.getY(i));
    uv.setXY(i, u, v);
  }
  return geo;
}

/** Re-maps every UV of a geometry through fn(u, v) */
function remapUV(geo, fn) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = fn(uv.getX(i), uv.getY(i));
    uv.setXY(i, u, v);
  }
  return geo;
}

/* ------------------------------------------------------------- the art */

const GOLD = '#f2c14e';
const NIGHT = ['#070b22', '#131a4a', '#2a1c52'];

function starField(g, x, y, w, h, n, seed) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    const a = 0.25 + rnd() * 0.6;
    g.fillStyle = `rgba(255,240,215,${a})`;
    const r = rnd() < 0.1 ? 2.2 : 1.2;
    g.beginPath();
    g.arc(x + rnd() * w, y + rnd() * h, r, 0, Math.PI * 2);
    g.fill();
  }
}

/** A castle on its hill: keep, flanking towers with pennants, lit windows */
function drawCastle(g, cx, by, s, { lit = 'rgba(255,196,110,.95)', ink = '#080b20', edge = 'rgba(242,193,78,.75)' } = {}) {
  const P = (x, y) => [cx + x * s, by - y * s];
  const poly = (pts) => {
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const [px, py] = P(x, y);
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    });
    g.closePath();
  };
  const crenel = (x0, x1, y, h = 8, step = 12) => {
    const pts = [[x0, 0], [x0, y]];
    for (let x = x0; x < x1 - 0.1; x += step) {
      pts.push([x, y + h], [Math.min(x1, x + step / 2), y + h], [Math.min(x1, x + step / 2), y], [Math.min(x1, x + step), y]);
    }
    pts.push([x1, 0]);
    return pts;
  };
  g.save();
  g.fillStyle = ink;
  g.strokeStyle = edge;
  g.lineWidth = Math.max(1.5, s * 1.6);
  g.shadowColor = 'rgba(242,193,78,.55)';
  g.shadowBlur = s * 8;
  const parts = [
    crenel(-120, 120, 60), // curtain wall
    crenel(-46, 46, 118, 10, 15.3), // keep
    [[-140, 0], [-140, 112], [-160, 112], [-130, 168], [-100, 112], [-120, 112], [-120, 0]], // left tower
    [[120, 0], [120, 112], [100, 112], [130, 168], [160, 112], [140, 112], [140, 0]], // right tower
    [[-18, 118], [-18, 172], [-30, 172], [0, 236], [30, 172], [18, 172], [18, 118]] // spire
  ];
  parts.forEach((pts) => {
    poly(pts);
    g.fill();
  });
  g.shadowBlur = 0;
  parts.forEach((pts) => {
    poly(pts);
    g.stroke();
  });
  // Pennants
  [[-130, 168], [130, 168], [0, 236]].forEach(([x, y], i) => {
    const [px, py] = P(x, y);
    g.fillStyle = 'rgba(220,226,255,.8)';
    g.fillRect(px - s * 0.8, py - 34 * s, s * 1.6, 34 * s);
    g.fillStyle = i === 2 ? GOLD : '#d1344b';
    g.beginPath();
    g.moveTo(px + s, py - 34 * s);
    g.quadraticCurveTo(px + 22 * s, py - 30 * s, px + 34 * s, py - 24 * s);
    g.lineTo(px + s, py - 18 * s);
    g.closePath();
    g.fill();
  });
  // Lit windows and the gate
  g.fillStyle = lit;
  g.shadowColor = lit;
  g.shadowBlur = s * 10;
  [[-130, 70], [-130, 92], [130, 70], [130, 92], [-28, 92], [0, 92], [28, 92], [0, 150]].forEach(([x, y]) => {
    const [px, py] = P(x, y);
    g.beginPath();
    g.moveTo(px - 3.5 * s, py);
    g.lineTo(px - 3.5 * s, py - 9 * s);
    g.arc(px, py - 9 * s, 3.5 * s, Math.PI, 0);
    g.lineTo(px + 3.5 * s, py);
    g.closePath();
    g.fill();
  });
  const [gx, gy] = P(0, 0);
  g.beginPath();
  g.moveTo(gx - 16 * s, gy);
  g.lineTo(gx - 16 * s, gy - 24 * s);
  g.arc(gx, gy - 24 * s, 16 * s, Math.PI, 0);
  g.lineTo(gx + 16 * s, gy);
  g.closePath();
  g.fill();
  g.restore();
}

/** The Pekkas Pokal cup: bowl, knop, foot and two handles, in glowing gold */
function drawTrophy(g, cx, by, s, glow = 1) {
  g.save();
  const grad = g.createLinearGradient(cx - 40 * s, 0, cx + 40 * s, 0);
  grad.addColorStop(0, '#9a6a18');
  grad.addColorStop(0.35, '#ffe39a');
  grad.addColorStop(0.6, '#f2c14e');
  grad.addColorStop(1, '#8a5c12');
  g.fillStyle = grad;
  g.strokeStyle = 'rgba(60,36,4,.8)';
  g.lineWidth = Math.max(1, s * 1.5);
  g.shadowColor = `rgba(255,205,110,${0.85 * glow})`;
  g.shadowBlur = 30 * s * glow;
  const y = (v) => by - v * s;
  g.beginPath();
  g.moveTo(cx - 30 * s, y(0));
  g.lineTo(cx + 30 * s, y(0));
  g.lineTo(cx + 24 * s, y(8));
  g.lineTo(cx + 10 * s, y(12));
  g.lineTo(cx + 7 * s, y(34));
  g.quadraticCurveTo(cx + 40 * s, y(44), cx + 40 * s, y(86));
  g.lineTo(cx - 40 * s, y(86));
  g.quadraticCurveTo(cx - 40 * s, y(44), cx - 7 * s, y(34));
  g.lineTo(cx - 10 * s, y(12));
  g.lineTo(cx - 24 * s, y(8));
  g.closePath();
  g.fill();
  g.stroke();
  g.shadowBlur = 0;
  g.lineWidth = 6 * s;
  g.strokeStyle = grad;
  [-1, 1].forEach((k) => {
    g.beginPath();
    g.moveTo(cx + k * 38 * s, y(78));
    g.bezierCurveTo(cx + k * 64 * s, y(80), cx + k * 62 * s, y(46), cx + k * 26 * s, y(46));
    g.stroke();
  });
  g.fillStyle = 'rgba(255,250,230,.55)';
  g.fillRect(cx - 26 * s, y(80), 8 * s, 30 * s);
  g.restore();
}

/** A knight on foot: plumed helm, heater shield, lance with a pennant */
function drawKnight(g, x, by, s, face = 1, colour = '#d1344b') {
  g.save();
  g.translate(x, by);
  g.scale(face * s, s);
  g.fillStyle = '#0a0d24';
  g.strokeStyle = 'rgba(242,193,78,.8)';
  g.lineWidth = 1.6;
  const body = new Path2D();
  body.moveTo(-14, 0);
  body.lineTo(-10, -46);
  body.lineTo(-18, -86);
  body.lineTo(-8, -104);
  body.lineTo(8, -104);
  body.lineTo(18, -86);
  body.lineTo(10, -46);
  body.lineTo(14, 0);
  body.lineTo(4, 0);
  body.lineTo(0, -40);
  body.lineTo(-4, 0);
  body.closePath();
  // helm
  body.moveTo(-10, -104);
  body.lineTo(-10, -124);
  body.quadraticCurveTo(0, -136, 10, -124);
  body.lineTo(10, -104);
  body.closePath();
  g.fill(body);
  g.stroke(body);
  // plume
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(0, -132);
  g.quadraticCurveTo(-26, -150, -34, -120);
  g.quadraticCurveTo(-18, -134, 0, -126);
  g.fill();
  // visor slit
  g.fillStyle = 'rgba(255,196,110,.9)';
  g.fillRect(-7, -118, 14, 2.4);
  // lance and pennant
  g.strokeStyle = '#c9cfe6';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(20, 6);
  g.lineTo(30, -210);
  g.stroke();
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(29.5, -200);
  g.lineTo(66, -190);
  g.lineTo(28.6, -178);
  g.closePath();
  g.fill();
  // shield
  g.fillStyle = colour;
  g.strokeStyle = GOLD;
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(-34, -92);
  g.lineTo(2, -92);
  g.lineTo(2, -62);
  g.quadraticCurveTo(2, -34, -16, -24);
  g.quadraticCurveTo(-34, -34, -34, -62);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = GOLD;
  g.fillRect(-18, -88, 4, 56);
  g.fillRect(-30, -70, 28, 4);
  g.restore();
}

/** The moose crest: a heater shield with a moose head under spread antlers */
function drawCrest(g, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  const shield = new Path2D();
  shield.moveTo(-50, -56);
  shield.lineTo(50, -56);
  shield.lineTo(50, 6);
  shield.quadraticCurveTo(50, 50, 0, 72);
  shield.quadraticCurveTo(-50, 50, -50, 6);
  shield.closePath();
  const fill = g.createLinearGradient(0, -56, 0, 72);
  fill.addColorStop(0, '#9c1a33');
  fill.addColorStop(1, '#5a0c1e');
  g.fillStyle = fill;
  g.shadowColor = 'rgba(242,193,78,.7)';
  g.shadowBlur = 18;
  g.fill(shield);
  g.shadowBlur = 0;
  g.strokeStyle = GOLD;
  g.lineWidth = 5;
  g.stroke(shield);
  g.lineWidth = 1.5;
  g.strokeStyle = 'rgba(242,193,78,.55)';
  g.save();
  g.scale(0.86, 0.86);
  g.stroke(shield);
  g.restore();
  // Moose: palmate antlers, broad head, drooping muzzle, bell
  g.fillStyle = GOLD;
  [-1, 1].forEach((k) => {
    g.beginPath();
    g.moveTo(k * 8, -14);
    g.quadraticCurveTo(k * 20, -26, k * 30, -24);
    g.lineTo(k * 30, -44);
    g.lineTo(k * 34, -32);
    g.lineTo(k * 38, -48);
    g.lineTo(k * 41, -32);
    g.lineTo(k * 46, -42);
    g.lineTo(k * 45, -22);
    g.quadraticCurveTo(k * 40, -12, k * 22, -10);
    g.quadraticCurveTo(k * 14, -8, k * 8, -6);
    g.closePath();
    g.fill();
  });
  g.beginPath();
  g.moveTo(-12, -16);
  g.quadraticCurveTo(0, -22, 12, -16);
  g.lineTo(13, 4);
  g.quadraticCurveTo(15, 24, 8, 34);
  g.quadraticCurveTo(0, 40, -8, 34);
  g.quadraticCurveTo(-15, 24, -13, 4);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(-4, 36);
  g.quadraticCurveTo(0, 52, 4, 36);
  g.fill();
  g.fillStyle = '#5a0c1e';
  g.beginPath();
  g.arc(-6, -4, 2.2, 0, Math.PI * 2);
  g.arc(6, -4, 2.2, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A hanging swallowtail banner with a charge */
function drawBanner(g, x, top, w, h, colour, charge) {
  g.save();
  g.fillStyle = '#c9cfe6';
  g.fillRect(x - w * 0.62, top - 4, w * 1.24, 5);
  const grad = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  grad.addColorStop(0, colour[1]);
  grad.addColorStop(0.5, colour[0]);
  grad.addColorStop(1, colour[1]);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x - w / 2, top);
  g.lineTo(x + w / 2, top);
  g.lineTo(x + w / 2, top + h);
  g.lineTo(x, top + h * 0.82);
  g.lineTo(x - w / 2, top + h);
  g.closePath();
  g.fill();
  g.strokeStyle = GOLD;
  g.lineWidth = Math.max(1.5, w * 0.04);
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(242,193,78,.5)';
  g.strokeRect(x - w * 0.38, top + h * 0.06, w * 0.76, h * 0.62);
  if (charge === 'crest') drawCrest(g, x, top + h * 0.38, w / 150);
  else if (charge === 'cup') drawTrophy(g, x, top + h * 0.58, w / 150, 0.4);
  else drawCastle(g, x, top + h * 0.6, w / 520, { edge: 'rgba(242,193,78,.6)' });
  g.restore();
}

function title(g, text, x, y, px, { glow = 1, stroke = true, spacing = 6 } = {}) {
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(px)}px Fraunces, Georgia, serif`;
  g.letterSpacing = `${spacing}px`;
  if (stroke) {
    g.lineJoin = 'round';
    g.lineWidth = px * 0.14;
    g.strokeStyle = '#1a0d04';
    g.strokeText(text, x, y);
  }
  const grad = g.createLinearGradient(0, y - px / 2, 0, y + px / 2);
  grad.addColorStop(0, '#fff1c2');
  grad.addColorStop(0.45, GOLD);
  grad.addColorStop(1, '#a8721c');
  g.fillStyle = grad;
  g.shadowColor = `rgba(242,193,78,${0.8 * glow})`;
  g.shadowBlur = px * 0.35 * glow;
  g.fillText(text, x, y);
  g.restore();
}

/**
 * One cabinet side, drawn into the box (ox, oy, w, h) with the polygon
 * `clip` (already in canvas pixels). `front` is +1 when the front of the
 * machine is at the right of the picture (the left side of the cabinet).
 */
function drawSide(g, ox, oy, w, h, clip, front, k) {
  g.save();
  g.beginPath();
  clip.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.clip();
  const sky = g.createLinearGradient(0, oy, 0, oy + h);
  sky.addColorStop(0, NIGHT[0]);
  sky.addColorStop(0.5, NIGHT[1]);
  sky.addColorStop(0.78, NIGHT[2]);
  sky.addColorStop(1, '#0b0716');
  g.fillStyle = sky;
  g.fillRect(ox, oy, w, h);
  starField(g, ox, oy, w, h * 0.55, 160, front > 0 ? 11 : 23);
  // x measured from the BACK of the machine, so both sides share a layout
  const X = (f) => (front > 0 ? ox + f * w : ox + w - f * w);
  // Moon over the castle
  const moon = g.createRadialGradient(X(0.12), oy + h * 0.2, 2, X(0.12), oy + h * 0.2, h * 0.16);
  moon.addColorStop(0, 'rgba(255,246,220,.95)');
  moon.addColorStop(0.35, 'rgba(255,236,190,.55)');
  moon.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = moon;
  g.fillRect(ox, oy, w, h);
  // Rolling hills
  g.fillStyle = '#0d1236';
  g.beginPath();
  g.moveTo(ox, oy + h);
  for (let i = 0; i <= 24; i++) {
    const f = i / 24;
    g.lineTo(ox + f * w, oy + h * (0.6 + Math.sin(f * 9.4 + (front > 0 ? 0 : 2)) * 0.04 + Math.sin(f * 3.1) * 0.03));
  }
  g.lineTo(ox + w, oy + h);
  g.fill();
  // The castle, big, toward the back
  drawCastle(g, X(0.21), oy + h * 0.64, h * 0.0028);
  // Knights riding out toward the front
  drawKnight(g, X(0.42), oy + h * 0.69, h * 0.0022, front, '#d1344b');
  drawKnight(g, X(0.5), oy + h * 0.71, h * 0.0019, front, '#4b5fd1');
  // Banners hanging from the top edge
  drawBanner(g, X(0.62), oy + h * 0.035, h * 0.13, h * 0.33, ['#b3243c', '#5e0c1d'], 'crest');
  drawBanner(g, X(0.73), oy + h * 0.035, h * 0.13, h * 0.33, ['#2c3d9e', '#121b55'], 'cup');
  // The title, front half, and the crest at the front
  title(g, 'PEKKAS POKAL', X(0.69), oy + h * 0.52, h * 0.12 * k, { spacing: 5 * k });
  g.save();
  g.textAlign = 'center';
  g.font = `700 ${Math.round(h * 0.045 * k)}px "Schibsted Grotesk", Inter, sans-serif`;
  g.letterSpacing = `${Math.round(10 * k)}px`;
  g.fillStyle = 'rgba(214,222,255,.85)';
  g.fillText('FLIPPER · SEDAN 2012', X(0.69), oy + h * 0.6);
  g.restore();
  drawCrest(g, X(0.88), oy + h * 0.27, h * 0.0024);
  drawTrophy(g, X(0.21), oy + h * 0.94, h * 0.0016, 0.8);
  // Lower band: the playfield's diamond trellis, in gold on black
  const band = oy + h * 0.74;
  g.fillStyle = 'rgba(5,4,12,.72)';
  g.fillRect(ox, band, w, h);
  g.strokeStyle = 'rgba(242,193,78,.16)';
  g.lineWidth = 2 * k;
  for (let x = ox - h; x < ox + w + h; x += 38 * k) {
    g.beginPath();
    g.moveTo(x, band);
    g.lineTo(x + h, band + h);
    g.moveTo(x, band);
    g.lineTo(x - h, band + h);
    g.stroke();
  }
  g.fillStyle = 'rgba(242,193,78,.75)';
  g.fillRect(ox, band - 3 * k, w, 4 * k);
  g.restore();
  // Pinstripes inset from the edge
  g.save();
  const stripe = (d, lw, a) => {
    const ins = insetPolygon(clip, d);
    g.beginPath();
    ins.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.strokeStyle = `rgba(242,193,78,${a})`;
    g.lineWidth = lw;
    g.stroke();
  };
  stripe(10 * k, 5 * k, 0.9);
  stripe(20 * k, 1.6 * k, 0.6);
  g.restore();
}

/** The side blades: dressed stone, a gold rail, shields between torches */
function drawBlade(g, ox, oy, w, h, k) {
  const bg = g.createLinearGradient(0, oy, 0, oy + h);
  bg.addColorStop(0, '#1a1f44');
  bg.addColorStop(1, '#0a0c1e');
  g.fillStyle = bg;
  g.fillRect(ox, oy, w, h);
  g.strokeStyle = 'rgba(160,170,220,.12)';
  g.lineWidth = 1.5 * k;
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const y = oy + (r / rows) * h;
    g.beginPath();
    g.moveTo(ox, y);
    g.lineTo(ox + w, y);
    g.stroke();
    for (let x = ox + (r % 2) * 20 * k; x < ox + w; x += 40 * k) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + h / rows);
      g.stroke();
    }
  }
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = ox + ((i + 0.5) / n) * w;
    if (i % 2) {
      // a torch glow
      const t = g.createRadialGradient(x, oy + h * 0.45, 1, x, oy + h * 0.45, h * 0.55);
      t.addColorStop(0, 'rgba(255,190,100,.55)');
      t.addColorStop(1, 'rgba(255,190,100,0)');
      g.fillStyle = t;
      g.fillRect(x - h, oy, h * 2, h);
      g.fillStyle = '#ffd38a';
      g.fillRect(x - 2 * k, oy + h * 0.38, 4 * k, h * 0.18);
    } else {
      const s = h / 170;
      g.save();
      g.translate(x, oy + h * 0.5);
      g.scale(s, s);
      g.fillStyle = i % 4 ? '#2c3d9e' : '#9c1a33';
      g.strokeStyle = GOLD;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(-28, -40);
      g.lineTo(28, -40);
      g.lineTo(28, 0);
      g.quadraticCurveTo(28, 28, 0, 44);
      g.quadraticCurveTo(-28, 28, -28, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }
  g.fillStyle = 'rgba(242,193,78,.8)';
  g.fillRect(ox, oy + 3 * k, w, 4 * k);
  g.fillRect(ox, oy + h - 7 * k, w, 4 * k);
}

/** The front: paint, pinstripe and banners either side of the coin door */
function drawFront(g, ox, oy, w, h, k) {
  const bg = g.createLinearGradient(0, oy, 0, oy + h);
  bg.addColorStop(0, '#141a46');
  bg.addColorStop(1, '#07081a');
  g.fillStyle = bg;
  g.fillRect(ox, oy, w, h);
  starField(g, ox, oy, w, h * 0.5, 30, 5);
  g.strokeStyle = 'rgba(242,193,78,.85)';
  g.lineWidth = 3 * k;
  g.strokeRect(ox + 8 * k, oy + 8 * k, w - 16 * k, h - 16 * k);
  g.lineWidth = 1.2 * k;
  g.strokeRect(ox + 15 * k, oy + 15 * k, w - 30 * k, h - 30 * k);
  drawBanner(g, ox + w * 0.13, oy + 22 * k, w * 0.12, h * 0.48, ['#b3243c', '#5e0c1d'], 'crest');
  drawBanner(g, ox + w * 0.87, oy + 22 * k, w * 0.12, h * 0.48, ['#2c3d9e', '#121b55'], 'cup');
}

/** The backbox sides: a tower and a banner */
function drawHeadSide(g, ox, oy, w, h, front, k) {
  const bg = g.createLinearGradient(0, oy, 0, oy + h);
  bg.addColorStop(0, NIGHT[0]);
  bg.addColorStop(1, NIGHT[2]);
  g.fillStyle = bg;
  g.fillRect(ox, oy, w, h);
  starField(g, ox, oy, w, h * 0.6, 40, front > 0 ? 3 : 9);
  drawBanner(g, front > 0 ? ox + w * 0.62 : ox + w * 0.38, oy + h * 0.1, w * 0.3, h * 0.62, ['#b3243c', '#5e0c1d'], 'crest');
  g.strokeStyle = 'rgba(242,193,78,.85)';
  g.lineWidth = 4 * k;
  g.strokeRect(ox + 8 * k, oy + 8 * k, w - 16 * k, h - 16 * k);
}

/* ---------------------------------------------- the lit face (translite) */

const FACE_W = CAB.hw * 2 - 1.2;
const FACE_H = CAB.backH - 0.7;

/**
 * The backbox face: the translite over the speaker panel, plus a strip of
 * lit swatches below them (buttons, price plate, coin inserts) so every
 * self-lit part of the machine shares one material and one draw call.
 */
function faceTexture(THREE, logo, scale) {
  const W = Math.round(2048 * scale);
  const faceRows = Math.round((W * FACE_H) / FACE_W);
  const stripRows = Math.round(256 * scale);
  const H = faceRows + stripRows;
  const [cv, g] = canvas(W, H);
  const u = W / FACE_W; // pixels per unit
  const k = scale;
  const X = (x) => W / 2 + x * u;
  const Y = (y) => faceRows - y * u;
  const { dmd } = CAB;
  const dy = dmd.y - 0.35; // the face plane starts 0.35 above the head's bottom edge
  const panelTop = dy + dmd.h / 2 + 0.55;

  /* ---- Translite: the castle at night, the trophy before its gate ---- */
  const tlBot = Y(panelTop);
  const sky = g.createLinearGradient(0, 0, 0, tlBot);
  sky.addColorStop(0, '#0a0f34');
  sky.addColorStop(0.6, '#1d2a72');
  sky.addColorStop(1, '#3a2466');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, tlBot);
  starField(g, 0, 0, W, tlBot * 0.7, 120, 17);
  // Backlight: a warm pool behind the art
  const pool = g.createRadialGradient(W / 2, tlBot * 0.62, 10, W / 2, tlBot * 0.62, W * 0.45);
  pool.addColorStop(0, 'rgba(255,200,110,.55)');
  pool.addColorStop(0.45, 'rgba(160,120,255,.2)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = pool;
  g.fillRect(0, 0, W, tlBot);
  // Hills and the castle behind the title
  g.fillStyle = '#0c1140';
  g.beginPath();
  g.moveTo(0, tlBot);
  for (let i = 0; i <= 20; i++) {
    const f = i / 20;
    g.lineTo(f * W, tlBot - tlBot * (0.2 + Math.sin(f * 7.3) * 0.05 + Math.sin(f * 2.2 + 1) * 0.06));
  }
  g.lineTo(W, tlBot);
  g.fill();
  drawCastle(g, W / 2, tlBot - tlBot * 0.16, tlBot / 300);
  // Knights either side, facing the castle
  drawKnight(g, W * 0.16, tlBot - 6 * k, tlBot / 260, 1, '#d1344b');
  drawKnight(g, W * 0.25, tlBot - 4 * k, tlBot / 300, 1, '#4b5fd1');
  drawKnight(g, W * 0.84, tlBot - 6 * k, tlBot / 260, -1, '#d1344b');
  drawKnight(g, W * 0.75, tlBot - 4 * k, tlBot / 300, -1, '#4b5fd1');
  // The trophy in front of the gate, the brightest thing on the glass
  drawTrophy(g, W / 2, tlBot - 8 * k, tlBot / 300, 1.3);
  // Title across the top, with the crest and the logo in the corners
  title(g, 'PEKKAS POKAL', W / 2, tlBot * 0.2, tlBot * 0.2, { spacing: 10 * k });
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(tlBot * 0.06)}px "Schibsted Grotesk", Inter, sans-serif`;
  g.letterSpacing = `${Math.round(16 * k)}px`;
  g.fillStyle = 'rgba(224,230,255,.9)';
  g.fillText('FLIPPER · 2025', W / 2, tlBot * 0.34);
  g.restore();
  drawCrest(g, W * 0.07, tlBot * 0.26, tlBot / 420);
  if (logo && logo.width) {
    const h = tlBot * 0.3;
    const w = (h * logo.width) / logo.height;
    g.save();
    g.shadowColor = 'rgba(242,193,78,.9)';
    g.shadowBlur = 24 * k;
    g.drawImage(logo, W * 0.93 - w / 2, tlBot * 0.1, w, h);
    g.restore();
  }
  // Frame line round the translite
  g.strokeStyle = 'rgba(242,193,78,.8)';
  g.lineWidth = 5 * k;
  g.strokeRect(10 * k, 10 * k, W - 20 * k, tlBot - 20 * k);

  /* ---- Speaker panel: printed black plastic with the castle's heraldry ---- */
  const panel = g.createLinearGradient(0, tlBot, 0, faceRows);
  panel.addColorStop(0, '#1b1530');
  panel.addColorStop(0.5, '#110d20');
  panel.addColorStop(1, '#07060f');
  g.fillStyle = panel;
  g.fillRect(0, tlBot, W, faceRows - tlBot);
  g.save();
  g.beginPath();
  g.rect(0, tlBot, W, faceRows - tlBot);
  g.clip();
  g.strokeStyle = 'rgba(242,193,78,.07)';
  g.lineWidth = 2 * k;
  const ph = faceRows - tlBot;
  for (let x = -ph; x < W + ph; x += 46 * k) {
    g.beginPath();
    g.moveTo(x, tlBot);
    g.lineTo(x - ph, faceRows);
    g.moveTo(x, tlBot);
    g.lineTo(x + ph, faceRows);
    g.stroke();
  }
  g.restore();
  g.fillStyle = 'rgba(242,193,78,.85)';
  g.fillRect(0, tlBot - 3 * k, W, 6 * k);

  // DMD well: the dark bezel the display sits back in, edged in gold
  const mx = (dmd.w / 2 + 0.28) * u;
  const my0 = Y(dy + dmd.h / 2 + 0.28);
  const my1 = Y(dy - dmd.h / 2 - 0.28);
  g.fillStyle = '#020203';
  g.beginPath();
  g.roundRect(W / 2 - mx, my0, mx * 2, my1 - my0, 18 * k);
  g.fill();
  g.strokeStyle = 'rgba(160,170,200,.4)';
  g.lineWidth = 4 * k;
  g.stroke();
  g.strokeStyle = 'rgba(242,193,78,.6)';
  g.lineWidth = 2 * k;
  g.beginPath();
  g.roundRect(W / 2 - mx - 9 * k, my0 - 9 * k, mx * 2 + 18 * k, my1 - my0 + 18 * k, 24 * k);
  g.stroke();

  // Speaker grilles: perforated steel (the chrome rings are real geometry)
  GRILLES.forEach(({ x, r: rr }, side) => {
    const cx = X(x);
    const cy = Y(dy);
    const r = rr * u;
    const steel = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    steel.addColorStop(0, '#2a2d3e');
    steel.addColorStop(1, '#0c0d16');
    g.fillStyle = steel;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#000';
    const step = 9 * k;
    for (let y = -r, row = 0; y <= r; y += step, row++) {
      for (let x2 = -r + (row % 2) * step * 0.5; x2 <= r; x2 += step) {
        if (x2 * x2 + y * y < (r - 6 * k) * (r - 6 * k)) {
          g.beginPath();
          g.arc(cx + x2, cy + y, 2.6 * k, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.strokeStyle = 'rgba(242,193,78,.85)';
    g.lineWidth = 3 * k;
    g.beginPath();
    g.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
    g.stroke();
    // Centre badge: crest left, trophy right
    if (side === 0) drawCrest(g, cx, cy - r * 0.04, r / 260);
    else drawTrophy(g, cx, cy + r * 0.3, r / 300, 0.5);
  });

  /* ---- Lit strip ---- */
  const sy = faceRows;
  const sh = stripRows;
  g.fillStyle = '#000';
  g.fillRect(0, sy, W, sh);
  // Price plate (left 512 px): warm backlit card, original wording
  {
    const pw = 512 * k;
    const grad = g.createLinearGradient(0, sy, 0, sy + sh / 2);
    grad.addColorStop(0, '#ffe2a6');
    grad.addColorStop(1, '#f4a948');
    g.fillStyle = grad;
    g.fillRect(0, sy, pw, sh / 2);
    g.fillStyle = '#3b1405';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${Math.round(40 * k)}px "Schibsted Grotesk", Inter, sans-serif`;
    g.letterSpacing = `${Math.round(3 * k)}px`;
    g.fillText('1 KRONA = 1 SPEL', pw / 2, sy + sh * 0.17);
    g.font = `600 ${Math.round(24 * k)}px "Schibsted Grotesk", Inter, sans-serif`;
    g.fillText('5 KRONOR = 6 SPEL', pw / 2, sy + sh * 0.37);
    g.letterSpacing = '0px';
    // Coin insert (lit slot surround), red, below the plate
    const ig = g.createLinearGradient(0, sy + sh / 2, 0, sy + sh);
    ig.addColorStop(0, '#ff7a5a');
    ig.addColorStop(1, '#b3241c');
    g.fillStyle = ig;
    g.fillRect(0, sy + sh / 2, pw, sh / 2);
    g.fillStyle = '#2a0503';
    g.fillRect(pw * 0.44, sy + sh * 0.6, pw * 0.12, sh * 0.3);
  }
  // Buttons: a domed face each (start, action, flipper), 128 px squares
  const dome = (x, c0, c1, label) => {
    const s = 128 * k;
    const cx = x + s / 2;
    const cy = sy + s / 2;
    const grad = g.createRadialGradient(cx - s * 0.15, cy - s * 0.18, s * 0.05, cx, cy, s * 0.5);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    g.fillStyle = grad;
    g.fillRect(x, sy, s, s);
    if (label) {
      g.fillStyle = 'rgba(40,20,0,.85)';
      g.font = `800 ${Math.round(24 * k)}px "Schibsted Grotesk", Inter, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, cx, cy + 2 * k);
    }
  };
  dome(512 * k, '#fff4c8', '#e0a52c', 'START');
  dome(640 * k, '#ffb0a0', '#c41c22', '');
  dome(768 * k, '#ffd2a8', '#e8582a', '');
  // Solid swatches for button skirts and inserts (64 px each)
  SWATCHES.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect((1024 + i * 64) * k, sy, 64 * k, sh);
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // UV helpers for the parts that share this texture
  const vOf = (row) => 1 - row / H;
  tex.userData = {
    faceV0: vOf(faceRows),
    plate: { u0: 0, u1: 512 / 2048, v0: vOf(sy + sh / 2), v1: vOf(sy) },
    insert: { u0: 0, u1: 512 / 2048, v0: vOf(sy + sh), v1: vOf(sy + sh / 2) },
    dome: (i) => ({ u0: (512 + i * 128) / 2048, u1: (640 + i * 128) / 2048, v0: vOf(sy + 128 * k), v1: vOf(sy) }),
    swatch: (i) => [(1024 + i * 64 + 32) / 2048, vOf(sy + sh / 2)]
  };
  return tex;
}

const SWATCHES = ['#d82a2a', '#f2c14e', '#ff8a3d', '#fff2d8', '#5ad08c', '#6f84ff'];
const SW = { red: 0, gold: 1, amber: 2, white: 3, green: 4, blue: 5 };
// Speaker grilles on the panel, in face units from its centre line
const GRILLES = [-1, 1].map((k) => {
  const room = FACE_W / 2 - CAB.dmd.w / 2;
  return { x: k * (CAB.dmd.w / 2 + room / 2), r: Math.min(room / 2 - 0.2, CAB.dmd.h / 2) };
});

/* -------------------------------------------------------- the cabinet */

/**
 * Builds the machine. Static parts go in `group` for bakeStatic; the parts
 * that move or are swapped are flagged `userData.keep` and returned in refs.
 */
export function buildCabinet(THREE, materials, logo, dmdMaterial, opts = {}) {
  const lite = !!opts.lite;
  const k = lite ? 0.5 : 1;
  const g = new THREE.Group();
  const refs = {};
  const { x0, x1, z1, hw, cx, topY, armourTop, dmd } = CAB;
  const xo0 = cx - hw;
  const xo1 = cx + hw;

  /* ---- Materials ---- */
  const AW = Math.round(2048 * k);
  const AH = Math.round(2304 * k);
  const [acv, ag] = canvas(AW, AH);
  const art = new THREE.CanvasTexture(acv);
  art.colorSpace = THREE.SRGBColorSpace;
  art.anisotropy = 4;
  // Printed art under a clear coat: lit by the room, a little self-lit so
  // it still reads in a dark arcade, and glossy enough to catch the strips
  const printed = new THREE.MeshStandardMaterial({
    map: art,
    emissiveMap: art,
    emissive: 0xffffff,
    emissiveIntensity: 0.26,
    roughness: 0.38,
    metalness: 0,
    envMapIntensity: 0.7
  });
  // Black powder-coat: legs, coin door, plunger housing
  const powder = new THREE.MeshStandardMaterial({
    color: 0x0d0f16,
    roughness: 0.42,
    metalness: 0.55,
    envMapIntensity: 0.8
  });
  const faceTex = faceTexture(THREE, logo, k);
  // A translite is a lamp. A touch over 1 so the brightest art clears the
  // bloom threshold and glows softly; the rest stays under it.
  const face = new THREE.MeshBasicMaterial({ map: faceTex, color: new THREE.Color(1.12, 1.12, 1.12) });
  const FT = faceTex.userData;
  refs.face = face;
  refs.printed = printed;
  refs.textures = [art, faceTex];
  refs.materials = [printed, powder, face];

  /* ---- Profiles (world z, y) ---- */
  const fb = roomPoint(CAB.legH, 0);
  const bb = roomPoint(CAB.legH, -CAB.bodyL);
  const faceLine = (y) => {
    // the backbox front (just behind the face plane) at height y
    const c = Math.cos(CAB.headTilt);
    const s = Math.sin(CAB.headTilt);
    const yl = (y + 0.08 * s) / c;
    return headPoint(yl, -0.08).z;
  };
  const notchTop = faceLine(topY);
  const notchBot = faceLine(0);
  const sideProf = [
    [CAB.frontZ, topY],
    [fb.z, fb.y],
    [bb.z, bb.y],
    [backZ(0), 0],
    [notchBot, 0],
    [notchTop, topY]
  ];
  const headTopY = headPoint(CAB.backH + 0.45, -0.08).y;
  const headProf = [
    [notchBot, 0],
    [backZ(0), 0],
    [backZ(headTopY), headTopY],
    [headPoint(CAB.backH + 0.45, -0.08).z, headTopY]
  ];

  /* ---- Art atlas ---- */
  // Rows: left side, right side, blade strip, then front + backbox sides
  const sideZ0 = Math.min(...sideProf.map((p) => p[0]));
  const sideZ1 = Math.max(...sideProf.map((p) => p[0]));
  const sideY0 = Math.min(...sideProf.map((p) => p[1]));
  const sideY1 = topY;
  const SIDE_H = 894 * k;
  const regions = {
    left: { x: 0, y: 0, w: AW, h: SIDE_H },
    right: { x: 0, y: SIDE_H, w: AW, h: SIDE_H },
    blade: { x: 0, y: SIDE_H * 2, w: AW, h: 128 * k },
    front: { x: 0, y: SIDE_H * 2 + 128 * k, w: 426 * k, h: 388 * k },
    headL: { x: 436 * k, y: SIDE_H * 2 + 128 * k, w: 380 * k, h: 388 * k },
    headR: { x: 826 * k, y: SIDE_H * 2 + 128 * k, w: 380 * k, h: 388 * k }
  };
  const uvIn = (r, fu, fv) => [(r.x + fu * r.w) / AW, 1 - (r.y + fv * r.h) / AH];
  const sideUV = (front) => (z, y) => {
    const fu = (z - sideZ0) / (sideZ1 - sideZ0);
    const fv = (sideY1 - y) / (sideY1 - sideY0);
    return uvIn(front > 0 ? regions.left : regions.right, front > 0 ? fu : 1 - fu, fv);
  };
  {
    const toPx = (r, front) => sideProf.map(([z, y]) => {
      const fu = (z - sideZ0) / (sideZ1 - sideZ0);
      const fv = (sideY1 - y) / (sideY1 - sideY0);
      return [r.x + (front > 0 ? fu : 1 - fu) * r.w, r.y + fv * r.h];
    });
    const R = regions;
    const pl = toPx(R.left, 1);
    const pr = toPx(R.right, -1);
    // The clip runs CCW in canvas space for the stripe inset either way
    drawSide(ag, R.left.x, R.left.y, R.left.w, R.left.h, pl, 1, k);
    drawSide(ag, R.right.x, R.right.y, R.right.w, R.right.h, pr, -1, k);
    drawBlade(ag, R.blade.x, R.blade.y, R.blade.w, R.blade.h, k);
    drawFront(ag, R.front.x, R.front.y, R.front.w, R.front.h, k);
    drawHeadSide(ag, R.headL.x, R.headL.y, R.headL.w, R.headL.h, 1, k);
    drawHeadSide(ag, R.headR.x, R.headR.y, R.headR.w, R.headR.h, -1, k);
  }

  const add = (geo, mat, { cast = false, keep = false } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    if (keep) m.userData.keep = true;
    g.add(m);
    return m;
  };

  /* ---- Body ---- */
  // Side slabs, edges rounded, the outer face a printed panel
  add(profilePrism(THREE, sideProf, xo0, x0, { caps: false }), materials.cabinet);
  add(profilePrism(THREE, sideProf, x1, xo1, { caps: false }), materials.cabinet);
  const sideArtProf = insetPolygon(sideProf.map(([z, y]) => [-z, y]), 0.3).map(([s, y]) => [-s, y]);
  add(profilePanel(THREE, sideArtProf, xo0 + 0.0, -1, sideUV(1)), printed);
  add(profilePanel(THREE, sideArtProf, xo1 - 0.0, 1, sideUV(-1)), printed);
  // Inner caps in paint (seen only inside the backbox well)
  // Core: the box under the playfield, between the slabs
  const coreFrontZ = (y) => CAB.frontZ + (topY - y) * TAN - 0.9;
  const coreProf = [
    [coreFrontZ(-0.5), -0.5],
    [coreFrontZ(fb.y + 0.2), fb.y + 0.2],
    [bb.z + 0.1, bb.y + 0.2],
    [backZ(-0.06), -0.06],
    [z1 - 0.3, -0.06],
    [z1 - 0.3, -0.5]
  ];
  add(profilePrism(THREE, coreProf, x0 - 0.02, x1 + 0.02, { bevel: 0 }), materials.cabinet);
  // Front panel between the slabs: paint on five faces, print on the front
  {
    const h = CAB.frontH - CAB.legH;
    const frontGroup = new THREE.Group();
    const ft = roomPoint(CAB.frontH, 0);
    frontGroup.position.set(cx, ft.y, ft.z);
    frontGroup.rotation.x = -CAB.slope;
    g.add(frontGroup);
    refs.frontGroup = frontGroup;
    const box = new THREE.BoxGeometry(x1 - x0, h, 0.9);
    const shell = keepGroups(THREE, box, [0, 1, 2, 3, 5]);
    shell.translate(0, -h / 2, -0.45);
    const shellMesh = new THREE.Mesh(shell, materials.cabinet);
    frontGroup.add(shellMesh);
    const plane = remapUV(new THREE.PlaneGeometry(x1 - x0, h), (u, v) => uvIn(regions.front, u, 1 - v));
    plane.translate(0, -h / 2, 0);
    frontGroup.add(new THREE.Mesh(plane, printed));

    /* Coin door: powder-coated door in a chrome frame, two coin mechs
       with lit inserts, a lit price plate, a lock and return buttons */
    const door = new THREE.Group();
    door.position.set(0, -3.2, 0);
    frontGroup.add(door);
    const dw = 10.4;
    const dh = 12;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.7, dh + 0.7, 0.18), materials.armour);
    frame.position.set(0, -dh / 2, 0.09);
    door.add(frame);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.36), powder);
    slab.position.set(0, -dh / 2, 0.2);
    door.add(slab);
    // Raised panel lines on the door
    const rib = new THREE.Mesh(new THREE.BoxGeometry(dw - 1.6, 0.12, 0.12), materials.armour);
    rib.position.set(0, -dh + 1.4, 0.42);
    door.add(rib);
    const plate = remapUV(new THREE.PlaneGeometry(6.4, 1.6), (u, v) => [
      FT.plate.u0 + u * (FT.plate.u1 - FT.plate.u0),
      FT.plate.v0 + v * (FT.plate.v1 - FT.plate.v0)
    ]);
    plate.translate(0, -1.55, 0.4);
    door.add(new THREE.Mesh(plate, face));
    const plateRim = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.0, 0.08), materials.armour);
    plateRim.position.set(0, -1.55, 0.36);
    door.add(plateRim);
    [-2.2, 2.2].forEach((mx) => {
      const mech = new THREE.Mesh(new THREE.BoxGeometry(3.0, 4.4, 0.2), materials.armour);
      mech.position.set(mx, -5.4, 0.46);
      door.add(mech);
      const ins = remapUV(new THREE.PlaneGeometry(1.7, 2.3), (u, v) => [
        FT.insert.u0 + u * (FT.insert.u1 - FT.insert.u0),
        FT.insert.v0 + v * (FT.insert.v1 - FT.insert.v0)
      ]);
      ins.translate(mx, -4.9, 0.57);
      door.add(new THREE.Mesh(ins, face));
      const ret = buttonGeo(THREE, 0.42, 0.25, FT.swatch(SW.red), null, 10);
      ret.rotateX(Math.PI / 2);
      ret.translate(mx, -7.0, 0.56);
      door.add(new THREE.Mesh(ret, face));
    });
    const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14), materials.armour);
    lock.rotation.x = Math.PI / 2;
    lock.position.set(3.9, -9.4, 0.5);
    door.add(lock);

    /* Start button, top left of the front, lit gold */
    const start = buttonGeo(THREE, 0.8, 0.5, FT.swatch(SW.gold), FT.dome(0), 18);
    start.rotateX(Math.PI / 2);
    start.translate(-8.2, -2.4, 0.25);
    frontGroup.add(new THREE.Mesh(start, face));
    const startRing = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.16, 8, 22), materials.armour);
    startRing.position.set(-8.2, -2.4, 0.06);
    frontGroup.add(startRing);

    /* Plunger housing: chrome escutcheon on a powder-coat plate */
    const py = -(topY - 0.55) / COS;
    const px = L.laneBallX - cx;
    const hplate = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 0.2), powder);
    hplate.position.set(px, py, 0.1);
    frontGroup.add(hplate);
    const esc = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.35, 24), materials.armour);
    esc.rotation.x = Math.PI / 2;
    esc.position.set(px, py, 0.32);
    frontGroup.add(esc);
  }

  /* ---- Plunger rod: moves with the launch power (index.js drives it) ---- */
  {
    const rodGeo = new THREE.CylinderGeometry(0.2, 0.2, 4.2, 12).rotateX(Math.PI / 2).translate(0, 0, 0.6);
    const knob = new THREE.SphereGeometry(0.62, 16, 12).scale(1, 1, 0.8).translate(0, 0, 2.95);
    const collar = new THREE.CylinderGeometry(0.42, 0.42, 0.5, 14).rotateX(Math.PI / 2).translate(0, 0, 2.2);
    const geo = mergeSimple(THREE, [rodGeo, collar, knob]);
    const rod = new THREE.Mesh(geo, materials.armour);
    const y = 0.55;
    rod.position.set(L.laneBallX, y, CAB.frontZ + (topY - y) * TAN);
    rod.userData.keep = true;
    rod.userData.home = rod.position.z;
    g.add(rod);
    refs.plungerRod = rod;
  }

  /* ---- Blades: printed inner walls along the playfield ---- */
  [
    [x0, x0 + 0.5],
    [x1 - 0.5, x1]
  ].forEach(([a, b]) => {
    const len = CAB.z0 - z1;
    const geo = remapUV(new THREE.BoxGeometry(b - a, topY + 0.1, len), (u, v) => uvIn(regions.blade, u, 1 - v));
    geo.translate((a + b) / 2, (topY + 0.1) / 2 - 0.05, (CAB.z0 + z1) / 2);
    add(geo, printed);
  });

  /* ---- Side armour and the lockdown bar ---- */
  {
    const armour = [];
    const rail = (xa, xb) => {
      const s = new THREE.Shape();
      const w = xb - xa;
      const h = armourTop - topY;
      s.moveTo(0, 0);
      s.lineTo(w, 0);
      s.lineTo(w, h - 0.5);
      s.quadraticCurveTo(w, h, w - 0.5, h);
      s.lineTo(0.5, h);
      s.quadraticCurveTo(0, h, 0, h - 0.5);
      s.closePath();
      const len = CAB.frontZ - 0.4 - notchTop;
      const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 4 });
      geo.translate(xa, topY, notchTop);
      return geo;
    };
    armour.push(rail(x0 - 1.9, x0 + 0.55));
    armour.push(rail(x1 - 0.55, x1 + 1.9));
    // Lockdown bar: rounded front, full width, the action button on top
    const s = new THREE.Shape();
    const d = 2.7;
    const h = armourTop - topY;
    s.moveTo(0, 0);
    s.lineTo(d, 0);
    s.lineTo(d, h - 0.7);
    s.quadraticCurveTo(d, h, d - 0.7, h);
    s.lineTo(0.3, h);
    s.quadraticCurveTo(0, h, 0, h - 0.3);
    s.closePath();
    const bar = new THREE.ExtrudeGeometry(s, { depth: hw * 2 + 0.3, bevelEnabled: false, curveSegments: 6 });
    // Shape (s=z, t=y), extruded along x
    bar.rotateY(-Math.PI / 2);
    bar.scale(-1, 1, 1);
    bar.translate(xo0 - 0.15, topY, CAB.frontZ + 0.35 - d);
    flipWinding(bar);
    armour.push(bar);
    // Corner protectors where the bar meets the sides, and at the back
    [xo0 - 0.08, xo1 + 0.08].forEach((xx) => {
      armour.push(new THREE.BoxGeometry(0.16, 2.6, 3.2).translate(xx, topY - 1.3, CAB.frontZ - 1.6));
      armour.push(new THREE.BoxGeometry(0.16, 2.6, 2.6).translate(xx, -0.3 - 1.3 + 0.9, backZ(0) + 1.3));
    });
    const mesh = add(mergeSimple(THREE, armour), materials.armour, { cast: true });
    mesh.receiveShadow = false;
    // Action button on the bar, and its chrome bezel
    const fire = buttonGeo(THREE, 0.62, 0.42, FT.swatch(SW.red), FT.dome(1), 18);
    fire.translate(cx, armourTop, CAB.frontZ - 1.0);
    add(fire, face);
    const ring = new THREE.TorusGeometry(0.78, 0.14, 8, 22).rotateX(Math.PI / 2).translate(cx, armourTop + 0.04, CAB.frontZ - 1.0);
    add(ring, materials.armour);
    // Flipper buttons, one on each side near the front
    [-1, 1].forEach((side) => {
      const xx = side < 0 ? xo0 : xo1;
      const btn = buttonGeo(THREE, 0.72, 0.65, FT.swatch(SW.red), FT.dome(2), 18);
      btn.rotateZ(-side * Math.PI / 2);
      btn.translate(xx, topY - 2.4, CAB.frontZ - 4.2);
      add(btn, face);
      const bz = new THREE.TorusGeometry(0.92, 0.17, 8, 22).rotateY(Math.PI / 2).translate(xx + side * 0.08, topY - 2.4, CAB.frontZ - 4.2);
      add(bz, materials.armour);
    });
  }

  /* ---- Legs: powder-coat, chrome plates and bolts, levellers ---- */
  {
    const legs = [];
    const chrome = [];
    const half = 1.35;
    const legTop = CAB.legH + 6.5;
    const legBot = 1.7;
    const place = (geo, rx, rh, rd) => {
      const m = new THREE.Matrix4().makeRotationX(-CAB.slope);
      const p = roomPoint(rh, rd);
      m.setPosition(rx, p.y, p.z);
      return geo.applyMatrix4(m);
    };
    [
      [xo0 + half - 0.14, -half + 0.14],
      [xo1 - half + 0.14, -half + 0.14],
      [xo0 + half - 0.14, -CAB.bodyL + half - 0.14],
      [xo1 - half + 0.14, -CAB.bodyL + half - 0.14]
    ].forEach(([rx, rd], i) => {
      const side = rx < cx ? -1 : 1;
      const h = legTop - legBot;
      // A square leg tapering toward the floor (4-sided cylinder, turned 45°)
      const leg = new THREE.CylinderGeometry(half * Math.SQRT2, (half - 0.32) * Math.SQRT2, h, 4, 1);
      leg.rotateY(Math.PI / 4);
      leg.computeVertexNormals();
      legs.push(place(leg.translate(0, 0, 0), rx, legBot + h / 2, rd));
      // Chrome leg plate on the outer face, two bolts through it
      const plate = new THREE.BoxGeometry(0.1, 5.4, 2.3);
      chrome.push(place(plate, rx + side * (half + 0.06), CAB.legH + 3.4, rd));
      [CAB.legH + 1.9, CAB.legH + 4.9].forEach((bh) => {
        const bolt = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 6).rotateZ(Math.PI / 2);
        chrome.push(place(bolt, rx + side * (half + 0.2), bh, rd));
      });
      // Front bolt on the front legs
      if (i < 2) {
        const bolt = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 6).rotateX(Math.PI / 2);
        chrome.push(place(bolt, rx, CAB.legH + 3.4, rd + half + 0.12));
      }
      // Leveller: threaded stem, hex nut, a foot
      chrome.push(place(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 10), rx, 1.1, rd));
      chrome.push(place(new THREE.CylinderGeometry(0.62, 0.62, 0.4, 6), rx, 1.55, rd));
      legs.push(place(new THREE.CylinderGeometry(0.95, 1.1, 0.5, 16), rx, 0.25, rd));
    });
    add(mergeSimple(THREE, legs), powder);
    add(mergeSimple(THREE, chrome), materials.armour);
  }

  /* ---- Backbox: a real box, the face recessed in a chrome frame ---- */
  {
    add(profilePrism(THREE, headProf, xo0, xo1, { bevel: 0.35, caps: false }), materials.cabinet);
    const headArt = insetPolygon(headProf.map(([z, y]) => [-z, y]), 0.35).map(([s, y]) => [-s, y]);
    const hz0 = Math.min(...headProf.map((p) => p[0]));
    const hz1 = Math.max(...headProf.map((p) => p[0]));
    const headUV = (front) => (z, y) => {
      const fu = (z - hz0) / (hz1 - hz0);
      const fv = (headTopY - y) / headTopY;
      return uvIn(front > 0 ? regions.headL : regions.headR, front > 0 ? fu : 1 - fu, fv);
    };
    add(profilePanel(THREE, headArt, xo0, -1, headUV(1)), printed);
    add(profilePanel(THREE, headArt, xo1, 1, headUV(-1)), printed);

    const head = new THREE.Group();
    head.position.set(cx, 0, z1 + 0.4);
    head.rotation.x = -CAB.headTilt;
    g.add(head);

    const facePlane = remapUV(new THREE.PlaneGeometry(FACE_W, FACE_H), (u, v) => [u, FT.faceV0 + v * (1 - FT.faceV0)]);
    const glass = new THREE.Mesh(facePlane, face);
    glass.position.set(0, CAB.backH / 2, 0.02);
    head.add(glass);
    refs.backglass = glass;

    if (dmdMaterial) {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(dmd.w, dmd.h), dmdMaterial);
      screen.position.set(0, dmd.y, 0.06);
      head.add(screen);
      refs.dmd = screen;
    }

    // Chrome frame round the face, and the rail between translite and panel
    const trim = [];
    const fw = hw * 2;
    const t = 0.55;
    const panelTop = dmd.y + dmd.h / 2 + 0.55;
    trim.push(new THREE.BoxGeometry(fw, t, 0.4).translate(0, CAB.backH + 0.1, 0.12));
    trim.push(new THREE.BoxGeometry(fw, t, 0.4).translate(0, 0.12, 0.12));
    trim.push(new THREE.BoxGeometry(t, CAB.backH + 0.5, 0.4).translate(-hw + t / 2, CAB.backH / 2 + 0.1, 0.12));
    trim.push(new THREE.BoxGeometry(t, CAB.backH + 0.5, 0.4).translate(hw - t / 2, CAB.backH / 2 + 0.1, 0.12));
    trim.push(new THREE.BoxGeometry(fw - 1, 0.28, 0.3).translate(0, panelTop, 0.1));
    // Speaker rings: the grilles' chrome surrounds
    GRILLES.forEach(({ x, r }) => {
      trim.push(new THREE.TorusGeometry(r + 0.05, 0.16, 8, 32).translate(x, dmd.y, 0.14));
    });
    head.updateMatrixWorld(true);
    trim.forEach((geo) => geo.applyMatrix4(head.matrix));
    // Hinges at the bottom back of the head, a lock on the back
    [xo0 - 0.1, xo1 + 0.1].forEach((xx) => {
      trim.push(new THREE.BoxGeometry(0.2, 3.2, 2.0).translate(xx, 0.4, backZ(0) + 1.4));
      trim.push(new THREE.CylinderGeometry(0.38, 0.38, 0.5, 12).rotateZ(Math.PI / 2).translate(xx + Math.sign(xx - cx) * 0.2, 0.4, backZ(0) + 1.4));
    });
    trim.push(new THREE.CylinderGeometry(0.4, 0.4, 0.4, 14).rotateX(Math.PI / 2).translate(cx, headTopY * 0.7, backZ(headTopY * 0.7) - 0.15));
    // Corner caps on the head's top corners
    [xo0, xo1].forEach((xx) => {
      trim.push(new THREE.BoxGeometry(1.2, 0.18, 1.6).translate(xx - Math.sign(xx - cx) * 0.5, headTopY + 0.05, backZ(headTopY) + 0.8));
    });
    add(mergeSimple(THREE, trim), materials.armour);

    // The head throws light down the upper playfield
    const lamp = new THREE.PointLight(0xffd39a, 70, 44, 2);
    lamp.position.set(0, 3.2, 2.6);
    head.add(lamp);
    refs.headLamp = lamp;
  }

  return { group: g, refs };
}

/** Merges position/normal/uv of geometries (indexed or not) into one */
function mergeSimple(THREE, geos) {
  const parts = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  const out = new THREE.BufferGeometry();
  ['position', 'normal', 'uv'].forEach((name) => {
    const size = name === 'uv' ? 2 : 3;
    const total = parts.reduce((s, p) => s + p.attributes.position.count, 0);
    const arr = new Float32Array(total * size);
    let o = 0;
    parts.forEach((p) => {
      const a = p.attributes[name];
      if (a) arr.set(a.array.subarray(0, p.attributes.position.count * size), o);
      o += p.attributes.position.count * size;
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  });
  parts.forEach((p, i) => {
    if (p !== geos[i]) p.dispose();
    geos[i].dispose();
  });
  return out;
}

/** Reverses triangle winding after a mirroring scale */
function flipWinding(geo) {
  if (geo.index) {
    const a = geo.index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
  } else {
    ['position', 'normal', 'uv'].forEach((name) => {
      const attr = geo.attributes[name];
      if (!attr) return;
      const s = attr.itemSize;
      const arr = attr.array;
      for (let i = 0; i < attr.count; i += 3) {
        for (let c = 0; c < s; c++) {
          const t = arr[(i + 1) * s + c];
          arr[(i + 1) * s + c] = arr[(i + 2) * s + c];
          arr[(i + 2) * s + c] = t;
        }
      }
    });
  }
  geo.computeVertexNormals();
}

/**
 * A round push button along +y: a skirt in one swatch colour and a domed
 * face mapped onto a square of the lit strip (or the same swatch).
 */
function buttonGeo(THREE, r, h, swatch, domeRect, seg) {
  const skirt = new THREE.CylinderGeometry(r, r * 1.04, h, seg, 1, true).translate(0, h / 2, 0);
  remapUV(skirt, () => swatch);
  const top = new THREE.SphereGeometry(r, seg, 6, 0, Math.PI * 2, 0, Math.PI * 0.32);
  const lift = Math.cos(Math.PI * 0.32) * r;
  top.translate(0, h - lift, 0);
  const p = top.attributes.position;
  const uv = top.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (domeRect) {
      const fu = 0.5 + p.getX(i) / (2 * r);
      const fv = 0.5 - p.getZ(i) / (2 * r);
      uv.setXY(i, domeRect.u0 + fu * (domeRect.u1 - domeRect.u0), domeRect.v1 + fv * (domeRect.v0 - domeRect.v1));
    } else uv.setXY(i, swatch[0], swatch[1]);
  }
  return mergeSimple(THREE, [skirt, top]);
}

/* ---------------------------------------------------------------- glass */

/**
 * What the glass mirrors: a dark arcade with its warm practicals and neon
 * near the horizon and nothing overhead. Seen from the play camera the glass
 * reflects the (black) ceiling and vanishes; from a low showcase angle it
 * picks up the room's lights, which is what sells it as glass.
 */
function glassEnvTexture(THREE) {
  const W = 512;
  const H = 256;
  const [cv, g] = canvas(W, H);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const blob = (u, v, ru, rv, c) => {
    g.save();
    g.translate(u * W, v * H);
    g.scale(1, rv / ru);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, ru * W);
    grad.addColorStop(0, c);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(-ru * W, -ru * W, ru * W * 2, ru * W * 2);
    g.restore();
  };
  // Horizon band (v ≈ 0.4–0.5): sconces, neon, the neighbours' translites
  for (let i = 0; i < 8; i++) blob(i / 8 + 0.06, 0.43, 0.05, 0.035, 'rgba(255,190,120,.85)');
  blob(0.25, 0.4, 0.09, 0.03, 'rgba(255,90,190,.7)');
  blob(0.75, 0.4, 0.09, 0.03, 'rgba(90,230,255,.6)');
  // Faint strips higher up, nothing past ~50° of elevation
  g.fillStyle = 'rgba(200,215,255,.22)';
  g.fillRect(0, H * 0.3, W, 3);
  g.fillRect(0, H * 0.34, W, 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/**
 * The playfield glass.
 *
 * Two layers. The streaks: narrow additive bars of the ceiling fixtures,
 * view-independent and cheap, which read as glass from the play camera. And
 * the sheet: one quad over the opening that mirrors the room (above), which
 * only shows at a low angle — the showcase — and is hidden on phones while
 * playing, where it would cost a full-table blend for nothing.
 */
export function buildGlass(THREE) {
  const W = 64;
  const H = 256;
  const [cv, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const along = Math.pow(Math.sin(Math.PI * ((y + 0.5) / H)), 0.55);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W - 0.5;
      const across = Math.exp(-(u * u) / 0.022);
      const i = (y * W + x) * 4;
      img.data[i] = 214;
      img.data[i + 1] = 228;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(along * across * 255);
    }
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const cx = CAB.cx;
  const cz = (CAB.z0 + CAB.z1) / 2;

  // Two reflections of the ceiling fixtures, faint, merged into one mesh;
  // vertex colour carries each bar's strength (additive: rgb is the amount)
  const bars = [
    { w: 2.4, l: 34, x: -4.2, z: 0, rot: 0.11, a: 0.17 },
    { w: 1.6, l: 26, x: 4.4, z: -6, rot: -0.08, a: 0.12 },
    // a thin edge glint along the back of the glass
    { w: 0.5, l: (CAB.x1 - CAB.x0) - 1.4, x: 0, z: -(CAB.z0 - CAB.z1) / 2 + 1.2, rot: Math.PI / 2, a: 0.1 }
  ];
  const geos = bars.map((b) => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.scale(b.w, b.l, 1);
    geo.rotateZ(b.rot);
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx + b.x, CAB.glassY, cz + b.z);
    const c = new Float32Array(geo.attributes.position.count * 3).fill(b.a);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return geo;
  });
  const streakGeo = mergeColour(THREE, geos);
  const streaks = new THREE.Mesh(
    streakGeo,
    new THREE.MeshBasicMaterial({
      map: tex,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    })
  );
  streaks.renderOrder = 5;
  group.add(streaks);

  const env = glassEnvTexture(THREE);
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(CAB.x1 - CAB.x0 - 1, CAB.z0 - CAB.z1 - 0.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      envMap: env,
      combine: THREE.AddOperation,
      reflectivity: 0.55,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    })
  );
  sheet.position.set(cx, CAB.glassY + 0.02, cz - 0.2);
  sheet.renderOrder = 5;
  group.add(sheet);
  group.userData.sheet = sheet;
  group.userData.textures = [tex, env];
  return group;
}

function mergeColour(THREE, geos) {
  const parts = geos.map((g) => g.toNonIndexed());
  const out = new THREE.BufferGeometry();
  ['position', 'normal', 'uv', 'color'].forEach((name) => {
    const size = parts[0].attributes[name].itemSize;
    const total = parts.reduce((s, p) => s + p.attributes[name].count, 0);
    const arr = new Float32Array(total * size);
    let o = 0;
    parts.forEach((p) => {
      arr.set(p.attributes[name].array, o);
      o += p.attributes[name].array.length;
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  });
  parts.forEach((p) => p.dispose());
  geos.forEach((g) => g.dispose());
  return out;
}
