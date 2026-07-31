"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  EnvelopeSimple,
  Plus,
  Trash,
  Spinner,
  Copy,
  MagnifyingGlass,
  Check,
  Warning,
  Lock,
  UserPlus,
  CheckCircle,
  XCircle
} from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import {
  useWorkspaceInvitations,
  useInviteWorkspaceMember,
  useRevokeWorkspaceInvitation,
  useApproveJoinRequest,
  useRejectJoinRequest
} from "@/hooks/use-workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  roleName: z.enum(["Admin", "Member"]),
});

type InviteFormData = z.infer<typeof inviteSchema>;

export default function WorkspaceInvitationsPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceName = useWorkspaceStore((s) => s.activeWorkspaceName);
  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const currentRole = useWorkspaceRole();
  const currentMembership = useWorkspaceStore((s) => s.membershipType);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"invitations" | "join-requests">("invitations");
  const [approvalType, setApprovalType] = useState<Record<string, "Internal" | "External">>({});

  const [inviteNotice, setInviteNotice] = useState<{ email: string; previewUrl: string; warning?: string | null } | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<{ id: string; email: string } | null>(null);

  // Queries & Mutations
  const invitationsQuery = useWorkspaceInvitations(activeWorkspaceId || "", page, 100, query, "outbound");
  const joinRequestsQuery = useWorkspaceInvitations(activeWorkspaceId || "", page, 100, query, "join-request");
  const inviteMutation = useInviteWorkspaceMember(activeWorkspaceId || "");
  const revokeMutation = useRevokeWorkspaceInvitation(activeWorkspaceId || "");
  const approveJoinRequest = useApproveJoinRequest(activeWorkspaceId || "");
  const rejectJoinRequest = useRejectJoinRequest(activeWorkspaceId || "");

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      roleName: "Member",
    },
  });

  const selectedRole = useWatch({ control, name: "roleName" });

  if (!activeWorkspaceId) return null;

  // RBAC Access Control
  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "admin";
  const isOwnerOrAdmin = isOwner || isAdmin;
  const isExternal = currentMembership?.toLowerCase() === "external";

  if (!isOwnerOrAdmin || isExternal) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Card className="max-w-md border-hairline bg-surface-1 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">Access Denied</CardTitle>
            <CardDescription className="text-xs">
              Only workspace Owners and Administrators can manage invitations.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleInvite = async (formData: InviteFormData) => {
    try {
      const result = await inviteMutation.mutateAsync({
        email: formData.email,
        roleName: formData.roleName,
      });

      const params = new URLSearchParams({
        invitationId: result.invitation.id,
        workspaceId: result.invitation.workspaceId,
        workspaceName: activeWorkspaceName || "WarpTalk Workspace",
        workspaceSlug: activeWorkspaceSlug || "workspace",
        email: result.invitation.email,
        roleName: result.invitation.roleName,
        membershipType: result.invitation.membershipType,
      });
      setInviteNotice({
        email: result.invitation.email,
        previewUrl: `${window.location.origin}/dev/email/workspace-invite?${params.toString()}`,
        warning: result.warning,
      });
      reset();
      toast.success(result.warning ? "Invitation created, but email delivery failed." : "Invitation sent.");
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || "Failed to create invitation");
    }
  };

  const handleRevoke = async () => {
    if (!inviteToRevoke) return;
    try {
      await revokeMutation.mutateAsync(inviteToRevoke.id);
      toast.success(`Invitation for ${inviteToRevoke.email} revoked.`);
      setInviteToRevoke(null);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || "Failed to revoke invitation");
    }
  };

  const allRecords = (activeTab === "invitations" ? invitationsQuery.data?.items : joinRequestsQuery.data?.items) || [];
  const joinRequestsList = activeTab === "join-requests" ? allRecords : [];
  const invitesList = activeTab === "invitations" ? allRecords : [];

  const handleApprove = async (inviteId: string, provisionalType: string) => {
    const membershipType = approvalType[inviteId] || (provisionalType.toLowerCase() === "internal" ? "Internal" : "External");
    try {
      const result = await approveJoinRequest.mutateAsync({ inviteId, membershipType });
      toast.success(result.approvalEmailStatus === "Failed" ? "Member approved; approval email delivery failed." : "Join request approved and email sent.");
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || "Failed to approve join request");
    }
  };

  const handleReject = async (invitationId: string) => {
    try {
      await rejectJoinRequest.mutateAsync(invitationId);
      toast.success("Join request rejected.");
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || "Failed to reject join request");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Email preview URL copied.");
  };

  return (
    <div className="flex min-h-full flex-col gap-6 pb-6 text-ink">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Invitations</h1>
        <p className="text-sm text-ink-muted">
          Manage invitations sent by this workspace and review incoming Join Requests.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setActiveTab("invitations"); setPage(1); }}
          className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12px] font-medium transition ${activeTab === "invitations" ? "border border-border/60 bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.02)] text-ink" : "bg-transparent text-ink-muted hover:text-ink"}`}
        >
          <EnvelopeSimple size={14} />
          Invitations
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">{invitationsQuery.data?.total ?? 0}</span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("join-requests"); setPage(1); }}
          className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12px] font-medium transition ${activeTab === "join-requests" ? "border border-border/60 bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.02)] text-ink" : "bg-transparent text-ink-muted hover:text-ink"}`}
        >
          <UserPlus size={14} />
          Join Requests
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">{joinRequestsQuery.data?.total ?? 0}</span>
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Pending Invites List */}
        <Card className="border-hairline bg-surface-1 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-hairline">
            <div>
                <CardTitle className="text-base font-semibold">{activeTab === "invitations" ? "Invitations sent" : "Join Requests"}</CardTitle>
                <CardDescription className="text-xs">
                  {activeTab === "invitations" ? "Invitees accept pending invitations after signing in with the matching email." : "Review requests from users asking to join this workspace."}
                </CardDescription>
            </div>
            <div className="relative w-64">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted">
                <MagnifyingGlass className="h-4 w-4" />
              </span>
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={activeTab === "invitations" ? "Search invitations..." : "Search requests..."}
                className="h-8 pl-8 pr-3 text-xs bg-surface-2 border-hairline focus:ring-1 focus:ring-primary"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {invitationsQuery.isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Spinner className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (activeTab === "invitations" ? invitesList : joinRequestsList).length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
                <EnvelopeSimple className="h-8 w-8 text-ink-muted" />
                <p className="text-sm font-medium">{activeTab === "invitations" ? "No invitations" : "No join requests"}</p>
                <p className="text-xs text-ink-muted">{activeTab === "invitations" ? "Create an invite on the right rail." : "Requests from Workspace Hub will appear here."}</p>
              </div>
            ) : (
                <div className="min-w-[650px] divide-y divide-hairline">
                <div className="grid grid-cols-[1.5fr_100px_110px_100px_100px_48px] items-center gap-4 px-4 py-2 bg-surface-2 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                  <span>Email</span>
                  <span>Role</span>
                  <span>Type</span>
                  <span>Status</span>
                  <span>Expires</span>
                  <span className="text-right">Action</span>
                </div>

                {(activeTab === "invitations" ? invitesList : joinRequestsList).map((invite) => {
                  const normalizedStatus = invite.status.toUpperCase();
                  const isJoinRequest = activeTab === "join-requests";
                  const isRequested = normalizedStatus === "REQUESTED";
                  return (
                  <div
                    key={invite.id}
                    className="grid grid-cols-[1.5fr_100px_110px_100px_100px_48px] items-center gap-4 px-4 py-3 hover:bg-surface-2/30 transition-colors"
                  >
                    <span className="text-xs font-medium text-ink truncate">{invite.email}</span>
                    <span className="text-xs text-ink-muted">{isJoinRequest ? "Member" : invite.roleName}</span>
                    {isJoinRequest ? (
                      <select
                        value={approvalType[invite.id] || (invite.membershipType.toLowerCase() === "internal" ? "Internal" : "External")}
                        onChange={(event) => setApprovalType((current) => ({ ...current, [invite.id]: event.target.value as "Internal" | "External" }))}
                        disabled={!isRequested || approveJoinRequest.isPending}
                        className="h-7 rounded-md border border-hairline bg-surface-2 px-2 text-[11px] text-ink disabled:opacity-60"
                      >
                        <option value="Internal">Internal</option>
                        <option value="External">External</option>
                      </select>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {isRequested && invite.membershipType.toLowerCase() === "external"
                          ? "Needs review"
                          : invite.membershipType}
                      </span>
                    )}
                    <div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${
                          normalizedStatus === "PENDING" || normalizedStatus === "REQUESTED"
                            ? "bg-amber-500/5 text-amber-500 border-amber-500/20"
                            : normalizedStatus === "ACCEPTED"
                              ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/20"
                              : normalizedStatus === "REJECTED"
                                ? "bg-destructive/5 text-destructive border-destructive/20"
                              : "bg-surface-3 border-hairline text-ink-muted"
                        }`}
                      >
                        {invite.status}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-ink-muted">
                      {isJoinRequest ? new Date(invite.createdAt).toLocaleDateString() : new Date(invite.expiresAt).toLocaleDateString()}
                    </span>
                    {isJoinRequest ? (
                      <div className="flex justify-end gap-1">
                        {isRequested ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApprove(invite.id, invite.membershipType)}
                              disabled={approveJoinRequest.isPending || rejectJoinRequest.isPending}
                              className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2 text-[10px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                              title="Approve as Member"
                            >
                              <CheckCircle size={13} /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(invite.id)}
                              disabled={approveJoinRequest.isPending || rejectJoinRequest.isPending}
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-destructive/20 px-2 text-[10px] font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-50"
                              title="Reject Join Request"
                            >
                              <XCircle size={13} /> Reject
                            </button>
                          </>
                        ) : normalizedStatus === "ACCEPTED" ? <CheckCircle size={17} className="text-emerald-600" /> : <XCircle size={17} className="text-destructive" />}
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <button
                          onClick={() => setInviteToRevoke({ id: invite.id, email: invite.email })}
                          disabled={normalizedStatus !== "PENDING"}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Revoke Invitation"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {invitationsQuery.data && invitationsQuery.data.total > 100 && (
              <div className="flex items-center justify-end px-4 py-3 border-t border-hairline gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 text-xs border border-hairline rounded hover:bg-surface-2 disabled:opacity-45"
                >
                  Previous
                </button>
                <span className="text-xs text-ink-muted">Page {page}</span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={invitesList.length < 100}
                  className="px-2.5 py-1 text-xs border border-hairline rounded hover:bg-surface-2 disabled:opacity-45"
                >
                  Next
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invite Form Panel */}
        <Card className="border-hairline bg-surface-1 h-fit shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Invite Member</CardTitle>
            <CardDescription className="text-xs">
              Send an email-bound invitation to a user.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(handleInvite)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Email Address</label>
                <Input
                  type="email"
                  placeholder="user@domain.com"
                  className="h-9 border-hairline focus:ring-1 focus:ring-primary"
                  {...register("email")}
                  disabled={inviteMutation.isPending}
                />
                {errors.email && (
                  <p className="text-[11px] text-destructive mt-0.5">{errors.email.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Workspace Role</label>
                <Select
                  value={selectedRole}
                  onValueChange={(val) => setValue("roleName", val as "Admin" | "Member")}
                >
                  <SelectTrigger className="h-9 text-xs bg-surface-2 border-hairline">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Member" className="text-xs">Member (Standard)</SelectItem>
                    <SelectItem value="Admin" className="text-xs">Admin (Operational Manager)</SelectItem>
                  </SelectContent>
                </Select>
                {errors.roleName && (
                  <p className="text-[11px] text-destructive mt-0.5">{errors.roleName.message}</p>
                )}
              </div>

              <p className="rounded-md border border-hairline bg-surface-2 px-3 py-2 text-[11px] leading-5 text-ink-muted">
                Access type is assigned automatically from the workspace&apos;s verified domains.
              </p>

              <button
                type="submit"
                className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary font-semibold text-white transition hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50 text-xs"
                disabled={inviteMutation.isPending}
              >
                {inviteMutation.isPending ? (
                  <Spinner className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Invite member</span>
                  </>
                )}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Revocation Confirmation Dialog */}
      <Dialog open={!!inviteToRevoke} onOpenChange={(open) => !open && setInviteToRevoke(null)}>
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader className="flex flex-col gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base">Revoke Invitation?</DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              Revoking the invitation for <span className="font-semibold text-ink">{inviteToRevoke?.email}</span> will remove the pending invitation. They will not be able to accept it with that email.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setInviteToRevoke(null)}
              className="flex-1 h-9 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleRevoke}
              disabled={revokeMutation.isPending}
              className="flex-1 h-9 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition disabled:opacity-50"
            >
              {revokeMutation.isPending ? <Spinner className="h-4 w-4 animate-spin" /> : "Revoke"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!inviteNotice} onOpenChange={(open) => !open && setInviteNotice(null)}>
        <DialogContent className="border-hairline bg-surface-1 max-w-md">
          <DialogHeader className="flex flex-col gap-1.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
              <Check className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base">Invitation Created</DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              The invite is bound to <span className="font-semibold text-ink">{inviteNotice?.email}</span>. A secure invitation email has been sent to that address.
            </DialogDescription>
          </DialogHeader>

          {process.env.NODE_ENV !== "production" && inviteNotice?.previewUrl && (
            <div className="my-4 flex gap-2">
              <Input
                readOnly
                value={inviteNotice.previewUrl}
                className="h-9 flex-1 select-all border-hairline bg-surface-2 font-mono text-xs"
              />
              <button
                onClick={() => inviteNotice.previewUrl && copyToClipboard(inviteNotice.previewUrl)}
                className="flex h-9 items-center justify-center gap-1 rounded-md border border-hairline bg-surface-1 px-3 text-xs font-semibold transition hover:bg-surface-2"
              >
                <Copy className="h-4 w-4" />
                <span>Copy</span>
              </button>
            </div>
          )}

          {inviteNotice?.warning && (
            <div className="my-4 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
              {inviteNotice.warning}
            </div>
          )}

          <DialogFooter>
            <button
              onClick={() => setInviteNotice(null)}
              className="w-full h-9 rounded-md bg-primary hover:bg-primary-hover text-xs font-semibold text-white transition"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
