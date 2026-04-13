import { useEffect, useState, useCallback } from "react";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, FileSearch, MessageSquare, Check, ShieldAlert, ShieldBan, ShieldCheck,
  Eye, Sparkles, Loader2, AlertCircle, ChevronRight, UserSearch,
  TrendingUp, Clock, CheckCircle2, XCircle, Scale,
} from "lucide-react";
import { formatINR, formatRelativeTime, formatScore, getRiskColor, getRiskBarColor, formatDateTime, getSeverityVariant, getAlertTypeName } from "@/lib/formatters";
import api from "@/lib/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div className={`rounded-xl border p-4 ${bg} transition-all hover:shadow-sm`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-mono tracking-tight ${color}`}>{value}</p>
    </div>
  );
}

function MiniScoreBar({ score }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${getRiskBarColor(score)}`} style={{ width: `${score * 100}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold ${getRiskColor(score)}`}>{(score * 100).toFixed(0)}%</span>
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

  // Review queue — alerts in uncertain zone needing human decision
  const [reviewAlerts, setReviewAlerts] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [geminiLoading, setGeminiLoading] = useState(null); // alertId being analyzed
  const [geminiResults, setGeminiResults] = useState({});    // alertId → llm result

  // Available alerts for linking
  const [availableAlerts, setAvailableAlerts] = useState([]);

  // ── Data fetching ──────────────────────────────────────────────────────
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
      // Get alerts that are NEW or REVIEWING — these need human review
      const res = await api.get("/alerts?status=NEW&limit=20&sortBy=riskScore&sortOrder=desc");
      const alerts = res.data || [];
      // Focus on uncertain zone (0.3-0.8) for human review, but show all unresolved
      setReviewAlerts(alerts);
    } catch (err) { console.error(err); }
    setReviewLoading(false);
  }, []);

  const fetchAvailableAlerts = useCallback(async () => {
    try {
      const res = await api.get("/alerts?status=NEW&limit=50");
      setAvailableAlerts(res.data || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    fetchCases();
    fetchReviewQueue();
    fetchAvailableAlerts();
  }, [fetchCases, fetchReviewQueue, fetchAvailableAlerts]);

  // ── Case operations ────────────────────────────────────────────────────
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
    } catch (err) {
      setCreateError(err?.response?.data?.message || err?.message || "Failed to create");
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
    const findings = status === "CLOSED_FRAUD"
      ? "Investigation completed — fraud confirmed by investigator"
      : status === "CLOSED_LEGITIMATE"
      ? "Investigation completed — transaction deemed legitimate"
      : "Investigation closed — inconclusive evidence";
    try {
      await api.put(`/investigations/${selected.id}/close`, { findings, status });
      fetchCases();
      setSelected(null);
    } catch (err) { console.error(err); }
  };

  // ── Alert review operations ───────────────────────────────────────────
  const resolveAlert = async (alertId, resolution, status) => {
    try {
      await api.put(`/alerts/${alertId}/resolve`, { resolution, status });
      fetchReviewQueue();
      fetchAvailableAlerts();
    } catch (err) { console.error(err); }
  };

  const escalateAlert = async (alertId) => {
    try {
      await api.put(`/alerts/${alertId}/escalate`, {});
      fetchReviewQueue();
    } catch (err) { console.error(err); }
  };

  const requestGeminiAnalysis = async (alert) => {
    setGeminiLoading(alert.id);
    try {
      // Use the transaction's DB id (not transactionId string)
      const txnId = alert.transaction?.id || alert.transactionId;
      const res = await api.post(`/ml/gemini-analyse/${txnId}`, {});
      const llm = res.data?.llm || null;
      setGeminiResults(prev => ({
        ...prev,
        [alert.id]: llm || {
          verdict: "ANALYSIS_COMPLETE",
          reasoning: "AI analysis completed but returned no structured result.",
          confidence: 0.5,
          flags: [],
          model: "gemini-2.0-flash",
        },
      }));
    } catch (err) {
      setGeminiResults(prev => ({
        ...prev,
        [alert.id]: {
          verdict: "ERROR",
          reasoning: err.response?.data?.message || "Could not reach AI service. Quota may be exhausted or API key not configured.",
          confidence: 0,
          flags: [],
          model: "gemini-2.0-flash",
        },
      }));
    }
    setGeminiLoading(null);
  };

  // ── Computed stats ─────────────────────────────────────────────────────
  const stats = {
    total:    cases.length,
    open:     cases.filter(c => c.status === "OPEN" || c.status === "IN_PROGRESS").length,
    closed:   cases.filter(c => c.status?.startsWith("CLOSED")).length,
    pending:  reviewAlerts.length,
  };

  const statusColor = (s) => {
    if (s === "OPEN") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    if (s === "IN_PROGRESS") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    if (s?.startsWith("CLOSED_FRAUD")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (s?.startsWith("CLOSED")) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    return "bg-muted text-muted-foreground";
  };

  return (
    <>
      <Header title="Investigations" subtitle="Human-in-the-loop fraud review & case management" />
      <div className="flex-1 space-y-5 p-5">

        {/* ── Stats Row ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Eye} label="Pending Review" value={stats.pending} color="text-amber-600" bg="bg-amber-500/5 border-amber-200 dark:border-amber-800/50" />
          <StatCard icon={FileSearch} label="Open Cases" value={stats.open} color="text-blue-600" bg="bg-blue-500/5 border-blue-200 dark:border-blue-800/50" />
          <StatCard icon={CheckCircle2} label="Closed" value={stats.closed} color="text-emerald-600" bg="bg-emerald-500/5 border-emerald-200 dark:border-emerald-800/50" />
          <StatCard icon={ShieldAlert} label="Total Cases" value={stats.total} color="text-violet-600" bg="bg-violet-500/5 border-violet-200 dark:border-violet-800/50" />
        </div>

        {/* ── Main Tabs ───────────────────────────────────────────────── */}
        <Tabs defaultValue="review">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="review" className="gap-1.5">
                <UserSearch className="h-3.5 w-3.5" /> Flagged for Review
                {stats.pending > 0 && <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px] ml-1">{stats.pending}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="cases" className="gap-1.5">
                <FileSearch className="h-3.5 w-3.5" /> Cases
              </TabsTrigger>
            </TabsList>
            <Button size="sm" className="gap-1.5" onClick={() => { setShowCreate(true); setCreateError(""); fetchAvailableAlerts(); }}>
              <Plus className="h-3.5 w-3.5" /> New Case
            </Button>
          </div>

          {/* ══════════════ TAB 1: Review Queue ══════════════ */}
          <TabsContent value="review" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Alerts flagged by the ML engine that need human review. Use Gemini AI to get an independent analysis.
            </p>

            {reviewLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-20" /></CardContent></Card>
              ))
            ) : reviewAlerts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ShieldCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="font-medium">All clear</p>
                  <p className="text-xs mt-1">No pending alerts require human review</p>
                </CardContent>
              </Card>
            ) : (
              reviewAlerts.map((alert) => {
                const score = alert.riskScore || 0;
                const txn = alert.transaction || {};
                const gemini = geminiResults[alert.id];
                const isAnalyzing = geminiLoading === alert.id;

                return (
                  <Card key={alert.id} className="overflow-hidden transition-all hover:shadow-sm">
                    <CardContent className="p-0">
                      <div className="flex flex-col lg:flex-row">
                        {/* Left: Alert Info */}
                        <div className="flex-1 p-4 space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={getSeverityVariant(alert.severity)} className="text-[10px]">{alert.severity}</Badge>
                            <Badge variant="outline" className="text-[10px]">{getAlertTypeName(alert.alertType || alert.type)}</Badge>
                            <span className="text-[10px] text-muted-foreground font-mono">{formatRelativeTime(alert.createdAt)}</span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount</p>
                              <p className="font-mono font-semibold">{formatINR(txn.amount)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Score</p>
                              <MiniScoreBar score={score} />
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Type</p>
                              <p className="text-xs">{txn.type} · {formatDateTime(txn.timestamp)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Parties</p>
                              <p className="text-xs truncate">{txn.senderAccount?.accountHolder || "—"} → {txn.receiverAccount?.accountHolder || "—"}</p>
                            </div>
                          </div>

                          {/* Transaction Remarks */}
                          {txn.description && (
                            <div className="text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                              <span className="font-semibold text-amber-700 dark:text-amber-400">Payment Remarks: </span>
                              <span className="italic text-amber-900 dark:text-amber-300">"{txn.description}"</span>
                            </div>
                          )}

                          {/* Gemini Result */}
                          {gemini && (
                            <div className={`rounded-lg border p-3 space-y-2 ${
                              gemini.verdict === "SUSPICIOUS" ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" :
                              gemini.verdict === "MONITOR" ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" :
                              gemini.verdict === "ERROR" ? "bg-muted border-destructive/30" :
                              "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                            }`}>
                              <div className="flex items-center gap-2">
                                <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                                <span className="text-xs font-bold text-violet-700 dark:text-violet-400">AI Analysis</span>
                                <Badge variant="outline" className="text-[9px] ml-auto">{gemini.verdict}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{gemini.reasoning}</p>
                              {gemini.flags?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {gemini.flags.map((f, i) => (
                                    <span key={i} className="text-[9px] bg-white dark:bg-slate-800 border rounded-full px-2 py-0.5">{f}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 flex-wrap pt-1">
                            <Button
                              size="sm" variant="outline" className="gap-1.5 text-violet-700 border-violet-300 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:hover:bg-violet-950/30"
                              disabled={isAnalyzing}
                              onClick={() => requestGeminiAnalysis(alert)}
                            >
                              {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                              {isAnalyzing ? "Analyzing..." : gemini ? "Re-Analyze" : "Ask Gemini AI"}
                            </Button>
                            <Button
                              size="sm" variant="outline" className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800"
                              onClick={() => escalateAlert(alert.id)}
                            >
                              <TrendingUp className="h-3.5 w-3.5" /> Escalate
                            </Button>
                            <div className="flex-1" />
                            <Button
                              size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800"
                              onClick={() => resolveAlert(alert.id, "Cleared by investigator — legitimate transaction", "RESOLVED_LEGITIMATE")}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> Clear
                            </Button>
                            <Button
                              size="sm" variant="destructive" className="gap-1.5"
                              onClick={() => resolveAlert(alert.id, "Confirmed fraud by investigator", "RESOLVED_FRAUD")}
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
                <CardContent className="py-12 text-center text-muted-foreground">
                  <FileSearch className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="font-medium">No investigations yet</p>
                  <p className="text-xs mt-1">Create a case to group related alerts together</p>
                </CardContent>
              </Card>
            ) : (
              cases.map((c) => (
                <Card key={c.id} className="cursor-pointer hover:border-primary/30 transition-all hover:shadow-sm" onClick={() => openDetail(c)}>
                  <CardContent className="flex items-center gap-4 p-4">
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
          <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
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
                  </div>
                  {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}

                  {/* Linked Alerts */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Linked Alerts ({detail.alerts?.length || 0})</h4>
                    {detail.alerts?.length > 0 ? (
                      <div className="space-y-2">
                        {detail.alerts.map((a) => (
                          <div key={a.id} className="rounded-lg border bg-muted/30 p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Badge variant={getSeverityVariant(a.severity)} className="text-[9px]">{a.severity}</Badge>
                                <span className="text-xs">{getAlertTypeName(a.alertType || a.type)}</span>
                              </div>
                              <Badge variant="outline" className="text-[9px]">{a.status}</Badge>
                            </div>
                            {a.transaction && (
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="font-mono">{formatINR(a.transaction.amount)}</span>
                                <span>{a.transaction.type}</span>
                                <span className={`font-mono font-bold ${getRiskColor(a.transaction.fraudScore)}`}>
                                  {formatScore(a.transaction.fraudScore)}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">No alerts linked. Link alerts when creating or editing a case.</p>
                    )}
                  </div>

                  <Separator />

                  {/* Notes */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Case Notes</h4>
                    {detail.notes?.length > 0 ? (
                      detail.notes.map((n) => (
                        <div key={n.id} className="text-sm border-l-2 border-primary/30 pl-3 mb-2">
                          <p>{n.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{formatRelativeTime(n.createdAt)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No notes yet</p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Input placeholder="Add investigation note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="text-sm" />
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
                <Input placeholder="Brief summary of the investigation scope" value={newCase.description} onChange={(e) => setNewCase({ ...newCase, description: e.target.value })} />
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
                <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {availableAlerts.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">No unlinked alerts available</p>
                  ) : (
                    availableAlerts.slice(0, 10).map(a => {
                      const isSelected = newCase.alertIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          onClick={() => setNewCase(prev => ({
                            ...prev,
                            alertIds: isSelected ? prev.alertIds.filter(id => id !== a.id) : [...prev.alertIds, a.id]
                          }))}
                          className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded transition-colors ${
                            isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <Badge variant={getSeverityVariant(a.severity)} className="text-[9px]">{a.severity}</Badge>
                            {formatINR(a.transaction?.amount)} — {a.transaction?.type}
                          </span>
                          {isSelected && <Check className="h-3 w-3" />}
                        </button>
                      );
                    })
                  )}
                </div>
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

      </div>
    </>
  );
}
