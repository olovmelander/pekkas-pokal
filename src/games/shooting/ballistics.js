/** The same constant-gravity arc is used for the visible clay and the shot's prediction. */
export function predictBallistic(position, velocity, seconds, out, gravity = 9.8) {
  const dt = Math.max(0, seconds);
  out.x = position.x + velocity.x * dt;
  out.y = position.y + velocity.y * dt - gravity * dt * dt * 0.5;
  out.z = position.z + velocity.z * dt;
  return out;
}

export function stepBallistic(position, velocity, seconds, gravity = 9.8) {
  const dt = Math.max(0, seconds);
  predictBallistic(position, velocity, dt, position, gravity);
  velocity.y -= gravity * dt;
}
