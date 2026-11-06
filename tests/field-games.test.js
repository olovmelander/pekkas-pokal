import { describe, it, expect } from 'vitest';
import { precisionScore, jumpScore, hoopCrossing, hurdleHeight, medalFor, chargePower, croquetEnd, fieldThrowScore } from '../src/games/pentathlon/rules.js';

describe('park tournament rules', () => {
  it('rewards accuracy without negative scores', () => {
    expect(precisionScore(0)).toBe(100);
    expect(precisionScore(1.5)).toBe(50);
    expect(precisionScore(9)).toBe(0);
  });
  it('counts a board take-off but disallows crossing the foul line', () => {
    expect(jumpScore(-3)).toEqual({ foul: false, distance: 7, travel: 7, points: 100 });
    expect(jumpScore(-3.001).foul).toBe(true);
    expect(jumpScore(2).points).toBe(0);
    expect(jumpScore(2).distance).toBe(0);
    expect(jumpScore(-2).distance).toBeCloseTo(jumpScore(-2).travel - 1);
  });
  it('preserves croquet aim angle when power changes and makes all three hoops reachable', () => {
    const start = { x: 0, z: 7 };
    const soft = croquetEnd(start, 2, 0.2), hard = croquetEnd(start, 2, 0.8);
    expect((soft.x - start.x) / (start.z - soft.z)).toBeCloseTo((hard.x - start.x) / (start.z - hard.z));
    let from = start;
    for (const hoop of [{ x: -1.8, z: 2 }, { x: 1.7, z: -3 }, { x: -0.5, z: -8 }]) {
      const angle = Math.atan2(hoop.x - from.x, from.z - hoop.z);
      const power = (Math.hypot(hoop.x - from.x, hoop.z - from.z) + 0.7 - 2) / 7;
      expect(hoopCrossing(from, croquetEnd(from, angle / 0.19, power), hoop)).toBe(true);
      from = { x: hoop.x, z: hoop.z - 0.8 };
    }
  });
  it('counts a ring around the peg as full marks and rewards beating the boule opponent', () => {
    expect(fieldThrowScore('rings', 0.4)).toBe(100);
    expect(fieldThrowScore('rings', 4)).toBe(0);
    expect(fieldThrowScore('boule', 0.8)).toBeGreaterThan(fieldThrowScore('boule', 1));
    expect(fieldThrowScore('boule', 0)).toBe(100);
  });
  it('requires a forward passage through the actual hoop opening', () => {
    const h = { x: 1, z: 0 };
    expect(hoopCrossing({ x: 0, z: 2 }, { x: 2, z: -2 }, h)).toBe(true);
    expect(hoopCrossing({ x: 3, z: 2 }, { x: 3, z: -2 }, h)).toBe(false);
    expect(hoopCrossing({ x: 1, z: -2 }, { x: 1, z: 2 }, h)).toBe(false);
    expect(hoopCrossing({ x: 1, z: 2 }, { x: 1, z: 1 }, h)).toBe(false);
  });
  it('requires the whole ball to clear the croquet uprights', () => {
    const hoop = { x: 0, z: 0 };
    expect(hoopCrossing({ x: 0.52, z: 2 }, { x: 0.52, z: -2 }, hoop)).toBe(true);
    // The visual ball has radius .23; its centre alone fitting is not a pass.
    expect(hoopCrossing({ x: 0.54, z: 2 }, { x: 0.54, z: -2 }, hoop)).toBe(false);
    expect(hoopCrossing({ x: -0.67, z: 2 }, { x: -0.67, z: -2 }, hoop)).toBe(false);
  });
  it('judges the same late hurdle clearance at 20, 60 and 120 fps', () => {
    const crossingTime = 0.75;
    const heights = [20, 60, 120].map(fps => {
      const dt = 1 / fps, frameTime = crossingTime + dt * 0.8;
      const from = 2.55 * (crossingTime - frameTime + dt), to = 2.55 * (crossingTime - frameTime);
      return hurdleHeight(from, to, 0, frameTime, dt);
    });
    heights.forEach(height => { expect(height).toBeCloseTo(0.675); expect(height).toBeGreaterThan(0.65); });
    expect(hurdleHeight(1, 0.9, 0, 0.2, 0.05)).toBe(0);
    expect(hurdleHeight(0.1, -0.1, 0, 1.2, 0.05)).toBe(0);
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
