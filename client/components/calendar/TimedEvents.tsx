import { ListChecks, Pin } from 'lucide-react';
import { getTextColor } from '../../lib/calendar/colors';
import { formatDuration, formatEventTime } from '../../lib/calendar/dates';
import { isTaskEventId } from '../../lib/calendar/events';
import { COMPACT_EVENT_HEIGHT, TASK_PILL_HEIGHT, computeEventLayouts } from '../../lib/calendar/layout';
import type { CalendarEvent } from '../../lib/calendar/types';
import { SESSION_STRIPES, sessionStatusStyle } from './styles';

// Week view packs seven columns, so its blocks are smaller than the single-column day view's.
const SIZES = {
  sm: { inset: 2, radius: 6, padX: 6, padY: 3, fontSize: 12, lineHeight: 1.3, zIndex: 1, iconSize: 10, metaSize: 10, iconGap: 3 },
  md: { inset: 4, radius: 8, padX: 10, padY: 4, fontSize: 13, lineHeight: undefined, zIndex: undefined, iconSize: 12, metaSize: 11, iconGap: 4 },
} as const;
type Size = keyof typeof SIZES;

const columnPosition = (col: number, totalCols: number, inset: number) => ({
  left: `calc(${(col / totalCols) * 100}% + ${inset}px)`,
  width: `calc(${(1 / totalCols) * 100}% - ${inset * 2}px)`,
});

function EventBlockBody({ ev, height, isSched, timeLabel, size }: {
  ev: CalendarEvent; height: number; isSched: boolean; timeLabel: string; size: Size;
}) {
  const s = SIZES[size];
  const icon = isSched && (ev.sessionPinned
    ? <Pin aria-label="Pinned" style={{ width: s.iconSize, height: s.iconSize, flexShrink: 0 }} />
    : <ListChecks style={{ width: s.iconSize, height: s.iconSize, flexShrink: 0 }} />);
  if (height < COMPACT_EVENT_HEIGHT) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', minWidth: 0 }}>
        {/* One fixed-height wrapping row: when the time doesn't fit beside the title it
            wraps onto a hidden second line instead of being cut mid-character. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4,
          height: 16, lineHeight: '16px', overflow: 'hidden', minWidth: 0, width: '100%', whiteSpace: 'nowrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, flex: '0 1 auto', minWidth: 0, alignSelf: 'center' }}>
            {icon}
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
          </span>
          <span style={{ flex: '0 0 auto', opacity: 0.75, fontWeight: 500, fontSize: '0.85em' }}>{timeLabel}</span>
        </div>
      </div>
    );
  }
  return (
    <>
      <div style={{ fontSize: s.metaSize, opacity: 0.75, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: s.iconGap }}>
        {icon}
        {timeLabel}
      </div>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
      {ev.description && height > 54 && <div style={{ fontSize: s.metaSize, opacity: 0.7, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.description}</div>}
    </>
  );
}

function TaskDuePill({ ev, top, col, totalCols, accentColor, onOpen }: {
  ev: CalendarEvent; top: number; col: number; totalCols: number; accentColor: string;
  onOpen: (ev: CalendarEvent) => void;
}) {
  const bg = ev.color ?? accentColor;
  const fg = getTextColor(bg);
  const meta = ev.taskDurationMin ? `${formatEventTime(ev.start_time)} · ${formatDuration(ev.taskDurationMin)}` : formatEventTime(ev.start_time);
  return (
    <div onClick={e => { e.stopPropagation(); onOpen(ev); }}
      title={`${ev.title} — due ${meta}`}
      style={{ position: 'absolute', top, height: TASK_PILL_HEIGHT, zIndex: 2,
        ...columnPosition(col, totalCols, 2),
        backgroundColor: bg, color: fg, borderRadius: TASK_PILL_HEIGHT / 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px',
        fontSize: 11, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' }}>
      <ListChecks style={{ width: 11, height: 11, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{ev.title}</span>
      <span style={{ marginLeft: 'auto', paddingLeft: 4, opacity: 0.75, fontWeight: 500, fontSize: 10, flexShrink: 0 }}>{meta}</span>
    </div>
  );
}

/** One day's events laid out down a time-grid column, overlapping ones side by side. */
export function DayEvents({ events, size, accentColor, onOpen, timeLabel }: {
  events: CalendarEvent[]; size: Size; accentColor: string;
  onOpen: (ev: CalendarEvent) => void;
  timeLabel: (ev: CalendarEvent) => string;
}) {
  const s = SIZES[size];
  return (
    <>
      {computeEventLayouts(events).map(({ ev, top, height, col, totalCols }) => {
        if (ev.isTaskDue) return <TaskDuePill key={ev.id} ev={ev} top={top} col={col} totalCols={totalCols} accentColor={accentColor} onOpen={onOpen} />;
        const bg = ev.color ?? accentColor;
        const fg = getTextColor(bg);
        const isSched = isTaskEventId(ev.id);
        const compact = height < COMPACT_EVENT_HEIGHT;
        return (
          <div key={ev.id} onClick={e => { e.stopPropagation(); onOpen(ev); }}
            className={isSched ? 'sched-event-enter' : undefined}
            title={ev.isTaskSession ? 'Work session: click to check in, pin, or say you can\'t make it' : isSched ? 'From a task' : undefined}
            style={{ position: 'absolute', backgroundColor: bg, color: fg, borderRadius: s.radius,
              border: isSched ? `1.5px dashed ${fg}` : 'none',
              ...(ev.isTaskSession ? { ...SESSION_STRIPES, ...sessionStatusStyle(ev.sessionStatus) } : {}),
              ...columnPosition(col, totalCols, s.inset),
              top: top + 1, height: height - 2,
              overflow: 'hidden', boxSizing: 'border-box', zIndex: s.zIndex,
              padding: `${compact ? 0 : s.padY}px ${s.padX}px`, fontSize: s.fontSize, fontWeight: 600, cursor: 'pointer', lineHeight: s.lineHeight,
              transition: isSched ? 'top 0.5s cubic-bezier(0.4,0,0.2,1), height 0.5s cubic-bezier(0.4,0,0.2,1)' : undefined,
            }}>
            <EventBlockBody ev={ev} height={height} isSched={isSched} size={size} timeLabel={timeLabel(ev)} />
          </div>
        );
      })}
    </>
  );
}

/** Red line (and dot) at the current time. */
export function NowIndicator({ top, dotClickable }: { top: number; dotClickable?: boolean }) {
  return (
    <>
      <div style={{ position: 'absolute', top, left: -6, width: 12, height: 12, borderRadius: '50%', backgroundColor: '#e53e3e', zIndex: 3, transform: 'translateY(-50%)', pointerEvents: dotClickable ? undefined : 'none' }} />
      <div style={{ position: 'absolute', top, left: 6, right: 0, height: 2, backgroundColor: '#e53e3e', zIndex: 3, transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    </>
  );
}
