import { describe, expect, it } from 'vitest';
import { dodgeMultiplier, bottomReward, tapRadiusNdc, isPerfectCatch } from '../src/games/fishing/rules.js';

describe('Fishing rewards and pointer targets', () => {
  it('keeps a close-pass reward on later ordinary dodges', () => {
    expect(dodgeMultiplier(1, 1)).toBe(1.75);
    expect(dodgeMultiplier(2, 1)).toBe(2.25);
    expect(dodgeMultiplier(3, 2)).toBe(3);
    expect(dodgeMultiplier(40, 40)).toBe(10);
  });
  it('gives the promised full ascent multiplier at the bottom', () => {
    expect(bottomReward(1.75)).toEqual({ bonus: 2625, multiplier: 12 });
    expect(bottomReward(10)).toEqual({ bonus: 15000, multiplier: 12 });
  });
  it('rewards all secured fish even after early fish finish their barrel animation', () => {
    expect(isPerfectCatch(3, 3)).toBe(true);
    expect(isPerfectCatch(3, 2)).toBe(false);
    expect(isPerfectCatch(0, 0)).toBe(false);
  });
  it('keeps airborne hit areas circular and at least 44 CSS pixels on all aspect ratios', () => {
    for (const [width, height] of [[390, 844], [844, 390], [1365, 900], [320, 568]]) {
      const ndcRadius = tapRadiusNdc(width, height);
      const radiusY = ndcRadius * height / 2;
      const radiusX = ndcRadius / (width / height) * width / 2;
      expect(radiusX).toBeCloseTo(radiusY);
      expect(radiusY * 2).toBeGreaterThanOrEqual(44);
      expect(radiusY * 2).toBeLessThanOrEqual(68);
    }
  });
});
