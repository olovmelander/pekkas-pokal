import { describe, expect, it } from 'vitest';
import { LAPS, clamp, cornerSpeed, trackGap, slipstreamFactor, newDriver, stepDriver, racePosition, raceScore } from '../src/games/kart/physics.js';
import { createRoute } from '../src/games/kart/world.js';

const drive = (driver, input, curvature = 0, seconds = 1) => {
  for (let i = 0; i < seconds * 60; i++) stepDriver(driver, input, curvature, 1 / 60);
};

describe('gokart handling and race results', () => {
  it('keeps the ribbon smooth at the lap seam and wide enough for the barriers', () => {
    const route = createRoute();
    expect(route.sample(0).position.distanceTo(route.sample(route.length).position)).toBeLessThan(0.001);
    for (let i = 0; i < 300; i++) expect(Math.abs(route.curvature(i / 300 * route.length)) * 6.7).toBeLessThan(1);
  });
  it('requires throttle to move, coasts on release and gives braking priority', () => {
    const driver = newDriver();
    drive(driver, { steer: 1, throttle: false, brake: false });
    expect(driver.distance).toBe(0);
    expect(driver.lane).toBe(0);
    drive(driver, { steer: 0, throttle: true, brake: false }, 0, 3);
    const speed = driver.speed;
    expect(speed).toBeGreaterThan(8);
    drive(driver, { steer: 0, throttle: false, brake: false });
    expect(driver.speed).toBeLessThan(speed);
    drive(driver, { steer: 0, throttle: true, brake: true }, 0, 2);
    expect(driver.speed).toBe(0);
  });
  it('allows a clean racing line and braking to finish all three laps', () => {
    const route = createRoute();
    const driver = newDriver();
    let seconds = 0;
    while (driver.distance < route.length * LAPS && seconds < 90) {
      const curvature = route.curvature(driver.distance);
      const targetSpeed = cornerSpeed(route.curvature(driver.distance + 8)) * 0.98;
      const steer = clamp(curvature * driver.speed * driver.speed * 0.085 / 7.4 - driver.lane * 0.5, -1, 1);
      const brake = driver.speed > targetSpeed + 0.3;
      stepDriver(driver, { steer, throttle: !brake, brake }, curvature, 1 / 60);
      seconds += 1 / 60;
    }
    expect(driver.distance).toBeGreaterThanOrEqual(route.length * LAPS);
    expect(seconds).toBeLessThan(70);
    expect(Math.abs(driver.lane)).toBeLessThan(4.4);
  });
  it('loses grip when entering a bend too fast, while a slower entry keeps grip', () => {
    const fast = newDriver();
    const slow = newDriver();
    fast.speed = 18;
    slow.speed = 10;
    stepDriver(fast, { steer: 0, throttle: true, brake: false }, 0.08, 1 / 60);
    stepDriver(slow, { steer: 0, throttle: true, brake: false }, 0.08, 1 / 60);
    expect(fast.skidding).toBe(true);
    expect(fast.grip).toBeLessThan(0.6);
    expect(slow.skidding).toBe(false);
    expect(slow.grip).toBe(1);
  });
  it('only provides modest slipstream on a matching line behind another kart', () => {
    const driver = newDriver(98, 0);
    expect(slipstreamFactor(driver, [newDriver(104, 0)], 260)).toBeGreaterThan(0);
    expect(slipstreamFactor(driver, [newDriver(104, 2)], 260)).toBe(0);
    expect(slipstreamFactor(driver, [newDriver(94, 0)], 260)).toBe(0);
    expect(slipstreamFactor(newDriver(258), [newDriver(4)], 260)).toBeGreaterThan(0);
    const clear = newDriver();
    const following = newDriver();
    drive(clear, { steer: 0, throttle: true, brake: false }, 0, 15);
    drive(following, { steer: 0, throttle: true, brake: false, slipstream: 0.7 }, 0, 15);
    expect(following.speed).toBeGreaterThan(clear.speed);
    expect(following.speed - clear.speed).toBeLessThan(2);
    expect(following.speed).toBeLessThanOrEqual(19.3);
  });
  it('grass and barriers slow the kart but allow driving back onto the track', () => {
    const driver = newDriver(0, 5.9);
    driver.speed = 17;
    drive(driver, { steer: 1, throttle: true, brake: false });
    expect(driver.lane).toBeLessThanOrEqual(5.95);
    expect(driver.speed).toBeLessThan(10);
    drive(driver, { steer: -1, throttle: true, brake: false }, 0, 0.7);
    expect(driver.lane).toBeLessThan(4.4);
    expect(driver.distance).toBeGreaterThan(0);
  });
  it('clamps long frames and distinguishes on-track gaps from overall ranking', () => {
    const driver = newDriver();
    driver.speed = 16;
    stepDriver(driver, { steer: 0, throttle: false, brake: true }, 0, 12);
    expect(driver.speed).toBeLessThan(16);
    expect(driver.distance).toBeLessThan(1);
    expect(trackGap(259, 261, 260)).toBe(2);
    expect(trackGap(259, 521, 260)).toBe(2);
    expect(racePosition(610, [{ distance: 705 }, { distance: 609 }, { distance: 200 }])).toBe(2);
  });
  it('scores finishing position, time and clean racing', () => {
    expect(raceScore(1, 50, 0)).toBeGreaterThan(raceScore(2, 50, 0));
    expect(raceScore(1, 50, 0)).toBeGreaterThan(raceScore(1, 60, 0));
    expect(raceScore(1, 50, 0)).toBeGreaterThan(raceScore(1, 50, 3));
  });
});
