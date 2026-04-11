import { Bar, BarChart, XAxis, YAxis, Tooltip as ReTooltip, Cell, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import useDashboardStore from "@/stores/dashboardStore";

function getBarColor(range) {
  const start = parseFloat(range);
  if (start >= 0.8) return "oklch(0.577 0.245 27.33)";
  if (start >= 0.6) return "oklch(0.65 0.22 40)";
  if (start >= 0.4) return "oklch(0.72 0.19 60)";
  if (start >= 0.2) return "oklch(0.546 0.245 262.88)";
  return "oklch(0.52 0.17 155)";
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-card px-4 py-3 shadow-lg">
      <p className="text-xs font-medium text-muted-foreground">Score Range: {label}</p>
      <p className="font-mono-data text-sm font-semibold mt-1">{payload[0].value} transactions</p>
    </div>
  );
};

export default function RiskHistogram() {
  const riskDistribution = useDashboardStore((s) => s.riskDistribution);

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold">Risk Distribution</CardTitle>
        <CardDescription className="text-xs">Fraud score histogram across all transactions</CardDescription>
      </CardHeader>
      <CardContent className="pb-4 pt-2">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={riskDistribution} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
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
            <ReTooltip content={<CustomTooltip />} cursor={{ fill: "var(--accent)", radius: 6 }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
              {riskDistribution.map((entry, i) => (
                <Cell key={i} fill={getBarColor(entry.range)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
