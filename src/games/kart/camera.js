import * as THREE from 'three';

/** Pekkas Gokart cameras. The chase view sits low and close, follows the
 * direction the kart is actually travelling (so a slide angle shows), widens
 * with speed, lags under acceleration and braking and leans into corners. A
 * low nose view sits just above the front fairing. Shake (speed buzz, kerb and
 * grass rumble, barrier jolts) and the speed-driven roll and FOV are left out
 * under reduced motion.
 */
export const CAMERA_VIEWS = ['chase', 'nose'];
const TOP_SPEED = 18.5;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const ease = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, finite(dt)));
/** Smooth, deterministic pseudo-noise in -1..1 from three incommensurate sines. */
const wobble = (t, seed) => (Math.sin(t * 1.93 + seed) * 0.5 + Math.sin(t * 3.17 + seed * 2.3) * 0.32 + Math.sin(t * 5.71 + seed * 4.1) * 0.18);
const verticalFov = (horizontal, aspect) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(horizontal) / 2) / Math.max(0.1, aspect)));

/** Chase framing for a screen shape and speed. Narrow portrait screens sit a
 * little higher and further back and keep at least a 40° horizontal view, so
 * the whole kart stays in frame. Exported for the tests. */
export function chaseRig(aspect, speed = 0, reducedMotion = false) {
  const portrait = clamp((1.3 - aspect) / (1.3 - 0.46), 0, 1);
  const fast = clamp(finite(speed) / TOP_SPEED, 0, 1);
  const base = Math.max(58, verticalFov(40, aspect));
  const boost = reducedMotion ? 0 : 12 * fast * fast * (1 - portrait * 0.35);
  return {
    distance: lerp(4.85, 4.25, fast) + portrait * 1.35,
    height: lerp(2.0, 1.72, fast) + portrait * 0.6,
    ahead: lerp(5.5, 7.5, fast) - portrait * 1.2,
    fov: Math.min(92, base + boost),
    // How quickly the view swings round to the travel direction, and how far it peeks into a bend.
    follow: lerp(5.5, 10, portrait),
    peek: 1 - portrait
  };
}

