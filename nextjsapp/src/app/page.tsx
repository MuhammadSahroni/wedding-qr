'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Stats } from '@/lib/types';

export default function HomePage() {
  const [stats, setStats] = useState<Stats>({ total: 0, present: 0, absent: 0, percentage: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#2C2417] flex flex-col justify-between selection:bg-[#C5A55A] selection:text-white">
      {/* Decorative top bar */}
      <div className="h-2 bg-gradient-to-r from-[#C5A55A] via-[#E8D5A3] to-[#8B7635]" />

      <main className="max-w-5xl mx-auto w-full px-6 py-12 flex-1 flex flex-col items-center justify-center">
        {/* Wedding Title Header */}
        <div className="text-center mb-10">
          <div className="inline-block px-4 py-1 mb-3 text-xs tracking-widest uppercase font-semibold text-[#8B7635] bg-[#E8D5A3]/40 rounded-full border border-[#C5A55A]/30">
            Resepsi Pernikahan
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-[#2C2417] mb-2 font-normal">
            Wildan <span className="text-[#C5A55A] italic font-serif">&amp;</span> Aisyah
          </h1>
          <p className="text-sm md:text-base text-[#7A6F5F] font-sans tracking-wide">
            Sistem Check-In Tamu Resepsi • Cloudflare Workers &amp; Google Spreadsheet Monorepo
          </p>
        </div>

        {/* Live Stats Counter Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-10">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8DFD0] text-center">
            <span className="text-xs uppercase tracking-wider text-[#7A6F5F] font-semibold block mb-1">
              Total Tamu
            </span>
            <span className="text-3xl font-bold text-[#2C2417]">
              {loading ? '...' : stats.total}
            </span>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#C5A55A]/40 text-center">
            <span className="text-xs uppercase tracking-wider text-[#4CAF50] font-semibold block mb-1">
              Tamu Hadir
            </span>
            <span className="text-3xl font-bold text-[#4CAF50]">
              {loading ? '...' : stats.present}
            </span>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8DFD0] text-center">
            <span className="text-xs uppercase tracking-wider text-[#7A6F5F] font-semibold block mb-1">
              Belum Hadir
            </span>
            <span className="text-3xl font-bold text-[#7A6F5F]">
              {loading ? '...' : stats.absent}
            </span>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#C5A55A]/40 text-center">
            <span className="text-xs uppercase tracking-wider text-[#8B7635] font-semibold block mb-1">
              Persentase
            </span>
            <span className="text-3xl font-bold text-[#C5A55A]">
              {loading ? '...' : `${stats.percentage}%`}
            </span>
          </div>
        </div>

        {/* Main Navigation Modules */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* Card 1: Scanner */}
          <Link
            href="/scanner"
            className="group relative bg-white rounded-2xl p-6 shadow-sm border border-[#E8DFD0] hover:border-[#C5A55A] hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-[#FAF8F5] border border-[#E8DFD0] flex items-center justify-center text-[#C5A55A] mb-4 group-hover:scale-105 group-hover:bg-[#C5A55A] group-hover:text-white transition-all">
                <span className="material-symbols-outlined text-2xl">qr_code_scanner</span>
              </div>
              <h2 className="text-xl font-bold text-[#2C2417] mb-2 group-hover:text-[#8B7635] transition-colors">
                Scanner Panitia
              </h2>
              <p className="text-sm text-[#7A6F5F] leading-relaxed">
                Aplikasi scan kamera QR code untuk panitia di pintu masuk resepsi, dilengkapi pencarian manual dan sound feedback.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-sm font-semibold text-[#C5A55A] group-hover:translate-x-1 transition-transform">
              <span>Buka Scanner</span>
              <span>&rarr;</span>
            </div>
          </Link>

          {/* Card 2: Display */}
          <Link
            href="/display"
            className="group relative bg-white rounded-2xl p-6 shadow-sm border border-[#E8DFD0] hover:border-[#C5A55A] hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-[#FAF8F5] border border-[#E8DFD0] flex items-center justify-center text-[#C5A55A] mb-4 group-hover:scale-105 group-hover:bg-[#C5A55A] group-hover:text-white transition-all">
                <span className="material-symbols-outlined text-2xl">tv</span>
              </div>
              <h2 className="text-xl font-bold text-[#2C2417] mb-2 group-hover:text-[#8B7635] transition-colors">
                Layar TV / Display
              </h2>
              <p className="text-sm text-[#7A6F5F] leading-relaxed">
                Tampilan selamat datang layar penuh proyektor/TV panggung dengan animasi kartu nama, confetti, dan suara fanfare seketika.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-sm font-semibold text-[#C5A55A] group-hover:translate-x-1 transition-transform">
              <span>Buka Display Layar</span>
              <span>&rarr;</span>
            </div>
          </Link>

          {/* Card 3: Self-Checkin */}
          <Link
            href="/self-checkin"
            className="group relative bg-white rounded-2xl p-6 shadow-sm border border-[#E8DFD0] hover:border-[#C5A55A] hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-[#FAF8F5] border border-[#E8DFD0] flex items-center justify-center text-[#C5A55A] mb-4 group-hover:scale-105 group-hover:bg-[#C5A55A] group-hover:text-white transition-all">
                <span className="material-symbols-outlined text-2xl">phone_iphone</span>
              </div>
              <h2 className="text-xl font-bold text-[#2C2417] mb-2 group-hover:text-[#8B7635] transition-colors">
                Check-In Mandiri
              </h2>
              <p className="text-sm text-[#7A6F5F] leading-relaxed">
                Halaman check-in smartphone untuk tamu yang melakukan scan mandiri dari barcode meja penerima tamu.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-sm font-semibold text-[#C5A55A] group-hover:translate-x-1 transition-transform">
              <span>Buka Halaman Mandiri</span>
              <span>&rarr;</span>
            </div>
          </Link>
        </div>

        {/* Integration Status Footer Info */}
        <div className="mt-12 bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-[#E8DFD0] w-full flex flex-wrap items-center justify-between gap-4 text-xs text-[#7A6F5F]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Google Spreadsheet API
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
              Pusher Realtime Channels
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Cloudflare Workers Ready
            </span>
          </div>
          <span className="text-[#A89880]">v1.0.0 Monorepo Unified</span>
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="py-6 text-center text-xs text-[#A89880] border-t border-[#E8DFD0]">
        The Wedding of Wildan &amp; Aisyah • Sistem Penerimaan Tamu Digital
      </footer>
    </div>
  );
}
