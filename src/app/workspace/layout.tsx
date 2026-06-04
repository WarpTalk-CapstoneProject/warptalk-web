import type { ReactNode } from "react";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="glass-dashboard-scope relative h-screen overflow-hidden bg-white text-neutral-950">
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-100 saturate-0 brightness-[1.04] contrast-105"
        src="/assets/backgrounds/dashboard-light-motion.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-white/10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(255,255,255,0.42),transparent_24%),radial-gradient(circle_at_62%_0%,rgba(255,255,255,0.34),transparent_26%),radial-gradient(circle_at_6%_100%,rgba(255,255,255,0.28),transparent_30%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_60%,rgba(255,255,255,0.22)_100%)]" />

      <div className="relative z-10 flex h-full overflow-hidden p-2 lg:p-3">
        <div className="dashboard-glass-frame flex h-full w-full overflow-hidden rounded-[32px] p-3">
          <WorkspaceSidebar />
          <div className="relative z-[2] ml-3 flex min-w-0 flex-1 flex-col overflow-hidden text-neutral-950">
            <Topbar />
            <main className="min-h-0 flex-1 overflow-y-auto">
              <div className="h-full min-h-0 px-3 py-2">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
