import { NextRequest, NextResponse } from 'next/server';
import { getGuests } from '@/lib/sheets';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter');

    let guests = await getGuests();

    if (filter === 'present') {
      guests = guests.filter(g => g.is_present);
    } else if (filter === 'absent') {
      guests = guests.filter(g => !g.is_present);
    }

    return NextResponse.json(guests);
  } catch (err: any) {
    console.error('API Guests Error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to fetch guests' }, { status: 500 });
  }
}
