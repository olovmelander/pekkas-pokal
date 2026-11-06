/** Seven-point evening matches keep table tennis's two-clear-points finish. */
export const POINTS_TO_WIN = 7;

export function playerServes(pointsPlayed, mine, theirs, target = POINTS_TO_WIN) {
  // At deuce each side serves once; before deuce the serve changes every two.
  if (mine >= target - 1 && theirs >= target - 1) return pointsPlayed % 2 === 0;
  return Math.floor(pointsPlayed / 2) % 2 === 0;
}

export function matchWinner(mine, theirs, target = POINTS_TO_WIN) {
  if (Math.max(mine, theirs) < target || Math.abs(mine - theirs) < 2) return 0;
  return mine > theirs ? 1 : -1;
}

export function winBonus(matchNumber, opponentPoints, target = POINTS_TO_WIN) {
  return 1000 * matchNumber + Math.max(0, target - opponentPoints) * 100;
}

/** A ball that clears the table without bouncing is out, not an automatic volley. */
export function canReturnBall(bounces, floorBounces) {
  return bounces >= 1 && floorBounces === 0;
}
