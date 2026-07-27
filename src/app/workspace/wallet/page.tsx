"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";

export default function WorkspaceWalletPage() {
  const router = useRouter();
  const workspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);

  useEffect(() => {
    router.replace(workspaceSlug ? `/${workspaceSlug}/billing` : "/");
  }, [router, workspaceSlug]);

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-6 text-ink">
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner className="h-4 w-4 animate-spin" />
        Opening Enterprise billing
      </div>
    </div>
  );
}
