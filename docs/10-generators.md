# 10 — Transaction & I4C Feed Generators

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Transaction Generator (DataSet Mode)](#transaction-generator-dataset-mode)
- [Simulated UI Metadata](#simulated-ui-metadata)
- [I4C Feed Generator](#i4c-feed-generator)
- [Customizing the Generators](#customizing-the-generators)

---

## Transaction Generator (DataSet Mode)

**File:** `server/generators/transaction-generator.js`

In the initial iteration of the system, this generator built synthetic behaviors (like rapid "fan-in" or "pass-through" sequences) and extracted 19 real-time graph features.

**Currently**, the system is powered entirely by the provided `DataSet.csv` containing over 9000 rows with 18 abstract features (`F115` through `F3894`) and a target variable (`F3924`).

### How It Works

1. **Pre-loading Data**: During Python training (`train_model.py`), a lightweight `dataset_features.json` file is exported.
2. **Booting**: The `transaction-generator.js` loads this JSON file into memory on startup.
3. **Sampling**: Every 2 seconds (configurable), the generator randomly selects a row from the dataset. 
4. **Fraud Probability**: The generator deliberately selects fraud rows (where `F3924 = 1`) ~10% of the time to ensure the dashboard has alerts to display. 

```javascript
// Inside transaction-generator.js
intervalHandle = setInterval(() => {
  // 10% chance of picking a fraud record
  const isFraud = Math.random() < 0.10;
  const transaction = generateTransaction(accounts, isFraud);
  
  if (transaction) {
    onTransaction(transaction);
  }
}, intervalMs);
```

---

## Simulated UI Metadata

Because `DataSet.csv` only contains abstract ML features (like `F2082`), it lacks visual metadata such as Sender Name, Receiver Name, and Amount in Rupees. 

To keep the Anviksha Dashboard visually appealing and realistic, the generator creates **fake UI metadata** for the dashboard, while secretly attaching the **real abstract dataset features** for the backend ML model to score.

### Fake Metadata Generation
```javascript
// Generated strictly for UI visuals
const sender = accounts[Math.floor(Math.random() * accounts.length)];
const receiver = accounts[Math.floor(Math.random() * accounts.length)];

const amount = isFraud 
  ? Math.round((Math.random() * 150000 + 20000) / 1000) * 1000
  : Math.round(Math.random() * 50000 + 100);
  
const type = weightedRandom(['UPI', 'NEFT', 'IMPS'], [0.6, 0.2, 0.2]);
```

### Real Feature Injection
The actual row data from `DataSet.csv` is mapped into a `dataset_features` object and sent to the `feature-extractor.js`.
```javascript
// Injected for the ONNX XGBoost model to score
const dataset_features = {
  F115: Number(record.F115),
  F321: Number(record.F321),
  // ...
  F3889: String(record.F3889), // E.g., 'G365D'
  F3891: String(record.F3891), // E.g., 'salaried'
  F3894: Number(record.F3894)
};
```

---

## I4C Feed Generator

**File:** `server/generators/i4c-feed-generator.js`

Simulates periodic updates from I4C (Indian Cyber Crime Coordination Centre) and NCRP (National Cyber Crime Reporting Portal).

### Timing

Fires on a **random interval** averaging 45 seconds to simulate the unpredictable nature of regulatory feed updates:

```javascript
function scheduleNext() {
  const delay = randomBetween(20000, 90000);  // 20-90 seconds
  setTimeout(() => {
    generateFeedEntry();
    scheduleNext();  // Schedule the next one
  }, delay);
}
```

### Generated Entry Types

The generator randomly creates entries of different types and categories:

```javascript
const ENTRY_TYPES = [
  { type: 'phone',   source: 'I4C',          weight: 0.35 },
  { type: 'upi',     source: 'NCRP',         weight: 0.30 },
  { type: 'account', source: '1930_helpline', weight: 0.20 },
  { type: 'device',  source: 'RBI_DPIP',     weight: 0.15 },
];

const FRAUD_CATEGORIES = [
  'Investment fraud — fake trading app',
  'UPI phishing — fake bank SMS',
  'Job scam — advance fee fraud',
  'Loan app fraud — data extortion',
  'Lottery scam — KBC winner fraud',
  'SIM swap — OTP theft',
  'Cyber fraud — fake government officer',
  'Online shopping fraud',
];
```

### Matching Logic

After inserting a new entry, the generator checks if any active account matches. 
*Note: In DataSet mode, the I4C matching is purely for visual dashboard alerts and no longer directly impacts the 18-feature ONNX scoring.*

```javascript
function checkForMatches(newEntry) {
  const accounts = stmts.getAllAccounts.all({ status: 'active' });
  
  accounts.forEach(account => {
    const isMatch = (
      (newEntry.identifier_type === 'phone'   && account.phone === newEntry.identifier_value) ||
      (newEntry.identifier_type === 'upi'     && account.upi_id === newEntry.identifier_value) ||
      (newEntry.identifier_type === 'account' && account.account_number === newEntry.identifier_value)
    );
    
    if (isMatch) {
      console.log(`[I4C] 🚨 REGISTRY MATCH: Account ${account.account_number} (${account.account_holder})`);
    }
  });
}
```

---

## Customizing the Generators

### Change transaction rate

```bash
# In .env:
SIMULATION_INTERVAL=1000   # 1 transaction/second (fast demo)
SIMULATION_INTERVAL=5000   # 1 transaction/5 seconds (slow demo for presentations)
```

### Increase fraud injection rate

In `transaction-generator.js`:
```javascript
// Change 0.10 to inject fraud more frequently:
if (Math.random() < 0.25) {  // 25% chance instead of 10%
```
