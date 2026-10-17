-- Owner-only report editing. Destructive deletion is handled by the account-actions Edge Function
-- so Storage objects can be removed before the report row is deleted.

create or replace function public.update_own_report(
  p_report_id uuid,
  p_title text,
  p_category public.report_category,
  p_description text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_report_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.reports r where r.id = p_report_id and r.reporter_id = v_user_id) then
    raise exception using errcode = '42501', message = 'You can only edit your own reports.';
  end if;
  update public.reports
  set title = p_title, category = p_category, description = p_description,
      location_label = p_location_label, latitude = p_latitude, longitude = p_longitude
  where id = p_report_id and reporter_id = v_user_id
  returning id into v_report_id;
  return v_report_id;
end;
$$;

revoke all on function public.update_own_report(uuid, text, public.report_category, text, text, double precision, double precision) from public, anon, authenticated;
grant execute on function public.update_own_report(uuid, text, public.report_category, text, text, double precision, double precision) to authenticated;

-- Allows an owner to append newly uploaded media during an edit. Existing media is never
-- replaced or removed by the client, avoiding dangling Storage references.
create or replace function public.append_own_report_media(p_report_id uuid, p_media jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item jsonb;
  v_count integer := 0;
  v_existing integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if p_media is null or pg_catalog.jsonb_typeof(p_media) <> 'array' then raise exception using errcode = '22023', message = 'Report media must be an array.'; end if;
  if not exists (select 1 from public.reports r where r.id = p_report_id and r.reporter_id = v_user_id) then raise exception using errcode = '42501', message = 'You can only edit your own reports.'; end if;
  select count(*) into v_existing from public.report_media where report_id = p_report_id;
  if v_existing + pg_catalog.jsonb_array_length(p_media) > 3 then raise exception using errcode = '22023', message = 'A report may contain no more than three attachments.'; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_media) loop
    if (v_item ->> 'bucket_id') <> 'wesignal-report-media'
       or pg_catalog.split_part(v_item ->> 'object_path', '/', 1) <> v_user_id::text
       or pg_catalog.split_part(v_item ->> 'object_path', '/', 2) <> p_report_id::text
       or pg_catalog.array_length(pg_catalog.string_to_array(v_item ->> 'object_path', '/'), 1) <> 3
       or not exists (select 1 from storage.objects o where o.bucket_id = 'wesignal-report-media' and o.name = v_item ->> 'object_path') then
      raise exception using errcode = '42501', message = 'A media object is not owned by this report or is not stored.';
    end if;
    insert into public.report_media (report_id, bucket_id, object_path, media_type, mime_type, size_bytes, sort_order)
    values (p_report_id, v_item ->> 'bucket_id', v_item ->> 'object_path', v_item ->> 'media_type', v_item ->> 'mime_type', (v_item ->> 'size_bytes')::bigint, v_existing + v_count);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.append_own_report_media(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.append_own_report_media(uuid, jsonb) to authenticated;
