/* Runtime data adapter. www/env.js contains only a public Supabase key, never a service-role key. */
(function () {
  'use strict';
  const config = window.BINCOM_CONFIG || {};
  const publicKey = config.supabasePublishableKey || config.supabaseAnonKey || '';
  const hasConfig = Boolean(config.supabaseUrl && publicKey);
  const MEDIA_BUCKET = 'wesignal-report-media';
  const MEDIA_URL_TTL_SECONDS = 60 * 60;
  const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
  const MAX_MEDIA_FILES = 3;
  const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
  const MEDIA_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/x-m4v'
  ]);
  const MEDIA_EXTENSIONS = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'image/heic': 'heic', 'image/heif': 'heif', 'video/mp4': 'mp4', 'video/webm': 'webm',
    'video/quicktime': 'mov', 'video/3gpp': '3gp', 'video/x-m4v': 'm4v'
  };
  let client = null;
  if (hasConfig && window.supabase && typeof window.supabase.createClient === 'function') {
    client = window.supabase.createClient(config.supabaseUrl, publicKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  }

  const unavailable = () => new Error(hasConfig
    ? 'Supabase could not be initialized. Check the public URL and anon/publishable key.'
    : 'Supabase is not configured. Add the public URL and anon/publishable key in www/env.js.');

  function makeUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') window.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function tusEndpoint() {
    const parsed = new URL(config.supabaseUrl);
    const projectHost = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    const origin = projectHost ? `https://${projectHost[1]}.storage.supabase.co` : parsed.origin;
    return `${origin}/storage/v1/upload/resumable`;
  }

  function uploadWithTus(file, objectPath, mimeType, accessToken, onProgress) {
    if (!window.tus || typeof window.tus.Upload !== 'function') {
      return Promise.reject(new Error('The resumable media uploader did not load. Restart the app and try again.'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      try {
        const upload = new window.tus.Upload(file, {
          endpoint: tusEndpoint(),
          chunkSize: TUS_CHUNK_BYTES,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${accessToken}`,
            apikey: publicKey,
            'x-upsert': 'false'
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: MEDIA_BUCKET,
            objectName: objectPath,
            contentType: mimeType,
            cacheControl: '3600'
          },
          onError(error) { finish(reject, error instanceof Error ? error : new Error(String(error))); },
          onProgress(bytesUploaded, bytesTotal) {
            const percent = bytesTotal ? Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100)) : 0;
            if (typeof onProgress === 'function') onProgress(percent);
          },
          onSuccess() { finish(resolve, true); }
        });
        upload.start();
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async function removeUnlinked(paths) {
    if (!client || !paths.length) return null;
    try {
      const result = await client.storage.from(MEDIA_BUCKET).remove(paths);
      return result.error || null;
    } catch (error) {
      return error;
    }
  }

  async function listReportMedia(reportIds) {
    if (!client) return { data: [], error: unavailable(), failedCount: 0 };
    const ids = [...new Set((reportIds || []).filter((id) => typeof id === 'string' && id.length > 0))];
    if (!ids.length) return { data: [], error: null, failedCount: 0 };
    const result = await client.from('report_media')
      .select('id,report_id,bucket_id,object_path,media_type,mime_type,size_bytes,sort_order,created_at')
      .in('report_id', ids)
      .order('sort_order', { ascending: true });
    if (result.error) return { data: [], error: result.error, failedCount: 0 };
    const rows = result.data || [];
    if (!rows.length) return { data: [], error: null, failedCount: 0 };

    const signedByPath = new Map();
    let firstError = null;
    for (let offset = 0; offset < rows.length; offset += 50) {
      const batch = rows.slice(offset, offset + 50);
      const signed = await client.storage.from(MEDIA_BUCKET)
        .createSignedUrls(batch.map((item) => item.object_path), MEDIA_URL_TTL_SECONDS);
      if (signed.error) {
        firstError = firstError || signed.error;
        continue;
      }
      (signed.data || []).forEach((entry, index) => {
        const url = entry && (entry.signedUrl || entry.signedURL);
        if (url) signedByPath.set(entry.path || batch[index].object_path, url);
        else firstError = firstError || (entry && entry.error) || new Error('A media URL could not be created.');
      });
    }
    const data = rows.map((item) => ({ ...item, signed_url: signedByPath.get(item.object_path) || '' }));
    const failedCount = data.filter((item) => !item.signed_url).length;
    return { data, error: firstError, failedCount };
  }

  window.BincomData = {
    isConfigured: () => Boolean(client),
    configurationMessage: () => hasConfig
      ? 'Supabase could not be initialized. Check the public URL and anon/publishable key in www/env.js.'
      : 'Supabase is not configured. Add the public URL and anon/publishable key in www/env.js.',
    async getSession() { return client ? client.auth.getSession() : { data: { session: null }, error: null }; },
    async getUser() { return client ? client.auth.getUser() : { data: { user: null }, error: unavailable() }; },
    async clearLocalSession() { return client ? client.auth.signOut({ scope: 'local' }) : { error: unavailable() }; },
    onAuthStateChange(callback) { return client ? client.auth.onAuthStateChange(callback) : { data: { subscription: { unsubscribe() {} } } }; },
    async signUp(email, password) { return client ? client.auth.signUp({ email, password }) : { data: null, error: unavailable() }; },
    async signIn(email, password) { return client ? client.auth.signInWithPassword({ email, password }) : { data: null, error: unavailable() }; },
    async resetPassword(email) { return client ? client.auth.resetPasswordForEmail(email) : { data: null, error: unavailable() }; },
    async signOut() { return client ? client.auth.signOut() : { error: unavailable() }; },
    async listPublicReports() {
      if (!client) return { data: [], error: unavailable() };
      return client.from('reports').select('id,title,category,status,description,created_at,location_label,latitude,longitude')
        .eq('is_public', true).order('created_at', { ascending: false });
    },
    async getPublicReport(id) {
      if (!client) return { data: null, error: unavailable() };
      return client.from('reports').select('id,title,category,status,description,created_at,location_label,latitude,longitude')
        .eq('id', id).eq('is_public', true).maybeSingle();
    },
    listReportMedia,
    async listReports() {
      if (!client) return { data: [], error: unavailable() };
      const current = await client.auth.getSession();
      if (current.error) return { data: [], error: current.error };
      if (!current.data.session) return { data: [], error: new Error('Sign in is required to view your reports.') };
      return client.from('reports').select('id,title,description,category,status,created_at,location_label,latitude,longitude')
        .eq('reporter_id', current.data.session.user.id).order('created_at', { ascending: false });
    },
    async createReport(payload, attachments = [], onProgress) {
      if (!client) return { data: null, error: unavailable(), mayHaveSubmitted: false };
      const current = await client.auth.getSession();
      if (current.error) return { data: null, error: current.error, mayHaveSubmitted: false };
      const session = current.data && current.data.session;
      if (!session || !session.user || !session.access_token) {
        return { data: null, error: new Error('Sign in is required before submitting a report.'), mayHaveSubmitted: false };
      }
      const media = Array.isArray(attachments) ? attachments : [];
      if (media.length > MAX_MEDIA_FILES) {
        return { data: null, error: new Error(`A report may contain up to ${MAX_MEDIA_FILES} attachments.`), mayHaveSubmitted: false };
      }
      for (const item of media) {
        if (!item || !item.file || !MEDIA_MIME_TYPES.has(item.mimeType) || !item.size || item.size > MAX_MEDIA_BYTES) {
          return { data: null, error: new Error('One or more attachments are unsupported or exceed the 25 MiB limit.'), mayHaveSubmitted: false };
        }
      }

      const reportId = makeUuid();
      const attemptedPaths = [];
      const reportMedia = [];
      let rpcAttempted = false;
      try {
        for (let index = 0; index < media.length; index += 1) {
          const item = media[index];
          const extension = MEDIA_EXTENSIONS[item.mimeType];
          const objectPath = `${session.user.id}/${reportId}/${makeUuid()}.${extension}`;
          attemptedPaths.push(objectPath);
          const result = await uploadWithTus(item.file, objectPath, item.mimeType, session.access_token, (percent) => {
            if (typeof onProgress === 'function') onProgress({ stage: 'upload', index: index + 1, total: media.length, percent });
          });
          if (!result) throw new Error('The attachment upload did not complete.');
          reportMedia.push({
            bucket_id: MEDIA_BUCKET,
            object_path: objectPath,
            media_type: item.mediaType,
            mime_type: item.mimeType,
            size_bytes: item.size,
            sort_order: index
          });
        }
        if (typeof onProgress === 'function') onProgress({ stage: 'saving', index: media.length, total: media.length, percent: 100 });
        rpcAttempted = true;
        const submitted = await client.rpc('submit_report_with_media', {
          p_report_id: reportId,
          p_title: payload.title,
          p_category: payload.category,
          p_description: payload.description,
          p_location_label: payload.location_label,
          p_latitude: payload.latitude,
          p_longitude: payload.longitude,
          p_media: reportMedia
        });
        if (submitted.error) {
          const cleanupError = await removeUnlinked(attemptedPaths);
          const status = Number(submitted.error.status);
          const mayHaveSubmitted = !Number.isFinite(status) || status >= 500;
          const details = submitted.error.message || 'Supabase rejected the submission.';
          const cleanupNote = cleanupError
            ? (mayHaveSubmitted ? ' Media cleanup could not be confirmed; the report may already be saved and public. Check My Reports before retrying.' : ' Media cleanup could not be confirmed; unlinked files may remain inside the private bucket.')
            : '';
          return { data: null, error: new Error(`${details}${cleanupNote}`), mayHaveSubmitted };
        }
        return { data: { id: submitted.data, media: reportMedia }, error: null, mayHaveSubmitted: false };
      } catch (error) {
        const cleanupError = await removeUnlinked(attemptedPaths);
        const message = error && error.message ? error.message : 'The media upload did not complete.';
        const cleanupNote = cleanupError
          ? (rpcAttempted ? ' Media cleanup could not be confirmed; the report may already be saved and public. Check My Reports before retrying.' : ' Media cleanup could not be confirmed; unlinked files may remain inside the private bucket.')
          : '';
        return { data: null, error: new Error(`${message}${cleanupNote}`), mayHaveSubmitted: rpcAttempted };
      }
    }
  };
})();
