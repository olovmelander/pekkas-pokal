import { describe, expect, it } from 'vitest';
import { Euler, Vector3, PerspectiveCamera } from 'three';
import {
  LAPS, TRACK_HALF_WIDTH, WALL_LANE, TOP_SPEED, KART, steeringFromButtons, clamp, trackGap, slipstreamFactor, newDriver, stepDriver,
  stepField, racePosition, raceScore, resolveContact, markFinish, raceStandings, formatTime, engineFeedback, laneSurface, slideAngle
} from '../src/games/kart/physics.js';
import { buildRacingLine, createBrain, rivalInput, catchupFactor, RIVAL_PROFILES, DIFFICULTIES, seededRandom } from '../src/games/kart/ai.js';
import { createGhostRecorder, encodeGhost, decodeGhost, ghostAt, ghostTimeAt, saveGhost, loadGhost, GHOST_KEY } from '../src/games/kart/ghost.js';
import { createRoute, TRACK_LENGTH, TRACK_PLAN, ROAD_HALF_WIDTH } from '../src/games/kart/route.js';

const STEP = 1 / 60;
const drive = (driver, input, track = 0, seconds = 1) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepDriver(driver, input, track, STEP);
};
const route = createRoute();
const line = buildRacingLine(route);
const finite = (driver) => ['distance', 'lane', 'heading', 'yawRate', 'steerAngle', 'u', 'w', 'speed', 'slip', 'grip', 'wheelspin'].every((key) => Number.isFinite(driver[key]));

/** A keyboard player: line and braking from a rival's brain, but only digital
 * keys, re-decided every 100 ms, and no traffic awareness at all. */
function runRace({ difficulty = 'normal', seed = 2, keyEvery = 6 } = {}) {
  const player = newDriver(-19.2, -1.5);
  const rivals = RIVAL_PROFILES.map((profile, i) => ({ ...newDriver(-2.2 - (4 - i) * 3.4, (4 - i) % 2 ? -1.5 : 1.5, { assist: 1.2 }), name: profile.name }));
  const brains = RIVAL_PROFILES.map((profile, i) => createBrain(profile, { line, difficulty, seed: seed * 10 + i }));
  const coach = createBrain({ pace: 1, aggression: 0.6, consistency: 0.99, reaction: 0.25 }, { line, difficulty: 'hard', seed: 99 });
  coach.mistakeClock = Infinity;
  const drivers = [player, ...rivals];
  const worst = { lane: 0, nan: false };
  let time = 0, frame = 0, steer = 0, throttle = 0, brake = 0, carry = 0;
  while (player.finishTime === null && time < 200) {
    time += STEP; frame++;
    if (frame % keyEvery === 0) {
      const wish = rivalInput(player, coach, { line, track: route, drivers: [player], dt: STEP * keyEvery });
      carry += wish.steer;
      steer = carry > 0.5 ? 1 : carry < -0.5 ? -1 : 0;
      carry -= steer;
      brake = wish.brake > 0.15 ? 1 : 0;
      throttle = !brake && wish.throttle > 0.5 ? 1 : 0;
    }
    const inputs = [{ steer: steeringFromButtons(steer > 0, steer < 0), throttle, brake }];
    rivals.forEach((rival, i) => {
      brains[i].catchup = catchupFactor(rival.distance, player.distance, brains[i].level.catchup);
      rival.held = time < brains[i].reaction;
      inputs.push(rivalInput(rival, brains[i], { line, track: route, drivers, dt: STEP, cooldown: rival.finishTime !== null }));
    });
    const before = drivers.map((driver) => driver.distance);
    stepField(drivers, inputs, route, STEP);
    drivers.forEach((driver, i) => markFinish(driver, before[i], route.length * LAPS, time, STEP));
    for (const rival of rivals) {
      if (rival.finishTime === null) worst.lane = Math.max(worst.lane, Math.abs(rival.lane));
      worst.nan ||= !finite(rival);
    }
  }
  return { player, rivals, drivers, worst };
}

