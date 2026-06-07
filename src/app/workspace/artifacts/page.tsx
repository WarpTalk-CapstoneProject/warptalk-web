"use client";

import { useMemo, useState } from "react";
import { Bot, Check, Download, FilePenLine, LockKeyhole, Save, Search, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { workspaceArtifacts } from "@/lib/workspace-preview";

const permissionOptions = ["Workspace managers", "Meeting participants", "Leadership", "Operations", "Product", "All workspace members"];

export default function WorkspaceArtifactsPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(workspaceArtifacts[0].id);
  const [transcripts, setTranscripts] = useState<Record<string, string>>(
    Object.fromEntries(workspaceArtifacts.map((artifact) => [artifact.id, artifact.transcript])),
  );
  const [access, setAccess] = useState<Record<string, string[]>>(
    Object.fromEntries(workspaceArtifacts.map((artifact) => [artifact.id, artifact.access])),
  );

  const visibleArtifacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return workspaceArtifacts.filter((artifact) => !normalized || [artifact.meeting, artifact.department, artifact.date].some((value) => value.toLowerCase().includes(normalized)));
  }, [query]);
  const selected = workspaceArtifacts.find((artifact) => artifact.id === selectedId) ?? workspaceArtifacts[0];

  function toggleAccess(value: string) {
    setAccess((current) => {
      const selectedAccess = current[selected.id] ?? [];
      return { ...current, [selected.id]: selectedAccess.includes(value) ? selectedAccess.filter((item) => item !== value) : [...selectedAccess, value] };
    });
  }

  function downloadTranscript() {
    const blob = new Blob([transcripts[selected.id]], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selected.meeting.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-transcript.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-full flex-col gap-3 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meeting transcripts</h1>
          <p className="text-sm text-muted-foreground">Review, edit, finalize, download, and control access to every meeting artifact.</p>
        </div>
        <Badge variant="outline" className="rounded-full bg-white">{workspaceArtifacts.length} retained meetings</Badge>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[330px_minmax(0,1fr)_300px]">
        <Card className="min-h-0 overflow-hidden rounded-3xl border-white/70 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <CardHeader className="border-b p-4">
            <CardTitle className="text-base">Meeting library</CardTitle>
            <div className="relative pt-2">
              <Search className="absolute left-3 top-[calc(50%+4px)] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search meetings..." className="h-9 rounded-xl bg-white pl-9" />
            </div>
          </CardHeader>
          <CardContent className="max-h-[620px] space-y-2 overflow-y-auto p-3">
            {visibleArtifacts.map((artifact) => (
              <button key={artifact.id} onClick={() => setSelectedId(artifact.id)} className={`w-full rounded-2xl border p-3 text-left transition ${selected.id === artifact.id ? "border-neutral-950 bg-neutral-950 text-white" : "bg-white hover:border-neutral-400"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{artifact.meeting}</p>
                  <Badge variant="outline" className={`shrink-0 rounded-full text-[10px] ${selected.id === artifact.id ? "border-white/20 text-white" : ""}`}>{artifact.status}</Badge>
                </div>
                <p className={`mt-1 text-xs ${selected.id === artifact.id ? "text-white/60" : "text-muted-foreground"}`}>{artifact.department} · {artifact.date}</p>
                <p className={`mt-2 text-xs ${selected.id === artifact.id ? "text-white/60" : "text-muted-foreground"}`}>{artifact.duration} · {artifact.languageRoute}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="min-h-0 overflow-hidden rounded-3xl border-white/70 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b p-4">
            <div><CardTitle className="text-base">{selected.meeting}</CardTitle><p className="text-xs text-muted-foreground">{selected.date} · {selected.duration} · {selected.languageRoute}</p></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={downloadTranscript}><Download /> Download</Button>
              <Button size="sm" className="rounded-xl bg-neutral-950 text-white hover:bg-neutral-800" onClick={() => toast.success("Transcript changes saved to the workspace preview.")}><Save /> Save transcript</Button>
            </div>
          </CardHeader>
          <CardContent className="flex h-[calc(100%-73px)] min-h-[470px] flex-col p-4">
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-neutral-100 px-3 py-2">
              <div className="flex items-center gap-2"><FilePenLine className="h-4 w-4" /><span className="text-sm font-medium">Editable final transcript</span></div>
              <span className="text-xs text-muted-foreground">Changes are stored per meeting</span>
            </div>
            <Textarea
              value={transcripts[selected.id]}
              onChange={(event) => setTranscripts((current) => ({ ...current, [selected.id]: event.target.value }))}
              className="min-h-0 flex-1 resize-none rounded-2xl bg-white p-4 font-mono text-sm leading-6"
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card className="rounded-3xl border-white/70 bg-white/88">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><LockKeyhole className="h-5 w-5" />Document access</CardTitle><p className="text-xs text-muted-foreground">Choose who can open or download this meeting.</p></CardHeader>
            <CardContent className="space-y-2">
              {permissionOptions.map((permission) => (
                <label key={permission} className="flex cursor-pointer items-center gap-2 rounded-xl border bg-white p-2.5 text-sm">
                  <Checkbox checked={(access[selected.id] ?? []).includes(permission)} onCheckedChange={() => toggleAccess(permission)} />
                  <span className="flex-1">{permission}</span>
                  {(access[selected.id] ?? []).includes(permission) && <Check className="h-3.5 w-3.5" />}
                </label>
              ))}
            </CardContent>
          </Card>

          <Card
            className="workspace-dark-card rounded-3xl border-white/70 bg-neutral-950 text-white"
            style={{ backgroundColor: "#0a0a0a" }}
          >
            <CardContent className="p-4">
              <Bot className="h-5 w-5" />
              <p className="mt-3 font-medium">Analyze with Workspace AI</p>
              <p className="mt-1 text-xs leading-5 text-white/60">Attach this final transcript to a manager-only AI conversation.</p>
              <Button className="mt-3 w-full rounded-xl bg-white text-neutral-950 hover:bg-white/90" onClick={() => { sessionStorage.setItem("workspace-ai-context", selected.meeting); window.location.href = "/workspace/ai-chat"; }}>
                <Send /> Open in AI Chat
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
