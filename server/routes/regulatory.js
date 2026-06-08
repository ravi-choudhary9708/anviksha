// ============================================================
// Anviksha — Express API Routes: Regulatory Feeds
// ============================================================
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { stmts } from '../db/index.js';

const router = express.Router();

// Feed status tracker (in-memory; resets on restart)
const feedStatus = {
  I4C: { name: 'I4C Suspect Registry', status: 'connected', lastUpdate: new Date().toISOString(), count: 0 },
  NCRP: { name: 'NCRP Complaint Feed', status: 'connected', lastUpdate: new Date().toISOString(), count: 0 },
  '1930_helpline': { name: '1930 Helpline Feed', status: 'connected', lastUpdate: new Date().toISOString(), count: 0 },
  RBI_DPIP: { name: 'RBI DPIP Feed', status: 'connected', lastUpdate: new Date().toISOString(), count: 0 },
};

// GET /api/regulatory/suspect-registry
router.get('/suspect-registry', (req, res) => {
  try {
    const entries = stmts.getAllSuspects.all();
    return res.json({ entries, total: entries.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/regulatory/suspect-registry — Add new entry (simulates live I4C feed)
router.post('/suspect-registry', (req, res) => {
  try {
    const { identifier_type, identifier_value, source, complaint_ref, reason } = req.body;

    if (!identifier_type || !identifier_value) {
      return res.status(400).json({ error: 'identifier_type and identifier_value are required' });
    }

    const entry = {
      id: uuidv4(),
      identifier_type,
      identifier_value,
      source: source || 'I4C',
      complaint_ref: complaint_ref || `NCRP/${new Date().getFullYear()}/${Math.floor(Math.random() * 999999)}`,
      reason: reason || 'Reported for financial fraud',
      reported_at: new Date().toISOString(),
      status: 'active',
    };

    stmts.insertSuspect.run(entry);

    // Update feed status
    if (feedStatus[entry.source]) {
      feedStatus[entry.source].lastUpdate = new Date().toISOString();
      feedStatus[entry.source].count++;
    }

    return res.status(201).json(entry);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Identifier already exists in registry' });
    }
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/regulatory/feed-status — Status of all regulatory feeds
router.get('/feed-status', (req, res) => {
  try {
    const suspects = stmts.getAllSuspects.all();

    // Update counts from DB
    for (const source of Object.keys(feedStatus)) {
      feedStatus[source].count = suspects.filter(s => s.source === source).length;
    }

    return res.json({ feeds: Object.values(feedStatus) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Export feed status updater for use by I4C generator
export function updateFeedStatus(source) {
  if (feedStatus[source]) {
    feedStatus[source].lastUpdate = new Date().toISOString();
    feedStatus[source].count++;
  }
}

export default router;
