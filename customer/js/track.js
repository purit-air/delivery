import { supabase } from './supabase.js';
import {
  normalizeTrackingNumber,
  isTrackingNumberValid,
  normalizeShipmentStatus,
  formatDateTimeDisplay,
  getFriendlyErrorMessage,
  getShipmentStatusDisplayValue,
  getShipmentStatusInfo,
  getShipmentStatusMessage
} from '../../js/shared-contract.js';

const form = document.getElementById('track-form');
const input = document.getElementById('tracking');
const loader = document.getElementById('loader');
const result = document.getElementById('result');
const statusRegion = document.getElementById('status');

const TRACKING_STATE = {
  shipment: null,
  events: [],
  filter: 'all',
  expanded: false
};

const STATUS_SEQUENCE = ['shipment_created', 'picked_up', 'in_transit', 'exception', 'out_for_delivery', 'delivered'];

const STATUS_META = {
  shipment_created: { label: 'Shipment Created', short: 'Created', icon: '✓', variant: 'success', description: 'Shipment information received.' },
  picked_up: { label: 'Picked Up', short: 'Picked Up', icon: '✓', variant: 'success', description: 'Package picked up and on the move.' },
  in_transit: { label: 'In Transit', short: 'In Transit', icon: '✓', variant: 'success', description: 'Package is moving toward its destination.' },
  exception: { label: 'Exception', short: 'Exception', icon: '!', variant: 'warning', description: 'Shipment is temporarily on hold.' },
  out_for_delivery: { label: 'Out for Delivery', short: 'Out for Delivery', icon: '→', variant: 'neutral', description: 'Package is out for delivery.' },
  delivered: { label: 'Delivered', short: 'Delivered', icon: '✓', variant: 'success', description: 'Delivery completed.' },
  cancelled: { label: 'Cancelled', short: 'Cancelled', icon: '•', variant: 'neutral', description: 'Shipment has been cancelled.' },
  unknown: { label: 'Unknown', short: 'Unknown', icon: '•', variant: 'neutral', description: 'Status is unavailable.' }
};

