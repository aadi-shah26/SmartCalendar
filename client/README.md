This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Supabase Demo Route

This project includes a standalone demo page at [http://localhost:3000/demo](http://localhost:3000/demo) that shows:

- whether your `.env` values are configured correctly
- one simple anonymous database write that flips a boolean value

### 1) Environment variables

Copy `.env.local.example` to `.env.local` and add your Supabase values:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Restart your dev server after updating `.env.local`.

### 2) SQL setup for the toggle demo

Run this SQL in your Supabase SQL editor:

```sql
create table if not exists public.demo_flags (
	id integer primary key,
	is_enabled boolean not null default false
);

insert into public.demo_flags (id, is_enabled)
values (1, false)
on conflict (id) do nothing;
```

For this demo (no login + no RLS), keep RLS disabled on `public.demo_flags`.
In SQL, you can verify:

```sql
alter table public.demo_flags disable row level security;
```

Then open `/demo` and press **Flip value** to confirm read/write works.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
