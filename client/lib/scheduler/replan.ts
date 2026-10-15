import { Interval } from './types';
import { IntervalSet } from './intervalSet';
import {
  addLocalDays, addLoad, bestSlot, byUrgency, ceilToStep, dailyWindows, localDayStart, splitIntoPieces,
  MIN, PLANNING_HORIZON_DAYS, type DayLoad, type PlannerPrefs, type PlannerTask, type SlotQuery,
} from './planner';

// Replanning: keeps each task's planned work in step with what actually happened. When a session
// is missed, cut short, or clashes with something new, the work left over is put back into free
// time, moving as little else as possible. Pure and deterministic, like the planner.

/**
 * What became of a work session. Sessions saved before check-ins existed have no status and are
 * taken as done once they've ended, so existing plans don't suddenly sprout extra work.
 */
export type SessionStatus = 'planned' | 'done' | 'partial' | 'skipped';

export interface TrackedSession extends Interval {
  status?: SessionStatus;
  /** For 'partial': how much of it got done. */
  doneMinutes?: number;
  /** Placed by the user: never moved, shortened or removed by replanning. */
  pinned?: boolean;
}

export interface TrackedTask extends PlannerTask {
  sessions: TrackedSession[];
}

/**
 * How long an ended session that nobody checked in on still counts as done. After that, for a
 * task with a deadline, it counts as missed and its work is planned again: missing a deadline
 * because of a wrong guess is worse than one extra session. Tasks without a deadline keep the
 * benefit of the doubt, so ignoring check-ins never piles work up.
 */
export const CHECK_IN_GRACE_MS = 24 * 60 * MIN;
/** Sessions starting this soon aren't moved aside for other work. */
export const FREEZE_MS = 30 * MIN;
/** At most this many sessions get moved aside for more urgent work in one replan. */
export const MAX_DISPLACEMENTS = 8;

const lengthMin = (s: Interval) => (s.endMs - s.startMs) / MIN;

/** Planned (or from before check-ins) and not over yet: in progress or still to come. */
export function isUpcoming(s: TrackedSession, nowMs: number): boolean {
  return (s.status === undefined || s.status === 'planned') && s.endMs > nowMs;
}

/** Has started, and nobody has said yet whether it happened. */
export function awaitsCheckIn(s: TrackedSession, nowMs: number): boolean {
  return s.status === 'planned' && s.startMs < nowMs;
}

/** A session the user said they can't make, that hasn't happened yet: time to keep clear. */
function isBlocked(s: TrackedSession, nowMs: number): boolean {
  return s.status === 'skipped' && s.endMs > nowMs;
}

/** Minutes of the task's work this session accounts for. */
export function creditedMinutes(s: TrackedSession, task: Pick<PlannerTask, 'deadlineMs'>, nowMs: number): number {
  const len = lengthMin(s);
  switch (s.status) {
    case 'done': return len;
    case 'partial': return Math.min(Math.max(s.doneMinutes ?? 0, 0), len);
    case 'skipped': return 0;
    case 'planned':
      if (s.endMs > nowMs) return 0;
      return task.deadlineMs === null || nowMs - s.endMs < CHECK_IN_GRACE_MS ? len : 0;
    default:
      return s.endMs <= nowMs ? len : 0;
  }
}

/** Work still to do on a task, in whole minutes. */
export function remainingMinutes(task: TrackedTask, nowMs: number): number {
  const done = task.sessions.reduce((n, s) => n + creditedMinutes(s, task, nowMs), 0);
  return Math.max(0, Math.round(task.durationMinutes - done));
}

/** Remaining work not yet covered by an upcoming session. Negative when more is planned than needed. */
export function shortfallMinutes(task: TrackedTask, nowMs: number): number {
  const upcoming = task.sessions.filter(s => isUpcoming(s, nowMs)).reduce((n, s) => n + lengthMin(s), 0);
  return Math.round(remainingMinutes(task, nowMs) - upcoming);
}

export interface AtRisk {
  taskId: string;
  /** Work that has no session to go in. */
  minutes: number;
  reason: string;
}

/** Tasks with work left that isn't planned anywhere, and why. */
export function atRiskTasks(tasks: TrackedTask[], nowMs: number, horizonDays = PLANNING_HORIZON_DAYS): AtRisk[] {
  const startMs = ceilToStep(nowMs);
  const out: AtRisk[] = [];
  for (const task of [...tasks].sort(byUrgency)) {
    const minutes = shortfallMinutes(task, nowMs);
    if (minutes <= 0) continue;
    const reason = task.deadlineMs === null
      ? `Not enough free time in the next ${horizonDays} days.`
      : task.deadlineMs <= startMs ? 'Its deadline has passed.' : 'Not enough free time before its deadline.';
    out.push({ taskId: task.id, minutes, reason });
  }
  return out;
}

