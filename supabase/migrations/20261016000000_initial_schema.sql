-- Bincom Citizens Reporting: Milestone 1 data foundation.
-- This migration is intentionally additive and safe to run once in a new project.

create extension if not exists pgcrypto;

do $$ begin
  create type public.report_status as enum ('submitted', 'acknowledged', 'in_progress', 'resolved');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.report_category as enum ('roads', 'waste', 'water', 'power', 'safety', 'other');
exception when duplicate_object then null;
end $$;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  category public.report_category not null,
  status public.report_status not null default 'submitted',
  latitude double precision check (latitude is null or (latitude between -90 and 90)),
  longitude double precision check (longitude is null or (longitude between -180 and 180)),
  location_label text check (location_label is null or char_length(location_label) <= 240),
  photo_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);

alter table public.reports enable row level security;
alter table public.reports force row level security;

-- Public users may submit a report only when signed in. No anonymous writes.
drop policy if exists "Authenticated users can create reports" on public.reports;
create policy "Authenticated users can create reports"
  on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- A reporter can read only their own reports. Staff/admin policies belong in a later milestone.
drop policy if exists "Reporters can read their own reports" on public.reports;
create policy "Reporters can read their own reports"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Reporters cannot change status, ownership, or someone else's records from the client.
drop policy if exists "Reporters can update their own report details" on public.reports;
create policy "Reporters can update their own report details"
  on public.reports for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

revoke all on public.reports from anon;
grant select, insert, update on public.reports to authenticated;
