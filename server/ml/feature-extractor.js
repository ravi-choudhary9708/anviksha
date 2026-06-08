// ============================================================
// Anviksha — Feature Extraction Engine
// ============================================================
// Extracts 19 behavioral features from raw transaction data,
// matching the MuleHunter.AI framework used by RBIH.
// These features are fed into the XGBoost + Isolation Forest
// ONNX models for real-time scoring.
// ============================================================

import { stmts } from '../db/index.js';

/**
 * All 19 feature names — must match the Python training script exactly.
 * The ONNX model expects features in this exact order.
 */
export const FEATURE_NAMES = [
  'txn_count_1h',           // 0: Transactions in last 1 hour
  'txn_count_24h',          // 1: Transactions in last 24 hours
  'amount_received_1h',     // 2: Total ₹ received in last hour
  'amount_sent_1h',         // 3: Total ₹ sent in last hour
  'avg_time_between_txns',  // 4: Average gap between txns (seconds)
  'is_off_hours',           // 5: Is 12AM-5AM? (binary 0/1)
  'is_round_amount',        // 6: Round number? (binary 0/1)
  'is_near_threshold',      // 7: Just below ₹50K threshold? (binary 0/1)
  'immediate_passthrough',  // 8: Receive+send within 5 min? (binary 0/1)
  'cross_channel_mixing',   // 9: Different channels in/out? (binary 0/1)
  'account_age_days',       // 10: How old is the account (days)
  'is_new_account',         // 11: Opened in last 30 days? (binary 0/1)
  'no_prior_history',       // 12: First transaction ever? (binary 0/1)
  'previously_flagged',     // 13: Been flagged before? (binary 0/1)
  'unique_senders_24h',     // 14: Fan-in: unique senders in 24h
  'unique_receivers_24h',   // 15: Fan-out: unique receivers in 24h
  'passthrough_ratio',      // 16: Received/sent ratio (~1.0 = mule)
  'suspect_registry_match', // 17: In I4C Suspect Registry? (binary 0/1)
  'linked_to_flagged',      // 18: Connected to flagged account? (binary 0/1)
];

/**
 * Extract all 19 features for a given transaction.
 * 
 * @param {Object} transaction - The transaction being scored
 *   { id, type, amount, sender_account_id, receiver_account_id, channel, timestamp }
 * @param {string} accountId - The account being evaluated (usually receiver for incoming)
 * @returns {Object} { features: Float32Array(19), featureMap: { name: value } }
 */
