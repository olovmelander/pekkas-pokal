import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { frameTriathlon } from '../src/games/triathlon/camera.js';

describe('triathlon framing', () => {
  for (const [width, height] of [[320, 844], [390, 844], [844, 390], [1100, 773]]) {
    it(`keeps arms, bicycle and feet visible at both course edges on ${width}×${height}`, () => {
      const camera = new PerspectiveCamera(52, width / height, 0.1, 270);
      for (const x of [-3.85, 3.85]) for (const discipline of ['swim', 'run', 'bike']) {
        frameTriathlon(camera, { x, started: true, discipline }); camera.updateMatrixWorld();
        for (const side of [-0.55, 0.55]) for (const forward of [-1, 1]) for (const y of [0, 1.8]) {
          const point = new Vector3(x + side, discipline === 'swim' ? 0.05 : y, forward).project(camera);
          expect(Math.abs(point.x)).toBeLessThan(0.95);
          expect(point.y).toBeGreaterThan(-0.75);
        }
      }
    });
  }
});
