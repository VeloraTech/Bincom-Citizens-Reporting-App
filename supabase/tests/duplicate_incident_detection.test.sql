begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(21);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('61000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'duplicate-owner@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('61000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'duplicate-outsider@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now());

insert into public.reports (
  id, reporter_id, title, description, category, status, is_public, latitude, longitude, location_label, created_at
) values
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', 'Broken water pipe on Allen Avenue', 'A large water leak from a broken pipe is flooding Allen Avenue this morning.', 'water_supply_leakage', 'submitted', true, 6.52440, 3.37920, 'Allen Avenue', pg_catalog.now() - interval '1 hour'),
  ('62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 'Broken water pipe on Allen Avenue', 'A large water leak from a broken pipe is flooding Allen Avenue this morning.', 'traffic_transportation', 'submitted', true, 6.52440, 3.37920, 'Allen Avenue', pg_catalog.now() - interval '1 hour'),
  ('62000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000002', 'Broken water pipe on Allen Avenue', 'A large water leak from a broken pipe is flooding Allen Avenue this morning.', 'water_supply_leakage', 'submitted', true, 6.70000, 3.50000, 'Far away', pg_catalog.now() - interval '1 hour'),
  ('62000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000002', 'Broken water pipe on Allen Avenue', 'A large water leak from a broken pipe is flooding Allen Avenue this morning.', 'water_supply_leakage', 'submitted', true, 6.52440, 3.37920, 'Allen Avenue', pg_catalog.now() - interval '25 hours'),
  ('62000000-0000-4000-8000-000000000005', '61000000-0000-4000-8000-000000000002', 'Private broken water pipe on Allen Avenue', 'A large private water leak from a broken pipe is flooding Allen Avenue this morning.', 'water_supply_leakage', 'submitted', false, 6.52440, 3.37920, 'Private location', pg_catalog.now() - interval '1 hour'),
  ('62000000-0000-4000-8000-000000000006', '61000000-0000-4000-8000-000000000002', 'Loose exposed electrical cable', 'A loose exposed electrical cable is sparking beside the market entrance today.', 'electricity_power', 'submitted', true, null, null, null, pg_catalog.now() - interval '1 hour'),
  ('62000000-0000-4000-8000-000000000007', '61000000-0000-4000-8000-000000000002', 'Intermittent water pressure in homes', 'Residents have experienced weak flow from household taps since last weekend despite scheduled utility service.', 'water_supply_leakage', 'submitted', true, 6.52445, 3.37918, 'Allen Avenue', pg_catalog.now() - interval '1 hour');

select extensions.is(
  pg_catalog.has_table_privilege('authenticated', 'app_private.duplicate_detection_settings', 'SELECT'),
  false,
  'API roles cannot read matching configuration values directly'
);
select extensions.is(
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'app_private.duplicate_detection_settings'::regclass limit 1),
  true,
  'matching settings have RLS enabled'
);
select extensions.is(
  (select cfg.time_window::text from app_private.duplicate_detection_settings cfg where cfg.singleton limit 1),
  '24:00:00',
  'default matching time window is 24 hours'
);
select extensions.is(
  (select cfg.max_distance_meters from app_private.duplicate_detection_settings cfg where cfg.singleton limit 1),
  500,
  'default coordinate matching distance is 500 metres'
);
select extensions.is(
  pg_catalog.has_function_privilege('anon', 'app_private.find_potential_duplicate_reports(text,text,public.report_category,double precision,double precision)', 'EXECUTE'),
  false,
  'anonymous users cannot invoke duplicate matching'
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select extensions.throws_ok(
  $$select app_private.find_potential_duplicate_reports('Broken water pipe on Allen Avenue', 'A large water leak from a broken pipe is flooding Allen Avenue this morning.', 'water_supply_leakage'::public.report_category, 6.5244, 3.3792)$$,
  '42501',
  'Authentication is required to check for similar reports.',
  'missing identity cannot query potential public matches'
);

select extensions.throws_ok(
  $$select public.submit_report_with_duplicate_check('63000000-0000-4000-8000-000000000001', 'A nearby broken water pipe', 'water_supply_leakage'::public.report_category, 'A large water leak from a broken pipe is flooding Allen Avenue this morning.', 'Allen Avenue', 6.5245, 3.3791, '[]'::jsonb)$$,
  '42501',
  'Authentication is required to submit a report.',
  'unauthenticated submit wrapper rejects before matching or inserting'
);

select pg_catalog.set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);

select extensions.is(
  pg_catalog.jsonb_array_length(app_private.find_potential_duplicate_reports(
    'Broken water pipe on Allen Avenue',
    'A large water leak from a broken pipe is flooding Allen Avenue this morning.',
    'water_supply_leakage'::public.report_category,
    6.5245, 3.3791
  )),
  1,
  'matching category, similar text, nearby coordinates, and recent time identify one candidate'
);
select extensions.is(
  pg_catalog.jsonb_array_length(app_private.find_potential_duplicate_reports(
    'No water delivery to nearby homes',
    'Residents received no scheduled tanker water delivery at the community hall since yesterday.',
    'water_supply_leakage'::public.report_category,
    6.5245, 3.3791
  )),
  0,
  'a nearby incident with a distinct description is not suggested solely because of proximity/category'
);
select extensions.is(
  app_private.find_potential_duplicate_reports(
    'Broken water pipe on Allen Avenue',
    'A large water leak from a broken pipe is flooding Allen Avenue this morning.',
    'water_supply_leakage'::public.report_category,
    6.5245, 3.3791
  )->0->>'id',
  '62000000-0000-4000-8000-000000000001',
  'candidate summary identifies the nearby public report'
);
select extensions.is(
  pg_catalog.jsonb_array_length(app_private.find_potential_duplicate_reports(
    'Broken water pipe on Allen Avenue',
    'A large water leak from a broken pipe is flooding Allen Avenue this morning.',
    'water_supply_leakage'::public.report_category,
    6.5245, 3.3791
  )),
  1,
  'far-away, incompatible-category, stale, and private lookalikes are excluded'
);
select extensions.is(
  pg_catalog.jsonb_array_length(app_private.find_potential_duplicate_reports(
    'Loose exposed electrical cable',
    'A loose exposed electrical cable is sparking beside the market entrance today.',
    'electricity_power'::public.report_category,
    null, null
  )),
  1,
  'reports without coordinates remain matchable by compatible category, time, and text'
);

select extensions.is(
  public.submit_report_with_duplicate_check(
    '63000000-0000-4000-8000-000000000001',
    'A nearby broken water pipe',
    'water_supply_leakage'::public.report_category,
    'A large water leak from a broken pipe is flooding Allen Avenue this morning.',
    'Allen Avenue', 6.5245, 3.3791, '[]'::jsonb
  )->>'report_id',
  '63000000-0000-4000-8000-000000000001',
  'new report is created through the existing report/media RPC'
);
select extensions.is(
  pg_catalog.jsonb_array_length(public.submit_report_with_duplicate_check(
    '63000000-0000-4000-8000-000000000002',
    'A nearby broken water pipe',
    'water_supply_leakage'::public.report_category,
    'A large water leak from a broken pipe is flooding Allen Avenue this morning.',
    'Allen Avenue', 6.5245, 3.3791, '[]'::jsonb
  )->'potential_duplicates'),
  2,
  'submission returns potential candidates without merging either report'
);
select extensions.is(
  (select pg_catalog.count(*)::integer from public.reports r where r.id in ('62000000-0000-4000-8000-000000000001'::uuid, '63000000-0000-4000-8000-000000000001'::uuid, '63000000-0000-4000-8000-000000000002'::uuid)),
  3,
  'original incident and both new submissions remain separate rows'
);
select extensions.is(
  (select r.status::text from public.reports r where r.id = '62000000-0000-4000-8000-000000000001'::uuid),
  'submitted',
  'duplicate detection does not alter the existing incident status'
);
select extensions.is(
  public.submit_report_with_duplicate_check(
    '63000000-0000-4000-8000-000000000003',
    'Loose exposed electrical cable',
    'electricity_power'::public.report_category,
    'A loose exposed electrical cable is sparking beside the market entrance today.',
    null, null, null, '[]'::jsonb
  )->>'report_id',
  '63000000-0000-4000-8000-000000000003',
  'submission without coordinates remains valid'
);
select extensions.is(
  (select (r.latitude is null and r.longitude is null) from public.reports r where r.id = '63000000-0000-4000-8000-000000000003'::uuid),
  true,
  'missing coordinates remain null in the saved report'
);

reset role;

select extensions.is(
  pg_catalog.pg_try_advisory_xact_lock(1449025537, 1),
  true,
  'submission acquired the transaction-scoped serialization lock'
);
select extensions.is(
  (select count(*)::integer from pg_catalog.pg_trigger t where t.tgrelid = 'public.reports'::regclass and t.tgname = 'reports_serialize_insert' and not t.tgisinternal),
  1,
  'all report-table insert paths are serialized by the database trigger'
);
select extensions.is(
  (select count(*)::integer from public.report_resolution_confirmations c),
  0,
  'duplicate handling does not create or alter resolution confirmations'
);

select * from extensions.finish();
rollback;
