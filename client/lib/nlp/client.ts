import { supabase } from '../supabaseClient';
import type { ParsedItem } from './parse';

// Browser-side call to /api/parse. Sends the user's local "now" so relative dates
// ("friday", "tomorrow at 3") resolve in their timezone, not the server's.
export async function parseText(text: string): Promise<ParsedItem> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in.');
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const res = await fetch('/api/parse', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      now: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
      weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status}).`);
  return json.item as ParsedItem;
}
