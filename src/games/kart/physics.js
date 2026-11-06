/** Pekkas Gokart handling: a track-frame bicycle model with real yaw.
 *
 * The kart still lives in Varggropen's track frame, so laps, the minimap,
 * camera sampling and standings keep working: `distance` runs along the
 * centreline and `lane` is the sideways offset (positive lies camera-left).
 * On top of that the kart has a heading relative to the tangent, a yaw rate,
 * front and rear slip angles, saturating tyres with a friction circle and
 * longitudinal load transfer. Metres, seconds, radians; no power-ups.
 */
export const LAPS = 3;
export const TRACK_HALF_WIDTH = 3.5;
/** Kart-centre lane where a straight kart's side touches the tyre barrier. */
export const WALL_LANE = 4.35;
/** Rental pace: about 67 km/h flat out on Varggropen's straights. */
export const TOP_SPEED = 18.6;
/** Sustained cornering acceleration a tidy driver reaches on asphalt. */
export const GRIP_ACCELERATION = 11.4;
export const GRAVITY = 9.81;
export const KART = Object.freeze({ mass: 165, inertia: 58, front: 0.86, rear: 0.64, height: 0.34, halfWidth: 0.82, halfLength: 1.3, axleTrack: 0.88 });
export const WHEELBASE = KART.front + KART.rear;
export const SUBSTEP = 1 / 240;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const DRIVE_MAX = 4.1;           // m/s², rental two-stroke off the line
const POWER = 47.5;              // W/kg at the rear axle
const AERO = 0.0067;             // 1/m, so drag balances drive near TOP_SPEED
const ENGINE_BRAKE = 0.55;       // m/s² when lifting
const BRAKE_DECEL = 7.2;         // m/s² at full pedal
const BRAKE_FRONT = 0.5;
const TYRE_C = 1.38;             // about 88 % of peak left at full sideways
// Wider rear tyres: stiffer and a touch grippier, so the kart is stable on
// throttle and only steps out when load comes off the rear (lift or brake).
const FRONT = { B: 15.5, grip: 0.95 }, REAR = { B: 19, grip: 1.06 };
const DRIVE_ELLIPSE = 0.6;       // a solid axle under power pushes rather than spins
const MAX_STEER = 0.5;
const LOAD_LAG = 0.12;           // s, chassis pitch before load moves

/** Grip, rolling drag and texture of each surface. Rumble is for feel/audio. */
export const SURFACES = Object.freeze({
  asphalt: Object.freeze({ grip: 1.25, roll: 0.32, rollSpeed: 0, bump: 0, rumble: 0 }),
  kerb: Object.freeze({ grip: 1.1, roll: 0.5, rollSpeed: 0.01, bump: 0.22, rumble: 1 }),
  grass: Object.freeze({ grip: 0.62, roll: 2.1, rollSpeed: 0.1, bump: 1, rumble: 0 })
});

/** Positive spline lane lies camera-left when looking along the track. */
export function steeringFromButtons(left, right) {
  return Number(left) - Number(right);
}

/** Fallback surface rule matching circuit.js: white edge at 3.34–3.44 m,
 * kerbs from 3.41 to 3.89 m in bends, asphalt to 3.5 m, grass beyond. */
export function laneSurface(lane, curvature = 0) {
  const side = Math.abs(lane);
  if (side <= 3.41) return 'asphalt';
  if (Math.abs(curvature) >= 0.017 && side <= 3.89) return 'kerb';
  return side <= TRACK_HALF_WIDTH ? 'asphalt' : 'grass';
}

export function newDriver(distance = 0, lane = 0, { assist = ASSIST, mass = KART.mass } = {}) {
  return {
    distance, lane, heading: 0, yawRate: 0, steerAngle: 0, u: 0, w: 0, speed: 0, lateral: 0,
    slip: 0, frontSlip: 0, wheelspin: 0, surface: 'asphalt', skidding: false, hit: 0, grip: 1,
    slipstream: 0, finishTime: null, rumble: 0, bump: 0, wallContact: false, held: false,
    launchPenalty: 0, atWall: false, assist, mass, longAccel: 0, latAccel: 0, throttle: 0, brake: 0, contact: 0, stuck: 0
  };
}

