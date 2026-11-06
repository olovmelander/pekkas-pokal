import { describe, expect, it } from 'vitest';
import { isActionButtonEvent } from '../src/games/fencing/input.js';

describe('Independent fencing action buttons', () => {
  it('accepts both thumbs on separate action buttons immediately', () => {
    for (const isPrimary of [true, false]) {
      expect(isActionButtonEvent({ type: 'pointerdown', button: 0, pointerType: 'touch', isPrimary })).toBe(true);
    }
  });

  it('keeps the primary left-mouse and pen guard', () => {
    for (const pointerType of ['mouse', 'pen']) {
      expect(isActionButtonEvent({ type: 'pointerdown', button: 0, pointerType, isPrimary: true })).toBe(true);
      expect(isActionButtonEvent({ type: 'pointerdown', button: 0, pointerType, isPrimary: false })).toBe(false);
      for (const button of [1, 2, 5]) {
        expect(isActionButtonEvent({ type: 'pointerdown', button, pointerType, isPrimary: true })).toBe(false);
      }
    }
  });

  it('accepts assistive clicks while ignoring native clicks after a pointer press', () => {
    expect(isActionButtonEvent({ type: 'click', detail: 0, button: 0 })).toBe(true);
    // Browser-generated keyboard clicks are PointerEvents with isPrimary=false.
    expect(isActionButtonEvent({ type: 'click', detail: 0, button: 0, pointerType: '', isPrimary: false })).toBe(true);
    for (const pointerType of ['mouse', 'touch', 'pen']) {
      for (const detail of [1, 2, 3]) {
        expect(isActionButtonEvent({ type: 'click', detail, button: 0, pointerType })).toBe(false);
      }
    }
  });

  it('does not turn releases, cancellation or auxiliary clicks into attacks', () => {
    for (const type of ['pointerup', 'pointercancel', 'mouseup', 'auxclick']) {
      expect(isActionButtonEvent({ type, button: 0, detail: 0, pointerType: 'touch', isPrimary: true })).toBe(false);
    }
    expect(isActionButtonEvent({ type: 'click', detail: 0, button: 2 })).toBe(false);
  });
});
