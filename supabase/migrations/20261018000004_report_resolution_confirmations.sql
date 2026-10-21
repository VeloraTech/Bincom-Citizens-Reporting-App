-- Three distinct non-reporter confirmations resolve a public report.
-- The transaction locks the report row before checking/inserting, serializing
-- concurrent confirmations for this report. Confirmation identities are kept
-- private and are intentionally not cascaded on auth-user deletion.

alter table public.reports
  add column if not exists resolution_confirmations smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.reports'::regclass
      and conname = 'reports_resolution_confirmations_range'
  ) then
    alter table public.reports
      add constraint reports_resolution_confirmations_range
      check (resolution_confirmations between 0 and 3);
  end if;
end;
$$;

create table if not exists public.report_resolution_confirmations (
  report_id uuid not null references public.reports(id) on delete cascade,
  confirmer_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint report_resolution_confirmations_pkey primary key (report_id, confirmer_id)
);

alter table public.report_resolution_confirmations enable row level security;
alter table public.report_resolution_confirmations force row level security;
revoke all on public.report_resolution_confirmations from public, anon, authenticated;

create or replace function public.confirm_report_resolution(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_report public.reports%rowtype;
  v_added integer := 0;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Sign in is required to confirm an incident.';
  end if;

  select r.* into v_report
  from public.reports r
  where r.id = p_report_id and r.is_public = true
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'This published incident could not be found.';
  end if;

  if v_report.reporter_id = v_user_id then
    raise exception using errcode = '42501', message = 'You cannot confirm your own incident.';
  end if;

  if v_report.status <> 'resolved'::public.report_status then
    insert into public.report_resolution_confirmations (report_id, confirmer_id)
    values (p_report_id, v_user_id)
    on conflict (report_id, confirmer_id) do nothing;
    get diagnostics v_added = row_count;

    select pg_catalog.count(*)::integer into v_count
    from public.report_resolution_confirmations c
    where c.report_id = p_report_id;

    update public.reports r
    set resolution_confirmations = v_count,
        status = case when v_count >= 3 then 'resolved'::public.report_status else r.status end
    where r.id = p_report_id;
  else
    v_count := v_report.resolution_confirmations;
  end if;

  return pg_catalog.jsonb_build_object(
    'confirmation_count', v_count,
    'confirmed', v_added = 1,
    'already_confirmed', v_added = 0 and v_report.status <> 'resolved'::public.report_status,
    'status', case when v_count >= 3 then 'resolved' else v_report.status::text end
  );
end;
$$;

revoke all on function public.confirm_report_resolution(uuid) from public, anon, authenticated;
grant execute on function public.confirm_report_resolution(uuid) to authenticated;
