import { Interval } from './types';

function assertValid(interval: Interval): void {
  if (interval.startMs >= interval.endMs) {
    throw new Error(
      `Invalid interval: startMs (${interval.startMs}) must be less than endMs (${interval.endMs}).`
    );
  }
}

function clone(interval: Interval): Interval {
  return { startMs: interval.startMs, endMs: interval.endMs };
}

function normalize(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  intervals.forEach(assertValid);
  const sorted = intervals.map(clone).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: Interval[] = [sorted[0]];
  for (const current of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
    } else {
      merged.push(clone(current));
    }
  }
  return merged;
}

export class IntervalSet {
  private intervals: Interval[];

  constructor(intervals: Interval[] = []) {
    this.intervals = normalize(intervals);
  }

  static empty(): IntervalSet {
    return new IntervalSet([]);
  }

  toList(): Interval[] {
    return this.intervals.map(clone);
  }

  isEmpty(): boolean {
    return this.intervals.length === 0;
  }

  totalDurationMs(): number {
    return this.intervals.reduce((sum, i) => sum + (i.endMs - i.startMs), 0);
  }

  union(other: IntervalSet): IntervalSet {
    return new IntervalSet([...this.intervals, ...other.intervals]);
  }

  intersect(other: IntervalSet): IntervalSet {
    const result: Interval[] = [];
    let i = 0;
    let j = 0;
    while (i < this.intervals.length && j < other.intervals.length) {
      const a = this.intervals[i];
      const b = other.intervals[j];
      const start = Math.max(a.startMs, b.startMs);
      const end = Math.min(a.endMs, b.endMs);
      if (start < end) result.push({ startMs: start, endMs: end });
      if (a.endMs < b.endMs) i++;
      else j++;
    }
    return new IntervalSet(result);
  }

  subtract(other: IntervalSet): IntervalSet {
    const result: Interval[] = [];
    let j = 0;
    for (const a of this.intervals) {
      let currentStart = a.startMs;
      while (j < other.intervals.length && other.intervals[j].endMs <= a.startMs) j++;
      let k = j;
      while (k < other.intervals.length && other.intervals[k].startMs < a.endMs) {
        const b = other.intervals[k];
        if (b.startMs > currentStart) {
          result.push({ startMs: currentStart, endMs: Math.min(b.startMs, a.endMs) });
        }
        currentStart = Math.max(currentStart, b.endMs);
        if (currentStart >= a.endMs) break;
        k++;
      }
      if (currentStart < a.endMs) {
        result.push({ startMs: currentStart, endMs: a.endMs });
      }
    }
    return new IntervalSet(result);
  }
}
