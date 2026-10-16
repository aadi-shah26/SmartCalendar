'use client';
import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Pause, Play, RotateCcw, SkipForward, Timer } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { formatDuration } from '../../lib/calendar/dates';
import { withLearning, workedMinutes } from '../../lib/calendar/estimates';
import { taskFromRow, toTrackedTask } from '../../lib/calendar/tasks';
import type { Task } from '../../lib/calendar/types';
import { remainingMinutes } from '../../lib/scheduler';
import { chime, unlockAudio } from '../../lib/focus/chime';
import { logFocus } from '../../lib/focus/log';
import {
  PHASE_LABEL, PRESETS, changeSettings, choosePhase, focusedMs, formatClock, initialTimer, isRunning, pause, progress,
  remainingMs, reset, skip, start, tick, type Phase, type TimerState,
} from '../../lib/focus/timer';
import FocusRing from '../../components/focus/FocusRing';

const PHASE_COLOR: Record<Phase, string> = { focus: '#e8594a', short: '#2fa37f', long: '#3b7dd8' };
const TICK_MS = 250;
const MIN = 60_000;

const sessionLabel = (start: string, end: string) => {
  const t = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = new Date(start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return `Planned session · ${day}, ${t(start)} – ${t(end)}`;
};

function FocusPage() {
  const router = useRouter();
  const params = useSearchParams();
  const taskId = params.get('task');
  const sessionStart = params.get('session');

  const [task, setTask] = useState<Task | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timer, setTimer] = useState<TimerState>(() => initialTimer());
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ minutes: number; completed: boolean } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  // The latest timer, for the interval and save (which outlive the render they were made in).
  const timerRef = useRef(timer);
  useEffect(() => { timerRef.current = timer; }, [timer]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/login');
      if (!taskId) return setLoadError('No task was picked.');
      const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId).maybeSingle();
      if (error || !data) return setLoadError(error?.message ?? "That task couldn't be found.");
      setTask(taskFromRow(data));
    })();
  }, [router, taskId]);

  // The clock: re-render a few times a second, and move on when a phase runs out.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const { timer: next, finished } = tick(timerRef.current, t);
      if (finished) {
        setTimer(next);
        chime(finished === 'focus' ? [660, 880, 1320] : [880, 660, 520]);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const running = isRunning(timer);
  const left = remainingMs(timer, now);
  const focused = focusedMs(timer, now);
  const focusedMin = Math.round(focused / MIN);
  const color = PHASE_COLOR[timer.phase];
  const plannedSession = task?.sessions.find(s => s.start === sessionStart);
  const leftOnTask = task && task.durationMinutes > 0
    ? Math.max(0, remainingMinutes(toTrackedTask(task), now) - focusedMin) : null;
  const roundInSet = timer.phase === 'focus' ? (timer.completedFocus % timer.settings.rounds) + 1 : null;

  // Remember the tab's title before the timer takes it over, and put it back on leaving.
  useEffect(() => {
    const original = document.title;
    return () => { document.title = original; };
  }, []);
  useEffect(() => {
    document.title = `${running ? '▶' : '❚❚'} ${formatClock(left)} · ${PHASE_LABEL[timer.phase]}${task ? ` — ${task.title}` : ''}`;
  }, [left, running, timer.phase, task]);

  // Don't lose unsaved focus time to a closed tab.
  useEffect(() => {
    if (focusedMin < 1) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [focusedMin]);

  const act = (change: (t: TimerState, now: number) => TimerState) => {
    unlockAudio();
    setSaved(null);
    setTimer(t => change(t, Date.now()));
  };
  const toggle = () => act((t, n) => (isRunning(t) ? pause(t, n) : start(t, n)));

  // Space starts and pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  /** Writes the focus time so far to the task (and completes it if asked). */
  async function save(complete: boolean): Promise<boolean> {
    if (!task || saving) return false;
    const minutes = Math.round(focusedMs(timerRef.current, Date.now()) / MIN);
    if (minutes < 1 && !complete) return true;
    setSaving(true); setSaveError(null);
    try {
      const { data, error } = await supabase.from('tasks').select('*').eq('id', task.id).maybeSingle();
      if (error || !data) throw new Error(error?.message ?? "That task couldn't be found.");
      const fresh = taskFromRow(data);
      const at = Date.now();
      const sessions = logFocus(fresh.sessions, minutes, at, sessionStart);
      const learning = complete && fresh.estimatedMinutes ? { actual_minutes: workedMinutes(sessions, at) } : {};
      const { error: writeError } = await withLearning(learning, extra =>
        supabase.from('tasks').update({ sessions, ...(complete ? { is_completed: true } : {}), ...extra }).eq('id', task.id));
      if (writeError) throw new Error(writeError.message);
      setTask({ ...fresh, sessions, isCompleted: complete || fresh.isCompleted });
      // Saved time no longer counts as unsaved; a running clock keeps running.
      setTimer(t => {
        const banked = { ...pause(t, at), focusedMs: 0 };
        return isRunning(t) ? start(banked, at) : banked;
      });
      setSaved({ minutes, completed: complete });
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Saving failed.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  const backToCalendar = async () => {
    if (await save(false)) router.push('/calendar');
  };

  if (loadError) {
    return (
      <Shell color={PHASE_COLOR.focus}>
        <div style={{ textAlign: 'center', marginTop: '20vh' }}>
          <p style={{ fontSize: 16, color: '#555' }}>{loadError}</p>
          <button onClick={() => router.push('/calendar')} style={secondaryBtn}>Back to calendar</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell color={color}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button onClick={backToCalendar} disabled={saving} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}
          title="Your focus time is saved to the task">
          <ArrowLeft style={{ width: 16, height: 16 }} /> Calendar
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 15, color: '#333' }}>
          <Timer style={{ width: 18, height: 18, color, transition: 'color 0.8s ease' }} /> Focus
        </div>
        <select value={presetIndex} aria-label="Timer lengths"
          onChange={e => { const i = Number(e.target.value); setPresetIndex(i); act((t, n) => changeSettings(t, PRESETS[i].settings, n)); }}
          style={{ ...ghostBtn, paddingRight: 8, appearance: 'auto' }}>
          {PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
        </select>
      </div>

      {/* Task */}
      <div style={{ textAlign: 'center', marginTop: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#999' }}>FOCUSING ON</div>
        <h1 style={{ margin: '6px 0 4px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {task && <span style={{ width: 12, height: 12, borderRadius: '50%', background: task.color ?? '#1a1a1a', flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task?.title ?? 'Loading…'}</span>
        </h1>
        <div style={{ fontSize: 13, color: '#888', minHeight: 18 }}>
          {plannedSession ? sessionLabel(plannedSession.start, plannedSession.end) : task?.deadline ? `Due ${new Date(task.deadline).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
        </div>
      </div>

      {/* Phase switcher */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: 'rgba(255,255,255,0.75)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          {(['focus', 'short', 'long'] as Phase[]).map(p => (
            <button key={p} onClick={() => act((t, n) => choosePhase(t, p, n))} style={{
              padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: timer.phase === p ? PHASE_COLOR[p] : 'transparent', color: timer.phase === p ? '#fff' : '#777',
              transition: 'background 0.3s ease, color 0.3s ease',
            }}>{PHASE_LABEL[p]}</button>
          ))}
        </div>
      </div>

      {/* Ring */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 26 }}>
        <FocusRing progress={progress(timer, now)} color={color} running={running}>
          <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums', color: '#1a1a1a', lineHeight: 1 }}>
            {formatClock(left)}
          </div>
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color, transition: 'color 0.8s ease' }}>
            {PHASE_LABEL[timer.phase]}{roundInSet && ` · round ${roundInSet} of ${timer.settings.rounds}`}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#aaa' }}>{running ? 'Space to pause' : 'Space to start'}</div>
        </FocusRing>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 24 }}>
        <button onClick={() => act(reset)} aria-label="Restart this phase" title="Restart this phase" style={roundBtn}>
          <RotateCcw style={{ width: 20, height: 20 }} />
        </button>
        <button onClick={toggle} aria-label={running ? 'Pause' : 'Start'} style={{
          width: 84, height: 84, borderRadius: '50%', border: 'none', cursor: 'pointer', background: color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 12px 28px ${color}66`,
          transition: 'background 0.8s ease, box-shadow 0.8s ease, transform 0.1s ease',
        }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = ''; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; }}>
          {running ? <Pause style={{ width: 34, height: 34 }} fill="#fff" /> : <Play style={{ width: 34, height: 34, marginLeft: 4 }} fill="#fff" />}
        </button>
        <button onClick={() => act(skip)} aria-label="Skip to next phase" title="Skip to next phase" style={roundBtn}>
          <SkipForward style={{ width: 20, height: 20 }} />
        </button>
      </div>

      {/* Rounds in this set */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18 }} aria-label={`${timer.completedFocus % timer.settings.rounds} of ${timer.settings.rounds} rounds done`}>
        {Array.from({ length: timer.settings.rounds }, (_, i) => {
          const done = i < timer.completedFocus % timer.settings.rounds || (timer.phase === 'long' && timer.completedFocus > 0);
          return <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: done ? PHASE_COLOR.focus : 'rgba(0,0,0,0.1)', transition: 'background 0.4s ease' }} />;
        })}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 28 }}>
        <Stat label="Focused" value={formatDuration(focusedMin)} sub={saved ? 'since last save' : 'this session'} />
        <Stat label="Pomodoros" value={String(timer.completedFocus)} sub="finished" />
        <Stat label="Left on task" value={leftOnTask === null ? '—' : leftOnTask === 0 ? 'Done' : `~${formatDuration(leftOnTask)}`} sub={leftOnTask === null ? 'no duration set' : 'of planned work'} />
      </div>

      {/* Save */}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button onClick={() => save(false)} disabled={saving || focusedMin < 1 || !task} style={{ ...secondaryBtn, flex: 1, opacity: focusedMin < 1 ? 0.5 : 1 }}>
          {saving ? 'Saving…' : `Save ${focusedMin >= 1 ? formatDuration(focusedMin) : 'time'} to task`}
        </button>
        <button onClick={() => save(true)} disabled={saving || !task || task.isCompleted}
          style={{ ...secondaryBtn, flex: 1, background: '#1a1a1a', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: task?.isCompleted ? 0.5 : 1 }}>
          <Check style={{ width: 16, height: 16 }} /> {task?.isCompleted ? 'Task completed' : 'Save & complete task'}
        </button>
      </div>
      <div role="status" style={{ minHeight: 20, marginTop: 10, textAlign: 'center', fontSize: 13, fontWeight: 600, color: saveError ? '#b91c1c' : '#16a34a' }}>
        {saveError ? `Couldn't save: ${saveError}`
          : saved ? (saved.completed ? `Nice work! "${task?.title}" is done${saved.minutes ? ` (${formatDuration(saved.minutes)} saved)` : ''}.` : `Saved ${formatDuration(saved.minutes)} to "${task?.title}". Your plan will adjust.`)
          : ''}
      </div>
    </Shell>
  );
}

function Shell({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a',
      backgroundColor: `${color}12`, transition: 'background-color 0.8s ease' }}>
      <div aria-hidden style={{ position: 'absolute', top: -160, left: '50%', width: 720, height: 520, marginLeft: -360, borderRadius: '50%',
        background: color, opacity: 0.16, filter: 'blur(90px)', transition: 'background 0.8s ease' }} />
      <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto', padding: '20px 16px 40px' }}>{children}</div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.8)', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#999', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

const ghostBtn: CSSProperties = {
  padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.75)',
  fontSize: 13, fontWeight: 600, color: '#444', cursor: 'pointer',
};
const roundBtn: CSSProperties = {
  width: 52, height: 52, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.85)',
  color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
};
const secondaryBtn: CSSProperties = {
  padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)', background: '#fff',
  fontSize: 14, fontWeight: 700, color: '#1a1a1a', cursor: 'pointer',
};

export default function FocusRoute() {
  return (
    <Suspense fallback={null}>
      <FocusPage />
    </Suspense>
  );
}
