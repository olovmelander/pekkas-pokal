/** Active play time. Call tick only while the game is allowed to advance.
 * All units are seconds. Delays scheduled by callbacks start at the current
 * active time and cannot recurse within the same tick. No native timers.
 */
export function createGameClock() {
  let now = 0;
  let nextId = 1;
  let destroyed = false;
  const pending = new Map();
  return {
    get now() { return now; },
    get pending() { return pending.size; },
    schedule(callback, seconds = 0) {
      if (destroyed) return null;
      if (typeof callback !== 'function') throw new TypeError('A scheduled action must be a function');
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Delay must be finite and nonnegative');
      const id = nextId++;
      pending.set(id, { at: now + seconds, callback });
      return id;
    },
    cancel(id) { pending.delete(id); },
    clear() { pending.clear(); },
    tick(seconds) {
      if (destroyed) return;
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Delta must be finite and nonnegative');
      now += seconds;
      const due = [...pending.entries()].filter(([, task]) => task.at <= now + 1e-9)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      for (const [id, task] of due) {
        if (!pending.delete(id) || destroyed) continue;
        task.callback();
      }
    },
    destroy() { destroyed = true; pending.clear(); }
  };
}
