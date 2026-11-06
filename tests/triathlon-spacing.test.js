import { describe, expect, it } from 'vitest';
import { Box3, Scene } from 'three';
import { createAthlete } from '../src/games/triathlon/athlete.js';
import { RIVALS, rivalLane } from '../src/games/triathlon/rivals.js';
import { STAGES, CATCH_RADIUS, advancePace, canDraft, passageLane, rivalAtTime } from '../src/games/triathlon/rules.js';
import {
  BODY, EASE, COURSE_EDGE, clearance, sideRoom, bodiesOverlap, separatePlayer, clearStart
} from '../src/games/triathlon/spacing.js';

const LEGS = ['swim', 'run', 'bike'];
const DT = 1 / 60;
// Steering tops out at 5.8 m/s; the eased sidestep must stay below that.
const MAX_SIDESTEP = 4.5;

/** One rival, one player, constant speeds: the frame loop of index.js reduced to the contact. */
function duel({ leg, lane, gap, offset = 0, closing, rivalSpeed = STAGES[LEGS.indexOf(leg)].speed, steer = () => 0, items = [], seconds = 12 }) {
  const rival = { lane, distance: 100 + gap, speed: rivalSpeed };
  const player = { x: lane + offset, distance: 100, speed: rivalSpeed + closing };
  const log = [];
  let lateral = 0;
  for (let frame = 0; frame < seconds / DT; frame++) {
    const prevDistance = rival.distance;
    rival.distance += rival.speed * DT;
    const direction = steer(player, rival);
    lateral += (direction * 5.8 - lateral) * (1 - Math.exp(-DT * 13));
    const to = { x: Math.max(-COURSE_EDGE, Math.min(COURSE_EDGE, player.x + lateral * DT)), distance: player.distance + player.speed * DT };
    const next = separatePlayer({ discipline: leg, dt: DT, steer: direction, items, rivals: [{ lane: rival.lane, distance: rival.distance, prevDistance }], from: player, to });
    for (const item of items) {
      const crossing = item.resolved ? null : passageLane(player.distance, next.distance, player.x, next.x, item.at);
      if (crossing !== null) { item.resolved = true; item.taken = Math.abs(crossing - item.x) < CATCH_RADIUS[item.kind]; }
    }
    log.push({ ...next, raw: to, before: { ...player }, rival: { x: rival.lane, distance: rival.distance }, gap: rival.distance - next.distance });
    player.x = next.x; player.distance = next.distance;
  }
  return log;
}

function expectPhysical(leg, log) {
  for (const frame of log) {
    expect(bodiesOverlap(leg, frame, frame.rival)).toBe(false);
    expect(Math.abs(frame.x)).toBeLessThanOrEqual(COURSE_EDGE);
    expect(frame.distance).toBeGreaterThanOrEqual(frame.before.distance);
    // Never a snap: no faster sideways than the player's own steering or the eased sidestep.
    const own = Math.abs(frame.raw.x - frame.before.x);
    expect(Math.abs(frame.x - frame.before.x)).toBeLessThanOrEqual(Math.max(own, MAX_SIDESTEP * DT) + 1e-9);
  }
}

