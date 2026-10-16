// Keyboard shortcuts on the calendar page: which key does what, and when keys are left alone.

export type ShortcutAction =
  | 'newTask' | 'newEvent' | 'today' | 'prev' | 'next'
  | 'viewDay' | 'viewWeek' | 'viewMonth' | 'viewYear'
  | 'quickAdd' | 'help' | 'close';

/** Shown in the shortcuts list, in this order. */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['N'], label: 'New task' },
  { keys: ['E'], label: 'New event' },
  { keys: ['T'], label: 'Go to today' },
  { keys: ['←', 'J'], label: 'Previous day, week, month or year' },
  { keys: ['→', 'K'], label: 'Next day, week, month or year' },
  { keys: ['D'], label: 'Day view' },
  { keys: ['W'], label: 'Week view' },
  { keys: ['M'], label: 'Month view' },
  { keys: ['Y'], label: 'Year view' },
  { keys: ['/'], label: 'Quick add' },
  { keys: ['?'], label: 'Show these shortcuts' },
  { keys: ['Esc'], label: 'Close the open window' },
];

const KEYS: Record<string, ShortcutAction> = {
  n: 'newTask', e: 'newEvent', t: 'today',
  arrowleft: 'prev', j: 'prev', arrowright: 'next', k: 'next',
  d: 'viewDay', w: 'viewWeek', m: 'viewMonth', y: 'viewYear',
  '/': 'quickAdd', '?': 'help', escape: 'close',
};

/** Where typing goes: keys pressed there are text, not shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/**
 * The shortcut a key press means, or null. Keys with Ctrl/⌘/Alt are left to the browser, and
 * while typing or with a window open, only Esc counts.
 */
export function shortcutFor(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>,
  windowOpen: boolean,
): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const action = KEYS[e.key.toLowerCase()] ?? null;
  if (action === 'close') return windowOpen ? 'close' : null;
  if (windowOpen || isTypingTarget(e.target)) return null;
  return action;
}
