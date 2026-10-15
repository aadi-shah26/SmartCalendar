import { getTextColor } from '../../lib/calendar/colors';
import { DAYS, MONTHS, monthCells, toDateKey } from '../../lib/calendar/dates';
import type { CalendarEvent } from '../../lib/calendar/types';

/** Twelve mini-months; days with events are shaded, and clicking a day opens it. */
export default function YearView({ currentDate, events, onPickDay, accentColor }: {
  currentDate: Date; events: CalendarEvent[];
  onPickDay: (d: Date) => void;
  accentColor: string;
}) {
  const year = currentDate.getFullYear();
  const todayKey = toDateKey(new Date());
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
      {MONTHS.map((month, mi) => (
        <div key={mi}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#1a1a1a' }}>{month}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
            {DAYS.map(d => <div key={d} style={{ fontSize: 8, color: '#bbb', textAlign: 'center', fontWeight: 600 }}>{d[0]}</div>)}
            {monthCells(year, mi).map((day, i) => {
              if (!day) return <div key={i} />;
              const key = toDateKey(new Date(year, mi, day));
              const hasEvent = events.some(e => e.date === key);
              const isToday = key === todayKey;
              return (
                <div key={i} onClick={() => onPickDay(new Date(year, mi, day))}
                  style={{
                    textAlign: 'center', fontSize: 10, cursor: 'pointer', borderRadius: 3, padding: '1px 0',
                    backgroundColor: isToday ? accentColor : hasEvent ? '#e5e5e5' : 'transparent',
                    color: isToday ? getTextColor(accentColor) : '#1a1a1a', fontWeight: isToday ? 700 : 400
                  }}>{day}</div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
