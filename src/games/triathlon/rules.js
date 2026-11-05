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

export function raceProgress(stage, distance) {
  return clamp((stage + clamp(distance / STAGES[stage].distance, 0, 1)) / 3, 0, 1);
}

export function scoreRace({ seconds, gates, drinks, hits }) {
  return Math.max(0, Math.round(12000 - seconds * 70 + gates * 140 + drinks * 110 - hits * 180));
}

export function formatTime(seconds) {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}
