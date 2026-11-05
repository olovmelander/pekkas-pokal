/** Assisted track-relative kart handling. Metres/seconds; no power-ups. */
export const LAPS = 3;
export const TRACK_HALF_WIDTH = 4.4;
export const GRIP_ACCELERATION = 12.5;
export const TOP_SPEED = 18.3;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function newDriver(distance = 0, lane = 0) {
  return { distance, lane, lateral: 0, speed: 0, grip: 1, skidding: false, slipstream: 0, hit: 0 };
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
  const event = { barrier: false };
  if (Math.abs(driver.lane) > 5.95) {
    driver.lane = Math.sign(driver.lane) * 5.95;
    driver.lateral *= -0.22;
    if (driver.hit <= 0) {
      driver.speed *= 0.65;
      driver.hit = 0.8;
      event.barrier = true;
    }
  }
  // The inside line covers less distance than the centre line. This is geometry,
  // not a speed bonus: the kart's actual speed remains unchanged.
  const lineScale = clamp(1 - curvature * driver.lane, 0.62, 1.4);
  driver.distance += driver.speed * step / lineScale;
  return event;
}

export function racePosition(distance, opponents) {
  return 1 + opponents.filter((driver) => driver.distance > distance).length;
}

export function raceScore(position, seconds, incidents = 0) {
  return Math.max(0, Math.round((7 - position) * 1000 + Math.max(0, 100 - seconds) * 35 + Math.max(0, 500 - incidents * 100)));
}
