import { describe, expect, it } from 'vitest';
import { Box3, PerspectiveCamera, Scene, Vector3 } from 'three';
import { createAthlete } from '../src/games/triathlon/athlete.js';
import { frameTriathlon } from '../src/games/triathlon/camera.js';
import { RIVALS, rivalLane } from '../src/games/triathlon/rivals.js';
import { canDraft, rivalAtTime } from '../src/games/triathlon/rules.js';

function projectEnvelope({ min, max }, lane, camera) {
  return Array.from({ length: 8 }, (_, corner) => new Vector3(
    (corner & 1 ? max.x : min.x) + lane,
    corner & 2 ? max.y : min.y,
    corner & 4 ? max.z : min.z
  ).project(camera));
}

describe('triathlon start lanes', () => {
  it('separates the actual swimmers throughout their strokes and every start sway phase', () => {
    const scene = new Scene();
    const swimmers = [{ name: 'Viktor Jones', color: 0xd9ad4d, player: true }, ...RIVALS].map((profile, i) => {
      const athlete = createAthlete(scene, profile.name, profile.color, profile.player);
      const envelope = new Box3();
      // Include several full strokes in a conservative sideways envelope.
      for (let frame = 0; frame < 180; frame++) {
        athlete.update('swim', 1 / 60, frame / 60, false, 8.5);
        athlete.root.updateMatrixWorld(true);
        const body = new Box3().setFromObject(athlete.root.children[0], true);
        envelope.union(body);
      }
      athlete.dispose();
      return { ...profile, stage: 0, phase: (i - 1) * 1.8, envelope, left: envelope.min.x, right: envelope.max.x };
    });
    try {
      // Runtime time also advances on the intro, so start at every sway phase.
      for (let phase = 0; phase < 720; phase++) {
        const time = phase / 720 * Math.PI * 2 / 0.17;
        // The passive current moves the player right by up to 0.646 m.
        for (const current of [0, 2 * 0.21 / 0.65]) {
          const bounds = swimmers.map(swimmer => {
            const lane = swimmer.player ? current : rivalLane(swimmer, time);
            return { left: lane + swimmer.left, right: lane + swimmer.right };
          }).sort((a, b) => a.left - b.left);
          expect(bounds[0].left).toBeGreaterThan(-3.85);
          expect(bounds.at(-1).right).toBeLessThan(3.85);
          for (let i = 1; i < bounds.length; i++) expect(bounds[i].left - bounds[i - 1].right).toBeGreaterThan(0.18);
        }
      }
      // A separated field can still be too wide: protect the complete outer
      // swimmers, not only the followed player's centre, on narrow screens.
      for (const [width, height] of [[320, 844], [390, 844], [844, 390], [1280, 800]]) {
        const camera = new PerspectiveCamera(52, width / height, 0.1, 270);
        frameTriathlon(camera, { x: 0, started: true, discipline: 'swim' }); camera.updateMatrixWorld();
        for (const swimmer of swimmers) {
          const lane = swimmer.player ? 0 : rivalLane(swimmer, 0);
          for (const screen of projectEnvelope(swimmer.envelope, lane, camera)) {
            expect(Math.abs(screen.x)).toBeLessThan(0.99);
            expect(Math.abs(screen.y)).toBeLessThan(0.9);
          }
        }
      }
    } finally {
      // No renderer is used, but release every constructed test resource.
      const materials = new Set(), geometries = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      materials.forEach(material => material.dispose());
      geometries.forEach(geometry => geometry.dispose()); scene.clear();
    }
  });

  it('preserves running and cycling positions, including drafting boundaries', () => {
    RIVALS.forEach((rival, i) => {
      for (const stage of [1, 2]) for (const time of [0, 3, 20, 75, 180]) {
        const phase = i * 1.8;
        const before = rival.lane + Math.sin(time * 0.17 + phase) * 0.3;
        const after = rivalLane({ ...rival, phase, stage }, time);
        expect(after).toBe(before);
        for (const offset of [-1.06, -1.04, 0, 1.04, 1.06]) {
          expect(canDraft(stage, 100, before + offset, { stage, distance: 110, lane: after, finished: false }))
            .toBe(stage === 2 && Math.abs(offset) < 1.05);
        }
      }
    });
  });

  it('keeps the established rival timings and resets the spatial start without state', () => {
    expect(RIVALS.map(({ duration, strengths }) => ({ duration, strengths }))).toEqual([
      { duration: 89, strengths: [1.08, 0.98, 1] },
      { duration: 96, strengths: [0.96, 1.07, 1] },
      { duration: 104, strengths: [1, 0.95, 1.07] }
    ]);
    RIVALS.forEach((rival, i) => {
      const initial = { ...rival, phase: i * 1.8, ...rivalAtTime(0, rival.duration, rival.strengths) };
      const lane = rivalLane(initial, 45);
      const finished = { ...initial, ...rivalAtTime(rival.duration, rival.duration, rival.strengths) };
      expect(finished.finished).toBe(true);
      expect(finished.progress).toBe(1);
      expect(rivalAtTime(rival.duration - 0.001, rival.duration, rival.strengths).finished).toBe(false);
      Object.assign(finished, rivalAtTime(0, rival.duration, rival.strengths));
      expect(rivalLane(finished, 45)).toBe(lane);
    });
  });
});
