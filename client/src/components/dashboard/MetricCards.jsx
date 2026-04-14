import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  ShieldAlert,
  TrendingUp,
  Snowflake,
  IndianRupee,
  Activity,
} from "lucide-react";
import useDashboardStore from "@/stores/dashboardStore";
import { formatINRCompact } from "@/lib/formatters";

const metrics = [
  {
    key: "totalTransactions",
    label: "Total Transactions",
    icon: ArrowLeftRight,
    format: (v) => v?.toLocaleString("en-IN") || "0",
    gradient: "from-blue-500/20 to-indigo-500/20",
    iconGradient: "from-blue-500 to-indigo-600",
    glowColor: "rgba(99,102,241,0.18)",
    accentColor: "#6366f1",
  },
  {
    key: "fraudRate",
    label: "Fraud Rate",
    icon: TrendingUp,
    format: (v) => `${v || "0.00"}%`,
    gradient: "from-rose-500/20 to-red-500/20",
    iconGradient: "from-rose-500 to-red-600",
    glowColor: "rgba(244,63,94,0.18)",
    accentColor: "#f43f5e",
  },
  {
    key: "unresolvedAlerts",
    label: "Active Alerts",
    icon: ShieldAlert,
    format: (v) => v?.toString() || "0",
    gradient: "from-amber-500/20 to-orange-500/20",
    iconGradient: "from-amber-500 to-orange-600",
    glowColor: "rgba(245,158,11,0.18)",
    accentColor: "#f59e0b",
  },
  {
    key: "frozenAccounts",
    label: "Frozen Accounts",
    icon: Snowflake,
    format: (v) => v?.toString() || "0",
    gradient: "from-sky-500/20 to-cyan-500/20",
    iconGradient: "from-sky-500 to-cyan-600",
    glowColor: "rgba(14,165,233,0.18)",
    accentColor: "#0ea5e9",
  },
  {
    key: "totalVolume",
    label: "Total Volume",
    icon: IndianRupee,
    format: (v) => formatINRCompact(v || 0),
    gradient: "from-emerald-500/20 to-green-500/20",
    iconGradient: "from-emerald-500 to-green-600",
    glowColor: "rgba(16,185,129,0.18)",
    accentColor: "#10b981",
  },
  {
    key: "todayTxnCount",
    label: "Today's Activity",
    icon: Activity,
    format: (v) => v?.toLocaleString("en-IN") || "0",
    gradient: "from-violet-500/20 to-purple-500/20",
    iconGradient: "from-violet-500 to-purple-600",
    glowColor: "rgba(139,92,246,0.18)",
    accentColor: "#8b5cf6",
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

  return <span>{display}</span>;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

export default function MetricCards() {
  const overview = useDashboardStore((s) => s.overview);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {metrics.map((m, index) => (
        <motion.div
          key={m.key}
          custom={index}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="group relative"
        >
          <div
            className="metric-card relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 transition-all duration-300"
            style={{
              "--card-glow": m.glowColor,
              "--card-accent": m.accentColor,
            }}
          >
            {/* Gradient accent strip at top — always visible */}
            <div
              className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${m.iconGradient}`}
            />

            {/* Background gradient — always visible */}
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${m.gradient}`}
            />

            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {m.label}
                </span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${m.iconGradient} shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md`}
                >
                  <m.icon className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
              <div className="mt-3">
                <p className="font-mono-data text-[1.65rem] font-bold leading-none tracking-tight text-foreground">
                  <AnimatedNumber value={m.format(overview?.[m.key])} />
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
