"use client";

import React from 'react';

interface Props {
  tasks: Array<Record<string, any>>;
  onEdit?: (task: Record<string, any>) => void;
}

function shortTime(iso?: string | null) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

export default function Calendar({ tasks, onEdit, daysCount = 7, startDate }: Props & { daysCount?: number; startDate?: string | Date }) {
  // build N-day window starting from startDate or today
  const days: Date[] = [];
  const base = startDate ? new Date(startDate) : new Date();
  // normalize base to start of day local
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }

  // group tasks by day string
  const buckets: Record<string, Array<Record<string, any>>> = {};
  for (const d of days) buckets[d.toDateString()] = [];

  for (const t of tasks) {
    if (t.isDeleted) continue;
    let dateKey = new Date().toDateString();
    if (t.fixedStart) {
      try {
        dateKey = new Date(t.fixedStart).toDateString();
      } catch (e) {}
    } else if (t.deadline) {
      try {
        dateKey = new Date(t.deadline).toDateString();
      } catch (e) {}
    }
    if (!buckets[dateKey]) buckets[dateKey] = [];
    buckets[dateKey].push(t);
  }

  // chunk days into rows of 7 for a calendar-like grid
  const rows: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-3">Calendar</h3>
      <div className="space-y-3 text-xs">
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-2">
            {row.map(d => (
              <div key={d.toDateString()} className="rounded-md border border-black/5 bg-white p-2">
                <div className="mb-2 font-medium text-sm">{d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div className="space-y-2">
                  {(buckets[d.toDateString()] || []).map((t: any) => (
                    <div key={t.id ?? t.createdAt} className="rounded-md border border-black/10 p-2 cursor-pointer" onClick={() => onEdit?.(t)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{t.title}</div>
                        <div className="text-xs text-black/60">{t.fixedStart ? shortTime(t.fixedStart) : ''}</div>
                      </div>
                      <div className="text-xs text-black/60 mt-1 flex items-center gap-2">
                        <span>{(t.durationMinutes ?? t.duration) || 0} min</span>
                        <span className={
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold '
                          + (t.priority === 'Low' ? 'bg-green-100 text-green-800' :
                            t.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                            t.priority === 'High' ? 'bg-orange-100 text-orange-800' :
                            'bg-red-100 text-red-800')
                        }>{t.priority}</span>
                      </div>
                      {/* small preview: truncated description */}
                      {t.description && (
                        <div className="text-xs text-black/50 mt-1 line-clamp-2">{t.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