/** Steady speed a tidy driver can carry through a bend on asphalt. */
export function cornerSpeed(curvature) {
  return Math.min(TOP_SPEED, Math.sqrt(GRIP_ACCELERATION / Math.max(0.001, Math.abs(curvature))));
}

export function trackGap(a, b, trackLength) {
  return ((b - a + trackLength / 2) % trackLength + trackLength) % trackLength - trackLength / 2;
}

/** A modest drag reduction only while following another kart on the same line. */
export function slipstreamFactor(driver, opponents, trackLength) {
  let draft = 0;
  for (const opponent of opponents) {
    if (opponent === driver || opponent.ghost) continue;
    const gap = trackGap(driver.distance, opponent.distance, trackLength);
    if (gap > 2.2 && gap < 12 && Math.abs(driver.lane - opponent.lane) < 1.2) {
      draft = Math.max(draft, (1 - gap / 12) * (1 - Math.abs(driver.lane - opponent.lane) / 1.2));
    }
  }
  return draft;
}

/** Road-wheel angle available at full input. Grip-aware, so a full press at
 * speed asks for a little more than the tyres give instead of a spin. */
export function steerLimit(speed) {
  return clamp(WHEELBASE * 13 / Math.max(1, speed * speed) + 0.075, 0.1, 0.46);
}

/** How fast the steering column can move, slower at speed. */
export function steerRate(speed) {
  return 2.4 / (1 + speed / 10) + 0.5;
}

const tyre = (alpha, B) => Math.sin(TYRE_C * Math.atan(B * alpha));

/** Default countersteer help: how much of the rear's slide angle the front
 * wheels follow on their own, like a kart's caster pulling the wheel. */
export const ASSIST = 1.2;

/** Rear slide angle beyond ordinary cornering slip (rad). Countersteer
 * follows this, so normal cornering is untouched. */
export function slideAngle(driver) {
  const speed = Math.hypot(driver.u || 0, driver.w || 0);
  if (speed < 1.5) return 0;
  const alpha = Math.atan2((driver.w || 0) - KART.rear * (driver.yawRate || 0), Math.max(Math.abs(driver.u || 0), 0.5));
  return Math.sign(alpha) * clamp(Math.abs(alpha) - 0.08, 0, 0.6);
}

// --- Track environment --------------------------------------------------------
const environments = new WeakMap();

/** A track adapter with tabulated curvature. Accepts the route/circuit object
 * (`length`, `curvature()`, optional `surfaceAt()`) or a constant curvature. */
export function trackEnv(track) {
  if (typeof track === 'number' || track == null) {
    const k = Number(track) || 0;
    return { length: 100000, curvature: () => k, surface: (distance, lane) => laneSurface(lane, k) };
  }
  if (track.__isEnv) return track;
  let env = environments.get(track);
  if (env) return env;
  const spacing = 0.5, count = Math.max(8, Math.round(track.length / spacing)), step = track.length / count;
  const table = new Float64Array(count);
  for (let i = 0; i < count; i++) table[i] = track.curvature(i * step);
  const curvature = (distance) => {
    const x = (((distance / step) % count) + count) % count, i = Math.floor(x), f = x - i;
    return table[i] * (1 - f) + table[(i + 1) % count] * f;
  };
  const surface = (distance, lane) => {
    const kind = typeof track.surfaceAt === 'function' ? track.surfaceAt(distance, lane) : null;
    return SURFACES[kind] ? kind : kind ? 'grass' : laneSurface(lane, curvature(distance));
  };
  env = { __isEnv: true, length: track.length, curvature, surface, track };
  environments.set(track, env);
  return env;
}

