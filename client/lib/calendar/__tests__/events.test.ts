import { describe, it, expect } from 'vitest';
import { byDeadline, byStartTime, computeTaskCalendarEvents, expandEvents, isTaskEventId, taskIdFromCalendarId } from '../events';
import type { CalendarEvent, Task } from '../types';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Essay', description: '', duration: 120, durationMinutes: 120, priority: 'Medium', energyLevel: 'Medium',
  deadline: null, isFixedTime: false, fixedStart: null, fixedEnd: null, isSplittable: false, chunkSize: null,
  color: '#abcdef', isCompleted: false, isDeleted: false, createdAt: '', sessions: [], ...over,
});

describe('task calendar ids', () => {
  it('recognises and decodes them', () => {
    expect(isTaskEventId('sched-t1~s2')).toBe(true);
    expect(isTaskEventId('42')).toBe(false);
    expect(taskIdFromCalendarId('sched-t1~s2')).toBe('t1');
    expect(taskIdFromCalendarId('sched-t1')).toBe('t1');
  });
});

describe('computeTaskCalendarEvents', () => {
  it('shows a fixed-time task as one block', () => {
    const out = computeTaskCalendarEvents(task({
      isFixedTime: true, fixedStart: new Date(2026, 9, 14, 9).toISOString(), fixedEnd: new Date(2026, 9, 14, 10).toISOString(),
      deadline: new Date(2026, 9, 20).toISOString(),
    }));
    expect(out).toEqual([expect.objectContaining({ id: 'sched-t1', date: '2026-10-14', start_time: '09:00:00', end_time: '10:00:00', description: 'Fixed task' })]);
  });
  it('shows a due pill plus each valid session', () => {
    const out = computeTaskCalendarEvents(task({
      deadline: new Date(2026, 9, 20, 17).toISOString(),
      sessions: [
        { start: new Date(2026, 9, 15, 9).toISOString(), end: new Date(2026, 9, 15, 10).toISOString() },
        { start: new Date(2026, 9, 16, 9).toISOString(), end: new Date(2026, 9, 16, 9).toISOString() }, // empty: skipped
      ],
    }));
    expect(out.map(e => [e.id, e.date, e.isTaskDue ?? false, e.isTaskSession ?? false])).toEqual([
      ['sched-t1', '2026-10-20', true, false],
      ['sched-t1~s0', '2026-10-15', false, true],
    ]);
    expect(out[0].taskDurationMin).toBe(120);
  });
});

describe('expandEvents', () => {
  const base: CalendarEvent = { id: 'e', title: 'Gym', date: '2026-10-01', start_time: '07:00', end_time: '08:00', description: '' };
  it('passes one-off events through', () => {
    expect(expandEvents([base], new Date(2026, 9, 1), new Date(2026, 9, 31))).toEqual([base]);
  });
  it('repeats weekly events on the chosen weekdays within the window', () => {
    const out = expandEvents([{ ...base, recurrence: { type: 'weekly', days: [1, 3] } }], new Date(2026, 9, 12), new Date(2026, 9, 18));
    expect(out.map(e => [e.id, e.date, e._recurringBaseId])).toEqual([
      ['e_2026-10-12', '2026-10-12', 'e'],
      ['e_2026-10-14', '2026-10-14', 'e'],
    ]);
  });
  it('repeats daily events', () => {
    const out = expandEvents([{ ...base, recurrence: { type: 'daily' } }], new Date(2026, 9, 12), new Date(2026, 9, 14));
    expect(out.map(e => e.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });
});

describe('sorting', () => {
  it('orders events by start, then end', () => {
    const e = (s: string, en: string) => ({ start_time: s, end_time: en }) as CalendarEvent;
    const sorted = [e('10:00', '11:00'), e('09:00', '12:00'), e('09:00', '10:00')].sort(byStartTime);
    expect(sorted.map(x => `${x.start_time}-${x.end_time}`)).toEqual(['09:00-10:00', '09:00-12:00', '10:00-11:00']);
  });
  it('orders tasks by deadline, undated last', () => {
    const sorted = [{ deadline: null }, { deadline: '2026-10-20' }, { deadline: '2026-10-15' }].sort(byDeadline);
    expect(sorted.map(t => t.deadline)).toEqual(['2026-10-15', '2026-10-20', null]);
  });
});
