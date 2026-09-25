"use client";

/**
 * /admin/staff — the people who work on the WarpTalk platform itself (G10).
 *
 * One row per staff member: the role they hold, whether that access is live, when they last used
 * the portal and last signed in, and a link to everything they have done (the audit log filtered
 * to them as the actor). Invitations to addresses that have no account yet sit below the table.
 *
 * Every filter goes to the server (the auth service filters and sorts the directory). Every action
 * is enforced there too: nobody changes their own access, nobody grants beyond what they hold, and
 * the last active Super Admin cannot be suspended, demoted or removed. The buttons here only hide
 * what the server would refuse; they are not the gate.
 */

import {
  ArrowsClockwise,
  ClockCounterClockwise,
  DotsThree,
  EnvelopeSimple,
  IdentificationBadge,
  Pause,
  Play,
  Plus,
  Trash,
  UserSwitch,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  AdminStatusTabs,
  useAdminActionIntent,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { ChangeStaffRoleDialog, InviteStaffDialog } from "@/components/admin/staff/staff-dialogs";
import {
  StaffReasonDialog,
  StaffRoleBadge,
  StaffStatusBadge,
  formatStaffDate,
} from "@/components/admin/staff/staff-ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useReactivateStaff,
  useRemoveStaff,
  useRevokeStaffInvitation,
  useStaffDirectory,
  useStaffInvitations,
  useStaffRoles,
  useSuspendStaff,
} from "@/hooks/use-admin-staff";
import { useCan, useStaffAccess } from "@/hooks/use-staff-access";
import { enumValue, enumValues, type ListStateConfig } from "@/lib/admin/list-state";
import { ADMIN_PERMISSIONS, canManageStaffMember } from "@/lib/admin/staff-permissions";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { StaffDirectoryQuery, StaffInvitationDto, StaffMemberDto, StaffRoleDto } from "@/types/admin-staff";

const PAGE_SIZE = 25;
const STATUS_TABS = ["all", "active", "suspended"] as const;
const LAST_ACTIVE_VALUES = ["7d", "30d", "90d", "inactive30d", "never"] as const;

const LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", values: ["active", "suspended"] },
    // Role slugs are data (custom roles), so the filter accepts any value the server knows.
    { key: "role", kind: "enum", multiple: true },
    { key: "lastActive", kind: "enum", values: [...LAST_ACTIVE_VALUES] },
  ],
  sortFields: ["name", "email", "role", "status", "lastActive", "lastSignIn", "created"],
  defaultSort: { field: "name", direction: "asc" },
  columns: [{ id: "person" }, { id: "role" }, { id: "status" }, { id: "lastActive" }, { id: "lastSignIn" }, { id: "added" }, { id: "actions" }],
  groupings: ["role", "status"],
};

type PendingAction =
  | { kind: "suspend" | "reactivate" | "remove"; member: StaffMemberDto }
  | { kind: "revoke"; invitation: StaffInvitationDto };

