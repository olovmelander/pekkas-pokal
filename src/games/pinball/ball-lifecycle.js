/** Called after a drained ball has been removed. Pending auto-serves are live
 * game resources too: a second drain must not cancel an earned replacement. */
export function drainDisposition(state, now, grace = 0) {
  const inPlay = state.balls.length + state.riders.length + (state.held ? 1 : 0) + (state.pendingServes || 0);
  if (!state.tilted && state.multiball && now < state.mbSaveUntil) return 'replace';
  if (inPlay > 0) {
    return inPlay === 1 && state.multiball && !state.mode?.wizard ? 'end-multiball' : 'continue';
  }
  if (!state.tilted && state.ballSaveUntil > 0 && now < state.ballSaveUntil + grace) return 'save';
  return 'end-ball';
}
