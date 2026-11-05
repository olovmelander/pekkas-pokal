/**
 * The attract-mode showcase: before anyone presses Start on a wide screen,
 * the camera drifts slowly round the front of the machine so the cabinet,
 * the backbox and the side art are actually seen, and on Start it flies
 * into the play camera. It never holds anything up: the game starts the
 * moment Start is pressed and the camera simply arrives a second later.
 *
 * The orbit runs in the floor's frame (the room is pitched by the playfield
 * slope, see cabinet.js), so the floor stays level on screen and the
 * machine shows its real lean. Reduced motion gets one still hero angle and
 * cuts instead of flying.
 */

const FLY_IN = 1.25; // seconds, Start → play camera
const FLY_OUT = 2.2; // back out to the showcase after a game

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

export function createShowcase(THREE, { CAB, ROOM, reduceMotion }) {
  const U = new THREE.Vector3(0, Math.cos(ROOM.slope), -Math.sin(ROOM.slope));
  const F = new THREE.Vector3(0, Math.sin(ROOM.slope), Math.cos(ROOM.slope));
  const X = new THREE.Vector3(1, 0, 0);
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  // Aim a little above the middle of the machine, so the head gets room
  const pivot = new THREE.Vector3(CAB.cx, -10, -21);

  // What has to fit on screen: the body, the legs' feet and the head
  const pts = [];
  const xs = [CAB.cx - CAB.hw - 1, CAB.cx + CAB.hw + 1];
  const foot = (rd) => ({ y: ROOM.origin.y + rd * Math.sin(ROOM.slope), z: ROOM.origin.z + rd * Math.cos(ROOM.slope) });
  xs.forEach((x) => {
    [foot(1), foot(-CAB.bodyL - 1)].forEach((p) => pts.push(new THREE.Vector3(x, p.y, p.z)));
    pts.push(new THREE.Vector3(x, CAB.armourTop, CAB.frontZ + 0.6));
    pts.push(new THREE.Vector3(x, CAB.backH * 0.95, CAB.z1 - 8));
  });

  const probe = new THREE.PerspectiveCamera(36, 1, 1, 1000);
  const v = new THREE.Vector3();
  const look = new THREE.Vector3();
  const up = new THREE.Vector3();

  const s = {
    k: 0, // 0 = play camera, 1 = showcase
    goal: 0,
    t: 9, // orbit clock (starts near the front-left three-quarter)
    active: false,
    radii: [],
    fov: 36,
    play: null
  };

  const orbit = (t) => {
    if (reduceMotion) return { az: -0.62, el: 0.2, r: 1 };
    return {
      az: -0.22 + 0.82 * Math.sin((t / 42) * Math.PI * 2),
      el: 0.19 + 0.09 * Math.sin((t / 27) * Math.PI * 2 + 1),
      r: 1 + 0.05 * Math.sin((t / 19) * Math.PI * 2)
    };
  };
  const dirOf = (az, el, out) =>
    out
      .set(0, 0, 0)
      .addScaledVector(X, Math.cos(el) * Math.sin(az))
      .addScaledVector(F, Math.cos(el) * Math.cos(az))
      .addScaledVector(U, Math.sin(el));

  /** Distance at which the machine fits the rectangle, seen from (az, el) */
  function fitAt(az, el, W, H, rect, offX, offY) {
    let d = 120;
    dirOf(az, el, v);
    for (let i = 0; i < 10; i++) {
      probe.position.copy(pivot).addScaledVector(v, d);
      probe.up.copy(U);
      probe.lookAt(pivot);
      probe.updateMatrixWorld();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      pts.forEach((p) => {
        look.copy(p).project(probe);
        const x = ((look.x + 1) / 2) * W;
        const y = ((1 - look.y) / 2) * H;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      });
      // Fit the larger of the two overshoots, about the rectangle's centre
      // (the probe has no view offset: the play camera's shift comes after)
      const cx = rect.x + rect.w / 2 - offX;
      const cy = rect.y + rect.h / 2 - offY;
      const sx = Math.max(cx - x0, x1 - cx) / (rect.w / 2);
      const sy = Math.max(cy - y0, y1 - cy) / (rect.h / 2);
      const k = Math.max(sx, sy);
      if (Math.abs(k - 1) < 0.01) break;
      d = Math.min(400, Math.max(40, d * k));
    }
    return d;
  }

  return {
    get k() {
      return s.k;
    },
    get active() {
      return s.active;
    },
    /**
     * Called from fitCamera: `play` is the play camera's framing, `rect`
     * the part of the screen the machine may use while showcased.
     */
    fit(W, H, rect, play) {
      s.play = play;
      s.fov = W / H > 1.6 ? 34 : 40;
      probe.fov = s.fov;
      probe.aspect = W / H;
      probe.clearViewOffset();
      probe.updateProjectionMatrix();
      s.radii = [];
      for (let i = 0; i <= 16; i++) {
        const az = -1.1 + (i / 16) * 1.9;
        s.radii.push(Math.max(fitAt(az, 0.1, W, H, rect, play.offX, play.offY), fitAt(az, 0.3, W, H, rect, play.offX, play.offY)));
      }
    },
    /** Jump straight to a state without flying (reduced motion, peek) */
    cut(goal) {
      s.goal = goal;
      s.k = goal;
      if (!goal) s.active = false; // the caller owns the camera from here
    },
    /**
     * Each frame, after the play camera has been placed: blends it toward
     * the showcase by k. Returns true while it owns the camera.
     */
    apply(camera, fog, playLook, dt, want) {
      const { play } = s;
      if (!play) return false;
      s.goal = want ? 1 : 0;
      if (reduceMotion) s.k = s.goal;
      else if (s.k < s.goal) s.k = Math.min(1, s.k + dt / FLY_OUT);
      else if (s.k > s.goal) s.k = Math.max(0, s.k - dt / FLY_IN);
      if (s.k <= 0) {
        if (s.active) {
          // Hand the camera back exactly as the play framing left it
          s.active = false;
          camera.up.copy(WORLD_UP);
          camera.fov = play.fov;
          camera.near = play.near;
          camera.far = play.far;
          camera.setViewOffset(play.W, play.H, -play.offX, -play.offY, play.W, play.H);
          camera.updateProjectionMatrix();
          fog.near = play.fogNear;
          fog.far = play.fogFar;
          camera.lookAt(playLook);
        }
        return false;
      }
      s.active = true;
      if (want) s.t = (s.t + dt) % 2520;
      const e = ease(s.k);
      const o = orbit(s.t);
      const ai = Math.min(15.999, Math.max(0, ((o.az + 1.1) / 1.9) * 16));
      const i0 = Math.floor(ai);
      const rS = lerp(s.radii[i0], s.radii[i0 + 1], ai - i0) * o.r;

      // The play camera in the same spherical terms, about the same pivot
      v.copy(camera.position).sub(pivot);
      const rP = Math.max(1, v.length());
      const azP = Math.atan2(v.dot(X), v.dot(F));
      const elP = Math.asin(Math.min(1, Math.max(-1, v.dot(U) / rP)));

      const az = lerp(azP, o.az, e);
      const el = lerp(elP, o.el, e);
      const r = lerp(rP, rS, e);
      camera.position.copy(pivot).addScaledVector(dirOf(az, el, v), r);
      look.copy(playLook).lerp(pivot, e);
      up.copy(WORLD_UP).lerp(U, e).normalize();
      camera.up.copy(up);
      camera.lookAt(look);
      camera.fov = lerp(play.fov, s.fov, e);
      camera.near = lerp(play.near, Math.min(40, rS * 0.3), e);
      camera.far = Math.max(play.far, rS + 240);
      camera.setViewOffset(play.W, play.H, -play.offX, -play.offY, play.W, play.H);
      camera.updateProjectionMatrix();
      fog.near = lerp(play.fogNear, rS * 1.05, e);
      fog.far = lerp(play.fogFar, rS * 2.6, e);
      return true;
    }
  };
}
