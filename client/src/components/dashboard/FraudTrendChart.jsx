import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import useDashboardStore from "@/stores/dashboardStore";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-card px-4 py-3 shadow-lg">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono-data font-semibold">{entry.value}</span>
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
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold">Fraud Trend</CardTitle>
        <CardDescription className="text-xs">Transaction analysis over the last 30 days</CardDescription>
      </CardHeader>
      <CardContent className="pb-4 pt-2">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="fillFraud" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillLegit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.12} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
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
            <Area
              type="monotone"
              dataKey="Legitimate"
              stroke="var(--primary)"
              fill="url(#fillLegit)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
            />
            <Area
              type="monotone"
              dataKey="Fraudulent"
              stroke="var(--destructive)"
              fill="url(#fillFraud)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
