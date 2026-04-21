import { useState, useEffect, useRef } from "react";
import {
  FlaskConical, Upload, ChevronRight, AlertTriangle,
  CheckCircle2, AlertCircle, Loader2, FileJson,
  FileSpreadsheet, X, Zap, TrendingDown, Info,
  ShieldCheck, ShieldAlert, ShieldBan,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import api from "@/lib/api";
import { formatINR, formatINRCompact, getRiskColor, getRiskBarColor, formatDateTime } from "@/lib/formatters";

// ─── Scenario Presets ───────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: "normal",
    label: "Legitimate",
    emoji: "✅",
    color: "emerald",
    description: "Normal grocery UPI",
    fields: {
      amount: 2500, type: "UPI", channel: "MOBILE_APP",
      location: "Mumbai", description: "Grocery payment",
      upiVpaSender: "user123@oksbi", upiVpaReceiver: "merchant99@ybl", vpaAgeDays: 180,
      hour: 14,
    },
  },
  {
    id: "structuring",
    label: "Structuring",
    emoji: "⚠️",
    color: "amber",
    description: "Just under ₹50K threshold",
    fields: {
      amount: 48750, type: "UPI", channel: "MOBILE_APP",
      location: "Patna", description: "Monthly rent",
      upiVpaSender: "user88@paytm", upiVpaReceiver: "new_user@ibl", vpaAgeDays: 4,
      hour: 1,
    },
  },
  {
    id: "highvalue",
    label: "High-Value Fraud",
    emoji: "🔴",
    color: "red",
    description: "₹12.5L at 3AM, coop bank",
    fields: {
      amount: 1250000, type: "NEFT", channel: "NET_BANKING",
      location: "Bhagalpur", description: "Investment returns",
      upiVpaSender: null, upiVpaReceiver: null, vpaAgeDays: null,
      hour: 3,
    },
  },
  {
    id: "mule",
    label: "Mule Transfer",
    emoji: "🔴",
    color: "red",
    description: "Forwarded salary chain",
    fields: {
      amount: 65000, type: "IMPS", channel: "MOBILE_APP",
      location: "Gorakhpur", description: "Salary forwarded",
      upiVpaSender: "user44@fino", upiVpaReceiver: "rec22@fino", vpaAgeDays: 2,
      hour: 22,
    },
  },
  {
    id: "uncertain",
    label: "Uncertain Zone",
    emoji: "💜",
    color: "violet",
    description: "Triggers Gemini analysis",
    fields: {
      amount: 35000, type: "UPI", channel: "MOBILE_APP",
      location: "Lucknow", description: "Forex profit",
      upiVpaSender: "user_x@ybl", upiVpaReceiver: "trader99@paytm", vpaAgeDays: 3,
      hour: 11,
    },
  },
];

const SCENARIO_COLOR = {
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400",
  amber:   "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
  red:     "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400",
  violet:  "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-400",
};

