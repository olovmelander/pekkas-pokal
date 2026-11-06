import { describe, it, expect } from 'vitest';
import {
  PONG, rackCups, pongPower, pongLanding, pongIdealPower, pongAimFor, pongJudge, pongScore,
  FLIP, FLIP_TIMING, flipOutcome, flipAttemptTime, rivalFlipPlan, flipCupScore
} from '../src/games/uppsala/party-rules.js';

const seeded = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

describe('beer pong', () => {
  it('racks six cups in a 3-2-1 triangle on the far end of the table, point first', () => {
    const cups = rackCups();
    expect(cups).toHaveLength(6);
    for (const c of cups) {
      expect(Math.abs(c.x) + PONG.cupRim).toBeLessThanOrEqual(PONG.tableHalfWidth);
      expect(c.z - PONG.cupRim).toBeGreaterThanOrEqual(PONG.tableFar);
    }
    for (let i = 0; i < cups.length; i++) for (let j = i + 1; j < cups.length; j++) {
      expect(Math.hypot(cups[i].x - cups[j].x, cups[i].z - cups[j].z)).toBeGreaterThanOrEqual(2 * PONG.cupRim);
    }
    const apex = cups.reduce((a, b) => (b.z > a.z ? b : a));
    expect(apex.x).toBeCloseTo(0);
  });

  it('can sink every cup with the aim and power the game points to', () => {
    const cups = rackCups();
    for (const cup of cups) {
      const judge = pongJudge(pongLanding(pongAimFor(cup), pongIdealPower(cup)), cups);
      expect(judge.result).toBe('sink');
      expect(judge.cup).toBe(cup);
    }
  });

  it('leaves a fair timing window: about a tenth of the meter per cup', () => {
    const cups = rackCups(), front = cups.find((c) => c.z === Math.max(...cups.map((x) => x.z)));
    const ideal = pongIdealPower(front);
    let lo = ideal, hi = ideal;
    while (pongJudge(pongLanding(0, lo - 0.001), [front]).result === 'sink') lo -= 0.001;
    while (pongJudge(pongLanding(0, hi + 0.001), [front]).result === 'sink') hi += 0.001;
    expect(hi - lo).toBeGreaterThan(0.09);
    // With the slower beer pong meter that is more than a tenth of a second.
    expect((hi - lo) * 1.2 / PONG.chargeRate).toBeGreaterThan(0.12);
  });

  it('calls the rim, the table and a throw off the end', () => {
    const cups = rackCups(), cup = cups[1];
    expect(pongJudge({ x: cup.x + PONG.cupRim, z: cup.z }, [cup]).result).toBe('rim');
    expect(pongJudge({ x: 0, z: 5.5 }, cups).result).toBe('table');
    expect(pongJudge(pongLanding(0, 1), cups).result).toBe('off');
    // The widest aim still lands on the table, outside the rack.
    expect(pongJudge(pongLanding(4.4, 0.5), cups).result).toBe('table');
    expect(pongLanding(4.4, 0.5).x).toBeGreaterThan(Math.max(...cups.map((c) => c.x)) + PONG.cupRim + PONG.ball);
  });

  it('ignores cups that are already gone', () => {
    const cups = rackCups(), cup = cups[0];
    cup.live = false;
    expect(pongJudge({ x: cup.x, z: cup.z }, cups).result).not.toBe('sink');
  });

  it('climbs the meter more slowly than the lawn throws', () => {
    expect(pongPower(1.2)).toBeCloseTo(0.8);
    expect(pongPower(1.5)).toBeCloseTo(1);
  });

  it('scores the rack and rewards clearing it early, never above 100', () => {
    expect(pongScore(0, 10)).toBe(0);
    expect(pongScore(3, 10)).toBe(43);
    expect(pongScore(6, 10)).toBe(85);
    expect(pongScore(6, 7)).toBe(100);
    expect(pongScore(6, 6)).toBe(100);
  });
});

describe('flip cup', () => {
  it('keeps every flip window inside the meter', () => {
    for (const sweet of FLIP.sweet) {
      expect(sweet - FLIP.tolerance).toBeGreaterThan(0.2);
      expect(sweet + FLIP.tolerance).toBeLessThan(0.95);
    }
  });

  it('flips in the window, falls back when soft and rolls when hard', () => {
    const sweet = FLIP.sweet[0];
    expect(flipOutcome(sweet, sweet)).toBe('flip');
    expect(flipOutcome(sweet - FLIP.tolerance + 0.001, sweet)).toBe('flip');
    expect(flipOutcome(sweet - FLIP.tolerance - 0.01, sweet)).toBe('short');
    expect(flipOutcome(sweet + FLIP.tolerance + 0.01, sweet)).toBe('over');
  });

  it('plans a rival relay that always finishes, with the time it takes', () => {
    for (let seed = 1; seed < 40; seed++) {
      const plan = rivalFlipPlan(seeded(seed));
      expect(plan.legs).toHaveLength(FLIP.legs);
      for (const leg of plan.legs) {
        expect(leg.attempts.at(-1)).toBe('flip');
        expect(leg.attempts.length).toBeLessThanOrEqual(6);
        expect(leg.attempts.slice(0, -1).every((o) => o === 'short' || o === 'over')).toBe(true);
      }
      expect(plan.total).toBeCloseTo(plan.legs.reduce((s, l) => s + l.time, 0));
    }
  });

  it('makes the rivals beatable by a clean run but not by a sloppy one', () => {
    let sum = 0;
    for (let seed = 1; seed <= 400; seed++) sum += rivalFlipPlan(seeded(seed)).total;
    const average = sum / 400;
    // A clean leg: react, drink, place, react, charge to the window, flip.
    const clean = FLIP.legs * (0.3 + FLIP.drink + FLIP_TIMING.place + 0.3 + 0.62 * 1.2 + FLIP_TIMING.flip);
    const sloppy = clean + 4 * (0.3 + 0.62 * 1.2 + flipAttemptTime('over') - FLIP_TIMING.charge);
    expect(average).toBeGreaterThan(12.5);
    expect(average).toBeLessThan(15);
    expect(clean).toBeLessThan(average);
    expect(sloppy).toBeGreaterThan(average);
  });

  it('scores the time up to 90 and adds ten for the win', () => {
    expect(flipCupScore(FLIP.par, true)).toBe(100);
    expect(flipCupScore(FLIP.par - 2, false)).toBe(90);
    expect(flipCupScore(FLIP.par + 5, false)).toBe(60);
    expect(flipCupScore(99, false)).toBe(0);
    expect(flipCupScore(99, true)).toBe(10);
  });
});
