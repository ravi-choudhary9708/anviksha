// ============================================================
// Anviksha — Main Server Entry Point
// ============================================================
// Express.js + WebSocket server for the Anviksha fraud detection
// system. Handles REST API, real-time WebSocket broadcasting,

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

import { stmts } from './db/index.js';

import { initScoringEngine, scoreTransaction } from './ml/scoring-engine.js';
import { initGraph, updateGraph, getNeighbors } from './ml/graph-analyzer.js';
import { generateExplanation } from './ml/explainer.js';

import { startTransactionGenerator } from './generators/transaction-generator.js';
import { startI4CFeedGenerator } from './generators/i4c-feed-generator.js';
import { initKafkaConsumer, stopKafkaConsumer } from './kafka-consumer.js';

import transactionsRouter from './routes/transactions.js';
import accountsRouter from './routes/accounts.js';
import alertsRouter from './routes/alerts.js';
import dashboardRouter from './routes/dashboard.js';
import regulatoryRouter from './routes/regulatory.js';
import datasetScoringRouter from './routes/dataset-scoring.js';

const PORT = parseInt(process.env.PORT) || 3001;
const SIMULATION_INTERVAL = parseInt(process.env.SIMULATION_INTERVAL) || 2000;

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

const wss = new WebSocketServer({ server: httpServer });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  const stats = stmts.getDashboardStats.get();
  ws.send(JSON.stringify({ type: 'init', data: stats }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
    clients.delete(ws);
  });
});