describe('Varggropen track geometry', () => {
  it('keeps the ribbon smooth at the lap seam and wide enough for the barriers', () => {
    expect(route.sample(0).position.distanceTo(route.sample(route.length).position)).toBeLessThan(0.001);
    for (let i = 0; i < 300; i++) expect(Math.abs(route.curvature(i / 300 * route.length)) * 5.1).toBeLessThan(1);
  });
  it('matches the documented 665 m source and the photographed three-hairpin layout', () => {
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
    for (let a = 0; a < sampled.length; a += 3) for (let b = a + 20; b < sampled.length; b += 3) {
      if (Math.min(b - a, 665 - (b - a)) < 20) continue;
      const dx = sampled[a].point.x - sampled[b].point.x, dz = sampled[a].point.z - sampled[b].point.z;
      expect(Math.hypot(dx, dz)).toBeGreaterThan(ROAD_HALF_WIDTH * 2);
    }
  });
  it('keeps the four tyre contact points on the graded road in every heading', () => {
    for (let distance = 0; distance < route.length; distance += 2.5) {
      const road = route.sample(distance);
      const rotation = new Euler(road.pitch, road.angle, road.roll, 'YXZ');
      for (const x of [-0.88, 0.88]) for (const z of [-0.78, 0.75]) {
        const contact = new Vector3(x, 0, z).applyEuler(rotation).add(road.position);
        expect(Math.abs(contact.y - route.terrainHeight(contact.x, contact.z))).toBeLessThan(0.004);
      }
    }
  });
  it('builds an outside–apex–outside racing line inside the asphalt', () => {
    expect(Math.max(...line.lane.map(Math.abs))).toBeLessThanOrEqual(line.edge + 1e-9);
    // In the 205–220 m hairpin (a right-hander) the line enters wide and cuts in.
    expect(route.curvature(212)).toBeLessThan(-0.1);
    expect(line.laneAt(196)).toBeGreaterThan(line.laneAt(212) + 1.5);
    expect(line.laneAt(236)).toBeGreaterThan(line.laneAt(212) + 1);
    // The driven arc is wider than the centreline's.
    expect(Math.abs(line.curvatureAt(212))).toBeLessThan(Math.abs(route.curvature(212)));
  });
});

