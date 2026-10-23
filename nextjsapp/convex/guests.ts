import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { enqueueGuestForDisplay } from "./display";

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const allGuests = await ctx.db.query("guests").collect();
    const total = allGuests.length;
    const present = allGuests.filter((g) => g.is_present).length;
    const absent = total - present;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, percentage };
  },
});

export const getRecentCheckins = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 15;
    const presentGuests = await ctx.db
      .query("guests")
      .withIndex("by_is_present", (q) => q.eq("is_present", true))
      .collect();

    // Sort by checked_in_at desc
    return presentGuests
      .sort((a, b) => {
        const timeA = a.checked_in_at ? new Date(a.checked_in_at).getTime() : 0;
        const timeB = b.checked_in_at ? new Date(b.checked_in_at).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, limit);
  },
});

export const getLatestEvent = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("checkin_events")
      .withIndex("by_timestamp")
      .order("desc")
      .take(1);
    return events.length > 0 ? events[0] : null;
  },
});

/**
 * Reactive query for the Display TV screen.
 * Returns the most recent checkin event (with its timestamp) and current stats.
 * The display page subscribes to this — whenever a new guest checks in,
 * Convex pushes the update to ALL subscribed display devices in real-time,
 * regardless of which device triggered the checkin.
 *
 * Unlike display_queue (which transitions through states quickly),
 * checkin_events are permanent records — no race with display_queue timing.
 */
export const getLatestCheckinForDisplay = query({
  args: {},
  handler: async (ctx) => {
    // Most recent checkin event
    const latestEvent = await ctx.db
      .query("checkin_events")
      .withIndex("by_timestamp")
      .order("desc")
      .take(1);

    // Stats: use indexed queries for efficiency
    const allGuests = await ctx.db.query("guests").collect();
    const total = allGuests.length;
    const present = allGuests.filter((g) => g.is_present).length;

    return {
      latestEvent: latestEvent.length > 0 ? {
        _id: latestEvent[0]._id,
        guest_id: latestEvent[0].guest_id,
        name: latestEvent[0].name,
        category: latestEvent[0].category,
        pax: latestEvent[0].pax,
        checked_in_at: latestEvent[0].checked_in_at,
        method: latestEvent[0].method,
        timestamp: latestEvent[0].timestamp,
      } : null,
      stats: {
        total,
        present,
        absent: total - present,
        percentage: total > 0 ? Math.round((present / total) * 100) : 0,
      },
    };
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const term = args.query.trim().toLowerCase();
    if (!term || term.length < 2) return [];

    const termNoSpace = term.replace(/\s+/g, "");
    const allGuests = await ctx.db.query("guests").collect();

    return allGuests
      .filter((g) => {
        const nameLower = g.name.toLowerCase();
        const idLower = g.id.toLowerCase();
        const catLower = g.category.toLowerCase();
        const idNoSpace = idLower.replace(/\s+/g, "");

        return (
          nameLower.includes(term) ||
          idLower.includes(term) ||
          idNoSpace.includes(termNoSpace) ||
          catLower.includes(term)
        );
      })
      .slice(0, 20);
  },
});

