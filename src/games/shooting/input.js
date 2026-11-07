/** NDC lift keeps a touch sight visible without making the top of the sky unreachable. */
export function touchAimOffset(fingerY, height) {
  if (height <= 0) return 0;
  const pixels = Math.min(92, height * 0.12);
  const topRoom = ((1 - fingerY) / 2) * height;
  return (Math.min(pixels, Math.max(0, topRoom - 8)) * 2) / height;
}

export function aimKey(event) {
  return ({ ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ShiftLeft: 'fine', ShiftRight: 'fine' })[event.code || event.key] || null;
}

/** Keep each physical binding held until that same key is released. */
export function createAimKeys() {
  const held = new Map();
  const keys = { left: false, right: false, up: false, down: false, fine: false };
  function sync() {
    const actions = new Set(held.values());
    Object.keys(keys).forEach(action => { keys[action] = actions.has(action); });
  }
  return {
    keys,
    press(event) {
      const action = aimKey(event);
      if (!action) return false;
      held.set(event.code || event.key, action);
      sync();
      return true;
    },
    release(event) {
      held.delete(event.code || event.key);
      sync();
    },
    clear() { held.clear(); sync(); }
  };
}

export function stepKeyboardAim(aim, keys, seconds) {
  const x = Number(!!keys.right) - Number(!!keys.left);
  const y = Number(!!keys.up) - Number(!!keys.down);
  const length = Math.max(1, Math.hypot(x, y));
  const speed = keys.fine ? 0.36 : 1.15;
  const dt = Math.max(0, seconds);
  return {
    x: Math.max(-0.985, Math.min(0.985, aim.x + x / length * speed * dt)),
    y: Math.max(-0.985, Math.min(0.985, aim.y + y / length * speed * dt))
  };
}
