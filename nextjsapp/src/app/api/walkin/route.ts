import { NextRequest, NextResponse } from 'next/server';
import { addWalkin } from '@/lib/sheets';
import { broadcastCheckin } from '@/lib/pusher-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, category, pax, notes, method } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ status: 'error', message: 'Nama tamu wajib diisi' }, { status: 400 });
    }

    const result = await addWalkin(
      name, 
      category || 'Tamu Tambahan', 
      pax || 1, 
      notes || 'Input Mandiri (Walk-in)',
      method || 'Mandiri'
    );

    if (result.status === 'duplicate') {
      return NextResponse.json(result, { status: 409 });
    }

    if (result.guest && result.stats) {
      await broadcastCheckin(result.guest, result.stats);
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('API Walkin Error:', err);
    return NextResponse.json({ status: 'error', message: err?.message || 'Server error' }, { status: 500 });
  }
}
