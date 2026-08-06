"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Users,
  UserMinus,
  Funnel,
  Spinner,
  Warning,
  Plus,
  Check,
  Copy,
  Download,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { useAuthStore } from "@/stores/auth-store";
import {
  useWorkspaceMembers,
  useRemoveWorkspaceMember,
  useUpdateWorkspaceMember,
  useInviteWorkspaceMember,
} from "@/hooks/use-workspace";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarPresenceDot } from "@/components/presence/presence-dot";
import { usePresence } from "@/hooks/use-presence";
import { Badge } from "@/components/ui/badge";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  roleName: z.enum(["Admin", "Member"]),
});

type InviteFormData = z.infer<typeof inviteSchema>;

export default function WorkspaceMembersPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceName = useWorkspaceStore((s) => s.activeWorkspaceName);
  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const currentRole = useWorkspaceRole();
  const currentUser = useAuthStore((s) => s.user);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal and invitation states
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<{
    email: string;
    previewUrl: string;
    warning?: string | null;
  } | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // TanStack Query Hooks
  const membersQuery = useWorkspaceMembers(
    activeWorkspaceId || "",
    page,
    10,
    query,
  );
  const removeMemberMutation = useRemoveWorkspaceMember(
    activeWorkspaceId || "",
  );
  const updateMemberMutation = useUpdateWorkspaceMember(
    activeWorkspaceId || "",
  );
  const inviteMutation = useInviteWorkspaceMember(activeWorkspaceId || "");

  // Invite form setup
  const {
    register: registerInvite,
    handleSubmit: handleSubmitInvite,
    setValue: setValueInvite,
    control: inviteControl,
    reset: resetInvite,
    formState: { errors: inviteErrors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      roleName: "Member",
    },
  });

  const selectedInviteRole = useWatch({
    control: inviteControl,
    name: "roleName",
  });

  const membersList = membersQuery.data?.items || [];

  // One presence lookup for the page of members being shown. Above the early return below:
  // a hook after it would not run on the render where there is no active workspace, which
  // changes hook order between renders.
  usePresence(membersList.map((member) => member.userId));

  if (!activeWorkspaceId) return null;

  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "admin";
  const isOwnerOrAdmin = isOwner || isAdmin;
  const memberGridClass = isOwnerOrAdmin
    ? "grid-cols-[2.5fr_100px_100px_100px_120px_110px_48px]"
    : "grid-cols-[2.5fr_100px_100px_100px_120px]";

  const memberFilterPills = [
    { key: "all", label: "All", role: "all", status: "all" },
    { key: "owner", label: "Owner", role: "owner", status: "all" },
    { key: "admin", label: "Admin", role: "admin", status: "all" },
    { key: "member", label: "Member", role: "member", status: "all" },
    { key: "active", label: "Active", role: "all", status: "active" },
  ] as const;
  const activeMemberFilter =
    memberFilterPills.find(
      (item) => item.role === roleFilter && item.status === statusFilter,
    )?.key ?? "custom";

  // Client-side filtering for Role and Status
  const filteredMembers = membersList.filter((member) => {
    const matchesRole =
      roleFilter === "all" ||
      member.roleName.toLowerCase() === roleFilter.toLowerCase();
    const matchesStatus =
      statusFilter === "all" ||
      member.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesRole && matchesStatus;
  });

  const handleExportXlsx = async () => {
    try {
      setIsExporting(true);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Members");

      worksheet.columns = [
        { header: "Full Name", key: "fullName", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Role", key: "roleName", width: 15 },
        { header: "Membership Type", key: "membershipType", width: 18 },
        { header: "Status", key: "status", width: 12 },
        { header: "Joined Date", key: "joinedAt", width: 20 },
        {
          header: "Host Meetings Permission",
          key: "canCreateMeetings",
          width: 22,
        },
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "1E293B" },
      };

      filteredMembers.forEach((m) => {
        worksheet.addRow({
          fullName: m.fullName || "N/A",
          email: m.email || "N/A",
          roleName: m.roleName || "Member",
          membershipType: m.membershipType || "Internal",
          status: m.status || "Active",
          joinedAt: m.joinedAt
            ? new Date(m.joinedAt).toLocaleDateString()
            : "N/A",
          canCreateMeetings: m.canCreateMeetings ? "Yes" : "No",
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = `${activeWorkspaceName || "Workspace"}_Members_${dateStr}.xlsx`;
      saveAs(blob, fileName);
      toast.success("Members list exported successfully!");
    } catch {
      toast.error("Failed to export members list.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleToggleCanCreateMeetings = async (
    userId: string,
    currentVal: boolean,
  ) => {
    try {
      await updateMemberMutation.mutateAsync({
        userId,
        canCreateMeetings: !currentVal,
      });
      toast.success("Meeting host permission updated.");
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || "Failed to update meeting permission",
      );
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
      setIsInviteOpen(false);
      resetInvite();
      toast.success(
        result.warning
          ? "Invitation created, but email delivery failed."
          : "Invitation sent.",
      );
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || "Failed to create invitation",
      );
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Email preview URL copied.");
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
    <div className="flex h-full flex-col bg-surface-1 text-ink">
      {/* Filter, Search, and Action triggers - Unified horizontal design */}
      <div className="flex shrink-0 flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
          {memberFilterPills.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setRoleFilter(item.role);
                setStatusFilter(item.status);
              }}
              className={`flex items-center justify-center rounded-full border px-4 py-1.5 text-[13px] transition-all select-none ${
                activeMemberFilter === item.key
                  ? "border-transparent bg-surface-2 text-foreground font-medium shadow-none"
                  : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 pl-4">
          <ExpandingSearchDock
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search members..."
            ariaLabel="Search members"
            collapsedWidth={28}
            expandedWidth={220}
            className="h-[28px] border-border/60 bg-surface-2 text-ink shadow-sm backdrop-blur-md focus-within:bg-surface-1"
            iconButtonClassName="ml-0 size-[26px] hover:bg-surface-3"
            clearButtonClassName="mr-0.5 size-5 hover:bg-surface-3"
            inputClassName="h-[26px] text-[12px]"
          />
          <button
            className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            title="Member filters"
          >
            <Funnel weight="bold" size={13} />
            {(roleFilter !== "all" || statusFilter !== "all") && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
            )}
          </button>
          <button
            className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            title={`${filteredMembers.length} members`}
          >
            <SlidersHorizontal weight="bold" size={13} />
          </button>

          {isOwnerOrAdmin && (
            <>
              <div className="mx-1 h-4 w-[1px] bg-border" />
            <button
              onClick={handleExportXlsx}
              disabled={isExporting}
              className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2 disabled:opacity-50"
            >
              {isExporting ? (
                <Spinner className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Download className="h-3.5 w-3.5 text-primary" />
              )}
              <span>{isExporting ? "Exporting..." : "Export (.xlsx)"}</span>
            </button>

            <button
              onClick={() => {
                resetInvite();
                setIsInviteOpen(true);
              }}
              className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Invite</span>
            </button>
            </>
          )}
        </div>
      </div>

      {/* Members Table */}
      <div className="overflow-x-auto px-4 pb-6">
        {membersQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center border border-dashed border-hairline rounded-lg bg-surface-1/10">
            <Users className="h-8 w-8 text-ink-muted" />
            <p className="text-sm font-medium">No members found</p>
            <p className="text-xs text-ink-muted">
              Try adjusting your search terms or filters.
            </p>
          </div>
        ) : (
          <div className="min-w-[750px] divide-y divide-hairline/40">
            {/* Header row */}
            <div className={`grid ${memberGridClass} items-center gap-4 px-2 py-2 text-[11px] font-semibold uppercase text-ink-muted`}>
              <span>Name</span>
              <span>Role</span>
              <span>Membership Type</span>
              <span>Status</span>
              <span>Joined</span>
              {isOwnerOrAdmin && <><span className="text-center">Host meetings</span><span className="text-right">Actions</span></>}
            </div>

            {/* Data rows */}
            {filteredMembers.map((member) => {
              const isSelf = member.userId === currentUser?.id;
              const memberRole = member.roleName.toLowerCase();
              const memberStatus = member.status.toLowerCase();

              return (
                <div
                  key={member.id}
                  className={`grid ${memberGridClass} items-center gap-4 rounded-md px-2 py-3 transition-colors hover:bg-surface-2/40`}
                >
                  {/* User name, email & avatar */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-8 w-8 shrink-0">
                      <Avatar className="h-8 w-8 border border-hairline/80">
                        <AvatarFallback className="bg-surface-3/80 text-xs font-semibold text-ink">
                          {initials(member.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <AvatarPresenceDot userId={member.userId} size="md" />
                    </div>
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

                  {/* Role Badge */}
                  <div>
                    <Badge
                      variant="outline"
                      className="rounded-[4px] border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-semibold capitalize text-ink"
                    >
                      {member.membershipType.toLowerCase() === "external"
                        ? "Member · External · Fixed"
                        : member.roleName}
                    </Badge>
                  </div>

                  {/* Membership Type Badge */}
                  <div>
                    <Badge
                      variant="outline"
                      className={
                        member.membershipType.toLowerCase() === "external"
                          ? "rounded-[4px] border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                          : "rounded-[4px] border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
                      }
                    >
                      {member.membershipType}
                    </Badge>
                  </div>

                  {/* Status from Backend */}
                  <div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize font-medium px-2 py-0.5 rounded ${
                        memberStatus === "active"
                          ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/20"
                          : "bg-surface-3/50 border-hairline text-ink-muted"
                      }`}
                    >
                      {member.status.toLowerCase()}
                    </Badge>
                  </div>

                  {/* Joined Date */}
                  <span className="text-xs text-ink-muted font-medium">
                    {new Date(member.joinedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>

                  {/* Meeting host toggle */}
                  <div className="flex justify-center">
                    <Switch
                      checked={member.canCreateMeetings}
                      disabled={
                        !isOwnerOrAdmin || isSelf || memberRole === "owner"
                      }
                      onCheckedChange={() =>
                        handleToggleCanCreateMeetings(
                          member.userId,
                          member.canCreateMeetings,
                        )
                      }
                    />
                  </div>

                  {/* Remove button */}
                  <div className="flex justify-end">
                    <button
                      onClick={() =>
                        setMemberToRemove({
                          id: member.userId,
                          name: member.fullName,
                        })
                      }
                      disabled={
                        !isOwnerOrAdmin ||
                        isSelf ||
                        memberRole === "owner" ||
                        (isAdmin && memberRole === "admin")
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted cursor-pointer"
                      title="Remove from workspace"
                      aria-label={`Remove ${member.fullName} from workspace`}
                    >
                      <UserMinus className="h-4 w-4" />
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
            <span className="text-xs text-ink-muted font-medium">
              Page {page}
            </span>
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
            <DialogTitle className="font-bold text-base text-foreground">
              Invite Member
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Generate a secure join link for a new member.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmitInvite(handleInvite)}
            className="flex flex-col gap-4 my-2"
          >
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
                <p className="text-[11px] text-destructive mt-0.5">
                  {inviteErrors.email.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Workspace Role</label>
              <Select
                value={selectedInviteRole}
                onValueChange={(val: string | null) => {
                  if (val)
                    setValueInvite("roleName", val as "Admin" | "Member");
                }}
              >
                <SelectTrigger className="h-9 text-xs bg-surface-2 border-hairline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Member" className="text-xs">
                    Member (Standard)
                  </SelectItem>
                  {isOwner && (
                    <SelectItem value="Admin" className="text-xs">
                      Admin (Operational Manager)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {inviteErrors.roleName && (
                <p className="text-[11px] text-destructive mt-0.5">
                  {inviteErrors.roleName.message}
                </p>
              )}
            </div>

            <p className="rounded-md border border-hairline bg-surface-2 px-3 py-2 text-[11px] leading-5 text-ink-muted">
              Internal or External access is assigned automatically from the
              workspace&apos;s verified domains.
            </p>

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
      <Dialog
        open={!!inviteNotice}
        onOpenChange={(open: boolean) => !open && setInviteNotice(null)}
      >
        <DialogContent className="border-hairline bg-surface-1 max-w-md">
          <DialogHeader className="flex flex-col gap-1.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
              <Check className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base text-foreground">
              Invitation Created
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              The invite is bound to{" "}
              <span className="font-semibold text-ink">
                {inviteNotice?.email}
              </span>
              . A secure invitation email has been sent to that address.
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
                onClick={() =>
                  inviteNotice.previewUrl &&
                  copyToClipboard(inviteNotice.previewUrl)
                }
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
              className="w-full h-9 rounded-md bg-primary hover:bg-primary-hover text-xs font-semibold text-white transition cursor-pointer"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog
        open={!!memberToRemove}
        onOpenChange={(open: boolean) => !open && setMemberToRemove(null)}
      >
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader className="flex flex-col gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base text-foreground">
              Remove Member?
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-ink">
                {memberToRemove?.name}
              </span>
              ? They will instantly lose access to all meetings, documents, and
              transcripts in this workspace.
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
