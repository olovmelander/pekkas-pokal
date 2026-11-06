import { describe, expect, it, vi } from 'vitest';
import { Sfx } from '../src/games/shooting/audio.js';

describe('Shooting mute', () => {
  it('silences the master bus containing wind and already playing sound tails', () => {
    const sfx = new Sfx();
    const setTargetAtTime = vi.fn();
    sfx.ctx = { currentTime: 17 };
    sfx.master = { gain: { setTargetAtTime } };
    sfx.setMuted(true);
    expect(sfx.muted).toBe(true);
    expect(setTargetAtTime).toHaveBeenLastCalledWith(0, 17, 0.03);
    sfx.setMuted(false);
    expect(sfx.muted).toBe(false);
    expect(setTargetAtTime).toHaveBeenLastCalledWith(0.36, 17, 0.03);
  });

  it('remembers a mute selected before the audio context exists', () => {
    const sfx = new Sfx();
    expect(() => sfx.setMuted(true)).not.toThrow();
    expect(sfx.muted).toBe(true);
    expect(sfx.ctx).toBeNull();
  });
});
