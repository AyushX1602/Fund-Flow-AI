import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Shield, ShieldAlert, ShieldCheck, ShieldX,
  AlertTriangle, CheckCircle2, XCircle, Flag,
  ArrowRight, RefreshCw, ChevronDown, ChevronUp,
  User, IndianRupee, CreditCard, Banknote, Clock,
  TrendingUp, Eye, Lock,
} from "lucide-react";
import Header from "@/components/layout/Header";
import api from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────
const TXN_TYPES   = ["UPI", "NEFT", "RTGS", "IMPS", "WIRE"];
const TXN_CHANNELS = ["MOBILE_APP", "NET_BANKING", "ATM", "BRANCH", "API"];

function riskColor(tier) {
  return {
    CRITICAL: { bg: "bg-red-500/15", border: "border-red-500/40", text: "text-red-400", badge: "bg-red-500/20 text-red-300", bar: "bg-red-500" },
    HIGH:     { bg: "bg-orange-500/15", border: "border-orange-500/40", text: "text-orange-400", badge: "bg-orange-500/20 text-orange-300", bar: "bg-orange-500" },
    MEDIUM:   { bg: "bg-amber-500/15", border: "border-amber-500/40", text: "text-amber-400", badge: "bg-amber-500/20 text-amber-300", bar: "bg-amber-500" },
    LOW:      { bg: "bg-emerald-500/15", border: "border-emerald-500/40", text: "text-emerald-400", badge: "bg-emerald-500/20 text-emerald-300", bar: "bg-emerald-500" },
  }[tier] || { bg: "bg-muted/30", border: "border-border", text: "text-foreground", badge: "bg-muted text-muted-foreground", bar: "bg-muted" };
}

function impactColor(impact) {
  return { HIGH: "text-red-400", MEDIUM: "text-amber-400", LOW: "text-emerald-400" }[impact] || "text-muted-foreground";
}

