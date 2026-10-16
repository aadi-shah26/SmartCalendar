'use client';
import type { Dispatch, SetStateAction } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { deleteGoogleEvent, pushGoogleEvent } from '../../../lib/google/client';
import { eventFormRecurrence, type EventForm } from '../../../lib/calendar/forms';
import type { CalendarEvent } from '../../../lib/calendar/types';

/**
 * Creating, editing and deleting stored events. Each resolves to an error message, or null on
 * success; successful changes are mirrored to Google via `mirror`.
 */
export function useEventActions({ events, setEvents, mirror }: {
  events: CalendarEvent[]; setEvents: Dispatch<SetStateAction<CalendarEvent[]>>;
  mirror: (work: Promise<unknown>) => void;
}) {
  async function createEvent(form: EventForm): Promise<string | null> {
    if (!form.title.trim()) return 'Title is required.';
    if (!form.date) return 'Date is required.';
    if (!form.start || !form.end) return 'Start and end time are required.';
    // Fetch the session fresh rather than trusting the cached userId state, which can go
    // stale (e.g. session changed in another tab) and get rejected by row-level security.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'Not signed in.';
    const ev = {
      title: form.title.trim(), date: form.date, start_time: form.start, end_time: form.end,
      description: form.description, color: form.color, recurrence: eventFormRecurrence(form), user_id: session.user.id,
    };
    const { data, error } = await supabase.from('events').insert([ev]).select();
    if (error || !data) return error?.message ?? 'Failed to save event.';
    setEvents(prev => [...prev, data[0]]);
    mirror(pushGoogleEvent(data[0].id));
    return null;
  }

  async function updateEvent(id: string, form: EventForm): Promise<string | null> {
    if (!form.title.trim()) return 'Title is required.';
    const recurrence = eventFormRecurrence(form);
    // form.date is whichever occurrence's day the user clicked into, not the series' own anchor
    // date. While the event stays recurring, keep that anchor untouched — overwriting it with
    // one instance's date shifts the whole series and makes earlier occurrences stop rendering.
    const existingDate = events.find(e => e.id === id)?.date;
    const date = recurrence && existingDate ? existingDate : form.date;
    const updates = {
      title: form.title.trim(), date, start_time: form.start, end_time: form.end,
      description: form.description, color: form.color, recurrence,
    };
    const { error } = await supabase.from('events').update(updates).eq('id', id);
    if (error) return error.message ?? 'Failed to update event.';
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    mirror(pushGoogleEvent(id));
    return null;
  }

  async function deleteEvent(id: string): Promise<string | null> {
    const googleEventId = events.find(e => e.id === id)?.google_event_id;
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) return error.message ?? 'Failed to delete event.';
    setEvents(prev => prev.filter(e => e.id !== id));
    if (googleEventId) mirror(deleteGoogleEvent(googleEventId));
    return null;
  }

  return { createEvent, updateEvent, deleteEvent };
}
