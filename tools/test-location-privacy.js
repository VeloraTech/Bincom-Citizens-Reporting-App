const assert = require('node:assert/strict');
const fs = require('node:fs');

const supabase = fs.readFileSync('www/js/supabase.js', 'utf8');
const app = fs.readFileSync('www/js/app.js', 'utf8');
const map = fs.readFileSync('www/js/map.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261022000000_location_privacy.sql', 'utf8');

assert.match(supabase, /public_location_label,public_latitude,public_longitude,public_location_radius_meters/);
assert.match(supabase, /rpc\('list_own_reports_with_private_locations'\)/);
assert.doesNotMatch(supabase, /listPublicReports\(\)[\s\S]*?select\([^)]*latitude,longitude/);
assert.doesNotMatch(supabase, /getPublicReport\(id\)[\s\S]*?select\([^)]*latitude,longitude/);
assert.match(app, /function publicCoordinates\(item\)/);
assert.match(app, /data-map-radius/);
assert.match(app, /View approximate area/);
assert.match(map, /L\.circle/);
assert.match(map, /within about/);
assert.match(migration, /create table if not exists public\.report_private_locations/);
assert.match(migration, /enable row level security/);
assert.match(migration, /force row level security/);
assert.match(migration, /new\.latitude := null/);
assert.match(migration, /new\.longitude := null/);
assert.match(migration, /grant execute on function public\.list_own_reports_with_private_locations\(\) to authenticated/);
assert.match(migration, /accidents_emergencies/);
assert.match(migration, /crime_public_safety/);
assert.match(migration, /civil_unrest_rioting/);
console.log('Location privacy adapter tests passed: public-safe fields, owner RPC, protected precise table, and radius map rendering.');