export interface SessionChange {
  taskId: string;
  kind: 'moved' | 'added' | 'removed' | 'shortened';
  /** Where it was before this replan; null for a new session. */
  from: Interval | null;
  /** Where it is now; null when it was removed. */
  to: Interval | null;
  /** Set when it was moved aside to make room for this (more urgent) task. */
  displacedBy?: string;
}

export interface ReflowResult {
  /** The full new session list of every task that changed. */
  changed: Record<string, TrackedSession[]>;
  changes: SessionChange[];
  atRisk: AtRisk[];
  /** Tasks that only fit by going over the daily limit. */
  overLimit: string[];
}

/** An upcoming session during a replan. */
interface Slot {
  taskId: string;
  iv: Interval;
  pinned: boolean;
  /** Kept as is: pinned, or already under way. */
  frozen: boolean;
  /** Where it was when the replan started; null for one created by it. */
  origin: Interval | null;
  displacedBy?: string;
}

/** Work that needs a slot. */
interface Need {
  taskId: string;
  lenMs: number;
  /** Where the session used to be, if it is being moved. */
  origin: Interval | null;
  displacedBy?: string;
}

const sameInterval = (a: Interval | null, b: Interval | null) =>
  a === b || (!!a && !!b && a.startMs === b.startMs && a.endMs === b.endMs);

function sameSessions(a: TrackedSession[], b: TrackedSession[]): boolean {
  return a.length === b.length && a.every((s, i) => sameInterval(s, b[i])
    && s.status === b[i].status && s.doneMinutes === b[i].doneMinutes && !!s.pinned === !!b[i].pinned);
}

const byStart = (a: Interval, b: Interval) => a.startMs - b.startMs || a.endMs - b.endMs;

/**
 * Brings every task's upcoming sessions in line with its remaining work and the busy time:
 *  - sessions that clash with busy time, or with a more urgent task's session, are moved,
 *    staying close to where they were;
 *  - work left over from missed or partly done sessions gets new sessions, earliest good slot first;
 *  - sessions no longer needed (more got done than planned, or the task got shorter) are removed,
 *    latest first.
 * If free time runs out before a deadline, a less urgent task's session can be moved aside, then
 * the daily limit is exceeded, and only then is the work reported as at risk. Pinned sessions,
 * ones already under way, and anything in the past are never touched. Running it on its own
 * output changes nothing.
 *
 * @param busy  fixed busy time only: events and fixed-time tasks (not sessions)
 */
