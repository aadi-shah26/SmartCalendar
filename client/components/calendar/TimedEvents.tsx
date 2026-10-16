'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ListChecks, Pin } from 'lucide-react';
import { getTextColor } from '../../lib/calendar/colors';
import { formatDuration, formatEventTime, minutesOfDay, timeOfDay } from '../../lib/calendar/dates';
import { blockMinutes, canDrag, dropStart } from '../../lib/calendar/drag';
import { isTaskEventId } from '../../lib/calendar/events';
import { COMPACT_EVENT_HEIGHT, HOUR_HEIGHT, TASK_PILL_HEIGHT, computeEventLayouts, minutesToTop } from '../../lib/calendar/layout';
import type { CalendarEvent } from '../../lib/calendar/types';
import { SESSION_STRIPES, sessionStatusStyle } from './styles';
import { useNowMs } from './timeGrid';

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

/** Called when a block is dropped somewhere new: `date` and the start, in minutes past midnight. */
export type MoveBlock = (ev: CalendarEvent, date: string, startMin: number) => void;

/** A block being dragged (or just dropped, until the move is saved). */
interface Drag {
  id: string;
  date: string;
  startMin: number;
  /** Horizontal shift to the day column under the pointer. */
  dx: number;
  dropped: boolean;
  /** Where the block was before the drag, to tell when the saved move has come through. */
  fromDate: string;
  fromTime: string;
}

/** Pointer movement below this many pixels is a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;
/** A dropped block is shown in its new place for at most this long while the move saves. */
const SETTLE_MS = 4000;

const columnAt = (clientX: number) =>
  [...document.querySelectorAll<HTMLElement>('[data-day-column]')].find(el => {
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX < r.right;
  });
const minutesDown = (column: HTMLElement, clientY: number) =>
  ((clientY - column.getBoundingClientRect().top) / HOUR_HEIGHT) * 60;

/**
 * Drag to move blocks between times and (in the week view) days. Day columns are found by their
 * `data-day-column` attribute (the date), so a block can be dropped onto any column on screen.
 */
