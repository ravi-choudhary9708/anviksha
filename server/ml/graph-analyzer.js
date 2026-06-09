// ============================================================
// Anviksha — Graph Analysis Engine
// ============================================================
// Builds an in-memory account connection graph and analyzes
// network topology to detect mule patterns:

import { stmts } from '../db/index.js';

const graph = {};

export function initGraph() {
  const connections = stmts.getAllConnections.all();
  
  for (const conn of connections) {
    addEdge(
      conn.source_account_id, 
      conn.dest_account_id, 
      conn.total_amount, 
      conn.txn_count
    );
  }
  
  console.log(`[GRAPH] Initialized with ${Object.keys(graph).length} nodes and ${connections.length} edges`);
}

function ensureNode(accountId) {
  if (!graph[accountId]) {
    graph[accountId] = {
      outgoing: {},
      incoming: {},
      totalIn: 0,
      totalOut: 0,
      riskScore: 0,
    };
  }
}

export function addEdge(sourceId, destId, amount, count = 1) {
  ensureNode(sourceId);
  ensureNode(destId);
  
  if (!graph[sourceId].outgoing[destId]) {
    graph[sourceId].outgoing[destId] = { count: 0, amount: 0 };
  }
  graph[sourceId].outgoing[destId].count += count;
  graph[sourceId].outgoing[destId].amount += amount;
  graph[sourceId].totalOut += amount;
  
  if (!graph[destId].incoming[sourceId]) {
    graph[destId].incoming[sourceId] = { count: 0, amount: 0 };
  }
  graph[destId].incoming[sourceId].count += count;
  graph[destId].incoming[sourceId].amount += amount;
  graph[destId].totalIn += amount;
}

export function updateGraph(transaction) {
  addEdge(
    transaction.sender_account_id,
    transaction.receiver_account_id,
    transaction.amount
  );
  
  stmts.upsertConnection.run({
    source_account_id: transaction.sender_account_id,
    dest_account_id: transaction.receiver_account_id,
    total_amount: transaction.amount,
    first_txn_at: transaction.timestamp,
    last_txn_at: transaction.timestamp,
  });
}

export function getFanIn(accountId) {
  const node = graph[accountId];
  if (!node) return 0;
  return Object.keys(node.incoming).length;
}

export function getFanOut(accountId) {
  const node = graph[accountId];
  if (!node) return 0;
  return Object.keys(node.outgoing).length;
}

export function getPassthroughRatio(accountId) {
  const node = graph[accountId];
  if (!node || node.totalIn === 0) return 0;
  return Math.min(node.totalOut / node.totalIn, 1.5);
}

export function getGraphRiskScore(accountId) {
  const fanIn = getFanIn(accountId);
  const fanOut = getFanOut(accountId);
  const passthrough = getPassthroughRatio(accountId);
  
  let score = 0;
  
  if (fanIn >= 10) score += 30;
  else if (fanIn >= 5) score += 20;
  else if (fanIn >= 3) score += 10;
  
  if (fanOut >= 8) score += 25;
  else if (fanOut >= 4) score += 15;
  else if (fanOut >= 2) score += 5;
  
  if (passthrough >= 0.9) score += 30;
  else if (passthrough >= 0.7) score += 20;
  else if (passthrough >= 0.5) score += 10;
  
  if (fanIn >= 5 && fanOut >= 3) score += 15;
  
  return Math.min(score, 100);
}

export function getGraphData() {
  const nodes = [];
  const links = [];
  const accountIds = Object.keys(graph);
  
  for (const id of accountIds) {
    const account = stmts.getAccount.get(id);
    const node = graph[id];
    
    nodes.push({
      id,
      name: account?.account_holder || id.slice(0, 8),
      accountNumber: account?.account_number || '',
      riskScore: account?.risk_score || 0,
      status: account?.status || 'active',
      fanIn: Object.keys(node.incoming).length,
      fanOut: Object.keys(node.outgoing).length,
      totalIn: node.totalIn,
      totalOut: node.totalOut,
      isMule: account?.is_mule || 0,
    });
  }
  
  for (const sourceId of accountIds) {
    const node = graph[sourceId];
    for (const [destId, edge] of Object.entries(node.outgoing)) {
      links.push({
        source: sourceId,
        target: destId,
        value: edge.amount,
        count: edge.count,
      });
    }
  }
  
  return { nodes, links };
}

export function getNeighbors(accountId) {
  const node = graph[accountId];
  if (!node) return { senders: [], receivers: [] };
  
  const senders = Object.entries(node.incoming).map(([id, data]) => {
    const acc = stmts.getAccount.get(id);
    return {
      id,
      name: acc?.account_holder || id,
      amount: data.amount,
      count: data.count,
      riskScore: acc?.risk_score || 0,
      status: acc?.status || 'active',
    };
  });
  
  const receivers = Object.entries(node.outgoing).map(([id, data]) => {
    const acc = stmts.getAccount.get(id);
    return {
      id,
      name: acc?.account_holder || id,
      amount: data.amount,
      count: data.count,
      riskScore: acc?.risk_score || 0,
      status: acc?.status || 'active',
    };
  });
  
  return { senders, receivers };
}

export { graph };
