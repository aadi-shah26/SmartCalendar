import { describe, it, expect } from 'vitest';
import { fixedBusyIntervals, isPlannable, otherSessions, schedulingKey, taskFromRow, toPlannerTask } from '../tasks';
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
  it('lists sessions of tasks not being re-planned', () => {
    const s = { start: '2026-10-15T09:00:00Z', end: '2026-10-15T10:00:00Z' };
    const a = t({ id: 'a', sessions: [s] });
    const b = t({ id: 'b', sessions: [s] });
    expect(otherSessions([a, b], new Set(['a']))).toEqual([{ startMs: Date.parse(s.start), endMs: Date.parse(s.end) }]);
  });
  it('changes the scheduling key only for planner-relevant fields', () => {
    const a = t();
    expect(schedulingKey({ ...a, title: 'Renamed', color: '#000000' })).toBe(schedulingKey(a));
    expect(schedulingKey({ ...a, durationMinutes: 30 })).not.toBe(schedulingKey(a));
  });
});
