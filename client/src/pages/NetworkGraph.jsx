import { useEffect, useRef, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';
import { useApi } from '../hooks/useAnviksha.js';
import { Spinner, StatusPill, ScoreBar } from '../components/ui.jsx';

function NodeDetail({ node, onClose }) {
  if (!node) return null;
  return (
    <div style={{
      position: 'absolute', top: 16, right: 16,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-active)',
      borderRadius: 12,
      padding: 16,
      minWidth: 220,
      maxWidth: 280,
      boxShadow: 'var(--shadow-glow-blue)',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{node.name}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>×</button>
      </div>
      <div style={{ fontSize: '0.72rem', fontFamily: 'var(--text-mono)', color: 'var(--text-muted)', marginBottom: 10 }}>
        {node.accountNumber}
      </div>
      <StatusPill status={node.status || 'active'} />
      <div style={{ marginTop: 12 }}>
        <ScoreBar score={node.riskScore || 0} />
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[
          ['Fan-In', node.fanIn, node.fanIn >= 5],
          ['Fan-Out', node.fanOut, node.fanOut >= 3],
          ['Total In', '₹' + Number(node.totalIn || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), false],
          ['Total Out', '₹' + Number(node.totalOut || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), false],
        ].map(([label, val, warn]) => (
          <div key={label} style={{ background: 'var(--bg-glass)', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', fontFamily: 'var(--text-mono)', color: warn ? 'var(--danger)' : 'var(--text-primary)', marginTop: 2 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NetworkGraph({ graphData, loading }) {
  const [selected, setSelected] = useState(null);
  const [is3D, setIs3D] = useState(true);
  const containerRef = useRef();
  const fgRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 560 });

  // Apply custom forces to prevent clustering
  useEffect(() => {
    // Wrap in timeout to ensure engine is initialized
    const timer = setTimeout(() => {
      if (fgRef.current && typeof fgRef.current.d3Force === 'function') {
        try {
          const charge = fgRef.current.d3Force('charge');
          if (charge) charge.strength(-250);
          
          const link = fgRef.current.d3Force('link');
          if (link) link.distance(80);
          
          if (typeof fgRef.current.d3ReheatSimulation === 'function') {
            fgRef.current.d3ReheatSimulation();
          }
        } catch (e) {
          console.error('Error applying d3 forces:', e);
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [is3D, graphData]);

  // Handle container resize dynamically
  useEffect(() => {
    if (!containerRef.current) return;
    const updateDimensions = () => {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
      });
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [containerRef]);

  // Clone objects to prevent ForceGraph from mutating the original react state
  const gData = useMemo(() => {
    if (!graphData || !graphData.nodes?.length) return { nodes: [], links: [] };
    return {
      nodes: graphData.nodes.map(n => ({ ...n })),
      links: graphData.links.map(l => ({ 
        ...l, 
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target
      }))
    };
  }, [graphData]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
  );

  function nodeColor(d) {
    if (d.status === 'frozen') return '#64748b';
    if (d.riskScore >= 71 || d.isMule) return '#ff3366';
    if (d.riskScore >= 41) return '#ffaa00';
    if (d.riskScore >= 21) return '#facc15';
    return '#00e676';
  }

  function nodeRadius(d) {
    const vol = (d.totalIn || 0) + (d.totalOut || 0);
    return Math.min(Math.max(4, Math.log(vol / 10000 + 1) * 2 + 3), 12);
  }

  return (
    <div>
      {/* Controls & Legend */}
      <div className="card" style={{ padding: '12px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button 
              onClick={() => setIs3D(false)} 
              style={{ background: !is3D ? 'var(--primary)' : 'var(--bg-elevated)', color: 'white', border: 'none', padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}
            >2D</button>
            <button 
              onClick={() => setIs3D(true)} 
              style={{ background: is3D ? 'var(--primary)' : 'var(--bg-elevated)', color: 'white', border: 'none', padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}
            >3D Mode 🚀</button>
          </div>
          
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Legend:</span>
          {[
            ['🟢', 'Low Risk'],
            ['🟡', 'Medium'],
            ['🟠', 'High'],
            ['🔴', 'Critical'],
            ['⚫', 'Frozen'],
          ].map(([icon, label]) => (
            <span key={label}>{icon} {label}</span>
          ))}
          <span style={{ marginLeft: 'auto' }}>Node size = volume · Particles = transaction flow</span>
        </div>
      </div>

      {/* Graph */}
      <div className="card" style={{ padding: 0, position: 'relative', overflow: 'hidden' }}>
        <div ref={containerRef} style={{ height: 560, background: '#0b0f19' }}>
          
          {(!gData?.nodes?.length) ? (
            <div className="empty-state" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="empty-state-icon">🕸️</div>
              <div className="empty-state-text">Graph will populate as transactions flow in…</div>
            </div>
          ) : (
            is3D ? (
              <ForceGraph3D
                ref={fgRef}
                width={dimensions.width || 800}
                height={dimensions.height || 560}
                graphData={gData}
                nodeLabel="name"
                nodeColor={nodeColor}
                nodeVal={d => nodeRadius(d)}
                linkDirectionalParticles={d => Math.min(Math.max(2, Math.floor((d.value || 0) / 10000)), 8)}
                linkDirectionalParticleWidth={1.5}
                linkDirectionalParticleSpeed={0.005}
                linkColor={() => 'rgba(255,255,255,0.1)'}
                onNodeClick={node => setSelected(node)}
                backgroundColor="#0b0f19"
              />
            ) : (
              <ForceGraph2D
                ref={fgRef}
                width={dimensions.width || 800}
                height={dimensions.height || 560}
                graphData={gData}
                nodeLabel="name"
                nodeColor={nodeColor}
                nodeVal={d => nodeRadius(d)}
                linkDirectionalParticles={d => Math.min(Math.max(2, Math.floor((d.value || 0) / 10000)), 8)}
                linkDirectionalParticleWidth={1.5}
                linkDirectionalParticleSpeed={0.005}
                linkColor={() => 'rgba(255,255,255,0.1)'}
                onNodeClick={node => setSelected(node)}
                backgroundColor="#0b0f19"
              />
            )
          )}
          
          {selected && <NodeDetail node={selected} onClose={() => setSelected(null)} />}
        </div>
      </div>
    </div>
  );
}