describe('gokart handling', () => {
  it('moves toward the pressed arrow in the chase camera at every course heading', () => {
    for (const distance of [0, 160, 310, 500]) {
      const centre = route.sample(distance), camera = new PerspectiveCamera(58, 1.4, 0.1, 550);
      camera.position.copy(centre.position).addScaledVector(centre.tangent, -12); camera.position.y += 6;
      camera.lookAt(centre.position); camera.updateMatrixWorld();
      const left = newDriver(distance), right = newDriver(distance);
      left.u = right.u = left.speed = right.speed = 10;
      drive(left, { steer: steeringFromButtons(true, false), throttle: true }, 0, 0.4);
      drive(right, { steer: steeringFromButtons(false, true), throttle: true }, 0, 0.4);
      expect(left.heading).toBeGreaterThan(0); expect(right.heading).toBeLessThan(0);
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
    drive(driver, { steer: 0, throttle: true, brake: true }, 0, 3);
    expect(driver.speed).toBe(0);
  });
  it('has rental-kart pace: about 67 km/h flat out and a believable launch', () => {
    const driver = newDriver();
    drive(driver, { throttle: 1 }, 0, 3);
    expect(driver.speed).toBeGreaterThan(9); expect(driver.speed).toBeLessThan(12.5);
    drive(driver, { throttle: 1 }, 0, 25);
    expect(driver.speed * 3.6).toBeGreaterThan(64); expect(driver.speed * 3.6).toBeLessThan(70);
    expect(TOP_SPEED * 3.6).toBeGreaterThan(65); expect(TOP_SPEED * 3.6).toBeLessThan(70);
  });
  it('turns with real yaw: heading, yaw rate and slip angles, not a lane slider', () => {
    const driver = newDriver(); driver.u = driver.speed = 12;
    drive(driver, { steer: 0.6, throttle: 0.5 }, 0, 0.5);
    expect(driver.yawRate).toBeGreaterThan(0.3);
    expect(driver.heading).toBeGreaterThan(0.1);
    expect(driver.steerAngle).toBeGreaterThan(0.03);
    expect(driver.lane).toBeGreaterThan(0);
    // On a constant bend at a sane speed the heading settles near the tangent.
    const bend = newDriver(); bend.u = bend.speed = 9;
    let worst = 0;
    for (let i = 0; i < 360; i++) {
      const steer = clamp((Math.atan(1.5 * (0.1 - bend.lane * 0.1 - bend.heading * 0.8)) + 0.04 * (bend.u * 0.1 - bend.yawRate)) / 0.3, -1, 1);
      stepDriver(bend, { steer, throttle: clamp((9 - bend.speed) * 3 + 0.35, 0, 1) }, 0.1, STEP);
      if (i > 120) worst = Math.max(worst, Math.abs(bend.heading));
    }
    expect(worst).toBeLessThan(0.15);
    expect(bend.slip).toBe(0);
  });
  it('lets the rear step out on a lift mid-corner, and countersteer catches it', () => {
    const slide = (react) => {
      const c = newDriver(); c.u = c.speed = 10.5;
      let maxSlip = 0, maxHeading = 0, catching = false;
      const seen = [];
      for (let i = 0; i < 360; i++) {
        const t = i / 60;
        const want = 0.1 + (-c.lane * 0.15 - (c.heading + Math.atan2(c.w, c.u))) * 0.8;
        let steer = clamp((Math.atan(1.5 * want) + 0.04 * (c.u * want - c.yawRate) - 1.2 * slideAngle(c)) / 0.29, -1, 1);
        let throttle = clamp((10.5 - c.speed) * 3 + 0.35, 0, 1);
        seen.push(c.slip);
        if (t > 2) {
          steer = 1;
          if (t < 2.6) throttle = 0;
          const perceived = seen[Math.max(0, seen.length - 1 - Math.round(react * 60))];
          if (react !== null && perceived > 0.2) catching = true;
          if (catching) { steer = c.yawRate > 0.1 * c.speed ? -1 : 0; throttle = 0.7; if (perceived < 0.05) catching = false; }
          maxSlip = Math.max(maxSlip, c.slip); maxHeading = Math.max(maxHeading, Math.abs(c.heading));
        }
        stepDriver(c, { steer, throttle }, 0.1, STEP);
      }
      return { maxSlip, maxHeading, final: c };
    };
    const caught = slide(0.15);
    expect(caught.maxSlip).toBeGreaterThan(0.3);            // a real powerslide
    expect(caught.maxHeading).toBeLessThan(0.6);            // never past ~35°
    expect(Math.abs(caught.final.heading)).toBeLessThan(0.1);
    expect(Math.abs(caught.final.lane)).toBeLessThan(TRACK_HALF_WIDTH);
    expect(caught.final.slip).toBe(0);
    const ignored = slide(null);                             // holding full lock into it
    expect(ignored.maxHeading).toBeGreaterThan(caught.maxHeading);
  });
  it('braking into a fast bend shifts load forward and rotates the kart', () => {
    const run = (brake) => {
      const c = newDriver(); c.u = c.speed = 14.5;
      let rear = 0;
      for (let i = 0; i < 240; i++) {
        const want = 0.05 + (-c.lane * 0.15 - (c.heading + Math.atan2(c.w, c.u))) * 0.8;
        const steer = clamp((Math.atan(1.5 * want) + 0.04 * (c.u * want - c.yawRate) - 1.2 * slideAngle(c)) / 0.17, -1, 1);
        const late = i > 90 && i < 126;
        stepDriver(c, { steer, throttle: late ? 0 : clamp((14.5 - c.speed) * 3 + 0.35, 0, 1), brake: late ? brake : 0 }, 0.05, STEP);
        if (i > 90) rear = Math.max(rear, Math.abs(c._alphaR));
      }
      return rear;
    };
    expect(run(1)).toBeGreaterThan(run(0.3) * 1.5);
  });
  it('kerbs cost a little grip and rumble; grass is slow and bumpy', () => {
    expect(laneSurface(2)).toBe('asphalt');
    expect(laneSurface(3.6, 0.05)).toBe('kerb');
    expect(laneSurface(3.6, 0)).toBe('grass');
    expect(laneSurface(4.1)).toBe('grass');
    const surface = (lane) => ({ length: 1000, curvature: () => 0, surfaceAt: (d, l) => (Math.abs(l) > 3 ? lane : 'asphalt') });
    const onAsphalt = newDriver(0, 0), onKerb = newDriver(0, 3.6), onGrass = newDriver(0, 4.05);
    for (const driver of [onAsphalt, onKerb, onGrass]) driver.u = driver.speed = 15;
    drive(onAsphalt, { throttle: 1 }, surface('asphalt'), 1);
    drive(onKerb, { throttle: 1 }, surface('kerb'), 1);
    drive(onGrass, { throttle: 1 }, surface('grass'), 1);
    expect(onKerb.surface).toBe('kerb'); expect(onKerb.rumble).toBeGreaterThan(0.5); expect(onKerb.grip).toBeLessThan(1);
    expect(onGrass.surface).toBe('grass'); expect(onGrass.grip).toBeLessThan(0.6); expect(onGrass.bump).toBeGreaterThan(0.5);
    expect(onGrass.speed).toBeLessThan(onKerb.speed - 1.5);
    expect(onKerb.speed).toBeLessThanOrEqual(onAsphalt.speed);
  });
  it('bounces off the tyre barrier with energy loss instead of sticking', () => {
    const driver = newDriver(0, 3.4); driver.u = driver.speed = 12; driver.heading = 0.35;
    let impacts = 0, peak = 0, outward = 0;
    for (let i = 0; i < 90; i++) {
      const events = stepField([driver], [{ steer: 0, throttle: 0.5 }], 0, STEP);
      impacts += events.filter((event) => event.type === 'barrier').length;
      peak = Math.max(peak, driver.lane);
      if (impacts) outward = Math.min(outward, driver.lateral);
      expect(driver.lane).toBeLessThanOrEqual(WALL_LANE + 0.01);
    }
    expect(impacts).toBe(1);
    expect(outward).toBeLessThan(-0.3);                     // pushed back towards the track
    expect(driver.lane).toBeLessThan(peak - 0.2);           // and actually left the wall
    expect(driver.speed).toBeLessThan(12); expect(driver.speed).toBeGreaterThan(5);
    expect(driver.hit).toBeGreaterThanOrEqual(0);
  });
  it('counts a continuous wall scrape once and re-arms after returning to asphalt', () => {
    const driver = newDriver(0, WALL_LANE - 0.02); driver.u = driver.speed = 14;
    let impacts = 0;
    driver.heading = 0.15;
    for (let i = 0; i < 300; i++) impacts += Number(stepDriver(driver, { steer: 0.15, throttle: true }, 0, STEP).barrier);
    expect(impacts).toBe(1);
    expect(driver.wallContact).toBe(true);
    // Back on the asphalt, then a fresh hit.
    Object.assign(driver, { lane: 2.6, heading: 0, yawRate: 0, u: 12, w: 0 });
    drive(driver, { steer: 0, throttle: true }, 0, 0.1);
    expect(driver.wallContact).toBe(false);
    driver.heading = 0.4;
    for (let i = 0; i < 180; i++) impacts += Number(stepDriver(driver, { steer: 0, throttle: true }, 0, STEP).barrier);
    expect(impacts).toBe(2);
  });
  it('lets karts rub wheel to wheel with mass, and never tunnel through each other', () => {
    const a = newDriver(20, 0), b = newDriver(20.5, 1.3);
    a.u = a.speed = 15; b.u = b.speed = 15; a.heading = 0.12;
    const events = [];
    for (let i = 0; i < 60; i++) events.push(...stepField([a, b], [{ throttle: 1 }, { throttle: 1 }], 0, STEP));
    expect(b.lane - a.lane).toBeGreaterThan(1.3);
    expect(a.speed).toBeGreaterThan(12); expect(b.speed).toBeGreaterThan(12);
    // A fast kart straight into a stopped one: it stays behind or goes round.
    for (const closing of [10, 19, 30]) {
      const fast = newDriver(0, 0), parked = newDriver(4, 0.05);
      fast.u = fast.speed = closing;
      let crossedInside = false;
      for (let i = 0; i < 60; i++) {
        stepField([fast, parked], [{ throttle: 1 }, {}], 0, 0.05);
        const gap = trackGap(fast.distance, parked.distance, 1000);
        if (gap < 0 && Math.abs(fast.lane - parked.lane) < 1.2) crossedInside = true;
      }
      expect(crossedInside).toBe(false);
      expect(parked.speed).toBeGreaterThan(0);
    }
    const x = newDriver(20, 0), y = newDriver(21, 0.2); x.u = x.speed = 16; y.u = y.speed = 14;
    expect(resolveContact(x, y, 260)).toBe(true);
    expect(x.lane).toBeLessThan(0); expect(y.lane).toBeGreaterThan(0.2);
    expect(resolveContact(newDriver(1), newDriver(8), 260)).toBe(false);
  });
  it('only provides modest slipstream on a matching line behind another kart', () => {
    const driver = newDriver(98, 0);
    expect(slipstreamFactor(driver, [newDriver(104, 0)], 260)).toBeGreaterThan(0);
    expect(slipstreamFactor(driver, [newDriver(104, 2)], 260)).toBe(0);
    expect(slipstreamFactor(driver, [newDriver(94, 0)], 260)).toBe(0);
    expect(slipstreamFactor(newDriver(258), [newDriver(4)], 260)).toBeGreaterThan(0);
    const clear = newDriver(), following = newDriver();
    drive(clear, { throttle: true }, 0, 15);
    drive(following, { throttle: true, slipstream: 0.7 }, 0, 15);
    expect(following.speed).toBeGreaterThan(clear.speed);
    expect(following.speed - clear.speed).toBeLessThan(2);
  });
  it('punishes a jump start with wheelspin and a slow launch', () => {
    const clean = newDriver(), jumped = newDriver();
    jumped.launchPenalty = 1.4;
    drive(clean, { throttle: 1 }, 0, 0.5);
    drive(jumped, { throttle: 1 }, 0, 0.5);
    expect(jumped.wheelspin).toBeGreaterThan(0.8);
    expect(clean.wheelspin).toBeLessThan(0.1);
    drive(clean, { throttle: 1 }, 0, 1.5);
    drive(jumped, { throttle: 1 }, 0, 1.5);
    expect(clean.distance - jumped.distance).toBeGreaterThan(3);
    // Karts held on the grid do not creep, whatever the pedals do.
    const held = newDriver(); held.held = true;
    drive(held, { throttle: 1, steer: 1 }, 0, 1);
    expect(held.distance).toBe(0); expect(held.wheelspin).toBe(1);
  });
  it('never produces NaN under random inputs, surfaces, contacts and frame times', () => {
    const random = seededRandom(7);
    const karts = Array.from({ length: 6 }, (_, i) => newDriver(i * 2, (i - 2.5) * 1.4));
    for (let frame = 0; frame < 3000; frame++) {
      const inputs = karts.map(() => ({ steer: random() * 2 - 1, throttle: random() > 0.3 ? random() : 0, brake: random() > 0.85 ? random() : 0 }));
      if (frame % 97 === 0) karts[frame % 6].heading = (random() - 0.5) * 6;
      const dt = random() > 0.95 ? [0, 0.2, Number.NaN, 1e-5][Math.floor(random() * 4)] : random() * 0.05;
      stepField(karts, inputs, route, dt);
      for (const kart of karts) {
        expect(finite(kart)).toBe(true);
        expect(Math.abs(kart.lane)).toBeLessThanOrEqual(WALL_LANE + KART.halfLength);
      }
    }
  });
  it('clamps long frames and distinguishes on-track gaps from overall ranking', () => {
    const driver = newDriver(); driver.u = driver.speed = 16;
    stepDriver(driver, { brake: true }, 0, 12);
    expect(driver.speed).toBeLessThan(16);
    expect(driver.distance).toBeLessThan(1);
    expect(trackGap(259, 261, 260)).toBe(2);
    expect(trackGap(259, 521, 260)).toBe(2);
    expect(racePosition(610, [{ distance: 705 }, { distance: 609 }, { distance: 200 }])).toBe(2);
  });
});

describe('rivals and the race', () => {
  it('drives every rival personality cleanly inside the track for three laps', () => {
    for (const difficulty of Object.keys(DIFFICULTIES)) {
      for (const [i, profile] of RIVAL_PROFILES.entries()) {
        const driver = newDriver(0, 0, { assist: 1.2 });
        const brain = createBrain(profile, { line, difficulty, seed: 11 + i });
        let time = 0, worst = 0;
        while (driver.distance < route.length * LAPS && time < 200) {
          stepField([driver], [rivalInput(driver, brain, { line, track: route, drivers: [driver] })], route, STEP);
          time += STEP;
          worst = Math.max(worst, Math.abs(driver.lane));
          expect(finite(driver)).toBe(true);
        }
        expect(worst).toBeLessThan(WALL_LANE);
        expect(time / LAPS).toBeGreaterThan(40); expect(time / LAPS).toBeLessThan(56);
      }
    }
  });
  it('makes Jonas quicker than careful Rickard and hard quicker than easy', () => {
    const lapTime = (profile, difficulty) => {
      const driver = newDriver(0, 0, { assist: 1.2 });
      const brain = createBrain(profile, { line, difficulty, seed: 5 });
      brain.mistakeClock = Infinity;
      let time = 0;
      while (driver.distance < route.length * 2 && time < 200) {
        stepField([driver], [rivalInput(driver, brain, { line, track: route, drivers: [driver] })], route, STEP);
        time += STEP;
      }
      return time;
    };
    const [jonas, rickard] = [RIVAL_PROFILES[0], RIVAL_PROFILES[4]];
    expect(lapTime(jonas, 'normal')).toBeLessThan(lapTime(rickard, 'normal'));
    expect(lapTime(jonas, 'hard')).toBeLessThan(lapTime(jonas, 'easy') - 3);
    expect(createBrain(jonas, { line, seed: 1 }).aggression).toBeGreaterThan(createBrain(rickard, { line, seed: 1 }).aggression);
  });
  it('makes rivals pick a side before catching a slower kart, and never ram it', () => {
    const straight = { length: 1000, curvature: () => 0 };
    const flatLine = buildRacingLine(straight);
    const rival = { ...newDriver(10, 0, { assist: 1.2 }) }; rival.u = rival.speed = 14;
    const brain = createBrain(RIVAL_PROFILES[1], { line: flatLine, seed: 3 });
    brain.mistakeClock = Infinity;
    const slower = newDriver(18, 0); slower.u = slower.speed = 8;
    let closest = Infinity;
    for (let i = 0; i < 180; i++) {
      const input = rivalInput(rival, brain, { line: flatLine, track: straight, drivers: [rival, slower] });
      stepField([rival, slower], [input, { throttle: 0.45 }], straight, STEP);
      if (Math.abs(rival.lane - slower.lane) < 1.6) closest = Math.min(closest, trackGap(rival.distance, slower.distance, 1000));
    }
    expect(Math.abs(rival.lane - slower.lane)).toBeGreaterThan(1.6);
    expect(closest).toBeGreaterThan(2.2);
  });
  it('lets ordinary digital steering and braking beat the field on normal', () => {
    const { player, drivers, worst } = runRace({ difficulty: 'normal', seed: 2 });
    expect(player.finishTime).toBeGreaterThan(125);
    expect(player.finishTime).toBeLessThan(165);
    expect(raceStandings(drivers)[0]).toBe(player);
    expect(worst.nan).toBe(false);
    expect(worst.lane).toBeLessThan(WALL_LANE + 0.01);
  });
  it('keeps catch-up mild and invisible', () => {
    expect(catchupFactor(100, 100)).toBe(1);
    expect(catchupFactor(300, 100)).toBeGreaterThan(0.95);
    expect(catchupFactor(300, 100)).toBeLessThan(1);
    expect(catchupFactor(0, 300)).toBeLessThan(1.025);
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
});

describe('time trial ghost', () => {
  it('records at about 20 Hz and round-trips through versioned storage', () => {
    const recorder = createGhostRecorder();
    recorder.start();
    for (let t = 0; t <= 45; t += 1 / 60) recorder.record(t, t * 14.7, Math.sin(t) * 2, Math.cos(t) * 0.1);
    const ghost = recorder.finish(45.2, 665);
    expect(ghost.samples.length).toBeGreaterThan(45 * 19); expect(ghost.samples.length).toBeLessThan(45 * 21);
    const store = new Map();
    const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
    expect(saveGhost(ghost, storage)).toBe(true);
    expect(GHOST_KEY).toMatch(/v\d+$/);
    expect(store.get(GHOST_KEY).length).toBeLessThan(40000);
    const back = loadGhost(storage);
    expect(back.lapTime).toBeCloseTo(45.2, 3);
    expect(back.samples.length).toBe(ghost.samples.length);
    const pose = ghostAt(back, 20), original = ghostAt(ghost, 20);
    expect(pose.distance).toBeCloseTo(original.distance, 0);
    expect(pose.lane).toBeCloseTo(original.lane, 1);
    expect(ghostTimeAt(back, 14.7 * 30)).toBeCloseTo(30, 1);
    expect(decodeGhost('{"v":0}')).toBe(null);
    expect(decodeGhost('not json')).toBe(null);
    expect(decodeGhost(encodeGhost(ghost).replace('"v":1', '"v":2'))).toBe(null);
    expect(loadGhost({ getItem() { throw new Error('private mode'); } })).toBe(null);
  });
});

describe('race presentation helpers', () => {
  it('makes throttle load audible while quietening coasting, braking and the result screen', () => {
    const loaded = engineFeedback(10, { throttle: true });
    const coasting = engineFeedback(10);
    expect(loaded.gain).toBeGreaterThan(coasting.gain * 2);
    expect(engineFeedback(10, { throttle: true, brake: true })).toEqual(coasting);
    expect(engineFeedback(16, { throttle: true }).frequency).toBeGreaterThan(loaded.frequency);
    expect(engineFeedback(16, { throttle: true, active: false }).gain).toBe(0);
  });
  it('never displays an impossible sixty-second remainder in the HUD or results', () => {
    expect(formatTime(59.99)).toBe('0:59.9');
    expect(formatTime(60.01)).toBe('1:00.0');
    expect(formatTime(137.95)).toBe('2:17.9');
  });
  it('scores finishing position, time and clean racing', () => {
    expect(raceScore(1, 50, 0)).toBeGreaterThan(raceScore(2, 50, 0));
    expect(raceScore(1, 50, 0)).toBeGreaterThan(raceScore(1, 60, 0));
    expect(raceScore(1, 50, 0)).toBeGreaterThan(raceScore(1, 50, 3));
  });
});
