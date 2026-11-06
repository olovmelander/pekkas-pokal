import { hasCommandModifier } from './keyboard.js';

/** A direction stays down until all of its physical input sources let go. */
export function bindFieldDirection({ listen, button, keyTarget, enabled, onChange }) {
  const pointers = new Set(), keys = new Set();
  const active = () => onChange(pointers.size > 0 || keys.size > 0);
  const isActionKey = (code) => code === 'Space' || code === 'Enter';
  listen(button, 'pointerdown', (event) => {
    event.preventDefault();
    if (!enabled() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointers.add(event.pointerId);
    button.setPointerCapture(event.pointerId);
    active();
  });
  const releasePointer = (event) => {
    if (!pointers.delete(event.pointerId)) return;
    if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
    active();
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(button, name, releasePointer);
  listen(button, 'keydown', (event) => {
    if (hasCommandModifier(event)) return;
    if (!isActionKey(event.code)) return;
    event.preventDefault();
    // A held key must not activate the next button after Tab changes focus.
    if (!enabled() || event.repeat) return;
    keys.add(event.code);
    active();
  });
  listen(button, 'keyup', (event) => { if (isActionKey(event.code)) event.preventDefault(); });
  listen(keyTarget, 'keyup', (event) => { if (keys.delete(event.code)) active(); });
  listen(button, 'blur', () => { keys.clear(); active(); });
  return {
    cancel() {
      const captured = [...pointers];
      pointers.clear(); keys.clear(); active();
      for (const id of captured) if (button.hasPointerCapture?.(id)) button.releasePointerCapture(id);
    }
  };
}
