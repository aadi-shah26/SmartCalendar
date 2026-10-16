// Learning from history: how long finished tasks really took compared to their first estimate,
// so the planner can allow for it ("your tasks usually take about 1.4× what you guess").
import type { Task, TaskSession } from './types';

/** Fewer finished tasks than this isn't enough to go on. */
export const MIN_SAMPLES = 3;
/** Only the most recent finished tasks count, so the ratio follows how the user works now. */
export const RECENT_SAMPLES = 10;
const MIN_RATIO = 0.5;
const MAX_RATIO = 2;

export interface EstimateHistory {
  /** Typical actual ÷ estimated time, rounded to 0.05. */
  ratio: number;
  /** How many finished tasks it's based on. */
  samples: number;
}

/**
 * Minutes of work the task's sessions account for at `nowMs`, used when the task is completed.
 * Sessions nobody checked in on count as done once they've ended; one under way counts so far.
 */
export function workedMinutes(sessions: TaskSession[], nowMs: number): number {
  let total = 0;
  for (const s of sessions) {
    const start = Date.parse(s.start);
    const end = Date.parse(s.end);
    if (!(end > start)) continue;
    const len = (end - start) / 60_000;
    if (s.status === 'done') total += len;
    else if (s.status === 'partial') total += Math.min(Math.max(s.doneMinutes ?? 0, 0), len);
    else if (s.status !== 'skipped' && start < nowMs) total += (Math.min(end, nowMs) - start) / 60_000;
  }
  return Math.round(total);
}

/**
 * The typical ratio of actual to estimated time over recently finished tasks, or null without
 * enough of them. Uses the median, so one task that went badly doesn't swing it.
 */
export function estimateHistory(tasks: Task[]): EstimateHistory | null {
  const ratios = tasks
    .filter(t => t.isCompleted && (t.estimatedMinutes ?? 0) > 0 && (t.actualMinutes ?? 0) > 0)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, RECENT_SAMPLES)
    .map(t => t.actualMinutes! / t.estimatedMinutes!)
    .sort((a, b) => a - b);
  if (ratios.length < MIN_SAMPLES) return null;
  const mid = ratios.length / 2;
  const median = ratios.length % 2 ? ratios[Math.floor(mid)] : (ratios[mid - 1] + ratios[mid]) / 2;
  const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, median));
  return { ratio: Math.round(clamped * 20) / 20, samples: ratios.length };
}

/** A task's estimate allowing for `ratio`, to the nearest 5 minutes. */
export function scaledMinutes(minutes: number, ratio: number): number {
  if (ratio === 1 || minutes <= 0) return minutes;
  return Math.max(5, Math.round((minutes * ratio) / 5) * 5);
}

/** The learning columns a task write can carry. */
export type Learning = { estimated_minutes?: number; actual_minutes?: number };

/**
 * Writes `row` plus the learning columns, or just `row` on a database that doesn't have those
 * columns yet (supabase/schema.sql adds them), so saving never fails because of them.
 */
export async function withLearning<T extends { error: { message: string } | null }>(
  learning: Learning, write: (extra: Learning) => PromiseLike<T>,
): Promise<T> {
  if (Object.keys(learning).length === 0) return write({});
  const result = await write(learning);
  if (result.error && /estimated_minutes|actual_minutes/.test(result.error.message)) return write({});
  return result;
}

/** "1.4×", "0.85×". */
export const formatRatio = (ratio: number) => `${Number(ratio.toFixed(2))}×`;
