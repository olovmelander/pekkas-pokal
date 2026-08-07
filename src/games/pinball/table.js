/**
 * Pekkas Pokal — table layout.
 *
 * One source of truth: the same numbers build the physics colliders and the
 * 3D geometry, so what you see is exactly what the ball hits.
 *
 * Playfield coordinates: +y runs up the table, the drain is at y = 0.
 * The shooter lane is on the right, feeding a habitrail around the top dome.
 *
 * Anatomy, bottom to top: flippers with real inlanes and OUTLANES (the ball
 * can drain past the flippers on both sides), slingshot triangles, two angled
 * P-O-K / A-L target banks framing an open corridor, and at the top the
 * CASTLE: towers, bashable gate and the trophy in the courtyard. Two wireform
 * ramps carry the ball in 3D across the table.
 */

import { segment, circle, chain, arc, Flipper } from './physics.js';

const D = Math.PI / 180;

export const L = {
  // Outer bounds
  outerX: 9,
  domeY: 31,
  domeOuterR: 9,
  // Inner radius and divider leave a 1.8 channel — comfortably wider than the
  // ball. Any narrower and the ball wedges in the shooter lane.
  domeInnerR: 6.6,
  // The left wall flares out below the dome to make room for the ramp lane
  // beside the left orbit.
  flareX: 10.0,

  // Shooter lane
  laneX: 6.6,
  laneBallX: 7.8,
  laneBottomY: 2,
  laneWallR: 0.3,

  // Playfield proper spans -9 .. 6.6
  centerX: -1.2,

  ballRadius: 0.54,

  // Flippers
  flipperY: 7,
  // Spread sets the centre drain gap. With the 0.46 flipper radius the tips
  // must stay far enough apart that a ball falls cleanly between them
  // instead of perching on both: 2.44 apart, 1.52 clear, ball is 1.08.
  flipperSpread: 3.95,
  flipperLength: 3.15,
  flipperRest: -30 * D,
  flipperSwing: 62 * D,

  bumperR: 1.25,

  wallH: 1.7
};

function mirrorXRaw(x) {
  return 2 * L.centerX - x;
}
const mirrorX = mirrorXRaw;

// Pop bumper nest: two flanking the castle corridor and a third in the
// upper-left pocket where orbit returns and castle rejects pour through —
// a nest with mutual rebounds keeps the action alive (rubber, not steel).
L.bumpers = [
  { x: -4.4, y: 23.8 },
  { x: 2.0, y: 23.8 },
  { x: -5.9, y: 25.6 }
];

/**
 * P-O-K-A-L drop targets, split into two angled banks either side of the
 * castle corridor: P-O-K climbs up the left, A-L mirrors on the right.
 * `a` is the bank angle in playfield radians.
 */
const bankA = Math.atan2(3.6, 3.2); // ~48°
L.targets = [
  { letter: 'P', x: -5.37, y: 14.8, half: 0.55, a: bankA },
  { letter: 'O', x: -4.3, y: 16.0, half: 0.55, a: bankA },
  { letter: 'K', x: -3.23, y: 17.2, half: 0.55, a: bankA },
  { letter: 'A', x: 1.8, y: 17.13, half: 0.55, a: -bankA },
  { letter: 'L', x: 3.0, y: 15.78, half: 0.55, a: -bankA }
];

/* ------------------------------------------------------------------- castle */

L.castle = {
  // Gate the ball bashes open (a collider while closed)
  gate: [-2.45, 28.45, 0.05, 28.45],
  towers: [
    { x: -2.95, y: 28.5, r: 0.62 },
    { x: 0.55, y: 28.5, r: 0.62 }
  ],
  // Battlement walls running out from the towers
  leftWall: [
    [-5.2, 26.4],
    [-3.7, 28.15],
    [-2.55, 28.55]
  ],
  rightWall: [
    [0.15, 28.55],
    [1.3, 28.15],
    [2.8, 26.4]
  ]
};

// The trophy stands in the castle courtyard, behind the gate
L.jackpot = { x: L.centerX, y: 30.4, r: 1.0 };

