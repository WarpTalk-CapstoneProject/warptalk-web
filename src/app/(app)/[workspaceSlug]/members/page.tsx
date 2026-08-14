"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle,
  Crown,
  Download,
  Funnel,
  Plus,
  SlidersHorizontal,
  Spinner,
  Trash,
  UserMinus,
  Users,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarPresenceDot } from "@/components/presence/presence-dot";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { Switch } from "@/components/ui/switch";
import { InviteMemberDialog } from "@/components/workspace/invite-member-dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { usePresence } from "@/hooks/use-presence";
import {
  useApproveJoinRequest,
  useRejectJoinRequest,
  useRemoveWorkspaceMember,
  useRevokeWorkspaceInvitation,
  useUpdateWorkspaceMember,
  useWorkspaceInvitations,
  useWorkspaceMembers,
} from "@/hooks/use-workspace";
import {
  buildMemberDirectory,
  filterMemberDirectory,
  groupMemberRowsByMembership,
  type DirectoryFilter,
  type DirectoryRow,
} from "@/lib/workspace/member-directory";
import type { WorkspaceInvitationDto } from "@/types/workspace";

const MEMBER_PAGE_SIZE = 10;

const invitationGridClass = "grid-cols-[2.3fr_110px_130px_110px_120px_120px_80px]";
const requestGridClass = "grid-cols-[2.4fr_130px_150px_110px_120px_118px]";

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "pending" || normalized === "requested") {
    return "border-amber-500/20 bg-amber-500/5 text-amber-600";
  }
  if (normalized === "accepted") {
    return "border-emerald-500/20 bg-emerald-500/5 text-emerald-600";
  }
  if (normalized === "rejected" || normalized === "revoked" || normalized === "expired") {
    return "border-destructive/20 bg-destructive/5 text-destructive";
  }
  return "border-border bg-surface-2 text-ink-muted";
}

function accessBadgeClass(type: string) {
  return type.toLowerCase() === "external"
    ? "rounded-[4px] border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
    : "rounded-[4px] border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700";
}

function sortInvitations(items: WorkspaceInvitationDto[]) {
  return [...items].sort((a, b) => {
    const activeRank = (status: string) =>
      status.toUpperCase() === "PENDING" || status.toUpperCase() === "REQUESTED" ? 0 : 1;
    const rankDelta = activeRank(a.status) - activeRank(b.status);
    if (rankDelta !== 0) return rankDelta;
    return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
  });
}

