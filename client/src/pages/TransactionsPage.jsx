import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Search, ArrowUpDown, Download } from "lucide-react";
import useTransactionStore from "@/stores/transactionStore";
import useSimulationStore from "@/stores/simulationStore";
import { formatINR, formatScore, getRiskColor, formatDateTime, getSeverityVariant } from "@/lib/formatters";
import { getShapLabel, getImpactColor } from "@/lib/shapLabels";
import api from "@/lib/api";

function exportToCSV(filename, rows) {
  if (!rows || !rows.length) return;
  const separator = ',';
  const keys = Object.keys(rows[0]);
  const csvContent =
    keys.join(separator) +
    '\n' +
    rows.map(row => {
      return keys.map(k => {
        let cell = row[k] === null || row[k] === undefined ? '' : row[k];
        cell = cell instanceof Date ? cell.toLocaleString() : String(cell).replace(/"/g, '""');
        if (cell.search(/("|,|\n)/g) >= 0) {
          cell = `"${cell}"`;
        }
        return cell;
      }).join(separator);
    }).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function ShapBars({ reasons }) {
  if (!reasons || reasons.length === 0) return null;
  const maxImpact = Math.max(...reasons.map((r) => r.impact || 0), 0.3);
  return (
    <div className="space-y-2">
      {reasons.map((r, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground truncate">{getShapLabel(r.feature || r.reason)}</span>
            <span className="font-mono-data font-medium">+{(r.impact || 0).toFixed(2)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${getImpactColor(r.impact)}`}
              style={{ width: `${((r.impact || 0) / maxImpact) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TransactionDetail({ txn, onClose }) {
  const [explanation, setExplanation] = useState(null);

  useEffect(() => {
    if (txn?.id) {
      api.post(`/ml/explain/${txn.id}`, {})
        .then((res) => {
          // API returns { explanation: { reasons: [...] } } or { explanation: { transactionId, reasons } }
          const exp = res.data?.explanation || res.data;
          setExplanation(exp);
        })
        .catch(() => {});
    }
  }, [txn?.id]);

  if (!txn) return null;

  // Collect reasons from any available source
  const reasons = explanation?.reasons
    || explanation?.explanation?.reasons
    || txn.mlReasons
    || txn.fraudReasons
    || null;

  return (
    <Dialog open={!!txn} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between pr-10">
            <DialogTitle className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
              Transaction Detail
              <Badge variant="outline" className="font-mono-data text-[10px]">{txn.transactionId}</Badge>
            </DialogTitle>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1 mr-2" onClick={() => {
              const csvData = [{
                ID: txn.transactionId,
                Amount: txn.amount,
                Type: txn.type,
                Channel: txn.channel,
                Sender: txn.senderAccount?.accountHolder || "",
                SenderBank: txn.senderAccount?.bankName || "",
                Receiver: txn.receiverAccount?.accountHolder || "",
                ReceiverBank: txn.receiverAccount?.bankName || "",
                Timestamp: new Date(txn.timestamp).toLocaleString(),
                FraudScore: txn.fraudScore,
                Status: txn.status,
                Remarks: txn.description || ""
              }];
              exportToCSV(`transaction_${txn.transactionId}.csv`, csvData);
            }}>
              <Download className="h-3 w-3" /> Export CSV
            </Button>
          </div>
          <DialogDescription>Transaction details and ML fraud explanation</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Amount</p>
              <p className="font-mono-data font-semibold">{formatINR(txn.amount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fraud Score</p>
              <p className={`font-mono-data font-semibold ${getRiskColor(txn.fraudScore)}`}>
                {formatScore(txn.fraudScore)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Type / Channel</p>
              <p>{txn.type} · {txn.channel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time</p>
              <p>{formatDateTime(txn.timestamp)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sender</p>
              <p className="truncate">{txn.senderAccount?.accountHolder || "—"} ({txn.senderAccount?.bankName})</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Receiver</p>
              <p className="truncate">{txn.receiverAccount?.accountHolder || "—"} ({txn.receiverAccount?.bankName})</p>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-2">ML Explanation</h4>
            {reasons && reasons.length > 0 ? (
              <ShapBars reasons={reasons} />
            ) : (
              <p className="text-xs text-muted-foreground">No explanation available</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TransactionsPage() {
  const { transactions, pagination, loading, fetchTransactions, filters, setFilters } = useTransactionStore();
  const { isRunning, progress } = useSimulationStore();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions, filters]);

  const handlePageChange = (page) => {
    setFilters({ page });
  };

  const filteredTxns = transactions.filter((t) => {
    if (typeFilter !== "ALL" && t.type !== typeFilter) return false;
    if (search && !t.transactionId?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <Header title="Transactions" subtitle={`${pagination?.total || 0} transactions in the system`} />
      <div className="flex-1 space-y-4 p-5">
        {/* Simulation Progress */}
        {isRunning && progress && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-4 py-3">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
              <div className="flex-1">
                <Progress value={progress.percentage || 0} className="h-2" />
              </div>
              <div className="font-mono-data text-xs text-primary">
                {progress.processed}/{progress.total} · {progress.fraudCount} fraud · {progress.alertCount} alerts
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="NEFT">NEFT</SelectItem>
              <SelectItem value="IMPS">IMPS</SelectItem>
              <SelectItem value="RTGS">RTGS</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => {
            if (!transactions.length) return;
            const csvData = transactions.map(t => ({
              ID: t.transactionId,
              Amount: t.amount,
              Type: t.type,
              Channel: t.channel,
              Sender: t.senderAccount?.accountHolder || "",
              SenderBank: t.senderAccount?.bankName || "",
              Receiver: t.receiverAccount?.accountHolder || "",
              ReceiverBank: t.receiverAccount?.bankName || "",
              Timestamp: new Date(t.timestamp).toLocaleString(),
              FraudScore: t.fraudScore,
              Status: t.status,
              Remarks: t.description || ""
            }));
            exportToCSV("transactions_all.csv", csvData);
          }}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Sender → Receiver</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Remarks</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Time</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td colSpan={7} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      </tr>
                    ))
                  ) : filteredTxns.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No transactions found</td>
                    </tr>
                  ) : (
                    filteredTxns.map((txn) => (
                      <tr
                        key={txn.id}
                        className="border-b border-border/50 cursor-pointer transition-colors hover:bg-accent"
                        onClick={() => setSelected(txn)}
                      >
                        <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground">{txn.transactionId?.substring(0, 12)}…</td>
                        <td className="px-4 py-3 font-mono-data font-medium">{formatINR(txn.amount)}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{txn.type}</Badge></td>
                        <td className="px-4 py-3 text-xs truncate max-w-[200px]">
                          {txn.senderAccount?.accountHolder || "—"} → {txn.receiverAccount?.accountHolder || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground/70 italic truncate max-w-[140px]" title={txn.description}>{txn.description || "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(txn.timestamp)}</td>
                        <td className={`px-4 py-3 text-right font-mono-data font-semibold ${getRiskColor(txn.fraudScore)}`}>
                          {formatScore(txn.fraudScore)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Pagination */}
        {pagination && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <TransactionDetail txn={selected} onClose={() => setSelected(null)} />
      </div>
    </>
  );
}
