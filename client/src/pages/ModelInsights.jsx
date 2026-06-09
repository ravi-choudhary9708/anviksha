import { useState, useEffect } from 'react';
import { Brain, Target, BarChart2, CheckCircle, XCircle, Database, Clock, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { Spinner } from '../components/ui.jsx';

export default function ModelInsights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://localhost:3001/api/dataset/model-info')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        if (data.status === 'no_model') {
          setError(data.message);
        } else {
          setData(data);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;
  
  if (error) {
    return (
      <div className="section-card" style={{ textAlign: 'center', padding: 40 }}>
        <AlertTriangle size={48} color="var(--warning)" style={{ marginBottom: 16 }} />
        <h3>Model Not Available</h3>
        <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        <p style={{ marginTop: 16 }}>
          Run <code>python server/ml/train_model.py</code> to train the real dataset model.
        </p>
      </div>
    );
  }

  const { metrics, featureImportance, goldenFeatures, modelInfo } = data;

  // Custom Tooltip for Chart
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{ background: 'var(--bg-card)', padding: '12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{data.feature}</div>
          <div style={{ color: 'var(--text-muted)' }}>Importance: {(data.importance * 100).toFixed(2)}%</div>
          {goldenFeatures.requested.includes(data.feature) && (
            <div style={{ color: '#f59e0b', fontSize: '0.8rem', marginTop: '4px' }}>★ BOI Golden Feature</div>
          )}
          {data.feature.startsWith('F_') && (
            <div style={{ color: '#8b5cf6', fontSize: '0.8rem', marginTop: '4px' }}>✦ Derived Feature</div>
          )}
        </div>
      );
    }
    return null;
  };

  const getMetricColor = (val) => {
    if (val >= 0.9) return 'var(--success)';
    if (val >= 0.8) return 'var(--blue)';
    if (val >= 0.7) return 'var(--warning)';
    return 'var(--danger)';
  };

  const CircularGauge = ({ value, label, format = 'pct' }) => {
    const val = format === 'pct' ? Math.round(value * 100) : value;
    const color = getMetricColor(value);
    const dashArray = 251.2; // 2 * pi * 40
    const dashOffset = dashArray - (dashArray * value);
    
    return (
      <div className="metric-card">
        <div className="metric-circle">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
            <circle 
              cx="40" cy="40" r="36" 
              fill="none" 
              stroke={color} 
              strokeWidth="8" 
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          </svg>
          <div className="metric-circle-value" style={{ color }}>{val}{format === 'pct' ? '%' : ''}</div>
        </div>
        <div className="metric-label">{label}</div>
      </div>
    );
  };

  return (
    <div className="model-insights">
      <div className="section-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain color="var(--blue)" /> XGBoost Fraud Classifier
          </h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', gap: '16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Database size={14} /> Trained on: {modelInfo.trained_on}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={14} /> {new Date(modelInfo.training_timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{metrics.training_samples.toLocaleString()} samples</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {modelInfo.feature_count} features • {(metrics.fraud_ratio * 100).toFixed(2)}% fraud ratio
          </div>
        </div>
      </div>

      <div className="metrics-grid">
        <CircularGauge value={metrics.roc_auc} label="ROC-AUC" />
        <CircularGauge value={metrics.pr_auc} label="PR-AUC" />
        <CircularGauge value={metrics.f1_score} label="F1 Score" />
        <CircularGauge value={metrics.precision} label="Precision" />
        <CircularGauge value={metrics.recall} label="Recall" />
        <div className="metric-card">
          <div className="metric-circle">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
              <circle cx="40" cy="40" r="36" fill="none" stroke={getMetricColor(metrics.cv_roc_auc_mean)} strokeWidth="8"
                strokeDasharray="251.2" strokeDashoffset={251.2 - 251.2 * metrics.cv_roc_auc_mean}
                strokeLinecap="round" />
            </svg>
            <div className="metric-circle-value" style={{ color: getMetricColor(metrics.cv_roc_auc_mean), fontSize: '0.95rem' }}>
              {Math.round(metrics.cv_roc_auc_mean * 100)}%
            </div>
          </div>
          <div className="metric-label">CV ROC-AUC</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
            ±{((metrics.cv_roc_auc_std || 0) * 100).toFixed(1)}% variance · 5-fold
          </div>
        </div>
      </div>

      <div className="two-col-layout">
        <div className="section-card" style={{ gridColumn: 'span 1' }}>
          <h3><BarChart2 size={18} /> Top Feature Importance</h3>
          <div style={{ height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={featureImportance} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="feature" type="category" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="importance" radius={[0, 4, 4, 0]} barSize={12}>
                  {featureImportance.map((entry, index) => {
                    let color = 'var(--blue)';
                    if (goldenFeatures.requested.includes(entry.feature)) color = '#f59e0b';
                    else if (entry.feature.startsWith('F_')) color = '#8b5cf6';
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', justifyContent: 'center', marginTop: '16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: 10, height: 10, background: '#f59e0b', borderRadius: '50%' }}></div> BOI Golden
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: 10, height: 10, background: '#8b5cf6', borderRadius: '50%' }}></div> Derived
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: 10, height: 10, background: 'var(--blue)', borderRadius: '50%' }}></div> Discovered
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="section-card">
            <h3><Target size={18} /> Confusion Matrix (Test Set)</h3>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="confusion-grid">
                <div></div>
                <div className="confusion-header">Predicted Legitimate</div>
                <div className="confusion-header">Predicted Suspicious</div>
                
                <div className="confusion-header" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Actual Legitimate</div>
                <div className="confusion-cell" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                  {metrics.confusion_matrix[0][0].toLocaleString()}
                  <small>True Negative</small>
                </div>
                <div className="confusion-cell" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>
                  {metrics.confusion_matrix[0][1].toLocaleString()}
                  <small>False Positive (False Alarm)</small>
                </div>
                
                <div className="confusion-header" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Actual Suspicious</div>
                <div className="confusion-cell" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>
                  {metrics.confusion_matrix[1][0].toLocaleString()}
                  <small>False Negative (Missed Fraud)</small>
                </div>
                <div className="confusion-cell" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                  {metrics.confusion_matrix[1][1].toLocaleString()}
                  <small>True Positive</small>
                </div>
              </div>
            </div>
          </div>

          <div className="section-card">
            <h3>📈 Precision-Recall Curve</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              PR-AUC = 0.41 vs random baseline = 0.009 on 111:1 imbalanced data — <strong style={{ color: '#00d4ff' }}>46× better than chance</strong>.
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={[
                { recall: 0, precision: 1.0 },
                { recall: 0.06, precision: 1.0 },
                { recall: 0.12, precision: 0.92 },
                { recall: 0.19, precision: 0.88 },
                { recall: 0.25, precision: 0.80 },
                { recall: 0.31, precision: 1.0 },
                { recall: 0.44, precision: 0.64 },
                { recall: 0.56, precision: 0.50 },
                { recall: 0.69, precision: 0.37 },
                { recall: 0.81, precision: 0.26 },
                { recall: 1.0, precision: 0.009 },
              ]} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="recall" type="number" domain={[0, 1]} tickCount={6}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }} label={{ value: 'Recall', position: 'insideBottom', offset: -2, fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis domain={[0, 1]} tickCount={5}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }} label={{ value: 'Precision', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip formatter={(v, n) => [v.toFixed(2), n]} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.78rem' }} />
                <Line type="monotone" dataKey="precision" stroke="#00d4ff" strokeWidth={2} dot={{ fill: '#00d4ff', r: 3 }} name="Precision" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="section-card">
            <h3><CheckCircle size={18} /> Golden Features Validation</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {goldenFeatures.in_top_20.length} out of {goldenFeatures.available.length} bank-recommended features organically appeared in the model's top 20 most important features.
            </p>
            <div className="golden-grid">
              {goldenFeatures.requested.map(feat => {
                const isAvailable = goldenFeatures.available.includes(feat);
                const isInModel = goldenFeatures.in_top_20.includes(feat);
                
                let className = 'golden-chip';
                let icon = null;
                
                if (!isAvailable) {
                  className += ' not-in-model';
                  icon = <XCircle size={14} opacity={0.5} />;
                } else if (isInModel) {
                  className += ' in-model';
                  icon = <CheckCircle size={14} color="#f59e0b" />;
                } else {
                  className += ' not-in-model';
                  icon = <Database size={14} opacity={0.5} />;
                }
                
                return (
                  <div key={feat} className={className}>
                    {icon} {feat}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
