import { describe, expect, it } from 'vitest';
import { drainDisposition } from '../src/games/pinball/ball-lifecycle.js';
import { createGameClock } from '../src/games/shared/game-clock.js';

const field = overrides => ({ balls: [], riders: [], held: null, pendingServes: 0, multiball: true,
  mode: null, tilted: false, mbSaveUntil: 12000, ballSaveUntil: 0, ...overrides });

describe('pinball ball-save lifecycle', () => {
  it('replaces every simultaneous multiball drain, including the last visible ball', () => {
    const clock = createGameClock(), state = field({ balls: [{}, {}] });
    clock.tick(10);
    for (let i = 0; i < 2; i++) {
      state.balls.pop();
      expect(drainDisposition(state, clock.now * 1000)).toBe('replace');
      state.pendingServes++;
      clock.schedule(() => { state.pendingServes--; state.balls.push({}); }, .4);
    }
    expect(state.balls).toHaveLength(0); expect(state.pendingServes).toBe(2);
    clock.tick(.4);
    expect(state.balls).toHaveLength(2); expect(state.pendingServes).toBe(0);
  });
  it('honours a replacement already earned when the grace window ends', () => {
    expect(drainDisposition(field({ pendingServes: 1 }), 12010)).toBe('end-multiball');
    expect(drainDisposition(field({ pendingServes: 2 }), 12010)).toBe('continue');
    expect(drainDisposition(field(), 12010)).toBe('end-ball');
  });
  it('counts wireforms and held balls and keeps the final mode alive', () => {
    expect(drainDisposition(field({ riders: [{}] }), 13000)).toBe('end-multiball');
    expect(drainDisposition(field({ held: {}, mode: { wizard: true } }), 13000)).toBe('continue');
  });
  it('saves a single ball inside the short grace but never after tilt', () => {
    const state = field({ multiball: false, ballSaveUntil: 10000 });
    expect(drainDisposition(state, 10200, 350)).toBe('save');
    expect(drainDisposition(state, 10400, 350)).toBe('end-ball');
    expect(drainDisposition({ ...state, tilted: true }, 9000, 350)).toBe('end-ball');
    expect(drainDisposition(field({ tilted: true }), 9000, 350)).toBe('end-ball');
  });
});
