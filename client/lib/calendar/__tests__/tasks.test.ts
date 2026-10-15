import { describe, it, expect } from 'vitest';
import { fixedBusyIntervals, isPlannable, schedulingKey, sessionFromRow, sessionToRow, taskFromRow, toPlannerTask, toTrackedTask, updateSession, withoutMovableSessions, pendingCheckIns } from '../tasks';
import type { CalendarEvent, Task, TaskRow } from '../types';

const row = (over: Partial<TaskRow> = {}): TaskRow => ({
  id: 't1', title: 'Essay', description: null, duration_minutes: 90, priority: 'High', energy_level: 'Low',
  deadline: null, is_fixed_time: false, fixed_start: null, fixed_end: null, is_splittable: true, chunk_min: 30, chunk_max: 60,
  color: '#abcdef', is_completed: false, created_at: '2026-10-01T00:00:00Z', sessions: null, ...over,
});

describe('taskFromRow', () => {
  it('maps database columns', () => {
    const t = taskFromRow(row());
    expect(t).toMatchObject({ id: 't1', description: '', durationMinutes: 90, priority: 'High', energyLevel: 'Low', chunkSize: { min: 30, max: 60 }, sessions: [], isDeleted: false });
  });
  it('drops chunk sizes when not splittable', () => {
    expect(taskFromRow(row({ is_splittable: false })).chunkSize).toBeNull();
  });
});

describe('planning helpers', () => {
  const t = (over: Partial<TaskRow> = {}, extra: Partial<Task> = {}) => ({ ...taskFromRow(row(over)), ...extra });
  it('only plans active, flexible tasks with a duration', () => {
    expect(isPlannable(t())).toBe(true);
    expect(isPlannable(t({ duration_minutes: 0 }))).toBe(false);
    expect(isPlannable(t({ is_fixed_time: true }))).toBe(false);
    expect(isPlannable(t({ is_completed: true }))).toBe(false);
    expect(isPlannable(t({}, { isDeleted: true }))).toBe(false);
  });
  it('converts to planner input', () => {
    expect(toPlannerTask(t({ deadline: '2026-10-20T12:00:00Z' }))).toEqual({
      id: 't1', durationMinutes: 90, deadlineMs: Date.parse('2026-10-20T12:00:00Z'), priority: 'High', energyLevel: 'Low', chunk: { min: 30, max: 60 },
    });
    expect(toPlannerTask(t({ chunk_max: 0 })).chunk).toBeNull();
    expect(toPlannerTask(t({ is_splittable: false })).chunk).toBeNull();
  });
  it('collects busy time from timed events and fixed tasks, not all-day or task blocks', () => {
    const now = new Date(2026, 9, 14, 8).getTime();
    const events: CalendarEvent[] = [
      { id: '1', title: 'x', date: '2026-10-14', start_time: '09:00', end_time: '10:00', description: '' },
      { id: '2', title: 'all day', date: '2026-10-14', start_time: '00:00', end_time: '23:59', description: '' },
      { id: 'sched-t9~s0', title: 'session', date: '2026-10-14', start_time: '11:00', end_time: '12:00', description: '' },
    ];
    const fixed = t({ id: 'f', is_fixed_time: true, fixed_start: '2026-10-15T13:00:00Z', fixed_end: '2026-10-15T14:00:00Z' });
    expect(fixedBusyIntervals(events, [fixed], now)).toEqual([
      { startMs: new Date(2026, 9, 14, 9).getTime(), endMs: new Date(2026, 9, 14, 10).getTime() },
      { startMs: Date.parse('2026-10-15T13:00:00Z'), endMs: Date.parse('2026-10-15T14:00:00Z') },
    ]);
  });
  it('changes the scheduling key only for planner-relevant fields', () => {
    const a = t();
    expect(schedulingKey({ ...a, title: 'Renamed', color: '#000000' })).toBe(schedulingKey(a));
    expect(schedulingKey({ ...a, durationMinutes: 30 })).not.toBe(schedulingKey(a));
  });
});

