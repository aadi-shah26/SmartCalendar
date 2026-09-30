import { describe, expect, it } from 'vitest';
import { googleEventToRow, partsInZone, recurrenceToRRule, rowToGoogleEvent } from '../mapping';

describe('partsInZone', () => {
  it('converts an instant to wall-clock time in the given zone, not the server zone', () => {
    // 2026-10-01 01:30 UTC is still Sep 30 evening in New York (UTC-4 in October)
    expect(partsInZone('2026-10-01T01:30:00Z', 'America/New_York')).toEqual({ date: '2026-09-30', time: '21:30' });
    expect(partsInZone('2026-10-01T01:30:00Z', 'Asia/Kolkata')).toEqual({ date: '2026-10-01', time: '07:00' });
  });
  it('honours an offset in the input', () => {
    expect(partsInZone('2026-10-01T09:00:00-07:00', 'UTC')).toEqual({ date: '2026-10-01', time: '16:00' });
  });
  it('falls back to UTC on an invalid zone', () => {
    expect(partsInZone('2026-10-01T09:00:00Z', 'Not/AZone')).toEqual({ date: '2026-10-01', time: '09:00' });
  });
  it('never renders midnight as 24:00', () => {
    expect(partsInZone('2026-10-01T00:00:00Z', 'UTC').time).toBe('00:00');
  });
});

describe('googleEventToRow', () => {
  it('maps a timed event into the user zone', () => {
    const r = googleEventToRow(
      { id: 'a', etag: '"1"', summary: ' Standup ', start: { dateTime: '2026-10-01T09:00:00-04:00' }, end: { dateTime: '2026-10-01T09:30:00-04:00' } },
      'America/New_York'
    );
    expect(r).toEqual({
      kind: 'upsert',
      row: { google_event_id: 'a', google_etag: '"1"', source: 'google', title: 'Standup', description: '', date: '2026-10-01', start_time: '09:00', end_time: '09:30' },
    });
  });
  it('maps all-day events to a full-day block on their first day', () => {
    const r = googleEventToRow({ id: 'b', start: { date: '2026-10-05' }, end: { date: '2026-10-08' } }, 'UTC');
    expect(r.kind === 'upsert' && r.row).toMatchObject({ date: '2026-10-05', start_time: '00:00', end_time: '23:59' });
  });
  it('clips events that cross midnight to the end of the first day', () => {
    const r = googleEventToRow({ id: 'c', start: { dateTime: '2026-10-01T22:00:00Z' }, end: { dateTime: '2026-10-02T02:00:00Z' } }, 'UTC');
    expect(r.kind === 'upsert' && r.row).toMatchObject({ date: '2026-10-01', start_time: '22:00', end_time: '23:59' });
  });
  it('reports cancelled events as deletions and untitled ones with a placeholder', () => {
    expect(googleEventToRow({ id: 'd', status: 'cancelled' }, 'UTC')).toEqual({ kind: 'cancelled', googleEventId: 'd' });
    const r = googleEventToRow({ id: 'e', start: { date: '2026-10-05' }, end: { date: '2026-10-06' } }, 'UTC');
    expect(r.kind === 'upsert' && r.row.title).toBe('(No title)');
  });
  it('skips events with no id or no usable times', () => {
    expect(googleEventToRow({ start: { date: '2026-10-05' } }, 'UTC')).toEqual({ kind: 'skip' });
    expect(googleEventToRow({ id: 'f' }, 'UTC')).toEqual({ kind: 'skip' });
  });
});

describe('rowToGoogleEvent', () => {
  const base = { title: 'Gym', date: '2026-10-01', description: null, source: 'local' };
  it('builds a timed event with the user zone', () => {
    const b = rowToGoogleEvent({ ...base, start_time: '07:00', end_time: '08:15' }, 'America/Chicago');
    expect(b.start).toEqual({ dateTime: '2026-10-01T07:00:00', timeZone: 'America/Chicago', date: null });
    expect(b.end).toEqual({ dateTime: '2026-10-01T08:15:00', timeZone: 'America/Chicago', date: null });
    expect(b.description).toBe('');
  });
  it('round-trips an all-day block back to an all-day event (end date exclusive)', () => {
    const b = rowToGoogleEvent({ ...base, date: '2026-10-31', start_time: '00:00', end_time: '23:59' }, 'UTC');
    expect(b.start).toMatchObject({ date: '2026-10-31' });
    expect(b.end).toMatchObject({ date: '2026-11-01' });
  });
  it('repairs zero/negative length events', () => {
    const b = rowToGoogleEvent({ ...base, start_time: '10:00', end_time: '10:00' }, 'UTC');
    expect(b.end?.dateTime).toBe('2026-10-01T11:00:00');
    const late = rowToGoogleEvent({ ...base, start_time: '23:30', end_time: '23:30' }, 'UTC');
    expect(late.end?.dateTime).toBe('2026-10-01T23:59:00');
  });
  it('only sends recurrence for locally created events', () => {
    const rec = { type: 'weekly' as const, days: [3, 1] };
    expect(rowToGoogleEvent({ ...base, start_time: '07:00', end_time: '08:00', recurrence: rec }, 'UTC').recurrence)
      .toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE']);
    expect(rowToGoogleEvent({ ...base, source: 'google', start_time: '07:00', end_time: '08:00', recurrence: rec }, 'UTC'))
      .not.toHaveProperty('recurrence');
  });
  it('clears recurrence on an already-linked local event that stopped repeating', () => {
    const b = rowToGoogleEvent({ ...base, start_time: '07:00', end_time: '08:00', recurrence: null, google_event_id: 'g1' }, 'UTC');
    expect(b.recurrence).toBeNull();
  });
});

describe('recurrenceToRRule', () => {
  it('handles none, daily, weekly and junk days', () => {
    expect(recurrenceToRRule(null)).toBeNull();
    expect(recurrenceToRRule({ type: 'none' })).toBeNull();
    expect(recurrenceToRRule({ type: 'daily' })).toEqual(['RRULE:FREQ=DAILY']);
    expect(recurrenceToRRule({ type: 'weekly', days: [] })).toEqual(['RRULE:FREQ=WEEKLY']);
    expect(recurrenceToRRule({ type: 'weekly', days: [0, 6, 9, 0] })).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=SU,SA']);
  });
});
