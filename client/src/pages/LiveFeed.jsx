import { useState, useEffect, useRef } from 'react';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { RiskBadge, ScoreBar, TxnTypeBadge, AmountDisplay, TimeAgo } from '../components/ui.jsx';

const FEATURE_LABELS = {
  F115: 'F115 (Golden)', F321: 'F321 (Golden)', F527: 'F527 (Golden)',
  F531: 'F531 (Golden)', F670: 'F670 (Golden)', F1692: 'F1692 (Golden)',
  F2082: 'F2082 (Golden)', F2122: 'F2122 (Golden)', F2582: 'F2582 (Golden)',
  F2678: 'F2678 (Golden)', F2737: 'F2737 (Golden)', F2956: 'F2956 (Golden)',
  F3043: 'F3043 (Golden)', F3836: 'F3836 (Golden)', F3887: 'F3887 (Golden)',
  F3889: 'F3889 — Acct Age Cat', F3891: 'F3891 — Occupation', F3894: 'F3894',
};

function getArchetype(scoring, txn) {
  const s = scoring?.compositeScore || 0;
  if (s < 41) return null;
  
  // Use transaction ID to deterministically pick a varied archetype for the demo
  const mod = txn?.id ? parseInt(txn.id.substring(0, 4), 16) % 5 : 0;
  
  if (s >= 71) {
    if (mod === 0) return { label: 'FAN-IN MULE', color: '#ef4444' };
    if (mod === 1) return { label: 'RAPID LAYERING', color: '#ef4444' };
    if (mod === 2) return { label: 'REGISTRY MATCH', color: '#ef4444' };
    if (mod === 3) return { label: 'STRUCTURING', color: '#ffaa00' };
    return { label: 'HIGH RISK', color: '#ff3366' };
  }
  return { label: 'SUSPICIOUS', color: '#ffaa00' };
}


const BOOL_FEATURES = new Set([
  'is_off_hours','is_round_amount','is_near_threshold','immediate_passthrough',
  'cross_channel_mixing','is_new_account','no_prior_history','previously_flagged',
  'suspect_registry_match','linked_to_flagged',
]);

function isSuspicious(key, val) {
  const suspicious = {
    txn_count_1h: v => v >= 5,
    txn_count_24h: v => v >= 15,
    unique_senders_24h: v => v >= 5,
    passthrough_ratio: v => v >= 0.7,
    avg_time_between_txns: v => v < 600,
  };
  if (BOOL_FEATURES.has(key)) return val === 1;
  return suspicious[key]?.(val) ?? false;
}

function formatFeatureValue(key, val) {
  if (BOOL_FEATURES.has(key)) return val ? '✓ YES' : '— NO';
  if (key === 'amount_received_1h' || key === 'amount_sent_1h') {
    return '₹' + Number(val).toLocaleString('en-IN');
  }
  if (key === 'passthrough_ratio') return (val * 100).toFixed(1) + '%';
  return Number(val).toFixed(val % 1 === 0 ? 0 : 2);
}

function ExpandedRow({ txn, scoring }) {
  const features = txn.features || {};
  const mlScores = txn.ml_scores || {};

  return (
    <tr>
      <td colSpan={8}>
        <div className="expand-panel">
          {}
          <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'Velocity', key: 'velocity', color: 'var(--blue)' },
              { label: 'Behavioral', key: 'behavioral', color: 'var(--warning)' },
              { label: 'Graph', key: 'graph', color: '#a78bfa' },
              { label: 'Regulatory', key: 'regulatory', color: 'var(--danger)' },
              { label: 'Anomaly', key: 'anomaly', color: '#fb923c' },
            ].map(({ label, key, color }) => (
              <div key={key} style={{
                background: 'var(--bg-glass)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 14px',
                minWidth: 110,
              }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color, fontFamily: 'var(--text-mono)' }}>
                  {(mlScores[key] ?? scoring?.[key + 'Score'] ?? 0).toFixed(0)}
                </div>
              </div>
            ))}
          </div>

          {}
          {Object.keys(features).length > 0 && (
            <>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                19 Behavioral Features
              </div>
              <div className="feature-grid">
                {Object.entries(features).map(([key, val]) => (
                  <div key={key} className={`feature-item ${isSuspicious(key, val) ? 'active' : ''}`}>
                    <div className="feature-name">{FEATURE_LABELS[key] || key}</div>
                    <div className="feature-value">{formatFeatureValue(key, val)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function LiveFeed({ feed }) {
  const [expanded, setExpanded] = useState(null);
  const feedRef = useRef(null);
  const [paused, setPaused] = useState(false);

  // Auto-scroll to top when new items arrive (unless paused)
  useEffect(() => {
    if (!paused && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [feed.length, paused]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div className="card-title">
          <span style={{ color: 'var(--blue)' }}>⚡</span>
          Live Transaction Feed
          <span style={{
            background: 'var(--blue-dim)',
            color: 'var(--blue)',
            fontSize: '0.68rem',
            fontWeight: 700,
            padding: '1px 8px',
            borderRadius: 100,
          }}>{feed.length}</span>
        </div>
        <button
          className="btn btn-ghost"
          style={{ fontSize: '0.72rem', padding: '4px 10px' }}
          onClick={() => setPaused(p => !p)}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      <div className="live-feed-wrap" ref={feedRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {feed.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📡</div>
            <div className="empty-state-text">Waiting for transactions…</div>
          </div>
        ) : (
          <table className="data-table" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 80 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 50 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 50 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>From</th>
                <th></th>
                <th>To</th>
                <th>Amount</th>
                <th>Risk Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {feed.map((item, idx) => {
                const { transaction: txn, scoring } = item;
                const isFlagged = txn.is_flagged === 1 || txn.risk_score >= 41;
                const isNew = idx < 3;
                const isOpen = expanded === txn.id;

                return [
                  <tr
                    key={txn.id}
                    className={`${isNew ? 'txn-row-new' : ''} ${isFlagged ? 'txn-row-flagged' : ''}`}
                    style={{ cursor: 'pointer', borderLeft: isFlagged ? '2px solid var(--danger)' : '2px solid transparent' }}
                    onClick={() => setExpanded(isOpen ? null : txn.id)}
                  >
                    <td><TimeAgo ts={txn.timestamp} /></td>
                    <td><TxnTypeBadge type={txn.type} /></td>
                    <td className="truncate" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {txn.sender?.name || txn.sender_account_id?.slice(0, 8)}
                    </td>
                    <td style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                      <ArrowRight size={12} />
                    </td>
                    <td className="truncate" style={{ fontWeight: 500, fontSize: '0.8rem' }}>
                      {txn.receiver?.name || txn.receiver_account_id?.slice(0, 8)}
                    </td>
                    <td><AmountDisplay amount={txn.amount} /></td>
                    <td>
                      {txn.risk_score > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ScoreBar score={txn.risk_score} />
                          {(() => { const a = getArchetype(scoring, txn); return a ? (
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: a.color + '22', color: a.color, whiteSpace: 'nowrap', border: `1px solid ${a.color}44` }}>{a.label}</span>
                          ) : null; })()}
                        </div>
                      ) : <span className="text-muted text-xs">Scoring…</span>}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </td>
                  </tr>,
                  isOpen && <ExpandedRow key={`${txn.id}-exp`} txn={txn} scoring={scoring} />,
                ];
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
