import { useState, useCallback, useRef } from 'react';
import { Activity, AlertTriangle, Share2, BarChart2, Radio, Brain } from 'lucide-react';
import Header from './components/Header.jsx';
import LiveFeed from './pages/LiveFeed.jsx';
import FlaggedAccounts from './pages/FlaggedAccounts.jsx';
import NetworkGraph from './pages/NetworkGraph.jsx';
import Analytics from './pages/Analytics.jsx';
import RegulatoryFeeds from './pages/RegulatoryFeeds.jsx';
import ModelInsights from './pages/ModelInsights.jsx';
import { useWebSocket, useApi } from './hooks/useAnviksha.js';
import { Spinner } from './components/ui.jsx';

const TABS = [
  { id: 'feed',       label: 'Live Feed',       icon: <Activity size={13} /> },
  { id: 'accounts',   label: 'Flagged Accounts', icon: <AlertTriangle size={13} /> },
  { id: 'graph',      label: 'Network Graph',    icon: <Share2 size={13} /> },
  { id: 'analytics',  label: 'Analytics',        icon: <BarChart2 size={13} /> },
  { id: 'ml',         label: 'ML Model',         icon: <Brain size={13} /> },
  { id: 'regulatory', label: 'Regulatory Feeds', icon: <Radio size={13} /> },
];

const MAX_FEED_ITEMS = 120;

export default function App() {
  const [activeTab, setActiveTab] = useState('feed');
  const [feed, setFeed] = useState([]);          // Live transaction feed
  const [alerts, setAlerts] = useState([]);       // Real-time alerts
  const [graphData, setGraphData] = useState(null);
  const [openAlertCount, setOpenAlertCount] = useState(0);
  const alertsLoadedRef = useRef(false);

  // Dashboard stats (poll every 4 seconds)
  const { data: statsData } = useApi('/dashboard/stats', 4000);
  const stats = statsData;

  // Graph (poll every 8 seconds)
  const { data: graphDataApi, loading: graphLoading } = useApi('/dashboard/graph', 8000);
  const resolvedGraph = graphData || graphDataApi;

  // Initial alerts from REST
  const { data: alertsData } = useApi('/alerts?status=open&limit=20', 6000);

  const allAlerts = [
    ...alerts,
    ...(alertsData?.alerts || []).filter(a => !alerts.find(wa => wa.id === a.id)),
  ].slice(0, 50);

  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'transaction': {
        setFeed(prev => [msg.data, ...prev].slice(0, MAX_FEED_ITEMS));
        break;
      }
      case 'alert': {
        const { alert, account, transaction, scoring } = msg.data;
        setAlerts(prev => [{ ...alert, account }, ...prev].slice(0, 50));
        setOpenAlertCount(c => c + 1);
        break;
      }
      case 'suspect_registry': {
        setGraphData(null);
        break;
      }
      case 'init': {
        setOpenAlertCount(msg.data?.open_alerts || 0);
        break;
      }
    }
  }, []);

  const wsConnected = useWebSocket(handleWsMessage);

  return (
    <div className="app-layout">
      {}
      <Header stats={stats} wsConnected={wsConnected} />

      {}
      <div className="nav-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.id); if (tab.id === 'accounts') setOpenAlertCount(0); }}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'accounts' && openAlertCount > 0 && (
              <span className="nav-tab-badge">{openAlertCount > 99 ? '99+' : openAlertCount}</span>
            )}
          </button>
        ))}
      </div>

      {}
      <main className="app-content">
        {}
        {stats && (
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-icon blue">
                <Activity size={18} />
              </div>
              <div className="stat-info">
                <div className="stat-value" style={{ color: 'var(--blue)' }}>
                  {(stats.total_transactions || 0).toLocaleString('en-IN')}
                </div>
                <div className="stat-label">Total Transactions</div>
                <div className="stat-trend" style={{ color: 'var(--text-muted)' }}>
                  {(stats.txnByType || []).map(t => t.type).join(' · ')}
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon red">
                <AlertTriangle size={18} />
              </div>
              <div className="stat-info">
                <div className="stat-value" style={{ color: 'var(--danger)' }}>
                  {stats.flagged_transactions || 0}
                </div>
                <div className="stat-label">Flagged Transactions</div>
                <div className="stat-trend up">
                  {stats.total_transactions > 0
                    ? ((stats.flagged_transactions / stats.total_transactions) * 100).toFixed(1) + '% fraud rate'
                    : 'No data yet'}
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon amber">
                <AlertTriangle size={18} />
              </div>
              <div className="stat-info">
                <div className="stat-value" style={{ color: 'var(--warning)' }}>
                  {stats.flagged_accounts || 0}
                </div>
                <div className="stat-label">Flagged Accounts</div>
                <div className="stat-trend" style={{ color: 'var(--text-muted)' }}>
                  out of {stats.total_accounts || 0} total
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <BarChart2 size={18} />
              </div>
              <div className="stat-info">
                <div className="stat-value" style={{ color: stats.open_alerts > 5 ? 'var(--danger)' : 'var(--success)' }}>
                  {stats.open_alerts || 0}
                </div>
                <div className="stat-label">Open Alerts</div>
                <div className="stat-trend" style={{ color: 'var(--text-muted)' }}>requiring review</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon purple">
                <Radio size={18} />
              </div>
              <div className="stat-info">
                <div className="stat-value" style={{ color: '#a78bfa', fontSize: '1rem' }}>
                  ₹{Number(stats.flagged_volume || 0).toLocaleString('en-IN', { maximumFractionDigits: 0, notation: 'compact', compactDisplay: 'short' })}
                </div>
                <div className="stat-label">At-Risk Volume</div>
                <div className="stat-trend" style={{ color: 'var(--text-muted)' }}>
                  in flagged transactions
                </div>
              </div>
            </div>
          </div>
        )}

        {}
        {activeTab === 'feed'       && <LiveFeed feed={feed} />}
        {activeTab === 'accounts'   && <FlaggedAccounts alerts={allAlerts} />}
        {activeTab === 'graph'      && <NetworkGraph graphData={resolvedGraph} loading={graphLoading && !resolvedGraph} />}
        {activeTab === 'analytics'  && <Analytics stats={stats} />}
        {activeTab === 'ml'         && <ModelInsights />}
        {activeTab === 'regulatory' && <RegulatoryFeeds />}
      </main>
    </div>
  );
}
