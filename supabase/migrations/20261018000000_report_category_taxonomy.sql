-- Expand the report category taxonomy without deleting or rewriting report rows.
-- Existing enum values are renamed in-place so reports retain their category meaning.

do $$
declare
  mapping record;
begin
  for mapping in
    select * from (values
      ('roads', 'roads_infrastructure'),
      ('waste', 'waste_sanitation'),
      ('water', 'water_supply_leakage'),
      ('power', 'electricity_power'),
      ('safety', 'crime_public_safety')
    ) as category_map(old_value, new_value)
  loop
    if exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'report_category'
        and e.enumlabel = mapping.old_value
    ) and not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'report_category'
        and e.enumlabel = mapping.new_value
    ) then
      execute format(
        'alter type public.report_category rename value %L to %L',
        mapping.old_value,
        mapping.new_value
      );
    end if;
  end loop;
end;
$$;

alter type public.report_category add value if not exists 'flooding_drainage';
alter type public.report_category add value if not exists 'traffic_transportation';
alter type public.report_category add value if not exists 'accidents_emergencies';
alter type public.report_category add value if not exists 'civil_unrest_rioting';
alter type public.report_category add value if not exists 'environmental_hazards';
