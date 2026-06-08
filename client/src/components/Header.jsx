import { Shield, AlertTriangle, Activity, Database, Wifi, WifiOff } from 'lucide-react';

export default function Header({ stats, wsConnected }) {
  const flaggedPct = stats?.total_transactions > 0
    ? ((stats.flagged_transactions / stats.total_transactions) * 100).toFixed(1)
    : '0.0';

  return (
    <header className="app-header">
      <div className="header-inner">
        {/* Brand */}
        <div className="header-brand">
          <div className="brand-logo">A</div>
          <div>
            <div className="brand-name">Anviksha</div>
            <div className="brand-tagline">Mule Account Detection · BOI Hackathon 2026</div>
          </div>
        </div>

        {/* Live Stats */}
        <div className="header-stats">
          <div className="header-stat">
            <div className="header-stat-value" style={{ color: 'var(--text-primary)' }}>
              {(stats?.total_transactions || 0).toLocaleString('en-IN')}
            </div>
            <div className="header-stat-label">Transactions</div>
          </div>

          <div style={{ width: 1, height: 28, background: 'var(--border)' }} />

          <div className="header-stat">
            <div className="header-stat-value" style={{ color: 'var(--danger)' }}>
              {stats?.flagged_accounts || 0}
            </div>
            <div className="header-stat-label">Flagged Accounts</div>
          </div>

          <div style={{ width: 1, height: 28, background: 'var(--border)' }} />

          <div className="header-stat">
            <div className="header-stat-value" style={{ color: 'var(--warning)' }}>
              {stats?.open_alerts || 0}
            </div>
            <div className="header-stat-label">Open Alerts</div>
          </div>

          <div style={{ width: 1, height: 28, background: 'var(--border)' }} />

          <div className="header-stat">
            <div className="header-stat-value" style={{ color: flaggedPct > 10 ? 'var(--danger)' : 'var(--text-primary)' }}>
              {flaggedPct}%
            </div>
            <div className="header-stat-label">Fraud Rate</div>
          </div>

          <div style={{ width: 1, height: 28, background: 'var(--border)' }} />

          {/* ML Engine Badge */}
          <div style={{
            padding: '4px 10px',
            background: 'rgba(124, 58, 237, 0.12)',
            border: '1px solid rgba(124, 58, 237, 0.25)',
            borderRadius: 6,
            fontSize: '0.68rem',
            fontWeight: 600,
            color: '#a78bfa',
            maxWidth: 160,
            textAlign: 'center',
            lineHeight: 1.3,
          }}>
            {stats?.mlEngine || 'ML Engine'}
          </div>

          {/* Live WS indicator */}
          <div className="live-indicator">
            {wsConnected
              ? <><div className="live-dot" />LIVE</>
              : <><WifiOff size={11} />OFFLINE</>
            }
          </div>
        </div>
      </div>
    </header>
  );
}
