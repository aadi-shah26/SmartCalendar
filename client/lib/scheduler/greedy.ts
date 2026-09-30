import { Interval, Priority, SchedulerTask, TaskPlacement } from './types';
import { IntervalSet } from './intervalSet';
import { findAllowedIntervals } from './windows';
import { scoreTask } from './scoring';

const STEP_MS = 15 * 60 * 1000;
const PRIORITY_RANK: Record<Priority, number> = { low: 1, medium: 2, high: 3, critical: 4 };

interface PreparedTask {
  task: SchedulerTask;
  allowedIntervals: IntervalSet;
  flexibilityScore: number;
}

function prepareTask(task: SchedulerTask, horizon: Interval): PreparedTask {
  const allowedIntervals = findAllowedIntervals(task.constraints, horizon);
  const durationMs = task.durationMinutes * 60 * 1000;
  const totalAllowed = allowedIntervals.totalDurationMs();
  const flexibilityScore = totalAllowed === 0 ? Infinity : totalAllowed / durationMs;
  return { task, allowedIntervals, flexibilityScore };
}

function generateDomain(task: SchedulerTask, feasible: IntervalSet, stepMs = STEP_MS): Interval[] {
  const durationMs = task.durationMinutes * 60 * 1000;
  const domain: Interval[] = [];

  for (const interval of feasible.toList()) {
    const length = interval.endMs - interval.startMs;
    if (length < durationMs) continue;

    const latestStart = interval.endMs - durationMs;
    let startMs = interval.startMs;
    while (startMs <= latestStart) {
      domain.push({ startMs, endMs: startMs + durationMs });
      startMs += stepMs;
    }
  }

  return domain;
}

export interface GreedyScheduleOptions {
  /** Gap enforced on either side of each placed task, in ms (e.g. for a "solo" work style that wants breathing room between tasks). */
  bufferMs?: number;
}

export interface GreedyScheduleResult {
  placements: TaskPlacement[];
  status: string;
  unplacedTaskIds: string[];
}

export function scheduleTasksGreedy(
  tasks: SchedulerTask[],
  horizon: Interval,
  options: GreedyScheduleOptions = {}
): GreedyScheduleResult {
  const bufferMs = options.bufferMs ?? 0;
  let free = new IntervalSet([horizon]);
  const placements: TaskPlacement[] = [];
  const unplacedRequired: string[] = [];
  const unplacedTaskIds: string[] = [];

  const prepared = tasks.map(t => prepareTask(t, horizon));
  const ordered = [...prepared].sort((a, b) => {
    const reqA = a.task.requirement === 'required' ? 0 : 1;
    const reqB = b.task.requirement === 'required' ? 0 : 1;
    if (reqA !== reqB) return reqA - reqB;
    if (a.flexibilityScore !== b.flexibilityScore) return a.flexibilityScore - b.flexibilityScore;
    return PRIORITY_RANK[b.task.priority] - PRIORITY_RANK[a.task.priority];
  });

  for (const pt of ordered) {
    const feasible = pt.allowedIntervals.intersect(free);
    const domain = generateDomain(pt.task, feasible);

    if (domain.length === 0) {
      if (pt.task.requirement === 'required') unplacedRequired.push(pt.task.id);
      unplacedTaskIds.push(pt.task.id);
      continue;
    }

    let best = domain[0];
    let bestScore = -Infinity;
    for (const slot of domain) {
      const s = scoreTask(pt.task, slot, horizon.startMs, horizon.endMs);
      if (s > bestScore) {
        bestScore = s;
        best = slot;
      }
    }

    placements.push({ task: pt.task, interval: best });
    const busy: Interval = {
      startMs: best.startMs - bufferMs,
      endMs: best.endMs + bufferMs,
    };
    free = free.subtract(new IntervalSet([busy]));
  }

  const status =
    unplacedRequired.length > 0
      ? `GREEDY_PARTIAL (${unplacedRequired.length} required unplaced)`
      : 'GREEDY_OK';

  return { placements, status, unplacedTaskIds };
}
