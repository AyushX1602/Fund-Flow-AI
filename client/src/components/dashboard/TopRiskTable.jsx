import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users } from "lucide-react";
import useDashboardStore from "@/stores/dashboardStore";
import { getKycColor } from "@/lib/formatters";

export default function TopRiskTable() {
  const topRiskAccounts = useDashboardStore((s) => s.topRiskAccounts);
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold">Top Risk Accounts</CardTitle>
        <CardDescription className="text-xs">Highest risk-scored accounts in the system</CardDescription>
      </CardHeader>
      <CardContent className="pb-4 pt-2">
        {topRiskAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-sm text-muted-foreground py-12">
            <Users className="h-8 w-8 mb-2 opacity-20" />
            <p>Run a simulation to generate risk scores</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topRiskAccounts.slice(0, 6).map((acct) => (
              <button
                key={acct.id}
                onClick={() => navigate(`/accounts`)}
                className="flex w-full items-center gap-3 rounded-lg border border-border/50 p-3 text-left transition-all duration-200 hover:bg-accent/50 hover:border-border"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{acct.accountHolder}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {acct.bankName} · <span className={getKycColor(acct.kycType)}>{acct.kycType?.replace("_", " ")}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  {acct.isFrozen && (
                    <Badge variant="secondary" className="text-[10px] text-sky-600">
                      Frozen
                    </Badge>
                  )}
                  <div className="w-20">
                    <Progress
                      value={(acct.riskScore || 0) * 100}
                      className="h-1.5"
                    />
                    <p className="font-mono-data text-[10px] text-right mt-0.5 font-semibold">
                      {(acct.riskScore || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
