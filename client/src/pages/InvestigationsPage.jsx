import { useEffect, useState, useCallback, useRef } from "react";
import Header from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, FileSearch, MessageSquare, Check, ShieldBan, ShieldCheck,
  Sparkles, Loader2, AlertCircle, ChevronRight, UserSearch,
  CheckCircle2, Scale, RefreshCw, BrainCircuit, ArrowUpRight,
  Filter, HelpCircle, Fingerprint, TriangleAlert, Clock,
} from "lucide-react";
import { formatINR, formatRelativeTime, formatScore, getRiskColor, getRiskBarColor, formatDateTime, getSeverityVariant, getAlertTypeName } from "@/lib/formatters";
import api from "@/lib/api";

// ─── Constants ───────────────────────────────────────────────────────────────
const UNCERTAIN_MIN = 0.30;
const UNCERTAIN_MAX = 0.80;
const AUTO_REFRESH_MS = 30000; // auto-refresh every 30s

// ─── Helpers ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg, subtitle }) {
  return (
    <div className={`rounded-xl border p-4 ${bg} transition-all hover:shadow-sm`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-mono tracking-tight ${color}`}>{value}</p>
      {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function ScoreGauge({ score }) {
  const pct = Math.round(score * 100);
  const isUncertain = score >= UNCERTAIN_MIN && score <= UNCERTAIN_MAX;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-muted overflow-hidden relative">
        {/* Uncertain zone highlight */}
        <div className="absolute h-full bg-amber-200/40 dark:bg-amber-800/30"
          style={{ left: `${UNCERTAIN_MIN * 100}%`, width: `${(UNCERTAIN_MAX - UNCERTAIN_MIN) * 100}%` }} />
        <div className={`h-full rounded-full relative z-10 transition-all duration-500 ${getRiskBarColor(score)}`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold ${getRiskColor(score)}`}>{pct}%</span>
      {isUncertain && (
        <span className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
          UNCERTAIN
        </span>
      )}
    </div>
  );
}

