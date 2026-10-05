// AI TRADING BOT - PAPER TRADING ONLY. Semua angka berasal dari simulasi (localStorage).
const C = window.CONFIG, $ = id => document.getElementById(id), KEY = 'atb_v1';
const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = n => '$' + fmt(n), sgn = n => (n >= 0 ? '+$' : '-$') + fmt(Math.abs(n));
const px = n => fmt(n, n < 10 ? 4 : 2), cls = n => (n >= 0 ? 'pos' : 'neg');
const fresh = () => ({ balance: C.initialBalance, position: null, history: [], logs: [], running: false, paused: false, auto: true, market: C.markets[0], lastEntryCandle: 0 });
function load() { try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY))); } catch (e) { return fresh(); } }
let S = load(), M = null, ind = null, sig = null, aiMode = 'LOCAL STRATEGY', api = '', busy = false, riskMsg = '';
let chart, candleSeries, lines = [];
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function log(m) { S.logs.unshift({ t: Date.now(), m }); S.logs = S.logs.slice(0, 80); save(); renderLog(); }
const hms = t => new Date(t).toTimeString().slice(0, 8);

// ---------- Market data (with SIMULATED fallback) ----------
const BASE = { 'BTC/USDT': 112500, 'ETH/USDT': 4100, 'SOL/USDT': 200 }, simC = {};
function simData(m) {
  let cs = simC[m];
  if (!cs) { let p = BASE[m] || 100; const t0 = Math.floor(Date.now() / 3e5) * 3e5 - 120 * 3e5; cs = [];
    for (let i = 0; i < 120; i++) { const o = p; p *= 1 + (Math.random() - .5) * .004; cs.push({ t: t0 + i * 3e5, o, h: Math.max(o, p) * 1.001, l: Math.min(o, p) * .999, c: p, v: 50 + Math.random() * 50 }); }
    simC[m] = cs; }
  const l = cs[cs.length - 1], p = l.c * (1 + (Math.random() - .5) * .003);
  cs.push({ t: l.t + 3e5, o: l.c, h: Math.max(l.c, p), l: Math.min(l.c, p), c: p, v: 50 + Math.random() * 50 }); if (cs.length > 150) cs.shift();
  const hi = Math.max(...cs.map(x => x.h)), lo = Math.min(...cs.map(x => x.l));
  return { source: 'SIMULATED', price: p, change: (p / cs[0].o - 1) * 100, high: hi, low: lo, volume: cs.reduce((s, x) => s + x.v, 0), candles: cs, sim: true };
}
async function loadMarket() {
  try { const r = await fetch('/api/market?symbol=' + S.market.replace('/', '')); if (!r.ok) throw 0; M = await r.json(); M.sim = false; api = 'API ONLINE · ' + M.source; }
  catch (e) { M = simData(S.market); api = 'API OFFLINE'; }
  ind = calc(M.candles);
}

// ---------- Technical analysis ----------
function ema(a, p) { const k = 2 / (p + 1); let e = a[0]; return a.map((v, i) => (i ? (e = v * k + e * (1 - k)) : e)); }
function rsi(c, p = 14) {
  let g = 0, l = 0; for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; d > 0 ? g += d : l -= d; } g /= p; l /= p;
  for (let i = p + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function atr(cs, p = 14) { let a = 0; for (let i = cs.length - p; i < cs.length; i++) { const x = cs[i], pc = cs[i - 1].c; a += Math.max(x.h - x.l, Math.abs(x.h - pc), Math.abs(x.l - pc)); } return a / p; }
function calc(cs) {
  const c = cs.map(x => x.c), n = c.length - 1, e9 = ema(c, 9), e21 = ema(c, 21), e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = e12.map((v, i) => v - e26[i]), sg = ema(macd, 9), avgV = cs.slice(-21, -1).reduce((s, x) => s + x.v, 0) / 20;
  return { price: c[n], ema9: e9[n], ema21: e21[n], crossUp: e9[n - 1] <= e21[n - 1] && e9[n] > e21[n], crossDn: e9[n - 1] >= e21[n - 1] && e9[n] < e21[n],
    rsi: rsi(c), macd: macd[n], macdSignal: sg[n], hist: macd[n] - sg[n], volRatio: avgV ? cs[n - 1].v / avgV : 1, mom: (c[n] / c[n - 10] - 1) * 100, atr: atr(cs), candleTime: cs[n].t };
}

// ---------- Strategy (local rule-based signal engine) ----------
function strategy(i) {
  const up = i.ema9 > i.ema21, dn = i.ema9 < i.ema21, vol = i.volRatio >= .8;
  const b = [up, i.hist > 0, i.rsi > 45 && i.rsi < 70, vol, i.mom > 0].filter(Boolean).length;
  const s = [dn, i.hist < 0, i.rsi < 55 && i.rsi > 30, vol, i.mom < 0].filter(Boolean).length;
  let signal = 'HOLD', reason = 'Mixed or unclear conditions (EMA, MACD, RSI, volume, momentum not aligned).', conf = 30 + Math.max(b, s) * 6;
  if (b >= 4 && up && i.hist > 0) { signal = 'BUY'; conf = 50 + b * 8; reason = `Bullish: EMA9>EMA21${i.crossUp ? ' (fresh cross)' : ''}, MACD hist positive, RSI ${i.rsi.toFixed(0)}, momentum ${i.mom.toFixed(2)}%.`; }
  else if (s >= 4 && dn && i.hist < 0) { signal = 'SELL'; conf = 50 + s * 8; reason = `Bearish: EMA9<EMA21${i.crossDn ? ' (fresh cross)' : ''}, MACD hist negative, RSI ${i.rsi.toFixed(0)}, momentum ${i.mom.toFixed(2)}%.`; }
  const d = i.atr * 1.5, p = i.price, short = signal === 'SELL';
  return { signal, confidence: Math.min(95, Math.round(conf)), reason, entryPrice: p, stopLoss: short ? p + d : p - d, takeProfit: short ? p - d * 2.2 : p + d * 2.2, riskReward: 2.2 };
}
// AI hanya boleh MENYETUJUI atau MEMVETO (HOLD) sinyal lokal; level SL/TP tetap dari engine lokal.
async function aiReview(local) {
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: S.market, indicators: ind, proposal: local }) });
    const j = await r.json();
    if (r.ok && j.mode === 'AI') { aiMode = 'AI + TECHNICAL ANALYSIS'; return { ...local, signal: j.signal, confidence: j.confidence, reason: j.reason }; }
  } catch (e) {}
  aiMode = 'LOCAL STRATEGY'; return local;
}