export function createKartCamera(camera, track, { reducedMotion = false, view = 'chase' } = {}) {
  const kart = new THREE.Vector3(), previousKart = new THREE.Vector3();
  const position = new THREE.Vector3(), target = new THREE.Vector3();
  const direction = new THREE.Vector3(), side = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ'), quaternion = new THREE.Quaternion(), offset = new THREE.Vector3();
  const terrain = typeof track.terrainHeight === 'function' ? track.terrainHeight : null;
  let initialized = false, yaw = 0, yawRate = 0, accel = 0, previousSpeed = 0, fov = 58, roll = 0, trauma = 0, rumble = 0, lastHit = 0;
  let mode = CAMERA_VIEWS.includes(view) ? view : 'chase';

  function surfaceOf(driver) {
    if (driver.surface) return driver.surface;
    if (typeof track.surfaceAt === 'function') return track.surfaceAt(driver.distance, driver.lane);
    const lane = Math.abs(finite(driver.lane));
    return lane > 3.5 ? 'grass' : lane > 3.0 ? 'kerb' : 'asphalt';
  }

  function applyShake(time, speed, surface, dt) {
    if (reducedMotion) return;
    const fast = clamp(speed / TOP_SPEED, 0, 1);
    const wish = surface === 'kerb' ? 1 : surface === 'grass' ? 0.75 : 0;
    rumble += (wish * clamp(speed / 7, 0, 1) - rumble) * ease(14, dt);
    const jolt = trauma * trauma;
    const buzz = fast * fast * 0.0045;
    const kerbHz = surface === 'grass' ? 13 : 29;
    const shakeX = buzz * wobble(time * 23, 1.1) + rumble * 0.011 * Math.sin(time * kerbHz * 6.283) + jolt * 0.16 * wobble(time * 19, 4.2);
    const shakeY = buzz * wobble(time * 27, 2.7) + rumble * 0.02 * Math.sin(time * kerbHz * 6.283 + 1.3) * (surface === 'grass' ? wobble(time * 7, 9) + 0.6 : 1) + jolt * 0.12 * wobble(time * 17, 7.7);
    camera.translateX(shakeX);
    camera.translateY(shakeY);
    camera.rotateZ(jolt * 0.05 * wobble(time * 15, 3.3) + rumble * 0.004 * Math.sin(time * kerbHz * 4.1));
    camera.rotateX(jolt * 0.025 * wobble(time * 13, 5.9) + buzz * 0.25 * wobble(time * 31, 6.6));
  }

  let fovReady = false;
  function setFov(next, dt) {
    fov = fovReady ? fov + (next - fov) * ease(3.2, dt) : next;
    fovReady = true;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  return {
    reset() { initialized = false; fovReady = false; trauma = 0; rumble = 0; roll = 0; accel = 0; yawRate = 0; },
    get view() { return mode; },
    setView(next) { if (CAMERA_VIEWS.includes(next)) { mode = next; initialized = false; } return mode; },
    toggleView() { return this.setView(CAMERA_VIEWS[(CAMERA_VIEWS.indexOf(mode) + 1) % CAMERA_VIEWS.length]); },
    /** A jolt in 0..1 (barrier 0.8–1, kart contact 0.3–0.5). */
    shake(amount) { trauma = clamp(trauma + finite(amount), 0, 1); },
    update(driver, state, dt, time, shakeImpulse = 0) {
      const step = clamp(finite(dt), 0, 0.1);
      const speed = Math.max(0, finite(driver.speed));
      const heading = finite(driver.heading);
      const road = track.sample(finite(driver.distance), finite(driver.lane));
      kart.copy(road.position);
      const kartYaw = road.angle + heading;
      if (finite(shakeImpulse) > 0) trauma = clamp(trauma + shakeImpulse, 0, 1);
      else if (finite(driver.hit) > lastHit + 0.3) trauma = clamp(trauma + 0.45, 0, 1);
      lastHit = finite(driver.hit);
      trauma = Math.max(0, trauma - step * 1.7);

      if (state === 'menu' || state === 'result') {
        // A slow orbit: wide over the field in the menu, close round the kart after the flag.
        const close = state === 'result';
        const angle = reducedMotion ? 0.9 : time * (close ? 0.18 : 0.06);
        const reach = close ? 6.5 : 13;
        position.set(kart.x + Math.sin(kartYaw + Math.PI + angle) * reach, kart.y + (close ? 2.3 : 7), kart.z + Math.cos(kartYaw + Math.PI + angle) * reach);
        target.copy(kart); target.y += close ? 0.7 : 0.6;
        if (!initialized) { camera.position.copy(position); initialized = true; yaw = kartYaw; previousKart.copy(kart); }
        camera.position.lerp(position, ease(close ? 1.6 : 2.5, step));
        camera.up.set(0, 1, 0); camera.lookAt(target);
        setFov(close ? 50 : 55, step);
        return road.position;
      }

      // Travel direction from the kart's own movement; fall back to the kart's heading when slow.
      let wishYaw = kartYaw;
      const moved = Math.hypot(kart.x - previousKart.x, kart.z - previousKart.z);
      if (!initialized || moved > 6) {
        previousKart.copy(kart); yaw = kartYaw; yawRate = 0; previousSpeed = speed; accel = 0;
      } else if (moved > 0.004 && speed > 1.2) {
        const travel = Math.atan2(kart.x - previousKart.x, kart.z - previousKart.z);
        wishYaw = kartYaw + wrapAngle(travel - kartYaw) * clamp((speed - 1.2) / 3, 0, 1);
      }
      previousKart.copy(kart);
      const rig = chaseRig(camera.aspect, speed, reducedMotion);
      const before = yaw;
      yaw += wrapAngle(wishYaw - yaw) * ease(mode === 'nose' ? 30 : rig.follow, step);
      yawRate += ((step ? wrapAngle(yaw - before) / step : 0) - yawRate) * ease(6, step);
      const measured = Number.isFinite(driver.longAccel) ? driver.longAccel : step ? (speed - previousSpeed) / step : 0;
      accel += (measured - accel) * ease(5, step);
      accel = clamp(accel, -14, 9);
      previousSpeed = speed;
      const fast = clamp(speed / TOP_SPEED, 0, 1);

      if (mode === 'nose') {
        euler.set(finite(road.pitch), kartYaw, finite(road.roll) * 0.8);
        quaternion.setFromEuler(euler);
        offset.set(0, 0.74, 1.02).applyQuaternion(quaternion);
        position.copy(kart).add(offset);
        offset.set(0, 0.36 - accel * 0.006, 22).applyQuaternion(quaternion);
        target.copy(kart).add(offset);
        camera.position.copy(position);
        camera.up.set(0, 1, 0).applyQuaternion(quaternion);
        camera.lookAt(target);
        initialized = true;
        setFov(Math.min(92, Math.max(70, verticalFov(52, camera.aspect)) + (reducedMotion ? 0 : 9 * fast)), step);
        applyShake(time, speed, surfaceOf(driver), step);
        return road.position;
      }

      direction.set(Math.sin(yaw), 0, Math.cos(yaw));
      side.set(direction.z, 0, -direction.x);
      // Accelerating pushes the camera back and down a touch; braking lets it surge in and dip.
      const surge = clamp(accel * 0.032, -0.38, 0.26);
      position.copy(kart).addScaledVector(direction, -(rig.distance + surge));
      position.y = kart.y + rig.height - surge * 0.25;
      if (terrain) position.y = Math.max(position.y, terrain(position.x, position.z) + 0.75);
      // Peek a little into the coming bend, but never enough to lose the kart.
      const bend = finite(track.curvature?.(finite(driver.distance) + rig.ahead + 4));
      target.copy(kart).addScaledVector(direction, rig.ahead).addScaledVector(side, clamp(bend * 9, -0.9, 0.9) * rig.peek);
      target.y = kart.y + 0.55 + clamp(accel * 0.022, -0.3, 0.16);
      if (!initialized) { camera.position.copy(position); initialized = true; }
      // Rigid along the travel direction keeps the kart centred; height eases over crests.
      camera.position.x = position.x; camera.position.z = position.z;
      camera.position.y += (position.y - camera.position.y) * ease(9, step);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      const wishRoll = reducedMotion ? 0 : clamp(yawRate * speed * 0.0042, -0.045, 0.045);
      roll += (wishRoll - roll) * ease(4, step);
      camera.rotateZ(roll);
      setFov(rig.fov, step);
      applyShake(time, speed, surfaceOf(driver), step);
      return road.position;
    }
  };
}
