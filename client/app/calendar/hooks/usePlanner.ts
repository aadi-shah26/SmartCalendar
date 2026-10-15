'use client';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
  hasConflicts, planSessions, prefsForWorkTime, resolveConflicts, DEFAULT_WORK_PLAN, PLANNING_HORIZON_DAYS,
  type PlannerPrefs, type PlanResult, type WorkPlanSettings,
} from '../../../lib/scheduler';
import { fixedBusyIntervals, isActiveTask, isPlannable, otherSessions, toPlannerTask, toScheduledTask } from '../../../lib/calendar/tasks';
import type { CalendarEvent, Profile, StatusMessage, Task } from '../../../lib/calendar/types';
import { workPlanKey } from '../../../lib/calendar/workPlan';

type Span = { startMs: number; endMs: number };
export type ReplanResult = PlanResult & { saveError?: string };

const titleLookup = (taskList: Task[]) => (id: string) => taskList.find(t => String(t.id) === id)?.title ?? 'A task';

/**
 * Smart scheduling: plans task work sessions into free time ("Plan my week", and after a task
 * is added or edited), and moves sessions that a new or changed event now clashes with.
 */
export function usePlanner({ events, tasks, setTasks, profile, userId, workPlan, setWorkPlan }: {
  events: CalendarEvent[]; tasks: Task[]; setTasks: Dispatch<SetStateAction<Task[]>>;
  profile: Profile | null; userId: string | null;
  workPlan: WorkPlanSettings | null; setWorkPlan: (plan: WorkPlanSettings) => void;
}) {
  const [planMessage, setPlanMessage] = useState<StatusMessage | null>(null);
  const [planning, setPlanning] = useState(false);
  const [showWorkPlan, setShowWorkPlan] = useState(false);
  // Set while sessions are being written, so the conflict watcher doesn't race a re-plan.
  const schedulingInFlight = useRef(false);

  const plannerPrefs = (plan: WorkPlanSettings | null = workPlan) =>
    prefsForWorkTime(profile?.work_time, profile?.work_style, plan ?? DEFAULT_WORK_PLAN);

  // Saved on the profile so it follows the user across devices, and in this browser as a
  // fallback for databases that don't have the planning_prefs column yet.
  async function saveWorkPlan(plan: WorkPlanSettings) {
    setWorkPlan(plan);
    try { if (userId) localStorage.setItem(workPlanKey(userId), JSON.stringify(plan)); } catch { /* storage blocked */ }
    if (!userId) return;
    const { error } = await supabase.from('profiles').update({ planning_prefs: plan }).eq('id', userId);
    if (error) console.warn('[work plan] saved in this browser only:', error.message);
  }

  async function saveSessions(byTask: Map<string, Span[]>): Promise<string | null> {
    const asRows = new Map([...byTask].map(([id, list]) => [id, list.map(s => ({
      start: new Date(s.startMs).toISOString(), end: new Date(s.endMs).toISOString(),
    }))]));
    const writes = await Promise.all([...asRows].map(([id, sessions]) => supabase.from('tasks').update({ sessions }).eq('id', id)));
    const failed = writes.find(w => w.error);
    if (failed) return failed.error!.message;
    setTasks(prev => prev.map(t => asRows.has(String(t.id)) ? { ...t, sessions: asRows.get(String(t.id))! } : t));
    return null;
  }

  // Re-plans the given tasks around everything else and saves their new sessions. Tasks in
  // `ids` that can't be planned (completed, fixed-time, no duration) get their sessions cleared.
  async function replanTasks(taskList: Task[], ids: Set<string>, prefs: PlannerPrefs = plannerPrefs()): Promise<ReplanResult> {
    schedulingInFlight.current = true;
    try {
      const targets = taskList.filter(t => ids.has(String(t.id)) && isPlannable(t));
      const others = otherSessions(taskList, ids);
      const busy = [...fixedBusyIntervals(events, taskList), ...others];
      const result = planSessions(targets.map(toPlannerTask), busy, prefs, Date.now(), PLANNING_HORIZON_DAYS, others);
      const byTask = new Map<string, Span[]>();
      ids.forEach(id => byTask.set(id, []));
      for (const s of result.sessions) byTask.get(s.taskId)?.push(s);
      const saveError = await saveSessions(byTask);
      return saveError ? { ...result, saveError } : result;
    } finally {
      schedulingInFlight.current = false;
    }
  }

  // Conflict resolution: whenever events or tasks change (a new or moved event, a Google
  // sync, a task becoming fixed-time…), any work session that now clashes is moved to the
  // next good free slot. Sessions that don't clash are never touched.
  useEffect(() => {
    if (schedulingInFlight.current) return;
    const scheduled = tasks.filter(t => isPlannable(t) && t.sessions?.length).map(toScheduledTask);
    if (scheduled.length === 0) return;
    const busy = fixedBusyIntervals(events, tasks);
    const now = Date.now();
    if (!hasConflicts(scheduled, busy, now)) return;

    schedulingInFlight.current = true;
    (async () => {
      try {
        const { changed, moves } = resolveConflicts(scheduled, busy, plannerPrefs(), now);
        const saveError = await saveSessions(new Map(Object.entries(changed)));
        if (saveError) {
          setPlanMessage({ text: `Couldn't reschedule around a conflict: ${saveError}`, error: true });
          return;
        }
        const title = titleLookup(tasks);
        const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
        const lines = moves.map(m => m.to
          ? `Moved "${title(m.taskId)}" from ${when(m.from.startMs)} to ${when(m.to.startMs)}.`
          : `Removed "${title(m.taskId)}" session on ${when(m.from.startMs)} — no free time left before its deadline.`);
        const dropped = moves.some(m => !m.to);
        setPlanMessage({ text: `Schedule conflict fixed. ${lines.join(' ')}`, error: dropped });
        window.setTimeout(() => setPlanMessage(null), 9000);
      } finally {
        schedulingInFlight.current = false;
      }
    })();
    // Only a change to events or tasks can create a conflict; the helpers read the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tasks]);

  /** Shows what a plan did: tasks that didn't fit, or went over the daily limit, or `label`. */
  function reportPlan(result: ReplanResult, taskList: Task[], label: string, plan: WorkPlanSettings | null = workPlan) {
    if (result.saveError) {
      setPlanMessage({ text: `Couldn't save the plan: ${result.saveError}`, error: true });
      return;
    }
    const title = titleLookup(taskList);
    const lines = result.unplaced.map(u => `"${title(u.taskId)}" couldn't be scheduled. ${u.reason}`);
    const limit = (plan ?? DEFAULT_WORK_PLAN).dailyMinutes / 60;
    const over = result.overLimit.map(id =>
      `"${title(id)}" needed more than your ${limit}h daily limit to finish before its deadline.`);
    if (lines.length) setPlanMessage({ text: [...lines, ...over].join(' '), error: true });
    else if (label || over.length) setPlanMessage({ text: [label, ...over].filter(Boolean).join(' '), error: false });
    else return;
    window.setTimeout(() => setPlanMessage(null), lines.length || over.length ? 9000 : 4000);
  }

  /** Re-plans one task after it's created or edited, and reports any problem. */
  async function replanTask(taskList: Task[], id: string) {
    reportPlan(await replanTasks(taskList, new Set([id])), taskList, '');
  }

  async function planWeek(plan: WorkPlanSettings | null = workPlan) {
    // First time: ask how they like to work before planning anything.
    if (!plan) {
      setShowWorkPlan(true);
      return;
    }
    setPlanning(true);
    try {
      const ids = new Set(tasks.filter(isActiveTask).map(t => String(t.id)));
      const result = await replanTasks(tasks, ids, plannerPrefs(plan));
      const planned = new Set(result.sessions.map(s => s.taskId)).size;
      reportPlan(result, tasks, planned ? `Planned ${planned} task${planned === 1 ? '' : 's'} into your free time.` : 'Nothing to plan — add a duration to a task to schedule it.', plan);
    } finally {
      setPlanning(false);
    }
  }

  return { planning, planMessage, planWeek, replanTask, saveWorkPlan, showWorkPlan, setShowWorkPlan };
}
