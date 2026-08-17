import { supabase } from './supabase.js';
import {
  normalizeTrackingNumber,
  isTrackingNumberValid,
  normalizeShipmentStatus,
  getShipmentStatusDisplayValue,
  getFriendlyErrorMessage,
  formatDateTimeDisplay,
  evaluateAdminAccess
} from '../../js/shared-contract.js';

// Supabase-based admin dashboard

// Utilities
function el(id){return document.getElementById(id)}
function showToast(msg){
  const t = document.createElement('div'); t.className='toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(()=>t.remove(),3500);
}

// Protect admin pages
supabase.auth.onAuthStateChange(async (event, session) => {
  const user = session?.user ?? null;
  if (!user) {
    if (!location.pathname.endsWith('/admin/login.html')) location.href = '/admin/login.html';
    return;
  }
  await handleAdminSession(user, session);
});

(async function(){
  const { data, error } = await supabase.auth.getSession();
  if (error){ console.error('Supabase session check failed', error); return; }
  await handleAdminSession(data?.session?.user ?? null, data?.session ?? null);
})();

async function handleAdminSession(user, session = null){
  const path = location.pathname;
  if (!user || !session){
    if (!path.endsWith('/admin/login.html')) location.href = '/admin/login.html';
    return;
  }

  const { data, error } = await supabase.from('admin_profiles').select('role').eq('user_id', user.id).maybeSingle();
  if (error){ console.error('admin profile check failed', error); await supabase.auth.signOut(); location.href = '/admin/login.html?reason=profile_error'; return; }

  const verdict = evaluateAdminAccess({ user, session, adminProfile: data, expiresAt: session.expires_at });
  if (!verdict.canAccessAdmin) {
    await supabase.auth.signOut();
    if (!path.endsWith('/admin/login.html')) location.href = '/admin/login.html?reason=' + verdict.reason;
    return;
  }

  if (path.endsWith('/admin/login.html')) location.href = '/admin/dashboard.html';
  initAdmin();
}

// Initialize admin features when authenticated
async function initAdmin(){
  const path = location.pathname;
  const pageKey = path.endsWith('/admin/dashboard.html')
    ? 'dashboard'
    : path.endsWith('/admin/create.html')
      ? 'create'
      : path.endsWith('/admin/edit.html')
        ? 'edit'
        : null;

  if (!pageKey) return;
  if (window.__delivioAdminPageInit === pageKey) return;
  window.__delivioAdminPageInit = pageKey;

  if (path.endsWith('/admin/dashboard.html')) dashboardPage();
  if (path.endsWith('/admin/create.html')) createPage();
  if (path.endsWith('/admin/edit.html')) editPage();
}

// Generate tracking ID like TRE-XXXX-XXXX-XXXX
function generateTrackingId(){
  const rnd = ()=>Math.floor(Math.random()*9000)+1000;
  const year = new Date().getFullYear();
  return `TRE-${year}-${rnd()}-${rnd()}`;
}

function normalizeAdminStatusInput(value){
  const normalized = normalizeShipmentStatus(value);
  return normalized || 'shipment_created';
}

// Ensure uniqueness by checking the shipments table
async function uniqueTrackingId(){
  for (let i=0;i<6;i++){
    const id = generateTrackingId();
    const { data, error } = await supabase.from('shipments').select('id').eq('tracking_number', id).limit(1);
    if (error){ console.error('uniqueTrackingId check failed', error); return id; }
    if (!data || data.length === 0) return id;
  }
  return generateTrackingId()+"-"+Date.now();
}

