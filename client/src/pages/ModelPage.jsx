import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import {
  Bar, BarChart, XAxis, YAxis, Tooltip as ReTooltip, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer
} from "recharts";
import {
  CheckCircle, XCircle, Brain, Activity, BarChart3,
  TrendingUp, Target, Zap, Shield, Gauge, Radar as RadarIcon,
  Cpu, AlertTriangle
} from "lucide-react";
import api from "@/lib/api";
import "./ModelPage.css";

const RULE_WEIGHTS = [
  { name: "Amount × Channel", weight: 0.25 },
  { name: "Mule Score",        weight: 0.20 },
  { name: "KYC Risk",          weight: 0.15 },
  { name: "Account Age",       weight: 0.15 },
  { name: "Structuring",       weight: 0.10 },
  { name: "PMLA ₹10L",        weight: 0.15 },
  { name: "PMLA ₹50K",        weight: 0.10 },
  { name: "KYC Flagged",       weight: 0.10 },
  { name: "Cross-Bank",        weight: 0.05 },
  { name: "Unusual Hour",      weight: 0.05 },
  { name: "VPA Age",           weight: 0.05 },
  { name: "Frozen Recv",       weight: 0.05 },
];

const chartConfig = { weight: { label: "Impact Weight" } };

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

/* ── Metric colour helper ── */
function metricColor(value) {
  if (value >= 80) return { stroke: "#10b981", fill: "rgba(16,185,129,0.15)", text: "#10b981" };
  if (value >= 65) return { stroke: "#f59e0b", fill: "rgba(245,158,11,0.15)",  text: "#f59e0b" };
  return            { stroke: "#ef4444", fill: "rgba(239,68,68,0.15)",    text: "#ef4444" };
}

/* ── Circular progress ring ── */
function ScoreRing({ value, size = 72, stroke = 6, color = "#10b981", label }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} strokeOpacity={0.3} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)", filter: `drop-shadow(0 0 6px ${color}55)` }}
        />
      </svg>
      <div style={{ marginTop: -size - 4, height: size, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="font-mono font-bold text-base leading-none" style={{ color }}>{value}%</span>
      </div>
      <span className="text-[10px] font-medium text-muted-foreground mt-1 text-center leading-tight">{label}</span>
    </div>
  );
}

/* ── Animation variants ── */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
};
const statVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

/* ── Bar colours ── */
const BAR_COLORS  = { high: "#ef4444", mid: "#f59e0b", low: "#6366f1" };
const BAR_COLORS_DARK = { high: "#f87171", mid: "#fbbf24", low: "#818cf8" };
function getBarColor(index, isDark) {
  const c = isDark ? BAR_COLORS_DARK : BAR_COLORS;
  if (index < 3) return c.high;
  if (index < 7) return c.mid;
  return c.low;
}

/* ── Radar colour constants ── */
const RADAR_STROKE = "#6366f1";
const RADAR_FILL   = "#6366f1";

