// Shapes shared by the calendar page, its components and hooks.
import type { SessionStatus } from '../scheduler';

export type ViewMode = 'Day' | 'Week' | 'Month' | 'Year';

export type RecurrenceType = 'none' | 'daily' | 'weekly';
export interface Recurrence {
  type: RecurrenceType;
  days?: number[];
}

/** One block on the calendar: a stored event, or an entry derived from a task ("sched-" ids). */
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  description: string;
  color?: string;
  recurrence?: Recurrence | null;
  google_event_id?: string | null;
  _recurringBaseId?: string;
  isTaskDue?: boolean;
  isTaskSession?: boolean;
  /** For a work session: its index in the task's sessions, and what became of it. */
  sessionIndex?: number;
  sessionStatus?: SessionStatus;
  sessionPinned?: boolean;
  taskDurationMin?: number;
}

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type EnergyLevel = 'Low' | 'Medium' | 'High';

/**
 * A planned work session, as stored on the task row (ISO timestamps). Sessions saved before
 * check-ins existed have only start and end.
 */
export interface TaskSession {
  start: string;
  end: string;
  status?: SessionStatus;
  /** For 'partial': minutes of it that got done. */
  doneMinutes?: number;
  /** Placed by the user: replanning never moves it. */
  pinned?: boolean;
}

/** A row of the `tasks` table. */
export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  priority: TaskPriority;
  energy_level: EnergyLevel;
  deadline: string | null;
  is_fixed_time: boolean;
  fixed_start: string | null;
  fixed_end: string | null;
  is_splittable: boolean;
  chunk_min: number | null;
  chunk_max: number | null;
  color: string;
  is_completed: boolean;
  created_at: string;
  sessions: unknown;
  /** Missing on databases without the learning columns yet. */
  estimated_minutes?: number | null;
  actual_minutes?: number | null;
}

/** A task as the page works with it. */
export interface Task {
  id: string;
  title: string;
  description: string;
  duration: number;
  durationMinutes: number;
  priority: TaskPriority;
  energyLevel: EnergyLevel;
  deadline: string | null;
  isFixedTime: boolean;
  fixedStart: string | null;
  fixedEnd: string | null;
  isSplittable: boolean;
  chunkSize: { min: number | null; max: number | null } | null;
  color: string;
  isCompleted: boolean;
  isDeleted: boolean;
  createdAt: string;
  sessions: TaskSession[];
  /** The duration first given, before any edits; compared with the time it really took. */
  estimatedMinutes: number | null;
  /** Time worked on it, recorded when it's completed. */
  actualMinutes: number | null;
}

/** A row of the `profiles` table, plus the signed-in user's email. */
export interface Profile {
  id?: string;
  email?: string;
  name?: string | null;
  phone?: string | null;
  work_time?: string | null;
  work_style?: string | null;
  theme_color?: string | null;
  gcal_email?: string | null;
  planning_prefs?: unknown;
}

export interface StatusMessage {
  text: string;
  error?: boolean;
}
