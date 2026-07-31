"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Spinner } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { getWorkspaceEntryPath, parseWorkspaceSlugInput } from "@/lib/workspace-slug";

export default function JoinWorkspacePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const [token, setToken] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (activeWorkspaceId) {
      const activeSlug = useWorkspaceStore.getState().activeWorkspaceSlug;
      const entryPath = getWorkspaceEntryPath(activeSlug);
      router.replace(entryPath === "/workspace" ? entryPath : entryPath.replace(/\/home$/, "/rooms"));
    }
  }, [activeWorkspaceId, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const workspaceSlug = parseWorkspaceSlugInput(token);
    if (workspaceSlug) {
      setInputError(null);
      router.push(`/${encodeURIComponent(workspaceSlug)}/rooms`);
    } else {
      setInputError("Enter a valid workspace slug or URL.");
    }
  }

  if (!isAuthenticated || activeWorkspaceId) {
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* URL Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-url" className="text-[12px] font-medium text-ink-muted">
              Workspace URL
            </label>
            <Input
              id="workspace-url"
              placeholder="e.g. acme or warptalk.app/workspace/acme"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              aria-invalid={inputError ? "true" : undefined}
              className="bg-surface-1 border-border rounded-md h-10 px-3 text-[14px] focus-visible:ring-1 focus-visible:ring-primary outline-none"
            />
            {inputError && (
              <p className="text-[11px] text-destructive">{inputError}</p>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={!token.trim()}
            className="w-full rounded-md h-10 bg-primary text-white hover:bg-primary-hover font-medium text-[14px] transition-colors mt-2"
          >
            Join workspace
          </Button>
        </form>
      </div>
    </main>
  );
}
