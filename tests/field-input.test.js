import { describe, it, expect } from 'vitest';
import { bindFieldDirection } from '../src/games/shared/field-input.js';

function fixture() {
  const button = new EventTarget(), keyTarget = new EventTarget(), captured = new Set();
  button.setPointerCapture = (id) => captured.add(id);
  button.hasPointerCapture = (id) => captured.has(id);
  button.releasePointerCapture = (id) => { captured.delete(id); emit('lostpointercapture', { pointerId: id }); };
  let active = false, enabled = true;
  const control = bindFieldDirection({
    listen: (target, type, callback) => target.addEventListener(type, callback),
    button, keyTarget, enabled: () => enabled, onChange: (value) => { active = value; }
  });
  function emit(type, data = {}, target = button) {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerType: 'mouse', button: 0 }, data);
    target.dispatchEvent(event);
    // Browser keyup events bubble from the current control to window.
    if (type === 'keyup' && target === button) keyTarget.dispatchEvent(Object.assign(new Event(type), data));
    return event;
  }
  return { control, emit, keyTarget, captured, get active() { return active; }, disable() { enabled = false; } };
}

describe('field direction physical input ownership', () => {
  it('keeps the first finger active after the second finger releases or cancels', () => {
    const f = fixture();
    f.emit('pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true });
    f.emit('pointerdown', { pointerId: 12, pointerType: 'touch', isPrimary: false });
    expect(f.captured.size).toBe(2);
    f.emit('pointerup', { pointerId: 12 }); expect(f.active).toBe(true);
    f.emit('pointercancel', { pointerId: 99 }); expect(f.active).toBe(true);
    f.emit('lostpointercapture', { pointerId: 11 }); expect(f.active).toBe(false);
  });
  it('keeps a pointer hold when keyboard input releases and vice versa', () => {
    const f = fixture();
    f.emit('pointerdown', { pointerId: 1 }); f.emit('keydown', { code: 'Enter' });
    f.emit('keyup', { code: 'Enter' }); expect(f.active).toBe(true);
    f.emit('keydown', { code: 'Space' }); f.emit('pointerup', { pointerId: 1 }); expect(f.active).toBe(true);
    f.emit('keyup', { code: 'Space' }); expect(f.active).toBe(false);
  });
  it('ignores unrelated key releases and retains a second held action key', () => {
    const f = fixture();
    f.emit('keydown', { code: 'Enter' }); f.emit('keydown', { code: 'Space' });
    f.emit('keyup', { code: 'ShiftLeft' }); expect(f.active).toBe(true);
    f.emit('keyup', { code: 'Enter' }); expect(f.active).toBe(true);
    f.emit('keyup', { code: 'Space' }); expect(f.active).toBe(false);
  });
  it('stops keyboard steering on focus change without cancelling a held finger', () => {
    const f = fixture();
    f.emit('keydown', { code: 'Enter' }); f.emit('blur'); expect(f.active).toBe(false);
    f.emit('pointerdown', { pointerId: 1 }); f.emit('keydown', { code: 'Enter' });
    f.emit('blur'); expect(f.active).toBe(true);
    f.emit('pointerup', { pointerId: 1 }); expect(f.active).toBe(false);
  });
  it('receives a physical key release even after the target changed', () => {
    const f = fixture();
    f.emit('keydown', { code: 'Enter' });
    f.emit('keyup', { code: 'Enter' }, f.keyTarget); expect(f.active).toBe(false);
  });
  it('does not activate a newly focused control from the previous control’s held key', () => {
    const f = fixture();
    f.emit('keydown', { code: 'Space', repeat: true }); expect(f.active).toBe(false);
    f.emit('keydown', { code: 'Space', repeat: false }); expect(f.active).toBe(true);
  });
  it('cancels every source and capture at pause or round boundaries', () => {
    const f = fixture();
    f.emit('pointerdown', { pointerId: 1 }); f.emit('pointerdown', { pointerId: 2 }); f.emit('keydown', { code: 'Enter' });
    f.control.cancel(); expect(f.active).toBe(false); expect(f.captured.size).toBe(0);
    f.emit('keyup', { code: 'Enter' }); f.emit('pointerup', { pointerId: 2 }); expect(f.active).toBe(false);
  });
  it.each([1, 2])('rejects secondary mouse button %s and input while the event is disabled', (button) => {
    const f = fixture();
    f.emit('pointerdown', { pointerId: 1, pointerType: 'mouse', button }); expect(f.active).toBe(false);
    expect(f.captured.size).toBe(0);
    f.disable(); f.emit('pointerdown', { pointerId: 2 }); f.emit('keydown', { code: 'Enter' }); expect(f.active).toBe(false);
  });
  it.each(['ctrlKey', 'metaKey', 'altKey'])('does not start steering from %s shortcuts', (modifier) => {
    const f = fixture();
    for (const code of ['Space', 'Enter']) {
      expect(f.emit('keydown', { code, [modifier]: true }).defaultPrevented).toBe(false);
      expect(f.active).toBe(false);
      f.emit('keyup', { code, [modifier]: true });
    }
  });
  it.each(['ctrlKey', 'metaKey', 'altKey'])('releases a held Space when %s is added before keyup', (modifier) => {
    const f = fixture();
    f.emit('keydown', { code: 'Space' }); expect(f.active).toBe(true);
    f.emit('keyup', { code: 'Space', [modifier]: true }); expect(f.active).toBe(false);
  });
  it.each(['Space', 'Enter'])('continues to steer with Shift+%s', (code) => {
    const f = fixture();
    expect(f.emit('keydown', { code, shiftKey: true }).defaultPrevented).toBe(true);
    expect(f.active).toBe(true);
    f.emit('keyup', { code, shiftKey: true }); expect(f.active).toBe(false);
  });
});
