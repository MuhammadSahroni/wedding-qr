import Pusher from 'pusher';
import { Guest, Stats } from './types';

let pusherInstance: Pusher | null = null;

export function getPusherServer(): Pusher | null {
  if (pusherInstance) return pusherInstance;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'ap1';

  if (!appId || !key || !secret) {
    return null;
  }

  try {
    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
    return pusherInstance;
  } catch (err) {
    console.error('[Pusher] Failed to initialize Pusher server:', err);
    return null;
  }
}

export async function broadcastCheckin(guest: Guest, stats: Stats) {
  const pusher = getPusherServer();
  if (!pusher) return;

  try {
    await pusher.trigger('wedding-checkin', 'guest:checkin', {
      guest,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Pusher] broadcastCheckin error:', err);
  }
}

export async function broadcastUndo(guest: Guest, stats: Stats) {
  const pusher = getPusherServer();
  if (!pusher) return;

  try {
    await pusher.trigger('wedding-checkin', 'guest:undo', {
      guest,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Pusher] broadcastUndo error:', err);
  }
}

export async function broadcastStats(stats: Stats) {
  const pusher = getPusherServer();
  if (!pusher) return;

  try {
    await pusher.trigger('wedding-checkin', 'stats:update', stats);
  } catch (err) {
    console.error('[Pusher] broadcastStats error:', err);
  }
}
