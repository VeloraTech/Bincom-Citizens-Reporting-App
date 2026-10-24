begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(15);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('71000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'privacy-owner@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('71000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'privacy-outsider@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now());

select extensions.ok((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.report_private_locations'::regclass), 'precise location table has RLS enabled');
select extensions.ok((select c.relforcerowsecurity from pg_catalog.pg_class c where c.oid = 'public.report_private_locations'::regclass), 'precise location table forces RLS');
select extensions.is(pg_catalog.has_table_privilege('anon', 'public.report_private_locations', 'SELECT'), false, 'anonymous role has no precise-location table grant');
select extensions.is(pg_catalog.has_function_privilege('anon', 'public.list_own_reports_with_private_locations()', 'EXECUTE'), false, 'anonymous role cannot invoke owner precise-location RPC');
select extensions.is((select count(*)::integer from pg_catalog.pg_attribute where attrelid = 'public.reports'::regclass and attname in ('public_latitude', 'public_longitude', 'public_location_radius_meters', 'public_location_label') and not attisdropped), 4, 'reports has the four safe public location fields');

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}', true);

insert into public.reports (id, reporter_id, title, description, category, status, is_public, latitude, longitude, location_label)
values ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Sensitive safety report', 'A sensitive safety incident requiring a privacy-preserving location.', 'crime_public_safety', 'submitted', true, 6.524401, 3.379201, '12 Private Street');

select extensions.is((select r.latitude from public.reports r where r.id = '72000000-0000-4000-8000-000000000001'), null::double precision, 'legacy latitude is null after insert trigger');
select extensions.is((select r.longitude from public.reports r where r.id = '72000000-0000-4000-8000-000000000001'), null::double precision, 'legacy longitude is null after insert trigger');
select extensions.is((select r.location_label from public.reports r where r.id = '72000000-0000-4000-8000-000000000001'), null::text, 'legacy location label is null after insert trigger');
select extensions.is((select r.public_location_label from public.reports r where r.id = '72000000-0000-4000-8000-000000000001'), 'Approximate sensitive area', 'sensitive public label is generic');
select extensions.is((select r.public_location_radius_meters from public.reports r where r.id = '72000000-0000-4000-8000-000000000001'), 800, 'sensitive public radius is 800 m');
select extensions.is((select r.public_latitude <> 6.524401 from public.reports r where r.id = '72000000-0000-4000-8000-000000000001'), true, 'public latitude is a grid approximation, not the submitted point');
select extensions.is((select l.latitude from public.report_private_locations l where l.report_id = '72000000-0000-4000-8000-000000000001'), 6.524401::double precision, 'owner precise latitude is retained privately');
select extensions.is((select l.location_label from public.report_private_locations l where l.report_id = '72000000-0000-4000-8000-000000000001'), '12 Private Street', 'owner precise label is retained privately');
select extensions.is((select count(*)::integer from public.list_own_reports_with_private_locations() where id = '72000000-0000-4000-8000-000000000001' and latitude = 6.524401), 1, 'owner RPC returns the caller precise location');

select pg_catalog.set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.report_private_locations where report_id = '72000000-0000-4000-8000-000000000001'), 0, 'another authenticated user cannot read precise location');

reset role;
select * from extensions.finish();
rollback;
