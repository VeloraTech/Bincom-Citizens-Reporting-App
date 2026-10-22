(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const mapConfig = window.BINCOM_CONFIG || {};
  const DEFAULT_CENTER = [9.082, 8.6753];
  const DEFAULT_ZOOM = 6;
  const TILE_URL = mapConfig.mapTileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const TILE_ATTRIBUTION = mapConfig.mapTileAttribution || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
  const SEARCH_URL = mapConfig.mapSearchEndpoint || 'https://photon.komoot.io/api/';
  const MAX_SEARCH_RESULTS = 5;
  const SEARCH_MIN_INTERVAL_MS = 1000;
  let map = null;
  let tileLayer = null;
  let marker = null;
  let accuracyCircle = null;
  let mode = 'select';
  let selectedPoint = null;
  let searchFeatures = [];
  let lastSearchAt = 0;
  let searchRequest = 0;
  let tileErrorShown = false;

  function validPoint(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lon)
      && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
      ? { latitude: lat, longitude: lon }
      : null;
  }

  function getStatus() { return $('#map-status'); }

  function setStatus(message, kind) {
    const node = getStatus();
    if (!node) return;
    node.textContent = message || '';
    node.className = `map-status${kind ? ` map-status-${kind}` : ''}`;
  }

  function currentFormPoint() {
    return validPoint($('#latitude') && $('#latitude').value, $('#longitude') && $('#longitude').value);
  }

  function displayPoint(point) {
    return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
  }

  function makeMap() {
    if (map) return map;
    if (!window.L || typeof window.L.map !== 'function') {
      setStatus('The map library did not load. Restart the app and try again.', 'error');
      return null;
    }
    map = window.L.map('map-canvas', { zoomControl: true, attributionControl: true, tap: true })
      .setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    tileLayer = window.L.tileLayer(TILE_URL, {
      maxZoom: Number(mapConfig.mapTileMaxZoom) || 19,
      attribution: TILE_ATTRIBUTION
    });
    tileLayer.on('tileerror', () => {
      if (tileErrorShown) return;
      tileErrorShown = true;
      setStatus('Map tiles are unavailable. Check your connection; you can still use GPS or search for a landmark.', 'error');
    });
    tileLayer.on('load', () => {
      tileErrorShown = false;
      if (mode === 'select' && !selectedPoint) setStatus('Tap the map to place a pin, or search for a landmark or address.');
    });
    tileLayer.addTo(map);
    map.on('click', (event) => {
      if (mode !== 'select') return;
      setSelectedPoint(event.latlng.lat, event.latlng.lng, null, true);
    });
    return map;
  }

  function placeMarker(point, draggable) {
    if (!map || !window.L) return;
    if (marker) {
      marker.off();
      map.removeLayer(marker);
      marker = null;
    }
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    marker = window.L.marker([point.latitude, point.longitude], { draggable: Boolean(draggable) }).addTo(map);
    if (draggable) {
      marker.on('dragend', (event) => {
        const position = event.target.getLatLng();
        setSelectedPoint(position.lat, position.lng, null, false);
      });
    }
  }

  function setSelectedPoint(latitude, longitude, label, pan) {
    const point = validPoint(latitude, longitude);
    if (!point) {
      setStatus('The selected position is invalid. Choose another point.', 'error');
      return;
    }
    selectedPoint = { ...point, label: label || null };
    placeMarker(point, mode === 'select');
    if (pan && map) map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 15), { animate: true });
    setStatus(`Pin selected at ${displayPoint(point)}. Drag it or tap another point to adjust.`, 'success');
  }

  function openModal() {
    const modal = $('#map-modal');
    modal.hidden = false;
    document.body.classList.add('map-modal-open');
    window.requestAnimationFrame(() => {
      const instance = makeMap();
      if (instance) instance.invalidateSize({ pan: false });
    });
  }

  function closeModal() {
    $('#map-modal').hidden = true;
    document.body.classList.remove('map-modal-open');
  }

  function openPicker(options) {
    const settings = options || {};
    mode = 'select';
    selectedPoint = currentFormPoint();
    searchFeatures = [];
    $('#map-dialog-title').textContent = 'Choose incident location';
    $('#map-save').hidden = false;
    $('#map-use-gps').hidden = false;
    $('#map-search-query').value = '';
    $('#map-search-results').replaceChildren();
    openModal();
    window.requestAnimationFrame(() => {
      if (!map) return;
      if (selectedPoint) {
        placeMarker(selectedPoint, true);
        map.setView([selectedPoint.latitude, selectedPoint.longitude], 15);
        setStatus('Drag the pin or tap the map to adjust this report location.');
      } else {
        if (marker) { map.removeLayer(marker); marker = null; }
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        setStatus('Tap the map to place a pin, or search for a landmark or address.');
      }
      map.invalidateSize({ pan: false });
      if (settings.locate) locateCurrentPosition();
    });
  }

  function openMarker(latitude, longitude, label, radius) {
    const point = validPoint(latitude, longitude);
    if (!point) return;
    mode = 'view';
    selectedPoint = { ...point, label: label || null };
    searchFeatures = [];
    $('#map-dialog-title').textContent = label || 'Incident location';
    $('#map-save').hidden = true;
    $('#map-use-gps').hidden = true;
    $('#map-search-query').value = '';
    $('#map-search-results').replaceChildren();
    openModal();
    window.requestAnimationFrame(() => {
      if (!map) return;
      if (marker) { map.removeLayer(marker); marker = null; }
      if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
      const radiusMeters = Number(radius);
      if (Number.isFinite(radiusMeters) && radiusMeters > 0 && typeof window.L.circle === 'function') {
        accuracyCircle = window.L.circle([point.latitude, point.longitude], { radius: radiusMeters, color: '#0057C2', fillColor: '#7EA7E8', fillOpacity: 0.2, weight: 2 }).addTo(map);
        map.fitBounds(accuracyCircle.getBounds(), { padding: [24, 24], maxZoom: 15 });
      } else {
        placeMarker(point, false);
        map.setView([point.latitude, point.longitude], 15);
      }
      map.invalidateSize({ pan: false });
      setStatus(label ? `${label}${Number.isFinite(radiusMeters) && radiusMeters > 0 ? ` · within about ${radiusMeters >= 1000 ? `${(radiusMeters / 1000).toFixed(1)} km` : `${radiusMeters} m`}` : ''}` : 'Approximate incident area');
    });
  }

  function locateCurrentPosition() {
    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
      setStatus('Location is unavailable on this device. Search for a landmark or tap the map instead.', 'error');
      return;
    }
    setStatus('Requesting location permission…');
    navigator.geolocation.getCurrentPosition((position) => {
      const point = validPoint(position.coords.latitude, position.coords.longitude);
      if (!point) {
        setStatus('The device returned invalid coordinates. Search or choose a pin on the map instead.', 'error');
        return;
      }
      setSelectedPoint(point.latitude, point.longitude, null, true);
      setStatus(`GPS pin selected at ${displayPoint(point)}. Tap “Use this location” to save it with the report.`, 'success');
    }, (error) => {
      const messages = {
        1: 'Location permission was denied. Enable location access in device settings or choose a pin on the map.',
        2: 'GPS could not determine your location. Check signal or choose a pin on the map.',
        3: 'Location lookup timed out. Try again or choose a pin on the map.'
      };
      setStatus(messages[error && error.code] || 'Location could not be determined. Choose a pin on the map instead.', 'error');
    }, { enableHighAccuracy: false, maximumAge: 30000, timeout: 30000 });
  }

  function resultLabel(properties) {
    const p = properties || {};
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const parts = [p.name, street, p.district, p.city, p.state, p.country].filter(Boolean);
    const unique = [...new Set(parts.map((part) => String(part).trim()).filter(Boolean))];
    return (unique.length ? unique.join(', ') : 'Selected place').slice(0, 240);
  }

  function renderSearchResults(features) {
    const container = $('#map-search-results');
    container.replaceChildren();
    searchFeatures = features.slice(0, MAX_SEARCH_RESULTS);
    if (!searchFeatures.length) {
      setStatus('No matching places found. Try a nearby street, landmark, or area name.', 'error');
      return;
    }
    const list = document.createElement('div');
    list.className = 'map-search-result-list';
    searchFeatures.forEach((feature, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-search-result';
      button.textContent = resultLabel(feature.properties);
      button.addEventListener('click', () => {
        const coords = feature && feature.geometry && feature.geometry.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;
        const label = resultLabel(feature.properties);
        $('#map-search-query').value = label;
        container.replaceChildren();
        setSelectedPoint(coords[1], coords[0], label, true);
        if (mode === 'view') {
          setStatus(`${label} · ${displayPoint(selectedPoint)}`);
        } else {
          setStatus(`Place selected: ${label}. Tap “Use this location” to save the pin with the report.`, 'success');
        }
      });
      list.append(button);
    });
    container.append(list);
    setStatus('Choose a search result to move the pin. No location is saved until you confirm it.', 'success');
  }

  async function searchAddress() {
    const query = $('#map-search-query').value.trim();
    if (query.length < 2) {
      setStatus('Enter at least two characters to search for a place.', 'error');
      return;
    }
    if (typeof window.fetch !== 'function') {
      setStatus('Address search is unavailable. Tap the map or use GPS instead.', 'error');
      return;
    }
    const requestId = ++searchRequest;
    const button = $('#map-search-button');
    button.disabled = true;
    setStatus('Searching for places…');
    try {
      const delay = Math.max(0, SEARCH_MIN_INTERVAL_MS - (Date.now() - lastSearchAt));
      if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
      lastSearchAt = Date.now();
      const url = new URL(SEARCH_URL);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(MAX_SEARCH_RESULTS));
      url.searchParams.set('lang', 'en');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      let response;
      try {
        response = await window.fetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
      }
      if (requestId !== searchRequest) return;
      if (!response.ok) throw new Error(`Search service returned HTTP ${response.status}.`);
      const payload = await response.json();
      if (requestId !== searchRequest) return;
      const features = Array.isArray(payload.features) ? payload.features : [];
      renderSearchResults(features);
    } catch (error) {
      if (requestId !== searchRequest) return;
      const message = error && error.name === 'AbortError'
        ? 'Address search timed out. Check your connection or place a pin manually.'
        : 'Address search could not connect. Check your connection or place a pin manually.';
      setStatus(message, 'error');
    } finally {
      if (requestId === searchRequest) button.disabled = false;
    }
  }

  function saveSelection() {
    if (mode !== 'select' || !selectedPoint) {
      setStatus('Choose a pin before saving the location.', 'error');
      return;
    }
    $('#latitude').value = selectedPoint.latitude.toFixed(6);
    $('#longitude').value = selectedPoint.longitude.toFixed(6);
    if (selectedPoint.label) $('#location-label').value = selectedPoint.label;
    $('#clear-location').hidden = false;
    $('#location-status').textContent = `Location added to this report · ${displayPoint(selectedPoint)}.`;
    $('#location-map-button-text').textContent = `Change pin · ${displayPoint(selectedPoint)}`;
    document.dispatchEvent(new CustomEvent('maplocationchange', { detail: { ...selectedPoint } }));
    const reportForm = $('#report-form');
    if (reportForm) reportForm.dispatchEvent(new Event('input', { bubbles: true }));
    closeModal();
  }

  function bindEvents() {
    $('#map-close').addEventListener('click', closeModal);
    $('#map-cancel').addEventListener('click', closeModal);
    $('#map-modal').addEventListener('click', (event) => { if (event.target === $('#map-modal')) closeModal(); });
    $('#map-save').addEventListener('click', saveSelection);
    $('#map-use-gps').addEventListener('click', locateCurrentPosition);
    $('#map-search-button').addEventListener('click', searchAddress);
    $('#map-search-query').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); searchAddress(); }
    });
    document.addEventListener('click', (event) => {
      const target = event.target && event.target.closest ? event.target : null;
      if (!target) return;
      const pinButton = target.closest('[data-map-pin]');
      if (pinButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openMarker(pinButton.dataset.lat, pinButton.dataset.lon, pinButton.dataset.mapLabel || '', pinButton.dataset.mapRadius);
        return;
      }
      if (target.closest('#open-location-map')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openPicker();
        return;
      }
      if (target.closest('#use-location')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openPicker({ locate: true });
        return;
      }
      if (target.closest('#clear-location')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        $('#latitude').value = '';
        $('#longitude').value = '';
        $('#clear-location').hidden = true;
        $('#location-status').textContent = 'Selected coordinates removed from this report.';
        $('#location-map-button-text').textContent = 'Choose location on map';
        const reportForm = $('#report-form');
        if (reportForm) reportForm.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, true);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#map-modal').hidden) closeModal(); });
  }

  bindEvents();
  window.WeSignalMap = { openPicker, openMarker, close: closeModal };
})();
