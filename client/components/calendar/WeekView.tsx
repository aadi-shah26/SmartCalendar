'use client';
import { useRef } from 'react';
import { getTextColor } from '../../lib/calendar/colors';
import { DAYS, HOURS, formatEventTime, formatHour, getWeekStart, toDateKey } from '../../lib/calendar/dates';
import { DAY_HEIGHT, HOUR_HEIGHT } from '../../lib/calendar/layout';
import type { CalendarEvent } from '../../lib/calendar/types';
import { DayEvents, NowIndicator, type MoveBlock } from './TimedEvents';
import { hourAtClick, useNowTop, useScrollToNow } from './timeGrid';

const startTimeLabel = (ev: CalendarEvent) => formatEventTime(ev.start_time);

export default function WeekView({ currentDate, events, openAdd, openDetail, onMove, accentColor }: {
  currentDate: Date; events: CalendarEvent[];
  openAdd: (date: string, hour: number) => void;
  openDetail: (ev: CalendarEvent) => void;
  onMove?: MoveBlock;
  accentColor: string;
}) {
  const weekStart = getWeekStart(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const todayKey = toDateKey(new Date());
  const nowTop = useNowTop();
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollToNow(scrollRef, currentDate, days.some(d => toDateKey(d) === todayKey));

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
                fontSize: '22px', fontWeight: 700, color: isToday ? getTextColor(accentColor) : '#1a1a1a',
                width: 36, height: 36, borderRadius: '50%',
                backgroundColor: isToday ? accentColor : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '4px auto 0'
              }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      {/* Scrollable time grid */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', height: DAY_HEIGHT }}>
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
            {days.map((d, di) => {
              const key = toDateKey(d);
              return (
                <div key={di} data-day-column={key} style={{ position: 'relative', borderLeft: '1px solid #e5e5e5', height: DAY_HEIGHT, cursor: 'pointer' }}
                  onClick={e => openAdd(key, hourAtClick(e))}>
                  {key === todayKey && <NowIndicator top={nowTop} dotClickable />}
                  <DayEvents events={events.filter(e => e.date === key)} size="sm" accentColor={accentColor}
                    onOpen={openDetail} onMove={onMove} timeLabel={startTimeLabel} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
