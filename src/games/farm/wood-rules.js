const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function stackPlacement(base, dropped) {
  const left = Math.max(base.x - base.width / 2, dropped.x - dropped.width / 2);
  const right = Math.min(base.x + base.width / 2, dropped.x + dropped.width / 2);
  const overlap = Math.max(0, right - left);
  const perfect = Math.abs(base.x - dropped.x) <= 0.14;
  if (perfect && overlap > 0) return { stable: true, perfect: true, x: base.x, width: Math.min(3.8, base.width + 0.08) };
  if (overlap < Math.max(0.45, dropped.width * 0.3)) return { stable: false, perfect: false, x: base.x, width: base.width };
  return { stable: true, perfect, x: perfect ? base.x : (left + right) / 2, width: perfect ? Math.min(3.8, base.width + 0.08) : overlap };
}

export function nailStrike(phase, previousDepth = 0) {
  const accuracy = clamp(1 - Math.abs(phase - 0.5) / 0.5, 0, 1);
  const gain = accuracy > 0.88 ? 0.36 : accuracy > 0.65 ? 0.22 : accuracy > 0.35 ? 0.1 : 0;
  return { accuracy, gain, depth: clamp(previousDepth + gain, 0, 1), perfect: accuracy > 0.88 };
}

export function woodScore(kind, completed, remainingSeconds = 0) {
  if (kind === 'stack') return Math.min(1000, Math.round(completed / 16 * 1000));
  return Math.min(1000, Math.round(completed * 170 + (completed >= 5 ? clamp(remainingSeconds, 0, 30) * 5 : 0)));
}
