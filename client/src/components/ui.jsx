// ============================================================
// RiskBadge — Color-coded risk score pill
// ============================================================
export function RiskBadge({ score }) {
  const level =
    score >= 71 ? 'critical' :
    score >= 41 ? 'high' :
    score >= 21 ? 'medium' : 'low';

  const label =
    level === 'critical' ? '🚨 CRITICAL' :
    level === 'high'     ? '⚠️ HIGH' :
    level === 'medium'   ? '▲ MED' : '✓ LOW';

  return (
    <span className={`risk-badge ${level}`}>
      {label} {score.toFixed(0)}
    </span>
  );
}

// ============================================================
// ScoreBar — Visual bar showing a score 0-100
// ============================================================
export function ScoreBar({ score, showValue = true }) {
  const level =
    score >= 71 ? 'critical' :
    score >= 41 ? 'high' :
    score >= 21 ? 'medium' : 'low';

  return (
    <div className="score-bar-wrap">
      <div className="score-bar-track">
        <div
          className={`score-bar-fill ${level}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      {showValue && (
        <span className="score-value" style={{ color: level === 'critical' ? 'var(--danger)' : level === 'high' ? 'var(--warning)' : level === 'medium' ? '#facc15' : 'var(--success)' }}>
          {score.toFixed(0)}
        </span>
      )}
    </div>
  );
}

// ============================================================
// StatusPill — Account/feed status indicator
// ============================================================
export function StatusPill({ status }) {
  return <span className={`status-pill ${status}`}>{status.replace('_', ' ')}</span>;
}

// ============================================================
// AmountDisplay — Format INR amounts
// ============================================================
export function AmountDisplay({ amount, className = '' }) {
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
  return <span className={`font-mono ${className}`}>{formatted}</span>;
}

// ============================================================
// TimeAgo — Relative timestamp
// ============================================================
export function TimeAgo({ ts }) {
  const date = new Date(ts);
  const diff = (Date.now() - date.getTime()) / 1000;

  let label;
  if (diff < 10)      label = 'just now';
  else if (diff < 60) label = `${Math.floor(diff)}s ago`;
  else if (diff < 3600) label = `${Math.floor(diff / 60)}m ago`;
  else if (diff < 86400) label = `${Math.floor(diff / 3600)}h ago`;
  else                label = date.toLocaleDateString('en-IN');

  return <span className="text-muted text-xs" title={date.toLocaleString('en-IN')}>{label}</span>;
}

// ============================================================
// TxnTypeBadge — UPI / NEFT / IMPS badge
// ============================================================
const TYPE_COLORS = {
  UPI:  { bg: 'rgba(0, 212, 255, 0.12)', color: '#00d4ff' },
  NEFT: { bg: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa' },
  IMPS: { bg: 'rgba(255, 170, 0, 0.12)', color: '#ffaa00' },
  RTGS: { bg: 'rgba(0, 230, 118, 0.12)', color: '#00e676' },
  ATM:  { bg: 'rgba(100, 116, 139, 0.15)', color: '#94a3b8' },
};

export function TxnTypeBadge({ type }) {
  const style = TYPE_COLORS[type] || TYPE_COLORS.ATM;
  return (
    <span style={{
      background: style.bg,
      color: style.color,
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '0.68rem',
      fontWeight: 700,
      fontFamily: 'var(--text-mono)',
      letterSpacing: '0.04em',
    }}>
      {type}
    </span>
  );
}

// ============================================================
// Spinner — Loading state
// ============================================================
export function Spinner({ size = 20 }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid rgba(255,255,255,0.1)`,
      borderTopColor: 'var(--blue)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  );
}

// Add spin keyframes via style tag (once)
if (typeof document !== 'undefined' && !document.getElementById('spin-style')) {
  const s = document.createElement('style');
  s.id = 'spin-style';
  s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}
