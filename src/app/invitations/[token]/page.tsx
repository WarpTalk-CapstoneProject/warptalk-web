"use client";

import { Buildings, Spinner, UserCheck, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useAcceptWorkspaceInvitation,
  usePreviewWorkspaceInvitation,
} from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function InvitationAcceptPage({ params }: PageProps) {
  const { token } = use(params);
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  // Preview & Accept Queries
  const {
    data: previewData,
    isLoading,
    error,
  } = usePreviewWorkspaceInvitation(token);
  const acceptMutation = useAcceptWorkspaceInvitation();

  const handleAccept = async () => {
    if (!isAuthenticated) {
      // Redirect to register/login with callback
      toast.info("Please log in or register to accept this invitation.");
      router.push(
        `/register?callbackUrl=${encodeURIComponent(window.location.pathname)}`,
      );
      return;
    }

    try {
      await acceptMutation.mutateAsync(token);
      toast.success("Invitation accepted successfully!");

      // Select the workspace we just joined
      // Since select API requires workspaceId, we need to know the workspace ID.
      // But the preview API doesn't return workspaceId directly, or it might be returned in the accept response.
      // Let's redirect to `/workspace` selection page, which will automatically load the new membership.
      // This is extremely safe and redirects the user to choose their active workspace context.
      router.push("/workspace");
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ||
        "Failed to accept invitation. Make sure your account email matches the invitation.";
      toast.error(errorMsg);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas text-ink">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-ink-muted">
            Loading invitation details...
          </p>
        </div>
      </div>
    );
  }

  if (error || !previewData) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas text-ink px-4">
        <Card className="max-w-md border-hairline bg-surface-1 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Warning className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">
              Invalid Invitation
            </CardTitle>
            <CardDescription className="text-xs">
              This invitation token is invalid, expired, or has already been
              accepted.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-xs text-ink-muted">
              Please request a new invitation from your workspace Administrator.
            </p>
            <button
              onClick={() => router.push("/workspace")}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary text-xs font-semibold text-white transition hover:bg-primary-hover"
            >
              Go to Workspace selection
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = new Date(previewData.expiresAt) < new Date();
  const isAccepted = previewData.status === "Accepted";
  const canAccept = !isExpired && !isAccepted;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-canvas text-ink px-4">
      <Card className="max-w-md w-full border-hairline bg-surface-1 p-6 shadow-sm">
        <CardHeader className="flex flex-col items-center text-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Buildings className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg font-bold">
            Workspace Invitation
          </CardTitle>
          <CardDescription className="text-xs">
            You have been invited to join{" "}
            <span className="font-semibold text-ink">
              {previewData.workspaceName}
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 mt-2">
          <div className="rounded-md border border-hairline bg-surface-2 p-3.5 flex flex-col gap-2.5">
            <div className="flex justify-between text-xs border-b border-hairline pb-2">
              <span className="text-ink-muted">Target Role:</span>
              <span className="font-semibold text-ink">
                {previewData.roleName}
              </span>
            </div>
            <div className="flex justify-between text-xs border-b border-hairline pb-2">
              <span className="text-ink-muted">Invited Email:</span>
              <span className="font-semibold text-ink font-mono">
                {previewData.maskedEmail}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-muted">Expires:</span>
              <span className="text-ink-muted font-mono">
                {new Date(previewData.expiresAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {isExpired && (
            <div className="flex items-center gap-2 p-2.5 rounded border border-destructive/20 bg-destructive/5 text-destructive text-xs">
              <Warning className="h-4.5 w-4.5 shrink-0" />
              <span>
                This invitation has expired. Please contact the administrator.
              </span>
            </div>
          )}

          {isAccepted && (
            <div className="flex items-center gap-2 p-2.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 text-xs">
              <UserCheck className="h-4.5 w-4.5 shrink-0" />
              <span>This invitation has already been accepted.</span>
            </div>
          )}

          {isAuthenticated && currentUser?.email && (
            <div className="text-[11px] text-ink-muted text-center leading-normal">
              Accepting as <span className="font-semibold text-ink">{currentUser.email}</span>.{" "}
              <button
                type="button"
                onClick={() => {
                  logout();
                  toast.info("Logged out. Please log in or register with your invited email.");
                }}
                className="text-primary underline hover:text-primary-hover ml-1 cursor-pointer font-medium"
              >
                Switch account
              </button>
            </div>
          )}

          <button
            onClick={handleAccept}
            disabled={!canAccept || acceptMutation.isPending}
            className="w-full h-9 rounded-md bg-primary hover:bg-primary-hover text-xs font-semibold text-white transition disabled:opacity-50 disabled:pointer-events-none mt-2"
          >
            {acceptMutation.isPending ? (
              <Spinner className="h-4 w-4 animate-spin mx-auto text-white" />
            ) : isAuthenticated ? (
              "Accept and Join Workspace"
            ) : (
              "Sign In to Accept"
            )}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
