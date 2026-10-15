import type { ViewMode } from './types';

export const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" in local time. */
export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "YYYY-MM-DDTHH:MM:SS" in local time (no zone suffix). */
export function toLocalISO(d: Date): string {
  return `${toDateKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function getWeekStart(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** The days of a month as a calendar grid: leading nulls for the weekdays before the 1st. */
export function monthCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
}

/** "9 AM", "12 PM" — hour labels down the side of the time grid. */
export function formatHour(h: number) {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

/** Hour as "HH:00". */
export function formatTimeStr(h: number) {
  return `${pad2(h)}:00`;
}

/** "HH:MM[:SS]" → "9:30 AM". */
export function formatEventTime(timeStr: string) {
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  if (h === 0) return `12:${m} AM`;
  if (h === 12) return `12:${m} PM`;
  if (h > 12) return `${h - 12}:${m} PM`;
  return `${h}:${m} AM`;
}

/** Compact range for month cells: "9–10am", "11:30am–1pm". */
export function formatEventTimeRange(startStr: string, endStr: string) {
  const parse = (s: string) => {
    const [hStr, mStr] = s.split(':');
    const h = parseInt(hStr, 10);
    const m = mStr ?? '00';
    const period = h >= 12 ? 'pm' : 'am';
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return { h12, m, period };
  };
  const s = parse(startStr);
  const e = parse(endStr);
  const sLabel = s.m === '00' ? `${s.h12}` : `${s.h12}:${s.m}`;
  const eLabel = e.m === '00' ? `${e.h12}` : `${e.h12}:${e.m}`;
  return s.period === e.period
    ? `${sLabel}–${eLabel}${e.period}`
    : `${sLabel}${s.period}–${eLabel}${e.period}`;
}

/** Minutes as "45m", "2h", "1h 30m". */
export function formatDuration(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** A task deadline for the sidebar: "Oct 18", or "Oct 18 • 10:17 PM" when it has a time. */
export function formatDeadline(iso?: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
    const timePart = hasTime ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    return timePart ? `${datePart} • ${timePart}` : datePart;
  } catch {
    return null;
  }
}

/** "YYYY-MM-DDTHH:MM" → its date and "HH:MM" parts ('' when missing). */
export function splitDateTime(value: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const [date, time] = value.split('T');
  return { date: date ?? '', time: (time ?? '').slice(0, 5) };
}

export function joinDateTime(date: string, time: string): string {
  if (!date || !time) return '';
  return `${date}T${time}`;
}

/** The date one view-length before (-1) or after (1) `date`. */
export function stepDate(date: Date, view: ViewMode, dir: 1 | -1): Date {
  const d = new Date(date);
  if (view === 'Day') d.setDate(d.getDate() + dir);
  else if (view === 'Week') d.setDate(d.getDate() + dir * 7);
  else if (view === 'Month') d.setMonth(d.getMonth() + dir);
  else d.setFullYear(d.getFullYear() + dir);
  return d;
}

/** Toolbar title for the period on screen. */
export function periodLabel(date: Date, view: ViewMode): string {
  if (view === 'Day') return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  if (view === 'Week') {
    const ws = getWeekStart(date);
    const we = new Date(ws); we.setDate(ws.getDate() + 6);
    return `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${we.getDate()}, ${ws.getFullYear()}`;
  }
  if (view === 'Month') return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return `${date.getFullYear()}`;
}
