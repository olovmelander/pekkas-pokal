/** Rival drivers on the same bicycle model as the player.
 *
 * A precomputed minimum-curvature racing line (outside, apex, outside) and a
 * braking-aware speed profile give each rival its targets. A look-ahead
 * controller turns those into steering, throttle and brake inputs, exactly
 * what the player's keys produce. Personalities vary pace, aggression,
 * consistency and start reaction; small believable mistakes come from a
 * seeded random stream, so races are repeatable in tests.
 */
import { TOP_SPEED, WHEELBASE, GRIP_ACCELERATION, KART, ASSIST, clamp, trackEnv, trackGap, steerLimit, slideAngle } from './physics.js';

export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ pace: 0.84, power: 0.78, consistency: -0.06, reaction: 0.1, catchup: 1.4 }),
  normal: Object.freeze({ pace: 0.9, power: 0.855, consistency: 0, reaction: 0.04, catchup: 1 }),
  hard: Object.freeze({ pace: 0.98, power: 0.97, consistency: 0.04, reaction: 0, catchup: 0.55 })
});

/** Jonas is fast and aggressive, Rickard careful; the others in between. */
export const RIVAL_PROFILES = Object.freeze([
  { name: 'Jonas', full: 'Jonas Eriksson', color: 0xe66b52, pace: 1, aggression: 0.9, consistency: 0.8, reaction: 0.19 },
  { name: 'Erik', full: 'Erik Vallgren', color: 0x6caac5, pace: 0.985, aggression: 0.6, consistency: 0.9, reaction: 0.24 },
  { name: 'Viktor', full: 'Viktor Jones', color: 0x9fae66, pace: 0.97, aggression: 0.5, consistency: 0.84, reaction: 0.27 },
  { name: 'Per', full: 'Per Vikman', color: 0xbb8ad8, pace: 0.955, aggression: 0.45, consistency: 0.78, reaction: 0.31 },
  { name: 'Rickard', full: 'Rickard Nilsson', color: 0xece3c7, pace: 0.94, aggression: 0.15, consistency: 0.95, reaction: 0.37 }
].map(Object.freeze));

/** Small deterministic PRNG (mulberry32). */
export function seededRandom(seed = 2012) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleTable(table, spacing, distance) {
  const count = table.length, x = (((distance / spacing) % count) + count) % count, i = Math.floor(x), f = x - i;
  return table[i] * (1 - f) + table[(i + 1) % count] * f;
}

/** Racing line inside ±edge: outside, apex, outside. Projected gradient
 * descent with momentum on Σ κ_path² − shortcut·Σ κ·lane, where the path
 * curvature κ/(1−κ·lane) + lane'' includes the tightening of an inside line.
 * Pure minimum curvature would circle a hairpin on the outside; the small
 * shortcut term pulls the apex in, as a driver does. */
export function buildRacingLine(track, { spacing = 2, edge = 2.7, iterations = 3000, shortcut = 0.012 } = {}) {
  const env = trackEnv(track);
  const count = Math.max(16, Math.round(env.length / spacing)), ds = env.length / count;
  const kappa = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = 0; j < 4; j++) sum += env.curvature((i + (j - 1.5) / 4) * ds);
    kappa[i] = sum / 4;
  }
  const lane = new Float64Array(count), velocity = new Float64Array(count), error = new Float64Array(count);
  const inv = 1 / (ds * ds), rate = 0.8 * ds ** 4 / 16;
  const at = (array, i) => array[(i + count) % count];
  const pathCurvature = () => {
    for (let i = 0; i < count; i++) error[i] = kappa[i] / Math.max(0.35, 1 - kappa[i] * lane[i]) + (at(lane, i + 1) - 2 * lane[i] + at(lane, i - 1)) * inv;
  };
  for (let iteration = 0; iteration < iterations; iteration++) {
    pathCurvature();
    for (let i = 0; i < count; i++) {
      const tight = kappa[i] / Math.max(0.35, 1 - kappa[i] * lane[i]);
      const gradient = error[i] * tight * tight + (at(error, i + 1) - 2 * error[i] + at(error, i - 1)) * inv - shortcut * kappa[i];
      velocity[i] = velocity[i] * 0.94 - rate * gradient;
      const next = clamp(lane[i] + velocity[i], -edge, edge);
      if (next !== lane[i] + velocity[i]) velocity[i] = 0;
      lane[i] = next;
    }
  }
  pathCurvature();
  if (typeof track.sample === 'function') {
    // Exact signed curvature of the driven path, heading = atan2(x, z) as in route.js.
    const xs = new Float64Array(count), zs = new Float64Array(count);
    for (let i = 0; i < count; i++) { const p = track.sample(i * ds, lane[i]).position; xs[i] = p.x; zs[i] = p.z; }
    for (let i = 0; i < count; i++) {
      const a = (i + count - 1) % count, b = (i + 1) % count;
      const turn = Math.atan2(xs[b] - xs[i], zs[b] - zs[i]) - Math.atan2(xs[i] - xs[a], zs[i] - zs[a]);
      error[i] = Math.atan2(Math.sin(turn), Math.cos(turn)) / Math.max(0.2, (Math.hypot(xs[b] - xs[i], zs[b] - zs[i]) + Math.hypot(xs[i] - xs[a], zs[i] - zs[a])) / 2);
    }
  }
  const curvature = new Float64Array(count);
  for (let i = 0; i < count; i++) curvature[i] = (at(error, i - 1) + 2 * error[i] + at(error, i + 1)) / 4;
  return {
    length: env.length, spacing: ds, lane, curvature, edge, env,
    laneAt: (distance) => sampleTable(lane, ds, distance),
    curvatureAt: (distance) => sampleTable(curvature, ds, distance)
  };
}

