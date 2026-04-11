import { useEffect, useState, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bar, BarChart, XAxis, YAxis, Tooltip as ReTooltip, Cell } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { CheckCircle, XCircle, Brain, Activity } from "lucide-react";
import api from "@/lib/api";

const RULE_WEIGHTS = [
  { name: "Amount × Channel", weight: 0.25 },
  { name: "Mule Score", weight: 0.20 },
  { name: "KYC Risk", weight: 0.15 },
  { name: "Account Age", weight: 0.15 },
  { name: "Structuring", weight: 0.10 },
  { name: "Cross-Bank", weight: 0.05 },
  { name: "Unusual Hour", weight: 0.05 },
  { name: "VPA Age", weight: 0.05 },
  { name: "PMLA ₹50K", weight: 0.10 },
  { name: "PMLA ₹10L", weight: 0.15 },
  { name: "KYC Flagged", weight: 0.10 },
  { name: "Frozen Recv", weight: 0.05 },
];

const chartConfig = { weight: { label: "Impact Weight" } };

/** Human-friendly feature name */
function featureLabel(key) {
  const map = {
    type_UPI: "UPI Transaction", type_DEPOSIT: "Deposit Type", type_NEFT: "NEFT Transfer",
    type_ATM: "ATM Withdrawal", type_IMPS: "IMPS Transfer", is_cross_bank_upi: "Cross-Bank UPI",
    upi_new_recv_risk: "New UPI Receiver Risk", receiver_is_pure_receiver: "Terminal Receiver",
    is_night: "Night Hours (1-5 AM)", amount_log: "Transaction Amount",
    hour_of_day: "Hour of Day", sender_total_unique_receivers: "Unique Receivers",
    receiver_unique_senders_total: "Unique Senders", receiver_total_recv_count: "Receiver Txn Count",
    sender_avg_amount: "Sender Avg Amount", receiver_mule_score: "Receiver Mule Score",
    day_of_week: "Day of Week", amount_bucket: "Amount Tier", near_100k_threshold: "Near ₹1L",
    near_50k_threshold: "Near ₹50K", is_cross_branch: "Cross-Branch", near_1m_threshold: "Near ₹10L",
    channel_internet: "Internet Banking", is_weekend: "Weekend", channel_mobile: "Mobile Banking",
    sender_mule_score: "Sender Mule Score", is_round_10k: "Round ₹10K", sender_passthrough_ratio: "Passthrough Ratio",
  };
  return map[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function ModelPage() {
  const [modelInfo, setModelInfo] = useState(null);
  const [txnStats, setTxnStats] = useState(null);

  useEffect(() => {
    api.get("/ml/model-info").then((r) => setModelInfo(r.data)).catch(() => {});
    api.get("/transactions/stats").then((r) => setTxnStats(r.data)).catch(() => {});
  }, []);

  const activeModel = modelInfo?.activeModel;
  const isRuleBased = activeModel?.modelName?.includes("rule-based");
  const metrics = activeModel?.metrics || {};

  // Build feature importance chart data from real model
  const featureData = useMemo(() => {
    const fi = activeModel?.feature_importance;
    if (!fi || typeof fi !== "object") return null;
    return Object.entries(fi)
      .filter(([, v]) => v > 0.001)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([k, v]) => ({ name: featureLabel(k), weight: parseFloat(v.toFixed(4)) }));
  }, [activeModel]);

  return (
    <>
      <Header title="ML Model Performance" subtitle="Scoring pipeline status & metrics" />
      <div className="flex-1 space-y-4 p-5">
        {/* Status cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" /> Active Model
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-mono-data font-medium">{activeModel?.modelName || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <Badge variant="secondary">{isRuleBased ? "Rule-Based Heuristic" : activeModel?.type || "XGBoost ML"}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono-data">{activeModel?.version || "v1"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle className="h-3.5 w-3.5" /> Active
                </span>
              </div>
              {!isRuleBased && activeModel?.description && (
                <div className="text-xs text-muted-foreground pt-1 border-t">
                  {activeModel.description}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Service Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">FastAPI ML Service</span>
                <span className="flex items-center gap-1">
                  {modelInfo?.fastApiAvailable ? (
                    <><CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Online</>
                  ) : (
                    <><XCircle className="h-3.5 w-3.5 text-destructive" /> Offline</>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fallback Engine</span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle className="h-3.5 w-3.5" /> Active
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Features</span>
                <span className="font-mono-data">{activeModel?.rulesCount || 12} {isRuleBased ? "rules" : "features"}</span>
              </div>
              {!isRuleBased && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AUC-ROC</span>
                  <span className="font-mono-data font-semibold text-primary">{metrics?.auc_roc || "—"}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Feature importance / Rule Weights */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {isRuleBased ? "Rule Impact Weights" : "XGBoost Feature Importance (Top 15)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <ChartContainer config={chartConfig} className="h-[360px] w-full">
                <BarChart
                  data={featureData || [...RULE_WEIGHTS].sort((a, b) => b.weight - a.weight)}
                  layout="vertical"
                  margin={{ top: 5, right: 15, bottom: 5, left: 120 }}
                >
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={115} />
                  <ReTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="weight" radius={[0, 4, 4, 0]}>
                    {(featureData || [...RULE_WEIGHTS].sort((a, b) => b.weight - a.weight)).map((_, i) => (
                      <Cell key={i} fill={i < 3 ? "var(--destructive)" : i < 7 ? "var(--warning)" : "var(--primary)"} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Detection Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Detection Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="rounded-lg bg-primary/10 p-4">
                  <p className="font-mono-data text-2xl font-bold text-primary">{txnStats?.total || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Scored</p>
                </div>
                <div className="rounded-lg bg-destructive/10 p-4">
                  <p className="font-mono-data text-2xl font-bold text-destructive">{txnStats?.fraudCount || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Flagged Fraud</p>
                </div>
                <div className="rounded-lg bg-warning/10 p-4">
                  <p className="font-mono-data text-2xl font-bold text-amber-600">
                    {txnStats?.fraudRate || "0%"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Detection Rate</p>
                </div>
                <div className="rounded-lg bg-blue-500/10 p-4">
                  <p className="font-mono-data text-2xl font-bold text-blue-600">
                    {txnStats?.avgFraudScore ? parseFloat(txnStats.avgFraudScore).toFixed(2) : "0.00"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Avg Fraud Score</p>
                </div>
              </div>

              {!isRuleBased && (
                <div className="rounded-lg border border-primary/20 p-3 text-xs">
                  <p className="font-medium text-foreground mb-2">XGBoost Metrics</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">AUC-ROC:</span>
                      <span className="font-mono-data font-semibold">{metrics?.auc_roc || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">AUC-PR:</span>
                      <span className="font-mono-data font-semibold">{metrics?.auc_pr || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Precision:</span>
                      <span className="font-mono-data font-semibold">{metrics?.precision || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Recall:</span>
                      <span className="font-mono-data font-semibold">{metrics?.recall || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">F1 Score:</span>
                      <span className="font-mono-data font-semibold">{metrics?.f1 || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Threshold:</span>
                      <span className="font-mono-data font-semibold">0.70</span>
                    </div>
                  </div>
                </div>
              )}

              {isRuleBased && (
                <div className="rounded-lg border border-primary/20 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">When FastAPI ML Service is Connected</p>
                  <p>This page will automatically switch to showing XGBoost metrics: AUC-PR, Precision, Recall, F1 Score, and Confusion Matrix.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
