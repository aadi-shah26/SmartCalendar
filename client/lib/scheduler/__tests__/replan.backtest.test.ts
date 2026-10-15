import { describe, it, expect } from 'vitest';
import { planSessions, prefsForWorkTime, PLANNING_HORIZON_DAYS, type PlannerPrefs, type PlannerPriority, type PlannerEnergy } from '../planner';
import { reflow, isUpcoming, remainingMinutes, type TrackedSession, type TrackedTask } from '../replan';
import type { Interval } from '../types';

// Backtests: hundreds of seeded random weeks, checking the guarantees reflow makes after every
// change, then whole weeks simulated session by session with things slipping.

const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = ReturnType<typeof rng>;
const pick = <T,>(r: Rand, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

const overlaps = (a: Interval, b: Interval) => a.startMs < b.endMs && b.startMs < a.endMs;
const len = (x: Interval) => (x.endMs - x.startMs) / MIN;
const key = (x: Interval) => `${x.startMs}-${x.endMs}`;
const dayStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

function randomPrefs(r: Rand): PlannerPrefs {
  const withPlan = r() < 0.7;
  return prefsForWorkTime(pick(r, ['day', 'night'] as const), pick(r, ['solo', 'social'] as const), withPlan ? {
    dailyMinutes: pick(r, [60, 120, 180, 240, 360]),
    sessionMinutes: pick(r, [30, 45, 60, 90]),
    workDays: r() < 0.3 ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
    spread: pick(r, ['steady', 'asap'] as const),
  } : null);
}

function randomBusy(r: Rand, nowMs: number): Interval[] {
  const out: Interval[] = [];
  for (let i = int(r, 0, 14); i > 0; i--) {
    const start = dayStart(nowMs) + int(r, 0, 9) * 24 * HOUR + int(r, 7 * 4, 21 * 4) * 15 * MIN;
    out.push({ startMs: start, endMs: start + int(r, 1, 12) * 15 * MIN });
  }
  return out;
}

function randomTasks(r: Rand, nowMs: number): TrackedTask[] {
  return Array.from({ length: int(r, 1, 7) }, (_, i) => ({
    id: `t${i}`,
    durationMinutes: int(r, 1, 16) * 15,
    deadlineMs: r() < 0.2 ? null : dayStart(nowMs) + int(r, 0, 10) * 24 * HOUR + int(r, 8, 23) * HOUR,
    priority: pick(r, ['Low', 'Medium', 'High', 'Critical'] as PlannerPriority[]),
    energyLevel: pick(r, ['Low', 'Medium', 'High'] as PlannerEnergy[]),
    chunk: r() < 0.4 ? { min: 15, max: pick(r, [30, 45, 60, 90]) } : null,
    sessions: [],
  }));
}

/** A plausible messy state: an initial plan, then time passes and things happen. */
function randomScenario(seed: number) {
  const r = rng(seed);
  const planNow = at(5, int(r, 6, 20), pick(r, [0, 7, 15, 30, 44]));
  const prefs = randomPrefs(r);
  let tasks = randomTasks(r, planNow);
  const busy = randomBusy(r, planNow);
  const plan = planSessions(tasks, busy, prefs, planNow);
  tasks = tasks.map(t => ({
    ...t,
    sessions: plan.sessions.filter(s => s.taskId === t.id).map(s => ({
      startMs: s.startMs, endMs: s.endMs, ...(r() < 0.15 ? {} : { status: 'planned' as const }),
    })),
  }));
  const nowMs = planNow + int(r, 0, 60) * 30 * MIN;
  tasks = tasks.map(t => ({
    ...t,
    sessions: t.sessions.map(s => {
      if (s.status === undefined) return s;
      const roll = r();
      if (s.startMs < nowMs) {
        if (roll < 0.4) return { ...s, status: 'done' as const };
        if (roll < 0.6) return { ...s, status: 'partial' as const, doneMinutes: int(r, 0, len(s)) };
        if (roll < 0.8) return { ...s, status: 'skipped' as const };
        return s;
      }
      if (roll < 0.08) return { ...s, pinned: true };
      if (roll < 0.12) return { ...s, status: 'skipped' as const };
      return s;
    }),
    durationMinutes: r() < 0.15 ? Math.max(15, t.durationMinutes + int(r, -4, 4) * 15) : t.durationMinutes,
  }));
  // New meetings land on top of the plan.
  const allBusy = [...busy, ...randomBusy(r, nowMs).slice(0, int(r, 0, 5))];
  return { tasks, busy: allBusy, prefs, nowMs };
}

const apply = (tasks: TrackedTask[], changed: Record<string, TrackedSession[]>) =>
  tasks.map(t => changed[t.id] ? { ...t, sessions: changed[t.id] } : t);

function inWorkWindow(s: Interval, prefs: PlannerPrefs): boolean {
  const day = dayStart(s.startMs);
  if (prefs.workDays && !prefs.workDays.includes(new Date(day).getDay())) return false;
  return s.startMs >= day + prefs.dayStartMin * MIN && s.endMs <= day + prefs.dayEndMin * MIN;
}

/** Checks every guarantee for one reflow; returns the first broken one, or null. */
function checkInvariants(before: TrackedTask[], busy: Interval[], prefs: PlannerPrefs, nowMs: number): string | null {
  const result = reflow(before, busy, prefs, nowMs);
  const after = apply(before, result.changed);
  const startMs = Math.ceil(nowMs / (15 * MIN)) * 15 * MIN;
  const horizonEnd = dayStart(nowMs) + (PLANNING_HORIZON_DAYS + 1) * 24 * HOUR + 3 * HOUR; // DST slack
  const original = new Map<string, TrackedSession>(before.flatMap(t => t.sessions.map(s => [`${t.id}:${key(s)}`, s] as const)));
  const frozenKeys = new Set(before.flatMap(t => t.sessions
    .filter(s => isUpcoming(s, nowMs) && (s.pinned || s.startMs < nowMs)).map(s => `${t.id}:${key(s)}`)));

  for (const t of before) {
    const now = after.find(x => x.id === t.id)!;
    // 1. History, pinned and under-way sessions survive exactly.
    for (const s of t.sessions) {
      if (!(s.endMs > s.startMs)) continue;
      const keep = !isUpcoming(s, nowMs) || s.pinned || s.startMs < nowMs;
      if (keep && !now.sessions.includes(s) && !now.sessions.some(x => JSON.stringify(x) === JSON.stringify(s))) return `${t.id}: lost kept session ${key(s)}`;
    }
    const upcoming = now.sessions.filter(s => isUpcoming(s, nowMs));
    for (const s of upcoming) {
      const k = `${t.id}:${key(s)}`;
      if (frozenKeys.has(k)) continue;
      const isNew = !original.has(k) || isUpcoming(original.get(k)!, nowMs) === false;
      // 2. Nothing movable sits on busy time.
      if (busy.some(b => overlaps(s, b))) return `${t.id}: session ${key(s)} on busy time`;
      if (isNew) {
        // 3. New and moved sessions: in the future, inside working hours, before the deadline.
        if (s.startMs < startMs) return `${t.id}: placed in the past`;
        if (!inWorkWindow(s, prefs)) return `${t.id}: placed outside working hours ${new Date(s.startMs).toString()}`;
        if (t.deadlineMs !== null && s.endMs > t.deadlineMs) return `${t.id}: placed after its deadline`;
        if (s.endMs > horizonEnd) return `${t.id}: placed beyond the horizon`;
        if (s.status !== 'planned') return `${t.id}: new session without planned status`;
        // 4. Skipped (can't make it) time stays clear.
        if (before.flatMap(x => x.sessions).some(x => x.status === 'skipped' && x.endMs > nowMs && overlaps(x, s)))
          return `${t.id}: placed on time the user can't make`;
      }
    }
    // 5. Never plans more than the work left (frozen sessions excepted), and anything short is reported.
    const remaining = remainingMinutes(now, nowMs);
    const upcomingMin = upcoming.reduce((n, s) => n + len(s), 0);
    const frozenMin = upcoming.filter(s => frozenKeys.has(`${t.id}:${key(s)}`)).reduce((n, s) => n + len(s), 0);
    if (upcomingMin > Math.max(remaining, frozenMin) + 0.001) return `${t.id}: over-planned ${upcomingMin} > ${remaining}`;
    const risk = result.atRisk.find(x => x.taskId === t.id)?.minutes ?? 0;
    if (Math.max(0, Math.round(remaining - upcomingMin)) !== risk) return `${t.id}: at-risk ${risk} but short ${remaining - upcomingMin}`;
  }

  // 6. No two movable upcoming sessions overlap each other.
  const all = after.flatMap(t => t.sessions.filter(s => isUpcoming(s, nowMs)).map(s => ({ s, frozen: frozenKeys.has(`${t.id}:${key(s)}`) })));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      if (!(all[i].frozen && all[j].frozen) && overlaps(all[i].s, all[j].s)) return `sessions overlap ${key(all[i].s)} / ${key(all[j].s)}`;

  // 7. Daily limit holds on any day it wasn't already broken, unless the result says it went over.
  if (prefs.maxDailyMin && result.overLimit.length === 0) {
    const load = (list: TrackedTask[]) => {
      const m = new Map<number, number>();
      for (const t of list) for (const s of t.sessions) if (s.status !== 'skipped' && s.endMs > s.startMs) m.set(dayStart(s.startMs), (m.get(dayStart(s.startMs)) ?? 0) + len(s));
      return m;
    };
    const was = load(before);
    for (const [d, mins] of load(after)) {
      if (d < dayStart(nowMs)) continue;
      if (mins > prefs.maxDailyMin && mins > (was.get(d) ?? 0)) return `daily limit broken on ${new Date(d).toDateString()}: ${mins}`;
    }
  }

  // 8. Deterministic.
  if (JSON.stringify(reflow(before, busy, prefs, nowMs)) !== JSON.stringify(result)) return 'not deterministic';
  return null;
}

const SCENARIOS = 400;

describe('reflow backtest: random weeks', () => {
  it(`keeps every guarantee across ${SCENARIOS} random scenarios`, () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= SCENARIOS; seed++) {
      const { tasks, busy, prefs, nowMs } = randomScenario(seed);
      const problem = checkInvariants(tasks, busy, prefs, nowMs);
      if (problem) failures.push(`seed ${seed}: ${problem}`);
    }
    expect(failures).toEqual([]);
  });

  it('is a fixed point: a second run changes nothing', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= SCENARIOS; seed++) {
      const { tasks, busy, prefs, nowMs } = randomScenario(seed);
      const first = reflow(tasks, busy, prefs, nowMs);
      const second = reflow(apply(tasks, first.changed), busy, prefs, nowMs);
      if (Object.keys(second.changed).length) failures.push(`seed ${seed}: ${JSON.stringify(second.changes)}`);
    }
    expect(failures).toEqual([]);
  });
});

