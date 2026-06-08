// ============================================================
// Anviksha — Main Server Entry Point
// ============================================================
// Express.js + WebSocket server for the Anviksha fraud detection
// system. Handles REST API, real-time WebSocket broadcasting,
// ML pipeline orchestration, and mock data generation.
// ============================================================

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

// Database
import { stmts } from './db/index.js';

// ML Engine
import { initScoringEngine, scoreTransaction } from './ml/scoring-engine.js';
import { initGraph, updateGraph, getNeighbors } from './ml/graph-analyzer.js';
import { generateExplanation } from './ml/explainer.js';

// Generators
import { startTransactionGenerator } from './generators/transaction-generator.js';
import { startI4CFeedGenerator } from './generators/i4c-feed-generator.js';

// Routes
import transactionsRouter from './routes/transactions.js';
import accountsRouter from './routes/accounts.js';
import alertsRouter from './routes/alerts.js';
import dashboardRouter from './routes/dashboard.js';
import regulatoryRouter from './routes/regulatory.js';

const PORT = parseInt(process.env.PORT) || 3001;
const SIMULATION_INTERVAL = parseInt(process.env.SIMULATION_INTERVAL) || 2000;

// ============================================================
// Express App Setup
// ============================================================
const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

// ============================================================
// WebSocket Server — Real-time event broadcasting
// ============================================================
const wss = new WebSocketServer({ server: httpServer });

// Store connected clients
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  // Send initial state on connect
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

/**
 * Broadcast a message to all connected WebSocket clients.
 */
function broadcast(type, data) {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// ============================================================
// Core Transaction Processing Pipeline
// ============================================================

/**
 * Process a new transaction through the full ML pipeline:
 * 1. Insert into database
 * 2. Update account connection graph
 * 3. Extract features + score with ML model
 * 4. Update account risk score
 * 5. Generate alert if high-risk
 * 6. Generate AI explanation for critical alerts
 * 7. Broadcast to dashboard via WebSocket
 */
async function processTransaction(transaction) {
  try {
    // Step 1: Score the RECEIVER (primary mule detection target)
    const scoring = await scoreTransaction(transaction, transaction.receiver_account_id);

    // Update transaction with scores
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

    // Step 2: Save transaction
    stmts.insertTransaction.run(transaction);

    // Step 3: Update account graph
    updateGraph(transaction);

    // Step 4: Save detailed risk score record
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

    // Step 5: Update account risk score (exponential moving average — smooths out spikes)
    const account = stmts.getAccount.get(transaction.receiver_account_id);
    if (account) {
      const prevScore = account.risk_score || 0;
      // EMA: new score = 0.3 × current + 0.7 × previous (gives weight to history)
      const newScore = 0.3 * scoring.compositeScore + 0.7 * prevScore;

      let newStatus = account.status;
      if (newScore >= 71 && newStatus !== 'frozen') {
        newStatus = 'flagged';
      } else if (newScore >= 41 && newStatus === 'active') {
        newStatus = 'under_review';
      }

      stmts.updateAccountRisk.run({ risk_score: newScore, status: newStatus, id: account.id });
    }

    // Step 6: Generate alert for medium+ risk transactions
    if (scoring.compositeScore >= 41) {
      const receiver = stmts.getAccount.get(transaction.receiver_account_id);
      const sender = stmts.getAccount.get(transaction.sender_account_id);

      const severity = scoring.compositeScore >= 71 ? 'critical' : (scoring.compositeScore >= 55 ? 'high' : 'medium');
      const alertTitle = scoring.compositeScore >= 71
        ? `🚨 CRITICAL: Mule account pattern detected — ${receiver?.account_number}`
        : `⚠️ Suspicious transaction flagged — ${receiver?.account_number}`;

      // Generate AI explanation for critical alerts
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

      // Broadcast new alert
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

    // Step 7: Broadcast transaction to live feed
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

// ============================================================
// API Routes
// ============================================================
app.use('/api/transactions', transactionsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/regulatory', regulatoryRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Anviksha Fraud Detection API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    wsClients: clients.size,
  });
});

// ============================================================
// Startup Sequence
// ============================================================
async function start() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Anviksha — Mule Account Detection System  ║');
  console.log('║   BOI Hackathon 2026                        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // 1. Initialize ML scoring engine (load ONNX or fall back)
  await initScoringEngine();

  // 2. Initialize account connection graph from DB
  initGraph();

  // 3. Start HTTP + WebSocket server
  httpServer.listen(PORT, () => {
    console.log(`[SERVER] ✅ API running at http://localhost:${PORT}`);
    console.log(`[SERVER] ✅ WebSocket running at ws://localhost:${PORT}`);
    console.log(`[SERVER] ✅ Health check: http://localhost:${PORT}/api/health`);
  });

  // 4. Start mock transaction stream
  startTransactionGenerator(processTransaction, SIMULATION_INTERVAL);

  // 5. Start I4C regulatory feed
  startI4CFeedGenerator((entry) => {
    broadcast('suspect_registry', { entry });
    console.log(`[I4C] New entry: ${entry.identifier_value} from ${entry.source}`);
  }, 45000);

  console.log('[SERVER] 🚀 All systems running. Dashboard: http://localhost:5173\n');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SERVER] Shutting down...');
  httpServer.close(() => {
    console.log('[SERVER] HTTP server closed');
    process.exit(0);
  });
});

start().catch(err => {
  console.error('[SERVER] Fatal startup error:', err);
  process.exit(1);
});
