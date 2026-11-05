/**
 * Pinball physics — 2D on the playfield plane, rendered in 3D.
 *
 * A pinball is a ball rolling on a tilted plane, so the simulation is 2D:
 * (x, y) where +y points up the table. This keeps collision exact and cheap,
 * which matters because the ball moves fast enough to tunnel through walls if
 * you integrate carelessly.
 *
 * Everything is a capsule (segment + radius) or a circle. That covers walls,
 * rails, flippers, posts and bumpers with one pair of collision routines.
 *
 * Feel notes (measured with the headless rig in the pin-feel report):
 * - Substeps are sized from ball speed PLUS flipper sweep speed, so nothing
 *   ever moves more than ~0.19 units relative to anything it can hit.
 * - Friction is Coulomb and impact-only. The ball rolls, so a resting
 *   contact neither drags it nor holds it balanced on a round cap.
 * - Flippers are solenoid-driven with a compliant end-of-stroke hold and
 *   rubber that deadens with impact speed: cradles, catches and passes.
 * - Pop bumpers and slingshots are active coils: they fire on contact,
 *   throw at a near-constant speed with a few degrees of scatter, and then
 *   need a moment to recharge.
 */

/* ------------------------------------------------------------------ vectors */

export const len = (x, y) => Math.hypot(x, y);

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Closest point to (px,py) on segment a→b, returned as [x, y, t].
 */
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return [ax, ay, 0];
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = clamp(t, 0, 1);
  return [ax + t * dx, ay + t * dy, t];
}

/* ------------------------------------------------------------------- colliders */

/**
 * Static capsule: a segment with thickness. Walls, rails, posts (a=b).
 */
export function segment(ax, ay, bx, by, opts = {}) {
  return {
    kind: 'segment',
    ax,
    ay,
    bx,
    by,
    radius: opts.radius ?? 0.28,
    restitution: opts.restitution ?? 0.42,
    friction: opts.friction ?? 0.04,
    kick: opts.kick ?? 0,
    kickMin: opts.kickMin ?? 0,
    // Active kickers (slingshots) fire a coil: see World.resolve
    active: opts.active ?? false,
    jitter: opts.jitter ?? 0,
    cooldown: opts.cooldown ?? 0.08,
    firedAt: -1,
    // A sensor detects the ball passing through without touching it —
    // used for orbit shots, inlane rollovers and other scoring switches.
    sensor: opts.sensor ?? false,
    // One-way gates: collide only when `filter(ball)` is true, e.g. only for
    // descending balls. This is how a real orbit keeps its return path from
    // dumping every ball into the outlane.
    filter: opts.filter || null,
    id: opts.id || null,
    onHit: opts.onHit || null,
    enabled: true
  };
}

export function circle(cx, cy, radius, opts = {}) {
  return {
    kind: 'circle',
    cx,
    cy,
    radius,
    restitution: opts.restitution ?? 0.5,
    friction: opts.friction ?? 0.02,
    kick: opts.kick ?? 0,
    kickMin: opts.kickMin ?? 0,
    // Active kickers (pop bumpers) fire a coil: see World.resolve
    active: opts.active ?? false,
    jitter: opts.jitter ?? 0,
    cooldown: opts.cooldown ?? 0.08,
    firedAt: -1,
    sensor: opts.sensor ?? false,
    filter: opts.filter || null,
    id: opts.id || null,
    onHit: opts.onHit || null,
    enabled: true
  };
}

/**
 * Builds a chain of segments from a list of [x, y] points.
 */
export function chain(points, opts = {}) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push(
      segment(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], opts)
    );
  }
  return out;
}

/**
 * Approximates a circular arc with segments. Angles in radians.
 */
export function arc(cx, cy, radius, from, to, steps, opts = {}) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return chain(pts, opts);
}

/* -------------------------------------------------------------------- flipper */

/**
 * A flipper is a capsule that rotates about its pivot. The ball is launched by
 * the *contact point's* velocity, not the flipper's angle, which is what makes
 * tip shots faster than base shots — the detail that makes flippers feel real.
 *
 * The stroke is driven like a solenoid, not a servo: the bat accelerates
 * hard from rest (full speed in under 10 ms), slams into its end-of-stroke
 * stop and is held there by a weaker hold winding. That hold is compliant:
 * a ball arriving at a raised flipper pushes it back a few degrees and the
 * coil pulls it home, soaking up the hit. That give, plus rubber that goes
 * deader the harder it is struck, is what makes a live catch and a cradle
 * possible. A flipper at rest sits on its stop and does not give.
 */
