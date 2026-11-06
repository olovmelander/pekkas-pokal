import { describe, it, expect } from 'vitest';
import { landing, precisionScore, advanceBalance, kubbHit, medal } from '../src/games/farm/rules.js';

describe('country tournament rules', () => {
  it('maps a powered throw onto its visible landing marker and includes crosswind', () => {
    expect(landing(0, 0.6)).toEqual({ x: 0, z: -7 });
    expect(landing(-0.2, 0.6, 1)).toEqual({ x: 0, z: -7 });
    expect(landing(9, 9)).toEqual({ x: 5, z: -13 });
  });
  it('rewards precision, never negative points or more than a perfect throw', () => {
    expect(precisionScore(0)).toBe(1000);
    expect(precisionScore(1)).toBeGreaterThan(precisionScore(2));
    expect(precisionScore(4)).toBe(0);
    expect(precisionScore(20)).toBe(0);
  });
  it('makes early king strikes a loss and permits the king after ordinary kubbs', () => {
    const blocks = [{ x: -2, z: -6, down: false }, { x: 0, z: -9, down: false, king: true }];
    expect(kubbHit(blocks, { x: 0, z: -9 })).toEqual({ index: 1, prematureKing: true });
    blocks[0].down = true;
    expect(kubbHit(blocks, { x: 0, z: -9 })).toEqual({ index: 1, prematureKing: false });
    expect(kubbHit(blocks, { x: -2, z: -6 }).index).toBe(-1);
    expect(kubbHit(blocks, { x: 3, z: 0 }).index).toBe(-1);
  });
  it('allows countersteering and makes bracing a speed/control tradeoff', () => {
    const initial = { tilt: 0.8, velocity: 0.4, cargo: 100, progress: 0 };
    const steady = advanceBalance(initial, -1, false, 0, 0.05);
    const wrong = advanceBalance(initial, 1, false, 0, 0.05);
    const braced = advanceBalance(initial, -1, true, 0, 0.05);
    expect(steady.velocity).toBeLessThan(wrong.velocity);
    expect(braced.velocity).toBeLessThan(steady.velocity);
    expect(braced.progress).toBeLessThan(steady.progress);
    expect(steady.cargo).toBeLessThan(100);
    expect(initial.cargo).toBe(100);
  });
  it('never lets a suspended browser tab instantly empty the bucket', () => {
    const state = { tilt: 1, velocity: 1, cargo: 1, progress: 0 };
    const next = advanceBalance(state, 1, false, 0, 900);
    expect(next.cargo).toBeGreaterThanOrEqual(0);
    expect(next.progress).toBe(0.05);
    expect(next.tilt).toBeLessThanOrEqual(1.35);
  });
  it('awards medals against the three-event total', () => {
    expect(medal(2400)).toBe('Guld');
    expect(medal(1700)).toBe('Silver');
    expect(medal(900)).toBe('Brons');
    expect(medal(0)).not.toBe('Brons');
  });
});
