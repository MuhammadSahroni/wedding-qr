'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { playWelcomeSound, initDisplayAudio, unlockAudio } from '@/lib/audio-display';
import { Guest, Stats } from '@/lib/types';
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

  // ─── PRIMARY & ONLY REAL-TIME ENGINE: Convex Reactive Subscription ─────────
  // 100% murni Convex Cloud WebSocket reaktif lintas perangkat (TV, tablet, HP, iPad)
  const liveDisplay = useQuery(api.guests.getLatestCheckinForDisplay);
  const checkinMutation = useMutation(api.guests.checkin);

  // ─── CONFIGURATION ───────────────────────────────────────────────────────────
  // Durasi tampilan kartu nama: 3 detik per tamu, langsung ganti ke nama berikutnya tanpa jeda
  const DISPLAY_DURATION_MS = 3000;

  // ─── Helper: Unique Key per Guest ────────────────────────────────────────────
  const getGuestKey = useCallback((guest: Guest): string => {
    if (guest.id && guest.id.trim()) {
      return guest.id.trim().toUpperCase();
    }
    return (guest.name || '').trim().toLowerCase();
  }, []);

  // ─── Refs ────────────────────────────────────────────────────────────────────
  const hardwareScanBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const isProcessingScanRef = useRef<boolean>(false);
  const isFirstRunRef = useRef<boolean>(true);

  // Set untuk melacak ID event yang sudah diproses di layar ini
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const currentGuestRef = useRef<Guest | null>(null);

  // Queue and timing refs for 3s display + 0s gap between queued guests
  const clientQueueRef = useRef<Guest[]>([]);
  const isDisplayingGreetingRef = useRef<boolean>(false);
  const greetingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Connection status ───────────────────────────────────────────────────────
  // Terhubung murni ke Convex Cloud (WebSocket realtime)
  const isOnline = liveDisplay !== undefined;

  // ─── Stats from Convex ───────────────────────────────────────────────────────
  const stats: Stats = useMemo(() => {
    if (liveDisplay?.stats && liveDisplay.stats.total > 0) return liveDisplay.stats;
    return { total: 978, present: 0, absent: 978, percentage: 0 };
  }, [liveDisplay]);

  // ─── Process next guest in queue (3s display, 0s gap if more guests in queue) ───
  const processNextInQueue = useCallback(() => {
    if (greetingTimerRef.current) {
      clearTimeout(greetingTimerRef.current);
      greetingTimerRef.current = null;
    }

    // Jika antrian sudah kosong, kembali ke layar standby (idle)
    if (clientQueueRef.current.length === 0) {
      isDisplayingGreetingRef.current = false;
      currentGuestRef.current = null;
      setIsGreeting(false);
      setCurrentGuest(null);
      setQueueCount(0);
      return;
    }

    // Ambil tamu berikutnya dari antrian (FIFO)
    const nextGuest = clientQueueRef.current.shift()!;
    isDisplayingGreetingRef.current = true;
    currentGuestRef.current = nextGuest;
    setQueueCount(clientQueueRef.current.length);
    setCurrentGuest(nextGuest);
    setIsGreeting(true);
    setGreetingKey((prev) => prev + 1);
    setIsCounterBumped(true);
    setTimeout(() => setIsCounterBumped(false), 1200);

    playWelcomeSound();

    // Tepat 3 detik per tamu, lalu langsung lompat ke tamu berikutnya tanpa jeda
    greetingTimerRef.current = setTimeout(() => {
      processNextInQueue();
    }, DISPLAY_DURATION_MS);
  }, []);

  // ─── Enqueue guest for display ───────────────────────────────────────────────
  const enqueueGuest = useCallback((guest: Guest) => {
    if (!guest || !guest.name) return;

    const guestKey = getGuestKey(guest);

    // 1. Jika tamu ini SEDANG TAMPIL di layar saat ini -> lewati
    if (currentGuestRef.current && getGuestKey(currentGuestRef.current) === guestKey) {
      return;
    }

    // 2. Jika tamu ini SUDAH ADA di dalam antrian menunggu giliran -> lewati
    const alreadyInQueue = clientQueueRef.current.some(
      (item) => getGuestKey(item) === guestKey
    );
    if (alreadyInQueue) {
      return;
    }

    // Masukkan ke antrian FIFO
    clientQueueRef.current.push(guest);
    setQueueCount(clientQueueRef.current.length);

    // Jika sedang standby (tidak ada tamu yang tampil), langsung mulai antrian
    if (!isDisplayingGreetingRef.current) {
      processNextInQueue();
    }
  }, [getGuestKey, processNextInQueue]);

  // ─── Cleanup timer on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (greetingTimerRef.current) clearTimeout(greetingTimerRef.current);
    };
  }, []);

  // ─── CONVEX REALTIME ENGINE: Listen to Check-Ins from Any Device ─────────────
  // Langsung reaktif menangkap scan dari tablet, iPad, HP, atau scanner fisik
  useEffect(() => {
    const events = (liveDisplay as any)?.recentEvents;
    if (!events || !Array.isArray(events) || events.length === 0) return;

    // Saat layar display pertama kali dibuka:
    // Tandai seluruh event lama di database agar tidak memutar ulang masa lalu
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      for (const ev of events) {
        if (ev._id) {
          processedEventIdsRef.current.add(ev._id as string);
        }
      }
      return;
    }

    // Tangkap setiap scan baru yang belum pernah diproses
    for (const ev of events) {
      const eventId = ev._id as string;
      if (!eventId) continue;

      if (processedEventIdsRef.current.has(eventId)) continue;
      processedEventIdsRef.current.add(eventId);

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

      enqueueGuest(guest);
    }
  }, [liveDisplay, enqueueGuest]);

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
              }).catch(() => { });
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
          title={`Status Sinkronisasi:\n• Convex Cloud: ${isOnline ? 'Terhubung ✓ (Real-time)' : 'Menghubungkan...'}`}
        >
          <div className={`status-dot ${isOnline ? 'connected' : 'disconnected'}`} />
          <span>{isOnline ? 'Convex: Terhubung' : 'Menghubungkan...'}</span>
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