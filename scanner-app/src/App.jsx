import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { connectWebSocket, disconnectWebSocket } from './utils/websocket';
import { checkinGuest, checkinGuestById, undoCheckin, searchGuests, getRecentCheckins, getStats, resetAllCheckins, getExportUrl } from './utils/api';
import { playSuccess, playDuplicate, playError, initAudio } from './utils/audio';
import './App.css';

function App() {
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, percentage: 0 });
  const [scanResult, setScanResult] = useState(null); // { type: 'success'|'duplicate'|'error', guest, message }
  const [lastGuest, setLastGuest] = useState(null);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [clock, setClock] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmGuest, setConfirmGuest] = useState(null); // Guest awaiting confirmation
  const [successModalGuest, setSuccessModalGuest] = useState(null); // Pop up "Scan QR Berhasil"
  const [showMejaQrModal, setShowMejaQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const searchInputRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const scanCooldownRef = useRef(false);
  const resultTimeoutRef = useRef(null);
  const debounceTimerRef = useRef(null);

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
          setLastGuest(null);
          setConfirmGuest(null);
          setSuccessModalGuest(null);
          setSearchQuery('');
          setSearchResults([]);
          setShowSearch(false);
          setIsSearching(false);
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

  // Focus helper: input is focused when intentionally clicked by user, not forced by interval

  // ============================================================
  // Refresh recent check-ins
  // ============================================================
  const refreshRecent = useCallback(async () => {
    try {
      const data = await getRecentCheckins(10);
      setRecentCheckins(data);
      if (data && data.length > 0) {
        setLastGuest(data[0]);
      }
    } catch (e) {
      console.error('Failed to fetch recent:', e);
    }
  }, []);

  // ============================================================
  // Prompt Confirmation before Check-In
  // ============================================================
  const promptCheckinConfirmation = useCallback((guest) => {
    if (!guest) return;
    if (guest.is_present) {
      playError();
    }
    setConfirmGuest(guest);
  }, []);

  // ============================================================
  // Process Camera QR scan result (Direct check-in & pop-up)
  // ============================================================
  const processScan = useCallback(async (rawText) => {
    if (isProcessing || scanCooldownRef.current) return;
    if (!rawText || rawText.trim() === '') return;

    const trimmed = rawText.trim();
    setIsProcessing(true);
    scanCooldownRef.current = true;

    try {
      // Langsung lakukan check-in dengan query scan (Metode: QR Scan)
      let result = await checkinGuest(trimmed, 'QR Scan');

      // Jika 404, coba cari tamu lewat search untuk antisipasi perbedaan format ID/QR
      if (result.status === 404) {
        const results = await searchGuests(trimmed);
        if (results && results.length > 0) {
          const match = results.find(g => g.id.toLowerCase() === trimmed.toLowerCase() || g.qr_payload === trimmed) || results[0];
          result = await checkinGuestById(match.id, 'QR Scan');
        }
      }

      if (result.status === 200) {
        // Scan QR Berhasil (pertama kali / belum check-in)
        playSuccess();
        const guestData = result.data.guest;
        setSuccessModalGuest(guestData); // Tampilkan pop up "Scan QR Berhasil"
        setScanResult({
          type: 'success',
          guest: guestData,
          message: result.data.message || 'Scan QR Berhasil'
        });
        setLastGuest(guestData);
        refreshRecent();
      } else if (result.status === 409) {
        // Scan lebih dari 1x: munculkan pesan duplicate yang saat ini sudah ada
        playDuplicate();
        setSuccessModalGuest(null); // Pastikan pop up sukses tidak muncul
        setScanResult({
          type: 'duplicate',
          guest: result.data.guest,
          message: result.data.message
        });
        setLastGuest(result.data.guest);
      } else {
        playError();
        setSuccessModalGuest(null);
        setScanResult({
          type: 'error',
          guest: null,
          message: result.data.message || 'Tamu Tidak Ditemukan'
        });
      }
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => setScanResult(null), 6000);
    } catch (e) {
      console.error('Scan processing error:', e);
      playError();
      setSuccessModalGuest(null);
      setScanResult({
        type: 'error',
        guest: null,
        message: 'Gagal memproses QR Code.'
      });
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => setScanResult(null), 5000);
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        scanCooldownRef.current = false;
      }, 1500);
    }
  }, [isProcessing, refreshRecent]);

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
        () => { } // ignore frame scan errors
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
        try { html5QrCodeRef.current.clear(); } catch (e) { }
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
  // Direct Search Function (digunakan untuk refresh instan atau enter)
  // ============================================================
  const fetchSearchResults = useCallback(async (query) => {
    const trimmed = query ? query.trim() : '';
    if (!trimmed) {
      setSearchResults([]);
      setShowSearch(false);
      setIsSearching(false);
      return [];
    }
    setIsSearching(true);
    try {
      const results = await searchGuests(trimmed);
      setSearchResults(results || []);
      setShowSearch(true);
      return results || [];
    } catch (e) {
      console.error('Search failed:', e);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []);

  // ============================================================
  // Debounce pada Pencarian Nama & Input Tamu Manual (300ms)
  // ============================================================
  useEffect(() => {
    // Batalkan timeout sebelumnya jika ada input baru dalam jeda debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setShowSearch(false);
      setIsSearching(false);
      return;
    }

    // Tampilkan status pencarian sedang berlangsung
    setIsSearching(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchGuests(trimmed);
        setSearchResults(results || []);
        setShowSearch(true);
      } catch (e) {
        console.error('Debounced search failed:', e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  // Handler pembersihan pencarian
  const handleClearSearch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
    setIsSearching(false);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // ============================================================
  // Execute Check-in after Confirmation
  // ============================================================
  const executeConfirmCheckin = useCallback(async () => {
    if (!confirmGuest) return;
    const guestToConfirm = confirmGuest;
    setConfirmGuest(null);

    try {
      const result = await checkinGuestById(guestToConfirm.id, 'Input Panitia');
      if (result.status === 200) {
        playSuccess();
        setSuccessModalGuest(result.data.guest); // Tampilkan pop up Scan QR Berhasil
        setScanResult({
          type: 'success',
          guest: result.data.guest,
          message: result.data.message
        });
        setLastGuest(result.data.guest);
        refreshRecent();
        if (searchQuery.trim()) {
          fetchSearchResults(searchQuery.trim());
        }
      } else if (result.status === 409) {
        playDuplicate();
        setSuccessModalGuest(null);
        setScanResult({
          type: 'duplicate',
          guest: result.data.guest,
          message: result.data.message
        });
        setLastGuest(result.data.guest);
      } else {
        playError();
        setSuccessModalGuest(null);
        setScanResult({
          type: 'error',
          guest: null,
          message: result.data.message || 'Gagal melakukan check-in.'
        });
      }
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => setScanResult(null), 5000);
    } catch (e) {
      console.error('Confirm checkin failed:', e);
      playError();
      setScanResult({
        type: 'error',
        guest: null,
        message: 'Gagal terhubung ke server.'
      });
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => setScanResult(null), 5000);
    }
  }, [confirmGuest, searchQuery, fetchSearchResults, refreshRecent]);

  // ============================================================
  // Search Input KeyDown (Enter support)
  // ============================================================
  const handleSearchKeyDown = useCallback(async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchQuery.trim();
      if (!q) return;

      // Batalkan timer debounce yang sedang berjalan jika user langsung tekan Enter
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const exactMatch = searchResults.find(
        g => g.id.toLowerCase() === q.toLowerCase() || g.name.toLowerCase() === q.toLowerCase()
      );

      if (exactMatch) {
        promptCheckinConfirmation(exactMatch);
      } else if (searchResults.length === 1) {
        promptCheckinConfirmation(searchResults[0]);
      } else if (searchResults.length > 1) {
        setShowSearch(true);
      } else {
        setIsSearching(true);
        try {
          const results = await searchGuests(q);
          setSearchResults(results || []);
          if (results && results.length === 1) {
            promptCheckinConfirmation(results[0]);
          } else if (results && results.length > 1) {
            setShowSearch(true);
          } else {
            const res = await checkinGuest(q, 'Input Panitia');
            if ((res.status === 200 || res.status === 409) && res.data.guest) {
              promptCheckinConfirmation(res.data.guest);
            } else {
              playError();
              setScanResult({
                type: 'error',
                guest: null,
                message: `Tamu "${q}" tidak ditemukan.`
              });
              clearTimeout(resultTimeoutRef.current);
              resultTimeoutRef.current = setTimeout(() => setScanResult(null), 5000);
            }
          }
        } catch (err) {
          console.error('Enter search failed:', err);
        } finally {
          setIsSearching(false);
        }
      }
    }
  }, [searchQuery, searchResults, promptCheckinConfirmation]);

  // ============================================================
  // Undo
  // ============================================================
  const handleUndo = useCallback(async (guestId) => {
    try {
      await undoCheckin(guestId);
      refreshRecent();
      if (searchQuery.trim()) {
        fetchSearchResults(searchQuery.trim());
      }
    } catch (e) {
      console.error('Undo failed:', e);
    }
  }, [refreshRecent, searchQuery, fetchSearchResults]);

  // ============================================================
  // Reset
  // ============================================================
  const handleReset = useCallback(async () => {
    if (window.confirm('Yakin ingin mereset semua data check-in? Tindakan ini tidak bisa dibatalkan.')) {
      try {
        await resetAllCheckins();
        setScanResult(null);
        setLastGuest(null);
        setConfirmGuest(null);
        setSuccessModalGuest(null);
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
        if (successModalGuest) {
          setSuccessModalGuest(null);
        } else if (confirmGuest) {
          setConfirmGuest(null);
        } else {
          handleClearSearch();
          setScanResult(null);
        }
      }
      if (e.key === 'Enter') {
        if (successModalGuest) {
          e.preventDefault();
          setSuccessModalGuest(null);
        } else if (confirmGuest) {
          e.preventDefault();
          executeConfirmCheckin();
        }
      }
      if (e.key === 'F2') {
        e.preventDefault();
        toggleCamera();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [successModalGuest, confirmGuest, executeConfirmCheckin, toggleCamera, handleClearSearch]);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-title">
          <h1>The Wedding of Wildan & Aisyah</h1>
          <span className="subtitle">Guest Check-In</span>
        </div>
        <div className="header-right">
          <button
            type="button"
            className="btn-qr-meja"
            onClick={() => setShowMejaQrModal(true)}
            title="Tampilkan QR Code Meja untuk Tamu Check-In Mandiri"
          >
            <span className="material-symbols-outlined">qr_code_2</span>
            <span>QR Meja Mandiri</span>
          </button>
          <div className="connection-badge">
            <span className={`status-indicator ${wsConnected ? 'connected' : 'disconnected'}`}></span>
            <span>{wsConnected ? 'Online' : 'Menghubungkan...'}</span>
          </div>
          <div className="header-clock">{clock}</div>
        </div>
      </header>

      {/* Main Content: 2-Column Layout */}
      <main className="main-content-grid">
        {/* LEFT COLUMN: Camera Scanner & Last Scan Result */}
        <div className="grid-column">
          {/* Card 1: Scanner Kamera QR Code */}
          <section className="app-card camera-scanner-card">
            <div className="card-header">
              <span className="material-symbols-outlined card-header-icon">photo_camera</span>
              <div>
                <h2>Scanner Kamera QR Code</h2>
                <p className="card-subtitle">
                  Arahkan kamera ke QR Code kartu undangan tamu untuk check-in instan
                </p>
              </div>
            </div>

            {/* Camera Scan Action */}
            <div className="scanner-actions">
              <button
                type="button"
                className={`btn btn-camera ${cameraActive ? 'active' : ''}`}
                onClick={toggleCamera}
                id="btn-camera"
              >
                {cameraActive ? (
                  <>
                    <span className="material-symbols-outlined">videocam_off</span> Tutup Kamera
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">photo_camera</span> Buka Kamera Scan QR
                  </>
                )}
              </button>
            </div>

            {/* Camera View */}
            <div className="camera-section" style={{ display: cameraActive ? 'block' : 'none' }}>
              <div id="qr-reader" style={{ width: '100%' }}></div>
            </div>
          </section>

          {/* Card 2: Hasil Scan Tamu Undangan Terakhir (Tepat di bawah kamera) */}
          <section className="app-card last-scan-card">
            <div className="card-header">
              <span className="material-symbols-outlined card-header-icon">badge</span>
              <div>
                <h2>Hasil Scan Tamu Terakhir</h2>
                <p className="card-subtitle">Konfirmasi status kehadiran tamu yang baru discan</p>
              </div>
            </div>

            {scanResult ? (
              <div className={`scan-result-banner ${scanResult.type}`} key={Date.now()}>
                <div className="result-banner-icon">
                  {scanResult.type === 'success' && (
                    <span className="material-symbols-outlined">check_circle</span>
                  )}
                  {scanResult.type === 'duplicate' && (
                    <span className="material-symbols-outlined">warning</span>
                  )}
                  {scanResult.type === 'error' && (
                    <span className="material-symbols-outlined">cancel</span>
                  )}
                </div>
                <div className="result-banner-content">
                  <div className="result-status-tag">
                    {scanResult.type === 'success' && 'BERHASIL CHECK-IN'}
                    {scanResult.type === 'duplicate' && 'SUDAH PERNAH CHECK-IN'}
                    {scanResult.type === 'error' && 'TAMU TIDAK DITEMUKAN'}
                  </div>
                  <h3 className="result-guest-name">
                    {scanResult.guest ? scanResult.guest.name : 'Data Tidak Cocok'}
                  </h3>
                  <p className="result-message">{scanResult.message}</p>
                  {scanResult.guest && (
                    <div className="result-tags">
                      <span className="guest-id-tag">{scanResult.guest.id}</span>
                      {scanResult.guest.category && (
                        <span className="guest-cat-tag">{scanResult.guest.category}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : lastGuest ? (
              <div className="last-guest-display">
                <div className="last-guest-avatar">
                  <span className="material-symbols-outlined">person</span>
                </div>
                <div className="last-guest-details">
                  <span className="last-guest-label">Tamu Terakhir yang Hadir:</span>
                  <h3 className="last-guest-name">{lastGuest.name}</h3>
                  <div className="last-guest-meta">
                    <span className="guest-id-tag">{lastGuest.id}</span>
                    {lastGuest.category && (
                      <span className="guest-cat-tag">{lastGuest.category}</span>
                    )}
                    <span className="checkin-time-tag">
                      <span className="material-symbols-outlined">schedule</span>
                      {formatTime(lastGuest.checked_in_at)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-scan-state">
                <span className="material-symbols-outlined empty-icon">qr_code_scanner</span>
                <p>Belum ada aktivitas scan</p>
                <span>Silakan scan QR Code kartu undangan tamu</span>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Search / Manual Input (Bawah dari hasil scan pada mobile) & Recent Checkins */}
        <div className="grid-column">
          {/* Card 3: Field Pencarian & Input Tamu Manual (Dipindah ke bawah hasil scan) */}
          <section className="app-card search-input-card">
            <div className="card-header">
              <span className="material-symbols-outlined card-header-icon">person_search</span>
              <div>
                <h2>Pencarian & Input Tamu Manual</h2>
                <p className="card-subtitle">
                  Ketik nama atau ID tamu jika undangan tidak terbawa atau perlu dicek manual
                </p>
              </div>
            </div>

            {/* Search input field */}
            <div className="search-field-section" style={{ marginTop: 0 }}>
              <label htmlFor="search-input" className="search-input-label">
                Field Pencarian & Input Tamu:
              </label>
              <div className="scanner-input-box">
                <span className={`material-symbols-outlined input-icon ${isSearching ? 'spinning' : ''}`}>
                  {isSearching ? 'progress_activity' : 'search'}
                </span>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="scanner-input"
                  placeholder="Ketik nama atau ID tamu disini (misal: Budi, Wildan)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  autoComplete="off"
                  id="search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="btn-clear-search"
                    onClick={handleClearSearch}
                    title="Hapus pencarian"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                )}
              </div>
              <span className="search-input-hint">
                Tekan Enter atau pilih tombol Check-In pada daftar nama yang serupa di bawah untuk konfirmasi.
              </span>
            </div>

            {/* Search Results Display Area */}
            {searchQuery.trim().length > 0 && (
              <div className="search-results-wrapper">
                {isSearching && searchResults.length === 0 ? (
                  <div className="search-loading-box">
                    <span className="material-symbols-outlined spinning-icon">progress_activity</span>
                    <p>Mencari data tamu...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="search-results">
                    <div className="search-results-header">
                      <div className="search-results-title">
                        <span className="material-symbols-outlined">group</span>
                        <span>Hasil Pencarian ({searchResults.length} Tamu Ditemukan)</span>
                      </div>
                      <span className="search-results-hint">
                        Pilih nama dan ID yang sesuai untuk mencegah salah input:
                      </span>
                    </div>
                    <div className="search-list">
                      {searchResults.map((guest) => (
                        <div className="search-item" key={guest.id}>
                          <div className="guest-info">
                            <div className="guest-name-row">
                              <span className="guest-name">{guest.name}</span>
                              <span className="guest-id-tag">ID: {guest.id}</span>
                            </div>
                            <div className="guest-meta-row">
                              <span className="guest-cat-tag">{guest.category}</span>
                              {guest.pax && <span className="guest-pax-tag">{guest.pax} Pax</span>}
                            </div>
                          </div>
                          <div className="guest-action">
                            {guest.is_present ? (
                              <>
                                <span className="status-badge present">
                                  <span className="material-symbols-outlined">check_circle</span>
                                  Hadir {formatTime(guest.checked_in_at)}
                                </span>
                                <button
                                  type="button"
                                  className="btn-undo"
                                  onClick={() => handleUndo(guest.id)}
                                >
                                  <span className="material-symbols-outlined">undo</span> Undo
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn-checkin"
                                onClick={() => promptCheckinConfirmation(guest)}
                              >
                                <span className="material-symbols-outlined">how_to_reg</span> Check-In
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="search-empty-box">
                    <span className="material-symbols-outlined empty-search-icon">person_off</span>
                    <p>Tidak ada tamu dengan nama "<strong>{searchQuery}</strong>"</p>
                    <span>Periksa kembali ejaan nama atau ID tamu yang Anda ketik.</span>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Card 4: Riwayat Tamu Terakhir Check-In */}
          <section className="app-card recent-checkins-card">
            <div className="card-header">
              <span className="material-symbols-outlined card-header-icon">history</span>
              <div>
                <h2>Riwayat Check-In Terakhir</h2>
                <p className="card-subtitle">Urutan tamu yang telah berhasil melakukan check-in</p>
              </div>
            </div>

            {recentCheckins.length > 0 ? (
              <ul className="recent-list">
                {recentCheckins.map((guest, index) => (
                  <li className="recent-item" key={guest.id}>
                    <div className="recent-guest-info">
                      <span className="recent-index">{index + 1}</span>
                      <div>
                        <span className="guest-name">{guest.name}</span>
                        <span className="guest-meta">
                          {guest.id} • {guest.category || 'Tamu'}
                          {guest.checkin_method && (
                            <span className={`method-badge method-${guest.checkin_method.toLowerCase().replace(/\s+/g, '-')}`}>
                              {guest.checkin_method}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="recent-guest-time">
                      <span className="checkin-time">{formatTime(guest.checked_in_at)}</span>
                      <button className="btn-undo" onClick={() => handleUndo(guest.id)}>
                        <span className="material-symbols-outlined">undo</span> Undo
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <span className="material-symbols-outlined empty-icon">assignment_late</span>
                <p>Belum ada tamu yang check-in</p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* FOOTER: EXPORT FILE SPREADSHEET (PALING BAWAH HALAMAN) */}
      <footer className="app-footer">
        <div className="footer-actions-container">
          <button
            className="btn btn-export-bottom"
            onClick={() => window.open(getExportUrl(), '_blank')}
            id="btn-export"
          >
            <span className="material-symbols-outlined">table_chart</span>
            <span>Export File Spreadsheet (.xlsx)</span>
          </button>

          <button
            className="btn btn-reset-subtle"
            onClick={handleReset}
            id="btn-reset"
            title="Reset semua data check-in"
          >
            <span className="material-symbols-outlined">restart_alt</span>
            <span>Reset Data</span>
          </button>
        </div>
        <div className="footer-copyright">
          <span>The Wedding of Wildan & Aisyah • Guest Check-In Reception System</span>
        </div>
      </footer>

      {/* Pop Up Modal: Scan QR Berhasil */}
      {successModalGuest && (
        <div className="modal-overlay" onClick={() => setSuccessModalGuest(null)}>
          <div className="modal-dialog modal-success" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-wrapper success">
              <span className="material-symbols-outlined">check_circle</span>
            </div>
            <h3 className="modal-title success">Scan QR Berhasil</h3>
            <p className="modal-subtitle">
              Kehadiran tamu undangan telah berhasil diverifikasi dan tersimpan di sistem
            </p>

            <div className="modal-guest-card success-card">
              <div className="modal-guest-header">
                <span className="guest-id-tag">ID: {successModalGuest.id}</span>
                {successModalGuest.category && (
                  <span className="guest-cat-tag">{successModalGuest.category}</span>
                )}
                {successModalGuest.pax && (
                  <span className="guest-pax-tag">{successModalGuest.pax} Pax</span>
                )}
              </div>
              <div className="modal-guest-name">{successModalGuest.name}</div>
              <div className="modal-success-status">
                <span className="material-symbols-outlined">verified</span>
                <span>Tercatat Hadir • {formatTime(successModalGuest.checked_in_at)}</span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-modal-close"
                onClick={() => setSuccessModalGuest(null)}
                autoFocus
              >
                <span className="material-symbols-outlined">close</span> Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Sebelum Input Manual */}
      {confirmGuest && (
        <div className="modal-overlay" onClick={() => setConfirmGuest(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-wrapper">
              <span className="material-symbols-outlined">help_outline</span>
            </div>
            <h3 className="modal-title">Konfirmasi Check-In Tamu</h3>
            <p className="modal-subtitle">
              Mohon pastikan nama dan ID tamu berikut sudah sesuai sebelum check-in:
            </p>

            <div className="modal-guest-card">
              <div className="modal-guest-header">
                <span className="guest-id-tag">ID: {confirmGuest.id}</span>
                {confirmGuest.category && (
                  <span className="guest-cat-tag">{confirmGuest.category}</span>
                )}
              </div>
              <div className="modal-guest-name">{confirmGuest.name}</div>
              {confirmGuest.is_present && (
                <div className="modal-alert-present">
                  <span className="material-symbols-outlined">warning</span>
                  <span>Perhatian: Tamu ini sudah pernah tercatat hadir sebelumnya!</span>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-modal-cancel"
                onClick={() => setConfirmGuest(null)}
              >
                <span className="material-symbols-outlined">close</span> Batal
              </button>
              <button
                type="button"
                className="btn btn-modal-confirm"
                onClick={executeConfirmCheckin}
                autoFocus
              >
                <span className="material-symbols-outlined">check_circle</span>
                {confirmGuest.is_present ? 'Check-In Ulang' : 'Ya, Konfirmasi Hadir'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal QR Meja Resepsionis untuk Tamu Check-In Mandiri */}
      {showMejaQrModal && (
        <div className="modal-overlay" onClick={() => setShowMejaQrModal(false)}>
          <div className="modal-dialog modal-qr-meja" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-wrapper" style={{ color: '#C5A55A' }}>
              <span className="material-symbols-outlined">qr_code_2</span>
            </div>
            <h3 className="modal-title" style={{ color: '#2C2417' }}>QR Code Meja Resepsionis</h3>
            <p className="modal-subtitle">
              Pajang QR Code ini di meja penerima tamu agar tamu dapat melakukan check-in mandiri lewat smartphone masing-masing.
            </p>

            <div className="qr-meja-preview">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${window.location.origin}/self-checkin`)}`}
                alt="QR Code Check-in Mandiri"
                className="qr-meja-img"
              />
              <div className="qr-meja-caption">Scan untuk Check-In Mandiri</div>
              <div className="qr-meja-subcaption">Resepsi Wildan &amp; Aisyah</div>
            </div>

            <div className="qr-link-box">
              <span className="qr-link-text">{`${window.location.origin}/self-checkin`}</span>
              <button
                type="button"
                className="qr-link-btn"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/self-checkin`);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
              >
                {copiedLink ? 'Tersalin!' : 'Salin Link'}
              </button>
            </div>

            <div className="qr-modal-buttons">
              <button
                type="button"
                className="btn btn-modal-confirm"
                onClick={() => window.open(`${window.location.origin}/self-checkin`, '_blank')}
              >
                <span className="material-symbols-outlined">open_in_new</span> Buka Tampilan Tamu
              </button>
              <button
                type="button"
                className="btn btn-modal-cancel"
                onClick={() => window.print()}
              >
                <span className="material-symbols-outlined">print</span> Cetak QR
              </button>
              <button
                type="button"
                className="btn btn-modal-cancel"
                onClick={() => setShowMejaQrModal(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
