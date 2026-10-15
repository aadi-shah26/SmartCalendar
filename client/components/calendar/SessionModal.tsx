import { useState, type CSSProperties } from 'react';
import { Pin } from 'lucide-react';
import { getTextColor } from '../../lib/calendar/colors';
import { formatDuration } from '../../lib/calendar/dates';
import type { CheckIn } from '../../lib/calendar/tasks';
import type { TaskSession } from '../../lib/calendar/types';
import ModalShell from './ModalShell';
import { cancelBtnStyle } from './styles';

const STATUS_LABEL: Record<string, string> = {
  done: 'Done',
  partial: 'Partly done',
  skipped: 'Skipped',
};

function sessionTime(s: TaskSession) {
  const start = new Date(s.start);
  const end = new Date(s.end);
  const day = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${t(start)} – ${t(end)}`;
}

/**
 * One work session: say how it went once it has started (the plan adjusts to the answer), or,
 * before it, say you can't make it or pin it where it is.
 */
export default function SessionModal({ title, session, nowMs, accentColor, onChange, onEditTask, onClose }: {
  title: string; session: TaskSession; nowMs: number; accentColor: string;
  onChange: (change: CheckIn | { pinned: boolean }) => void;
  onEditTask: () => void; onClose: () => void;
}) {
  const [choosingMinutes, setChoosingMinutes] = useState(false);
  const startMs = new Date(session.start).getTime();
  const lengthMin = Math.round((new Date(session.end).getTime() - startMs) / 60_000);
  const started = startMs < nowMs;
  const status = session.status;
  const partOptions = Array.from({ length: Math.ceil(lengthMin / 15) - 1 }, (_, i) => (i + 1) * 15);

  const choice = (active: boolean): CSSProperties => ({
    flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${active ? accentColor : '#e5e5e5'}`,
    background: active ? accentColor : '#fff', color: active ? getTextColor(accentColor) : '#1a1a1a',
  });
  const act = (change: CheckIn | { pinned: boolean }) => { onChange(change); onClose(); };

  return (
    <ModalShell onClose={onClose} style={{ maxWidth: 400 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Work session</div>
          <h2 style={{ margin: '4px 0 2px', fontSize: 18, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
          <div style={{ fontSize: 13, color: '#666' }}>
            {sessionTime(session)} · {formatDuration(lengthMin)}
            {status && STATUS_LABEL[status] && ` · ${STATUS_LABEL[status]}${status === 'partial' && session.doneMinutes !== undefined ? ` (${formatDuration(session.doneMinutes)})` : ''}`}
            {session.pinned && ' · Pinned'}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#aaa', lineHeight: 1 }}>×</button>
      </div>

      {started ? (
        <>
          <p style={{ margin: '18px 0 8px', fontSize: 13, fontWeight: 600 }}>How did it go?</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={choice(status === 'done')} onClick={() => act({ status: 'done' })}>Done</button>
            {partOptions.length > 0 && (
              <button style={choice(status === 'partial' || choosingMinutes)} onClick={() => setChoosingMinutes(v => !v)}>Partly</button>
            )}
            <button style={choice(status === 'skipped')} onClick={() => act({ status: 'skipped' })}>Didn&apos;t get to it</button>
          </div>
          {choosingMinutes && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>How much got done?</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {partOptions.map(m => (
                  <button key={m} style={{ ...choice(status === 'partial' && session.doneMinutes === m), flex: '0 0 auto', padding: '6px 12px' }}
                    onClick={() => act({ status: 'partial', doneMinutes: m })}>
                    {formatDuration(m)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#888' }}>Anything left over gets planned again automatically.</p>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
          {status === 'skipped' ? (
            <button style={choice(false)} onClick={() => act({ status: 'planned' })}>I can make it after all</button>
          ) : (
            <>
              <button style={choice(false)} onClick={() => act({ status: 'skipped' })}>Can&apos;t make it</button>
              <button style={{ ...choice(!!session.pinned), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                title="Pinned sessions are never moved by replanning"
                onClick={() => act({ pinned: !session.pinned })}>
                <Pin style={{ width: 14, height: 14 }} />
                {session.pinned ? 'Unpin' : 'Pin here'}
              </button>
            </>
          )}
        </div>
      )}

      {status && status !== 'planned' && started && (
        <button onClick={() => act({ status: 'planned' })}
          style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#4f46e5', cursor: 'pointer', textDecoration: 'underline' }}>
          Clear answer
        </button>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button style={cancelBtnStyle} onClick={() => { onClose(); onEditTask(); }}>Edit task</button>
      </div>
    </ModalShell>
  );
}