// Dashboard page
async function dashboardPage(){
  const createBtn = document.getElementById('create-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const quickCreate = document.getElementById('quick-create');
  const quickRefresh = document.getElementById('quick-refresh');
  const quickExceptions = document.getElementById('quick-exceptions');
  const viewAllBtn = document.getElementById('view-all-btn');
  const dashboardLoading = document.getElementById('dashboard-loading');
  const dashboardContent = document.getElementById('dashboard-content');
  const dashboardBanner = document.getElementById('dashboard-banner');
  const activityList = document.getElementById('activity-list');
  const statusDistribution = document.getElementById('status-distribution');
  const recentShipments = document.getElementById('recent-shipments');
  const alertsList = document.getElementById('alerts-list');
  const alertsCount = document.getElementById('alerts-count');
  const activityMeta = document.getElementById('activity-meta');

  const summaryTotal = document.getElementById('summary-total');
  const summaryPending = document.getElementById('summary-pending');
  const summaryInTransit = document.getElementById('summary-intransit');
  const summaryOutForDelivery = document.getElementById('summary-out-for-delivery');
  const summaryDelivered = document.getElementById('summary-delivered');
  const summaryException = document.getElementById('summary-exception');

  let rows = [];
  let lastError = null;

  const handlers = {
    create: () => { location.href = 'create.html'; },
    refresh: async () => { await loadDashboard(); },
    exceptions: () => {
      const exceptionRows = rows.filter(r => normalizeShipmentStatus(r.status) === 'exception');
      if (!exceptionRows.length) {
        setBanner('No exception shipments currently require attention.', 'info');
        return;
      }
      const first = exceptionRows[0];
      location.href = `edit.html?id=${first.id}`;
    },
    viewAll: () => { location.href = 'dashboard.html#dashboard-content'; }
  };

  [createBtn, quickCreate].forEach(btn => btn?.addEventListener('click', handlers.create));
  [logoutBtn].forEach(btn => btn?.addEventListener('click', async () => { await import('./auth.js').then(m => m.logout()); }));
  [refreshBtn, quickRefresh].forEach(btn => btn?.addEventListener('click', handlers.refresh));
  quickExceptions?.addEventListener('click', handlers.exceptions);
  viewAllBtn?.addEventListener('click', () => { location.href = 'dashboard.html'; });

  function setBanner(message, type = 'info') {
    if (!dashboardBanner) return;
    dashboardBanner.textContent = message;
    dashboardBanner.className = `dashboard-banner ${type}`;
    dashboardBanner.classList.remove('hidden');
  }

  function hideBanner() {
    if (!dashboardBanner) return;
    dashboardBanner.className = 'dashboard-banner hidden';
    dashboardBanner.textContent = '';
  }

  function showDashboardLoading(show) {
    if (dashboardLoading) dashboardLoading.classList.toggle('hidden', !show);
    if (dashboardContent) dashboardContent.classList.toggle('hidden', show);
  }

  function statusKey(value) {
    return normalizeShipmentStatus(value) || 'shipment_created';
  }

  function renderStatusDistribution() {
    const distribution = [
      'shipment_created',
      'picked_up',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'exception',
      'cancelled'
    ];

    const total = rows.length || 1;
    const items = distribution.map(key => {
      const count = rows.filter(r => statusKey(r.status) === key).length;
      const percent = Math.round((count / total) * 100);
      return {
        key,
        count,
        percent,
        label: getShipmentStatusDisplayValue(key)
      };
    }).filter(item => item.count > 0 || item.key === 'shipment_created');

    if (!statusDistribution) return;
    statusDistribution.innerHTML = items.map(item => `
      <div class="distribution-item">
        <div class="distribution-header">
          <span>${escapeHtml(item.label)}</span>
          <strong>${item.count}</strong>
        </div>
        <div class="distribution-bar"><span style="width:${item.percent}%"></span></div>
      </div>
    `).join('');
  }

  function renderActivity() {
    if (!activityList) return;

    const recentEvents = rows
      .filter(r => r.updated_at || r.created_at)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 6)
      .map(row => ({
        shipment: row,
        status: statusKey(row.status),
        time: row.updated_at || row.created_at
      }));

    if (!recentEvents.length) {
      activityList.innerHTML = '<li class="empty-row">No shipment activity available yet.</li>';
      if (activityMeta) activityMeta.textContent = 'No activity';
      return;
    }

    activityList.innerHTML = recentEvents.map(item => `
      <li>
        <div class="activity-dot ${item.status}"></div>
        <div>
          <strong>${escapeHtml(item.shipment.tracking_number || 'Shipment')}</strong>
          <div>${escapeHtml(getShipmentStatusDisplayValue(item.shipment.status))}</div>
        </div>
        <time>${escapeHtml(formatDateTimeDisplay(item.time))}</time>
      </li>
    `).join('');

    if (activityMeta) activityMeta.textContent = `${recentEvents.length} recent updates`;
  }

  function renderRecentShipments() {
    if (!recentShipments) return;

    const items = [...rows]
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 5);

    if (!items.length) {
      recentShipments.innerHTML = '<div class="empty-row">No shipments available.</div>';
      return;
    }

    recentShipments.innerHTML = items.map(row => `
      <div class="shipment-row" data-shipment-id="${row.id}">
        <div>
          <strong>${escapeHtml(row.tracking_number || '—')}</strong>
          <div class="shipment-meta">${escapeHtml(row.recipient_name || row.receiver_name || row.sender_name || 'No recipient')}</div>
        </div>
        <div class="shipment-status">
          <span class="status-badge ${statusKey(row.status)}">${escapeHtml(getShipmentStatusDisplayValue(row.status))}</span>
        </div>
      </div>
    `).join('');

    recentShipments.querySelectorAll('[data-shipment-id]').forEach(item => {
      item.addEventListener('click', () => {
        const target = rows.find(r => r.id === item.dataset.shipmentId);
        if (!target) return;
        location.href = `edit.html?id=${target.id}`;
      });
    });
  }

  function renderAlerts() {
    if (!alertsList || !alertsCount) return;

    const exceptions = rows.filter(r => statusKey(r.status) === 'exception');
    const pending = rows.filter(r => statusKey(r.status) === 'shipment_created');
    const late = rows.filter(r => {
      const eta = r.estimated_delivery ? new Date(r.estimated_delivery) : null;
      return eta && eta < new Date() && statusKey(r.status) !== 'delivered' && statusKey(r.status) !== 'cancelled';
    });

    const alerts = [
      ...exceptions.map(row => ({ type: 'exception', title: `${row.tracking_number || 'Shipment'} needs review`, detail: 'Exception status requires operational follow-up.', id: row.id })),
      ...pending.map(row => ({ type: 'pending', title: `${row.tracking_number || 'Shipment'} is awaiting pickup`, detail: 'The shipment has been created but has not moved yet.', id: row.id })),
      ...late.map(row => ({ type: 'late', title: `${row.tracking_number || 'Shipment'} is behind ETA`, detail: 'Estimated delivery has passed and the shipment is not delivered yet.', id: row.id }))
    ].slice(0, 5);

    alertsCount.textContent = `${alerts.length} item${alerts.length === 1 ? '' : 's'}`;

    if (!alerts.length) {
      alertsList.innerHTML = '<div class="empty-row">No current operational alerts.</div>';
      return;
    }

    alertsList.innerHTML = alerts.map(alert => `
      <div class="alert-item ${alert.type}">
        <strong>${escapeHtml(alert.title)}</strong>
        <p>${escapeHtml(alert.detail)}</p>
      </div>
    `).join('');
  }

  function renderKpis() {
    const counts = {
      total: rows.length,
      pending: rows.filter(r => statusKey(r.status) === 'shipment_created').length,
      in_transit: rows.filter(r => statusKey(r.status) === 'in_transit').length,
      out_for_delivery: rows.filter(r => statusKey(r.status) === 'out_for_delivery').length,
      delivered: rows.filter(r => statusKey(r.status) === 'delivered').length,
      exception: rows.filter(r => statusKey(r.status) === 'exception').length
    };

    if (summaryTotal) summaryTotal.textContent = String(counts.total);
    if (summaryPending) summaryPending.textContent = String(counts.pending);
    if (summaryInTransit) summaryInTransit.textContent = String(counts.in_transit);
    if (summaryOutForDelivery) summaryOutForDelivery.textContent = String(counts.out_for_delivery);
    if (summaryDelivered) summaryDelivered.textContent = String(counts.delivered);
    if (summaryException) summaryException.textContent = String(counts.exception);
  }

  async function loadDashboard() {
    showDashboardLoading(true);
    hideBanner();
    lastError = null;

    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      rows = Array.isArray(data) ? data : [];
      renderKpis();
      renderStatusDistribution();
      renderActivity();
      renderRecentShipments();
      renderAlerts();
      showDashboardLoading(false);

      if (!rows.length) {
        setBanner('No shipments are available yet. Create one to get started.', 'info');
      }
    } catch (err) {
      console.error('dashboard load failed', err);
      lastError = err;
      showDashboardLoading(false);
      setBanner(getFriendlyErrorMessage(err, 'Shipment data could not be loaded right now. Please try again.'), 'error');
      if (activityList) activityList.innerHTML = '<li class="empty-row">Shipment activity unavailable.</li>';
      if (statusDistribution) statusDistribution.innerHTML = '<div class="empty-row">Status distribution unavailable.</div>';
      if (recentShipments) recentShipments.innerHTML = '<div class="empty-row">Recent shipments unavailable.</div>';
      if (alertsList) alertsList.innerHTML = '<div class="empty-row">Alerts unavailable.</div>';
    }
  }

  createBtn?.addEventListener('click', () => { location.href = 'create.html'; });
  refreshBtn?.addEventListener('click', loadDashboard);
  quickCreate?.addEventListener('click', () => { location.href = 'create.html'; });
  quickRefresh?.addEventListener('click', loadDashboard);
  quickExceptions?.addEventListener('click', () => {
    const exceptionRows = rows.filter(r => statusKey(r.status) === 'exception');
    if (!exceptionRows.length) {
      setBanner('No exception shipments are active right now.', 'info');
      return;
    }
    location.href = `edit.html?id=${exceptionRows[0].id}`;
  });

  await loadDashboard();
}

