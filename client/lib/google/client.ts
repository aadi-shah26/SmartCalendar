import { supabase } from '../supabaseClient';

// Browser-side calls to the /api/google/* routes. Each request carries the user's Supabase
// access token so the server can tell who is asking.

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in.');
  const res = await fetch(path, {
    method: init?.method ?? 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status}).`);
  return json as T;
}

export const getGoogleStatus = () =>
  call<{ connected: boolean; lastSyncedAt: string | null }>('/api/google/status', { method: 'GET' });

/** Sends the browser to Google's consent screen. */
export async function startGoogleConnect(): Promise<void> {
  const { url } = await call<{ url: string }>('/api/google/connect', { body: { timezone: timezone() } });
  window.location.href = url;
}

export const syncGoogle = () =>
  call<{ imported: number; deleted: number; fullResync: boolean; truncated: boolean }>('/api/google/sync', {
    body: { timezone: timezone() },
  });

export const disconnectGoogle = () => call<{ ok: true }>('/api/google/disconnect');

export const pushGoogleEvent = (eventId: string | number) =>
  call<{ googleEventId?: string; skipped?: boolean }>('/api/google/push', { body: { action: 'upsert', eventId } });

export const deleteGoogleEvent = (googleEventId: string) =>
  call<{ ok?: boolean; skipped?: boolean }>('/api/google/push', { body: { action: 'delete', googleEventId } });
