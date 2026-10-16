import { describe, it, expect } from 'vitest';
import {
  changeSettings, choosePhase, focusedMs, formatClock, initialTimer, nextPhase, pause, progress, remainingMs, reset, skip, start, tick,
  type TimerSettings,
} from '../timer';

const MIN = 60_000;
const S: TimerSettings = { focusMin: 25, shortMin: 5, longMin: 15, rounds: 4 };

describe('running the clock', () => {
  it('counts down from timestamps and banks focus time on pause', () => {
    let t = start(initialTimer(S), 0);
    expect(remainingMs(t, 10 * MIN)).toBe(15 * MIN);
    expect(focusedMs(t, 10 * MIN)).toBe(10 * MIN);
    expect(progress(t, 10 * MIN)).toBeCloseTo(0.4);
    t = pause(t, 10 * MIN);
    expect(remainingMs(t, 99 * MIN)).toBe(15 * MIN);
    expect(focusedMs(t, 99 * MIN)).toBe(10 * MIN);
    t = start(t, 100 * MIN);
    expect(focusedMs(t, 105 * MIN)).toBe(15 * MIN);
  });

  it('moves to a break when focus runs out, counting the round', () => {
    const t = start(initialTimer(S), 0);
    expect(tick(t, 24 * MIN).finished).toBeNull();
    const { timer, finished } = tick(t, 26 * MIN);
    expect(finished).toBe('focus');
    expect(timer).toMatchObject({ phase: 'short', completedFocus: 1, runningSince: null, remainingMs: 5 * MIN, focusedMs: 25 * MIN });
  });

  it("doesn't count break time as focus", () => {
    let t = choosePhase(initialTimer(S), 'short', 0);
    t = start(t, 0);
    expect(focusedMs(t, 3 * MIN)).toBe(0);
    expect(tick(t, 6 * MIN).timer).toMatchObject({ phase: 'focus', completedFocus: 0, focusedMs: 0 });
  });
});

describe('phases', () => {
  it('takes a long break after every few rounds', () => {
    expect(nextPhase('focus', 1, S)).toBe('short');
    expect(nextPhase('focus', 4, S)).toBe('long');
    expect(nextPhase('focus', 8, S)).toBe('long');
    expect(nextPhase('long', 4, S)).toBe('focus');
  });
  it('skipping a focus round keeps the time worked but not the round', () => {
    const t = skip(start(initialTimer(S), 0), 10 * MIN);
    expect(t).toMatchObject({ phase: 'short', completedFocus: 0, focusedMs: 10 * MIN, runningSince: null });
  });
  it('reset restarts the phase and keeps time worked', () => {
    const t = reset(start(initialTimer(S), 0), 7 * MIN);
    expect(t).toMatchObject({ phase: 'focus', remainingMs: 25 * MIN, focusedMs: 7 * MIN, runningSince: null });
  });
  it('new settings restart the phase at its new length', () => {
    const t = changeSettings(start(initialTimer(S), 0), { ...S, focusMin: 50 }, 5 * MIN);
    expect(t).toMatchObject({ remainingMs: 50 * MIN, focusedMs: 5 * MIN });
  });
});

describe('formatClock', () => {
  it('rounds up to the second', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65 * MIN)).toBe('1:05:00');
  });
});
