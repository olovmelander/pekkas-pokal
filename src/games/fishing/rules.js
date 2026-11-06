/** Close passes are earned for the whole descent, not only until the next dodge. */
export function dodgeMultiplier(dodges, nearMisses) {
  return Math.min(10, 1 + Math.max(0, dodges) * 0.5 + Math.max(0, nearMisses) * 0.25);
}

/** Reaching the bottom pays on the earned multiplier, then fills it for the ascent. */
export function bottomReward(multiplier) {
  return { bonus: Math.round(1500 * Math.max(1, Math.min(10, multiplier))), multiplier: 12 };
}

/** A consistent 44–68 px diameter across portrait and desktop screens. */
export function tapRadiusNdc(width, height) {
  const shortSide = Math.max(1, Math.min(width, height));
  const radius = Math.max(22, Math.min(34, shortSide * 0.055));
  // Pointer distances use vertical NDC, with aspect correction on X.
  return radius * 2 / Math.max(1, height);
}

/** Fish already in the barrel have finished their animation but still count as secured. */
export function isPerfectCatch(caught, tapped) {
  return caught > 0 && tapped === caught;
}