// Locked balls are parked in the courtyard corners, visible through the
// gate but clear of the trophy's collision reach — a released ball must not
// collect a jackpot it never earned.
L.lockSlots = [
  { x: -2.5, y: 29.1 },
  { x: 0.3, y: 29.1 }
];

/* ------------------------------------------------------------------- ramps */

/**
 * Wireform ramps. A ball crossing the capture sensor fast enough is lifted
 * out of the 2D simulation and carried along `path` ([x, y, height] in
 * playfield coordinates), then dropped back in at the far end. Left ramp
 * feeds the right inlane and vice versa, Medieval Madness style.
 */
L.ramps = {
  left: {
    capture: [-7.6, 18.0, -5.95, 18.0],
    minVy: 5.0,
    exit: { x: 3.73, y: 12.2, vx: -1.2, vy: -7 },
    path: [
      [-6.75, 18.0, 0.4],
      [-7.15, 22.2, 1.5],
      [-6.5, 26.6, 2.6],
      [-4.5, 30.4, 3.4],
      [-1.5, 32.5, 3.9],
      [1.6, 31.7, 3.7],
      [3.9, 27.8, 2.9],
      [4.9, 21.5, 1.9],
      [4.6, 15.5, 1.0],
      [3.73, 12.4, 0.55]
    ]
  },
  right: {
    capture: [4.3, 25.5, 6.4, 25.5],
    minVy: 5.5,
    exit: { x: -6.2, y: 11.8, vx: 1.2, vy: -7 },
    path: [
      [5.5, 25.5, 0.5],
      [5.9, 29.0, 2.0],
      [4.6, 32.6, 3.3],
      [1.5, 34.6, 4.1],
      [-2.0, 34.9, 4.3],
      [-5.2, 33.4, 3.8],
      [-7.6, 29.5, 2.8],
      [-8.5, 24.0, 1.9],
      [-8.2, 17.0, 1.1],
      [-7.2, 13.4, 0.7],
      [-6.2, 11.6, 0.5]
    ]
  }
};

/* ------------------------------------------------------------ wall polylines */

