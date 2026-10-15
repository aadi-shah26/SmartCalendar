import { describe, it, expect } from 'vitest';
import {
  formatDuration, formatEventTime, formatEventTimeRange, formatHour, getWeekStart, joinDateTime,
  monthCells, periodLabel, splitDateTime, stepDate, toDateKey, toLocalISO,
} from '../dates';

describe('date keys', () => {
  it('formats local dates', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toLocalISO(new Date(2026, 9, 14, 7, 3, 9))).toBe('2026-10-14T07:03:09');
  });
  it('finds the Sunday starting the week', () => {
    expect(toDateKey(getWeekStart(new Date(2026, 9, 14)))).toBe('2026-10-11');
    expect(toDateKey(getWeekStart(new Date(2026, 9, 11)))).toBe('2026-10-11');
  });
});

describe('time labels', () => {
  it('formats hours and times', () => {
    expect([0, 9, 12, 13].map(formatHour)).toEqual(['12 AM', '9 AM', '12 PM', '1 PM']);
    expect(['00:15', '09:30:00', '12:00', '23:59'].map(formatEventTime)).toEqual(['12:15 AM', '9:30 AM', '12:00 PM', '11:59 PM']);
  });
  it('formats compact ranges', () => {
    expect(formatEventTimeRange('09:00', '10:00')).toBe('9–10am');
    expect(formatEventTimeRange('11:30', '13:00')).toBe('11:30am–1pm');
  });
  it('formats durations', () => {
    expect([45, 60, 90].map(formatDuration)).toEqual(['45m', '1h', '1h 30m']);
  });
});

describe('date-time inputs', () => {
  it('splits and joins', () => {
    expect(splitDateTime('2026-10-14T09:30')).toEqual({ date: '2026-10-14', time: '09:30' });
    expect(splitDateTime('')).toEqual({ date: '', time: '' });
    expect(joinDateTime('2026-10-14', '09:30')).toBe('2026-10-14T09:30');
    expect(joinDateTime('', '09:30')).toBe('');
  });
});

describe('navigation', () => {
  const d = new Date(2026, 9, 14);
  it('steps by the view length', () => {
    expect(toDateKey(stepDate(d, 'Day', 1))).toBe('2026-10-15');
    expect(toDateKey(stepDate(d, 'Week', -1))).toBe('2026-10-07');
    expect(toDateKey(stepDate(d, 'Month', 1))).toBe('2026-11-14');
    expect(toDateKey(stepDate(d, 'Year', -1))).toBe('2025-10-14');
  });
  it('labels the period', () => {
    expect(periodLabel(d, 'Day')).toBe('October 14, 2026');
    expect(periodLabel(d, 'Week')).toBe('October 11 – 17, 2026');
    expect(periodLabel(d, 'Month')).toBe('October 2026');
    expect(periodLabel(d, 'Year')).toBe('2026');
  });
  it('lays out a month grid', () => {
    const cells = monthCells(2026, 9); // Oct 2026 starts on a Thursday
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, 1]);
    expect(cells[cells.length - 1]).toBe(31);
  });
});
