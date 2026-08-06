/**
 * Pekkas Pokal — table layout.
 *
 * One source of truth: the same numbers build the physics colliders and the
 * 3D geometry, so what you see is exactly what the ball hits.
 *
 * Playfield coordinates: +y runs up the table, the drain is at y = 0.
 * The shooter lane is on the right, feeding a habitrail around the top dome.
 */

import { segment, circle, chain, arc, Flipper } from './physics.js';

const D = Math.PI / 180;

export const L = {
  // Outer bounds
  outerX: 9,
  domeY: 31,
  domeOuterR: 9,
  // Inner radius and divider leave a 1.8 channel — comfortably wider than the
  // 1.24 ball. Any narrower and the ball wedges in the shooter lane.
  domeInnerR: 6.6,

  // Shooter lane
  laneX: 6.6,
  laneBallX: 7.8,
  laneBottomY: 2,
  laneWallR: 0.3,

  // Playfield proper spans -9 .. 6.6
  centerX: -1.2,

  ballRadius: 0.62,

  // Flippers
  flipperY: 7,
  flipperSpread: 3.7,
  flipperLength: 3.0,
  flipperRest: -30 * D,
  flipperSwing: 62 * D,

  // Slingshots (kicking face, outer → inner)
  slingTopY: 12.4,
  slingBotY: 8.4,

  // Bumpers
  bumperR: 1.25,

  wallH: 1.5
};

L.bumpers = [
  { x: L.centerX - 3.3, y: 26.4 },
  { x: L.centerX + 3.3, y: 26.4 },
  { x: L.centerX, y: 29.0, trophy: true }
];

// P-O-K-A-L drop target bank, with an open orbit lane either side
L.targets = ['P', 'O', 'K', 'A', 'L'].map((letter, i) => ({
  letter,
  x: L.centerX - 4.5 + i * 2.25,
  y: 19,
  half: 0.62
}));

L.jackpot = { x: L.centerX, y: 32.9, r: 1.05 };

L.posts = [
  { x: L.centerX - 3.4, y: 17.0, r: 0.34 },
  { x: L.centerX + 3.4, y: 17.0, r: 0.34 },
  { x: L.centerX, y: 23.2, r: 0.3 },
  { x: L.centerX - 5.2, y: 22.6, r: 0.3 },
  { x: L.centerX + 5.2, y: 22.6, r: 0.3 }
];

/* ------------------------------------------------------------ wall polylines */

const mirrorX = (x) => 2 * L.centerX - x;

// Left outer wall down into the outlane and drain funnel
L.leftWall = [
  [-L.outerX, L.domeY],
  [-L.outerX, 9],
  [-7.8, 4.2],
  [-3.3, -1.4]
];

L.rightWall = [
  [L.laneX, L.domeY],
  [L.laneX, 9],
  [mirrorX(-7.8), 4.2],
  [mirrorX(-3.3), -1.4]
];

// Slingshot faces — the ball is kicked along the face normal, toward centre
L.leftSling = [
  [-7.6, L.slingTopY],
  [-5.0, L.slingBotY]
];
L.rightSling = [
  [mirrorX(-7.6), L.slingTopY],
  [mirrorX(-5.0), L.slingBotY]
];

// Inlane/outlane dividers, guiding returns onto the flippers
L.leftGuide = [
  [-5.0, L.slingBotY],
  [-5.5, 5.2]
];
L.rightGuide = [
  [mirrorX(-5.0), L.slingBotY],
  [mirrorX(-5.5), 5.2]
];

/* ------------------------------------------------------------------ colliders */

/**
 * Builds every collider and flipper into `world`.
 * `hooks` receives gameplay events: onBumper, onSling, onTarget, onJackpot,
 * onWall, onOrbit.
 */