/**
 * One week lived session by session: each session that ends is done, partly done, or skipped at
 * random, meetings appear, and reflow runs after every change, as the app does.
 */
function simulateWeek(seed: number, opts: { doneRate: number; meetingsPerDay: number }) {
  const r = rng(seed);
  const prefs = prefsForWorkTime('day', null, { dailyMinutes: 300, sessionMinutes: 60, workDays: [0, 1, 2, 3, 4, 5, 6], spread: 'steady' });
  let nowMs = at(5, 7);
  let tasks: TrackedTask[] = Array.from({ length: 5 }, (_, i) => ({
    id: `t${i}`, durationMinutes: int(r, 2, 8) * 30, deadlineMs: at(int(r, 8, 11), 18),
    priority: pick(r, ['Low', 'Medium', 'High'] as PlannerPriority[]), energyLevel: 'Medium' as PlannerEnergy,
    chunk: null, sessions: [],
  }));
  const busy: Interval[] = [];
  let changesMade = 0;
  let replans = 0;
  let violations = 0;
  const step = (when: number) => {
    nowMs = when;
    if (checkInvariants(tasks, busy, prefs, nowMs)) violations++;
    const res = reflow(tasks, busy, prefs, nowMs);
    replans++;
    changesMade += res.changes.length;
    tasks = apply(tasks, res.changed);
  };
  step(nowMs);
  for (let h = 0; h < 6 * 24; h++) {
    const t0 = at(5, 7) + h * HOUR;
    // Meetings get booked into the coming days.
    if (r() < opts.meetingsPerDay / 24) {
      const start = dayStart(t0) + int(r, 1, 3) * 24 * HOUR + int(r, 9 * 4, 17 * 4) * 15 * MIN;
      busy.push({ startMs: start, endMs: start + int(r, 2, 6) * 15 * MIN });
    }
    // Check in on everything that ended.
    tasks = tasks.map(t => ({
      ...t,
      sessions: t.sessions.map(s => {
        if (s.status !== 'planned' || s.endMs > t0) return s;
        const roll = r();
        if (roll < opts.doneRate) return { ...s, status: 'done' as const };
        if (roll < opts.doneRate + (1 - opts.doneRate) / 2) return { ...s, status: 'partial' as const, doneMinutes: int(r, 0, len(s) - 1) };
        return { ...s, status: 'skipped' as const };
      }),
    }));
    step(t0);
  }
  const finishedOnTime = tasks.filter(t => remainingMinutes(t, t.deadlineMs!) === 0
    && t.sessions.every(s => s.status !== 'planned' || s.endMs <= t.deadlineMs!)).length;
  return { tasks, changesMade, replans, violations, finishedOnTime };
}