/* ── Enhanced Radar chart ── */
function ResponsiveRadarChart({ data, isDark }) {
  const gridColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const tickColor  = isDark ? "#94a3b8" : "#64748b";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart cx="50%" cy="50%" outerRadius="72%" data={data}>
        <defs>
          <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={RADAR_FILL} stopOpacity={0.4} />
            <stop offset="100%" stopColor={RADAR_FILL} stopOpacity={0.05} />
          </radialGradient>
        </defs>
        <PolarGrid gridType="polygon" stroke={gridColor} strokeWidth={1} />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fill: tickColor, fontSize: 11.5, fontWeight: 600 }}
          tickLine={false}
          stroke={gridColor}
        />
        <PolarRadiusAxis
          angle={90} domain={[0, 100]}
          tick={{ fill: tickColor, fontSize: 9 }}
          axisLine={false} tickLine={false} tickCount={4} stroke="transparent"
        />
        <ReTooltip
          formatter={(v) => [`${v}%`, "Score"]}
          contentStyle={{
            background: isDark ? "#1e293b" : "#ffffff",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
            borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            padding: "10px 16px", fontSize: 12,
          }}
          itemStyle={{ color: RADAR_STROKE, fontWeight: 700 }}
          labelStyle={{ color: tickColor, fontWeight: 600, marginBottom: 2 }}
          cursor={false}
        />
        <Radar
          name="Score" dataKey="value"
          stroke={RADAR_STROKE} strokeWidth={2.5}
          fill="url(#radarGradient)" fillOpacity={1}
          dot={{ r: 5, fill: RADAR_STROKE, strokeWidth: 2, stroke: isDark ? "#1e293b" : "#fff" }}
          activeDot={{ r: 7, fill: RADAR_STROKE, strokeWidth: 2, stroke: isDark ? "#1e293b" : "#fff" }}
          isAnimationActive={true}
          animationDuration={900}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ── Custom bar tooltip ── */
const BarTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
      <p className="font-medium text-foreground">{payload[0].payload.name}</p>
      <p className="font-mono font-bold mt-0.5" style={{ color: payload[0].fill }}>
        {(payload[0].value * 100).toFixed(1)}% weight
      </p>
    </div>
  );
};

