/** Assisted track-relative kart handling. Metres/seconds; no power-ups. */
export const LAPS = 3;
export const TRACK_HALF_WIDTH = 3.5;
export const WALL_LANE = 4.35;
export const GRIP_ACCELERATION = 12.5;
export const TOP_SPEED = 18.3;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Positive spline lane lies camera-left when looking along the track. */
export function steeringFromButtons(left, right) {
  return Number(left) - Number(right);
}

export function newDriver(distance = 0, lane = 0) {
  return { distance, lane, lateral: 0, speed: 0, grip: 1, skidding: false, slipstream: 0, hit: 0, wallContact: false, finishTime: null };
}

export function cornerSpeed(curvature) {
  return Math.min(TOP_SPEED, Math.sqrt(GRIP_ACCELERATION / Math.max(0.001, Math.abs(curvature))));
}

export function trackGap(a, b, trackLength) {
  return ((b - a + trackLength / 2) % trackLength + trackLength) % trackLength - trackLength / 2;
}

/** A modest drag reduction only while following another kart on the same line. */
export function slipstreamFactor(driver, opponents, trackLength) {
  let draft = 0;
  for (const opponent of opponents) {
    const gap = trackGap(driver.distance, opponent.distance, trackLength);
    if (gap > 2.2 && gap < 12 && Math.abs(driver.lane - opponent.lane) < 1.2) {
      draft = Math.max(draft, (1 - gap / 12) * (1 - Math.abs(driver.lane - opponent.lane) / 1.2));
    }
  }
  return draft;
}

export function stepDriver(driver, input, curvature, dt) {
  const step = clamp(dt, 0, 0.05);
  const steer = clamp(input.steer || 0, -1, 1);
  const offroad = Math.abs(driver.lane) > TRACK_HALF_WIDTH;
  driver.slipstream = offroad || input.brake ? 0 : clamp(input.slipstream || 0, 0, 1);
  const demand = driver.speed * driver.speed * Math.abs(curvature) / GRIP_ACCELERATION;
  driver.grip = clamp(1 - Math.max(0, demand - 1) * 0.9, 0.18, 1);
  driver.skidding = demand > 1.12 && !offroad;
  const drag = 0.65 + driver.speed * driver.speed * 0.016 * (1 - driver.slipstream * 0.24);
  const acceleration = input.brake ? -11 : input.throttle ? 6 : 0;
  const terrainLoss = offroad ? 2.5 + driver.speed * 0.55 : 0;
  const scrub = Math.max(0, demand - 1) * 4.8;
  driver.speed = clamp(driver.speed + (acceleration - drag - terrainLoss - scrub) * step, 0, 19.3);
  // Steering chooses a line. Overdriving a bend loses grip and pushes the kart wide.
  const centrifugal = -curvature * driver.speed * driver.speed * (0.085 + (1 - driver.grip) * 0.085);
  const desiredLateral = steer * 7.4 * driver.grip * Math.min(1, driver.speed / 4) + centrifugal;
  driver.lateral += (desiredLateral - driver.lateral) * Math.min(1, step * (5 + driver.grip * 3));
  driver.lane += driver.lateral * step;
  driver.hit = Math.max(0, driver.hit - step);
  // Re-arm only after leaving the wall. Scraping is one incident, not a new
  // crash every cooldown tick; the grass already supplies continuous drag.
  if (Math.abs(driver.lane) < WALL_LANE - 0.55) driver.wallContact = false;
  const event = { barrier: false };
  if (Math.abs(driver.lane) > WALL_LANE) {
    driver.lane = Math.sign(driver.lane) * WALL_LANE;
    driver.lateral = -Math.sign(driver.lane) * Math.max(0.7, Math.abs(driver.lateral) * 0.25);
    if (!driver.wallContact) {
      driver.speed *= 0.65;
      driver.hit = 0.8;
      driver.wallContact = true;
      event.barrier = true;
    }
  }
  // The inside line covers less distance than the centre line. This is geometry,
  // not a speed bonus: the kart's actual speed remains unchanged.
  const lineScale = clamp(1 - curvature * driver.lane, 0.62, 1.4);
  driver.distance += driver.speed * step / lineScale;
  return event;
}

