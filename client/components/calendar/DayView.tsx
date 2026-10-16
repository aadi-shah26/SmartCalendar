'use client';
import { useRef } from 'react';
import { HOURS, formatEventTime, formatHour, toDateKey } from '../../lib/calendar/dates';
import { DAY_HEIGHT, HOUR_HEIGHT } from '../../lib/calendar/layout';
import type { CalendarEvent } from '../../lib/calendar/types';
import { DayEvents, NowIndicator, type MoveBlock } from './TimedEvents';
import { hourAtClick, useNowTop, useScrollToNow } from './timeGrid';

const timeRangeLabel = (ev: CalendarEvent) => `${formatEventTime(ev.start_time)} – ${formatEventTime(ev.end_time)}`;

export default function DayView({ currentDate, events, openAdd, openDetail, onMove, accentColor }: {
  currentDate: Date; events: CalendarEvent[];
  openAdd: (date: string, hour: number) => void;
  openDetail: (ev: CalendarEvent) => void;
  onMove?: MoveBlock;
  accentColor: string;
}) {
  const key = toDateKey(currentDate);
  const isToday = key === toDateKey(new Date());
  const nowTop = useNowTop();
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollToNow(scrollRef, currentDate, isToday);

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', height: DAY_HEIGHT }}>
        {/* Hour labels */}
        <div style={{ width: 80, flexShrink: 0, position: 'relative' }}>
          {HOURS.map(hour => (
            <div key={hour} style={{ position: 'absolute', top: hour * HOUR_HEIGHT - 8, right: 12, fontSize: '12px', color: '#aaa', whiteSpace: 'nowrap' }}>
              {hour === 0 ? '' : formatHour(hour)}
            </div>
          ))}
        </div>
        {/* Events column */}
        <div data-day-column={key} style={{ flex: 1, borderLeft: '1px solid #e5e5e5', position: 'relative', height: DAY_HEIGHT, cursor: 'pointer' }}
          onClick={e => openAdd(key, hourAtClick(e))}>
          {/* Hour lines */}
          {HOURS.map(hour => (
            <div key={hour} style={{ position: 'absolute', top: hour * HOUR_HEIGHT, left: 0, right: 0, height: 1, backgroundColor: '#f0f0f0', pointerEvents: 'none' }} />
          ))}
          {isToday && <NowIndicator top={nowTop} />}
          <DayEvents events={events.filter(e => e.date === key)} size="md" accentColor={accentColor}
            onOpen={openDetail} onMove={onMove} timeLabel={timeRangeLabel} />
        </div>
      </div>
    </div>
  );
}
