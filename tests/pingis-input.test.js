import { describe, expect, it } from 'vitest';
import { movementKey, sampleFlick } from '../src/games/pingis/input.js';

describe('Pingis gesture sampling', () => {
  it('does not turn entering the canvas or returning after a pause into spin', () => {
    const next = { x: 800, y: 600, time: 1000 };
    expect(sampleFlick({ x: 0, y: 0, time: 0 }, next, 1000, 800)).toEqual({ x: 0, y: 0, fresh: true });
    expect(sampleFlick({ x: 0, y: 0, time: 500 }, next, 1000, 800)).toEqual({ x: 0, y: 0, fresh: true });
  });

  it('measures the same physical gesture across screen sizes', () => {
    const desktop = sampleFlick({ x: 200, y: 400, time: 100 }, { x: 240, y: 320, time: 120 }, 1000, 800);
    const phone = sampleFlick({ x: 80, y: 200, time: 100 }, { x: 96, y: 160, time: 120 }, 400, 400);
    expect(phone).toEqual(desktop);
    expect(desktop.x).toBeCloseTo(2);
    expect(desktop.y).toBeCloseTo(-5);
    expect(desktop.fresh).toBe(false);
  });

  it('rejects duplicate or reversed timestamps and zero-size hidden canvases', () => {
    const previous = { x: 100, y: 100, time: 200 };
    for (const time of [190, 200]) expect(sampleFlick(previous, { x: 200, y: 200, time }, 400, 800).fresh).toBe(true);
    expect(sampleFlick(previous, { x: 200, y: 200, time: 210 }, 0, 800).fresh).toBe(true);
    expect(sampleFlick(previous, { x: 5000, y: -5000, time: 201 }, 400, 800)).toEqual({ x: 8, y: -8, fresh: false });
  });

  it('releases the same movement after Shift or Caps Lock changes key casing', () => {
    expect(movementKey({ key: 'a' })).toBe(movementKey({ key: 'A' }));
    expect(movementKey({ key: 'W' })).toBe('up');
    expect(movementKey({ code: 'KeyS', key: 'S' })).toBe('down');
    expect(movementKey({ code: 'Space', key: ' ' })).toBeNull();
  });
});
