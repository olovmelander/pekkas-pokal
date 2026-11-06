/** Velocity of an actual gesture. Re-entry, long gaps and clock resets are not flicks. */
export function sampleFlick(previous, next, width, height) {
  const elapsed = next.time - previous.time;
  if (!previous.time || elapsed <= 0 || elapsed > 160 || width <= 0 || height <= 0) return { x: 0, y: 0, fresh: true };
  const seconds = Math.max(8, elapsed) / 1000;
  const bounded = value => Math.max(-8, Math.min(8, value));
  return { x: bounded((next.x - previous.x) / width / seconds), y: bounded((next.y - previous.y) / height / seconds), fresh: false };
}

export function movementKey(event) {
  const code = event.code || event.key;
  return ({ ArrowLeft: 'left', KeyA: 'left', a: 'left', A: 'left', ArrowRight: 'right', KeyD: 'right', d: 'right', D: 'right', ArrowUp: 'up', KeyW: 'up', w: 'up', W: 'up', ArrowDown: 'down', KeyS: 'down', s: 'down', S: 'down' })[code] || null;
}
