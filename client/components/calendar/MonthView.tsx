import { ListChecks } from 'lucide-react';
import { getTextColor } from '../../lib/calendar/colors';
import { DAYS, formatEventTime, formatEventTimeRange, monthCells, toDateKey } from '../../lib/calendar/dates';
import { byStartTime, isTaskEventId } from '../../lib/calendar/events';
import type { CalendarEvent } from '../../lib/calendar/types';
import { SESSION_STRIPES, sessionStatusStyle } from './styles';

const MAX_CHIPS = 3;

export default function MonthView({ currentDate, events, openAdd, openDetail, accentColor }: {
  currentDate: Date; events: CalendarEvent[];
  openAdd: (date: string, hour: number) => void;
  openDetail: (ev: CalendarEvent) => void;
  accentColor: string;
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const cells = monthCells(year, month);
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
          const key = toDateKey(new Date(year, month, day));
          const dayEvents = events.filter(e => e.date === key).sort(byStartTime);
          const isToday = key === todayKey;
          return (
            <div key={i} onClick={() => openAdd(key, 9)}
              style={{ borderTop: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', padding: 6, cursor: 'pointer', minHeight: 90 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: isToday ? accentColor : 'transparent',
                color: isToday ? getTextColor(accentColor) : '#1a1a1a', fontSize: 13, fontWeight: 700, marginBottom: 4
              }}>{day}</div>
              {dayEvents.slice(0, MAX_CHIPS).map(ev => {
                const bg = ev.color ?? accentColor;
                const fg = getTextColor(bg);
                const isSched = isTaskEventId(ev.id);
                return (
                  <div key={ev.id} onClick={e => { e.stopPropagation(); openDetail(ev); }}
                    title={isSched ? 'From a task' : undefined}
                    style={{ backgroundColor: bg, color: fg, borderRadius: 4, padding: '1px 5px', fontSize: 11, fontWeight: 600, marginBottom: 2,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      border: isSched ? `1px dashed ${fg}` : 'none',
                      ...(ev.isTaskSession ? { ...SESSION_STRIPES, ...sessionStatusStyle(ev.sessionStatus) } : {}),
                    }}>
                    {isSched && <ListChecks style={{ display: 'inline-block', width: 9, height: 9, verticalAlign: -1, marginRight: 2 }} />}
                    <span style={{ opacity: 0.8, fontWeight: 500 }}>{ev.isTaskDue ? `Due ${formatEventTime(ev.start_time)}` : formatEventTimeRange(ev.start_time, ev.end_time)}</span>{' '}{ev.title}
                  </div>
                );
              })}
              {dayEvents.length > MAX_CHIPS && <div style={{ fontSize: 10, color: '#999' }}>+{dayEvents.length - MAX_CHIPS} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
