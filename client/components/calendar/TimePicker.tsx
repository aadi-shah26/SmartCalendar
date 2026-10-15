'use client';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatDurationLabel, formatEventTime, minutesOfDay, parseTimeInput, timeOfDay } from '../../lib/calendar/dates';
import { inputStyle } from './styles';

// Every 15 minutes, plus 11:59 PM so "due at midnight" stays on the same day.
const TIME_OPTIONS = [...Array.from({ length: 96 }, (_, i) => timeOfDay(i * 15)), '23:59'];

const nowRoundedDown = () => {
  const n = new Date();
  return timeOfDay(Math.floor((n.getHours() * 60 + n.getMinutes()) / 15) * 15);
};

/**
 * A time field that works like Google Calendar's: type a time ("3pm", "15:30") or pick one
 * from a list that opens scrolled to the chosen time (or to now, when none is chosen).
 * With `after`, it's an end-time field: only later times are offered, each with its duration.
 */
export default function TimePicker({ value, onChange, after }: {
  value: string; onChange: (t: string) => void; after?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // What the user is typing, until they press Enter or leave the field.
  const [draft, setDraft] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => (after ? TIME_OPTIONS.filter(t => t > after) : TIME_OPTIONS), [after]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!isOpen || !list) return;
    const target = value || nowRoundedDown();
    const index = Math.max(0, options.findIndex(t => t >= target));
    const item = list.children[index] as HTMLElement | undefined;
    if (item) list.scrollTop = item.offsetTop - 4;
  }, [isOpen, value, options]);

  const close = () => { setIsOpen(false); setDraft(null); };
  const choose = (t: string) => { onChange(t); close(); };
  // A typed time is kept when it's valid (and, for an end time, after the start).
  const commitDraft = () => {
    const typed = draft === null ? null : parseTimeInput(draft);
    if (typed && (!after || typed > after)) onChange(typed);
    close();
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={draft ?? (value ? formatEventTime(value) : '')}
        placeholder="Select time"
        onFocus={e => { e.target.select(); setIsOpen(true); }}
        onClick={() => setIsOpen(true)}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commitDraft(); e.currentTarget.blur(); }
          if (e.key === 'Escape') { e.stopPropagation(); close(); e.currentTarget.blur(); }
        }}
        style={{ ...inputStyle, cursor: 'pointer' }}
      />
      {isOpen && (
        <div
          ref={listRef}
          // Keeps focus in the field, so picking an option doesn't count as leaving it first.
          onMouseDown={e => e.preventDefault()}
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: '100%', maxHeight: 220,
            overflowY: 'auto', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10,
            boxShadow: '0 10px 28px rgba(0,0,0,0.14)', zIndex: 200, padding: 4, whiteSpace: 'nowrap',
          }}
        >
          {options.map(opt => (
            <div
              key={opt}
              data-selected={opt === value}
              onClick={() => choose(opt)}
              className="time-option"
              style={{
                padding: '8px 12px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
                background: opt === value ? '#f0f0f0' : 'transparent',
                fontWeight: opt === value ? 700 : 400,
              }}
            >
              {formatEventTime(opt)}
              {after && <span style={{ color: '#999', fontWeight: 400, marginLeft: 6 }}>({formatDurationLabel(minutesOfDay(opt) - minutesOfDay(after))})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
