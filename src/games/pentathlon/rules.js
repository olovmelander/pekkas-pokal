/** Pure scoring for the intentionally simplified park challenges. */
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function precisionScore(distance, radius = 3) {
  return Math.round(100 * Math.max(0, 1 - Math.max(0, distance) / radius));
}

export function jumpScore(position, board = -3) {
  if (position < board) return { foul: true, distance: 0, points: 0 };
  const quality = clamp(1 - (position - board) / 4, 0, 1);
  return { foul: false, distance: 2 + quality * 5, points: Math.round(quality * 100) };
}

export function hoopCrossing(from, to, hoop, radius = 0.68) {
  if (from.z <= hoop.z || to.z > hoop.z) return false;
  const t = (hoop.z - from.z) / (to.z - from.z);
  return Math.abs(from.x + (to.x - from.x) * t - hoop.x) <= radius;
}

export function medalFor(points, events) {
  const average = points / Math.max(1, events);
  return average >= 80 ? 'Guld' : average >= 55 ? 'Silver' : average >= 30 ? 'Brons' : 'Deltagarmedalj';
}

export function chargePower(seconds) {
  const cycle = Math.max(0, seconds) % 2.4;
  return cycle < 1.2 ? cycle / 1.2 : (2.4 - cycle) / 1.2;
}
