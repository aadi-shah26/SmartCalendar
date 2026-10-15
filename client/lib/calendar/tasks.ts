import { isUpcoming, PLANNING_HORIZON_DAYS, type PlannerTask, type SessionStatus, type TrackedSession, type TrackedTask } from '../scheduler';
import { expandEvents, isTaskEventId } from './events';
import type { CalendarEvent, Task, TaskRow, TaskSession } from './types';

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

const STATUSES: SessionStatus[] = ['planned', 'done', 'partial', 'skipped'];

export function sessionFromRow(s: TaskSession): TrackedSession {
  return {
    startMs: new Date(s.start).getTime(),
    endMs: new Date(s.end).getTime(),
    ...(STATUSES.includes(s.status as SessionStatus) ? { status: s.status } : {}),
    ...(s.status === 'partial' && Number.isFinite(s.doneMinutes) ? { doneMinutes: s.doneMinutes } : {}),
    ...(s.pinned ? { pinned: true } : {}),
  };
}

/** Back to the stored shape, leaving out fields that aren't set. */
export function sessionToRow(s: TrackedSession): TaskSession {
  return {
    start: new Date(s.startMs).toISOString(),
    end: new Date(s.endMs).toISOString(),
    ...(s.status ? { status: s.status } : {}),
    ...(s.status === 'partial' && s.doneMinutes !== undefined ? { doneMinutes: s.doneMinutes } : {}),
    ...(s.pinned ? { pinned: true } : {}),
  };
}

export function toTrackedTask(t: Task): TrackedTask {
  return { ...toPlannerTask(t), sessions: (t.sessions ?? []).map(sessionFromRow) };
}

/** A task's sessions with every upcoming one dropped except pinned and under-way ones. */
export function withoutMovableSessions(t: Task, nowMs: number): Task {
  return {
    ...t,
    sessions: (t.sessions ?? []).filter(row => {
      const s = sessionFromRow(row);
      return !isUpcoming(s, nowMs) || s.pinned || s.startMs < nowMs;
    }),
  };
}

export type CheckIn =
  | { status: 'done' | 'skipped' | 'planned' }
  | { status: 'partial'; doneMinutes: number };

/** A copy of the task with one session's check-in (or pin) changed. */
export function updateSession(t: Task, index: number, change: CheckIn | { pinned: boolean }): Task {
  const sessions = (t.sessions ?? []).map((row, i): TaskSession => {
    if (i !== index) return row;
    const next: TaskSession = { ...row };
    if ('pinned' in change) {
      delete next.pinned;
      return change.pinned ? { ...next, status: next.status ?? 'planned', pinned: true } : next;
    }
    delete next.doneMinutes;
    if (change.status === 'partial') return { ...next, status: 'partial', doneMinutes: change.doneMinutes };
    return { ...next, status: change.status };
  });
  return { ...t, sessions };
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

/** How far back unanswered sessions are still asked about. */
const CHECK_IN_LOOKBACK_MS = 7 * 86_400_000;

export interface PendingCheckIn {
  taskId: string;
  index: number;
  title: string;
  session: TaskSession;
}

/** Sessions that have ended with nobody saying how they went, oldest first. */
export function pendingCheckIns(taskList: Task[], nowMs: number): PendingCheckIn[] {
  const out: PendingCheckIn[] = [];
  for (const t of taskList) {
    if (!isActiveTask(t)) continue;
    (t.sessions ?? []).forEach((row, index) => {
      const s = sessionFromRow(row);
      if (s.status === 'planned' && s.endMs <= nowMs && nowMs - s.endMs < CHECK_IN_LOOKBACK_MS) {
        out.push({ taskId: String(t.id), index, title: t.title, session: row });
      }
    });
  }
  return out.sort((a, b) => Date.parse(a.session.start) - Date.parse(b.session.start));
}

/** Changes when any field the planner looks at changes. */
export function schedulingKey(t?: Task) {
  return t && JSON.stringify([
    t.durationMinutes, t.deadline, t.priority, t.energyLevel, t.isFixedTime, t.fixedStart, t.fixedEnd, t.isSplittable, t.chunkSize,
  ]);
}
