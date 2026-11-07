/**
 * Pure rules for the two party events in Pekkas Parkmästare (2014):
 * beer pong and flip cup. The world uses metres; z decreases away from the
 * player, as in the other field events.
 */
import { clamp, chargePower } from '../pentathlon/rules.js';

/* ------------------------------------------------------------ beer pong */

export const PONG = {
  balls: 10,
  // A painted folding table, 2.4 m long. Cups are about 1.45 × a real party
  // cup so the rack reads on a phone; the ball is scaled with them.
  tableNear: 6.35, tableFar: 3.95, tableHalfWidth: 0.45, tableTop: 0.76,
  cupRim: 0.07, cupBase: 0.048, cupHeight: 0.165, ball: 0.028,
  release: { y: 1.42, z: 6.62 },
  // Power 0..1 maps to 1.75–2.95 m of reach from the release point.
  minReach: 1.75, reachSpan: 1.2,
  // Arrow-key aim (±4.4, shared with the other events) maps to ±0.33 m.
  aimScale: 0.075,
  // The meter climbs a little slower than the lawn throws: the cups are small.
  chargeRate: 0.8,
  // The ball's centre inside this radius drops in; up to rim + ball it hits the rim.
  sinkRadius: 0.06
};
PONG.rimHeight = PONG.tableTop + PONG.cupHeight;

/** Six cups in a 3-2-1 triangle with the point towards the thrower. */
export function rackCups() {
  const spacing = 2 * PONG.cupRim + 0.004, row = spacing * Math.sin(Math.PI / 3);
  const back = PONG.tableFar + 0.06 + PONG.cupRim;
  const cups = [];
  [[3, 0], [2, 1], [1, 2]].forEach(([count, r]) => {
    for (let i = 0; i < count; i++) cups.push({ x: (i - (count - 1) / 2) * spacing, z: back + r * row, live: true });
  });
  return cups;
}

export const pongPower = (seconds) => chargePower(seconds * PONG.chargeRate);

/** Where the ball comes down to rim height for an aim and a power. */
export function pongLanding(aim, power) {
  return {
    x: clamp(aim, -4.4, 4.4) * PONG.aimScale,
    z: PONG.release.z - (PONG.minReach + clamp(power, 0, 1) * PONG.reachSpan)
  };
}

/** The power that lands on a cup's centre, and the aim that lines up with it. */
export const pongIdealPower = (cup) => clamp((PONG.release.z - cup.z - PONG.minReach) / PONG.reachSpan, 0, 1);
export const pongAimFor = (cup) => clamp(cup.x / PONG.aimScale, -4.4, 4.4);

/** 'sink' in a live cup, 'rim' off its edge, else 'table' or 'off' the table. */
export function pongJudge(landing, cups) {
  let cup = null, distance = Infinity;
  for (const c of cups) {
    if (!c.live) continue;
    const d = Math.hypot(landing.x - c.x, landing.z - c.z);
    if (d < distance) { distance = d; cup = c; }
  }
  if (cup && distance <= PONG.sinkRadius) return { result: 'sink', cup, distance };
  if (cup && distance <= PONG.cupRim + PONG.ball) return { result: 'rim', cup, distance };
  const onTable = Math.abs(landing.x) <= PONG.tableHalfWidth && landing.z >= PONG.tableFar && landing.z <= PONG.tableNear;
  return { result: onTable ? 'table' : 'off', cup, distance };
}

/** 85 for the whole rack; clearing it early adds 5 per ball left, up to 100. */
export function pongScore(cups, ballsUsed, balls = PONG.balls) {
  const sunk = clamp(cups, 0, 6);
  if (sunk === 6) return clamp(85 + Math.max(0, balls - ballsUsed) * 5, 0, 100);
  return Math.round(sunk / 6 * 85);
}

/* ------------------------------------------------------------- flip cup */

export const FLIP = {
  legs: 4,
  // Each teammate's cup sits a little differently on the edge.
  sweet: [0.62, 0.55, 0.68, 0.6],
  tolerance: 0.09,
  drink: 0.9,
  // A clean run takes about twelve seconds.
  par: 12.5
};

export const FLIP_TIMING = { place: 0.3, charge: 0.65, flip: 0.5, short: 0.55, over: 0.6, reset: 0.35 };

/** 'flip' in the window; 'short' falls back, 'over' turns too far and rolls. */
export function flipOutcome(power, sweet, tolerance = FLIP.tolerance) {
  if (Math.abs(power - sweet) <= tolerance) return 'flip';
  return power < sweet ? 'short' : 'over';
}

export const flipAttemptTime = (outcome) => FLIP_TIMING.charge
  + (outcome === 'flip' ? FLIP_TIMING.flip : outcome === 'short' ? FLIP_TIMING.short : FLIP_TIMING.over + FLIP_TIMING.reset);

/**
 * The rival team's relay, decided at the start: each leg drinks, places the
 * cup and flips until it lands (a sixth try always does). `skill` is the
 * chance that a flip lands.
 */
export function rivalFlipPlan(rng = Math.random, skill = 0.68) {
  const legs = [];
  let total = 0;
  for (let i = 0; i < FLIP.legs; i++) {
    const drink = 0.85 + rng() * 0.25, react = 0.25 + rng() * 0.15;
    const attempts = [];
    for (let n = 0; n < 6; n++) {
      const lands = n === 5 || rng() < skill;
      attempts.push(lands ? 'flip' : rng() < 0.5 ? 'short' : 'over');
      if (lands) break;
    }
    const time = drink + FLIP_TIMING.place + react + attempts.reduce((sum, o) => sum + flipAttemptTime(o), 0);
    legs.push({ drink, react, attempts, time });
    total += time;
  }
  return { legs, total };
}

/** Up to 90 for the time (six per second over par) and 10 for beating the rivals. */
export function flipCupScore(seconds, won) {
  const timeScore = clamp(Math.round(90 - Math.max(0, seconds - FLIP.par) * 6), 0, 90);
  return timeScore + (won ? 10 : 0);
}
