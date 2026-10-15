import { describe, it, expect } from 'vitest';
import {
  formatDuration, formatDurationLabel, formatEventTime, formatEventTimeRange, formatHour, getWeekStart, joinDateTime,
  minutesOfDay, monthCells, parseTimeInput, periodLabel, splitDateTime, stepDate, timeOfDay, toDateKey, toLocalISO,
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

describe('time entry', () => {
  it('parses typed times', () => {
    const cases: [string, string | null][] = [
      ['3pm', '15:00'], ['3:30 PM', '15:30'], ['330p', '15:30'], ['12am', '00:00'], ['12pm', '12:00'],
      ['12:15 a.m.', '00:15'], ['9', '09:00'], ['15:30', '15:30'], ['1530', '15:30'], ['0', '00:00'],
      ['13pm', null], ['0am', null], ['24', null], ['9:75', null], ['soon', null], ['', null],
    ];
    for (const [input, expected] of cases) expect([input, parseTimeInput(input)]).toEqual([input, expected]);
  });
  it('labels durations like Google Calendar', () => {
    expect([15, 45, 60, 75, 90, 120].map(formatDurationLabel)).toEqual(['15 mins', '45 mins', '1 hr', '1.25 hrs', '1.5 hrs', '2 hrs']);
  });
  it('converts between times and minutes, clamping to the day', () => {
    expect(minutesOfDay('09:30')).toBe(570);
    expect(minutesOfDay('09:30:00')).toBe(570);
    expect(timeOfDay(570)).toBe('09:30');
    expect(timeOfDay(25 * 60)).toBe('23:59');
  });
});
