import { Interval } from './types';
import { IntervalSet } from './intervalSet';

// Plans work sessions for tasks into the user's free time. Pure and deterministic: given the
// same tasks, busy time and clock it always produces the same plan.

export type PlannerPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type PlannerEnergy = 'Low' | 'Medium' | 'High';

export interface PlannerTask {
  id: string;
  durationMinutes: number;
  deadlineMs: number | null;
  priority: PlannerPriority;
  energyLevel: PlannerEnergy;
  /** Set when the task may be split; sizes in minutes. */
  chunk: { min: number; max: number } | null;
}

export interface PlannerPrefs {
  /** Daily window sessions may use, in minutes from local midnight. */
  dayStartMin: number;
  dayEndMin: number;
  /** Hours where high-energy work should go, in minutes from local midnight. */
  peakStartMin: number;
  peakEndMin: number;
  /** Breathing room kept free on either side of each session. */
  bufferMin: number;
  /** Most task work to plan on any one day, in minutes. Omitted = no limit. */
  maxDailyMin?: number;
  /** Tasks longer than this are split into sessions of about this length. Omitted = keep whole. */
  sessionMin?: number;
  /** Days sessions may go on, 0 = Sunday … 6 = Saturday. Omitted = every day. */
  workDays?: number[];
  /** 'steady': a little each day, balanced across days. 'asap': earliest free time first. */
  spread?: 'steady' | 'asap';
}

/** How the user wants their task work planned. Stored on their profile. */
export interface WorkPlanSettings {
  dailyMinutes: number;
  sessionMinutes: number;
  workDays: number[];
  spread: 'steady' | 'asap';
  /** Plan each task for how long tasks have really been taking, not just its estimate. */
  adjustForHistory?: boolean;
}

export const DEFAULT_WORK_PLAN: WorkPlanSettings = {
  dailyMinutes: 180,
  sessionMinutes: 60,
  workDays: [0, 1, 2, 3, 4, 5, 6],
  spread: 'steady',
};

export interface PlannedSession {
  taskId: string;
  startMs: number;
  endMs: number;
}

export interface PlanResult {
  sessions: PlannedSession[];
  unplaced: { taskId: string; reason: string }[];
  /** Tasks that were planned, but only by going over the daily limit. */
  overLimit: string[];
}

export const PLANNING_HORIZON_DAYS = 14;
const STEP_MIN = 15;
export const MIN = 60_000;
/** Beyond this distance from its old start, a moved session's distance stops mattering. */
const ANCHOR_CAP_HOURS = 48;
const PRIORITY_RANK: Record<PlannerPriority, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };

export function prefsForWorkTime(
  workTime: string | null | undefined,
  workStyle?: string | null,
  plan?: WorkPlanSettings | null,
): PlannerPrefs {
  const bufferMin = workStyle === 'solo' ? 10 : 0;
  const hours = workTime === 'night'
    ? { dayStartMin: 10 * 60, dayEndMin: 24 * 60, peakStartMin: 19 * 60, peakEndMin: 23 * 60 }
    : { dayStartMin: 8 * 60, dayEndMin: 22 * 60, peakStartMin: 9 * 60, peakEndMin: 12 * 60 };
  if (!plan) return { ...hours, bufferMin };
  return {
    ...hours,
    bufferMin,
    maxDailyMin: plan.dailyMinutes,
    sessionMin: plan.sessionMinutes,
    workDays: plan.workDays.length ? plan.workDays : DEFAULT_WORK_PLAN.workDays,
    spread: plan.spread,
  };
}

/**
 * Splits a task's duration into session lengths: the task's own chunk size when it has one,
 * otherwise the preferred session length. A task only a little over that length stays whole.
 */
export function splitIntoPieces(task: PlannerTask, sessionMin?: number): number[] {
  const total = Math.round(task.durationMinutes);
  if (total <= 0) return [];
  const own = task.chunk && task.chunk.max > 0 ? task.chunk.max : 0;
  const max = own || (sessionMin && total > sessionMin * 1.25 ? sessionMin : 0);
  if (max <= 0 || max >= total) return [total];
  const count = Math.ceil(total / max);
  const base = Math.ceil(total / count / 5) * 5;
  const pieces: number[] = [];
  let left = total;
  for (let i = 0; i < count && left > 0; i++) {
    const size = Math.min(base, left);
    pieces.push(size);
    left -= size;
  }
  return pieces;
}

export function ceilToStep(ms: number): number {
  const step = STEP_MIN * MIN;
  return Math.ceil(ms / step) * step;
}

