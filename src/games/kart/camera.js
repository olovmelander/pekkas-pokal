import * as THREE from 'three';

/** Chase framing keeps the kart visible while looking into the next corner. */
export function createKartCamera(camera, track, { reducedMotion = false } = {}) {
  const position = new THREE.Vector3(), target = new THREE.Vector3();
  const wishPosition = new THREE.Vector3(), wishTarget = new THREE.Vector3();
  let initialized = false;
  return {
    reset() { initialized = false; },
    update(driver, state, dt, time) {
      const portrait = camera.aspect < 0.85;
      const road = track.sample(driver.distance, driver.lane * (portrait ? 0.85 : 0.45));
      if (state === 'menu') {
        const angle = reducedMotion ? 0 : time * 0.06;
        wishPosition.copy(road.position).addScaledVector(road.tangent, -11).addScaledVector(road.right, -8 + Math.sin(angle) * 3);
        wishPosition.y += 7;
        wishTarget.copy(road.position); wishTarget.y += 0.6;
      } else {
        // The 665 m circuit has tight hairpins. A fixed 8 m gaze pulls a
        // portrait camera past the apex and can push even an on-road kart out.
        const bend = Math.max(Math.abs(track.curvature(driver.distance)), Math.abs(track.curvature(driver.distance + 5)));
        const ahead = portrait ? Math.max(3.5, 8 / (1 + bend * 25)) : Math.max(5, 11 / (1 + bend * 12));
        wishPosition.copy(road.position).addScaledVector(road.tangent, portrait ? -15.5 : -11.5);
        wishPosition.y += portrait ? 9.5 : 6.2;
        wishTarget.copy(track.sample(driver.distance + ahead, driver.lane * (portrait ? 0.75 : 0.3)).position);
        wishTarget.y += 0.45;
      }
      if (!initialized) { position.copy(wishPosition); target.copy(wishTarget); initialized = true; }
      const smoothing = 1 - Math.exp(-Math.max(0, dt) * (state === 'menu' ? 2.5 : 5));
      position.lerp(wishPosition, smoothing); target.lerp(wishTarget, smoothing);
      camera.position.copy(position); camera.lookAt(target);
      camera.fov = (portrait ? 55 : 58) + (reducedMotion ? 0 : driver.speed * 0.12);
      camera.updateProjectionMatrix();
      return road.position;
    }
  };
}
