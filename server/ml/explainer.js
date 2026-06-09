// ============================================================
// Anviksha — GenAI Explanation Layer (DataSet Driven)
// ============================================================
// Generates natural-language case summaries for flagged accounts.
// Because the dataset features (F115, etc.) are abstract, 
// Gemini will generate generalized risk narratives.
// ============================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function generateExplanation({ transaction, account, scoring, neighbors }) {
  if (GEMINI_API_KEY) {
    try {
      const explanation = await callGemini({ transaction, account, scoring, neighbors });
      if (explanation) return explanation;
    } catch (err) {
      console.error('[EXPLAINER] Gemini API error, falling back to template:', err.message);
    }
  }
  
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
        temperature: 0.3,       
        maxOutputTokens: 400,   
        topP: 0.8,
      }
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Gemini API returned ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
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
- Current Status: ${account?.status || 'active'}

FLIPPED TRANSACTION METADATA (SIMULATED UI):
- Type: ${transaction.type}
- Amount: ₹${Number(transaction.amount).toLocaleString('en-IN')}
- Direction: ${transaction.sender_account_id === account?.id ? 'Outgoing' : 'Incoming'}

RISK SCORING:
- Composite Risk Score: ${scoring.compositeScore}/100 (${scoring.riskLevel})
- Model: ${scoring.modelType}

ABSTRACT ML INDICATORS (From DataSet):
- The model flagged this transaction based on an anomaly combination of 18 abstract behavioral markers (F115 through F3894). 
- Primary driving features were likely: F2082 (importance 0.26), F1692 (importance 0.08), and F2122 (importance 0.07).
- Account Age Category (F3889): ${fm.F3889}
- Occupation Category (F3891): ${fm.F3891}

Write a 3-4 sentence case summary that:
1. States the primary reason for flagging (the high composite score driven by the dataset anomalies).
2. Notes the account's occupation and age category as contributing factors.
3. Recommends a specific action (freeze, investigate, escalate to nodal officer).

Be factual, specific, and write as if filing a Suspicious Transaction Report (STR) for RBI/FIU-IND. Do not overly focus on the specific F-numbers, but instead write a generalized risk warning.`;
}

// ============================================================
// Template-Based Fallback
// ============================================================

function generateTemplateExplanation({ transaction, account, scoring, neighbors }) {
  const fm = scoring.featureMap;
  const parts = [];
  
  const accountName = account?.account_holder || 'Unknown';
  const accountNum = account?.account_number || 'N/A';
  parts.push(`Account ${accountNum} (${accountName}) has been flagged with a risk score of ${scoring.compositeScore}/100 (${scoring.riskLevel.toUpperCase()}).`);
  
  parts.push(`The XGBoost + Isolation Forest models detected significant anomalies in the abstract behavioral features (F115-F3894) associated with this transaction.`);
  
  if (scoring.anomalyScore > 0) {
    parts.push(`The Isolation Forest anomaly detector also identified this pattern as highly unusual compared to baseline data.`);
  }

  if (scoring.compositeScore >= 71) {
    parts.push(`Recommended Action: FREEZE account immediately and escalate to nodal officer. File STR with FIU-IND.`);
  } else if (scoring.compositeScore >= 41) {
    parts.push(`Recommended Action: Place under enhanced monitoring. Assign to analyst for detailed review within 24 hours.`);
  } else {
    parts.push(`Recommended Action: Continue monitoring. Re-evaluate if transaction velocity increases.`);
  }
  
  return parts.join(' ');
}
