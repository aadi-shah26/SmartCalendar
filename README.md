# Smart Calendar

A calendar that plans your week for you. Add tasks with a deadline and an estimate
(or just type them in plain English), and Smart Calendar schedules work sessions into
your free time around your classes and events, moving them when plans change.

The app lives in [`client/`](client) (Next.js + Supabase).

## Running it locally

You need **Node.js 20+** and a free **[Supabase](https://supabase.com)** account. The app
stores accounts and data in your own Supabase project, so each person who runs it sets one up.

### 1. Create a Supabase project

1. At [supabase.com/dashboard](https://supabase.com/dashboard), create a new project.
2. Open **SQL Editor**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and run it.
   This creates the tables and the row-level security rules that keep each user's data private.
   It is safe to run again later.
3. Under **Authentication → Sign In / Providers → Email**, turn **off** "Confirm email".
   Sign-up takes you straight into the calendar, which only works if new users are signed in
   right away. (If you host the app publicly you may want confirmation back on.)

### 2. Add your keys

```bash
cd client
cp .env.local.example .env.local
```

Fill in `client/.env.local`. From **Project Settings → API** in Supabase:

| Variable | Where to find it | Needed for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Everything |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / publishable key | Everything |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (keep it secret) | Quick add, Google sync |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) (free) | Quick add |

The last two are optional. Without them the app works, but the quick-add bar shows a
"not set up" message.

### 3. Start the app

```bash
cd client
npm install
npm run dev
```

Open <http://localhost:3000> and sign up.

## Optional: Google Calendar sync

Two-way sync with your Google Calendar needs your own Google Cloud OAuth app and two more
variables. Follow [`docs/google-calendar-setup.md`](docs/google-calendar-setup.md).

## Tests

```bash
cd client
npm test
```

## Project layout

```
client/            Next.js app
  app/             Pages and API routes (/calendar, /login, /onboarding, /api/*)
  components/      UI components
  lib/scheduler/   Plans task work sessions into free time
  lib/nlp/         Turns plain-English input into events and tasks (via Gemini)
  lib/google/      Google Calendar sync
supabase/          Database schema
docs/              Setup guides
```
