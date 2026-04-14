import { useState, useCallback } from "react";
import {
  Pie,
  PieChart,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Sector,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import useDashboardStore from "@/stores/dashboardStore";

/* ─── Premium colour palette ─── */
const PALETTE = [
  { color: "#6366f1", glow: "rgba(99,102,241,0.35)" },   // Indigo — API
  { color: "#f59e0b", glow: "rgba(245,158,11,0.35)" },   // Amber — ATM
  { color: "#10b981", glow: "rgba(16,185,129,0.35)" },   // Emerald — Branch
  { color: "#3b82f6", glow: "rgba(59,130,246,0.35)" },   // Blue — Mobile App
  { color: "#8b5cf6", glow: "rgba(139,92,246,0.35)" },   // Violet — Net Banking
  { color: "#ec4899", glow: "rgba(236,72,153,0.35)" },   // Pink — POS
];

/* ─── Custom active slice (animated glow ring, NO centre text) ─── */
const renderActiveShape = (props) => {
  const {
    cx, cy, innerRadius, outerRadius,
    startAngle, endAngle, fill,
  } = props;

  return (
    <g>
      {/* Glow outer ring */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={outerRadius + 4}
        outerRadius={outerRadius + 10}
        startAngle={startAngle} endAngle={endAngle}
        fill={fill}
        opacity={0.25}
      />
      {/* Main slice — slightly expanded */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle} endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

/* ─── Custom tooltip ─── */
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value, payload: inner } = payload[0];
  const pct = inner?.percent != null ? (inner.percent * 100).toFixed(1) : null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      className="rounded-xl px-4 py-3 shadow-2xl text-xs">
      <p className="font-semibold text-foreground mb-0.5">{name}</p>
      <p className="font-mono text-sm font-bold" style={{ color: payload[0].payload?.fill }}>
        {value.toLocaleString()} txns
      </p>
      {pct && <p className="text-muted-foreground mt-0.5">{pct}% of total</p>}
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
    <Card className="overflow-hidden">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold">Channel Breakdown</CardTitle>
        <CardDescription className="text-xs">Transaction distribution by payment channel</CardDescription>
      </CardHeader>

      <CardContent className="pt-2 pb-4">
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
                    <Cell key={i} fill={entry.fill} opacity={activeIndex === null || activeIndex === i ? 1 : 0.45} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Centre info — always visible */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-2">
              {activeIndex === null ? (
                <>
                  <span className="font-mono text-2xl font-bold text-foreground leading-tight">{total.toLocaleString()}</span>
                  <span className="text-[10px] text-muted-foreground mt-1">Total Txns</span>
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
                    {total > 0 ? ((data[activeIndex]?.value / total) * 100).toFixed(1) : 0}% of total
                  </span>
                </>
              )}
            </div>
          </div>

          {/* ─── Legend sidebar ─── */}
          <div className="flex-1 w-full space-y-2.5 min-w-0">
            {data.map((entry, i) => {
              const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";
              const isActive = activeIndex === i;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all duration-200"
                  style={{
                    background: isActive ? entry.glow : "transparent",
                    border: `1px solid ${isActive ? entry.fill + "60" : "transparent"}`,
                    transform: isActive ? "translateX(4px)" : "none",
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {/* Colour dot */}
                  <div
                    className="shrink-0 rounded-full transition-all duration-200"
                    style={{
                      width: isActive ? 12 : 10,
                      height: isActive ? 12 : 10,
                      backgroundColor: entry.fill,
                      boxShadow: isActive ? `0 0 8px ${entry.fill}` : "none",
                    }}
                  />

                  {/* Name */}
                  <span
                    className="truncate text-xs font-medium transition-colors duration-200"
                    style={{ color: isActive ? entry.fill : "var(--muted-foreground)" }}
                  >
                    {entry.name}
                  </span>

                  {/* Bar + stats */}
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {/* Mini progress bar */}
                    <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden hidden sm:block">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: entry.fill }}
                      />
                    </div>
                    <span className="font-mono text-[11px] font-semibold w-8 text-right" style={{ color: entry.fill }}>
                      {pct}%
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground w-12 text-right">
                      {entry.value.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
