# AI TRADING BOT (Paper Trading / Simulation)

Web app HTML + CSS + JS vanilla, backend Vercel Serverless Functions. **Tidak ada uang asli & tidak ada order sungguhan.** Tidak ada jaminan profit.

## 1. Jalankan lokal
`npm i -g vercel` lalu `vercel dev` di folder project (buka http://localhost:3000). Jika dibuka langsung via file, API offline dan app memakai data **SIMULATED**.

## 2. Deploy ke GitHub
Buat repo baru, upload semua file (index.html, style.css, app.js, config.js, folder api, assets, README.md), commit.

## 3. Deploy ke Vercel
vercel.com → Add New → Project → Import repo → Deploy (tanpa build command, tanpa framework).

## 4. Environment variables (opsional)
- `AI_API_KEY` – API key Anthropic (hanya di Vercel → Settings → Environment Variables)
- `AI_MODEL` – opsional, default `claude-sonnet-5-5`

## 5. Mengaktifkan AI
Isi `AI_API_KEY`, lalu Redeploy. Badge berubah dari `AI MODE: LOCAL STRATEGY` ke `AI + TECHNICAL ANALYSIS`. AI hanya boleh **menyetujui atau memveto (HOLD)** sinyal rule-based; SL/TP tetap dihitung engine lokal dan wajib lolos risk management. Tanpa key, app tetap jalan.

## 6. Mengganti market
Edit `markets` di `config.js` dan whitelist regex di `api/market.js` (pair USDT yang ada di Binance/Kraken).

## 7. Cara kerja paper trading
Tiap 20 detik: ambil data → hitung EMA9/21, RSI14, MACD, volume, momentum, ATR → sinyal BUY/SELL/HOLD → (AI review) → risk check → eksekusi virtual. Position size = (balance × 1%) ÷ jarak SL, tanpa leverage. Min R:R 1:2, max 1 posisi, batas rugi harian 5%, satu entry per candle. Posisi ditutup saat harga menyentuh SL/TP (SL diprioritaskan). Fee & slippage tidak disimulasikan. Semua angka dihitung dari trade history di localStorage.
START = scan + entry baru; PAUSE/STOP = tidak ada entry baru, posisi terbuka tetap dimonitor.

## 8. Reset
Tombol **RESET SIMULATION** → balance $125, riwayat & log dihapus.

## 9. Keamanan
Secret hanya di env Vercel dan dipakai di `/api/*`. Frontend tidak pernah memegang key.

## 10. Real trading
**Belum aktif.** `realTradeExecutor()` selalu error dan `/api/trade` menolak (403). Jangan menambahkan real trading tanpa audit keamanan dan pemahaman risiko.
