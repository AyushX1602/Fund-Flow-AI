import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, ChevronRight } from "lucide-react";
import useDashboardStore from "@/stores/dashboardStore";
import {
  formatINR,
  formatRelativeTime,
  formatScore,
  getRiskColor,
  getSeverityVariant,
  getAlertTypeName,
} from "@/lib/formatters";

function getSeverityDot(severity) {
  const colors = {
    CRITICAL: "bg-red-500",
    HIGH: "bg-orange-500",
    MEDIUM: "bg-amber-500",
    LOW: "bg-blue-500",
  };
  return colors[severity] || "bg-gray-400";
}

export default function RecentAlerts() {
  const recentAlerts = useDashboardStore((s) => s.recentAlerts);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="dashboard-card rounded-xl border border-border/60 bg-card overflow-hidden"
    >
      <div className="px-5 pt-5 pb-1">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Recent Alerts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Latest fraud alerts requiring attention
            </p>
          </div>
          {recentAlerts.length > 0 && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <span className="text-[10px] font-bold">{recentAlerts.length}</span>
            </div>
          )}
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
        <ScrollArea className="h-[250px]">
          {recentAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-sm text-muted-foreground py-16">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full bg-emerald-500/5 scale-150" />
                <Bell className="relative h-10 w-10 opacity-25" />
              </div>
              <p className="text-xs font-medium">All clear</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                No alerts at the moment
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentAlerts.slice(0, 8).map((alert, i) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="group flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5 hover:bg-accent/40 hover:border-border/70 transition-all duration-200 cursor-pointer"
                >
                  {/* Severity indicator */}
                  <div className="relative shrink-0">
                    <div className={`h-2.5 w-2.5 rounded-full ${getSeverityDot(alert.severity)}`} />
                    {alert.severity === "CRITICAL" && (
                      <div className={`absolute inset-0 rounded-full ${getSeverityDot(alert.severity)} animate-ping opacity-50`} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold truncate">
                        {getAlertTypeName(alert.alertType || alert.type)}
                      </p>
                      <Badge
                        variant={getSeverityVariant(alert.severity)}
                        className="shrink-0 text-[9px] px-1.5 py-0"
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatINR(alert.transaction?.amount)} ·{" "}
                      {formatRelativeTime(alert.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`font-mono-data text-xs font-bold ${getRiskColor(alert.fraudScore)}`}
                    >
                      {formatScore(alert.fraudScore)}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </motion.div>
  );
}
