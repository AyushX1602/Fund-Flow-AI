import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Cell,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import useDashboardStore from "@/stores/dashboardStore";

const RISK_COLORS = [
  { threshold: 0.8, color: "#ef4444", label: "Critical" },
  { threshold: 0.6, color: "#f97316", label: "High" },
  { threshold: 0.4, color: "#f59e0b", label: "Medium" },
  { threshold: 0.2, color: "#6366f1", label: "Low" },
  { threshold: 0, color: "#10b981", label: "Safe" },
];

function getBarColor(range) {
  const start = parseFloat(range);
  for (const rc of RISK_COLORS) {
    if (start >= rc.threshold) return rc.color;
  }
  return "#10b981";
}

function getRiskLabel(range) {
  const start = parseFloat(range);
  for (const rc of RISK_COLORS) {
    if (start >= rc.threshold) return rc.label;
  }
  return "Safe";
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const color = getBarColor(label);
  const riskLabel = getRiskLabel(label);
  return (
    <div className="chart-tooltip rounded-xl border border-border/40 bg-card/95 backdrop-blur-xl px-4 py-3 shadow-2xl">
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
          {riskLabel} Risk
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground">Score Range: {label}</p>
      <p className="font-mono-data text-sm font-bold mt-1">
        {payload[0].value.toLocaleString()} transactions
      </p>
    </div>
  );
};

export default function RiskHistogram() {
  const riskDistribution = useDashboardStore((s) => s.riskDistribution);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 }}
      className="dashboard-card group rounded-xl border border-border/60 bg-card overflow-hidden"
    >
      <div className="px-5 pt-5 pb-1">
        <h3 className="text-sm font-semibold text-foreground">Risk Distribution</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Fraud score histogram across all transactions
        </p>
      </div>
      <div className="px-3 pb-4 pt-2">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={riskDistribution}
            margin={{ top: 12, right: 12, bottom: 0, left: -12 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
              opacity={0.5}
            />
            <XAxis
              dataKey="range"
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={45}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <ReTooltip
              content={<CustomTooltip />}
              cursor={{ fill: "var(--accent)", radius: 6, opacity: 0.5 }}
            />
            <Bar
              dataKey="count"
              radius={[8, 8, 2, 2]}
              maxBarSize={42}
              animationDuration={1200}
              animationEasing="ease-out"
            >
              {riskDistribution.map((entry, i) => (
                <Cell
                  key={i}
                  fill={getBarColor(entry.range)}
                  fillOpacity={0.85}
                  className="transition-opacity duration-200 hover:fill-opacity-100"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Risk legend */}
        <div className="flex items-center justify-center gap-4 mt-2 px-2">
          {RISK_COLORS.slice(0, 4).reverse().map((rc) => (
            <div key={rc.label} className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: rc.color }}
              />
              <span className="text-[10px] text-muted-foreground font-medium">
                {rc.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
