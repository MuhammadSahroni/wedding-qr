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
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const prevCountRef = useRef<number | null>(null);

  // Convex Reactive Subscriptions & Mutations
  const displayState = useQuery(api.display.getCurrentDisplay);
  const convexStats = useQuery(api.guests.getStats);
  const checkinMutation = useMutation(api.guests.checkin);

  const lastActiveIdRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hardwareScanBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const isProcessingScanRef = useRef<boolean>(false);

  // Stats derived from Convex or fallback
  const stats: Stats = useMemo(() => {
    if (convexStats) return convexStats;
    return { total: 978, present: 0, absent: 978, percentage: 0 };
  }, [convexStats]);

  // Trigger celebratory guest greeting
  const triggerGuestGreeting = useCallback((guest: Guest) => {
    setCurrentGuest(guest);
    setIsGreeting(true);
    setGreetingKey((prev) => prev + 1);
    setIsCounterBumped(true);
    setTimeout(() => setIsCounterBumped(false), 1200);

    // Play fanfare chime
    playWelcomeSound();

    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => {
      setIsGreeting(false);
      setCurrentGuest(null);
    }, 5000);
  }, []);

  // Hardware QR Scanner Listener (Dongle 2.4G, Bluetooth, & USB Wired)
  // Connects immediately when the display page opens
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

              // Sync to Google Spreadsheet & Pusher
              fetch('/api/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: scannedCode, method: 'Scanner QR (Display)' }),
              }).catch((err) => console.error('[Display Scan Sync]', err));
            } else if (res.status === 'duplicate' && res.guest) {
              // Greet even on duplicate so guest is warmly acknowledged
              triggerGuestGreeting(res.guest as Guest);
            }
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

  // Real-time Pusher Subscription (dual-redundant arrival from /scanner or smartphone)
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY || '2d0c35da6d6434f594d5';
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'ap1';
    if (!key) return;

    try {
      const pusher = new Pusher(key, { cluster });
      const channel = pusher.subscribe('wedding-checkin');

      channel.bind('guest:checkin', (data: { guest: Guest; stats?: any }) => {
        if (data?.guest) {
          triggerGuestGreeting(data.guest);
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

  // Live count bump animation when checkin occurs
  useEffect(() => {
    if (convexStats?.present !== undefined) {
      if (prevCountRef.current !== null && convexStats.present > prevCountRef.current) {
        setIsCounterBumped(true);
        const timer = setTimeout(() => setIsCounterBumped(false), 1200);
        return () => clearTimeout(timer);
      }
      prevCountRef.current = convexStats.present;
    }
  }, [convexStats?.present]);

  const isOnline = displayState !== undefined;

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

  // Convex Reactive Real-time trigger from display_queue:
  useEffect(() => {
    if (!displayState) return;

    if (displayState.active) {
      if (lastActiveIdRef.current !== displayState.active._id) {
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

        triggerGuestGreeting(guestObj);
      }
    } else {
      if (lastActiveIdRef.current !== null) {
        lastActiveIdRef.current = null;
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        setIsGreeting(false);
        setCurrentGuest(null);
      }
    }
  }, [displayState, triggerGuestGreeting]);

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
        {displayState && displayState.queueCount > 0 && (
          <div className="display-queue-badge">
            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem', color: 'var(--gold-primary)' }}>
              hourglass_top
            </span>
            <span>Antrian: {displayState.queueCount} tamu</span>
          </div>
        )}
        <div className="connection-status">
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

          {/* Live Scanner Counting (Simple seperti jam, icon sejajar dengan angka) */}
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
              {displayState && displayState.queueCount > 0 && (
                <div>
                  <div className="greeting-queue-pill">
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--gold-primary)' }}>
                      hourglass_top
                    </span>
                    <span>
                      {displayState.queueCount} antrian berikutnya{displayState.nextGuest ? ` • ${displayState.nextGuest}` : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="greeting-progress">
              <div className="greeting-progress-bar" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}