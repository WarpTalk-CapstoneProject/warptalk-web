"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowsClockwise,
  LockOpen,
  MagnifyingGlass,
  SignOut,
  UserCircleMinus,
  UserCirclePlus,
  Users as UsersIcon,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
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
import { cn } from "@/lib/utils";
import type {
  AdminUserSort,
  AdminUserStatusFilter,
  AdminUserSummaryDto,
} from "@/types/admin-user";

const PAGE_SIZE = 20;

// Values only — labels are looked up via adminUsers.list.statusTabs / sortOptions so they
// translate, while these arrays stay the stable source of truth for URL parsing/validation.
const STATUS_TAB_VALUES = ["all", "active", "locked", "unverified", "deactivated", "deleted"] as const;

const SORT_OPTION_VALUES = [
  "created_desc",
  "created_asc",
  "last_login_desc",
  "last_login_asc",
  "name_asc",
  "name_desc",
] as const;

// camelCase keys matching adminUsers.list.sortOptions in the message catalog.
const SORT_OPTION_KEYS: Record<(typeof SORT_OPTION_VALUES)[number], string> = {
  created_desc: "createdDesc",
  created_asc: "createdAsc",
  last_login_desc: "lastLoginDesc",
  last_login_asc: "lastLoginAsc",
  name_asc: "nameAsc",
  name_desc: "nameDesc",
};

function isStatusFilter(value: string | null): value is AdminUserStatusFilter {
  return STATUS_TAB_VALUES.some((tab) => tab === value);
}

