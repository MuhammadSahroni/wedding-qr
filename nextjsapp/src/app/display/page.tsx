'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from 'convex/react';
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
  const prevCountRef = useRef<number | null>(null);

  // Convex Reactive Subscriptions
  // displayState is managed by Convex scheduler/cron queue system (5s per guest)
  const displayState = useQuery(api.display.getCurrentDisplay);
  const convexStats = useQuery(api.guests.getStats);

  const lastActiveIdRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stats derived from Convex or fallback
  const stats: Stats = useMemo(() => {
    if (convexStats) return convexStats;
    return { total: 957, present: 0, absent: 957, percentage: 0 };
  }, [convexStats]);

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

  // Convex Reactive Real-time trigger:
  // Driven entirely by Convex backend queue & scheduler!
  // Each guest is guaranteed to appear for 5 seconds, followed in order by queued arrivals.
  useEffect(() => {
    if (!displayState) return;

    if (displayState.active) {
      if (lastActiveIdRef.current !== displayState.active._id) {
        lastActiveIdRef.current = displayState.active._id;

        setCurrentGuest({
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
        });

        setIsGreeting(true);
        setGreetingKey((prev) => prev + 1);

        // Play celebratory chime/fanfare
        playWelcomeSound();

        // Safety fallback timer (in case backend scheduler network lags, gracefully return after 6.5s)
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = setTimeout(() => {
          if (!displayState.queueCount && !displayState.active) {
            setIsGreeting(false);
            setCurrentGuest(null);
          }
        }, 6500);
      }
    } else {
      if (lastActiveIdRef.current !== null) {
        lastActiveIdRef.current = null;
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        setIsGreeting(false);
        setCurrentGuest(null);
      }
    }
  }, [displayState]);

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
            <span>Silakan scan QR Code undangan Anda di meja penerima tamu</span>
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