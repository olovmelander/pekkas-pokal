/** Consume a telegraphed feint once. Both shownLine and line then describe its real target. */
export function takeFeint(ai, telegraph, random) {
  if (ai.pose !== 'telegraph' || !ai.willFeint || ai.t <= telegraph * 0.62) return false;
  ai.willFeint = false;
  ai.line = (ai.line + 1 + Math.min(1, Math.floor(random() * 2))) % 3;
  ai.shownLine = ai.line;
  ai.switchT = 0.25;
  return true;
}

/** The visible opening accounts for the 0.24 s it takes your own thrust to land. */
export function openingRemaining(pose, elapsed) {
  const duration = pose === 'stagger' ? 0.85 : pose === 'bitten' ? 0.7 : pose === 'recover' ? 0.55 : 0;
  return Math.max(0, duration - elapsed - 0.24);
}
