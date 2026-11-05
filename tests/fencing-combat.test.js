import { describe, expect, it, vi } from 'vitest';
import { openingRemaining, takeFeint } from '../src/games/fencing/combat-rules.js';

describe('Fencing attack readability', () => {
  it('changes a feint once, leaving a stable target to read before impact', () => {
    const rival = { pose: 'telegraph', line: 1, shownLine: 1, willFeint: true, t: 0 };
    const random = vi.fn(() => 0.8);
    const changes = [];
    for (let frame = 0; frame < 60; frame++) {
      rival.t = frame / 60;
      if (takeFeint(rival, 1, random)) changes.push({ time: rival.t, line: rival.line });
    }
    expect(changes).toHaveLength(1);
    expect(changes[0].time).toBeGreaterThan(0.62);
    expect(changes[0].time).toBeLessThan(0.65);
    expect(rival.shownLine).toBe(changes[0].line);
    expect(rival.line).not.toBe(1);
    expect(random).toHaveBeenCalledOnce();
  });

  it('every feint chooses another line, including random boundary values', () => {
    for (const line of [0, 1, 2]) {
      for (const random of [0, 0.4999, 0.5, 0.9999, 1]) {
        const rival = { pose: 'telegraph', line, willFeint: true, t: 0.8 };
        takeFeint(rival, 1, () => random);
        expect(rival.line).not.toBe(line);
        expect([0, 1, 2]).toContain(rival.line);
      }
    }
  });

  it('does not invent a late line switch during an attack or before the cue', () => {
    const rival = { pose: 'telegraph', line: 0, shownLine: 0, willFeint: true, t: 0.5 };
    expect(takeFeint(rival, 1, () => 0.5)).toBe(false);
    rival.pose = 'attack'; rival.t = 1;
    expect(takeFeint(rival, 1, () => 0.5)).toBe(false);
    expect(rival.line).toBe(0);
  });

  it('only advertises an opening while a new thrust can land before recovery', () => {
    expect(openingRemaining('stagger', 0.5)).toBeCloseTo(0.11);
    expect(openingRemaining('stagger', 0.62)).toBe(0);
    expect(openingRemaining('bitten', 0.47)).toBe(0);
    expect(openingRemaining('recover', 0.32)).toBe(0);
    expect(openingRemaining('guard', 0)).toBe(0);
    expect(openingRemaining('attack', 0)).toBe(0);
  });
});
