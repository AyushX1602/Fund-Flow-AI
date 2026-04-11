import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell } from "lucide-react";
import useDashboardStore from "@/stores/dashboardStore";
import { formatINR, formatRelativeTime, formatScore, getRiskColor, getSeverityVariant, getAlertTypeName } from "@/lib/formatters";

export default function RecentAlerts() {
  const recentAlerts = useDashboardStore((s) => s.recentAlerts);

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold">Recent Alerts</CardTitle>
        <CardDescription className="text-xs">Latest fraud alerts requiring attention</CardDescription>
      </CardHeader>
      <CardContent className="pb-4 pt-2">
        <ScrollArea className="h-[230px]">
          {recentAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-sm text-muted-foreground py-12">
              <Bell className="h-8 w-8 mb-2 opacity-20" />
              <p>No alerts yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentAlerts.slice(0, 8).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5 hover:bg-accent/50 transition-colors"
                >
                  <Badge variant={getSeverityVariant(alert.severity)} className="shrink-0 text-[10px]">
                    {alert.severity}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{getAlertTypeName(alert.alertType || alert.type)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatINR(alert.transaction?.amount)} · {formatRelativeTime(alert.createdAt)}
                    </p>
                  </div>
                  <span className={`font-mono-data text-xs font-bold shrink-0 ${getRiskColor(alert.fraudScore)}`}>
                    {formatScore(alert.fraudScore)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
