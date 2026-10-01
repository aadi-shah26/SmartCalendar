-- Smart Calendar Supabase schema
-- Run this in the Supabase SQL Editor for your project.
-- This is the source of truth for the database shape; it is not applied
-- automatically (Supabase is a hosted service, so there's no local .sql
-- file the app reads from at runtime) but should be kept in sync with
-- whatever you actually run against your project.

-- One-time cleanup if you're migrating from the earlier no-auth setup:
-- drop policy if exists "allow all on events" on events;
-- drop policy if exists "allow all on users" on users;
-- drop table if exists users;
-- delete from events; -- old rows have no user_id and would violate the new not-null constraint

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text,
  work_time text,
  work_style text,
  theme_color text,
  gcal_email text,
  created_at timestamptz default now()
);

create table if not exists events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  date date not null,
  start_time text,
  end_time text,
  description text,
  color text,
  recurrence jsonb,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  description text,
  duration_minutes integer default 0,
  priority text default 'Medium',
  energy_level text default 'Medium',
  deadline timestamptz,
  is_fixed_time boolean default false,
  fixed_start timestamptz,
  fixed_end timestamptz,
  is_splittable boolean default false,
  chunk_min integer,
  chunk_max integer,
  color text,
  is_completed boolean default false,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table events enable row level security;
alter table tasks enable row level security;

drop policy if exists "profiles are owned by user" on profiles;
create policy "profiles are owned by user" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "events are owned by user" on events;
create policy "events are owned by user" on events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tasks are owned by user" on tasks;
create policy "tasks are owned by user" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Google Calendar sync (events only)
-- ---------------------------------------------------------------------------

-- Link columns so an event imported from / pushed to Google maps to exactly one row.
alter table events add column if not exists google_event_id text;
alter table events add column if not exists google_etag text;
alter table events add column if not exists source text not null default 'local';

-- Full (non-partial) unique index: PostgREST upserts need a plain unique constraint target.
-- Postgres treats NULLs as distinct, so any number of local-only events (NULL) are fine.
create unique index if not exists events_user_google_event_uniq
  on events (user_id, google_event_id);

-- One Google connection per user. Holds the (encrypted) refresh token, so RLS is enabled
-- with NO policies: browser clients using the anon key can never read it. Only the
-- server, using the service-role key, touches this table.
create table if not exists google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token_enc text not null,
  calendar_id text not null default 'primary',
  timezone text not null default 'UTC',
  sync_token text,
  last_synced_at timestamptz,
  created_at timestamptz default now()
);

alter table google_connections enable row level security;


-- ---------------------------------------------------------------------------
-- Smart scheduling: planned work sessions for a task, as [{ "start": iso, "end": iso }, ...]
-- ---------------------------------------------------------------------------
alter table tasks add column if not exists sessions jsonb not null default '[]'::jsonb;
