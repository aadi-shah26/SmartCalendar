import { describe, it, expect } from 'vitest';
import { buildInstructions, normalizeParse, ParseContext } from '../parse';

const ctx: ParseContext = { now: '2026-10-01T17:40', weekday: 'Thursday', timezone: 'America/New_York' };

describe('normalizeParse', () => {
  it('builds an event, defaulting a missing end to one hour after the start', () => {
    const item = normalizeParse({ kind: 'event', title: 'Dentist', date: '2026-10-02', start_time: '15:00', end_time: null, repeat: 'none' }, ctx);
    expect(item).toEqual({
      kind: 'event', title: 'Dentist', description: '', date: '2026-10-02',
      startTime: '15:00', endTime: '16:00', recurrence: { type: 'none', days: [] },
    });
  });

  it('pads times, fixes an end before the start, and fills a missing date with today', () => {
    const item = normalizeParse({ kind: 'event', title: 'Call', start_time: '9:30', end_time: '08:00', repeat: 'none' }, ctx);
    expect(item).toMatchObject({ date: '2026-10-01', startTime: '09:30', endTime: '10:30' });
  });

  it('keeps weekly repeat days, deduped and sorted, and drops invalid ones', () => {
    const item = normalizeParse({ kind: 'event', title: 'Gym', date: '2026-10-05', start_time: '07:00', end_time: '08:00', repeat: 'weekly', repeat_days: [3, 1, 3, 9] }, ctx);
    expect(item).toMatchObject({ recurrence: { type: 'weekly', days: [1, 3] } });
  });

  it('keeps "midnight" on the same day: due 00:00 becomes 23:59', () => {
    const task = normalizeParse({ kind: 'task', title: 'Essay', date: '2026-10-02', due_time: '00:00', repeat: 'none' }, ctx);
    expect(task).toMatchObject({ deadline: '2026-10-02T23:59' });
    const event = normalizeParse({ kind: 'event', title: 'Party', date: '2026-10-02', start_time: '21:00', end_time: '00:00', repeat: 'none' }, ctx);
    expect(event).toMatchObject({ date: '2026-10-02', startTime: '21:00', endTime: '23:59' });
  });

  it('treats a weekly repeat with no days as not repeating', () => {
    const item = normalizeParse({ kind: 'event', title: 'Gym', date: '2026-10-05', start_time: '07:00', repeat: 'weekly', repeat_days: [] }, ctx);
    expect(item).toMatchObject({ recurrence: { type: 'none', days: [] } });
  });

  it('builds a task with a deadline, duration and priority', () => {
    const item = normalizeParse({
      kind: 'task', title: 'History essay', date: '2026-10-02', due_time: '17:00',
      duration_minutes: 180, priority: 'High', energy_level: null, repeat: 'none',
    }, ctx);
    expect(item).toEqual({
      kind: 'task', title: 'History essay', description: '', deadline: '2026-10-02T17:00',
      durationMinutes: 180, priority: 'High', energyLevel: 'Medium',
    });
  });

  it('gives a task with a date but no time an end-of-day deadline', () => {
    const item = normalizeParse({ kind: 'task', title: 'Essay', date: '2026-10-02', repeat: 'none' }, ctx);
    expect(item).toMatchObject({ deadline: '2026-10-02T23:59', durationMinutes: null });
  });

  it('leaves a task with no date undated and ignores junk fields', () => {
    const item = normalizeParse({ kind: 'task', title: 'Buy milk', date: 'friday', duration_minutes: -5, priority: 'urgent', repeat: 'none' }, ctx);
    expect(item).toMatchObject({ deadline: null, durationMinutes: null, priority: 'Medium' });
  });

  it('rejects replies without a title or a kind', () => {
    expect(() => normalizeParse({ kind: 'task', title: '  ', repeat: 'none' }, ctx)).toThrow(/title/);
    expect(() => normalizeParse({ kind: 'meeting', title: 'x', repeat: 'none' }, ctx)).toThrow(/event or a task/);
    expect(() => normalizeParse(null, ctx)).toThrow();
  });
});

describe('buildInstructions', () => {
  it('tells the model the current date and timezone', () => {
    const text = buildInstructions(ctx);
    expect(text).toContain('Thursday 2026-10-01 17:40');
    expect(text).toContain('America/New_York');
  });
});
