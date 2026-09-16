/**
 * API helper for communicating with the backend server
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

async function fetchAPI(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {})
    },
    ...options,
  });
  return response;
}

export async function checkinGuest(query, method = 'QR Scan') {
  const res = await fetchAPI('/api/checkin', {
    method: 'POST',
    body: JSON.stringify({ query, method }),
  });
  return { status: res.status, data: await res.json() };
}

export async function checkinGuestById(id, method = 'Input Panitia') {
  const res = await fetchAPI(`/api/checkin/${id}`, {
    method: 'POST',
    body: JSON.stringify({ method }),
  });
  return { status: res.status, data: await res.json() };
}

export async function selfCheckin({ id, name, is_walkin }) {
  const res = await fetchAPI('/api/self-checkin', {
    method: 'POST',
    body: JSON.stringify({ id, name, is_walkin }),
  });
  return { status: res.status, data: await res.json() };
}

export async function undoCheckin(id) {
  const res = await fetchAPI(`/api/undo-checkin/${id}`, { method: 'POST' });
  return { status: res.status, data: await res.json() };
}

export async function searchGuests(query) {
  const res = await fetchAPI(`/api/search?q=${encodeURIComponent(query)}`);
  return res.json();
}

export async function getRecentCheckins(limit = 10) {
  const res = await fetchAPI(`/api/recent?limit=${limit}`);
  return res.json();
}

export async function getStats() {
  const res = await fetchAPI('/api/stats');
  return res.json();
}

export async function resetAllCheckins() {
  const res = await fetchAPI('/api/reset', { method: 'POST' });
  return res.json();
}

export function getExportUrl() {
  return `${API_BASE}/api/export`;
}
