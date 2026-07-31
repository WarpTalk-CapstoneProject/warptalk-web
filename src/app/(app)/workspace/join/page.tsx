"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Spinner } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import { useCreateJoinRequest } from "@/hooks/use-workspace";
import type { WorkspaceInvitationDto } from "@/types/workspace";

export default function JoinWorkspacePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [token, setToken] = useState("");
  const [joinRequest, setJoinRequest] = useState<WorkspaceInvitationDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const createJoinRequest = useCreateJoinRequest();

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const inputVal = token.trim();
    if (!inputVal) return;

    let workspaceSlug = inputVal;

    if (workspaceSlug.includes("://")) {
      try {
        const urlObj = new URL(workspaceSlug);
        const paths = urlObj.pathname.split("/").filter(Boolean);
        if (paths.length > 0) {
          if (paths[0] === "workspace" && paths[1]) {
            workspaceSlug = paths[1];
          } else {
            workspaceSlug = paths[0];
          }
        }
      } catch {
        // Fallback if URL parsing fails
      }
    } else {
      const slashParts = workspaceSlug.split("/").filter(Boolean);
      if (slashParts.length > 1) {
        if (slashParts[1] === "workspace" && slashParts[2]) {
          workspaceSlug = slashParts[2];
        } else if (slashParts[0].includes(".") && slashParts[1]) {
          workspaceSlug = slashParts[1];
        }
      }
    }

    workspaceSlug = workspaceSlug.split("?")[0].split("#")[0].trim();

    if (!workspaceSlug) return;

    setErrorMessage(null);
    try {
      const result = await createJoinRequest.mutateAsync(workspaceSlug);
      setJoinRequest(result);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      setErrorMessage(error.response?.data?.error || error.response?.data?.message || "Unable to create the join request.");
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-start bg-canvas px-4 pt-[12vh] pb-12 text-ink font-sans select-none antialiased">
      <div className="w-full max-w-[420px] flex flex-col gap-8">
        {/* Back and Identity Header */}
        <div className="flex items-center justify-between text-[12px] text-ink-muted font-medium">
          <button
            type="button"
            onClick={() => router.push("/workspace")}
            className="flex items-center gap-1.5 hover:text-ink transition-colors cursor-pointer"
          >
            <ArrowLeft size={13} />
            Back
          </button>
          <span className="truncate">{user?.email}</span>
        </div>

        {/* Title / Subtitle */}
        <div className="text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-foreground text-balance">
            Join a workspace
          </h1>
          <p className="mt-2 text-[14px] text-ink-muted text-pretty">
            Enter the workspace URL or invitation link
          </p>
        </div>

        {joinRequest ? (
          <JoinRequestSentCard
            token={token}
            onBack={() => router.push("/workspace")}
            onReset={() => setJoinRequest(null)}
          />
        ) : (
          <JoinRequestForm
            token={token}
            setToken={setToken}
            onSubmit={handleSubmit}
            isPending={createJoinRequest.isPending}
            errorMessage={errorMessage}
          />
        )}
      </div>
    </main>
  );
}

interface JoinRequestSentCardProps {
  token: string;
  onBack: () => void;
  onReset: () => void;
}

function JoinRequestSentCard({ token, onBack, onReset }: JoinRequestSentCardProps) {
  return (
    <div className="flex flex-col gap-5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-5 text-left">
      <div>
        <p className="text-[15px] font-semibold text-foreground">Join request sent</p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          Your request for <span className="font-medium text-ink">{token}</span> is waiting for a Workspace Owner/Admin to approve it.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={onBack} className="h-9 flex-1 rounded-md bg-primary text-xs text-white hover:bg-primary-hover">
          Back to workspace hub
        </Button>
        <Button type="button" variant="outline" onClick={onReset} className="h-9 flex-1 rounded-md text-xs">
          Request another workspace
        </Button>
      </div>
    </div>
  );
}

interface JoinRequestFormProps {
  token: string;
  setToken: (val: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
  errorMessage: string | null;
}

function JoinRequestForm({ token, setToken, onSubmit, isPending, errorMessage }: JoinRequestFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="workspace-url" className="text-[12px] font-medium text-ink-muted">
          Workspace URL
        </label>
        <Input
          id="workspace-url"
          placeholder="e.g. acme or warptalk.app/workspace/acme"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="bg-surface-1 border-border rounded-md h-10 px-3 text-[14px] focus-visible:ring-1 focus-visible:ring-primary outline-none"
        />
      </div>

      {errorMessage && (
        <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {errorMessage}
        </p>
      )}

      <Button
        type="submit"
        disabled={!token.trim() || isPending}
        className="w-full rounded-md h-10 bg-primary text-white hover:bg-primary-hover font-medium text-[14px] transition-colors mt-2"
      >
        {isPending ? "Sending request..." : "Send join request"}
      </Button>
    </form>
  );
}
