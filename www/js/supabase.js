/* Runtime data adapter. www/env.js is local-only and must never contain a service-role key. */
(function () {
  'use strict';
  const config = window.BINCOM_CONFIG || {};
  const hasConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  let client = null;
  if (hasConfig && window.supabase && typeof window.supabase.createClient === 'function') client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const unavailable = () => new Error(hasConfig ? 'Supabase could not be initialized. Check the public URL and anon key.' : 'Supabase is not configured. Add the public URL and anon key in www/env.js.');
  window.BincomData = {
    isConfigured: () => Boolean(client),
    configurationMessage: () => hasConfig ? 'Supabase could not be initialized. Check the public URL and anon key in www/env.js.' : 'Supabase is not configured. Add the public URL and anon key in www/env.js.',
    async getSession() { return client ? client.auth.getSession() : { data: { session: null }, error: null }; },
    async getUser() { return client ? client.auth.getUser() : { data: { user: null }, error: unavailable() }; },
    async clearLocalSession() { return client ? client.auth.signOut({ scope: 'local' }) : { error: unavailable() }; },
    onAuthStateChange(callback) { return client ? client.auth.onAuthStateChange(callback) : { data: { subscription: { unsubscribe() {} } } }; },
    async signUp(email, password) { return client ? client.auth.signUp({ email, password }) : { data: null, error: unavailable() }; },
    async signIn(email, password) { return client ? client.auth.signInWithPassword({ email, password }) : { data: null, error: unavailable() }; },
    async resetPassword(email) { return client ? client.auth.resetPasswordForEmail(email) : { data: null, error: unavailable() }; },
    async signOut() { return client ? client.auth.signOut() : { error: unavailable() }; },
    async listPublicReports() { if (!client) return { data: [], error: unavailable() }; return client.from('reports').select('id,title,category,status,description,created_at,location_label').eq('is_public', true).order('created_at', { ascending: false }); },
    async getPublicReport(id) { if (!client) return { data: null, error: unavailable() }; return client.from('reports').select('id,title,category,status,description,created_at,location_label').eq('id', id).eq('is_public', true).maybeSingle(); },
    async listReports() { if (!client) return { data: [], error: unavailable() }; return client.from('reports').select('id,title,category,status,created_at,location_label').order('created_at', { ascending: false }); },
    async createReport(payload) { if (!client) return { data: null, error: unavailable() }; const current = await client.auth.getSession(); if (!current.data.session) return { data: null, error: new Error('Sign in is required before submitting a report.') }; return client.from('reports').insert({ ...payload, reporter_id: current.data.session.user.id, is_public: false }).select().single(); }
  };
})();
