// Konfigurasi publik (BUKAN tempat secret). Ubah angka di sini untuk menyesuaikan simulasi.
window.CONFIG = {
  markets: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'], // tambah market: harus ada di whitelist api/market.js
  initialBalance: 125,   // virtual USD
  riskPct: 1,            // max risiko per trade (% balance)
  maxDailyLossPct: 5,    // batas rugi harian (% balance awal hari)
  maxOpenPositions: 1,
  minRR: 2,              // minimum risk/reward 1:2
  scanMs: 20000          // interval scan (ms)
};
