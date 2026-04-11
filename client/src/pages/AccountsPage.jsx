import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Search, Snowflake, ChevronLeft, ChevronRight } from "lucide-react";
import { formatINR, getRiskColor, getKycColor, formatDateTime } from "@/lib/formatters";
import api from "@/lib/api";
import useDashboardStore from "@/stores/dashboardStore";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kycFilter, setKycFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState(1);
  const fetchOverview = useDashboardStore((s) => s.fetchOverview);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/accounts?limit=15&page=${page}`);
      setAccounts(res.data || []);
      setPagination(res.meta?.pagination);
    } catch (err) {
      console.error("Fetch accounts error:", err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAccounts(); }, [page]);

  const openDetail = async (acct) => {
    setSelected(acct);
    try {
      const res = await api.get(`/accounts/${acct.id}/risk-profile`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    }
  };

  const handleFreeze = async (id) => {
    try {
      await api.put(`/accounts/${id}/freeze`, { reason: "Flagged during investigation" });
      fetchAccounts();
      fetchOverview();
      setSelected(null);
    } catch (err) {
      console.error("Freeze error:", err);
    }
  };

  const handleUnfreeze = async (id) => {
    try {
      await api.put(`/accounts/${id}/unfreeze`, { reason: "Cleared after review" });
      fetchAccounts();
      fetchOverview();
      setSelected(null);
    } catch (err) {
      console.error("Unfreeze error:", err);
    }
  };

  const filtered = accounts.filter((a) => {
    if (kycFilter !== "ALL" && a.kycType !== kycFilter) return false;
    if (search && !a.accountHolder?.toLowerCase().includes(search.toLowerCase()) && !a.accountNumber?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Convert riskFactors object from backend into displayable array
  const getRiskFactorsList = (rf) => {
    if (!rf) return [];
    const factors = [];
    if (rf.recentFraudCount > 0) factors.push(`${rf.recentFraudCount} fraudulent transaction(s) in last 30 days`);
    if (rf.totalAlerts > 0) factors.push(`${rf.totalAlerts} alert(s) generated`);
    if (rf.muleScore >= 0.5) factors.push(`High mule score: ${rf.muleScore.toFixed(2)}`);
    if (rf.kycRisk === "HIGH") factors.push("High KYC risk — Minimum KYC only");
    else if (rf.kycRisk === "MEDIUM") factors.push("Medium KYC risk — OTP-based KYC");
    if (rf.kycFlagged) factors.push("KYC verification flagged");
    if (rf.accountAgeDays !== undefined && rf.accountAgeDays < 30) factors.push(`New account (${rf.accountAgeDays} days old)`);
    if (factors.length === 0) factors.push("No significant risk factors detected");
    return factors;
  };

  return (
    <>
      <Header title="Accounts" subtitle={`${pagination?.total || 0} accounts in the system`} />
      <div className="flex-1 space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search accounts..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={kycFilter} onValueChange={setKycFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="KYC Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All KYC</SelectItem>
              <SelectItem value="FULL_KYC">Full KYC</SelectItem>
              <SelectItem value="OTP_BASED">OTP Based</SelectItem>
              <SelectItem value="MIN_KYC">Min KYC</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Holder</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Bank</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">KYC</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Balance</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Risk</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Mule</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50"><td colSpan={7} className="px-4 py-3"><Skeleton className="h-4" /></td></tr>
                    ))
                  ) : filtered.map((a) => (
                    <tr key={a.id} className="border-b border-border/50 cursor-pointer hover:bg-accent transition-colors" onClick={() => openDetail(a)}>
                      <td className="px-4 py-3 font-medium">{a.accountHolder}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.bankName}</td>
                      <td className="px-4 py-3"><span className={`text-xs font-medium ${getKycColor(a.kycType)}`}>{a.kycType?.replace(/_/g, " ")}</span></td>
                      <td className="px-4 py-3 font-mono-data">{formatINR(a.balance)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Progress value={(a.riskScore || 0) * 100} className="h-1.5 w-12" />
                          <span className={`font-mono-data text-xs ${getRiskColor(a.riskScore)}`}>{(a.riskScore || 0).toFixed(2)}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 font-mono-data text-xs ${getRiskColor(a.muleScore)}`}>{(a.muleScore || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {a.isFrozen ? <Badge variant="outline" className="text-sky-600 border-sky-600/30 text-[10px]">Frozen</Badge> : <Badge variant="outline" className="text-emerald-600 border-emerald-600/30 text-[10px]">Active</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {pagination && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {/* Detail Dialog */}
        {selected && (
          <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{selected.accountHolder}</DialogTitle>
                <DialogDescription>Account risk profile and KYC details</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-xs text-muted-foreground">Bank</p><p>{selected.bankName}</p></div>
                  <div><p className="text-xs text-muted-foreground">Account #</p><p className="font-mono-data">{selected.accountNumber}</p></div>
                  <div><p className="text-xs text-muted-foreground">Balance</p><p className="font-mono-data">{formatINR(selected.balance)}</p></div>
                  <div><p className="text-xs text-muted-foreground">KYC</p><p className={getKycColor(selected.kycType)}>{selected.kycType?.replace(/_/g, " ")}</p></div>
                </div>
                <Separator />
                {detail?.riskFactors && (
                  <div>
                    <h4 className="text-xs font-medium mb-2 text-muted-foreground">Risk Factors</h4>
                    <div className="space-y-1.5">
                      {getRiskFactorsList(detail.riskFactors).map((f, i) => (
                        <p key={i} className={`text-xs px-2 py-1 rounded ${f.includes("No significant") ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>{f}</p>
                      ))}
                    </div>
                  </div>
                )}
                {detail?.transactionStats && (
                  <div>
                    <h4 className="text-xs font-medium mb-2 text-muted-foreground">Transaction Stats</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground">Sent</p>
                        <p className="font-mono-data font-medium">{detail.transactionStats.sent?.count || 0} txns</p>
                        <p className="font-mono-data text-muted-foreground">{formatINR(detail.transactionStats.sent?.totalAmount || 0)}</p>
                      </div>
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground">Received</p>
                        <p className="font-mono-data font-medium">{detail.transactionStats.received?.count || 0} txns</p>
                        <p className="font-mono-data text-muted-foreground">{formatINR(detail.transactionStats.received?.totalAmount || 0)}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  {selected.isFrozen ? (
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => handleUnfreeze(selected.id)}>
                      <Snowflake className="h-3.5 w-3.5" /> Unfreeze
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" className="flex-1 gap-1.5" onClick={() => handleFreeze(selected.id)}>
                      <Snowflake className="h-3.5 w-3.5" /> Freeze Account
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </>
  );
}
