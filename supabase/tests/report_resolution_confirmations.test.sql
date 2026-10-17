begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(19);

-- Private fixture users; the auth trigger will create corresponding profiles.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reporter-test@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'confirmer-1@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'confirmer-2@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'confirmer-3@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'confirmer-4@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now());

insert into public.reports (
  id, reporter_id, title, description, category, is_public
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Test incident',
  'This is a valid test incident description.',
  'other',
  true
);
insert into public.reports (
  id, reporter_id, title, description, category, is_public
) values (
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'Private test incident',
  'This is a private test incident description.',
  'other',
  false
);

select extensions.is(
  pg_catalog.has_table_privilege('anon', 'public.report_resolution_confirmations', 'SELECT'),
  false,
  'anonymous users cannot read confirmation identities'
);
select extensions.is(
  pg_catalog.has_table_privilege('authenticated', 'public.report_resolution_confirmations', 'SELECT'),
  false,
  'authenticated users cannot read confirmation identities directly'
);
select extensions.is(
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.report_resolution_confirmations'::regclass limit 1),
  true,
  'confirmation records have RLS enabled'
);
select extensions.is(
  (select c.relforcerowsecurity from pg_catalog.pg_class c where c.oid = 'public.report_resolution_confirmations'::regclass limit 1),
  true,
  'confirmation records force RLS'
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select extensions.is(
  public.get_public_report_confirmation_summary('20000000-0000-4000-8000-000000000001'::uuid)->>'confirmation_count',
  '0',
  'summary starts at zero from persisted confirmation records'
);
select extensions.is(
  public.get_public_report_confirmation_summary('20000000-0000-4000-8000-000000000001'::uuid)->>'is_reporter',
  'true',
  'summary identifies the signed-in reporter without exposing identities'
);
select extensions.throws_ok(
  $$select public.get_public_report_confirmation_summary('20000000-0000-4000-8000-000000000002'::uuid)$$,
  '22023',
  'This published incident could not be found.',
  'summary does not reveal confirmation data for a private incident'
);
select extensions.throws_ok(
  $$select public.confirm_report_resolution('20000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501',
  'You cannot confirm your own incident.',
  'original reporter cannot confirm their own incident'
);

select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select extensions.is(
  public.confirm_report_resolution('20000000-0000-4000-8000-000000000001'::uuid)->>'confirmation_count',
  '1',
  'first distinct confirmation increments progress'
);
select extensions.is(
  public.get_public_report_confirmation_summary('20000000-0000-4000-8000-000000000001'::uuid)->>'confirmation_count',
  '1',
  'summary counts the first persisted confirmation row'
);
select extensions.is(
  public.get_public_report_confirmation_summary('20000000-0000-4000-8000-000000000001'::uuid)->>'has_confirmed',
  'true',
  'summary reports whether this authenticated user already confirmed'
);
select extensions.is(
  public.confirm_report_resolution('20000000-0000-4000-8000-000000000001'::uuid)->>'already_confirmed',
  'true',
  'same user cannot increase progress twice'
);
select extensions.is(
  public.get_public_report_confirmation_summary('20000000-0000-4000-8000-000000000001'::uuid)->>'confirmation_count',
  '1',
  'duplicate request does not inflate the persisted confirmation count'
);

select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select extensions.is(
  public.confirm_report_resolution('20000000-0000-4000-8000-000000000001'::uuid)->>'confirmation_count',
  '2',
  'second distinct confirmation increments progress'
);

select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select extensions.is(
  public.confirm_report_resolution('20000000-0000-4000-8000-000000000001'::uuid)->>'status',
  'resolved',
  'third distinct confirmation resolves the incident'
);
select extensions.is(
  public.get_public_report_confirmation_summary('20000000-0000-4000-8000-000000000001'::uuid)->>'confirmation_count',
  '3',
  'summary counts exactly three persisted confirmations at threshold'
);
select extensions.is(
  (select r.resolution_confirmations::text from public.reports r where r.id = '20000000-0000-4000-8000-000000000001'::uuid),
  '3',
  'stored progress is exactly three'
);

select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select extensions.is(
  public.confirm_report_resolution('20000000-0000-4000-8000-000000000001'::uuid)->>'confirmation_count',
  '3',
  'additional user cannot increase confirmations after resolution'
);
select extensions.is(
  (select r.status::text from public.reports r where r.id = '20000000-0000-4000-8000-000000000001'::uuid),
  'resolved',
  'incident remains resolved after further confirmation attempts'
);

select * from extensions.finish();
rollback;
