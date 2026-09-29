'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, CircleUserRound, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

const THEME_COLOR = '#1a1a1a';

type ViewMode = 'Day' | 'Week' | 'Month' | 'Year';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  description: string;
  color?: string;
  recurrence?: { type: 'none' | 'daily' | 'weekly'; days?: number[] } | null;
  _recurringBaseId?: string;
}

const PASTEL_COLORS = [
  '#1a1a1a', '#f4a8b8', '#f9c882', '#a8d8a8',
  '#84c4e8', '#b8a8e0', '#f8e4a4', '#88ccc4',
  '#e8a8c4', '#a8c8e8', '#c8e8a4', '#e4c8a8',
];

function getTextColor(hex: string): string {
  if (!hex || hex === THEME_COLOR) return '#fff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.58 ? '#1a1a1a' : '#fff';
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {PASTEL_COLORS.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)} style={{
          width: 26, height: 26, borderRadius: '50%', backgroundColor: c,
          border: value === c ? '3px solid #555' : '2px solid #ddd',
          cursor: 'pointer', padding: 0,
          boxShadow: value === c ? 'inset 0 0 0 2px #fff' : 'none',
        }} />
      ))}
    </div>
  );
}

function computeEventLayouts(dayEvents: CalendarEvent[]) {
  type Item = { ev: CalendarEvent; top: number; height: number };
  const items: Item[] = dayEvents
    .map(ev => { const p = getEventPosition(ev); return p ? { ev, ...p } : null; })
    .filter((x): x is Item => x !== null)
    .sort((a, b) => a.top - b.top);
  const n = items.length;
  const cols: number[] = [];
  for (let i = 0; i < n; i++) {
    const used = new Set<number>();
    for (let j = 0; j < i; j++) {
      if (items[j].top < items[i].top + items[i].height && items[j].top + items[j].height > items[i].top)
        used.add(cols[j]);
    }
    let c = 0; while (used.has(c)) c++;
    cols.push(c);
  }
  return items.map((item, i) => {
    let maxCol = cols[i];
    for (let j = 0; j < n; j++) {
      if (items[j].top < item.top + item.height && items[j].top + items[j].height > item.top)
        maxCol = Math.max(maxCol, cols[j]);
    }
    return { ...item, col: cols[i], totalCols: maxCol + 1 };
  });
}

function expandEvents(rawEvents: CalendarEvent[], windowStart: Date, windowEnd: Date): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  for (const ev of rawEvents) {
    const rec = ev.recurrence;
    if (!rec || rec.type === 'none') { result.push(ev); continue; }
    const base = new Date(ev.date);
    const loopStart = base > windowStart ? base : new Date(windowStart);
    const d = new Date(loopStart);
    while (d <= windowEnd) {
      const include = rec.type === 'daily' || (rec.type === 'weekly' && (rec.days ?? []).includes(d.getDay()));
      if (include)
        result.push({ ...ev, id: `${ev.id}_${toDateKey(d)}`, date: toDateKey(d), _recurringBaseId: ev.id });
      d.setDate(d.getDate() + 1);
    }
  }
  return result;
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toLocalISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatHour(h: number) {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

function formatTimeStr(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
}

function formatEventTime(timeStr: string) {
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  if (h === 0) return `12:${m} AM`;
  if (h === 12) return `12:${m} PM`;
  if (h > 12) return `${h - 12}:${m} PM`;
  return `${h}:${m} AM`;
}

const HOUR_HEIGHT = 60; // px per hour in day/week views

function getEventPosition(ev: CalendarEvent): { top: number; height: number } | null {
  const sp = ev.start_time.split(':').map(Number);
  const ep = ev.end_time.split(':').map(Number);
  if (sp.length < 2 || ep.length < 2 || isNaN(sp[0]) || isNaN(ep[0])) return null;
  const startMin = sp[0] * 60 + (sp[1] ?? 0);
  const endMin = ep[0] * 60 + (ep[1] ?? 0);
  const durMin = Math.max(endMin - startMin, 15);
  return { top: (startMin / 60) * HOUR_HEIGHT, height: (durMin / 60) * HOUR_HEIGHT };
}

function getWeekStart(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

// ── Shared styles ──
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
};
const modal: React.CSSProperties = {
  backgroundColor: '#fff', borderRadius: 20, padding: 28,
  width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#888',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, marginTop: 14
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e5e5',
  fontSize: 14, outline: 'none', boxSizing: 'border-box', backgroundColor: '#fafafa'
};
const saveBtnStyle: React.CSSProperties = {
  flex: 1, padding: '12px', borderRadius: 12, border: 'none',
  backgroundColor: THEME_COLOR, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer'
};
const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #e5e5e5',
  backgroundColor: '#fff', color: '#1a1a1a', fontWeight: 600, fontSize: 14, cursor: 'pointer'
};

const eventChipStyle: React.CSSProperties = {
  backgroundColor: THEME_COLOR, color: '#fff', borderRadius: 6,
  padding: '3px 6px', fontSize: '12px', fontWeight: 600,
  cursor: 'pointer', marginBottom: 2, lineHeight: 1.3,
};

// ── Sub-components ──

function useNowTop() {
  const [nowTop, setNowTop] = useState(() => {
    const n = new Date();
    return ((n.getHours() * 60 + n.getMinutes()) / 60) * HOUR_HEIGHT;
  });
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setNowTop(((n.getHours() * 60 + n.getMinutes()) / 60) * HOUR_HEIGHT);
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);
  return nowTop;
}

