import { describe, it, expect } from 'vitest';
import { estimateHistory, formatRatio, scaledMinutes, workedMinutes } from '../estimates';
import type { Task, TaskSession } from '../types';

const at = (h: number, m = 0) => new Date(2026, 9, 14, h, m).toISOString();
const session = (h: number, len: number, patch: Partial<TaskSession> = {}): TaskSession =>
  ({ start: at(h), end: new Date(Date.parse(at(h)) + len * 60_000).toISOString(), ...patch });
const NOON = Date.parse(at(12));

let n = 0;
const finished = (estimate: number | null, actual: number | null, patch: Partial<Task> = {}): Task => ({
  id: `t${n}`, title: 'T', description: '', duration: estimate ?? 0, durationMinutes: estimate ?? 0,
  priority: 'Medium', energyLevel: 'Medium', deadline: null, isFixedTime: false, fixedStart: null, fixedEnd: null,
  isSplittable: false, chunkSize: null, color: '#000', isCompleted: true, isDeleted: false,
  createdAt: new Date(2026, 9, 1, 0, n++).toISOString(), sessions: [],
  estimatedMinutes: estimate, actualMinutes: actual, ...patch,
});

describe('workedMinutes', () => {
  it('counts what got done', () => {
    expect(workedMinutes([
      session(8, 60, { status: 'done' }),
      session(9, 60, { status: 'partial', doneMinutes: 20 }),
      session(10, 30, { status: 'skipped' }),
      session(10, 30, { status: 'planned' }),
      session(14, 60, { status: 'planned' }),
    ], NOON)).toBe(60 + 20 + 30);
  });
  it('counts a session under way up to now', () => {
    expect(workedMinutes([session(11, 120)], NOON)).toBe(60);
  });
});

describe('estimateHistory', () => {
  it('needs a few finished tasks', () => {
    expect(estimateHistory([finished(60, 90), finished(60, 90)])).toBeNull();
  });
  it('takes the median ratio, ignoring tasks with nothing to compare', () => {
    const tasks = [finished(60, 90), finished(60, 60), finished(100, 150), finished(60, 600),
      finished(null, 60), finished(60, 0), finished(60, 90, { isCompleted: false })];
    expect(estimateHistory(tasks)).toEqual({ ratio: 1.5, samples: 4 });
  });
  it('stays within reason', () => {
    expect(estimateHistory([finished(10, 100), finished(10, 100), finished(10, 100)])?.ratio).toBe(2);
    expect(estimateHistory([finished(100, 10), finished(100, 10), finished(100, 10)])?.ratio).toBe(0.5);
  });
  it('only looks at recent tasks', () => {
    const old = Array.from({ length: 5 }, () => finished(60, 120));
    const recent = Array.from({ length: 10 }, () => finished(60, 60));
    expect(estimateHistory([...old, ...recent])).toEqual({ ratio: 1, samples: 10 });
  });
});

describe('scaledMinutes', () => {
  it('rounds to 5 minutes and leaves ratio 1 alone', () => {
    expect(scaledMinutes(60, 1.4)).toBe(85);
    expect(scaledMinutes(47, 1)).toBe(47);
    expect(scaledMinutes(5, 0.5)).toBe(5);
  });
  it('formats', () => {
    expect(formatRatio(1.4)).toBe('1.4×');
    expect(formatRatio(0.85)).toBe('0.85×');
  });
});
