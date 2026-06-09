import express from 'express';
import { stmts } from '../db/index.js';
import { generateSTRDraft, classifyFraudArchetype } from '../ml/explainer.js';

const router = express.Router();

// GET /api/alerts/:id/str — Download STR draft as plain text
router.get('/:id/str', (req, res) => {
  try {
    const alert = stmts.getAllAlerts.all(1000).find(a => a.id === req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const account = alert.account_id ? stmts.getAccount.get(alert.account_id) : null;
    const mlScores = alert.description ? JSON.parse('{}') : {};
    const fakeScoring = { compositeScore: account?.risk_score || 50, riskLevel: 'high', action: 'freeze_and_alert' };
    const archetype = classifyFraudArchetype(fakeScoring, { amount: 50000 });

    const strText = generateSTRDraft({ account, alert, scoring: fakeScoring, archetype });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="STR_${account?.account_number || alert.id}_${Date.now()}.txt"`);
    return res.send(strText);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/alerts — All alerts with optional status filter
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const status = req.query.status; // open, acknowledged, resolved, etc.

    let alerts = stmts.getAllAlerts.all(limit);

    if (status) {
      alerts = alerts.filter(a => a.status === status);
    }

    const enriched = alerts.map(alert => {
      const account = alert.account_id ? stmts.getAccount.get(alert.account_id) : null;
      return {
        ...alert,
        account: account ? {
          id: account.id,
          name: account.account_holder,
          account_number: account.account_number,
          risk_score: account.risk_score,
          status: account.status,
        } : null,
      };
    });

    return res.json({ alerts: enriched, total: enriched.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const stats = stmts.getAlertStats.get();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['open', 'acknowledged', 'investigating', 'resolved', 'false_positive'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    stmts.updateAlertStatus.run({
      status,
      resolved_at: ['resolved', 'false_positive'].includes(status) ? new Date().toISOString() : null,
      id: req.params.id,
    });

    return res.json({ message: 'Alert updated', alertId: req.params.id, status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
