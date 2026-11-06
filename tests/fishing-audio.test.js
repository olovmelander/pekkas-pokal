import { describe, expect, it, vi } from 'vitest';
import { Sfx as FishingSound } from '../src/games/fishing/audio.js';
import { Sfx as PinballSound } from '../src/games/pinball/audio.js';

describe.each([['fishing', FishingSound], ['pinball', PinballSound]])('%s audio during pause', (_, Sound) => {
  it('mutes the complete bus during pause and preserves mute on resume', () => {
    const sound = new Sound();
    const target = vi.fn();
    sound.ctx = { currentTime: 12, state: 'running' };
    sound.master = { gain: { setTargetAtTime: target } };
    sound.setPaused(true); expect(target.mock.lastCall[0]).toBe(0);
    sound.setMuted(true); sound.setPaused(false); expect(target.mock.lastCall[0]).toBe(0);
    sound.setPaused(true); sound.setMuted(false); expect(target.mock.lastCall[0]).toBe(0);
    sound.setPaused(false); expect(target.mock.lastCall[0]).toBeGreaterThan(0);
  });
  it('allows pause and mute before any user gesture creates audio', () => {
    const sound = new Sound();
    expect(() => { sound.setPaused(true); sound.setMuted(true); sound.setPaused(false); }).not.toThrow();
    expect(sound.ctx).toBeNull(); expect(sound.muted).toBe(true);
  });
});
