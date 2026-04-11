import { Pie, PieChart, Cell, Tooltip as ReTooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import useDashboardStore from "@/stores/dashboardStore";

const COLORS = [
  "oklch(0.546 0.245 262.88)",
  "oklch(0.52 0.17 155)",
  "oklch(0.72 0.19 60)",
  "oklch(0.577 0.245 27.33)",
  "oklch(0.62 0.21 310)",
  "oklch(0.55 0.18 200)",
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-card px-4 py-3 shadow-lg">
      <p className="text-xs font-medium">{payload[0].name}</p>
      <p className="font-mono-data text-sm font-semibold mt-0.5">{payload[0].value} transactions</p>
    </div>
  );
};

const renderLegend = (props) => {
  const { payload } = props;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function ChannelDonut() {
  const channelBreakdown = useDashboardStore((s) => s.channelBreakdown);

  const data = channelBreakdown.map((c) => ({
    name: c.channel?.replace("_", " ") || "Unknown",
    value: c.count || 0,
  }));

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold">Channel Breakdown</CardTitle>
        <CardDescription className="text-xs">Transaction distribution by payment channel</CardDescription>
      </CardHeader>
      <CardContent className="pb-4 pt-2">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <ReTooltip content={<CustomTooltip />} />
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={4}
              dataKey="value"
              nameKey="name"
              stroke="none"
              animationBegin={0}
              animationDuration={800}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Legend content={renderLegend} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
