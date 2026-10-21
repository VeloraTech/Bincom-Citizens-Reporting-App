-- Suggest possible public-report duplicates during submission. Reports are never merged.
-- Matching runs under a transaction-scoped global insert lock so simultaneous report
-- inserts cannot pass the candidate check concurrently. The lock is intentionally
-- coarse for this initial low-volume feature; see docs/DUPLICATE_DETECTION.md.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table if not exists app_private.duplicate_detection_settings (
  singleton boolean primary key default true check (singleton),
  time_window interval not null default interval '24 hours'
    check (time_window > interval '0 seconds' and time_window <= interval '168 hours'),
  max_distance_meters integer not null default 500
    check (max_distance_meters between 0 and 50000),
  title_similarity_threshold double precision not null default 0.35
    check (title_similarity_threshold between 0 and 1),
  description_similarity_threshold double precision not null default 0.25
    check (description_similarity_threshold between 0 and 1)
);

alter table app_private.duplicate_detection_settings enable row level security;
alter table app_private.duplicate_detection_settings force row level security;
revoke all on app_private.duplicate_detection_settings from public, anon, authenticated;
insert into app_private.duplicate_detection_settings (singleton)
values (true)
on conflict (singleton) do nothing;

-- Keep the private settings table inaccessible to API roles. The narrowly scoped
-- helper returns only candidate summaries for already-published reports.
create or replace function app_private.find_potential_duplicate_reports(
  p_title text,
  p_description text,
  p_category public.report_category,
  p_latitude double precision,
  p_longitude double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_matches jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to check for similar reports.';
  end if;
  if p_title is null or p_description is null or p_category is null then
    raise exception using errcode = '22023', message = 'Report title, description, and category are required.';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(c.payload order by c.match_score desc, c.created_at desc),
    '[]'::jsonb
  )
  into v_matches
  from (
    select
      pg_catalog.jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'category', r.category,
        'status', r.status,
        'created_at', r.created_at,
        'location_label', r.location_label,
        'distance_meters', case when d.distance_meters is null then null else pg_catalog.round(d.distance_meters)::integer end
      ) as payload,
      greatest(s.title_similarity, s.description_similarity) as match_score,
      r.created_at
    from public.reports r
    cross join app_private.duplicate_detection_settings cfg
    cross join lateral (
      select
        extensions.similarity(pg_catalog.lower(r.title), pg_catalog.lower(pg_catalog.btrim(p_title))) as title_similarity,
        extensions.similarity(pg_catalog.lower(r.description), pg_catalog.lower(pg_catalog.btrim(p_description))) as description_similarity
    ) s
    cross join lateral (
      select case
        when p_latitude between -90 and 90
          and p_longitude between -180 and 180
          and r.latitude between -90 and 90
          and r.longitude between -180 and 180
        then 6371000.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(least(
          1.0,
          pg_catalog.power(pg_catalog.sin(pg_catalog.radians(r.latitude - p_latitude) / 2.0), 2)
          + pg_catalog.cos(pg_catalog.radians(p_latitude))
          * pg_catalog.cos(pg_catalog.radians(r.latitude))
          * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(r.longitude - p_longitude) / 2.0), 2)
        )))
        else null
      end as distance_meters
    ) d
    where cfg.singleton = true
      and r.is_public = true
      and r.category = p_category
      and r.created_at >= pg_catalog.now() - cfg.time_window
      and r.created_at <= pg_catalog.now()
      and (
        p_latitude is null or p_longitude is null
        or r.latitude is null or r.longitude is null
        or d.distance_meters <= cfg.max_distance_meters
      )
      and (
        s.title_similarity >= cfg.title_similarity_threshold
        or s.description_similarity >= cfg.description_similarity_threshold
      )
    order by greatest(s.title_similarity, s.description_similarity) desc, r.created_at desc
    limit 5
  ) c;

  return v_matches;
end;
$$;

alter function app_private.find_potential_duplicate_reports(text, text, public.report_category, double precision, double precision) owner to postgres;
revoke all on function app_private.find_potential_duplicate_reports(text, text, public.report_category, double precision, double precision) from public, anon, authenticated;
grant execute on function app_private.find_potential_duplicate_reports(text, text, public.report_category, double precision, double precision) to authenticated;

-- Acquire before any candidate read. The existing report/media RPC remains the
-- sole writer and continues to enforce auth.uid(), owner paths, media count, and RLS.
create or replace function public.submit_report_with_duplicate_check(
  p_report_id uuid,
  p_title text,
  p_category public.report_category,
  p_description text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_media jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_potential_duplicates jsonb;
  v_saved_report_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to submit a report.';
  end if;

  -- Transaction-level and reentrant. Serializes this check + write and direct
  -- inserts that use the report table's trigger below.
  perform pg_catalog.pg_advisory_xact_lock(1449025537, 1);

  v_potential_duplicates := app_private.find_potential_duplicate_reports(
    p_title, p_description, p_category, p_latitude, p_longitude
  );
  v_saved_report_id := public.submit_report_with_media(
    p_report_id,
    p_title,
    p_category,
    p_description,
    p_location_label,
    p_latitude,
    p_longitude,
    p_media
  );

  return pg_catalog.jsonb_build_object(
    'report_id', v_saved_report_id,
    'potential_duplicates', v_potential_duplicates
  );
end;
$$;

revoke all on function public.submit_report_with_duplicate_check(uuid, text, public.report_category, text, text, double precision, double precision, jsonb) from public, anon, authenticated;
grant execute on function public.submit_report_with_duplicate_check(uuid, text, public.report_category, text, text, double precision, double precision, jsonb) to authenticated;

-- Serialize all table insert paths, including legacy direct/RPC submission, with
-- the wrapper's lock. It remains an invoker trigger and changes no RLS policy.
create or replace function app_private.serialize_report_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(1449025537, 1);
  return new;
end;
$$;

revoke all on function app_private.serialize_report_insert() from public, anon, authenticated;
drop trigger if exists reports_serialize_insert on public.reports;
create trigger reports_serialize_insert
before insert on public.reports
for each row execute function app_private.serialize_report_insert();
