import { describe, it, expect } from 'vitest';
import { IntervalSet } from '../intervalSet';

describe('IntervalSet', () => {
  it('merges overlapping and adjacent intervals on construction', () => {
    const set = new IntervalSet([
      { startMs: 0, endMs: 100 },
      { startMs: 50, endMs: 150 },
      { startMs: 150, endMs: 200 },
    ]);
    expect(set.toList()).toEqual([{ startMs: 0, endMs: 200 }]);
  });

  it('keeps disjoint intervals separate', () => {
    const set = new IntervalSet([
      { startMs: 0, endMs: 100 },
      { startMs: 200, endMs: 300 },
    ]);
    expect(set.toList()).toEqual([
      { startMs: 0, endMs: 100 },
      { startMs: 200, endMs: 300 },
    ]);
  });

  it('intersects two sets correctly', () => {
    const a = new IntervalSet([{ startMs: 0, endMs: 100 }]);
    const b = new IntervalSet([{ startMs: 50, endMs: 150 }]);
    expect(a.intersect(b).toList()).toEqual([{ startMs: 50, endMs: 100 }]);
  });

  it('subtracts a busy interval out of a free interval', () => {
    const free = new IntervalSet([{ startMs: 0, endMs: 100 }]);
    const busy = new IntervalSet([{ startMs: 30, endMs: 60 }]);
    expect(free.subtract(busy).toList()).toEqual([
      { startMs: 0, endMs: 30 },
      { startMs: 60, endMs: 100 },
    ]);
  });

  it('subtracting the whole interval leaves it empty', () => {
    const free = new IntervalSet([{ startMs: 0, endMs: 100 }]);
    const busy = new IntervalSet([{ startMs: -10, endMs: 110 }]);
    expect(free.subtract(busy).isEmpty()).toBe(true);
  });

  it('computes total duration across multiple intervals', () => {
    const set = new IntervalSet([
      { startMs: 0, endMs: 100 },
      { startMs: 200, endMs: 250 },
    ]);
    expect(set.totalDurationMs()).toBe(150);
  });
});
