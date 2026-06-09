// ============================================================
// Anviksha — Express API Routes: Dashboard
// ============================================================
import express from 'express';
import { stmts } from '../db/index.js';
import { getGraphData } from '../ml/graph-analyzer.js';
import { isUsingONNX } from '../ml/scoring-engine.js';

const router = express.Router();

// GET /api/dashboard/stats — Aggregated metrics for the top bar
router.get('/stats', (req, res) => {
  try {
    const stats = stmts.getDashboardStats.get();
    const txnByType = stmts.getTxnByType.all();
    const riskDist = stmts.getRiskDistribution.all();
    const alertStats = stmts.getAlertStats.get();

    return res.json({
      ...stats,
      txnByType,
      riskDistribution: riskDist,
      alertStats,
      mlEngine: isUsingONNX() ? 'XGBoost + Isolation Forest (ONNX)' : 'Rule-Based Fallback',
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/graph — Network graph data for D3.js
router.get('/graph', (req, res) => {
  try {
    const graphData = getGraphData();
    return res.json(graphData);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/timeline', (req, res) => {
  try {
    const timeline = stmts.getFlaggedTimeline.all();
    return res.json({ timeline: timeline.reverse() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
