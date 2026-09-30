# Google Calendar sync: setup

Events sync both ways between Smart Calendar and the user's **primary** Google Calendar.
Tasks are not synced (v1). Everything below is for running locally; see "When you host" at the end.

## 1. Google Cloud (one time)

1. Go to <https://console.cloud.google.com> and create a project (e.g. "Smart Calendar").
2. **APIs & Services → Library →** search **Google Calendar API → Enable**.
3. **Google Auth Platform** (older UI: *OAuth consent screen*) **→ Get started**
   - App name: Smart Calendar; support email: yours
   - Audience: **External**
   - Contact email: yours
4. **Audience →** keep **Publishing status: Testing**. Under **Test users → Add users**, add every Google account that will connect (including your own). Only these accounts can connect while in Testing.
5. **Data Access → Add or remove scopes →** add `https://www.googleapis.com/auth/calendar.events`. Save.
6. **Clients → Create client**
   - Application type: **Web application**
   - Authorised redirect URIs: `http://localhost:3000/api/auth/callback`
   - Create, then copy the **Client ID** and **Client secret**.

Use exactly `http://localhost:3000` in the browser (not `127.0.0.1`): Google matches redirect URIs character for character.

## 2. Supabase (one time)

Open **SQL Editor** and run the **"Google Calendar sync"** section at the bottom of `supabase/schema.sql`
(safe to re-run). It adds link columns to `events` and creates the `google_connections` table.

Copy the **service_role** key from **Project Settings → API**. It bypasses row-level security, so keep it server-side only.

## 3. Environment

In `client/.env.local` (see `.env.local.example`):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_TOKEN_ENCRYPTION_KEY=<output of: openssl rand -base64 32>
```

Leave `NEXT_PUBLIC_SITE_URL` empty locally. Restart `npm run dev` after editing.

## 4. Try it

1. Sign in, open the profile menu (top right) → **Connect Google Calendar**.
2. Google shows "Google hasn't verified this app" (expected in Testing). Click **Advanced → Go to Smart Calendar (unsafe)**, then allow calendar access.
3. You return to `/calendar`; events from the next year (and the last 30 days) appear.
4. Create or edit an event in Smart Calendar: it shows up in Google Calendar.
5. Change an event in Google: it appears after the next sync (profile menu → **Sync Google Calendar**, on page load, or every 5 minutes while the tab is open).

## Behaviour to know about

- Imported recurring events arrive as individual occurrences.
- Multi-day and all-day events show as a full-day block on their first day (the events table models one day per row). Timed events that cross midnight are cut off at 23:59.
- Conflicts: the last sync wins. If the same event is edited on both sides between syncs, the Google version overwrites the local one.
- **Disconnect** revokes Google's access and keeps your events here, unlinked from Google.
- While the Google app is in **Testing**, Google expires refresh tokens after **7 days**. The app then asks you to reconnect; this is expected.

## When you host

Nothing in the code changes. Configuration only:

1. Google Cloud → Clients → add `https://YOUR-DOMAIN/api/auth/callback` as another redirect URI.
2. Set the same four env vars in your host, plus `NEXT_PUBLIC_SITE_URL=https://YOUR-DOMAIN` (and the existing Supabase URL/anon key).
3. Supabase → Authentication → URL Configuration: set Site URL to your domain; keep `http://localhost:3000/**` in the redirect allow-list.
4. To let people outside your test-user list connect, submit the app for Google verification (needs a public domain and privacy policy).
5. Optional later: Google push notifications for instant updates (needs HTTPS + a renewal job). Polling works without it.
