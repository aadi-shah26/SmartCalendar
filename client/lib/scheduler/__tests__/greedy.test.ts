import { describe, it, expect } from 'vitest';
import { scheduleTasksGreedy } from '../greedy';
import { SchedulerTask } from '../types';

const horizon = {
  startMs: new Date('2026-09-28T08:00:00').getTime(),
  endMs: new Date('2026-09-28T18:00:00').getTime(),
};

function makeTask(overrides: Partial<SchedulerTask> = {}): SchedulerTask {
  return {
    id: 'task-1',
    name: 'Task',
    priority: 'medium',
    requirement: 'optional',
    durationMinutes: 60,
    ...overrides,
  };
}

describe('scheduleTasksGreedy', () => {
  it('places a single task inside the open horizon', () => {
    const { placements, status } = scheduleTasksGreedy([makeTask()], horizon);
    expect(status).toBe('GREEDY_OK');
    expect(placements).toHaveLength(1);
    expect(placements[0].interval.startMs).toBeGreaterThanOrEqual(horizon.startMs);
    expect(placements[0].interval.endMs).toBeLessThanOrEqual(horizon.endMs);
  });

  it('never overlaps two tasks', () => {
    const { placements } = scheduleTasksGreedy(
      [makeTask({ id: 'a', durationMinutes: 120 }), makeTask({ id: 'b', durationMinutes: 120 })],
      horizon
    );
    expect(placements).toHaveLength(2);
    const [first, second] = [...placements].sort((x, y) => x.interval.startMs - y.interval.startMs);
    expect(first.interval.endMs).toBeLessThanOrEqual(second.interval.startMs);
  });

  it('marks a required task unplaced when the horizon has no room', () => {
    const tinyHorizon = { startMs: horizon.startMs, endMs: horizon.startMs + 30 * 60 * 1000 };
    const { placements, status, unplacedTaskIds } = scheduleTasksGreedy(
      [makeTask({ requirement: 'required', durationMinutes: 60 })],
      tinyHorizon
    );
    expect(placements).toHaveLength(0);
    expect(status).toContain('GREEDY_PARTIAL');
    expect(unplacedTaskIds).toEqual(['task-1']);
  });

  it('pins a task to an absolute window when that is its only allowed window', () => {
    const start = new Date('2026-09-28T14:00:00').getTime();
    const end = new Date('2026-09-28T15:00:00').getTime();
    const { placements } = scheduleTasksGreedy(
      [
        makeTask({
          durationMinutes: 60,
          constraints: {
            allowedWindows: [{ kind: 'absolute', start: '2026-09-28T14:00:00', end: '2026-09-28T15:00:00' }],
          },
        }),
      ],
      horizon
    );
    expect(placements).toHaveLength(1);
    expect(placements[0].interval.startMs).toBe(start);
    expect(placements[0].interval.endMs).toBe(end);
  });

  it('does not place a task inside a blackout window', () => {
    const { placements } = scheduleTasksGreedy(
      [
        makeTask({
          durationMinutes: 60,
          constraints: {
            allowedWindows: [{ kind: 'absolute', start: '2026-09-28T08:00:00', end: '2026-09-28T10:30:00' }],
            blackoutWindows: [{ kind: 'absolute', start: '2026-09-28T08:00:00', end: '2026-09-28T09:30:00' }],
          },
        }),
      ],
      horizon
    );
    expect(placements).toHaveLength(1);
    expect(placements[0].interval.startMs).toBeGreaterThanOrEqual(new Date('2026-09-28T09:30:00').getTime());
  });

  it('enforces a buffer gap between placements when bufferMs is set', () => {
    const { placements } = scheduleTasksGreedy(
      [makeTask({ id: 'a', durationMinutes: 60 }), makeTask({ id: 'b', durationMinutes: 60 })],
      horizon,
      { bufferMs: 15 * 60 * 1000 }
    );
    expect(placements).toHaveLength(2);
    const [first, second] = [...placements].sort((x, y) => x.interval.startMs - y.interval.startMs);
    const gapMs = second.interval.startMs - first.interval.endMs;
    expect(gapMs).toBeGreaterThanOrEqual(15 * 60 * 1000);
  });

  it('schedules a task with an explicit deadline near the deadline, not at the start of the horizon', () => {
    // This is the exact bug report: a task due at 5:30pm got scheduled at ~3:42pm (the
    // earliest open moment) instead of anywhere near its actual deadline.
    const deadline = new Date('2026-09-28T17:30:00');
    const { placements } = scheduleTasksGreedy(
      [
        makeTask({
          durationMinutes: 30,
          constraints: { latestEnd: deadline.toISOString() },
        }),
      ],
      horizon
    );
    expect(placements).toHaveLength(1);
    // Should end at (or within a few minutes of) the deadline, not near horizon.startMs.
    expect(deadline.getTime() - placements[0].interval.endMs).toBeLessThan(15 * 60 * 1000);
  });

  it('still prefers the earliest slot for a task with no deadline at all', () => {
    const { placements } = scheduleTasksGreedy([makeTask({ durationMinutes: 30 })], horizon);
    expect(placements).toHaveLength(1);
    expect(placements[0].interval.startMs).toBe(horizon.startMs);
  });

  it('schedules a near-deadline task late and a no-deadline task early, independently, in the same run', () => {
    const deadline = new Date('2026-09-28T17:30:00');
    const { placements } = scheduleTasksGreedy(
      [
        makeTask({ id: 'urgent', durationMinutes: 30, constraints: { latestEnd: deadline.toISOString() } }),
        makeTask({ id: 'whenever', durationMinutes: 30 }),
      ],
      horizon
    );
    expect(placements).toHaveLength(2);
    const urgent = placements.find(p => p.task.id === 'urgent')!;
    const whenever = placements.find(p => p.task.id === 'whenever')!;
    expect(deadline.getTime() - urgent.interval.endMs).toBeLessThan(60 * 60 * 1000);
    expect(whenever.interval.startMs).toBeLessThan(urgent.interval.startMs);
  });

  it('prefers a later slot inside preferredWindows over an earlier non-preferred one, once the earliness gap is negligible', () => {
    // Long horizon so a 2-hour difference in start time barely moves the earliness
    // score, letting the preferred-window bonus (up to 100pts) decide the outcome.
    const longHorizon = {
      startMs: new Date('2026-09-28T08:00:00').getTime(),
      endMs: new Date('2026-10-28T08:00:00').getTime(),
    };
    const { placements } = scheduleTasksGreedy(
      [
        makeTask({
          durationMinutes: 60,
          constraints: {
            allowedWindows: [
              { kind: 'absolute', start: '2026-09-28T08:00:00', end: '2026-09-28T09:00:00' },
              { kind: 'absolute', start: '2026-09-28T10:00:00', end: '2026-09-28T11:00:00' },
            ],
            preferredWindows: [{ kind: 'absolute', start: '2026-09-28T10:00:00', end: '2026-09-28T11:00:00' }],
          },
        }),
      ],
      longHorizon
    );
    expect(placements).toHaveLength(1);
    expect(placements[0].interval.startMs).toBe(new Date('2026-09-28T10:00:00').getTime());
  });
});
