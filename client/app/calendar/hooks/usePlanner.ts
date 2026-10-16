'use client';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
  atRiskTasks, planSessions, prefsForWorkTime, reflow, replanBasis, DEFAULT_WORK_PLAN, PLANNING_HORIZON_DAYS,
  type PlanResult, type TrackedSession, type WorkPlanSettings,
} from '../../../lib/scheduler';
import {
  fixedBusyIntervals, isActiveTask, isPlannable, sessionToRow, toTrackedTask, updateSession, withoutMovableSessions,
  type CheckIn,
} from '../../../lib/calendar/tasks';
import { estimateHistory } from '../../../lib/calendar/estimates';
import { describeChanges } from '../../../lib/calendar/replanMessages';
import type { CalendarEvent, Profile, StatusMessage, Task, TaskSession } from '../../../lib/calendar/types';
import { workPlanKey } from '../../../lib/calendar/workPlan';

export type ReplanResult = PlanResult & { saveError?: string };

/** How often to look again with no other change: a session ending can mean work to replan. */
const TICK_MS = 5 * 60_000;
/** Automatic replans allowed within LOOP_WINDOW_MS before stopping, in case two plans keep undoing each other. */
const LOOP_LIMIT = 4;
const LOOP_WINDOW_MS = 10_000;

const titleLookup = (taskList: Task[]) => (id: string) => taskList.find(t => String(t.id) === id)?.title ?? 'A task';

/**
 * Smart scheduling: plans task work sessions into free time ("Plan my week", and after a task
 * is added or edited), records what happened to each session, and keeps the plan in step with
 * it: missed work is planned again and clashes are moved, touching as little else as possible.
 */
