import { describe, it, expect } from 'vitest';
import { createPointerSession } from '../src/games/clay/input.js';

const finger = (pointerId) => ({ pointerId, pointerType: 'touch', button: 0 });

describe('Clay: independent shaping and smoothing gestures', () => {
  it('ignores another finger moving or lifting while the shaping finger stays down', () => {
    const shape = createPointerSession();
    expect(shape.begin(finger(7))).toBe(true);
    expect(shape.begin(finger(8))).toBe(false);
    expect(shape.owns(finger(8))).toBe(false);
    expect(shape.release(finger(8))).toBe(false);
    expect(shape.active).toBe(true);
    expect(shape.owns(finger(7))).toBe(true);
    expect(shape.release(finger(7))).toBe(true);
    expect(shape.active).toBe(false);
  });

  it('allows GLÄTTA to have its own finger without stealing the clay gesture', () => {
    const shape = createPointerSession();
    const smooth = createPointerSession();
    shape.begin(finger(1)); smooth.begin(finger(2));
    expect(shape.release(finger(2))).toBe(false);
    expect(smooth.release(finger(2))).toBe(true);
    expect(shape.active).toBe(true);
    expect(smooth.active).toBe(false);
  });

  it('ignores right mouse clicks and recovers after capture cancellation or pause', () => {
    const shape = createPointerSession();
    expect(shape.begin({ pointerId: 1, pointerType: 'mouse', button: 2 })).toBe(false);
    expect(shape.begin({ pointerId: 1, pointerType: 'mouse', button: 0 })).toBe(true);
    expect(shape.reset()).toBe(1);
    expect(shape.active).toBe(false);
    expect(shape.release({ pointerId: 1 })).toBe(false);
    expect(shape.begin(finger(9))).toBe(true);
    expect(shape.release({ pointerId: 9 })).toBe(true);
  });
});