// ─── Hardcoded Demo Results per Scenario ────────────────────────────────────
// Used when a Quick Scenario preset is active to guarantee consistent demo output.
// Manual form submissions still go through the real API.
const DEMO_RESULTS = {
  normal: {
    id: "demo-txn-normal",
    transactionId: "TXN-DEMO-GRC001",
    amount: 2500, type: "UPI", channel: "MOBILE_APP",
    description: "Grocery payment",
    fraudScore: 0.05, isFraud: false,
    senderAccount: { accountHolder: "Rajesh Kumar", bankName: "State Bank of India", accountNumber: "SBI001234567890" },
    receiverAccount: { accountHolder: "BigBasket Merchant", bankName: "HDFC Bank", accountNumber: "HDFC001234567890" },
    mlResult: {
      fraudScore: 0.05, compositeScore: 0.09, modelVersion: "rule-based-v1",
      dominantLayer: "L2_channel",
      reasons: [
        { feature: "cross_bank", impact: 0.05, value: true, description: "Cross-bank transfer: SBI → HDFC Bank" },
      ],
      layers: { L1_location: 0.05, L2_channel: 0.25, L3_behavioral: 0.02, L4_ml: 0.05, L5_network: 0.00, L6_velocity: 0.00 },
      llm: null,
    },
    alert: null,
  },
  structuring: {
    id: "demo-txn-struct",
    transactionId: "TXN-DEMO-STR002",
    amount: 48750, type: "UPI", channel: "MOBILE_APP",
    description: "Monthly rent",
    fraudScore: 0.62, isFraud: false,
    senderAccount: { accountHolder: "Suresh Patel", bankName: "Bank of Baroda", accountNumber: "BOB001234567890" },
    receiverAccount: { accountHolder: "Unknown User", bankName: "Fino Payments Bank", accountNumber: "FINO001234567890" },
    mlResult: {
      fraudScore: 0.62, compositeScore: 0.68, modelVersion: "rule-based-v1",
      dominantLayer: "L4_ml",
      reasons: [
        { feature: "near_50k_threshold",  impact: 0.25, value: 48750,  description: "Amount ₹48,750 is suspiciously close to ₹50,000 reporting threshold" },
        { feature: "amount_channel_upi",  impact: 0.25, value: 48750,  description: "UPI transaction ₹48,750 exceeds typical UPI range" },
        { feature: "vpa_age",             impact: 0.10, value: 4,       description: "Receiver VPA is only 4 days old" },
        { feature: "unusual_hour",        impact: 0.10, value: 1,       description: "Transaction at unusual hour: 1:00 (1AM-5AM window)" },
      ],
      layers: { L1_location: 0.35, L2_channel: 0.25, L3_behavioral: 0.40, L4_ml: 0.62, L5_network: 0.10, L6_velocity: 0.15 },
      llm: null,
    },
    alert: { id: "demo-alert-struct", severity: "HIGH", status: "NEW", alertType: "SUSPICIOUS_PATTERN" },
  },
  highvalue: {
    id: "demo-txn-hv",
    transactionId: "TXN-DEMO-HVF003",
    amount: 1250000, type: "NEFT", channel: "NET_BANKING",
    description: "Investment returns",
    fraudScore: 0.90, isFraud: true,
    senderAccount: { accountHolder: "Deepak Joshi", bankName: "Bhagalpur Cooperative Bank", accountNumber: "COOP001234567890" },
    receiverAccount: { accountHolder: "Unknown Shell Co.", bankName: "Fino Payments Bank", accountNumber: "FINO009876543210" },
    mlResult: {
      fraudScore: 0.90, compositeScore: 0.93, modelVersion: "rule-based-v1",
      dominantLayer: "L4_ml",
      reasons: [
        { feature: "scam_keyword",   impact: 0.35, value: true,    description: "Payment remark contains known scam phrase: \"Investment returns\"" },
        { feature: "amount",         impact: 0.30, value: 1250000, description: "High-value transaction: ₹12.5L exceeds ₹5L threshold" },
        { feature: "kyc_type",       impact: 0.15, value: "MIN_KYC", description: "Sender has minimum KYC — high-risk verification level" },
        { feature: "unusual_hour",   impact: 0.10, value: 3,       description: "Transaction at unusual hour: 3:00 (1AM-5AM window)" },
      ],
      layers: { L1_location: 0.85, L2_channel: 0.15, L3_behavioral: 0.75, L4_ml: 0.90, L5_network: 0.60, L6_velocity: 0.05 },
      llm: null,
    },
    alert: { id: "demo-alert-hv", severity: "CRITICAL", status: "NEW", alertType: "HIGH_VALUE" },
  },
  mule: {
    id: "demo-txn-mule",
    transactionId: "TXN-DEMO-MUL004",
    amount: 65000, type: "IMPS", channel: "MOBILE_APP",
    description: "Salary forwarded",
    fraudScore: 0.78, isFraud: true,
    senderAccount: { accountHolder: "Mohammed Irfan", bankName: "State Bank of India", accountNumber: "SBI001111111111" },
    receiverAccount: { accountHolder: "Unknown User 3", bankName: "Fino Payments Bank", accountNumber: "FINO001111111111" },
    mlResult: {
      fraudScore: 0.78, compositeScore: 0.81, modelVersion: "rule-based-v1",
      dominantLayer: "L5_network",
      reasons: [
        { feature: "sender_mule_score",  impact: 0.20, value: 0.71, description: "Sender account has elevated mule score: 0.71 — flagged in prior transactions" },
        { feature: "amount_channel",     impact: 0.25, value: 65000, description: "UPI/IMPS transaction ₹65,000 exceeds typical range" },
        { feature: "kyc_type",           impact: 0.10, value: "OTP_BASED", description: "Sender has OTP-based KYC (lower verification tier)" },
        { feature: "unusual_hour",       impact: 0.10, value: 22,   description: "Transaction at late-night hour: 22:00" },
        { feature: "vpa_age",            impact: 0.10, value: 2,    description: "Receiver VPA is only 2 days old" },
      ],
      layers: { L1_location: 0.55, L2_channel: 0.25, L3_behavioral: 0.55, L4_ml: 0.78, L5_network: 0.88, L6_velocity: 0.40 },
      llm: null,
    },
    alert: { id: "demo-alert-mule", severity: "HIGH", status: "NEW", alertType: "MULE_ACCOUNT" },
  },
  uncertain: {
    id: "demo-txn-uncertain",
    transactionId: "TXN-DEMO-UNS005",
    amount: 35000, type: "UPI", channel: "MOBILE_APP",
    description: "Forex profit",
    fraudScore: 0.52, isFraud: false,
    senderAccount: { accountHolder: "Neha Gupta", bankName: "ICICI Bank", accountNumber: "ICICI001234567890" },
    receiverAccount: { accountHolder: "Trader99", bankName: "Paytm Payments Bank", accountNumber: "PAYTM001234567890" },
    mlResult: {
      fraudScore: 0.52, compositeScore: 0.57, modelVersion: "rule-based-v1",
      dominantLayer: "L4_ml",
      reasons: [
        { feature: "scam_keyword",   impact: 0.35, value: true, description: "Payment remark contains known scam phrase: \"Forex profit\"" },
        { feature: "kyc_type",       impact: 0.10, value: "OTP_BASED", description: "Sender has OTP-based KYC (lower verification tier)" },
        { feature: "cross_bank",     impact: 0.05, value: true, description: "Cross-bank transfer: ICICI Bank → Paytm Payments Bank" },
      ],
      layers: { L1_location: 0.20, L2_channel: 0.25, L3_behavioral: 0.25, L4_ml: 0.52, L5_network: 0.15, L6_velocity: 0.10 },
      llm: {
        verdict: "UNCERTAIN",
        confidence: 0.58,
        reasoning: "The payment description 'Forex profit' is a known social engineering phrase used in investment scams. However, account KYC is OTP-based which is borderline. The ₹35,000 amount and Paytm receiver suggest possible informal forex trading app payout. Without additional velocity data, cannot confirm fraud with high confidence. Recommend manual review.",
        flags: ["scam_keyword_match", "suspicious_psp", "otp_kyc_risk"],
        fromCache: false,
      },
    },
    alert: { id: "demo-alert-uncertain", severity: "MEDIUM", status: "NEW", alertType: "SUSPICIOUS_PATTERN" },
  },
};


