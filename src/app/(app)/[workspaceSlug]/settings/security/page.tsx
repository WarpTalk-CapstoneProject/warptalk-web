"use client";

/**
 * Security — who can reach this workspace, who counts as one of your own people, and what leaves
 * a meeting in a transcript.
 *
 * WHAT THIS PAGE ABSORBED, AND WHY (2026-09-16, owner's call)
 *   `/advanced` held verified domains and the danger zone, and owned nothing else. Settings held
 *   external collaboration, the internal-membership status and invitation expiry, filed between
 *   the default meeting language and the minutes template. So the three questions an owner asks
 *   about access were answered on two pages, neither of which was called Security, and the reader
 *   had to know which of "settings" or "advanced" a given switch lived under.
 *
 * THE PERMISSION SPLIT IS NOT NEW AND IS NOT RELAXED HERE
 *   Adding a verified domain hands whoever holds this workspace the power to classify every future
 *   joiner on that domain as Internal. That is why it was owner-only on `/advanced`, and it stays
 *   owner-only here: an Admin reads the domain list and the status it produces, and changes
 *   neither. The danger zone is not rendered for an Admin at all — a disabled Delete button is an
 *   invitation to ask why, and the answer is "you cannot", which the absence already says.
 *
 * WHY THE AI GUARDRAILS SPLIT
 *   PII redaction and the restricted-keyword list decide what LEAVES a meeting, so they are access
 *   controls and they live here. The global glossary decides how words are TRANSLATED, not who may
 *   see them, so it stays on Settings with the other translation defaults.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Plus, Spinner, Trash, Warning } from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAuthStore } from "@/stores/auth-store";
import {
  useWorkspace,
  useWorkspaceSettings,
  usePatchWorkspaceSettings,
  useVerifiedDomains,
  useWorkspaceMembers,
  useTransferWorkspaceOwnership,
  useDeleteWorkspace,
} from "@/hooks/use-workspace";
import { VerifiedDomainsManager } from "@/components/workspace/verified-domains-manager";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAutoSaveQueue } from "@/hooks/use-auto-save";
import { AutoSaveStatusBadge } from "@/components/features/settings/auto-save-status-badge";
import { parseIntegerInRange } from "@/lib/workspace/settings-validation";
import type { WorkspaceSettingsDto } from "@/types/workspace";

type ApiErrorLike = { response?: { status?: number } };

/** The band divider: what you can change, then what only the owner can. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
      {children}
    </div>
  );
}

function Row({
  title,
  hint,
  children,
  align = "center",
}: {
  title: string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      className={`flex gap-4 px-4 py-3.5 ${
        align === "start" ? "items-start" : "items-center"
      } justify-between`}
    >
      <div className="flex max-w-[70%] flex-col gap-0.5">
        <span className="text-xs font-semibold text-ink">{title}</span>
        {hint ? <span className="text-[11px] text-ink-muted">{hint}</span> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

export default function WorkspaceSecurityPage() {
  const router = useRouter();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceName = useWorkspaceStore((s) => s.activeWorkspaceName);
  const storeRole = useWorkspaceStore((s) => s.role);
  const currentUser = useAuthStore((s) => s.user);

  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const settingsQuery = useWorkspaceSettings(activeWorkspaceId || "");
  const patchSettingsMutation = usePatchWorkspaceSettings(activeWorkspaceId || "");
  const verifiedDomainsQuery = useVerifiedDomains(activeWorkspaceId || "");
  const membersQuery = useWorkspaceMembers(activeWorkspaceId || "", 1, 100);
  const transferOwnershipMutation = useTransferWorkspaceOwnership(activeWorkspaceId || "");
  const deleteWorkspaceMutation = useDeleteWorkspace();

  /**
   * The values on screen, seeded from the server once per workspace.
   *
   * A mirror rather than reading the query directly, because a Switch has to move under the
   * finger before the PATCH comes back. `initializedRef` keys the seed on the workspace id so
   * switching workspaces re-seeds, and an unrelated refetch does not throw away an edit that is
   * still in the save queue.
   */
  const [draft, setDraft] = useState<Partial<WorkspaceSettingsDto>>({});
  const initializedRef = useRef<string | null>(null);
  const lastQueuedRef = useRef<Record<string, string>>({});
  const [newKeyword, setNewKeyword] = useState("");

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState("");
  const [transferConfirmation, setTransferConfirmation] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  useEffect(() => {
    if (!settingsQuery.data || !activeWorkspaceId) return;
    if (initializedRef.current === activeWorkspaceId) return;
    setDraft({
      allowExternalCollaboration: settingsQuery.data.allowExternalCollaboration ?? true,
      invitationExpiryDays: settingsQuery.data.invitationExpiryDays ?? 7,
      aiUsagePolicy: settingsQuery.data.aiUsagePolicy,
    });
    initializedRef.current = activeWorkspaceId;
    lastQueuedRef.current = {};
  }, [activeWorkspaceId, settingsQuery.data]);

  const savePatch = useCallback(
    (patch: Partial<WorkspaceSettingsDto>) => patchSettingsMutation.mutateAsync(patch),
    [patchSettingsMutation],
  );

  const autoSave = useAutoSaveQueue<Partial<WorkspaceSettingsDto>>({
    save: savePatch,
    onError: (error) => {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to save security settings.";
      toast.error(message);
    },
  });

  const commit = useCallback(
    (key: string, patch: Partial<WorkspaceSettingsDto>) => {
      setDraft((current) => ({ ...current, ...patch }));
      const serialized = JSON.stringify(patch);
      if (lastQueuedRef.current[key] === serialized) return;
      lastQueuedRef.current[key] = serialized;
      autoSave.enqueue(patch);
    },
    [autoSave],
  );

  const policy = draft.aiUsagePolicy;
  const keywords = useMemo(
    () => policy?.dlp?.keywordsBlacklist ?? [],
    [policy],
  );
  const domains = useMemo(
    () => (verifiedDomainsQuery.data || []).map((entry: { domain: string }) => entry.domain),
    [verifiedDomainsQuery.data],
  );

  if (!activeWorkspaceId) return null;

  if (workspaceQuery.isPending || settingsQuery.isPending) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Spinner className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const rawRole = workspaceQuery.data?.role || storeRole || "";
  const currentRole = rawRole.toLowerCase();
  const isOwner = currentRole === "owner";
  const isOwnerOrAdmin = isOwner || currentRole === "admin";
  const workspaceError = workspaceQuery.error as ApiErrorLike | undefined;
  const settingsError = settingsQuery.error as ApiErrorLike | undefined;

  const isForbidden =
    workspaceError?.response?.status === 403 ||
    settingsError?.response?.status === 403 ||
    !isOwnerOrAdmin;

  if (isForbidden) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Card className="max-w-md border-hairline bg-surface-1 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">Access Denied</CardTitle>
            <CardDescription className="text-xs">
              Only workspace Owners and Administrators can view security settings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Same reasoning as the Settings page: a failed load is not a configuration, and rendering
  // defaults here would let the first switch someone touched save a fiction over the real one.
  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Card className="max-w-md border-hairline bg-surface-1 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Warning className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">
              Couldn&apos;t load security settings
            </CardTitle>
            <CardDescription className="text-xs">
              Nothing is shown rather than defaults that are not this workspace&apos;s. Retry, and
              if it keeps failing check that the workspace service is reachable.
            </CardDescription>
          </CardHeader>
          <button
            type="button"
            onClick={() => settingsQuery.refetch()}
            disabled={settingsQuery.isFetching}
            className="mx-auto mt-2 inline-flex h-9 items-center rounded-md border border-hairline bg-surface-2 px-4 text-xs font-semibold transition hover:bg-surface-3 disabled:opacity-60"
          >
            {settingsQuery.isFetching ? "Retrying…" : "Retry"}
          </button>
        </Card>
      </div>
    );
  }

  const membersList = membersQuery.data?.items || [];
  const selectedNewOwner = membersList.find((member) => member.userId === newOwnerId);

  const commitExpiry = (rawValue: string) => {
    const parsed = parseIntegerInRange(rawValue, 1, 365);
    setDraft((current) => ({ ...current, invitationExpiryDays: parsed.value }));
    if (!parsed.ok) return;
    commit("invitationExpiryDays", { invitationExpiryDays: parsed.value });
  };

  const commitPolicy = (key: string, next: NonNullable<WorkspaceSettingsDto["aiUsagePolicy"]>) => {
    commit(key, { aiUsagePolicy: next });
  };

  const addKeyword = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed || !policy) return;
    if (keywords.includes(trimmed)) {
      toast.error("Keyword already in the list.");
      return;
    }
    // `enabled` is written out rather than carried by the spread: DlpDto requires it, while
    // `policy.dlp` is optional — so `{ ...policy.dlp }` types as `enabled?: boolean`, which is
    // not a DlpDto. The list can only be edited while DLP is on, so `true` is the honest value.
    commitPolicy("aiUsagePolicy.dlp.keywordsBlacklist", {
      ...policy,
      dlp: {
        ...policy.dlp,
        enabled: policy.dlp?.enabled ?? true,
        keywordsBlacklist: [...keywords, trimmed],
      },
    });
    setNewKeyword("");
  };

  const removeKeyword = (keyword: string) => {
    if (!policy) return;
    commitPolicy("aiUsagePolicy.dlp.keywordsBlacklist", {
      ...policy,
      dlp: {
        ...policy.dlp,
        enabled: policy.dlp?.enabled ?? true,
        keywordsBlacklist: keywords.filter((k) => k !== keyword),
      },
    });
  };

  const handleTransferConfirm = async () => {
    if (!newOwnerId) return;
    try {
      await transferOwnershipMutation.mutateAsync(newOwnerId);
      toast.success("Workspace ownership transferred successfully.");
      setIsTransferModalOpen(false);
      setNewOwnerId("");
      setTransferConfirmation("");
      router.push("/workspace");
    } catch {
      toast.error("Failed to transfer ownership.");
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirmation !== activeWorkspaceName) {
      toast.error("Confirmation name does not match workspace name.");
      return;
    }
    try {
      await deleteWorkspaceMutation.mutateAsync(activeWorkspaceId);
      toast.success("Workspace deleted successfully.");
      setIsDeleteModalOpen(false);
      router.push("/workspace");
    } catch {
      toast.error("Failed to delete workspace.");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 text-ink">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight text-ink">Security</h1>
          <p className="text-xs text-ink-muted">
            Who can reach this workspace, who counts as one of your own people, and what leaves it
            in a transcript.
          </p>
        </div>
        <AutoSaveStatusBadge status={autoSave.status} onRetry={autoSave.retry} />
      </div>

      {/* ── Membership ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <SectionLabel>Membership</SectionLabel>
        <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1">
          {/*
            A status, not a switch. The value is derived from whether the workspace holds a
            verified domain, so a toggle would be a second way to set one fact — and would let a
            workspace claim to require a domain while holding none.
          */}
          <Row
            title="How internal membership is decided"
            align="start"
            hint={
              domains.length > 0
                ? `Decided by verified domain — ${domains.join(", ")}. Only addresses on these domains can be invited as internal members.`
                : "Assigned by hand. You choose internal or external for each person you invite."
            }
          >
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                domains.length > 0
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-hairline bg-surface-2 text-ink-muted"
              }`}
            >
              {domains.length > 0 ? "Domain-verified" : "Manual"}
            </span>
          </Row>

          <div className="flex flex-col gap-3 px-4 py-3.5">
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                Verified domains
                {!isOwner && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                    <Lock size={10} />
                    Owner only
                  </span>
                )}
              </span>
              <span className="text-[11px] text-ink-muted">
                Anyone invited on one of these can be made an internal member. Removing the last one
                puts membership back to being assigned by hand.
              </span>
            </div>

            {isOwner ? (
              <VerifiedDomainsManager workspaceId={activeWorkspaceId} />
            ) : domains.length > 0 ? (
              // An Admin reads the list and changes nothing — see the file header.
              <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
                {domains.map((domain) => (
                  <li key={domain} className="px-3 py-2 font-mono text-[12px] text-ink">
                    {domain}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] italic text-ink-muted">
                No verified domains. Only the workspace owner can add one.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Access ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <SectionLabel>Access</SectionLabel>
        <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1">
          <Row
            title="Allow external collaboration"
            hint="Let people outside this workspace join meeting rooms as guests."
          >
            <Switch
              checked={draft.allowExternalCollaboration ?? true}
              onCheckedChange={(value) =>
                commit("allowExternalCollaboration", { allowExternalCollaboration: value })
              }
            />
          </Row>

          <Row
            title="Invitation expiry"
            hint="Days before a workspace invitation link expires (1 - 365 days)."
          >
            <Input
              type="number"
              min={1}
              max={365}
              value={draft.invitationExpiryDays ?? 7}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  invitationExpiryDays: Number(event.target.value),
                }))
              }
              onBlur={(event) => commitExpiry(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitExpiry(event.currentTarget.value);
                  event.currentTarget.blur();
                }
              }}
              className="h-8 w-[140px] border-hairline bg-surface-2 text-xs"
            />
          </Row>
        </div>
      </div>

      {/* ── Data protection ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <SectionLabel>Data protection</SectionLabel>
        <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1">
          <Row
            title="Redact personal information (PII)"
            hint="Detect and mask sensitive identifiers — emails, phone numbers, ID numbers — before a transcript is stored or translated."
          >
            <Switch
              checked={policy?.redactPii?.enabled ?? false}
              onCheckedChange={(value) =>
                policy &&
                commitPolicy("aiUsagePolicy.redactPii.enabled", {
                  ...policy,
                  // Same shape rule as dlp below: the flag is written, not spread.
                  redactPii: { ...policy.redactPii, enabled: value },
                })
              }
            />
          </Row>

          <Row
            title="Restricted keywords (DLP)"
            hint="Flag or block designated terms while a meeting is being translated live."
          >
            <Switch
              checked={policy?.dlp?.enabled ?? false}
              onCheckedChange={(value) =>
                policy &&
                commitPolicy("aiUsagePolicy.dlp.enabled", {
                  ...policy,
                  dlp: { ...policy.dlp, enabled: value, keywordsBlacklist: keywords },
                })
              }
            />
          </Row>

          {policy?.dlp?.enabled && (
            <div className="flex flex-col gap-3 bg-surface-2/50 px-4 py-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Keyword list</span>
                <span className="text-[11px] text-ink-muted">
                  Every word here is checked against each line as it is transcribed.
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Enter keyword (e.g., Confidential, Internal-Only)"
                  value={newKeyword}
                  onChange={(event) => setNewKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addKeyword();
                    }
                  }}
                  className="h-8 flex-1 border-hairline bg-surface-1 text-xs"
                />
                <button
                  type="button"
                  onClick={addKeyword}
                  disabled={!newKeyword.trim()}
                  className="flex h-8 cursor-pointer items-center justify-center gap-1 rounded border border-hairline bg-surface-3 px-3 text-xs font-semibold text-ink transition hover:bg-surface-4 disabled:opacity-50"
                >
                  <Plus size={12} /> Add keyword
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                {keywords.length === 0 ? (
                  <span className="text-[10px] italic text-ink-muted">
                    No restricted keywords configured.
                  </span>
                ) : (
                  keywords.map((keyword) => (
                    <div
                      key={keyword}
                      className="flex items-center gap-1.5 rounded border border-hairline bg-surface-1 px-2 py-0.5 text-xs"
                    >
                      <span className="font-mono text-[10px] text-ink">{keyword}</span>
                      <button
                        type="button"
                        onClick={() => removeKeyword(keyword)}
                        className="ml-1 cursor-pointer text-ink-muted transition-colors hover:text-destructive"
                      >
                        <Trash size={11} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Workspace management ───────────────────────────────────────────────────────
          Not rendered at all for an Admin. A disabled Delete button asks a question whose
          answer is "you cannot", which the absence already gives. */}
      {isOwner && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Workspace management</SectionLabel>
          <div className="divide-y divide-destructive/15 overflow-hidden rounded-lg border border-destructive/25 bg-destructive/5">
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex max-w-[70%] flex-col gap-0.5">
                <span className="text-xs font-semibold text-destructive">Transfer ownership</span>
                <span className="text-[11px] text-destructive/80">
                  Hand this workspace to another internal member. You become an Admin, and cannot
                  undo this yourself afterwards.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(true)}
                className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-destructive px-4 text-sm font-semibold text-white transition hover:bg-destructive/90"
              >
                Transfer
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex max-w-[70%] flex-col gap-0.5">
                <span className="text-xs font-semibold text-destructive">Delete workspace</span>
                <span className="text-[11px] text-destructive/80">
                  Ends every membership immediately. Meetings, documents and glossaries go with it.
                  This cannot be undone.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-destructive px-4 text-sm font-semibold text-white transition hover:bg-destructive/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Ownership Dialog */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent className="max-w-md border-hairline bg-surface-1">
          <DialogHeader className="flex flex-col gap-1.5">
            <DialogTitle className="text-base font-bold text-foreground">
              Transfer workspace ownership
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Select a member to become the new owner. <strong>Warning:</strong> you will be demoted
              to Admin and cannot undo this action.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 flex flex-col gap-2">
            <label className="text-xs font-semibold text-ink">Select new owner</label>
            <Select
              value={newOwnerId}
              onValueChange={(value) => {
                setNewOwnerId(value || "");
                setTransferConfirmation("");
              }}
            >
              <SelectTrigger className="h-9 border-hairline bg-surface-2 text-xs">
                {/* A function child, not a bare placeholder: Base UI's Select.Value stringifies
                    the raw value otherwise, and the value here is the member's GUID. */}
                <SelectValue>
                  {(value) => {
                    if (!value) return "Choose a member...";
                    const member = membersList.find((m) => m.userId === value);
                    return member ? `${member.fullName} (${member.email})` : "Choose a member...";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {membersList
                  .filter(
                    (m) =>
                      m.userId !== currentUser?.id &&
                      m.status.toLowerCase() === "active" &&
                      m.membershipType.toLowerCase() === "internal",
                  )
                  .map((m) => (
                    <SelectItem key={m.userId} value={m.userId} className="text-xs">
                      {m.fullName} ({m.email})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selectedNewOwner && (
              <>
                <p className="text-xs text-destructive/80">
                  This person becomes Owner immediately; you become Admin. Type their full name to
                  confirm.
                </p>
                <Input
                  value={transferConfirmation}
                  onChange={(event) => setTransferConfirmation(event.target.value)}
                  placeholder={selectedNewOwner.fullName}
                  className="h-9 border-destructive/30 bg-surface-2/40 text-xs"
                />
              </>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <button
              onClick={() => {
                setIsTransferModalOpen(false);
                setNewOwnerId("");
                setTransferConfirmation("");
              }}
              className="h-9 cursor-pointer rounded-md border border-hairline bg-surface-1 px-4 text-xs font-semibold transition hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={handleTransferConfirm}
              disabled={
                !newOwnerId ||
                !selectedNewOwner ||
                transferConfirmation !== selectedNewOwner.fullName ||
                transferOwnershipMutation.isPending
              }
              className="h-9 cursor-pointer rounded-md bg-destructive px-4 text-xs font-semibold text-white transition hover:bg-destructive/90 disabled:opacity-50"
            >
              {transferOwnershipMutation.isPending ? (
                <Spinner className="h-4 w-4 animate-spin text-white" />
              ) : (
                "Confirm transfer"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace Dialog */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="max-w-md border-destructive/20 bg-surface-1">
          <DialogHeader className="flex flex-col gap-1.5">
            <DialogTitle className="text-base font-bold text-destructive">
              Delete workspace
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              This cannot be undone. It permanently deletes <strong>{activeWorkspaceName}</strong>{" "}
              and all associated data including documents, members and glossaries.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 flex flex-col gap-2">
            <label className="text-xs font-semibold text-ink">
              Please type <strong>{activeWorkspaceName}</strong> to confirm.
            </label>
            <Input
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder={activeWorkspaceName || ""}
              className="h-9 border-hairline bg-surface-2/40 text-xs focus:ring-1 focus:ring-destructive"
            />
          </div>

          <DialogFooter className="flex gap-2">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteConfirmation("");
              }}
              className="h-9 cursor-pointer rounded-md border border-hairline bg-surface-1 px-4 text-xs font-semibold transition hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={
                deleteConfirmation !== activeWorkspaceName || deleteWorkspaceMutation.isPending
              }
              className="h-9 cursor-pointer rounded-md bg-destructive px-4 text-xs font-semibold text-white transition hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleteWorkspaceMutation.isPending ? (
                <Spinner className="h-4 w-4 animate-spin text-white" />
              ) : (
                "Delete workspace"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
