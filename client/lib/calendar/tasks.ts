import { PLANNING_HORIZON_DAYS, type PlannerTask, type ScheduledTask } from '../scheduler';
import { expandEvents, isTaskEventId } from './events';
import type { CalendarEvent, Task, TaskRow } from './types';

type Span = { startMs: number; endMs: number };

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    duration: row.duration_minutes ?? 0,
    durationMinutes: row.duration_minutes ?? 0,
    priority: row.priority,
    energyLevel: row.energy_level,
    deadline: row.deadline,
    isFixedTime: row.is_fixed_time,
    fixedStart: row.fixed_start,
    fixedEnd: row.fixed_end,
    isSplittable: row.is_splittable,
    chunkSize: row.is_splittable ? { min: row.chunk_min, max: row.chunk_max } : null,
    color: row.color,
    isCompleted: row.is_completed,
    isDeleted: false,
    createdAt: row.created_at,
    sessions: Array.isArray(row.sessions) ? row.sessions : [],
  };
}

/** Not deleted (pending undo) and not completed. */
export function isActiveTask(t: Task): boolean {
  return !t.isDeleted && !t.isCompleted;
}

function taskMinutes(t: Task): number {
  return Number(t.durationMinutes ?? t.duration) || 0;
}

/** Tasks the planner can place: active, not fixed-time, with a duration. */
export function isPlannable(t: Task): boolean {
  return isActiveTask(t) && !t.isFixedTime && taskMinutes(t) > 0;
}

export function toPlannerTask(t: Task): PlannerTask {
  return {
    id: String(t.id),
    durationMinutes: taskMinutes(t),
    deadlineMs: t.deadline ? new Date(t.deadline).getTime() : null,
    priority: t.priority ?? 'Medium',
    energyLevel: t.energyLevel ?? 'Medium',
    chunk: t.isSplittable && (t.chunkSize?.max ?? 0) > 0
      ? { min: Number(t.chunkSize!.min) || 0, max: Number(t.chunkSize!.max) }
      : null,
  };
}

export function toScheduledTask(t: Task): ScheduledTask {
  return {
    ...toPlannerTask(t),
    sessions: (t.sessions ?? []).map(s => ({
      startMs: new Date(s.start).getTime(), endMs: new Date(s.end).getTime(),
    })),
  };
}

// Time nothing may be scheduled over: events (recurring ones expanded) and fixed-time tasks.
// All-day events don't block time.
export function fixedBusyIntervals(events: CalendarEvent[], taskList: Task[], now = Date.now()): Span[] {
  const realEvents = events.filter(e => !isTaskEventId(e.id));
  const expanded = expandEvents(realEvents, new Date(now - 86_400_000), new Date(now + (PLANNING_HORIZON_DAYS + 2) * 86_400_000));
  const busy: Span[] = [];
  for (const ev of expanded) {
    if (!ev.start_time || !ev.end_time) continue;
    if (ev.start_time.startsWith('00:00') && ev.end_time.startsWith('23:59')) continue;
    const startMs = new Date(`${ev.date}T${ev.start_time.slice(0, 5)}`).getTime();
    const endMs = new Date(`${ev.date}T${ev.end_time.slice(0, 5)}`).getTime();
    if (endMs > startMs) busy.push({ startMs, endMs });
  }
  for (const t of taskList) {
    if (!isActiveTask(t)) continue;
    if (t.isFixedTime && t.fixedStart && t.fixedEnd) {
      busy.push({ startMs: new Date(t.fixedStart).getTime(), endMs: new Date(t.fixedEnd).getTime() });
    }
  }
  return busy;
}

// The sessions of every task that isn't being re-planned. They block time and count
// toward each day's work limit.
export function otherSessions(taskList: Task[], replanning: Set<string>): Span[] {
  return taskList
    .filter(t => isPlannable(t) && !replanning.has(String(t.id)))
    .flatMap(t => toScheduledTask(t).sessions);
}

/** Changes when any field the planner looks at changes. */
export function schedulingKey(t?: Task) {
  return t && JSON.stringify([
    t.durationMinutes, t.deadline, t.priority, t.energyLevel, t.isFixedTime, t.fixedStart, t.fixedEnd, t.isSplittable, t.chunkSize,
  ]);
}
