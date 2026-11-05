import { describe, expect, it } from 'vitest';
import { paceStep, raceProgress, scoreRace, formatTime, STAGES, rivalAtTime, canDraft } from '../src/games/triathlon/rules.js';

describe('triathlon pacing', () => {
  it('follows the user-confirmed swim, run, cycle order for Lomsjön 2017', () => {
    expect(STAGES.map(stage => stage.id)).toEqual(['swim', 'run', 'bike']);
    expect(STAGES.map(stage => stage.name)).toEqual(['SIMNING', 'LÖPNING', 'CYKLING']);
    expect(STAGES[1].speed).toBeLessThan(STAGES[2].speed);
  });

  it('cannot sprint through exhaustion by holding the button', () => {
    const empty = paceStep({ stamina: 0.1, exhausted: false, stage: 1, surge: true }, 0.1);
    expect(empty.exhausted).toBe(true);
    expect(empty.pushing).toBe(false);
    expect(empty.stamina).toBe(0);
    const recovering = paceStep({ ...empty, stage: 1, surge: true }, 0.5);
    expect(recovering.exhausted).toBe(true);
    expect(recovering.pushing).toBe(false);
    expect(recovering.stamina).toBeGreaterThan(0);
  });

  it('rewards drafting with less energy use and clamps recovery', () => {
    const inputs = { stamina: 70, exhausted: false, stage: 2, surge: true };
    const solo = paceStep(inputs, 1);
    const draft = paceStep({ ...inputs, drafting: true }, 1);
    expect(draft.stamina).toBeGreaterThan(solo.stamina);
    expect(draft.speed).toBe(solo.speed);
    expect(paceStep({ ...inputs, stamina: 99, surge: false }, 1).stamina).toBe(100);
  });

  it('only grants the drafting bonus on the final cycling leg', () => {
    for (const stage of [0, 1]) {
      const inputs = { stamina: 70, exhausted: false, stage, surge: true };
      expect(paceStep({ ...inputs, drafting: true }, 1)).toEqual(paceStep(inputs, 1));
    }
  });

  it('has the same sustained effort cost across frame rates', () => {
    const run = fps => {
      let state = { stamina: 100, exhausted: false };
      for (let i = 0; i < fps * 3; i++) state = paceStep({ ...state, stage: 0, surge: true }, 1 / fps);
      return state;
    };
    expect(run(30).stamina).toBeCloseTo(run(120).stamina, 7);
  });

  it('allows a complete race at ordinary pace with no dead end', () => {
    let elapsed = 0;
    let energy = { stamina: 100, exhausted: false };
    for (let stage = 0; stage < STAGES.length; stage++) {
      let distance = 0;
      while (distance < STAGES[stage].distance && elapsed < 150) {
        energy = paceStep({ ...energy, stage, surge: false }, 1 / 60);
        distance += energy.speed / 60;
        elapsed += 1 / 60;
      }
      expect(distance).toBeGreaterThanOrEqual(STAGES[stage].distance);
    }
    expect(elapsed).toBeLessThan(110);
    expect(energy.stamina).toBe(100);
  });
});

describe('triathlon finish and scoring', () => {
  it('keeps progress continuous at both transitions and bounded at the finish', () => {
    expect(raceProgress(0, 260)).toBe(raceProgress(1, 0));
    expect(raceProgress(1, 320)).toBe(raceProgress(2, 0));
    expect(raceProgress(2, 700)).toBe(1);
    expect(raceProgress(0, -1)).toBe(0);
  });

  it('rewards precision, pickups and time while penalising collisions', () => {
    const clean = { seconds: 90, gates: 5, drinks: 6, hits: 0 };
    const score = scoreRace(clean);
    expect(scoreRace({ ...clean, seconds: 80 })).toBeGreaterThan(score);
    expect(scoreRace({ ...clean, gates: 0 })).toBeLessThan(score);
    expect(scoreRace({ ...clean, drinks: 0 })).toBeLessThan(score);
    expect(scoreRace({ ...clean, hits: 4 })).toBeLessThan(score);
    expect(scoreRace({ ...clean, seconds: 300 })).toBe(0);
  });

  it('formats split times without rolling 59.9 into a false minute', () => {
    expect(formatTime(59.99)).toBe('0:59.9');
    expect(formatTime(60.1)).toBe('1:00.1');
  });
});


describe('triathlon independent opponents', () => {
  it('crosses legs according to its own pace and uses the full declared duration', () => {
    const at25 = rivalAtTime(25, 90), at60 = rivalAtTime(60, 90), finish = rivalAtTime(90, 90);
    expect(at25.stage).toBe(0); expect(at60.stage).toBe(2);
    expect(finish.progress).toBe(1); expect(finish.finished).toBe(true);
    expect(rivalAtTime(89.99, 90).finished).toBe(false);
    let previous = 0;
    for (let t = 0; t <= 92; t += 0.1) {
      const state = rivalAtTime(t, 90, [1.08, 0.98, 1]);
      expect(state.progress).toBeGreaterThanOrEqual(previous); previous = state.progress;
    }
  });
  it('never drafts a different discipline, a finished rider, or one behind', () => {
    const r = { stage: 2, distance: 110, lane: 0, finished: false };
    expect(canDraft(2, 100, 0, r)).toBe(true);
    expect(canDraft(1, 100, 0, r)).toBe(false);
    expect(canDraft(2, 100, 0, { ...r, stage: 1 })).toBe(false);
    expect(canDraft(2, 100, 0, { ...r, finished: true })).toBe(false);
    expect(canDraft(2, 115, 0, r)).toBe(false);
    expect(canDraft(2, 100, 2, r)).toBe(false);
  });
});
