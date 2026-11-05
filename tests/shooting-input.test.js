import { describe, expect, it } from 'vitest';
import { aimKey, stepKeyboardAim, touchAimOffset } from '../src/games/shooting/input.js';

describe('Shooting keyboard and touch aiming', () => {
  it('keeps diagonal aim speed fair and independent of frame rate', () => {
    const keys = { up: true, right: true };
    const diagonal = stepKeyboardAim({ x: 0, y: 0 }, keys, 0.5);
    const horizontal = stepKeyboardAim({ x: 0, y: 0 }, { right: true }, 0.5);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(horizontal.x);
    let aim = { x: 0, y: 0 };
    for (let frame = 0; frame < 60; frame++) aim = stepKeyboardAim(aim, keys, 0.5 / 60);
    expect(aim.x).toBeCloseTo(diagonal.x);
    expect(aim.y).toBeCloseTo(diagonal.y);
  });

  it('allows precise corrections and stops at reachable screen edges', () => {
    const fast = stepKeyboardAim({ x: 0, y: 0 }, { right: true }, 0.2);
    const fine = stepKeyboardAim({ x: 0, y: 0 }, { right: true, fine: true }, 0.2);
    expect(fine.x).toBeGreaterThan(0);
    expect(fine.x).toBeLessThan(fast.x / 2);
    expect(stepKeyboardAim({ x: 0.98, y: -0.98 }, { right: true, down: true }, 1)).toEqual({ x: 0.985, y: -0.985 });
    expect(stepKeyboardAim({ x: 0.3, y: 0.2 }, { left: true, right: true, up: true, down: true }, 1)).toEqual({ x: 0.3, y: 0.2 });
  });

  it('lifts the touch sight above the finger while keeping top targets reachable', () => {
    for (const height of [390, 844, 1080]) {
      const lift = touchAimOffset(0, height);
      expect(lift).toBeGreaterThan(0);
      expect(lift * height / 2).toBeLessThanOrEqual(92);
      expect(0.99 + touchAimOffset(0.99, height)).toBeLessThanOrEqual(1);
      expect(touchAimOffset(1, height)).toBe(0);
    }
    expect(touchAimOffset(0, 0)).toBe(0);
  });

  it('maps arrows, WASD and either Shift to their advertised controls', () => {
    expect(aimKey({ code: 'KeyW', key: 'W' })).toBe('up');
    expect(aimKey({ key: 'ArrowLeft' })).toBe('left');
    expect(aimKey({ code: 'ShiftLeft' })).toBe('fine');
    expect(aimKey({ code: 'ShiftRight' })).toBe('fine');
    expect(aimKey({ code: 'Space' })).toBeNull();
  });
});
