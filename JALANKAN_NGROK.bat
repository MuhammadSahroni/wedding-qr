@echo off
title Ngrok Tunnel - Scanner Wildan & Aisyah
color 0a

echo ========================================================
echo   NGROK TUNNEL: compare-resistant-runny.ngrok-free.dev
echo ========================================================
echo.
echo Menghubungkan Scanner (port 5173) ke domain ngrok Anda...
echo Buka di HP: https://compare-resistant-runny.ngrok-free.dev
echo.

cd /d "%~dp0"
npx ngrok http --domain=compare-resistant-runny.ngrok-free.dev 5173

pause
