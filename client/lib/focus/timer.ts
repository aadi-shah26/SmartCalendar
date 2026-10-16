// The Pomodoro timer: focus rounds with short breaks, and a long break after every few rounds.
// Pure: every change takes the current time, and the time left is worked out from timestamps,
// so the clock stays right even when the browser slows timers in a background tab.

export type Phase = 'focus' | 'short' | 'long';

export interface TimerSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** Focus rounds before a long break. */
  rounds: number;
}

export const PRESETS: { label: string; settings: TimerSettings }[] = [
  { label: 'Classic · 25 / 5', settings: { focusMin: 25, shortMin: 5, longMin: 15, rounds: 4 } },
  { label: 'Deep · 50 / 10', settings: { focusMin: 50, shortMin: 10, longMin: 20, rounds: 3 } },
  { label: 'Quick · 15 / 3', settings: { focusMin: 15, shortMin: 3, longMin: 10, rounds: 4 } },
];
export const DEFAULT_SETTINGS = PRESETS[0].settings;

export const PHASE_LABEL: Record<Phase, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };

export interface TimerState {
  phase: Phase;
  settings: TimerSettings;
  /** Time left in the phase as of `runningSince` (or now, when paused). */
  remainingMs: number;
  /** When the clock was last started; null while paused. */
  runningSince: number | null;
  /** Focus rounds finished (not skipped). */
  completedFocus: number;
  /** Focus time banked so far, not counting the stretch running now. */
  focusedMs: number;
}

const MIN = 60_000;

export function phaseMs(phase: Phase, s: TimerSettings): number {
  return (phase === 'focus' ? s.focusMin : phase === 'short' ? s.shortMin : s.longMin) * MIN;
}

/** After focus comes a break (long every `rounds` rounds); after a break, focus. */
export function nextPhase(phase: Phase, completedFocus: number, s: TimerSettings): Phase {
  if (phase !== 'focus') return 'focus';
  return completedFocus > 0 && completedFocus % s.rounds === 0 ? 'long' : 'short';
}

export function initialTimer(settings: TimerSettings = DEFAULT_SETTINGS): TimerState {
  return { phase: 'focus', settings, remainingMs: phaseMs('focus', settings), runningSince: null, completedFocus: 0, focusedMs: 0 };
}

export const isRunning = (t: TimerState) => t.runningSince !== null;

export function remainingMs(t: TimerState, now: number): number {
  return t.runningSince === null ? t.remainingMs : Math.max(0, t.remainingMs - (now - t.runningSince));
}

/** Focus time so far, including the stretch running now. */
export function focusedMs(t: TimerState, now: number): number {
  return t.focusedMs + (t.phase === 'focus' && t.runningSince !== null ? t.remainingMs - remainingMs(t, now) : 0);
}

/** How far through the phase, 0 to 1. */
export function progress(t: TimerState, now: number): number {
  const total = phaseMs(t.phase, t.settings);
  return total > 0 ? 1 - remainingMs(t, now) / total : 0;
}

export function start(t: TimerState, now: number): TimerState {
  return t.runningSince !== null || t.remainingMs <= 0 ? t : { ...t, runningSince: now };
}

/** Stops the clock, banking any focus time. */
export function pause(t: TimerState, now: number): TimerState {
  if (t.runningSince === null) return t;
  return { ...t, focusedMs: focusedMs(t, now), remainingMs: remainingMs(t, now), runningSince: null };
}

function enter(t: TimerState, phase: Phase): TimerState {
  return { ...t, phase, remainingMs: phaseMs(phase, t.settings), runningSince: null };
}

/**
 * Moves on when the phase has run out. `finished` names the phase that just ended, so the page
 * can chime. The next phase waits to be started.
 */
export function tick(t: TimerState, now: number): { timer: TimerState; finished: Phase | null } {
  if (t.runningSince === null || remainingMs(t, now) > 0) return { timer: t, finished: null };
  const done = pause(t, now);
  const completedFocus = done.completedFocus + (t.phase === 'focus' ? 1 : 0);
  return { timer: enter({ ...done, completedFocus }, nextPhase(t.phase, completedFocus, t.settings)), finished: t.phase };
}

/** Back to the start of the current phase (focus time already worked is kept). */
export function reset(t: TimerState, now: number): TimerState {
  return enter(pause(t, now), t.phase);
}

/** On to the next phase without finishing this one; a skipped focus round doesn't count. */
export function skip(t: TimerState, now: number): TimerState {
  return enter(pause(t, now), nextPhase(t.phase, t.completedFocus, t.settings));
}

export function choosePhase(t: TimerState, phase: Phase, now: number): TimerState {
  return enter(pause(t, now), phase);
}

/** New lengths; the current phase restarts with its new length. */
export function changeSettings(t: TimerState, settings: TimerSettings, now: number): TimerState {
  return enter({ ...pause(t, now), settings }, t.phase);
}

/** "24:59", or "1:04:59" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