function announce(text){ if (statusRegion) statusRegion.textContent = text; }
function showLoader(show){ if (loader) loader.hidden = !show; announce(show ? 'Loading shipment information' : 'Idle'); }
function showResult(html){
  if (result){
    result.innerHTML = html;
    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
          <rect x="2" y="10" width="60" height="36" rx="6" fill="#f1f5f9"/>
          <rect x="12" y="18" width="36" height="20" rx="4" fill="#ffffff"/>
          <circle cx="72" cy="38" r="6" fill="#0b6ef6"/>
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
function showError(msg){ showResult(`<div class="tracking-inline-error"><p>${escapeHtml(msg)}</p></div>`); announce(msg); }

function showSkeleton(show){
  if (!result || !show) return;
  const sk = `
    <div class="tracking-skeleton" aria-hidden="true">
      <div class="skeleton-line skeleton-lg"></div>
      <div class="skeleton-line skeleton-md"></div>
      <div class="skeleton-line skeleton-sm"></div>
      <div class="skeleton-row">
        <div class="skeleton-line skeleton-long"></div>
        <div class="skeleton-line skeleton-short"></div>
      </div>
    </div>`;
  result.innerHTML = sk;
  result.hidden = false;
}

function setFormBusy(busy){
  if (input) input.disabled = !!busy;
  const btn = document.querySelector('#track-form button[type=submit]');
  if (btn) btn.disabled = !!busy;
  const formEl = document.getElementById('track-form');
  if (formEl) formEl.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function normalizeTrackingData(raw = {}) {
  const shipment = raw.shipment || raw || {};
  const events = Array.isArray(raw.events) ? raw.events : [];

  return {
    shipment: {
      ...shipment,
      tracking_number: shipment.tracking_number || shipment.trackingId || '',
      sender_name: shipment.sender_name || shipment.sender || '',
      receiver_name: shipment.receiver_name || shipment.recipient_name || shipment.recipient || '',
      origin: shipment.origin || '',
      destination: shipment.destination || '',
      status: shipment.status || '',
      estimated_delivery: shipment.estimated_delivery || null,
      created_at: shipment.created_at || null,
      updated_at: shipment.updated_at || null,
      actual_delivery: shipment.actual_delivery || null,
      carrier: shipment.carrier || '',
      service: shipment.service || '',
      shipment_date: shipment.shipment_date || null
    },
    events: events.map((event, index) => ({
      ...event,
      id: event.id || `${shipment.tracking_number || 'event'}-${index}`,
      status: event.status || '',
      description: event.description || '',
      location: event.location || '',
      event_time: event.event_time || event.created_at || null,
      created_at: event.created_at || null
    }))
  };
}

function normalizeTrackingStatus(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  const aliasMap = {
    'on_hold': 'exception',
    'on-hold': 'exception',
    'on hold': 'exception',
    'hold': 'exception',
    'pending': 'shipment_created',
    'waiting': 'shipment_created',
    'awaiting pickup': 'shipment_created',
    'format issue': 'exception'
  };

  if (aliasMap[lower]) return aliasMap[lower];

  const normalized = normalizeShipmentStatus(raw);
  if (normalized) return normalized;

  if (lower.includes('hold')) return 'exception';
  return '';
}

function getStatusConfig(status) {
  const normalized = normalizeTrackingStatus(status) || 'unknown';
  return STATUS_META[normalized] || STATUS_META.unknown;
}

function formatTrackingDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTrackingDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getLatestEvent(events) {
  if (!Array.isArray(events) || !events.length) return null;
  const [latest] = [...events].sort((a, b) => {
    const aTime = new Date(a.event_time || a.created_at || 0).getTime();
    const bTime = new Date(b.event_time || b.created_at || 0).getTime();
    return bTime - aTime;
  });
  return latest || null;
}

function getCurrentShipmentStatus(shipment, events) {
  const statusFromShipment = shipment && shipment.status ? normalizeTrackingStatus(shipment.status) : '';
  if (statusFromShipment) return statusFromShipment;

  const latest = getLatestEvent(events);
  const statusFromLatest = latest && latest.status ? normalizeTrackingStatus(latest.status) : '';
  return statusFromLatest || 'shipment_created';
}

function getEstimatedDeliveryInfo(shipment) {
  if (!shipment || !shipment.estimated_delivery) return null;
  const date = new Date(shipment.estimated_delivery);
  if (Number.isNaN(date.getTime())) return null;

  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  const month = date.toLocaleDateString(undefined, { month: 'long' });
  const day = date.getDate();
  const year = date.getFullYear();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return {
    dateLabel: `${weekday}, ${month} ${day}${year ? `, ${year}` : ''}`,
    timeLabel: time ? `by ${time}` : ''
  };
}

function renderShipmentProgress(status) {
  const currentKey = normalizeTrackingStatus(status) || 'shipment_created';

  // Filter sequence: hide exception by default unless shipment is in exception status
  let sequence = STATUS_SEQUENCE;
  if (currentKey !== 'exception') {
    sequence = STATUS_SEQUENCE.filter(s => s !== 'exception');
  }

  const currentIndex = sequence.indexOf(currentKey);
  const isDelivered = currentKey === 'delivered';

  return sequence.map((stage, index) => {
    const config = getStatusConfig(stage);
    let state = 'upcoming';
    let variantClass = config.variant;

    if (index < currentIndex) {
      state = 'completed';
    } else if (index === currentIndex) {
      state = 'current';
      // Apply info (blue) color for in_transit when it's current
      if (stage === 'in_transit') {
        variantClass = 'info';
      }
    }

    // When delivered, all completed nodes should be green
    if (state === 'completed' && isDelivered) {
      variantClass = 'success';
    }

    // Delivered node is always green when reached or completed
    if (stage === 'delivered' && (state === 'completed' || state === 'current')) {
      variantClass = 'success';
    }

    const icon = state === 'completed' ? '✓' : (state === 'current' ? config.icon : '•');

    return `
      <div class="progress-step ${state} ${variantClass}">
        <div class="progress-node" aria-hidden="true">${icon}</div>
        <div class="progress-label">${escapeHtml(config.short)}</div>
      </div>
    `;
  }).join('');
}

function renderHistoryList(events, filterValue, expanded) {
  const ordered = [...events].sort((a, b) => {
    const aTime = new Date(a.event_time || a.created_at || 0).getTime();
    const bTime = new Date(b.event_time || b.created_at || 0).getTime();
    return bTime - aTime;
  });

  const filtered = filterValue === 'all'
    ? ordered
    : ordered.filter((event) => normalizeTrackingStatus(event.status) === filterValue);

  const visible = expanded ? filtered : filtered.slice(0, 3);
  const items = visible.length > 0 ? visible.map((event) => {
    const eventStatus = normalizeTrackingStatus(event.status) || 'unknown';
    const eventInfo = getStatusConfig(eventStatus);
    const eventTime = event.event_time || event.created_at;
    const statusLabel = getShipmentStatusDisplayValue(event.status || eventInfo.label);
    const description = event.description ? `<div class="history-description">${escapeHtml(event.description)}</div>` : '';
    const location = event.location ? `<div class="history-location">${escapeHtml(event.location)}</div>` : '';
    const timestamp = eventTime ? `<div class="history-time">${escapeHtml(formatTrackingDate(eventTime))}</div>` : '';

    return `
      <li class="history-item">
        <div class="history-marker ${eventInfo.variant}" aria-hidden="true"></div>
        <div class="history-content">
          <div class="history-head">
            <div class="history-status">${escapeHtml(statusLabel)}</div>
            ${timestamp}
          </div>
          ${description}
          ${location}
        </div>
      </li>
    `;
  }).join('') : '<li class="history-empty">No matching events for this filter.</li>';

  return { filtered, items };
}

function renderRouteStops(shipment, currentLocation) {
  const stops = [];

  if (shipment.origin) {
    stops.push({ label: 'Origin', location: shipment.origin, state: 'completed' });
  }

  if (currentLocation) {
    stops.push({ label: 'Current location', location: currentLocation, state: 'current' });
  }

  if (shipment.destination) {
    stops.push({ label: 'Destination', location: shipment.destination, state: 'upcoming' });
  }

  return stops.map((stop, index) => {
    const isCurrent = stop.state === 'current';
    const dotClass = isCurrent ? 'route-dot current' : 'route-dot';
    return `
      <div class="route-stop ${stop.state}">
        <div class="route-visual-column">
          <span class="${dotClass}" aria-hidden="true"></span>
          ${index < stops.length - 1 ? '<span class="route-line" aria-hidden="true"></span>' : ''}
        </div>
        <div class="route-copy">
          <div class="route-name">${escapeHtml(stop.location)}</div>
          <div class="route-label">${escapeHtml(stop.label)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderParcel(shipment, events) {
  const normalized = normalizeTrackingData({ shipment, events });
  const safeShipment = normalized.shipment;
  const safeEvents = normalized.events;
  const latestEvent = getLatestEvent(safeEvents);
  const currentStatusKey = getCurrentShipmentStatus(safeShipment, safeEvents);
  const statusConfig = getStatusConfig(currentStatusKey);
  const normalizedStatus = normalizeTrackingStatus(currentStatusKey);
  const latestLocation = (latestEvent && latestEvent.location && normalizeTrackingStatus(latestEvent.status) === currentStatusKey)
    ? latestEvent.location
    : safeShipment.origin || safeShipment.destination || '';
  const shipmentNumber = safeShipment.tracking_number || '';
  const lastUpdated = latestEvent && (latestEvent.event_time || latestEvent.created_at)
    ? formatTrackingDateTime(latestEvent.event_time || latestEvent.created_at)
    : safeShipment.updated_at
      ? formatTrackingDateTime(safeShipment.updated_at)
      : safeShipment.created_at
        ? formatTrackingDateTime(safeShipment.created_at)
        : '';

  const detailFields = [
    { label: 'Tracking ID', value: shipmentNumber },
    { label: 'Sender', value: safeShipment.sender_name || '' },
    { label: 'Recipient', value: safeShipment.receiver_name || '' },
    { label: 'From', value: safeShipment.origin || '' },
    { label: 'To', value: safeShipment.destination || '' },
    { label: 'Created', value: safeShipment.created_at ? formatTrackingDateTime(safeShipment.created_at) : '' }
  ];

  const extraDetails = [
    { label: 'Carrier', value: safeShipment.carrier || '' },
    { label: 'Service', value: safeShipment.service || '' },
    { label: 'Shipment date', value: safeShipment.shipment_date ? formatTrackingDate(safeShipment.shipment_date) : '' },
    { label: 'Actual delivery', value: safeShipment.actual_delivery ? formatTrackingDateTime(safeShipment.actual_delivery) : '' }
  ].filter((entry) => entry.value);

  const estimated = getEstimatedDeliveryInfo(safeShipment);
  const matchingEvent = safeEvents.find((event) => normalizeTrackingStatus(event.status) === currentStatusKey) || latestEvent;
  const currentMessage = matchingEvent && matchingEvent.description ? matchingEvent.description : getShipmentStatusMessage(currentStatusKey) || statusConfig.description;
  const statusLabel = getShipmentStatusDisplayValue(currentStatusKey);

  const routeStops = renderRouteStops(safeShipment, latestLocation);
  const eventOptions = ['all', ...new Set(safeEvents.map((event) => normalizeTrackingStatus(event.status)).filter(Boolean))];
  const filterOptions = eventOptions.map((value) => {
    const isAll = value === 'all';
    const label = isAll ? 'All Events' : getShipmentStatusDisplayValue(value);
    const selected = TRACKING_STATE.filter === value ? 'selected' : '';
    return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(label)}</option>`;
  }).join('');

  const historyPreview = renderHistoryList(safeEvents, TRACKING_STATE.filter, TRACKING_STATE.expanded);
  const historySummary = historyPreview.items;

  const html = `
    <article class="tracking-result">
      <header class="tracking-header tracking-panel">
        <div class="tracking-header-row">
          <button type="button" id="track-another" class="track-back-link" aria-label="Track another shipment">← Track another shipment</button>
        </div>
        <div class="tracking-id-row">
          <div class="tracking-id-label">Tracking ID</div>
          <div class="tracking-id-actions">
            <span class="tracking-id-value">${escapeHtml(shipmentNumber || 'Tracking ID unavailable')}</span>
            <button type="button" id="copy-tracking-number" class="copy-button" aria-label="Copy tracking number">Copy</button>
          </div>
        </div>
        <div class="tracking-meta">Last updated ${escapeHtml(lastUpdated || '—')}</div>
      </header>

      <div class="tracking-summary-grid">
        <section class="item-panel tracking-panel status-panel ${statusConfig.variant}">
          <div class="status-topline">
            <div class="status-icon" aria-hidden="true">${escapeHtml(statusConfig.icon)}</div>
            <div class="status-copy">
              <div class="status-title">${escapeHtml(statusLabel)}</div>
              <div class="status-message">${escapeHtml(currentMessage)}</div>
            </div>
          </div>
          <div class="status-location">${latestLocation ? `◆ ${escapeHtml(latestLocation)}` : ''}</div>
          <div class="status-progress" aria-label="Shipment progress">
            ${renderShipmentProgress(currentStatusKey)}
          </div>
          <div class="status-estimate">
            <div class="estimate-label">Estimated delivery</div>
            ${estimated ? `
              <div class="estimate-date">${escapeHtml(estimated.dateLabel)}</div>
              ${estimated.timeLabel ? `<div class="estimate-time">${escapeHtml(estimated.timeLabel)}</div>` : ''}
            ` : '<div class="estimate-date estimate-empty">Unavailable</div>'}
          </div>
        </section>

        <aside class="item-panel tracking-panel details-panel">
          <div class="panel-heading-row">
            <h2>Shipment Details</h2>
            <button type="button" id="details-toggle" class="details-toggle" aria-expanded="false">View full details →</button>
          </div>
          <dl class="detail-list">
            ${detailFields.filter((entry) => entry.value).map((entry) => `
              <div class="detail-row">
                <dt>${escapeHtml(entry.label)}</dt>
                <dd>${escapeHtml(entry.value)}</dd>
              </div>
            `).join('')}
          </dl>
          <div id="full-details-panel" class="full-details-panel" hidden>
            <dl class="detail-list detail-list-secondary">
              ${extraDetails.map((entry) => `
                <div class="detail-row">
                  <dt>${escapeHtml(entry.label)}</dt>
                  <dd>${escapeHtml(entry.value)}</dd>
                </div>
              `).join('')}
            </dl>
          </div>
        </aside>
      </div>

      <div class="tracking-lower-grid">
        <section class="item-panel tracking-panel history-panel">
          <div class="panel-heading-row">
            <h2>Shipment History</h2>
            <label class="history-filter-wrap" aria-label="Filter shipment history">
              <select id="history-filter" class="history-filter">
                ${filterOptions}
              </select>
            </label>
          </div>

          <ul id="history-list" class="history-list">
            ${historySummary}
          </ul>

          ${historyPreview.filtered.length > 3 ? `
            <button type="button" id="toggle-history-btn" class="toggle-history-btn" aria-expanded="${TRACKING_STATE.expanded ? 'true' : 'false'}">
              ${TRACKING_STATE.expanded ? 'Show Less' : 'Show More'}
            </button>
          ` : ''}
        </section>

        <aside class="item-panel tracking-panel route-panel">
          <h2>Shipment Route</h2>
          <div class="route-list">
            ${routeStops}
          </div>
          <div class="route-map" aria-hidden="true">
            <span class="route-map-node node-origin"></span>
            <span class="route-map-node node-current"></span>
            <span class="route-map-node node-destination"></span>
          </div>
        </aside>
      </div>
    </article>
  `;

  showResult(html);
  TRACKING_STATE.shipment = safeShipment;
  TRACKING_STATE.events = safeEvents;
  announce(`Shipment ${shipmentNumber} — ${statusLabel}`);

  const back = document.getElementById('track-another');
  if (back) {
    back.addEventListener('click', (event) => {
      event.preventDefault();
      const empty = document.getElementById('empty');
      if (result) result.hidden = true;
      if (empty) empty.hidden = false;
      if (input) {
        input.value = '';
        input.removeAttribute('aria-invalid');
        input.focus();
      }
    });
  }

  const copyBtn = document.getElementById('copy-tracking-number');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const target = shipmentNumber || '';
      const button = copyBtn;
      const original = button.textContent;
      const fallback = () => {
        button.textContent = 'Copied ✓';
        window.setTimeout(() => {
          button.textContent = original;
        }, 1500);
      };

      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(target);
        } else {
          const temp = document.createElement('textarea');
          temp.value = target;
          temp.setAttribute('readonly', '');
          temp.style.position = 'fixed';
          temp.style.opacity = '0';
          document.body.appendChild(temp);
          temp.select();
          try {
            document.execCommand('copy');
          } catch (err) {
            console.warn('Clipboard fallback failed', err);
          }
          document.body.removeChild(temp);
        }
        button.textContent = 'Copied ✓';
      } catch (error) {
        console.warn('Copy failed', error);
        button.textContent = 'Copy failed';
      }

      window.setTimeout(() => {
        button.textContent = original;
      }, 1500);
    });
  }

  const detailsToggle = document.getElementById('details-toggle');
  const fullDetails = document.getElementById('full-details-panel');
  if (detailsToggle && fullDetails) {
    detailsToggle.addEventListener('click', () => {
      const expanded = fullDetails.hidden === false;
      fullDetails.hidden = expanded;
      detailsToggle.setAttribute('aria-expanded', String(!expanded));
      detailsToggle.textContent = expanded ? 'View full details →' : 'Hide full details ←';
    });
  }

  const historyFilter = document.getElementById('history-filter');
  const historyList = document.getElementById('history-list');
  const toggleHistory = document.getElementById('toggle-history-btn');

  if (historyFilter && historyList && toggleHistory) {
    const refreshHistory = () => {
      const next = renderHistoryList(TRACKING_STATE.events, TRACKING_STATE.filter, TRACKING_STATE.expanded);
      historyList.innerHTML = next.items;
      toggleHistory.hidden = next.filtered.length <= 3;
      toggleHistory.textContent = TRACKING_STATE.expanded ? 'Show Less' : 'Show More';
      toggleHistory.setAttribute('aria-expanded', String(TRACKING_STATE.expanded));
    };

    historyFilter.addEventListener('change', (event) => {
      TRACKING_STATE.filter = event.target.value;
      TRACKING_STATE.expanded = false;
      refreshHistory();
    });

    toggleHistory.addEventListener('click', () => {
      TRACKING_STATE.expanded = !TRACKING_STATE.expanded;
      refreshHistory();
    });
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const id = normalizeTrackingNumber(input.value);
  if (!id) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    showError('Enter a tracking number to look up a shipment.');
    return;
  }
  if (!isTrackingNumberValid(id)) {
    input.setAttribute('aria-invalid', 'true');
    input.reportValidity?.();
    showError('Please enter a valid tracking ID in the format TRE-1234-5678-9012.');
    input.focus();
    return;
  }
  lookup(id);
});

async function lookup(id) {
  const normalizedId = normalizeTrackingNumber(id);
  showLoader(true);
  showSkeleton(true);
  setFormBusy(true);
  if (result) result.hidden = false;

  try {
    const { data, error } = await supabase.rpc('get_public_tracking', { tracking_number: normalizedId });
    if (error) {
      console.error('Supabase RPC error', error);
      showError(getFriendlyErrorMessage(error, 'Unable to fetch tracking data right now. Please try again later.'));
      return;
    }

    if (!data || !data.shipment) {
      showError('We could not find that tracking number. Please double-check the ID and try again.');
      return;
    }

    renderParcel(data.shipment, data.events || []);
  } catch (error) {
    console.error(error);
    showError(getFriendlyErrorMessage(error, 'Unable to fetch tracking data right now. Please try again later.'));
  } finally {
    showLoader(false);
    setFormBusy(false);
  }
}

const params = new URLSearchParams(location.search);
const qid = params.get('id');
if (qid) {
  input.value = qid;
  lookup(qid);
} else {
  const empty = document.getElementById('empty');
  if (empty) empty.hidden = false;
}
