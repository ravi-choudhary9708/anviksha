import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
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
  const svgRef = useRef(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!graphData || !svgRef.current) return;
    const { nodes, links } = graphData;
    if (!nodes?.length) return;

    const container = svgRef.current.parentElement;
    const W = container.clientWidth || 800;
    const H = container.clientHeight || 540;

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', W)
      .attr('height', H);

    // Zoom + pan
    const g = svg.append('g');
    svg.call(d3.zoom()
      .scaleExtent([0.3, 4])
      .on('zoom', e => g.attr('transform', e.transform))
    );

    // Arrowhead marker
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', 'rgba(255,255,255,0.2)');

    // Force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(100).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(28));

    // Links
    const link = g.append('g').selectAll('line')
      .data(links).join('line')
      .attr('stroke', 'rgba(255,255,255,0.1)')
      .attr('stroke-width', d => Math.min(Math.log(d.value / 10000 + 1) + 1, 5))
      .attr('marker-end', 'url(#arrow)');

    const nodeG = g.append('g').selectAll('g')
      .data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on('click', (e, d) => { e.stopPropagation(); setSelected(d); });

    function nodeColor(d) {
      if (d.status === 'frozen') return '#64748b';
      if (d.riskScore >= 71 || d.isMule) return '#ff3366';
      if (d.riskScore >= 41) return '#ffaa00';
      if (d.riskScore >= 21) return '#facc15';
      return '#00e676';
    }

    function nodeRadius(d) {
      const vol = (d.totalIn || 0) + (d.totalOut || 0);
      return Math.min(Math.max(10, Math.log(vol / 10000 + 1) * 5 + 8), 28);
    }

    nodeG.filter(d => d.riskScore >= 71 || d.isMule)
      .append('circle')
      .attr('r', d => nodeRadius(d) + 6)
      .attr('fill', 'none')
      .attr('stroke', '#ff3366')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.4)
      .attr('stroke-dasharray', '4 2');

    nodeG.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', d => nodeColor(d) + '22')
      .attr('stroke', nodeColor)
      .attr('stroke-width', 2);

    nodeG.append('text')
      .text(d => d.name.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeRadius(d) + 14)
      .attr('font-size', '10px')
      .attr('fill', 'rgba(255,255,255,0.6)')
      .attr('font-family', 'Inter, sans-serif');

    nodeG.filter(d => d.riskScore >= 10)
      .append('text')
      .text(d => Math.round(d.riskScore))
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .attr('fill', d => nodeColor(d))
      .attr('font-family', 'JetBrains Mono, monospace');

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeG.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    svg.on('click', () => setSelected(null));

    return () => simulation.stop();
  }, [graphData]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
  );

  return (
    <div>
      {}
      <div className="card" style={{ padding: '12px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Legend:</span>
          {[
            ['🟢', 'Low Risk (0-20)'],
            ['🟡', 'Medium (21-40)'],
            ['🟠', 'High (41-70)'],
            ['🔴', 'Critical (71+)'],
            ['⚫', 'Frozen'],
          ].map(([icon, label]) => (
            <span key={label}>{icon} {label}</span>
          ))}
          <span style={{ marginLeft: 'auto' }}>Node size = transaction volume · Drag to rearrange · Scroll to zoom</span>
        </div>
      </div>

      {}
      <div className="card" style={{ padding: 0, position: 'relative', overflow: 'hidden' }}>
        <div style={{ height: 560, background: 'radial-gradient(ellipse at center, rgba(0,212,255,0.03) 0%, transparent 70%)' }}>
          <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
          {selected && <NodeDetail node={selected} onClose={() => setSelected(null)} />}
          {(!graphData?.nodes?.length) && (
            <div className="empty-state" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="empty-state-icon">🕸️</div>
              <div className="empty-state-text">Graph will populate as transactions flow in…</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