export function extractFeatures(transaction, accountId) {
  const now = transaction.timestamp || new Date().toISOString();
  const txnDate = new Date(now);
  
  // Time windows for lookback queries
  const oneHourAgo = new Date(txnDate.getTime() - 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(txnDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
  
  // Get the account record
  const account = stmts.getAccount.get(accountId);
  
  // ============================================================
  // VELOCITY FEATURES (0-4)
  // These measure how fast money is moving through the account
  // ============================================================
  
  // Feature 0: txn_count_1h — How many transactions in the last hour?
  // Mule accounts typically have 10+ txns/hour vs normal 0-3
  const txnStats1h = stmts.countTxnsInWindow.get(accountId, accountId, oneHourAgo);
  const txn_count_1h = txnStats1h?.count || 0;
  
  // Feature 1: txn_count_24h — How many in last 24 hours?
  const txnStats24h = stmts.countTxnsInWindow.get(accountId, accountId, twentyFourHoursAgo);
  const txn_count_24h = txnStats24h?.count || 0;
  
  // Feature 2 & 3: amount_received_1h, amount_sent_1h
  // Mules receive large sums and immediately forward them
  const flow = stmts.getFlowInWindow.get(accountId, accountId, accountId, accountId, oneHourAgo);
  const amount_received_1h = flow?.received || 0;
  const amount_sent_1h = flow?.sent || 0;
  
  // Feature 4: avg_time_between_txns — Average gap in seconds
  // Mules have very short gaps (under 5 minutes); normal is hours
  const recentTxns = stmts.getRecentTxns.all(accountId, accountId, twentyFourHoursAgo);
  let avg_time_between_txns = 7200; // Default: 2 hours
  if (recentTxns.length >= 2) {
    const times = recentTxns.map(t => new Date(t.timestamp).getTime()).sort();
    const gaps = [];
    for (let i = 1; i < times.length; i++) {
      gaps.push((times[i] - times[i - 1]) / 1000); // Convert ms to seconds
    }
    avg_time_between_txns = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }
  
  // ============================================================
  // BEHAVIORAL FEATURES (5-9)
  // These capture suspicious behavioral patterns
  // ============================================================
  
  // Feature 5: is_off_hours — Transactions between midnight and 5 AM
  // Fraudsters often operate late at night to avoid detection
  const hour = txnDate.getHours();
  const is_off_hours = (hour >= 0 && hour < 5) ? 1 : 0;
  
  // Feature 6: is_round_amount — Round numbers like ₹50,000 or ₹1,00,000
  // Mule transfers often use exact round amounts
  const is_round_amount = (transaction.amount % 1000 === 0 && transaction.amount >= 5000) ? 1 : 0;
  
  // Feature 7: is_near_threshold — Just below ₹50,000 reporting threshold
  // Structuring: deliberately keeping amounts below reporting limits
  const is_near_threshold = (transaction.amount >= 45000 && transaction.amount < 50000) ? 1 : 0;
  
  // Feature 8: immediate_passthrough — Money received and sent within 5 minutes
  // The hallmark of a mule: receive → immediately forward
  let immediate_passthrough = 0;
  if (recentTxns.length >= 2) {
    // Check if there's a receive followed by a send within 5 minutes
    for (let i = 0; i < recentTxns.length - 1; i++) {
      const curr = recentTxns[i];
      const next = recentTxns[i + 1];
      const timeDiff = Math.abs(new Date(curr.timestamp) - new Date(next.timestamp)) / 1000;
      const isReceiveThenSend = (
        (curr.receiver_account_id === accountId && next.sender_account_id === accountId) ||
        (next.receiver_account_id === accountId && curr.sender_account_id === accountId)
      );
      if (isReceiveThenSend && timeDiff < 300) { // 5 minutes
        immediate_passthrough = 1;
        break;
      }
    }
  }
  
  // Feature 9: cross_channel_mixing — Receive on UPI, send on NEFT
  // Mixing channels makes tracking harder for investigators
  let cross_channel_mixing = 0;
  if (recentTxns.length >= 2) {
    const channels = new Set(recentTxns.map(t => t.type));
    if (channels.size > 1) {
      // Check if there's a receive on one channel and send on another
      const receiveChannels = new Set(
        recentTxns.filter(t => t.receiver_account_id === accountId).map(t => t.type)
      );
      const sendChannels = new Set(
        recentTxns.filter(t => t.sender_account_id === accountId).map(t => t.type)
      );
      // If any channel used for receiving is different from sending channels
      for (const rc of receiveChannels) {
        for (const sc of sendChannels) {
          if (rc !== sc) {
            cross_channel_mixing = 1;
            break;
          }
        }
        if (cross_channel_mixing) break;
      }
    }
  }
  
  // ============================================================
  // ACCOUNT FEATURES (10-13)
  // These capture the account's profile and history
  // ============================================================
  
  // Feature 10: account_age_days — How old is the account?
  // Mule accounts are often recently opened
  let account_age_days = 365; // Default: 1 year
  if (account?.opened_date) {
    const opened = new Date(account.opened_date);
    account_age_days = Math.max(1, Math.floor((txnDate - opened) / (1000 * 60 * 60 * 24)));
  }
  
  // Feature 11: is_new_account — Opened in the last 30 days?
  const is_new_account = account_age_days <= 30 ? 1 : 0;
  
  // Feature 12: no_prior_history — Is this the account's first transaction?
  const accountStats = stmts.getAccountStats.get(accountId, accountId);
  const no_prior_history = (accountStats?.txn_count || 0) <= 1 ? 1 : 0;
  
  // Feature 13: previously_flagged — Has this account been flagged before?
  const previously_flagged = (account?.status === 'flagged' || account?.status === 'frozen' || account?.is_mule === 1) ? 1 : 0;
  
  // ============================================================
  // GRAPH/NETWORK FEATURES (14-16)
  // These capture the topology of money flow
  // ============================================================
  
  // Feature 14: unique_senders_24h — Fan-in: how many unique people sent money here?
  // Mules receive from many strangers (victims' money being aggregated)
  const senderCount = stmts.countUniqueSenders.get(accountId, twentyFourHoursAgo);
  const unique_senders_24h = senderCount?.count || 0;
  
  // Feature 15: unique_receivers_24h — Fan-out: how many unique recipients?
  // Mules forward money to multiple accounts (layering)
  const receiverCount = stmts.countUniqueReceivers.get(accountId, twentyFourHoursAgo);
  const unique_receivers_24h = receiverCount?.count || 0;
  
  // Feature 16: passthrough_ratio — Ratio of received to sent amounts
  // A ratio close to 1.0 means almost all money received is immediately forwarded
  // (the hallmark of a mule — they keep very little for themselves)
  let passthrough_ratio = 0;
  if (amount_received_1h > 0) {
    passthrough_ratio = Math.min(amount_sent_1h / amount_received_1h, 1.5);
  }
  
  // ============================================================
  // REGULATORY FEATURES (17-18)
  // These check against government fraud databases
  // ============================================================
  
  // Feature 17: suspect_registry_match — Is this account/phone/UPI in the I4C Suspect Registry?
  let suspect_registry_match = 0;
  if (account) {
    const suspectCheck = stmts.checkSuspectMulti.get(
      account.phone || '',
      account.upi_id || '',
      account.account_number || ''
    );
    if (suspectCheck) {
      suspect_registry_match = 1;
    }
  }
  
  // Feature 18: linked_to_flagged — Is any connected account already flagged?
  let linked_to_flagged = 0;
  const connections = stmts.getConnectionsFor.all(accountId, accountId);
  for (const conn of connections) {
    const connectedId = conn.source_account_id === accountId 
      ? conn.dest_account_id 
      : conn.source_account_id;
    const connAccount = stmts.getAccount.get(connectedId);
    if (connAccount && (connAccount.status === 'flagged' || connAccount.status === 'frozen' || connAccount.is_mule === 1)) {
      linked_to_flagged = 1;
      break;
    }
  }
  
  // ============================================================
  // Assemble feature vector (order must match training!)
  // ============================================================
  const featureValues = [
    txn_count_1h,           // 0
    txn_count_24h,          // 1
    amount_received_1h,     // 2
    amount_sent_1h,         // 3
    avg_time_between_txns,  // 4
    is_off_hours,           // 5
    is_round_amount,        // 6
    is_near_threshold,      // 7
    immediate_passthrough,  // 8
    cross_channel_mixing,   // 9
    account_age_days,       // 10
    is_new_account,         // 11
    no_prior_history,       // 12
    previously_flagged,     // 13
    unique_senders_24h,     // 14
    unique_receivers_24h,   // 15
    passthrough_ratio,      // 16
    suspect_registry_match, // 17
    linked_to_flagged,      // 18
  ];
  
  // Create Float32Array for ONNX inference
  const features = new Float32Array(featureValues);
  
  // Create named map for logging/debugging
  const featureMap = {};
  FEATURE_NAMES.forEach((name, i) => {
    featureMap[name] = featureValues[i];
  });
  
  return { features, featureMap };
}
