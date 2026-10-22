-- Support the owner-scoped RLS predicate on precise report locations.
create index if not exists report_private_locations_reporter_id_idx
  on public.report_private_locations (reporter_id);
