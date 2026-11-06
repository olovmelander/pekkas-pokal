import * as THREE from 'three';
import { describe, it, expect, vi } from 'vitest';
import { createThrowEvent } from '../src/games/farm/throw-events.js';
import { createWoodEvent } from '../src/games/farm/wood-events.js';

function fixture(factory, kind) {
  const group = new THREE.Group(), materials = new Map();
  const ctx = {
    THREE, group, tone: vi.fn(), toast: vi.fn(), hud: vi.fn(), finish: vi.fn(), track: vi.fn(), focus: vi.fn(),
    material(color) {
      if (!materials.has(color)) materials.set(color, new THREE.MeshBasicMaterial({ color }));
      return materials.get(color);
    },
    mesh(geometry, color, x = 0, y = 0, z = 0, parent = group) {
      const m = new THREE.Mesh(geometry, ctx.material(color)); m.position.set(x, y, z); parent.add(m); return m;
    },
    box(w, h, d, color, x, y, z, parent) { return ctx.mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent); },
    cylinder(r, h, color, x, y, z, parent, rt = r) { return ctx.mesh(new THREE.CylinderGeometry(rt, r, h, 8), color, x, y, z, parent); }
  };
  const event = factory(kind, ctx);
  let elapsed = 0;
  return {
    ctx, event, group,
    step(dt = 1 / 60, input = { direction: 0, vertical: 0 }) { elapsed += dt; event.step(dt, elapsed, input); },
    destroy() {
      event.dispose?.(); group.traverse((node) => node.geometry?.dispose()); materials.forEach((material) => material.dispose());
    }
  };
}

describe('the actual farm event state machines', () => {
  it.each(['boot', 'horseshoe'])('does not bank cancelled %s charge into a fresh tap', (kind) => {
    const fresh = fixture(createThrowEvent, kind), cancelled = fixture(createThrowEvent, kind);
    cancelled.event.down();
    for (let i = 0; i < 84; i++) cancelled.step();
    cancelled.event.cancel();
    fresh.event.down(); fresh.event.up(); cancelled.event.down(); cancelled.event.up();
    for (let i = 0; i < 180; i++) { fresh.step(); cancelled.step(); }
    expect(cancelled.ctx.toast.mock.calls[0]).toEqual(fresh.ctx.toast.mock.calls[0]);
    fresh.destroy(); cancelled.destroy();
  });
  it('ends a wood event once, even when more input and frames arrive afterwards', () => {
    for (const kind of ['stack', 'hammer']) {
      const game = fixture(createWoodEvent, kind);
      for (let i = 0; i < 700; i++) { game.step(0.05); game.event.down(); }
      expect(game.ctx.finish).toHaveBeenCalledTimes(1);
      expect(game.ctx.finish.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
      expect(game.ctx.finish.mock.calls[0][0]).toBeLessThanOrEqual(1000);
      game.destroy();
    }
  });
  it.each([20, 60, 120])('allows a perfect hammer score at %i frames per second', (fps) => {
    const game = fixture(createWoodEvent, 'hammer');
    for (let i = 0; i < fps * 30 && !game.ctx.finish.mock.calls.length; i++) {
      game.step(1 / fps);
      const phase = game.ctx.hud.mock.lastCall[2];
      if (Math.abs(phase - 0.5) < 0.06) game.event.down();
    }
    expect(game.ctx.finish).toHaveBeenCalledTimes(1);
    expect(game.ctx.finish.mock.calls[0][0]).toBe(1000);
    expect(game.ctx.finish.mock.calls[0][1]).toContain('15 slag · 15 fullträffar');
    game.destroy();
  });
});
