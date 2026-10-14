'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { disconnectGoogle, getGoogleStatus, startGoogleConnect, syncGoogle } from '../../../lib/google/client';
import type { StatusMessage } from '../../../lib/calendar/types';

// Shown after returning from Google's consent screen (?google=<result>).
const CONNECT_RESULTS: Record<string, [string, boolean?]> = {
  connected: ['Google Calendar connected and imported.'],
  connected_sync_failed: ['Connected, but the first import failed. Try "Sync Google Calendar".', true],
  denied: ['Google Calendar access was not granted.', true],
  no_refresh_token: ['Google did not grant offline access. Remove this app at myaccount.google.com/permissions and try again.', true],
  invalid: ['That Google sign-in link was invalid or expired. Please try again.', true],
  error: ['Could not connect Google Calendar. Please try again.', true],
};

/** Google Calendar connection state, sync and disconnect, plus mirroring of local edits. */
export function useGoogleCalendar(reloadEvents: () => Promise<void>) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const showMessage = (text: string, error = false) => {
    setMessage({ text, error });
    window.setTimeout(() => setMessage(null), 6000);
  };

  const sync = async (quiet = false) => {
    setBusy(true);
    try {
      const r = await syncGoogle();
      await reloadEvents();
      if (!quiet) {
        showMessage(
          r.truncated
            ? `Synced part of your calendar (${r.imported} events). Sync again to continue.`
            : `Google Calendar synced (${r.imported} updated, ${r.deleted} removed).`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sync failed.';
      if (/reconnect/i.test(message)) setConnected(false);
      showMessage(message, true);
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      await startGoogleConnect(); // navigates away to Google
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Could not start Google connection.', true);
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectGoogle();
      setConnected(false);
      await reloadEvents();
      showMessage('Google Calendar disconnected. Your events were kept.');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Could not disconnect.', true);
    } finally {
      setBusy(false);
    }
  };

  // Local edits are saved first, then mirrored to Google in the background. A failed mirror
  // never blocks or rolls back the local change; the next sync reconciles.
  const mirror = (work: Promise<unknown>) => {
    if (!connected) return;
    work.then(() => reloadEvents()).catch(err => showMessage(`Saved here, but Google update failed: ${err.message}`, true));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google');
    const wantsConnect = params.get('connectGoogle') === '1';
    if (result || wantsConnect) window.history.replaceState(null, '', '/calendar');
    if (result && CONNECT_RESULTS[result]) showMessage(CONNECT_RESULTS[result][0], !!CONNECT_RESULTS[result][1]);

    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const status = await getGoogleStatus();
        if (cancelled) return;
        setConnected(status.connected);
        if (status.connected && result !== 'connected') sync(true);
        else if (!status.connected && wantsConnect) connect();
      } catch {
        /* Google sync is optional; the calendar works without it. */
      }
    })();
    return () => { cancelled = true; };
    // Runs once on load; sync/connect only need the setters, which never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up changes made in Google while the tab stays open. (Push notifications need a
  // public HTTPS URL, so polling is what works both locally and when hosted.)
  useEffect(() => {
    if (!connected) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') sync(true);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  return { connected, busy, message, sync, connect, disconnect, mirror };
}