export function usePlanner({ events, tasks, setTasks, profile, userId, workPlan, setWorkPlan }: {
  events: CalendarEvent[]; tasks: Task[]; setTasks: Dispatch<SetStateAction<Task[]>>;
  profile: Profile | null; userId: string | null;
  workPlan: WorkPlanSettings | null; setWorkPlan: (plan: WorkPlanSettings) => void;
}) {
  const [planMessage, setPlanMessage] = useState<StatusMessage | null>(null);
  const [planning, setPlanning] = useState(false);
  const [showWorkPlan, setShowWorkPlan] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Session writes run one at a time, each starting from the latest tasks, so a check-in made
  // while a replan is saving can't be overwritten by it, or the other way round.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const reflowQueued = useRef(false);
  const recentAutoReplans = useRef<number[]>([]);
  const messageTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  function serially<T>(job: () => Promise<T>): Promise<T> {
    const run = writeQueue.current.then(job, job);
    writeQueue.current = run.catch(() => undefined);
    return run;
  }

  /** The latest tasks, including updates React hasn't rendered yet. */
  const readLatestTasks = () => new Promise<Task[]>(resolve => setTasks(prev => { resolve(prev); return prev; }));

  /** How long finished tasks really took compared to their estimates. */
  const history = useMemo(() => estimateHistory(tasks), [tasks]);
  /** The ratio estimates are scaled by: 1 unless the user chose to plan with their history. */
  const ratioFor = (plan: WorkPlanSettings | null) => (plan?.adjustForHistory && history ? history.ratio : 1);
  const ratio = ratioFor(workPlan);
  const trackedTasks = (taskList: Task[], plan: WorkPlanSettings | null = workPlan) =>
    taskList.filter(isPlannable).map(t => toTrackedTask(t, ratioFor(plan)));

  const plannerPrefs = (plan: WorkPlanSettings | null = workPlan) =>
    prefsForWorkTime(profile?.work_time, profile?.work_style, plan ?? DEFAULT_WORK_PLAN);

  function showMessage(message: StatusMessage | null, ms = 9000) {
    window.clearTimeout(messageTimer.current);
    setPlanMessage(message);
    if (message) messageTimer.current = window.setTimeout(() => setPlanMessage(null), ms);
  }

  // Saved on the profile so it follows the user across devices, and in this browser as a
  // fallback for databases that don't have the planning_prefs column yet.
  async function saveWorkPlan(plan: WorkPlanSettings) {
    setWorkPlan(plan);
    try { if (userId) localStorage.setItem(workPlanKey(userId), JSON.stringify(plan)); } catch { /* storage blocked */ }
    if (!userId) return;
    const { error } = await supabase.from('profiles').update({ planning_prefs: plan }).eq('id', userId);
    if (error) console.warn('[work plan] saved in this browser only:', error.message);
  }

  async function saveSessions(byTask: Map<string, TaskSession[]>): Promise<string | null> {
    if (byTask.size === 0) return null;
    const writes = await Promise.all([...byTask].map(([id, sessions]) => supabase.from('tasks').update({ sessions }).eq('id', id)));
    const failed = writes.find(w => w.error);
    if (failed) return failed.error!.message;
    setTasks(prev => prev.map(t => byTask.has(String(t.id)) ? { ...t, sessions: byTask.get(String(t.id))! } : t));
    return null;
  }

  const asRows = (changed: Record<string, TrackedSession[]>) =>
    new Map(Object.entries(changed).map(([id, list]) => [id, list.map(sessionToRow)]));

  /** Reflows every plannable task in `taskList` and saves what changed. */
  async function reflowAndSave(taskList: Task[], extraWrites = new Map<string, TaskSession[]>()) {
    const now = Date.now();
    const result = reflow(trackedTasks(taskList), fixedBusyIntervals(events, taskList, now), plannerPrefs(), now);
    const writes = new Map([...extraWrites, ...asRows(result.changed)]);
    const saveError = await saveSessions(writes);
    return { ...result, saveError };
  }

  // The plan follows reality: whenever events or tasks change (a check-in, a new or moved event,
  // a Google sync…) or time passes, missed work is planned again and clashing sessions move.
  // Sessions that are fine stay where they are.
  useEffect(() => {
    // Wait for the profile: it decides working hours.
    if (!profile || reflowQueued.current) return;
    const now = Date.now();
    const plannable = trackedTasks(tasks);
    if (plannable.length === 0) return;
    if (Object.keys(reflow(plannable, fixedBusyIntervals(events, tasks, now), plannerPrefs(), now).changed).length === 0) return;

    recentAutoReplans.current = [...recentAutoReplans.current.filter(t => now - t < LOOP_WINDOW_MS), now];
    if (recentAutoReplans.current.length > LOOP_LIMIT) {
      console.warn('[planner] replanning keeps changing the plan; pausing until the next change');
      return;
    }

    reflowQueued.current = true;
    serially(async () => {
      reflowQueued.current = false;
      const latest = await readLatestTasks();
      const result = await reflowAndSave(latest);
      if (result.saveError) {
        showMessage({ text: `Couldn't update your plan: ${result.saveError}`, error: true });
        return;
      }
      const text = describeChanges(result.changes, result.atRisk, titleLookup(latest));
      if (text) showMessage({ text: `Plan updated. ${text}`, error: false });
    });
    // Only a change to events, tasks, the clock, the profile or the estimate ratio can need a replan; the helpers read the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tasks, nowMs, profile, ratio]);

  /** Work that no longer fits anywhere before its deadline. Shown until it's dealt with. */
  const atRisk = useMemo(
    () => atRiskTasks(trackedTasks(tasks), nowMs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, nowMs, ratio],
  );

  /** Shows what a plan did: tasks that didn't fit, or went over the daily limit, or `label`. */
  function reportPlan(result: ReplanResult, taskList: Task[], label: string, plan: WorkPlanSettings | null = workPlan) {
    if (result.saveError) {
      showMessage({ text: `Couldn't save the plan: ${result.saveError}`, error: true });
      return;
    }
    const title = titleLookup(taskList);
    const lines = result.unplaced.map(u => `"${title(u.taskId)}" couldn't be scheduled. ${u.reason}`);
    const limit = (plan ?? DEFAULT_WORK_PLAN).dailyMinutes / 60;
    const over = result.overLimit.map(id =>
      `"${title(id)}" needed more than your ${limit}h daily limit to finish before its deadline.`);
    if (lines.length) showMessage({ text: [...lines, ...over].join(' '), error: true });
    else if (label || over.length) showMessage({ text: [label, ...over].filter(Boolean).join(' '), error: false }, over.length ? 9000 : 4000);
  }

  /**
   * Re-plans one task after it's created or edited. Its past sessions (and what got done in
   * them) are kept; only the work still left is planned again.
   */
  async function replanTask(taskList: Task[], id: string) {
    await serially(async () => {
      const latest = await readLatestTasks();
      const target = latest.find(t => String(t.id) === id);
      if (!target) return;
      const stripped = withoutMovableSessions(target, Date.now());
      const result = await reflowAndSave(latest.map(t => t === target ? stripped : t), new Map([[id, stripped.sessions]]));
      const mine = result.atRisk.filter(r => r.taskId === id);
      reportPlan({
        sessions: [], saveError: result.saveError ?? undefined,
        unplaced: isPlannable(stripped) ? mine.map(r => ({ taskId: r.taskId, reason: r.reason })) : [],
        overLimit: result.overLimit.filter(x => x === id),
      }, taskList, '');
    });
  }

  /** Plans the work left on every task from scratch, keeping the past and anything pinned. */
  async function planWeek(plan: WorkPlanSettings | null = workPlan) {
    // First time: ask how they like to work before planning anything.
    if (!plan) {
      setShowWorkPlan(true);
      return;
    }
    setPlanning(true);
    await serially(async () => {
      const latest = await readLatestTasks();
      const now = Date.now();
      const targets = trackedTasks(latest, plan);
      const bases = new Map(targets.map(t => [t.id, replanBasis(t, now)]));
      const kept = [...bases.values()].flatMap(b => b.keep);
      // Kept upcoming sessions and time the user can't make are off limits; worked time counts toward each day's limit.
      const keptBusy = kept.filter(s => s.endMs > now).map(s => ({ startMs: s.startMs, endMs: s.endMs }));
      const load = kept.filter(s => s.status !== 'skipped').map(s => ({ startMs: s.startMs, endMs: s.endMs }));
      const result = planSessions(
        targets.map(t => ({ ...t, durationMinutes: bases.get(t.id)!.needMinutes })),
        [...fixedBusyIntervals(events, latest, now), ...keptBusy], plannerPrefs(plan), now, PLANNING_HORIZON_DAYS, load,
      );
      const writes = new Map<string, TaskSession[]>();
      for (const t of targets) {
        const fresh: TrackedSession[] = result.sessions.filter(s => s.taskId === t.id)
          .map(s => ({ startMs: s.startMs, endMs: s.endMs, status: 'planned' }));
        writes.set(t.id, [...bases.get(t.id)!.keep, ...fresh].sort((a, b) => a.startMs - b.startMs).map(sessionToRow));
      }
      const saveError = await saveSessions(writes);
      const planned = new Set(result.sessions.map(s => s.taskId)).size;
      reportPlan({ ...result, saveError: saveError ?? undefined }, latest,
        planned ? `Planned ${planned} task${planned === 1 ? '' : 's'} into your free time.` : 'Nothing to plan — add a duration to a task to schedule it.', plan);
    }).finally(() => setPlanning(false));
  }

  /** Records what happened to a session (or pins it). The watcher then replans around it. */
  async function updateTaskSession(taskId: string, session: TaskSession, change: CheckIn | { pinned: boolean }) {
    await serially(async () => {
      const task = (await readLatestTasks()).find(t => String(t.id) === taskId);
      // Found by its times, not its position: a replan may have reordered the list since.
      const index = task?.sessions?.findIndex(s => s.start === session.start && s.end === session.end) ?? -1;
      if (!task || !isActiveTask(task) || index < 0) return;
      const updated = updateSession(task, index, change);
      const saveError = await saveSessions(new Map([[taskId, updated.sessions]]));
      if (saveError) showMessage({ text: `Couldn't save that: ${saveError}`, error: true });
    });
  }

  /**
   * Moves a session to where the user dropped it and pins it there. The watcher then moves the
   * rest of the plan around it.
   */
  async function moveTaskSession(taskId: string, session: TaskSession, startMs: number, endMs: number) {
    if (startMs < Date.now()) {
      showMessage({ text: "Work sessions can't be moved into the past.", error: true }, 4000);
      return;
    }
    await serially(async () => {
      const task = (await readLatestTasks()).find(t => String(t.id) === taskId);
      const index = task?.sessions?.findIndex(s => s.start === session.start && s.end === session.end) ?? -1;
      if (!task || !isActiveTask(task) || index < 0) return;
      const moved: TaskSession = {
        ...task.sessions[index], start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), status: 'planned', pinned: true,
      };
      const sessions = task.sessions.map((s, i) => (i === index ? moved : s))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      const saveError = await saveSessions(new Map([[taskId, sessions]]));
      showMessage(saveError
        ? { text: `Couldn't move that session: ${saveError}`, error: true }
        : { text: `Moved "${task.title}" and pinned it there. The rest of your plan works around it.`, error: false }, 5000);
    });
  }

  return {
    planning, planMessage, planWeek, replanTask, saveWorkPlan, showWorkPlan, setShowWorkPlan,
    atRisk, nowMs, updateTaskSession, moveTaskSession, history, ratio,
  };
}
