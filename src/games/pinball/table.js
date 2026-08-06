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
  { x: L.centerX, y: 29.0 }
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
  { x: L.centerX - 3.4, y: 14.6, r: 0.34 },
  { x: L.centerX + 3.4, y: 14.6, r: 0.34 },
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
export function createPlayfieldCanvas(participants = []) {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const g = cv.getContext('2d');

  const GOLD = '#f2c14e';
  const GOLD_DIM = 'rgba(242,193,78,.35)';

  // Base
  const base = g.createLinearGradient(0, 0, 0, TEX_H);
  base.addColorStop(0, '#141a33');
  base.addColorStop(0.45, '#0e1226');
  base.addColorStop(1, '#171d3a');
  g.fillStyle = base;
  g.fillRect(0, 0, TEX_W, TEX_H);

  // Vignette glow behind the bumpers
  const glow = g.createRadialGradient(toU(-0.9), toV(28), 20, toU(-0.9), toV(28), 420);
  glow.addColorStop(0, 'rgba(124,140,248,.20)');
  glow.addColorStop(1, 'rgba(124,140,248,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, TEX_W, TEX_H);

  const glow2 = g.createRadialGradient(toU(-0.9), toV(8), 20, toU(-0.9), toV(8), 380);
  glow2.addColorStop(0, 'rgba(242,193,78,.16)');
  glow2.addColorStop(1, 'rgba(242,193,78,0)');
  g.fillStyle = glow2;
  g.fillRect(0, 0, TEX_W, TEX_H);

  // Concentric arcs echoing the dome
  g.strokeStyle = GOLD_DIM;
  g.lineWidth = 2;
  for (let r = 3; r <= 8.4; r += 1.35) {
    g.beginPath();
    const rx = (r / (ART.x1 - ART.x0)) * TEX_W;
    const ry = (r / (ART.y1 - ART.y0)) * TEX_H;
    g.ellipse(toU(0), toV(L.domeY), rx, ry, 0, Math.PI, 2 * Math.PI);
    g.stroke();
  }

  // Orbit lane guides beside the target bank
  g.strokeStyle = 'rgba(124,140,248,.30)';
  g.lineWidth = 5;
  [[-7.6, 12, -7.6, 24], [L.laneX - 1.2, 12, L.laneX - 1.2, 24]].forEach(([x0, y0, x1, y1]) => {
    g.beginPath();
    g.moveTo(toU(x0), toV(y0));
    g.lineTo(toU(x1), toV(y1));
    g.stroke();
  });

  // Inlane arrows pointing at the flippers
  g.fillStyle = 'rgba(242,193,78,.30)';
  [-1, 1].forEach((s) => {
    const cx = L.centerX + s * 4.3;
    for (let i = 0; i < 3; i++) {
      const y = 11.5 - i * 1.3;
      g.beginPath();
      g.moveTo(toU(cx - 0.55), toV(y));
      g.lineTo(toU(cx + 0.55), toV(y));
      g.lineTo(toU(cx), toV(y - 0.75));
      g.closePath();
      g.fill();
    }
  });

  // Title arc across the top
  g.save();
  g.translate(toU(0), toV(L.domeY + 4.7));
  g.fillStyle = GOLD;
  g.font = '700 42px "Space Grotesk", Inter, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(242,193,78,.6)';
  g.shadowBlur = 20;
  g.fillText('PEKKAS POKAL', 0, 0);
  g.shadowBlur = 0;
  g.font = '600 22px Inter, sans-serif';
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.letterSpacing = '8px';
  g.fillText('FLIPPER · 2025', 0, 38);
  g.restore();

  // Target bank label
  g.fillStyle = 'rgba(255,255,255,.32)';
  g.font = '700 26px Inter, sans-serif';
  g.textAlign = 'center';
  g.letterSpacing = '6px';
  g.fillText('SLÅ NER ALLA FEM', toU(L.centerX), toV(21.4));
  g.letterSpacing = '0px';

  // Jackpot ring
  g.strokeStyle = GOLD;
  g.lineWidth = 4;
  g.setLineDash([14, 10]);
  g.beginPath();
  g.ellipse(
    toU(L.jackpot.x),
    toV(L.jackpot.y),
    (2.1 / (ART.x1 - ART.x0)) * TEX_W,
    (2.1 / (ART.y1 - ART.y0)) * TEX_H,
    0,
    0,
    Math.PI * 2
  );
  g.stroke();
  g.setLineDash([]);

  // Roll of honour down the left edge — the people this table is about
  if (participants.length) {
    g.save();
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.font = '600 19px Inter, sans-serif';
    g.textAlign = 'left';
    participants.slice(0, 13).forEach((name, i) => {
      g.fillText(name.toUpperCase(), toU(-8.75), toV(24.5 - i * 0.92));
    });
    g.restore();
  }

  // Shooter lane stripe
  g.fillStyle = 'rgba(242,193,78,.10)';
  g.fillRect(toU(L.laneX), toV(L.domeY), toU(L.outerX) - toU(L.laneX), toV(2) - toV(L.domeY));

  g.save();
  g.translate(toU((L.laneX + L.outerX) / 2), toV(16));
  g.rotate(-Math.PI / 2);
  g.fillStyle = 'rgba(242,193,78,.5)';
  g.font = '700 26px Inter, sans-serif';
  g.textAlign = 'center';
  g.letterSpacing = '8px';
  g.fillText('DRA OCH SLÄPP', 0, 8);
  g.restore();

  // Drain warning
  g.fillStyle = 'rgba(242,109,141,.35)';
  g.font = '700 22px Inter, sans-serif';
  g.textAlign = 'center';
  g.letterSpacing = '5px';
  g.fillText('UTGÅNG', toU(L.centerX), toV(1.2));

  // Subtle grain so large flat areas aren't dead. Built on its own canvas and
  // drawn with drawImage — putImageData REPLACES pixels rather than compositing,
  // which would erase everything above.
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
  g.globalAlpha = 0.5;
  for (let y = 0; y < TEX_H; y += 128) {
    for (let x = 0; x < TEX_W; x += 128) g.drawImage(gc, x, y);
  }
  g.restore();

  return { canvas: cv, art: ART };
}

export { ART, mirrorX, D };
