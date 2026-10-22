-- Protect precise report locations from public PostgREST and Realtime responses.
-- Precise values are retained in a forced-RLS owner-scoped table. The legacy
-- report columns are scrubbed after backfill and remain null through the trigger.
-- Public rows receive a category-aware grid center plus an honest uncertainty radius.

create schema if not exists app_private;

create table if not exists public.report_private_locations (
  report_id uuid primary key references public.reports(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_label text check (location_label is null or char_length(location_label) <= 240),
  constraint report_private_locations_coordinate_pair check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null)),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.report_private_locations enable row level security;
alter table public.report_private_locations force row level security;
revoke all on public.report_private_locations from public, anon, authenticated;
grant select on public.report_private_locations to authenticated;
drop policy if exists "Reporters can read their precise locations" on public.report_private_locations;
create policy "Reporters can read their precise locations"
  on public.report_private_locations for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Preserve existing precise values before removing them from the publicly
-- readable reports row. Rows with incomplete coordinates remain locationless.
insert into public.report_private_locations (report_id, reporter_id, latitude, longitude, location_label)
select r.id, r.reporter_id, r.latitude, r.longitude, r.location_label
from public.reports r
where (r.latitude is not null and r.longitude is not null)
   or r.location_label is not null
on conflict (report_id) do update set
  reporter_id = excluded.reporter_id,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  location_label = excluded.location_label,
  updated_at = pg_catalog.now();

alter table public.reports
  add column if not exists public_latitude double precision,
  add column if not exists public_longitude double precision,
  add column if not exists public_location_radius_meters integer,
  add column if not exists public_location_label text;

alter table public.reports
  drop constraint if exists reports_public_location_pair_check;
alter table public.reports
  add constraint reports_public_location_pair_check check (
    (public_latitude is null and public_longitude is null and public_location_radius_meters is null)
    or (public_latitude between -90 and 90
      and public_longitude between -180 and 180
      and public_location_radius_meters between 100 and 10000)
  );

create or replace function app_private.public_location_payload(
  p_latitude double precision,
  p_longitude double precision,
  p_category public.report_category
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_grid double precision;
  v_radius integer;
  v_half double precision;
  v_latitude double precision;
  v_longitude double precision;
begin
  if p_latitude is null or p_longitude is null then
    return '{}'::jsonb;
  end if;

  -- Sensitive incident classes use a roughly 2.5 km grid/radius; other
  -- incidents use a roughly 1.1 km grid/radius. The center is never the
  -- submitted point, and the radius describes the maximum display precision.
  if p_category::text = any (array[
    'accidents_emergencies', 'crime_public_safety', 'civil_unrest_rioting'
  ]) then
    v_grid := 40.0;
    v_radius := 2000;
  else
    v_grid := 100.0;
    v_radius := 800;
  end if;
  v_half := 0.5 / v_grid;
  v_latitude := greatest(-90.0 + v_half, least(90.0 - v_half, floor(p_latitude * v_grid) / v_grid + v_half));
  v_longitude := greatest(-180.0 + v_half, least(180.0 - v_half, floor(p_longitude * v_grid) / v_grid + v_half));

  return pg_catalog.jsonb_build_object(
    'latitude', v_latitude,
    'longitude', v_longitude,
    'radius_meters', v_radius,
    'label', case when v_radius >= 2000 then 'Approximate sensitive area' else 'Approximate area' end
  );
end;
$$;

revoke all on function app_private.public_location_payload(double precision, double precision, public.report_category) from public, anon, authenticated;

-- Backfill safe public representations while the precise copy is protected.
update public.reports r
set public_latitude = (p.payload ->> 'latitude')::double precision,
    public_longitude = (p.payload ->> 'longitude')::double precision,
    public_location_radius_meters = (p.payload ->> 'radius_meters')::integer,
    public_location_label = p.payload ->> 'label'
from (
  select r2.id, app_private.public_location_payload(l.latitude, l.longitude, r2.category) as payload
  from public.reports r2
  join public.report_private_locations l on l.report_id = r2.id
) p
where r.id = p.id;

-- The old public columns and label are deliberately retained for compatibility,
-- but contain no precise or user-supplied location after this migration.
update public.reports
set latitude = null, longitude = null, location_label = null
where latitude is not null or longitude is not null or location_label is not null;

create or replace function app_private.sync_report_location(
  p_report_id uuid,
  p_reporter_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if p_latitude is null and p_longitude is null and p_location_label is null then
    delete from public.report_private_locations where report_id = p_report_id;
    return;
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180)) then
    raise exception using errcode = '22023', message = 'Location coordinates must include a valid latitude and longitude.';
  end if;
  insert into public.report_private_locations (report_id, reporter_id, latitude, longitude, location_label)
  values (p_report_id, p_reporter_id, p_latitude, p_longitude, p_location_label)
  on conflict (report_id) do update set
    reporter_id = excluded.reporter_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    location_label = excluded.location_label,
    updated_at = pg_catalog.now();
end;
$$;
alter function app_private.sync_report_location(uuid, uuid, double precision, double precision, text) owner to postgres;
revoke all on function app_private.sync_report_location(uuid, uuid, double precision, double precision, text) from public, anon, authenticated;

create or replace function app_private.capture_report_location()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_location record;
  v_payload jsonb;
