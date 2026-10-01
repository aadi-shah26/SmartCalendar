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
}

export interface PlannedSession {
  taskId: string;
  startMs: number;
  endMs: number;
}

export interface PlanResult {
  sessions: PlannedSession[];
  unplaced: { taskId: string; reason: string }[];
}

export const PLANNING_HORIZON_DAYS = 14;
const STEP_MIN = 15;
const MIN = 60_000;
const PRIORITY_RANK: Record<PlannerPriority, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };

export function prefsForWorkTime(workTime: string | null | undefined, workStyle?: string | null): PlannerPrefs {
  const bufferMin = workStyle === 'solo' ? 10 : 0;
  if (workTime === 'night') {
    return { dayStartMin: 10 * 60, dayEndMin: 24 * 60, peakStartMin: 19 * 60, peakEndMin: 23 * 60, bufferMin };
  }
  return { dayStartMin: 8 * 60, dayEndMin: 22 * 60, peakStartMin: 9 * 60, peakEndMin: 12 * 60, bufferMin };
}

/** Splits a task's duration into session lengths, honouring its chunk sizes when splittable. */
export function splitIntoPieces(task: PlannerTask): number[] {
  const total = Math.round(task.durationMinutes);
  if (total <= 0) return [];
  const max = task.chunk?.max ?? 0;
  if (!task.chunk || max <= 0 || max >= total) return [total];
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

function ceilToStep(ms: number): number {
  const step = STEP_MIN * MIN;
  return Math.ceil(ms / step) * step;
}

function localDayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function addLocalDays(dayStartMs: number, days: number): number {
  const d = new Date(dayStartMs);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function dailyWindows(fromMs: number, toMs: number, startMin: number, endMin: number): IntervalSet {
  const out: Interval[] = [];
  for (let day = localDayStart(fromMs); day < toMs; day = addLocalDays(day, 1)) {
    const s = Math.max(day + startMin * MIN, fromMs);
    const e = Math.min(day + endMin * MIN, toMs);
    if (s < e) out.push({ startMs: s, endMs: e });
  }
  return new IntervalSet(out);
}

function overlapMs(a: Interval, set: IntervalSet): number {
  return new IntervalSet([a]).intersect(set).totalDurationMs();
}

/**
 * @param tasks  tasks to (re)plan — any existing sessions for these should NOT be in `busy`
 * @param busy   time that is already taken: events, fixed-time tasks, other tasks' sessions
 */
export function planSessions(
  tasks: PlannerTask[],
  busy: Interval[],
  prefs: PlannerPrefs,
  nowMs: number,
  horizonDays = PLANNING_HORIZON_DAYS,
): PlanResult {
  const startMs = ceilToStep(nowMs);
  const horizonEndMs = addLocalDays(localDayStart(nowMs), horizonDays + 1);
  const validBusy = busy.filter(b => b.endMs > b.startMs);
  let free = dailyWindows(startMs, horizonEndMs, prefs.dayStartMin, prefs.dayEndMin)
    .subtract(new IntervalSet(validBusy));
  const peak = dailyWindows(startMs, horizonEndMs, prefs.peakStartMin, prefs.peakEndMin);

  const ordered = [...tasks].sort((a, b) =>
    (a.deadlineMs ?? Infinity) - (b.deadlineMs ?? Infinity)
    || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
    || b.durationMinutes - a.durationMinutes
    || a.id.localeCompare(b.id));

  const sessions: PlannedSession[] = [];
  const unplaced: PlanResult['unplaced'] = [];

  for (const task of ordered) {
    const pieces = splitIntoPieces(task);
    if (pieces.length === 0) continue;
    if (task.deadlineMs !== null && task.deadlineMs <= startMs) {
      unplaced.push({ taskId: task.id, reason: 'Its deadline has already passed.' });
      continue;
    }
    const latestEndMs = Math.min(task.deadlineMs ?? horizonEndMs, horizonEndMs);

    let freeForTask = free;
    const placed: PlannedSession[] = [];
    let earliestMs = startMs;
    let failed = false;

    for (const minutes of pieces) {
      const lenMs = minutes * MIN;
      const window = new IntervalSet([{ startMs: earliestMs, endMs: latestEndMs }]);
      const feasible = earliestMs < latestEndMs ? freeForTask.intersect(window).toList() : [];
      const span = Math.max(latestEndMs - startMs, 1);

      let best: Interval | null = null;
      let bestScore = -Infinity;
      for (const gap of feasible) {
        for (let s = ceilToStep(gap.startMs); s + lenMs <= gap.endMs; s += STEP_MIN * MIN) {
          const slot = { startMs: s, endMs: s + lenMs };
          // Earlier is better: finish well ahead of the deadline rather than at it.
          let score = (1 - (s - startMs) / span) * 100;
          const peakShare = overlapMs(slot, peak) / lenMs;
          if (task.energyLevel === 'High') score += peakShare * 30;
          if (task.energyLevel === 'Low') score += (1 - peakShare) * 15;
          // Spread pieces of one task across days instead of stacking them back-to-back.
          if (placed.some(p => localDayStart(p.startMs) === localDayStart(s))) score -= 40;
          if (new Date(s).getMinutes() % 30 === 0) score += 2;
          if (score > bestScore) {
            bestScore = score;
            best = slot;
          }
        }
      }

      if (!best) {
        failed = true;
        break;
      }
      placed.push({ taskId: task.id, ...best });
      const bufMs = prefs.bufferMin * MIN;
      freeForTask = freeForTask.subtract(new IntervalSet([{ startMs: best.startMs - bufMs, endMs: best.endMs + bufMs }]));
      earliestMs = best.endMs;
    }

    if (failed) {
      unplaced.push({
        taskId: task.id,
        reason: task.deadlineMs !== null
          ? 'Not enough free time before its deadline.'
          : `Not enough free time in the next ${horizonDays} days.`,
      });
      continue;
    }
    free = freeForTask;
    sessions.push(...placed);
  }

  sessions.sort((a, b) => a.startMs - b.startMs);
  return { sessions, unplaced };
}
