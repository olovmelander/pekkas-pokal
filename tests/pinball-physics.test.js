import { describe, expect, it } from 'vitest';
import { World, Ball } from '../src/games/pinball/physics.js';
import { L, buildColliders } from '../src/games/pinball/table.js';

describe('Pinball launch trajectory regressions', () => {
  it.each([0, 0.22, 0.45, 0.68, 1])('a %s charge clears the shooter lane and stays finite through a full natural drain', (power) => {
    const world = new World({ gravity: 36.5, damping: 0.1, maxSpeed: 80, random: () => 0.5 });
    buildColliders(world);
    const ball = new Ball(L.ballRadius);
    ball.live = true;
    ball.place(L.laneBallX, L.laneBottomY + L.laneWallR + L.ballRadius + 0.06, 0, 57 + power * 11);
    let reachedTop = false;
    let leftLane = false;
    for (let frame = 0; frame < 2400 && ball.y >= -1.2; frame++) {
      world.step([ball], 1 / 120);
      expect([ball.x, ball.y, ball.vx, ball.vy].every(Number.isFinite)).toBe(true);
      reachedTop ||= ball.y > L.domeY;
      leftLane ||= ball.x < L.laneX - 0.5;
    }
    expect(reachedTop).toBe(true);
    expect(leftLane).toBe(true);
    expect(ball.y).toBeLessThan(-1.2);
  });
});
