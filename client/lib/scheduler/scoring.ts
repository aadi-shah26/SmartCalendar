import { Interval, Priority, SchedulerTask } from './types';
import { IntervalSet } from './intervalSet';
import { windowsToIntervalSet } from './windows';

const TIMING_MAX_BONUS = 300.0;

function priorityMultiplier(priority: Priority | undefined): number {
  const weights: Record<Priority, number> = { low: 1.0, medium: 1.1, high: 1.25, critical: 1.5 };
  return weights[priority ?? 'medium'] ?? 1.1;
}

// No explicit deadline: prefer getting it done sooner rather than it drifting to the end
// of the open-ended scheduling horizon.
function scoreEarliness(interval: Interval, horizonStartMs: number, horizonEndMs: number): number {
  const span = Math.max(horizonEndMs - horizonStartMs, 1);
  const elapsed = Math.max(interval.startMs - horizonStartMs, 0);
  if (elapsed >= span) return 0.0;
  return ((span - elapsed) / span) * TIMING_MAX_BONUS;
}

// An explicit deadline means "due at/by this time", not "as soon as possible" — prefer the
// slot ending closest to the deadline over cramming the task in at the next open moment.
function scoreCloseness(interval: Interval, deadlineMs: number, horizonStartMs: number): number {
  const span = Math.max(deadlineMs - horizonStartMs, 1);
  const remaining = Math.max(deadlineMs - interval.endMs, 0);
  if (remaining >= span) return 0.0;
  return ((span - remaining) / span) * TIMING_MAX_BONUS;
}

function scorePreferredWindows(task: SchedulerTask, interval: Interval): number {
  const preferredWindows = task.constraints?.preferredWindows;
  if (!preferredWindows || preferredWindows.length === 0) return 0.0;

  const candidateSet = new IntervalSet([interval]);
  const preferredSet = windowsToIntervalSet(preferredWindows, interval);
  const overlapMs = candidateSet.intersect(preferredSet).totalDurationMs();
  const candidateDurationMs = interval.endMs - interval.startMs;
  if (candidateDurationMs <= 0) return 0.0;

  return (overlapMs / candidateDurationMs) * 100;
}

export function scoreTask(
  task: SchedulerTask,
  interval: Interval,
  horizonStartMs: number,
  horizonEndMs: number
): number {
  const preferenceScore = scorePreferredWindows(task, interval);

  const deadlineMs = task.constraints?.latestEnd ? new Date(task.constraints.latestEnd).getTime() : NaN;
  const timingScore = !Number.isNaN(deadlineMs)
    ? scoreCloseness(interval, deadlineMs, horizonStartMs)
    : scoreEarliness(interval, horizonStartMs, horizonEndMs);

  const weight = priorityMultiplier(task.priority);
  return (preferenceScore + timingScore) * weight;
}