function StaffDirectory() {
  const t = useTranslations("adminStaff.staff");
  const locale = useLocale();
  const list = useAdminListState(LIST_CONFIG);
  const { state } = list;
  const { access } = useStaffAccess();
  const canManage = useCan(ADMIN_PERMISSIONS.staffManage);
  const canReadAudit = useCan(ADMIN_PERMISSIONS.auditRead);
  const actorId = useAuthStore((s) => s.user?.id);

  const status = (enumValue(state.filters, "status") ?? "all") as StaffDirectoryQuery["status"];
  const roleSlugs = enumValues(state.filters, "role").join(",");
  const lastActive = enumValue(state.filters, "lastActive") as StaffDirectoryQuery["lastActive"];

  const query = useMemo<StaffDirectoryQuery>(
    () => ({
      q: state.search || undefined,
      status,
      role: roleSlugs || undefined,
      lastActive: lastActive || undefined,
      sort: state.sort.field as StaffDirectoryQuery["sort"],
      dir: state.sort.direction,
      page: state.page,
      pageSize: PAGE_SIZE,
    }),
    [state.search, status, roleSlugs, lastActive, state.sort.field, state.sort.direction, state.page],
  );

  const directory = useStaffDirectory(query);
  const roles = useStaffRoles();
  const invitations = useStaffInvitations();
  const items = directory.data?.items ?? [];
  const total = directory.data?.total ?? 0;
  const counts = useMemo(() => directory.data?.statusCounts ?? {}, [directory.data]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [changing, setChanging] = useState<StaffMemberDto | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  useAdminActionIntent({ invite: () => canManage && setInviteOpen(true) });

  const suspend = useSuspendStaff();
  const reactivate = useReactivateStaff();
  const remove = useRemoveStaff();
  const revoke = useRevokeStaffInvitation();

  const roleList: StaffRoleDto[] = useMemo(() => roles.data ?? [], [roles.data]);
  const roleBySlug = useMemo(() => new Map(roleList.map((role) => [role.slug, role])), [roleList]);

  const canActOn = (member: StaffMemberDto) =>
    canManageStaffMember(access, actorId, {
      userId: member.userId,
      isSuperAdmin: member.isSuperAdmin,
      rolePermissions: roleBySlug.get(member.roleSlug)?.permissions ?? [],
    });

  const statusTabs = useMemo(
    () => STATUS_TABS.map((value) => ({ value, label: t(`statusTabs.${value}`, { count: counts[value] ?? 0 }) })),
    [t, counts],
  );

  const filterFields = useMemo<AdminFilterField[]>(
    () => [
      {
        key: "role",
        label: t("filters.role"),
        icon: <IdentificationBadge size={13} />,
        kind: "enum",
        multiple: true,
        options: roleList.map((role) => ({ value: role.slug, label: role.name })),
      },
      {
        key: "lastActive",
        label: t("filters.lastActive"),
        icon: <ClockCounterClockwise size={13} />,
        kind: "enum",
        options: LAST_ACTIVE_VALUES.map((value) => ({ value, label: t(`filters.lastActiveOptions.${value}`) })),
      },
    ],
    [t, roleList],
  );

  const columns = useMemo<AdminColumn<StaffMemberDto>[]>(
    () => [
      {
        id: "person",
        header: t("columns.person"),
        primary: true,
        sortField: "name",
        cell: (member) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-surface-2 text-[11px] font-semibold uppercase text-ink-muted">
              {member.fullName.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink">
                {member.fullName}
                {member.userId === actorId ? <span className="ml-1.5 text-[11px] font-normal text-ink-subtle">{t("you")}</span> : null}
              </p>
              <p className="truncate text-xs text-ink-muted">{member.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: "role",
        header: t("columns.role"),
        className: "w-[190px]",
        sortField: "role",
        cell: (member) => <StaffRoleBadge name={member.roleName} isSuperAdmin={member.isSuperAdmin} />,
      },
      {
        id: "status",
        header: t("columns.status"),
        className: "w-[150px]",
        sortField: "status",
        cell: (member) => (
          <div className="min-w-0">
            <StaffStatusBadge status={member.status} accountActive={member.accountActive} />
            {member.status === "suspended" && member.statusReason ? (
              <p className="mt-1 truncate text-[11px] text-ink-subtle" title={member.statusReason}>
                {member.statusReason}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "lastActive",
        header: t("columns.lastActive"),
        align: "right",
        className: "w-[130px]",
        sortField: "lastActive",
        defaultDirection: "desc",
        cell: (member) => (
          <span className="text-xs text-ink-muted">{formatStaffDate(member.lastActiveAt, locale) ?? t("never")}</span>
        ),
      },
      {
        id: "lastSignIn",
        header: t("columns.lastSignIn"),
        align: "right",
        className: "w-[130px]",
        sortField: "lastSignIn",
        defaultDirection: "desc",
        cell: (member) => (
          <span className="text-xs text-ink-muted">{formatStaffDate(member.lastSignInAt, locale) ?? t("never")}</span>
        ),
      },
      {
        id: "added",
        header: t("columns.added"),
        align: "right",
        className: "w-[130px]",
        sortField: "created",
        defaultDirection: "desc",
        cell: (member) => (
          <div className="text-right">
            <p className="text-xs text-ink-muted">{formatStaffDate(member.createdAt, locale)}</p>
            <p className="text-[11px] text-ink-subtle">{t(`source.${member.source}`)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        align: "right",
        className: "w-[64px]",
        cell: (member) => (
          <StaffRowMenu
            member={member}
            canManage={canActOn(member)}
            canReadAudit={canReadAudit}
            onChangeRole={() => setChanging(member)}
            onStatus={(kind) => setPending({ kind, member })}
          />
        ),
      },
    ],
    // canActOn closes over access, roles and the actor; they are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, actorId, access, roleBySlug, canReadAudit],
  );

  const pendingCopy = pending ? dialogCopyFor(pending) : null;
  const tDialog = useTranslations("adminStaff.actions");

  const runPending = async (reason: string) => {
    if (!pending) return;
    if (pending.kind === "revoke") {
      await revoke.mutateAsync({ id: pending.invitation.id, reason });
      toast.success(tDialog("revoke.done", { email: pending.invitation.email }));
      return;
    }
    const args = { userId: pending.member.userId, reason };
    if (pending.kind === "suspend") await suspend.mutateAsync(args);
    else if (pending.kind === "reactivate") await reactivate.mutateAsync(args);
    else await remove.mutateAsync(args);
    toast.success(tDialog(`${pending.kind}.done`, { name: pending.member.fullName }));
  };

  const openInvitations = (invitations.data ?? []).filter((i) => i.status === "pending" || i.status === "expired");

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<IdentificationBadge size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void directory.refetch()} disabled={directory.isFetching}>
              <ArrowsClockwise size={14} className={cn(directory.isFetching && "animate-spin")} />
              {t("refresh")}
            </Button>
            {canManage ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <Plus size={14} />
                {t("invite")}
              </Button>
            ) : null}
          </div>
        }
      />

      <AdminStatusTabs list={list} filterKey="status" tabs={statusTabs} label={t("filterLabel")} />

      <AdminListToolbar
        list={list}
        searchPlaceholder={t("searchPlaceholder")}
        filters={filterFields}
        count={directory.isPending ? null : total}
        countLabel={t("count", { count: total })}
        isFetching={directory.isFetching && !directory.isPending}
        display={{
          sortOptions: [
            { field: "name", label: t("sort.name") },
            { field: "email", label: t("sort.email") },
            { field: "role", label: t("sort.role") },
            { field: "lastActive", label: t("sort.lastActive") },
            { field: "lastSignIn", label: t("sort.lastSignIn") },
            { field: "created", label: t("sort.created") },
          ],
          groupOptions: [
            { key: "role", label: t("columns.role") },
            { key: "status", label: t("columns.status") },
          ],
          columns: columns.filter((column) => !column.primary).map((column) => ({ id: column.id, label: column.header })),
        }}
      />

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={items}
          rowKey={(member) => member.userId}
          isPending={directory.isPending}
          isError={directory.isError}
          onRetry={() => void directory.refetch()}
          empty={{
            title: t("emptyTitle"),
            description: t("emptyDescription"),
            icon: <IdentificationBadge size={20} weight="duotone" />,
          }}
          groupings={{
            role: { keyOf: (member) => member.roleName, label: (key) => key },
            status: {
              keyOf: (member) => member.status,
              label: (key) => t(`statusTabs.${key}`, { count: counts[key] ?? 0 }),
              order: ["active", "suspended"],
            },
          }}
          pagination={{ page: state.page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, pageSize: PAGE_SIZE }}
          caption={t("title")}
        />
      </AdminPanel>

      {openInvitations.length > 0 ? (
        <AdminPanel>
          <div className="border-b border-hairline px-4 py-3">
            <h2 className="text-[13px] font-semibold text-ink">{t("invitations.title")}</h2>
            <p className="mt-0.5 text-xs text-ink-muted">{t("invitations.description")}</p>
          </div>
          <ul className="divide-y divide-hairline">
            {openInvitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 px-4 py-2.5">
                <EnvelopeSimple size={16} className="shrink-0 text-ink-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{invitation.email}</p>
                  <p className="text-[11px] text-ink-subtle">
                    {invitation.roleName} ·{" "}
                    {invitation.status === "expired"
                      ? t("invitations.expired")
                      : t("invitations.expires", { date: formatStaffDate(invitation.expiresAt, locale) ?? "" })}
                  </p>
                </div>
                {canManage ? (
                  <Button variant="outline" size="sm" onClick={() => setPending({ kind: "revoke", invitation })}>
                    {t("invitations.revoke")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </AdminPanel>
      ) : null}

      <InviteStaffDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roleList} />
      <ChangeStaffRoleDialog member={changing} onOpenChange={(open) => !open && setChanging(null)} roles={roleList} />
      {pending && pendingCopy ? (
        <StaffReasonDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={tDialog(`${pendingCopy.key}.title`)}
          description={tDialog(`${pendingCopy.key}.description`)}
          subject={pendingCopy.subject}
          confirmLabel={tDialog(`${pendingCopy.key}.confirm`)}
          pendingLabel={tDialog(`${pendingCopy.key}.pending`)}
          destructive={pendingCopy.destructive}
          onSubmit={runPending}
          isSaving={suspend.isPending || reactivate.isPending || remove.isPending || revoke.isPending}
        />
      ) : null}
    </AdminPage>
  );
}

function dialogCopyFor(pending: PendingAction) {
  if (pending.kind === "revoke") {
    return { key: "revoke", destructive: true, subject: { primary: pending.invitation.email, secondary: pending.invitation.roleName } };
  }
  return {
    key: pending.kind,
    destructive: pending.kind !== "reactivate",
    subject: { primary: pending.member.fullName, secondary: `${pending.member.email} · ${pending.member.roleName}` },
  };
}

/**
 * The row's actions. Everything that changes access is behind staff.manage AND the hierarchy rule
 * (never yourself, never someone holding more than you); the activity link needs audit.read.
 */
function StaffRowMenu({
  member,
  canManage,
  canReadAudit,
  onChangeRole,
  onStatus,
}: {
  member: StaffMemberDto;
  canManage: boolean;
  canReadAudit: boolean;
  onChangeRole: () => void;
  onStatus: (kind: "suspend" | "reactivate" | "remove") => void;
}) {
  const t = useTranslations("adminStaff.staff.menu");
  if (!canManage && !canReadAudit) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("open", { name: member.fullName })}
        className="inline-grid size-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <DotsThree size={16} weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {canReadAudit ? (
          <DropdownMenuItem
            render={<Link href={`/admin/audit?actor=${encodeURIComponent(member.userId)}`} />}
          >
            <ClockCounterClockwise size={14} />
            {t("activity")}
          </DropdownMenuItem>
        ) : null}
        {canManage ? (
          <>
            {canReadAudit ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onClick={onChangeRole}>
              <UserSwitch size={14} />
              {t("changeRole")}
            </DropdownMenuItem>
            {member.status === "active" ? (
              <DropdownMenuItem onClick={() => onStatus("suspend")}>
                <Pause size={14} />
                {t("suspend")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onStatus("reactivate")}>
                <Play size={14} />
                {t("reactivate")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => onStatus("remove")}>
              <Trash size={14} />
              {t("remove")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AdminStaffPage() {
  // Same ground as the page it stands in for — see check-admin-surface-contract.
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <StaffDirectory />
    </Suspense>
  );
}
