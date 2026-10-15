import { describe, it, expect } from 'vitest';
import { planSessions, prefsForWorkTime, splitIntoPieces, DEFAULT_WORK_PLAN, PlannerTask } from '../planner';

// Local wall-clock times, so the tests pass in any timezone.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime(); // Oct 2026
const NOW = at(5, 9); // Mon Oct 5, 9:00
const prefs = prefsForWorkTime('day'); // 8:00–22:00, peak 9–12, no buffer

const task = (over: Partial<PlannerTask>): PlannerTask => ({
  id: 't', durationMinutes: 60, deadlineMs: null, priority: 'Medium', energyLevel: 'Medium', chunk: null, ...over,
});

const overlaps = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) =>
  a.startMs < b.endMs && b.startMs < a.endMs;

describe('splitIntoPieces', () => {
  it('keeps unsplittable tasks whole', () => {
    expect(splitIntoPieces(task({ durationMinutes: 180 }))).toEqual([180]);
  });
  it('splits into chunks no bigger than max that add up to the total', () => {
    const pieces = splitIntoPieces(task({ durationMinutes: 180, chunk: { min: 30, max: 60 } }));
    expect(pieces).toEqual([60, 60, 60]);
    const uneven = splitIntoPieces(task({ durationMinutes: 100, chunk: { min: 30, max: 60 } }));
    expect(uneven.reduce((a, b) => a + b, 0)).toBe(100);
    expect(Math.max(...uneven)).toBeLessThanOrEqual(60);
  });
  it('returns nothing for zero-duration tasks', () => {
    expect(splitIntoPieces(task({ durationMinutes: 0 }))).toEqual([]);
  });
});

describe('planSessions with work-plan settings', () => {
  const plan = (over: Partial<typeof DEFAULT_WORK_PLAN> = {}) => prefsForWorkTime('day', null, { ...DEFAULT_WORK_PLAN, ...over });
  const dayOf = (ms: number) => new Date(ms).toDateString();
  const minutesByDay = (sessions: { startMs: number; endMs: number }[]) => {
    const m = new Map<string, number>();
    for (const s of sessions) m.set(dayOf(s.startMs), (m.get(dayOf(s.startMs)) ?? 0) + (s.endMs - s.startMs) / 60_000);
    return m;
  };

  it('splits a long task into sessions of the chosen length', () => {
    expect(splitIntoPieces(task({ durationMinutes: 540 }), 60)).toEqual(Array(9).fill(60));
    expect(splitIntoPieces(task({ durationMinutes: 70 }), 60)).toEqual([70]); // only a little over: keep whole
    expect(splitIntoPieces(task({ durationMinutes: 180, chunk: { min: 30, max: 90 } }), 60)).toEqual([90, 90]); // task's own size wins
  });

  it('spreads a 9-hour task over several days instead of one long block', () => {
    const { sessions, unplaced, overLimit } = planSessions(
      [task({ durationMinutes: 540, deadlineMs: at(12, 23, 59) })], [], plan({ dailyMinutes: 120 }), NOW);
    expect(unplaced).toEqual([]);
    expect(overLimit).toEqual([]);
    expect(sessions.reduce((n, s) => n + (s.endMs - s.startMs) / 60_000, 0)).toBe(540);
    expect(Math.max(...sessions.map(s => s.endMs - s.startMs)) / 60_000).toBeLessThanOrEqual(60);
    const byDay = minutesByDay(sessions);
    expect(byDay.size).toBeGreaterThanOrEqual(5);
    for (const mins of byDay.values()) expect(mins).toBeLessThanOrEqual(120);
    for (const s of sessions) expect(s.endMs).toBeLessThanOrEqual(at(12, 23, 59));
  });

  it('keeps the daily limit across all tasks together', () => {
    const tasks = [
      task({ id: 'a', durationMinutes: 180, deadlineMs: at(9, 22) }),
      task({ id: 'b', durationMinutes: 180, deadlineMs: at(9, 22) }),
      task({ id: 'c', durationMinutes: 120, deadlineMs: at(10, 22) }),
    ];
    const { sessions, unplaced } = planSessions(tasks, [], plan({ dailyMinutes: 120 }), NOW);
    expect(unplaced).toEqual([]);
    for (const mins of minutesByDay(sessions).values()) expect(mins).toBeLessThanOrEqual(120);
  });

  it("counts other tasks' existing sessions toward the limit", () => {
    const existing = [{ startMs: at(5, 13), endMs: at(5, 15) }, { startMs: at(6, 13), endMs: at(6, 15) }];
    const { sessions } = planSessions(
      [task({ durationMinutes: 60, deadlineMs: at(9, 22) })], existing, plan({ dailyMinutes: 120 }), NOW, undefined, existing);
    expect([dayOf(at(5, 0)), dayOf(at(6, 0))]).not.toContain(dayOf(sessions[0].startMs));
  });

  it('only uses the chosen work days', () => {
    // Mon/Wed/Fri only
    const { sessions } = planSessions(
      [task({ durationMinutes: 240, deadlineMs: at(16, 22) })], [], plan({ workDays: [1, 3, 5] }), NOW);
    for (const s of sessions) expect([1, 3, 5]).toContain(new Date(s.startMs).getDay());
  });

  it('goes over the limit rather than miss a deadline, and says so', () => {
    const { sessions, unplaced, overLimit } = planSessions(
      [task({ id: 'x', durationMinutes: 240, deadlineMs: at(5, 22) })], [], plan({ dailyMinutes: 60 }), NOW);
    expect(unplaced).toEqual([]);
    expect(overLimit).toEqual(['x']);
    expect(sessions.reduce((n, s) => n + (s.endMs - s.startMs) / 60_000, 0)).toBe(240);
  });

  it('asap mode finishes sooner than steady mode', () => {
    const t = [task({ durationMinutes: 240, deadlineMs: at(16, 22) })];
    const lastEnd = (r: { sessions: { endMs: number }[] }) => Math.max(...r.sessions.map(s => s.endMs));
    const asap = planSessions(t, [], plan({ spread: 'asap', dailyMinutes: 240 }), NOW);
    const steady = planSessions(t, [], plan({ spread: 'steady', dailyMinutes: 240 }), NOW);
    expect(lastEnd(asap)).toBeLessThan(lastEnd(steady));
    expect(minutesByDay(steady.sessions).size).toBeGreaterThan(1);
  });
});

