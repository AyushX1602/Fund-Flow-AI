/* ═══════════════════════════════════════════════════════════════
   FundFlow AI — WebSocket Live Feed
   Connects to ws://localhost:8000/ws/live-feed
   Displays real-time transactions with live fraud scores
═══════════════════════════════════════════════════════════════ */

let ws          = null;
let feedPaused  = false;
let feedItems   = 0;
const MAX_FEED  = 80;

function connectWebSocket() {
  const url = 'ws://127.0.0.1:8000/ws/live-feed';

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      setStatus('live', 'Live Feed Connected');
      document.getElementById('live-feed').innerHTML = '';
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'transaction' && !feedPaused) {
          appendFeedItem(msg.data);
          // Update simulator counters if running
          if (typeof updateSimCounters === 'function') updateSimCounters(msg.data);
        }
      } catch (e) {
        console.warn('WS parse error:', e);
      }
    };

    ws.onerror = () => {
      setStatus('error', 'Feed Error');
    };

    ws.onclose = () => {
      setStatus('', 'Reconnecting...');
      setTimeout(connectWebSocket, 5000);
    };

  } catch (e) {
    setStatus('error', 'WS Unavailable');
    setTimeout(simulateDemoFeed, 1000);
  }
}

// ── Rich Feed Item ─────────────────────────────────────────────────────────────
function appendFeedItem(txn) {
  const feed = document.getElementById('live-feed');
  if (!feed) return;
  const placeholder = feed.querySelector('.feed-placeholder');
  if (placeholder) placeholder.remove();

  const tier  = txn.risk_tier || 'LOW';
  const prob  = txn.fraud_probability !== undefined
              ? Math.round(txn.fraud_probability * 100)
              : null;
  const color = {CRITICAL:'#ff3d5a', HIGH:'#ff8c42', MEDIUM:'#ffbb33', LOW:'#00e676'}[tier] || '#4a9eff';

  // Top contributing feature (for HIGH/CRITICAL)
  let reasonHtml = '';
  if ((tier === 'CRITICAL' || tier === 'HIGH') && txn.top_features && txn.top_features.length) {
    const topFeat = txn.top_features[0].feature.replace(/_/g, ' ');
    reasonHtml = `<span style="font-size:.68rem;color:#ff8c42;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${topFeat}">⚡ ${topFeat}</span>`;
  } else {
    reasonHtml = `<span></span>`;
  }

  const item = document.createElement('div');
  item.className = 'feed-item' + (tier === 'CRITICAL' ? ' critical-flash' : '');
  item.style.borderColor = (tier === 'CRITICAL' || tier === 'HIGH')
    ? 'rgba(255,61,90,0.3)' : 'var(--border)';

  const ts     = txn.timestamp ? new Date(txn.timestamp).toLocaleTimeString('en-IN') : '--:--';
  const sender = (txn.sender_account || '').slice(0, 11);
  const recv   = (txn.receiver_account || '').slice(0, 11);
  const type   = txn.txn_type || '';
  const probHtml = prob !== null
    ? `<span style="font-weight:700;color:${color}">${prob}%</span>`
    : `<span style="color:${color};font-weight:700">${tier}</span>`;

  // Why button for HIGH/CRITICAL
  const whyBtnHtml = (tier === 'CRITICAL' || tier === 'HIGH') 
    ? `<button class="btn btn-secondary" onclick="showFraudExplanation('${txn.txn_id}')" style="padding:2px 6px;font-size:0.7rem;margin-left:auto">Why?</button>`
    : `<span></span>`;

  item.innerHTML = `
    <span class="feed-time">${ts}</span>
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace" title="${txn.sender_account}">${sender}</span>
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-family:monospace" title="${txn.receiver_account}">→ ${recv}</span>
    <span style="font-size:.72rem;color:#818cf8;font-weight:600">${type}</span>
    <span class="feed-amount">₹${Math.round(txn.amount || 0).toLocaleString('en-IN')}</span>
    ${probHtml}
    ${reasonHtml}
    ${whyBtnHtml}`;

  feed.insertBefore(item, feed.firstChild);
  feedItems++;

  if (feedItems > MAX_FEED) {
    feed.lastChild && feed.removeChild(feed.lastChild);
    feedItems--;
  }
}

// ── Demo feed (when WebSocket unavailable) ────────────────────────────────────
const DEMO_ACCOUNTS = [
  'C1231006815','C1828508781','C422409467','C553264065',
  'C840083671','C2083117811','C1666544295',
];
const DEMO_TYPES = ['UPI','NEFT','ATM','IMPS','DEPOSIT'];
const DEMO_TIERS = ['LOW','LOW','LOW','LOW','MEDIUM','HIGH','CRITICAL'];

function simulateDemoFeed() {
  setStatus('live', 'Demo Mode');

  const tick = () => {
    if (!feedPaused) {
      const sender = DEMO_ACCOUNTS[Math.floor(Math.random() * DEMO_ACCOUNTS.length)];
      const receiver = DEMO_ACCOUNTS[Math.floor(Math.random() * DEMO_ACCOUNTS.length)];
      const tier   = DEMO_TIERS[Math.floor(Math.random() * DEMO_TIERS.length)];
      const prob   = tier === 'CRITICAL' ? 0.94 : tier === 'HIGH' ? 0.74 : tier === 'MEDIUM' ? 0.45 : 0.08;
      appendFeedItem({
        txn_id:           'DEMO_' + Date.now(),
        timestamp:        new Date().toISOString(),
        sender_account:   sender,
        receiver_account: receiver,
        amount:           Math.random() * 250000 + 1000,
        txn_type:         DEMO_TYPES[Math.floor(Math.random() * DEMO_TYPES.length)],
        risk_tier:        tier,
        fraud_probability: prob,
        top_features:     tier === 'CRITICAL' ? [{feature:'sender_txn_count_1h', contribution: 0.09}] : [],
      });
    }
    setTimeout(tick, 800 + Math.random() * 700);
  };
  tick();
}

// ── Pause / Resume ─────────────────────────────────────────────────────────────
document.getElementById('btn-toggle-feed').addEventListener('click', () => {
  feedPaused = !feedPaused;
  document.getElementById('btn-toggle-feed').textContent = feedPaused ? 'Resume' : 'Pause';
});

// ── Status indicator ───────────────────────────────────────────────────────────
function setStatus(state, text) {
  const dot  = document.getElementById('status-dot');
  const span = document.getElementById('status-text');
  dot.className  = 'status-dot' + (state ? ' ' + state : '');
  span.textContent = text;
}

// ── Init ───────────────────────────────────────────────────────────────────────
connectWebSocket();
