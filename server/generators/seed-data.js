// ============================================================
// Anviksha — Seed Data Script
// ============================================================
// Populates the database with realistic initial data:
//   - 50 accounts (45 normal + 5 mule accounts)

import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import { db, stmts } from '../db/index.js';

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Sai',
  'Arnav', 'Dhruv', 'Kabir', 'Ananya', 'Diya', 'Priya', 'Isha', 'Riya',
  'Saanvi', 'Anika', 'Kiara', 'Mira', 'Navya', 'Rohit', 'Vikram',
  'Suresh', 'Rajesh', 'Pradeep', 'Amit', 'Neha', 'Pooja', 'Sunita',
  'Deepak', 'Manoj', 'Rahul', 'Nikhil', 'Gaurav', 'Sanjay', 'Vinod',
  'Kiran', 'Meena', 'Jyoti', 'Rekha', 'Sangeeta', 'Arun', 'Mohan',
  'Ramesh', 'Prakash', 'Sunil', 'Ajay', 'Vijay', 'Ashok', 'Mukesh',
];

const LAST_NAMES = [
  'Sharma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Reddy', 'Nair',
  'Joshi', 'Verma', 'Mishra', 'Iyer', 'Rao', 'Das', 'Mehta',
  'Chauhan', 'Patil', 'Desai', 'Malhotra', 'Kapoor', 'Tiwari',
  'Agarwal', 'Bhat', 'Pillai', 'Menon', 'Saxena',
];

const BANK_NAMES = ['Bank of India', 'SBI', 'PNB', 'Canara Bank', 'Bank of Baroda'];
const IFSC_PREFIXES = ['BKID', 'SBIN', 'PUNB', 'CNRB', 'BARB'];
const UPI_HANDLES = ['@oksbi', '@okicici', '@ybl', '@paytm', '@apl', '@ibl'];