describe('triathlon body spacing', () => {
  it('uses the measured width and length of the swimmer, runner and cyclist', () => {
    const scene = new Scene();
    const measured = Object.fromEntries(LEGS.map(leg => [leg, { width: 0, length: 0 }]));
    for (const [name, player] of [['Viktor Jones', true], ['Per Vikman', false]]) {
      const athlete = createAthlete(scene, name, 0xc25856, player);
      for (const leg of LEGS) {
        const envelope = new Box3();
        athlete.reset();
        for (let frame = 0; frame < 240; frame++) {
          const surge = frame % 120 > 60;
          athlete.update(leg, DT, frame * DT, surge, STAGES[LEGS.indexOf(leg)].speed * (surge ? 1.5 : 1));
          athlete.root.updateMatrixWorld(true);
          // Bodies and bikes only: the flat contact ring and wake are not bodies.
          athlete.root.traverseVisible(object => { if (object.isMesh && object.geometry.type !== 'RingGeometry') envelope.expandByObject(object, true); });
        }
        measured[leg].width = Math.max(measured[leg].width, envelope.max.x - envelope.min.x);
        measured[leg].length = Math.max(measured[leg].length, envelope.max.z - envelope.min.z);
      }
      athlete.dispose();
    }
    scene.clear();
    for (const leg of LEGS) {
      expect(BODY[leg].width).toBeGreaterThanOrEqual(measured[leg].width);
      expect(BODY[leg].width - measured[leg].width).toBeLessThan(0.03);
      expect(BODY[leg].length).toBeGreaterThanOrEqual(measured[leg].length);
      expect(BODY[leg].length - measured[leg].length).toBeLessThan(0.03);
    }
  });

  it('keeps the swim start lanes free of any push', () => {
    const swimmers = RIVALS.map(r => ({ lane: r.swimLane, distance: 0, prevDistance: 0 }));
    for (const x of [0, 0.3, 0.646]) {
      const to = { x, distance: 0.14 };
      expect(separatePlayer({ discipline: 'swim', dt: DT, rivals: swimmers, from: { x, distance: 0 }, to })).toEqual({ ...to, eased: false, held: false });
    }
  });

  for (const leg of LEGS) {
    it(`slides round a rival with no overlap while passing in the ${leg} leg`, () => {
      const lanes = RIVALS.map((r, i) => (leg === 'swim' ? r.swimLane : rivalLane({ ...r, stage: 1, phase: i * 1.8 }, 7)));
      for (const lane of lanes) for (const offset of [-0.3, -0.04, 0, 0.04, 0.3]) for (const closing of [1, 4, 8]) {
        const log = duel({ leg, lane, gap: 9, offset, closing, seconds: 14 / closing + 1 });
        expectPhysical(leg, log);
        // Nobody is stuck: the player ends up clearly ahead.
        expect(log.at(-1).gap).toBeLessThan(-clearance(leg).end);
      }
    });
  }

  it('holds the player just behind instead of pushing them into a ring, then lets them steer past either side', () => {
    const tobias = RIVALS[2].swimLane;
    // Just outside the middle ring's reach; a sidestep to the right would land inside it.
    const ring = () => [{ kind: 'gate', at: 112, x: 0, resolved: false }];
    const items = ring();
    const held = duel({ leg: 'swim', lane: tobias, gap: 5, offset: 0.075, closing: 3, items, seconds: 3 });
    expectPhysical('swim', held);
    expect(held.some(frame => frame.held)).toBe(true);
    expect(items[0].taken).toBe(false);
    for (const way of [1, -1]) {
      const log = duel({ leg: 'swim', lane: tobias, gap: 5, offset: 0.075, closing: 3, items: ring(), seconds: 6, steer: (player, rival) => (rival.distance - player.distance > -3 ? way : 0) });
      expectPhysical('swim', log);
      expect(log.at(-1).gap).toBeLessThan(-clearance('swim').end);
    }
  });

  it('never presses a passing player back: touching costs no distance', () => {
    for (const leg of LEGS) {
      const { side } = clearance(leg);
      // Alongside and steering straight into the rival the whole way past.
      const log = duel({ leg, lane: 0, gap: 0.3, offset: side + 0.05, closing: 2, steer: () => -1, seconds: 3 });
      expectPhysical(leg, log);
      expect(log.some(frame => frame.eased)).toBe(true);
      for (const frame of log) expect(frame.distance).toBe(frame.raw.distance);
      expect(log.at(-1).gap).toBeLessThan(-clearance(leg).end);
    }
  });

  it('moves the player aside smoothly when a faster rival comes from behind', () => {
    for (const leg of LEGS) for (const offset of [-0.2, 0, 0.2]) {
      const log = duel({ leg, lane: -1, gap: -8, offset, closing: -3, seconds: 7 });
      expectPhysical(leg, log);
      expect(log.at(-1).gap).toBeGreaterThan(clearance(leg).end);
    }
  });
});

