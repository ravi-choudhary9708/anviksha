// ============================================================
// Anviksha — I4C / NCRP Feed Generator
// ============================================================
// Simulates the Indian Cyber Crime Coordination Centre (I4C)
// Suspect Registry and NCRP complaint feeds.

import { v4 as uuidv4 } from 'uuid';
import { stmts } from '../db/index.js';

let intervalHandle = null;

const COMPLAINT_REASONS = [
  'Online financial fraud - UPI phishing',
  'Investment fraud - Ponzi scheme',
  'Job fraud - advance fee scam',
  'Loan app fraud - harassment and extortion',
  'Sim swap fraud - unauthorized access',
  'Romance scam - social engineering',
  'Crypto trading fraud - fake platform',
  'KYC update fraud - identity theft',
  'Lottery/prize fraud - advance payment',
  'Customer support fraud - remote access',
];

function generateSuspectEntry(accounts) {
  const muleAccounts = accounts.filter(a => a.is_mule);
  const targetMule = Math.random() < 0.6 && muleAccounts.length > 0;
  
  let identifierType, identifierValue;
  
  if (targetMule) {
    const mule = muleAccounts[Math.floor(Math.random() * muleAccounts.length)];
    const typeRoll = Math.random();
    
    if (typeRoll < 0.35 && mule.phone) {
      identifierType = 'phone';
      identifierValue = mule.phone;
    } else if (typeRoll < 0.7 && mule.upi_id) {
      identifierType = 'upi';
      identifierValue = mule.upi_id;
    } else {
      identifierType = 'account';
      identifierValue = mule.account_number;
    }
  } else {
    identifierType = ['phone', 'upi', 'account', 'device'][Math.floor(Math.random() * 4)];
    
    switch (identifierType) {
      case 'phone':
        identifierValue = `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`;
        break;
      case 'upi':
        identifierValue = `fraud${Math.floor(Math.random() * 9999)}@ybl`;
        break;
      case 'account':
        identifierValue = `${Math.floor(1000000000 + Math.random() * 8999999999)}`;
        break;
      case 'device':
        identifierValue = `IMEI-${Math.floor(100000000000000 + Math.random() * 899999999999999)}`;
        break;
    }
  }
  
  const sources = ['I4C', 'NCRP', '1930_helpline', 'RBI_DPIP'];
  const source = sources[Math.floor(Math.random() * sources.length)];
  
  return {
    id: uuidv4(),
    identifier_type: identifierType,
    identifier_value: identifierValue,
    source,
    complaint_ref: `NCRP/${new Date().getFullYear()}/${Math.floor(100000 + Math.random() * 899999)}`,
    reason: COMPLAINT_REASONS[Math.floor(Math.random() * COMPLAINT_REASONS.length)],
    reported_at: new Date().toISOString(),
    status: 'active',
  };
}

export function startI4CFeedGenerator(onSuspectEntry, avgIntervalMs = 45000) {
  console.log(`[I4C FEED] Starting regulatory feed simulator (avg interval: ${avgIntervalMs}ms)`);
  
  const accounts = stmts.getAllAccounts.all();
  
  function scheduleNext() {
    const delay = avgIntervalMs * (0.5 + Math.random());
    
    intervalHandle = setTimeout(() => {
      const entry = generateSuspectEntry(accounts);
      
      try {
        stmts.insertSuspect.run(entry);
        console.log(`[I4C FEED] 🔴 New suspect entry: ${entry.identifier_type}=${entry.identifier_value} (${entry.source})`);
        
        if (onSuspectEntry) {
          onSuspectEntry(entry);
        }
      } catch (err) {
      }
      
      scheduleNext();
    }, delay);
  }
  
  scheduleNext();
}

export function stopI4CFeedGenerator() {
  if (intervalHandle) {
    clearTimeout(intervalHandle);
    intervalHandle = null;
    console.log('[I4C FEED] Regulatory feed simulator stopped');
  }
}
