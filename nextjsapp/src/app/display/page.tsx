'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { playWelcomeSound, initDisplayAudio, unlockAudio } from '@/lib/audio-display';
import { Guest, Stats } from '@/lib/types';
import Pusher from 'pusher-js';
import '@/styles/display.css';

export default function DisplayPage() {
  const [currentGuest, setCurrentGuest] = useState<Guest | null>(null);
  const [isGreeting, setIsGreeting] = useState(false);
  const [clock, setClock] = useState('');
  const [greetingKey, setGreetingKey] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [isCounterBumped, setIsCounterBumped] = useState(false);
  const [, setLastScannedCode] = useState<string>('');
  const [queueCount, setQueueCount] = useState<number>(0);
  const prevCountRef = useRef<number | null>(null);

  // Connectivity states
  const [isPusherConnected, setIsPusherConnected] = useState(false);

  // ─── PRIMARY ENGINE: Convex Reactive Subscription ───────────────────────────
  // This is the ONE reliable cross-device channel.
  // `getLatestCheckinForDisplay` returns the newest checkin_events row + live stats.
  // Convex pushes updates to ALL subscribed devices (display TV, tablets, phones)
  // whenever ANY device triggers a checkin mutation.
  const liveDisplay = useQuery(api.guests.getLatestCheckinForDisplay);

  // Convex mutation for hardware scanner on this display device
  const checkinMutation = useMutation(api.guests.checkin);

  // ─── Refs ────────────────────────────────────────────────────────────────────
  const lastShownEventIdRef = useRef<string | null>(null);
  const hardwareScanBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const isProcessingScanRef = useRef<boolean>(false);
  const seenPusherEventsRef = useRef<Set<string>>(new Set());

  // Queue and timing refs for 3s display + 1s jeda between queued guests
  const clientQueueRef = useRef<Guest[]>([]);
  const isDisplayingGreetingRef = useRef<boolean>(false);
  const greetingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const jedaTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Connection status ───────────────────────────────────────────────────────
  // Connected if Convex query has returned any value (including null)
  const isConvexConnected = liveDisplay !== undefined;
  const isOnline = isConvexConnected || isPusherConnected;

  // ─── Stats from Convex ───────────────────────────────────────────────────────
  const stats: Stats = useMemo(() => {
    if (liveDisplay?.stats && liveDisplay.stats.total > 0) return liveDisplay.stats;
    return { total: 978, present: 0, absent: 978, percentage: 0 };
  }, [liveDisplay]);

  // ─── Display a single guest card for exactly 3s, then 1s jeda ───────────────
  const showGuestCard = useCallback((guest: Guest) => {
    isDisplayingGreetingRef.current = true;
    setCurrentGuest(guest);
    setIsGreeting(true);
    setGreetingKey((prev) => prev + 1);
    setIsCounterBumped(true);
    setTimeout(() => setIsCounterBumped(false), 1200);

    playWelcomeSound();

    if (greetingTimeoutRef.current) clearTimeout(greetingTimeoutRef.current);
    if (jedaTimeoutRef.current) clearTimeout(jedaTimeoutRef.current);

    greetingTimeoutRef.current = setTimeout(() => {
      setIsGreeting(false);
      setCurrentGuest(null);

      jedaTimeoutRef.current = setTimeout(() => {
        if (clientQueueRef.current.length > 0) {
          const nextGuest = clientQueueRef.current.shift()!;
          setQueueCount(clientQueueRef.current.length);
          showGuestCard(nextGuest);
        } else {
          isDisplayingGreetingRef.current = false;
          setQueueCount(0);
        }
      }, 1000);
    }, 3000);
  }, []);

  // ─── Queue a guest for display (dedup by event ID, not guest ID) ─────────────
  // We deduplicate by EVENT ID (checkin_events._id or pusher event key),
  // NOT by guest.id — this allows re-scanning if a guest is re-checked in.
  const enqueueGuest = useCallback((guest: Guest, eventKey: string) => {
    if (!guest || !guest.name) return;

    // Deduplicate this specific event from firing twice (e.g. Convex + Pusher)
    if (seenPusherEventsRef.current.has(eventKey)) return;
    seenPusherEventsRef.current.add(eventKey);
    // Auto-clean after 30s
    setTimeout(() => seenPusherEventsRef.current.delete(eventKey), 30000);

    // If currently showing a card, queue it
    if (isDisplayingGreetingRef.current) {
      clientQueueRef.current.push(guest);
      setQueueCount(clientQueueRef.current.length);
      return;
    }

    showGuestCard(guest);
  }, [showGuestCard]);

  // ─── ENGINE 1 (PRIMARY): Convex reactive subscription ───────────────────────
  // Watches `getLatestCheckinForDisplay` — fires whenever ANY device checks in a guest.
  // The key insight: we track the last shown event by its _id (permanent record).
  useEffect(() => {
    if (!liveDisplay?.latestEvent) return;

    const ev = liveDisplay.latestEvent;
    const eventId = ev._id as string;

    // Skip if we already showed this event
    if (lastShownEventIdRef.current === eventId) return;

    // Only show events that happened in the last 60 seconds
    // (60s window handles slow Convex WS handshake on cold connect)
    const age = Date.now() - ev.timestamp;
    if (age > 60000) {
      // This is an old event from a previous session — just bookmark it, don't show
      lastShownEventIdRef.current = eventId;
      return;
    }

    // Mark as shown
    lastShownEventIdRef.current = eventId;

    const guest: Guest = {
      id: ev.guest_id,
      no: 0,
      name: ev.name,
      category: ev.category,
      qr_payload: ev.guest_id,
      is_present: true,
      checked_in_at: ev.checked_in_at,
      checkin_method: ev.method,
      is_walkin: ev.guest_id.startsWith('WALK'),
      pax: ev.pax,
    };

    enqueueGuest(guest, `convex_${eventId}`);
  }, [liveDisplay, enqueueGuest]);

  // ─── ENGINE 2 (FALLBACK): Pusher Cloud WebSocket ─────────────────────────────
  // Backup channel — fires if Convex WS is slow. Uses same enqueueGuest + dedup.
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY || '2d0c35da6d6434f594d5';
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'ap1';
    if (!key) return;

    let pusher: any = null;
    try {
      pusher = new Pusher(key, { cluster });

      pusher.connection.bind('state_change', (states: { current: string }) => {
        setIsPusherConnected(states.current === 'connected');
      });

      const channel = pusher.subscribe('wedding-checkin');

      channel.bind('guest:checkin', (data: { guest: Guest; timestamp?: string }) => {
        if (data?.guest) {
          const eventKey = `pusher_${data.guest.id}_${data.guest.checked_in_at || Date.now()}`;
          enqueueGuest(data.guest, eventKey);
        }
      });

      return () => {
        channel.unbind_all();
        channel.unsubscribe();
        pusher.disconnect();
      };
    } catch (err) {
      console.warn('[Display Pusher] Init error:', err);
    }
  }, [enqueueGuest]);

  // ─── ENGINE 3 (LAN ONLY): Local SSE stream ───────────────────────────────────
  // Only works when scanner and display are on the same server (same-origin, local network).
  // Gracefully degrades — no error shown if it fails.
  useEffect(() => {
    let es: EventSource | null = null;
    let isMounted = true;

    try {
      es = new EventSource('/api/display/stream');

      es.addEventListener('checkin', (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(e.data);
          if (data.guest) {
            enqueueGuest(data.guest, data.id || `sse_${data.guest.id}_${Date.now()}`);
          }
        } catch { /* Ignore parse errors */ }
      });

      es.onerror = () => { /* Silently degrade — Convex is primary */ };
    } catch { /* Ignore */ }

    return () => {
      isMounted = false;
      if (es) es.close();
    };
  }, [enqueueGuest]);

  // ─── ENGINE 4 (DISPLAY DEVICE): Hardware QR Scanner on THIS screen ──────────
  // If a barcode scanner (BT/Dongle/USB) is connected directly to the display device,
  // it triggers a Convex mutation → which is picked up by Engine 1 on all other devices.
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const scannedCode = hardwareScanBufferRef.current.trim();
        hardwareScanBufferRef.current = '';

        if (scannedCode.length >= 2 && !isProcessingScanRef.current) {
          e.preventDefault();
          e.stopPropagation();
          isProcessingScanRef.current = true;
          setLastScannedCode(scannedCode);

          try {
            // Checkin via Convex — this auto-triggers Engine 1 (reactive) on all display devices
            const res = await checkinMutation({ query: scannedCode, method: 'Scanner QR (Display)' });

            if (res.status === 'success' && res.guest) {
              // Also call /api/display/notify to trigger LAN SSE for same-network devices
              fetch('/api/display/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guest: res.guest }),
              }).catch(() => {});
            }
          } catch (err) {
            console.error('[Display Hardware QR Scan Error]:', err);
          } finally {
            setTimeout(() => { isProcessingScanRef.current = false; }, 1000);
          }
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        hardwareScanBufferRef.current = elapsed > 220 ? e.key : hardwareScanBufferRef.current + e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [checkinMutation]);

  // ─── Counter bump animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (stats?.present !== undefined) {
      if (prevCountRef.current !== null && stats.present > prevCountRef.current) {
        setIsCounterBumped(true);
        const timer = setTimeout(() => setIsCounterBumped(false), 1200);
        return () => clearTimeout(timer);
      }
      prevCountRef.current = stats.present;
    }
  }, [stats?.present]);

  // ─── Audio unlock ─────────────────────────────────────────────────────────────
  useEffect(() => { initDisplayAudio(() => setAudioReady(true)); }, []);
  const handleManualUnlock = () => { unlockAudio(); setAudioReady(true); };

  // ─── Clock ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const updateClock = () => {
      setClock(new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── Visual particles, confetti, sparkles ────────────────────────────────────
  const particles = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    id: i,
    left: `${(i * 3.7) % 100}%`,
    size: `${3 + (i % 6)}px`,
    delay: `${(i * 0.4) % 8}s`,
    duration: `${7 + (i % 5)}s`,
    opacity: 0.15 + ((i % 4) * 0.08),
  })), []);

  const confetti = useMemo(() => {
    if (!isGreeting) return [];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${(i * 2.5) % 100}%`,
      delay: `${(i * 0.05) % 2}s`,
      duration: `${2 + (i % 3) * 0.5}s`,
      color: ['#C5A55A', '#E8D5A3', '#D4AF37', '#F0E68C', '#8B7635'][i % 5],
      size: `${4 + (i % 7)}px`,
      rotation: `${(i * 35) % 360}deg`,
    }));
  }, [isGreeting, greetingKey]);

  const sparkles = useMemo(() => {
    if (!isGreeting) return [];
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left: `${15 + (i * 7) % 75}%`,
      top: `${15 + (i * 9) % 70}%`,
      delay: `${(i * 0.15) % 2}s`,
      size: `${6 + (i % 5) * 2}px`,
    }));
  }, [isGreeting, greetingKey]);

  return (
    <div className="display-container" onClick={handleManualUnlock}>
      {/* Animated Background */}
      <div className="animated-bg">
        {particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
              animationDuration: p.duration,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>

      {/* Ornamental Frame */}
      <div className="ornament-frame">
        <div className="ornament-side-left" />
        <div className="ornament-side-right" />
        <div className="corner-ornament corner-tl" />
        <div className="corner-ornament corner-tr" />
        <div className="corner-ornament corner-bl" />
        <div className="corner-ornament corner-br" />
      </div>

      {/* Top Indicators */}
      <div className="top-indicators">
        {/* Hardware Scanner Status */}
        <div className="scanner-status-indicator" title="Scanner QR Fisik (Dongle 2.4G, Bluetooth, USB) terhubung & aktif otomatis">
          <span className="scanner-status-dot"></span>
          <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>qr_code_scanner</span>
          <span>Scanner QR: Terhubung</span>
        </div>

        <div
          className={`audio-indicator ${audioReady ? 'active' : 'inactive'}`}
          onClick={(e) => { e.stopPropagation(); handleManualUnlock(); }}
          title={audioReady ? 'Audio Fanfare Aktif' : 'Klik untuk Mengaktifkan Suara'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>
            {audioReady ? 'volume_up' : 'volume_off'}
          </span>
          <span>{audioReady ? 'Audio ON' : 'Klik Aktifkan Suara'}</span>
        </div>

        {queueCount > 0 && (
          <div className="display-queue-badge">
            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem', color: 'var(--gold-primary)' }}>
              hourglass_top
            </span>
            <span>Antrian: {queueCount} tamu</span>
          </div>
        )}

        {/* Real-time Connection Status */}
        <div
          className="connection-status"
          title={`Status Sinkronisasi:\n• Convex Cloud: ${isConvexConnected ? 'Terhubung ✓' : 'Menghubungkan...'}\n• Pusher Cloud: ${isPusherConnected ? 'Terhubung ✓' : 'Standby'}`}
        >
          <div className={`status-dot ${isOnline ? 'connected' : 'disconnected'}`} />
          <span>{isOnline ? 'Online (Real-time)' : 'Menghubungkan...'}</span>
        </div>
      </div>

      {/* Idle Screen */}
      {!isGreeting && (
        <div className="idle-screen">
          <div className="idle-pretext">Selamat Datang Tamu Undangan</div>
          <div className="idle-title">The Wedding of</div>
          <div className="idle-names">
            Wildan
            <span className="idle-ampersand">&</span>
            Aisyah
          </div>
          <div className="idle-divider" />
          <div className="idle-subtitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.4rem', color: 'var(--gold-primary)' }}>
              qr_code_scanner
            </span>
            <span>Scanner QR Terhubung (Dongle/BT/USB) • Scan Undangan Langsung Kapan Saja</span>
          </div>

          {/* Live Scanner Counting — from Convex */}
          <div
            className={`idle-counter-simple ${isCounterBumped ? 'bump' : ''}`}
            title="Live Scanner Counter (dari Convex)"
          >
            <span className="material-symbols-outlined idle-counter-icon">qr_code_scanner</span>
            <span className="idle-counter-value">{stats.present}</span>
          </div>

          <div className="idle-clock">{clock}</div>
        </div>
      )}

      {/* Greeting Card */}
      {isGreeting && currentGuest && (
        <>
          {/* Confetti & Sparkles */}
          <div className="confetti-container">
            {confetti.map((c) => (
              <div
                key={c.id}
                className="confetti-piece"
                style={{
                  left: c.left,
                  animationDelay: c.delay,
                  animationDuration: c.duration,
                  width: c.size,
                  height: c.size,
                  background: c.color,
                  borderRadius: '2px',
                  transform: `rotate(${c.rotation})`,
                }}
              />
            ))}
            {sparkles.map((s) => (
              <div
                key={`sparkle-${s.id}`}
                className="sparkle"
                style={{
                  left: s.left,
                  top: s.top,
                  animationDelay: s.delay,
                  width: s.size,
                  height: s.size,
                }}
              />
            ))}
          </div>

          <div className="greeting-overlay" key={greetingKey}>
            <div className="greeting-card">
              <div className="greeting-welcome">Selamat Datang</div>
              <div className="greeting-divider" />
              <div className="greeting-name">{currentGuest.name}</div>
              {currentGuest.id && (
                <div className="greeting-id">{currentGuest.id}</div>
              )}
              {queueCount > 0 && (
                <div>
                  <div className="greeting-queue-pill">
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--gold-primary)' }}>
                      hourglass_top
                    </span>
                    <span>{queueCount} antrian berikutnya</span>
                  </div>
                </div>
              )}
            </div>

            {/* Progress bar (3 seconds) */}
            <div className="greeting-progress">
              <div className="greeting-progress-bar" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}