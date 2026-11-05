import { describe, it, expect } from 'vitest';
import { riflePoints, bootTrajectory, bootRange, horseshoePoints } from '../src/games/farm/rules.js';

describe('the confirmed Bondespelen 2015 disciplines', () => {
  it('rewards centered air-rifle hits and gives no points outside the ring target', () => {
    expect(riflePoints(0)).toBe(1000);
    expect(riflePoints(0.8)).toBe(500);
    expect(riflePoints(1.6)).toBe(0);
    expect(riflePoints(4)).toBe(0);
  });
  it('makes launch angle and force meaningful in the boot throw', () => {
    expect(bootRange(1, 44)).toBeGreaterThan(bootRange(1, 25));
    expect(bootRange(1, 44)).toBeGreaterThan(bootRange(1, 65));
    expect(bootRange(1, 44)).toBeGreaterThan(bootRange(0.4, 44));
    const max = bootRange(1, 44);
    expect(max).toBeGreaterThan(40);
    expect(max).toBeLessThan(43);
  });
  it('uses the same ballistic equation for the visible flight and measured distance', () => {
    const angle = 42, power = 0.75;
    const velocity = (8 + power * 12) * Math.cos(angle * Math.PI / 180);
    const range = bootRange(power, angle);
    const hit = bootTrajectory(power, angle, range / velocity);
    expect(hit.height).toBeCloseTo(0.22, 8);
    expect(hit.distance).toBeCloseTo(range, 8);
    expect(bootTrajectory(power, angle, 0).height).toBe(1.4);
  });
  it('awards a ringer before proximity points and clamps distant horseshoes to zero', () => {
    expect(horseshoePoints(0)).toBe(1000);
    expect(horseshoePoints(0.42)).toBe(1000);
    expect(horseshoePoints(0.43)).toBeLessThan(1000);
    expect(horseshoePoints(1)).toBeGreaterThan(horseshoePoints(2));
    expect(horseshoePoints(5)).toBe(0);
  });
});