// --- Single-kart integration ---------------------------------------------------
function prepare(driver, input, env) {
  const c = Math.cos(driver.heading);
  const left = env.surface(driver.distance, driver.lane + KART.axleTrack * c);
  const right = env.surface(driver.distance, driver.lane - KART.axleTrack * c);
  const a = SURFACES[left], b = SURFACES[right];
  driver.surface = left === 'grass' || right === 'grass' ? 'grass' : left === 'kerb' || right === 'kerb' ? 'kerb' : 'asphalt';
  driver._mu = (a.grip + b.grip) / 2;
  driver._roll = (a.roll + b.roll) / 2;
  driver._rollSpeed = (a.rollSpeed + b.rollSpeed) / 2;
  driver._bump = (a.bump + b.bump) / 2;
  driver.rumble = (a.rumble + b.rumble) / 2 * clamp(driver.speed / 8, 0, 1);
  driver.slipstream = driver.surface === 'grass' || input.brake ? 0 : clamp(input.slipstream || 0, 0, 1);
}

function substep(driver, input, env, h) {
  const m = driver.mass || KART.mass, I = KART.inertia * m / KART.mass, a = KART.front, b = KART.rear;
  let { u, w, yawRate: r } = driver;
  const throttleIn = clamp(Number(input.throttle) || 0, 0, 1), brake = clamp(Number(input.brake) || 0, 0, 1);
  const throttle = brake > 0 ? 0 : throttleIn;
  if (driver.held) {
    driver.u = driver.w = driver.yawRate = driver.speed = driver.lateral = 0;
    driver.wheelspin = throttle;
    driver.steerAngle += clamp(clamp(Number(input.steer) || 0, -1, 1) * 0.4 - driver.steerAngle, -3 * h, 3 * h);
    return;
  }
  const speed = Math.hypot(u, w);
  // Steering: speed-dependent limit and rate; the assist term turns the front
  // wheels a little towards the direction of travel, which is countersteer.
  const steer = clamp(Number(input.steer) || 0, -1, 1);
  const target = clamp(steer * steerLimit(speed) + (driver.assist ?? ASSIST) * slideAngle(driver), -MAX_STEER, MAX_STEER);
  // Unwinding and countersteering are quick hand movements; winding on is not.
  const unwinding = Math.abs(target) < Math.abs(driver.steerAngle) || (target - driver.steerAngle) * r < 0;
  const rate = steerRate(speed) * (unwinding ? 2.4 : 1) * h;
  driver.steerAngle += clamp(target - driver.steerAngle, -rate, rate);
  const delta = driver.steerAngle, cd = Math.cos(delta), sd = Math.sin(delta);

  // Load transfer from the lagged longitudinal acceleration.
  const mu = driver._mu ?? SURFACES.asphalt.grip;
  const shift = m * clamp(driver.longAccel, -5, 4) * KART.height / WHEELBASE;
  const fzF = Math.max(m * GRAVITY * 0.15, m * GRAVITY * b / WHEELBASE - shift);
  const fzR = Math.max(m * GRAVITY * 0.15, m * GRAVITY * a / WHEELBASE + shift);
  const maxF = mu * FRONT.grip * fzF, maxR = mu * REAR.grip * fzR;

  // Contact-patch velocities in each wheel's frame.
  const fyVel = w + a * r;
  const frontLong = u * cd + fyVel * sd, frontLat = -u * sd + fyVel * cd;
  const rearLong = u, rearLat = w - b * r;
  const alphaF = Math.atan2(frontLat, Math.max(Math.abs(frontLong), 0.8));
  const alphaR = Math.atan2(rearLat, Math.max(Math.abs(rearLong), 0.8));

  // Longitudinal demands, then the friction circle per axle.
  let launch = 1;
  if (driver.launchPenalty > 0) { launch = 0.32; driver.launchPenalty = Math.max(0, driver.launchPenalty - h); }
  const drive = u > -0.5 ? throttle * Math.min(DRIVE_MAX, POWER / Math.max(speed, 1)) * m * launch : 0;
  const brakeForce = brake * BRAKE_DECEL * m;
  let fxF = -BRAKE_FRONT * brakeForce * clamp(frontLong / 0.4, -1, 1);
  let fxR = drive - (1 - BRAKE_FRONT) * brakeForce * clamp(rearLong / 0.4, -1, 1);
  let capF = maxF, capR = maxR, spin = launch < 1 ? 1 : 0, locked = false;
  if (Math.abs(fxF) > maxF * 0.97) { fxF = Math.sign(fxF) * maxF * 0.9; capF = maxF * 0.3; locked = true; } else capF = Math.sqrt(maxF * maxF - fxF * fxF);
  if (Math.abs(fxR) > maxR * 0.97) {
    if (fxR > 0) spin = Math.max(spin, clamp(fxR / maxR - 0.97, 0, 1) * 3); else locked = true;
    fxR = Math.sign(fxR) * maxR * 0.88; capR = maxR * 0.3;
  } else { const used = fxR > 0 ? fxR * DRIVE_ELLIPSE : fxR; capR = Math.sqrt(maxR * maxR - used * used); }
  const fyF = -capF * tyre(alphaF, FRONT.B), fyR = -capR * tyre(alphaR, REAR.B);

  const forceX = fxF * cd - fyF * sd + fxR, forceY = fxF * sd + fyF * cd + fyR;
  const torque = a * (fxF * sd + fyF * cd) - b * fyR;
  const coast = throttle === 0 && brake === 0 ? ENGINE_BRAKE : 0;
  const resist = speed > 0.01 ? Math.min(speed / h, driver._roll + driver._rollSpeed * speed + coast + AERO * (1 - 0.24 * driver.slipstream) * speed * speed) : 0;
  const ax = forceX / m - (speed > 0.01 ? resist * u / speed : 0);
  const ay = forceY / m - (speed > 0.01 ? resist * w / speed : 0);
  u += (ax + w * r) * h;
  w += (ay - u * r) * h;
  r += torque / I * h;
  driver.longAccel += (ax - driver.longAccel) * (1 - Math.exp(-h / LOAD_LAG));
  driver.latAccel = ay;

  // Grass is bumpy: a deterministic jolt pattern along the ground.
  if (driver._bump > 0 && speed > 0.5) {
    const jolt = Math.sin(driver.distance * 2.3 + driver.lane * 1.7) * Math.sin(driver.distance * 0.73 + 1.3);
    r += jolt * driver._bump * Math.min(speed, 12) * 0.5 * h;
    driver.bump = driver._bump * clamp(speed / 10, 0, 1);
  } else driver.bump = 0;

  // Blend into a kinematic bicycle at walking pace, where slip angles are meaningless.
  const now = Math.hypot(u, w);
  if (now < 3) {
    const lambda = clamp((now - 0.8) / 2.2, 0, 1), rKin = u * Math.tan(delta) / WHEELBASE;
    r = lambda * r + (1 - lambda) * rKin;
    w = lambda * w + (1 - lambda) * rKin * b;
  }
  // A marshal's helping hand: a kart stuck across the track is turned back.
  driver.stuck = now < 1.5 && (Math.abs(driver.heading) > 0.9 || (driver.atWall && throttle > 0)) ? (driver.stuck || 0) + h : 0;
  if (driver.stuck > 0.6) {
    r = Math.abs(driver.heading) > 0.05 ? -Math.sign(driver.heading) * 1.6 : 0;
    if (Math.abs(driver.lane) > TRACK_HALF_WIDTH) driver.lane -= Math.sign(driver.lane) * 0.8 * h;
  }
  if ((brake > 0 && now < 0.2) || (throttle === 0 && now < 0.06)) u = w = r = 0;

  // Frenet update: d(heading)/dt = yawRate - curvature * ds/dt.
  const kappa = env.curvature(driver.distance);
  const ch = Math.cos(driver.heading), sh = Math.sin(driver.heading);
  const along = u * ch - w * sh, lateral = u * sh + w * ch;
  const ds = along / Math.max(0.3, 1 - kappa * driver.lane);
  driver.distance += ds * h;
  driver.lane += lateral * h;
  driver.heading += (r - kappa * ds) * h;
  if (driver.heading > Math.PI) driver.heading -= Math.PI * 2;
  else if (driver.heading < -Math.PI) driver.heading += Math.PI * 2;
  driver.u = u; driver.w = w; driver.yawRate = r;
  driver.speed = Math.hypot(u, w);
  driver.lateral = lateral;
  driver.throttle = throttle; driver.brake = brake;
  driver._alphaF = alphaF; driver._alphaR = alphaR; driver._locked = locked;
  driver.wheelspin += (spin - driver.wheelspin) * Math.min(1, h * 12);
}

