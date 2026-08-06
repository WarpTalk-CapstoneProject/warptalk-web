"use client";

import { usePathname, useRouter } from "next/navigation";
import { LinearSidebar } from "@/components/layout/linear-sidebar";
import { Suspense, useEffect, useState } from "react";
import { ShieldWarning, Spinner } from "@phosphor-icons/react/dist/ssr";
import { useAuthStore } from "@/stores/auth-store";
import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isSystemAdmin = useIsSystemAdmin();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  // Same gate as /admin (src/app/(app)/admin/layout.tsx): the platform-wide "admin" system role,
  // not the workspace-scoped Owner/Admin roles. Returning before `children` keeps the admin-only
  // panels — and the requests they fire on mount — out of the tree entirely.
  if (!isSystemAdmin) {
    return (
      <div className="grid h-dvh w-screen place-items-center bg-canvas px-6 py-12">
        <div className="max-w-md rounded-2xl border border-hairline bg-surface-1 p-8 text-center shadow-linear">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldWarning size={24} weight="duotone" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">
            Access denied
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            This portal is restricted to WarpTalk platform administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-dvh flex overflow-hidden bg-canvas text-ink">
      <LinearSidebar />
      {/* Main Column */}
      <div className="relative flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Main content box */}
        <div className="relative flex flex-col flex-1 overflow-hidden mt-1.5 mr-1.5 mb-1.5 rounded-xl border border-border bg-surface-1 shadow-sm">
          {/* Top bar */}
          <header className="h-[44px] border-b border-border flex items-center justify-between px-4 shrink-0 bg-surface-1/50 backdrop-blur-md">
            <div className="flex items-center gap-1.5 text-[13px] text-ink-muted">
              <span className="font-medium text-ink">Admin Panel</span>
              <span className="text-ink-muted/50">/</span>
              <span className="text-ink-muted truncate">
                {pathname.includes("billing/plans") ? "Subscription Plans" : "Management"}
              </span>
            </div>
          </header>
          
          <main className="flex-1 overflow-y-auto bg-surface-1 relative">
            <Suspense fallback={
              <div className="flex h-full w-full items-center justify-center">
                <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
              </div>
            }>
              {children}
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
