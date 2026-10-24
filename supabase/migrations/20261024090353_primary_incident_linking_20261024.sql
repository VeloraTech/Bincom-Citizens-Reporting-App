-- Preserve every report while allowing related community submissions to roll up
-- under one primary incident in public Explore.
alter table public.reports
  add column if not exists primary_report_id uuid references public.reports(id) on delete set null,
  add column if not exists community_report_count integer not null default 1;

alter table public.reports
  drop constraint if exists reports_community_report_count_check;
alter table public.reports
  add constraint reports_community_report_count_check check (community_report_count >= 1);

create index if not exists reports_primary_report_id_idx
  on public.reports (primary_report_id);

create table if not exists public.report_relationships (
  id uuid primary key default gen_random_uuid(),
  primary_report_id uuid not null references public.reports(id) on delete cascade,
  linked_report_id uuid not null references public.reports(id) on delete cascade,
  relationship_type text not null default 'community_report'
    check (relationship_type in ('community_report', 'additional_evidence')),
  linked_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  constraint report_relationships_distinct_reports check (primary_report_id <> linked_report_id),
  constraint report_relationships_linked_report_unique unique (linked_report_id)
);

alter table public.report_relationships enable row level security;
alter table public.report_relationships force row level security;
revoke all on public.report_relationships from public, anon, authenticated;

create index if not exists report_relationships_primary_report_id_idx
  on public.report_relationships (primary_report_id);

create or replace function public.link_own_report_to_incident(
  p_linked_report_id uuid,
  p_primary_report_id uuid,
  p_relationship_type text default 'community_report'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_primary public.reports%rowtype;
  v_linked public.reports%rowtype;
  v_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_linked_report_id is null or p_primary_report_id is null or p_linked_report_id = p_primary_report_id then
    raise exception using errcode = '22023', message = 'Choose two different reports to link.';
  end if;
  if p_relationship_type not in ('community_report', 'additional_evidence') then
    raise exception using errcode = '22023', message = 'Unsupported report relationship.';
  end if;

  select * into v_linked
  from public.reports r
  where r.id = p_linked_report_id
    and r.reporter_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'You can only link your own report.';
  end if;

  select * into v_primary
  from public.reports r
  where r.id = p_primary_report_id
    and r.is_public = true
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'The primary incident is not available.';
  end if;
  if v_linked.primary_report_id is not null then
    raise exception using errcode = '23505', message = 'This report is already linked to a primary incident.';
  end if;

  insert into public.report_relationships (primary_report_id, linked_report_id, relationship_type, linked_by)
  values (p_primary_report_id, p_linked_report_id, p_relationship_type, v_user_id);

  select count(*)::integer into v_count
  from public.report_relationships rr
  where rr.primary_report_id = p_primary_report_id;

  update public.reports
  set primary_report_id = p_primary_report_id
  where id = p_linked_report_id;

  update public.reports
  set community_report_count = greatest(1, v_count + 1)
  where id = p_primary_report_id;

  return pg_catalog.jsonb_build_object(
    'primary_report_id', p_primary_report_id,
    'linked_report_id', p_linked_report_id,
    'relationship_type', p_relationship_type,
    'community_report_count', v_count + 1
  );
end;
$$;

alter function public.link_own_report_to_incident(uuid, uuid, text) owner to postgres;
revoke all on function public.link_own_report_to_incident(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.link_own_report_to_incident(uuid, uuid, text) to authenticated;

-- Replace the owner read function so My Reports can explain linked status without
-- exposing precise locations to public clients.
drop function if exists public.list_own_reports_with_private_locations();
create function public.list_own_reports_with_private_locations()
returns table (
  id uuid,
  title text,
  description text,
  category public.report_category,
  status public.report_status,
  created_at timestamptz,
  location_label text,
  latitude double precision,
  longitude double precision,
  primary_incident_id uuid,
  primary_incident_title text,
  is_linked boolean,
  community_report_count integer
)
language sql
security definer
set search_path = ''
set row_security = off
as $$
  select r.id, r.title, r.description, r.category, r.status, r.created_at,
         l.location_label, l.latitude, l.longitude,
         coalesce(r.primary_report_id, r.id),
         coalesce(p.title, r.title),
         (r.primary_report_id is not null),
         case when r.primary_report_id is null then r.community_report_count else p.community_report_count end
  from public.reports r
  left join public.reports p on p.id = r.primary_report_id
  left join public.report_private_locations l on l.report_id = r.id
  where r.reporter_id = (select auth.uid())
  order by r.created_at desc;
$$;
alter function public.list_own_reports_with_private_locations() owner to postgres;
revoke all on function public.list_own_reports_with_private_locations() from public, anon, authenticated;
grant execute on function public.list_own_reports_with_private_locations() to authenticated;
