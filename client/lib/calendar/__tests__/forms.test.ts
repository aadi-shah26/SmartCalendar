import { describe, it, expect } from 'vitest';
import { emptyTaskForm, eventFormAtHour, eventFormFromEvent, eventFormRecurrence, newEventForm, shiftEndWithStart, taskFormFromTask, taskRowFromForm } from '../forms';
import { taskFromRow } from '../tasks';

describe('event form', () => {
  it('opens an hour-long slot, keeping the last one at 23:00', () => {
    expect(eventFormAtHour('2026-10-14', 9, '#111111')).toMatchObject({ start: '09:00', end: '10:00', color: '#111111', recurrenceType: 'none' });
    expect(eventFormAtHour('2026-10-14', 23, '#111111')).toMatchObject({ start: '23:00', end: '23:00' });
  });
  it('fills from an event', () => {
    const f = eventFormFromEvent({ id: '1', title: 'Gym', date: '2026-10-14', start_time: '07:00:00', end_time: '08:30:00', description: '', recurrence: { type: 'weekly', days: [1] } });
    expect(f).toMatchObject({ start: '07:00', end: '08:30', color: '#1a1a1a', recurrenceType: 'weekly', recurrenceDays: [1] });
  });
  it('only keeps weekdays for weekly repeats', () => {
    const f = newEventForm('2026-10-14', '09:00', '10:00', '#1a1a1a');
    expect(eventFormRecurrence(f)).toBeNull();
    expect(eventFormRecurrence({ ...f, recurrenceType: 'daily', recurrenceDays: [2] })).toEqual({ type: 'daily', days: [] });
    expect(eventFormRecurrence({ ...f, recurrenceType: 'weekly', recurrenceDays: [2] })).toEqual({ type: 'weekly', days: [2] });
  });
});

describe('task form', () => {
  it('round-trips a task through the form', () => {
    const task = taskFromRow({
      id: 't1', title: 'Essay', description: 'notes', duration_minutes: 90, priority: 'High', energy_level: 'Low',
      deadline: '2026-10-20T21:00:00.000Z', is_fixed_time: false, fixed_start: null, fixed_end: null,
      is_splittable: true, chunk_min: 30, chunk_max: 60, color: '#abcdef', is_completed: false, created_at: '', sessions: [],
    });
    const form = taskFormFromTask(task);
    expect(form).toMatchObject({ title: 'Essay', duration: 90, chunkMin: 30, chunkMax: 60, isSplittable: true });
    expect(taskRowFromForm(form)).toEqual({
      title: 'Essay', description: 'notes', duration_minutes: 90, priority: 'High', energy_level: 'Low',
      deadline: '2026-10-20T21:00:00.000Z', is_fixed_time: false, fixed_start: null, fixed_end: null,
      is_splittable: true, chunk_min: 30, chunk_max: 60, color: '#abcdef',
    });
  });
  it('derives a fixed task\'s duration from its times', () => {
    const row = taskRowFromForm({ ...emptyTaskForm('#1a1a1a'), title: ' x ', duration: 5, isFixedTime: true, fixedStart: '2026-10-14T09:00', fixedEnd: '2026-10-14T10:30' });
    expect(row).toMatchObject({ title: 'x', duration_minutes: 90, is_fixed_time: true, chunk_min: null, chunk_max: null });
  });
  it('treats blank numbers as zero', () => {
    expect(taskRowFromForm({ ...emptyTaskForm('#1a1a1a'), isSplittable: true })).toMatchObject({ duration_minutes: 0, chunk_min: 0, chunk_max: 0, deadline: null });
  });
});

describe('moving an event start', () => {
  it('keeps the length, like Google Calendar', () => {
    expect(shiftEndWithStart('09:00', '10:30', '14:00')).toBe('15:30');
    expect(shiftEndWithStart('09:00', '09:15', '09:45')).toBe('10:00');
  });
  it('makes a zero-length event an hour long and stops at 23:59', () => {
    expect(shiftEndWithStart('23:00', '23:00', '10:00')).toBe('11:00');
    expect(shiftEndWithStart('09:00', '11:00', '23:00')).toBe('23:59');
  });
  it('rounds a length that was cut short at 23:59 back to the 15-minute grid', () => {
    expect(shiftEndWithStart('23:30', '23:59', '15:00')).toBe('15:30');
    expect(shiftEndWithStart('09:00', '09:29', '15:00')).toBe('15:29');
  });
});