describe('reflow backtest: simulated weeks', () => {
  it('keeps every guarantee after each change, all week, and gets the work done with room to spare', () => {
    let finished = 0;
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sim = simulateWeek(seed, { doneRate: 0.7, meetingsPerDay: 3 });
      expect(sim.violations, `seed ${seed}`).toBe(0);
      finished += sim.finishedOnTime;
      total += sim.tasks.length;
      // A task only misses when its very last session before the deadline slipped: by then no
      // planner can help. Anything earlier must have been made up.
      for (const t of sim.tasks) {
        if (remainingMinutes(t, t.deadlineMs!) === 0) continue;
        const last = t.sessions.filter(x => x.endMs <= t.deadlineMs!).sort((x, y) => y.endMs - x.endMs)[0];
        expect(last && (last.status === 'skipped' || last.status === 'partial'), `seed ${seed} ${t.id}`).toBe(true);
      }
    }
    // About 4 to 20 hours of work against 5 h/day of room, with 30% of sessions slipping.
    expect(finished / total).toBeGreaterThanOrEqual(0.97);
  });

  it('absorbs a single slip with one change, not a reshuffle of the week', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const prefs = prefsForWorkTime('day', null, { dailyMinutes: 240, sessionMinutes: 60, workDays: [0, 1, 2, 3, 4, 5, 6], spread: 'steady' });
      const planNow = at(5, 7);
      let tasks: TrackedTask[] = Array.from({ length: 4 }, (_, i) => ({
        id: `t${i}`, durationMinutes: int(r, 2, 6) * 60, deadlineMs: at(11, 18), priority: 'Medium' as PlannerPriority,
        energyLevel: 'Medium' as PlannerEnergy, chunk: null, sessions: [],
      }));
      tasks = apply(tasks, reflow(tasks, [], prefs, planNow).changed);
      // The first session of the week gets skipped.
      const first = tasks.flatMap(t => t.sessions.map(s => ({ t, s }))).sort((a, b) => a.s.startMs - b.s.startMs)[0];
      const after = first.s.endMs + 5 * MIN;
      tasks = tasks.map(t => t === first.t ? { ...t, sessions: t.sessions.map(s => s === first.s ? { ...s, status: 'skipped' as const } : s) } : t);
      const res = reflow(tasks, [], prefs, after);
      expect(res.changes, `seed ${seed}`).toHaveLength(1);
      expect(res.changes[0]).toMatchObject({ taskId: first.t.id, kind: 'added' });
      expect(res.atRisk).toEqual([]);
    }
  });

  it('reports work at risk, and never hides it, when the week is overbooked', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const sim = simulateWeek(seed, { doneRate: 0.2, meetingsPerDay: 10 });
      expect(sim.violations, `seed ${seed}`).toBe(0);
    }
  });
});
