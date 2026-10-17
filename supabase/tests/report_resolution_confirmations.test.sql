begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(8);

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

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
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
  public.confirm_report_resolution('20000000-0000-4000-8000-000000000001'::uuid)->>'already_confirmed',
  'true',
  'same user cannot increase progress twice'
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
