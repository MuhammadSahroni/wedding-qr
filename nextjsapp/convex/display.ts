import { mutation, query, internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Enqueue a guest for TV display.
 * If no guest is currently displaying, starts displaying immediately
 * and schedules advanceQueue after 5000ms using Convex scheduler.
 * If a guest is already displaying, queues the new guest to be shown in order.
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
    // If the active item started within the last 7 seconds, it's still actively showing
    if (now - (item.displayStartedAt ?? 0) < 7000) {
      hasActive = true;
    } else {
      // Expired/stale active item, mark completed
      await ctx.db.patch(item._id, { status: "completed" });
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

    // Schedule advancing the queue in exactly 5000ms via Convex Scheduler!
    await ctx.scheduler.runAfter(5000, internal.display.advanceQueue, {});
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
 * Marks currently displaying item as completed,
 * picks the next queued guest (FIFO), sets status to displaying,
 * and schedules the next advance in 5000ms.
 */
export const advanceQueue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Mark any displaying items as completed
    const activeItems = await ctx.db
      .query("display_queue")
      .withIndex("by_status", (q) => q.eq("status", "displaying"))
      .collect();

    for (const item of activeItems) {
      await ctx.db.patch(item._id, { status: "completed" });
    }

    // 2. Fetch the oldest queued guest (FIFO order)
    const nextItem = await ctx.db
      .query("display_queue")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();

    if (nextItem) {
      // Mark as displaying
      await ctx.db.patch(nextItem._id, {
        status: "displaying",
        displayStartedAt: now,
      });

      // Schedule the next transition in 5000ms
      await ctx.scheduler.runAfter(5000, internal.display.advanceQueue, {});
    }
  },
});

/**
 * Watchdog cron job running periodically (every 1 minute)
 * to recover any stalled queue and clean up old completed entries (> 24 hours).
 */
export const watchdogQueue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Check if there are queued guests waiting
    const queuedFirst = await ctx.db
      .query("display_queue")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();

    if (queuedFirst) {
      // Check if displaying item is absent or stale (> 7000ms)
      const displaying = await ctx.db
        .query("display_queue")
        .withIndex("by_status", (q) => q.eq("status", "displaying"))
        .first();

      const isStale = displaying && (now - (displaying.displayStartedAt ?? 0) > 7000);

      if (!displaying || isStale) {
        if (displaying) {
          await ctx.db.patch(displaying._id, { status: "completed" });
        }

        await ctx.db.patch(queuedFirst._id, {
          status: "displaying",
          displayStartedAt: now,
        });

        await ctx.scheduler.runAfter(5000, internal.display.advanceQueue, {});
      }
    }

    // Cleanup old completed records older than 24 hours
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
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
 * Returns the currently active guest and the queue length.
 */
export const getCurrentDisplay = query({
  args: {},
  handler: async (ctx) => {
    const active = await ctx.db
      .query("display_queue")
      .withIndex("by_status", (q) => q.eq("status", "displaying"))
      .first();

    const queuedItems = await ctx.db
      .query("display_queue")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .collect();

    return {
      active: active
        ? {
            _id: active._id,
            guest_id: active.guest_id,
            name: active.name,
            category: active.category,
            pax: active.pax,
            checked_in_at: active.checked_in_at,
            method: active.method,
            displayStartedAt: active.displayStartedAt || active.createdAt,
          }
        : null,
      queueCount: queuedItems.length,
      nextGuest: queuedItems.length > 0 ? queuedItems[0].name : null,
      queueList: queuedItems.slice(0, 5).map((q) => ({ id: q.guest_id, name: q.name })),
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
      await ctx.db.patch(item._id, { status: "completed" });
    }
    return { cleared: activeOrQueued.length };
  },
});
