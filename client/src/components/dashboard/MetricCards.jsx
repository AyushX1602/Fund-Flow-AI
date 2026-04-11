import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ShieldAlert,
  TrendingUp,
  Snowflake,
  IndianRupee,
  Activity,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import useDashboardStore from "@/stores/dashboardStore";
import { formatINRCompact } from "@/lib/formatters";

const metrics = [
  {
    key: "totalTransactions",
    label: "Total Transactions",
    icon: ArrowLeftRight,
    format: (v) => v?.toLocaleString("en-IN") || "0",
    color: "text-primary",
    bgColor: "bg-primary/8",
    iconBg: "bg-primary/12",
  },
  {
    key: "fraudRate",
    label: "Fraud Rate",
    icon: TrendingUp,
    format: (v) => `${v || "0.00"}%`,
    color: "text-destructive",
    bgColor: "bg-destructive/5",
    iconBg: "bg-destructive/10",
  },
  {
    key: "unresolvedAlerts",
    label: "Active Alerts",
    icon: ShieldAlert,
    format: (v) => v?.toString() || "0",
    color: "text-amber-600",
    bgColor: "bg-amber-500/5",
    iconBg: "bg-amber-500/10",
  },
  {
    key: "frozenAccounts",
    label: "Frozen Accounts",
    icon: Snowflake,
    format: (v) => v?.toString() || "0",
    color: "text-sky-600",
    bgColor: "bg-sky-500/5",
    iconBg: "bg-sky-500/10",
  },
  {
    key: "totalVolume",
    label: "Total Volume",
    icon: IndianRupee,
    format: (v) => formatINRCompact(v || 0),
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/5",
    iconBg: "bg-emerald-500/10",
  },
  {
    key: "todayTxnCount",
    label: "Today's Activity",
    icon: Activity,
    format: (v) => v?.toLocaleString("en-IN") || "0",
    color: "text-violet-600",
    bgColor: "bg-violet-500/5",
    iconBg: "bg-violet-500/10",
  },
];

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      setDisplay(value);
      prevRef.current = value;
    }
  }, [value]);

  return <span className="animate-count-up">{display}</span>;
}

export default function MetricCards() {
  const overview = useDashboardStore((s) => s.overview);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {metrics.map((m) => (
        <Card key={m.key} className="group relative overflow-hidden transition-all duration-200 hover:border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">{m.label}</span>
              <div className={`rounded-lg p-2 ${m.iconBg} transition-transform duration-200 group-hover:scale-110`}>
                <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
              </div>
            </div>
            <div className="mt-2">
              <p className="font-mono-data text-2xl font-bold tracking-tight">
                <AnimatedNumber value={m.format(overview?.[m.key])} />
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