export function reflow(
  tasks: TrackedTask[],
  busy: Interval[],
  prefs: PlannerPrefs,
  nowMs: number,
  horizonDays = PLANNING_HORIZON_DAYS,
): ReflowResult {
  const startMs = ceilToStep(nowMs);
  const horizonEndMs = addLocalDays(localDayStart(nowMs), horizonDays + 1);
  const bufMs = prefs.bufferMin * MIN;
  const capMin = prefs.maxDailyMin && prefs.maxDailyMin > 0 ? prefs.maxDailyMin : Infinity;
  const busySet = new IntervalSet(busy.filter(b => b.endMs > b.startMs));
  const windows = dailyWindows(startMs, horizonEndMs, prefs.dayStartMin, prefs.dayEndMin, prefs.workDays);
  const peak = dailyWindows(startMs, horizonEndMs, prefs.peakStartMin, prefs.peakEndMin);

  const ordered = [...tasks].sort(byUrgency);
  const rank = new Map(ordered.map((t, i) => [t.id, i]));
  const taskById = new Map(ordered.map(t => [t.id, t]));

  // Sessions that are over, checked in on, or skipped: kept exactly as they are.
  const history = new Map<string, TrackedSession[]>();
  const blocked: Interval[] = [];
  let slots: Slot[] = [];
  const clashing = new Map<string, Interval[]>();

  // Pinned and in-progress sessions claim their time first; the rest in order of urgency.
  let claimed = IntervalSet.empty();
  const pending: { task: TrackedTask; s: TrackedSession }[] = [];
  for (const task of ordered) {
    const past: TrackedSession[] = [];
    for (const s of task.sessions) {
      if (!(s.endMs > s.startMs)) continue; // malformed: dropped
      if (isBlocked(s, nowMs)) blocked.push(s);
      if (!isUpcoming(s, nowMs)) { past.push(s); continue; }
      const iv = { startMs: s.startMs, endMs: s.endMs };
      if (s.pinned || s.startMs < nowMs) {
        slots.push({ taskId: task.id, iv, pinned: !!s.pinned, frozen: true, origin: iv });
        claimed = claimed.union(new IntervalSet([iv]));
      } else {
        pending.push({ task, s });
      }
    }
    history.set(task.id, past);
  }
  for (const { task, s } of pending.sort((a, b) => rank.get(a.task.id)! - rank.get(b.task.id)! || byStart(a.s, b.s))) {
    const iv = { startMs: s.startMs, endMs: s.endMs };
    const one = new IntervalSet([iv]);
    if (!one.intersect(busySet).isEmpty() || !one.intersect(claimed).isEmpty()) {
      clashing.set(task.id, [...(clashing.get(task.id) ?? []), iv]);
    } else {
      slots.push({ taskId: task.id, iv, pinned: false, frozen: false, origin: iv });
      claimed = claimed.union(one);
    }
  }

  const changes: SessionChange[] = [];
  const needs: Need[] = [];

  // Match each task's upcoming sessions to its remaining work.
  for (const task of ordered) {
    let surplus = -shortfallMinutes(task, nowMs);
    const clashes = [...(clashing.get(task.id) ?? [])].sort(byStart).map(iv => ({ origin: iv, lenMs: iv.endMs - iv.startMs }));
    // Too much planned: trim clashing sessions first (they'd have to move anyway), then movable
    // ones, latest first. Where only part of a session is extra, it gets shorter.
    const trimOrder = [
      ...[...clashes].reverse().map(c => ({ c, sl: undefined as Slot | undefined })),
      ...slots.filter(sl => sl.taskId === task.id && !sl.frozen).sort((x, y) => byStart(y.iv, x.iv)).map(sl => ({ c: undefined, sl })),
    ];
    for (const { c, sl } of trimOrder) {
      if (surplus <= 0) break;
      const lenMin = c ? c.lenMs / MIN : lengthMin(sl!.iv);
      if (lenMin <= surplus) {
        surplus -= lenMin;
        if (c) clashes.splice(clashes.indexOf(c), 1);
        else slots = slots.filter(x => x !== sl);
        changes.push({ taskId: task.id, kind: 'removed', from: c ? c.origin : sl!.origin, to: null });
      } else {
        if (c) c.lenMs -= surplus * MIN;
        else sl!.iv = { startMs: sl!.iv.startMs, endMs: sl!.iv.endMs - surplus * MIN };
        surplus = 0;
      }
    }
    for (const c of clashes) needs.push({ taskId: task.id, lenMs: c.lenMs, origin: c.origin });
    if (surplus < 0) {
      for (const minutes of splitIntoPieces({ ...task, durationMinutes: -surplus }, prefs.sessionMin)) {
        needs.push({ taskId: task.id, lenMs: minutes * MIN, origin: null });
      }
    }
  }

  // Busy, blocked, and taken time (with breathing room) is off limits.
  const freeTime = (except?: Slot) => windows
    .subtract(busySet)
    .subtract(new IntervalSet(blocked))
    .subtract(new IntervalSet(slots.filter(sl => sl !== except)
      .map(sl => ({ startMs: sl.iv.startMs - bufMs, endMs: sl.iv.endMs + bufMs }))));

  const dayLoad = (except?: Slot): DayLoad => {
    const load: DayLoad = new Map();
    for (const list of history.values()) list.filter(s => s.status !== 'skipped').forEach(s => addLoad(load, s));
    slots.filter(sl => sl !== except).forEach(sl => addLoad(load, sl.iv));
    return load;
  };

  const siblingsOf = (taskId: string, except?: Slot): Interval[] => [
    ...(history.get(taskId) ?? []).filter(s => s.status !== 'skipped'),
    ...slots.filter(sl => sl.taskId === taskId && sl !== except).map(sl => sl.iv),
  ];

  const overLimit = new Set<string>();
  let displacements = 0;
  const queue = [...needs];

  const urgencyOf = (n: Need) => rank.get(n.taskId)!;
  while (queue.length) {
    // Most urgent need first; among equals, the order they were added.
    let pick = 0;
    for (let i = 1; i < queue.length; i++) if (urgencyOf(queue[i]) < urgencyOf(queue[pick])) pick = i;
    const need = queue.splice(pick, 1)[0];
    const task = taskById.get(need.taskId)!;
    const latestEndMs = Math.min(task.deadlineMs ?? horizonEndMs, horizonEndMs);
    const deadlinePassed = task.deadlineMs !== null && task.deadlineMs <= startMs;

    const query = (except?: Slot, cap = capMin): SlotQuery => ({
      free: freeTime(except), peak, lenMs: need.lenMs, earliestMs: startMs, latestEndMs, originMs: startMs,
      energy: task.energyLevel, siblings: siblingsOf(task.id), deadlineMs: task.deadlineMs,
      dayLoad: dayLoad(except), capMin: cap, spread: prefs.spread,
      anchorMs: need.origin ? need.origin.startMs : undefined,
    });

    let to = deadlinePassed ? null : bestSlot(query());
    let victim: Slot | undefined;

    // No room: move a less urgent task's session aside, least urgent first.
    if (!to && !deadlinePassed && displacements < MAX_DISPLACEMENTS) {
      const candidates = slots
        .filter(sl => !sl.frozen && rank.get(sl.taskId)! > rank.get(task.id)!
          && sl.iv.startMs >= nowMs + FREEZE_MS && sl.iv.startMs < latestEndMs)
        .sort((a, b) => rank.get(b.taskId)! - rank.get(a.taskId)! || b.iv.startMs - a.iv.startMs);
      for (const c of candidates) {
        const slot = bestSlot(query(c));
        if (slot) { to = slot; victim = c; break; }
      }
    }
    if (!to && !deadlinePassed && Number.isFinite(capMin)) {
      to = bestSlot(query(undefined, Infinity));
      if (to) overLimit.add(task.id);
    }

    if (!to) {
      if (need.origin) changes.push({ taskId: task.id, kind: 'removed', from: need.origin, to: null, displacedBy: need.displacedBy });
      continue;
    }
    if (victim) {
      displacements++;
      slots = slots.filter(sl => sl !== victim);
      queue.push({ taskId: victim.taskId, lenMs: victim.iv.endMs - victim.iv.startMs, origin: victim.origin ?? victim.iv, displacedBy: task.id });
    }
    slots.push({ taskId: task.id, iv: to, pinned: false, frozen: false, origin: need.origin, displacedBy: need.displacedBy });
  }

  // Report what moved, appeared, or got shorter.
  for (const sl of slots) {
    if (sl.origin === null) changes.push({ taskId: sl.taskId, kind: 'added', from: null, to: sl.iv });
    else if (sl.iv.startMs === sl.origin.startMs && sl.iv.endMs !== sl.origin.endMs) changes.push({ taskId: sl.taskId, kind: 'shortened', from: sl.origin, to: sl.iv });
    else if (!sameInterval(sl.iv, sl.origin)) changes.push({ taskId: sl.taskId, kind: 'moved', from: sl.origin, to: sl.iv, displacedBy: sl.displacedBy });
  }

  const changed: ReflowResult['changed'] = {};
  const finalTasks: TrackedTask[] = [];
  for (const task of ordered) {
    const before = task.sessions;
    const pinnedOrUnderway = new Map(before.filter(s => isUpcoming(s, nowMs)).map(s => [`${s.startMs}-${s.endMs}`, s]));
    const upcoming: TrackedSession[] = slots.filter(sl => sl.taskId === task.id).map(sl => {
      // Unchanged sessions keep their own fields (a legacy one keeps having no status).
      const original = sl.origin && sameInterval(sl.iv, sl.origin) ? pinnedOrUnderway.get(`${sl.iv.startMs}-${sl.iv.endMs}`) : undefined;
      if (original) return original;
      return { startMs: sl.iv.startMs, endMs: sl.iv.endMs, status: 'planned' as const, ...(sl.pinned ? { pinned: true } : {}) };
    });
    const after = [...(history.get(task.id) ?? []), ...upcoming].sort(byStart);
    if (!sameSessions(after, [...before].sort(byStart))) changed[task.id] = after;
    finalTasks.push({ ...task, sessions: after });
  }

  changes.sort((a, b) => (a.from ?? a.to)!.startMs - (b.from ?? b.to)!.startMs);
  return { changed, changes, atRisk: atRiskTasks(finalTasks, nowMs, horizonDays), overLimit: [...overLimit] };
}

/**
 * For a full "plan my week": what to keep of a task's sessions (the past, pinned, under way, and
 * skipped ones) and how many minutes of new sessions it needs on top.
 */
export function replanBasis(task: TrackedTask, nowMs: number): { keep: TrackedSession[]; needMinutes: number } {
  const keep = task.sessions.filter(s => s.endMs > s.startMs && (!isUpcoming(s, nowMs) || s.pinned || s.startMs < nowMs));
  const keptUpcoming = keep.filter(s => isUpcoming(s, nowMs)).reduce((n, s) => n + lengthMin(s), 0);
  return { keep, needMinutes: Math.max(0, Math.round(remainingMinutes(task, nowMs) - keptUpcoming)) };
}