/** Corner speeds from lateral grip, then a backward braking pass. */
export function speedProfile(line, { lateral = GRIP_ACCELERATION, brake = 5.8, top = TOP_SPEED } = {}) {
  const count = line.lane.length, speeds = new Float64Array(count);
  for (let i = 0; i < count; i++) speeds[i] = Math.min(top, Math.sqrt(lateral / Math.max(1e-4, Math.abs(line.curvature[i]))));
  // Braking shares the friction circle with cornering, so brake before turning.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = count - 1; i >= 0; i--) {
      const next = speeds[(i + 1) % count], step = line.spacing * Math.max(0.4, 1 - line.env.curvature(i * line.spacing) * line.lane[i]);
      const used = next * next * Math.abs(line.curvature[i]) / lateral;
      speeds[i] = Math.min(speeds[i], Math.sqrt(next * next + 2 * brake * Math.sqrt(Math.max(0.06, 1 - used * used)) * step));
    }
  }
  return { speeds, spacing: line.spacing, at: (distance) => sampleTable(speeds, line.spacing, distance) };
}

/** Steering input that brings the kart onto `targetLane` `look` metres ahead:
 * curvature feed-forward, a pursuit correction and yaw-rate damping, then
 * inverted through the same steering limit and countersteer assist the
 * player's input goes through. */
export function pursuitSteer(driver, targetLane, look, track) {
  const env = trackEnv(track);
  const speed = driver.speed;
  const beta = speed > 1.5 ? Math.atan2(driver.w, Math.max(Math.abs(driver.u), 0.5)) : 0;
  const theta = driver.heading + beta;
  const front = speed > 1.5 ? Math.atan2(driver.w + KART.front * driver.yawRate, Math.max(Math.abs(driver.u), 0.5)) : 0;
  const k = env.curvature(driver.distance + look * 0.35);
  const kLane = k / Math.max(0.3, 1 - k * driver.lane);
  const wanted = Math.atan2(targetLane - driver.lane, look);
  const kRequired = kLane + 2 * Math.sin(wanted - theta) / look;
  let delta = Math.atan(WHEELBASE * kRequired) + 0.05 * (speed * kRequired - driver.yawRate);
  // Sliding: point the front wheels where the front is going, then a little in.
  const slide = Math.abs(slideAngle(driver));
  if (slide > 0) delta = delta * (1 - Math.min(1, slide * 4)) + (front + 0.08 * Math.sign(kRequired)) * Math.min(1, slide * 4);
  return clamp((delta - (driver.assist ?? ASSIST) * slideAngle(driver)) / steerLimit(speed), -1, 1);
}

export function createBrain(profile, { line, difficulty = 'normal', seed = 1 } = {}) {
  const level = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const random = seededRandom(seed);
  const pace = profile.pace * level.pace;
  const consistency = clamp(profile.consistency + level.consistency, 0.5, 0.99);
  return {
    profile, level, random, pace, consistency, aggression: profile.aggression,
    // Rental engines differ: power scales the throttle the rival can use.
    power: level.power * (1 - (1 - profile.pace) * 1.2),
    speeds: speedProfile(line, { lateral: GRIP_ACCELERATION * 0.97 * pace, brake: 4.4 + 1.0 * pace }),
    reaction: profile.reaction + level.reaction + (random() - 0.5) * 0.14 * (1.4 - consistency),
    phase: random() * 100, mistake: null, mistakeClock: 2 + random() * 3, side: 0, sideClock: 0, defendClock: 0, catchup: 1
  };
}

/** Mild, invisible catch-up: rivals far ahead ease off, far behind try harder. */
export function catchupFactor(rivalDistance, playerDistance, strength = 1) {
  const gap = rivalDistance - playerDistance;
  return 1 - clamp((gap - 20) / 140, 0, 1) * 0.045 * strength + clamp((-gap - 30) / 150, 0, 1) * 0.02 * strength;
}

const MISTAKES = ['wide', 'lift', 'early'];

