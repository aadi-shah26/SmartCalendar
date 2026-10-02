'use client';
import { useState } from 'react';
import type { WorkPlanSettings } from '../lib/scheduler';

const DAILY_OPTIONS = [60, 120, 180, 240, 360];
const SESSION_OPTIONS = [30, 45, 60, 90, 120];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const hours = (min: number) => (min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h ${min % 60}m`);
const minutes = (min: number) => (min < 60 ? `${min} min` : hours(min));

interface Props {
  initial: WorkPlanSettings;
  accentColor: string;
  textOnAccent: string;
  /** True the first time, before anything has been planned with these settings. */
  firstTime: boolean;
  onClose: () => void;
  onSave: (settings: WorkPlanSettings, replan: boolean) => void;
}

// Asks how the user likes to work, so "Plan my week" can spread tasks the way they want.
export default function WorkPlanModal({ initial, accentColor, textOnAccent, firstTime, onClose, onSave }: Props) {
  const [plan, setPlan] = useState<WorkPlanSettings>(initial);
  const set = (patch: Partial<WorkPlanSettings>) => setPlan(p => ({ ...p, ...patch }));
  const toggleDay = (d: number) =>
    set({ workDays: plan.workDays.includes(d) ? plan.workDays.filter(x => x !== d) : [...plan.workDays, d].sort() });

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1.5px solid ${active ? accentColor : '#e5e5e5'}`,
    background: active ? accentColor : '#fff', color: active ? textOnAccent : '#444',
    transition: 'all 0.12s',
  });

  const weeklyMax = plan.dailyMinutes * plan.workDays.length;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()} role="dialog" aria-label="How do you like to work?">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>How do you like to work?</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#777', lineHeight: 1.45 }}>
              {firstTime
                ? 'Tell me once and I’ll plan your tasks around it. You can change this any time with ⚙.'
                : 'Plan my week uses these to split up your tasks.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, color: '#aaa', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <label style={labelStyle}>Most I want to work on tasks per day</label>
        <div style={row}>
          {DAILY_OPTIONS.map(m => (
            <button key={m} type="button" style={pill(plan.dailyMinutes === m)} onClick={() => set({ dailyMinutes: m })}>{hours(m)}</button>
          ))}
        </div>

        <label style={labelStyle}>Work in sessions of about</label>
        <div style={row}>
          {SESSION_OPTIONS.map(m => (
            <button key={m} type="button" style={pill(plan.sessionMinutes === m)} onClick={() => set({ sessionMinutes: m })}>{minutes(m)}</button>
          ))}
        </div>
        <p style={hint}>Long tasks are split up — a 3-hour task becomes {Math.ceil(180 / plan.sessionMinutes)} sessions.</p>

        <label style={labelStyle}>Days I’m willing to work</label>
        <div style={row}>
          {DAYS.map((name, d) => (
            <button key={name} type="button" style={{ ...pill(plan.workDays.includes(d)), padding: '8px 0', width: 46 }} onClick={() => toggleDay(d)}>{name}</button>
          ))}
        </div>
        {plan.workDays.length === 0 && <p style={{ ...hint, color: '#c53030' }}>Pick at least one day.</p>}

        <label style={labelStyle}>How should I spread it out?</label>
        <div style={{ display: 'grid', gap: 8 }}>
          {([
            ['steady', 'A little each day', 'Even out the work across the days before each deadline.'],
            ['asap', 'Get it done early', 'Use the earliest free time, up to your daily limit.'],
          ] as const).map(([value, title, desc]) => (
            <button key={value} type="button" onClick={() => set({ spread: value })} style={{
              ...pill(plan.spread === value), textAlign: 'left', padding: '10px 14px',
              background: plan.spread === value ? `${accentColor}22` : '#fff', color: '#1a1a1a',
            }}>
              <div style={{ fontWeight: 700 }}>{title}</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#777', marginTop: 2 }}>{desc}</div>
            </button>
          ))}
        </div>

        <p style={{ ...hint, marginTop: 16 }}>
          Up to {hours(weeklyMax)} of task work a week. If a deadline can’t be met within this, I’ll go over and tell you.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          {firstTime ? (
            <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          ) : (
            <button type="button" disabled={plan.workDays.length === 0} onClick={() => onSave(plan, false)} style={cancelBtn}>Save</button>
          )}
          <button type="button" disabled={plan.workDays.length === 0} onClick={() => onSave(plan, true)} style={{
            ...cancelBtn, border: 'none', background: accentColor, color: textOnAccent, fontWeight: 700,
            opacity: plan.workDays.length === 0 ? 0.5 : 1,
          }}>
            {firstTime ? 'Plan my week' : 'Save & re-plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
};
const modal: React.CSSProperties = {
  backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 460,
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#888',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, marginTop: 18,
};
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 };
const hint: React.CSSProperties = { margin: '8px 0 0', fontSize: 12, color: '#999' };
const cancelBtn: React.CSSProperties = {
  flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #e5e5e5',
  backgroundColor: '#fff', color: '#1a1a1a', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