describe('session tracking', () => {
  const base = taskFromRow(row({ duration_minutes: 120, deadline: '2026-10-20T12:00:00Z' }));
  const at = (iso: string) => Date.parse(iso);
  const past = { start: '2026-10-14T09:00:00.000Z', end: '2026-10-14T10:00:00.000Z', status: 'planned' as const };
  const legacy = { start: '2026-10-13T09:00:00.000Z', end: '2026-10-13T10:00:00.000Z' };
  const future = { start: '2026-10-16T09:00:00.000Z', end: '2026-10-16T10:00:00.000Z', status: 'planned' as const };
  const pinned = { ...future, start: '2026-10-17T09:00:00.000Z', end: '2026-10-17T10:00:00.000Z', pinned: true };
  const NOW = at('2026-10-15T08:00:00Z');

  it('round-trips sessions, keeping legacy ones without a status', () => {
    for (const s of [past, legacy, future, pinned, { ...past, status: 'partial' as const, doneMinutes: 20 }]) {
      expect(sessionToRow(sessionFromRow(s))).toEqual(s);
    }
    expect(sessionFromRow(legacy).status).toBeUndefined();
  });

  it('ignores junk in stored sessions', () => {
    const junk = { ...past, status: 'bogus', doneMinutes: 5 } as unknown as typeof past;
    expect(sessionFromRow(junk)).toEqual({ startMs: at(past.start), endMs: at(past.end) });
  });

  it('converts to replanning input', () => {
    const t = toTrackedTask({ ...base, sessions: [past, pinned] });
    expect(t.sessions).toEqual([
      { startMs: at(past.start), endMs: at(past.end), status: 'planned' },
      { startMs: at(pinned.start), endMs: at(pinned.end), status: 'planned', pinned: true },
    ]);
  });

  it('keeps the past and pinned sessions when a task is replanned, dropping only movable upcoming ones', () => {
    const underway = { start: '2026-10-15T07:30:00.000Z', end: '2026-10-15T08:30:00.000Z', status: 'planned' as const };
    const t = withoutMovableSessions({ ...base, sessions: [legacy, past, underway, future, pinned] }, NOW);
    expect(t.sessions).toEqual([legacy, past, underway, pinned]);
  });

  it('records a check-in on one session', () => {
    const t = { ...base, sessions: [past, future] };
    expect(updateSession(t, 0, { status: 'done' }).sessions).toEqual([{ ...past, status: 'done' }, future]);
    const partial = updateSession(t, 0, { status: 'partial', doneMinutes: 25 });
    expect(partial.sessions[0]).toEqual({ ...past, status: 'partial', doneMinutes: 25 });
    // Changing the answer drops the old minutes.
    expect(updateSession(partial, 0, { status: 'skipped' }).sessions[0]).toEqual({ ...past, status: 'skipped' });
    expect(updateSession(partial, 0, { status: 'planned' }).sessions[0]).toEqual(past);
  });

  it('pins and unpins a session', () => {
    const t = { ...base, sessions: [legacy, future] };
    const p = updateSession(t, 1, { pinned: true });
    expect(p.sessions[1]).toEqual({ ...future, pinned: true });
    expect(updateSession(p, 1, { pinned: false }).sessions[1]).toEqual(future);
    expect(updateSession(t, 0, { pinned: true }).sessions[0]).toEqual({ ...legacy, status: 'planned', pinned: true });
  });
});

describe('pendingCheckIns', () => {
  const NOW = Date.parse('2026-10-15T12:00:00Z');
  const sess = (start: string, end: string, extra = {}) => ({ start, end, status: 'planned' as const, ...extra });
  it('lists ended, unanswered sessions from the last week, oldest first', () => {
    const a = { ...taskFromRow(row({ id: 'a', title: 'A' })), sessions: [
      sess('2026-10-15T10:00:00Z', '2026-10-15T11:00:00Z'),
      sess('2026-10-14T10:00:00Z', '2026-10-14T11:00:00Z', { status: 'done' }),
      sess('2026-10-15T11:30:00Z', '2026-10-15T12:30:00Z'), // still going
      sess('2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z'), // too old
      { start: '2026-10-14T08:00:00Z', end: '2026-10-14T09:00:00Z' }, // from before check-ins
    ] };
    const b = { ...taskFromRow(row({ id: 'b', title: 'B' })), sessions: [sess('2026-10-13T10:00:00Z', '2026-10-13T11:00:00Z')] };
    const done = { ...taskFromRow(row({ id: 'c', is_completed: true })), sessions: [sess('2026-10-13T10:00:00Z', '2026-10-13T11:00:00Z')] };
    expect(pendingCheckIns([a, b, done], NOW).map(p => [p.taskId, p.index])).toEqual([['b', 0], ['a', 0]]);
  });
});

