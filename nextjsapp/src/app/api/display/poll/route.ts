import { NextRequest, NextResponse } from 'next/server';
import { getDisplayState, getEventsSince } from '@/lib/display-bus';
import { getStats } from '@/lib/sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sinceId = searchParams.get('since') || undefined;

    const state = getDisplayState();
    const newEvents = getEventsSince(sinceId);

    // If bus stats isn't populated yet, fetch from sheets cache
    let currentStats = state.stats;
    if (!currentStats) {
      try {
        currentStats = await getStats();
      } catch {
        currentStats = null;
      }
    }

    return NextResponse.json({
      status: 'ok',
      isOnline: true,
      activeGuest: state.activeGuest,
      displayStartedAt: state.displayStartedAt,
      stats: currentStats,
      latestEventId: state.latestEventId,
      newEvents,
      serverTime: Date.now(),
    });
  } catch (err: any) {
    console.error('[Display Poll] Error:', err);
    return NextResponse.json(
      { status: 'error', message: err?.message || 'Server error' },
      { status: 500 }
    );
  }
}
