# Smart Calendar — web app

Next.js app for Smart Calendar. Setup instructions (Supabase, environment variables,
running locally) are in the [main README](../README.md).

```bash
cp .env.local.example .env.local   # then fill it in
npm install
npm run dev                         # http://localhost:3000
npm test
```

`/demo` is an optional page for checking your Supabase connection: it shows whether the
`.env.local` values are set and flips a boolean in a table. To use it, run this in the
Supabase SQL editor (it's not needed by the app itself):

```sql
create table if not exists public.demo_flags (id integer primary key, is_enabled boolean not null default false);
insert into public.demo_flags (id, is_enabled) values (1, false) on conflict (id) do nothing;
alter table public.demo_flags disable row level security;
```