function ScoreBar({ score, tier }) {
  const c = riskColor(tier);
  return (
    <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${c.bar}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.round(score * 100)}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PreScreenPage() {
  const [accounts, setAccounts] = useState([]);
  const [senderId, setSenderId] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [amount, setAmount]     = useState("");
  const [txnType, setTxnType]   = useState("UPI");
  const [channel, setChannel]   = useState("MOBILE_APP");

  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [action, setAction]     = useState(null); // "BLOCKED" | "FLAGGED" | "ALLOWED"
  const [expandedSig, setExpandedSig] = useState(null);

  // Load accounts on mount
  useEffect(() => {
    api.get("/accounts?limit=100&page=1").then((d) => {
      const list = d?.data || d || [];
      setAccounts(Array.isArray(list) ? list : []);
    }).catch(() => {});
  }, []);

  async function handleScreen(e) {
    e.preventDefault();
    if (!senderId || !receiverId || !amount) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setAction(null);
    try {
      const res = await api.post("/preemptive/screen", {
        senderId, receiverId, amount: parseFloat(amount), type: txnType, channel,
      });
      setResult(res.data || res);
    } catch (err) {
      setError(err.message || "Screening failed");
    } finally {
      setLoading(false);
    }
  }

  function handleBlock() {
    setAction("BLOCKED");
  }
  function handleFlag() {
    // In a real system, this would create an alert. For demo, just show confirmation.
    setAction("FLAGGED");
  }
  function handleAllow() {
    setAction("ALLOWED");
  }
  function handleReset() {
    setResult(null);
    setAction(null);
    setError(null);
  }

  const senderAccount   = accounts.find(a => a.id === senderId);
  const receiverAccount = accounts.find(a => a.id === receiverId);

  return (
    <>
      <Header
        title="Pre-Transaction Screener"
        subtitle="Screen a transaction before it happens — powered by behavioral AI"
      />

      <div className="flex-1 p-6 space-y-5 max-w-5xl mx-auto w-full">

        {/* Hero intro */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-violet-500/25 p-5"
          style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.10) 0%, rgba(59,130,246,0.07) 100%)" }}
        >
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-500" />
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/20">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Preemptive Fraud Interception</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                Select a sender and receiver, enter the transaction amount, and our AI analyzes the sender's
                <strong className="text-foreground"> last 7 days of behavioral history</strong> — velocity,
                fan-out, amount anomaly, mule score, and KYC risk — before the money moves.
                You can then <strong className="text-red-400">block</strong>, <strong className="text-amber-400">flag</strong>, or <strong className="text-emerald-400">allow</strong> the transaction.
              </p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* ── FORM ────────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
              <CreditCard className="h-4 w-4 text-violet-400" />
              Transaction Details
            </h4>

            <form onSubmit={handleScreen} className="space-y-4">
              {/* Sender */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sender Account *
                </label>
                <select
                  value={senderId}
                  onChange={e => setSenderId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                >
                  <option value="">— Select sender —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id} disabled={a.id === receiverId}>
                      {a.accountHolder} — {a.bankName} ({a.accountNumber})
                    </option>
                  ))}
                </select>
                {senderAccount && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    KYC: <span className={senderAccount.kycType === "FULL_KYC" ? "text-emerald-400" : "text-amber-400"}>{senderAccount.kycType}</span>
                    {" · "}Mule Score: <span className={senderAccount.muleScore > 0.5 ? "text-red-400" : "text-emerald-400"}>{(senderAccount.muleScore * 100).toFixed(0)}%</span>
                    {senderAccount.isFrozen && <span className="ml-2 text-red-400 font-semibold">⚠ FROZEN</span>}
                  </p>
                )}
              </div>

              {/* Receiver */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Receiver Account *
                </label>
                <select
                  value={receiverId}
                  onChange={e => setReceiverId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                >
                  <option value="">— Select receiver —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id} disabled={a.id === senderId}>
                      {a.accountHolder} — {a.bankName} ({a.accountNumber})
                    </option>
                  ))}
                </select>
                {receiverAccount && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Mule Score: <span className={receiverAccount.muleScore > 0.5 ? "text-red-400" : "text-emerald-400"}>{(receiverAccount.muleScore * 100).toFixed(0)}%</span>
                    {receiverAccount.isFrozen && <span className="ml-2 text-red-400 font-semibold">⚠ FROZEN</span>}
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount (₹) *
                </label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="e.g. 49000"
                    min="1"
                    required
                    className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                  />
                </div>
              </div>

              {/* Type + Channel row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</label>
                  <select
                    value={txnType}
                    onChange={e => setTxnType(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-violet-500 focus:outline-none"
                  >
                    {TXN_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channel</label>
                  <select
                    value={channel}
                    onChange={e => setChannel(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-violet-500 focus:outline-none"
                  >
                    {TXN_CHANNELS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Quick amount presets */}
              <div className="flex gap-2 flex-wrap">
                {[5000, 49000, 99000, 500000].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className="rounded-lg border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground hover:border-violet-500/50 hover:text-foreground transition-colors"
                  >
                    ₹{v.toLocaleString("en-IN")}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={loading || !senderId || !receiverId || !amount}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-500/20 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {loading
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Analyzing behavioral history…</>
                  : <><Shield className="h-4 w-4" /> Screen Transaction <ArrowRight className="h-4 w-4" /></>
                }
              </button>
            </form>
          </motion.div>

          {/* ── RESULT PANEL ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {!result && !loading && !error && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 p-12 text-center"
                >
                  <Eye className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Fill in the form and click Screen Transaction</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">The AI will analyze sender's historical behavior before the money moves</p>
                </motion.div>
              )}

              {loading && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/5 p-12 text-center"
                >
                  <div className="relative mb-4">
                    <div className="h-14 w-14 rounded-full border-2 border-violet-500/20" />
                    <div className="absolute inset-0 h-14 w-14 rounded-full border-t-2 border-violet-500 animate-spin" />
                    <Zap className="absolute inset-0 m-auto h-5 w-5 text-violet-400" />
                  </div>
                  <p className="text-sm font-semibold text-violet-400">Scanning behavioral history…</p>
                  <p className="mt-1 text-xs text-muted-foreground">Velocity · Fan-out · Z-score · Mule risk · KYC</p>
                </motion.div>
              )}

              {error && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
                  <p className="text-sm font-semibold text-red-400">Screening failed</p>
                  <p className="text-xs text-muted-foreground mt-1">{error}</p>
                </motion.div>
              )}

              {result && !action && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className={`rounded-2xl border ${riskColor(result.tier).border} ${riskColor(result.tier).bg} overflow-hidden`}
                >
                  {/* Score header */}
                  <div className="p-5 border-b border-white/5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {result.tier === "CRITICAL" && <ShieldX className="h-5 w-5 text-red-400" />}
                        {result.tier === "HIGH"     && <ShieldAlert className="h-5 w-5 text-orange-400" />}
                        {result.tier === "MEDIUM"   && <ShieldAlert className="h-5 w-5 text-amber-400" />}
                        {result.tier === "LOW"      && <ShieldCheck className="h-5 w-5 text-emerald-400" />}
                        <span className={`text-sm font-bold ${riskColor(result.tier).text}`}>
                          {result.tier} RISK
                        </span>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${riskColor(result.tier).badge}`}>
                        {result.recommendation}
                      </span>
                    </div>

                    <div className="flex items-end gap-3 mb-2">
                      <span className="font-mono text-4xl font-bold text-foreground">
                        {result.riskPercent}
                      </span>
                      <span className="mb-1 text-sm text-muted-foreground">/ 100 Risk Score</span>
                    </div>
                    <ScoreBar score={result.score} tier={result.tier} />

                    {/* Sender history pill row */}
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {[
                        { label: "1h txns",  value: result.senderHistory?.txns1h },
                        { label: "24h txns", value: result.senderHistory?.txns24h },
                        { label: "7d txns",  value: result.senderHistory?.txns7d },
                      ].map(p => (
                        <span key={p.label} className="rounded-lg bg-background/40 border border-border/50 px-2.5 py-1 text-xs font-mono text-muted-foreground">
                          <span className="font-bold text-foreground">{p.value}</span> {p.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Signals */}
                  <div className="divide-y divide-white/5">
                    {result.signals?.map((sig, i) => (
                      <div key={i} className="px-5 py-3">
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setExpandedSig(expandedSig === i ? null : i)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs font-semibold text-foreground">{sig.name}</span>
                              <span className={`text-[10px] font-bold uppercase ${impactColor(sig.impact)}`}>
                                {sig.impact}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground">{sig.value}</span>
                              {expandedSig === i ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                            </div>
                          </div>
                          <div className="mt-1.5">
                            <ScoreBar score={sig.score} tier={sig.impact === "HIGH" ? "HIGH" : sig.impact === "MEDIUM" ? "MEDIUM" : "LOW"} />
                          </div>
                        </button>
                        {expandedSig === i && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-2 text-xs text-muted-foreground leading-relaxed pl-5"
                          >
                            {sig.description}
                          </motion.p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div className="p-5 border-t border-white/5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Take Action
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleBlock}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/25 transition-colors"
                      >
                        <Lock className="h-4 w-4" /> Block
                      </button>
                      <button
                        onClick={handleFlag}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 px-3 py-2.5 text-sm font-bold text-amber-400 hover:bg-amber-500/25 transition-colors"
                      >
                        <Flag className="h-4 w-4" /> Flag
                      </button>
                      <button
                        onClick={handleAllow}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-2.5 text-sm font-bold text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Allow
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Action outcome ─── */}
              {action && result && (
                <motion.div
                  key="action"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`rounded-2xl border p-8 text-center ${
                    action === "BLOCKED"  ? "border-red-500/40 bg-red-500/10" :
                    action === "FLAGGED"  ? "border-amber-500/40 bg-amber-500/10" :
                                           "border-emerald-500/40 bg-emerald-500/10"
                  }`}
                >
                  {action === "BLOCKED" && (
                    <>
                      <div className="mb-4 flex items-center justify-center">
                        <div className="relative h-20 w-20">
                          <div className="absolute inset-0 animate-ping rounded-full bg-red-500/20" />
                          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20 border-2 border-red-500/40">
                            <XCircle className="h-10 w-10 text-red-400" />
                          </div>
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-red-400">Transaction Blocked</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        ₹{parseFloat(amount).toLocaleString("en-IN")} transfer from{" "}
                        <strong className="text-foreground">{senderAccount?.accountHolder}</strong> to{" "}
                        <strong className="text-foreground">{receiverAccount?.accountHolder}</strong> has been intercepted and stopped.
                      </p>
                      <div className="mt-3 inline-block rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400">
                        Risk Score: {result.riskPercent}/100 · {result.tier}
                      </div>
                    </>
                  )}
                  {action === "FLAGGED" && (
                    <>
                      <div className="mb-4 flex items-center justify-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/20 border-2 border-amber-500/40">
                          <AlertTriangle className="h-10 w-10 text-amber-400" />
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-amber-400">Transaction Flagged</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        ₹{parseFloat(amount).toLocaleString("en-IN")} transfer queued for manual review.
                        An alert has been logged for investigator action.
                      </p>
                      <div className="mt-3 inline-block rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-400">
                        Held for review · Risk Score: {result.riskPercent}/100
                      </div>
                    </>
                  )}
                  {action === "ALLOWED" && (
                    <>
                      <div className="mb-4 flex items-center justify-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 border-2 border-emerald-500/40">
                          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-emerald-400">Transaction Cleared</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        ₹{parseFloat(amount).toLocaleString("en-IN")} transfer from{" "}
                        <strong className="text-foreground">{senderAccount?.accountHolder}</strong> approved.
                        Transaction may proceed.
                      </p>
                      <div className="mt-3 inline-block rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                        Override approved · Risk Score: {result.riskPercent}/100
                      </div>
                    </>
                  )}

                  <div className="mt-6 flex gap-3 justify-center">
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-2 rounded-xl bg-background/60 border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-background transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" /> Screen Another
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}
