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
    const extension = String(name || '').split('.').pop().toLowerCase();
    return EXTENSION_TYPES[extension] || '';
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
    if (window.cordova && camera && typeof camera.getPicture === 'function' && hasFileResolver) {
      const constants = window.Camera || {};
      const sourceType = constants.PictureSourceType ? constants.PictureSourceType.PHOTOLIBRARY : 0;
      const destinationType = constants.DestinationType ? constants.DestinationType.FILE_URI : 1;
      const mediaType = constants.MediaType ? constants.MediaType.ALLMEDIA : 2;
      setStatus('Opening your photo and video library…', 'progress');
      try {
        camera.getPicture((uri) => {
          const replacement = state.replaceTargetId;
          state.replaceTargetId = null;
          if (!uri) { setStatus('No attachment selected.', ''); return; }
          window.resolveLocalFileSystemURL(uri, (entry) => {
            entry.file((file) => {
              const filename = file.name || entry.name || 'attachment';
              addFiles([{ file, name: filename }], replacement);
            }, (error) => setStatus(`Could not read the selected file${error && error.message ? `: ${error.message}` : '.'}`, 'error'));
          }, (error) => setStatus(`Could not open the selected file${error && error.message ? `: ${error.message}` : '.'}`, 'error'));
        }, (error) => {
          state.replaceTargetId = null;
          const message = String(error && (error.message || error) || '');
          if (/cancel|no media|no image selected/i.test(message)) setStatus('Media selection cancelled.', '');
          else setStatus(`Could not open the media library${message ? `: ${message}` : '.'}`, 'error');
        }, { sourceType, destinationType, mediaType, encodingType: constants.EncodingType ? constants.EncodingType.JPEG : 0, correctOrientation: true });
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
