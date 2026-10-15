'use client';
import { useEffect, useState, type MouseEvent, type RefObject } from 'react';
import { DAY_HEIGHT, HOUR_HEIGHT, minutesToTop } from '../../lib/calendar/layout';

const nowTop = () => {
  const n = new Date();
  return minutesToTop(n.getHours() * 60 + n.getMinutes());
};

/** Pixel position of the current time down the grid, refreshed every minute. */
export function useNowTop() {
  const [top, setTop] = useState(nowTop);
  useEffect(() => {
    const id = setInterval(() => setTop(nowTop()), 60000);
    return () => clearInterval(id);
  }, []);
  return top;
}

/**
 * Scrolls the grid so the current time is centred when today is on screen, or 6 PM otherwise.
 * Runs whenever `currentDate` is set (including "Today" on the same date).
 */
export function useScrollToNow(scrollRef: RefObject<HTMLDivElement | null>, currentDate: Date, showsToday: boolean) {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const now = new Date();
    const targetMinutes = showsToday ? now.getHours() * 60 + now.getMinutes() : 18 * 60;
    const centeredTop = minutesToTop(targetMinutes) - el.clientHeight / 2;
    const maxTop = Math.max(DAY_HEIGHT - el.clientHeight, 0);
    el.scrollTop = Math.max(0, Math.min(centeredTop, maxTop));
  }, [scrollRef, currentDate, showsToday]);
}

/** The hour (0–23) of the grid row a click landed in. */
export function hourAtClick(e: MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  const hour = Math.floor((e.clientY - rect.top) / HOUR_HEIGHT);
  return Math.max(0, Math.min(23, hour));
}
