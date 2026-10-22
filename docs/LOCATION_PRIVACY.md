# WeSignal location privacy model

Migration `20261022000000_location_privacy.sql` separates precise report locations from public incident data without deleting reports.

## Data boundaries

- `public.report_private_locations` stores the precise latitude, longitude, and user-entered location label. RLS is enabled and forced; only the authenticated reporter can read their own row. Clients cannot insert, update, or delete this table directly.
- The existing `reports.latitude`, `reports.longitude`, and `reports.location_label` columns are retained for schema compatibility but are scrubbed to `NULL`. A `BEFORE INSERT OR UPDATE` trigger captures supported submission/edit values into the protected table and ensures those legacy columns remain null.
- Public rows expose only `public_latitude`, `public_longitude`, `public_location_radius_meters`, and `public_location_label`. These are a grid-cell center and an uncertainty radius, not the submitted point.
- General categories use approximately 1.1 km cells and an 800 m display radius. `accidents_emergencies`, `crime_public_safety`, and `civil_unrest_rioting` use approximately 2.5 km cells and a 2 km display radius. The public label explicitly says `Approximate area` or `Approximate sensitive area`.
- The public app selects only the safe columns and renders an uncertainty circle. It never requests or displays the precise location for public feed/detail views. Realtime report rows contain null legacy precise columns and safe public columns only.
- Authenticated owners use `list_own_reports_with_private_locations()` for My Reports and editing. The function is `SECURITY DEFINER`, checks `auth.uid()`, and returns only that caller's reports.

## Matching and editing

Duplicate matching uses the protected precise-location table server-side, so privacy approximation does not reduce matching accuracy. The existing advisory lock and duplicate suggestion behavior remain unchanged. Owner edits call the existing restricted edit RPC; it synchronizes the private location and regenerates the public approximation. Clearing a location removes the private row and all public location fields.

## Limitations

A public approximate area can still reveal a broad neighborhood, and attached media or free-text descriptions may independently contain sensitive information. Reporters should avoid putting an exact home address or other identifying details in the title, description, or attachments. The model does not make those other channels anonymous.

## Safe rollout

Before applying the migration to a target Supabase project, reconcile the migration ledger and live schema. Back up the project, rehearse on staging, inspect RLS/policies/grants/functions, and confirm that existing precise coordinates are copied into `report_private_locations` before the legacy columns are scrubbed. Do not reset the database or mark the migration applied without verifying its effects.

After deployment, verify with an anonymous client that selecting `latitude`, `longitude`, and `location_label` from public reports returns null and that the safe public fields are present. Verify that the reporter can use My Reports/edit flows, while a different authenticated user cannot read `report_private_locations` or invoke the owner location RPC for another report. Verify public feed/detail map circles and Realtime inserts with non-sensitive test data.
