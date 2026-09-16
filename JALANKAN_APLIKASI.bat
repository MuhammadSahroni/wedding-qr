@echo off
title Sistem Check-In Tamu QR - Wildan & Aisyah
color 0b

echo ========================================================
echo   SISTEM CHECK-IN TAMU QR CODE - WILDAN & AISYAH
echo ========================================================
echo.
echo Link Scanner di HP: Periksa link Cloudflare (.trycloudflare.com) di bawah ini
echo.
echo [1/3] Menyiapkan server dan aplikasi...
echo.

cd /d "%~dp0"

echo [2/3] Membuka browser lokal...
start http://localhost:5173
start http://localhost:5174

echo [3/3] Menjalankan Server, Scanner App, Display App, dan Cloudflare Tunnel...
echo.
npm run all

pause

