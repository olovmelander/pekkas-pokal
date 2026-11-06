import { describe, expect, it } from 'vitest';
import { surfaceAt, racingLine, trackLayout, GRID_SLOTS, KERB_INNER, KERB_OUTER } from '../src/games/kart/surfaces.js';
import { createRoute, ROAD_HALF_WIDTH } from '../src/games/kart/route.js';

describe('Varggropen surfaces and kerbs', () => {
  const layout = trackLayout();
  it('finds the six sourced corners and kerbs them at apex and exit', () => {
    expect(layout.corners.length).toBeGreaterThanOrEqual(5);
    for (const corner of layout.corners) {
      const apex = layout.kerbs.find(k => k.kind === 'apex' && k.side === corner.sign && k.start < corner.apex + 1 && k.end > corner.apex - 1);
      const exit = layout.kerbs.find(k => k.kind === 'exit' && k.side === -corner.sign && k.end > corner.end);
      expect(apex).toBeTruthy();
      expect(exit).toBeTruthy();
    }
  });
  it('builds kerbs from whole pieces of about a metre', () => {
    for (const kerb of layout.kerbs) {
      const piece = (kerb.end - kerb.start) / kerb.pieces;
      expect(piece).toBeGreaterThan(0.85);
      expect(piece).toBeLessThan(1.15);
      expect(kerb.start).toBeGreaterThanOrEqual(0);
      expect(kerb.start).toBeLessThan(layout.length);
    }
  });
  it('answers asphalt, kerb or grass purely from distance and lane', () => {
    const { length } = createRoute();
    const counts = { asphalt: 0, kerb: 0, grass: 0 };
    for (let d = -20; d < length + 20; d += 0.5) for (const lane of [-6, -3.9, -3.4, 0, 2, 3.4, 3.9, 6]) {
      const surface = surfaceAt(d, lane);
      counts[surface]++;
      if (Math.abs(lane) < KERB_INNER) expect(surface).toBe('asphalt');
      if (Math.abs(lane) > KERB_OUTER) expect(surface).toBe('grass');
      if (Math.abs(lane) > ROAD_HALF_WIDTH && surface !== 'grass') expect(surface).toBe('kerb');
      expect(surfaceAt(d, lane)).toBe(surface);
      expect(surfaceAt(d + length, lane)).toBe(surface);
    }
    expect(counts.kerb).toBeGreaterThan(200);
    const apex = layout.corners[0];
    expect(surfaceAt(apex.apex, apex.sign * 3.8)).toBe('kerb');
    expect(surfaceAt(Number.NaN, 1)).toBe('asphalt');
  });
  it('lays a finite racing line inside the road, wide on entry and tight at the apex', () => {
    for (let d = 0; d < layout.length; d += 1) {
      const lane = racingLine(d);
      expect(Number.isFinite(lane)).toBe(true);
      expect(Math.abs(lane)).toBeLessThan(ROAD_HALF_WIDTH - 0.8);
    }
    for (const corner of layout.corners) {
      expect(Math.sign(racingLine(corner.apex))).toBe(corner.sign);
      expect(Math.sign(racingLine(corner.start - 10))).toBe(-corner.sign);
    }
  });
  it('places six staggered grid boxes behind the line', () => {
    expect(GRID_SLOTS).toHaveLength(6);
    GRID_SLOTS.forEach((slot, i) => {
      expect(slot.distance + 1.3).toBeLessThan(0);
      if (i) expect(slot.distance).toBeLessThan(GRID_SLOTS[i - 1].distance);
      expect(Math.abs(slot.lane)).toBeLessThan(ROAD_HALF_WIDTH - 0.9);
    });
  });
});
