# Initial duplicate-incident detection

## Behavior

Each new report submission calls `public.submit_report_with_duplicate_check(...)`. Before saving, the server searches recent **public** reports and returns up to five possible matches with the saved report ID. A result is a suggestion only: the app still submits the new report, and neither reports nor attachments are merged, deleted, republished, or assigned a different status. Resolution confirmations are untouched.

The matching defaults are:

- **Category:** exact category match. Other categories are not considered compatible in this initial version.
- **Time:** reports created within the previous 24 hours.
- **Location:** at most 500 metres apart when both reports have valid coordinates, calculated using a spherical-distance formula. If either report has no coordinates, location is not used as a filter.
- **Text:** title trigram similarity of at least 0.35 **or** description trigram similarity of at least 0.25, using PostgreSQL `pg_trgm`.
- **Results:** highest text-similarity candidates first, maximum of five.

These intentionally broad defaults surface candidates rather than declaring that two reports are duplicates. False positives are possible, particularly when coordinates are missing or descriptions use common phrases. Users should review the suggestions and can still submit a distinct incident.

## Security and concurrency

The `app_private` schema contains the single-row threshold settings and matching helper. The settings table has forced RLS and no grants to API roles; the matcher is a narrowly scoped `SECURITY DEFINER` function owned by `postgres`, requires `auth.uid()`, filters to `is_public = true`, and returns only public report summary fields. Keep `app_private` out of PostgREST's exposed schemas.

The public wrapper is `SECURITY INVOKER` and delegates the actual report/media insert to the existing `submit_report_with_media` RPC. That existing function retains caller identity, media validation, ownership paths, and attachment limits. No RLS policy is disabled or broadened. A transaction-scoped advisory lock is acquired before matching; a report-table insert trigger uses the same lock to serialize inserts with the candidate check. Concurrent calls through the app wrapper therefore wait, then the later submission can see the earlier committed report.

Direct SQL/admin inserts do not produce duplicate suggestions; they are serialized by the trigger but bypass the wrapper's candidate response. The supported app submission path is the new wrapper. Duplicate candidate relationships are not persisted in a separate table.

## Configuration

Only a database administrator can update `app_private.duplicate_detection_settings`. For example, adjust defaults with a privileged SQL session:

```sql
update app_private.duplicate_detection_settings
set time_window = interval '48 hours',
    max_distance_meters = 750,
    title_similarity_threshold = 0.40,
    description_similarity_threshold = 0.30
where singleton = true;
```

Constraints limit the window to 1 second–7 days, distance to 0–50 km, and similarity thresholds to 0–1. Choose values with local/community context in mind and evaluate false-positive and false-negative rates before changing production settings.

## Migration and tests

For WeSignal production, migration `20261021000000_duplicate_incident_detection.sql` was applied successfully by [GitHub Actions run 39557459900](https://github.com/VeloraTech/Bincom-Citizens-Reporting-App/actions/runs/39557459900) on 2026-10-21, after reconciling the recorded migration history. The migration is additive: it installs `pg_trgm`, creates settings/helpers/trigger/RPC, and does not rewrite existing reports or data. A new target project still requires its own migration-history/schema reconciliation before applying this migration; do not reset production or blindly deploy it.

Regression tests are in `supabase/tests/duplicate_incident_detection.test.sql`. They cover near-text/spatial matches, incompatible category, excessive distance, outside-window and private lookalikes, matching with missing coordinates, submission without coordinates, separate row preservation, unauthenticated rejection, status/confirmation noninterference, and serialization guard presence. Existing media/RLS and resolution pgTAP suites remain part of the required regression set.

Run:

```bash
npm run check
supabase start
supabase test db
```

The client checks passed, and GitHub Actions run `39557459900` successfully ran local Supabase startup, `supabase db lint`, and the pgTAP suite against an isolated local database. That validates the migration and regression suite, but does not constitute a true two-session concurrency exercise. For that separate check, use two authenticated SQL sessions on a disposable local/staging database: keep Session A's transaction open after calling the wrapper, call it for similar content in Session B, verify B blocks until A commits and then returns A's report as a candidate. Never run this test against production with fixture inserts.

## Current rollout status

The duplicate-aware client and migration are included in the published `v0.1.19` release; the production database migration was deployed afterward by run `39557459900`. The release contains a debug-signed preview APK. No newer app tag is required to test duplicate suggestions. The client needs the RPC to exist in its Supabase project before submissions can use this feature.