export class Flipper {
  /**
   * @param {number} px pivot x
   * @param {number} py pivot y
   * @param {number} length
   * @param {number} restAngle radians
   * @param {number} activeAngle radians
   */
  constructor(px, py, length, restAngle, activeAngle, opts = {}) {
    this.px = px;
    this.py = py;
    this.length = length;
    this.restAngle = restAngle;
    this.activeAngle = activeAngle;
    // +1 when the stroke turns counter-clockwise (left flipper), -1 otherwise
    this.dir = Math.sign(activeAngle - restAngle) || 1;
    this.angle = restAngle;
    this.omega = 0;
    this.pressed = false;
    this.eos = false;
    // Tapered like the real bat: thick rubber over the pivot, slim at the
    // tip. The taper tilts the face normal a few degrees toward the tip,
    // which is part of what lets a late flip send the ball cross-table.
    this.radius = opts.radius ?? 0.42;
    this.tipRadius = opts.tipRadius ?? this.radius;
    this.restitution = opts.restitution ?? 0.42;
    this.hitRestitution = opts.hitRestitution ?? 0.75;
    // Stroke profile, rad/s and rad/s². Full stroke ≈ 28 ms up, ≈ 55 ms back.
    this.upSpeed = opts.upSpeed ?? 30;
    this.upAccel = opts.upAccel ?? 6000;
    this.downSpeed = opts.downSpeed ?? 21;
    this.downAccel = opts.downAccel ?? 1500;
    // Hold winding: how hard the raised bat is pulled back to its stop, and
    // how much a hit moves it (inverse moment of inertia, per unit impulse)
    this.holdAccel = opts.holdAccel ?? 400;
    this.invInertia = opts.invInertia ?? 0.12;
    this.onHit = opts.onHit || null;
    this.enabled = true;
  }

  get tipX() {
    return this.px + Math.cos(this.angle) * this.length;
  }

  get tipY() {
    return this.py + Math.sin(this.angle) * this.length;
  }

  /** Fastest surface speed this flipper can reach during the next step */
  sweepSpeed() {
    if (this.pressed && !this.eos) return this.upSpeed * this.length;
    if (!this.pressed && this.angle !== this.restAngle) return this.downSpeed * this.length;
    return Math.abs(this.omega) * this.length;
  }

  update(dt) {
    const s = this.dir;
    // w: angular speed along the stroke, + is up
    let w = this.omega * s;
    if (this.pressed) {
      // Power stroke from below; once on the stop, the weaker hold winding
      // pulls a knocked-back bat home — that difference is the catch's cushion
      const accel = this.eos ? this.holdAccel : this.upAccel;
      w = Math.min(this.upSpeed, w + accel * dt);
      this.angle += w * s * dt;
      if ((this.angle - this.activeAngle) * s >= 0) {
        this.angle = this.activeAngle;
        w = 0;
        this.eos = true;
      }
      // Knocked well clear of the stop, it is a power stroke again
      if (this.eos && (this.activeAngle - this.angle) * s > 0.35) this.eos = false;
    } else {
      w = Math.max(-this.downSpeed, w - this.downAccel * dt);
      this.angle += w * s * dt;
      if ((this.angle - this.restAngle) * s <= 0) {
        this.angle = this.restAngle;
        w = 0;
      }
      this.eos = false;
    }
    this.omega = w * s;
  }

