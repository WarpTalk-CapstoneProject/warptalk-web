"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Users,
  Trash,
  Spinner,
  Warning,
  Plus,
  Check
} from "@phosphor-icons/react";

import { WorkspaceMemberDto } from "@/types/workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAuthStore } from "@/stores/auth-store";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import {
  useWorkspaceMembers,
  useRemoveWorkspaceMember,
  useChangeWorkspaceMemberRole,
  useUpdateWorkspaceMember,
  useInviteWorkspaceMember,
  useWorkspaceSettings
} from "@/hooks/use-workspace";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FilterDock,
  FilterDockRow,
  FilterDockSection,
  filterDockSelectContentClass,
  filterDockSelectItemClass,
  filterDockSelectTriggerClass,
} from "@/components/ui/filter-dock";

const ROLES = ["Owner", "Admin", "Member"];

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  roleName: z.enum(["Admin", "Member"]),
  membershipType: z.enum(["Internal", "External"]),
});

type InviteFormData = z.infer<typeof inviteSchema>;

export default function WorkspaceMembersPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const currentRole = useWorkspaceStore((s) => s.role);
  const currentUser = useAuthStore((s) => s.user);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal and invitation states
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);

  // TanStack Query Hooks
  const membersQuery = useWorkspaceMembers(activeWorkspaceId || "", page, 10, query);
  const removeMemberMutation = useRemoveWorkspaceMember(activeWorkspaceId || "");
  const changeRoleMutation = useChangeWorkspaceMemberRole(activeWorkspaceId || "");
  const updateMemberMutation = useUpdateWorkspaceMember(activeWorkspaceId || "");
  const inviteMutation = useInviteWorkspaceMember(activeWorkspaceId || "");
  const settingsQuery = useWorkspaceSettings(activeWorkspaceId || "");

  // Invite form setup
  const {
    register: registerInvite,
    handleSubmit: handleSubmitInvite,
    setValue: setValueInvite,
    watch: watchInvite,
    reset: resetInvite,
    formState: { errors: inviteErrors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      roleName: "Member",
      membershipType: "Internal",
    },
  });

  const selectedInviteRole = watchInvite("roleName");
  const selectedInviteMembership = watchInvite("membershipType");

  if (!activeWorkspaceId) return null;

  const isOwner = currentRole === "Owner";
  const isAdmin = currentRole === "Admin";
  const isOwnerOrAdmin = isOwner || isAdmin;

  const membersList = membersQuery.data?.items || [];
  const activeFilterCount = [roleFilter !== "all", statusFilter !== "all"].filter(Boolean).length;

  // Client-side filtering for Role and Status
  const filteredMembers = membersList.filter((member) => {
    const matchesRole = roleFilter === "all" || member.roleName.toLowerCase() === roleFilter.toLowerCase();
    const matchesStatus = statusFilter === "all" || member.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesRole && matchesStatus;
  });

  const handleToggleCanCreateMeetings = async (userId: string, currentVal: boolean) => {
    try {
      await updateMemberMutation.mutateAsync({ userId, canCreateMeetings: !currentVal });
      toast.success("Meeting host permission updated.");
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || "Failed to update meeting permission");
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await changeRoleMutation.mutateAsync({ userId, roleName: newRole });
      toast.success(`Role updated to ${newRole}`);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || "Failed to update role");
    }
  };

  const handleRemoveConfirm = async () => {
    if (!memberToRemove) return;
    try {
      await removeMemberMutation.mutateAsync(memberToRemove.id);
      toast.success(`${memberToRemove.name} has been removed.`);
      setMemberToRemove(null);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || "Failed to remove member");
    }
  };

  const handleInvite = async (formData: InviteFormData) => {
    const settings = settingsQuery.data;
    if (formData.membershipType === "External" && settings && !settings.allowExternalCollaboration) {
      toast.error("External collaboration is disabled by workspace security policy.");
      return;
    }

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

      const previewLink = `${window.location.origin}/invitations/${result.rawToken}`;
      setGeneratedLink(previewLink);
      setIsInviteOpen(false);
      resetInvite();
      toast.success("Invitation generated!");
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || "Failed to create invitation");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Invitation link copied to clipboard!");
  };

  const canModifyRole = (targetMember: WorkspaceMemberDto) => {
    if (isOwner) return true;
    if (isAdmin) {
      return targetMember.roleName !== "Owner" && targetMember.roleName !== "Admin";
    }
    return false;
  };

  const initials = (name: string) => {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  };

  return (
    <div className="flex min-h-full flex-col gap-6 px-4 py-4 pb-6 text-ink">
      {/* Filter, Search, and Action triggers - Unified horizontal design */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-hairline gap-4 pt-2">
        <div className="flex flex-wrap items-center flex-1 gap-2 max-w-2xl">
          <ExpandingSearchDock
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search by name or email"
            ariaLabel="Search members"
          />

          <FilterDock activeCount={activeFilterCount} label="Member filters">
            <FilterDockSection title="Member filters">
              <FilterDockRow label="Role" icon={<Users size={15} />}>
                <Select value={roleFilter} onValueChange={(val) => setRoleFilter(val || "all")}>
                  <SelectTrigger aria-label="Role" className={filterDockSelectTriggerClass}>
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent className={filterDockSelectContentClass}>
                    <SelectItem value="all" className={filterDockSelectItemClass}>All Roles</SelectItem>
                    <SelectItem value="owner" className={filterDockSelectItemClass}>Owner</SelectItem>
                    <SelectItem value="admin" className={filterDockSelectItemClass}>Admin</SelectItem>
                    <SelectItem value="member" className={filterDockSelectItemClass}>Member</SelectItem>
                  </SelectContent>
                </Select>
              </FilterDockRow>

              <FilterDockRow label="Status" icon={<Check size={15} />}>
                <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val || "all")}>
                  <SelectTrigger aria-label="Status" className={filterDockSelectTriggerClass}>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent className={filterDockSelectContentClass}>
                    <SelectItem value="all" className={filterDockSelectItemClass}>All Statuses</SelectItem>
                    <SelectItem value="active" className={filterDockSelectItemClass}>Active</SelectItem>
                  </SelectContent>
                </Select>
              </FilterDockRow>
            </FilterDockSection>

            <button
              type="button"
              onClick={() => {
                setRoleFilter("all");
                setStatusFilter("all");
                setPage(1);
              }}
              className="mt-2 h-8 w-full rounded-lg border border-neutral-800 text-[12px] font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-neutral-50"
            >
              Reset filters
            </button>
          </FilterDock>
        </div>

        {/* Invite button next to filters */}
        {isOwnerOrAdmin && (
          <button
            onClick={() => {
              resetInvite();
              setIsInviteOpen(true);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary hover:bg-primary-hover px-3 text-xs font-semibold text-white transition duration-150 cursor-pointer shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Invite</span>
          </button>
        )}
      </div>

      {/* Members Table */}
      <div className="overflow-x-auto">
        {membersQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center border border-dashed border-hairline rounded-lg bg-surface-1/10">
            <Users className="h-8 w-8 text-ink-muted" />
            <p className="text-sm font-medium">No members found</p>
            <p className="text-xs text-ink-muted">Try adjusting your search terms or filters.</p>
          </div>
        ) : (
          <div className="min-w-[750px] divide-y divide-hairline/40">
            {/* Header row */}
            <div className="grid grid-cols-[2.5fr_120px_100px_120px_110px_48px] items-center gap-4 px-2 py-2 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
              <span>Name</span>
              <span>Role</span>
              <span>Status</span>
              <span>Joined</span>
              <span className="text-center">Host meetings</span>
              <span className="text-right">Actions</span>
            </div>

            {/* Data rows */}
            {filteredMembers.map((member) => {
              const isSelf = member.userId === currentUser?.id;
              const canModifyThisMember = canModifyRole(member) && !isSelf;

              return (
                <div
                  key={member.id}
                  className="grid grid-cols-[2.5fr_120px_100px_120px_110px_48px] items-center gap-4 px-2 py-3 hover:bg-surface-2/30 transition-colors rounded-md"
                >
                  {/* User name, email & avatar */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8 border border-hairline/80">
                      <AvatarFallback className="bg-surface-3/80 text-xs font-semibold text-ink">
                        {initials(member.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-ink truncate flex items-center gap-1.5">
                        {member.fullName}
                        {isSelf && (
                          <span className="text-[10px] px-1 py-0.2 bg-primary/10 text-primary border border-primary/20 rounded font-normal">
                            You
                          </span>
                        )}
                      </span>
                      {member.email && (
                        <span className="text-[10px] text-ink-muted truncate">
                          {member.email}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Role selector */}
                  <div>
                    {canModifyThisMember ? (
                      <Select
                        value={member.roleName}
                        onValueChange={(val) => handleRoleChange(member.userId, val || "")}
                      >
                        <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.filter((r) => isOwner || r !== "Admin").map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs font-medium text-ink bg-surface-3/60 border border-hairline/80 px-2 py-0.8 rounded-[4px]">
                        {member.roleName}
                      </span>
                    )}
                  </div>

                  {/* Status from Backend */}
                  <div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize font-medium px-2 py-0.5 rounded ${
                        member.status === "Active"
                          ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/20"
                          : "bg-surface-3/50 border-hairline text-ink-muted"
                      }`}
                    >
                      {member.status.toLowerCase()}
                    </Badge>
                  </div>

                  {/* Joined Date */}
                  <span className="text-xs text-ink-muted font-medium">
                    {new Date(member.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>

                  {/* Meeting host toggle */}
                  <div className="flex justify-center">
                    <Switch
                      checked={member.canCreateMeetings}
                      disabled={!isOwnerOrAdmin || isSelf || member.roleName === "Owner"}
                      onCheckedChange={() =>
                        handleToggleCanCreateMeetings(member.userId, member.canCreateMeetings)
                      }
                    />
                  </div>

                  {/* Remove button */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => setMemberToRemove({ id: member.userId, name: member.fullName })}
                      disabled={!isOwnerOrAdmin || isSelf || member.roleName === "Owner" || (isAdmin && member.roleName === "Admin")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted cursor-pointer"
                      title="Remove Member"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {membersQuery.data && membersQuery.data.total > 10 && (
          <div className="flex items-center justify-end px-2 py-3 border-t border-hairline/60 gap-2 mt-2">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="px-2.5 py-1 text-xs border border-hairline rounded hover:bg-surface-2 disabled:opacity-45 cursor-pointer font-medium"
            >
              Previous
            </button>
            <span className="text-xs text-ink-muted font-medium">Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={membersList.length < 10}
              className="px-2.5 py-1 text-xs border border-hairline rounded hover:bg-surface-2 disabled:opacity-45 cursor-pointer font-medium"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="border-hairline bg-surface-1 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bold text-base text-foreground">Invite Member</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Generate a secure join link for a new member.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitInvite(handleInvite)} className="flex flex-col gap-4 my-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Email Address</label>
              <Input
                type="email"
                placeholder="user@domain.com"
                className="h-9 border-hairline focus:ring-1 focus:ring-primary focus-visible:ring-1 focus-visible:ring-primary bg-surface-2/40"
                {...registerInvite("email")}
                disabled={inviteMutation.isPending}
              />
              {inviteErrors.email && (
                <p className="text-[11px] text-destructive mt-0.5">{inviteErrors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Workspace Role</label>
              <Select
                value={selectedInviteRole}
                onValueChange={(val) => setValueInvite("roleName", val as "Admin" | "Member")}
              >
                <SelectTrigger className="h-9 text-xs bg-surface-2 border-hairline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Member" className="text-xs">Member (Standard)</SelectItem>
                  <SelectItem value="Admin" className="text-xs">Admin (Operational Manager)</SelectItem>
                </SelectContent>
              </Select>
              {inviteErrors.roleName && (
                <p className="text-[11px] text-destructive mt-0.5">{inviteErrors.roleName.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Membership Type</label>
              <Select
                value={selectedInviteMembership}
                onValueChange={(val) => setValueInvite("membershipType", val as "Internal" | "External")}
              >
                <SelectTrigger className="h-9 text-xs bg-surface-2 border-hairline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Internal" className="text-xs">Internal (Employee)</SelectItem>
                  <SelectItem value="External" className="text-xs">External (Partner/Client)</SelectItem>
                </SelectContent>
              </Select>
              {inviteErrors.membershipType && (
                <p className="text-[11px] text-destructive mt-0.5">{inviteErrors.membershipType.message}</p>
              )}
            </div>

            <DialogFooter className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setIsInviteOpen(false)}
                className="h-9 px-4 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviteMutation.isPending}
                className="h-9 px-4 rounded-md bg-primary hover:bg-primary-hover text-xs font-semibold text-white transition disabled:opacity-50 cursor-pointer"
              >
                {inviteMutation.isPending ? (
                  <Spinner className="h-4 w-4 animate-spin text-white" />
                ) : (
                  "Invite member"
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generated Link Share Dialog */}
      <Dialog open={!!generatedLink} onOpenChange={(open) => !open && setGeneratedLink(null)}>
        <DialogContent className="border-hairline bg-surface-1 max-w-md">
          <DialogHeader className="flex flex-col gap-1.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
              <Check className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base text-foreground">Invitation Link Ready</DialogTitle>
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
              className="h-9 px-3 flex items-center justify-center rounded-md border border-hairline bg-surface-1 hover:bg-surface-2 transition text-xs font-semibold gap-1 cursor-pointer"
            >
              <span>Copy</span>
            </button>
          </div>

          <DialogFooter>
            <button
              onClick={() => setGeneratedLink(null)}
              className="w-full h-9 rounded-md bg-primary hover:bg-primary-hover text-xs font-semibold text-white transition cursor-pointer"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader className="flex flex-col gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base text-foreground">Remove Member?</DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              Are you sure you want to remove <span className="font-semibold text-ink">{memberToRemove?.name}</span>?
              They will instantly lose access to all meetings, documents, and transcripts in this workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setMemberToRemove(null)}
              className="flex-1 h-9 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleRemoveConfirm}
              className="flex-1 h-9 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition cursor-pointer"
            >
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