function isSort(value: string | null): value is AdminUserSort {
  return SORT_OPTION_VALUES.some((option) => option === value);
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
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the source of truth, matching the workspace directory beside it: a shared or
  // refreshed link restores the same tab, search, sort and page.
  const statusParam = searchParams.get("status");
  const sortParam = searchParams.get("sort");
  const status: AdminUserStatusFilter = isStatusFilter(statusParam) ? statusParam : "all";
  const sort: AdminUserSort = isSort(sortParam) ? sortParam : "created_desc";
  const search = searchParams.get("q") ?? "";
  const role = searchParams.get("role") ?? "";
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  // The input is a draft until submitted, but back/forward changes ?q= behind it — adjust during
  // render rather than in an effect so the two never disagree.
  const [searchDraft, setSearchDraft] = useState(search);
  const [appliedSearch, setAppliedSearch] = useState(search);
  if (search !== appliedSearch) {
    setAppliedSearch(search);
    setSearchDraft(search);
  }

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    router.replace(queryString ? `/admin/users?${queryString}` : "/admin/users");
  };

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status,
      sort,
      search: search || undefined,
      role: role || undefined,
    }),
    [page, status, sort, search, role],
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
  const items = directoryQuery.data?.items ?? [];
  const total = directoryQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

      <AdminFilterTabs
        tabs={STATUS_TAB_VALUES.map((value) => ({
          value,
          label: t(`statusTabs.${value}`),
        }))}
        value={status}
        onChange={(value) =>
          updateParams({ status: value === "all" ? undefined : value, page: undefined })
        }
        label={t("statusTabsLabel")}
        trailing={
          directoryQuery.isPending
            ? t("loading")
            : t("accountCount", { count: total })
        }
      />

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form
          className="relative flex-1 lg:max-w-md"
          onSubmit={(event) => {
            event.preventDefault();
            updateParams({ q: searchDraft.trim() || undefined, page: undefined });
          }}
        >
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAriaLabel")}
            className="h-9 w-full rounded-lg border border-border bg-surface-1 pl-8 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
          />
        </form>

        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          {t("sortLabel")}
          <select
            value={sort}
            onChange={(event) => updateParams({ sort: event.target.value, page: undefined })}
            className="h-9 rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            {SORT_OPTION_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`sortOptions.${SORT_OPTION_KEYS[value]}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AdminPanel className="mt-4">
        {directoryQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("loadErrorTitle")}</p>
              <p className="mt-1 text-ink-muted">{t("loadErrorDescription")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void directoryQuery.refetch()}
              >
                {t("tryAgain")}
              </Button>
            </div>
          </div>
        ) : directoryQuery.isPending ? (
          <ul>
            {Array.from({ length: 6 }).map((_, index) => (
              <li
                key={index}
                className="flex items-center gap-4 border-b border-hairline/60 px-4 py-3 last:border-b-0"
              >
                <div className="h-8 w-8 animate-pulse rounded-full bg-surface-2" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-44 animate-pulse rounded bg-surface-2" />
                  <div className="h-2.5 w-28 animate-pulse rounded bg-surface-2" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="grid place-items-center px-4 py-14 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
                <UsersIcon size={20} weight="duotone" />
              </span>
              <p className="mt-3 text-sm font-medium">{t("emptyTitle")}</p>
              <p className="mt-1 text-xs text-ink-muted">{t("emptyDescription")}</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="hidden border-b border-hairline/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle md:flex md:items-center">
              <div className="flex-1">{t("columns.user")}</div>
              <div className="w-[110px] shrink-0">{t("columns.status")}</div>
              <div className="w-[160px] shrink-0">{t("columns.roles")}</div>
              <div className="w-[90px] shrink-0 text-right">{t("columns.sessions")}</div>
              <div className="w-[130px] shrink-0 text-right">{t("columns.lastLogin")}</div>
              <div className="w-[230px] shrink-0 text-right">{t("columns.actions")}</div>
            </div>
            <ul>
              {items.map((user) => (
                <li key={user.id}>
                  <UserRow
                    user={user}
                    onAction={(target, action) => setPending({ user: target, action })}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
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

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-[13px] text-ink-muted">
          <span>{t("pagination.pageOf", { page, totalPages })}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              {t("pagination.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              {t("pagination.next")}
            </Button>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}

function UserRow({
  user,
  onAction,
}: {
  user: AdminUserSummaryDto;
  onAction: (user: AdminUserSummaryDto, action: AdminUserAction) => void;
}) {
  const t = useTranslations("adminUsers.list");
  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-0">
      {/* The NAME is the link, not the row. Four action buttons sit at the other end of this
          strip, and an anchor wrapping them would be an interactive element inside an interactive
          element — invalid HTML that browsers resolve by dropping one of the two. */}
      <Link
        href={`/admin/users/${user.id}`}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-surface-2 text-[11px] font-semibold uppercase text-ink-muted">
          {user.fullName.slice(0, 2)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink group-hover:underline">
            {user.fullName}
          </p>
          <p className="truncate text-[11px] text-ink-subtle">{user.email}</p>
        </div>
      </Link>

      <div className="w-[110px] shrink-0">
        <UserStatusBadge status={user.status} />
      </div>

      <div className="w-[160px] shrink-0">
        <RolesCell roles={user.roles} />
      </div>

      {/* Live sessions, not a login count. Zero is meaningful — it is what "signed out
          everywhere" looks like — so it is printed rather than blanked. */}
      <div className="w-[90px] shrink-0 text-[13px] tabular-nums text-ink-muted md:text-right">
        {user.activeSessionCount === 0 ? (
          <span className="text-ink-subtle">{t("sessionCount", { count: 0 })}</span>
        ) : (
          t("sessionCount", { count: user.activeSessionCount })
        )}
      </div>

      <div className="w-[130px] shrink-0 md:text-right">
        <LastLoginCell value={user.lastLoginAt} />
      </div>

      {/* A deleted account offers nothing: every action here would be acting on somebody who is
          already gone, and the endpoints refuse it. Unlock appears only while there is a lockout
          to clear, so the row never offers a no-op. */}
      <div className="w-[230px] shrink-0 flex items-center justify-end gap-1.5">
        {user.status === "deleted" ? (
          <span className="text-[11px] text-ink-subtle">{t("noActionsAvailable")}</span>
        ) : (
          <>
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
          </>
        )}
      </div>
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
