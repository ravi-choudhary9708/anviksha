// ============================================================
// Anviksha — Express API Routes: Accounts
// ============================================================
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { stmts } from '../db/index.js';
import { getNeighbors, getFanIn, getFanOut, getPassthroughRatio } from '../ml/graph-analyzer.js';

const router = express.Router();

// GET /api/accounts — All accounts sorted by risk score
router.get('/', (req, res) => {
  try {
    const threshold = parseFloat(req.query.min_risk) || 0;
    const accounts = threshold > 0
      ? stmts.getFlaggedAccounts.all(threshold)
      : stmts.getAllAccounts.all();

    const enriched = accounts.map(acc => ({
      ...acc,
      fanIn: getFanIn(acc.id),
      fanOut: getFanOut(acc.id),
      passthroughRatio: getPassthroughRatio(acc.id),
    }));

    return res.json({ accounts: enriched, total: enriched.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/accounts/:id — Full account profile
router.get('/:id', (req, res) => {
  try {
    const account = stmts.getAccount.get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const transactions = stmts.getTransactionsByAccount.all(req.params.id, req.params.id, 50);
    const riskTimeline = stmts.getRiskTimeline.all(req.params.id, 20);
    const neighbors = getNeighbors(req.params.id);

    const enrichedTxns = transactions.map(txn => {
      const sender = stmts.getAccount.get(txn.sender_account_id);
      const receiver = stmts.getAccount.get(txn.receiver_account_id);
      return {
        ...txn,
        sender: sender ? { id: sender.id, name: sender.account_holder } : null,
        receiver: receiver ? { id: receiver.id, name: receiver.account_holder } : null,
      };
    });

    return res.json({
      account: {
        ...account,
        fanIn: getFanIn(req.params.id),
        fanOut: getFanOut(req.params.id),
        passthroughRatio: getPassthroughRatio(req.params.id),
      },
      transactions: enrichedTxns,
      riskTimeline,
      neighbors,
      openAlerts: stmts.getOpenAlerts.all().filter(a => a.account_id === req.params.id),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts/:id/freeze — Freeze an account
router.post('/:id/freeze', (req, res) => {
  try {
    const account = stmts.getAccount.get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    stmts.setAccountStatus.run({ status: 'frozen', id: req.params.id });

    // Create alert
    stmts.insertAlert.run({
      id: uuidv4(),
      alert_type: 'analyst',
      severity: 'critical',
      account_id: req.params.id,
      txn_id: null,
      title: `Account ${account.account_number} manually frozen`,
      description: `Account frozen by analyst. Risk score at time of freeze: ${account.risk_score.toFixed(1)}`,
      ai_explanation: null,
      status: 'open',
    });

    return res.json({ message: 'Account frozen', accountId: req.params.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts/:id/unfreeze — Unfreeze an account
router.post('/:id/unfreeze', (req, res) => {
  try {
    const account = stmts.getAccount.get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    stmts.setAccountStatus.run({ status: 'active', id: req.params.id });
    return res.json({ message: 'Account unfrozen', accountId: req.params.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
