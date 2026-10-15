import { describe, it, expect } from 'vitest';
import { prefsForWorkTime, DEFAULT_WORK_PLAN, type PlannerTask } from '../planner';
import {
  reflow, replanBasis, atRiskTasks, awaitsCheckIn, creditedMinutes, remainingMinutes, shortfallMinutes,
  CHECK_IN_GRACE_MS, type TrackedSession, type TrackedTask,
} from '../replan';

// Local wall-clock times, so the tests pass in any timezone.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime(); // Oct 2026
const NOW = at(5, 9); // Mon Oct 5, 9:00
const MIN = 60_000;
const prefs = prefsForWorkTime('day'); // 8:00–22:00, peak 9–12, no buffer, no daily limit
const plan = (over: Partial<typeof DEFAULT_WORK_PLAN> = {}) => prefsForWorkTime('day', null, { ...DEFAULT_WORK_PLAN, ...over });

const task = (over: Partial<TrackedTask>): TrackedTask => ({
  id: 't', durationMinutes: 60, deadlineMs: null, priority: 'Medium', energyLevel: 'Medium', chunk: null, sessions: [], ...over,
});
const s = (day: number, h: number, durMin = 60, extra: Partial<TrackedSession> = {}): TrackedSession =>
  ({ startMs: at(day, h), endMs: at(day, h) + durMin * MIN, status: 'planned', ...extra });
const iv = (x: { startMs: number; endMs: number }) => ({ startMs: x.startMs, endMs: x.endMs });
const overlaps = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) =>
  a.startMs < b.endMs && b.startMs < a.endMs;
const minutes = (list: { startMs: number; endMs: number }[]) => list.reduce((n, x) => n + (x.endMs - x.startMs) / MIN, 0);

/** Applies a reflow's changes to the tasks, like saving them would. */
const apply = (tasks: TrackedTask[], changed: Record<string, TrackedSession[]>) =>
  tasks.map(t => changed[t.id] ? { ...t, sessions: changed[t.id] } : t);

describe('remaining work', () => {
  const t = (sessions: TrackedSession[], over: Partial<PlannerTask> = {}) => task({ durationMinutes: 180, deadlineMs: at(9, 17), sessions, ...over });

  it('counts done and partly done sessions, not skipped ones', () => {
    const done = t([s(4, 9, 60, { status: 'done' }), s(4, 11, 60, { status: 'partial', doneMinutes: 20 }), s(4, 14, 60, { status: 'skipped' })]);
    expect(remainingMinutes(done, NOW)).toBe(100);
  });

  it('clamps partial minutes to the session length', () => {
    expect(creditedMinutes(s(4, 9, 60, { status: 'partial', doneMinutes: 999 }), { deadlineMs: null }, NOW)).toBe(60);
    expect(creditedMinutes(s(4, 9, 60, { status: 'partial', doneMinutes: -5 }), { deadlineMs: null }, NOW)).toBe(0);
  });

  it('treats sessions from before check-ins (no status) as done once over', () => {
    const legacy = { startMs: at(1, 9), endMs: at(1, 10) };
    expect(creditedMinutes(legacy, { deadlineMs: at(9, 17) }, NOW)).toBe(60);
    expect(creditedMinutes({ startMs: at(6, 9), endMs: at(6, 10) }, { deadlineMs: null }, NOW)).toBe(0);
  });

  it('gives an unanswered session a day of benefit of the doubt, then counts it as missed for deadline tasks', () => {
    const ended = s(5, 7, 60); // ended 8:00, an hour ago
    expect(creditedMinutes(ended, { deadlineMs: at(9, 17) }, NOW)).toBe(60);
    const later = at(5, 8) + CHECK_IN_GRACE_MS;
    expect(creditedMinutes(ended, { deadlineMs: at(9, 17) }, later)).toBe(0);
    expect(creditedMinutes(ended, { deadlineMs: null }, later)).toBe(60);
  });

  it('works out the shortfall against upcoming sessions', () => {
    expect(shortfallMinutes(t([s(6, 9), s(7, 9)]), NOW)).toBe(60);
    expect(shortfallMinutes(t([s(6, 9), s(7, 9), s(8, 9), s(8, 14)]), NOW)).toBe(-60);
    expect(shortfallMinutes(t([s(4, 9, 60, { status: 'done' }), s(6, 9), s(7, 9)]), NOW)).toBe(0);
  });

  it('knows which sessions need a check-in', () => {
    expect(awaitsCheckIn(s(5, 8, 30), NOW)).toBe(true);
    expect(awaitsCheckIn(s(5, 8, 120), NOW)).toBe(true); // under way
    expect(awaitsCheckIn(s(5, 10), NOW)).toBe(false);
    expect(awaitsCheckIn(s(5, 8, 30, { status: 'done' }), NOW)).toBe(false);
    expect(awaitsCheckIn({ startMs: at(5, 7), endMs: at(5, 8) }, NOW)).toBe(false); // legacy
  });
});

