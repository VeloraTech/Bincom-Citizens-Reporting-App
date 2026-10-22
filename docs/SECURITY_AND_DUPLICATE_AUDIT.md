# WeSignal security and duplicate-detection audit

**Audit date:** 2026-10-22  
**Repository:** `VeloraTech/Bincom-Citizens-Reporting-App`  
**Branch:** `main`  
**Audited commit:** `9004373` (`origin/main` is identical)  

## Executive status

The previous session's duplicate-incident work is present in `main`, including the additive migration, pgTAP tests, client RPC adapter, user feedback, documentation, and a recorded production rollout. It must be preserved and extended rather than replaced.

The location-privacy issue is **not fixed**. Exact `latitude` and `longitude` are currently selected from the public `reports` table, rendered in public feed/detail map controls, returned by the authenticated My Reports query, and included in public Realtime INSERT payloads. Rounding in the UI is not a sufficient boundary because the database/API and Realtime payload still expose the source values.

## 1. Implemented and verified in code

### Duplicate incident detection

- `supabase/migrations/20261021000000_duplicate_incident_detection.sql` creates configurable settings in the private `app_private` schema, a `pg_trgm`-based server-side matcher, the authenticated `submit_report_with_duplicate_check` wrapper, and an advisory-lock insert trigger.
- Defaults are exact category, a 24-hour window, 500 metres when both reports have coordinates, and title/description trigram thresholds of 0.35/0.25.
- The matcher considers only already-public reports and returns limited public summaries; it does not return reporter identity or attachments.
- The wrapper preserves every report and attachment, returns suggestions without merging or rejecting submissions, and delegates the actual write to the existing authenticated atomic submission RPC.
- A transaction-scoped advisory lock and the `reports_serialize_insert` trigger cover the supported wrapper and direct report-table insert paths against check/write races. A true two-session blocking test remains a staging follow-up.
- `supabase/tests/duplicate_incident_detection.test.sql` covers authorization, category/time/distance/text behavior, missing coordinates, private lookalikes, separate rows, status/confirmation noninterference, and serialization guard presence.
- `www/js/supabase.js`, `www/js/app.js`, and `tools/test-duplicate-detection.js` use the new RPC and present candidates as non-blocking suggestions.

### Existing privacy/security controls

- Reports and media have RLS enabled and forced; private media is stored in the `wesignal-report-media` bucket.
- Media access uses Storage and `report_media` policies plus short-lived signed URLs; no service-role key is shipped in the app.
- Owner edit and account actions use restricted RPC/Edge Function paths. Resolution confirmations remain separate from duplicate handling.
- Location collection is explicit in the report form and supports missing coordinates.

## 2. Partial, inconsistent, or risky behavior

- The schema stores precise coordinates directly on `public.reports`, and the public-read RLS policy permits selecting all columns for rows where `is_public = true`.
- `www/js/supabase.js` explicitly selects `latitude,longitude` in `listPublicReports()` and `getPublicReport()`. It also selects them in `listReports()` for the reporter's private dashboard.
- `subscribeToPublicIncidentInserts()` subscribes to `public.reports` INSERT events. The Realtime row payload can include the precise coordinate columns even if the UI does not display them.
- `www/js/app.js` builds public map-pin links from the public response coordinates. `www/js/incident-detail-view.js` displays a coordinate label when a point is supplied. `www/js/map.js` opens an exact marker and shows five-decimal coordinates.
- The current public location model says a newly submitted public report can expose optional GPS coordinates. This is inconsistent with the requested safety model and creates a meaningful risk for home/workplace/sensitive reports.
- Location labels can also be sensitive. They are currently public by design; the privacy fix must avoid implying that a label or approximate area is exact, and should preserve the reporter's ability to omit location.

## 3. Missing work

1. Add a forward-only, additive database boundary that keeps precise coordinates available to the reporter/authorized workflows while exposing only a safe public representation.
2. Define configurable, documented approximation/radius behavior and incident-sensitivity handling without returning exact coordinates through PostgREST or Realtime.
3. Update public feed/detail data access and map rendering to use only the safe representation and an honest uncertainty radius/area.
4. Preserve exact-coordinate access only for appropriately authorized owner/management paths, with tests proving public denial and owner access.
5. Add regression tests for public table queries, public detail responses, My Reports, Realtime configuration/payload shape where testable, and missing/inaccurate locations.
6. Run the local client checks and Supabase SQL/pgTAP checks available in the environment. Live Supabase deployment cannot be claimed without a linked project and credentials.

## 4. Exact planned next steps

1. Commit and push this audit as a recoverable checkpoint.
2. Implement the smallest safe additive location-privacy migration after reviewing all existing policies and RPCs; do not reset or rewrite existing reports.
3. Update client data access, detail/feed UI, and map behavior so public paths never receive exact coordinates and show an approximate area/radius instead.
4. Add and run privacy-focused SQL/client tests; commit and push this checkpoint.
5. Re-run the existing duplicate suite and client checks, document migration/deployment requirements and remaining staging concurrency verification, then push final documentation/fixes.

## 5. Deployment caveat

The repository documents that the duplicate migration was applied to the original WeSignal production project by GitHub Actions run `39557459900`. That is historical project documentation, not independent verification of any other Supabase project. The new privacy migration must be reconciled against the target project's migration ledger and live schema before application. No live migration is being claimed from this sandbox audit.
