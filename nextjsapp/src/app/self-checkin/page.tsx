'use client';

import { useState, useEffect, useRef } from 'react';
import { Guest } from '@/lib/types';
import '@/styles/self-checkin.css';

export default function SelfCheckinPage() {
  const [activeTab, setActiveTab] = useState<'search' | 'walkin'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Guest[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);

  // Walk-in state
  const [walkinName, setWalkinName] = useState('');

  // Status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{ type: 'warning' | 'error'; message: string } | null>(null);
  const [successData, setSuccessData] = useState<any>(null);

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
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
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, activeTab]);

  const handleSelectGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    setAlertInfo(null);
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
        body: JSON.stringify({ query: selectedGuest.id, method: 'Mandiri' }),
      });
      const data = await res.json();

      if (res.status === 200) {
        setSuccessData(data);
      } else if (res.status === 409) {
        setAlertInfo({
          type: 'warning',
          message: data.message || 'Tamu ini sudah melakukan check-in sebelumnya.',
        });
      } else {
        setAlertInfo({
          type: 'error',
          message: data.message || 'Terjadi kesalahan saat check-in.',
        });
      }
    } catch (err) {
      console.error('Checkin error:', err);
      setAlertInfo({
        type: 'error',
        message: 'Koneksi ke server terputus. Silakan hubungi panitia.',
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
        body: JSON.stringify({ name: trimmed, category: 'Tamu Tambahan', pax: 1 }),
      });
      const data = await res.json();

      if (res.status === 200) {
        setSuccessData(data);
      } else if (res.status === 409) {
        setAlertInfo({
          type: 'warning',
          message: data.message || 'Nama tamu ini sudah tercatat check-in sebelumnya.',
        });
      } else {
        setAlertInfo({
          type: 'error',
          message: data.message || 'Gagal mendaftarkan tamu.',
        });
      }
    } catch (err) {
      console.error('Walkin error:', err);
      setAlertInfo({
        type: 'error',
        message: 'Koneksi ke server terputus. Silakan hubungi panitia.',
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
    setAlertInfo(null);
  };

  return (
    <div className="self-checkin-wrapper">
      <div className="self-container">
        {/* Header */}
        <div className="self-header">
          <div className="wedding-badge">Buku Tamu Digital</div>
          <h1 className="wedding-title">The Wedding of</h1>
          <div className="wedding-names">Wildan &amp; Aisyah</div>
          <div className="header-ornament">
            <span className="dot"></span>
            <span className="line"></span>
            <span className="dot"></span>
          </div>
        </div>

        {/* Success Screen */}
        {successData ? (
          <div className="success-card">
            <div className="success-icon-box">
              <span className="material-symbols-outlined success-icon">check_circle</span>
            </div>
            <h2 className="success-heading">Selamat Datang!</h2>
            <p className="success-guest-name">{successData.guest?.name}</p>
            <div className="success-meta-pills">
              <span className="pill-id">ID: {successData.guest?.id}</span>
              <span className="pill-cat">{successData.guest?.category}</span>
            </div>
            <div className="success-message-box">
              <p>Kehadiran Anda telah berhasil dicatat ke sistem resepsi. Silakan menikmati hidangan dan acara.</p>
            </div>
            <button type="button" className="btn-done" onClick={handleReset}>
              <span className="material-symbols-outlined">restart_alt</span>
              Check-In Tamu Lainnya
            </button>
          </div>
        ) : (
          <div className="form-card">
            {/* Tabs */}
            <div className="tab-buttons">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('search');
                  setAlertInfo(null);
                }}
              >
                <span className="material-symbols-outlined">person_search</span>
                Tamu Terdaftar
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'walkin' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('walkin');
                  setAlertInfo(null);
                }}
              >
                <span className="material-symbols-outlined">person_add</span>
                Tamu Baru / Walk-In
              </button>
            </div>

            {/* Alert Message */}
            {alertInfo && (
              <div className={`alert-box ${alertInfo.type}`}>
                <span className="material-symbols-outlined alert-icon">
                  {alertInfo.type === 'warning' ? 'warning' : 'error'}
                </span>
                <span>{alertInfo.message}</span>
              </div>
            )}

            {/* Tab 1: Search Registered Guest */}
            {activeTab === 'search' && (
              <div className="tab-content">
                <div className="input-group">
                  <label htmlFor="self-search-input">Cari Nama Anda pada Daftar Undangan:</label>
                  <div className="search-box">
                    <span className="material-symbols-outlined search-icon">search</span>
                    <input
                      id="self-search-input"
                      type="text"
                      className="text-input"
                      placeholder="Ketik minimal 2 huruf nama Anda..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoComplete="off"
                    />
                    {isSearching && (
                      <span className="material-symbols-outlined search-spinner">progress_activity</span>
                    )}
                  </div>
                </div>

                {/* Search Results */}
                {results.length > 0 && (
                  <div className="results-list">
                    <div className="results-caption">Pilih nama Anda di bawah:</div>
                    {results.map((guest) => (
                      <div
                        key={guest.id}
                        className={`result-item ${selectedGuest?.id === guest.id ? 'selected' : ''}`}
                        onClick={() => handleSelectGuest(guest)}
                      >
                        <div className="result-info">
                          <span className="result-name">{guest.name}</span>
                          <span className="result-sub">
                            {guest.category} • ID: {guest.id}
                          </span>
                        </div>
                        <div className="result-status">
                          {guest.is_present ? (
                            <span className="badge-present">Sudah Hadir</span>
                          ) : (
                            <span className="badge-ready">Pilih</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {hasSearched && results.length === 0 && (
                  <div className="empty-results">
                    <p>Nama tidak ditemukan di daftar undangan.</p>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setActiveTab('walkin');
                        setWalkinName(query);
                      }}
                    >
                      Daftar sebagai Tamu Baru &rarr;
                    </button>
                  </div>
                )}

                {/* Selected Guest Confirmation */}
                {selectedGuest && (
                  <div className="selected-card">
                    <div className="selected-title">Konfirmasi Kehadiran:</div>
                    <div className="selected-name">{selectedGuest.name}</div>
                    <div className="selected-meta">{selectedGuest.category} • ID: {selectedGuest.id}</div>
                    <button
                      type="button"
                      className="btn-submit"
                      disabled={isSubmitting || selectedGuest.is_present}
                      onClick={handleConfirmRegistered}
                    >
                      {isSubmitting ? 'Memproses...' : 'Konfirmasi Saya Hadir'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Walk-In / New Guest */}
            {activeTab === 'walkin' && (
              <form className="tab-content" onSubmit={handleConfirmWalkin}>
                <div className="input-group">
                  <label htmlFor="self-walkin-input">Nama Lengkap Tamu:</label>
                  <input
                    id="self-walkin-input"
                    type="text"
                    className="text-input"
                    placeholder="Masukkan nama lengkap Anda..."
                    value={walkinName}
                    onChange={(e) => setWalkinName(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={isSubmitting || !walkinName.trim()}
                >
                  {isSubmitting ? 'Menyimpan...' : 'Check-In Sebagai Tamu Baru'}
                </button>
              </form>
            )}
          </div>
        )}

        <div className="self-footer">
          <span>Resepsi Pernikahan Wildan &amp; Aisyah</span>
        </div>
      </div>
    </div>
  );
}
