import { useEffect, useState, useCallback, useRef } from "react";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Play, Snowflake, ShieldAlert, Network as NetworkIcon, AlertTriangle } from "lucide-react";
import { formatINR, formatINRCompact, getKycColor, getRiskColor } from "@/lib/formatters";
import api from "@/lib/api";
import useDashboardStore from "@/stores/dashboardStore";

export default function NetworkPage() {
  const [view, setView] = useState("fund-flow");
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [accountDetail, setAccountDetail] = useState(null);
  const [freezeResult, setFreezeResult] = useState(null);
  const [rings, setRings] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [animatedEdges, setAnimatedEdges] = useState([]);
  const canvasRef = useRef(null);
  const fetchOverview = useDashboardStore((s) => s.fetchOverview);

  useEffect(() => {
    api.get("/accounts?limit=50").then((r) => setAccounts(r.data || []));
  }, []);

  const loadFundFlow = useCallback(async (accountId) => {
    if (!accountId) return;
    setSelectedAccountId(accountId);
    try {
      const [flowRes, detailRes] = await Promise.all([
        api.get(`/graph/fund-flow/${accountId}?hops=2`, { timeout: 30000 }),
        api.get(`/accounts/${accountId}/risk-profile`),
      ]);
      setGraphData(flowRes.data);
      setAccountDetail(detailRes.data);
      setFreezeResult(null);
      setAnimatedEdges([]);
    } catch (err) {
      console.error("Graph fetch error:", err);
    }
  }, []);

  const loadMuleNetwork = useCallback(async () => {
    try {
      const res = await api.get("/dashboard/mule-network?minScore=0.3");
      setGraphData(res.data);
      setAccountDetail(null);
    } catch (err) {
      console.error("Mule network error:", err);
    }
  }, []);

  const loadRings = useCallback(async () => {
    try {
      const res = await api.get("/graph/rings");
      setRings(res.data);
    } catch (err) {
      console.error("Ring detection error:", err);
    }
  }, []);

  const handleFreezeSimulate = async () => {
    if (!selectedAccountId) return;
    try {
      const res = await api.post(`/graph/freeze-simulate/${selectedAccountId}`, {});
      setFreezeResult(res.data);
    } catch (err) {
      console.error("Freeze simulate error:", err);
    }
  };

  const handleFreeze = async () => {
    if (!selectedAccountId) return;
    try {
      await api.put(`/accounts/${selectedAccountId}/freeze`, { reason: "Flagged via network investigation" });
      fetchOverview();
      if (accountDetail) setAccountDetail({ ...accountDetail, account: { ...accountDetail.account, isFrozen: true } });
    } catch (err) {
      console.error("Freeze error:", err);
    }
  };

  const animateFlow = () => {
    if (!graphData?.edges || graphData.edges.length === 0) return;
    setAnimating(true);
    setAnimatedEdges([]);
    const sortedEdges = [...graphData.edges].sort(
      (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
    );
    let i = 0;
    const timer = setInterval(() => {
      if (i >= sortedEdges.length) {
        clearInterval(timer);
        setAnimating(false);
        return;
      }
      const edgeId = sortedEdges[i]?.id || `edge-${i}`;
      setAnimatedEdges((prev) => [...prev, edgeId]);
      i++;
    }, 500);
  };

  useEffect(() => {
    if (view === "mule-network") loadMuleNetwork();
    else if (selectedAccountId) loadFundFlow(selectedAccountId);
  }, [view, loadMuleNetwork, loadFundFlow, selectedAccountId]);

  useEffect(() => { loadRings(); }, [loadRings]);

  // Render graph on canvas
  useEffect(() => {
    if (!canvasRef.current || !graphData) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // HiDPI fix: scale canvas for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.offsetWidth;
    const displayH = canvas.offsetHeight;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayW, displayH);

    const nodes = graphData.nodes || [];
    const edges = graphData.edges || [];
    if (nodes.length === 0) return;

    // Assign positions (circle layout)
    const cx = displayW / 2, cy = displayH / 2;
    const radius = Math.min(displayW, displayH) / 2.8;
    const nodeRadius = 16;
    const nodePositions = {};
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      nodePositions[n.id] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        ...n,
      };
    });

    // Helper: draw arrowhead
    const drawArrow = (fromX, fromY, toX, toY, color, lineWidth) => {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;
      const ux = dx / len;
      const uy = dy / len;

      // Stop arrow at node boundary
      const endX = toX - ux * (nodeRadius + 4);
      const endY = toY - uy * (nodeRadius + 4);
      const startX = fromX + ux * (nodeRadius + 2);
      const startY = fromY + uy * (nodeRadius + 2);

      // Draw line
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      // Draw arrowhead
      const arrowSize = 10;
      const arrowAngle = Math.PI / 7;
      const angle = Math.atan2(endY - startY, endX - startX);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowSize * Math.cos(angle - arrowAngle),
        endY - arrowSize * Math.sin(angle - arrowAngle)
      );
      ctx.lineTo(
        endX - arrowSize * Math.cos(angle + arrowAngle),
        endY - arrowSize * Math.sin(angle + arrowAngle)
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    // Draw edges with arrows
    edges.forEach((e, idx) => {
      const src = nodePositions[e.sourceAccountId];
      const tgt = nodePositions[e.targetAccountId];
      if (!src || !tgt) return;

      const isAnimated = animatedEdges.includes(e.id || `edge-${idx}`);
      const isActive = animatedEdges.length === 0 || isAnimated;

      const color = isAnimated
        ? "#4f46e5"
        : isActive ? "rgba(100, 100, 120, 0.45)" : "rgba(100, 100, 120, 0.15)";
      const lineWidth = isAnimated ? 2.5 : 1.5;

      drawArrow(src.x, src.y, tgt.x, tgt.y, color, lineWidth);

      // Edge amount label with background pill
      if (e.amount) {
        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        const label = formatINRCompact(e.amount);
        ctx.font = "600 11px 'Geist Variable', sans-serif";
        const textW = ctx.measureText(label).width;

        // Pill background
        const px = 5, py = 3;
        ctx.fillStyle = isAnimated ? "rgba(79, 70, 229, 0.12)" : "rgba(0, 0, 0, 0.05)";
        ctx.beginPath();
        ctx.roundRect(mx - textW / 2 - px, my - 7 - py, textW + px * 2, 14 + py * 2, 6);
        ctx.fill();

        // Text
        ctx.fillStyle = isAnimated ? "#4338ca" : "#555";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, mx, my);
        ctx.textBaseline = "alphabetic";
      }
    });

    // Draw nodes
    Object.values(nodePositions).forEach((n) => {
      const risk = n.riskScore || n.muleScore || 0;
      const isMule = (n.muleScore || 0) >= 0.5;
      const isFrozen = n.isFrozen;
      const isSelected = n.id === selectedAccountId;
      const r = isSelected ? 18 : nodeRadius;

      // Node shape
      ctx.beginPath();
      if (isMule && view === "mule-network") {
        const s = r;
        ctx.moveTo(n.x, n.y - s);
        ctx.lineTo(n.x + s, n.y);
        ctx.lineTo(n.x, n.y + s);
        ctx.lineTo(n.x - s, n.y);
        ctx.closePath();
      } else {
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      }

      // Fill color based on risk
      let fill = "#6366f1";
      if (risk >= 0.8) fill = "#dc2626";
      else if (risk >= 0.6) fill = "#ea580c";
      else if (risk >= 0.4) fill = "#d97706";
      if (isFrozen) fill = "#2563eb";

      ctx.fillStyle = fill;
      ctx.fill();

      // White border for selected
      if (isSelected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = fill;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Node initials (first letter)
      const initials = (n.accountHolder || "?").charAt(0).toUpperCase();
      ctx.font = "bold 12px 'Geist Variable', sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials, n.x, n.y);
      ctx.textBaseline = "alphabetic";

      // Name label below node
      const isDarkMode = document.documentElement.classList.contains("dark");
      ctx.font = "600 11px 'Geist Variable', sans-serif";
      ctx.fillStyle = isDarkMode ? "#e2e8f0" : "#1e1e2e";
      ctx.textAlign = "center";
      ctx.fillText(n.accountHolder || n.accountNumber || "", n.x, n.y + r + 14);
      ctx.font = "10px 'Geist Variable', sans-serif";
      ctx.fillStyle = isDarkMode ? "#94a3b8" : "#888";
      ctx.fillText(n.bankName || "", n.x, n.y + r + 26);
    });

    // Handle click on node
    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left);
      const my = (e.clientY - rect.top);
      for (const n of Object.values(nodePositions)) {
        const dist = Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2);
        if (dist < 20) {
          loadFundFlow(n.id);
          return;
        }
      }
    };
    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [graphData, animatedEdges, selectedAccountId, view, loadFundFlow]);

  const acctInfo = accountDetail?.account || accountDetail;

  return (
    <>
      <Header title="Investigation Network" subtitle="Trace fund flows and detect fraud rings" />
      <div className="flex-1 flex flex-col gap-4 p-5">
        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="fund-flow">Fund Flow</TabsTrigger>
              <TabsTrigger value="mule-network">Mule Network</TabsTrigger>
            </TabsList>
          </Tabs>

          {view === "fund-flow" && (
            <Select value={selectedAccountId || ""} onValueChange={(v) => loadFundFlow(v)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select an account..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.accountHolder} ({a.bankName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {graphData?.edges?.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={animateFlow} disabled={animating}>
              <Play className="h-3.5 w-3.5" /> {animating ? "Animating..." : "Animate Flow"}
            </Button>
          )}
        </div>

        {/* Graph + Detail split */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 flex-1">
          {/* Canvas graph */}
          <Card className="lg:col-span-2 min-h-[400px]">
            <CardContent className="p-0 h-full">
              {graphData ? (
                <canvas
                  ref={canvasRef}
                  className="w-full h-full min-h-[400px] cursor-pointer"
                  style={{ touchAction: "none" }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <div className="text-center">
                    <NetworkIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>Select an account to visualize its fund flow</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Side panel */}
          <div className="space-y-4">
            {/* Account Detail */}
            {acctInfo && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Account Detail</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Holder</span>
                    <span className="font-medium">{acctInfo.accountHolder}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Bank</span>
                    <span>{acctInfo.bankName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Risk Score</span>
                    <span className={`font-mono-data font-semibold ${getRiskColor(acctInfo.riskScore)}`}>
                      {(acctInfo.riskScore || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Mule Score</span>
                    <span className={`font-mono-data font-semibold ${getRiskColor(acctInfo.muleScore)}`}>
                      {(acctInfo.muleScore || 0).toFixed(2)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">KYC Type</span>
                    <span className={getKycColor(acctInfo.kycType)}>{acctInfo.kycType?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">KYC Flag</span>
                    <span>{acctInfo.kycFlagged ? "🔴 Flagged" : "🟢 OK"}</span>
                  </div>
                  {acctInfo.kycFlagReason && (
                    <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      {acctInfo.kycFlagReason}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Aadhaar</span>
                    <span>{acctInfo.aadhaarLinked ? "✅" : "❌"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">PAN</span>
                    <span>{acctInfo.panLinked ? "✅" : "❌"}</span>
                  </div>
                  <Separator />
                  <div className="flex gap-2">
                    <Button size="sm" variant={acctInfo.isFrozen ? "outline" : "destructive"} className="flex-1 gap-1.5" onClick={handleFreeze} disabled={acctInfo.isFrozen}>
                      <Snowflake className="h-3.5 w-3.5" /> {acctInfo.isFrozen ? "Frozen" : "Freeze"}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={handleFreezeSimulate}>
                      <AlertTriangle className="h-3.5 w-3.5" /> Simulate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Freeze Simulation Result */}
            {freezeResult && (
              <Card className="border-warning/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-warning" /> Freeze Impact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Blocked Outgoing</span>
                    <span className="font-mono-data font-semibold">{formatINRCompact(freezeResult.impact?.outgoingBlockedAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Blocked Incoming</span>
                    <span className="font-mono-data font-semibold">{formatINRCompact(freezeResult.impact?.incomingBlockedAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Affected Txns</span>
                    <span className="font-mono-data font-semibold">{freezeResult.impact?.affectedTransactionCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Downstream Accounts</span>
                    <span className="font-mono-data font-semibold">{freezeResult.impact?.downstreamAccountsAffected || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recommendation</span>
                    <Badge variant={freezeResult.recommendation === "FREEZE_RECOMMENDED" ? "destructive" : "outline"}>
                      {freezeResult.recommendation?.replace(/_/g, " ") || "REVIEW"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rings */}
            {rings?.rings?.length > 0 && (
              <Card className="border-destructive/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-destructive" /> Fraud Rings Detected
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="text-muted-foreground mb-2">{rings.rings.length} ring(s) found</p>
                  {rings.rings.slice(0, 3).map((ring, i) => (
                    <div key={ring.ringId || i} className="text-xs bg-destructive/10 p-2 rounded mb-1.5">
                      {ring.ringId || `Ring ${i + 1}`}: {ring.size || ring.accounts?.length || 0} accounts
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
