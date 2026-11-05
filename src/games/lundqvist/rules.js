/** Curved flight is shared by the aiming preview and the actual throw. */
export function discPosition(end, power, wind, progress, caught = false) {
  const t = Math.max(0, Math.min(1, progress));
  const endHeight = caught ? 1.03 : 0.13;
  return {
    x: end.x * t - wind * t * (1 - t),
    y: 1.1 * (1 - t) + endHeight * t + Math.sin(t * Math.PI) * (2 + power * 2),
    z: 7 + (end.z - 7) * t
  };
}

export function throwIsCaught(end, target) {
  return Math.hypot(end.x - target.x, end.z - target.z) < 0.7;
}
