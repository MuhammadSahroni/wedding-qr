import { NextRequest, NextResponse } from 'next/server';
import { undoCheckin } from '@/lib/sheets';
import { broadcastUndo } from '@/lib/pusher-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ status: 'error', message: 'ID Tamu wajib diisi' }, { status: 400 });
    }

    const result = await undoCheckin(id);

    if (result.status === 'not_found') {
      return NextResponse.json(result, { status: 404 });
    }

    if (result.guest && result.stats) {
      await broadcastUndo(result.guest, result.stats);
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('API Undo Error:', err);
    return NextResponse.json({ status: 'error', message: err?.message || 'Server error' }, { status: 500 });
  }
}