function ZoneExplainer({ score }) {
  if (score < UNCERTAIN_MIN) return (
    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
      <ShieldCheck className="h-3 w-3" /> Below threshold — likely safe
    </div>
  );
  if (score > UNCERTAIN_MAX) return (
    <div className="text-[10px] text-red-600 dark:text-red-400 flex items-center gap-1">
      <ShieldBan className="h-3 w-3" /> Above threshold — likely fraud
    </div>
  );
  return (
    <div className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
      <HelpCircle className="h-3 w-3" /> Uncertain zone — AI models disagree, human review needed
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function InvestigationsPage() {
  const [cases, setCases]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  const [detail, setDetail]           = useState(null);
  const [noteText, setNoteText]       = useState("");
  const [showCreate, setShowCreate]   = useState(false);
  const [newCase, setNewCase]         = useState({ title: "", description: "", priority: "HIGH", alertIds: [] });
  const [createError, setCreateError] = useState("");
  const [activeTab, setActiveTab]     = useState("review");
  const [caseCreatingFor, setCaseCreatingFor] = useState(null); // alertId with loading spinner
  const [successMsg, setSuccessMsg]   = useState("");

  // Review queue
  const [reviewAlerts, setReviewAlerts]     = useState([]);
  const [reviewLoading, setReviewLoading]   = useState(true);
  const [aiLoading, setAiLoading]           = useState(null);
  const [aiResults, setAiResults]           = useState({});
  const [lastRefresh, setLastRefresh]       = useState(null);
  const [filterType, setFilterType]         = useState("all");
  const [selectedAlerts, setSelectedAlerts] = useState(new Set());

  // Available alerts for case linking
  const [availableAlerts, setAvailableAlerts] = useState([]);

  // Resolve confirmation
  const [resolveDialog, setResolveDialog] = useState(null); // { alertId, type }
  const [resolveReason, setResolveReason] = useState("");

  // ── Data Fetching ──────────────────────────────────────────────────────
  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/investigations?limit=50");
      setCases(res.data || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  const fetchReviewQueue = useCallback(async () => {
    setReviewLoading(true);
    try {
      // Get ALL new/reviewing alerts — filter uncertain zone on frontend
      const res = await api.get("/alerts?status=NEW&limit=50");
      const all = res.data || [];
      // Only keep uncertain-zone alerts (0.30 - 0.80)
      const uncertain = all.filter(a => {
        const s = a.riskScore || 0;
        return s >= UNCERTAIN_MIN && s <= UNCERTAIN_MAX;
      });
      setReviewAlerts(uncertain);
      setLastRefresh(new Date());
    } catch (err) { console.error(err); }
    setReviewLoading(false);
  }, []);

  const fetchAvailableAlerts = useCallback(async () => {
    try {
      const res = await api.get("/alerts?status=NEW&limit=50");
      setAvailableAlerts(res.data || []);
    } catch (err) { console.error(err); }
  }, []);

  // Initial load + auto-refresh
  useEffect(() => {
    fetchCases();
    fetchReviewQueue();
    fetchAvailableAlerts();
  }, [fetchCases, fetchReviewQueue, fetchAvailableAlerts]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchReviewQueue();
      fetchCases();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchReviewQueue, fetchCases]);

  // ── Case Operations ────────────────────────────────────────────────────
  const openDetail = async (c) => {
    setSelected(c);
    try {
      const res = await api.get(`/investigations/${c.id}`);
      setDetail(res.data);
    } catch { setDetail(null); }
  };

  const createCase = async () => {
    setCreateError("");
    try {
      await api.post("/investigations", newCase);
      setShowCreate(false);
      setNewCase({ title: "", description: "", priority: "HIGH", alertIds: [] });
      fetchCases();
      fetchReviewQueue();
    } catch (err) {
      setCreateError(err?.response?.data?.message || err?.message || "Failed to create");
    }
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const createCaseFromAlert = async (alert) => {
    setCaseCreatingFor(alert.id);
    try {
      const txn = alert.transaction || {};
      const res = await api.post("/investigations", {
        title: `Review: ${txn.senderAccount?.accountHolder || "Unknown"} → ${txn.receiverAccount?.accountHolder || "Unknown"} (${formatINR(txn.amount)})`,
        description: `Auto-created from alert. Risk score: ${(alert.riskScore * 100).toFixed(0)}%. ${txn.description ? `Remarks: "${txn.description}"` : ""}`,
        priority: alert.riskScore > 0.6 ? "HIGH" : "MEDIUM",
        alertIds: [alert.id],
      });
      showSuccess(`Case ${res.data?.caseNumber || ""} created successfully`);
      await fetchCases();
      await fetchReviewQueue();
      setActiveTab("cases");
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to create case";
      alert(`Error: ${msg}`);
      console.error(err);
    }
    setCaseCreatingFor(null);
  };

  const createCaseFromSelected = async () => {
    if (selectedAlerts.size === 0) return;
    const ids = [...selectedAlerts];
    try {
      const res = await api.post("/investigations", {
        title: `Bulk review: ${ids.length} flagged alert(s)`,
        description: `Investigation created from ${ids.length} uncertain-zone alerts requiring human review.`,
        priority: "HIGH",
        alertIds: ids,
      });
      setSelectedAlerts(new Set());
      showSuccess(`Case ${res.data?.caseNumber || ""} created with ${ids.length} alert(s)`);
      await fetchCases();
      await fetchReviewQueue();
      setActiveTab("cases");
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to create case";
      alert(`Error: ${msg}`);
      console.error(err);
    }
  };

  const addNote = async () => {
    if (!noteText.trim() || !selected) return;
    try {
      await api.post(`/investigations/${selected.id}/notes`, { content: noteText });
      setNoteText("");
      openDetail(selected);
    } catch (err) { console.error(err); }
  };

  const closeCase = async (status) => {
    if (!selected) return;
    const findingsMap = {
      CLOSED_FRAUD: "Investigation completed — fraud confirmed by investigator",
      CLOSED_LEGITIMATE: "Investigation completed — transaction deemed legitimate",
      CLOSED_INCONCLUSIVE: "Investigation closed — inconclusive evidence",
    };
    try {
      await api.put(`/investigations/${selected.id}/close`, { findings: findingsMap[status], status });
      fetchCases();
      setSelected(null);
      setDetail(null);
    } catch (err) { console.error(err); }
  };

  // ── Alert Review Operations ────────────────────────────────────────────
  const confirmResolve = (alertId, type) => {
    setResolveDialog({ alertId, type });
    setResolveReason("");
  };

  const executeResolve = async () => {
    if (!resolveDialog) return;
    const { alertId, type } = resolveDialog;
    const status = type === "fraud" ? "RESOLVED_FRAUD" : "RESOLVED_LEGITIMATE";
    const defaultReason = type === "fraud" ? "Confirmed fraud by investigator" : "Cleared by investigator — legitimate transaction";
    try {
      await api.put(`/alerts/${alertId}/resolve`, {
        resolution: resolveReason.trim() || defaultReason,
        status,
      });
      setResolveDialog(null);
      fetchReviewQueue();
      fetchAvailableAlerts();
    } catch (err) { console.error(err); }
  };

  const requestAIAnalysis = async (alert) => {
    setAiLoading(alert.id);
    try {
      const txnId = alert.transaction?.id || alert.transactionId;
      const res = await api.post(`/ml/gemini-analyse/${txnId}`, {});
      const llm = res.data?.llm || null;
      setAiResults(prev => ({
        ...prev,
        [alert.id]: llm || {
          verdict: "ANALYSIS_COMPLETE",
          reasoning: "AI analysis completed but returned no structured result.",
          confidence: 0.5,
          flags: [],
        },
      }));
    } catch (err) {
      setAiResults(prev => ({
        ...prev,
        [alert.id]: {
          verdict: "ERROR",
          reasoning: err.response?.data?.message || "Could not reach AI service. Check API key or quota.",
          confidence: 0,
          flags: [],
        },
      }));
    }
    setAiLoading(null);
  };

  // ── Filtered + Sorted ──────────────────────────────────────────────────
  const filteredAlerts = reviewAlerts.filter(a => {
    if (filterType === "all") return true;
    return a.transaction?.type === filterType;
  }).sort((a, b) => {
    // Sort by distance from 0.5 (most uncertain first)
    const distA = Math.abs(0.5 - (a.riskScore || 0));
    const distB = Math.abs(0.5 - (b.riskScore || 0));
    return distA - distB;
  });

  const txnTypes = [...new Set(reviewAlerts.map(a => a.transaction?.type).filter(Boolean))];

  // ── Computed Stats ─────────────────────────────────────────────────────
  const stats = {
    pending:  reviewAlerts.length,
    open:     cases.filter(c => c.status === "OPEN" || c.status === "IN_PROGRESS").length,
    closed:   cases.filter(c => c.status?.startsWith("CLOSED")).length,
    aiUsed:   Object.keys(aiResults).length,
  };

  const statusColor = (s) => {
    if (s === "OPEN") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    if (s === "IN_PROGRESS") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    if (s?.startsWith("CLOSED_FRAUD")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (s?.startsWith("CLOSED")) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    return "bg-muted text-muted-foreground";
  };

  const toggleSelect = (id) => {
    setSelectedAlerts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <>
      <Header title="Investigations" subtitle="Human-in-the-loop fraud review & case management" />
      <div className="flex-1 space-y-5 p-5">

        {/* ── Stats Row ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={TriangleAlert} label="Pending Review" value={stats.pending} color="text-amber-600"
            bg="bg-amber-500/5 border-amber-200 dark:border-amber-800/50"
            subtitle={`Score ${(UNCERTAIN_MIN*100).toFixed(0)}%-${(UNCERTAIN_MAX*100).toFixed(0)}%`} />
          <StatCard icon={FileSearch} label="Open Cases" value={stats.open} color="text-blue-600"
            bg="bg-blue-500/5 border-blue-200 dark:border-blue-800/50" />
          <StatCard icon={CheckCircle2} label="Resolved" value={stats.closed} color="text-emerald-600"
            bg="bg-emerald-500/5 border-emerald-200 dark:border-emerald-800/50" />
          <StatCard icon={BrainCircuit} label="AI Analysed" value={stats.aiUsed} color="text-violet-600"
            bg="bg-violet-500/5 border-violet-200 dark:border-violet-800/50"
            subtitle="This session" />
        </div>

        {/* ── Success Banner ─────────────────────────────────────── */}
        {successMsg && (
          <div className="flex items-center gap-2 text-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-4 py-2.5 rounded-lg animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {successMsg}
          </div>
        )}

        {/* ── Main Tabs ───────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <TabsList>
              <TabsTrigger value="review" className="gap-1.5">
                <UserSearch className="h-3.5 w-3.5" /> Flagged for Review
                {stats.pending > 0 && <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px] ml-1">{stats.pending}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="cases" className="gap-1.5">
                <FileSearch className="h-3.5 w-3.5" /> Cases
                {stats.open > 0 && <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px] ml-1">{stats.open}</Badge>}
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              {lastRefresh && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {formatRelativeTime(lastRefresh)}
                </span>
              )}
              <Button size="sm" variant="ghost" className="gap-1 h-8 text-xs" onClick={() => { fetchReviewQueue(); fetchCases(); }}>
                <RefreshCw className="h-3 w-3" /> Refresh
              </Button>
              <Button size="sm" className="gap-1.5 h-8" onClick={() => { setShowCreate(true); setCreateError(""); fetchAvailableAlerts(); }}>
                <Plus className="h-3.5 w-3.5" /> New Case
              </Button>
            </div>
          </div>

          {/* ══════════════ TAB 1: Review Queue ══════════════ */}
          <TabsContent value="review" className="mt-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Transactions in the <span className="font-semibold text-amber-600 dark:text-amber-400">uncertain zone</span> ({(UNCERTAIN_MIN*100).toFixed(0)}%–{(UNCERTAIN_MAX*100).toFixed(0)}%) where AI models disagree. Human review required.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedAlerts.size > 0 && (
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={createCaseFromSelected}>
                    <Plus className="h-3 w-3" /> Case from {selectedAlerts.size} selected
                  </Button>
                )}
                {txnTypes.length > 1 && (
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-7 w-[120px] text-xs">
                      <Filter className="h-3 w-3 mr-1" />
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {txnTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {reviewLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-24" /></CardContent></Card>
              ))
            ) : filteredAlerts.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium text-base">All Clear</p>
                  <p className="text-xs mt-1 max-w-sm mx-auto">No alerts in the uncertain zone right now. High-confidence fraud is auto-flagged, clear transactions pass through.</p>
                </CardContent>
              </Card>
            ) : (
              filteredAlerts.map((alert) => {
                const score = alert.riskScore || 0;
                const txn = alert.transaction || {};
                const ai = aiResults[alert.id];
                const isAnalyzing = aiLoading === alert.id;
                const isSelected = selectedAlerts.has(alert.id);

                return (
                  <Card key={alert.id} className={`overflow-hidden transition-all hover:shadow-md ${isSelected ? "ring-2 ring-primary/40 border-primary/30" : ""}`}>
                    <CardContent className="p-0">
                      <div className="flex">
                        {/* Select checkbox area */}
                        <button
                          onClick={() => toggleSelect(alert.id)}
                          className={`w-10 shrink-0 flex items-center justify-center border-r transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-muted/50"}`}
                        >
                          <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                            {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                        </button>

                        {/* Main content */}
                        <div className="flex-1 p-4 space-y-3">
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={getSeverityVariant(alert.severity)} className="text-[10px]">{alert.severity}</Badge>
                              <Badge variant="outline" className="text-[10px]">{getAlertTypeName(alert.alertType || alert.type)}</Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">{formatRelativeTime(alert.createdAt)}</span>
                              {alert.investigation && (
                                <Badge variant="secondary" className="text-[9px] gap-0.5">
                                  <Fingerprint className="h-2.5 w-2.5" /> {alert.investigation.caseNumber}
                                </Badge>
                              )}
                            </div>
                            <ScoreGauge score={score} />
                          </div>

                          {/* Transaction details grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount</p>
                              <p className="font-mono font-semibold">{formatINR(txn.amount)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Type · Channel</p>
                              <p className="text-xs">{txn.type} · {txn.channel}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sender</p>
                              <p className="text-xs truncate">{txn.senderAccount?.accountHolder || "—"}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{txn.senderAccount?.bankName}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Receiver</p>
                              <p className="text-xs truncate">{txn.receiverAccount?.accountHolder || "—"}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{txn.receiverAccount?.bankName}</p>
                            </div>
                          </div>

                          {/* Why uncertain */}
                          <ZoneExplainer score={score} />

                          {/* Payment Remarks */}
                          {txn.description && (
                            <div className="text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                              <span className="font-semibold text-amber-700 dark:text-amber-400">Payment Remarks: </span>
                              <span className="italic text-amber-900 dark:text-amber-300">"{txn.description}"</span>
                            </div>
                          )}

                          {/* AI Result */}
                          {ai && (
                            <div className={`rounded-lg border p-3 space-y-2 ${
                              ai.verdict === "SUSPICIOUS" ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" :
                              ai.verdict === "MONITOR" ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" :
                              ai.verdict === "ERROR" || ai.verdict === "QUOTA_EXHAUSTED" || ai.verdict === "TIMEOUT" ? "bg-muted border-destructive/30" :
                              "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                            }`}>
                              <div className="flex items-center gap-2">
                                <BrainCircuit className="h-3.5 w-3.5 text-violet-500" />
                                <span className="text-xs font-bold text-violet-700 dark:text-violet-400">AI Analysis</span>
                                {ai.confidence > 0 && (
                                  <span className="text-[9px] text-muted-foreground">conf: {(ai.confidence * 100).toFixed(0)}%</span>
                                )}
                                <Badge variant="outline" className="text-[9px] ml-auto">{ai.verdict}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{ai.reasoning}</p>
                              {ai.flags?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {ai.flags.map((f, i) => (
                                    <span key={i} className="text-[9px] bg-white dark:bg-slate-800 border rounded-full px-2 py-0.5">{f}</span>
                                  ))}
                                </div>
                              )}
                              {ai.fromCache && <p className="text-[9px] text-muted-foreground italic">⚡ Cached result</p>}
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 flex-wrap pt-1">
                            <Button
                              size="sm" variant="outline"
                              className="gap-1.5 text-violet-700 border-violet-300 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:hover:bg-violet-950/30"
                              disabled={isAnalyzing}
                              onClick={() => requestAIAnalysis(alert)}
                            >
                              {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                              {isAnalyzing ? "Analyzing..." : ai ? "Re-Analyze" : "Ask AI"}
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800"
                              disabled={caseCreatingFor === alert.id}
                              onClick={() => createCaseFromAlert(alert)}
                            >
                              {caseCreatingFor === alert.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                              {caseCreatingFor === alert.id ? "Creating..." : "Open Case"}
                            </Button>
                            <div className="flex-1" />
                            <Button
                              size="sm" variant="outline"
                              className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800"
                              onClick={() => confirmResolve(alert.id, "legitimate")}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> Clear
                            </Button>
                            <Button
                              size="sm" variant="destructive" className="gap-1.5"
                              onClick={() => confirmResolve(alert.id, "fraud")}
                            >
                              <ShieldBan className="h-3.5 w-3.5" /> Confirm Fraud
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* ══════════════ TAB 2: Cases ══════════════ */}
          <TabsContent value="cases" className="mt-4 space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-14" /></CardContent></Card>
              ))
            ) : cases.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <FileSearch className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium text-base">No investigations yet</p>
                  <p className="text-xs mt-1">Create a case to group related alerts together, or click "Open Case" on any flagged alert.</p>
                </CardContent>
              </Card>
            ) : (
              cases.map((c) => (
                <Card key={c.id} className="cursor-pointer hover:border-primary/30 transition-all hover:shadow-sm" onClick={() => openDetail(c)}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                      c.status?.startsWith("CLOSED_FRAUD") ? "bg-red-100 dark:bg-red-900/30" :
                      c.status?.startsWith("CLOSED") ? "bg-emerald-100 dark:bg-emerald-900/30" :
                      "bg-blue-100 dark:bg-blue-900/30"
                    }`}>
                      {c.status?.startsWith("CLOSED_FRAUD") ? <ShieldBan className="h-5 w-5 text-red-600 dark:text-red-400" /> :
                       c.status?.startsWith("CLOSED") ? <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> :
                       <FileSearch className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{c.caseNumber}</span>
                        <Badge className={`text-[10px] ${statusColor(c.status)}`}>{c.status?.replace(/_/g, " ")}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{c.priority}</Badge>
                        {c._count?.alerts > 0 && (
                          <span className="text-[10px] text-muted-foreground">{c._count.alerts} alert(s)</span>
                        )}
                        {c._count?.notes > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <MessageSquare className="h-3 w-3" /> {c._count.notes}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-1">{c.title}</p>
                      {c.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{formatRelativeTime(c.createdAt)}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* ── Case Detail Dialog ──────────────────────────────────────── */}
        {selected && detail && (
          <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setDetail(null); }}>
            <DialogContent className="max-w-lg max-h-[85vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{detail.caseNumber}</span>
                  {detail.title}
                </DialogTitle>
                <DialogDescription>Investigation details, linked alerts, and case notes</DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 pr-4">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${statusColor(detail.status)}`}>{detail.status?.replace(/_/g, " ")}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{detail.priority}</Badge>
                    {detail.createdBy?.name && <span className="text-xs text-muted-foreground">by {detail.createdBy.name}</span>}
                    <span className="text-[10px] text-muted-foreground ml-auto">{formatRelativeTime(detail.createdAt)}</span>
                  </div>
                  {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}

                  {/* Linked Alerts */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Linked Alerts ({detail.alerts?.length || 0})</h4>
                    {detail.alerts?.length > 0 ? (
                      <div className="space-y-2">
                        {detail.alerts.map((a) => (
                          <div key={a.id} className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Badge variant={getSeverityVariant(a.severity)} className="text-[9px]">{a.severity}</Badge>
                                <span className="text-xs">{getAlertTypeName(a.alertType || a.type)}</span>
                              </div>
                              <Badge variant="outline" className="text-[9px]">{a.status}</Badge>
                            </div>
                            {a.transaction && (
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="font-mono font-semibold text-foreground">{formatINR(a.transaction.amount)}</span>
                                <span>{a.transaction.type}</span>
                                <span>{a.transaction.senderAccount?.accountHolder} → {a.transaction.receiverAccount?.accountHolder}</span>
                                <span className={`font-mono font-bold ml-auto ${getRiskColor(a.transaction.fraudScore)}`}>
                                  {formatScore(a.transaction.fraudScore)}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">No alerts linked yet.</p>
                    )}
                  </div>

                  <Separator />

                  {/* Notes */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Case Notes</h4>
                    {detail.notes?.length > 0 ? (
                      <div className="space-y-2">
                        {detail.notes.map((n) => (
                          <div key={n.id} className="text-sm border-l-2 border-primary/30 pl-3">
                            <p>{n.content}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{formatRelativeTime(n.createdAt)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No notes yet</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Input
                        placeholder="Add investigation note..."
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addNote()}
                        className="text-sm"
                      />
                      <Button size="sm" onClick={addNote} disabled={!noteText.trim()}>
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Findings */}
                  {detail.findings && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Findings</h4>
                        <p className="text-sm text-muted-foreground">{detail.findings}</p>
                      </div>
                    </>
                  )}

                  {/* Close options */}
                  {!detail.closedAt && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Close Investigation</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => closeCase("CLOSED_FRAUD")}>
                            <ShieldBan className="h-3.5 w-3.5" /> Fraud
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800" onClick={() => closeCase("CLOSED_LEGITIMATE")}>
                            <ShieldCheck className="h-3.5 w-3.5" /> Legitimate
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => closeCase("CLOSED_INCONCLUSIVE")}>
                            <Scale className="h-3.5 w-3.5" /> Inconclusive
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}

        {/* ── Create Case Dialog ──────────────────────────────────────── */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New Investigation Case</DialogTitle>
              <DialogDescription>Group related alerts into a structured investigation</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Case Title *</label>
                <Input placeholder="e.g. Suspected mule ring — Bhagalpur cluster" value={newCase.title} onChange={(e) => setNewCase({ ...newCase, title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
                <Textarea placeholder="Brief summary of the investigation scope" value={newCase.description} onChange={(e) => setNewCase({ ...newCase, description: e.target.value })} rows={2} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Priority</label>
                <Select value={newCase.priority} onValueChange={(v) => setNewCase({ ...newCase, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRITICAL">🔴 Critical</SelectItem>
                    <SelectItem value="HIGH">🟠 High</SelectItem>
                    <SelectItem value="MEDIUM">🟡 Medium</SelectItem>
                    <SelectItem value="LOW">🟢 Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Link Alerts (optional)</label>
                <ScrollArea className="max-h-32 border rounded-lg p-2">
                  <div className="space-y-1">
                    {availableAlerts.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">No unlinked alerts available</p>
                    ) : (
                      availableAlerts.slice(0, 15).map(a => {
                        const isChosen = newCase.alertIds.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            onClick={() => setNewCase(prev => ({
                              ...prev,
                              alertIds: isChosen ? prev.alertIds.filter(id => id !== a.id) : [...prev.alertIds, a.id]
                            }))}
                            className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded transition-colors ${isChosen ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <Badge variant={getSeverityVariant(a.severity)} className="text-[9px] shrink-0">{a.severity}</Badge>
                              <span className="font-mono">{formatINR(a.transaction?.amount)}</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="truncate">{a.transaction?.senderAccount?.accountHolder || "—"}</span>
                              <span className={`font-mono font-bold shrink-0 ${getRiskColor(a.riskScore)}`}>{(a.riskScore * 100).toFixed(0)}%</span>
                            </span>
                            {isChosen && <Check className="h-3 w-3 shrink-0 ml-1" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
                {newCase.alertIds.length > 0 && (
                  <p className="text-xs text-primary mt-1">{newCase.alertIds.length} alert(s) selected</p>
                )}
              </div>
              {createError && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />{createError}
                </div>
              )}
              <Button className="w-full gap-1.5" onClick={createCase} disabled={!newCase.title}>
                <Plus className="h-3.5 w-3.5" /> Create Investigation
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Resolve Confirmation Dialog ─────────────────────────────── */}
        <Dialog open={!!resolveDialog} onOpenChange={() => setResolveDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {resolveDialog?.type === "fraud" ? (
                  <><ShieldBan className="h-5 w-5 text-red-500" /> Confirm as Fraud</>
                ) : (
                  <><ShieldCheck className="h-5 w-5 text-emerald-500" /> Clear as Legitimate</>
                )}
              </DialogTitle>
              <DialogDescription>
                {resolveDialog?.type === "fraud"
                  ? "This alert will be marked as confirmed fraud. The account may be flagged for further action."
                  : "This alert will be cleared as a legitimate transaction."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Reason (optional)</label>
                <Textarea
                  placeholder={resolveDialog?.type === "fraud"
                    ? "e.g. Pattern matches known structuring scheme..."
                    : "e.g. Verified sender identity, regular business payment..."
                  }
                  value={resolveReason}
                  onChange={(e) => setResolveReason(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setResolveDialog(null)}>Cancel</Button>
                <Button
                  className={`flex-1 gap-1.5 ${resolveDialog?.type === "fraud" ? "" : "bg-emerald-600 hover:bg-emerald-700"}`}
                  variant={resolveDialog?.type === "fraud" ? "destructive" : "default"}
                  onClick={executeResolve}
                >
                  {resolveDialog?.type === "fraud" ? <ShieldBan className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Confirm
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </>
  );
}
