// Dragging blocks around the day and week time grids: which blocks can move, and where a drop lands.
import { minutesOfDay } from './dates';
import { isTaskEventId } from './events';
import type { CalendarEvent } from './types';

/** Drops snap to this many minutes. */
export const SNAP_MIN = 15;
const LAST_MINUTE = 24 * 60 - 1;

/** Milliseconds since the epoch of `minutes` past local midnight on `date` ("YYYY-MM-DD"). */
export function localMs(date: string, minutes: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 0, minutes).getTime();
}

/** How long a block lasts on the grid, in minutes. */
export function blockMinutes(ev: CalendarEvent): number {
  return Math.max(0, minutesOfDay(ev.end_time) - minutesOfDay(ev.start_time));
}

/**
 * Plain one-off events and upcoming work sessions can be dragged. Recurring events, deadline
 * pills, fixed-time tasks, and sessions that have started or been checked in stay put.
 */
export function canDrag(ev: CalendarEvent, nowMs: number): boolean {
  if (ev.isTaskSession) {
    const upcoming = ev.sessionStatus === undefined || ev.sessionStatus === 'planned';
    return upcoming && localMs(ev.date, minutesOfDay(ev.start_time)) > nowMs;
  }
  if (ev.isTaskDue || isTaskEventId(ev.id)) return false;
  return !ev._recurringBaseId && (!ev.recurrence || ev.recurrence.type === 'none');
}

/**
 * Where a block starts when dropped with the pointer at `pointerMin` (minutes down the grid),
 * having been grabbed `grabOffsetMin` below its top: snapped to the grid, and kept within the day.
 */
export function dropStart(pointerMin: number, grabOffsetMin: number, durationMin: number): number {
  const latest = Math.max(0, LAST_MINUTE - durationMin);
  const snapped = Math.round((pointerMin - grabOffsetMin) / SNAP_MIN) * SNAP_MIN;
  return Math.max(0, Math.min(snapped, Math.floor(latest / SNAP_MIN) * SNAP_MIN));
}
