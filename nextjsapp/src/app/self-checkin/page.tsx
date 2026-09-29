'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import { Guest } from '@/lib/types';
import '@/styles/self-checkin.css';

// Audio chime function using Web Audio API (works natively on iOS and Android)
function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Pleasant 3-tone arpeggio (C5 -> E5 -> G5)
    const tones = [523.25, 659.25, 783.99];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.12);
      osc.stop(ctx.currentTime + idx * 0.12 + 0.35);
    });
  } catch {
    // Ignore audio autoplay restrictions gracefully
  }
}

export default function SelfCheckinPage() {
  const [activeTab, setActiveTab] = useState<'search' | 'walkin'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Guest[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);

  // Walk-in form state
  const [walkinName, setWalkinName] = useState('');
  const [walkinCategory, setWalkinCategory] = useState('Tamu Undangan');
  const [walkinPax, setWalkinPax] = useState('1');
  const [walkinNotes, setWalkinNotes] = useState('');

  // Status & Success state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{ type: 'warning' | 'error'; message: string } | null>(null);
  const [successData, setSuccessData] = useState<any>(null);

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search logic
  useEffect(() => {
    if (activeTab !== 'search') return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data: Guest[] = await res.json();
          setResults(data || []);
          setHasSearched(true);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, activeTab]);

  const handleSelectGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    if (guest.is_present) {
      setAlertInfo({
        type: 'warning',
        message: `${guest.name} sudah tercatat hadir pada pukul ${guest.checked_in_at || 'sebelumnya'}.`,
      });
    } else {
      setAlertInfo(null);
    }
  };

  const fireConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#C5A55A', '#E8D5A3', '#8B7635', '#FAF6EE', '#D4AF37'],
      });
    } catch {
      // ignore
    }
  };

  const handleConfirmRegistered = async () => {
    if (!selectedGuest || isSubmitting) return;

    if (selectedGuest.is_present) {
      setAlertInfo({
        type: 'warning',
        message: `${selectedGuest.name} sudah tercatat hadir sebelumnya.`,
      });
      return;
    }

    setIsSubmitting(true);
    setAlertInfo(null);

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: selectedGuest.id, method: 'Check-In Mandiri' }),
      });
      const data = await res.json();

      if (res.status === 200) {
        setSuccessData(data);
        playSuccessChime();
        fireConfetti();
      } else if (res.status === 409) {
        setAlertInfo({
          type: 'warning',
          message: data.message || 'Tamu ini sudah tercatat check-in sebelumnya.',
        });
      } else {
        setAlertInfo({
          type: 'error',
          message: data.message || 'Terjadi kendala saat check-in. Silakan hubungi panitia.',
        });
      }
    } catch (err) {
      console.error('Checkin error:', err);
      setAlertInfo({
        type: 'error',
        message: 'Koneksi ke server terputus. Silakan coba kembali atau hubungi panitia.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmWalkin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = walkinName.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setAlertInfo(null);

    try {
      const res = await fetch('/api/walkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          category: walkinCategory,
          pax: parseInt(walkinPax, 10) || 1,
          notes: walkinNotes.trim() || 'Check-In Mandiri (Walk-In)',
        }),
      });
      const data = await res.json();

      if (res.status === 200) {
        setSuccessData(data);
        playSuccessChime();
        fireConfetti();
      } else if (res.status === 409) {
        setAlertInfo({
          type: 'warning',
          message: data.message || 'Nama tamu ini sudah pernah didaftarkan check-in.',
        });
      } else {
        setAlertInfo({
          type: 'error',
          message: data.message || 'Gagal mendaftarkan tamu baru.',
        });
      }
    } catch (err) {
      console.error('Walkin error:', err);
      setAlertInfo({
        type: 'error',
        message: 'Koneksi ke server terputus. Silakan coba kembali atau hubungi panitia.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSuccessData(null);
    setSelectedGuest(null);
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setWalkinName('');
    setWalkinNotes('');
    setAlertInfo(null);
  };

  return (
    <div className="self-checkin-wrapper">
      <div className="self-container">
        {/* Header with Display-App Font styling */}
        <header className="self-header">
          <div className="self-badge">Buku Tamu Digital</div>
          <h1 className="self-title-wedding">The Wedding of</h1>
          <div className="self-title-names">
            Wildan <span className="self-title-amp">&amp;</span> Aisyah
          </div>
          <div className="self-divider">
            <span className="self-divider-line"></span>
            <span className="self-divider-diamond"></span>
            <span className="self-divider-line"></span>
          </div>
        </header>

        {/* Main Card */}
        <div className="self-card">
          {successData ? (
            /* Success Screen */
            <div className="self-success-wrapper">
              <div className="self-success-icon-box">
                <span className="material-symbols-outlined" style={{ fontSize: '44px' }}>check_circle</span>
              </div>
              <div className="self-success-heading">Selamat Datang</div>
              <h2 className="self-success-subtitle">Terima Kasih Atas Kehadirannya</h2>
              <div className="self-success-name">
                {successData.guest?.name || 'Tamu Undangan'}
              </div>

              <div className="self-success-info-card">
                <div className="self-success-row">
                  <span className="self-success-row-label">Nomor ID:</span>
                  <span className="self-success-row-val">{successData.guest?.id || '-'}</span>
                </div>
                <div className="self-success-row">
                  <span className="self-success-row-label">Kategori Undangan:</span>
                  <span className="self-success-row-val">{successData.guest?.category || 'Tamu Undangan'}</span>
                </div>
                <div className="self-success-row">
                  <span className="self-success-row-label">Jumlah Kehadiran:</span>
                  <span className="self-success-row-val">{successData.guest?.pax || 1} Orang</span>
                </div>
                <div className="self-success-row">
                  <span className="self-success-row-label">Waktu Check-In:</span>
                  <span className="self-success-row-val">{successData.guest?.checked_in_at || 'Baru saja'}</span>
                </div>
              </div>

              <p className="self-success-message">
                Kehadiran Anda telah tercatat pada buku tamu resepsi kami. Selamat menikmati rangkaian acara dan hidangan yang telah kami sediakan.
              </p>

              <button type="button" className="self-btn-secondary" onClick={handleReset}>
                <span className="material-symbols-outlined">restart_alt</span>
                Check-In Tamu Lainnya
              </button>
            </div>
          ) : (
            /* Form / Search View */
            <>
              {/* Tab Navigation */}
              <div className="self-tab-nav">
                <button
                  type="button"
                  className={`self-tab-btn ${activeTab === 'search' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('search');
                    setAlertInfo(null);
                  }}
                >
                  <span className="material-symbols-outlined">person_search</span>
                  <span>Cari Nama Undangan</span>
                </button>
                <button
                  type="button"
                  className={`self-tab-btn ${activeTab === 'walkin' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('walkin');
                    setAlertInfo(null);
                  }}
                >
                  <span className="material-symbols-outlined">person_add</span>
                  <span>Tamu Baru / Walk-In</span>
                </button>
              </div>

              <div className="self-card-body">
                {/* Alert Notification */}
                {alertInfo && (
                  <div className={`self-alert ${alertInfo.type}`}>
                    <span className="material-symbols-outlined self-alert-icon">
                      {alertInfo.type === 'warning' ? 'warning' : 'error'}
                    </span>
                    <div>{alertInfo.message}</div>
                  </div>
                )}

                {/* Tab 1: Search Registered Guest */}
                {activeTab === 'search' && (
                  <div>
                    <div className="self-group">
                      <label className="self-label" htmlFor="search-input">
                        Ketik Nama Anda pada Daftar Undangan:
                      </label>
                      <div className="self-input-box">
                        <span className="material-symbols-outlined self-input-icon">search</span>
                        <input
                          id="search-input"
                          type="text"
                          className="self-input"
                          placeholder="Contoh: Wildan, Ahmad, Rahmad..."
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          autoComplete="off"
                        />
                        {query && !isSearching && (
                          <button
                            type="button"
                            className="self-input-clear"
                            onClick={() => {
                              setQuery('');
                              setResults([]);
                              setSelectedGuest(null);
                              setAlertInfo(null);
                            }}
                            title="Hapus pencarian"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                          </button>
                        )}
                        {isSearching && (
                          <span className="material-symbols-outlined self-input-spinner">progress_activity</span>
                        )}
                      </div>
                    </div>

                    {/* Search Results List */}
                    {results.length > 0 && (
                      <div className="self-results-container">
                        <div className="self-results-header">
                          Ditemukan {results.length} Nama (Sentuh untuk Memilih):
                        </div>
                        {results.map((guest) => (
                          <div
                            key={guest.id}
                            className={`self-result-card ${selectedGuest?.id === guest.id ? 'selected' : ''}`}
                            onClick={() => handleSelectGuest(guest)}
                          >
                            <div>
                              <div className="self-result-name">{guest.name}</div>
                              <div className="self-result-meta">
                                <span className="self-tag-category">{guest.category}</span>
                                <span className="self-tag-id">ID: {guest.id}</span>
                              </div>
                            </div>
                            <div>
                              {guest.is_present ? (
                                <span className="self-status-pill present">
                                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>check_circle</span>
                                  <span>Sudah Hadir</span>
                                </span>
                              ) : (
                                <span className="self-status-pill ready">
                                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>touch_app</span>
                                  <span>Pilih</span>
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Empty Search Result */}
                    {hasSearched && results.length === 0 && !isSearching && (
                      <div className="self-empty">
                        <p className="self-empty-text">
                          Nama &quot;<strong>{query}</strong>&quot; tidak ditemukan pada daftar undangan.
                        </p>
                        <button
                          type="button"
                          className="self-btn-link inline-flex items-center gap-1"
                          onClick={() => {
                            setActiveTab('walkin');
                            setWalkinName(query);
                            setAlertInfo(null);
                          }}
                        >
                          <span>Daftar Sekarang Sebagai Tamu Baru / Walk-In</span>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
                        </button>
                      </div>
                    )}

                    {/* Confirmation Section when Guest is Selected */}
                    {selectedGuest && !selectedGuest.is_present && (
                      <div className="self-confirm-box">
                        <div className="self-confirm-subtitle">Konfirmasi Kehadiran Tamu</div>
                        <div className="self-confirm-name">{selectedGuest.name}</div>
                        <div className="self-confirm-meta">
                          Kategori: <strong>{selectedGuest.category}</strong> • ID Undangan: <strong>{selectedGuest.id}</strong>
                        </div>
                        <button
                          type="button"
                          className="self-btn-primary"
                          disabled={isSubmitting}
                          onClick={handleConfirmRegistered}
                        >
                          {isSubmitting ? (
                            <>
                              <span className="material-symbols-outlined animate-spin">progress_activity</span>
                              <span>Memproses Kehadiran...</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined">how_to_reg</span>
                              <span>Konfirmasi Kehadiran Saya</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Walk-In / New Guest */}
                {activeTab === 'walkin' && (
                  <form onSubmit={handleConfirmWalkin}>
                    <div className="self-group">
                      <label className="self-label" htmlFor="walkin-name">
                        Nama Lengkap Tamu: <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="walkin-name"
                        type="text"
                        className="self-input"
                        style={{ paddingLeft: '16px' }}
                        placeholder="Masukkan nama lengkap Anda..."
                        value={walkinName}
                        onChange={(e) => setWalkinName(e.target.value)}
                        required
                        autoComplete="name"
                      />
                    </div>

                    <div className="self-group">
                      <label className="self-label" htmlFor="walkin-cat">
                        Kategori / Hubungan:
                      </label>
                      <select
                        id="walkin-cat"
                        className="self-select"
                        value={walkinCategory}
                        onChange={(e) => setWalkinCategory(e.target.value)}
                      >
                        <option value="Tamu Undangan">Tamu Undangan</option>
                        <option value="Keluarga">Keluarga</option>
                        <option value="Teman Wildan">Teman Wildan</option>
                        <option value="Teman Aisyah">Teman Aisyah</option>
                        <option value="Rekan Kerja">Rekan Kerja</option>
                        <option value="Tetangga / Warga">Tetangga / Warga</option>
                        <option value="Tamu Kehormatan">Tamu Kehormatan</option>
                      </select>
                    </div>

                    <div className="self-group">
                      <label className="self-label" htmlFor="walkin-pax">
                        Jumlah Orang yang Hadir:
                      </label>
                      <select
                        id="walkin-pax"
                        className="self-select"
                        value={walkinPax}
                        onChange={(e) => setWalkinPax(e.target.value)}
                      >
                        <option value="1">1 Orang</option>
                        <option value="2">2 Orang</option>
                        <option value="3">3 Orang</option>
                        <option value="4">4 Orang</option>
                        <option value="5">5+ Orang (Rombongan)</option>
                      </select>
                    </div>

                    <div className="self-group">
                      <label className="self-label" htmlFor="walkin-notes">
                        Ucapan / Doa Singkat (Opsional):
                      </label>
                      <input
                        id="walkin-notes"
                        type="text"
                        className="self-input"
                        style={{ paddingLeft: '16px' }}
                        placeholder="Semoga sakinah mawaddah warahmah..."
                        value={walkinNotes}
                        onChange={(e) => setWalkinNotes(e.target.value)}
                      />
                    </div>

                    <button
                      type="submit"
                      className="self-btn-primary"
                      disabled={isSubmitting || !walkinName.trim()}
                    >
                      {isSubmitting ? (
                        <>
                          <span className="material-symbols-outlined animate-spin">progress_activity</span>
                          <span>Menyimpan ke Buku Tamu...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">how_to_reg</span>
                          <span>Simpan &amp; Check-In Kehadiran</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Navigation */}
        <footer className="self-footer">
          <p>The Wedding of Wildan &amp; Aisyah</p>
          <Link href="/" className="self-footer-link inline-flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            <span>Kembali ke Menu Utama</span>
          </Link>
        </footer>
      </div>
    </div>
  );
}
