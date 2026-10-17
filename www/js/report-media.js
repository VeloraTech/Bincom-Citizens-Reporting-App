/* Local report-media selection and preview state. Files stay on-device until an authenticated submit. */
(function () {
  'use strict';

  const MAX_FILES = 3;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const ALLOWED_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/x-m4v'
  ]);
  const EXTENSION_TYPES = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    '3gp': 'video/3gpp', m4v: 'video/x-m4v'
  };
  const state = { selected: [], busy: false, replaceTargetId: null, initialized: false };
  const $ = (selector) => document.querySelector(selector);

  function mediaDiagnostic(stage, details) {
    try { console.info('[WeSignal media]', { stage, ...details }); } catch (_) { /* Diagnostics must never interrupt uploads. */ }
  }

  function uriScheme(uri) {
    const match = String(uri || '').match(/^([a-z][a-z0-9+.-]*):/i);
    return match ? match[1].toLowerCase() : 'relative-or-unknown';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function resolveMime(file, name) {
    const reported = String(file && file.type || '').split(';')[0].trim().toLowerCase();
    if (ALLOWED_TYPES.has(reported)) return reported;
    const cleanName = String(name || file && file.name || '').split(/[?#]/)[0].split('/').pop();
    const extension = cleanName && cleanName.includes('.') ? cleanName.slice(cleanName.lastIndexOf('.') + 1).toLowerCase() : '';
    return EXTENSION_TYPES[extension] || '';
  }

  function filenameFromUri(uri) {
    const lastPart = String(uri || '').split(/[?#]/)[0].split('/').pop() || '';
    try { return decodeURIComponent(lastPart).slice(0, 180) || 'attachment'; }
    catch (_) { return lastPart.slice(0, 180) || 'attachment'; }
  }

  function readFileAsBlob(file, mimeType) {
    return new Promise((resolve, reject) => {
      if (typeof FileReader !== 'function') { reject(new Error('This Android WebView cannot read the selected file.')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('The selected file could not be read.'));
      reader.onload = () => {
        if (!reader.result) { reject(new Error('The selected file returned no data.')); return; }
        try { resolve(new Blob([reader.result], { type: mimeType })); }
        catch (error) { reject(error); }
      };
      try { reader.readAsArrayBuffer(file); }
      catch (error) { reject(error); }
    });
  }

  async function normalizeCordovaFile(file, preferredName) {
    const name = String(preferredName || file && file.name || 'attachment').slice(0, 180);
    const mimeType = resolveMime(file, name);
    if (!mimeType) throw new Error('The file type is not supported. Choose a JPG, PNG, WebP, GIF, HEIC, MP4, WebM, MOV, 3GP, or M4V file.');
    let reportedSize = Number(file && file.size);
    if (Number.isFinite(reportedSize) && reportedSize > MAX_FILE_BYTES) throw new Error('Files must be 25 MiB or smaller.');

    // Android content providers can expose a valid URI while returning a zero/unknown
    // size from the Cordova File wrapper. Read the granted file bytes first and use the
    // resulting Blob as the upload source; never upload the URI or a guessed filename.
    let blob = null;
    try {
      if (file && typeof file.slice === 'function' && Number.isFinite(reportedSize) && reportedSize > 0) blob = file.slice(0, reportedSize, mimeType);
    } catch (_) { /* Some Cordova File wrappers do not implement Blob.slice correctly. */ }
    if (!blob || Number(blob.size) !== reportedSize) blob = await readFileAsBlob(file, mimeType);
    const size = Number(blob && blob.size);
    if (!Number.isFinite(size) || size < 1) throw new Error('Android returned an empty file or a URI without readable file data.');
    if (size > MAX_FILE_BYTES) throw new Error('Files must be 25 MiB or smaller.');
    if (!blob || Number(blob.size) !== size) throw new Error('The selected file could not be converted into uploadable data.');

    let uploadFile = blob;
    if (typeof File === 'function') {
      try { uploadFile = new File([blob], name, { type: mimeType, lastModified: Number(file.lastModified) || Date.now() }); }
      catch (_) { /* Blob is sufficient for TUS; its MIME type is set above. */ }
    }
    return { file: uploadFile, name, mimeType, size };
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setStatus(message, type) {
    const node = $('#media-status');
    if (!node) return;
    node.textContent = message || '';
    node.className = `media-status${type ? ` media-status-${type}` : ''}`;
    node.hidden = !message;
  }

  function notifyChange() {
    document.dispatchEvent(new CustomEvent('reportmediachange'));
  }

  function release(item) {
    if (item && item.previewUrl && item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
  }

  function render() {
    const list = $('#media-preview-list');
    const empty = $('#media-empty-state');
    const count = $('#media-count');
    const add = $('#media-add-button');
    if (!list || !empty || !count || !add) return;
    count.textContent = `${state.selected.length} of ${MAX_FILES} selected`;
    empty.hidden = state.selected.length > 0;
    add.disabled = state.busy || state.selected.length >= MAX_FILES;
    list.innerHTML = state.selected.map((item, index) => {
      const preview = item.previewError
        ? '<div class="report-media-preview-unavailable" role="status">Preview unavailable on this device.</div>'
        : item.mediaType === 'video'
        ? `<video class="report-media-preview-video" src="${escapeHtml(item.previewUrl)}" controls playsinline preload="metadata" aria-label="Video attachment ${index + 1}"></video>`
        : `<img class="report-media-preview-image" src="${escapeHtml(item.previewUrl)}" alt="Selected photo attachment ${index + 1}">`;
      return `<article class="report-media-preview-card" data-media-id="${escapeHtml(item.id)}"><div class="report-media-preview-frame">${preview}</div><div class="report-media-preview-info"><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><span>${item.mediaType === 'video' ? 'Video' : 'Photo'} · ${formatBytes(item.size)}</span></div><div class="report-media-preview-actions"><button type="button" class="report-media-action" data-media-action="replace" data-media-id="${escapeHtml(item.id)}"${state.busy ? ' disabled' : ''}>Replace</button><button type="button" class="report-media-action remove" data-media-action="remove" data-media-id="${escapeHtml(item.id)}"${state.busy ? ' disabled' : ''}>Remove</button></div></article>`;
    }).join('');
  }

  function addFiles(files, replaceTargetId) {
    const errors = [];
    let accepted = 0;
    let replaceId = replaceTargetId || null;
    for (const candidate of files) {
      const file = candidate && candidate.file ? candidate.file : candidate;
      if (!file) continue;
      const name = String(candidate && candidate.name || file.name || 'Attachment').slice(0, 180);
      const mimeType = resolveMime(file, name);
      if (!mimeType || !ALLOWED_TYPES.has(mimeType)) {
        errors.push(`${name}: choose a supported photo or video.`);
        continue;
      }
      if (!Number.isFinite(file.size) || file.size < 1) {
        errors.push(`${name}: the file is empty or unavailable.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${name}: files must be 25 MiB or smaller.`);
        continue;
      }
      let previewUrl;
      try { previewUrl = URL.createObjectURL(file); }
      catch (_) { errors.push(`${name}: preview is not available on this device.`); continue; }
      const item = { id: makeId(), file, name, mimeType, mediaType: mimeType.startsWith('video/') ? 'video' : 'image', size: file.size, previewUrl };
      if (replaceId) {
        const index = state.selected.findIndex((current) => current.id === replaceId);
        if (index < 0) { release(item); errors.push('The selected attachment could not be replaced.'); replaceId = null; continue; }
        release(state.selected[index]);
        state.selected[index] = item;
        replaceId = null;
        accepted += 1;
      } else if (state.selected.length >= MAX_FILES) {
        release(item);
        errors.push(`You can attach up to ${MAX_FILES} files.`);
      } else {
        state.selected.push(item);
        accepted += 1;
      }
    }
    render();
    if (accepted) notifyChange();
    if (errors.length) setStatus(errors.join(' '), 'error');
    else if (accepted) setStatus(`${accepted} attachment${accepted === 1 ? '' : 's'} ready. They upload only when you submit the report.`, 'success');
    else setStatus('', '');
  }

  function openPicker(replaceTargetId) {
    if (state.busy) return;
    state.replaceTargetId = replaceTargetId || null;
    const camera = window.navigator && window.navigator.camera;
    const hasFileResolver = typeof window.resolveLocalFileSystemURL === 'function';
    const isAndroidCordova = window.cordova && window.cordova.platformId === 'android';
    // Android Camera 8.x can decode/re-encode gallery images (and returns cache
    // files such as Modified.jpg). Use the existing WebView file input to keep
    // Android's selected image/video bytes and original MIME/extension intact.
    if (!isAndroidCordova && window.cordova && camera && typeof camera.getPicture === 'function' && hasFileResolver) {
      const constants = window.Camera || {};
      const sourceType = constants.PictureSourceType ? constants.PictureSourceType.PHOTOLIBRARY : 0;
      const destinationType = constants.DestinationType ? constants.DestinationType.FILE_URI : 1;
      const mediaType = constants.MediaType ? constants.MediaType.ALLMEDIA : 2;
      setStatus('Opening your photo and video library…', 'progress');
      try {
        // Camera plugin 8.x re-encodes gallery images with EXIF rotation into a
        // transient `modified.jpg`; keep the original file URI/bytes instead.
        camera.getPicture((uri) => {
          const replacement = state.replaceTargetId;
          state.replaceTargetId = null;
          if (!uri) { setStatus('No attachment selected.', ''); return; }
          const fallbackName = filenameFromUri(uri);
          mediaDiagnostic('picker-selection', { uri_scheme: uriScheme(uri), filename: fallbackName });
          window.resolveLocalFileSystemURL(uri, (entry) => {
            if (!entry || typeof entry.file !== 'function') {
              mediaDiagnostic('file-entry-unavailable', { uri_scheme: uriScheme(uri), filename: fallbackName });
              setStatus(`Cannot attach ${fallbackName}: Android did not provide a readable file entry. Select another file or save it to the device first.`, 'error');
              return;
            }
            entry.file((file) => {
              const filename = file && file.name || entry.name || fallbackName;
              mediaDiagnostic('file-entry', { uri_scheme: uriScheme(uri), filename, mime_type: String(file && file.type || ''), byte_count: Number(file && file.size) || 0 });
              normalizeCordovaFile(file, filename)
                .then((normalized) => {
                  mediaDiagnostic('file-normalized', { uri_scheme: uriScheme(uri), filename: normalized.name, mime_type: normalized.mimeType, byte_count: normalized.size });
                  addFiles([normalized], replacement);
                })
                .catch((error) => {
                  mediaDiagnostic('file-read-failed', { uri_scheme: uriScheme(uri), filename, error_name: String(error && error.name || 'Error'), error_code: String(error && error.code || '') });
                  setStatus(`Cannot attach ${filename}: ${error && error.message ? error.message : 'the file could not be read.'} Try another file or save it to the device first.`, 'error');
                });
            }, (error) => {
              mediaDiagnostic('file-read-failed', { uri_scheme: uriScheme(uri), filename: fallbackName, error_name: String(error && error.name || 'FileError'), error_code: String(error && error.code || '') });
              const reason = error && error.message ? error.message : error && error.code ? `Cordova file error ${error.code}` : 'the Android file grant may have expired';
              setStatus(`Cannot attach ${fallbackName}: Android could not read the selected file (${reason}). Select it again or save it to the device first.`, 'error');
            });
          }, (error) => {
            mediaDiagnostic('uri-resolution-failed', { uri_scheme: uriScheme(uri), filename: fallbackName, error_name: String(error && error.name || 'FileError'), error_code: String(error && error.code || '') });
            const reason = error && error.message ? error.message : error && error.code ? `Cordova URI error ${error.code}` : 'the Android content URI could not be resolved';
            setStatus(`Cannot attach ${fallbackName}: Android could not open the selected media (${reason}). Select it again or save it to the device first.`, 'error');
          });
        }, (error) => {
          state.replaceTargetId = null;
          const message = String(error && (error.message || error) || '');
          if (/cancel|no media|no image selected/i.test(message)) setStatus('Media selection cancelled.', '');
          else setStatus(`Could not open the media library${message ? `: ${message}` : '.'}`, 'error');
        }, { sourceType, destinationType, mediaType, allowEdit: false, correctOrientation: false });
      } catch (error) {
        state.replaceTargetId = null;
        setStatus(`Could not open the media library: ${error && error.message ? error.message : 'unsupported device.'}`, 'error');
      }
      return;
    }
    const input = $('#media-file-input');
    if (!input) { setStatus('This device does not provide a media picker.', 'error'); return; }
    input.value = '';
    input.multiple = !replaceTargetId;
    input.click();
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    const addButton = $('#media-add-button');
    const input = $('#media-file-input');
    const list = $('#media-preview-list');
    if (!addButton || !input || !list) return;
    addButton.addEventListener('click', () => openPicker(null));
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      files.forEach((file) => mediaDiagnostic('picker-selection', {
        picker_source: 'html-file-input', uri_scheme: null,
        filename: String(file && file.name || 'attachment'),
        mime_type: resolveMime(file, file && file.name) || String(file && file.type || ''),
        byte_count: Number(file && file.size) || 0
      }));
      const replacement = state.replaceTargetId;
      state.replaceTargetId = null;
      addFiles(files, replacement);
      input.value = '';
    });
    list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-media-action]');
      if (!button || state.busy) return;
      const id = button.dataset.mediaId;
      if (button.dataset.mediaAction === 'replace') openPicker(id);
      else if (button.dataset.mediaAction === 'remove') {
        const index = state.selected.findIndex((item) => item.id === id);
        if (index >= 0) {
          release(state.selected[index]);
          state.selected.splice(index, 1);
          render();
          notifyChange();
          setStatus('Attachment removed. It will not be uploaded.', 'success');
        }
      }
    });
    list.addEventListener('error', (event) => {
      const element = event.target;
      if (!(element instanceof HTMLImageElement) && !(element instanceof HTMLVideoElement)) return;
      const card = element.closest('[data-media-id]');
      const item = card && state.selected.find((current) => current.id === card.dataset.mediaId);
      if (!item || item.previewError) return;
      item.previewError = true;
      render();
      setStatus(`${item.name}: preview is not supported on this device. You can replace or remove it.`, 'error');
    }, true);
    render();
  }

  window.ReportMedia = {
    init,
    getSelected() { return state.selected.map((item) => ({ id: item.id, file: item.file, name: item.name, mimeType: item.mimeType, mediaType: item.mediaType, size: item.size })); },
    setBusy(busy) { state.busy = Boolean(busy); render(); },
    setStatus,
    clear() {
      state.selected.forEach(release);
      state.selected = [];
      state.replaceTargetId = null;
      const input = $('#media-file-input');
      if (input) input.value = '';
      render();
      notifyChange();
      setStatus('', '');
    }
  };
})();