describe('planSessions', () => {
  it('places a session before the deadline, inside working hours', () => {
    const { sessions, unplaced } = planSessions([task({ deadlineMs: at(7, 17) })], [], prefs, NOW);
    expect(unplaced).toEqual([]);
    expect(sessions).toHaveLength(1);
    const s = sessions[0];
    expect(s.endMs - s.startMs).toBe(60 * 60_000);
    expect(s.endMs).toBeLessThanOrEqual(at(7, 17));
    expect(s.startMs).toBeGreaterThanOrEqual(NOW);
    expect(new Date(s.startMs).getHours()).toBeGreaterThanOrEqual(8);
  });

  it('never overlaps busy time', () => {
    const busy = [{ startMs: at(5, 9), endMs: at(5, 13) }];
    const { sessions } = planSessions([task({ durationMinutes: 120, deadlineMs: at(5, 18) })], busy, prefs, NOW);
    expect(sessions).toHaveLength(1);
    expect(overlaps(sessions[0], busy[0])).toBe(false);
  });

  it('never overlaps itself across tasks', () => {
    const tasks = [
      task({ id: 'a', durationMinutes: 90, deadlineMs: at(5, 15) }),
      task({ id: 'b', durationMinutes: 90, deadlineMs: at(5, 15) }),
      task({ id: 'c', durationMinutes: 90, deadlineMs: at(5, 15) }),
    ];
    const { sessions, unplaced } = planSessions(tasks, [], prefs, NOW);
    expect(unplaced).toEqual([]);
    for (let i = 0; i < sessions.length; i++)
      for (let j = i + 1; j < sessions.length; j++) expect(overlaps(sessions[i], sessions[j])).toBe(false);
  });

  it('gives the earlier deadline first pick', () => {
    const tasks = [
      task({ id: 'later', durationMinutes: 120, deadlineMs: at(9, 17) }),
      task({ id: 'sooner', durationMinutes: 120, deadlineMs: at(5, 12) }),
    ];
    const { sessions, unplaced } = planSessions(tasks, [], prefs, NOW);
    expect(unplaced).toEqual([]);
    const sooner = sessions.find(s => s.taskId === 'sooner')!;
    expect(sooner.endMs).toBeLessThanOrEqual(at(5, 12));
  });

  it('reports tasks that cannot fit before their deadline instead of placing them late', () => {
    const busy = [{ startMs: at(5, 8), endMs: at(5, 22) }];
    const { sessions, unplaced } = planSessions([task({ deadlineMs: at(5, 20) })], busy, prefs, NOW);
    expect(sessions).toEqual([]);
    expect(unplaced).toEqual([{ taskId: 't', reason: 'Not enough free time before its deadline.' }]);
  });

  it('reports tasks whose deadline has already passed', () => {
    const { unplaced } = planSessions([task({ deadlineMs: at(4, 17) })], [], prefs, NOW);
    expect(unplaced[0].reason).toMatch(/passed/);
  });

  it('spreads chunks of a split task across days when there is room', () => {
    const t = task({ durationMinutes: 180, deadlineMs: at(9, 17), chunk: { min: 30, max: 60 } });
    const { sessions } = planSessions([t], [], prefs, NOW);
    expect(sessions).toHaveLength(3);
    const days = new Set(sessions.map(s => new Date(s.startMs).getDate()));
    expect(days.size).toBe(3);
    expect(sessions.reduce((sum, s) => sum + (s.endMs - s.startMs), 0)).toBe(180 * 60_000);
  });

  it('puts high-energy work in peak hours', () => {
    const { sessions } = planSessions([task({ energyLevel: 'High', deadlineMs: at(9, 17) })], [], prefs, NOW);
    const h = new Date(sessions[0].startMs).getHours();
    expect(h).toBeGreaterThanOrEqual(9);
    expect(h).toBeLessThan(12);
  });

  it('keeps a buffer around sessions for solo work style', () => {
    const solo = prefsForWorkTime('day', 'solo');
    const tasks = [task({ id: 'a', deadlineMs: at(5, 12) }), task({ id: 'b', deadlineMs: at(5, 12) })];
    const { sessions } = planSessions(tasks, [], solo, NOW);
    expect(sessions).toHaveLength(2);
    expect(sessions[1].startMs - sessions[0].endMs).toBeGreaterThanOrEqual(10 * 60_000);
  });

  it('ignores zero-duration tasks', () => {
    const { sessions, unplaced } = planSessions([task({ durationMinutes: 0, deadlineMs: at(6, 9) })], [], prefs, NOW);
    expect(sessions).toEqual([]);
    expect(unplaced).toEqual([]);
  });
});
