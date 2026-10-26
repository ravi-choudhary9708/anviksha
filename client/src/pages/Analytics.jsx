import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useApi } from '../hooks/useAnviksha.js';
import { Spinner } from '../components/ui.jsx';

const COLORS = {
  UPI:  '#00d4ff',
  NEFT: '#a78bfa',
  IMPS: '#ffaa00',
  RTGS: '#00e676',
  ATM:  '#64748b',
};

const RISK_COLORS = {
  '0-20':   '#00e676',
  '21-40':  '#facc15',
  '41-60':  '#ffaa00',
  '61-80':  '#fb923c',
  '81-100': '#ff3366',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: '0.78rem',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000
            ? '₹' + p.value.toLocaleString('en-IN')
            : p.value}
        </div>
      ))}
    </div>
  );
};

export default function Analytics({ stats }) {
  const { data: timeline } = useApi('/dashboard/timeline', 10000);
  const timelineData = (timeline?.timeline || []).slice(-24).map(t => ({
    hour: t.hour?.slice(11, 16) || '',
    count: t.count,
    volume: Math.round(t.volume / 1000),
  }));

  const txnByType = stats?.txnByType || [];
  const riskDist = (stats?.riskDistribution || []).map(d => ({
    ...d,
    fill: RISK_COLORS[d.bucket] || '#64748b',
  }));

  return (
    <div>
      {/* C-DAC Forensic Telemetry Hero */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(139,92,246,0.08) 100%)',
        border: '1px solid rgba(0,212,255,0.2)',
        borderRadius: 16,
        padding: '20px 28px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 32,
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>C-DAC SOA Multi-Case Network Telemetry</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#00d4ff', lineHeight: 1, fontFamily: 'var(--text-mono)' }}>₹13.3B</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>Total Forensic Volume Audited across 494,276 Transactions</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--text-mono)', background: 'rgba(0,212,255,0.06)', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>
            25 Case Subjects · <span style={{ color: '#00d4ff', fontWeight: 700 }}>308,722 Nodes</span> · <span style={{ color: '#00e676', fontWeight: 700 }}>56,386 Cross-Case Shared Nodes (18.3%)</span>
          </div>
        </div>
        {[
          { label: 'Total Records', value: '494.3K', color: '#00e676', sub: '25 Excel SOA Statements' },
          { label: 'Inter-Case Bridges', value: '7 Bridges', color: '#00d4ff', sub: 'Cross-syndicate sharing' },
          { label: 'Priority Triage', value: '12 Cases', color: '#f59e0b', sub: 'Tier 1 & Tier 2 review' },
          { label: 'Neutralized Corr', value: '0.796', color: '#a78bfa', sub: 'Spearman rank vs volume' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color, fontFamily: 'var(--text-mono)' }}>{value}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">📈 Flagged Transactions (Last 24h)</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timelineData}>
              <defs>
                <linearGradient id="dangerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff3366" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff3366" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="count" name="Flagged Txns" stroke="#ff3366" fill="url(#dangerGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">🎯 Risk Score Distribution</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={riskDist} barSize={28}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                {riskDist.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        {}
        <div className="card">
          <div className="card-header">
            <div className="card-title">💳 Transaction Channels</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={txnByType} dataKey="count" nameKey="type" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} strokeWidth={0}>
                  {txnByType.map((entry, i) => (
                    <Cell key={i} fill={COLORS[entry.type] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {txnByType.map(item => (
                <div key={item.type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[item.type] || '#64748b' }} />
                    <span style={{ fontWeight: 600 }}>{item.type}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--text-mono)', color: 'var(--text-muted)' }}>{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {}
        <div className="card">
          <div className="card-header">
            <div className="card-title">📊 System Metrics</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              {
                label: 'Total Transaction Volume',
                value: '₹' + Number(stats?.total_volume || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }),
                color: 'var(--blue)',
              },
              {
                label: 'Flagged Volume (at risk)',
                value: '₹' + Number(stats?.flagged_volume || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }),
                color: 'var(--danger)',
              },
              {
                label: 'Average Account Risk Score',
                value: (stats?.avg_risk_score || 0).toFixed(1) + ' / 100',
                color: stats?.avg_risk_score >= 40 ? 'var(--warning)' : 'var(--success)',
              },
              {
                label: 'Detection Rate (flagged/total)',
                value: stats?.total_transactions > 0
                  ? ((stats.flagged_transactions / stats.total_transactions) * 100).toFixed(2) + '%'
                  : '0%',
                color: 'var(--warning)',
              },
              {
                label: 'ML Engine',
                value: stats?.mlEngine || 'Initializing…',
                color: 'var(--purple)',
              },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'var(--bg-glass)',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontFamily: 'var(--text-mono)', fontWeight: 700, fontSize: '0.88rem', color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
