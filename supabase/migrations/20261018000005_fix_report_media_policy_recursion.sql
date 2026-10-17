-- Break the report_media INSERT -> storage.objects SELECT -> report_media SELECT
-- policy cycle without weakening object-existence or report-owner validation.
-- The helper runs as postgres with RLS disabled only for this narrowly-scoped
-- lookup. It returns true only for an existing object in the caller's own
-- <user>/<report>/<filename> path; it does not expose object metadata.
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

-- Supabase migrations run as postgres. Own this helper with the role that can
-- bypass RLS on storage.objects; fail closed if a later deployment role differs.
alter function public.report_media_storage_object_exists(text, text, uuid) owner to postgres;
revoke all on function public.report_media_storage_object_exists(text, text, uuid) from public, anon, authenticated;
grant execute on function public.report_media_storage_object_exists(text, text, uuid) to authenticated;

-- Keep the existing published-report ownership guard. Only replace the direct
-- storage.objects subquery, whose SELECT policy reads public.report_media and
-- re-enters this table's RLS policies during INSERT WITH CHECK evaluation.
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

-- The SELECT policy and private bucket/object policies remain unchanged. There
-- are no report_media UPDATE or DELETE policies; table grants remain SELECT/INSERT.
