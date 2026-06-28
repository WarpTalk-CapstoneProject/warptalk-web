"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Robot,
  Download,
  FloppyDisk,
  MagnifyingGlass,
  PaperPlaneRight,
  Warning,
  Lock,
  Funnel
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Define structured mock artifacts matching backend retention schema
interface Artifact {
  id: string;
  meeting: string;
  department: string;
  date: string;
  duration: string;
  languageRoute: string;
  status: "Active" | "Expiring Soon" | "Deleted" | "Failed Cleanup";
  access: string[];
  transcript: string;
  retentionDaysLeft: number;
  containsRawAudio: boolean;
  externalParticipated: boolean;
}

const initialArtifacts: Artifact[] = [
  {
    id: "artifact-241",
    meeting: "Investor Q&A Translation",
    department: "Leadership",
    date: "Jun 07, 2026",
    duration: "58 min",
    languageRoute: "EN → VI, JA",
    status: "Active",
    access: ["Workspace managers", "Meeting participants"],
    transcript: `[09:32] Linh Nguyen (Host)\nWelcome everyone. Today we will review the investor rollout plan and the APAC launch timeline.\n\n[09:34] Mika Tanaka\nThe Japanese team needs the approved glossary before the next review session.\n\n[09:36] Linh Nguyen\nWe will attach the product terms and meeting notes after this call.`,
    retentionDaysLeft: 14,
    containsRawAudio: true,
    externalParticipated: true,
  },
  {
    id: "artifact-882",
    meeting: "Partner Sync Room",
    department: "APAC",
    date: "Jun 04, 2026",
    duration: "40 min",
    languageRoute: "VI → EN",
    status: "Expiring Soon",
    access: ["Workspace managers", "Meeting participants"],
    transcript: `[14:02] Mika Tanaka (Host)\nLet's coordinate on the localized terminology update.\n\n[14:15] Minh Tran\nWe have registered the glossaries. The translations should be synced now.`,
    retentionDaysLeft: 2,
    containsRawAudio: false,
    externalParticipated: true,
  },
  {
    id: "artifact-778",
    meeting: "Board Review Translation",
    department: "Leadership",
    date: "May 20, 2026",
    duration: "76 min",
    languageRoute: "EN → VI",
    status: "Deleted", // retention expired, download blocked, soft-deleted state
    access: ["Workspace managers"],
    transcript: `[Transcript block locked: retention period has expired for this board meeting.]`,
    retentionDaysLeft: 0,
    containsRawAudio: true,
    externalParticipated: false,
  },
  {
    id: "artifact-328",
    meeting: "Product Research Debrief",
    department: "Product",
    date: "May 18, 2026",
    duration: "44 min",
    languageRoute: "JA → EN",
    status: "Failed Cleanup", // failed cleanup retry option
    access: ["Workspace managers", "Product"],
    transcript: `[05:12] Error finalising background cleanup: scheduler process interrupted. Final transcript backup cached.`,
    retentionDaysLeft: -1,
    containsRawAudio: false,
    externalParticipated: false,
  },
];

const permissionOptions = [
  "Workspace managers",
  "Meeting participants",
  "Leadership",
  "Operations",
  "Product",
  "All workspace members"
];

