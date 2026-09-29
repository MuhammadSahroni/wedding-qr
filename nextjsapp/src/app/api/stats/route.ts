import { NextResponse } from 'next/server';
import { getStats } from '@/lib/sheets';

export async function GET() {
  try {
    const stats = await getStats();
    return NextResponse.json(stats);
  } catch (err: any) {
    console.error('API Stats Error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to fetch stats' }, { status: 500 });
  }
}
