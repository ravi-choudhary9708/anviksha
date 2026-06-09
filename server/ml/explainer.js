const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Classify which fraud archetype this alert matches
export function classifyFraudArchetype(scoring, transaction) {
  const score = scoring.compositeScore;
  const amount = transaction?.amount || 0;
  const hour = new Date().getHours();
  const isOffHours = hour >= 0 && hour < 5;
  const isRoundAmount = amount % 10000 === 0 && amount >= 10000;
  const isNearThreshold = amount >= 45000 && amount < 50000;

  if (isNearThreshold && score >= 41)
    return { archetype: 'STRUCTURING', color: '#f59e0b', description: 'Multiple transactions just below ₹50K reporting threshold — classic smurfing pattern' };

  if (scoring.behavioralScore >= 60 && score >= 71)
    return { archetype: 'RAPID_LAYERING', color: '#ef4444', description: 'Funds received and forwarded within minutes across multiple channels' };

  if (scoring.graphScore >= 50 && score >= 55)
    return { archetype: 'FAN_IN_MULE', color: '#ef4444', description: 'Classic aggregation mule — collecting funds from multiple sources' };

  if (scoring.velocityScore >= 40 && isOffHours)
    return { archetype: 'NIGHT_OPERATION', color: '#8b5cf6', description: 'Off-hours coordinated fund movement — potential digital arrest scam' };

  if (isRoundAmount && score >= 41)
    return { archetype: 'ROUND_AMOUNT_BURST', color: '#f97316', description: 'Suspicious round-number transactions — manual coordination detected' };

  if (scoring.regulatoryScore >= 50)
    return { archetype: 'REGISTRY_MATCH', color: '#ef4444', description: 'I4C-flagged identity using cross-channel layering' };

  if (score >= 71)
    return { archetype: 'HIGH_RISK_ANOMALY', color: '#ff3366', description: 'Multiple elevated risk signals — XGBoost + Isolation Forest consensus flag' };

  return { archetype: 'SUSPICIOUS_PATTERN', color: '#ffaa00', description: 'Anomalous behavioral signals detected relative to account baseline' };
}

export async function generateExplanation({ transaction, account, scoring, neighbors }) {
  const archetype = classifyFraudArchetype(scoring, transaction);

  if (GEMINI_API_KEY) {
    try {
      const explanation = await callGemini({ transaction, account, scoring, neighbors, archetype });
      if (explanation) return explanation;
    } catch (err) {
      console.error('[EXPLAINER] Gemini fallback:', err.message);
    }
  }

  return generateTemplateExplanation({ transaction, account, scoring, neighbors, archetype });
}

async function callGemini({ transaction, account, scoring, neighbors, archetype }) {
  const prompt = buildPrompt({ transaction, account, scoring, neighbors, archetype });

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 400, topP: 0.8 },
    }),
  });

  if (!response.ok) throw new Error(`Gemini ${response.status}`);

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

function buildPrompt({ transaction, account, scoring, neighbors, archetype }) {
  return `You are a fraud analyst at Bank of India. Write a 3-4 sentence STR (Suspicious Transaction Report) case summary for a compliance officer.

ACCOUNT: ${account?.account_holder || 'Unknown'} | ${account?.account_number || 'N/A'} | ${account?.account_type || 'savings'} | Status: ${account?.status || 'active'}
TRANSACTION: ₹${Number(transaction.amount).toLocaleString('en-IN')} via ${transaction.type} | ${transaction.sender_account_id === account?.id ? 'Outgoing' : 'Incoming'}
FRAUD ARCHETYPE: ${archetype.archetype} — ${archetype.description}
RISK SCORE: ${scoring.compositeScore}/100 (${scoring.riskLevel.toUpperCase()}) | Model: ${scoring.modelType}
NETWORK: ${neighbors?.senders?.length || 0} incoming connections, ${neighbors?.receivers?.length || 0} outgoing

Rules:
1. State the fraud archetype and why it was flagged
2. Mention the risk score and what drove it
3. Give a specific action (freeze/investigate/escalate to nodal officer/file STR with FIU-IND)
4. Write as a professional compliance officer, no jargon explanations needed`;
}