// The scenarios the old conflict resolver handled must still work the same way.
describe('reflow: conflicts', () => {
  it('does nothing when there is nothing to do', () => {
    const tasks = [task({ deadlineMs: at(7, 17), sessions: [s(6, 9)] })];
    expect(reflow(tasks, [s(6, 11)], prefs, NOW)).toEqual({ changed: {}, changes: [], atRisk: [], overLimit: [] });
  });

  it('moves only the clashing session, close to where it was, and leaves the others alone', () => {
    const keepA = s(6, 9);
    const clash = s(7, 14);
    const tasks = [task({ id: 'a', durationMinutes: 120, deadlineMs: at(9, 17), sessions: [keepA, clash] })];
    const meeting = { startMs: at(7, 13, 30), endMs: at(7, 15) };
    const { changed, changes } = reflow(tasks, [meeting], prefs, NOW);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'moved', from: iv(clash) });
    const to = changes[0].to!;
    expect(to.endMs - to.startMs).toBe(60 * MIN);
    expect(overlaps(to, meeting)).toBe(false);
    // Same afternoon, not dragged back to the earliest free slot (Mon morning).
    expect(new Date(to.startMs).getDate()).toBe(7);
    expect(Math.abs(to.startMs - clash.startMs)).toBeLessThanOrEqual(2 * 60 * MIN);
    expect(changed.a).toContainEqual(keepA);
    expect(changed.a).toHaveLength(2);
  });

  it('does not touch tasks that are not in conflict', () => {
    const tasks = [
      task({ id: 'clash', deadlineMs: at(9, 17), sessions: [s(6, 14)] }),
      task({ id: 'fine', deadlineMs: at(9, 17), sessions: [s(6, 9)] }),
    ];
    const { changed } = reflow(tasks, [s(6, 14)], prefs, NOW);
    expect(Object.keys(changed)).toEqual(['clash']);
    expect(overlaps(changed.clash[0], s(6, 9))).toBe(false);
  });

  it('lets the more urgent task keep its slot when two tasks overlap', () => {
    const tasks = [
      task({ id: 'later', deadlineMs: at(9, 17), sessions: [s(6, 9)] }),
      task({ id: 'sooner', deadlineMs: at(6, 17), sessions: [s(6, 9)] }),
    ];
    const { changed } = reflow(tasks, [], prefs, NOW);
    expect(Object.keys(changed)).toEqual(['later']);
    expect(overlaps(changed.later[0], s(6, 9))).toBe(false);
  });

  it('never moves sessions that already happened or are under way', () => {
    const past = s(5, 7, 60, { status: 'done' });
    const underway = s(5, 8, 120);
    const tasks = [task({ durationMinutes: 180, deadlineMs: at(9, 17), sessions: [past, underway] })];
    const { changed } = reflow(tasks, [{ startMs: at(5, 7), endMs: at(5, 11) }], prefs, NOW);
    expect(changed).toEqual({});
  });

  it('reports work at risk, instead of silently dropping it, when nothing fits before the deadline', () => {
    const tasks = [task({ deadlineMs: at(5, 18), sessions: [s(5, 10)] })];
    const busy = [{ startMs: at(5, 9), endMs: at(5, 22) }];
    const { changed, changes, atRisk } = reflow(tasks, busy, prefs, NOW);
    expect(changes).toEqual([{ taskId: 't', kind: 'removed', from: iv(s(5, 10)), to: null }]);
    expect(changed.t).toEqual([]);
    expect(atRisk).toEqual([{ taskId: 't', minutes: 60, reason: 'Not enough free time before its deadline.' }]);
  });

  it('moved sessions do not land on each other or on busy time', () => {
    const tasks = [
      task({ id: 'a', deadlineMs: at(9, 17), sessions: [s(6, 9)] }),
      task({ id: 'b', deadlineMs: at(9, 17), sessions: [s(6, 10)] }),
    ];
    const meeting = { startMs: at(6, 9), endMs: at(6, 11) };
    const { changes } = reflow(tasks, [meeting], prefs, NOW);
    expect(changes).toHaveLength(2);
    expect(overlaps(changes[0].to!, changes[1].to!)).toBe(false);
    for (const c of changes) expect(overlaps(c.to!, meeting)).toBe(false);
  });
});

