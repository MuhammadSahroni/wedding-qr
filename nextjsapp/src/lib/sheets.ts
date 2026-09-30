import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { Guest, Stats } from './types';
import localGuestsData from '../data/guests.json';

// In-memory cache for ultra-fast response
let guestsCache: Guest[] = [];
let isLoaded = false;
let isGoogleConnected = false;
let googleDoc: GoogleSpreadsheet | null = null;
let googleSheet: any = null;
// Map guest ID to its GoogleSpreadsheetRow instance for direct updates
const rowMap = new Map<string, GoogleSpreadsheetRow>();

function initializeFromLocalFallback() {
  guestsCache = (localGuestsData as any[]).map((g, index) => ({
    id: g.id || `G${String(index + 1).padStart(4, '0')}`,
    no: g.no || index + 1,
    name: g.name,
    category: g.category || 'Reguler',
    qr_payload: g.qr_payload || `${g.name}|${g.category || ''}`,
    is_present: false,
    checked_in_at: null,
    checkin_method: null,
    is_walkin: false,
    pax: g.pax || 1,
    notes: g.notes || '',
  }));
  isLoaded = true;
  console.log(`[Data] Loaded ${guestsCache.length} guests from local fallback`);
}

export async function initDatabase(): Promise<void> {
  if (isLoaded && guestsCache.length > 0) return;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetTitle = process.env.GOOGLE_SHEET_NAME || 'Daftar Hadir';

  if (!email || !privateKey || !sheetId) {
    console.warn('[Sheets] Google Spreadsheet credentials not set. Falling back to local data.');
    initializeFromLocalFallback();
    return;
  }

  // Handle escaped newline strings
  privateKey = privateKey.replace(/\\n/g, '\n');

  try {
    const auth = new JWT({
      email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, auth);
    await doc.loadInfo();
    googleDoc = doc;

    let sheet = doc.sheetsByTitle[sheetTitle] || doc.sheetsByIndex[0];

    // If sheet has no rows or headers, set standard headers
    if (!sheet) {
      sheet = await doc.addSheet({
        title: sheetTitle,
        headerValues: ['No', 'ID Tamu', 'Nama Tamu', 'Kategori', 'QR Payload', 'Status Hadir', 'Waktu Hadir', 'Metode Checkin', 'Pax', 'Catatan'],
      });
    }

    googleSheet = sheet;
    
    // Ensure header row is set before calling getRows
    try {
      await sheet.loadHeaderRow();
    } catch {
      await sheet.setHeaderRow(['No', 'ID Tamu', 'Nama Tamu', 'Kategori', 'QR Payload', 'Status Hadir', 'Waktu Hadir', 'Metode Checkin', 'Pax', 'Catatan']);
    }

    const rows = await sheet.getRows();

    if (rows.length === 0) {
      console.log('[Sheets] Empty sheet detected, loading local guests and seeding to Google Sheet...');
      initializeFromLocalFallback();
      await seedInitialRows(sheet, guestsCache);
    } else {
      rowMap.clear();
      guestsCache = rows.map((r, i) => {
        const id = (r.get('ID Tamu') || `G${String(i + 1).padStart(4, '0')}`).toString().trim();
        const statusHadir = (r.get('Status Hadir') || '').toString().trim().toUpperCase();
        const isPresent = statusHadir === 'HADIR' || statusHadir === 'TRUE' || statusHadir === '1';

        rowMap.set(id, r);

        return {
          id,
          no: parseInt(r.get('No') || `${i + 1}`, 10) || i + 1,
          name: (r.get('Nama Tamu') || '').toString().trim(),
          category: (r.get('Kategori') || 'Reguler').toString().trim(),
          qr_payload: (r.get('QR Payload') || r.get('Nama Tamu') || '').toString().trim(),
          is_present: isPresent,
          checked_in_at: (r.get('Waktu Hadir') || null)?.toString() || null,
          checkin_method: (r.get('Metode Checkin') || null)?.toString() || null,
          is_walkin: id.startsWith('WALK'),
          pax: parseInt(r.get('Pax') || '1', 10) || 1,
          notes: (r.get('Catatan') || '').toString(),
        };
      });
    }

    isGoogleConnected = true;
    isLoaded = true;
    console.log(`[Sheets] Connected to Google Sheet "${doc.title}". Loaded ${guestsCache.length} guests.`);
  } catch (err: any) {
    console.error('[Sheets] Error connecting to Google Sheets:', err?.message || err);
    initializeFromLocalFallback();
  }
}

async function seedInitialRows(sheet: any, guests: Guest[]) {
  try {
    const rawRows = guests.map(g => ({
      'No': g.no,
      'ID Tamu': g.id,
      'Nama Tamu': g.name,
      'Kategori': g.category,
      'QR Payload': g.qr_payload,
      'Status Hadir': g.is_present ? 'HADIR' : 'BELUM',
      'Waktu Hadir': g.checked_in_at || '',
      'Metode Checkin': g.checkin_method || '',
      'Pax': g.pax,
      'Catatan': g.notes || '',
    }));
    // Batch add
    await sheet.addRows(rawRows);
    console.log(`[Sheets] Successfully seeded ${rawRows.length} guests to Google Sheet!`);
  } catch (e: any) {
    console.error('[Sheets] Failed seeding rows:', e?.message || e);
  }
}

export async function getGuests(): Promise<Guest[]> {
  await initDatabase();
  return guestsCache;
}

export async function getStats(): Promise<Stats> {
  await initDatabase();
  const total = guestsCache.length;
  const present = guestsCache.filter(g => g.is_present).length;
  const absent = total - present;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
  return { total, present, absent, percentage };
}

export function findGuest(query: string): Guest | null {
  if (!query || !query.trim()) return null;
  let term = query.trim().toLowerCase();

  // If query is a URL, attempt to parse ID or query param from it
  if (term.startsWith('http://') || term.startsWith('https://')) {
    try {
      const url = new URL(query.trim());
      const paramId = url.searchParams.get('id') || url.searchParams.get('q') || url.searchParams.get('guest');
      if (paramId) {
        term = paramId.trim().toLowerCase();
      } else {
        const pathSegments = url.pathname.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
          term = decodeURIComponent(pathSegments[pathSegments.length - 1]).trim().toLowerCase();
        }
      }
    } catch {
      // ignore URL parse errors
    }
  }

  // Normalized version without spaces for ID matching (e.g. "hr 0629" vs "hr0629")
  const termNoSpace = term.replace(/\s+/g, '');

  // 1. Exact match QR Payload
  let found = guestsCache.find(g => g.qr_payload.trim().toLowerCase() === term || g.qr_payload.trim().toLowerCase().replace(/\s+/g, '') === termNoSpace);
  if (found) return found;

  // 2. Exact match ID
  found = guestsCache.find(g => g.id.trim().toLowerCase() === term || g.id.trim().toLowerCase().replace(/\s+/g, '') === termNoSpace);
  if (found) return found;

  // 3. Pipe-separated "Name|Category" or "ID|Name" or "Name|ID"
  if (term.includes('|')) {
    const parts = term.split('|').map(s => s.trim());
    for (const part of parts) {
      if (!part) continue;
      const partNoSpace = part.replace(/\s+/g, '');
      found = guestsCache.find(g => 
        g.id.toLowerCase() === part || 
        g.id.toLowerCase().replace(/\s+/g, '') === partNoSpace ||
        g.name.toLowerCase() === part
      );
      if (found) return found;
    }
  }

  // 4. Exact name
  found = guestsCache.find(g => g.name.toLowerCase() === term);
  if (found) return found;

  // 5. Partial name
  found = guestsCache.find(g => g.name.toLowerCase().includes(term));
  if (found) return found;

  // 6. Partial ID
  found = guestsCache.find(g => g.id.toLowerCase().replace(/\s+/g, '').includes(termNoSpace));
  if (found) return found;

  return null;
}

