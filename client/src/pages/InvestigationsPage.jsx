import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, FileSearch, MessageSquare, Check } from "lucide-react";
import { formatRelativeTime, getAlertTypeName } from "@/lib/formatters";
import api from "@/lib/api";

export default function InvestigationsPage() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newCase, setNewCase] = useState({ title: "", description: "", priority: "HIGH" });
  const [createError, setCreateError] = useState("");

  const fetchCases = async () => {
    setLoading(true);
    try {
      const res = await api.get("/investigations?limit=50");
      setCases(res.data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCases(); }, []);

  const openDetail = async (c) => {
    setSelected(c);
    try {
      const res = await api.get(`/investigations/${c.id}`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    }
  };

  const createCase = async () => {
    setCreateError("");
    try {
      await api.post("/investigations", newCase);
      setShowCreate(false);
      setNewCase({ title: "", description: "", priority: "HIGH" });
      fetchCases();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to create case";
      setCreateError(msg);
      console.error(err);
    }
  };

  const addNote = async () => {
    if (!noteText.trim() || !selected) return;
    try {
      await api.post(`/investigations/${selected.id}/notes`, { content: noteText });
      setNoteText("");
      openDetail(selected);
    } catch (err) {
      console.error(err);
    }
  };

  const closeCase = async () => {
    if (!selected) return;
    try {
      await api.put(`/investigations/${selected.id}/close`, { findings: "Investigation completed — fraud confirmed", status: "CLOSED_FRAUD" });
      fetchCases();
      setSelected(null);
    } catch (err) {
      console.error(err);
    }
  };

  const statusColor = (s) => {
    if (s === "OPEN") return "text-blue-600";
    if (s === "IN_PROGRESS") return "text-amber-600";
    if (s?.startsWith("CLOSED")) return "text-emerald-600";
    return "text-muted-foreground";
  };

  return (
    <>
      <Header title="Investigations" subtitle="Case management & analysis" />
      <div className="flex-1 space-y-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{cases.length} investigation(s)</p>
          <Button size="sm" className="gap-1.5" onClick={() => { setShowCreate(true); setCreateError(""); }}>
            <Plus className="h-3.5 w-3.5" /> New Case
          </Button>
        </div>

        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-12" /></CardContent></Card>
            ))
          ) : cases.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground"><FileSearch className="h-10 w-10 mx-auto mb-2 opacity-30" />No investigations yet</CardContent></Card>
          ) : (
            cases.map((c) => (
              <Card key={c.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => openDetail(c)}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-data text-xs text-muted-foreground">{c.caseNumber}</span>
                      <Badge variant="outline" className={`text-[10px] ${statusColor(c.status)}`}>{c.status}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{c.priority}</Badge>
                    </div>
                    <p className="text-sm font-medium mt-0.5">{c.title}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(c.createdAt)}</span>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Detail Dialog */}
        {selected && detail && (
          <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
            <DialogContent className="max-w-lg max-h-[85vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono-data text-xs text-muted-foreground">{detail.caseNumber}</span>
                  {detail.title}
                </DialogTitle>
                <DialogDescription>Investigation details, linked alerts, and notes</DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 pr-4">
                  <p className="text-sm text-muted-foreground">{detail.description}</p>

                  {/* Linked Alerts */}
                  {detail.alerts?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">Linked Alerts ({detail.alerts.length})</h4>
                      {detail.alerts.map((a) => (
                        <div key={a.id} className="text-xs bg-muted/50 p-2 rounded mb-1 flex justify-between">
                          <span>{a.alertType || a.type || "Alert"} · {a.severity}</span>
                          <span className="text-muted-foreground">{a.status}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator />

                  {/* Notes */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Notes</h4>
                    {detail.notes?.length > 0 ? (
                      detail.notes.map((n) => (
                        <div key={n.id} className="text-sm border-l-2 border-primary/30 pl-3 mb-2">
                          <p>{n.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{formatRelativeTime(n.createdAt)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No notes yet</p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Input placeholder="Add a note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="text-sm" />
                      <Button size="sm" onClick={addNote} disabled={!noteText.trim()}>
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {!detail.closedAt && (
                    <Button size="sm" variant="default" className="w-full gap-1.5" onClick={closeCase}>
                      <Check className="h-3.5 w-3.5" /> Close as Fraud Confirmed
                    </Button>
                  )}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New Investigation</DialogTitle>
              <DialogDescription>Create a new fraud investigation case</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Case title" value={newCase.title} onChange={(e) => setNewCase({ ...newCase, title: e.target.value })} />
              <Input placeholder="Description" value={newCase.description} onChange={(e) => setNewCase({ ...newCase, description: e.target.value })} />
              {createError && (
                <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded">{createError}</p>
              )}
              <Button className="w-full" onClick={createCase} disabled={!newCase.title}>Create Case</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
