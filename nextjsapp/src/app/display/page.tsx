'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getPusherClient } from '@/lib/pusher-client';
import { playWelcomeSound, initDisplayAudio, unlockAudio } from '@/lib/audio-display';
import { Guest, Stats } from '@/lib/types';
import '@/styles/display.css';

const GREETING_DURATION = 5000; // 5 seconds

export default function DisplayPage() {
  const [currentGuest, setCurrentGuest] = useState<Guest | null>(null);
  const [isGreeting, setIsGreeting] = useState(false);
  const [clock, setClock] = useState('');
  const [stats, setStats] = useState<Stats>({ total: 0, present: 0, absent: 0, percentage: 0 });
  const [isOnline, setIsOnline] = useState(false);
  const [greetingKey, setGreetingKey] = useState(0);
  const [audioReady, setAudioReady] = useState(false);

  const lastCheckedInAtRef = useRef<string | null>(null);
  const greetingTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Show greeting
  const showGreeting = useCallback((guest: Guest) => {
    setCurrentGuest(guest);
    setIsGreeting(true);
    setGreetingKey(prev => prev + 1);

    // Play welcome fanfare
    playWelcomeSound();

    if (greetingTimerRef.current) clearTimeout(greetingTimerRef.current);
    greetingTimerRef.current = setTimeout(() => {
      setIsGreeting(false);
      setCurrentGuest(null);
    }, GREETING_DURATION);
  }, []);

  // Fetch initial stats & recent
  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(console.error);

    fetch('/api/guests?filter=present')
      .then(res => res.json())
      .then((data: Guest[]) => {
        if (data.length > 0 && data[0].checked_in_at) {
          lastCheckedInAtRef.current = data[0].checked_in_at;
        }
      })
      .catch(console.error);
  }, []);

  // Pusher Realtime Connection & Fallback Polling
  useEffect(() => {
    const pusher = getPusherClient();
    let isPusherActive = false;

    if (pusher) {
      const channel = pusher.subscribe('wedding-checkin');

      channel.bind('guest:checkin', (data: { guest: Guest; stats: Stats }) => {
        if (data.guest) {
          lastCheckedInAtRef.current = data.guest.checked_in_at;
          showGreeting(data.guest);
        }
        if (data.stats) {
          setStats(data.stats);
        }
      });

      channel.bind('stats:update', (newStats: Stats) => {
        setStats(newStats);
      });

      pusher.connection.bind('connected', () => {
        setIsOnline(true);
        isPusherActive = true;
      });

      pusher.connection.bind('disconnected', () => {
        setIsOnline(false);
      });
    }

    // Smart background polling fallback (checks every 2.5s if a new guest arrived)
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/guests?filter=present');
        if (res.ok) {
          const list: Guest[] = await res.json();
          if (list.length > 0) {
            const latest = list[0];
            if (latest.checked_in_at && latest.checked_in_at !== lastCheckedInAtRef.current) {
              const diffMs = Date.now() - new Date(latest.checked_in_at).getTime();
              lastCheckedInAtRef.current = latest.checked_in_at;
              // If check-in happened in the last 10 seconds and Pusher didn't trigger
              if (diffMs < 10000 && !isGreeting) {
                showGreeting(latest);
              }
            }
          }
          if (!isPusherActive) setIsOnline(true);
        }
      } catch (err) {
        if (!isPusherActive) setIsOnline(false);
      }
    }, 2500);

    return () => {
      clearInterval(pollInterval);
      if (pusher) {
        pusher.unsubscribe('wedding-checkin');
      }
    };
  }, [showGreeting, isGreeting]);

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

  // Format Time
  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

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
              <div className="greeting-id">{currentGuest.category ? `${currentGuest.category} • ` : ''}{currentGuest.id}</div>
              <div className="greeting-time">
                Tercatat Hadir: {formatTime(currentGuest.checked_in_at)}
              </div>
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