export const checkin = mutation({
  args: {
    query: v.string(),
    method: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let term = args.query.trim().toLowerCase();
    if (!term) {
      return { status: "not_found", message: "Kode QR atau nama kosong" };
    }

    // Parse URL if scanned from web link (e.g. ?id=SDI0143)
    if (term.startsWith("http://") || term.startsWith("https://")) {
      try {
        const url = new URL(args.query.trim());
        const paramId =
          url.searchParams.get("id") ||
          url.searchParams.get("q") ||
          url.searchParams.get("guest");
        if (paramId) {
          term = paramId.trim().toLowerCase();
        } else {
          const segments = url.pathname.split("/").filter(Boolean);
          if (segments.length > 0) {
            term = decodeURIComponent(segments[segments.length - 1]).trim().toLowerCase();
          }
        }
      } catch {
        // ignore url parse error
      }
    }

    const termNoSpace = term.replace(/\s+/g, "");
    const allGuests = await ctx.db.query("guests").collect();

    // 1. Exact match QR Payload
    let target = allGuests.find(
      (g) =>
        g.qr_payload.toLowerCase() === term ||
        g.qr_payload.toLowerCase().replace(/\s+/g, "") === termNoSpace
    );

    // 2. Exact match ID
    if (!target) {
      target = allGuests.find(
        (g) =>
          g.id.toLowerCase() === term ||
          g.id.toLowerCase().replace(/\s+/g, "") === termNoSpace
      );
    }

    // 3. Pipe-separated matching
    if (!target && term.includes("|")) {
      const parts = term.split("|").map((p) => p.trim().toLowerCase());
      for (const part of parts) {
        const partNoSpace = part.replace(/\s+/g, "");
        target = allGuests.find(
          (g) =>
            g.id.toLowerCase() === part ||
            g.id.toLowerCase().replace(/\s+/g, "") === partNoSpace ||
            g.name.toLowerCase() === part
        );
        if (target) break;
      }
    }

    // 4. Exact Name Match
    if (!target) {
      target = allGuests.find((g) => g.name.toLowerCase() === term);
    }

    // 5. Partial Name Match
    if (!target) {
      target = allGuests.find((g) => g.name.toLowerCase().includes(term));
    }

    if (!target) {
      return {
        status: "not_found",
        message: `Tamu tidak ditemukan untuk: "${args.query}"`,
      };
    }

    const checkinMethod = args.method ?? "QR Scan";

    if (target.is_present) {
      // Sync to Google Sheet even on duplicate checkin in case it was missed
      await ctx.scheduler.runAfter(0, internal.sheetsSync.syncCheckinToSheet, {
        guestId: target.id,
        name: target.name,
        method: target.checkin_method || checkinMethod,
        timestamp: target.checked_in_at || new Date().toISOString(),
      });
      return {
        status: "duplicate",
        message: `${target.name} sudah tercatat hadir pada ${target.checked_in_at || "sebelumnya"}.`,
        guest: target,
      };
    }

    const now = new Date().toISOString();

    // Update guest
    await ctx.db.patch(target._id, {
      is_present: true,
      checked_in_at: now,
      checkin_method: checkinMethod,
    });

    const updatedGuest = {
      ...target,
      is_present: true,
      checked_in_at: now,
      checkin_method: checkinMethod,
    };

    // Emit live event for display TV (legacy backwards compatibility)
    await ctx.db.insert("checkin_events", {
      guest_id: target.id,
      name: target.name,
      category: target.category,
      pax: target.pax,
      checked_in_at: now,
      method: checkinMethod,
      timestamp: Date.now(),
    });

    // Enqueue guest for 5-second TV display queue with Convex Scheduler
    await enqueueGuestForDisplay(ctx, {
      guest_id: target.id,
      name: target.name,
      category: target.category,
      pax: target.pax,
      checked_in_at: now,
      method: checkinMethod,
    });

    // Broadcast to Pusher from Convex Cloud (server-side) so ANY device
    // scanning (tablet, iPad, PC) triggers the display screen across WAN.
    await ctx.scheduler.runAfter(0, internal.pusherSync.broadcastCheckinToPusher, {
      guestId: target.id,
      name: target.name,
      category: target.category,
      pax: target.pax,
      is_walkin: target.is_walkin ?? false,
      checked_in_at: now,
      checkin_method: checkinMethod,
    });

    // Sync directly to Google Spreadsheet from Convex Cloud!
    await ctx.scheduler.runAfter(0, internal.sheetsSync.syncCheckinToSheet, {
      guestId: target.id,
      name: target.name,
      method: checkinMethod,
      timestamp: now,
    });

    return {
      status: "success",
      message: `Selamat datang, ${target.name}!`,
      guest: updatedGuest,
    };
  },
});

