'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { THEME_COLOR } from '../../../lib/calendar/colors';
import { computeTaskCalendarEvents } from '../../../lib/calendar/events';
import { isActiveTask, taskFromRow } from '../../../lib/calendar/tasks';
import type { CalendarEvent, Profile, Task } from '../../../lib/calendar/types';
import { readWorkPlan } from '../../../lib/calendar/workPlan';
import type { WorkPlanSettings } from '../../../lib/scheduler';

/**
 * The signed-in user's data: profile, events and tasks, loaded once on mount (sending
 * signed-out visitors to /login). `events` is everything on the calendar: the stored events
 * plus the entries derived from tasks ("sched-" ids).
 */
export function useCalendarData() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accentColor, setAccentColor] = useState(THEME_COLOR);
  const [storedEvents, setStoredEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  // How the user likes to work (daily limit, session length, days). null until they've said.
  const [workPlan, setWorkPlan] = useState<WorkPlanSettings | null>(null);

  useEffect(() => {
    const loadUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setUserId(session.user.id);

      const { data: eventRows, error: eventsError } = await supabase.from('events').select('*');
      if (!eventsError && eventRows) setStoredEvents(eventRows);

      const { data: taskRows, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (!tasksError && taskRows) setTasks(taskRows.map(taskFromRow));

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!profileError && profileRow) {
        setProfile({ ...profileRow, email: session.user.email });
        if (profileRow.theme_color) setAccentColor(profileRow.theme_color);
      } else {
        setProfile({ email: session.user.email });
      }
      setWorkPlan(readWorkPlan(profileRow?.planning_prefs, session.user.id));
    };
    loadUserData();
  }, [router]);

  // A task's calendar entries are derived straight from its own fields (including its saved
  // work sessions) and recomputed whenever tasks change, so the calendar can't drift from them.
  const taskEvents = useMemo(() => tasks.filter(isActiveTask).flatMap(computeTaskCalendarEvents), [tasks]);
  const events = useMemo(() => [...storedEvents, ...taskEvents], [storedEvents, taskEvents]);

  // Re-read events from the database (used after a Google sync).
  const reloadEvents = async () => {
    const { data, error } = await supabase.from('events').select('*');
    if (!error && data) setStoredEvents(data);
  };

  /** Saves the profile form. Resolves true when saved. */
  const saveProfile = async (draft: Profile): Promise<boolean> => {
    if (!userId) return false;
    const updates = {
      id: userId,
      name: draft.name ?? null,
      phone: draft.phone ?? null,
      work_time: draft.work_time ?? null,
      work_style: draft.work_style ?? null,
      theme_color: draft.theme_color ?? null,
      gcal_email: draft.gcal_email ?? null,
    };
    const { error } = await supabase.from('profiles').upsert(updates);
    if (error) return false;
    setProfile(prev => ({ ...(prev ?? {}), ...updates }));
    if (updates.theme_color) setAccentColor(updates.theme_color);
    return true;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return {
    userId, profile, accentColor, events, storedEvents, setStoredEvents, tasks, setTasks, workPlan, setWorkPlan,
    reloadEvents, saveProfile, signOut,
  };
}
