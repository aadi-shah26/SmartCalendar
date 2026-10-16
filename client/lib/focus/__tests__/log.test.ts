import { describe, it, expect } from 'vitest';
import { logFocus } from '../log';
import { toTrackedTask } from '../../calendar/tasks';
import { prefsForWorkTime, reflow } from '../../scheduler';
import type { TaskSession } from '../../calendar/types';

const iso = (h: number, m = 0) => new Date(2026, 9, 14, h, m).toISOString();
const NOW = Date.parse(iso(15));
const planned: TaskSession = { start: iso(14), end: iso(15), status: 'planned', pinned: true };
const later: TaskSession = { start: iso(18), end: iso(19), status: 'planned' };

describe('logFocus', () => {
  it('logs free-standing focus as a done session ending now', () => {
    expect(logFocus([later], 25, NOW)).toEqual([
      { start: iso(14, 35), end: iso(15), status: 'done' },
      later,
    ]);
  });

  it('marks the planned session partly done, then done', () => {
    const once = logFocus([planned, later], 25, NOW, planned.start);
    expect(once[0]).toEqual({ start: iso(14), end: iso(15), pinned: true, status: 'partial', doneMinutes: 25 });
    const twice = logFocus(once, 35, NOW, planned.start);
    expect(twice).toHaveLength(2);
    expect(twice[0]).toEqual({ start: iso(14), end: iso(15), pinned: true, status: 'done' });
  });

  it('logs focus beyond the session as an extra done session', () => {
    const out = logFocus([planned], 75, NOW, planned.start);
    expect(out).toEqual([
      { start: iso(14), end: iso(15), pinned: true, status: 'done' },
      { start: iso(14, 45), end: iso(15), status: 'done' },
    ]);
  });

  it('leaves a session that hasn\'t started yet planned, logging the focus on its own', () => {
    const out = logFocus([planned, later], 20, NOW, later.start);
    expect(out).toEqual([planned, { start: iso(14, 40), end: iso(15), status: 'done' }, later]);
  });

  it('falls back to a new session when the planned one is gone (replanned)', () => {
    expect(logFocus([later], 30, NOW, iso(9))).toHaveLength(2);
  });

  it('ignores less than half a minute', () => {
    expect(logFocus([later], 0.4, NOW)).toEqual([later]);
  });
});

describe('logged focus and the planner', () => {
  it('working ahead trims the planned session instead of planning more', () => {
    const now = Date.parse(iso(10));
    const session: TaskSession = { start: iso(14), end: iso(15), status: 'planned' };
    const sessions = logFocus([session], 20, now, session.start);
    const task = toTrackedTask({
      id: 't1', title: 'Essay', description: '', duration: 60, durationMinutes: 60, priority: 'Medium', energyLevel: 'Medium',
      deadline: new Date(2026, 9, 20).toISOString(), isFixedTime: false, fixedStart: null, fixedEnd: null, isSplittable: false,
      chunkSize: null, color: '#000', isCompleted: false, isDeleted: false, createdAt: '', sessions, estimatedMinutes: 60, actualMinutes: null,
    });
    const { changed } = reflow([task], [], prefsForWorkTime('day'), now);
    const upcoming = changed.t1.filter(s => s.status === 'planned');
    expect(upcoming.reduce((n, s) => n + (s.endMs - s.startMs) / 60_000, 0)).toBe(40);
  });
});
