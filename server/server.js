/**
 * Wedding Guest Check-In Server
 * Backend: Express + WebSocket + JSON File Storage
 * Resepsi Pernikahan Wildan & Aisyah
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// ============================================================
// Configuration
// ============================================================
const PORT = process.env.PORT || 3001;
const GUESTS_JSON_PATH = path.join(__dirname, '..', 'guests.json');
const STATE_PATH = path.join(__dirname, 'checkin_state.json');

// ============================================================
// In-Memory Database (JSON-backed)
// ============================================================
let guests = []; // Array of guest objects
let checkinState = {}; // { guestId: { is_present: true, checked_in_at: "ISO" } }

function loadData() {
  // Load guest master data
  if (fs.existsSync(GUESTS_JSON_PATH)) {
    const raw = fs.readFileSync(GUESTS_JSON_PATH, 'utf-8');
    const guestData = JSON.parse(raw);
    console.log(`[DB] Loaded ${guestData.length} guests from guests.json`);

    guests = guestData.map(g => ({
      id: g.id,
      no: g.no,
      name: g.name,
      category: g.category || '',
      qr_payload: g.qr_payload || g.name,
      is_present: false,
      checked_in_at: null,
      pax: 1,
      notes: ''
    }));
  } else {
    console.log(`[DB] WARNING: guests.json not found at ${GUESTS_JSON_PATH}`);
    guests = [];
  }

  // Load persisted check-in state (survives server restarts)
  if (fs.existsSync(STATE_PATH)) {
    const raw = fs.readFileSync(STATE_PATH, 'utf-8');
    checkinState = JSON.parse(raw);
    console.log(`[DB] Restored ${Object.keys(checkinState).length} check-in states`);

    // Apply saved state to guests
    for (const guest of guests) {
      if (checkinState[guest.id]) {
        guest.is_present = true;
        guest.checked_in_at = checkinState[guest.id].checked_in_at;
      }
    }
  }
}

function saveState() {
  // Persist check-in state to file (for crash recovery)
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(checkinState, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Error saving state:', err.message);
  }
}

loadData();

// ============================================================
// Express App Setup
// ============================================================
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// ============================================================
// WebSocket Setup
// ============================================================
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  // Send current stats on connection
  const stats = getStats();
  ws.send(JSON.stringify({ type: 'stats:update', data: stats }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    clients.delete(ws);
  });
});

function broadcast(event) {
  const message = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

// ============================================================
// Helper Functions
// ============================================================
function getStats() {
  const total = guests.length;
  const present = guests.filter(g => g.is_present).length;
  const absent = total - present;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
  return { total, present, absent, percentage };
}

function findGuestByQuery(query) {
  if (!query || query.trim() === '') return null;
  const trimmed = query.trim();

  // 1. Exact QR payload match
  let guest = guests.find(g => g.qr_payload === trimmed);
  if (guest) return guest;

  // 2. Exact ID match
  guest = guests.find(g => g.id === trimmed);
  if (guest) return guest;

  // 3. Parse pipe-separated: "Nama|Kategori"
  if (trimmed.includes('|')) {
    const parts = trimmed.split('|');
    const name = parts[0].trim();
    const category = parts.length > 1 ? parts[1].trim() : '';

    if (category) {
      guest = guests.find(g =>
        g.name.toLowerCase() === name.toLowerCase() &&
        g.category.toLowerCase() === category.toLowerCase()
      );
      if (guest) return guest;
    }

    guest = guests.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (guest) return guest;

    // Partial name match
    guest = guests.find(g => g.name.toLowerCase().includes(name.toLowerCase()));
    if (guest) return guest;
  }

  // 4. Exact name match (case-insensitive)
  guest = guests.find(g => g.name.toLowerCase() === trimmed.toLowerCase());
  if (guest) return guest;

  // 5. Partial name match
  guest = guests.find(g => g.name.toLowerCase().includes(trimmed.toLowerCase()));
  if (guest) return guest;

  // 6. ID partial match (case-insensitive)
  guest = guests.find(g => g.id.toLowerCase().includes(trimmed.toLowerCase()));
  if (guest) return guest;

  return null;
}

function formatGuest(g) {
  return {
    id: g.id,
    no: g.no,
    name: g.name,
    category: g.category,
    qr_payload: g.qr_payload,
    is_present: g.is_present,
    checked_in_at: g.checked_in_at,
    pax: g.pax,
    notes: g.notes
  };
}

// ============================================================
// API Routes
// ============================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), guests: guests.length });
});

// Get all guests
app.get('/api/guests', (req, res) => {
  const filter = req.query.filter;
  let result = guests;

  if (filter === 'present') {
    result = guests.filter(g => g.is_present).sort((a, b) =>
      new Date(b.checked_in_at) - new Date(a.checked_in_at)
    );
  } else if (filter === 'absent') {
    result = guests.filter(g => !g.is_present);
  }

  res.json(result.map(formatGuest));
});

// Get single guest
app.get('/api/guests/:id', (req, res) => {
  const guest = guests.find(g => g.id === req.params.id);
  if (!guest) return res.status(404).json({ error: 'Guest not found' });
  res.json(formatGuest(guest));
});

// Get stats
app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

// Search guests
app.get('/api/search', (req, res) => {
  const q = req.query.q;
  if (!q || q.trim().length < 1) return res.json([]);

  const term = q.trim().toLowerCase();
  const results = guests.filter(g =>
    g.name.toLowerCase().includes(term) ||
    g.id.toLowerCase().includes(term) ||
    g.category.toLowerCase().includes(term)
  ).slice(0, 20);

  res.json(results.map(formatGuest));
});

// Get recent check-ins
app.get('/api/recent', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const recent = guests
    .filter(g => g.is_present)
    .sort((a, b) => new Date(b.checked_in_at) - new Date(a.checked_in_at))
    .slice(0, limit);

  res.json(recent.map(formatGuest));
});

// ============================================================
// Check-in Endpoint (Main Logic)
// ============================================================
app.post('/api/checkin', (req, res) => {
  const { query } = req.body;

  if (!query || query.trim() === '') {
    return res.status(400).json({
      status: 'error',
      message: 'Query kosong. Silakan scan QR code atau ketik nama/ID tamu.'
    });
  }

  console.log(`[CHECK-IN] Processing: "${query}"`);

  const guest = findGuestByQuery(query);

  if (!guest) {
    console.log(`[CHECK-IN] Not found: "${query}"`);
    broadcast({
      type: 'checkin:error',
      data: { query, message: 'Tamu tidak ditemukan dalam database' }
    });
    return res.status(404).json({
      status: 'not_found',
      message: `Tamu tidak ditemukan: "${query}"`,
      query
    });
  }

  // Check duplicate
  if (guest.is_present) {
    console.log(`[CHECK-IN] Duplicate: ${guest.name} (${guest.id})`);
    broadcast({
      type: 'checkin:duplicate',
      data: formatGuest(guest)
    });
    return res.status(409).json({
      status: 'duplicate',
      message: `${guest.name} sudah check-in pada ${guest.checked_in_at}`,
      guest: formatGuest(guest)
    });
  }

  // Perform check-in
  const now = new Date().toISOString();
  guest.is_present = true;
  guest.checked_in_at = now;

  // Persist state
  checkinState[guest.id] = { is_present: true, checked_in_at: now };
  saveState();

  console.log(`[CHECK-IN] Success: ${guest.name} (${guest.id}) at ${now}`);

  const stats = getStats();
  const guestData = formatGuest(guest);

  broadcast({ type: 'guest:checkin', data: { guest: guestData, stats } });
  broadcast({ type: 'stats:update', data: stats });

  return res.json({
    status: 'success',
    message: `Selamat datang, ${guest.name}!`,
    guest: guestData,
    stats
  });
});

// Manual check-in by ID
app.post('/api/checkin/:id', (req, res) => {
  const guest = guests.find(g => g.id === req.params.id);
  if (!guest) return res.status(404).json({ status: 'not_found', message: 'Tamu tidak ditemukan' });

  if (guest.is_present) {
    return res.status(409).json({
      status: 'duplicate',
      message: `${guest.name} sudah check-in pada ${guest.checked_in_at}`,
      guest: formatGuest(guest)
    });
  }

  const now = new Date().toISOString();
  guest.is_present = true;
  guest.checked_in_at = now;
  checkinState[guest.id] = { is_present: true, checked_in_at: now };
  saveState();

  const stats = getStats();
  const guestData = formatGuest(guest);
  broadcast({ type: 'guest:checkin', data: { guest: guestData, stats } });
  broadcast({ type: 'stats:update', data: stats });

  return res.json({ status: 'success', message: `Selamat datang, ${guest.name}!`, guest: guestData, stats });
});

// Undo check-in
app.post('/api/undo-checkin/:id', (req, res) => {
  const guest = guests.find(g => g.id === req.params.id);
  if (!guest) return res.status(404).json({ status: 'not_found', message: 'Tamu tidak ditemukan' });
  if (!guest.is_present) return res.status(400).json({ status: 'error', message: 'Tamu belum check-in' });

  guest.is_present = false;
  guest.checked_in_at = null;
  delete checkinState[guest.id];
  saveState();

  const stats = getStats();
  const guestData = formatGuest(guest);
  broadcast({ type: 'guest:undo', data: { guest: guestData, stats } });
  broadcast({ type: 'stats:update', data: stats });

  return res.json({ status: 'success', message: `Check-in ${guest.name} dibatalkan.`, guest: guestData, stats });
});

// ============================================================
// Export to Excel
// ============================================================
app.get('/api/export', (req, res) => {
  const data = guests.map(g => ({
    'No': g.no,
    'ID Tamu': g.id,
    'Nama Tamu': g.name,
    'Kategori': g.category,
    'Status': g.is_present ? 'HADIR' : 'BELUM HADIR',
    'Waktu Check-In': g.checked_in_at ? new Date(g.checked_in_at).toLocaleString('id-ID') : '-',
    'Jumlah Pax': g.pax,
    'Catatan': g.notes
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 5 }, { wch: 10 }, { wch: 30 }, { wch: 25 },
    { wch: 15 }, { wch: 22 }, { wch: 10 }, { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Hadir');

  // Summary sheet
  const stats = getStats();
  const summaryData = [
    { 'Keterangan': 'Total Undangan', 'Jumlah': stats.total },
    { 'Keterangan': 'Tamu Hadir', 'Jumlah': stats.present },
    { 'Keterangan': 'Tamu Belum Hadir', 'Jumlah': stats.absent },
    { 'Keterangan': 'Persentase Kehadiran', 'Jumlah': `${stats.percentage}%` },
    { 'Keterangan': 'Waktu Export', 'Jumlah': new Date().toLocaleString('id-ID') },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 25 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `Daftar_Hadir_Wildan_Aisyah_${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// ============================================================
// Reset all check-ins (for testing)
// ============================================================
app.post('/api/reset', (req, res) => {
  for (const guest of guests) {
    guest.is_present = false;
    guest.checked_in_at = null;
  }
  checkinState = {};
  saveState();

  const stats = getStats();
  broadcast({ type: 'stats:update', data: stats });
  broadcast({ type: 'reset', data: stats });
  console.log('[DB] All check-ins have been reset.');
  res.json({ status: 'success', message: 'Semua check-in telah direset.', stats });
});

// ============================================================
// Start Server
// ============================================================
server.listen(PORT, '0.0.0.0', () => {
  const stats = getStats();
  console.log('');
  console.log('======================================================');
  console.log('  Wedding Check-In Server - Wildan & Aisyah');
  console.log('======================================================');
  console.log(`  HTTP:      http://localhost:${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);
  console.log(`  Guests:    ${stats.total} total | ${stats.present} hadir`);
  console.log('======================================================');
  console.log('');
});