/** Track-frame velocity (along, lateral) of the kart's centre. */
function trackVelocity(driver) {
  const c = Math.cos(driver.heading), s = Math.sin(driver.heading);
  return [driver.u * c - driver.w * s, driver.u * s + driver.w * c];
}
function setTrackVelocity(driver, along, lateral) {
  const c = Math.cos(driver.heading), s = Math.sin(driver.heading);
  driver.u = along * c + lateral * s;
  driver.w = -along * s + lateral * c;
  driver.speed = Math.hypot(driver.u, driver.w);
}

/** Tyre barrier: an impulse at the outermost corner with restitution and
 * scrub. The kart bounces and rotates instead of sticking to the wall. */
function resolveBarrier(driver, events) {
  const side = Math.sign(driver.lane);
  if (!side) return;
  const c = Math.cos(driver.heading), s = Math.sin(driver.heading);
  let best = -Infinity, px = 0, pn = 0;
  for (const x of [KART.halfLength, -KART.halfLength]) for (const y of [KART.halfWidth, -KART.halfWidth]) {
    const along = x * c - y * s, lateral = x * s + y * c;
    if (side * lateral > best) { best = side * lateral; px = along; pn = lateral; }
  }
  const penetration = side * driver.lane + best - (WALL_LANE + KART.halfWidth);
  if (Math.abs(driver.lane) < WALL_LANE - 0.55) driver.wallContact = false;
  driver.atWall = penetration > -0.03;
  if (penetration <= 0) return;
  const m = driver.mass || KART.mass, I = KART.inertia * m / KART.mass;
  let [vs, vn] = trackVelocity(driver);
  let r = driver.yawRate;
  const normalSpeed = side * (vn + r * px);
  driver.lane -= side * penetration;
  if (normalSpeed <= 0) return;
  const restitution = 0.32, friction = 0.4;
  const j = (1 + restitution) * normalSpeed / (1 / m + px * px / I);
  vn -= side * j / m;
  r -= side * j * px / I;
  const tangent = vs - r * pn;
  const jt = -Math.sign(tangent) * Math.min(friction * j, Math.abs(tangent) / (1 / m + pn * pn / I));
  vs += jt / m;
  r -= pn * jt / I;
  driver.yawRate = r;
  setTrackVelocity(driver, vs, vn);
  if (normalSpeed > 1.2 && !driver.wallContact) {
    driver.wallContact = true;
    driver.hit = Math.max(driver.hit, 0.8);
    events.push({ type: 'barrier', driver, speed: normalSpeed });
  }
}

