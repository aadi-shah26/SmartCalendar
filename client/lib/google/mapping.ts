import type { calendar_v3 } from 'googleapis';

// Pure conversion between this app's `events` rows and Google Calendar events.
// No network or env access, so it behaves identically locally and on a UTC server.

export interface EventRow {
  id?: number | string;
  title: string;
  date: string;              // YYYY-MM-DD
  start_time: string | null; // HH:MM
  end_time: string | null;   // HH:MM
  description: string | null;
  recurrence?: { type: 'none' | 'daily' | 'weekly'; days?: number[] } | null;
  google_event_id?: string | null;
  source?: string | null;
}

export interface ImportedRow {
  google_event_id: string;
  google_etag: string;
  source: 'google';
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  description: string;
}

export type ImportResult =
  | { kind: 'upsert'; row: ImportedRow }
  | { kind: 'cancelled'; googleEventId: string }
  | { kind: 'skip' };

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock date (YYYY-MM-DD) and time (HH:MM) of an instant in the given IANA zone. */
export function partsInZone(iso: string, tz: string): { date: string; time: string } {
  const zone = isValidTimeZone(tz) ? tz : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export const ALL_DAY_START = '00:00';
export const ALL_DAY_END = '23:59';

/** Google event -> local row. Times are expressed in `tz` (the user's zone), never the server's. */
export function googleEventToRow(ev: calendar_v3.Schema$Event, tz: string): ImportResult {
  if (!ev.id) return { kind: 'skip' };
  if (ev.status === 'cancelled') return { kind: 'cancelled', googleEventId: ev.id };

  const base = {
    google_event_id: ev.id,
    google_etag: ev.etag ?? '',
    source: 'google' as const,
    title: ev.summary?.trim() || '(No title)',
    description: ev.description ?? '',
  };

  // All-day events carry a bare date. Multi-day all-day events show on their first day only
  // (the local events table models a single day per row).
  if (ev.start?.date) {
    return { kind: 'upsert', row: { ...base, date: ev.start.date, start_time: ALL_DAY_START, end_time: ALL_DAY_END } };
  }

  if (ev.start?.dateTime && ev.end?.dateTime) {
    const start = partsInZone(ev.start.dateTime, tz);
    const end = partsInZone(ev.end.dateTime, tz);
    // Events that run past midnight are clipped to the end of their first day.
    const endTime = end.date === start.date ? end.time : ALL_DAY_END;
    return { kind: 'upsert', row: { ...base, date: start.date, start_time: start.time, end_time: endTime } };
  }

  return { kind: 'skip' };
}

const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function recurrenceToRRule(rec: EventRow['recurrence']): string[] | null {
  if (!rec || rec.type === 'none') return null;
  if (rec.type === 'daily') return ['RRULE:FREQ=DAILY'];
  const days = [...new Set(rec.days ?? [])].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  return [days.length ? `RRULE:FREQ=WEEKLY;BYDAY=${days.map(d => RRULE_DAYS[d]).join(',')}` : 'RRULE:FREQ=WEEKLY'];
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

/**
 * Local row -> body for events.insert / events.patch.
 *
 * For patch, the unused start/end fields are explicitly nulled so an event can switch between
 * all-day and timed. `recurrence` is only sent for events created locally: instances that were
 * imported from Google are expanded occurrences and cannot take a recurrence rule.
 */
export function rowToGoogleEvent(row: EventRow, tz: string): calendar_v3.Schema$Event {
  const zone = isValidTimeZone(tz) ? tz : 'UTC';
  const body: calendar_v3.Schema$Event = {
    summary: row.title,
    description: row.description ?? '',
  };

  const allDay = !row.start_time || (row.start_time === ALL_DAY_START && row.end_time === ALL_DAY_END);
  if (allDay) {
    body.start = { date: row.date, dateTime: null, timeZone: null };
    body.end = { date: addDays(row.date, 1), dateTime: null, timeZone: null };
  } else {
    const startMin = toMinutes(row.start_time!);
    let endMin = row.end_time ? toMinutes(row.end_time) : startMin + 60;
    // Google rejects zero/negative-length events; fall back to one hour, clipped to the day.
    if (endMin <= startMin) endMin = Math.min(startMin + 60, 23 * 60 + 59);
    body.start = { dateTime: `${row.date}T${fromMinutes(startMin)}:00`, timeZone: zone, date: null };
    body.end = { dateTime: `${row.date}T${fromMinutes(endMin)}:00`, timeZone: zone, date: null };
  }

  if ((row.source ?? 'local') === 'local') {
    const rrule = recurrenceToRRule(row.recurrence);
    if (rrule) body.recurrence = rrule;
    else if (row.google_event_id) body.recurrence = null; // recurrence removed locally
  }

  return body;
}
