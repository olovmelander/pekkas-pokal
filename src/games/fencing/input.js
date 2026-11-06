import { hasCommandModifier } from '../shared/keyboard.js';

/** Immediate action buttons can each use a thumb; the piste swipe owns one pointer. */
export function isActionButtonEvent(event) {
  // Keyboard/assistive clicks have no preceding pointerdown. A pointer's
  // detail=1 click must not replay the action already taken on press.
  if (event.type === 'click') return !hasCommandModifier(event) && event.detail === 0 && event.button === 0;
  if (event.type !== 'pointerdown' || event.button !== 0) return false;
  return event.pointerType === 'touch' || event.isPrimary !== false;
}