export const undoCheckin = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const target = await ctx.db
      .query("guests")
      .withIndex("by_guest_id", (q) => q.eq("id", args.id))
      .first();

    if (!target) {
      return { status: "not_found", message: "Tamu tidak ditemukan" };
    }

    await ctx.db.patch(target._id, {
      is_present: false,
      checked_in_at: undefined,
      checkin_method: undefined,
    });

    // Remove from display queue if still waiting
    const queuedDisplay = await ctx.db
      .query("display_queue")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .filter((q) => q.eq(q.field("guest_id"), args.id))
      .first();

    if (queuedDisplay) {
      await ctx.db.delete(queuedDisplay._id);
    }

    // Sync undo directly to Google Spreadsheet from Convex Cloud!
    await ctx.scheduler.runAfter(0, internal.sheetsSync.syncUndoToSheet, {
      guestId: target.id,
    });

    return {
      status: "success",
      message: `Check-in ${target.name} berhasil dibatalkan`,
      guest: { ...target, is_present: false, checked_in_at: undefined, checkin_method: undefined },
    };
  },
});

export const addWalkin = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    pax: v.number(),
    notes: v.optional(v.string()),
    method: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmed = args.name.trim();
    if (!trimmed) {
      throw new Error("Nama tamu tidak boleh kosong");
    }

    const allGuests = await ctx.db.query("guests").collect();
    const existing = allGuests.find(
      (g) => g.is_walkin && g.name.toLowerCase() === trimmed.toLowerCase() && g.is_present
    );

    if (existing) {
      return {
        status: "duplicate",
        message: `${existing.name} sudah terdaftar hadir sebelumnya.`,
        guest: existing,
      };
    }

    const walkinCount = allGuests.filter((g) => g.is_walkin).length + 1;
    const newId = `WALK${String(walkinCount).padStart(4, "0")}`;
    const now = new Date().toISOString();
    const method = args.method || "Mandiri";

    const newGuest = {
      no: allGuests.length + 1,
      id: newId,
      name: trimmed,
      category: args.category || "Tamu Tambahan",
      qr_payload: trimmed,
      is_present: true,
      checked_in_at: now,
      checkin_method: method,
      is_walkin: true,
      pax: args.pax || 1,
      notes: args.notes || (method === "Mandiri" ? "Check-In Mandiri (Walk-In)" : "Input Panitia (Walk-In)"),
    };

    const docId = await ctx.db.insert("guests", newGuest);

    // Emit live event for display TV (legacy backwards compatibility)
    await ctx.db.insert("checkin_events", {
      guest_id: newId,
      name: trimmed,
      category: newGuest.category,
      pax: newGuest.pax,
      checked_in_at: now,
      method: method,
      timestamp: Date.now(),
    });

    // Enqueue walk-in guest for 5-second TV display queue with Convex Scheduler
    await enqueueGuestForDisplay(ctx, {
      guest_id: newId,
      name: trimmed,
      category: newGuest.category,
      pax: newGuest.pax,
      checked_in_at: now,
      method: method,
    });

    // Broadcast walk-in to Pusher from Convex Cloud (server-side)
    await ctx.scheduler.runAfter(0, internal.pusherSync.broadcastCheckinToPusher, {
      guestId: newId,
      name: trimmed,
      category: newGuest.category,
      pax: newGuest.pax,
      is_walkin: true,
      checked_in_at: now,
      checkin_method: method,
    });

    // Sync walk-in directly to Google Spreadsheet from Convex Cloud!
    await ctx.scheduler.runAfter(0, internal.sheetsSync.syncWalkinToSheet, {
      no: newGuest.no,
      id: newId,
      name: trimmed,
      category: newGuest.category,
      pax: newGuest.pax,
      notes: newGuest.notes,
      method: method,
      timestamp: now,
    });

    return {
      status: "success",
      message: `Selamat datang, ${trimmed}!`,
      guest: { _id: docId, ...newGuest },
    };
  },
});

// Batch seeder to import all 957 wedding guests from JSON
export const seedGuestsBatch = mutation({
  args: {
    batch: v.array(
      v.object({
        no: v.number(),
        id: v.string(),
        name: v.string(),
        category: v.string(),
        qr_payload: v.string(),
        is_present: v.boolean(),
        checked_in_at: v.optional(v.string()),
        checkin_method: v.optional(v.string()),
        is_walkin: v.boolean(),
        pax: v.number(),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    for (const g of args.batch) {
      const existing = await ctx.db
        .query("guests")
        .withIndex("by_guest_id", (q) => q.eq("id", g.id))
        .first();

      if (!existing) {
        await ctx.db.insert("guests", g);
        inserted++;
      }
    }
    return { inserted };
  },
});
