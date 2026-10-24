# 02 — Database: Schema, Seeding & Queries

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Database Engine](#database-engine)
- [Initialization](#initialization)
- [Table Schemas](#table-schemas)
- [Relationships](#relationships)
- [Seeding the Database](#seeding-the-database)
- [Prepared Statements Reference](#prepared-statements-reference)
- [Common Queries](#common-queries)
- [Reset & Re-seed](#reset--re-seed)

---

## Database Engine

**Native SQLite** via Node.js built-in `node:sqlite` (`DatabaseSync`) with automatic fallback to `better-sqlite3`.

Why Native SQLite?
- **Zero C++ compiler required** — no Visual Studio, Python `node-gyp`, or native build toolchain needed on Windows
- **Built into Node.js** — works out-of-the-box on Node 22.5+ and Node 24+
- **Synchronous & Fast** — sub-millisecond execution times without async thread pool overhead
- **File-based** — the entire database resides in `data/anviksha.db` (easy to inspect, reset, backup)
- **Automatic Parameter Sanitization** — wrapped prepared statements ensure strict named-parameter compatibility

The database file is created automatically at `data/anviksha.db` on first server startup or when running `npm run seed`.

---

## Initialization

`server/db/index.js` handles:
1. Creating the `data/` directory if it doesn't exist
2. Opening/creating the SQLite file
3. Running `schema.sql` to create all tables (uses `CREATE TABLE IF NOT EXISTS`)
4. Creating all prepared statements for fast repeated queries
5. Exporting: `db` (raw connection) and `stmts` (all prepared statements)

```javascript
import { db, stmts } from './db/index.js';

// Use prepared statements for all operations:
const account = stmts.getAccount.get(accountId);
stmts.insertTransaction.run(transaction);
stmts.updateAccountRisk.run({ risk_score: 75.2, status: 'flagged', id: accountId });
```

---

## Table Schemas

### `accounts` — Bank accounts being monitored

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id               TEXT PRIMARY KEY,          -- UUID
  account_number   TEXT NOT NULL UNIQUE,      -- 10-digit number
  account_holder   TEXT NOT NULL,             -- Full name
  ifsc_code        TEXT NOT NULL,             -- e.g. BKID0001234
  bank_name        TEXT NOT NULL,             -- e.g. Bank of India
  upi_id           TEXT,                      -- e.g. ravi23@oksbi
  phone            TEXT,                      -- +91XXXXXXXXXX
  account_type     TEXT DEFAULT 'savings',    -- savings / current / salary
  kyc_status       TEXT DEFAULT 'verified',   -- verified / pending / failed
  opened_date      TEXT,                      -- ISO datetime
  risk_score       REAL DEFAULT 0,            -- Current score 0-100
  status           TEXT DEFAULT 'active',     -- active / under_review / flagged / frozen
  is_mule          INTEGER DEFAULT 0,         -- Ground truth: 0=normal, 1=mule (hidden in UI)
  created_at       TEXT DEFAULT (datetime('now'))
);
```

**Key columns:**
- `risk_score` is updated via EMA every time a new transaction is scored: `newScore = 0.3 × txnScore + 0.7 × prevScore`
- `status` transitions: `active` → `under_review` (score ≥ 41) → `flagged` (score ≥ 71) → `frozen` (manual)
- `is_mule` is the hidden ground truth label set during seeding — not shown in the UI, used for evaluation

---

### `transactions` — All financial transactions

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id                   TEXT PRIMARY KEY,       -- UUID
  txn_ref              TEXT NOT NULL UNIQUE,   -- Bank reference (TXN20260608...)
  type                 TEXT NOT NULL,          -- UPI / NEFT / IMPS / ATM / RTGS
  amount               REAL NOT NULL,          -- Amount in ₹
  sender_account_id    TEXT NOT NULL,          -- FK → accounts.id
  receiver_account_id  TEXT NOT NULL,          -- FK → accounts.id
  channel              TEXT DEFAULT 'digital', -- digital / branch / atm
  description          TEXT,                   -- Payment note
  timestamp            TEXT DEFAULT (datetime('now')),
  risk_score           REAL DEFAULT 0,         -- ML score for this specific transaction
  is_flagged           INTEGER DEFAULT 0,      -- 1 if score >= 41
  features_json        TEXT,                   -- JSON of all 19 extracted features
  ml_scores_json       TEXT                    -- JSON: {velocity, behavioral, graph, regulatory, anomaly}
);
```

**Key columns:**
- `features_json` stores all 19 feature values at the time of scoring — used for explainability
- `ml_scores_json` stores the sub-scores breakdown for the analytics dashboard
- `is_flagged` is pre-computed (score ≥ 41) for fast filtering queries

---

### `alerts` — Escalated fraud alerts

```sql
CREATE TABLE IF NOT EXISTS alerts (
  id              TEXT PRIMARY KEY,
  alert_type      TEXT DEFAULT 'ml_flag',   -- ml_flag / regulatory / analyst
  severity        TEXT DEFAULT 'medium',    -- medium / high / critical
  account_id      TEXT NOT NULL,            -- FK → accounts.id
  txn_id          TEXT,                     -- FK → transactions.id (nullable for account-level alerts)
  title           TEXT NOT NULL,            -- Short headline
  description     TEXT,                     -- Detailed description
  ai_explanation  TEXT,                     -- Gemini or template text
  status          TEXT DEFAULT 'open',      -- open / acknowledged / resolved
  created_at      TEXT DEFAULT (datetime('now'))
);
```

**Severity thresholds:**
- `medium`: score 41–54
- `high`: score 55–70
- `critical`: score ≥ 71

**`ai_explanation`** is populated for score ≥ 65 by `server/ml/explainer.js`. For lower scores it's left null and the description text is used.

---

### `suspect_registry` — I4C/NCRP/1930 blacklist

```sql
CREATE TABLE IF NOT EXISTS suspect_registry (
  id                TEXT PRIMARY KEY,
  identifier_type   TEXT NOT NULL,    -- phone / upi / account / device
  identifier_value  TEXT NOT NULL,    -- The actual value (+91987..., ravi@oksbi, etc.)
  source            TEXT NOT NULL,    -- I4C / NCRP / 1930_helpline / RBI_DPIP
  complaint_ref     TEXT,             -- e.g. NCRP/2026/100001
  reason            TEXT,             -- Investment fraud, phishing, loan scam, etc.
  reported_at       TEXT,
  status            TEXT DEFAULT 'active',  -- active / resolved
  created_at        TEXT DEFAULT (datetime('now')),
  UNIQUE(identifier_type, identifier_value)  -- No duplicate entries
);
```

**How it's used in scoring:**
The feature extractor checks the receiver account's `phone`, `upi_id`, and `account_number` against this table. A match sets `suspect_registry_match = 1`, which contributes **60 points** to the regulatory sub-score — the highest weight of any single feature.

```javascript
// In feature-extractor.js:
const suspectMatch = stmts.checkSuspectRegistry.get({
  phone: account.phone,
  upi: account.upi_id,
  account: account.account_number
});
featureMap.suspect_registry_match = suspectMatch ? 1 : 0;
```

---

### `risk_scores` — Audit trail of all ML scoring events

```sql
CREATE TABLE IF NOT EXISTS risk_scores (
  id                TEXT PRIMARY KEY,
  account_id        TEXT NOT NULL,         -- FK → accounts.id
  txn_id            TEXT NOT NULL,         -- FK → transactions.id
  composite_score   REAL NOT NULL,         -- Final 0-100 score
  velocity_score    REAL DEFAULT 0,        -- Velocity sub-score
  behavioral_score  REAL DEFAULT 0,        -- Behavioral sub-score
  graph_score       REAL DEFAULT 0,        -- Graph sub-score
  regulatory_score  REAL DEFAULT 0,        -- Regulatory sub-score
  anomaly_score     REAL DEFAULT 0,        -- IsolationForest boost
  model_type        TEXT,                  -- 'xgboost+isolation_forest' or 'rule_based'
  features_json     TEXT,                  -- All 19 features at time of scoring
  scored_at         TEXT DEFAULT (datetime('now'))
);
```

This table is the **complete audit trail**. Every time a transaction is scored, a row is inserted here — even if the score is low. This powers:
- The risk timeline charts in the Analytics tab
- Historical feature analysis for account investigation
- Model performance evaluation

---

### `account_connections` — Pre-aggregated transaction graph edges

```sql
CREATE TABLE IF NOT EXISTS account_connections (
  source_account_id  TEXT NOT NULL,    -- Sender
  dest_account_id    TEXT NOT NULL,    -- Receiver
  txn_count          INTEGER DEFAULT 1, -- How many transactions between them
  total_amount       REAL DEFAULT 0,    -- Total ₹ transferred
  first_txn_at       TEXT,             -- First transaction datetime
  last_txn_at        TEXT,             -- Most recent datetime
  PRIMARY KEY (source_account_id, dest_account_id)
);
```

This table is the persistence layer for the network graph. It's updated with every new transaction (`UPSERT` — insert or update). On server startup, the entire graph is loaded into memory from this table via `initGraph()`.

The `GET /api/dashboard/graph` endpoint reads this table to provide D3.js with nodes and links.

---

## Relationships

```
accounts ──────────────── transactions (sender_account_id)
   │                          │
   │                     transactions (receiver_account_id)
   │
   ├──────────────────── alerts (account_id)
   │
   ├──────────────────── risk_scores (account_id)
   │
   └──────────────────── account_connections (source_account_id / dest_account_id)

transactions ────────── alerts (txn_id)
             ────────── risk_scores (txn_id)
```

---

## Seeding the Database

### Command

```bash
npm run seed
```

### What it creates

| Data | Count | Details |
|------|-------|---------|
| Normal accounts | 45 | Established (1–3 years old), KYC verified, low initial risk |
| Mule accounts | 5 | New (0–60 days), some pending KYC, elevated initial risk |
| Normal transactions | 150 | Grocery, bills, salary, peer transfers — spread over last 7 days |
| Suspicious transactions | 50 | Round amounts, mule patterns, high amounts — last 3 days |
| Suspect registry entries | ~11 | 3 from mule phones/UPIs + 5 random external suspects |
| Initial alerts | 3 | Pre-seeded on the 3 worst mule accounts |

### Mule account properties

```javascript
// In seed-data.js:
{
  account_holder: 'Ravi Dubey',          // One of 5 pre-defined mule names
  kyc_status: Math.random() < 0.3        // 30% chance of pending KYC
    ? 'pending' : 'verified',
  opened_date: randomDate(60),            // 0-60 days ago
  risk_score: 30 + Math.random() * 30,   // Starting risk: 30-60
  status: 'active',                      // Starts active — system will flag them
  is_mule: 1                             // Hidden ground truth
}
```

### Suspicious transaction patterns in seed

```javascript
// Round amounts (structuring pattern):
amount: Math.round((Math.random() * 150000 + 20000) / 1000) * 1000  // e.g. ₹49,000

// Recent timestamps (more suspicious activity is recent):
timestamp: randomDate(3)   // Last 3 days for suspicious txns

// Pre-flagged:
is_flagged: Math.random() < 0.4 ? 1 : 0   // 40% already flagged in historical data
```

### Clearing and re-seeding

The seed script always clears all data first:
```javascript
db.exec('DELETE FROM risk_scores');
db.exec('DELETE FROM alerts');
db.exec('DELETE FROM account_connections');
db.exec('DELETE FROM transactions');
db.exec('DELETE FROM suspect_registry');
db.exec('DELETE FROM accounts');
```

This means running `npm run seed` is always a **clean slate** operation. All transaction history from the running simulation is erased.

---

## Prepared Statements Reference

All queries in `server/db/index.js` are compiled once at startup as prepared statements for performance:

| Statement | Operation |
|-----------|-----------|
| `stmts.insertAccount` | Insert a new account |
| `stmts.getAccount` | Get account by ID |
| `stmts.getAllAccounts` | Get all accounts (optional status filter) |
| `stmts.updateAccountRisk` | Update risk_score + status |
| `stmts.insertTransaction` | Insert a scored transaction |
| `stmts.getTransactions` | List transactions (with filters) |
| `stmts.getAccountTransactions` | Get all transactions for one account |
| `stmts.getRecentTransactions` | Transactions in last N hours (for feature extraction) |
| `stmts.insertAlert` | Create a new alert |
| `stmts.getAlerts` | List alerts with filters |
| `stmts.updateAlert` | Update alert status |
| `stmts.insertRiskScore` | Audit trail insert |
| `stmts.getRiskTimeline` | Risk scores over time (for charts) |
| `stmts.insertSuspect` | Add suspect registry entry |
| `stmts.checkSuspectRegistry` | Check if phone/UPI/account is in registry |
| `stmts.getAllSuspects` | List all registry entries |
| `stmts.upsertConnection` | Insert or update account connection edge |
| `stmts.getAllConnections` | Load all edges (for graph init) |
| `stmts.getDashboardStats` | Aggregated counts for dashboard header |

---

## Common Queries

### Get all flagged accounts sorted by risk score
```sql
SELECT * FROM accounts
WHERE status IN ('flagged', 'frozen')
ORDER BY risk_score DESC;
```

### Get all transactions for an account in the last 24 hours
```sql
SELECT * FROM transactions
WHERE (sender_account_id = ? OR receiver_account_id = ?)
  AND timestamp > datetime('now', '-24 hours')
ORDER BY timestamp DESC;
```

### Get risk score timeline for charts
```sql
SELECT scored_at, composite_score, model_type
FROM risk_scores
WHERE account_id = ?
ORDER BY scored_at DESC
LIMIT 50;
```

### Get account network connections for D3.js
```sql
SELECT
  a1.id as source, a1.account_holder as source_name, a1.risk_score as source_risk,
  a2.id as target, a2.account_holder as target_name, a2.risk_score as target_risk,
  ac.txn_count, ac.total_amount
FROM account_connections ac
JOIN accounts a1 ON ac.source_account_id = a1.id
JOIN accounts a2 ON ac.dest_account_id = a2.id;
```

---

## Reset & Re-seed

```bash
# Method 1: Re-seed (keeps DB file, clears all data)
npm run seed

# Method 2: Full reset (delete DB file and re-seed)
del data\anviksha.db
npm run seed

# Method 3: Inspect the database with SQLite CLI
sqlite3 data/anviksha.db
sqlite> .tables
sqlite> SELECT account_holder, risk_score, status FROM accounts ORDER BY risk_score DESC;
sqlite> .quit
```
