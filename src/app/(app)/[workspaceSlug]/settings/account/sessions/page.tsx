"use client";

/**
 * Sessions & devices — where you are signed in, and a way to end it.
 *
 * A session here is a refresh-token family on the server: one sign-in and every token rotation
 * has derived from it. The server marks the one making the request (`isCurrent`), from the
 * HttpOnly refresh cookie.
 *
 * THE CURRENT SESSION DOES NOT END THROUGH THE REVOKE ENDPOINT
 *   It ends through `useAuthStore().logout()`, exactly like the sidebar's Sign out. Revoking it via
 *   DELETE /auth/sessions/{id} would kill the family while this tab still holds the cookies and an
 *   access token, and the tab would find out on its next refresh — the dead-session path, which is
 *   where the WT-405 logout storm lived. logout() tears the tab down, runs the deduplicated revoke,
 *   and the server clears the cookies in the same response. The server refuses the other route
 *   with 409, so this is enforced on both sides.
 *
 * Other sessions' access tokens stay valid until they expire (up to one access-token lifetime);
 * what ends immediately is their ability to refresh. That is the same guarantee logout gives.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { SignOut, Spinner, Warning } from "@phosphor-icons/react";

import { WorkspacePage } from "@/components/workspace/page-chrome";
import { SessionRow } from "@/components/features/settings/session-row";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMySessions, useRevokeOtherSessions, useRevokeSession } from "@/hooks/use-sessions";
import { getErrorMessage } from "@/lib/api/errors";
import { describeSessionDevice } from "@/lib/auth/describe-session-device";
import { useAuthStore } from "@/stores/auth-store";
import type { UserSessionDto } from "@/types/auth";

type PendingConfirm =
  | { kind: "revoke"; session: UserSessionDto }
  | { kind: "sign-out-current" }
  | { kind: "revoke-others"; count: number };

export default function SessionsPage() {
  const t = useTranslations("settingsSessions");
  const logout = useAuthStore((s) => s.logout);
  const sessionsQuery = useMySessions();
  const revokeSession = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const sessions = sessionsQuery.data ?? [];
  const others = sessions.filter((s) => !s.isCurrent);
  const hasCurrent = sessions.some((s) => s.isCurrent);
  const isWorking = revokeSession.isPending || revokeOthers.isPending;

  async function confirm() {
    if (!pending) return;

    if (pending.kind === "sign-out-current") {
      setPending(null);
      logout();
      return;
    }

    try {
      if (pending.kind === "revoke") {
        await revokeSession.mutateAsync(pending.session.id);
        toast.success(t("toasts.sessionSignedOut"));
      } else {
        await revokeOthers.mutateAsync();
        toast.success(t("toasts.othersSignedOut"));
      }
      setPending(null);
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.signOutFailed")));
    }
  }

  return (
    <WorkspacePage>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 text-ink">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              {t("subheading")}
            </p>
            {/*
              Offered only when the current session was identified: without it, "all others" has
              no anchor, and the server refuses rather than signing you out everywhere.
            */}
            {hasCurrent && others.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={isWorking}
                onClick={() => setPending({ kind: "revoke-others", count: others.length })}
              >
                <SignOut size={14} />
                {t("signOutAllOthers")}
              </Button>
            )}
          </div>

          {sessionsQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
            </div>
          ) : sessionsQuery.isError ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-4 py-8 text-center shadow-linear">
              <Warning className="h-5 w-5 text-destructive" />
              <p className="text-xs text-ink-muted">
                {getErrorMessage(sessionsQuery.error, t("loadFailed"))}
              </p>
              <Button variant="outline" size="sm" onClick={() => sessionsQuery.refetch()}>
                {t("retry")}
              </Button>
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-lg border border-hairline bg-surface-1 px-4 py-8 text-center text-xs text-ink-muted shadow-linear">
              {t("noActiveSessions")}
            </div>
          ) : (
            <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1 shadow-linear">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  deviceInfo={session.deviceInfo}
                  ipAddress={session.ipAddress}
                  signedInAt={session.signedInAt}
                  lastActiveAt={session.lastActiveAt}
                  expiresAt={session.expiresAt}
                  isCurrent={session.isCurrent}
                  action={
                    session.isCurrent ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isWorking}
                        onClick={() => setPending({ kind: "sign-out-current" })}
                      >
                        {t("signOut")}
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isWorking}
                        onClick={() => setPending({ kind: "revoke", session })}
                      >
                        {t("revoke")}
                      </Button>
                    )
                  }
                />
              ))}
            </div>
          )}

          {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length > 0 && !hasCurrent && (
            <p className="text-[11px] text-ink-muted">
              {t("couldNotMatchDevice")}
            </p>
          )}
        </div>
      </div>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && !isWorking && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "revoke"
                ? t("dialog.revokeTitle")
                : pending?.kind === "revoke-others"
                  ? t("dialog.signOutOthersTitle")
                  : t("dialog.signOutDeviceTitle")}
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === "revoke"
                ? t("dialog.revokeDescription", {
                    device: describeSessionDevice(pending.session.deviceInfo, (key, values) =>
                      t(`deviceLabel.${key}`, values),
                    ).label,
                    ip: pending.session.ipAddress ? ` (${pending.session.ipAddress})` : "",
                  })
                : pending?.kind === "revoke-others"
                  ? t("dialog.signOutOthersDescription", { count: pending.count })
                  : t("dialog.signOutDeviceDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={isWorking} onClick={() => setPending(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" size="sm" disabled={isWorking} onClick={confirm}>
              {isWorking ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
              {pending?.kind === "revoke" ? t("revoke") : t("signOut")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePage>
  );
}
