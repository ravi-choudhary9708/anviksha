// ============================================================
// Anviksha — Graph Analysis Engine
// ============================================================
// Builds an in-memory account connection graph and analyzes
// network topology to detect mule patterns:
//   - Fan-in: many accounts sending to one (money aggregation)
//   - Fan-out: one account sending to many (layering)
//   - Pass-through: A→B→C within short time (mule chain)
//   - Clusters: groups of accounts transacting only with each other
// ============================================================

import { stmts } from '../db/index.js';

/**
 * In-memory graph structure.
 * Uses adjacency list representation for fast lookups.
 * 
 * graph = {
 *   'ACC-001': {
 *     outgoing: { 'ACC-002': { count: 5, amount: 150000 }, ... },
 *     incoming: { 'ACC-003': { count: 3, amount: 80000 }, ... },
 *     totalIn: 80000,
 *     totalOut: 150000,
 *     riskScore: 0,
 *   }
 * }
 */
const graph = {};

/**
 * Initialize graph from database connections table.
 * Called once at server startup.
 */
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

/**
 * Ensure a node exists in the graph.
 */
function ensureNode(accountId) {
  if (!graph[accountId]) {
    graph[accountId] = {
      outgoing: {},  // Accounts this node sends money TO
      incoming: {},  // Accounts this node receives money FROM
      totalIn: 0,
      totalOut: 0,
      riskScore: 0,
    };
  }
}

/**
 * Add or update an edge in the graph.
 * Called for each new transaction.
 */
export function addEdge(sourceId, destId, amount, count = 1) {
  ensureNode(sourceId);
  ensureNode(destId);
  
  // Update outgoing edge for source
  if (!graph[sourceId].outgoing[destId]) {
    graph[sourceId].outgoing[destId] = { count: 0, amount: 0 };
  }
  graph[sourceId].outgoing[destId].count += count;
  graph[sourceId].outgoing[destId].amount += amount;
  graph[sourceId].totalOut += amount;
  
  // Update incoming edge for destination
  if (!graph[destId].incoming[sourceId]) {
    graph[destId].incoming[sourceId] = { count: 0, amount: 0 };
  }
  graph[destId].incoming[sourceId].count += count;
  graph[destId].incoming[sourceId].amount += amount;
  graph[destId].totalIn += amount;
}

/**
 * Update graph when a new transaction occurs.
 */
export function updateGraph(transaction) {
  addEdge(
    transaction.sender_account_id,
    transaction.receiver_account_id,
    transaction.amount
  );
  
  // Also update the DB connections table
  stmts.upsertConnection.run({
    source_account_id: transaction.sender_account_id,
    dest_account_id: transaction.receiver_account_id,
    total_amount: transaction.amount,
    first_txn_at: transaction.timestamp,
    last_txn_at: transaction.timestamp,
  });
}

// ============================================================
// Graph Metrics
// ============================================================

/**
 * Get fan-in degree for an account.
 * Fan-in = number of unique accounts sending money to this account.
 * High fan-in on a personal account = money aggregation (mule sign).
 */
export function getFanIn(accountId) {
  const node = graph[accountId];
  if (!node) return 0;
  return Object.keys(node.incoming).length;
}

/**
 * Get fan-out degree for an account.
 * Fan-out = number of unique accounts this account sends to.
 * High fan-out = money distribution/layering.
 */
export function getFanOut(accountId) {
  const node = graph[accountId];
  if (!node) return 0;
  return Object.keys(node.outgoing).length;
}

/**
 * Calculate pass-through ratio.
 * Ratio close to 1.0 = almost all received money is forwarded out.
 * This is the strongest single indicator of a mule account.
 */
export function getPassthroughRatio(accountId) {
  const node = graph[accountId];
  if (!node || node.totalIn === 0) return 0;
  return Math.min(node.totalOut / node.totalIn, 1.5);
}

/**
 * Detect if an account exhibits mule-like network patterns.
 * Returns a graph risk score (0-100).
 */
export function getGraphRiskScore(accountId) {
  const fanIn = getFanIn(accountId);
  const fanOut = getFanOut(accountId);
  const passthrough = getPassthroughRatio(accountId);
  
  let score = 0;
  
  // High fan-in (many senders → this account)
  if (fanIn >= 10) score += 30;
  else if (fanIn >= 5) score += 20;
  else if (fanIn >= 3) score += 10;
  
  // High fan-out (this account → many recipients)  
  if (fanOut >= 8) score += 25;
  else if (fanOut >= 4) score += 15;
  else if (fanOut >= 2) score += 5;
  
  // High pass-through ratio (receive ≈ send)
  if (passthrough >= 0.9) score += 30;
  else if (passthrough >= 0.7) score += 20;
  else if (passthrough >= 0.5) score += 10;
  
  // Fan-in AND fan-out both high = classic mule shape
  if (fanIn >= 5 && fanOut >= 3) score += 15;
  
  return Math.min(score, 100);
}

/**
 * Get the full graph data for D3.js visualization.
 * Returns nodes and links in the format D3 force-directed graph expects.
 */
export function getGraphData() {
  const nodes = [];
  const links = [];
  const accountIds = Object.keys(graph);
  
  // Fetch account details for each node
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
  
  // Create links from edges
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

/**
 * Get immediate neighbors of an account.
 * Useful for showing "connected accounts" in the UI.
 */
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
