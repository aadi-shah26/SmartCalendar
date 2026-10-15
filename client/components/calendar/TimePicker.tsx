'use client';
import { useEffect, useRef, useState } from 'react';
import { formatEventTime } from '../../lib/calendar/dates';
import { inputStyle } from './styles';

// Every 15 minutes, plus 11:59 PM so "due at midnight" stays on the same day.
const TIME_OPTIONS = [...Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}), '23:59'];

// Lead with the current time (floored to the nearest 15 min) so the most useful
// options are right at the top; the rest of the day follows, wrapping around.
function optionsFromNow() {
  const now = new Date();
  const startIndex = Math.floor((now.getHours() * 60 + now.getMinutes()) / 15);
  return [...TIME_OPTIONS.slice(startIndex), ...TIME_OPTIONS.slice(0, startIndex)];
}

export default function TimePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<string[]>(TIME_OPTIONS);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggle = () => {
    if (!isOpen) setOptions(optionsFromNow());
    setIsOpen(!isOpen);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={toggle}
        style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>{value ? formatEventTime(value) : 'Select time'}</span>
        <span style={{ color: '#999', fontSize: 10 }}>▾</span>
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 220,
            overflowY: 'auto', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10,
            boxShadow: '0 10px 28px rgba(0,0,0,0.14)', zIndex: 200, padding: 4,
          }}
        >
          {options.map(opt => (
            <div
              key={opt}
              data-selected={opt === value}
              onClick={() => { onChange(opt); setIsOpen(false); }}
              className="time-option"
              style={{
                padding: '8px 12px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
                background: opt === value ? '#f0f0f0' : 'transparent',
                fontWeight: opt === value ? 700 : 400,
              }}
            >
              {formatEventTime(opt)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