// --- Kart-to-kart contact ----------------------------------------------------------
const CIRCLES = [0.5, -0.5];
const RADIUS = 0.8;

/** Two circles per kart, impulse with mass, restitution and rubbing friction.
 * Positional correction is split by inverse mass, so karts can run
 * wheel-to-wheel without passing through each other. */
export function resolveContact(a, b, length, events = []) {
  if (Math.abs(trackGap(a.distance, b.distance, length)) > 3.2 || Math.abs(b.lane - a.lane) > 2.2) return false;
  const scale = 1;
  const ca = Math.cos(a.heading), sa = Math.sin(a.heading), cb = Math.cos(b.heading), sb = Math.sin(b.heading);
  let touched = false;
  for (const xa of CIRCLES) for (const xb of CIRCLES) {
    const gap = trackGap(a.distance, b.distance, length), dn = b.lane - a.lane;
    const ax = xa * ca, an = xa * sa, bx = gap * scale + xb * cb, bn = dn + xb * sb;
    let nx = bx - ax, nn = bn - an;
    const dist = Math.hypot(nx, nn), overlap = RADIUS * 2 - dist;
    if (overlap <= 0) continue;
    if (dist < 1e-6) { nx = 0; nn = a.lane <= b.lane ? 1 : -1; } else { nx /= dist; nn /= dist; }
    const ma = a.mass || KART.mass, mb = b.mass || KART.mass;
    const ia = KART.inertia * ma / KART.mass, ib = KART.inertia * mb / KART.mass;
    // Contact point midway between the circle surfaces.
    const cx = ax + nx * RADIUS, cn = an + nn * RADIUS;
    const rax = cx, ran = cn, rbx = cx - gap * scale, rbn = cn - dn;
    const [vas, van] = trackVelocity(a), [vbs, vbn] = trackVelocity(b);
    const pa = [vas - a.yawRate * ran, van + a.yawRate * rax];
    const pb = [vbs - b.yawRate * rbn, vbn + b.yawRate * rbx];
    const rel = (pb[0] - pa[0]) * nx + (pb[1] - pa[1]) * nn;
    const share = (1 / ma) / (1 / ma + 1 / mb);
    // Separate along the normal (in track coordinates) before the impulse.
    a.distance -= nx * overlap * share; a.lane -= nn * overlap * share;
    b.distance += nx * overlap * (1 - share); b.lane += nn * overlap * (1 - share);
    touched = true;
    if (rel >= 0) continue;
    const crossA = rax * nn - ran * nx, crossB = rbx * nn - rbn * nx;
    const j = -(1 + 0.25) * rel / (1 / ma + 1 / mb + crossA * crossA / ia + crossB * crossB / ib);
    let tx = -nn, tn = nx;
    const relT = (pb[0] - pa[0]) * tx + (pb[1] - pa[1]) * tn;
    if (relT > 0) { tx = -tx; tn = -tn; }
    const crossAT = rax * tn - ran * tx, crossBT = rbx * tn - rbn * tx;
    const jt = Math.min(0.3 * j, Math.abs(relT) / (1 / ma + 1 / mb + crossAT * crossAT / ia + crossBT * crossBT / ib));
    const ix = nx * j + tx * jt, inn = nn * j + tn * jt;
    setTrackVelocity(a, vas - ix / ma, van - inn / ma);
    setTrackVelocity(b, vbs + ix / mb, vbn + inn / mb);
    a.yawRate -= (rax * inn - ran * ix) / ia;
    b.yawRate += (rbx * inn - rbn * ix) / ib;
    a.contact = b.contact = 0.25;
    if (-rel > 1.4 && a.hit <= 0 && b.hit <= 0) {
      a.hit = b.hit = 0.65;
      events.push({ type: 'contact', a, b, speed: -rel });
    }
  }
  return touched;
}

