-- WeSignal report media and secure upload path.
-- Apply after 20261018000000_report_category_taxonomy.sql has committed.
-- The bucket remains private; clients receive short-lived signed URLs only when
-- RLS permits reading an owner's own object or an object linked to a published report.

create table if not exists public.report_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  bucket_id text not null default 'wesignal-report-media'
    check (bucket_id = 'wesignal-report-media'),
  object_path text not null unique
    check (char_length(object_path) between 1 and 1024),
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/x-m4v'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  sort_order smallint not null default 0 check (sort_order between 0 and 2),
  created_at timestamptz not null default pg_catalog.now(),
  constraint report_media_media_type_matches_mime
    check (media_type = split_part(mime_type, '/', 1)),
  constraint report_media_path_contains_report_id
    check (
      split_part(object_path, '/', 2) = report_id::text
      and array_length(string_to_array(object_path, '/'), 1) = 3
    ),
  constraint report_media_one_order_per_report unique (report_id, sort_order)
);

create index if not exists report_media_report_order_idx
  on public.report_media (report_id, sort_order);
create index if not exists reports_public_category_created_at_idx
  on public.reports (category, created_at desc)
  where is_public = true;

alter table public.report_media enable row level security;
alter table public.report_media force row level security;

revoke all on public.report_media from anon, authenticated;
grant select on public.report_media to anon, authenticated;
grant insert on public.report_media to authenticated;

drop policy if exists "Published reports and owners can read report media" on public.report_media;
create policy "Published reports and owners can read report media"
  on public.report_media for select to anon, authenticated
  using (
    exists (
      select 1
      from public.reports r
      where r.id = report_media.report_id
        and (r.is_public = true or r.reporter_id = (select auth.uid()))
    )
  );

drop policy if exists "Owners can attach media to their private reports" on public.report_media;
create policy "Owners can attach media to their private reports"
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
        and r.is_public = false
    )
  );

-- One private bucket, one-file maximum 25 MiB. Dashboard changes are not needed;
-- this upsert safely creates/configures the named bucket without deleting objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wesignal-report-media',
  'wesignal-report-media',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/x-m4v'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Uploads use <auth-user-uuid>/<report-uuid>/<random-uuid>.<extension>.
-- The browser always uploads with upsert=false; no Storage UPDATE policy is granted.
drop policy if exists "Report owners can upload their own media" on storage.objects;
create policy "Report owners can upload their own media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wesignal-report-media'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|heic|heif|mp4|webm|mov|3gp|m4v)$'
    and array_length(string_to_array(name, '/'), 1) = 3
  );

drop policy if exists "Owners and published reports can read report media objects" on storage.objects;
create policy "Owners and published reports can read report media objects"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'wesignal-report-media'
    and (
      (
        (select auth.uid()) is not null
        and split_part(name, '/', 1) = (select auth.uid())::text
      )
      or exists (
        select 1
        from public.report_media m
        join public.reports r on r.id = m.report_id
        where m.bucket_id = storage.objects.bucket_id
          and m.object_path = storage.objects.name
          and r.is_public = true
      )
    )
  );

-- Permit compensation/cleanup of failed submissions, but never deletion of an
-- object already referenced by report_media. There is deliberately no UPDATE policy.
drop policy if exists "Owners can remove unlinked report media uploads" on storage.objects;
create policy "Owners can remove unlinked report media uploads"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'wesignal-report-media'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and not exists (
      select 1
      from public.report_media m
      where m.bucket_id = storage.objects.bucket_id
        and m.object_path = storage.objects.name
    )
  );

-- Keep existing updated_at columns accurate for trusted/backend updates.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists reports_touch_updated_at on public.reports;
create trigger reports_touch_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

-- The existing auth trigger is retained but hardened with an empty search_path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Invoker security keeps reports/report_media RLS active inside this transaction.
-- Storage objects are uploaded first. If this RPC fails, the client can remove
-- those unlinked objects through the narrowly-scoped DELETE policy above.
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
    latitude, longitude, is_public
  ) values (
    p_report_id, v_user_id, p_title, p_category, p_description, p_location_label,
    p_latitude, p_longitude, false
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
