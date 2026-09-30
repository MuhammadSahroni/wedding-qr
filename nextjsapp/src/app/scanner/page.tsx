'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Html5Qrcode } from 'html5-qrcode';
import { playSuccess, playDuplicate, playError, initAudio } from '@/lib/audio-scanner';
import { Guest } from '@/lib/types';
import '@/styles/scanner.css';

export default function ScannerPage() {
  // Convex Reactive Data
  const convexRecent = useQuery(api.guests.getRecentCheckins, { limit: 10 });
  const checkinMutation = useMutation(api.guests.checkin);
  const undoMutation = useMutation(api.guests.undoCheckin);
  const walkinMutation = useMutation(api.guests.addWalkin);

  const [scanResult, setScanResult] = useState<{ type: 'success' | 'duplicate' | 'error'; guest: Guest | null; message: string } | null>(null);
  const [lastGuest, setLastGuest] = useState<Guest | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [clock, setClock] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmGuest, setConfirmGuest] = useState<Guest | null>(null);
  const [successModalGuest, setSuccessModalGuest] = useState<Guest | null>(null);
  const [showMejaQrModal, setShowMejaQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Walk-In state
  const [showWalkinModal, setShowWalkinModal] = useState(false);
  const [walkinName, setWalkinName] = useState('');
  const [walkinCategory, setWalkinCategory] = useState('Tamu Tambahan');
  const [walkinPax, setWalkinPax] = useState('1');
  const [walkinNotes, setWalkinNotes] = useState('');
  const [isSubmittingWalkin, setIsSubmittingWalkin] = useState(false);

  // Reactive search from Convex
  const searchResultsData = useQuery(api.guests.search, { query: searchQuery });
  const searchResults: Guest[] = useMemo(() => {
    if (searchResultsData) return searchResultsData as any;
    return [];
  }, [searchResultsData]);
  const isSearching = searchQuery.trim().length >= 2 && searchResultsData === undefined;

  const recentCheckins: Guest[] = useMemo(() => {
    if (convexRecent) return convexRecent as any;
    return [];
  }, [convexRecent]);

  // Keep lastGuest updated from recentCheckins
  useEffect(() => {
    if (recentCheckins.length > 0 && !lastGuest) {
      setLastGuest(recentCheckins[0]);
    }
  }, [recentCheckins, lastGuest]);

  const isOnline = convexRecent !== undefined;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scanCooldownRef = useRef(false);
  const resultTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isStartingCameraRef = useRef(false);

  // Clock
  useEffect(() => {
    initAudio();
    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Prompt Confirmation before Check-In
  const promptCheckinConfirmation = useCallback((guest: Guest) => {
    if (!guest) return;
    if (guest.is_present) {
      playError();
    }
    setConfirmGuest(guest);
  }, []);

  // Process Camera QR scan result via Convex mutation
  const processScan = useCallback(async (rawText: string) => {
    if (isProcessing || scanCooldownRef.current) return;
    if (!rawText || !rawText.trim()) return;

    const trimmed = rawText.trim();
    setIsProcessing(true);
    scanCooldownRef.current = true;

    try {
      const res = await checkinMutation({ query: trimmed, method: 'QR Scan' });

      if (res.status === 'success') {
        playSuccess();
        const guestData = res.guest as Guest;
        setSuccessModalGuest(guestData);
        setScanResult({
          type: 'success',
          guest: guestData,
          message: res.message || 'Scan QR Berhasil',
        });
        setLastGuest(guestData);

        // Sync to Google Spreadsheet
        fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed, method: 'QR Scan' }),
        }).catch((e) => console.error('Sheet checkin sync error:', e));
      } else if (res.status === 'duplicate') {
        playDuplicate();
        setSuccessModalGuest(null);
        setScanResult({
          type: 'duplicate',
          guest: (res.guest as Guest) || null,
          message: res.message || 'Tamu sudah melakukan check-in sebelumnya.',
        });
        if (res.guest) setLastGuest(res.guest as Guest);
      } else {
        playError();
        setSuccessModalGuest(null);
        setScanResult({
          type: 'error',
          guest: null,
          message: res.message || 'Tamu Tidak Ditemukan',
        });
      }

      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => setScanResult(null), 6000);
    } catch (e) {
      console.error('Scan processing error:', e);
      playError();
      setSuccessModalGuest(null);
      setScanResult({
        type: 'error',
        guest: null,
        message: 'Gagal memproses QR Code. Periksa koneksi internet.',
      });
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => setScanResult(null), 5000);
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        scanCooldownRef.current = false;
      }, 1500);
    }
  }, [isProcessing, checkinMutation]);

  // Camera Management
  const startCamera = useCallback(async () => {
    if (isStartingCameraRef.current) return;
    if (html5QrCodeRef.current?.isScanning) return;

    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      alert('⚠️ Akses kamera membutuhkan koneksi HTTPS. Silakan gunakan URL aman (HTTPS) di browser HP Anda.');
      return;
    }

    isStartingCameraRef.current = true;
    setCameraActive(true);

    try {
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
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * 0.7);
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.0,
      };

      let cameraToUse: any = { facingMode: 'environment' };
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          const backCamera = devices.find(d =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('belakang') ||
            d.label.toLowerCase().includes('environment')
          );
          cameraToUse = backCamera ? backCamera.id : devices[0].id;
        }
      } catch (devErr) {
        console.warn('Could not enumerate cameras, using facingMode default:', devErr);
      }

      await html5QrCode.start(
        cameraToUse,
        config,
        (decodedText) => {
          processScan(decodedText);
        },
        () => { }
      );
    } catch (err: any) {
      console.error('Camera error:', err);
      let msg = 'Gagal membuka kamera. ';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg += 'Izin kamera ditolak di browser.';
      } else {
        msg += err.message || err;
      }
      alert(msg);
      setCameraActive(false);
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

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  // Execute Check-in after confirmation via Convex
  const executeConfirmCheckin = useCallback(async () => {
    if (!confirmGuest) return;
    const guestToConfirm = confirmGuest;
    setConfirmGuest(null);

    try {
      const data = await checkinMutation({ query: guestToConfirm.id, method: 'Input Panitia' });

      if (data.status === 'success') {
        playSuccess();
        const guestData = data.guest as Guest;
        setSuccessModalGuest(guestData);
        setScanResult({
          type: 'success',
          guest: guestData,
          message: data.message,
        });
        setLastGuest(guestData);

        // Sync to Google Spreadsheet
        fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: guestToConfirm.id, method: 'Input Panitia' }),
        }).catch((e) => console.error('Sheet checkin sync error:', e));
      } else if (data.status === 'duplicate') {
        playDuplicate();
        setSuccessModalGuest(null);
        setScanResult({
          type: 'duplicate',
          guest: (data.guest as Guest) || null,
          message: data.message,
        });
      } else {
        playError();
        setSuccessModalGuest(null);
        setScanResult({
          type: 'error',
          guest: null,
          message: data.message || 'Gagal check-in',
        });
      }

      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => setScanResult(null), 5000);
    } catch (e) {
      console.error('Confirm checkin failed:', e);
      playError();
    }
  }, [confirmGuest, checkinMutation]);

  // Handle Walk-in Submission via Convex and Google Sheets
  const handleWalkinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = walkinName.trim();
    if (!trimmed || isSubmittingWalkin) return;

    setIsSubmittingWalkin(true);
    const paxNum = parseInt(walkinPax, 10) || 1;
    const notesStr = walkinNotes.trim() || 'Input Panitia (Walk-In)';

    try {
      const data = await walkinMutation({
        name: trimmed,
        category: walkinCategory,
        pax: paxNum,
        notes: notesStr,
        method: 'Input Panitia',
      });

      if (data.status === 'success') {
        playSuccess();
        const guestData = data.guest as Guest;
        setSuccessModalGuest(guestData);
        setScanResult({
          type: 'success',
          guest: guestData,
          message: data.message || 'Tamu Walk-In Berhasil Ditambahkan',
        });
        setLastGuest(guestData);
        setShowWalkinModal(false);
        setWalkinName('');
        setWalkinNotes('');

        // Sync to Google Spreadsheet
        fetch('/api/walkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmed,
            category: walkinCategory,
            pax: paxNum,
            notes: notesStr,
            method: 'Input Panitia',
          }),
        }).catch((err) => console.error('Sheet walkin sync error:', err));
      } else if (data.status === 'duplicate') {
        playDuplicate();
        alert(data.message || 'Nama tamu ini sudah pernah didaftarkan check-in.');
      }
    } catch (err) {
      console.error('Walkin submission failed:', err);
      playError();
      alert('Gagal menambahkan tamu. Periksa koneksi internet.');
    } finally {
      setIsSubmittingWalkin(false);
    }
  };

  // Undo Check-in via Convex & Sheets
  const handleUndo = useCallback(async (guestId: string) => {
    try {
      await undoMutation({ id: guestId });
      // Sync undo to Google Spreadsheet
      fetch('/api/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: guestId }),
      }).catch((e) => console.error('Sheet undo sync error:', e));
    } catch (e) {
      console.error('Undo failed:', e);
    }
  }, [undoMutation]);

  // Format Time
  const formatTime = (isoString: string | null) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const selfCheckinUrl = typeof window !== 'undefined' ? `${window.location.origin}/self-checkin` : '';

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-title">
          <h1>The Wedding of Wildan & Aisyah</h1>
          <span className="subtitle">Guest Check-In System</span>
        </div>
        <div className="header-right">
          <div className="header-actions-group">
            <button
              type="button"
              className="btn-header-action btn-walkin-action"
              onClick={() => setShowWalkinModal(true)}
              title="Tambah Tamu Baru (Walk-In) Tanpa ID Tamu"
            >
              <span className="material-symbols-outlined">person_add</span>
              <span>+ Tamu Walk-In</span>
            </button>
            <button
              type="button"
              className="btn-header-action btn-qr-action"
              onClick={() => setShowMejaQrModal(true)}
              title="Tampilkan QR Code Meja untuk Tamu Check-In Mandiri"
            >
              <span className="material-symbols-outlined">qr_code_2</span>
              <span>QR Self Check-in</span>
            </button>
          </div>
          <div className="header-status-group">
            <div className="connection-badge">
              <span className={`status-indicator ${isOnline ? 'connected' : 'disconnected'}`}></span>
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <div className="header-clock">{clock}</div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content-grid">
        {/* LEFT COLUMN: Camera Scanner & Last Scan Result */}
        <div className="grid-column">
          {/* Card 1: Camera Scanner */}
          <section className="app-card camera-scanner-card">
            <div className="card-header">
              <span className="material-symbols-outlined card-header-icon">photo_camera</span>
              <div>
                <h2>Scan QR Code</h2>
                <p className="card-subtitle">
                  Arahkan kamera ke QR Code kartu undangan tamu untuk melakukan check-in
                </p>
              </div>
            </div>

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

            <div className="camera-section" style={{ display: cameraActive ? 'block' : 'none' }}>
              <div id="qr-reader" style={{ width: '100%' }}></div>
            </div>
          </section>

          {/* Card 2: Last Scan Result */}
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
                  {scanResult.type === 'success' && <span className="material-symbols-outlined">check_circle</span>}
                  {scanResult.type === 'duplicate' && <span className="material-symbols-outlined">warning</span>}
                  {scanResult.type === 'error' && <span className="material-symbols-outlined">cancel</span>}
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
                      {scanResult.guest.category && <span className="guest-cat-tag">{scanResult.guest.category}</span>}
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
                    {lastGuest.category && <span className="guest-cat-tag">{lastGuest.category}</span>}
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

        {/* RIGHT COLUMN: Search / Manual Input & Recent Checkins */}
        <div className="grid-column">
          {/* Card 3: Search / Manual Input */}
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
            </div>

            {searchQuery.trim().length > 0 && (
              <div className="search-results-wrapper">
                {isSearching && searchResults.length === 0 ? (
                  <div className="search-loading-box">
                    <span className="material-symbols-outlined spinning-icon">progress_activity</span>
                    <p>Mencari data tamu...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="search-results">
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
                    <p>Tidak ada tamu dengan nama &quot;<strong>{searchQuery}</strong>&quot;</p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Card 4: Recent Checkins */}
          <section className="app-card recent-checkins-card">
            <div className="card-header">
              <span className="material-symbols-outlined card-header-icon">history</span>
              <div>
                <h2>Riwayat Check-In Terakhir</h2>
                <p className="card-subtitle">
                  Daftar kehadiran tamu terkini
                </p>
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

      {/* FOOTER */}
      <footer className="app-footer">
        <div className="footer-copyright">
          <span>The Wedding of Wildan & Aisyah</span>
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
              Kehadiran tamu undangan telah berhasil diverifikasi dan tersimpan ke Google Sheets
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
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(selfCheckinUrl)}`}
                alt="QR Code Check-in Mandiri"
                className="qr-meja-img"
              />
              <div className="qr-meja-caption">Scan untuk Check-In Mandiri</div>
              <div className="qr-meja-subcaption">Resepsi Wildan &amp; Aisyah</div>
            </div>

            <div className="qr-link-box">
              <span className="qr-link-text">{selfCheckinUrl}</span>
              <button
                type="button"
                className="qr-link-btn flex items-center gap-1"
                onClick={() => {
                  navigator.clipboard.writeText(selfCheckinUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  {copiedLink ? 'check' : 'content_copy'}
                </span>
                <span>{copiedLink ? 'Tersalin!' : 'Salin Link'}</span>
              </button>
            </div>

            <div className="qr-modal-buttons">
              <button
                type="button"
                className="btn btn-modal-confirm"
                onClick={() => window.open(selfCheckinUrl, '_blank')}
              >
                <span className="material-symbols-outlined">open_in_new</span> Buka Tampilan Tamu
              </button>
              <button
                type="button"
                className="btn btn-modal-cancel"
                onClick={() => setShowMejaQrModal(false)}
              >
                <span className="material-symbols-outlined">close</span> Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Tamu Baru / Walk-In */}
      {showWalkinModal && (
        <div className="modal-overlay" onClick={() => setShowWalkinModal(false)}>
          <div className="modal-dialog modal-walkin" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-icon-wrapper" style={{ color: '#C5A55A' }}>
              <span className="material-symbols-outlined">person_add</span>
            </div>
            <h3 className="modal-title" style={{ color: '#2C2417' }}>Tambah Tamu Baru (Walk-In)</h3>
            <p className="modal-subtitle">
              Tamu yang belum memiliki QR / ID Tamu akan otomatis tercatat hadir di Display Layar &amp; Google Spreadsheet.
            </p>

            <form onSubmit={handleWalkinSubmit} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A3F32', marginBottom: '6px' }}>
                  Nama Lengkap Tamu <span style={{ color: '#c53030' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Bpk. Bambang Sutrisno"
                  value={walkinName}
                  onChange={(e) => setWalkinName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #D4AF37', outline: 'none', fontSize: '14px', background: '#FAF8F5' }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A3F32', marginBottom: '6px' }}>
                    Kategori Tamu
                  </label>
                  <select
                    value={walkinCategory}
                    onChange={(e) => setWalkinCategory(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E8DFD0', outline: 'none', fontSize: '14px', background: '#FAF8F5' }}
                  >
                    <option value="Tamu Tambahan">Tamu Tambahan</option>
                    <option value="Keluarga">Keluarga</option>
                    <option value="VIP">VIP</option>
                    <option value="Reguler">Reguler</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A3F32', marginBottom: '6px' }}>
                    Jumlah (Pax)
                  </label>
                  <select
                    value={walkinPax}
                    onChange={(e) => setWalkinPax(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E8DFD0', outline: 'none', fontSize: '14px', background: '#FAF8F5' }}
                  >
                    <option value="1">1 Orang</option>
                    <option value="2">2 Orang</option>
                    <option value="3">3 Orang</option>
                    <option value="4">4 Orang</option>
                    <option value="5">5+ Orang</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A3F32', marginBottom: '6px' }}>
                  Catatan (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Teman kantor mempelai pria"
                  value={walkinNotes}
                  onChange={(e) => setWalkinNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E8DFD0', outline: 'none', fontSize: '14px', background: '#FAF8F5' }}
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-modal-cancel"
                  onClick={() => setShowWalkinModal(false)}
                  disabled={isSubmittingWalkin}
                >
                  <span className="material-symbols-outlined">close</span> Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-modal-confirm"
                  disabled={isSubmittingWalkin || !walkinName.trim()}
                >
                  <span className="material-symbols-outlined">
                    {isSubmittingWalkin ? 'progress_activity' : 'check_circle'}
                  </span>
                  <span>{isSubmittingWalkin ? 'Menyimpan...' : 'Simpan & Check-In'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
