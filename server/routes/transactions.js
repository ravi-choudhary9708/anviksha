// ============================================================
// Anviksha — Express API Routes: Transactions
// ============================================================
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { stmts } from '../db/index.js';
import { scoreTransaction } from '../ml/scoring-engine.js';
import { updateGraph } from '../ml/graph-analyzer.js';

const router = express.Router();

// POST /api/transactions — Ingest a new transaction
router.post('/', async (req, res) => {
  try {
    const { type, amount, sender_account_id, receiver_account_id, channel, description } = req.body;

    if (!type || !amount || !sender_account_id || !receiver_account_id) {
      return res.status(400).json({ error: 'Missing required fields: type, amount, sender_account_id, receiver_account_id' });
    }

    const transaction = {
      id: uuidv4(),
      txn_ref: `TXN${Date.now()}`,
      type: type.toUpperCase(),
      amount: parseFloat(amount),
      sender_account_id,
      receiver_account_id,
      channel: channel || 'digital',
      description: description || 'Transfer',
      timestamp: new Date().toISOString(),
      risk_score: 0,
      is_flagged: 0,
      features_json: null,
      ml_scores_json: null,
    };

    // Update graph topology in real time so scoring reflects the active edge
    updateGraph(transaction);

    // Score the transaction (evaluate receiver as primary suspect) with fused ML + Graph
    const scoring = await scoreTransaction(transaction, receiver_account_id);

    transaction.risk_score = scoring.compositeScore;
    transaction.is_flagged = scoring.compositeScore >= 41 ? 1 : 0;
    transaction.features_json = JSON.stringify(scoring.featureMap);
    transaction.ml_scores_json = JSON.stringify({
      velocity: scoring.velocityScore,
      behavioral: scoring.behavioralScore,
      graph: scoring.graphScore,
      regulatory: scoring.regulatoryScore,
      anomaly: scoring.anomalyScore,
    });

    stmts.insertTransaction.run(transaction);

    return res.status(201).json({ transaction, scoring });
  } catch (err) {
    console.error('[API] POST /transactions error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const flaggedOnly = req.query.flagged === 'true';

    const rows = flaggedOnly
      ? stmts.getFlaggedTransactions.all(limit)
      : stmts.getAllTransactions.all(limit);

    const enriched = rows.map(txn => {
      const sender = stmts.getAccount.get(txn.sender_account_id);
      const receiver = stmts.getAccount.get(txn.receiver_account_id);
      return {
        ...txn,
        sender: sender ? { id: sender.id, name: sender.account_holder, account_number: sender.account_number } : null,
        receiver: receiver ? { id: receiver.id, name: receiver.account_holder, account_number: receiver.account_number } : null,
        features: txn.features_json ? JSON.parse(txn.features_json) : null,
        ml_scores: txn.ml_scores_json ? JSON.parse(txn.ml_scores_json) : null,
      };
    });

    return res.json({ transactions: enriched, total: enriched.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const txn = stmts.getTransaction.get(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    const sender = stmts.getAccount.get(txn.sender_account_id);
    const receiver = stmts.getAccount.get(txn.receiver_account_id);

    return res.json({
      ...txn,
      sender,
      receiver,
      features: txn.features_json ? JSON.parse(txn.features_json) : null,
      ml_scores: txn.ml_scores_json ? JSON.parse(txn.ml_scores_json) : null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
