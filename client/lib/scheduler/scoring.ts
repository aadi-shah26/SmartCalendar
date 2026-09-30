import { Interval, Priority, SchedulerTask } from './types';
import { IntervalSet } from './intervalSet';
import { windowsToIntervalSet } from './windows';

const EARLINESS_MAX_BONUS = 300.0;

function priorityMultiplier(priority: Priority | undefined): number {
  const weights: Record<Priority, number> = { low: 1.0, medium: 1.1, high: 1.25, critical: 1.5 };
  return weights[priority ?? 'medium'] ?? 1.1;
}

function deadlineUrgencyMultiplier(
  task: SchedulerTask,
  horizonStartMs: number,
  horizonEndMs: number
): number {
  const latestEnd = task.constraints?.latestEnd;
  if (!latestEnd) return 1.0;

  let deadlineMs: number;
  try {
    deadlineMs = new Date(latestEnd).getTime();
    if (Number.isNaN(deadlineMs)) return 1.0;
  } catch {
    return 1.0;
  }

  const horizonSpanMs = Math.max(horizonEndMs - horizonStartMs, 1);
  const deadlineDistanceMs = Math.max(deadlineMs - horizonStartMs, 0);
  const clampedDistanceMs = Math.min(deadlineDistanceMs, horizonSpanMs);

  // 0.35x (far deadline) .. 1.85x (immediate deadline)
  const urgencyRatio = 1.0 - clampedDistanceMs / horizonSpanMs;
  return 0.35 + urgencyRatio * 1.5;
}

function scoreEarliness(interval: Interval, horizonStartMs: number, horizonEndMs: number): number {
  const span = Math.max(horizonEndMs - horizonStartMs, 1);
  const elapsed = Math.max(interval.startMs - horizonStartMs, 0);
  if (elapsed >= span) return 0.0;
  return ((span - elapsed) / span) * EARLINESS_MAX_BONUS;
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
  const urgency = deadlineUrgencyMultiplier(task, horizonStartMs, horizonEndMs);
  const earlinessScore = scoreEarliness(interval, horizonStartMs, horizonEndMs) * urgency;
  const weight = priorityMultiplier(task.priority);
  return (preferenceScore + earlinessScore) * weight;
}