function generateTemplateExplanation({ transaction, account, scoring, neighbors, archetype }) {
  const accountNum = account?.account_number || 'N/A';
  const accountName = account?.account_holder || 'Unknown';

  let explanation = `Account ${accountNum} (${accountName}) flagged as [${archetype.archetype}] with risk score ${scoring.compositeScore}/100 (${scoring.riskLevel.toUpperCase()}). `;
  explanation += `${archetype.description}. `;

  if (scoring.anomalyScore > 0) {
    explanation += `Isolation Forest anomaly detector independently confirmed unusual behavior (anomaly boost: +${scoring.anomalyScore} points). `;
  }

  if (scoring.compositeScore >= 71) {
    explanation += `Recommended Action: FREEZE account immediately and escalate to nodal officer. File STR with FIU-IND under PMLA Section 3.`;
  } else if (scoring.compositeScore >= 41) {
    explanation += `Recommended Action: Enhanced monitoring. Assign to analyst for review within 24 hours.`;
  } else {
    explanation += `Recommended Action: Continue monitoring. Re-evaluate if transaction velocity increases.`;
  }

  return explanation;
}

// Generate STR draft text for download
export function generateSTRDraft({ account, alert, scoring, archetype }) {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const archetypeInfo = archetype || { archetype: 'SUSPICIOUS_PATTERN', description: 'Multiple risk signals' };

  return `SUSPICIOUS TRANSACTION REPORT — DRAFT
Filed by: Anviksha Automated Detection System v1.0
Generated: ${now} IST
Report Status: DRAFT — Pending Analyst Review

─────────────────────────────────────────────
ACCOUNT INFORMATION
─────────────────────────────────────────────
Account Holder : ${account?.account_holder || 'Unknown'}
Account Number : ${account?.account_number || 'N/A'}
Account Type   : ${account?.account_type || 'Savings'}
Bank           : ${account?.bank_name || 'Bank of India'}
IFSC Code      : ${account?.ifsc_code || 'N/A'}
Phone          : ${account?.phone || 'N/A'}
UPI ID         : ${account?.upi_id || 'N/A'}
KYC Status     : ${account?.kyc_status || 'N/A'}
Account Status : ${account?.status?.toUpperCase() || 'ACTIVE'}

─────────────────────────────────────────────
RISK ASSESSMENT
─────────────────────────────────────────────
Composite Risk Score  : ${scoring?.compositeScore || 'N/A'} / 100
Risk Level            : ${scoring?.riskLevel?.toUpperCase() || 'N/A'}
Detection Model       : XGBoost + Isolation Forest (ONNX)
Fraud Archetype       : ${archetypeInfo.archetype}
Archetype Description : ${archetypeInfo.description}
Recommended Action    : ${scoring?.action?.replace(/_/g, ' ').toUpperCase() || 'REVIEW'}

─────────────────────────────────────────────
ALERT DETAILS
─────────────────────────────────────────────
Alert Title  : ${alert?.title || 'Suspicious Activity Detected'}
Alert Type   : ${alert?.alert_type || 'ml_flag'}
Severity     : ${alert?.severity?.toUpperCase() || 'HIGH'}
Alert ID     : ${alert?.id || 'N/A'}

─────────────────────────────────────────────
AI CASE SUMMARY
─────────────────────────────────────────────
${alert?.ai_explanation || 'No AI summary available. Enable Gemini API for automated narratives.'}

─────────────────────────────────────────────
REGULATORY REFERENCES
─────────────────────────────────────────────
Applicable Law    : PMLA 2002, Section 3 (Offence of Money Laundering)
RBI Circular      : RBI/2023-24/73 — Guidelines on Mule Account Detection
I4C Registry      : Indian Cyber Crime Coordination Centre
Reporting To      : FIU-IND (Financial Intelligence Unit — India)

─────────────────────────────────────────────
ANALYST SIGN-OFF (Required before submission)
─────────────────────────────────────────────
Reviewed by   : ________________________
Designation   : ________________________
Date          : ________________________
Signature     : ________________________

NOTE: This is an auto-generated draft. Verify all details before official STR submission to FIU-IND portal.`;
}
