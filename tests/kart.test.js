import { describe, expect, it } from 'vitest';
import { Euler, Vector3, PerspectiveCamera } from 'three';
import { LAPS, TRACK_HALF_WIDTH, WALL_LANE, steeringFromButtons, clamp, cornerSpeed, trackGap, slipstreamFactor, newDriver, stepDriver, racePosition, raceScore, stepRival, resolveContact, markFinish, raceStandings } from '../src/games/kart/physics.js';
import { createRoute, TRACK_LENGTH, TRACK_PLAN, ROAD_HALF_WIDTH } from '../src/games/kart/route.js';

const drive = (driver, input, curvature = 0, seconds = 1) => {
  for (let i = 0; i < seconds * 60; i++) stepDriver(driver, input, curvature, 1 / 60);
};

describe('gokart handling and race results', () => {
  it('keeps the ribbon smooth at the lap seam and wide enough for the barriers', () => {
    const route = createRoute();
    expect(route.sample(0).position.distanceTo(route.sample(route.length).position)).toBeLessThan(0.001);
    for (let i = 0; i < 300; i++) expect(Math.abs(route.curvature(i / 300 * route.length)) * 5.1).toBeLessThan(1);
  });
  it('matches the documented 665 m source and the photographed three-hairpin layout', () => {
    const route = createRoute();
    expect(route.length).toBeCloseTo(TRACK_LENGTH, 4);
    expect(TRACK_LENGTH).toBe(665);
    expect(TRACK_PLAN.length).toBeGreaterThan(60);
    expect(route.sample(0).position.distanceTo(route.planToWorld(440, 294))).toBeLessThan(0.001);
    const width = route.bounds.max.x - route.bounds.min.x;
    const depth = route.bounds.max.z - route.bounds.min.z;
    expect(width / depth).toBeGreaterThan(1.4); expect(width / depth).toBeLessThan(1.6);
    expect(ROAD_HALF_WIDTH).toBe(TRACK_HALF_WIDTH);
    const sampled = Array.from({ length: 665 }, (_, i) => ({ point: route.sample(i).position, curve: route.curvature(i) }));
    expect(sampled.some(s => s.curve > 0.08)).toBe(true);
    expect(sampled.some(s => s.curve < -0.08)).toBe(true);
    // Non-neighbouring sections leave room for the full 7 m asphalt ribbon.
    for (let a = 0; a < sampled.length; a += 3) for (let b = a + 20; b < sampled.length; b += 3) {
      if (Math.min(b - a, 665 - (b - a)) < 20) continue;
      const dx = sampled[a].point.x - sampled[b].point.x, dz = sampled[a].point.z - sampled[b].point.z;
      expect(Math.hypot(dx, dz)).toBeGreaterThan(ROAD_HALF_WIDTH * 2);
    }
  });
  it('keeps the four tyre contact points on the graded road in every heading', () => {
    const route = createRoute();
    for (let distance = 0; distance < route.length; distance += 2.5) {
      const road = route.sample(distance);
      const rotation = new Euler(road.pitch, road.angle, road.roll, 'YXZ');
      for (const x of [-0.88, 0.88]) for (const z of [-0.78, 0.75]) {
        const contact = new Vector3(x, 0, z).applyEuler(rotation).add(road.position);
        expect(Math.abs(contact.y - route.terrainHeight(contact.x, contact.z))).toBeLessThan(0.004);
      }
    }
  });
  it('moves toward the pressed arrow in the chase camera at every course heading', () => {
    const route = createRoute();
    for (const distance of [0, 160, 310, 500]) {
      const centre = route.sample(distance), camera = new PerspectiveCamera(58, 1.4, 0.1, 550);
      camera.position.copy(centre.position).addScaledVector(centre.tangent, -12); camera.position.y += 6;
      camera.lookAt(centre.position); camera.updateMatrixWorld();
      const left = newDriver(distance), right = newDriver(distance); left.speed = right.speed = 10;
      drive(left, { steer: steeringFromButtons(true, false), throttle: true }, 0, 0.2);
      drive(right, { steer: steeringFromButtons(false, true), throttle: true }, 0, 0.2);
      const leftOnScreen = route.sample(left.distance, left.lane).position.project(camera);
      const rightOnScreen = route.sample(right.distance, right.lane).position.project(camera);
      expect(rightOnScreen.x).toBeGreaterThan(leftOnScreen.x);
    }
    expect(steeringFromButtons(true, true)).toBe(0);
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
    while (driver.distance < route.length * LAPS && seconds < 180) {
      const curvature = route.curvature(driver.distance);
      const targetSpeed = cornerSpeed(route.curvature(driver.distance + 8)) * 0.98;
      const steer = clamp(curvature * driver.speed * driver.speed * 0.085 / 7.4 - driver.lane * 0.5, -1, 1);
      const brake = driver.speed > targetSpeed + 0.3;
      stepDriver(driver, { steer, throttle: !brake, brake }, curvature, 1 / 60);
      seconds += 1 / 60;
    }
    expect(driver.distance).toBeGreaterThanOrEqual(route.length * LAPS);
    expect(seconds).toBeLessThan(165);
    expect(Math.abs(driver.lane)).toBeLessThan(TRACK_HALF_WIDTH);
  });
  it('lets ordinary digital steering and braking beat the complete field', () => {
    const route = createRoute(), player = newDriver(-19, -1.3);
    const rivals = [16.15, 15.75, 15.3, 14.85, 14.45].map((pace, i) => ({ ...newDriver(-14.5 + i * 3.4, i % 2 ? -1.5 : 1.5), pace }));
    const drivers = [player, ...rivals];
    let seconds = 0, frame = 0, steer = 0, brake = false;
    while (player.finishTime === null && seconds < 175) {
      const dt = 1 / 60; seconds += dt; frame++;
      // A keyboard player adjusts every 150 ms and leaves space to pass.
      if (frame % 9 === 0) {
        const bend = route.curvature(player.distance + 8);
        const target = Math.abs(bend) > 0.012 ? Math.sign(bend) * 2.45 : 0;
        const projection = player.lane + player.lateral * 0.15;
        steer = projection < target - 0.35 ? 1 : projection > target + 0.35 ? -1 : 0;
        brake = player.speed > Math.min(cornerSpeed(route.curvature(player.distance + 9)), cornerSpeed(route.curvature(player.distance + 14))) + 0.4;
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
    expect(player.finishTime).toBeGreaterThan(120);
    expect(player.finishTime).toBeLessThan(150);
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
    const driver = newDriver(0, WALL_LANE - 0.05);
    driver.speed = 17;
    drive(driver, { steer: 1, throttle: true, brake: false });
    expect(driver.lane).toBeLessThanOrEqual(WALL_LANE);
    expect(driver.speed).toBeLessThan(10);
    drive(driver, { steer: -1, throttle: true, brake: false }, 0, 0.7);
    expect(driver.lane).toBeLessThan(TRACK_HALF_WIDTH);
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
    const driver = newDriver(0, WALL_LANE - 0.01); driver.speed = 14;
    let impacts = 0;
    for (let i = 0; i < 300; i++) impacts += Number(stepDriver(driver, { steer: 1, throttle: true }, 0, 1 / 60).barrier);
    expect(impacts).toBe(1);
    drive(driver, { steer: -1, throttle: true }, 0, 1);
    expect(driver.lane).toBeLessThan(TRACK_HALF_WIDTH);
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
