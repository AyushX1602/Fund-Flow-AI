import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio } from "lucide-react";
import useTransactionStore from "@/stores/transactionStore";
import { formatINR, formatScore, getRiskColor } from "@/lib/formatters";

export default function LiveTransactionFeed() {
  const liveTransactions = useTransactionStore((s) => s.liveTransactions);

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Live Feed</CardTitle>
            <CardDescription className="text-xs">Real-time transaction stream</CardDescription>
          </div>
          {liveTransactions.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 border border-primary/15">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="text-[10px] font-medium text-primary">{liveTransactions.length}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-4 pt-2">
        <ScrollArea className="h-[230px]">
          {liveTransactions.length === 0 ? (
            <div className="flex flex-col h-full items-center justify-center text-sm text-muted-foreground py-12">
              <Radio className="h-8 w-8 mb-2 opacity-20" />
              <p>Click "Demo Controls" to start streaming</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {liveTransactions.map((txn, i) => (
                <div
                  key={txn.id || i}
                  className="animate-slide-in flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Badge variant="secondary" className="text-[10px] shrink-0 font-medium">
                      {txn.type || "UPI"}
                    </Badge>
                    <span className="font-mono-data text-sm font-medium truncate">
                      {formatINR(txn.amount)}
                    </span>
                  </div>
                  <span
                    className={`font-mono-data text-sm font-bold ${getRiskColor(txn.fraudScore || 0)}`}
                  >
                    {formatScore(txn.fraudScore)}
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
