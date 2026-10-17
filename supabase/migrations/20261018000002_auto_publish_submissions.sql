-- WeSignal demo publication policy.
-- Apply after 20261018000001_report_media.sql. Existing rows are not updated.
-- New authenticated submissions are immediately visible in Explore, while the
-- public role remains read-only and client-side status mutation stays denied.

-- A changed default affects future rows only; it does not publish existing data.
alter table public.reports
  alter column is_public set default true;

-- Defense in depth: direct authenticated inserts, as well as the app RPC, can
-- create only the caller's own published report in its initial open state.
drop policy if exists "Authenticated users can create reports" on public.reports;
drop policy if exists "Authenticated users can create private reports" on public.reports;
drop policy if exists "Authenticated users can create published submitted reports" on public.reports;
create policy "Authenticated users can create published submitted reports"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and is_public = true
    and status = 'submitted'::public.report_status
  );

-- Keep anonymous access read-only and ensure client roles cannot mutate or
-- delete reports. Authenticated owner insertion is constrained by the policy.
revoke insert, update, delete on public.reports from public, anon, authenticated;
grant select on public.reports to anon, authenticated;
grant insert on public.reports to authenticated;

-- The submission RPC inserts the report as public before inserting media
-- metadata. Permit only the authenticated report owner to attach metadata to
-- their own newly submitted public report, and require its Storage object/path.
drop policy if exists "Owners can attach media to their private reports" on public.report_media;
drop policy if exists "Owners can attach media to their published reports" on public.report_media;
create policy "Owners can attach media to their published reports"
  on public.report_media for insert to authenticated
  with check (
    split_part(object_path, '/', 1) = (select auth.uid())::text
    and split_part(object_path, '/', 2) = report_id::text
    and exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'wesignal-report-media'
        and o.name = report_media.object_path
    )
    and exists (
      select 1
      from public.reports r
      where r.id = report_media.report_id
        and r.reporter_id = (select auth.uid())
        and r.is_public = true
        and r.status = 'submitted'::public.report_status
    )
  );

-- The existing RPC is SECURITY INVOKER, checks auth.uid(), assigns the caller
-- as owner, and inserts report + media atomically. Change its explicit
-- is_public value and status so a successful submission is public and remains
-- reported/open until a trusted resolution workflow changes it.
create or replace function public.submit_report_with_media(
  p_report_id uuid,
  p_title text,
  p_category public.report_category,
  p_description text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_media jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item jsonb;
  v_path text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to submit a report.';
  end if;
  if p_report_id is null then
    raise exception using errcode = '22023', message = 'A report identifier is required.';
  end if;
  if p_media is null or pg_catalog.jsonb_typeof(p_media) <> 'array' then
    raise exception using errcode = '22023', message = 'Report media must be a JSON array.';
  end if;
  if pg_catalog.jsonb_array_length(p_media) > 3 then
    raise exception using errcode = '22023', message = 'A report may contain no more than three attachments.';
  end if;

  insert into public.reports (
    id, reporter_id, title, category, description, location_label,
    latitude, longitude, status, is_public
  ) values (
    p_report_id, v_user_id, p_title, p_category, p_description, p_location_label,
    p_latitude, p_longitude, 'submitted'::public.report_status, true
  );

  for v_item in select value from pg_catalog.jsonb_array_elements(p_media)
  loop
    v_path := v_item ->> 'object_path';
    if v_path is null
       or pg_catalog.split_part(v_path, '/', 1) <> v_user_id::text
       or pg_catalog.split_part(v_path, '/', 2) <> p_report_id::text
       or pg_catalog.array_length(pg_catalog.string_to_array(v_path, '/'), 1) <> 3 then
      raise exception using errcode = '42501', message = 'A media object path is not owned by this report submitter.';
    end if;

    insert into public.report_media (
      report_id, bucket_id, object_path, media_type, mime_type, size_bytes, sort_order
    ) values (
      p_report_id,
      v_item ->> 'bucket_id',
      v_path,
      v_item ->> 'media_type',
      v_item ->> 'mime_type',
      (v_item ->> 'size_bytes')::bigint,
      (v_item ->> 'sort_order')::smallint
    );
  end loop;

  return p_report_id;
end;
$$;

revoke all on function public.submit_report_with_media(
  uuid, text, public.report_category, text, text, double precision, double precision, jsonb
) from public, anon, authenticated;
grant execute on function public.submit_report_with_media(
  uuid, text, public.report_category, text, text, double precision, double precision, jsonb
) to authenticated;
