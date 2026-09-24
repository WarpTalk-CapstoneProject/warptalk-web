"use client";

import { Suspense, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowsClockwise,
  CalendarBlank,
  ClockCounterClockwise,
  LockOpen,
  ShieldCheck,
  SignIn,
  SignOut,
  UserCircleMinus,
  UserCirclePlus,
  Users as UsersIcon,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  AdminStatusTabs,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { UserStatusBadge } from "@/components/admin/UserStatusBadge";
import {
  AdminUserActionDialog,
  type AdminUserAction,
} from "@/components/admin/user-action-dialog";
import {
  useAdminUserDirectory,
  useRevokeAdminUserSessions,
  useSetAdminUserActive,
  useUnlockAdminUser,
} from "@/hooks/use-admin-users";
import {
  booleanValue,
  dateRangeBounds,
  dateRangeValue,
  enumValue,
  type ListStateConfig,
} from "@/lib/admin/list-state";
import { cn } from "@/lib/utils";
import type {
  AdminUserDirectoryQuery,
  AdminUserSort,
  AdminUserStatusFilter,
  AdminUserSummaryDto,
} from "@/types/admin-user";

const PAGE_SIZE = 20;

// Values only — labels are looked up via adminUsers.list.statusTabs so they translate.
const STATUS_TAB_VALUES = ["all", "active", "locked", "unverified", "deactivated", "deleted"] as const;

/**
 * The directory's whole view in the URL. Every filter is server-side (UserRepository.ApplyFilters
 * in the auth service); this page only ever holds one page of accounts.
 */
const LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", values: ["active", "locked", "unverified", "deactivated", "deleted"] },
    // An open set — platform roles are the server's to define.
    { key: "role", kind: "enum" },
    { key: "neverSignedIn", kind: "boolean" },
    { key: "lastLogin", kind: "dateRange" },
    { key: "created", kind: "dateRange" },
  ],
  sortFields: ["created", "name", "lastLogin"],
  defaultSort: { field: "created", direction: "desc" },
  columns: [
    { id: "user" },
    { id: "status" },
    { id: "roles" },
    { id: "sessions" },
    { id: "lastLogin" },
    { id: "created", defaultHidden: true },
    { id: "actions" },
  ],
  groupings: ["status"],
};

function apiSort(field: string, direction: "asc" | "desc"): AdminUserSort {
  if (field === "name") return direction === "asc" ? "name_asc" : "name_desc";
  if (field === "lastLogin") return direction === "asc" ? "last_login_asc" : "last_login_desc";
  return direction === "asc" ? "created_asc" : "created_desc";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/**
 * "Never" is a real answer and is said out loud.
 *
 * An account that has never signed in and one that signed in a year ago are different facts, and
 * a blank cell reads as neither — it reads as missing data.
 */
function LastLoginCell({ value }: { value: string | null }) {
  const t = useTranslations("adminUsers.list");
  if (!value) {
    return <span className="text-xs italic text-ink-subtle">{t("neverSignedIn")}</span>;
  }
  return <span className="text-[13px] text-ink-muted">{formatDate(value)}</span>;
}

function RolesCell({ roles }: { roles: string[] }) {
  const t = useTranslations("adminUsers.list");
  if (roles.length === 0) {
    // No platform role is the ordinary state for an ordinary user — every workspace-scoped role
    // lives in another service. Saying "none" would imply something is missing.
    return <span className="text-xs text-ink-subtle">{t("noRoles")}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <span
          key={role}
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            role === "admin"
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-border bg-surface-2 text-ink-muted",
          )}
        >
          {role}
        </span>
      ))}
    </div>
  );
}

