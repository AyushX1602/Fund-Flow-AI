/* ═══════════════════════════════════════════════════════════════
   FundFlow AI — Main App Controller
   Handles: navigation, API calls, dashboard data, alerts, cases
═══════════════════════════════════════════════════════════════ */

const API = 'http://127.0.0.1:8000/api';

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage = 'dashboard';
let dashStats   = {};
let allAlerts   = [];
let allCases    = [];

// ── Navigation ────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const page = item.dataset.page;
    if (page) navigateTo(page);
  });
});

// Also handle btn-sm [data-page] links
document.querySelectorAll('[data-page]').forEach(el => {
  if (!el.classList.contains('nav-item')) {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  }
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  const navEl  = document.getElementById(`nav-${page}`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');
  loadPage(page);
}

function loadPage(page) {
  switch (page) {
    case 'dashboard':   loadDashboard(); break;
    case 'fundflow':    loadFundFlow();  break;
    case 'alerts':      loadAlerts();    break;
    case 'investigation': loadCases();  break;
    case 'mules':       loadMules();    break;
    case 'model':       loadModel();    break;
  }
}

// ── API Helper ────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(API + path, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`API error [${path}]:`, e.message);
    return null;
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const data = await apiFetch('/stats/dashboard');
  if (!data) return;
  dashStats = data;

  document.getElementById('kpi-total').textContent  = fmtNum(data.total_transactions);
  document.getElementById('kpi-fraud').textContent  = fmtNum(data.fraud_count);
  document.getElementById('kpi-alerts').textContent = fmtNum(data.active_alerts);
  document.getElementById('kpi-rings').textContent  = fmtNum(data.rings_detected);
  document.getElementById('kpi-mules').textContent  = fmtNum(data.mules_detected);

  document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  document.getElementById('alert-badge').textContent  = data.active_alerts;

  drawRiskDistChart(data.risk_distribution);
  drawFraudTypeChart(data.fraud_by_type);
  loadRecentAlerts();
}

async function loadRecentAlerts() {
  const data = await apiFetch('/alerts?limit=8');
  if (!data) return;
  const list = document.getElementById('recent-alerts-list');
  list.innerHTML = '';
  (data.alerts || []).filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH')
    .slice(0, 6).forEach(alert => {
      const el = document.createElement('div');
      el.className = 'alert-mini-item';
      el.innerHTML = `
        <div class="alert-mini-type">${alert.alert_type?.replace(/_/g,' ')}</div>
        <div class="alert-mini-desc">${fmtCurrency(alert.total_amount)} · ${alert.severity}</div>`;
      el.addEventListener('click', () => navigateTo('alerts'));
      list.appendChild(el);
    });
}

// ── Alerts ────────────────────────────────────────────────────────────────────
async function loadAlerts() {
  const status = document.getElementById('alerts-filter').value;
  const url = status ? `/alerts?status=${status}&limit=100` : '/alerts?limit=100';
  const data = await apiFetch(url);
  if (!data) return;
  allAlerts = data.alerts || [];

  const grid = document.getElementById('alerts-grid');
  grid.innerHTML = '';

  if (allAlerts.length === 0) {
    grid.innerHTML = '<div class="loading-spinner">No alerts found.</div>';
    return;
  }

  allAlerts.forEach(alert => {
    const card = createAlertCard(alert);
    grid.appendChild(card);
  });
}

function createAlertCard(alert) {
  const card = document.createElement('div');
  card.className = 'alert-card';
  card.style.borderLeftColor = severityColor(alert.severity);

  const accs = Array.isArray(alert.accounts_involved)
    ? alert.accounts_involved.slice(0,2).join(', ')
    : (alert.accounts_involved || '');

  card.innerHTML = `
    <div class="alert-card-top">
      <div>
        <div class="alert-type-badge bg-tier-${alert.severity || 'MEDIUM'}"
             style="color:${severityColor(alert.severity)}">
          ${(alert.alert_type || '').replace(/_/g,' ')}
        </div>
      </div>
      <div class="alert-amount">${fmtCurrency(alert.total_amount)}</div>
    </div>
    <div class="alert-desc">${alert.description || ''}</div>
    <div class="alert-footer">
      <div class="alert-accounts">${accs}</div>
      <span class="severity-badge severity-${alert.severity}">${alert.severity}</span>
    </div>
    <div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap">
      <span class="text-muted">${fmtDateTime(alert.timestamp)}</span>
      <span class="case-status-badge status-${alert.status}">${alert.status}</span>
    </div>`;

  return card;
}

document.getElementById('alerts-filter').addEventListener('change', loadAlerts);

// ── Cases ─────────────────────────────────────────────────────────────────────
async function loadCases() {
  const data = await apiFetch('/cases');
  if (!data) return;
  allCases = data.cases || [];

  const list = document.getElementById('cases-list');
  list.innerHTML = '';

  if (allCases.length === 0) {
    list.innerHTML = '<div class="text-muted" style="padding:1rem">No cases yet.</div>';
    return;
  }

  allCases.forEach(c => {
    const el = document.createElement('div');
    el.className = 'case-item';
    el.innerHTML = `
      <div class="case-id">${c.case_id}</div>
      <div class="case-type">${c.evidence?.alert_type?.replace(/_/g,' ') || 'Fraud Investigation'}</div>
      <span class="case-status-badge status-${c.status}">${c.status}</span>`;
    el.addEventListener('click', () => showCaseDetail(c));
    list.appendChild(el);
  });
}

function showCaseDetail(c) {
  document.querySelectorAll('.case-item').forEach(el => el.classList.remove('active'));
  event.currentTarget.classList.add('active');

  const detail = document.getElementById('case-detail');

  const timeline = (c.timeline || []).map(t => `
    <div class="timeline-item">
      <div class="timeline-time">${fmtDateTime(t.time)}</div>
      <div class="timeline-line"></div>
      <div class="timeline-event">${t.event}</div>
    </div>`).join('');

  const linkedAccounts = (Array.isArray(c.linked_accounts) ? c.linked_accounts : []).join(', ');

  detail.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem">
      <div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--accent-blue)">${c.case_id}</div>
        <div class="case-type">${c.evidence?.alert_type?.replace(/_/g,' ') || ''}</div>
      </div>
      <span class="case-status-badge status-${c.status}">${c.status}</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1.25rem">
      <div><div class="text-muted">Priority</div><strong>${c.priority}</strong></div>
      <div><div class="text-muted">Assigned To</div><strong>${c.assigned_to}</strong></div>
      <div><div class="text-muted">Total Exposure</div><strong class="text-red">${fmtCurrency(c.total_exposure)}</strong></div>
      <div><div class="text-muted">Risk Score</div><strong>${(c.evidence?.risk_score || 0).toFixed(3)}</strong></div>
    </div>

    <div style="margin-bottom:1.25rem">
      <div class="text-muted" style="margin-bottom:0.5rem">Linked Accounts</div>
      <div style="font-size:0.8rem;word-break:break-all">${linkedAccounts || '—'}</div>
    </div>

    <div style="margin-bottom:1.25rem">
      <div style="font-weight:600;margin-bottom:0.75rem">Investigation Timeline</div>
      <div class="timeline">${timeline || '<div class="text-muted">No events yet.</div>'}</div>
    </div>

    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      <button class="btn-primary" onclick="updateCase('${c.case_id}','INVESTIGATING')">Start Investigation</button>
      <button class="btn-secondary" onclick="updateCase('${c.case_id}','CONFIRMED_FRAUD')">Confirm Fraud</button>
      <button class="btn-secondary" onclick="updateCase('${c.case_id}','FALSE_POSITIVE')">False Positive</button>
      <button class="btn-danger" onclick="simulateFreeze('${(c.linked_accounts || [])[0] || ''}')">🧊 Freeze Account</button>
    </div>`;
}

async function updateCase(caseId, status) {
  await apiFetch(`/cases/${caseId}/status?status=${status}`, { method: 'PATCH' });
  loadCases();
}

// ── Mule Network ──────────────────────────────────────────────────────────────
async function loadMules() {
  const [muleData, networkData] = await Promise.all([
    apiFetch('/mules?limit=50'),
    apiFetch('/mule-network'),
  ]);

  // Table
  const tbody = document.getElementById('mule-tbody');
  tbody.innerHTML = '';
  (muleData?.mules || []).forEach(m => {
    const kyc      = m.kyc_type || 'biometric';
    const kycColor = kyc === 'otp_ekyc' ? '#ff8c42' : kyc === 'minimum_kyc' ? '#ff3d5a' : '#00e676';
    const kycLabel = { biometric:'Biometric ✅', vcip:'V-CIP ✅', otp_ekyc:'OTP eKYC ⚠️', minimum_kyc:'Min KYC 🔴' }[kyc] || kyc;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code style="font-size:0.75rem">${m.account?.slice(0,16)}</code></td>
      <td>${riskScoreBadge(m.mule_score)}</td>
      <td>${fmtPercent(m.passthrough_ratio)}</td>
      <td>${m.unique_senders}</td>
      <td><span style="color:${kycColor};font-size:.78rem;font-weight:600">${kycLabel}</span></td>
      <td style="display:flex;gap:.4rem">
        <button class="btn-sm" onclick="lookupAccountById('${m.account}')">🔍 Profile</button>
        <button class="btn-sm" onclick="simulateFreeze('${m.account}')">🧊 Freeze</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Graph — delay so DOM layout settles before vis.js reads container size
  if (networkData && networkData.nodes && networkData.nodes.length > 0) {
    setTimeout(() => drawMuleGraph(networkData), 150);
  }
}

// ── Freeze Simulation Modal ───────────────────────────────────────────────────
async function simulateFreeze(accountId) {
  if (!accountId) return;
  const modal = document.getElementById('freeze-modal');
  const body  = document.getElementById('freeze-modal-body');
  modal.style.display = 'flex';
  body.innerHTML = '<div class="loading-spinner">Running freeze simulation...</div>';

  const data = await apiFetch(`/simulate/freeze/${accountId}`, { method: 'POST' });
  if (!data || data.error) {
    body.innerHTML = `<div class="text-muted">Simulation failed: ${data?.error || 'Unknown error'}</div>`;
    return;
  }

  body.innerHTML = `
    <div class="freeze-summary">${data.summary}</div>
    <div class="freeze-result-row">
      <span class="freeze-result-label">Money Saved (Frozen)</span>
      <span class="freeze-result-value text-green">${fmtCurrency(data.money_saved)}</span>
    </div>
    <div class="freeze-result-row">
      <span class="freeze-result-label">Downstream Accounts Disrupted</span>
      <span class="freeze-result-value">${data.disrupted_accounts}</span>
    </div>
    <div class="freeze-result-row">
      <span class="freeze-result-label">Suspected Fraud Accounts Cut Off</span>
      <span class="freeze-result-value text-red">${data.suspicious_disrupted}</span>
    </div>
    <div class="freeze-result-row">
      <span class="freeze-result-label">Potentially Legitimate Accounts Affected</span>
      <span class="freeze-result-value text-yellow">${data.collateral_accounts}</span>
    </div>`;
}

document.getElementById('freeze-modal-close').addEventListener('click', () => {
  document.getElementById('freeze-modal').style.display = 'none';
});

// ── Model Performance ─────────────────────────────────────────────────────────
async function loadModel() {
  const data = await apiFetch('/model/performance');
  const el   = document.getElementById('model-content');

  if (!data || data.detail) {
    el.innerHTML = '<div class="loading-spinner">Model not trained yet. Please run training first.</div>';
    return;
  }

  const m = data.metrics || {};
  const fi = data.feature_importance || {};

  const topFeatures = Object.entries(fi).sort((a,b) => b[1]-a[1]).slice(0,12);
  const maxImp = topFeatures[0]?.[1] || 1;

  el.innerHTML = `
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-value">${(m.auc_roc * 100).toFixed(1)}%</div>
        <div class="metric-label">AUC-ROC</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${(m.precision * 100).toFixed(1)}%</div>
        <div class="metric-label">Precision</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${(m.recall * 100).toFixed(1)}%</div>
        <div class="metric-label">Recall</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${(m.f1 * 100).toFixed(1)}%</div>
        <div class="metric-label">F1 Score</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2>Feature Importance (XGBoost)</h2></div>
      <div class="feat-bar-wrap">
        ${topFeatures.map(([feat, imp]) => `
          <div class="feat-bar-row">
            <div class="feat-bar-label">${feat.replace(/_/g,' ')}</div>
            <div class="feat-bar-bg">
              <div class="feat-bar-fill" style="width:${(imp/maxImp*100).toFixed(1)}%"></div>
            </div>
            <div class="feat-bar-val">${imp.toFixed(4)}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="card-header"><h2>Confusion Matrix</h2></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;max-width:300px;gap:4px;font-size:0.85rem">
        <div style="background:rgba(0,230,118,0.15);padding:12px;border-radius:8px;text-align:center">
          <div style="font-size:1.3rem;font-weight:700;color:var(--accent-green)">${fmtNum(m.confusion_matrix?.[0]?.[0])}</div>
          <div class="text-muted">True Negative</div>
        </div>
        <div style="background:rgba(255,61,90,0.15);padding:12px;border-radius:8px;text-align:center">
          <div style="font-size:1.3rem;font-weight:700;color:var(--accent-red)">${fmtNum(m.confusion_matrix?.[0]?.[1])}</div>
          <div class="text-muted">False Positive</div>
        </div>
        <div style="background:rgba(255,187,51,0.15);padding:12px;border-radius:8px;text-align:center">
          <div style="font-size:1.3rem;font-weight:700;color:var(--accent-yellow)">${fmtNum(m.confusion_matrix?.[1]?.[0])}</div>
          <div class="text-muted">False Negative</div>
        </div>
        <div style="background:rgba(74,158,255,0.15);padding:12px;border-radius:8px;text-align:center">
          <div style="font-size:1.3rem;font-weight:700;color:var(--accent-blue)">${fmtNum(m.confusion_matrix?.[1]?.[1])}</div>
          <div class="text-muted">True Positive</div>
        </div>
      </div>
    </div>`;
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtNum(n)         { return (n || 0).toLocaleString('en-IN'); }
function fmtCurrency(n)    { return '₹' + (n || 0).toLocaleString('en-IN', {maximumFractionDigits:0}); }
function fmtPercent(n)     { return ((n || 0) * 100).toFixed(1) + '%'; }
function fmtDateTime(s)    { return s ? new Date(s).toLocaleString('en-IN', {dateStyle:'short', timeStyle:'short'}) : '—'; }

function severityColor(sev) {
  return {CRITICAL:'#ff3d5a', HIGH:'#ff8c42', MEDIUM:'#ffbb33', LOW:'#00e676'}[sev] || '#4a9eff';
}

function riskScoreBadge(score) {
  const pct = Math.round(score * 100);
  const color = score > 0.8 ? '#ff3d5a' : score > 0.6 ? '#ff8c42' : score > 0.4 ? '#ffbb33' : '#00e676';
  return `<span style="color:${color};font-weight:700">${pct}%</span>`;
}

// ── Initialise ────────────────────────────────────────────────────────────────
loadDashboard();
setInterval(loadDashboard, 30000);  // Refresh every 30s

// ── Simulator Controls ────────────────────────────────────────────────────────
let _simRunning    = false;
let _simScored     = 0;
let _simFraud      = 0;
let _simPollHandle = null;

async function toggleSimulator() {
  const btn  = document.getElementById('btn-sim-toggle');
  const rate = parseInt(document.getElementById('sim-rate')?.value || '2');

  if (!_simRunning) {
    // START
    const res = await apiFetch(`/simulate/start?rate=${rate}`, { method: 'POST' });
    if (!res) return;
    _simRunning = true;
    _simScored  = 0;
    _simFraud   = 0;
    btn.textContent = '⬛ Stop Replay';
    btn.style.background = '#ff3d5a';
    document.getElementById('sim-bar').classList.add('running');
    document.getElementById('sim-status-dot').style.background = '#00e676';
    document.getElementById('sim-status-txt').textContent = `● Simulating @ ${rate} tx/sec`;
    // Poll stats every 2s
    _simPollHandle = setInterval(_pollSimStats, 2000);
  } else {
    // STOP
    const res = await apiFetch('/simulate/stop', { method: 'POST' });
    _simRunning = false;
    btn.textContent = '▶ Start Replay';
    btn.style.background = '';
    document.getElementById('sim-bar').classList.remove('running');
    document.getElementById('sim-status-dot').style.background = '#444';
    document.getElementById('sim-status-txt').textContent = 'Simulator Off';
    if (_simPollHandle) { clearInterval(_simPollHandle); _simPollHandle = null; }
    if (res) {
      document.getElementById('sim-latency').textContent =
        `Session: ${res.processed} scored, ${res.fraud_detected} flagged`;
    }
  }
}

async function _pollSimStats() {
  const data = await apiFetch('/simulate/stats');
  if (!data) return;
  if (!data.running && _simRunning) {
    // Stopped unexpectedly
    toggleSimulator();
    return;
  }
  document.getElementById('sim-count').textContent = (data.processed || 0).toLocaleString('en-IN');
  document.getElementById('sim-fraud').textContent = (data.fraud_detected || 0).toLocaleString('en-IN');
}

// Called by websocket.js on each incoming transaction to update counters instantly
function updateSimCounters(txn) {
  if (!_simRunning) return;
  _simScored++;
  if ((txn.fraud_probability || 0) >= 0.7) _simFraud++;

  // Update latency badge with approx score count
  const latEl = document.getElementById('sim-latency');
  if (latEl) latEl.textContent = `~${_simScored} scored this session`;
}

// ── Account Profile Lookup ────────────────────────────────────────────────────
let _currentProfileAcct = null;

async function lookupAccount() {
  const val = (document.getElementById('acct-lookup-input')?.value || '').trim();
  if (!val) return;
  await lookupAccountById(val);
}

async function lookupAccountById(accountId) {
  _currentProfileAcct = accountId;
  // Navigate to investigation page if not already there
  if (currentPage !== 'investigation') navigateTo('investigation');
  // Pre-populate input
  const inp = document.getElementById('acct-lookup-input');
  if (inp) inp.value = accountId;

  const card = document.getElementById('account-profile-card');
  const body = document.getElementById('account-profile-body');
  card.style.display = 'block';
  body.innerHTML = '<div class="loading-spinner">Loading profile...</div>';

  const data = await apiFetch(`/account/${encodeURIComponent(accountId)}`);
  if (!data) { body.innerHTML = '<p style="color:var(--accent-red)">Account not found.</p>'; return; }
  renderAccountProfile(data);
}

function renderAccountProfile(d) {
  const body = document.getElementById('account-profile-body');
  if (!body) return;

  const kycColor = { biometric:'#00e676', vcip:'#4a9eff', otp_ekyc:'#ff8c42', minimum_kyc:'#ff3d5a' }[d.kyc_type] || '#888';
  const kycLabel = { biometric:'Biometric ✅', vcip:'V-CIP ✅', otp_ekyc:'OTP eKYC ⚠️', minimum_kyc:'Min KYC 🔴', unknown:'Unknown' }[d.kyc_type] || d.kyc_type;
  const cibilColor = (d.credit_score || 750) < 550 ? '#ff3d5a' : (d.credit_score || 750) < 650 ? '#ff8c42' : '#00e676';
  const muleColor  = (d.mule_score || 0) >= 0.6 ? '#ff3d5a' : (d.mule_score || 0) >= 0.4 ? '#ff8c42' : '#00e676';
  const fraudColor = (d.max_fraud_probability || 0) >= 0.7 ? '#ff3d5a' : (d.max_fraud_probability || 0) >= 0.4 ? '#ff8c42' : '#00e676';

  const tile = (label, value, color='var(--text-primary)', sub='') => `
    <div style="background:var(--bg-tertiary);padding:1rem;border-radius:.75rem;border:1px solid var(--border)">
      <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem">${label}</div>
      <div style="font-size:1.1rem;font-weight:700;color:${color}">${value}</div>
      ${sub ? `<div style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem">${sub}</div>` : ''}
    </div>`;

  body.innerHTML = `
    ${tile('Account ID',    d.account_id.slice(0,20))}
    ${tile('UPI VPA',       d.vpa || '—', '#818cf8')}
    ${tile('Bank',          (d.bank_handle || 'upi').toUpperCase(), '#4a9eff')}
    ${tile('KYC Status',    kycLabel, kycColor, d.account_age_days ? `Account age: ${d.account_age_days}d` : '')}
    ${tile('CIBIL Score',   d.credit_score ?? '—', cibilColor, d.cibil_risk_flag ? '⚠️ Low score + high transfer' : '')}
    ${tile('Mule Score',    ((d.mule_score||0)*100).toFixed(0)+'%', muleColor, d.is_suspected_mule ? '🚨 Suspected mule' : 'Clean')}
    ${tile('Max Fraud Prob',((d.max_fraud_probability||0)*100).toFixed(0)+'%', fraudColor)}
    ${tile('Pass-Through',  fmtPercent(d.passthrough_ratio||0))}
    ${tile('Total Received',fmtCurrency(d.graph_stats?.total_received||0))}
    ${tile('Total Sent',    fmtCurrency(d.graph_stats?.total_sent||0))}
    ${tile('Unique In',     d.graph_stats?.in_degree ?? '—', 'var(--text-primary)', 'counterparties')}
    ${tile('Unique Out',    d.graph_stats?.out_degree ?? '—', 'var(--text-primary)', 'counterparties')}`;
}

function freezeFromProfile() {
  if (_currentProfileAcct) simulateFreeze(_currentProfileAcct);
}

// ── Account Aggregator Modal ──────────────────────────────────────────────────
function showAAModal() {
  const modal = document.getElementById('aa-modal');
  const dataEl = document.getElementById('aa-data-body');
  modal.style.display = 'flex';
  dataEl.innerHTML = '<div class="loading-spinner">Requesting consent-based data pull from AA network...</div>';

  // Simulate 1.5s AA network latency then show mock response
  setTimeout(() => {
    if (!_currentProfileAcct) { dataEl.innerHTML = '<p>No account selected.</p>'; return; }
    const mockIncome   = (Math.random()*800000 + 200000).toFixed(0);
    const mockAccounts = Math.floor(Math.random()*3) + 1;
    const mockLoans    = Math.random() > 0.6 ? `₹${(Math.random()*500000+50000).toFixed(0)} outstanding` : 'None';
    dataEl.innerHTML = `
      <div style="display:grid;gap:.75rem">
        <div style="background:rgba(0,230,118,.08);padding:.75rem;border-radius:.5rem;border:1px solid rgba(0,230,118,.2)">
          <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase">Annual Income (self-declared)</div>
          <div style="font-size:1.1rem;font-weight:700;color:#00e676">₹${Number(mockIncome).toLocaleString('en-IN')}</div>
        </div>
        <div style="background:rgba(74,158,255,.08);padding:.75rem;border-radius:.5rem;border:1px solid rgba(74,158,255,.2)">
          <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase">Bank Accounts Linked</div>
          <div style="font-size:1.1rem;font-weight:700;color:#4a9eff">${mockAccounts} account${mockAccounts>1?'s':''} across ${mockAccounts} bank${mockAccounts>1?'s':''}</div>
        </div>
        <div style="background:rgba(255,140,66,.08);padding:.75rem;border-radius:.5rem;border:1px solid rgba(255,140,66,.2)">
          <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase">Outstanding Loans</div>
          <div style="font-size:1.1rem;font-weight:700;color:#ff8c42">${mockLoans}</div>
        </div>
        <div style="padding:.5rem;background:rgba(255,255,255,.03);border-radius:.5rem;font-size:.75rem;color:var(--text-muted)">
          ✅ Data pulled via RBI AA Framework with simulated customer consent<br/>
          AA Provider: Finvu · Consent Artefact: CA-${Date.now().toString(36).toUpperCase()}
        </div>
      </div>`;
  }, 1500);
}

// ── Manual Transaction Scorer ─────────────────────────────────────────────────
async function scoreManualTxn() {
  const senderId = document.getElementById('man-sender').value.trim();
  const receiverId = document.getElementById('man-receiver').value.trim();
  const amount = document.getElementById('man-amount').value;
  const txnType = document.getElementById('man-type').value;

  if (!senderId || !receiverId || !amount) {
    alert("Please fill in all details");
    return;
  }

  const resultBox = document.getElementById('man-score-result');
  resultBox.style.display = 'block';
  resultBox.innerHTML = '<div class="loading-spinner">Scoring via XGBoost Pipeline...</div>';

  const payload = {
    sender_account: senderId,
    receiver_account: receiverId,
    amount: parseFloat(amount),
    txn_type: txnType
  };

  try {
    const res = await apiFetch('/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res && res.fraud_probability !== undefined) {
      const pct = Math.round(res.fraud_probability * 100);
      const tier = res.risk_tier || 'LOW';
      const color = severityColor(tier);

      let featuresHtml = '';
      if (res.top_features && res.top_features.length > 0) {
        featuresHtml = '<div style="margin-top:10px; font-size:0.8rem; color:var(--text-muted)"><strong>Top Risk Factors:</strong><ul>';
        res.top_features.forEach(f => {
          featuresHtml += `<li>${f.feature.replace(/_/g, ' ')}: ${(f.contribution || 0).toFixed(2)}</li>`;
        });
        featuresHtml += '</ul></div>';
      }

      resultBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start">
          <div>
            <h3 style="margin:0 0 4px 0; color:var(--text-primary)">Score: ${pct}% Risk</h3>
            <span style="font-size:0.85rem; padding:2px 8px; border-radius:4px; font-weight:bold; background:${color}22; color:${color}">${tier}</span>
          </div>
        </div>
        ${featuresHtml}
      `;
    } else {
      resultBox.innerHTML = '<span style="color:#ff3d5a">Scoring failed.</span>';
    }
  } catch (e) {
    resultBox.innerHTML = `<span style="color:#ff3d5a">Error: ${e.message}</span>`;
  }
}

// ── SHAP Explain Modal ────────────────────────────────────────────────────────
async function showFraudExplanation(txnId) {
  const modal = document.getElementById('shap-modal');
  const body = document.getElementById('shap-modal-body');
  modal.style.display = 'flex';
  body.innerHTML = '<div class="loading-spinner">Querying Python SHAP Explainer...</div>';

  try {
    // Demo mock if txn_id starts with DEMO_
    if (txnId.startsWith('DEMO_')) {
      setTimeout(() => {
        body.innerHTML = `
          <div style="padding:1rem; border-left:3px solid #ff3d5a; background:rgba(255,61,90,0.1); margin-bottom:1rem;">
            <strong>Transaction ID:</strong> ${txnId}<br>
            <small style="color:var(--text-muted)">Demo Mode Explanation</small>
          </div>
          <p><strong>Top Fraud Contributors (SHAP values):</strong></p>
          <ul style="line-height:1.6">
            <li><strong style="color:#4a9eff">Velocity Ratio 24h:</strong> +0.84</li>
            <li><strong style="color:#4a9eff">Cross-Bank UPI:</strong> +0.42</li>
            <li><strong style="color:#4a9eff">Sender Amount Bucket:</strong> +0.31</li>
          </ul>
        `;
      }, 600);
      return;
    }

    const res = await apiFetch(`/explain/${txnId}`);
    if (res && res.ml_explanation && res.ml_explanation.top_contributors) {
      const topFeats = res.ml_explanation.top_contributors;
      
      let html = `
        <div style="padding:1rem; border-left:3px solid #ff3d5a; background:rgba(255,61,90,0.1); margin-bottom:1rem;">
          <strong>Transaction ID:</strong> ${txnId}<br>
          <small style="color:var(--text-muted)">Base Value: ${res.ml_explanation.base_value.toFixed(2)} | Target Value: ${res.ml_explanation.target_value.toFixed(2)}</small>
        </div>
        <p style="margin-bottom:0.5rem; color:var(--text-primary)"><strong>Primary Risk Factors:</strong></p>
        <div style="display:flex; flex-direction:column; gap:8px;">
      `;

      topFeats.slice(0, 5).forEach(f => {
        const val = f.value > 0 ? `+${f.value.toFixed(2)}` : f.value.toFixed(2);
        const color = f.value > 0 ? '#ff8c42' : '#00e676';
        html += `
          <div style="display:flex; justify-content:space-between; padding:6px 10px; background:rgba(0,0,0,0.2); border-radius:4px; border:1px solid var(--border);">
            <span style="font-family:monospace; font-size:0.85rem">${f.feature.replace(/_/g, ' ')}</span>
            <span style="font-weight:700; color:${color}">${val} SHAP</span>
          </div>
        `;
      });

      html += `</div>`;
      body.innerHTML = html;
    } else if (res && res.error) {
      body.innerHTML = `<div style="color:#ff3d5a; padding:1rem;">Error: ${res.error}</div>`;
    } else {
      body.innerHTML = '<div>Explanation unavailable.</div>';
    }
  } catch (e) {
    body.innerHTML = `<span style="color:#ff3d5a; padding:1rem;">Error connecting to explainer: ${e.message}</span>`;
  }
}
