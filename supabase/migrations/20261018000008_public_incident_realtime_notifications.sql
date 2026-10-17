-- Allow foreground WeSignal clients to receive public report INSERT events.
-- Realtime still applies the existing reports SELECT RLS policy per subscriber.
do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end;
$migration$;
