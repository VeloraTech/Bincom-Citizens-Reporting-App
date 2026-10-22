-- The report privacy trigger captures the precise location in a BEFORE INSERT.
-- Defer this FK so the parent report row can be created before the constraint
-- is checked at transaction end.
alter table public.report_private_locations
  drop constraint if exists report_private_locations_report_id_fkey;

alter table public.report_private_locations
  add constraint report_private_locations_report_id_fkey
  foreign key (report_id)
  references public.reports(id)
  on delete cascade
  deferrable initially deferred;