describe('triathlon drafting with body spacing', () => {
  it('leaves the drafting window intact: the sidestep and the hold both stay inside it', () => {
    const { side, end } = clearance('bike');
    expect(side).toBeLessThan(1.05);
    expect(end).toBeGreaterThan(2);
    for (const offset of [0, 0.3, -0.6]) for (const closing of [0.5, 3]) {
      const log = duel({ leg: 'bike', lane: 0, gap: 15, offset, closing, seconds: 20 });
      for (const frame of log) {
        if (frame.gap <= 2 || frame.gap >= 16) continue;
        expect(canDraft(2, frame.distance, frame.x, { stage: 2, distance: frame.rival.distance, lane: 0, finished: false })).toBe(Math.abs(frame.x) < 1.05);
        if (Math.abs(offset) < 1.05) expect(Math.abs(frame.x)).toBeLessThan(1.05);
      }
    }
    // Held behind (the sidestep would carry the player off a bottle): sheltered all the way, bottle kept.
    const items = [{ kind: 'drink', at: 155, x: -0.6, resolved: false }];
    const log = duel({ leg: 'bike', lane: 0, gap: 8, offset: 0.1, closing: 2, items, seconds: 6 });
    expectPhysical('bike', log);
    expect(items[0].taken).toBe(true);
    const held = log.filter(frame => frame.held);
    expect(held.length).toBeGreaterThan(10);
    for (const frame of held) expect(canDraft(2, frame.distance, frame.x, { stage: 2, distance: frame.rival.distance, lane: 0, finished: false })).toBe(true);
  });

  it('does nothing at all when no rival is within reach', () => {
    const { end } = clearance('bike');
    const from = { x: 0.2, distance: 300 }, to = { x: 0.25, distance: 300.3 };
    for (const gap of [end + EASE + 0.01, 10, 16, -(end + EASE + 0.01)]) {
      expect(separatePlayer({ discipline: 'bike', dt: DT, from, to, rivals: [{ lane: 0.2, distance: 300.3 + gap, prevDistance: 300 + gap }] }))
        .toEqual({ ...to, eased: false, held: false });
    }
    expect(sideRoom('bike', end + EASE)).toBe(0);
    expect(sideRoom('bike', end)).toBeCloseTo(clearance('bike').side, 12);
  });
});

