import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#2C2417] flex flex-col justify-between selection:bg-[#C5A55A] selection:text-white">
      {/* Decorative top bar */}
      <div className="h-2 bg-gradient-to-r from-[#C5A55A] via-[#E8D5A3] to-[#8B7635]" />

      <main className="max-w-5xl mx-auto w-full px-6 py-12 flex-1 flex flex-col items-center justify-center">
        {/* Wedding Title Header */}
        <div className="text-center mb-12">
          <div className="inline-block px-4 py-1 mb-4 text-xs tracking-widest uppercase font-semibold text-[#8B7635] bg-[#E8D5A3]/40 rounded-full border border-[#C5A55A]/30">
            Resepsi Pernikahan
          </div>
          <div 
            style={{ fontFamily: "'Great Vibes', cursive" }} 
            className="text-4xl md:text-5xl text-[#C5A55A] mb-1 font-normal"
          >
            The Wedding of
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-[#2C2417] mb-3 font-normal tracking-wide">
            Wildan <span className="text-[#C5A55A] italic font-serif">&amp;</span> Aisyah
          </h1>
          <div className="w-24 h-0.5 bg-gradient-to-r from-transparent via-[#C5A55A] to-transparent mx-auto mb-3" />
          <p className="text-sm md:text-base text-[#7A6F5F] font-sans tracking-wide">
            Sistem Buku Tamu &amp; Check-In Undangan Digital
          </p>
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
              <span className="material-symbols-outlined text-base">arrow_forward</span>
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
              <span className="material-symbols-outlined text-base">arrow_forward</span>
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
              <span className="material-symbols-outlined text-base">arrow_forward</span>
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