export function localDayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addLocalDays(dayStartMs: number, days: number): number {
  const d = new Date(dayStartMs);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function dailyWindows(fromMs: number, toMs: number, startMin: number, endMin: number, workDays?: number[]): IntervalSet {
  const out: Interval[] = [];
  for (let day = localDayStart(fromMs); day < toMs; day = addLocalDays(day, 1)) {
    if (workDays && !workDays.includes(new Date(day).getDay())) continue;
    const s = Math.max(day + startMin * MIN, fromMs);
    const e = Math.min(day + endMin * MIN, toMs);
    if (s < e) out.push({ startMs: s, endMs: e });
  }
  return new IntervalSet(out);
}

function overlapMs(a: Interval, set: IntervalSet): number {
  return new IntervalSet([a]).intersect(set).totalDurationMs();
}

/** Most urgent first: earliest deadline, then highest priority, then longest. Total order. */
export function byUrgency(a: PlannerTask, b: PlannerTask): number {
  return (a.deadlineMs ?? Infinity) - (b.deadlineMs ?? Infinity)
    || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
    || b.durationMinutes - a.durationMinutes
    || a.id.localeCompare(b.id);
}

/** Minutes of task work already planned on each local day. */
export type DayLoad = Map<number, number>;

export function addLoad(load: DayLoad, s: Interval) {
  const day = localDayStart(s.startMs);
  load.set(day, (load.get(day) ?? 0) + (s.endMs - s.startMs) / MIN);
}

function loadOf(sessions: Interval[]): DayLoad {
  const load: DayLoad = new Map();
  sessions.forEach(s => addLoad(load, s));
  return load;
}

export interface SlotQuery {
  free: IntervalSet;
  peak: IntervalSet;
  lenMs: number;
  /** Bounds for this slot. */
  earliestMs: number;
  latestEndMs: number;
  /** Where "earlier is better" is measured from (the start of planning). */
  originMs: number;
  energy: PlannerEnergy;
  /** The task's other sessions, so pieces get spread across days. */
  siblings: Interval[];
  deadlineMs: number | null;
  dayLoad: DayLoad;
  /** Daily limit in minutes; Infinity for none. */
  capMin: number;
  /** Unset keeps the original behaviour: earliest first, mild preference for separate days. */
  spread?: 'steady' | 'asap';
  /** Where a session being moved used to start. Set, staying close to it beats being early. */
  anchorMs?: number;
}

/** Score lost per session of the same task already on that day. */
function siblingPenaltyFor(spread: SlotQuery['spread']): number {
  return spread === 'steady' ? 60 : spread === 'asap' ? 5 : 50;
}

/** The best free slot for one session, or null if none fits. */
export function bestSlot(q: SlotQuery): Interval | null {
  if (q.earliestMs >= q.latestEndMs) return null;
  const feasible = q.free.intersect(new IntervalSet([{ startMs: q.earliestMs, endMs: q.latestEndMs }])).toList();
  const span = Math.max(q.latestEndMs - q.originMs, 1);
  const siblingsPerDay = new Map<number, number>();
  for (const sib of q.siblings) {
    const d = localDayStart(sib.startMs);
    siblingsPerDay.set(d, (siblingsPerDay.get(d) ?? 0) + 1);
  }
  const siblingPenalty = siblingPenaltyFor(q.spread);
  const lenMin = q.lenMs / MIN;
  const steady = q.spread === 'steady';
  // Load is judged against the daily limit, or a nominal 4 hours when there is none.
  const loadScale = Number.isFinite(q.capMin) ? q.capMin : 240;
  const deadlineDay = q.deadlineMs !== null ? localDayStart(q.deadlineMs - 1) : null;

  let best: Interval | null = null;
  let bestScore = -Infinity;
  for (const gap of feasible) {
    for (let s = ceilToStep(gap.startMs); s + q.lenMs <= gap.endMs; s += STEP_MIN * MIN) {
      const day = localDayStart(s);
      const load = q.dayLoad.get(day) ?? 0;
      if (load + lenMin > q.capMin) continue;
      const slot = { startMs: s, endMs: s + q.lenMs };
      // Earlier is better: finish well ahead of the deadline rather than at it. In steady mode
      // this matters less than keeping each day's load even.
      let score = q.anchorMs !== undefined
        // A moved session should land near where the user expected it, not just anywhere earlier.
        ? -Math.min(Math.abs(s - q.anchorMs) / (60 * MIN), ANCHOR_CAP_HOURS) * 2
        : (1 - (s - q.originMs) / span) * (steady ? 25 : 100);
      const peakShare = overlapMs(slot, q.peak) / q.lenMs;
      if (q.energy === 'High') score += peakShare * 30;
      if (q.energy === 'Low') score += (1 - peakShare) * 15;
      // One session of a task per day where possible, so the work is spread out.
      score -= (siblingsPerDay.get(day) ?? 0) * siblingPenalty;
      if (steady) {
        score -= (load / loadScale) * 50;
        // Keep the deadline day itself free as slack when there are other options.
        if (day === deadlineDay) score -= 15;
      }
      if (new Date(s).getMinutes() % 30 === 0) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = slot;
      }
    }
  }
  return best;
}

