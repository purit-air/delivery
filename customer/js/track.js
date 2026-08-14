import { supabase } from './supabase.js';
import {
  normalizeTrackingNumber,
  isTrackingNumberValid,
  getShipmentStatusInfo,
  getShipmentStatusMessage,
  normalizeShipmentStatus,
  formatDateTimeDisplay,
  getFriendlyErrorMessage,
  getShipmentStatusDisplayValue
} from '../../js/shared-contract.js';

const form = document.getElementById('track-form');
const input = document.getElementById('tracking');
const loader = document.getElementById('loader');
const result = document.getElementById('result');
const statusRegion = document.getElementById('status');

function announce(text){ if (statusRegion) statusRegion.textContent = text }
function showLoader(show){ if (loader) loader.hidden = !show; announce(show ? 'Loading shipment information' : 'Idle') }
function showResult(html){
  if (result){
    result.innerHTML = html;
    result.hidden = false;
    result.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  const empty = document.getElementById('empty');
  if (empty) empty.hidden = true;
}
function showEmptyState(msg = 'Track your shipment', detail = 'Enter a tracking number above to see the latest status and timeline for your delivery.') {
  const empty = document.getElementById('empty');
  if (empty) {
    empty.hidden = false;
    empty.innerHTML = `
      <div>
        <svg width="80" height="56" viewBox="0 0 80 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="2" y="10" width="60" height="36" rx="6" fill="#f1f5f9" />
          <rect x="12" y="18" width="36" height="20" rx="4" fill="#ffffff" />
          <circle cx="72" cy="38" r="6" fill="#0b6ef6" />
        </svg>
      </div>
      <div>
        <h3>${escapeHtml(msg)}</h3>
        <p class="muted">${escapeHtml(detail)}</p>
      </div>`;
  }
  if (result) result.hidden = true;
  announce(msg);
}
function showError(msg){ showResult(`<div class="card"><p class="muted">${msg}</p></div>`); announce(msg) }

function showSkeleton(show){
  if (!result) return;
  if (!show) return;
  const sk = `
    <div class="card track-skeleton" aria-hidden="true">
      <div class="skeleton skeleton-line skeleton-xxl" style="width:36%"></div>
      <div class="skeleton skeleton-line" style="width:48%"></div>
      <div class="skeleton skeleton-line" style="width:28%"></div>
      <div class="skeleton-row">
        <div class="skeleton skeleton-line" style="width:70%"></div>
        <div class="skeleton skeleton-line" style="width:50%"></div>
      </div>
      <div class="skeleton-row" style="margin-top:12px">
        <div class="skeleton skeleton-line" style="width:100%"></div>
        <div class="skeleton skeleton-line" style="width:85%"></div>
        <div class="skeleton skeleton-line" style="width:60%"></div>
      </div>
    </div>`;
  result.innerHTML = sk; result.hidden = false;
}

function setFormBusy(busy){
  if (input) input.disabled = !!busy;
  const btn = document.querySelector('#track-form button[type=submit]');
  if (btn) btn.disabled = !!busy;
  const formEl = document.getElementById('track-form');
  if (formEl) formEl.setAttribute('aria-busy', busy ? 'true' : 'false');
}

async function lookup(id){
  const normalizedId = normalizeTrackingNumber(id);
  showLoader(true);
  showSkeleton(true);
  setFormBusy(true);
  result.hidden = false;
  try{
    const { data, error } = await supabase.rpc('get_public_tracking', { tracking_number: normalizedId });
    if (error){
      console.error('Supabase RPC error', error);
      const friendly = getFriendlyErrorMessage(error, 'Unable to fetch tracking data right now. Please try again later.');
      showError(friendly);
      return;
    }
    if (!data || !data.shipment){
      const emptyMessage = 'We could not find that tracking number.';
      showError(`${emptyMessage} Please double-check the ID and try again.`);
      return;
    }
    renderParcel(data.shipment, data.events || []);
  }catch(err){
    console.error(err);
    const friendly = getFriendlyErrorMessage(err, 'Unable to fetch tracking data right now. Please try again later.');
    showError(friendly);
  }finally{
    showLoader(false);
    setFormBusy(false);
  }
}

function renderParcel(shipment, events){
  const created = shipment.created_at ? formatDateTimeDisplay(shipment.created_at) : '';
  const sorted = (events || []).slice().sort((a,b)=> new Date(a.event_time) - new Date(b.event_time));
  const latestIndex = sorted.length - 1;
  // Determine current/latest event (prefer latest tracking event if available)
  const currentEvent = (sorted.length > 0) ? sorted[latestIndex] : null;
  // Reverse array so latest events appear at top
  const reversedSorted = sorted.slice().reverse();
  const historyHtml = reversedSorted.map((h, idx)=>{
    const t = h.event_time ? formatDateTimeDisplay(h.event_time) : '';
    const displayStatus = getShipmentStatusDisplayValue(h.status || '');
    // First item (idx 0) is the latest, rest are older
    const state = idx === 0 ? 'current' : 'completed';
    return `
      <li class="timeline-item ${state}" data-idx="${idx}">
        <div class="item-indicator" aria-hidden="true"></div>
        <div class="item-body">
          <div class="item-head">
            <h4 class="item-title">${escapeHtml(displayStatus)}</h4>
            <div class="item-time muted">${t}</div>
          </div>
          <div class="item-meta muted">${escapeHtml(h.location || '')}</div>
          ${h.description ? `<div class="item-desc">${escapeHtml(h.description)}</div>` : ''}
        </div>
      </li>`;
  }).join('');

  // prefer latest event status when available
  const displayStatusRaw = (currentEvent && currentEvent.status) ? currentEvent.status : shipment.status;
  const normalizedStatus = normalizeShipmentStatus(displayStatusRaw || '');
  const statusInfo = getShipmentStatusInfo(normalizedStatus);

  const etaHtml = shipment.estimated_delivery ? `<div class="eta"><span class="eta-label">Estimated delivery</span><span class="eta-date">${new Date(shipment.estimated_delivery).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</span></div>` : `<div class="eta muted">Estimated delivery unavailable</div>`;

  // Build route locations array from events
  const routeLocations = [];
  if (shipment.origin) routeLocations.push({ name: shipment.origin, type: 'origin', status: 'completed' });
  if (currentEvent && currentEvent.location) routeLocations.push({ name: currentEvent.location, type: 'current', status: 'current' });
  if (shipment.destination) routeLocations.push({ name: shipment.destination, type: 'destination', status: 'upcoming' });
  
  const routeHtml = routeLocations.map((loc, idx) => {
    const isOrigin = idx === 0;
    const isCurrent = loc.type === 'current';
    const isDestination = idx === routeLocations.length - 1;
    return `
      <div class="route-stop ${loc.status}">
        <div class="route-dot ${isCurrent ? 'current-dot' : ''}" aria-hidden="true"></div>
        <div class="route-info">
          <div class="route-name">${escapeHtml(loc.name)}</div>
          ${isCurrent ? `<div class="route-status">Current location</div>` : ''}
          ${isOrigin ? `<div class="route-label">Origin</div>` : ''}
          ${isDestination ? `<div class="route-label">Destination</div>` : ''}
          ${isCurrent && currentEvent && currentEvent.event_time ? `<div class="route-date muted">${escapeHtml(formatDateTimeDisplay(currentEvent.event_time))}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <div class="tracking-result">
      <div class="result-top">
        <div class="top-controls">
          <a href="#" id="track-another" class="track-back">← Track another shipment</a>
          <a href="#" id="remove-result" class="track-remove">Remove</a>
        </div>
        
        <div class="top-cards">
          <div class="summary-card card">
            <div class="status-badge ${statusInfo.class}">
              <div class="status-icon" aria-hidden="true">!</div>
              <div class="status-text">${escapeHtml(getShipmentStatusDisplayValue(currentEvent?.status || shipment.status))}</div>
            </div>
            ${currentEvent && currentEvent.description ? `<div class="status-message">${escapeHtml(currentEvent.description)}</div>` : ''}
            ${currentEvent && currentEvent.location ? `<div class="status-location muted">${escapeHtml(currentEvent.location)}</div>` : ''}
            
            <div class="summary-sep"></div>
            
            <div class="eta-section">
              <div class="eta-label muted">Estimated delivery</div>
              ${shipment.estimated_delivery ? (()=>{
                const d = new Date(shipment.estimated_delivery);
                const weekday = d.toLocaleDateString(undefined,{weekday:'long'});
                const day = d.getDate();
                const month = d.toLocaleDateString(undefined,{month:'long'});
                const time = d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
                return `
                  <div class="eta-value">${escapeHtml(weekday)}, ${escapeHtml(month)} ${escapeHtml(String(day))}</div>
                  <div class="eta-time muted">by ${escapeHtml(time)}</div>
                `;
              })() : `<div class="eta-muted muted">Unavailable</div>`}
            </div>
          </div>

          <div class="route-card card">
            <h4 class="route-title">Shipment Route</h4>
            <div class="route-container">
              ${routeHtml}
            </div>
            <div class="route-map" aria-hidden="true"></div>
          </div>
        </div>
      </div>

      <div class="result-body">
        <div class="body-left">
          <div class="history-card card">
            <h3>Shipment History</h3>
            <ul id="timeline-list" class="timeline-list collapsed" data-total-items="${reversedSorted.length}">${ historyHtml && historyHtml.length ? historyHtml : `<li class="muted">Tracking history is not yet available.</li>` }</ul>
            ${reversedSorted.length > 2 ? `<button id="toggle-history-btn" class="btn btn-toggle-history" aria-expanded="false">See All Tracking History</button>` : ''}
          </div>
        </div>

        <aside class="details-col card">
          <h3>Shipment Details</h3>
          <dl class="details-list">
            <dt>Tracking ID</dt><dd>${escapeHtml(shipment.tracking_number)}</dd>
            ${shipment.sender_name ? `<dt>Sender</dt><dd>${escapeHtml(shipment.sender_name)}</dd>` : ''}
            ${shipment.receiver_name ? `<dt>Recipient</dt><dd>${escapeHtml(shipment.receiver_name)}</dd>` : ''}
            ${shipment.origin ? `<dt>From</dt><dd>${escapeHtml(shipment.origin)}</dd>` : ''}
            ${shipment.destination ? `<dt>To</dt><dd>${escapeHtml(shipment.destination)}</dd>` : ''}
            ${created ? `<dt>Created</dt><dd>${created}</dd>` : ''}
          </dl>
        </aside>
      </div>
    </div>`;

  showResult(html);
  announce(`Shipment ${shipment.tracking_number} — ${getShipmentStatusInfo(normalizedStatus).label}`);

  // wire up track another link/buttons
  const back = document.getElementById('track-another');
  function resetToSearch(e){ if (e) e.preventDefault(); result.hidden = true; document.getElementById('empty').hidden = false; input.value = ''; input.removeAttribute('aria-invalid'); input.focus(); }
  if (back) back.addEventListener('click', resetToSearch);
  
  // wire up Remove control (keeps user on public tracking page but resets view)
  const removeLink = document.getElementById('remove-result');
  if (removeLink) removeLink.addEventListener('click', resetToSearch);
  
  // wire up history toggle button
  const toggleBtn = document.getElementById('toggle-history-btn');
  const timelineList = document.getElementById('timeline-list');
  if (toggleBtn && timelineList) {
    toggleBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
      
      if (!isExpanded) {
        // Expand to show all
        timelineList.classList.remove('collapsed');
        timelineList.classList.add('expanded');
        toggleBtn.textContent = 'Hide Tracking History';
      } else {
        // Collapse to show only first 2
        timelineList.classList.remove('expanded');
        timelineList.classList.add('collapsed');
        toggleBtn.textContent = 'See All Tracking History';
      }
    });
  }
}

function renderProgress(events, shipment){
  const stages = ['shipment_created','picked_up','in_transit','out_for_delivery','delivered'];
  const currentStatus = normalizeShipmentStatus(shipment.status || '');
  return stages.map(stage => {
    const label = getShipmentStatusInfo(stage).label;
    let state = 'upcoming';
    const hasCurrent = currentStatus === stage;
    const hasPrior = events.some(e => normalizeShipmentStatus(e.status || '') === stage);
    if (hasCurrent || hasPrior) state = 'current';
    if (events.findIndex(e => normalizeShipmentStatus(e.status || '') === stage) < events.length - 1) state = 'completed';
    return `<div class="progress-step ${state}"><div class="step-dot" aria-hidden="true"></div><div class="step-label">${label}</div></div>`;
  }).join('');
}

function escapeHtml(s){if(!s && s !== 0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function applyTrackingInputFormatting() {
  if (!input) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const raw = input.value || '';
  const formatted = normalizeTrackingNumber(raw);
  if (formatted !== raw) {
    input.value = formatted;
    const delta = formatted.length - raw.length;
    const nextPosition = Math.max(0, Math.min(start + delta, formatted.length));
    input.setSelectionRange(nextPosition, Math.min(end + delta, formatted.length));
  }
}

input?.addEventListener('input', () => {
  applyTrackingInputFormatting();
  if (input.value) {
    input.setAttribute('aria-invalid', isTrackingNumberValid(input.value) ? 'false' : 'true');
  } else {
    input.removeAttribute('aria-invalid');
  }
});

form.addEventListener('submit', (e)=>{
  e.preventDefault();
  const id = normalizeTrackingNumber(input.value);
  if (!id) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    showError('Enter a tracking number to look up a shipment.');
    return;
  }
  if (!isTrackingNumberValid(id)){
    input.setAttribute('aria-invalid','true');
    input.reportValidity?.();
    showError('Please enter a valid tracking ID in the format TRE-1234-5678-9012.');
    input.focus();
    return;
  }
  lookup(id);
});

// If query param provided from index quick track
const params = new URLSearchParams(location.search);
const qid = params.get('id');
if (qid){
  input.value = qid; lookup(qid);
} else {
  // show intentional empty state
  const empty = document.getElementById('empty');
  if (empty) { empty.hidden = false; }
}
