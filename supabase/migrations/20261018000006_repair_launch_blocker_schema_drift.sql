-- Forward-only repair for live projects where media/report migrations were
-- partially applied or the report_media recursion fix was not deployed.
-- Safe to run after the existing report-media and report-resolution migrations;
-- does not reset data, alter RLS on/off, or broaden client grants.

-- The published feed selects this column. The canonical resolution migration
-- adds it, but this idempotent guard repairs deployments where that effect is
-- missing while retaining existing counts.
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

-- Break report_media INSERT -> storage.objects SELECT -> report_media SELECT.
-- The helper checks only an existing object in the caller's own path and does
-- not expose Storage metadata. It remains SECURITY DEFINER solely for this
-- narrow lookup; report ownership is still checked by the table policy below.
create or replace function public.report_media_storage_object_exists(
  p_bucket_id text,
  p_object_path text,
  p_report_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select
    (select auth.uid()) is not null
    and p_bucket_id = 'wesignal-report-media'
    and p_object_path is not null
    and pg_catalog.split_part(p_object_path, '/', 1) = (select auth.uid())::text
    and pg_catalog.split_part(p_object_path, '/', 2) = p_report_id::text
    and pg_catalog.array_length(pg_catalog.string_to_array(p_object_path, '/'), 1) = 3
    and exists (
      select 1
      from storage.objects o
      where o.bucket_id = p_bucket_id
        and o.name = p_object_path
    );
$$;

alter function public.report_media_storage_object_exists(text, text, uuid) owner to postgres;
revoke all on function public.report_media_storage_object_exists(text, text, uuid) from public, anon, authenticated;
grant execute on function public.report_media_storage_object_exists(text, text, uuid) to authenticated;

drop policy if exists "Owners can attach media to their published reports" on public.report_media;
create policy "Owners can attach media to their published reports"
  on public.report_media for insert to authenticated
  with check (
    pg_catalog.split_part(object_path, '/', 1) = (select auth.uid())::text
    and pg_catalog.split_part(object_path, '/', 2) = report_id::text
    and public.report_media_storage_object_exists(bucket_id, object_path, report_id)
    and exists (
      select 1
      from public.reports r
      where r.id = report_media.report_id
        and r.reporter_id = (select auth.uid())
        and r.is_public = true
        and r.status = 'submitted'::public.report_status
    )
  );

-- Intentionally unchanged: report_media SELECT and storage.objects SELECT
-- policies still enforce public visibility/ownership and the bucket stays private.