describe('triathlon spacing robustness', () => {
  it('stays finite for degenerate frames and inputs', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 4000; i++) {
      const leg = LEGS[i % 3];
      const from = { x: (random() - 0.5) * 7.7, distance: random() * 600 };
      const to = { x: from.x + (random() - 0.5) * 0.4, distance: from.distance + random() * 2 };
      const rivals = Array.from({ length: 3 }, () => {
        const lane = random() < 0.1 ? to.x : (random() - 0.5) * 6;
        const distance = random() < 0.1 ? to.distance : to.distance + (random() - 0.5) * 10;
        return { lane, distance, prevDistance: random() < 0.2 ? undefined : distance - random() };
      });
      rivals.push({ lane: NaN, distance: to.distance }, { lane: 0, distance: Infinity });
      const dt = [0, DT, 0.25, 1, NaN][i % 5];
      const result = separatePlayer({ discipline: leg, dt, from, to, rivals, steer: [-1, 0, 1][i % 3] });
      expect(Number.isFinite(result.x)).toBe(true);
      expect(Number.isFinite(result.distance)).toBe(true);
      expect(Math.abs(result.x)).toBeLessThanOrEqual(COURSE_EDGE);
      expect(result.distance).toBeGreaterThanOrEqual(from.distance);
    }
    // Exactly on top of a rival, standing still, zero time.
    const still = { x: 0, distance: 50 };
    const stacked = separatePlayer({ discipline: 'run', dt: 0, from: still, to: still, rivals: [{ lane: 0, distance: 50, prevDistance: 50 }] });
    expect(Number.isFinite(stacked.x) && Number.isFinite(stacked.distance)).toBe(true);
    expect(Math.abs(clearStart('run', 0, 0, [{ lane: 0, distance: 0.5 }]))).toBeCloseTo(clearance('run').side, 12);
    expect(clearStart('run', 0.2, 0, [{ lane: 0, distance: 0.5 }])).toBeCloseTo(clearance('run').side, 12);
    expect(clearStart('run', NaN, 0, [{ lane: 0, distance: 0 }])).toBeNaN();
  });

  it('races the real rivals with no overlap and the same finish times as before', () => {
    const race = separate => {
      const rivals = RIVALS.map((r, i) => ({ ...r, phase: i * 1.8, ...rivalAtTime(0, r.duration, r.strengths) }));
      let stage = 0, distance = 0, elapsed = 0, x = 0, stamina = 100, exhausted = false, lateral = 0, time = 0, contact = 0;
      let { speed } = STAGES[0];
      const splits = [];
      while (stage < STAGES.length && elapsed < 200) {
        time += DT;
        const leg = STAGES[stage].id;
        const drafting = rivals.some(r => canDraft(stage, distance, x, { ...r, lane: rivalLane(r, time) }));
        // A bot that keeps swinging across all three rival lines.
        const aim = [-2.4, 0, 2.2, 0][Math.floor(distance / 40) % 4];
        const direction = Math.abs(aim - x) > 0.2 ? Math.sign(aim - x) : 0;
        const current = leg === 'swim' ? Math.sin(elapsed * 0.65) * 0.21 : 0;
        lateral += (direction * (leg === 'bike' ? 5.8 : 4.8) - lateral) * (1 - Math.exp(-DT * 13));
        const pace = advancePace({ stamina, exhausted, stage, surge: stamina > 45, drafting, slow: 0, speed }, DT, STAGES[stage].distance - distance);
        ({ stamina, exhausted, speed } = pace);
        const from = { x, distance };
        let to = { x: Math.max(-COURSE_EDGE, Math.min(COURSE_EDGE, x + (lateral + current) * pace.time)), distance: distance + pace.distance };
        elapsed += pace.time;
        for (const r of rivals) {
          const before = r.stage, last = r.distance;
          Object.assign(r, rivalAtTime(elapsed, r.duration, r.strengths));
          r.prevDistance = before === r.stage ? last : r.distance;
        }
        const field = rivals.filter(r => r.stage === stage && !r.finished).map(r => ({ lane: rivalLane(r, time), distance: r.distance, prevDistance: r.prevDistance }));
        if (separate) to = separatePlayer({ discipline: leg, dt: pace.time, steer: direction, rivals: field, from, to });
        ({ x, distance } = to);
        for (const r of field) {
          const overlap = bodiesOverlap(leg, { x, distance }, { x: r.lane, distance: r.distance });
          if (separate) expect(overlap).toBe(false);
          if (overlap) contact++;
        }
        if (distance >= STAGES[stage].distance) {
          splits.push(elapsed); stage++; distance = 0;
          if (stage < STAGES.length) {
            const next = STAGES[stage].id;
            const spawn = rivals.filter(r => r.stage === stage && !r.finished).map(r => ({ lane: rivalLane(r, time), distance: r.distance }));
            if (separate) x = clearStart(next, x, 0, spawn);
          }
        }
        for (const v of [x, distance, elapsed, stamina]) expect(Number.isFinite(v)).toBe(true);
      }
      return { elapsed, splits, contact };
    };
    const before = race(false), after = race(true);
    // The old free passage really did drive through bodies on this line.
    expect(before.contact).toBeGreaterThan(0);
    expect(after.contact).toBe(0);
    expect(after.splits).toHaveLength(3);
    expect(Math.abs(after.elapsed - before.elapsed)).toBeLessThan(1.5);
    expect(after.elapsed).toBeGreaterThan(70);
    expect(after.elapsed).toBeLessThan(110);
  });
});
