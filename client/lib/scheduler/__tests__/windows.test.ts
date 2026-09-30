import { describe, it, expect } from 'vitest';
import { windowsToIntervalSet, findAllowedIntervals } from '../windows';

// 2026-09-27 is a Sunday; 2026-09-28 is a Monday.
const horizon = {
  startMs: new Date('2026-09-27T00:00:00').getTime(),
  endMs: new Date('2026-10-04T00:00:00').getTime(),
};

describe('windowsToIntervalSet', () => {
  it('returns the full horizon when no windows are given', () => {
    const set = windowsToIntervalSet(undefined, horizon);
    expect(set.toList()).toEqual([horizon]);
  });

  it('expands a weekly window to the matching day only', () => {
    const set = windowsToIntervalSet(
      [{ kind: 'weekly', daysOfWeek: [1], timeStart: '09:00', timeEnd: '17:00' }],
      horizon
    );
    const list = set.toList();
    expect(list).toHaveLength(1);
    expect(new Date(list[0].startMs).toISOString()).toBe(new Date('2026-09-28T09:00:00').toISOString());
    expect(new Date(list[0].endMs).toISOString()).toBe(new Date('2026-09-28T17:00:00').toISOString());
  });

  it('clips an absolute window to the horizon bounds', () => {
    const set = windowsToIntervalSet(
      [{ kind: 'absolute', start: '2026-09-20T00:00:00', end: '2026-09-29T00:00:00' }],
      horizon
    );
    expect(set.toList()).toEqual([{ startMs: horizon.startMs, endMs: new Date('2026-09-29T00:00:00').getTime() }]);
  });
});

describe('findAllowedIntervals', () => {
  it('subtracts blackout windows from allowed windows', () => {
    const result = findAllowedIntervals(
      {
        allowedWindows: [{ kind: 'weekly', daysOfWeek: [1], timeStart: '09:00', timeEnd: '17:00' }],
        blackoutWindows: [{ kind: 'absolute', start: '2026-09-28T12:00:00', end: '2026-09-28T13:00:00' }],
      },
      horizon
    );
    expect(result.toList()).toEqual([
      { startMs: new Date('2026-09-28T09:00:00').getTime(), endMs: new Date('2026-09-28T12:00:00').getTime() },
      { startMs: new Date('2026-09-28T13:00:00').getTime(), endMs: new Date('2026-09-28T17:00:00').getTime() },
    ]);
  });

  it('respects latestEnd as a hard deadline', () => {
    const result = findAllowedIntervals(
      { latestEnd: '2026-09-28T10:00:00' },
      horizon
    );
    expect(result.toList()).toEqual([{ startMs: horizon.startMs, endMs: new Date('2026-09-28T10:00:00').getTime() }]);
  });
});