  /**
   * Resolves the ball against this flipper, including the impulse from the
   * moving surface.
   */
  collide(ball) {
    if (!this.enabled) return false;

    // Closest point on a tapered capsule: the touching sphere along the axis
    // sits h·tan(α) behind the ball's projection, sin(α) = taper / length
    const ux = Math.cos(this.angle);
    const uy = Math.sin(this.angle);
    const ox = ball.x - this.px;
    const oy = ball.y - this.py;
    const s = ox * ux + oy * uy;
    const h = Math.abs(-ox * uy + oy * ux);
    const k = (this.radius - this.tipRadius) / this.length;
    const sa = clamp(s - (h * k) / Math.sqrt(1 - k * k), 0, this.length);
    const along = sa / this.length;
    const qx = this.px + ux * sa;
    const qy = this.py + uy * sa;

    let dx = ball.x - qx;
    let dy = ball.y - qy;
    let dist = len(dx, dy);
    const minDist = ball.radius + this.radius - k * sa;
    if (dist >= minDist) return false;

    if (dist < 1e-6) {
      // Degenerate: push straight out from the flipper's up face
      dx = -Math.sin(this.angle) * this.dir;
      dy = Math.cos(this.angle) * this.dir;
      dist = 1;
    }

    const nx = dx / dist;
    const ny = dy / dist;

    // Depenetrate
    const pen = minDist - dist;
    ball.x += nx * pen;
    ball.y += ny * pen;

    // Velocity of the flipper surface at the contact point: ω × r
    const rx = ball.x - nx * ball.radius - this.px;
    const ry = ball.y - ny * ball.radius - this.py;
    const contactVx = -this.omega * ry;
    const contactVy = this.omega * rx;

    const relVx = ball.vx - contactVx;
    const relVy = ball.vy - contactVy;
    const vn = relVx * nx + relVy * ny;

    if (vn < 0) {
      const swinging = this.pressed && !this.eos && this.omega * this.dir > 1;
      // Rubber goes deader the harder it is hit, and the thick rubber over
      // the pivot is softer than the tip — a strong tip, a soft base
      // A bat swinging into the ball springs off much harder than a still
      // one: the rubber is struck at speed and the coil is still driving.
      // That clean separation is what lets timing aim the shot instead of
      // the ball sliding out to the tip and leaving at the end-of-stroke angle.
      let e = (swinging ? this.hitRestitution : this.restitution) * (0.82 + 0.18 * along);
      if (!swinging) e *= clamp(1.08 - (-vn - 4) * 0.022, 0.5, 1);

      // A raised flipper yields against its hold winding: effective mass
      // coupling, and the bat is knocked back toward rest
      let k = 1;
      const torqueArm = rx * ny - ry * nx; // r × n
      // Only a real hit moves it: a ball resting on the raised bat (a cradle,
      // or one balanced on the tip) gets a rigid, ordinary contact
      const yields = this.pressed && this.eos && torqueArm * this.dir > 0 && -vn > 3;
      if (yields) k = 1 / (1 + torqueArm * torqueArm * this.invInertia);
      const j = -(1 + e) * vn * k;
      ball.vx += nx * j;
      ball.vy += ny * j;
      if (yields) this.omega -= j * torqueArm * this.invInertia;

      // Coulomb friction: the rubber grips in proportion to how hard it was
      // struck. (Applied as a per-substep drag it used to pin a ball rolling
      // down the bat to ~2.5 u/s, which made every cradle release crawl.)
      const tx = -ny;
      const ty = nx;
      const vt = (ball.vx - contactVx) * tx + (ball.vy - contactVy) * ty;
      // Only on a real impact: the ball rolls, so a resting contact has no
      // sliding to resist (as static friction it would hold a ball balanced
      // on the tip, or stop it rolling down the bat)
      const mu = -vn > 2 ? 0.18 * j : 0;
      const dvt = clamp(vt, -mu, mu);
      ball.vx -= tx * dvt;
      ball.vy -= ty * dvt;

      if (this.onHit) this.onHit(Math.abs(vn), ball);
    }
    return true;
  }
}

/* ----------------------------------------------------------------------- ball */

export class Ball {
  constructor(radius) {
    this.radius = radius;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.spin = 0;
    this.live = false;
  }

  place(x, y, vx = 0, vy = 0) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  get speed() {
    return len(this.vx, this.vy);
  }
}

/* ---------------------------------------------------------------------- world */

