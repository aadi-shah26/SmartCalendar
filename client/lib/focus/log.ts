// Saving focus time to the task it was for, as work sessions, so the planner and the
// learning-from-history numbers know the work happened.
import type { TaskSession } from '../calendar/types';

const MIN = 60_000;

/**
 * The task's sessions after `focusedMin` minutes of focus ending at `nowMs`.
 *
 * Started from a planned session (`sessionStart`) that has begun: that session becomes done, or
 * partly done with the minutes added to any already recorded; focus beyond its length is logged
 * as an extra done session. Otherwise the focus is logged as a done session ending now.
 */
export function logFocus(sessions: TaskSession[], focusedMin: number, nowMs: number, sessionStart?: string | null): TaskSession[] {
  const minutes = Math.round(focusedMin);
  if (minutes <= 0) return sessions;
  // Only a session that has started is checked off. Working ahead of one leaves it planned:
  // the focus is logged as its own session and replanning trims the planned work to match.
  const index = sessionStart ? sessions.findIndex(s => s.start === sessionStart && Date.parse(s.start) <= nowMs) : -1;
  let extra = minutes;
  let next = sessions;

  if (index >= 0) {
    const s = sessions[index];
    const len = Math.round((Date.parse(s.end) - Date.parse(s.start)) / MIN);
    const already = s.status === 'done' ? len : s.status === 'partial' ? Math.min(s.doneMinutes ?? 0, len) : 0;
    const total = already + minutes;
    const updated: TaskSession = { start: s.start, end: s.end, ...(s.pinned ? { pinned: true } : {}),
      ...(total >= len ? { status: 'done' } : { status: 'partial', doneMinutes: total }) };
    next = sessions.map((x, i) => (i === index ? updated : x));
    extra = Math.max(0, total - len);
  }

  if (extra <= 0) return next;
  const logged: TaskSession = { start: new Date(nowMs - extra * MIN).toISOString(), end: new Date(nowMs).toISOString(), status: 'done' };
  return [...next, logged].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