// ---------- Risk management ----------
const todayPnl = () => S.history.filter(h => new Date(h.closedAt).toDateString() === new Date().toDateString()).reduce((s, h) => s + h.pnl, 0);
function riskCheck(s) {
  if (s.signal === 'HOLD') return 'Signal HOLD - no entry';
  if (S.position) return 'Max open positions reached (' + C.maxOpenPositions + ')';
  const dist = Math.abs(s.entryPrice - s.stopLoss); if (!(dist > 0)) return 'Invalid stop loss distance';
  const rr = Math.abs(s.takeProfit - s.entryPrice) / dist; if (rr < C.minRR) return `R:R ${rr.toFixed(2)} below minimum ${C.minRR}`;
  if (todayPnl() <= -(S.balance - todayPnl()) * C.maxDailyLossPct / 100) return 'Daily loss limit reached';
  if (S.balance < 1) return 'Balance too low';
  if (S.lastEntryCandle === s.candle) return 'Already traded this candle';
  return null;
}

// ---------- Execution (REAL TRADING DISABLED / PAPER TRADING ONLY) ----------
function paperTradeExecutor(s) {
  const dist = Math.abs(s.entryPrice - s.stopLoss);
  let qty = (S.balance * C.riskPct / 100) / dist;      // position size = risk amount / SL distance
  qty = Math.min(qty, S.balance * .95 / s.entryPrice); // tanpa leverage: nilai posisi <= balance
  S.position = { market: S.market, side: s.signal, entry: s.entryPrice, sl: s.stopLoss, tp: s.takeProfit, qty, risk: qty * dist, openedAt: Date.now() };
  S.lastEntryCandle = s.candle; save();
  log(`<i>PAPER ${s.signal} EXECUTED</i> ${S.market} @ ${px(s.entryPrice)} qty ${qty.toPrecision(4)} risk ${usd(qty * dist)}`);
}
function realTradeExecutor() { // REAL TRADING DISABLED
  // PAPER TRADING ONLY
  throw new Error('Real trading is disabled in this version.');
}
function executeTrade(s) { return paperTradeExecutor(s); } // ganti ke realTradeExecutor nanti (tidak sekarang)

function pnlOf(p, price) { return (p.side === 'BUY' ? price - p.entry : p.entry - price) * p.qty; }
function monitor() {
  const p = S.position; if (!p || !M) return;
  const price = M.price, long = p.side === 'BUY';
  const hitSl = long ? price <= p.sl : price >= p.sl, hitTp = long ? price >= p.tp : price <= p.tp;
  if (!hitSl && !hitTp) return log('POSITION MONITORING ' + p.market + ' ' + sgn(pnlOf(p, price)));
  const exit = hitSl ? p.sl : p.tp, pnl = pnlOf(p, exit); // SL diprioritaskan (konservatif)
  S.balance += pnl;
  S.history.unshift({ market: p.market, side: p.side, entry: p.entry, exit, pnl, result: pnl >= 0 ? 'WIN' : 'LOSS', openedAt: p.openedAt, closedAt: Date.now() });
  S.position = null; save(); log(`<i>CLOSE POSITION ${pnl >= 0 ? 'PROFIT' : 'LOSS'}</i> ${sgn(pnl)}`);
}

