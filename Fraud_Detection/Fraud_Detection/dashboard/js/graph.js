/* ═══════════════════════════════════════════════════════════════
   FundFlow AI — Graph Visualisation
   Fund flow (vis.js) + Mule network (vis.js) + temporal animation
═══════════════════════════════════════════════════════════════ */

let fundFlowNetwork = null;
let muleNetwork     = null;
let animEdges       = [];
let animHopMax      = 0;
let animPaused      = false;

// ── Fund Flow Functions ───────────────────────────────────────────────────────
function loadFundFlow() {
  loadRings();
}

async function loadRings() {
  const data = await apiFetch('/rings');
  if (!data) return;

  document.getElementById('rings-count').textContent = data.total;
  const tbody = document.getElementById('rings-tbody');
  tbody.innerHTML = '';

  (data.rings || []).forEach(ring => {
    const tr = document.createElement('tr');
    const chainAccts = ring.accounts.map(a => a.slice(0,10)).join(' → ');
    tr.innerHTML = `
      <td style="font-family:monospace;font-size:0.75rem">${ring.ring_id}</td>
      <td style="font-size:0.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${ring.accounts.join(' → ')}">${chainAccts}</td>
      <td>${ring.ring_size}</td>
      <td>${fmtCurrency(ring.total_amount)}</td>
      <td>${ring.time_span_hrs.toFixed(1)}h</td>
      <td>${riskScoreBadge(ring.risk_score)}</td>
      <td>
        <button class="btn-sm" onclick="traceAccount('${ring.accounts[0]}')">Trace</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function traceAccount(accountId) {
  document.getElementById('ff-account').value = accountId;
  traceFundFlow();
}

document.getElementById('btn-trace').addEventListener('click', traceFundFlow);
document.getElementById('btn-clear-ff').addEventListener('click', clearFundFlow);
document.getElementById('btn-animate').addEventListener('click', startAnimation);

async function traceFundFlow() {
  const account = document.getElementById('ff-account').value.trim();
  if (!account) return;
  const hops   = document.getElementById('ff-hops').value || 6;
  const window = document.getElementById('ff-window').value || 24;

  const data = await apiFetch(`/fund-flow/${account}?max_hops=${hops}&time_window_hours=${window}`);
  if (!data) return;

  const ff = data.fund_flow;
  const summary = ff.summary || {};

  // Show summary panel
  document.getElementById('flow-summary').style.display = 'flex';
  document.getElementById('ff-hops-val').textContent   = summary.total_hops || 0;
  document.getElementById('ff-nodes-val').textContent  = summary.nodes_involved || 0;
  document.getElementById('ff-amount-val').textContent = fmtCurrency(summary.total_amount);
  document.getElementById('ff-time-val').textContent   = (summary.time_span_min || 0) + ' min';
  document.getElementById('ff-fraud-val').textContent  = summary.fraud_edges || 0;

  // Draw graph
  animEdges  = ff.edges || [];
  animHopMax = summary.total_hops || 0;

  drawFundFlowGraph(ff.nodes || [], ff.edges || [], account);

  // Setup scrubber
  if (animHopMax > 0) {
    document.getElementById('anim-controls').style.display = 'flex';
    const scrubber = document.getElementById('anim-scrubber');
    scrubber.max = animHopMax;
    scrubber.value = animHopMax;
    document.getElementById('anim-hop-label').textContent = `${animHopMax} / ${animHopMax}`;
    scrubber.addEventListener('input', () => {
      const hop = parseInt(scrubber.value);
      document.getElementById('anim-hop-label').textContent = `${hop} / ${animHopMax}`;
      filterGraphByHop(hop);
    });
  }
}

function drawFundFlowGraph(nodeIds, edges, startAccount) {
  const nodesData = nodeIds.map(id => ({
    id,
    label: id.length > 14 ? id.slice(0,14) + '…' : id,
    color: id === startAccount
      ? { background: '#4a9eff', border: '#4a9eff' }
      : { background: '#1a1a45', border: '#2a2a70' },
    font:  { color: '#e8e8ff', size: 11, face: 'Inter' },
    shape: 'dot',
    size:  id === startAccount ? 18 : 12,
    title: id,
  }));

  const edgesData = edges.map((e, i) => ({
    id:     i,
    from:   e.from,
    to:     e.to,
    label:  '₹' + fmtNum(Math.round(e.amount)),
    color:  { color: e.is_fraud ? '#ff3d5a' : e.fraud_prob > 0.5 ? '#ff8c42' : '#4a9eff', opacity: 0.7 },
    width:  e.is_fraud ? 2.5 : 1.5,
    arrows: 'to',
    font:   { color: '#8888bb', size: 9, face: 'Inter', strokeWidth: 0 },
    smooth: { type: 'curvedCW', roundness: 0.1 },
    hop:    e.hop,
    title:  `${e.txn_id}\n₹${fmtNum(Math.round(e.amount))} @ ${e.timestamp?.slice(0,19)}`,
  }));

  const container = document.getElementById('fundflow-graph');
  const netData   = {
    nodes: new vis.DataSet(nodesData),
    edges: new vis.DataSet(edgesData),
  };
  const options = {
    physics: {
      enabled: true,
      stabilization: { iterations: 100 },
      barnesHut: { gravitationalConstant: -3000, springLength: 200 },
    },
    interaction: { hover: true, tooltipDelay: 100 },
    layout: { improvedLayout: true },
  };

  if (fundFlowNetwork) fundFlowNetwork.destroy();
  fundFlowNetwork = new vis.Network(container, netData, options);
}

function filterGraphByHop(maxHop) {
  if (!fundFlowNetwork) return;
  const edgesData = animEdges
    .filter(e => (e.hop || 1) <= maxHop)
    .map((e, i) => ({
      id: i, from: e.from, to: e.to,
      color: { color: e.is_fraud ? '#ff3d5a' : '#4a9eff', opacity: 0.7 },
      width: e.is_fraud ? 2.5 : 1.5, arrows: 'to',
    }));
  // Redraw is expensive; just highlight (simplified)
}

function startAnimation() {
  if (!animEdges.length) return;
  let hop = 0;
  const scrubber = document.getElementById('anim-scrubber');
  animPaused = false;

  const tick = () => {
    if (animPaused) return;
    hop = (hop % (animHopMax + 1)) + 1;
    scrubber.value = hop;
    document.getElementById('anim-hop-label').textContent = `${hop} / ${animHopMax}`;
    filterGraphByHop(hop);
    if (hop < animHopMax) setTimeout(tick, 900);
  };
  tick();
}

function clearFundFlow() {
  document.getElementById('ff-account').value = '';
  document.getElementById('flow-summary').style.display = 'none';
  document.getElementById('anim-controls').style.display = 'none';
  document.getElementById('fundflow-graph').innerHTML = '';
  if (fundFlowNetwork) { fundFlowNetwork.destroy(); fundFlowNetwork = null; }
  animEdges = [];
}

// ── Mule Network Graph ────────────────────────────────────────────────────────
function drawMuleGraph(data) {
  const container = document.getElementById('mule-graph');
  if (!container) { console.error('mule-graph container not found'); return; }

  const nodes = data.nodes || [];
  const edges = data.edges || [];
  console.log('[MuleGraph] Rendering', nodes.length, 'nodes,', edges.length, 'edges');

  if (nodes.length === 0) {
    container.innerHTML = '<div style="color:#555577;padding:2rem;text-align:center">No mule accounts detected.</div>';
    return;
  }

  const nodesVis = nodes.map(n => ({
    id:    n.id,
    label: n.label || n.id.slice(0,12),
    color: {
      background: n.color || '#1a1a45',
      border:     n.color || '#2a2a70',
      highlight:  { background: '#4a9eff', border: '#4a9eff' },
      hover:      { background: '#bb86fc', border: '#bb86fc' },
    },
    font:  { color: '#e8e8ff', size: 10, face: 'Inter' },
    shape: (n.mule_score || 0) > 0.6 ? 'diamond' : 'dot',
    size:  (n.mule_score || 0) > 0.6 ? 18 : 12,
    title: `<b>${n.id}</b><br>Mule Score: ${((n.mule_score || 0) * 100).toFixed(0)}%`,
  }));

  const edgesVis = edges.map((e, i) => ({
    id:     i,
    from:   e.from,
    to:     e.to,
    color:  { color: '#2a3a70', opacity: 0.6 },
    width:  1.5,
    arrows: 'to',
    title:  e.amount ? '\u20b9' + Math.round(e.amount).toLocaleString('en-IN') : '',
    smooth: { type: 'dynamic' },
  }));

  try {
    const netData = {
      nodes: new vis.DataSet(nodesVis),
      edges: new vis.DataSet(edgesVis),
    };
    const options = {
      physics: {
        enabled: true,
        solver: 'barnesHut',
        barnesHut: {
          gravitationalConstant: -8000,
          centralGravity: 0.3,
          springLength: 120,
          springConstant: 0.04,
          damping: 0.09,
        },
        stabilization: {
          enabled: true,
          iterations: 150,
          updateInterval: 25,
          fit: true,
        },
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        zoomView: true,
        dragView: true,
      },
      layout: { improvedLayout: false },
    };

    if (muleNetwork) muleNetwork.destroy();
    muleNetwork = new vis.Network(container, netData, options);

    // Fit all nodes into view after stabilization
    muleNetwork.once('stabilizationIterationsDone', () => {
      muleNetwork.fit({ animation: { duration: 800, easingFunction: 'easeInOutQuad' } });
    });
    // Fallback fit after 2s
    setTimeout(() => { if (muleNetwork) muleNetwork.fit(); }, 2000);

    console.log('[MuleGraph] Network created successfully');
  } catch (err) {
    console.error('[MuleGraph] Error:', err);
    container.innerHTML = '<div style="color:#ff3d5a;padding:2rem;text-align:center">Graph render error: ' + err.message + '</div>';
  }
}
