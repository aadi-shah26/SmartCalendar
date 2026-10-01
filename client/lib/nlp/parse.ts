// Turns a model's JSON reply for a natural-language input ("essay due friday, ~3h, high
// priority") into a validated event or task. Pure: no network, no env — easy to test.

export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
export type Energy = 'Low' | 'Medium' | 'High';

export interface ParsedEvent {
  kind: 'event';
  title: string;
  description: string;
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  recurrence: { type: 'none' | 'daily' | 'weekly'; days: number[] };
}

export interface ParsedTask {
  kind: 'task';
  title: string;
  description: string;
  deadline: string | null; // YYYY-MM-DDTHH:MM, local time
  durationMinutes: number | null;
  priority: Priority;
  energyLevel: Energy;
}

export type ParsedItem = ParsedEvent | ParsedTask;

export interface ParseContext {
  /** Local wall-clock "now" as YYYY-MM-DDTHH:MM. */
  now: string;
  weekday: string;
  timezone: string;
}

/** JSON schema for the model's structured output (Gemini `responseSchema` dialect). */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['event', 'task'] },
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    date: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD. Event day, or task due date.' },
    start_time: { type: 'STRING', nullable: true, description: 'HH:MM 24h. Events only.' },
    end_time: { type: 'STRING', nullable: true, description: 'HH:MM 24h. Events only.' },
    due_time: { type: 'STRING', nullable: true, description: 'HH:MM 24h. Tasks only.' },
    duration_minutes: { type: 'INTEGER', nullable: true, description: 'Tasks: how long the work takes.' },
    priority: { type: 'STRING', nullable: true, enum: ['Low', 'Medium', 'High', 'Critical'] },
    energy_level: { type: 'STRING', nullable: true, enum: ['Low', 'Medium', 'High'] },
    repeat: { type: 'STRING', enum: ['none', 'daily', 'weekly'] },
    repeat_days: { type: 'ARRAY', items: { type: 'INTEGER' }, description: '0=Sunday … 6=Saturday, for weekly repeats.' },
  },
  required: ['kind', 'title', 'repeat'],
};

export function buildInstructions(ctx: ParseContext): string {
  return [
    'You convert one line a user typed into a calendar app into structured data.',
    `It is currently ${ctx.weekday} ${ctx.now.replace('T', ' ')} in ${ctx.timezone}. Resolve relative dates ("tomorrow", "friday", "next week") against that.`,
    'A weekday name means its next occurrence (today counts only if that time has not passed yet).',
    '',
    'Decide the kind:',
    '- "event": something that happens at a set time that the user attends — class, meeting, appointment, practice, party.',
    '- "task": something to do or finish — homework, an essay, studying, errands — usually with "due"/"by"/"finish" or an effort estimate.',
    '',
    'Rules:',
    '- title: short and clean, without the date/time words. Keep the user\'s wording otherwise.',
    '- Events: date, start_time, end_time. If only a length is given ("2 hour meeting at 3"), end_time = start + length. If no end is given, leave end_time null.',
    '- Tasks: date + due_time for the deadline; duration_minutes is how long the work takes ("about 3 hours" = 180).',
    '- priority/energy_level only if stated or clearly implied ("urgent" = High, "asap" = Critical). Otherwise null.',
    '- repeat: "every monday and wednesday" = weekly [1,3]; "every day" = daily. Otherwise none.',
    '- description: any extra detail the user gave that is not captured elsewhere, else empty.',
    '- Never invent details. Use null for anything not stated.',
    '- Times are 24-hour HH:MM. "noon" = 12:00, "midnight" = 00:00, "3" with no am/pm means 15:00 unless it is clearly morning.',
  ].join('\n');
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Critical'];
const ENERGIES: Energy[] = ['Low', 'Medium', 'High'];

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function validDate(v: unknown): string | null {
  const s = str(v);
  if (!DATE.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : s;
}

/** Accepts "9:05", "09:05", "09:05:00"; returns zero-padded "HH:MM" or null. */
function validTime(v: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(str(v));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fromMin(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

export function normalizeParse(raw: unknown, ctx: ParseContext): ParsedItem {
  if (!raw || typeof raw !== 'object') throw new Error('The reply was not an object.');
  const r = raw as Record<string, unknown>;
  const title = str(r.title).slice(0, 200);
  if (!title) throw new Error('Could not find a title in that.');
  const description = str(r.description).slice(0, 2000);
  const today = ctx.now.slice(0, 10);

  if (r.kind === 'event') {
    const start = validTime(r.start_time) ?? '09:00';
    let end = validTime(r.end_time);
    if (!end || toMin(end) <= toMin(start)) end = fromMin(Math.min(toMin(start) + 60, 23 * 60 + 59));
    const repeat = r.repeat === 'daily' || r.repeat === 'weekly' ? r.repeat : 'none';
    const days = Array.isArray(r.repeat_days)
      ? [...new Set(r.repeat_days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [];
    return {
      kind: 'event',
      title,
      description,
      date: validDate(r.date) ?? today,
      startTime: start,
      endTime: end,
      recurrence: repeat === 'weekly' && days.length === 0 ? { type: 'none', days: [] } : { type: repeat, days: repeat === 'weekly' ? days : [] },
    };
  }

  if (r.kind === 'task') {
    const date = validDate(r.date);
    const duration = typeof r.duration_minutes === 'number' && Number.isFinite(r.duration_minutes)
      ? Math.min(Math.max(Math.round(r.duration_minutes), 0), 24 * 60)
      : null;
    return {
      kind: 'task',
      title,
      description,
      deadline: date ? `${date}T${validTime(r.due_time) ?? '23:59'}` : null,
      durationMinutes: duration || null,
      priority: PRIORITIES.includes(r.priority as Priority) ? (r.priority as Priority) : 'Medium',
      energyLevel: ENERGIES.includes(r.energy_level as Energy) ? (r.energy_level as Energy) : 'Medium',
    };
  }

  throw new Error('Could not tell whether that is an event or a task.');
}
