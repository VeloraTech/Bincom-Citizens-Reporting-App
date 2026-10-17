import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Authentication is required.' }, 401)
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'The account-actions function is not configured. Deploy it with SUPABASE_SERVICE_ROLE_KEY set in the Edge Function environment.' }, 500)
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') || serviceKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const service = createClient(url, serviceKey)
  const { data: auth, error: authError } = await userClient.auth.getUser(token)
  if (authError || !auth.user) return json({ error: 'Your session is no longer valid. Sign in again and retry.' }, 401)
  let body: { action?: string, reportId?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }

  if (body.action === 'delete-report') {
    if (!body.reportId) return json({ error: 'A report is required.' }, 400)
    const { data: report } = await service.from('reports').select('id,reporter_id').eq('id', body.reportId).maybeSingle()
    if (!report || report.reporter_id !== auth.user.id) return json({ error: 'You can only delete your own reports.' }, 403)
    const { data: media, error: mediaError } = await service.from('report_media').select('object_path').eq('report_id', body.reportId)
    if (mediaError) return json({ error: mediaError.message }, 500)
    const paths = (media || []).map((item) => item.object_path).filter(Boolean)
    if (paths.length) {
      const { error } = await service.storage.from('wesignal-report-media').remove(paths)
      if (error) return json({ error: `Report was not deleted because media cleanup failed: ${error.message}` }, 500)
    }
    const { error } = await service.from('reports').delete().eq('id', body.reportId).eq('reporter_id', auth.user.id)
    if (error) return json({ error: error.message }, 500)
    return json({ deleted: true })
  }

  if (body.action === 'delete-account') {
    const { data: reports, error: reportError } = await service.from('reports').select('id').eq('reporter_id', auth.user.id)
    if (reportError) return json({ error: reportError.message }, 500)
    const ids = (reports || []).map((item) => item.id)
    if (ids.length) {
      const { data: media, error: mediaError } = await service.from('report_media').select('object_path').in('report_id', ids)
      if (mediaError) return json({ error: mediaError.message }, 500)
      const paths = (media || []).map((item) => item.object_path).filter(Boolean)
      if (paths.length) {
        const { error } = await service.storage.from('wesignal-report-media').remove(paths)
        if (error) return json({ error: `Account was not deleted because media cleanup failed: ${error.message}` }, 500)
      }
      const { error: reportsDeleteError } = await service.from('reports').delete().eq('reporter_id', auth.user.id)
      if (reportsDeleteError) return json({ error: `Account was not deleted because report cleanup failed: ${reportsDeleteError.message}` }, 500)
    }
    const { error } = await service.auth.admin.deleteUser(auth.user.id)
    if (error) return json({ error: error.message }, 500)
    return json({ deleted: true })
  }
  return json({ error: 'Unknown account action.' }, 400)
})
