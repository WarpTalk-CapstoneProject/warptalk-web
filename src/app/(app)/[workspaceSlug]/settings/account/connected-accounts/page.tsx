"use client";

/**
 * Connected accounts — the ways you can sign in, and linking Google to this account.
 *
 * WHERE LINK STATUS COMES FROM
 *   GET /auth/me reports `googleLinked` and `hasPassword` (booleans only; the Google subject id
 *   and the password hash stay in the auth service). An auth service older than those fields
 *   omits them, and the page then says it cannot tell rather than guessing — see
 *   lib/auth/google-link-state.ts.
 *
 * HOW LINKING GETS A CREDENTIAL
 *   The same `useGoogleLogin` popup the sign-in page uses, sending the same OAuth access token to
 *   POST /auth/google/link. The auth service verifies it was minted for WarpTalk's client id, and
 *   refuses a Google account whose email is not this account's email; that refusal's own message
 *   is shown. Like the sign-in button, nothing on this path goes to the console — the token is a
 *   live credential.
 *
 * WHY UNLINK CAN BE DISABLED
 *   UnlinkGoogleAsync refuses when the account has no password, because Google would then be the
 *   only way back in. The page applies the same rule before the click and says what to do; the
 *   server's message is still surfaced if it refuses anyway.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useGoogleLogin } from "@react-oauth/google";
import { Key, Spinner, Warning } from "@phosphor-icons/react";

import { WorkspacePage } from "@/components/workspace/page-chrome";
import { GoogleAuthIcon } from "@/components/auth/cinematic-auth-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLinkGoogle, useSignInMethods, useUnlinkGoogle } from "@/hooks/use-connected-accounts";
import { getErrorMessage } from "@/lib/api/errors";
import { googleLinkState, type GoogleLinkState } from "@/lib/auth/google-link-state";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

const secondaryButton =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-2 px-3 text-xs font-semibold text-ink transition hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60";

/** The band divider, as on Security. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
      {children}
    </div>
  );
}

function StatusPill({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        on
          ? "border-primary/20 bg-primary/10 text-primary"
          : "border-hairline bg-surface-2 text-ink-muted"
      }`}
    >
      {children}
    </span>
  );
}

function MethodRow({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-md border border-hairline bg-surface-2">
          {icon}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink">
            {title}
          </span>
          {hint ? <span className="text-[11px] text-ink-muted">{hint}</span> : null}
        </div>
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

/**
 * Only mounted when a client id is configured: `useGoogleLogin` against the placeholder id the
 * provider falls back to opens a popup Google rejects.
 */
function LinkGoogleButton() {
  const linkMutation = useLinkGoogle();

  const openGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        await linkMutation.mutateAsync(tokenResponse.access_token);
        toast.success("Google account linked.");
      } catch (error) {
        toast.error(getErrorMessage(error, "Couldn't link your Google account."));
      }
    },
    onError: () => {
      toast.error("Google authentication failed or the popup was closed.");
    },
  });

  return (
    <button
      type="button"
      className={secondaryButton}
      onClick={() => openGoogle()}
      disabled={linkMutation.isPending}
    >
      {linkMutation.isPending && <Spinner size={12} className="animate-spin" />}
      Link Google
    </button>
  );
}

function GoogleActions({
  state,
  onUnlink,
  unlinking,
}: {
  state: GoogleLinkState;
  onUnlink: () => void;
  unlinking: boolean;
}) {
  if (state.kind === "unknown") return null;

  if (state.kind === "not-linked") {
    return GOOGLE_CLIENT_ID ? (
      <LinkGoogleButton />
    ) : (
      <button
        type="button"
        className={secondaryButton}
        disabled
        title="Google sign-in is not configured for this deployment."
      >
        Link Google
      </button>
    );
  }

  return (
    <button
      type="button"
      className={secondaryButton}
      onClick={onUnlink}
      disabled={!state.canUnlink || unlinking}
      title={state.canUnlink ? undefined : state.reason}
    >
      {unlinking && <Spinner size={12} className="animate-spin" />}
      Unlink
    </button>
  );
}

