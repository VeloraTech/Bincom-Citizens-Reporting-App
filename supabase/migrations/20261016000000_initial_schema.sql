-- Bincom Citizens Reporting: Milestone 1 data foundation.
-- Private-by-default schema for authenticated citizen reporting.

create extension if not exists pgcrypto;

do $$ begin
  create type public.report_status as enum ('submitted', 'acknowledged', 'in_progress', 'resolved');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.report_category as enum ('roads', 'waste', 'water', 'power', 'safety', 'other');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(trim(display_name)) between 1 and 120),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

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

drop policy if exists "Authenticated users can create reports" on public.reports;
create policy "Authenticated users can create reports"
  on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

drop policy if exists "Reporters can read their own reports" on public.reports;
create policy "Reporters can read their own reports"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

drop policy if exists "Reporters can update their own report details" on public.reports;

revoke all on public.profiles from anon;
revoke all on public.reports from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.reports to authenticated;

-- No public publication policy exists in Milestone 1: reports remain private to their reporter.
