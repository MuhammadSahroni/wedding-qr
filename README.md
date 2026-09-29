# Wedding Guest Check-In System (Next.js + Cloudflare Workers)

Sistem Check-In Tamu Undangan Digital & Display Sambutan Resepsi Pernikahan Wildan & Aisyah.

## 🚀 Fitur Utama

- **`/scanner` (Scanner Panitia):** Scan kamera QR Code kartu undangan tamu instan, pencarian nama manual dengan debounce, pop-up konfirmasi, riwayat check-in, dan feedback audio.
- **`/display` (Layar Proyektor / TV):** Tampilan sambutan selamat datang layar penuh (*full-screen*) dengan partikel emas, font kaligrafi *Great Vibes*, animasi confetti & sparkles, dan suara fanfare saat tamu hadir.
- **`/self-checkin` (Check-In Mandiri):** Halaman tamu untuk scan barcode meja penerima tamu langsung dari smartphone masing-masing.
- **`/api/*` (Backend API):** Endpoint check-in terpadu yang terintegrasi dengan Google Spreadsheet API (`google-spreadsheet`) dan Pusher Channels Realtime.
- **Hosting:** Didesain khusus untuk **Cloudflare Workers (Free Tier)**.

## 💻 Cara Menjalankan Secara Lokal

```bash
cd nextjsapp
npm install
npm run dev
```

Buka di browser:
- Portal Utama: [http://localhost:3000](http://localhost:3000)
- Scanner Panitia: [http://localhost:3000/scanner](http://localhost:3000/scanner)
- Layar Display TV: [http://localhost:3000/display](http://localhost:3000/display)
- Check-In Mandiri: [http://localhost:3000/self-checkin](http://localhost:3000/self-checkin)

## ☁️ Deploy ke Cloudflare Workers

```bash
cd nextjsapp
npm run build:worker
npm run deploy
```
