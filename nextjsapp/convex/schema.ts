import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  guests: defineTable({
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
    .index("by_guest_id", ["id"])
    .index("by_qr_payload", ["qr_payload"])
    .index("by_is_present", ["is_present"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["is_present"],
    }),

  // Dedicated real-time events feed for display TV fanfare
  checkin_events: defineTable({
    guest_id: v.string(),
    name: v.string(),
    category: v.string(),
    pax: v.number(),
    checked_in_at: v.string(),
    method: v.string(),
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),
});