describe('reflow: slips', () => {
  it('re-plans a session the user skipped, and leaves the rest of the week alone', () => {
    const skipped = s(5, 7, 60, { status: 'skipped' });
    const later = [s(6, 9), s(7, 9)];
    const other = task({ id: 'other', deadlineMs: at(9, 17), sessions: [s(6, 14)] });
    const tasks = [task({ id: 'a', durationMinutes: 180, deadlineMs: at(9, 17), sessions: [skipped, ...later] }), other];
    const { changed, changes } = reflow(tasks, [], prefs, NOW);
    expect(Object.keys(changed)).toEqual(['a']);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('added');
    expect(changes[0].to!.endMs - changes[0].to!.startMs).toBe(60 * MIN);
    expect(changed.a).toContainEqual(skipped); // history stays
    for (const x of later) expect(changed.a).toContainEqual(x);
    expect(minutes(changed.a.filter(x => x.status === 'planned' && x.endMs > NOW))).toBe(180);
  });

  it('only re-plans the part of a session that did not get done', () => {
    const partial = s(5, 7, 60, { status: 'partial', doneMinutes: 15 });
    const tasks = [task({ durationMinutes: 120, deadlineMs: at(9, 17), sessions: [partial, s(6, 9)] })];
    const { changes } = reflow(tasks, [], prefs, NOW);
    expect(changes).toHaveLength(1);
    expect(changes[0].to!.endMs - changes[0].to!.startMs).toBe(45 * MIN);
  });

  it('removes sessions no longer needed, latest first, shortening where only part is extra', () => {
    const tasks = [task({ durationMinutes: 90, deadlineMs: at(9, 17), sessions: [s(6, 9), s(7, 9), s(8, 9)] })];
    const { changed, changes } = reflow(tasks, [], prefs, NOW);
    expect(changed.t.map(iv)).toEqual([iv(s(6, 9)), { startMs: at(7, 9), endMs: at(7, 9, 30) }]);
    expect(changes.map(c => c.kind).sort()).toEqual(['removed', 'shortened']);
  });

  it('re-plans an unanswered deadline-task session after a day, but not before', () => {
    const missed = s(4, 9);
    const tasks = [task({ durationMinutes: 60, deadlineMs: at(9, 17), sessions: [missed] })];
    expect(reflow(tasks, [], prefs, at(4, 12)).changed).toEqual({});
    const { changes } = reflow(tasks, [], prefs, at(5, 10, 1));
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('added');
  });

  it('plans tasks that have no sessions yet', () => {
    const { changes, atRisk } = reflow([task({ durationMinutes: 90, deadlineMs: at(7, 17) })], [], prefs, NOW);
    expect(minutes(changes.map(c => c.to!))).toBe(90);
    expect(atRisk).toEqual([]);
  });

  it('keeps clear of time the user said they cannot make', () => {
    const cantMake = s(5, 10, 600, { status: 'skipped' }); // 10:00–20:00 today
    const tasks = [task({ durationMinutes: 60, deadlineMs: at(5, 22), sessions: [cantMake] })];
    const { changes } = reflow(tasks, [], prefs, NOW);
    expect(changes).toHaveLength(1);
    expect(overlaps(changes[0].to!, cantMake)).toBe(false);
  });

  it('reports a passed deadline instead of planning late', () => {
    const { changes, atRisk } = reflow([task({ deadlineMs: at(4, 17) })], [], prefs, NOW);
    expect(changes).toEqual([]);
    expect(atRisk[0]).toMatchObject({ taskId: 't', minutes: 60, reason: 'Its deadline has passed.' });
  });
});