function broadcast(type, data) {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

async function processTransaction(transaction) {
  try {
    // 1. Update graph topology in real time so scoring reflects the active edge
    updateGraph(transaction);

    // 2. Score transaction using Fused ML + Graph engine
    const scoring = await scoreTransaction(transaction, transaction.receiver_account_id);

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

    stmts.insertRiskScore.run({
      id: uuidv4(),
      account_id: transaction.receiver_account_id,
      txn_id: transaction.id,
      composite_score: scoring.compositeScore,
      velocity_score: scoring.velocityScore,
      behavioral_score: scoring.behavioralScore,
      graph_score: scoring.graphScore,
      regulatory_score: scoring.regulatoryScore,
      anomaly_score: scoring.anomalyScore,
      model_type: scoring.modelType,
      features_json: JSON.stringify(scoring.featureMap),
    });

    const account = stmts.getAccount.get(transaction.receiver_account_id);
    if (account) {
      const prevScore = account.risk_score || 0;
      const newScore = 0.3 * scoring.compositeScore + 0.7 * prevScore;

      let newStatus = account.status;
      if (newScore >= 71 && newStatus !== 'frozen') {
        newStatus = 'flagged';
      } else if (newScore >= 41 && newStatus === 'active') {
        newStatus = 'under_review';
      }

      stmts.updateAccountRisk.run({ risk_score: newScore, status: newStatus, id: account.id });
    }

    if (scoring.compositeScore >= 41) {
      const receiver = stmts.getAccount.get(transaction.receiver_account_id);
      const sender = stmts.getAccount.get(transaction.sender_account_id);

      const severity = scoring.compositeScore >= 71 ? 'critical' : (scoring.compositeScore >= 55 ? 'high' : 'medium');
      const alertTitle = scoring.compositeScore >= 71
        ? `🚨 CRITICAL: Mule account pattern detected — ${receiver?.account_number}`
        : `⚠️ Suspicious transaction flagged — ${receiver?.account_number}`;

      let aiExplanation = null;
      if (scoring.compositeScore >= 65) {
        try {
          const neighbors = getNeighbors(transaction.receiver_account_id);
          aiExplanation = await generateExplanation({
            transaction,
            account: receiver,
            scoring,
            neighbors,
          });
        } catch (err) {
          console.error('[EXPLAINER] Failed to generate explanation:', err.message);
        }
      }

      const alert = {
        id: uuidv4(),
        alert_type: 'ml_flag',
        severity,
        account_id: transaction.receiver_account_id,
        txn_id: transaction.id,
        title: alertTitle,
        description: `Transaction of ₹${transaction.amount.toLocaleString('en-IN')} via ${transaction.type}. Risk score: ${scoring.compositeScore.toFixed(1)}/100. Action: ${scoring.action}.`,
        ai_explanation: aiExplanation,
        status: 'open',
      };

      stmts.insertAlert.run(alert);

      broadcast('alert', {
        alert,
        account: receiver,
        transaction: {
          ...transaction,
          sender: sender ? { id: sender.id, name: sender.account_holder } : null,
          receiver: receiver ? { id: receiver.id, name: receiver.account_holder } : null,
        },
        scoring,
      });

      if (scoring.compositeScore >= 71) {
        console.log(`[🚨 FRAUD] Account ${receiver?.account_number} — Score: ${scoring.compositeScore.toFixed(1)} — Action: ${scoring.action}`);
      }
    }

    const sender = stmts.getAccount.get(transaction.sender_account_id);
    const receiver = stmts.getAccount.get(transaction.receiver_account_id);
    broadcast('transaction', {
      transaction: {
        ...transaction,
        sender: sender ? { id: sender.id, name: sender.account_holder, account_number: sender.account_number } : null,
        receiver: receiver ? { id: receiver.id, name: receiver.account_holder, account_number: receiver.account_number } : null,
      },
      scoring,
    });

  } catch (err) {
    console.error('[PIPELINE] Error processing transaction:', err.message, err.stack);
  }
}

app.use('/api/transactions', transactionsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/regulatory', regulatoryRouter);
app.use('/api/dataset', datasetScoringRouter);

// ============================================================
// Fallback Ingestion Layer — for standalone mode (no Go/Kafka)
// ============================================================
// When the Go microservice is running, it receives transactions,
// publishes to Kafka, and the Node Kafka consumer calls processTransaction().
// When Go is not running, the generator POSTs here directly.
// Layer 1: JA3 TLS fingerprint check mirrors the Go microservice shield.
// ============================================================
const BLOCKED_JA3_HASHES = new Set([
  '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0',
  '771,4866-4867-4865-49196-49200-159-52393-52392-52394-49195-49199-158-49188-49192-107-49187-49191-103-49162-49172-57-49161-49171-51-157-156-53-47-255,0-11-10-35-22-23-13-43-45-51-21,29-23-30-25-24,0-1-2',
]);

app.post('/api/ingest', async (req, res) => {
  const payload = req.body;
  if (!payload) return res.status(400).json({ error: 'Invalid payload' });

  // Layer 1: The Shield — drop known malicious TLS fingerprints instantly
  if (payload.ja3_fingerprint && BLOCKED_JA3_HASHES.has(payload.ja3_fingerprint)) {
    console.log(`[SECURITY] 🛡️ Dropped transaction — malicious JA3 fingerprint: ${payload.ja3_fingerprint.slice(0, 30)}...`);
    return res.status(403).json({ status: 'rejected', reason: 'Malicious TLS fingerprint detected (Layer 1 Shield)' });
  }

  // Process asynchronously — don't block the HTTP response
  processTransaction(payload).catch(err => console.error('[INGEST] Error:', err.message));
  return res.status(202).json({ status: 'accepted', message: 'Transaction queued (Node fallback)' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Anviksha Fraud Detection API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    wsClients: clients.size,
  });
});

async function start() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Anviksha — Mule Account Detection System  ║');
  console.log('║   BOI Hackathon 2026                        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  await initScoringEngine();

  initGraph();

  httpServer.listen(PORT, () => {
    console.log(`[SERVER] ✅ API running at http://localhost:${PORT}`);
    console.log(`[SERVER] ✅ WebSocket running at ws://localhost:${PORT}`);
    console.log(`[SERVER] ✅ Health check: http://localhost:${PORT}/api/health`);
  });

  // Start Kafka consumer (listens to Go microservice → Redpanda topic)
  // Gracefully falls back if Kafka/Redpanda is not running
  await initKafkaConsumer(processTransaction);

  // Start mock transaction stream
  // Routes via Go ingest API → Kafka → here, or direct fallback
  startTransactionGenerator(processTransaction, SIMULATION_INTERVAL);

  startI4CFeedGenerator((entry) => {
    broadcast('suspect_registry', { entry });
    console.log(`[I4C] New entry: ${entry.identifier_value} from ${entry.source}`);
  }, 45000);

  console.log('[SERVER] 🚀 All systems running. Dashboard: http://localhost:5173\n');
}

process.on('SIGINT', async () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  await stopKafkaConsumer();
  httpServer.close(() => {
    console.log('[SERVER] HTTP server closed');
    process.exit(0);
  });
});

start().catch(err => {
  console.error('[SERVER] Fatal startup error:', err);
  process.exit(1);
});
