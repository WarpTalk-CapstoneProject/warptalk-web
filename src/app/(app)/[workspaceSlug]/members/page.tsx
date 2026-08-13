"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Users,
  UserMinus,
  Funnel,
  Spinner,
  Warning,
  Plus,
  Download,
  SlidersHorizontal,
  Trash,
  CheckCircle,
  CaretDown,
  CaretUp,
  XCircle,
} from "@phosphor-icons/react";
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
} from "@/hooks/use-workspace";
import {
  buildMemberDirectory,
  filterMemberDirectory,
  DIRECTORY_STATUS_LABELS,
  type DirectoryFilter,
  type DirectoryRow,
} from "@/lib/workspace/member-directory";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarPresenceDot } from "@/components/presence/presence-dot";
import { usePresence } from "@/hooks/use-presence";
import { Badge } from "@/components/ui/badge";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { ListDisplayPopover } from "@/components/ui/list-display-popover";
import { Switch } from "@/components/ui/switch";
import { InviteMemberDialog } from "@/components/workspace/invite-member-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createExcelWorkbook } from "@/lib/export/create-excel-workbook";

const MEMBER_FILTER_WIDTH_CLASS: Record<string, string> = {
  all: "w-[58px]",
  owner: "w-[78px]",
  admin: "w-[78px]",
  member: "w-[88px]",
  invited: "w-[92px]",
  requested: "w-[104px]",
};

type SortDirection = "asc" | "desc";
type MemberSortKey =
  | "name"
  | "role"
  | "membershipType"
  | "status"
  | "date"
  | "hostMeetings";
type MemberDisplayProperty =
  | "role"
  | "membershipType"
  | "status"
  | "date"
  | "hostMeetings"
  | "actions";

const MEMBER_SORT_COLUMNS: Array<{
  key: MemberSortKey;
  label: string;
  ownerOnly?: boolean;
  align?: "center" | "right";
}> = [
  { key: "name", label: "Name" },
  { key: "role", label: "Role" },
  { key: "membershipType", label: "Membership Type" },
  { key: "status", label: "Status" },
  { key: "date", label: "Date" },
  { key: "hostMeetings", label: "Host meetings", ownerOnly: true, align: "center" },
];

const MEMBER_DISPLAY_PROPERTIES: Array<{
  key: MemberDisplayProperty;
  label: string;
  ownerOnly?: boolean;
}> = [
  { key: "role", label: "Role" },
  { key: "membershipType", label: "Membership Type" },
  { key: "status", label: "Status" },
  { key: "date", label: "Date" },
  { key: "hostMeetings", label: "Host meetings", ownerOnly: true },
  { key: "actions", label: "Actions", ownerOnly: true },
];

const DEFAULT_MEMBER_DISPLAY_PROPERTIES =
  MEMBER_DISPLAY_PROPERTIES.map((property) => property.key);

/** Matches the pending-invitation and join-request queries, which fetch one page of 100. */
const MEMBER_DIRECTORY_PAGE_SIZE = 200;

