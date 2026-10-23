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

  // Connectivity states across multi-tier engines (Local LAN SSE, Local Poll, Convex Cloud, Pusher Cloud)
  const [isLocalConnected, setIsLocalConnected] = useState(false);
  const [isPusherConnected, setIsPusherConnected] = useState(false);
  const [localStats, setLocalStats] = useState<Stats | null>(null);

  // Convex Reactive Subscriptions & Mutations
  const displayState = useQuery(api.display.getCurrentDisplay);
  const convexStats = useQuery(api.guests.getStats);
  const checkinMutation = useMutation(api.guests.checkin);

  const lastActiveIdRef = useRef<string | null>(null);
  const hardwareScanBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const isProcessingScanRef = useRef<boolean>(false);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const lastPolledEventIdRef = useRef<string>('');
  const hasPolledInitiallyRef = useRef<boolean>(false);

  // Queue and timing refs for strictly 3s display + 1s jeda between queued guests
  const clientQueueRef = useRef<Guest[]>([]);
  const isDisplayingGreetingRef = useRef<boolean>(false);
  const greetingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const jedaTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seenGuestsRef = useRef<Set<string>>(new Set());

  // Overall online status is true if ANY communication channel is active
  const isConvexConnected = displayState !== undefined;
  const isOnline = isLocalConnected || isPusherConnected || isConvexConnected;

  // Stats derived from Convex, Local Poll, or initial fallback
  const stats: Stats = useMemo(() => {
    if (convexStats && convexStats.total > 0) return convexStats;
    if (localStats && localStats.total > 0) return localStats;
    return { total: 978, present: 0, absent: 978, percentage: 0 };
  }, [convexStats, localStats]);

  // Display a single guest card for exactly 3000ms (3 seconds), then wait 1000ms jeda before next queue item
  const showGuestCard = useCallback((guest: Guest) => {
    isDisplayingGreetingRef.current = true;
    setCurrentGuest(guest);
    setIsGreeting(true);
    setGreetingKey((prev) => prev + 1);
    setIsCounterBumped(true);
    setTimeout(() => setIsCounterBumped(false), 1200);

    // Play welcome fanfare chime
    playWelcomeSound();

    if (greetingTimeoutRef.current) clearTimeout(greetingTimeoutRef.current);
    if (jedaTimeoutRef.current) clearTimeout(jedaTimeoutRef.current);

    // 1. Display guest card for exactly 3 seconds
    greetingTimeoutRef.current = setTimeout(() => {
      // Close greeting card -> Return to idle screen
      setIsGreeting(false);
      setCurrentGuest(null);

      // 2. Provide 1 second JEDA (idle screen pause) before displaying next queued guest
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

  // Trigger guest greeting with queue and deduplication
  const triggerGuestGreeting = useCallback((guest: Guest, eventKey?: string) => {
    if (!guest || !guest.name) return;

    // 1. NEVER display a guest who already checked in previously in this session
    if (seenGuestsRef.current.has(guest.id)) {
      return;
    }

    // 2. NEVER display a guest whose check-in happened more than 30 seconds ago
    // (Convex reactive subscriptions can take a few seconds to deliver cross-device;
    //  we use 30s window so late arrivals still show while replayed history is skipped)
    if (guest.is_present && guest.checked_in_at) {
      const checkinTime = new Date(guest.checked_in_at).getTime();
      if (!isNaN(checkinTime) && Date.now() - checkinTime > 30000) {
        return;
      }
    }

    // Mark as seen permanently so duplicate scans never show
    seenGuestsRef.current.add(guest.id);

    // Deduplicate rapid triggers from multiple engines
    const dedupKey = eventKey || `${guest.id}_${guest.checked_in_at || ''}`;
    if (eventKey && seenEventsRef.current.has(dedupKey)) {
      return;
    }
    seenEventsRef.current.add(dedupKey);
    setTimeout(() => {
      seenEventsRef.current.delete(dedupKey);
    }, 10000);

    // If currently displaying a card or in jeda, push into FIFO queue
    if (isDisplayingGreetingRef.current) {
      clientQueueRef.current.push(guest);
      setQueueCount(clientQueueRef.current.length);
      return;
    }

    // Otherwise display immediately
    showGuestCard(guest);
  }, [showGuestCard]);

  // 1. ENGINE 1: Local Server-Sent Events (SSE) Stream
  useEffect(() => {
    let es: EventSource | null = null;
    let isMounted = true;

    try {
      es = new EventSource('/api/display/stream');

      es.addEventListener('connected', (e: MessageEvent) => {
        if (!isMounted) return;
        setIsLocalConnected(true);
        try {
          const data = JSON.parse(e.data);
          if (data.stats) setLocalStats(data.stats);
          // NOTE: Do NOT show old/previous checkin on initial connect.
          // Screen starts on idle screen and only reacts to fresh scans!
        } catch {
          // Ignore
        }
      });

      es.addEventListener('checkin', (e: MessageEvent) => {
        if (!isMounted) return;
        setIsLocalConnected(true);
        try {
          const data = JSON.parse(e.data);
          if (data.stats) setLocalStats(data.stats);
          if (data.guest) {
            triggerGuestGreeting(data.guest, data.id);
          }
        } catch (err) {
          console.warn('[Display SSE] Parse error:', err);
        }
      });

      es.onerror = () => {
        if (!isMounted) return;
        setIsLocalConnected(false);
      };
    } catch (err) {
      console.warn('[Display SSE] Init error:', err);
    }

    return () => {
      isMounted = false;
      if (es) es.close();
    };
  }, [triggerGuestGreeting]);

  // 2. ENGINE 2: Local HTTP Polling Fallback & Heartbeat (every 1.5s)
  useEffect(() => {
    let isMounted = true;

    const poll = async () => {
      try {
        const url = lastPolledEventIdRef.current
          ? `/api/display/poll?since=${encodeURIComponent(lastPolledEventIdRef.current)}`
          : '/api/display/poll';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Poll failed');
        const data = await res.json();
        if (!isMounted) return;

        setIsLocalConnected(true);
        if (data.stats) setLocalStats(data.stats);

        // On first poll, only set bookmark to avoid displaying past guests
        if (!hasPolledInitiallyRef.current) {
          hasPolledInitiallyRef.current = true;
          if (data.latestEventId) {
            lastPolledEventIdRef.current = data.latestEventId;
          }
          return;
        }

        if (data.newEvents && Array.isArray(data.newEvents)) {
          for (const evt of data.newEvents) {
            if (evt.guest) {
              triggerGuestGreeting(evt.guest, evt.id);
            }
          }
        }

        if (data.latestEventId) {
          lastPolledEventIdRef.current = data.latestEventId;
        }
      } catch {
        // Silently retry next interval
      }
    };

    poll();
    const interval = setInterval(poll, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [triggerGuestGreeting]);

  // 3. ENGINE 3: Real-time Pusher Subscription (Cloud WebSockets)
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY || '2d0c35da6d6434f594d5';
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'ap1';
    if (!key) return;

    try {
      const pusher = new Pusher(key, { cluster });

      pusher.connection.bind('state_change', (states: { current: string }) => {
        setIsPusherConnected(states.current === 'connected');
      });

      const channel = pusher.subscribe('wedding-checkin');

      channel.bind('guest:checkin', (data: { guest: Guest; stats?: any }) => {
        if (data?.guest) {
          triggerGuestGreeting(data.guest, `pusher_${data.guest.id}_${data.guest.checked_in_at}`);
        }
        if (data?.stats) {
          setLocalStats(data.stats);
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
  }, [triggerGuestGreeting]);

  // 4. ENGINE 4: Convex Reactive Trigger from display_queue
  useEffect(() => {
    if (!displayState || !displayState.active) return;

    // Only process if this active item is fresh (<15s) to avoid replaying previous sessions
    // 15s window accommodates Convex reactive subscription delivery latency across devices
    const isRecent = Date.now() - (displayState.active.displayStartedAt || 0) < 15000;
    if (lastActiveIdRef.current !== displayState.active._id && isRecent) {
      lastActiveIdRef.current = displayState.active._id;

      const guestObj: Guest = {
        id: displayState.active.guest_id,
        no: 0,
        name: displayState.active.name,
        category: displayState.active.category,
        qr_payload: displayState.active.guest_id,
        is_present: true,
        checked_in_at: displayState.active.checked_in_at,
        checkin_method: displayState.active.method,
        is_walkin: displayState.active.guest_id.startsWith('WALK'),
        pax: displayState.active.pax,
      };

      triggerGuestGreeting(guestObj, `convex_${displayState.active._id}`);
    }
  }, [displayState, triggerGuestGreeting]);

  // Hardware QR Scanner Listener on this Display device (Dongle 2.4G, Bluetooth, & USB Wired)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

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
            // Check-in via Convex Mutation
            const res = await checkinMutation({ query: scannedCode, method: 'Scanner QR (Display)' });

            if (res.status === 'success' && res.guest) {
              const guestData = res.guest as Guest;
              triggerGuestGreeting(guestData);

              // Broadcast to Local Display Bus & Sheets & Pusher
              fetch('/api/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: scannedCode, method: 'Scanner QR (Display)' }),
              }).catch((err) => console.error('[Display Scan Sync]', err));

              fetch('/api/display/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guest: guestData }),
              }).catch(() => {});
            }
            // NOTE: If res.status === 'duplicate', DO NOT SHOW on display screen!
          } catch (err) {
            console.error('[Display Hardware QR Scan Error]:', err);
          } finally {
            setTimeout(() => {
              isProcessingScanRef.current = false;
            }, 1000);
          }
        }
        return;
      }

      // Buffer single printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (elapsed > 220) {
          hardwareScanBufferRef.current = e.key;
        } else {
          hardwareScanBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [checkinMutation, triggerGuestGreeting]);

  // Live count bump animation when checkin occurs
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

  // Initialize audio unlock
  useEffect(() => {
    initDisplayAudio(() => setAudioReady(true));
  }, []);

  const handleManualUnlock = () => {
    unlockAudio();
    setAudioReady(true);
  };

  // Clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Floating gold particles
  const particles = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: `${(i * 3.7) % 100}%`,
      size: `${3 + (i % 6)}px`,
      delay: `${(i * 0.4) % 8}s`,
      duration: `${7 + (i % 5)}s`,
      opacity: 0.15 + ((i % 4) * 0.08),
    }));
  }, []);

  // Confetti for greeting
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

  // Sparkles
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

  const activeQueueCount = queueCount > 0 ? queueCount : (displayState?.queueCount || 0);

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
          <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>
            qr_code_scanner
          </span>
          <span>Scanner QR: Terhubung</span>
        </div>

        <div
          className={`audio-indicator ${audioReady ? 'active' : 'inactive'}`}
          onClick={(e) => {
            e.stopPropagation();
            handleManualUnlock();
          }}
          title={audioReady ? 'Audio Fanfare Aktif' : 'Klik untuk Mengaktifkan Suara'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>
            {audioReady ? 'volume_up' : 'volume_off'}
          </span>
          <span>{audioReady ? 'Audio ON' : 'Klik Aktifkan Suara'}</span>
        </div>

        {activeQueueCount > 0 && (
          <div className="display-queue-badge">
            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem', color: 'var(--gold-primary)' }}>
              hourglass_top
            </span>
            <span>Antrian: {activeQueueCount} tamu</span>
          </div>
        )}

        {/* Real-time Connection Status Indicator with Detailed Tooltip */}
        <div
          className="connection-status"
          title={`Status Sinkronisasi:\n• Jaringan Lokal (SSE/Poll): ${isLocalConnected ? 'Terhubung (Aktif)' : 'Menghubungkan'}\n• Convex Cloud: ${isConvexConnected ? 'Terhubung (Aktif)' : 'Standby'}\n• Pusher Cloud: ${isPusherConnected ? 'Terhubung (Aktif)' : 'Standby'}`}
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

          {/* Live Scanner Counting */}
          <div
            className={`idle-counter-simple ${isCounterBumped ? 'bump' : ''}`}
            title="Live Scanner Counter"
          >
            <span className="material-symbols-outlined idle-counter-icon">
              qr_code_scanner
            </span>
            <span className="idle-counter-value">
              {stats.present}
            </span>
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
              {activeQueueCount > 0 && (
                <div>
                  <div className="greeting-queue-pill">
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--gold-primary)' }}>
                      hourglass_top
                    </span>
                    <span>
                      {activeQueueCount} antrian berikutnya
                    </span>
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