export function buildColliders(world, hooks = {}) {
  const refs = { targets: [], bumpers: [], flippers: {}, orbitGates: [] };
  const wallOpts = { radius: 0.3, restitution: 0.4, friction: 0.05 };
  const hitWall = (v) => hooks.onWall && hooks.onWall(v);

  // Outer shell
  world.add(chain(L.leftWall, { ...wallOpts, onHit: hitWall }));
  world.add(chain(L.rightWall, { ...wallOpts, onHit: hitWall }));

  // Shooter lane: divider up to the dome, then the inner habitrail arc
  world.add(segment(L.laneX, L.laneBottomY, L.laneX, L.domeY, wallOpts));
  world.add(arc(0, L.domeY, L.domeInnerR, 0, 130 * D, 22, wallOpts));

  // Outer dome
  world.add(arc(0, L.domeY, L.domeOuterR, 0, 180 * D, 34, { ...wallOpts, onHit: hitWall }));
  world.add(segment(L.outerX, L.laneBottomY, L.outerX, L.domeY, wallOpts));

  // Shooter lane floor
  world.add(
    segment(L.laneX, L.laneBottomY, L.outerX, L.laneBottomY, { ...wallOpts, restitution: 0.15 })
  );

  // Slingshots — strong kick, awards points
  const slingOpts = (side) => ({
    radius: 0.32,
    restitution: 0.62,
    kick: 13,
    onHit: (v) => hooks.onSling && hooks.onSling(side, v)
  });
  world.add(chain(L.leftSling, slingOpts('left')));
  world.add(chain(L.rightSling, slingOpts('right')));

  // Return guides
  world.add(chain(L.leftGuide, wallOpts));
  world.add(chain(L.rightGuide, wallOpts));

  // Pop bumpers
  L.bumpers.forEach((b, i) => {
    const c = circle(b.x, b.y, L.bumperR, {
      restitution: 0.52,
      kick: 17,
      id: `bumper${i}`,
      onHit: (v) => hooks.onBumper && hooks.onBumper(i, v)
    });
    world.add(c);
    refs.bumpers.push(c);
  });

  // P-O-K-A-L drop targets
  L.targets.forEach((t, i) => {
    const c = segment(t.x - t.half, t.y, t.x + t.half, t.y, {
      radius: 0.26,
      restitution: 0.34,
      id: `target${i}`,
      onHit: (v) => hooks.onTarget && hooks.onTarget(i, v)
    });
    world.add(c);
    refs.targets.push(c);
  });

  // Jackpot trophy
  const jack = circle(L.jackpot.x, L.jackpot.y, L.jackpot.r, {
    restitution: 0.55,
    kick: 8,
    id: 'jackpot',
    onHit: (v) => hooks.onJackpot && hooks.onJackpot(v)
  });
  world.add(jack);
  refs.jackpot = jack;

  // Decorative posts
  L.posts.forEach((p) => {
    world.add(circle(p.x, p.y, p.r, { restitution: 0.55, onHit: hitWall }));
  });

  // Flippers
  const lp = L.centerX - L.flipperSpread;
  const rp = L.centerX + L.flipperSpread;
  refs.flippers.left = world.addFlipper(
    new Flipper(lp, L.flipperY, L.flipperLength, L.flipperRest, L.flipperRest + L.flipperSwing, {
      radius: 0.4,
      onHit: (v) => hooks.onFlipper && hooks.onFlipper('left', v)
    })
  );
  refs.flippers.right = world.addFlipper(
    new Flipper(
      rp,
      L.flipperY,
      L.flipperLength,
      Math.PI - L.flipperRest,
      Math.PI - L.flipperRest - L.flipperSwing,
      {
        radius: 0.4,
        onHit: (v) => hooks.onFlipper && hooks.onFlipper('right', v)
      }
    )
  );

  return refs;
}

/* ------------------------------------------------------- playfield artwork */

const TEX_W = 1024;
const TEX_H = 2048;
// Region of playfield space the texture covers
const ART = { x0: -L.outerX - 0.6, x1: L.outerX + 0.6, y0: -2, y1: 42 };

