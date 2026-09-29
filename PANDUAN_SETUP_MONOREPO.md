# Panduan Sistem Check-In Resepsi Pernikahan (Monorepo Next.js + Cloudflare Workers)

Proyek ini telah berhasil disatukan ke dalam arsitektur **Single Unified Monorepo** di dalam folder `nextjsapp`.

---

## 🌟 Daftar Halaman & Rute Aplikasi

| Rute | Fungsi | Keterangan |
| :--- | :--- | :--- |
| **`/`** | **Portal Beranda** | Dashboard ringkasan kehadiran live + navigasi cepat ke semua modul |
| **`/scanner`** | **Scanner Panitia** | Buka kamera HP/Laptop scan QR undangan, pencarian manual, pop up konfirmasi |
| **`/display`** | **Layar TV / Display** | Layar sambutan selamat datang untuk proyektor/TV panggung (Confetti, sound fanfare) |
| **`/self-checkin`**| **Check-In Mandiri** | Buku tamu digital mandiri via scan QR Meja Penerima Tamu |
| **`/api/checkin`** | **API Check-In** | Endpoint validasi kehadiran + update Google Sheets + trigger Pusher |
| **`/api/stats`** | **API Statistik** | Mengambil data total hadir, belum hadir, persentase kehadiran |
| **`/api/search`** | **API Pencarian** | Pencarian tamu berdasarkan nama atau ID tamu |
| **`/api/walkin`** | **API Tamu Baru** | Registrasi tamu walk-in / tamu tambahan |
| **`/api/undo`** | **API Batal Check-In** | Membatalkan status hadir tamu bila salah scan |

---

## 🚀 Cara Menjalankan Secara Lokal

Cukup jalankan satu perintah dari root folder:
```bash
npm run next:dev
```
Aplikasi akan aktif di **`http://localhost:3000`**.

---

## ⚙️ Konfigurasi Kredensial (.env.local)

Buka file `nextjsapp/.env.local` lalu isi nilai berikut:

```env
# Google Spreadsheet API
GOOGLE_SERVICE_ACCOUNT_EMAIL="bot-name@project-id.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SPREADSHEET_ID="1a2b3c4d5e..."
GOOGLE_SHEET_NAME="Daftar Hadir"

# Pusher Channels (Free Tier)
PUSHER_APP_ID="1234567"
PUSHER_KEY="abcdef123456"
PUSHER_SECRET="secret789"
PUSHER_CLUSTER="ap1"

# Public variables untuk client-side
NEXT_PUBLIC_PUSHER_KEY="abcdef123456"
NEXT_PUBLIC_PUSHER_CLUSTER="ap1"
```

> **Catatan:** Jika Anda belum mengisi `.env.local`, aplikasi tetap dapat berjalan secara normal menggunakan database lokal `src/data/guests.json` dan smart background polling agar Anda bisa langsung mencoba tampilannya terlebih dahulu!

---

## ☁️ Deploy ke Cloudflare Workers (Free Tier)

Aplikasi telah dilengkapi dengan konfigurasi `wrangler.jsonc` dengan flag Node.js compatibility (`compatibility_flags = ["nodejs_compat"]`).

Untuk mendeploy ke Cloudflare Workers:
```bash
cd nextjsapp
npx @opennextjs/cloudflare build
npx wrangler deploy
```
Atau deploy otomatis melalui Cloudflare Dashboard dengan menghubungkan repositori GitHub Anda.
