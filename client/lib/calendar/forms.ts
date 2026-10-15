// The event and task forms in the add/edit modal: their fields, how they're filled from
// existing items, and how they turn back into database rows.
import { THEME_COLOR } from './colors';
import { formatTimeStr, minutesOfDay, timeOfDay, toLocalISO } from './dates';
import type { CalendarEvent, EnergyLevel, Recurrence, RecurrenceType, Task, TaskPriority } from './types';

/** The modal's two tabs. */
export type ItemTab = 'task' | 'event';

export interface EventForm {
  title: string;
  date: string;
  start: string;
  end: string;
  description: string;
  color: string;
  recurrenceType: RecurrenceType;
  recurrenceDays: number[];
}

export interface TaskForm {
  title: string;
  description: string;
  duration: number | '';
  priority: TaskPriority;
  energyLevel: EnergyLevel;
  /** "YYYY-MM-DDTHH:MM" local, or ''. Same for fixedStart/fixedEnd. */
  deadline: string;
  isFixedTime: boolean;
  fixedStart: string;
  fixedEnd: string;
  isSplittable: boolean;
  chunkMin: number | '';
  chunkMax: number | '';
  color: string;
}

export function newEventForm(date: string, start: string, end: string, color: string): EventForm {
  return { title: '', date, start, end, description: '', color, recurrenceType: 'none', recurrenceDays: [] };
}

/** A new event lasting the hour that starts at `hour` (the last slot of the day stays 23:00). */
export function eventFormAtHour(date: string, hour: number, color: string): EventForm {
  return newEventForm(date, formatTimeStr(hour), formatTimeStr(Math.min(hour + 1, 23)), color);
}

/**
 * The new end time when the start moves: keeps the event's length, like Google Calendar.
 * An event with no positive length becomes an hour long. Never runs past 23:59; an end that
 * was cut short there gets its length rounded back up to the 15-minute grid.
 */
export function shiftEndWithStart(oldStart: string, oldEnd: string, newStart: string): string {
  let length = minutesOfDay(oldEnd) - minutesOfDay(oldStart);
  if (length <= 0) length = 60;
  else if (oldEnd.startsWith('23:59')) length = Math.ceil(length / 15) * 15;
  return timeOfDay(minutesOfDay(newStart) + length);
}

export function eventFormFromEvent(ev: CalendarEvent): EventForm {
  return {
    title: ev.title,
    date: ev.date,
    start: ev.start_time.slice(0, 5),
    end: ev.end_time.slice(0, 5),
    description: ev.description || '',
    color: ev.color ?? THEME_COLOR,
    recurrenceType: ev.recurrence?.type ?? 'none',
    recurrenceDays: ev.recurrence?.days ?? [],
  };
}

export function eventFormRecurrence(form: EventForm): Recurrence | null {
  return form.recurrenceType !== 'none'
    ? { type: form.recurrenceType, days: form.recurrenceType === 'weekly' ? form.recurrenceDays : [] }
    : null;
}

export function emptyTaskForm(color: string): TaskForm {
  return {
    title: '', description: '', duration: '', priority: 'Medium', energyLevel: 'Medium', deadline: '',
    isFixedTime: false, fixedStart: '', fixedEnd: '',
    isSplittable: false, chunkMin: '', chunkMax: '',
    color,
  };
}

const toInputDateTime = (iso: string | null) => (iso ? toLocalISO(new Date(iso)).slice(0, 16) : '');

export function taskFormFromTask(t: Task): TaskForm {
  return {
    title: t.title || '',
    description: t.description || '',
    duration: t.durationMinutes ?? t.duration ?? '',
    priority: t.priority || 'Medium',
    energyLevel: t.energyLevel || 'Medium',
    deadline: toInputDateTime(t.deadline),
    isFixedTime: Boolean(t.isFixedTime),
    fixedStart: toInputDateTime(t.fixedStart),
    fixedEnd: toInputDateTime(t.fixedEnd),
    isSplittable: Boolean(t.isSplittable),
    chunkMin: t.chunkSize?.min ?? '',
    chunkMax: t.chunkSize?.max ?? '',
    color: t.color ?? THEME_COLOR,
  };
}

/** The `tasks` columns the form controls. A fixed-time task's duration is its start-to-end span. */
export function taskRowFromForm(form: TaskForm) {
  const fixed = form.isFixedTime;
  const durationMinutes = fixed && form.fixedStart && form.fixedEnd
    ? Math.max(0, Math.round((new Date(form.fixedEnd).getTime() - new Date(form.fixedStart).getTime()) / 60000))
    : (Number(form.duration) || 0);
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    duration_minutes: durationMinutes,
    priority: form.priority,
    energy_level: form.energyLevel,
    deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
    is_fixed_time: fixed,
    fixed_start: fixed && form.fixedStart ? new Date(form.fixedStart).toISOString() : null,
    fixed_end: fixed && form.fixedEnd ? new Date(form.fixedEnd).toISOString() : null,
    is_splittable: form.isSplittable,
    chunk_min: form.isSplittable ? (Number(form.chunkMin) || 0) : null,
    chunk_max: form.isSplittable ? (Number(form.chunkMax) || 0) : null,
    color: form.color,
  };
}
