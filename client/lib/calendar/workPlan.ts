import type { WorkPlanSettings } from '../scheduler';

export function workPlanKey(userId: string) {
  return `sc-work-plan:${userId}`;
}

/** The user's saved work plan from their profile, or this browser, or null if never set. */
export function readWorkPlan(fromProfile: unknown, userId: string): WorkPlanSettings | null {
  let raw = fromProfile;
  if (!raw) {
    try { raw = JSON.parse(localStorage.getItem(workPlanKey(userId)) ?? 'null'); } catch { raw = null; }
  }
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<WorkPlanSettings>;
  if (typeof p.dailyMinutes !== 'number' || typeof p.sessionMinutes !== 'number' || !Array.isArray(p.workDays)) return null;
  return {
    dailyMinutes: p.dailyMinutes,
    sessionMinutes: p.sessionMinutes,
    workDays: p.workDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6),
    spread: p.spread === 'asap' ? 'asap' : 'steady',
  };
}
