# 🚀 Panduan Lengkap Deploy Mandiri - Wedding QR Check-In System
**Resepsi Pernikahan Wildan & Aisyah**

Aplikasi ini sudah dipersiapkan dengan arsitektur **All-in-One (Unified)**. Server Node.js dapat menyajikan:
- **Halaman Scanner & Self Check-in:** di root URL (`/`)
- **Halaman Layar Sambutan (Display TV/Proyektor):** di URL (`/display`)
- **Backend API & Real-time WebSocket:** di port dan domain yang sama

Pilihlah salah satu metode deploy di bawah ini yang paling sesuai dengan kebutuhan Anda:

---

## DAFTAR ISI
1. [Metode 1: Render.com (Gratis, Paling Mudah & Rekomendasi)](#metode-1-rendercom-gratis-paling-mudah--cepat)
2. [Metode 2: Railway.app (Alternatif Cloud 1-Click)](#metode-2-railwayapp)
3. [Metode 3: VPS Mandiri (Ubuntu/Debian + PM2 + Nginx + SSL)](#metode-3-vps-mandiri-linux--pm2--nginx)
4. [Metode 4: Docker & Docker Compose](#metode-4-docker--docker-compose)
5. [Metode 5: Terpisah (Frontend di Vercel + Backend di Render/Railway)](#metode-5-arsitektur-terpisah-frontend-di-vercel)
6. [Catatan Penting Sebelum Deploy (Reset Data Tamu)](#catatan-penting-sebelum-deploy)

---

## METODE 1: Render.com (Gratis, Paling Mudah & Cepat)
*Render mendukung Node.js, WebSocket, dan HTTPS gratis secara otomatis.*

### Langkah-langkah:
1. Pastikan semua perubahan sudah di-push ke GitHub:
   ```bash
   git add .
   git commit -m "Siap deploy ke cloud"
   git push origin main
   ```
2. Buka [dashboard.render.com](https://dashboard.render.com) dan login (bisa via akun GitHub).
3. Klik tombol **New +** lalu pilih **Web Service**.
4. Hubungkan dengan repositori GitHub Anda: **`wedding-qr`**.
5. Isi konfigurasi berikut:
   - **Name**: `wedding-qr` (atau nama pilihan Anda)
   - **Region**: Singapore (paling dekat dan responsif untuk Indonesia)
   - **Branch**: `main`
   - **Root Directory**: *(kosongkan)*
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm run build:all
     ```
   - **Start Command**:
     ```bash
     npm run start:prod
     ```
   - **Instance Type**: `Free`
6. Klik **Create Web Service**.
7. Tunggu proses build selesai (sekitar 1-2 menit).
8. Selesai! Anda akan mendapatkan URL seperti:
   - **Scanner & Self Check-in Tamu**: `https://wedding-qr.onrender.com/`
   - **Layar TV Sambutan**: `https://wedding-qr.onrender.com/display`
   *(WebSocket otomatis terhubung di domain yang sama tanpa perlu setting env)*

---

## METODE 2: Railway.app
*Alternatif cloud yang sangat cepat dan mendukung WebSocket tanpa batas.*

### Langkah-langkah:
1. Buka [railway.app](https://railway.app) dan login dengan akun GitHub.
2. Klik **New Project** -> **Deploy from GitHub repo**.
3. Pilih repository **`wedding-qr`**.
4. Masuk ke tab **Settings**:
   - **Build Command**: `npm run build:all`
   - **Start Command**: `npm run start:prod`
5. Masuk ke bagian **Networking** -> Klik **Generate Domain** (untuk mendapatkan domain HTTPS publik).
6. URL Anda sudah aktif dan siap digunakan!

---

## METODE 3: VPS Mandiri (Linux Ubuntu/Debian + PM2 + Nginx)
*Metode terbaik jika Anda memiliki VPS sendiri (DigitalOcean, Linode, AWS, Biznet, IDCloudHost, dll).*

### 1. Install Node.js di VPS
```bash
# Update package list
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS & Git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential nginx

# Install PM2 (Process Manager) secara global
sudo npm install -g pm2
```

### 2. Clone Repositori & Build
```bash
cd /var/www
sudo git clone https://github.com/MuhammadSahroni/wedding-qr.git
cd wedding-qr

# Install semua dependensi & build frontend
sudo npm run install:all
sudo npm run build
```

### 3. Jalankan Aplikasi dengan PM2
```bash
pm2 start server/server.js --name "wedding-checkin"
pm2 save
pm2 startup
```

### 4. Konfigurasi Nginx Reverse Proxy & WebSocket
Edit konfigurasi Nginx:
```bash
sudo nano /etc/nginx/sites-available/wedding
```
Tempelkan konfigurasi berikut (ganti `domain-anda.com` dengan domain atau subdomain Anda):
```nginx
server {
    listen 80;
    server_name domain-anda.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Aktifkan dan restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/wedding /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. Pasang SSL Gratis (HTTPS) dengan Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d domain-anda.com
```

---

## METODE 4: Docker & Docker Compose
*Untuk deploy mandiri pada server yang sudah terpasang Docker.*

Di repositori ini sudah disertakan file `Dockerfile` dan `docker-compose.yml`.

### Jalankan dengan satu perintah:
```bash
# Build dan jalankan container di background
docker compose up -d --build

# Cek logs
docker compose logs -f

# Untuk mematikan:
docker compose down
```
Aplikasi langsung berjalan di `http://IP-SERVER:3001`.

---

## METODE 5: Arsitektur Terpisah (Frontend di Vercel)
*Jika Anda ingin Frontend berada di CDN Vercel dan Backend di VPS/Render.*

### A. Deploy Backend (Node.js/WebSocket) terlebih dahulu:
Deploy folder `server/` ke Render atau Railway atau VPS.  
Misal Anda mendapatkan URL backend: `https://backend-wedding.onrender.com`

### B. Deploy Scanner App ke Vercel:
1. Masuk ke [vercel.com](https://vercel.com) -> **Add New Project**.
2. Pilih repository **`wedding-qr`**.
3. Di bagian **Root Directory**, klik **Edit** dan pilih: `scanner-app`.
4. Buka menu **Environment Variables**, tambahkan:
   - `VITE_API_URL` = `https://backend-wedding.onrender.com`
   - `VITE_WS_URL` = `wss://backend-wedding.onrender.com`
5. Klik **Deploy**.

### C. Deploy Display App ke Vercel:
1. Klik **Add New Project** lagi di Vercel.
2. Pilih repository yang sama.
3. Di bagian **Root Directory**, pilih: `display-app`.
4. Tambahkan Environment Variable:
   - `VITE_WS_URL` = `wss://backend-wedding.onrender.com`
5. Klik **Deploy**.

---

## CATATAN PENTING SEBELUM DEPLOY

1. **Pastikan Data Check-in Bersih:**
   - File `server/checkin_state.json` harus berisi `{}`.
   - File `server/walkin_guests.json` harus berisi `[]`.
   *(Kedua file ini sudah direset bersih di repository ini).*

2. **Akses Kamera HP di Browser:**
   - Fitur Scan QR kamera pada smartphone mewajibkan koneksi **HTTPS** (kamera tidak akan bisa dibuka jika hanya HTTP biasa, kecuali `localhost`).
   - Semua layanan cloud di atas (Render, Railway, Vercel, maupun Cloudflare Tunnel) sudah otomatis menyediakan **HTTPS**.

3. **Audio / SFX Ucapan Selamat Datang:**
   - Pada browser modern di layar Display TV/Laptop, klik sembarang layar sekali saat pertama kali dibuka untuk mengaktifkan izin pemutaran audio otomatis (*Browser Autoplay Policy*). Tombol status audio interaktif sudah tersedia di pojok layar display.
