import { Interval, TimeWindow, SchedulingConstraints } from './types';
import { IntervalSet } from './intervalSet';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function windowToIntervals(window: TimeWindow, horizon: Interval): Interval[] {
  const result: Interval[] = [];

  if (window.kind === 'absolute') {
    if (!window.start || !window.end) return [];
    const start = new Date(window.start).getTime();
    const end = new Date(window.end).getTime();
    const clippedStart = Math.max(start, horizon.startMs);
    const clippedEnd = Math.min(end, horizon.endMs);
    if (clippedStart < clippedEnd) result.push({ startMs: clippedStart, endMs: clippedEnd });
    return result;
  }

  if (window.kind === 'weekly') {
    if (!window.daysOfWeek || !window.timeStart || !window.timeEnd) return [];
    const startMinutes = parseTimeToMinutes(window.timeStart);
    const endMinutes = parseTimeToMinutes(window.timeEnd);
    let dayCursor = startOfDayMs(horizon.startMs);
    while (dayCursor < horizon.endMs) {
      const jsDay = new Date(dayCursor).getDay();
      if (window.daysOfWeek.includes(jsDay)) {
        const start = dayCursor + startMinutes * 60_000;
        const end = dayCursor + endMinutes * 60_000;
        const clippedStart = Math.max(start, horizon.startMs);
        const clippedEnd = Math.min(end, horizon.endMs);
        if (clippedStart < clippedEnd) result.push({ startMs: clippedStart, endMs: clippedEnd });
      }
      dayCursor += MS_PER_DAY;
    }
    return result;
  }

  return [];
}

export function windowsToIntervalSet(windows: TimeWindow[] | undefined, horizon: Interval): IntervalSet {
  if (!windows || windows.length === 0) return new IntervalSet([horizon]);
  const intervals: Interval[] = [];
  for (const w of windows) intervals.push(...windowToIntervals(w, horizon));
  return new IntervalSet(intervals);
}

export function findAllowedIntervals(constraints: SchedulingConstraints | undefined, horizon: Interval): IntervalSet {
  let allowed = windowsToIntervalSet(constraints?.allowedWindows, horizon);

  if (constraints?.blackoutWindows) {
    const blackout = windowsToIntervalSet(constraints.blackoutWindows, horizon);
    allowed = allowed.subtract(blackout);
  }

  if (constraints?.earliestStart) {
    const earliest = new Date(constraints.earliestStart).getTime();
    allowed = allowed.intersect(new IntervalSet([{ startMs: earliest, endMs: horizon.endMs }]));
  }

  if (constraints?.latestEnd) {
    const latest = new Date(constraints.latestEnd).getTime();
    allowed = allowed.intersect(new IntervalSet([{ startMs: horizon.startMs, endMs: latest }]));
  }

  return allowed;
}
