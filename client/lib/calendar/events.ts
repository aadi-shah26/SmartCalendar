import { toDateKey } from './dates';
import type { CalendarEvent, Task } from './types';

const TASK_EVENT_PREFIX = 'sched-';

/** Calendar entries derived from a task have ids starting with "sched-". */
export function isTaskEventId(id: string): boolean {
  return String(id).startsWith(TASK_EVENT_PREFIX);
}

export function taskIdFromCalendarId(id: string): string {
  return String(id).slice(TASK_EVENT_PREFIX.length).split('~')[0];
}

// A task's calendar entries, derived directly from the task's own fields. Fixed start/end
// (time the user committed to) renders as a real block. Otherwise a deadline is a fixed-size
// pill at the due time, and each planned work session is its own (striped) block. All ids
// start with "sched-" + task id; sessions add "~s<n>" so they stay unique.
export function computeTaskCalendarEvents(t: Task): CalendarEvent[] {
  if (t.isFixedTime && t.fixedStart && t.fixedEnd) {
    const s = new Date(t.fixedStart);
    const e = new Date(t.fixedEnd);
    return [{
      id: `${TASK_EVENT_PREFIX}${t.id}`,
      title: t.title,
      date: toDateKey(s),
      start_time: s.toTimeString().slice(0, 8),
      end_time: e.toTimeString().slice(0, 8),
      description: 'Fixed task',
      color: t.color,
    }];
  }

  const out: CalendarEvent[] = [];
  if (t.deadline) {
    const due = new Date(t.deadline);
    const dueTime = due.toTimeString().slice(0, 8);
    out.push({
      id: `${TASK_EVENT_PREFIX}${t.id}`,
      title: t.title,
      date: toDateKey(due),
      start_time: dueTime,
      end_time: dueTime,
      description: '',
      color: t.color,
      isTaskDue: true,
      taskDurationMin: t.durationMinutes || t.duration || 0,
    });
  }
  (t.sessions ?? []).forEach((sess, i) => {
    const s = new Date(sess.start);
    const e = new Date(sess.end);
    if (!(e > s)) return;
    out.push({
      id: `${TASK_EVENT_PREFIX}${t.id}~s${i}`,
      title: t.title,
      date: toDateKey(s),
      start_time: s.toTimeString().slice(0, 8),
      end_time: e.toTimeString().slice(0, 8),
      description: 'Work session',
      color: t.color,
      isTaskSession: true,
      sessionIndex: i,
      sessionStatus: sess.status,
      sessionPinned: !!sess.pinned,
    });
  });
  return out;
}

/** Repeats each recurring event onto every matching day in [windowStart, windowEnd]. */
export function expandEvents(rawEvents: CalendarEvent[], windowStart: Date, windowEnd: Date): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  for (const ev of rawEvents) {
    const rec = ev.recurrence;
    if (!rec || rec.type === 'none') { result.push(ev); continue; }
    const base = new Date(ev.date);
    const loopStart = base > windowStart ? base : new Date(windowStart);
    const d = new Date(loopStart);
    while (d <= windowEnd) {
      const include = rec.type === 'daily' || (rec.type === 'weekly' && (rec.days ?? []).includes(d.getDay()));
      if (include)
        result.push({ ...ev, id: `${ev.id}_${toDateKey(d)}`, date: toDateKey(d), _recurringBaseId: ev.id });
      d.setDate(d.getDate() + 1);
    }
  }
  return result;
}

/** Earliest start first; ties go to whichever ends first. Times are "HH:MM", so text order works. */
export function byStartTime(a: CalendarEvent, b: CalendarEvent) {
  return (a.start_time ?? '').localeCompare(b.start_time ?? '') || (a.end_time ?? '').localeCompare(b.end_time ?? '');
}

/** Soonest deadline first; tasks without one go last, newest first as before. */
export function byDeadline(a: { deadline?: string | null }, b: { deadline?: string | null }) {
  const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
  const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
  return da === db ? 0 : da < db ? -1 : 1;
}