function UsersDirectory() {
  const t = useTranslations("adminUsers.list");
  const list = useAdminListState(LIST_CONFIG);
  const { state } = list;

  const status = (enumValue(state.filters, "status") ?? "all") as AdminUserStatusFilter;
  const role = enumValue(state.filters, "role");
  const created = dateRangeBounds(dateRangeValue(state.filters, "created") ?? {});
  const neverSignedIn = booleanValue(state.filters, "neverSignedIn");
  // The server refuses "never signed in" together with a last-login window (they cannot both
  // hold), so the window is dropped rather than turned into a 400.
  const lastLogin = neverSignedIn ? {} : dateRangeBounds(dateRangeValue(state.filters, "lastLogin") ?? {});

  const query = useMemo<AdminUserDirectoryQuery>(
    () => ({
      page: state.page,
      pageSize: PAGE_SIZE,
      status,
      sort: apiSort(state.sort.field, state.sort.direction),
      search: state.search || undefined,
      role,
      createdFrom: created.from,
      createdTo: created.toExclusive,
      lastLoginFrom: lastLogin.from,
      lastLoginTo: lastLogin.toExclusive,
      neverSignedIn,
    }),
    [
      state.page,
      status,
      state.sort.field,
      state.sort.direction,
      state.search,
      role,
      created.from,
      created.toExclusive,
      lastLogin.from,
      lastLogin.toExclusive,
      neverSignedIn,
    ],
  );

  const directoryQuery = useAdminUserDirectory(query);
  const revokeSessions = useRevokeAdminUserSessions();
  const setActive = useSetAdminUserActive();
  const unlock = useUnlockAdminUser();

  // The row and the verb together, so the dialog's wording and the endpoint it calls cannot
  // disagree with each other while it closes.
  const [pending, setPending] = useState<{
    user: AdminUserSummaryDto;
    action: AdminUserAction;
  } | null>(null);

  const runPendingAction = (reason: string) => {
    if (!pending) return Promise.resolve();
    const { user, action } = pending;
    const request = { reason };

    switch (action) {
      case "revoke-sessions":
        return revokeSessions.mutateAsync({ userId: user.id, request });
      case "unlock":
        return unlock.mutateAsync({ userId: user.id, request });
      case "deactivate":
        return setActive.mutateAsync({ userId: user.id, isActive: false, request });
      case "reactivate":
        return setActive.mutateAsync({ userId: user.id, isActive: true, request });
    }
  };
  const items = useMemo(() => directoryQuery.data?.items ?? [], [directoryQuery.data]);
  const total = directoryQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Platform roles are an open set the server owns. "admin" is always offered (it is the one
  // that matters here); anything else seen on this page, or already in the URL, joins it.
  const roleOptions = useMemo(() => {
    const seen = new Set<string>(["admin"]);
    for (const user of items) for (const r of user.roles) seen.add(r);
    if (role) seen.add(role);
    return Array.from(seen).map((value) => ({
      value,
      label: value === "admin" ? t("filters.platformAdmin") : value,
    }));
  }, [items, role, t]);

  const filterFields = useMemo<AdminFilterField[]>(
    () => [
      { key: "role", label: t("filters.role"), icon: <ShieldCheck size={13} />, kind: "enum", options: roleOptions },
      {
        key: "neverSignedIn",
        label: t("filters.signedIn"),
        icon: <SignIn size={13} />,
        kind: "boolean",
        trueLabel: t("filters.neverSignedIn"),
        falseLabel: t("filters.hasSignedIn"),
      },
      { key: "lastLogin", label: t("filters.lastLogin"), icon: <ClockCounterClockwise size={13} />, kind: "dateRange" },
      { key: "created", label: t("filters.created"), icon: <CalendarBlank size={13} />, kind: "dateRange" },
    ],
    [roleOptions, t],
  );

  const columns = useMemo<AdminColumn<AdminUserSummaryDto>[]>(
    () => [
      {
        id: "user",
        header: t("columns.user"),
        primary: true,
        sortField: "name",
        cell: (user) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-surface-2 text-[11px] font-semibold uppercase text-ink-muted">
              {user.fullName.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink">{user.fullName}</p>
              <p className="truncate text-[11px] text-ink-subtle">{user.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        className: "w-[120px]",
        cell: (user) => <UserStatusBadge status={user.status} />,
      },
      {
        id: "roles",
        header: t("columns.roles"),
        className: "w-[160px]",
        cell: (user) => <RolesCell roles={user.roles} />,
      },
      {
        id: "sessions",
        header: t("columns.sessions"),
        align: "right",
        className: "w-[110px]",
        // Live sessions, not a login count. Zero is meaningful — it is what "signed out
        // everywhere" looks like — so it is printed rather than blanked.
        cell: (user) => (
          <span className={cn("text-[13px]", user.activeSessionCount === 0 ? "text-ink-subtle" : "text-ink-muted")}>
            {t("sessionCount", { count: user.activeSessionCount })}
          </span>
        ),
      },
      {
        id: "lastLogin",
        header: t("columns.lastLogin"),
        align: "right",
        className: "w-[140px]",
        sortField: "lastLogin",
        defaultDirection: "desc",
        cell: (user) => <LastLoginCell value={user.lastLoginAt} />,
      },
      {
        id: "created",
        header: t("columns.created"),
        align: "right",
        className: "w-[130px]",
        sortField: "created",
        defaultDirection: "desc",
        cell: (user) => <span className="text-[13px] text-ink-muted">{formatDate(user.createdAt)}</span>,
      },
      {
        id: "actions",
        header: t("columns.actions"),
        align: "right",
        className: "w-[250px]",
        cell: (user) => <UserActions user={user} onAction={(target, action) => setPending({ user: target, action })} />,
      },
    ],
    [t],
  );

  const statusTabs = useMemo(
    () => STATUS_TAB_VALUES.map((value) => ({ value, label: t(`statusTabs.${value}`) })),
    [t],
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<UsersIcon size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void directoryQuery.refetch()}
            disabled={directoryQuery.isFetching}
          >
            <ArrowsClockwise
              size={14}
              className={cn(directoryQuery.isFetching && "animate-spin")}
            />
            {t("refresh")}
          </Button>
        }
      />

      <AdminStatusTabs list={list} filterKey="status" tabs={statusTabs} label={t("statusTabsLabel")} />

      <AdminListToolbar
        list={list}
        searchPlaceholder={t("searchPlaceholder")}
        filters={filterFields}
        count={directoryQuery.isPending ? null : total}
        countLabel={t("accountCount", { count: total })}
        isFetching={directoryQuery.isFetching && !directoryQuery.isPending}
        display={{
          sortOptions: [
            { field: "created", label: t("sortFields.created") },
            { field: "name", label: t("sortFields.name") },
            { field: "lastLogin", label: t("sortFields.lastLogin") },
          ],
          groupOptions: [{ key: "status", label: t("columns.status") }],
          columns: columns
            .filter((column) => !column.primary && column.id !== "actions")
            .map((column) => ({ id: column.id, label: column.header })),
        }}
      />

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={items}
          rowKey={(user) => user.id}
          rowHref={(user) => `/admin/users/${user.id}`}
          isPending={directoryQuery.isPending}
          isError={directoryQuery.isError}
          onRetry={() => void directoryQuery.refetch()}
          empty={{
            title: t("emptyTitle"),
            description: t("emptyDescription"),
            icon: <UsersIcon size={20} weight="duotone" />,
          }}
          groupings={{
            status: {
              keyOf: (user) => user.status,
              label: (key) => t(`statusTabs.${key}`),
              order: ["active", "locked", "unverified", "deactivated", "deleted"],
            },
          }}
          pagination={{ page: state.page, pageCount: totalPages, total, pageSize: PAGE_SIZE }}
          caption={t("title")}
          minWidth={960}
        />
      </AdminPanel>

      <AdminUserActionDialog
        user={pending?.user ?? null}
        action={pending?.action ?? "revoke-sessions"}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onSubmit={runPendingAction}
        isSaving={revokeSessions.isPending || setActive.isPending || unlock.isPending}
      />
    </AdminPage>
  );
}

/**
 * A deleted account offers nothing: every action here would be acting on somebody who is already
 * gone, and the endpoints refuse it. Unlock appears only while there is a lockout to clear, so the
 * row never offers a no-op. The NAME cell carries the row link; these are buttons beside it, never
 * inside it (an anchor wrapping buttons is invalid HTML that browsers resolve by dropping one).
 */
function UserActions({
  user,
  onAction,
}: {
  user: AdminUserSummaryDto;
  onAction: (user: AdminUserSummaryDto, action: AdminUserAction) => void;
}) {
  const t = useTranslations("adminUsers.list");
  if (user.status === "deleted") {
    return <span className="text-[11px] text-ink-subtle">{t("noActionsAvailable")}</span>;
  }
  return (
    <div className="flex items-center justify-end gap-1.5">
      {user.status === "locked" ? (
        <Button variant="outline" size="sm" onClick={() => onAction(user, "unlock")}>
          <LockOpen size={13} />
          {t("unlock")}
        </Button>
      ) : null}
      {user.activeSessionCount > 0 ? (
        <Button variant="outline" size="sm" onClick={() => onAction(user, "revoke-sessions")}>
          <SignOut size={13} />
          {t("signOut")}
        </Button>
      ) : null}
      {user.status === "deactivated" ? (
        <Button variant="outline" size="sm" onClick={() => onAction(user, "reactivate")}>
          <UserCirclePlus size={13} />
          {t("reactivate")}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => onAction(user, "deactivate")}>
          <UserCircleMinus size={13} />
          {t("deactivate")}
        </Button>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  // Same ground as the page it stands in for — see check-admin-surface-contract.
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <UsersDirectory />
    </Suspense>
  );
}
