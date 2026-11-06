/** Native controls own their keys. A focused sound button must be clickable
 * with Space without firing, charging or accelerating the game underneath. */
export function isEditableTarget(target) {
  return !!target?.closest?.('input, select, textarea, [contenteditable]:not([contenteditable="false"])');
}

export function isNativeControlTarget(target) {
  return isEditableTarget(target) || !!target?.closest?.('button, a[href], summary, [role="button"]');
}

/** Direction shortcuts remain useful when a game deliberately focuses its
 * own control strip. Space/Enter still activate the focused button itself. */
export function isGameControlTarget(target) {
  return !!target?.closest?.('[data-game-controls]') && !!target?.closest?.('button');
}