function WeekView({ currentDate, events, openAdd, openDetail, isScheduling }: {
  currentDate: Date; events: CalendarEvent[];
  openAdd: (date: string, hour: number) => void;
  openDetail: (ev: CalendarEvent) => void;
  isScheduling?: boolean;
}) {
  const weekStart = getWeekStart(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const todayKey = toDateKey(new Date());
  const nowTop = useNowTop();
  const totalH = 24 * HOUR_HEIGHT;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const now = new Date();
    const nowKey = toDateKey(now);
    const weekHasToday = days.some(d => toDateKey(d) === nowKey);
    const targetMinutes = weekHasToday
      ? (now.getHours() * 60 + now.getMinutes())
      : (18 * 60);

    const targetTop = (targetMinutes / 60) * HOUR_HEIGHT;
    const centeredTop = targetTop - (el.clientHeight / 2);
    const maxTop = Math.max(totalH - el.clientHeight, 0);
    el.scrollTop = Math.max(0, Math.min(centeredTop, maxTop));
  }, [currentDate]);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
      {/* Day header */}
      <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', borderBottom: '1px solid #e5e5e5', flexShrink: 0 }}>
        <div style={{ padding: '8px', fontSize: '11px', color: '#999', textAlign: 'right' }}>EST</div>
        {days.map((d, i) => {
          const isToday = toDateKey(d) === todayKey;
          return (
            <div key={i} style={{ padding: '10px 0', textAlign: 'center', borderLeft: '1px solid #e5e5e5' }}>
              <div style={{ fontSize: '11px', color: '#888', fontWeight: 600, letterSpacing: '0.05em' }}>{DAYS[i]}</div>
              <div style={{
                fontSize: '22px', fontWeight: 700, color: isToday ? '#fff' : '#1a1a1a',
                width: 36, height: 36, borderRadius: '50%',
                backgroundColor: isToday ? THEME_COLOR : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '4px auto 0'
              }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      {/* Scrollable time grid */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', height: totalH }}>
          {/* Hour labels */}
          <div style={{ width: 56, flexShrink: 0, position: 'relative' }}>
            {HOURS.map(hour => (
              <div key={hour} style={{ position: 'absolute', top: hour * HOUR_HEIGHT - 7, right: 8, fontSize: '11px', color: '#aaa', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {hour === 0 ? '' : formatHour(hour)}
              </div>
            ))}
          </div>
          {/* Day columns */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', position: 'relative' }}>
            {/* Horizontal hour lines */}
            {HOURS.map(hour => (
              <div key={hour} style={{ position: 'absolute', top: hour * HOUR_HEIGHT, left: 0, right: 0, height: 1, backgroundColor: '#f0f0f0', pointerEvents: 'none', zIndex: 0 }} />
            ))}
            {/* Per-day columns */}
            {days.map((d, di) => {
              const key = toDateKey(d);
              const isToday = key === todayKey;
              const dayEvents = events.filter(e => e.date === key);
              return (
                <div key={di} style={{ position: 'relative', borderLeft: '1px solid #e5e5e5', height: totalH, cursor: 'pointer' }}
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const hour = Math.floor((e.clientY - rect.top) / HOUR_HEIGHT);
                    openAdd(key, Math.max(0, Math.min(23, hour)));
                  }}>
                  {isToday && (
                    <>
                      <div style={{ position: 'absolute', top: nowTop, left: -6, width: 12, height: 12, borderRadius: '50%', backgroundColor: '#e53e3e', zIndex: 3, transform: 'translateY(-50%)' }} />
                      <div style={{ position: 'absolute', top: nowTop, left: 6, right: 0, height: 2, backgroundColor: '#e53e3e', zIndex: 3, transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </>
                  )}
                  {computeEventLayouts(dayEvents).map(({ ev, top, height, col, totalCols }) => {
                    const bg = ev.color ?? THEME_COLOR;
                    const fg = getTextColor(bg);
                    const isSched = ev.id.startsWith('sched-');
                    return (
                      <div key={ev.id} onClick={e => { e.stopPropagation(); openDetail(ev); }}
                        className={isSched ? 'sched-event-enter' : undefined}
                        style={{ position: 'absolute', backgroundColor: bg, color: fg, borderRadius: 6,
                          left: `calc(${(col / totalCols) * 100}% + 2px)`,
                          width: `calc(${(1 / totalCols) * 100}% - 4px)`,
                          top: top + 1, height: height - 2,
                          overflow: 'hidden', boxSizing: 'border-box', zIndex: 1,
                          padding: '3px 6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', lineHeight: 1.3,
                          transition: isSched ? 'top 0.5s cubic-bezier(0.4,0,0.2,1), height 0.5s cubic-bezier(0.4,0,0.2,1)' : undefined,
                          animation: isSched && isScheduling ? 'sched-pulse 1s ease-in-out infinite' : undefined,
                        }}>
                        <div style={{ fontSize: '10px', opacity: 0.75, whiteSpace: 'nowrap' }}>{formatEventTime(ev.start_time)}</div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayView({ currentDate, events, openAdd, openDetail, isScheduling }: {
  currentDate: Date; events: CalendarEvent[];
  openAdd: (date: string, hour: number) => void;
  openDetail: (ev: CalendarEvent) => void;
  isScheduling?: boolean;
}) {
  const key = toDateKey(currentDate);
  const isToday = key === toDateKey(new Date());
  const dayEvents = events.filter(e => e.date === key);
  const nowTop = useNowTop();
  const totalH = 24 * HOUR_HEIGHT;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const now = new Date();
    const targetMinutes = isToday
      ? (now.getHours() * 60 + now.getMinutes())
      : (18 * 60);

    const targetTop = (targetMinutes / 60) * HOUR_HEIGHT;
    const centeredTop = targetTop - (el.clientHeight / 2);
    const maxTop = Math.max(totalH - el.clientHeight, 0);
    el.scrollTop = Math.max(0, Math.min(centeredTop, maxTop));
  }, [currentDate, isToday]);

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', height: totalH }}>
        {/* Hour labels */}
        <div style={{ width: 80, flexShrink: 0, position: 'relative' }}>
          {HOURS.map(hour => (
            <div key={hour} style={{ position: 'absolute', top: hour * HOUR_HEIGHT - 8, right: 12, fontSize: '12px', color: '#aaa', whiteSpace: 'nowrap' }}>
              {hour === 0 ? '' : formatHour(hour)}
            </div>
          ))}
        </div>
        {/* Events column */}
        <div style={{ flex: 1, borderLeft: '1px solid #e5e5e5', position: 'relative', height: totalH, cursor: 'pointer' }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const hour = Math.floor((e.clientY - rect.top) / HOUR_HEIGHT);
            openAdd(key, Math.max(0, Math.min(23, hour)));
          }}>
          {/* Hour lines */}
          {HOURS.map(hour => (
            <div key={hour} style={{ position: 'absolute', top: hour * HOUR_HEIGHT, left: 0, right: 0, height: 1, backgroundColor: '#f0f0f0', pointerEvents: 'none' }} />
          ))}
          {/* Current time indicator */}
          {isToday && (
            <>
              <div style={{ position: 'absolute', top: nowTop, left: -6, width: 12, height: 12, borderRadius: '50%', backgroundColor: '#e53e3e', zIndex: 3, transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: nowTop, left: 6, right: 0, height: 2, backgroundColor: '#e53e3e', zIndex: 3, transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </>
          )}
          {/* Events */}
          {computeEventLayouts(dayEvents).map(({ ev, top, height, col, totalCols }) => {
            const bg = ev.color ?? THEME_COLOR;
            const fg = getTextColor(bg);
            const isSched = ev.id.startsWith('sched-');
            return (
              <div key={ev.id} onClick={e => { e.stopPropagation(); openDetail(ev); }}
                className={isSched ? 'sched-event-enter' : undefined}
                style={{ position: 'absolute', backgroundColor: bg, color: fg, borderRadius: 8,
                  left: `calc(${(col / totalCols) * 100}% + 4px)`,
                  width: `calc(${(1 / totalCols) * 100}% - 8px)`,
                  top: top + 1, height: height - 2,
                  overflow: 'hidden', boxSizing: 'border-box',
                  padding: '4px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: isSched ? 'top 0.5s cubic-bezier(0.4,0,0.2,1), height 0.5s cubic-bezier(0.4,0,0.2,1)' : undefined,
                  animation: isSched && isScheduling ? 'sched-pulse 1s ease-in-out infinite' : undefined,
                }}>
                <div style={{ fontSize: 11, opacity: 0.75, whiteSpace: 'nowrap' }}>{formatEventTime(ev.start_time)} – {formatEventTime(ev.end_time)}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                {ev.description && height > 54 && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.description}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthView({ currentDate, events, openAdd, openDetail, setCurrentDate, setView }: {
  currentDate: Date; events: CalendarEvent[];
  openAdd: (date: string, hour: number) => void;
  openDetail: (ev: CalendarEvent) => void;
  setCurrentDate: (d: Date) => void;
  setView: (v: ViewMode) => void;
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const todayKey = toDateKey(new Date());

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e5e5e5' }}>
        {DAYS.map(d => <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, fontWeight: 600, color: '#888', letterSpacing: '0.05em' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flex: 1 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} style={{ borderTop: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }} />;
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEvents = events.filter(e => e.date === key);
          const isToday = key === todayKey;
          return (
            <div key={i} onClick={() => openAdd(key, 9)}
              style={{ borderTop: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', padding: 6, cursor: 'pointer', minHeight: 90 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: isToday ? THEME_COLOR : 'transparent',
                color: isToday ? '#fff' : '#1a1a1a', fontSize: 13, fontWeight: 700, marginBottom: 4
              }}>{day}</div>
              {dayEvents.slice(0, 3).map(ev => {
                const bg = ev.color ?? THEME_COLOR;
                const fg = getTextColor(bg);
                return (
                  <div key={ev.id} onClick={e => { e.stopPropagation(); openDetail(ev); }}
                    style={{ backgroundColor: bg, color: fg, borderRadius: 4, padding: '1px 5px', fontSize: 11, fontWeight: 600, marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {ev.title}
                  </div>
                );
              })}
              {dayEvents.length > 3 && <div style={{ fontSize: 10, color: '#999' }}>+{dayEvents.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearView({ currentDate, events, setCurrentDate, setView }: {
  currentDate: Date; events: CalendarEvent[];
  setCurrentDate: (d: Date) => void; setView: (v: ViewMode) => void;
}) {
  const year = currentDate.getFullYear();
  const todayKey = toDateKey(new Date());
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
      {MONTHS.map((month, mi) => {
        const firstDay = new Date(year, mi, 1).getDay();
        const daysInMonth = new Date(year, mi + 1, 0).getDate();
        const cells = [
          ...Array.from({ length: firstDay }, () => null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
        ];
        return (
          <div key={mi}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#1a1a1a' }}>{month}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {DAYS.map(d => <div key={d} style={{ fontSize: 8, color: '#bbb', textAlign: 'center', fontWeight: 600 }}>{d[0]}</div>)}
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const key = `${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const hasEvent = events.some(e => e.date === key);
                const isToday = key === todayKey;
                return (
                  <div key={i} onClick={() => { setCurrentDate(new Date(year, mi, day)); setView('Day'); }}
                    style={{
                      textAlign: 'center', fontSize: 10, cursor: 'pointer', borderRadius: 3, padding: '1px 0',
                      backgroundColor: isToday ? THEME_COLOR : hasEvent ? '#e5e5e5' : 'transparent',
                      color: isToday ? '#fff' : '#1a1a1a', fontWeight: isToday ? 700 : 400
                    }}>{day}</div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──
export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>('Week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // Unified modal
  const [showUnifiedModal, setShowUnifiedModal] = useState(false);
  const [modalTab, setModalTab] = useState<'task' | 'event'>('task');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Event form fields
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formStart, setFormStart] = useState('09:00');
  const [formEnd, setFormEnd] = useState('10:00');
  const [formDesc, setFormDesc] = useState('');

  // Task form fields
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDuration, setTaskDuration] = useState<number | ''>('');
  const [taskPriority, setTaskPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [taskEnergyLevel, setTaskEnergyLevel] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [taskIsFixedTime, setTaskIsFixedTime] = useState(false);
  const [taskFixedStart, setTaskFixedStart] = useState('');
  const [taskFixedEnd, setTaskFixedEnd] = useState('');
  const [taskIsSplittable, setTaskIsSplittable] = useState(false);
  const [taskChunkMin, setTaskChunkMin] = useState<number | ''>('');
  const [taskChunkMax, setTaskChunkMax] = useState<number | ''>('');
  const [taskColor, setTaskColor] = useState('#1a1a1a');

  // Event color + recurrence
  const [formColor, setFormColor] = useState('#1a1a1a');
  const [formRecurrenceType, setFormRecurrenceType] = useState<'none' | 'daily' | 'weekly'>('none');
  const [formRecurrenceDays, setFormRecurrenceDays] = useState<number[]>([]);

  // Button hover states
  const [todayHover, setTodayHover] = useState(false);
  const [prevHover, setPrevHover] = useState(false);
  const [nextHover, setNextHover] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState<Array<Record<string, any>>>([]);
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);
  const [undoInfo, setUndoInfo] = useState<{ id: string; timer?: number } | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      const { data, error } = await supabase.from('events').select('*');
      if (!error && data) setEvents(data);
    };
    loadEvents();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('tasks');
      if (raw) setTasks(JSON.parse(raw));
    } catch (e) {}
  }, []);

  function addTask(t: Record<string, any>) {
    const withMeta = { ...t, id: t.id ?? t.createdAt ?? new Date().toISOString(), isDeleted: false };
    setTasks(prev => {
      const next = [withMeta, ...prev];
      try { localStorage.setItem('tasks', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    setCreatedMessage(`Saved "${t.title || 'untitled'}"`);
    setTimeout(() => setCreatedMessage(null), 2500);
  }

  function deleteTask(id: string) {
    setTasks(prev => {
      const next = prev.map(item => item.id === id ? { ...item, isDeleted: true } : item);
      try { localStorage.setItem('tasks', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    setUndoInfo({ id });
    const timer = window.setTimeout(() => {
      setTasks(prev => {
        const next = prev.filter(item => item.id !== id);
        try { localStorage.setItem('tasks', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      setUndoInfo(null);
    }, 5000);
    setUndoInfo({ id, timer });
  }

  function undoDelete() {
    if (!undoInfo) return;
    const { id, timer } = undoInfo;
    if (timer) window.clearTimeout(timer);
    setTasks(prev => {
      const next = prev.map(item => item.id === id ? { ...item, isDeleted: false } : item);
      try { localStorage.setItem('tasks', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    setUndoInfo(null);
  }

  function formatDeadline(iso?: string | null) {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
      const timePart = hasTime ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
      return timePart ? `${datePart} • ${timePart}` : datePart;
    } catch (e) {
      return null;
    }
  }

  function completeTask(id: string) {
    setCompletingTaskId(id);
    setTimeout(() => {
      setCompletingTaskId(null);
      setTasks(prev => {
        const next = prev.map(item => item.id === id ? { ...item, isCompleted: true } : item);
        try { localStorage.setItem('tasks', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      setEvents(prev => prev.filter(e => e.id !== `sched-${id}`));
    }, 500);
  }

  async function autoSchedule(pendingOverride?: Array<Record<string, any>>) {
    const pending = (pendingOverride ?? tasks).filter(t => !t.isDeleted && !t.isCompleted);
    if (pending.length === 0) { setScheduleError('No tasks to schedule.'); return; }
    setIsScheduling(true);
    setScheduleStatus(null);
    setScheduleError(null);
    const now = new Date();
    const eightAM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
    const horizonStart = now > eightAM ? now : eightAM;
    const horizonEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 0);

    // Build blackout windows from existing calendar events (not auto-scheduled ones, those get replaced)
    const existingBlackouts = events
      .filter(e => !e.id.startsWith('sched-'))
      .map(e => {
        const pad = (s: string) => s.length === 5 ? s + ':00' : s;
        return { kind: 'absolute', start: `${e.date}T${pad(e.start_time)}`, end: `${e.date}T${pad(e.end_time)}` };
      });

    const defaultDeadline = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    );

    const apiTasks = [...pending]
      .sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))
      .map(t => {
        const explicitDeadline = t.deadline ? new Date(t.deadline) : null;
        const effectiveDeadline = explicitDeadline && explicitDeadline > now
          ? explicitDeadline
          : defaultDeadline;

        return {
          kind: 'task',
          id: t.id,
          user_id: 'user-001',
          name: t.title,
          description: t.description || null,
          priority: (t.priority || 'medium').toLowerCase(),
          flexibility: 'movable',
          requirement: 'optional',
          is_completed: false,
          created_at: toLocalISO(new Date(t.createdAt || now)),
          updated_at: toLocalISO(new Date(t.createdAt || now)),
          duration_minutes: Math.max(1, t.durationMinutes || t.duration || 60),
          constraints: {
            latest_end: toLocalISO(effectiveDeadline),
            allowed_windows: [
              { kind: 'weekly', days_of_week: [0, 1, 2, 3, 4, 5, 6], time_start: '08:00', time_end: '23:59' },
            ],
            ...(existingBlackouts.length > 0 ? { blackout_windows: existingBlackouts } : {}),
          },
        };
      });
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: apiTasks,
          horizon_start: toLocalISO(horizonStart),
          horizon_end: toLocalISO(horizonEnd),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Scheduler error ${res.status}`);
      }
      const result = await res.json();
      const newEvents: CalendarEvent[] = result.placements.map((p: any) => {
        const s = new Date(p.start);
        const e = new Date(p.end);
        const taskColor = pending.find(t => t.id === p.task_id)?.color;
        return {
          id: `sched-${p.task_id}`,
          title: p.task_name,
          date: toDateKey(s),
          start_time: s.toTimeString().slice(0, 8),
          end_time: e.toTimeString().slice(0, 8),
          description: 'Auto-scheduled',
          color: taskColor,
        };
      });
      setEvents(prev => [...prev.filter(e => !e.id.startsWith('sched-')), ...newEvents]);
      const placedIds = new Set(result.placements.map((p: any) => p.task_id));
      const unscheduled = pending.filter(t => !placedIds.has(t.id));
      if (unscheduled.length > 0) {
        setScheduleError(`Could not schedule: ${unscheduled.map(t => t.title).join(', ')}`);
      }
      setScheduleStatus(`${result.placements.length} of ${pending.length} placed`);
    } catch (err: any) {
      setScheduleError(err.message || 'Scheduler unavailable');
    } finally {
      setIsScheduling(false);
    }
  }

  // ── Modal helpers ──

  function closeModal() {
    setShowUnifiedModal(false);
    setEditingEventId(null);
    setEditingTaskId(null);
    setModalError(null);
  }

  function openModal(tab: 'task' | 'event') {
    setModalTab(tab);
    setEditingEventId(null);
    setEditingTaskId(null);
    setModalError(null);
    if (tab === 'task') {
      setTaskTitle(''); setTaskDesc(''); setTaskDuration(''); setTaskPriority('Medium');
      setTaskEnergyLevel('Medium'); setTaskDeadline('');
      setTaskIsFixedTime(false); setTaskFixedStart(''); setTaskFixedEnd('');
      setTaskIsSplittable(false); setTaskChunkMin(''); setTaskChunkMax('');
    } else {
      setFormTitle(''); setFormDate(toDateKey(currentDate)); setFormStart('09:00'); setFormEnd('10:00'); setFormDesc('');
      setFormColor('#1a1a1a'); setFormRecurrenceType('none'); setFormRecurrenceDays([]);
    }
    setShowUnifiedModal(true);
  }

  const openAdd = (date: string, hour: number) => {
    const endHour = Math.min(hour + 1, 23);
    setFormTitle(''); setFormDate(date);
    setFormStart(formatTimeStr(hour)); setFormEnd(formatTimeStr(endHour)); setFormDesc('');
    setFormColor('#1a1a1a'); setFormRecurrenceType('none'); setFormRecurrenceDays([]);
    setModalTab('event');
    setEditingEventId(null); setEditingTaskId(null); setModalError(null);
    setShowUnifiedModal(true);
  };

  const openDetail = (ev: CalendarEvent) => {
    setFormTitle(ev.title);
    setFormDate(ev.date);
    setFormStart(ev.start_time.slice(0, 5));
    setFormEnd(ev.end_time.slice(0, 5));
    setFormDesc(ev.description || '');
    setFormColor(ev.color ?? '#1a1a1a');
    setFormRecurrenceType(ev.recurrence?.type ?? 'none');
    setFormRecurrenceDays(ev.recurrence?.days ?? []);
    setModalTab('event');
    setEditingEventId(ev._recurringBaseId ?? ev.id); setEditingTaskId(null); setModalError(null);
    setShowUnifiedModal(true);
  };

  function openEditTask(t: Record<string, any>) {
    setTaskTitle(t.title || '');
    setTaskDesc(t.description || '');
    setTaskDuration(t.durationMinutes ?? t.duration ?? '');
    setTaskPriority(t.priority || 'Medium');
    setTaskEnergyLevel(t.energyLevel || 'Medium');
    setTaskDeadline(t.deadline ? toLocalISO(new Date(t.deadline)).slice(0, 16) : '');
    setTaskIsFixedTime(Boolean(t.isFixedTime));
    setTaskFixedStart(t.fixedStart ? toLocalISO(new Date(t.fixedStart)).slice(0, 16) : '');
    setTaskFixedEnd(t.fixedEnd ? toLocalISO(new Date(t.fixedEnd)).slice(0, 16) : '');
    setTaskIsSplittable(Boolean(t.isSplittable));
    setTaskChunkMin(t.chunkSize?.min ?? '');
    setTaskChunkMax(t.chunkSize?.max ?? '');
    setTaskColor(t.color ?? '#1a1a1a');
    setModalTab('task');
    setEditingTaskId(t.id); setEditingEventId(null); setModalError(null);
    setShowUnifiedModal(true);
  }

  const saveEvent = async () => {
    if (!formTitle.trim()) { setModalError('Title is required.'); return; }
    if (!formDate) { setModalError('Date is required.'); return; }
    setModalError(null);
    const recurrenceData = formRecurrenceType !== 'none'
      ? { type: formRecurrenceType, days: formRecurrenceType === 'weekly' ? formRecurrenceDays : [] }
      : null;
    const ev = { title: formTitle.trim(), date: formDate, start_time: formStart, end_time: formEnd, description: formDesc, color: formColor, recurrence: recurrenceData };
    const { data, error } = await supabase.from('events').insert([ev]).select();
    if (!error && data) {
      setEvents(prev => [...prev, data[0]]);
      closeModal();
    } else {
      setModalError(error?.message ?? 'Failed to save event.');
    }
  };

  const updateEvent = async () => {
    if (!editingEventId || !formTitle.trim()) { setModalError('Title is required.'); return; }
    const recurrenceData = formRecurrenceType !== 'none'
      ? { type: formRecurrenceType, days: formRecurrenceType === 'weekly' ? formRecurrenceDays : [] }
      : null;
    const updates = { title: formTitle.trim(), date: formDate, start_time: formStart, end_time: formEnd, description: formDesc, color: formColor, recurrence: recurrenceData };
    const { error } = await supabase.from('events').update(updates).eq('id', editingEventId);
    if (!error) {
      setEvents(prev => prev.map(e => e.id === editingEventId ? { ...e, ...updates } : e));
      closeModal();
    } else {
      setModalError(error?.message ?? 'Failed to update event.');
    }
  };

  const deleteEvent = async (id: string) => {
    if (id.startsWith('sched-')) {
      setEvents(prev => prev.filter(e => e.id !== id));
      closeModal();
      return;
    }
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (!error) {
      setEvents(prev => prev.filter(e => e.id !== id));
      closeModal();
    } else {
      setModalError(error?.message ?? 'Failed to delete event.');
    }
  };

  function handleTaskSubmit() {
    if (!taskTitle.trim()) { setModalError('Title is required.'); return; }
    setModalError(null);
    const durationMinutes = taskIsFixedTime && taskFixedStart && taskFixedEnd
      ? Math.max(0, Math.round((new Date(taskFixedEnd).getTime() - new Date(taskFixedStart).getTime()) / 60000))
      : (Number(taskDuration) || 0);
    const payload = {
      title: taskTitle.trim(),
      description: taskDesc.trim(),
      duration: Number(taskDuration) || 0,
      durationMinutes,
      priority: taskPriority,
      energyLevel: taskEnergyLevel,
      deadline: taskDeadline ? new Date(taskDeadline).toISOString() : null,
      isFixedTime: taskIsFixedTime,
      fixedStart: taskIsFixedTime && taskFixedStart ? new Date(taskFixedStart).toISOString() : null,
      fixedEnd: taskIsFixedTime && taskFixedEnd ? new Date(taskFixedEnd).toISOString() : null,
      isSplittable: taskIsSplittable,
      chunkSize: taskIsSplittable ? { min: Number(taskChunkMin) || 0, max: Number(taskChunkMax) || 0 } : null,
      color: taskColor,
    };
    if (editingTaskId) {
      setTasks(prev => {
        const next = prev.map(item => item.id === editingTaskId ? { ...item, ...payload } : item);
        try { localStorage.setItem('tasks', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      closeModal();
    } else {
      const newId = new Date().toISOString();
      const newTask = { ...payload, id: newId, createdAt: newId, isDeleted: false, isCompleted: false };
      setTasks(prev => {
        const next = [newTask, ...prev];
        try { localStorage.setItem('tasks', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      setCreatedMessage(`Saved "${payload.title}"`);
      setTimeout(() => setCreatedMessage(null), 2500);
      closeModal();
      // Pass the new task explicitly since setTasks hasn't flushed yet
      const currentPending = tasks.filter(t => !t.isDeleted && !t.isCompleted);
      autoSchedule([newTask, ...currentPending]);
    }
  }

  const displayEvents = useMemo(() => {
    const wStart = new Date(currentDate); wStart.setDate(wStart.getDate() - 14);
    const wEnd = new Date(currentDate); wEnd.setDate(wEnd.getDate() + 90);
    return expandEvents(events, wStart, wEnd);
  }, [events, currentDate]);

  const navigate = (dir: 1 | -1) => {
    const d = new Date(currentDate);
    if (view === 'Day') d.setDate(d.getDate() + dir);
    else if (view === 'Week') d.setDate(d.getDate() + dir * 7);
    else if (view === 'Month') d.setMonth(d.getMonth() + dir);
    else d.setFullYear(d.getFullYear() + dir);
    setCurrentDate(d);
  };

  const headerLabel = () => {
    if (view === 'Day') return `${MONTHS[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
    if (view === 'Week') {
      const ws = getWeekStart(currentDate);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      return `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${we.getDate()}, ${ws.getFullYear()}`;
    }
    if (view === 'Month') return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    return `${currentDate.getFullYear()}`;
  };

  const arrowBtnStyle = (hovered: boolean): React.CSSProperties => ({
    width: 28, height: 28, borderRadius: 6, border: '1px solid #e0e0e0',
    background: hovered ? '#f0f0f0' : '#fff', fontSize: 18, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 300, transition: 'background 0.15s',
  });

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', backgroundColor: '#fff', color: '#1a1a1a' }}>

      {/* Top Nav */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #e5e5e5', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setCurrentDate(new Date())}
            onMouseEnter={() => setTodayHover(true)}
            onMouseLeave={() => setTodayHover(false)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e0e0e0', background: todayHover ? '#f0f0f0' : '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, transition: 'background 0.15s' }}>
            Today
          </button>
          <button
            onClick={() => navigate(-1)}
            onMouseEnter={() => setPrevHover(true)}
            onMouseLeave={() => setPrevHover(false)}
            style={arrowBtnStyle(prevHover)}>‹</button>
          <button
            onClick={() => navigate(1)}
            onMouseEnter={() => setNextHover(true)}
            onMouseLeave={() => setNextHover(false)}
            style={arrowBtnStyle(nextHover)}>›</button>
          <span style={{ fontSize: 15, fontWeight: 700, marginLeft: 8 }}>{headerLabel()}</span>
        </div>

        <div style={{ margin: '0 auto', display: 'flex', gap: 2, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 3 }}>
          {(['Day', 'Week', 'Month', 'Year'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              backgroundColor: view === v ? THEME_COLOR : 'transparent',
              color: view === v ? '#fff' : '#666', transition: 'all 0.15s'
            }}>{v}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e0e0e0', borderRadius: 8, padding: '6px 12px' }}>
          <span style={{ color: '#aaa' }}>🔍</span>
          <input placeholder="Search" style={{ border: 'none', outline: 'none', fontSize: 13, width: 140 }} />
        </div>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setIsProfileMenuOpen(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid #e0e0e0',
              background: '#fff',
              cursor: 'pointer',
            }}
            aria-haspopup="menu"
            aria-expanded={isProfileMenuOpen}
            aria-label="Open profile menu"
          >
            <CircleUserRound style={{ width: 18, height: 18, color: '#666' }} />
            <ChevronDown style={{ width: 14, height: 14, color: '#777' }} />
          </button>

          {isProfileMenuOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                minWidth: 190,
                background: '#fff',
                border: '1px solid #e5e5e5',
                borderRadius: 12,
                boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
                padding: 6,
                zIndex: 50,
              }}
            >
              {['Profile', 'Preferences', 'Notifications', 'Help & Support', 'Sign out'].map((item) => (
                <button
                  key={item}
                  role="menuitem"
                  type="button"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 13,
                    color: '#666',
                    cursor: 'default',
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content Row */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Calendar Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {view === 'Week' && <WeekView currentDate={currentDate} events={displayEvents} openAdd={openAdd} openDetail={openDetail} isScheduling={isScheduling} />}
          {view === 'Day' && <DayView currentDate={currentDate} events={displayEvents} openAdd={openAdd} openDetail={openDetail} isScheduling={isScheduling} />}
          {view === 'Month' && <MonthView currentDate={currentDate} events={displayEvents} openAdd={openAdd} openDetail={openDetail} setCurrentDate={setCurrentDate} setView={setView} />}
          {view === 'Year' && <YearView currentDate={currentDate} events={displayEvents} setCurrentDate={setCurrentDate} setView={setView} />}
        </div>

        {/* Task Sidebar */}
        <div style={{ width: 280, borderLeft: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #e5e5e5' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1a' }}>
                Tasks ({tasks.filter(t => !t.isDeleted && !t.isCompleted).length})
              </span>
              <button
                onClick={() => openModal('task')}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #1a1a1a',
                  background: '#1a1a1a',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}>
                + New Task
              </button>
            </div>
            <button
              onClick={() => autoSchedule()}
              disabled={isScheduling}
              style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: isScheduling ? '#999' : THEME_COLOR, color: '#fff', fontWeight: 700, fontSize: 13, cursor: isScheduling ? 'default' : 'pointer' }}>
              {isScheduling ? 'Scheduling…' : '↺ Reshuffle'}
            </button>
            {scheduleStatus && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', background: '#f0fdf4', borderRadius: 6, padding: '6px 10px' }}>{scheduleStatus}</div>
            )}
            {scheduleError && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', background: '#fef2f2', borderRadius: 6, padding: '6px 10px' }}>{scheduleError}</div>
            )}
          </div>

          {/* Task List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {createdMessage && (
              <div style={{ borderRadius: 6, background: '#f0fdf4', padding: '6px 10px', fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{createdMessage}</div>
            )}
            {tasks.filter(t => !t.isDeleted && !t.isCompleted).length === 0 ? (
              <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', marginTop: 32 }}>No tasks yet.<br />Click "+ New" to add one.</div>
            ) : (
              tasks.filter(t => !t.isDeleted && !t.isCompleted).map((t, i) => {
                const isCompleting = completingTaskId === t.id;
                return (
                <div key={t.id ?? i} onClick={() => !isCompleting && openEditTask(t)}
                  style={{ borderRadius: 8, background: '#fff', border: '1px solid #e8e8e8', padding: '8px 10px', display: 'flex', alignItems: 'flex-start', gap: 8,
                    cursor: isCompleting ? 'default' : 'pointer',
                    transition: 'opacity 0.45s ease, transform 0.45s ease',
                    opacity: isCompleting ? 0 : 1,
                    transform: isCompleting ? 'translateX(16px) scale(0.97)' : 'translateX(0) scale(1)',
                    pointerEvents: isCompleting ? 'none' : 'auto',
                  }}>
                  <button
                    onClick={e => { e.stopPropagation(); if (!isCompleting) completeTask(t.id); }}
                    title="Mark complete"
                    style={{ width: 18, height: 18, borderRadius: '50%',
                      border: `1.5px solid ${isCompleting ? '#16a34a' : '#ccc'}`,
                      background: isCompleting ? '#16a34a' : 'none',
                      cursor: 'pointer', flexShrink: 0, marginTop: 2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isCompleting ? '#fff' : '#888', fontSize: 10,
                      animation: isCompleting ? 'task-check-pop 0.4s ease forwards' : undefined,
                      transition: 'background 0.2s ease, border-color 0.2s ease',
                    }}>
                    {isCompleting ? '✓' : ''}
                  </button>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t.color ?? '#1a1a1a', flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {(t.durationMinutes ?? t.duration) || 0} min
                      {t.deadline && ` · Due ${formatDeadline(t.deadline)}`}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); openEditTask(t); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, flexShrink: 0 }}>
                    <Pencil style={{ width: 13, height: 13, color: '#888' }} />
                  </button>
                </div>
                );
              })
            )}
            {undoInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px' }}>
                <span style={{ fontSize: 12, color: '#92400e' }}>Task deleted</span>
                <button onClick={undoDelete} style={{ fontSize: 12, color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Undo</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unified Modal */}
      {showUnifiedModal && (() => {
        const isEditingEvent = editingEventId !== null;
        const isEditingTask = editingTaskId !== null;
        const tabStyle = (active: boolean): React.CSSProperties => ({
          padding: '10px 20px', border: 'none', background: 'none', fontWeight: 700, fontSize: 14,
          color: active ? THEME_COLOR : '#999',
          borderBottom: active ? `2px solid ${THEME_COLOR}` : '2px solid transparent',
          cursor: 'pointer', marginBottom: -2,
        });
        return (
          <div style={overlay} onClick={closeModal}>
            <div style={{ ...modal, maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: '2px solid #f0f0f0', marginBottom: 20 }}>
                <button style={tabStyle(modalTab === 'task')} onClick={() => { setModalTab('task'); setModalError(null); }}>Task</button>
                <button style={tabStyle(modalTab === 'event')} onClick={() => { setModalTab('event'); setModalError(null); }}>Event</button>
                <button onClick={closeModal} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#aaa', alignSelf: 'center', padding: '0 4px' }}>×</button>
              </div>

              {modalTab === 'task' && (
                <>
                  <h2 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 18 }}>{isEditingTask ? 'Edit Task' : 'New Task'}</h2>

                  <label style={labelStyle}>Title *</label>
                  <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g. Prepare presentation" style={inputStyle} autoFocus />

                  <label style={labelStyle}>Description</label>
                  <textarea value={taskDesc} onChange={e => setTaskDesc(e.target.value)} placeholder="Optional details..." rows={3} style={{ ...inputStyle, resize: 'none' }} />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Duration (minutes)</label>
                      <input type="number" min={0} value={taskDuration} onChange={e => setTaskDuration(e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Priority</label>
                      <select value={taskPriority} onChange={e => setTaskPriority(e.target.value as any)} style={inputStyle}>
                        <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Energy Level</label>
                      <select value={taskEnergyLevel} onChange={e => setTaskEnergyLevel(e.target.value as any)} style={inputStyle}>
                        <option>Low</option><option>Medium</option><option>High</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Deadline</label>
                      <input type="datetime-local" value={taskDeadline} onChange={e => setTaskDeadline(e.target.value)} style={inputStyle} />
                    </div>
                  </div>

                  <label style={labelStyle}>Color</label>
                  <ColorPicker value={taskColor} onChange={setTaskColor} />

                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="fixedTime" checked={taskIsFixedTime} onChange={e => setTaskIsFixedTime(e.target.checked)} style={{ width: 16, height: 16 }} />
                    <label htmlFor="fixedTime" style={{ fontSize: 13, color: '#444', cursor: 'pointer' }}>Fixed start/end (use exact times)</label>
                  </div>

                  {taskIsFixedTime && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                      <div>
                        <label style={labelStyle}>Start</label>
                        <input type="datetime-local" value={taskFixedStart} onChange={e => setTaskFixedStart(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>End</label>
                        <input type="datetime-local" value={taskFixedEnd} onChange={e => setTaskFixedEnd(e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="splittable" checked={taskIsSplittable} onChange={e => setTaskIsSplittable(e.target.checked)} style={{ width: 16, height: 16 }} />
                    <label htmlFor="splittable" style={{ fontSize: 13, color: '#444', cursor: 'pointer' }}>Allow splitting into chunks</label>
                  </div>

                  {taskIsSplittable && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                      <div>
                        <label style={labelStyle}>Chunk min (minutes)</label>
                        <input type="number" min={1} value={taskChunkMin} onChange={e => setTaskChunkMin(e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Chunk max (minutes)</label>
                        <input type="number" min={1} value={taskChunkMax} onChange={e => setTaskChunkMax(e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle} />
                      </div>
                    </div>
                  )}

                  {modalError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 10 }}>{modalError}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    {isEditingTask && (
                      <button onClick={() => { deleteTask(editingTaskId!); closeModal(); }} style={{ ...cancelBtnStyle, color: '#e53e3e', borderColor: '#e53e3e' }}>Delete</button>
                    )}
                    <button onClick={closeModal} style={cancelBtnStyle}>Cancel</button>
                    <button onClick={handleTaskSubmit} style={saveBtnStyle}>{isEditingTask ? 'Save Changes' : 'Create Task'}</button>
                  </div>
                </>
              )}

              {modalTab === 'event' && (
                <>
                  <h2 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 18 }}>{isEditingEvent ? 'Edit Event' : 'New Event'}</h2>
                  <label style={labelStyle}>Title *</label>
                  <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Event title" style={inputStyle} autoFocus />
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={inputStyle} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Start Time</label>
                      <input type="time" value={formStart} onChange={e => setFormStart(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>End Time</label>
                      <input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  <label style={labelStyle}>Description</label>
                  <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Optional notes..." style={{ ...inputStyle, height: 60, resize: 'none' }} />

                  <label style={labelStyle}>Color</label>
                  <ColorPicker value={formColor} onChange={setFormColor} />

                  <label style={labelStyle}>Repeat</label>
                  <select value={formRecurrenceType} onChange={e => setFormRecurrenceType(e.target.value as any)} style={inputStyle}>
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly on selected days</option>
                  </select>
                  {formRecurrenceType === 'weekly' && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => (
                        <button key={i} type="button"
                          onClick={() => setFormRecurrenceDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])}
                          style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid',
                            backgroundColor: formRecurrenceDays.includes(i) ? THEME_COLOR : 'transparent',
                            borderColor: formRecurrenceDays.includes(i) ? THEME_COLOR : '#e0e0e0',
                            color: formRecurrenceDays.includes(i) ? '#fff' : '#666',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          {day}
                        </button>
                      ))}
                    </div>
                  )}

                  {modalError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 10 }}>{modalError}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    {isEditingEvent && (
                      <button onClick={() => deleteEvent(editingEventId!)} style={{ ...cancelBtnStyle, color: '#e53e3e', borderColor: '#e53e3e' }}>Delete</button>
                    )}
                    <button onClick={closeModal} style={cancelBtnStyle}>Cancel</button>
                    <button onClick={isEditingEvent ? updateEvent : saveEvent} style={saveBtnStyle}>
                      {isEditingEvent ? 'Save Changes' : 'Save Event'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}