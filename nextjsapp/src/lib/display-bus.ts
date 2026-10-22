import { Guest, Stats } from './types';

export interface DisplayEvent {
  id: string;
  type: 'checkin';
  guest: Guest;
  stats?: Stats;
  timestamp: number;
}

export interface DisplayStateSnapshot {
  activeGuest: Guest | null;
  displayStartedAt: number;
  stats: Stats | null;
  latestEventId: string;
}

// Global in-memory bus across API route invocations in Node.js
// Stored on globalThis to persist through hot-reloads and route transitions
interface GlobalDisplayBus {
  recentEvents: DisplayEvent[];
  activeGuest: Guest | null;
  displayStartedAt: number;
  latestStats: Stats | null;
  listeners: Set<(event: DisplayEvent) => void>;
}

const globalBus = globalThis as unknown as { __DISPLAY_BUS__?: GlobalDisplayBus };

if (!globalBus.__DISPLAY_BUS__) {
  globalBus.__DISPLAY_BUS__ = {
    recentEvents: [],
    activeGuest: null,
    displayStartedAt: 0,
    latestStats: null,
    listeners: new Set(),
  };
}

const bus = globalBus.__DISPLAY_BUS__;

export function emitDisplayEvent(guest: Guest, stats?: Stats): DisplayEvent {
  const now = Date.now();
  const event: DisplayEvent = {
    id: `evt_${now}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'checkin',
    guest,
    stats,
    timestamp: now,
  };

  bus.activeGuest = guest;
  bus.displayStartedAt = now;
  if (stats) bus.latestStats = stats;

  // Keep last 40 events
  bus.recentEvents.push(event);
  if (bus.recentEvents.length > 40) {
    bus.recentEvents.shift();
  }

  // Notify all active SSE listeners
  bus.listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.warn('[DisplayBus] Listener notify error:', err);
    }
  });

  return event;
}

export function subscribeDisplayEvents(listener: (event: DisplayEvent) => void): () => void {
  bus.listeners.add(listener);
  return () => {
    bus.listeners.delete(listener);
  };
}

export function getDisplayState(): DisplayStateSnapshot {
  const now = Date.now();
  // Active guest expires after 5.5 seconds
  const isActive = bus.activeGuest && (now - bus.displayStartedAt < 5500);

  const lastEvent = bus.recentEvents[bus.recentEvents.length - 1];

  return {
    activeGuest: isActive ? bus.activeGuest : null,
    displayStartedAt: bus.displayStartedAt,
    stats: bus.latestStats,
    latestEventId: lastEvent ? lastEvent.id : '',
  };
}

export function getEventsSince(lastId?: string): DisplayEvent[] {
  if (!lastId) return bus.recentEvents.slice(-5);
  const index = bus.recentEvents.findIndex((e) => e.id === lastId);
  if (index === -1) return bus.recentEvents.slice(-5);
  return bus.recentEvents.slice(index + 1);
}
