'use client';
import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { House } from 'lucide-react';
import { getTextColor } from '../../lib/calendar/colors';
import { periodLabel, stepDate } from '../../lib/calendar/dates';
import type { ViewMode } from '../../lib/calendar/types';

const VIEWS: ViewMode[] = ['Day', 'Week', 'Month', 'Year'];

function HoverButton({ onClick, style, children }: {
  onClick: () => void; style: (hovered: boolean) => CSSProperties; children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={style(hovered)}>
      {children}
    </button>
  );
}

const todayBtnStyle = (hovered: boolean): CSSProperties => ({
  padding: '6px 14px', borderRadius: 8, border: '1px solid #e0e0e0', background: hovered ? '#f0f0f0' : '#fff',
  fontWeight: 600, cursor: 'pointer', fontSize: 13, transition: 'background 0.15s',
});

const arrowBtnStyle = (hovered: boolean): CSSProperties => ({
  width: 28, height: 28, borderRadius: 6, border: '1px solid #e0e0e0',
  background: hovered ? '#f0f0f0' : '#fff', fontSize: 18, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 300, transition: 'background 0.15s',
});

/** Home link, Today, ‹ ›, and the title of the period on screen. */
export function DateNavigator({ view, currentDate, setCurrentDate }: {
  view: ViewMode; currentDate: Date; setCurrentDate: (d: Date) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Link
        href="/"
        title="Home"
        aria-label="Home"
        style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', marginRight: 4 }}>
        <House style={{ width: 16, height: 16 }} />
      </Link>
      <HoverButton onClick={() => setCurrentDate(new Date())} style={todayBtnStyle}>Today</HoverButton>
      <HoverButton onClick={() => setCurrentDate(stepDate(currentDate, view, -1))} style={arrowBtnStyle}>‹</HoverButton>
      <HoverButton onClick={() => setCurrentDate(stepDate(currentDate, view, 1))} style={arrowBtnStyle}>›</HoverButton>
      <span style={{ fontSize: 15, fontWeight: 700, marginLeft: 8 }}>{periodLabel(currentDate, view)}</span>
    </div>
  );
}

export function ViewSwitcher({ view, setView, accentColor }: {
  view: ViewMode; setView: (v: ViewMode) => void; accentColor: string;
}) {
  return (
    <div style={{ margin: '0 auto', display: 'flex', gap: 2, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 3 }}>
      {VIEWS.map(v => (
        <button key={v} onClick={() => setView(v)} style={{
          padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          backgroundColor: view === v ? accentColor : 'transparent',
          color: view === v ? getTextColor(accentColor) : '#666', transition: 'all 0.15s'
        }}>{v}</button>
      ))}
    </div>
  );
}
