import { useState } from 'react';
import { Lock, Unlock, ChevronDown, ChevronUp, User, AlertCircle } from 'lucide-react';
import { useApi, apiPost } from '../hooks/useAnviksha.js';
import { RiskBadge, ScoreBar, StatusPill, AmountDisplay, Spinner } from '../components/ui.jsx';

function AccountDetail({ accountId, onClose, onRefresh }) {
  const { data, loading } = useApi(`/accounts/${accountId}`, 5000);

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
      <Spinner size={28} />
    </div>
  );

  const { account, transactions, neighbors, openAlerts } = data || {};
  if (!account) return null;

  const aiAlert = openAlerts?.find(a => a.ai_explanation);

  return (
    <div className="expand-panel" style={{ padding: 20 }}>
      {/* AI Explanation */}
      {aiAlert?.ai_explanation && (
        <div className="alert-explanation" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--blue)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            🤖 AI Case Analysis
          </div>
          {aiAlert.ai_explanation}
        </div>
      )}

      <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
        {/* Account profile */}
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Account Profile</div>
          {[
            ['Account No.', account.account_number, true],
            ['UPI ID', account.upi_id, true],
            ['Phone', account.phone],
            ['IFSC', account.ifsc_code, true],
            ['Account Type', account.account_type],
            ['KYC Status', account.kyc_status],
            ['Opened', new Date(account.opened_date).toLocaleDateString('en-IN')],
          ].map(([label, val, mono]) => val ? (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
              <span className="text-muted">{label}</span>
              <span className={mono ? 'font-mono' : ''}>{val}</span>
            </div>
          ) : null)}
        </div>

        {/* Graph metrics */}
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Network Metrics</div>
          {[
            ['Fan-In (Unique Senders)', account.fanIn, account.fanIn >= 5],
            ['Fan-Out (Unique Recipients)', account.fanOut, account.fanOut >= 3],
            ['Pass-Through Ratio', (account.passthroughRatio * 100).toFixed(1) + '%', account.passthroughRatio >= 0.7],
            ['Connected Accounts', (neighbors?.senders?.length || 0) + (neighbors?.receivers?.length || 0)],
            ['Open Alerts', openAlerts?.length || 0, openAlerts?.length > 0],
          ].map(([label, val, warn]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
              <span className="text-muted">{label}</span>
              <span style={{ color: warn ? 'var(--danger)' : 'var(--text-primary)', fontWeight: warn ? 700 : 400, fontFamily: 'var(--text-mono)' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      {transactions?.length > 0 && (
        <>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Recent Transactions</div>
          <table className="data-table" style={{ marginBottom: 0 }}>
            <thead>
              <tr>
                <th>Type</th><th>Direction</th><th>Amount</th><th>Risk</th><th>Time</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 8).map(txn => (
                <tr key={txn.id}>
                  <td><span className="font-mono text-xs">{txn.type}</span></td>
                  <td style={{ fontSize: '0.75rem', color: txn.receiver_account_id === accountId ? 'var(--success)' : 'var(--warning)' }}>
                    {txn.receiver_account_id === accountId ? '↓ IN' : '↑ OUT'}
                  </td>
                  <td><AmountDisplay amount={txn.amount} /></td>
                  <td>{txn.risk_score > 0 ? <ScoreBar score={txn.risk_score} showValue /> : '—'}</td>
                  <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {new Date(txn.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default function FlaggedAccounts({ alerts }) {
  const { data, loading, refetch } = useApi('/accounts?min_risk=30', 5000);
  const [expanded, setExpanded] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const accounts = data?.accounts || [];

  async function handleFreeze(e, accountId, currentStatus) {
    e.stopPropagation();
    setActionLoading(accountId);
    try {
      const endpoint = currentStatus === 'frozen' ? `/accounts/${accountId}/unfreeze` : `/accounts/${accountId}/freeze`;
      await apiPost(endpoint, {});
      refetch();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div>
  );

  return (
    <div>
      {/* Alert queue summary */}
      {alerts.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title"><AlertCircle size={14} style={{ color: 'var(--danger)' }} /> Alert Queue</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{alerts.filter(a => a.status === 'open').length} open</span>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {alerts.filter(a => a.status === 'open').slice(0, 5).map(alert => (
              <div key={alert.id} className={`alert-card ${alert.severity}`}>
                <div className="alert-header">
                  <div>
                    <div className="alert-title">{alert.title}</div>
                    <div className="alert-meta">
                      {alert.alert_type?.toUpperCase()} · {alert.severity?.toUpperCase()} ·{' '}
                      {new Date(alert.created_at).toLocaleTimeString('en-IN')}
                    </div>
                  </div>
                  <RiskBadge score={alert.account?.risk_score || 0} />
                </div>
                {alert.ai_explanation && (
                  <div className="alert-explanation">{alert.ai_explanation}</div>
                )}
                {!alert.ai_explanation && alert.description && (
                  <div className="alert-explanation" style={{ borderLeftColor: 'var(--border)' }}>{alert.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flagged accounts table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="card-title"><User size={14} /> Suspicious Accounts</div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{accounts.length} accounts · risk ≥ 30</span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Account Holder</th>
              <th>Account No.</th>
              <th>Risk Score</th>
              <th>Fan-In</th>
              <th>Fan-Out</th>
              <th>Passthrough</th>
              <th>Status</th>
              <th>Actions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(acc => {
              const isOpen = expanded === acc.id;
              const isFrozen = acc.status === 'frozen';

              return [
                <tr
                  key={acc.id}
                  style={{ cursor: 'pointer', borderLeft: `2px solid ${acc.risk_score >= 71 ? 'var(--danger)' : acc.risk_score >= 41 ? 'var(--warning)' : 'transparent'}` }}
                  onClick={() => setExpanded(isOpen ? null : acc.id)}
                >
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{acc.account_holder}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{acc.upi_id}</div>
                  </td>
                  <td className="font-mono text-sm">{acc.account_number}</td>
                  <td style={{ minWidth: 160 }}>
                    <ScoreBar score={acc.risk_score || 0} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--text-mono)', fontWeight: 700, color: acc.fanIn >= 5 ? 'var(--danger)' : 'var(--text-primary)' }}>
                      {acc.fanIn}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--text-mono)', fontWeight: 700, color: acc.fanOut >= 3 ? 'var(--warning)' : 'var(--text-primary)' }}>
                      {acc.fanOut}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--text-mono)', fontSize: '0.8rem', color: acc.passthroughRatio >= 0.7 ? 'var(--danger)' : 'var(--text-primary)' }}>
                    {(acc.passthroughRatio * 100).toFixed(0)}%
                  </td>
                  <td><StatusPill status={acc.status || 'active'} /></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      className={`btn ${isFrozen ? 'btn-ghost' : 'btn-danger'}`}
                      style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                      onClick={e => handleFreeze(e, acc.id, acc.status)}
                      disabled={actionLoading === acc.id}
                    >
                      {actionLoading === acc.id ? <Spinner size={12} /> : isFrozen ? <><Unlock size={11} /> Unfreeze</> : <><Lock size={11} /> Freeze</>}
                    </button>
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${acc.id}-detail`}>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <AccountDetail accountId={acc.id} onRefresh={refetch} />
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>

        {accounts.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <div className="empty-state-text">No suspicious accounts detected</div>
          </div>
        )}
      </div>
    </div>
  );
}