describe('reflow: pinned sessions', () => {
  it('never moves a pinned session, even over busy time', () => {
    const pinned = s(6, 9, 60, { pinned: true });
    const tasks = [task({ deadlineMs: at(9, 17), sessions: [pinned] })];
    expect(reflow(tasks, [s(6, 9)], prefs, NOW).changed).toEqual({});
  });

  it('moves other work out of the way of a pinned session', () => {
    const tasks = [
      task({ id: 'urgent', deadlineMs: at(6, 17), sessions: [s(6, 9)] }),
      task({ id: 'mine', deadlineMs: at(12, 17), sessions: [s(6, 9, 60, { pinned: true })] }),
    ];
    const { changed } = reflow(tasks, [], prefs, NOW);
    expect(Object.keys(changed)).toEqual(['urgent']);
    expect(overlaps(changed.urgent[0], s(6, 9))).toBe(false);
  });

  it('does not trim pinned sessions when there is too much planned', () => {
    const tasks = [task({ durationMinutes: 60, deadlineMs: at(9, 17), sessions: [s(6, 9, 60, { pinned: true }), s(7, 9)] })];
    const { changed } = reflow(tasks, [], prefs, NOW);
    expect(changed.t).toEqual([s(6, 9, 60, { pinned: true })]);
  });
});

describe('reflow: making room', () => {
  // Today 9:00–22:00 has one free hour (14:00) once the meetings are in.
  const meetings = [{ startMs: at(5, 8), endMs: at(5, 14) }, { startMs: at(5, 15), endMs: at(5, 22) }];

  it('moves a less urgent session aside so an urgent one makes its deadline', () => {
    const tasks = [
      task({ id: 'urgent', deadlineMs: at(5, 18), sessions: [s(5, 7, 60, { status: 'skipped' })] }),
      task({ id: 'relaxed', deadlineMs: at(12, 17), sessions: [s(5, 14)] }),
    ];
    const { changed, changes, atRisk } = reflow(tasks, meetings, prefs, NOW);
    expect(atRisk).toEqual([]);
    const urgent = changed.urgent.filter(x => x.status === 'planned');
    expect(urgent.map(iv)).toEqual([iv(s(5, 14))]);
    const moved = changes.find(c => c.taskId === 'relaxed')!;
    expect(moved).toMatchObject({ kind: 'moved', displacedBy: 'urgent', from: iv(s(5, 14)) });
    expect(moved.to!.startMs).toBeGreaterThanOrEqual(at(6, 0));
  });

  it('never moves a more urgent session aside for a less urgent one', () => {
    const tasks = [
      task({ id: 'urgent', deadlineMs: at(5, 18), sessions: [s(5, 14)] }),
      task({ id: 'relaxed', deadlineMs: at(5, 20), sessions: [s(5, 7, 60, { status: 'skipped' })] }),
    ];
    const { changed, atRisk } = reflow(tasks, meetings, prefs, NOW);
    expect(changed.urgent).toBeUndefined();
    expect(atRisk.map(r => r.taskId)).toEqual(['relaxed']);
  });

  it('never moves a pinned or about-to-start session aside', () => {
    const soon = { startMs: at(5, 9, 15), endMs: at(5, 10, 15) };
    const tasks = [
      task({ id: 'urgent', deadlineMs: at(5, 11), sessions: [s(5, 7, 60, { status: 'skipped' })] }),
      task({ id: 'relaxed', deadlineMs: at(12, 17), sessions: [{ ...soon, status: 'planned' }] }),
    ];
    const busy = [{ startMs: at(5, 10, 15), endMs: at(5, 22) }];
    const { changed, atRisk } = reflow(tasks, busy, prefs, NOW);
    expect(changed.relaxed).toBeUndefined();
    expect(atRisk.map(r => r.taskId)).toEqual(['urgent']);
  });

  it('goes over the daily limit before giving up on a deadline', () => {
    const tasks = [task({ id: 'x', durationMinutes: 240, deadlineMs: at(5, 22) })];
    const { changed, overLimit, atRisk } = reflow(tasks, [], plan({ dailyMinutes: 60 }), NOW);
    expect(minutes(changed.x)).toBe(240);
    expect(overLimit).toEqual(['x']);
    expect(atRisk).toEqual([]);
  });
});

