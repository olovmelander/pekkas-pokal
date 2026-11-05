/** Arcade scoring shared by the two country tournaments. Distances are metres. */
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function landing(aim, power, wind = 0) {
  return { x: clamp(aim, -1, 1) * 5 + wind, z: 7 - (5 + clamp(power, 0, 1) * 15) };
}
export function precisionScore(distance, radius = 4) {
  return Math.round(1000 * Math.pow(clamp(1 - distance / radius, 0, 1), 1.35));
}
export function advanceBalance(state, input, brace, time, dt) {
  const step = clamp(dt, 0, 0.05);
  const disturbance = Math.sin(time * 1.3) * 0.28 + Math.sin(time * 2.7 + 1.1) * 0.14;
  const velocity = (state.velocity + (disturbance + state.tilt * 0.85 + input * 1.75) * step)
    * Math.exp(-(brace ? 5 : 1.4) * step);
  const tilt = clamp(state.tilt + velocity * step, -1.35, 1.35);
  const spill = Math.max(0, Math.abs(tilt) - 0.62) * step * 23;
  return { tilt, velocity, cargo: clamp(state.cargo - spill, 0, 100), progress: state.progress + step * (brace ? 0.18 : 1) };
}
export function kubbHit(blocks, point) {
  const standing = blocks.filter((b) => !b.down);
  const hit = standing.find((b) => Math.hypot(b.x - point.x, b.z - point.z) < 0.95);
  if (!hit) return { index: -1, prematureKing: false };
  return { index: blocks.indexOf(hit), prematureKing: !!hit.king && standing.some((b) => !b.king) };
}
export function medal(score) {
  return score >= 2400 ? 'Guld' : score >= 1700 ? 'Silver' : score >= 900 ? 'Brons' : 'Nästa gång tar vi pallen';
}

/** User-confirmed 2015 disciplines, with explicit arcade scoring. */
export function riflePoints(distance) {
  return Math.round(clamp(1 - Math.max(0, distance) / 1.6, 0, 1) * 1000);
}
export function bootTrajectory(power, angle, seconds) {
  const speed = 8 + clamp(power, 0, 1) * 12;
  const radians = clamp(angle, 20, 70) * Math.PI / 180;
  return { distance: speed * Math.cos(radians) * Math.max(0, seconds), height: 1.4 + speed * Math.sin(radians) * seconds - 4.905 * seconds * seconds };
}
export function bootRange(power, angle) {
  const speed = 8 + clamp(power, 0, 1) * 12;
  const radians = clamp(angle, 20, 70) * Math.PI / 180;
  const vy = speed * Math.sin(radians);
  return speed * Math.cos(radians) * (vy + Math.sqrt(vy * vy + 2 * 9.81 * (1.4 - 0.22))) / 9.81;
}
export function horseshoePoints(distance) {
  return distance <= 0.42 ? 1000 : Math.round(850 * clamp(1 - (distance - 0.42) / 3, 0, 1));
}
