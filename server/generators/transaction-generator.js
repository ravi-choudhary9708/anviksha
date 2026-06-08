// ============================================================
// Anviksha — Mock Transaction Generator
// ============================================================
// Generates realistic Indian banking transactions in real-time.
// Produces both normal and fraudulent (mule) patterns.
// Runs on an interval, broadcasting each new txn via callback.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { stmts } from '../db/index.js';

// Indian bank transaction types with realistic distributions
const TXN_TYPES = ['UPI', 'NEFT', 'IMPS', 'RTGS', 'ATM'];
const TXN_TYPE_WEIGHTS = [0.55, 0.15, 0.15, 0.05, 0.10]; // UPI dominates in India

// Realistic transaction descriptions
const NORMAL_DESCRIPTIONS = [
  'Grocery payment', 'Electricity bill', 'Mobile recharge', 'Rent payment',
  'EMI payment', 'Salary credit', 'Family transfer', 'Medicine purchase',
  'Restaurant payment', 'Online shopping', 'Insurance premium', 'SIP investment',
  'Petrol pump', 'Subscription renewal', 'DTH recharge', 'School fees',
  'Mutual fund', 'FD interest credit', 'Water bill', 'Gas bill',
];

const FRAUD_DESCRIPTIONS = [
  'Fund transfer', 'Payment', 'Transfer', 'Credit', 'Account transfer',
  'Refund', 'Settlement', 'Commission', 'Service charge', 'Processing',
];

let intervalHandle = null;
let txnCounter = 0;

/**
 * Pick a weighted random item from an array.
 */
function weightedRandom(items, weights) {
  const r = Math.random();
  let sum = 0;
  for (let i = 0; i < items.length; i++) {
    sum += weights[i];
    if (r <= sum) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Generate a normal (legitimate) transaction.
 */
function generateNormalTransaction(accounts) {
  const normalAccounts = accounts.filter(a => !a.is_mule);
  if (normalAccounts.length < 2) return null;
  
  // Pick random sender and receiver (different accounts)
  const sender = normalAccounts[Math.floor(Math.random() * normalAccounts.length)];
  let receiver;
  do {
    receiver = normalAccounts[Math.floor(Math.random() * normalAccounts.length)];
  } while (receiver.id === sender.id);
  
  // Normal amounts: mostly small to medium (₹100 — ₹50,000)
  const amount = Math.round(
    Math.random() < 0.7
      ? (Math.random() * 5000 + 100)       // 70%: small payments ₹100-₹5,000
      : (Math.random() * 45000 + 5000)     // 30%: medium ₹5,000-₹50,000
  );
  
  const type = weightedRandom(TXN_TYPES, TXN_TYPE_WEIGHTS);
  
  return {
    id: uuidv4(),
    txn_ref: `TXN${Date.now()}${(++txnCounter).toString().padStart(4, '0')}`,
    type,
    amount,
    sender_account_id: sender.id,
    receiver_account_id: receiver.id,
    channel: 'digital',
    description: NORMAL_DESCRIPTIONS[Math.floor(Math.random() * NORMAL_DESCRIPTIONS.length)],
    timestamp: new Date().toISOString(),
    risk_score: 0,
    is_flagged: 0,
    features_json: null,
    ml_scores_json: null,
  };
}

/**
 * Generate a fraudulent/mule transaction pattern.
 * Simulates various mule behaviors:
 *   1. Fan-in: multiple normal accounts → mule (money aggregation)
 *   2. Fan-out: mule → multiple accounts (layering)
 *   3. Pass-through: receive then immediately send
 *   4. Off-hours large round amounts
 */
function generateFraudTransaction(accounts) {
  const muleAccounts = accounts.filter(a => a.is_mule);
  const normalAccounts = accounts.filter(a => !a.is_mule);
  
  if (muleAccounts.length === 0 || normalAccounts.length === 0) return null;
  
  const mule = muleAccounts[Math.floor(Math.random() * muleAccounts.length)];
  const pattern = Math.random();
  
  let sender, receiver, amount, type;
  
  if (pattern < 0.5) {
    // FAN-IN: Normal account sends TO mule (victim's money being collected)
    sender = normalAccounts[Math.floor(Math.random() * normalAccounts.length)];
    receiver = mule;
    // Large amounts, often round numbers
    amount = Math.round((Math.random() * 150000 + 20000) / 1000) * 1000;
  } else if (pattern < 0.8) {
    // FAN-OUT: Mule sends TO normal account (layering/forwarding)
    sender = mule;
    receiver = normalAccounts[Math.floor(Math.random() * normalAccounts.length)];
    // Slightly less than received (mule keeps a small cut)
    amount = Math.round((Math.random() * 120000 + 15000) / 1000) * 1000;
  } else {
    // MULE-TO-MULE: Layering between mule accounts
    sender = mule;
    receiver = muleAccounts[Math.floor(Math.random() * muleAccounts.length)];
    if (receiver.id === sender.id && muleAccounts.length > 1) {
      receiver = muleAccounts.find(a => a.id !== sender.id) || receiver;
    }
    amount = Math.round((Math.random() * 200000 + 50000) / 1000) * 1000;
  }
  
  // Fraud txns often use different channels than normal
  type = Math.random() < 0.4 ? 'NEFT' : (Math.random() < 0.6 ? 'IMPS' : 'UPI');
  
  return {
    id: uuidv4(),
    txn_ref: `TXN${Date.now()}${(++txnCounter).toString().padStart(4, '0')}`,
    type,
    amount,
    sender_account_id: sender.id,
    receiver_account_id: receiver.id,
    channel: 'digital',
    description: FRAUD_DESCRIPTIONS[Math.floor(Math.random() * FRAUD_DESCRIPTIONS.length)],
    timestamp: new Date().toISOString(),
    risk_score: 0,
    is_flagged: 0,
    features_json: null,
    ml_scores_json: null,
  };
}

/**
 * Start the transaction generator.
 * 
 * @param {Function} onTransaction - Callback called with each new transaction
 * @param {number} intervalMs - Time between transactions in milliseconds
 */
export function startTransactionGenerator(onTransaction, intervalMs = 2000) {
  console.log(`[GENERATOR] Starting transaction generator (interval: ${intervalMs}ms)`);
  
  const accounts = stmts.getAllAccounts.all();
  if (accounts.length < 2) {
    console.error('[GENERATOR] Need at least 2 accounts. Run "npm run seed" first.');
    return;
  }
  
  // Generate a mix: ~85% normal, ~15% fraud
  intervalHandle = setInterval(() => {
    const isFraud = Math.random() < 0.15;
    const transaction = isFraud 
      ? generateFraudTransaction(accounts)
      : generateNormalTransaction(accounts);
    
    if (transaction) {
      onTransaction(transaction);
    }
  }, intervalMs);
  
  // Also generate occasional burst patterns (mule behavior)
  // Every 30 seconds, generate a rapid burst of 3-5 transactions
  setInterval(() => {
    if (Math.random() < 0.3) { // 30% chance of burst
      const burstCount = Math.floor(Math.random() * 3) + 3;
      console.log(`[GENERATOR] 💥 Burst: ${burstCount} rapid fraud transactions`);
      
      for (let i = 0; i < burstCount; i++) {
        setTimeout(() => {
          const txn = generateFraudTransaction(accounts);
          if (txn) onTransaction(txn);
        }, i * 500); // 500ms between burst transactions
      }
    }
  }, 30000);
  
  return intervalHandle;
}

/**
 * Stop the transaction generator.
 */
export function stopTransactionGenerator() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[GENERATOR] Transaction generator stopped');
  }
}
