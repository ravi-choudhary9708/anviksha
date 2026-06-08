# 10 — Transaction & I4C Feed Generators

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Transaction Generator](#transaction-generator)
- [Fraud Pattern Injection](#fraud-pattern-injection)
- [I4C Feed Generator](#i4c-feed-generator)
- [Customizing the Generators](#customizing-the-generators)

---

## Transaction Generator

**File:** `server/generators/transaction-generator.js`

Simulates a live stream of banking transactions (UPI, NEFT, IMPS, ATM) with realistic distributions and injected fraud patterns.

### How It Runs

```javascript
// Started in server/index.js:
startTransactionGenerator(processTransaction, SIMULATION_INTERVAL);

// Internally:
setInterval(() => {
  // Every SIMULATION_INTERVAL ms (default: 2000ms = 2 seconds):
  
  // 1. Randomly choose if this is a fraud burst
  if (Math.random() < 0.05) {
    // Inject a fraud burst every ~20 transactions
    generateFraudBurst();
  } else {
    generateNormalTransaction();
  }
}, SIMULATION_INTERVAL);
```

### Normal Transaction Generation

```javascript
function generateNormalTransaction() {
  // Randomly pick sender and receiver from the account pool
  const sender = randomFrom(accounts.filter(a => a.status === 'active'));
  const receiver = randomFrom(accounts.filter(a => a.id !== sender.id));
  
  // Amount distribution (realistic Indian banking):
  const amountType = weighted_random([
    { type: 'small_upi',    weight: 0.50, min: 100,    max: 5000   },  // Grocery/food
    { type: 'medium_neft',  weight: 0.30, min: 5000,   max: 50000  },  // Bills/EMI
    { type: 'large_neft',   weight: 0.10, min: 50000,  max: 200000 },  // Rent/salary
    { type: 'atm',          weight: 0.10, min: 2000,   max: 20000  },  // ATM withdrawal
  ]);
  
  // Channel matching amount type
  const channelMap = {
    small_upi:   'UPI',
    medium_neft: randomFrom(['NEFT', 'IMPS']),
    large_neft:  'NEFT',
    atm:         'ATM'
  };
  
  return {
    type: channelMap[amountType.type],
    amount: randomBetween(amountType.min, amountType.max),
    sender_account_id: sender.id,
    receiver_account_id: receiver.id,
    channel: amountType.type === 'atm' ? 'atm' : 'digital',
    description: randomFrom(NORMAL_DESCRIPTIONS),
    timestamp: new Date().toISOString()
  };
}
```

---

## Fraud Pattern Injection

Every ~20 transactions, a fraud burst is injected. The generator cycles through 5 fraud patterns:

### Pattern 1: Fan-in Burst

```javascript
function generateFanInBurst(muleAccount) {
  // 4-7 different accounts all send to the same mule rapidly
  const senderCount = randomBetween(4, 7);
  const senders = randomSample(normalAccounts, senderCount);
  
  console.log(`[GENERATOR] 💥 Burst: ${senderCount} rapid fraud transactions`);
  
  senders.forEach((sender, i) => {
    setTimeout(() => {
      processTransaction({
        type: 'UPI',
        amount: randomBetween(8000, 48000),  // Below ₹50K threshold
        sender_account_id: sender.id,
        receiver_account_id: muleAccount.id,
        channel: 'digital',
        description: randomFrom(['Fund transfer', 'Payment', 'Settlement']),
        timestamp: new Date().toISOString()
      });
    }, i * 200);  // 200ms apart (rapid succession)
  });
}
```

**Features triggered:**
- `txn_count_1h` → goes to 4–7
- `unique_senders_24h` → spikes to 4–7
- `is_near_threshold` → 1 (amounts near ₹50K)
- `avg_time_between_txns` → drops to ~200 seconds

---

### Pattern 2: Immediate Pass-through

```javascript
function generatePassthroughSequence(muleAccount) {
  const amount = randomBetween(50000, 200000);
  const sender = randomFrom(normalAccounts);
  const receiver = randomFrom(normalAccounts);  // Another account for layering
  
  // Step 1: Mule receives
  processTransaction({
    type: 'UPI',
    amount: amount,
    sender_account_id: sender.id,
    receiver_account_id: muleAccount.id,
    timestamp: new Date().toISOString()
  });
  
  // Step 2: Mule immediately sends (within 3 minutes)
  setTimeout(() => {
    processTransaction({
      type: 'NEFT',  // Different channel (cross-channel mixing)
      amount: amount * 0.95,  // Slightly less (mule keeps a cut)
      sender_account_id: muleAccount.id,
      receiver_account_id: receiver.id,
      timestamp: new Date().toISOString()
    });
  }, randomBetween(60000, 180000));  // 1-3 minutes
}
```

**Features triggered:**
- `immediate_passthrough` → 1
- `cross_channel_mixing` → 1 (receive UPI, send NEFT)
- `passthrough_ratio` → ~0.95
- `amount_received_1h` and `amount_sent_1h` → both spike

---

### Pattern 3: Off-Hours Burst

```javascript
function generateOffHoursBurst(muleAccount) {
  // Inject a backdated transaction (if in live demo) or wait for late hours
  // In simulation: simply mark the timestamp as 2-4 AM
  
  const offHoursDate = new Date();
  offHoursDate.setHours(randomBetween(1, 4));  // 1 AM - 4 AM
  offHoursDate.setMinutes(randomBetween(0, 59));
  
  processTransaction({
    type: randomFrom(['UPI', 'IMPS']),
    amount: randomBetween(20000, 100000),
    sender_account_id: randomFrom(normalAccounts).id,
    receiver_account_id: muleAccount.id,
    timestamp: offHoursDate.toISOString()
  });
}
```

**Features triggered:**
- `is_off_hours` → 1

---

### Pattern 4: Structuring Sequence

```javascript
function generateStructuringSequence(muleAccount) {
  // 3 transactions just below ₹50K reporting threshold
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      processTransaction({
        type: 'IMPS',
        amount: randomBetween(45000, 49900),  // Just below ₹50K
        sender_account_id: randomFrom(normalAccounts).id,
        receiver_account_id: muleAccount.id,
        timestamp: new Date().toISOString()
      });
    }, i * 5000);  // 5 seconds apart
  }
}
```

**Features triggered:**
- `is_near_threshold` → 1
- `is_round_amount` may also be 1
- `txn_count_1h` increases

---

### Pattern 5: Registry Hit Simulation

When the I4C generator adds a new entry that matches a mule account's phone/UPI, the NEXT transaction from that account will trigger `suspect_registry_match = 1`, pushing the regulatory sub-score to 100.

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

After inserting a new entry, the generator checks if any active account matches:

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
      // The next transaction from this account will score regulatory = 100
      // (suspect_registry_match feature will be 1)
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
// Change 0.05 to inject fraud more frequently:
if (Math.random() < 0.15) {  // 15% chance instead of 5%
  generateFraudBurst();
}
```

### Add a new fraud pattern

```javascript
function generateYourNewPattern(muleAccount) {
  // Your custom fraud pattern logic here
  processTransaction({
    type: 'RTGS',
    amount: 1000000,  // ₹10 lakh — suspiciously large
    sender_account_id: randomFrom(normalAccounts).id,
    receiver_account_id: muleAccount.id,
    timestamp: new Date().toISOString()
  });
}

// Add to the fraud burst selector:
const patterns = [
  generateFanInBurst,
  generatePassthroughSequence,
  generateOffHoursBurst,
  generateStructuringSequence,
  generateYourNewPattern,  // ← Add here
];
const pattern = randomFrom(patterns);
pattern(randomMuleAccount);
```
