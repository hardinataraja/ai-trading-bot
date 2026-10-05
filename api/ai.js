// AI review. Key HANYA dari env Vercel: AI_API_KEY (opsional AI_MODEL). Provider: Anthropic Messages API.
module.exports = async (req, res) => {
  const key = process.env.AI_API_KEY;
  if (req.method === 'GET') return res.status(200).json({ configured: !!key });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!key) return res.status(200).json({ mode: 'LOCAL' }); // frontend memakai local strategy
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const p = b.proposal || {};
    const prompt = `You are a cautious crypto paper-trading analyst. Market: ${b.symbol}.\nIndicators: ${JSON.stringify(b.indicators)}\nRule-based proposal: ${JSON.stringify({ signal: p.signal, confidence: p.confidence, reason: p.reason })}\nConfirm the proposal or veto it with HOLD. No guarantees of profit. Reply with ONLY JSON: {"signal":"BUY|SELL|HOLD","confidence":0-100,"reason":"max 160 chars"}`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) throw new Error('AI HTTP ' + r.status);
    const text = ((await r.json()).content || []).map(c => c.text || '').join('');
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    // Validasi ketat: AI hanya boleh setuju dengan proposal atau veto ke HOLD.
    const signal = j.signal === p.signal ? p.signal : 'HOLD';
    const confidence = Math.max(0, Math.min(100, Math.round(Number(j.confidence) || 0)));
    return res.status(200).json({ mode: 'AI', signal, confidence, reason: String(j.reason || '').slice(0, 200) });
  } catch (e) {
    return res.status(200).json({ mode: 'LOCAL', error: 'AI unavailable' }); // fallback aman
  }
};
