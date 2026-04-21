const axios = require("axios");

const BASE = "http://localhost:3001/api";
const HEADERS = { "X-Demo-Mode": "true", "Content-Type": "application/json" };

async function measure(label, fn) {
  const start = performance.now();
  try {
    await fn();
    const ms = (performance.now() - start).toFixed(1);
    console.log(`${label.padEnd(45)} ${ms}ms`);
    return parseFloat(ms);
  } catch (e) {
    const ms = (performance.now() - start).toFixed(1);
    console.log(`${label.padEnd(45)} ${ms}ms  (ERROR: ${e.response?.data?.message || e.message})`);
    return parseFloat(ms);
  }
}

async function main() {
  console.log("═".repeat(65));
  console.log("  FundFlow AI — Live Latency Benchmark");
  console.log("═".repeat(65));
  console.log();

  // Get two account IDs for tests
  const accts = await axios.get(`${BASE}/accounts?limit=5`, { headers: HEADERS });
  const accounts = accts.data?.data || [];
  if (accounts.length < 2) { console.log("Need at least 2 accounts"); return; }
  const sender   = accounts[0];
  const receiver = accounts[1];
  console.log(`Sender:   ${sender.accountHolder} (${sender.id.slice(-8)})`);
  console.log(`Receiver: ${receiver.accountHolder} (${receiver.id.slice(-8)})`);
  console.log();

  // ── Endpoint benchmarks ──────────────────────────────────────
  console.log("── API Endpoints ──────────────────────────────────");

  await measure("GET  /api/health", () =>
    axios.get(`${BASE}/health`, { headers: HEADERS })
  );

  await measure("GET  /api/dashboard/overview", () =>
    axios.get(`${BASE}/dashboard/overview`, { headers: HEADERS })
  );

  await measure("GET  /api/accounts (list, limit=10)", () =>
    axios.get(`${BASE}/accounts?limit=10`, { headers: HEADERS })
  );

  await measure("GET  /api/accounts/:id (single)", () =>
    axios.get(`${BASE}/accounts/${sender.id}`, { headers: HEADERS })
  );

  await measure("GET  /api/accounts/:id/risk-profile", () =>
    axios.get(`${BASE}/accounts/${sender.id}/risk-profile`, { headers: HEADERS })
  );

  await measure("GET  /api/transactions (list, limit=10)", () =>
    axios.get(`${BASE}/transactions?limit=10`, { headers: HEADERS })
  );

  await measure("GET  /api/alerts (list, limit=10)", () =>
    axios.get(`${BASE}/alerts?limit=10`, { headers: HEADERS })
  );

  await measure("GET  /api/preemptive/status", () =>
    axios.get(`${BASE}/preemptive/status`, { headers: HEADERS })
  );

  // ── Pre-transaction screening (the critical path) ────────────
  console.log();
  console.log("── PRE-TRANSACTION SCREENING (Critical Path) ─────");

  const screenTimes = [];
  for (let i = 0; i < 5; i++) {
    const ms = await measure(`POST /api/preemptive/screen (run ${i+1}/5)`, () =>
      axios.post(`${BASE}/preemptive/screen`, {
        senderId: sender.id,
        receiverId: receiver.id,
        amount: 49000,
        type: "UPI",
        channel: "MOBILE_APP",
      }, { headers: HEADERS })
    );
    screenTimes.push(ms);
  }

  // ── Freeze simulation ───────────────────────────────────────
  console.log();
  console.log("── FREEZE SIMULATION (Graph BFS) ─────────────────");

  await measure("GET  /api/accounts/:id/freeze-simulate", () =>
    axios.get(`${BASE}/accounts/${sender.id}/freeze-simulate`, { headers: HEADERS })
  );

  // ── ML Model endpoint ───────────────────────────────────────
  console.log();
  console.log("── ML / MODEL ────────────────────────────────────");

  await measure("GET  /api/ml/model-info", () =>
    axios.get(`${BASE}/ml/model-info`, { headers: HEADERS })
  );

  // ── Summary ─────────────────────────────────────────────────
  console.log();
  console.log("═".repeat(65));
  const p50 = screenTimes.sort((a,b) => a-b)[Math.floor(screenTimes.length / 2)];
  const p95 = screenTimes.sort((a,b) => a-b)[Math.floor(screenTimes.length * 0.95)];
  const avg = (screenTimes.reduce((a,b) => a+b, 0) / screenTimes.length).toFixed(1);
  console.log(`  Pre-Screen Latency:  avg=${avg}ms  p50=${p50}ms  p95=${p95}ms`);
  console.log(`  NPCI UPI SLA:        2000ms`);
  console.log(`  Headroom:            ${(2000 - parseFloat(avg)).toFixed(0)}ms spare`);
  console.log("═".repeat(65));
}

main().catch(console.error);