function getMemberGridTemplate(
  visibleProperties: MemberDisplayProperty[],
  isOwnerOrAdmin: boolean,
) {
  return [
    "16px",
    "minmax(280px,1.85fr)",
    visibleProperties.includes("role") ? "100px" : null,
    visibleProperties.includes("membershipType") ? "116px" : null,
    visibleProperties.includes("status") ? "92px" : null,
    visibleProperties.includes("date") ? "112px" : null,
    isOwnerOrAdmin && visibleProperties.includes("hostMeetings")
      ? "108px"
      : null,
    isOwnerOrAdmin && visibleProperties.includes("actions") ? "64px" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function WorkspaceMembersPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceName = useWorkspaceStore((s) => s.activeWorkspaceName);
  const currentRole = useWorkspaceRole();
  const currentUser = useAuthStore((s) => s.user);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [sortKey, setSortKey] = useState<MemberSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [visibleDisplayProperties, setVisibleDisplayProperties] = useState<
    MemberDisplayProperty[]
  >(DEFAULT_MEMBER_DISPLAY_PROPERTIES);

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

  // TanStack Query Hooks
  /* One complete set, not a page of ten.
   *
   * This was `useWorkspaceMembers(id, page, 10, query)`, and three things followed from it.
   * Sorting — added with the column headers — reordered ten rows and called itself a sort of
   * the directory, so "earliest joiner" meant "earliest joiner on this page" and each page
   * sorted independently. The pending sets below are deliberately unpaginated and pinned to
   * page 1, so from page 2 the invitations and join requests vanished from a table whose whole
   * point is that they sit alongside members. And `listMembers` has no sort parameter (see
   * workspace.service.ts), so ordering server-side is not available to ask for.
   *
   * The comment on the pending queries already made the argument: one page of 100 covers any
   * workspace this product serves. The same reasoning applies to members, and the cap is
   * surfaced below rather than silently truncating. */
  const membersQuery = useWorkspaceMembers(
    activeWorkspaceId || "",
    1,
    MEMBER_DIRECTORY_PAGE_SIZE,
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
  );
  const joinRequestsQuery = useWorkspaceInvitations(
    activeWorkspaceId || "",
    1,
    100,
    query,
    "join-request",
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


  const membersList = membersQuery.data?.items || [];

  // One presence lookup for the page of members being shown. Above the early return below:
  // a hook after it would not run on the render where there is no active workspace, which
  // changes hook order between renders.
  usePresence(membersList.map((member) => member.userId));

  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "admin";
  const isOwnerOrAdmin = isOwner || isAdmin;
  const memberDisplayProperties = useMemo(
    () =>
      MEMBER_DISPLAY_PROPERTIES.filter(
        (property) => !property.ownerOnly || isOwnerOrAdmin,
      ),
    [isOwnerOrAdmin],
  );
  const memberGridTemplate = useMemo(
    () => getMemberGridTemplate(visibleDisplayProperties, isOwnerOrAdmin),
    [isOwnerOrAdmin, visibleDisplayProperties],
  );
  const visibleSortColumns = useMemo(
    () =>
      MEMBER_SORT_COLUMNS.filter(
        (column) =>
          (!column.ownerOnly || isOwnerOrAdmin) &&
          (column.key === "name" ||
            visibleDisplayProperties.includes(
              column.key as MemberDisplayProperty,
            )),
      ),
    [isOwnerOrAdmin, visibleDisplayProperties],
  );

  if (!activeWorkspaceId) return null;

  // Only Owners and Admins may see who has been invited or who is asking to get in — the
  // invitation endpoints refuse everyone else, and a table of permanently failing rows is
  // worse than no rows.
  const pendingInvitations = isOwnerOrAdmin
    ? (invitationsQuery.data?.items ?? [])
    : [];
  const pendingRequests = isOwnerOrAdmin
    ? (joinRequestsQuery.data?.items ?? [])
    : [];

  // Members, invitations and join requests are all complete sets now, so the directory is
  // whole and nothing has to be withheld from a later page.
  const directoryRows = buildMemberDirectory(
    membersList,
    pendingInvitations,
    pendingRequests,
  );
  const filteredMembers = filterMemberDirectory(directoryRows, filter);
  const sortedMembers = [...filteredMembers].sort((first, second) => {
    const result = compareMemberRows(first, second, sortKey);
    return sortDirection === "asc" ? result : -result;
  });

  function toggleDisplayProperty(property: string) {
    const typedProperty = property as MemberDisplayProperty;
    const isHiding = visibleDisplayProperties.includes(typedProperty);

    /* Both setters at the top level. `setSortKey` used to be called INSIDE the
       `setVisibleDisplayProperties` updater, and React requires an updater to be pure — it
       runs twice under StrictMode and may be replayed on a render that is then discarded, so
       the reset fired on renders that never committed and could be skipped on the one that
       did. Hiding the column you are sorting by falls back to the name order. */
    if (isHiding && sortKey === typedProperty) {
      setSortKey("name");
    }

    setVisibleDisplayProperties((current) =>
      isHiding
        ? current.filter((item) => item !== typedProperty)
        : [...current, typedProperty],
    );
  }

  const invitedCount = buildMemberDirectory(
    membersList,
    pendingInvitations,
    [],
  ).filter((row) => row.status === "invited").length;
  const requestedCount = buildMemberDirectory(
    membersList,
    [],
    pendingRequests,
  ).filter((row) => row.status === "requested").length;

  const memberFilterPills: {
    key: DirectoryFilter;
    label: string;
    count?: number;
  }[] = [
    { key: "all", label: "All" },
    { key: "owner", label: "Owner" },
    { key: "admin", label: "Admin" },
    { key: "member", label: "Member" },
    ...(isOwnerOrAdmin
      ? ([
          { key: "invited", label: "Invited", count: invitedCount },
          { key: "requested", label: "Requests", count: requestedCount },
        ] as const)
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
      const workbook = await createExcelWorkbook();
      const worksheet = workbook.addWorksheet("Members");

      worksheet.columns = [
        { header: "Full Name", key: "fullName", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Role", key: "roleName", width: 15 },
        { header: "Membership Type", key: "membershipType", width: 18 },
        { header: "Status", key: "status", width: 12 },
        { header: "Date", key: "joinedAt", width: 20 },
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

      filteredMembers.forEach((row) => {
        worksheet.addRow({
          fullName: row.name || "N/A",
          email: row.email || "N/A",
          roleName: row.roleName || "Member",
          membershipType: row.membershipType || "Internal",
          status: DIRECTORY_STATUS_LABELS[row.status],
          joinedAt: row.date ? new Date(row.date).toLocaleDateString() : "N/A",
          // Only a joined member has this permission at all; an invitee has nothing to
          // export, and writing "No" would read as a decision somebody made.
          canCreateMeetings: row.member
            ? row.member.canCreateMeetings
              ? "Yes"
              : "No"
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
      toast.success("Members list exported successfully!");
    } catch {
      toast.error("Failed to export members list.");
    } finally {
      setIsExporting(false);
    }
  };

  function handleSort(nextSortKey: MemberSortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  }

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

  const handleRevoke = async () => {
    if (!inviteToRevoke) return;
    try {
      await revokeMutation.mutateAsync(inviteToRevoke.id);
      toast.success(`Invitation for ${inviteToRevoke.email} revoked.`);
      setInviteToRevoke(null);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || "Failed to revoke invitation",
      );
    }
  };

  const handleApprove = async (inviteId: string, provisionalType: string) => {
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
          ? "Member approved; approval email delivery failed."
          : "Join request approved and email sent.",
      );
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || "Failed to approve join request",
      );
    }
  };

  const handleReject = async (invitationId: string) => {
    try {
      await rejectJoinRequest.mutateAsync(invitationId);
      toast.success("Join request rejected.");
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || "Failed to reject join request",
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
    <div className="flex h-full flex-col bg-surface-1 text-ink">
      {/* Filter, Search, and Action triggers - Unified horizontal design */}
      {/* flex-wrap, because this row has to survive a narrow main. With both side
          panels open the content area is under 500px, and the action group alone needs
          most of that — unwrapped, the pills were allotted 14px and vanished. */}
      <div className="flex shrink-0 flex-col gap-2 px-2 pb-1.5 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* A real minimum width, not min-w-0. Its sibling is shrink-0, so with a floor of
            zero flexbox shrinks the pills away instead of wrapping — they were allotted
            14px and vanished. With a floor they cannot fit, so the row wraps instead. */}
        <div className="flex min-w-[260px] flex-1 items-center gap-2 overflow-x-auto hide-scrollbar">
          {memberFilterPills.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`flex h-[26px] ${MEMBER_FILTER_WIDTH_CLASS[item.key] ?? "w-[86px]"} items-center justify-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors select-none ${
                filter === item.key
                  ? "border-hairline-strong bg-surface-2 text-foreground shadow-none"
                  : "border-border bg-transparent text-muted-foreground hover:border-hairline-strong hover:bg-surface-2 hover:text-foreground"
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

        <div className="flex shrink-0 items-center gap-2">
          <ExpandingSearchDock
            value={query}
            onValueChange={setQuery}
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
          <ListDisplayPopover
            trigger={<SlidersHorizontal weight="bold" size={13} />}
            triggerClassName="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            triggerTitle={`${filteredMembers.length} people`}
            ordering={sortKey}
            orderingOptions={MEMBER_SORT_COLUMNS.filter(
              (column) => !column.ownerOnly || isOwnerOrAdmin,
            ).map((column) => ({
              value: column.key,
              label: column.label,
              disabled:
                column.key !== "name" &&
                !visibleDisplayProperties.includes(
                  column.key as MemberDisplayProperty,
                ),
            }))}
            onOrderingChange={(value) => setSortKey(value as MemberSortKey)}
            direction={sortDirection}
            onDirectionChange={setSortDirection}
            properties={memberDisplayProperties}
            visibleProperties={visibleDisplayProperties}
            onToggleProperty={toggleDisplayProperty}
            onReset={() => {
              setSortKey("name");
              setSortDirection("asc");
              setVisibleDisplayProperties(DEFAULT_MEMBER_DISPLAY_PROPERTIES);
            }}
          />

          {isOwnerOrAdmin && (
            <>
              <div className="mx-1 h-4 w-[1px] bg-border" />
            <button
              onClick={handleExportXlsx}
              disabled={isExporting}
            className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[12px] font-medium text-ink shadow-sm transition hover:bg-surface-2 disabled:opacity-50"
            >
              {isExporting ? (
                <Spinner className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Download className="h-3.5 w-3.5 text-primary" />
              )}
              <span>{isExporting ? "Exporting..." : "Export (.xlsx)"}</span>
            </button>

            <button
              onClick={() => setIsInviteOpen(true)}
              className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Invite new member</span>
            </button>
            </>
          )}
        </div>
      </div>

      {/* Members Table */}
      <div className="overflow-x-auto px-2 pb-6">
        {pendingLoadFailed && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600">
            <Warning className="h-3.5 w-3.5 shrink-0" />
            <span>
              Pending invitations and join requests could not be loaded, so this
              list shows joined members only.
            </span>
          </div>
        )}
        {membersQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center border border-dashed border-hairline rounded-lg bg-surface-1/10">
            <Users className="h-8 w-8 text-ink-muted" />
            <p className="text-sm font-medium">
              {filter === "invited"
                ? "No pending invitations"
                : filter === "requested"
                  ? "No join requests"
                  : "No people found"}
            </p>
            <p className="text-xs text-ink-muted">
              {filter === "invited"
                ? "Use Invite new member to send one."
                : filter === "requested"
                  ? "Requests to join this workspace will appear here."
                  : "Try adjusting your search terms or filters."}
            </p>
          </div>
        ) : (
          <div className="min-w-[1000px]">
            {/* Header row */}
            <div
              className="grid items-center gap-3 px-2 py-0.5 text-[11px] font-medium text-ink-muted"
              style={{ gridTemplateColumns: memberGridTemplate }}
            >
              <div />
              {visibleSortColumns.map((column) => (
                <SortableColumnHeader
                  key={column.key}
                  label={column.label}
                  active={sortKey === column.key}
                  direction={sortDirection}
                  align={column.align}
                  onClick={() => handleSort(column.key)}
                />
              ))}
              {isOwnerOrAdmin && visibleDisplayProperties.includes("actions") && (
                <span className="text-right">Actions</span>
              )}
            </div>

            {/* Data rows */}
            {sortedMembers.map((row: DirectoryRow) => {
              const member = row.member;
              const invite = row.invitation;
              const isSelf = !!member && member.userId === currentUser?.id;
              const memberRole = row.roleName.toLowerCase();
              const isExternal = row.membershipType.toLowerCase() === "external";
              const reviewBusy =
                approveJoinRequest.isPending || rejectJoinRequest.isPending;

              return (
                <div
                  key={row.key}
                  className="group grid min-h-[36px] items-center gap-3 rounded-[7px] px-2 py-1 text-[11px] transition-none hover:bg-surface-2 hover:shadow-[inset_3px_0_0_hsl(var(--primary)/0.45)]"
                  style={{ gridTemplateColumns: memberGridTemplate }}
                >
                  <div aria-hidden="true" />

                  {/* User name, email & avatar */}
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="relative h-5 w-5 shrink-0">
                      <Avatar className="h-5 w-5 border border-hairline/80">
                        <AvatarFallback
                          className={`text-[9px] font-semibold ${
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
                        <AvatarPresenceDot userId={member.userId} size="sm" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium text-ink flex items-center gap-1.5">
                        {row.name}
                        {isSelf && (
                          <span className="text-[10px] px-1 py-0.2 bg-primary/10 text-primary border border-primary/20 rounded font-normal">
                            You
                          </span>
                        )}
                      </span>
                      {row.email && (
                        <span className="truncate text-[10px] text-ink-muted">
                          {row.email}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Role Badge */}
                  {visibleDisplayProperties.includes("role") && (
                  <div>
                    <Badge
                      variant="outline"
                      className="rounded-[4px] border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-semibold capitalize text-ink"
                    >
                      {member && isExternal
                        ? "Member · External · Fixed"
                        : row.roleName}
                    </Badge>
                  </div>
                  )}

                  {/* Membership Type — on a join request this is the approver's decision,
                      so it is the control rather than a label. */}
                  {visibleDisplayProperties.includes("membershipType") && (
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
                        aria-label={`Access type for ${row.email}`}
                        className="h-7 rounded-md border border-hairline bg-surface-2 px-2 text-[11px] text-ink disabled:opacity-60"
                      >
                        <option value="Internal">Internal</option>
                        <option value="External">External</option>
                      </select>
                    ) : (
                      <Badge
                        variant="outline"
                        className={
                          isExternal
                            ? "rounded-[4px] border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                            : "rounded-[4px] border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
                        }
                      >
                        {row.membershipType}
                      </Badge>
                    )}
                  </div>
                  )}

                  {/* Where this person stands: joined, invited, or asking to join */}
                  {visibleDisplayProperties.includes("status") && (
                  <div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize font-medium px-2 py-0.5 rounded ${
                        row.status === "joined"
                          ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/20"
                          : row.status === "invited"
                            ? "bg-amber-500/5 text-amber-500 border-amber-500/20"
                            : "bg-sky-500/5 text-sky-500 border-sky-500/20"
                      }`}
                    >
                      {DIRECTORY_STATUS_LABELS[row.status]}
                    </Badge>
                  </div>
                  )}

                  {/* Joined, invited, or requested date — whichever this row is */}
                  {visibleDisplayProperties.includes("date") && (
                  <span className="text-xs text-ink-muted font-medium">
                    {row.date
                      ? new Date(row.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                  )}

                  {isOwnerOrAdmin && (
                    <>
                      {/* Meeting host toggle */}
                      {visibleDisplayProperties.includes("hostMeetings") && (
                      <div className="flex justify-center">
                        {member ? (
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
                          // Nothing to grant until they are actually in the workspace.
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </div>
                      )}

                      {/* What can be done about this row */}
                      {visibleDisplayProperties.includes("actions") && (
                      <div className="flex justify-end gap-1">
                        {member ? (
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
                            title="Remove from workspace"
                            aria-label={`Remove ${row.name} from workspace`}
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
                            title="Revoke invitation"
                            aria-label={`Revoke the invitation for ${row.email}`}
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        ) : invite ? (
                          <>
                            <button
                              onClick={() =>
                                handleApprove(invite.id, invite.membershipType)
                              }
                              disabled={reviewBusy}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-emerald-500/10 hover:text-emerald-600 transition-colors disabled:opacity-40 cursor-pointer"
                              title="Approve join request"
                              aria-label={`Approve the join request from ${row.email}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleReject(invite.id)}
                              disabled={reviewBusy}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40 cursor-pointer"
                              title="Reject join request"
                              aria-label={`Reject the join request from ${row.email}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </>
                        ) : null}
                      </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* A cap that bites is said out loud. Silently showing the first 200 of 500 members
            would read as "this workspace has 200 members", and the sort above would quietly be
            a sort of whichever 200 came back. */}
        {membersQuery.data &&
          membersQuery.data.total > membersList.length && (
            <div className="flex items-center justify-between gap-3 border-t border-hairline/60 px-2 py-3 mt-2">
              <p className="text-xs text-ink-muted">
                Showing the first {membersList.length.toLocaleString()} of{" "}
                {membersQuery.data.total.toLocaleString()} members. Search to
                narrow the list.
              </p>
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
              Revoke Invitation?
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              Revoking the invitation for{" "}
              <span className="font-semibold text-ink">
                {inviteToRevoke?.email}
              </span>{" "}
              removes it entirely. They will no longer be able to accept it with
              that email.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setInviteToRevoke(null)}
              className="flex-1 h-9 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleRevoke}
              disabled={revokeMutation.isPending}
              className="flex-1 h-9 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition disabled:opacity-50 cursor-pointer"
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

function SortableColumnHeader({
  label,
  active,
  direction,
  align,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  align?: "center" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-fit rounded-full py-1 text-left transition-colors ${
        align === "center" ? "justify-self-center text-center" : ""
      } ${align === "right" ? "justify-self-end pr-2 text-right" : ""} ${
        active
          ? align
            ? "bg-surface-2 px-2 font-semibold text-foreground"
            : "-ml-2 bg-surface-2 px-2 font-semibold text-foreground"
          : "px-0 text-ink-muted hover:text-ink"
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          direction === "asc" ? (
            <CaretUp size={10} weight="bold" />
          ) : (
            <CaretDown size={10} weight="bold" />
          )
        ) : null}
      </span>
    </button>
  );
}

function compareMemberRows(
  first: DirectoryRow,
  second: DirectoryRow,
  sortKey: MemberSortKey,
) {
  if (sortKey === "name") return compareText(first.name, second.name);
  if (sortKey === "role") return compareText(first.roleName, second.roleName);
  if (sortKey === "membershipType") {
    return compareText(first.membershipType, second.membershipType);
  }
  if (sortKey === "status") {
    return compareText(
      DIRECTORY_STATUS_LABELS[first.status],
      DIRECTORY_STATUS_LABELS[second.status],
    );
  }
  if (sortKey === "date") {
    return compareNullableDate(first.date, second.date);
  }

  return compareText(
    first.member?.canCreateMeetings ? "yes" : "no",
    second.member?.canCreateMeetings ? "yes" : "no",
  );
}

function compareNullableDate(first: string | null, second: string | null) {
  if (!first && !second) return 0;
  if (!first) return 1;
  if (!second) return -1;
  return new Date(first).getTime() - new Date(second).getTime();
}

function compareText(first: string, second: string) {
  return first.localeCompare(second, undefined, { sensitivity: "base" });
}
