import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, ChevronRight } from "lucide-react";
import useDashboardStore from "@/stores/dashboardStore";
import { getKycColor } from "@/lib/formatters";

function getRiskGradient(score) {
  if (score >= 0.8) return "from-red-500 to-rose-600";
  if (score >= 0.6) return "from-orange-500 to-amber-600";
  if (score >= 0.4) return "from-amber-400 to-yellow-500";
  return "from-emerald-400 to-green-500";
}

export default function TopRiskTable() {
  const topRiskAccounts = useDashboardStore((s) => s.topRiskAccounts);
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45 }}
      className="dashboard-card rounded-xl border border-border/60 bg-card overflow-hidden"
    >
      <div className="px-5 pt-5 pb-1">
        <h3 className="text-sm font-semibold text-foreground">
          Top Risk Accounts
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Highest risk-scored accounts in the system
        </p>
      </div>
      <div className="px-4 pb-4 pt-2">
        {topRiskAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-sm text-muted-foreground py-16">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-primary/5 scale-150" />
              <Users className="relative h-10 w-10 opacity-25" />
            </div>
            <p className="text-xs font-medium">No risk data yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Run a simulation to generate risk scores
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {topRiskAccounts.slice(0, 6).map((acct, i) => (
              <motion.button
                key={acct.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
                onClick={() => navigate(`/accounts`)}
                className="group flex w-full items-center gap-3 rounded-lg border border-border/40 p-3 text-left transition-all duration-200 hover:bg-accent/40 hover:border-border/70"
              >
                {/* Risk indicator dot */}
                <div
                  className={`h-2 w-2 rounded-full bg-gradient-to-r ${getRiskGradient(acct.riskScore || 0)} shrink-0`}
                />

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">
                    {acct.accountHolder}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {acct.bankName} ·{" "}
                    <span className={getKycColor(acct.kycType)}>
                      {acct.kycType?.replace("_", " ")}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {acct.isFrozen && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] text-sky-600 px-1.5"
                    >
                      Frozen
                    </Badge>
                  )}
                  <div className="w-20">
                    <Progress
                      value={(acct.riskScore || 0) * 100}
                      className="h-1.5"
                    />
                    <p className="font-mono-data text-[10px] text-right mt-0.5 font-bold">
                      {(acct.riskScore || 0).toFixed(2)}
                    </p>
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