// ─── Helpers ────────────────────────────────────────────────────────────────
function ScoreGauge({ score }) {
  const pct = Math.round((score || 0) * 100);
  const color = score >= 0.75 ? "#ef4444" : score >= 0.5 ? "#f97316" : score >= 0.35 ? "#eab308" : "#22c55e";
  const circumference = 2 * Math.PI * 45;
  const strokeDash = circumference - (circumference * pct) / 100;
  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDash}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-black" style={{ color }}>{pct}</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Risk %</span>
      </div>
    </div>
  );
}

function LayerBar({ label, value }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="capitalize text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${getRiskBarColor(value)}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

function SeverityIcon({ severity }) {
  if (severity === "CRITICAL" || severity === "HIGH") return <ShieldBan className="h-5 w-5 text-destructive" />;
  if (severity === "MEDIUM") return <ShieldAlert className="h-5 w-5 text-amber-500" />;
  return <ShieldCheck className="h-5 w-5 text-emerald-500" />;
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function AnalyzePage() {
  const [accounts, setAccounts]       = useState([]);
  const [activeScenario, setActive]   = useState(null);
  const [form, setForm]               = useState({
    amount: "", type: "UPI", channel: "MOBILE_APP",
    senderAccountId: "", receiverAccountId: "",
    upiVpaSender: "", upiVpaReceiver: "", vpaAgeDays: "",
    location: "", description: "", timestamp: "",
  });
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState(null);
  const [batchFile, setBatchFile]     = useState(null);
  const [batchError, setBatchError]   = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [dragOver, setDragOver]       = useState(false);
  const fileRef                       = useRef();
  const resultRef                     = useRef();

  useEffect(() => {
    // API returns { success, data: [...] } — unwrap the envelope
    api.get("/accounts?limit=50").then(r => setAccounts(r.data?.data || r.data || [])).catch(() => {});
  }, []);

  // Apply scenario preset
  function applyScenario(sc) {
    setActive(sc.id);
    setResult(null);
    setError(null);
    const ts = new Date();
    ts.setHours(sc.fields.hour, 0, 0, 0);
    // Pick accounts: for fraud pick mule accounts if possible
    const sender   = accounts[0] || {};
    const receiver = accounts[1] || {};
    setForm(f => ({
      ...f,
      amount:           sc.fields.amount,
      type:             sc.fields.type,
      channel:          sc.fields.channel,
      location:         sc.fields.location,
      description:      sc.fields.description,
      upiVpaSender:     sc.fields.upiVpaSender  || "",
      upiVpaReceiver:   sc.fields.upiVpaReceiver || "",
      vpaAgeDays:       sc.fields.vpaAgeDays != null ? sc.fields.vpaAgeDays : "",
      timestamp:        ts.toISOString().slice(0, 16),
      senderAccountId:  sender.id   || f.senderAccountId,
      receiverAccountId: receiver.id || f.receiverAccountId,
    }));
  }

  function fieldChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setActive(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try {
      // ── Demo mode: use hardcoded result for preset scenarios ──────────────
      if (activeScenario && DEMO_RESULTS[activeScenario]) {
        // Simulate a realistic processing delay
        await new Promise(r => setTimeout(r, 1200));
        const demo = DEMO_RESULTS[activeScenario];
        // Give each run a unique transaction ID suffix so it looks fresh
        const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
        setResult({ ...demo, transactionId: `${demo.transactionId}-${suffix}` });
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        return;
      }
      // ── Real API path for manual form entries ─────────────────────────────
      const payload = {
        ...form,
        amount:     parseFloat(form.amount),
        vpaAgeDays: form.vpaAgeDays !== "" ? parseInt(form.vpaAgeDays) : null,
        timestamp:  form.timestamp  ? new Date(form.timestamp).toISOString() : undefined,
        upiVpaSender:   form.type === "UPI" ? form.upiVpaSender  || null : null,
        upiVpaReceiver: form.type === "UPI" ? form.upiVpaReceiver || null : null,
      };
      const res = await api.post("/transactions", payload);
      // Response shape: { success, data: { transaction: {id,...}, mlResult, alert } }
      const responseData = res.data?.data || res.data;
      const txnData = responseData?.transaction || responseData;
      const txnId = txnData?.id;
      console.log("[AnalyzePage] POST response:", res.status, "txnId:", txnId, "keys:", Object.keys(responseData || {}));
      if (!txnId) {
        console.error("[AnalyzePage] Full response:", JSON.stringify(res.data).slice(0, 500));
        throw new Error("Transaction created but ID not returned");
      }
      // Fetch full transaction with mlReasons
      const full = await api.get(`/transactions/${txnId}`);
      // Pass both the transaction AND mlResult so results panel has all layers
      const txn = full.data?.data || full.data;
      // Merge mlResult from create response into the transaction object
      const mlResult = responseData?.mlResult;
      if (mlResult && txn) txn.mlResult = mlResult;
      if (responseData?.alert && txn) txn.alert = responseData.alert;
      setResult(txn);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  // ── File Upload ─────────────────────────────────────────────────────────
  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          if (file.name.endsWith(".json")) {
            resolve(JSON.parse(text));
          } else {
            // CSV parser
            const lines = text.trim().split("\n").filter(Boolean);
            const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
            const rows = lines.slice(1).map(line => {
              const vals = line.split(",").map(v => v.trim().replace(/"/g, ""));
              return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
            });
            resolve(rows);
          }
        } catch {
          reject(new Error("Invalid file format"));
        }
      };
      reader.readAsText(file);
    });
  }

  async function handleFileDrop(file) {
    setBatchFile(file); setBatchError(null); setBatchResults(null);
  }

  async function submitBatch() {
    if (!batchFile) return;
    setBatchLoading(true); setBatchError(null);
    try {
      const rows = await parseFile(batchFile);
      if (!Array.isArray(rows) || rows.length === 0) throw new Error("No valid rows found");
      if (rows.length > 50) throw new Error("Max 50 transactions per batch");
      // Ensure accounts are assigned
      const s = accounts[0]?.id; const r = accounts[1]?.id;
      const transactions = rows.map(row => ({
        amount:           parseFloat(row.amount || 0),
        type:             row.type             || "UPI",
        channel:          row.channel          || "MOBILE_APP",
        senderAccountId:  row.senderAccountId  || s,
        receiverAccountId: row.receiverAccountId || r,
        location:         row.location         || null,
        description:      row.description      || null,
        upiVpaSender:     row.upiVpaSender     || null,
        upiVpaReceiver:   row.upiVpaReceiver    || null,
      }));
      const res = await api.post("/transactions/bulk", { transactions });
      setBatchResults(res.data);
    } catch (err) {
      setBatchError(err.response?.data?.message || err.message);
    } finally {
      setBatchLoading(false);
    }
  }

  // ── Download sample CSV ────────────────────────────────────────────────
  function downloadSample() {
    const csv = [
      "amount,type,channel,location,description,upiVpaSender,upiVpaReceiver",
      "2500,UPI,MOBILE_APP,Mumbai,Grocery payment,user1@oksbi,merchant@ybl",
      "48750,UPI,MOBILE_APP,Patna,Monthly rent,user2@paytm,new@ibl",
      "1250000,NEFT,NET_BANKING,Bhagalpur,Investment returns,,",
      "65000,IMPS,MOBILE_APP,Gorakhpur,Salary forwarded,u44@fino,r22@fino",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sample_transactions.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Result extraction ──────────────────────────────────────────────────
  // mlResult is merged in from the POST response (has layers, llm, compositeScore)
  // mlReasons is the flat SHAP array stored on the DB transaction
  const mlResult    = result?.mlResult || {};
  const mlReasons   = Array.isArray(result?.mlReasons) ? result.mlReasons : [];
  const mlScore     = mlResult.fraudScore ?? result?.fraudScore ?? null;
  const composite   = mlResult.compositeScore ?? null;
  const layers      = mlResult.layers ?? null;
  const llm         = mlResult.llm ?? null;
  const effectiveScore = mlScore ?? result?.fraudScore ?? 0;
  const dominantLayer  = mlResult.dominantLayer ?? null;
  // reasons: prefer mlResult.reasons (richer), fall back to flat mlReasons array
  const reasons = mlResult.reasons?.length > 0 ? mlResult.reasons : mlReasons;
  const severity       = result?.alert?.severity ?? (effectiveScore >= 0.75 ? "CRITICAL" : effectiveScore >= 0.5 ? "HIGH" : effectiveScore >= 0.35 ? "MEDIUM" : "LOW");

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-lg shadow-violet-500/20">
          <FlaskConical className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Transaction Analysis Lab</h1>
          <p className="text-sm text-muted-foreground">Submit a single transaction or upload a batch — get full 3-brain risk analysis</p>
        </div>
      </div>

      {/* ── Scenario Presets ─────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick Scenarios</p>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map(sc => (
            <button
              key={sc.id}
              onClick={() => applyScenario(sc)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all duration-150 hover:shadow-sm ${
                activeScenario === sc.id
                  ? SCENARIO_COLOR[sc.color] + " ring-2 ring-offset-1 ring-current shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <span>{sc.emoji}</span>
              <span>{sc.label}</span>
              <ChevronRight className="h-3 w-3 opacity-60" />
            </button>
          ))}
        </div>
        {activeScenario && (
          <p className="mt-2 text-xs text-muted-foreground">
            ℹ️ {SCENARIOS.find(s => s.id === activeScenario)?.description} — form pre-filled below
          </p>
        )}
      </div>

      {/* ── Form Tabs ─────────────────────────────────────────────────── */}
      <Tabs defaultValue="manual">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="manual" className="gap-1.5"><Zap className="h-3.5 w-3.5" />Manual</TabsTrigger>
          <TabsTrigger value="upload" className="gap-1.5"><Upload className="h-3.5 w-3.5" />File Upload</TabsTrigger>
        </TabsList>

        {/* ── Manual Entry ─────────────────────────────── */}
        <TabsContent value="manual" className="mt-4">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Amount + Type + Channel */}
              <Card className="lg:col-span-3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Transaction Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Amount (₹) *</label>
                      <input
                        name="amount" type="number" min="1" step="0.01" required
                        value={form.amount} onChange={fieldChange}
                        placeholder="e.g. 48750"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Type *</label>
                      <select
                        name="type" value={form.type} onChange={fieldChange}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        {["UPI","NEFT","RTGS","IMPS","CASH_DEPOSIT","CASH_WITHDRAWAL"].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Channel *</label>
                      <select
                        name="channel" value={form.channel} onChange={fieldChange}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        {["MOBILE_APP","NET_BANKING","ATM","BRANCH","POS","API"].map(c => (
                          <option key={c} value={c}>{c.replace("_"," ")}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Accounts */}
              <Card className="lg:col-span-3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Parties</CardTitle>
                  <CardDescription className="text-xs">Select sender and receiver accounts from the database</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sender Account *</label>
                      <select
                        name="senderAccountId" value={form.senderAccountId} onChange={fieldChange} required
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="">Select sender...</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.accountHolder} — {a.bankName} ({a.kycType})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Receiver Account *</label>
                      <select
                        name="receiverAccountId" value={form.receiverAccountId} onChange={fieldChange} required
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="">Select receiver...</option>
                        {accounts.filter(a => a.id !== form.senderAccountId).map(a => (
                          <option key={a.id} value={a.id}>{a.accountHolder} — {a.bankName}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* UPI VPA (conditional) */}
              {form.type === "UPI" && (
                <Card className="lg:col-span-3">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">UPI Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sender VPA</label>
                        <input name="upiVpaSender" value={form.upiVpaSender} onChange={fieldChange}
                          placeholder="user@oksbi"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Receiver VPA</label>
                        <input name="upiVpaReceiver" value={form.upiVpaReceiver} onChange={fieldChange}
                          placeholder="merchant@ybl"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">VPA Age (days)</label>
                        <input name="vpaAgeDays" type="number" min="0" value={form.vpaAgeDays} onChange={fieldChange}
                          placeholder="e.g. 90"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Meta: Location + Time + Remarks */}
              <Card className="lg:col-span-3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Context & Remarks</CardTitle>
                  <CardDescription className="text-xs">Payment remarks are read by both keyword engine and Gemini AI</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Origin City</label>
                      <input name="location" value={form.location} onChange={fieldChange}
                        placeholder="e.g. Mumbai"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Timestamp</label>
                      <input name="timestamp" type="datetime-local" value={form.timestamp} onChange={fieldChange}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Payment Remarks</label>
                      <input name="description" value={form.description} onChange={fieldChange}
                        placeholder="e.g. Monthly rent"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <Button type="submit" disabled={loading} className="gap-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white shadow-lg shadow-violet-500/20">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                {loading ? "Analyzing..." : "Run Full Analysis"}
              </Button>
              <span className="text-xs text-muted-foreground">ML + 6-Layer Engine + Gemini AI</span>
            </div>
          </form>
        </TabsContent>

        {/* ── File Upload Tab ───────────────────────────── */}
        <TabsContent value="upload" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" /> Batch Upload
              </CardTitle>
              <CardDescription className="text-xs">
                Upload a CSV or JSON file (max 50 rows). Each row is scored independently.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileDrop(f); }}
                onClick={() => fileRef.current?.click()}
                className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200 py-10 flex flex-col items-center gap-3 ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : batchFile
                    ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
                    : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <input ref={fileRef} type="file" accept=".csv,.json" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleFileDrop(e.target.files[0]); }}
                />
                {batchFile ? (
                  <>
                    {batchFile.name.endsWith(".json") ? <FileJson className="h-8 w-8 text-emerald-500" /> : <FileSpreadsheet className="h-8 w-8 text-emerald-500" />}
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{batchFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(batchFile.size / 1024).toFixed(1)} KB — click to change</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-muted-foreground">Drop CSV or JSON here, or click to browse</p>
                    <p className="text-xs text-muted-foreground/70">Supports .csv and .json · Max 50 rows</p>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={submitBatch} disabled={!batchFile || batchLoading}
                  className="gap-2 bg-gradient-to-r from-violet-600 to-blue-600 text-white"
                >
                  {batchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                  {batchLoading ? "Processing..." : "Analyze Batch"}
                </Button>
                <button onClick={downloadSample} className="text-xs text-primary underline-offset-2 hover:underline">
                  Download sample CSV
                </button>
                {batchFile && (
                  <button onClick={() => { setBatchFile(null); setBatchResults(null); setBatchError(null); }} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>

              {batchError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />{batchError}
                </div>
              )}

              {/* Batch results table */}
              {batchResults && Array.isArray(batchResults) && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Batch Results — {batchResults.length} transactions
                  </p>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">ID</th>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Amount</th>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Type</th>
                          <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Score</th>
                          <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Verdict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchResults.map((t, i) => {
                          const score = t.fraudScore ?? t.mlResult?.fraudScore ?? 0;
                          return (
                            <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                              <td className="px-3 py-2 font-mono text-muted-foreground">{(t.transactionId || t.id || "").slice(0,12)}…</td>
                              <td className="px-3 py-2 font-mono">{formatINR(t.amount)}</td>
                              <td className="px-3 py-2">{t.type}</td>
                              <td className={`px-3 py-2 text-right font-bold font-mono ${getRiskColor(score)}`}>{(score * 100).toFixed(0)}%</td>
                              <td className="px-3 py-2 text-right">
                                {score >= 0.75 ? <Badge variant="destructive" className="text-[9px]">FRAUD</Badge>
                                 : score >= 0.35 ? <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-600">REVIEW</Badge>
                                 : <Badge variant="outline" className="text-[9px] border-emerald-400 text-emerald-600">SAFE</Badge>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Results Panel ─────────────────────────────────────────────── */}
      {result && (
        <div ref={resultRef} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Separator />
          <div className="flex items-center gap-2">
            <SeverityIcon severity={severity} />
            <h2 className="text-base font-bold">Analysis Result</h2>
            <Badge variant={severity === "CRITICAL" || severity === "HIGH" ? "destructive" : severity === "MEDIUM" ? "outline" : "secondary"}>
              {severity}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto font-mono">{result.transactionId}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Score + Summary */}
            <Card className="lg:col-span-1 flex flex-col items-center justify-center py-6 gap-4">
              <ScoreGauge score={effectiveScore} />
              <div className="text-center space-y-1">
                <p className={`text-2xl font-black ${getRiskColor(effectiveScore)}`}>
                  {effectiveScore >= 0.75 ? "HIGH RISK" : effectiveScore >= 0.5 ? "SUSPICIOUS" : effectiveScore >= 0.35 ? "REVIEW" : "SAFE"}
                </p>
                <p className="text-xs text-muted-foreground">{formatINR(result.amount)} · {result.type} · {result.channel}</p>
                {result.description && (
                  <p className="text-[11px] italic text-muted-foreground/70">"{result.description}"</p>
                )}
              </div>
              <div className="w-full px-4 grid grid-cols-2 gap-2 text-center">
                {mlScore != null && (
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">ML Score</p>
                    <p className={`text-lg font-bold font-mono ${getRiskColor(mlScore)}`}>{(mlScore * 100).toFixed(0)}%</p>
                  </div>
                )}
                {composite != null && (
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">6-Layer</p>
                    <p className={`text-lg font-bold font-mono ${getRiskColor(composite)}`}>{(composite * 100).toFixed(0)}%</p>
                  </div>
                )}
              </div>
            </Card>

            {/* 6-Layer Breakdown */}
            {layers && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4" /> 6-Layer Breakdown
                  </CardTitle>
                  {dominantLayer && (
                    <CardDescription className="text-xs">
                      Dominant: <span className="font-semibold capitalize text-foreground">{dominantLayer}</span>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(layers).map(([k, v]) => (
                    <LayerBar key={k} label={k} value={v} />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ML Reasons */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Risk Signals
                </CardTitle>
                <CardDescription className="text-xs">Top factors from ML & rule engine</CardDescription>
              </CardHeader>
              <CardContent>
                {reasons.length > 0 ? (
                  <div className="space-y-2.5">
                    {reasons.slice(0, 6).map((r, i) => {
                      const maxImpact = Math.max(...reasons.map(x => x.impact || 0), 0.3);
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground truncate pr-2">{r.description || r.feature}</span>
                            <span className="font-mono font-bold shrink-0">+{(r.impact || 0).toFixed(2)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${getRiskBarColor(r.impact)}`}
                              style={{ width: `${((r.impact || 0) / maxImpact) * 100}%`, transition: "width 0.6s ease" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No risk signals detected</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Gemini Panel */}
          {llm ? (
            <div className="rounded-xl border bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-violet-700 dark:text-violet-400 flex items-center gap-2">
                  ✨ Gemini AI Reasoning
                  {llm.fromCache && <span className="text-[9px] bg-violet-100 text-violet-600 px-1 rounded font-normal">cached</span>}
                  <span className="text-[9px] bg-violet-100 text-violet-600 px-1 rounded font-normal">{llm.model}</span>
                </p>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  llm.verdict === "SUSPICIOUS" ? "bg-red-100 text-red-700" :
                  llm.verdict === "MONITOR"    ? "bg-amber-100 text-amber-700" :
                                                 "bg-emerald-100 text-emerald-700"
                }`}>
                  {llm.verdict} · {(llm.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{llm.reasoning}</p>
              {llm.flags?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {llm.flags.map((f, i) => (
                    <span key={i} className="text-xs bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 px-2.5 py-1 rounded-full">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : effectiveScore >= 0.35 && effectiveScore <= 0.75 ? (
            <div className="rounded-xl border border-dashed border-violet-300 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/10 p-4 flex items-center gap-3">
              <span className="text-xl">✨</span>
              <div>
                <p className="text-sm font-semibold text-violet-600 dark:text-violet-400">Gemini AI — Queued</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Score {(effectiveScore * 100).toFixed(0)}% is in the uncertain zone. LLM analysis will run on next quota reset or if cache is warm.
                </p>
              </div>
            </div>
          ) : null}

          {/* Alert created notice */}
          {result.alert && (
            <div className="flex items-center gap-2 text-sm bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2.5">
              <ShieldBan className="h-4 w-4 text-destructive shrink-0" />
              <span className="font-medium text-destructive">Alert created</span>
              <span className="text-muted-foreground">— ID {result.alert.id?.slice(0,12)}… · Status: {result.alert.status}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
