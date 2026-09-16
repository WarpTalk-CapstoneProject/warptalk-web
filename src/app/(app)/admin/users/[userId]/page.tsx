"use client";

/**
 * One platform account, in full.
 *
 * WHY THIS PAGE EXISTS
 *   `useAdminUserDetail`, `adminUserService.getDetail` and `GET /admin/users/{id}` were all written
 *   and routed, and nothing called them — so everything the detail endpoint returns beyond the
 *   directory row was unreachable: the lockout window, whether the email was ever confirmed, and
 *   the list of sessions with the device and address each one is open from. The directory showed
 *   `activeSessionCount` — a number with no way to ask what it was counting.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   No delete. A user's rows reach transcripts, voice profiles and billing across four services,
 *   so removing one is a data-lifecycle decision rather than a button on a page — the service says
 *   the same thing in its own header.
 *
 *   No workspace memberships. They live in another service, and resolving them here would put this
 *   screen behind a gRPC call, on the screen an administrator opens when something is wrong.
 *
 *   No second confirmation flow. `AdminUserActionDialog` already owns the reason box, the
 *   ten-character floor and the wording for a failed write; this page hands it a submit function
 *   and nothing else. A second dialog with its own copy is how two surfaces start disagreeing
 *   about what an action does.
 */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowsClockwise,
  DeviceMobile,
  LockOpen,
  SignOut,
  UserCircleMinus,
  UserCirclePlus,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { UserStatusBadge } from "@/components/admin/UserStatusBadge";
import {
  AdminUserActionDialog,
  type AdminUserAction,
} from "@/components/admin/user-action-dialog";
import {
  useAdminUserDetail,
  useRevokeAdminUserSessions,
  useSetAdminUserActive,
  useUnlockAdminUser,
} from "@/hooks/use-admin-users";
import { cn } from "@/lib/utils";
import type { AdminUserSessionDto } from "@/types/admin-user";

type ApiErrorLike = { response?: { status?: number } };

function formatMoment(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/** A label above a value, the shape the workspace detail page uses for the same job. */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
        {label}
      </span>
      <span className="text-[13px] text-ink">{children}</span>
    </div>
  );
}

/**
 * A yes/no fact about the account, stated as the state it is in rather than as a switch.
 *
 * None of these three are editable here: `emailVerified` is the person's own action, `isActive`
 * and `isLockedOut` change through the audited actions below. Drawing them as toggles would
 * offer a second, unaudited way to set the same thing.
 */