// Create page
function createPage(){
  const form = el('create-form');
  const msg = el('msg');
  if (!form) return;
  if (form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  const setMessage = (text, type = 'error') => {
    if (!msg) return;
    msg.textContent = text;
    msg.className = `form-message ${type}`;
  };

  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton?.textContent || 'Create Shipment';
  const trackingInput = el('tracking_number');
  const statusSelect = el('status');

  const toggleSubmitState = (submitting) => {
    if (!submitButton) return;
    submitButton.disabled = submitting;
    submitButton.textContent = submitting ? 'Creating…' : originalText;
  };

  if (trackingInput) {
    trackingInput.addEventListener('input', () => {
      const value = normalizeTrackingNumber(trackingInput.value);
      trackingInput.value = value;
      const invalid = value && !isTrackingNumberValid(value);
      trackingInput.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      trackingInput.setCustomValidity(invalid ? 'Use the format TRE-1234-5678-9012.' : '');
    });
  }

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (submitButton && submitButton.disabled) return;

    const tracking_number = normalizeTrackingNumber(el('tracking_number')?.value || '');
    const sender_name = el('sender_name')?.value.trim() || '';
    const recipient_name = el('recipient_name')?.value.trim() || '';
    const origin = el('origin')?.value.trim() || '';
    const destination = el('destination')?.value.trim() || '';
    const status = normalizeAdminStatusInput(el('status')?.value || 'shipment_created');

    if (!tracking_number || !isTrackingNumberValid(tracking_number)) {
      setMessage('Enter a valid tracking number in the format TRE-1234-5678-9012.', 'error');
      trackingInput?.setAttribute('aria-invalid', 'true');
      trackingInput?.focus();
      trackingInput?.reportValidity?.();
      return;
    }

    if (!sender_name || !recipient_name || !origin || !destination) {
      setMessage('Please complete the required sender, recipient, origin, and destination fields.', 'error');
      form.reportValidity();
      return;
    }

    toggleSubmitState(true);
    setMessage('', 'error');

    try {
      const { data: existing, error: lookupError } = await supabase
        .from('shipments')
        .select('id')
        .eq('tracking_number', tracking_number)
        .limit(1);

      if (lookupError) throw lookupError;
      if (existing && existing.length > 0) {
        setMessage('A shipment with this tracking number already exists. Use a different tracking number.', 'warning');
        return;
      }

      const payload = {
        tracking_number,
        sender_name,
        sender_company: el('sender_company')?.value.trim() || null,
        sender_phone: el('sender_phone')?.value.trim() || null,
        sender_email: el('sender_email')?.value.trim() || null,
        sender_address_line_1: el('sender_address_line_1')?.value.trim() || null,
        sender_address_line_2: el('sender_address_line_2')?.value.trim() || null,
        sender_city: el('sender_city')?.value.trim() || null,
        sender_state: el('sender_state')?.value.trim() || null,
        sender_postal_code: el('sender_postal_code')?.value.trim() || null,
        sender_country: el('sender_country')?.value.trim() || null,
        receiver_name: recipient_name,
        recipient_name,
        recipient_company: el('recipient_company')?.value.trim() || null,
        recipient_phone: el('recipient_phone')?.value.trim() || null,
        recipient_email: el('recipient_email')?.value.trim() || null,
        recipient_address_line_1: el('recipient_address_line_1')?.value.trim() || null,
        recipient_address_line_2: el('recipient_address_line_2')?.value.trim() || null,
        recipient_city: el('recipient_city')?.value.trim() || null,
        recipient_state: el('recipient_state')?.value.trim() || null,
        recipient_postal_code: el('recipient_postal_code')?.value.trim() || null,
        recipient_country: el('recipient_country')?.value.trim() || null,
        origin,
        destination,
        status,
        estimated_delivery: el('estimated_delivery')?.value ? new Date(el('estimated_delivery').value + 'T00:00:00Z').toISOString() : null,
        carrier: el('carrier')?.value.trim() || null,
        service: el('service')?.value.trim() || null,
        shipment_date: el('shipment_date')?.value ? new Date(el('shipment_date').value + 'T00:00:00Z').toISOString() : null,
        actual_delivery: null,
        package_type: el('package_type')?.value.trim() || null,
        package_description: el('package_description')?.value.trim() || null,
        quantity: (el('quantity')?.value !== '' && el('quantity')?.value !== null) ? Number(el('quantity').value) : null,
        weight_kg: (el('weight_kg')?.value !== '' && el('weight_kg')?.value !== null) ? Number(el('weight_kg').value) : null,
        length_cm: (el('length_cm')?.value !== '' && el('length_cm')?.value !== null) ? Number(el('length_cm').value) : null,
        width_cm: (el('width_cm')?.value !== '' && el('width_cm')?.value !== null) ? Number(el('width_cm').value) : null,
        height_cm: (el('height_cm')?.value !== '' && el('height_cm')?.value !== null) ? Number(el('height_cm').value) : null,
        declared_value: (el('declared_value')?.value !== '' && el('declared_value')?.value !== null) ? Number(el('declared_value').value) : null,
        special_instructions: el('special_instructions')?.value.trim() || null,
        event_location: el('event_location')?.value.trim() || null,
        event_description: el('event_description')?.value.trim() || null,
        event_time: new Date().toISOString()
      };

      const { data, error } = await supabase.rpc('admin_create_shipment', payload);
      if (error) throw error;

      setMessage('Shipment created successfully. Redirecting to the dashboard…', 'success');
      showToast('Shipment created');

      setTimeout(() => {
        location.href = 'dashboard.html';
      }, 700);
    } catch (err) {
      console.error(err);
      const friendly = getFriendlyErrorMessage(err, 'Unable to create the shipment right now. Please try again.');
      setMessage(friendly, 'error');
      if (trackingInput && (!tracking_number || !isTrackingNumberValid(tracking_number))) {
        trackingInput.setAttribute('aria-invalid', 'true');
      }
      if (statusSelect && !statusSelect.value) {
        statusSelect.setAttribute('aria-invalid', 'true');
      }
    } finally {
      toggleSubmitState(false);
    }
  });
}

