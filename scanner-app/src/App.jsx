import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { connectWebSocket, disconnectWebSocket } from './utils/websocket';
import { checkinGuest, checkinGuestById, undoCheckin, searchGuests, getRecentCheckins, getStats, resetAllCheckins, getExportUrl } from './utils/api';
import { playSuccess, playDuplicate, playError, initAudio } from './utils/audio';
import './App.css';

function App() {
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, percentage: 0 });
  const [scanResult, setScanResult] = useState(null); // { type: 'success'|'duplicate'|'error', guest, message }
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [clock, setClock] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const scannerInputRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const scanCooldownRef = useRef(false);
  const resultTimeoutRef = useRef(null);

  // ============================================================
  // Clock
  // ============================================================
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // ============================================================
  // WebSocket Connection
  // ============================================================
  useEffect(() => {
    connectWebSocket((event) => {
      switch (event.type) {
        case 'stats:update':
          setStats(event.data);
          break;
        case 'guest:checkin':
          setStats(event.data.stats);
          refreshRecent();
          break;
        case 'guest:undo':
          setStats(event.data.stats);
          refreshRecent();
          break;
        case 'reset':
          setStats(event.data);
          setRecentCheckins([]);
          setScanResult(null);
          break;
      }
    });

    setWsConnected(true);

    return () => disconnectWebSocket();
  }, []);

  // ============================================================
  // Initial Data Load
  // ============================================================
  useEffect(() => {
    getStats().then(setStats).catch(console.error);
    refreshRecent();
    initAudio();
  }, []);

  // ============================================================
  // Auto-focus scanner input
  // ============================================================
  useEffect(() => {
    const focusInterval = setInterval(() => {
      if (scannerInputRef.current && document.activeElement !== scannerInputRef.current && !showSearch) {
        scannerInputRef.current.focus();
      }
    }, 1000);
    return () => clearInterval(focusInterval);
  }, [showSearch]);

  // ============================================================
  // Refresh recent check-ins
  // ============================================================
  const refreshRecent = useCallback(async () => {
    try {
      const data = await getRecentCheckins(10);
      setRecentCheckins(data);
    } catch (e) {
      console.error('Failed to fetch recent:', e);
    }
  }, []);

  // ============================================================
  // Process scan result
  // ============================================================
  const processScan = useCallback(async (rawText) => {
    if (isProcessing || scanCooldownRef.current) return;
    if (!rawText || rawText.trim() === '') return;

    setIsProcessing(true);
    scanCooldownRef.current = true;

    try {
      const result = await checkinGuest(rawText.trim());

      if (result.status === 200) {
        // Success
        playSuccess();
        setScanResult({
          type: 'success',
          guest: result.data.guest,
          message: result.data.message
        });
        refreshRecent();
      } else if (result.status === 409) {
        // Duplicate
        playDuplicate();
        setScanResult({
          type: 'duplicate',
          guest: result.data.guest,
          message: result.data.message
        });
      } else if (result.status === 404) {
        // Not found
        playError();
        setScanResult({
          type: 'error',
          guest: null,
          message: result.data.message
        });
      }
    } catch (e) {
      playError();
      setScanResult({
        type: 'error',
        guest: null,
        message: 'Gagal terhubung ke server. Pastikan server berjalan.'
      });
    }

    // Clear result after 5 seconds
    clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = setTimeout(() => setScanResult(null), 5000);

    setIsProcessing(false);

    // Cooldown to prevent rapid re-scans
    setTimeout(() => {
      scanCooldownRef.current = false;
    }, 2000);
  }, [isProcessing, refreshRecent]);

  // ============================================================
  // Scanner Input Handler (Omni Scanner USB HID)
  // ============================================================
  const handleScannerKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = e.target.value.trim();
      if (value) {
        processScan(value);
        e.target.value = '';
      }
    }
  }, [processScan]);

  // ============================================================
  // Camera Scanner
  // ============================================================
  const isStartingCameraRef = useRef(false);

  const startCamera = useCallback(async () => {
    if (isStartingCameraRef.current) return;
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) return;

    // Check secure context
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      alert('⚠️ Kamera memerlukan koneksi HTTPS jika diakses lewat IP/HP. Silakan gunakan localhost di laptop, atau gunakan tunnel HTTPS (seperti ngrok/Cloudflare).');
      return;
    }

    isStartingCameraRef.current = true;
    setCameraActive(true);

    try {
      // Clean up previous instance if any
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
          html5QrCodeRef.current.clear();
        } catch (e) {
          console.warn('Cleanup error:', e);
        }
        html5QrCodeRef.current = null;
      }

      const html5QrCode = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * 0.7);
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.0,
      };

      // Get available cameras first
      let cameraToUse = { facingMode: 'environment' };
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          // If multiple cameras (like phone), find back camera, else use the first available
          const backCamera = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('belakang') ||
            d.label.toLowerCase().includes('environment')
          );
          cameraToUse = backCamera ? backCamera.id : devices[0].id;
        }
      } catch (devErr) {
        console.warn('Could not enumerate cameras, falling back to facingMode:', devErr);
      }

      await html5QrCode.start(
        cameraToUse,
        config,
        (decodedText) => {
          processScan(decodedText);
        },
        () => {} // ignore frame scan errors
      );
    } catch (err) {
      console.error('Camera error:', err);
      let msg = 'Gagal membuka kamera. ';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg += 'Izin kamera ditolak. Mohon izinkan akses kamera di pengaturan browser.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg += 'Tidak ditemukan kamera/webcam pada perangkat ini.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg += 'Kamera sedang digunakan oleh aplikasi lain (seperti Zoom/Teams).';
      } else {
        msg += `Error: ${err.message || err}`;
      }
      alert(msg);
      setCameraActive(false);
      if (html5QrCodeRef.current) {
        try { html5QrCodeRef.current.clear(); } catch (e) {}
        html5QrCodeRef.current = null;
      }
    } finally {
      isStartingCameraRef.current = false;
    }
  }, [processScan]);

  const stopCamera = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.warn('Camera stop error:', e);
      }
      html5QrCodeRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const toggleCamera = useCallback(() => {
    if (cameraActive) {
      stopCamera();
    } else {
      startCamera();
    }
  }, [cameraActive, startCamera, stopCamera]);

  // ============================================================
  // Search
  // ============================================================
  const handleSearch = useCallback(async (query) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }
    try {
      const results = await searchGuests(query.trim());
      setSearchResults(results);
      setShowSearch(true);
    } catch (e) {
      console.error('Search failed:', e);
    }
  }, []);

  const handleManualCheckin = useCallback(async (guestId) => {
    try {
      const result = await checkinGuestById(guestId);
      if (result.status === 200) {
        playSuccess();
        setScanResult({
          type: 'success',
          guest: result.data.guest,
          message: result.data.message
        });
        refreshRecent();
        // Re-search to update results
        if (searchQuery) handleSearch(searchQuery);
      } else if (result.status === 409) {
        playDuplicate();
        setScanResult({
          type: 'duplicate',
          guest: result.data.guest,
          message: result.data.message
        });
      }
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => setScanResult(null), 5000);
    } catch (e) {
      console.error('Manual checkin failed:', e);
    }
  }, [refreshRecent, searchQuery, handleSearch]);

  // ============================================================
  // Undo
  // ============================================================
  const handleUndo = useCallback(async (guestId) => {
    try {
      await undoCheckin(guestId);
      refreshRecent();
      if (searchQuery) handleSearch(searchQuery);
    } catch (e) {
      console.error('Undo failed:', e);
    }
  }, [refreshRecent, searchQuery, handleSearch]);

  // ============================================================
  // Reset
  // ============================================================
  const handleReset = useCallback(async () => {
    if (window.confirm('Yakin ingin mereset semua data check-in? Tindakan ini tidak bisa dibatalkan.')) {
      try {
        await resetAllCheckins();
        setScanResult(null);
        setRecentCheckins([]);
      } catch (e) {
        console.error('Reset failed:', e);
      }
    }
  }, []);

  // ============================================================
  // Format time
  // ============================================================
  const formatTime = (isoString) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // ============================================================
  // Keyboard shortcuts
  // ============================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setScanResult(null);
        setShowSearch(false);
        setSearchQuery('');
        setSearchResults([]);
        if (scannerInputRef.current) scannerInputRef.current.focus();
      }
      if (e.key === 'F2') {
        e.preventDefault();
        toggleCamera();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCamera]);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-title">
          <h1>Resepsi Pernikahan Wildan & Aisyah</h1>
          <span className="subtitle">Guest Check-In System</span>
        </div>
        <div className="header-clock">{clock}</div>
      </header>

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Undangan</div>
        </div>
        <div className="stat-card present">
          <div className="stat-value">{stats.present}</div>
          <div className="stat-label">Hadir</div>
        </div>
        <div className="stat-card absent">
          <div className="stat-value">{stats.absent}</div>
          <div className="stat-label">Belum Hadir</div>
        </div>
        <div className="stat-card percentage">
          <div className="stat-value">{stats.percentage}%</div>
          <div className="stat-label">Kehadiran</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Scanner Section */}
        <div className="scanner-section">
          <h2>
            <span>📷</span> Scanner & Input
          </h2>

          <div className="scanner-input-wrapper">
            <input
              ref={scannerInputRef}
              type="text"
              className="scanner-input"
              placeholder="Scan QR Code atau ketik nama/ID tamu disini..."
              onKeyDown={handleScannerKeyDown}
              autoFocus
              autoComplete="off"
              id="scanner-input"
            />
          </div>

          <div className="scanner-actions">
            <button
              className={`btn btn-camera ${cameraActive ? 'active' : ''}`}
              onClick={toggleCamera}
              id="btn-camera"
            >
              {cameraActive ? '⏹ Tutup Kamera' : '📷 Buka Kamera (F2)'}
            </button>

            <button className="btn btn-export" onClick={() => window.open(getExportUrl(), '_blank')} id="btn-export">
              📊 Export Excel
            </button>

            <button className="btn btn-reset" onClick={handleReset} id="btn-reset">
              🔄 Reset Semua
            </button>
          </div>

          {/* Camera View - Kept in DOM so html5-qrcode can find the element */}
          <div className="camera-section" style={{ display: cameraActive ? 'block' : 'none', marginTop: '1rem' }}>
            <div id="qr-reader" style={{ width: '100%' }}></div>
          </div>
        </div>

        {/* Scan Result */}
        {scanResult && (
          <div className={`scan-result ${scanResult.type}`} key={Date.now()}>
            <div className="result-icon">
              {scanResult.type === 'success' && '✅'}
              {scanResult.type === 'duplicate' && '⚠️'}
              {scanResult.type === 'error' && '❌'}
            </div>
            <div className="result-info">
              <h3>
                {scanResult.type === 'success' && `Selamat Datang, ${scanResult.guest?.name}!`}
                {scanResult.type === 'duplicate' && `Sudah Check-In: ${scanResult.guest?.name}`}
                {scanResult.type === 'error' && 'Tamu Tidak Ditemukan'}
              </h3>
              <p>{scanResult.message}</p>
              {scanResult.guest && (
                <div>
                  <span className="guest-id">{scanResult.guest.id}</span>
                  {scanResult.guest.category && (
                    <span className="guest-category">{scanResult.guest.category}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search Section */}
        <div className="scanner-section">
          <h2>
            <span>🔍</span> Pencarian Manual
          </h2>
          <input
            type="text"
            className="scanner-input"
            placeholder="Ketik nama tamu untuk mencari..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            id="search-input"
          />

          {showSearch && searchResults.length > 0 && (
            <div className="search-results" style={{ marginTop: '12px' }}>
              <h3>Hasil Pencarian ({searchResults.length})</h3>
              {searchResults.map((guest) => (
                <div className="search-item" key={guest.id}>
                  <div className="guest-info">
                    <span className="guest-name">{guest.name}</span>
                    <span className="guest-meta">{guest.id} • {guest.category}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {guest.is_present ? (
                      <>
                        <span className="status-badge present">Hadir {formatTime(guest.checked_in_at)}</span>
                        <button className="btn-undo" onClick={() => handleUndo(guest.id)}>Undo</button>
                      </>
                    ) : (
                      <button
                        className="btn-checkin"
                        onClick={() => handleManualCheckin(guest.id)}
                      >
                        Check-In
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Check-ins */}
        <div className="recent-section">
          <h2>
            <span>🕐</span> Tamu Terakhir Check-In
          </h2>
          {recentCheckins.length > 0 ? (
            <ul className="recent-list">
              {recentCheckins.map((guest, index) => (
                <li className="recent-item" key={guest.id}>
                  <div className="guest-info">
                    <span className="guest-name">{index + 1}. {guest.name}</span>
                    <span className="guest-meta">{guest.id} • {guest.category}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="checkin-time">{formatTime(guest.checked_in_at)}</span>
                    <button className="btn-undo" onClick={() => handleUndo(guest.id)}>Undo</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p>Belum ada tamu yang check-in</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
