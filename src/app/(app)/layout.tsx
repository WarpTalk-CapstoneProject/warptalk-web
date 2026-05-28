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

  if (pathname === "/dashboard") {
    return <main className="min-h-screen overflow-hidden bg-black text-white">{children}</main>;
  }

  // Default to Host sidebar if role is not strictly participant-only
  const isParticipantOnly = user?.roles?.includes("participant") && !user?.roles?.includes("host");

  return (
    <div className="glass-dashboard-scope dark relative h-screen overflow-hidden bg-black text-white">
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-100 saturate-0"
        src="/assets/backgrounds/dashboard-glass-motion.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,3,6,0.08),rgba(3,4,8,0.18)_42%,rgba(0,0,0,0.32)),radial-gradient(circle_at_18%_9%,rgba(255,255,255,0.08),transparent_20%),radial-gradient(circle_at_82%_12%,rgba(255,255,255,0.05),transparent_18%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_58%,rgba(0,0,0,0.2)_100%)]" />

      <div className="relative z-10 flex h-full overflow-hidden p-2 lg:p-3">
      {isParticipantOnly ? <ParticipantSidebar /> : <HostSidebar />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.125] bg-[rgba(143,143,143,0)] backdrop-blur-0 backdrop-saturate-200 md:rounded-l-none md:border-l-0">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2.5 px-3.5 py-2.5">{children}</div>
        </main>
      </div>
      </div>
    </div>
  );
}
