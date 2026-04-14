import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import useDashboardStore from "@/stores/dashboardStore";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip rounded-xl border border-border/40 bg-card/95 backdrop-blur-xl px-4 py-3 shadow-2xl">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2.5 text-sm py-0.5">
          <div
            className="h-2.5 w-2.5 rounded-full ring-2 ring-offset-1 ring-offset-card"
            style={{ backgroundColor: entry.color, ringColor: entry.color }}
          />
          <span className="text-muted-foreground text-xs">{entry.name}:</span>
          <span className="font-mono-data font-bold">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

const CustomLegend = ({ payload }) => {
  if (!payload?.length) return null;
  return (
    <div className="flex items-center justify-center gap-5 pt-2">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-[11px] font-medium text-muted-foreground">
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function FraudTrendChart() {
  const fraudTrend = useDashboardStore((s) => s.fraudTrend);

  const data = fraudTrend.map((item) => ({
    date: item.date?.substring(5),
    Fraudulent: item.fraud || 0,
    Legitimate: item.legitimate || 0,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="dashboard-card group rounded-xl border border-border/60 bg-card overflow-hidden"
    >
      <div className="px-5 pt-5 pb-1">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Fraud Trend</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Transaction analysis over the last 30 days
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 border border-primary/10">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-medium text-primary">Live</span>
          </div>
        </div>
      </div>
      <div className="px-3 pb-4 pt-2">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart
            data={data}
            margin={{ top: 12, right: 12, bottom: 0, left: -12 }}
          >
            <defs>
              <linearGradient id="fillFraud" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--destructive)"
                  stopOpacity={0.25}
                />
                <stop
                  offset="100%"
                  stopColor="var(--destructive)"
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id="fillLegit" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity={0.15}
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
              opacity={0.5}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <ReTooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
            <Area
              type="monotone"
              dataKey="Legitimate"
              stroke="var(--primary)"
              fill="url(#fillLegit)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 5,
                strokeWidth: 2,
                fill: "var(--card)",
                stroke: "var(--primary)",
              }}
            />
            <Area
              type="monotone"
              dataKey="Fraudulent"
              stroke="var(--destructive)"
              fill="url(#fillFraud)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 5,
                strokeWidth: 2,
                fill: "var(--card)",
                stroke: "var(--destructive)",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
