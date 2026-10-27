import { mutation, query, internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";

// Exact display duration: 5 seconds per guest
export const DISPLAY_DURATION_MS = 5000;
// Grace period before an active display item is considered stale (5s + 2s grace)
export const STALE_THRESHOLD_MS = 7000;

/**
 * Enqueue a guest for TV display.
 * - If no guest is currently displaying, starts displaying immediately
 *   and schedules advanceQueue after 5000ms using Convex scheduler.
 * - If a guest is already displaying, queues the new guest to be shown in order (FIFO).
 */
export async function enqueueGuestForDisplay(
  ctx: MutationCtx,
  guest: {
    guest_id: string;
    name: string;
    category: string;
    pax: number;
    checked_in_at: string;
    method: string;
  }
) {
  const now = Date.now();

  // Find currently displaying items
  const activeItems = await ctx.db
    .query("display_queue")
    .withIndex("by_status", (q) => q.eq("status", "displaying"))
    .collect();

  let hasActive = false;
  for (const item of activeItems) {
    if (now - (item.displayStartedAt ?? 0) < STALE_THRESHOLD_MS) {
      hasActive = true;
    } else {
      // Expired/stale active item, mark done
      await ctx.db.patch(item._id, { status: "done" });
    }
  }

  if (!hasActive) {
    // No active display right now: Start displaying this guest immediately!
    await ctx.db.insert("display_queue", {
      ...guest,
      status: "displaying",
      createdAt: now,
      displayStartedAt: now,
    });

    // Schedule advancing the queue in exactly 5000ms via Convex Scheduler
    await ctx.scheduler.runAfter(DISPLAY_DURATION_MS, internal.display.advanceQueue, {});
  } else {
    // Active display is already running! Place this guest into the waiting queue.
    await ctx.db.insert("display_queue", {
      ...guest,
      status: "queued",
      createdAt: now,
    });
  }
}

/**
 * Advances the display queue:
 * 1. Sweeper: Marks currently displaying item(s) as "done".
 * 2. Fetches the oldest queued guest (FIFO order).
 * 3. Immediately transitions the next guest to "displaying" for 5000ms.
 * 4. Schedules the next advanceQueue in 5000ms.
 */
export const advanceQueue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Mark any displaying items as "done" (sweeper)
    const activeItems = await ctx.db
      .query("display_queue")
      .withIndex("by_status", (q) => q.eq("status", "displaying"))
      .collect();

    for (const item of activeItems) {
      await ctx.db.patch(item._id, { status: "done" });
    }

    // 2. Fetch the oldest queued guest (FIFO order)
    const nextItem = await ctx.db
      .query("display_queue")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();

    if (nextItem) {
      // 3. Mark next item as displaying immediately (eliminates race condition window)
      await ctx.db.patch(nextItem._id, {
        status: "displaying",
        displayStartedAt: now,
      });

      // 4. Schedule next advance in exactly 5000ms
      await ctx.scheduler.runAfter(DISPLAY_DURATION_MS, internal.display.advanceQueue, {});
    }
  },
});

/**
 * Watchdog & Sweeper cron job running periodically (every 1 minute)
 * to recover any stalled queue and clean up old done/completed entries (> 24 hours).
 */
export const watchdogQueue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Sweeper: check if any displaying item is stale (> 7000ms)
    const activeItems = await ctx.db
      .query("display_queue")
      .withIndex("by_status", (q) => q.eq("status", "displaying"))
      .collect();

    let hasValidActive = false;
    for (const item of activeItems) {
      if (now - (item.displayStartedAt ?? 0) >= STALE_THRESHOLD_MS) {
        await ctx.db.patch(item._id, { status: "done" });
      } else {
        hasValidActive = true;
      }
    }

    // 2. Check if there are queued guests waiting while nothing is displaying
    if (!hasValidActive) {
      const queuedFirst = await ctx.db
        .query("display_queue")
        .withIndex("by_status_createdAt", (q) => q.eq("status", "queued"))
        .order("asc")
        .first();

      if (queuedFirst) {
        await ctx.db.patch(queuedFirst._id, {
          status: "displaying",
          displayStartedAt: now,
        });

        await ctx.scheduler.runAfter(DISPLAY_DURATION_MS, internal.display.advanceQueue, {});
      }
    }

    // 3. Cleanup old done / completed records older than 24 hours
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oldDone = await ctx.db
      .query("display_queue")
      .withIndex("by_status_createdAt", (q) =>
        q.eq("status", "done").lt("createdAt", oneDayAgo)
      )
      .take(50);

    for (const item of oldDone) {
      await ctx.db.delete(item._id);
    }

    const oldCompleted = await ctx.db
      .query("display_queue")
      .withIndex("by_status_createdAt", (q) =>
        q.eq("status", "completed").lt("createdAt", oneDayAgo)
      )
      .take(50);

    for (const item of oldCompleted) {
      await ctx.db.delete(item._id);
    }
  },
});

/**
 * Reactive query for Display TV:
 * Returns the currently active guest (valid for 5s), queue count, and live stats.
 */
export const getCurrentDisplay = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const active = await ctx.db
      .query("display_queue")
      .withIndex("by_status", (q) => q.eq("status", "displaying"))
      .first();

    const isStale = active && active.displayStartedAt && (now - active.displayStartedAt > STALE_THRESHOLD_MS);
    const validActive = active && !isStale ? active : null;

    const queuedItems = await ctx.db
      .query("display_queue")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .collect();

    // Real-time guest attendance statistics
    const allGuests = await ctx.db.query("guests").collect();
    const total = allGuests.length;
    const present = allGuests.filter((g) => g.is_present).length;

    return {
      active: validActive
        ? {
            _id: validActive._id,
            guest_id: validActive.guest_id,
            name: validActive.name,
            category: validActive.category,
            pax: validActive.pax,
            checked_in_at: validActive.checked_in_at,
            method: validActive.method,
            displayStartedAt: validActive.displayStartedAt || validActive.createdAt,
          }
        : null,
      queueCount: queuedItems.length,
      nextGuest: queuedItems.length > 0 ? queuedItems[0].name : null,
      queueList: queuedItems.slice(0, 5).map((q) => ({ id: q.guest_id, name: q.name })),
      stats: {
        total,
        present,
        absent: total - present,
        percentage: total > 0 ? Math.round((present / total) * 100) : 0,
      },
    };
  },
});

/**
 * Mutation to reset/clear the display queue (useful for testing or panitia reset)
 */
export const resetDisplayQueue = mutation({
  args: {},
  handler: async (ctx) => {
    const activeOrQueued = await ctx.db
      .query("display_queue")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "displaying"),
          q.eq(q.field("status"), "queued")
        )
      )
      .collect();

    for (const item of activeOrQueued) {
      await ctx.db.patch(item._id, { status: "done" });
    }
    return { cleared: activeOrQueued.length };
  },
});
