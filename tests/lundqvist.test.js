import { describe, it, expect } from 'vitest';
import { discPosition, throwIsCaught } from '../src/games/lundqvist/rules.js';

describe('Lundqvist disc trajectory', () => {
  it('starts in the throwing hand and reaches a caught basket at rim height', () => {
    const end = { x: 2, z: -8 };
    expect(discPosition(end, 0.6, 1, 0, true)).toEqual({ x: 0, y: 1.1, z: 7 });
    const final = discPosition(end, 0.6, 1, 1, true);
    expect(final.x).toBe(2);
    expect(final.z).toBe(-8);
    expect(final.y).toBeCloseTo(1.03);
    expect(discPosition(end, 0.6, 1, 1, false).y).toBeCloseTo(0.13);
  });
  it('curves gradually in wind without changing the known landing point', () => {
    const end = { x: 2, z: -8 };
    expect(discPosition(end, 0.6, 1, 0.5).x).toBeLessThan(discPosition(end, 0.6, 0, 0.5).x);
    expect(discPosition(end, 0.6, 1, 1).x).toBe(discPosition(end, 0.6, 0, 1).x);
  });
  it('matches catch feedback to the actual basket opening', () => {
    expect(throwIsCaught({ x: 0.5, z: -8 }, { x: 0, z: -8 })).toBe(true);
    expect(throwIsCaught({ x: 0.8, z: -8 }, { x: 0, z: -8 })).toBe(false);
  });
});
