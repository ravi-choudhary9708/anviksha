-- Anviksha Database Schema
-- SQLite-based storage for mule account detection system

-- Bank accounts being monitored
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    account_number TEXT UNIQUE NOT NULL,
    account_holder TEXT NOT NULL,
    ifsc_code TEXT NOT NULL,
    bank_name TEXT DEFAULT 'Bank of India',
    upi_id TEXT,
    phone TEXT,
    account_type TEXT CHECK(account_type IN ('savings','current','salary')) DEFAULT 'savings',
    kyc_status TEXT CHECK(kyc_status IN ('verified','pending','failed')) DEFAULT 'verified',
    opened_date TEXT NOT NULL,
    risk_score REAL DEFAULT 0,
    status TEXT CHECK(status IN ('active','frozen','flagged','under_review')) DEFAULT 'active',
    is_mule INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- All financial transactions
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    txn_ref TEXT UNIQUE NOT NULL,
    type TEXT CHECK(type IN ('UPI','NEFT','IMPS','ATM','RTGS')) NOT NULL,
    amount REAL NOT NULL,
    sender_account_id TEXT NOT NULL,
    receiver_account_id TEXT NOT NULL,
    channel TEXT DEFAULT 'digital',
    description TEXT,
    timestamp TEXT NOT NULL,
    risk_score REAL DEFAULT 0,
    is_flagged INTEGER DEFAULT 0,
    features_json TEXT,
    ml_scores_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (sender_account_id) REFERENCES accounts(id),
    FOREIGN KEY (receiver_account_id) REFERENCES accounts(id)
);

-- System alerts and analyst queue
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    alert_type TEXT CHECK(alert_type IN ('system','regulatory','analyst','ml_flag')) DEFAULT 'system',
    severity TEXT CHECK(severity IN ('low','medium','high','critical')) DEFAULT 'medium',
    account_id TEXT,
    txn_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    ai_explanation TEXT,
    status TEXT CHECK(status IN ('open','acknowledged','investigating','resolved','false_positive')) DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (txn_id) REFERENCES transactions(id)
);

-- I4C / NCRP Suspect Registry
CREATE TABLE IF NOT EXISTS suspect_registry (
    id TEXT PRIMARY KEY,
    identifier_type TEXT CHECK(identifier_type IN ('phone','upi','account','device','ip')) NOT NULL,
    identifier_value TEXT NOT NULL,
    source TEXT CHECK(source IN ('I4C','NCRP','1930_helpline','RBI_DPIP','bank_internal')) DEFAULT 'I4C',
    complaint_ref TEXT,
    reason TEXT,
    reported_at TEXT NOT NULL,
    status TEXT CHECK(status IN ('active','resolved','expired')) DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Detailed risk score breakdown per scoring event
CREATE TABLE IF NOT EXISTS risk_scores (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    txn_id TEXT,
    composite_score REAL NOT NULL,
    velocity_score REAL DEFAULT 0,
    behavioral_score REAL DEFAULT 0,
    graph_score REAL DEFAULT 0,
    regulatory_score REAL DEFAULT 0,
    anomaly_score REAL DEFAULT 0,
    model_type TEXT DEFAULT 'xgboost',
    features_json TEXT,
    scored_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (txn_id) REFERENCES transactions(id)
);

-- Account-to-account connection graph (aggregated)
CREATE TABLE IF NOT EXISTS account_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_account_id TEXT NOT NULL,
    dest_account_id TEXT NOT NULL,
    txn_count INTEGER DEFAULT 1,
    total_amount REAL DEFAULT 0,
    first_txn_at TEXT,
    last_txn_at TEXT,
    UNIQUE(source_account_id, dest_account_id),
    FOREIGN KEY (source_account_id) REFERENCES accounts(id),
    FOREIGN KEY (dest_account_id) REFERENCES accounts(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_txn_sender ON transactions(sender_account_id);
CREATE INDEX IF NOT EXISTS idx_txn_receiver ON transactions(receiver_account_id);
CREATE INDEX IF NOT EXISTS idx_txn_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_txn_flagged ON transactions(is_flagged);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_account ON alerts(account_id);
CREATE INDEX IF NOT EXISTS idx_suspect_value ON suspect_registry(identifier_value);
CREATE INDEX IF NOT EXISTS idx_risk_account ON risk_scores(account_id);
CREATE INDEX IF NOT EXISTS idx_connections_source ON account_connections(source_account_id);
CREATE INDEX IF NOT EXISTS idx_connections_dest ON account_connections(dest_account_id);
