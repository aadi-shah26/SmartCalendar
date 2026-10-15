import { Pencil } from 'lucide-react';
import { getTextColor } from '../../lib/calendar/colors';
import { formatDeadline } from '../../lib/calendar/dates';
import { byDeadline } from '../../lib/calendar/events';
import { isActiveTask } from '../../lib/calendar/tasks';
import type { StatusMessage, Task } from '../../lib/calendar/types';
import type { WorkPlanSettings } from '../../lib/scheduler';

function TaskRow({ task, isCompleting, onOpen, onComplete }: {
  task: Task; isCompleting: boolean; onOpen: () => void; onComplete: () => void;
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
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); onOpen(); }} title="Edit task" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, flexShrink: 0 }}>
        <Pencil style={{ width: 15, height: 15, color: '#888' }} />
      </button>
    </div>
  );
}

export default function TaskSidebar({
  tasks, accentColor, workPlan, planning, planMessage, createdMessage, completingTaskId, showUndo,
  onNewTask, onPlanWeek, onOpenWorkPlan, onOpenTask, onCompleteTask, onUndoDelete,
}: {
  tasks: Task[]; accentColor: string; workPlan: WorkPlanSettings | null;
  planning: boolean; planMessage: StatusMessage | null; createdMessage: string | null;
  completingTaskId: string | null; showUndo: boolean;
  onNewTask: () => void; onPlanWeek: () => void; onOpenWorkPlan: () => void;
  onOpenTask: (t: Task) => void; onCompleteTask: (id: string) => void; onUndoDelete: () => void;
}) {
  const activeTasks = tasks.filter(isActiveTask);
  return (
    <div style={{ width: 300, borderLeft: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
      <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#1a1a1a', letterSpacing: '-0.2px' }}>
            Tasks <span style={{ color: '#999', fontWeight: 600 }}>({activeTasks.length})</span>
          </span>
          <button
            onClick={onNewTask}
            style={{
              padding: '9px 16px', borderRadius: 10, border: 'none', background: accentColor, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', color: getTextColor(accentColor), boxShadow: '0 2px 8px rgba(0,0,0,0.12)', transition: 'transform 0.1s ease',
            }}>
            + New Task
          </button>
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
        {createdMessage && (
          <div style={{ borderRadius: 6, background: '#f0fdf4', padding: '6px 10px', fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{createdMessage}</div>
        )}
        {activeTasks.length === 0 ? (
          <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', marginTop: 32 }}>No tasks yet.<br />Click &quot;+ New&quot; to add one.</div>
        ) : (
          activeTasks.sort(byDeadline).map((t, i) => (
            <TaskRow key={t.id ?? i} task={t} isCompleting={completingTaskId === t.id}
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
