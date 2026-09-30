"use node";

import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

function getGoogleDoc() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!email || !privateKey || !sheetId) {
    throw new Error("Missing Google Service Account credentials in Convex environment");
  }

  // Handle newlines
  privateKey = privateKey.replace(/\\n/g, "\n");

  const auth = new JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return new GoogleSpreadsheet(sheetId, auth);
}

export const syncCheckinToSheet = internalAction({
  args: {
    guestId: v.string(),
    name: v.string(),
    method: v.string(),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const doc = getGoogleDoc();
      await doc.loadInfo();
      const sheetTitle = process.env.GOOGLE_SHEET_NAME || "Daftar Hadir";
      const sheet = doc.sheetsByTitle[sheetTitle] || doc.sheetsByIndex[0];
      await sheet.loadHeaderRow();

      const rows = await sheet.getRows();
      const targetRow = rows.find(
        (r) =>
          (r.get("ID Tamu") || "").toString().trim().toUpperCase() === args.guestId.toUpperCase() ||
          (r.get("Nama Tamu") || "").toString().trim().toLowerCase() === args.name.toLowerCase()
      );

      if (targetRow) {
        targetRow.set("Status Hadir", "HADIR");
        targetRow.set("Waktu Hadir", args.timestamp);
        targetRow.set("Metode Checkin", args.method);
        await targetRow.save();
        console.log(`[SheetsSync] Successfully updated ${args.name} (${args.guestId}) in Google Sheets!`);
      } else {
        console.warn(`[SheetsSync] Row not found in Google Sheet for ${args.name} (${args.guestId})`);
      }
    } catch (err: any) {
      console.error("[SheetsSync] Error syncing checkin to Google Sheet:", err?.message || err);
    }
  },
});

export const syncWalkinToSheet = internalAction({
  args: {
    no: v.number(),
    id: v.string(),
    name: v.string(),
    category: v.string(),
    pax: v.number(),
    notes: v.string(),
    method: v.string(),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const doc = getGoogleDoc();
      await doc.loadInfo();
      const sheetTitle = process.env.GOOGLE_SHEET_NAME || "Daftar Hadir";
      const sheet = doc.sheetsByTitle[sheetTitle] || doc.sheetsByIndex[0];
      await sheet.loadHeaderRow();

      await sheet.addRow({
        No: args.no,
        "ID Tamu": args.id,
        "Nama Tamu": args.name,
        Kategori: args.category,
        "QR Payload": args.name,
        "Status Hadir": "HADIR",
        "Waktu Hadir": args.timestamp,
        "Metode Checkin": args.method,
        Pax: args.pax,
        Catatan: args.notes,
      });
      console.log(`[SheetsSync] Successfully appended walk-in ${args.name} (${args.id}) to Google Sheets!`);
    } catch (err: any) {
      console.error("[SheetsSync] Error appending walkin to Google Sheet:", err?.message || err);
    }
  },
});

export const syncUndoToSheet = internalAction({
  args: {
    guestId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const doc = getGoogleDoc();
      await doc.loadInfo();
      const sheetTitle = process.env.GOOGLE_SHEET_NAME || "Daftar Hadir";
      const sheet = doc.sheetsByTitle[sheetTitle] || doc.sheetsByIndex[0];
      await sheet.loadHeaderRow();

      const rows = await sheet.getRows();
      const targetRow = rows.find(
        (r) => (r.get("ID Tamu") || "").toString().trim().toUpperCase() === args.guestId.toUpperCase()
      );

      if (targetRow) {
        targetRow.set("Status Hadir", "BELUM");
        targetRow.set("Waktu Hadir", "");
        targetRow.set("Metode Checkin", "");
        await targetRow.save();
        console.log(`[SheetsSync] Reverted ${args.guestId} in Google Sheets!`);
      }
    } catch (err: any) {
      console.error("[SheetsSync] Error reverting row in Google Sheet:", err?.message || err);
    }
  },
});
