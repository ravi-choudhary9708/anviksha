# 08 — GenAI Explanation Layer

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Purpose](#purpose)
- [When is it Called?](#when-is-it-called)
- [Gemini API Mode](#gemini-api-mode)
- [Template Fallback Mode](#template-fallback-mode)
- [Adding Your Gemini API Key](#adding-your-gemini-api-key)
- [Example Outputs](#example-outputs)

---

## Purpose

The GenAI Explanation Layer converts raw ML scores and feature values into **human-readable case summaries** that an analyst can immediately act on. Instead of showing just "Risk Score: 91.2", it explains *why* the account is suspicious.

---

## When is it Called?

```javascript
// In server/index.js, processTransaction():
if (scoring.compositeScore >= 65) {
  const explanation = await generateExplanation({
    account,
    transaction,
    scoring,
    featureMap
  });
  // Attached to the alert as ai_explanation
}
```

Only triggered for `compositeScore >= 65` to avoid excessive API calls (or template computation) for routine transactions.

---

## Gemini API Mode

When `GEMINI_API_KEY` is set in `.env`, the explainer calls the Gemini API.

### The Prompt

```javascript
const prompt = `You are a senior financial fraud analyst at Bank of India.

A machine learning system has flagged the following account and transaction. 
Analyze the behavioral signals and write a 3-4 sentence case summary.

=== FLAGGED ACCOUNT ===
Name: ${account.account_holder}
Account: ${account.account_number}
Bank: ${account.bank_name}
KYC Status: ${account.kyc_status}
Account Age: ${featureMap.account_age_days} days
Prior Flags: ${account.status === 'flagged' ? 'YES' : 'NO'}

=== TRIGGERING TRANSACTION ===
Amount: ₹${transaction.amount.toLocaleString('en-IN')}
Type: ${transaction.type}
Channel: ${transaction.channel}
Time: ${transaction.timestamp}

=== ML RISK ASSESSMENT ===
Composite Risk Score: ${scoring.compositeScore.toFixed(1)}/100
Model: ${scoring.modelType}
Velocity Sub-score: ${scoring.velocityScore}
Behavioral Sub-score: ${scoring.behavioralScore}
Graph Sub-score: ${scoring.graphScore}
Regulatory Sub-score: ${scoring.regulatoryScore}

=== KEY BEHAVIORAL SIGNALS ===
- Transactions in last 1 hour: ${featureMap.txn_count_1h}
- Transactions in last 24 hours: ${featureMap.txn_count_24h}
- Unique senders in 24h (fan-in): ${featureMap.unique_senders_24h}
- Unique receivers in 24h (fan-out): ${featureMap.unique_receivers_24h}
- Pass-through ratio: ${(featureMap.passthrough_ratio * 100).toFixed(0)}%
- Immediate pass-through detected: ${featureMap.immediate_passthrough ? 'YES ⚠️' : 'NO'}
- Off-hours transaction: ${featureMap.is_off_hours ? 'YES (Night activity)' : 'NO'}
- Round amount: ${featureMap.is_round_amount ? 'YES' : 'NO'}
- Near ₹50K threshold (structuring): ${featureMap.is_near_threshold ? 'YES ⚠️' : 'NO'}
- Cross-channel mixing: ${featureMap.cross_channel_mixing ? 'YES (Layering)' : 'NO'}
- Suspect registry match: ${featureMap.suspect_registry_match ? 'YES 🚨 (I4C/NCRP)' : 'NO'}
- Linked to flagged accounts: ${featureMap.linked_to_flagged ? 'YES ⚠️' : 'NO'}

Write a clear, concise case summary (3-4 sentences) explaining why this account is suspicious.
Reference specific signals. Use banking/fraud terminology.
End with: "Recommended Action: [FREEZE / ESCALATE TO COMPLIANCE / MONITOR]"

Do NOT include any JSON, markdown headers, or bullet points. Plain paragraph text only.`;
```

### API Call

```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const result = await model.generateContent(prompt);
const explanation = result.response.text();
```

---

## Template Fallback Mode

When no Gemini API key is configured, a deterministic template engine generates explanations based on which features are elevated.

```javascript
function generateTemplateExplanation({ account, transaction, scoring, featureMap }) {
  const signals = [];
  
  // Check each feature and add to signals array
  if (featureMap.suspect_registry_match) {
    signals.push(`CRITICAL: Account identifier matches I4C Suspect Registry — 
    reported for financial fraud (${registryReason}).`);
  }
  
  if (featureMap.immediate_passthrough) {
    const gap = featureMap.avg_time_between_txns;
    signals.push(`HIGH RISK: Immediate pass-through pattern — funds received and 
    forwarded within ${Math.round(gap/60)} minutes.`);
  }
  
  if (featureMap.unique_senders_24h > 8) {
    signals.push(`HIGH RISK: Fan-in pattern detected — ${featureMap.unique_senders_24h} 
    unique senders deposited funds in 24 hours.`);
  }
  
  if (featureMap.passthrough_ratio > 0.80) {
    signals.push(`HIGH RISK: ${(featureMap.passthrough_ratio*100).toFixed(0)}% 
    of received funds immediately forwarded — consistent with mule account layering.`);
  }
  
  if (featureMap.is_new_account && featureMap.account_age_days < 30) {
    signals.push(`MODERATE: Account only ${featureMap.account_age_days} days old 
    with high transaction volume.`);
  }
  
  if (featureMap.is_off_hours) {
    signals.push(`MODERATE: Off-hours transaction activity detected.`);
  }
  
  if (featureMap.is_near_threshold) {
    signals.push(`MODERATE: Structuring behavior — amount of 
    ₹${transaction.amount.toLocaleString()} just below ₹50,000 reporting threshold.`);
  }
  
  if (featureMap.linked_to_flagged) {
    signals.push(`MODERATE: Account transacting with previously flagged accounts.`);
  }
  
  const actionMap = {
    critical: 'FREEZE AND ESCALATE TO COMPLIANCE',
    high:     'ESCALATE TO ANALYST REVIEW',
    medium:   'MONITOR AND COLLECT MORE DATA'
  };
  
  return [
    `Account ${account.account_number} (${account.account_holder}) has been flagged ` +
    `with a risk score of ${scoring.compositeScore.toFixed(1)}/100 ` +
    `by the ${scoring.modelType} model.`,
    signals.join(' '),
    `Recommended Action: ${actionMap[scoring.riskLevel]}.`
  ].join(' ');
}
```

---

## Adding Your Gemini API Key

1. Go to [https://ai.google.dev/](https://ai.google.dev/)
2. Click "Get API Key" → Create a project → Copy the key
3. Add to your `.env` file:
   ```
   GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX
   ```
4. Restart the server — no code changes needed

The free tier (Gemini 1.5 Flash) allows 15 requests/minute and 1,500 requests/day, which is more than enough for the hackathon demo.

---

## Example Outputs

### Gemini API Output (High Risk)
> "Account 4821763901 (Ravi Dubey) demonstrates classic mule account behavior with a composite risk score of 91.2/100. The account received ₹3.8L from 14 distinct sources within 47 minutes and immediately forwarded 93% of those funds to downstream accounts, consistent with structured money laundering. Additionally, the account was opened only 23 days ago, operates primarily during off-hours (2-4 AM), and the registered phone number is linked to NCRP Complaint NCRP/2026/100001 filed for UPI phishing. Recommended Action: FREEZE AND ESCALATE TO COMPLIANCE."

### Template Fallback Output (High Risk)
> "Account 4821763901 (Ravi Dubey) has been flagged with a risk score of 91.2/100 by the xgboost+isolation_forest model. CRITICAL: Account identifier matches I4C Suspect Registry — reported for UPI phishing. HIGH RISK: Immediate pass-through pattern — funds received and forwarded within 3 minutes. HIGH RISK: Fan-in pattern detected — 14 unique senders deposited funds in 24 hours. HIGH RISK: 93% of received funds immediately forwarded — consistent with mule account layering. MODERATE: Account only 23 days old with high transaction volume. MODERATE: Off-hours transaction activity detected. Recommended Action: FREEZE AND ESCALATE TO COMPLIANCE."
