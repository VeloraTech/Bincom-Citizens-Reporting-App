# Initial duplicate-incident detection

## Findings before implementation

- New reports are submitted through `public.submit_report_with_media(...)` from `www/js/supabase.js`; it atomically inserts the public report and its media metadata and returns the report UUID. The RPC is `SECURITY INVOKER`, checks `auth.uid()`, validates attachment count/path, and relies on existing RLS/grants.
- Public feed visibility is `reports.is_public = true`; reporter-owned private reports remain visible only to their owner. Public incident fields are already selected by the feed. Media remains in the private bucket with signed URLs.
- Report categories and coordinates already have database constraints. Reports without coordinates are valid. Resolution confirmations are a separate table/RPC and can transition a report to `resolved`; duplicate candidates must never be merged or change status.
- The existing RPC return type is `uuid`; PostgreSQL cannot change a function's return type with `CREATE OR REPLACE`. The app therefore needs a backwards-compatible companion submission RPC/result contract rather than an in-place return-type change.
- Current repository test commands cover JavaScript behavior; SQL regression tests use pgTAP. This environment has no `supabase`, `psql`, or `pg_prove` executable, so live SQL execution must not be claimed.

## Proposed initial behavior

Add a server-side, authenticated submission wrapper that serializes submissions with a transaction-scoped advisory lock, checks only recent **public** reports, returns candidate summaries alongside the newly created report ID, and delegates the actual report-plus-media write to the existing ownership/RLS-enforced RPC. The app will show potential matches after successful submission; reports and attachments remain separate and untouched.

Starting defaults to validate and document: exact category match, 24-hour time window, 500 m maximum distance when both reports have valid coordinates, and PostgreSQL trigram text similarity as supporting evidence. When the new report has no coordinates, matching can use same category, time, and text only; missing coordinates do not block submission. No automatic merge, publication/status change, notification, or external AI service is proposed.

## Checkpoint status

This document is the pre-implementation findings checkpoint. Next: review all relevant current migrations and policies; implement the migration, tests, and client integration in small tested increments; push each recoverable checkpoint. No database has been changed or deployed.
