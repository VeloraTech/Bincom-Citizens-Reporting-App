(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const screens = [...document.querySelectorAll('.screen')];
  const labels = { roads:'Roads & walkways', waste:'Waste & sanitation', water:'Water', power:'Power & lighting', safety:'Safety', other:'Other' };
  const statuses = { submitted:'Submitted', acknowledged:'Acknowledged', in_progress:'In progress', resolved:'Resolved' };
  let session = null; let activeFilter = 'all'; let incidents = []; let returnScreen = 'report'; let authBusy = false;
  let authResolved = false; let startupResolved = false; let startupBusy = false; let authSubscription = null; let pendingStartupAuth = null;
  const escapeHtml = (v) => String(v || '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const date = (v) => v ? new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'Date unavailable';
  function setStartupProgress(value, text) {
    const bar = $('#initProgressBar');
    const label = $('#initStatusText');
    if (bar) { bar.setAttribute('aria-valuenow', String(value)); bar.firstElementChild.style.width = `${value}%`; }
    if (label) label.textContent = text;
  }
  function showWelcome() {
    $('#startup-splash').hidden = true;
    $('#app-shell').hidden = true;
    $('#screen-onboarding').hidden = false;
  }
  function showApplication(name) {
    $('#startup-splash').hidden = true;
    $('#screen-onboarding').hidden = true;
    $('#app-shell').hidden = false;
    showScreen(name || 'feed');
    if ((name || 'feed') === 'feed') loadFeed();
  }
  function showStartupFailure(message) {
    $('#startup-error-message').textContent = message;
    $('#startup-error').hidden = false;
    $('#startup-guest').hidden = false;
    setStartupProgress(100, 'Could not check sign-in status');
  }
  function isInvalidSessionError(error) {
    const status = Number(error && error.status);
    const detail = `${error && error.name || ''} ${error && error.code || ''} ${error && error.message || ''}`.toLowerCase();
    return status === 401 || status === 403 || /invalid[_ -]?(jwt|token|grant)|jwt[_ -]?expired|refresh token.*not found|session.*missing/.test(detail);
  }
  function completeOnboarding() { showApplication('feed'); }
  function handleAuthStateChange(event, nextSession) {
    if (event === 'INITIAL_SESSION') return;
    if (!startupResolved) { pendingStartupAuth = { event, session: nextSession || null }; return; }
    if (event === 'SIGNED_OUT') {
      authResolved = true;
      updateSession(null);
      showWelcome();
      return;
    }
    if (nextSession) {
      authResolved = true;
      updateSession(nextSession);
      if ($('#app-shell').hidden) setTimeout(() => showApplication('feed'), 0);
    }
  }
  async function initializeStartup() {
    if (startupBusy) return;
    startupBusy = true;
    $('#startup-error').hidden = true;
    setStartupProgress(16, 'Starting WeSignal');
    try {
      if (!authSubscription) {
        const listener = window.BincomData.onAuthStateChange(handleAuthStateChange);
        authSubscription = listener && listener.data && listener.data.subscription;
      }
      if (!window.BincomData.isConfigured()) throw new Error(window.BincomData.configurationMessage());
      setStartupProgress(42, 'Restoring sign-in state');
      const restored = await window.BincomData.getSession();
      if (restored.error) throw restored.error;
      let current = restored.data && restored.data.session || null;
      if (!current && pendingStartupAuth && pendingStartupAuth.session && pendingStartupAuth.event === 'SIGNED_IN') current = pendingStartupAuth.session;
      if (pendingStartupAuth && pendingStartupAuth.event === 'SIGNED_OUT') current = null;
      if (current) {
        setStartupProgress(68, 'Verifying your account');
        const verified = await window.BincomData.getUser();
        if (verified.error) {
          if (!isInvalidSessionError(verified.error)) throw verified.error;
          await window.BincomData.clearLocalSession();
          current = null;
        } else if (!verified.data || !verified.data.user) {
          await window.BincomData.clearLocalSession();
          current = null;
        } else current = { ...current, user: verified.data.user };
      }
      if (pendingStartupAuth && pendingStartupAuth.event === 'SIGNED_OUT') current = null;
      pendingStartupAuth = null;
      authResolved = true;
      startupResolved = true;
      updateSession(current);
      setStartupProgress(92, current ? 'Opening Explore' : 'Preparing welcome');
      if (current) showApplication('feed');
      else showWelcome();
    } catch (error) {
      // Keep any persisted session intact; a network or initialization failure is not proof of sign-out.
      authResolved = false;
      startupResolved = false;
      updateSession(null);
      const message = error && error.message && /not configured|could not be initialized/i.test(error.message)
        ? error.message
        : 'We couldn’t verify your sign-in. Check your connection and try again. Your saved session has not been cleared.';
      showStartupFailure(message);
    } finally { startupBusy = false; }
  }
  function showScreen(name) { screens.forEach((s) => { const on=s.id===`screen-${name}`; s.hidden=!on; s.classList.toggle('is-active',on); }); document.body.classList.toggle('form-active',name==='report'||name==='auth'); document.body.classList.remove('keyboard-open'); document.querySelectorAll('[data-screen]').forEach((n)=>n.classList.toggle('is-selected',n.dataset.screen===name)); if(name==='report') updateGate(); if(name==='reports') loadReports(); window.scrollTo({top:0,behavior:'smooth'}); }
  function state(el,title,body,retry) { el.innerHTML=`<h3>${title}</h3><p>${body}</p>${retry?'<button class="secondary-button retry-button" type="button">Try again</button>':''}`; if(retry) el.querySelector('button').addEventListener('click',retry); }
  function renderFilters() { const el=$('#category-filters'); el.innerHTML=['all',...Object.keys(labels)].map((k)=>`<button class="filter-chip${activeFilter===k?' active':''}" type="button" data-filter="${k}" aria-pressed="${activeFilter===k}">${k==='all'?'All incidents':labels[k]}</button>`).join(''); el.querySelectorAll('[data-filter]').forEach((b)=>b.addEventListener('click',()=>{activeFilter=b.dataset.filter;$('#reset-filter').hidden=activeFilter==='all';renderFilters();renderIncidents();})); }
  function renderIncidents() { const list=$('#incident-list'); const rows=activeFilter==='all'?incidents:incidents.filter((i)=>i.category===activeFilter); list.innerHTML=rows.map((i)=>`<li class="incident-card"><button type="button" data-incident="${escapeHtml(i.id)}"><div class="incident-top"><span class="chip">${escapeHtml(labels[i.category]||i.category)}</span><span class="chip status-chip">${escapeHtml(statuses[i.status]||i.status||'Published')}</span></div><h3>${escapeHtml(i.title)}</h3><p class="incident-excerpt">${escapeHtml((i.description||'').slice(0,150))}${(i.description||'').length>150?'…':''}</p><div class="incident-meta"><span>${date(i.created_at)}</span>${i.location_label?`<span>· ${escapeHtml(i.location_label)}</span>`:''}<span class="arrow">→</span></div></button></li>`).join(''); list.querySelectorAll('[data-incident]').forEach((b)=>b.addEventListener('click',()=>openDetail(b.dataset.incident))); const st=$('#feed-state'); if(!rows.length) { st.hidden=false; state(st,'No incidents in this category','Try another category or reset the filter to see all published incidents.'); } else st.hidden=true; }
  async function loadFeed() { const st=$('#feed-state'); st.hidden=false; st.innerHTML='<div class="skeleton" aria-label="Loading incidents"></div>'; $('#incident-list').innerHTML=''; if(!window.BincomData.isConfigured()) { state(st,'Public feed is not connected',window.BincomData.configurationMessage()); return; } const r=await window.BincomData.listPublicReports(); if(r.error) { state(st,'We could not load incidents','Check your connection and try again. Published incidents have not been replaced with sample content.',loadFeed); return; } incidents=r.data||[]; renderIncidents(); }
  async function openDetail(id) { showScreen('detail'); const target=$('#detail-content'); target.innerHTML='<div class="state-card"><div class="skeleton"></div></div>'; const fallback=incidents.find((i)=>i.id===id); if(!fallback){state(target,'Incident unavailable','This published incident could not be found. Return to the feed and try again.');return;} const r=await window.BincomData.getPublicReport(id); const i=r.data||fallback; if(r.error&&!i){state(target,'Incident unavailable','This incident may no longer be published. Return to the feed and try again.');return;} target.innerHTML=`<article><div class="detail-hero"><span class="chip">${escapeHtml(labels[i.category]||i.category)}</span><h2 id="detail-title">${escapeHtml(i.title)}</h2><span class="detail-date">${date(i.created_at)}</span></div><div class="detail-body"><h3>Status</h3><p><span class="chip status-chip">${escapeHtml(statuses[i.status]||i.status||'Published')}</span></p><h3>What was reported</h3><p>${escapeHtml(i.description)}</p>${i.location_label?`<h3>Location</h3><p>${escapeHtml(i.location_label)}</p>`:''}</div></article>`; }
  function authMessage(text,type){const n=$('#auth-message');n.textContent=text;n.className=type?`form-message ${type}`:'form-message';}
  function updateSession(next){session=next||null;$('#sign-out').hidden=!session;$('#auth-form').hidden=!!session;$('#auth-title').textContent=session?'Your account':'Sign in to report';updateGate();}
  function updateGate(){ $('#report-gate').hidden=!!session; }
  function openAuth(from){returnScreen=from||'report';showScreen('auth');}
  async function authenticate(action){if(authBusy)return;const d=Object.fromEntries(new FormData($('#auth-form')).entries());if(!d.email||!d.email.includes('@')||!d.password||d.password.length<6){authMessage('Enter a valid email and a password with at least 6 characters.','error');return;}authBusy=true;const bs=[...$('#auth-form').querySelectorAll('button')];bs.forEach((b)=>{b.disabled=true;b.dataset.label=b.textContent;b.textContent='Working…';});const r=action==='signup'?await window.BincomData.signUp(d.email.trim(),d.password):await window.BincomData.signIn(d.email.trim(),d.password);bs.forEach((b)=>{b.disabled=false;b.textContent=b.dataset.label;});authBusy=false;if(r.error){authMessage(r.error.message||'Authentication failed. Try again.','error');return;}if(action==='signup'&&!r.data.session){authMessage('Account created. Check your email to confirm it, then sign in.','success');return;}startupResolved=true;authResolved=true;pendingStartupAuth=null;updateSession(r.data.session);authMessage('You are signed in.','success');showScreen(returnScreen);}
  function formMessage(text,type){const n=$('#form-message');n.textContent=text;n.className=type?`form-message ${type}`:'form-message';}
  function validate(d){if(!d.title||d.title.trim().length<3)return'Add a short title with at least 3 characters.';if(!d.category)return'Choose a category.';if(!d.description||d.description.trim().length<10)return'Add at least 10 characters describing the issue.';return'';}
  async function submitReport(e){e.preventDefault();formMessage('','');const d=Object.fromEntries(new FormData($('#report-form')).entries());const err=validate(d);if(err){formMessage(err,'error');return;}if(!session){formMessage('Sign in is required before submitting a report. No report was sent.','error');openAuth('report');return;}if(!window.BincomData.isConfigured()){formMessage(window.BincomData.configurationMessage()+' Nothing was sent.','error');return;}const b=$('#report-form button[type="submit"]');b.disabled=true;b.textContent='Submitting…';const r=await window.BincomData.createReport({title:d.title.trim(),category:d.category,description:d.description.trim(),location_label:d.location_label.trim()||null,latitude:d.latitude?Number(d.latitude):null,longitude:d.longitude?Number(d.longitude):null});b.disabled=false;b.innerHTML='Submit report <span aria-hidden="true">→</span>';if(r.error){formMessage(`The report was not sent: ${r.error.message}`,'error');return;}formMessage('Report submitted securely. It is private until an authorized workflow publishes it.','success');$('#report-form').reset();$('#description-count').textContent='0';$('#location-status').textContent='';}
  async function loadReports(){const st=$('#reports-state');$('#reports-list').innerHTML='';st.hidden=false;if(!session){state(st,'Sign in to view your reports','Your private submitted reports are only available to your account.');return;}if(!window.BincomData.isConfigured()){state(st,'Reports are not connected',window.BincomData.configurationMessage());return;}st.innerHTML='<div class="skeleton" aria-label="Loading reports"></div>';const r=await window.BincomData.listReports();if(r.error){state(st,'We could not load your reports','Check your connection and try again.',loadReports);return;}if(!r.data.length){state(st,'No reports yet','Reports you submit from this account will appear here.');return;}st.hidden=true;$('#reports-list').innerHTML=r.data.map((i)=>`<li class="incident-card"><div class="incident-top"><span class="chip">${escapeHtml(labels[i.category]||i.category)}</span><span class="chip status-chip">${escapeHtml(statuses[i.status]||i.status)}</span></div><h3>${escapeHtml(i.title)}</h3><div class="incident-meta"><span>${date(i.created_at)}</span>${i.location_label?`<span>· ${escapeHtml(i.location_label)}</span>`:''}</div></li>`).join('');}
  document.addEventListener('focusin',(e)=>{if(e.target.matches('input:not([type="hidden"]),textarea')){document.body.classList.add('keyboard-open');setTimeout(()=>e.target.scrollIntoView({block:'center',behavior:'smooth'}),250);}});
  document.addEventListener('focusout',(e)=>{if(e.target.matches('input,textarea'))setTimeout(()=>{if(!document.activeElement.matches('input:not([type="hidden"]),textarea'))document.body.classList.remove('keyboard-open');},100);});
  if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>{if(window.visualViewport.height<window.innerHeight-140)document.body.classList.add('keyboard-open');else document.body.classList.remove('keyboard-open');});
  $('#get-started').addEventListener('click',completeOnboarding);$('#skip-onboarding').addEventListener('click',completeOnboarding);document.querySelectorAll('[data-screen]').forEach((b)=>b.addEventListener('click',()=>showScreen(b.dataset.screen)));$('#header-account').addEventListener('click',()=>openAuth('feed'));$('#detail-back').addEventListener('click',()=>showScreen('feed'));$('#auth-back').addEventListener('click',()=>showScreen(returnScreen));$('#report-back').addEventListener('click',()=>showScreen('feed'));$('#reset-filter').addEventListener('click',()=>{activeFilter='all';$('#reset-filter').hidden=true;renderFilters();renderIncidents();});$('#refresh-reports').addEventListener('click',loadReports);$('#auth-form').addEventListener('submit',(e)=>{e.preventDefault();authenticate('signin');});$('[data-auth-action="signup"]').addEventListener('click',()=>authenticate('signup'));$('#sign-out').addEventListener('click',async()=>{const r=await window.BincomData.signOut();if(r.error)authMessage(r.error.message,'error');else{authResolved=true;updateSession(null);showWelcome();}});$('#gate-login').addEventListener('click',()=>openAuth('report'));$('#gate-signup').addEventListener('click',()=>openAuth('report'));$('#report-form').addEventListener('submit',submitReport);$('#description').addEventListener('input',()=>$('#description-count').textContent=$('#description').value.length);$('#use-location').addEventListener('click',()=>{if(!navigator.geolocation){$('#location-status').textContent='Location is not available on this device.';return;}$('#location-status').textContent='Requesting location permission…';navigator.geolocation.getCurrentPosition((p)=>{$('#latitude').value=p.coords.latitude;$('#longitude').value=p.coords.longitude;$('#location-status').textContent='Location added to this report.';},()=>{$('#location-status').textContent='Location permission was not granted. You can enter a landmark instead.';},{enableHighAccuracy:false,timeout:10000});});
  $('#startup-retry').addEventListener('click', initializeStartup);
  $('#startup-guest').addEventListener('click', () => showApplication('feed'));
  (function init() { renderFilters(); initializeStartup(); }());
})();
