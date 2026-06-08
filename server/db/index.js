// ============================================================
// Anviksha — Database Initialization & Access Layer
// Uses better-sqlite3 for synchronous, fast SQLite access
// ============================================================

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve DB path — ensure the data directory exists
const DB_PATH = process.env.DB_PATH || './data/anviksha.db';
const resolvedDbPath = resolve(process.cwd(), DB_PATH);
const dbDir = dirname(resolvedDbPath);

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database with WAL mode for better concurrent read performance
const db = new Database(resolvedDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// Run schema — creates tables if they don't exist
// ============================================================
const schemaPath = resolve(__dirname, 'schema.sql');
const schema = readFileSync(schemaPath, 'utf-8');
db.exec(schema);

console.log(`[DB] SQLite initialized at ${resolvedDbPath}`);

// ============================================================
// Prepared Statements — pre-compiled for performance
// ============================================================

// --- Accounts ---
const stmts = {
  // Insert a new account
  insertAccount: db.prepare(`
    INSERT OR IGNORE INTO accounts (id, account_number, account_holder, ifsc_code, bank_name, upi_id, phone, account_type, kyc_status, opened_date, risk_score, status, is_mule)
    VALUES (@id, @account_number, @account_holder, @ifsc_code, @bank_name, @upi_id, @phone, @account_type, @kyc_status, @opened_date, @risk_score, @status, @is_mule)
  `),

  // Get all accounts, optionally sorted by risk
  getAllAccounts: db.prepare(`SELECT * FROM accounts ORDER BY risk_score DESC`),

  // Get single account by ID
  getAccount: db.prepare(`SELECT * FROM accounts WHERE id = ?`),

  // Update account risk score
  updateAccountRisk: db.prepare(`UPDATE accounts SET risk_score = @risk_score, status = @status WHERE id = @id`),

  // Freeze/unfreeze account
  setAccountStatus: db.prepare(`UPDATE accounts SET status = @status WHERE id = @id`),

  // Get flagged accounts (risk_score > threshold)
  getFlaggedAccounts: db.prepare(`SELECT * FROM accounts WHERE risk_score > ? OR status IN ('frozen','flagged','under_review') ORDER BY risk_score DESC`),

  // --- Transactions ---
  insertTransaction: db.prepare(`
    INSERT INTO transactions (id, txn_ref, type, amount, sender_account_id, receiver_account_id, channel, description, timestamp, risk_score, is_flagged, features_json, ml_scores_json)
    VALUES (@id, @txn_ref, @type, @amount, @sender_account_id, @receiver_account_id, @channel, @description, @timestamp, @risk_score, @is_flagged, @features_json, @ml_scores_json)
  `),

  getAllTransactions: db.prepare(`SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ?`),

  getFlaggedTransactions: db.prepare(`SELECT * FROM transactions WHERE is_flagged = 1 ORDER BY timestamp DESC LIMIT ?`),

  getTransactionsByAccount: db.prepare(`
    SELECT * FROM transactions 
    WHERE sender_account_id = ? OR receiver_account_id = ? 
    ORDER BY timestamp DESC LIMIT ?
  `),

  getTransaction: db.prepare(`SELECT * FROM transactions WHERE id = ?`),

  // Count transactions for an account in a time window
  countTxnsInWindow: db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
    FROM transactions
    WHERE (sender_account_id = ? OR receiver_account_id = ?) AND timestamp > ?
  `),

  // Count unique senders to an account in a time window
  countUniqueSenders: db.prepare(`
    SELECT COUNT(DISTINCT sender_account_id) as count
    FROM transactions
    WHERE receiver_account_id = ? AND timestamp > ?
  `),

  // Count unique receivers from an account in a time window
  countUniqueReceivers: db.prepare(`
    SELECT COUNT(DISTINCT receiver_account_id) as count
    FROM transactions
    WHERE sender_account_id = ? AND timestamp > ?
  `),

  // Get received and sent amounts in a window
  getFlowInWindow: db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN receiver_account_id = ? THEN amount ELSE 0 END), 0) as received,
      COALESCE(SUM(CASE WHEN sender_account_id = ? THEN amount ELSE 0 END), 0) as sent
    FROM transactions
    WHERE (sender_account_id = ? OR receiver_account_id = ?) AND timestamp > ?
  `),

  // Recent transactions for passthrough detection
  getRecentTxns: db.prepare(`
    SELECT * FROM transactions
    WHERE (sender_account_id = ? OR receiver_account_id = ?) AND timestamp > ?
    ORDER BY timestamp DESC LIMIT 20
  `),

  // Get avg amount for an account (for anomaly detection)
  getAccountStats: db.prepare(`
    SELECT 
      AVG(amount) as avg_amount, 
      COUNT(*) as txn_count,
      MIN(amount) as min_amount,
      MAX(amount) as max_amount
    FROM transactions
    WHERE sender_account_id = ? OR receiver_account_id = ?
  `),

  // --- Alerts ---
  insertAlert: db.prepare(`
    INSERT INTO alerts (id, alert_type, severity, account_id, txn_id, title, description, ai_explanation, status)
    VALUES (@id, @alert_type, @severity, @account_id, @txn_id, @title, @description, @ai_explanation, @status)
  `),

  getAllAlerts: db.prepare(`SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?`),

  getOpenAlerts: db.prepare(`SELECT * FROM alerts WHERE status IN ('open','acknowledged','investigating') ORDER BY created_at DESC`),

  updateAlertStatus: db.prepare(`UPDATE alerts SET status = @status, resolved_at = @resolved_at WHERE id = @id`),

  getAlertStats: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
      SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_count,
      SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high_count
    FROM alerts
  `),

  // --- Suspect Registry ---
  insertSuspect: db.prepare(`
    INSERT INTO suspect_registry (id, identifier_type, identifier_value, source, complaint_ref, reason, reported_at, status)
    VALUES (@id, @identifier_type, @identifier_value, @source, @complaint_ref, @reason, @reported_at, @status)
  `),

  getAllSuspects: db.prepare(`SELECT * FROM suspect_registry ORDER BY reported_at DESC`),

  // Check if a value exists in suspect registry
  checkSuspect: db.prepare(`
    SELECT * FROM suspect_registry 
    WHERE identifier_value = ? AND status = 'active'
    LIMIT 1
  `),

  // Check multiple identifiers at once (phone, upi, account)
  checkSuspectMulti: db.prepare(`
    SELECT * FROM suspect_registry 
    WHERE identifier_value IN (?, ?, ?) AND status = 'active'
  `),

  // --- Risk Scores ---
  insertRiskScore: db.prepare(`
    INSERT INTO risk_scores (id, account_id, txn_id, composite_score, velocity_score, behavioral_score, graph_score, regulatory_score, anomaly_score, model_type, features_json)
    VALUES (@id, @account_id, @txn_id, @composite_score, @velocity_score, @behavioral_score, @graph_score, @regulatory_score, @anomaly_score, @model_type, @features_json)
  `),

  getRiskTimeline: db.prepare(`
    SELECT * FROM risk_scores WHERE account_id = ? ORDER BY scored_at DESC LIMIT ?
  `),

  // --- Account Connections ---
  upsertConnection: db.prepare(`
    INSERT INTO account_connections (source_account_id, dest_account_id, txn_count, total_amount, first_txn_at, last_txn_at)
    VALUES (@source_account_id, @dest_account_id, 1, @total_amount, @first_txn_at, @last_txn_at)
    ON CONFLICT(source_account_id, dest_account_id) DO UPDATE SET
      txn_count = txn_count + 1,
      total_amount = total_amount + @total_amount,
      last_txn_at = @last_txn_at
  `),

  getConnectionsFor: db.prepare(`
    SELECT * FROM account_connections 
    WHERE source_account_id = ? OR dest_account_id = ?
  `),

  getAllConnections: db.prepare(`SELECT * FROM account_connections`),

  // --- Dashboard Stats ---
  getDashboardStats: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM accounts) as total_accounts,
      (SELECT COUNT(*) FROM accounts WHERE status IN ('frozen','flagged')) as flagged_accounts,
      (SELECT COUNT(*) FROM transactions) as total_transactions,
      (SELECT COUNT(*) FROM transactions WHERE is_flagged = 1) as flagged_transactions,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions) as total_volume,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE is_flagged = 1) as flagged_volume,
      (SELECT COUNT(*) FROM alerts WHERE status = 'open') as open_alerts,
      (SELECT COALESCE(AVG(risk_score), 0) FROM accounts WHERE risk_score > 0) as avg_risk_score
  `),

  // Transaction count by type
  getTxnByType: db.prepare(`
    SELECT type, COUNT(*) as count, SUM(amount) as volume FROM transactions GROUP BY type
  `),

  // Risk distribution
  getRiskDistribution: db.prepare(`
    SELECT 
      CASE 
        WHEN risk_score <= 20 THEN '0-20'
        WHEN risk_score <= 40 THEN '21-40'
        WHEN risk_score <= 60 THEN '41-60'
        WHEN risk_score <= 80 THEN '61-80'
        ELSE '81-100'
      END as bucket,
      COUNT(*) as count
    FROM transactions WHERE risk_score > 0
    GROUP BY bucket
    ORDER BY bucket
  `),

  // Timeline data (hourly aggregation of flagged txns)
  getFlaggedTimeline: db.prepare(`
    SELECT 
      strftime('%Y-%m-%d %H:00', timestamp) as hour,
      COUNT(*) as count,
      SUM(amount) as volume
    FROM transactions
    WHERE is_flagged = 1
    GROUP BY hour
    ORDER BY hour DESC
    LIMIT 48
  `),

  // Total transactions count
  getTotalTxnCount: db.prepare(`SELECT COUNT(*) as count FROM transactions`),
};

// ============================================================
// Export database instance and prepared statements
// ============================================================
export { db, stmts };
export default db;
