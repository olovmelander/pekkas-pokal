import { describe, expect, it } from 'vitest';
import { predictBallistic, stepBallistic } from '../src/games/shooting/ballistics.js';

describe('Clay flight and shot prediction', () => {
  const origin = { x: -18, y: 3, z: -35 };
  const launch = { x: 12, y: 13, z: -3 };

  it('flies the same arc at 20, 30, 60 and 144 Hz', () => {
    const expected = predictBallistic(origin, launch, 2, {});
    for (const hz of [20, 30, 60, 144]) {
      const position = { ...origin }; const velocity = { ...launch };
      for (let i = 0; i < hz * 2; i++) stepBallistic(position, velocity, 1 / hz);
      for (const axis of ['x', 'y', 'z']) expect(position[axis]).toBeCloseTo(expected[axis], 10);
      expect(velocity.y).toBeCloseTo(launch.y - 9.8 * 2, 10);
    }
  });

  it('keeps a shot lead prediction on the visible clay after uneven frame intervals', () => {
    const position = { ...origin }; const velocity = { ...launch };
    stepBallistic(position, velocity, 0.725);
    const impact = predictBallistic(position, velocity, 0.135, {});
    for (const dt of [0.05, 0.016, 0.027, 0.042]) stepBallistic(position, velocity, dt);
    for (const axis of ['x', 'y', 'z']) expect(position[axis]).toBeCloseTo(impact[axis], 10);
  });

  it('does not rewind when a stale animation timestamp arrives', () => {
    const position = { ...origin }; const velocity = { ...launch };
    stepBallistic(position, velocity, -0.5);
    expect(position).toEqual(origin);
    expect(velocity).toEqual(launch);
  });
});
