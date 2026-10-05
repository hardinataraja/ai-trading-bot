// Public market data (tanpa API secret). Coba Binance dulu, lalu Kraken sebagai cadangan.
const J = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

async function binance(s) {
  const b = 'https://data-api.binance.vision/api/v3';
  const [k, t] = await Promise.all([J(`${b}/klines?symbol=${s}&interval=5m&limit=120`), J(`${b}/ticker/24hr?symbol=${s}`)]);
  return { source: 'Binance', symbol: s, price: +t.lastPrice, change: +t.priceChangePercent, high: +t.highPrice, low: +t.lowPrice, volume: +t.volume,
    candles: k.map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })) };
}
async function kraken(s) {
  const p = s.replace('BTC', 'XBT');
  const [o, t] = await Promise.all([J(`https://api.kraken.com/0/public/OHLC?pair=${p}&interval=5`), J(`https://api.kraken.com/0/public/Ticker?pair=${p}`)]);
  if ((o.error && o.error.length) || (t.error && t.error.length)) throw new Error('Kraken error');
  const key = Object.keys(o.result).find(k => k !== 'last'), q = Object.values(t.result)[0];
  const candles = o.result[key].slice(-120).map(x => ({ t: x[0] * 1000, o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[6] }));
  return { source: 'Kraken', symbol: s, price: +q.c[0], change: (+q.c[0] / +q.o - 1) * 100, high: +q.h[1], low: +q.l[1], volume: +q.v[1], candles };
}
module.exports = async (req, res) => {
  const s = String(req.query.symbol || 'BTCUSDT').toUpperCase();
  if (!/^(BTC|ETH|SOL)USDT$/.test(s)) return res.status(400).json({ error: 'Unsupported symbol' }); // whitelist market
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
  for (const fn of [binance, kraken]) { try { return res.status(200).json(await fn(s)); } catch (e) {} }
  res.status(502).json({ error: 'All market providers failed' });
};
