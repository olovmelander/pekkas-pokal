import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { createRoute } from '../src/games/kart/route.js';
import { createKartCamera, chaseRig } from '../src/games/kart/camera.js';
import { kartRpm } from '../src/games/kart/audio.js';
import { createEffects } from '../src/games/kart/effects.js';
import { clockText, deltaText } from '../src/games/kart/hud.js';

describe('Gokart feel: chase camera', () => {
  it('sits low and close at speed, a little higher and further back in portrait', () => {
    const wide = chaseRig(1.6, 18);
    expect(wide.distance).toBeGreaterThanOrEqual(4);
    expect(wide.distance).toBeLessThanOrEqual(4.5);
    expect(wide.height).toBeGreaterThanOrEqual(1.6);
    expect(wide.height).toBeLessThanOrEqual(1.9);
    const tall = chaseRig(390 / 844, 18);
    expect(tall.distance).toBeGreaterThan(wide.distance);
    expect(tall.height).toBeGreaterThan(wide.height);
  });

  it('widens the view with speed by about 12 degrees, but not under reduced motion', () => {
    expect(chaseRig(1.6, 18.5).fov - chaseRig(1.6, 0).fov).toBeCloseTo(12, 0);
    expect(chaseRig(1.6, 18.5, true).fov).toBe(chaseRig(1.6, 0, true).fov);
  });

  function frames(reducedMotion, surface, impulse = 0, view = 'chase') {
    const route = createRoute();
    const camera = new PerspectiveCamera(55, 1.6, 0.1, 550);
    const chase = createKartCamera(camera, route, { reducedMotion, view });
    const driver = { distance: 20, lane: 0, speed: 16, heading: 0, surface };
    const out = [];
    for (let i = 0; i < 40; i++) {
      driver.distance += driver.speed / 60;
      chase.update(driver, 'racing', 1 / 60, i / 60, i === 20 ? impulse : 0);
      out.push(camera.position.clone());
    }
    return { out, camera, route, driver };
  }

  it('shakes on kerbs and barrier jolts, and never under reduced motion', () => {
    const calm = frames(false, 'asphalt').out, kerb = frames(false, 'kerb').out, jolt = frames(false, 'asphalt', 1).out;
    const difference = (a, b) => Math.max(...a.map((p, i) => p.distanceTo(b[i])));
    expect(difference(calm, kerb)).toBeGreaterThan(0.004);
    expect(difference(calm, jolt)).toBeGreaterThan(0.02);
    const still = frames(true, 'asphalt').out;
    expect(difference(still, frames(true, 'kerb').out)).toBe(0);
    expect(difference(still, frames(true, 'asphalt', 1).out)).toBe(0);
  });

  it('keeps every number finite and the nose view just above the kart', () => {
    const { camera, route, driver } = frames(false, 'grass', 0.5, 'nose');
    const kart = route.sample(driver.distance, driver.lane).position;
    expect(Number.isFinite(camera.fov)).toBe(true);
    expect(camera.position.distanceTo(kart)).toBeLessThan(1.6);
    expect(camera.position.y - kart.y).toBeGreaterThan(0.4);
  });
});

describe('Gokart feel: engine', () => {
  it('slips the centrifugal clutch from a standstill, then follows road speed', () => {
    let rpm = 1450;
    for (let i = 0; i < 60; i++) rpm = kartRpm(rpm, 0, true, 1 / 60);
    expect(rpm).toBeGreaterThan(2200);
    expect(rpm).toBeLessThan(2500);
    let fast = rpm;
    for (let i = 0; i < 120; i++) fast = kartRpm(fast, 18, true, 1 / 60);
    expect(fast).toBeGreaterThan(3600);
    let idle = fast;
    for (let i = 0; i < 240; i++) idle = kartRpm(idle, 0, false, 1 / 60);
    expect(idle).toBeLessThan(1600);
    expect(Number.isFinite(kartRpm(NaN, NaN, true, NaN))).toBe(true);
  });
});

describe('Gokart feel: particles and readouts', () => {
  it('bursts sparks and smoke that burn out, without growing past the pool', () => {
    const route = createRoute();
    const scene = new Scene();
    const effects = createEffects(scene, route, { coarse: true });
    const camera = new PerspectiveCamera();
    effects.burst('sparks', route.sample(10, 4).position);
    effects.burst('smoke', route.sample(10, 0).position, { count: 999 });
    expect(effects.counts.hot).toBeGreaterThan(10);
    expect(effects.counts.soft).toBeLessThanOrEqual(240);
    const sliding = { distance: 30, lane: 0, speed: 14, heading: 0.3, slip: 0.8, surface: 'asphalt', hit: 0 };
    for (let i = 0; i < 30; i++) { sliding.distance += 0.2; effects.update(1 / 60, [sliding], camera); }
    expect(effects.counts.soft).toBeGreaterThan(5);
    for (let i = 0; i < 200; i++) effects.update(1 / 30, [], camera);
    expect(effects.counts).toEqual({ soft: 0, hot: 0 });
    effects.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('formats times and live deltas', () => {
    expect(clockText(59.99)).toBe('0:59.9');
    expect(deltaText(-0.423)).toBe('−0.42');
    expect(deltaText(0.3)).toBe('+0.30');
  });
});
