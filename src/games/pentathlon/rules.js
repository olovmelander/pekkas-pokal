/** Pure scoring for the intentionally simplified park challenges. */
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function precisionScore(distance, radius = 3) {
  return Math.round(100 * Math.max(0, 1 - Math.max(0, distance) / radius));
}

export function jumpScore(position, board = -3) {
  if (position < board) return { foul: true, distance: 0, travel: 0, points: 0 };
  const quality = clamp(1 - (position - board) / 4, 0, 1);
  const travel = 2 + quality * 5;
  const distance = Math.max(0, travel - (position - board));
  return { foul: false, distance, travel, points: Math.round(distance / 7 * 100) };
}

/** A direction remains a direction when power changes; only travel changes. */
export function croquetEnd(start, aim, power) {
  const angle = clamp(aim, -4.4, 4.4) * 0.19;
  const distance = 2 + clamp(power, 0, 1) * 7;
  return { x: start.x + Math.sin(angle) * distance, z: start.z - Math.cos(angle) * distance };
}

export function fieldThrowScore(kind, distance, opponentDistance = 0.92) {
  if (kind === 'rings') return distance <= 0.45 ? 100 : precisionScore(distance - 0.45, 2.8);
  const score = precisionScore(distance, 2.5);
  return Math.min(100, score + (distance < opponentDistance ? 15 : 0));
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
