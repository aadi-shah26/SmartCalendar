'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { getTextColor } from '../../lib/calendar/colors';
import { formatDeadline, formatDuration } from '../../lib/calendar/dates';
import { byDeadline } from '../../lib/calendar/events';
import type { ItemTab } from '../../lib/calendar/forms';
import { formatRatio } from '../../lib/calendar/estimates';
import { describeAtRisk } from '../../lib/calendar/replanMessages';
import { isActiveTask, type CheckIn, type PendingCheckIn } from '../../lib/calendar/tasks';
import type { StatusMessage, Task, TaskSession } from '../../lib/calendar/types';
import type { AtRisk, WorkPlanSettings } from '../../lib/scheduler';

const MAX_CHECK_INS = 4;

const smallButton = { padding: '3px 8px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#1a1a1a' };

/** Ended sessions nobody has answered for: one tap each, and the plan adjusts. */
function CheckInTray({ items, onCheckIn, onOpenSession }: {
  items: PendingCheckIn[];
  onCheckIn: (taskId: string, session: TaskSession, change: CheckIn) => void;
  onOpenSession: (taskId: string, index: number) => void;
}) {
  const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const minutes = (p: PendingCheckIn) => Math.round((Date.parse(p.session.end) - Date.parse(p.session.start)) / 60_000);
  return (
    <div style={{ borderRadius: 10, border: '1px solid #e0e7ff', background: '#f5f7ff', padding: '8px 10px', marginBottom: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#3730a3', marginBottom: 6 }}>How did these go?</div>
      {items.slice(0, MAX_CHECK_INS).map(p => (
        <div key={`${p.taskId}-${p.index}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
          <button onClick={() => onOpenSession(p.taskId, p.index)} title="More options"
            style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1a1a1a' }}>{p.title}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{when(p.session.start)} · {formatDuration(minutes(p))}</div>
          </button>
          <button style={smallButton} onClick={() => onCheckIn(p.taskId, p.session, { status: 'done' })}>Done</button>
          <button style={smallButton} onClick={() => onOpenSession(p.taskId, p.index)}>Partly</button>
          <button style={smallButton} onClick={() => onCheckIn(p.taskId, p.session, { status: 'skipped' })}>Missed</button>
        </div>
      ))}
      {items.length > MAX_CHECK_INS && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>+{items.length - MAX_CHECK_INS} more</div>}
    </div>
  );
}

function TaskRow({ task, isCompleting, atRisk, onOpen, onComplete }: {
  task: Task; isCompleting: boolean; atRisk: boolean; onOpen: () => void; onComplete: () => void;
}) {
  return (
    <div onClick={() => !isCompleting && onOpen()}
      style={{ borderRadius: 10, background: '#fff', border: '1px solid #e8e8e8', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
        cursor: isCompleting ? 'default' : 'pointer',
        transition: 'opacity 0.45s ease, transform 0.45s ease, border-color 0.15s ease, box-shadow 0.15s ease',
        opacity: isCompleting ? 0 : 1,
        transform: isCompleting ? 'translateX(16px) scale(0.97)' : 'translateX(0) scale(1)',
        pointerEvents: isCompleting ? 'none' : 'auto',
      }}>
      <button
        onClick={e => { e.stopPropagation(); if (!isCompleting) onComplete(); }}
        title="Mark complete"
        style={{ width: 28, height: 28, borderRadius: '50%',
          border: `2px solid ${isCompleting ? '#16a34a' : '#ccc'}`,
          background: isCompleting ? '#16a34a' : '#fff',
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isCompleting ? '#fff' : '#888', fontSize: 14,
          animation: isCompleting ? 'task-check-pop 0.4s ease forwards' : undefined,
          transition: 'background 0.2s ease, border-color 0.2s ease',
        }}>
        {isCompleting ? '✓' : ''}
      </button>
      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: task.color ?? '#1a1a1a', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          {(task.durationMinutes ?? task.duration) || 0} min
          {task.deadline && ` · Due ${formatDeadline(task.deadline)}`}
          {atRisk && (
            <span title="Not enough free time to finish before the deadline" style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700, fontSize: 10 }}>
              At risk
            </span>
          )}
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); onOpen(); }} title="Edit task" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, flexShrink: 0 }}>
        <Pencil style={{ width: 15, height: 15, color: '#888' }} />
      </button>
    </div>
  );
}

/** "+ New ▾": pick whether to add a task or an event. */
function NewMenu({ accentColor, onNew }: { accentColor: string; onNew: (kind: ItemTab) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isOpen]);

  const items: [string, ItemTab][] = [['Task', 'task'], ['Event', 'event']];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 16px', borderRadius: 10, border: 'none', background: accentColor, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', color: getTextColor(accentColor), boxShadow: '0 2px 8px rgba(0,0,0,0.12)', transition: 'transform 0.1s ease',
        }}>
        + New
        <ChevronDown style={{ width: 14, height: 14 }} />
      </button>
      {isOpen && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 150, zIndex: 50, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, boxShadow: '0 10px 24px rgba(0,0,0,0.12)', padding: 6 }}>
          {items.map(([label, kind]) => (
            <button
              key={kind}
              role="menuitem"
              type="button"
              onClick={() => { setIsOpen(false); onNew(kind); }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#1a1a1a', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskSidebar({
  tasks, accentColor, workPlan, estimateRatio, planning, planMessage, createdMessage, completingTaskId, showUndo, atRisk, checkIns,
  onNew, onPlanWeek, onOpenWorkPlan, onOpenTask, onCompleteTask, onUndoDelete, onCheckIn, onOpenSession,
}: {
  tasks: Task[]; accentColor: string; workPlan: WorkPlanSettings | null;
  /** What task estimates are scaled by when planning (1 when not learning from history). */
  estimateRatio: number;
  planning: boolean; planMessage: StatusMessage | null; createdMessage: string | null;
  completingTaskId: string | null; showUndo: boolean; atRisk: AtRisk[]; checkIns: PendingCheckIn[];
  onNew: (kind: ItemTab) => void; onPlanWeek: () => void; onOpenWorkPlan: () => void;
  onOpenTask: (t: Task) => void; onCompleteTask: (id: string) => void; onUndoDelete: () => void;
  onCheckIn: (taskId: string, session: TaskSession, change: CheckIn) => void;
  onOpenSession: (taskId: string, index: number) => void;
}) {
  const title = (id: string) => tasks.find(t => String(t.id) === id)?.title ?? 'A task';
  const activeTasks = tasks.filter(isActiveTask);
  const riskyIds = new Set(atRisk.map(r => r.taskId));
  return (
    <div style={{ width: 300, borderLeft: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
      <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#1a1a1a', letterSpacing: '-0.2px' }}>
            Tasks <span style={{ color: '#999', fontWeight: 600 }}>({activeTasks.length})</span>
          </span>
          <NewMenu accentColor={accentColor} onNew={onNew} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onPlanWeek}
            disabled={planning}
            title="Fit every task with a duration into your free time before its deadline"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 10, border: `1px solid ${accentColor}`,
              background: 'transparent', color: '#1a1a1a', fontSize: 13, fontWeight: 600,
              cursor: planning ? 'default' : 'pointer', opacity: planning ? 0.6 : 1,
            }}>
            {planning ? 'Planning…' : '✦ Plan my week'}
          </button>
          <button
            onClick={onOpenWorkPlan}
            title="How you like to work: daily limit, session length, days"
            aria-label="Planning settings"
            style={{ width: 36, borderRadius: 10, border: `1px solid ${accentColor}`, background: 'transparent', color: '#555', fontSize: 15, cursor: 'pointer' }}>
            ⚙
          </button>
        </div>
        {workPlan && (
          <p style={{ margin: '6px 2px 0', fontSize: 11, color: '#999' }}>
            Up to {workPlan.dailyMinutes / 60}h a day · {workPlan.sessionMinutes}-min sessions · {workPlan.spread === 'steady' ? 'a little each day' : 'as early as possible'}
            {estimateRatio !== 1 && ` · tasks planned at ${formatRatio(estimateRatio)} their estimate`}
          </p>
        )}
        {planMessage && (
          <div role="status" style={{ marginTop: 8, borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, lineHeight: 1.4,
            background: planMessage.error ? '#fef2f2' : '#f0fdf4', color: planMessage.error ? '#b91c1c' : '#16a34a' }}>
            {planMessage.text}
          </div>
        )}
      </div>

      {/* Task List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {atRisk.map(r => {
          const task = tasks.find(t => String(t.id) === r.taskId);
          return (
            <div key={r.taskId} role="alert" style={{ borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', padding: '8px 10px', fontSize: 12, color: '#991b1b', lineHeight: 1.4 }}>
              {describeAtRisk(r, title)}
              {task && (
                <div style={{ marginTop: 4 }}>
                  <button onClick={() => onOpenTask(task)} style={{ fontSize: 12, color: '#991b1b', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    Change the deadline or how long it takes
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {checkIns.length > 0 && <CheckInTray items={checkIns} onCheckIn={onCheckIn} onOpenSession={onOpenSession} />}
        {createdMessage && (
          <div style={{ borderRadius: 6, background: '#f0fdf4', padding: '6px 10px', fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{createdMessage}</div>
        )}
        {activeTasks.length === 0 ? (
          <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', marginTop: 32 }}>No tasks yet.<br />Click &quot;+ New&quot; to add one.</div>
        ) : (
          activeTasks.sort(byDeadline).map((t, i) => (
            <TaskRow key={t.id ?? i} task={t} isCompleting={completingTaskId === t.id} atRisk={riskyIds.has(String(t.id))}
              onOpen={() => onOpenTask(t)} onComplete={() => onCompleteTask(t.id)} />
          ))
        )}
        {showUndo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px' }}>
            <span style={{ fontSize: 12, color: '#92400e' }}>Task deleted</span>
            <button onClick={onUndoDelete} style={{ fontSize: 12, color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Undo</button>
          </div>
        )}
      </div>
    </div>
  );
}
