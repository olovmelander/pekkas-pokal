import { describe, it, expect } from 'vitest';
import { precisionScore, jumpScore, hoopCrossing, medalFor, chargePower } from '../src/games/pentathlon/rules.js';

describe('park tournament rules', () => {
  it('rewards accuracy without negative scores', () => {
    expect(precisionScore(0)).toBe(100);
    expect(precisionScore(1.5)).toBe(50);
    expect(precisionScore(9)).toBe(0);
  });
  it('counts a board take-off but disallows crossing the foul line', () => {
    expect(jumpScore(-3)).toEqual({ foul: false, distance: 7, points: 100 });
    expect(jumpScore(-3.001).foul).toBe(true);
    expect(jumpScore(2).points).toBe(0);
  });
  it('requires a forward passage through the actual hoop opening', () => {
    const h = { x: 1, z: 0 };
    expect(hoopCrossing({ x: 0, z: 2 }, { x: 2, z: -2 }, h)).toBe(true);
    expect(hoopCrossing({ x: 3, z: 2 }, { x: 3, z: -2 }, h)).toBe(false);
    expect(hoopCrossing({ x: 1, z: -2 }, { x: 1, z: 2 }, h)).toBe(false);
    expect(hoopCrossing({ x: 1, z: 2 }, { x: 1, z: 1 }, h)).toBe(false);
  });
  it('uses the same medal thresholds for both tournament lengths', () => {
    expect(medalFor(400, 5)).toBe('Guld');
    expect(medalFor(240, 3)).toBe('Guld');
    expect(medalFor(100, 3)).toBe('Brons');
  });
  it('cycles charge continuously instead of rewarding a permanently held button', () => {
    expect(chargePower(0)).toBe(0);
    expect(chargePower(1.2)).toBe(1);
    expect(chargePower(2.4)).toBe(0);
    expect(chargePower(3)).toBeCloseTo(0.5);
  });
});
