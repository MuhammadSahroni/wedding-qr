import fs from 'fs';
import path from 'path';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const equalsIdx = trimmed.indexOf('=');
  if (equalsIdx > 0) {
    const key = trimmed.slice(0, equalsIdx).trim();
    let val = trimmed.slice(equalsIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
}

// 1. Read guests.json
const guestsJsonPath = path.resolve(process.cwd(), 'src/data/guests.json');
const allGuests = JSON.parse(fs.readFileSync(guestsJsonPath, 'utf8'));

// Filter guests from 958 onwards
const newGuests = allGuests.filter(g => g.no >= 958);
console.log(`Found ${newGuests.length} new guests to sync (No 958 - ${allGuests[allGuests.length - 1].no})`);

// 2. Sync to Convex Database
const convexUrl = env.NEXT_PUBLIC_CONVEX_URL || env.CONVEX_URL;
if (!convexUrl) {
  console.error('Convex URL not found in .env.local');
} else {
  console.log(`\n--- 1. Syncing to Convex (${convexUrl}) ---`);
  const client = new ConvexHttpClient(convexUrl);
  
  const batchData = newGuests.map(g => ({
    no: g.no,
    id: g.id,
    name: g.name,
    category: g.category,
    qr_payload: g.qr_payload,
    is_present: false,
    checked_in_at: undefined,
    checkin_method: undefined,
    is_walkin: false,
    pax: g.pax || 1,
    notes: g.notes || '',
  }));

  try {
    const res = await client.mutation(api.guests.seedGuestsBatch, { batch: batchData });
    console.log(`[Convex] Successfully seeded ${res.inserted} new guests into Convex database!`);
  } catch (err) {
    console.error('[Convex] Error seeding to Convex:', err.message || err);
  }
}

// 3. Sync to Google Spreadsheet
const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let privateKey = env.GOOGLE_PRIVATE_KEY;
const sheetId = env.GOOGLE_SPREADSHEET_ID;
const sheetTitle = env.GOOGLE_SHEET_NAME || 'Daftar Hadir';

if (!email || !privateKey || !sheetId) {
  console.warn('\n[Sheets] Google Spreadsheet credentials missing in .env.local, skipping Google Sheet sync.');
} else {
  console.log(`\n--- 2. Syncing to Google Spreadsheet (${sheetId}) ---`);
  try {
    privateKey = privateKey.replace(/\\n/g, '\n');
    const auth = new JWT({
      email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[sheetTitle] || doc.sheetsByIndex[0];
    await sheet.loadHeaderRow();

    const existingRows = await sheet.getRows();
    const existingIds = new Set(
      existingRows.map(r => (r.get('ID Tamu') || '').toString().trim().toUpperCase())
    );

    const rowsToAdd = [];
    for (const g of newGuests) {
      if (!existingIds.has(g.id.toUpperCase())) {
        rowsToAdd.push({
          'No': g.no,
          'ID Tamu': g.id,
          'Nama Tamu': g.name,
          'Kategori': g.category,
          'QR Payload': g.qr_payload,
          'Status Hadir': 'BELUM',
          'Waktu Hadir': '',
          'Metode Checkin': '',
          'Pax': g.pax || 1,
          'Catatan': '',
        });
      } else {
        console.log(`[Sheets] Guest ${g.id} (${g.name}) already exists in Google Sheet.`);
      }
    }

    if (rowsToAdd.length > 0) {
      await sheet.addRows(rowsToAdd);
      console.log(`[Sheets] Successfully added ${rowsToAdd.length} rows to Google Sheet "${sheet.title}"!`);
    } else {
      console.log(`[Sheets] All new guests already exist in Google Sheet.`);
    }
  } catch (err) {
    console.error('[Sheets] Error syncing to Google Spreadsheet:', err.message || err);
  }
}

console.log('\n--- Sync Finished ---');
