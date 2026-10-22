import { NextRequest } from 'next/server';
import { subscribeDisplayEvents, getDisplayState, DisplayEvent } from '@/lib/display-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection packet with current state
      const initial = getDisplayState();
      const initMessage = `event: connected\ndata: ${JSON.stringify(initial)}\n\n`;
      controller.enqueue(encoder.encode(initMessage));

      // Subscribe to all subsequent checkin events
      const unsubscribe = subscribeDisplayEvents((event: DisplayEvent) => {
        try {
          const message = `event: checkin\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (err) {
          console.warn('[Display SSE] Controller enqueue error:', err);
        }
      });

      // Keepalive ping every 15 seconds to keep connection open on all proxy/NAT setups
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch (err) {
          clearInterval(pingInterval);
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform, no-store',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
