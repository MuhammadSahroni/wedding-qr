'use client';

import PusherClient from 'pusher-js';

let pusherClientInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  if (typeof window === 'undefined') return null;
  if (pusherClientInstance) return pusherClientInstance;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'ap1';

  if (!key) {
    return null;
  }

  try {
    pusherClientInstance = new PusherClient(key, {
      cluster,
      forceTLS: true,
    });
    return pusherClientInstance;
  } catch (err) {
    console.warn('[Pusher Client] Could not initialize pusher-js:', err);
    return null;
  }
}
