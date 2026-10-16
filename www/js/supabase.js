/* Optional runtime adapter. www/env.js is local-only and must never contain a service-role key. */
(function () {
  const config = window.BINCOM_CONFIG || {};
  const hasConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  let client = null;
  if (hasConfig && window.supabase && typeof window.supabase.createClient === 'function') {
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  }
  window.BincomData = {
    isConfigured: () => Boolean(client),
    async getSession() { return client ? client.auth.getSession() : { data: { session: null }, error: null }; },
    async listReports() {
      if (!client) return { data: [], error: new Error('Supabase is not configured.') };
      return client.from('reports').select('id,title,category,status,created_at,location_label').order('created_at', { ascending: false });
    },
    async createReport(payload) {
      if (!client) return { data: null, error: new Error('Supabase is not configured.') };
      const session = await client.auth.getSession();
      if (!session.data.session) return { data: null, error: new Error('Sign in is required before submitting a report.') };
      return client.from('reports').insert({ ...payload, reporter_id: session.data.session.user.id }).select().single();
    }
  };
})();
