import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { stmts } from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const datasetPath = path.join(__dirname, 'dataset_features.json');
let dataset = [];
try {
  dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  console.log(`[GENERATOR] Loaded ${dataset.length} real BOI records`);
} catch (error) {
  console.error('[GENERATOR] Could not load dataset_features.json');
}

const fraudRecords = dataset.filter(r => r.F3924 === 1);
const normalRecords = dataset.filter(r => r.F3924 === 0);

const TXN_TYPES = ['UPI', 'NEFT', 'IMPS', 'RTGS', 'ATM'];
const TXN_TYPE_WEIGHTS = [0.55, 0.15, 0.15, 0.05, 0.10];

const NORMAL_DESCRIPTIONS = [
  'Grocery payment', 'Electricity bill', 'Mobile recharge', 'Rent payment',
  'EMI payment', 'Salary credit', 'Family transfer', 'Medicine purchase',
  'Restaurant payment', 'Online shopping', 'Insurance premium', 'SIP investment',
  'Petrol pump', 'Subscription renewal', 'DTH recharge', 'School fees',
];

const FRAUD_DESCRIPTIONS = [
  'Fund transfer', 'Payment', 'Transfer', 'Credit', 'Account transfer',
  'Refund', 'Settlement', 'Commission', 'Service charge', 'Processing',
];

let intervalHandle = null;
let txnCounter = 0;

function weightedRandom(items, weights) {
  const r = Math.random();
  let sum = 0;
  for (let i = 0; i < items.length; i++) {
    sum += weights[i];
    if (r <= sum) return items[i];
  }
  return items[items.length - 1];
}

function generateTransaction(accounts, isFraud) {
  if (accounts.length < 2) return null;

  const records = isFraud ? fraudRecords : normalRecords;
  if (records.length === 0) return null;

  // Pick a real BOI record and use its actual feature values
  const record = records[Math.floor(Math.random() * records.length)];

  const sender = accounts[Math.floor(Math.random() * accounts.length)];
  let receiver;
  do {
    receiver = accounts[Math.floor(Math.random() * accounts.length)];
  } while (receiver.id === sender.id);

  const amount = isFraud
    ? Math.round((Math.random() * 150000 + 20000) / 1000) * 1000
    : Math.round(Math.random() * 50000 + 100);

  const type = weightedRandom(TXN_TYPES, TXN_TYPE_WEIGHTS);
  const description = isFraud
    ? FRAUD_DESCRIPTIONS[Math.floor(Math.random() * FRAUD_DESCRIPTIONS.length)]
    : NORMAL_DESCRIPTIONS[Math.floor(Math.random() * NORMAL_DESCRIPTIONS.length)];

  // Attach real BOI feature values so scoring engine uses them directly
  const dataset_features = {
    F115: isNaN(Number(record.F115)) ? 0 : Number(record.F115),
    F321: isNaN(Number(record.F321)) ? 0 : Number(record.F321),
    F527: isNaN(Number(record.F527)) ? 0 : Number(record.F527),
    F531: isNaN(Number(record.F531)) ? 0 : Number(record.F531),
    F670: isNaN(Number(record.F670)) ? 0 : Number(record.F670),
    F1692: isNaN(Number(record.F1692)) ? 0 : Number(record.F1692),
    F2082: isNaN(Number(record.F2082)) ? 0 : Number(record.F2082),
    F2122: isNaN(Number(record.F2122)) ? 0 : Number(record.F2122),
    F2582: isNaN(Number(record.F2582)) ? 0 : Number(record.F2582),
    F2678: isNaN(Number(record.F2678)) ? 0 : Number(record.F2678),
    F2737: isNaN(Number(record.F2737)) ? 0 : Number(record.F2737),
    F2956: isNaN(Number(record.F2956)) ? 0 : Number(record.F2956),
    F3043: isNaN(Number(record.F3043)) ? 0 : Number(record.F3043),
    F3836: isNaN(Number(record.F3836)) ? 0 : Number(record.F3836),
    F3887: isNaN(Number(record.F3887)) ? 0 : Number(record.F3887),
    F3889: String(record.F3889),
    F3891: String(record.F3891),
    F3894: isNaN(Number(record.F3894)) ? 0 : Number(record.F3894),
    F3924: record.F3924,
  };

  return {
    id: uuidv4(),
    txn_ref: `TXN${Date.now()}${(++txnCounter).toString().padStart(4, '0')}`,
    type,
    amount,
    sender_account_id: sender.id,
    receiver_account_id: receiver.id,
    channel: 'digital',
    description,
    timestamp: new Date().toISOString(),
    risk_score: 0,
    is_flagged: 0,
    features_json: null,
    ml_scores_json: null,
    dataset_features,
  };
}

export function startTransactionGenerator(onTransaction, intervalMs = 2000) {
  console.log(`[GENERATOR] Starting real-data transaction generator (${intervalMs}ms)`);

  if (dataset.length === 0) {
    console.warn('[GENERATOR] No dataset loaded. Run: python server/ml/train_model.py');
  }

  const accounts = stmts.getAllAccounts.all();
  if (accounts.length < 2) {
    console.error('[GENERATOR] Need at least 2 accounts. Run: npm run seed');
    return;
  }

  // Fraud rate ~10% to match real dataset distribution
  intervalHandle = setInterval(() => {
    const isFraud = Math.random() < 0.10;
    const transaction = generateTransaction(accounts, isFraud);
    if (transaction) onTransaction(transaction);
  }, intervalMs);

  return intervalHandle;
}

export function stopTransactionGenerator() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