describe('reflow: guarantees', () => {
  it('is a fixed point: running it on its own output changes nothing', () => {
    const tasks = [
      task({ id: 'a', durationMinutes: 180, deadlineMs: at(7, 17), sessions: [s(5, 7, 60, { status: 'skipped' }), s(6, 9), s(6, 10)] }),
      task({ id: 'b', durationMinutes: 120, deadlineMs: at(8, 12), chunk: { min: 30, max: 60 }, sessions: [s(6, 9)] }),
      task({ id: 'c', durationMinutes: 45, deadlineMs: null }),
    ];
    const busy = [{ startMs: at(6, 9), endMs: at(6, 12) }];
    const first = reflow(tasks, busy, prefs, NOW);
    expect(Object.keys(first.changed).length).toBeGreaterThan(0);
    const second = reflow(apply(tasks, first.changed), busy, prefs, NOW);
    expect(second.changed).toEqual({});
    expect(second.changes).toEqual([]);
  });

  it('keeps legacy sessions exactly as they were when they do not need to change', () => {
    const legacy = { startMs: at(6, 9), endMs: at(6, 10) };
    const tasks = [task({ durationMinutes: 120, deadlineMs: at(9, 17), sessions: [legacy] })];
    const { changed } = reflow(tasks, [], prefs, NOW);
    expect(changed.t).toContainEqual(legacy);
    expect(changed.t.find(x => x.startMs === legacy.startMs)!.status).toBeUndefined();
  });

  it('drops malformed sessions', () => {
    const tasks = [task({ sessions: [s(6, 9), { startMs: at(6, 12), endMs: at(6, 12), status: 'planned' }] })];
    expect(reflow(tasks, [], prefs, NOW).changed.t).toEqual([s(6, 9)]);
  });
});

describe('atRiskTasks', () => {
  it('lists only tasks with unplanned work, most urgent first', () => {
    const tasks = [
      task({ id: 'ok', durationMinutes: 60, deadlineMs: at(9, 17), sessions: [s(6, 9)] }),
      task({ id: 'late', durationMinutes: 60, deadlineMs: at(4, 17) }),
      task({ id: 'short', durationMinutes: 120, deadlineMs: at(9, 17), sessions: [s(6, 9)] }),
    ];
    expect(atRiskTasks(tasks, NOW).map(r => [r.taskId, r.minutes])).toEqual([['late', 60], ['short', 60]]);
  });
});

describe('replanBasis', () => {
  it('keeps history, pinned and under-way sessions, and asks for the rest', () => {
    const done = s(4, 9, 60, { status: 'done' });
    const underway = s(5, 8, 60);
    const pinned = s(7, 9, 30, { pinned: true });
    const t = task({ durationMinutes: 240, deadlineMs: at(9, 17), sessions: [done, underway, pinned, s(6, 9), s(8, 9)] });
    const { keep, needMinutes } = replanBasis(t, NOW);
    expect(keep).toEqual([done, underway, pinned]);
    expect(needMinutes).toBe(240 - 60 - 60 - 30);
  });
});
