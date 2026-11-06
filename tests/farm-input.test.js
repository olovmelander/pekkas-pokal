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
    Object.assign(event, { pointerType: 'mouse', button: 0 }, values); button.dispatchEvent(event); return event;
  }
  return { binding, send, onDown, onUp, onCancel, classes, capture: button.setPointerCapture, disable: () => { enabled = false; } };
}

describe('country game hold controls', () => {
  it.each([1, 2])('ignores secondary mouse button %s without capture or an action', (button) => {
    const c = control();
    expect(c.send('pointerdown', { pointerId: 1, button }).defaultPrevented).toBe(false);
    c.send('pointerup', { pointerId: 1, button });
    expect(c.capture).not.toHaveBeenCalled();
    expect(c.onDown).not.toHaveBeenCalled();
    expect(c.onUp).not.toHaveBeenCalled();
    expect(c.onCancel).not.toHaveBeenCalled();
    expect(c.classes.size).toBe(0);
  });
  it.each(['ctrlKey', 'metaKey', 'altKey'])('leaves %s shortcuts to the browser', (modifier) => {
    const c = control();
    for (const code of ['Space', 'Enter']) {
      expect(c.send('keydown', { code, [modifier]: true }).defaultPrevented).toBe(false);
      c.send('keyup', { code, [modifier]: true });
    }
    expect(c.onDown).not.toHaveBeenCalled();
    expect(c.onUp).not.toHaveBeenCalled();
    expect(c.classes.size).toBe(0);
  });
  it.each(['ctrlKey', 'metaKey', 'altKey'])('releases Space when %s is pressed after the hold starts', (modifier) => {
    const c = control();
    c.send('keydown', { code: 'Space' });
    c.send('keyup', { code: 'Space', [modifier]: true });
    expect(c.onDown).toHaveBeenCalledTimes(1);
    expect(c.onUp).toHaveBeenCalledTimes(1);
    expect(c.classes.size).toBe(0);
  });
  it.each(['Space', 'Enter'])('keeps Shift+%s available for ordinary activation', (code) => {
    const c = control();
    expect(c.send('keydown', { code, shiftKey: true }).defaultPrevented).toBe(true);
    expect(c.classes.has('held')).toBe(true);
    c.send('keyup', { code, shiftKey: true });
    expect(c.onDown).toHaveBeenCalledTimes(1);
    expect(c.onUp).toHaveBeenCalledTimes(1);
    expect(c.classes.size).toBe(0);
  });
  it('accepts the non-primary second thumb and keeps it after the first lifts', () => {
    const c = control();
    c.send('pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true });
    c.send('pointerdown', { pointerId: 12, pointerType: 'touch', isPrimary: false });
    c.send('pointerup', { pointerId: 11, pointerType: 'touch' });
    expect(c.classes.has('held')).toBe(true);
    expect(c.onUp).not.toHaveBeenCalled();
    c.send('pointerup', { pointerId: 12, pointerType: 'touch' });
    expect(c.capture).toHaveBeenCalledTimes(2);
    expect(c.onDown).toHaveBeenCalledTimes(1);
    expect(c.onUp).toHaveBeenCalledTimes(1);
  });
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
