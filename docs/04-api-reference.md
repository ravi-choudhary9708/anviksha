# 04 — API Routes Reference

> **Anviksha** | Bank of India Hackathon 2026  
> Base URL: `http://localhost:3001`

---

## Table of Contents
- [Health Check](#health-check)
- [Transactions](#transactions)
- [Accounts](#accounts)
- [Alerts](#alerts)
- [Dashboard](#dashboard)
- [Regulatory Feeds](#regulatory-feeds)
- [Error Responses](#error-responses)
- [Testing APIs on Windows](#testing-apis-on-windows)

---

## Health Check

### `GET /api/health`

Returns server and ML engine status. Use this to verify the server is running and which ML mode is active.

**Response:**
```json
{
  "status": "ok",
  "service": "Anviksha Fraud Detection API",
  "version": "1.0.0",
  "timestamp": "2026-06-08T05:44:32.571Z",
  "wsClients": 2
}
```

---

## Transactions

### `POST /api/transactions`
Ingest a new transaction and run it through the full ML scoring pipeline.

**Request Body:**
```json
{
  "type": "UPI",
  "amount": 45000,
  "sender_account_id": "uuid-of-sender",
  "receiver_account_id": "uuid-of-receiver",
  "channel": "digital",
  "description": "Fund transfer"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "transaction": {
    "id": "uuid",
    "txn_ref": "TXN20260608123456",
    "type": "UPI",
    "amount": 45000,
    "risk_score": 87.3,
    "is_flagged": 1,
    "features_json": "{...}",
    "ml_scores_json": "{...}"
  },
  "scoring": {
    "compositeScore": 87.3,
    "velocityScore": 95,
    "behavioralScore": 80,
    "graphScore": 90,
    "regulatoryScore": 60,
    "anomalyScore": 15,
    "modelType": "xgboost+isolation_forest",
    "riskLevel": "critical",
    "action": "freeze_and_alert"
  }
}
```

---

### `GET /api/transactions`
List transactions with optional filters.

**Query Parameters:**

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `flagged` | boolean | `?flagged=true` | Only return flagged transactions |
| `account_id` | string | `?account_id=uuid` | Transactions for a specific account |
| `type` | string | `?type=UPI` | Filter by channel type |
| `limit` | number | `?limit=50` | Max results (default: 50) |
| `offset` | number | `?offset=100` | Pagination offset |

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "txn_ref": "TXN...",
      "type": "NEFT",
      "amount": 125000,
      "risk_score": 91.2,
      "is_flagged": 1,
      "timestamp": "2026-06-08T03:24:11Z",
      "sender": { "id": "...", "account_holder": "Aarav Sharma", "account_number": "..." },
      "receiver": { "id": "...", "account_holder": "Ravi Dubey", "account_number": "..." }
    }
  ],
  "total": 301,
  "flagged": 19
}
```

---

### `GET /api/transactions/:id`
Get a single transaction with full feature breakdown.

**Response:**
```json
{
  "transaction": { ... },
  "features": {
    "txn_count_1h": 12,
    "txn_count_24h": 47,
    "amount_received_1h": 380000,
    "amount_sent_1h": 355000,
    "avg_time_between_txns": 180,
    "is_off_hours": 1,
    "is_round_amount": 1,
    "is_near_threshold": 0,
    "immediate_passthrough": 1,
    "cross_channel_mixing": 1,
    "account_age_days": 23,
    "is_new_account": 1,
    "no_prior_history": 0,
    "previously_flagged": 0,
    "unique_senders_24h": 14,
    "unique_receivers_24h": 3,
    "passthrough_ratio": 0.93,
    "suspect_registry_match": 1,
    "linked_to_flagged": 1
  },
  "mlScores": {
    "velocity": 95,
    "behavioral": 80,
    "graph": 90,
    "regulatory": 100,
    "anomaly": 18,
    "composite": 91.2,
    "modelType": "xgboost+isolation_forest"
  }
}
```

---

## Accounts

### `GET /api/accounts`
List all accounts with risk scores.

**Query Parameters:**

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `status` | string | `?status=flagged` | Filter: active/under_review/flagged/frozen |
| `sort` | string | `?sort=risk_score` | Sort field (default: risk_score DESC) |
| `limit` | number | `?limit=20` | Max results |

**Response:**
```json
{
  "accounts": [
    {
      "id": "uuid",
      "account_number": "4821763901",
      "account_holder": "Ravi Dubey",
      "bank_name": "Bank of India",
      "upi_id": "ravi23@oksbi",
      "account_type": "savings",
      "kyc_status": "verified",
      "opened_date": "2026-04-15T00:00:00Z",
      "risk_score": 87.4,
      "status": "flagged"
    }
  ],
  "total": 50,
  "flagged": 3,
  "frozen": 1
}
```

---

### `GET /api/accounts/:id`
Get full account profile with history, connections, and risk timeline.

**Response:**
```json
{
  "account": { ...account fields... },
  "recentTransactions": [ ...last 20 transactions... ],
  "connections": [
    { "accountId": "...", "accountHolder": "...", "txnCount": 8, "totalAmount": 340000 }
  ],
  "riskTimeline": [
    { "scored_at": "2026-06-08T03:00:00Z", "composite_score": 45.2 },
    { "scored_at": "2026-06-08T03:15:00Z", "composite_score": 67.8 }
  ],
  "latestAlert": { ...most recent alert for this account... },
  "suspectRegistryMatches": [ ...any matching registry entries... ]
}
```

---

### `POST /api/accounts/:id/freeze`
Freeze an account (manual analyst action).

**Request Body:** (empty)

**Response:**
```json
{ "success": true, "account": { "id": "...", "status": "frozen" } }
```

After freezing, a WebSocket broadcast is sent to all dashboard clients with the updated account status.

---

### `POST /api/accounts/:id/unfreeze`
Unfreeze an account and set it back to `under_review`.

**Response:**
```json
{ "success": true, "account": { "id": "...", "status": "under_review" } }
```

---

## Alerts

### `GET /api/alerts`
List all alerts with optional filters.

**Query Parameters:**

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `status` | string | `?status=open` | Filter by status: open/acknowledged/resolved |
| `severity` | string | `?severity=critical` | Filter: medium/high/critical |
| `account_id` | string | `?account_id=uuid` | Alerts for specific account |
| `limit` | number | `?limit=20` | Max results |

**Response:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "alert_type": "ml_flag",
      "severity": "critical",
      "title": "🚨 CRITICAL: Mule account pattern detected — 4821763901",
      "description": "Transaction of ₹1,25,000 via NEFT. Risk score: 91.2/100. Action: freeze_and_alert.",
      "ai_explanation": "Account ACC-4821 received ₹3.2L from 14 different accounts...",
      "status": "open",
      "created_at": "2026-06-08T03:24:15Z",
      "account": { "account_holder": "Ravi Dubey", "risk_score": 87.4 }
    }
  ],
  "total": 24,
  "stats": {
    "open": 3,
    "critical": 2,
    "high": 1,
    "medium": 0
  }
}
```

---

### `PATCH /api/alerts/:id`
Update alert status (acknowledge or resolve).

**Request Body:**
```json
{ "status": "acknowledged" }
// or
{ "status": "resolved" }
```

**Response:**
```json
{ "success": true, "alert": { "id": "...", "status": "acknowledged" } }
```

---

### `GET /api/alerts/stats`
Get aggregated alert statistics for the dashboard.

**Response:**
```json
{
  "total": 24,
  "open_count": 3,
  "acknowledged_count": 8,
  "resolved_count": 13,
  "critical_count": 2,
  "high_count": 1,
  "medium_count": 0
}
```

---

## Dashboard

### `GET /api/dashboard/stats`
Main aggregated metrics. Called on dashboard load and periodically refreshed.

**Response:**
```json
{
  "total_accounts": 50,
  "flagged_accounts": 3,
  "total_transactions": 301,
  "flagged_transactions": 19,
  "total_volume": 8780108,
  "flagged_volume": 1942000,
  "open_alerts": 3,
  "avg_risk_score": 5.58,
  "txnByType": [
    { "type": "ATM",  "count": 9,   "volume": 127410   },
    { "type": "IMPS", "count": 70,  "volume": 2737195  },
    { "type": "NEFT", "count": 66,  "volume": 3872173  },
    { "type": "UPI",  "count": 151, "volume": 2027783  }
  ],
  "riskDistribution": [
    { "bucket": "0-20",  "count": 251 },
    { "bucket": "21-40", "count": 6   },
    { "bucket": "41-60", "count": 25  },
    { "bucket": "61-80", "count": 14  },
    { "bucket": "81-100","count": 5   }
  ],
  "alertStats": {
    "total": 3,
    "open_count": 3,
    "critical_count": 2,
    "high_count": 1
  },
  "mlEngine": "XGBoost + Isolation Forest (ONNX)",
  "serverTime": "2026-06-08T05:44:47.052Z"
}
```

---

### `GET /api/dashboard/graph`
Returns network graph data formatted for D3.js force-directed graph.

**Response:**
```json
{
  "nodes": [
    {
      "id": "uuid",
      "label": "Ravi Dubey",
      "account_number": "4821763901",
      "risk_score": 87.4,
      "status": "flagged",
      "account_type": "savings"
    }
  ],
  "links": [
    {
      "source": "uuid-sender",
      "target": "uuid-receiver",
      "txn_count": 8,
      "total_amount": 340000,
      "value": 8
    }
  ]
}
```

---

### `GET /api/dashboard/timeline`
Risk score timeline for line charts. Returns risk score history over the last 24 hours.

**Response:**
```json
{
  "timeline": [
    { "hour": "2026-06-08T00:00:00Z", "avg_score": 12.3, "flagged_count": 0 },
    { "hour": "2026-06-08T01:00:00Z", "avg_score": 45.8, "flagged_count": 2 }
  ]
}
```

---

## Regulatory Feeds

### `GET /api/regulatory/suspect-registry`
Get all entries in the suspect registry.

**Query Parameters:**
- `source` — Filter by source: `I4C`, `NCRP`, `1930_helpline`, `RBI_DPIP`
- `type` — Filter by type: `phone`, `upi`, `account`, `device`
- `status` — Filter by status: `active`, `resolved`

**Response:**
```json
{
  "entries": [
    {
      "id": "uuid",
      "identifier_type": "phone",
      "identifier_value": "+919876543210",
      "source": "I4C",
      "complaint_ref": "NCRP/2026/100001",
      "reason": "Reported in online financial fraud — UPI phishing scheme",
      "reported_at": "2026-05-25T00:00:00Z",
      "status": "active"
    }
  ],
  "total": 11
}
```

---

### `POST /api/regulatory/suspect-registry`
Add a new suspect registry entry (simulates an I4C feed update).

**Request Body:**
```json
{
  "identifier_type": "upi",
  "identifier_value": "fraudster@paytm",
  "source": "NCRP",
  "complaint_ref": "NCRP/2026/200001",
  "reason": "Investment fraud — fake trading app",
  "reported_at": "2026-06-08T10:00:00Z"
}
```

**Response:**
```json
{ "success": true, "entry": { ...inserted entry... } }
```

Adding a new entry triggers an immediate re-check of all active accounts — if any account's phone/UPI/account matches the new entry, their `suspect_registry_match` feature becomes 1 on the next transaction.

---

### `GET /api/regulatory/feed-status`
Returns simulated status of all regulatory feed connections.

**Response:**
```json
{
  "feeds": [
    { "name": "I4C Suspect Registry",    "status": "connected", "lastUpdate": "2026-06-08T05:30:00Z", "entriesCount": 11 },
    { "name": "NCRP Complaint Feed",     "status": "connected", "lastUpdate": "2026-06-08T05:15:00Z", "entriesCount": 6  },
    { "name": "1930 Helpline",           "status": "connected", "lastUpdate": "2026-06-08T04:55:00Z", "entriesCount": 3  },
    { "name": "RBI DPIP",               "status": "degraded",  "lastUpdate": "2026-06-08T03:00:00Z", "entriesCount": 1  }
  ]
}
```

---

## Error Responses

All errors return a consistent JSON structure:

```json
{
  "error": true,
  "message": "Account not found",
  "code": "NOT_FOUND"
}
```

| HTTP Status | When |
|------------|------|
| 200 OK | Successful GET |
| 201 Created | Successful POST |
| 400 Bad Request | Missing or invalid request body |
| 404 Not Found | Resource doesn't exist |
| 500 Internal Server Error | Unexpected server error |

---

## Testing APIs on Windows

Since `curl` may not work in PowerShell, use `Invoke-RestMethod`:

```powershell
# GET request
Invoke-RestMethod -Uri "http://localhost:3001/api/dashboard/stats" | ConvertTo-Json

# POST request
$body = @{ type="UPI"; amount=45000; sender_account_id="uuid"; receiver_account_id="uuid" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/transactions" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json

# PATCH request
$body = @{ status="acknowledged" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/alerts/uuid-here" -Method PATCH -Body $body -ContentType "application/json" | ConvertTo-Json
```
