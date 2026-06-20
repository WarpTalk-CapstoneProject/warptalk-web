"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
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
  Lock
} from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useWorkspaceInvitations,
  useInviteWorkspaceMember,
  useRevokeWorkspaceInvitation,
  useWorkspaceSettings
} from "@/hooks/use-workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  roleName: z.enum(["Admin", "Member"]),
  membershipType: z.enum(["Internal", "External"]),
});

type InviteFormData = z.infer<typeof inviteSchema>;

export default function WorkspaceInvitationsPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const currentRole = useWorkspaceStore((s) => s.role);
  const currentMembership = useWorkspaceStore((s) => s.membershipType);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // Success Link Dialog state
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<{ id: string; email: string } | null>(null);

  // Queries & Mutations
  const settingsQuery = useWorkspaceSettings(activeWorkspaceId || "");
  const invitationsQuery = useWorkspaceInvitations(activeWorkspaceId || "", page, 10, query);
  const inviteMutation = useInviteWorkspaceMember(activeWorkspaceId || "");
  const revokeMutation = useRevokeWorkspaceInvitation(activeWorkspaceId || "");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      roleName: "Member",
      membershipType: "Internal",
    },
  });

  const selectedRole = watch("roleName");
  const selectedMembership = watch("membershipType");

  if (!activeWorkspaceId) return null;

  // RBAC Access Control
  const isOwner = currentRole === "Owner";
  const isAdmin = currentRole === "Admin";
  const isOwnerOrAdmin = isOwner || isAdmin;
  const isExternal = currentMembership === "External";

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
    // Check external collaboration policy
    const settings = settingsQuery.data;
    if (formData.membershipType === "External" && settings && !settings.allowExternalCollaboration) {
      toast.error("External collaboration is disabled by workspace security policy.");
      return;
    }

    // Check verified domain requirement for internal members
    if (formData.membershipType === "Internal" && settings?.requireVerifiedDomainForInternal && settings.verifiedDomains.length > 0) {
      const emailDomain = formData.email.split("@")[1]?.toLowerCase();
      const isVerified = settings.verifiedDomains.some((d) => d.toLowerCase() === emailDomain);
      if (!isVerified) {
        toast.error(`Internal members must have an email domain matching verified domains: ${settings.verifiedDomains.join(", ")}`);
        return;
      }
    }

    try {
      const result = await inviteMutation.mutateAsync({
        email: formData.email,
        roleName: formData.roleName,
        membershipType: formData.membershipType,
      });

      // Construct and show the raw preview link
      const previewLink = `${window.location.origin}/invitations/${result.rawToken}`;
      setGeneratedLink(previewLink);
      reset();
      toast.success("Invitation generated!");
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Invitation link copied to clipboard!");
  };

  const invitesList = invitationsQuery.data?.items || [];

  return (
    <div className="flex min-h-full flex-col gap-6 pb-6 text-ink">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Invitations</h1>
        <p className="text-sm text-ink-muted">
          Invite members to join your workspace. Since email services are manual, generate the invitation link and share it directly.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Pending Invites List */}
        <Card className="border-hairline bg-surface-1 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-hairline">
            <div>
              <CardTitle className="text-base font-semibold">Active Invitations</CardTitle>
              <CardDescription className="text-xs">
                List of pending invitations. Invitees must open the link to join.
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
                placeholder="Search invitations..."
                className="h-8 pl-8 pr-3 text-xs bg-surface-2 border-hairline focus:ring-1 focus:ring-primary"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {invitationsQuery.isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Spinner className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : invitesList.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
                <EnvelopeSimple className="h-8 w-8 text-ink-muted" />
                <p className="text-sm font-medium">No pending invitations</p>
                <p className="text-xs text-ink-muted">Create an invite on the right rail.</p>
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

                {invitesList.map((invite) => (
                  <div
                    key={invite.id}
                    className="grid grid-cols-[1.5fr_100px_110px_100px_100px_48px] items-center gap-4 px-4 py-3 hover:bg-surface-2/30 transition-colors"
                  >
                    <span className="text-xs font-medium text-ink truncate">{invite.email}</span>
                    <span className="text-xs text-ink-muted">{invite.roleName}</span>
                    <span className="text-xs text-ink-muted">{invite.membershipType}</span>
                    <div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${
                          invite.status === "Pending"
                            ? "bg-amber-500/5 text-amber-500 border-amber-500/20"
                            : invite.status === "Accepted"
                              ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/20"
                              : "bg-surface-3 border-hairline text-ink-muted"
                        }`}
                      >
                        {invite.status}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-ink-muted">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </span>
                    <div className="flex justify-end">
                      <button
                        onClick={() => setInviteToRevoke({ id: invite.id, email: invite.email })}
                        disabled={invite.status !== "Pending"}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Revoke Invitation"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {invitationsQuery.data && invitationsQuery.data.total > 10 && (
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
                  disabled={invitesList.length < 10}
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
              Generate a secure join link for users.
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

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Membership Type</label>
                <Select
                  value={selectedMembership}
                  onValueChange={(val) => setValue("membershipType", val as "Internal" | "External")}
                >
                  <SelectTrigger className="h-9 text-xs bg-surface-2 border-hairline">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Internal" className="text-xs">Internal (Employee)</SelectItem>
                    <SelectItem value="External" className="text-xs">External (Partner/Client)</SelectItem>
                  </SelectContent>
                </Select>
                {errors.membershipType && (
                  <p className="text-[11px] text-destructive mt-0.5">{errors.membershipType.message}</p>
                )}
              </div>

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
                    <span>Generate Invitation</span>
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
              Revoking the invitation for <span className="font-semibold text-ink">{inviteToRevoke?.email}</span> will invalidate their secure join token. They will not be able to join using that link.
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

      {/* Generated Link Share Dialog */}
      <Dialog open={!!generatedLink} onOpenChange={(open) => !open && setGeneratedLink(null)}>
        <DialogContent className="border-hairline bg-surface-1 max-w-md">
          <DialogHeader className="flex flex-col gap-1.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
              <Check className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base">Invitation Link Ready</DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              Copy and share this link with the invitee manually so they can review and accept the invitation.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 flex gap-2">
            <Input
              readOnly
              value={generatedLink || ""}
              className="h-9 text-xs bg-surface-2 border-hairline flex-1 select-all cursor-text font-mono"
            />
            <button
              onClick={() => generatedLink && copyToClipboard(generatedLink)}
              className="h-9 px-3 flex items-center justify-center rounded-md border border-hairline bg-surface-1 hover:bg-surface-2 transition text-xs font-semibold gap-1"
            >
              <Copy className="h-4 w-4" />
              <span>Copy</span>
            </button>
          </div>

          <DialogFooter>
            <button
              onClick={() => setGeneratedLink(null)}
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
