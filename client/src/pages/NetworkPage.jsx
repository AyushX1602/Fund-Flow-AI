import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Play, Snowflake, ShieldAlert, Network as NetworkIcon,
  AlertTriangle, Loader2, ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import { formatINRCompact, getKycColor, getRiskColor } from "@/lib/formatters";
import api from "@/lib/api";
import useDashboardStore from "@/stores/dashboardStore";

// ─── Palette — soft, muted tones for a clean dark-mode look ──────────────
const PALETTE = {
  root:     "#a78bfa",  // violet-400
  safe:     "#64748b",  // slate-500
  medium:   "#fbbf24",  // amber-400
  high:     "#f97316",  // orange-500
  critical: "#ef4444",  // red-500
  frozen:   "#38bdf8",  // sky-400
  edgeLow:  "rgba(100,116,139,0.25)",   // very faint slate
  edgeMid:  "rgba(251,191,36,0.35)",    // faint amber
  edgeHigh: "rgba(239,68,68,0.40)",     // faint red
  particleLow:  "#94a3b8",
  particleMid:  "#fde68a",
  particleHigh: "#fca5a5",
};

function getNodeFill(node, rootId) {
  if (node.id === rootId) return PALETTE.root;
  if (node.isFrozen) return PALETTE.frozen;
  const r = Math.max(node.riskScore || 0, node.muleScore || 0);
  if (r >= 0.8) return PALETTE.critical;
  if (r >= 0.6) return PALETTE.high;
  if (r >= 0.35) return PALETTE.medium;
  return PALETTE.safe;
}

function getEdgeStyle(link) {
  const r = link.riskScore || 0;
  if (r >= 0.6) return { stroke: PALETTE.edgeHigh, particle: PALETTE.particleHigh };
  if (r >= 0.35) return { stroke: PALETTE.edgeMid, particle: PALETTE.particleMid };
  return { stroke: PALETTE.edgeLow, particle: PALETTE.particleLow };
}

