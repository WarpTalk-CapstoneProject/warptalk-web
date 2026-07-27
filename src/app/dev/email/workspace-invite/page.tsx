"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Spinner } from "@phosphor-icons/react";

import { useAcceptWorkspaceInvitationById } from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

function WorkspaceInviteEmailPreview() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const clearActiveWorkspace = useWorkspaceStore((state) => state.clearActiveWorkspace);
  const acceptInvitation = useAcceptWorkspaceInvitationById();

  const invitationId = searchParams.get("invitationId") || "";
  const workspaceName = searchParams.get("workspaceName") || "WarpTalk Workspace";
  const workspaceSlug = searchParams.get("workspaceSlug") || "workspace";
  const email = searchParams.get("email") || "invitee@example.com";
  const roleName = searchParams.get("roleName") || "Member";
  const membershipType = searchParams.get("membershipType") || "External";
  const inviterName = searchParams.get("inviterName") || "A Workspace Admin";
  const returnPath = `${pathname}?${searchParams.toString()}`;

  const acceptDisabledReason = useMemo(() => {
    if (!invitationId) return "Missing invitation id.";
    if (!isAuthenticated) return null;
    if (user?.email && user.email.toLowerCase() !== email.toLowerCase()) {
      return `Log in as ${email} to accept this invitation.`;
    }
    return null;
  }, [email, invitationId, isAuthenticated, user?.email]);

  async function handleAccept() {
    if (!invitationId) {
      toast.error("Missing invitation id.");
      return;
    }

    if (!isAuthenticated) {
      router.push(`/login?callbackUrl=${encodeURIComponent(returnPath)}`);
      return;
    }

    if (acceptDisabledReason) {
      toast.error(acceptDisabledReason);
      return;
    }

    try {
      await acceptInvitation.mutateAsync(invitationId);
      clearActiveWorkspace();
      toast.success("Invitation accepted. Welcome to the workspace!");
      router.replace("/workspace");
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || "Failed to accept invitation.");
    }
  }

  return (
    <main className="min-h-dvh bg-[#0f172a] px-4 py-10 font-sans text-slate-100">
      <div className="mx-auto mb-4 max-w-[640px] rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
        Dev email preview. This page simulates the mailbox message while the button still calls the real invitation accept API.
      </div>

      <article className="mx-auto max-w-[560px] rounded-xl border border-[#334155] bg-[#1e293b] px-8 py-9 shadow-2xl">
        <p className="mb-6 text-2xl font-extrabold text-sky-400">WarpTalk</p>
        <h1 className="mb-5 text-xl font-bold leading-tight text-slate-50">
          Join {workspaceName} on WarpTalk
        </h1>

        <div className="space-y-4 text-[15px] leading-relaxed text-slate-300">
          <p>Hello,</p>
          <p>
            <strong className="font-semibold text-slate-50">{inviterName}</strong>{" "}
            has invited you to join the{" "}
            <strong className="font-semibold text-slate-50">{workspaceName}</strong>{" "}
            workspace as a{" "}
            <span className="rounded bg-sky-700 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              {roleName}
            </span>
            .
          </p>
          <p>
            This invitation is bound to <span className="font-mono text-slate-100">{email}</span>{" "}
            as an {membershipType} member.
          </p>
        </div>

        {isAuthenticated && user?.email && (
          <div className="mt-6 rounded-md border border-slate-600 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
            Current session: <span className="font-mono text-slate-100">{user.email}</span>
          </div>
        )}

        {acceptDisabledReason && isAuthenticated && (
          <div className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-100">
            {acceptDisabledReason}
          </div>
        )}

        {!isAuthenticated && (
          <div className="mt-6 rounded-md border border-slate-600 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
            Sign in or create an account with <span className="font-mono text-slate-100">{email}</span> before accepting.
          </div>
        )}

        <button
          type="button"
          onClick={handleAccept}
          disabled={acceptInvitation.isPending}
          className="mt-7 inline-flex h-12 items-center gap-2 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
        >
          {acceptInvitation.isPending ? (
            <>
              <Spinner className="h-4 w-4 animate-spin" />
              Accepting
            </>
          ) : (
            <>
              Accept & Join Workspace
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        {!isAuthenticated && (
          <Link
            href={`/register?callbackUrl=${encodeURIComponent(returnPath)}`}
            className="ml-3 inline-flex h-12 items-center rounded-lg border border-slate-600 px-5 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
          >
            Create account
          </Link>
        )}

        <p className="mt-6 break-all text-xs leading-relaxed text-slate-400">
          If the button above does not work, sign in with {email} and open /workspace.
          Workspace slug: {workspaceSlug}
        </p>

        <hr className="my-7 border-slate-700" />
        <p className="text-xs leading-relaxed text-slate-500">
          If you did not expect this invitation, you can safely ignore this email.
        </p>
      </article>
    </main>
  );
}

export default function WorkspaceInviteEmailPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-[#0f172a] text-slate-100">
          <Spinner className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <WorkspaceInviteEmailPreview />
    </Suspense>
  );
}
