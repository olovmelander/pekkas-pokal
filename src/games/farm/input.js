import { hasCommandModifier } from '../shared/keyboard.js';

/** A held control must release even if focus or pointer capture moves elsewhere. */
export function bindHoldControl(listen, button, { canStart, onDown, onUp, onCancel }) {
  const sources = new Set();
  const start = (source) => {
    if (!canStart() || sources.has(source)) return;
    const first = sources.size === 0;
    sources.add(source);
    button.classList.add('held');
    if (first) onDown();
  };
  const stop = (source, cancelled = false) => {
    if (!sources.delete(source) || sources.size) return;
    button.classList.remove('held');
    if (cancelled) onCancel(); else onUp();
  };
  const cancel = () => {
    if (!sources.size) return;
    sources.clear();
    button.classList.remove('held');
    onCancel();
  };
  listen(button, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    if (!canStart()) return;
    button.setPointerCapture(event.pointerId);
    start(`pointer:${event.pointerId}`);
  });
  listen(button, 'pointerup', (event) => {
    event.preventDefault();
    stop(`pointer:${event.pointerId}`);
  });
  listen(button, 'pointercancel', (event) => stop(`pointer:${event.pointerId}`, true));
  listen(button, 'lostpointercapture', (event) => stop(`pointer:${event.pointerId}`, true));
  listen(button, 'keydown', (event) => {
    if (hasCommandModifier(event)) return;
    if (!['Enter', 'Space'].includes(event.code)) return;
    event.preventDefault();
    if (!event.repeat) start(`key:${event.code}`);
  });
  listen(button, 'keyup', (event) => {
    if (!['Enter', 'Space'].includes(event.code)) return;
    event.preventDefault();
    stop(`key:${event.code}`);
  });
  listen(button, 'blur', cancel);
  return { cancel, press: start, release: stop };
}
