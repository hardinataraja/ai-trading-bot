// Placeholder untuk future Exchange API -> Order Executor.
// REAL TRADING DISABLED
// PAPER TRADING ONLY
module.exports = (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ mode: 'PAPER', realTrading: false });
  return res.status(403).json({ error: 'REAL TRADING DISABLED. Paper trading only.' });
};
