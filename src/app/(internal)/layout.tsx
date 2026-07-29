"use client";

import { usePathname } from "next/navigation";
import { LinearSidebar } from "@/components/layout/linear-sidebar";
import { Suspense } from "react";
import { Spinner } from "@phosphor-icons/react/dist/ssr";

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
              <span className="font-medium text-ink truncate">
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
