import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Pie,
  PieChart,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Sector,
} from "recharts";
import useDashboardStore from "@/stores/dashboardStore";

/* ─── Premium colour palette ─── */
const PALETTE = [
  { color: "#6366f1", glow: "rgba(99,102,241,0.25)" },
  { color: "#f59e0b", glow: "rgba(245,158,11,0.25)" },
  { color: "#10b981", glow: "rgba(16,185,129,0.25)" },
  { color: "#3b82f6", glow: "rgba(59,130,246,0.25)" },
  { color: "#8b5cf6", glow: "rgba(139,92,246,0.25)" },
  { color: "#ec4899", glow: "rgba(236,72,153,0.25)" },
];

/* ─── Custom active slice ─── */
const renderActiveShape = (props) => {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
  } = props;

  return (
    <g>
      {/* Glow outer ring */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 4}
        outerRadius={outerRadius + 12}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.2}
      />
      {/* Main slice — expanded */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

/* ─── Custom tooltip ─── */
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value, payload: inner } = payload[0];
  const pct =
    inner?.percent != null ? (inner.percent * 100).toFixed(1) : null;
  return (
    <div className="chart-tooltip rounded-xl border border-border/40 bg-card/95 backdrop-blur-xl px-4 py-3 shadow-2xl">
      <p className="font-semibold text-foreground text-xs mb-1">{name}</p>
      <p
        className="font-mono text-sm font-bold"
        style={{ color: payload[0].payload?.fill }}
      >
        {value.toLocaleString()} txns
      </p>
      {pct && (
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {pct}% of total
        </p>
      )}
    </div>
  );
};

export default function ChannelDonut() {
  const channelBreakdown = useDashboardStore((s) => s.channelBreakdown);
  const [activeIndex, setActiveIndex] = useState(null);

  const data = channelBreakdown.map((c, i) => ({
    name: c.channel?.replace(/_/g, " ") || "Unknown",
    value: c.count || 0,
    fill: PALETTE[i % PALETTE.length].color,
    glow: PALETTE[i % PALETTE.length].glow,
  }));

  const total = data.reduce((s, d) => s + d.value, 0);

  const onEnter = useCallback((_, idx) => setActiveIndex(idx), []);
  const onLeave = useCallback(() => setActiveIndex(null), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="dashboard-card rounded-xl border border-border/60 bg-card overflow-hidden"
    >
      <div className="px-5 pt-5 pb-0">
        <h3 className="text-sm font-semibold text-foreground">
          Channel Breakdown
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Transaction distribution by payment channel
        </p>
      </div>

      <div className="px-4 pt-3 pb-4">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* ─── Donut Chart ─── */}
          <div className="relative shrink-0" style={{ width: 230, height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <ReTooltip content={<CustomTooltip />} />
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={96}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                  activeIndex={activeIndex}
                  activeShape={renderActiveShape}
                  onMouseEnter={onEnter}
                  onMouseLeave={onLeave}
                  animationBegin={0}
                  animationDuration={900}
                  animationEasing="ease-out"
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.fill}
                      opacity={
                        activeIndex === null || activeIndex === i ? 1 : 0.35
                      }
                      className="transition-opacity duration-200"
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Centre info */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-2">
              {activeIndex === null ? (
                <>
                  <span className="font-mono text-2xl font-bold text-foreground leading-tight">
                    {total.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-1 font-medium uppercase tracking-wider">
                    Total Txns
                  </span>
                </>
              ) : (
                <>
                  <span
                    className="font-mono text-2xl font-bold leading-tight"
                    style={{ color: data[activeIndex]?.fill }}
                  >
                    {data[activeIndex]?.value.toLocaleString()}
                  </span>
                  <span
                    className="text-[11px] font-semibold mt-0.5 truncate w-full text-center"
                    style={{ color: data[activeIndex]?.fill }}
                  >
                    {data[activeIndex]?.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {total > 0
                      ? ((data[activeIndex]?.value / total) * 100).toFixed(1)
                      : 0}
                    % of total
                  </span>
                </>
              )}
            </div>
          </div>

          {/* ─── Legend sidebar ─── */}
          <div className="flex-1 w-full space-y-1.5 min-w-0">
            {data.map((entry, i) => {
              const pct =
                total > 0
                  ? ((entry.value / total) * 100).toFixed(1)
                  : "0.0";
              const isActive = activeIndex === i;
              return (
                <motion.div
                  key={i}
                  animate={{
                    x: isActive ? 4 : 0,
                    backgroundColor: isActive ? entry.glow : "transparent",
                  }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer"
                  style={{
                    border: `1px solid ${
                      isActive ? entry.fill + "40" : "transparent"
                    }`,
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <div
                    className="shrink-0 rounded-full transition-all duration-200"
                    style={{
                      width: isActive ? 12 : 10,
                      height: isActive ? 12 : 10,
                      backgroundColor: entry.fill,
                      boxShadow: isActive
                        ? `0 0 10px ${entry.fill}80`
                        : "none",
                    }}
                  />

                  <span
                    className="truncate text-xs font-medium transition-colors duration-200"
                    style={{
                      color: isActive
                        ? entry.fill
                        : "var(--muted-foreground)",
                    }}
                  >
                    {entry.name}
                  </span>

                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {/* Mini progress bar */}
                    <div className="h-1.5 w-16 rounded-full bg-muted/80 overflow-hidden hidden sm:block">
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1 }}
                        style={{ backgroundColor: entry.fill }}
                      />
                    </div>
                    <span
                      className="font-mono text-[11px] font-bold w-9 text-right"
                      style={{ color: entry.fill }}
                    >
                      {pct}%
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground w-12 text-right">
                      {entry.value.toLocaleString()}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