/** Both drivers yield momentum and space; the player is not singled out. */
export function resolveContact(a, b, length) {
  const gap = trackGap(a.distance, b.distance, length);
  const overlap = 1.52 - Math.abs(a.lane - b.lane);
  if (Math.abs(gap) >= 2.05 || overlap <= 0 || a.hit > 0 || b.hit > 0) return false;
  const side = a.lane === b.lane ? (gap >= 0 ? -1 : 1) : Math.sign(a.lane - b.lane);
  a.lane = clamp(a.lane + side * (overlap / 2 + 0.04), -WALL_LANE, WALL_LANE);
  b.lane = clamp(b.lane - side * (overlap / 2 + 0.04), -WALL_LANE, WALL_LANE);
  const average = (a.speed + b.speed) / 2;
  a.speed = Math.min(a.speed, average) * 0.9;
  b.speed = Math.min(b.speed, average) * 0.9;
  a.hit = b.hit = 0.65;
  return true;
}

/** Rivals choose space before a pass, and obey the same acceleration limit. */
export function stepRival(driver, index, drivers, route, dt) {
  const step = clamp(dt, 0, 0.05);
  const turn = route.curvature(driver.distance);
  const safeSpeed = Math.min(cornerSpeed(route.curvature(driver.distance + 7)), cornerSpeed(route.curvature(driver.distance + 13)));
  let target = Math.min(driver.pace, safeSpeed * (0.94 + (4 - index) * 0.008));
  let lane = Math.sign(turn) * 1.15 + Math.sin(driver.distance * 0.043 + index * 2.1) * 0.45;
  for (const other of drivers) {
    if (other === driver || other.finishTime !== null) continue;
    const gap = trackGap(driver.distance, other.distance, route.length);
    if (gap > -3.2 && gap < 8 && Math.abs(driver.lane - other.lane) < 1.9) {
      // Hold the side already occupied when running alongside. Returning to
      // the ideal line must wait until the overtaking kart has cleared us.
      const alongside = Math.abs(gap) < 3.2 && Math.abs(driver.lane - other.lane) > 0.12;
      const passingSide = alongside ? Math.sign(driver.lane - other.lane) : other.lane >= 0 ? -1 : 1;
      lane = clamp(other.lane + passingSide * 2.05, -2.45, 2.45);
      if (gap > 0 && gap < 3.2) target = Math.min(target, other.speed + 0.5);
    }
  }
  driver.speed += clamp((target - driver.speed) * 2, -10, 6) * step;
  const previousLane = driver.lane;
  driver.lane += clamp((lane - driver.lane) * 1.8, -3.5, 3.5) * step;
  driver.lateral = step ? (driver.lane - previousLane) / step : 0;
  driver.hit = Math.max(0, driver.hit - step);
  driver.distance += driver.speed * step / clamp(1 - turn * driver.lane, 0.62, 1.4);
}

/** Fractional crossing time makes the order independent of array/frame order. */
export function markFinish(driver, previousDistance, totalDistance, elapsed, dt) {
  if (driver.finishTime !== null || driver.distance < totalDistance) return;
  const fraction = clamp((totalDistance - previousDistance) / Math.max(0.0001, driver.distance - previousDistance), 0, 1);
  driver.finishTime = elapsed - dt + dt * fraction;
}

export function raceStandings(drivers) {
  return [...drivers].sort((a, b) => {
    if (a.finishTime != null && b.finishTime != null) return a.finishTime - b.finishTime;
    if (a.finishTime != null) return -1;
    if (b.finishTime != null) return 1;
    return b.distance - a.distance;
  });
}

export function racePosition(distance, opponents) {
  return 1 + opponents.filter((driver) => driver.distance > distance).length;
}

export function raceScore(position, seconds, incidents = 0) {
  return Math.max(0, Math.round((7 - position) * 1000 + Math.max(0, 100 - seconds) * 35 + Math.max(0, 500 - incidents * 100)));
}