/** Places every piece of one task, or returns null if they don't all fit. */
function placeTask(
  task: PlannerTask, pieces: number[], free: IntervalSet, peak: IntervalSet, dayLoad: DayLoad,
  capMin: number, startMs: number, latestEndMs: number, prefs: PlannerPrefs,
): { placed: PlannedSession[]; free: IntervalSet } | null {
  const placed: PlannedSession[] = [];
  const load = new Map(dayLoad);
  const bufMs = prefs.bufferMin * MIN;
  // Sessions of one task are interchangeable, so each may go anywhere before the deadline —
  // not only after the previous one. That lets the load-balancing fill in earlier quiet days.
  for (const minutes of pieces) {
    const best = bestSlot({
      free, peak, lenMs: minutes * MIN, earliestMs: startMs, latestEndMs, originMs: startMs,
      energy: task.energyLevel, siblings: placed, deadlineMs: task.deadlineMs,
      dayLoad: load, capMin, spread: prefs.spread,
    });
    if (!best) return null;
    placed.push({ taskId: task.id, ...best });
    addLoad(load, best);
    free = free.subtract(new IntervalSet([{ startMs: best.startMs - bufMs, endMs: best.endMs + bufMs }]));
  }
  placed.sort((a, b) => a.startMs - b.startMs);
  return { placed, free };
}

/**
 * @param tasks          tasks to (re)plan — any existing sessions for these should NOT be in `busy`
 * @param busy           time that is already taken: events, fixed-time tasks, other tasks' sessions
 * @param otherSessions  the other tasks' sessions (also in `busy`), counted toward each day's limit
 */
export function planSessions(
  tasks: PlannerTask[],
  busy: Interval[],
  prefs: PlannerPrefs,
  nowMs: number,
  horizonDays = PLANNING_HORIZON_DAYS,
  otherSessions: Interval[] = [],
): PlanResult {
  const startMs = ceilToStep(nowMs);
  const horizonEndMs = addLocalDays(localDayStart(nowMs), horizonDays + 1);
  const validBusy = busy.filter(b => b.endMs > b.startMs);
  let free = dailyWindows(startMs, horizonEndMs, prefs.dayStartMin, prefs.dayEndMin, prefs.workDays)
    .subtract(new IntervalSet(validBusy));
  const peak = dailyWindows(startMs, horizonEndMs, prefs.peakStartMin, prefs.peakEndMin);
  const capMin = prefs.maxDailyMin && prefs.maxDailyMin > 0 ? prefs.maxDailyMin : Infinity;
  const dayLoad = loadOf(otherSessions.filter(s => s.endMs > s.startMs));

  const ordered = [...tasks].sort(byUrgency);

  const sessions: PlannedSession[] = [];
  const unplaced: PlanResult['unplaced'] = [];
  const overLimit: string[] = [];

  for (const task of ordered) {
    const pieces = splitIntoPieces(task, prefs.sessionMin);
    if (pieces.length === 0) continue;
    if (task.deadlineMs !== null && task.deadlineMs <= startMs) {
      unplaced.push({ taskId: task.id, reason: 'Its deadline has already passed.' });
      continue;
    }
    const latestEndMs = Math.min(task.deadlineMs ?? horizonEndMs, horizonEndMs);

    let result = placeTask(task, pieces, free, peak, dayLoad, capMin, startMs, latestEndMs, prefs);
    // Missing a deadline is worse than a long day: if the limit is what's in the way, go over it.
    if (!result && Number.isFinite(capMin)) {
      result = placeTask(task, pieces, free, peak, dayLoad, Infinity, startMs, latestEndMs, prefs);
      if (result) overLimit.push(task.id);
    }

    if (!result) {
      unplaced.push({
        taskId: task.id,
        reason: task.deadlineMs !== null
          ? 'Not enough free time before its deadline.'
          : `Not enough free time in the next ${horizonDays} days.`,
      });
      continue;
    }
    free = result.free;
    result.placed.forEach(s => addLoad(dayLoad, s));
    sessions.push(...result.placed);
  }

  sessions.sort((a, b) => a.startMs - b.startMs);
  return { sessions, unplaced, overLimit };
}
