"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

/**
 * Broadcasts a guest check-in event to Pusher from Convex Cloud.
 * This runs server-side so ANY device (tablet, phone, PC) triggering
 * the Convex checkin mutation will push to the display screen via
 * cloud WebSocket — no dependency on same-server SSE bus.
 */
export const broadcastCheckinToPusher = internalAction({
  args: {
    guestId: v.string(),
    name: v.string(),
    category: v.string(),
    pax: v.number(),
    is_walkin: v.boolean(),
    checked_in_at: v.optional(v.string()),
    checkin_method: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.PUSHER_CLUSTER || "ap1";

    if (!appId || !key || !secret) {
      console.warn("[PusherSync] Pusher credentials not configured — skipping broadcast");
      return;
    }

    try {
      const crypto = await import("crypto");

      const channel = "wedding-checkin";
      const eventName = "guest:checkin";

      // Minimal guest payload for the display screen
      const guestPayload = {
        id: args.guestId,
        no: 0,
        name: args.name,
        category: args.category,
        qr_payload: args.guestId,
        is_present: true,
        checked_in_at: args.checked_in_at ?? new Date().toISOString(),
        checkin_method: args.checkin_method,
        is_walkin: args.is_walkin,
        pax: args.pax,
      };

      const body = JSON.stringify({
        name: eventName,
        channel,
        data: JSON.stringify({
          guest: guestPayload,
          timestamp: new Date().toISOString(),
        }),
      });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const md5Body = crypto.createHash("md5").update(body).digest("hex");

      const queryStr = `auth_key=${key}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${md5Body}`;
      const stringToSign = ["POST", `/apps/${appId}/events`, queryStr].join("\n");

      const signature = crypto
        .createHmac("sha256", secret)
        .update(stringToSign)
        .digest("hex");

      const url = `https://api-${cluster}.pusher.com/apps/${appId}/events?${queryStr}&auth_signature=${signature}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[PusherSync] Pusher API error:", res.status, text);
      } else {
        console.log(`[PusherSync] ✅ Broadcasted check-in for ${args.name} to Pusher`);
      }
    } catch (err: any) {
      console.error("[PusherSync] broadcastCheckinToPusher error:", err?.message || err);
    }
  },
});
