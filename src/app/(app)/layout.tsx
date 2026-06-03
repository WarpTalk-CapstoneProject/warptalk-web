"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HostSidebar } from "@/components/layout/host-sidebar";
import { ParticipantSidebar } from "@/components/layout/participant-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuthStore } from "@/stores/auth-store";

export default function AppLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const isMeetingSurface = pathname.startsWith("/room/");

  if (isMeetingSurface) {
    return <main className="min-h-screen overflow-hidden bg-white">{children}</main>;
  }

  // Default to Host sidebar if role is not strictly participant-only
  const isParticipantOnly = user?.roles?.includes("participant") && !user?.roles?.includes("host");

  return (
    <div className="glass-dashboard-scope relative h-screen overflow-hidden bg-neutral-100 text-neutral-950">
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90 saturate-0"
        src="/assets/backgrounds/dashboard-light-motion.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-white/45 backdrop-blur-[3px]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.74),rgba(255,255,255,0.46)_44%,rgba(235,235,235,0.42)),radial-gradient(circle_at_16%_8%,rgba(255,255,255,0.58),transparent_22%),radial-gradient(circle_at_82%_14%,rgba(255,255,255,0.4),transparent_20%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_58%,rgba(255,255,255,0.32)_100%)]" />

      <div className="relative z-10 flex h-full overflow-hidden p-2 lg:p-3">
        <div className="flex h-full w-full overflow-hidden rounded-[28px] border border-white/70 bg-white/12 p-3 shadow-[0_28px_80px_rgba(0,0,0,0.09)] backdrop-blur-[18px] backdrop-saturate-150">
          {isParticipantOnly ? <ParticipantSidebar /> : <HostSidebar />}
          <div className="ml-3 flex min-w-0 flex-1 flex-col overflow-hidden text-neutral-950">
            <Topbar />
            <main className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-2 px-3 py-2">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
