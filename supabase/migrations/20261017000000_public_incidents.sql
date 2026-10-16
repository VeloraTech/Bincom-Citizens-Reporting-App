-- Milestone 2: publish selected incidents without exposing private reports.
-- Existing reports remain private because is_public defaults to false.
alter table public.reports add column if not exists is_public boolean not null default false;
create index if not exists reports_public_created_at_idx on public.reports (is_public, created_at desc);

-- Public browsing is read-only and limited to explicitly published rows.
drop policy if exists "Anyone can read published reports" on public.reports;
create policy "Anyone can read published reports"
  on public.reports for select to anon, authenticated
  using (is_public = true or reporter_id = (select auth.uid()));

-- Replace the Milestone 1 own-report select policy, now covered above.
drop policy if exists "Reporters can read their own reports" on public.reports;

-- Newly submitted reports are always private. Publication is an explicit server/admin action.
drop policy if exists "Authenticated users can create reports" on public.reports;
create policy "Authenticated users can create private reports"
  on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and is_public = false);

grant select on public.reports to anon;
grant select, insert on public.reports to authenticated;
-- Do not grant update/delete to the client. Publishing is intentionally outside this app.
