"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useSessionBootstrap } from "@/hooks/use-session-bootstrap";
import { Spinner } from "@phosphor-icons/react";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mounted, setMounted] = useState(false);
  const isRestoringSession = useSessionBootstrap(mounted);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    if (mounted && !isRestoringSession && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isRestoringSession, isAuthenticated, router]);

  if (!mounted || isRestoringSession || !isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-screen overflow-y-auto bg-canvas text-ink">
      {children}
    </div>
  );
}