function finalize(driver, step) {
  driver.hit = Math.max(0, driver.hit - step);
  driver.contact = Math.max(0, (driver.contact || 0) - step);
  const peak = 0.126;
  const rear = Math.abs(driver._alphaR || 0), front = Math.abs(driver._alphaF || 0);
  const moving = clamp((driver.speed - 2) / 3, 0, 1);
  driver.slip = clamp((rear - peak * 0.75) / 0.3, 0, 1) * moving;
  driver.frontSlip = clamp((front - peak * 0.9) / 0.3, 0, 1) * moving;
  driver.skidding = driver.speed > 3 && (driver.slip > 0.12 || driver.frontSlip > 0.2 || !!driver._locked);
  const surfaceGrip = (driver._mu ?? SURFACES.asphalt.grip) / SURFACES.asphalt.grip;
  driver.grip = clamp(surfaceGrip * (1 - 0.75 * Math.max(driver.slip, driver.frontSlip * 0.7)), 0.12, 1);
}

/** Steps every kart together with fixed substeps, so barriers and contacts
 * are resolved at 240 Hz and nothing tunnels. Returns the frame's events. */
export function stepField(drivers, inputs, track, dt, { contacts = true } = {}) {
  const env = trackEnv(track);
  const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
  const events = [];
  const count = Math.ceil(step / SUBSTEP - 1e-9), h = count ? step / count : 0;
  drivers.forEach((driver, i) => {
    const input = inputs[i] || {};
    if (input.slipstream === undefined && drivers.length > 1) input.slipstream = slipstreamFactor(driver, drivers, env.length);
    prepare(driver, input, env);
  });
  for (let k = 0; k < count; k++) {
    drivers.forEach((driver, i) => {
      if (driver.frozen) return;
      substep(driver, inputs[i] || {}, env, h);
      resolveBarrier(driver, events);
    });
    if (!contacts) continue;
    for (let i = 0; i < drivers.length; i++) for (let j = i + 1; j < drivers.length; j++) {
      const a = drivers[i], b = drivers[j];
      if (a.ghost || b.ghost || a.finishTime !== null || b.finishTime !== null) continue;
      resolveContact(a, b, env.length, events);
    }
  }
  drivers.forEach((driver) => finalize(driver, step));
  return events;
}

