export const TRACKING_NUMBER_PATTERN = /^TRE-\d{4}-\d{4}-\d{4}$/;

export const CANONICAL_STATUS_MAP = {
  shipment_created: 'Shipment Created',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
  cancelled: 'Cancelled'
};

export const CANONICAL_STATUS_VALUES = Object.keys(CANONICAL_STATUS_MAP);

export function normalizeTrackingNumber(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim().toUpperCase();
  const onlyAlphaNumeric = raw.replace(/[^A-Z0-9]/g, '');
  const letters = onlyAlphaNumeric.replace(/[^A-Z]/g, '').slice(0, 3);
  const digits = onlyAlphaNumeric.replace(/[^0-9]/g, '').slice(0, 12);

  if (!letters && !digits) return '';

  const normalizedLetters = letters === 'TRE' ? 'TRE' : (letters || '');
  const groups = digits.match(/.{1,4}/g) || [];

  if (normalizedLetters) {
    if (groups.length === 0) return 'TRE';
    return `TRE-${groups.slice(0, 3).join('-')}`.slice(0, 19);
  }

  if (groups.length === 0) return '';
  return groups.slice(0, 3).join('-');
}

export function isTrackingNumberValid(value) {
  if (value === null || value === undefined) return false;
  const normalized = normalizeTrackingNumber(value);
  return TRACKING_NUMBER_PATTERN.test(normalized);
}

export function formatTrackingNumberForDisplay(value) {
  const normalized = normalizeTrackingNumber(value);
  return normalized || '';
}

export function normalizeShipmentStatus(value) {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';

  const normalizedKey = trimmed.toLowerCase().replace(/\s+/g, '_');
  const directMap = {
    shipment_created: 'shipment_created',
    'shipment created': 'shipment_created',
    picked_up: 'picked_up',
    'picked up': 'picked_up',
    in_transit: 'in_transit',
    'in transit': 'in_transit',
    out_for_delivery: 'out_for_delivery',
    'out for delivery': 'out_for_delivery',
    delivered: 'delivered',
    'delivery complete': 'delivered',
    exception: 'exception',
    'exceptions': 'exception',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    'cancelled shipment': 'cancelled',
    pending: 'shipment_created'
  };

  if (directMap[trimmed.toLowerCase()]) return directMap[trimmed.toLowerCase()];
  if (directMap[normalizedKey]) return directMap[normalizedKey];

  const normalized = normalizedKey.replace(/[^a-z_]/g, '');
  return CANONICAL_STATUS_VALUES.includes(normalized) ? normalized : '';
}

export function getShipmentStatusDisplayValue(value) {
  const canonical = normalizeShipmentStatus(value);
  if (!canonical) return 'Unknown';
  return CANONICAL_STATUS_MAP[canonical] || canonical;
}

export function getShipmentStatusInfo(value) {
  const canonical = normalizeShipmentStatus(value);
  const label = getShipmentStatusDisplayValue(canonical);

  const map = {
    shipment_created: { label: 'SHIPMENT CREATED', class: 'status-created', className: 'status-created' },
    picked_up: { label: 'PICKED UP', class: 'status-picked-up', className: 'status-picked-up' },
    in_transit: { label: 'IN TRANSIT', class: 'status-transit', className: 'status-transit' },
    out_for_delivery: { label: 'OUT FOR DELIVERY', class: 'status-out', className: 'status-out' },
    delivered: { label: 'DELIVERED', class: 'status-delivered', className: 'status-delivered' },
    exception: { label: 'EXCEPTION', class: 'status-exception', className: 'status-exception' },
    cancelled: { label: 'CANCELLED', class: 'status-cancelled', className: 'status-cancelled' }
  };

  return map[canonical] || { label: label.toUpperCase(), class: 'status-default', className: 'status-default' };
}

export function getShipmentStatusMessage(value) {
  const canonical = normalizeShipmentStatus(value);
  const messages = {
    shipment_created: 'Shipment record created.',
    picked_up: 'The package has been picked up and is on its way.',
    in_transit: 'Your package is on its way.',
    out_for_delivery: 'Your package is out for delivery and should arrive soon.',
    delivered: 'Your package was successfully delivered.',
    exception: 'There is an issue affecting this shipment. See the latest event below.',
    cancelled: 'This shipment has been cancelled.'
  };

  return messages[canonical] || '';
}

export const getStatusMessage = getShipmentStatusMessage;

export function normalizeShipmentRecord(shipment = {}) {
  return {
    ...shipment,
    tracking_number: formatTrackingNumberForDisplay(shipment.tracking_number || ''),
    status: normalizeShipmentStatus(shipment.status || '') || shipment.status || '',
    created_at: shipment.created_at || null,
    updated_at: shipment.updated_at || null,
    estimated_delivery: shipment.estimated_delivery || null
  };
}

export function normalizeTrackingEvent(event = {}) {
  return {
    ...event,
    status: normalizeShipmentStatus(event.status || '') || event.status || '',
    event_time: event.event_time || null,
    location: event.location || null,
    description: event.description || null
  };
}

export function formatDateValue(value, { defaultValue = '', withTime = false } = {}) {
  if (!value) return defaultValue;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return defaultValue;

  const options = withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' };

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

export function formatDateTimeDisplay(value, defaultValue = '') {
  return formatDateValue(value, { defaultValue, withTime: true });
}

export function formatDateDisplay(value, defaultValue = '') {
  return formatDateValue(value, { defaultValue, withTime: false });
}

export function getFriendlyErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;

  const message = typeof error === 'string' ? error : (error.message || error.code || fallback);

  const lower = String(message).toLowerCase();
  if (lower.includes('permission denied')) return 'You are not authorized to perform this action.';
  if (lower.includes('invalid tracking number')) return 'Enter a valid tracking number in the format TRE-1234-5678-9012.';
  if (lower.includes('shipment not found')) return 'Shipment could not be found.';
  if (lower.includes('invalid shipment status')) return 'The selected shipment status is not valid.';
  if (lower.includes('network') || lower.includes('failed to fetch')) return 'The service is temporarily unavailable. Please try again.';

  return message;
}

export function evaluateAdminAccess({ user = null, session = null, adminProfile = null, expiresAt = null } = {}) {
  const rawSessionExpiry = Number(expiresAt ?? session?.expires_at ?? 0);
  const hasSession = Boolean(session && user && user.id);
  const isExpired = hasSession && rawSessionExpiry > 0 && Date.now() >= rawSessionExpiry * 1000;
  const isAdmin = Boolean(user && user.id && adminProfile && adminProfile.role === 'admin');

  return {
    hasSession,
    isExpired,
    isAdmin,
    canAccessAdmin: hasSession && !isExpired && isAdmin,
    reason: !hasSession
      ? 'missing_session'
      : isExpired
        ? 'expired_session'
        : !isAdmin
          ? 'not_admin'
          : 'authorized_admin'
  };
}