begin
  if new.latitude is not null or new.longitude is not null or new.location_label is not null then
    perform app_private.sync_report_location(new.id, new.reporter_id, new.latitude, new.longitude, new.location_label);
  end if;
  select l.latitude, l.longitude, l.location_label
  into v_location
  from public.report_private_locations l
  where l.report_id = new.id;
  if found then
    v_payload := app_private.public_location_payload(v_location.latitude, v_location.longitude, new.category);
    new.public_latitude := (v_payload ->> 'latitude')::double precision;
    new.public_longitude := (v_payload ->> 'longitude')::double precision;
    new.public_location_radius_meters := (v_payload ->> 'radius_meters')::integer;
    new.public_location_label := v_payload ->> 'label';
  else
    new.public_latitude := null;
    new.public_longitude := null;
    new.public_location_radius_meters := null;
    new.public_location_label := null;
  end if;
  new.latitude := null;
  new.longitude := null;
  new.location_label := null;
  return new;
end;
$$;
alter function app_private.capture_report_location() owner to postgres;
revoke all on function app_private.capture_report_location() from public, anon, authenticated;
drop trigger if exists reports_capture_private_location on public.reports;
create trigger reports_capture_private_location
before insert or update on public.reports
for each row execute function app_private.capture_report_location();

-- Owner-only exact-location read path for My Reports/edit workflows. Public
-- table reads never use this function and never return precise coordinates.
create or replace function public.list_own_reports_with_private_locations()
returns table (
  id uuid,
  title text,
  description text,
  category public.report_category,
  status public.report_status,
  created_at timestamptz,
  location_label text,
  latitude double precision,
  longitude double precision
)
language sql
security definer
set search_path = ''
set row_security = off
as $$
  select r.id, r.title, r.description, r.category, r.status, r.created_at,
         l.location_label, l.latitude, l.longitude
  from public.reports r
  left join public.report_private_locations l on l.report_id = r.id
  where r.reporter_id = (select auth.uid())
  order by r.created_at desc;
$$;
alter function public.list_own_reports_with_private_locations() owner to postgres;
revoke all on function public.list_own_reports_with_private_locations() from public, anon, authenticated;
grant execute on function public.list_own_reports_with_private_locations() to authenticated;

-- Keep the existing owner edit RPC as the only supported precise-location
-- mutation path. The trigger then publishes only the safe representation.
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
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_report_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.reports r where r.id = p_report_id and r.reporter_id = v_user_id) then
    raise exception using errcode = '42501', message = 'You can only edit your own reports.';
  end if;
  perform app_private.sync_report_location(p_report_id, v_user_id, p_latitude, p_longitude, p_location_label);
  update public.reports
  set title = p_title, category = p_category, description = p_description,
      latitude = null, longitude = null, location_label = null
  where id = p_report_id and reporter_id = v_user_id
  returning id into v_report_id;
  return v_report_id;
end;
$$;
alter function public.update_own_report(uuid, text, public.report_category, text, text, double precision, double precision) owner to postgres;
revoke all on function public.update_own_report(uuid, text, public.report_category, text, text, double precision, double precision) from public, anon, authenticated;
grant execute on function public.update_own_report(uuid, text, public.report_category, text, text, double precision, double precision) to authenticated;

-- Duplicate matching must use the protected precise copy, not public grid data.
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
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required to check for similar reports.'; end if;
  if p_title is null or p_description is null or p_category is null then raise exception using errcode = '22023', message = 'Report title, description, and category are required.'; end if;
  select coalesce(pg_catalog.jsonb_agg(c.payload order by c.match_score desc, c.created_at desc), '[]'::jsonb)
  into v_matches
  from (
    select pg_catalog.jsonb_build_object(
      'id', r.id, 'title', r.title, 'category', r.category, 'status', r.status,
      'created_at', r.created_at, 'location_label', coalesce(r.public_location_label, 'Approximate area'),
      'distance_meters', case when d.distance_meters is null then null else pg_catalog.round(d.distance_meters)::integer end
    ) as payload,
    greatest(s.title_similarity, s.description_similarity) as match_score, r.created_at
    from public.reports r
    left join public.report_private_locations l on l.report_id = r.id
    cross join app_private.duplicate_detection_settings cfg
    cross join lateral (select extensions.similarity(pg_catalog.lower(r.title), pg_catalog.lower(pg_catalog.btrim(p_title))) as title_similarity, extensions.similarity(pg_catalog.lower(r.description), pg_catalog.lower(pg_catalog.btrim(p_description))) as description_similarity) s
    cross join lateral (select case when p_latitude between -90 and 90 and p_longitude between -180 and 180 and l.latitude between -90 and 90 and l.longitude between -180 and 180 then 6371000.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(least(1.0, pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.latitude - p_latitude) / 2.0), 2) + pg_catalog.cos(pg_catalog.radians(p_latitude)) * pg_catalog.cos(pg_catalog.radians(l.latitude)) * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.longitude - p_longitude) / 2.0), 2)))) else null end as distance_meters) d
    where cfg.singleton = true and r.is_public = true and r.category = p_category and r.created_at >= pg_catalog.now() - cfg.time_window and r.created_at <= pg_catalog.now()
      and (p_latitude is null or p_longitude is null or l.latitude is null or l.longitude is null or d.distance_meters <= cfg.max_distance_meters)
      and (s.title_similarity >= cfg.title_similarity_threshold or s.description_similarity >= cfg.description_similarity_threshold)
    order by greatest(s.title_similarity, s.description_similarity) desc, r.created_at desc limit 5
  ) c;
  return v_matches;
end;
$$;
alter function app_private.find_potential_duplicate_reports(text, text, public.report_category, double precision, double precision) owner to postgres;
revoke all on function app_private.find_potential_duplicate_reports(text, text, public.report_category, double precision, double precision) from public, anon, authenticated;
grant execute on function app_private.find_potential_duplicate_reports(text, text, public.report_category, double precision, double precision) to authenticated;
