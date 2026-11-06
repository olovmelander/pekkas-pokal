import { STAGES, CATCH_RADIUS, clamp } from './rules.js';

/**
 * Body envelopes in metres from createAthlete, measured over whole strokes,
 * strides and pedal turns for both the player and rival detail levels
 * (tests/triathlon-spacing.test.js measures them again). Width is side to
 * side, length runs along the course.
 */
export const BODY = {
  swim: { width: 0.77, length: 2.22 },
  run: { width: 0.49, length: 1.19 },
  bike: { width: 0.59, length: 2.36 }
};
/** Air left between two bodies: beside each other and nose to tail. */
export const SIDE_GAP = 0.12;
export const END_GAP = 0.2;
/** Metres before contact where the sidestep starts to ease in. A rival
 * coming from behind can close much faster (after a barrier), so that side
 * eases over a longer stretch and the sidestep stays gentle. */
export const EASE = 2.5;
export const EASE_BEHIND = 4;
export const COURSE_EDGE = 3.85;
// Seconds over which a held athlete settles behind instead of stopping dead.
const SETTLE = 0.2;
// Metres per second for a sidestep that starts with the bodies already lined up.
const NUDGE = 3;
// A body resting on a boundary must not be pushed again by rounding.
const SLACK = 0.005;

export function clearance(discipline) {
  const body = BODY[discipline];
  return { side: body.width + SIDE_GAP, end: body.length + END_GAP };
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Centre-to-centre room needed beside a rival at this gap along the course. */
export function sideRoom(discipline, gap) {
  const { side, end } = clearance(discipline);
  return side * (1 - smoothstep(end, end + (gap < 0 ? EASE_BEHIND : EASE), Math.abs(gap)));
}

/** True only when the two real bodies intersect (no added air). */
export function bodiesOverlap(discipline, a, b) {
  const body = BODY[discipline];
  return Math.abs(a.x - b.x) < body.width && Math.abs(a.distance - b.distance) < body.length;
}

/**
 * Keep the player's body clear of the rivals in the same leg.
 *
 * `from` and `to` are the player's { x, distance } before and after this
 * frame's steering and pace; `rivals` are { lane, distance, prevDistance } in
 * the player's leg. Rivals are never moved. The player slides round a rival
 * on the side they are already on. When that sidestep would leave the course,
 * meet another rival or change whether an upcoming ring, bottle or barrier is
 * taken, or when the player steers across the rival's line, the player is
 * instead held softly just behind until they steer clear. Speed and stamina
 * are untouched, so this never costs pace by itself.
 */
export function separatePlayer({ discipline, from, to, dt, rivals = [], items = [], steer = 0 }) {
  const result = { x: to.x, distance: to.distance, eased: false, held: false };
  if (!BODY[discipline] || ![from.x, from.distance, to.x, to.distance].every(Number.isFinite)) return result;
  const { side, end } = clearance(discipline);
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const field = rivals.filter(r => Number.isFinite(r.lane) && Number.isFinite(r.distance))
    .map(r => ({ ...r, before: Number.isFinite(r.prevDistance) ? r.prevDistance : r.distance }))
    .sort((a, b) => Math.abs(a.distance - to.distance) - Math.abs(b.distance - to.distance));
  if (!field.length) return result;
  const lookahead = STAGES.find(leg => leg.id === discipline).speed * 1.2;
  const upcoming = items.filter(item => !item.resolved && item.at >= from.distance && item.at <= to.distance + lookahead);
  const inside = (lane, item) => Math.abs(lane - item.x) < CATCH_RADIUS[item.kind];
  const neutral = (a, b) => upcoming.every(item => inside(a, item) === inside(b, item));
  const blocked = (lane, self) => field.some(r => r !== self && Math.abs(r.distance - to.distance) < end && Math.abs(lane - r.lane) < side - SLACK);

  let { x } = to;
  for (const r of field) {
    const want = sideRoom(discipline, r.distance - to.distance);
    const off = x - r.lane;
    if (want <= SLACK || Math.abs(off) >= want - SLACK) continue;
    const previousGap = r.before - from.distance, previousOff = from.x - r.lane;
    const towards = Math.sign(previousOff) || Math.sign(off) || (r.lane > 0 ? -1 : 1);
    if (previousGap >= end - SLACK) {
      // Closing from behind: only an unforced, harmless sidestep is allowed.
      const settled = r.lane + towards * side;
      if (steer === -towards || Math.abs(settled) > COURSE_EDGE || blocked(settled, r) || !neutral(x, settled)) continue;
    }
    const target = r.lane + towards * want;
    // Already clear last frame: follow the eased boundary. Lined up: slide
    // out, never deeper than last frame whatever the steering says.
    const wasClear = Math.abs(previousOff) >= sideRoom(discipline, previousGap) - SLACK;
    const base = towards > 0 ? Math.max(x, Math.min(from.x, target)) : Math.min(x, Math.max(from.x, target));
    x = wasClear ? target : base + towards * Math.min(NUDGE * step, towards * (target - base));
    result.eased = true;
  }
  result.x = clamp(x, -COURSE_EDGE, COURSE_EDGE);

  // Anyone still lined up behind a rival settles just behind them.
  for (const r of field) {
    const previousGap = r.before - from.distance;
    if (previousGap < end - SLACK) continue;
    if (Math.abs(result.x - r.lane) >= sideRoom(discipline, r.distance - to.distance) - SLACK) continue;
    const limit = end + Math.max(0, previousGap - end) * Math.exp(-step / SETTLE);
    if (r.distance - result.distance < limit) {
      result.distance = Math.max(from.distance, Math.min(result.distance, r.distance - limit));
      result.held = true;
    }
  }
  return result;
}

/** At a stage start (behind the transition panel) step clear of anyone standing on the player. */
export function clearStart(discipline, x, distance, rivals) {
  const { side, end } = clearance(discipline);
  const near = rivals.filter(r => Number.isFinite(r.lane) && Number.isFinite(r.distance) && Math.abs(r.distance - distance) < end && Math.abs(x - r.lane) < side);
  if (!near.length || !Number.isFinite(x)) return x;
  const free = lane => Math.abs(lane) <= COURSE_EDGE && near.every(r => Math.abs(lane - r.lane) >= side - SLACK);
  const options = near.flatMap(r => [r.lane - side, r.lane + side]).filter(free).sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
  return options.length ? options[0] : x;
}