// Left outer wall: flares out below the dome for the ramp lane, straightens
// for the outlane, then funnels into the drain.
L.leftWall = [
  [-L.outerX, L.domeY],
  [-L.flareX, 27.5],
  [-L.flareX, 13.2],
  [-L.outerX, 10.8],
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

/**
 * Left lane divider: separates the left ORBIT (outside, hugging the wall)
 * from the open playfield inside. There is deliberately no second wall — the
 * left ramp is entered through a wide open mouth in front of the pop nest,
 * the way Medieval Madness' left ramp is. The old caged ramp lane left only
 * 0.13 units of clearance around the ball and jammed.
 */
L.leftDivider = [
  [-7.9, 15.2],
  [-7.9, 23.5]
];

/**
 * One-way return gates at the bottom of each orbit: a FAST-falling ball (an
 * orbit return) rides the wire down into the inlane, while ascending shots
 * and slow dribbles swing straight through — dribbles then take their
 * chances with the outlane, exactly like a real flap. Nothing can rest on
 * the wire, because a resting ball no longer matches the speed filter.
 */
L.leftReturnGate = [
  [-9.65, 14.4],
  [-8.5, 13.4],
  [-7.4, 12.85],
  [-6.6, 12.5]
];
L.rightReturnGate = [
  [6.55, 14.4],
  [5.7, 13.4],
  [4.6, 12.85],
  [4.2, 12.5]
];

/**
 * Inlane/outlane guide rails: the long arm walls off the outlane, the hook at
 * the bottom curls around and drops the ball onto the flipper heel. Outside
 * the rail the outlane runs straight into the drain — a real side exit.
 */
L.leftRail = [
  [-7.08, 12.55],
  [-7.08, 8.9],
  [-6.2, 8.45],
  // The rail ends flush beside the flipper pivot, slightly BELOW it, so the
  // flipper's own cap stands proud of the rail. An exposed rail cap is a
  // perch — a ball balancing on one touches no moving surface, so flipping
  // does nothing and the table feels dead. Ending here means every ball that
  // reaches the heel is sitting on the flipper itself.
  [L.centerX - L.flipperSpread - 0.05, L.flipperY + 0.05]
];
L.rightRail = L.leftRail.map(([x, y]) => [mirrorX(x), y]);

/**
 * Slingshot triangles: T top, BO bottom-outer, BI bottom-inner.
 * T→BI is the kicker face; the other two edges are plain walls.
 */
L.leftSlingPts = { T: [-4.95, 11.7], BO: [-4.72, 9.45], BI: [-3.75, 9.0] };
L.rightSlingPts = {
  T: [mirrorX(-4.95), 11.7],
  BO: [mirrorX(-4.72), 9.45],
  BI: [mirrorX(-3.75), 9.0]
};
// Kept as simple 2-point faces for the mesh flash lookup
L.leftSling = [L.leftSlingPts.T, L.leftSlingPts.BI];
L.rightSling = [L.rightSlingPts.T, L.rightSlingPts.BI];

// Rubber posts protecting bank ends and the ramp-lane mouth
L.posts = [
  { x: -5.85, y: 14.2, r: 0.28 },
  { x: -2.75, y: 17.9, r: 0.28 },
  { x: 1.25, y: 17.9, r: 0.28 },
  { x: 3.45, y: 14.6, r: 0.28 },
  { x: -5.4, y: 19.6, r: 0.28 }
];

/**
 * Spinner in the left orbit. A ball passing through spins the blade; each
 * revolution scores. Iconic on Williams tables and the most satisfying
 * sound on any playfield.
 */
L.spinner = { x: -8.95, y: 21.0, half: 0.82 };

/**
 * Trolls: two pop-up beasts that rise out of the castle corridor. While up
 * they block the castle shot and can be bashed down for points — the signature
 * Medieval Madness toy.
 */
L.trolls = [
  { x: -3.15, y: 21.4, r: 0.62 },
  { x: 0.75, y: 21.4, r: 0.62 }
];

// Scoring switches: invisible sensors the ball rolls through.
L.sensors = {
  leftOrbit: [-9.85, 18, -8.05, 18],
  spinner: [L.spinner.x - L.spinner.half, L.spinner.y, L.spinner.x + L.spinner.half, L.spinner.y],
  rightOrbit: [4.6, 27.2, 6.5, 27.2],
  leftRamp: L.ramps.left.capture,
  rightRamp: L.ramps.right.capture,
  inlaneLeft: [-6.9, 10.2, -5.4, 10.2],
  inlaneRight: [mirrorXRaw(-5.4), 10.2, mirrorXRaw(-6.9), 10.2],
  outLeft: [-8.85, 9.2, -7.35, 9.2],
  outRight: [mirrorXRaw(-7.35), 9.2, mirrorXRaw(-8.85), 9.2]
};

/* ------------------------------------------------------------------ colliders */

/**
 * Builds every collider and flipper into `world`.
 * `hooks` receives gameplay events: onBumper, onSling, onTarget, onJackpot,
 * onGate, onWall, onSensor, onFlipper.
 */
export function buildColliders(world, hooks = {}) {
  const refs = { targets: [], bumpers: [], flippers: {} };
  const wallOpts = { radius: 0.3, restitution: 0.4, friction: 0.05 };
  const railOpts = { radius: 0.22, restitution: 0.42, friction: 0.04 };
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

  // Orbit divider
  world.add(chain(L.leftDivider, railOpts));

  // Inlane/outlane guide rails (the hook returns)
  world.add(chain(L.leftRail, railOpts));
  world.add(chain(L.rightRail, railOpts));

  // One-way orbit return gates: solid only for fast-falling balls. Once the
  // wire catches a ball it keeps carrying it (rideGate) until the tip drops
  // it into the inlane — without the hysteresis the first impact would kill
  // the fall speed and release the ball mid-wire, over the outlane.
  const gateFilter = (b) => {
    if (b.vy < -10) {
      b.rideGate = true;
      return true;
    }
    if (b.rideGate && b.vy <= 1 && b.y > 12.2) return true;
    b.rideGate = false;
    return false;
  };
  const downOnly = { radius: 0.24, restitution: 0.16, friction: 0.1, filter: gateFilter };
  world.add(chain(L.leftReturnGate, downOnly));
  world.add(chain(L.rightReturnGate, downOnly));

  // Slingshots: kicker face plus two plain edges
  const slingOpts = (side) => ({
    radius: 0.28,
    restitution: 0.62,
    kick: 15,
    kickMin: 2.5,
    onHit: (v, ball) => hooks.onSling && hooks.onSling(side, v, ball)
  });
  [['left', L.leftSlingPts], ['right', L.rightSlingPts]].forEach(([side, P]) => {
    world.add(segment(P.T[0], P.T[1], P.BI[0], P.BI[1], slingOpts(side)));
    world.add(segment(P.T[0], P.T[1], P.BO[0], P.BO[1], { ...railOpts, radius: 0.28 }));
    world.add(segment(P.BO[0], P.BO[1], P.BI[0], P.BI[1], { ...railOpts, radius: 0.28 }));
  });

  // Pop bumpers — hot: a real pop fires on the lightest skirt touch and
  // throws the ball hard enough to ricochet around the nest
  L.bumpers.forEach((b, i) => {
    const c = circle(b.x, b.y, L.bumperR, {
      restitution: 0.6,
      kick: 22,
      id: `bumper${i}`,
      onHit: (v, ball) => hooks.onBumper && hooks.onBumper(i, v, ball)
    });
    world.add(c);
    refs.bumpers.push(c);
  });

  // P-O-K / A-L drop targets (angled banks)
  L.targets.forEach((t, i) => {
    const dx = Math.cos(t.a) * t.half;
    const dy = Math.sin(t.a) * t.half;
    const c = segment(t.x - dx, t.y - dy, t.x + dx, t.y + dy, {
      radius: 0.26,
      restitution: 0.34,
      id: `target${i}`,
      onHit: (v) => hooks.onTarget && hooks.onTarget(i, v)
    });
    world.add(c);
    refs.targets.push(c);
  });

  // Castle: battlement walls, towers, bashable gate, trophy in the courtyard
  world.add(chain(L.castle.leftWall, wallOpts));
  world.add(chain(L.castle.rightWall, wallOpts));
  L.castle.towers.forEach((t) => {
    world.add(circle(t.x, t.y, t.r, { restitution: 0.5, onHit: hitWall }));
  });
  const [gax, gay, gbx, gby] = L.castle.gate;
  refs.gate = world.add(
    segment(gax, gay, gbx, gby, {
      radius: 0.3,
      restitution: 0.45,
      id: 'gate',
      onHit: (v, b) => hooks.onGate && hooks.onGate(v, b)
    })
  );

  // Trolls — start retracted below the playfield
  refs.trolls = L.trolls.map((t, i) => {
    const c = circle(t.x, t.y, t.r, {
      restitution: 0.5,
      kick: 6,
      id: `troll${i}`,
      onHit: (v, b) => hooks.onTroll && hooks.onTroll(i, v, b)
    });
    c.enabled = false;
    world.add(c);
    return c;
  });

  const jack = circle(L.jackpot.x, L.jackpot.y, L.jackpot.r, {
    restitution: 0.55,
    kick: 8,
    id: 'jackpot',
    onHit: (v, b) => hooks.onJackpot && hooks.onJackpot(v, b)
  });
  world.add(jack);
  refs.jackpot = jack;

  // Rubber posts
  L.posts.forEach((p) => {
    world.add(circle(p.x, p.y, p.r, { restitution: 0.55, onHit: hitWall }));
  });

  // Scoring switches (sensors). The game layer debounces them.
  refs.sensors = {};
  Object.entries(L.sensors).forEach(([id, [ax, ay, bx, by]]) => {
    refs.sensors[id] = world.add(
      segment(ax, ay, bx, by, {
        radius: 0.3,
        sensor: true,
        id,
        onHit: (v, b) => hooks.onSensor && hooks.onSensor(id, v, b)
      })
    );
  });

  // Flippers
  const lp = L.centerX - L.flipperSpread;
  const rp = L.centerX + L.flipperSpread;
  refs.flippers.left = world.addFlipper(
    new Flipper(lp, L.flipperY, L.flipperLength, L.flipperRest, L.flipperRest + L.flipperSwing, {
      radius: 0.46,
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
        radius: 0.46,
        onHit: (v) => hooks.onFlipper && hooks.onFlipper('right', v)
      }
    )
  );

  return refs;
}

/* ------------------------------------------------------- playfield artwork */

const TEX_W = 1024;
const TEX_H = 2048;
// Region of playfield space the texture covers (wider on the left for the flare)
const ART = { x0: -L.flareX - 0.7, x1: L.outerX + 0.6, y0: -2, y1: 42 };

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
  pool(cx, 29, 430, 'rgba(124,140,248,.20)');
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

  /* ---- Castle forecourt: cobblestone half-rings before the gate ---- */
  g.strokeStyle = 'rgba(180,190,220,.16)';
  g.lineWidth = 3;
  for (let r = 1.6; r <= 4.6; r += 0.75) {
    g.beginPath();
    g.ellipse(toU(cx), toV(28.4), unitsX(r), unitsY(r), 0, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
  g.fillStyle = 'rgba(220,228,255,.5)';
  g.font = '700 24px "Space Grotesk", Inter, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '7px';
  g.shadowColor = 'rgba(124,140,248,.7)';
  g.shadowBlur = 14;
  g.fillText('BORGEN', toU(cx), toV(25.0));
  g.shadowBlur = 0;
  g.letterSpacing = '0px';

  /* ---- Troll pits in the corridor ---- */
  L.trolls.forEach((tr) => {
    g.save();
    g.strokeStyle = 'rgba(111,155,90,.55)';
    g.lineWidth = 4;
    g.setLineDash([9, 7]);
    g.beginPath();
    g.ellipse(toU(tr.x), toV(tr.y), unitsX(tr.r * 1.5), unitsY(tr.r * 1.5), 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.restore();
  });
  g.fillStyle = 'rgba(111,155,90,.5)';
  g.font = '700 17px Inter, sans-serif';
  g.letterSpacing = '4px';
  g.fillText('TROLL', toU(L.trolls[0].x), toV(L.trolls[0].y - 1.35));
  g.fillText('TROLL', toU(L.trolls[1].x), toV(L.trolls[1].y - 1.35));
  g.letterSpacing = '0px';

  /* ---- Castle corridor arrows ---- */
  g.fillStyle = 'rgba(124,140,248,.35)';
  for (let i = 0; i < 3; i++) {
    const y = 19.6 + i * 1.6;
    g.beginPath();
    g.moveTo(toU(cx - 0.6), toV(y));
    g.lineTo(toU(cx + 0.6), toV(y));
    g.lineTo(toU(cx), toV(y + 0.85));
    g.closePath();
    g.fill();
  }

  /* ---- Orbit + ramp lane guides ---- */
  g.strokeStyle = 'rgba(124,140,248,.28)';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(toU(-8.65), toV(13.5));
  g.lineTo(toU(-8.65), toV(24.5));
  g.stroke();
  g.beginPath();
  g.moveTo(toU(5.55), toV(13.5));
  g.lineTo(toU(5.55), toV(25.5));
  g.stroke();
  // Ramp lane arrows (gold, pointing up)
  g.fillStyle = 'rgba(242,193,78,.4)';
  [[-6.9, 16.2], [-6.9, 18.4], [-6.9, 20.6]].forEach(([x, y]) => {
    g.beginPath();
    g.moveTo(toU(x - 0.45), toV(y));
    g.lineTo(toU(x + 0.45), toV(y));
    g.lineTo(toU(x), toV(y + 0.8));
    g.closePath();
    g.fill();
  });
  g.save();
  g.translate(toU(-8.95), toV(17.0));
  g.rotate(-Math.PI / 2);
  g.fillStyle = 'rgba(124,140,248,.5)';
  g.font = '700 20px Inter, sans-serif';
  g.letterSpacing = '6px';
  g.fillText('ORBIT · SNURRA', 0, 0);
  g.restore();

  // Ramp mouth: a wide gold funnel painted on the playfield
  g.save();
  g.strokeStyle = 'rgba(242,193,78,.5)';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(toU(-7.55), toV(13.4));
  g.lineTo(toU(-7.2), toV(18.4));
  g.moveTo(toU(-5.4), toV(13.8));
  g.lineTo(toU(-6.15), toV(18.4));
  g.stroke();
  g.restore();
  g.save();
  g.translate(toU(-6.6), toV(16.2));
  g.rotate(-Math.PI / 2);
  g.fillStyle = 'rgba(242,193,78,.62)';
  g.font = '700 22px Inter, sans-serif';
  g.letterSpacing = '7px';
  g.fillText('RAMP', 0, 0);
  g.restore();
  g.save();
  g.translate(toU(5.55), toV(20.2));
  g.rotate(Math.PI / 2);
  g.fillStyle = 'rgba(124,140,248,.5)';
  g.font = '700 20px Inter, sans-serif';
  g.letterSpacing = '6px';
  g.fillText('ORBIT · RAMP', 0, -14);
  g.restore();

  /* ---- Target banks: a letter in front of each target's face ---- */
  g.font = '700 30px "Space Grotesk", Inter, sans-serif';
  L.targets.forEach((t) => {
    const off = 1.05;
    const lx = t.x + Math.sin(t.a) * off;
    const ly = t.y - Math.cos(t.a) * off;
    g.fillStyle = 'rgba(242,193,78,.55)';
    g.fillText(t.letter, toU(lx), toV(ly));
  });
  g.fillStyle = 'rgba(255,255,255,.3)';
  g.font = '700 19px Inter, sans-serif';
  g.letterSpacing = '4px';
  g.save();
  g.translate(toU(-4.9), toV(13.4));
  g.rotate(-bankA * 0.9);
  g.fillText('SLÅ NER ALLA FEM', 0, 0);
  g.restore();
  g.letterSpacing = '0px';

  /* ---- Hero logo, centred in the lower playfield ---- */
  if (logo && logo.width) {
    const w = 6.6;
    const h = (w * logo.height) / logo.width;
    const px = toU(cx - w / 2);
    const py = toV(11.9 + h / 2);
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
    g.fillText('PEKKAS POKAL', toU(cx), toV(12.6));
  }

  /* ---- Inlane / outlane labels ---- */
  g.fillStyle = 'rgba(242,193,78,.30)';
  [[-6.15, 'in'], [3.75, 'in']].forEach(([ax]) => {
    for (let i = 0; i < 2; i++) {
      const y = 11.6 - i * 1.2;
      g.beginPath();
      g.moveTo(toU(ax - 0.45), toV(y));
      g.lineTo(toU(ax + 0.45), toV(y));
      g.lineTo(toU(ax), toV(y - 0.65));
      g.closePath();
      g.fill();
    }
  });
  g.fillStyle = 'rgba(242,109,141,.5)';
  g.font = '700 19px Inter, sans-serif';
  g.letterSpacing = '3px';
  g.fillText('UT', toU(-8.05), toV(10.6));
  g.fillText('UT', toU(mirrorX(-8.05)), toV(10.6));
  g.letterSpacing = '0px';

  /* ---- Roll of honour down the left rail ---- */
  if (participants.length) {
    g.save();
    g.fillStyle = 'rgba(255,255,255,.15)';
    g.font = '600 17px Inter, sans-serif';
    g.textAlign = 'left';
    participants.slice(0, 13).forEach((name, i) => {
      g.fillText(name.toUpperCase(), toU(-9.55), toV(26.3 - i * 0.92));
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
