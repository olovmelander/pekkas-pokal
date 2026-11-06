import { describe, it, expect } from 'vitest';
import { stackPlacement, nailStrike, woodScore } from '../src/games/farm/wood-rules.js';

describe('Bondespelen: wood events', () => {
  it('rejects unsupported drops, retains overlap and rewards centered placement', () => {
    expect(stackPlacement({ x: 0, width: 3.8 }, { x: 4, width: 3.8 }).stable).toBe(false);
    expect(stackPlacement({ x: 0, width: 3.8 }, { x: 1, width: 3.8 }).width).toBeCloseTo(2.8);
    expect(stackPlacement({ x: 0, width: 3 }, { x: 0.1, width: 3 }).perfect).toBe(true);
    const narrow = stackPlacement({ x: 0, width: 0.46 }, { x: 0.05, width: 0.46 });
    expect(narrow.stable).toBe(true);
    expect(narrow.width).toBeGreaterThan(0.46);
  });
  it('makes accurate strikes substantially faster than rushed mistimed strikes', () => {
    expect(nailStrike(0).gain).toBe(0);
    expect(nailStrike(0.5).gain).toBe(0.36);
    expect(nailStrike(0.5, 0.9).depth).toBe(1);
    expect(nailStrike(0.35).gain).toBe(0.22);
  });
  it('bounds scores and only awards hammer speed bonus after all nails', () => {
    expect(woodScore('stack', 30)).toBe(1000);
    expect(woodScore('hammer', 4, 20)).toBe(680);
    expect(woodScore('hammer', 5, 10)).toBe(933);
    expect(woodScore('hammer', 5, 18)).toBe(1000);
    expect(woodScore('hammer', 5, 30)).toBe(1000);
    expect(woodScore('hammer', 5, 0)).toBe(850);
  });
});
