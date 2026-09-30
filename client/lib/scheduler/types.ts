export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Requirement = 'required' | 'optional';

export interface Interval {
  startMs: number;
  endMs: number;
}

export interface TimeWindow {
  kind: 'absolute' | 'weekly';
  // absolute
  start?: string;
  end?: string;
  // weekly
  daysOfWeek?: number[]; // JS convention: 0 = Sunday ... 6 = Saturday
  timeStart?: string; // "HH:MM"
  timeEnd?: string; // "HH:MM"
}

export interface SchedulingConstraints {
  allowedWindows?: TimeWindow[];
  blackoutWindows?: TimeWindow[];
  earliestStart?: string;
  latestEnd?: string;
  preferredWindows?: TimeWindow[];
}

export interface SchedulerTask {
  id: string;
  name: string;
  priority: Priority;
  requirement: Requirement;
  durationMinutes: number;
  constraints?: SchedulingConstraints;
}

export interface TaskPlacement {
  task: SchedulerTask;
  interval: Interval;
}

export interface ScheduleResult {
  status: string;
  placements: { taskId: string; taskName: string; start: string; end: string }[];
}
