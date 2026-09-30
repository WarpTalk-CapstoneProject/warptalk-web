"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import {
  UserMinus,
  Funnel,
  Spinner,
  Warning,
  Plus,
  Download,
  SlidersHorizontal,
  Trash,
  CheckCircle,
  XCircle,
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
  useWorkspaceInvitations,
  useRevokeWorkspaceInvitation,
  useApproveJoinRequest,
  useRejectJoinRequest,
  useCreateLeaveRequest,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
} from "@/hooks/use-workspace";
import {
  buildMemberDirectory,
  filterMemberDirectory,
  type DirectoryFilter,
  type DirectoryRow,
} from "@/lib/workspace/member-directory";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarPresenceDot } from "@/components/presence/presence-dot";
import { usePresence } from "@/hooks/use-presence";
import { Badge } from "@/components/ui/badge";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { Switch } from "@/components/ui/switch";
import { InviteMemberDialog } from "@/components/workspace/invite-member-dialog";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function WorkspaceMembersPage() {
  const t = useTranslations("members");
  const locale = useLocale();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceName = useWorkspaceStore((s) => s.activeWorkspaceName);
  const currentRole = useWorkspaceRole();
  const currentUser = useAuthStore((s) => s.user);

  // Above the queries, not below the early return where these used to live: the invitation
  // listings are gated on them now, and a value defined after the hook cannot gate it. Plain
  // consts, so moving them changes no hook order.
  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "admin";
  const isOwnerOrAdmin = isOwner || isAdmin;

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<DirectoryFilter>("all");

  // Modal and invitation states
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<{
    id: string;
    email: string;
  } | null>(null);
  const [approvalType, setApprovalType] = useState<
    Record<string, "Internal" | "External">
  >({});
  const [isExporting, setIsExporting] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  // TanStack Query Hooks
  const membersQuery = useWorkspaceMembers(
    activeWorkspaceId || "",
    page,
    10,
    query,
  );
  // Pending invitations and join requests are small, complete sets — one page of 100 covers
  // any workspace this product serves, so they are not paginated alongside the members.
  const invitationsQuery = useWorkspaceInvitations(
    activeWorkspaceId || "",
    1,
    100,
    query,
    "outbound",
    // WT-521: a Member may not read this, and asking anyway printed a 403 to the console on
    // every render of a page they are otherwise allowed to open.
    isOwnerOrAdmin,
  );
  const joinRequestsQuery = useWorkspaceInvitations(
    activeWorkspaceId || "",
    1,
    100,
    query,
    "join-request",
    isOwnerOrAdmin,
  );
  const removeMemberMutation = useRemoveWorkspaceMember(
    activeWorkspaceId || "",
  );
  const updateMemberMutation = useUpdateWorkspaceMember(
    activeWorkspaceId || "",
  );
  const revokeMutation = useRevokeWorkspaceInvitation(activeWorkspaceId || "");
  const approveJoinRequest = useApproveJoinRequest(activeWorkspaceId || "");
  const rejectJoinRequest = useRejectJoinRequest(activeWorkspaceId || "");
  const createLeaveRequest = useCreateLeaveRequest(activeWorkspaceId || "");
  const approveLeaveRequest = useApproveLeaveRequest(activeWorkspaceId || "");
  const rejectLeaveRequest = useRejectLeaveRequest(activeWorkspaceId || "");


  const membersList = membersQuery.data?.items || [];

  // One presence lookup for the page of members being shown. Above the early return below:
  // a hook after it would not run on the render where there is no active workspace, which
  // changes hook order between renders.
  usePresence(membersList.map((member) => member.userId));

  if (!activeWorkspaceId) return null;

  const memberGridClass = "grid-cols-[2.5fr_100px_100px_100px_120px_110px_92px]";

  // Only Owners and Admins may see who has been invited or who is asking to get in — the
  // invitation endpoints refuse everyone else, and a table of permanently failing rows is
  // worse than no rows.
  const pendingInvitations = isOwnerOrAdmin
    ? (invitationsQuery.data?.items ?? [])
    : [];
  const pendingRequests = isOwnerOrAdmin
    ? (joinRequestsQuery.data?.items ?? [])
    : [];

  // Members paginate; the pending sets do not, so they belong on the first page only.
  // Repeating them under every page would misreport how many people are waiting.
  const directoryRows = buildMemberDirectory(
    membersList,
    page === 1 ? pendingInvitations : [],
    page === 1 ? pendingRequests : [],
  );
  const filteredMembers = filterMemberDirectory(directoryRows, filter);

  const invitedCount = buildMemberDirectory(
    membersList,
    pendingInvitations,
    [],
  ).filter((row) => row.status === "invited").length;
  // Counted through the same filter the pill applies, so the number and the list it opens can
  // never disagree — a leave request counts here exactly because it is shown there.
  const requestedCount = filterMemberDirectory(
    buildMemberDirectory(membersList, [], pendingRequests),
    "requested",
  ).length;

  const memberFilterPills: {
    key: DirectoryFilter;
    label: string;
    count?: number;
  }[] = [
    { key: "all", label: t("filters.all") },
    { key: "owner", label: t("filters.owner") },
    { key: "admin", label: t("filters.admin") },
    { key: "member", label: t("filters.member") },
    ...(isOwnerOrAdmin
      ? [
          { key: "invited" as const, label: t("filters.invited"), count: invitedCount },
          { key: "requested" as const, label: t("filters.requested"), count: requestedCount },
        ]
      : []),
  ];

  // A failed invitations call must not be silent. It is a real production failure mode —
  // the join-request listing has thrown on a missing column before — and without this the
  // page would simply show fewer people than the workspace has, with no hint why.
  const pendingLoadFailed =
    isOwnerOrAdmin && (invitationsQuery.isError || joinRequestsQuery.isError);

  const handleExportXlsx = async () => {
    try {
      setIsExporting(true);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Members");

      worksheet.columns = [
        { header: t("export.columns.fullName"), key: "fullName", width: 25 },
        { header: t("export.columns.email"), key: "email", width: 30 },
        { header: t("export.columns.role"), key: "roleName", width: 15 },
        { header: t("export.columns.membershipType"), key: "membershipType", width: 18 },
        { header: t("export.columns.status"), key: "status", width: 12 },
        { header: t("export.columns.date"), key: "joinedAt", width: 20 },
        {
          header: t("export.columns.hostMeetingsPermission"),
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

      filteredMembers.forEach((row) => {
        worksheet.addRow({
          fullName: row.name || t("export.notApplicable"),
          email: row.email || t("export.notApplicable"),
          roleName: row.roleName || t("export.defaultRole"),
          membershipType: row.membershipType || t("export.defaultMembershipType"),
          status: t(`statusLabels.${row.status}`),
          joinedAt: row.date ? new Date(row.date).toLocaleDateString() : t("export.notApplicable"),
          // Only a joined member has this permission at all; an invitee has nothing to
          // export, and writing "No" would read as a decision somebody made.
          canCreateMeetings: row.member
            ? row.member.canCreateMeetings
              ? t("export.yes")
              : t("export.no")
            : "—",
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = `${activeWorkspaceName || "Workspace"}_Members_${dateStr}.xlsx`;
      saveAs(blob, fileName);
      toast.success(t("toasts.exportSuccess"));
    } catch {
      toast.error(t("toasts.exportFailed"));
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
      toast.success(t("toasts.permissionUpdated"));
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || t("toasts.permissionUpdateFailed"),
      );
    }
  };

  const handleRemoveConfirm = async () => {
    if (!memberToRemove) return;
    try {
      await removeMemberMutation.mutateAsync(memberToRemove.id);
      toast.success(t("toasts.memberRemoved", { name: memberToRemove.name }));
      setMemberToRemove(null);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || t("toasts.removeFailed"));
    }
  };

  const handleConfirmLeaveRequest = async () => {
    if (!currentUser || !activeWorkspaceId) return;
    try {
      setIsSubmittingLeave(true);
      await createLeaveRequest.mutateAsync();
      toast.success(t("toasts.leaveRequestSubmitted"));
      setIsLeaveModalOpen(false);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || t("toasts.leaveRequestFailed"),
      );
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const handleRevoke = async () => {
    if (!inviteToRevoke) return;
    try {
      await revokeMutation.mutateAsync(inviteToRevoke.id);
      toast.success(t("toasts.invitationRevoked", { email: inviteToRevoke.email }));
      setInviteToRevoke(null);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || t("toasts.revokeFailed"),
      );
    }
  };

  const handleApprove = async (inviteId: string, provisionalType: string, status?: string) => {
    if (status?.toUpperCase() === "LEAVE_REQUESTED") {
      try {
        await approveLeaveRequest.mutateAsync(inviteId);
        toast.success(t("toasts.leaveRequestApproved"));
      } catch (err) {
        const error = err as { response?: { data?: { error?: string } } };
        toast.error(
          error?.response?.data?.error || t("toasts.leaveApproveFailed"),
        );
      }
      return;
    }

    const membershipType =
      approvalType[inviteId] ||
      (provisionalType.toLowerCase() === "internal" ? "Internal" : "External");
    try {
      const result = await approveJoinRequest.mutateAsync({
        inviteId,
        membershipType,
      });
      toast.success(
        result.approvalEmailStatus === "Failed"
          ? t("toasts.memberApprovedEmailFailed")
          : t("toasts.joinRequestApproved"),
      );
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || t("toasts.approveFailed"),
      );
    }
  };

  const handleReject = async (invitationId: string, status?: string) => {
    if (status?.toUpperCase() === "LEAVE_REQUESTED") {
      try {
        await rejectLeaveRequest.mutateAsync(invitationId);
        toast.success(t("toasts.leaveRequestRejected"));
      } catch (err) {
        const error = err as { response?: { data?: { error?: string } } };
        toast.error(
          error?.response?.data?.error || t("toasts.leaveRejectFailed"),
        );
      }
      return;
    }

    try {
      await rejectJoinRequest.mutateAsync(invitationId);
      toast.success(t("toasts.joinRequestRejected"));
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || t("toasts.rejectFailed"),
      );
    }
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
    <div className="flex h-full flex-col bg-panel text-ink">
      {/* Filter, Search, and Action triggers - Unified horizontal design */}
      {/* flex-wrap, because this row has to survive a narrow main. With both side
          panels open the content area is under 500px, and the action group alone needs
          most of that — unwrapped, the pills were allotted 14px and vanished. */}
      <div className="flex shrink-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* A real minimum width, not min-w-0. Its sibling is shrink-0, so with a floor of
            zero flexbox shrinks the pills away instead of wrapping — they were allotted
            14px and vanished. With a floor they cannot fit, so the row wraps instead. */}
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
                  ? "border-transparent bg-surface-2 text-foreground font-medium shadow-none"
                  : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {item.label}
              {item.count ? (
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
            placeholder={t("search.placeholder")}
            ariaLabel={t("search.ariaLabel")}
            collapsedWidth={28}
            expandedWidth={220}
            className="h-[28px] border-border/60 bg-surface-2 text-ink shadow-sm backdrop-blur-md focus-within:bg-surface-1"
            iconButtonClassName="ml-0 size-[26px] hover:bg-surface-3"
            clearButtonClassName="mr-0.5 size-5 hover:bg-surface-3"
            inputClassName="h-[26px] text-[12px]"
          />
          <button
            className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            title={t("toolbar.memberFiltersTitle")}
          >
            <Funnel weight="bold" size={13} />
            {filter !== "all" && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
            )}
          </button>
          <button
            className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            title={t("toolbar.peopleCountTitle", { count: filteredMembers.length })}
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
              <span>{isExporting ? t("toolbar.exporting") : t("toolbar.exportButton")}</span>
            </button>

            <button
              onClick={() => setIsInviteOpen(true)}
              className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t("toolbar.inviteNewMember")}</span>
            </button>
            </>
          )}
        </div>
      </div>

      {/* Members Table */}
      <div className="overflow-x-auto px-4 pb-6">
        {pendingLoadFailed && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600">
            <Warning className="h-3.5 w-3.5 shrink-0" />
            <span>{t("pendingLoadFailed")}</span>
          </div>
        )}
        {membersQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <PagePlaceholder
            kind="members"
            className="min-h-[240px]"
            title={
              filter === "invited"
                ? t("empty.invitedTitle")
                : filter === "requested"
                  ? t("empty.requestedTitle")
                  : t("empty.defaultTitle")
            }
            description={
              filter === "invited"
                ? t("empty.invitedDescription")
                : filter === "requested"
                  ? t("empty.requestedDescription")
                  : t("empty.defaultDescription")
            }
          />
        ) : (
          <div className="min-w-[1000px] divide-y divide-hairline/40">
            {/* Header row */}
            <div className={`grid ${memberGridClass} items-center gap-4 px-2 py-2 text-[11px] font-semibold uppercase text-ink-muted`}>
              <span>{t("table.name")}</span>
              <span>{t("table.role")}</span>
              <span>{t("table.membershipType")}</span>
              <span>{t("table.status")}</span>
              <span className="text-center">{t("table.hostMeetings")}</span>
              <span className="text-right">{t("table.actions")}</span>
            </div>

            {/* Data rows */}
            {filteredMembers.map((row: DirectoryRow) => {
              const member = row.member;
              const invite = row.invitation;
              const isSelf = !!member && member.userId === currentUser?.id;
              const memberRole = row.roleName.toLowerCase();
              const isExternal = row.membershipType.toLowerCase() === "external";
              const leaveRequest = row.leaveRequest;
              const reviewBusy =
                approveJoinRequest.isPending ||
                rejectJoinRequest.isPending ||
                approveLeaveRequest.isPending ||
                rejectLeaveRequest.isPending;

              return (
                <div
                  key={row.key}
                  className={`grid ${memberGridClass} items-center gap-4 rounded-md px-2 py-3 transition-colors hover:bg-surface-2/40`}
                >
                  {/* User name, email & avatar */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-8 w-8 shrink-0">
                      <Avatar className="h-8 w-8 border border-hairline/80">
                        <AvatarFallback
                          className={`text-xs font-semibold ${
                            member
                              ? "bg-surface-3/80 text-ink"
                              : "bg-surface-2 text-ink-muted"
                          }`}
                        >
                          {initials(row.name)}
                        </AvatarFallback>
                      </Avatar>
                      {/* Presence belongs to people who are in the workspace. Someone who
                          has only been invited has no seat here to be online in. */}
                      {member && (
                        <AvatarPresenceDot userId={member.userId} size="md" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-ink truncate flex items-center gap-1.5">
                        {row.name}
                        {isSelf && (
                          <span className="text-[10px] px-1 py-0.2 bg-primary/10 text-primary border border-primary/20 rounded font-normal">
                            {t("you")}
                          </span>
                        )}
                      </span>
                      {row.email && (
                        <span className="text-[10px] text-ink-muted truncate">
                          {row.email}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Role Badge — the ROLE, and nothing else.
                      This printed "Member · External · Fixed" for an external member while the
                      badge in the very next column printed "External" on its own. Two things went
                      wrong at once: the word appeared twice side by side, and the long string
                      overflowed its column into that neighbour, so the row read
                      "Member · External · FixeExternal". Membership type has its own badge; "the
                      role cannot be changed" is a rule about the control, which is where it now
                      lives. */}
                  <div className="min-w-0">
                    <Badge
                      variant="outline"
                      title={
                        member && isExternal
                          ? t("externalRoleFixedTitle")
                          : undefined
                      }
                      className="max-w-full truncate whitespace-nowrap rounded-[4px] border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-semibold capitalize text-ink"
                    >
                      {t.has(`roleLabels.${memberRole}`) ? t(`roleLabels.${memberRole}`) : row.roleName}
                    </Badge>
                  </div>

                  {/* Membership Type — on a join request this is the approver's decision,
                      so it is the control rather than a label. */}
                  <div>
                    {row.status === "requested" && invite ? (
                      <select
                        value={
                          approvalType[invite.id] ||
                          (isExternal ? "External" : "Internal")
                        }
                        onChange={(event) =>
                          setApprovalType((current) => ({
                            ...current,
                            [invite.id]: event.target.value as
                              | "Internal"
                              | "External",
                          }))
                        }
                        disabled={reviewBusy}
                        aria-label={t("accessTypeAria", { email: row.email })}
                        className="h-7 rounded-md border border-hairline bg-surface-2 px-2 text-[11px] text-ink disabled:opacity-60"
                      >
                        <option value="Internal">{t("membershipOptions.internal")}</option>
                        <option value="External">{t("membershipOptions.external")}</option>
                      </select>
                    ) : (
                      <Badge
                        variant="outline"
                        className={
                          isExternal
                            ? "max-w-full truncate whitespace-nowrap rounded-[4px] border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                            : "max-w-full truncate whitespace-nowrap rounded-[4px] border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
                        }
                      >
                        {isExternal ? t("membershipOptions.external") : t("membershipOptions.internal")}
                      </Badge>
                    )}
                  </div>

                  {/* Where this person stands: joined, invited, asking to join, or asking out */}
                  <div>
                    <Badge
                      variant="outline"
                      title={
                        leaveRequest
                          ? t("leaveRequestPendingTitle")
                          : undefined
                      }
                      className={`max-w-full truncate whitespace-nowrap text-[10px] capitalize font-medium px-2 py-0.5 rounded ${
                        row.status === "joined"
                          ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/20"
                          : row.status === "invited"
                            ? "bg-amber-500/5 text-amber-500 border-amber-500/20"
                            : row.status === "leaving"
                              ? "bg-rose-500/5 text-rose-500 border-rose-500/20"
                              : "bg-sky-500/5 text-sky-500 border-sky-500/20"
                      }`}
                    >
                      {t(`statusLabels.${row.status}`)}
                    </Badge>
                  </div>

                  {/* Joined, invited, or requested date — whichever this row is */}
                  <span className="text-xs text-ink-muted font-medium">
                    {row.date
                      ? new Date(row.date).toLocaleDateString(locale, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </span>

                  {/* Meeting host toggle */}
                  <div className="flex justify-center">
                    {member && isOwnerOrAdmin ? (
                      <Switch
                        checked={member.canCreateMeetings}
                        disabled={isSelf || memberRole === "owner"}
                        onCheckedChange={() =>
                          handleToggleCanCreateMeetings(
                            member.userId,
                            member.canCreateMeetings,
                          )
                        }
                      />
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </div>

                  {/* What can be done about this row */}
                  <div className="flex justify-end gap-1">
                    {isOwnerOrAdmin ? (
                      // Before the Remove button, not after it: a member who has asked to
                      // leave is still a member, so the `member` branch below would swallow
                      // the row and leave the Admin with nothing to answer the request with.
                      // That is WT-559 — every other piece of the feature was already built.
                      leaveRequest ? (
                        <>
                          <button
                            onClick={() =>
                              handleApprove(
                                leaveRequest.id,
                                leaveRequest.membershipType,
                                leaveRequest.status,
                              )
                            }
                            disabled={reviewBusy}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-emerald-500/10 hover:text-emerald-600 transition-colors disabled:opacity-40 cursor-pointer"
                            title={t("actions.approveLeaveRequestTitle")}
                            aria-label={t("actions.approveLeaveRequestAria", { name: row.name })}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              handleReject(leaveRequest.id, leaveRequest.status)
                            }
                            disabled={reviewBusy}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40 cursor-pointer"
                            title={t("actions.rejectLeaveRequestTitle")}
                            aria-label={t("actions.rejectLeaveRequestAria", { name: row.name })}
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      ) : member ? (
                        <button
                          onClick={() =>
                            setMemberToRemove({
                              id: member.userId,
                              name: row.name,
                            })
                          }
                          disabled={
                            isSelf ||
                            memberRole === "owner" ||
                            (isAdmin && memberRole === "admin")
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted cursor-pointer"
                          title={t("actions.removeFromWorkspaceTitle")}
                          aria-label={t("actions.removeFromWorkspaceAria", { name: row.name })}
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      ) : row.status === "invited" && invite ? (
                        <button
                          onClick={() =>
                            setInviteToRevoke({
                              id: invite.id,
                              email: invite.email,
                            })
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                          title={t("actions.revokeInvitationTitle")}
                          aria-label={t("actions.revokeInvitationAria", { email: row.email })}
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      ) : invite ? (
                        <>
                          <button
                            onClick={() =>
                              handleApprove(
                                invite.id,
                                invite.membershipType,
                                invite.status,
                              )
                            }
                            disabled={reviewBusy}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-emerald-500/10 hover:text-emerald-600 transition-colors disabled:opacity-40 cursor-pointer"
                            title={
                              invite.status?.toUpperCase() === "LEAVE_REQUESTED"
                                ? t("actions.approveLeaveRequestTitle")
                                : t("actions.approveJoinRequestTitle")
                            }
                            aria-label={
                              invite.status?.toUpperCase() === "LEAVE_REQUESTED"
                                ? t("actions.approveAriaLeave", { email: row.email })
                                : t("actions.approveAriaJoin", { email: row.email })
                            }
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              handleReject(invite.id, invite.status)
                            }
                            disabled={reviewBusy}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40 cursor-pointer"
                            title={
                              invite.status?.toUpperCase() === "LEAVE_REQUESTED"
                                ? t("actions.rejectLeaveRequestTitle")
                                : t("actions.rejectJoinRequestTitle")
                            }
                            aria-label={
                              invite.status?.toUpperCase() === "LEAVE_REQUESTED"
                                ? t("actions.rejectAriaLeave", { email: row.email })
                                : t("actions.rejectAriaJoin", { email: row.email })
                            }
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      ) : null
                    ) : isSelf && member ? (
                      <button
                        type="button"
                        onClick={() => setIsLeaveModalOpen(true)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-destructive/30 text-destructive bg-destructive/5 hover:bg-destructive/10 transition-colors cursor-pointer"
                        title={t("actions.leaveWorkspaceTitle")}
                      >
                        <span>{t("actions.leave")}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
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
              {t("pagination.previous")}
            </button>
            <span className="text-xs text-ink-muted font-medium">
              {t("pagination.page", { page })}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={membersList.length < 10}
              className="px-2.5 py-1 text-xs border border-hairline rounded hover:bg-surface-2 disabled:opacity-45 cursor-pointer font-medium"
            >
              {t("pagination.next")}
            </button>
          </div>
        )}
      </div>

      {/* The same invite dialog the sidebar opens — one dialog, one behaviour. */}
      <InviteMemberDialog
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
        workspaceId={activeWorkspaceId}
        workspaceName={activeWorkspaceName}
        canGrantAdmin={isOwner}
      />

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
              {t("removeDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              {t.rich("removeDialog.description", {
                name: () => (
                  <span className="font-semibold text-ink">{memberToRemove?.name}</span>
                ),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setMemberToRemove(null)}
              className="flex-1 h-9 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition cursor-pointer"
            >
              {t("removeDialog.cancel")}
            </button>
            <button
              onClick={handleRemoveConfirm}
              className="flex-1 h-9 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition cursor-pointer"
            >
              {t("removeDialog.confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Invitation Dialog */}
      <Dialog
        open={!!inviteToRevoke}
        onOpenChange={(open: boolean) => !open && setInviteToRevoke(null)}
      >
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader className="flex flex-col gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base text-foreground">
              {t("revokeDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              {t.rich("revokeDialog.description", {
                email: () => (
                  <span className="font-semibold text-ink">{inviteToRevoke?.email}</span>
                ),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setInviteToRevoke(null)}
              className="flex-1 h-9 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition cursor-pointer"
            >
              {t("revokeDialog.cancel")}
            </button>
            <button
              onClick={handleRevoke}
              disabled={revokeMutation.isPending}
              className="flex-1 h-9 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition disabled:opacity-50 cursor-pointer"
            >
              {revokeMutation.isPending ? (
                <Spinner className="h-4 w-4 animate-spin" />
              ) : (
                t("revokeDialog.confirm")
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Request Confirmation Dialog */}
      <Dialog
        open={isLeaveModalOpen}
        onOpenChange={setIsLeaveModalOpen}
      >
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader className="flex flex-col gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 mx-auto">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base text-foreground">
              {t("leaveDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              {t.rich("leaveDialog.description", {
                name: () => (
                  <span className="font-semibold text-ink">{activeWorkspaceName}</span>
                ),
              })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setIsLeaveModalOpen(false)}
              className="flex-1 h-9 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition cursor-pointer"
            >
              {t("leaveDialog.cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirmLeaveRequest}
              disabled={isSubmittingLeave}
              className="flex-1 h-9 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmittingLeave ? t("leaveDialog.submitting") : t("leaveDialog.confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
