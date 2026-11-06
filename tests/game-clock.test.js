import { describe, it, expect, vi } from 'vitest';
import { createGameClock } from '../src/games/shared/game-clock.js';

describe('Active game clock', () => {
  it('holds end-of-round transitions during help, background tabs and pauses', () => {
    vi.useFakeTimers();
    const clock = createGameClock();
    const finish = vi.fn();
    clock.schedule(finish, 1);
    clock.tick(0.4);
    vi.advanceTimersByTime(60000); // browser time passes while the game does not tick
    expect(finish).not.toHaveBeenCalled();
    expect(clock.now).toBe(0.4);
    clock.tick(0.6);
    expect(finish).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
  it('keeps countdown deadlines and callbacks on the same timeline', () => {
    const clock = createGameClock();
    const saveUntil = clock.now + 9;
    const serve = vi.fn();
    clock.schedule(serve, 9);
    for (let i = 0; i < 1079; i++) clock.tick(1 / 120);
    expect(clock.now).toBeLessThan(saveUntil);
    expect(serve).not.toHaveBeenCalled();
    clock.tick(1 / 120);
    expect(serve).toHaveBeenCalledOnce();
  });
  it('orders deadlines and supports cancellation from another callback', () => {
    const clock = createGameClock();
    const order = [];
    const canceled = clock.schedule(() => order.push('canceled'), 2);
    clock.schedule(() => { order.push('first'); clock.cancel(canceled); }, 1);
    clock.schedule(() => order.push('second'), 2);
    clock.tick(2);
    expect(order).toEqual(['first', 'second']);
    expect(clock.pending).toBe(0);
  });
  it('prevents stale actions after restart or destroy and avoids zero-delay recursion', () => {
    const clock = createGameClock();
    const stale = vi.fn();
    clock.schedule(stale, 0.2);
    clock.clear();
    clock.tick(1);
    expect(stale).not.toHaveBeenCalled();
    const next = vi.fn();
    clock.schedule(() => clock.schedule(next, 0), 0);
    clock.tick(0);
    expect(next).not.toHaveBeenCalled();
    clock.tick(0);
    expect(next).toHaveBeenCalledOnce();
    clock.schedule(stale, 0);
    clock.destroy();
    clock.tick(10);
    expect(clock.schedule(stale, 0)).toBeNull();
    expect(stale).not.toHaveBeenCalled();
  });
});
