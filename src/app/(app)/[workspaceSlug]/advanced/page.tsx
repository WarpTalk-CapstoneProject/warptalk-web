"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Spinner } from "@phosphor-icons/react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceMembers, useTransferWorkspaceOwnership, useDeleteWorkspace, useRenameWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Mirrors workspace.workspaces.name VARCHAR(150); the server rejects anything longer. */
const WORKSPACE_NAME_MAX_LENGTH = 150;

export default function AdvancedSettingsPage() {
  const router = useRouter();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeWorkspaceName = useWorkspaceStore((state) => state.activeWorkspaceName);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const membershipType = useWorkspaceStore((state) => state.membershipType);
  const defaultLanguage = useWorkspaceStore((state) => state.defaultLanguage);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const role = useWorkspaceRole();
  const currentUser = useAuthStore((state) => state.user);

  // Held as null until the field is touched so that the store stays the source of truth —
  // both while the persisted store rehydrates and again after a successful save.
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState("");
  const [transferConfirmation, setTransferConfirmation] = useState("");

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const membersQuery = useWorkspaceMembers(activeWorkspaceId || "", 1, 100);
  const transferOwnershipMutation = useTransferWorkspaceOwnership(activeWorkspaceId || "");
  const deleteWorkspaceMutation = useDeleteWorkspace();
  const renameWorkspaceMutation = useRenameWorkspace(activeWorkspaceId || "");

  const isOwner = role === "owner";
  const membersList = membersQuery.data?.items || [];
  const selectedNewOwner = membersList.find((member) => member.userId === newOwnerId);

  const nameValue = nameDraft ?? activeWorkspaceName ?? "";
  const trimmedName = nameValue.trim();
  const canSaveName =
    trimmedName.length > 0
    && trimmedName.length <= WORKSPACE_NAME_MAX_LENGTH
    && trimmedName !== (activeWorkspaceName || "")
    && !renameWorkspaceMutation.isPending;

  if (!activeWorkspaceId) return null;
  if (!isOwner) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-ink">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-sm text-ink-muted mt-2">Only the workspace owner can access advanced settings.</p>
        </div>
      </div>
    );
  }

  const handleRenameSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSaveName) return;
    try {
      await renameWorkspaceMutation.mutateAsync(trimmedName);
      // Push the new name into the store so the sidebar and switcher update without a reload.
      // The slug is passed back unchanged on purpose: a rename never moves the workspace's
      // address, and every [workspaceSlug] route depends on it staying put.
      setActiveWorkspace(
        activeWorkspaceId,
        trimmedName,
        activeWorkspaceSlug,
        role,
        membershipType,
        defaultLanguage,
      );
      setNameDraft(null);
      toast.success("Workspace renamed successfully.");
    } catch {
      toast.error("Failed to rename workspace.");
    }
  };

  const handleTransferConfirm = async () => {
    if (!newOwnerId) return;
    try {
      await transferOwnershipMutation.mutateAsync(newOwnerId);
      toast.success("Workspace ownership transferred successfully.");
      setIsTransferModalOpen(false);
      setNewOwnerId("");
      setTransferConfirmation("");
      router.push("/workspace"); // They are no longer owner, redirect to workspace selection
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
      router.push("/workspace"); // Redirect to workspace selection since workspace is gone
    } catch {
      toast.error("Failed to delete workspace.");
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-6 px-4 py-4 pb-6 text-ink max-w-7xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-destructive">Advanced Settings</h1>
        <p className="text-sm text-ink-muted mt-1">
          Perform high-risk operations for this workspace. Proceed with caution.
        </p>
      </div>

      {/* Rename Workspace */}
      <Card className="border-hairline bg-surface-1 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-ink">Workspace name</CardTitle>
          <CardDescription className="text-xs text-ink-muted">
            The display name shown to everyone in this workspace. The workspace URL is unaffected —
            it keeps using <strong>{activeWorkspaceSlug}</strong>, so existing links and invitations stay valid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRenameSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex flex-1 flex-col gap-1">
              <Input
                value={nameValue}
                onChange={(event) => setNameDraft(event.target.value)}
                maxLength={WORKSPACE_NAME_MAX_LENGTH}
                placeholder="Workspace name"
                className="h-9 border-hairline bg-surface-2/40 text-xs"
              />
              <span className="text-[11px] text-ink-muted">
                {trimmedName.length}/{WORKSPACE_NAME_MAX_LENGTH} characters
              </span>
            </div>
            <button
              type="submit"
              disabled={!canSaveName}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50 cursor-pointer shrink-0"
            >
              {renameWorkspaceMutation.isPending ? (
                <Spinner className="h-4 w-4 animate-spin text-white" />
              ) : (
                "Save"
              )}
            </button>
          </form>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-destructive">Danger zone</CardTitle>
          <CardDescription className="text-xs text-destructive/80">
            These actions are irreversible and can lead to data loss or loss of access.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/10 p-4">
            <div className="flex flex-col gap-1 max-w-[70%]">
              <span className="text-sm font-semibold text-destructive">Transfer Workspace Ownership</span>
              <span className="text-xs text-destructive/80">
                Transfer this workspace to another administrator or member. You will be demoted to Admin.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsTransferModalOpen(true)}
              className="inline-flex h-9 items-center justify-center rounded-md bg-destructive text-white hover:bg-destructive/90 px-4 text-sm font-semibold transition cursor-pointer shrink-0"
            >
              Transfer Ownership
            </button>
          </div>

          <div className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/10 p-4">
            <div className="flex flex-col gap-1 max-w-[70%]">
              <span className="text-sm font-semibold text-destructive">Delete Workspace</span>
              <span className="text-xs text-destructive/80">
                Permanently delete this workspace and all of its data. This action cannot be undone.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="inline-flex h-9 items-center justify-center rounded-md bg-destructive text-white hover:bg-destructive/90 px-4 text-sm font-semibold transition cursor-pointer shrink-0"
            >
              Delete Workspace
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Transfer Ownership Dialog */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent className="border-hairline bg-surface-1 max-w-md">
          <DialogHeader className="flex flex-col gap-1.5">
            <DialogTitle className="font-bold text-base text-foreground">Transfer Workspace Ownership</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Select a member to become the new owner of this workspace. <strong>Warning:</strong> You will be demoted to Admin and cannot undo this action.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 my-4">
            <label className="text-xs font-semibold text-ink">Select New Owner</label>
            <Select value={newOwnerId} onValueChange={(val) => {
              setNewOwnerId(val || "");
              setTransferConfirmation("");
            }}>
              <SelectTrigger className="h-9 text-xs bg-surface-2 border-hairline">
                <SelectValue placeholder="Choose a member..." />
              </SelectTrigger>
              <SelectContent>
                {membersList
                  .filter((m) =>
                    m.userId !== currentUser?.id
                    && m.status.toLowerCase() === "active"
                    && m.membershipType.toLowerCase() === "internal")
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
                  This person becomes Owner immediately; you become Admin. Type their full name to confirm.
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
              className="h-9 px-4 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleTransferConfirm}
              disabled={!newOwnerId || !selectedNewOwner || transferConfirmation !== selectedNewOwner.fullName || transferOwnershipMutation.isPending}
              className="h-9 px-4 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition disabled:opacity-50 cursor-pointer"
            >
              {transferOwnershipMutation.isPending ? (
                <Spinner className="h-4 w-4 animate-spin text-white" />
              ) : (
                "Confirm Transfer"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace Dialog */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="border-destructive/20 bg-surface-1 max-w-md">
          <DialogHeader className="flex flex-col gap-1.5">
            <DialogTitle className="font-bold text-base text-destructive">Delete Workspace</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              This action cannot be undone. This will permanently delete the workspace <strong>{activeWorkspaceName}</strong> and all associated data including documents, members, and glossaries.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 my-4">
            <label className="text-xs font-semibold text-ink">
              Please type <strong>{activeWorkspaceName}</strong> to confirm.
            </label>
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder={activeWorkspaceName || ""}
              className="h-9 border-hairline focus:ring-1 focus:ring-destructive text-xs bg-surface-2/40"
            />
          </div>

          <DialogFooter className="flex gap-2">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteConfirmation("");
              }}
              className="h-9 px-4 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={deleteConfirmation !== activeWorkspaceName || deleteWorkspaceMutation.isPending}
              className="h-9 px-4 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition disabled:opacity-50 cursor-pointer"
            >
              {deleteWorkspaceMutation.isPending ? (
                <Spinner className="h-4 w-4 animate-spin text-white" />
              ) : (
                "Delete Workspace"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
