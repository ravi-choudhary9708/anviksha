import { useState, useEffect } from 'react';
import { 
  ShieldAlert, Database, Clock, Users, ArrowDownRight, ArrowUpRight, 
  ExternalLink, CheckCircle2, AlertCircle, Search, Filter, RefreshCw, 
  ChevronDown, ChevronUp, Layers, Eye, FileText, Share2, Activity
} from 'lucide-react';
import { Spinner } from '../components/ui.jsx';

export default function CDACForensicInvestigation() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [expandedCase, setExpandedCase] = useState(null);
  const [activeVizTab, setActiveVizTab] = useState('dwell');

  useEffect(() => {
    fetchAuditData();
  }, []);

  const fetchAuditData = () => {
    setLoading(true);
    fetch('http://localhost:3001/api/dataset/forensic-audit')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load C-DAC forensic audit');
        return res.json();
      })
      .then(json => {
        setData(json);
        setError(null);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Spinner size={32} />
        <div style={{ marginTop: 12, color: 'var(--text-muted)' }}>Loading C-DAC SOA Forensic Portfolio...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section-card" style={{ textAlign: 'center', padding: 40 }}>
        <AlertCircle size={48} color="var(--danger)" style={{ marginBottom: 16 }} />
        <h3>Failed to Connect to C-DAC Dataset API</h3>
        <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        <button 
          className="btn btn-primary" 
          onClick={fetchAuditData}
          style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <RefreshCw size={14} /> Retry Connection
        </button>
      </div>
    );
  }

  const { metadata, bias_neutralization_audit, cases } = data;

  // Filter cases
  const filteredCases = cases.filter(c => {
    const matchesSearch = 
      c.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.source_file.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.evidence_codes.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTier = 
      selectedTier === 'ALL' || 
      (selectedTier === 'TIER_2' && c.operational_priority_tier.includes('TIER_2')) ||
      (selectedTier === 'TIER_3' && c.operational_priority_tier.includes('TIER_3')) ||
      (selectedTier === 'TIER_4' && c.operational_priority_tier.includes('TIER_4'));

    return matchesSearch && matchesTier;
  });

  const getTierBadge = (tier) => {
    if (tier.includes('TIER_1')) {
      return <span className="tier-badge tier-1">Tier 1: Urgent Investigation</span>;
    }
    if (tier.includes('TIER_2')) {
      return <span className="tier-badge tier-2">Tier 2: Standard Review</span>;
    }
    if (tier.includes('TIER_3')) {
      return <span className="tier-badge tier-3">Tier 3: Enhanced Monitor</span>;
    }
    return <span className="tier-badge tier-4">Tier 4: Routine</span>;
  };

  const getScoreColor = (score) => {
    if (score >= 70) return '#ef4444';
    if (score >= 50) return '#f59e0b';
    if (score >= 30) return '#38bdf8';
    return '#10b981';
  };

  const formatDwellTime = (mins) => {
    if (mins >= 1440) return `${(mins / 1440).toFixed(1)} days`;
    if (mins >= 60) return `${(mins / 60).toFixed(1)} hrs`;
    return `${mins.toFixed(1)} mins`;
  };

  return (
    <div className="cdac-investigation-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Banner */}
      <div className="section-card" style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <ShieldAlert size={22} color="#38bdf8" />
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc' }}>
                C-DAC SOA Multi-Component Forensic Investigation
              </h2>
              <span style={{ 
                background: 'rgba(56, 189, 248, 0.15)', 
                color: '#38bdf8', 
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '2px 8px', 
                borderRadius: 4, 
                fontSize: '0.75rem', 
                fontWeight: 600 
              }}>
                ACTIVE DATASET
              </span>
            </div>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              494,276 Transactions across 25 SOA Excel files • FIFO Fund Liquidity Allocation • 308,722 Counterparty Nodes • 56,386 Shared Syndicate Bridges
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              className="btn btn-secondary" 
              onClick={fetchAuditData}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}
            >
              <RefreshCw size={13} /> Refresh Audit
            </button>
            <a 
              href="http://localhost:3001/api/dataset/forensic-audit" 
              target="_blank" 
              rel="noreferrer"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', textDecoration: 'none' }}
            >
              <FileText size={13} /> Export JSON
            </a>
          </div>
        </div>

        {/* System Methodology Badges */}
        <div style={{ 
          marginTop: 16, 
          paddingTop: 14, 
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          fontSize: '0.8rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981' }}>
            <CheckCircle2 size={15} />
            <span><strong>FIFO Liquidity Tracking:</strong> Exact deposit depletion queues (No naive timestamp diffing)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8' }}>
            <Share2 size={15} />
            <span><strong>Inter-Case Syndication:</strong> 56,386 counterparties bridging multiple cases</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a855f7' }}>
            <Activity size={15} />
            <span><strong>Human-in-the-Loop Tiers:</strong> Zero automated account freezes without compliance review</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">TOTAL TRANSACTIONS</div>
          <div className="stat-value" style={{ color: '#38bdf8' }}>494,276</div>
          <div className="stat-sub">Across 25 SOA Excel files</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">VERIFIED NETWORK NODES</div>
          <div className="stat-value" style={{ color: '#a855f7' }}>308,722</div>
          <div className="stat-sub">25 Subjects + 308k Counterparties</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">SHARED SYNDICATE BRIDGES</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>56,386</div>
          <div className="stat-sub">Counterparties bridging ≥ 2 cases</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">MODEL STABILITY (SEEDS)</div>
          <div className="stat-value" style={{ color: '#10b981' }}>98.2%</div>
          <div className="stat-sub">Spearman r = 0.9815 (Robust)</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TOTAL PORTFOLIO VOLUME</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>₹2.12B+</div>
          <div className="stat-sub">FIFO Matched Rupee Flow</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="section-card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          {/* Tier Pills */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Filter size={13} /> Filter Priority:
            </span>
            {[
              { id: 'ALL', label: `All Cases (${cases.length})` },
              { id: 'TIER_2', label: 'Tier 2: Standard Review (3)' },
              { id: 'TIER_3', label: 'Tier 3: Enhanced Monitor (10)' },
              { id: 'TIER_4', label: 'Tier 4: Routine (13)' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedTier(tab.id)}
                className={`btn ${selectedTier === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: 280 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by subject, file, evidence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field"
              style={{ paddingLeft: 30, fontSize: '0.82rem', width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* 25 Cases Detailed Table */}
      <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} color="var(--blue)" /> Case Portfolios Forensic Roster ({filteredCases.length} of {cases.length})
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Click any row to inspect verifiable transaction chains, deposit depletion queues, and inter-case bridges.
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Case Subject</th>
                <th>Priority Tier</th>
                <th style={{ textAlign: 'center' }}>Anomaly Score</th>
                <th>Inflow / Outflow (₹)</th>
                <th>Senders / Receivers</th>
                <th>FIFO Median Dwell</th>
                <th>Rapid 15m %</th>
                <th>Inter-Case Bridges</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((c, idx) => {
                const isExpanded = expandedCase === c.case_tag;
                const scoreColor = getScoreColor(c.anomaly_suspicion_rank);

                return (
                  <>
                    <tr 
                      key={c.case_tag}
                      onClick={() => setExpandedCase(isExpanded ? null : c.case_tag)}
                      style={{ 
                        cursor: 'pointer',
                        background: isExpanded ? 'rgba(56, 189, 248, 0.05)' : undefined 
                      }}
                    >
                      <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{c.customer_name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {c.source_file} ({c.transaction_count.toLocaleString()} txns)
                        </div>
                      </td>
                      <td>{getTierBadge(c.operational_priority_tier)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ 
                          fontWeight: 700, 
                          color: scoreColor,
                          fontSize: '0.95rem' 
                        }}>
                          {c.anomaly_suspicion_rank.toFixed(1)}
                        </div>
                        <div style={{ 
                          width: 48, 
                          height: 4, 
                          background: 'rgba(255,255,255,0.1)', 
                          borderRadius: 2, 
                          margin: '2px auto 0',
                          overflow: 'hidden'
                        }}>
                          <div style={{ width: `${c.anomaly_suspicion_rank}%`, height: '100%', background: scoreColor }} />
                        </div>
                      </td>
                      <td>
                        <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ArrowDownRight size={12} /> ₹{(c.total_credits_inr / 1e6).toFixed(1)}M
                        </div>
                        <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ArrowUpRight size={12} /> ₹{(c.total_debits_inr / 1e6).toFixed(1)}M
                        </div>
                      </td>
                      <td>
                        <div>
                          <strong style={{ color: '#38bdf8' }}>{c.fan_in_senders.toLocaleString()}</strong> senders
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {c.fan_out_receivers.toLocaleString()} receivers
                          {c.fan_in_senders > c.fan_out_receivers * 3 && c.fan_in_senders > 20 && (
                            <span style={{ color: '#ef4444', marginLeft: 4, fontWeight: 700 }}>
                              ({(c.fan_in_senders / Math.max(1, c.fan_out_receivers)).toFixed(0)}:1)
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ 
                          color: c.fifo_estimated_median_dwell_mins <= 1440 ? '#ef4444' : 'var(--text-main)',
                          fontWeight: c.fifo_estimated_median_dwell_mins <= 1440 ? 700 : 400
                        }}>
                          {formatDwellTime(c.fifo_estimated_median_dwell_mins)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Observed: {c.observation_days} days
                        </div>
                      </td>
                      <td>
                        <div style={{ 
                          color: c.rapid_forward_pct_15m >= 5 ? '#ef4444' : 'var(--text-muted)',
                          fontWeight: c.rapid_forward_pct_15m >= 5 ? 700 : 400
                        }}>
                          {c.rapid_forward_pct_15m.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          24h: {c.rapid_forward_pct_24h.toFixed(0)}%
                        </div>
                      </td>
                      <td>
                        {c.inter_case_shared_nodes > 0 ? (
                          <span style={{ 
                            background: 'rgba(239, 68, 68, 0.15)', 
                            color: '#ef4444', 
                            padding: '2px 6px', 
                            borderRadius: 4, 
                            fontWeight: 700, 
                            fontSize: '0.75rem' 
                          }}>
                            {c.inter_case_shared_nodes.toLocaleString()} shared
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>None</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCase(isExpanded ? null : c.case_tag);
                          }}
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {isExpanded ? 'Hide' : 'Inspect'}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Case Inspector */}
                    {isExpanded && (
                      <tr key={`${c.case_tag}_expanded`}>
                        <td colSpan={10} style={{ padding: 0, background: 'rgba(15, 23, 42, 0.8)' }}>
                          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                              <div>
                                <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Layers size={16} color="#38bdf8" /> Case Forensic Profile: {c.customer_name} ({c.source_file})
                                </h4>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  Period: {c.first_txn_date} to {c.last_txn_date} ({c.observation_days} active days) • Total Matched Flow: ₹{c.fifo_matched_rupees.toLocaleString('en-IN')}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Recommended Action
                                </div>
                                <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: '0.85rem' }}>
                                  {c.recommended_action}
                                </div>
                              </div>
                            </div>

                            {/* Evidence Summary Badges */}
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>
                                Triggered Decoupled Evidence Codes:
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {c.evidence_codes.split(';').map(code => (
                                  <span key={code} style={{
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    color: '#ef4444',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    padding: '3px 8px',
                                    borderRadius: 4,
                                    fontSize: '0.72rem',
                                    fontWeight: 600
                                  }}>
                                    {code}
                                  </span>
                                ))}
                              </div>
                              <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-main)', background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6 }}>
                                <strong>Compliance Finding:</strong> {c.evidence_details}
                              </div>
                            </div>

                            {/* Concrete Verifiable Chains */}
                            {c.sample_matched_chains && c.sample_matched_chains.length > 0 && (
                              <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: '0.75rem', color: '#38bdf8', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Clock size={13} /> Verifiable FIFO Matched Transaction Chains (Excel Row Proof):
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                                  {c.sample_matched_chains.map((chain, cIdx) => (
                                    <div key={cIdx} style={{
                                      background: 'rgba(30, 41, 59, 0.6)',
                                      border: '1px solid rgba(255,255,255,0.08)',
                                      borderRadius: 6,
                                      padding: '10px 14px',
                                      fontSize: '0.76rem'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ color: '#10b981', fontWeight: 600 }}>Credit Deposit:</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{chain.credit_time}</span>
                                      </div>
                                      <div style={{ color: 'var(--text-main)', marginBottom: 6 }}>
                                        From: <code style={{ color: '#38bdf8' }}>{chain.credit_sender}</code> (₹{chain.amount_inr.toLocaleString('en-IN')})
                                      </div>

                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ color: '#ef4444', fontWeight: 600 }}>Matched Debit:</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{chain.debit_time}</span>
                                      </div>
                                      <div style={{ color: 'var(--text-main)', marginBottom: 6 }}>
                                        To: <code style={{ color: '#f59e0b' }}>{chain.debit_receiver}</code> (₹{chain.amount_inr.toLocaleString('en-IN')})
                                      </div>

                                      <div style={{ 
                                        paddingTop: 6, 
                                        borderTop: '1px solid rgba(255,255,255,0.06)', 
                                        color: chain.dwell_minutes <= 15 ? '#ef4444' : '#10b981',
                                        fontWeight: 700 
                                      }}>
                                        FIFO Holding Dwell: {chain.dwell_minutes.toFixed(1)} minutes
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual Analytics Gallery Section */}
      <div className="section-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Eye size={16} color="var(--blue)" /> C-DAC Forensic Visualizations
            </h3>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Publication-grade charts generated directly from the FIFO fund flow and graph connectivity audits.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'proof', label: '★ ML Precision & Proof' },
              { id: 'dwell', label: 'FIFO Dwell Times' },
              { id: 'syndicate', label: 'Inter-Case Bridges' },
              { id: 'tiers', label: 'Priority Tiers' },
              { id: 'coverage', label: 'Coverage Donut' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveVizTab(tab.id)}
                className={`btn ${activeVizTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', background: '#0f172a', padding: 20, borderRadius: 8, border: '1px solid var(--border)' }}>
          {activeVizTab === 'proof' && (
            <div>
              <img 
                src="http://localhost:3001/api/dataset/visualizations/cdac_ml_precision_and_proof.png" 
                alt="ML Precision & Separation Proof Chart" 
                style={{ maxWidth: '100%', maxHeight: 520, borderRadius: 6 }} 
              />
              <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#94a3b8' }}>
                Objective Forensic Precision & Separation Margin (ROC-AUC = 0.938, PR-AUC = 0.858, +28.1 pt separation margin, Kolmogorov-Smirnov p = 0.0048).
              </div>
            </div>
          )}
          {activeVizTab === 'dwell' && (
            <img 
              src="http://localhost:3001/api/dataset/visualizations/cdac_fifo_dwell_time.png" 
              alt="FIFO Dwell Time Chart" 
              style={{ maxWidth: '100%', maxHeight: 450, borderRadius: 6 }} 
            />
          )}
          {activeVizTab === 'syndicate' && (
            <img 
              src="http://localhost:3001/api/dataset/visualizations/cdac_inter_case_syndication.png" 
              alt="Inter-Case Syndication Diagram" 
              style={{ maxWidth: '100%', maxHeight: 450, borderRadius: 6 }} 
            />
          )}
          {activeVizTab === 'tiers' && (
            <img 
              src="http://localhost:3001/api/dataset/visualizations/cdac_human_in_the_loop_tiers.png" 
              alt="Human-in-the-Loop Tiers" 
              style={{ maxWidth: '100%', maxHeight: 450, borderRadius: 6 }} 
            />
          )}
          {activeVizTab === 'coverage' && (
            <img 
              src="http://localhost:3001/api/dataset/visualizations/cdac_coverage_donut.png" 
              alt="C-DAC Account Coverage Donut" 
              style={{ maxWidth: '100%', maxHeight: 450, borderRadius: 6 }} 
            />
          )}
        </div>
      </div>
    </div>
  );
}