export async function checkin(query: string, method = 'QR Scan'): Promise<{ status: 'success' | 'duplicate' | 'not_found'; guest?: Guest; stats?: Stats; message: string }> {
  await initDatabase();
  const guest = findGuest(query);

  if (!guest) {
    return {
      status: 'not_found',
      message: `Tamu tidak ditemukan untuk query: "${query}"`,
    };
  }

  if (guest.is_present) {
    let sheetRow = rowMap.get(guest.id);
    if (!sheetRow && googleSheet) {
      try {
        const rows = await googleSheet.getRows();
        sheetRow = rows.find((r: any) => 
          (r.get('ID Tamu') || '').toString().trim() === guest.id || 
          (r.get('Nama Tamu') || '').toString().trim().toLowerCase() === guest.name.toLowerCase()
        );
        if (sheetRow) rowMap.set(guest.id, sheetRow);
      } catch (err) {
        console.error('[Sheets] Error finding row in sheet:', err);
      }
    }
    if (sheetRow && sheetRow.get('Status Hadir') !== 'HADIR') {
      sheetRow.set('Status Hadir', 'HADIR');
      sheetRow.set('Waktu Hadir', guest.checked_in_at || new Date().toISOString());
      sheetRow.set('Metode Checkin', guest.checkin_method || method);
      try {
        await sheetRow.save();
      } catch (err) {
        console.error('[Sheets] Error updating row:', err);
      }
    }
    return {
      status: 'duplicate',
      message: `${guest.name} sudah check-in pada ${guest.checked_in_at}`,
      guest,
      stats: await getStats(),
    };
  }

  const now = new Date().toISOString();
  guest.is_present = true;
  guest.checked_in_at = now;
  guest.checkin_method = method;

  // Update in Google Sheet
  let sheetRow = rowMap.get(guest.id);
  if (!sheetRow && googleSheet) {
    try {
      const rows = await googleSheet.getRows();
      sheetRow = rows.find((r: any) => 
        (r.get('ID Tamu') || '').toString().trim() === guest.id || 
        (r.get('Nama Tamu') || '').toString().trim().toLowerCase() === guest.name.toLowerCase()
      );
      if (sheetRow) rowMap.set(guest.id, sheetRow);
    } catch (err) {
      console.error('[Sheets] Error finding row in sheet:', err);
    }
  }

  if (sheetRow) {
    sheetRow.set('Status Hadir', 'HADIR');
    sheetRow.set('Waktu Hadir', now);
    sheetRow.set('Metode Checkin', method);
    try {
      await sheetRow.save();
    } catch (err) {
      console.error('[Sheets] Error updating row:', err);
    }
  }

  const stats = await getStats();
  return {
    status: 'success',
    message: `Selamat datang, ${guest.name}!`,
    guest,
    stats,
  };
}