export class World {
  constructor(opts = {}) {
    this.colliders = [];
    this.flippers = [];
    this.gravity = opts.gravity ?? 26;
    this.damping = opts.damping ?? 0.16;
    this.maxSpeed = opts.maxSpeed ?? 62;
    // Steady table acceleration (kept for callers that set it directly)
    this.nudgeX = 0;
    this.nudgeY = 0;
    // A nudge: the cabinet is shoved and springs back, so the ball feels a
    // short, decaying acceleration in simulation time (not wall-clock time)
    this.sway = { x: 0, y: 0, t: 0, dur: 0 };
    this.time = 0;
    // Injectable for deterministic tests
    this.random = opts.random || Math.random;
  }

  add(collider) {
    if (Array.isArray(collider)) this.colliders.push(...collider);
    else this.colliders.push(collider);
    return collider;
  }

  addFlipper(f) {
    this.flippers.push(f);
    return f;
  }

  /**
   * Shoves the cabinet: every live ball gets an instant velocity change
   * (the table moves under it) plus a short acceleration as the legs spring
   * back. Units are playfield units per second.
   */
  nudge(balls, vx, vy, dur = 0.09) {
    const list = Array.isArray(balls) ? balls : [balls];
    for (const b of list) {
      if (!b.live) continue;
      b.vx += vx;
      b.vy += vy;
    }
    // The spring-back pushes the same way for a few hundredths of a second
    this.sway = { x: vx * 9, y: vy * 9, t: 0, dur };
  }

