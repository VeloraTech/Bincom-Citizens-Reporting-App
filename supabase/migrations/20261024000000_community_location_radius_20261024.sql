-- Narrow public location uncertainty for community reporting.
-- Ordinary incidents use roughly 550 m grid cells and a 300 m display radius;
-- sensitive incidents retain a wider 1.1 km grid and 800 m display radius.
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
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    return '{}'::jsonb;
  end if;

  if p_category::text = any (array[
    'accidents_emergencies', 'crime_public_safety', 'civil_unrest_rioting'
  ]) then
    v_grid := 100.0;
    v_radius := 800;
  else
    v_grid := 200.0;
    v_radius := 300;
  end if;

  v_half := 0.5 / v_grid;
  v_latitude := greatest(-90.0 + v_half, least(90.0 - v_half, floor(p_latitude * v_grid) / v_grid + v_half));
  v_longitude := greatest(-180.0 + v_half, least(180.0 - v_half, floor(p_longitude * v_grid) / v_grid + v_half));

  return pg_catalog.jsonb_build_object(
    'latitude', v_latitude,
    'longitude', v_longitude,
    'radius_meters', v_radius,
    'label', case when v_radius >= 800 then 'Approximate sensitive area' else 'Approximate area' end
  );
end;
$$;

-- Recompute only the safe public representation from the protected precise rows.
update public.reports r
set public_latitude = (p.payload ->> 'latitude')::double precision,
    public_longitude = (p.payload ->> 'longitude')::double precision,
    public_location_radius_meters = (p.payload ->> 'radius_meters')::integer,
    public_location_label = p.payload ->> 'label'
from (
  select r2.id,
         app_private.public_location_payload(l.latitude, l.longitude, r2.category) as payload
  from public.reports r2
  join public.report_private_locations l on l.report_id = r2.id
) p
where r.id = p.id;
