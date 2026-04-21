/**
 * PreemptiveWatchCard.jsx
 * Shows how many accounts are currently under preemptive fraud watch.
 * Polls /api/preemptive/status every 60 seconds.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, AlertTriangle, RefreshCw, Eye } from "lucide-react";
import api from "@/lib/api";

export default function PreemptiveWatchCard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse]     = useState(false);

  async function fetchStatus() {
    try {
      const res = await api.get("/preemptive/status");
      const next = res.data;
      if (data && next.watchedCount !== data.watchedCount) setPulse(true);
      setData(next);
    } catch {
      // silent — engine may not have run yet
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 60000); // refresh every 1 min
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (pulse) {
      const t = setTimeout(() => setPulse(false), 1200);
      return () => clearTimeout(t);
    }
  }, [pulse]);

  const count   = data?.watchedCount ?? 0;
  const watched = data?.watchedAccounts ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-xl border border-violet-500/30 bg-card p-5"
      style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.06) 100%)" }}
    >
      {/* Top accent strip */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-violet-500 to-blue-500" />

      {/* Animated ping when count changes */}
      <AnimatePresence>
        {pulse && (
          <motion.div
            key="ping"
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: 0, scale: 2.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0 rounded-xl border border-violet-500/40 pointer-events-none"
          />
        )}
      </AnimatePresence>

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-violet-400" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-violet-400">
              Preemptive Watch
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl font-bold tracking-tight text-foreground font-mono">
              {loading ? "—" : count}
            </span>
            <span className="text-sm text-muted-foreground">accounts</span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {count === 0
              ? "No anomalous behavioral patterns detected"
              : `${count} account${count > 1 ? "s" : ""} showing pre-fraud signals`}
          </p>

          {/* Top watched accounts */}
          {watched.length > 0 && (
            <div className="mt-3 space-y-1">
              {watched.slice(0, 3).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-md bg-violet-500/10 px-2.5 py-1.5 text-xs"
                >
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Eye className="h-3 w-3 text-violet-400" />
                    <span className="font-mono">{a.id.slice(-8)}</span>
                  </span>
                  <span
                    className={`font-semibold ${
                      a.score >= 0.85 ? "text-red-400" : a.score >= 0.75 ? "text-orange-400" : "text-amber-400"
                    }`}
                  >
                    {(a.score * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right icon block */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <button
            onClick={fetchStatus}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Scan status footer */}
      <div className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground/60">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${count > 0 ? "bg-violet-500 animate-pulse" : "bg-muted"}`} />
        Auto-scans every 5 minutes · Last updated now
      </div>
    </motion.div>
  );
}
