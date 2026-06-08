import { useState } from 'react';
import { useApi, apiPost } from '../hooks/useAnviksha.js';
import { Spinner, StatusPill } from '../components/ui.jsx';

const SOURCE_INFO = {
  I4C:          { label: 'I4C Suspect Registry', icon: '🏛️', desc: 'Indian Cyber Crime Coordination Centre' },
  NCRP:         { label: 'NCRP Complaint Feed', icon: '📋', desc: 'National Cyber Crime Reporting Portal' },
  '1930_helpline': { label: '1930 Helpline', icon: '📞', desc: 'Cybercrime helpline complaint feed' },
  RBI_DPIP:     { label: 'RBI DPIP', icon: '🏦', desc: 'Digital Payments Intelligence Platform' },
};

export default function RegulatoryFeeds() {
  const { data: feedData, loading: feedLoading } = useApi('/regulatory/feed-status', 10000);
  const { data: registryData, loading: regLoading, refetch } = useApi('/regulatory/suspect-registry', 8000);
  const [form, setForm] = useState({ identifier_type: 'phone', identifier_value: '', source: 'I4C', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const feeds = feedData?.feeds || [];
  const entries = registryData?.entries || [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.identifier_value) return;
    setSubmitting(true);
    try {
      await apiPost('/regulatory/suspect-registry', form);
      setSubmitted(true);
      refetch();
      setTimeout(() => setSubmitted(false), 3000);
      setForm(f => ({ ...f, identifier_value: '', reason: '' }));
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Feed status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        {feeds.map(feed => {
          const info = SOURCE_INFO[feed.name?.replace(' Feed', '').replace(' Suspect Registry', '')] || {};
          const isConnected = feed.status === 'connected';
          return (
            <div key={feed.name} className="card" style={{ borderLeft: `3px solid ${isConnected ? 'var(--success)' : 'var(--danger)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 1.4 + 'rem' }}>
                  {Object.values(SOURCE_INFO).find(s => feed.name?.includes(s.label.split(' ')[0]))?.icon || '📡'}
                </div>
                <StatusPill status={isConnected ? 'connected' : 'disconnected'} />
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>{feed.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                {Object.values(SOURCE_INFO).find(s => feed.name?.includes(s.label.split(' ')[0]))?.desc || 'Regulatory data feed'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Entries</span>
                <span style={{ fontFamily: 'var(--text-mono)', fontWeight: 700, color: feed.count > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{feed.count}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginTop: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>Last Update</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {new Date(feed.lastUpdate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid-2">
        {/* Suspect Registry Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div className="card-title">🔴 Suspect Registry</div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{entries.length} entries</span>
          </div>
          {regLoading ? (
            <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={24} /></div>
          ) : (
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th><th>Identifier</th><th>Source</th><th>Ref</th><th>Reported</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => (
                    <tr key={entry.id}>
                      <td>
                        <span style={{
                          background: 'var(--danger-dim)',
                          color: 'var(--danger)',
                          padding: '2px 7px',
                          borderRadius: 4,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}>{entry.identifier_type}</span>
                      </td>
                      <td className="font-mono text-xs truncate" style={{ maxWidth: 140 }} title={entry.identifier_value}>
                        {entry.identifier_value}
                      </td>
                      <td style={{ fontSize: '0.72rem', color: 'var(--blue)' }}>{entry.source}</td>
                      <td style={{ fontSize: '0.65rem', fontFamily: 'var(--text-mono)', color: 'var(--text-muted)' }}>
                        {entry.complaint_ref?.slice(-6)}
                      </td>
                      <td style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {new Date(entry.reported_at).toLocaleDateString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entries.length === 0 && (
                <div className="empty-state" style={{ padding: 40 }}>
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-text">No entries yet</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Suspect Form */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: 16 }}>
            <div className="card-title">➕ Add Suspect Entry</div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Simulate I4C feed update</span>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                Identifier Type
              </label>
              <select
                value={form.identifier_type}
                onChange={e => setForm(f => ({ ...f, identifier_type: e.target.value }))}
                style={{
                  width: '100%', background: 'var(--bg-glass)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
                  fontSize: '0.85rem', fontFamily: 'Inter, sans-serif',
                }}
              >
                <option value="phone">Phone Number</option>
                <option value="upi">UPI ID</option>
                <option value="account">Account Number</option>
                <option value="device">Device IMEI</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                Identifier Value
              </label>
              <input
                type="text"
                placeholder={form.identifier_type === 'phone' ? '+91XXXXXXXXXX' : 'Enter value'}
                value={form.identifier_value}
                onChange={e => setForm(f => ({ ...f, identifier_value: e.target.value }))}
                style={{
                  width: '100%', background: 'var(--bg-glass)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
                  fontSize: '0.85rem', fontFamily: 'Inter, sans-serif',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                Source
              </label>
              <select
                value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                style={{
                  width: '100%', background: 'var(--bg-glass)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
                  fontSize: '0.85rem', fontFamily: 'Inter, sans-serif',
                }}
              >
                <option value="I4C">I4C</option>
                <option value="NCRP">NCRP</option>
                <option value="1930_helpline">1930 Helpline</option>
                <option value="RBI_DPIP">RBI DPIP</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                Reason
              </label>
              <input
                type="text"
                placeholder="Reason for reporting"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                style={{
                  width: '100%', background: 'var(--bg-glass)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
                  fontSize: '0.85rem', fontFamily: 'Inter, sans-serif',
                }}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ marginTop: 4 }}>
              {submitting ? <Spinner size={14} /> : submitted ? '✓ Added' : '+ Add to Registry'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
