-- Return only the public incident's aggregate confirmation state and the
-- current caller's own relationship to it. Confirmer identities remain hidden.
-- Counts are calculated from persisted rows, not the denormalized report field.
create or replace function public.get_public_report_confirmation_summary(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_reporter_id uuid;
  v_count integer;
  v_has_confirmed boolean := false;
begin
  select r.reporter_id
    into v_reporter_id
  from public.reports r
  where r.id = p_report_id
    and r.is_public = true;

  if not found then
    raise exception using errcode = '22023', message = 'This published incident could not be found.';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
  from public.report_resolution_confirmations c
  where c.report_id = p_report_id;

  if v_user_id is not null then
    select exists (
      select 1
      from public.report_resolution_confirmations c
      where c.report_id = p_report_id
        and c.confirmer_id = v_user_id
    ) into v_has_confirmed;
  end if;

  return pg_catalog.jsonb_build_object(
    'confirmation_count', v_count,
    'threshold', 3,
    'has_confirmed', v_has_confirmed,
    'is_reporter', v_user_id is not null and v_reporter_id = v_user_id
  );
end;
$$;

alter function public.get_public_report_confirmation_summary(uuid) owner to postgres;
revoke all on function public.get_public_report_confirmation_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_public_report_confirmation_summary(uuid) to anon, authenticated;
