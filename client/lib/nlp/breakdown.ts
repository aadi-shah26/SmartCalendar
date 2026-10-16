// Breaking a big task into smaller steps with Gemini: the prompt, a validated version of the
// model's reply, and staggered deadlines so the steps get planned in order. Pure.

export interface Step {
  title: string;
  minutes: number;
}

export interface BreakdownRequest {
  title: string;
  description: string;
  /** The whole task's estimate, if it has one. */
  durationMinutes: number | null;
}

export const MIN_STEPS = 2;
export const MAX_STEPS = 8;
const STEP_ROUND = 5;
const MAX_TITLE = 80;

export const BREAKDOWN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Short, starts with a verb, e.g. "Outline the argument".' },
          minutes: { type: 'INTEGER', description: 'How long this step takes.' },
        },
        required: ['title', 'minutes'],
      },
    },
  },
  required: ['steps'],
};

export function buildBreakdownInstructions(req: BreakdownRequest): string {
  return [
    'You help a student or professional break one task from their to-do list into concrete steps they can schedule.',
    'Return 3 to 7 steps in the order they should be done. Each step is one sitting of focused work.',
    'Titles are short (under 8 words), start with a verb, and are specific to this task, not generic advice.',
    "Don't add steps for breaks, planning the steps, or rewards.",
    req.durationMinutes
      ? `The whole task should take about ${req.durationMinutes} minutes, so the steps' minutes should add up to that.`
      : 'Estimate realistic minutes for each step.',
  ].join('\n');
}

export function breakdownPrompt(req: BreakdownRequest): string {
  return req.description ? `Task: ${req.title}\nDetails: ${req.description}` : `Task: ${req.title}`;
}

const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/**
 * The model's steps, cleaned up: titles trimmed and de-duplicated, minutes rounded to 5, at most
 * MAX_STEPS. With a task duration, minutes are scaled to add up to it. Throws when fewer than
 * MIN_STEPS usable steps come back.
 */
export function normalizeBreakdown(raw: unknown, totalMinutes: number | null): Step[] {
  const list = (raw as { steps?: unknown })?.steps;
  if (!Array.isArray(list)) throw new Error('No steps came back.');
  const seen = new Set<string>();
  const steps: Step[] = [];
  for (const item of list) {
    const title = typeof item?.title === 'string' ? item.title.trim().replace(/\s+/g, ' ').replace(/\.$/, '').slice(0, MAX_TITLE) : '';
    const minutes = Number(item?.minutes);
    if (!title || seen.has(title.toLowerCase()) || !(minutes > 0)) continue;
    seen.add(title.toLowerCase());
    steps.push({ title, minutes });
    if (steps.length === MAX_STEPS) break;
  }
  if (steps.length < MIN_STEPS) throw new Error("Couldn't split that into steps.");
  return fitToTotal(steps, totalMinutes);
}

/** Scales step minutes so they add up to `total` (when given), each a multiple of 5. */
export function fitToTotal(steps: Step[], total: number | null): Step[] {
  if (!total || total <= 0) return steps.map(s => ({ ...s, minutes: roundTo(s.minutes, STEP_ROUND) }));
  const sum = steps.reduce((n, s) => n + s.minutes, 0);
  const scaled = steps.map(s => ({ ...s, minutes: roundTo((s.minutes / sum) * total, STEP_ROUND) }));
  // Put any rounding difference on the longest step, so the total stays right.
  const diff = roundTo(total, STEP_ROUND) - scaled.reduce((n, s) => n + s.minutes, 0);
  if (diff !== 0) {
    const longest = scaled.reduce((best, s, i) => (s.minutes > scaled[best].minutes ? i : best), 0);
    scaled[longest] = { ...scaled[longest], minutes: Math.max(STEP_ROUND, scaled[longest].minutes + diff) };
  }
  return scaled;
}

/**
 * A deadline for each step, so the planner does them in order: spread between now and the task's
 * deadline in proportion to the work before each step, on that day at the task's own due time
 * (a 5 PM deadline gives steps due at 5 PM on earlier days). Never before now or after the task's
 * deadline, and never earlier than the step before. The last step keeps the task's deadline.
 * Without a deadline (or one already past), steps keep what the task has.
 */
export function stepDeadlines(nowMs: number, deadline: string | null, minutes: number[]): (string | null)[] {
  const endMs = deadline ? Date.parse(deadline) : NaN;
  if (!(endMs > nowMs)) return minutes.map(() => (deadline && Number.isFinite(endMs) ? deadline : null));
  const end = new Date(endMs);
  const total = minutes.reduce((n, m) => n + m, 0) || 1;
  const DAY = 24 * 60 * 60_000;
  let done = 0;
  let previous = nowMs;
  return minutes.map((m, i) => {
    done += m;
    if (i === minutes.length - 1) return end.toISOString();
    const point = new Date(nowMs + (endMs - nowMs) * (done / total));
    // That day, at the task's due time; the next day if that's already past.
    let at = new Date(point.getFullYear(), point.getMonth(), point.getDate(), end.getHours(), end.getMinutes()).getTime();
    if (at <= nowMs) at += DAY;
    at = Math.min(Math.max(at, previous), endMs);
    previous = at;
    return new Date(at).toISOString();
  });
}
