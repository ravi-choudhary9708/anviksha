# 05 — WebSocket Events Reference

> **Anviksha** | Bank of India Hackathon 2026  
> WebSocket URL: `ws://localhost:3001`

---

## Table of Contents
- [Connecting](#connecting)
- [Event Types](#event-types)
- [init Event](#init-event)
- [transaction Event](#transaction-event)
- [alert Event](#alert-event)
- [suspect_registry Event](#suspect_registry-event)
- [How the Dashboard Uses Events](#how-the-dashboard-uses-events)
- [Reconnection Logic](#reconnection-logic)
- [Testing WebSockets](#testing-websockets)

---

## Connecting

The WebSocket server runs on the **same port as the HTTP server** (3001). This is achieved using the `ws` package attached to the Node.js `http.Server` instance.

```javascript
// Client-side connection (from App.jsx):
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  console.log('Connected to Anviksha live feed');
};

ws.onmessage = (event) => {
  const { type, data, timestamp } = JSON.parse(event.data);
  // Handle event based on type
};

ws.onclose = () => {
  // Auto-reconnect after 3 seconds
  setTimeout(connect, 3000);
};
```

All messages follow this wrapper format:
```json
{
  "type": "event_name",
  "data": { ... },
  "timestamp": "2026-06-08T05:44:32.571Z"
}
```

---

## Event Types

| Event | When it's sent | Frequency |
|-------|---------------|-----------|
| `init` | Immediately on WebSocket connection | Once per connection |
| `transaction` | Every time a transaction is processed | Every 2 seconds (SIMULATION_INTERVAL) |
| `alert` | When a transaction scores ≥ 41 | Variable — depends on fraud rate |
| `suspect_registry` | When a new I4C/NCRP entry is added | Every ~45 seconds (random) |

---

## `init` Event

Sent immediately when a client connects. Provides the current dashboard state so the UI can populate without waiting for the first `transaction` event.

```json
{
  "type": "init",
  "data": {
    "total_accounts": 50,
    "flagged_accounts": 3,
    "total_transactions": 301,
    "flagged_transactions": 19,
    "total_volume": 8780108,
    "flagged_volume": 1942000,
    "open_alerts": 3,
    "avg_risk_score": 5.58,
    "txnByType": [...],
    "riskDistribution": [...],
    "alertStats": {...},
    "mlEngine": "XGBoost + Isolation Forest (ONNX)"
  },
  "timestamp": "2026-06-08T05:44:32.571Z"
}
```

**Dashboard action:** Populates the stats bar in the Header component and initializes chart data.

---

## `transaction` Event

Emitted after every transaction completes the full ML pipeline (scoring, DB insert, graph update). This is the core real-time event that drives the Live Feed tab.

```json
{
  "type": "transaction",
  "data": {
    "transaction": {
      "id": "a1b2c3d4-e5f6-...",
      "txn_ref": "TXN202606080534120045",
      "type": "UPI",
      "amount": 45000,
      "channel": "digital",
      "description": "Fund transfer",
      "timestamp": "2026-06-08T05:34:12Z",
      "risk_score": 87.3,
      "is_flagged": 1,
      "features_json": "{\"txn_count_1h\":12,\"passthrough_ratio\":0.93,...}",
      "sender": {
        "id": "uuid-sender",
        "name": "Aarav Sharma",
        "account_number": "3920148762"
      },
      "receiver": {
        "id": "uuid-receiver",
        "name": "Ravi Dubey",
        "account_number": "4821763901"
      }
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
      "action": "freeze_and_alert",
      "featureMap": {
        "txn_count_1h": 12,
        "txn_count_24h": 47,
        "amount_received_1h": 380000,
        "passthrough_ratio": 0.93,
        "suspect_registry_match": 1,
        "immediate_passthrough": 1,
        "is_off_hours": 1
      }
    }
  },
  "timestamp": "2026-06-08T05:34:12.891Z"
}
```

**Dashboard actions:**
- **LiveFeed**: Prepend to transaction list with slide-in animation; if `risk_score >= 71`, add pulse-red animation
- **Header**: Update `total_transactions` counter
- **Analytics**: Update risk distribution chart

---

## `alert` Event

Emitted when `compositeScore >= 41`. This event carries both the alert details AND the full transaction context. Only sent AFTER the alert is persisted to the database.

```json
{
  "type": "alert",
  "data": {
    "alert": {
      "id": "uuid-alert",
      "alert_type": "ml_flag",
      "severity": "critical",
      "account_id": "uuid-account",
      "txn_id": "uuid-txn",
      "title": "🚨 CRITICAL: Mule account pattern detected — 4821763901",
      "description": "Transaction of ₹45,000 via UPI. Risk score: 87.3/100. Action: freeze_and_alert.",
      "ai_explanation": "Account ACC-4821 received ₹3.2L from 14 different accounts in 47 minutes, immediately forwarding to 3 accounts. The account's phone number matches I4C Suspect Registry entry NCRP/2026/100001. Risk Score: 87.3/100. Recommended Action: FREEZE",
      "status": "open"
    },
    "account": {
      "id": "uuid-account",
      "account_holder": "Ravi Dubey",
      "account_number": "4821763901",
      "risk_score": 87.4,
      "status": "flagged"
    },
    "transaction": {
      "id": "uuid-txn",
      "amount": 45000,
      "type": "UPI",
      "risk_score": 87.3,
      "sender": { "id": "...", "name": "Aarav Sharma" },
      "receiver": { "id": "...", "name": "Ravi Dubey" }
    },
    "scoring": { ... same scoring object as transaction event ... }
  },
  "timestamp": "2026-06-08T05:34:13.102Z"
}
```

**Dashboard actions:**
- **Header**: Increment alert badge counter (red dot with number)
- **LiveFeed**: Pin this transaction to the top with red pulsing border
- **FlaggedAccounts**: Add/update the flagged account in the table
- **Browser notification** (if permission granted): Show browser notification

---

## `suspect_registry` Event

Emitted by the I4C Feed Generator when a new regulatory blacklist entry is added. Average frequency: every 45 seconds.

```json
{
  "type": "suspect_registry",
  "data": {
    "entry": {
      "id": "uuid-entry",
      "identifier_type": "phone",
      "identifier_value": "+919876543210",
      "source": "I4C",
      "complaint_ref": "NCRP/2026/300005",
      "reason": "Lottery scam — collected funds via UPI",
      "reported_at": "2026-06-08T05:30:00Z",
      "status": "active"
    }
  },
  "timestamp": "2026-06-08T05:30:00.000Z"
}
```

**Dashboard actions:**
- **RegulatoryFeeds tab**: Add new entry to the top of the registry list with a highlight animation
- **Header**: Update feed "last sync" timestamp

---

## How the Dashboard Uses Events

In `client/src/App.jsx`, all WebSocket handling is centralized:

```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  switch (msg.type) {
    case 'init':
      setStats(msg.data);
      break;
      
    case 'transaction':
      // Add to live feed (max 100 items in memory)
      setTransactions(prev => [msg.data.transaction, ...prev].slice(0, 100));
      // Update stats counter
      setStats(prev => ({ ...prev, total_transactions: prev.total_transactions + 1 }));
      break;
      
    case 'alert':
      // Increment alert badge
      setAlertCount(prev => prev + 1);
      setAlerts(prev => [msg.data.alert, ...prev].slice(0, 50));
      // Update flagged accounts list
      setFlaggedAccounts(prev => {
        const updated = prev.filter(a => a.id !== msg.data.account.id);
        return [msg.data.account, ...updated];
      });
      break;
      
    case 'suspect_registry':
      setRegistryEntries(prev => [msg.data.entry, ...prev].slice(0, 100));
      setLastRegUpdate(msg.timestamp);
      break;
  }
};
```

---

## Reconnection Logic

The dashboard automatically reconnects if the WebSocket connection drops:

```javascript
// From App.jsx:
function connect() {
  const ws = new WebSocket('ws://localhost:3001');
  
  ws.onclose = () => {
    setWsConnected(false);
    // Show "Reconnecting..." indicator in header
    setTimeout(connect, 3000);  // Retry after 3 seconds
  };
  
  ws.onopen = () => {
    setWsConnected(true);
    // Re-fetch full state via REST API to catch up on missed events
    fetchDashboardStats();
    fetchFlaggedAccounts();
  };
}
```

The green pulsing dot in the Header shows the WebSocket connection status. If it turns red, the system is reconnecting.

---

## Testing WebSockets

### Option 1: Browser Console

Open browser DevTools → Console:
```javascript
const ws = new WebSocket('ws://localhost:3001');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
// Wait 2 seconds — you should see transaction events
```

### Option 2: wscat (Node.js CLI)

```bash
npm install -g wscat
wscat -c ws://localhost:3001
# Connected — you'll see JSON events every 2 seconds
```

### Option 3: PowerShell (basic check)

```powershell
# WebSocket connection test via HTTP upgrade
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$uri = New-Object System.Uri("ws://localhost:3001")
$ws.ConnectAsync($uri, [System.Threading.CancellationToken]::None).Wait()
Write-Host "Connected: $($ws.State)"
```