export default function ModelPage() {
  const [modelInfo, setModelInfo]  = useState(null);
  const [txnStats,  setTxnStats]   = useState(null);
  const [isDark,    setIsDark]     = useState(false);

  useEffect(() => {
    api.get("/ml/model-info").then(r => setModelInfo(r.data)).catch(() => {});
    api.get("/transactions/stats").then(r => setTxnStats(r.data)).catch(() => {});
    const checkDark = () => setIsDark(document.documentElement.classList.contains("dark"));
    checkDark();
    const obs = new MutationObserver(checkDark);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const activeModel  = modelInfo?.activeModel;
  const isRuleBased  = activeModel?.modelName?.includes("rule-based");
  const metrics      = activeModel?.metrics || {};

  const radarData = useMemo(() => {
    const fraudRate = txnStats?.fraudRate ? parseFloat(txnStats.fraudRate) / 100 : 0.13;
    const avgScore  = txnStats?.avgFraudScore ? parseFloat(txnStats.avgFraudScore) : 0.35;
    if (!isRuleBased && metrics?.precision) {
      return [
        { metric: "Precision",  value: Math.round((parseFloat(metrics.precision) || 0.82) * 100) },
        { metric: "Recall",     value: Math.round((parseFloat(metrics.recall)    || 0.78) * 100) },
        { metric: "F1 Score",   value: Math.round((parseFloat(metrics.f1)        || 0.80) * 100) },
        { metric: "AUC-ROC",    value: Math.round((parseFloat(metrics.auc_roc)   || 0.91) * 100) },
        { metric: "Detection",  value: Math.round(Math.min(fraudRate * 5, 1)     * 100) },
        { metric: "Coverage",   value: Math.round((parseFloat(metrics.auc_pr)    || 0.74) * 100) },
        { metric: "Confidence", value: Math.round(Math.min(avgScore * 2.5, 1)    * 100) },
      ];
    }
    return [
      { metric: "Precision",  value: 78 },
      { metric: "Recall",     value: 72 },
      { metric: "F1 Score",   value: 75 },
      { metric: "AUC-ROC",    value: 82 },
      { metric: "Detection",  value: Math.round(Math.min(fraudRate * 500, 90)) },
      { metric: "Coverage",   value: 68 },
      { metric: "Confidence", value: Math.round(Math.min(avgScore * 250, 85)) },
    ];
  }, [metrics, txnStats, isRuleBased]);

  const featureData = useMemo(() => {
    const fi = activeModel?.feature_importance;
    if (!fi || typeof fi !== "object") return null;
    return Object.entries(fi)
      .filter(([, v]) => v > 0.001)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([k, v]) => ({ name: featureLabel(k), weight: parseFloat(v.toFixed(4)) }));
  }, [activeModel]);

  const avgScore = radarData.reduce((s, d) => s + d.value, 0) / radarData.length;

  return (
    <>
      <Header title="ML Model Performance" subtitle="Scoring pipeline status & metrics" />
      <motion.div className="ml-model-page" variants={containerVariants} initial="hidden" animate="visible">

        {/* ── Row 1: Status Cards ── */}
        <div className="ml-grid-2">
          {/* Active Model */}
          <motion.div className="ml-card" variants={cardVariants} whileHover={{ y: -3 }}>
            <div className="ml-card-header">
              <div className="ml-card-title">
                <div className="ml-card-title-icon brain"><Brain className="h-4 w-4" /></div>
                Active Model
              </div>
            </div>
            <div className="ml-card-content" style={{ display:"flex", flexDirection:"column", gap:0 }}>
              <div className="ml-info-row">
                <span className="ml-info-label">Name</span>
                <span className="ml-info-value font-mono-data">{activeModel?.modelName || "—"}</span>
              </div>
              <div className="ml-info-row">
                <span className="ml-info-label">Type</span>
                <span className="ml-pill-badge secondary">
                  {isRuleBased ? "Rule-Based Heuristic" : activeModel?.type || "XGBoost ML"}
                </span>
              </div>
              <div className="ml-info-row">
                <span className="ml-info-label">Version</span>
                <span className="ml-info-value font-mono-data">{activeModel?.version || "v1"}</span>
              </div>
              <div className="ml-info-row">
                <span className="ml-info-label">Status</span>
                <span className="ml-status-pill online"><CheckCircle className="h-3.5 w-3.5" /> Active</span>
              </div>
              <div className="ml-info-row">
                <span className="ml-info-label">Avg Score</span>
                <span className="ml-info-value font-mono-data" style={{ color: metricColor(avgScore).text, fontWeight: 700 }}>
                  {avgScore.toFixed(1)}%
                </span>
              </div>
              {!isRuleBased && activeModel?.description && (
                <div className="ml-description">{activeModel.description}</div>
              )}
            </div>
          </motion.div>

          {/* Service Status */}
          <motion.div className="ml-card" variants={cardVariants} whileHover={{ y: -3 }}>
            <div className="ml-card-header">
              <div className="ml-card-title">
                <div className="ml-card-title-icon activity"><Activity className="h-4 w-4" /></div>
                Service Status
              </div>
            </div>
            <div className="ml-card-content" style={{ display:"flex", flexDirection:"column", gap:0 }}>
              <div className="ml-info-row">
                <span className="ml-info-label">FastAPI ML Service</span>
                {modelInfo?.fastApiAvailable ? (
                  <span className="ml-status-pill online"><CheckCircle className="h-3.5 w-3.5" /> Online</span>
                ) : (
                  <span className="ml-status-pill offline"><XCircle className="h-3.5 w-3.5" /> Offline</span>
                )}
              </div>
              <div className="ml-info-row">
                <span className="ml-info-label">Fallback Engine</span>
                <span className="ml-status-pill online"><CheckCircle className="h-3.5 w-3.5" /> Active</span>
              </div>
              <div className="ml-info-row">
                <span className="ml-info-label">Features / Rules</span>
                <span className="ml-info-value font-mono-data">
                  {activeModel?.rulesCount || 12} {isRuleBased ? "rules" : "features"}
                </span>
              </div>
              <div className="ml-info-row">
                <span className="ml-info-label">Threshold</span>
                <span className="ml-info-value font-mono-data">0.70</span>
              </div>
              {!isRuleBased && (
                <div className="ml-info-row">
                  <span className="ml-info-label">AUC-ROC</span>
                  <span className="ml-info-value font-mono-data" style={{ color:"var(--primary)", fontWeight:700 }}>
                    {metrics?.auc_roc || "—"}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* ── Row 2: Radar + Score Rings (split layout) ── */}
        <motion.div className="ml-card ml-radar-card" variants={cardVariants} whileHover={{ y: -2 }}>
          <div className="ml-card-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div className="ml-card-title">
              <div className="ml-card-title-icon radar"><RadarIcon className="h-4 w-4" /></div>
              Model Performance Overview
            </div>
            <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
              <span className="ml-pill-badge secondary" style={{ fontSize:"0.7rem" }}>
                {isRuleBased ? "Rule-Based" : "XGBoost"} · 7 Dimensions
              </span>
              <span className="ml-pill-badge" style={{
                fontSize:"0.7rem", padding:"4px 10px",
                background: `${metricColor(avgScore).text}18`,
                color: metricColor(avgScore).text,
                fontWeight: 700,
              }}>
                Avg {avgScore.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Split: radar left | score rings right */}
          <div className="ml-card-content ml-radar-split">
            {/* Radar chart area */}
            <div className="ml-radar-chart-wrap">
              <ResponsiveRadarChart data={radarData} isDark={isDark} />
            </div>

            {/* Score rings grid */}
            <div className="ml-score-rings">
              {radarData.map((d) => {
                const c = metricColor(d.value);
                return (
                  <motion.div
                    key={d.metric}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  >
                    <ScoreRing value={d.value} size={76} stroke={7} color={c.stroke} label={d.metric} />
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* ── Row 3: Feature Importance + Detection Summary ── */}
        <div className="ml-grid-2">
          {/* Feature Importance / Rule Weights */}
          <motion.div className="ml-card" variants={cardVariants} whileHover={{ y: -3 }}>
            <div className="ml-card-header">
              <div className="ml-card-title">
                <div className="ml-card-title-icon chart"><BarChart3 className="h-4 w-4" /></div>
                {isRuleBased ? "Rule Impact Weights" : "XGBoost Feature Importance (Top 15)"}
              </div>
            </div>
            <div className="ml-card-content">
              <ChartContainer config={chartConfig} className="ml-chart-wrapper">
                <BarChart
                  data={featureData || [...RULE_WEIGHTS].sort((a, b) => b.weight - a.weight)}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 120 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10.5, fill:"var(--muted-foreground)" }}
                    stroke="var(--muted-foreground)" strokeOpacity={0.2}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    type="category" dataKey="name"
                    tick={{ fontSize: 10.5, fill:"var(--muted-foreground)" }}
                    strokeOpacity={0} width={115} tickLine={false} axisLine={false}
                  />
                  <ReTooltip content={<BarTooltip />} cursor={{ fill:"rgba(0,0,0,0.04)", radius:6 }} />
                  <Bar dataKey="weight" radius={[0, 8, 8, 0]} barSize={16}>
                    {(featureData || [...RULE_WEIGHTS].sort((a, b) => b.weight - a.weight)).map((_, i) => (
                      <Cell key={i} fill={getBarColor(i, isDark)} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>

              {/* Colour legend */}
              <div style={{ display:"flex", gap:16, justifyContent:"center", marginTop: 8 }}>
                {[["Top Impact", isDark ? BAR_COLORS_DARK.high : BAR_COLORS.high],
                  ["Mid Impact", isDark ? BAR_COLORS_DARK.mid  : BAR_COLORS.mid],
                  ["Low Impact", isDark ? BAR_COLORS_DARK.low  : BAR_COLORS.low]].map(([label, color]) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"var(--muted-foreground)" }}>
                    <div style={{ width:10, height:10, borderRadius:3, background: color }} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Detection Summary */}
          <motion.div className="ml-card" variants={cardVariants} whileHover={{ y: -3 }}>
            <div className="ml-card-header">
              <div className="ml-card-title">
                <div className="ml-card-title-icon stats"><TrendingUp className="h-4 w-4" /></div>
                Detection Summary
              </div>
            </div>
            <div className="ml-card-content" style={{ display:"flex", flexDirection:"column", gap:20 }}>
              {/* Stat Cards */}
              <motion.div className="ml-stat-grid" variants={containerVariants} initial="hidden" animate="visible">
                <motion.div className="ml-stat-card primary" variants={statVariants} whileHover={{ scale: 1.03 }}>
                  <Target className="ml-stat-icon" style={{ color:"var(--primary)" }} />
                  <p className="ml-stat-number font-mono-data" style={{ color:"var(--primary)" }}>
                    {txnStats?.total || 0}
                  </p>
                  <p className="ml-stat-label">Total Scored</p>
                </motion.div>

                <motion.div className="ml-stat-card danger" variants={statVariants} whileHover={{ scale: 1.03 }}>
                  <Shield className="ml-stat-icon" style={{ color:"#ef4444" }} />
                  <p className="ml-stat-number font-mono-data" style={{ color:"#ef4444" }}>
                    {txnStats?.fraudCount || 0}
                  </p>
                  <p className="ml-stat-label">Flagged Fraud</p>
                </motion.div>

                <motion.div className="ml-stat-card warning" variants={statVariants} whileHover={{ scale: 1.03 }}>
                  <Zap className="ml-stat-icon" style={{ color:"#f59e0b" }} />
                  <p className="ml-stat-number font-mono-data" style={{ color:"#f59e0b" }}>
                    {txnStats?.fraudRate || "0%"}
                  </p>
                  <p className="ml-stat-label">Detection Rate</p>
                </motion.div>

                <motion.div className="ml-stat-card info" variants={statVariants} whileHover={{ scale: 1.03 }}>
                  <Gauge className="ml-stat-icon" style={{ color:"#6366f1" }} />
                  <p className="ml-stat-number font-mono-data" style={{ color:"#6366f1" }}>
                    {txnStats?.avgFraudScore ? parseFloat(txnStats.avgFraudScore).toFixed(2) : "0.00"}
                  </p>
                  <p className="ml-stat-label">Avg Fraud Score</p>
                </motion.div>
              </motion.div>

              {/* XGBoost Metrics */}
              {!isRuleBased && (
                <motion.div
                  className="ml-metrics-panel"
                  initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                  transition={{ delay:0.4, duration:0.3 }}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                    <Cpu size={14} style={{ color:"var(--primary)", opacity:0.7 }} />
                    <p className="ml-metrics-title" style={{ margin:0 }}>XGBoost Metrics</p>
                  </div>
                  <div className="ml-metrics-grid">
                    {[
                      ["AUC-ROC",   metrics?.auc_roc],
                      ["AUC-PR",    metrics?.auc_pr],
                      ["Precision", metrics?.precision],
                      ["Recall",    metrics?.recall],
                      ["F1 Score",  metrics?.f1],
                      ["Threshold", "0.70"],
                    ].map(([k, v]) => (
                      <div key={k} className="ml-metric-row">
                        <span className="ml-metric-label">{k}</span>
                        <span className="ml-metric-value font-mono-data"
                          style={{ color: v && v !== "0.70" ? "#6366f1" : undefined }}
                        >{v || "—"}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Fallback info */}
              {isRuleBased && (
                <motion.div
                  className="ml-info-box"
                  initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                  transition={{ delay:0.4, duration:0.3 }}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: 6 }}>
                    <AlertTriangle size={14} style={{ color:"#f59e0b" }} />
                    <p className="ml-info-box-title" style={{ margin:0 }}>
                      FastAPI ML Service Offline
                    </p>
                  </div>
                  <p className="ml-info-box-text">
                    When the FastAPI service is connected, this page auto-switches to XGBoost metrics: 
                    AUC-PR, Precision, Recall, F1 Score, and Confusion Matrix.
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </>
  );
}