// ---------- Bot loop ----------
async function scan() {
  if (busy) return; busy = true;
  try {
    log('MARKET SCAN ' + S.market);
    await loadMarket();
    monitor();
    sig = strategy(ind); sig.candle = ind.candleTime; riskMsg = '';
    if (sig.signal !== 'HOLD' && S.running && !S.paused && S.auto && !S.position) {
      log(`${S.market} ${sig.signal} candidate`);
      sig = await aiReview(sig); sig.candle = ind.candleTime;
      log(`AI ANALYSIS ${sig.signal} CONFIDENCE ${sig.confidence}%`);
      const why = riskCheck(sig); riskMsg = why ? 'Risk check: ' + why : 'Risk check passed';
      if (why) log('RISK CHECK FAILED: ' + why); else { log('RISK CHECK PASSED'); executeTrade(sig); }
    }
  } catch (e) { log('ERROR ' + e.message); }
  busy = false; render();
}
let timer = setInterval(scan, C.scanMs);

// ---------- Render ----------
function stats() {
  const h = S.history, w = h.filter(x => x.pnl > 0), l = h.filter(x => x.pnl <= 0), gw = w.reduce((s, x) => s + x.pnl, 0), gl = -l.reduce((s, x) => s + x.pnl, 0);
  const unreal = S.position && M && M.symbol !== undefined || S.position && M ? pnlOf(S.position, M.price) : 0;
  return { n: h.length, w: w.length, l: l.length, wr: h.length ? w.length / h.length * 100 : 0, pf: gl > 0 ? (gw / gl).toFixed(2) : gw > 0 ? '∞' : '-', eq: S.balance + unreal, pl: S.balance - C.initialBalance };
}
function setPnl(id, v) { const e = $(id); e.textContent = sgn(v); e.className = cls(v); }
function render() {
  const st = stats();
  $('bStatus').textContent = S.running ? (S.paused ? '● BOT PAUSED' : '● BOT RUNNING') : '● BOT STOPPED'; $('bStatus').className = 'b ' + (S.running && !S.paused ? 'on' : 'off');
  $('bAi').textContent = 'AI MODE: ' + aiMode; $('bApi').textContent = api; $('bApi').className = 'b ' + (api.includes('ONLINE') ? 'on' : 'off');
  $('bMock').hidden = !(M && M.sim); $('bPause').className = S.paused ? 'act' : ''; $('autoL').textContent = S.auto ? 'ON' : 'OFF'; $('auto').checked = S.auto;
  $('market').disabled = !!S.position; $('market').value = S.market;
  if (M) { $('price').textContent = '$' + px(M.price); $('chg').textContent = fmt(M.change) + '%'; $('chg').className = cls(M.change);
    $('hi').textContent = px(M.high); $('lo').textContent = px(M.low); $('vol').textContent = fmt(M.volume, 0); }
  if (sig) { $('sig').textContent = sig.signal; $('sig').className = sig.signal === 'BUY' ? 'pos' : sig.signal === 'SELL' ? 'neg' : '';
    $('conf').textContent = sig.confidence + '%'; $('rr').textContent = sig.signal === 'HOLD' ? '-' : '1:' + sig.riskReward; $('reason').textContent = sig.reason;
    const on = sig.signal !== 'HOLD'; $('sEn').textContent = on ? px(sig.entryPrice) : '-'; $('sSl').textContent = on ? px(sig.stopLoss) : '-'; $('sTp').textContent = on ? px(sig.takeProfit) : '-'; }
  $('riskMsg').textContent = riskMsg;
  $('dInit').textContent = usd(C.initialBalance); $('dBal').textContent = usd(S.balance); $('dEq').textContent = usd(st.eq);
  setPnl('dPl', st.pl); $('dPlp').textContent = (st.pl >= 0 ? '+' : '') + fmt(st.pl / C.initialBalance * 100) + '%'; $('dPlp').className = cls(st.pl); setPnl('dToday', todayPnl());
  $('dWr').textContent = fmt(st.wr, 0) + '%'; $('dPf').textContent = st.pf; $('dTr').textContent = st.n; $('dWl').textContent = st.w + ' / ' + st.l;
  const p = S.position;
  $('pos').innerHTML = p ? `<b class="${p.side === 'BUY' ? 'pos' : 'neg'}">${p.side}</b> ${p.market} · entry ${px(p.entry)} · SL ${px(p.sl)} · TP ${px(p.tp)}<br>qty ${p.qty.toPrecision(4)} · risk ${usd(p.risk)} · unrealized <b class="${cls(M ? pnlOf(p, M.price) : 0)}">${M ? sgn(pnlOf(p, M.price)) : '-'}</b>` : 'No open position';
  $('hist').innerHTML = S.history.length ? S.history.slice(0, 30).map(h => `<div class="tr"><span>${hms(h.closedAt)} · ${h.market}</span><span class="${h.side === 'BUY' ? 'pos' : 'neg'}">${h.side}</span><span>Entry ${px(h.entry)}</span><span>Exit ${px(h.exit)}</span><b class="${cls(h.pnl)}">${sgn(h.pnl)}</b><b class="${cls(h.pnl)}">${h.result}</b></div>`).join('') : '<span class="muted">No trades yet</span>';
  renderChart(); save();
}
function renderLog() { $('log').innerHTML = S.logs.map(l => `[${hms(l.t)}] ${l.m}`).join('<br>'); }
function snap(t) { if (!M) return null; let r = null; for (const c of M.candles) if (c.t <= t) r = c.t; return r ? r / 1000 : null; }
function renderChart() {
  if (!M || !window.LightweightCharts) return;
  if (!chart) { chart = LightweightCharts.createChart($('chart'), { layout: { background: { color: 'transparent' }, textColor: '#8a97ab' }, grid: { vertLines: { color: '#13203a' }, horzLines: { color: '#13203a' } }, timeScale: { timeVisible: true }, autoSize: true });
    candleSeries = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444' }); }
  candleSeries.setData(M.candles.map(c => ({ time: c.t / 1000, open: c.o, high: c.h, low: c.l, close: c.c })));
  lines.forEach(l => candleSeries.removePriceLine(l)); lines = [];
  const L = (price, color, title) => lines.push(candleSeries.createPriceLine({ price, color, title, lineWidth: 1, lineStyle: 2 }));
  const p = S.position, g = sig && sig.signal !== 'HOLD' ? sig : null;
  if (p && p.market === S.market) { L(p.entry, '#22d3ee', 'ENTRY'); L(p.sl, '#ef4444', 'SL'); L(p.tp, '#22c55e', 'TP'); }
  else if (g) { L(g.entryPrice, '#22d3ee', 'ENTRY?'); L(g.stopLoss, '#ef4444', 'SL'); L(g.takeProfit, '#22c55e', 'TP'); }
  const mk = [], add = (t, side, pos, color, shape, text) => { const s = snap(t); if (s) mk.push({ time: s, position: pos, color, shape, text }); };
  [...S.history.filter(h => h.market === S.market)].forEach(h => { add(h.openedAt, h.side, h.side === 'BUY' ? 'belowBar' : 'aboveBar', '#22d3ee', h.side === 'BUY' ? 'arrowUp' : 'arrowDown', h.side);
    add(h.closedAt, 'x', h.side === 'BUY' ? 'aboveBar' : 'belowBar', h.pnl >= 0 ? '#22c55e' : '#ef4444', 'circle', h.result); });
  if (p && p.market === S.market) add(p.openedAt, p.side, p.side === 'BUY' ? 'belowBar' : 'aboveBar', '#22d3ee', p.side === 'BUY' ? 'arrowUp' : 'arrowDown', p.side);
  mk.sort((a, b) => a.time - b.time); candleSeries.setMarkers(mk);
}

// ---------- Controls ----------
$('market').innerHTML = C.markets.map(m => `<option>${m}</option>`).join('');
$('market').onchange = e => { S.market = e.target.value; sig = null; riskMsg = ''; chart && (lines = [], chart.remove(), chart = null); scan(); };
$('bStart').onclick = () => { S.running = true; S.paused = false; log('BOT STARTED (SIMULATION MODE)'); scan(); };
$('bStop').onclick = () => { S.running = false; S.paused = false; log('BOT STOPPED - no new trades' + (S.position ? ', open position still monitored' : '')); render(); };
$('bPause').onclick = () => { if (!S.running) return; S.paused = !S.paused; log(S.paused ? 'BOT PAUSED' : 'BOT RESUMED'); render(); };
$('auto').onchange = e => { S.auto = e.target.checked; log('AUTO TRADING ' + (S.auto ? 'ON' : 'OFF') + ' (SIMULATION MODE)'); render(); };
$('bReset').onclick = () => { if (!confirm('Reset simulation? Balance back to $' + C.initialBalance + ' and all history deleted.')) return;
  const m = S.market; S = fresh(); S.market = m; sig = null; riskMsg = ''; save(); log('SIMULATION RESET'); scan(); };
fetch('/api/ai').then(r => r.json()).then(j => { if (j.configured) aiMode = 'AI + TECHNICAL ANALYSIS'; render(); }).catch(() => {});
renderLog(); render(); scan();