const toU = (x) => ((x - ART.x0) / (ART.x1 - ART.x0)) * TEX_W;
const toV = (y) => TEX_H - ((y - ART.y0) / (ART.y1 - ART.y0)) * TEX_H;

/**
 * Draws the playfield art to a canvas. Doing this procedurally keeps the game
 * asset-free while still looking designed rather than bare.
 */
export function createPlayfieldCanvas(participants = [], logo = null) {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const g = cv.getContext('2d');

  const GOLD = '#f2c14e';
  const GOLD_DIM = 'rgba(242,193,78,.32)';
  // Everything on the playfield lines up on its centre line; only the dome
  // decoration follows the dome, which sits on the table's centre instead.
  const cx = L.centerX;
  const unitsX = (u) => (u / (ART.x1 - ART.x0)) * TEX_W;
  const unitsY = (u) => (u / (ART.y1 - ART.y0)) * TEX_H;

  /* ---- Base ---- */
  const base = g.createLinearGradient(0, 0, 0, TEX_H);
  base.addColorStop(0, '#131931');
  base.addColorStop(0.45, '#0d1124');
  base.addColorStop(1, '#161c38');
  g.fillStyle = base;
  g.fillRect(0, 0, TEX_W, TEX_H);

  const pool = (x, y, r, color) => {
    const grad = g.createRadialGradient(toU(x), toV(y), 10, toU(x), toV(y), r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, TEX_W, TEX_H);
  };
  pool(cx, 28, 430, 'rgba(124,140,248,.20)');
  pool(cx, 13.2, 400, 'rgba(242,193,78,.13)');
  pool(cx, 7, 300, 'rgba(242,193,78,.10)');

  /* ---- Dome arcs (centred on the dome, not the playfield) ---- */
  g.strokeStyle = GOLD_DIM;
  g.lineWidth = 2;
  for (let r = 3.2; r <= 8.4; r += 1.3) {
    g.beginPath();
    g.ellipse(toU(0), toV(L.domeY), unitsX(r), unitsY(r), 0, Math.PI, 2 * Math.PI);
    g.stroke();
  }

  /* ---- Orbit lanes either side of the target bank ---- */
  g.strokeStyle = 'rgba(124,140,248,.28)';
  g.lineWidth = 5;
  [-7.6, L.laneX - 1.2].forEach((x) => {
    g.beginPath();
    g.moveTo(toU(x), toV(13.5));
    g.lineTo(toU(x), toV(24.5));
    g.stroke();
  });

  /* ---- Jackpot, high enough that the trophy doesn't cover it ---- */
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = GOLD;
  g.font = '700 26px "Space Grotesk", Inter, sans-serif';
  g.letterSpacing = '8px';
  g.shadowColor = 'rgba(242,193,78,.6)';
  g.shadowBlur = 18;
  g.fillText('JACKPOT', toU(cx), toV(36.2));
  g.shadowBlur = 0;
  g.letterSpacing = '0px';

  g.strokeStyle = GOLD;
  g.lineWidth = 4;
  g.setLineDash([14, 10]);
  g.beginPath();
  g.ellipse(toU(L.jackpot.x), toV(L.jackpot.y), unitsX(2.05), unitsY(2.05), 0, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);

  /* ---- Target bank ---- */
  g.fillStyle = 'rgba(255,255,255,.34)';
  g.font = '700 23px Inter, sans-serif';
  g.letterSpacing = '6px';
  g.fillText('SLÅ NER ALLA FEM', toU(cx), toV(21.3));
  g.letterSpacing = '0px';

  // A letter under each target so the bank reads as P-O-K-A-L on the table
  g.font = '700 34px "Space Grotesk", Inter, sans-serif';
  L.targets.forEach((t) => {
    g.fillStyle = 'rgba(242,193,78,.5)';
    g.fillText(t.letter, toU(t.x), toV(17.5));
  });

  /* ---- Hero logo, centred in the lower playfield ---- */
  if (logo && logo.width) {
    const w = 7.8;
    const h = (w * logo.height) / logo.width;
    const px = toU(cx - w / 2);
    const py = toV(13.2 + h / 2);
    g.save();
    g.globalAlpha = 0.34;
    g.shadowColor = 'rgba(242,193,78,.85)';
    g.shadowBlur = 34;
    g.drawImage(logo, px, py, unitsX(w), unitsY(h));
    g.shadowBlur = 0;
    g.globalAlpha = 0.9;
    g.drawImage(logo, px, py, unitsX(w), unitsY(h));
    g.restore();
  } else {
    g.fillStyle = GOLD;
    g.font = '700 54px "Space Grotesk", Inter, sans-serif';
    g.fillText('PEKKAS POKAL', toU(cx), toV(13.6));
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.font = '600 22px Inter, sans-serif';
    g.letterSpacing = '8px';
    g.fillText('FLIPPER · 2025', toU(cx), toV(12.2));
    g.letterSpacing = '0px';
  }

  /* ---- Inlane arrows pointing at the flippers ---- */
  g.fillStyle = 'rgba(242,193,78,.30)';
  [-1, 1].forEach((s) => {
    const ax = cx + s * 4.3;
    for (let i = 0; i < 3; i++) {
      const y = 11.4 - i * 1.25;
      g.beginPath();
      g.moveTo(toU(ax - 0.55), toV(y));
      g.lineTo(toU(ax + 0.55), toV(y));
      g.lineTo(toU(ax), toV(y - 0.72));
      g.closePath();
      g.fill();
    }
  });

  /* ---- Roll of honour down the left rail ---- */
  if (participants.length) {
    g.save();
    g.fillStyle = 'rgba(255,255,255,.15)';
    g.font = '600 18px Inter, sans-serif';
    g.textAlign = 'left';
    participants.slice(0, 13).forEach((name, i) => {
      g.fillText(name.toUpperCase(), toU(-8.78), toV(25.2 - i * 0.92));
    });
    g.restore();
    g.textAlign = 'center';
  }

  /* ---- Shooter lane ---- */
  g.fillStyle = 'rgba(242,193,78,.09)';
  g.fillRect(toU(L.laneX), toV(L.domeY), toU(L.outerX) - toU(L.laneX), toV(2) - toV(L.domeY));

  g.save();
  g.translate(toU((L.laneX + L.outerX) / 2), toV(16));
  g.rotate(-Math.PI / 2);
  g.fillStyle = 'rgba(242,193,78,.5)';
  g.font = '700 24px Inter, sans-serif';
  g.letterSpacing = '8px';
  g.fillText('DRA OCH SLÄPP', 0, 8);
  g.restore();

  /* ---- Drain ---- */
  g.fillStyle = 'rgba(242,109,141,.35)';
  g.font = '700 21px Inter, sans-serif';
  g.letterSpacing = '5px';
  g.fillText('UTGÅNG', toU(cx), toV(1.1));
  g.letterSpacing = '0px';

  /* ---- Grain. Built on its own canvas and composited with drawImage:
     putImageData REPLACES pixels and would erase everything above. ---- */
  const gc = document.createElement('canvas');
  gc.width = 128;
  gc.height = 128;
  const gg = gc.getContext('2d');
  const grain = gg.createImageData(128, 128);
  for (let i = 0; i < grain.data.length; i += 4) {
    grain.data[i] = 255;
    grain.data[i + 1] = 255;
    grain.data[i + 2] = 255;
    grain.data[i + 3] = Math.random() * 26;
  }
  gg.putImageData(grain, 0, 0);
  g.save();
  g.globalAlpha = 0.45;
  for (let y = 0; y < TEX_H; y += 128) {
    for (let x = 0; x < TEX_W; x += 128) g.drawImage(gc, x, y);
  }
  g.restore();

  return { canvas: cv, art: ART };
}

export { ART, mirrorX, D };