export default function WorkspaceMembersPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceName = useWorkspaceStore((s) => s.activeWorkspaceName);
  const currentRole = useWorkspaceRole();
  const currentUser = useAuthStore((s) => s.user);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<{ id: string; email: string } | null>(null);
  const [approvalType, setApprovalType] = useState<Record<string, "Internal" | "External">>({});
  const [isExporting, setIsExporting] = useState(false);

  const membersQuery = useWorkspaceMembers(
    activeWorkspaceId || "",
    page,
    MEMBER_PAGE_SIZE,
    query,
  );
  const invitationsQuery = useWorkspaceInvitations(
    activeWorkspaceId || "",
    1,
    100,
    query,
    "outbound",
  );
  const joinRequestsQuery = useWorkspaceInvitations(
    activeWorkspaceId || "",
    1,
    100,
    query,
    "join-request",
  );
  const removeMemberMutation = useRemoveWorkspaceMember(activeWorkspaceId || "");
  const updateMemberMutation = useUpdateWorkspaceMember(activeWorkspaceId || "");
  const revokeMutation = useRevokeWorkspaceInvitation(activeWorkspaceId || "");
  const approveJoinRequest = useApproveJoinRequest(activeWorkspaceId || "");
  const rejectJoinRequest = useRejectJoinRequest(activeWorkspaceId || "");

  const membersList = membersQuery.data?.items ?? [];
  const memberRows = buildMemberDirectory(membersList);
  const visibleMemberRows = filterMemberDirectory(memberRows, filter);
  const groupedRows = groupMemberRowsByMembership(visibleMemberRows);
  const invitationRows = sortInvitations(invitationsQuery.data?.items ?? []);
  const requestRows = sortInvitations(joinRequestsQuery.data?.items ?? []);

  usePresence(memberRows.map((row) => row.member.userId));

  if (!activeWorkspaceId) return null;

  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "admin";
  const isOwnerOrAdmin = isOwner || isAdmin;
  const isInvitationTab = filter === "invitations";
  const isJoinRequestTab = filter === "join-requests";
  const isMemberTab = !isInvitationTab && !isJoinRequestTab;
  const memberGridClass = isOwnerOrAdmin
    ? "grid-cols-[2.5fr_110px_120px_100px_120px_110px_92px]"
    : "grid-cols-[2.5fr_110px_120px_100px_120px]";

  const memberFilterPills: { key: DirectoryFilter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: memberRows.length },
    { key: "admin", label: "Admin", count: filterMemberDirectory(memberRows, "admin").length },
    { key: "member", label: "Member", count: filterMemberDirectory(memberRows, "member").length },
    { key: "internal", label: "Internal", count: filterMemberDirectory(memberRows, "internal").length },
    { key: "external", label: "External", count: filterMemberDirectory(memberRows, "external").length },
    ...(isOwnerOrAdmin
      ? [
          { key: "invitations" as const, label: "Invitations", count: invitationRows.length },
          { key: "join-requests" as const, label: "Join Requests", count: requestRows.length },
        ]
      : []),
  ];

  const pendingLoadFailed =
    isOwnerOrAdmin && (invitationsQuery.isError || joinRequestsQuery.isError);

  const handleExportXlsx = async () => {
    if (!isMemberTab) return;
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
        { header: "Joined At", key: "joinedAt", width: 20 },
        { header: "Host Meetings Permission", key: "canCreateMeetings", width: 22 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "1E293B" },
      };

      visibleMemberRows.forEach((row) => {
        worksheet.addRow({
          fullName: row.name || "N/A",
          email: row.email || "N/A",
          roleName: row.roleName || "Member",
          membershipType: row.membershipType || "Internal",
          status: row.member.status || "Active",
          joinedAt: row.date ? new Date(row.date).toLocaleDateString() : "N/A",
          canCreateMeetings: row.member.canCreateMeetings ? "Yes" : "No",
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = `${activeWorkspaceName || "Workspace"}_Members_${filter}_${dateStr}.xlsx`;
      saveAs(blob, fileName);
      toast.success("Members list exported successfully.");
    } catch {
      toast.error("Failed to export members list.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleToggleCanCreateMeetings = async (userId: string, currentVal: boolean) => {
    try {
      await updateMemberMutation.mutateAsync({
        userId,
        canCreateMeetings: !currentVal,
      });
      toast.success("Meeting host permission updated.");
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || "Failed to update meeting permission");
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

  const handleApprove = async (invite: WorkspaceInvitationDto) => {
    const membershipType =
      approvalType[invite.id] ||
      (invite.membershipType?.toLowerCase() === "internal" ? "Internal" : "External");
    try {
      const result = await approveJoinRequest.mutateAsync({
        inviteId: invite.id,
        membershipType,
      });
      toast.success(
        result.approvalEmailStatus === "Failed"
          ? "Member approved; approval email delivery failed."
          : "Join request approved and email sent.",
      );
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

  const renderMemberRow = (row: DirectoryRow) => {
    const member = row.member;
    const isSelf = member.userId === currentUser?.id;
    const memberRole = row.roleName.toLowerCase();
    const isExternal = row.membershipType.toLowerCase() === "external";
    const isOwnerRow = memberRole === "owner";

    return (
      <div
        key={row.key}
        className={`grid ${memberGridClass} items-center gap-4 rounded-md px-2 py-3 transition-colors hover:bg-surface-2/40 ${
          isOwnerRow ? "bg-primary/5 ring-1 ring-primary/10" : ""
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative h-8 w-8 shrink-0">
            <Avatar className={`h-8 w-8 border ${isOwnerRow ? "border-primary/40" : "border-hairline/80"}`}>
              <AvatarFallback className="bg-surface-3/80 text-xs font-semibold text-ink">
                {initials(row.name)}
              </AvatarFallback>
            </Avatar>
            <AvatarPresenceDot userId={member.userId} size="md" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-ink">
              {row.name}
              {isOwnerRow && (
                <span className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  <Crown className="h-3 w-3" weight="fill" />
                  Owner
                </span>
              )}
              {isSelf && (
                <span className="rounded border border-primary/20 bg-primary/10 px-1 py-0.2 text-[10px] font-normal text-primary">
                  You
                </span>
              )}
            </span>
            <span className="truncate text-[10px] text-ink-muted">{row.email}</span>
          </div>
        </div>

        <div>
          <Badge
            variant="outline"
            title={
              member && isExternal
                ? "External members always hold the Member role - it cannot be changed."
                : undefined
            }
            className={`max-w-full truncate whitespace-nowrap rounded-[4px] border-hairline px-2 py-0.5 text-[10px] font-semibold capitalize ${
              isOwnerRow ? "bg-primary/10 text-primary" : "bg-surface-2 text-ink"
            }`}
          >
            {row.roleName}
          </Badge>
        </div>

        <div>
          <Badge variant="outline" className={accessBadgeClass(row.membershipType)}>
            {row.membershipType}
          </Badge>
        </div>

        <div>
          <Badge
            variant="outline"
            className="rounded border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[10px] font-medium text-emerald-600"
          >
            Active
          </Badge>
        </div>

        <span className="text-xs font-medium text-ink-muted">{formatDate(row.date)}</span>

        {isOwnerOrAdmin && (
          <>
            <div className="flex justify-center">
              <Switch
                checked={member.canCreateMeetings}
                disabled={isSelf || memberRole === "owner"}
                onCheckedChange={() =>
                  handleToggleCanCreateMeetings(member.userId, member.canCreateMeetings)
                }
              />
            </div>
            <div className="flex justify-end gap-1">
              <button
                onClick={() => setMemberToRemove({ id: member.userId, name: row.name })}
                disabled={isSelf || memberRole === "owner" || (isAdmin && memberRole === "admin")}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
                title="Remove from workspace"
                aria-label={`Remove ${row.name} from workspace`}
              >
                <UserMinus className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderMemberTable = (title: string, rows: DirectoryRow[]) => (
    <section key={title} className="min-w-[1000px]">
      <div className="flex items-center justify-between px-2 pb-2 pt-4">
        <h2 className="text-[12px] font-semibold text-ink">{title}</h2>
        <span className="text-[11px] text-ink-muted">
          {rows.length} active member{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="divide-y divide-hairline/40">
        <div className={`grid ${memberGridClass} items-center gap-4 px-2 py-2 text-[11px] font-semibold uppercase text-ink-muted`}>
          <span>Name</span>
          <span>Role</span>
          <span>Membership Type</span>
          <span>Status</span>
          <span>Joined</span>
          {isOwnerOrAdmin && (
            <>
              <span className="text-center">Host meetings</span>
              <span className="text-right">Actions</span>
            </>
          )}
        </div>
        {rows.map(renderMemberRow)}
      </div>
    </section>
  );

  const renderInvitationsTable = () => (
    <div className="min-w-[1000px] divide-y divide-hairline/40">
      <div className={`grid ${invitationGridClass} items-center gap-4 px-2 py-2 text-[11px] font-semibold uppercase text-ink-muted`}>
        <span>Email</span>
        <span>Role</span>
        <span>Membership Type</span>
        <span>Status</span>
        <span>Created</span>
        <span>Expires</span>
        <span className="text-right">Actions</span>
      </div>
      {invitationRows.map((invite) => {
        const canRevoke = invite.status.toUpperCase() === "PENDING";
        return (
          <div key={invite.id} className={`grid ${invitationGridClass} items-center gap-4 rounded-md px-2 py-3 hover:bg-surface-2/40`}>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">{invite.email}</p>
              <p className="truncate text-[10px] text-ink-muted">{invite.deliveryStatus || "Delivery pending"}</p>
            </div>
            <Badge variant="outline" className="w-fit rounded-[4px] border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink">
              {invite.roleName}
            </Badge>
            <Badge variant="outline" className={`w-fit ${accessBadgeClass(invite.membershipType)}`}>
              {invite.membershipType}
            </Badge>
            <Badge variant="outline" className={`w-fit rounded px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(invite.status)}`}>
              {invite.status}
            </Badge>
            <span className="text-xs text-ink-muted">{formatDate(invite.createdAt)}</span>
            <span className="text-xs text-ink-muted">{formatDate(invite.expiresAt)}</span>
            <div className="flex justify-end">
              <button
                onClick={() => setInviteToRevoke({ id: invite.id, email: invite.email })}
                disabled={!canRevoke}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
                title={canRevoke ? "Revoke invitation" : "Only pending invitations can be revoked"}
                aria-label={`Revoke the invitation for ${invite.email}`}
              >
                <Trash className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderJoinRequestsTable = () => {
    const reviewBusy = approveJoinRequest.isPending || rejectJoinRequest.isPending;
    return (
      <div className="min-w-[1000px] divide-y divide-hairline/40">
        <div className={`grid ${requestGridClass} items-center gap-4 px-2 py-2 text-[11px] font-semibold uppercase text-ink-muted`}>
          <span>Email</span>
          <span>Provisional Type</span>
          <span>Approve As</span>
          <span>Status</span>
          <span>Requested</span>
          <span className="text-right">Actions</span>
        </div>
        {requestRows.map((request) => {
          const isRequested = request.status.toUpperCase() === "REQUESTED";
          const allowedTypes = request.allowedFinalMembershipTypes ?? ["Internal", "External"];
          const selectedType =
            approvalType[request.id] ||
            (request.membershipType?.toLowerCase() === "internal" ? "Internal" : "External");
          const selectedTypeAllowed = allowedTypes.some(
            (type) => type.toLowerCase() === selectedType.toLowerCase(),
          );
          return (
            <div key={request.id} className={`grid ${requestGridClass} items-center gap-4 rounded-md px-2 py-3 hover:bg-surface-2/40`}>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-ink">{request.email}</p>
                {request.policyReason && (
                  <p className="truncate text-[10px] text-amber-600">{request.policyReason}</p>
                )}
              </div>
              <Badge variant="outline" className={`w-fit ${accessBadgeClass(request.membershipType)}`}>
                {request.membershipType}
              </Badge>
              <select
                value={selectedType}
                onChange={(event) =>
                  setApprovalType((current) => ({
                    ...current,
                    [request.id]: event.target.value as "Internal" | "External",
                  }))
                }
                disabled={!isRequested || reviewBusy}
                aria-label={`Approval access type for ${request.email}`}
                className="h-7 w-fit min-w-[112px] rounded-md border border-hairline bg-surface-2 px-2 text-[11px] text-ink disabled:opacity-60"
              >
                <option value="Internal" disabled={!allowedTypes.some((type) => type.toLowerCase() === "internal")}>
                  Internal
                </option>
                <option value="External" disabled={!allowedTypes.some((type) => type.toLowerCase() === "external")}>
                  External
                </option>
              </select>
              <Badge variant="outline" className={`w-fit rounded px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(request.status)}`}>
                {request.status}
              </Badge>
              <span className="text-xs text-ink-muted">{formatDate(request.createdAt)}</span>
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => handleApprove(request)}
                  disabled={!isRequested || reviewBusy || !selectedTypeAllowed}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
                  title="Approve join request"
                  aria-label={`Approve the join request from ${request.email}`}
                >
                  <CheckCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleReject(request.id)}
                  disabled={!isRequested || reviewBusy}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
                  title="Reject join request"
                  aria-label={`Reject the join request from ${request.email}`}
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const isLoadingCurrentTab =
    (isMemberTab && membersQuery.isLoading) ||
    (isInvitationTab && invitationsQuery.isLoading) ||
    (isJoinRequestTab && joinRequestsQuery.isLoading);

  const isEmptyCurrentTab =
    (isMemberTab && visibleMemberRows.length === 0) ||
    (isInvitationTab && invitationRows.length === 0) ||
    (isJoinRequestTab && requestRows.length === 0);

  return (
    <div className="flex h-full flex-col bg-surface-1 text-ink">
      <div className="flex shrink-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 overflow-x-auto hide-scrollbar">
          {memberFilterPills.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setFilter(item.key);
                setPage(1);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] transition-all select-none ${
                filter === item.key
                  ? "border-transparent bg-surface-2 font-medium text-foreground shadow-none"
                  : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {item.label}
              {typeof item.count === "number" ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[9px] font-bold text-primary">
                  {item.count}
                </span>
              ) : null}
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
            placeholder="Search people..."
            ariaLabel="Search people"
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
            {filter !== "all" && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
            )}
          </button>
          <button
            className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            title={`${isMemberTab ? visibleMemberRows.length : isInvitationTab ? invitationRows.length : requestRows.length} records`}
          >
            <SlidersHorizontal weight="bold" size={13} />
          </button>

          {isOwnerOrAdmin && (
            <>
              <div className="mx-1 h-4 w-[1px] bg-border" />
              {isMemberTab && (
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
              )}
              <button
                onClick={() => setIsInviteOpen(true)}
                className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Invite new member</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto px-4 pb-6">
        {pendingLoadFailed && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600">
            <Warning className="h-3.5 w-3.5 shrink-0" />
            <span>Pending invitations and join requests could not be loaded.</span>
          </div>
        )}

        {isLoadingCurrentTab ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isEmptyCurrentTab ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline bg-surface-1/10 text-center">
            <Users className="h-8 w-8 text-ink-muted" />
            <p className="text-sm font-medium">
              {isInvitationTab
                ? "No invitations found"
                : isJoinRequestTab
                  ? "No join requests found"
                  : "No active members found"}
            </p>
            <p className="text-xs text-ink-muted">
              {isInvitationTab
                ? "Sent workspace invitations will appear here."
                : isJoinRequestTab
                  ? "Inbound join requests will appear here."
                  : "Try adjusting your search terms or filters."}
            </p>
          </div>
        ) : isInvitationTab ? (
          renderInvitationsTable()
        ) : isJoinRequestTab ? (
          renderJoinRequestsTable()
        ) : (
          <>
            {groupedRows.internal.length > 0 && renderMemberTable("Internal Members", groupedRows.internal)}
            {groupedRows.external.length > 0 && renderMemberTable("External Members", groupedRows.external)}
          </>
        )}

        {isMemberTab && membersQuery.data && membersQuery.data.total > MEMBER_PAGE_SIZE && (
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-hairline/60 px-2 py-3">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="cursor-pointer rounded border border-hairline px-2.5 py-1 text-xs font-medium hover:bg-surface-2 disabled:opacity-45"
            >
              Previous
            </button>
            <span className="text-xs font-medium text-ink-muted">Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={membersList.length < MEMBER_PAGE_SIZE}
              className="cursor-pointer rounded border border-hairline px-2.5 py-1 text-xs font-medium hover:bg-surface-2 disabled:opacity-45"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <InviteMemberDialog
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
        workspaceId={activeWorkspaceId}
        workspaceName={activeWorkspaceName}
        canGrantAdmin={isOwner}
      />

      <Dialog
        open={!!memberToRemove}
        onOpenChange={(open: boolean) => !open && setMemberToRemove(null)}
      >
        <DialogContent className="max-w-sm border-hairline bg-surface-1">
          <DialogHeader className="flex flex-col gap-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center text-base font-bold text-foreground">
              Remove Member?
            </DialogTitle>
            <DialogDescription className="text-center text-xs leading-normal text-ink-muted">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-ink">{memberToRemove?.name}</span>
              ? They will instantly lose access to all meetings, documents, and transcripts in this workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => setMemberToRemove(null)}
              className="h-9 flex-1 cursor-pointer rounded-md border border-hairline bg-surface-1 text-xs font-semibold transition hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={handleRemoveConfirm}
              className="h-9 flex-1 cursor-pointer rounded-md bg-destructive text-xs font-semibold text-white transition hover:bg-destructive/90"
            >
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!inviteToRevoke}
        onOpenChange={(open: boolean) => !open && setInviteToRevoke(null)}
      >
        <DialogContent className="max-w-sm border-hairline bg-surface-1">
          <DialogHeader className="flex flex-col gap-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center text-base font-bold text-foreground">
              Revoke Invitation?
            </DialogTitle>
            <DialogDescription className="text-center text-xs leading-normal text-ink-muted">
              Revoking the invitation for{" "}
              <span className="font-semibold text-ink">{inviteToRevoke?.email}</span>{" "}
              prevents that pending invitation from being accepted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => setInviteToRevoke(null)}
              className="h-9 flex-1 cursor-pointer rounded-md border border-hairline bg-surface-1 text-xs font-semibold transition hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={handleRevoke}
              disabled={revokeMutation.isPending}
              className="h-9 flex-1 cursor-pointer rounded-md bg-destructive text-xs font-semibold text-white transition hover:bg-destructive/90 disabled:opacity-50"
            >
              {revokeMutation.isPending ? (
                <Spinner className="h-4 w-4 animate-spin" />
              ) : (
                "Revoke"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
