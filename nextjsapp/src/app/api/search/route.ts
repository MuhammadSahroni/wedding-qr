import { NextRequest, NextResponse } from 'next/server';
import { getGuests } from '@/lib/sheets';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');

    if (!q || !q.trim()) {
      return NextResponse.json([]);
    }

    const term = q.trim().toLowerCase();
    const guests = await getGuests();

    const results = guests.filter(g =>
      g.name.toLowerCase().includes(term) ||
      g.id.toLowerCase().includes(term) ||
      g.category.toLowerCase().includes(term)
    ).slice(0, 20);

    return NextResponse.json(results);
  } catch (err: any) {
    console.error('API Search Error:', err);
    return NextResponse.json({ error: err?.message || 'Search failed' }, { status: 500 });
  }
}