/** One kart on its own; `track` may be a route or a constant curvature. */
export function stepDriver(driver, input, track, dt) {
  const events = stepField([driver], [{ ...input }], track, dt);
  return { barrier: events.some((event) => event.type === 'barrier') };
}

/** Fractional crossing time makes the order independent of array/frame order. */
export function markFinish(driver, previousDistance, totalDistance, elapsed, dt) {
  if (driver.finishTime !== null || driver.distance < totalDistance) return;
  const fraction = clamp((totalDistance - previousDistance) / Math.max(0.0001, driver.distance - previousDistance), 0, 1);
  driver.finishTime = elapsed - dt + dt * fraction;
}

export function raceStandings(drivers) {
  return [...drivers].sort((a, b) => {
    if (a.finishTime != null && b.finishTime != null) return a.finishTime - b.finishTime;
    if (a.finishTime != null) return -1;
    if (b.finishTime != null) return 1;
    return b.distance - a.distance;
  });
}

export function racePosition(distance, opponents) {
  return 1 + opponents.filter((driver) => driver.distance > distance).length;
}

export function raceScore(position, seconds, incidents = 0) {
  return Math.max(0, Math.round((7 - position) * 1000 + Math.max(0, 100 - seconds) * 35 + Math.max(0, 500 - incidents * 100)));
}

/** A loaded engine is audible; lifting/braking quietens it without fake shifts. */
export function engineFeedback(speed, { throttle = false, brake = false, active = true } = {}) {
  const moving = clamp(speed, 0, 20);
  const load = throttle && !brake;
  return {
    frequency: 48 + moving * 6.5 + (load ? 3 + 12 * (1 - moving / 20) : 0),
    gain: active ? (load ? 0.012 + moving * 0.0004 : 0.004 + moving * 0.00012) : 0
  };
}

/** Tenths are truncated, preventing a false 0:60.0 at the minute boundary. */
export function formatTime(seconds) {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}

/** Signed delta such as "−0.42" / "+1.07" for HUDs. */
export function formatDelta(seconds) {
  if (!Number.isFinite(seconds)) return '';
  return `${seconds < 0 ? '−' : '+'}${Math.abs(seconds).toFixed(2)}`;
}
