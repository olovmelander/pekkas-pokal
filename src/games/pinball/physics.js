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
    // A sensor detects the ball passing through without touching it —
    // used for orbit shots, inlane rollovers and other scoring switches.
    sensor: opts.sensor ?? false,
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
    sensor: opts.sensor ?? false,
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
    this.angle = restAngle;
    this.omega = 0;
    this.pressed = false;
    this.radius = opts.radius ?? 0.42;
    this.restitution = opts.restitution ?? 0.36;
    // Up-swing is much faster than the return, like a real solenoid
    this.upSpeed = opts.upSpeed ?? 34;
    this.downSpeed = opts.downSpeed ?? 16;
    this.onHit = opts.onHit || null;
    this.enabled = true;
  }

  get tipX() {
    return this.px + Math.cos(this.angle) * this.length;
  }

  get tipY() {
    return this.py + Math.sin(this.angle) * this.length;
  }

  update(dt) {
    const target = this.pressed ? this.activeAngle : this.restAngle;
    const speed = this.pressed ? this.upSpeed : this.downSpeed;
    const prev = this.angle;
    const diff = target - this.angle;
    const step = speed * dt;

    if (Math.abs(diff) <= step) this.angle = target;
    else this.angle += Math.sign(diff) * step;

    this.omega = dt > 0 ? (this.angle - prev) / dt : 0;
  }

  /**
   * Resolves the ball against this flipper, including the impulse from the
   * moving surface.
   */
  collide(ball) {
    if (!this.enabled) return false;

    const bx = this.tipX;
    const by = this.tipY;
    const [qx, qy] = closestOnSegment(ball.x, ball.y, this.px, this.py, bx, by);

    let dx = ball.x - qx;
    let dy = ball.y - qy;
    let dist = len(dx, dy);
    const minDist = ball.radius + this.radius;
    if (dist >= minDist) return false;

    if (dist < 1e-6) {
      // Degenerate: push straight out from the flipper's axis
      dx = -Math.sin(this.angle);
      dy = Math.cos(this.angle);
      dist = 1;
    }

    const nx = dx / dist;
    const ny = dy / dist;

    // Depenetrate
    const pen = minDist - dist;
    ball.x += nx * pen;
    ball.y += ny * pen;

    // Velocity of the flipper surface at the contact point: ω × r
    const rx = qx - this.px;
    const ry = qy - this.py;
    const contactVx = -this.omega * ry;
    const contactVy = this.omega * rx;

    const relVx = ball.vx - contactVx;
    const relVy = ball.vy - contactVy;
    const vn = relVx * nx + relVy * ny;

    if (vn < 0) {
      const j = -(1 + this.restitution) * vn;
      ball.vx += nx * j;
      ball.vy += ny * j;

      // A little tangential drag so the ball doesn't slide frictionlessly
      const tx = -ny;
      const ty = nx;
      const vt = (ball.vx - contactVx) * tx + (ball.vy - contactVy) * ty;
      ball.vx -= tx * vt * 0.08;
      ball.vy -= ty * vt * 0.08;

      if (this.onHit) this.onHit(Math.abs(vn));
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
    this.nudgeX = 0;
    this.nudgeY = 0;
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
   * Advances the simulation for one or more balls (multiball). Splits dt into
   * substeps sized so the fastest ball can never move more than a fraction of
   * its radius per step — without this a hard shot passes straight through a
   * wall.
   */
  step(balls, dt) {
    const list = Array.isArray(balls) ? balls : [balls];
    let top = 1;
    let radius = 0.6;
    for (const b of list) {
      if (b.live && b.speed > top) top = b.speed;
      ({ radius } = b);
    }
    const steps = clamp(Math.ceil((top * dt) / (radius * 0.35)), 1, 24);
    const sdt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.flippers.forEach((f) => f.update(sdt));
      for (const b of list) {
        if (b.live) this.integrate(b, sdt);
      }
      if (list.length > 1) this.collideBalls(list);
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

    // Mild rolling resistance
    const d = Math.max(0, 1 - this.damping * dt);
    ball.vx *= d;
    ball.vy *= d;

    const sp = ball.speed;
    if (sp > this.maxSpeed) {
      ball.vx = (ball.vx / sp) * this.maxSpeed;
      ball.vy = (ball.vy / sp) * this.maxSpeed;
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
    if (vn < 0) {
      const j = -(1 + c.restitution) * vn;
      ball.vx += nx * j;
      ball.vy += ny * j;

      const tx = -ny;
      const ty = nx;
      const vt = ball.vx * tx + ball.vy * ty;
      ball.vx -= tx * vt * c.friction;
      ball.vy -= ty * vt * c.friction;

      if (c.kick) {
        ball.vx += nx * c.kick;
        ball.vy += ny * c.kick;
      }
      if (c.onHit) c.onHit(Math.abs(vn), ball);
    }
    return true;
  }
}