/** Inputs for one rival this frame. `drivers` is the whole field. */
export function rivalInput(driver, brain, { line, track, drivers, dt = 1 / 60, cooldown = false }) {
  const env = trackEnv(track);
  const speed = driver.speed, s = driver.distance;
  const look = 3.4 + speed * 0.3;
  const bendAhead = env.curvature(s + 8 + speed * 0.4);
  // The line with a personal wobble that shrinks with consistency.
  let lane = line.laneAt(s + look) + Math.sin(s * 0.031 + brain.phase) * (1 - brain.consistency) * 1.1;
  let target = brain.speeds.at(s + speed * 0.3) * brain.catchup;
  let clear = true;
  brain.sideClock = Math.max(0, brain.sideClock - dt);
  brain.defendClock = Math.max(0, brain.defendClock - dt);
  if (cooldown) { target *= 0.62; lane = clamp(lane * 0.5 + 1.6, -2.5, 2.5); }
  else {
    for (const other of drivers) {
      if (other === driver || other.ghost || other.finishTime !== null) continue;
      const gap = trackGap(s, other.distance, line.length), dn = other.lane - driver.lane;
      if (Math.abs(gap) < 12) clear = false;
      if (gap > 0.5 && gap < 14 && Math.abs(dn) < 2.1) {
        // A kart ahead on our line: pick a side and commit to it for a while.
        const closing = speed - other.speed;
        if (closing > 0.2 || gap < 6) {
          if (!brain.sideClock) {
            const inside = Math.sign(bendAhead) || (other.lane > 0 ? -1 : 1);
            const roomInside = 2.6 - inside * other.lane, roomOutside = 2.6 + inside * other.lane;
            // Round the outside only through gentle bends; in a hairpin wait or dive inside.
            const outsideOk = Math.abs(bendAhead) < 0.05 && roomOutside > 1.9;
            const preferInside = brain.aggression > 0.35 || roomInside > roomOutside || !outsideOk;
            brain.side = preferInside && roomInside > 1.9 ? inside : outsideOk ? -inside : 0;
            brain.sideClock = 1.6;
          }
          if (brain.side) lane = clamp(other.lane + brain.side * 2.05, -2.6, 2.6);
        }
        // Never ram: match the kart ahead until there is a gap beside it.
        if ((gap < 5 || !brain.side) && Math.abs(dn) < 1.75) target = Math.min(target, other.speed + (gap - 3.2) * 0.9);
      }
      if (Math.abs(gap) <= 2.9 && Math.abs(dn) < 2.3) {
        // Alongside: hold our side and leave racing room, wheel to wheel.
        lane = dn > 0 ? Math.min(lane, other.lane - 1.85) : Math.max(lane, other.lane + 1.85);
      }
      if (gap < -1.5 && gap > -8 && other.speed > speed + 0.3 && Math.abs(dn) < 2.6 && !brain.defendClock && brain.aggression > 0.3 && Math.abs(bendAhead) > 0.03) {
        // Cover the inside once before the bend; no weaving.
        brain.defendClock = 3;
        brain.defend = Math.sign(bendAhead) * 1.5;
      }
    }
    if (brain.defendClock > 1.6) lane = lane * 0.4 + brain.defend * 0.6;
  }
  lane = clamp(lane, -2.85, 2.85);
  // Off the racing line (traffic, defending) the bend is tighter: respect it.
  for (const ahead of [2, 6, 11]) {
    const laneThere = ahead < 6 ? driver.lane : lane;
    if (Math.abs(laneThere - line.laneAt(s + ahead)) < 0.7) continue;
    const k = env.curvature(s + ahead), tight = Math.abs(k / Math.max(0.3, 1 - k * laneThere));
    target = Math.min(target, Math.sqrt(GRIP_ACCELERATION * 0.95 * brain.pace / Math.max(1e-4, tight)) + ahead * 0.4);
  }
  // Small believable mistakes, only with nobody close by.
  brain.mistakeClock -= dt;
  if (!brain.mistake && brain.mistakeClock <= 0 && !cooldown) {
    brain.mistakeClock = 1;
    if (clear && brain.random() < (1 - brain.consistency) * 0.1) {
      const kind = MISTAKES[Math.floor(brain.random() * MISTAKES.length)];
      brain.mistake = { kind, time: kind === 'lift' ? 0.35 : 1.3, side: -Math.sign(bendAhead) || 1 };
    }
  }
  let liftNow = false;
  if (brain.mistake) {
    const m = brain.mistake;
    if (m.kind === 'wide') { target *= 1.06; lane = clamp(lane + m.side * 1.1, -3.3, 3.3); }
    if (m.kind === 'early') target *= 0.9;
    if (m.kind === 'lift') liftNow = Math.abs(env.curvature(s)) > 0.035;
    m.time -= dt;
    if (m.time <= 0) brain.mistake = null;
  }
  const steer = pursuitSteer(driver, lane, look, env);
  const error = target - speed;
  let throttle = error > -0.15 ? clamp(error * 1.6 + 0.35, 0, 1) : 0;
  // Brake in a straight line; only trail a little pressure into the turn.
  let brake = error < -0.35 ? clamp((-error - 0.35) * 0.7, 0, Math.max(0.08, 1 - 1.4 * Math.abs(steer))) : 0;
  // A tidy driver keeps the kart balanced once the rear steps out.
  if (driver.slip > 0.25) { brake = 0; throttle = 0.55; }
  if (liftNow) { throttle = 0; brake = 0.3; }
  return { steer, throttle: throttle * brain.power, brake };
}