export async function undoCheckin(id: string): Promise<{ status: 'success' | 'not_found'; guest?: Guest; stats?: Stats; message: string }> {
  await initDatabase();
  const guest = guestsCache.find(g => g.id === id);

  if (!guest) {
    return { status: 'not_found', message: 'Tamu tidak ditemukan.' };
  }

  guest.is_present = false;
  guest.checked_in_at = null;
  guest.checkin_method = null;

  let sheetRow = rowMap.get(guest.id);
  if (!sheetRow && googleSheet) {
    try {
      const rows = await googleSheet.getRows();
      sheetRow = rows.find((r: any) => (r.get('ID Tamu') || '').toString().trim() === guest.id);
      if (sheetRow) rowMap.set(guest.id, sheetRow);
    } catch (err) {
      console.error('[Sheets] Error finding row in sheet:', err);
    }
  }

  if (sheetRow) {
    sheetRow.set('Status Hadir', 'BELUM');
    sheetRow.set('Waktu Hadir', '');
    sheetRow.set('Metode Checkin', '');
    try {
      await sheetRow.save();
    } catch (err) {
      console.error('[Sheets] Error undoing row:', err);
    }
  }

  const stats = await getStats();
  return {
    status: 'success',
    message: `Check-in ${guest.name} berhasil dibatalkan.`,
    guest,
    stats,
  };
}

export async function addWalkin(
  name: string, 
  category = 'Tamu Tambahan', 
  pax = 1, 
  notes = 'Input Mandiri (Walk-in)',
  method = 'Mandiri'
): Promise<{ status: 'success' | 'duplicate'; guest: Guest; stats: Stats; message: string }> {
  await initDatabase();
  const trimmedName = name.trim();

  // Check if walk-in with same name already checked in
  const existing = guestsCache.find(g => g.is_walkin && g.name.toLowerCase() === trimmedName.toLowerCase());
  if (existing && existing.is_present) {
    return {
      status: 'duplicate',
      message: `${existing.name} sudah terdaftar check-in sebelumnya.`,
      guest: existing,
      stats: await getStats(),
    };
  }

  const walkinCount = guestsCache.filter(g => g.is_walkin).length + 1;
  const newId = `WALK${String(walkinCount).padStart(4, '0')}`;
  const now = new Date().toISOString();

  const newGuest: Guest = {
    id: newId,
    no: guestsCache.length + 1,
    name: trimmedName,
    category,
    qr_payload: trimmedName,
    is_present: true,
    checked_in_at: now,
    checkin_method: method,
    is_walkin: true,
    pax,
    notes,
  };

  guestsCache.push(newGuest);

  // Append row to Google Sheets
  if (googleSheet) {
    try {
      const createdRow = await googleSheet.addRow({
        'No': newGuest.no,
        'ID Tamu': newGuest.id,
        'Nama Tamu': newGuest.name,
        'Kategori': newGuest.category,
        'QR Payload': newGuest.qr_payload,
        'Status Hadir': 'HADIR',
        'Waktu Hadir': now,
        'Metode Checkin': method,
        'Pax': newGuest.pax,
        'Catatan': newGuest.notes,
      });
      rowMap.set(newId, createdRow);
    } catch (err: any) {
      console.error('[Sheets] Error adding walkin row:', err);
    }
  }

  const stats = await getStats();
  return {
    status: 'success',
    message: `Selamat datang, ${newGuest.name}!`,
    guest: newGuest,
    stats,
  };
}
