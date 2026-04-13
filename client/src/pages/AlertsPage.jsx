import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronsUp, UserCheck, Eye } from "lucide-react";
import useAlertStore from "@/stores/alertStore";
import { formatINR, formatRelativeTime, formatScore, getRiskColor, getSeverityVariant, getAlertTypeName } from "@/lib/formatters";
import { getShapLabel, getImpactColor } from "@/lib/shapLabels";
import api from "@/lib/api";

const STATUS_TABS = [
  { value: null, label: "All" },
  { value: "NEW", label: "New" },
  { value: "REVIEWING", label: "Reviewing" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "RESOLVED_FRAUD", label: "Resolved" },
];

function AlertDetail({ alert, onClose }) {
  const { escalateAlert, resolveAlert } = useAlertStore();
  const [explanation, setExplanation] = useState(null);

  useEffect(() => {
    if (alert?.transactionId) {
      api.post(`/ml/explain/${alert.transactionId}`, {})
        .then((r) => {
          const exp = r.data?.explanation || r.data;
          setExplanation(exp);
        })
        .catch(() => {});
    }
  }, [alert?.transactionId]);

  if (!alert) return null;

  // Pull both scores from the enriched mlReasons object
  const mlReasons     = alert.mlReasons   || {};
  const mlScore       = mlReasons.mlScore  ?? alert.transaction?.fraudScore ?? null;
  const composite     = mlReasons.compositeScore ?? null;
  const layers        = mlReasons.layers   ?? null;
  const dominantLayer = mlReasons.dominantLayer ?? null;
  const triggeredBy   = mlReasons.triggeredBy ?? null;
  const effectiveScore = alert.riskScore ?? mlScore;
  const llm           = mlReasons.llm ?? null;  // Gemini Brain 3 output

  const reasons = explanation?.reasons
    || explanation?.explanation?.reasons
    || mlReasons.reasons
    || null;

  return (
    <Dialog open={!!alert} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant={getSeverityVariant(alert.severity)}>{alert.severity}</Badge>
            {getAlertTypeName(alert.type)}
          </DialogTitle>
          <DialogDescription>Alert details, ML explanation, and actions</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            <p className="text-sm text-muted-foreground">{alert.description}</p>

            {/* ── Score grid ─────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="font-mono-data font-semibold">{formatINR(alert.transaction?.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Effective Score</p>
                <p className={`font-mono-data font-bold text-base ${getRiskColor(effectiveScore)}`}>
                  {effectiveScore != null ? formatScore(effectiveScore) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="outline">{alert.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p>{formatRelativeTime(alert.createdAt)}</p>
              </div>
            </div>

            {/* ── Dual brain scores ──────────────────── */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Intelligence Sources</p>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />
                  🤖 ML Model (XGBoost)
                </span>
                <span className={`font-mono-data font-bold ${getRiskColor(mlScore)}`}>
                  {mlScore != null ? formatScore(mlScore) : "—"}
                  {triggeredBy === "ml-model" && <span className="ml-1 text-[9px] bg-violet-100 text-violet-700 px-1 rounded">TRIGGERED</span>}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  🛡️ 6-Layer Engine {dominantLayer && <span className="text-muted-foreground">· {dominantLayer}</span>}
                </span>
                <span className={`font-mono-data font-bold ${getRiskColor(composite)}`}>
                  {composite != null ? formatScore(composite) : "—"}
                  {triggeredBy && triggeredBy !== "ml-model" && <span className="ml-1 text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded">TRIGGERED</span>}
                </span>
              </div>
              {/* 6-layer bar breakdown */}
              {layers && (
                <div className="pt-1 space-y-1">
                  {Object.entries(layers).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-20 text-[10px] text-muted-foreground capitalize shrink-0">{key}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-border">
                        <div
                          className={`h-full rounded-full transition-all ${val >= 0.7 ? 'bg-red-500' : val >= 0.4 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${val * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono-data text-muted-foreground w-8 text-right">{(val).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* SHAP explanation */}
            {reasons && reasons.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">ML Explanation</h4>
                <div className="space-y-2">
                  {reasons.map((r, i) => {
                    const maxImpact = Math.max(...reasons.map((r) => r.impact || 0), 0.3);
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground truncate">{getShapLabel(r.feature || r.reason)}</span>
                          <span className="font-mono-data font-medium">+{(r.impact || 0).toFixed(2)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${getImpactColor(r.impact)}`}
                            style={{ width: `${((r.impact || 0) / maxImpact) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Gemini LLM Panel ──────────────────────────── */}
            {llm ? (
              /* Full panel: LLM analysis is present */
              <div className="rounded-lg border bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                    ✨ Gemini AI Analysis
                    {llm.fromCache && <span className="text-[9px] bg-violet-100 text-violet-600 px-1 rounded">cached</span>}
                    <span className="text-[9px] bg-violet-100 text-violet-600 px-1 rounded">{llm.model || "gemini-2.0-flash"}</span>
                  </p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    llm.verdict === 'SUSPICIOUS' ? 'bg-red-100 text-red-700' :
                    llm.verdict === 'MONITOR'    ? 'bg-amber-100 text-amber-700' :
                                                   'bg-emerald-100 text-emerald-700'
                  }`}>
                    {llm.verdict} · {(llm.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{llm.reasoning}</p>
                {llm.flags && llm.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {llm.flags.map((f, i) => (
                      <span key={i} className="text-[10px] bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : effectiveScore >= 0.35 && effectiveScore <= 0.75 ? (
              /* Placeholder: score is uncertain zone but LLM quota exhausted or pending */
              <div className="rounded-lg border border-dashed border-violet-300 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">✨</span>
                  <div>
                    <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                      Gemini AI Analysis — Queued
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      This is an uncertain-zone transaction (score {(effectiveScore * 100).toFixed(0)}%) eligible for LLM review.
                      Analysis runs after API quota resets or on next uncertain transaction within rate limit.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <Separator />

            {/* Action buttons */}
            <div className="flex gap-2">
              {alert.status !== "ESCALATED" && alert.status !== "RESOLVED_FRAUD" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => { escalateAlert(alert.id); onClose(); }}
                >
                  <ChevronsUp className="h-3.5 w-3.5" /> Escalate
                </Button>
              )}
              {!alert.status?.startsWith("RESOLVED") && (
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1.5"
                  onClick={() => { resolveAlert(alert.id, "Confirmed fraud - resolved during investigation"); onClose(); }}
                >
                  <Check className="h-3.5 w-3.5" /> Resolve as Fraud
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function AlertsPage() {
  const { alerts, stats, loading, fetchAlerts, fetchStats, setStatusFilter, statusFilter } = useAlertStore();
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchAlerts();
    fetchStats();
  }, [fetchAlerts, fetchStats]);

  return (
    <>
      <Header title="Alerts Center" subtitle={`${stats?.total || 0} total alerts`} />
      <div className="flex-1 space-y-4 p-5">
        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "New", value: stats.byStatus?.NEW || 0, color: "text-blue-600" },
              { label: "Reviewing", value: stats.byStatus?.REVIEWING || 0, color: "text-amber-600" },
              { label: "Escalated", value: stats.byStatus?.ESCALATED || 0, color: "text-orange-600" },
              { label: "Resolved", value: (stats.byStatus?.RESOLVED_FRAUD || 0) + (stats.byStatus?.RESOLVED_FALSE_POSITIVE || 0), color: "text-emerald-600" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="flex items-center justify-between p-4">
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <span className={`font-mono-data text-xl font-bold ${s.color}`}>{s.value}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="w-full overflow-x-auto pb-1 mb-2">
          <Tabs value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}>
            <TabsList className="w-max md:w-auto flex-nowrap">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.label} value={tab.value || "all"}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Alert List */}
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4"><Skeleton className="h-14" /></CardContent>
              </Card>
            ))
          ) : alerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No alerts match your filter
              </CardContent>
            </Card>
          ) : (
            alerts.map((alert) => (
              <Card
                key={alert.id}
                className="cursor-pointer transition-colors hover:border-primary/30"
                onClick={() => setSelected(alert)}
              >
                <CardContent className="flex items-center gap-4 p-4 min-w-0 text-left">
                  <Badge variant={getSeverityVariant(alert.severity)} className="shrink-0">
                    {alert.severity}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{getAlertTypeName(alert.type)}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="font-mono-data text-sm">{formatINR(alert.transaction?.amount)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {alert.description || `Fraud score: ${formatScore(alert.fraudScore ?? alert.transaction?.fraudScore)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-mono-data text-sm font-semibold ${getRiskColor(alert.fraudScore ?? alert.transaction?.fraudScore)}`}>
                      {formatScore(alert.fraudScore ?? alert.transaction?.fraudScore)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{alert.status}</Badge>
                    <span className="text-[10px] text-muted-foreground">{formatRelativeTime(alert.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <AlertDetail alert={selected} onClose={() => setSelected(null)} />
      </div>
    </>
  );
}