// ─── Component ────────────────────────────────────────────────────────────
export default function NetworkPage() {
  const [view, setView] = useState("fund-flow");
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [accountDetail, setAccountDetail] = useState(null);
  const [freezeResult, setFreezeResult] = useState(null);
  const [rings, setRings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [revealedEdges, setRevealedEdges] = useState(null); // null = show all

  const graphRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const fetchOverview = useDashboardStore((s) => s.fetchOverview);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: Math.floor(width), height: Math.max(420, Math.floor(height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch accounts
  useEffect(() => {
    api.get("/accounts?limit=50").then((r) => setAccounts(r.data || []));
  }, []);

  // ─── Data Fetchers ──────────────────────────────────────────────────────
  const loadFundFlow = useCallback(async (accountId) => {
    if (!accountId) return;
    setSelectedAccountId(accountId);
    setLoading(true);
    setRevealedEdges(null);
    setErrorMsg(null);
    try {
      const [flowRes, detailRes] = await Promise.all([
        api.get(`/graph/fund-flow/${accountId}?hops=2&direction=both`, { timeout: 30000 }),
        api.get(`/accounts/${accountId}/risk-profile`),
      ]);
      setGraphData(flowRes.data);
      setAccountDetail(detailRes.data);
      setFreezeResult(null);
    } catch (err) {
      console.error("Graph fetch error:", err);
      setErrorMsg(err.response?.data?.error?.message || err.message || "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMuleNetwork = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get("/dashboard/mule-network?minScore=0.3");
      setGraphData(res.data);
      setAccountDetail(null);
    } catch (err) {
      console.error("Mule network error:", err);
      setErrorMsg(err.response?.data?.error?.message || err.message || "Failed to load network");
    } finally {
      setLoading(false);
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

  // ─── Animate Flow ───────────────────────────────────────────────────────
  const animateFlow = useCallback(() => {
    if (!graphData?.edges || graphData.edges.length === 0) return;
    setAnimating(true);
    setRevealedEdges(new Set());

    const sortedEdges = [...graphData.edges].sort(
      (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
    );
    let i = 0;
    const timer = setInterval(() => {
      if (i >= sortedEdges.length) {
        clearInterval(timer);
        setAnimating(false);
        setRevealedEdges(null);
        return;
      }
      setRevealedEdges((prev) => new Set([...prev, sortedEdges[i]?.id || `edge-${i}`]));
      i++;
    }, 250);
    return () => clearInterval(timer);
  }, [graphData]);

  useEffect(() => {
    if (view === "mule-network") loadMuleNetwork();
    else if (selectedAccountId) loadFundFlow(selectedAccountId);
  }, [view, loadMuleNetwork, loadFundFlow, selectedAccountId]);

  useEffect(() => { loadRings(); }, [loadRings]);

  // ─── Transform API → force-graph format ─────────────────────────────────
  // Deduplicate edges between the same pair → keep highest risk
  const forceGraphData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };
    const nodesRaw = graphData.nodes || [];
    const edgesRaw = graphData.edges || [];

    const nodeMap = new Map();
    nodesRaw.forEach((n) => nodeMap.set(n.id, n));
    edgesRaw.forEach((e) => {
      if (!nodeMap.has(e.sourceAccountId))
        nodeMap.set(e.sourceAccountId, { id: e.sourceAccountId, ...(e.sourceAccount || {}), hop: 99 });
      if (!nodeMap.has(e.targetAccountId))
        nodeMap.set(e.targetAccountId, { id: e.targetAccountId, ...(e.targetAccount || {}), hop: 99 });
    });

    // Aggregate edges: for each (source→target), keep one link with sum amount & max risk
    const edgeKey = (s, t) => `${s}→${t}`;
    const aggregated = new Map();
    edgesRaw.forEach((e, idx) => {
      const key = edgeKey(e.sourceAccountId, e.targetAccountId);
      const existing = aggregated.get(key);
      const risk = e.riskScore || e.transaction?.fraudScore || 0;
      const amount = e.amount ? Number(e.amount) : 0;
      if (!existing) {
        aggregated.set(key, {
          source: e.sourceAccountId,
          target: e.targetAccountId,
          amount,
          riskScore: risk,
          count: 1,
          id: e.id || `edge-${idx}`,
        });
      } else {
        existing.amount += amount;
        existing.riskScore = Math.max(existing.riskScore, risk);
        existing.count += 1;
      }
    });

    return {
      nodes: Array.from(nodeMap.values()),
      links: Array.from(aggregated.values()),
    };
  }, [graphData]);

  // Center graph after data loads
  useEffect(() => {
    if (forceGraphData.nodes.length > 0 && graphRef.current) {
      setTimeout(() => graphRef.current.zoomToFit(600, 80), 900);
    }
  }, [forceGraphData]);

  // ─── Custom Node Renderer ──────────────────────────────────────────────
  // Clean, minimal circles with subtle rings — no big glowing halos
  const drawNode = useCallback((node, ctx, globalScale) => {
    if (typeof node.x !== "number" || typeof node.y !== "number") return;

    const fill = getNodeFill(node, selectedAccountId);
    const isRoot = node.id === selectedAccountId;
    const isHovered = hoveredNode?.id === node.id;
    const r = isRoot ? 6 : 4.5;

    // Subtle outer ring (only for root or hovered)
    if (isRoot || isHovered) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 3, 0, 2 * Math.PI);
      ctx.strokeStyle = fill;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Frozen dashed ring
    if (node.isFrozen && !isRoot) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 2.5, 0, 2 * Math.PI);
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = PALETTE.frozen;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();

    // Thin border
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Initial letter (only when zoomed enough)
    if (globalScale > 1.5 || isRoot || isHovered) {
      const initial = (node.accountHolder || "?").charAt(0).toUpperCase();
      const fontSize = Math.max(3, r * 1.1);
      ctx.font = `600 ${fontSize}px 'Geist Variable', Inter, sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initial, node.x, node.y + 0.3);
    }

    // Labels — only on hover or root, and only when zoomed in
    if ((isHovered || isRoot) && globalScale > 0.8) {
      const name = node.accountHolder || "";
      const fontSize = Math.max(2.5, 8 / globalScale);

      // Name with subtle backdrop
      ctx.font = `500 ${fontSize}px 'Geist Variable', Inter, sans-serif`;
      const tw = ctx.measureText(name).width;
      const py = 1.5, px = 3;
      const labelY = node.y + r + fontSize + 3;

      ctx.fillStyle = "rgba(15,23,42,0.75)";
      ctx.beginPath();
      ctx.roundRect(node.x - tw / 2 - px, labelY - fontSize / 2 - py, tw + px * 2, fontSize + py * 2, 3);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, node.x, labelY);
    }
  }, [selectedAccountId, hoveredNode]);

  // ─── Custom Link Renderer ─────────────────────────────────────────────
  // Thin, elegant curved lines with small arrowheads
  const drawLink = useCallback((link, ctx, globalScale) => {
    if (revealedEdges !== null && !revealedEdges.has(link.id)) return;

    const s = link.source;
    const t = link.target;
    if (!s || !t || typeof s.x !== "number" || typeof t.x !== "number" ||
        typeof s.y !== "number" || typeof t.y !== "number") return;

    const { stroke } = getEdgeStyle(link);
    const isHighRisk = (link.riskScore || 0) >= 0.5;

    // Curved line via quadratic bezier (slight curve to avoid overlap)
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) return;

    // Perpendicular offset for curve (proportional to length, capped)
    const curvature = Math.min(12, len * 0.08);
    const mx = (s.x + t.x) / 2 + (-dy / len) * curvature;
    const my = (s.y + t.y) / 2 + (dx / len) * curvature;

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.quadraticCurveTo(mx, my, t.x, t.y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isHighRisk ? 1 : 0.5;
    ctx.stroke();

    // Small arrowhead at target
    const arrowLen = 3.5;
    const nodeR = t.id === selectedAccountId ? 8 : 6;
    // Approximate tangent at end of bezier
    const tangX = t.x - mx;
    const tangY = t.y - my;
    const tangLen = Math.sqrt(tangX * tangX + tangY * tangY);
    if (tangLen < 1) return;
    const ux = tangX / tangLen;
    const uy = tangY / tangLen;
    const tipX = t.x - ux * nodeR;
    const tipY = t.y - uy * nodeR;
    const angle = Math.atan2(uy, ux);
    const spread = Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - arrowLen * Math.cos(angle - spread), tipY - arrowLen * Math.sin(angle - spread));
    ctx.lineTo(tipX - arrowLen * Math.cos(angle + spread), tipY - arrowLen * Math.sin(angle + spread));
    ctx.closePath();
    ctx.fillStyle = stroke;
    ctx.globalAlpha = isHighRisk ? 0.8 : 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Amount label — only when zoomed in significantly AND hovered or high-risk
    if (globalScale > 2.5 && link.amount) {
      const label = formatINRCompact(link.amount);
      const fontSize = Math.max(2.5, 7 / globalScale);
      ctx.font = `500 ${fontSize}px 'Geist Variable', Inter, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, mx, my);
    }
  }, [revealedEdges, selectedAccountId]);

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((node) => {
    if (node.id !== selectedAccountId) loadFundFlow(node.id);
  }, [selectedAccountId, loadFundFlow]);

  const handleZoomIn = () => graphRef.current?.zoom(graphRef.current.zoom() * 1.5, 300);
  const handleZoomOut = () => graphRef.current?.zoom(graphRef.current.zoom() * 0.65, 300);
  const handleFit = () => graphRef.current?.zoomToFit(400, 70);

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
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={animateFlow} disabled={animating}>
                <Play className="h-3.5 w-3.5" /> {animating ? "Animating..." : "Replay Flow"}
              </Button>
              <div className="flex items-center gap-1 ml-auto">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFit}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Graph + Side panel */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 flex-1">
          {/* Force Graph */}
          <Card className="lg:col-span-2 min-h-[500px] overflow-hidden relative">
            <CardContent className="p-0 h-full" ref={containerRef}>
              {loading && !errorMsg && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 backdrop-blur-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}

              {errorMsg && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 backdrop-blur-sm">
                  <div className="text-center text-destructive">
                    <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-80" />
                    <p className="font-semibold">Error Loading Graph</p>
                    <p className="text-sm opacity-80">{errorMsg}</p>
                  </div>
                </div>
              )}

              {graphData && forceGraphData.nodes.length > 0 && !errorMsg ? (
                <ForceGraph2D
                  ref={graphRef}
                  graphData={forceGraphData}
                  width={dimensions.width}
                  height={dimensions.height}
                  backgroundColor="transparent"
                  // Physics — spread nodes out more
                  d3AlphaDecay={0.025}
                  d3VelocityDecay={0.3}
                  cooldownTicks={200}
                  warmupTicks={80}
                  d3AlphaMin={0.005}
                  // Increase repulsion so nodes don't pile up
                  dagMode={null}
                  // Node rendering
                  nodeCanvasObject={drawNode}
                  nodeRelSize={5}
                  nodeVal={(n) => (n.id === selectedAccountId ? 4 : 1.5)}
                  // Link rendering — use custom draw, disable built-in
                  linkCanvasObject={drawLink}
                  linkWidth={0}
                  linkColor={() => "transparent"}
                  // Particles — very subtle, only 1-2 per edge
                  linkDirectionalParticles={(link) => {
                    if (revealedEdges !== null && !revealedEdges.has(link.id)) return 0;
                    return (link.riskScore || 0) >= 0.5 ? 2 : 1;
                  }}
                  linkDirectionalParticleWidth={1.5}
                  linkDirectionalParticleSpeed={0.004}
                  linkDirectionalParticleColor={(link) => {
                    if (revealedEdges !== null && !revealedEdges.has(link.id)) return "rgba(0,0,0,0)";
                    return getEdgeStyle(link).particle;
                  }}
                  // Interaction
                  onNodeClick={handleNodeClick}
                  onNodeHover={setHoveredNode}
                  nodePointerAreaPaint={(node, color, ctx) => {
                    if (typeof node.x !== "number" || typeof node.y !== "number") return;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI);
                    ctx.fillStyle = color;
                    ctx.fill();
                  }}
                  enableZoomInteraction
                  enablePanInteraction
                />
              ) : !loading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground min-h-[500px]">
                  <motion.div
                    className="text-center"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <NetworkIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p className="text-base">Select an account to visualize its fund flow</p>
                    <p className="text-xs mt-1 opacity-50">Nodes represent accounts · Edges represent transactions</p>
                  </motion.div>
                </div>
              ) : null}

              {/* Legend */}
              {graphData && forceGraphData.nodes.length > 0 && (
                <motion.div
                  className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 text-[10px] font-medium"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                >
                  {[
                    { label: "Selected", color: PALETTE.root },
                    { label: "Low Risk", color: PALETTE.safe },
                    { label: "Medium", color: PALETTE.medium },
                    { label: "High", color: PALETTE.high },
                    { label: "Critical", color: PALETTE.critical },
                    { label: "Frozen", color: PALETTE.frozen },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1 bg-card/80 backdrop-blur-sm px-2 py-0.5 rounded-full border border-border/30">
                      <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: item.color }} />
                      {item.label}
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Stats */}
              {graphData && (
                <motion.div
                  className="absolute top-3 right-3 text-[10px] font-mono-data bg-card/80 backdrop-blur-sm px-2.5 py-1.5 rounded-md border border-border/30"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <span className="text-muted-foreground">Nodes </span>
                  <span className="font-semibold">{forceGraphData.nodes.length}</span>
                  <span className="mx-1.5 text-border/50">·</span>
                  <span className="text-muted-foreground">Edges </span>
                  <span className="font-semibold">{forceGraphData.links.length}</span>
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Side panel */}
          <div className="space-y-4">
            {/* Hover tooltip card */}
            <AnimatePresence>
              {hoveredNode && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.12 }}
                >
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-3 text-xs space-y-1">
                      <div className="font-semibold text-sm">{hoveredNode.accountHolder}</div>
                      <div className="text-muted-foreground">{hoveredNode.bankName} · {hoveredNode.accountNumber}</div>
                      <div className="flex gap-3 mt-1">
                        <span>Risk: <strong className={getRiskColor(hoveredNode.riskScore)}>{(hoveredNode.riskScore || 0).toFixed(2)}</strong></span>
                        <span>Mule: <strong className={getRiskColor(hoveredNode.muleScore)}>{(hoveredNode.muleScore || 0).toFixed(2)}</strong></span>
                      </div>
                      {hoveredNode.isFrozen && <Badge variant="secondary" className="text-[10px]">❄️ Frozen</Badge>}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Account Detail */}
            {acctInfo && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
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
              </motion.div>
            )}

            {/* Freeze Simulation Result */}
            <AnimatePresence>
              {freezeResult && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
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
                </motion.div>
              )}
            </AnimatePresence>

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
                  {rings.rings.slice(0, 5).map((ring, i) => (
                    <div key={ring.ringId || i} className="text-xs bg-destructive/10 p-2 rounded mb-1.5 flex items-center justify-between">
                      <span>{ring.ringId || `Ring ${i + 1}`}: {ring.size || ring.accounts?.length || 0} accounts</span>
                      <span className="font-mono-data text-destructive">{(ring.avgRiskScore || 0).toFixed(2)}</span>
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
