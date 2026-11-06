import { describe, expect, it } from 'vitest';
import { buildNature } from '../src/games/shared/scenic.js';

describe('shared scenery for long races and gardens', () => {
  it('keeps distant woods in independently culled cells', () => {
    const nature = buildNature({ trees: [
      { x: 4, z: 2, height: 9, type: 'birch' },
      { x: 6, z: 3, height: 12 },
      { x: 4, z: -700, height: 9 }
    ] });
    expect(nature.group.children).toHaveLength(2);
    for (const mesh of nature.group.children) {
      expect(mesh.frustumCulled).toBe(true);
      expect(mesh.geometry.boundingSphere.radius).toBeLessThan(20);
      expect([...mesh.geometry.attributes.position.array].every(Number.isFinite)).toBe(true);
    }
  });

  it('gives shadows to trees while keeping grass out of the shadow pass', () => {
    const nature = buildNature({
      trees: [{ x: 0, z: 0, height: 8 }],
      bushes: [{ x: 2, z: 1, radius: 1 }],
      grass: [{ x: 1, z: 0, radius: 2, count: 50 }]
    });
    expect(nature.group.children.map(mesh => mesh.castShadow).sort()).toEqual([false, true]);
    for (const mesh of nature.group.children) {
      const { position, normal, color, aTip, aSway } = mesh.geometry.attributes;
      expect([normal.count, color.count, aTip.count, aSway.count]).toEqual(Array(4).fill(position.count));
    }
  });

  it('recreates the same landscape after restart without sharing disposable materials', () => {
    const options = { seed: 17, trees: [{ x: 1, z: 1, height: 7, type: 'birch' }] };
    const first = buildNature(options).group.children[0];
    const second = buildNature(options).group.children[0];
    expect(second.geometry.attributes.position.array).toEqual(first.geometry.attributes.position.array);
    expect(second.material).not.toBe(first.material);
    first.geometry.dispose();
    first.material.dispose();
    expect(second.geometry.attributes.position.count).toBeGreaterThan(100);
  });
});
