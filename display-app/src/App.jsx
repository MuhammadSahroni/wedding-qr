import { useState, useEffect, useMemo, useCallback } from 'react';
import { playWelcomeSound, initAudio, unlockAudio } from './utils/audio';
import './App.css';

const defaultWsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = import.meta.env.VITE_WS_URL || `${defaultWsProtocol}//${window.location.host}/ws`;
const GREETING_DURATION = 5000; // 5 seconds

function App() {
  const [currentGuest, setCurrentGuest] = useState(null); // The guest being greeted
  const [isGreeting, setIsGreeting] = useState(false);
  const [clock, setClock] = useState('');
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, percentage: 0 });
  const [wsConnected, setWsConnected] = useState(false);
  const [greetingKey, setGreetingKey] = useState(0);
  const [audioReady, setAudioReady] = useState(false);

  // Initialize audio listener on user interaction
  useEffect(() => {
    initAudio(() => setAudioReady(true));
  }, []);

  const handleManualUnlock = () => {
    unlockAudio();
    setAudioReady(true);
  };

  // ============================================================
  // Clock
  // ============================================================
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // ============================================================
  // Show greeting
  // ============================================================
  const showGreeting = useCallback((guest) => {
    setCurrentGuest(guest);
    setIsGreeting(true);
    setGreetingKey(prev => prev + 1);

    // Play welcome sound effect
    playWelcomeSound();

    // Auto-hide after duration
    setTimeout(() => {
      setIsGreeting(false);
      setCurrentGuest(null);
    }, GREETING_DURATION);
  }, []);

  // ============================================================
  // WebSocket Connection
  // ============================================================
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;

    function connect() {
      try {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          console.log('[Display] Connected to server');
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'guest:checkin':
                showGreeting(data.data.guest);
                setStats(data.data.stats);
                break;
              case 'stats:update':
                setStats(data.data);
                break;
              case 'reset':
                setStats(data.data);
                setIsGreeting(false);
                setCurrentGuest(null);
                break;
            }
          } catch (e) {
            console.warn('[Display] Parse error:', e);
          }
        };

        ws.onclose = () => {
          console.log('[Display] Disconnected. Reconnecting...');
          setWsConnected(false);
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (e) {
        console.error('[Display] Connection error:', e);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [showGreeting]);

  // ============================================================
  // Generate floating particles
  // ============================================================
  const particles = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${3 + Math.random() * 6}px`,
      delay: `${Math.random() * 8}s`,
      duration: `${6 + Math.random() * 6}s`,
      opacity: 0.15 + Math.random() * 0.35,
    }));
  }, []);

  // ============================================================
  // Generate confetti for greeting
  // ============================================================
  const confetti = useMemo(() => {
    if (!isGreeting) return [];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 2}s`,
      duration: `${2 + Math.random() * 2}s`,
      color: ['#C5A55A', '#E8D5A3', '#D4AF37', '#F0E68C', '#8B7635'][Math.floor(Math.random() * 5)],
      size: `${4 + Math.random() * 8}px`,
      rotation: `${Math.random() * 360}deg`,
    }));
  }, [isGreeting, greetingKey]);

  // ============================================================
  // Generate sparkles for greeting
  // ============================================================
  const sparkles = useMemo(() => {
    if (!isGreeting) return [];
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left: `${10 + Math.random() * 80}%`,
      top: `${10 + Math.random() * 80}%`,
      delay: `${Math.random() * 2}s`,
      size: `${6 + Math.random() * 10}px`,
    }));
  }, [isGreeting, greetingKey]);

  // ============================================================
  // Format check-in time
  // ============================================================
  const formatTime = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
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
          title={audioReady ? 'Audio Selamat Datang Aktif' : 'Klik untuk Mengaktifkan Audio'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>
            {audioReady ? 'volume_up' : 'volume_off'}
          </span>
          <span>{audioReady ? 'Audio ON' : 'Klik Aktifkan Suara'}</span>
        </div>
        <div className="connection-status">
          <div className={`status-dot ${wsConnected ? 'connected' : 'disconnected'}`} />
          <span>{wsConnected ? 'Connected' : 'Connecting...'}</span>
        </div>
      </div>

      {/* Idle Screen */}
      {!isGreeting && (
        <div className="idle-screen">
          <div className="idle-pretext">Selamat Datang Tamu Undangan </div>
          <div className="idle-title">The Wedding of</div>
          <div className="idle-names">
            Wildan
            <span className="idle-ampersand">&</span>
            Aisyah
          </div>
          <div className="idle-divider" />
          <div className="idle-subtitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.4rem', color: 'var(--gold-primary)' }}>qr_code_scanner</span>
            <span>Silakan scan QR Code undangan Anda</span>
          </div>
          <div className="idle-clock">{clock}</div>
        </div>
      )}

      {/* Greeting Card */}
      {isGreeting && currentGuest && (
        <>
          {/* Confetti */}
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
                  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
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
              <div className="greeting-id">{currentGuest.id}</div>
              <div className="greeting-time">
                Check-in: {formatTime(currentGuest.checked_in_at)}
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

export default App;
