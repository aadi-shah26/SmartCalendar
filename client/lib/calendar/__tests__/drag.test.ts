import { describe, it, expect } from 'vitest';
import { blockMinutes, canDrag, dropStart, localMs } from '../drag';
import type { CalendarEvent } from '../types';

const ev = (patch: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1', title: 'Gym', date: '2026-10-14', start_time: '09:00:00', end_time: '10:30:00', description: '', ...patch,
});
const NOW = localMs('2026-10-14', 8 * 60);

describe('canDrag', () => {
  it('lets one-off events move', () => {
    expect(canDrag(ev(), NOW)).toBe(true);
    expect(canDrag(ev({ recurrence: { type: 'none' } }), NOW)).toBe(true);
  });
  it('keeps recurring events, deadline pills and fixed-time tasks in place', () => {
    expect(canDrag(ev({ recurrence: { type: 'weekly', days: [1] } }), NOW)).toBe(false);
    expect(canDrag(ev({ id: 'e1_2026-10-14', _recurringBaseId: 'e1' }), NOW)).toBe(false);
    expect(canDrag(ev({ id: 'sched-t1', isTaskDue: true }), NOW)).toBe(false);
    expect(canDrag(ev({ id: 'sched-t1' }), NOW)).toBe(false);
  });
  it('only moves work sessions that are still to come', () => {
    const session = ev({ id: 'sched-t1~s0', isTaskSession: true, sessionIndex: 0 });
    expect(canDrag({ ...session, sessionStatus: 'planned' }, NOW)).toBe(true);
    expect(canDrag(session, NOW)).toBe(true);
    expect(canDrag({ ...session, sessionStatus: 'planned' }, localMs('2026-10-14', 9 * 60 + 5))).toBe(false);
    expect(canDrag({ ...session, sessionStatus: 'done' }, NOW)).toBe(false);
    expect(canDrag({ ...session, sessionStatus: 'skipped' }, NOW)).toBe(false);
  });
});

describe('dropStart', () => {
  it('snaps to 15 minutes, keeping where the block was grabbed', () => {
    expect(dropStart(9 * 60 + 37, 20, 60)).toBe(9 * 60 + 15);
    expect(dropStart(9 * 60 + 52, 0, 60)).toBe(9 * 60 + 45);
  });
  it('stays within the day', () => {
    expect(dropStart(-30, 0, 60)).toBe(0);
    expect(dropStart(23 * 60 + 50, 0, 60)).toBe(22 * 60 + 45);
    expect(dropStart(23 * 60 + 50, 0, 59)).toBe(23 * 60);
  });
});

describe('helpers', () => {
  it('measures a block', () => {
    expect(blockMinutes(ev())).toBe(90);
  });
  it('reads a local date and time', () => {
    expect(new Date(localMs('2026-10-14', 9 * 60 + 30)).toString()).toBe(new Date(2026, 9, 14, 9, 30).toString());
  });
});
