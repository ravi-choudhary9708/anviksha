# 09 — React Dashboard Guide

> **Anviksha** | Bank of India Hackathon 2026  
> Dashboard URL: `http://localhost:5173`

---

## Table of Contents
- [Design System](#design-system)
- [App Shell & State Management](#app-shell--state-management)
- [Tab 1: Live Feed](#tab-1-live-feed)
- [Tab 2: Flagged Accounts](#tab-2-flagged-accounts)
- [Tab 3: Network Graph](#tab-3-network-graph)
- [Tab 4: Analytics](#tab-4-analytics)
- [Tab 5: Regulatory Feeds](#tab-5-regulatory-feeds)
- [Shared Components](#shared-components)
- [Adding New Pages](#adding-new-pages)

---

## Design System

All design tokens are defined in `client/src/index.css`. Every component uses these variables — never hardcoded colors.

### Color Palette

```css
:root {
  /* Backgrounds */
  --bg-primary:    #0a0e27;              /* Deep navy — main background */
  --bg-secondary:  #0d1230;             /* Slightly lighter — sidebar, card borders */
  --bg-card:       rgba(255,255,255,0.04); /* Glassmorphism card surface */
  --bg-card-hover: rgba(255,255,255,0.07); /* Card hover state */
  
  /* Accent colors */
  --accent-blue:   #00d4ff;             /* Electric blue — primary actions, links */
  --accent-red:    #ff3366;             /* Danger red — critical alerts, FREEZE */
  --accent-amber:  #ffaa00;             /* Warning amber — medium risk, REVIEW */
  --accent-green:  #00ff88;             /* Success green — normal, safe */
  --accent-purple: #a855f7;             /* Purple — ML/AI indicators */
  
  /* Text */
  --text-primary:   #e8eaf6;            /* Primary text */
  --text-secondary: #8892b0;            /* Secondary/muted text */
  --text-accent:    #00d4ff;            /* Highlighted text */
  
  /* Typography */
  --font-main: 'Inter', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  
  /* Spacing */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
  
  /* Glassmorphism */
  --glass-bg:     rgba(255, 255, 255, 0.04);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-blur:   backdrop-filter: blur(20px);
}
```

### Risk Color Mapping

```css
.risk-low      { color: var(--accent-green); }  /* score 0-40 */
.risk-medium   { color: var(--accent-amber); }  /* score 41-70 */
.risk-high     { color: #ff6b35; }              /* score 71-85 */
.risk-critical { color: var(--accent-red); }    /* score 86-100 */
```

---

## App Shell & State Management

`client/src/App.jsx` is the root component. It manages:

1. **WebSocket connection** — connects to `ws://localhost:3001` on mount, reconnects on close
2. **Global state** — transactions list, alerts, flagged accounts, registry entries
3. **Tab navigation** — which page is currently active
4. **Stats** — the header stats bar (total txns, alerts, etc.)

```jsx
// Simplified App.jsx structure:
function App() {
  const [activeTab, setActiveTab] = useState('livefeed');
  const [transactions, setTransactions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [flaggedAccounts, setFlaggedAccounts] = useState([]);
  const [registryEntries, setRegistryEntries] = useState([]);
  const [stats, setStats] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  
  useEffect(() => {
    // Fetch initial data from REST APIs
    fetchDashboardStats();
    fetchFlaggedAccounts();
    fetchAlerts();
    fetchRegistryEntries();
    
    // Connect WebSocket for live updates
    connectWebSocket();
  }, []);
  
  return (
    <div className="app">
      <Header stats={stats} wsConnected={wsConnected} alertCount={alerts.filter(a => a.status === 'open').length} />
      <nav className="tabs">
        {tabs.map(tab => <TabButton key={tab.id} ... />)}
      </nav>
      <main>
        {activeTab === 'livefeed'    && <LiveFeed transactions={transactions} />}
        {activeTab === 'flagged'     && <FlaggedAccounts accounts={flaggedAccounts} />}
        {activeTab === 'network'     && <NetworkGraph />}
        {activeTab === 'analytics'   && <Analytics />}
        {activeTab === 'regulatory'  && <RegulatoryFeeds entries={registryEntries} />}
      </main>
    </div>
  );
}
```

---

## Tab 1: Live Feed

**File:** `client/src/pages/LiveFeed.jsx`

Displays a real-time scrolling list of all transactions as they arrive via WebSocket.

### Features
- **Auto-scroll** — new transactions appear at the top
- **Pause on hover** — hovering stops the auto-scroll so you can read entries
- **Risk badge** — color-coded pill next to each transaction
- **Pulse animation** — transactions with risk score ≥ 71 pulse with a red glow
- **Expandable rows** — click a transaction to see all 19 features
- **Max 100 items** — older items are removed to prevent memory growth

### Transaction Row Colors
- ✅ Green border = score 0–40 (normal)
- ⚠️ Amber border = score 41–70 (medium risk)
- 🚨 Red border + pulse = score 71–100 (critical)

### What each row shows
```
[TYPE] [SENDER → RECEIVER] [AMOUNT] [RISK SCORE] [TIME]

UPI   Aarav Sharma → Ravi Dubey   ₹45,000   87 🚨   03:24 AM
NEFT  Priya Mehta → Rajesh Kumar  ₹5,200     8 ✅   03:24 AM
```

---

## Tab 2: Flagged Accounts

**File:** `client/src/pages/FlaggedAccounts.jsx`

Shows all accounts with `risk_score > 0` sorted by risk score descending. Live updates as new accounts are flagged.

### Features
- **Risk score bar** — visual gradient bar (green→red) showing score percentage
- **Status badge** — ACTIVE / UNDER REVIEW / FLAGGED / FROZEN
- **Expandable detail panel** — click any row to expand:
  - AI explanation text
  - All 19 feature values with visual indicators
  - 5 most recent transactions
  - Direct connections (neighbor accounts)
  - Action buttons: **Freeze Account** / **Mark Resolved**
- **Sort** — can sort by risk_score, account_holder, account_age_days
- **Filter** — show only flagged, frozen, under_review

### Feature Display in Expanded Panel

Each feature is shown with:
- Name and current value
- A color indicator (red if suspicious threshold exceeded)
- A short explanation

Example expanded panel for Ravi Dubey:
```
┌─────────────────────────────────────────┐
│  Ravi Dubey — Account 4821763901        │
│  Risk Score: 87.4/100 ██████████░ 87%   │
│  Status: 🔴 FLAGGED                     │
│                                         │
│  AI EXPLANATION:                        │
│  "Account exhibits classic mule         │
│   behavior: 14 unique senders in 47     │
│   minutes, 93% pass-through ratio..."   │
│                                         │
│  ML FEATURES:                           │
│  txn_count_1h:        12  🔴 HIGH       │
│  passthrough_ratio:   93% 🔴 HIGH       │
│  unique_senders_24h:  14  🔴 HIGH       │
│  suspect_registry:    YES 🔴 MATCH      │
│  account_age_days:    23  🟡 NEW        │
│  is_off_hours:        YES 🟡 SUSPICIOUS │
│                                         │
│  [FREEZE ACCOUNT]  [MARK RESOLVED]      │
└─────────────────────────────────────────┘
```

---

## Tab 3: Network Graph

**File:** `client/src/pages/NetworkGraph.jsx`

Interactive force-directed network graph powered by D3.js v7.

### Controls
- **Zoom**: Scroll wheel
- **Pan**: Click and drag on empty space
- **Move nodes**: Click and drag individual nodes
- **Select node**: Single click → opens detail panel on right
- **Reset view**: Double-click on empty space

### Node Visual Encoding
| Color | Meaning |
|-------|---------|
| 🟢 Bright green | Active — normal account |
| 🟡 Amber | Under review |
| 🔴 Pulsing red | Flagged — mule suspected |
| ⬛ Dark gray | Frozen — analyst action taken |

Node **size** scales with `risk_score` — riskier accounts are larger and more visible.

### Edge Visual Encoding
- **Thickness**: proportional to `txn_count` (more transactions = thicker line)
- **Color**: gradient from blue (low amount) to red (high amount)
- **Arrows**: directed → shows money flow direction

### The Mule Pattern Visible in the Graph

When the simulation has been running for a few minutes, you'll see:
- Red/amber nodes (mule accounts) in the center
- Many thin arrows pointing INTO them from green nodes (victims/sources)
- One or two thick arrows pointing OUT from them to other accounts (layering)

This is the classic **fan-in** mule topology — visually obvious to judges.

---

## Tab 4: Analytics

**File:** `client/src/pages/Analytics.jsx`

Recharts-powered dashboard with 4 charts.

### Chart 1: Risk Distribution Histogram
- X-axis: Risk score buckets (0-20, 21-40, 41-60, 61-80, 81-100)
- Y-axis: Number of transactions
- Color: gradient from green (low) to red (high)

### Chart 2: Transaction Volume by Channel
- Pie chart with segments for UPI, NEFT, IMPS, ATM, RTGS
- Both count and volume shown on hover

### Chart 3: Flagged Transactions Over Time
- Line chart, last 24 hours, hourly buckets
- Shows when fraud bursts occurred

### Chart 4: Top 10 Riskiest Accounts
- Horizontal bar chart
- Bars colored by risk level (amber/red)
- Account name on Y-axis, score on X-axis

---

## Tab 5: Regulatory Feeds

**File:** `client/src/pages/RegulatoryFeeds.jsx`

### Feed Status Panel

Shows connection status for all 4 regulatory feeds:

```
┌────────────────────────────────────────────────────────┐
│  REGULATORY FEED STATUS                               │
│                                                        │
│  ● I4C Suspect Registry    CONNECTED  Last: 2min ago  │
│  ● NCRP Complaint Feed     CONNECTED  Last: 8min ago  │
│  ● 1930 Helpline Feed      CONNECTED  Last: 15min ago │
│  ● RBI DPIP                DEGRADED   Last: 3hr ago   │
└────────────────────────────────────────────────────────┘
```

- Green pulsing dot = connected
- Red dot = degraded/offline

### Suspect Registry Table

Sortable table of all entries with:
- `identifier_type`: phone / upi / account
- `identifier_value`: the actual blacklisted value
- `source`: I4C / NCRP / 1930_helpline / RBI_DPIP
- `complaint_ref`: reference number
- `reason`: why they're flagged
- `reported_at`: date

New entries added by the I4C generator slide in from the top with a highlight animation.

---

## Shared Components

### `RiskBadge` — Risk score visual pill

```jsx
// Usage:
<RiskBadge score={87.3} />

// Renders:
// 🔴 87 (pulsing red for critical)
// 🟡 55 (amber for high risk)
// 🟢 12 (green for normal)
```

### `StatCard` — Metric card in the header

```jsx
<StatCard
  label="Flagged Accounts"
  value={3}
  icon={<AlertTriangle />}
  trend="+1 today"
  color="red"
/>
```

### `TransactionRow` — Single transaction in the Live Feed

```jsx
<TransactionRow
  transaction={txn}
  onClick={() => setSelected(txn)}
  expanded={selected?.id === txn.id}
/>
```

---

## Adding New Pages

1. Create `client/src/pages/YourPage.jsx`
2. Add the tab to `App.jsx`:
```jsx
const tabs = [
  { id: 'livefeed', label: 'Live Feed', icon: <Activity /> },
  { id: 'yourpage', label: 'Your Page', icon: <YourIcon /> },  // ← add here
  ...
];
```
3. Render it in the `<main>` section:
```jsx
{activeTab === 'yourpage' && <YourPage />}
```
4. Use the design system variables in your CSS for consistent styling.