export default function ConnectedAccountsPage() {
  const methodsQuery = useSignInMethods();
  const unlinkMutation = useUnlinkGoogle();
  const [confirmUnlinkOpen, setConfirmUnlinkOpen] = useState(false);

  if (methodsQuery.isPending) {
    return (
      <WorkspacePage>
        <div className="flex h-[80vh] items-center justify-center">
          <Spinner className="h-8 w-8 animate-spin text-primary" />
        </div>
      </WorkspacePage>
    );
  }

  if (methodsQuery.isError || !methodsQuery.data) {
    return (
      <WorkspacePage>
        <div className="flex h-[80vh] items-center justify-center px-4">
          <div className="flex max-w-md flex-col items-center gap-2 rounded-lg border border-hairline bg-surface-1 p-6 text-center shadow-linear">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Warning className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-ink">Couldn&apos;t load your sign-in methods</p>
            <p className="text-xs text-ink-muted">
              Retry, and if it keeps failing check that the auth service is reachable.
            </p>
            <button
              type="button"
              onClick={() => methodsQuery.refetch()}
              disabled={methodsQuery.isFetching}
              className="mt-2 inline-flex h-9 items-center rounded-md border border-hairline bg-surface-2 px-4 text-xs font-semibold transition hover:bg-surface-3 disabled:opacity-60"
            >
              {methodsQuery.isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        </div>
      </WorkspacePage>
    );
  }

  const user = methodsQuery.data;
  const google = googleLinkState(user);
  const passwordKnown = typeof user.hasPassword === "boolean";

  const googleHint =
    google.kind === "unknown"
      ? "Link status isn't available from the server yet."
      : google.kind === "not-linked"
        ? `Sign in with the Google account for ${user.email}. Its email must match this account.`
        : google.canUnlink
          ? `Sign in with Google as ${user.email}.`
          : google.reason;

  const handleUnlinkConfirm = async () => {
    try {
      await unlinkMutation.mutateAsync();
      toast.success("Google account unlinked.");
      setConfirmUnlinkOpen(false);
    } catch (error) {
      // MIN_AUTH_METHOD_REQUIRED arrives here if the server disagrees with what the page read.
      toast.error(getErrorMessage(error, "Couldn't unlink your Google account."));
    }
  };

  return (
    <WorkspacePage>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 text-ink">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold tracking-tight text-ink">Connected accounts</h1>
            <p className="text-xs text-ink-muted">
              The ways you can sign in to WarpTalk as {user.email}.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <SectionLabel>Sign-in methods</SectionLabel>
            <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1 shadow-linear">
              <MethodRow
                icon={<GoogleAuthIcon className="size-4" />}
                title={
                  <>
                    Google
                    {google.kind !== "unknown" && (
                      <StatusPill on={google.kind === "linked"}>
                        {google.kind === "linked" ? "Connected" : "Not connected"}
                      </StatusPill>
                    )}
                  </>
                }
                hint={googleHint}
              >
                <GoogleActions
                  state={google}
                  onUnlink={() => setConfirmUnlinkOpen(true)}
                  unlinking={unlinkMutation.isPending}
                />
              </MethodRow>

              {/* Read-only: there is no change-password screen in the web app yet. */}
              <MethodRow
                icon={<Key size={16} className="text-ink-muted" weight="duotone" />}
                title={
                  <>
                    Password
                    {passwordKnown && (
                      <StatusPill on={user.hasPassword === true}>
                        {user.hasPassword ? "Set" : "Not set"}
                      </StatusPill>
                    )}
                  </>
                }
                hint={
                  !passwordKnown
                    ? "Password status isn't available from the server yet."
                    : user.hasPassword
                      ? "Sign in with your email and password."
                      : "No password yet. Use Forgot password on the sign-in page to set one."
                }
              />
            </div>
          </div>
        </div>
      </div>

      <Dialog open={confirmUnlinkOpen} onOpenChange={setConfirmUnlinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink Google?</DialogTitle>
            <DialogDescription>
              You will no longer be able to sign in with Google. You can still sign in with your
              email and password, and link Google again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setConfirmUnlinkOpen(false)}
              disabled={unlinkMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUnlinkConfirm}
              disabled={unlinkMutation.isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-destructive px-3 text-xs font-semibold text-white transition hover:bg-destructive/90 disabled:opacity-60"
            >
              {unlinkMutation.isPending && <Spinner size={12} className="animate-spin" />}
              Unlink Google
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePage>
  );
}