function randomName() {
  return `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
}

function randomPhone() {
  return `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`;
}

function randomAccountNumber() {
  return `${Math.floor(1000000000 + Math.random() * 8999999999)}`;
}

function randomIFSC() {
  const prefix = IFSC_PREFIXES[Math.floor(Math.random() * IFSC_PREFIXES.length)];
  return `${prefix}0${Math.floor(100000 + Math.random() * 899999)}`;
}

function randomUPI(name) {
  const handle = UPI_HANDLES[Math.floor(Math.random() * UPI_HANDLES.length)];
  return `${name.split(' ')[0].toLowerCase()}${Math.floor(Math.random() * 99)}${handle}`;
}

function randomDate(daysBack) {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  return date.toISOString();
}

function seedAccounts() {
  console.log('[SEED] Creating 50 accounts (45 normal + 5 mule)...');
  
  const accounts = [];
  
  for (let i = 0; i < 45; i++) {
    const name = randomName();
    const account = {
      id: uuidv4(),
      account_number: randomAccountNumber(),
      account_holder: name,
      ifsc_code: randomIFSC(),
      bank_name: BANK_NAMES[Math.floor(Math.random() * BANK_NAMES.length)],
      upi_id: randomUPI(name),
      phone: randomPhone(),
      account_type: Math.random() < 0.7 ? 'savings' : (Math.random() < 0.5 ? 'current' : 'salary'),
      kyc_status: 'verified',
      opened_date: randomDate(365 * 3),
      risk_score: Math.random() * 15,
      status: 'active',
      is_mule: 0,
    };
    accounts.push(account);
  }
  
  const muleNames = [
    'Ravi Dubey', 'Sonia Khatri', 'Farhan Ansari', 'Deepika Yadav', 'Kunal Thakur'
  ];
  
  for (let i = 0; i < 5; i++) {
    const name = muleNames[i];
    const account = {
      id: uuidv4(),
      account_number: randomAccountNumber(),
      account_holder: name,
      ifsc_code: randomIFSC(),
      bank_name: 'Bank of India',
      upi_id: randomUPI(name),
      phone: randomPhone(),
      account_type: 'savings',
      kyc_status: Math.random() < 0.3 ? 'pending' : 'verified',
      opened_date: randomDate(60),
      risk_score: 30 + Math.random() * 30,
      status: 'active',
      is_mule: 1,
    };
    accounts.push(account);
  }
  
  const insertMany = db.transaction((accs) => {
    for (const acc of accs) {
      stmts.insertAccount.run(acc);
    }
  });
  insertMany(accounts);
  
  console.log(`[SEED] ✅ Created ${accounts.length} accounts`);
  return accounts;
}

function seedTransactions(accounts) {
  console.log('[SEED] Creating 200 historical transactions...');
  
  const normalAccounts = accounts.filter(a => !a.is_mule);
  const muleAccounts = accounts.filter(a => a.is_mule);
  const transactions = [];
  
  for (let i = 0; i < 150; i++) {
    const sender = normalAccounts[Math.floor(Math.random() * normalAccounts.length)];
    let receiver;
    do {
      receiver = normalAccounts[Math.floor(Math.random() * normalAccounts.length)];
    } while (receiver.id === sender.id);
    
    const types = ['UPI', 'NEFT', 'IMPS', 'UPI', 'UPI'];
    const descriptions = [
      'Grocery payment', 'Bill payment', 'Family transfer', 'Rent',
      'Mobile recharge', 'Shopping', 'EMI', 'Subscription',
    ];
    
    const txn = {
      id: uuidv4(),
      txn_ref: `TXN${Date.now() - i * 100000}${i.toString().padStart(4, '0')}`,
      type: types[Math.floor(Math.random() * types.length)],
      amount: Math.round(Math.random() * 20000 + 100),
      sender_account_id: sender.id,
      receiver_account_id: receiver.id,
      channel: 'digital',
      description: descriptions[Math.floor(Math.random() * descriptions.length)],
      timestamp: randomDate(7),
      risk_score: Math.random() * 20,
      is_flagged: 0,
      features_json: null,
      ml_scores_json: null,
    };
    transactions.push(txn);
  }
  
  for (let i = 0; i < 50; i++) {
    const mule = muleAccounts[Math.floor(Math.random() * muleAccounts.length)];
    const normal = normalAccounts[Math.floor(Math.random() * normalAccounts.length)];
    
    const isFanIn = Math.random() < 0.6;
    const sender = isFanIn ? normal : mule;
    const receiver = isFanIn ? mule : normal;
    
    const txn = {
      id: uuidv4(),
      txn_ref: `TXN${Date.now() - i * 50000}S${i.toString().padStart(4, '0')}`,
      type: Math.random() < 0.5 ? 'NEFT' : 'IMPS',
      amount: Math.round((Math.random() * 150000 + 20000) / 1000) * 1000,
      sender_account_id: sender.id,
      receiver_account_id: receiver.id,
      channel: 'digital',
      description: 'Fund transfer',
      timestamp: randomDate(3),
      risk_score: 40 + Math.random() * 40,
      is_flagged: Math.random() < 0.4 ? 1 : 0,
      features_json: null,
      ml_scores_json: null,
    };
    transactions.push(txn);
  }
  
  const insertMany = db.transaction((txns) => {
    for (const txn of txns) {
      stmts.insertTransaction.run(txn);
      stmts.upsertConnection.run({
        source_account_id: txn.sender_account_id,
        dest_account_id: txn.receiver_account_id,
        total_amount: txn.amount,
        first_txn_at: txn.timestamp,
        last_txn_at: txn.timestamp,
      });
    }
  });
  insertMany(transactions);
  
  console.log(`[SEED] ✅ Created ${transactions.length} transactions`);
  return transactions;
}

function seedSuspectRegistry(accounts) {
  console.log('[SEED] Creating suspect registry entries...');
  
  const muleAccounts = accounts.filter(a => a.is_mule);
  const entries = [];
  
  for (let i = 0; i < Math.min(3, muleAccounts.length); i++) {
    const mule = muleAccounts[i];
    
    entries.push({
      id: uuidv4(),
      identifier_type: 'phone',
      identifier_value: mule.phone,
      source: 'I4C',
      complaint_ref: `NCRP/2026/${100000 + i}`,
      reason: 'Reported in online financial fraud — UPI phishing scheme',
      reported_at: randomDate(14),
      status: 'active',
    });
    
    if (Math.random() < 0.7) {
      entries.push({
        id: uuidv4(),
        identifier_type: 'upi',
        identifier_value: mule.upi_id,
        source: 'NCRP',
        complaint_ref: `NCRP/2026/${200000 + i}`,
        reason: 'UPI ID used in fraudulent fund collection',
        reported_at: randomDate(10),
        status: 'active',
      });
    }
  }
  
  for (let i = 0; i < 5; i++) {
    entries.push({
      id: uuidv4(),
      identifier_type: ['phone', 'upi', 'account', 'device'][Math.floor(Math.random() * 4)],
      identifier_value: `+91${Math.floor(8000000000 + Math.random() * 1999999999)}`,
      source: ['I4C', 'NCRP', '1930_helpline', 'RBI_DPIP'][Math.floor(Math.random() * 4)],
      complaint_ref: `NCRP/2026/${300000 + i}`,
      reason: [
        'Investment fraud', 'Job scam', 'Loan app fraud',
        'Sim swap fraud', 'Lottery scam',
      ][Math.floor(Math.random() * 5)],
      reported_at: randomDate(30),
      status: 'active',
    });
  }
  
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      try { stmts.insertSuspect.run(item); } catch(e) {  }
    }
  });
  insertMany(entries);
  
  console.log(`[SEED] ✅ Created ${entries.length} suspect registry entries`);
}

function seedAlerts(accounts) {
  console.log('[SEED] Creating initial alerts...');
  
  const muleAccounts = accounts.filter(a => a.is_mule);
  const alerts = [];
  
  for (let i = 0; i < Math.min(3, muleAccounts.length); i++) {
    const mule = muleAccounts[i];
    alerts.push({
      id: uuidv4(),
      alert_type: 'ml_flag',
      severity: 'high',
      account_id: mule.id,
      txn_id: null,
      title: `Suspicious activity detected on account ${mule.account_number}`,
      description: `Account holder ${mule.account_holder} shows mule-like behavior patterns: high fan-in, rapid pass-through, new account with unusual volume.`,
      ai_explanation: null,
      status: 'open',
    });
  }
  
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      stmts.insertAlert.run(item);
    }
  });
  insertMany(alerts);
  
  console.log(`[SEED] ✅ Created ${alerts.length} alerts`);
}

console.log('='.repeat(50));
console.log('  Anviksha — Database Seed Script');
console.log('='.repeat(50));

console.log('\n[SEED] Clearing existing data...');
db.exec('DELETE FROM risk_scores');
db.exec('DELETE FROM alerts');
db.exec('DELETE FROM account_connections');
db.exec('DELETE FROM transactions');
db.exec('DELETE FROM suspect_registry');
db.exec('DELETE FROM accounts');

const accounts = seedAccounts();
seedTransactions(accounts);
seedSuspectRegistry(accounts);
seedAlerts(accounts);

const stats = stmts.getDashboardStats.get();
console.log('\n' + '='.repeat(50));
console.log('  Seed Complete!');
console.log('='.repeat(50));
console.log(`  Accounts:     ${stats.total_accounts}`);
console.log(`  Transactions: ${stats.total_transactions}`);
console.log(`  Open Alerts:  ${stats.open_alerts}`);
console.log(`  Flagged:      ${stats.flagged_accounts} accounts, ${stats.flagged_transactions} txns`);
console.log('='.repeat(50));

process.exit(0);
