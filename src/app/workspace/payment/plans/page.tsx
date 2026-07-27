"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";

export default function LegacyWorkspacePaymentPlansRedirectPage() {
  const router = useRouter();
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);

  useEffect(() => {
    router.replace(activeWorkspaceSlug ? `/${activeWorkspaceSlug}/billing` : "/workspace");
  }, [activeWorkspaceSlug, router]);

  return (
    <div className="flex h-full items-center justify-center bg-canvas text-ink-muted">
      <Spinner className="mr-2 h-4 w-4 animate-spin" />
      Redirecting to Enterprise billing
    </div>
  );
}
