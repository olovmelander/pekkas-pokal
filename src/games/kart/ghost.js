/** Time-trial ghost: the best lap recorded at about 20 Hz, stored compactly in
 * localStorage under a versioned key, replayed by time and used for a live
 * delta by distance. Pure apart from the storage helpers. */
export const GHOST_KEY = 'pp-kart-2012-ghost-v1';
export const GHOST_RATE = 20;
const TRACK_ID = 'varggropen-665';

/** Records one lap: samples are [time, lapDistance, lane, heading]. */
export function createGhostRecorder(rate = GHOST_RATE) {
  let samples = [], clock = Infinity;
  return {
    get samples() { return samples; },
    start() { samples = []; clock = Infinity; },
    record(time, distance, lane, heading) {
      if (![time, distance, lane, heading].every(Number.isFinite)) return;
      if (clock !== Infinity && time - clock < 1 / rate - 1e-6) return;
      clock = time;
      samples.push([time, distance, lane, heading]);
    },
    finish(lapTime, lapLength) {
      const last = samples[samples.length - 1];
      if (last && last[0] < lapTime) samples.push([lapTime, lapLength, last[2], last[3]]);
      const ghost = { lapTime, samples };
      samples = [];
      return ghost;
    }
  };
}

export function encodeGhost(ghost) {
  const flat = [];
  for (const [t, d, lane, heading] of ghost.samples) flat.push(Math.round(t * 100), Math.round(d * 10), Math.round(lane * 100), Math.round(heading * 1000));
  return JSON.stringify({ v: 1, track: TRACK_ID, lapTime: Math.round(ghost.lapTime * 1000) / 1000, rate: GHOST_RATE, s: flat });
}

export function decodeGhost(text) {
  try {
    const data = JSON.parse(text);
    if (!data || data.v !== 1 || data.track !== TRACK_ID || !Array.isArray(data.s) || data.s.length % 4 || !(data.lapTime > 0)) return null;
    const samples = [];
    for (let i = 0; i < data.s.length; i += 4) {
      const sample = [data.s[i] / 100, data.s[i + 1] / 10, data.s[i + 2] / 100, data.s[i + 3] / 1000];
      if (!sample.every(Number.isFinite)) return null;
      samples.push(sample);
    }
    return samples.length > 1 ? { lapTime: data.lapTime, samples } : null;
  } catch { return null; }
}

export function loadGhost(storage = globalThis.localStorage) {
  try { return decodeGhost(storage?.getItem(GHOST_KEY)); } catch { return null; }
}

export function saveGhost(ghost, storage = globalThis.localStorage) {
  try { storage?.setItem(GHOST_KEY, encodeGhost(ghost)); return true; } catch { return false; }
}

function bracket(samples, value, index) {
  let lo = 0, hi = samples.length - 1;
  if (value <= samples[0][index]) return [0, 0, 0];
  if (value >= samples[hi][index]) return [hi, hi, 0];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][index] <= value) lo = mid; else hi = mid;
  }
  const span = samples[hi][index] - samples[lo][index];
  return [lo, hi, span > 0 ? (value - samples[lo][index]) / span : 0];
}

/** Ghost pose at a lap time. */
export function ghostAt(ghost, time) {
  if (!ghost?.samples?.length) return null;
  const [a, b, f] = bracket(ghost.samples, time, 0);
  const p = ghost.samples[a], q = ghost.samples[b];
  let turn = q[3] - p[3];
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  return { distance: p[1] + (q[1] - p[1]) * f, lane: p[2] + (q[2] - p[2]) * f, heading: p[3] + turn * f, done: time >= ghost.lapTime };
}

/** Lap time at which the ghost passed a lap distance (for the live delta). */
export function ghostTimeAt(ghost, distance) {
  if (!ghost?.samples?.length) return null;
  const [a, b, f] = bracket(ghost.samples, distance, 1);
  return ghost.samples[a][0] + (ghost.samples[b][0] - ghost.samples[a][0]) * f;
}
