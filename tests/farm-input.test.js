import { describe, expect, it, vi } from 'vitest';
import { bindHoldControl } from '../src/games/farm/input.js';

function control() {
  const button = new EventTarget(), classes = new Set();
  button.classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name) };
  button.setPointerCapture = vi.fn();
  let enabled = true;
  const onDown = vi.fn(), onUp = vi.fn(), onCancel = vi.fn();
  const binding = bindHoldControl((target, type, fn) => target.addEventListener(type, fn), button, {
    canStart: () => enabled, onDown, onUp, onCancel
  });
  function send(type, values = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, values); button.dispatchEvent(event); return event;
  }
  return { binding, send, onDown, onUp, onCancel, classes, disable: () => { enabled = false; } };
}

describe('country game hold controls', () => {
  it.each(['Enter', 'Space'])('cancels %s on focus loss without releasing a charged throw', (code) => {
    const c = control();
    expect(c.send('keydown', { code }).defaultPrevented).toBe(true);
    c.send('blur');
    c.send('keyup', { code });
    expect(c.onDown).toHaveBeenCalledTimes(1);
    expect(c.onCancel).toHaveBeenCalledTimes(1);
    expect(c.onUp).not.toHaveBeenCalled();
    expect(c.classes.size).toBe(0);
  });
  it('does not duplicate a throw when pointer capture ends after pointerup', () => {
    const c = control();
    c.send('pointerdown', { pointerId: 7 });
    c.send('pointerup', { pointerId: 7 });
    c.send('lostpointercapture', { pointerId: 7 });
    expect(c.onUp).toHaveBeenCalledTimes(1);
    expect(c.onCancel).not.toHaveBeenCalled();
  });
  it('keeps a keyboard hold when a second pointer is cancelled', () => {
    const c = control();
    c.send('keydown', { code: 'Space' });
    c.send('pointerdown', { pointerId: 1 });
    c.send('pointercancel', { pointerId: 1 });
    expect(c.onDown).toHaveBeenCalledTimes(1);
    expect(c.onCancel).not.toHaveBeenCalled();
    c.send('keyup', { code: 'Space' });
    expect(c.onUp).toHaveBeenCalledTimes(1);
  });
  it('does not resume a stale hold after pause or accept repeated/disabled keydown', () => {
    const c = control();
    c.send('keydown', { code: 'Enter' });
    c.binding.cancel();
    c.send('keyup', { code: 'Enter' });
    c.send('keydown', { code: 'Enter', repeat: true });
    c.disable();
    c.send('keydown', { code: 'Space' });
    c.send('pointerdown', { pointerId: 2 });
    expect(c.onDown).toHaveBeenCalledTimes(1);
    expect(c.onUp).not.toHaveBeenCalled();
    expect(c.onCancel).toHaveBeenCalledTimes(1);
  });
});
