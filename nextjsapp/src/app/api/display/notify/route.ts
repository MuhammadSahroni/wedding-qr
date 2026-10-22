import { NextRequest, NextResponse } from 'next/server';
import { emitDisplayEvent } from '@/lib/display-bus';
import { broadcastCheckin } from '@/lib/pusher-server';
import { getStats } from '@/lib/sheets';
import { Guest } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const guest: Guest = body.guest;
    let stats = body.stats;

    if (!guest || !guest.name) {
      return NextResponse.json(
        { status: 'error', message: 'Data tamu tidak valid' },
        { status: 400 }
      );
    }

    if (body.isDuplicate) {
      return NextResponse.json(
        { status: 'ignored', message: 'Tamu sudah check-in, diabaikan dari layar display' },
        { status: 200 }
      );
    }

    if (!stats) {
      try {
        stats = await getStats();
      } catch {
        // Fallback
      }
    }

    // 1. Emit to Local Display Bus (SSE & Poll for any device on LAN)
    const event = emitDisplayEvent(guest, stats);

    // 2. Broadcast to Pusher (for any device on WAN)
    if (stats) {
      broadcastCheckin(guest, stats).catch((e) =>
        console.warn('[Display Notify] Pusher broadcast error:', e)
      );
    }

    return NextResponse.json({
      status: 'ok',
      eventId: event.id,
      timestamp: event.timestamp,
    });
  } catch (err: any) {
    console.error('[Display Notify] Error:', err);
    return NextResponse.json(
      { status: 'error', message: err?.message || 'Server error' },
      { status: 500 }
    );
  }
}
