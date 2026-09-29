import { NextRequest, NextResponse } from 'next/server';
import { checkin } from '@/lib/sheets';
import { broadcastCheckin } from '@/lib/pusher-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, method } = body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json(
        { status: 'error', message: 'Query kosong. Silakan scan QR code atau masukkan nama tamu.' },
        { status: 400 }
      );
    }

    const result = await checkin(query, method || 'QR Scan');

    if (result.status === 'not_found') {
      return NextResponse.json(result, { status: 404 });
    }

    if (result.status === 'duplicate') {
      return NextResponse.json(result, { status: 409 });
    }

    // Broadcast check-in event to Pusher (so /display updates in real-time)
    if (result.guest && result.stats) {
      await broadcastCheckin(result.guest, result.stats);
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('API Checkin Error:', err);
    return NextResponse.json(
      { status: 'error', message: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
