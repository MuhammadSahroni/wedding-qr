import { useState, useEffect, useRef } from 'react';
import { searchGuests, selfCheckin } from './utils/api';
import './SelfCheckin.css';

export default function SelfCheckin() {
  const [activeTab, setActiveTab] = useState('search'); // 'search' | 'walkin'
  
  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null);

  // Walk-in state
  const [walkinName, setWalkinName] = useState('');

  // Processing & Status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertInfo, setAlertInfo] = useState(null); // { type: 'warning'|'error', message }
  const [successData, setSuccessData] = useState(null); // { guest, stats }

  const searchTimerRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (activeTab !== 'search') return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await searchGuests(trimmed);
        setResults(data || []);
        setHasSearched(true);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(searchTimerRef.current);
  }, [query, activeTab]);

  const handleSelectGuest = (guest) => {
    setSelectedGuest(guest);
    setAlertInfo(null);
  };

  const handleConfirmRegistered = async () => {
    if (!selectedGuest || isSubmitting) return;

    if (selectedGuest.is_present) {
      setAlertInfo({
        type: 'warning',
        message: `${selectedGuest.name} sudah tercatat check-in sebelumnya.`
      });
      return;
    }

    setIsSubmitting(true);
    setAlertInfo(null);

    try {
      const res = await selfCheckin({ id: selectedGuest.id });
      if (res.status === 200) {
        setSuccessData(res.data);
      } else if (res.status === 409) {
        setAlertInfo({
          type: 'warning',
          message: res.data.message || 'Tamu ini sudah melakukan check-in sebelumnya.'
        });
      } else {
        setAlertInfo({
          type: 'error',
          message: res.data.message || 'Terjadi kesalahan saat check-in. Silakan coba lagi.'
        });
      }
    } catch (err) {
      console.error('Checkin error:', err);
      setAlertInfo({
        type: 'error',
        message: 'Koneksi ke server terputus. Mohon hubungi panitia penerima tamu.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmWalkin = async (e) => {
    e.preventDefault();
    const name = walkinName.trim();
    if (!name || isSubmitting) return;

    setIsSubmitting(true);
    setAlertInfo(null);

    try {
      const res = await selfCheckin({ name, is_walkin: true });
      if (res.status === 200) {
        setSuccessData(res.data);
      } else if (res.status === 409) {
        setAlertInfo({
          type: 'warning',
          message: res.data.message || 'Nama tamu ini sudah tercatat check-in sebelumnya.'
        });
      } else {
        setAlertInfo({
          type: 'error',
          message: res.data.message || 'Gagal mendaftarkan tamu baru. Silakan coba lagi.'
        });
      }
    } catch (err) {
      console.error('Walkin error:', err);
      setAlertInfo({
        type: 'error',
        message: 'Koneksi ke server terputus. Mohon hubungi panitia penerima tamu.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setSuccessData(null);
    setQuery('');
    setResults([]);
    setSelectedGuest(null);
    setHasSearched(false);
    setWalkinName('');
    setAlertInfo(null);
    setActiveTab('search');
  };

  return (
    <div className="self-checkin-wrapper">
      <div className="self-checkin-card">
        {/* Header Branding */}
        <header className="self-header">
          <div className="self-emblem">
            <span className="material-symbols-outlined">favorite</span>
          </div>
          <h1>Wildan &amp; Aisyah</h1>
          <p>Buku Tamu Mandiri</p>
          <div className="self-venue-badge">
            Selamat Datang di Resepsi Pernikahan
          </div>
        </header>

        {/* If Check-in Success */}
        {successData ? (
          <div className="self-body self-success-card">
            <div className="self-success-icon">
              <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>check_circle</span>
            </div>
            <h2 className="self-success-title">Check-In Berhasil!</h2>
            <div className="self-success-badge">
              {successData.guest?.is_walkin ? 'Tamu Tambahan (Walk-in)' : 'Tamu Undangan Resmi'}
            </div>

            <div className="self-success-details">
              <div className="self-detail-row">
                <span className="self-detail-label">Nama Tamu</span>
                <span className="self-detail-val">{successData.guest?.name}</span>
              </div>
              <div className="self-detail-row">
                <span className="self-detail-label">ID Tamu</span>
                <span className="self-detail-val">{successData.guest?.id}</span>
              </div>
              {successData.guest?.category && (
                <div className="self-detail-row">
                  <span className="self-detail-label">Kategori</span>
                  <span className="self-detail-val">{successData.guest?.category}</span>
                </div>
              )}
              <div className="self-detail-row">
                <span className="self-detail-label">Waktu Hadir</span>
                <span className="self-detail-val">
                  {successData.guest?.checked_in_at
                    ? new Date(successData.guest.checked_in_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      }) + ' WIB'
                    : 'Baru saja'}
                </span>
              </div>
              <div className="self-detail-row">
                <span className="self-detail-label">Metode Input</span>
                <span className="self-detail-val">Mandiri</span>
              </div>
            </div>

            <p className="self-success-message">
              "Terima kasih atas kehadiran, doa, serta restu Bapak/Ibu/Saudara/i untuk kedua mempelai. Selamat menikmati jamuan yang telah disediakan."
            </p>

            <button type="button" className="self-btn-secondary" onClick={handleResetForm}>
              <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', fontSize: '18px', marginRight: '6px' }}>
                person_add
              </span>
              Check-In untuk Tamu Lain
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="self-tabs">
              <button
                type="button"
                className={`self-tab-btn ${activeTab === 'search' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('search');
                  setAlertInfo(null);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>search</span>
                Cari Undangan
              </button>
              <button
                type="button"
                className={`self-tab-btn ${activeTab === 'walkin' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('walkin');
                  setAlertInfo(null);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person_add</span>
                Tamu Baru (Walk-in)
              </button>
            </div>

            <div className="self-body">
              {/* Alert Notification */}
              {alertInfo && (
                <div className={`self-alert self-alert-${alertInfo.type}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    {alertInfo.type === 'warning' ? 'warning' : 'error'}
                  </span>
                  <span>{alertInfo.message}</span>
                </div>
              )}

              {/* TAB 1: Search & Autocomplete */}
              {activeTab === 'search' && (
                <div>
                  <div className="self-form-group">
                    <label className="self-form-label" htmlFor="guest-search-input">
                      Ketik Nama Anda:
                    </label>
                    <div className="self-input-wrapper">
                      <span className="material-symbols-outlined self-input-icon">search</span>
                      <input
                        id="guest-search-input"
                        type="text"
                        className="self-input"
                        placeholder="Contoh: Firsan, Wahyu, Ayu..."
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setSelectedGuest(null);
                        }}
                        autoComplete="off"
                        autoFocus
                      />
                      {query && (
                        <button
                          type="button"
                          className="self-input-clear"
                          onClick={() => {
                            setQuery('');
                            setResults([]);
                            setSelectedGuest(null);
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <p className="self-hint">
                      Ketik minimal 2 huruf nama Anda untuk melihat rekomendasi dari daftar undangan resmi.
                    </p>
                  </div>

                  {/* Loading indicator */}
                  {isSearching && (
                    <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#8B7635', margin: '10px 0' }}>
                      Mencari nama tamu...
                    </p>
                  )}

                  {/* Results list */}
                  {!selectedGuest && results.length > 0 && (
                    <div className="self-results-box">
                      {results.map((g) => (
                        <div
                          key={g.id}
                          className="self-result-item"
                          onClick={() => handleSelectGuest(g)}
                        >
                          <div className="self-result-info">
                            <h4>{g.name}</h4>
                            <div className="self-result-sub">
                              <span className="self-badge-id">{g.id}</span>
                              {g.category && <span className="self-badge-cat">{g.category}</span>}
                            </div>
                          </div>
                          {g.is_present ? (
                            <span className="self-badge-present">Sudah Hadir</span>
                          ) : (
                            <span className="material-symbols-outlined" style={{ color: '#C5A55A' }}>
                              chevron_right
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state when searching but no results */}
                  {!isSearching && hasSearched && results.length === 0 && (
                    <div className="self-empty-search">
                      <p>Nama <strong>"{query}"</strong> tidak ditemukan dalam daftar undangan resmi.</p>
                      <button
                        type="button"
                        className="self-btn-link"
                        onClick={() => {
                          setWalkinName(query);
                          setActiveTab('walkin');
                        }}
                      >
                        👉 Masuk sebagai Tamu Baru (Walk-in)
                      </button>
                    </div>
                  )}

                  {/* Selected Guest Confirmation */}
                  {selectedGuest && (
                    <div className="self-confirm-card">
                      <div className="self-confirm-header">
                        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>verified</span>
                        <span>Konfirmasi Data Anda</span>
                      </div>
                      <div className="self-confirm-guest-name">{selectedGuest.name}</div>
                      <div className="self-confirm-guest-details">
                        <span>ID: <strong>{selectedGuest.id}</strong></span>
                        {selectedGuest.category && <span>Kategori: <strong>{selectedGuest.category}</strong></span>}
                      </div>

                      {selectedGuest.is_present ? (
                        <div className="self-alert self-alert-warning" style={{ marginBottom: 0 }}>
                          <span className="material-symbols-outlined">info</span>
                          <span>Tamu ini sudah tercatat check-in sebelumnya.</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="self-btn-primary"
                          onClick={handleConfirmRegistered}
                          disabled={isSubmitting}
                        >
                          <span className="material-symbols-outlined">check_circle</span>
                          {isSubmitting ? 'Memproses...' : 'Konfirmasi Kehadiran Saya'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Walk-in / Tamu Baru */}
              {activeTab === 'walkin' && (
                <form onSubmit={handleConfirmWalkin}>
                  <div className="self-form-group">
                    <label className="self-form-label" htmlFor="walkin-name-input">
                      Nama Lengkap Tamu:
                    </label>
                    <div className="self-input-wrapper">
                      <span className="material-symbols-outlined self-input-icon">person</span>
                      <input
                        id="walkin-name-input"
                        type="text"
                        className="self-input"
                        placeholder="Masukkan nama lengkap Anda..."
                        value={walkinName}
                        onChange={(e) => setWalkinName(e.target.value)}
                        autoComplete="off"
                        required
                        autoFocus
                      />
                    </div>
                    <p className="self-hint">
                      Fitur ini untuk tamu tambahan yang belum terdaftar pada daftar 505 undangan resmi.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="self-btn-primary"
                    disabled={!walkinName.trim() || isSubmitting}
                    style={{ marginTop: '12px' }}
                  >
                    <span className="material-symbols-outlined">how_to_reg</span>
                    {isSubmitting ? 'Menyimpan...' : 'Simpan & Konfirmasi Hadir'}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
