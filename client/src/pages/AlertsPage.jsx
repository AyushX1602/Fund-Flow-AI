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
      api.post(`/ml/explain/${alert.transactionId}`, {}).then((r) => setExplanation(r.data)).catch(() => {});
    }
  }, [alert?.transactionId]);

  if (!alert) return null;

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

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="font-mono-data font-semibold">{formatINR(alert.transaction?.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fraud Score</p>
                <p className={`font-mono-data font-semibold ${getRiskColor(alert.fraudScore)}`}>
                  {formatScore(alert.fraudScore)}
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

            <Separator />

            {/* SHAP explanation */}
            {explanation?.reasons && (
              <div>
                <h4 className="text-sm font-medium mb-2">ML Explanation</h4>
                <div className="space-y-2">
                  {explanation.reasons.map((r, i) => {
                    const maxImpact = Math.max(...explanation.reasons.map((r) => r.impact || 0), 0.3);
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
          <div className="grid grid-cols-4 gap-3">
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
        <Tabs value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}>
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.label} value={tab.value || "all"}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

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
                <CardContent className="flex items-center gap-4 p-4">
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
                      {alert.description || `Fraud score: ${formatScore(alert.fraudScore)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-mono-data text-sm font-semibold ${getRiskColor(alert.fraudScore)}`}>
                      {formatScore(alert.fraudScore)}
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