function useBlockDrag(onMove: MoveBlock | undefined, events: CalendarEvent[]) {
  const [drag, setDragState] = useState<Drag | null>(null);
  // The latest drag, for the pointer-up handler (state from its render may be stale).
  const latest = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    latest.current = next;
    setDragState(next);
  };
  const pending = useRef<{ ev: CalendarEvent; x: number; y: number; grabOffsetMin: number; originLeft: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  // A dropped block holds its new place until the saved change arrives (or gives up).
  const saved = drag?.dropped ? events.find(e => e.id === drag.id) : undefined;
  const landed = !!drag?.dropped && !(saved && saved.date === drag.fromDate && saved.start_time === drag.fromTime);
  useEffect(() => {
    if (!drag?.dropped) return;
    const id = window.setTimeout(() => { latest.current = null; setDragState(null); }, SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [drag?.dropped]);

  const handlers = (ev: CalendarEvent) => ({
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      if (!onMove || e.button !== 0 || !canDrag(ev, Date.now())) return;
      const column = e.currentTarget.closest<HTMLElement>('[data-day-column]');
      if (!column) return;
      pending.current = {
        ev, x: e.clientX, y: e.clientY, moved: false,
        grabOffsetMin: minutesDown(column, e.clientY) - minutesOfDay(ev.start_time),
        originLeft: column.getBoundingClientRect().left,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      const p = pending.current;
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD_PX) return;
      p.moved = true;
      const column = columnAt(e.clientX) ?? e.currentTarget.closest<HTMLElement>('[data-day-column]');
      if (!column) return;
      setDrag({
        id: ev.id,
        date: column.dataset.dayColumn!,
        startMin: dropStart(minutesDown(column, e.clientY), p.grabOffsetMin, blockMinutes(ev)),
        dx: column.getBoundingClientRect().left - p.originLeft,
        dropped: false,
        fromDate: ev.date,
        fromTime: ev.start_time,
      });
    },
    onPointerUp() {
      const p = pending.current;
      pending.current = null;
      if (!p?.moved) return;
      suppressClick.current = true;
      const d = latest.current;
      if (!d || (d.date === ev.date && d.startMin === minutesOfDay(ev.start_time))) {
        setDrag(null);
        return;
      }
      setDrag({ ...d, dropped: true });
      onMove!(ev, d.date, d.startMin);
    },
    onPointerCancel() {
      pending.current = null;
      setDrag(null);
    },
  });

  /** True for the click that ends a drag, which shouldn't open the block. */
  const consumeDragClick = () => {
    const was = suppressClick.current;
    suppressClick.current = false;
    return was;
  };

  return { drag: landed ? null : drag, handlers, consumeDragClick };
}

/** One day's events laid out down a time-grid column, overlapping ones side by side. */
export function DayEvents({ events, size, accentColor, onOpen, onMove, timeLabel }: {
  events: CalendarEvent[]; size: Size; accentColor: string;
  onOpen: (ev: CalendarEvent) => void;
  /** Set to let blocks be dragged to a new time or day. */
  onMove?: MoveBlock;
  timeLabel: (ev: CalendarEvent) => string;
}) {
  const s = SIZES[size];
  const { drag, handlers, consumeDragClick } = useBlockDrag(onMove, events);
  const nowMs = useNowMs();
  return (
    <>
      {computeEventLayouts(events).map(({ ev, top, height, col, totalCols }) => {
        if (ev.isTaskDue) return <TaskDuePill key={ev.id} ev={ev} top={top} col={col} totalCols={totalCols} accentColor={accentColor} onOpen={onOpen} />;
        const bg = ev.color ?? accentColor;
        const fg = getTextColor(bg);
        const isSched = isTaskEventId(ev.id);
        const compact = height < COMPACT_EVENT_HEIGHT;
        const draggable = !!onMove && canDrag(ev, nowMs);
        const moving = drag?.id === ev.id ? drag : null;
        // While dragging, the block slides to where it would land and shows its new time.
        const shown = moving
          ? { ...ev, start_time: timeOfDay(moving.startMin), end_time: timeOfDay(moving.startMin + blockMinutes(ev)) }
          : ev;
        const title = ev.isTaskSession
          ? `Work session: click to check in, pin, or say you can't make it${draggable ? '. Drag to move it' : ''}`
          : isSched ? 'From a task' : draggable ? 'Drag to move' : undefined;
        return (
          <div key={ev.id} {...(draggable ? handlers(ev) : {})}
            onClick={e => { e.stopPropagation(); if (!consumeDragClick()) onOpen(ev); }}
            className={isSched ? 'sched-event-enter' : undefined}
            title={title}
            style={{ position: 'absolute', backgroundColor: bg, color: fg, borderRadius: s.radius,
              border: isSched ? `1.5px dashed ${fg}` : 'none',
              ...(ev.isTaskSession ? { ...SESSION_STRIPES, ...sessionStatusStyle(ev.sessionStatus) } : {}),
              ...columnPosition(col, totalCols, s.inset),
              ...(moving ? { left: s.inset, width: `calc(100% - ${s.inset * 2}px)`, transform: `translateX(${moving.dx}px)` } : {}),
              top: (moving ? minutesToTop(moving.startMin) : top) + 1, height: height - 2,
              overflow: 'hidden', boxSizing: 'border-box', zIndex: moving ? 20 : s.zIndex,
              boxShadow: moving && !moving.dropped ? '0 8px 20px rgba(0,0,0,0.25)' : undefined,
              opacity: moving && !moving.dropped ? 0.92 : undefined,
              padding: `${compact ? 0 : s.padY}px ${s.padX}px`, fontSize: s.fontSize, fontWeight: 600, lineHeight: s.lineHeight,
              cursor: moving && !moving.dropped ? 'grabbing' : 'pointer',
              touchAction: draggable ? 'none' : undefined, userSelect: 'none',
              transition: isSched && !moving ? 'top 0.5s cubic-bezier(0.4,0,0.2,1), height 0.5s cubic-bezier(0.4,0,0.2,1)' : undefined,
            }}>
            <EventBlockBody ev={shown} height={height} isSched={isSched} size={size} timeLabel={timeLabel(shown)} />
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
