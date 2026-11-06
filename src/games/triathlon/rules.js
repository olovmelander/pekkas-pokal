/** User-confirmed 2017 order. Distances and stamina remain arcade interpretations. */
export const STAGES = [
  { id: 'swim', name: 'SIMNING', verb: 'SIMMA', distance: 260, speed: 8.5, surge: 1.42, drain: 19, recover: 12, color: '#65dddc' },
  { id: 'run', name: 'LÖPNING', verb: 'SPRING', distance: 320, speed: 9.6, surge: 1.5, drain: 23, recover: 12, color: '#efab7c' },
  { id: 'bike', name: 'CYKLING', verb: 'CYKLA', distance: 620, speed: 17, surge: 1.5, drain: 21, recover: 10, color: '#f0c768' }
];

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Exhaustion has hysteresis: a tiny recovery cannot immediately re-enable sprint. */
export function paceStep({ stamina, exhausted, stage, surge, drafting = false, slow = 0 }, dt) {
  const spec = STAGES[stage];
  const pushing = surge && !exhausted && stamina > 0;
  const shelter = drafting && spec.id === 'bike';
  const effort = pushing ? -spec.drain * (shelter ? 0.52 : 1) : spec.recover * (shelter ? 1.5 : 1);
  const energy = clamp(stamina + effort * Math.max(0, dt), 0, 100);
  const tired = energy <= 0 || (exhausted && energy < 25);
  const speed = spec.speed * (pushing && !tired ? spec.surge : tired ? 0.65 : 1) * (slow > 0 ? 0.48 : 1);
  return { stamina: energy, exhausted: tired, speed, pushing: pushing && !tired };
}

/** Advance one frame, stopping its clock and energy use at the exact finish. */
export function advancePace(state, dt, remaining = Infinity) {
  const step = Math.max(0, dt);
  const full = paceStep(state, step);
  const speed = state.speed + (full.speed - state.speed) * (1 - Math.exp(-step * (state.slow > 0 ? 14 : 6)));
  const travel = speed * step;
  const fraction = travel > 0 ? clamp(remaining / travel, 0, 1) : 1;
  const time = step * fraction;
  const pace = fraction < 1 ? paceStep(state, time) : full;
  return { ...pace, speed, distance: travel * fraction, time, fraction };
}

/** Side position when an item is crossed, rather than at the end of the frame. */
export function passageLane(fromDistance, toDistance, fromLane, toLane, at) {
  if (at < fromDistance || at > toDistance || toDistance <= fromDistance) return null;
  return fromLane + (toLane - fromLane) * (at - fromDistance) / (toDistance - fromDistance);
}

export function finishPlace(seconds, rivals) {
  return 1 + rivals.filter(rival => rival.duration < seconds).length;
}

/** Cadence integrates elapsed motion; pressing tempo never changes the phase. */
export function advanceMotion(phase, speed, baseSpeed, dt) {
  return (phase + Math.max(0, speed) / baseSpeed * 8 * Math.max(0, dt)) % (Math.PI * 2);
}

export function raceProgress(stage, distance) {
  return clamp((stage + clamp(distance / STAGES[stage].distance, 0, 1)) / 3, 0, 1);
}

/** Each rival follows their own three legs; no teleporting into the player's leg. */
export function rivalAtTime(elapsed, duration, strengths = [1, 1, 1]) {
  const weights = STAGES.map((leg, i) => leg.distance / (leg.speed * strengths[i]));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let time = Math.max(0, elapsed);
  for (let stage = 0; stage < STAGES.length; stage++) {
    const split = duration * weights[stage] / total;
    if (time < split || stage === STAGES.length - 1) {
      const distance = STAGES[stage].distance * clamp(time / split, 0, 1);
      return { stage, distance, speed: STAGES[stage].distance / split, progress: raceProgress(stage, distance), finished: elapsed >= duration };
    }
    time -= split;
  }
}

export function canDraft(stage, distance, lane, rival) {
  const gap = rival.distance - distance;
  return STAGES[stage].id === 'bike' && rival.stage === stage && !rival.finished && gap > 2 && gap < 16 && Math.abs(lane - rival.lane) < 1.05;
}

export function scoreRace({ seconds, gates, drinks, hits }) {
  return Math.max(0, Math.round(12000 - seconds * 70 + gates * 140 + drinks * 110 - hits * 180));
}

export function formatTime(seconds) {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}
