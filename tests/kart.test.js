import { describe, expect, it } from 'vitest';
import { LAPS, clamp, cornerSpeed, trackGap, slipstreamFactor, newDriver, stepDriver, racePosition, raceScore, stepRival, resolveContact, markFinish, raceStandings } from '../src/games/kart/physics.js';
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
    const { speed } = driver;
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
  it('lets ordinary digital steering and braking beat the complete field', () => {
    const route = createRoute(), player = newDriver(0, -1.3);
    const rivals = [16.15, 15.75, 15.3, 14.85, 14.45].map((pace, i) => ({ ...newDriver(4.5 + i * 3.4, i % 2 ? -1.5 : 1.5), pace }));
    const drivers = [player, ...rivals];
    let seconds = 0, frame = 0, steer = 0, brake = false;
    while (player.finishTime === null && seconds < 65) {
      const dt = 1 / 60; seconds += dt; frame++;
      // A keyboard player adjusts every 150 ms and leaves space to pass.
      if (frame % 9 === 0) {
        steer = player.lane < -3.2 ? 1 : player.lane > -2.2 ? -1 : 0;
        brake = player.speed > cornerSpeed(route.curvature(player.distance + 8)) + 0.7;
      }
      const before = player.distance;
      stepDriver(player, { steer, brake, throttle: !brake }, route.curvature(player.distance), dt);
      rivals.forEach((rival, i) => {
        const previous = rival.distance;
        if (rival.finishTime === null) stepRival(rival, i, drivers, route, dt);
        markFinish(rival, previous, route.length * LAPS, seconds, dt);
      });
      for (let a = 0; a < drivers.length; a++) for (let b = a + 1; b < drivers.length; b++) {
        if (drivers[a].finishTime === null && drivers[b].finishTime === null) resolveContact(drivers[a], drivers[b], route.length);
      }
      markFinish(player, before, route.length * LAPS, seconds, dt);
    }
    expect(player.finishTime).toBeLessThan(60);
    expect(raceStandings(drivers)[0]).toBe(player);
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
  it('counts a continuous wall scrape once and re-arms after returning to asphalt', () => {
    const driver = newDriver(0, 5.94); driver.speed = 14;
    let impacts = 0;
    for (let i = 0; i < 300; i++) impacts += Number(stepDriver(driver, { steer: 1, throttle: true }, 0, 1 / 60).barrier);
    expect(impacts).toBe(1);
    drive(driver, { steer: -1, throttle: true }, 0, 1);
    expect(driver.lane).toBeLessThan(4.4);
    for (let i = 0; i < 180; i++) impacts += Number(stepDriver(driver, { steer: 1, throttle: true }, 0, 1 / 60).barrier);
    expect(impacts).toBe(2);
  });
  it('separates both karts and charges momentum to both after contact', () => {
    const a = newDriver(20, 0), b = newDriver(21, 0.2); a.speed = 16; b.speed = 14;
    expect(resolveContact(a, b, 260)).toBe(true);
    expect(a.lane).toBeLessThan(0); expect(b.lane).toBeGreaterThan(0.2);
    expect(a.speed).toBeLessThan(16); expect(b.speed).toBeLessThan(14);
    expect(resolveContact(a, b, 260)).toBe(false);
    expect(resolveContact(newDriver(1), newDriver(8), 260)).toBe(false);
  });
  it('makes rivals seek passing space before catching a slower kart', () => {
    const route = { length: 260, curvature: () => 0 };
    const rival = { ...newDriver(10, 0), pace: 16 }; rival.speed = 12;
    const slower = newDriver(16, 0); slower.speed = 8;
    for (let i = 0; i < 30; i++) { stepRival(rival, 0, [rival, slower], route, 1 / 60); slower.distance += 8 / 60; }
    expect(rival.lane).toBeLessThan(-0.7);
    expect(rival.speed).toBeLessThanOrEqual(15);
  });
  it('records crossing fractions and keeps finish order stable after the line', () => {
    const first = newDriver(781), second = newDriver(780.5);
    markFinish(first, 779, 780, 50, 0.05); markFinish(second, 779, 780, 50, 0.05);
    expect(first.finishTime).toBeLessThan(second.finishTime);
    second.distance = 1000;
    expect(raceStandings([second, first])[0]).toBe(first);
    const recorded = first.finishTime; markFinish(first, 781, 780, 60, 0.05);
    expect(first.finishTime).toBe(recorded);
  });
  it('scores finishing position, time and clean racing', () => {
    expect(raceScore(1, 50, 0)).toBeGreaterThan(raceScore(2, 50, 0));
    expect(raceScore(1, 50, 0)).toBeGreaterThan(raceScore(1, 60, 0));
    expect(raceScore(1, 50, 0)).toBeGreaterThan(raceScore(1, 50, 3));
  });
});