  /**
   * Advances the simulation for one or more balls (multiball). Splits dt into
   * substeps sized so that nothing moves more than a fraction of the ball's
   * radius RELATIVE to anything it could hit per step. That includes the
   * flipper tips: a flip swings the tip at ~140 u/s, and sized from the ball
   * alone a resting ball near the tip used to be jumped clean over and
   * drained.
   */
  step(balls, dt) {
    const list = Array.isArray(balls) ? balls : [balls];
    let top = 1;
    let radius = 0.6;
    for (const b of list) {
      if (b.live && b.speed > top) top = b.speed;
      ({ radius } = b);
    }
    let sweep = 0;
    for (const f of this.flippers) sweep = Math.max(sweep, f.sweepSpeed());
    const steps = clamp(Math.ceil(((top + sweep) * dt) / (radius * 0.35)), 1, 32);
    const sdt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.time += sdt;
      for (let k = 0; k < this.flippers.length; k++) this.flippers[k].update(sdt);
      for (const b of list) {
        if (b.live) this.integrate(b, sdt);
      }
      if (list.length > 1) this.collideBalls(list);
    }
    if (this.sway.dur > 0) {
      this.sway.t += dt;
      if (this.sway.t >= this.sway.dur) this.sway.dur = 0;
    }
  }

  /**
   * Elastic equal-mass collision between live balls — what makes multiball
   * feel like metal instead of ghosts passing through each other.
   */
  collideBalls(list) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.live) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.live) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = len(dx, dy);
        const minDist = a.radius + b.radius;
        if (dist >= minDist) continue;

        if (dist < 1e-6) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const nx = dx / dist;
        const ny = dy / dist;

        // Separate evenly
        const push = (minDist - dist) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;

        // Exchange the normal components (equal mass), slightly inelastic
        const van = a.vx * nx + a.vy * ny;
        const vbn = b.vx * nx + b.vy * ny;
        if (van - vbn > 0) {
          const e = 0.92;
          const impulse = ((van - vbn) * (1 + e)) / 2;
          a.vx -= nx * impulse;
          a.vy -= ny * impulse;
          b.vx += nx * impulse;
          b.vy += ny * impulse;
        }
      }
    }
  }

  integrate(ball, dt) {
    // Gravity down the inclined playfield, plus any nudge impulse
    ball.vy -= this.gravity * dt;
    ball.vx += this.nudgeX * dt;
    ball.vy += this.nudgeY * dt;
    if (this.sway.dur > 0) {
      const k = 1 - this.sway.t / this.sway.dur;
      ball.vx += this.sway.x * k * dt;
      ball.vy += this.sway.y * k * dt;
    }

    // Mild rolling resistance
    const d = Math.max(0, 1 - this.damping * dt);
    ball.vx *= d;
    ball.vy *= d;

    const sp = ball.speed;
    if (sp > this.maxSpeed) {
      ball.vx = (ball.vx / sp) * this.maxSpeed;
      ball.vy = (ball.vy / sp) * this.maxSpeed;
    }

    // A nearly stopped ball gets a breath of noise. A real ball can never
    // balance on the very top of a post, a rail end or a raised flipper tip;
    // a simulated one, perfectly still on a perfectly round cap, can — and
    // then sits there forever. In a pocket (a cradle, the shooter lane) the
    // noise just settles back out.
    if (ball.vx * ball.vx + ball.vy * ball.vy < 0.04) {
      const a = this.random() * Math.PI * 2;
      ball.vx += Math.cos(a) * 0.35;
      ball.vy += Math.sin(a) * 0.35;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Static geometry, then flippers (so a flipper always wins a fight
    // between it and the wall behind it)
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (c.enabled) this.resolve(ball, c);
    }
    for (let i = 0; i < this.flippers.length; i++) {
      this.flippers[i].collide(ball);
    }

    // Collisions add energy (bumper kicks, flipper impulses), so clamp again —
    // otherwise a hard flipper hit can outrun the substep budget and tunnel.
    const post = ball.speed;
    if (post > this.maxSpeed) {
      ball.vx = (ball.vx / post) * this.maxSpeed;
      ball.vy = (ball.vy / post) * this.maxSpeed;
    }
  }

  resolve(ball, c) {
    if (c.filter && !c.filter(ball)) return false;

    let qx;
    let qy;

    if (c.kind === 'segment') {
      const p = closestOnSegment(ball.x, ball.y, c.ax, c.ay, c.bx, c.by);
      qx = p[0];
      qy = p[1];
    } else {
      qx = c.cx;
      qy = c.cy;
    }

    let dx = ball.x - qx;
    let dy = ball.y - qy;
    let dist = len(dx, dy);
    const minDist = ball.radius + c.radius;
    if (dist >= minDist) return false;

    // Sensors only observe — no bounce, no depenetration
    if (c.sensor) {
      if (c.onHit) c.onHit(ball.speed, ball);
      return false;
    }

    if (dist < 1e-6) {
      dx = 0;
      dy = 1;
      dist = 1;
    }

    const nx = dx / dist;
    const ny = dy / dist;

    ball.x += nx * (minDist - dist);
    ball.y += ny * (minDist - dist);

    const vn = ball.vx * nx + ball.vy * ny;
    // Active kickers fire on contact — even a ball merely leaning on a pop
    // bumper's skirt trips its switch — then need a moment to recharge
    const fire = c.active && c.kick > 0 && -vn > (c.kickMin ?? 0) - 1e-9 &&
      this.time - c.firedAt >= c.cooldown;
    if (vn < 0 || fire) {
      const j = vn < 0 ? -(1 + c.restitution) * vn : 0;
      ball.vx += nx * j;
      ball.vy += ny * j;

      // Coulomb friction, bounded by the normal impulse: a glancing hit
      // scrubs a little speed, a ball rolling along a rail keeps its pace
      const tx = -ny;
      const ty = nx;
      const vt = ball.vx * tx + ball.vy * ty;
      const mu = -vn > 2 ? c.friction * 2.5 * j : 0;
      const dvt = clamp(vt, -mu, mu);
      ball.vx -= tx * dvt;
      ball.vy -= ty * dvt;

      let out = Math.abs(vn);
      if (fire) {
        // A coil throws the ball at a near-constant speed whatever brought
        // it in, along the normal turned by a few degrees of randomness:
        // real rings and sling arms never throw the same way twice
        c.firedAt = this.time;
        const a = (this.random() - 0.5) * 2 * c.jitter;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const kx = nx * ca - ny * sa;
        const ky = nx * sa + ny * ca;
        const now = ball.vx * kx + ball.vy * ky;
        const want = c.kick * (0.94 + this.random() * 0.12) + Math.max(0, -vn) * 0.3;
        if (now < want) {
          ball.vx += kx * (want - now);
          ball.vy += ky * (want - now);
        }
        out = Math.max(out, 1.5);
      } else if (!c.active && c.kick && -vn > (c.kickMin ?? 0)) {
        // Passive "lively rubber": a fixed extra push on a real impact
        ball.vx += nx * c.kick;
        ball.vy += ny * c.kick;
      }
      if (c.onHit) c.onHit(out, ball, fire);
    }
    return true;
  }
}