// Edit page
async function editPage(){
  const id = new URLSearchParams(location.search).get('id');
  const form = el('edit-form');
  const msg = el('msg');
  const deleteBtn = el('delete-shipment-btn');
  if (!id || !form){ msg && (msg.textContent = 'Missing shipment id'); return; }
  if (form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  const setMessage = (text, type = 'error') => {
    if (!msg) return;
    if (!text) {
      msg.textContent = '';
      msg.className = 'form-message';
      return;
    }
    msg.textContent = text;
    msg.className = `form-message ${type}`;
  };

  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton?.textContent || 'Save Changes';

  const setFieldValue = (fieldId, value) => {
    const field = el(fieldId);
    if (!field) return;
    field.value = value ?? '';
  };

  let currentShipment = null;

  setMessage('Loading shipment details…', 'info');

  try{
    const { data, error } = await supabase.from('shipments').select('*').eq('id', id).single();
    if (error) throw error;
    currentShipment = data;

    setFieldValue('trackingId', data.tracking_number || '');
    setFieldValue('carrier', data.carrier || '');
    setFieldValue('service', data.service || '');
    setFieldValue('status', normalizeShipmentStatus(data.status || '') || 'shipment_created');
    setFieldValue('shipment_date', data.shipment_date ? new Date(data.shipment_date).toISOString().slice(0, 10) : '');
    setFieldValue('estimated_delivery', data.estimated_delivery ? new Date(data.estimated_delivery).toISOString().slice(0, 10) : '');
    setFieldValue('actual_delivery', data.actual_delivery ? new Date(data.actual_delivery).toISOString().slice(0, 10) : '');

    setFieldValue('sender_name', data.sender_name || '');
    setFieldValue('sender_company', data.sender_company || '');
    setFieldValue('sender_phone', data.sender_phone || '');
    setFieldValue('sender_email', data.sender_email || '');
    setFieldValue('sender_address_line_1', data.sender_address_line_1 || '');
    setFieldValue('sender_address_line_2', data.sender_address_line_2 || '');
    setFieldValue('sender_city', data.sender_city || '');
    setFieldValue('sender_state', data.sender_state || '');
    setFieldValue('sender_postal_code', data.sender_postal_code || '');
    setFieldValue('sender_country', data.sender_country || '');

    setFieldValue('recipient_name', data.recipient_name || data.receiver_name || '');
    setFieldValue('recipient_company', data.recipient_company || '');
    setFieldValue('recipient_phone', data.recipient_phone || '');
    setFieldValue('recipient_email', data.recipient_email || '');
    setFieldValue('recipient_address_line_1', data.recipient_address_line_1 || '');
    setFieldValue('recipient_address_line_2', data.recipient_address_line_2 || '');
    setFieldValue('recipient_city', data.recipient_city || '');
    setFieldValue('recipient_state', data.recipient_state || '');
    setFieldValue('recipient_postal_code', data.recipient_postal_code || '');
    setFieldValue('recipient_country', data.recipient_country || '');

    setFieldValue('origin', data.origin || '');
    setFieldValue('destination', data.destination || '');
    setFieldValue('package_type', data.package_type || '');
    setFieldValue('package_description', data.package_description || '');
    setFieldValue('quantity', data.quantity ?? '');
    setFieldValue('weight_kg', data.weight_kg ?? '');
    setFieldValue('length_cm', data.length_cm ?? '');
    setFieldValue('width_cm', data.width_cm ?? '');
    setFieldValue('height_cm', data.height_cm ?? '');
    setFieldValue('declared_value', data.declared_value ?? '');
    setFieldValue('special_instructions', data.special_instructions || '');

    const { data: eventData } = await supabase.from('tracking_events').select('*').eq('shipment_id', id).order('event_time', { ascending: true });
    const list = el('tracking-events');
    if (list) {
      if (!eventData || eventData.length === 0) {
        list.innerHTML = '<div class="empty-state">No tracking events recorded.</div>';
      } else {
        list.innerHTML = eventData.map(event => `
          <div class="tracking-event-item">
            <strong>${escapeHtml(getShipmentStatusDisplayValue(event.status))}</strong>
            <div class="muted">${escapeHtml(event.event_time ? formatDateTimeDisplay(event.event_time) : '—')}</div>
            ${event.location ? `<div class="muted">${escapeHtml(event.location)}</div>` : ''}
            ${event.description ? `<div class="muted">${escapeHtml(event.description)}</div>` : ''}
          </div>
        `).join('');
      }
    }
  }catch(err){
    console.error(err);
    const friendly = getFriendlyErrorMessage(err, 'Unable to load shipment details right now.');
    setMessage(friendly, 'error');
  }

  deleteBtn?.addEventListener('click', async ()=>{
    if (!currentShipment) return;
    const confirmed = window.confirm(`Delete shipment ${currentShipment.tracking_number}? This action is destructive and cannot be undone.`);
    if (!confirmed) return;
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting…';
    try {
      const { error } = await supabase.rpc('admin_delete_shipment', { shipment_id: id });
      if (error) throw error;
      setMessage('Shipment deleted successfully.', 'success');
      showToast('Shipment deleted');
      location.href = 'dashboard.html';
    } catch (err) {
      console.error(err);
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete Shipment';
      setMessage('Delete failed: ' + getFriendlyErrorMessage(err, 'Unable to delete this shipment right now. Please try again.'), 'error');
    }
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (!currentShipment) return;

    submitButton.disabled = true;
    submitButton.textContent = 'Saving…';
    setMessage('Saving shipment changes…', 'info');

    const nextStatus = normalizeAdminStatusInput(el('status').value || 'shipment_created');
    const eventStatusValue = el('event_status')?.value ? normalizeShipmentStatus(el('event_status').value) || null : null;
    const payload = {
      shipment_id: id,
      sender_name: el('sender_name').value.trim() || null,
      receiver_name: el('recipient_name').value.trim() || null,
      origin: el('origin').value.trim() || null,
      destination: el('destination').value.trim() || null,
      status: nextStatus,
      estimated_delivery: el('estimated_delivery').value ? new Date(el('estimated_delivery').value + 'T00:00:00Z').toISOString() : null,
      event_status: eventStatusValue || nextStatus,
      event_location: el('event_location')?.value.trim() || null,
      event_description: el('event_description')?.value.trim() || null,
      event_time: new Date().toISOString(),
      sender_company: el('sender_company').value.trim() || null,
      sender_email: el('sender_email').value.trim() || null,
      sender_phone: el('sender_phone').value.trim() || null,
      sender_address_line_1: el('sender_address_line_1').value.trim() || null,
      sender_address_line_2: el('sender_address_line_2').value.trim() || null,
      sender_city: el('sender_city').value.trim() || null,
      sender_state: el('sender_state').value.trim() || null,
      sender_postal_code: el('sender_postal_code').value.trim() || null,
      sender_country: el('sender_country').value.trim() || null,
      recipient_name: el('recipient_name').value.trim() || null,
      recipient_company: el('recipient_company').value.trim() || null,
      recipient_email: el('recipient_email').value.trim() || null,
      recipient_phone: el('recipient_phone').value.trim() || null,
      recipient_address_line_1: el('recipient_address_line_1').value.trim() || null,
      recipient_address_line_2: el('recipient_address_line_2').value.trim() || null,
      recipient_city: el('recipient_city').value.trim() || null,
      recipient_state: el('recipient_state').value.trim() || null,
      recipient_postal_code: el('recipient_postal_code').value.trim() || null,
      recipient_country: el('recipient_country').value.trim() || null,
      package_type: el('package_type').value.trim() || null,
      package_description: el('package_description').value.trim() || null,
      quantity: el('quantity').value === '' ? null : Number(el('quantity').value),
      weight_kg: el('weight_kg').value === '' ? null : Number(el('weight_kg').value),
      length_cm: el('length_cm').value === '' ? null : Number(el('length_cm').value),
      width_cm: el('width_cm').value === '' ? null : Number(el('width_cm').value),
      height_cm: el('height_cm').value === '' ? null : Number(el('height_cm').value),
      declared_value: el('declared_value').value === '' ? null : Number(el('declared_value').value),
      special_instructions: el('special_instructions').value.trim() || null,
      carrier: el('carrier').value.trim() || null,
      service: el('service').value.trim() || null,
      shipment_date: el('shipment_date').value ? new Date(el('shipment_date').value + 'T00:00:00Z').toISOString() : null,
      actual_delivery: el('actual_delivery').value ? new Date(el('actual_delivery').value + 'T00:00:00Z').toISOString() : null
    };

    try {
      const { error } = await supabase.rpc('admin_update_shipment', payload);
      if (error) throw error;
      showToast('Shipment updated');
      setMessage('Shipment updated successfully. Redirecting to the dashboard…', 'success');
      setTimeout(() => location.href = 'dashboard.html', 500);
    } catch (err) {
      console.error(err);
      setMessage('Update failed: ' + getFriendlyErrorMessage(err, 'Unable to update this shipment right now. Please try again.'), 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });
}

function escapeHtml(s){if(!s && s !== 0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

export { generateTrackingId };
