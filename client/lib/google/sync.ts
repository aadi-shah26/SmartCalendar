import type { SupabaseClient } from '@supabase/supabase-js';
import type { calendar_v3 } from 'googleapis';
import { googleEventToRow, rowToGoogleEvent, type EventRow, type ImportedRow } from './mapping';
import { getCalendar, googleStatus, HttpError, type GoogleConnection } from './server';

const PAGE_SIZE = 250;
// Bound the work done in one request so a huge calendar can't blow a serverless time limit.
// Anything beyond the cap is picked up by the next sync (upserts are idempotent).
const MAX_PAGES = 20;
const PAST_DAYS = 30;
const FUTURE_DAYS = 365;
const CHUNK = 200;

export interface PullResult {
  imported: number;
  deleted: number;
  fullResync: boolean;
  truncated: boolean;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Google -> app. First run is a bounded full import; later runs use Google's incremental
 * sync token so only changes come back. A 410 from Google means the token expired and a
 * full re-import is required.
 */
export async function pullEvents(
  admin: SupabaseClient,
  siteUrl: string,
  conn: GoogleConnection
): Promise<PullResult> {
  const calendar = await getCalendar(admin, siteUrl, conn);
  const userId = conn.user_id;

  // Locally-created recurring events live in Google as one master event. With
  // singleEvents=true Google also returns each expanded instance, which would duplicate the
  // local recurring row, so instances of those masters are skipped.
  const { data: masters, error: mastersError } = await admin
    .from('events')
    .select('google_event_id')
    .eq('user_id', userId)
    .not('google_event_id', 'is', null)
    .not('recurrence', 'is', null);
  if (mastersError) throw new Error(`Failed to load events: ${mastersError.message}`);
  const masterIds = new Set((masters ?? []).map(r => r.google_event_id as string));

  const run = async (syncToken: string | null) => {
    const upserts = new Map<string, ImportedRow>();
    const deletions = new Set<string>();
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    let pages = 0;
    let truncated = false;

    do {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: conn.calendar_id,
        singleEvents: true,
        maxResults: PAGE_SIZE,
        pageToken,
      };
      if (syncToken) {
        params.syncToken = syncToken;
      } else {
        params.timeMin = new Date(Date.now() - PAST_DAYS * 86400000).toISOString();
        params.timeMax = new Date(Date.now() + FUTURE_DAYS * 86400000).toISOString();
      }
      const res = await calendar.events.list(params);

      for (const item of res.data.items ?? []) {
        if (item.recurringEventId && masterIds.has(item.recurringEventId)) continue;
        const mapped = googleEventToRow(item, conn.timezone);
        if (mapped.kind === 'upsert') {
          upserts.set(mapped.row.google_event_id, mapped.row);
          deletions.delete(mapped.row.google_event_id);
        } else if (mapped.kind === 'cancelled') {
          deletions.add(mapped.googleEventId);
          upserts.delete(mapped.googleEventId);
        }
      }

      pageToken = res.data.nextPageToken ?? undefined;
      nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
      pages += 1;
      if (pageToken && pages >= MAX_PAGES) {
        truncated = true;
        break;
      }
    } while (pageToken);

    return { upserts, deletions, nextSyncToken: truncated ? null : nextSyncToken, truncated };
  };

  let fullResync = !conn.sync_token;
  let result;
  try {
    result = await run(conn.sync_token);
  } catch (err) {
    if (conn.sync_token && googleStatus(err) === 410) {
      fullResync = true;
      result = await run(null);
    } else {
      throw err;
    }
  }

  for (const rows of chunk([...result.upserts.values()], CHUNK)) {
    const { error } = await admin
      .from('events')
      .upsert(rows.map(r => ({ ...r, user_id: userId })), { onConflict: 'user_id,google_event_id' });
    if (error) throw new Error(`Failed to save imported events: ${error.message}`);
  }
  for (const ids of chunk([...result.deletions], CHUNK)) {
    const { error } = await admin.from('events').delete().eq('user_id', userId).in('google_event_id', ids);
    if (error) throw new Error(`Failed to remove deleted events: ${error.message}`);
  }

  // Only advance the sync token when the whole listing was read; otherwise the next run
  // starts from the old position and re-applies (idempotently) what we skipped.
  const { error: stateError } = await admin
    .from('google_connections')
    .update({ sync_token: result.nextSyncToken, last_synced_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (stateError) throw new Error(`Failed to save sync state: ${stateError.message}`);

  return {
    imported: result.upserts.size,
    deleted: result.deletions.size,
    fullResync,
    truncated: result.truncated,
  };
}

/** App -> Google for one local event row. Creates it, or patches the linked Google event. */
export async function pushEvent(
  admin: SupabaseClient,
  siteUrl: string,
  conn: GoogleConnection,
  eventId: string | number
): Promise<{ googleEventId: string }> {
  const { data: row, error } = await admin
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', conn.user_id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load event: ${error.message}`);
  if (!row) throw new HttpError(404, 'Event not found.');

  const calendar = await getCalendar(admin, siteUrl, conn);
  const body = rowToGoogleEvent(row as EventRow, conn.timezone);

  let saved: calendar_v3.Schema$Event | undefined;
  if (row.google_event_id) {
    try {
      const res = await calendar.events.patch({
        calendarId: conn.calendar_id,
        eventId: row.google_event_id,
        requestBody: body,
      });
      saved = res.data;
    } catch (err) {
      const status = googleStatus(err);
      // Deleted on Google's side since the last sync: recreate it below.
      if (status !== 404 && status !== 410) throw err;
    }
  }
  if (!saved) {
    const res = await calendar.events.insert({ calendarId: conn.calendar_id, requestBody: body });
    saved = res.data;
  }
  if (!saved?.id) throw new Error('Google did not return an event id.');

  const { error: linkError } = await admin
    .from('events')
    .update({ google_event_id: saved.id, google_etag: saved.etag ?? null })
    .eq('id', row.id)
    .eq('user_id', conn.user_id);
  if (linkError) throw new Error(`Failed to link event: ${linkError.message}`);

  return { googleEventId: saved.id };
}

/** App -> Google for a deletion. Already-gone events are not an error. */
export async function deleteGoogleEvent(
  admin: SupabaseClient,
  siteUrl: string,
  conn: GoogleConnection,
  googleEventId: string
): Promise<void> {
  const calendar = await getCalendar(admin, siteUrl, conn);
  try {
    await calendar.events.delete({ calendarId: conn.calendar_id, eventId: googleEventId });
  } catch (err) {
    const status = googleStatus(err);
    if (status !== 404 && status !== 410) throw err;
  }
}
