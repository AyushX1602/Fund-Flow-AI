import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio, ArrowUpRight } from "lucide-react";
import useTransactionStore from "@/stores/transactionStore";
import { formatINR, formatScore, getRiskColor } from "@/lib/formatters";

const txnVariants = {
  initial: { opacity: 0, x: 30, scale: 0.95 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -20, scale: 0.95 },
};

export default function LiveTransactionFeed() {
  const liveTransactions = useTransactionStore((s) => s.liveTransactions);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="dashboard-card rounded-xl border border-border/60 bg-card overflow-hidden"
    >
      <div className="px-5 pt-5 pb-1">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Live Feed</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time transaction stream
            </p>
          </div>
          {liveTransactions.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 border border-emerald-500/20">
              <div className="relative h-2 w-2">
                <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
                <div className="relative h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {liveTransactions.length} live
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
        <ScrollArea className="h-[250px]">
          {liveTransactions.length === 0 ? (
            <div className="flex flex-col h-full items-center justify-center text-sm text-muted-foreground py-16">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full bg-primary/5 animate-pulse scale-150" />
                <Radio className="relative h-10 w-10 opacity-25" />
              </div>
              <p className="text-xs font-medium">Waiting for transactions…</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Click "Demo Controls" to start streaming
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <AnimatePresence mode="popLayout">
                {liveTransactions.map((txn, i) => (
                  <motion.div
                    key={txn.id || i}
                    layout
                    variants={txnVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="group flex items-center justify-between rounded-lg border border-border/40 px-3 py-2.5 hover:bg-accent/40 hover:border-border/70 transition-all duration-200 cursor-default"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0 font-semibold tracking-wide"
                      >
                        {txn.type || "UPI"}
                      </Badge>
                      <span className="font-mono-data text-sm font-semibold truncate">
                        {formatINR(txn.amount)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-mono-data text-sm font-bold ${getRiskColor(txn.fraudScore || 0)}`}
                      >
                        {formatScore(txn.fraudScore)}
                      </span>
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </div>
    </motion.div>
  );
}
