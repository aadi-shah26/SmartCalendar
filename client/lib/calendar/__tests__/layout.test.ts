import { describe, it, expect } from 'vitest';
import { computeEventLayouts, getEventPosition, MIN_EVENT_HEIGHT, TASK_PILL_HEIGHT, DAY_HEIGHT } from '../layout';
import type { CalendarEvent } from '../types';

const ev = (id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title: id, date: '2026-10-14', start_time: start, end_time: end, description: '', ...extra });

describe('getEventPosition', () => {
  it('places an hour-long event at 60px per hour', () => {
    expect(getEventPosition(ev('a', '09:00', '10:00'))).toEqual({ top: 540, height: 60 });
  });
  it('accepts HH:MM:SS times', () => {
    expect(getEventPosition(ev('a', '09:30:00', '10:00:00'))).toEqual({ top: 570, height: 30 });
  });
  it('draws short events at least MIN_EVENT_HEIGHT tall', () => {
    expect(getEventPosition(ev('a', '09:00', '09:15'))!.height).toBe(MIN_EVENT_HEIGHT);
    expect(getEventPosition(ev('a', '09:00', '09:05'))!.height).toBe(MIN_EVENT_HEIGHT);
  });
  it('treats an end before the start as a 15-minute event', () => {
    expect(getEventPosition(ev('a', '10:00', '09:00'))).toEqual({ top: 600, height: MIN_EVENT_HEIGHT });
  });
  it('gives task due pills a fixed height, kept inside the day', () => {
    expect(getEventPosition(ev('a', '09:00', '09:00', { isTaskDue: true }))).toEqual({ top: 540, height: TASK_PILL_HEIGHT });
    expect(getEventPosition(ev('a', '23:59', '23:59', { isTaskDue: true }))!.top).toBe(DAY_HEIGHT - TASK_PILL_HEIGHT);
  });
  it('returns null for unparseable times', () => {
    expect(getEventPosition(ev('a', '', ''))).toBeNull();
    expect(getEventPosition(ev('a', 'xx:yy', '10:00'))).toBeNull();
  });
});

describe('computeEventLayouts', () => {
  it('gives non-overlapping events the full width', () => {
    const out = computeEventLayouts([ev('a', '09:00', '10:00'), ev('b', '10:00', '11:00')]);
    expect(out.map(o => [o.ev.id, o.col, o.totalCols])).toEqual([['a', 0, 1], ['b', 0, 1]]);
  });
  it('puts overlapping events side by side', () => {
    const out = computeEventLayouts([ev('a', '09:00', '11:00'), ev('b', '10:00', '11:00')]);
    expect(out.map(o => [o.ev.id, o.col, o.totalCols])).toEqual([['a', 0, 2], ['b', 1, 2]]);
  });
  it('reuses a freed column', () => {
    const out = computeEventLayouts([ev('a', '09:00', '12:00'), ev('b', '09:00', '10:00'), ev('c', '10:30', '11:00')]);
    expect(out.map(o => [o.ev.id, o.col])).toEqual([['a', 0], ['b', 1], ['c', 1]]);
  });
  it('sorts by start and skips unplaceable events', () => {
    const out = computeEventLayouts([ev('late', '15:00', '16:00'), ev('bad', '', ''), ev('early', '08:00', '09:00')]);
    expect(out.map(o => o.ev.id)).toEqual(['early', 'late']);
  });
});
