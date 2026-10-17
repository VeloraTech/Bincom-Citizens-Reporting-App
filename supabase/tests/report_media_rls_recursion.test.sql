begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'media-owner@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'media-outsider@example.invalid', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}', pg_catalog.now(), pg_catalog.now());

-- Storage service uploads are represented by metadata rows. This isolates the
-- database RPC and RLS checks; it does not claim to upload real object bytes.
insert into storage.objects (bucket_id, name) values
  ('wesignal-report-media', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-000000000001.jpg'),
  ('wesignal-report-media', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000003/50000000-0000-4000-8000-000000000002.png'),
  ('wesignal-report-media', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000004/50000000-0000-4000-8000-000000000003.jpg'),
  ('wesignal-report-media', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000003/50000000-0000-4000-8000-000000000004.mp4'),
  ('wesignal-report-media', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000005/50000000-0000-4000-8000-000000000005.jpg'),
  ('wesignal-report-media', '30000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-000000000006.png');

-- Existing private media is retained and must remain visible only to its owner.
insert into public.reports (
  id, reporter_id, title, description, category, status, is_public
) values (
  '40000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000001',
  'Private fixture',
  'Private report fixture for RLS coverage.',
  'other', 'submitted', false
);
insert into public.report_media (
  report_id, bucket_id, object_path, media_type, mime_type, size_bytes, sort_order
) values (
  '40000000-0000-4000-8000-000000000005', 'wesignal-report-media',
  '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000005/50000000-0000-4000-8000-000000000005.jpg',
  'image', 'image/jpeg', 128, 0
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);

select extensions.is(
  public.submit_report_with_media(
    '40000000-0000-4000-8000-000000000001', 'No attachment', 'other'::public.report_category,
    'A valid report description without media.', null, null, null, '[]'::jsonb
  )::text,
  '40000000-0000-4000-8000-000000000001',
  'report submission succeeds without attachments'
);

select extensions.is(
  public.submit_report_with_media(
    '40000000-0000-4000-8000-000000000002', 'One attachment', 'other'::public.report_category,
    'A valid report description with one image.', null, null, null,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'bucket_id', 'wesignal-report-media',
      'object_path', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-000000000001.jpg',
      'media_type', 'image', 'mime_type', 'image/jpeg', 'size_bytes', 128, 'sort_order', 0
    ))
  )::text,
  '40000000-0000-4000-8000-000000000002',
  'report submission succeeds with one image'
);

select extensions.is(
  public.submit_report_with_media(
    '40000000-0000-4000-8000-000000000003', 'Multiple attachments', 'other'::public.report_category,
    'A valid report description with multiple media files.', null, null, null,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'bucket_id', 'wesignal-report-media',
        'object_path', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000003/50000000-0000-4000-8000-000000000002.png',
        'media_type', 'image', 'mime_type', 'image/png', 'size_bytes', 256, 'sort_order', 0
      ),
      pg_catalog.jsonb_build_object(
        'bucket_id', 'wesignal-report-media',
        'object_path', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000003/50000000-0000-4000-8000-000000000004.mp4',
        'media_type', 'video', 'mime_type', 'video/mp4', 'size_bytes', 1024, 'sort_order', 1
      )
    )
  )::text,
  '40000000-0000-4000-8000-000000000003',
  'report submission succeeds with multiple attachments'
);

select extensions.is(
  (select pg_catalog.count(*)::integer from public.report_media where report_id = '40000000-0000-4000-8000-000000000002'),
  1,
  'single attachment metadata is saved'
);
select extensions.is(
  (select pg_catalog.count(*)::integer from public.report_media where report_id = '40000000-0000-4000-8000-000000000003'),
  2,
  'all attachment metadata is saved in a multi-file submission'
);

select pg_catalog.set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select pg_catalog.count(*)::integer from public.report_media where report_id = '40000000-0000-4000-8000-000000000005'),
  0,
  'another user cannot read private report media metadata'
);
select extensions.is(
  (select pg_catalog.count(*)::integer from storage.objects where bucket_id = 'wesignal-report-media' and name = '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000005/50000000-0000-4000-8000-000000000005.jpg'),
  0,
  'another user cannot read the private Storage object metadata'
);
select extensions.is(pg_catalog.has_table_privilege('authenticated', 'public.report_media', 'UPDATE'), false, 'authenticated users have no report_media UPDATE privilege');
select extensions.is(pg_catalog.has_table_privilege('authenticated', 'public.report_media', 'DELETE'), false, 'authenticated users have no report_media DELETE privilege');

select extensions.throws_ok(
  $$insert into public.report_media (report_id, bucket_id, object_path, media_type, mime_type, size_bytes, sort_order)
    values ('40000000-0000-4000-8000-000000000002', 'wesignal-report-media',
      '30000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-000000000006.png',
      'image', 'image/png', 64, 1)$$,
  '42501', null,
  'another user cannot attach their object to someone else report'
);
select extensions.throws_ok(
  $$update public.report_media set size_bytes = 64 where report_id = '40000000-0000-4000-8000-000000000005'$$,
  '42501', null,
  'another user cannot update private report media metadata'
);
select extensions.throws_ok(
  $$delete from public.report_media where report_id = '40000000-0000-4000-8000-000000000005'$$,
  '42501', null,
  'another user cannot delete private report media metadata'
);
with deleted as (
  delete from storage.objects
  where bucket_id = 'wesignal-report-media'
    and name = '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000005/50000000-0000-4000-8000-000000000005.jpg'
  returning 1
)
select extensions.is(
  (select pg_catalog.count(*)::integer from deleted),
  0,
  'another user cannot delete a linked private Storage object'
);

select * from extensions.finish();
rollback;