function StateRow({
  label,
  hint,
  value,
  tone,
}: {
  label: string;
  hint: string;
  value: string;
  tone: "ok" | "warn" | "muted";
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline/60 px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
          tone === "ok" &&
            "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          tone === "warn" &&
            "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          tone === "muted" && "border-border bg-surface-2 text-ink-muted",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SessionRow({ session }: { session: AdminUserSessionDto }) {
  return (
    <li className="flex flex-col gap-1 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-0">
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-muted">
          <DeviceMobile size={14} weight="duotone" />
        </span>
        {/* The device string is whatever the client sent, so it can be absent. "Unknown device" is
            a fact about the record; an empty cell reads as a rendering bug. */}
        <span className="min-w-0 truncate text-[13px] text-ink">
          {session.deviceInfo?.trim() || "Unknown device"}
        </span>
      </span>
      <span className="w-[150px] shrink-0 font-mono text-[12px] text-ink-muted">
        {session.ipAddress?.trim() || "—"}
      </span>
      <span className="w-[170px] shrink-0 text-[12px] text-ink-muted">
        {formatMoment(session.createdAt)}
      </span>
      <span className="w-[170px] shrink-0 text-[12px] text-ink-muted">
        {formatMoment(session.expiresAt)}
      </span>
    </li>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;

  const detailQuery = useAdminUserDetail(userId);
  const revokeSessions = useRevokeAdminUserSessions();
  const setActive = useSetAdminUserActive();
  const unlock = useUnlockAdminUser();

  const [pendingAction, setPendingAction] = useState<AdminUserAction | null>(null);

  const detail = detailQuery.data;

  // Every mutation invalidates ADMIN_USER_KEYS.all, which this query is under — so the page
  // re-reads itself after an action without being told to.
  const runPendingAction = (reason: string) => {
    if (!detail || !pendingAction) return Promise.resolve();
    const request = { reason };
    const id = detail.user.id;

    switch (pendingAction) {
      case "revoke-sessions":
        return revokeSessions.mutateAsync({ userId: id, request });
      case "unlock":
        return unlock.mutateAsync({ userId: id, request });
      case "deactivate":
        return setActive.mutateAsync({ userId: id, isActive: false, request });
      case "reactivate":
        return setActive.mutateAsync({ userId: id, isActive: true, request });
    }
  };

  if (detailQuery.isPending) {
    return (
      <AdminPage>
        <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
        <div className="mt-6 h-8 w-64 animate-pulse rounded bg-surface-2" />
        <AdminPanel className="mt-6">
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-9 animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        </AdminPanel>
      </AdminPage>
    );
  }

  if (detailQuery.isError || !detail) {
    // 404 and 403 are different answers and get different copy: one says this account does not
    // exist, the other says your session no longer carries the platform admin role. Collapsing
    // them into "could not load" sends the reader looking for the wrong problem.
    const status = (detailQuery.error as ApiErrorLike | undefined)?.response?.status;
    const notFound = status === 404;

    return (
      <AdminPage>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={13} />
          Accounts
        </Link>
        <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-hairline bg-surface-1 p-8 text-center shadow-linear">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <WarningCircle size={22} weight="duotone" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">
            {notFound ? "Account not found" : "This account could not be loaded"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {notFound
              ? "No account carries this id. It may have been permanently removed, or the link is wrong."
              : "Check the auth service, and that your session still holds the platform admin role."}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/admin/users">
              <Button variant="outline" size="sm">
                Back to directory
              </Button>
            </Link>
            {!notFound ? (
              <Button size="sm" onClick={() => void detailQuery.refetch()}>
                Try again
              </Button>
            ) : null}
          </div>
        </div>
      </AdminPage>
    );
  }

  const { user, activeSessions, emailVerified, isActive, isLockedOut, lockedUntil } = detail;
  const isSaving = revokeSessions.isPending || setActive.isPending || unlock.isPending;

  return (
    <AdminPage>
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={13} />
        Accounts
      </Link>

      <div className="mt-3">
        <AdminPageHeader
          eyebrow="Platform account"
          eyebrowIcon={<UserCircle size={14} weight="fill" />}
          title={user.fullName || user.email}
          description={user.email}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void detailQuery.refetch()}
                disabled={detailQuery.isFetching}
              >
                <ArrowsClockwise
                  size={14}
                  className={cn(detailQuery.isFetching && "animate-spin")}
                />
                Refresh
              </Button>

              {/* Unlock is offered only while a lockout is actually running — it clears itself when
                  the window passes, so a permanent button would mostly do nothing. */}
              {isLockedOut ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingAction("unlock")}
                  disabled={isSaving}
                >
                  <LockOpen size={14} />
                  Unlock
                </Button>
              ) : null}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingAction("revoke-sessions")}
                disabled={isSaving}
              >
                <SignOut size={14} />
                End sessions
              </Button>

              {isActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingAction("deactivate")}
                  disabled={isSaving}
                >
                  <UserCircleMinus size={14} />
                  Deactivate
                </Button>
              ) : (
                <Button size="sm" onClick={() => setPendingAction("reactivate")} disabled={isSaving}>
                  <UserCirclePlus size={14} />
                  Reactivate
                </Button>
              )}
            </div>
          }
        />
      </div>

      <h2 className="mt-6 text-sm font-semibold text-ink">Identity</h2>
      <AdminPanel className="mt-3">
        <div className="grid gap-5 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Status">
            {/* The server derives this from five columns with a fixed precedence — deleted beats
                locked beats deactivated beats unverified beats active. Shown, never recomputed. */}
            <UserStatusBadge status={user.status} />
          </Fact>
          <Fact label="Platform roles">
            {user.roles.length === 0 ? (
              <span className="text-ink-subtle">—</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {user.roles.map((role) => (
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
              </span>
            )}
          </Fact>
          <Fact label="Last signed in">
            {user.lastLoginAt ? (
              formatMoment(user.lastLoginAt)
            ) : (
              <span className="italic text-ink-subtle">Never signed in</span>
            )}
          </Fact>
          <Fact label="Account created">{formatMoment(user.createdAt)}</Fact>
        </div>
      </AdminPanel>

      <h2 className="mt-8 text-sm font-semibold text-ink">Access</h2>
      <AdminPanel className="mt-3">
        <StateRow
          label="Email confirmed"
          hint="Whether the person has ever completed the verification link."
          value={emailVerified ? "Confirmed" : "Not confirmed"}
          tone={emailVerified ? "ok" : "muted"}
        />
        <StateRow
          label="Sign-in allowed"
          hint="Deactivating also ends every session already open."
          value={isActive ? "Allowed" : "Deactivated"}
          tone={isActive ? "ok" : "warn"}
        />
        <StateRow
          label="Failed-login lockout"
          hint={
            isLockedOut && lockedUntil
              ? `Clears itself at ${formatMoment(lockedUntil)}. Unlock does not wait for it.`
              : "A lockout is temporary and clears itself once the window passes."
          }
          value={isLockedOut ? "Locked" : "None"}
          tone={isLockedOut ? "warn" : "muted"}
        />
      </AdminPanel>

      <h2 className="mt-8 flex items-baseline gap-2 text-sm font-semibold text-ink">
        Sessions
        <span className="text-[11px] font-normal text-ink-muted">
          {activeSessions.length === 0
            ? "none open"
            : `${activeSessions.length} open right now`}
        </span>
      </h2>
      <AdminPanel className="mt-3">
        {activeSessions.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
            No sessions are open. The account is not signed in anywhere.
          </p>
        ) : (
          <>
            <div className="hidden border-b border-hairline/60 px-4 py-2 text-[11px] font-medium text-ink-muted md:flex">
              <span className="flex-1">Device</span>
              <span className="w-[150px]">IP address</span>
              <span className="w-[170px]">Signed in</span>
              <span className="w-[170px]">Expires</span>
            </div>
            <ul>
              {activeSessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      <p className="mt-3 text-[12px] text-ink-muted">
        A session row never carries the token or its hash — an administrator needs to know a session
        exists, not to be able to use it. Ending sessions does not lock the account or change the
        password: the person can sign in again immediately.
      </p>

      <AdminUserActionDialog
        user={pendingAction ? user : null}
        action={pendingAction ?? "revoke-sessions"}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        onSubmit={runPendingAction}
        isSaving={isSaving}
      />
    </AdminPage>
  );
}
