'use client';
import { useState } from 'react';
import { THEME_COLOR } from '../../../lib/calendar/colors';
import {
  emptyTaskForm, eventFormAtHour, eventFormFromEvent, newEventForm, taskFormFromTask,
  type EventForm, type ItemTab, type TaskForm,
} from '../../../lib/calendar/forms';
import type { CalendarEvent, Task } from '../../../lib/calendar/types';

/**
 * State of the add/edit modal. Both forms persist while it's closed: each way of opening it
 * resets or fills only the form for its own tab.
 */
export function useItemModal(accentColor: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<ItemTab>('task');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(() => newEventForm('', '09:00', '10:00', THEME_COLOR));
  const [taskForm, setTaskForm] = useState<TaskForm>(() => emptyTaskForm(THEME_COLOR));

  const show = (nextTab: ItemTab, editing: { eventId?: string; taskId?: string } = {}) => {
    setTab(nextTab);
    setEditingEventId(editing.eventId ?? null);
    setEditingTaskId(editing.taskId ?? null);
    setError(null);
    setIsOpen(true);
  };

  return {
    isOpen, tab, editingEventId, editingTaskId, error, setError, eventForm, taskForm,
    patchEventForm: (patch: Partial<EventForm>) => setEventForm(f => ({ ...f, ...patch })),
    patchTaskForm: (patch: Partial<TaskForm>) => setTaskForm(f => ({ ...f, ...patch })),
    switchTab: (next: ItemTab) => { setTab(next); setError(null); },

    /** A blank task, or an event on `date` from 9 to 10. */
    openNew(kind: ItemTab, date: string) {
      if (kind === 'task') setTaskForm(emptyTaskForm(accentColor));
      else setEventForm(newEventForm(date, '09:00', '10:00', accentColor));
      show(kind);
    },
    /** A new event for the hour that starts at `hour` on `date`. */
    openNewEventAt(date: string, hour: number) {
      setEventForm(eventFormAtHour(date, hour, accentColor));
      show('event');
    },
    /** Edit an event; a recurring occurrence edits its whole series. */
    openEvent(ev: CalendarEvent) {
      setEventForm(eventFormFromEvent(ev));
      show('event', { eventId: ev._recurringBaseId ?? ev.id });
    },
    openTask(t: Task) {
      setTaskForm(taskFormFromTask(t));
      show('task', { taskId: t.id });
    },
    close() {
      setIsOpen(false);
      setEditingEventId(null);
      setEditingTaskId(null);
      setError(null);
    },
  };
}
