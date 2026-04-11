import { Zap, Link, RefreshCw, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import useSimulationStore from "@/stores/simulationStore";
import api from "@/lib/api";

export default function Header({ title, subtitle }) {
  const { isRunning, progress, injectVelocityBurst, injectAutoSimulate, stopSimulation } =
    useSimulationStore();

  const injectMoneyChain = async () => {
    try {
      const accounts = await api.get("/accounts?limit=15");
      const accts = accounts.data || [];
      if (accts.length < 4) return;
      const chain = [];
      for (let i = 0; i < 4; i++) {
        chain.push({
          amount: 25000 + Math.random() * 50000,
          type: "IMPS",
          channel: "MOBILE_APP",
          senderAccountId: accts[i].id,
          receiverAccountId: accts[i + 1 < accts.length ? i + 1 : 0].id,
        });
      }
      await api.post("/transactions/bulk", { transactions: chain });
    } catch (err) {
      console.error("Money chain injection failed", err);
    }
  };

  const injectCircularRing = async () => {
    try {
      const accounts = await api.get("/accounts?limit=15");
      const accts = accounts.data || [];
      if (accts.length < 4) return;
      const ring = [];
      for (let i = 0; i < 4; i++) {
        ring.push({
          amount: 30000 + Math.random() * 20000,
          type: "UPI",
          channel: "MOBILE_APP",
          senderAccountId: accts[i].id,
          receiverAccountId: accts[(i + 1) % 4].id,
          upiVpaSender: `user${i}@oksbi`,
          upiVpaReceiver: `user${(i + 1) % 4}@ybl`,
        });
      }
      await api.post("/transactions/bulk", { transactions: ring });
    } catch (err) {
      console.error("Circular ring injection failed", err);
    }
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div>
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Simulation progress */}
        {isRunning && progress && (
          <div className="flex items-center gap-2 rounded-xl bg-primary/8 px-3.5 py-1.5 text-xs border border-primary/15">
            <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="font-mono-data text-primary font-medium">
              {progress.percentage || 0}% · {progress.fraudCount || 0} frauds
            </span>
          </div>
        )}

        {/* Demo Controls */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={isRunning ? "destructive" : "default"}
              size="sm"
              className="gap-1.5 rounded-xl shadow-sm"
            >
              {isRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isRunning ? "Running" : "Demo Controls"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            {isRunning ? (
              <DropdownMenuItem onClick={stopSimulation} className="rounded-lg">
                <Square className="h-4 w-4 mr-2 text-destructive" />
                Stop Simulation
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Inject Fraud Scenarios
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={injectVelocityBurst} className="rounded-lg">
                  <Zap className="h-4 w-4 mr-2 text-amber-500" />
                  Velocity Burst (10 txns)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={injectMoneyChain} className="rounded-lg">
                  <Link className="h-4 w-4 mr-2 text-orange-500" />
                  Money Chain
                </DropdownMenuItem>
                <DropdownMenuItem onClick={injectCircularRing} className="rounded-lg">
                  <RefreshCw className="h-4 w-4 mr-2 text-destructive" />
                  Circular Ring
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={injectAutoSimulate} className="rounded-lg">
                  <Play className="h-4 w-4 mr-2 text-primary" />
                  Auto Simulate (50 txns)
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
