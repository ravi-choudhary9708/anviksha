// ============================================================
// Anviksha — GenAI Explanation Layer
// ============================================================
// Generates natural-language case summaries for flagged accounts.
// Uses Gemini API when available, falls back to template engine.
// ============================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Generate an AI explanation for a flagged transaction/account.
 * 
 * @param {Object} params
 * @param {Object} params.transaction - The flagged transaction
 * @param {Object} params.account - The flagged account
 * @param {Object} params.scoring - Full scoring result from scoring-engine.js
 * @param {Object} params.neighbors - Connected accounts from graph-analyzer.js
 * @returns {string} Natural language explanation
 */
export async function generateExplanation({ transaction, account, scoring, neighbors }) {
  // Try Gemini API first
  if (GEMINI_API_KEY) {
    try {
      const explanation = await callGemini({ transaction, account, scoring, neighbors });
      if (explanation) return explanation;
    } catch (err) {
      console.error('[EXPLAINER] Gemini API error, falling back to template:', err.message);
    }
  }
  
  // Fallback: template-based explanation
  return generateTemplateExplanation({ transaction, account, scoring, neighbors });
}

// ============================================================
// Gemini API Integration
// ============================================================

async function callGemini({ transaction, account, scoring, neighbors }) {
  const prompt = buildPrompt({ transaction, account, scoring, neighbors });
  
  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,       // Low temperature for factual, consistent output
        maxOutputTokens: 400,   // Keep explanations concise
        topP: 0.8,
      }
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Gemini API returned ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Extract text from Gemini response
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || null;
}

function buildPrompt({ transaction, account, scoring, neighbors }) {
  const fm = scoring.featureMap;
  
  return `You are an expert fraud analyst at a bank. Generate a concise case summary for a compliance officer reviewing a flagged mule account alert.

ACCOUNT DETAILS:
- Account Holder: ${account?.account_holder || 'Unknown'}
- Account Number: ${account?.account_number || 'N/A'}
- Account Type: ${account?.account_type || 'savings'}
- Account Age: ${Math.round(fm.account_age_days)} days
- Current Status: ${account?.status || 'active'}

FLAGGED TRANSACTION:
- Type: ${transaction.type}
- Amount: ₹${Number(transaction.amount).toLocaleString('en-IN')}
- Direction: ${transaction.sender_account_id === account?.id ? 'Outgoing' : 'Incoming'}
- Timestamp: ${transaction.timestamp}

RISK SCORING:
- Composite Risk Score: ${scoring.compositeScore}/100 (${scoring.riskLevel})
- Velocity Score: ${scoring.velocityScore}/100
- Behavioral Score: ${scoring.behavioralScore}/100
- Graph Score: ${scoring.graphScore}/100
- Regulatory Score: ${scoring.regulatoryScore}/100
- Model: ${scoring.modelType}

KEY BEHAVIORAL INDICATORS:
- Transactions in last 1 hour: ${fm.txn_count_1h}
- Transactions in last 24 hours: ${fm.txn_count_24h}
- Amount received in last hour: ₹${Number(fm.amount_received_1h).toLocaleString('en-IN')}
- Unique senders (24h): ${fm.unique_senders_24h} (fan-in)
- Unique receivers (24h): ${fm.unique_receivers_24h} (fan-out)
- Pass-through ratio: ${(fm.passthrough_ratio * 100).toFixed(1)}%
- Off-hours activity: ${fm.is_off_hours ? 'Yes' : 'No'}
- Immediate pass-through detected: ${fm.immediate_passthrough ? 'Yes' : 'No'}
- Cross-channel mixing: ${fm.cross_channel_mixing ? 'Yes' : 'No'}
- Suspect Registry match: ${fm.suspect_registry_match ? 'YES — MATCH FOUND' : 'No'}
- Linked to flagged account: ${fm.linked_to_flagged ? 'Yes' : 'No'}

CONNECTED ACCOUNTS:
- Incoming from ${neighbors?.senders?.length || 0} accounts
- Outgoing to ${neighbors?.receivers?.length || 0} accounts

Write a 3-4 sentence case summary that:
1. States the primary reason for flagging
2. Highlights the most suspicious behavioral patterns
3. Notes any regulatory matches
4. Recommends a specific action (freeze, investigate, escalate to nodal officer)

Be factual, specific, and use the actual numbers. Write as if filing a Suspicious Transaction Report (STR) for RBI/FIU-IND.`;
}

// ============================================================
// Template-Based Fallback
// ============================================================

function generateTemplateExplanation({ transaction, account, scoring, neighbors }) {
  const fm = scoring.featureMap;
  const parts = [];
  
  // Opening — state the primary concern
  const accountName = account?.account_holder || 'Unknown';
  const accountNum = account?.account_number || 'N/A';
  parts.push(`Account ${accountNum} (${accountName}) has been flagged with a risk score of ${scoring.compositeScore}/100 (${scoring.riskLevel.toUpperCase()}).`);
  
  // Key behavioral findings
  const findings = [];
  
  if (fm.txn_count_1h >= 5) {
    findings.push(`high transaction velocity (${fm.txn_count_1h} transactions in the last hour)`);
  }
  
  if (fm.unique_senders_24h >= 5) {
    findings.push(`suspicious fan-in pattern (${fm.unique_senders_24h} unique senders in 24 hours)`);
  }
  
  if (fm.immediate_passthrough) {
    findings.push(`immediate pass-through behavior (money received and forwarded within 5 minutes)`);
  }
  
  if (fm.passthrough_ratio >= 0.85) {
    findings.push(`high pass-through ratio (${(fm.passthrough_ratio * 100).toFixed(0)}% of received funds immediately forwarded)`);
  }
  
  if (fm.is_off_hours) {
    findings.push(`off-hours activity detected (transaction between 12AM-5AM)`);
  }
  
  if (fm.cross_channel_mixing) {
    findings.push(`cross-channel mixing (receiving on one payment channel, sending on another)`);
  }
  
  if (fm.is_near_threshold) {
    findings.push(`potential structuring (amount just below ₹50,000 reporting threshold)`);
  }
  
  if (fm.is_new_account && fm.amount_received_1h >= 100000) {
    findings.push(`new account (${Math.round(fm.account_age_days)} days old) with unusually high activity (₹${Number(fm.amount_received_1h).toLocaleString('en-IN')} received in 1 hour)`);
  }
  
  if (findings.length > 0) {
    parts.push(`Key indicators: ${findings.join('; ')}.`);
  }
  
  // Regulatory matches
  if (fm.suspect_registry_match) {
    parts.push(`⚠️ REGULATORY MATCH: This account/phone/UPI ID has been found in the I4C Suspect Registry.`);
  }
  
  if (fm.linked_to_flagged) {
    parts.push(`Connected account(s) have been previously flagged for suspicious activity.`);
  }
  
  // Recommendation
  if (scoring.compositeScore >= 71) {
    parts.push(`Recommended Action: FREEZE account immediately and escalate to nodal officer. File STR with FIU-IND.`);
  } else if (scoring.compositeScore >= 41) {
    parts.push(`Recommended Action: Place under enhanced monitoring. Assign to analyst for detailed review within 24 hours.`);
  } else {
    parts.push(`Recommended Action: Continue monitoring. Re-evaluate if transaction velocity increases.`);
  }
  
  return parts.join(' ');
}
