# 07 — Graph Analysis Engine

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Why Graph Analysis?](#why-graph-analysis)
- [Graph Structure](#graph-structure)
- [Initialization](#initialization)
- [Live Updates](#live-updates)
- [Computed Metrics](#computed-metrics)
- [Mule Pattern Detection](#mule-pattern-detection)
- [Graph Features Used in ML Scoring](#graph-features-used-in-ml-scoring)
- [D3.js Visualization](#d3js-visualization)

---

## Why Graph Analysis?

Traditional fraud detection looks at individual transactions in isolation. **Graph analysis** looks at the *network of relationships* between accounts. Mule networks have distinctive graph topologies:

```
Normal person's transaction network:      Mule account's transaction network:

  salary      grocery                    victim1   victim2   victim3
    │            │                          │         │         │
    └────[YOU]───┘                          └──────[MULE]──────┘
         │                                           │
         │ rent                                      │ (all sent to one account)
         ▼                                           ▼
       landlord                                  layering_account
```

The mule's graph has:
- High **in-degree** (many accounts sending money TO the mule)
- Low **out-degree** (all money going to ONE account)
- Very few **triangles** (not socially connected — isolated hub)

---

## Graph Structure

`server/ml/graph-analyzer.js` maintains an **in-memory directed weighted graph**:

```javascript
const graph = {
  // Map of accountId → array of {to, count, amount}
  adjacencyList: new Map(),
  
  // Per-account aggregated stats
  accountStats: new Map(),
  // accountStats.get(accountId) = {
  //   inDegree: 14,          // unique senders
  //   outDegree: 3,          // unique receivers
  //   totalReceived: 380000, // ₹ received
  //   totalSent: 355000,     // ₹ sent
  //   txnTimestamps: [...]   // for velocity computation
  // }
}
```

---

## Initialization

On server startup, the graph is loaded from the `account_connections` table:

```javascript
export function initGraph() {
  // Load all persisted connections from DB
  const connections = stmts.getAllConnections.all();
  
  connections.forEach(conn => {
    // Add to adjacency list
    addEdge(conn.source_account_id, conn.dest_account_id, conn.txn_count, conn.total_amount);
  });
  
  console.log(`[GRAPH] Initialized with ${graph.adjacencyList.size} nodes and ${connections.length} edges`);
}
```

---

## Live Updates

Every new transaction updates the graph immediately:

```javascript
export function updateGraph(transaction) {
  const { sender_account_id, receiver_account_id, amount, type } = transaction;
  
  // 1. Add/update edge
  addEdge(sender_account_id, receiver_account_id, 1, amount);
  
  // 2. Update sender stats (outgoing)
  updateAccountStats(sender_account_id, {
    sentAmount: amount,
    sentTo: receiver_account_id,
    channel: type
  });
  
  // 3. Update receiver stats (incoming)
  updateAccountStats(receiver_account_id, {
    receivedAmount: amount,
    receivedFrom: sender_account_id,
    channel: type
  });
  
  // 4. Persist to DB (upsert)
  stmts.upsertConnection.run({
    source: sender_account_id,
    dest: receiver_account_id,
    txn_count: 1,
    amount: amount
  });
}
```

---

## Computed Metrics

### In-Degree (Fan-in detection)

```javascript
export function getInDegree(accountId, hours = 24) {
  const cutoff = Date.now() - (hours * 3600 * 1000);
  const stats = graph.accountStats.get(accountId);
  
  // Count unique senders within the time window
  const uniqueSenders = new Set(
    stats.incomingTxns
      .filter(t => t.timestamp > cutoff)
      .map(t => t.fromAccountId)
  );
  
  return uniqueSenders.size;  // e.g. 14
}
```

### Out-Degree (Fan-out detection)

```javascript
export function getOutDegree(accountId, hours = 24) {
  // Count unique receivers in last N hours
  const uniqueReceivers = new Set(
    stats.outgoingTxns
      .filter(t => t.timestamp > cutoff)
      .map(t => t.toAccountId)
  );
  return uniqueReceivers.size;
}
```

### Passthrough Ratio

```javascript
export function getPassthroughRatio(accountId, hours = 24) {
  const stats = graph.accountStats.get(accountId);
  
  const received = stats.incomingTxns
    .filter(t => t.timestamp > cutoff)
    .reduce((sum, t) => sum + t.amount, 0);
    
  const sent = stats.outgoingTxns
    .filter(t => t.timestamp > cutoff)
    .reduce((sum, t) => sum + t.amount, 0);
    
  return received > 0 ? sent / received : 0;
  // 0.93 = mule (forwards 93% of received funds)
  // 0.30 = normal person (spends 30% of received)
}
```

### Clustering Coefficient

A measure of how interconnected an account's neighbors are. Normal people's neighbors (friends, family) often know each other. Mules are isolated hubs — their senders don't know each other.

```javascript
export function getClusteringCoefficient(accountId) {
  const neighbors = getNeighbors(accountId);
  if (neighbors.length < 2) return 0;
  
  let triangles = 0;
  // Check if any two neighbors are also connected to each other
  for (let i = 0; i < neighbors.length; i++) {
    for (let j = i + 1; j < neighbors.length; j++) {
      if (hasEdge(neighbors[i], neighbors[j])) {
        triangles++;
      }
    }
  }
  
  const possibleTriangles = (neighbors.length * (neighbors.length - 1)) / 2;
  return triangles / possibleTriangles;
  // 0.8 = highly clustered (normal social network)
  // 0.05 = isolated hub (mule network)
}
```

---

## Mule Pattern Detection

### Pattern 1: Fan-in (Aggregation)

```
victim1 ──₹10,000──→ ┐
victim2 ──₹15,000──→ MULE ──₹80,000──→ layering_account
victim3 ──₹25,000──→ ┘
victim4 ──₹30,000──→ ┘
```

**Detection:** `unique_senders_24h > 10`

---

### Pattern 2: Immediate Pass-through

```
₹45,000 received at 3:15:00 AM (via UPI)
₹42,000 sent    at 3:17:23 AM (via NEFT)

Time delta: 143 seconds → immediate_passthrough = 1
```

---

### Pattern 3: Layering Chain

```
A ──→ B ──→ C ──→ D ──→ E

All within 30 minutes, each forwarding ~90% of received amount
```

The graph analyzer detects chains by doing a **BFS from B** and finding if C, D, E are also high-passthrough accounts recently active.

---

### Pattern 4: Split Withdrawal (Structuring)

```
₹1,00,000 received
   ├─ ₹48,000 sent to account1 (below ₹50K threshold)
   ├─ ₹48,000 sent to account2 (below ₹50K threshold)
   └─ ₹4,000  kept
```

Detected by `is_near_threshold = 1` and `unique_receivers_24h > 1`.

---

## Graph Features Used in ML Scoring

The graph analyzer provides 3 of the 19 features to the ML model:

| Feature | Source | Weight |
|---------|--------|--------|
| `unique_senders_24h` | `getInDegree(accountId, 24)` | High (fan-in signal) |
| `unique_receivers_24h` | `getOutDegree(accountId, 24)` | Medium (fan-out signal) |
| `passthrough_ratio` | `getPassthroughRatio(accountId, 24)` | Very High (key mule signal) |

The `linked_to_flagged` feature also uses graph data:

```javascript
const neighbors = getNeighbors(receiverAccountId);
featureMap.linked_to_flagged = neighbors.some(id => {
  const acc = stmts.getAccount.get(id);
  return acc?.status === 'flagged' || acc?.status === 'frozen';
}) ? 1 : 0;
```

---

## D3.js Visualization

The `GET /api/dashboard/graph` endpoint returns the graph in D3-compatible format.

The React dashboard (`client/src/pages/NetworkGraph.jsx`) renders it as a **force-directed graph** where:

- **Node size** = account `risk_score` (larger = riskier)
- **Node color** = status:
  - 🟢 Green = `active` (normal)
  - 🟡 Amber = `under_review`
  - 🔴 Red = `flagged`
  - ⬛ Dark = `frozen`
- **Edge thickness** = `txn_count` (thicker edge = more transactions between these accounts)
- **Edge color** = `total_amount` (gradient: low=blue, high=red)

**Force simulation parameters:**
```javascript
d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(d => d.id).distance(80))
  .force('charge', d3.forceManyBody().strength(-200))  // Repulsion
  .force('center', d3.forceCenter(width/2, height/2))
  .force('collision', d3.forceCollide(25));
```

Clicking on a node opens an account detail panel showing risk score, recent transactions, and the AI explanation.

---

## C-DAC Multi-Case Syndication Discovery (The 7 Bridges)

When graph traversal was executed across all **494,276 records** and **308,722 nodes** in the 25 C-DAC Statement of Accounts (SOA) statements, it uncovered that the 25 cases were **not isolated star graphs**:

* **56,386 Counterparties (18.3% of the network)** are shared between 2 or more separate investigated case subjects!
* **The 7 Major Cross-Statement Syndication Bridges**:

| Bridge | Case Subject 1 | Case Subject 2 | Shared Counterparties | Forensic Significance |
| :---: | :--- | :--- | :---: | :--- |
| **Bridge 1** | **Tanish Mukherjee** (`26_SOA`) | **Rachana Dhar** (`48_SOA`) | **55,702** | Massive shared commercial/layering infrastructure |
| **Bridge 2** | **Vivaan Shah** (`4_SOA`) | **Aditya Sethi** (`5_SOA`) | **365** | Interconnected mule cluster |
| **Bridge 3** | **Kabir Arora** (`2_SOA`) | **Vivaan Shah** (`4_SOA`) | **255** | Triad syndicate member |
| **Bridge 4** | **Kabir Arora** (`2_SOA`) | **Aditya Sethi** (`5_SOA`) | **93** | Triad syndicate member |
| **Bridge 5** | **Jack Patil** (`6_SOA`) | **Wakeeta Sheth** (`7_SOA`) | **67** | Cross-statement counterparty sharing |
| **Bridge 6** | **Qushi Chaudhary** (`8_SOA`) | **Faras Swaminathan** (`9_SOA`) | **11** | High-velocity funnel link |
| **Bridge 7** | **Jack Patil** (`6_SOA`) | **Faras Swaminathan** (`9_SOA`) | **1** | Multi-case cross link |

In the interactive UI (`client/src/pages/NetworkGraph.jsx`), analysts can click **`🕸️ C-DAC Syndication Bridges`** to filter directly to these cross-case connected clusters and view directional fund flow in 2D or 3D force physics.

