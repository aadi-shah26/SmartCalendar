import type { CalendarEvent } from './types';

export const HOUR_HEIGHT = 60; // px per hour in day/week views
export const DAY_HEIGHT = 24 * HOUR_HEIGHT;
export const TASK_PILL_HEIGHT = 22;
// Below this pixel height the time + title two-line layout doesn't fit
// (a 30-min block is ~28px), so the title gets sliced mid-glyph. Short
// blocks instead render title and time on a single, vertically centred line.
export const COMPACT_EVENT_HEIGHT = 44;
// Blocks never draw shorter than this, so a 15-min event stays readable
// (it overhangs its end slightly, as in Google Calendar).
export const MIN_EVENT_HEIGHT = 22;

/** Pixel offset of a time of day (in minutes since midnight) down the time grid. */
export function minutesToTop(minutes: number) {
  return (minutes / 60) * HOUR_HEIGHT;
}

export function getEventPosition(ev: CalendarEvent): { top: number; height: number } | null {
  const sp = ev.start_time.split(':').map(Number);
  const ep = ev.end_time.split(':').map(Number);
  if (sp.length < 2 || ep.length < 2 || isNaN(sp[0]) || isNaN(ep[0])) return null;
  const startMin = sp[0] * 60 + (sp[1] ?? 0);
  const endMin = ep[0] * 60 + (ep[1] ?? 0);
  if (ev.isTaskDue) {
    const top = Math.min(minutesToTop(startMin), DAY_HEIGHT - TASK_PILL_HEIGHT);
    return { top, height: TASK_PILL_HEIGHT };
  }
  const durMin = Math.max(endMin - startMin, 15);
  return { top: minutesToTop(startMin), height: Math.max(minutesToTop(durMin), MIN_EVENT_HEIGHT) };
}

export interface EventLayout {
  ev: CalendarEvent;
  top: number;
  height: number;
  /** Column this event sits in, and how many columns its overlap group is split into. */
  col: number;
  totalCols: number;
}

/** Positions one day's events, putting overlapping ones side by side. */
export function computeEventLayouts(dayEvents: CalendarEvent[]): EventLayout[] {
  type Item = { ev: CalendarEvent; top: number; height: number };
  const items: Item[] = dayEvents
    .map(ev => { const p = getEventPosition(ev); return p ? { ev, ...p } : null; })
    .filter((x): x is Item => x !== null)
    .sort((a, b) => a.top - b.top);
  const overlaps = (a: Item, b: Item) => a.top < b.top + b.height && a.top + a.height > b.top;
  const n = items.length;
  const cols: number[] = [];
  for (let i = 0; i < n; i++) {
    const used = new Set<number>();
    for (let j = 0; j < i; j++) {
      if (overlaps(items[j], items[i])) used.add(cols[j]);
    }
    let c = 0; while (used.has(c)) c++;
    cols.push(c);
  }
  return items.map((item, i) => {
    let maxCol = cols[i];
    for (let j = 0; j < n; j++) {
      if (overlaps(items[j], item)) maxCol = Math.max(maxCol, cols[j]);
    }
    return { ...item, col: cols[i], totalCols: maxCol + 1 };
  });
}