export default function WorkspaceArtifactsPage() {
  const router = useRouter();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const currentRole = useWorkspaceStore((s) => s.role);
  const membershipType = useWorkspaceStore((s) => s.membershipType);

  const [artifacts, setArtifacts] = useState<Artifact[]>(initialArtifacts);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialArtifacts[0].id);

  // Filters
  const [filterExpiring, setFilterExpiring] = useState(false);
  const [filterRawAudio, setFilterRawAudio] = useState(false);
  const [filterExternalGrace, setFilterExternalGrace] = useState(false); // grace period filter

  const isExternal = membershipType === "External";

  // Filter logic
  const visibleArtifacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return artifacts.filter((artifact) => {
      // Name query
      if (normalized && ![artifact.meeting, artifact.department, artifact.date].some((value) => value.toLowerCase().includes(normalized))) {
        return false;
      }
      // Expiring soon limit
      if (filterExpiring && artifact.status !== "Expiring Soon") {
        return false;
      }
      // Raw audio filter
      if (filterRawAudio && !artifact.containsRawAudio) {
        return false;
      }
      // External Grace period filter: if true, limit to rooms they participated in
      if (filterExternalGrace && !artifact.externalParticipated) {
        return false;
      }
      // RBAC boundaries: If user is external, strictly only let them see rooms they participated in
      if (isExternal && !artifact.externalParticipated) {
        return false;
      }
      return true;
    });
  }, [artifacts, query, filterExpiring, filterRawAudio, filterExternalGrace, isExternal]);

  if (!activeWorkspaceId) return null;

  const isOwnerOrAdmin = currentRole === "Owner" || currentRole === "Admin";

  const selected = artifacts.find((artifact) => artifact.id === selectedId) || visibleArtifacts[0] || artifacts[0];

  const handleToggleAccess = (permission: string) => {
    if (!isOwnerOrAdmin) return;
    setArtifacts((current) =>
      current.map((art) => {
        if (art.id !== selected.id) return art;
        const currentAccess = art.access;
        const updatedAccess = currentAccess.includes(permission)
          ? currentAccess.filter((item) => item !== permission)
          : [...currentAccess, permission];
        return { ...art, access: updatedAccess };
      })
    );
    toast.success("Access permissions updated.");
  };

  const handleUpdateTranscript = (newVal: string) => {
    setArtifacts((current) =>
      current.map((art) => (art.id === selected.id ? { ...art, transcript: newVal } : art))
    );
  };

  const handleDownload = () => {
    // Block downloads if retention is expired (status === Deleted)
    if (selected.status === "Deleted") {
      toast.error("Download blocked. The retention period for this meeting has expired.");
      return;
    }

    const blob = new Blob([selected.transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selected.meeting.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-transcript.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Transcript download initiated.");
  };

  const handleRetryCleanup = async (artId: string) => {
    toast.info("Retrying background retention cleanup worker...");
    // Simulate cleanup retry
    setTimeout(() => {
      setArtifacts((current) =>
        current.map((art) =>
          art.id === artId ? { ...art, status: "Deleted", transcript: "[Transcript cleanup complete.]" } : art
        )
      );
      toast.success("Retention cleanup succeeded. Transcript expunged.");
    }, 1000);
  };

  return (
    <div className="flex min-h-full flex-col gap-6 pb-6 text-ink">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meeting transcripts</h1>
          <p className="text-sm text-ink-muted mt-1">
            Review, edit, download, and monitor automated retention policy cleanup tasks for post-meeting transcripts.
          </p>
        </div>
        <Badge variant="outline" className="border-hairline bg-surface-2 text-xs py-1 px-2.5">
          {artifacts.length} Retained Meetings
        </Badge>
      </div>

      {/* Main layout */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr_300px]">
        {/* Left pane: Library & filters */}
        <div className="flex flex-col gap-4">
          {/* Quick Filters */}
          <Card className="border-hairline bg-surface-1 shadow-sm">
            <CardHeader className="pb-2.5">
              <CardTitle className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wider text-ink-muted">
                <Funnel className="h-4 w-4 text-primary" />
                <span>Filters</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterExpiring}
                  onChange={(e) => setFilterExpiring(e.target.checked)}
                  className="rounded border-hairline accent-primary"
                />
                <span>Expiring soon</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterRawAudio}
                  onChange={(e) => setFilterRawAudio(e.target.checked)}
                  className="rounded border-hairline accent-primary"
                />
                <span>Contains raw audio</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterExternalGrace}
                  onChange={(e) => setFilterExternalGrace(e.target.checked)}
                  className="rounded border-hairline accent-primary"
                />
                <span>External Grace filter</span>
              </label>
            </CardContent>
          </Card>

          {/* Meeting Library list */}
          <Card className="border-hairline bg-surface-1 shadow-sm">
            <CardHeader className="pb-3 border-b border-hairline">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-ink-muted">Meeting Library</CardTitle>
              <div className="relative mt-2">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted">
                  <MagnifyingGlass className="h-4 w-4" />
                </span>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search rooms..."
                  className="h-8 pl-8 pr-3 text-xs bg-surface-2 border-hairline focus:ring-1 focus:ring-primary"
                />
              </div>
            </CardHeader>
            <CardContent className="p-2 flex flex-col gap-1.5 max-h-[450px] overflow-y-auto">
              {visibleArtifacts.map((art) => {
                const isSelected = selected.id === art.id;
                return (
                  <button
                    key={art.id}
                    onClick={() => setSelectedId(art.id)}
                    className={`w-full rounded-md border p-3 text-left transition duration-150 flex flex-col gap-2 ${
                      isSelected
                        ? "border-primary bg-primary/10 text-ink"
                        : "border-hairline bg-surface-2 hover:bg-surface-2/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold leading-normal truncate flex-1">
                        {art.meeting}
                      </span>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[8px] font-mono uppercase rounded px-1.5 py-0.2 ${
                          art.status === "Active"
                            ? "bg-primary/5 text-primary border-primary/20"
                            : art.status === "Expiring Soon"
                              ? "bg-amber-500/5 text-amber-500 border-amber-500/20"
                              : art.status === "Deleted"
                                ? "bg-destructive/5 text-destructive border-destructive/20"
                                : "bg-destructive/10 text-destructive border-destructive/25"
                        }`}
                      >
                        {art.status}
                      </Badge>
                    </div>
                    <div className="flex flex-col text-[10px] text-ink-muted font-mono leading-relaxed">
                      <span>{art.department} · {art.date}</span>
                      <span>{art.duration} · {art.languageRoute}</span>
                    </div>
                  </button>
                );
              })}
              {visibleArtifacts.length === 0 && (
                <div className="text-center py-6 text-xs text-ink-muted">No meetings match.</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Middle pane: Editable Final Transcript details */}
        <Card className="border-hairline bg-surface-1 shadow-sm flex flex-col h-full">
          <CardHeader className="flex flex-row items-center justify-between border-b border-hairline pb-3">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold truncate">{selected.meeting}</CardTitle>
              <CardDescription className="text-xs">
                {selected.date} · {selected.duration} · {selected.languageRoute}
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleDownload}
                disabled={selected.status === "Deleted"}
                className="inline-flex h-8 items-center justify-center rounded-md border border-hairline bg-surface-1 px-3 text-xs font-semibold hover:bg-surface-2 transition duration-150 disabled:opacity-40 gap-1.5"
              >
                {selected.status === "Deleted" ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>Download</span>
              </button>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => toast.success("Transcript changes saved successfully.")}
                  disabled={selected.status === "Deleted"}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover transition duration-150 disabled:opacity-40 gap-1.5"
                >
                  <FloppyDisk className="h-4 w-4" />
                  <span>Save changes</span>
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-4 flex flex-col min-h-[400px]">
            {selected.status === "Deleted" && (
              <div className="mb-3 flex items-start gap-2.5 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                <Warning className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold">Transcript Expired</span>
                  <p className="text-[11px] leading-normal text-destructive/85">
                    This document has been removed by the automated workspace retention cleanup engine ({selected.date}). Editing and downloading are blocked.
                  </p>
                </div>
              </div>
            )}

            {selected.status === "Failed Cleanup" && (
              <div className="mb-3 flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-500 gap-3">
                <div className="flex gap-2.5 items-start">
                  <Warning className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold">Retention Cleanup Failed</span>
                    <p className="text-[11px] leading-normal text-amber-500/85">
                      The automated retention cron task failed to delete this artifact.
                    </p>
                  </div>
                </div>
                {isOwnerOrAdmin && (
                  <button
                    onClick={() => handleRetryCleanup(selected.id)}
                    className="h-7 px-3 rounded bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[10px] uppercase shrink-0 transition"
                  >
                    Retry Cleanup
                  </button>
                )}
              </div>
            )}

            <div className="mb-3 flex items-center justify-between rounded-md bg-surface-2 border border-hairline px-3 py-2 text-xs">
              <span className="font-semibold text-ink-muted">Editable final transcript</span>
              <span className="text-[10px] text-ink-muted">Saved changes persist in active cache</span>
            </div>

            <Textarea
              value={selected.transcript}
              onChange={(e) => handleUpdateTranscript(e.target.value)}
              disabled={selected.status === "Deleted"}
              className="flex-1 min-h-[300px] font-mono text-xs leading-relaxed border-hairline bg-surface-2 focus:ring-1 focus:ring-primary p-3 rounded-md resize-none"
            />
          </CardContent>
        </Card>

        {/* Right pane: Governance, ACL overrides & AI context */}
        <div className="flex flex-col gap-4">
          {/* Access policies list */}
          <Card className="border-hairline bg-surface-1 shadow-sm">
            <CardHeader className="pb-3 border-b border-hairline">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-ink-muted">Document Access</CardTitle>
              <CardDescription className="text-[10px]">
                Control which workspace groups are permitted to read this meeting.
              </CardDescription>
            </CardHeader>
            <CardContent className="py-3 flex flex-col gap-2">
              {permissionOptions.map((permission) => {
                const isAllowed = selected.access.includes(permission);
                return (
                  <label
                    key={permission}
                    className={`flex items-center justify-between p-2.5 rounded-md border text-xs ${
                      isOwnerOrAdmin ? "cursor-pointer" : "pointer-events-none opacity-80"
                    } ${
                      isAllowed
                        ? "border-primary bg-primary/5 text-ink font-semibold"
                        : "border-hairline bg-surface-2 text-ink-muted"
                    }`}
                  >
                    <span className="truncate">{permission}</span>
                    <input
                      type="checkbox"
                      checked={isAllowed}
                      disabled={!isOwnerOrAdmin}
                      onChange={() => handleToggleAccess(permission)}
                      className="rounded accent-primary h-3.5 w-3.5"
                    />
                  </label>
                );
              })}
            </CardContent>
          </Card>

          {/* AI attach card */}
          {selected.status !== "Deleted" && (
            <Card className="border-hairline bg-surface-1 text-ink shadow-sm">
              <CardContent className="p-4 flex flex-col gap-3">
                <Robot className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-xs font-bold text-ink">Analyze with Workspace AI</p>
                  <p className="text-[10px] text-ink-muted mt-1 leading-normal">
                    Provide this final transcript to a manager-only AI chat context to query summaries or correct terminology.
                  </p>
                </div>
                <button
                  onClick={() => {
                    sessionStorage.setItem("workspace-ai-context", selected.meeting);
                    router.push("/workspace/ai-chat");
                  }}
                  className="w-full h-8 rounded-md bg-primary hover:bg-primary-hover text-white font-semibold text-xs transition duration-150 flex items-center justify-center gap-1.5"
                >
                  <PaperPlaneRight className="h-4 w-4" />
                  <span>Open in AI Chat</span>
                </button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
