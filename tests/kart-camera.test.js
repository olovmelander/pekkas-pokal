import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createRoute } from '../src/games/kart/route.js';
import { createKartCamera } from '../src/games/kart/camera.js';
import { clamp, cornerSpeed, WALL_LANE } from '../src/games/kart/physics.js';

describe('Varggropen chase camera', () => {
  for (const [width, height] of [[390, 844], [844, 390], [1100, 773]]) {
    it(`keeps the whole kart visible through all hairpins at ${width}×${height}`, () => {
      const route = createRoute();
      for (const lane of [-WALL_LANE, -2.4, 0, 2.4, WALL_LANE]) {
        const camera = new PerspectiveCamera(55, width / height, 0.1, 550);
        const chase = createKartCamera(camera, route);
        const driver = { distance: -30, lane, speed: 0 };
        let time = 0, largestX = 0, lowestY = 1, highestY = -1;
        while (driver.distance < route.length) {
          const dt = 1 / 30, curve = route.curvature(driver.distance);
          driver.speed = cornerSpeed(curve);
          driver.distance += driver.speed * dt / clamp(1 - curve * lane, 0.62, 1.4); time += dt;
          chase.update(driver, 'racing', dt, time); camera.updateMatrixWorld();
          const road = route.sample(driver.distance, lane);
          for (const side of [-1.1, 1.1]) for (const forward of [-1.4, 1.4]) {
            const point = new Vector3().copy(road.position).addScaledVector(road.right, side).addScaledVector(road.tangent, forward);
            point.y += 0.8; point.project(camera);
            largestX = Math.max(largestX, Math.abs(point.x)); lowestY = Math.min(lowestY, point.y); highestY = Math.max(highestY, point.y);
          }
        }
        expect(largestX).toBeLessThan(0.92);
        expect(lowestY).toBeGreaterThan(-0.65);
        expect(highestY).toBeLessThan(0.6);
      }
    });
  }
});
