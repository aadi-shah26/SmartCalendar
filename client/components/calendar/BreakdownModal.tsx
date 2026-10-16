'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { getTextColor } from '../../lib/calendar/colors';
import { formatDeadline, formatDuration } from '../../lib/calendar/dates';
import type { Task } from '../../lib/calendar/types';
import type { Step } from '../../lib/nlp/breakdown';
import { suggestSteps } from '../../lib/nlp/client';
import ModalShell from './ModalShell';
import { cancelBtnStyle, errorTextStyle, saveBtnStyle } from './styles';

type Row = Step & { key: number };

const field: CSSProperties = {
  border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff',
  boxSizing: 'border-box', minWidth: 0,
};

/**
 * Splits a task into steps: Gemini suggests them, the user edits, and each step is saved as its
 * own task. Nothing is saved until "Create".
 */
export default function BreakdownModal({ task, accentColor, onClose, onCreate }: {
  task: Task; accentColor: string; onClose: () => void;
  onCreate: (steps: Step[], removeOriginal: boolean) => Promise<string | null>;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeOriginal, setRemoveOriginal] = useState(true);
  const nextKey = useRef(0);
  const estimate = task.durationMinutes > 0 ? task.durationMinutes : null;

  /** Asks for steps; the loading state is already showing. */
  const load = async () => {
    try {
      const steps = await suggestSteps({ title: task.title, description: task.description, durationMinutes: estimate });
      setRows(steps.map(s => ({ ...s, key: nextKey.current++ })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get suggestions.");
    } finally {
      setLoading(false);
    }
  };
  const suggest = () => { setLoading(true); setError(null); load(); };
  // Ask once when opened.
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key: number, patch: Partial<Step>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const valid = rows.filter(r => r.title.trim() && r.minutes > 0);
  const total = valid.reduce((n, r) => n + r.minutes, 0);

  const create = async () => {
    if (valid.length === 0 || saving) return;
    setSaving(true); setError(null);
    const err = await onCreate(valid.map(({ title, minutes }) => ({ title: title.trim(), minutes })), removeOriginal);
    setSaving(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <ModalShell onClose={onClose} style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
      <style>{`
        @keyframes breakdown-shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
        @keyframes breakdown-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Sparkles style={{ width: 13, height: 13 }} /> Break into steps
          </div>
          <h2 style={{ margin: '4px 0 2px', fontSize: 18, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</h2>
          <div style={{ fontSize: 13, color: '#777' }}>
            {[estimate && formatDuration(estimate), task.deadline && `due ${formatDeadline(task.deadline)}`].filter(Boolean).join(' · ') || 'No estimate or deadline yet'}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#aaa', lineHeight: 1 }}>×</button>
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ height: 38, borderRadius: 8, opacity: 1 - i * 0.15,
              background: 'linear-gradient(90deg, #f2f2f2 0px, #e8e8e8 120px, #f2f2f2 240px)', backgroundSize: '600px 100%',
              animation: 'breakdown-shimmer 1.2s linear infinite' }} />
          ))
        ) : rows.map((r, i) => (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, animation: `breakdown-in 0.25s ease ${i * 0.04}s both` }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: accentColor, color: getTextColor(accentColor), fontSize: 12, fontWeight: 800 }}>{i + 1}</span>
            <input value={r.title} onChange={e => update(r.key, { title: e.target.value })} aria-label={`Step ${i + 1}`}
              placeholder="What to do" style={{ ...field, flex: 1 }} />
            <input type="number" min={5} step={5} value={r.minutes || ''} aria-label={`Minutes for step ${i + 1}`}
              onChange={e => update(r.key, { minutes: Math.max(0, Number(e.target.value)) })}
              style={{ ...field, width: 64, textAlign: 'right' }} />
            <span style={{ fontSize: 12, color: '#999', width: 22 }}>min</span>
            <button onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} aria-label={`Remove step ${i + 1}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#bbb', display: 'flex' }}>
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
        ))}
      </div>

      {!loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <button onClick={() => setRows(rs => [...rs, { title: '', minutes: 30, key: nextKey.current++ }])}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: '4px 0', fontSize: 13, fontWeight: 600, color: '#555', cursor: 'pointer' }}>
            <Plus style={{ width: 14, height: 14 }} /> Add step
          </button>
          <button onClick={suggest}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: '4px 0', fontSize: 13, fontWeight: 600, color: '#555', cursor: 'pointer' }}>
            <RefreshCw style={{ width: 13, height: 13 }} /> Suggest again
          </button>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#fafafa', fontSize: 12, color: '#666', lineHeight: 1.5 }}>
          <div>
            <strong style={{ color: '#1a1a1a' }}>{formatDuration(total)}</strong> in {valid.length} step{valid.length === 1 ? '' : 's'}
            {estimate && total !== estimate && <span style={{ color: '#b45309' }}> · the task was estimated at {formatDuration(estimate)}</span>}
          </div>
          {task.deadline && <div>Each step gets its own due date before {formatDeadline(task.deadline)}, so they&apos;re planned in order.</div>}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: '#444', cursor: 'pointer' }}>
        <input type="checkbox" checked={removeOriginal} onChange={e => setRemoveOriginal(e.target.checked)} />
        Replace &quot;{task.title}&quot; with these steps
      </label>

      {error && <div style={errorTextStyle}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
        <button onClick={create} disabled={loading || saving || valid.length === 0}
          style={{ ...saveBtnStyle, backgroundColor: accentColor, color: getTextColor(accentColor), opacity: loading || valid.length === 0 ? 0.5 : 1 }}>
          {saving ? 'Creating…' : `Create ${valid.length || ''} task${valid.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </ModalShell>
  );
}
