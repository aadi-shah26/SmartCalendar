// Plain-language summaries of what replanning did, for the sidebar.
import type { AtRisk, SessionChange } from '../scheduler';
import { formatDuration } from './dates';

type Title = (taskId: string) => string;

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const minutesOf = (iv: { startMs: number; endMs: number }) => Math.round((iv.endMs - iv.startMs) / 60_000);

/** One line per change, at most `max`, then a count of the rest. Removals of work that's now at risk are left to the at-risk notice. */
export function describeChanges(changes: SessionChange[], atRisk: AtRisk[], title: Title, max = 4): string {
  const risky = new Set(atRisk.map(r => r.taskId));
  const lines: string[] = [];
  for (const c of changes) {
    const name = `"${title(c.taskId)}"`;
    if (c.kind === 'added' && c.to) lines.push(`Planned ${formatDuration(minutesOf(c.to))} of ${name} for ${when(c.to.startMs)}.`);
    else if (c.kind === 'moved' && c.from && c.to) {
      const why = c.displacedBy ? ` to make room for "${title(c.displacedBy)}"` : '';
      lines.push(`Moved ${name} from ${when(c.from.startMs)} to ${when(c.to.startMs)}${why}.`);
    } else if (c.kind === 'shortened' && c.from && c.to) lines.push(`Shortened ${name} on ${when(c.from.startMs)} to ${formatDuration(minutesOf(c.to))}.`);
    else if (c.kind === 'removed' && c.from && !risky.has(c.taskId)) lines.push(`Removed the ${name} session on ${when(c.from.startMs)}; it's no longer needed.`);
  }
  if (lines.length <= max) return lines.join(' ');
  const rest = lines.length - max;
  return `${lines.slice(0, max).join(' ')} And ${rest} more change${rest === 1 ? '' : 's'}.`;
}

/** The sticky notice for work that no longer fits. */
export function describeAtRisk(r: AtRisk, title: Title): string {
  return `"${title(r.taskId)}" has ${formatDuration(r.minutes)} of work with no time left for it. ${r.reason}`;
}
